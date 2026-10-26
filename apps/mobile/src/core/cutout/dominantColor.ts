/**
 * 从抠图结果取衣物主色，输出配色规则（recommend/colorRules）认得的中文颜色名。
 * 只统计前景像素（alpha 过半），按色相/明度/饱和度分桶后取像素最多的桶。
 * 纯函数、确定性，便于单测。
 */

export type DominantColorName =
  | '黑色'
  | '白色'
  | '灰色'
  | '米色'
  | '藏青'
  | '红色'
  | '橙色'
  | '黄色'
  | '绿色'
  | '蓝色'
  | '紫色'
  | '粉色'
  | '棕色';

function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number; chroma: number } {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l, chroma: 0 };
  const s = d / (1 - Math.abs(2 * l - 1));
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return { h, s, l, chroma: d };
}

/** 单个像素 → 颜色名。 */
export function classifyColor(r: number, g: number, b: number): DominantColorName {
  const { h, s, l, chroma } = rgbToHsl(r, g, b);
  if (l < 0.16) return '黑色';
  // 用色度（max-min）判断无彩色：HSL 饱和度在很亮/很暗时会被放大，白衣服会被误判成有色。
  if (chroma < 0.1) {
    if (l > 0.82) return '白色';
    return '灰色';
  }
  // 浅而不艳的暖色 = 米色
  if (h >= 25 && h < 65 && s < 0.45 && l > 0.62) return '米色';
  if (h < 15 || h >= 345) return l > 0.7 ? '粉色' : '红色';
  if (h < 45) return l < 0.42 ? '棕色' : '橙色';
  if (h < 70) return l < 0.35 ? '棕色' : '黄色';
  if (h < 165) return '绿色';
  if (h < 255) return l < 0.3 ? '藏青' : '蓝色';
  if (h < 300) return '紫色';
  return '粉色';
}

/**
 * 前景主色。rgba 为 w×h 非预乘 RGBA，alpha 为同尺寸单通道蒙版。
 * 前景像素太少（<1%）时返回 null（抠图可能失败，不乱猜）。
 */
export function dominantColor(
  rgba: Uint8Array,
  alpha: Uint8Array,
  w: number,
  h: number,
  maxSamples = 20000,
): DominantColorName | null {
  const n = w * h;
  if (rgba.length < n * 4 || alpha.length < n) return null;
  const step = Math.max(1, Math.floor(n / maxSamples));
  const counts = new Map<DominantColorName, number>();
  let fg = 0;
  let sampled = 0;
  for (let i = 0; i < n; i += step) {
    sampled++;
    if (alpha[i] < 128) continue;
    fg++;
    const p = i * 4;
    const name = classifyColor(rgba[p], rgba[p + 1], rgba[p + 2]);
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  if (fg === 0 || fg < sampled * 0.01) return null;
  let best: DominantColorName | null = null;
  let bestCount = 0;
  for (const [name, c] of counts) {
    if (c > bestCount) {
      best = name;
      bestCount = c;
    }
  }
  return best;
}
