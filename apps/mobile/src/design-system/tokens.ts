/**
 * 设计 Tokens —— 视觉方向 3「静奢编辑部」。
 *
 * 基准来源：design/directions/direction-3-quiet-luxury.png 与
 * design/CORE_PROMPT_SET.md：纸白背景、沙色表面、炭黑文字、酒红主色、
 * 哑金细节、细发丝线、克制留白。正文基线 14–16px，点击目标 ≥44×44。
 *
 * 本文件为纯数据，供 UI 与测试共同引用；后续卡片不得在组件内写死色值。
 */

export const palette = {
  /** 纸白：全局背景 */
  paperWhite: '#FAF8F4',
  /** 沙色：卡片与表面 */
  sand: '#EFE7DA',
  /** 浅沙：次级表面、输入底色 */
  sandSoft: '#F5F0E8',
  /** 炭黑：主文字 */
  charcoal: '#26241F',
  /** 次级文字 */
  charcoalSoft: '#6B675E',
  /** 酒红：主操作与选中态 */
  oxblood: '#7A2E3A',
  /** 酒红按压态 */
  oxbloodDeep: '#5F212C',
  /** 哑金：细节、编号、装饰线 */
  mutedGold: '#B39A63',
  /** 发丝线：分隔与卡片描边 */
  hairline: '#E5DECF',
  white: '#FFFFFF',
  /** 失败/破坏性 */
  danger: '#A4342F',
  /** 成功/干净状态 */
  success: '#4F6F52',
} as const;

export type PaletteKey = keyof typeof palette;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

/** 字号以 390×844 画布为基准；正文落在 14–16px 区间。 */
export const typography = {
  /** 编辑感数字/大标题（衬线） */
  display: { fontSize: 32, lineHeight: 40, fontFamily: 'serif' },
  /** 页面标题（衬线） */
  title: { fontSize: 22, lineHeight: 30, fontFamily: 'serif' },
  headline: { fontSize: 18, lineHeight: 26 },
  body: { fontSize: 16, lineHeight: 24 },
  bodySm: { fontSize: 14, lineHeight: 20 },
  caption: { fontSize: 12, lineHeight: 16 },
} as const;

export type TypographyKey = keyof typeof typography;

/**
 * 可见点击目标下限 44×44，实际命中区域优先 48×48
 * （AGENTS.md「实现原则」）。
 */
export const hitTarget = {
  min: 44,
  preferred: 48,
} as const;

/** 底部主导航四项，顺序与文案固定：今天 / 衣橱 / 造型 / 计划。 */
export const PRIMARY_NAV = ['今天', '衣橱', '造型', '计划'] as const;
