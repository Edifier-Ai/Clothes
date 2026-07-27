import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import * as schema from './schema';
import { garmentAssets, garmentTags, garments } from './schema';
import type {
  GarmentAssetRow,
  GarmentRow,
  GarmentTagRow,
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
  };
  await runMigrations(adapter, { journalMode: 'DELETE' });
  return {
    db: buildGarmentDb(raw),
    raw,
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
