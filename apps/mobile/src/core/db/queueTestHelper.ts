/**
 * @jest-environment node
 */
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';
import { runMigrations, type QueryableMigrationAdapter } from './migrations';

export interface QueueTestDb {
  raw: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  close: () => void;
}

export function openQueueTestDb(): QueueTestDb {
  const raw = new Database(':memory:');
  const adapter: QueryableMigrationAdapter = {
    exec: (sql) => {
      raw.exec(sql);
    },
    scalarInt: (sql) => {
      const row = raw.prepare(sql).get() as Record<string, unknown> | undefined;
      if (!row) return null;
      const v = Object.values(row)[0];
      return v == null ? null : Number(v);
    },
    pragmaInt: (name) => {
      const v = raw.pragma(name, { simple: true });
      return v == null ? null : Number(v);
    },
  };
  // runMigrations 为 async；内存库同步执行：用 then 在微任务前不行，故此处同步跑 SQL。
  // 直接执行 v1+v2 的 SQL（与 migrations.ts 同源）以保证测试同步可用。
  raw.exec('PRAGMA foreign_keys=ON;');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MIGRATIONS } = require('./migrations') as { MIGRATIONS: { sql: string }[] };
  for (const m of MIGRATIONS) raw.exec(m.sql);
  void runMigrations;
  void adapter;
  const db = drizzle(raw, { schema });
  return {
    raw,
    db,
    close: () => raw.close(),
  };
}
