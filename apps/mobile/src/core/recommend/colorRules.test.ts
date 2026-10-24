/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { colorsClash, hasKnownColor, normalizeColor } from './colorRules';

describe('normalizeColor', () => {
  it('中文颜色名归一化', () => {
    expect(normalizeColor('黑色')).toBe('neutral');
    expect(normalizeColor('白色')).toBe('neutral');
    expect(normalizeColor('灰色')).toBe('neutral');
    expect(normalizeColor('藏青')).toBe('neutral');
    expect(normalizeColor('红色')).toBe('red');
    expect(normalizeColor('酒红')).toBe('red');
    expect(normalizeColor('橙色')).toBe('orange');
    expect(normalizeColor('黄色')).toBe('yellow');
    expect(normalizeColor('绿色')).toBe('green');
    expect(normalizeColor('蓝色')).toBe('blue');
    expect(normalizeColor('紫色')).toBe('purple');
    expect(normalizeColor('粉色')).toBe('pink');
    expect(normalizeColor('棕色')).toBe('brown');
    expect(normalizeColor('花色')).toBe('multi');
  });

  it('英文颜色名归一化', () => {
    expect(normalizeColor('black')).toBe('neutral');
    expect(normalizeColor('white')).toBe('neutral');
    expect(normalizeColor('navy')).toBe('neutral');
    expect(normalizeColor('red')).toBe('red');
    expect(normalizeColor('burgundy')).toBe('red');
    expect(normalizeColor('orange')).toBe('orange');
    expect(normalizeColor('yellow')).toBe('yellow');
    expect(normalizeColor('green')).toBe('green');
    expect(normalizeColor('blue')).toBe('blue');
    expect(normalizeColor('purple')).toBe('purple');
    expect(normalizeColor('pink')).toBe('pink');
    expect(normalizeColor('brown')).toBe('brown');
    expect(normalizeColor('multi')).toBe('multi');
  });

  it('空值/未知归 other', () => {
    expect(normalizeColor(null)).toBe('other');
    expect(normalizeColor(undefined)).toBe('other');
    expect(normalizeColor('')).toBe('other');
    expect(normalizeColor('  ')).toBe('other');
    expect(normalizeColor('透明色')).toBe('other');
    expect(hasKnownColor('透明色')).toBe(false);
    expect(hasKnownColor(null)).toBe(false);
    expect(hasKnownColor('蓝色')).toBe(true);
  });
});

describe('colorsClash', () => {
  it('中性色百搭：不与任何色冲突', () => {
    expect(colorsClash('black', 'red')).toBe(false);
    expect(colorsClash('white', 'green')).toBe(false);
    expect(colorsClash('navy', 'orange')).toBe(false);
    expect(colorsClash('gray', 'purple')).toBe(false);
  });

  it('同色系不冲突（monochrome）', () => {
    expect(colorsClash('red', 'red')).toBe(false);
    expect(colorsClash('blue', 'blue')).toBe(false);
    expect(colorsClash('红色', '酒红')).toBe(false);
  });

  it('互补色冲突', () => {
    expect(colorsClash('red', 'green')).toBe(true);
    expect(colorsClash('红色', '绿色')).toBe(true);
    expect(colorsClash('orange', 'purple')).toBe(true);
    expect(colorsClash('yellow', 'purple')).toBe(true);
    expect(colorsClash('blue', 'orange')).toBe(true);
    expect(colorsClash('red', 'pink')).toBe(true);
  });

  it('冲突具有对称性', () => {
    expect(colorsClash('green', 'red')).toBe(true);
    expect(colorsClash('purple', 'orange')).toBe(true);
    expect(colorsClash('绿色', '红色')).toBe(true);
  });

  it('非冲突的跨色系组合', () => {
    expect(colorsClash('red', 'blue')).toBe(false);
    expect(colorsClash('green', 'blue')).toBe(false);
    expect(colorsClash('yellow', 'red')).toBe(false);
    expect(colorsClash('pink', 'purple')).toBe(false);
  });

  it('未知颜色不冲突（保守放行）', () => {
    expect(colorsClash('透明色', 'red')).toBe(false);
    expect(colorsClash('red', null)).toBe(false);
    expect(colorsClash(undefined, 'blue')).toBe(false);
  });
});
