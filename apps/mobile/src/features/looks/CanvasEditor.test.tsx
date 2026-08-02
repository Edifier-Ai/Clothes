import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import type { LookDetail } from '@/core/db/dao';
import { CanvasEditor } from './CanvasEditor';
import type { PickCandidate } from './pickFilter';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

jest.mock('expo-image', () => ({ Image: () => null }));

// Skia 画布为平台外壳（JSI 原生），host 测试以空替身替换；渲染/手势真机验收。
jest.mock('./LookComposite', () => ({ LookComposite: () => null }));

// gesture-handler 链式 API 在 host 无原生层；mock 成 no-op 链（外壳，非被测核心）。
jest.mock('react-native-gesture-handler', () => {
  const chain = () => {
    const self: Record<string, unknown> = {};
    for (const m of ['runOnJS', 'onBegin', 'onUpdate', 'onEnd', 'onFinalize', 'onStart', 'minDistance', 'maxDistance', 'minPointers', 'maxPointers', 'enabled', 'numberOfTaps']) {
      self[m] = () => self;
    }
    return self;
  };
  return {
    GestureDetector: ({ children }: { children: React.ReactNode }) => children,
    Gesture: { Tap: chain, Pan: chain, Pinch: chain, Rotation: chain, Simultaneous: () => ({}), Race: () => ({}) },
  };
});

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
  { id: 'g-shoes', name: '乐福鞋', category: 'shoes', status: 'clean', archivedAt: null, brand: null, note: null, imageRelPath: null },
];

const SAVED_DETAIL = {
  look: { id: 'look-c1', name: '未命名造型', mode: 'canvas', sourceLookId: null, coverRelPath: null, createdAt: 1, updatedAt: 1, deletedAt: null },
  items: [],
};

function setup() {
  const onSaved = jest.fn<(detail: LookDetail) => void>();
  render(<CanvasEditor candidates={POOL} onSaved={onSaved} />);
  return { onSaved };
}

async function addGarment(name: string) {
  fireEvent.press(screen.getByRole('button', { name: /添加单品/ }));
  await screen.findByText(name);
  fireEvent.press(screen.getByText(name));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockLoadDraft.mockResolvedValue(null);
  mockSaveDraft.mockResolvedValue(undefined);
  mockClearDraft.mockResolvedValue(undefined);
  mockSaveLook.mockResolvedValue(SAVED_DETAIL);
});

describe('CanvasEditor（LOK-03 自由画布）', () => {
  it('明示不自动判定可穿；初始撤销/重做禁用', async () => {
    setup();
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalled());
    expect(screen.getByText(/自由画布不自动判定可穿/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '撤销' }).props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: '重做' }).props.accessibilityState.disabled).toBe(true);
  });

  it('空画布保存禁用；加入单品后可用并保存 mode=canvas、slot=null', async () => {
    const { onSaved } = setup();
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: '保存造型' }).props.accessibilityState.disabled).toBe(true);

    await addGarment('白衬衫');
    await addGarment('乐福鞋');
    expect(screen.getByRole('button', { name: '保存造型' }).props.accessibilityState.disabled).toBe(false);

    fireEvent.press(screen.getByRole('button', { name: '保存造型' }));
    await waitFor(() => expect(mockSaveLook).toHaveBeenCalledTimes(1));
    const input = mockSaveLook.mock.calls[0]![0] as { mode: string; items: { garmentId: string; slot: string | null }[] };
    expect(input.mode).toBe('canvas');
    expect(input.items).toHaveLength(2);
    for (const it of input.items) expect(it.slot).toBeNull();
    expect(mockClearDraft).toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(SAVED_DETAIL));
  });

  it('加入单品后撤销可用：撤销移除、重做恢复', async () => {
    setup();
    await waitFor(() => expect(mockLoadDraft).toHaveBeenCalled());
    await addGarment('白衬衫');

    const undoBtn = () => screen.getByRole('button', { name: '撤销' });
    const redoBtn = () => screen.getByRole('button', { name: '重做' });
    expect(undoBtn().props.accessibilityState.disabled).toBe(false);

    fireEvent.press(undoBtn());
    expect(undoBtn().props.accessibilityState.disabled).toBe(true);
    expect(redoBtn().props.accessibilityState.disabled).toBe(false);
    // 撤销后回到空画布，保存禁用
    expect(screen.getByRole('button', { name: '保存造型' }).props.accessibilityState.disabled).toBe(true);

    fireEvent.press(redoBtn());
    expect(redoBtn().props.accessibilityState.disabled).toBe(true);
    expect(screen.getByRole('button', { name: '保存造型' }).props.accessibilityState.disabled).toBe(false);
  });

  it('有草稿时提示恢复，恢复后画布有内容可保存', async () => {
    mockLoadDraft.mockResolvedValue({
      mode: 'canvas',
      name: '画布草稿',
      updatedAt: 1,
      items: [
        { id: 'it-1', garmentId: 'g-top', slot: null, x: 0.5, y: 0.5, scale: 0.4, rotation: 0, zIndex: 0, ord: 0 },
      ],
    });
    setup();
    fireEvent.press(await screen.findByRole('button', { name: '恢复' }));
    expect(screen.getByDisplayValue('画布草稿')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '保存造型' }).props.accessibilityState.disabled).toBe(false);
  });
});
