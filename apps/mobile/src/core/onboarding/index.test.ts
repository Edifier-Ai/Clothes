/**
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { openQueueTestDb } from '../db/queueTestHelper';
import {
  buildFirstOutfit,
  computeStep,
  DEFAULT_STATE,
  loadOnboardState,
  parseOnboardState,
  quotaStatus,
  saveOnboardState,
  type OnboardState,
  type QuotaItem,
} from './index';

const g = (id: string, category: string): QuotaItem => ({ id, category });

describe('配额 quotaStatus', () => {
  it('0 件：missing=12，complete=false', () => {
    const s = quotaStatus([]);
    expect(s.total).toBe(0);
    expect(s.missing).toHaveLength(12);
    expect(s.complete).toBe(false);
  });

  it('满 12 件合规：complete=true，missing=0', () => {
    const items: QuotaItem[] = [
      g('t1', 'top'), g('t2', 'top'), g('t3', 'top'),
      g('b1', 'bottom'), g('b2', 'bottom'), g('b3', 'bottom'),
      g('s1', 'shoes'), g('s2', 'shoes'),
      g('o1', 'outerwear'), g('o2', 'outerwear'),
      g('f1', 'accessory'), g('f2', 'other'),
    ];
    const s = quotaStatus(items);
    expect(s.complete).toBe(true);
    expect(s.missing).toHaveLength(0);
  });

  it('连衣裙顶替 top/bottom 缺口', () => {
    // 2 top + 1 dress(补 top) + 2 bottom + 1 dress(补 bottom) ... 构造：top2,bottom2,dress2,shoes2,outer2 = 10 + 需 free2
    const items: QuotaItem[] = [
      g('t1', 'top'), g('t2', 'top'),
      g('b1', 'bottom'), g('b2', 'bottom'),
      g('d1', 'dress'), g('d2', 'dress'),
      g('s1', 'shoes'), g('s2', 'shoes'),
      g('o1', 'outerwear'), g('o2', 'outerwear'),
    ];
    const s = quotaStatus(items);
    // top: 2+1(dress)=3 ok; bottom: 2+1(dress)=3 ok; free 缺2
    expect(s.counts.top).toBe(3);
    expect(s.counts.bottom).toBe(3);
    expect(s.missing.filter((m) => m === 'free')).toHaveLength(2);
  });
});

describe('首套 buildFirstOutfit', () => {
  it('top+bottom+shoes → ok 含真实衣物+理由', () => {
    const r = buildFirstOutfit([g('t1', 'top'), g('b1', 'bottom'), g('s1', 'shoes')]);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.outfit.top.id).toBe('t1');
      expect(r.outfit.bottom.id).toBe('b1');
      expect(r.outfit.shoes.id).toBe('s1');
      expect(r.outfit.reasons.length).toBeGreaterThan(0);
    }
  });

  it('连衣裙可作 top+bottom 一体', () => {
    const r = buildFirstOutfit([g('d1', 'dress'), g('s1', 'shoes')]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.outfit.top.id).toBe('d1');
  });

  it('无鞋 → ok=false missing 含 shoes（不伪造）', () => {
    const r = buildFirstOutfit([g('t1', 'top'), g('b1', 'bottom')]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toContain('shoes');
  });

  it('12 件但无鞋（反向验证）→ 不伪造完整搭配，提示补鞋', () => {
    const items: QuotaItem[] = [
      g('t1', 'top'), g('t2', 'top'), g('t3', 'top'),
      g('b1', 'bottom'), g('b2', 'bottom'), g('b3', 'bottom'),
      g('o1', 'outerwear'), g('o2', 'outerwear'),
      g('f1', 'accessory'), g('f2', 'other'), g('f3', 'accessory'), g('f4', 'other'),
    ];
    const r = buildFirstOutfit(items);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.missing).toEqual(['shoes']);
    // 补鞋后通过
    const r2 = buildFirstOutfit([...items, g('s1', 'shoes')]);
    expect(r2.ok).toBe(true);
  });

  it('outerwear 可选：有则含，无仍 ok', () => {
    const withOuter = buildFirstOutfit([g('t1', 'top'), g('b1', 'bottom'), g('s1', 'shoes'), g('o1', 'outerwear')]);
    expect(withOuter.ok).toBe(true);
    if (withOuter.ok) expect(withOuter.outfit.outerwear?.id).toBe('o1');
  });
});

describe('状态机 computeStep', () => {
  it('0 件且未开始配额：保持引导步', () => {
    expect(computeStep({ ...DEFAULT_STATE, step: 'welcome' }, 0, false)).toBe('welcome');
    expect(computeStep({ ...DEFAULT_STATE, step: 'goals' }, 0, false)).toBe('goals');
  });
  it('5 件（已开始配额）→ quota', () => {
    expect(computeStep({ ...DEFAULT_STATE, quotaStarted: true }, 5, false)).toBe('quota');
  });
  it('6 件 → preview', () => {
    expect(computeStep({ ...DEFAULT_STATE, quotaStarted: true }, 6, false)).toBe('preview');
  });
  it('11 件 → preview', () => {
    expect(computeStep({ ...DEFAULT_STATE, quotaStarted: true }, 11, false)).toBe('preview');
  });
  it('12 件 → reveal', () => {
    expect(computeStep({ ...DEFAULT_STATE, quotaStarted: true }, 12, false)).toBe('reveal');
  });
  it('completed → done（第二次启动直达今日）', () => {
    expect(computeStep({ ...DEFAULT_STATE, completed: true, quotaStarted: true }, 12, true)).toBe('done');
  });
});

describe('parseOnboardState 容错', () => {
  it('null/坏 JSON → 默认', () => {
    expect(parseOnboardState(null).step).toBe('welcome');
    expect(parseOnboardState('{bad').step).toBe('welcome');
  });
  it('非法 step 回落 welcome', () => {
    expect(parseOnboardState('{"step":"nope","completed":false}').step).toBe('welcome');
  });
});

describe('onboarding 持久（重启恢复节点）', () => {
  it('save→load 还原 step/goals', async () => {
    const t = openQueueTestDb();
    const state: OnboardState = { step: 'quota', completed: false, goals: ['commute'], quotaStarted: true };
    await saveOnboardState(t.garmentDb, state);
    const loaded = await loadOnboardState(t.garmentDb);
    expect(loaded.step).toBe('quota');
    expect(loaded.goals).toEqual(['commute']);
    t.close();
  });
});
