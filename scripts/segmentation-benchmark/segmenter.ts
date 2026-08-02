/**
 * 抠图 segmenter 适配层。统一接口，候选模型可插拔；走文件路径/二进制，不走 Base64。
 *
 * - StubSegmenter：确定性启发式（中心椭圆 + 颜色对比），用于无模型时跑通管线/自检。
 * - TencentCiSegmenter：腾讯云数据万象 GoodsMatting 商品抠图（见 tencentCi.ts）；
 *   凭证缺失时 available=false，基准据此把该候选记为「未运行/淘汰原因=配置不可用」，绝不伪造结果。
 *   （端侧 ONNX 路线已作废：2026-07-31 拍板改用现成分割 API。）
 */
import type { RGBA } from './pngUtil';

export interface SegmentResult {
  alpha: Uint8Array; // 0..255
  ms: number;
}

export interface Segmenter {
  name: string;
  /** 模型体积字节（无则 0）。 */
  modelBytes: number;
  /** 模型 sha256（无则 ''）。 */
  modelHash: string;
  available: boolean;
  unavailableReason?: string;
  segment(image: RGBA): Promise<SegmentResult>;
}

/** 启发式 stub：以图像中心椭圆 + 与四角背景色差 估计前景。 */
export class StubSegmenter implements Segmenter {
  name = 'stub-heuristic';
  modelBytes = 0;
  modelHash = '';
  available = true;

  async segment(image: RGBA): Promise<SegmentResult> {
    const t0 = performance.now();
    const { width: w, height: h, data } = image;
    const alpha = new Uint8Array(w * h);
    // 背景采样：四角均值
    const corners = [0, w - 1, (h - 1) * w, (h - 1) * w + w - 1];
    let br = 0;
    let bg = 0;
    let bb = 0;
    for (const c of corners) {
      br += data[c * 4];
      bg += data[c * 4 + 1];
      bb += data[c * 4 + 2];
    }
    br /= 4;
    bg /= 4;
    bb /= 4;
    // 颜色距离图
    const dist = new Float32Array(w * h);
    const hist = new Array(256).fill(0);
    for (let i = 0; i < w * h; i++) {
      const d = Math.min(255, Math.hypot(data[i * 4] - br, data[i * 4 + 1] - bg, data[i * 4 + 2] - bb));
      dist[i] = d;
      hist[Math.round(d)]++;
    }
    // Otsu 自适应阈值（对双峰：前景/背景 色差 鲁棒，含低对比难例）
    const total = w * h;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0;
    let wB = 0;
    let maxVar = 0;
    let thr = 30;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > maxVar) {
        maxVar = v;
        thr = t;
      }
    }
    const cx = w / 2;
    const cy = h / 2;
    const raw = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const centerBias = Math.max(0, 1 - Math.hypot((x - cx) / (w * 0.5), (y - cy) / (h * 0.5)));
        // 中心先验轻微下调阈值，边缘上调，抑制背景噪声与流苏误纳
        const localThr = thr * (1 - 0.25 * centerBias);
        raw[i] = dist[i] > localThr ? 1 : 0;
      }
    }
    // 仅保留「中心高斯加权得分」最高的连通域：中心衣物 > 大面积背景纹理/流苏散点
    const labels = new Int32Array(w * h);
    let comp = 0;
    const compScore: number[] = [0];
    const stack: number[] = [];
    const sigmaX = w * 0.32;
    const sigmaY = h * 0.32;
    for (let i = 0; i < raw.length; i++) {
      if (raw[i] === 1 && labels[i] === 0) {
        comp++;
        compScore[comp] = 0;
        stack.length = 0;
        stack.push(i);
        labels[i] = comp;
        while (stack.length) {
          const p = stack.pop()!;
          const px = p % w;
          const py = (p / w) | 0;
          const gx = Math.exp(-((px - cx) * (px - cx)) / (2 * sigmaX * sigmaX));
          const gy = Math.exp(-((py - cy) * (py - cy)) / (2 * sigmaY * sigmaY));
          compScore[comp] += gx * gy;
          const nb = [p - 1, p + 1, p - w, p + w];
          for (const q of nb) {
            if (q >= 0 && q < raw.length && raw[q] === 1 && labels[q] === 0) {
              labels[q] = comp;
              stack.push(q);
            }
          }
        }
      }
    }
    let keep = 0;
    let best = 0;
    for (let c = 1; c <= comp; c++) {
      if (compScore[c] > best) {
        best = compScore[c];
        keep = c;
      }
    }
    for (let i = 0; i < alpha.length; i++) alpha[i] = labels[i] === keep ? 255 : 0;
    return { alpha, ms: performance.now() - t0 };
  }
}
