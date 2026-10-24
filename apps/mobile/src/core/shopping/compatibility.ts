import type { GarmentCategory } from '../db/schema';
import { isAvailable } from '../recommend';
import type {
  ShoppingCandidateSlot,
  ShoppingCompatibleLook,
  ShoppingLookItem,
  ShoppingWardrobeItem,
} from './types';

const MAX_PREVIEWS = 3;
type SlotValue = ShoppingWardrobeItem | '$candidate' | null;

export interface ShoppingCompatibilityBuild {
  /** 精确合法组合总数，不因 preview 上限截断。 */
  total: number;
  /** 稳定、最多三套的有界预览。 */
  previews: ShoppingCompatibleLook[];
}

function candidateSlot(category: GarmentCategory): ShoppingCandidateSlot | null {
  if (category === 'top' || category === 'bottom' || category === 'dress' || category === 'shoes' || category === 'outerwear') {
    return category;
  }
  return null;
}

function slotId(value: SlotValue): string {
  return value === '$candidate' ? '$candidate' : value?.id ?? '-';
}

function lookItems(values: readonly SlotValue[]): ShoppingLookItem[] {
  const seen = new Set<string>();
  const result: ShoppingLookItem[] = [];
  for (const value of values) {
    if (!value || value === '$candidate' || seen.has(value.id)) continue;
    seen.add(value.id);
    result.push({
      garmentId: value.id,
      name: value.name,
      category: value.category,
      imageRelPath: value.imageRelPath,
    });
  }
  return result;
}

/**
 * 推荐引擎在 weather=null 时的合法槽位精确计数 + 有界预览。
 *
 * 与 `recommend/replacement.buildOutfits` 使用相同 `isAvailable` 和槽位规则，但不生成
 * T×B×S×O 的全量数组。对 300 件衣橱只保留分类索引和最多三套预览。
 */
export function buildShoppingCompatibleLooks(
  _candidateId: string,
  category: GarmentCategory,
  wardrobe: readonly ShoppingWardrobeItem[],
): ShoppingCompatibilityBuild {
  const slot = candidateSlot(category);
  if (!slot) return { total: 0, previews: [] };
  const pool = wardrobe.filter(isAvailable).sort((left, right) => left.id.localeCompare(right.id));
  const tops = pool.filter((item) => item.category === 'top');
  const bottoms = pool.filter((item) => item.category === 'bottom');
  const dresses = pool.filter((item) => item.category === 'dress');
  const shoes = pool.filter((item) => item.category === 'shoes');
  const outerwear = pool.filter((item) => item.category === 'outerwear');
  // weather=null：与推荐引擎一致，外套可不选，或任选一件可用外套。
  const outerOptions: (ShoppingWardrobeItem | null)[] = [null, ...outerwear];
  const baseStandard = tops.length * bottoms.length * shoes.length;
  const baseDress = dresses.length * shoes.length;
  const total =
    category === 'top'
      ? bottoms.length * shoes.length * outerOptions.length
      : category === 'bottom'
        ? tops.length * shoes.length * outerOptions.length
        : category === 'dress'
          ? shoes.length * outerOptions.length
          : category === 'shoes'
            ? (tops.length * bottoms.length + dresses.length) * outerOptions.length
            : baseStandard + baseDress;

  const previews: ShoppingCompatibleLook[] = [];
  // 按稳定排序取每一维的最短前缀即可覆盖字典序最前的三套；循环上界固定为 3^4。
  const previewTops = tops.slice(0, MAX_PREVIEWS);
  const previewBottoms = bottoms.slice(0, MAX_PREVIEWS);
  const previewDresses = dresses.slice(0, MAX_PREVIEWS);
  const previewShoes = shoes.slice(0, MAX_PREVIEWS);
  const previewOuter = outerOptions.slice(0, MAX_PREVIEWS);
  const add = (top: SlotValue, bottom: SlotValue, shoe: SlotValue, outer: SlotValue) => {
    if (previews.length >= MAX_PREVIEWS) return;
    previews.push({
      id: `top:${slotId(top)}|bottom:${slotId(bottom)}|shoes:${slotId(shoe)}|outerwear:${slotId(outer)}`,
      candidateSlot: slot,
      items: lookItems([top, bottom, shoe, outer]),
    });
  };

  if (category === 'top') {
    for (const bottom of previewBottoms) for (const shoe of previewShoes) for (const outer of previewOuter) add('$candidate', bottom, shoe, outer);
  } else if (category === 'bottom') {
    for (const top of previewTops) for (const shoe of previewShoes) for (const outer of previewOuter) add(top, '$candidate', shoe, outer);
  } else if (category === 'dress') {
    for (const shoe of previewShoes) for (const outer of previewOuter) add('$candidate', '$candidate', shoe, outer);
  } else if (category === 'shoes') {
    for (const top of previewTops) for (const bottom of previewBottoms) for (const outer of previewOuter) add(top, bottom, '$candidate', outer);
    if (previews.length < MAX_PREVIEWS) {
      for (const dress of previewDresses) for (const outer of previewOuter) add(dress, dress, '$candidate', outer);
    }
  } else {
    for (const top of previewTops) for (const bottom of previewBottoms) for (const shoe of previewShoes) add(top, bottom, shoe, '$candidate');
    if (previews.length < MAX_PREVIEWS) for (const dress of previewDresses) for (const shoe of previewShoes) add(dress, dress, shoe, '$candidate');
  }
  return { total, previews };
}
