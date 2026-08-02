/**
 * 腾讯云数据万象 GoodsMatting 抠图引擎（App 侧，TECH_STACK §4 可替换 SegmentationEngine）。
 *
 * 流程（官方文档 https://cloud.tencent.com/document/product/436/117352 「上传时处理」）：
 *   源文件 PUT + Pic-Operations（签名见 cosSignature.ts，Pic-Operations 签入签名）
 *   → 解析 UploadResult XML 的 Key/Location → 下载结果 PNG 字节 → 落 cacheDirectory 临时文件
 *   → PixelReader 解码 → alpha 通道最近邻采样到 maskWidth/maskHeight
 *   → DELETE 两个 COS 对象 + 删本地临时文件（照片不留云端；尽力删除，失败仅警告）。
 * 全程文件路径/二进制：源图由 uploadAsync 直传，不读 Base64 整图。
 *
 * 配置（secretId/secretKey/bucket/region）由异步 getConfig 注入，业务层后续接 expo-secure-store；
 * 配置缺失/字段不全时 available=false + unavailableReason，segment 抛错，绝不伪造结果。
 * 签名 hmac/sha1 默认用 js-sha1（RN 无 Node crypto）；host 测试可注入 Node crypto 实现。
 */
import * as FileSystem from 'expo-file-system/legacy';
import { sha1 } from 'js-sha1';

import { cosAuthorization, parseUploadResultXml, type HmacSha1Hex, type Sha1Hex } from './cosSignature';
import type { PixelReader, SegmentationEngine, SegmentationInput, SegmentationOutput } from './segmentationEngine';

export interface TencentCiConfig {
  secretId: string;
  secretKey: string;
  /** BucketName-APPID 格式 */
  bucket: string;
  region: string;
}

/** 异步获取凭证（业务层接 expo-secure-store）；null 表示未配置，对象可缺字段。 */
export type TencentCiConfigProvider = () => Promise<Partial<TencentCiConfig> | null>;

/** 可注入的网络钩子（默认实现：uploadAsync 上传源文件、fetch 下载结果字节、fetch DELETE 对象）。 */
export interface TencentCiHttpHooks {
  /** PUT 上传源文件（二进制直传）。返回状态码与 XML 响应体。 */
  upload(url: string, filePath: string, headers: Record<string, string>): Promise<{ status: number; body: string }>;
  /** GET 下载结果 PNG 字节。 */
  download(url: string, headers: Record<string, string>): Promise<Uint8Array>;
  /** DELETE COS 对象，返回状态码。 */
  deleteObject(url: string, headers: Record<string, string>): Promise<number>;
}

export interface TencentCiEngineDeps {
  getConfig: TencentCiConfigProvider;
  http?: TencentCiHttpHooks;
  hmacSha1?: HmacSha1Hex;
  sha1Hex?: Sha1Hex;
  /** 结果 PNG 落盘（默认 expo-file-system cacheDirectory）；返回临时文件路径 */
  writeTemp?: (bytes: Uint8Array, fileName: string) => Promise<string>;
  /** 删除本地临时文件（默认 deleteAsync 幂等） */
  deleteTemp?: (path: string) => Promise<void>;
  randomId?: () => string;
  now?: () => number;
  warn?: (msg: string) => void;
}

const REQUIRED_FIELDS: readonly (keyof TencentCiConfig)[] = ['secretId', 'secretKey', 'bucket', 'region'];

/** js-sha1 注入路径（设备默认）：与 host 测试的 Node crypto 同一算法。 */
const jsSha1Hmac: HmacSha1Hex = (key, message) => sha1.hmac(key, message);
const jsSha1: Sha1Hex = (message) => sha1(message);

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** 默认网络钩子：uploadAsync 直传源文件（不走 Base64 整图），fetch 下载/删除。 */
const defaultHttp: TencentCiHttpHooks = {
  upload: async (url, filePath, headers) => {
    const res = await FileSystem.uploadAsync(url, filePath, {
      httpMethod: 'PUT',
      headers,
      uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    });
    return { status: res.status, body: res.body };
  },
  download: async (url, headers) => {
    const res = await fetch(url, { method: 'GET', headers });
    if (res.status !== 200) {
      const snippet = (await res.text()).slice(0, 300);
      throw new Error(`COS GET 失败 status=${res.status}: ${snippet}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  },
  deleteObject: async (url, headers) => {
    const res = await fetch(url, { method: 'DELETE', headers });
    return res.status;
  },
};

/** GoodsMatting 云抠图引擎；name 固定 tencent-goods-matting。 */
export class TencentCiEngine implements SegmentationEngine {
  readonly name = 'tencent-goods-matting';
  available = false;
  unavailableReason?: string = '尚未读取配置（调用 refreshAvailability() 或 segment() 时读取）';

  private readonly getConfig: TencentCiConfigProvider;
  private readonly http: TencentCiHttpHooks;
  private readonly hmacSha1: HmacSha1Hex;
  private readonly sha1Hex: Sha1Hex;
  private readonly writeTemp: (bytes: Uint8Array, fileName: string) => Promise<string>;
  private readonly deleteTemp: (path: string) => Promise<void>;
  private readonly randomId: () => string;
  private readonly now: () => number;
  private readonly warn: (msg: string) => void;

  constructor(private readPixels: PixelReader, deps: TencentCiEngineDeps) {
    this.getConfig = deps.getConfig;
    this.http = deps.http ?? defaultHttp;
    this.hmacSha1 = deps.hmacSha1 ?? jsSha1Hmac;
    this.sha1Hex = deps.sha1Hex ?? jsSha1;
    this.writeTemp =
      deps.writeTemp ??
      (async (bytes, fileName) => {
        const dir = FileSystem.cacheDirectory ?? '';
        const path = `${dir}${fileName}`;
        await FileSystem.writeAsStringAsync(path, bytesToBase64(bytes), {
          encoding: FileSystem.EncodingType.Base64,
        });
        return path;
      });
    this.deleteTemp = deps.deleteTemp ?? ((path) => FileSystem.deleteAsync(path, { idempotent: true }));
    this.randomId = deps.randomId ?? (() => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
    this.now = deps.now ?? Date.now;
    this.warn = deps.warn ?? ((msg) => console.warn(msg));
  }

  /** 读取配置并刷新 available/unavailableReason；供 UI 在调用前探测。 */
  async refreshAvailability(): Promise<boolean> {
    try {
      await this.requireConfig();
    } catch {
      /* available/unavailableReason 已在 requireConfig 内更新 */
    }
    return this.available;
  }

  /** 读取并校验配置；缺失时更新 available=false + reason 并抛错。 */
  private async requireConfig(): Promise<TencentCiConfig> {
    const raw = await this.getConfig();
    if (raw === null) {
      this.available = false;
      this.unavailableReason = '未配置腾讯云凭证（secretId/secretKey/bucket/region，业务层接 expo-secure-store）';
      throw new Error(`engine ${this.name} unavailable: ${this.unavailableReason}`);
    }
    const missing = REQUIRED_FIELDS.filter((f) => !raw[f] || !String(raw[f]).trim());
    if (missing.length > 0) {
      this.available = false;
      this.unavailableReason = `腾讯云凭证字段缺失/为空: ${missing.join(', ')}`;
      throw new Error(`engine ${this.name} unavailable: ${this.unavailableReason}`);
    }
    this.available = true;
    this.unavailableReason = undefined;
    return {
      secretId: raw.secretId!,
      secretKey: raw.secretKey!,
      bucket: raw.bucket!,
      region: raw.region!,
    };
  }

  /** 对单次请求生成签名头（keyTime 窗口 600s；参与签名的头 = host + 可选 pic-operations）。 */
  private signedHeaders(cfg: TencentCiConfig, method: string, pathname: string, host: string, picOperations?: string): Record<string, string> {
    const start = Math.floor(this.now() / 1000);
    const signHeaders: Record<string, string> = { host };
    if (picOperations !== undefined) signHeaders['pic-operations'] = picOperations;
    const authorization = cosAuthorization(
      { secretId: cfg.secretId, secretKey: cfg.secretKey },
      { method, pathname, headers: signHeaders, keyTimeStart: start, keyTimeEnd: start + 600 },
      this.hmacSha1,
      this.sha1Hex,
    );
    return { authorization };
  }

  async segment(input: SegmentationInput): Promise<SegmentationOutput> {
    const t0 = performance.now();
    const cfg = await this.requireConfig();
    const host = `${cfg.bucket}.cos.${cfg.region}.myqcloud.com`;
    const id = this.randomId();
    const sourceKey = `cutout-uploads/${id}.png`;
    const resultKey = `cutout-results/${id}.png`;
    const picOperations = JSON.stringify({
      is_pic_info: 0,
      rules: [{ fileid: resultKey, rule: 'ci-process=GoodsMatting' }],
    });

    let uploadedKey: string | null = null;
    let resultCosKey: string | null = null;
    let tmpPath: string | null = null;
    try {
      // 1) PUT 上传时处理（源文件二进制直传）
      const putPath = `/${sourceKey}`;
      const put = await this.http.upload(`https://${host}${putPath}`, input.sourcePath, {
        'Content-Type': 'image/png',
        'Pic-Operations': picOperations,
        ...this.signedHeaders(cfg, 'PUT', putPath, host, picOperations),
      });
      uploadedKey = sourceKey;
      if (put.status !== 200) {
        throw new Error(`COS PUT ${putPath} 失败 status=${put.status}: ${put.body.slice(0, 300)}`);
      }

      // 2) 解析 UploadResult → 结果对象 Key/Location（无 ProcessResults 抛错）
      const result = parseUploadResultXml(put.body);
      resultCosKey = result.key;

      // 3) 下载结果 PNG → 临时文件 → PixelReader 解码 → alpha 最近邻采样到蒙版尺寸
      const getPath = `/${resultCosKey}`;
      const bytes = await this.http.download(`https://${host}${getPath}`, this.signedHeaders(cfg, 'GET', getPath, host));
      tmpPath = await this.writeTemp(bytes, `tencent-ci-cutout-${id}.png`);
      const pixels = await this.readPixels(tmpPath);
      const { maskWidth: mw, maskHeight: mh } = input;
      const alpha = new Uint8Array(mw * mh);
      for (let y = 0; y < mh; y++) {
        for (let x = 0; x < mw; x++) {
          const sx = Math.min(pixels.width - 1, Math.floor((x / mw) * pixels.width));
          const sy = Math.min(pixels.height - 1, Math.floor((y / mh) * pixels.height));
          alpha[y * mw + x] = pixels.rgba[(sy * pixels.width + sx) * 4 + 3];
        }
      }
      return { alpha, width: mw, height: mh, ms: performance.now() - t0 };
    } finally {
      // 4) DELETE 源对象与结果对象（照片不留云端；尽力删除，失败仅警告）+ 删本地临时文件
      for (const key of [uploadedKey, resultCosKey]) {
        if (!key) continue;
        const delPath = `/${key}`;
        try {
          const status = await this.http.deleteObject(`https://${host}${delPath}`, this.signedHeaders(cfg, 'DELETE', delPath, host));
          if (status !== 204 && status !== 200) {
            this.warn(`COS DELETE ${delPath} 返回 status=${status}（云端残留需人工清理）`);
          }
        } catch (e) {
          this.warn(`COS DELETE ${delPath} 失败: ${String(e)}（云端残留需人工清理）`);
        }
      }
      if (tmpPath) {
        await this.deleteTemp(tmpPath).catch((e) => this.warn(`本地临时文件删除失败 ${tmpPath}: ${String(e)}`));
      }
    }
  }
}
