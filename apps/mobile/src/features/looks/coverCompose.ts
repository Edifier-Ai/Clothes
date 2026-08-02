import * as FileSystem from 'expo-file-system/legacy';

import { originalUri } from '@/core/files/uri';
import { CANVAS_ASPECT } from '@/core/looks/geometry';
import { getLookDetail, rebuildCoverSpec, saveLook, type SaveLookInput } from '@/core/looks/lookService';
import { decodeSkImage } from '@/native/skiaPngCodec';
import { palette } from '@/design-system';

/**
 * 造型封面合成（MVP-008）：从 DB 事实（look_items 几何 + 衣物资产路径）
 * 用 Skia 离屏 surface 合成 PNG，写入私有目录 covers/<lookId>.png，
 * 相对路径回写 cover_rel_path。
 *
 * 封面是派生物：rebuildCover(lookId) 删掉缓存 PNG 后也能从事实数据重合成
 * （反向验证路径）。合成失败返回 false，不抛错、不阻塞保存、不丢造型数据。
 * 本模块依赖 Skia JSI 与文件系统，只在设备端运行；host 测试不覆盖。
 */

/** 封面宽（3:4 规范画布，高 = 宽 ÷ CANVAS_ASPECT，与编辑画布同比例才不裁切）。 */
const COVER_W = 840;
const COVER_H = Math.round(COVER_W / CANVAS_ASPECT);

type SkiaModule = typeof import('@shopify/react-native-skia');
function skia(): SkiaModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@shopify/react-native-skia') as SkiaModule;
}

export function coverRelPathFor(lookId: string): string {
  return `covers/${lookId}.png`;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function coversDirAbs(): string {
  const base = FileSystem.documentDirectory?.replace(/\/$/, '') ?? '';
  return `${base}/clothes/covers`;
}

/**
 * 从事实数据合成封面 PNG 并写盘；返回相对路径（covers/<lookId>.png）。
 * 造型不存在 / 无 surface / 无图片可画时返回 null。
 */
export async function composeCover(lookId: string): Promise<string | null> {
  const spec = await rebuildCoverSpec(lookId);
  if (!spec) return null;
  const { Skia, ImageFormat } = skia();

  const surface = Skia.Surface.MakeOffscreen(COVER_W, COVER_H);
  if (!surface) {
    console.warn(`[coverCompose] 离屏 surface 创建失败（${lookId}）`);
    return null;
  }
  const canvas = surface.getCanvas();

  const bgPaint = Skia.Paint();
  bgPaint.setColor(Skia.Color(palette.paperWhite));
  canvas.drawRect(Skia.XYWHRect(0, 0, COVER_W, COVER_H), bgPaint);

  let painted = 0;
  for (const item of spec.items) {
    if (!item.imageRelPath) continue; // 缺图/归档：封面留空位，UI 层另有占位与修复入口
    try {
      const b64 = await FileSystem.readAsStringAsync(originalUri(item.imageRelPath), {
        encoding: FileSystem.EncodingType.Base64,
      });
      const img = decodeSkImage(base64ToBytes(b64));
      const w = item.scale * COVER_W;
      const h = img.width() > 0 ? (w * img.height()) / img.width() : w;
      canvas.save();
      canvas.translate(item.x * COVER_W, item.y * COVER_H);
      canvas.rotate((item.rotation * 180) / Math.PI, 0, 0);
      const paint = Skia.Paint();
      canvas.drawImageRect(
        img,
        Skia.XYWHRect(0, 0, img.width(), img.height()),
        Skia.XYWHRect(-w / 2, -h / 2, w, h),
        paint,
      );
      canvas.restore();
      painted += 1;
    } catch (e) {
      // 单件失败跳过，其余照常合成；失败必须可观测（MVP-008：catch 吞错曾致全占位）
      console.warn(
        `[coverCompose] 单件解码失败 ${item.imageRelPath}:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }
  if (painted === 0) {
    console.warn(`[coverCompose] 无一件图像可画，封面未生成（${lookId}）`);
    return null;
  }

  const snapshot = surface.makeImageSnapshot();
  const bytes = snapshot.encodeToBytes(ImageFormat.PNG);
  await FileSystem.makeDirectoryAsync(coversDirAbs(), { intermediates: true });
  const rel = coverRelPathFor(lookId);
  await FileSystem.writeAsStringAsync(originalUri(rel), bytesToBase64(bytes), {
    encoding: FileSystem.EncodingType.Base64,
  });
  return rel;
}

/**
 * 重建封面：重新合成 PNG 并把相对路径写回 cover_rel_path。
 * 反向验证：删除 covers/<id>.png 后调用即可从 DB 事实复原，造型数据不动。
 * 任何失败返回 false（不抛错、不丢造型）。
 */
export async function rebuildCover(lookId: string): Promise<boolean> {
  try {
    const rel = await composeCover(lookId);
    if (!rel) return false;
    const detail = await getLookDetail(lookId);
    if (!detail) return false;
    await saveLook({
      id: detail.look.id,
      name: detail.look.name,
      mode: detail.look.mode as SaveLookInput['mode'],
      sourceLookId: detail.look.sourceLookId,
      coverRelPath: rel,
      items: detail.items.map((it) => ({
        id: it.id,
        garmentId: it.garmentId,
        slot: it.slot as SaveLookInput['items'][number]['slot'],
        x: it.x,
        y: it.y,
        scale: it.scale,
        rotation: it.rotation,
        zIndex: it.zIndex,
        ord: it.ord,
      })),
    });
    return true;
  } catch (e) {
    // 失败返回 false（不抛错、不丢造型），但原因必须可观测
    console.warn(`[coverCompose] rebuildCover 失败（${lookId}）:`, e instanceof Error ? e.message : String(e));
    return false;
  }
}
