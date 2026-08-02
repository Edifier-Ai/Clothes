import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

// @shopify/flash-list 以 ESM 形式发布，jest 默认不转换；空态分支不渲染它，
// 这里用空替身避免 import 时解析 ESM 失败（仅外壳，非被测核心）。
jest.mock('@shopify/flash-list', () => ({ FlashList: () => null }));

// 外壳测试不需要真实路由/图像；mock 掉以避免 expo-router 源文件 ESM 解析与原生图像模块。
jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: () => undefined, back: () => undefined }),
    useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), []),
    useLocalSearchParams: () => ({}),
  };
});
jest.mock('expo-image', () => ({ Image: () => null }));

// 外壳渲染测试不触真实 DB（expo-sqlite 为原生模块，jest 无原生层）；
// DAO/迁移/事务的真实行为由 src/core/db 的 better-sqlite3 测试覆盖。
jest.mock('@/core/garments/service', () => ({
  listGarments: () => Promise.resolve([]),
  listActiveGarmentsWithThumbs: () => Promise.resolve([]),
  getGarmentDetail: () => Promise.resolve(null),
  editGarment: () => Promise.resolve(true),
  deleteGarment: () => Promise.resolve(true),
  assetExists: () => Promise.resolve(true),
  queryWardrobe: () => Promise.resolve([]),
  batchUpdate: () => Promise.resolve({ updated: 0 }),
}));

// 造型页（LOK-01）外壳测试不触真实 DB/Skia/文件系统：
// lookService 单例与封面合成在 jest 无原生层，mock 掉（真实行为由 core 测试覆盖）。
jest.mock('@/core/looks/lookService', () => ({
  listLooks: () => Promise.resolve([]),
}));
jest.mock('@/features/looks/LookCover', () => ({ LookCover: () => null }));

// 计划页（PLN-01）外壳测试不触真实 DB：planService 单例 mock 掉（真实行为由 core 测试覆盖）。
jest.mock('@/core/plan/planService', () => ({
  listPlansInRange: () => Promise.resolve([]),
}));

import LooksScreen from '../looks/LooksScreen';
import PlanScreen from '../plan/PlanScreen';
import WardrobeScreen from './WardrobeScreen';

describe('其余三个主标签页骨架', () => {
  it('衣橱页显示标题与空状态主操作', () => {
    render(<WardrobeScreen />);
    expect(screen.getByText('衣橱')).toBeOnTheScreen();
    expect(screen.getAllByRole('button', { name: '添加衣物' }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '查看衣橱洞察' })).toBeOnTheScreen();
  });

  it('造型页显示标题与空状态主操作', () => {
    render(<LooksScreen />);
    expect(screen.getByText('造型')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '新建造型' })).toBeOnTheScreen();
  });

  it('计划页显示标题与空状态主操作', () => {
    render(<PlanScreen />);
    expect(screen.getByText('计划')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '添加计划' })).toBeOnTheScreen();
  });
});
