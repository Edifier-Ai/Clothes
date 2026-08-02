import type { GarmentForRec, Outfit, RecContext } from '@/core/recommend';
import { outfitSignature, regenerateOutfit, type RecommendationMode } from '@/core/recommend/replacement';

/**
 * LOK-07 从主角单品创建：围绕 hero 生成 3 个组合方向。
 * 复用推荐引擎 regenerateOutfit（lockedHeroId 锁定主角，槽位合法性由引擎保证），
 * 三个模式 safe/fresh/hero 依次生成并用 avoidSignatures 去重，池子足够时方向互不相同；
 * 池子无法组成合法造型时该方向 outfit 为 null（诚实呈现，不伪造）。
 * 纯函数 + 确定性排序：同输入逐字节一致。
 */

export const HERO_DIRECTION_MODES = ['safe', 'fresh', 'hero'] as const satisfies readonly RecommendationMode[];

export type HeroDirectionMode = (typeof HERO_DIRECTION_MODES)[number];

export interface HeroDirection {
  mode: HeroDirectionMode;
  /** 中文方向名（UI 展示）。 */
  label: string;
  outfit: Outfit | null;
  reasonCodes: string[];
}

export const HERO_DIRECTION_LABEL: Record<HeroDirectionMode, string> = {
  safe: '稳妥熟悉',
  fresh: '盘活久未穿',
  hero: '主角突出',
};

export function buildHeroDirections(
  heroId: string,
  items: readonly GarmentForRec[],
  ctx: RecContext,
): HeroDirection[] {
  const avoid: string[] = [];
  return HERO_DIRECTION_MODES.map((mode) => {
    const r = regenerateOutfit(items, ctx, { mode, avoidSignatures: avoid, lockedHeroId: heroId });
    if (!r.ok) return { mode, label: HERO_DIRECTION_LABEL[mode], outfit: null, reasonCodes: [] };
    avoid.push(outfitSignature(r.outfit));
    return { mode, label: HERO_DIRECTION_LABEL[mode], outfit: r.outfit, reasonCodes: r.reasonCodes };
  });
}
