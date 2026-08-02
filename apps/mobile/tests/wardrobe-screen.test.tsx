import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Text, View } from 'react-native';

/**
 * 衣橱页 CLS-02/07/08 交互测试：搜索、组合筛选、无结果清空、批量模式、归档区。
 * service 层 mocked；核心筛选语义由 src/core/wardrobe 的 better-sqlite3 测试覆盖。
 */

// FlashList 空替身：渲染 data 以便断言行内容
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlashList: (props: {
      data: unknown[];
      keyExtractor: (it: unknown) => string;
      renderItem: (arg: { item: unknown }) => React.ReactElement;
    }) =>
      React.createElement(
        View,
        null,
        props.data.map((it) =>
          React.createElement(View, { key: props.keyExtractor(it) }, props.renderItem({ item: it })),
        ),
      ),
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  return {
    useRouter: () => ({ push: () => undefined, back: () => undefined }),
    useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), []),
    useLocalSearchParams: () => ({}),
  };
});
jest.mock('expo-image', () => ({ Image: () => null }));

const NOW = 1_800_000_000_000;

function entry(id: string, name: string, status = 'clean', archivedAt: number | null = null) {
  return {
    item: {
      garment: {
        id,
        name,
        category: 'top',
        status,
        priceMinor: null,
        currency: null,
        purchaseDate: null,
        archivedAt,
        deletedAt: null,
        createdAt: NOW,
        updatedAt: NOW,
      },
      tags: [{ id: `${id}-c`, garmentId: id, kind: 'color', value: '白色', confidence: 1 }],
      lastWornAt: null,
      timesWorn: 0,
    },
    imageRelPath: null,
  };
}

const mock = {
  entries: [] as ReturnType<typeof entry>[],
  queryWardrobe: jest.fn((_filter?: unknown, _sort?: unknown) => Promise.resolve(mock.entries)),
  batchUpdate: jest.fn((_ids?: unknown, _patch?: unknown) => Promise.resolve({ updated: 1 })),
};

jest.mock('@/core/garments/service', () => ({
  queryWardrobe: (filter: unknown, sort: unknown) => mock.queryWardrobe(filter, sort),
  batchUpdate: (ids: unknown, patch: unknown) => mock.batchUpdate(ids, patch),
}));

import WardrobeScreen from '../src/features/wardrobe/WardrobeScreen';

describe('衣橱页搜索与筛选（CLS-02）', () => {
  beforeEach(() => {
    mock.entries = [entry('g1', '白衬衫'), entry('g2', '黑西裤', 'laundry')];
    mock.queryWardrobe.mockClear();
    mock.batchUpdate.mockClear();
  });

  it('渲染搜索框与网格条目', async () => {
    render(<WardrobeScreen />);
    expect(screen.getByLabelText('搜索衣物')).toBeOnTheScreen();
    await waitFor(() => expect(screen.getByText('白衬衫')).toBeOnTheScreen());
    expect(screen.getByText('黑西裤')).toBeOnTheScreen();
    expect(screen.getByText('2 件衣物')).toBeOnTheScreen();
  });

  it('输入搜索词后按 text 条件查询', async () => {
    render(<WardrobeScreen />);
    fireEvent.changeText(screen.getByLabelText('搜索衣物'), '优衣库');
    await waitFor(() =>
      expect(mock.queryWardrobe).toHaveBeenCalledWith(
        expect.objectContaining({ text: '优衣库' }),
        expect.anything(),
      ),
    );
  });

  it('筛选面板：状态/类别/久未穿条件可叠加', async () => {
    render(<WardrobeScreen />);
    fireEvent.press(screen.getByRole('button', { name: '筛选' }));
    fireEvent.press(screen.getByRole('button', { name: '待洗' }));
    fireEvent.press(screen.getByRole('button', { name: '上装' }));
    fireEvent.press(screen.getByRole('button', { name: '30 天没穿' }));
    await waitFor(() =>
      expect(mock.queryWardrobe).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'laundry', category: 'top', notWornDays: 30 }),
        expect.anything(),
      ),
    );
  });

  it('无结果且有条件时给一键清空，清空后回到全量', async () => {
    render(<WardrobeScreen />);
    fireEvent.press(screen.getByRole('button', { name: '筛选' }));
    fireEvent.press(screen.getByRole('button', { name: '待洗' }));
    mock.entries = [];
    await waitFor(() => expect(mock.queryWardrobe).toHaveBeenCalled());
    // 触发一次重渲染拿到空态
    fireEvent.press(screen.getByRole('button', { name: '干洗' }));
    await waitFor(() => expect(screen.getByText('没有符合条件的衣物')).toBeOnTheScreen());
    fireEvent.press(screen.getAllByRole('button', { name: '清空筛选' })[0]);
    await waitFor(() =>
      expect(mock.queryWardrobe).toHaveBeenLastCalledWith({}, expect.anything()),
    );
  });

  it('归档区：状态=已归档 查询，副标题切换', async () => {
    mock.entries = [entry('g9', '旧毛衣', 'clean', NOW - 1000)];
    render(<WardrobeScreen />);
    fireEvent.press(screen.getByRole('button', { name: '筛选' }));
    fireEvent.press(screen.getByRole('button', { name: '已归档' }));
    await waitFor(() =>
      expect(mock.queryWardrobe).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'archived' }),
        expect.anything(),
      ),
    );
    await waitFor(() => expect(screen.getByText(/已归档 ·/)).toBeOnTheScreen());
  });
});

describe('衣橱页批量操作（CLS-07/08）', () => {
  beforeEach(() => {
    mock.entries = [entry('g1', '白衬衫'), entry('g2', '黑西裤', 'laundry')];
    mock.queryWardrobe.mockClear();
    mock.batchUpdate.mockClear();
  });

  it('长按进入选择模式，批量设待洗', async () => {
    render(<WardrobeScreen />);
    await waitFor(() => expect(screen.getByText('白衬衫')).toBeOnTheScreen());
    fireEvent(screen.getByText('白衬衫'), 'longPress');
    await waitFor(() => expect(screen.getByText('已选 1 件')).toBeOnTheScreen());
    fireEvent.press(screen.getByText('黑西裤'));
    await waitFor(() => expect(screen.getByText('已选 2 件')).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '待洗' }));
    await waitFor(() =>
      expect(mock.batchUpdate).toHaveBeenCalledWith(['g1', 'g2'], { status: 'laundry' }),
    );
  });

  it('批量加标签：选择类型与内容后确认', async () => {
    render(<WardrobeScreen />);
    await waitFor(() => expect(screen.getByText('白衬衫')).toBeOnTheScreen());
    fireEvent(screen.getByText('白衬衫'), 'longPress');
    fireEvent.press(screen.getByRole('button', { name: '加标签' }));
    fireEvent.press(screen.getByRole('button', { name: '季节' }));
    fireEvent.changeText(screen.getByLabelText('标签内容'), '冬');
    fireEvent.press(screen.getByRole('button', { name: '确认' }));
    await waitFor(() =>
      expect(mock.batchUpdate).toHaveBeenCalledWith(['g1'], { addTag: { kind: 'season', value: '冬' } }),
    );
  });

  it('归档区批量恢复', async () => {
    mock.entries = [entry('g9', '旧毛衣', 'clean', NOW - 1000)];
    render(<WardrobeScreen />);
    fireEvent.press(screen.getByRole('button', { name: '筛选' }));
    fireEvent.press(screen.getByRole('button', { name: '已归档' }));
    await waitFor(() => expect(screen.getByText('旧毛衣')).toBeOnTheScreen());
    fireEvent(screen.getByText('旧毛衣'), 'longPress');
    fireEvent.press(screen.getByRole('button', { name: '恢复' }));
    await waitFor(() => expect(mock.batchUpdate).toHaveBeenCalledWith(['g9'], { archive: false }));
  });
});
