/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

import * as schema from './schema';
import { garments } from './schema';
import {
  appendStroke,
  cancel,
  claimNext,
  enqueue,
  getJob,
  listStrokes,
  markFailed,
  markSucceeded,
  nextOrd,
  popLastStroke,
  recoverRunning,
} from './queue';
import { openQueueTestDb } from './queueTestHelper';

async function seedGarment(db: BetterSQLite3Database<typeof schema>, id: string): Promise<void> {
  await db.insert(garments).values({
    id,
    name: id,
    category: 'top',
    status: 'clean',
    priceMinor: null,
    currency: null,
    purchaseDate: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: 1,
    updatedAt: 1,
  });
}

describe('抠图队列状态机', () => {
  it('enqueue→claim→succeeded 全链路', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.db, 'g1');
    const e = await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/s/1', now: 10 });
    expect(e.deduped).toBe(false);
    const claimed = await claimNext(t.db, 20);
    expect(claimed?.id).toBe('j1');
    expect(claimed?.status).toBe('running');
    expect(claimed?.attempts).toBe(1);
    await markSucceeded(t.db, 'j1', { originalRelPath: 'o', maskRelPath: 'm', previewRelPath: 'p', thumbnailRelPath: 't', width: 10, height: 20 }, 30);
    const job = await getJob(t.db, 'j1');
    expect(job?.status).toBe('succeeded');
    expect(job?.originalRelPath).toBe('o');
    expect(job?.sourceStagedPath).toBeNull();
    t.close();
  });

  it('幂等入队：同 garment 非终态任务不重复', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.db, 'g1');
    await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/s/1', now: 1 });
    const e2 = await enqueue(t.db, { id: 'j2', garmentId: 'g1', sourceStagedPath: '/s/2', now: 2 });
    expect(e2.deduped).toBe(true);
    expect(e2.id).toBe('j1');
    t.close();
  });

  it('failed 在 attempts<max 时回 pending 可重试，达上限转 failed', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.db, 'g1');
    await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/s', now: 1 });
    await claimNext(t.db, 2); // attempts=1
    const s1 = await markFailed(t.db, 'j1', 'E', 'boom', 3, 3);
    expect(s1).toBe('pending'); // 1<3 重试
    await claimNext(t.db, 4); // attempts=2
    const s2 = await markFailed(t.db, 'j1', 'E', 'boom', 3, 5);
    expect(s2).toBe('pending'); // 2<3
    await claimNext(t.db, 6); // attempts=3
    const s3 = await markFailed(t.db, 'j1', 'E', 'boom', 3, 7);
    expect(s3).toBe('failed'); // 3<3 false
    t.close();
  });

  it('recoverRunning：异常 running 复位为 pending（杀进程恢复）', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.db, 'g1');
    await seedGarment(t.db, 'g2');
    await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/1', now: 1 });
    await enqueue(t.db, { id: 'j2', garmentId: 'g2', sourceStagedPath: '/2', now: 2 });
    await claimNext(t.db, 3); // j1 running
    // 模拟杀进程：直接 recover
    const n = await recoverRunning(t.db, 99);
    expect(n).toBe(1);
    expect((await getJob(t.db, 'j1'))?.status).toBe('pending');
    expect((await getJob(t.db, 'j1'))?.errorCode).toBe('RECOVERED_INTERRUPTED');
    // 复位后能再次 claim
    const again = await claimNext(t.db, 100);
    expect(again?.id).toBe('j1');
    t.close();
  });

  it('cancel 置 cancelled 且不被 claim', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.db, 'g1');
    await enqueue(t.db, { id: 'j1', garmentId: 'g1', sourceStagedPath: '/1', now: 1 });
    await cancel(t.db, 'j1', 2);
    expect(await claimNext(t.db, 3)).toBeNull();
    t.close();
  });
});

describe('修边操作栈（撤销/重做边界）', () => {
  it('append 顺序 ord 递增；popLast 撤销最近一条', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.db, 'g1');
    const mk = (ord: number, op: 'erase' | 'restore') => ({
      id: `s${ord}`,
      garmentId: 'g1',
      op,
      pointsJson: JSON.stringify([0, 0, 1, 1]),
      brushSize: 5,
      ord,
      createdAt: ord,
    });
    await appendStroke(t.db, mk(0, 'erase'));
    await appendStroke(t.db, mk(1, 'restore'));
    await appendStroke(t.db, mk(2, 'erase'));
    expect(await listStrokes(t.db, 'g1')).toHaveLength(3);
    expect(await nextOrd(t.db, 'g1')).toBe(3);
    const removed = await popLastStroke(t.db, 'g1');
    expect(removed).toBe(2);
    expect(await listStrokes(t.db, 'g1')).toHaveLength(2);
    expect(await nextOrd(t.db, 'g1')).toBe(2);
    t.close();
  });

  it('空栈 popLast 返回 null（撤销边界）', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.db, 'g1');
    expect(await popLastStroke(t.db, 'g1')).toBeNull();
    t.close();
  });
});
