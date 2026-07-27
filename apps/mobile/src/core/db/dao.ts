import { and, desc, eq, isNull } from 'drizzle-orm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';

import type { GarmentCategory, GarmentStatus, TagKind } from './schema';
import { garmentAssets, garmentTags, garments } from './schema';

/**
 * 衣物 DAO：纯数据访问，事务边界明确。
 *
 * 后端无关——设备传入 drizzle(expo-sqlite)，测试传入 drizzle(sql.js/better-sqlite3)，
 * 查询构建器调用完全一致。schema 泛型让带 schema 与不带 schema 的 drizzle 实例都可传入。
 */
export type AnySqliteDb = BaseSQLiteDatabase<'sync', any, any>;

export interface TagInput {
  kind: TagKind;
  value: string;
  confidence?: number;
}

export interface CreateGarmentInput {
  id: string;
  name: string;
  category: GarmentCategory;
  status?: GarmentStatus;
  priceMinor?: number | null;
  currency?: string | null;
  purchaseDate?: string | null;
  asset: {
    id: string;
    originalRelPath: string;
    sha256: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
  };
  tags?: readonly TagInput[];
  now: number;
}

export interface GarmentDetail {
  garment: typeof garments.$inferSelect;
  asset: typeof garmentAssets.$inferSelect;
  tags: (typeof garmentTags.$inferSelect)[];
}

const ACTIVE = isNull(garments.deletedAt);

export function createGarment(db: AnySqliteDb, input: CreateGarmentInput): void {
  const { asset, tags, now, ...rest } = input;
  db.transaction((tx) => {
    tx.insert(garments)
      .values({
        ...rest,
        status: rest.status ?? 'clean',
        createdAt: now,
        updatedAt: now,
      })
      .run();
    tx.insert(garmentAssets)
      .values({ ...asset, garmentId: input.id, createdAt: now })
      .run();
    if (tags && tags.length > 0) {
      tx.insert(garmentTags)
        .values(
          tags.map((t, i) => ({
            id: `${input.id}-tag-${i}`,
            garmentId: input.id,
            kind: t.kind,
            value: t.value,
            confidence: t.confidence ?? 1,
          })),
        )
        .run();
    }
  });
}

export function getGarment(db: AnySqliteDb, id: string): GarmentDetail | null {
  const garment = db
    .select()
    .from(garments)
    .where(and(eq(garments.id, id), ACTIVE))
    .get();
  if (!garment) return null;
  const asset = db
    .select()
    .from(garmentAssets)
    .where(eq(garmentAssets.garmentId, id))
    .get();
  if (!asset) return null;
  const tags = db
    .select()
    .from(garmentTags)
    .where(eq(garmentTags.garmentId, id))
    .all();
  return { garment, asset, tags };
}

export function listActiveGarments(db: AnySqliteDb): (typeof garments.$inferSelect)[] {
  return db
    .select()
    .from(garments)
    .where(and(ACTIVE, isNull(garments.archivedAt)))
    .orderBy(desc(garments.createdAt))
    .all();
}

/** 在未删除集合中按哈希查找，用于重复导入提示。 */
export function findActiveByHash(
  db: AnySqliteDb,
  sha256: string,
): GarmentDetail | null {
  const asset = db
    .select()
    .from(garmentAssets)
    .where(eq(garmentAssets.sha256, sha256))
    .all()
    .find((a) => {
      const g = db.select().from(garments).where(eq(garments.id, a.garmentId)).get();
      return !!g && g.deletedAt == null;
    });
  if (!asset) return null;
  return getGarment(db, asset.garmentId);
}

export interface UpdateGarmentInput {
  name?: string;
  category?: GarmentCategory;
  status?: GarmentStatus;
  priceMinor?: number | null;
  currency?: string | null;
  purchaseDate?: string | null;
  tags?: readonly TagInput[];
}

export function updateGarment(
  db: AnySqliteDb,
  id: string,
  patch: UpdateGarmentInput,
  now: number,
): boolean {
  let touched = false;
  db.transaction((tx) => {
    const fields: Record<string, unknown> = { updatedAt: now };
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.category !== undefined) fields.category = patch.category;
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.priceMinor !== undefined) fields.priceMinor = patch.priceMinor;
    if (patch.currency !== undefined) fields.currency = patch.currency;
    if (patch.purchaseDate !== undefined) fields.purchaseDate = patch.purchaseDate;
    tx.update(garments)
      .set(fields)
      .where(and(eq(garments.id, id), ACTIVE))
      .run();
    if (patch.tags !== undefined) {
      tx.delete(garmentTags).where(eq(garmentTags.garmentId, id)).run();
      if (patch.tags.length > 0) {
        tx.insert(garmentTags)
          .values(
            patch.tags.map((t, i) => ({
              id: `${id}-tag-${i}`,
              garmentId: id,
              kind: t.kind,
              value: t.value,
              confidence: t.confidence ?? 1,
            })),
          )
          .run();
      }
    }
    touched = true;
  });
  return touched;
}

/** 软删除（墓碑）。原图文件不在此删除，留待延迟清理 / 用户恢复。 */
export function softDeleteGarment(db: AnySqliteDb, id: string, now: number): boolean {
  let done = false;
  db.transaction((tx) => {
    tx.update(garments)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(garments.id, id), ACTIVE))
      .run();
    done = true;
  });
  return done;
}

/** 恢复软删除（仅对带墓碑的行生效；幂等）。 */
export function restoreGarment(db: AnySqliteDb, id: string, now: number): boolean {
  const row = db.select().from(garments).where(eq(garments.id, id)).get();
  if (!row || row.deletedAt == null) return false;
  db.transaction((tx) => {
    tx.update(garments)
      .set({ deletedAt: null, updatedAt: now })
      .where(eq(garments.id, id))
      .run();
  });
  return true;
}
