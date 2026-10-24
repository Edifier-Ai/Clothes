/**
 * JPEG EXIF 方向归一化。
 *
 * 只转换确实带 Orientation=2..8 的 JPEG；PNG/WebP/HEIC、无 EXIF 或 Orientation=1
 * 均保持原文件和原扩展名，避免无条件转 PNG 带来的存储膨胀。转换通过 Skia 解码后
 * 重编码为无 EXIF 的 PNG；当前 Skia 的编码解码路径会把 EXIF origin 应用到像素。
 *
 * 返回值明确标记 temporary。调用方只能删除 temporary=true 的文件，绝不能删除
 * 相册/相机返回的源 URI。
 */
import * as FileSystem from 'expo-file-system/legacy';

type SkiaModule = typeof import('@shopify/react-native-skia');

export interface NormalizedExifImage {
  uri: string;
  ext: string;
  /** true 表示本模块创建的缓存文件，使用完必须清理。 */
  temporary: boolean;
  /** 解析到的 JPEG EXIF Orientation；无法识别时为 null。 */
  orientation: number | null;
}

function skia(): SkiaModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@shopify/react-native-skia');
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function cleanExt(sourceExt: string | undefined, sourceUri: string): string {
  const supplied = sourceExt?.trim().toLowerCase().replace(/^\./, '');
  if (supplied) return supplied === 'jpeg' ? 'jpg' : supplied;
  const withoutQuery = sourceUri.split(/[?#]/, 1)[0] ?? '';
  const match = withoutQuery.match(/\.([a-z0-9]+)$/i);
  const inferred = match?.[1]?.toLowerCase();
  return inferred === 'jpeg' ? 'jpg' : (inferred ?? 'jpg');
}

function isJpegExt(ext: string): boolean {
  return ext === 'jpg' || ext === 'jpeg';
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/**
 * 读取 JPEG APP1/TIFF IFD0 的 Orientation (0x0112)。解析失败返回 null，绝不猜测。
 * 导出仅供回归测试；运行时通过 normalizeExifOrientation 使用。
 */
export function _readJpegExifOrientationForTest(bytes: Uint8Array): number | null {
  if (!isJpeg(bytes)) return null;

  let cursor = 2;
  while (cursor + 4 <= bytes.length) {
    while (cursor < bytes.length && bytes[cursor] === 0xff) cursor += 1;
    if (cursor >= bytes.length) return null;
    const marker = bytes[cursor++];

    // SOS 后是压缩像素流；EXIF 只会在它之前。
    if (marker === 0xda || marker === 0xd9) return null;
    // 无长度的 standalone marker。
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > bytes.length) return null;

    const segmentLength = (bytes[cursor] << 8) | bytes[cursor + 1];
    if (segmentLength < 2) return null;
    const segmentStart = cursor + 2;
    const segmentEnd = cursor + segmentLength;
    if (segmentEnd > bytes.length) return null;

    if (
      marker === 0xe1 &&
      segmentEnd - segmentStart >= 14 &&
      bytes[segmentStart] === 0x45 &&
      bytes[segmentStart + 1] === 0x78 &&
      bytes[segmentStart + 2] === 0x69 &&
      bytes[segmentStart + 3] === 0x66 &&
      bytes[segmentStart + 4] === 0x00 &&
      bytes[segmentStart + 5] === 0x00
    ) {
      const tiffStart = segmentStart + 6;
      const littleEndian = bytes[tiffStart] === 0x49 && bytes[tiffStart + 1] === 0x49;
      const bigEndian = bytes[tiffStart] === 0x4d && bytes[tiffStart + 1] === 0x4d;
      if (!littleEndian && !bigEndian) return null;

      const read16 = (offset: number): number | null => {
        if (offset < tiffStart || offset + 2 > segmentEnd) return null;
        return littleEndian
          ? bytes[offset] | (bytes[offset + 1] << 8)
          : (bytes[offset] << 8) | bytes[offset + 1];
      };
      const read32 = (offset: number): number | null => {
        if (offset < tiffStart || offset + 4 > segmentEnd) return null;
        if (littleEndian) {
          return (
            bytes[offset] |
            (bytes[offset + 1] << 8) |
            (bytes[offset + 2] << 16) |
            (bytes[offset + 3] << 24)
          ) >>> 0;
        }
        return (
          ((bytes[offset] << 24) >>> 0) |
          (bytes[offset + 1] << 16) |
          (bytes[offset + 2] << 8) |
          bytes[offset + 3]
        ) >>> 0;
      };

      if (read16(tiffStart + 2) !== 42) return null;
      const ifdOffset = read32(tiffStart + 4);
      if (ifdOffset == null) return null;
      const ifdStart = tiffStart + ifdOffset;
      const entryCount = read16(ifdStart);
      if (entryCount == null) return null;

      for (let i = 0; i < entryCount; i++) {
        const entry = ifdStart + 2 + i * 12;
        const tag = read16(entry);
        if (tag == null || entry + 12 > segmentEnd) return null;
        if (tag !== 0x0112) continue;

        const type = read16(entry + 2);
        const count = read32(entry + 4);
        if (type !== 3 || count == null || count < 1) return null;
        const valueOffset = count * 2 <= 4 ? entry + 8 : tiffStart + (read32(entry + 8) ?? -1);
        const orientation = read16(valueOffset);
        return orientation != null && orientation >= 1 && orientation <= 8
          ? orientation
          : null;
      }
      return null;
    }

    cursor = segmentEnd;
  }
  return null;
}

/**
 * 仅在 JPEG 明确带 Orientation=2..8 时生成临时 PNG；其余格式原样直通。
 * HEIC/HEIF 的元数据结构不在本地解析范围内，因此保守保持原文件，不做有损猜测。
 */
export async function normalizeExifOrientation(
  sourceUri: string,
  sourceExt?: string,
): Promise<NormalizedExifImage> {
  const ext = cleanExt(sourceExt, sourceUri);
  if (!isJpegExt(ext)) {
    return { uri: sourceUri, ext, temporary: false, orientation: null };
  }

  const b64 = await FileSystem.readAsStringAsync(sourceUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const bytes = base64ToBytes(b64);
  if (!isJpeg(bytes)) {
    // 扩展名不可信时也不重编码未知内容。
    return { uri: sourceUri, ext, temporary: false, orientation: null };
  }

  const orientation = _readJpegExifOrientationForTest(bytes);
  if (orientation == null || orientation === 1) {
    return { uri: sourceUri, ext, temporary: false, orientation };
  }

  const cacheRoot = FileSystem.cacheDirectory;
  if (!cacheRoot) throw new Error('EXIF normalize: cache directory unavailable');
  const tmpPath = `${cacheRoot.replace(/\/$/, '')}/exif-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.png`;

  const { Skia, ImageFormat } = skia();
  const encoded = Skia.Data.fromBytes(bytes);
  let image: ReturnType<typeof Skia.Image.MakeImageFromEncoded> = null;
  try {
    image = Skia.Image.MakeImageFromEncoded(encoded);
    if (!image) throw new Error('EXIF normalize: decode failed (unsupported or corrupt image)');
    const pngBytes = image.encodeToBytes(ImageFormat.PNG);
    if (pngBytes.length === 0) throw new Error('EXIF normalize: encode failed');
    try {
      await FileSystem.writeAsStringAsync(tmpPath, bytesToBase64(pngBytes), {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch (error) {
      await FileSystem.deleteAsync(tmpPath, { idempotent: true }).catch(() => undefined);
      throw error;
    }
    return { uri: tmpPath, ext: 'png', temporary: true, orientation };
  } finally {
    image?.dispose();
    encoded.dispose();
  }
}
