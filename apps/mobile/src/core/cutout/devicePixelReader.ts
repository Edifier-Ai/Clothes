import * as FileSystem from 'expo-file-system/legacy';

import { decodePng } from '@/native/skiaPngCodec';

import type { PixelReader } from '../../native/segmentationEngine';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 设备 PixelReader：Skia 把 PNG 解码为非预乘 RGBA（TencentCiEngine 云端结果
 *  临时 PNG 经此解码）。Hermes 没有 Node Buffer，pngjs 不可用于设备（2026-08-01
 *  真机实证 3/3 失败），故经 skiaPngCodec 走 Skia。 */
export const devicePixelReader: PixelReader = async (path) => {
  const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
  const { rgba, w, h } = decodePng(base64ToBytes(b64));
  return { width: w, height: h, rgba };
};
