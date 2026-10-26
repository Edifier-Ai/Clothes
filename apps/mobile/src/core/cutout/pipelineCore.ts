/**
 * 抠图派生图管线核心（MVP-003）。I/O 与编解码注入，host(pngjs+内存fs) 与设备(Skia+expo-fs) 共用。
 *
 * 产物：originals/<id>.<ext>（原图，只读，绝不覆盖）、masks/<id>.png（alpha）、
 * previews/<id>.png（透明/对比合成）、thumbnails/<id>.png（缩略图）。派生图可由原图+蒙版重建。
 * 原子写：先写 .tmp 再 rename，失败清理 .tmp，绝不留下半文件。
 */
import { dominantColor } from './dominantColor';

export interface PipelineIO {
  readBytes(path: string): Promise<Uint8Array>;
  /** 把 RGBA 编为 PNG 字节 */
  encodePng(rgba: Uint8Array, w: number, h: number): Promise<Uint8Array> | Uint8Array;
  /** 把灰度 alpha 编为 PNG 字节 */
  encodeAlphaPng(alpha: Uint8Array, w: number, h: number): Promise<Uint8Array> | Uint8Array;
  /** 解码 PNG 为 RGBA */
  decodePng(bytes: Uint8Array): Promise<{ rgba: Uint8Array; w: number; h: number }> | { rgba: Uint8Array; w: number; h: number };
  writeTmp(relPath: string, bytes: Uint8Array): Promise<void>;
  /** 原子提交 tmp→final；返回 final 绝对/相对路径 */
  commitTmp(tmpRel: string, finalRel: string): Promise<void>;
  deleteTmp(tmpRel: string): Promise<void>;
  exists(relPath: string): Promise<boolean>;
  /** 复制源暂存图为 originals（原图只读，不覆盖已存在） */
  copyOriginalIfAbsent(srcStagedAbs: string, originalRel: string): Promise<void>;
  relToAbs(rel: string): string;
  /** 测试钩子：预置源图字节（设备实现可 no-op/undefined） */
  _seedSource?: (bytes: Uint8Array) => void;
}

export interface DerivedPaths {
  originalRelPath: string;
  maskRelPath: string;
  previewRelPath: string;
  thumbnailRelPath: string;
  width: number;
  height: number;
  /** 前景主色（配色规则认得的中文色名）；前景太少或计算失败为 null。 */
  dominantColor?: string | null;
}

/** 生成透明棋盘合成预览 RGBA（蒙版作用于原图）。 */
export function compositePreview(
  origRgba: Uint8Array,
  alpha: Uint8Array,
  w: number,
  h: number,
  solid = false,
): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const a = alpha[i] / 255;
      // 棋盘背景
      let bgR = 255;
      let bgG = 255;
      let bgB = 255;
      if (!solid) {
        const c = ((Math.floor(x / 8) + Math.floor(y / 8)) & 1) === 0;
        bgR = c ? 245 : 210;
        bgG = c ? 245 : 210;
        bgB = c ? 245 : 210;
      }
      out[i * 4] = Math.round(origRgba[i * 4] * a + bgR * (1 - a));
      out[i * 4 + 1] = Math.round(origRgba[i * 4 + 1] * a + bgG * (1 - a));
      out[i * 4 + 2] = Math.round(origRgba[i * 4 + 2] * a + bgB * (1 - a));
      out[i * 4 + 3] = 255;
    }
  }
  return out;
}

/** 最近邻缩放到目标尺寸。 */
export function resizeNearest(rgba: Uint8Array, sw: number, sh: number, tw: number, th: number): Uint8Array {
  const out = new Uint8Array(tw * th * 4);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x / tw) * sw));
      const sy = Math.min(sh - 1, Math.floor((y / th) * sh));
      const si = (sy * sw + sx) * 4;
      const di = (y * tw + x) * 4;
      out[di] = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return out;
}

export interface ProduceInput {
  jobId: string;
  garmentId: string;
  sourceStagedAbs: string;
  ext: string;
  alpha: Uint8Array;
  maskW: number;
  maskH: number;
  thumbSize: number;
}

/** 产出原图+蒙版+预览+缩略图，原子写；返回相对路径与原始尺寸。 */
export async function produceDerived(io: PipelineIO, input: ProduceInput): Promise<DerivedPaths> {
  const id = input.garmentId;
  const originalRel = `originals/${id}.${input.ext.replace(/^\./, '')}`;
  const maskRel = `masks/${id}.png`;
  const previewRel = `previews/${id}.png`;
  const thumbRel = `thumbnails/${id}.png`;

  // 原图只读：不存在才复制，绝不覆盖
  await io.copyOriginalIfAbsent(input.sourceStagedAbs, originalRel);

  // 解码原图用于预览/缩略图
  const origBytes = await io.readBytes(io.relToAbs(originalRel));
  const decoded = await io.decodePng(origBytes);
  const { rgba: origRgba, w: ow, h: oh } = decoded;

  // 把蒙版采样/缩放到原图尺寸用于合成
  const alphaFull = resizeNearestAlpha(input.alpha, input.maskW, input.maskH, ow, oh);
  const previewRgba = compositePreview(origRgba, alphaFull, ow, oh, false);
  const thumbRgba = resizeNearest(origRgba, ow, oh, input.thumbSize, input.thumbSize);
  // 主色只是锦上添花：任何异常都不能让抠图失败。
  let color: string | null = null;
  try {
    color = dominantColor(origRgba, alphaFull, ow, oh);
  } catch {
    color = null;
  }

  const maskPng = await io.encodeAlphaPng(input.alpha, input.maskW, input.maskH);
  const previewPng = await io.encodePng(previewRgba, ow, oh);
  const thumbPng = await io.encodePng(thumbRgba, input.thumbSize, input.thumbSize);

  // 原子写：tmp → commit；任一失败清理对应 tmp
  const tmpMask = `_tmp/${id}.mask.png`;
  const tmpPreview = `_tmp/${id}.preview.png`;
  const tmpThumb = `_tmp/${id}.thumb.png`;
  try {
    await io.writeTmp(tmpMask, asBytes(maskPng));
    await io.writeTmp(tmpPreview, asBytes(previewPng));
    await io.writeTmp(tmpThumb, asBytes(thumbPng));
    await io.commitTmp(tmpMask, maskRel);
    await io.commitTmp(tmpPreview, previewRel);
    await io.commitTmp(tmpThumb, thumbRel);
  } catch (e) {
    await io.deleteTmp(tmpMask).catch(() => undefined);
    await io.deleteTmp(tmpPreview).catch(() => undefined);
    await io.deleteTmp(tmpThumb).catch(() => undefined);
    throw e;
  }
  return { originalRelPath: originalRel, maskRelPath: maskRel, previewRelPath: previewRel, thumbnailRelPath: thumbRel, width: ow, height: oh, dominantColor: color };
}

function asBytes(u: Uint8Array | Promise<Uint8Array>): Uint8Array {
  // encodePng 同步返回时此处为 Uint8Array；异步分支在调用处已 await
  return u as Uint8Array;
}

function resizeNearestAlpha(alpha: Uint8Array, sw: number, sh: number, tw: number, th: number): Uint8Array {
  const out = new Uint8Array(tw * th);
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const sx = Math.min(sw - 1, Math.floor((x / tw) * sw));
      const sy = Math.min(sh - 1, Math.floor((y / th) * sh));
      out[y * tw + x] = alpha[sy * sw + sx];
    }
  }
  return out;
}

/** 从原图+蒙版重建预览/缩略图（派生图可重建验收）。 */
export async function rebuildDerived(
  io: PipelineIO,
  garmentId: string,
  ext: string,
  thumbSize: number,
): Promise<{ previewRelPath: string; thumbnailRelPath: string }> {
  const id = garmentId;
  const originalRel = `originals/${id}.${ext.replace(/^\./, '')}`;
  const maskRel = `masks/${id}.png`;
  const previewRel = `previews/${id}.png`;
  const thumbRel = `thumbnails/${id}.png`;
  const origBytes = await io.readBytes(io.relToAbs(originalRel));
  const maskBytes = await io.readBytes(io.relToAbs(maskRel));
  const orig = await io.decodePng(origBytes);
  const maskDec = await io.decodePng(maskBytes);
  const alpha = maskDec.rgba; // 灰度存于 R
  const alphaFull = resizeNearestAlpha(alpha, maskDec.w, maskDec.h, orig.w, orig.h);
  const previewRgba = compositePreview(orig.rgba, alphaFull, orig.w, orig.h, false);
  const thumbRgba = resizeNearest(orig.rgba, orig.w, orig.h, thumbSize, thumbSize);
  const previewPng = asBytes(await io.encodePng(previewRgba, orig.w, orig.h));
  const thumbPng = asBytes(await io.encodePng(thumbRgba, thumbSize, thumbSize));
  const tmpP = `_tmp/${id}.rebuild.preview.png`;
  const tmpT = `_tmp/${id}.rebuild.thumb.png`;
  try {
    await io.writeTmp(tmpP, previewPng);
    await io.writeTmp(tmpT, thumbPng);
    await io.commitTmp(tmpP, previewRel);
    await io.commitTmp(tmpT, thumbRel);
  } catch (e) {
    await io.deleteTmp(tmpP).catch(() => undefined);
    await io.deleteTmp(tmpT).catch(() => undefined);
    throw e;
  }
  return { previewRelPath: previewRel, thumbnailRelPath: thumbRel };
}
