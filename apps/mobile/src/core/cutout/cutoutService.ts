import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

import type { AppDb } from '../db/expoDb';
import { garmentAssets, garments } from '../db/schema';
import { enqueue, listByStatus, requeueFailed } from '../db/queue';
import { devicePixelReader } from './devicePixelReader';
import { makeDeviceIO } from './deviceIO';
import { resolveCutoutEngine } from './engineResolver';
import { drain, recover, snapshot, TRANSIENT_ERROR_NAMES, type QueueSnapshot } from './processor';
import { writeMirror, restoreFromMirrorIfNeeded } from '../garments/mirror';
import { uuidv7 } from '../id/uuidv7';

const DIRS = ['originals', 'masks', 'previews', 'thumbnails', '_staging', '_tmp'];

export function rootAbs(): string {
  const base = FileSystem.documentDirectory?.replace(/\/$/, '') ?? '/tmp';
  return `${base}/clothes`;
}

export async function ensureDirs(): Promise<void> {
  for (const d of DIRS) {
    await FileSystem.makeDirectoryAsync(`${rootAbs()}/${d}`, { intermediates: true });
  }
}

export interface PickedForBatch {
  uri: string;
  ext: string;
  /** 可选预计算哈希（去重用） */
  sha256?: string;
}

export interface EnqueuedBatch {
  garmentIds: string[];
  jobIds: string[];
}

/** 为每张选中图创建衣物记录 + 暂存源图 + 入队抠图任务。 */
export async function enqueueBatch(app: AppDb, picked: PickedForBatch[]): Promise<EnqueuedBatch> {
  const garmentIds: string[] = [];
  const jobIds: string[] = [];
  const now = Date.now();
  for (let i = 0; i < picked.length; i++) {
    const p = picked[i];
    const gid = uuidv7();
    const jid = uuidv7();
    const ext = p.ext.replace(/^\./, '');
    const stagedRel = `_staging/${jid}.${ext}`;
    const stagedAbs = `${rootAbs()}/${stagedRel}`;
    await FileSystem.makeDirectoryAsync(`${rootAbs()}/_staging`, { intermediates: true });
    await FileSystem.copyAsync({ from: p.uri, to: stagedAbs });
    // 原图入队即提交到 originals/（不存在才写，绝不覆盖）：抠图待处理/失败时详情仍可见原图
    const originalRel = `originals/${gid}.${ext}`;
    const originalAbs = `${rootAbs()}/${originalRel}`;
    await FileSystem.makeDirectoryAsync(`${rootAbs()}/originals`, { intermediates: true });
    const oinfo = await FileSystem.getInfoAsync(originalAbs);
    if (!oinfo.exists) await FileSystem.copyAsync({ from: stagedAbs, to: originalAbs });
    const b64 = await FileSystem.readAsStringAsync(originalAbs, { encoding: FileSystem.EncodingType.Base64 });
    const sha256 = p.sha256 ?? (await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, b64));
    const dim = await FileSystem.getInfoAsync(originalAbs);
    await app.drizzleDb.insert(garments).values({
      id: gid,
      name: `衣物 ${i + 1}`,
      category: 'top',
      status: 'clean',
      priceMinor: null,
      currency: null,
      purchaseDate: null,
      archivedAt: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await app.drizzleDb.insert(garmentAssets).values({
      id: uuidv7(),
      garmentId: gid,
      originalRelPath: originalRel,
      sha256,
      width: 0, // 未知（入队阶段不解码；不伪造）
      height: 0,
      bytes: dim.exists && 'size' in dim ? (dim.size ?? 0) : 0,
      mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
      createdAt: now,
    });
    await enqueue(app.drizzleDb, { id: jid, garmentId: gid, sourceStagedPath: stagedAbs, sha256, now });
    garmentIds.push(gid);
    jobIds.push(jid);
  }
  await writeMirror(rootAbs(), app.db, app.drizzleDb, Date.now());
  return { garmentIds, jobIds };
}

/**
 * Onboarding 用：录入原图 + sha256，**不**生成蒙版/抠图（cutout 在设备 B-6 阻塞）。
 * 衣物以「待处理蒙版」状态入库，满足 12 件激活；蒙版可后续在 MVP-003 管线解锁后补。
 * 原图只读复制，绝不覆盖；sha256 由 expo-crypto 计算（非 Base64 入库）。
 */
export async function addOriginalOnly(
  app: AppDb,
  picked: { uri: string; ext: string; name?: string; category?: string },
): Promise<string> {
  await ensureDirs();
  const now = Date.now();
  const gid = uuidv7();
  const ext = picked.ext.replace(/^\./, '');
  const rel = `originals/${gid}.${ext}`;
  const abs = `${rootAbs()}/${rel}`;
  // 原图只读复制；目标不存在才写
  const info = await FileSystem.getInfoAsync(abs);
  if (!info.exists) await FileSystem.copyAsync({ from: picked.uri, to: abs });
  const b64 = await FileSystem.readAsStringAsync(abs, { encoding: FileSystem.EncodingType.Base64 });
  const sha256 = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, b64);
  const dim = await FileSystem.getInfoAsync(abs);
  await app.drizzleDb.insert(garments).values({
    id: gid,
    name: picked.name ?? `衣物`,
    category: picked.category ?? 'top',
    status: 'clean',
    priceMinor: null,
    currency: null,
    purchaseDate: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await app.drizzleDb.insert(garmentAssets).values({
    id: uuidv7(),
    garmentId: gid,
    originalRelPath: rel,
    sha256,
    width: 0, // 未知（无解码器；不伪造）
    height: 0,
    bytes: dim.exists && 'size' in dim ? (dim.size ?? 0) : 0,
    mimeType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
    createdAt: now,
  });
  await writeMirror(rootAbs(), app.db, app.drizzleDb, now);
  return gid;
}

/**
 * 启动顺序处理（并发 1）；启动先 recover 中断任务。每张完成写镜像。
 * 引擎经 resolveCutoutEngine 选择：凭证+上传告知齐全 → TencentCiEngine；
 * 否则引擎不可用，任务保持 pending（不标 failed、不伪造蒙版）。
 */
export async function startProcessing(app: AppDb, onProgress?: (s: QueueSnapshot) => void): Promise<number> {
  const io = makeDeviceIO(rootAbs());
  const { engine } = await resolveCutoutEngine({ readPixels: devicePixelReader });
  await recover({ db: app.drizzleDb, engine, io, extForJob: () => 'png' });
  const wrapped = onProgress
    ? (s: QueueSnapshot) => {
        void writeMirror(rootAbs(), app.db, app.drizzleDb, Date.now());
        onProgress(s);
      }
    : undefined;
  const n = await drain({ db: app.drizzleDb, engine, io, extForJob: () => 'png', onProgress: wrapped });
  await writeMirror(rootAbs(), app.db, app.drizzleDb, Date.now());
  return n;
}

/** 手动重试失败项：failed → pending（重置重试预算）后续跑队列。 */
export async function retryFailed(app: AppDb, onProgress?: (s: QueueSnapshot) => void): Promise<number> {
  await requeueFailed(app.drizzleDb, Date.now());
  await writeMirror(rootAbs(), app.db, app.drizzleDb, Date.now());
  return startProcessing(app, onProgress);
}

/** 因断网/临时错误回 pending 等待重试的任务数（errorCode 命中临时错误约定）。 */
export async function countNetworkPending(app: AppDb): Promise<number> {
  const pending = await listByStatus(app.drizzleDb, 'pending');
  return pending.filter((j) => j.errorCode !== null && TRANSIENT_ERROR_NAMES.includes(j.errorCode)).length;
}

export async function getSnapshot(app: AppDb): Promise<QueueSnapshot> {
  const io = makeDeviceIO(rootAbs());
  const { engine } = await resolveCutoutEngine({ readPixels: devicePixelReader });
  return snapshot({ db: app.drizzleDb, engine, io, extForJob: () => 'png' });
}

/** 启动恢复镜像（含队列/操作栈）。在 openAppDb 后调用。 */
export async function restoreOnBoot(app: AppDb): Promise<boolean> {
  return restoreFromMirrorIfNeeded(rootAbs(), app.db, app.drizzleDb);
}
