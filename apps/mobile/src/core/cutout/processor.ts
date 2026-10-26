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
  requeuePending,
  setAutoColorTagIfAbsent,
  type JobStatus,
} from '../db/queue';
import type { SegmentationEngine } from '../../native/segmentationEngine';
import type { DerivedPaths, PipelineIO } from './pipelineCore';
import { produceDerived } from './pipelineCore';

type AnyDb = ExpoSQLiteDatabase<typeof schema> | BetterSQLite3Database<typeof schema>;

/**
 * 临时（网络类）错误名约定：任务回 pending 并中断本轮 drain，联网后续跑。
 * - TypeError：RN fetch 网络层失败（断网/DNS/连接拒绝）抛出的错误名；
 * - CutoutNetworkError：引擎显式命名的网络错误（保留给引擎层使用）。
 */
export const TRANSIENT_ERROR_NAMES: readonly string[] = ['CutoutNetworkError', 'TypeError'];

export function defaultIsTransientError(e: unknown): boolean {
  return e instanceof Error && TRANSIENT_ERROR_NAMES.includes(e.name);
}

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
  /** 临时错误判定（默认 defaultIsTransientError）；命中 → 回 pending + 中断本轮 */
  isTransientError?: (e: unknown) => boolean;
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
  const isTransient = deps.isTransientError ?? defaultIsTransientError;
  // 引擎 available 为异步语义（TencentCiEngine 构造时为 false）：drain 前刷新一次
  if (deps.engine.refreshAvailability) await deps.engine.refreshAvailability();
  let processed = 0;
  while (true) {
    // 引擎不可用（未配置/未同意）：任务保持 pending，绝不标 failed，等配置/告知就绪后续跑
    if (!deps.engine.available) break;
    const job = await claimNext(deps.db, Date.now());
    if (!job) break;
    deps.onProgress?.(await snapshot(deps));
    try {
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
      if (derived.dominantColor) {
        // 主色是附加信息，写不进去不能把已成功的抠图拖成失败。
        await setAutoColorTagIfAbsent(deps.db, job.garmentId, derived.dominantColor).catch(() => undefined);
      }
    } catch (e) {
      const code = e instanceof Error ? e.name || 'ERROR' : 'ERROR';
      if (isTransient(e)) {
        // 断网/API 不可达：任务回 pending（attempts 已计），并中断本轮——
        // 同一故障会让后续任务连续失败，继续循环只会烧尽重试次数把它们全标 failed
        await requeuePending(deps.db, job.id, code, String(e), Date.now());
        deps.onProgress?.(await snapshot(deps));
        break;
      }
      await markFailed(deps.db, job.id, code, String(e), maxAttempts, Date.now());
    }
    deps.onProgress?.(await snapshot(deps));
  }
  return processed;
}

export { getJob };
