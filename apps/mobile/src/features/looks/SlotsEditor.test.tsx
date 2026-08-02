import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { LookDetail } from '@/core/db/dao';
import { SlotsEditor } from './SlotsEditor';
import type { PickCandidate } from './pickFilter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-image', () => ({ Image: () => null }));

const mockSaveLook = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLoadDraft = jest.fn<() => Promise<unknown>>();
const mockSaveDraft = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockClearDraft = jest.fn<() => Promise<unknown>>();
jest.mock('@/core/looks/lookService', () => ({
  saveLook: (...args: unknown[]) => mockSaveLook(...args),
  loadDraft: () => mockLoadDraft(),
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
  clearDraft: () => mockClearDraft(),
}));


const POOL: PickCandidate[] = [
  { id: 'g-top', name: '白衬衫', category: 'top', status: 'clean', archivedAt: null, brand: null, note: null, imageRelPath: null },
  { id: 'g-bottom', name: '黑色半裙', category: 'bottom', status: 'clean', archivedAt: null, brand: null, note: null, imageRelPath: null },
  { id: 'g-shoes', name: '乐福鞋', category: 'shoes', status: 'clean', archivedAt: null, brand: null, note: null, imageRelPath: null },
  { id: 'g-dress', name: '茶歇裙', category: 'dress', status: 'clean', archivedAt: null, brand: null, note: null, imageRelPath: null },
];

const SAVED_DETAIL = {
  look: {
    id: 'look-1', name: '未命名造型', mode: 'slots', sourceLookId: null, coverRelPath: null,
    createdAt: 1, updatedAt: 1, deletedAt: null,
  },
  items: [],
};

function setup() {
  const onSaved = jest.fn<(detail: LookDetail) => void>();
  render(<SlotsEditor candidates={POOL} onSaved={onSaved} />);
  return { onSaved };
}

/** 通过槽位 → picker 点选一件衣物。 */
async function pickViaSlot(slotName: string, garmentName: string) {
  fireEvent.press(screen.getByRole('button', { name: new RegExp(slotName) }));
  await screen.findByText(garmentName);
  fireEvent.press(screen.getByText(garmentName));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadDraft.mockResolvedValue(null);
  mockSaveDraft.mockResolvedValue(undefined);
  mockClearDraft.mockResolvedValue(undefined);
  mockSaveLook.mockResolvedValue(SAVED_DETAIL);
});

describe('SlotsEditor（LOK-02 快速槽位）', () => {
  it('初始保存禁用并说明缺上装、下装、鞋', async () => {
    setup();
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalled());
    const btn = screen.getByRole('button', { name: '保存造型' });
    expect(btn.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/还缺：上装、下装、鞋/)).toBeOnTheScreen();
  });

  it('填满 top+bottom+shoes 后保存可用，保存调 mockSaveLook(mode=slots)', async () => {
    const { onSaved } = setup();
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalled());
    await pickViaSlot('选择上装', '白衬衫');
    await pickViaSlot('选择下装', '黑色半裙');
    await pickViaSlot('选择鞋', '乐福鞋');

    const btn = screen.getByRole('button', { name: '保存造型' });
    expect(btn.props.accessibilityState.disabled).toBe(false);
    fireEvent.press(btn);

    await waitFor(() => expect(mockSaveLook).toHaveBeenCalledTimes(1));
    const input = mockSaveLook.mock.calls[0]![0] as {
      mode: string;
      items: { garmentId: string; slot: string; x: number; zIndex: number }[];
    };
    expect(input.mode).toBe('slots');
    expect(input.items).toHaveLength(3);
    expect(input.items.map((i) => [i.slot, i.garmentId])).toEqual([
      ['top', 'g-top'],
      ['bottom', 'g-bottom'],
      ['shoes', 'g-shoes'],
    ]);
    // 每件都带归一化几何与层级
    for (const it of input.items) {
      expect(it.x).toBeGreaterThanOrEqual(0);
      expect(it.x).toBeLessThanOrEqual(1);
      expect(typeof it.zIndex).toBe('number');
    }
    expect(mockClearDraft).toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED_DETAIL));
  });

  it('缺鞋时保存禁用并说明', async () => {
    setup();
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalled());
    await pickViaSlot('选择上装', '白衬衫');
    await pickViaSlot('选择下装', '黑色半裙');
    const btn = screen.getByRole('button', { name: '保存造型' });
    expect(btn.props.accessibilityState.disabled).toBe(true);
    expect(screen.getByText(/还缺：鞋/)).toBeOnTheScreen();
  });

  it('dress+shoes 也是合法组合', async () => {
    setup();
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalled());
    await pickViaSlot('选择连衣裙', '茶歇裙');
    await pickViaSlot('选择鞋', '乐福鞋');
    expect(screen.getByRole('button', { name: '保存造型' }).props.accessibilityState.disabled).toBe(false);
  });

  it('dress 与 top 同选时提示互斥并禁保存', async () => {
    setup();
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalled());
    await pickViaSlot('选择连衣裙', '茶歇裙');
    await pickViaSlot('选择上装', '白衬衫');
    await pickViaSlot('选择鞋', '乐福鞋');
    expect(screen.getByText(/连衣裙与上装互斥/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '保存造型' }).props.accessibilityState.disabled).toBe(true);
  });

  it('有草稿时提示恢复；恢复后槽位回填', async () => {
    mockLoadDraft.mockResolvedValue({
      mode: 'slots',
      name: '通勤草稿',
      updatedAt: 1,
      items: [
        { id: 'slot-top', garmentId: 'g-top', slot: 'top', x: 0.5, y: 0.28, scale: 0.5, rotation: 0, zIndex: 0, ord: 0 },
        { id: 'slot-shoes', garmentId: 'g-shoes', slot: 'shoes', x: 0.5, y: 0.88, scale: 0.38, rotation: 0, zIndex: 3, ord: 0 },
      ],
    });
    setup();
    expect(await screen.findByText(/恢复上次未保存的造型？/)).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: '恢复' }));
    // 回填：已选名称出现在槽位卡片上，名称输入恢复
    expect(screen.getAllByText('白衬衫').length).toBeGreaterThan(0);
    expect(screen.getAllByText('乐福鞋').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('通勤草稿')).toBeOnTheScreen();
  });

  it('放弃草稿会清除草稿且不恢复', async () => {
    mockLoadDraft.mockResolvedValue({
      mode: 'slots',
      name: '旧草稿',
      updatedAt: 1,
      items: [
        { id: 'slot-top', garmentId: 'g-top', slot: 'top', x: 0.5, y: 0.28, scale: 0.5, rotation: 0, zIndex: 0, ord: 0 },
      ],
    });
    setup();
    fireEvent.press(await screen.findByRole('button', { name: '放弃' }));
    expect(mockClearDraft).toHaveBeenCalled();
    expect(screen.queryByText(/恢复上次未保存的造型？/)).toBeNull();
    expect(screen.queryByText('白衬衫')).toBeNull();
  });
});
