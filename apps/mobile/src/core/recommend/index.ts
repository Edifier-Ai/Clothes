/**
 * 今日推荐引擎（MVP-005）。
 *
 * 设计原则：
 * - 纯函数 + 确定性排序：同输入产出同输出（可复现验收）。
 * - 硬约束先过滤，再做合法槽位组合，最后规则评分。
 * - reason_codes 版本化字符串，仅来自真实命中的规则，不编造。
 * - 不做 LLM 审美或网络请求。
 *
 * 槽位：top + bottom + shoes 必填；outerwear 可选；dress 可顶替 top+bottom。
 */

import type { GarmentCategory, GarmentStatus } from '../db/schema';
import {
  COLOR_CLASH_NO_ALT_CODE,
  COLOR_HARMONIOUS_CODE,
  colorsClash,
  hasKnownColor,
} from './colorRules';
import {
  resolveRecommendationFactors,
  type RecommendationFactorOverrides,
} from './factors';

import { outerNeed, seasonFit, type TempBand } from './weather';

export {
  DEFAULT_RECOMMENDATION_FACTORS,
  resolveRecommendationFactors,
  type RecommendationFactors,
  type RecommendationFactorOverrides,
} from './factors';

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
  /** 颜色标签值（来自 garment_tags kind='color'）；null/undefined 表示未录入。 */
  color?: string | null;
  /** 季节标签值（kind='season'，自由文本如「夏」「春秋」）；未录入为 null/undefined。 */
  season?: string | null;
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
  recentItemIds: readonly string[];
  factors?: RecommendationFactorOverrides;
  /** 今日气温档位（用户点选）；未提供或关闭「天气」要素时不参与推荐。 */
  temperature?: TempBand | null;
}

export { TEMP_BANDS, TEMP_LABEL, defaultBandForMonth, type TempBand } from './weather';

/** 当前上下文下生效的气温档位（要素关闭或未选时为 null）。 */
export function activeTemperature(ctx: Pick<RecContext, 'factors' | 'temperature'>): TempBand | null {
  if (!resolveRecommendationFactors(ctx.factors).weather) return null;
  return ctx.temperature ?? null;
}

/** 该衣物的季节标签与当前气温明显不搭（标签已填且没有交集）。 */
export function isSeasonMismatch(item: GarmentForRec, ctx: Pick<RecContext, 'factors' | 'temperature'>): boolean {
  const band = activeTemperature(ctx);
  return band != null && seasonFit(item.season, band) === 'mismatch';
}

/** 天气相关的理由码：仅当真实命中时返回。 */
export function weatherReasonCodes(outfit: Outfit, ctx: Pick<RecContext, 'factors' | 'temperature'>): string[] {
  const band = activeTemperature(ctx);
  if (!band) return [];
  const pieces = [outfit.top, outfit.bottom, outfit.shoes, outfit.outerwear].filter(
    (p): p is GarmentForRec => Boolean(p),
  );
  const codes: string[] = [];
  const fits = pieces.map((p) => seasonFit(p.season, band));
  if (!fits.includes('mismatch') && fits.includes('fit')) codes.push('WEATHER_FIT');
  if (outfit.outerwear && outerNeed(band) === 'needed') codes.push('WEATHER_OUTER');
  return codes;
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
function compareForRec(a: GarmentForRec, b: GarmentForRec, ctx: RecContext): number {
  const factors = resolveRecommendationFactors(ctx.factors);
  // 季节与今日气温明显不搭的排到后面（只是降权：衣橱里只有它时仍会用）。
  const aMismatch = isSeasonMismatch(a, ctx);
  const bMismatch = isSeasonMismatch(b, ctx);
  if (aMismatch !== bMismatch) return aMismatch ? 1 : -1;
  if (factors.repeatAvoidance) {
    const recent = new Set(ctx.recentItemIds);
    const aRecent = recent.has(a.id);
    const bRecent = recent.has(b.id);
    if (aRecent !== bRecent) return aRecent ? 1 : -1;
  }
  if (factors.wardrobeActivation) {
    const aLast = a.lastWornAt ?? -1;
    const bLast = b.lastWornAt ?? -1;
    if (aLast !== bLast) return aLast - bLast;
    if (a.timesWorn !== b.timesWorn) return a.timesWorn - b.timesWorn;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function pickBest(items: readonly GarmentForRec[], ctx: RecContext): GarmentForRec | null {
  const sorted = [...items].sort((a, b) => compareForRec(a, b, ctx));
  return sorted[0] ?? null;
}

interface TopBottomSelection {
  top: GarmentForRec | null;
  bottom: GarmentForRec | null;
  hadClash: boolean;
}

/**
 * 上下装联合择优：先在完整笛卡尔积中避开明显冲突，再按两件的盘活排名共同择优。
 * 不能先锁定第一件上装，否则“次优上装 + 最优下装”的协调组合永远没有机会被选中。
 */
function pickBestTopBottom(
  tops: readonly GarmentForRec[],
  bottoms: readonly GarmentForRec[],
  ctx: RecContext,
): TopBottomSelection {
  const factors = resolveRecommendationFactors(ctx.factors);
  const rankedTops = [...tops].sort((a, b) => compareForRec(a, b, ctx));
  const rankedBottoms = [...bottoms].sort((a, b) => compareForRec(a, b, ctx));
  if (rankedTops.length === 0 || rankedBottoms.length === 0) {
    return {
      top: rankedTops[0] ?? null,
      bottom: rankedBottoms[0] ?? null,
      hadClash: false,
    };
  }

  const pairs = rankedTops.flatMap((top, topRank) =>
    rankedBottoms.map((bottom, bottomRank) => ({
      top,
      bottom,
      topRank,
      bottomRank,
      hadClash: factors.colorHarmony && colorsClash(top.color, bottom.color),
    })),
  );
  pairs.sort((a, b) => {
    // 明显冲突是首要劣化项；只在所有组合都冲突时才回退。
    if (a.hadClash !== b.hadClash) return a.hadClash ? 1 : -1;
    const aSum = a.topRank + a.bottomRank;
    const bSum = b.topRank + b.bottomRank;
    if (aSum !== bSum) return aSum - bSum;
    const aWorst = Math.max(a.topRank, a.bottomRank);
    const bWorst = Math.max(b.topRank, b.bottomRank);
    if (aWorst !== bWorst) return aWorst - bWorst;
    if (a.topRank !== b.topRank) return a.topRank - b.topRank;
    return a.bottomRank - b.bottomRank;
  });

  const best = pairs[0];
  return { top: best.top, bottom: best.bottom, hadClash: best.hadClash };
}

/** 计算单件得分（越大越优），仅用于 totalScore 汇总，不参与排序决策。 */
function scoreItem(i: GarmentForRec, ctx: RecContext): number {
  if (!resolveRecommendationFactors(ctx.factors).wardrobeActivation) return 0;
  const last = i.lastWornAt ?? 0;
  const staleDays = Math.max(0, Math.floor((ctx.now - last) / DAY_MS));
  // 久未穿加分 + 新衣物加分 - 频繁穿扣分
  return staleDays * 10 + (i.lastWornAt == null ? 50 : 0) - i.timesWorn * 5;
}

function notWornReason(i: GarmentForRec, ctx: RecContext): string | null {
  if (!resolveRecommendationFactors(ctx.factors).wardrobeActivation) return null;
  if (i.lastWornAt == null) return 'FRESH_NEW';
  const days = Math.floor((ctx.now - i.lastWornAt) / DAY_MS);
  if (days >= 30) return `NOT_WORN_30D`;
  if (days >= 14) return `NOT_WORN_14D`;
  if (days >= 7) return `NOT_WORN_7D`;
  return null;
}

function occasionReason(ctx: RecContext): string | null {
  if (!resolveRecommendationFactors(ctx.factors).occasion || ctx.occasion == null) return null;
  return `OCCASION_${ctx.occasion.toUpperCase()}`;
}

/**
 * 生成推荐。
 *
 * 合法组合：
 *  - top + bottom + shoes（标准）
 *  - dress + shoes（连衣裙顶替 top+bottom，dress 同时进 top 与 bottom 槽位）
 *  - outerwear 可选；场景 formal/travel 时优先选入
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
  const factors = resolveRecommendationFactors(ctx.factors);

  const shoes = pickBest(shoesPool, ctx);
  if (!shoes) {
    return { ok: false, missing: ['shoes'] };
  }

  // 标准组合优先（top+bottom）
  const pair = pickBestTopBottom(tops, bottoms, ctx);
  let top: GarmentForRec | null = pair.top;
  let bottom: GarmentForRec | null = pair.bottom;
  let usedDress = false;
  let bottomClashNoAlt = pair.hadClash;

  // top 或 bottom 缺时尝试 dress 顶替
  if ((!top || !bottom) && dresses.length > 0) {
    const dress = pickBest(dresses, ctx);
    if (dress) {
      top = dress;
      bottom = dress;
      usedDress = true;
      bottomClashNoAlt = false; // dress 同色不冲突
    }
  }

  if (!top || !bottom) {
    const missing: string[] = [];
    if (!top) missing.push('top');
    if (!bottom) missing.push('bottom');
    if (!shoes) missing.push('shoes');
    return { ok: false, missing };
  }

  // outerwear 可选：冷/凉天必带、热天不带；暖天交给场景规则（通勤/正式/旅行带）。
  let outerwear: GarmentForRec | undefined;
  const band = activeTemperature(ctx);
  const need = band ? outerNeed(band) : 'by-occasion';
  const outerByOccasion =
    factors.occasion &&
    (ctx.occasion === 'commute' || ctx.occasion === 'formal' || ctx.occasion === 'travel');
  const outerPreferred = need === 'needed' || (need === 'by-occasion' && outerByOccasion);
  if (outerwears.length > 0 && outerPreferred) {
    outerwear = pickBest(outerwears, ctx) ?? undefined;
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
  if (!usedDress && factors.colorHarmony) {
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

  // 天气：季节标签与气温相符 / 冷凉天加外套
  codes.push(...weatherReasonCodes(outfit, ctx));

  // 配色规则（仅当上下装均有颜色数据时命中）
  if (!usedDress) {
    if (bottomClashNoAlt) {
      codes.push(COLOR_CLASH_NO_ALT_CODE);
    } else if (
      hasKnownColor(top.color) &&
      hasKnownColor(bottom.color) &&
      !colorsClash(top.color, bottom.color)
    ) {
      codes.push(COLOR_HARMONIOUS_CODE);
    }
  }

  const totalScore =
    scoreItem(top, ctx) +
    scoreItem(usedDress ? bottom : bottom, ctx) +
    scoreItem(shoes, ctx) +
    (outerwear ? scoreItem(outerwear, ctx) : 0);

  if (
    factors.repeatAvoidance &&
    ctx.recentItemIds.length > 0 &&
    [top, bottom, shoes, outerwear]
      .filter((item): item is GarmentForRec => Boolean(item))
      .every((item) => !ctx.recentItemIds.includes(item.id))
  ) {
    codes.push('RECENT_REPEAT_AVOIDED');
  }

  return { ok: true, outfit, reasonCodes: codes, totalScore };
}

/** 显示用：从 reasonCodes 选最重要的 2-3 条。 */
export function topReasons(codes: readonly string[], max = 3): string[] {
  const priority = [
    'COLOR_CLASH_NO_ALT',
    'COLOR_HARMONIOUS',
    'WEATHER_OUTER',
    'WEATHER_FIT',
    'MODE_SAFE',
    'MODE_FRESH',
    'MODE_HERO',
    'MODE_HURRY',
    'RECENT_REPEAT_AVOIDED',
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
  MODE_SAFE: '稳妥模式，优先熟悉单品',
  MODE_FRESH: '新鲜模式，优先不同组合',
  MODE_HERO: '主角单品已锁定',
  MODE_HURRY: '赶时间模式，减少决策步骤',
  REPEAT_SUPPRESSION: '已避开刚刚跳过的组合',
  RECENT_REPEAT_AVOIDED: '已避开近期重复穿着',
  HERO_LOCKED: '已保留主角单品',
  SLOT_REPLACED: '仅替换了所选单品',
  COLOR_HARMONIOUS: '上下装配色协调',
  WEATHER_FIT: '季节和今天的气温相符',
  WEATHER_OUTER: '今天偏凉，加了外套',
  COLOR_CLASH_NO_ALT: '配色略有冲突，暂无更优替代',
};
