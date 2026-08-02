/**
 * @jest-environment node
 *
 * z 层级操作（MVP-008）：输入按 z_index 升序的 items，输出重排后
 * z_index 连续（0..n-1）的新数组；确定性、不修改输入。
 */
import { describe, expect, it } from '@jest/globals';

import type { LookItemGeom } from './geometry';
import { bringForward, bringToFront, sendBackward, sendToBack } from './zorder';

function stack(): LookItemGeom[] {
  return ['a', 'b', 'c', 'd'].map((id, i) => ({
    id,
    garmentId: `g-${id}`,
    slot: null,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0,
    zIndex: i,
    ord: 0,
  }));
}

const order = (items: readonly LookItemGeom[]) => items.map((i) => i.id);
const zis = (items: readonly LookItemGeom[]) => items.map((i) => i.zIndex);

describe('zorder 四操作', () => {
  it('bringForward：与上一层交换', () => {
    const out = bringForward(stack(), 'b');
    expect(order(out)).toEqual(['a', 'c', 'b', 'd']);
    expect(zis(out)).toEqual([0, 1, 2, 3]);
  });

  it('sendBackward：与下一层交换', () => {
    const out = sendBackward(stack(), 'c');
    expect(order(out)).toEqual(['a', 'c', 'b', 'd']);
    expect(zis(out)).toEqual([0, 1, 2, 3]);
  });

  it('bringToFront：移到最顶', () => {
    const out = bringToFront(stack(), 'a');
    expect(order(out)).toEqual(['b', 'c', 'd', 'a']);
    expect(zis(out)).toEqual([0, 1, 2, 3]);
  });

  it('sendToBack：移到最底', () => {
    const out = sendToBack(stack(), 'd');
    expect(order(out)).toEqual(['d', 'a', 'b', 'c']);
    expect(zis(out)).toEqual([0, 1, 2, 3]);
  });

  it('边界与未知 id 为确定性空操作（仍归一化 z_index）', () => {
    expect(order(bringForward(stack(), 'd'))).toEqual(['a', 'b', 'c', 'd']);
    expect(order(sendBackward(stack(), 'a'))).toEqual(['a', 'b', 'c', 'd']);
    expect(order(bringToFront(stack(), 'zzz'))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('非连续输入先按 z_index 排序再重排，输出连续；输入不被修改', () => {
    const messy: LookItemGeom[] = [
      { ...stack()[2], zIndex: 30 },
      { ...stack()[0], zIndex: 5 },
      { ...stack()[1], zIndex: 10 },
    ];
    const out = bringForward(messy, 'b');
    expect(order(out)).toEqual(['a', 'c', 'b']);
    expect(zis(out)).toEqual([0, 1, 2]);
    expect(messy.map((i) => i.zIndex)).toEqual([30, 5, 10]); // 未改输入
  });

  it('确定性：同输入两次调用结果一致', () => {
    expect(bringToFront(stack(), 'b')).toEqual(bringToFront(stack(), 'b'));
  });
});
