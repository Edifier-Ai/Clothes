/**
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createGarment, getGarment, listActiveGarments, type GarmentDb } from '../db/dao';
import { getWearStats } from '../recommend/wearLog';
import { wearLogItems, wearLogs } from '../db/schema';
import { openTestDb, type TestDb } from '../db/sqliteTestHelper';
import { batchUpdateGarments, BatchApplyError } from './batch';
import { archiveGarment, listGarmentStatusEvents } from './status';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

async function seed(db: GarmentDb, id: string) {
  await createGarment(db, {
    id,
    name: `衣物-${id}`,
    category: 'top',
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

describe('batchUpdateGarments', () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await openTestDb();
    await seed(t.db, 'g1');
    await seed(t.db, 'g2');
    await seed(t.db, 'g3');
  });
  afterEach(() => t.close());

  it('批量状态：事务内全部更新且逐件记事件', async () => {
    const r = await batchUpdateGarments(t.db, ['g1', 'g2'], { status: 'laundry' }, NOW);
    expect(r.updated).toBe(2);
    for (const id of ['g1', 'g2']) {
      expect((await getGarment(t.db, id))?.garment.status).toBe('laundry');
      expect(await listGarmentStatusEvents(t.db, id)).toHaveLength(1);
    }
    expect((await getGarment(t.db, 'g3'))?.garment.status).toBe('clean');
  });

  it('批量归档：从默认列表移除，恢复后衣物与历史完整', async () => {
    // g1 有一条穿着记录：归档不得丢历史
    await t.drizzleDb.insert(wearLogs).values({
      id: 'w1', recommendationId: 'r1', date: '2027-01-01', occasion: null, comfort: null, note: null, createdAt: NOW - DAY,
    });
    await t.drizzleDb.insert(wearLogItems).values({ id: 'w1-i0', wearLogId: 'w1', garmentId: 'g1', slot: 'top', ord: 0 });

    await batchUpdateGarments(t.db, ['g1', 'g2'], { archive: true }, NOW);
    expect((await listActiveGarments(t.db)).map((g) => g.id)).toEqual(['g3']);

    await batchUpdateGarments(t.db, ['g1'], { archive: false }, NOW + DAY);
    const active = await listActiveGarments(t.db);
    expect(active.map((g) => g.id).sort()).toEqual(['g1', 'g3']);
    const stats = await getWearStats(t.drizzleDb);
    expect(stats.get('g1')).toEqual({ lastWornAt: NOW - DAY, timesWorn: 1 });
    expect((await listGarmentStatusEvents(t.db, 'g1')).map((e) => e.toStatus)).toEqual(['archived', 'restored']);
  });

  it('批量加标签：追加不覆盖既有标签', async () => {
    await batchUpdateGarments(t.db, ['g1'], { addTag: { kind: 'season', value: '冬' } }, NOW);
    await batchUpdateGarments(t.db, ['g1'], { addTag: { kind: 'occasion', value: '通勤' } }, NOW + DAY);
    const detail = await getGarment(t.db, 'g1');
    expect(detail?.tags.map((x) => `${x.kind}:${x.value}`).sort()).toEqual(['occasion:通勤', 'season:冬']);
  });

  it('反向验证：中途一件失败，整体回滚，无半数衣物被改', async () => {
    await expect(
      batchUpdateGarments(t.db, ['g1', 'ghost', 'g2'], { status: 'laundry' }, NOW),
    ).rejects.toBeInstanceOf(BatchApplyError);
    for (const id of ['g1', 'g2', 'g3']) {
      expect((await getGarment(t.db, id))?.garment.status).toBe('clean');
      expect(await listGarmentStatusEvents(t.db, id)).toHaveLength(0);
    }
  });

  it('反向验证：写入阶段失败（归档衣物改状态），事务回滚无半成品', async () => {
    // g2 已归档：存在性预校验通过，但 applyOne 在写入阶段才抛错；
    // 此时 g1 已写入，只有事务回滚能保证无半数衣物被改。
    await archiveGarment(t.db, 'g2', NOW);
    await expect(
      batchUpdateGarments(t.db, ['g1', 'g2'], { status: 'laundry' }, NOW + DAY),
    ).rejects.toBeInstanceOf(BatchApplyError);
    expect((await getGarment(t.db, 'g1'))?.garment.status).toBe('clean');
    expect(await listGarmentStatusEvents(t.db, 'g1')).toHaveLength(0);
    // g2 保持归档且无新增事件
    expect((await getGarment(t.db, 'g2'))?.garment.archivedAt).toBe(NOW);
    expect(await listGarmentStatusEvents(t.db, 'g2')).toHaveLength(1);
  });

  it('组合补丁：状态+标签一次事务生效', async () => {
    await batchUpdateGarments(t.db, ['g1'], { status: 'dryclean', addTag: { kind: 'note', value: '送洗门店 A' } }, NOW);
    const detail = await getGarment(t.db, 'g1');
    expect(detail?.garment.status).toBe('dryclean');
    expect(detail?.tags.map((x) => x.value)).toContain('送洗门店 A');
  });
});
