import { describe, expect, it } from '@jest/globals';

import { defaultBandForMonth, outerNeed, parseSeasons, seasonFit } from './weather';

describe('季节标签解析', () => {
  it('常见写法', () => {
    expect([...parseSeasons('夏')!]).toEqual(['summer']);
    expect([...parseSeasons('春秋')!].sort()).toEqual(['autumn', 'spring']);
    expect(parseSeasons('四季')!.size).toBe(4);
    expect([...parseSeasons('Winter')!]).toEqual(['winter']);
  });
  it('空或认不出 → null', () => {
    expect(parseSeasons('')).toBeNull();
    expect(parseSeasons(null)).toBeNull();
    expect(parseSeasons('随便')).toBeNull();
  });
});

describe('seasonFit', () => {
  it('匹配 / 不匹配 / 未知', () => {
    expect(seasonFit('夏', 'hot')).toBe('fit');
    expect(seasonFit('冬', 'hot')).toBe('mismatch');
    expect(seasonFit('春秋', 'cool')).toBe('fit');
    expect(seasonFit('夏', 'cold')).toBe('mismatch');
    expect(seasonFit('四季', 'cold')).toBe('fit');
    expect(seasonFit(undefined, 'warm')).toBe('unknown');
  });
});

describe('外套需求与默认档位', () => {
  it('冷凉要外套，热不要，暖看场景', () => {
    expect(outerNeed('cold')).toBe('needed');
    expect(outerNeed('cool')).toBe('needed');
    expect(outerNeed('warm')).toBe('by-occasion');
    expect(outerNeed('hot')).toBe('none');
  });
  it('按月份估计', () => {
    expect(defaultBandForMonth(new Date(2026, 0, 15))).toBe('cold');
    expect(defaultBandForMonth(new Date(2026, 3, 1))).toBe('cool');
    expect(defaultBandForMonth(new Date(2026, 4, 1))).toBe('warm');
    expect(defaultBandForMonth(new Date(2026, 6, 1))).toBe('hot');
    expect(defaultBandForMonth(new Date(2026, 9, 26))).toBe('cool');
  });
});
