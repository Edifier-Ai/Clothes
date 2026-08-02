/**
 * @jest-environment node
 *
 * 打包清单服务（MVP-010）RED 测试：真实 sqlite（better-sqlite3），不 mock 被测核心。
 *
 * 覆盖任务卡验收：
 * - 五天十套造型中重复衣物只出现一次，显示被几套使用
 * - 反向验证：5 套同鞋 → 一项来源 5；移除一套 → 来源 4
 * - 手工项目不被重新生成覆盖
 * - 重新生成保留仍存在项目的勾选状态
 * - 删除某日造型后重算来源计数，不删手工项
 * - 缺失引用（衣物墓碑/归档）标 missing 不静默消失
 * - 勾选状态与衣物事实分离，勾选幂等
 * - 模板保存/列表/删除
 * - 跨重启持久化
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import { openTestDb, reopenDb, type TestDb } from '../db/sqliteTestHelper';
import { createLook, dumpAll, softDeleteLook, type CreateLookInput } from '../db/dao';
import { saveTripCore, saveTripOutfitCore, deleteTripOutfitCore } from './tripService';
import {
  addManualItemCore,
  listPackingItemsCore,
  listTemplatesCore,
  packingItemDetailViewCore,
  regeneratePackingCore,
  removeManualItemCore,
  saveTemplateCore,
  softDeleteTemplateCore,
  toggleCheckCore,
} from './packingService';

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

async function seedTrip(tripId = 'trip1'): Promise<string> {
  const trip = await saveTripCore(t.db, {
    id: tripId,
    name: 'T',
    destination: 'D',
    startDate: '2026-09-01',
    endDate: '2026-09-05',
    timeZone: 'UTC',
    activities: [],
  });
  return trip.trip.id;
}

describe('regeneratePackingCore（去重 + 来源计数）', () => {
  it('五天十套同一件鞋 → 一项 + 来源数 10（任务卡验收标准）', async () => {
    await seedTrip();
    await seedLook('look-shared', ['g-shoe']);
    // 5 天 × 2 时段 = 10 套，每套都用 look-shared（含 g-shoe）
    for (let d = 1; d <= 5; d++) {
      const date = `2026-09-${String(d).padStart(2, '0')}`;
      await saveTripOutfitCore(t.db, { tripId: 'trip1', date, timeLabel: '白天', lookId: 'look-shared' });
      await saveTripOutfitCore(t.db, { tripId: 'trip1', date, timeLabel: '晚餐', lookId: 'look-shared' });
    }
    await regeneratePackingCore(t.db, 'trip1');
    const items = await listPackingItemsCore(t.db, 'trip1');
    const shoe = items.find((i) => i.garmentId === 'g-shoe')!;
    expect(shoe).toBeDefined();
    expect(shoe.sourceCount).toBe(10);
    expect(shoe.kind).toBe('garment');
    // 只一项（每套都同一件鞋）
    const garmentItems = items.filter((i) => i.kind === 'garment');
    expect(garmentItems).toHaveLength(1);
  });

  it('反向验证：5 套造型同鞋 → 一项来源 5；移除一套后来源 4（任务卡锚点）', async () => {
    await seedTrip();
    await seedLook('look-shoe', ['g-shoe']);
    const outfitIds: string[] = [];
    for (let d = 1; d <= 5; d++) {
      const o = await saveTripOutfitCore(t.db, {
        tripId: 'trip1',
        date: `2026-09-${String(d).padStart(2, '0')}`,
        timeLabel: '白天',
        lookId: 'look-shoe',
      });
      outfitIds.push(o.tripOutfit.id);
    }
    await regeneratePackingCore(t.db, 'trip1');
    let items = await listPackingItemsCore(t.db, 'trip1');
    expect(items).toHaveLength(1);
    expect(items[0].garmentId).toBe('g-shoe');
    expect(items[0].sourceCount).toBe(5);

    // 移除一套（墓碑）
    await deleteTripOutfitCore(t.db, outfitIds[0]);
    await regeneratePackingCore(t.db, 'trip1');
    items = await listPackingItemsCore(t.db, 'trip1');
    expect(items).toHaveLength(1);
    expect(items[0].sourceCount).toBe(4);
  });

  it('去重幂等：同一衣物重复 regenerate 不产生重复项', async () => {
    await seedTrip();
    await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-01', timeLabel: '白天', garmentIds: ['g1', 'g2'] });
    await regeneratePackingCore(t.db, 'trip1');
    await regeneratePackingCore(t.db, 'trip1');
    await regeneratePackingCore(t.db, 'trip1');
    const items = await listPackingItemsCore(t.db, 'trip1');
    expect(items).toHaveLength(2);
  });
});

describe('手工项目（不被重新生成覆盖）', () => {
  it('addManualItemCore / removeManualItemCore', async () => {
    await seedTrip();
    const m = await addManualItemCore(t.db, { tripId: 'trip1', label: '牙刷' });
    expect(m.label).toBe('牙刷');
    expect(m.kind).toBe('manual');
    let items = await listPackingItemsCore(t.db, 'trip1');
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe('牙刷');

    await removeManualItemCore(t.db, m.id);
    items = await listPackingItemsCore(t.db, 'trip1');
    expect(items).toHaveLength(0);
  });

  it('重新生成不动手工项（手工项与造型互不覆盖）', async () => {
    await seedTrip();
    await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-01', timeLabel: '白天', garmentIds: ['g1'] });
    await addManualItemCore(t.db, { tripId: 'trip1', label: '牙刷' });
    await addManualItemCore(t.db, { tripId: 'trip1', label: '充电器' });
    await regeneratePackingCore(t.db, 'trip1');
    const items = await listPackingItemsCore(t.db, 'trip1');
    expect(items).toHaveLength(3);
    const manuals = items.filter((i) => i.kind === 'manual');
    expect(manuals.map((m) => m.label).sort()).toEqual(['充电器', '牙刷']);
  });

  it('删除某日造型后重算来源计数，不删手工项', async () => {
    await seedTrip();
    await seedLook('look-x', ['g1', 'g2']);
    const o1 = await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-01', timeLabel: '白天', lookId: 'look-x' });
    await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-02', timeLabel: '白天', lookId: 'look-x' });
    await addManualItemCore(t.db, { tripId: 'trip1', label: '牙刷' });
    await regeneratePackingCore(t.db, 'trip1');
    let items = await listPackingItemsCore(t.db, 'trip1');
    expect(items.find((i) => i.garmentId === 'g1')!.sourceCount).toBe(2);
    expect(items.find((i) => i.label === '牙刷')).toBeDefined();

    // 删除第一套（9-01），重算后 g1 来源数 1
    await deleteTripOutfitCore(t.db, o1.tripOutfit.id);
    await regeneratePackingCore(t.db, 'trip1');
    items = await listPackingItemsCore(t.db, 'trip1');
    expect(items.find((i) => i.garmentId === 'g1')!.sourceCount).toBe(1);
    // 手工项仍在
    expect(items.find((i) => i.label === '牙刷')).toBeDefined();
  });
});

describe('勾选状态（与衣物事实分离，幂等）', () => {
  it('toggleCheckCore：勾选/取消，幂等不改时间', async () => {
    await seedTrip();
    await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-01', timeLabel: '白天', garmentIds: ['g1'] });
    await regeneratePackingCore(t.db, 'trip1');
    let items = await listPackingItemsCore(t.db, 'trip1');
    const id = items[0].id;
    const r1 = await toggleCheckCore(t.db, id, true, 5000);
    expect(r1.checked).toBe(true);
    expect(r1.checkedAt).toBe(5000);
    // 重复勾选不改时间
    const r2 = await toggleCheckCore(t.db, id, true, 9999);
    expect(r2.checked).toBe(true);
    expect(r2.checkedAt).toBe(5000);
    // 取消
    const r3 = await toggleCheckCore(t.db, id, false, 8000);
    expect(r3.checked).toBe(false);
  });

  it('重新生成保留仍存在项目的勾选状态', async () => {
    await seedTrip();
    await seedLook('look-keep', ['g1', 'g2']);
    await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-01', timeLabel: '白天', lookId: 'look-keep' });
    await regeneratePackingCore(t.db, 'trip1');
    let items = await listPackingItemsCore(t.db, 'trip1');
    const g1Id = items.find((i) => i.garmentId === 'g1')!.id;
    await toggleCheckCore(t.db, g1Id, true, 5000);

    // 再安排一套仍含 g1，重新生成 → g1 项保留勾选状态
    await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-02', timeLabel: '白天', lookId: 'look-keep' });
    await regeneratePackingCore(t.db, 'trip1');
    items = await listPackingItemsCore(t.db, 'trip1');
    const g1After = items.find((i) => i.garmentId === 'g1')!;
    expect(g1After.checked).toBe(true);
    expect(g1After.checkedAt).toBe(5000);
    expect(g1After.sourceCount).toBe(2); // 来源数已更新
  });

  it('勾选手工项独立于衣物项', async () => {
    await seedTrip();
    await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-01', timeLabel: '白天', garmentIds: ['g1'] });
    await addManualItemCore(t.db, { tripId: 'trip1', label: '牙刷' });
    await regeneratePackingCore(t.db, 'trip1');
    const items = await listPackingItemsCore(t.db, 'trip1');
    const g1 = items.find((i) => i.garmentId === 'g1')!;
    const brush = items.find((i) => i.label === '牙刷')!;
    await toggleCheckCore(t.db, g1.id, true, 1000);
    // 牙刷未勾
    expect((await listPackingItemsCore(t.db, 'trip1')).find((i) => i.id === brush.id)!.checked).toBe(false);
    await toggleCheckCore(t.db, brush.id, true, 2000);
    expect((await listPackingItemsCore(t.db, 'trip1')).find((i) => i.id === brush.id)!.checked).toBe(true);
  });
});

describe('缺失引用（衣物墓碑/归档）标 missing 不消失', () => {
  it('衣物不存在/墓碑/归档 → packing_item 仍存在并标 missing（不静默消失）', async () => {
    await seedTrip();
    // g1 未在 garments 表录入 → packing_item 标 missing
    await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-01', timeLabel: '白天', garmentIds: ['g1'] });
    await regeneratePackingCore(t.db, 'trip1');
    const items = await listPackingItemsCore(t.db, 'trip1');
    expect(items).toHaveLength(1); // 仍在清单，不静默消失
    const detail = await packingItemDetailViewCore(t.db, items[0].id);
    expect(detail!.missing).toBe(true);
  });

  it('关联造型墓碑后 packing_item 由快照支撑，仍可显示', async () => {
    await seedTrip();
    await seedLook('look-doomed', ['g1', 'g2']);
    await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-01', timeLabel: '白天', lookId: 'look-doomed' });
    await regeneratePackingCore(t.db, 'trip1');
    let items = await listPackingItemsCore(t.db, 'trip1');
    expect(items).toHaveLength(2); // g1, g2 仍在清单
    await softDeleteLook(t.db, 'look-doomed', 2000);
    // 重新生成：造型墓碑后 tripOutfit 快照仍在，g1/g2 仍在清单
    await regeneratePackingCore(t.db, 'trip1');
    items = await listPackingItemsCore(t.db, 'trip1');
    expect(items).toHaveLength(2);
  });
});

describe('模板（复盘后保存）', () => {
  it('saveTemplateCore / listTemplatesCore / softDeleteTemplateCore', async () => {
    await saveTemplateCore(t.db, {
      name: '出差基础包',
      sourceTripId: null,
      items: [
        { kind: 'manual', label: '牙刷', garmentId: null },
        { kind: 'manual', label: '充电器', garmentId: null },
      ],
    });
    let list = await listTemplatesCore(t.db);
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('出差基础包');
    expect(list[0].items).toHaveLength(2);

    await softDeleteTemplateCore(t.db, list[0].id);
    list = await listTemplatesCore(t.db);
    expect(list).toHaveLength(0);
  });
});

describe('持久化（镜像字段 + 跨重启）', () => {
  it('dumpAll 含 packingItems/tripTemplates；reopen 后清单与勾选原样在', async () => {
    await seedTrip();
    await saveTripOutfitCore(t.db, { tripId: 'trip1', date: '2026-09-01', timeLabel: '白天', garmentIds: ['g1'] });
    await addManualItemCore(t.db, { tripId: 'trip1', label: '牙刷' });
    await regeneratePackingCore(t.db, 'trip1');
    const items = await listPackingItemsCore(t.db, 'trip1');
    await toggleCheckCore(t.db, items[0].id, true, 5000);
    await saveTemplateCore(t.db, { name: '模板A', sourceTripId: 'trip1', items: [{ kind: 'manual', label: 'X', garmentId: null }] });

    const dump = await dumpAll(t.db);
    expect(dump.packingItems).toBeDefined();
    expect(dump.packingItems!.length).toBeGreaterThan(0);
    expect(dump.tripTemplates).toBeDefined();
    expect(dump.tripTemplates).toHaveLength(1);

    const t2 = await reopenDb(t);
    try {
      const items2 = await listPackingItemsCore(t2.db, 'trip1');
      expect(items2).toHaveLength(items.length);
      const checked = items2.find((i) => i.checked);
      expect(checked).toBeDefined();
      expect(checked!.checkedAt).toBe(5000);
      const templates = await listTemplatesCore(t2.db);
      expect(templates).toHaveLength(1);
    } finally {
      t2.close();
    }
  });
});
