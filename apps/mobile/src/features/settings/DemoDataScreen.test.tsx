import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { DemoDataService } from '@/core/demo/demoDataService';
import DemoDataScreen from './DemoDataScreen';

const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: mockReplace }),
}));

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

function service(load: DemoDataService['load']): DemoDataService {
  return { load };
}

describe('演示数据设置', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
  });

  it('明确展示数据边界并在成功后进入体验', async () => {
    const load = jest.fn<DemoDataService['load']>(async () => ({
      anchorDate: '2026-08-27', garments: 54, looks: 18, plans: 7, wearDays: 20, shoppingCases: 1,
    }));
    render(<DemoDataScreen demoService={service(load)} />);
    expect(screen.getByText('只重置内置演示内容')).toBeOnTheScreen();
    fireEvent.press(screen.getByRole('button', { name: '载入演示体验' }));
    await waitFor(() => expect(screen.getByText('演示体验可以开始')).toBeOnTheScreen());
    expect(load).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByRole('button', { name: '开始体验' }));
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('失败时不伪装成功并允许再次点击重试', async () => {
    const load = jest.fn<DemoDataService['load']>(async () => {
      throw new Error('injected');
    });
    render(<DemoDataScreen demoService={service(load)} />);
    fireEvent.press(screen.getByRole('button', { name: '载入演示体验' }));
    await waitFor(() => expect(screen.getByText('载入失败')).toBeOnTheScreen());
    expect(screen.queryByText('演示体验可以开始')).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: '载入演示体验' })).toBeEnabled();
  });
});
