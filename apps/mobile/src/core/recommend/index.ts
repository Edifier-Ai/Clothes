/**
 * 今日推荐引擎（MVP-005）。
 *
 * 设计原则：
 * - 纯函数 + 确定性排序：同输入产出同输出（可复现验收）。
 * - 硬约束先过滤，再做合法槽位组合，最后规则评分。
 * - reason_codes 版本化字符串，仅来自真实命中的规则，不编造。
 * - 不做 LLM 审美、不做天气网络请求（MVP-006 范围）。
 *
 * 槽位：top + bottom + shoes 必填；outerwear 可选；dress 可顶替 top+bottom。
 */

import type { GarmentCategory, GarmentStatus } from '../db/schema';

/** 不可进入候选的状态（待洗/干洗/借出）。归档（archivedAt!=null）也排除。 */
export const HARD_CONSTRAINT_STATUSES: readonly GarmentStatus[] = [
  'laundry',
  'dryclean',
  'loaned',
];

export type RecOccasion = 'commute' | 'casual' | 'formal' | 'travel' | 'sport';

export interface GarmentForRec {
  id: string;
  category: GarmentCategory;
  status: GarmentStatus;
  createdAt: number;
  updatedAt: number;
  lastWornAt: number | null;
  timesWorn: number;
  archivedAt?: number | null;
}

export interface Outfit {
  top: GarmentForRec;
  bottom: GarmentForRec;
  shoes: GarmentForRec;
  outerwear?: GarmentForRec | undefined;
}

export interface RecContext {
  now: number;
  occasion: RecOccasion | null;
  weatherTempC: number | null;
  recentItemIds: readonly string[];
}

export type RecResult =
  | { ok: true; outfit: Outfit; reasonCodes: string[]; totalScore: number }
  | { ok: false; missing: string[] };

const DAY_MS = 86_400_000;

export function isAvailable(i: GarmentForRec): boolean {
  if (i.archivedAt != null) return false;
  if ((HARD_CONSTRAINT_STATUSES as readonly string[]).includes(i.status)) return false;
  return true;
}

/** 确定性排序：久未穿（null 最优先）→ 穿过次数少 → id 字典序兜底。 */
function compareForRec(a: GarmentForRec, b: GarmentForRec): number {
  const aLast = a.lastWornAt ?? -1; // null 视为 -1，比任何时间戳都早
  const bLast = b.lastWornAt ?? -1;
  if (aLast !== bLast) return aLast - bLast;
  if (a.timesWorn !== b.timesWorn) return a.timesWorn - b.timesWorn;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function pickBest(items: readonly GarmentForRec[]): GarmentForRec | null {
  const sorted = [...items].sort(compareForRec);
  return sorted[0] ?? null;
}

/** 计算单件得分（越大越优），仅用于 totalScore 汇总，不参与排序决策。 */
function scoreItem(i: GarmentForRec, ctx: RecContext): number {
  const last = i.lastWornAt ?? 0;
  const staleDays = Math.max(0, Math.floor((ctx.now - last) / DAY_MS));
  // 久未穿加分 + 新衣物加分 - 频繁穿扣分
  return staleDays * 10 + (i.lastWornAt == null ? 50 : 0) - i.timesWorn * 5;
}

function notWornReason(i: GarmentForRec, ctx: RecContext): string | null {
  if (i.lastWornAt == null) return 'FRESH_NEW';
  const days = Math.floor((ctx.now - i.lastWornAt) / DAY_MS);
  if (days >= 30) return `NOT_WORN_30D`;
  if (days >= 14) return `NOT_WORN_14D`;
  if (days >= 7) return `NOT_WORN_7D`;
  return null;
}

function occasionReason(ctx: RecContext): string | null {
  if (ctx.occasion == null) return null;
  return `OCCASION_${ctx.occasion.toUpperCase()}`;
}

/**
 * 生成推荐。
 *
 * 合法组合：
 *  - top + bottom + shoes（标准）
 *  - dress + shoes（连衣裙顶替 top+bottom，dress 同时进 top 与 bottom 槽位）
 *  - outerwear 可选；天气冷（<=18℃）或场景 formal/travel 时优先选入
 *
 * 无合法组合时返回 missing 槽位列表（不伪造）。
 */
export function generateRecommendation(
  items: readonly GarmentForRec[],
  ctx: RecContext,
): RecResult {
  const pool = items.filter(isAvailable);

  const tops = pool.filter((i) => i.category === 'top');
  const bottoms = pool.filter((i) => i.category === 'bottom');
  const dresses = pool.filter((i) => i.category === 'dress');
  const shoesPool = pool.filter((i) => i.category === 'shoes');
  const outerwears = pool.filter((i) => i.category === 'outerwear');

  const shoes = pickBest(shoesPool);
  if (!shoes) {
    return { ok: false, missing: ['shoes'] };
  }

  // 标准组合优先（top+bottom）
  let top: GarmentForRec | null = pickBest(tops);
  let bottom: GarmentForRec | null = pickBest(bottoms);
  let usedDress = false;

  // top 或 bottom 缺时尝试 dress 顶替
  if ((!top || !bottom) && dresses.length > 0) {
    const dress = pickBest(dresses);
    if (dress) {
      top = dress;
      bottom = dress;
      usedDress = true;
    }
  }

  if (!top || !bottom) {
    const missing: string[] = [];
    if (!top) missing.push('top');
    if (!bottom) missing.push('bottom');
    if (!shoes) missing.push('shoes');
    return { ok: false, missing };
  }

  // outerwear 可选：天气冷或场景需要时选入
  let outerwear: GarmentForRec | undefined;
  const cold = ctx.weatherTempC != null && ctx.weatherTempC <= 18;
  const outerPreferred = cold || ctx.occasion === 'formal' || ctx.occasion === 'travel';
  if (outerwears.length > 0 && outerPreferred) {
    outerwear = pickBest(outerwears) ?? undefined;
  } else if (outerwears.length > 0) {
    // 即使非冷天，若有外套也作为可选项加入（前端可隐藏）
    outerwear = pickBest(outerwears) ?? undefined;
  }

  const outfit: Outfit = { top, bottom, shoes, outerwear };

  // reason_codes：仅来自真实命中规则
  const codes: string[] = [];
  codes.push('SLOT_FILLED_TOP');
  codes.push(usedDress ? 'SLOT_FILLED_BOTTOM_BY_DRESS' : 'SLOT_FILLED_BOTTOM');
  codes.push('SLOT_FILLED_SHOES');
  if (outerwear) codes.push('SLOT_FILLED_OUTER');

  // 久未穿 / 新衣物
  const topReason = notWornReason(top, ctx);
  if (topReason) codes.push(topReason);
  if (!usedDress) {
    const bottomReason = notWornReason(bottom, ctx);
    if (bottomReason) codes.push(bottomReason);
  }
  const shoesReason = notWornReason(shoes, ctx);
  if (shoesReason) codes.push(shoesReason);
  if (outerwear) {
    const outerReason = notWornReason(outerwear, ctx);
    if (outerReason) codes.push(outerReason);
  }

  // 场景
  const occ = occasionReason(ctx);
  if (occ) codes.push(occ);

  // 天气
  if (cold && outerwear) codes.push('WEATHER_COLD_OUTER');
  if (ctx.weatherTempC != null && ctx.weatherTempC >= 26) codes.push('WEATHER_HOT_NO_OUTER');

  const totalScore =
    scoreItem(top, ctx) +
    scoreItem(usedDress ? bottom : bottom, ctx) +
    scoreItem(shoes, ctx) +
    (outerwear ? scoreItem(outerwear, ctx) : 0);

  return { ok: true, outfit, reasonCodes: codes, totalScore };
}

/** 显示用：从 reasonCodes 选最重要的 2-3 条。 */
export function topReasons(codes: readonly string[], max = 3): string[] {
  const priority = [
    'WEATHER_COLD_OUTER',
    'WEATHER_HOT_NO_OUTER',
    'MODE_SAFE',
    'MODE_FRESH',
    'MODE_HERO',
    'MODE_HURRY',
    'OCCASION_COMMUTE',
    'OCCASION_FORMAL',
    'OCCASION_TRAVEL',
    'OCCASION_CASUAL',
    'OCCASION_SPORT',
    'NOT_WORN_30D',
    'NOT_WORN_14D',
    'NOT_WORN_7D',
    'FRESH_NEW',
    'SLOT_FILLED_OUTER',
    'SLOT_FILLED_BOTTOM_BY_DRESS',
    'SLOT_FILLED_TOP',
    'SLOT_FILLED_BOTTOM',
    'SLOT_FILLED_SHOES',
  ];
  const set = new Set(codes);
  const out: string[] = [];
  for (const c of priority) {
    if (set.has(c)) out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** 给前端展示用的中文文案映射（可扩展，版本化字符串保持英文）。 */
export const REASON_LABEL: Record<string, string> = {
  SLOT_FILLED_TOP: '上装已就位',
  SLOT_FILLED_BOTTOM: '下装已就位',
  SLOT_FILLED_BOTTOM_BY_DRESS: '连衣裙同时覆盖上下装',
  SLOT_FILLED_SHOES: '鞋已就位',
  SLOT_FILLED_OUTER: '外套已就位',
  OCCASION_COMMUTE: '通勤场景',
  OCCASION_CASUAL: '日常休闲',
  OCCASION_FORMAL: '正式场合',
  OCCASION_TRAVEL: '旅行场景',
  OCCASION_SPORT: '运动场景',
  NOT_WORN_30D: '已 30 天未穿，该盘活了',
  NOT_WORN_14D: '已 14 天未穿',
  NOT_WORN_7D: '已 7 天未穿',
  FRESH_NEW: '新衣物，首次出场',
  WEATHER_COLD_OUTER: '天气偏冷，建议加外套',
  WEATHER_HOT_NO_OUTER: '天气较热，无需外套',
  MODE_SAFE: '稳妥模式，优先熟悉单品',
  MODE_FRESH: '新鲜模式，优先不同组合',
  MODE_HERO: '主角单品已锁定',
  MODE_HURRY: '赶时间模式，减少决策步骤',
  REPEAT_SUPPRESSION: '已避开刚刚跳过的组合',
  HERO_LOCKED: '已保留主角单品',
  SLOT_REPLACED: '仅替换了所选单品',
};
