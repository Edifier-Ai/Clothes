import type { LookMode } from '../db/schema';
import type { LookItemGeom } from './geometry';

/**
 * 造型封面绘制清单（MVP-008）。
 *
 * 封面 PNG 是派生物：本 spec 由事实数据（look_items 几何 + 衣物资产路径）
 * 确定性生成，设备端用 Skia 按清单升序合成；封面删除后可随时重建，不丢造型。
 * 衣物缺图/归档时以 null imageRelPath 占位——项保留、几何保留，
 * UI 据占位渲染占位框与修复入口。
 */

export interface CoverSpecItem {
  /** 透明抠图/资产相对路径；缺图或归档为 null（占位项）。 */
  imageRelPath: string | null;
  /** 归一化几何（与画布模型一致：x/y ∈ [0,1]，scale 相对画布宽，rotation 弧度）。 */
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface CoverSpec {
  lookId: string;
  mode: LookMode;
  /** 按 (zIndex, ord) 升序：数组顺序即绘制顺序（先画底层）。 */
  items: CoverSpecItem[];
}

/**
 * 绘制所需的最小几何（不含 slot——封面不区分模式内槽位）。
 * LookItemGeom 与 LookItemRow 均结构兼容。
 */
export type CoverItemGeom = Pick<
  LookItemGeom,
  'id' | 'garmentId' | 'x' | 'y' | 'scale' | 'rotation' | 'zIndex' | 'ord'
>;

/**
 * 生成绘制清单。assetByGarmentId：garmentId → 展示图相对路径
 * （缺图/归档为 null 或不存在该键）。确定性：同输入同输出，
 * JSON.stringify 逐字节稳定（字段按固定顺序构造）。
 */
export function buildCoverSpec(
  look: { id: string; mode: LookMode },
  items: readonly CoverItemGeom[],
  assetByGarmentId: ReadonlyMap<string, string | null>,
): CoverSpec {
  const sorted = [...items].sort((a, b) => a.zIndex - b.zIndex || a.ord - b.ord);
  return {
    lookId: look.id,
    mode: look.mode,
    items: sorted.map((it) => ({
      imageRelPath: assetByGarmentId.get(it.garmentId) ?? null,
      x: it.x,
      y: it.y,
      scale: it.scale,
      rotation: it.rotation,
    })),
  };
}
