import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * 衣物领域 schema（Drizzle ORM over sqlite）。
 *
 * 设计依据：PRODUCT_PLAN §9.4 + TECH_STACK §3。
 * - ID 为 UUIDv7 文本主键。
 * - 数据库只存图片路径/哈希/尺寸，不存 Base64。
 * - 删除采用可恢复墓碑（deleted_at），不物理删除行与文件。
 * - 低置信标签单独成行带 confidence，便于「只确认低置信字段」。
 */

export const garments = sqliteTable(
  'garments',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    category: text('category').notNull(),
    status: text('status').notNull().default('clean'),
    priceMinor: integer('price_minor'),
    currency: text('currency'),
    purchaseDate: text('purchase_date'),
    archivedAt: integer('archived_at'),
    deletedAt: integer('deleted_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    activeIdx: index('garments_active_idx').on(t.deletedAt, t.archivedAt),
  }),
);

export const garmentAssets = sqliteTable(
  'garment_assets',
  {
    id: text('id').primaryKey(),
    garmentId: text('garment_id')
      .notNull()
      .references(() => garments.id, { onDelete: 'cascade' }),
    /** App 私有目录内相对路径，如 originals/<id>.jpg */
    originalRelPath: text('original_rel_path').notNull(),
    sha256: text('sha256').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    bytes: integer('bytes').notNull(),
    mimeType: text('mime_type').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    /** 哈希索引供判重查询；唯一性由用例层在未删除集合上判定，便于软删除与「确认继续」。 */
    hashIdx: index('garment_assets_sha256_idx').on(t.sha256),
    garmentIdx: index('garment_assets_garment_idx').on(t.garmentId),
  }),
);

export const garmentTags = sqliteTable(
  'garment_tags',
  {
    id: text('id').primaryKey(),
    garmentId: text('garment_id')
      .notNull()
      .references(() => garments.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // color | season | occasion | material | formality
    value: text('value').notNull(),
    confidence: real('confidence').notNull().default(1),
  },
  (t) => ({
    garmentKindIdx: index('garment_tags_garment_kind_idx').on(t.garmentId, t.kind),
  }),
);

/** 抠图任务持久队列（MVP-003）。状态机：pending→running→succeeded/failed/cancelled。 */
export const cutoutJobs = sqliteTable(
  'cutout_jobs',
  {
    id: text('id').primaryKey(),
    garmentId: text('garment_id')
      .notNull()
      .references(() => garments.id, { onDelete: 'cascade' }),
    status: text('status').notNull(), // pending|running|succeeded|failed|cancelled
    attempts: integer('attempts').notNull().default(0),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    /** 源图暂存路径（处理成功后清空） */
    sourceStagedPath: text('source_staged_path'),
    originalRelPath: text('original_rel_path'),
    maskRelPath: text('mask_rel_path'),
    previewRelPath: text('preview_rel_path'),
    thumbnailRelPath: text('thumbnail_rel_path'),
    width: integer('width'),
    height: integer('height'),
    sha256: text('sha256'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    statusIdx: index('cutout_jobs_status_idx').on(t.status, t.createdAt),
    garmentIdx: index('cutout_jobs_garment_idx').on(t.garmentId),
  }),
);

/** 修边操作栈（MVP-003）：可序列化、可重建蒙版、支持撤销/重做。 */
export const maskStrokes = sqliteTable(
  'mask_strokes',
  {
    id: text('id').primaryKey(),
    garmentId: text('garment_id')
      .notNull()
      .references(() => garments.id, { onDelete: 'cascade' }),
    op: text('op').notNull(), // erase | restore
    /** JSON: number[] 归一化点 [x0,y0,x1,y1,...] 0..1 */
    pointsJson: text('points_json').notNull(),
    brushSize: real('brush_size').notNull(),
    ord: integer('ord').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    garmentOrdIdx: index('mask_strokes_garment_ord_idx').on(t.garmentId, t.ord),
  }),
);

export type GarmentRow = typeof garments.$inferSelect;
export type GarmentAssetRow = typeof garmentAssets.$inferSelect;
export type GarmentTagRow = typeof garmentTags.$inferSelect;

export type GarmentCategory =
  | 'top'
  | 'bottom'
  | 'dress'
  | 'shoes'
  | 'outerwear'
  | 'accessory'
  | 'other';

export type GarmentStatus = 'clean' | 'worn' | 'laundry' | 'dryclean' | 'loaned' | 'wishlist';

export const TAG_KINDS = ['color', 'season', 'occasion', 'material', 'formality'] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export type CutoutJobRow = typeof cutoutJobs.$inferSelect;
export type MaskStrokeRow = typeof maskStrokes.$inferSelect;

/**
 * 推荐结果持久化（MVP-005）。
 * - recommendations：一次推荐快照（输入摘要 + 选中搭配 + 总分）。
 * - recommendation_items：推荐中每个槽位的衣物（top/bottom/shoes/outerwear?）。
 * - reason_codes：命中的理由码（与前端展示一一对应，可追溯）。
 */
export const recommendations = sqliteTable('recommendations', {
  id: text('id').primaryKey(),
  /** YYYY-MM-DD，用于幂等与「今日推荐」查询。 */
  date: text('date').notNull(),
  /** 输入快照（衣物 id 列表 + 场景 + 天气），JSON。 */
  inputJson: text('input_json').notNull(),
  /** 选中搭配，JSON（Outfit 结构）。 */
  outfitJson: text('outfit_json').notNull(),
  totalScore: real('total_score').notNull(),
  occasion: text('occasion'),
  weatherTempC: real('weather_temp_c'),
  createdAt: integer('created_at').notNull(),
});

export const recommendationItems = sqliteTable('recommendation_items', {
  id: text('id').primaryKey(),
  recommendationId: text('recommendation_id')
    .notNull()
    .references(() => recommendations.id, { onDelete: 'cascade' }),
  garmentId: text('garment_id')
    .notNull()
    .references(() => garments.id, { onDelete: 'cascade' }),
  slot: text('slot').notNull(), // top | bottom | shoes | outerwear
  ord: integer('ord').notNull(),
});

export const reasonCodes = sqliteTable('reason_codes', {
  id: text('id').primaryKey(),
  recommendationId: text('recommendation_id')
    .notNull()
    .references(() => recommendations.id, { onDelete: 'cascade' }),
  code: text('code').notNull(),
  ord: integer('ord').notNull(),
});

/**
 * 穿着记录（MVP-005）。
 * - wear_logs：一次实际穿着（场景、时间、舒适度反馈）。
 * - wear_log_items：该次穿着的衣物明细。
 * 幂等：recommendation_id + date 唯一（同一天同一推荐只记一次）。
 */
export const wearLogs = sqliteTable('wear_logs', {
  id: text('id').primaryKey(),
  recommendationId: text('recommendation_id').notNull(),
  /** YYYY-MM-DD，与 recommendation.date 对齐。 */
  date: text('date').notNull(),
  occasion: text('occasion'),
  /** good | ok | bad | null（未填） */
  comfort: text('comfort'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  recDateUq: index('wear_logs_rec_date_idx').on(t.recommendationId, t.date),
}));

export const wearLogItems = sqliteTable('wear_log_items', {
  id: text('id').primaryKey(),
  wearLogId: text('wear_log_id')
    .notNull()
    .references(() => wearLogs.id, { onDelete: 'cascade' }),
  garmentId: text('garment_id')
    .notNull()
    .references(() => garments.id, { onDelete: 'cascade' }),
  slot: text('slot').notNull(),
  ord: integer('ord').notNull(),
});

/** 推荐交互反馈（MVP-006）：本地幂等事件，供后续规则软重排。 */
export const feedbackEvents = sqliteTable('feedback_events', {
  id: text('id').primaryKey(),
  idempotencyKey: text('idempotency_key').notNull(),
  recommendationId: text('recommendation_id').notNull(),
  eventType: text('event_type').notNull(), // accept | replace | skip | mode
  slot: text('slot'),
  beforeItemId: text('before_item_id'),
  afterItemId: text('after_item_id'),
  skipReason: text('skip_reason'),
  mode: text('mode'),
  createdAt: integer('created_at').notNull(),
}, (t) => ({
  idempotencyUq: uniqueIndex('feedback_events_idempotency_uq').on(t.idempotencyKey),
  recIdx: index('feedback_events_rec_idx').on(t.recommendationId, t.createdAt),
}));

/** 按城市保存的天气窗口；过期缓存仍可在离线时明确降级使用。 */
export const weatherCache = sqliteTable('weather_cache', {
  cityId: text('city_id').primaryKey(),
  cityName: text('city_name').notNull(),
  latitude: real('latitude').notNull(),
  longitude: real('longitude').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
  windowStart: integer('window_start').notNull(),
  windowEnd: integer('window_end').notNull(),
  minTempC: real('min_temp_c').notNull(),
  maxTempC: real('max_temp_c').notNull(),
  conditionCode: text('condition_code').notNull(),
  provider: text('provider').notNull(),
});

export type RecommendationRow = typeof recommendations.$inferSelect;
export type RecommendationItemRow = typeof recommendationItems.$inferSelect;
export type ReasonCodeRow = typeof reasonCodes.$inferSelect;
export type WearLogRow = typeof wearLogs.$inferSelect;
export type WearLogItemRow = typeof wearLogItems.$inferSelect;
export type FeedbackEventRow = typeof feedbackEvents.$inferSelect;
export type WeatherCacheRow = typeof weatherCache.$inferSelect;
