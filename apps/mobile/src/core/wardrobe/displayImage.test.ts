/**
 * @jest-environment node
 *
 * 衣物展示图双通道（MVP-008 编辑器↔封面一致性修复）：
 * 网格/列表图标走缩略图（小、省内存）；造型画布/槽位卡/封面走预览图
 * （透明底、真实宽高比，与 rebuildCoverSpec 同源）。
 * 修复前画布用 96×96 方形压缩缩略图、封面用预览，导致所见≠所得。
 */
import { describe, expect, it } from '@jest/globals';

import { displayImagePaths } from '../garments/service';

describe('displayImagePaths（缩略图/预览双通道）', () => {
  it('抠图成功：thumb 取缩略图优先，preview 取预览优先', () => {
    const r = displayImagePaths(
      { previewRelPath: 'previews/g1.png', thumbnailRelPath: 'thumbnails/g1.png' },
      'originals/g1.png',
    );
    expect(r.thumb).toBe('thumbnails/g1.png');
    expect(r.preview).toBe('previews/g1.png');
  });

  it('缩略图缺失：thumb 回退预览；预览缺失：preview 回退缩略图', () => {
    const noThumb = displayImagePaths(
      { previewRelPath: 'previews/g1.png', thumbnailRelPath: null },
      'originals/g1.png',
    );
    expect(noThumb.thumb).toBe('previews/g1.png');
    expect(noThumb.preview).toBe('previews/g1.png');
    const noPreview = displayImagePaths(
      { previewRelPath: null, thumbnailRelPath: 'thumbnails/g1.png' },
      'originals/g1.png',
    );
    expect(noPreview.thumb).toBe('thumbnails/g1.png');
    expect(noPreview.preview).toBe('thumbnails/g1.png');
  });

  it('无抠图任务：双通道均回退原图；无资产则为 null', () => {
    const r = displayImagePaths(undefined, 'originals/g1.png');
    expect(r.thumb).toBe('originals/g1.png');
    expect(r.preview).toBe('originals/g1.png');
    const empty = displayImagePaths(undefined, null);
    expect(empty.thumb).toBeNull();
    expect(empty.preview).toBeNull();
  });
});
