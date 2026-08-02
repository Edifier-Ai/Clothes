/**
 * 抠图引擎选择（生产路径唯一入口）：
 *   凭证齐全 + 用户已确认上传告知 → TencentCiEngine（tencent-goods-matting，唯一抠图路径）；
 *   否则 → UnavailableCutoutEngine（available=false + 明确原因），处理器保持任务 pending，
 *   绝不伪造蒙版，也绝不退回 stub（StubSegmentationEngine 仅限测试）。
 *
 * TencentCiEngine 的 available 是异步语义（构造时为 false，refreshAvailability()/segment()
 * 读取配置后才反映真实状态）：处理器 drain 前会调用可选的 refreshAvailability()，
 * 调用方也可依据本模块返回的 ready/configured/consentGranted 直接做 UI 分支。
 */
import { TencentCiEngine, type TencentCiConfig } from '../../native/tencentCiEngine';
import type { PixelReader, SegmentationEngine } from '../../native/segmentationEngine';
import {
  hasUploadConsent,
  loadTencentCiConfig,
  missingTencentCiFields,
  type TencentCiField,
} from './apiConfig';

/** 配置/告知未就绪时的占位引擎：只携带明确原因，segment 永远抛错。 */
export class UnavailableCutoutEngine implements SegmentationEngine {
  readonly name = 'unavailable-cutout';
  readonly available = false;

  constructor(readonly unavailableReason: string) {}

  async segment(): Promise<never> {
    throw new Error(`engine ${this.name} unavailable: ${this.unavailableReason}`);
  }
}

export interface CutoutEngineResolution {
  engine: SegmentationEngine;
  /** 四字段凭证是否齐全 */
  configured: boolean;
  /** 缺失/为空的凭证字段 */
  missing: TencentCiField[];
  /** 用户是否已确认上传告知（未配置时恒为 false） */
  consentGranted: boolean;
  /** configured && consentGranted；true 时 engine 为 TencentCiEngine */
  ready: boolean;
}

export interface ResolveCutoutEngineDeps {
  readPixels: PixelReader;
  /** 默认 loadTencentCiConfig（expo-secure-store）；测试可注入 */
  loadConfig?: () => Promise<Partial<TencentCiConfig> | null>;
  /** 默认 hasUploadConsent；测试可注入 */
  hasConsent?: () => Promise<boolean>;
}

export async function resolveCutoutEngine(deps: ResolveCutoutEngineDeps): Promise<CutoutEngineResolution> {
  const loadConfig = deps.loadConfig ?? loadTencentCiConfig;
  const hasConsent = deps.hasConsent ?? hasUploadConsent;
  const config = await loadConfig();
  const missing = missingTencentCiFields(config);
  if (missing.length > 0) {
    const reason =
      config === null
        ? '未配置腾讯云抠图服务（secretId/secretKey/bucket/region）'
        : `腾讯云凭证字段缺失/为空: ${missing.join(', ')}`;
    return {
      engine: new UnavailableCutoutEngine(reason),
      configured: false,
      missing,
      consentGranted: false,
      ready: false,
    };
  }
  const consentGranted = await hasConsent();
  if (!consentGranted) {
    return {
      engine: new UnavailableCutoutEngine('尚未确认「照片上传至腾讯云数据万象抠图」告知，确认前不入队不上传'),
      configured: true,
      missing: [],
      consentGranted: false,
      ready: false,
    };
  }
  return {
    engine: new TencentCiEngine(deps.readPixels, { getConfig: loadConfig }),
    configured: true,
    missing: [],
    consentGranted: true,
    ready: true,
  };
}
