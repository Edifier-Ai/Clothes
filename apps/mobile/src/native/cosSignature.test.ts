/**
 * COS 签名（cosSignature.ts）测试：
 * - 固定输入下 StringToSign 各段与最终 Authorization 值；
 * - 注入 js-sha1 实现（设备路径）的结果与 Node crypto 独立计算的期望值逐字节一致；
 * - UploadResult XML 解析的正常/畸形分支。
 *
 * @jest-environment node
 */
import { describe, expect, it } from '@jest/globals';
import { createHash, createHmac } from 'crypto';

import { sha1 } from 'js-sha1';

import { cosAuthorization, cosUrlEncode, parseUploadResultXml } from './cosSignature';

const nodeHmacSha1 = (key: string, message: string): string =>
  createHmac('sha1', key).update(message, 'utf8').digest('hex');
const nodeSha1 = (message: string): string => createHash('sha1').update(message, 'utf8').digest('hex');

const CRED = { secretId: 'AKIDTESTSECRETID', secretKey: 'TESTSECRETKEY' };
const HOST = 'examplebucket-1250000000.cos.ap-guangzhou.myqcloud.com';
const PIC_OPS = '{"is_pic_info":0,"rules":[{"fileid":"cutout-results/fixed-id.png","rule":"ci-process=GoodsMatting"}]}';

describe('cosUrlEncode', () => {
  it('按文档字符表编码：空格/斜杠/等号与 ! \' ( ) * 全部编码', () => {
    expect(cosUrlEncode("a b/=!*'()")).toBe('a%20b%2F%3D%21%2A%27%28%29');
    expect(cosUrlEncode('plain-KEY_1.txt~')).toBe('plain-KEY_1.txt~');
  });
});

describe('cosAuthorization', () => {
  const fixedInput = {
    method: 'PUT',
    pathname: '/cutout-uploads/fixed-id.png',
    headers: { host: HOST, 'pic-operations': PIC_OPS },
    keyTimeStart: 1700000000,
    keyTimeEnd: 1700000600,
  };

  it('js-sha1 注入路径的签名值与 Node crypto 独立计算一致', () => {
    const keyTime = '1700000000;1700000600';
    // 期望值的独立计算：完全走 Node crypto + 显式拼接（不复用被测实现）
    const encode = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
    const httpHeaders = `host=${encode(HOST)}&pic-operations=${encode(PIC_OPS)}`;
    const httpString = `put\n/cutout-uploads/fixed-id.png\n\n${httpHeaders}\n`;
    const signKey = nodeHmacSha1(CRED.secretKey, keyTime);
    const stringToSign = `sha1\n${keyTime}\n${nodeSha1(httpString)}\n`;
    const expectedSignature = nodeHmacSha1(signKey, stringToSign);

    const auth = cosAuthorization(CRED, fixedInput, (k, m) => sha1.hmac(k, m), (m) => sha1(m));

    expect(auth).toBe(
      `q-sign-algorithm=sha1&q-ak=${CRED.secretId}&q-sign-time=${keyTime}&q-key-time=${keyTime}` +
        `&q-header-list=host;pic-operations&q-url-param-list=&q-signature=${expectedSignature}`,
    );
  });

  it('同一输入下 js-sha1 与 Node crypto 两条注入路径输出完全相同', () => {
    const a = cosAuthorization(CRED, fixedInput, (k, m) => sha1.hmac(k, m), (m) => sha1(m));
    const b = cosAuthorization(CRED, fixedInput, nodeHmacSha1, nodeSha1);
    expect(a).toBe(b);
  });

  it('查询参数按 key 字典序进 UrlParamList/HttpParameters，无 value 参数记为空串', () => {
    const auth = cosAuthorization(
      CRED,
      { ...fixedInput, method: 'GET', params: { 'max-keys': '10', acl: '', delimiter: '/' } },
      nodeHmacSha1,
      nodeSha1,
    );
    expect(auth).toContain('q-url-param-list=acl;delimiter;max-keys');
    // 验证 HttpParameters 参与签名：重算期望签名对比
    const keyTime = '1700000000;1700000600';
    const httpParameters = 'acl=&delimiter=%2F&max-keys=10';
    const httpHeaders = `host=${encodeURIComponent(HOST)}&pic-operations=${cosUrlEncode(PIC_OPS)}`;
    const httpString = `get\n/cutout-uploads/fixed-id.png\n${httpParameters}\n${httpHeaders}\n`;
    const signKey = nodeHmacSha1(CRED.secretKey, keyTime);
    const expected = nodeHmacSha1(signKey, `sha1\n${keyTime}\n${nodeSha1(httpString)}\n`);
    expect(auth).toContain(`q-signature=${expected}`);
  });

  it('header key 转小写后参与签名', () => {
    const auth = cosAuthorization(
      CRED,
      { ...fixedInput, headers: { Host: HOST, 'Pic-Operations': PIC_OPS } },
      nodeHmacSha1,
      nodeSha1,
    );
    expect(auth).toContain('q-header-list=host;pic-operations');
  });
});

describe('parseUploadResultXml', () => {
  it('提取 ProcessResults.Object 的 Key/Location', () => {
    const xml =
      '<UploadResult><OriginalInfo><Key>src.png</Key></OriginalInfo>' +
      '<ProcessResults><Object><Key>cutout-results/r.png</Key>' +
      '<Location>examplebucket-1250000000.cos.ap-guangzhou.myqcloud.com/cutout-results/r.png</Location>' +
      '<Size>354256</Size></Object></ProcessResults></UploadResult>';
    expect(parseUploadResultXml(xml)).toEqual({
      key: 'cutout-results/r.png',
      location: 'examplebucket-1250000000.cos.ap-guangzhou.myqcloud.com/cutout-results/r.png',
    });
  });

  it('无 ProcessResults 抛错', () => {
    expect(() => parseUploadResultXml('<UploadResult><OriginalInfo/></UploadResult>')).toThrow(/ProcessResults/);
  });

  it('ProcessResults 内无 Key 抛错', () => {
    expect(() => parseUploadResultXml('<ProcessResults><Object><Size>1</Size></Object></ProcessResults>')).toThrow(/Key/);
  });
});
