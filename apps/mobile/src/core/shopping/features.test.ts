/** @jest-environment node */
import { describe, expect, it } from '@jest/globals';

import { extractShoppingImageFeatures } from './features';
import {
  compareShoppingImage,
  labHistogramSimilarity,
  perceptualHashSimilarity,
  sortShoppingSimilarities,
} from './similarity';
import type { ShoppingPixelData, ShoppingWardrobeItem } from './types';

function image(width: number, height: number, color: [number, number, number, number]): ShoppingPixelData {
  const rgba = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index++) rgba.set(color, index * 4);
  return { width, height, rgba };
}

function wardrobe(id: string, category: ShoppingWardrobeItem['category']): ShoppingWardrobeItem {
  return {
    id,
    name: `衣物${id}`,
    category,
    status: 'clean',
    archivedAt: null,
    createdAt: 1,
    updatedAt: 1,
    lastWornAt: null,
    timesWorn: 0,
    color: 'blue',
    imageRelPath: `originals/${id}.png`,
  };
}

describe('shopping image features v1', () => {
  it('相同输入生成固定 64-bit dHash、27-bin Lab 与相同相似度', () => {
    const pixels = image(12, 10, [20, 80, 210, 255]);
    const first = extractShoppingImageFeatures(pixels);
    const second = extractShoppingImageFeatures(pixels);
    expect(first).toEqual(second);
    expect(first.dHash64).toMatch(/^[01]{64}$/);
    expect(first.labHistogram27).toHaveLength(27);
    expect(first.labHistogram27.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 5);
    expect(perceptualHashSimilarity(first.dHash64, second.dHash64)).toBe(1);
    expect(labHistogramSimilarity(first.labHistogram27, second.labHistogram27)).toBe(1);

    const result = compareShoppingImage('top', first, { item: wardrobe('g1', 'top'), features: second });
    expect(result?.totalScore).toBe(1);
    expect(result?.dimensions.category.contribution).toBe(0.1);
    expect(result?.dimensions.hash.contribution).toBe(0.35);
    expect(result?.dimensions.lab.contribution).toBe(0.35);
    expect(result?.dimensions.contour.contribution).toBe(0.2);
  });

  it('同色异类被类别硬门禁直接排除', () => {
    const feature = extractShoppingImageFeatures(image(10, 10, [12, 60, 220, 255]));
    expect(compareShoppingImage('top', feature, { item: wardrobe('blue-shoe', 'shoes'), features: feature })).toBeNull();
  });

  it('Lab 软分箱让轻微色偏/压缩式扰动保持连续高相似', () => {
    // 灰度 78→82 会跨过旧 3-bin 的 L 硬边界；软分箱不再从 1 断崖掉到 0。
    const nearBoundaryA = extractShoppingImageFeatures(image(16, 16, [78, 78, 78, 255]));
    const nearBoundaryB = extractShoppingImageFeatures(image(16, 16, [82, 82, 82, 255]));
    expect(labHistogramSimilarity(nearBoundaryA.labHistogram27, nearBoundaryB.labHistogram27)).toBeGreaterThan(0.85);
    const boundaryResult = compareShoppingImage('top', nearBoundaryA, {
      item: wardrobe('near', 'top'),
      features: nearBoundaryB,
    });
    expect(boundaryResult?.totalScore).toBeGreaterThan(0.94);

    const original = image(18, 18, [32, 94, 201, 255]);
    const compressed = image(18, 18, [35, 91, 198, 255]);
    const originalFeature = extractShoppingImageFeatures(original);
    const compressedFeature = extractShoppingImageFeatures(compressed);
    expect(compareShoppingImage('top', originalFeature, {
      item: wardrobe('compressed', 'top'),
      features: compressedFeature,
    })?.totalScore).toBeGreaterThan(0.95);
  });

  it('同分按 garmentId 稳定排序', () => {
    const feature = extractShoppingImageFeatures(image(10, 10, [230, 230, 230, 255]));
    const b = compareShoppingImage('top', feature, { item: wardrobe('b', 'top'), features: feature })!;
    const a = compareShoppingImage('top', feature, { item: wardrobe('a', 'top'), features: feature })!;
    const c = compareShoppingImage('top', feature, { item: wardrobe('c', 'top'), features: feature })!;
    expect(sortShoppingSimilarities([b, c, a]).map((result) => result.garmentId)).toEqual(['a', 'b', 'c']);
  });
});
