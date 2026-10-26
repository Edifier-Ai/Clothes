import type { GarmentCategory } from '../db/schema';

/** 衣物类别的展示顺序与中文名（录入、归类、筛选共用）。 */
export const GARMENT_CATEGORIES: readonly { value: GarmentCategory; label: string }[] = [
  { value: 'top', label: '上装' },
  { value: 'bottom', label: '下装' },
  { value: 'dress', label: '连衣裙' },
  { value: 'shoes', label: '鞋' },
  { value: 'outerwear', label: '外套' },
  { value: 'accessory', label: '配饰' },
  { value: 'other', label: '其他' },
];

export const GARMENT_CATEGORY_LABEL: Readonly<Record<GarmentCategory, string>> = Object.freeze(
  Object.fromEntries(GARMENT_CATEGORIES.map((c) => [c.value, c.label])) as Record<GarmentCategory, string>,
);

/** 批量导入/引导生成的占位名（「衣物」「衣物 3」「未命名衣物」）：用户没起过名，可被自动命名覆盖。 */
export function isPlaceholderName(name: string | null | undefined): boolean {
  const n = (name ?? '').trim();
  return n === '' || n === '未命名衣物' || /^衣物( \d+)?$/.test(n);
}

/** 自动命名：有主色时「藏青 上装」，否则只用类别名。 */
export function autoGarmentName(category: GarmentCategory, color?: string | null): string {
  const label = GARMENT_CATEGORY_LABEL[category] ?? '衣物';
  const c = color?.trim();
  return c ? `${c}${label}` : label;
}
