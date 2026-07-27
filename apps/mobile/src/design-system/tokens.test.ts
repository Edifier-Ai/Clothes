import { describe, expect, it } from '@jest/globals';

import {
  PRIMARY_NAV,
  hitTarget,
  palette,
  radius,
  spacing,
  typography,
} from './tokens';

const HEX = /^#[0-9A-F]{6}$/i;

describe('design-system tokens（方向 3 静奢编辑部）', () => {
  it('核心色板齐全且为 6 位 hex', () => {
    const required = [
      'paperWhite',
      'sand',
      'charcoal',
      'oxblood',
      'mutedGold',
      'hairline',
    ] as const;
    for (const key of required) {
      expect(palette[key]).toMatch(HEX);
    }
  });

  it('纸白背景与炭黑文字不是同一种颜色', () => {
    expect(palette.paperWhite.toLowerCase()).not.toBe(
      palette.charcoal.toLowerCase(),
    );
  });

  it('间距刻度严格递增', () => {
    const values = Object.values(spacing);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('正文字号落在 14–16px 产品基线内', () => {
    expect(typography.body.fontSize).toBeGreaterThanOrEqual(14);
    expect(typography.body.fontSize).toBeLessThanOrEqual(16);
    expect(typography.bodySm.fontSize).toBeGreaterThanOrEqual(14);
  });

  it('点击目标下限不低于 44，优先值达到 48', () => {
    expect(hitTarget.min).toBeGreaterThanOrEqual(44);
    expect(hitTarget.preferred).toBeGreaterThanOrEqual(48);
  });

  it('圆角刻度非负且 pill 可用于胶囊按钮', () => {
    for (const value of Object.values(radius)) {
      expect(value).toBeGreaterThanOrEqual(0);
    }
    expect(radius.pill).toBeGreaterThan(radius.xl);
  });

  it('主导航固定为 今天/衣橱/造型/计划 且顺序不变', () => {
    expect(PRIMARY_NAV).toEqual(['今天', '衣橱', '造型', '计划']);
  });
});
