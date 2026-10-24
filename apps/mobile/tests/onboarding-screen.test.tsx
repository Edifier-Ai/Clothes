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
const mockListActiveGarments = jest.fn(
  async (..._args: unknown[]): Promise<{ id: string; category: string }[]> => [],
);
const mockLoadDemo = jest.fn(async () => ({
  anchorDate: '2026-08-28', garments: 12, looks: 3, plans: 3, wearDays: 8, shoppingCases: 1,
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: (...args: unknown[]) => mockReplace(...args) }),
}));

jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@/core/db/expoDb', () => ({
  openAppDb: jest.fn(async () => ({ db: {} })),
}));

jest.mock('@/core/db/dao', () => ({
  listActiveGarments: (...args: unknown[]) => mockListActiveGarments(...args),
}));

jest.mock('@/core/cutout/cutoutService', () => ({
  addOriginalOnly: jest.fn(),
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

it('隐私页只承诺本地优先，并如实说明腾讯云明确同意与演示数据边界', async () => {
  mockLoadOnboardState.mockResolvedValue(stateAt('privacy'));
  render(<OnboardingScreen />);

  await waitFor(() => expect(screen.getByText('本地优先 · 隐私')).toBeOnTheScreen());
  expect(screen.getByText(/只有你明确同意后.*上传腾讯云.*抠图/)).toBeOnTheScreen();
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
