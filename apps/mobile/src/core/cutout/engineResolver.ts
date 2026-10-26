/**
 * 抠图引擎选择（生产路径唯一入口）：
 *   默认 → LocalU2netEngine（端侧 u2netp，照片不离开手机，2026-10-26 用户选定）；
 *   用户自行配置腾讯云凭证 + 确认上传告知 → TencentCiEngine（可选的云端高质量模式）。
 * 凭证不全或未确认告知时一律走本地，绝不上传；StubSegmentationEngine 仅限测试。
 *
 * TencentCiEngine 的 available 是异步语义（构造时为 false，refreshAvailability()/segment()
 * 读取配置后才反映真实状态）；LocalU2netEngine 在 refreshAvailability() 时预加载模型。
 * 处理器 drain 前会调用可选的 refreshAvailability()。
 */
import { TencentCiEngine, type TencentCiConfig } from '../../native/tencentCiEngine';
import type { PixelReader, SegmentationEngine } from '../../native/segmentationEngine';
import type { LocalU2netEngine } from '../../native/localU2netEngine';
import {
  hasUploadConsent,
  loadTencentCiConfig,
  missingTencentCiFields,
  type TencentCiField,
} from './apiConfig';

export type CutoutMode = 'local' | 'cloud';

export interface CutoutEngineResolution {
  engine: SegmentationEngine;
  /** local：端侧 u2netp；cloud：腾讯云 GoodsMatting */
  mode: CutoutMode;
  /** 腾讯云四字段凭证是否齐全 */
  configured: boolean;
  /** 缺失/为空的凭证字段 */
  missing: TencentCiField[];
  /** 用户是否已确认上传告知（未配置时恒为 false） */
  consentGranted: boolean;
  /** 云端是否就绪（configured && consentGranted）；true 时 engine 为 TencentCiEngine */
  ready: boolean;
}

export interface ResolveCutoutEngineDeps {
  readPixels: PixelReader;
  /** 默认 loadTencentCiConfig（expo-secure-store）；测试可注入 */
  loadConfig?: () => Promise<Partial<TencentCiConfig> | null>;
  /** 默认 hasUploadConsent；测试可注入 */
  hasConsent?: () => Promise<boolean>;
  /** 默认设备端 u2netp 引擎（进程内单例，模型只加载一次）；测试可注入 */
  localEngine?: () => SegmentationEngine;
}

let deviceLocalEngine: LocalU2netEngine | null = null;

function defaultLocalEngine(): SegmentationEngine {
  if (!deviceLocalEngine) {
    // 懒 require：Jest/Node 引用本模块时不求值 ONNX Runtime / Skia 原生绑定。
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { createDeviceLocalU2netEngine } = require('../../native/localU2netEngine') as typeof import('../../native/localU2netEngine');
    deviceLocalEngine = createDeviceLocalU2netEngine();
  }
  return deviceLocalEngine;
}

export async function resolveCutoutEngine(deps: ResolveCutoutEngineDeps): Promise<CutoutEngineResolution> {
  const loadConfig = deps.loadConfig ?? loadTencentCiConfig;
  const hasConsent = deps.hasConsent ?? hasUploadConsent;
  const localEngine = deps.localEngine ?? defaultLocalEngine;
  const config = await loadConfig();
  const missing = missingTencentCiFields(config);
  const configured = missing.length === 0;
  const consentGranted = configured ? await hasConsent() : false;
  if (configured && consentGranted) {
    return {
      engine: new TencentCiEngine(deps.readPixels, { getConfig: loadConfig }),
      mode: 'cloud',
      configured,
      missing,
      consentGranted,
      ready: true,
    };
  }
  return { engine: localEngine(), mode: 'local', configured, missing, consentGranted, ready: false };
}
