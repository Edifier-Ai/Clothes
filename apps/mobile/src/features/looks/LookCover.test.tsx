import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { LookCover } from './LookCover';
import { render, waitFor } from '@testing-library/react-native';

// Skia 合成为平台外壳；记录 props 以断言实时渲染回退被触发。
const mockComposite = jest.fn((p?: unknown) => null);
jest.mock('./LookComposite', () => ({ LookComposite: (p: unknown) => mockComposite(p) }));

const mockExpoImage = jest.fn((p?: unknown) => null);
jest.mock('expo-image', () => ({ Image: (p: unknown) => mockExpoImage(p) }));

const mockGetInfo = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: (...args: unknown[]) => mockGetInfo(...args),
  documentDirectory: 'file:///doc/',
}));

const mockRebuildSpec = jest.fn<(...args: unknown[]) => Promise<unknown>>();
jest.mock('@/core/looks/lookService', () => ({
  rebuildCoverSpec: (...args: unknown[]) => mockRebuildSpec(...args),
}));


const SPEC = {
  lookId: 'l1',
  mode: 'slots',
  items: [{ imageRelPath: 'cutouts/a.png', x: 0.5, y: 0.5, scale: 0.4, rotation: 0 }],
};

beforeEach(() => {
  jest.clearAllMocks();
  mockRebuildSpec.mockResolvedValue(SPEC);
});

describe('LookCover（封面缓存优先，缺失实时渲染兜底）', () => {
  it('cover_rel_path 为空 → 实时合成渲染', async () => {
    render(<LookCover lookId="l1" coverRelPath={null} width={180} height={180} />);
    await waitFor(() => expect(mockRebuildSpec).toHaveBeenCalledWith('l1'));
    await waitFor(() => expect(mockComposite).toHaveBeenCalled());
    // 3:4 规范画布嵌入 180×180 卡片框：宽受限 → 135×180（裁切修复，不形变不裁切）
    expect(mockComposite.mock.calls[0]![0]).toMatchObject({ items: SPEC.items, width: 135, height: 180 });
    expect(mockExpoImage).not.toHaveBeenCalled();
  });

  it('缓存文件存在 → 直接显示缓存 PNG，不触发合成', async () => {
    mockGetInfo.mockResolvedValue({ exists: true });
    render(<LookCover lookId="l1" coverRelPath="covers/l1.png" width={180} height={180} />);
    await waitFor(() => expect(mockExpoImage).toHaveBeenCalled());
    expect(mockRebuildSpec).not.toHaveBeenCalled();
    expect(mockComposite).not.toHaveBeenCalled();
  });

  it('缓存 PNG 已删 → 回退实时合成，不崩', async () => {
    mockGetInfo.mockResolvedValue({ exists: false });
    render(<LookCover lookId="l1" coverRelPath="covers/l1.png" width={180} height={180} />);
    await waitFor(() => expect(mockComposite).toHaveBeenCalled());
    expect(mockExpoImage).not.toHaveBeenCalled();
  });

  it('文件检查抛错 → 同样回退实时合成', async () => {
    mockGetInfo.mockRejectedValue(new Error('fs unavailable'));
    render(<LookCover lookId="l1" coverRelPath="covers/l1.png" width={180} height={180} />);
    await waitFor(() => expect(mockComposite).toHaveBeenCalled());
  });
});
