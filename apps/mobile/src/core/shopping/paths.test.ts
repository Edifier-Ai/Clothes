/** @jest-environment node */
import { describe, expect, it } from '@jest/globals';

import {
  assertSafeCandidateImagePath,
  assertSafeWardrobeImagePath,
  isSafeCandidateImagePath,
  isSafeWardrobeImagePath,
} from './paths';

describe('shopping image path boundary', () => {
  it('仅允许约定私有目录下的单层相对文件', () => {
    expect(isSafeCandidateImagePath('shopping/019c-file.jpg')).toBe(true);
    expect(isSafeWardrobeImagePath('originals/g1.jpg')).toBe(true);
    expect(isSafeWardrobeImagePath('previews/g1.png')).toBe(true);
    expect(isSafeWardrobeImagePath('thumbnails/g1.webp')).toBe(true);
  });

  it.each([
    '../originals/g1.jpg',
    'shopping/../originals/g1.jpg',
    'shopping/nested/g1.jpg',
    '/shopping/g1.jpg',
    'file:///shopping/g1.jpg',
    'https://example.com/g1.jpg',
    'C:/shopping/g1.jpg',
    'shopping\\g1.jpg',
    'shopping/g1.jpg\n',
  ])('拒绝恶意候选路径 %s', (path) => {
    expect(isSafeCandidateImagePath(path)).toBe(false);
    expect(() => assertSafeCandidateImagePath(path)).toThrow(/unsafe/i);
  });

  it('衣橱读取拒绝 shopping、staging、协议和路径穿越', () => {
    for (const path of ['shopping/g1.jpg', '_staging/g1.jpg', 'originals/../g1.jpg', 'content://x', '/originals/g1.jpg']) {
      expect(isSafeWardrobeImagePath(path)).toBe(false);
      expect(() => assertSafeWardrobeImagePath(path)).toThrow(/unsafe/i);
    }
  });
});
