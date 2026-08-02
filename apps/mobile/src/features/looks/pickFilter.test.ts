import { describe, expect, it } from '@jest/globals';

import {
  filterPickCandidates,
  isPickAvailable,
  slotCategories,
  type PickCandidate,
} from './pickFilter';

function cand(patch: Partial<PickCandidate>): PickCandidate {
  return {
    id: 'g1',
    name: '白衬衫',
    category: 'top',
    status: 'clean',
    archivedAt: null,
    brand: null,
    note: null,
    imageRelPath: null,
    ...patch,
  };
}

describe('isPickAvailable（与推荐引擎 isAvailable 同语义）', () => {
  it('待洗/干洗/借出不可用', () => {
    expect(isPickAvailable(cand({ status: 'laundry' }))).toBe(false);
    expect(isPickAvailable(cand({ status: 'dryclean' }))).toBe(false);
    expect(isPickAvailable(cand({ status: 'loaned' }))).toBe(false);
  });

  it('归档不可用；干净/穿过/心愿单可用', () => {
    expect(isPickAvailable(cand({ archivedAt: 123 }))).toBe(false);
    expect(isPickAvailable(cand({ status: 'clean' }))).toBe(true);
    expect(isPickAvailable(cand({ status: 'worn' }))).toBe(true);
    expect(isPickAvailable(cand({ status: 'wishlist' }))).toBe(true);
  });
});

describe('slotCategories（快速模式按槽位过滤类别）', () => {
  it('槽位映射到对应类别', () => {
    expect(slotCategories('top')).toEqual(['top']);
    expect(slotCategories('shoes')).toEqual(['shoes']);
    expect(slotCategories('outerwear')).toEqual(['outerwear']);
    expect(slotCategories('accessory')).toEqual(['accessory']);
  });

  it('画布模式（null）不过滤类别', () => {
    expect(slotCategories(null)).toBeNull();
    expect(slotCategories(undefined)).toBeNull();
  });
});

describe('filterPickCandidates', () => {
  const pool: PickCandidate[] = [
    cand({ id: 'a', name: '白衬衫', category: 'top', brand: 'ARKET' }),
    cand({ id: 'b', name: '黑色半裙', category: 'bottom', note: '通勤常穿' }),
    cand({ id: 'c', name: '乐福鞋', category: 'shoes', status: 'laundry' }),
    cand({ id: 'd', name: '风衣', category: 'outerwear', archivedAt: 999 }),
  ];

  it('搜索命中名称/品牌/备注，大小写不敏感', () => {
    expect(filterPickCandidates(pool, { text: '衬衫' }).map((c) => c.id)).toEqual(['a']);
    expect(filterPickCandidates(pool, { text: 'arket' }).map((c) => c.id)).toEqual(['a']);
    expect(filterPickCandidates(pool, { text: '通勤' }).map((c) => c.id)).toEqual(['b']);
  });

  it('分类过滤', () => {
    expect(filterPickCandidates(pool, { category: 'bottom' }).map((c) => c.id)).toEqual(['b']);
  });

  it('只看可用：排除待洗与归档', () => {
    expect(filterPickCandidates(pool, { onlyAvailable: true }).map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('槽位过滤类别（top 只见上装）', () => {
    expect(filterPickCandidates(pool, { slot: 'top' }).map((c) => c.id)).toEqual(['a']);
    expect(filterPickCandidates(pool, { slot: null }).map((c) => c.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('组合条件同时生效', () => {
    expect(
      filterPickCandidates(pool, { slot: null, onlyAvailable: true, text: '鞋' }).map((c) => c.id),
    ).toEqual([]);
  });
});
