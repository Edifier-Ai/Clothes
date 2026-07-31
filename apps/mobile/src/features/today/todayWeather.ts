import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';

import { openAppDb } from '@/core/db/expoDb';
import { writeMirror } from '@/core/garments/mirror';
import {
  OpenMeteoAdapter,
  QWeatherAdapter,
  getForegroundCoordinates,
  resolveWeather,
  type Coordinates,
  type WeatherAdapter,
  type WeatherResolution,
} from '@/core/weather';
import { getWeatherCache, putWeatherCache } from '@/core/weather/store';

export interface CityOption extends Coordinates {
  id: string;
  name: string;
}

export const DEFAULT_CITIES: readonly CityOption[] = [
  { id: 'shanghai', name: '上海', latitude: 31.2304, longitude: 121.4737 },
  { id: 'beijing', name: '北京', latitude: 39.9042, longitude: 116.4074 },
  { id: 'guangzhou', name: '广州', latitude: 23.1291, longitude: 113.2644 },
  { id: 'chengdu', name: '成都', latitude: 30.5728, longitude: 104.0668 },
];

export interface WeatherController {
  loadInitial(): Promise<WeatherResolution>;
  useCity(city: CityOption, persist: boolean): Promise<WeatherResolution>;
  useCurrentLocation(): Promise<{
    locationStatus: 'granted' | 'denied' | 'unavailable';
    weather: WeatherResolution;
  }>;
}

const SELECTED_CITY_KEY = 'weather_selected_city';
const MAX_AGE_MS = 3 * 60 * 60 * 1_000;

function appRoot(): string {
  return `${FileSystem.documentDirectory?.replace(/\/$/, '') ?? '/tmp'}/clothes`;
}

function adapter(): WeatherAdapter {
  const key = process.env.EXPO_PUBLIC_QWEATHER_API_KEY;
  return key ? new QWeatherAdapter(key) : new OpenMeteoAdapter();
}

async function fetchCity(city: CityOption, persist: boolean): Promise<WeatherResolution> {
  const app = await openAppDb();
  const cache = await getWeatherCache(app.drizzleDb, city.id);
  const selectedAdapter = adapter();
  const result = await resolveWeather({
    cache,
    now: Date.now(),
    maxAgeMs: MAX_AGE_MS,
    online: true,
    fetchLive: () =>
      selectedAdapter.fetchDaily(
        { latitude: city.latitude, longitude: city.longitude },
        Date.now(),
        city.name,
        city.id,
      ),
  });
  if (result.status === 'live') {
    await putWeatherCache(app.drizzleDb, result.weather);
  }
  if (persist) {
    await app.db.setMeta(SELECTED_CITY_KEY, JSON.stringify(city));
  }
  if (result.status === 'live' || persist) {
    await writeMirror(appRoot(), app.db, app.drizzleDb);
  }
  return result;
}

export const defaultWeatherController: WeatherController = {
  async loadInitial() {
    const app = await openAppDb();
    const raw = await app.db.getMeta(SELECTED_CITY_KEY);
    if (!raw) return { status: 'none', weather: null };
    try {
      const city = JSON.parse(raw) as CityOption;
      if (
        typeof city.id !== 'string' ||
        typeof city.name !== 'string' ||
        !Number.isFinite(city.latitude) ||
        !Number.isFinite(city.longitude)
      ) {
        return { status: 'none', weather: null };
      }
      return await fetchCity(city, false);
    } catch {
      return { status: 'none', weather: null };
    }
  },

  useCity(city, persist) {
    return fetchCity(city, persist);
  },

  async useCurrentLocation() {
    const location = await getForegroundCoordinates({
      requestForegroundPermissionsAsync: () => Location.requestForegroundPermissionsAsync(),
      getCurrentPositionAsync: async () => {
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        return {
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        };
      },
    });
    if (location.status !== 'granted') {
      return {
        locationStatus: location.status,
        weather: { status: 'none', weather: null },
      };
    }
    const city: CityOption = {
      id: `location:${location.coordinates.latitude.toFixed(3)},${location.coordinates.longitude.toFixed(3)}`,
      name: '当前位置',
      ...location.coordinates,
    };
    return {
      locationStatus: 'granted',
      weather: await fetchCity(city, false),
    };
  },
};
