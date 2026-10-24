/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import type { GarmentForRec, Outfit, RecContext } from './index';
import {
  listReplacementCandidates,
  outfitSignature,
  regenerateOutfit,
  replaceSlot,
} from './replacement';

function g(id: string, category: GarmentForRec['category'], overrides: Partial<GarmentForRec> = {}): GarmentForRec {
  return {
    id,
    category,
    status: 'clean',
    createdAt: 1,
    updatedAt: 1,
    lastWornAt: null,
    timesWorn: 0,
    ...overrides,
  };
}

const now = 2_000_000_000;
const ctx: RecContext = {
  now,
  occasion: 'commute',
  recentItemIds: [],
};
const items = [
  g('t1', 'top', { timesWorn: 8, lastWornAt: now - 86_400_000 }),
  g('t2', 'top'),
  g('t3', 'top'),
  g('b1', 'bottom'),
  g('b2', 'bottom'),
  g('s1', 'shoes'),
  g('s2', 'shoes'),
  g('o1', 'outerwear'),
];

function baseOutfit(): Outfit {
  return { top: items[0], bottom: items[3], shoes: items[5], outerwear: items[7] };
}

describe('只换一件', () => {
  it('只返回同槽且可用候选，替换后其他槽位 ID 完全不变', () => {
    const current = baseOutfit();
    const pool = [
      ...items,
      g('blocked', 'top', { status: 'laundry' }),
      g('archived', 'top', { archivedAt: 99 }),
      g('wrong-slot', 'shoes'),
    ];
    const candidates = listReplacementCandidates(current, 'top', pool, ctx, { mode: 'fresh' });
    expect(candidates.map((item) => item.id)).toEqual(['t2', 't3']);

    const replaced = replaceSlot(current, 'top', candidates[0]);
    expect(replaced.top.id).toBe('t2');
    expect(replaced.bottom.id).toBe(current.bottom.id);
    expect(replaced.shoes.id).toBe(current.shoes.id);
    expect(replaced.outerwear?.id).toBe(current.outerwear?.id);
  });

  it('候选耗尽时返回空数组，不伪造衣物', () => {
    const current = baseOutfit();
    const pool = items.map((item) =>
      item.category === 'top' && item.id !== current.top.id ? { ...item, status: 'loaned' as const } : item,
    );
    expect(listReplacementCandidates(current, 'top', pool, ctx, { mode: 'safe' })).toEqual([]);
  });
});

describe('换一套与推荐模式', () => {
  it('可选空间充足时抑制刚跳过的组合', () => {
    const current = baseOutfit();
    const next = regenerateOutfit(items, ctx, {
      mode: 'fresh',
      avoidSignatures: [outfitSignature(current)],
    });
    expect(next.ok).toBe(true);
    if (next.ok) expect(outfitSignature(next.outfit)).not.toBe(outfitSignature(current));
  });

  it('主角模式保留锁定单品', () => {
    const next = regenerateOutfit(items, ctx, {
      mode: 'hero',
      lockedHeroId: 't3',
      avoidSignatures: [],
    });
    expect(next.ok).toBe(true);
    if (next.ok) expect(Object.values(next.outfit).some((item) => item?.id === 't3')).toBe(true);
  });

  it('反馈权重改变软排序，但不能让待洗衣物越过硬约束', () => {
    const weighted = regenerateOutfit(
      [...items, g('blocked-favorite', 'top', { status: 'laundry' })],
      ctx,
      {
        mode: 'safe',
        avoidSignatures: [],
        feedbackWeights: new Map([
          ['t2', 100],
          ['blocked-favorite', 10_000],
        ]),
      },
    );
    expect(weighted.ok).toBe(true);
    if (weighted.ok) {
      expect(weighted.outfit.top.id).toBe('t2');
      expect(Object.values(weighted.outfit).some((item) => item?.id === 'blocked-favorite')).toBe(false);
    }
  });

  it('关闭反馈学习后忽略反馈权重，但硬约束与稳定排序不变', () => {
    const result = regenerateOutfit(items, ctx, {
      mode: 'safe',
      avoidSignatures: [],
      feedbackWeights: new Map([['t2', 100]]),
      factors: { feedbackLearning: false },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.outfit.top.id).toBe('t1');
  });

  it('关闭主角单品后忽略 lockedHeroId', () => {
    const result = regenerateOutfit(items, ctx, {
      mode: 'hero',
      lockedHeroId: 't3',
      avoidSignatures: [],
      factors: { heroItem: false },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(Object.values(result.outfit).some((item) => item?.id === 't3')).toBe(false);
  });
});
