/**
 * @jest-environment node
 *
 * 封面绘制清单（MVP-008）：确定性（同输入同输出）、按 z_index 升序、
 * 缺图/归档衣物以 null imageRelPath 占位但保留几何数据。
 * spec 供设备端 Skia 合成；封面 PNG 删除后可由事实数据重建。
 */
import { describe, expect, it } from '@jest/globals';

import type { LookItemGeom } from './geometry';
import { buildCoverSpec } from './cover';

function item(id: string, garmentId: string, zIndex: number, ord = 0): LookItemGeom {
  return {
    id,
    garmentId,
    slot: null,
    x: 0.1 * (zIndex + 1),
    y: 0.2,
    scale: 1 + zIndex * 0.1,
    rotation: 0.1 * zIndex,
    zIndex,
    ord,
  };
}

const look = { id: 'l1', mode: 'canvas' as const };

describe('buildCoverSpec', () => {
  it('按 z_index 升序输出绘制项（同层按 ord），含归一化几何', () => {
    const items = [item('i3', 'g3', 5), item('i1', 'g1', 0), item('i2', 'g2', 2)];
    const assets = new Map([
      ['g1', 'previews/g1.png'],
      ['g2', 'previews/g2.png'],
      ['g3', 'previews/g3.png'],
    ]);
    const spec = buildCoverSpec(look, items, assets);
    expect(spec.lookId).toBe('l1');
    expect(spec.mode).toBe('canvas');
    expect(spec.items.map((i) => i.imageRelPath)).toEqual([
      'previews/g1.png',
      'previews/g2.png',
      'previews/g3.png',
    ]);
    expect(spec.items[0]).toMatchObject({ x: 0.1, y: 0.2, scale: 1, rotation: 0 });
    expect(spec.items[2].x).toBeCloseTo(0.6);
    expect(spec.items[2].scale).toBeCloseTo(1.5);
    expect(spec.items[2].rotation).toBeCloseTo(0.5);
  });

  it('缺图/归档衣物：null imageRelPath 占位，几何数据不丢', () => {
    const items = [item('i1', 'g1', 0), item('i2', 'g2', 1)];
    const assets = new Map([['g1', 'previews/g1.png'], ['g2', null]]);
    const spec = buildCoverSpec(look, items, assets);
    expect(spec.items).toHaveLength(2);
    expect(spec.items[1].imageRelPath).toBeNull();
    expect(spec.items[1]).toMatchObject({ x: 0.2, y: 0.2, scale: 1.1, rotation: 0.1 });
  });

  it('衣物完全不在资产表中同样占位（不丢项）', () => {
    const spec = buildCoverSpec(look, [item('i1', 'g-gone', 0)], new Map());
    expect(spec.items).toEqual([
      { imageRelPath: null, x: 0.1, y: 0.2, scale: 1, rotation: 0 },
    ]);
  });

  it('确定性：同输入两次序列化逐字节一致；输入乱序不影响输出', () => {
    const a = [item('i1', 'g1', 0), item('i2', 'g2', 1), item('i3', 'g3', 2)];
    const b = [a[2], a[0], a[1]];
    const assets = new Map([['g1', 'p1'], ['g2', 'p2'], ['g3', 'p3']]);
    const s1 = JSON.stringify(buildCoverSpec(look, a, assets));
    const s2 = JSON.stringify(buildCoverSpec(look, a, assets));
    const s3 = JSON.stringify(buildCoverSpec(look, b, assets));
    expect(s1).toBe(s2);
    expect(s1).toBe(s3);
  });
});
