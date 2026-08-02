import fs from 'fs';
import os from 'os';
import path from 'path';

import Database, { type Database as DatabaseT } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';

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
import { MIGRATIONS, runMigrations, type QueryableMigrationAdapter } from './migrations';

/**
 * 测试用 sqlite 助手（better-sqlite3，同步、真实 sqlite、Windows 预编译）。
 *
 * 实现与设备侧相同的 `GarmentDb` 接口：同步 API 包成 Promise；事务用显式
 * BEGIN/COMMIT 包裹异步 fn（better-sqlite3 的 exec 同步生效，故 BEGIN 在 fn 运行前
 * 已开启事务，fn 内同步 drizzle 调用处于该事务中，COMMIT 在 await 后提交）。
 * 用临时文件库，close+reopen 同文件模拟“进程重启”。
 */

function wrap(raw: DatabaseT): QueryableMigrationAdapter {
  return {
    exec: (sql: string) => {
      raw.exec(sql);
    },
    scalarInt: (sql: string) => {
      const row = raw.prepare(sql).get() as Record<string, unknown> | undefined;
      if (!row) return null;
      const v = Object.values(row)[0];
      return v == null ? null : Number(v);
    },
    pragmaInt: (name: string) => {
      const v = raw.pragma(name, { simple: true });
      return v == null ? null : Number(v);
    },
    getMeta: (key) => {
      const row = raw.prepare(`SELECT value AS v FROM __clothes_meta WHERE key=?`).get(key) as
        | { v?: string | null }
        | undefined;
      return Promise.resolve(row?.v == null ? null : String(row.v));
    },
    setMeta: (key, value) => {
      raw
        .prepare(`INSERT INTO __clothes_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`)
        .run(key, value);
      return Promise.resolve();
    },
  };
}

const ACTIVE = isNull(garments.deletedAt);

function opsOf(d: BetterSQLite3Database<typeof schema>, raw: DatabaseT): GarmentDbOps {
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
      d.update(garments).set({ deletedAt, updatedAt }).where(eq(garments.id, id)).run();
      return Promise.resolve();
    },
    insertStatusEvent: (row) => {
      d.insert(garmentStatusEvents).values(row).run();
      return Promise.resolve();
    },
    listStatusEventsByGarment: (id) =>
      Promise.resolve(
        d
          .select()
          .from(garmentStatusEvents)
          .where(eq(garmentStatusEvents.garmentId, id))
          .orderBy(asc(garmentStatusEvents.changedAt))
          .all() as GarmentStatusEventRow[],
      ),
    getAllStatusEvents: () =>
      Promise.resolve(d.select().from(garmentStatusEvents).all() as GarmentStatusEventRow[]),
    deleteAllStatusEvents: () => {
      d.delete(garmentStatusEvents).run();
      return Promise.resolve();
    },
    getGarment: (id) =>
      Promise.resolve(
        (d.select().from(garments).where(eq(garments.id, id)).get() as GarmentRow | undefined) ?? null,
      ),
    getActiveGarment: (id) =>
      Promise.resolve(
        (d.select().from(garments).where(and(eq(garments.id, id), ACTIVE)).get() as GarmentRow | undefined) ?? null,
      ),
    getAssetByGarment: (id) =>
      Promise.resolve(
        (d.select().from(garmentAssets).where(eq(garmentAssets.garmentId, id)).get() as GarmentAssetRow | undefined) ??
          null,
      ),
    getTagsByGarment: (id) =>
      Promise.resolve(d.select().from(garmentTags).where(eq(garmentTags.garmentId, id)).all() as GarmentTagRow[]),
    listActiveGarments: () =>
      Promise.resolve(
        d
          .select()
          .from(garments)
          .where(and(ACTIVE, isNull(garments.archivedAt)))
          .orderBy(desc(garments.createdAt))
          .all() as GarmentRow[],
      ),
    findAssetByHash: (hash) =>
      Promise.resolve(
        (d.select().from(garmentAssets).where(eq(garmentAssets.sha256, hash)).get() as GarmentAssetRow | undefined) ??
          null,
      ),
    listAllGarments: () =>
      Promise.resolve((d.select().from(garments).all() as GarmentRow[]) ?? []),
    getAllAssets: () =>
      Promise.resolve((d.select().from(garmentAssets).all() as GarmentAssetRow[]) ?? []),
    getAllTags: () => Promise.resolve((d.select().from(garmentTags).all() as GarmentTagRow[]) ?? []),
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
        (d.select().from(looks).where(eq(looks.id, id)).get() as LookRow | undefined) ?? null,
      ),
    listLooks: () =>
      Promise.resolve(
        d
          .select()
          .from(looks)
          .where(isNull(looks.deletedAt))
          .orderBy(desc(looks.updatedAt))
          .all() as LookRow[],
      ),
    getLookItems: (lookId) =>
      Promise.resolve(
        d
          .select()
          .from(lookItems)
          .where(eq(lookItems.lookId, lookId))
          .orderBy(asc(lookItems.zIndex), asc(lookItems.ord))
          .all() as LookItemRow[],
      ),
    updateLook: (id, fields) => {
      d.update(looks).set(fields).where(eq(looks.id, id)).run();
      return Promise.resolve();
    },
    deleteLookItemsByLook: (lookId) => {
      d.delete(lookItems).where(eq(lookItems.lookId, lookId)).run();
      return Promise.resolve();
    },
    getAllLooks: () => Promise.resolve((d.select().from(looks).all() as LookRow[]) ?? []),
    getAllLookItems: () =>
      Promise.resolve((d.select().from(lookItems).all() as LookItemRow[]) ?? []),
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
        (d.select().from(plans).where(eq(plans.id, id)).get() as PlanRow | undefined) ?? null,
      ),
    listActivePlans: () =>
      Promise.resolve(
        d
          .select()
          .from(plans)
          .where(isNull(plans.deletedAt))
          .orderBy(asc(plans.date), asc(plans.createdAt))
          .all() as PlanRow[],
      ),
    updatePlan: (id, fields) => {
      d.update(plans).set(fields).where(eq(plans.id, id)).run();
      return Promise.resolve();
    },
    getAllPlans: () => Promise.resolve((d.select().from(plans).all() as PlanRow[]) ?? []),
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
        (d.select().from(trips).where(eq(trips.id, id)).get() as TripRow | undefined) ?? null,
      ),
    listActiveTrips: () =>
      Promise.resolve(
        d
          .select()
          .from(trips)
          .where(isNull(trips.deletedAt))
          .orderBy(desc(trips.updatedAt))
          .all() as TripRow[],
      ),
    updateTrip: (id, fields) => {
      d.update(trips).set(fields).where(eq(trips.id, id)).run();
      return Promise.resolve();
    },
    getAllTrips: () => Promise.resolve((d.select().from(trips).all() as TripRow[]) ?? []),
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
        (d.select().from(tripOutfits).where(eq(tripOutfits.id, id)).get() as TripOutfitRow | undefined) ?? null,
      ),
    listActiveTripOutfits: (tripId) =>
      Promise.resolve(
        d
          .select()
          .from(tripOutfits)
          .where(and(eq(tripOutfits.tripId, tripId), isNull(tripOutfits.deletedAt)))
          .orderBy(asc(tripOutfits.date), asc(tripOutfits.createdAt))
          .all() as TripOutfitRow[],
      ),
    updateTripOutfit: (id, fields) => {
      d.update(tripOutfits).set(fields).where(eq(tripOutfits.id, id)).run();
      return Promise.resolve();
    },
    getAllTripOutfits: () =>
      Promise.resolve((d.select().from(tripOutfits).all() as TripOutfitRow[]) ?? []),
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
        (d.select().from(packingItems).where(eq(packingItems.id, id)).get() as PackingItemRow | undefined) ?? null,
      ),
    listPackingItemsByTrip: (tripId) =>
      Promise.resolve(
        d
          .select()
          .from(packingItems)
          .where(eq(packingItems.tripId, tripId))
          .orderBy(asc(packingItems.kind), asc(packingItems.ord))
          .all() as PackingItemRow[],
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
      Promise.resolve((d.select().from(packingItems).all() as PackingItemRow[]) ?? []),
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
        (d.select().from(tripTemplates).where(eq(tripTemplates.id, id)).get() as TripTemplateRow | undefined) ?? null,
      ),
    listActiveTripTemplates: () =>
      Promise.resolve(
        d
          .select()
          .from(tripTemplates)
          .where(isNull(tripTemplates.deletedAt))
          .orderBy(desc(tripTemplates.updatedAt))
          .all() as TripTemplateRow[],
      ),
    updateTripTemplate: (id, fields) => {
      d.update(tripTemplates).set(fields).where(eq(tripTemplates.id, id)).run();
      return Promise.resolve();
    },
    getAllTripTemplates: () =>
      Promise.resolve((d.select().from(tripTemplates).all() as TripTemplateRow[]) ?? []),
    deleteAllTripTemplates: () => {
      d.delete(tripTemplates).run();
      return Promise.resolve();
    },
    getMetaInt: (key) => {
      const row = raw.prepare(`SELECT value AS v FROM __clothes_meta WHERE key=?`).get(key) as
        | { v?: number | null }
        | undefined;
      return Promise.resolve(row?.v == null ? null : Number(row.v));
    },
    setMetaInt: (key, value) => {
      raw
        .prepare(
          `INSERT INTO __clothes_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        )
        .run(key, value);
      return Promise.resolve();
    },
    getMeta: (key) => {
      const row = raw.prepare(`SELECT value AS v FROM __clothes_meta WHERE key=?`).get(key) as
        | { v?: string | null }
        | undefined;
      return Promise.resolve(row?.v == null ? null : String(row.v));
    },
    setMeta: (key, value) => {
      raw
        .prepare(
          `INSERT INTO __clothes_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
        )
        .run(key, value);
      return Promise.resolve();
    },
  };
}

export function buildGarmentDb(raw: DatabaseT): GarmentDb {
  const d = drizzle(raw, { schema });
  const outer = opsOf(d, raw);
  return {
    ...outer,
    transaction: async <T>(fn: (tx: GarmentDbOps) => Promise<T>): Promise<T> => {
      raw.exec('BEGIN');
      try {
        const result = await fn(opsOf(d, raw));
        raw.exec('COMMIT');
        return result;
      } catch (err) {
        try {
          raw.exec('ROLLBACK');
        } catch {
          /* ignore */
        }
        throw err;
      }
    },
  };
}

function tmpDbPath(): string {
  return path.join(
    os.tmpdir(),
    `clothes-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
  );
}

const META_DDL_FOR_TEST = `CREATE TABLE IF NOT EXISTS __clothes_meta (key TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL);`;

export interface TestDb {
  raw: DatabaseT;
  adapter: QueryableMigrationAdapter;
  db: GarmentDb;
  /** drizzle 实例（与 queueTestHelper 对齐，便于直接表访问的模块使用）。 */
  drizzleDb: BetterSQLite3Database<typeof schema>;
  filePath: string;
  close: () => void;
}

async function openAt(filePath: string, migrate: boolean): Promise<TestDb> {
  const raw = new Database(filePath);
  const adapter = wrap(raw);
  if (migrate) await runMigrations(adapter, {});
  const drizzleDb = drizzle(raw, { schema });
  return {
    raw,
    adapter,
    db: buildGarmentDb(raw),
    drizzleDb,
    filePath,
    close: () => {
      raw.close();
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    },
  };
}

/** 新建临时库并应用全部迁移。 */
export async function openTestDb(): Promise<TestDb> {
  return openAt(tmpDbPath(), true);
}

/**
 * 新建临时库并只应用到指定版本（测试版本升级用，如 v5→v6 数据保留）。
 * 之后可对返回的 adapter 调 runMigrations 升级到最新。
 */
export async function openTestDbAtVersion(maxVersion: number): Promise<TestDb> {
  const filePath = tmpDbPath();
  const raw = new Database(filePath);
  const adapter = wrap(raw);
  await adapter.exec('PRAGMA foreign_keys=ON;');
  await adapter.exec(META_DDL_FOR_TEST);
  for (const m of MIGRATIONS.filter((m) => m.version <= maxVersion)) {
    await adapter.exec('BEGIN;');
    await adapter.exec(m.sql);
    await adapter.exec(
      `INSERT INTO __clothes_meta(key,value) VALUES('schema_version',${m.version}) ` +
        `ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
    );
    await adapter.exec('COMMIT;');
  }
  const drizzleDb = drizzle(raw, { schema });
  return {
    raw,
    adapter,
    db: buildGarmentDb(raw),
    drizzleDb,
    filePath,
    close: () => {
      raw.close();
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    },
  };
}

/** 关闭当前库并以同一文件重新打开（不再迁移），模拟进程重启。 */
export async function reopenDb(prev: TestDb): Promise<TestDb> {
  const { filePath } = prev;
  prev.raw.close();
  return openAt(filePath, false);
}
