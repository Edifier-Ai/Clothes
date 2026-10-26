/**
 * 引擎选择（engineResolver.ts）测试：
 * 默认（无配置/部分配置/未同意）→ 端侧 u2netp，绝不上传；配置+同意齐全 → tencent-goods-matting。
 * 覆盖 TencentCiEngine 的 available 异步语义（refreshAvailability 后才为 true）。
 *
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { resolveCutoutEngine } from './engineResolver';
import { LocalU2netEngine } from '../../native/localU2netEngine';
import type { TencentCiConfig } from '../../native/tencentCiEngine';
import type { PixelReader } from '../../native/segmentationEngine';

const CONFIG: TencentCiConfig = {
  secretId: 'AKIDTEST',
  secretKey: 'SECRETKEY',
  bucket: 'mybucket-1250000000',
  region: 'ap-guangzhou',
};

const fakeReadPixels: PixelReader = async () => ({ width: 1, height: 1, rgba: new Uint8Array(4) });
const local = new LocalU2netEngine({
  readResized: async (_p, s) => new Uint8Array(s * s * 4),
  loadSession: async () => ({ run: async () => new Float32Array(320 * 320) }),
});
const localEngine = () => local;

describe('resolveCutoutEngine 引擎选择', () => {
  it('无配置 → 本地 u2netp，缺项为全部字段', async () => {
    const r = await resolveCutoutEngine({ readPixels: fakeReadPixels, loadConfig: async () => null, localEngine });
    expect(r.mode).toBe('local');
    expect(r.engine.name).toBe('local-u2netp');
    expect(r.engine.available).toBe(true);
    expect(r.ready).toBe(false);
    expect(r.configured).toBe(false);
    expect(r.missing).toEqual(['secretId', 'secretKey', 'bucket', 'region']);
  });

  it('部分字段缺失 → 仍走本地，列出缺项', async () => {
    const r = await resolveCutoutEngine({
      readPixels: fakeReadPixels,
      loadConfig: async () => ({ secretId: 'x', secretKey: 'k' }),
      localEngine,
    });
    expect(r.mode).toBe('local');
    expect(r.missing).toEqual(['bucket', 'region']);
  });

  it('有配置未同意上传告知 → 本地，不上传', async () => {
    const r = await resolveCutoutEngine({
      readPixels: fakeReadPixels,
      loadConfig: async () => CONFIG,
      hasConsent: async () => false,
      localEngine,
    });
    expect(r.configured).toBe(true);
    expect(r.consentGranted).toBe(false);
    expect(r.mode).toBe('local');
    expect(r.engine).toBe(local);
  });

  it('配置+同意齐全 → TencentCiEngine（tencent-goods-matting），refresh 后 available', async () => {
    const r = await resolveCutoutEngine({
      readPixels: fakeReadPixels,
      loadConfig: async () => CONFIG,
      hasConsent: async () => true,
      localEngine,
    });
    expect(r.ready).toBe(true);
    expect(r.mode).toBe('cloud');
    expect(r.engine.name).toBe('tencent-goods-matting');
    // available 异步语义：构造时为 false，refreshAvailability 读取配置后反映真实状态
    expect(await r.engine.refreshAvailability!()).toBe(true);
    expect(r.engine.available).toBe(true);
  });
});
