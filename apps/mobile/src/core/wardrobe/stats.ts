import { desc, eq, inArray } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import * as schema from '../db/schema';
import {
  garments,
  recommendationItems,
  recommendations,
  wearLogItems,
  wearLogs,
  type GarmentRow,
  type RecommendationRow,
} from '../db/schema';

/**
 * 单品详情统计（MVP-007 CLS-03）：全部来自真实穿着/推荐数据，无占位数字。
 *
 * 成本/次口径：价格 ÷ 穿着次数，向下取整到分；仅价格 > 0 且穿过 ≥ 1 次时计算，
 * 否则为 null，由 UI 说明口径（未填价格 / 还未穿过），不显示假数字。
 */

type AnyDb = ExpoSQLiteDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

export interface OutfitRef {
  recommendationId: string;
  date: string;
  createdAt: number;
  slots: { garmentId: string; slot: string; name: string }[];
}

export interface GarmentStats {
  timesWorn: number;
  lastWornAt: number | null;
  costPerWearMinor: number | null;
  outfits: OutfitRef[];
}

export function computeCostPerWear(priceMinor: number | null, timesWorn: number): number | null {
  if (priceMinor == null || priceMinor <= 0 || timesWorn <= 0) return null;
  return Math.floor(priceMinor / timesWorn);
}

export async function getGarmentStats(db: AnyDb, garment: GarmentRow): Promise<GarmentStats> {
  // 穿着聚合：wear_log_items JOIN wear_logs
  const wornItems = (await db
    .select()
    .from(wearLogItems)
    .where(eq(wearLogItems.garmentId, garment.id))
    .all()) as (typeof wearLogItems.$inferSelect)[];
  const logIds = [...new Set(wornItems.map((i) => i.wearLogId))];
  let lastWornAt: number | null = null;
  if (logIds.length > 0) {
    const logs = (await db
      .select()
      .from(wearLogs)
      .where(inArray(wearLogs.id, logIds))
      .all()) as (typeof wearLogs.$inferSelect)[];
    for (const l of logs) {
      if (lastWornAt == null || l.createdAt > lastWornAt) lastWornAt = l.createdAt;
    }
  }

  // 使用造型：含该衣物的推荐快照（时间倒序），每个快照带完整槽位
  const myRecItems = (await db
    .select()
    .from(recommendationItems)
    .where(eq(recommendationItems.garmentId, garment.id))
    .all()) as (typeof recommendationItems.$inferSelect)[];
  const recIds = [...new Set(myRecItems.map((i) => i.recommendationId))];
  const outfits: OutfitRef[] = [];
  if (recIds.length > 0) {
    const recs = (await db
      .select()
      .from(recommendations)
      .where(inArray(recommendations.id, recIds))
      .orderBy(desc(recommendations.createdAt))
      .all()) as RecommendationRow[];
    const allItems = (await db
      .select()
      .from(recommendationItems)
      .where(inArray(recommendationItems.recommendationId, recIds))
      .all()) as (typeof recommendationItems.$inferSelect)[];
    // 槽位衣物名：软删除的衣物保留行，名称始终可取；取不到时回退 id
    const slotGarmentIds = [...new Set(allItems.map((i) => i.garmentId))];
    const slotGarments = (await db
      .select()
      .from(garments)
      .where(inArray(garments.id, slotGarmentIds))
      .all()) as GarmentRow[];
    const nameById = new Map(slotGarments.map((g) => [g.id, g.name]));
    for (const rec of recs) {
      const slots = allItems
        .filter((i) => i.recommendationId === rec.id)
        .sort((a, b) => a.ord - b.ord)
        .map((i) => ({ garmentId: i.garmentId, slot: i.slot, name: nameById.get(i.garmentId) ?? i.garmentId }));
      outfits.push({ recommendationId: rec.id, date: rec.date, createdAt: rec.createdAt, slots });
    }
  }

  const timesWorn = wornItems.length;
  return {
    timesWorn,
    lastWornAt,
    costPerWearMinor: computeCostPerWear(garment.priceMinor, timesWorn),
    outfits,
  };
}
