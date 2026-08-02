import type { LookSlot } from '@/core/db/schema';

/**
 * 快速槽位默认几何（MVP-008 LOK-02）：保存 slots 造型时按槽位落归一化坐标，
 * 与画布模型一致（x/y ∈ [0,1] 中心点，scale 相对画布宽，rotation 弧度）。
 * 同一布局用于 LOK-07「采用这套」与封面合成，跨屏幕尺寸不变。
 */

export const SLOT_ORDER: readonly LookSlot[] = ['top', 'bottom', 'dress', 'shoes', 'outerwear', 'accessory'];

export const SLOT_LABEL: Record<LookSlot, string> = {
  top: '上装',
  bottom: '下装',
  dress: '连衣裙',
  shoes: '鞋',
  outerwear: '外套',
  accessory: '配饰',
};

export interface SlotLayout {
  x: number;
  y: number;
  scale: number;
}

export const SLOT_LAYOUT: Record<LookSlot, SlotLayout> = {
  top: { x: 0.5, y: 0.28, scale: 0.5 },
  bottom: { x: 0.5, y: 0.64, scale: 0.5 },
  dress: { x: 0.5, y: 0.48, scale: 0.55 },
  shoes: { x: 0.5, y: 0.88, scale: 0.38 },
  outerwear: { x: 0.26, y: 0.3, scale: 0.4 },
  accessory: { x: 0.78, y: 0.14, scale: 0.28 },
};
