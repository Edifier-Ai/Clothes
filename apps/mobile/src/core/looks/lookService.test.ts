/**
 * @jest-environment node
 *
 * lookService 持久层（MVP-008）：upsert、软删、草稿 meta 持久、变体/克隆、
 * 封面 spec 从 DB 事实重建。host 以 openTestDb（真实 better-sqlite3）
 * 直测可注入 Core 函数——与设备单例同一代码路径，不 mock 被测核心。
 */
import { describe, expect, it } from '@jest/globals';

import { createGarment, dumpAll } from '../db/dao';
import { openTestDb, reopenDb } from '../db/sqliteTestHelper';
import { archiveGarment } from '../wardrobe/status';
import {
  clearDraftCore,
  cloneLookByIdCore,
  createVariantLookCore,
  deleteLookCore,
  DRAFT_META_KEY,
  getLookDetailCore,
  listLooksCore,
  loadDraftCore,
  rebuildCoverSpecCore,
  saveDraftCore,
  saveLookCore,
} from './lookService';

function garment(id: string, category: 'top' | 'bottom' | 'shoes' | 'dress' = 'top') {
  return {
    id,
    name: `衣物${id}`,
    category,
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

const items = (lookPrefix: string) => [
  { id: `${lookPrefix}-i1`, garmentId: 'g1', slot: 'top' as const, x: 0.5, y: 0.25, scale: 1, rotation: 0, zIndex: 0, ord: 0 },
  { id: `${lookPrefix}-i2`, garmentId: 'g2', slot: 'bottom' as const, x: 0.5, y: 0.6, scale: 1, rotation: 0, zIndex: 1, ord: 0 },
  { id: `${lookPrefix}-i3`, garmentId: 'g3', slot: 'shoes' as const, x: 0.5, y: 0.9, scale: 1, rotation: 0, zIndex: 2, ord: 0 },
];

async function seedGarments(db: import('../db/dao').GarmentDb) {
  await createGarment(db, garment('g1'));
  await createGarment(db, garment('g2', 'bottom'));
  await createGarment(db, garment('g3', 'shoes'));
  await createGarment(db, garment('g4', 'dress'));
}

describe('saveLookCore：upsert + 事务', () => {
  it('新建后同 id 再保存为更新：改名、整体替换 items、不产生第二条', async () => {
    const t = await openTestDb();
    await seedGarments(t.db);
    const created = await saveLookCore(t.db, { id: 'l1', name: '通勤造型', mode: 'slots', items: items('l1') });
    expect(created.look.name).toBe('通勤造型');
    expect(created.items).toHaveLength(3);

    const updated = await saveLookCore(t.db, {
      id: 'l1',
      name: '周末造型',
      mode: 'slots',
      items: [{ id: 'l1-n1', garmentId: 'g4', slot: 'dress', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 0, ord: 0 }],
    });
    expect(updated.look.name).toBe('周末造型');
    expect(updated.items.map((i) => i.garmentId)).toEqual(['g4']);
    expect(updated.look.updatedAt).toBeGreaterThanOrEqual(updated.look.createdAt);
    expect(await listLooksCore(t.db)).toHaveLength(1);
    t.close();
  });

  it('缺 id 时生成新 id（uuidv7）', async () => {
    const t = await openTestDb();
    await seedGarments(t.db);
    const created = await saveLookCore(t.db, { name: '无 id 造型', mode: 'canvas', items: items('x') });
    expect(created.look.id).toMatch(/^[0-9a-f-]{36}$/);
    t.close();
  });
});

describe('deleteLookCore：软删', () => {
  it('软删后详情 null、列表排除，墓碑随 dump 保留', async () => {
    const t = await openTestDb();
    await seedGarments(t.db);
    await saveLookCore(t.db, { id: 'l1', name: 'A', mode: 'slots', items: items('l1') });
    await saveLookCore(t.db, { id: 'l2', name: 'B', mode: 'slots', items: items('l2') });
    await deleteLookCore(t.db, 'l1');

    expect(await getLookDetailCore(t.db, 'l1')).toBeNull();
    expect((await listLooksCore(t.db)).map((l) => l.look.id)).toEqual(['l2']);
    const dump = await dumpAll(t.db);
    expect(dump.looks?.find((l) => l.id === 'l1')?.deletedAt).not.toBeNull();
    expect(dump.lookItems?.filter((i) => i.lookId === 'l1')).toHaveLength(3);
    t.close();
  });
});

describe('草稿：meta 键持久', () => {
  const draft = {
    mode: 'canvas' as const,
    name: '未命名造型',
    items: [
      { id: 'i1', garmentId: 'g1', slot: null, x: 0.3, y: 0.4, scale: 1.2, rotation: 0.5, zIndex: 0, ord: 0 },
    ],
    updatedAt: 12_345,
  };

  it('save/load/clear；写入 meta 键 look_draft；重启（reopenDb）后仍可恢复', async () => {
    const t = await openTestDb();
    expect(await loadDraftCore(t.db)).toBeNull();

    await saveDraftCore(t.db, draft);
    expect(await t.db.getMeta(DRAFT_META_KEY)).toContain('"mode":"canvas"');
    expect(await loadDraftCore(t.db)).toEqual(draft);

    const reopened = await reopenDb(t);
    expect(await loadDraftCore(reopened.db)).toEqual(draft);

    await clearDraftCore(reopened.db);
    expect(await loadDraftCore(reopened.db)).toBeNull();
    reopened.close();
  });
});

describe('变体与克隆（service 层）', () => {
  it('createVariantLookCore：只换指定单品、source_look_id 关联原造型、原造型不变', async () => {
    const t = await openTestDb();
    await seedGarments(t.db);
    await saveLookCore(t.db, { id: 'l1', name: '通勤造型', mode: 'slots', items: items('l1') });

    const v = await createVariantLookCore(t.db, 'l1', { garmentId: 'g2', newGarmentId: 'g4' });
    expect(v.look.sourceLookId).toBe('l1');
    expect(v.items.find((i) => i.slot === 'bottom')?.garmentId).toBe('g4');
    expect(v.items.find((i) => i.slot === 'top')?.garmentId).toBe('g1');
    expect(v.items.find((i) => i.slot === 'top')).toMatchObject({ x: 0.5, y: 0.25, zIndex: 0 });

    // 原造型不变
    const orig = await getLookDetailCore(t.db, 'l1');
    expect(orig?.items.map((i) => i.garmentId)).toEqual(['g1', 'g2', 'g3']);
    expect(orig?.look.sourceLookId).toBeNull();
    t.close();
  });

  it('cloneLookByIdCore：全量拷贝、source_look_id 为 NULL、原造型不变', async () => {
    const t = await openTestDb();
    await seedGarments(t.db);
    await saveLookCore(t.db, { id: 'l1', name: '通勤造型', mode: 'slots', items: items('l1') });
    const v = await createVariantLookCore(t.db, 'l1', { garmentId: 'g2', newGarmentId: 'g4' });

    const c = await cloneLookByIdCore(t.db, v.look.id);
    expect(c.look.sourceLookId).toBeNull();
    expect(c.items.map((i) => i.garmentId).sort()).toEqual(['g1', 'g3', 'g4']);
    expect((await listLooksCore(t.db))).toHaveLength(3);
    // 被克隆的变体仍保留其关联
    expect((await getLookDetailCore(t.db, v.look.id))?.look.sourceLookId).toBe('l1');
    t.close();
  });
});

describe('rebuildCoverSpecCore：从 DB 事实重建', () => {
  it('正常衣物出图；归档/缺图衣物以 null 占位且不丢项；结果确定性', async () => {
    const t = await openTestDb();
    await seedGarments(t.db);
    await archiveGarment(t.db, 'g2', 2_000); // 归档 → 占位
    await saveLookCore(t.db, { id: 'l1', name: 'A', mode: 'slots', items: items('l1') });

    const spec = await rebuildCoverSpecCore(t.db, 'l1');
    expect(spec).not.toBeNull();
    expect(spec!.lookId).toBe('l1');
    expect(spec!.items.map((i) => i.imageRelPath)).toEqual([
      'originals/g1.jpg',
      null, // g2 已归档
      'originals/g3.jpg',
    ]);
    expect(spec!.items[1]).toMatchObject({ x: 0.5, y: 0.6, scale: 1, rotation: 0 });

    const again = await rebuildCoverSpecCore(t.db, 'l1');
    expect(JSON.stringify(again)).toBe(JSON.stringify(spec));
    t.close();
  });

  it('造型不存在（或已软删）返回 null', async () => {
    const t = await openTestDb();
    expect(await rebuildCoverSpecCore(t.db, 'nope')).toBeNull();
    t.close();
  });
});
