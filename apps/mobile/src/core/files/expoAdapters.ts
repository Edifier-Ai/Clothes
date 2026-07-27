import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import { Image } from 'react-native';

import type { CryptoAdapter, DimReader, FsAdapter } from './imageStore';

/**
 * 设备侧适配器：expo-file-system + expo-crypto + RN Image。
 * 仅供运行期使用；测试用内存 fake 适配器。
 */

function fileUri(absPath: string): string {
  return absPath.startsWith('file://') ? absPath : `file://${absPath}`;
}

export function makeExpoFs(rootAbs: string): FsAdapter {
  const stagingDir = `${rootAbs}/_staging/`;
  return {
    ensureDirs: async () => {
      for (const sub of ['originals/', 'masks/', 'previews/', 'thumbnails/', '_staging/']) {
        await FileSystem.makeDirectoryAsync(`${rootAbs}/${sub}`, { intermediates: true });
      }
    },
    copyToStaged: async (sourceUri, stagedAbsPath) => {
      await FileSystem.makeDirectoryAsync(stagingDir, { intermediates: true });
      // 源不可读时 copyAsync 抛错，调用方据此中止且不产生持久文件。
      await FileSystem.copyAsync({ from: sourceUri, to: fileUri(stagedAbsPath) });
    },
    moveStagedToFinal: async (stagedAbsPath, finalAbsPath) => {
      await FileSystem.moveAsync({ from: fileUri(stagedAbsPath), to: fileUri(finalAbsPath) });
    },
    deleteIfExists: async (absPath) => {
      try {
        await FileSystem.deleteAsync(fileUri(absPath), { idempotent: true });
      } catch {
        /* 不存在即忽略 */
      }
    },
    exists: async (absPath) => {
      const info = await FileSystem.getInfoAsync(fileUri(absPath));
      return info.exists;
    },
    size: async (absPath) => {
      const info = await FileSystem.getInfoAsync(fileUri(absPath));
      return info.exists && typeof info.size === 'number' ? info.size : 0;
    },
    readBase64: async (absPath) =>
      FileSystem.readAsStringAsync(fileUri(absPath), {
        encoding: FileSystem.EncodingType.Base64,
      }),
  };
}

export const expoCrypto: CryptoAdapter = {
  sha256Base64: async (base64) => {
    // 仅用于哈希计算，base64 不入库（满足「不把图片转成 Base64 存进状态或数据库」）。
    return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, base64);
  },
};

export const rnDimReader: DimReader = (uri) =>
  new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      reject,
    );
  });
