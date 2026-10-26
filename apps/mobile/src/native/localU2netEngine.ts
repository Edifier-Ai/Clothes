/**
 * 端侧 u2netp 抠图引擎（默认抠图路径，照片不离开手机）。
 *
 * 2026-10-26 用户选定：默认本地 u2netp，抠得不好交给修边画布；腾讯云 GoodsMatting 仅在用户
 * 自行配置凭证并确认上传告知后启用（见 core/cutout/engineResolver.ts）。
 *
 * 流程：源图 → Skia 解码并缩放到 320×320 RGBA → preprocessU2net → ONNX Runtime 推理
 *   → postprocessU2net 缩放到 maskWidth×maskHeight。
 * 原生依赖（onnxruntime-react-native、expo-asset、Skia）全部经 deps 注入或懒 require，
 * 使 Jest/Node 可以用替身或 onnxruntime-node 覆盖同一段逻辑。
 */
import type { SegmentationEngine, SegmentationInput, SegmentationOutput } from './segmentationEngine';
import { postprocessU2net, preprocessU2net, U2NET_SIZE } from './u2net';

/** 已加载模型的最小推理接口：输入 1×3×320×320，返回第一个输出的 320×320 数据。 */
export interface U2netSession {
  run(input: Float32Array): Promise<Float32Array>;
}

export interface LocalU2netEngineDeps {
  /** 读取源图并缩放为 size×size 非预乘 RGBA。 */
  readResized(path: string, size: number): Promise<Uint8Array>;
  /** 加载模型会话（只调用一次，结果缓存）。 */
  loadSession(): Promise<U2netSession>;
  now?: () => number;
}

export class LocalU2netEngine implements SegmentationEngine {
  readonly name = 'local-u2netp';
  available = true;
  unavailableReason?: string;

  private session: Promise<U2netSession> | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: LocalU2netEngineDeps) {
    this.now = deps.now ?? (() => performance.now());
  }

  private ensureSession(): Promise<U2netSession> {
    if (!this.session) {
      this.session = this.deps.loadSession().catch((error: unknown) => {
        // 加载失败不缓存，下次 drain 还能重试（例如首次解包模型文件时被打断）。
        this.session = null;
        throw error;
      });
    }
    return this.session;
  }

  /** 预加载模型；失败时置 available=false 并给出原因，处理器据此保持任务 pending。 */
  async refreshAvailability(): Promise<boolean> {
    try {
      await this.ensureSession();
      this.available = true;
      this.unavailableReason = undefined;
    } catch (error) {
      this.available = false;
      this.unavailableReason = `本地抠图模型加载失败：${error instanceof Error ? error.message : String(error)}`;
    }
    return this.available;
  }

  async segment(input: SegmentationInput): Promise<SegmentationOutput> {
    const t0 = this.now();
    const session = await this.ensureSession();
    const rgba = await this.deps.readResized(input.sourcePath, U2NET_SIZE);
    const saliency = await session.run(preprocessU2net(rgba));
    const alpha = postprocessU2net(saliency, input.maskWidth, input.maskHeight);
    return { alpha, width: input.maskWidth, height: input.maskHeight, ms: this.now() - t0 };
  }
}

// ---------- 设备默认实现 ----------

type OrtModule = typeof import('onnxruntime-react-native');

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** 设备：expo-asset 把随包模型解到本地文件，再交给 ONNX Runtime 加载。 */
async function loadDeviceSession(): Promise<U2netSession> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { Asset } = require('expo-asset') as typeof import('expo-asset');
  const ort = require('onnxruntime-react-native') as OrtModule;
  const asset = Asset.fromModule(require('../../assets/models/u2netp.onnx'));
  /* eslint-enable @typescript-eslint/no-require-imports */
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('模型文件不可用');
  const session = await ort.InferenceSession.create(uri, { graphOptimizationLevel: 'all' });
  const inputName = session.inputNames[0];
  const outputName = session.outputNames[0];
  return {
    async run(input) {
      const tensor = new ort.Tensor('float32', input, [1, 3, U2NET_SIZE, U2NET_SIZE]);
      const result = await session.run({ [inputName]: tensor });
      return result[outputName].data as Float32Array;
    },
  };
}

/** 设备：读源图字节 → Skia 解码并缩放到 size×size。 */
async function readDeviceResized(path: string, size: number): Promise<Uint8Array> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const FileSystem = require('expo-file-system/legacy') as typeof import('expo-file-system/legacy');
  const { decodeResizedRgba } = require('./skiaPngCodec') as typeof import('./skiaPngCodec');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
  return decodeResizedRgba(base64ToBytes(b64), size, size);
}

/** 设备默认引擎（模型首次 segment/refreshAvailability 时懒加载）。 */
export function createDeviceLocalU2netEngine(): LocalU2netEngine {
  return new LocalU2netEngine({ readResized: readDeviceResized, loadSession: loadDeviceSession });
}
