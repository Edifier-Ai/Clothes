/**
 * @jest-environment node
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { createGarment, type GarmentDb } from '../db/dao';
import {
  recommendationItems,
  recommendations,
  wearLogItems,
  wearLogs,
} from '../db/schema';
import { openTestDb, type TestDb } from '../db/sqliteTestHelper';
import { computeCostPerWear, getGarmentStats } from './stats';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

async function seed(db: GarmentDb, id: string, priceMinor: number | null = null) {
  await createGarment(db, {
    id,
    name: `衣物-${id}`,
    category: 'top',
    priceMinor,
    currency: priceMinor != null ? 'CNY' : null,
    asset: {
      id: `${id}-asset`,
      originalRelPath: `originals/${id}.jpg`,
      sha256: `sha-${id}`,
      width: 100,
      height: 100,
      bytes: 10,
      mimeType: 'image/jpeg',
    },
    now: NOW - 100 * DAY,
  });
}

async function seedWearAndRec(t: TestDb) {
  // 两次推荐：r1 含 g1（top）+g2（bottom），r2 含 g1；g1 实际穿过 2 次
  await t.drizzleDb.insert(recommendations).values([
    { id: 'r1', date: '2027-01-01', inputJson: '{}', outfitJson: '{}', totalScore: 1, occasion: null, weatherTempC: null, createdAt: NOW - 10 * DAY },
    { id: 'r2', date: '2027-01-05', inputJson: '{}', outfitJson: '{}', totalScore: 1, occasion: null, weatherTempC: null, createdAt: NOW - 3 * DAY },
    { id: 'r3', date: '2027-01-06', inputJson: '{}', outfitJson: '{}', totalScore: 1, occasion: null, weatherTempC: null, createdAt: NOW - 2 * DAY },
  ]);
  await t.drizzleDb.insert(recommendationItems).values([
    { id: 'ri1', recommendationId: 'r1', garmentId: 'g1', slot: 'top', ord: 0 },
    { id: 'ri2', recommendationId: 'r1', garmentId: 'g2', slot: 'bottom', ord: 1 },
    { id: 'ri3', recommendationId: 'r2', garmentId: 'g1', slot: 'top', ord: 0 },
    { id: 'ri4', recommendationId: 'r3', garmentId: 'g2', slot: 'bottom', ord: 0 },
  ]);
  await t.drizzleDb.insert(wearLogs).values([
    { id: 'w1', recommendationId: 'r1', date: '2027-01-01', occasion: null, comfort: null, note: null, createdAt: NOW - 10 * DAY },
    { id: 'w2', recommendationId: 'r2', date: '2027-01-05', occasion: null, comfort: null, note: null, createdAt: NOW - 3 * DAY },
  ]);
  await t.drizzleDb.insert(wearLogItems).values([
    { id: 'wi1', wearLogId: 'w1', garmentId: 'g1', slot: 'top', ord: 0 },
    { id: 'wi2', wearLogId: 'w1', garmentId: 'g2', slot: 'bottom', ord: 1 },
    { id: 'wi3', wearLogId: 'w2', garmentId: 'g1', slot: 'top', ord: 0 },
  ]);
}

describe('computeCostPerWear（口径：价格 ÷ 穿着次数，仅两者有效时计算）', () => {
  it('价格与次数都有效才计算，精确到分', () => {
    expect(computeCostPerWear(19900, 2)).toBe(9950);
    expect(computeCostPerWear(10000, 3)).toBe(3333); // 3333.33… → 3333 分
  });

  it('无价格或未穿过返回 null（UI 显示口径说明而非假数字）', () => {
    expect(computeCostPerWear(null, 5)).toBeNull();
    expect(computeCostPerWear(0, 5)).toBeNull();
    expect(computeCostPerWear(19900, 0)).toBeNull();
  });
});

describe('getGarmentStats', () => {
  let t: TestDb;
  beforeEach(async () => {
    t = await openTestDb();
    await seed(t.db, 'g1', 19900);
    await seed(t.db, 'g2');
    await seedWearAndRec(t);
  });
  afterEach(() => t.close());

  it('真实穿着次数与最近时间来自 wear_logs', async () => {
    const g1 = (await t.db.getGarment('g1'))!;
    const stats = await getGarmentStats(t.drizzleDb, g1);
    expect(stats.timesWorn).toBe(2);
    expect(stats.lastWornAt).toBe(NOW - 3 * DAY);
    expect(stats.costPerWearMinor).toBe(9950);
  });

  it('使用造型：含该衣物的推荐快照，时间倒序、槽位完整', async () => {
    const g1 = (await t.db.getGarment('g1'))!;
    const stats = await getGarmentStats(t.drizzleDb, g1);
    expect(stats.outfits.map((o) => o.recommendationId)).toEqual(['r2', 'r1']);
    const r1 = stats.outfits.find((o) => o.recommendationId === 'r1')!;
    expect(r1.date).toBe('2027-01-01');
    expect(r1.slots).toEqual([
      { garmentId: 'g1', slot: 'top', name: '衣物-g1' },
      { garmentId: 'g2', slot: 'bottom', name: '衣物-g2' },
    ]);
    // g2 出现在 r1 与 r3
    const g2 = (await t.db.getGarment('g2'))!;
    const stats2 = await getGarmentStats(t.drizzleDb, g2);
    expect(stats2.outfits.map((o) => o.recommendationId)).toEqual(['r3', 'r1']);
  });

  it('无价格衣物成本/次为 null，次数仍真实', async () => {
    const g2 = (await t.db.getGarment('g2'))!;
    const stats = await getGarmentStats(t.drizzleDb, g2);
    expect(stats.timesWorn).toBe(1);
    expect(stats.costPerWearMinor).toBeNull();
  });

  it('从未穿着的衣物：次数 0、最近 null、造型可空', async () => {
    await seed(t.db, 'g9', 5000);
    const g9 = (await t.db.getGarment('g9'))!;
    const stats = await getGarmentStats(t.drizzleDb, g9);
    expect(stats).toMatchObject({ timesWorn: 0, lastWornAt: null, costPerWearMinor: null, outfits: [] });
  });
});
