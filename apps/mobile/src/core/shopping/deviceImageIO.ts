import * as FileSystem from 'expo-file-system/legacy';

import { devicePixelReader } from '../cutout/devicePixelReader';
import { expoCrypto } from '../files/expoAdapters';
import { extFromUri, originalUri } from '../files/uri';
import { assertSafeCandidateImagePath, assertSafeReadableImagePath } from './paths';
import type { ShoppingImageIO } from './types';

export function createDeviceShoppingImageIO(rootAbs: string): ShoppingImageIO {
  return {
    async importImage(sourceUri, candidateId, mimeType) {
      const extension = extFromUri(sourceUri, mimeType);
      const relPath = `shopping/${candidateId}.${extension}`;
      assertSafeCandidateImagePath(relPath);
      const destination = originalUri(relPath);
      const staged = `${destination}.tmp`;
      await FileSystem.makeDirectoryAsync(`${rootAbs}/shopping`, { intermediates: true });
      try {
        await FileSystem.deleteAsync(staged, { idempotent: true });
        await FileSystem.copyAsync({ from: sourceUri, to: staged });
        await FileSystem.moveAsync({ from: staged, to: destination });
        const base64 = await FileSystem.readAsStringAsync(destination, {
          encoding: FileSystem.EncodingType.Base64,
        });
        return { relPath, sha256: await expoCrypto.sha256Base64(base64) };
      } catch (error) {
        await FileSystem.deleteAsync(staged, { idempotent: true }).catch(() => undefined);
        await FileSystem.deleteAsync(destination, { idempotent: true }).catch(() => undefined);
        throw error;
      }
    },

    readPixels(relPath) {
      assertSafeReadableImagePath(relPath);
      return devicePixelReader(originalUri(relPath));
    },

    async deleteImage(relPath) {
      // 纵使数据库内容损坏，也只允许删除 shopping/ 下的单文件，绝不接受 .. 或目录。
      assertSafeCandidateImagePath(relPath);
      await FileSystem.deleteAsync(originalUri(relPath), { idempotent: true });
    },
  };
}
