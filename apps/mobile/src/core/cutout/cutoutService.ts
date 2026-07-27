import * as FileSystem from 'expo-file-system/legacy';

import type { AppDb } from '../db/expoDb';
import { openAppDb } from '../db/expoDb';
import { garments } from '../db/schema';
import { enqueue } from '../db/queue';
import { StubSegmentationEngine } from '../../native/segmentationEngine';
import { devicePixelReader } from './devicePixelReader';
import { makeDeviceIO } from './deviceIO';
import { drain, recover, snapshot, type QueueSnapshot } from './processor';
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
    const stagedRel = `_staging/${jid}.${p.ext.replace(/^\./, '')}`;
    const stagedAbs = `${rootAbs()}/${stagedRel}`;
    await FileSystem.makeDirectoryAsync(`${rootAbs()}/_staging`, { intermediates: true });
    await FileSystem.copyAsync({ from: p.uri, to: stagedAbs });
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
    await enqueue(app.drizzleDb, { id: jid, garmentId: gid, sourceStagedPath: stagedAbs, sha256: p.sha256, now });
    garmentIds.push(gid);
    jobIds.push(jid);
  }
  await writeMirror(rootAbs(), app.db, app.drizzleDb, Date.now());
  return { garmentIds, jobIds };
}

/** 启动顺序处理（并发 1）；启动先 recover 中断任务。每张完成写镜像。 */
export async function startProcessing(app: AppDb, onProgress?: (s: QueueSnapshot) => void): Promise<number> {
  const io = makeDeviceIO(rootAbs());
  const engine = new StubSegmentationEngine(devicePixelReader);
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

export async function getSnapshot(app: AppDb): Promise<QueueSnapshot> {
  const io = makeDeviceIO(rootAbs());
  const engine = new StubSegmentationEngine(devicePixelReader);
  return snapshot({ db: app.drizzleDb, engine, io, extForJob: () => 'png' });
}

/** 启动恢复镜像（含队列/操作栈）。在 openAppDb 后调用。 */
export async function restoreOnBoot(app: AppDb): Promise<boolean> {
  return restoreFromMirrorIfNeeded(rootAbs(), app.db, app.drizzleDb);
}
