import { and, desc, eq, isNull } from 'drizzle-orm';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import * as schema from '../db/schema';
import {
  cutoutJobs,
  garmentAssets,
  garmentTags,
  garments,
  shoppingCandidates,
  wearLogItems,
  wearLogs,
  type CutoutJobRow,
  type GarmentAssetRow,
  type GarmentCategory,
  type GarmentRow,
  type GarmentStatus,
  type GarmentTagRow,
  type ShoppingCandidateRow,
  type WearLogItemRow,
  type WearLogRow,
} from '../db/schema';
import type { ShoppingRepository, ShoppingWardrobeItem } from './types';

/** Drizzle 设备仓储；shopping_candidates 无任何衣橱外键。 */
export function createDrizzleShoppingRepository(
  db: ExpoSQLiteDatabase<typeof schema>,
): ShoppingRepository {
  return {
    async insertCandidate(row) {
      await db.insert(shoppingCandidates).values(row).run();
    },

    async updateCandidate(id, fields) {
      await db.update(shoppingCandidates).set(fields).where(eq(shoppingCandidates.id, id)).run();
    },

    async getCandidate(id) {
      return (
        (await db.select().from(shoppingCandidates).where(eq(shoppingCandidates.id, id)).get()) as
          | ShoppingCandidateRow
          | undefined
      ) ?? null;
    },

    async listActiveCandidates() {
      return (await db
        .select()
        .from(shoppingCandidates)
        .where(isNull(shoppingCandidates.deletedAt))
        .orderBy(desc(shoppingCandidates.updatedAt), desc(shoppingCandidates.id))
        .all()) as ShoppingCandidateRow[];
    },

    async listWardrobeItems(): Promise<ShoppingWardrobeItem[]> {
      const [garmentRows, assetRows, tagRows, jobRows, wearRows, wearItemRows] = await Promise.all([
        db.select().from(garments).where(and(isNull(garments.deletedAt), isNull(garments.archivedAt))).all(),
        db.select().from(garmentAssets).all(),
        db.select().from(garmentTags).all(),
        db.select().from(cutoutJobs).where(eq(cutoutJobs.status, 'succeeded')).orderBy(desc(cutoutJobs.updatedAt)).all(),
        db.select().from(wearLogs).all(),
        db.select().from(wearLogItems).all(),
      ]);
      const assetsByGarment = new Map<string, GarmentAssetRow>();
      for (const asset of assetRows as GarmentAssetRow[]) {
        if (!assetsByGarment.has(asset.garmentId)) assetsByGarment.set(asset.garmentId, asset);
      }
      const jobsByGarment = new Map<string, CutoutJobRow>();
      // 查询已按 updated_at DESC；同一衣物第一条即最新成功结果。
      for (const job of jobRows as CutoutJobRow[]) {
        if (!jobsByGarment.has(job.garmentId)) jobsByGarment.set(job.garmentId, job);
      }
      const colorsByGarment = new Map<string, string>();
      for (const tag of tagRows as GarmentTagRow[]) {
        if (tag.kind === 'color' && !colorsByGarment.has(tag.garmentId)) {
          colorsByGarment.set(tag.garmentId, tag.value);
        }
      }
      const wearTimeByLog = new Map((wearRows as WearLogRow[]).map((row) => [row.id, row.createdAt] as const));
      const wearStats = new Map<string, { count: number; last: number | null }>();
      for (const item of wearItemRows as WearLogItemRow[]) {
        const timestamp = wearTimeByLog.get(item.wearLogId) ?? null;
        const current = wearStats.get(item.garmentId) ?? { count: 0, last: null };
        current.count += 1;
        if (timestamp != null && (current.last == null || timestamp > current.last)) current.last = timestamp;
        wearStats.set(item.garmentId, current);
      }
      return (garmentRows as GarmentRow[]).map((garment) => {
        const job = jobsByGarment.get(garment.id);
        const asset = assetsByGarment.get(garment.id);
        const stats = wearStats.get(garment.id);
        return {
          id: garment.id,
          name: garment.name,
          category: garment.category as GarmentCategory,
          status: garment.status as GarmentStatus,
          archivedAt: garment.archivedAt,
          createdAt: garment.createdAt,
          updatedAt: garment.updatedAt,
          lastWornAt: stats?.last ?? null,
          timesWorn: stats?.count ?? 0,
          color: colorsByGarment.get(garment.id) ?? null,
          imageRelPath:
            job?.previewRelPath ?? job?.thumbnailRelPath ?? job?.originalRelPath ?? asset?.originalRelPath ?? null,
        };
      });
    },
  };
}
