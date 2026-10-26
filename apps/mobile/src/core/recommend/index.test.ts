/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { openQueueTestDb } from '../db/queueTestHelper';
import { openTestDb, reopenDb } from '../db/sqliteTestHelper';
import { createGarment } from '../db/dao';
import { garments as garmentsTable } from '../db/schema';
import {
  generateRecommendation,
  type GarmentForRec,
  type RecContext,
  type Outfit,
  HARD_CONSTRAINT_STATUSES,
} from './index';
import { recordWear, listWearLogs } from './wearLog';

function g(id: string, category: string, overrides: Partial<GarmentForRec> = {}): GarmentForRec {
  return {
    id,
    category: category as GarmentForRec['category'],
    status: 'clean',
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    lastWornAt: null,
    timesWorn: 0,
    ...overrides,
  };
}

const ctx: RecContext = {
  now: 2_000_000,
  occasion: 'commute',
  recentItemIds: [],
};

async function seedTwelve(db: import('../db/dao').GarmentDb, now: number): Promise<void> {
  const cats: { id: string; name: string; cat: string }[] = [
    { id: 't1', name: '上装1', cat: 'top' },
    { id: 't2', name: '上装2', cat: 'top' },
    { id: 't3', name: '上装3', cat: 'top' },
    { id: 'b1', name: '下装1', cat: 'bottom' },
    { id: 'b2', name: '下装2', cat: 'bottom' },
    { id: 'b3', name: '下装3', cat: 'bottom' },
    { id: 's1', name: '鞋1', cat: 'shoes' },
    { id: 's2', name: '鞋2', cat: 'shoes' },
    { id: 'o1', name: '外套1', cat: 'outerwear' },
    { id: 'o2', name: '外套2', cat: 'outerwear' },
    { id: 'f1', name: '自由1', cat: 'accessory' },
    { id: 'f2', name: '自由2', cat: 'accessory' },
  ];
  for (const c of cats) {
    await createGarment(db, {
      id: c.id,
      name: c.name,
      category: c.cat as never,
      now,
      asset: {
        id: `${c.id}-a`,
        originalRelPath: `o/${c.id}.jpg`,
        sha256: `h${c.id}`,
        width: 0,
        height: 0,
        bytes: 0,
        mimeType: 'image/jpeg',
      },
    });
  }
}

describe('硬约束过滤', () => {
  it('clean 衣物进候选；laundry/dryclean/loaned/archived 不进', () => {
    const items: GarmentForRec[] = [
      g('t1', 'top'),
      g('b1', 'bottom', { status: 'laundry' }),
      g('b2', 'bottom'),
      g('s1', 'shoes', { status: 'dryclean' }),
      g('s2', 'shoes'),
      g('archived', 'top', { archivedAt: 1 }),
    ];
    const r = generateRecommendation(items, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.outfit.top.id).toBe('t1');
      expect(r.outfit.bottom.id).toBe('b2');
      expect(r.outfit.shoes.id).toBe('s2');
    }
  });

  it('HARD_CONSTRAINT_STATUSES 含 laundry/dryclean/loaned，不含 clean', () => {
    expect(HARD_CONSTRAINT_STATUSES).not.toContain('clean');
    expect(HARD_CONSTRAINT_STATUSES).toContain('laundry');
    expect(HARD_CONSTRAINT_STATUSES).toContain('dryclean');
    expect(HARD_CONSTRAINT_STATUSES).toContain('loaned');
  });

  it('反向验证：已推荐鞋设为 laundry → 下一次排除；恢复 clean 后可重新进入', () => {
    const items: GarmentForRec[] = [g('t1', 'top'), g('b1', 'bottom'), g('s1', 'shoes')];
    const r1 = generateRecommendation(items, ctx);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.outfit.shoes.id).toBe('s1');

    const items2 = items.map((i) => (i.id === 's1' ? { ...i, status: 'laundry' as const } : i));
    const r2 = generateRecommendation(items2, ctx);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.missing).toContain('shoes');

    const r3 = generateRecommendation(items, ctx);
    expect(r3.ok).toBe(true);
    if (r3.ok) expect(r3.outfit.shoes.id).toBe('s1');
  });
});

describe('合法槽位组合', () => {
  it('top + bottom + shoes → ok', () => {
    const r = generateRecommendation([g('t1', 'top'), g('b1', 'bottom'), g('s1', 'shoes')], ctx);
    expect(r.ok).toBe(true);
  });

  it('dress + shoes（连衣裙顶替 top+bottom）→ ok', () => {
    const r = generateRecommendation([g('d1', 'dress'), g('s1', 'shoes')], ctx);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.outfit.top.id).toBe('d1');
      expect(r.outfit.bottom.id).toBe('d1');
    }
  });

  it('缺鞋 → ok=false missing 含 shoes（不伪造）', () => {
    const r = generateRecommendation([g('t1', 'top'), g('b1', 'bottom')], ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain('shoes');
  });

  it('缺 top 和 bottom（无 dress）→ missing 含 top、bottom', () => {
    const r = generateRecommendation([g('s1', 'shoes')], ctx);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.missing).toContain('top');
      expect(r.missing).toContain('bottom');
    }
  });

  it('outerwear 可选：有则含，无仍 ok', () => {
    const withOuter = generateRecommendation(
      [g('t1', 'top'), g('b1', 'bottom'), g('s1', 'shoes'), g('o1', 'outerwear')],
      ctx,
    );
    expect(withOuter.ok).toBe(true);
    if (withOuter.ok) expect(withOuter.outfit.outerwear?.id).toBe('o1');

    const noOuter = generateRecommendation([g('t1', 'top'), g('b1', 'bottom'), g('s1', 'shoes')], ctx);
    expect(noOuter.ok).toBe(true);
    if (noOuter.ok) expect(noOuter.outfit.outerwear).toBeUndefined();
  });
});

describe('排序稳定性与可复现', () => {
  it('同输入两次产生同输出', () => {
    const items: GarmentForRec[] = [
      g('t1', 'top', { lastWornAt: null, timesWorn: 0 }),
      g('t2', 'top', { lastWornAt: ctx.now - 100_000, timesWorn: 5 }),
      g('b1', 'bottom'),
      g('s1', 'shoes'),
    ];
    const r1 = generateRecommendation(items, ctx);
    const r2 = generateRecommendation(items, ctx);
    expect(r1).toEqual(r2);
    if (r1.ok) expect(r1.outfit.top.id).toBe('t1');
  });

  it('优先盘活久未穿（lastWornAt 更早 or null）', () => {
    const items: GarmentForRec[] = [
      g('fresh', 'top', { lastWornAt: ctx.now - 1000, timesWorn: 10 }),
      g('stale', 'top', { lastWornAt: ctx.now - 9_000_000, timesWorn: 1 }),
      g('b1', 'bottom'),
      g('s1', 'shoes'),
    ];
    const r = generateRecommendation(items, ctx);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.outfit.top.id).toBe('stale');
  });
});

describe('可选择的推荐参考要素', () => {
  const disabled = {
    occasion: false,
    colorHarmony: false,
    wardrobeActivation: false,
    repeatAvoidance: false,
    feedbackLearning: false,
    heroItem: false,
    weather: false,
  } as const;

  it('关闭久未穿后回到稳定 ID 排序，且不再生成盘活理由', () => {
    const result = generateRecommendation(
      [
        g('z-stale', 'top', { lastWornAt: ctx.now - 40 * 86_400_000 }),
        g('a-recent', 'top', { lastWornAt: ctx.now - 86_400_000 }),
        g('b1', 'bottom'),
        g('s1', 'shoes'),
      ],
      { ...ctx, factors: disabled },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outfit.top.id).toBe('a-recent');
      expect(result.reasonCodes.some((code) => code.startsWith('NOT_WORN_'))).toBe(false);
    }
  });

  it('开启避免近期重复时，优先选择未出现在 recentItemIds 的同槽衣物', () => {
    const result = generateRecommendation(
      [g('a-recent', 'top'), g('b-other', 'top'), g('b1', 'bottom'), g('s1', 'shoes')],
      {
        ...ctx,
        recentItemIds: ['a-recent'],
        factors: { ...disabled, repeatAvoidance: true },
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.outfit.top.id).toBe('b-other');
  });

  it('关闭配色协调后不为配色改选次优上装，也不生成配色理由', () => {
    const result = generateRecommendation(
      [
        g('a-red-top', 'top', { color: '红色' }),
        g('z-blue-top', 'top', { color: '蓝色' }),
        g('b-green-bottom', 'bottom', { color: '绿色' }),
        g('s1', 'shoes'),
      ],
      { ...ctx, factors: disabled },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outfit.top.id).toBe('a-red-top');
      expect(result.reasonCodes.some((code) => code.startsWith('COLOR_'))).toBe(false);
    }
  });

  it('关闭场合后不生成场合理由，也不因场合加入外套', () => {
    const result = generateRecommendation(
      [g('t1', 'top'), g('b1', 'bottom'), g('s1', 'shoes'), g('o1', 'outerwear')],
      { ...ctx, occasion: 'formal', factors: disabled },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.outfit.outerwear).toBeUndefined();
      expect(result.reasonCodes.some((code) => code.startsWith('OCCASION_'))).toBe(false);
    }
  });
});

describe('上下装配色联合择优', () => {
  it('最优上装与所有下装冲突时，可选择次优上装形成协调组合', () => {
    const r = generateRecommendation(
      [
        g('a-red-top', 'top', { color: '红色' }),
        g('z-blue-top', 'top', { color: '蓝色' }),
        g('b-green-bottom', 'bottom', { color: '绿色' }),
        g('shoes', 'shoes'),
      ],
      ctx,
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.outfit.top.id).toBe('z-blue-top');
      expect(r.outfit.bottom.id).toBe('b-green-bottom');
      expect(r.reasonCodes).toContain('COLOR_HARMONIOUS');
      expect(r.reasonCodes).not.toContain('COLOR_CLASH_NO_ALT');
    }
  });

  it('所有组合都冲突时确定性回退，并如实标注无替代', () => {
    const r = generateRecommendation(
      [
        g('red-top', 'top', { color: 'red' }),
        g('green-bottom', 'bottom', { color: 'green' }),
        g('shoes', 'shoes'),
      ],
      ctx,
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reasonCodes).toContain('COLOR_CLASH_NO_ALT');
      expect(r.reasonCodes).not.toContain('COLOR_HARMONIOUS');
    }
  });

  it('未知自由文本颜色不冒充“配色协调”', () => {
    const r = generateRecommendation(
      [
        g('unknown-top', 'top', { color: '透明色' }),
        g('blue-bottom', 'bottom', { color: '蓝色' }),
        g('shoes', 'shoes'),
      ],
      ctx,
    );

    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reasonCodes).not.toContain('COLOR_HARMONIOUS');
      expect(r.reasonCodes).not.toContain('COLOR_CLASH_NO_ALT');
    }
  });
});

describe('理由映射 reason_codes', () => {
  it('每条显示理由都能追溯到 reason code', () => {
    const items: GarmentForRec[] = [
      g('t1', 'top', { lastWornAt: ctx.now - 20 * 86400_000, timesWorn: 1 }),
      g('b1', 'bottom'),
      g('s1', 'shoes'),
      g('o1', 'outerwear'),
    ];
    const r = generateRecommendation(items, { ...ctx, occasion: 'commute' });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.reasonCodes.length).toBeGreaterThan(0);
      const hasOccasion = r.reasonCodes.some((c) => c.startsWith('OCCASION_'));
      const hasNotWorn = r.reasonCodes.some((c) => c.startsWith('NOT_WORN_'));
      expect(hasOccasion || hasNotWorn).toBe(true);
      expect(r.reasonCodes).toContain('SLOT_FILLED_TOP');
      expect(r.reasonCodes).toContain('SLOT_FILLED_BOTTOM');
      expect(r.reasonCodes).toContain('SLOT_FILLED_SHOES');
      expect(r.reasonCodes).toContain('SLOT_FILLED_OUTER');
    }
  });

  it('理由只来自真实命中规则（occasion=null 时无 OCCASION_*）', () => {
    const items: GarmentForRec[] = [g('t1', 'top'), g('b1', 'bottom'), g('s1', 'shoes')];
    const r = generateRecommendation(items, { ...ctx, occasion: null });
    if (r.ok) {
      expect(r.reasonCodes.some((c) => c.startsWith('OCCASION_'))).toBe(false);
    }
  });
});

describe('幂等记录 wear_log', () => {
  it('同一 recommendation_id+date 重复提交不产生两条记录', async () => {
    const t = openQueueTestDb();
    const now = Date.now();
    await seedTwelve(t.garmentDb, now);
    const items: GarmentForRec[] = (await t.garmentDb.listActiveGarments()).map((row) => ({
      id: row.id,
      category: row.category as GarmentForRec['category'],
      status: row.status as GarmentForRec['status'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastWornAt: null,
      timesWorn: 0,
    }));
    const r = generateRecommendation(items, { ...ctx, now });
    expect(r.ok).toBe(true);
    if (!r.ok) { t.close(); return; }

    const outfit: Outfit = r.outfit;
    const rec1 = await recordWear(t.db, {
      recommendationId: 'rec-1',
      date: '2026-07-28',
      outfit,
      occasion: 'commute',
      comfort: 'good',
      now,
    });
    expect(rec1.inserted).toBe(true);

    const rec2 = await recordWear(t.db, {
      recommendationId: 'rec-1',
      date: '2026-07-28',
      outfit,
      occasion: 'commute',
      comfort: 'good',
      now,
    });
    expect(rec2.inserted).toBe(false);

    const list = await listWearLogs(t.db);
    expect(list.length).toBe(1);
    t.close();
  });

  it('不同日期可分别记录', async () => {
    const t = openQueueTestDb();
    const now = Date.now();
    await seedTwelve(t.garmentDb, now);
    const items: GarmentForRec[] = (await t.garmentDb.listActiveGarments()).map((row) => ({
      id: row.id,
      category: row.category as GarmentForRec['category'],
      status: row.status as GarmentForRec['status'],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastWornAt: null,
      timesWorn: 0,
    }));
    const r = generateRecommendation(items, { ...ctx, now });
    if (!r.ok) throw new Error('rec failed');

    await recordWear(t.db, {
      recommendationId: 'rec-2',
      date: '2026-07-28',
      outfit: r.outfit,
      occasion: 'commute',
      comfort: 'good',
      now,
    });
    await recordWear(t.db, {
      recommendationId: 'rec-2',
      date: '2026-07-29',
      outfit: r.outfit,
      occasion: 'travel',
      comfort: 'ok',
      now: now + 86400_000,
    });
    const list = await listWearLogs(t.db);
    expect(list.length).toBe(2);
    t.close();
  });

  it('记录后重启仍存在', async () => {
    const t = await openTestDb();
    const now = Date.now();
    await seedTwelve(t.db, now);
    const items: GarmentForRec[] = (await t.drizzleDb.select().from(garmentsTable)).map(
      (row: { id: string; category: string; status: string; createdAt: number; updatedAt: number }) => ({
        id: row.id,
        category: row.category as GarmentForRec['category'],
        status: row.status as GarmentForRec['status'],
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        lastWornAt: null,
        timesWorn: 0,
      }),
    );
    const r = generateRecommendation(items, { ...ctx, now });
    if (!r.ok) throw new Error('rec failed');
    await recordWear(t.drizzleDb, {
      recommendationId: 'rec-3',
      date: '2026-07-28',
      outfit: r.outfit,
      occasion: 'commute',
      comfort: 'good',
      now,
    });
    const listBefore = await listWearLogs(t.drizzleDb);
    expect(listBefore.length).toBe(1);
    // 重启
    const t2 = await reopenDb(t);
    const listAfter = await listWearLogs(t2.drizzleDb);
    expect(listAfter.length).toBe(1);
    expect(listAfter[0].recommendationId).toBe('rec-3');
    t2.close();
  });
});
