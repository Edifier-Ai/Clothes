/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import type { GarmentDb } from './dao';
import * as schema from './schema';
import { buildGarmentDb } from './sqliteTestHelper';

export interface QueueTestDb {
  raw: Database.Database;
  /** drizzle 实例：供 queue/processor 等直接表访问的函数与 seed 使用。 */
  db: BetterSQLite3Database<typeof schema>;
  /** GarmentDb 抽象：供 onboarding 等通过 GarmentDb 接口的函数使用。 */
  garmentDb: GarmentDb;
  close: () => void;
}

export function openQueueTestDb(): QueueTestDb {
  const raw = new Database(':memory:');
  // runMigrations 为 async；内存库同步执行：直接执行 v1+v2 的 SQL（与 migrations.ts 同源）。
  raw.exec('PRAGMA foreign_keys=ON;');
  raw.exec('CREATE TABLE IF NOT EXISTS __clothes_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MIGRATIONS } = require('./migrations') as { MIGRATIONS: { sql: string }[] };
  for (const m of MIGRATIONS) raw.exec(m.sql);
  const db = drizzle(raw, { schema });
  return {
    raw,
    db,
    garmentDb: buildGarmentDb(raw),
    close: () => raw.close(),
  };
}
