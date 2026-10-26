/**
 * onnxruntime-react-native 自带 unimodule.json，Expo 57 的 autolinking 会把它当成 Expo 模块，
 * 又因它没有 Expo 模块类而跳过 RN 原生包注册（NativeModules.Onnxruntime 为 null）。
 * 在项目级声明 Android 依赖，强制按普通 RN 原生模块链接 OnnxruntimePackage。
 */
module.exports = {
  dependencies: {
    'onnxruntime-react-native': {
      platforms: {
        android: {},
      },
    },
  },
};
