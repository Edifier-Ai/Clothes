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

let dbHolder: AppDb | null = null;
let rootAbs: string | null = null;

function db(): AppDb {
  if (!dbHolder) dbHolder = openAppDb();
  return dbHolder;
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
  const existing = findActiveByHash(db().db, staged.sha256);
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
    createGarment(db().db, input);
  } catch (err) {
    // 事务已回滚；删除已晋升的最终文件，避免孤儿。
    await makeExpoFs(root()).deleteIfExists(finalAbsPath);
    throw err;
  }
  const detail = getGarment(db().db, id);
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

export function listGarments() {
  return listActiveGarments(db().db);
}

export function getGarmentDetail(id: string) {
  return getGarment(db().db, id);
}

export function editGarment(id: string, patch: UpdateGarmentInput) {
  return updateGarment(db().db, id, patch, Date.now());
}

export function deleteGarment(id: string) {
  return softDeleteGarment(db().db, id, Date.now());
}

export function restoreDeletedGarment(id: string) {
  return restoreGarment(db().db, id, Date.now());
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
