import { beforeEach, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react-native';

import RootLayout from '../src/app/_layout';
import type { OnboardState } from '../src/core/onboarding';

const mockLoadOnboardState = jest.fn(
  async (..._args: unknown[]): Promise<OnboardState> => ({
    step: 'quota',
    completed: false,
    goals: [],
    quotaStarted: true,
  }),
);
const mockSubscribeOnboardState = jest.fn(
  (_listener: (state: OnboardState) => void): (() => void) => () => {},
);
let notifyOnboardState: ((state: OnboardState) => void) | undefined;

jest.mock('expo-router', () => {
  const React = jest.requireActual('react') as typeof import('react');
  const { Text, View } = jest.requireActual('react-native') as typeof import('react-native');
  const Stack = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, null, children);
  const StackScreen = () => null;
  Stack.Screen = StackScreen;
  return {
    Stack,
    Redirect: ({ href }: { href: string }) =>
      React.createElement(Text, { testID: 'root-redirect' }, href),
  };
});

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: jest.fn(async () => {}),
}));

jest.mock('expo-status-bar', () => ({ StatusBar: () => null }));

jest.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children: React.ReactNode }) => {
    const React = jest.requireActual('react') as typeof import('react');
    const { View } = jest.requireActual('react-native') as typeof import('react-native');
    return React.createElement(View, null, children);
  },
}));

jest.mock('@/core/db/expoDb', () => ({
  openAppDb: jest.fn(async () => ({ db: {} })),
}));

jest.mock('@/core/onboarding', () => ({
  loadOnboardState: (...args: unknown[]) => mockLoadOnboardState(...args),
  subscribeOnboardState: (listener: (state: OnboardState) => void) =>
    mockSubscribeOnboardState(listener),
}));

beforeEach(() => {
  jest.clearAllMocks();
  notifyOnboardState = undefined;
  mockLoadOnboardState.mockResolvedValue({
    step: 'quota',
    completed: false,
    goals: [],
    quotaStarted: true,
  });
  mockSubscribeOnboardState.mockImplementation((listener: (state: OnboardState) => void) => {
    notifyOnboardState = listener;
    return () => {};
  });
});

it('onboarding 持久完成后立即解除根重定向，不把进入首页拦回 onboarding', async () => {
  render(<RootLayout />);

  await waitFor(() => expect(screen.getByTestId('root-redirect')).toHaveTextContent('/onboarding'));
  expect(mockSubscribeOnboardState).toHaveBeenCalledTimes(1);

  act(() => {
    notifyOnboardState?.({
      step: 'done',
      completed: true,
      goals: [],
      quotaStarted: true,
    });
  });

  await waitFor(() => expect(screen.queryByTestId('root-redirect')).toBeNull());
});
