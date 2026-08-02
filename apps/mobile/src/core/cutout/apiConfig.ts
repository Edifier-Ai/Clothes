/**
 * 抠图服务配置（腾讯云数据万象 GoodsMatting 凭证）与上传告知确认的持久化。
 *
 * 存储：expo-secure-store（key/value 仅本机安全区，不落镜像、不进 SQLite，符合
 * TECH_STACK §4「key 仅存本机」）。凭证与告知确认（consent）放在同一模块，
 * 清除凭证时同步撤销 consent，避免「换 key 后沿用旧同意」。
 *
 * jest 中 expo-secure-store 由 jest.setup.js 全局 mock（内存 Map）。
 */
import * as SecureStore from 'expo-secure-store';

import type { TencentCiConfig } from '../../native/tencentCiEngine';

const CONFIG_KEY = 'tencent-ci-config';
const CONSENT_KEY = 'tencent-ci-upload-consent';
const CONSENT_GRANTED = 'granted';

export const REQUIRED_TENCENT_CI_FIELDS = ['secretId', 'secretKey', 'bucket', 'region'] as const;
export type TencentCiField = (typeof REQUIRED_TENCENT_CI_FIELDS)[number];

/** 缺失/为空的字段列表；config 为 null 时返回全部必填字段。 */
export function missingTencentCiFields(config: Partial<TencentCiConfig> | null): TencentCiField[] {
  if (config === null) return [...REQUIRED_TENCENT_CI_FIELDS];
  return REQUIRED_TENCENT_CI_FIELDS.filter((f) => !config[f] || !String(config[f]).trim());
}

/** 读取凭证；未配置或内容损坏返回 null，对象可缺字段（由 missingTencentCiFields 判定）。 */
export async function loadTencentCiConfig(): Promise<Partial<TencentCiConfig> | null> {
  const raw = await SecureStore.getItemAsync(CONFIG_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<TencentCiConfig>;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** 保存凭证（四字段完整才允许落库；调用方先用 missingTencentCiFields 校验）。 */
export async function saveTencentCiConfig(config: TencentCiConfig): Promise<void> {
  await SecureStore.setItemAsync(CONFIG_KEY, JSON.stringify(config));
}

/** 清除凭证，并同步撤销上传告知确认。 */
export async function clearTencentCiConfig(): Promise<void> {
  await SecureStore.deleteItemAsync(CONFIG_KEY);
  await SecureStore.deleteItemAsync(CONSENT_KEY);
}

/** 用户是否已确认「照片上传至腾讯云数据万象抠图」告知。 */
export async function hasUploadConsent(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CONSENT_KEY)) === CONSENT_GRANTED;
}

/** 记录用户已确认上传告知。 */
export async function grantUploadConsent(): Promise<void> {
  await SecureStore.setItemAsync(CONSENT_KEY, CONSENT_GRANTED);
}

/** 撤销上传告知确认（再次抠图前需重新告知）。 */
export async function revokeUploadConsent(): Promise<void> {
  await SecureStore.deleteItemAsync(CONSENT_KEY);
}
