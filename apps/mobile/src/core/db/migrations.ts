/**
 * 版本化迁移运行器。
 *
 * - PRAGMA（journal_mode/foreign_keys）在事务外设置（foreign_keys 在事务内不可改）。
 * - 每条迁移在独立事务内执行；失败 ROLLBACK，绝不留下半套表或半条业务数据。
 * - schema 版本号记于 __clothes_meta，单调递增，幂等。
 *
 * 适配器抽象让设备（expo-sqlite）与测试（sql.js WASM）共用同一运行器与 SQL。
 */

export interface MigrationAdapter {
  /** 执行可含多条语句的 SQL（PRAGMA / CREATE / BEGIN 等）。返回 Promise 以兼容异步后端。 */
  exec(sql: string): Promise<void> | void;
}

export interface MigrationOptions {
  /**
   * 日志模式。默认 DELETE（同步落主库）：保证提交后即使进程被强杀也不丢数据，
   * 满足「数据不丢」最高优先级。WAL 在强杀且未 checkpoint 时会丢最近写入，故不采用。
   */
  journalMode?: 'DELETE' | 'TRUNCATE' | 'WAL';
}

export interface MigrationSql {
  version: number;
  sql: string;
}

/** 当前最新 schema 版本；新增迁移追加到 MIGRATIONS 末尾，version 递增。 */
export const SCHEMA_VERSION = 1;

export const MIGRATIONS: readonly MigrationSql[] = [
  {
    version: 1,
    sql: `
CREATE TABLE garments (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'clean',
  price_minor INTEGER,
  currency TEXT,
  purchase_date TEXT,
  archived_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX garments_active_idx ON garments (deleted_at, archived_at);
CREATE TABLE garment_assets (
  id TEXT PRIMARY KEY NOT NULL,
  garment_id TEXT NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
  original_rel_path TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bytes INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX garment_assets_sha256_idx ON garment_assets (sha256);
CREATE INDEX garment_assets_garment_idx ON garment_assets (garment_id);
CREATE TABLE garment_tags (
  id TEXT PRIMARY KEY NOT NULL,
  garment_id TEXT NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  value TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1
);
CREATE INDEX garment_tags_garment_kind_idx ON garment_tags (garment_id, kind);
`,
  },
] as const;

const META_DDL = `CREATE TABLE IF NOT EXISTS __clothes_meta (key TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL);`;

export interface QueryableMigrationAdapter extends MigrationAdapter {
  /** 返回单列整数值，无行时返回 null。 */
  scalarInt(sql: string): Promise<number | null> | number | null;
  /** 读取整型 PRAGMA（各后端用原生接口，避免 prepare 不支持 PRAGMA 的差异）。 */
  pragmaInt(name: string): Promise<number | null> | number | null;
}

export async function runMigrations(
  adapter: QueryableMigrationAdapter,
  options: MigrationOptions = {},
): Promise<{ from: number; to: number }> {
  const mode = options.journalMode ?? 'DELETE';
  // journal_mode 必须在事务外设置；DELETE/TRUNCATE 保证强杀不丢已提交数据。
  try {
    await adapter.exec(`PRAGMA journal_mode=${mode};`);
  } catch {
    /* 后端不支持则忽略（如 sql.js） */
  }
  // synchronous=FULL：每次提交 fsync 落盘，进程被强杀/断电也不丢已提交写入
  // （满足「数据不丢」最高优先级；本机实测默认 synchronous 在强杀下会丢最近写入）。
  try {
    await adapter.exec('PRAGMA synchronous=FULL;');
  } catch {
    /* ignore */
  }
  // foreign_keys 必须在事务外设置。
  await adapter.exec('PRAGMA foreign_keys=ON;');
  await adapter.exec(META_DDL);

  const from = (await adapter.scalarInt("SELECT value FROM __clothes_meta WHERE key='schema_version'")) ?? 0;
  const pending = MIGRATIONS.filter((m) => m.version > from);
  if (pending.length === 0) return { from, to: from };

  for (const m of pending) {
    await adapter.exec('BEGIN;');
    try {
      await adapter.exec(m.sql);
      await adapter.exec(
        `INSERT INTO __clothes_meta(key,value) VALUES('schema_version',${m.version}) ` +
          `ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
      );
      await adapter.exec('COMMIT;');
    } catch (err) {
      try {
        await adapter.exec('ROLLBACK;');
      } catch {
        /* 已在回滚态则忽略 */
      }
      throw err;
    }
  }
  return { from, to: pending.length ? pending[pending.length - 1].version : from };
}
