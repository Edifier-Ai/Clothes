/**
 * @jest-environment node
 *
 * 旅行服务（MVP-010）RED 测试：真实 sqlite（better-sqlite3），不 mock 被测核心。
 *
 * 覆盖任务卡验收：
 * - 旅行保存目的地/当地日期范围/时区/活动/天气快照
 * - 每天多个造型（同日多时段）、缺省/显式 null 切换
 * - 关联造型展开快照、造型墓碑后快照保留 + missing
 * - 删除某日造型是墓碑、不动造型
 * - 记录实际已穿幂等（与计划同表分列）
 * - 跨重启持久化（镜像字段 + reopenDb）
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { openTestDb, reopenDb, type TestDb } from '../db/sqliteTestHelper';
import { createLook, dumpAll, softDeleteLook, type CreateLookInput } from '../db/dao';
import {
  deleteTripCore,
  deleteTripOutfitCore,
  getTripCore,
  listActiveTripsCore,
  listTripOutfitsCore,
  recordTripOutfitWornCore,
  saveTripCore,
  saveTripOutfitCore,
  updateTripStatusCore,
} from './tripService';

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

describe('saveTripCore / getTripCore / listActiveTripsCore', () => {
  it('保存旅行：目的地/日期范围/时区/活动/天气快照各字段就位', async () => {
    const trip = await saveTripCore(t.db, {
      name: '东京行',
      destination: '东京',
      startDate: '2026-09-01',
      endDate: '2026-09-05',
      timeZone: 'Asia/Tokyo',
      activities: [
        { date: '2026-09-01', timeLabel: '白天', note: '筑地市场' },
        { date: '2026-09-02', timeLabel: '晚餐', note: '银座寿司' },
      ],
      weatherSnapshot: {
        fetchedAt: 1000,
        minTempC: 18,
        maxTempC: 26,
        conditionCode: 'cloudy',
        provider: 'open-meteo',
        cityName: '东京',
      },
    });
    expect(trip.trip.name).toBe('东京行');
    expect(trip.trip.destination).toBe('东京');
    expect(trip.trip.startDate).toBe('2026-09-01');
    expect(trip.trip.endDate).toBe('2026-09-05');
    expect(trip.trip.timeZone).toBe('Asia/Tokyo');
    expect(trip.activities).toHaveLength(2);
    expect(trip.weatherSnapshot?.cityName).toBe('东京');
    expect(trip.weatherSnapshot?.maxTempC).toBe(26);

    const got = await getTripCore(t.db, trip.trip.id);
    expect(got!.trip.destination).toBe('东京');
    expect(got!.activities[0].note).toBe('筑地市场');
  });

  it('编辑旅行：保留未传字段，覆盖已传字段', async () => {
    const a = await saveTripCore(t.db, {
      name: '原计划',
      destination: '大阪',
      startDate: '2026-09-01',
      endDate: '2026-09-03',
      timeZone: 'Asia/Tokyo',
      activities: [],
    });
    const updated = await saveTripCore(t.db, {
      id: a.trip.id,
      name: '改名后的旅行',
      destination: '大阪',
      startDate: '2026-09-01',
      endDate: '2026-09-07',
      timeZone: 'Asia/Tokyo',
      activities: a.activities,
    });
    expect(updated.trip.name).toBe('改名后的旅行');
    expect(updated.trip.endDate).toBe('2026-09-07');
  });

  it('listActiveTripsCore 排除墓碑、按 updatedAt 倒序', async () => {
    const a = await saveTripCore(t.db, { name: 'A', destination: 'X', startDate: '2026-09-01', endDate: '2026-09-02', timeZone: 'UTC', activities: [] });
    await saveTripCore(t.db, { name: 'B', destination: 'Y', startDate: '2026-09-03', endDate: '2026-09-04', timeZone: 'UTC', activities: [] });
    await deleteTripCore(t.db, a.trip.id);
    const list = await listActiveTripsCore(t.db);
    expect(list.map((x) => x.trip.name)).toEqual(['B']);
  });

  it('删除是墓碑：列表消失但行保留', async () => {
    const a = await saveTripCore(t.db, { name: 'A', destination: 'X', startDate: '2026-09-01', endDate: '2026-09-02', timeZone: 'UTC', activities: [] });
    await deleteTripCore(t.db, a.trip.id);
    expect(await getTripCore(t.db, a.trip.id)).toBeNull();
    // 行还在（getAllTrips 通过 dumpAll 验证）
    const dump = await dumpAll(t.db);
    expect(dump.trips?.find((x) => x.id === a.trip.id)).toBeDefined();
  });

  it('updateTripStatusCore：planning → ongoing → completed → archived', async () => {
    const a = await saveTripCore(t.db, { name: 'A', destination: 'X', startDate: '2026-09-01', endDate: '2026-09-02', timeZone: 'UTC', activities: [] });
    await updateTripStatusCore(t.db, a.trip.id, 'ongoing');
    expect((await getTripCore(t.db, a.trip.id))!.trip.status).toBe('ongoing');
    await updateTripStatusCore(t.db, a.trip.id, 'completed');
    expect((await getTripCore(t.db, a.trip.id))!.trip.status).toBe('completed');
  });
});

describe('saveTripOutfitCore（每日造型安排）', () => {
  it('同日多时段独立：白天关联造型 + 晚餐临时组合', async () => {
    await seedLook('look-day', ['g1', 'g2']);
    const a = await saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '白天', lookId: 'look-day' });
    const b = await saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '晚餐', garmentIds: ['g3'] });
    expect(a.outfitGarmentIds).toEqual(['g1', 'g2']);
    expect(b.outfitGarmentIds).toEqual(['g3']);
    const list = await listTripOutfitsCore(t.db, 't1');
    expect(list).toHaveLength(2);
    expect(list.map((o) => o.tripOutfit.timeLabel).sort()).toEqual(['晚餐', '白天']);
  });

  it('关联造型时展开快照；临时组合直接用 garmentIds', async () => {
    await seedLook('look-a', ['g1', 'g2', 'g3']);
    const linked = await saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '白天', lookId: 'look-a' });
    expect(linked.outfitGarmentIds).toEqual(['g1', 'g2', 'g3']);
    expect(linked.tripOutfit.lookId).toBe('look-a');
    const adhoc = await saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '晚餐', garmentIds: ['g9'] });
    expect(adhoc.outfitGarmentIds).toEqual(['g9']);
    expect(adhoc.tripOutfit.lookId).toBeNull();
  });

  it('编辑：lookId 缺省保持关联；显式 null 改回临时组合', async () => {
    await seedLook('look-keep', ['g1', 'g2']);
    const p = await saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '白天', lookId: 'look-keep' });
    // 缺省：改备注不动关联
    const kept = await saveTripOutfitCore(t.db, { id: p.tripOutfit.id, tripId: 't1', date: '2026-09-01', timeLabel: '白天', note: '客户来访' });
    expect(kept.tripOutfit.lookId).toBe('look-keep');
    expect(kept.tripOutfit.note).toBe('客户来访');
    // 显式 null：改回临时组合
    const cleared = await saveTripOutfitCore(t.db, { id: p.tripOutfit.id, tripId: 't1', date: '2026-09-01', timeLabel: '白天', lookId: null, garmentIds: ['g7'] });
    expect(cleared.tripOutfit.lookId).toBeNull();
    expect(cleared.outfitGarmentIds).toEqual(['g7']);
  });

  it('关联造型不存在/墓碑 → 抛错（不静默写空快照）', async () => {
    await expect(
      saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '白天', lookId: 'look-missing' }),
    ).rejects.toThrow();
  });
});

describe('deleteTripOutfitCore（墓碑，不动造型）', () => {
  it('删除某日造型：列表消失但行保留，关联造型不动', async () => {
    await seedLook('look-x', ['g1']);
    const a = await saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '白天', lookId: 'look-x' });
    await deleteTripOutfitCore(t.db, a.tripOutfit.id);
    const list = await listTripOutfitsCore(t.db, 't1');
    expect(list).toHaveLength(0);
    // 造型仍在
    const look = await t.db.getLook('look-x');
    expect(look).not.toBeNull();
    expect(look!.deletedAt).toBeNull();
    // tripOutfit 行保留（dumpAll 含 tripOutfits，返回 Row 而非 Detail）
    const dump = await dumpAll(t.db);
    expect(dump.tripOutfits?.find((o) => o.id === a.tripOutfit.id)).toBeDefined();
  });
});

describe('快照与修复入口（关联造型墓碑后）', () => {
  it('造型墓碑后 tripOutfit 快照完整 + lookMissing=true', async () => {
    await seedLook('look-doomed', ['g1', 'g2']);
    await saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '白天', lookId: 'look-doomed' });
    await softDeleteLook(t.db, 'look-doomed', 2000);
    const list = await listTripOutfitsCore(t.db, 't1');
    expect(list).toHaveLength(1);
    expect(list[0].lookMissing).toBe(true);
    expect(list[0].outfitGarmentIds).toEqual(['g1', 'g2']); // 快照在
  });
});

describe('recordTripOutfitWornCore（实际已穿，幂等，与计划同表分列）', () => {
  it('按计划穿 → completed；二次记录 completedAt 不变', async () => {
    const p = await saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '白天', garmentIds: ['g1'] });
    const r1 = await recordTripOutfitWornCore(t.db, p.tripOutfit.id, { asPlanned: true, now: 5000 });
    expect(r1.tripOutfit.wornStatus).toBe('completed');
    expect(r1.tripOutfit.wornCompletedAt).toBe(5000);
    const r2 = await recordTripOutfitWornCore(t.db, p.tripOutfit.id, { asPlanned: true, now: 9999 });
    expect(r2.tripOutfit.wornStatus).toBe('completed');
    expect(r2.tripOutfit.wornCompletedAt).toBe(5000); // 幂等
  });

  it('有变化 → changed + 变化说明；同日另一项仍可独立记录', async () => {
    const a = await saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '白天', garmentIds: ['g1'] });
    const b = await saveTripOutfitCore(t.db, { tripId: 't1', date: '2026-09-01', timeLabel: '晚餐', garmentIds: ['g2'] });
    const r = await recordTripOutfitWornCore(t.db, a.tripOutfit.id, { asPlanned: false, changeNote: '临时换了外套', now: 6000 });
    expect(r.tripOutfit.wornStatus).toBe('changed');
    expect(r.tripOutfit.wornChangeNote).toBe('临时换了外套');
    const list = await listTripOutfitsCore(t.db, 't1');
    const other = list.find((o) => o.tripOutfit.id === b.tripOutfit.id)!;
    expect(other.tripOutfit.wornStatus).toBe('planned');
  });
});

describe('持久化（镜像字段 + 跨重启）', () => {
  it('dumpAll 含 trips/tripOutfits；reopen 后旅行与安排原样在', async () => {
    await seedLook('look-a', ['g1', 'g2']);
    const trip = await saveTripCore(t.db, { name: 'T', destination: 'D', startDate: '2026-09-01', endDate: '2026-09-03', timeZone: 'UTC', activities: [{ date: '2026-09-01', timeLabel: '白天', note: 'n' }] });
    const o = await saveTripOutfitCore(t.db, { tripId: trip.trip.id, date: '2026-09-01', timeLabel: '白天', lookId: 'look-a' });
    await recordTripOutfitWornCore(t.db, o.tripOutfit.id, { asPlanned: true, now: 5000 });

    const dump = await dumpAll(t.db);
    expect(dump.trips).toHaveLength(1);
    expect(dump.tripOutfits).toHaveLength(1);
    expect(dump.tripOutfits![0].wornStatus).toBe('completed');

    const t2 = await reopenDb(t);
    try {
      const list = await listTripOutfitsCore(t2.db, trip.trip.id);
      expect(list).toHaveLength(1);
      expect(list[0].tripOutfit.wornStatus).toBe('completed');
      expect(list[0].tripOutfit.wornCompletedAt).toBe(5000);
      const tr = await getTripCore(t2.db, trip.trip.id);
      expect(tr!.trip.name).toBe('T');
      expect(tr!.activities[0].note).toBe('n');
    } finally {
      t2.close();
    }
  });
});
