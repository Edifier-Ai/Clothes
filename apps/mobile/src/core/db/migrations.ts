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
  /** 仅测试：替换迁移列表（例如注入一条损坏的迁移验证回滚）。默认 MIGRATIONS。 */
  migrations?: readonly MigrationSql[];
}

export interface MigrationSql {
  version: number;
  sql: string;
}

/** 当前最新 schema 版本；新增迁移追加到 MIGRATIONS 末尾，version 递增。 */
export const SCHEMA_VERSION = 9;

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
  {
    version: 2,
    sql: `
CREATE TABLE cutout_jobs (
  id TEXT PRIMARY KEY NOT NULL,
  garment_id TEXT NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  source_staged_path TEXT,
  original_rel_path TEXT,
  mask_rel_path TEXT,
  preview_rel_path TEXT,
  thumbnail_rel_path TEXT,
  width INTEGER,
  height INTEGER,
  sha256 TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX cutout_jobs_status_idx ON cutout_jobs (status, created_at);
CREATE INDEX cutout_jobs_garment_idx ON cutout_jobs (garment_id);
CREATE TABLE mask_strokes (
  id TEXT PRIMARY KEY NOT NULL,
  garment_id TEXT NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
  op TEXT NOT NULL,
  points_json TEXT NOT NULL,
  brush_size REAL NOT NULL,
  ord INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX mask_strokes_garment_ord_idx ON mask_strokes (garment_id, ord);
`,
  },
  {
    version: 3,
    sql: `
CREATE TABLE recommendations (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  input_json TEXT NOT NULL,
  outfit_json TEXT NOT NULL,
  total_score REAL NOT NULL,
  occasion TEXT,
  weather_temp_c REAL,
  created_at INTEGER NOT NULL
);
CREATE INDEX recommendations_date_idx ON recommendations (date);
CREATE TABLE recommendation_items (
  id TEXT PRIMARY KEY NOT NULL,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  garment_id TEXT NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  ord INTEGER NOT NULL
);
CREATE INDEX recommendation_items_rec_idx ON recommendation_items (recommendation_id);
CREATE TABLE reason_codes (
  id TEXT PRIMARY KEY NOT NULL,
  recommendation_id TEXT NOT NULL REFERENCES recommendations(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  ord INTEGER NOT NULL
);
CREATE INDEX reason_codes_rec_idx ON reason_codes (recommendation_id);
CREATE TABLE wear_logs (
  id TEXT PRIMARY KEY NOT NULL,
  recommendation_id TEXT NOT NULL,
  date TEXT NOT NULL,
  occasion TEXT,
  comfort TEXT,
  note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX wear_logs_rec_date_idx ON wear_logs (recommendation_id, date);
CREATE TABLE wear_log_items (
  id TEXT PRIMARY KEY NOT NULL,
  wear_log_id TEXT NOT NULL REFERENCES wear_logs(id) ON DELETE CASCADE,
  garment_id TEXT NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
  slot TEXT NOT NULL,
  ord INTEGER NOT NULL
);
CREATE INDEX wear_log_items_log_idx ON wear_log_items (wear_log_id);
`,
  },
  {
    version: 4,
    sql: `
CREATE TABLE feedback_events (
  id TEXT PRIMARY KEY NOT NULL,
  idempotency_key TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  slot TEXT,
  before_item_id TEXT,
  after_item_id TEXT,
  skip_reason TEXT,
  mode TEXT,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX feedback_events_idempotency_uq ON feedback_events (idempotency_key);
CREATE INDEX feedback_events_rec_idx ON feedback_events (recommendation_id, created_at);
CREATE TABLE weather_cache (
  city_id TEXT PRIMARY KEY NOT NULL,
  city_name TEXT NOT NULL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  fetched_at INTEGER NOT NULL,
  window_start INTEGER NOT NULL,
  window_end INTEGER NOT NULL,
  min_temp_c REAL NOT NULL,
  max_temp_c REAL NOT NULL,
  condition_code TEXT NOT NULL,
  provider TEXT NOT NULL
);
`,
  },
  {
    version: 5,
    sql: `
CREATE TABLE garment_status_events (
  id TEXT PRIMARY KEY NOT NULL,
  garment_id TEXT NOT NULL REFERENCES garments(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_at INTEGER NOT NULL
);
CREATE INDEX garment_status_events_garment_time_idx ON garment_status_events (garment_id, changed_at);
`,
  },
  {
    version: 6,
    sql: `
CREATE TABLE looks (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  mode TEXT NOT NULL,
  source_look_id TEXT,
  cover_rel_path TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX looks_active_idx ON looks (deleted_at, updated_at);
CREATE TABLE look_items (
  id TEXT PRIMARY KEY NOT NULL,
  look_id TEXT NOT NULL REFERENCES looks(id) ON DELETE CASCADE,
  garment_id TEXT NOT NULL,
  slot TEXT,
  x REAL NOT NULL DEFAULT 0.5,
  y REAL NOT NULL DEFAULT 0.5,
  scale REAL NOT NULL DEFAULT 1,
  rotation REAL NOT NULL DEFAULT 0,
  z_index INTEGER NOT NULL,
  ord INTEGER NOT NULL
);
CREATE INDEX look_items_look_idx ON look_items (look_id, z_index, ord);
CREATE INDEX look_items_garment_idx ON look_items (garment_id);
`,
  },
  {
    version: 7,
    sql: `
CREATE TABLE plans (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  time_label TEXT NOT NULL,
  occasion TEXT,
  look_id TEXT,
  outfit_json TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'planned',
  completed_at INTEGER,
  change_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX plans_date_idx ON plans (deleted_at, date);
`,
  },
  {
    version: 8,
    sql: `
CREATE TABLE trips (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  activities_json TEXT NOT NULL DEFAULT '[]',
  weather_snapshot_json TEXT,
  status TEXT NOT NULL DEFAULT 'planning',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX trips_active_idx ON trips (deleted_at, updated_at);
CREATE TABLE trip_outfits (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL,
  date TEXT NOT NULL,
  time_label TEXT NOT NULL,
  occasion TEXT,
  look_id TEXT,
  outfit_json TEXT NOT NULL,
  note TEXT,
  worn_status TEXT NOT NULL DEFAULT 'planned',
  worn_completed_at INTEGER,
  worn_change_note TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX trip_outfits_trip_date_idx ON trip_outfits (trip_id, deleted_at, date, created_at);
CREATE TABLE packing_items (
  id TEXT PRIMARY KEY NOT NULL,
  trip_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  garment_id TEXT,
  label TEXT NOT NULL,
  source_count INTEGER NOT NULL DEFAULT 0,
  source_outfit_ids_json TEXT NOT NULL DEFAULT '[]',
  checked INTEGER NOT NULL DEFAULT 0,
  checked_at INTEGER,
  ord INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX packing_items_trip_idx ON packing_items (trip_id, kind, ord);
-- garment 项去重幂等：同 trip + 同 garment 只一项；manual 项 garment_id 为 NULL，SQLite 唯一索引允许多 NULL。
CREATE UNIQUE INDEX packing_items_trip_garment_uq ON packing_items (trip_id, garment_id);
CREATE TABLE trip_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  source_trip_id TEXT,
  items_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX trip_templates_active_idx ON trip_templates (deleted_at, updated_at);
`,
  },
  {
    version: 9,
    sql: `
CREATE TABLE shopping_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price_minor INTEGER,
  currency TEXT,
  product_url TEXT,
  image_rel_path TEXT,
  image_sha256 TEXT,
  algorithm_version TEXT NOT NULL,
  features_json TEXT,
  results_json TEXT NOT NULL DEFAULT '[]',
  compatibility_json TEXT NOT NULL DEFAULT '[]',
  assumed_wears INTEGER NOT NULL DEFAULT 30,
  verdict TEXT NOT NULL DEFAULT 'undecided',
  analysis_state TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX shopping_candidates_active_idx ON shopping_candidates (deleted_at, updated_at);
`,
  },
] as const;

const META_DDL = `CREATE TABLE IF NOT EXISTS __clothes_meta (key TEXT PRIMARY KEY NOT NULL, value INTEGER NOT NULL);`;

export interface QueryableMigrationAdapter extends MigrationAdapter {
  /** 返回单列整数值，无行时返回 null。 */
  scalarInt(sql: string): Promise<number | null> | number | null;
  /** 读取整型 PRAGMA（各后端用原生接口，避免 prepare 不支持 PRAGMA 的差异）。 */
  pragmaInt(name: string): Promise<number | null> | number | null;
  /** 字符串元数据读写（onboarding 进度等）。 */
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
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
  const pending = (options.migrations ?? MIGRATIONS).filter((m) => m.version > from);
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
