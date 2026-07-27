/**
 * Jest 全局准备：
 * - mock react-native-safe-area-context（平台外壳，非被测核心；
 *   使用库自带的官方 jest mock；5.x 路径为 jest/mock）。
 */
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);
