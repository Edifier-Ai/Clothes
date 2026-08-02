/**
 * 引擎选择（engineResolver.ts）测试：
 * 无配置 → unavailable + 明确原因；有配置未同意 → unavailable；齐全 → tencent-goods-matting。
 * 覆盖 TencentCiEngine 的 available 异步语义（refreshAvailability 后才为 true）。
 *
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';

import { resolveCutoutEngine, UnavailableCutoutEngine } from './engineResolver';
import type { TencentCiConfig } from '../../native/tencentCiEngine';
import type { PixelReader } from '../../native/segmentationEngine';

const CONFIG: TencentCiConfig = {
  secretId: 'AKIDTEST',
  secretKey: 'SECRETKEY',
  bucket: 'mybucket-1250000000',
  region: 'ap-guangzhou',
};

const fakeReadPixels: PixelReader = async () => ({ width: 1, height: 1, rgba: new Uint8Array(4) });

describe('resolveCutoutEngine 引擎选择', () => {
  it('无配置 → unavailable，原因明确为未配置，缺项为全部字段', async () => {
    const r = await resolveCutoutEngine({ readPixels: fakeReadPixels, loadConfig: async () => null });
    expect(r.ready).toBe(false);
    expect(r.configured).toBe(false);
    expect(r.missing).toEqual(['secretId', 'secretKey', 'bucket', 'region']);
    expect(r.engine.available).toBe(false);
    expect(r.engine.unavailableReason).toContain('未配置');
  });

  it('部分字段缺失 → unavailable，原因列出缺项', async () => {
    const r = await resolveCutoutEngine({
      readPixels: fakeReadPixels,
      loadConfig: async () => ({ secretId: 'x', secretKey: 'k' }),
    });
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(['bucket', 'region']);
    expect(r.engine.available).toBe(false);
    expect(r.engine.unavailableReason).toContain('bucket');
    expect(r.engine.unavailableReason).toContain('region');
  });

  it('有配置未同意 → unavailable，原因指向告知确认', async () => {
    const r = await resolveCutoutEngine({
      readPixels: fakeReadPixels,
      loadConfig: async () => CONFIG,
      hasConsent: async () => false,
    });
    expect(r.configured).toBe(true);
    expect(r.consentGranted).toBe(false);
    expect(r.ready).toBe(false);
    expect(r.engine.available).toBe(false);
    expect(r.engine.unavailableReason).toContain('告知');
  });

  it('配置+同意齐全 → TencentCiEngine（tencent-goods-matting），refresh 后 available', async () => {
    const r = await resolveCutoutEngine({
      readPixels: fakeReadPixels,
      loadConfig: async () => CONFIG,
      hasConsent: async () => true,
    });
    expect(r.ready).toBe(true);
    expect(r.engine.name).toBe('tencent-goods-matting');
    // available 异步语义：构造时为 false，refreshAvailability 读取配置后反映真实状态
    expect(await r.engine.refreshAvailability!()).toBe(true);
    expect(r.engine.available).toBe(true);
  });

  it('UnavailableCutoutEngine 的 segment 永远抛错（不伪造蒙版）', async () => {
    const engine = new UnavailableCutoutEngine('测试原因');
    await expect(engine.segment()).rejects.toThrow('测试原因');
  });
});
