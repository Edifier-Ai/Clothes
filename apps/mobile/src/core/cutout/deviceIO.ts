import * as FileSystem from 'expo-file-system/legacy';

import type { PipelineIO } from '../cutout/pipelineCore';

/**
 * 设备侧 PipelineIO：expo-file-system 做原子文件 I/O，pngjs 做 PNG 编解码
 * （与 host 测试同一编解码逻辑，保证派生图可重建）。Skia 仅用于修边画布显示。
 *
 * 注意：pngjs 依赖 Node builtins（util/stream），RN 运行时不含，故仅在函数内懒 require，
 * 使主 bundle 不打包 pngjs（抠图管线在设备本就 B-6 阻塞；主 bundle 不含 pngjs 才能让 app 启动）。
 */
type PngJs = typeof import('pngjs');
function pngjs(): PngJs {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('pngjs') as PngJs;
}

function join(a: string, b: string): string {
  return `${a.replace(/\/$/, '')}/${b.replace(/^\//, '')}`;
}

export function makeDeviceIO(rootAbs: string): PipelineIO {
  const abs = (rel: string) => join(rootAbs, rel);
  return {
    relToAbs: abs,
    readBytes: async (p) => {
      const b64 = await FileSystem.readAsStringAsync(p, { encoding: FileSystem.EncodingType.Base64 });
      return base64ToBytes(b64);
    },
    encodePng: (rgba, w, h) => {
      const { PNG } = pngjs();
      const png = new PNG({ width: w, height: h });
      for (let i = 0; i < w * h * 4; i++) png.data[i] = rgba[i];
      return PNG.sync.write(png);
    },
    encodeAlphaPng: (alpha, w, h) => {
      const { PNG } = pngjs();
      const png = new PNG({ width: w, height: h });
      for (let i = 0; i < w * h; i++) {
        png.data[i * 4] = alpha[i];
        png.data[i * 4 + 1] = alpha[i];
        png.data[i * 4 + 2] = alpha[i];
        png.data[i * 4 + 3] = 255;
      }
      return PNG.sync.write(png);
    },
    decodePng: (bytes) => {
      const { PNG } = pngjs();
      const png = PNG.sync.read(Buffer.from(bytes));
      return { rgba: new Uint8Array(png.data), w: png.width, h: png.height };
    },
    writeTmp: async (rel, bytes) => {
      await FileSystem.makeDirectoryAsync(join(rootAbs, '_tmp'), { intermediates: true });
      await FileSystem.writeAsStringAsync(abs(rel), bytesToBase64(bytes), {
        encoding: FileSystem.EncodingType.Base64,
      });
    },
    commitTmp: async (tmpRel, finalRel) => {
      const finalAbs = abs(finalRel);
      await FileSystem.makeDirectoryAsync(finalAbs.slice(0, finalAbs.lastIndexOf('/')), { intermediates: true });
      await FileSystem.moveAsync({ from: abs(tmpRel), to: finalAbs });
    },
    deleteTmp: async (rel) => {
      await FileSystem.deleteAsync(abs(rel), { idempotent: true });
    },
    exists: async (rel) => {
      const info = await FileSystem.getInfoAsync(abs(rel));
      return info.exists;
    },
    copyOriginalIfAbsent: async (srcStagedAbs, originalRel) => {
      const finalAbs = abs(originalRel);
      const info = await FileSystem.getInfoAsync(finalAbs);
      if (info.exists) return; // 原图只读，绝不覆盖
      await FileSystem.makeDirectoryAsync(finalAbs.slice(0, finalAbs.lastIndexOf('/')), { intermediates: true });
      await FileSystem.copyAsync({ from: srcStagedAbs, to: finalAbs });
    },
  };
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
