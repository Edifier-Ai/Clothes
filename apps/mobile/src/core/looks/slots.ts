import type { LookSlot } from '../db/schema';

/**
 * 快速槽位合法性（MVP-008，规则与 recommend/index.ts 对齐）。
 *
 * - 合法组合：top+bottom+shoes，或 dress+shoes（dress 顶替 top+bottom）。
 * - dress 与 top/bottom 互斥；同槽唯一（同槽两件即冲突）。
 * - outerwear/accessory 可选，不影响合法性。
 * - slot 为 null 的项（canvas 模式）不参与判定——画布模式不自动判定可穿。
 * 返回真实缺失与冲突，不伪造 ok。
 */

export interface SlotItem {
  id: string;
  garmentId: string;
  slot: LookSlot | null;
}

export interface SlotValidation {
  ok: boolean;
  /** 缺失的必填槽位，按 top → bottom → shoes 顺序。 */
  missing: LookSlot[];
  /** 冲突码：dress-excludes-top | dress-excludes-bottom | duplicate-slot-<slot>。 */
  conflicts: string[];
}

export function validateSlotAssignment(items: readonly SlotItem[]): SlotValidation {
  const slots = items.map((i) => i.slot).filter((s): s is LookSlot => s != null);

  const conflicts: string[] = [];
  const seen = new Set<LookSlot>();
  for (const s of slots) {
    if (seen.has(s)) conflicts.push(`duplicate-slot-${s}`);
    seen.add(s);
  }

  const hasDress = seen.has('dress');
  if (hasDress && seen.has('top')) conflicts.push('dress-excludes-top');
  if (hasDress && seen.has('bottom')) conflicts.push('dress-excludes-bottom');

  const missing: LookSlot[] = [];
  if (!hasDress) {
    if (!seen.has('top')) missing.push('top');
    if (!seen.has('bottom')) missing.push('bottom');
  }
  if (!seen.has('shoes')) missing.push('shoes');

  return { ok: missing.length === 0 && conflicts.length === 0, missing, conflicts };
}
