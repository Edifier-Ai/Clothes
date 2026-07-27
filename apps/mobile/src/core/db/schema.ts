import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
