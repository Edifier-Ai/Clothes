/**
 * 批量导入页（batch-import.tsx）组件测试：
 * 默认本地抠图，无需配置即可入队；腾讯云为可选：展开配置 → 上传告知 → 同意后切到云端；
 * 「仅导入原图」不抠图；队列状态文案区分 断网待重试/失败可重试，遗留任务挂载即续跑。
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
const mockListAll = jest.fn(async (..._args: unknown[]) => []);
const mockCancel = jest.fn(async (..._args: unknown[]) => undefined);
const mockRouterPush = jest.fn((..._args: unknown[]) => undefined);
const mockRequestCameraPermission = jest.fn(async (..._args: unknown[]) => ({ granted: true }));
const mockLaunchCamera = jest.fn(async (..._args: unknown[]) => ({ canceled: true, assets: null }));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: (...args: unknown[]) => mockRouterPush(...args) }),
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  requestCameraPermissionsAsync: (...args: unknown[]) => mockRequestCameraPermission(...args),
  launchCameraAsync: (...args: unknown[]) => mockLaunchCamera(...args),
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
  rootAbs: () => '/documents/clothes',
}));

jest.mock('@/core/db/expoDb', () => ({
  openAppDb: jest.fn(async () => ({ db: {}, drizzleDb: {} })),
}));

jest.mock('@/core/db/queue', () => ({
  listAll: (...args: unknown[]) => mockListAll(...args),
  cancel: (...args: unknown[]) => mockCancel(...args),
  clearSourceStaged: jest.fn(async () => undefined),
}));

jest.mock('@/core/garments/mirror', () => ({
  writeMirror: jest.fn(async () => undefined),
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
  mockListAll.mockResolvedValue([]);
  mockRequestCameraPermission.mockResolvedValue({ granted: true });
  mockLaunchCamera.mockResolvedValue({ canceled: true, assets: null });
});

async function renderLoaded() {
  render(<BatchImportScreen />);
  await waitFor(() => expect(screen.getByText('批量导入')).toBeOnTheScreen());
}

const PICK_ONE = {
  canceled: false,
  assets: [{ uri: 'file:///a.jpg', mimeType: 'image/jpeg' }],
} as ImagePicker.ImagePickerResult;

async function openCloudSetup() {
  await renderLoaded();
  fireEvent.press(await screen.findByRole('button', { name: '使用腾讯云高质量抠图（可选）' }));
}

describe('batch-import：默认本地抠图（未配置云端）', () => {
  it('不需要任何配置即可选图：显示本地模式，云端配置默认收起', async () => {
    await renderLoaded();
    expect(screen.getByText('抠图方式：手机本地（照片不上传）')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '从相册批量选择' })).toBeEnabled();
    expect(screen.queryByPlaceholderText('secretId')).toBeNull();
    expect(screen.queryByText('上传告知')).toBeNull();
  });

  it('选图 → 入队并开始本地处理', async () => {
    launchPicker.mockResolvedValue(PICK_ONE);
    await renderLoaded();
    fireEvent.press(screen.getByRole('button', { name: '从相册批量选择' }));
    await waitFor(() => expect(mockEnqueueBatch).toHaveBeenCalledTimes(1));
    expect(mockEnqueueBatch).toHaveBeenCalledWith(expect.anything(), [{ uri: 'file:///a.jpg', ext: 'jpg' }]);
    expect(mockStartProcessing).toHaveBeenCalled();
    expect(await hasUploadConsent()).toBe(false);
  });

  it('「仅导入原图（不抠图）」→ addOriginalOnly 入库，不入队不抠图', async () => {
    launchPicker.mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'file:///a.jpg', mimeType: 'image/jpeg' },
        { uri: 'file:///b.png', mimeType: 'image/png' },
      ],
    } as ImagePicker.ImagePickerResult);
    await renderLoaded();
    fireEvent.press(screen.getByRole('button', { name: '仅导入原图（不抠图）' }));
    await waitFor(() => expect(mockAddOriginalOnly).toHaveBeenCalledTimes(2));
    expect(mockEnqueueBatch).not.toHaveBeenCalled();
    expect(mockStartProcessing).not.toHaveBeenCalled();
  });

  it('遗留 pending 任务挂载即自动续跑（本地模式不再等配置）', async () => {
    mockGetSnapshot.mockResolvedValue({ ...SNAP_ZERO, pending: 2, total: 2 });
    await renderLoaded();
    await waitFor(() => expect(mockStartProcessing).toHaveBeenCalledTimes(1));
  });

  it('展开可选云端配置：4 输入框 + CAM 提示 + 保存按钮', async () => {
    await openCloudSetup();
    expect(screen.getByText('配置腾讯云抠图（可选）')).toBeOnTheScreen();
    expect(screen.getByText(/CAM 子账号密钥/)).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('secretId')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('secretKey')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('bucket（BucketName-APPID）')).toBeOnTheScreen();
    expect(screen.getByPlaceholderText('region（如 ap-guangzhou）')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '保存配置' })).toBeOnTheScreen();
  });

  it('字段不全时保存 → 明确缺项提示，不落库', async () => {
    await openCloudSetup();
    fireEvent.changeText(screen.getByPlaceholderText('secretId'), 'AKIDTEST');
    fireEvent.press(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(screen.getByText(/请填写完整/)).toBeOnTheScreen());
    expect(screen.getByText(/secretKey/)).toBeOnTheScreen();
    expect(store.has('tencent-ci-config')).toBe(false);
  });

  it('填全保存 → 写入 SecureStore，随后显示上传告知区块', async () => {
    await openCloudSetup();
    fireEvent.changeText(screen.getByPlaceholderText('secretId'), CONFIG.secretId);
    fireEvent.changeText(screen.getByPlaceholderText('secretKey'), CONFIG.secretKey);
    fireEvent.changeText(screen.getByPlaceholderText('bucket（BucketName-APPID）'), CONFIG.bucket);
    fireEvent.changeText(screen.getByPlaceholderText('region（如 ap-guangzhou）'), CONFIG.region);
    fireEvent.press(screen.getByRole('button', { name: '保存配置' }));
    await waitFor(() => expect(screen.getByText('上传告知')).toBeOnTheScreen());
    expect(JSON.parse(store.get('tencent-ci-config')!)).toEqual(CONFIG);
    expect(screen.getByText(/上传至腾讯云数据万象/)).toBeOnTheScreen();
    expect(screen.getAllByText(/App 在处理完成后请求删除 COS 暂存对象/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/云服务处理受腾讯条款约束/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '同意并使用云端抠图' })).toBeOnTheScreen();
  });

  it('首屏不请求相机权限，只有用户点击拍摄后才请求', async () => {
    await renderLoaded();
    expect(mockRequestCameraPermission).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: '拍一件' }));
    await waitFor(() => expect(mockRequestCameraPermission).toHaveBeenCalledTimes(1));
    expect(mockLaunchCamera).toHaveBeenCalledTimes(1);
  });
});

describe('batch-import：已配置云端但未同意', () => {
  beforeEach(async () => {
    await saveTencentCiConfig(CONFIG);
  });

  it('显示告知区块，但选图仍可用且走本地抠图', async () => {
    launchPicker.mockResolvedValue(PICK_ONE);
    await renderLoaded();
    await waitFor(() => expect(screen.getByText('上传告知')).toBeOnTheScreen());
    expect(screen.getByText('抠图方式：手机本地（照片不上传）')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: '从相册批量选择' }));
    await waitFor(() => expect(mockEnqueueBatch).toHaveBeenCalledTimes(1));
    expect(await hasUploadConsent()).toBe(false);
  });

  it('「同意并使用云端抠图」→ consent 持久化，模式切到云端', async () => {
    await renderLoaded();
    fireEvent.press(await screen.findByRole('button', { name: '同意并使用云端抠图' }));
    await waitFor(() => expect(screen.getByText('抠图方式：腾讯云高质量（照片会上传处理）')).toBeOnTheScreen());
    expect(await hasUploadConsent()).toBe(true);
    expect(screen.queryByText('上传告知')).toBeNull();
  });

  it('「继续用本地抠图」→ 收起告知，不授权上传', async () => {
    await renderLoaded();
    fireEvent.press(await screen.findByRole('button', { name: '继续用本地抠图' }));
    await waitFor(() => expect(screen.queryByText('上传告知')).toBeNull());
    expect(await hasUploadConsent()).toBe(false);
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
    await waitFor(() => expect(screen.getByText(/待审核 12/)).toBeOnTheScreen());
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
