const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

// pnpm monorepo: hoisted node_modules lives at the repo root.
const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [monorepoRoot];
// 端侧抠图模型（assets/models/*.onnx）作为静态资源随包分发，由 expo-asset 解包后交给 ONNX Runtime。
config.resolver.assetExts.push('onnx');
config.resolver.disableHierarchicalLookup = true;
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// pngjs 依赖 Node builtins，RN-native 无法打包。native 平台把 `pngjs` 重定向到桩，
// 使主 bundle 不遍历 pngjs 的 Node 依赖，app 方可启动（抠图链路设备本就 B-6 阻塞）。
// jest/web 不经此 resolver，仍用真实 pngjs。
const PNGJS_STUB = path.resolve(projectRoot, 'src/native/pngjsStub.ts');
const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'pngjs' && platform !== 'web') {
    return { type: 'sourceFile', filePath: PNGJS_STUB };
  }
  if (defaultResolve) return defaultResolve(context, moduleName, platform);
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
