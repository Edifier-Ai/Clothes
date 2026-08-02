import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import type { GarmentDb } from '../db/dao';
import * as schema from '../db/schema';
import { getWearStats } from '../recommend/wearLog';
import type { WardrobeItem } from './search';

/**
 * 衣橱查询装配层：从 SQLite 聚合 WardrobeItem（衣物 + 标签 + 穿着统计），
 * 供 search.ts 的纯函数筛选/排序。含归档衣物（归档区浏览由 filter.status='archived' 选择），
 * 不含已删除。
 */

type AnyDb = ExpoSQLiteDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

export async function buildWardrobeItems(db: GarmentDb, statsDb: AnyDb): Promise<WardrobeItem[]> {
  const [garments, tags, stats] = await Promise.all([
    db.listAllGarments(),
    db.getAllTags(),
    getWearStats(statsDb),
  ]);
  const tagsByGarment = new Map<string, typeof tags>();
  for (const t of tags) {
    const arr = tagsByGarment.get(t.garmentId) ?? [];
    arr.push(t);
    tagsByGarment.set(t.garmentId, arr);
  }
  return garments
    .filter((g) => g.deletedAt == null)
    .map((garment) => ({
      garment,
      tags: tagsByGarment.get(garment.id) ?? [],
      lastWornAt: stats.get(garment.id)?.lastWornAt ?? null,
      timesWorn: stats.get(garment.id)?.timesWorn ?? 0,
    }));
}
