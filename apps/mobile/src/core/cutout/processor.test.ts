/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { PNG } from 'pngjs';

import { claimNext, enqueue } from '../db/queue';
import { openQueueTestDb } from '../db/queueTestHelper';
import { garments } from '../db/schema';
import type { SegmentationEngine, SegmentationOutput } from '../../native/segmentationEngine';
import type { PipelineIO } from './pipelineCore';
import { drain, getJob, recover, snapshot } from './processor';

function memIO(): PipelineIO {
  const store = new Map<string, Uint8Array>();
  const tmp = new Map<string, Uint8Array>();
  return {
    _seedSource: (b) => store.set('_src', b),
    relToAbs: (r) => `/m/${r}`,
    readBytes: async (p) => {
      for (const [rel, a] of store) if (`/m/${rel}` === p) return a;
      const b = store.get(p);
      if (b) return b;
      throw new Error('nf ' + p);
    },
    encodePng: (rgba, w, h) => {
      const png = new PNG({ width: w, height: h });
      Buffer.from(rgba).copy(png.data);
      return PNG.sync.write(png);
    },
    encodeAlphaPng: (alpha, w, h) => {
      const png = new PNG({ width: w, height: h });
      for (let i = 0; i < w * h; i++) {
        png.data[i * 4] = alpha[i];
        png.data[i * 4 + 1] = alpha[i];
        png.data[i * 4 + 2] = alpha[i];
        png.data[i * 4 + 3] = 255;
      }
      return PNG.sync.write(png);
    },
    decodePng: (bytes) => {
      const png = PNG.sync.read(Buffer.from(bytes));
      return { rgba: new Uint8Array(png.data), w: png.width, h: png.height };
    },
    writeTmp: async (r, b) => {
      tmp.set(r, b);
    },
    commitTmp: async (t, f) => {
      const b = tmp.get(t);
      if (!b) throw new Error('tmp nf');
      store.set(f, b);
      tmp.delete(t);
    },
    deleteTmp: async (r) => {
      tmp.delete(r);
    },
    exists: async (r) => store.has(r) || store.has(`/m/${r}`),
    copyOriginalIfAbsent: async (_s, rel) => {
      const abs = `/m/${rel}`;
      const src = store.get('_src')!;
      if (!store.has(rel)) store.set(rel, src);
      if (!store.has(abs)) store.set(abs, src);
    },
  };
}

class FakeEngine implements SegmentationEngine {
  readonly name = 'fake';
  available = true;
  constructor(private failIds: Set<string> = new Set()) {}
  async segment(input: { sourcePath: string; maskWidth: number; maskHeight: number }): Promise<SegmentationOutput> {
    if (this.failIds.has(input.sourcePath)) throw new Error('simulated model failure');
    return { alpha: new Uint8Array(input.maskWidth * input.maskHeight).fill(200), width: input.maskWidth, height: input.maskHeight, ms: 1 };
  }
}

async function seed(db: ReturnType<typeof openQueueTestDb>['db'], id: string): Promise<void> {
  await db.insert(garments).values({ id, name: id, category: 'top', status: 'clean', priceMinor: null, currency: null, purchaseDate: null, archivedAt: null, deletedAt: null, createdAt: 1, updatedAt: 1 });
}

function srcPng(): Uint8Array {
  const png = new PNG({ width: 8, height: 8 });
  for (let i = 0; i < 64; i++) {
    png.data[i * 4] = 180;
    png.data[i * 4 + 1] = 40;
    png.data[i * 4 + 2] = 50;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

describe('队列处理器', () => {
  it('drain 顺序处理全部成功 + 进度快照', async () => {
    const t = openQueueTestDb();
    const io = memIO();
    io._seedSource?.(srcPng());
    for (const id of ['g1', 'g2', 'g3']) {
      await seed(t.db, id);
      await enqueue(t.db, { id: `j-${id}`, garmentId: id, sourceStagedPath: `/m/_src`, now: 1 });
    }
    const snaps: number[] = [];
    const n = await drain({ db: t.db, engine: new FakeEngine(), io, extForJob: () => 'png', onProgress: (s) => snaps.push(s.succeeded) });
    expect(n).toBe(3);
    const final = await snapshot({ db: t.db, engine: new FakeEngine(), io, extForJob: () => 'png' });
    expect(final.succeeded).toBe(3);
    expect(final.pending).toBe(0);
    expect(snaps[snaps.length - 1]).toBe(3);
    t.close();
  });

  it('失败注入：引擎抛错→failed，不阻塞其余', async () => {
    const t = openQueueTestDb();
    const io = memIO();
    io._seedSource?.(srcPng());
    await seed(t.db, 'g1');
    await seed(t.db, 'g2');
    await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/m/_src', now: 1 });
    await enqueue(t.db, { id: 'j2', garmentId: 'g2', sourceStagedPath: '/m/FAIL', now: 2 });
    const engine = new FakeEngine(new Set(['/m/FAIL']));
    await drain({ db: t.db, engine, io, extForJob: (jid) => (jid === 'j2' ? 'png' : 'png'), maxAttempts: 1 });
    const s = await snapshot({ db: t.db, engine, io, extForJob: () => 'png' });
    expect(s.failed).toBe(1);
    expect(s.succeeded).toBe(1);
    t.close();
  });

  it('recover 复位 running→pending 后 drain 继续', async () => {
    const t = openQueueTestDb();
    const io = memIO();
    io._seedSource?.(srcPng());
    await seed(t.db, 'g1');
    await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/m/_src', now: 1 });
    // 模拟处理中崩溃：手动置 running
    await claimNext(t.db, 2);
    const n = await recover({ db: t.db, engine: new FakeEngine(), io, extForJob: () => 'png' });
    expect(n).toBe(1);
    const drained = await drain({ db: t.db, engine: new FakeEngine(), io, extForJob: () => 'png' });
    expect(drained).toBe(1);
    t.close();
  });
});

describe('队列处理器：引擎不可用与断网语义', () => {
  class UnavailableEngine implements SegmentationEngine {
    readonly name = 'unavailable';
    readonly available = false;
    readonly unavailableReason = '未配置腾讯云凭证';
    async segment(): Promise<SegmentationOutput> {
      throw new Error('engine unavailable: 未配置腾讯云凭证');
    }
  }

  class NetworkFailEngine implements SegmentationEngine {
    readonly name = 'network-fail';
    readonly available = true;
    async segment(): Promise<SegmentationOutput> {
      // RN fetch 断网抛 TypeError（与 defaultIsTransientError 约定一致）
      throw new TypeError('Network request failed');
    }
  }

  it('引擎 unavailable：drain 不领取任务，保持 pending 不标 failed、不计 attempts', async () => {
    const t = openQueueTestDb();
    const io = memIO();
    io._seedSource?.(srcPng());
    await seed(t.db, 'g1');
    await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/m/_src', now: 1 });
    const engine = new UnavailableEngine();
    const n = await drain({ db: t.db, engine, io, extForJob: () => 'png' });
    expect(n).toBe(0);
    const job = await getJob(t.db, 'j1');
    expect(job!.status).toBe('pending');
    expect(job!.attempts).toBe(0);
    const s = await snapshot({ db: t.db, engine, io, extForJob: () => 'png' });
    expect(s.pending).toBe(1);
    expect(s.failed).toBe(0);
    t.close();
  });

  it('网络错误：任务回 pending 且 attempts+1，同轮中断不烧尽后续任务的重试次数', async () => {
    const t = openQueueTestDb();
    const io = memIO();
    io._seedSource?.(srcPng());
    await seed(t.db, 'g1');
    await seed(t.db, 'g2');
    await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/m/_src', now: 1 });
    await enqueue(t.db, { id: 'j2', garmentId: 'g2', sourceStagedPath: '/m/_src', now: 2 });
    const engine = new NetworkFailEngine();
    const n = await drain({ db: t.db, engine, io, extForJob: () => 'png' });
    expect(n).toBe(0);
    const j1 = await getJob(t.db, 'j1');
    expect(j1!.status).toBe('pending');
    expect(j1!.attempts).toBe(1);
    expect(j1!.errorCode).toBe('TypeError');
    // 中断本轮：j2 未被领取，attempts 不增长
    const j2 = await getJob(t.db, 'j2');
    expect(j2!.status).toBe('pending');
    expect(j2!.attempts).toBe(0);
    const s = await snapshot({ db: t.db, engine, io, extForJob: () => 'png' });
    expect(s.failed).toBe(0);
    expect(s.pending).toBe(2);
    t.close();
  });

  it('网络错误跨多轮 drain 不标 failed（每轮只计一次 attempts）', async () => {
    const t = openQueueTestDb();
    const io = memIO();
    io._seedSource?.(srcPng());
    await seed(t.db, 'g1');
    await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/m/_src', now: 1 });
    const engine = new NetworkFailEngine();
    for (let i = 0; i < 3; i++) {
      await drain({ db: t.db, engine, io, extForJob: () => 'png' });
    }
    const job = await getJob(t.db, 'j1');
    expect(job!.status).toBe('pending');
    expect(job!.attempts).toBe(3);
    t.close();
  });

  it('available 异步语义：初始 false，refreshAvailability 后可用则正常处理', async () => {
    const t = openQueueTestDb();
    const io = memIO();
    io._seedSource?.(srcPng());
    await seed(t.db, 'g1');
    await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/m/_src', now: 1 });
    class LazyEngine implements SegmentationEngine {
      readonly name = 'lazy';
      available = false;
      refreshed = 0;
      async refreshAvailability(): Promise<boolean> {
        this.refreshed++;
        this.available = true;
        return true;
      }
      async segment(input: { sourcePath: string; maskWidth: number; maskHeight: number }): Promise<SegmentationOutput> {
        return { alpha: new Uint8Array(input.maskWidth * input.maskHeight).fill(255), width: input.maskWidth, height: input.maskHeight, ms: 1 };
      }
    }
    const engine = new LazyEngine();
    const n = await drain({ db: t.db, engine, io, extForJob: () => 'png' });
    expect(engine.refreshed).toBe(1);
    expect(n).toBe(1);
    const s = await snapshot({ db: t.db, engine, io, extForJob: () => 'png' });
    expect(s.succeeded).toBe(1);
    t.close();
  });
});
