import { createServiceRuntime } from '../db/serviceRuntime';
import {
  createPackingItem,
  createTripTemplate,
  deletePackingItemRow,
  packingItemSourceOutfitIds,
  softDeleteTripTemplate,
  tripTemplateItems,
  updatePackingItemRow,
  type GarmentDb,
} from '../db/dao';
import type { PackingItemKind, PackingItemRow, TripTemplateRow } from '../db/schema';
import { uuidv7 } from '../id/uuidv7';
import { listTripOutfitsCore } from './tripService';
import { computePackingFromOutfits, type PackingItemView, type TripOutfitView } from './packView';

/**
 * 打包清单服务（MVP-010）。结构仿 packingService/planService：
 * - `*Core(db, …)`：可注入持久逻辑，设备单例与 host 测试共用同一代码路径。
 * - 单例 API：readyDb + 写后 writeMirror 落持久镜像（packing_items/trip_templates
 *   随 GarmentDump 进 v8 镜像）。
 *
 * 领域规则（与任务卡对齐）：
 * - regenerate 只根据活动 tripOutfits 的快照去重生成 garment 项（computePackingFromOutfits），
 *   不动 manual 项（手工项目不被重新生成覆盖）。
 * - 重新生成保留仍存在 garment 项的勾选状态（按 garmentId 匹配，checked/checkedAt 不变）；
 *   不再被使用的 garment 项 hard delete（清单只根据已安排造型去重）。
 * - 勾选状态与衣物事实分离：garment 项 checked 独立于 sourceCount；
 *   衣物墓碑/归档/不存在 → missing=true，行不删（UI 标缺失，不静默消失）。
 * - 勾选幂等：同状态再次勾选不改 checkedAt；取消勾选清空 checkedAt。
 * - 模板项是纯标签清单（kind/label/garmentId?），不绑定具体旅行；删除采用墓碑。
 */

/* ---------------- 可注入 Core ---------------- */

/** 把 packing_item 行转视图项（带 missing 标记，按需查 garments 表）。 */
async function rowToView(db: GarmentDb, row: PackingItemRow): Promise<PackingItemView> {
  let missing = false;
  if (row.kind === 'garment' && row.garmentId) {
    const g = await db.getGarment(row.garmentId);
    // 不存在 / 墓碑 / 归档 → missing
    if (!g || g.deletedAt != null || g.archivedAt != null) missing = true;
  }
  return {
    id: row.id,
    kind: row.kind as PackingItemKind,
    label: row.label,
    garmentId: row.garmentId,
    checked: row.checked === 1,
    checkedAt: row.checkedAt,
    sourceCount: row.sourceCount,
    sourceOutfitIds: packingItemSourceOutfitIds(row),
    missing,
  };
}

function compareGarmentDrafts(a: { garmentId: string; sourceCount: number }, b: { garmentId: string; sourceCount: number }): number {
  if (a.sourceCount !== b.sourceCount) return b.sourceCount - a.sourceCount; // 来源数倒序
  return a.garmentId < b.garmentId ? -1 : a.garmentId > b.garmentId ? 1 : 0; // id 升序兜底
}

/**
 * 重新生成 packing_items：
 * - 读活动 tripOutfits → computePackingFromOutfits 算 garment 草稿；
 * - 与现有 garment 项按 garmentId 匹配：仍存在 → update（保留 checked/checkedAt）；
 *   不再使用 → hard delete；新增 → insert；
 * - manual 项完全不动（不被重新生成覆盖）。
 * 幂等：重复 regenerate 不产生重复项（按 garmentId 唯一约束 + 匹配逻辑）。
 */
export async function regeneratePackingCore(db: GarmentDb, tripId: string): Promise<void> {
  const now = Date.now();
  const outfits = await listTripOutfitsCore(db, tripId);
  const views: TripOutfitView[] = outfits.map((o) => ({
    id: o.tripOutfit.id,
    tripId,
    date: o.tripOutfit.date,
    timeLabel: o.tripOutfit.timeLabel,
    outfitGarmentIds: o.outfitGarmentIds,
    deletedAt: o.tripOutfit.deletedAt,
  }));
  const drafts = computePackingFromOutfits(views).sort(compareGarmentDrafts);
  const draftByGarment = new Map(drafts.map((d) => [d.garmentId, d]));

  const existing = await db.listPackingItemsByTrip(tripId);
  const existingGarment = existing.filter((r) => r.kind === 'garment');
  const existingByGarment = new Map(existingGarment.map((r) => [r.garmentId!, r]));

  // 1. hard delete 不再使用的 garment 项
  for (const r of existingGarment) {
    if (!draftByGarment.has(r.garmentId!)) {
      await deletePackingItemRow(db, r.id);
    }
  }

  // 2. upsert 草稿（保留 checked/checkedAt；ord 按 sourceCount 倒序重排）
  let ord = 0;
  for (const draft of drafts) {
    const prev = existingByGarment.get(draft.garmentId);
    // label：衣物存在用其名（快照），否则保留旧 label 或回退 garmentId
    let label = draft.garmentId;
    const g = await db.getGarment(draft.garmentId);
    if (g && g.deletedAt == null && g.archivedAt == null) label = g.name;
    else if (prev) label = prev.label;
    if (prev) {
      await updatePackingItemRow(db, prev.id, {
        label,
        sourceCount: draft.sourceCount,
        sourceOutfitIds: draft.sourceOutfitIds,
        ord,
      }, now);
    } else {
      await createPackingItem(db, {
        id: uuidv7(),
        tripId,
        kind: 'garment',
        garmentId: draft.garmentId,
        label,
        sourceCount: draft.sourceCount,
        sourceOutfitIds: draft.sourceOutfitIds,
        checked: false,
        checkedAt: null,
        ord,
        now,
      });
    }
    ord += 1;
  }
}

/** 某旅行全部清单项（按 (kind, ord) 升序），各带 missing 标记。 */
export async function listPackingItemsCore(db: GarmentDb, tripId: string): Promise<PackingItemView[]> {
  const rows = await db.listPackingItemsByTrip(tripId);
  return Promise.all(rows.map((r) => rowToView(db, r)));
}

export interface AddManualItemInput {
  tripId: string;
  label: string;
}

/** 新增手工项；ord 排在所有 manual 项末尾（与 garment 分段，garment ord 在前）。 */
export async function addManualItemCore(db: GarmentDb, input: AddManualItemInput): Promise<PackingItemView> {
  const now = Date.now();
  const existing = await db.listPackingItemsByTrip(input.tripId);
  const manuals = existing.filter((r) => r.kind === 'manual');
  const maxManualOrd = manuals.reduce((m, r) => Math.max(m, r.ord), -1);
  // manual ord 从 1_000_000 起，与 garment 段（0..N-1）隔离
  const ord = 1_000_000 + (maxManualOrd >= 1_000_000 ? maxManualOrd - 1_000_000 + 1 : manuals.length);
  const row: PackingItemRow = {
    id: uuidv7(),
    tripId: input.tripId,
    kind: 'manual',
    garmentId: null,
    label: input.label,
    sourceCount: 0,
    sourceOutfitIdsJson: '[]',
    checked: 0,
    checkedAt: null,
    ord,
    createdAt: now,
    updatedAt: now,
  };
  await createPackingItem(db, {
    id: row.id,
    tripId: row.tripId,
    kind: row.kind as PackingItemKind,
    garmentId: null,
    label: row.label,
    sourceCount: 0,
    sourceOutfitIds: [],
    checked: false,
    checkedAt: null,
    ord,
    now,
  });
  return rowToView(db, row);
}

/** hard delete 手工项（用户删除时；garment 项由 regenerate 管理）。 */
export async function removeManualItemCore(db: GarmentDb, id: string): Promise<void> {
  await deletePackingItemRow(db, id);
}

/** 勾选/取消勾选，幂等：同状态不改 checkedAt；取消时清空 checkedAt。返回更新后视图。 */
export async function toggleCheckCore(
  db: GarmentDb,
  id: string,
  checked: boolean,
  now: number,
): Promise<PackingItemView> {
  const row = await db.getPackingItem(id);
  if (!row) throw new Error(`packing item not found: ${id}`);
  const wantInt = checked ? 1 : 0;
  if (row.checked === wantInt) {
    // 幂等：状态相同不改时间
    return rowToView(db, row);
  }
  await updatePackingItemRow(db, id, { checked, checkedAt: checked ? now : null }, now);
  const updated = (await db.getPackingItem(id))!;
  return rowToView(db, updated);
}

/** 单项详情视图（含 missing）。 */
export async function packingItemDetailViewCore(db: GarmentDb, id: string): Promise<PackingItemView | null> {
  const row = await db.getPackingItem(id);
  if (!row) return null;
  return rowToView(db, row);
}

export interface SaveTemplateInput {
  name: string;
  sourceTripId?: string | null;
  items: readonly { kind: PackingItemKind; label: string; garmentId?: string | null }[];
}

export interface TripTemplateDetail {
  id: string;
  name: string;
  sourceTripId: string | null;
  items: { kind: PackingItemKind; label: string; garmentId?: string | null }[];
  createdAt: number;
  updatedAt: number;
}

function templateToDetail(t: TripTemplateRow): TripTemplateDetail {
  return {
    id: t.id,
    name: t.name,
    sourceTripId: t.sourceTripId,
    items: tripTemplateItems(t),
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

export async function saveTemplateCore(db: GarmentDb, input: SaveTemplateInput): Promise<TripTemplateDetail> {
  const now = Date.now();
  const id = uuidv7();
  await createTripTemplate(db, {
    id,
    name: input.name,
    sourceTripId: input.sourceTripId ?? null,
    items: input.items,
    now,
  });
  const row = (await db.getTripTemplate(id))!;
  return templateToDetail(row);
}

export async function listTemplatesCore(db: GarmentDb): Promise<TripTemplateDetail[]> {
  const rows = await db.listActiveTripTemplates();
  return rows.map(templateToDetail);
}

export async function softDeleteTemplateCore(db: GarmentDb, id: string): Promise<void> {
  await softDeleteTripTemplate(db, id, Date.now());
}

/* ---------------- 设备单例 ---------------- */

const rt = createServiceRuntime();

export async function regeneratePacking(tripId: string): Promise<void> {
  await regeneratePackingCore((await rt.readyDb()).db, tripId);
  await rt.persist();
}

export async function listPackingItems(tripId: string): Promise<PackingItemView[]> {
  return listPackingItemsCore((await rt.readyDb()).db, tripId);
}

export async function addManualItem(input: AddManualItemInput): Promise<PackingItemView> {
  const v = await addManualItemCore((await rt.readyDb()).db, input);
  await rt.persist();
  return v;
}

export async function removeManualItem(id: string): Promise<void> {
  await removeManualItemCore((await rt.readyDb()).db, id);
  await rt.persist();
}

export async function toggleCheck(id: string, checked: boolean, now: number = Date.now()): Promise<PackingItemView> {
  const v = await toggleCheckCore((await rt.readyDb()).db, id, checked, now);
  await rt.persist();
  return v;
}

export async function packingItemDetailView(id: string): Promise<PackingItemView | null> {
  return packingItemDetailViewCore((await rt.readyDb()).db, id);
}

export async function saveTemplate(input: SaveTemplateInput): Promise<TripTemplateDetail> {
  const v = await saveTemplateCore((await rt.readyDb()).db, input);
  await rt.persist();
  return v;
}

export async function listTemplates(): Promise<TripTemplateDetail[]> {
  return listTemplatesCore((await rt.readyDb()).db);
}

export async function softDeleteTemplate(id: string): Promise<void> {
  await softDeleteTemplateCore((await rt.readyDb()).db, id);
  await rt.persist();
}

/** 仅测试/调试：重置单例（不删数据）。 */
export function __resetForTest() {
  rt.resetForTest();
}
