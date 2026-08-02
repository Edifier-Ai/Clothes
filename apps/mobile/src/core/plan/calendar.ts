/**
 * 月历与本地日期（MVP-009）。
 *
 * 两条铁律：
 * 1. 日期数学（月历网格、加减天数）一律用 UTC 纪元日整数，不吃设备时区——
 *    月历在任何时区渲染结果一致。
 * 2. 「现在是当地哪一天」用 Intl 按显式时区换算（localDateOf），绝不用
 *    toISOString().slice(0,10) 这类 UTC 切片——那是日期偏移 bug 的经典来源。
 *
 * 计划的 date 字段是 YYYY-MM-DD 当地日期字面量：存进去是什么，读出来就是什么，
 * 设备切换时区不会偏移（任务卡反向验证锚点）。
 */

const DAY_MS = 86_400_000;

export interface CalendarCell {
  /** YYYY-MM-DD。 */
  date: string;
  /** 是否属于本网格的月份（spillover 为 false，跨月计划仍要显示）。 */
  inMonth: boolean;
}

/** YYYY-MM-DD → UTC 纪元日序号。 */
function epochDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / DAY_MS);
}

/** UTC 纪元日序号 → YYYY-MM-DD。 */
function dateOfEpochDay(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** 周一=0 … 周日=6（纯 UTC 数学）。 */
export function weekdayMondayFirst(date: string): number {
  // 1970-01-01 是周四；+3 使周一归零。
  return (((epochDay(date) + 3) % 7) + 7) % 7;
}

/** 日期加减（跨月/跨年/闰年安全）。 */
export function addDays(date: string, n: number): string {
  return dateOfEpochDay(epochDay(date) + n);
}

/** 周一开头的 42 格月历网格。 */
export function monthGrid(year: number, month1: number): CalendarCell[] {
  const first = `${year}-${String(month1).padStart(2, '0')}-01`;
  const start = epochDay(first) - weekdayMondayFirst(first);
  const cells: CalendarCell[] = [];
  for (let i = 0; i < 42; i++) {
    const date = dateOfEpochDay(start + i);
    cells.push({ date, inMonth: date.slice(0, 7) === first.slice(0, 7) });
  }
  return cells;
}

/** 月历查询窗口（网格首末日期，含 spillover）。 */
export function monthRangeOf(year: number, month1: number): { start: string; end: string } {
  const grid = monthGrid(year, month1);
  return { start: grid[0].date, end: grid[grid.length - 1].date };
}

/**
 * 某瞬刻在指定时区的当地日期（YYYY-MM-DD）。
 * timeZone 为 IANA 名（如 Asia/Shanghai）；设备时区用 deviceTimeZone() 取。
 */
export function localDateOf(instant: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(instant));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 设备当前 IANA 时区。 */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/** 设备当地「今天」（可注入 now/timeZone 便于测试）。 */
export function todayLocal(now: number = Date.now(), timeZone: string = deviceTimeZone()): string {
  return localDateOf(now, timeZone);
}
