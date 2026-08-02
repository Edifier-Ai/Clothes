/**
 * @jest-environment node
 *
 * 计划页视图逻辑（MVP-009）RED 测试：月历缩略图解析、按日分组、月统计。
 * 纯函数，不依赖 RN 渲染。
 */
import { describe, expect, it } from '@jest/globals';

import type { PlanRow } from '@/core/db/schema';
import { monthStats, planThumbRelPath, plansByDate } from './planView';

function plan(p: Partial<PlanRow>): PlanRow {
  return {
    id: 'p1',
    date: '2026-07-27',
    timeLabel: '白天',
    occasion: null,
    lookId: null,
    outfitJson: '[]',
    note: null,
    status: 'planned',
    completedAt: null,
    changeNote: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...p,
  };
}

describe('planThumbRelPath（月历缩略图来自真实造型，缺图不破坏布局）', () => {
  it('关联造型 → 封面优先', () => {
    const p = plan({ lookId: 'l1', outfitJson: '["g1"]' });
    expect(planThumbRelPath(p, () => 'covers/l1.png', () => 'thumbs/g1.png')).toBe('covers/l1.png');
  });

  it('造型无封面 → 回退首个有图单品；单品无图 → null（调用方渲染占位）', () => {
    const p = plan({ lookId: 'l1', outfitJson: '["g1","g2"]' });
    expect(planThumbRelPath(p, () => null, (g) => (g === 'g2' ? 'thumbs/g2.png' : null))).toBe('thumbs/g2.png');
    expect(planThumbRelPath(p, () => null, () => null)).toBeNull();
  });

  it('临时组合（无造型）→ 直接走单品缩略图', () => {
    const p = plan({ lookId: null, outfitJson: '["g9"]' });
    expect(planThumbRelPath(p, () => 'covers/x.png', () => 'thumbs/g9.png')).toBe('thumbs/g9.png');
  });

  it('快照损坏（坏 JSON）→ null，不抛错', () => {
    const p = plan({ lookId: null, outfitJson: '{bad' });
    expect(planThumbRelPath(p, () => null, () => 'thumbs/g9.png')).toBeNull();
  });
});

describe('plansByDate（月历按日分组）', () => {
  it('同日多时段归入同一键，跨月 spillover 各自归键', () => {
    const a = plan({ id: 'a', date: '2026-07-27', timeLabel: '白天' });
    const b = plan({ id: 'b', date: '2026-07-27', timeLabel: '晚餐' });
    const c = plan({ id: 'c', date: '2026-08-01' });
    const map = plansByDate([a, b, c]);
    expect(map.get('2026-07-27')?.map((p) => p.id)).toEqual(['a', 'b']);
    expect(map.get('2026-08-01')?.map((p) => p.id)).toEqual(['c']);
  });
});

describe('monthStats（本月已记录天数与连续天数）', () => {
  const mk = (id: string, date: string, status: PlanRow['status']) => plan({ id, date, status });

  it('completed/changed 计入已记录，planned 不计；同日多计划只算一天', () => {
    const stats = monthStats(
      [
        mk('a', '2026-07-25', 'completed'),
        mk('b', '2026-07-25', 'changed'),
        mk('c', '2026-07-26', 'completed'),
        mk('d', '2026-07-27', 'planned'),
        mk('e', '2026-06-30', 'completed'), // 上月不计
      ],
      '2026-07',
      '2026-07-27',
    );
    expect(stats.recordedDays).toBe(2);
  });

  it('连续天数：从今天往前连续有记录的天数；今天未记录则算到昨天', () => {
    const plans = [
      mk('a', '2026-07-25', 'completed'),
      mk('b', '2026-07-26', 'completed'),
      mk('c', '2026-07-27', 'completed'),
    ];
    expect(monthStats(plans, '2026-07', '2026-07-27').streak).toBe(3);
    // 今天没记录， streak 从昨天起算 = 2
    expect(monthStats(plans.filter((p) => p.id !== 'c'), '2026-07', '2026-07-27').streak).toBe(2);
    // 中间断档 → 1
    const gap = [mk('a', '2026-07-25', 'completed'), mk('c', '2026-07-27', 'completed')];
    expect(monthStats(gap, '2026-07', '2026-07-27').streak).toBe(1);
    // 无记录 → 0
    expect(monthStats([], '2026-07', '2026-07-27').streak).toBe(0);
  });
});
