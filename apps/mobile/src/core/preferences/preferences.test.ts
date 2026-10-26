/** @jest-environment node */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as SecureStore from 'expo-secure-store';

import {
  __resetPreferenceListenersForTest,
  clearAppPreferences,
  getAppPreferences,
  isTelemetryEnabled,
  setPhotoUploadEnabled,
  setRecommendationFactors,
  setTelemetryEnabled,
  subscribeAppPreferences,
} from './preferences';

const store = (SecureStore as unknown as { __store: Map<string, string> }).__store;

beforeEach(() => {
  store.clear();
  __resetPreferenceListenersForTest();
});

describe('本地隐私偏好', () => {
  it('上传与遥测默认关闭', async () => {
    await expect(getAppPreferences()).resolves.toEqual({
      photoUploadEnabled: false,
      telemetryEnabled: false,
      recommendationFactors: {
        occasion: true,
        colorHarmony: true,
        wardrobeActivation: true,
        repeatAvoidance: true,
        feedbackLearning: true,
        heroItem: true,
        weather: true,
      },
    });
  });

  it('推荐参考要素整组持久化并随完整快照返回', async () => {
    await setRecommendationFactors({
      occasion: true,
      colorHarmony: false,
      wardrobeActivation: true,
      repeatAvoidance: false,
      feedbackLearning: true,
      heroItem: false,
      weather: true,
    });
    expect((await getAppPreferences()).recommendationFactors).toEqual({
      occasion: true,
      colorHarmony: false,
      wardrobeActivation: true,
      repeatAvoidance: false,
      feedbackLearning: true,
      heroItem: false,
      weather: true,
    });
  });

  it('照片上传只有显式开启后才授权，并可独立撤销', async () => {
    await setPhotoUploadEnabled(true);
    expect((await getAppPreferences()).photoUploadEnabled).toBe(true);
    await setPhotoUploadEnabled(false);
    expect((await getAppPreferences()).photoUploadEnabled).toBe(false);
  });

  it('遥测偏好独立持久化，但模块自身不包含任何上传行为', async () => {
    await setTelemetryEnabled(true);
    expect(await isTelemetryEnabled()).toBe(true);
    expect(store.has('clothes-app-preferences-v1')).toBe(true);
  });

  it('损坏内容安全回退，不会偷渡遥测同意', async () => {
    store.set('clothes-app-preferences-v1', '{broken');
    expect(await getAppPreferences()).toEqual({
      photoUploadEnabled: false,
      telemetryEnabled: false,
      recommendationFactors: {
        occasion: true,
        colorHarmony: true,
        wardrobeActivation: true,
        repeatAvoidance: true,
        feedbackLearning: true,
        heroItem: true,
        weather: true,
      },
    });
  });

  it('订阅者只在修改后收到完整快照，取消订阅后不再触发', async () => {
    const listener = jest.fn<(value: Awaited<ReturnType<typeof getAppPreferences>>) => void>();
    const unsubscribe = subscribeAppPreferences(listener);
    await setTelemetryEnabled(true);
    expect(listener).toHaveBeenLastCalledWith({
      photoUploadEnabled: false,
      telemetryEnabled: true,
      recommendationFactors: {
        occasion: true,
        colorHarmony: true,
        wardrobeActivation: true,
        repeatAvoidance: true,
        feedbackLearning: true,
        heroItem: true,
        weather: true,
      },
    });
    unsubscribe();
    await setPhotoUploadEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('清空偏好恢复安全默认值，不清除由独立模块管理的上传授权', async () => {
    await setTelemetryEnabled(true);
    await setPhotoUploadEnabled(true);
    await clearAppPreferences();
    expect(await getAppPreferences()).toEqual({
      photoUploadEnabled: true,
      telemetryEnabled: false,
      recommendationFactors: {
        occasion: true,
        colorHarmony: true,
        wardrobeActivation: true,
        repeatAvoidance: true,
        feedbackLearning: true,
        heroItem: true,
        weather: true,
      },
    });
  });
});
