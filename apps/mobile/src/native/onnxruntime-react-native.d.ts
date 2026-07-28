/**
 * onnxruntime-react-native 的 ambient 类型桩。
 *
 * 该包因 build.gradle 与 Gradle 9 不兼容（未 import 的 VersionNumber）已从依赖移除（B-6 相关），
 * 真机探针在包缺失时返回 unavailable。此处仅保留探针代码所需的类型，使 typecheck 通过；
 * 若日后装回真实包，本声明文件可删除（真实包自带类型）。
 */
declare module 'onnxruntime-react-native' {
  export interface InferenceSession {
    inputNames: string[];
    outputNames: string[];
    run(feeds: Record<string, Tensor>): Promise<Record<string, Tensor>>;
    release(): Promise<void>;
  }
  export namespace InferenceSession {
    interface SessionOptions {
      executionProviders?: Array<{ name: string }>;
    }
    function create(path: string, options?: SessionOptions): Promise<InferenceSession>;
    function create(buffer: Uint8Array, options?: SessionOptions): Promise<InferenceSession>;
  }
  export class Tensor {
    constructor(type: string, data: Float32Array | number[], dims: number[]);
    data: Float32Array | number[];
    dims: number[];
    type: string;
  }
}
