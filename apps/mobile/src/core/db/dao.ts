import type {
  GarmentAssetRow,
  GarmentCategory,
  GarmentRow,
  GarmentStatus,
  GarmentTagRow,
  TagKind,
} from './schema';

/**
 * 衣物 DAO：纯数据访问，事务边界明确，全异步。
 *
 * 通过显式 `GarmentDb` 抽象屏蔽后端差异：设备用 expo-sqlite 异步 API + Drizzle
 * （withTransactionAsync 保证原子落盘），测试用 better-sqlite3 同步 API 包成 Promise。
 * 二者共享同一 schema/SQL 语义。
 */

export interface TagInput {
  kind: TagKind;
  value: string;
  confidence?: number;
}

export interface CreateGarmentInput {
  id: string;
  name: string;
  category: GarmentCategory;
  status?: GarmentStatus;
  priceMinor?: number | null;
  currency?: string | null;
  purchaseDate?: string | null;
  asset: {
    id: string;
    originalRelPath: string;
    sha256: string;
    width: number;
    height: number;
    bytes: number;
    mimeType: string;
  };
  tags?: readonly TagInput[];
  now: number;
}

export interface UpdateGarmentInput {
  name?: string;
  category?: GarmentCategory;
  status?: GarmentStatus;
  priceMinor?: number | null;
  currency?: string | null;
  purchaseDate?: string | null;
  tags?: readonly TagInput[];
}

export interface GarmentDetail {
  garment: GarmentRow;
  asset: GarmentAssetRow;
  tags: GarmentTagRow[];
}

/**
 * 后端无关的异步 DB 接口。`tx` 内为同一事务上下文，其方法与外层形状一致，
 * 由实现保证原子提交/回滚。
 */
export interface GarmentDbOps {
  insertGarment(row: GarmentRow): Promise<void>;
  insertAsset(row: GarmentAssetRow): Promise<void>;
  insertTags(rows: GarmentTagRow[]): Promise<void>;
  updateGarment(id: string, fields: Partial<GarmentRow>): Promise<void>;
  deleteTagsByGarment(id: string): Promise<void>;
  updateDeletedAt(id: string, deletedAt: number | null, updatedAt: number): Promise<void>;
  getGarment(id: string): Promise<GarmentRow | null>;
  getActiveGarment(id: string): Promise<GarmentRow | null>;
  getAssetByGarment(id: string): Promise<GarmentAssetRow | null>;
  getTagsByGarment(id: string): Promise<GarmentTagRow[]>;
  listActiveGarments(): Promise<GarmentRow[]>;
  findAssetByHash(hash: string): Promise<GarmentAssetRow | null>;
  // 镜像/持久兜底（B-4 设备适配）所需的全量读写与元数据。
  listAllGarments(): Promise<GarmentRow[]>;
  getAllAssets(): Promise<GarmentAssetRow[]>;
  getAllTags(): Promise<GarmentTagRow[]>;
  deleteAllTags(): Promise<void>;
  deleteAllAssets(): Promise<void>;
  deleteAllGarments(): Promise<void>;
  getMetaInt(key: string): Promise<number | null>;
  setMetaInt(key: string, value: number): Promise<void>;
  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string): Promise<void>;
}

export interface GarmentDb extends GarmentDbOps {
  transaction: <T>(fn: (tx: GarmentDbOps) => Promise<T>) => Promise<T>;
}

export interface GarmentDump {
  garments: GarmentRow[];
  assets: GarmentAssetRow[];
  tags: GarmentTagRow[];
}

export async function dumpAll(db: GarmentDb): Promise<GarmentDump> {
  const [garments, assets, tags] = await Promise.all([
    db.listAllGarments(),
    db.getAllAssets(),
    db.getAllTags(),
  ]);
  return { garments, assets, tags };
}

/** 用镜像全量替换当前数据（事务内清空再插入）。用于启动时从持久镜像回灌。 */
export async function replaceAll(db: GarmentDb, dump: GarmentDump): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.deleteAllTags();
    await tx.deleteAllAssets();
    await tx.deleteAllGarments();
    for (const g of dump.garments) await tx.insertGarment(g);
    for (const a of dump.assets) await tx.insertAsset(a);
    if (dump.tags.length > 0) await tx.insertTags(dump.tags);
  });
}

/** 记录数据最后修改时间，供镜像新鲜度比较。 */
export async function bumpDataVersion(db: GarmentDb, now: number): Promise<void> {
  await db.setMetaInt('data_updated_at', now);
}

export async function createGarment(db: GarmentDb, input: CreateGarmentInput): Promise<void> {
  const { asset, tags, now, ...rest } = input;
  const garment: GarmentRow = {
    ...rest,
    status: rest.status ?? 'clean',
    priceMinor: rest.priceMinor ?? null,
    currency: rest.currency ?? null,
    purchaseDate: rest.purchaseDate ?? null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const assetRow: GarmentAssetRow = { ...asset, garmentId: input.id, createdAt: now };
  const tagRows: GarmentTagRow[] = (tags ?? []).map((t, i) => ({
    id: `${input.id}-tag-${i}`,
    garmentId: input.id,
    kind: t.kind,
    value: t.value,
    confidence: t.confidence ?? 1,
  }));
  await db.transaction(async (tx) => {
    await tx.insertGarment(garment);
    await tx.insertAsset(assetRow);
    if (tagRows.length > 0) await tx.insertTags(tagRows);
  });
}

export async function getGarment(db: GarmentDb, id: string): Promise<GarmentDetail | null> {
  const garment = await db.getActiveGarment(id);
  if (!garment) return null;
  const asset = await db.getAssetByGarment(id);
  if (!asset) return null;
  const tags = await db.getTagsByGarment(id);
  return { garment, asset, tags };
}

export async function listActiveGarments(db: GarmentDb): Promise<GarmentRow[]> {
  return db.listActiveGarments();
}

export async function findActiveByHash(db: GarmentDb, sha256: string): Promise<GarmentDetail | null> {
  const asset = await db.findAssetByHash(sha256);
  if (!asset) return null;
  const g = await db.getActiveGarment(asset.garmentId);
  if (!g) return null;
  return getGarment(db, asset.garmentId);
}

export async function updateGarment(
  db: GarmentDb,
  id: string,
  patch: UpdateGarmentInput,
  now: number,
): Promise<boolean> {
  await db.transaction(async (tx) => {
    const fields: Partial<GarmentRow> = { updatedAt: now };
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.category !== undefined) fields.category = patch.category;
    if (patch.status !== undefined) fields.status = patch.status;
    if (patch.priceMinor !== undefined) fields.priceMinor = patch.priceMinor;
    if (patch.currency !== undefined) fields.currency = patch.currency;
    if (patch.purchaseDate !== undefined) fields.purchaseDate = patch.purchaseDate;
    await tx.updateGarment(id, fields);
    if (patch.tags !== undefined) {
      await tx.deleteTagsByGarment(id);
      if (patch.tags.length > 0) {
        await tx.insertTags(
          patch.tags.map((t, i) => ({
            id: `${id}-tag-${i}`,
            garmentId: id,
            kind: t.kind,
            value: t.value,
            confidence: t.confidence ?? 1,
          })),
        );
      }
    }
  });
  return true;
}

export async function softDeleteGarment(db: GarmentDb, id: string, now: number): Promise<boolean> {
  await db.transaction(async (tx) => {
    await tx.updateDeletedAt(id, now, now);
  });
  return true;
}

export async function restoreGarment(db: GarmentDb, id: string, now: number): Promise<boolean> {
  const row = await db.getGarment(id);
  if (!row || row.deletedAt == null) return false;
  await db.transaction(async (tx) => {
    await tx.updateDeletedAt(id, null, now);
  });
  return true;
}
