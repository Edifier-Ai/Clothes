import * as FileSystem from 'expo-file-system/legacy';
import { PNG } from 'pngjs';
import type { PixelReader } from '../../native/segmentationEngine';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 设备 PixelReader：用 pngjs 把源图（已存为 PNG）解码为 RGBA，供 stub 引擎。 */
export const devicePixelReader: PixelReader = async (path) => {
  const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
  const png = PNG.sync.read(Buffer.from(base64ToBytes(b64)));
  return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
};
