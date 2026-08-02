/**
 * @jest-environment node
 *
 * 洞察服务测试（MVP-011）：固定日期/金额夹具覆盖任务卡全部验收点：
 * - 指标可手工复算，页面口径与代码一致
 * - 编辑/删除穿着记录后同步更新（实时算，不缓存）
 * - 归档保留历史贡献但不进当前可穿库存/久未穿
 * - 脱敏分享产物不泄漏受保护字段
 * - 0 次无价格不出现除零/NaN/虚假成本
 * - 时区：date 字面量分组，不依赖 epoch
 * - 学习期：wearDays<7 显示提示
 */
import { describe, expect, it } from '@jest/globals';

import { createGarment } from '../db/dao';
import { openQueueTestDb } from '../db/queueTestHelper';
import { recordWear } from '../recommend/wearLog';
import type { Outfit } from '../recommend';

import {
  assembleFacts,
  getCostPerWearListCore,
  getIdleReportCore,
  getMonthlyReportCore,
  getOverviewCore,
} from './insightsService';
import { hasProtectedLeak, PROTECTED_FIELD_KEYS } from './metrics';
import type { GarmentForRec } from '../recommend';

// 锚点：2026-07-31 00:00:00 UTC = 1753920000000ms
const ANCHOR = Date.UTC(2026, 6, 31);
const DAY = 86_400_000;

function rec(id: string, category: GarmentForRec['category']): GarmentForRec {
  return {
    id,
    category,
    status: 'clean',
    createdAt: ANCHOR,
    updatedAt: ANCHOR,
    lastWornAt: null,
    timesWorn: 0,
  };
}

function outfit(topId: string, bottomId: string, shoesId: string, outerId?: string): Outfit {
  return {
    top: rec(topId, 'top'),
    bottom: rec(bottomId, 'bottom'),
    shoes: rec(shoesId, 'shoes'),
    ...(outerId ? { outerwear: rec(outerId, 'outerwear') } : {}),
  };
}

async function seedGarment(
  db: import('../db/dao').GarmentDb,
  id: string,
  category: string,
  opts: { priceMinor?: number | null; archivedAt?: number | null; deletedAt?: number | null; createdAt?: number } = {},
): Promise<void> {
  await createGarment(db, {
    id,
    name: id,
    category: category as never,
    now: opts.createdAt ?? ANCHOR,
    asset: {
      id: `${id}-a`,
      originalRelPath: `o/${id}.jpg`,
      sha256: `h${id}`,
      width: 0,
      height: 0,
      bytes: 0,
      mimeType: 'image/jpeg',
    },
  });
  if (opts.priceMinor !== undefined && opts.priceMinor !== null) {
    await db.updateGarment(id, { priceMinor: opts.priceMinor });
  }
  if (opts.archivedAt != null) {
    await db.updateGarment(id, { archivedAt: opts.archivedAt });
  }
  if (opts.deletedAt != null) {
    await db.updateDeletedAt(id, opts.deletedAt, opts.deletedAt + 1);
  }
}

describe('assembleFacts:墓碑 items 过滤', () => {
  it('wear_log_items 引用墓碑 garment 时被装配层过滤', () => {
    const garmentRows = [
      { id: 'g1', deletedAt: null, archivedAt: null, category: 'top', priceMinor: null, purchaseDate: null, createdAt: ANCHOR },
      { id: 'g2', deletedAt: ANCHOR + 1, archivedAt: null, category: 'bottom', priceMinor: null, purchaseDate: null, createdAt: ANCHOR },
    ] as never;
    const wearLogs = [
      { id: 'w1', date: '2026-07-31', createdAt: ANCHOR, items: [{ garmentId: 'g1', slot: 'top', ord: 0 }, { garmentId: 'g2', slot: 'bottom', ord: 1 }] },
    ] as never;
    const facts = assembleFacts(wearLogs, garmentRows);
    expect(facts.wearLogs[0].garmentIds).toEqual(['g1']);
    expect(facts.garmentRows.has('g2')).toBe(false);
    expect(facts.garments.find((g) => g.id === 'g2')!.deletedAt).not.toBeNull();
  });
});

describe('getOverviewCore:指标口径可手工复算', () => {
  it('空衣橱：全 0，进入学习期', async () => {
    const t = openQueueTestDb();
    const view = await getOverviewCore(t.garmentDb, t.db, ANCHOR);
    expect(view.overview).toEqual({
      totalGarments: 0,
      activeGarments: 0,
      archivedGarments: 0,
      wearDays: 0,
      totalWears: 0,
      activatedGarments: 0,
      repeatRate: 0,
      avgWearsPerActivated: 0,
      isLearningPeriod: true,
    });
    expect(view.learningHint).not.toBeNull();
    t.close();
  });

  it('固定夹具：3 件衣物 + 2 天穿着 → 穿过天数 2、盘活 3、重复率 1/3', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.garmentDb, 't1', 'top', { priceMinor: 9900 });
    await seedGarment(t.garmentDb, 'b1', 'bottom', { priceMinor: 19900 });
    await seedGarment(t.garmentDb, 's1', 'shoes', { priceMinor: null });
    // 7/31 穿 t1+b1+s1；8/2 再穿 t1+b1+s1（同件重复）
    await recordWear(t.db, {
      recommendationId: 'r1',
      date: '2026-07-31',
      outfit: outfit('t1', 'b1', 's1'),
      occasion: 'commute',
      comfort: 'good',
      now: ANCHOR,
    });
    await recordWear(t.db, {
      recommendationId: 'r2',
      date: '2026-08-02',
      outfit: outfit('t1', 'b1', 's1'),
      occasion: 'commute',
      comfort: 'good',
      now: ANCHOR + 2 * DAY,
    });
    const view = await getOverviewCore(t.garmentDb, t.db, ANCHOR + 2 * DAY);
    expect(view.overview.totalGarments).toBe(3);
    expect(view.overview.activeGarments).toBe(3);
    expect(view.overview.archivedGarments).toBe(0);
    expect(view.overview.wearDays).toBe(2);
    expect(view.overview.totalWears).toBe(2);
    expect(view.overview.activatedGarments).toBe(3);
    // t1/b1/s1 都穿过 2 次 → 3/3 重复
    expect(view.overview.repeatRate).toBeCloseTo(1, 5);
    expect(view.overview.avgWearsPerActivated).toBeCloseTo(2 / 3, 5);
    // 2 天 < 7 → 学习期 true
    expect(view.overview.isLearningPeriod).toBe(true);
    t.close();
  });
});

describe('归档保留历史贡献但不进当前可穿库存/久未穿', () => {
  it('归档后 active-1 archived+1，但 totalWears/wearDays 不变', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.garmentDb, 't1', 'top');
    await seedGarment(t.garmentDb, 'b1', 'bottom');
    await seedGarment(t.garmentDb, 's1', 'shoes');
    // 8 天前穿过一次（跳出学习期）
    for (let i = 0; i < 8; i++) {
      await recordWear(t.db, {
        recommendationId: `r${i}`,
        date: `2026-07-${20 + i}`,
        outfit: outfit('t1', 'b1', 's1'),
        occasion: 'commute',
        comfort: 'good',
        now: ANCHOR - (10 - i) * DAY,
      });
    }
    const before = await getOverviewCore(t.garmentDb, t.db, ANCHOR);
    expect(before.overview.wearDays).toBe(8);
    expect(before.overview.totalWears).toBe(8);

    // 归档 t1
    await t.garmentDb.updateGarment('t1', { archivedAt: ANCHOR });
    const after = await getOverviewCore(t.garmentDb, t.db, ANCHOR);
    expect(after.overview.activeGarments).toBe(2);
    expect(after.overview.archivedGarments).toBe(1);
    expect(after.overview.totalGarments).toBe(3);
    // 历史贡献保留：穿着次数/天数不变
    expect(after.overview.totalWears).toBe(8);
    expect(after.overview.wearDays).toBe(8);
    // 盘活仍含归档衣物（它穿过 8 次）
    expect(after.overview.activatedGarments).toBe(3);
    t.close();
  });

  it('归档衣物不进久未穿列表', async () => {
    const t = openQueueTestDb();
    // g1 穿过一次但 100 天没穿 → idle90
    await seedGarment(t.garmentDb, 'g1', 'top', { createdAt: ANCHOR - 200 * DAY });
    await recordWear(t.db, {
      recommendationId: 'r1',
      date: '2026-04-22',
      outfit: outfit('g1', 'g1', 'g1'),
      occasion: 'commute',
      comfort: 'good',
      now: ANCHOR - 100 * DAY,
    });
    // g2 归档但同样 100 天没穿 → 不应进 idle
    await seedGarment(t.garmentDb, 'g2', 'top', { archivedAt: ANCHOR, createdAt: ANCHOR - 200 * DAY });
    await recordWear(t.db, {
      recommendationId: 'r2',
      date: '2026-04-22',
      outfit: outfit('g2', 'g2', 'g2'),
      occasion: 'commute',
      comfort: 'good',
      now: ANCHOR - 100 * DAY,
    });

    const view = await getIdleReportCore(t.garmentDb, t.db, ANCHOR);
    const allIdle = [...view.report.idle30, ...view.report.idle60, ...view.report.idle90];
    expect(allIdle.find((i) => i.garmentId === 'g1')?.idleThreshold).toBe(90);
    expect(allIdle.find((i) => i.garmentId === 'g2')).toBeUndefined();
    t.close();
  });
});

describe('编辑/删除穿着记录后实时同步更新', () => {
  it('再记录一次穿着后 totalWears+1、avgWears 变化', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.garmentDb, 't1', 'top');
    await seedGarment(t.garmentDb, 'b1', 'bottom');
    await seedGarment(t.garmentDb, 's1', 'shoes');
    await recordWear(t.db, {
      recommendationId: 'r1',
      date: '2026-07-31',
      outfit: outfit('t1', 'b1', 's1'),
      occasion: 'commute',
      comfort: 'good',
      now: ANCHOR,
    });
    const before = await getOverviewCore(t.garmentDb, t.db, ANCHOR);
    expect(before.overview.totalWears).toBe(1);
    await recordWear(t.db, {
      recommendationId: 'r2',
      date: '2026-08-01',
      outfit: outfit('t1', 'b1', 's1'),
      occasion: 'commute',
      comfort: 'good',
      now: ANCHOR + DAY,
    });
    const after = await getOverviewCore(t.garmentDb, t.db, ANCHOR + DAY);
    expect(after.overview.totalWears).toBe(2);
    expect(after.overview.wearDays).toBe(2);
    t.close();
  });

  it('软删 garment 后该件不再计入 active/盘活/久未穿，但已发生的穿着仍计 days', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.garmentDb, 't1', 'top');
    await seedGarment(t.garmentDb, 'b1', 'bottom');
    await seedGarment(t.garmentDb, 's1', 'shoes');
    await recordWear(t.db, {
      recommendationId: 'r1',
      date: '2026-07-31',
      outfit: outfit('t1', 'b1', 's1'),
      occasion: 'commute',
      comfort: 'good',
      now: ANCHOR,
    });
    // 软删 t1
    await t.garmentDb.updateDeletedAt('t1', ANCHOR + 1, ANCHOR + 2);
    const view = await getOverviewCore(t.garmentDb, t.db, ANCHOR + DAY);
    // t1 不计入 totalGarments/active
    expect(view.overview.totalGarments).toBe(2);
    expect(view.overview.activeGarments).toBe(2);
    // 该次穿着的 b1/s1 仍有效 → wearDays=1 totalWears=1
    expect(view.overview.wearDays).toBe(1);
    expect(view.overview.totalWears).toBe(1);
    // 盘活：b1+s1 = 2（t1 已过滤）
    expect(view.overview.activatedGarments).toBe(2);
    t.close();
  });
});

describe('0 次无价格：不出现除零/NaN/虚假成本', () => {
  it('0 次无价格 → costPerWearMinor=null，列表不显示数值', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.garmentDb, 'g0', 'top', { priceMinor: null }); // 无价格 0 次
    await seedGarment(t.garmentDb, 'g1', 'top', { priceMinor: 9900 }); // 有价格 0 次
    await seedGarment(t.garmentDb, 'g2', 'top', { priceMinor: 19900 }); // 有价格，待穿过
    await seedGarment(t.garmentDb, 'g3', 'top', { priceMinor: 0 }); // 价格 0
    // 让 g2 穿 2 次
    await recordWear(t.db, {
      recommendationId: 'r1',
      date: '2026-07-31',
      outfit: outfit('g2', 'g2', 'g2'),
      occasion: 'commute',
      comfort: 'good',
      now: ANCHOR,
    });
    await recordWear(t.db, {
      recommendationId: 'r2',
      date: '2026-08-01',
      outfit: outfit('g2', 'g2', 'g2'),
      occasion: 'commute',
      comfort: 'good',
      now: ANCHOR + DAY,
    });
    const view = await getCostPerWearListCore(t.garmentDb, t.db);
    const byId = new Map(view.rows.map((r) => [r.garmentId, r]));
    // g0：无价格 0 次 → null
    expect(byId.get('g0')!.costPerWearMinor).toBeNull();
    expect(byId.get('g0')!.timesWorn).toBe(0);
    // g1：有价格 0 次 → null（不除零）
    expect(byId.get('g1')!.costPerWearMinor).toBeNull();
    expect(byId.get('g1')!.timesWorn).toBe(0);
    // g2：19900 / 2 = 9950
    expect(byId.get('g2')!.costPerWearMinor).toBe(9950);
    expect(byId.get('g2')!.timesWorn).toBe(2);
    // g3：价格 0 → null（无效价格）
    expect(byId.get('g3')!.costPerWearMinor).toBeNull();
    // 排序：9950 在前，3 个 null 在后
    expect(view.rows[0].garmentId).toBe('g2');
    const nulls = view.rows.filter((r) => r.costPerWearMinor == null);
    expect(nulls.length).toBe(3);
    // 不应有 NaN
    expect(view.rows.every((r) => r.costPerWearMinor == null || Number.isFinite(r.costPerWearMinor))).toBe(true);
    t.close();
  });
});

describe('久未穿分桶与新录入未穿分开', () => {
  it('新录入未穿 → newUnworn；穿过 35 天 → idle30；65 天 → idle60；95 天 → idle90', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.garmentDb, 'new', 'top', { createdAt: ANCHOR }); // 录入后从未穿
    await seedGarment(t.garmentDb, 'i30', 'top', { createdAt: ANCHOR - 100 * DAY });
    await seedGarment(t.garmentDb, 'i60', 'top', { createdAt: ANCHOR - 100 * DAY });
    await seedGarment(t.garmentDb, 'i90', 'top', { createdAt: ANCHOR - 200 * DAY });
    await recordWear(t.db, { recommendationId: 'r1', date: '2026-06-26', outfit: outfit('i30', 'i30', 'i30'), occasion: 'commute', comfort: 'good', now: ANCHOR - 35 * DAY });
    await recordWear(t.db, { recommendationId: 'r2', date: '2026-05-28', outfit: outfit('i60', 'i60', 'i60'), occasion: 'commute', comfort: 'good', now: ANCHOR - 65 * DAY });
    await recordWear(t.db, { recommendationId: 'r3', date: '2026-04-28', outfit: outfit('i90', 'i90', 'i90'), occasion: 'commute', comfort: 'good', now: ANCHOR - 95 * DAY });

    const view = await getIdleReportCore(t.garmentDb, t.db, ANCHOR);
    expect(view.report.newUnworn.map((i) => i.garmentId)).toEqual(['new']);
    expect(view.report.newUnworn[0].kind).toBe('newUnworn');
    expect(view.report.newUnworn[0].idleThreshold).toBeNull();
    expect(view.report.idle30.map((i) => i.garmentId)).toEqual(['i30']);
    expect(view.report.idle60.map((i) => i.garmentId)).toEqual(['i60']);
    expect(view.report.idle90.map((i) => i.garmentId)).toEqual(['i90']);
    expect(view.report.idle30[0].daysSinceLastWorn).toBe(35);
    t.close();
  });
});

describe('月度报告：date 字面量分组（时区安全）', () => {
  it('同月 vs 跨月分组；当月首次穿上单独计数', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.garmentDb, 't1', 'top');
    await seedGarment(t.garmentDb, 'b1', 'bottom');
    await seedGarment(t.garmentDb, 's1', 'shoes');
    await seedGarment(t.garmentDb, 'new1', 'top');
    // 7 月穿 t1/b1/s1 两次
    await recordWear(t.db, { recommendationId: 'r1', date: '2026-07-15', outfit: outfit('t1', 'b1', 's1'), occasion: 'commute', comfort: 'good', now: Date.UTC(2026, 6, 15) });
    await recordWear(t.db, { recommendationId: 'r2', date: '2026-07-25', outfit: outfit('t1', 'b1', 's1'), occasion: 'commute', comfort: 'good', now: Date.UTC(2026, 6, 25) });
    // 8 月穿 t1/b1/s1 + new1（new1 首次穿上）
    await recordWear(t.db, { recommendationId: 'r3', date: '2026-08-05', outfit: outfit('t1', 'b1', 's1'), occasion: 'commute', comfort: 'good', now: Date.UTC(2026, 7, 5) });
    await recordWear(t.db, { recommendationId: 'r4', date: '2026-08-06', outfit: outfit('new1', 'b1', 's1'), occasion: 'casual', comfort: 'good', now: Date.UTC(2026, 7, 6) });

    const july = await getMonthlyReportCore(t.garmentDb, t.db, '2026-07', ANCHOR);
    expect(july.monthly.yearMonth).toBe('2026-07');
    expect(july.monthly.wearDays).toBe(2);
    expect(july.monthly.totalWears).toBe(2);
    expect(july.monthly.activatedGarments).toBe(3); // t1/b1/s1
    expect(july.monthly.newActivatedGarments).toBe(3); // 三件都首次穿上在 7 月

    const aug = await getMonthlyReportCore(t.garmentDb, t.db, '2026-08', ANCHOR);
    expect(aug.monthly.wearDays).toBe(2);
    expect(aug.monthly.totalWears).toBe(2);
    expect(aug.monthly.activatedGarments).toBe(4); // t1/b1/s1/new1
    expect(aug.monthly.newActivatedGarments).toBe(1); // 仅 new1 首次穿上在 8 月
    t.close();
  });

  it('删除穿着记录后月度重新聚合', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.garmentDb, 't1', 'top');
    await seedGarment(t.garmentDb, 'b1', 'bottom');
    await seedGarment(t.garmentDb, 's1', 'shoes');
    await recordWear(t.db, { recommendationId: 'r1', date: '2026-07-15', outfit: outfit('t1', 'b1', 's1'), occasion: 'commute', comfort: 'good', now: Date.UTC(2026, 6, 15) });
    await recordWear(t.db, { recommendationId: 'r2', date: '2026-07-25', outfit: outfit('t1', 'b1', 's1'), occasion: 'commute', comfort: 'good', now: Date.UTC(2026, 6, 25) });
    const before = await getMonthlyReportCore(t.garmentDb, t.db, '2026-07', ANCHOR);
    expect(before.monthly.totalWears).toBe(2);
    // 物理删一条 wear_log（业务层不暴露 delete，直接 raw 演示「删除后重算」）
    t.raw.exec(`DELETE FROM wear_logs WHERE id LIKE '%r1%'`);
    const after = await getMonthlyReportCore(t.garmentDb, t.db, '2026-07', ANCHOR);
    expect(after.monthly.totalWears).toBe(1);
    expect(after.monthly.wearDays).toBe(1);
    t.close();
  });
});

describe('脱敏分享不泄漏受保护字段', () => {
  it('分享产物 JSON 不含 price/note/path/location 等字段名', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.garmentDb, 't1', 'top', { priceMinor: 9900 });
    await seedGarment(t.garmentDb, 'b1', 'bottom', { priceMinor: 19900 });
    await seedGarment(t.garmentDb, 's1', 'shoes');
    await recordWear(t.db, { recommendationId: 'r1', date: '2026-07-31', outfit: outfit('t1', 'b1', 's1'), occasion: 'commute', comfort: 'good', note: '私人备注', now: ANCHOR });
    const view = await getMonthlyReportCore(t.garmentDb, t.db, '2026-07', ANCHOR);
    expect(view.hasLeak).toBe(false);
    const json = JSON.stringify(view.shareable).toLowerCase();
    for (const key of PROTECTED_FIELD_KEYS) {
      expect(json).not.toContain(`"${key}`);
    }
    // 显式断言不含受保护子串
    expect(json).not.toContain('private');
    expect(json).not.toContain('note');
    t.close();
  });

  it('hasProtectedLeak 校验：注入受保护字段时返回 true', () => {
    const fake = {
      generatedAt: 1,
      window: { yearMonth: '2026-07' },
      overview: { totalGarments: 1, activeGarments: 1, archivedGarments: 0, wearDays: 1, totalWears: 1, activatedGarments: 1, repeatRate: 0, avgWearsPerActivated: 1 },
      monthly: { wearDays: 1, totalWears: 1, activatedGarments: 1, newActivatedGarments: 1 },
      // 注入受保护字段（应被检出）
      price: 9900,
    };
    expect(hasProtectedLeak(fake)).toBe(true);
  });
});

describe('学习期：wearDays<7 显示提示', () => {
  it('6 天穿着 → 学习期 true；7 天 → false', async () => {
    const t = openQueueTestDb();
    await seedGarment(t.garmentDb, 't1', 'top');
    await seedGarment(t.garmentDb, 'b1', 'bottom');
    await seedGarment(t.garmentDb, 's1', 'shoes');
    for (let i = 0; i < 6; i++) {
      await recordWear(t.db, {
        recommendationId: `r${i}`,
        date: `2026-07-${20 + i}`,
        outfit: outfit('t1', 'b1', 's1'),
        occasion: 'commute',
        comfort: 'good',
        now: ANCHOR - (10 - i) * DAY,
      });
    }
    const v6 = await getOverviewCore(t.garmentDb, t.db, ANCHOR);
    expect(v6.overview.wearDays).toBe(6);
    expect(v6.overview.isLearningPeriod).toBe(true);
    expect(v6.learningHint).not.toBeNull();
    // 再加 1 天 → 7 天，跳出学习期
    await recordWear(t.db, {
      recommendationId: 'r6',
      date: '2026-07-26',
      outfit: outfit('t1', 'b1', 's1'),
      occasion: 'commute',
      comfort: 'good',
      now: ANCHOR - 4 * DAY,
    });
    const v7 = await getOverviewCore(t.garmentDb, t.db, ANCHOR);
    expect(v7.overview.wearDays).toBe(7);
    expect(v7.overview.isLearningPeriod).toBe(false);
    expect(v7.learningHint).toBeNull();
    t.close();
  });
});
