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
  /** 执行可含多条语句的 SQL（PRAGMA / CREATE / BEGIN 等）。 */
  exec(sql: string): void;
}

export interface MigrationOptions {
  /** 设备置 true 启用 WAL；sql.js 等不支持 WAL 的后端置 false。 */
  wal?: boolean;
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
  scalarInt(sql: string): number | null;
  /** 读取整型 PRAGMA（各后端用原生接口，避免 prepare 不支持 PRAGMA 的差异）。 */
  pragmaInt(name: string): number | null;
}

export function runMigrations(
  adapter: QueryableMigrationAdapter,
  options: MigrationOptions = {},
): { from: number; to: number } {
  if (options.wal) {
    adapter.exec('PRAGMA journal_mode=WAL;');
  }
  // foreign_keys 必须在事务外设置。
  adapter.exec('PRAGMA foreign_keys=ON;');
  adapter.exec(META_DDL);

  const from = adapter.scalarInt("SELECT value FROM __clothes_meta WHERE key='schema_version'") ?? 0;
  const pending = MIGRATIONS.filter((m) => m.version > from);
  if (pending.length === 0) return { from, to: from };

  for (const m of pending) {
    adapter.exec('BEGIN;');
    try {
      adapter.exec(m.sql);
      adapter.exec(
        `INSERT INTO __clothes_meta(key,value) VALUES('schema_version',${m.version}) ` +
          `ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
      );
      adapter.exec('COMMIT;');
    } catch (err) {
      try {
        adapter.exec('ROLLBACK;');
      } catch {
        /* 已在回滚态则忽略 */
      }
      throw err;
    }
  }
  return { from, to: pending[pending.length - 1].version };
}
