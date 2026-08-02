import type { GarmentCategory, GarmentRow, GarmentStatus, GarmentTagRow } from '../db/schema';

/**
 * 衣橱搜索与组合筛选（MVP-007 CLS-02）。纯函数，不碰 DB：
 * 输入由装配层（query.ts）从 SQLite 聚合，本模块只做确定性过滤与排序。
 *
 * 语义：
 * - 默认（无 status 条件）排除归档；status='archived' 只看归档。
 * - text 命中名称或 brand/note 标签值，大小写不敏感。
 * - 久未穿：lastWornAt 缺失时用 createdAt 兜底，避免新入库从未穿被误判。
 */

export interface WardrobeItem {
  garment: GarmentRow;
  tags: GarmentTagRow[];
  lastWornAt: number | null;
  timesWorn: number;
}

export interface WardrobeFilter {
  /** 名称 / 品牌 / 备注 */
  text?: string;
  category?: GarmentCategory;
  color?: string;
  season?: string;
  occasion?: string;
  /** 具体状态或 'archived'（归档区） */
  status?: GarmentStatus | 'archived';
  /** 久未穿阈值（天） */
  notWornDays?: number;
}

export type WardrobeSort = 'recentAdded' | 'leastWorn' | 'leastRecentlyWorn';

const DAY_MS = 86_400_000;

function tagValue(item: WardrobeItem, kind: string): string | null {
  return item.tags.find((t) => t.kind === kind)?.value ?? null;
}

function matchesText(item: WardrobeItem, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  if (item.garment.name.toLowerCase().includes(q)) return true;
  return item.tags.some(
    (t) => (t.kind === 'brand' || t.kind === 'note') && t.value.toLowerCase().includes(q),
  );
}

export function applyWardrobeFilter(
  items: readonly WardrobeItem[],
  filter: WardrobeFilter,
  now: number,
): WardrobeItem[] {
  return items.filter((item) => {
    const g = item.garment;
    if (filter.status === 'archived') {
      if (g.archivedAt == null) return false;
    } else {
      if (g.archivedAt != null) return false;
      if (filter.status && g.status !== filter.status) return false;
    }
    if (filter.category && g.category !== filter.category) return false;
    if (filter.color && tagValue(item, 'color')?.toLowerCase() !== filter.color.toLowerCase()) return false;
    if (filter.season && tagValue(item, 'season')?.toLowerCase() !== filter.season.toLowerCase()) return false;
    if (filter.occasion && tagValue(item, 'occasion')?.toLowerCase() !== filter.occasion.toLowerCase()) return false;
    if (filter.notWornDays != null) {
      const basis = item.lastWornAt ?? g.createdAt;
      if (basis > now - filter.notWornDays * DAY_MS) return false;
    }
    if (!matchesText(item, filter.text ?? '')) return false;
    return true;
  });
}

/** 是否有实际生效的筛选条件（供「一键清空」与结果区提示）。 */
export function isFilterActive(filter: WardrobeFilter): boolean {
  return Boolean(
    (filter.text && filter.text.trim()) ||
      filter.category ||
      filter.color ||
      filter.season ||
      filter.occasion ||
      filter.status ||
      filter.notWornDays != null,
  );
}

/** 确定性排序：全部带 id 兜底，保证同输入同输出。 */
export function sortWardrobeItems(
  items: readonly WardrobeItem[],
  sort: WardrobeSort,
): WardrobeItem[] {
  const byId = (a: WardrobeItem, b: WardrobeItem) => (a.garment.id < b.garment.id ? -1 : 1);
  const arr = [...items];
  if (sort === 'recentAdded') {
    arr.sort((a, b) => b.garment.createdAt - a.garment.createdAt || byId(a, b));
  } else if (sort === 'leastWorn') {
    arr.sort(
      (a, b) => a.timesWorn - b.timesWorn || b.garment.createdAt - a.garment.createdAt || byId(a, b),
    );
  } else {
    // leastRecentlyWorn：从未穿（null）最优先
    const key = (i: WardrobeItem) => i.lastWornAt ?? Number.NEGATIVE_INFINITY;
    arr.sort((a, b) => key(a) - key(b) || byId(a, b));
  }
  return arr;
}
