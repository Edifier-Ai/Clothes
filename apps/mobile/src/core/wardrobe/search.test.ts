/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import type { GarmentRow, GarmentTagRow } from '../db/schema';
import {
  applyWardrobeFilter,
  isFilterActive,
  sortWardrobeItems,
  type WardrobeItem,
} from './search';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function garment(partial: Partial<GarmentRow> & { id: string }): GarmentRow {
  return {
    name: partial.id,
    category: 'top',
    status: 'clean',
    priceMinor: null,
    currency: null,
    purchaseDate: null,
    archivedAt: null,
    deletedAt: null,
    createdAt: NOW - 100 * DAY,
    updatedAt: NOW - 100 * DAY,
    ...partial,
  };
}

function tag(garmentId: string, kind: string, value: string): GarmentTagRow {
  return { id: `${garmentId}-${kind}-${value}`, garmentId, kind, value, confidence: 1 };
}

function item(
  g: GarmentRow,
  tags: GarmentTagRow[] = [],
  stats: { lastWornAt?: number | null; timesWorn?: number } = {},
): WardrobeItem {
  return { garment: g, tags, lastWornAt: stats.lastWornAt ?? null, timesWorn: stats.timesWorn ?? 0 };
}

describe('applyWardrobeFilter', () => {
  const items: WardrobeItem[] = [
    item(
      garment({ id: 'g1', name: '白衬衫', category: 'top', status: 'clean' }),
      [tag('g1', 'color', '白色'), tag('g1', 'season', '夏'), tag('g1', 'occasion', '通勤'), tag('g1', 'brand', '优衣库')],
      { lastWornAt: NOW - 2 * DAY, timesWorn: 10 },
    ),
    item(
      garment({ id: 'g2', name: '黑西裤', category: 'bottom', status: 'laundry' }),
      [tag('g2', 'color', '黑色'), tag('g2', 'season', '四季'), tag('g2', 'occasion', '通勤'), tag('g2', 'note', '腰围改小过')],
      { lastWornAt: NOW - 40 * DAY, timesWorn: 3 },
    ),
    item(
      garment({ id: 'g3', name: '羽绒服', category: 'outerwear', status: 'clean' }),
      [tag('g3', 'color', '黑色'), tag('g3', 'season', '冬'), tag('g3', 'occasion', '休闲')],
      { lastWornAt: null, timesWorn: 0 },
    ),
    item(
      garment({ id: 'g4', name: '旧毛衣', category: 'top', status: 'clean', archivedAt: NOW - 5 * DAY }),
      [tag('g4', 'color', '灰色'), tag('g4', 'season', '冬')],
      { lastWornAt: NOW - 200 * DAY, timesWorn: 20 },
    ),
  ];

  it('空筛选返回未归档全部', () => {
    const out = applyWardrobeFilter(items, {}, NOW);
    expect(out.map((i) => i.garment.id).sort()).toEqual(['g1', 'g2', 'g3']);
  });

  it('按类别+颜色+场景组合筛选取交集', () => {
    const out = applyWardrobeFilter(items, { category: 'top', color: '白色', occasion: '通勤' }, NOW);
    expect(out.map((i) => i.garment.id)).toEqual(['g1']);
  });

  it('按季节与状态组合筛选', () => {
    const out = applyWardrobeFilter(items, { season: '冬', status: 'clean' }, NOW);
    expect(out.map((i) => i.garment.id)).toEqual(['g3']);
  });

  it('搜索命中名称、品牌与备注（大小写不敏感）', () => {
    expect(applyWardrobeFilter(items, { text: '羽绒' }, NOW).map((i) => i.garment.id)).toEqual(['g3']);
    expect(applyWardrobeFilter(items, { text: '优衣库' }, NOW).map((i) => i.garment.id)).toEqual(['g1']);
    expect(applyWardrobeFilter(items, { text: '改小' }, NOW).map((i) => i.garment.id)).toEqual(['g2']);
    expect(applyWardrobeFilter(items, { text: '不存在' }, NOW)).toEqual([]);
  });

  it('搜索与其它维度叠加', () => {
    const out = applyWardrobeFilter(items, { text: '羽', category: 'outerwear' }, NOW);
    expect(out.map((i) => i.garment.id)).toEqual(['g3']);
    // 名称命中但类别不符时不返回
    expect(applyWardrobeFilter(items, { text: '羽', category: 'top' }, NOW)).toEqual([]);
  });

  it('状态=archived 只看归档衣物；普通状态筛选不含归档', () => {
    expect(applyWardrobeFilter(items, { status: 'archived' }, NOW).map((i) => i.garment.id)).toEqual(['g4']);
    // g2 是 laundry 但另有 g1 为 clean：clean 筛选只出 g1（g4 归档排除）
    expect(applyWardrobeFilter(items, { status: 'clean' }, NOW).map((i) => i.garment.id).sort()).toEqual(['g1', 'g3']);
  });

  it('久未穿：lastWornAt 超过阈值命中；从未穿但入库不久不命中', () => {
    const fresh = item(garment({ id: 'g5', createdAt: NOW - 3 * DAY }), [], { lastWornAt: null });
    const out = applyWardrobeFilter([...items, fresh], { notWornDays: 30 }, NOW);
    // g2（40 天前）与 g3（从未穿且入库 100 天）命中；g5 入库 3 天不命中；g4 归档排除
    expect(out.map((i) => i.garment.id).sort()).toEqual(['g2', 'g3']);
  });

  it('组合筛选无结果时返回空数组（由 UI 保留条件并给清空入口）', () => {
    expect(applyWardrobeFilter(items, { category: 'shoes', color: '白色' }, NOW)).toEqual([]);
  });

  it('isFilterActive 仅在有实际条件时为真', () => {
    expect(isFilterActive({})).toBe(false);
    expect(isFilterActive({ text: '  ' })).toBe(false);
    expect(isFilterActive({ text: '衬衫' })).toBe(true);
    expect(isFilterActive({ notWornDays: 30 })).toBe(true);
  });
});

describe('sortWardrobeItems', () => {
  const items: WardrobeItem[] = [
    item(garment({ id: 'a', createdAt: NOW - 1 * DAY }), [], { timesWorn: 5, lastWornAt: NOW - 1 * DAY }),
    item(garment({ id: 'b', createdAt: NOW - 2 * DAY }), [], { timesWorn: 0, lastWornAt: null }),
    item(garment({ id: 'c', createdAt: NOW - 3 * DAY }), [], { timesWorn: 5, lastWornAt: NOW - 10 * DAY }),
  ];

  it('recentAdded 按入库时间倒序', () => {
    expect(sortWardrobeItems(items, 'recentAdded').map((i) => i.garment.id)).toEqual(['a', 'b', 'c']);
  });

  it('leastWorn 次数升序，次数相同按入库倒序，确定性', () => {
    expect(sortWardrobeItems(items, 'leastWorn').map((i) => i.garment.id)).toEqual(['b', 'a', 'c']);
  });

  it('leastRecentlyWorn 从未穿优先，其余按最近穿着升序', () => {
    expect(sortWardrobeItems(items, 'leastRecentlyWorn').map((i) => i.garment.id)).toEqual(['b', 'c', 'a']);
  });
});
