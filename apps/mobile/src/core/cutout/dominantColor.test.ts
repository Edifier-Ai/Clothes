import { describe, expect, it } from '@jest/globals';

import { normalizeColor } from '../recommend/colorRules';
import { classifyColor, dominantColor, type DominantColorName } from './dominantColor';

function solid(w: number, h: number, rgb: [number, number, number]): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    out[i * 4] = rgb[0];
    out[i * 4 + 1] = rgb[1];
    out[i * 4 + 2] = rgb[2];
    out[i * 4 + 3] = 255;
  }
  return out;
}

describe('classifyColor', () => {
  const cases: [string, [number, number, number], DominantColorName][] = [
    ['黑', [20, 20, 22], '黑色'],
    ['白', [245, 244, 240], '白色'],
    ['灰', [128, 128, 130], '灰色'],
    ['藏青', [20, 35, 80], '藏青'],
    ['天蓝', [70, 130, 220], '蓝色'],
    ['正红', [200, 30, 40], '红色'],
    ['淡粉', [245, 190, 200], '粉色'],
    ['橙', [240, 140, 30], '橙色'],
    ['黄', [240, 215, 40], '黄色'],
    ['墨绿', [30, 110, 70], '绿色'],
    ['紫', [120, 60, 170], '紫色'],
    ['棕', [110, 70, 40], '棕色'],
    ['米', [225, 210, 180], '米色'],
  ];
  it.each(cases)('%s → 颜色名', (_label, rgb, expected) => {
    expect(classifyColor(...rgb)).toBe(expected);
  });

  it('输出的颜色名都能被配色规则识别（不会落到 other）', () => {
    for (const [, rgb] of cases) {
      expect(normalizeColor(classifyColor(...rgb))).not.toBe('other');
    }
  });
});

describe('dominantColor', () => {
  it('只统计前景：背景再大也不影响主色', () => {
    const w = 40;
    const h = 40;
    const rgba = solid(w, h, [250, 250, 250]); // 白背景
    const alpha = new Uint8Array(w * h);
    for (let y = 10; y < 30; y++) {
      for (let x = 10; x < 30; x++) {
        const i = y * w + x;
        alpha[i] = 255;
        rgba[i * 4] = 20;
        rgba[i * 4 + 1] = 35;
        rgba[i * 4 + 2] = 80;
      }
    }
    expect(dominantColor(rgba, alpha, w, h)).toBe('藏青');
  });

  it('前景几乎为空 → null，不乱猜', () => {
    const rgba = solid(50, 50, [200, 30, 40]);
    expect(dominantColor(rgba, new Uint8Array(2500), 50, 50)).toBeNull();
  });

  it('多种颜色取像素最多的', () => {
    const w = 30;
    const h = 10;
    const rgba = solid(w, h, [200, 30, 40]);
    for (let i = 0; i < 100; i++) {
      rgba[i * 4] = 30;
      rgba[i * 4 + 1] = 110;
      rgba[i * 4 + 2] = 70;
    }
    expect(dominantColor(rgba, new Uint8Array(w * h).fill(255), w, h)).toBe('红色');
  });
});
