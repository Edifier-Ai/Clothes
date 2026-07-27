/**
 * domain：领域模型、推荐规则、用例。
 * 纯函数优先，可被 Jest 直接覆盖；MVP-005 起承载推荐评分与 reason_codes。
 */
export const DOMAIN_LAYER = 'domain' as const;
