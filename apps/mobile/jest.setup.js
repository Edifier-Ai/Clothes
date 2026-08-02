/**
 * Jest 全局准备：
 * - mock react-native-safe-area-context（平台外壳，非被测核心；
 *   使用库自带的官方 jest mock；5.x 路径为 jest/mock）。
 * - mock expo-secure-store（无官方 jest mock；抠图服务凭证/上传告知确认走它，
 *   用内存 Map 实现同一 API。测试间通过导出的 __store 或 deleteItemAsync 清理）。
 */
jest.mock('react-native-safe-area-context', () =>
  require('react-native-safe-area-context/jest/mock').default,
);

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, String(value));
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
    /** 测试辅助：直接访问内存存储（清空/预置损坏值） */
    __store: store,
  };
});
