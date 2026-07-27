/** 抠图基准指标：IoU、像素准确率、分级、延迟分位。 */

export interface MaskPair {
  gt: Uint8Array; // ground truth alpha 0..255
  pred: Uint8Array; // 预测 alpha 0..255
}

const BIN = 128; // 二值化阈值

function binarize(a: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] >= BIN ? 1 : 0;
  return out;
}

/** 交并比（二值化后）。 */
export function iou({ gt, pred }: MaskPair): number {
  const g = binarize(gt);
  const p = binarize(pred);
  let inter = 0;
  let union = 0;
  for (let i = 0; i < g.length; i++) {
    if (g[i] | p[i]) union++;
    if (g[i] & p[i]) inter++;
  }
  return union === 0 ? 1 : inter / union; // 空前景且空预测视为正确
}

export function pixelAccuracy({ gt, pred }: MaskPair): number {
  const g = binarize(gt);
  const p = binarize(pred);
  let ok = 0;
  for (let i = 0; i < g.length; i++) if (g[i] === p[i]) ok++;
  return ok / g.length;
}

/** 分级：usable / marginal / severe。阈值与报告同源，反向验证脚本复用。 */
export type Grade = 'usable' | 'marginal' | 'severe';

export function grade(iouScore: number, errored: boolean): Grade {
  if (errored || iouScore < 0.5) return 'severe';
  if (iouScore >= 0.85) return 'usable';
  return 'marginal';
}

export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export interface Summary {
  total: number;
  usable: number;
  marginal: number;
  severe: number;
  usableRate: number;
  severeRate: number;
  p50Ms: number;
  p95Ms: number;
  /** 验收是否达真实样本门槛（仅当真图时才有意义；合成夹具下作管线自检）。 */
  passesRealThreshold: boolean;
}

export function summarize(
  grades: Grade[],
  latenciesMs: number[],
  opts: { usableMin?: number; severeMax?: number } = {},
): Summary {
  const usableMin = opts.usableMin ?? 0.8;
  const severeMax = opts.severeMax ?? 0.05;
  const total = grades.length;
  const usable = grades.filter((g) => g === 'usable').length;
  const marginal = grades.filter((g) => g === 'marginal').length;
  const severe = grades.filter((g) => g === 'severe').length;
  const sorted = [...latenciesMs].sort((a, b) => a - b);
  const usableRate = total ? usable / total : 0;
  const severeRate = total ? severe / total : 0;
  return {
    total,
    usable,
    marginal,
    severe,
    usableRate,
    severeRate,
    p50Ms: percentile(sorted, 50),
    p95Ms: percentile(sorted, 95),
    passesRealThreshold: usableRate >= usableMin && severeRate <= severeMax,
  };
}
