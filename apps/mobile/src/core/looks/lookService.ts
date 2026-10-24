import { createServiceRuntime } from '../db/serviceRuntime';
import {
  createLook,
  getLookWithItems,
  listLooksWithItems,
  softDeleteLook,
  updateLookRow,
  type CreateLookInput,
  type GarmentDb,
  type LookDetail,
  type LookItemInput,
} from '../db/dao';
import type { LookMode, LookSlot } from '../db/schema';
import { uuidv7 } from '../id/uuidv7';
import { listByStatus } from '../db/queue';
import { buildCoverSpec, type CoverSpec } from './cover';
import { cloneLook, createVariant, type DerivedLook, type VariantChange } from './lookFactory';
import { parseDraft, serializeDraft, type LookDraft } from './draft';

/**
 * 造型服务（MVP-008）。两层结构：
 * - `*Core(db, …)`：可注入持久逻辑，参数为 GarmentDb——设备单例与 host 测试
 *   共用同一代码路径（host 用 better-sqlite3 直测，不 mock 被测核心）。
 * - 单例 API（saveLook/listLooks/…）：仿 garments/service，readyDb + 写后
 *   writeMirror 落持久镜像。
 *
 * 草稿走 dao meta 键 `look_draft`：meta 不在镜像字段内，故草稿操作不写镜像
 * （崩溃强杀下草稿可丢，正式造型绝不丢——草稿本就允许丢）。
 */

/** 草稿 meta 键（dao __clothes_meta）。 */
export const DRAFT_META_KEY = 'look_draft';

export interface SaveLookInput {
  /** 提供且已存在 → 更新（整体替换 items）；否则新建（缺省时生成 uuidv7）。 */
  id?: string;
  name: string;
  mode: LookMode;
  sourceLookId?: string | null;
  coverRelPath?: string | null;
  items: readonly LookItemInput[];
}

/* ---------------- 可注入 Core（host 测试与设备单例共用） ---------------- */

/** upsert 造型：事务内 look + items；返回保存后的详情。 */
export async function saveLookCore(db: GarmentDb, input: SaveLookInput): Promise<LookDetail> {
  const now = Date.now();
  const existing = input.id ? await db.getLook(input.id) : null;
  const id = input.id ?? uuidv7();
  if (existing && existing.deletedAt == null) {
    await updateLookRow(
      db,
      id,
      { name: input.name, coverRelPath: input.coverRelPath ?? existing.coverRelPath, items: input.items },
      now,
    );
  } else {
    const create: CreateLookInput = {
      id,
      name: input.name,
      mode: input.mode,
      sourceLookId: input.sourceLookId ?? existing?.sourceLookId ?? null,
      coverRelPath: input.coverRelPath ?? null,
      items: input.items,
      now,
    };
    await createLook(db, create);
  }
  const detail = await getLookWithItems(db, id);
  if (!detail) throw new Error(`saveLook succeeded but detail missing: ${id}`);
  return detail;
}

export async function getLookDetailCore(db: GarmentDb, id: string): Promise<LookDetail | null> {
  return getLookWithItems(db, id);
}

export async function listLooksCore(db: GarmentDb): Promise<LookDetail[]> {
  return listLooksWithItems(db);
}

/** 软删造型（墓碑，行与明细保留）。 */
export async function deleteLookCore(db: GarmentDb, id: string): Promise<void> {
  await softDeleteLook(db, id, Date.now());
}

export async function saveDraftCore(db: GarmentDb, draft: LookDraft): Promise<void> {
  await db.setMeta(DRAFT_META_KEY, serializeDraft(draft));
}

/** 读取草稿；无草稿或内容损坏（坏 JSON/缺字段）返回 null。 */
export async function loadDraftCore(db: GarmentDb): Promise<LookDraft | null> {
  const text = await db.getMeta(DRAFT_META_KEY);
  if (!text) return null;
  return parseDraft(text);
}

export async function clearDraftCore(db: GarmentDb): Promise<void> {
  await db.setMeta(DRAFT_META_KEY, '');
}

function derivedToCreate(d: DerivedLook): CreateLookInput {
  return {
    id: d.look.id,
    name: d.look.name,
    mode: d.look.mode as LookMode,
    sourceLookId: d.look.sourceLookId,
    coverRelPath: d.look.coverRelPath,
    items: d.items.map((it) => ({
      id: it.id,
      garmentId: it.garmentId,
      slot: it.slot as LookSlot | null,
      x: it.x,
      y: it.y,
      scale: it.scale,
      rotation: it.rotation,
      zIndex: it.zIndex,
      ord: it.ord,
    })),
    now: d.look.createdAt,
  };
}

/** 变体：只替换指定单品并保留与原造型的关联；原造型不变。 */
export async function createVariantLookCore(
  db: GarmentDb,
  lookId: string,
  change: VariantChange,
): Promise<LookDetail> {
  const detail = await getLookWithItems(db, lookId);
  if (!detail) throw new Error(`look not found or deleted: ${lookId}`);
  const v = createVariant(detail.look, detail.items, change, { newId: uuidv7, now: Date.now() });
  await createLook(db, derivedToCreate(v));
  const saved = await getLookWithItems(db, v.look.id);
  if (!saved) throw new Error('variant saved but detail missing');
  return saved;
}

/** 克隆：全量拷贝，source_look_id 为 NULL；原造型不变。 */
export async function cloneLookByIdCore(db: GarmentDb, lookId: string): Promise<LookDetail> {
  const detail = await getLookWithItems(db, lookId);
  if (!detail) throw new Error(`look not found or deleted: ${lookId}`);
  const c = cloneLook(detail.look, detail.items, { newId: uuidv7, now: Date.now() });
  await createLook(db, derivedToCreate(c));
  const saved = await getLookWithItems(db, c.look.id);
  if (!saved) throw new Error('clone saved but detail missing');
  return saved;
}

/**
 * 从 DB 事实重建封面绘制清单（封面 PNG 删除后据此重绘）。
 * 展示图取资产原图；衣物缺失/墓碑/归档 → null 占位（项与几何保留）。
 */
export async function rebuildCoverSpecCore(db: GarmentDb, lookId: string): Promise<CoverSpec | null> {
  const detail = await getLookWithItems(db, lookId);
  if (!detail) return null;
  const map = await resolveImageMap(db, detail.items.map((i) => i.garmentId));
  return buildCoverSpec({ id: detail.look.id, mode: detail.look.mode as LookMode }, detail.items, map);
}

/** 各衣物的展示图：缺失/墓碑/归档为 null（占位）。 */
async function resolveImageMap(
  db: GarmentDb,
  garmentIds: readonly string[],
): Promise<Map<string, string | null>> {
  const map = new Map<string, string | null>();
  for (const gid of new Set(garmentIds)) {
    const g = await db.getGarment(gid);
    if (!g || g.deletedAt != null || g.archivedAt != null) {
      map.set(gid, null);
      continue;
    }
    const asset = await db.getAssetByGarment(gid);
    map.set(gid, asset?.originalRelPath ?? null);
  }
  return map;
}

/* ---------------- 设备单例（仿 garments/service） ---------------- */

const rt = createServiceRuntime();

export async function saveLook(input: SaveLookInput): Promise<LookDetail> {
  const detail = await saveLookCore((await rt.readyDb()).db, input);
  await rt.persist();
  return detail;
}

export async function listLooks(): Promise<LookDetail[]> {
  return listLooksCore((await rt.readyDb()).db);
}

export async function getLookDetail(id: string): Promise<LookDetail | null> {
  return getLookDetailCore((await rt.readyDb()).db, id);
}

export async function deleteLook(id: string): Promise<void> {
  await deleteLookCore((await rt.readyDb()).db, id);
  await rt.persist();
}

export async function saveDraft(draft: LookDraft): Promise<void> {
  await saveDraftCore((await rt.readyDb()).db, draft);
}

export async function loadDraft(): Promise<LookDraft | null> {
  return loadDraftCore((await rt.readyDb()).db);
}

export async function clearDraft(): Promise<void> {
  await clearDraftCore((await rt.readyDb()).db);
}

export async function createVariantLook(lookId: string, change: VariantChange): Promise<LookDetail> {
  const detail = await createVariantLookCore((await rt.readyDb()).db, lookId, change);
  await rt.persist();
  return detail;
}

export async function cloneLookById(lookId: string): Promise<LookDetail> {
  const detail = await cloneLookByIdCore((await rt.readyDb()).db, lookId);
  await rt.persist();
  return detail;
}

/**
 * 重建封面绘制清单（供 UI 用 Skia 重绘封面 PNG）。
 * 设备端展示图优先最新成功抠图的预览/缩略图（透明底），原图兜底；
 * 归档/缺失为 null 占位。
 */
export async function rebuildCoverSpec(lookId: string): Promise<CoverSpec | null> {
  const app = await rt.readyDb();
  const detail = await getLookWithItems(app.db, lookId);
  if (!detail) return null;
  const jobs = await listByStatus(app.drizzleDb, 'succeeded');
  const jobByGarment = new Map(jobs.map((j) => [j.garmentId, j]));
  const base = await resolveImageMap(app.db, detail.items.map((i) => i.garmentId));
  const map = new Map<string, string | null>();
  for (const [gid, fallback] of base) {
    if (fallback == null) {
      map.set(gid, null);
      continue;
    }
    const job = jobByGarment.get(gid);
    map.set(gid, job?.previewRelPath ?? job?.thumbnailRelPath ?? fallback);
  }
  return buildCoverSpec({ id: detail.look.id, mode: detail.look.mode as LookMode }, detail.items, map);
}

/** 仅测试/调试：重置单例（不删数据）。 */
export function __resetForTest() {
  rt.resetForTest();
}
