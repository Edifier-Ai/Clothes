import { describe, expect, it } from '@jest/globals';

import { generateRecommendation, topReasons, type GarmentForRec, type RecContext } from './index';
import { listReplacementCandidates, regenerateOutfit } from './replacement';

function g(id: string, category: string, overrides: Partial<GarmentForRec> = {}): GarmentForRec {
  return {
    id,
    category: category as GarmentForRec['category'],
    status: 'clean',
    createdAt: 1_000_000,
    updatedAt: 1_000_000,
    lastWornAt: null,
    timesWorn: 0,
    ...overrides,
  };
}

const base: RecContext = { now: 2_000_000, occasion: 'casual', recentItemIds: [] };
const wardrobe = [
  g('a-winter-top', 'top', { season: '冬' }),
  g('b-summer-top', 'top', { season: '夏' }),
  g('bottom', 'bottom'),
  g('shoes', 'shoes'),
  g('coat', 'outerwear', { season: '冬' }),
];

describe('天气要素：季节标签与气温', () => {
  it('热天选夏装，不带外套；冷天选冬装，带外套', () => {
    const hot = generateRecommendation(wardrobe, { ...base, temperature: 'hot' });
    expect(hot.ok && hot.outfit.top.id).toBe('b-summer-top');
    expect(hot.ok && hot.outfit.outerwear).toBeUndefined();
    expect(hot.ok && hot.reasonCodes).toContain('WEATHER_FIT');

    const cold = generateRecommendation(wardrobe, { ...base, temperature: 'cold' });
    expect(cold.ok && cold.outfit.top.id).toBe('a-winter-top');
    expect(cold.ok && cold.outfit.outerwear?.id).toBe('coat');
    expect(cold.ok && cold.reasonCodes).toEqual(expect.arrayContaining(['WEATHER_FIT', 'WEATHER_OUTER']));
  });

  it('暖天外套交给场景规则：休闲不带，通勤带', () => {
    const casual = generateRecommendation(wardrobe, { ...base, temperature: 'warm', occasion: 'casual' });
    expect(casual.ok && casual.outfit.outerwear).toBeUndefined();
    const commute = generateRecommendation(wardrobe, { ...base, temperature: 'warm', occasion: 'commute' });
    expect(commute.ok && commute.outfit.outerwear?.id).toBe('coat');
  });

  it('热天即使是通勤/正式也不带外套', () => {
    const r = generateRecommendation(wardrobe, { ...base, temperature: 'hot', occasion: 'formal' });
    expect(r.ok && r.outfit.outerwear).toBeUndefined();
  });

  it('不搭的季节只是降权：衣橱里只有冬装时热天照样能推荐，且不声称季节相符', () => {
    const onlyWinter = [g('t', 'top', { season: '冬' }), g('b', 'bottom'), g('s', 'shoes')];
    const r = generateRecommendation(onlyWinter, { ...base, temperature: 'hot' });
    expect(r.ok && r.outfit.top.id).toBe('t');
    expect(r.ok && r.reasonCodes).not.toContain('WEATHER_FIT');
  });

  it('没填季节的衣物不受影响，也不会被说成「季节相符」', () => {
    const bare = [g('t', 'top'), g('b', 'bottom'), g('s', 'shoes')];
    const r = generateRecommendation(bare, { ...base, temperature: 'cold' });
    expect(r.ok).toBe(true);
    expect(r.ok && r.reasonCodes).not.toContain('WEATHER_FIT');
  });

  it('关闭「天气」要素或不选气温：行为与之前完全一致', () => {
    const off = generateRecommendation(wardrobe, { ...base, temperature: 'hot', factors: { weather: false } });
    const none = generateRecommendation(wardrobe, base);
    expect(off).toEqual(none);
    expect(off.ok && off.reasonCodes.some((c) => c.startsWith('WEATHER'))).toBe(false);
  });

  it('理由里优先展示天气理由', () => {
    expect(topReasons(['SLOT_FILLED_TOP', 'WEATHER_FIT', 'WEATHER_OUTER'], 2)).toEqual(['WEATHER_OUTER', 'WEATHER_FIT']);
  });
});

describe('天气要素：换一套 / 换一件', () => {
  const options = { mode: 'safe' as const, avoidSignatures: [] };

  it('换一套：热天不带外套，冷天必带外套，理由码与首套一致', () => {
    const hot = regenerateOutfit(wardrobe, { ...base, temperature: 'hot' }, options);
    expect(hot.ok && hot.outfit.outerwear).toBeUndefined();
    expect(hot.ok && hot.outfit.top.id).toBe('b-summer-top');
    const cold = regenerateOutfit(wardrobe, { ...base, temperature: 'cold' }, options);
    expect(cold.ok && cold.outfit.outerwear?.id).toBe('coat');
    expect(cold.ok && cold.outfit.top.id).toBe('a-winter-top');
    expect(cold.ok && cold.reasonCodes).toContain('WEATHER_OUTER');
  });

  it('冷天没有外套时仍能搭出一套', () => {
    const noCoat = wardrobe.filter((i) => i.category !== 'outerwear');
    const r = regenerateOutfit(noCoat, { ...base, temperature: 'cold' }, options);
    expect(r.ok && r.outfit.outerwear).toBeUndefined();
  });

  it('换一件：合季节的候选排在前面（即使另一件更常穿）', () => {
    const outfit = { top: wardrobe[0], bottom: wardrobe[2], shoes: wardrobe[3] };
    const more = [...wardrobe, g('d-winter-top', 'top', { season: '冬', timesWorn: 9 })];
    // 安全模式偏爱穿得多的：没有天气时冬装排第一
    const plain = listReplacementCandidates(outfit, 'top', more, base, { mode: 'safe' });
    expect(plain[0].id).toBe('d-winter-top');
    const hot = listReplacementCandidates(outfit, 'top', more, { ...base, temperature: 'hot' }, { mode: 'safe' });
    expect(hot.map((i) => i.id)).toEqual(['b-summer-top', 'd-winter-top']);
  });
});
