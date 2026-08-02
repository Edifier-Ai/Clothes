import { describe, expect, it } from '@jest/globals';

import { hitTestCanvasItem, type HitTestItem } from './canvasHitTest';

/**
 * 画布点选命中检测（MVP-008 缺陷 3）：替代被父级 Pressable 吞掉的 Tap，
 * 画布级 Tap 手势拿到坐标后按 zIndex 自上而下命中检测；
 * 点衣物选中、点空白返回 null（取消选中）。
 */

const CANVAS = { w: 300, h: 400 };
const MIN_BOX = 44;

function item(partial: Partial<HitTestItem> & { id: string }): HitTestItem {
  return { x: 0.5, y: 0.5, scale: 0.4, zIndex: 0, ord: 0, ...partial };
}

describe('hitTestCanvasItem（LOK-03 点选）', () => {
  it('点中衣物包围盒 → 返回该衣物 id', () => {
    const items = [item({ id: 'a' })];
    // 中心 (150,200)，盒宽 0.4*300=120 → [90,210]×[140,260]
    expect(hitTestCanvasItem(items, 150, 200, CANVAS, MIN_BOX)).toBe('a');
    expect(hitTestCanvasItem(items, 95, 145, CANVAS, MIN_BOX)).toBe('a');
  });

  it('点空白 → null（取消选中）', () => {
    const items = [item({ id: 'a' })];
    expect(hitTestCanvasItem(items, 10, 10, CANVAS, MIN_BOX)).toBeNull();
    expect(hitTestCanvasItem(items, 290, 390, CANVAS, MIN_BOX)).toBeNull();
  });

  it('重叠时 zIndex 高者（顶层）优先', () => {
    const items = [item({ id: 'bottom', zIndex: 0 }), item({ id: 'top', zIndex: 5 })];
    expect(hitTestCanvasItem(items, 150, 200, CANVAS, MIN_BOX)).toBe('top');
  });

  it('小尺寸衣物按最小点击盒（MIN_BOX）命中', () => {
    const items = [item({ id: 'tiny', scale: 0.05 })];
    // 0.05*300=15 < 44 → 盒宽 44，中心 (150,200) → [128,172]×[178,222]
    expect(hitTestCanvasItem(items, 130, 220, CANVAS, MIN_BOX)).toBe('tiny');
    expect(hitTestCanvasItem(items, 127, 200, CANVAS, MIN_BOX)).toBeNull();
  });

  it('空列表 → null', () => {
    expect(hitTestCanvasItem([], 150, 200, CANVAS, MIN_BOX)).toBeNull();
  });
});
