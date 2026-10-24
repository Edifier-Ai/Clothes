import type { GarmentCategory } from '../db/schema';
import type {
  ShoppingImageFeaturesV1,
  ShoppingSimilarityDimension,
  ShoppingSimilarityResult,
  ShoppingWardrobeItem,
} from './types';

const WEIGHTS = {
  category: 0.1,
  hash: 0.35,
  lab: 0.35,
  contour: 0.2,
} as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function rounded(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function dimension(
  score: number,
  weight: number,
  explanation: string,
): ShoppingSimilarityDimension {
  const normalized = rounded(clamp01(score));
  return { score: normalized, weight, contribution: rounded(normalized * weight), explanation };
}

export function perceptualHashSimilarity(left: string, right: string): number {
  if (left.length !== 64 || right.length !== 64 || /[^01]/.test(left) || /[^01]/.test(right)) return 0;
  let distance = 0;
  for (let i = 0; i < 64; i++) if (left[i] !== right[i]) distance++;
  return rounded(1 - distance / 64);
}

/** 归一化直方图交集；完全一致=1，没有交集=0。 */
export function labHistogramSimilarity(left: readonly number[], right: readonly number[]): number {
  if (left.length !== 27 || right.length !== 27) return 0;
  let intersection = 0;
  for (let i = 0; i < 27; i++) intersection += Math.min(left[i] ?? 0, right[i] ?? 0);
  return rounded(clamp01(intersection));
}

function relativeRatioScore(left: number, right: number): number {
  if (left <= 0 || right <= 0) return 0;
  return clamp01(1 - Math.abs(Math.log(left / right)) / Math.log(4));
}

export function contourSimilarity(left: ShoppingImageFeaturesV1, right: ShoppingImageFeaturesV1): number {
  const a = left.contour;
  const b = right.contour;
  const scores = [
    relativeRatioScore(a.aspectRatio, b.aspectRatio),
    1 - Math.abs(a.coverage - b.coverage),
    1 - Math.abs(a.centroidX - b.centroidX),
    1 - Math.abs(a.centroidY - b.centroidY),
    1 - Math.abs(a.edgeDensity - b.edgeDensity),
  ];
  return rounded(scores.reduce((sum, value) => sum + clamp01(value), 0) / scores.length);
}

export interface ScoredWardrobeImage {
  item: ShoppingWardrobeItem;
  features: ShoppingImageFeaturesV1;
}

/**
 * 同大类是硬门禁：类别不符直接 null，颜色/哈希再像也不会进入结果。
 * 返回四维的权重、分数、贡献和解释，UI 不需要反推黑箱分数。
 */
export function compareShoppingImage(
  candidateCategory: GarmentCategory,
  candidate: ShoppingImageFeaturesV1,
  wardrobe: ScoredWardrobeImage,
): ShoppingSimilarityResult | null {
  if (candidateCategory !== wardrobe.item.category) return null;
  const hashScore = perceptualHashSimilarity(candidate.dHash64, wardrobe.features.dHash64);
  const labScore = labHistogramSimilarity(candidate.labHistogram27, wardrobe.features.labHistogram27);
  const contourScore = contourSimilarity(candidate, wardrobe.features);
  const dimensions = {
    category: dimension(1, WEIGHTS.category, `同为${candidateCategory}，通过类别硬门禁`),
    hash: dimension(hashScore, WEIGHTS.hash, '感知哈希比较整体明暗结构'),
    lab: dimension(labScore, WEIGHTS.lab, 'Lab 分布比较主体色彩'),
    contour: dimension(contourScore, WEIGHTS.contour, '轮廓比较占比、重心、长宽比与边界'),
  };
  const totalScore = rounded(
    dimensions.category.contribution +
      dimensions.hash.contribution +
      dimensions.lab.contribution +
      dimensions.contour.contribution,
  );
  return {
    garmentId: wardrobe.item.id,
    name: wardrobe.item.name,
    category: wardrobe.item.category,
    imageRelPath: wardrobe.item.imageRelPath!,
    totalScore,
    hashScore,
    labScore,
    contourScore,
    dimensions,
    garmentFeatures: wardrobe.features,
  };
}

export function sortShoppingSimilarities(
  results: readonly ShoppingSimilarityResult[],
): ShoppingSimilarityResult[] {
  return [...results].sort(
    (left, right) => right.totalScore - left.totalScore || left.garmentId.localeCompare(right.garmentId),
  );
}
