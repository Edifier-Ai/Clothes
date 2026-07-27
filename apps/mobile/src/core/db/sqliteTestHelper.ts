import fs from 'fs';
import os from 'os';
import path from 'path';

import Database, { type Database as DatabaseT } from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, desc, eq, isNull } from 'drizzle-orm';

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
  };
}

function buildGarmentDb(raw: DatabaseT): GarmentDb {
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

export interface TestDb {
  raw: DatabaseT;
  adapter: QueryableMigrationAdapter;
  db: GarmentDb;
  filePath: string;
  close: () => void;
}

async function openAt(filePath: string, migrate: boolean): Promise<TestDb> {
  const raw = new Database(filePath);
  const adapter = wrap(raw);
  if (migrate) await runMigrations(adapter, {});
  return {
    raw,
    adapter,
    db: buildGarmentDb(raw),
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

/** 关闭当前库并以同一文件重新打开（不再迁移），模拟进程重启。 */
export async function reopenDb(prev: TestDb): Promise<TestDb> {
  const { filePath } = prev;
  prev.raw.close();
  return openAt(filePath, false);
}
