/**
 * u2netp 端侧抠图的纯计算部分（无原生依赖，可在 Node/Jest 直接覆盖）。
 *
 * 预处理与后处理对齐 rembg 的 u2netp 会话（2026-10-24 本地模型基准即按此口径评估，
 * 见 /mnt/project-files/segmentation-bench/REPORT.md）：
 *   输入：320×320 RGB，先整体除以最大像素值，再按 ImageNet 均值/方差逐通道标准化，CHW 排列；
 *   输出：取第一个输出的 320×320 显著性图，min-max 归一化到 0..1，再缩放到目标蒙版尺寸。
 */

export const U2NET_SIZE = 320;

const MEAN = [0.485, 0.456, 0.406] as const;
const STD = [0.229, 0.224, 0.225] as const;

/** 320×320 非预乘 RGBA → 模型输入张量数据（1×3×320×320，float32）。 */
export function preprocessU2net(rgba: Uint8Array, size: number = U2NET_SIZE): Float32Array {
  const n = size * size;
  if (rgba.length !== n * 4) {
    throw new Error(`u2net preprocess: rgba length ${rgba.length} != ${n * 4}`);
  }
  let max = 0;
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (rgba[p] > max) max = rgba[p];
    if (rgba[p + 1] > max) max = rgba[p + 1];
    if (rgba[p + 2] > max) max = rgba[p + 2];
  }
  const scale = max > 0 ? 1 / max : 0;
  const out = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const p = i * 4;
    out[i] = (rgba[p] * scale - MEAN[0]) / STD[0];
    out[n + i] = (rgba[p + 1] * scale - MEAN[1]) / STD[1];
    out[2 * n + i] = (rgba[p + 2] * scale - MEAN[2]) / STD[2];
  }
  return out;
}

/** 模型输出（size×size 显著性图）→ min-max 归一化 → 双线性缩放到 outW×outH 的 0..255 alpha。 */
export function postprocessU2net(
  saliency: Float32Array,
  outW: number,
  outH: number,
  size: number = U2NET_SIZE,
): Uint8Array {
  if (saliency.length !== size * size) {
    throw new Error(`u2net postprocess: output length ${saliency.length} != ${size * size}`);
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < saliency.length; i++) {
    const v = saliency[i];
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  const norm = new Float32Array(saliency.length);
  if (range > 1e-6) {
    for (let i = 0; i < saliency.length; i++) norm[i] = (saliency[i] - min) / range;
  }
  const alpha = new Uint8Array(outW * outH);
  // 像素中心对齐的双线性采样（与 PIL resize 的坐标约定一致）。
  const sx = size / outW;
  const sy = size / outH;
  for (let y = 0; y < outH; y++) {
    const fy = Math.min(size - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(size - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < outW; x++) {
      const fx = Math.min(size - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(size - 1, x0 + 1);
      const wx = fx - x0;
      const top = norm[y0 * size + x0] * (1 - wx) + norm[y0 * size + x1] * wx;
      const bottom = norm[y1 * size + x0] * (1 - wx) + norm[y1 * size + x1] * wx;
      alpha[y * outW + x] = Math.round((top * (1 - wy) + bottom * wy) * 255);
    }
  }
  return alpha;
}
