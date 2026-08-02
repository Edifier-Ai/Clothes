import type { LookItemGeom } from './geometry';

/**
 * z 层级操作（MVP-008）。
 *
 * 输入任意 items（内部先按 (zIndex, ord) 升序排序），输出重排后的新数组，
 * zIndex 归一化为连续的 0..n-1（数组下标即层级，升序为绘制顺序）。
 * 目标不存在或已在边界 → 确定性空操作（仍归一化）。不修改输入。
 */

function sorted(items: readonly LookItemGeom[]): LookItemGeom[] {
  return [...items].sort((a, b) => a.zIndex - b.zIndex || a.ord - b.ord);
}

function reindex(arr: LookItemGeom[]): LookItemGeom[] {
  return arr.map((it, i) => ({ ...it, zIndex: i }));
}

/** 上移一层：与上一个（更靠近顶层）邻居交换。 */
export function bringForward(items: readonly LookItemGeom[], id: string): LookItemGeom[] {
  const arr = sorted(items);
  const i = arr.findIndex((it) => it.id === id);
  if (i < 0 || i === arr.length - 1) return reindex(arr);
  [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
  return reindex(arr);
}

/** 下移一层：与下一个（更靠近底层）邻居交换。 */
export function sendBackward(items: readonly LookItemGeom[], id: string): LookItemGeom[] {
  const arr = sorted(items);
  const i = arr.findIndex((it) => it.id === id);
  if (i <= 0) return reindex(arr);
  [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
  return reindex(arr);
}

/** 置顶。 */
export function bringToFront(items: readonly LookItemGeom[], id: string): LookItemGeom[] {
  const arr = sorted(items);
  const i = arr.findIndex((it) => it.id === id);
  if (i < 0 || i === arr.length - 1) return reindex(arr);
  const [target] = arr.splice(i, 1);
  arr.push(target);
  return reindex(arr);
}

/** 置底。 */
export function sendToBack(items: readonly LookItemGeom[], id: string): LookItemGeom[] {
  const arr = sorted(items);
  const i = arr.findIndex((it) => it.id === id);
  if (i <= 0) return reindex(arr);
  const [target] = arr.splice(i, 1);
  arr.unshift(target);
  return reindex(arr);
}
