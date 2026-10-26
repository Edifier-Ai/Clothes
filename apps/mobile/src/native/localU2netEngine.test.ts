/**
 * @jest-environment node
 */
import { describe, expect, it, jest } from '@jest/globals';

import { LocalU2netEngine, type U2netSession } from './localU2netEngine';
import { postprocessU2net, preprocessU2net, U2NET_SIZE } from './u2net';

const N = U2NET_SIZE * U2NET_SIZE;

describe('u2net 预处理', () => {
  it('按最大像素值缩放后做 ImageNet 标准化，输出 CHW', () => {
    const rgba = new Uint8Array(N * 4);
    // 第 0 个像素纯红，其余全黑：最大值 255 → 红色通道为 (1-0.485)/0.229
    rgba[0] = 255;
    const x = preprocessU2net(rgba);
    expect(x).toHaveLength(3 * N);
    expect(x[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
    expect(x[N]).toBeCloseTo((0 - 0.456) / 0.224, 5);
    expect(x[2 * N]).toBeCloseTo((0 - 0.406) / 0.225, 5);
    expect(x[1]).toBeCloseTo((0 - 0.485) / 0.229, 5);
  });

  it('暗图同样拉伸到满量程（与 rembg 一致，忽略 alpha 通道）', () => {
    const rgba = new Uint8Array(N * 4).fill(100);
    const x = preprocessU2net(rgba);
    expect(x[0]).toBeCloseTo((1 - 0.485) / 0.229, 5);
  });

  it('尺寸不符时报错', () => {
    expect(() => preprocessU2net(new Uint8Array(16))).toThrow(/rgba length/);
  });
});

describe('u2net 后处理', () => {
  it('min-max 归一化到 0..255', () => {
    const out = new Float32Array(N).fill(-3);
    out[0] = 5;
    const alpha = postprocessU2net(out, U2NET_SIZE, U2NET_SIZE);
    expect(alpha[0]).toBe(255);
    expect(alpha[1]).toBe(0);
  });

  it('缩放到任意蒙版尺寸：左半前景、右半背景时边界落在中间', () => {
    const out = new Float32Array(N);
    for (let y = 0; y < U2NET_SIZE; y++) for (let x = 0; x < U2NET_SIZE / 2; x++) out[y * U2NET_SIZE + x] = 1;
    const alpha = postprocessU2net(out, 256, 320);
    expect(alpha).toHaveLength(256 * 320);
    expect(alpha[10 * 256 + 10]).toBe(255);
    expect(alpha[10 * 256 + 250]).toBe(0);
    expect(alpha[10 * 256 + 127]).toBeGreaterThan(alpha[10 * 256 + 129]);
  });

  it('输出恒定（模型无响应）时给全透明蒙版而不是 NaN', () => {
    const alpha = postprocessU2net(new Float32Array(N).fill(0.3), 8, 8);
    expect(Array.from(alpha)).toEqual(new Array(64).fill(0));
  });
});

describe('LocalU2netEngine', () => {
  const session: U2netSession = { run: async () => new Float32Array(N).fill(1).map((_, i) => (i % 2 ? 1 : 0)) };

  it('segment：缩放读图 → 推理 → 输出请求尺寸的蒙版', async () => {
    const readResized = jest.fn(async (_path: string, size: number) => new Uint8Array(size * size * 4));
    const engine = new LocalU2netEngine({ readResized, loadSession: async () => session });
    const out = await engine.segment({ sourcePath: '/a.jpg', maskWidth: 64, maskHeight: 80 });
    expect(readResized).toHaveBeenCalledWith('/a.jpg', U2NET_SIZE);
    expect(out.width).toBe(64);
    expect(out.height).toBe(80);
    expect(out.alpha).toHaveLength(64 * 80);
  });

  it('模型只加载一次', async () => {
    const loadSession = jest.fn(async () => session);
    const engine = new LocalU2netEngine({ readResized: async (_p, s) => new Uint8Array(s * s * 4), loadSession });
    await engine.refreshAvailability();
    await engine.segment({ sourcePath: '/a.jpg', maskWidth: 8, maskHeight: 8 });
    await engine.segment({ sourcePath: '/b.jpg', maskWidth: 8, maskHeight: 8 });
    expect(loadSession).toHaveBeenCalledTimes(1);
  });

  it('模型加载失败 → available=false 并给出原因；之后可重试成功', async () => {
    const loadSession = jest
      .fn<() => Promise<U2netSession>>()
      .mockRejectedValueOnce(new Error('native module missing'))
      .mockResolvedValue(session);
    const engine = new LocalU2netEngine({ readResized: async (_p, s) => new Uint8Array(s * s * 4), loadSession });
    expect(await engine.refreshAvailability()).toBe(false);
    expect(engine.available).toBe(false);
    expect(engine.unavailableReason).toMatch(/native module missing/);
    expect(await engine.refreshAvailability()).toBe(true);
    expect(engine.unavailableReason).toBeUndefined();
  });
});
