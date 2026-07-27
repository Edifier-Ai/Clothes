/**
 * 端侧 ONNX 抠图探针（MVP-002）。走文件路径/二进制，不走 Base64。
 *
 * 测量：模型加载、单张推理 p50/p95 延迟、峰值内存、模型体积与 sha256。
 * 模型/图片缺失或运行时不可用时返回 available=false + reason，绝不伪造数据。
 *
 * 默认模型策略（TECH_STACK §4）：U²-Net-p 低内存基线；IS-Net General 质量候选；
 * BiRefNet Lite 仅在真机胜出后替换。模型文件由下载/包内策略落到 documentDirectory/models/。
 */
import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';
import type { InferenceSession } from 'onnxruntime-react-native';

export interface ProbeInput {
  /** ONNX 模型绝对路径 */
  modelPath: string;
  /** 待推理图片绝对路径 */
  imagePath: string;
  /** 模型输入张量尺寸 [1,3,H,W] */
  inputHW: [number, number];
  /** 重复推理次数取分位 */
  runs: number;
}

export interface ProbeResult {
  available: boolean;
  reason?: string;
  modelBytes: number;
  modelHash: string;
  loadMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  peakHeapMb: number | null;
  outputMaskBytes: number | null;
}

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function heapMb(): number | null {
  // Hermes 暴露 globalThis.performance?.memory? 多数情况无；退化用 Device 信息不可得时 null
  const perf = (globalThis as unknown as { performance?: { memory?: { usedJSHeapSize?: number } } }).performance;
  const m = perf?.memory?.usedJSHeapSize;
  return typeof m === 'number' ? m / 1024 / 1024 : null;
}

/** 读文件为 Uint8Array（二进制，非 Base64 字符串进模型）。 */
async function readBytes(path: string): Promise<Uint8Array> {
  // expo-file-system legacy 提供 readAsStringAsync(base64)；转为二进制 buffer。
  const b64 = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.Base64 });
  // atob 在 Hermes 可用；转 Uint8Array（仅用于把模型字节喂给 create(Uint8Array)，非图像像素）。
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * 把图片解码为归一化 float32 NCHW 张量数据。
 * 真机像素解码用 expo-image 的 PixelMap（getImageBytes）或 Skia；此处给出可编译的解码钩子，
 * 由调用方/平台注入 decode 实现，避免在探针内硬绑某一解码器。
 */
export type ImageDecoder = (path: string, w: number, h: number) => Promise<Float32Array>;

/** 默认解码钩子占位：无注入时不可用（探针据此标 unavailable，不伪造像素）。 */
const defaultDecoder: ImageDecoder = async () => {
  throw new Error('no image decoder injected (provide expo-image PixelMap / Skia decoder)');
};

export async function runSegmentationProbe(
  input: ProbeInput,
  decode: ImageDecoder = defaultDecoder,
): Promise<ProbeResult> {
  const base: ProbeResult = {
    available: false,
    modelBytes: 0,
    modelHash: '',
    loadMs: null,
    p50Ms: null,
    p95Ms: null,
    peakHeapMb: null,
    outputMaskBytes: null,
  };
  let ort: typeof import('onnxruntime-react-native');
  try {
    ort = require('onnxruntime-react-native');
  } catch (e) {
    return { ...base, reason: `onnxruntime-react-native unavailable: ${String(e)}` };
  }
  if (!(await FileSystem.getInfoAsync(input.modelPath)).exists) {
    return { ...base, reason: `model not found: ${input.modelPath}` };
  }
  if (!(await FileSystem.getInfoAsync(input.imagePath)).exists) {
    return { ...base, reason: `image not found: ${input.imagePath}` };
  }
  // 模型体积 + sha256（流式不可得，读字节哈希；模型通常数 MB 可接受）
  const info = (await FileSystem.getInfoAsync(input.modelPath)) as { exists: boolean; size?: number };
  const modelBytes = info.exists ? info.size ?? 0 : 0;
  const modelB64 = await FileSystem.readAsStringAsync(input.modelPath, { encoding: FileSystem.EncodingType.Base64 });
  const modelHash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, modelB64);

  let session: InferenceSession;
  const tLoad0 = performance.now();
  try {
    // 走二进制路径：把模型字节喂给 create(Uint8Array)，避免依赖会话对 file:// 的支持差异。
    const bytes = await readBytes(input.modelPath);
    session = await ort.InferenceSession.create(bytes, { executionProviders: [{ name: 'cpu' }] });
  } catch (e) {
    return { ...base, modelBytes, modelHash, reason: `session create failed: ${String(e)}` };
  }
  const loadMs = performance.now() - tLoad0;

  let tensorData: Float32Array;
  try {
    tensorData = await decode(input.imagePath, input.inputHW[1], input.inputHW[0]);
  } catch (e) {
    try {
      await session.release();
    } catch {
      /* ignore */
    }
    return { ...base, modelBytes, modelHash, loadMs, reason: `image decode failed: ${String(e)}` };
  }

  const [H, W] = input.inputHW;
  const inputName = session.inputNames[0] ?? 'input';
  const tensor = new ort.Tensor('float32', tensorData, [1, 3, H, W]);
  const lats: number[] = [];
  let peak = heapMb();
  let outBytes: number | null = null;
  try {
    for (let i = 0; i < input.runs; i++) {
      const t0 = performance.now();
      const feeds: Record<string, typeof tensor> = { [inputName]: tensor };
      const out = await session.run(feeds);
      const dt = performance.now() - t0;
      lats.push(dt);
      const outName = session.outputNames[0];
      const outTensor = out[outName];
      outBytes = outTensor?.data ? (outTensor.data as ArrayLike<number>).length : outBytes;
      const h = heapMb();
      if (h !== null) peak = peak === null ? h : Math.max(peak, h);
    }
  } catch (e) {
    try {
      await session.release();
    } catch {
      /* ignore */
    }
    return { ...base, modelBytes, modelHash, loadMs, reason: `inference failed: ${String(e)}` };
  }
  try {
    await session.release();
  } catch {
    /* ignore */
  }
  lats.sort((a, b) => a - b);
  return {
    available: true,
    modelBytes,
    modelHash,
    loadMs,
    p50Ms: percentile(lats, 50),
    p95Ms: percentile(lats, 95),
    peakHeapMb: peak,
    outputMaskBytes: outBytes,
  };
}
