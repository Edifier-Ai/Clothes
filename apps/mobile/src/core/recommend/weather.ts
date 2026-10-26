/**
 * 气温档位与季节匹配（今日推荐的「天气」要素）。
 *
 * 不联网：气温由用户在今日页点选（默认按月份估计），衣物的「季节」标签是自由文本，
 * 这里把常见写法（夏、春秋、四季、winter…）解析成季节集合再与气温档位比对。
 * 纯函数、确定性。
 */

export type TempBand = 'cold' | 'cool' | 'warm' | 'hot';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

export const TEMP_BANDS: readonly TempBand[] = ['cold', 'cool', 'warm', 'hot'];

export const TEMP_LABEL: Readonly<Record<TempBand, string>> = {
  cold: '冷 <10°',
  cool: '凉 10–18°',
  warm: '暖 18–26°',
  hot: '热 >26°',
};

/** 每个气温档位下，哪些季节的衣物算合适。 */
const BAND_SEASONS: Readonly<Record<TempBand, readonly Season[]>> = {
  cold: ['autumn', 'winter'],
  cool: ['spring', 'autumn'],
  warm: ['spring', 'summer', 'autumn'],
  hot: ['summer'],
};

const ALL_SEASONS: readonly Season[] = ['spring', 'summer', 'autumn', 'winter'];

const SEASON_WORDS: readonly (readonly [RegExp, readonly Season[]])[] = [
  [/四季|全年|全季|通年|all[\s-]?season|year[\s-]?round/i, ALL_SEASONS],
  [/春|spring/i, ['spring']],
  [/夏|summer/i, ['summer']],
  [/秋|autumn|fall/i, ['autumn']],
  [/冬|winter/i, ['winter']],
];

/** 解析自由文本季节标签；空/认不出 → null（按「未知」处理，不影响推荐）。 */
export function parseSeasons(raw: string | null | undefined): ReadonlySet<Season> | null {
  const text = raw?.trim();
  if (!text) return null;
  const found = new Set<Season>();
  for (const [re, seasons] of SEASON_WORDS) {
    if (re.test(text)) for (const s of seasons) found.add(s);
  }
  return found.size > 0 ? found : null;
}

export type SeasonFit = 'fit' | 'mismatch' | 'unknown';

export function seasonFit(raw: string | null | undefined, band: TempBand): SeasonFit {
  const seasons = parseSeasons(raw);
  if (!seasons) return 'unknown';
  return BAND_SEASONS[band].some((s) => seasons.has(s)) ? 'fit' : 'mismatch';
}

/** 外套需求：冷/凉 → 需要；热 → 不穿；暖 → 交给场景规则。 */
export type OuterNeed = 'needed' | 'none' | 'by-occasion';

export function outerNeed(band: TempBand): OuterNeed {
  if (band === 'cold' || band === 'cool') return 'needed';
  if (band === 'hot') return 'none';
  return 'by-occasion';
}

/** 按月份估计气温档位（北半球常见情形）；用户可在今日页改。 */
export function defaultBandForMonth(date: Date): TempBand {
  const m = date.getMonth() + 1;
  if (m === 12 || m <= 2) return 'cold';
  if (m === 3 || m === 4 || m === 10 || m === 11) return 'cool';
  if (m === 5 || m === 9) return 'warm';
  return 'hot';
}
