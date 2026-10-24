import {
  isAvailable,
  type GarmentForRec,
  type Outfit,
  type RecContext,
  type RecResult,
} from './index';
import { colorsClash } from './colorRules';
import {
  resolveRecommendationFactors,
  type RecommendationFactorOverrides,
} from './factors';

export type OutfitSlot = 'top' | 'bottom' | 'shoes' | 'outerwear';
export type RecommendationMode = 'safe' | 'fresh' | 'hero' | 'hurry';

export interface ReplacementOptions {
  mode: RecommendationMode;
  feedbackWeights?: ReadonlyMap<string, number>;
  factors?: RecommendationFactorOverrides;
}

export interface RegenerateOptions extends ReplacementOptions {
  avoidSignatures: readonly string[];
  lockedHeroId?: string | null;
}

const DAY_MS = 86_400_000;

function compareIds(a: GarmentForRec, b: GarmentForRec): number {
  return a.id.localeCompare(b.id);
}

function modeScore(
  item: GarmentForRec,
  ctx: RecContext,
  mode: RecommendationMode,
  feedbackWeights?: ReadonlyMap<string, number>,
): number {
  const factors = resolveRecommendationFactors(ctx.factors);
  const feedback = factors.feedbackLearning ? (feedbackWeights?.get(item.id) ?? 0) * 1_000 : 0;
  const staleDays = factors.wardrobeActivation
    ? item.lastWornAt == null
      ? 90
      : Math.max(0, (ctx.now - item.lastWornAt) / DAY_MS)
    : 0;
  if (mode === 'safe') return feedback + item.timesWorn * 30 - staleDays;
  if (mode === 'fresh' || mode === 'hero') return feedback + staleDays * 10 - item.timesWorn * 30;
  return feedback - item.timesWorn;
}

function sortCandidates(
  candidates: GarmentForRec[],
  ctx: RecContext,
  options: ReplacementOptions,
): GarmentForRec[] {
  return [...candidates].sort((a, b) => {
    const scoreDiff =
      modeScore(b, ctx, options.mode, options.feedbackWeights) -
      modeScore(a, ctx, options.mode, options.feedbackWeights);
    return scoreDiff || compareIds(a, b);
  });
}

function currentForSlot(outfit: Outfit, slot: OutfitSlot): GarmentForRec | undefined {
  return outfit[slot];
}

export function listReplacementCandidates(
  outfit: Outfit,
  slot: OutfitSlot,
  items: readonly GarmentForRec[],
  ctx: RecContext,
  options: ReplacementOptions,
): GarmentForRec[] {
  const current = currentForSlot(outfit, slot);
  if (!current) return [];
  const expectedCategory = current.category;
  const candidates = items.filter(
    (item) =>
      item.id !== current.id &&
      item.category === expectedCategory &&
      isAvailable(item),
  );
  return sortCandidates(candidates, { ...ctx, factors: options.factors ?? ctx.factors }, options);
}

export function replaceSlot(outfit: Outfit, slot: OutfitSlot, candidate: GarmentForRec): Outfit {
  const current = currentForSlot(outfit, slot);
  if (!current) throw new Error(`slot ${slot} is empty`);
  if (!isAvailable(candidate) || candidate.category !== current.category) {
    throw new Error('candidate violates slot or availability constraint');
  }
  if (current.category === 'dress') {
    if (candidate.category !== 'dress') throw new Error('dress can only be replaced by dress');
    return { ...outfit, top: candidate, bottom: candidate };
  }
  return { ...outfit, [slot]: candidate };
}

export function outfitSignature(outfit: Outfit): string {
  return [
    `top:${outfit.top.id}`,
    `bottom:${outfit.bottom.id}`,
    `shoes:${outfit.shoes.id}`,
    `outerwear:${outfit.outerwear?.id ?? '-'}`,
  ].join('|');
}

function uniqueItems(outfit: Outfit): GarmentForRec[] {
  const byId = new Map<string, GarmentForRec>();
  for (const item of [outfit.top, outfit.bottom, outfit.shoes, outfit.outerwear]) {
    if (item) byId.set(item.id, item);
  }
  return [...byId.values()];
}

function buildOutfits(items: readonly GarmentForRec[], ctx: RecContext): Outfit[] {
  const pool = items.filter(isAvailable);
  const tops = pool.filter((item) => item.category === 'top');
  const bottoms = pool.filter((item) => item.category === 'bottom');
  const dresses = pool.filter((item) => item.category === 'dress');
  const shoes = pool.filter((item) => item.category === 'shoes');
  const outerwear = pool.filter((item) => item.category === 'outerwear');
  const outerOptions: (GarmentForRec | undefined)[] = [undefined, ...outerwear];
  const outfits: Outfit[] = [];

  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        for (const outer of outerOptions) {
          outfits.push({ top, bottom, shoes: shoe, outerwear: outer });
        }
      }
    }
  }
  for (const dress of dresses) {
    for (const shoe of shoes) {
      for (const outer of outerOptions) {
        outfits.push({ top: dress, bottom: dress, shoes: shoe, outerwear: outer });
      }
    }
  }
  return outfits;
}

function outfitScore(
  outfit: Outfit,
  ctx: RecContext,
  options: RegenerateOptions,
): number {
  const mergedContext = { ...ctx, factors: options.factors ?? ctx.factors };
  const factors = resolveRecommendationFactors(mergedContext.factors);
  const itemScore = uniqueItems(outfit).reduce(
    (sum, item) => sum + modeScore(item, mergedContext, options.mode, options.feedbackWeights),
    0,
  );
  const hurryPenalty = options.mode === 'hurry' && outfit.outerwear ? 25 : 0;
  const colorPenalty =
    factors.colorHarmony && outfit.top.id !== outfit.bottom.id && colorsClash(outfit.top.color, outfit.bottom.color)
      ? 100_000
      : 0;
  return itemScore - hurryPenalty - colorPenalty;
}

export function regenerateOutfit(
  items: readonly GarmentForRec[],
  ctx: RecContext,
  options: RegenerateOptions,
): RecResult {
  const mergedContext = { ...ctx, factors: options.factors ?? ctx.factors };
  const factors = resolveRecommendationFactors(mergedContext.factors);
  const activeLockedHeroId = factors.heroItem ? options.lockedHeroId : null;
  let outfits = buildOutfits(items, ctx);
  if (activeLockedHeroId) {
    outfits = outfits.filter((outfit) =>
      uniqueItems(outfit).some((item) => item.id === activeLockedHeroId),
    );
  }
  if (outfits.length === 0) {
    const available = items.filter(isAvailable);
    const missing: string[] = [];
    if (!available.some((item) => item.category === 'top' || item.category === 'dress')) missing.push('top');
    if (!available.some((item) => item.category === 'bottom' || item.category === 'dress')) missing.push('bottom');
    if (!available.some((item) => item.category === 'shoes')) missing.push('shoes');
    if (activeLockedHeroId) missing.push('locked-hero');
    return { ok: false, missing };
  }

  const avoided = new Set(factors.repeatAvoidance ? options.avoidSignatures : []);
  const fresh = outfits.filter((outfit) => !avoided.has(outfitSignature(outfit)));
  const candidates = fresh.length > 0 ? fresh : outfits;
  candidates.sort((a, b) => {
    const scoreDiff = outfitScore(b, mergedContext, options) - outfitScore(a, mergedContext, options);
    return scoreDiff || outfitSignature(a).localeCompare(outfitSignature(b));
  });
  const outfit = candidates[0];
  const reasonCodes = [
    `MODE_${options.mode.toUpperCase()}`,
    ...(factors.occasion && ctx.occasion ? [`OCCASION_${ctx.occasion.toUpperCase()}`] : []),
    ...(fresh.length > 0 && avoided.size > 0 ? ['REPEAT_SUPPRESSION'] : []),
    ...(activeLockedHeroId ? ['HERO_LOCKED'] : []),
  ];
  return {
    ok: true,
    outfit,
    reasonCodes,
    totalScore: outfitScore(outfit, mergedContext, options),
  };
}
