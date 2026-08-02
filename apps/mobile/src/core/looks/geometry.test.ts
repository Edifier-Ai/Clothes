/**
 * @jest-environment node
 *
 * 归一化坐标模型（MVP-008）：x/y ∈ [0,1] 相对画布宽/高；
 * scale 基准 = 相对画布宽度比例；rotation 弧度（rad）。
 */
import { describe, expect, it } from '@jest/globals';

import {
  CANVAS_ASPECT,
  clampToCanvas,
  deserializeItems,
  fitCanvasBox,
  normalizedToPx,
  pxToNormalized,
  serializeItems,
  type LookItemGeom,
} from './geometry';

function item(over: Partial<LookItemGeom> = {}): LookItemGeom {
  return {
    id: 'i1',
    garmentId: 'g1',
    slot: null,
    x: 0.5,
    y: 0.5,
    scale: 1,
    rotation: 0.25,
    zIndex: 3,
    ord: 2,
    ...over,
  };
}

describe('序列化往返', () => {
  it('serialize → deserialize 无损（含 zIndex/ord/slot/rotation）', () => {
    const items = [
      item(),
      item({ id: 'i2', garmentId: 'g2', slot: 'dress', x: 0.1, y: 0.9, scale: 1.5, rotation: -0.7, zIndex: 0, ord: 0 }),
    ];
    const text = serializeItems(items);
    expect(deserializeItems(text)).toEqual(items);
  });

  it('deserialize 坏输入返回 null 不崩', () => {
    expect(deserializeItems('not-json')).toBeNull();
    expect(deserializeItems('{"a":1}')).toBeNull();
    expect(deserializeItems('[{"id":"i1"}]')).toBeNull(); // 缺字段
  });
});

describe('clampToCanvas：衣物中心不出画布', () => {
  it('越界中心收拢到最近边缘，合法值原样', () => {
    expect(clampToCanvas(item({ x: -0.2, y: 1.3 }))).toMatchObject({ x: 0, y: 1 });
    expect(clampToCanvas(item({ x: 0, y: 1 }))).toMatchObject({ x: 0, y: 1 });
    expect(clampToCanvas(item({ x: 0.37, y: 0.62 }))).toMatchObject({ x: 0.37, y: 0.62 });
  });

  it('只收拢位置：scale/rotation/zIndex/ord 不动，且不修改输入', () => {
    const src = item({ x: 2, y: -1, scale: 1.8, rotation: 0.9, zIndex: 5, ord: 1 });
    const out = clampToCanvas(src);
    expect(out).toMatchObject({ x: 1, y: 0, scale: 1.8, rotation: 0.9, zIndex: 5, ord: 1 });
    expect(src).toMatchObject({ x: 2, y: -1 });
    expect(out).not.toBe(src);
  });
});

describe('像素换算', () => {
  it('normalizedToPx：坐标乘画布宽/高，scale 基准换算为像素宽度比例', () => {
    const px = normalizedToPx(item({ x: 0.25, y: 0.5, scale: 0.4, rotation: 0.5 }), 390, 844);
    expect(px.x).toBeCloseTo(97.5);
    expect(px.y).toBeCloseTo(422);
    expect(px.widthPx).toBeCloseTo(156); // 0.4 × 390
    expect(px.rotation).toBeCloseTo(0.5);
  });

  it('normalizedToPx 与 pxToNormalized 互逆（360×800 / 430×932 均成立）', () => {
    for (const [w, h] of [[360, 800], [390, 844], [430, 932]] as const) {
      const src = item({ x: 0.33, y: 0.77, scale: 0.62, rotation: -1.1 });
      const back = pxToNormalized(normalizedToPx(src, w, h), w, h);
      expect(back.x).toBeCloseTo(src.x);
      expect(back.y).toBeCloseTo(src.y);
      expect(back.scale).toBeCloseTo(src.scale);
      expect(back.rotation).toBeCloseTo(src.rotation);
      // 非几何字段透传
      expect(back.id).toBe(src.id);
      expect(back.zIndex).toBe(src.zIndex);
    }
  });
});

describe('规范画布比例（MVP-008 裁切修复）', () => {
  it('CANVAS_ASPECT 为 3:4（宽/高 = 0.75）', () => {
    expect(CANVAS_ASPECT).toBeCloseTo(0.75);
  });

  it('fitCanvasBox：宽受限时按宽铺满、垂直居中', () => {
    // 可用框 358×600：3:4 画布 = 358×477.3，上下留白
    const f = fitCanvasBox(358, 600);
    expect(f.w).toBeCloseTo(358);
    expect(f.h).toBeCloseTo(358 / CANVAS_ASPECT);
    expect(f.left).toBeCloseTo(0);
    expect(f.top).toBeCloseTo((600 - f.h) / 2);
  });

  it('fitCanvasBox：高受限时按高铺满、水平居中', () => {
    // 可用框 984×1290（竖屏实机）：3:4 画布 = 967.5×1290，左右留白
    const f = fitCanvasBox(984, 1290);
    expect(f.h).toBeCloseTo(1290);
    expect(f.w).toBeCloseTo(1290 * CANVAS_ASPECT);
    expect(f.top).toBeCloseTo(0);
    expect(f.left).toBeCloseTo((984 - f.w) / 2);
  });

  it('fitCanvasBox：三档响应尺寸下画布始终在框内且不形变', () => {
    for (const [bw, bh] of [[328, 700], [358, 744], [398, 832]] as const) {
      const f = fitCanvasBox(bw, bh);
      expect(f.w).toBeLessThanOrEqual(bw + 1e-6);
      expect(f.h).toBeLessThanOrEqual(bh + 1e-6);
      expect(f.w / f.h).toBeCloseTo(CANVAS_ASPECT);
      expect(f.left).toBeGreaterThanOrEqual(0);
      expect(f.top).toBeGreaterThanOrEqual(0);
    }
  });

  it('fitCanvasBox：退化输入（零/负）返回零画布，不抛错', () => {
    expect(fitCanvasBox(0, 600)).toEqual({ w: 0, h: 0, left: 0, top: 0 });
    expect(fitCanvasBox(-10, 600)).toEqual({ w: 0, h: 0, left: 0, top: 0 });
  });
});
