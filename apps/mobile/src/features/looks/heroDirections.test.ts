import { describe, expect, it } from '@jest/globals';

import { buildHeroDirections, HERO_DIRECTION_MODES } from './heroDirections';
import type { GarmentForRec } from '@/core/recommend';

const NOW = 1_800_000_000_000;

function g(
  id: string,
  category: GarmentForRec['category'],
  patch: Partial<GarmentForRec> = {},
): GarmentForRec {
  return {
    id,
    category,
    status: 'clean',
    createdAt: NOW - 1000,
    updatedAt: NOW - 1000,
    lastWornAt: null,
    timesWorn: 0,
    archivedAt: null,
    ...patch,
  };
}

const HERO = g('hero-top', 'top');

// 足够大的池子：每个槽位多件可选，保证三方向能产出不同组合
const POOL: GarmentForRec[] = [
  HERO,
  g('top-2', 'top', { timesWorn: 9 }),
  g('top-3', 'top', { timesWorn: 4, lastWornAt: NOW - 40 * 86_400_000 }),
  g('bottom-1', 'bottom', { timesWorn: 8 }),
  g('bottom-2', 'bottom', { timesWorn: 2, lastWornAt: NOW - 20 * 86_400_000 }),
  g('bottom-3', 'bottom'),
  g('shoes-1', 'shoes', { timesWorn: 6 }),
  g('shoes-2', 'shoes'),
  g('outer-1', 'outerwear', { timesWorn: 3 }),
  g('dress-1', 'dress'),
];

describe('buildHeroDirections（LOK-07 三方向）', () => {
  it('返回恰好 3 个方向，模式顺序固定为 safe/fresh/hero', () => {
    const dirs = buildHeroDirections(HERO.id, POOL, { now: NOW, occasion: null, recentItemIds: [] });
    expect(dirs).toHaveLength(3);
    expect(dirs.map((d) => d.mode)).toEqual([...HERO_DIRECTION_MODES]);
    expect(dirs.map((d) => d.mode)).toEqual(['safe', 'fresh', 'hero']);
  });

  it('每个方向都围绕主角单品且槽位合法', () => {
    const dirs = buildHeroDirections(HERO.id, POOL, { now: NOW, occasion: null, recentItemIds: [] });
    for (const d of dirs) {
      expect(d.outfit).not.toBeNull();
      const ids = [d.outfit!.top.id, d.outfit!.bottom.id, d.outfit!.shoes.id, d.outfit!.outerwear?.id];
      expect(ids).toContain(HERO.id);
      // 合法性：dress 不与 top/bottom 同现（除 dress 自身同时占上下装）
      if (d.outfit!.top.category !== 'dress') {
        expect(d.outfit!.top.category).toBe('top');
        expect(d.outfit!.bottom.category).toBe('bottom');
      }
      expect(d.outfit!.shoes.category).toBe('shoes');
    }
  });

  it('池子足够时三方向组合互不相同', () => {
    const dirs = buildHeroDirections(HERO.id, POOL, { now: NOW, occasion: null, recentItemIds: [] });
    const sigs = dirs.map(
      (d) => `${d.outfit!.top.id}|${d.outfit!.bottom.id}|${d.outfit!.shoes.id}|${d.outfit!.outerwear?.id ?? '-'}`,
    );
    expect(new Set(sigs).size).toBe(3);
  });

  it('确定性：同输入两次调用逐字节一致', () => {
    const ctx = { now: NOW, occasion: null, recentItemIds: [] };
    const a = buildHeroDirections(HERO.id, POOL, ctx);
    const b = buildHeroDirections(HERO.id, POOL, ctx);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('只使用可用衣物：待洗/归档不进任何方向', () => {
    const dirty = g('shoes-dirty', 'shoes', { status: 'laundry' });
    const archived = g('bottom-archived', 'bottom', { archivedAt: NOW - 5 });
    const dirs = buildHeroDirections(HERO.id, [...POOL, dirty, archived], { now: NOW, occasion: null, recentItemIds: [] });
    for (const d of dirs) {
      const ids = [d.outfit!.top.id, d.outfit!.bottom.id, d.outfit!.shoes.id, d.outfit!.outerwear?.id];
      expect(ids).not.toContain(dirty.id);
      expect(ids).not.toContain(archived.id);
    }
  });

  it('池子无法组成合法造型时 outfit 为 null（不伪造组合）', () => {
    const dirs = buildHeroDirections(HERO.id, [HERO], { now: NOW, occasion: null, recentItemIds: [] });
    for (const d of dirs) expect(d.outfit).toBeNull();
  });

  it('主角类别无法入组合（如配饰）时全部方向为 null', () => {
    const hero = g('hero-acc', 'accessory');
    const dirs = buildHeroDirections(hero.id, [...POOL, hero], { now: NOW, occasion: null, recentItemIds: [] });
    for (const d of dirs) expect(d.outfit).toBeNull();
  });
});
