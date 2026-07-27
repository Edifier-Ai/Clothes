import fs from 'fs';
import os from 'os';
import path from 'path';

import Database, { type Database as DatabaseT } from 'better-sqlite3';

import { runMigrations, type QueryableMigrationAdapter } from './migrations';

/**
 * 测试用 sqlite 助手（better-sqlite3，同步、真实 sqlite、Windows 预编译）。
 *
 * 用临时文件库而非 :memory:，以便 close+reopen 同一文件来模拟“进程重启后
 * 重新打开持久化数据”。设备侧用 expo-sqlite，二者经 Drizzle 共用同一 schema/DAO。
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

function tmpDbPath(): string {
  return path.join(
    os.tmpdir(),
    `clothes-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
  );
}

export interface TestDb {
  raw: DatabaseT;
  adapter: QueryableMigrationAdapter;
  filePath: string;
  close: () => void;
}

function openAt(filePath: string, migrate: boolean): TestDb {
  const raw = new Database(filePath);
  const adapter = wrap(raw);
  if (migrate) runMigrations(adapter, { wal: false });
  return {
    raw,
    adapter,
    filePath,
    close: () => {
      raw.close();
      try {
        fs.unlinkSync(filePath);
      } catch {
        /* 已删则忽略 */
      }
    },
  };
}

/** 新建临时库并应用全部迁移。 */
export function openTestDb(): TestDb {
  return openAt(tmpDbPath(), true);
}

/**
 * 关闭当前库并以同一文件重新打开（不再迁移），模拟进程重启。
 * 调用方需对返回的新 TestDb 自行 close（会删除文件）。
 */
export function reopenDb(prev: TestDb): TestDb {
  const { filePath } = prev;
  prev.raw.close();
  const raw = new Database(filePath);
  return {
    raw,
    adapter: wrap(raw),
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
