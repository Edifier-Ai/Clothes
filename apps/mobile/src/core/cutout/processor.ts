import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import * as schema from '../db/schema';
import {
  claimNext,
  getJob,
  listByStatus,
  markFailed,
  markSucceeded,
  recoverRunning,
  type JobStatus,
} from '../db/queue';
import type { SegmentationEngine } from '../../native/segmentationEngine';
import type { DerivedPaths, PipelineIO } from './pipelineCore';
import { produceDerived } from './pipelineCore';

type AnyDb = ExpoSQLiteDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

export interface ProcessorDeps {
  db: AnyDb;
  engine: SegmentationEngine;
  io: PipelineIO;
  /** 源暂存图扩展名解析（按 job） */
  extForJob: (jobId: string) => string;
  maxAttempts?: number;
  maskWidth?: number;
  maskHeight?: number;
  thumbSize?: number;
  onProgress?: (snapshot: QueueSnapshot) => void;
}

export interface QueueSnapshot {
  pending: number;
  running: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  total: number;
}

export async function snapshot(deps: ProcessorDeps): Promise<QueueSnapshot> {
  const count = async (s: JobStatus) => (await listByStatus(deps.db, s)).length;
  const pending = await count('pending');
  const running = await count('running');
  const succeeded = await count('succeeded');
  const failed = await count('failed');
  const cancelled = await count('cancelled');
  return { pending, running, succeeded, failed, cancelled, total: pending + running + succeeded + failed + cancelled };
}

/** 启动恢复：把异常 running 复位为 pending。返回复位条数。 */
export async function recover(deps: ProcessorDeps, now = Date.now()): Promise<number> {
  const n = await recoverRunning(deps.db, now);
  if (n > 0) deps.onProgress?.(await snapshot(deps));
  return n;
}

/** 顺序处理队列直至空（并发 1）。每张完成即提交。返回本次处理数。 */
export async function drain(deps: ProcessorDeps): Promise<number> {
  const maxAttempts = deps.maxAttempts ?? 3;
  const mw = deps.maskWidth ?? 256;
  const mh = deps.maskHeight ?? 320;
  const thumb = deps.thumbSize ?? 96;
  let processed = 0;
  while (true) {
    const job = await claimNext(deps.db, Date.now());
    if (!job) break;
    deps.onProgress?.(await snapshot(deps));
    try {
      if (!deps.engine.available) throw new Error(deps.engine.unavailableReason ?? 'engine unavailable');
      const seg = await deps.engine.segment({
        sourcePath: job.sourceStagedPath ?? deps.io.relToAbs(`_staging/${job.id}.bin`),
        maskWidth: mw,
        maskHeight: mh,
      });
      const derived: DerivedPaths = await produceDerived(deps.io, {
        jobId: job.id,
        garmentId: job.garmentId,
        sourceStagedAbs: job.sourceStagedPath ?? deps.io.relToAbs(`_staging/${job.id}.bin`),
        ext: deps.extForJob(job.id),
        alpha: seg.alpha,
        maskW: seg.width,
        maskH: seg.height,
        thumbSize: thumb,
      });
      await markSucceeded(deps.db, job.id, derived, Date.now());
      processed++;
    } catch (e) {
      const code = e instanceof Error ? e.name || 'ERROR' : 'ERROR';
      await markFailed(deps.db, job.id, code, String(e), maxAttempts, Date.now());
    }
    deps.onProgress?.(await snapshot(deps));
  }
  return processed;
}

export { getJob };
