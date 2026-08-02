/**
 * 腾讯云数据万象 GoodsMatting 商品抠图适配器（host 基准侧）。
 *
 * 流程（官方文档 https://cloud.tencent.com/document/product/436/117352 「上传时处理」）：
 *   1. PUT https://<bucket>.cos.<region>.myqcloud.com/<sourceKey>
 *      头带 Pic-Operations（JSON：is_pic_info=0，rules=[{fileid: 结果Key, rule: 'ci-process=GoodsMatting'}]），
 *      Pic-Operations 按文档要求签入 Authorization（HMAC-SHA1，见 cosSignature.ts）。
 *   2. 响应 XML UploadResult → ProcessResults.Object 的 Key/Location。
 *   3. GET 结果对象拿透明 PNG 字节，alpha 从结果 PNG 的 alpha 通道提取。
 *   4. DELETE 源对象与结果对象（照片不留云端；尽力删除，失败仅警告不阻断）。
 *
 * 凭证从 scripts/segmentation-benchmark/.private/tencent-ci.json 读取（已 gitignore）；
 * 配置缺失/字段不全时 available=false + unavailableReason 写明缺什么，绝不伪造结果。
 * 签名实现与 App 侧共用 apps/mobile/src/native/cosSignature.ts（此处注入 Node crypto）。
 */
import { createHmac, createHash, randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';

import { cosAuthorization, parseUploadResultXml } from '../../apps/mobile/src/native/cosSignature';
import { decodePNG, encodePNG, type RGBA } from './pngUtil';
import type { Segmenter, SegmentResult } from './segmenter';

export interface TencentCiConfig {
  secretId: string;
  secretKey: string;
  /** BucketName-APPID 格式 */
  bucket: string;
  region: string;
}

/** 读取配置；返回 null 表示配置文件缺失，返回对象可缺字段（由 segmenter 判定）。 */
export type TencentCiConfigLoader = () => Partial<TencentCiConfig> | null;

const REQUIRED_FIELDS: ReadonlyArray<keyof TencentCiConfig> = ['secretId', 'secretKey', 'bucket', 'region'];

/** 从 JSON 文件加载配置（默认凭证路径由 runBenchmark 传入）。 */
export function loadTencentCiConfigFromFile(path: string): Partial<TencentCiConfig> | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8')) as Partial<TencentCiConfig>;
}

/** Node crypto 版 HMAC-SHA1/SHA1（hex）；与设备 js-sha1 注入路径同一算法。 */
const nodeHmacSha1 = (key: string, message: string): string =>
  createHmac('sha1', key).update(message, 'utf8').digest('hex');
const nodeSha1 = (message: string): string => createHash('sha1').update(message, 'utf8').digest('hex');

export interface TencentCiSegmenterDeps {
  loadConfig: TencentCiConfigLoader;
  /** 注入 fetch 便于测试 mock；默认全局 fetch（Node 20+） */
  fetchImpl?: typeof fetch;
  /** 注入时钟（ms）便于测试；默认 Date.now */
  now?: () => number;
  /** 注入随机 ID 便于测试；默认 crypto.randomUUID */
  randomId?: () => string;
  /** 删除失败等告警输出；默认 console.warn */
  warn?: (msg: string) => void;
}

/** GoodsMatting 商品抠图 segmenter；name 固定 tencent-goods-matting。 */
export class TencentCiSegmenter implements Segmenter {
  readonly name = 'tencent-goods-matting';
  modelBytes = 0; // 云侧服务，无端侧模型
  modelHash = '';
  available = false;
  unavailableReason?: string;

  private readonly config: TencentCiConfig | null = null;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly randomId: () => string;
  private readonly warn: (msg: string) => void;

  constructor(deps: TencentCiSegmenterDeps) {
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.now = deps.now ?? Date.now;
    this.randomId = deps.randomId ?? randomUUID;
    this.warn = deps.warn ?? ((msg) => console.warn(msg));

    const raw = deps.loadConfig();
    if (raw === null) {
      this.unavailableReason =
        '缺少配置文件 .private/tencent-ci.json（复制 tencent-ci.example.json 并填入 secretId/secretKey/bucket/region）';
      return;
    }
    const missing = REQUIRED_FIELDS.filter((f) => !raw[f] || !String(raw[f]).trim());
    if (missing.length > 0) {
      this.unavailableReason = `tencent-ci.json 字段缺失/为空: ${missing.join(', ')}`;
      return;
    }
    this.config = {
      secretId: raw.secretId!,
      secretKey: raw.secretKey!,
      bucket: raw.bucket!,
      region: raw.region!,
    };
    this.available = true;
  }

  /** 对单次请求生成签名头（keyTime 窗口 600s；参与签名的头 = host + 可选 pic-operations）。 */
  private signedHeaders(method: string, pathname: string, host: string, picOperations?: string): Record<string, string> {
    const cfg = this.config!;
    const start = Math.floor(this.now() / 1000);
    const signHeaders: Record<string, string> = { host };
    if (picOperations !== undefined) signHeaders['pic-operations'] = picOperations;
    const authorization = cosAuthorization(
      { secretId: cfg.secretId, secretKey: cfg.secretKey },
      { method, pathname, headers: signHeaders, keyTimeStart: start, keyTimeEnd: start + 600 },
      nodeHmacSha1,
      nodeSha1,
    );
    return { authorization };
  }

  async segment(image: RGBA): Promise<SegmentResult> {
    const t0 = performance.now();
    if (!this.available || !this.config) {
      throw new Error(`segmenter ${this.name} unavailable: ${this.unavailableReason}`);
    }
    const cfg = this.config;
    const host = `${cfg.bucket}.cos.${cfg.region}.myqcloud.com`;
    const sourceKey = `cutout-uploads/${this.randomId()}.png`;
    const resultKey = `cutout-results/${this.randomId()}.png`;
    const picOperations = JSON.stringify({
      is_pic_info: 0,
      rules: [{ fileid: resultKey, rule: 'ci-process=GoodsMatting' }],
    });

    // 1) PUT 上传时处理
    const putPath = `/${sourceKey}`;
    const putRes = await this.fetchImpl(`https://${host}${putPath}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'image/png',
        'Pic-Operations': picOperations,
        ...this.signedHeaders('PUT', putPath, host, picOperations),
      },
      body: new Uint8Array(encodePNG(image)),
    });
    const putBody = await putRes.text();
    if (putRes.status !== 200) {
      throw new Error(`COS PUT ${putPath} 失败 status=${putRes.status}: ${putBody.slice(0, 300)}`);
    }

    // 2) 解析 UploadResult → 结果对象 Key/Location
    const result = parseUploadResultXml(putBody);

    // 3) GET 结果 PNG 字节 → alpha 通道（尺寸不一致则最近邻采样到输入尺寸）
    const getPath = `/${result.key}`;
    const getRes = await this.fetchImpl(`https://${host}${getPath}`, {
      method: 'GET',
      headers: this.signedHeaders('GET', getPath, host),
    });
    if (getRes.status !== 200) {
      const snippet = (await getRes.text()).slice(0, 300);
      throw new Error(`COS GET ${getPath} 失败 status=${getRes.status}: ${snippet}`);
    }
    const pngBytes = Buffer.from(await getRes.arrayBuffer());
    const cutout = decodePNG(pngBytes);
    const alpha = new Uint8Array(image.width * image.height);
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const sx = Math.min(cutout.width - 1, Math.floor((x / image.width) * cutout.width));
        const sy = Math.min(cutout.height - 1, Math.floor((y / image.height) * cutout.height));
        alpha[y * image.width + x] = cutout.data[(sy * cutout.width + sx) * 4 + 3];
      }
    }

    // 4) DELETE 源对象与结果对象（尽力；失败不阻断）
    for (const key of [sourceKey, result.key]) {
      const delPath = `/${key}`;
      try {
        const delRes = await this.fetchImpl(`https://${host}${delPath}`, {
          method: 'DELETE',
          headers: this.signedHeaders('DELETE', delPath, host),
        });
        if (delRes.status !== 204 && delRes.status !== 200) {
          this.warn(`COS DELETE ${delPath} 返回 status=${delRes.status}（云端残留需人工清理）`);
        }
      } catch (e) {
        this.warn(`COS DELETE ${delPath} 失败: ${String(e)}（云端残留需人工清理）`);
      }
    }

    return { alpha, ms: performance.now() - t0 };
  }
}
