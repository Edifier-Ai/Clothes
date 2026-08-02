/**
 * 基准侧 TencentCiSegmenter（scripts/segmentation-benchmark/tencentCi.ts）测试：
 * mock fetch 验证请求构造（URL/方法/Pic-Operations/Authorization）、XML 解析、
 * alpha 通道提取与最近邻采样、配置缺失降级、HTTP/XML 错误与 DELETE 不阻断。
 * 被测文件在 app 包外的 host 基准目录，经 babel-jest 同一 preset 编译。
 *
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { PNG } from 'pngjs';

import { decodePNG, encodePNG, type RGBA } from '../../../../scripts/segmentation-benchmark/pngUtil';
import {
  TencentCiSegmenter,
  loadTencentCiConfigFromFile,
  type TencentCiConfig,
} from '../../../../scripts/segmentation-benchmark/tencentCi';

const CONFIG: TencentCiConfig = {
  secretId: 'AKIDTESTSECRETID',
  secretKey: 'TESTSECRETKEY',
  bucket: 'mybucket-1250000000',
  region: 'ap-guangzhou',
};
const HOST = `${CONFIG.bucket}.cos.${CONFIG.region}.myqcloud.com`;

const RESULT_XML = `<UploadResult><OriginalInfo><Key>cutout-uploads/fixed-id.png</Key><Location>${HOST}/cutout-uploads/fixed-id.png</Location></OriginalInfo><ProcessResults><Object><Key>cutout-results/r.png</Key><Location>${HOST}/cutout-results/r.png</Location><Size>100</Size></Object></ProcessResults></UploadResult>`;

interface FetchCall {
  url: string;
  method: string;
  headers: Record<string, string>;
}

/** 顺序式 mock fetch：按调用顺序返回预制响应，记录全部调用。 */
function makeFetchMock(steps: ({ status: number; body: string | Buffer } | { error: Error })[]) {
  const calls: FetchCall[] = [];
  let i = 0;
  const fetchImpl = (async (url: string | URL, init?: { method?: string; headers?: Record<string, string> }) => {
    calls.push({ url: String(url), method: init?.method ?? 'GET', headers: init?.headers ?? {} });
    const step = steps[Math.min(i, steps.length - 1)];
    i += 1;
    if ('error' in step) throw step.error;
    return {
      status: step.status,
      text: async () => (typeof step.body === 'string' ? step.body : step.body.toString('utf8')),
      arrayBuffer: async () => {
        const buf = Buffer.isBuffer(step.body) ? step.body : Buffer.from(step.body);
        return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
      },
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

/** 构造 4x3 输入图（RGB 任意，alpha 全不透明）。 */
function makeInput(): RGBA {
  const w = 4;
  const h = 3;
  const data = Buffer.alloc(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    data[p * 4] = (p * 17) % 255;
    data[p * 4 + 1] = (p * 31) % 255;
    data[p * 4 + 2] = (p * 47) % 255;
    data[p * 4 + 3] = 255;
  }
  return { width: w, height: h, data };
}

/** 构造结果 PNG：R 通道固定 200，alpha 通道按 fn(x,y) 取值（证明提取的是 alpha 而非 R）。 */
function makeResultPng(w: number, h: number, alphaFn: (x: number, y: number) => number): Buffer {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      png.data[p] = 200;
      png.data[p + 1] = 200;
      png.data[p + 2] = 200;
      png.data[p + 3] = alphaFn(x, y);
    }
  }
  return PNG.sync.write(png);
}

function makeSegmenter(steps: Parameters<typeof makeFetchMock>[0], warn?: (msg: string) => void) {
  const mock = makeFetchMock(steps);
  const segmenter = new TencentCiSegmenter({
    loadConfig: () => CONFIG,
    fetchImpl: mock.fetchImpl,
    now: () => 1700000000000,
    randomId: () => 'fixed-id',
    warn,
  });
  return { segmenter, calls: mock.calls };
}

describe('TencentCiSegmenter 可用性', () => {
  it('配置文件缺失 → available=false 且原因写明缺配置文件', () => {
    const s = new TencentCiSegmenter({ loadConfig: () => null });
    expect(s.available).toBe(false);
    expect(s.unavailableReason).toContain('tencent-ci.json');
  });

  it('字段缺失 → available=false 且原因列出缺失字段', () => {
    const s = new TencentCiSegmenter({ loadConfig: () => ({ secretId: 'x', bucket: 'b', region: 'r' }) });
    expect(s.available).toBe(false);
    expect(s.unavailableReason).toContain('secretKey');
  });

  it('loadTencentCiConfigFromFile：路径不存在返回 null；存在则读出字段', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tencent-ci-test-'));
    try {
      expect(loadTencentCiConfigFromFile(join(dir, 'absent.json'))).toBeNull();
      const p = join(dir, 'tencent-ci.json');
      writeFileSync(p, JSON.stringify(CONFIG));
      expect(loadTencentCiConfigFromFile(p)).toEqual(CONFIG);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('unavailable 时 segment 抛错且不伪造结果', async () => {
    const s = new TencentCiSegmenter({ loadConfig: () => null });
    await expect(s.segment(makeInput())).rejects.toThrow(/unavailable/);
  });
});

describe('TencentCiSegmenter 完整流程（mock fetch）', () => {
  it('PUT 请求 URL/方法/Pic-Operations/Authorization 构造正确', async () => {
    const png = makeResultPng(4, 3, () => 255);
    const { segmenter, calls } = makeSegmenter([
      { status: 200, body: RESULT_XML },
      { status: 200, body: png },
      { status: 204, body: '' },
      { status: 204, body: '' },
    ]);
    await segmenter.segment(makeInput());

    const put = calls[0];
    expect(put.method).toBe('PUT');
    expect(put.url).toBe(`https://${HOST}/cutout-uploads/fixed-id.png`);
    const picOps = JSON.parse(put.headers['Pic-Operations']);
    expect(picOps.is_pic_info).toBe(0);
    expect(picOps.rules).toEqual([{ fileid: 'cutout-results/fixed-id.png', rule: 'ci-process=GoodsMatting' }]);
    expect(put.headers['authorization']).toMatch(/^q-sign-algorithm=sha1&q-ak=AKIDTESTSECRETID/);
    expect(put.headers['authorization']).toContain('q-signature=');

    // GET 结果对象 + DELETE 两个对象
    expect(calls[1].method).toBe('GET');
    expect(calls[1].url).toBe(`https://${HOST}/cutout-results/r.png`);
    expect(calls[1].headers['authorization']).toContain('q-sign-algorithm=sha1');
    const deletes = calls.slice(2);
    expect(deletes.map((c) => c.method)).toEqual(['DELETE', 'DELETE']);
    expect(deletes[0].url).toContain('/cutout-uploads/fixed-id.png');
    expect(deletes[1].url).toContain('/cutout-results/r.png');
  });

  it('alpha 从结果 PNG 的 alpha 通道提取（同尺寸，R 通道干扰不生效）', async () => {
    const png = makeResultPng(4, 3, (x, y) => (x + y * 4) * 20);
    const { segmenter } = makeSegmenter([
      { status: 200, body: RESULT_XML },
      { status: 200, body: png },
      { status: 204, body: '' },
      { status: 204, body: '' },
    ]);
    const { alpha, ms } = await segmenter.segment(makeInput());
    expect(alpha.length).toBe(12);
    for (let p = 0; p < 12; p++) expect(alpha[p]).toBe(p * 20);
    expect(ms).toBeGreaterThanOrEqual(0);
  });

  it('结果尺寸与输入不一致时最近邻采样到输入尺寸', async () => {
    // 结果 2x2 → 输入 4x4：2x2 每像素扩成 2x2 块
    const png = makeResultPng(2, 2, (x, y) => [10, 20, 30, 40][y * 2 + x]);
    const { segmenter } = makeSegmenter([
      { status: 200, body: RESULT_XML },
      { status: 200, body: png },
      { status: 204, body: '' },
      { status: 204, body: '' },
    ]);
    const input: RGBA = { width: 4, height: 4, data: Buffer.alloc(4 * 4 * 4, 255) };
    const { alpha } = await segmenter.segment(input);
    expect(Array.from(alpha)).toEqual([
      10, 10, 20, 20,
      10, 10, 20, 20,
      30, 30, 40, 40,
      30, 30, 40, 40,
    ]);
  });

  it('HTTP 403 → 抛带状态码与响应摘要的错误', async () => {
    const { segmenter } = makeSegmenter([{ status: 403, body: '<Error><Code>SignatureDoesNotMatch</Code></Error>' }]);
    await expect(segmenter.segment(makeInput())).rejects.toThrow(/status=403.*SignatureDoesNotMatch/s);
  });

  it('XML 无 ProcessResults → 抛错', async () => {
    const { segmenter } = makeSegmenter([{ status: 200, body: '<UploadResult><OriginalInfo/></UploadResult>' }]);
    await expect(segmenter.segment(makeInput())).rejects.toThrow(/ProcessResults/);
  });

  it('DELETE 失败只警告不阻断，结果仍返回', async () => {
    const warnings: string[] = [];
    const png = makeResultPng(4, 3, () => 255);
    const { segmenter, calls } = makeSegmenter(
      [
        { status: 200, body: RESULT_XML },
        { status: 200, body: png },
        { status: 500, body: '<Error/>' },
        { error: new Error('network down') },
      ],
      (msg) => warnings.push(msg),
    );
    const { alpha } = await segmenter.segment(makeInput());
    expect(alpha.length).toBe(12);
    expect(calls.length).toBe(4);
    expect(warnings.length).toBe(2);
    expect(warnings[0]).toContain('status=500');
    expect(warnings[1]).toContain('network down');
  });
});

// 防止未使用的 import 告警：验证夹具编码/解码闭环可用
it('夹具 PNG 编码/解码闭环', () => {
  const img = makeInput();
  const round = decodePNG(encodePNG(img));
  expect(round.width).toBe(4);
  expect(round.height).toBe(3);
});
