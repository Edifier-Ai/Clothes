import type { LookSlot } from '../db/schema';

/**
 * 画布归一化坐标模型（MVP-008）。
 *
 * 约定（与 look_items 表一致，跨屏幕尺寸不变）：
 * - x/y ∈ [0,1]：衣物中心相对画布宽/高的比例；
 * - scale：衣物显示宽度相对画布宽度的比例（1 = 与画布同宽）；
 * - rotation：弧度（rad），顺时针为正；
 * - zIndex：层级，升序即绘制顺序；ord：同层稳定次序。
 *
 * 纯函数，不碰 DB / 文件系统。
 */

export interface LookItemGeom {
  id: string;
  garmentId: string;
  /** 快速模式槽位；canvas 模式为 null。 */
  slot: LookSlot | null;
  x: number;
  y: number;
  scale: number;
  rotation: number; // 弧度
  zIndex: number;
  ord: number;
}

/**
 * 规范画布宽高比（宽/高 = 3:4）。
 * 画布编辑、封面合成、图库/详情渲染必须使用同一比例：
 * 归一化几何在任何屏幕上才不发生纵向裁切（修复：竖屏 flex 画布
 * 产出的几何在正方形封面上被裁掉顶部/底部的问题）。
 */
export const CANVAS_ASPECT = 3 / 4;

export interface CanvasFit {
  w: number;
  h: number;
  left: number;
  top: number;
}

/** 把 3:4 规范画布等比嵌入可用框并居中；退化输入返回零画布。 */
export function fitCanvasBox(boxW: number, boxH: number): CanvasFit {
  if (!(boxW > 0) || !(boxH > 0)) return { w: 0, h: 0, left: 0, top: 0 };
  const byWidth = boxH / boxW >= 1 / CANVAS_ASPECT; // 可用框比画布更「高瘦」→ 宽受限
  const w = byWidth ? boxW : boxH * CANVAS_ASPECT;
  const h = byWidth ? boxW / CANVAS_ASPECT : boxH;
  return { w, h, left: (boxW - w) / 2, top: (boxH - h) / 2 };
}

/** 像素坐标下的摆放：x/y 为像素，widthPx 为缩放后的像素宽度基准。 */
export interface ItemPx {
  id: string;
  garmentId: string;
  slot: LookSlot | null;
  x: number;
  y: number;
  widthPx: number;
  rotation: number;
  zIndex: number;
  ord: number;
}

/**
 * 收拢语义：衣物中心点必须留在画布内。平移/缩放手势结束后调用，
 * 越界时把中心收拢到最近的画布边缘（x/y 各自独立截断到 [0,1]）。
 * scale/rotation/层级不动——允许衣物部分超出画布，只约束中心点，
 * 这样旋转/放大后的边角可以出血但衣物不会被「丢」到不可达区域。
 */
export function clampToCanvas(item: LookItemGeom): LookItemGeom {
  const x = Math.min(1, Math.max(0, item.x));
  const y = Math.min(1, Math.max(0, item.y));
  if (x === item.x && y === item.y) return { ...item };
  return { ...item, x, y };
}

function isFiniteNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isGeom(v: unknown): v is LookItemGeom {
  if (typeof v !== 'object' || v == null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === 'string' &&
    typeof o.garmentId === 'string' &&
    (o.slot === null || typeof o.slot === 'string') &&
    isFiniteNum(o.x) &&
    isFiniteNum(o.y) &&
    isFiniteNum(o.scale) &&
    isFiniteNum(o.rotation) &&
    Number.isInteger(o.zIndex) &&
    Number.isInteger(o.ord)
  );
}

/** 序列化 items（JSON）。字段齐全，往返无损（含 zIndex/ord）。 */
export function serializeItems(items: readonly LookItemGeom[]): string {
  return JSON.stringify(items);
}

/** 反序列化；坏 JSON / 非数组 / 任一元素缺字段返回 null（不崩、不猜）。 */
export function deserializeItems(text: string): LookItemGeom[] | null {
  try {
    const v: unknown = JSON.parse(text);
    if (!Array.isArray(v)) return null;
    if (!v.every(isGeom)) return null;
    return v.map((o) => ({ ...o }));
  } catch {
    return null;
  }
}

/** 归一化 → 像素：坐标乘画布宽/高；scale × 画布宽 = 像素宽度基准。 */
export function normalizedToPx(item: LookItemGeom, canvasW: number, canvasH: number): ItemPx {
  return {
    ...item,
    x: item.x * canvasW,
    y: item.y * canvasH,
    widthPx: item.scale * canvasW,
  };
}

/** 像素 → 归一化（normalizedToPx 的逆；widthPx ÷ 画布宽 = scale）。 */
export function pxToNormalized(px: ItemPx, canvasW: number, canvasH: number): LookItemGeom {
  return {
    id: px.id,
    garmentId: px.garmentId,
    slot: px.slot,
    x: px.x / canvasW,
    y: px.y / canvasH,
    scale: px.widthPx / canvasW,
    rotation: px.rotation,
    zIndex: px.zIndex,
    ord: px.ord,
  };
}
