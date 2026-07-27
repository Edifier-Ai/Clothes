import * as FileSystem from 'expo-file-system/legacy';

import { openAppDb, type AppDb } from '../db/expoDb';
import {
  createGarment,
  findActiveByHash,
  getGarment,
  listActiveGarments,
  restoreGarment,
  softDeleteGarment,
  updateGarment,
  type CreateGarmentInput,
  type GarmentDetail,
  type UpdateGarmentInput,
} from '../db/dao';
import type { TagKind } from '../db/schema';
import { uuidv7 } from '../id/uuidv7';
import { expoCrypto, makeExpoFs, rnDimReader } from '../files/expoAdapters';
import { originalExists, stageImage, type StagedImage } from '../files/imageStore';
import { restoreFromMirrorIfNeeded, writeMirror } from './mirror';

export type { GarmentDetail, CreateGarmentInput, UpdateGarmentInput };

export interface GarmentForm {
  name: string;
  category: CreateGarmentInput['category'];
  color?: string;
  season?: string;
  occasion?: string;
}

export type AddResult =
  | { kind: 'created'; detail: GarmentDetail }
  | { kind: 'duplicate'; existing: GarmentDetail; staged: StagedImage };

let dbHolder: Promise<AppDb> | null = null;
let rootAbs: string | null = null;
let restored: Promise<void> | null = null;

function db(): Promise<AppDb> {
  if (!dbHolder) {
    const opened = openAppDb();
    // 首次开库后从持久镜像回灌（补齐本机 expo-sqlite 不落盘）。
    restored = opened
      .then((app) => restoreFromMirrorIfNeeded(root(), app.db))
      .then(() => undefined);
    dbHolder = opened;
  }
  return dbHolder;
}

/** 等待开库+回灌完成，确保读写基于最新持久数据。 */
async function readyDb(): Promise<AppDb> {
  const app = await db();
  if (restored) await restored;
  return app;
}

/** 写后：把全量数据写入持久镜像（本机真正落盘路径）。
 *  注意：不再 close+reopen 连接——expo-sqlite 连接为单例共享，关闭会使其它持有者
 *  拿到 closed resource；且本机会话内 in-memory 数据已可查询，跨重启由镜像回灌保证。 */
async function persist(): Promise<void> {
  const app = await db();
  await writeMirror(root(), app.db, Date.now());
}

function root(): string {
  if (!rootAbs) {
    const base = FileSystem.documentDirectory?.replace(/\/$/, '') ?? '/tmp';
    rootAbs = `${base}/clothes`;
  }
  return rootAbs;
}

function deps(ext: string) {
  return {
    fs: makeExpoFs(root()),
    crypto: expoCrypto,
    dims: rnDimReader,
    rootAbs: root(),
    newId: () => uuidv7(),
    ext,
  };
}

function formToTags(form: GarmentForm) {
  const tags: { kind: TagKind; value: string; confidence: number }[] = [];
  if (form.color) tags.push({ kind: 'color', value: form.color, confidence: 1 });
  if (form.season) tags.push({ kind: 'season', value: form.season, confidence: 1 });
  if (form.occasion) tags.push({ kind: 'occasion', value: form.occasion, confidence: 1 });
  return tags;
}

/**
 * 阶段一：选图后暂存并算哈希/尺寸；若与未删除衣物同哈希返回 duplicate，
 * 由 UI 让用户确认是否继续（继续时传 force=true 再次调用 commitAdd）。
 */
export async function prepareAdd(sourceUri: string, ext: string): Promise<
  | { kind: 'ready'; staged: StagedImage }
  | { kind: 'duplicate'; existing: GarmentDetail; staged: StagedImage }
> {
  const staged = await stageImage(sourceUri, deps(ext));
  const existing = await findActiveByHash((await readyDb()).db, staged.sha256);
  if (existing) return { kind: 'duplicate', existing, staged };
  return { kind: 'ready', staged };
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
    await makeExpoFs(root()).deleteIfExists(finalAbsPath);
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
    await createGarment((await readyDb()).db, input);
  } catch (err) {
    // 事务已回滚；删除已晋升的最终文件，避免孤儿。
    await makeExpoFs(root()).deleteIfExists(finalAbsPath);
    throw err;
  }
  // 强制落盘：关闭+重开连接，确保强杀/断电不丢本次写入。
  await persist();
  const detail = await getGarment((await readyDb()).db, id);
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
  return listActiveGarments((await readyDb()).db);
}

export async function getGarmentDetail(id: string) {
  return getGarment((await readyDb()).db, id);
}

export async function editGarment(id: string, patch: UpdateGarmentInput) {
  const r = await updateGarment((await readyDb()).db, id, patch, Date.now());
  await persist();
  return r;
}

export async function deleteGarment(id: string) {
  const r = await softDeleteGarment((await readyDb()).db, id, Date.now());
  await persist();
  return r;
}

export async function restoreDeletedGarment(id: string) {
  const r = await restoreGarment((await readyDb()).db, id, Date.now());
  await persist();
  return r;
}

/** UI 用：判断某衣物的原图私有副本是否仍在（缺失→可修复状态，不删记录）。 */
export async function assetExists(detail: GarmentDetail) {
  return originalExists(detail.asset.originalRelPath, {
    fs: makeExpoFs(root()),
    rootAbs: root(),
  });
}

/** 仅测试/调试：重置单例（不删数据）。 */
export function __resetForTest() {
  dbHolder = null;
  rootAbs = null;
}

/**
 * 调试故障注入：若私有目录存在 `_debug_fail_commit` 哨兵，则在文件晋升后、
 * DB 写入前抛错，用以反向验证「失败时清理最终文件且无半条记录」。
 * 哨兵由验收脚本经 `adb shell run-as <pkg> touch/rm` 切换，不进入生产交互。
 */
async function debugFailRequested(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(`${root()}/_debug_fail_commit`);
    return info.exists;
  } catch {
    return false;
  }
}
