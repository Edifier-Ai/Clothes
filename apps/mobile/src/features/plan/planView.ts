import type { PlanRow } from '@/core/db/schema';
import { planOutfitIds } from '@/core/db/dao';
import { addDays } from '@/core/plan/calendar';

/**
 * 计划页视图逻辑（MVP-009）：月历缩略图解析、按日分组、月统计。纯函数。
 */

/**
 * 月历/日期详情的计划缩略图：
 * 1) 关联造型 → 造型封面（cover_rel_path）优先；
 * 2) 回退快照中首个有图的单品缩略图；
 * 3) 都无 → null（调用方渲染固定尺寸占位，缺图不破坏日期布局）。
 * 快照损坏按 null 处理，不抛错。
 */
export function planThumbRelPath(
  plan: Pick<PlanRow, 'lookId' | 'outfitJson'>,
  lookCover: (lookId: string) => string | null,
  garmentThumb: (garmentId: string) => string | null,
): string | null {
  if (plan.lookId) {
    const cover = lookCover(plan.lookId);
    if (cover) return cover;
  }
  let ids: string[];
  try {
    ids = planOutfitIds({ outfitJson: plan.outfitJson } as PlanRow);
  } catch {
    return null;
  }
  for (const gid of ids) {
    const t = garmentThumb(gid);
    if (t) return t;
  }
  return null;
}

/** 月历按日分组：同日多时段（工作/晚餐）归入同一键。 */
export function plansByDate(plans: readonly PlanRow[]): Map<string, PlanRow[]> {
  const map = new Map<string, PlanRow[]>();
  for (const p of plans) {
    const list = map.get(p.date);
    if (list) list.push(p);
    else map.set(p.date, [p]);
  }
  return map;
}

export interface MonthStats {
  /** 本月有实际穿着记录（completed/changed）的去重天数。 */
  recordedDays: number;
  /** 连续记录天数：今天有记录则含今天，否则从昨天往前连续计。 */
  streak: number;
}

/**
 * 月统计。yearMonth 形如 '2026-07'；today 为当地日期字面量（注入便于测试）。
 * planned 不计入；同日多计划只算一天。
 */
export function monthStats(plans: readonly PlanRow[], yearMonth: string, today: string): MonthStats {
  const recorded = new Set(
    plans
      .filter((p) => p.date.startsWith(yearMonth) && (p.status === 'completed' || p.status === 'changed'))
      .map((p) => p.date),
  );
  let streak = 0;
  let cursor = today;
  // 今天没记录则从昨天起算（断在今天之前不惩罚连续记录）
  if (!recorded.has(cursor)) cursor = addDays(cursor, -1);
  while (recorded.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return { recordedDays: recorded.size, streak };
}
