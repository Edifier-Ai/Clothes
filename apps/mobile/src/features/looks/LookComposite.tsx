import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import type { SkImage } from '@shopify/react-native-skia';
import { Canvas, Group, Image as SkiaImage, Rect } from '@shopify/react-native-skia';

import { palette } from '@/design-system';
import { originalUri } from '@/core/files/uri';
import { decodeSkImage } from '@/native/skiaPngCodec';

/** 合成渲染项：与 CoverSpecItem 结构兼容；id 供选中描边用。 */
export interface CompositeItem {
  id?: string;
  /** 透明抠图/资产相对路径；null 或解码失败 → 占位框。 */
  imageRelPath: string | null;
  x: number;
  y: number;
  scale: number;
  rotation: number;
}

export interface LookCompositeProps {
  /** 数组顺序即绘制顺序（先画底层）。 */
  items: readonly CompositeItem[];
  width: number;
  height: number;
  /** 选中项 id：描酒红边框（画布编辑态）。 */
  selectedId?: string | null;
}

interface Decoded {
  image: SkImage;
  aspect: number; // h / w
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 造型实时合成渲染（MVP-008）：Skia 按归一化几何绘制透明衣物 PNG。
 * 图库/详情缺缓存封面时的兜底、画布编辑器的渲染层共用此组件。
 * 取图路径由调用方给出（与 lookService.rebuildCoverSpec 同款：抠图预览优先，原图兜底）；
 * 缺图/解码失败画占位框，不崩。
 */
export function LookComposite({ items, width, height, selectedId }: LookCompositeProps) {
  const [decoded, setDecoded] = useState<Map<string, Decoded>>(new Map());

  // 只随图片集合变化重解码；items 数组在编辑器里每渲染新建，作依赖会无限重解码。
  const relsKey = [
    ...new Set(items.map((i) => i.imageRelPath).filter((r): r is string => r != null)),
  ].join('|');

  useEffect(() => {
    let mounted = true;
    const rels = relsKey ? relsKey.split('|') : [];
    (async () => {
      const next = new Map<string, Decoded>();
      for (const rel of rels) {
        try {
          const b64 = await FileSystem.readAsStringAsync(originalUri(rel), {
            encoding: FileSystem.EncodingType.Base64,
          });
          const image = decodeSkImage(base64ToBytes(b64));
          const w = image.width();
          next.set(rel, { image, aspect: w > 0 ? image.height() / w : 1 });
        } catch (e) {
          // 解码失败 → 占位框（不 set），但绝不能静默（MVP-008：双 scheme URI 曾静默全灭）
          console.warn(`[LookComposite] 图像解码失败 ${rel}:`, e instanceof Error ? e.message : String(e));
        }
      }
      if (mounted) setDecoded(next);
    })();
    return () => {
      mounted = false;
    };
  }, [relsKey]);

  return (
    <Canvas style={{ width, height }}>
      <Rect x={0} y={0} width={width} height={height} color={palette.paperWhite} />
      {items.map((it, idx) => {
        const cx = it.x * width;
        const cy = it.y * height;
        const w = it.scale * width;
        const d = it.imageRelPath ? decoded.get(it.imageRelPath) : undefined;
        const h = w * (d?.aspect ?? 1);
        const key = it.id ?? `item-${idx}`;
        return (
          <Group key={key} origin={{ x: cx, y: cy }} transform={[{ rotate: it.rotation }]}>
            {d ? (
              <SkiaImage image={d.image} x={cx - w / 2} y={cy - h / 2} width={w} height={h} fit="fill" />
            ) : (
              <Rect
                x={cx - w / 2}
                y={cy - h / 2}
                width={w}
                height={h}
                color={palette.sandSoft}
              />
            )}
            {it.id != null && it.id === selectedId ? (
              <Rect
                x={cx - w / 2}
                y={cy - h / 2}
                width={w}
                height={h}
                color={palette.oxblood}
                style="stroke"
                strokeWidth={2}
              />
            ) : null}
          </Group>
        );
      })}
    </Canvas>
  );
}
