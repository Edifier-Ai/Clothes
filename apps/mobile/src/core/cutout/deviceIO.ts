import * as FileSystem from 'expo-file-system/legacy';

import { decodePng as skiaDecodePng, encodeAlphaPng as skiaEncodeAlphaPng, encodePng as skiaEncodePng } from '@/native/skiaPngCodec';

import type { PipelineIO } from '../cutout/pipelineCore';

/**
 * 设备侧 PipelineIO：expo-file-system 做原子文件 I/O，Skia 做 PNG 编解码
 * （skiaPngCodec；Hermes 没有 Node Buffer，pngjs 无法在设备运行——2026-08-01 真机实证）。
 * Skia 仅用于修边画布显示的假设已过时：2.10 已链接进 APK，编解码与画布都用它。
 */

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
    encodePng: (rgba, w, h) => skiaEncodePng(rgba, w, h),
    encodeAlphaPng: (alpha, w, h) => skiaEncodeAlphaPng(alpha, w, h),
    decodePng: (bytes) => skiaDecodePng(bytes),
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
