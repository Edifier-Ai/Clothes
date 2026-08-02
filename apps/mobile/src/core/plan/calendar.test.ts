/**
 * @jest-environment node
 *
 * 月历与本地日期（MVP-009）RED 测试。
 *
 * 产品语义：计划的日期是「用户当地日期」字面量（YYYY-MM-DD），
 * 不随设备时区变化而偏移；月历固定周一开头。
 */
import { describe, expect, it } from '@jest/globals';

import {
  addDays,
  localDateOf,
  monthGrid,
  monthRangeOf,
  weekdayMondayFirst,
} from './calendar';

describe('weekdayMondayFirst（UTC 数学，不吃设备时区）', () => {
  it('2026-07-27 是周一（验收锚点）', () => {
    expect(weekdayMondayFirst('2026-07-27')).toBe(0);
  });
  it('2026-07-26 是周日', () => {
    expect(weekdayMondayFirst('2026-07-26')).toBe(6);
  });
});

describe('monthGrid（周一开头，42 格）', () => {
  it('2026 年 7 月：首格 2026-06-29（周一），27 日在周一列', () => {
    const grid = monthGrid(2026, 7);
    expect(grid).toHaveLength(42);
    expect(grid[0]).toEqual({ date: '2026-06-29', inMonth: false });
    expect(grid[2]).toEqual({ date: '2026-07-01', inMonth: true });
    const idx27 = grid.findIndex((c) => c.date === '2026-07-27');
    expect(idx27 % 7).toBe(0); // 周一开头列
    expect(grid[idx27].inMonth).toBe(true);
  });

  it('跨月：7 月网格尾部含 8 月 spillover，8 月网格含 7 月末', () => {
    const july = monthGrid(2026, 7);
    const augSpill = july.filter((c) => !c.inMonth && c.date.startsWith('2026-08'));
    // 6-29 起 42 格：2（六月尾）+31（七月）=33 格，尾部 9 格进入 8 月
    expect(augSpill.map((c) => c.date)).toEqual([
      '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
      '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09',
    ]);
    const august = monthGrid(2026, 8);
    expect(august[0]).toEqual({ date: '2026-07-27', inMonth: false });
    // 同一日期在两个网格中字面一致（跨月计划显示正确的根基）
    const inJuly = july.find((c) => c.date === '2026-07-31');
    const inAug = august.find((c) => c.date === '2026-07-31');
    expect(inJuly).toBeDefined();
    expect(inAug).toBeDefined();
  });

  it('月份边界：2026-01 首格是 2025-12-29，2026-12 尾格进入 2027-01', () => {
    expect(monthGrid(2026, 1)[0].date).toBe('2025-12-29');
    const dec = monthGrid(2026, 12);
    expect(dec[dec.length - 1].date).toBe('2027-01-10');
  });
});

describe('addDays（跨年/跨月/闰年，纯字符串日期数学）', () => {
  it('2026-07-31 +1 = 2026-08-01', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
  });
  it('2026-03-01 -1 = 2026-02-28（2026 非闰年）', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('2024-03-01 -1 = 2024-02-29（闰年）', () => {
    expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
  });
  it('2026-01-01 -1 = 2025-12-31（跨年）', () => {
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});

describe('monthRangeOf（月历查询窗口 = 网格首末日期）', () => {
  it('2026-07 → 2026-06-29..2026-08-09', () => {
    expect(monthRangeOf(2026, 7)).toEqual({ start: '2026-06-29', end: '2026-08-09' });
  });
});

describe('localDateOf（当地日期语义，反向验证锚点）', () => {
  // UTC 2026-07-27 00:30 这一瞬：上海已是 27 日早 8:30，纽约还是 26 日晚 20:30。
  const instant = Date.UTC(2026, 6, 27, 0, 30);
  it('同一瞬在不同时区得出不同当地日期', () => {
    expect(localDateOf(instant, 'Asia/Shanghai')).toBe('2026-07-27');
    expect(localDateOf(instant, 'America/New_York')).toBe('2026-07-26');
    expect(localDateOf(instant, 'UTC')).toBe('2026-07-27');
  });

  it('DST 春日（America/New_York 2026-03-08 凌晨跳 1 小时）', () => {
    // 跳表前 01:30 EST 与跳表后 03:30 EDT 都是当地 3 月 8 日。
    expect(localDateOf(Date.UTC(2026, 2, 8, 6, 30), 'America/New_York')).toBe('2026-03-08');
    expect(localDateOf(Date.UTC(2026, 2, 8, 7, 30), 'America/New_York')).toBe('2026-03-08');
  });

  it('DST 秋日（Europe/Berlin 2026-10-25 回拨 1 小时）', () => {
    expect(localDateOf(Date.UTC(2026, 9, 25, 0, 30), 'Europe/Berlin')).toBe('2026-10-25');
    expect(localDateOf(Date.UTC(2026, 9, 25, 22, 30), 'Europe/Berlin')).toBe('2026-10-25');
    expect(localDateOf(Date.UTC(2026, 9, 25, 23, 30), 'Europe/Berlin')).toBe('2026-10-26');
  });

  it('UTC 切片陷阱：UTC 前一日 23 点在上海已是次日凌晨', () => {
    expect(localDateOf(Date.UTC(2026, 6, 26, 16, 0), 'Asia/Shanghai')).toBe('2026-07-27');
  });
});
