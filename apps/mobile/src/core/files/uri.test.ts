import { describe, expect, it, jest } from '@jest/globals';

/**
 * originalUri 契约（MVP-008 缺陷 2 根因回归测试）：
 * expo-file-system 的 documentDirectory 本身已带 file:// scheme，originalUri
 * 不得再拼一次 —— 双 scheme（file://file://…）expo-image 能容忍，
 * 但 readAsStringAsync/getInfoAsync/writeAsStringAsync 在真机全部失败，
 * 导致画布/封面解码静默失败只剩占位框（catch 吞错，logcat 无迹）。
 */

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///data/user/0/com.clothes.app/files/',
}));

// eslint-disable-next-line import/first
import { originalUri } from './uri';

describe('originalUri（单一 file:// scheme）', () => {
  it('documentDirectory 已带 scheme 时不重复拼接', () => {
    const uri = originalUri('covers/look-1.png');
    expect(uri).toBe('file:///data/user/0/com.clothes.app/files/clothes/covers/look-1.png');
    expect(uri.match(/file:\/\//g)).toHaveLength(1);
  });

  it('任意相对路径都可被 expo-file-system 直接读写（scheme 恰好一次）', () => {
    const uri = originalUri('thumbnails/g1.png');
    expect(uri.startsWith('file://file://')).toBe(false);
    expect(uri).toContain('/clothes/thumbnails/g1.png');
  });
});
