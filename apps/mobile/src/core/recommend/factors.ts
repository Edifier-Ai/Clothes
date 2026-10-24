export interface RecommendationFactors {
  occasion: boolean;
  colorHarmony: boolean;
  wardrobeActivation: boolean;
  repeatAvoidance: boolean;
  feedbackLearning: boolean;
  heroItem: boolean;
}

export type RecommendationFactorOverrides = Partial<RecommendationFactors>;

export const DEFAULT_RECOMMENDATION_FACTORS: Readonly<RecommendationFactors> = Object.freeze({
  occasion: true,
  colorHarmony: true,
  wardrobeActivation: true,
  repeatAvoidance: true,
  feedbackLearning: true,
  heroItem: true,
});

/** 未知或损坏字段回退为默认开启，旧安装升级后维持既有推荐行为。 */
export function resolveRecommendationFactors(
  input?: RecommendationFactorOverrides | null,
): RecommendationFactors {
  return {
    occasion: typeof input?.occasion === 'boolean' ? input.occasion : true,
    colorHarmony: typeof input?.colorHarmony === 'boolean' ? input.colorHarmony : true,
    wardrobeActivation:
      typeof input?.wardrobeActivation === 'boolean' ? input.wardrobeActivation : true,
    repeatAvoidance:
      typeof input?.repeatAvoidance === 'boolean' ? input.repeatAvoidance : true,
    feedbackLearning:
      typeof input?.feedbackLearning === 'boolean' ? input.feedbackLearning : true,
    heroItem: typeof input?.heroItem === 'boolean' ? input.heroItem : true,
  };
}
