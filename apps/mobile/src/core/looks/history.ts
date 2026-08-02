import type { LookItemGeom } from './geometry';
import { bringForward, bringToFront, sendBackward, sendToBack } from './zorder';

/**
 * 命令式撤销/重做栈（MVP-008）。
 *
 * 快照式历史：每次 applyOp 把「应用前的 items 快照」压入 past，
 * redo 分支（future）随即清空；undo/redo 在 past/future 间搬运快照。
 * 快照语义保证任意 op 序列撤销/重做都能逐字节还原（验收：20 连撤 20 连做）。
 * past 超过 HISTORY_CAP 丢弃最旧快照。全部纯函数，不修改输入。
 */

export const HISTORY_CAP = 50;

export type HistoryOp =
  | { type: 'addItem'; item: LookItemGeom }
  | { type: 'removeItem'; itemId: string }
  | { type: 'updateGeometry'; itemId: string; patch: Partial<Pick<LookItemGeom, 'x' | 'y' | 'scale' | 'rotation'>> }
  | { type: 'reorder'; itemId: string; direction: 'forward' | 'backward' | 'front' | 'back' };

export interface History {
  /** 应用各 op 之前的 items 快照，最新在末尾。 */
  readonly past: readonly (readonly LookItemGeom[])[];
  /** 被撤销的快照（redo 分支），最近撤销的在末尾。 */
  readonly future: readonly (readonly LookItemGeom[])[];
}

export function emptyHistory(): History {
  return { past: [], future: [] };
}

export function canUndo(h: History): boolean {
  return h.past.length > 0;
}

export function canRedo(h: History): boolean {
  return h.future.length > 0;
}

/** 把单个 op 应用到 items 快照（纯函数）。 */
export function applyOpToItems(items: readonly LookItemGeom[], op: HistoryOp): LookItemGeom[] {
  switch (op.type) {
    case 'addItem':
      return [...items, { ...op.item }];
    case 'removeItem':
      return items.filter((it) => it.id !== op.itemId).map((it) => ({ ...it }));
    case 'updateGeometry':
      return items.map((it) => (it.id === op.itemId ? { ...it, ...op.patch } : { ...it }));
    case 'reorder':
      if (op.direction === 'forward') return bringForward(items, op.itemId);
      if (op.direction === 'backward') return sendBackward(items, op.itemId);
      if (op.direction === 'front') return bringToFront(items, op.itemId);
      return sendToBack(items, op.itemId);
  }
}

/** 应用 op：返回新 items 与新历史（past 压栈、future 清空、cap 50）。 */
export function applyOp(
  h: History,
  items: readonly LookItemGeom[],
  op: HistoryOp,
): { history: History; items: LookItemGeom[] } {
  const snapshot = items.map((it) => ({ ...it }));
  const past = [...h.past, snapshot].slice(-HISTORY_CAP);
  return { history: { past, future: [] }, items: applyOpToItems(items, op) };
}

/** 撤销一步；无历史时原样返回。 */
export function undo(
  h: History,
  items: readonly LookItemGeom[],
): { history: History; items: LookItemGeom[] } {
  if (!canUndo(h)) return { history: h, items: items.map((it) => ({ ...it })) };
  const past = h.past.slice(0, -1);
  const snapshot = h.past[h.past.length - 1];
  const future = [...h.future, items.map((it) => ({ ...it }))];
  return { history: { past, future }, items: snapshot.map((it) => ({ ...it })) };
}

/** 重做一步；redo 分支为空时原样返回。 */
export function redo(
  h: History,
  items: readonly LookItemGeom[],
): { history: History; items: LookItemGeom[] } {
  if (!canRedo(h)) return { history: h, items: items.map((it) => ({ ...it })) };
  const future = h.future.slice(0, -1);
  const snapshot = h.future[h.future.length - 1];
  const past = [...h.past, items.map((it) => ({ ...it }))].slice(-HISTORY_CAP);
  return { history: { past, future }, items: snapshot.map((it) => ({ ...it })) };
}
