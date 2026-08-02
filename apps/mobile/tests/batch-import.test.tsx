/**
 * 批量导入页（batch-import.tsx）组件测试：
 * 未配置 → 配置表单；已配置未同意 → 上传告知，「同意并继续」后才入队；
 * 拒绝上传 → 原图入库；齐全 → 队列流；队列状态文案区分 待配置/断网待重试/失败可重试。
 *
 * expo-secure-store 由 jest.setup.js 全局 mock（内存 Map）→ apiConfig 走真实逻辑；
 * cutoutService / expoDb / expo-image-picker 在本文件 mock。
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import * as SecureStore from 'expo-secure-store';

import BatchImportScreen from '../src/app/batch-import';
import { grantUploadConsent, hasUploadConsent, saveTencentCiConfig } from '@/core/cutout/apiConfig';
import type { QueueSnapshot } from '@/core/cutout/processor';

const SNAP_ZERO: QueueSnapshot = { pending: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0, total: 0 };

const mockEnqueueBatch = jest.fn(async (..._args: unknown[]) => ({ garmentIds: ['g1'], jobIds: ['j1'] }));
const mockAddOriginalOnly = jest.fn(async (..._args: unknown[]) => 'g1');
const mockGetSnapshot = jest.fn(async () => SNAP_ZERO);
const mockCountNetworkPending = jest.fn(async () => 0);
const mockStartProcessing = jest.fn(async () => 0);
const mockRetryFailed = jest.fn(async () => 0);

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
}));

jest.mock('@/core/cutout/cutoutService', () => ({
  enqueueBatch: (...args: unknown[]) => mockEnqueueBatch(...args),
  addOriginalOnly: (...args: unknown[]) => mockAddOriginalOnly(...args),
  ensureDirs: async () => {},
  restoreOnBoot: async () => false,
  getSnapshot: () => mockGetSnapshot(),
  countNetworkPending: () => mockCountNetworkPending(),
  startProcessing: () => mockStartProcessing(),
  retryFailed: () => mockRetryFailed(),
}));

jest.mock('@/core/db/expoDb', () => ({
  openAppDb: jest.fn(async () => ({})),
}));

const CONFIG = {
  secretId: 'AKIDTEST',
  secretKey: 'SECRETKEY',
  bucket: 'mybucket-1250000000',
  region: 'ap-guangzhou',
};

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;
const launchPicker = jest.mocked(ImagePicker.launchImageLibraryAsync);

beforeEach(() => {
  store.clear();
  jest.clearAllMocks();
  launchPicker.mockResolvedValue({ canceled: true, assets: null });
  mockGetSnapshot.mockResolvedValue(SNAP_ZERO);
  mockCountNetworkPending.mockResolvedValue(0);
});

async function renderLoaded() {
  render(<BatchImportScreen />);
  await waitFor(() => expect(screen.getByText('批量导入')).toBeOnTheScreen());
}

describe('batch-import：未配置抠图服务', () => {
  it('显示配置表单（4 输入框 + 保存按钮），不显示告知区块', async () => {
    await renderLoaded();
    expect(screen.getByText('配置抠图服务')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('secretId')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('secretKey')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('bucket（BucketName-APPID）')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('region（如 ap-guangzhou）')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '保存配置' })).toBeOnTheScreen();
    expect(screen.queryByText('上传告知')).toBeNull();
  });

  it('字段不全时保存 → 明确缺项提示，不落库', async () => {
    await renderLoaded();
    fireEvent.changeText(screen.getByPlaceholderText('secretId'), 'AKIDTEST');
    fireEvent.press(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(screen.getByText(/请填写完整/)).toBeOnTheScreen());
    expect(screen.getByText(/secretKey/)).toBeOnTheScreen();
    expect(store.has('tencent-ci-config')).toBe(false);
  });

  it('填全保存 → 写入 SecureStore，随后显示上传告知区块', async () => {
    await renderLoaded();
    fireEvent.changeText(screen.getByPlaceholderText('secretId'), CONFIG.secretId);
    fireEvent.changeText(screen.getByPlaceholderText('secretKey'), CONFIG.secretKey);
    fireEvent.changeText(screen.getByPlaceholderText('bucket（BucketName-APPID）'), CONFIG.bucket);
    fireEvent.changeText(screen.getByPlaceholderText('region（如 ap-guangzhou）'), CONFIG.region);
    fireEvent.press(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(screen.getByText('上传告知')).toBeOnTheScreen());
    expect(JSON.parse(store.get('tencent-ci-config')!)).toEqual(CONFIG);
    expect(screen.getByText(/上传至腾讯云数据万象/)).toBeOnTheScreen();
    expect(screen.getByText(/处理后即删除云端文件/)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '同意并继续' })).toBeOnTheScreen();
  });

  it('有待处理任务时显示「待配置」文案', async () => {
    mockGetSnapshot.mockResolvedValue({ ...SNAP_ZERO, pending: 2, total: 2 });
    await renderLoaded();
    await waitFor(() => expect(screen.getByText(/待配置/)).toBeOnTheScreen());
  });
});

describe('batch-import：已配置未同意', () => {
  beforeEach(async () => {
    await saveTencentCiConfig(CONFIG);
  });

  it('显示告知区块；「从相册批量选择」不可用（不入队、不开相册）', async () => {
    await renderLoaded();
    await waitFor(() => expect(screen.getByText('上传告知')).toBeOnTheScreen());
    const pickBtn = screen.getByRole('button', { name: '从相册批量选择' });
    expect(pickBtn).toBeDisabled();
    fireEvent.press(pickBtn);
    expect(launchPicker).not.toHaveBeenCalled();
    expect(mockEnqueueBatch).not.toHaveBeenCalled();
  });

  it('「同意并继续」→ consent 持久化，随后选图入队并开始处理', async () => {
    launchPicker.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///a.jpg', mimeType: 'image/jpeg' }],
    } as ImagePicker.ImagePickerResult);
    await renderLoaded();
    await waitFor(() => expect(screen.getByRole('button', { name: '同意并继续' })).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '同意并继续' }));
    await waitFor(() => expect(mockEnqueueBatch).toHaveBeenCalledTimes(1));
    expect(await hasUploadConsent()).toBe(true);
    expect(launchPicker).toHaveBeenCalledTimes(1);
    expect(mockEnqueueBatch).toHaveBeenCalledWith(expect.anything(), [{ uri: 'file:///a.jpg', ext: 'jpg' }]);
    expect(mockStartProcessing).toHaveBeenCalled();
  });

  it('「暂不上传，仅原图入库」→ addOriginalOnly 入库，不入队不抠图', async () => {
    launchPicker.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', mimeType: 'image/jpeg' },
        { uri: 'file:///b.png', mimeType: 'image/png' },
      ],
    } as ImagePicker.ImagePickerResult);
    await renderLoaded();
    await waitFor(() => expect(screen.getByRole('button', { name: '暂不上传，仅原图入库' })).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '暂不上传，仅原图入库' }));
    await waitFor(() => expect(mockAddOriginalOnly).toHaveBeenCalledTimes(2));
    expect(mockEnqueueBatch).not.toHaveBeenCalled();
    expect(mockStartProcessing).not.toHaveBeenCalled();
    expect(await hasUploadConsent()).toBe(false);
  });

  it('有待处理任务时显示「待同意」文案', async () => {
    mockGetSnapshot.mockResolvedValue({ ...SNAP_ZERO, pending: 3, total: 3 });
    await renderLoaded();
    await waitFor(() => expect(screen.getByText(/待同意/)).toBeOnTheScreen());
  });
});

describe('batch-import：已配置已同意', () => {
  beforeEach(async () => {
    await saveTencentCiConfig(CONFIG);
    await grantUploadConsent();
  });

  it('不显示表单与告知；选图后入队并处理', async () => {
    launchPicker.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///c.jpg', mimeType: 'image/jpeg' }],
    } as ImagePicker.ImagePickerResult);
    await renderLoaded();
    expect(screen.queryByText('配置抠图服务')).toBeNull();
    expect(screen.queryByText('上传告知')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: '从相册批量选择' }));
    await waitFor(() => expect(mockEnqueueBatch).toHaveBeenCalledTimes(1));
    expect(mockStartProcessing).toHaveBeenCalled();
  });

  it('断网待重试文案 + 「继续处理」按钮触发续跑', async () => {
    mockGetSnapshot.mockResolvedValue({ ...SNAP_ZERO, pending: 2, total: 2 });
    mockCountNetworkPending.mockResolvedValue(2);
    await renderLoaded();
    await waitFor(() => expect(screen.getByText(/断网待重试/)).toBeOnTheScreen());
    // 挂载时检测到 pending 遗留已自动续跑 1 次；按钮再手动触发 1 次
    await waitFor(() => expect(mockStartProcessing).toHaveBeenCalledTimes(1));
    fireEvent.press(screen.getByRole('button', { name: '继续处理' }));
    await waitFor(() => expect(mockStartProcessing).toHaveBeenCalledTimes(2));
  });

  it('杀进程中断恢复：挂载即自动续跑遗留 pending/running，且显示「继续处理」兜底按钮', async () => {
    mockGetSnapshot.mockResolvedValue({ ...SNAP_ZERO, pending: 6, running: 1, succeeded: 5, total: 12 });
    await renderLoaded();
    await waitFor(() => expect(mockStartProcessing).toHaveBeenCalledTimes(1));
    // 自动续跑完成后（mock 快照不变）仍可用按钮再次手动续跑
    await waitFor(() => expect(screen.getByRole('button', { name: '继续处理' })).toBeOnTheScreen());
  });

  it('队列全部完成（无 pending/running）时不自动续跑', async () => {
    mockGetSnapshot.mockResolvedValue({ ...SNAP_ZERO, succeeded: 12, total: 12 });
    await renderLoaded();
    await waitFor(() => expect(screen.getByText(/成功 succeeded: 12/)).toBeOnTheScreen());
    expect(mockStartProcessing).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: '继续处理' })).toBeNull();
  });

  it('失败可重试文案 + 「重试失败项」按钮触发 retryFailed', async () => {
    mockGetSnapshot.mockResolvedValue({ ...SNAP_ZERO, failed: 1, total: 1 });
    await renderLoaded();
    await waitFor(() => expect(screen.getByText(/失败可重试：/)).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '重试失败项' }));
    await waitFor(() => expect(mockRetryFailed).toHaveBeenCalledTimes(1));
  });
});
