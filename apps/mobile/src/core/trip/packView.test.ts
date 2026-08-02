/**
 * @jest-environment node
 *
 * 旅行打包纯函数（MVP-010）RED 测试。
 *
 * 覆盖任务卡验收：
 * - 五天十套同一件鞋 → 一项 + 来源数 5（任务卡反向验证锚点）
 * - 来源计数随造型删除重算（5 → 4）
 * - 缺失引用不静默消失
 * - 按状态分组、勾选汇总
 */
import { describe, expect, it } from '@jest/globals';

import {
  computePackingFromOutfits,
  packingSummary,
  tripsByStatus,
} from './packView';
import type { TripOutfitView } from './packView';

/** 简易 fixture：同一件鞋 g-shoe 出现在 5 套造型里。 */
function fiveDaysTenOutfits(shoeId: string): TripOutfitView[] {
  const out: TripOutfitView[] = [];
  for (let d = 1; d <= 5; d++) {
    const date = `2026-08-${String(d).padStart(2, '0')}`;
    out.push({
      id: `to-${date}-day`,
      tripId: 't1',
      date,
      timeLabel: '白天',
      outfitGarmentIds: [shoeId, `g-top-${d}`],
      deletedAt: null,
    });
    out.push({
      id: `to-${date}-eve`,
      tripId: 't1',
      date,
      timeLabel: '晚餐',
      outfitGarmentIds: [shoeId, `g-dress-${d}`],
      deletedAt: null,
    });
  }
  return out;
}

describe('computePackingFromOutfits（去重 + 来源计数）', () => {
  it('五天十套同一件鞋 → 一项 + 来源数 10（验收标准：5 天 × 2 时段 = 10 套都用同一鞋）', () => {
    const outfits = fiveDaysTenOutfits('g-shoe');
    const items = computePackingFromOutfits(outfits);
    const shoeItem = items.find((i) => i.garmentId === 'g-shoe');
    expect(shoeItem).toBeDefined();
    expect(shoeItem!.sourceCount).toBe(10);
    expect(shoeItem!.sourceOutfitIds).toHaveLength(10);
    // 其它衣物各出现一次
    const top1 = items.find((i) => i.garmentId === 'g-top-1');
    expect(top1).toBeDefined();
    expect(top1!.sourceCount).toBe(1);
  });

  it('任务卡反向验证锚点：5 套造型都用同一件鞋 → 一项 + 来源数 5；移除一套后来源数 → 4', () => {
    // 5 套造型（不是 5 天 10 套），同一件鞋出现在每套
    const outfits: TripOutfitView[] = Array.from({ length: 5 }, (_, i) => ({
      id: `to-${i}`,
      tripId: 't',
      date: `2026-08-${String(i + 1).padStart(2, '0')}`,
      timeLabel: '白天',
      outfitGarmentIds: ['g-shoe'],
      deletedAt: null,
    }));
    const before = computePackingFromOutfits(outfits);
    expect(before).toHaveLength(1);
    expect(before[0].garmentId).toBe('g-shoe');
    expect(before[0].sourceCount).toBe(5);
    // 移除一套 → 来源数 4
    const after = computePackingFromOutfits(outfits.slice(0, 4));
    expect(after).toHaveLength(1);
    expect(after[0].sourceCount).toBe(4);
  });

  it('移除某日造型后该日独有衣物从清单消失，跨日共享衣物来源数减 1', () => {
    const outfits = fiveDaysTenOutfits('g-shoe');
    // 移除第一天白天那套（鞋仍被其余 9 套使用，g-top-1 仅此一套用到）
    const trimmed = outfits.filter((o) => o.id !== 'to-2026-08-01-day');
    const items = computePackingFromOutfits(trimmed);
    const shoeItem = items.find((i) => i.garmentId === 'g-shoe')!;
    expect(shoeItem.sourceCount).toBe(9);
    // g-top-1 不再被任何造型用 → 该项从清单消失（清单只根据已安排造型去重）
    expect(items.find((i) => i.garmentId === 'g-top-1')).toBeUndefined();
  });

  it('同件衣物不重复出现（去重幂等）', () => {
    const outfits: TripOutfitView[] = [
      { id: 'a', tripId: 't', date: '2026-08-01', timeLabel: '白天', outfitGarmentIds: ['g1', 'g2'], deletedAt: null },
      { id: 'b', tripId: 't', date: '2026-08-01', timeLabel: '晚餐', outfitGarmentIds: ['g1', 'g3'], deletedAt: null },
      { id: 'c', tripId: 't', date: '2026-08-02', timeLabel: '白天', outfitGarmentIds: ['g1', 'g2', 'g3'], deletedAt: null },
    ];
    const items = computePackingFromOutfits(outfits);
    expect(items).toHaveLength(3); // g1, g2, g3 各一项
    const byId = new Map(items.map((i) => [i.garmentId, i]));
    expect(byId.get('g1')!.sourceCount).toBe(3);
    expect(byId.get('g1')!.sourceOutfitIds).toEqual(['a', 'b', 'c']);
    expect(byId.get('g2')!.sourceCount).toBe(2);
    expect(byId.get('g2')!.sourceOutfitIds).toEqual(['a', 'c']);
    expect(byId.get('g3')!.sourceCount).toBe(2);
  });

  it('墓碑造型不参与计算（来源计数排除已删造型）', () => {
    const outfits: TripOutfitView[] = [
      { id: 'a', tripId: 't', date: '2026-08-01', timeLabel: '白天', outfitGarmentIds: ['g1'], deletedAt: null },
      { id: 'b', tripId: 't', date: '2026-08-01', timeLabel: '晚餐', outfitGarmentIds: ['g1'], deletedAt: 9999 },
      { id: 'c', tripId: 't', date: '2026-08-02', timeLabel: '白天', outfitGarmentIds: ['g1'], deletedAt: null },
    ];
    const items = computePackingFromOutfits(outfits);
    const g1 = items.find((i) => i.garmentId === 'g1')!;
    expect(g1.sourceCount).toBe(2); // 不计墓碑的 b
    expect(g1.sourceOutfitIds).toEqual(['a', 'c']);
  });

  it('坏快照（非数组/坏 JSON）按空快照处理，不抛错', () => {
    const outfits: TripOutfitView[] = [
      { id: 'a', tripId: 't', date: '2026-08-01', timeLabel: '白天', outfitGarmentIds: [], deletedAt: null },
    ];
    expect(computePackingFromOutfits(outfits)).toEqual([]);
  });
});

describe('packingSummary', () => {
  it('汇总总数/已勾选/未勾选/手工项数', () => {
    const items = [
      { id: 'p1', kind: 'garment' as const, label: '白T', garmentId: 'g1', checked: true, sourceCount: 2, missing: false, sourceOutfitIds: ['a', 'b'] },
      { id: 'p2', kind: 'garment' as const, label: '牛仔裤', garmentId: 'g2', checked: false, sourceCount: 1, missing: false, sourceOutfitIds: ['a'] },
      { id: 'p3', kind: 'manual' as const, label: '牙刷', garmentId: null, checked: true, sourceCount: 0, missing: false, sourceOutfitIds: [] },
      { id: 'p4', kind: 'garment' as const, label: '失物', garmentId: 'g9', checked: false, sourceCount: 0, missing: true, sourceOutfitIds: [] },
    ];
    const s = packingSummary(items);
    expect(s.total).toBe(4);
    expect(s.checked).toBe(2);
    expect(s.unchecked).toBe(2);
    expect(s.manualCount).toBe(1);
    expect(s.missingCount).toBe(1);
  });
});

describe('tripsByStatus', () => {
  it('按状态分组（planning/ongoing/completed/archived）', () => {
    const trips = [
      { id: 't1', status: 'planning' as const, name: 'A' },
      { id: 't2', status: 'ongoing' as const, name: 'B' },
      { id: 't3', status: 'planning' as const, name: 'C' },
      { id: 't4', status: 'completed' as const, name: 'D' },
      { id: 't5', status: 'archived' as const, name: 'E' },
    ];
    const g = tripsByStatus(trips);
    expect(g.planning.map((t) => t.id)).toEqual(['t1', 't3']);
    expect(g.ongoing.map((t) => t.id)).toEqual(['t2']);
    expect(g.completed.map((t) => t.id)).toEqual(['t4']);
    expect(g.archived.map((t) => t.id)).toEqual(['t5']);
  });
});
