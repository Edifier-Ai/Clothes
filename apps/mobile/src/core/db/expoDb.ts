import { drizzle, type ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';

import * as schema from './schema';
import { runMigrations, type QueryableMigrationAdapter } from './migrations';

/**
 * 设备侧数据库工厂：expo-sqlite（同步 API）+ Drizzle ORM。
 *
 * - 启用 WAL 与 foreign_keys（foreign_keys 在事务外设置，由运行器保证）。
 * - 应用版本化迁移。
 * - 仅设备代码引用本模块；测试用 better-sqlite3 适配器，二者共享 schema/DAO/迁移。
 */

const DB_NAME = 'clothes.db';

export interface AppDb {
  db: ExpoSQLiteDatabase<typeof schema>;
  raw: SQLiteDatabase;
  adapter: QueryableMigrationAdapter;
  close: () => void;
}

export function openAppDb(): AppDb {
  const raw = openDatabaseSync(DB_NAME);
  const adapter: QueryableMigrationAdapter = {
    exec: (sql: string) => {
      raw.execSync(sql);
    },
    scalarInt: (sql: string) => {
      const row = raw.getFirstSync<Record<string, unknown>>(sql);
      if (!row) return null;
      const v = Object.values(row)[0];
      return v == null ? null : Number(v);
    },
    pragmaInt: (name: string) => {
      const row = raw.getFirstSync<Record<string, unknown>>(`PRAGMA ${name}`);
      if (!row) return null;
      const v = Object.values(row)[0];
      return v == null ? null : Number(v);
    },
  };
  runMigrations(adapter, { wal: true });
  const db = drizzle(raw, { schema });
  return { db, raw, adapter, close: () => raw.closeSync() };
}
