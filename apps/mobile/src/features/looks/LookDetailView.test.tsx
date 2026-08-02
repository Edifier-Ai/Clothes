import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { LookDetail } from '@/core/db/dao';
import { LookDetailView } from './LookDetailView';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-image', () => ({ Image: () => null }));
jest.mock('@/features/looks/LookCover', () => ({ LookCover: () => null }));

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  return {
    useRouter: () => ({ push: (...a: unknown[]) => mockPush(...a), replace: (...a: unknown[]) => mockReplace(...a), back: () => mockBack() }),
    useFocusEffect: (cb: () => void) => React.useEffect(() => cb(), [cb]),
    useLocalSearchParams: () => ({ id: 'l1' }),
  };
});

const mockGetLookDetail = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockClone = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockVariant = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockDelete = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/core/looks/lookService', () => ({
  getLookDetail: (...a: unknown[]) => mockGetLookDetail(...a),
  cloneLookById: (...a: unknown[]) => mockClone(...a),
  createVariantLook: (...a: unknown[]) => mockVariant(...a),
  deleteLook: (...a: unknown[]) => mockDelete(...a),
}));

const mockQueryWardrobe = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/core/garments/service', () => ({
  queryWardrobe: (...a: unknown[]) => mockQueryWardrobe(...a),
}));

const mockRebuildCover = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/features/looks/coverCompose', () => ({
  rebuildCover: (...a: unknown[]) => mockRebuildCover(...a),
}));


function wardrobeEntry(id: string, name: string, category: string) {
  return {
    item: {
      garment: { id, name, category, status: 'clean', createdAt: 1, updatedAt: 1, deletedAt: null, archivedAt: null, priceMinor: null, currency: null, purchaseDate: null },
      tags: [],
      lastWornAt: null,
      timesWorn: 0,
    },
    imageRelPath: null,
  };
}

const DETAIL: LookDetail = {
  look: { id: 'l1', name: '通勤与晚餐', mode: 'slots', sourceLookId: null, coverRelPath: null, createdAt: 1, updatedAt: 1, deletedAt: null },
  items: [
    { id: 'i1', lookId: 'l1', garmentId: 'g-top', slot: 'top', x: 0.5, y: 0.3, scale: 0.5, rotation: 0, zIndex: 0, ord: 0 },
    { id: 'i2', lookId: 'l1', garmentId: 'g-old', slot: 'shoes', x: 0.5, y: 0.9, scale: 0.4, rotation: 0, zIndex: 1, ord: 0 },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetLookDetail.mockImplementation((id: unknown) => {
    if (id === 'l1') return Promise.resolve(DETAIL);
    return Promise.resolve(null);
  });
  mockQueryWardrobe.mockResolvedValue([wardrobeEntry('g-top', '白衬衫', 'top'), wardrobeEntry('g-top2', '米色针织', 'top')]);
  mockClone.mockResolvedValue({ look: { id: 'l-clone' }, items: [] });
  mockVariant.mockResolvedValue({ look: { id: 'l-variant' }, items: [] });
  mockDelete.mockResolvedValue(undefined);
  mockRebuildCover.mockResolvedValue(true);
});

describe('LookDetailView（LOK-05/06）', () => {
  it('显示名称、模式、件数与单品清单（槽位标识）', async () => {
    render(<LookDetailView lookId="l1" />);
    expect(await screen.findByText('通勤与晚餐')).toBeOnTheScreen();
    expect(screen.getByText(/快速槽位 · 2 件/)).toBeOnTheScreen();
    expect(screen.getByText('白衬衫')).toBeOnTheScreen();
    expect(screen.getByText(/上装/)).toBeOnTheScreen();
  });

  it('cover_rel_path 为空时后台触发封面重建', async () => {
    render(<LookDetailView lookId="l1" />);
    await waitFor(() => expect(mockRebuildCover).toHaveBeenCalledWith('l1'));
  });

  it('单品已归档/缺失：显示占位与「去修复」，点击跳衣物详情', async () => {
    render(<LookDetailView lookId="l1" />);
    expect(await screen.findByText(/该单品不可用/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: '去修复' }));
    expect(mockPush).toHaveBeenCalledWith('/garment/g-old');
  });

  it('变体关联：source_look_id 非空时显示「基于 <原名>」', async () => {
    const source: LookDetail = { look: { ...DETAIL.look, id: 'l0', name: '原版通勤' }, items: DETAIL.items };
    mockGetLookDetail.mockImplementation((id: unknown) => {
      if (id === 'l1') return Promise.resolve({ look: { ...DETAIL.look, sourceLookId: 'l0' }, items: DETAIL.items });
      if (id === 'l0') return Promise.resolve(source);
      return Promise.resolve(null);
    });
    render(<LookDetailView lookId="l1" />);
    expect(await screen.findByText('基于 原版通勤')).toBeOnTheScreen();
  });

  it('克隆：调用 cloneLookById 并跳到新造型，不改原造型', async () => {
    render(<LookDetailView lookId="l1" />);
    fireEvent.press(await screen.findByRole('button', { name: '克隆' }));
    await waitFor(() => expect(mockClone).toHaveBeenCalledWith('l1'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/look/l-clone'));
  });

  it('删除：软删并返回', async () => {
    render(<LookDetailView lookId="l1" />);
    fireEvent.press(await screen.findByRole('button', { name: '删除' }));
    fireEvent.press(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() => expect(mockDelete).toHaveBeenCalledWith('l1'));
    await waitFor(() => expect(mockBack).toHaveBeenCalled());
  });

  it('创建变体：选要替换的单品 → 选衣 → createVariantLook 保存并跳变体', async () => {
    render(<LookDetailView lookId="l1" />);
    fireEvent.press(await screen.findByRole('button', { name: '创建变体' }));
    fireEvent.press(screen.getAllByRole('button', { name: /替换/ })[0]!);
    // picker 打开（top 槽过滤），选一件新上装
    fireEvent.press(await screen.findByText('米色针织'));
    await waitFor(() =>
      expect(mockVariant).toHaveBeenCalledWith('l1', { garmentId: 'g-top', newGarmentId: 'g-top2' }),
    );
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/look/l-variant'));
  });

  it('造型不存在显示空态', async () => {
    render(<LookDetailView lookId="missing" />);
    expect(await screen.findByText(/造型不存在或已删除/)).toBeOnTheScreen();
  });
});
