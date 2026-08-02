/**
 * @jest-environment node
 *
 * MVP-010 旅行 UI 外壳测试：
 * 三个旅行屏在 jest 无原生层下渲染——mock 掉 tripService/packingService/looks/garments
 * 单例与 expo-router/expo-image，验证外壳标题与空态主操作存在（真实领域行为由 core 测试覆盖）。
 *
 * jest.mock 工厂不能引用闭包外变量（babel-jest hoisting 限制），工厂内用 require('react')
 * 取 React；imports 放顶部以符合 import/first（jest.mock 由 babel-jest 自动上提，运行时仍在 imports 之前）。
 */
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import TripsScreen from './TripsScreen';
import PackingListScreen from './PackingListScreen';
import TripReviewScreen from './TripReviewScreen';

jest.mock('@shopify/flash-list', () => ({ FlashList: () => null }));
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  return {
    useRouter: () => ({ push: () => undefined, back: () => undefined }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), []),
    useLocalSearchParams: () => ({}),
  };
});
jest.mock('expo-image', () => ({ Image: () => null }));

jest.mock('@/core/garments/service', () => ({
  listActiveGarmentsWithThumbs: () => Promise.resolve([]),
}));
jest.mock('@/core/looks/lookService', () => ({
  listLooks: () => Promise.resolve([]),
}));
jest.mock('@/features/looks/pickCandidates', () => ({
  loadPickCandidates: () => Promise.resolve([]),
}));
jest.mock('@/features/looks/GarmentPicker', () => ({ GarmentPicker: () => null }));

// 旅行服务单例 mock：返回空数组/空状态，验证外壳加载完成后的空态
jest.mock('@/core/trip/tripService', () => ({
  listActiveTrips: () => Promise.resolve([]),
  getTrip: () => Promise.resolve(null),
  listTripOutfits: () => Promise.resolve([]),
  saveTrip: () => Promise.resolve({ trip: { id: 't1' }, activities: [], weatherSnapshot: null }),
  saveTripOutfit: () => Promise.resolve({ tripOutfit: { id: 'to1' }, outfitGarmentIds: [], lookMissing: false }),
  deleteTrip: () => Promise.resolve(),
  deleteTripOutfit: () => Promise.resolve(),
  recordTripOutfitWorn: () => Promise.resolve({ tripOutfit: { id: 'to1' }, outfitGarmentIds: [], lookMissing: false }),
  updateTripStatus: () => Promise.resolve(),
}));
jest.mock('@/core/trip/packingService', () => ({
  listPackingItems: () => Promise.resolve([]),
  regeneratePacking: () => Promise.resolve(),
  addManualItem: () => Promise.resolve({ id: 'm1', kind: 'manual', label: 'x', checked: false }),
  removeManualItem: () => Promise.resolve(),
  toggleCheck: () => Promise.resolve({ id: 'm1', kind: 'manual', label: 'x', checked: true }),
  saveTemplate: () => Promise.resolve({ id: 'tp1' }),
}));

describe('旅行三屏外壳（TRP-01/05/06 空态）', () => {
  it('TRP-01 旅行列表：标题与空态主操作', async () => {
    render(<TripsScreen />);
    expect(screen.getByText('旅行')).toBeOnTheScreen();
    expect(await screen.findByText('还没有旅行')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '新建旅行' })).toBeOnTheScreen();
  });

  it('TRP-05 打包清单：标题与空态提示', async () => {
    render(<PackingListScreen tripId="t1" />);
    expect(screen.getByText('打包清单')).toBeOnTheScreen();
    expect(await screen.findByText('清单为空')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '重新生成' })).toBeOnTheScreen();
  });

  it('TRP-06 旅行复盘：标题与未穿依据实际记录说明', async () => {
    render(<TripReviewScreen tripId="t1" />);
    expect(screen.getByText('旅行复盘')).toBeOnTheScreen();
    expect(await screen.findByText('尚无安排')).toBeOnTheScreen();
  });
});
