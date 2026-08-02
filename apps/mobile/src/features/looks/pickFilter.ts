import type { GarmentCategory, GarmentStatus, LookSlot } from '@/core/db/schema';
import { HARD_CONSTRAINT_STATUSES } from '@/core/recommend';

/**
 * 选衣面板过滤（MVP-008 LOK-04）。纯函数，不碰 DB：
 * - 搜索命中名称/品牌/备注，大小写不敏感；
 * - 分类 chips 单选；
 * - 「只看可用」与推荐引擎 isAvailable 同语义（待洗/干洗/借出/归档排除）；
 * - 快速模式按槽位限定类别（top→top …），画布模式（slot=null）全类别。
 */

export interface PickCandidate {
  id: string;
  name: string;
  category: GarmentCategory;
  status: GarmentStatus;
  archivedAt: number | null;
  brand: string | null;
  note: string | null;
  /** 画布/槽位卡/合成渲染图：预览通道（透明底、真实宽高比，与封面同源）。 */
  imageRelPath: string | null;
  /** 面板列表小图标：缩略图通道（缺省回退 imageRelPath）。 */
  thumbnailRelPath?: string | null;
}

export interface PickFilter {
  text?: string;
  category?: GarmentCategory | null;
  /** true 时排除不可用（待洗/干洗/借出/归档）。 */
  onlyAvailable?: boolean;
  /** 快速模式槽位；null/缺省 = 画布模式，不限类别。 */
  slot?: LookSlot | null;
}

/** 与 recommend/index.ts 的 isAvailable 同语义。 */
export function isPickAvailable(c: Pick<PickCandidate, 'status' | 'archivedAt'>): boolean {
  if (c.archivedAt != null) return false;
  return !(HARD_CONSTRAINT_STATUSES as readonly string[]).includes(c.status);
}

/** 槽位 → 可选类别；画布模式（null/undefined）返回 null 表示不限。 */
export function slotCategories(slot: LookSlot | null | undefined): readonly GarmentCategory[] | null {
  if (slot == null) return null;
  return [slot];
}

export function filterPickCandidates(
  candidates: readonly PickCandidate[],
  filter: PickFilter,
): PickCandidate[] {
  const q = (filter.text ?? '').trim().toLowerCase();
  const cats = slotCategories(filter.slot);
  return candidates.filter((c) => {
    if (cats && !cats.includes(c.category)) return false;
    if (filter.category && c.category !== filter.category) return false;
    if (filter.onlyAvailable && !isPickAvailable(c)) return false;
    if (q) {
      const hit =
        c.name.toLowerCase().includes(q) ||
        (c.brand ?? '').toLowerCase().includes(q) ||
        (c.note ?? '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    return true;
  });
}
