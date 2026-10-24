/**
 * 首次激活（MVP-004）域逻辑：配额、首套合法组合、onboarding 状态机、进度持久。
 * 纯逻辑，host 可测；不伪造组合——不足以合法搭配时返回 missing。
 */
import type { GarmentDb } from '../db/dao';

export type OnboardCategory = 'top' | 'bottom' | 'dress' | 'shoes' | 'outerwear' | 'free';
/** 配额槽（不含 dress：连衣裙顶替 top/bottom 缺口，不单列槽）。 */
export type QuotaSlot = Exclude<OnboardCategory, 'dress'>;

/** 12 件启动配额：3 上装 + 3 下装 + 2 鞋 + 2 外套 + 2 自由。连衣裙可顶上装或下装缺口。 */
export const QUOTA: Readonly<Record<QuotaSlot, number>> = {
  top: 3,
  bottom: 3,
  shoes: 2,
  outerwear: 2,
  free: 2,
};

export const QUOTA_TOTAL = Object.values(QUOTA).reduce((a, b) => a + b, 0); // 12
export const PREVIEW_THRESHOLD = 6;

export interface QuotaItem {
  id: string;
  category: string; // garment.category 原始值
}

export interface QuotaStatus {
  counts: Record<QuotaSlot, number>;
  /** 仍缺的配额槽（展开为单项，含连衣裙顶替后的剩余） */
  missing: QuotaSlot[];
  total: number;
  complete: boolean;
}

const NORM: Record<string, OnboardCategory> = {
  top: 'top',
  bottom: 'bottom',
  dress: 'dress',
  shoes: 'shoes',
  outerwear: 'outerwear',
  accessory: 'free',
  other: 'free',
};

function norm(cat: string): OnboardCategory {
  return NORM[cat] ?? 'free';
}

/** 把连衣裙分配到 top/bottom 缺口，再统计各槽计数与缺失。 */
export function quotaStatus(items: QuotaItem[]): QuotaStatus {
  const counts: Record<QuotaSlot, number> = { top: 0, bottom: 0, shoes: 0, outerwear: 0, free: 0 };
  const dresses: number = items.filter((i) => norm(i.category) === 'dress').length;
  for (const i of items) {
    const c = norm(i.category);
    if (c !== 'dress') counts[c]++;
  }
  // 连衣裙先补 top 缺口，再补 bottom 缺口
  let d = dresses;
  const topNeed = Math.max(0, QUOTA.top - counts.top);
  const topFromDress = Math.min(d, topNeed);
  counts.top += topFromDress;
  d -= topFromDress;
  const bottomNeed = Math.max(0, QUOTA.bottom - counts.bottom);
  const bottomFromDress = Math.min(d, bottomNeed);
  counts.bottom += bottomFromDress;
  d -= bottomFromDress;
  // 剩余连衣裙计入 free
  counts.free += d;

  const missing: QuotaSlot[] = [];
  (Object.keys(QUOTA) as QuotaSlot[]).forEach((k) => {
    const need = Math.max(0, QUOTA[k] - counts[k]);
    for (let i = 0; i < need; i++) missing.push(k);
  });
  const total = items.length;
  return { counts, missing, total, complete: missing.length === 0 && total >= QUOTA_TOTAL };
}

export interface Outfit {
  top: QuotaItem;
  bottom: QuotaItem;
  shoes: QuotaItem;
  outerwear?: QuotaItem;
  reasons: string[];
}

export type FirstOutfitResult = { ok: true; outfit: Outfit } | { ok: false; missing: QuotaSlot[] };

/**
 * 生成首套合法组合（仅用真实衣物）。需 top/dress + bottom/dress + shoes；outerwear 可选。
 * 不满足返回 missing（不伪造）。理由与数据一致（类别满足/缺口）。
 */
export function buildFirstOutfit(items: QuotaItem[]): FirstOutfitResult {
  const by = (c: OnboardCategory) => items.filter((i) => norm(i.category) === c);
  const tops = by('top');
  const bottoms = by('bottom');
  const dresses = by('dress');
  const shoes = by('shoes');
  const outers = by('outerwear');

  let top: QuotaItem | undefined;
  let bottom: QuotaItem | undefined;
  // 优先 top+bottom；否则 dress 作 top+bottom 一体
  if (tops.length > 0 && bottoms.length > 0) {
    top = tops[0];
    bottom = bottoms[0];
  } else if (dresses.length > 0) {
    top = dresses[0];
    bottom = dresses[0];
  } else if (tops.length > 0) {
    top = tops[0]; // 缺 bottom
  } else if (bottoms.length > 0) {
    bottom = bottoms[0]; // 缺 top
  }
  const shoesPick = shoes[0];

  const missing: QuotaSlot[] = [];
  if (!top) missing.push('top');
  if (!bottom) missing.push('bottom');
  if (!shoesPick) missing.push('shoes');
  if (missing.length > 0) return { ok: false, missing };

  const reasons: string[] = [];
  reasons.push(`含真实${top!.id === bottom!.id ? '连衣裙' : '上装+下装'}`);
  reasons.push('含鞋');
  const outfit: Outfit = { top: top!, bottom: bottom!, shoes: shoesPick!, reasons };
  if (outers.length > 0) {
    outfit.outerwear = outers[0];
    reasons.push('含外套');
  }
  return { ok: true, outfit };
}

// ---- onboarding 状态机 ----

export const ONBOARD_STEPS = ['welcome', 'value', 'privacy', 'goals', 'quota', 'preview', 'reveal', 'done'] as const;
export type OnboardStep = (typeof ONBOARD_STEPS)[number];

export interface OnboardState {
  step: OnboardStep;
  completed: boolean;
  goals: string[];
  /** 用户已进入「添加配额」阶段（完成引导前四步后置 true）。 */
  quotaStarted: boolean;
}

const DEFAULT_STATE: OnboardState = { step: 'welcome', completed: false, goals: [], quotaStarted: false };

const META_KEY = 'onboarding_state';
const stateListeners = new Set<(state: OnboardState) => void>();

export function parseOnboardState(raw: string | null): OnboardState {
  if (!raw) return { ...DEFAULT_STATE };
  try {
    const p = JSON.parse(raw) as Partial<OnboardState>;
    return {
      step: (ONBOARD_STEPS as readonly string[]).includes(p.step ?? '') ? (p.step as OnboardStep) : 'welcome',
      completed: !!p.completed,
      goals: Array.isArray(p.goals) ? p.goals : [],
      quotaStarted: !!p.quotaStarted,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function loadOnboardState(db: GarmentDb): Promise<OnboardState> {
  return parseOnboardState(await db.getMeta(META_KEY));
}

export async function saveOnboardState(db: GarmentDb, state: OnboardState): Promise<void> {
  await db.setMeta(META_KEY, JSON.stringify(state));
  for (const listener of stateListeners) listener(state);
}

/**
 * 根布局订阅 onboarding 的持久状态变化。
 * 只在 setMeta 成功后通知，避免 UI 已放行但完成标记尚未落盘。
 */
export function subscribeOnboardState(listener: (state: OnboardState) => void): () => void {
  stateListeners.add(listener);
  return () => stateListeners.delete(listener);
}

/** 据当前衣物数与完成标记推进步骤。引导前四步由用户推进；quotaStarted 后按件数推进。 */
export function computeStep(state: OnboardState, itemCount: number, completed: boolean): OnboardStep {
  if (completed) return 'done';
  if (!state.quotaStarted) return state.step === 'done' ? 'welcome' : state.step;
  if (itemCount >= QUOTA_TOTAL) return 'reveal';
  if (itemCount >= PREVIEW_THRESHOLD) return 'preview';
  return 'quota';
}

export { DEFAULT_STATE };
