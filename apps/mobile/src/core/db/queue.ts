import { and, asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';
import {
  cutoutJobs,
  garmentAssets,
  garments,
  maskStrokes,
  type CutoutJobRow,
  type MaskStrokeRow,
} from './schema';

/**
 * 抠图队列 + 修边操作栈（MVP-003）。直接基于 drizzle 实例，状态机：
 * pending→running→succeeded/failed/cancelled；幂等入队；recoverRunning 把异常 running 复位。
 * 设备传 drizzle(expo-sqlite)，测试传 drizzle(better-sqlite3)，查询构建器调用一致。
 */

export type AnyDb = ExpoSQLiteDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

export type JobStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'cancelled';
export const TERMINAL_STATUSES: readonly JobStatus[] = ['succeeded', 'failed', 'cancelled'];

export interface EnqueueInput {
  id: string;
  garmentId: string;
  sourceStagedPath: string;
  sha256?: string;
  now: number;
}

export interface SucceededData {
  originalRelPath: string;
  maskRelPath: string;
  previewRelPath: string;
  thumbnailRelPath: string;
  width: number;
  height: number;
}

/**
 * 队列页的一行可展示数据。job 仍是事实状态；名称和原图仅用于预览，
 * 不把绝对文件路径或 UI 文案写回数据库。
 */
export interface CutoutQueueItem {
  job: CutoutJobRow;
  garmentName: string;
  originalRelPath: string | null;
}

export async function enqueue(db: AnyDb, input: EnqueueInput): Promise<{ id: string; deduped: boolean }> {
  const existing = await db
    .select()
    .from(cutoutJobs)
    .where(eq(cutoutJobs.garmentId, input.garmentId))
    .orderBy(asc(cutoutJobs.createdAt))
    .all();
  const live = (existing as CutoutJobRow[]).filter((r) => !TERMINAL_STATUSES.includes(r.status as JobStatus));
  if (live.length > 0) return { id: live[0].id, deduped: true };
  await db.insert(cutoutJobs).values({
    id: input.id,
    garmentId: input.garmentId,
    status: 'pending',
    attempts: 0,
    errorCode: null,
    errorMessage: null,
    sourceStagedPath: input.sourceStagedPath,
    originalRelPath: null,
    maskRelPath: null,
    previewRelPath: null,
    thumbnailRelPath: null,
    width: null,
    height: null,
    sha256: input.sha256 ?? null,
    createdAt: input.now,
    updatedAt: input.now,
  });
  return { id: input.id, deduped: false };
}

export async function claimNext(db: AnyDb, now: number): Promise<CutoutJobRow | null> {
  // 单写者队列，无需事务包裹（better-sqlite3 的 transaction 不接受 async 回调）。
  const pending = (await db
    .select()
    .from(cutoutJobs)
    .where(eq(cutoutJobs.status, 'pending'))
    .orderBy(asc(cutoutJobs.createdAt))
    .all()) as CutoutJobRow[];
  if (pending.length === 0) return null;
  const job = pending[0];
  await db
    .update(cutoutJobs)
    .set({ status: 'running', attempts: job.attempts + 1, updatedAt: now })
    .where(eq(cutoutJobs.id, job.id));
  return { ...job, status: 'running', attempts: job.attempts + 1, updatedAt: now };
}

export async function markSucceeded(db: AnyDb, id: string, data: SucceededData, now: number): Promise<void> {
  await db
    .update(cutoutJobs)
    .set({
      status: 'succeeded',
      originalRelPath: data.originalRelPath,
      maskRelPath: data.maskRelPath,
      previewRelPath: data.previewRelPath,
      thumbnailRelPath: data.thumbnailRelPath,
      width: data.width,
      height: data.height,
      sourceStagedPath: null,
      updatedAt: now,
    })
    .where(eq(cutoutJobs.id, id));
}

export async function markFailed(
  db: AnyDb,
  id: string,
  errorCode: string,
  errorMessage: string,
  maxAttempts: number,
  now: number,
): Promise<JobStatus> {
  const job = (await db.select().from(cutoutJobs).where(eq(cutoutJobs.id, id)).get()) as CutoutJobRow | null;
  if (!job) return 'failed';
  const willRetry = job.attempts < maxAttempts;
  const finalStatus: JobStatus = willRetry ? 'pending' : 'failed';
  await db
    .update(cutoutJobs)
    .set({ status: finalStatus, errorCode, errorMessage, updatedAt: now })
    .where(eq(cutoutJobs.id, id));
  return finalStatus;
}

export async function cancel(db: AnyDb, id: string, now: number): Promise<void> {
  await db.update(cutoutJobs).set({ status: 'cancelled', updatedAt: now }).where(eq(cutoutJobs.id, id));
}

/**
 * 网络/临时失败复位：running → pending，保留 attempts 计数（计重试），不进入 failed。
 * 与 markFailed 的区别：临时失败不消耗 maxAttempts 预算，联网后由 drain 续跑。
 */
export async function requeuePending(db: AnyDb, id: string, errorCode: string, errorMessage: string, now: number): Promise<void> {
  await db
    .update(cutoutJobs)
    .set({ status: 'pending', errorCode, errorMessage, updatedAt: now })
    .where(eq(cutoutJobs.id, id));
}

/** 手动重试：failed → pending，重置 attempts 与错误信息（用户点击重试 = 新的重试预算）。返回复位条数。 */
export async function requeueFailed(db: AnyDb, now: number): Promise<number> {
  const failed = await listByStatus(db, 'failed');
  for (const job of failed) {
    await db
      .update(cutoutJobs)
      .set({ status: 'pending', attempts: 0, errorCode: null, errorMessage: null, updatedAt: now })
      .where(eq(cutoutJobs.id, job.id));
  }
  return failed.length;
}

/** 恢复：异常 running → pending（杀进程/低内存后调用）。返回复位条数。 */
export async function recoverRunning(db: AnyDb, now: number): Promise<number> {
  const running = (await db.select().from(cutoutJobs).where(eq(cutoutJobs.status, 'running')).all()) as CutoutJobRow[];
  for (const job of running) {
    await db
      .update(cutoutJobs)
      .set({ status: 'pending', errorCode: 'RECOVERED_INTERRUPTED', updatedAt: now })
      .where(eq(cutoutJobs.id, job.id));
  }
  return running.length;
}

export async function getJob(db: AnyDb, id: string): Promise<CutoutJobRow | null> {
  return (await db.select().from(cutoutJobs).where(eq(cutoutJobs.id, id)).get()) as CutoutJobRow | null;
}

export async function listByStatus(db: AnyDb, status: JobStatus): Promise<CutoutJobRow[]> {
  return (await db.select().from(cutoutJobs).where(eq(cutoutJobs.status, status)).orderBy(asc(cutoutJobs.createdAt)).all()) as CutoutJobRow[];
}

export async function listByGarment(db: AnyDb, garmentId: string): Promise<CutoutJobRow[]> {
  return (await db.select().from(cutoutJobs).where(eq(cutoutJobs.garmentId, garmentId)).all()) as CutoutJobRow[];
}

/** 按入队时间列出全部任务，并带上真实衣物名称与只读原图路径。 */
export async function listAll(db: AnyDb): Promise<CutoutQueueItem[]> {
  const jobs = (await db.select().from(cutoutJobs).orderBy(asc(cutoutJobs.createdAt)).all()) as CutoutJobRow[];
  const result: CutoutQueueItem[] = [];
  for (const job of jobs) {
    const garment = await db.select().from(garments).where(eq(garments.id, job.garmentId)).get();
    const asset = await db.select().from(garmentAssets).where(eq(garmentAssets.garmentId, job.garmentId)).get();
    result.push({
      job,
      garmentName: garment?.name ?? '未命名衣物',
      originalRelPath: asset?.originalRelPath ?? null,
    });
  }
  return result;
}

export async function clearSourceStaged(db: AnyDb, id: string, now: number): Promise<void> {
  await db.update(cutoutJobs).set({ sourceStagedPath: null, updatedAt: now }).where(eq(cutoutJobs.id, id));
}

// ---- mask strokes ----

export async function appendStroke(db: AnyDb, row: MaskStrokeRow): Promise<void> {
  await db.insert(maskStrokes).values(row);
}

export async function listStrokes(db: AnyDb, garmentId: string): Promise<MaskStrokeRow[]> {
  return (await db
    .select()
    .from(maskStrokes)
    .where(eq(maskStrokes.garmentId, garmentId))
    .orderBy(asc(maskStrokes.ord))
    .all()) as MaskStrokeRow[];
}

export async function popLastStroke(db: AnyDb, garmentId: string): Promise<number | null> {
  const row = await removeLastStrokeRow(db, garmentId);
  return row?.ord ?? null;
}

/**
 * 删除并返回最后一笔。编辑器用完整行实现真正的重做；保留 popLastStroke 的
 * number 返回值，避免破坏既有调用。
 */
export async function removeLastStrokeRow(db: AnyDb, garmentId: string): Promise<MaskStrokeRow | null> {
  const rows = (await db
    .select()
    .from(maskStrokes)
    .where(eq(maskStrokes.garmentId, garmentId))
    .orderBy(asc(maskStrokes.ord))
    .all()) as MaskStrokeRow[];
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  await db.delete(maskStrokes).where(eq(maskStrokes.id, last.id));
  return last;
}

export async function nextOrd(db: AnyDb, garmentId: string): Promise<number> {
  const rows = await listStrokes(db, garmentId);
  return rows.length === 0 ? 0 : rows[rows.length - 1].ord + 1;
}

export async function deleteAllStrokes(db: AnyDb, garmentId: string): Promise<void> {
  await db.delete(maskStrokes).where(eq(maskStrokes.garmentId, garmentId));
}

void and;
