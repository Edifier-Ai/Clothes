import { beforeEach, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import OnboardingScreen from '../src/app/onboarding';
import type { OnboardState } from '../src/core/onboarding';

const mockReplace = jest.fn((..._args: unknown[]) => {});
const mockLoadOnboardState = jest.fn(
  async (..._args: unknown[]): Promise<OnboardState> => ({
    step: 'welcome',
    completed: false,
    goals: [],
    quotaStarted: false,
  }),
);
const mockSaveOnboardState = jest.fn(async (..._args: unknown[]): Promise<void> => {});
type ListedGarment = { garment: { id: string; category: string; name: string }; imageRelPath: string | null };
const mockListActiveGarments = jest.fn(async (..._args: unknown[]): Promise<ListedGarment[]> => []);
const mockEnqueueBatch = jest.fn(async (..._args: unknown[]) => ({ garmentIds: [] as string[], jobIds: [] as string[] }));
const mockStartProcessing = jest.fn(async (..._args: unknown[]) => ({ processed: 0, blockedReason: null as string | null }));
const mockRequestPermission = jest.fn(async (..._args: unknown[]) => ({ granted: true }));
const mockLaunchPicker = jest.fn(async (..._args: unknown[]): Promise<unknown> => ({ canceled: true, assets: null }));

function listed(id: string, category: string, name: string, imageRelPath: string | null = `thumbnails/${id}.png`): ListedGarment {
  return { garment: { id, category, name }, imageRelPath };
}
const mockLoadDemo = jest.fn(async () => ({
  anchorDate: '2026-08-28', garments: 12, looks: 3, plans: 3, wearDays: 8, shoppingCases: 1,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: (...args: unknown[]) => mockReplace(...args) }),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: (...args: unknown[]) => mockRequestPermission(...args),
  launchImageLibraryAsync: (...args: unknown[]) => mockLaunchPicker(...args),
}));

jest.mock('@/core/db/expoDb', () => ({
  openAppDb: jest.fn(async () => ({ db: {}, drizzleDb: {} })),
}));

jest.mock('@/core/db/dao', () => ({
  listActiveGarmentsWithThumbs: (...args: unknown[]) => mockListActiveGarments(...args),
}));

jest.mock('@/core/cutout/cutoutService', () => ({
  enqueueBatch: (...args: unknown[]) => mockEnqueueBatch(...args),
  ensureDirs: jest.fn(async () => undefined),
  startProcessing: (...args: unknown[]) => mockStartProcessing(...args),
}));

jest.mock('@/core/demo/demoDataService', () => ({
  defaultDemoDataService: { load: () => mockLoadDemo() },
}));

jest.mock('@/core/onboarding', () => {
  const actual = jest.requireActual('../src/core/onboarding') as typeof import('../src/core/onboarding');
  return {
    ...actual,
    loadOnboardState: (...args: unknown[]) => mockLoadOnboardState(...args),
    saveOnboardState: (...args: unknown[]) => mockSaveOnboardState(...args),
  };
});

function stateAt(step: OnboardState['step']): OnboardState {
  return { step, completed: false, goals: [], quotaStarted: step === 'quota' };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListActiveGarments.mockResolvedValue([]);
  mockSaveOnboardState.mockResolvedValue(undefined);
  mockRequestPermission.mockResolvedValue({ granted: true });
  mockLaunchPicker.mockResolvedValue({ canceled: true, assets: null });
  mockEnqueueBatch.mockResolvedValue({ garmentIds: [], jobIds: [] });
  mockStartProcessing.mockResolvedValue({ processed: 0, blockedReason: null });
  mockLoadDemo.mockResolvedValue({
    anchorDate: '2026-08-28', garments: 12, looks: 3, plans: 3, wearDays: 8, shoppingCases: 1,
  });
});

it('欢迎页可直接准备完整演示数据，并在持久完成态后进入首页', async () => {
  mockLoadOnboardState.mockResolvedValue(stateAt('welcome'));
  render(<OnboardingScreen />);

  fireEvent.press(await screen.findByRole('button', { name: '直接体验完整 Demo' }));

  await waitFor(() => expect(mockLoadDemo).toHaveBeenCalledTimes(1));
  expect(mockSaveOnboardState).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ completed: true, step: 'done' }),
  );
  expect(mockLoadDemo.mock.invocationCallOrder[0]).toBeLessThan(
    mockSaveOnboardState.mock.invocationCallOrder[0],
  );
  expect(mockSaveOnboardState.mock.invocationCallOrder[0]).toBeLessThan(
    mockReplace.mock.invocationCallOrder[0],
  );
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('隐私页只承诺本地优先，本地抠图为默认，并如实说明腾讯云明确同意与演示数据边界', async () => {
  mockLoadOnboardState.mockResolvedValue(stateAt('privacy'));
  render(<OnboardingScreen />);

  await waitFor(() => expect(screen.getByText('本地优先 · 隐私')).toBeOnTheScreen());
  expect(screen.getByText(/抠图默认在手机本地完成.*明确同意后.*上传腾讯云/)).toBeOnTheScreen();
  expect(screen.getByText(/本演示版数据仅保存在当前设备/)).toBeOnTheScreen();
  expect(screen.queryByText(/导出|备份|恢复/)).toBeNull();
  expect(screen.queryByText(/可随时完整导出/)).toBeNull();
  expect(screen.queryByText(/不注册、不上传/)).toBeNull();
});

it('稍后补录先持久完成 onboarding，再进入首页', async () => {
  mockLoadOnboardState.mockResolvedValue(stateAt('quota'));
  render(<OnboardingScreen />);

  const skip = await screen.findByRole('button', { name: '稍后在衣橱补录' });
  fireEvent.press(skip);

  await waitFor(() =>
    expect(mockSaveOnboardState).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ completed: true, step: 'done' }),
    ),
  );
  expect(mockSaveOnboardState.mock.invocationCallOrder[0]).toBeLessThan(
    mockReplace.mock.invocationCallOrder[0],
  );
  expect(mockReplace).toHaveBeenCalledWith('/');
});

it('录入步骤：按类别一次多选照片 → 带类别入队 → 本地抠图', async () => {
  mockLoadOnboardState.mockResolvedValue(stateAt('quota'));
  mockLaunchPicker.mockResolvedValue({
    canceled: false,
    assets: [
      { uri: 'file:///a.jpg', mimeType: 'image/jpeg' },
      { uri: 'file:///b.png', mimeType: 'image/png' },
    ],
  });
  render(<OnboardingScreen />);

  fireEvent.press(await screen.findByRole('button', { name: '下装' }));
  fireEvent.press(await screen.findByRole('button', { name: '选下装照片（可多选）' }));

  await waitFor(() => expect(mockEnqueueBatch).toHaveBeenCalledTimes(1));
  expect(mockLaunchPicker).toHaveBeenCalledWith(expect.objectContaining({ allowsMultipleSelection: true }));
  expect(mockEnqueueBatch).toHaveBeenCalledWith(expect.anything(), [
    { uri: 'file:///a.jpg', ext: 'jpg', category: 'bottom' },
    { uri: 'file:///b.png', ext: 'png', category: 'bottom' },
  ]);
  expect(mockStartProcessing).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.getByText(/已添加 2 件下装/)).toBeOnTheScreen());
});

it('录入步骤：本地模型不可用时给出原因，照片仍已入库', async () => {
  mockLoadOnboardState.mockResolvedValue(stateAt('quota'));
  mockLaunchPicker.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///a.jpg', mimeType: 'image/jpeg' }] });
  mockStartProcessing.mockResolvedValue({ processed: 0, blockedReason: '本地抠图模型加载失败：x' });
  render(<OnboardingScreen />);

  fireEvent.press(await screen.findByRole('button', { name: /^选.*照片（可多选）$/ }));
  await waitFor(() => expect(screen.getByText(/抠图暂时无法进行（本地抠图模型加载失败：x）/)).toBeOnTheScreen());
  expect(mockEnqueueBatch).toHaveBeenCalledTimes(1);
});

it('首套搭配展示衣物图片和名字，不再显示内部 ID', async () => {
  mockLoadOnboardState.mockResolvedValue(stateAt('reveal'));
  mockListActiveGarments.mockResolvedValue([
    listed('id-top-1', 'top', '藏青上装'),
    listed('id-bot-1', 'bottom', '黑色下装'),
    listed('id-shoe-1', 'shoes', '白鞋'),
  ]);
  render(<OnboardingScreen />);

  await waitFor(() => expect(screen.getByText('你的首套搭配')).toBeOnTheScreen());
  expect(screen.getByText('藏青上装')).toBeOnTheScreen();
  expect(screen.getByText('黑色下装')).toBeOnTheScreen();
  expect(screen.getByText('白鞋')).toBeOnTheScreen();
  expect(screen.getByLabelText('藏青上装图片')).toBeOnTheScreen();
  expect(screen.queryByText(/id-top-1/)).toBeNull();
});
