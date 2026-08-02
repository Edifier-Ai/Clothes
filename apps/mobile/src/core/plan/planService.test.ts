/**
 * @jest-environment node
 *
 * 计划服务（MVP-009）RED 测试：真实 sqlite（better-sqlite3），不 mock 被测核心。
 *
 * 覆盖任务卡验收：同日多时段独立编辑、移动、墓碑删除（不删造型）、
 * 记录已穿幂等、关联造型删除后快照保留、跨重启与镜像往返。
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { openTestDb, reopenDb, type TestDb } from '../db/sqliteTestHelper';
import { createLook, dumpAll, softDeleteLook, type CreateLookInput } from '../db/dao';
import {
  deletePlanCore,
  getPlanCore,
  listPlansInRangeCore,
  movePlanCore,
  plansForDateCore,
  recordWornCore,
  savePlanCore,
} from './planService';

let t: TestDb;
beforeEach(async () => {
  t = await openTestDb();
});
afterEach(() => {
  t.close();
});

async function seedLook(id: string, garmentIds: string[]): Promise<void> {
  const input: CreateLookInput = {
    id,
    name: `造型${id}`,
    mode: 'slots',
    items: garmentIds.map((gid, i) => ({
      id: `${id}-item-${i}`,
      garmentId: gid,
      slot: 'top',
      x: 0.5,
      y: 0.5,
      scale: 1,
      rotation: 0,
      zIndex: i,
      ord: i,
    })),
    now: 1000,
  };
  await createLook(t.db, input);
}

describe('savePlanCore / plansForDateCore（同日多时段）', () => {
  it('同日工作/晚餐两项计划各自独立', async () => {
    await seedLook('look-work', ['g1', 'g2']);
    await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '白天', occasion: 'commute', lookId: 'look-work' });
    await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '晚餐', occasion: 'dinner', garmentIds: ['g3', 'g4'] });
    const plans = await plansForDateCore(t.db, '2026-07-28');
    expect(plans).toHaveLength(2);
    expect(plans.map((p) => p.timeLabel).sort()).toEqual(['晚餐', '白天']);
  });

  it('编辑其中一项（场合/备注）不影响另一项', async () => {
    const a = await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '白天', occasion: 'commute', garmentIds: ['g1'] });
    const b = await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '晚餐', occasion: 'dinner', garmentIds: ['g2'] });
    await savePlanCore(t.db, { id: a.plan.id, date: '2026-07-28', timeLabel: '白天', occasion: 'formal', note: '客户来访' });
    const after = await plansForDateCore(t.db, '2026-07-28');
    expect(after).toHaveLength(2);
    const ea = after.find((p) => p.id === a.plan.id)!;
    const eb = after.find((p) => p.id === b.plan.id)!;
    expect(ea.occasion).toBe('formal');
    expect(ea.note).toBe('客户来访');
    expect(eb.occasion).toBe('dinner');
  });

  it('关联造型时快照其单品；临时组合直接用 garmentIds', async () => {
    await seedLook('look-a', ['g1', 'g2', 'g3']);
    const linked = await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '白天', lookId: 'look-a' });
    expect(linked.outfitGarmentIds).toEqual(['g1', 'g2', 'g3']);
    const adhoc = await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '晚餐', garmentIds: ['g9'] });
    expect(adhoc.outfitGarmentIds).toEqual(['g9']);
  });

  it('编辑时 lookId 缺省保持关联、显式 null 改回临时组合', async () => {
    await seedLook('look-keep', ['g1', 'g2']);
    const p = await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '白天', lookId: 'look-keep' });
    // 缺省：改备注不动关联
    await savePlanCore(t.db, { id: p.plan.id, date: '2026-07-28', timeLabel: '白天', note: 'n' });
    expect((await getPlanCore(t.db, p.plan.id))!.plan.lookId).toBe('look-keep');
    // 显式 null：改回临时组合，快照换成 garmentIds
    const cleared = await savePlanCore(t.db, {
      id: p.plan.id,
      date: '2026-07-28',
      timeLabel: '白天',
      lookId: null,
      garmentIds: ['g7'],
    });
    expect(cleared.plan.lookId).toBeNull();
    expect(cleared.outfitGarmentIds).toEqual(['g7']);
    expect(cleared.lookMissing).toBe(false);
  });
});

describe('listPlansInRangeCore（月历窗口，含跨月 spillover）', () => {
  it('跨月计划：7 月末的计划落在 8 月网格 spillover 里也能查到', async () => {
    await savePlanCore(t.db, { date: '2026-07-31', timeLabel: '白天', garmentIds: ['g1'] });
    await savePlanCore(t.db, { date: '2026-08-01', timeLabel: '白天', garmentIds: ['g2'] });
    // 7 月网格窗口 2026-06-29..2026-08-02
    const julyWindow = await listPlansInRangeCore(t.db, '2026-06-29', '2026-08-02');
    expect(julyWindow.map((p) => p.date).sort()).toEqual(['2026-07-31', '2026-08-01']);
    // 8 月网格窗口含 7-27..7-31 spillover
    const augWindow = await listPlansInRangeCore(t.db, '2026-07-27', '2026-09-06');
    expect(augWindow.map((p) => p.date)).toContain('2026-07-31');
  });
});

describe('movePlanCore / deletePlanCore', () => {
  it('移动日期后原日期查不到、新日期查得到', async () => {
    const p = await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '白天', garmentIds: ['g1'] });
    await movePlanCore(t.db, p.plan.id, '2026-07-30');
    expect(await plansForDateCore(t.db, '2026-07-28')).toHaveLength(0);
    const moved = await plansForDateCore(t.db, '2026-07-30');
    expect(moved).toHaveLength(1);
    expect(moved[0].id).toBe(p.plan.id);
  });

  it('删除是墓碑：列表消失但行保留，且关联造型不被误删', async () => {
    await seedLook('look-x', ['g1']);
    const p = await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '白天', lookId: 'look-x' });
    await deletePlanCore(t.db, p.plan.id);
    expect(await plansForDateCore(t.db, '2026-07-28')).toHaveLength(0);
    const look = await t.db.getLook('look-x');
    expect(look).not.toBeNull();
    expect(look!.deletedAt).toBeNull();
  });
});

describe('recordWornCore（记录已穿，与计划分开保存且幂等）', () => {
  it('按计划穿 → completed；二次记录不重复（completedAt 不变）', async () => {
    const p = await savePlanCore(t.db, { date: '2026-07-27', timeLabel: '白天', garmentIds: ['g1'] });
    const first = await recordWornCore(t.db, p.plan.id, { asPlanned: true, now: 5000 });
    expect(first.plan.status).toBe('completed');
    expect(first.plan.completedAt).toBe(5000);
    const second = await recordWornCore(t.db, p.plan.id, { asPlanned: true, now: 9999 });
    expect(second.plan.status).toBe('completed');
    expect(second.plan.completedAt).toBe(5000); // 幂等：不产生第二条记录、不改时间
  });

  it('计划有变化 → changed + 变化说明；同日另一项仍可独立记录', async () => {
    const a = await savePlanCore(t.db, { date: '2026-07-27', timeLabel: '白天', garmentIds: ['g1'] });
    const b = await savePlanCore(t.db, { date: '2026-07-27', timeLabel: '晚餐', garmentIds: ['g2'] });
    const r = await recordWornCore(t.db, a.plan.id, { asPlanned: false, changeNote: '临时换了外套', now: 6000 });
    expect(r.plan.status).toBe('changed');
    expect(r.plan.changeNote).toBe('临时换了外套');
    const other = await getPlanCore(t.db, b.plan.id);
    expect(other!.plan.status).toBe('planned');
    const r2 = await recordWornCore(t.db, b.plan.id, { asPlanned: true, now: 7000 });
    expect(r2.plan.status).toBe('completed');
  });
});

describe('快照与修复入口（关联造型被删后）', () => {
  it('造型墓碑后计划快照完整、lookMissing=true，数据可支撑修复', async () => {
    await seedLook('look-doomed', ['g1', 'g2']);
    const p = await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '白天', lookId: 'look-doomed' });
    expect(p.outfitGarmentIds).toEqual(['g1', 'g2']);
    await softDeleteLook(t.db, 'look-doomed', 2000);
    const after = await getPlanCore(t.db, p.plan.id);
    expect(after).not.toBeNull();
    expect(after!.lookMissing).toBe(true);
    expect(after!.outfitGarmentIds).toEqual(['g1', 'g2']); // 快照在，计划不丢
  });
});

describe('持久化（镜像字段 + 跨重启）', () => {
  it('dumpAll 含 plans；reopen 后计划与状态原样在', async () => {
    const p = await savePlanCore(t.db, { date: '2026-07-28', timeLabel: '白天', garmentIds: ['g1', 'g2'] });
    await recordWornCore(t.db, p.plan.id, { asPlanned: true, now: 5000 });
    const dump = await dumpAll(t.db);
    expect(dump.plans).toHaveLength(1);
    expect(dump.plans![0].status).toBe('completed');

    const t2 = await reopenDb(t);
    try {
      const plans = await plansForDateCore(t2.db, '2026-07-28');
      expect(plans).toHaveLength(1);
      expect(plans[0].status).toBe('completed');
      expect(plans[0].completedAt).toBe(5000);
    } finally {
      t2.close();
    }
  });
});
