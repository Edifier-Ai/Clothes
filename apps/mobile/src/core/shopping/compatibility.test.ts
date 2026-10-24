/** @jest-environment node */
import { describe, expect, it } from '@jest/globals';

import { buildShoppingCompatibleLooks } from './compatibility';
import type { ShoppingWardrobeItem } from './types';

function item(id: string, category: ShoppingWardrobeItem['category']): ShoppingWardrobeItem {
  return {
    id,
    name: id,
    category,
    status: 'clean',
    archivedAt: null,
    createdAt: 1,
    updatedAt: 1,
    lastWornAt: null,
    timesWorn: 0,
    color: null,
    imageRelPath: `originals/${id}.jpg`,
  };
}

describe('bounded shopping compatibility', () => {
  it('300 件衣橱精确计数但只生成稳定最多三套 preview', () => {
    const wardrobe: ShoppingWardrobeItem[] = [];
    for (const category of ['top', 'bottom', 'dress', 'shoes', 'outerwear'] as const) {
      for (let index = 0; index < 60; index++) wardrobe.push(item(`${category}-${String(index).padStart(3, '0')}`, category));
    }
    const first = buildShoppingCompatibleLooks('candidate', 'shoes', wardrobe);
    const second = buildShoppingCompatibleLooks('candidate', 'shoes', [...wardrobe].reverse());
    // shoes 候选：(60 top × 60 bottom + 60 dress) × (不穿外套 + 60 outerwear)
    expect(first.total).toBe((60 * 60 + 60) * 61);
    expect(first.previews).toHaveLength(3);
    expect(second).toEqual(first);
    expect(JSON.stringify(first.previews).length).toBeLessThan(5_000);
  });

  it('沿用 isAvailable 硬约束，按候选槽位给出精确公式', () => {
    const wardrobe = [
      item('t1', 'top'), item('t2', 'top'),
      item('b1', 'bottom'), item('b2', 'bottom'),
      item('s1', 'shoes'), item('s2', 'shoes'),
      item('d1', 'dress'), item('o1', 'outerwear'),
      { ...item('b-laundry', 'bottom'), status: 'laundry' as const },
      { ...item('o-archived', 'outerwear'), archivedAt: 10 },
    ];
    expect(buildShoppingCompatibleLooks('c', 'top', wardrobe).total).toBe(2 * 2 * 2);
    expect(buildShoppingCompatibleLooks('c', 'bottom', wardrobe).total).toBe(2 * 2 * 2);
    expect(buildShoppingCompatibleLooks('c', 'dress', wardrobe).total).toBe(2 * 2);
    expect(buildShoppingCompatibleLooks('c', 'shoes', wardrobe).total).toBe((2 * 2 + 1) * 2);
    expect(buildShoppingCompatibleLooks('c', 'outerwear', wardrobe).total).toBe(2 * 2 * 2 + 1 * 2);
    expect(buildShoppingCompatibleLooks('c', 'accessory', wardrobe)).toEqual({ total: 0, previews: [] });
  });
});
