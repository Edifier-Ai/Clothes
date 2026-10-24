import Database, { type Database as DatabaseT } from 'better-sqlite3';

/**
 * 测试用 expo-sqlite 替身：用 better-sqlite3 实现 expo-sqlite `SQLiteDatabase` 中
 * 本项目（含 drizzle-orm/expo-sqlite 驱动）用到的那部分 API。
 *
 * 与 sqliteTestHelper 不同，这里不重写事务语义，而是让设备侧的 expoDb.ts 原样运行，
 * 用来覆盖「drizzle expo 驱动是同步的、async 回调里 await 之后的语句不在事务内」这类
 * 只在设备驱动上出现的问题。
 */

type Params = unknown[] | Record<string, unknown> | undefined;

function bind(params: Params): unknown[] {
  if (params == null) return [];
  return Array.isArray(params) ? params : [params];
}

/** expo-sqlite 同时支持 `fn(sql, [a, b])` 与 `fn(sql, a, b)` 两种传参。 */
function flatten(params: unknown[]): unknown[] {
  return params.length === 1 && Array.isArray(params[0]) ? (params[0] as unknown[]) : params;
}

class FakeStatement {
  constructor(private readonly db: DatabaseT, private readonly source: string) {}

  executeSync(params?: Params) {
    const stmt = this.db.prepare(this.source);
    if (stmt.reader) {
      const rows = stmt.all(...bind(params)) as Record<string, unknown>[];
      return { changes: 0, lastInsertRowId: 0, getAllSync: () => rows, getFirstSync: () => rows[0] ?? null };
    }
    const info = stmt.run(...bind(params));
    return {
      changes: info.changes,
      lastInsertRowId: Number(info.lastInsertRowid),
      getAllSync: () => [],
      getFirstSync: () => null,
    };
  }

  executeForRawResultSync(params?: Params) {
    const stmt = this.db.prepare(this.source);
    const rows = stmt.reader ? (stmt.raw(true).all(...bind(params)) as unknown[][]) : [];
    return { getAllSync: () => rows };
  }

  finalizeSync() {}
}

export class FakeExpoSQLiteDatabase {
  readonly db: DatabaseT;

  constructor(file: string) {
    this.db = new Database(file);
  }

  prepareSync(source: string) {
    return new FakeStatement(this.db, source);
  }

  execSync(source: string) {
    this.db.exec(source);
  }

  getFirstSync<T>(source: string, ...params: unknown[]): T | null {
    return (this.db.prepare(source).get(...flatten(params)) as T | undefined) ?? null;
  }

  runSync(source: string, ...params: unknown[]) {
    const info = this.db.prepare(source).run(...flatten(params));
    return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid) };
  }

  async execAsync(source: string) {
    // 让出事件循环，模拟设备侧异步 API：其间其它同步语句可能插入执行。
    await Promise.resolve();
    this.db.exec(source);
  }

  async getFirstAsync<T>(source: string, ...params: unknown[]): Promise<T | null> {
    await Promise.resolve();
    return this.getFirstSync<T>(source, ...params);
  }

  async runAsync(source: string, ...params: unknown[]) {
    await Promise.resolve();
    return this.runSync(source, ...params);
  }

  async withTransactionAsync(task: () => Promise<void>) {
    try {
      await this.execAsync('BEGIN');
      await task();
      await this.execAsync('COMMIT');
    } catch (e) {
      await this.execAsync('ROLLBACK');
      throw e;
    }
  }

  async closeAsync() {
    if (this.db.open) this.db.close();
  }
}
