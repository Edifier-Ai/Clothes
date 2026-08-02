/**
 * App 侧 TencentCiEngine（tencentCiEngine.ts）测试：
 * 注入 mock http 钩子 + PixelReader + 临时文件钩子，跑通完整流程；
 * 验证 alpha 提取与蒙版缩放、临时文件/云端对象清理、配置缺失降级与错误分支。
 *
 * @jest-environment node
 */
import { describe, expect, it, jest } from '@jest/globals';

import { TencentCiEngine, type TencentCiConfig, type TencentCiHttpHooks } from './tencentCiEngine';
import type { PixelReader } from './segmentationEngine';

const CONFIG: TencentCiConfig = {
  secretId: 'AKIDTESTSECRETID',
  secretKey: 'TESTSECRETKEY',
  bucket: 'mybucket-1250000000',
  region: 'ap-guangzhou',
};
const HOST = `${CONFIG.bucket}.cos.${CONFIG.region}.myqcloud.com`;
const RESULT_XML = `<UploadResult><ProcessResults><Object><Key>cutout-results/fixed-id.png</Key><Location>${HOST}/cutout-results/fixed-id.png</Location></Object></ProcessResults></UploadResult>`;

const RESULT_BYTES = new Uint8Array([1, 2, 3, 4, 5]);

/** 2x2 结果像素：R=200 干扰，alpha 通道 10/20/30/40。 */
const PIXELS_2X2 = {
  width: 2,
  height: 2,
  rgba: new Uint8Array([
    200, 200, 200, 10,
    200, 200, 200, 20,
    200, 200, 200, 30,
    200, 200, 200, 40,
  ]),
};

function makeEngine(opts: { config?: Partial<TencentCiConfig> | null; uploadStatus?: number; uploadBody?: string } = {}) {
  const upload = jest.fn(async (_url: string, _filePath: string, _headers: Record<string, string>) => ({
    status: opts.uploadStatus ?? 200,
    body: opts.uploadBody ?? RESULT_XML,
  }));
  const download = jest.fn(async (_url: string, _headers: Record<string, string>) => RESULT_BYTES);
  const deleteObject = jest.fn(async (_url: string, _headers: Record<string, string>) => 204);
  const http: TencentCiHttpHooks = { upload, download, deleteObject };
  const writeTemp = jest.fn(async (_bytes: Uint8Array, fileName: string) => `/cache/${fileName}`);
  const deleteTemp = jest.fn(async () => {});
  const readPixels = jest.fn(async () => PIXELS_2X2) as jest.MockedFunction<PixelReader>;
  const warn = jest.fn();
  const engine = new TencentCiEngine(readPixels, {
    getConfig: async () => (opts.config === undefined ? CONFIG : opts.config),
    http,
    writeTemp,
    deleteTemp,
    randomId: () => 'fixed-id',
    now: () => 1700000000000,
    warn,
  });
  return { engine, upload, download, deleteObject, writeTemp, deleteTemp, readPixels, warn };
}

describe('TencentCiEngine 完整流程', () => {
  it('mock http + PixelReader 跑通：上传/下载/清理/返回蒙版', async () => {
    const m = makeEngine();
    const out = await m.engine.segment({ sourcePath: '/staged/source.png', maskWidth: 2, maskHeight: 2 });

    // 上传：源文件路径直传 + Pic-Operations + Authorization
    expect(m.upload).toHaveBeenCalledTimes(1);
    const [putUrl, putPath, putHeaders] = m.upload.mock.calls[0];
    expect(putUrl).toBe(`https://${HOST}/cutout-uploads/fixed-id.png`);
    expect(putPath).toBe('/staged/source.png');
    const picOps = JSON.parse(putHeaders['Pic-Operations']);
    expect(picOps.rules).toEqual([{ fileid: 'cutout-results/fixed-id.png', rule: 'ci-process=GoodsMatting' }]);
    expect(putHeaders['authorization']).toMatch(/^q-sign-algorithm=sha1&q-ak=AKIDTESTSECRETID/);

    // 下载：GET 结果对象；结果字节落临时文件并交给 PixelReader
    expect(m.download).toHaveBeenCalledTimes(1);
    expect(m.download.mock.calls[0][0]).toBe(`https://${HOST}/cutout-results/fixed-id.png`);
    expect(m.writeTemp).toHaveBeenCalledWith(RESULT_BYTES, 'tencent-ci-cutout-fixed-id.png');
    expect(m.readPixels).toHaveBeenCalledWith('/cache/tencent-ci-cutout-fixed-id.png');

    // 同尺寸：alpha 直接取 alpha 通道（R=200 干扰不生效）
    expect(Array.from(out.alpha)).toEqual([10, 20, 30, 40]);
    expect(out.width).toBe(2);
    expect(out.height).toBe(2);
    expect(out.ms).toBeGreaterThanOrEqual(0);

    // 清理：DELETE 两个 COS 对象 + 删本地临时文件
    expect(m.deleteObject).toHaveBeenCalledTimes(2);
    expect(m.deleteObject.mock.calls[0][0]).toContain('/cutout-uploads/fixed-id.png');
    expect(m.deleteObject.mock.calls[1][0]).toContain('/cutout-results/fixed-id.png');
    expect(m.deleteTemp).toHaveBeenCalledWith('/cache/tencent-ci-cutout-fixed-id.png');
  });

  it('结果 2x2 → 蒙版 4x4 最近邻放大', async () => {
    const m = makeEngine();
    const out = await m.engine.segment({ sourcePath: '/s.png', maskWidth: 4, maskHeight: 4 });
    expect(Array.from(out.alpha)).toEqual([
      10, 10, 20, 20,
      10, 10, 20, 20,
      30, 30, 40, 40,
      30, 30, 40, 40,
    ]);
  });

  it('结果 2x2 → 蒙版 2x1 最近邻缩小（取第一行）', async () => {
    const m = makeEngine();
    const out = await m.engine.segment({ sourcePath: '/s.png', maskWidth: 2, maskHeight: 1 });
    expect(Array.from(out.alpha)).toEqual([10, 20]);
  });
});

describe('TencentCiEngine 配置与错误分支', () => {
  it('无配置 → available=false + unavailableReason，segment 抛错', async () => {
    const m = makeEngine({ config: null });
    await expect(m.engine.segment({ sourcePath: '/s.png', maskWidth: 2, maskHeight: 2 })).rejects.toThrow(/unavailable/);
    expect(m.engine.available).toBe(false);
    expect(m.engine.unavailableReason).toContain('凭证');
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('字段缺失 → refreshAvailability 置 false 且原因列出字段', async () => {
    const m = makeEngine({ config: { secretId: 'x', region: 'ap-guangzhou' } });
    const ok = await m.engine.refreshAvailability();
    expect(ok).toBe(false);
    expect(m.engine.available).toBe(false);
    expect(m.engine.unavailableReason).toContain('secretKey');
    expect(m.engine.unavailableReason).toContain('bucket');
  });

  it('配置齐全 → refreshAvailability 置 true', async () => {
    const m = makeEngine();
    expect(await m.engine.refreshAvailability()).toBe(true);
    expect(m.engine.unavailableReason).toBeUndefined();
  });

  it('上传 403 → 抛带状态码错误；已上传对象仍尽力 DELETE', async () => {
    const m = makeEngine({ uploadStatus: 403, uploadBody: '<Error><Code>Forbidden</Code></Error>' });
    await expect(m.engine.segment({ sourcePath: '/s.png', maskWidth: 2, maskHeight: 2 })).rejects.toThrow(/status=403/);
    expect(m.deleteObject).toHaveBeenCalledTimes(1); // 只有源对象（结果对象未产生）
    expect(m.deleteTemp).not.toHaveBeenCalled();
  });

  it('XML 无 ProcessResults → 抛错', async () => {
    const m = makeEngine({ uploadBody: '<UploadResult/>' });
    await expect(m.engine.segment({ sourcePath: '/s.png', maskWidth: 2, maskHeight: 2 })).rejects.toThrow(/ProcessResults/);
  });

  it('DELETE 失败只警告不阻断', async () => {
    const m = makeEngine();
    m.deleteObject.mockRejectedValueOnce(new Error('network down')).mockResolvedValueOnce(500);
    const out = await m.engine.segment({ sourcePath: '/s.png', maskWidth: 2, maskHeight: 2 });
    expect(out.alpha.length).toBe(4);
    expect(m.warn).toHaveBeenCalledTimes(2);
    expect(m.warn.mock.calls[0][0]).toContain('network down');
    expect(m.warn.mock.calls[1][0]).toContain('status=500');
  });
});
