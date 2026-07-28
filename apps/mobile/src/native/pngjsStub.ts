/**
 * pngjs 的 RN-native 桩。
 *
 * pngjs 依赖 Node builtins（util/stream/buffer…），React Native 运行时不含，无法打包。
 * Metro 在 native 平台把 `pngjs` 重定向到本桩（见 metro.config.js resolveRequest），
 * 使主 bundle 不再遍历 pngjs 的 Node 依赖，app 方可启动。
 *
 * 抠图管线（deviceIO/devicePixelReader/cutout-editor）在设备本就 B-6 阻塞（Skia 未链接），
 * 故桩在运行时抛错是可接受的；host 单测不经 Metro，仍用真实 pngjs。
 */
export class PNG {
  static sync = {
    read: (): never => {
      throw new Error('pngjs unavailable on device (Node builtins absent; cutout pipeline BLOCKED B-6)');
    },
    write: (): never => {
      throw new Error('pngjs unavailable on device (Node builtins absent; cutout pipeline BLOCKED B-6)');
    },
  };
  constructor() {
    throw new Error('pngjs unavailable on device (Node builtins absent; cutout pipeline BLOCKED B-6)');
  }
}
