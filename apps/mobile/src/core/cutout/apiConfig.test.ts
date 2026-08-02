/**
 * 抠图服务配置（apiConfig.ts）测试：
 * 凭证保存/读取/清除、缺项列表、损坏数据降级、上传告知确认（consent）持久化。
 * expo-secure-store 由 jest.setup.js 全局 mock（内存 Map，经 __store 清理）。
 *
 * @jest-environment node
 */
import { describe, expect, it, beforeEach } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';

import {
  clearTencentCiConfig,
  grantUploadConsent,
  hasUploadConsent,
  loadTencentCiConfig,
  missingTencentCiFields,
  revokeUploadConsent,
  saveTencentCiConfig,
} from './apiConfig';
import type { TencentCiConfig } from '../../native/tencentCiEngine';

const CONFIG: TencentCiConfig = {
  secretId: 'AKIDTEST',
  secretKey: 'SECRETKEY',
  bucket: 'mybucket-1250000000',
  region: 'ap-guangzhou',
};

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  store.clear();
});

describe('missingTencentCiFields 缺项列表', () => {
  it('config 为 null → 返回全部四个必填字段', () => {
    expect(missingTencentCiFields(null)).toEqual(['secretId', 'secretKey', 'bucket', 'region']);
  });

  it('部分字段缺失/空白 → 只列出缺失项', () => {
    expect(missingTencentCiFields({ secretId: 'x', bucket: 'b-1' })).toEqual(['secretKey', 'region']);
    expect(missingTencentCiFields({ secretId: '  ', secretKey: 'k', bucket: 'b', region: 'r' })).toEqual(['secretId']);
  });

  it('字段齐全 → 空列表', () => {
    expect(missingTencentCiFields(CONFIG)).toEqual([]);
  });
});

describe('凭证保存/读取/清除', () => {
  it('未配置时读取返回 null', async () => {
    expect(await loadTencentCiConfig()).toBeNull();
  });

  it('保存后可完整读回', async () => {
    await saveTencentCiConfig(CONFIG);
    expect(await loadTencentCiConfig()).toEqual(CONFIG);
  });

  it('存储内容损坏（非 JSON）时读取降级为 null', async () => {
    store.set('tencent-ci-config', '{not-json');
    expect(await loadTencentCiConfig()).toBeNull();
  });

  it('清除后读取为 null，且同步撤销 consent', async () => {
    await saveTencentCiConfig(CONFIG);
    await grantUploadConsent();
    expect(await hasUploadConsent()).toBe(true);
    await clearTencentCiConfig();
    expect(await loadTencentCiConfig()).toBeNull();
    expect(await hasUploadConsent()).toBe(false);
  });
});

describe('上传告知确认（consent）持久化', () => {
  it('默认未确认', async () => {
    expect(await hasUploadConsent()).toBe(false);
  });

  it('确认后持久，可撤销', async () => {
    await grantUploadConsent();
    expect(await hasUploadConsent()).toBe(true);
    await revokeUploadConsent();
    expect(await hasUploadConsent()).toBe(false);
  });
});
