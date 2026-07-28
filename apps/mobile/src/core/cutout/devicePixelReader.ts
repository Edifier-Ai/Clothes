import * as FileSystem from 'expo-file-system/legacy';
import type { PixelReader } from '../../native/segmentationEngine';

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 设备 PixelReader：用 pngjs 把源图（已存为 PNG）解码为 RGBA，供 stub 引擎。
 *  pngjs 懒 require（RN 运行时不含 Node builtins；抠图链路设备本就 B-6 阻塞）。 */
export const devicePixelReader: PixelReader = async (path) => {
  const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PNG } = require('pngjs') as typeof import('pngjs');
  const png = PNG.sync.read(Buffer.from(base64ToBytes(b64)));
  return { width: png.width, height: png.height, rgba: new Uint8Array(png.data) };
};
