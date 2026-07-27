/**
 * 可替换抠图引擎接口（TECH_STACK §4：业务层不感知具体模型）。
 * MVP-003 用 StubSegmentationEngine 跑通队列+修边+持久；MVP-002 解锁真模型后注入 ONNX 实现。
 * 输入/输出走文件路径或二进制 Uint8Array，不走 Base64。
 */

export interface SegmentationInput {
  /** 源图绝对路径 */
  sourcePath: string;
  /** 输出蒙版分辨率（引擎可内部缩放） */
  maskWidth: number;
  maskHeight: number;
}

export interface SegmentationOutput {
  /** alpha 蒙版 0..255，长度 maskWidth*maskHeight */
  alpha: Uint8Array;
  width: number;
  height: number;
  ms: number;
}

export interface SegmentationEngine {
  readonly name: string;
  available: boolean;
  unavailableReason?: string;
  segment(input: SegmentationInput): Promise<SegmentationOutput>;
}

/** 读取源图像素的钩子（设备用 expo-image/Skia 解码；测试注入 pngjs 解码）。 */
export type PixelReader = (path: string) => Promise<{ width: number; height: number; rgba: Uint8Array }>;

/**
 * Stub 引擎：中心椭圆 + 颜色对比启发式，复用基准 stub 思路。
 * 需要 PixelReader 把源图解码为 RGBA（引擎本身不绑解码器，便于跨 host/RN）。
 */
export class StubSegmentationEngine implements SegmentationEngine {
  readonly name = 'stub';
  available = true;
  constructor(private readPixels: PixelReader) {}

  async segment(input: SegmentationInput): Promise<SegmentationOutput> {
    const t0 = performance.now();
    const { width: sw, height: sh, rgba } = await this.readPixels(input.sourcePath);
    const { maskWidth: mw, maskHeight: mh } = input;
    // 在源分辨率算颜色距离 + Otsu，再采样到蒙版分辨率
    const corners = [0, sw - 1, (sh - 1) * sw, (sh - 1) * sw + sw - 1];
    let br = 0;
    let bg = 0;
    let bb = 0;
    for (const c of corners) {
      br += rgba[c * 4];
      bg += rgba[c * 4 + 1];
      bb += rgba[c * 4 + 2];
    }
    br /= 4;
    bg /= 4;
    bb /= 4;
    const hist = new Array(256).fill(0);
    const dist = new Float32Array(sw * sh);
    for (let i = 0; i < sw * sh; i++) {
      const d = Math.min(255, Math.hypot(rgba[i * 4] - br, rgba[i * 4 + 1] - bg, rgba[i * 4 + 2] - bb));
      dist[i] = d;
      hist[Math.round(d)]++;
    }
    const total = sw * sh;
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
    const alpha = new Uint8Array(mw * mh);
    const cx = sw / 2;
    const cy = sh / 2;
    for (let y = 0; y < mh; y++) {
      for (let x = 0; x < mw; x++) {
        const sx = Math.min(sw - 1, Math.floor((x / mw) * sw));
        const sy = Math.min(sh - 1, Math.floor((y / mh) * sh));
        const si = sy * sw + sx;
        const centerBias = Math.max(0, 1 - Math.hypot((sx - cx) / (sw * 0.5), (sy - cy) / (sh * 0.5)));
        const localThr = thr * (1 - 0.25 * centerBias);
        alpha[y * mw + x] = dist[si] > localThr ? 255 : 0;
      }
    }
    return { alpha, width: mw, height: mh, ms: performance.now() - t0 };
  }
}
