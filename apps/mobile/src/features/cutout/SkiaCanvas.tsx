import type { SkImage } from '@shopify/react-native-skia';
import { Canvas, Image as SkiaImage, Rect } from '@shopify/react-native-skia';

type Bg = 'checker' | 'solid';

export interface SkiaCanvasProps {
  /** 原图（JSI 解码的 SkImage；Skia v2 useImage 对 file:// 真机不可靠，故由外部解码传入） */
  image: SkImage | null;
  w: number;
  h: number;
  scale: number;
  offset: { x: number; y: number };
  bg: Bg;
  overlay: { x: number; y: number; w: number; h: number }[];
  tick: number;
}

/**
 * 修边页 Skia 画布（独立模块 + 静态 import）：
 * 由 cutout-editor 通过 React.lazy(() => import(...)) 按需加载，
 * Skia 2.10 已链接进 APK；拆 chunk 仅为维持启动包体积与既有行为。
 */
export default function SkiaCanvas({ image, w, h, scale, offset, bg, overlay, tick }: SkiaCanvasProps) {
  return (
    <Canvas style={{ flex: 1 }} key={tick}>
      <Rect x={0} y={0} width={w} height={h} color={bg === 'checker' ? '#e8e8e8' : '#ffffff'} />
      {image ? <SkiaImage image={image} x={offset.x} y={offset.y} width={w * scale} height={h * scale} fit="fill" /> : null}
      {overlay.map((r, i) => (
        <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} color="#7A2E3A66" />
      ))}
    </Canvas>
  );
}
