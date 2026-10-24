/**
 * 配色规则（MVP-005 推荐增强）。
 *
 * 设计原则：
 * - 纯函数 + 确定性：同输入同输出（可复现验收）。
 * - 中性色百搭：black/white/gray/navy/beige 等与任何色不冲突。
 * - 同色系（monochrome）不冲突（intentional）。
 * - 仅标记最明显的互补色冲突（圣诞红绿、万圣橙紫等），不做主观审美判断。
 * - 未知颜色归 'other'，不产生冲突（保守，不阻断推荐）。
 *
 * 颜色归一化：把用户输入的中文/英文颜色名映射到固定色系。
 * tag 值是自由文本（add-garment 的 Field），需兼容「黑色」「black」「深蓝」等。
 */

/** 色系枚举。 */
export type ColorFamily =
  | 'neutral'
  | 'red'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'purple'
  | 'pink'
  | 'brown'
  | 'multi'
  | 'other';

/** 中文/英文颜色名 → 色系映射（小写匹配，覆盖常见说法）。 */
const COLOR_MAP: readonly (readonly [RegExp, ColorFamily])[] = [
  // 中性色（百搭）
  [/^(black|黑|纯黑|炭黑|墨色)/i, 'neutral'],
  [/^(white|白|纯白|米白|象牙|cream|ivory)/i, 'neutral'],
  [/^(gray|grey|灰|浅灰|深灰|charcoal)/i, 'neutral'],
  [/^(beige|米色|卡其灰|杏色)/i, 'neutral'],
  [/^(navy|藏青|深蓝|海军蓝)/i, 'neutral'],
  // 暖色
  [/^(red|红|大红|正红|酒红|wine|burgundy|maroon|暗红|绯红|crimson)/i, 'red'],
  [/^(orange|橙|橘|珊瑚|coral|terracotta|rust|锈色|砖红)/i, 'orange'],
  [/^(yellow|黄|金黄|mustard|芥末|鹅黄)/i, 'yellow'],
  [/^(pink|粉|玫瑰|rose|blush|裸粉|樱花粉)/i, 'pink'],
  // 冷色
  [/^(green|绿|墨绿|olive|橄榄|sage|鼠尾草|薄荷|mint|翠绿|森林绿)/i, 'green'],
  [/^(blue|蓝|天蓝|sky|teal|青|turquoise|湖蓝|宝蓝|浅蓝)/i, 'blue'],
  [/^(purple|紫|lavender|薰衣草|plum|李子紫|lilac|丁香紫)/i, 'purple'],
  // 大地色
  [/^(brown|棕|咖啡|tan|焦糖|caramel|chocolate|巧克力|驼色|camel)/i, 'brown'],
  // 多色/花色
  [/^(multi|花色|彩色|印花|pattern|print|撞色|格纹|条纹)/i, 'multi'],
];

/**
 * 明显冲突的色系对（互补色冲突，仅最明显的几对）。
 * 不在列表中的跨色系组合视为可接受（不阻断推荐）。
 */
const CLASHING_PAIRS: readonly (readonly [ColorFamily, ColorFamily])[] = [
  ['red', 'green'], // 圣诞红绿
  ['orange', 'purple'], // 万圣橙紫
  ['yellow', 'purple'], // 互补色冲突
  ['blue', 'orange'], // 互补色冲突
  ['red', 'pink'], // 红粉撞色
];

/** 把用户输入的颜色文本归一化为色系。空值/未知归 'other'（不产生冲突）。 */
export function normalizeColor(raw: string | null | undefined): ColorFamily {
  if (!raw || !raw.trim()) return 'other';
  const s = raw.trim();
  for (const [re, fam] of COLOR_MAP) {
    if (re.test(s)) return fam;
  }
  return 'other';
}

/** 是否有可用于“协调/冲突”判断的已知色系；未知自由文本不能被标成协调。 */
export function hasKnownColor(raw: string | null | undefined): boolean {
  return normalizeColor(raw) !== 'other';
}

/**
 * 判断两个颜色是否冲突。
 * - 任一为 other → 不冲突（未知保守放行）
 * - 任一为 neutral → 不冲突（百搭）
 * - 同色系 → 不冲突（monochrome intentional）
 * - 在 CLASHING_PAIRS 中 → 冲突
 * - 其他跨色系 → 不冲突（可接受）
 */
export function colorsClash(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const ca = normalizeColor(a);
  const cb = normalizeColor(b);
  if (ca === 'other' || cb === 'other') return false;
  if (ca === 'neutral' || cb === 'neutral') return false;
  if (ca === cb) return false;
  return CLASHING_PAIRS.some(
    ([x, y]) => (x === ca && y === cb) || (x === cb && y === ca),
  );
}

/** 配色协调的原因码（仅当有颜色数据且不冲突时命中）。 */
export const COLOR_HARMONIOUS_CODE = 'COLOR_HARMONIOUS';
/** 配色冲突但无替代（仍推荐但标注）的原因码。 */
export const COLOR_CLASH_NO_ALT_CODE = 'COLOR_CLASH_NO_ALT';
