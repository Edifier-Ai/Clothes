/**
 * @jest-environment node
 *
 * 画布草稿（MVP-008）：崩溃重启可恢复最近草稿。
 * parseDraft 容错：坏 JSON / 缺字段 / 非法值返回 null，不崩。
 */
import { describe, expect, it } from '@jest/globals';

import type { LookItemGeom } from './geometry';
import { parseDraft, serializeDraft, type LookDraft } from './draft';

function draft(): LookDraft {
  const items: LookItemGeom[] = [
    { id: 'i1', garmentId: 'g1', slot: null, x: 0.3, y: 0.4, scale: 1.2, rotation: 0.5, zIndex: 0, ord: 0 },
  ];
  return { mode: 'canvas', name: '未命名造型', items, updatedAt: 12_345 };
}

describe('draft 序列化', () => {
  it('serialize → parse 往返无损', () => {
    const d = draft();
    expect(parseDraft(serializeDraft(d))).toEqual(d);
  });

  it('slots 模式草稿同样往返', () => {
    const d: LookDraft = {
      mode: 'slots',
      name: '通勤',
      items: [
        { id: 'i1', garmentId: 'g1', slot: 'top', x: 0.5, y: 0.5, scale: 1, rotation: 0, zIndex: 0, ord: 0 },
      ],
      updatedAt: 1,
    };
    expect(parseDraft(serializeDraft(d))).toEqual(d);
  });
});

describe('parseDraft 容错', () => {
  it('坏 JSON / 非对象 / 缺字段 / 非法 mode 均返回 null', () => {
    expect(parseDraft('not-json')).toBeNull();
    expect(parseDraft('')).toBeNull();
    expect(parseDraft('42')).toBeNull();
    expect(parseDraft('null')).toBeNull();
    expect(parseDraft('{"mode":"canvas"}')).toBeNull(); // 缺 name/items/updatedAt
    expect(parseDraft(JSON.stringify({ mode: 'weird', name: 'n', items: [], updatedAt: 1 }))).toBeNull();
    expect(parseDraft(JSON.stringify({ mode: 'canvas', name: 'n', items: [{}], updatedAt: 1 }))).toBeNull();
    expect(parseDraft(JSON.stringify({ mode: 'canvas', name: 'n', items: [], updatedAt: 'x' }))).toBeNull();
  });
});
