import { and, asc, eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import * as schema from './schema';
import { cutoutJobs, maskStrokes, type CutoutJobRow, type MaskStrokeRow } from './schema';

/**
 * 抠图队列 + 修边操作栈（MVP-003）。直接基于 drizzle 实例，状态机：
 * pending→running→succeeded/failed/cancelled；幂等入队；recoverRunning 把异常 running 复位。
 * 设备传 drizzle(expo-sqlite)，测试传 drizzle(better-sqlite3)，查询构建器调用一致。
 */

type AnyDb = ExpoSQLiteDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

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
  const rows = (await db
    .select()
    .from(maskStrokes)
    .where(eq(maskStrokes.garmentId, garmentId))
    .orderBy(asc(maskStrokes.ord))
    .all()) as MaskStrokeRow[];
  if (rows.length === 0) return null;
  const last = rows[rows.length - 1];
  await db.delete(maskStrokes).where(eq(maskStrokes.id, last.id));
  return last.ord;
}

export async function nextOrd(db: AnyDb, garmentId: string): Promise<number> {
  const rows = await listStrokes(db, garmentId);
  return rows.length === 0 ? 0 : rows[rows.length - 1].ord + 1;
}

export async function deleteAllStrokes(db: AnyDb, garmentId: string): Promise<void> {
  await db.delete(maskStrokes).where(eq(maskStrokes.garmentId, garmentId));
}

void and;
