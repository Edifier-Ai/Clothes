import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { LookDetail } from '@/core/db/dao';
import { SlotsEditor } from './SlotsEditor';
import type { PickCandidate } from './pickFilter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

/**
 * MVP-008 缺陷 1 回归：槽位网格 + 页脚在 360×800 上已占满屏幕，
 * 内嵌选衣面板被挤出屏外不可达。修复后 GarmentPicker 必须是覆盖式
 * Modal（不参与父布局、不被挤出），任何屏幕高度下选衣完整可用。
 */

jest.mock('expo-image', () => ({ Image: () => null }));

const mockSaveLook = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockLoadDraft = jest.fn<() => Promise<unknown>>();
const mockSaveDraft = jest.fn<(...args: unknown[]) => Promise<unknown>>();
const mockClearDraft = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/core/looks/lookService', () => ({
  saveLook: (...args: unknown[]) => mockSaveLook(...args),
  loadDraft: () => mockLoadDraft(),
  saveDraft: (...args: unknown[]) => mockSaveDraft(...args),
  clearDraft: () => mockClearDraft(),
}));

const POOL: PickCandidate[] = [
  { id: 'g-top', name: '白衬衫', category: 'top', status: 'clean', archivedAt: null, brand: null, note: null, imageRelPath: null },
];

function setup() {
  const onSaved = jest.fn<(detail: LookDetail) => void>();
  render(<SlotsEditor candidates={POOL} onSaved={onSaved} />);
  return { onSaved };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadDraft.mockResolvedValue(null);
  mockSaveDraft.mockResolvedValue(undefined);
  mockClearDraft.mockResolvedValue(undefined);
});

describe('SlotsEditor 选衣面板覆盖层（LOK-02/04 缺陷 1 回归）', () => {
  it('点槽位后选衣面板以 Modal 覆盖层出现，不被网格+页脚挤出布局', async () => {
    setup();
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalled());
    fireEvent.press(screen.getByRole('button', { name: /选择上装/ }));
    // Modal 覆盖层与内容同时可见：不参与父布局，任何屏幕高度可达
    expect(await screen.findByTestId('garment-picker-modal')).toBeOnTheScreen();
    expect(screen.getByTestId('garment-picker-sheet')).toBeOnTheScreen();
    expect(screen.getByText('白衬衫')).toBeOnTheScreen();
    // 网格与保存按钮仍在（未被顶出屏幕）
    expect(screen.getByRole('button', { name: '保存造型' })).toBeOnTheScreen();
  });

  it('覆盖层可经「完成」关闭', async () => {
    setup();
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalled());
    fireEvent.press(screen.getByRole('button', { name: /选择上装/ }));
    fireEvent.press(await screen.findByRole('button', { name: '完成' }));
    expect(screen.queryByTestId('garment-picker-modal')).toBeNull();
  });
});
