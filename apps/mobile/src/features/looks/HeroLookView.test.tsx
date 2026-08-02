import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { HeroLookView } from './HeroLookView';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-image', () => ({ Image: () => null }));

const mockReplace = jest.fn();
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ replace: (...a: unknown[]) => mockReplace(...a), back: () => undefined }),
    useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), [cb]),
  };
});

const mockGetGarmentDetail = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockQueryWardrobe = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/core/garments/service', () => ({
  getGarmentDetail: (...a: unknown[]) => mockGetGarmentDetail(...a),
  queryWardrobe: (...a: unknown[]) => mockQueryWardrobe(...a),
}));

const mockSaveLook = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/core/looks/lookService', () => ({
  saveLook: (...a: unknown[]) => mockSaveLook(...a),
}));

const mockRebuildCover = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/features/looks/coverCompose', () => ({
  rebuildCover: (...a: unknown[]) => mockRebuildCover(...a),
}));


function entry(id: string, name: string, category: string, patch: { lastWornAt?: number | null; timesWorn?: number } = {}) {
  return {
    item: {
      garment: { id, name, category, status: 'clean', createdAt: 1, updatedAt: 1, deletedAt: null, archivedAt: null, priceMinor: null, currency: null, purchaseDate: null },
      tags: [],
      lastWornAt: patch.lastWornAt ?? null,
      timesWorn: patch.timesWorn ?? 0,
    },
    imageRelPath: null,
  };
}

const NOW = Date.now();

beforeEach(() => {
  jest.clearAllMocks();
  mockGetGarmentDetail.mockResolvedValue({
    garment: { id: 'g-hero', name: '酒红半裙', category: 'bottom', status: 'clean', createdAt: 1, updatedAt: 1, deletedAt: null, archivedAt: null },
    asset: { originalRelPath: 'garments/g-hero/original.jpg' },
    tags: [],
  });
  mockQueryWardrobe.mockResolvedValue([
    entry('g-hero', '酒红半裙', 'bottom', { timesWorn: 2 }),
    entry('g-top1', '白衬衫', 'top', { timesWorn: 9 }),
    entry('g-top2', '米色针织', 'top', { lastWornAt: NOW - 40 * 86_400_000 }),
    entry('g-shoes1', '乐福鞋', 'shoes', { timesWorn: 5 }),
    entry('g-shoes2', '小白鞋', 'shoes'),
    entry('g-out1', '风衣', 'outerwear'),
  ]);
  mockSaveLook.mockResolvedValue({ look: { id: 'l-hero' }, items: [] });
  mockRebuildCover.mockResolvedValue(true);
});

describe('HeroLookView（LOK-07 从单品创建）', () => {
  it('围绕主角生成 3 个组合方向，均含主角单品', async () => {
    render(<HeroLookView heroId="g-hero" />);
    expect((await screen.findAllByText(/酒红半裙/)).length).toBeGreaterThanOrEqual(1);
    expect(await screen.findByText('稳妥熟悉')).toBeOnTheScreen();
    expect(screen.getByText('盘活久未穿')).toBeOnTheScreen();
    expect(screen.getByText('主角突出')).toBeOnTheScreen();
    // 每个方向都含主角单品名
    expect(screen.getAllByText(/酒红半裙/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByRole('button', { name: '采用这套' })).toHaveLength(3);
  });

  it('采用这套：保存 slots 造型（含主角槽位）并重建封面、跳详情', async () => {
    render(<HeroLookView heroId="g-hero" />);
    const buttons = await screen.findAllByRole('button', { name: '采用这套' });
    fireEvent.press(buttons[0]!);
    await waitFor(() => expect(mockSaveLook).toHaveBeenCalledTimes(1));
    const input = mockSaveLook.mock.calls[0]![0] as {
      mode: string;
      items: { garmentId: string; slot: string }[];
    };
    expect(input.mode).toBe('slots');
    const slots = input.items.map((i) => i.slot);
    expect(slots).toContain('bottom');
    expect(slots).toContain('top');
    expect(slots).toContain('shoes');
    expect(input.items.find((i) => i.garmentId === 'g-hero')?.slot).toBe('bottom');
    await waitFor(() => expect(mockRebuildCover).toHaveBeenCalledWith('l-hero'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/look/l-hero'));
  });

  it('衣橱无法组合时方向卡显示缺失说明且不可采用', async () => {
    mockQueryWardrobe.mockResolvedValue([entry('g-hero', '酒红半裙', 'bottom')]);
    render(<HeroLookView heroId="g-hero" />);
    expect(await screen.findByText('稳妥熟悉')).toBeOnTheScreen();
    const adopt = screen.getAllByRole('button', { name: '采用这套' });
    expect(adopt[0]!.props.accessibilityState.disabled).toBe(true);
    expect(screen.getAllByText(/暂缺可组合的单品/).length).toBeGreaterThan(0);
  });
});
