import { queryWardrobe } from '@/core/garments/service';
import type { PickCandidate } from './pickFilter';

/** 衣橱全集 → 选衣候选（含归档标记与 brand/note 标签，供过滤与展示）。
 * imageRelPath 取预览通道（与封面同源，画布/槽位卡渲染用）；
 * thumbnailRelPath 取缩略图通道（面板列表小图标用）。 */
export async function loadPickCandidates(): Promise<PickCandidate[]> {
  const entries = await queryWardrobe({}, 'recentAdded');
  return entries.map((e) => {
    const tag = (k: string) => e.item.tags.find((t) => t.kind === k)?.value ?? null;
    return {
      id: e.item.garment.id,
      name: e.item.garment.name,
      category: e.item.garment.category as PickCandidate['category'],
      status: e.item.garment.status as PickCandidate['status'],
      archivedAt: e.item.garment.archivedAt,
      brand: tag('brand'),
      note: tag('note'),
      imageRelPath: e.previewRelPath,
      thumbnailRelPath: e.imageRelPath,
    };
  });
}
