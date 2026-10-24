import * as FileSystem from 'expo-file-system/legacy';

import { createServiceRuntime } from '../db/serviceRuntime';
import {
  createGarment,
  findActiveByHash,
  getGarment,
  listActiveGarments,
  listActiveGarmentsWithThumbs as listWithThumbs,
  restoreGarment,
  softDeleteGarment,
  updateGarment,
  type CreateGarmentInput,
  type GarmentDetail,
  type UpdateGarmentInput,
  type WardrobeListItem,
} from '../db/dao';
import type { GarmentStatusEventRow, TagKind } from '../db/schema';
import { uuidv7 } from '../id/uuidv7';
import { expoCrypto, makeExpoFs, rnDimReader } from '../files/expoAdapters';
import { normalizeExifOrientation } from '../files/exif';
import { originalExists, stageImage, type StagedImage } from '../files/imageStore';
import { listByStatus } from '../db/queue';
import { batchUpdateGarments, type BatchPatch, type BatchResult } from '../wardrobe/batch';
import { buildWardrobeItems } from '../wardrobe/query';
import {
  applyWardrobeFilter,
  sortWardrobeItems,
  type WardrobeFilter,
  type WardrobeItem,
  type WardrobeSort,
} from '../wardrobe/search';
import {
  applyPostWearCare,
  archiveGarment,
  changeGarmentStatus,
  listGarmentStatusEvents,
  unarchiveGarment,
  type CareStatus,
  type PostWearAction,
  type PostWearResult,
  type StatusChangeResult,
} from '../wardrobe/status';
import { getGarmentStats, type GarmentStats } from '../wardrobe/stats';

export type { GarmentDetail, CreateGarmentInput, UpdateGarmentInput, WardrobeListItem };

export interface GarmentForm {
  name: string;
  category: CreateGarmentInput['category'];
  color?: string;
  season?: string;
  occasion?: string;
  brand?: string;
  note?: string;
}

export type AddResult =
  | { kind: 'created'; detail: GarmentDetail }
  | { kind: 'duplicate'; existing: GarmentDetail; staged: StagedImage };

const rt = createServiceRuntime();

function deps(ext: string) {
  return {
    fs: makeExpoFs(rt.root()),
    crypto: expoCrypto,
    dims: rnDimReader,
    rootAbs: rt.root(),
    newId: () => uuidv7(),
    ext,
  };
}

function formToTags(form: GarmentForm) {
  const tags: { kind: TagKind; value: string; confidence: number }[] = [];
  if (form.color) tags.push({ kind: 'color', value: form.color, confidence: 1 });
  if (form.season) tags.push({ kind: 'season', value: form.season, confidence: 1 });
  if (form.occasion) tags.push({ kind: 'occasion', value: form.occasion, confidence: 1 });
  if (form.brand) tags.push({ kind: 'brand', value: form.brand, confidence: 1 });
  if (form.note) tags.push({ kind: 'note', value: form.note, confidence: 1 });
  return tags;
}

/**
 * 阶段一：选图后暂存并算哈希/尺寸；若与未删除衣物同哈希返回 duplicate，
 * 由 UI 让用户确认是否继续（继续时传 force=true 再次调用 commitAdd）。
 *
 * EXIF 方向归一化：源图（相机/相册 JPEG）带 Orientation=2..8 时才生成无 EXIF
 * 临时 PNG；其它图片原样暂存，避免无条件 PNG 膨胀（不覆盖用户原始文件）。
 */
export async function prepareAdd(sourceUri: string, ext: string): Promise<
  | { kind: 'ready'; staged: StagedImage }
  | { kind: 'duplicate'; existing: GarmentDetail; staged: StagedImage }
> {
  const normalized = await normalizeExifOrientation(sourceUri, ext);
  try {
    const staged = await stageImage(normalized.uri, deps(normalized.ext));
    const existing = await findActiveByHash((await rt.readyDb()).db, staged.sha256);
    if (existing) return { kind: 'duplicate', existing, staged };
    return { kind: 'ready', staged };
  } finally {
    // 只能删本模块生成的缓存文件，绝不能删相册/相机源 URI。
    if (normalized.temporary) {
      await FileSystem.deleteAsync(normalized.uri, { idempotent: true }).catch(() => undefined);
    }
  }
}

/** 把已暂存图片落库；DB 失败时清理最终文件，绝不留半条记录或孤儿文件。 */
export async function commitAdd(
  staged: StagedImage,
  form: GarmentForm,
  ext: string,
): Promise<GarmentDetail> {
  const now = Date.now();
  const id = uuidv7();
  const { finalAbsPath, relPath } = await staged.commit(id);
  // 反向验证钩子：晋升后、入库前注入失败 → 下方 catch 清理 finalAbsPath，无孤儿/无半条。
  if (await debugFailRequested()) {
    await makeExpoFs(rt.root()).deleteIfExists(finalAbsPath);
    throw new Error('debug-injected commit failure');
  }
  const input: CreateGarmentInput = {
    id,
    name: form.name.trim() || '未命名衣物',
    category: form.category,
    asset: {
      id: uuidv7(),
      originalRelPath: relPath,
      sha256: staged.sha256,
      width: staged.width,
      height: staged.height,
      bytes: staged.bytes,
      mimeType: staged.mimeType,
    },
    tags: formToTags(form),
    now,
  };
  try {
    await createGarment((await rt.readyDb()).db, input);
  } catch (err) {
    // 事务已回滚；删除已晋升的最终文件，避免孤儿。
    await makeExpoFs(rt.root()).deleteIfExists(finalAbsPath);
    throw err;
  }
  // 强制落盘：关闭+重开连接，确保强杀/断电不丢本次写入。
  await rt.persist();
  const detail = await getGarment((await rt.readyDb()).db, id);
  if (!detail) throw new Error('commit succeeded but detail missing');
  return detail;
}

/** 一站式：准备+立即提交（无重复或调用方已确认）。 */
export async function addGarment(
  sourceUri: string,
  ext: string,
  form: GarmentForm,
): Promise<AddResult> {
  const prepared = await prepareAdd(sourceUri, ext);
  if (prepared.kind === 'duplicate') return prepared;
  const detail = await commitAdd(prepared.staged, form, ext);
  return { kind: 'created', detail };
}

export async function listGarments() {
  return listActiveGarments((await rt.readyDb()).db);
}

/** 衣橱网格数据源：活动衣物 + 展示图路径（抠图缩略图/预览优先，原图兜底）。 */
export async function listActiveGarmentsWithThumbs(): Promise<WardrobeListItem[]> {
  const app = await rt.readyDb();
  return listWithThumbs(app.db, app.drizzleDb);
}

export async function getGarmentDetail(id: string) {
  return getGarment((await rt.readyDb()).db, id);
}

export async function editGarment(id: string, patch: UpdateGarmentInput) {
  const r = await updateGarment((await rt.readyDb()).db, id, patch, Date.now());
  await rt.persist();
  return r;
}

export async function deleteGarment(id: string) {
  const r = await softDeleteGarment((await rt.readyDb()).db, id, Date.now());
  await rt.persist();
  return r;
}

export async function restoreDeletedGarment(id: string) {
  const r = await restoreGarment((await rt.readyDb()).db, id, Date.now());
  await rt.persist();
  return r;
}

/** UI 用：判断某衣物的原图私有副本是否仍在（缺失→可修复状态，不删记录）。 */
export async function assetExists(detail: GarmentDetail) {
  return originalExists(detail.asset.originalRelPath, {
    fs: makeExpoFs(rt.root()),
    rootAbs: rt.root(),
  });
}

/* ---------------- MVP-007：衣橱搜索/筛选/状态/批量/统计 ---------------- */

export interface WardrobeEntry {
  item: WardrobeItem;
  /** 网格/列表缩略图：缩略图优先，预览/原图兜底，均无则 null。 */
  imageRelPath: string | null;
  /** 造型画布/封面展示图：预览优先（与 rebuildCoverSpec 同源），缩略图/原图兜底。 */
  previewRelPath: string | null;
}

/**
 * 衣物展示图双通道（MVP-008 编辑器↔封面一致性）：
 * thumb 缩略图优先（网格/列表小图省内存）；preview 预览优先
 * （透明底、真实宽高比——缩略图是 96×96 方形压缩图，用于画布会所见≠所得）。
 */
export function displayImagePaths(
  job: { previewRelPath: string | null; thumbnailRelPath: string | null } | undefined,
  originalRelPath: string | null,
): { thumb: string | null; preview: string | null } {
  return {
    thumb: job?.thumbnailRelPath ?? job?.previewRelPath ?? originalRelPath,
    preview: job?.previewRelPath ?? job?.thumbnailRelPath ?? originalRelPath,
  };
}

export type { BatchPatch, BatchResult, CareStatus, GarmentStats, PostWearAction, PostWearResult, StatusChangeResult, WardrobeFilter, WardrobeItem, WardrobeSort };

/** 衣橱网格数据源（CLS-01/02）：组合筛选 + 排序 + 展示图。含归档区（filter.status='archived'）。 */
export async function queryWardrobe(
  filter: WardrobeFilter,
  sort: WardrobeSort = 'recentAdded',
): Promise<WardrobeEntry[]> {
  const app = await rt.readyDb();
  const [items, assets, jobs] = await Promise.all([
    buildWardrobeItems(app.db, app.drizzleDb),
    app.db.getAllAssets(),
    listByStatus(app.drizzleDb, 'succeeded'),
  ]);
  const assetByGarment = new Map(assets.map((a) => [a.garmentId, a]));
  const jobByGarment = new Map(jobs.map((j) => [j.garmentId, j]));
  const sorted = sortWardrobeItems(applyWardrobeFilter(items, filter, Date.now()), sort);
  return sorted.map((item) => {
    const job = jobByGarment.get(item.garment.id);
    const paths = displayImagePaths(job, assetByGarment.get(item.garment.id)?.originalRelPath ?? null);
    return {
      item,
      imageRelPath: paths.thumb,
      previewRelPath: paths.preview,
    };
  });
}

export async function setGarmentStatus(id: string, to: CareStatus): Promise<StatusChangeResult> {
  const r = await changeGarmentStatus((await rt.readyDb()).db, id, to, Date.now());
  await rt.persist();
  return r;
}

export async function archiveGarmentById(id: string): Promise<StatusChangeResult> {
  const r = await archiveGarment((await rt.readyDb()).db, id, Date.now());
  await rt.persist();
  return r;
}

export async function unarchiveGarmentById(id: string): Promise<StatusChangeResult> {
  const r = await unarchiveGarment((await rt.readyDb()).db, id, Date.now());
  await rt.persist();
  return r;
}

/** 批量状态/归档/加标签：单事务，任一失败整体回滚。 */
export async function batchUpdate(ids: readonly string[], patch: BatchPatch): Promise<BatchResult> {
  const r = await batchUpdateGarments((await rt.readyDb()).db, ids, patch, Date.now());
  await rt.persist();
  return r;
}

/** 状态历史（时间升序）。 */
export async function getStatusHistory(id: string): Promise<GarmentStatusEventRow[]> {
  return listGarmentStatusEvents((await rt.readyDb()).db, id);
}

/** 详情统计：真实穿着次数/最近时间/成本次/使用造型。 */
export async function getGarmentStatsById(id: string): Promise<GarmentStats | null> {
  const app = await rt.readyDb();
  const g = await app.db.getActiveGarment(id);
  if (!g) return null;
  return getGarmentStats(app.drizzleDb, g);
}

/** TDY-07 穿后洗护联动：skip 不写库；任一不存在整体回滚。 */
export async function applyPostWear(
  decisions: readonly { garmentId: string; action: PostWearAction }[],
): Promise<PostWearResult> {
  const r = await applyPostWearCare((await rt.readyDb()).db, decisions, Date.now());
  await rt.persist();
  return r;
}

/** 仅测试/调试：重置单例（不删数据）。 */
export function __resetForTest() {
  rt.resetForTest();
}

/**
 * 调试故障注入：若私有目录存在 `_debug_fail_commit` 哨兵，则在文件晋升后、
 * DB 写入前抛错，用以反向验证「失败时清理最终文件且无半条记录」。
 * 哨兵由验收脚本经 `adb shell run-as <pkg> touch/rm` 切换，不进入生产交互。
 */
async function debugFailRequested(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(`${rt.root()}/_debug_fail_commit`);
    return info.exists;
  } catch {
    return false;
  }
}
