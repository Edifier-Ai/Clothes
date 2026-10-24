import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import type { AppPreferences } from '@/core/preferences';
import type { RecommendationFactors } from '@/core/recommend';
import RecommendationSettingsScreen from './RecommendationSettingsScreen';
import SettingsScreen from './SettingsScreen';
import type { PreferenceUiService } from './settingsServices';

const mockBack = jest.fn();
const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, push: mockPush }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const preferences: AppPreferences = {
  photoUploadEnabled: false,
  telemetryEnabled: false,
  recommendationFactors: {
    occasion: true,
    colorHarmony: true,
    wardrobeActivation: true,
    repeatAvoidance: true,
    feedbackLearning: true,
    heroItem: true,
  },
};

function service(): PreferenceUiService & {
  setRecommendationFactors: jest.MockedFunction<PreferenceUiService['setRecommendationFactors']>;
} {
  const setRecommendationFactors = jest.fn<PreferenceUiService['setRecommendationFactors']>(async (factors: RecommendationFactors) => ({
    ...preferences,
    recommendationFactors: factors,
  }));
  return {
    get: jest.fn(async () => preferences),
    setPhotoUpload: jest.fn(async () => preferences),
    setRecommendationFactors,
  };
}

describe('推荐参考要素设置', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockPush.mockClear();
  });

  it('展示六项可选要素与不可关闭的硬约束说明', async () => {
    render(<RecommendationSettingsScreen preferenceService={service()} />);
    await waitFor(() => expect(screen.getByText('6')).toBeOnTheScreen());
    expect(screen.getByLabelText('参考场合')).toBeOnTheScreen();
    expect(screen.getByLabelText('参考颜色协调')).toBeOnTheScreen();
    expect(screen.getByLabelText('参考久未穿优先')).toBeOnTheScreen();
    expect(screen.getByLabelText('参考避免近期重复')).toBeOnTheScreen();
    expect(screen.getByLabelText('参考反馈偏好')).toBeOnTheScreen();
    expect(screen.getByLabelText('参考主角单品')).toBeOnTheScreen();
    expect(screen.getByText('安全硬约束')).toBeOnTheScreen();
  });

  it('关闭配色与主角后一次保存完整选择', async () => {
    const preferenceService = service();
    render(<RecommendationSettingsScreen preferenceService={preferenceService} />);
    await waitFor(() => expect(screen.getByText('6')).toBeOnTheScreen());
    fireEvent(screen.getByLabelText('参考颜色协调'), 'valueChange', false);
    fireEvent(screen.getByLabelText('参考主角单品'), 'valueChange', false);
    fireEvent.press(screen.getByRole('button', { name: '保存推荐设置' }));
    await waitFor(() => expect(preferenceService.setRecommendationFactors).toHaveBeenCalledTimes(1));
    expect(preferenceService.setRecommendationFactors).toHaveBeenCalledWith({
      ...preferences.recommendationFactors,
      colorHarmony: false,
      heroItem: false,
    });
    expect(screen.getByText(/下一次生成会使用这些要素/)).toBeOnTheScreen();
  });

  it('设置首页展示启用数量并可进入推荐设置', async () => {
    render(<SettingsScreen preferenceService={service()} />);
    await waitFor(() => expect(screen.getByText('6/6')).toBeOnTheScreen());
    fireEvent.press(screen.getByRole('button', { name: '推荐参考要素' }));
    expect(mockPush).toHaveBeenCalledWith('/settings/recommendations');
  });
});
