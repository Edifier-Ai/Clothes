/**
 * 洞察页视图 helpers（MVP-011）：纯展示映射，无副作用。
 *
 * 口径与 metrics.ts/insightsService.ts 对齐：
 * - 价格用「分」存，UI 按「元」展示（÷100，保留两位小数）。
 * - 成本/次 null 时不显示数值，UI 给出原因（未填价格 / 还未穿过）。
 * - 久未穿天数与阈值显示「≥30 天未穿」式语义，不暴露 epoch。
 */
import type { GarmentCostRow, IdleGarment, IdleThreshold } from '@/core/insights/metrics';

export const CATEGORY_LABEL: Record<string, string> = {
  top: '上装',
  bottom: '下装',
  dress: '连衣裙',
  shoes: '鞋',
  outerwear: '外套',
  accessory: '配饰',
  other: '其他',
};

export const IDLE_THRESHOLD_LABEL: Record<IdleThreshold, string> = {
  30: '30–60 天未穿',
  60: '60–90 天未穿',
  90: '90 天以上未穿',
};

/** 分 → 元（保留 2 位小数；null 返回 null）。 */
export function formatPrice(priceMinor: number | null): string | null {
  if (priceMinor == null) return null;
  return (priceMinor / 100).toFixed(2);
}

/** 成本/次展示：null 给原因，数值给「¥X.XX/次」。 */
export function formatCostPerWear(row: GarmentCostRow): string {
  if (row.costPerWearMinor == null) {
    if (row.priceMinor == null || row.priceMinor <= 0) return '未填价格';
    if (row.timesWorn === 0) return '还未穿过';
    return '—';
  }
  return `¥${(row.costPerWearMinor / 100).toFixed(2)}/次`;
}

/** 久未穿展示：「未穿过」或「N 天未穿」。 */
export function formatIdleDays(item: IdleGarment): string {
  if (item.daysSinceLastWorn == null) return '录入后未穿过';
  return `${item.daysSinceLastWorn} 天未穿`;
}

/** 重复率展示：0.333 → "33%"。 */
export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

/** 平均次数展示：1.5 → "1.5"。 */
export function formatAvg(avg: number): string {
  return avg.toFixed(1);
}
