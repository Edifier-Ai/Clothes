import type {
  GarmentAssetRow,
  GarmentCategory,
  GarmentRow,
  GarmentStatus,
  GarmentStatusEventRow,
  GarmentTagRow,
  LookItemRow,
  LookMode,
  LookRow,
  LookSlot,
  PlanRow,
  TagKind,
} from './schema';
import { listByStatus, type AnyDb } from './queue';

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
  /** 状态历史（MVP-007）：追加事件；按衣物读取（changedAt 升序）。 */
  insertStatusEvent(row: GarmentStatusEventRow): Promise<void>;
  listStatusEventsByGarment(id: string): Promise<GarmentStatusEventRow[]>;
  getAllStatusEvents(): Promise<GarmentStatusEventRow[]>;
  deleteAllStatusEvents(): Promise<void>;
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
  // 造型（MVP-008）。
  insertLook(row: LookRow): Promise<void>;
  insertLookItems(rows: LookItemRow[]): Promise<void>;
  /** 按 id 读取（含墓碑；业务层自行判定 deletedAt）。 */
  getLook(id: string): Promise<LookRow | null>;
  /** 活动造型（排除墓碑），updatedAt 倒序。 */
  listLooks(): Promise<LookRow[]>;
  /** 某造型的明细，按 (z_index, ord) 升序（即绘制顺序）。 */
  getLookItems(lookId: string): Promise<LookItemRow[]>;
  updateLook(id: string, fields: Partial<LookRow>): Promise<void>;
  /** 整体替换某造型明细前的清空（重建/upsert 用）。 */
  deleteLookItemsByLook(lookId: string): Promise<void>;
  getAllLooks(): Promise<LookRow[]>;
  getAllLookItems(): Promise<LookItemRow[]>;
  deleteAllLooks(): Promise<void>;
  deleteAllLookItems(): Promise<void>;
  // 计划（MVP-009）。
  insertPlan(row: PlanRow): Promise<void>;
  /** 按 id 读取（含墓碑；业务层自行判定 deletedAt）。 */
  getPlan(id: string): Promise<PlanRow | null>;
  /** 活动计划（排除墓碑），按 (date, createdAt) 升序。 */
  listActivePlans(): Promise<PlanRow[]>;
  updatePlan(id: string, fields: Partial<PlanRow>): Promise<void>;
  getAllPlans(): Promise<PlanRow[]>;
  deleteAllPlans(): Promise<void>;
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
  /** MVP-007 起写入；v1–v4 旧镜像无此字段，回灌按空处理。 */
  statusEvents?: GarmentStatusEventRow[];
  /** MVP-008 起写入；v1–v5 旧镜像无此字段，回灌按空处理。 */
  looks?: LookRow[];
  lookItems?: LookItemRow[];
  /** MVP-009 起写入；v1–v6 旧镜像无此字段，回灌按空处理。 */
  plans?: PlanRow[];
}

export async function dumpAll(db: GarmentDb): Promise<GarmentDump> {
  const [garments, assets, tags, statusEvents, looks, lookItems, plans] = await Promise.all([
    db.listAllGarments(),
    db.getAllAssets(),
    db.getAllTags(),
    db.getAllStatusEvents(),
    db.getAllLooks(),
    db.getAllLookItems(),
    db.getAllPlans(),
  ]);
  return { garments, assets, tags, statusEvents, looks, lookItems, plans };
}

/** 用镜像全量替换当前数据（事务内清空再插入）。用于启动时从持久镜像回灌。 */
export async function replaceAll(db: GarmentDb, dump: GarmentDump): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.deleteAllPlans();
    await tx.deleteAllLookItems();
    await tx.deleteAllLooks();
    await tx.deleteAllStatusEvents();
    await tx.deleteAllTags();
    await tx.deleteAllAssets();
    await tx.deleteAllGarments();
    for (const g of dump.garments) await tx.insertGarment(g);
    for (const a of dump.assets) await tx.insertAsset(a);
    if (dump.tags.length > 0) await tx.insertTags(dump.tags);
    for (const e of dump.statusEvents ?? []) await tx.insertStatusEvent(e);
    for (const l of dump.looks ?? []) await tx.insertLook(l);
    if ((dump.lookItems ?? []).length > 0) await tx.insertLookItems(dump.lookItems ?? []);
    for (const p of dump.plans ?? []) await tx.insertPlan(p);
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

export interface WardrobeListItem {
  garment: GarmentRow;
  /** 网格缩略图相对路径：最新成功抠图任务的缩略图/预览优先，否则资产原图，均无则 null。 */
  imageRelPath: string | null;
}

/**
 * 衣橱网格数据源：活动衣物 + 展示图路径。
 * 缩略图/预览存于 cutout_jobs（成功任务），原图存于 garment_assets；
 * 同衣物多次成功时 listByStatus 按 createdAt 升序，Map 后写覆盖先写 → 取最新。
 */
export async function listActiveGarmentsWithThumbs(
  db: GarmentDb,
  queueDb: AnyDb,
): Promise<WardrobeListItem[]> {
  const [rows, assets, jobs] = await Promise.all([
    db.listActiveGarments(),
    db.getAllAssets(),
    listByStatus(queueDb, 'succeeded'),
  ]);
  const assetByGarment = new Map(assets.map((a) => [a.garmentId, a]));
  const jobByGarment = new Map(jobs.map((j) => [j.garmentId, j]));
  return rows.map((garment) => {
    const job = jobByGarment.get(garment.id);
    const imageRelPath =
      job?.thumbnailRelPath ??
      job?.previewRelPath ??
      assetByGarment.get(garment.id)?.originalRelPath ??
      null;
    return { garment, imageRelPath };
  });
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

/* ---------------- MVP-008：造型（looks / look_items） ---------------- */

/** 造型明细输入：不含 lookId（由 createLook/updateLookRow 归属）。 */
export interface LookItemInput {
  id: string;
  garmentId: string;
  /** 快速模式槽位；canvas 模式为 null。 */
  slot: LookSlot | null;
  /** 归一化坐标：x/y ∈ [0,1] 相对画布宽/高；scale 基准为相对画布宽度比例；rotation 弧度。 */
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
  ord: number;
}

export interface CreateLookInput {
  id: string;
  name: string;
  mode: LookMode;
  /** 变体关联原造型；克隆/新建为 null。 */
  sourceLookId?: string | null;
  /** 派生封面相对路径（可由事实数据重建，允许为空）。 */
  coverRelPath?: string | null;
  items: readonly LookItemInput[];
  now: number;
}

export interface LookDetail {
  look: LookRow;
  /** 按 (z_index, ord) 升序（绘制顺序）。 */
  items: LookItemRow[];
}

/** 事务内写入 look + items：任一失败整体回滚，不留半套造型。 */
export async function createLook(db: GarmentDb, input: CreateLookInput): Promise<void> {
  const { items, now, ...rest } = input;
  const look: LookRow = {
    ...rest,
    sourceLookId: rest.sourceLookId ?? null,
    coverRelPath: rest.coverRelPath ?? null,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const itemRows: LookItemRow[] = items.map((i) => ({ ...i, lookId: input.id }));
  await db.transaction(async (tx) => {
    await tx.insertLook(look);
    if (itemRows.length > 0) await tx.insertLookItems(itemRows);
  });
}

/** 造型详情；墓碑视为不存在（返回 null），但行与明细仍保留。 */
export async function getLookWithItems(db: GarmentDb, id: string): Promise<LookDetail | null> {
  const look = await db.getLook(id);
  if (!look || look.deletedAt != null) return null;
  const items = await db.getLookItems(id);
  return { look, items };
}

/** 活动造型列表（排除墓碑，updatedAt 倒序），各带明细。 */
export async function listLooksWithItems(db: GarmentDb): Promise<LookDetail[]> {
  const looks = await db.listLooks();
  return Promise.all(looks.map(async (look) => ({ look, items: await db.getLookItems(look.id) })));
}

export interface UpdateLookInput {
  name?: string;
  coverRelPath?: string | null;
  /** 提供时整体替换明细（清空后重插，同事务）。 */
  items?: readonly LookItemInput[];
}

export async function updateLookRow(
  db: GarmentDb,
  id: string,
  patch: UpdateLookInput,
  now: number,
): Promise<void> {
  await db.transaction(async (tx) => {
    const fields: Partial<LookRow> = { updatedAt: now };
    if (patch.name !== undefined) fields.name = patch.name;
    if (patch.coverRelPath !== undefined) fields.coverRelPath = patch.coverRelPath;
    await tx.updateLook(id, fields);
    if (patch.items !== undefined) {
      await tx.deleteLookItemsByLook(id);
      const rows: LookItemRow[] = patch.items.map((i) => ({ ...i, lookId: id }));
      if (rows.length > 0) await tx.insertLookItems(rows);
    }
  });
}

/** 软删除造型：仅置墓碑，行与明细保留（镜像/导出仍需完整数据）。 */
export async function softDeleteLook(db: GarmentDb, id: string, now: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.updateLook(id, { deletedAt: now, updatedAt: now });
  });
}

/* ---------------- MVP-009：计划（plans） ---------------- */

export interface CreatePlanInput {
  id: string;
  /** YYYY-MM-DD 当地日期字面量。 */
  date: string;
  timeLabel: string;
  occasion?: string | null;
  lookId?: string | null;
  /** 单品 id 快照（关联造型保存时已展开）。 */
  outfitGarmentIds: readonly string[];
  note?: string | null;
  now: number;
}

/** 计划详情：行 + 快照单品 + 关联造型缺失标记（修复入口依据）。 */
export interface PlanDetail {
  plan: PlanRow;
  outfitGarmentIds: string[];
  /** 关联造型已墓碑/不存在 → true（计划仍由快照支撑展示）。 */
  lookMissing: boolean;
}

export async function createPlan(db: GarmentDb, input: CreatePlanInput): Promise<void> {
  const row: PlanRow = {
    id: input.id,
    date: input.date,
    timeLabel: input.timeLabel,
    occasion: input.occasion ?? null,
    lookId: input.lookId ?? null,
    outfitJson: JSON.stringify(input.outfitGarmentIds),
    note: input.note ?? null,
    status: 'planned',
    completedAt: null,
    changeNote: null,
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
  };
  await db.transaction(async (tx) => {
    await tx.insertPlan(row);
  });
}

export interface UpdatePlanInput {
  date?: string;
  timeLabel?: string;
  occasion?: string | null;
  lookId?: string | null;
  outfitGarmentIds?: readonly string[];
  note?: string | null;
  status?: PlanRow['status'];
  completedAt?: number | null;
  changeNote?: string | null;
}

export async function updatePlanRow(db: GarmentDb, id: string, patch: UpdatePlanInput, now: number): Promise<void> {
  const fields: Partial<PlanRow> = { updatedAt: now };
  if (patch.date !== undefined) fields.date = patch.date;
  if (patch.timeLabel !== undefined) fields.timeLabel = patch.timeLabel;
  if (patch.occasion !== undefined) fields.occasion = patch.occasion;
  if (patch.lookId !== undefined) fields.lookId = patch.lookId;
  if (patch.outfitGarmentIds !== undefined) fields.outfitJson = JSON.stringify(patch.outfitGarmentIds);
  if (patch.note !== undefined) fields.note = patch.note;
  if (patch.status !== undefined) fields.status = patch.status;
  if (patch.completedAt !== undefined) fields.completedAt = patch.completedAt;
  if (patch.changeNote !== undefined) fields.changeNote = patch.changeNote;
  await db.transaction(async (tx) => {
    await tx.updatePlan(id, fields);
  });
}

/** 软删除计划：仅置墓碑，行保留；绝不动关联造型。 */
export async function softDeletePlan(db: GarmentDb, id: string, now: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.updatePlan(id, { deletedAt: now, updatedAt: now });
  });
}

/** 快照解析：坏 JSON/非数组按空快照（不崩，计划行仍在）。 */
export function planOutfitIds(plan: PlanRow): string[] {
  try {
    const v: unknown = JSON.parse(plan.outfitJson);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
