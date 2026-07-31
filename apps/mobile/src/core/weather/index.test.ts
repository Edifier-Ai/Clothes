/**
 * @jest-environment node
 */
import { describe, expect, it, jest } from '@jest/globals';

import { openQueueTestDb } from '../db/queueTestHelper';
import {
  QWeatherAdapter,
  getForegroundCoordinates,
  resolveWeather,
  type WeatherCacheEntry,
} from './index';
import { clearWeatherCache, getWeatherCache, putWeatherCache } from './store';

const coords = { latitude: 31.2304, longitude: 121.4737 };
const cached: WeatherCacheEntry = {
  cityId: 'shanghai',
  cityName: '上海',
  ...coords,
  fetchedAt: 1_000,
  windowStart: 0,
  windowEnd: 86_400_000,
  minTempC: 24,
  maxTempC: 31,
  conditionCode: '101',
  provider: 'qweather',
};

describe('天气缓存与离线降级', () => {
  it('按城市持久保存、读取和删除坐标及天气窗口', async () => {
    const t = openQueueTestDb();
    await putWeatherCache(t.db, cached);
    expect(await getWeatherCache(t.db, 'shanghai')).toEqual(cached);
    await clearWeatherCache(t.db, 'shanghai');
    expect(await getWeatherCache(t.db, 'shanghai')).toBeNull();
    t.close();
  });

  it('缓存新鲜时直接使用缓存，不发网络请求', async () => {
    const fetchLive = jest.fn<() => Promise<WeatherCacheEntry>>();
    const result = await resolveWeather({
      cache: cached,
      now: 2_000,
      maxAgeMs: 10_000,
      online: true,
      fetchLive,
    });
    expect(result.status).toBe('cache-fresh');
    expect(fetchLive).not.toHaveBeenCalled();
  });

  it('缓存过期且离线时明确使用过期缓存；无缓存时进入无天气模式', async () => {
    const stale = await resolveWeather({
      cache: cached,
      now: 20_000,
      maxAgeMs: 10_000,
      online: false,
      fetchLive: async () => {
        throw new Error('should not fetch');
      },
    });
    expect(stale.status).toBe('cache-stale');
    expect(stale.weather?.maxTempC).toBe(31);

    const none = await resolveWeather({
      cache: null,
      now: 20_000,
      maxAgeMs: 10_000,
      online: false,
      fetchLive: async () => {
        throw new Error('should not fetch');
      },
    });
    expect(none).toEqual({ status: 'none', weather: null });
  });

  it('网络超时不清空已有缓存', async () => {
    const result = await resolveWeather({
      cache: cached,
      now: 20_000,
      maxAgeMs: 10_000,
      online: true,
      fetchLive: async () => {
        throw new Error('timeout');
      },
    });
    expect(result.status).toBe('cache-stale');
    expect(result.weather).toEqual(cached);
  });
});

describe('定位与和风适配器', () => {
  it('定位拒绝后返回 denied，只请求前台权限且不继续取坐标', async () => {
    const getCurrent = jest.fn(async () => ({ coords }));
    const result = await getForegroundCoordinates({
      requestForegroundPermissionsAsync: async () => ({ status: 'denied' }),
      getCurrentPositionAsync: getCurrent,
    });
    expect(result).toEqual({ status: 'denied', coordinates: null });
    expect(getCurrent).not.toHaveBeenCalled();
  });

  it('错误格式响应被拒绝并降级，不显示伪造温度（反向验证）', async () => {
    const adapter = new QWeatherAdapter('test-key', async () => ({
      ok: true,
      json: async () => ({ code: '200', daily: [{ tempMin: 'bad', tempMax: '31' }] }),
    }));
    await expect(adapter.fetchDaily(coords, 1_000, '上海')).rejects.toThrow('invalid weather response');

    const result = await resolveWeather({
      cache: null,
      now: 1_000,
      maxAgeMs: 10_000,
      online: true,
      fetchLive: () => adapter.fetchDaily(coords, 1_000, '上海'),
    });
    expect(result).toEqual({ status: 'none', weather: null });
  });
});
