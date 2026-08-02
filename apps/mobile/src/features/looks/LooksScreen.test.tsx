import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { LookDetail } from '@/core/db/dao';
import LooksScreen from './LooksScreen';
import { fireEvent, render, screen } from '@testing-library/react-native';

// FlashList 为平台外壳；测试替身真实渲染列表项以断言网格内容。
jest.mock('@shopify/flash-list', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    FlashList: ({ data, renderItem, keyExtractor }: { data: unknown[]; renderItem: (a: { item: unknown; index: number }) => React.ReactNode; keyExtractor?: (d: unknown) => string }) =>
      React.createElement(
        React.Fragment,
        null,
        data.map((d, i) =>
          React.createElement(React.Fragment, { key: keyExtractor ? keyExtractor(d) : i }, renderItem({ item: d, index: i })),
        ),
      ),
  };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: (...args: unknown[]) => mockPush(...args), back: () => undefined }),
    useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), [cb]),
    useLocalSearchParams: () => ({}),
  };
});

jest.mock('@/features/looks/LookCover', () => ({ LookCover: () => null }));

const mockListLooks = jest.fn<() => Promise<unknown>>();
jest.mock('@/core/looks/lookService', () => ({
  listLooks: () => mockListLooks(),
}));


function look(id: string, name: string, mode: 'slots' | 'canvas', itemCount: number): LookDetail {
  return {
    look: { id, name, mode, sourceLookId: null, coverRelPath: `covers/${id}.png`, createdAt: 1, updatedAt: 1, deletedAt: null },
    items: Array.from({ length: itemCount }, (_, i) => ({
      id: `${id}-i${i}`, lookId: id, garmentId: `g${i}`, slot: null,
      x: 0.5, y: 0.5, scale: 0.4, rotation: 0, zIndex: i, ord: 0,
    })),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListLooks.mockResolvedValue([]);
});

describe('LooksScreen（LOK-01 造型图库）', () => {
  it('空态：计数 0，引导新建', async () => {
    render(<LooksScreen />);
    expect(screen.getByText('造型')).toBeOnTheScreen();
    expect(screen.getByText('0 套造型')).toBeOnTheScreen();
    expect(await screen.findByText('还没有造型')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '新建造型' })).toBeOnTheScreen();
  });

  it('列表渲染：名称、模式与件数、计数', async () => {
    mockListLooks.mockResolvedValue([look('l1', '通勤与晚餐', 'slots', 3), look('l2', '周末拼贴', 'canvas', 5)]);
    render(<LooksScreen />);
    expect(await screen.findByText('2 套造型')).toBeOnTheScreen();
    expect(screen.getByText('通勤与晚餐')).toBeOnTheScreen();
    expect(screen.getByText('快速槽位 · 3 件')).toBeOnTheScreen();
    expect(screen.getByText('周末拼贴')).toBeOnTheScreen();
    expect(screen.getByText('自由画布 · 5 件')).toBeOnTheScreen();
  });

  it('点造型卡片跳详情', async () => {
    mockListLooks.mockResolvedValue([look('l1', '通勤与晚餐', 'slots', 3)]);
    render(<LooksScreen />);
    fireEvent.press(await screen.findByText('通勤与晚餐'));
    expect(mockPush).toHaveBeenCalledWith('/look/l1');
  });

  it('新建入口提供快速槽位与自由画布两种模式', async () => {
    render(<LooksScreen />);
    fireEvent.press(await screen.findByRole('button', { name: '新建造型' }));
    fireEvent.press(screen.getByRole('button', { name: /快速槽位/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/look-editor', params: { mode: 'slots' } });

    mockPush.mockClear();
    fireEvent.press(screen.getByRole('button', { name: '+ 新建' }));
    fireEvent.press(screen.getByRole('button', { name: /自由画布/ }));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/look-editor', params: { mode: 'canvas' } });
  });

  it('加载失败显示错误提示，不崩', async () => {
    mockListLooks.mockRejectedValue(new Error('db down'));
    render(<LooksScreen />);
    expect(await screen.findByText('造型加载失败，请重试')).toBeOnTheScreen();
    // 失败时仍显示空态引导（looks 为空）
    expect(screen.getByText('还没有造型')).toBeOnTheScreen();
  });
});
