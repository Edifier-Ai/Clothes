/**
 * 画布点选命中检测（MVP-008 缺陷 3）。
 * 画布级 Tap 手势拿到 (x, y) 后据此判定：点中衣物 → 选中；点空白 → null（取消选中）。
 * 与 CanvasEditor 触控盒同一套几何：方形盒，边长 max(scale*画布宽, minBox)，
 * 中心 (x*画布宽, y*画布高)；重叠时 zIndex 高者优先（顶层先命中）。
 */

export interface HitTestItem {
  id: string;
  x: number;
  y: number;
  scale: number;
  zIndex: number;
  ord: number;
}

export function hitTestCanvasItem(
  items: readonly HitTestItem[],
  x: number,
  y: number,
  canvas: { w: number; h: number },
  minBox: number,
): string | null {
  let best: HitTestItem | null = null;
  for (const it of items) {
    const box = Math.max(it.scale * canvas.w, minBox);
    const cx = it.x * canvas.w;
    const cy = it.y * canvas.h;
    if (x < cx - box / 2 || x > cx + box / 2 || y < cy - box / 2 || y > cy + box / 2) continue;
    if (!best || it.zIndex > best.zIndex || (it.zIndex === best.zIndex && it.ord > best.ord)) {
      best = it;
    }
  }
  return best?.id ?? null;
}
