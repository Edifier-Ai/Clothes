import { describe, expect, it } from '@jest/globals';

import { autoGarmentName, GARMENT_CATEGORY_LABEL, isPlaceholderName } from './categories';

describe('衣物类别与自动命名', () => {
  it('占位名识别：只覆盖系统生成的名字，不覆盖用户起的名', () => {
    expect(isPlaceholderName('衣物 3')).toBe(true);
    expect(isPlaceholderName('衣物')).toBe(true);
    expect(isPlaceholderName('未命名衣物')).toBe(true);
    expect(isPlaceholderName('  ')).toBe(true);
    expect(isPlaceholderName('优衣库白T')).toBe(false);
    expect(isPlaceholderName('衣物收纳袋')).toBe(false);
  });

  it('自动命名带上主色', () => {
    expect(autoGarmentName('bottom')).toBe('下装');
    expect(autoGarmentName('top', '藏青')).toBe('藏青上装');
    expect(GARMENT_CATEGORY_LABEL.shoes).toBe('鞋');
  });
});
