import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import * as schema from './schema';
import {
  garmentAssets,
  garmentStatusEvents,
  garmentTags,
  garments,
  lookItems,
  looks,
  packingItems,
  plans,
  tripOutfits,
  tripTemplates,
  trips,
} from './schema';
import type {
  GarmentAssetRow,
  GarmentRow,
  GarmentStatusEventRow,
  GarmentTagRow,
  LookItemRow,
  LookRow,
  PackingItemRow,
  PlanRow,
  TripOutfitRow,
  TripRow,
  TripTemplateRow,
} from './schema';
import type { GarmentDb, GarmentDbOps } from './dao';
import { runMigrations, type QueryableMigrationAdapter } from './migrations';

/**
 * 设备侧数据库工厂：expo-sqlite **异步 API** + Drizzle ORM。
 *
 * 为何异步：本机实测同步 API（openDatabaseSync/execSync）写入不落盘（库文件 mtime 不变，
 * 重启丢数据），违反「数据不丢」。异步 API 的 runAsync/withTransactionAsync 正确提交，
 * 配合写后 closeAsync 强制 fsync，保证强杀/断电不丢已提交写入。
 */

const DB_NAME = 'clothes.db';

export interface AppDb {
  db: GarmentDb;
  raw: SQLiteDatabase;
  /** drizzle 实例（队列/管线等需要直接表访问的模块使用） */
  drizzleDb: ExpoSQLiteDatabase<typeof schema>;
  /** 写操作后调用：关闭+重开连接，强制落盘。 */
  flush: () => Promise<void>;
  close: () => Promise<void>;
}

let current: AppDb | null = null;

const ACTIVE = isNull(garments.deletedAt);

function opsOf(d: ExpoSQLiteDatabase<typeof schema>, raw: SQLiteDatabase): GarmentDbOps {
  return {
    insertGarment: (row) => {
      d.insert(garments).values(row).run();
      return Promise.resolve();
    },
    insertAsset: (row) => {
      d.insert(garmentAssets).values(row).run();
      return Promise.resolve();
    },
    insertTags: (rows) => {
      if (rows.length === 0) return Promise.resolve();
      d.insert(garmentTags).values(rows).run();
      return Promise.resolve();
    },
    updateGarment: (id, fields) => {
      d.update(garments).set(fields).where(and(eq(garments.id, id), ACTIVE)).run();
      return Promise.resolve();
    },
    deleteTagsByGarment: (id) => {
      d.delete(garmentTags).where(eq(garmentTags.garmentId, id)).run();
      return Promise.resolve();
    },
    updateDeletedAt: (id, deletedAt, updatedAt) => {
      d.update(garments)
        .set({ deletedAt, updatedAt })
        .where(eq(garments.id, id))
        .run();
      return Promise.resolve();
    },
    insertStatusEvent: (row) => {
      d.insert(garmentStatusEvents).values(row).run();
      return Promise.resolve();
    },
    listStatusEventsByGarment: (id) =>
      Promise.resolve(
        (d
          .select()
          .from(garmentStatusEvents)
          .where(eq(garmentStatusEvents.garmentId, id))
          .orderBy(asc(garmentStatusEvents.changedAt))
          .all() as unknown as GarmentStatusEventRow[]) ?? [],
      ),
    getAllStatusEvents: () =>
      Promise.resolve((d.select().from(garmentStatusEvents).all() as unknown as GarmentStatusEventRow[]) ?? []),
    deleteAllStatusEvents: () => {
      d.delete(garmentStatusEvents).run();
      return Promise.resolve();
    },
    getGarment: (id) =>
      Promise.resolve(
        (d.select().from(garments).where(eq(garments.id, id)).get() as unknown as GarmentRow | null) ?? null,
      ),
    getActiveGarment: (id) =>
      Promise.resolve(
        (d.select().from(garments).where(and(eq(garments.id, id), ACTIVE)).get() as unknown as GarmentRow | null) ?? null,
      ),
    getAssetByGarment: (id) =>
      Promise.resolve(
        (d.select().from(garmentAssets).where(eq(garmentAssets.garmentId, id)).get() as unknown as GarmentAssetRow | null) ??
          null,
      ),
    getTagsByGarment: (id) =>
      Promise.resolve(
        (d.select().from(garmentTags).where(eq(garmentTags.garmentId, id)).all() as unknown as GarmentTagRow[]) ?? [],
      ),
    listActiveGarments: () =>
      Promise.resolve(
        (d
          .select()
          .from(garments)
          .where(and(ACTIVE, isNull(garments.archivedAt)))
          .orderBy(desc(garments.createdAt))
          .all() as unknown as GarmentRow[]) ?? [],
      ),
    findAssetByHash: (hash) =>
      Promise.resolve(
        (d.select().from(garmentAssets).where(eq(garmentAssets.sha256, hash)).get() as unknown as GarmentAssetRow | null) ??
          null,
      ),
    listAllGarments: () =>
      Promise.resolve((d.select().from(garments).all() as unknown as GarmentRow[]) ?? []),
    getAllAssets: () =>
      Promise.resolve((d.select().from(garmentAssets).all() as unknown as GarmentAssetRow[]) ?? []),
    getAllTags: () =>
      Promise.resolve((d.select().from(garmentTags).all() as unknown as GarmentTagRow[]) ?? []),
    deleteAllTags: () => {
      d.delete(garmentTags).run();
      return Promise.resolve();
    },
    deleteAllAssets: () => {
      d.delete(garmentAssets).run();
      return Promise.resolve();
    },
    deleteAllGarments: () => {
      d.delete(garments).run();
      return Promise.resolve();
    },
    insertLook: (row) => {
      d.insert(looks).values(row).run();
      return Promise.resolve();
    },
    insertLookItems: (rows) => {
      if (rows.length === 0) return Promise.resolve();
      d.insert(lookItems).values(rows).run();
      return Promise.resolve();
    },
    getLook: (id) =>
      Promise.resolve(
        (d.select().from(looks).where(eq(looks.id, id)).get() as unknown as LookRow | null) ?? null,
      ),
    listLooks: () =>
      Promise.resolve(
        (d
          .select()
          .from(looks)
          .where(isNull(looks.deletedAt))
          .orderBy(desc(looks.updatedAt))
          .all() as unknown as LookRow[]) ?? [],
      ),
    getLookItems: (lookId) =>
      Promise.resolve(
        (d
          .select()
          .from(lookItems)
          .where(eq(lookItems.lookId, lookId))
          .orderBy(asc(lookItems.zIndex), asc(lookItems.ord))
          .all() as unknown as LookItemRow[]) ?? [],
      ),
    updateLook: (id, fields) => {
      d.update(looks).set(fields).where(eq(looks.id, id)).run();
      return Promise.resolve();
    },
    deleteLookItemsByLook: (lookId) => {
      d.delete(lookItems).where(eq(lookItems.lookId, lookId)).run();
      return Promise.resolve();
    },
    getAllLooks: () =>
      Promise.resolve((d.select().from(looks).all() as unknown as LookRow[]) ?? []),
    getAllLookItems: () =>
      Promise.resolve((d.select().from(lookItems).all() as unknown as LookItemRow[]) ?? []),
    deleteAllLooks: () => {
      d.delete(looks).run();
      return Promise.resolve();
    },
    deleteAllLookItems: () => {
      d.delete(lookItems).run();
      return Promise.resolve();
    },
    insertPlan: (row) => {
      d.insert(plans).values(row).run();
      return Promise.resolve();
    },
    getPlan: (id) =>
      Promise.resolve(
        (d.select().from(plans).where(eq(plans.id, id)).get() as unknown as PlanRow | null) ?? null,
      ),
    listActivePlans: () =>
      Promise.resolve(
        (d
          .select()
          .from(plans)
          .where(isNull(plans.deletedAt))
          .orderBy(asc(plans.date), asc(plans.createdAt))
          .all() as unknown as PlanRow[]) ?? [],
      ),
    updatePlan: (id, fields) => {
      d.update(plans).set(fields).where(eq(plans.id, id)).run();
      return Promise.resolve();
    },
    getAllPlans: () =>
      Promise.resolve((d.select().from(plans).all() as unknown as PlanRow[]) ?? []),
    deleteAllPlans: () => {
      d.delete(plans).run();
      return Promise.resolve();
    },
    // 旅行（MVP-010）。
    insertTrip: (row) => {
      d.insert(trips).values(row).run();
      return Promise.resolve();
    },
    getTrip: (id) =>
      Promise.resolve(
        (d.select().from(trips).where(eq(trips.id, id)).get() as unknown as TripRow | null) ?? null,
      ),
    listActiveTrips: () =>
      Promise.resolve(
        (d
          .select()
          .from(trips)
          .where(isNull(trips.deletedAt))
          .orderBy(desc(trips.updatedAt))
          .all() as unknown as TripRow[]) ?? [],
      ),
    updateTrip: (id, fields) => {
      d.update(trips).set(fields).where(eq(trips.id, id)).run();
      return Promise.resolve();
    },
    getAllTrips: () =>
      Promise.resolve((d.select().from(trips).all() as unknown as TripRow[]) ?? []),
    deleteAllTrips: () => {
      d.delete(trips).run();
      return Promise.resolve();
    },
    // 旅行内每日造型安排。
    insertTripOutfit: (row) => {
      d.insert(tripOutfits).values(row).run();
      return Promise.resolve();
    },
    getTripOutfit: (id) =>
      Promise.resolve(
        (d.select().from(tripOutfits).where(eq(tripOutfits.id, id)).get() as unknown as TripOutfitRow | null) ?? null,
      ),
    listActiveTripOutfits: (tripId) =>
      Promise.resolve(
        (d
          .select()
          .from(tripOutfits)
          .where(and(eq(tripOutfits.tripId, tripId), isNull(tripOutfits.deletedAt)))
          .orderBy(asc(tripOutfits.date), asc(tripOutfits.createdAt))
          .all() as unknown as TripOutfitRow[]) ?? [],
      ),
    updateTripOutfit: (id, fields) => {
      d.update(tripOutfits).set(fields).where(eq(tripOutfits.id, id)).run();
      return Promise.resolve();
    },
    getAllTripOutfits: () =>
      Promise.resolve((d.select().from(tripOutfits).all() as unknown as TripOutfitRow[]) ?? []),
    deleteAllTripOutfits: () => {
      d.delete(tripOutfits).run();
      return Promise.resolve();
    },
    // 打包清单项。
    insertPackingItem: (row) => {
      d.insert(packingItems).values(row).run();
      return Promise.resolve();
    },
    getPackingItem: (id) =>
      Promise.resolve(
        (d.select().from(packingItems).where(eq(packingItems.id, id)).get() as unknown as PackingItemRow | null) ?? null,
      ),
    listPackingItemsByTrip: (tripId) =>
      Promise.resolve(
        (d
          .select()
          .from(packingItems)
          .where(eq(packingItems.tripId, tripId))
          .orderBy(asc(packingItems.kind), asc(packingItems.ord))
          .all() as unknown as PackingItemRow[]) ?? [],
      ),
    updatePackingItem: (id, fields) => {
      d.update(packingItems).set(fields).where(eq(packingItems.id, id)).run();
      return Promise.resolve();
    },
    deletePackingItem: (id) => {
      d.delete(packingItems).where(eq(packingItems.id, id)).run();
      return Promise.resolve();
    },
    deletePackingItemsByTrip: (tripId) => {
      d.delete(packingItems).where(eq(packingItems.tripId, tripId)).run();
      return Promise.resolve();
    },
    getAllPackingItems: () =>
      Promise.resolve((d.select().from(packingItems).all() as unknown as PackingItemRow[]) ?? []),
    deleteAllPackingItems: () => {
      d.delete(packingItems).run();
      return Promise.resolve();
    },
    // 旅行模板。
    insertTripTemplate: (row) => {
      d.insert(tripTemplates).values(row).run();
      return Promise.resolve();
    },
    getTripTemplate: (id) =>
      Promise.resolve(
        (d.select().from(tripTemplates).where(eq(tripTemplates.id, id)).get() as unknown as TripTemplateRow | null) ?? null,
      ),
    listActiveTripTemplates: () =>
      Promise.resolve(
        (d
          .select()
          .from(tripTemplates)
          .where(isNull(tripTemplates.deletedAt))
          .orderBy(desc(tripTemplates.updatedAt))
          .all() as unknown as TripTemplateRow[]) ?? [],
      ),
    updateTripTemplate: (id, fields) => {
      d.update(tripTemplates).set(fields).where(eq(tripTemplates.id, id)).run();
      return Promise.resolve();
    },
    getAllTripTemplates: () =>
      Promise.resolve((d.select().from(tripTemplates).all() as unknown as TripTemplateRow[]) ?? []),
    deleteAllTripTemplates: () => {
      d.delete(tripTemplates).run();
      return Promise.resolve();
    },
    getMetaInt: async (key) => {
      const row = (await d
        .select({ value: sql<number>`value` })
        .from(sql`__clothes_meta`)
        .where(sql`key = ${key}`)
        .get()) as { value?: number | null } | undefined;
      return row?.value == null ? null : Number(row.value);
    },
    setMetaInt: (key, value) => {
      raw.execSync(
        `INSERT INTO __clothes_meta(key,value) VALUES('${key}',${value}) ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
      );
      return Promise.resolve();
    },
    getMeta: async (key) => {
      const row = raw.getFirstSync<Record<string, unknown>>(`SELECT value FROM __clothes_meta WHERE key='${key}'`);
      return row?.value == null ? null : String(row.value);
    },
    setMeta: async (key, value) => {
      const esc = value.replace(/'/g, "''");
      raw.execSync(
        `INSERT INTO __clothes_meta(key,value) VALUES('${key}','${esc}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
      );
    },
  };
}

function buildGarmentDb(raw: SQLiteDatabase): GarmentDb {
  const d = drizzle(raw, { schema });
  const outer = opsOf(d, raw);
  return {
    ...outer,
    transaction: async <T>(fn: (tx: GarmentDbOps) => Promise<T>): Promise<T> => {
      let result: T;
      await d.transaction(async (txd) => {
        result = await fn(opsOf(txd, raw));
      });
      return result!;
    },
  };
}

async function build(): Promise<AppDb> {
  const raw = await openDatabaseAsync(DB_NAME);
  const adapter: QueryableMigrationAdapter = {
    exec: (sql: string) => raw.execAsync(sql),
    scalarInt: async (sql: string) => {
      const row = (await raw.getFirstAsync<Record<string, unknown>>(sql)) ?? null;
      if (!row) return null;
      const v = Object.values(row)[0];
      return v == null ? null : Number(v);
    },
    pragmaInt: async (name: string) => {
      const row = (await raw.getFirstAsync<Record<string, unknown>>(`PRAGMA ${name}`)) ?? null;
      if (!row) return null;
      const v = Object.values(row)[0];
      return v == null ? null : Number(v);
    },
    getMeta: async (key) => {
      const row = (await raw.getFirstAsync<Record<string, unknown>>(
        `SELECT value FROM __clothes_meta WHERE key='${key}'`,
      )) as { value?: string | null } | null;
      return row?.value == null ? null : String(row.value);
    },
    setMeta: async (key, value) => {
      const esc = value.replace(/'/g, "''");
      await raw.execAsync(
        `INSERT INTO __clothes_meta(key,value) VALUES('${key}','${esc}') ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
      );
    },
  };
  await runMigrations(adapter, { journalMode: 'DELETE' });
  const drizzleDb = drizzle(raw, { schema });
  return {
    db: buildGarmentDb(raw),
    raw,
    drizzleDb,
    flush: flushDb,
    close: async () => {
      await raw.closeAsync();
    },
  };
}

export async function openAppDb(): Promise<AppDb> {
  if (!current) current = await build();
  return current;
}

/** 关闭当前连接并重建，强制已提交写入落盘（强杀/断电不丢）。 */
export async function flushDb(): Promise<void> {
  if (current) {
    try {
      await current.raw.closeAsync();
    } catch {
      /* 已关闭则忽略 */
    }
    current = null;
  }
  current = await build();
}
