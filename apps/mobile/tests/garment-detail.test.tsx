/**
 * 单品详情页（garment/[id].tsx）组件测试（MVP-001/003/007）：
 * - 修边入口：非编辑态显示并跳转 /cutout-editor 携带 id；编辑态隐藏。
 * - CLS-03：真实穿着统计（次数/最近/成本次口径/使用造型）。
 * - CLS-05/06：状态 chips 流转 + 状态历史（含时间）。
 * - CLS-08：归档/恢复按钮。
 * - CLS-04：编辑含品牌/备注/价格/购买日。
 *
 * expo-router / garments service / expo-image 在本文件 mock。
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import GarmentDetailScreen from '../src/app/garment/[id]';

const mockPush = jest.fn((..._args: unknown[]) => {});
const mockGetGarmentDetail = jest.fn(async (..._args: unknown[]) => DETAIL);
const mockAssetExists = jest.fn(async (..._args: unknown[]) => true);
const mockGetStats = jest.fn(async (..._args: unknown[]) => STATS);
const mockGetHistory = jest.fn(async (..._args: unknown[]) => HISTORY);
const mockSetStatus = jest.fn(async (..._args: unknown[]) => ({ changed: true, from: 'clean' }));
const mockArchive = jest.fn(async (..._args: unknown[]) => ({ changed: true, from: 'clean' }));
const mockUnarchive = jest.fn(async (..._args: unknown[]) => ({ changed: true, from: 'archived' }));
const mockEdit = jest.fn(async (..._args: unknown[]) => true);

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'g-1' }),
  useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args), back: jest.fn() }),
  useFocusEffect: (cb: () => void) => cb(),
}));

jest.mock('expo-image', () => ({ Image: 'Image' }));

jest.mock('@/core/garments/service', () => ({
  getGarmentDetail: (...args: unknown[]) => mockGetGarmentDetail(...args),
  assetExists: (...args: unknown[]) => mockAssetExists(...args),
  getGarmentStatsById: (...args: unknown[]) => mockGetStats(...args),
  getStatusHistory: (...args: unknown[]) => mockGetHistory(...args),
  setGarmentStatus: (...args: unknown[]) => mockSetStatus(...args),
  archiveGarmentById: (...args: unknown[]) => mockArchive(...args),
  unarchiveGarmentById: (...args: unknown[]) => mockUnarchive(...args),
  editGarment: (...args: unknown[]) => mockEdit(...args),
  deleteGarment: jest.fn(async () => {}),
}));

const DETAIL = {
  garment: {
    id: 'g-1',
    name: '白 T 恤',
    category: 'top',
    status: 'clean',
    priceMinor: 19900,
    currency: 'CNY',
    purchaseDate: '2026-01-15',
    archivedAt: null,
    deletedAt: null,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  },
  asset: { id: 'a-1', garmentId: 'g-1', originalRelPath: 'originals/g-1.png' },
  tags: [
    { id: 't-1', garmentId: 'g-1', kind: 'color', value: '白', confidence: 1 },
    { id: 't-2', garmentId: 'g-1', kind: 'brand', value: '优衣库', confidence: 1 },
  ],
};

const STATS = {
  timesWorn: 2,
  lastWornAt: new Date(2027, 0, 5).getTime(),
  costPerWearMinor: 9950,
  outfits: [
    {
      recommendationId: 'r1',
      date: '2027-01-01',
      createdAt: 1,
      slots: [
        { garmentId: 'g-1', slot: 'top', name: '白 T 恤' },
        { garmentId: 'g-2', slot: 'bottom', name: '黑西裤' },
      ],
    },
  ],
};

const HISTORY = [
  { id: 'e1', garmentId: 'g-1', fromStatus: 'clean', toStatus: 'laundry', changedAt: new Date(2027, 0, 3, 20, 30).getTime() },
  { id: 'e2', garmentId: 'g-1', fromStatus: 'laundry', toStatus: 'clean', changedAt: new Date(2027, 0, 4, 9, 5).getTime() },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGarmentDetail.mockResolvedValue(DETAIL as never);
  mockAssetExists.mockResolvedValue(true as never);
  mockGetStats.mockResolvedValue(STATS as never);
  mockGetHistory.mockResolvedValue(HISTORY as never);
});

describe('garment detail：修边入口（IMP-03/04 导航）', () => {
  it('非编辑态显示「修边」，点击跳转 /cutout-editor?id=g-1', async () => {
    render(<GarmentDetailScreen />);
    await waitFor(() => expect(screen.getByText('白 T 恤')).toBeOnTheScreen());
    const btn = screen.getByRole('button', { name: '修边' });
    fireEvent.press(btn);
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/cutout-editor', params: { id: 'g-1' } });
  });

  it('编辑态隐藏「修边」入口', async () => {
    render(<GarmentDetailScreen />);
    await waitFor(() => expect(screen.getByText('白 T 恤')).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '编辑' }));
    expect(screen.queryByRole('button', { name: '修边' })).toBeNull();
  });
});

describe('garment detail：真实统计（CLS-03）', () => {
  it('显示穿着次数、最近时间、成本/次（含口径）与使用造型', async () => {
    render(<GarmentDetailScreen />);
    await waitFor(() => expect(screen.getByText(/穿过 2 次/)).toBeOnTheScreen());
    expect(screen.getByText(/最近 2027-01-05/)).toBeOnTheScreen();
    expect(screen.getByText(/成本\/次 ¥99\.50（价格 ÷ 穿着次数）/)).toBeOnTheScreen();
    expect(screen.getByText('使用造型')).toBeOnTheScreen();
    expect(screen.getByText(/2027-01-01 · 白 T 恤 \+ 黑西裤/)).toBeOnTheScreen();
  });

  it('无价格时成本/次给口径说明而不是假数字', async () => {
    mockGetStats.mockResolvedValue({ ...STATS, costPerWearMinor: null } as never);
    mockGetGarmentDetail.mockResolvedValue({
      ...DETAIL,
      garment: { ...DETAIL.garment, priceMinor: null, currency: null },
    } as never);
    render(<GarmentDetailScreen />);
    await waitFor(() => expect(screen.getByText(/填写价格后展示/)).toBeOnTheScreen());
  });
});

describe('garment detail：状态流转与历史（CLS-05/06）', () => {
  it('状态 chips 显示当前状态，点击调用 setGarmentStatus', async () => {
    render(<GarmentDetailScreen />);
    await waitFor(() => expect(screen.getByText('状态：干净')).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '待洗' }));
    await waitFor(() => expect(mockSetStatus).toHaveBeenCalledWith('g-1', 'laundry'));
  });

  it('状态历史按时间倒序展示（最新在前）含时间戳', async () => {
    render(<GarmentDetailScreen />);
    await waitFor(() => expect(screen.getByText('状态历史')).toBeOnTheScreen());
    expect(screen.getByText(/2027-01-04 09:05 · 待洗 → 干净/)).toBeOnTheScreen();
    expect(screen.getByText(/2027-01-03 20:30 · 干净 → 待洗/)).toBeOnTheScreen();
  });
});

describe('garment detail：归档与恢复（CLS-08）', () => {
  it('未归档显示「归档」按钮并调用 archive', async () => {
    render(<GarmentDetailScreen />);
    await waitFor(() => expect(screen.getByText('状态：干净')).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '归档' }));
    await waitFor(() => expect(mockArchive).toHaveBeenCalledWith('g-1'));
  });

  it('已归档显示「恢复到衣橱」并调用 unarchive，状态 chips 隐藏', async () => {
    mockGetGarmentDetail.mockResolvedValue({
      ...DETAIL,
      garment: { ...DETAIL.garment, archivedAt: 1_800_000_000_000 },
    } as never);
    render(<GarmentDetailScreen />);
    await waitFor(() => expect(screen.getByText('状态：已归档')).toBeOnTheScreen());
    expect(screen.queryByRole('button', { name: '待洗' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '恢复到衣橱' }));
    await waitFor(() => expect(mockUnarchive).toHaveBeenCalledWith('g-1'));
  });
});

describe('garment detail：编辑扩展字段（CLS-04）', () => {
  it('编辑保存带品牌/备注标签与价格/购买日', async () => {
    render(<GarmentDetailScreen />);
    await waitFor(() => expect(screen.getByText('白 T 恤')).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '编辑' }));
    // 品牌从既有标签回填
    await waitFor(() => expect(screen.getByDisplayValue('优衣库')).toBeOnTheScreen());
    expect(screen.getByDisplayValue('199')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('2026-01-15')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByPlaceholderText('例如 199'), '249.9');
    fireEvent.press(screen.getByRole('button', { name: '保存' }));
    await waitFor(() =>
      expect(mockEdit).toHaveBeenCalledWith(
        'g-1',
        expect.objectContaining({
          priceMinor: 24990,
          currency: 'CNY',
          purchaseDate: '2026-01-15',
          tags: expect.arrayContaining([
            { kind: 'brand', value: '优衣库', confidence: 1 },
            { kind: 'color', value: '白', confidence: 1 },
          ]),
        }),
      ),
    );
  });
});
