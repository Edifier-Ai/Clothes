/**
 * @jest-environment node
 *
 * 快速槽位合法性（MVP-008）：top+bottom+shoes 或 dress+shoes；
 * dress 与 top/bottom 互斥；outerwear/accessory 可选；同槽唯一。
 */
import { describe, expect, it } from '@jest/globals';

import { validateSlotAssignment, type SlotItem } from './slots';

const s = (slot: SlotItem['slot'], id = `${slot}-1`): SlotItem => ({ id, garmentId: `g-${id}`, slot });

describe('validateSlotAssignment', () => {
  it('标准组合 top+bottom+shoes 合法；outerwear/accessory 可选', () => {
    const r = validateSlotAssignment([s('top'), s('bottom'), s('shoes'), s('outerwear'), s('accessory')]);
    expect(r).toEqual({ ok: true, missing: [], conflicts: [] });
  });

  it('dress+shoes 合法（dress 顶替 top+bottom）', () => {
    expect(validateSlotAssignment([s('dress'), s('shoes')])).toEqual({ ok: true, missing: [], conflicts: [] });
  });

  it('缺鞋：missing 含 shoes，不伪造 ok', () => {
    const r = validateSlotAssignment([s('top'), s('bottom')]);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['shoes']);
    expect(r.conflicts).toEqual([]);
  });

  it('缺 top 与 bottom：missing 如实列出', () => {
    const r = validateSlotAssignment([s('shoes')]);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['top', 'bottom']);
  });

  it('dress 与 top 共存 → 互斥冲突；dress 与 bottom 共存同样冲突', () => {
    const r1 = validateSlotAssignment([s('dress'), s('top'), s('shoes')]);
    expect(r1.ok).toBe(false);
    expect(r1.conflicts).toEqual(['dress-excludes-top']);
    const r2 = validateSlotAssignment([s('dress'), s('bottom'), s('shoes')]);
    expect(r2.conflicts).toEqual(['dress-excludes-bottom']);
    const r3 = validateSlotAssignment([s('dress'), s('top'), s('bottom'), s('shoes')]);
    expect(r3.conflicts).toEqual(['dress-excludes-top', 'dress-excludes-bottom']);
  });

  it('同槽两件 → 冲突，同槽唯一', () => {
    const r = validateSlotAssignment([s('top', 't1'), s('top', 't2'), s('bottom'), s('shoes')]);
    expect(r.ok).toBe(false);
    expect(r.conflicts).toEqual(['duplicate-slot-top']);
  });

  it('canvas 项（slot=null）不参与判定', () => {
    const r = validateSlotAssignment([s('top'), s('bottom'), s('shoes'), { id: 'x', garmentId: 'gx', slot: null }]);
    expect(r.ok).toBe(true);
  });

  it('空列表：missing 全列，ok=false', () => {
    const r = validateSlotAssignment([]);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual(['top', 'bottom', 'shoes']);
  });
});
