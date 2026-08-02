/**
 * @jest-environment node
 *
 * 撤销/重做栈（MVP-008）：快照式历史 + 命令 op（addItem/removeItem/
 * updateGeometry/reorder）。push 后 redo 清空；cap 50；
 * 连续 20 次 undo 再 20 次 redo 必须完全还原。
 */
import { describe, expect, it } from '@jest/globals';

import type { LookItemGeom } from './geometry';
import {
  applyOp,
  canRedo,
  canUndo,
  emptyHistory,
  HISTORY_CAP,
  redo,
  undo,
  type HistoryOp,
} from './history';

function item(id: string, zIndex = 0): LookItemGeom {
  return { id, garmentId: `g-${id}`, slot: null, x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex, ord: 0 };
}

describe('history：op 应用与撤销/重做', () => {
  it('addItem / removeItem / updateGeometry / reorder 改变 items 并记录历史', () => {
    let h = emptyHistory();
    let items: LookItemGeom[] = [];

    ({ history: h, items } = applyOp(h, items, { type: 'addItem', item: item('a') }));
    ({ history: h, items } = applyOp(h, items, { type: 'addItem', item: item('b', 1) }));
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);

    ({ history: h, items } = applyOp(h, items, {
      type: 'updateGeometry', itemId: 'a', patch: { x: 0.1, rotation: 0.5 },
    }));
    expect(items[0]).toMatchObject({ id: 'a', x: 0.1, rotation: 0.5, y: 0.5 });

    ({ history: h, items } = applyOp(h, items, { type: 'reorder', itemId: 'a', direction: 'front' }));
    expect(items.map((i) => i.id)).toEqual(['b', 'a']);
    expect(items.map((i) => i.zIndex)).toEqual([0, 1]);

    ({ history: h, items } = applyOp(h, items, { type: 'removeItem', itemId: 'b' }));
    expect(items.map((i) => i.id)).toEqual(['a']);
  });

  it('undo/redo 逐步还原；无历史时为空操作', () => {
    let h = emptyHistory();
    let items: LookItemGeom[] = [];
    expect(canUndo(h)).toBe(false);
    expect(undo(h, items).items).toEqual([]);

    ({ history: h, items } = applyOp(h, items, { type: 'addItem', item: item('a') }));
    ({ history: h, items } = applyOp(h, items, { type: 'addItem', item: item('b', 1) }));
    expect(canUndo(h)).toBe(true);

    ({ history: h, items } = undo(h, items));
    expect(items.map((i) => i.id)).toEqual(['a']);
    expect(canRedo(h)).toBe(true);
    ({ history: h, items } = undo(h, items));
    expect(items).toEqual([]);
    ({ history: h, items } = redo(h, items));
    ({ history: h, items } = redo(h, items));
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    expect(canRedo(h)).toBe(false);
    // 空 redo 不崩
    expect(redo(h, items).items.map((i) => i.id)).toEqual(['a', 'b']);
  });

  it('undo 后 push 新 op：redo 分支清空', () => {
    let h = emptyHistory();
    let items: LookItemGeom[] = [];
    ({ history: h, items } = applyOp(h, items, { type: 'addItem', item: item('a') }));
    ({ history: h, items } = applyOp(h, items, { type: 'addItem', item: item('b', 1) }));
    ({ history: h, items } = undo(h, items));
    ({ history: h, items } = applyOp(h, items, { type: 'addItem', item: item('c', 1) }));
    expect(canRedo(h)).toBe(false);
    expect(redo(h, items).items.map((i) => i.id)).toEqual(['a', 'c']);
  });

  it('连续 20 次 undo 再 20 次 redo 完全还原', () => {
    let h = emptyHistory();
    let items: LookItemGeom[] = [];
    const initial = items;

    const ops: HistoryOp[] = [];
    for (let i = 0; i < 10; i += 1) ops.push({ type: 'addItem', item: item(`g${i}`, i) });
    for (let i = 0; i < 5; i += 1) ops.push({ type: 'updateGeometry', itemId: `g${i}`, patch: { x: i / 10, y: 0.9 - i / 10, scale: 1 + i * 0.1, rotation: i * 0.2 } });
    ops.push({ type: 'reorder', itemId: 'g0', direction: 'front' });
    ops.push({ type: 'reorder', itemId: 'g9', direction: 'back' });
    ops.push({ type: 'reorder', itemId: 'g3', direction: 'forward' });
    ops.push({ type: 'removeItem', itemId: 'g7' });
    ops.push({ type: 'updateGeometry', itemId: 'g1', patch: { rotation: -0.4 } });
    expect(ops).toHaveLength(20);

    for (const op of ops) ({ history: h, items } = applyOp(h, items, op));
    const finalItems = items;

    for (let i = 0; i < 20; i += 1) ({ history: h, items } = undo(h, items));
    expect(items).toEqual(initial);

    for (let i = 0; i < 20; i += 1) ({ history: h, items } = redo(h, items));
    expect(items).toEqual(finalItems);
  });

  it(`cap ${HISTORY_CAP}：超出丢弃最旧快照，undo 到底止于最早保留状态`, () => {
    let h = emptyHistory();
    let items: LookItemGeom[] = [];
    for (let i = 0; i < HISTORY_CAP + 10; i += 1) {
      ({ history: h, items } = applyOp(h, items, { type: 'addItem', item: item(`x${i}`, i) }));
    }
    expect(h.past).toHaveLength(HISTORY_CAP);
    let steps = 0;
    while (canUndo(h)) {
      ({ history: h, items } = undo(h, items));
      steps += 1;
    }
    expect(steps).toBe(HISTORY_CAP);
    expect(items).toHaveLength(10); // 最旧 10 步快照已丢弃，剩余 10 件
  });

  it('不可变：applyOp/undo/redo 不修改传入的 items 与 history', () => {
    const h0 = emptyHistory();
    const items0 = [item('a')];
    const r = applyOp(h0, items0, { type: 'addItem', item: item('b', 1) });
    expect(items0).toHaveLength(1);
    expect(h0.past).toHaveLength(0);
    expect(r.items).not.toBe(items0);
    expect(r.history).not.toBe(h0);
  });
});
