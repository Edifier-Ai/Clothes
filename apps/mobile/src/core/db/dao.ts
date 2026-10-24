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
  PackingItemKind,
  PackingItemRow,
  PlanRow,
  TagKind,
  TripOutfitRow,
  TripRow,
  TripStatus,
  TripTemplateRow,
} from './schema';
import { listByStatus, type AnyDb } from './queue';

/**
 * 衣物 DAO：纯数据访问，事务边界明确，全异步。
 *
 * 通过显式 `GarmentDb` 抽象屏蔽后端差异：设备用 expo-sqlite + Drizzle（事务走
 * withTransactionAsync 串行队列，见 expoDb.ts），测试用 better-sqlite3 同步 API 包成 Promise。
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
  // 旅行（MVP-010）。
  insertTrip(row: TripRow): Promise<void>;
  getTrip(id: string): Promise<TripRow | null>;
  /** 活动旅行（排除墓碑），按 updatedAt 倒序。 */
  listActiveTrips(): Promise<TripRow[]>;
  updateTrip(id: string, fields: Partial<TripRow>): Promise<void>;
  getAllTrips(): Promise<TripRow[]>;
  deleteAllTrips(): Promise<void>;
  // 旅行内每日造型安排。
  insertTripOutfit(row: TripOutfitRow): Promise<void>;
  getTripOutfit(id: string): Promise<TripOutfitRow | null>;
  /** 某旅行的活动安排（排除墓碑），按 (date, createdAt) 升序。 */
  listActiveTripOutfits(tripId: string): Promise<TripOutfitRow[]>;
  updateTripOutfit(id: string, fields: Partial<TripOutfitRow>): Promise<void>;
  getAllTripOutfits(): Promise<TripOutfitRow[]>;
  deleteAllTripOutfits(): Promise<void>;
  // 打包清单项。
  insertPackingItem(row: PackingItemRow): Promise<void>;
  getPackingItem(id: string): Promise<PackingItemRow | null>;
  /** 某旅行的全部清单项（含已勾选/未勾选），按 (kind, ord) 升序。 */
  listPackingItemsByTrip(tripId: string): Promise<PackingItemRow[]>;
  updatePackingItem(id: string, fields: Partial<PackingItemRow>): Promise<void>;
  /** hard delete：garment 项不再被使用时移除；manual 项用户删除时移除。 */
  deletePackingItem(id: string): Promise<void>;
  /** 按 trip 清空（replaceAll 用）。 */
  deletePackingItemsByTrip(tripId: string): Promise<void>;
  getAllPackingItems(): Promise<PackingItemRow[]>;
  deleteAllPackingItems(): Promise<void>;
  // 旅行模板。
  insertTripTemplate(row: TripTemplateRow): Promise<void>;
  getTripTemplate(id: string): Promise<TripTemplateRow | null>;
  /** 活动模板（排除墓碑），按 updatedAt 倒序。 */
  listActiveTripTemplates(): Promise<TripTemplateRow[]>;
  updateTripTemplate(id: string, fields: Partial<TripTemplateRow>): Promise<void>;
  getAllTripTemplates(): Promise<TripTemplateRow[]>;
  deleteAllTripTemplates(): Promise<void>;
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
  /** MVP-010 起写入；v1–v7 旧镜像无此字段，回灌按空处理。 */
  trips?: TripRow[];
  tripOutfits?: TripOutfitRow[];
  packingItems?: PackingItemRow[];
  tripTemplates?: TripTemplateRow[];
}

export async function dumpAll(db: GarmentDb): Promise<GarmentDump> {
  const [garments, assets, tags, statusEvents, looks, lookItems, plans, trips, tripOutfits, packingItems, tripTemplates] = await Promise.all([
    db.listAllGarments(),
    db.getAllAssets(),
    db.getAllTags(),
    db.getAllStatusEvents(),
    db.getAllLooks(),
    db.getAllLookItems(),
    db.getAllPlans(),
    db.getAllTrips(),
    db.getAllTripOutfits(),
    db.getAllPackingItems(),
    db.getAllTripTemplates(),
  ]);
  return { garments, assets, tags, statusEvents, looks, lookItems, plans, trips, tripOutfits, packingItems, tripTemplates };
}

/** 用镜像全量替换当前数据（事务内清空再插入）。用于启动时从持久镜像回灌。 */
export async function replaceAll(db: GarmentDb, dump: GarmentDump): Promise<void> {
  await db.transaction((tx) => replaceAllInTransaction(tx, dump));
}

/** replaceAll 的事务内版本：调用方已开启事务（例如回灌时与其它表一起原子替换）。 */
export async function replaceAllInTransaction(tx: GarmentDbOps, dump: GarmentDump): Promise<void> {
  await tx.deleteAllTripTemplates();
  await tx.deleteAllPackingItems();
  await tx.deleteAllTripOutfits();
  await tx.deleteAllTrips();
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
  for (const tr of dump.trips ?? []) await tx.insertTrip(tr);
  for (const to of dump.tripOutfits ?? []) await tx.insertTripOutfit(to);
  for (const pi of dump.packingItems ?? []) await tx.insertPackingItem(pi);
  for (const tp of dump.tripTemplates ?? []) await tx.insertTripTemplate(tp);
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

/* ---------------- MVP-010：旅行（trips / trip_outfits / packing_items / trip_templates） ---------------- */

/** 旅行详情：行 + 解析后的活动列表 + 天气快照（均可空容错）。 */
export interface TripDetail {
  trip: TripRow;
  activities: { date: string; timeLabel: string; note?: string | null }[];
  weatherSnapshot: {
    fetchedAt: number;
    minTempC: number;
    maxTempC: number;
    conditionCode: string;
    provider: string;
    cityName: string;
  } | null;
}

/** tripOutfit 详情：行 + 快照单品 + 关联造型缺失标记（修复入口依据）。 */
export interface TripOutfitDetail {
  tripOutfit: TripOutfitRow;
  outfitGarmentIds: string[];
  /** 关联造型已墓碑/不存在 → true（安排仍由快照支撑展示）。 */
  lookMissing: boolean;
}

export interface CreateTripInput {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  timeZone: string;
  activities: readonly { date: string; timeLabel: string; note?: string | null }[];
  weatherSnapshot?: { fetchedAt: number; minTempC: number; maxTempC: number; conditionCode: string; provider: string; cityName: string } | null;
  status?: TripStatus;
  now: number;
}

export async function createTrip(db: GarmentDb, input: CreateTripInput): Promise<void> {
  const row: TripRow = {
    id: input.id,
    name: input.name,
    destination: input.destination,
    startDate: input.startDate,
    endDate: input.endDate,
    timeZone: input.timeZone,
    activitiesJson: JSON.stringify(input.activities),
    weatherSnapshotJson: input.weatherSnapshot ? JSON.stringify(input.weatherSnapshot) : null,
    status: input.status ?? 'planning',
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
  };
  await db.transaction(async (tx) => {
    await tx.insertTrip(row);
  });
}

export interface UpdateTripInput {
  name?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  timeZone?: string;
  activities?: readonly { date: string; timeLabel: string; note?: string | null }[];
  weatherSnapshot?: { fetchedAt: number; minTempC: number; maxTempC: number; conditionCode: string; provider: string; cityName: string } | null;
  status?: TripStatus;
}

export async function updateTripRow(db: GarmentDb, id: string, patch: UpdateTripInput, now: number): Promise<void> {
  const fields: Partial<TripRow> = { updatedAt: now };
  if (patch.name !== undefined) fields.name = patch.name;
  if (patch.destination !== undefined) fields.destination = patch.destination;
  if (patch.startDate !== undefined) fields.startDate = patch.startDate;
  if (patch.endDate !== undefined) fields.endDate = patch.endDate;
  if (patch.timeZone !== undefined) fields.timeZone = patch.timeZone;
  if (patch.activities !== undefined) fields.activitiesJson = JSON.stringify(patch.activities);
  if (patch.weatherSnapshot !== undefined) {
    fields.weatherSnapshotJson = patch.weatherSnapshot ? JSON.stringify(patch.weatherSnapshot) : null;
  }
  if (patch.status !== undefined) fields.status = patch.status;
  await db.transaction(async (tx) => {
    await tx.updateTrip(id, fields);
  });
}

/** 软删旅行：仅置墓碑，行保留。 */
export async function softDeleteTrip(db: GarmentDb, id: string, now: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.updateTrip(id, { deletedAt: now, updatedAt: now });
  });
}

/** activities_json 解析：坏 JSON/非数组按空数组（不崩）。 */
export function tripActivities(trip: TripRow): { date: string; timeLabel: string; note?: string | null }[] {
  try {
    const v: unknown = JSON.parse(trip.activitiesJson);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({
        date: typeof x.date === 'string' ? x.date : '',
        timeLabel: typeof x.timeLabel === 'string' ? x.timeLabel : '',
        note: typeof x.note === 'string' ? x.note : null,
      }))
      .filter((x) => x.date && x.timeLabel);
  } catch {
    return [];
  }
}

/** weather_snapshot_json 解析：坏 JSON 按无快照（不崩）。 */
export function tripWeatherSnapshot(trip: TripRow): {
  fetchedAt: number;
  minTempC: number;
  maxTempC: number;
  conditionCode: string;
  provider: string;
  cityName: string;
} | null {
  if (!trip.weatherSnapshotJson) return null;
  try {
    const v: unknown = JSON.parse(trip.weatherSnapshotJson);
    if (typeof v !== 'object' || v === null) return null;
    const o = v as Record<string, unknown>;
    return {
      fetchedAt: typeof o.fetchedAt === 'number' ? o.fetchedAt : 0,
      minTempC: typeof o.minTempC === 'number' ? o.minTempC : 0,
      maxTempC: typeof o.maxTempC === 'number' ? o.maxTempC : 0,
      conditionCode: typeof o.conditionCode === 'string' ? o.conditionCode : '',
      provider: typeof o.provider === 'string' ? o.provider : '',
      cityName: typeof o.cityName === 'string' ? o.cityName : '',
    };
  } catch {
    return null;
  }
}

/* ----- trip_outfits ----- */

export interface CreateTripOutfitInput {
  id: string;
  tripId: string;
  date: string;
  timeLabel: string;
  occasion?: string | null;
  lookId?: string | null;
  outfitGarmentIds: readonly string[];
  note?: string | null;
  now: number;
}

export async function createTripOutfit(db: GarmentDb, input: CreateTripOutfitInput): Promise<void> {
  const row: TripOutfitRow = {
    id: input.id,
    tripId: input.tripId,
    date: input.date,
    timeLabel: input.timeLabel,
    occasion: input.occasion ?? null,
    lookId: input.lookId ?? null,
    outfitJson: JSON.stringify(input.outfitGarmentIds),
    note: input.note ?? null,
    wornStatus: 'planned',
    wornCompletedAt: null,
    wornChangeNote: null,
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
  };
  await db.transaction(async (tx) => {
    await tx.insertTripOutfit(row);
  });
}

export interface UpdateTripOutfitInput {
  date?: string;
  timeLabel?: string;
  occasion?: string | null;
  lookId?: string | null;
  outfitGarmentIds?: readonly string[];
  note?: string | null;
  wornStatus?: TripOutfitRow['wornStatus'];
  wornCompletedAt?: number | null;
  wornChangeNote?: string | null;
}

export async function updateTripOutfitRow(
  db: GarmentDb,
  id: string,
  patch: UpdateTripOutfitInput,
  now: number,
): Promise<void> {
  const fields: Partial<TripOutfitRow> = { updatedAt: now };
  if (patch.date !== undefined) fields.date = patch.date;
  if (patch.timeLabel !== undefined) fields.timeLabel = patch.timeLabel;
  if (patch.occasion !== undefined) fields.occasion = patch.occasion;
  if (patch.lookId !== undefined) fields.lookId = patch.lookId;
  if (patch.outfitGarmentIds !== undefined) fields.outfitJson = JSON.stringify(patch.outfitGarmentIds);
  if (patch.note !== undefined) fields.note = patch.note;
  if (patch.wornStatus !== undefined) fields.wornStatus = patch.wornStatus;
  if (patch.wornCompletedAt !== undefined) fields.wornCompletedAt = patch.wornCompletedAt;
  if (patch.wornChangeNote !== undefined) fields.wornChangeNote = patch.wornChangeNote;
  await db.transaction(async (tx) => {
    await tx.updateTripOutfit(id, fields);
  });
}

/** 软删 tripOutfit：仅置墓碑，行保留；绝不动关联造型。 */
export async function softDeleteTripOutfit(db: GarmentDb, id: string, now: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.updateTripOutfit(id, { deletedAt: now, updatedAt: now });
  });
}

/** tripOutfit 快照解析：坏 JSON/非数组按空快照（不崩，行仍在）。 */
export function tripOutfitIds(to: TripOutfitRow): string[] {
  try {
    const v: unknown = JSON.parse(to.outfitJson);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/* ----- packing_items ----- */

export interface CreatePackingItemInput {
  id: string;
  tripId: string;
  kind: PackingItemKind;
  garmentId?: string | null;
  label: string;
  sourceCount?: number;
  sourceOutfitIds?: readonly string[];
  checked?: boolean;
  checkedAt?: number | null;
  ord: number;
  now: number;
}

export async function createPackingItem(db: GarmentDb, input: CreatePackingItemInput): Promise<void> {
  const row: PackingItemRow = {
    id: input.id,
    tripId: input.tripId,
    kind: input.kind,
    garmentId: input.garmentId ?? null,
    label: input.label,
    sourceCount: input.sourceCount ?? 0,
    sourceOutfitIdsJson: JSON.stringify(input.sourceOutfitIds ?? []),
    checked: input.checked ? 1 : 0,
    checkedAt: input.checkedAt ?? null,
    ord: input.ord,
    createdAt: input.now,
    updatedAt: input.now,
  };
  await db.transaction(async (tx) => {
    await tx.insertPackingItem(row);
  });
}

export interface UpdatePackingItemInput {
  label?: string;
  sourceCount?: number;
  sourceOutfitIds?: readonly string[];
  checked?: boolean;
  checkedAt?: number | null;
  ord?: number;
}

export async function updatePackingItemRow(
  db: GarmentDb,
  id: string,
  patch: UpdatePackingItemInput,
  now: number,
): Promise<void> {
  const fields: Partial<PackingItemRow> = { updatedAt: now };
  if (patch.label !== undefined) fields.label = patch.label;
  if (patch.sourceCount !== undefined) fields.sourceCount = patch.sourceCount;
  if (patch.sourceOutfitIds !== undefined) fields.sourceOutfitIdsJson = JSON.stringify(patch.sourceOutfitIds);
  if (patch.checked !== undefined) fields.checked = patch.checked ? 1 : 0;
  if (patch.checkedAt !== undefined) fields.checkedAt = patch.checkedAt;
  if (patch.ord !== undefined) fields.ord = patch.ord;
  await db.transaction(async (tx) => {
    await tx.updatePackingItem(id, fields);
  });
}

/** hard delete packing_item（garment 项不再被使用 / manual 项用户删除）。 */
export async function deletePackingItemRow(db: GarmentDb, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.deletePackingItem(id);
  });
}

/** packing_item.source_outfit_ids_json 解析：坏 JSON 按空数组。 */
export function packingItemSourceOutfitIds(item: PackingItemRow): string[] {
  try {
    const v: unknown = JSON.parse(item.sourceOutfitIdsJson);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/* ----- trip_templates ----- */

export interface CreateTripTemplateInput {
  id: string;
  name: string;
  sourceTripId?: string | null;
  items: readonly { kind: PackingItemKind; label: string; garmentId?: string | null }[];
  now: number;
}

export async function createTripTemplate(db: GarmentDb, input: CreateTripTemplateInput): Promise<void> {
  const row: TripTemplateRow = {
    id: input.id,
    name: input.name,
    sourceTripId: input.sourceTripId ?? null,
    itemsJson: JSON.stringify(input.items),
    createdAt: input.now,
    updatedAt: input.now,
    deletedAt: null,
  };
  await db.transaction(async (tx) => {
    await tx.insertTripTemplate(row);
  });
}

/** 软删模板：仅置墓碑，行保留。 */
export async function softDeleteTripTemplate(db: GarmentDb, id: string, now: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.updateTripTemplate(id, { deletedAt: now, updatedAt: now });
  });
}

/** items_json 解析：坏 JSON 按空数组。 */
export function tripTemplateItems(t: TripTemplateRow): { kind: PackingItemKind; label: string; garmentId?: string | null }[] {
  try {
    const v: unknown = JSON.parse(t.itemsJson);
    if (!Array.isArray(v)) return [];
    return v
      .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
      .map((x) => ({
        kind: (typeof x.kind === 'string' && (x.kind === 'garment' || x.kind === 'manual') ? x.kind : 'manual') as PackingItemKind,
        label: typeof x.label === 'string' ? x.label : '',
        garmentId: typeof x.garmentId === 'string' ? x.garmentId : null,
      }))
      .filter((x) => x.label);
  } catch {
    return [];
  }
}
