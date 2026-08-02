/**
 * 腾讯云 COS XML API 协议助手：请求签名 + UploadResult XML 解析。
 *
 * 签名算法核对自官方文档《请求签名》(https://cloud.tencent.com/document/product/436/7778)：
 *   KeyTime      = `${StartTimestamp};${EndTimestamp}`
 *   SignKey      = HMAC-SHA1(SecretKey, KeyTime)          —— 16 进制小写
 *   HttpString   = `${method小写}\n${UriPathname}\n${HttpParameters}\n${HttpHeaders}\n`
 *   StringToSign = `sha1\n${KeyTime}\n${SHA1(HttpString)}\n`
 *   Signature    = HMAC-SHA1(SignKey 字符串形式, StringToSign)
 *   Authorization= q-sign-algorithm=sha1&q-ak=…&q-sign-time=…&q-key-time=…&q-header-list=…&q-url-param-list=…&q-signature=…
 * UrlEncode 按文档字符表：encodeURIComponent 之外再补 ! ' ( ) *。
 *
 * 本文件保持纯函数、零平台依赖（Metro 可打包）：hmac/sha1 由调用方注入——
 * host 基准/单测用 Node crypto，设备用 js-sha1（见 tencentCiEngine.ts）。
 */

/** HMAC-SHA1(key, message) → 16 进制小写。 */
export type HmacSha1Hex = (key: string, message: string) => string;
/** SHA1(message) → 16 进制小写。 */
export type Sha1Hex = (message: string) => string;

export interface CosCredentials {
  secretId: string;
  secretKey: string;
}

export interface CosSignInput {
  /** HTTP 方法（大小写不限，内部转小写） */
  method: string;
  /** 请求路径，如 /cutout-uploads/xxx.png */
  pathname: string;
  /** 查询参数（无则空对象）；key/value 均按文档 UrlEncode */
  params?: Record<string, string>;
  /** 参与签名的请求头（按需筛选，如 host、pic-operations）；key 会被转小写 */
  headers: Record<string, string>;
  /** 签名有效起始 unix 秒 */
  keyTimeStart: number;
  /** 签名有效截止 unix 秒 */
  keyTimeEnd: number;
}

/** 文档字符表的 UrlEncode：encodeURIComponent 之外补 ! ' ( ) *。 */
export function cosUrlEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** 生成 COS Authorization 头值（不含 x-cos-security-token；永久密钥场景）。 */
export function cosAuthorization(
  cred: CosCredentials,
  input: CosSignInput,
  hmacSha1: HmacSha1Hex,
  sha1: Sha1Hex,
): string {
  const keyTime = `${input.keyTimeStart};${input.keyTimeEnd}`;

  // 步骤三：UrlParamList / HttpParameters（key UrlEncode+小写、value UrlEncode、字典序）
  const paramPairs = Object.entries(input.params ?? {}).map(
    ([k, v]) => [cosUrlEncode(k).toLowerCase(), cosUrlEncode(v)] as const,
  );
  paramPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const urlParamList = paramPairs.map(([k]) => k).join(';');
  const httpParameters = paramPairs.map(([k, v]) => `${k}=${v}`).join('&');

  // 步骤四：HeaderList / HttpHeaders（同样规则）
  const headerPairs = Object.entries(input.headers).map(
    ([k, v]) => [cosUrlEncode(k.toLowerCase()).toLowerCase(), cosUrlEncode(v)] as const,
  );
  headerPairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const headerList = headerPairs.map(([k]) => k).join(';');
  const httpHeaders = headerPairs.map(([k, v]) => `${k}=${v}`).join('&');

  // 签名计算五步
  const signKey = hmacSha1(cred.secretKey, keyTime);
  const httpString = `${input.method.toLowerCase()}\n${input.pathname}\n${httpParameters}\n${httpHeaders}\n`;
  const stringToSign = `sha1\n${keyTime}\n${sha1(httpString)}\n`;
  const signature = hmacSha1(signKey, stringToSign);

  return (
    `q-sign-algorithm=sha1&q-ak=${cred.secretId}&q-sign-time=${keyTime}&q-key-time=${keyTime}` +
    `&q-header-list=${headerList}&q-url-param-list=${urlParamList}&q-signature=${signature}`
  );
}

/** 上传时处理（PUT + Pic-Operations）响应中的单个处理结果。 */
export interface UploadResultObject {
  /** 处理后对象 Key */
  key: string;
  /** 处理后图片链接（不含协议） */
  location: string;
}

/**
 * 轻量解析 UploadResult XML（不引 XML 库）：取 ProcessResults 下首个 Object 的 Key/Location。
 * XML 无 ProcessResults/Object/Key 时抛错——绝不伪造结果路径。
 */
export function parseUploadResultXml(xml: string): UploadResultObject {
  const proc = xml.match(/<ProcessResults>([\s\S]*?)<\/ProcessResults>/);
  if (!proc) {
    throw new Error(`COS UploadResult 缺少 ProcessResults（响应摘要: ${xml.slice(0, 200)}）`);
  }
  const key = proc[1].match(/<Key>([\s\S]*?)<\/Key>/);
  if (!key || !key[1].trim()) {
    throw new Error(`COS ProcessResults 缺少 Object.Key（响应摘要: ${xml.slice(0, 200)}）`);
  }
  const location = proc[1].match(/<Location>([\s\S]*?)<\/Location>/);
  return { key: key[1].trim(), location: location?.[1].trim() ?? '' };
}
