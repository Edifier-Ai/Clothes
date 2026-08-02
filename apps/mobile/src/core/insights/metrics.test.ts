/**
 * @jest-environment node
 *
 * MVP-011 衣橱洞察纯函数测试（领域层预研，不依赖 db/schema/UI）。
 *
 * 覆盖任务卡验收：
 * - 指标统一来自穿着事实：穿着天数/盘活/重复率/久未穿/成本次
 * - 每个指标定义窗口、分母、时区、归档处理、缺失价格处理
 * - 久未穿 30/60/90；新录入未穿 vs 长期未穿分开
 * - 成本/次 = 有效价 / 有效次；0 次不显示伪造数值
 * - 归档衣物保留历史贡献，但不进当前可穿库存/久未穿
 * - 月度盘活报告（按 YYYY-MM，时区安全）
 * - 脱敏分享产物不含受保护字段
 * - 删除一条穿着记录后指标同步更新
 * - 反向验证：0 次/无价格衣物不除零、不 NaN
 */
import { describe, expect, it } from '@jest/globals';

import {
  buildShareableReport,
  computeCostPerWearList,
  computeIdleReport,
  computeMonthlyReport,
  computeWardrobeOverview,
  hasProtectedLeak,
  LEARNING_PERIOD_DAYS,
  type GarmentFact,
  type WearLogFact,
} from './metrics';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function garment(id: string, over: Partial<GarmentFact> = {}): GarmentFact {
  return {
    id,
    category: 'top',
    priceMinor: null,
    purchaseDate: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: NOW - 100 * DAY,
    ...over,
  };
}

/** 标准夹具：8 件衣物 + 8 条穿着记录，覆盖穿过多次/未穿/归档/各 idle 桶。 */
function standardFixture(): { wearLogs: WearLogFact[]; garments: GarmentFact[] } {
  const garments: GarmentFact[] = [
    garment('g1', { priceMinor: 19900, createdAt: NOW - 100 * DAY }), // 穿 3 次
    garment('g2', { priceMinor: null, createdAt: NOW - 100 * DAY }), // 穿 2 次，无价格
    garment('g3', { priceMinor: 50000, createdAt: NOW - 100 * DAY }), // 穿 1 次
    garment('g4', { priceMinor: 30000, createdAt: NOW - 5 * DAY }), // 录入未穿（新录入未穿）
    garment('g5', { priceMinor: 8000, createdAt: NOW - 200 * DAY }), // 穿 1 次，40 天前 → idle30
    garment('g6', { priceMinor: 0, createdAt: NOW - 200 * DAY }), // 穿 1 次，70 天前 → idle60，价格 0
    garment('g7', { priceMinor: 12000, createdAt: NOW - 300 * DAY }), // 穿 1 次，95 天前 → idle90
    garment('g8', { priceMinor: 20000, createdAt: NOW - 300 * DAY, archivedAt: NOW - 10 * DAY }), // 归档，穿 2 次
  ];
  // date 与 createdAt 独立：date 是当地日期字面量，createdAt 是记录 epoch。
  // w4 故意让 date=07-10 但 createdAt=NOW-40D（落在 6 月），用于验证月度报告按 date 字面量分组（时区安全）。
  const wearLogs: WearLogFact[] = [
    { id: 'w1', date: '2026-07-01', createdAt: NOW - 20 * DAY, garmentIds: ['g1', 'g2', 'g3'] },
    { id: 'w2', date: '2026-07-05', createdAt: NOW - 15 * DAY, garmentIds: ['g1', 'g2'] },
    { id: 'w3', date: '2026-07-10', createdAt: NOW - 10 * DAY, garmentIds: ['g1'] },
    { id: 'w4', date: '2026-07-10', createdAt: NOW - 40 * DAY, garmentIds: ['g5'] },
    { id: 'w5', date: '2026-06-15', createdAt: NOW - 95 * DAY, garmentIds: ['g7'] },
    { id: 'w6', date: '2026-06-20', createdAt: NOW - 70 * DAY, garmentIds: ['g6'] },
    { id: 'w7', date: '2026-07-15', createdAt: NOW - 95 * DAY, garmentIds: ['g8'] },
    { id: 'w8', date: '2026-07-20', createdAt: NOW - 95 * DAY, garmentIds: ['g8'] },
  ];
  return { wearLogs, garments };
}

describe('computeWardrobeOverview（衣橱总览指标）', () => {
  it('穿着天数 = distinct wear_logs.date（同日多条计 1）', () => {
    const { wearLogs, garments } = standardFixture();
    const o = computeWardrobeOverview(wearLogs, garments, NOW);
    // distinct date: 07-01,07-05,07-10,06-15,06-20,07-15,07-20 = 7
    expect(o.wearDays).toBe(7);
  });

  it('穿着次数 = wear_logs 总条数；盘活单品 = 穿过 ≥1 次的未删除单品数', () => {
    const { wearLogs, garments } = standardFixture();
    const o = computeWardrobeOverview(wearLogs, garments, NOW);
    expect(o.totalWears).toBe(8);
    // 盘活: g1,g2,g3,g5,g6,g7,g8 = 7（g4 未穿）
    expect(o.activatedGarments).toBe(7);
  });

  it('衣物计数：未删除总数 / 未归档（可穿库存）/ 已归档', () => {
    const { wearLogs, garments } = standardFixture();
    const o = computeWardrobeOverview(wearLogs, garments, NOW);
    expect(o.totalGarments).toBe(8);
    expect(o.activeGarments).toBe(7); // g8 归档
    expect(o.archivedGarments).toBe(1);
  });

  it('归档衣物保留历史穿着贡献（totalWears/wearDays/activated 仍计入 g8 的 2 次）', () => {
    const { wearLogs, garments } = standardFixture();
    const o = computeWardrobeOverview(wearLogs, garments, NOW);
    // g8 贡献 2 次 totalWears、2 个 date（07-15,07-20）、1 个 activated
    expect(o.totalWears).toBe(8);
    expect(o.wearDays).toBe(7);
    expect(o.activatedGarments).toBe(7);
  });

  it('重复率 = 穿过 ≥2 次单品数 / 盘活单品数', () => {
    const { wearLogs, garments } = standardFixture();
    const o = computeWardrobeOverview(wearLogs, garments, NOW);
    // ≥2 次: g1(3),g2(2),g8(2) = 3；盘活 7
    expect(o.repeatRate).toBeCloseTo(3 / 7, 6);
    // 平均穿着次数 = totalWears / activated
    expect(o.avgWearsPerActivated).toBeCloseTo(8 / 7, 6);
  });

  it('盘活 0 时重复率与平均都为 0，不除零', () => {
    const garments = [garment('g1')]; // 无穿着记录
    const o = computeWardrobeOverview([], garments, NOW);
    expect(o.activatedGarments).toBe(0);
    expect(o.repeatRate).toBe(0);
    expect(o.avgWearsPerActivated).toBe(0);
    expect(Number.isNaN(o.repeatRate)).toBe(false);
    expect(Number.isNaN(o.avgWearsPerActivated)).toBe(false);
  });

  it(`学习期：wearDays < ${LEARNING_PERIOD_DAYS} 视为数据不足`, () => {
    const { wearLogs, garments } = standardFixture();
    expect(computeWardrobeOverview(wearLogs, garments, NOW).isLearningPeriod).toBe(false); // 7 不 < 7
    // 仅 3 天穿着 → 学习期
    const few: WearLogFact[] = [
      { id: 'a', date: '2026-07-01', createdAt: NOW - 2 * DAY, garmentIds: ['g1'] },
      { id: 'b', date: '2026-07-02', createdAt: NOW - 1 * DAY, garmentIds: ['g1'] },
      { id: 'c', date: '2026-07-03', createdAt: NOW, garmentIds: ['g1'] },
    ];
    expect(computeWardrobeOverview(few, [garment('g1')], NOW).isLearningPeriod).toBe(true);
  });

  it('空数据不抛错且为零值', () => {
    const o = computeWardrobeOverview([], [], NOW);
    expect(o).toMatchObject({
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
  });

  it('墓碑衣物不计入总数与盘活，但其历史穿着不归给其他衣物', () => {
    const { wearLogs } = standardFixture();
    const garments = [
      garment('g1', { priceMinor: 19900 }),
      garment('g8', { archivedAt: NOW - 10 * DAY, deletedAt: NOW - 1 * DAY }), // 已删除
    ];
    const o = computeWardrobeOverview(wearLogs, garments, NOW);
    // g8 墓碑不计入 totalGarments；但 wearLogs 仍含 g8 的穿着（装配层应已过滤，此处直接传入）
    expect(o.totalGarments).toBe(1);
    expect(o.activatedGarments).toBe(1); // 仅 g1
  });
});

describe('computeIdleReport（久未穿 30/60/90 + 新录入未穿）', () => {
  it('新录入未穿与长期未穿分开；归档衣物不进久未穿', () => {
    const { wearLogs, garments } = standardFixture();
    const r = computeIdleReport(wearLogs, garments, NOW);
    // newUnworn: g4（timesWorn=0，未归档）
    expect(r.newUnworn.map((i) => i.garmentId)).toEqual(['g4']);
    expect(r.newUnworn[0]).toMatchObject({ kind: 'newUnworn', idleThreshold: null, lastWornAt: null, daysSinceLastWorn: null });
    // idle30: g5(40 天)；idle60: g6(70 天)；idle90: g7(95 天)
    expect(r.idle30.map((i) => i.garmentId)).toEqual(['g5']);
    expect(r.idle60.map((i) => i.garmentId)).toEqual(['g6']);
    expect(r.idle90.map((i) => i.garmentId)).toEqual(['g7']);
    // g8 归档 → 不进任何久未穿桶（即便 95 天）
    expect([...r.idle30, ...r.idle60, ...r.idle90].find((i) => i.garmentId === 'g8')).toBeUndefined();
    // g1/g2/g3 近期穿过（<30 天）→ 不进久未穿
    expect([...r.idle30, ...r.idle60, ...r.idle90].find((i) => i.garmentId === 'g1')).toBeUndefined();
  });

  it('daysSinceLastWorn = floor((now - lastWornAt)/DAY)', () => {
    const { wearLogs, garments } = standardFixture();
    const r = computeIdleReport(wearLogs, garments, NOW);
    expect(r.idle30.find((i) => i.garmentId === 'g5')!.daysSinceLastWorn).toBe(40);
    expect(r.idle60.find((i) => i.garmentId === 'g6')!.daysSinceLastWorn).toBe(70);
    expect(r.idle90.find((i) => i.garmentId === 'g7')!.daysSinceLastWorn).toBe(95);
  });

  it('阈值分桶边界：30→idle30, 59→idle30, 60→idle60, 89→idle60, 90→idle90', () => {
    const garments: GarmentFact[] = [
      garment('b30', { createdAt: NOW - 100 * DAY }),
      garment('b59', { createdAt: NOW - 100 * DAY }),
      garment('b60', { createdAt: NOW - 100 * DAY }),
      garment('b89', { createdAt: NOW - 100 * DAY }),
      garment('b90', { createdAt: NOW - 100 * DAY }),
    ];
    const wearLogs: WearLogFact[] = [
      { id: 'x30', date: '2026-06-01', createdAt: NOW - 30 * DAY, garmentIds: ['b30'] },
      { id: 'x59', date: '2026-06-01', createdAt: NOW - 59 * DAY, garmentIds: ['b59'] },
      { id: 'x60', date: '2026-06-01', createdAt: NOW - 60 * DAY, garmentIds: ['b60'] },
      { id: 'x89', date: '2026-06-01', createdAt: NOW - 89 * DAY, garmentIds: ['b89'] },
      { id: 'x90', date: '2026-06-01', createdAt: NOW - 90 * DAY, garmentIds: ['b90'] },
    ];
    const r = computeIdleReport(wearLogs, garments, NOW);
    expect(r.idle30.map((i) => i.garmentId).sort()).toEqual(['b30', 'b59']);
    expect(r.idle60.map((i) => i.garmentId).sort()).toEqual(['b60', 'b89']);
    expect(r.idle90.map((i) => i.garmentId).sort()).toEqual(['b90']);
  });

  it('长期未穿项 kind=idle 且 idleThreshold 对应分桶', () => {
    const { wearLogs, garments } = standardFixture();
    const r = computeIdleReport(wearLogs, garments, NOW);
    expect(r.idle30[0].kind).toBe('idle');
    expect(r.idle30[0].idleThreshold).toBe(30);
    expect(r.idle60[0].idleThreshold).toBe(60);
    expect(r.idle90[0].idleThreshold).toBe(90);
  });
});

describe('computeCostPerWearList（成本/次，复用 MVP-007 口径）', () => {
  it('价格÷次数向下取整到分；按成本/次升序，null 排后；归档保留历史贡献', () => {
    const { wearLogs, garments } = standardFixture();
    const rows = computeCostPerWearList(wearLogs, garments);
    // 期望顺序：g1(6633), g5(8000), g8(10000,archived), g7(12000), g3(50000), g2(null), g4(null), g6(null)
    const ids = rows.map((r) => r.garmentId);
    expect(ids).toEqual(['g1', 'g5', 'g8', 'g7', 'g3', 'g2', 'g4', 'g6']);
    const byId = new Map(rows.map((r) => [r.garmentId, r]));
    expect(byId.get('g1')!.costPerWearMinor).toBe(6633); // 19900/3=6633.33→6633
    expect(byId.get('g5')!.costPerWearMinor).toBe(8000);
    expect(byId.get('g8')!.costPerWearMinor).toBe(10000); // 20000/2
    expect(byId.get('g8')!.archived).toBe(true); // 归档保留历史贡献
    expect(byId.get('g7')!.costPerWearMinor).toBe(12000);
    expect(byId.get('g3')!.costPerWearMinor).toBe(50000);
  });

  it('无价格 / 价格 0 / 0 次均返回 null（不显示伪造数值）', () => {
    const { wearLogs, garments } = standardFixture();
    const rows = computeCostPerWearList(wearLogs, garments);
    const byId = new Map(rows.map((r) => [r.garmentId, r]));
    expect(byId.get('g2')!.costPerWearMinor).toBeNull(); // 无价格
    expect(byId.get('g6')!.costPerWearMinor).toBeNull(); // 价格 0
    expect(byId.get('g4')!.costPerWearMinor).toBeNull(); // 0 次
    expect(byId.get('g4')!.timesWorn).toBe(0);
  });

  it('反向验证锚点：注入 0 次 + 无价格衣物，不除零、不 NaN、不 Infinity', () => {
    const { wearLogs, garments } = standardFixture();
    garments.push(garment('g9', { priceMinor: null })); // 0 次 + 无价格
    const rows = computeCostPerWearList(wearLogs, garments);
    const g9 = rows.find((r) => r.garmentId === 'g9')!;
    expect(g9.costPerWearMinor).toBeNull();
    expect(Number.isNaN(g9.costPerWearMinor ?? 0)).toBe(false);
    expect(Number.isFinite(g9.costPerWearMinor ?? 0)).toBe(true);
    // 总览指标也不产生 NaN
    const o = computeWardrobeOverview(wearLogs, garments, NOW);
    expect(Number.isNaN(o.repeatRate)).toBe(false);
    expect(Number.isNaN(o.avgWearsPerActivated)).toBe(false);
  });
});

describe('computeMonthlyReport（月度盘活报告，按 YYYY-MM 字面量分组）', () => {
  it('2026-07：穿着天数/次数/盘活/当月首次穿上', () => {
    const { wearLogs } = standardFixture();
    const m = computeMonthlyReport(wearLogs, '2026-07');
    expect(m.yearMonth).toBe('2026-07');
    // wear_logs in 07: w1,w2,w3,w4,w7,w8 = 6 条
    expect(m.totalWears).toBe(6);
    // distinct date in 07: 07-01,07-05,07-10,07-15,07-20 = 5
    expect(m.wearDays).toBe(5);
    // activated in 07: g1,g2,g3,g5,g8 = 5
    expect(m.activatedGarments).toBe(5);
    // 当月首次穿上：g1/g2/g3/g5/g8 最早 date 都在 07 月
    expect(m.newActivatedGarments).toBe(5);
  });

  it('2026-06：g7/g6 当月首次穿上', () => {
    const { wearLogs } = standardFixture();
    const m = computeMonthlyReport(wearLogs, '2026-06');
    expect(m.totalWears).toBe(2); // w5,w6
    expect(m.wearDays).toBe(2); // 06-15,06-20
    expect(m.activatedGarments).toBe(2); // g7,g6
    expect(m.newActivatedGarments).toBe(2); // g7/g6 最早 date 在 06 月
  });

  it('时区安全：w4 date=07-10 但 createdAt 在 6 月，仍归入 07 月', () => {
    const { wearLogs } = standardFixture();
    const m07 = computeMonthlyReport(wearLogs, '2026-07');
    expect(m07.wearDays).toBe(5); // 含 07-10
    const m06 = computeMonthlyReport(wearLogs, '2026-06');
    expect(m06.totalWears).toBe(2); // 不含 w4
  });

  it('无数据月份为零值', () => {
    const { wearLogs } = standardFixture();
    const m = computeMonthlyReport(wearLogs, '2026-05');
    expect(m).toMatchObject({ yearMonth: '2026-05', wearDays: 0, totalWears: 0, activatedGarments: 0, newActivatedGarments: 0 });
  });
});

describe('buildShareableReport（脱敏分享产物）', () => {
  it('不含原图路径/备注/价格/定位等受保护字段', () => {
    const { wearLogs, garments } = standardFixture();
    const overview = computeWardrobeOverview(wearLogs, garments, NOW);
    const monthly = computeMonthlyReport(wearLogs, '2026-07');
    const share = buildShareableReport(overview, monthly, NOW);
    expect(hasProtectedLeak(share)).toBe(false);
    // 显式断言不含受保护字段
    const json = JSON.stringify(share).toLowerCase();
    for (const key of ['price', 'note', 'path', 'location', 'city', 'originalrel', 'latitude', 'longitude', 'purchasedate']) {
      expect(json).not.toContain(`"${key}`);
    }
    // 含可分享的聚合数值
    expect(share.overview.wearDays).toBe(7);
    expect(share.monthly.newActivatedGarments).toBe(5);
    expect(share.generatedAt).toBe(NOW);
  });
});

describe('删除/编辑穿着记录后指标同步更新（纯函数重算）', () => {
  it('删除 w8 后 g8 降至 1 次，totalWears/wearDays/repeatRate 同步', () => {
    const { wearLogs, garments } = standardFixture();
    const before = computeWardrobeOverview(wearLogs, garments, NOW);
    expect(before.totalWears).toBe(8);
    expect(before.wearDays).toBe(7);
    // 删除 w8（g8 第二次穿着）
    const after = computeWardrobeOverview(wearLogs.filter((w) => w.id !== 'w8'), garments, NOW);
    expect(after.totalWears).toBe(7);
    expect(after.wearDays).toBe(6); // 去掉 07-20
    expect(after.activatedGarments).toBe(7); // g8 仍穿过 1 次，仍盘活
    // ≥2 次: g1(3),g2(2) = 2；g8 降至 1 次退出
    expect(after.repeatRate).toBeCloseTo(2 / 7, 6);
    expect(after.avgWearsPerActivated).toBeCloseTo(7 / 7, 6);
  });

  it('删除 g8 全部穿着后 g8 退出盘活', () => {
    const { wearLogs, garments } = standardFixture();
    const after = computeWardrobeOverview(
      wearLogs.filter((w) => !['w7', 'w8'].includes(w.id)),
      garments,
      NOW,
    );
    expect(after.activatedGarments).toBe(6); // g8 退出
    expect(after.totalWears).toBe(6);
  });
});
