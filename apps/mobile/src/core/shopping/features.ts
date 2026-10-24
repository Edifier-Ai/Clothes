import { SHOPPING_ALGORITHM_VERSION, type ShoppingImageFeaturesV1, type ShoppingPixelData } from './types';

const MAX_SAMPLE = 64;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function pixelOffset(width: number, x: number, y: number): number {
  return (y * width + x) * 4;
}

function samplePixel(data: ShoppingPixelData, x: number, y: number, targetW: number, targetH: number) {
  const sourceX = Math.min(data.width - 1, Math.floor(((x + 0.5) * data.width) / targetW));
  const sourceY = Math.min(data.height - 1, Math.floor(((y + 0.5) * data.height) / targetH));
  const offset = pixelOffset(data.width, sourceX, sourceY);
  return {
    r: data.rgba[offset] ?? 0,
    g: data.rgba[offset + 1] ?? 0,
    b: data.rgba[offset + 2] ?? 0,
    a: data.rgba[offset + 3] ?? 255,
  };
}

function validatePixels(data: ShoppingPixelData): void {
  if (!Number.isInteger(data.width) || !Number.isInteger(data.height) || data.width <= 0 || data.height <= 0) {
    throw new Error('invalid image dimensions');
  }
  if (data.rgba.length !== data.width * data.height * 4) {
    throw new Error('invalid RGBA buffer length');
  }
}

function luminance(r: number, g: number, b: number, a: number): number {
  const alpha = a / 255;
  const rr = r * alpha + 255 * (1 - alpha);
  const gg = g * alpha + 255 * (1 - alpha);
  const bb = b * alpha + 255 * (1 - alpha);
  return 0.299 * rr + 0.587 * gg + 0.114 * bb;
}

/** 标准 9×8 横向差分，输出固定 64 位字符串，避开 JSON/JS BigInt 兼容问题。 */
function dHash64(data: ShoppingPixelData): string {
  let bits = '';
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const left = samplePixel(data, x, y, 9, 8);
      const right = samplePixel(data, x + 1, y, 9, 8);
      bits += luminance(left.r, left.g, left.b, left.a) > luminance(right.r, right.g, right.b, right.a)
        ? '1'
        : '0';
    }
  }
  return bits;
}

function srgbLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** sRGB D65 → CIE Lab。只用于确定性分箱，不保存逐像素值。 */
function rgbToLab(r: number, g: number, b: number): { l: number; a: number; b: number } {
  const rl = srgbLinear(r);
  const gl = srgbLinear(g);
  const bl = srgbLinear(b);
  const x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / 0.95047;
  const y = (0.2126729 * rl + 0.7151522 * gl + 0.072175 * bl) / 1;
  const z = (0.0193339 * rl + 0.119192 * gl + 0.9503041 * bl) / 1.08883;
  const f = (v: number) => (v > 216 / 24_389 ? Math.cbrt(v) : (841 / 108) * v + 4 / 29);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

function softBins3(value: number, min: number, max: number): { index: number; weight: number }[] {
  // 三个分箱中心位于归一化坐标 0/1/2；相邻中心线性插值，跨界连续。
  const position = clamp01((value - min) / (max - min)) * 2;
  const lower = Math.floor(position);
  const upper = Math.min(2, lower + 1);
  if (lower === upper) return [{ index: lower, weight: 1 }];
  const upperWeight = position - lower;
  return [
    { index: lower, weight: 1 - upperWeight },
    { index: upper, weight: upperWeight },
  ].filter((entry) => entry.weight > 0);
}

interface SampledPixel {
  r: number;
  g: number;
  b: number;
  a: number;
}

function foregroundMask(pixels: readonly SampledPixel[], width: number, height: number): boolean[] {
  const hasTransparency = pixels.some((pixel) => pixel.a < 250);
  if (hasTransparency) return pixels.map((pixel) => pixel.a >= 32);

  const corners = [pixels[0], pixels[width - 1], pixels[(height - 1) * width], pixels[height * width - 1]]
    .filter((pixel): pixel is SampledPixel => pixel != null);
  const background = corners.reduce(
    (sum, pixel) => ({ r: sum.r + pixel.r, g: sum.g + pixel.g, b: sum.b + pixel.b }),
    { r: 0, g: 0, b: 0 },
  );
  background.r /= corners.length || 1;
  background.g /= corners.length || 1;
  background.b /= corners.length || 1;
  const thresholdSquared = 32 * 32;
  const mask = pixels.map((pixel) => {
    const dr = pixel.r - background.r;
    const dg = pixel.g - background.g;
    const db = pixel.b - background.b;
    return dr * dr + dg * dg + db * db >= thresholdSquared;
  });
  // 纯色/紧裁图片无法可靠估计背景；保守视为整幅前景，避免伪造空轮廓。
  return mask.some(Boolean) ? mask : mask.map(() => true);
}

/**
 * 从原始像素提取固定版本特征。所有统计最多采样 64×64，结果四舍五入后入库，
 * 因而同一 RGBA 输入跨运行得到相同 JSON。
 */
export function extractShoppingImageFeatures(data: ShoppingPixelData): ShoppingImageFeaturesV1 {
  validatePixels(data);
  const width = Math.min(MAX_SAMPLE, data.width);
  const height = Math.min(MAX_SAMPLE, data.height);
  const pixels: SampledPixel[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) pixels.push(samplePixel(data, x, y, width, height));
  }
  const foreground = foregroundMask(pixels, width, height);
  const histogram = new Array<number>(27).fill(0);
  let count = 0;
  let sumX = 0;
  let sumY = 0;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;
  let boundaryEdges = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (!foreground[index]) continue;
      const pixel = pixels[index]!;
      const lab = rgbToLab(pixel.r, pixel.g, pixel.b);
      const lBins = softBins3(lab.l, 0, 100);
      const aBins = softBins3(lab.a, -128, 128);
      const bBins = softBins3(lab.b, -128, 128);
      for (const lBin of lBins) {
        for (const aBin of aBins) {
          for (const bBin of bBins) {
            histogram[lBin.index * 9 + aBin.index * 3 + bBin.index] +=
              lBin.weight * aBin.weight * bBin.weight;
          }
        }
      }
      count++;
      sumX += x + 0.5;
      sumY += y + 0.5;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      if (x === 0 || !foreground[index - 1]) boundaryEdges++;
      if (x === width - 1 || !foreground[index + 1]) boundaryEdges++;
      if (y === 0 || !foreground[index - width]) boundaryEdges++;
      if (y === height - 1 || !foreground[index + width]) boundaryEdges++;
    }
  }

  if (count === 0) throw new Error('image contains no visible pixels');
  const normalizedHistogram = histogram.map((value) => rounded(value / count));
  // 独立 round 会有微小和差，不影响 histogram-intersection；最后一格校正到严格和=1。
  const histogramSum = normalizedHistogram.reduce((sum, value) => sum + value, 0);
  normalizedHistogram[normalizedHistogram.length - 1] = rounded(
    (normalizedHistogram[normalizedHistogram.length - 1] ?? 0) + (1 - histogramSum),
  );
  const bboxWidth = maxX - minX + 1;
  const bboxHeight = maxY - minY + 1;
  const physicalAspect = (bboxWidth / width * data.width) / (bboxHeight / height * data.height);

  return {
    version: SHOPPING_ALGORITHM_VERSION,
    width: data.width,
    height: data.height,
    dHash64: dHash64(data),
    labHistogram27: normalizedHistogram,
    contour: {
      aspectRatio: rounded(Math.min(10, physicalAspect)),
      coverage: rounded(count / (width * height)),
      centroidX: rounded(sumX / count / width),
      centroidY: rounded(sumY / count / height),
      edgeDensity: rounded(boundaryEdges / (4 * count)),
    },
  };
}
