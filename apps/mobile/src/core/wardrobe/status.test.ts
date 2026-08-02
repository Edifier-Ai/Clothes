/**
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createGarment, getGarment, listActiveGarments, type GarmentDb } from '../db/dao';
import type { GarmentStatus } from '../db/schema';
import { openTestDb, type TestDb } from '../db/sqliteTestHelper';
import {
  applyPostWearCare,
  archiveGarment,
  changeGarmentStatus,
  listGarmentStatusEvents,
  unarchiveGarment,
} from './status';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

async function seed(db: GarmentDb, id: string, status: GarmentStatus = 'clean') {
  await createGarment(db, {
    id,
    name: `衣物-${id}`,
    category: 'top',
    status,
    asset: {
      id: `${id}-asset`,
      originalRelPath: `originals/${id}.jpg`,
      sha256: `sha-${id}`,
      width: 100,
      height: 100,
      bytes: 10,
      mimeType: 'image/jpeg',
    },
    now: NOW - 10 * DAY,
  });
}

describe('changeGarmentStatus', () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await openTestDb();
  });
  afterEach(() => t.close());

  it('状态变化落事件：from/to/时间戳齐全', async () => {
    await seed(t.db, 'g1');
    const r = await changeGarmentStatus(t.db, 'g1', 'laundry', NOW);
    expect(r).toEqual({ changed: true, from: 'clean' });
    const detail = await getGarment(t.db, 'g1');
    expect(detail?.garment.status).toBe('laundry');
    expect(detail?.garment.updatedAt).toBe(NOW);
    const events = await listGarmentStatusEvents(t.db, 'g1');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ garmentId: 'g1', fromStatus: 'clean', toStatus: 'laundry', changedAt: NOW });
  });

  it('相同状态不重复记事件', async () => {
    await seed(t.db, 'g1', 'laundry');
    const r = await changeGarmentStatus(t.db, 'g1', 'laundry', NOW);
    expect(r.changed).toBe(false);
    expect(await listGarmentStatusEvents(t.db, 'g1')).toHaveLength(0);
  });

  it('多次流转按时间升序可追溯', async () => {
    await seed(t.db, 'g1');
    await changeGarmentStatus(t.db, 'g1', 'laundry', NOW);
    await changeGarmentStatus(t.db, 'g1', 'dryclean', NOW + DAY);
    await changeGarmentStatus(t.db, 'g1', 'clean', NOW + 2 * DAY);
    const events = await listGarmentStatusEvents(t.db, 'g1');
    expect(events.map((e) => e.toStatus)).toEqual(['laundry', 'dryclean', 'clean']);
    expect(events.map((e) => e.changedAt)).toEqual([NOW, NOW + DAY, NOW + 2 * DAY]);
  });

  it('不存在或已删除的衣物报错', async () => {
    await expect(changeGarmentStatus(t.db, 'ghost', 'laundry', NOW)).rejects.toThrow();
  });

  it('归档衣物不能直接改状态，需先恢复', async () => {
    await seed(t.db, 'g1');
    await archiveGarment(t.db, 'g1', NOW);
    await expect(changeGarmentStatus(t.db, 'g1', 'laundry', NOW + DAY)).rejects.toThrow();
  });
});

describe('archiveGarment / unarchiveGarment', () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await openTestDb();
  });
  afterEach(() => t.close());

  it('归档后从默认列表移除并记录事件', async () => {
    await seed(t.db, 'g1');
    await seed(t.db, 'g2');
    const r = await archiveGarment(t.db, 'g1', NOW);
    expect(r.changed).toBe(true);
    const active = await listActiveGarments(t.db);
    expect(active.map((g) => g.id)).toEqual(['g2']);
    const events = await listGarmentStatusEvents(t.db, 'g1');
    expect(events.at(-1)).toMatchObject({ fromStatus: 'clean', toStatus: 'archived', changedAt: NOW });
  });

  it('重复归档幂等', async () => {
    await seed(t.db, 'g1');
    await archiveGarment(t.db, 'g1', NOW);
    const r = await archiveGarment(t.db, 'g1', NOW + DAY);
    expect(r.changed).toBe(false);
    expect(await listGarmentStatusEvents(t.db, 'g1')).toHaveLength(1);
  });

  it('恢复后回到默认列表且历史保留', async () => {
    await seed(t.db, 'g1');
    await changeGarmentStatus(t.db, 'g1', 'laundry', NOW);
    await archiveGarment(t.db, 'g1', NOW + DAY);
    const r = await unarchiveGarment(t.db, 'g1', NOW + 2 * DAY);
    expect(r.changed).toBe(true);
    const active = await listActiveGarments(t.db);
    expect(active.map((g) => g.id)).toEqual(['g1']);
    // 归档不清状态：恢复后仍为 laundry，历史 3 条完整
    const detail = await getGarment(t.db, 'g1');
    expect(detail?.garment.status).toBe('laundry');
    expect(detail?.garment.archivedAt).toBeNull();
    const events = await listGarmentStatusEvents(t.db, 'g1');
    expect(events.map((e) => e.toStatus)).toEqual(['laundry', 'archived', 'restored']);
  });
});

describe('applyPostWearCare（TDY-07 穿后联动）', () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await openTestDb();
  });
  afterEach(() => t.close());

  it('逐件更新洗护状态，跳过项不被篡改', async () => {
    await seed(t.db, 'g1');
    await seed(t.db, 'g2', 'dryclean');
    await seed(t.db, 'g3');
    const r = await applyPostWearCare(
      t.db,
      [
        { garmentId: 'g1', action: 'laundry' },
        { garmentId: 'g2', action: 'skip' },
        { garmentId: 'g3', action: 'clean' },
      ],
      NOW,
    );
    expect(r.updatedIds.sort()).toEqual(['g1', 'g3']);
    expect(r.skippedIds).toEqual(['g2']);
    expect((await getGarment(t.db, 'g1'))?.garment.status).toBe('laundry');
    // 跳过：状态不变、无事件
    expect((await getGarment(t.db, 'g2'))?.garment.status).toBe('dryclean');
    expect(await listGarmentStatusEvents(t.db, 'g2')).toHaveLength(0);
    // g3 本就 clean：无事件但算已处理
    expect(await listGarmentStatusEvents(t.db, 'g3')).toHaveLength(0);
    expect(await listGarmentStatusEvents(t.db, 'g1')).toHaveLength(1);
  });

  it('含不存在衣物时整体回滚，任何一件都不被改', async () => {
    await seed(t.db, 'g1');
    await seed(t.db, 'g2');
    await expect(
      applyPostWearCare(
        t.db,
        [
          { garmentId: 'g1', action: 'laundry' },
          { garmentId: 'ghost', action: 'laundry' },
        ],
        NOW,
      ),
    ).rejects.toThrow();
    expect((await getGarment(t.db, 'g1'))?.garment.status).toBe('clean');
    expect((await getGarment(t.db, 'g2'))?.garment.status).toBe('clean');
    expect(await listGarmentStatusEvents(t.db, 'g1')).toHaveLength(0);
  });
});
