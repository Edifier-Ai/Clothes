/**
 * @jest-environment node
 *
 * MVP-008 造型（looks / look_items）持久层测试：
 * - schema v7 迁移幂等、v5→v7 升级保留既有数据（含 v7 plans 表可用）；
 * - createLook 事务（look + items）、排序（z_index, ord）、墓碑与镜像往返。
 */
import { describe, expect, it } from '@jest/globals';

import {
  createGarment,
  createLook,
  createPlan,
  dumpAll,
  getLookWithItems,
  listLooksWithItems,
  replaceAll,
  softDeleteLook,
  updateLookRow,
} from './dao';
import { runMigrations, SCHEMA_VERSION } from './migrations';
import { openTestDb, openTestDbAtVersion, reopenDb } from './sqliteTestHelper';

function garment(id: string) {
  return {
    id,
    name: `衣物${id}`,
    category: 'top' as const,
    asset: {
      id: `${id}-asset`,
      originalRelPath: `originals/${id}.jpg`,
      sha256: `hash-${id}`,
      width: 100,
      height: 200,
      bytes: 1234,
      mimeType: 'image/jpeg',
    },
    now: 1_000,
  };
}

function lookInput(id: string, now = 1_000) {
  return {
    id,
    name: '通勤造型',
    mode: 'slots' as const,
    items: [
      { id: `${id}-i1`, garmentId: 'g1', slot: 'top' as const, x: 0.5, y: 0.25, scale: 1, rotation: 0, zIndex: 2, ord: 0 },
      { id: `${id}-i2`, garmentId: 'g2', slot: 'bottom' as const, x: 0.5, y: 0.6, scale: 1, rotation: 0, zIndex: 0, ord: 1 },
      { id: `${id}-i3`, garmentId: 'g3', slot: 'shoes' as const, x: 0.5, y: 0.9, scale: 0.8, rotation: 0.1, zIndex: 0, ord: 0 },
    ],
    now,
  };
}

describe('schema v8 迁移', () => {
  it('新库版本号为 8，重复运行幂等', async () => {
    const t = await openTestDb();
    expect(SCHEMA_VERSION).toBe(8);
    expect(await t.adapter.scalarInt("SELECT value FROM __clothes_meta WHERE key='schema_version'")).toBe(8);
    const res = await runMigrations(t.adapter, {});
    expect(res.from).toBe(8);
    expect(res.to).toBe(8);
    t.close();
  });

  it('v5 → v8 升级：既有衣物数据保留，新增 looks/look_items 与 plans 表可用', async () => {
    const t = await openTestDbAtVersion(5);
    await createGarment(t.db, garment('g1'));
    expect(await t.adapter.scalarInt("SELECT value FROM __clothes_meta WHERE key='schema_version'")).toBe(5);

    const res = await runMigrations(t.adapter, {});
    expect(res.from).toBe(5);
    expect(res.to).toBe(8);

    // 既有数据保留
    expect((await t.db.getGarment('g1'))?.name).toBe('衣物g1');
    // 新表可写
    await createLook(t.db, lookInput('l1'));
    const detail = await getLookWithItems(t.db, 'l1');
    expect(detail?.look.name).toBe('通勤造型');
    expect(detail?.items).toHaveLength(3);
    // v7 plans 表可写
    await createPlan(t.db, {
      id: 'p1',
      date: '2026-07-28',
      timeLabel: '白天',
      outfitGarmentIds: ['g1'],
      now: 1_000,
    });
    expect((await t.db.getPlan('p1'))?.timeLabel).toBe('白天');
    t.close();
  });
});

describe('look DAO：事务、排序与墓碑', () => {
  it('createLook 在同一事务写入 look + items；getLookItems 按 (z_index, ord) 升序', async () => {
    const t = await openTestDb();
    await createLook(t.db, lookInput('l1'));
    const detail = await getLookWithItems(t.db, 'l1');
    expect(detail?.look.mode).toBe('slots');
    // 排序：zIndex 0 的两条按 ord 升序在前，zIndex 2 最后
    expect(detail?.items.map((i) => i.id)).toEqual(['l1-i3', 'l1-i2', 'l1-i1']);
    expect(detail?.items[2].rotation).toBe(0);
    t.close();
  });

  it('事务回滚：item 写入失败时不留 look 半条记录', async () => {
    const t = await openTestDb();
    const bad = lookInput('l9');
    (bad.items[0] as Record<string, unknown>).garmentId = null; // 触发 NOT NULL 失败
    await expect(createLook(t.db, bad)).rejects.toThrow();
    expect(t.raw.prepare("SELECT count(*) c FROM looks WHERE id='l9'").get()).toEqual({ c: 0 });
    expect(t.raw.prepare("SELECT count(*) c FROM look_items WHERE look_id='l9'").get()).toEqual({ c: 0 });
    t.close();
  });

  it('canvas 模式：slot 为 NULL，几何字段完整落库', async () => {
    const t = await openTestDb();
    await createLook(t.db, {
      id: 'lc',
      name: '自由画布',
      mode: 'canvas',
      items: [
        { id: 'lc-i1', garmentId: 'g1', slot: null, x: 0.1, y: 0.2, scale: 1.5, rotation: 0.5, zIndex: 0, ord: 0 },
      ],
      now: 1_000,
    });
    const detail = await getLookWithItems(t.db, 'lc');
    expect(detail?.items[0].slot).toBeNull();
    expect(detail?.items[0].scale).toBe(1.5);
    expect(detail?.items[0].rotation).toBe(0.5);
    t.close();
  });

  it('listLooks 排除墓碑、按 updatedAt 倒序', async () => {
    const t = await openTestDb();
    await createLook(t.db, { ...lookInput('l1', 1_000), name: '旧造型' });
    await createLook(t.db, { ...lookInput('l2', 3_000), name: '新造型' });
    await createLook(t.db, { ...lookInput('l3', 2_000), name: '将删造型' });
    await softDeleteLook(t.db, 'l3', 4_000);

    const list = await listLooksWithItems(t.db);
    expect(list.map((l) => l.look.id)).toEqual(['l2', 'l1']);
    expect(list[0].items).toHaveLength(3);
    // 墓碑行仍在（不物理删除）
    expect(t.raw.prepare("SELECT deleted_at d FROM looks WHERE id='l3'").get()).toEqual({ d: 4_000 });
    expect(t.raw.prepare("SELECT count(*) c FROM look_items WHERE look_id='l3'").get()).toEqual({ c: 3 });
    t.close();
  });

  it('updateLookRow：改名 + 整体替换 items；updatedAt 刷新', async () => {
    const t = await openTestDb();
    await createLook(t.db, lookInput('l1', 1_000));
    await updateLookRow(t.db, 'l1', {
      name: '周末造型',
      items: [
        { id: 'l1-n1', garmentId: 'g9', slot: 'dress', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 0, ord: 0 },
      ],
    }, 5_000);
    const detail = await getLookWithItems(t.db, 'l1');
    expect(detail?.look.name).toBe('周末造型');
    expect(detail?.look.updatedAt).toBe(5_000);
    expect(detail?.items.map((i) => i.id)).toEqual(['l1-n1']);
    expect(t.raw.prepare("SELECT count(*) c FROM look_items WHERE look_id='l1'").get()).toEqual({ c: 1 });
    t.close();
  });

  it('软删除后 getLookWithItems 返回 null，但墓碑可从全量 dump 读到', async () => {
    const t = await openTestDb();
    await createLook(t.db, lookInput('l1'));
    await softDeleteLook(t.db, 'l1', 2_000);
    expect(await getLookWithItems(t.db, 'l1')).toBeNull();
    const dump = await dumpAll(t.db);
    expect(dump.looks).toHaveLength(1);
    expect(dump.looks?.[0].deletedAt).toBe(2_000);
    expect(dump.lookItems).toHaveLength(3);
    t.close();
  });
});

describe('look 镜像往返（dump/replaceAll）', () => {
  it('looks/lookItems 随 GarmentDump 全量往返（含墓碑与几何）', async () => {
    const t = await openTestDb();
    await createLook(t.db, lookInput('l1', 1_000));
    await createLook(t.db, { ...lookInput('l2', 2_000), name: '变体', sourceLookId: 'l1' });
    await softDeleteLook(t.db, 'l2', 3_000);
    const dump = await dumpAll(t.db);
    expect(dump.looks).toHaveLength(2);
    expect(dump.lookItems).toHaveLength(6);

    await replaceAll(t.db, { garments: [], assets: [], tags: [] });
    expect(await dumpAll(t.db)).toMatchObject({ looks: [], lookItems: [] });

    await replaceAll(t.db, dump);
    const restored = await getLookWithItems(t.db, 'l1');
    expect(restored?.items.map((i) => i.id)).toEqual(['l1-i3', 'l1-i2', 'l1-i1']);
    expect(restored?.items[2].x).toBe(0.5);
    const dump2 = await dumpAll(t.db);
    expect(dump2.looks?.find((l) => l.id === 'l2')?.sourceLookId).toBe('l1');
    expect(dump2.looks?.find((l) => l.id === 'l2')?.deletedAt).toBe(3_000);
    t.close();
  });

  it('旧镜像无 looks 字段：按空处理且不报错', async () => {
    const t = await openTestDb();
    await createLook(t.db, lookInput('l1'));
    await replaceAll(t.db, { garments: [], assets: [], tags: [] });
    const dump = await dumpAll(t.db);
    expect(dump.looks).toEqual([]);
    expect(dump.lookItems).toEqual([]);
    t.close();
  });

  it('重启持久：关闭重开同一文件后造型数据一致', async () => {
    const t = await openTestDb();
    await createLook(t.db, lookInput('l1'));
    const reopened = await reopenDb(t);
    const detail = await getLookWithItems(reopened.db, 'l1');
    expect(detail?.look.name).toBe('通勤造型');
    expect(detail?.items).toHaveLength(3);
    reopened.close();
  });
});
