/**
 * 设备端 PNG 编解码：Skia 实现（react-native-skia 2.10 已随 APK 链接）。
 *
 * 取代原 pngjs + Node Buffer 路径——pngjs 依赖 Node builtins，Hermes 没有 Buffer，
 * 2026-08-01 真机 GoodsMatting 抠图 3/3 失败（`Property 'Buffer' doesn't exist`）。
 *
 * Skia 走懒 require：本模块被 deviceIO/devicePixelReader/cutout-editor 引用，
 * 进而进入主 bundle；顶层 import 本身无害（APK 已含 Skia），懒 require 是为了让
 * Node/Jest 环境 import 本模块时不立刻求值原生绑定（测试用 jest.mock 替换）。
 */
type SkiaModule = typeof import('@shopify/react-native-skia');
/** 仅类型引用：运行时由 skia() 懒 require 求值。 */
export type SkImageT = import('@shopify/react-native-skia').SkImage;
function skia(): SkiaModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@shopify/react-native-skia') as SkiaModule;
}

export interface DecodedPng {
  rgba: Uint8Array;
  w: number;
  h: number;
}

/** PNG 字节 → 非预乘 RGBA。失败（不支持的格式/损坏数据/readPixels 失败）抛错。 */
export function decodePng(bytes: Uint8Array): DecodedPng {
  const { Skia, ColorType, AlphaType } = skia();
  const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!img) throw new Error('PNG decode failed: unsupported or corrupt image');
  const w = img.width();
  const h = img.height();
  const pixels = img.readPixels(0, 0, {
    width: w,
    height: h,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  if (!pixels) throw new Error('PNG decode failed: readPixels returned null');
  const rgba = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer);
  return { rgba, w, h };
}

/** PNG 字节 → SkImage（画布展示原图用）。Skia v2 useImage 对 file:// 真机不可靠
 * （2026-08-01 真机实测原图空白），改走 JSI 解码。失败抛错。 */
export function decodeSkImage(bytes: Uint8Array): SkImageT {
  const { Skia } = skia();
  const img = Skia.Image.MakeImageFromEncoded(Skia.Data.fromBytes(bytes));
  if (!img) throw new Error('PNG decode failed: unsupported or corrupt image');
  return img;
}

/** 非预乘 RGBA → PNG 字节。长度不符或建图失败抛错，绝不静默产出坏图。 */
export function encodePng(rgba: Uint8Array, w: number, h: number): Uint8Array {
  if (rgba.length !== w * h * 4) {
    throw new Error(`PNG encode failed: rgba length ${rgba.length} != w*h*4 (${w * h * 4})`);
  }
  const { Skia, ColorType, AlphaType, ImageFormat } = skia();
  const img = Skia.Image.MakeImage(
    { width: w, height: h, colorType: ColorType.RGBA_8888, alphaType: AlphaType.Unpremul },
    Skia.Data.fromBytes(rgba),
    w * 4,
  );
  if (!img) throw new Error('PNG encode failed: MakeImage returned null');
  return img.encodeToBytes(ImageFormat.PNG);
}

/** 单通道 alpha → 灰度 PNG（R=G=B=alpha，A=255；与原 pngjs encodeAlphaPng 语义一致）。 */
export function encodeAlphaPng(alpha: Uint8Array, w: number, h: number): Uint8Array {
  if (alpha.length !== w * h) {
    throw new Error(`PNG encode failed: alpha length ${alpha.length} != w*h (${w * h})`);
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = alpha[i];
    rgba[i * 4 + 1] = alpha[i];
    rgba[i * 4 + 2] = alpha[i];
    rgba[i * 4 + 3] = 255;
  }
  return encodePng(rgba, w, h);
}
