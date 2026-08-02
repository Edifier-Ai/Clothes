/**
 * @jest-environment node
 */
import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';
import { createGarment } from '../db/dao';
import { wearLogItems, wearLogs } from '../db/schema';
import { openTestDb, type TestDb } from '../db/sqliteTestHelper';
import { buildWardrobeItems } from './query';
import { applyWardrobeFilter, sortWardrobeItems } from './search';

/**
 * MVP-007 性能验收：300 件夹具下聚合 + 组合筛选 + 排序保持响应。
 * 阈值为宿主上限（真机证据另行记录）；实际耗时打印供证据索引引用。
 */

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const COUNT = 300;

const COLORS = ['黑', '白', '灰', '蓝', '棕', '米'];
const SEASONS = ['春', '夏', '秋', '冬', '四季'];
const OCCASIONS = ['通勤', '休闲', '运动', '正式'];
const CATEGORIES = ['top', 'bottom', 'dress', 'shoes', 'outerwear', 'accessory'] as const;

describe('300 件衣橱性能', () => {
  let t: TestDb;

  beforeAll(async () => {
    t = await openTestDb();
    const t0 = Date.now();
    for (let i = 0; i < COUNT; i++) {
      await createGarment(t.db, {
        id: `g${String(i).padStart(3, '0')}`,
        name: `衣物-${i}`,
        category: CATEGORIES[i % CATEGORIES.length],
        status: i % 17 === 0 ? 'laundry' : 'clean',
        priceMinor: i % 3 === 0 ? 10000 + i : null,
        tags: [
          { kind: 'color', value: COLORS[i % COLORS.length] },
          { kind: 'season', value: SEASONS[i % SEASONS.length] },
          { kind: 'occasion', value: OCCASIONS[i % OCCASIONS.length] },
          ...(i % 5 === 0 ? [{ kind: 'brand' as const, value: `品牌${i % 10}` }] : []),
        ],
        asset: {
          id: `a${i}`,
          originalRelPath: `originals/g${i}.jpg`,
          sha256: `sha-${i}`,
          width: 100,
          height: 100,
          bytes: 10,
          mimeType: 'image/jpeg',
        },
        now: NOW - (i % 365) * DAY,
      });
    }
    // 100 件有穿着记录
    for (let i = 0; i < 100; i++) {
      const logId = `w${i}`;
      await t.drizzleDb.insert(wearLogs).values({
        id: logId, recommendationId: `r${i}`, date: '2027-01-01', occasion: null, comfort: null, note: null,
        createdAt: NOW - (i % 90) * DAY,
      });
      await t.drizzleDb.insert(wearLogItems).values({
        id: `wi${i}`, wearLogId: logId, garmentId: `g${String(i).padStart(3, '0')}`, slot: 'top', ord: 0,
      });
    }
    console.log(`[perf] seed ${COUNT} garments: ${Date.now() - t0}ms`);
  }, 120_000);

  afterAll(() => t.close());

  it('聚合 + 组合筛选 + 排序在宿主上限内完成，结果准确', async () => {
    const t0 = Date.now();
    const items = await buildWardrobeItems(t.db, t.drizzleDb);
    const tBuild = Date.now() - t0;
    expect(items).toHaveLength(COUNT);

    const t1 = Date.now();
    const filtered = applyWardrobeFilter(
      items,
      { category: 'top', color: '黑', season: '夏', occasion: '通勤', status: 'clean', notWornDays: 30 },
      NOW,
    );
    const tFilter = Date.now() - t1;

    const t2 = Date.now();
    const sorted = sortWardrobeItems(filtered, 'leastRecentlyWorn');
    const tSort = Date.now() - t2;
    expect(sorted).toHaveLength(filtered.length);

    const t3 = Date.now();
    const searched = applyWardrobeFilter(items, { text: '品牌5' }, NOW);
    const tSearch = Date.now() - t3;

    console.log(`[perf] 300件 build=${tBuild}ms filter=${tFilter}ms sort=${tSort}ms search=${tSearch}ms total=${Date.now() - t0}ms`);

    // 结果准确性抽查：全部满足组合条件
    for (const it of filtered) {
      expect(it.garment.category).toBe('top');
      expect(it.garment.status).toBe('clean');
      expect(it.tags.find((x) => x.kind === 'color')?.value).toBe('黑');
      const basis = it.lastWornAt ?? it.garment.createdAt;
      expect(basis).toBeLessThanOrEqual(NOW - 30 * DAY);
    }
    expect(searched.length).toBeGreaterThan(0);
    for (const it of searched) {
      expect(it.tags.find((x) => x.kind === 'brand')?.value).toBe('品牌5');
    }

    // 宿主上限（真机另行记录；CI 机器波动留足余量）
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(tFilter).toBeLessThan(500);
    expect(tSort).toBeLessThan(500);
  });
});
