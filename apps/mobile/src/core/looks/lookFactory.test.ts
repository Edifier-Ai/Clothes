/**
 * @jest-environment node
 *
 * 变体与克隆工厂（MVP-008）：
 * - createVariant 只替换指定单品，其余几何/层级原样拷贝，source_look_id=原造型；
 * - cloneLook 全量拷贝，source_look_id=NULL；
 * - 二者都不得修改输入。
 */
import { beforeEach, describe, expect, it } from '@jest/globals';

import type { LookItemRow, LookRow } from '../db/schema';
import { cloneLook, createVariant } from './lookFactory';

const look: LookRow = {
  id: 'look-1',
  name: '通勤造型',
  mode: 'slots',
  sourceLookId: null,
  coverRelPath: 'covers/look-1.png',
  createdAt: 1_000,
  updatedAt: 2_000,
  deletedAt: null,
};

const items: LookItemRow[] = [
  { id: 'i1', lookId: 'look-1', garmentId: 'g-top', slot: 'top', x: 0.5, y: 0.25, scale: 1, rotation: 0, zIndex: 0, ord: 0 },
  { id: 'i2', lookId: 'look-1', garmentId: 'g-bottom', slot: 'bottom', x: 0.5, y: 0.6, scale: 1.2, rotation: 0.1, zIndex: 1, ord: 0 },
  { id: 'i3', lookId: 'look-1', garmentId: 'g-shoes', slot: 'shoes', x: 0.4, y: 0.9, scale: 0.8, rotation: -0.2, zIndex: 2, ord: 0 },
];

let seq = 0;
const deps = { newId: () => `new-${++seq}`, now: 9_999 };

beforeEach(() => {
  seq = 0;
});

describe('createVariant', () => {
  it('按 garmentId 只替换指定单品，其余几何/层级原样，关联原造型', () => {
    const v = createVariant(look, items, { garmentId: 'g-top', newGarmentId: 'g-top-2' }, deps);
    expect(v.look.id).toBe('new-1');
    expect(v.look.sourceLookId).toBe('look-1');
    expect(v.look.mode).toBe('slots');
    expect(v.look.createdAt).toBe(9_999);
    expect(v.look.updatedAt).toBe(9_999);
    expect(v.look.deletedAt).toBeNull();
    expect(v.items).toHaveLength(3);
    // 只换 top：其余 garmentId 与几何/层级原样
    expect(v.items[0]).toMatchObject({ garmentId: 'g-top-2', slot: 'top', x: 0.5, y: 0.25, zIndex: 0 });
    expect(v.items[1]).toMatchObject({ garmentId: 'g-bottom', scale: 1.2, rotation: 0.1, zIndex: 1 });
    expect(v.items[2]).toMatchObject({ garmentId: 'g-shoes', scale: 0.8, rotation: -0.2, zIndex: 2 });
    // 新 items 归属新造型且有新 id
    expect(v.items.every((i) => i.lookId === 'new-1')).toBe(true);
    expect(v.items.map((i) => i.id)).not.toContain('i1');
  });

  it('按 slot 替换；找不到目标抛错（不伪造变体）', () => {
    const v = createVariant(look, items, { slot: 'shoes', newGarmentId: 'g-shoes-2' }, deps);
    expect(v.items.find((i) => i.slot === 'shoes')?.garmentId).toBe('g-shoes-2');
    expect(() => createVariant(look, items, { slot: 'outerwear', newGarmentId: 'g-x' }, deps)).toThrow();
    expect(() => createVariant(look, items, { garmentId: 'g-none', newGarmentId: 'g-x' }, deps)).toThrow();
  });

  it('不修改输入：原造型与原 items 保持原值', () => {
    const itemsCopy = JSON.parse(JSON.stringify(items)) as LookItemRow[];
    createVariant(look, items, { garmentId: 'g-top', newGarmentId: 'g-top-2' }, deps);
    expect(items).toEqual(itemsCopy);
    expect(look.sourceLookId).toBeNull();
    expect(look.id).toBe('look-1');
  });
});

describe('cloneLook', () => {
  it('全量拷贝，source_look_id 为 NULL，不修改输入', () => {
    const variantLook: LookRow = { ...look, id: 'look-v', sourceLookId: 'look-1' };
    const c = cloneLook(variantLook, items, deps);
    expect(c.look.id).toBe('new-1');
    expect(c.look.sourceLookId).toBeNull();
    expect(c.look.name).toBe('通勤造型');
    expect(c.items).toHaveLength(3);
    expect(c.items.map((i) => i.garmentId)).toEqual(['g-top', 'g-bottom', 'g-shoes']);
    expect(c.items.map((i) => [i.x, i.y, i.scale, i.rotation, i.zIndex, i.ord])).toEqual(
      items.map((i) => [i.x, i.y, i.scale, i.rotation, i.zIndex, i.ord]),
    );
    expect(c.items.every((i) => i.lookId === 'new-1')).toBe(true);
    // 输入不变
    expect(variantLook.sourceLookId).toBe('look-1');
    expect(items[0].lookId).toBe('look-1');
  });
});
