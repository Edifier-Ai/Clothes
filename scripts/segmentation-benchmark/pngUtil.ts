/**
 * 抠图基准 —— 纯 JS PNG 工具（基于 pngjs，host 侧）。
 *
 * 生成确定性合成夹具：已知椭圆「衣物」前景 + 可变背景 + 可选毛发/流苏边缘，
 * 并产出真实 alpha 蒙版作为 ground truth，使基准可在无真图时复跑（卡片因此 BLOCKED，
 * 见 BLOCKED.md B-5；真图到位后替换 fixtures 即可复用同一管线）。
 */
import { Buffer } from 'buffer';
import { PNG } from 'pngjs';

export interface RGBA {
  width: number;
  height: number;
  data: Buffer; // length width*height*4
}

export interface FixtureSpec {
  id: string;
  /** 前景（衣物）RGB */
  fg: [number, number, number];
  /** 背景类型 */
  bg: 'white' | 'black' | 'checker' | 'busy' | 'shadow';
  /** 椭圆半轴比例（相对宽高） */
  rx: number;
  ry: number;
  /** 边缘难度：none 实边 / fringe 流苏 / lace 蕾丝孔 */
  edge: 'none' | 'fringe' | 'lace';
  /** 前景与背景对比度难度：low 表示低对比（黑衣/白衣难例） */
  contrast: 'normal' | 'low';
}

function setPx(buf: Buffer, w: number, x: number, y: number, r: number, g: number, b: number, a: number): void {
  const i = (y * w + x) * 4;
  buf[i] = r;
  buf[i + 1] = g;
  buf[i + 2] = b;
  buf[i + 3] = a;
}

/** 简单确定性哈希 → [0,1)，用于可复现噪声。 */
function hash01(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

function bgPixel(bg: FixtureSpec['bg'], x: number, y: number, w: number, h: number): [number, number, number] {
  switch (bg) {
    case 'white':
      return [245, 243, 238];
    case 'black':
      return [18, 18, 20];
    case 'checker': {
      const c = ((Math.floor(x / 16) + Math.floor(y / 16)) & 1) === 0;
      return c ? [210, 200, 180] : [150, 140, 120];
    }
    case 'shadow': {
      const g = 120 + Math.floor(60 * (y / h));
      return [g, g - 6, g - 12];
    }
    case 'busy': {
      const n = hash01(x, y, 7);
      const base = 90 + Math.floor(n * 120);
      return [base, Math.floor(base * 0.8), Math.floor(base * 0.6)];
    }
  }
}

/** 生成夹具 RGBA 与 ground-truth alpha（0..255）。 */
export function makeFixture(spec: FixtureSpec, w = 256, h = 320): { image: RGBA; alpha: Uint8Array } {
  const img = Buffer.alloc(w * h * 4);
  const alpha = new Uint8Array(w * h);
  const cx = w / 2;
  const cy = h / 2;
  const rx = spec.rx * w;
  const ry = spec.ry * h;
  let [fr, fg, fb] = spec.fg;
  if (spec.contrast === 'low') {
    // 低对比：把前景往背景均值拉近，模拟黑底黑衣/白底白衣难例
    const bgAvg = spec.bg === 'black' ? 18 : spec.bg === 'white' ? 243 : 150;
    fr = Math.round(fr * 0.4 + bgAvg * 0.6);
    fg = Math.round(fg * 0.4 + bgAvg * 0.6);
    fb = Math.round(fb * 0.4 + bgAvg * 0.6);
  }
  const seed = spec.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy; // <=1 椭圆内
      let a = 0;
      if (d <= 1) {
        a = 255;
        if (spec.edge === 'fringe') {
          // 边缘流苏：靠边界处按噪声削掉部分像素
          const edge = 1 - Math.sqrt(d);
          if (edge < 0.12 && hash01(x, y, seed) < 0.5) a = 0;
        } else if (spec.edge === 'lace') {
          // 蕾丝孔：内部周期孔洞
          if (((x + y) & 7) < 2) a = 0;
        }
      } else if (spec.edge === 'fringe' && d < 1.15) {
        // 椭圆外一圈稀疏流苏
        if (hash01(x, y, seed + 1) < 0.25) a = 180;
      }
      alpha[y * w + x] = a;
      const [br, bg2, bb] = bgPixel(spec.bg, x, y, w, h);
      const af = a / 255;
      const r = Math.round(fr * af + br * (1 - af));
      const g = Math.round(fg * af + bg2 * (1 - af));
      const b = Math.round(fb * af + bb * (1 - af));
      setPx(img, w, x, y, r, g, b, 255);
    }
  }
  return { image: { width: w, height: h, data: img }, alpha };
}

export function encodePNG(rgba: RGBA): Buffer {
  const png = new PNG({ width: rgba.width, height: rgba.height });
  rgba.data.copy(png.data);
  return PNG.sync.write(png);
}

export function encodeAlphaPNG(alpha: Uint8Array, w: number, h: number): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    const v = alpha[i];
    png.data[i * 4] = v;
    png.data[i * 4 + 1] = v;
    png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png);
}

export function decodePNG(buf: Buffer): RGBA {
  const png = PNG.sync.read(buf);
  return { width: png.width, height: png.height, data: png.data as Buffer };
}

/** 从 RGBA 取灰度 alpha 通道（约定抠图输出存于 RGB 的 R 或单独 alpha PNG）。 */
export function rgbaToGray(rgba: RGBA): Uint8Array {
  const g = new Uint8Array(rgba.width * rgba.height);
  for (let i = 0; i < g.length; i++) g[i] = rgba.data[i * 4]; // 取 R 通道作为预测蒙版
  return g;
}
