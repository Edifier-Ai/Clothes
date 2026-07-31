export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface WeatherCacheEntry extends Coordinates {
  cityId: string;
  cityName: string;
  fetchedAt: number;
  windowStart: number;
  windowEnd: number;
  minTempC: number;
  maxTempC: number;
  conditionCode: string;
  provider: 'qweather' | 'open-meteo';
}

export type WeatherResolution =
  | { status: 'live' | 'cache-fresh' | 'cache-stale'; weather: WeatherCacheEntry }
  | { status: 'none'; weather: null };

export interface ResolveWeatherInput {
  cache: WeatherCacheEntry | null;
  now: number;
  maxAgeMs: number;
  online: boolean;
  fetchLive: () => Promise<WeatherCacheEntry>;
}

export async function resolveWeather(input: ResolveWeatherInput): Promise<WeatherResolution> {
  if (input.cache && input.now - input.cache.fetchedAt <= input.maxAgeMs) {
    return { status: 'cache-fresh', weather: input.cache };
  }
  if (!input.online) {
    return input.cache
      ? { status: 'cache-stale', weather: input.cache }
      : { status: 'none', weather: null };
  }
  try {
    return { status: 'live', weather: await input.fetchLive() };
  } catch {
    return input.cache
      ? { status: 'cache-stale', weather: input.cache }
      : { status: 'none', weather: null };
  }
}

interface FetchResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

type FetchLike = (url: string) => Promise<FetchResponse>;

function finiteNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) throw new Error('invalid weather response');
  return number;
}

function dayWindow(date: unknown, now: number): { start: number; end: number } {
  const parsed = typeof date === 'string' ? Date.parse(`${date}T00:00:00`) : Number.NaN;
  const start = Number.isFinite(parsed) ? parsed : new Date(now).setHours(0, 0, 0, 0);
  return { start, end: start + 86_400_000 };
}

export interface WeatherAdapter {
  fetchDaily(coordinates: Coordinates, now: number, cityName: string, cityId?: string): Promise<WeatherCacheEntry>;
}

export class QWeatherAdapter implements WeatherAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = (url) => fetch(url),
    private readonly host = 'https://devapi.qweather.com',
  ) {}

  async fetchDaily(
    coordinates: Coordinates,
    now: number,
    cityName: string,
    cityId = `${coordinates.latitude},${coordinates.longitude}`,
  ): Promise<WeatherCacheEntry> {
    const location = `${coordinates.longitude.toFixed(4)},${coordinates.latitude.toFixed(4)}`;
    const url = `${this.host}/v7/weather/3d?location=${encodeURIComponent(location)}&key=${encodeURIComponent(this.apiKey)}`;
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error('weather request failed');
    const body = await response.json() as {
      code?: unknown;
      daily?: { fxDate?: unknown; tempMin?: unknown; tempMax?: unknown; iconDay?: unknown }[];
    };
    const day = body.daily?.[0];
    if (body.code !== '200' || !day) throw new Error('invalid weather response');
    const minTempC = finiteNumber(day.tempMin);
    const maxTempC = finiteNumber(day.tempMax);
    const conditionCode = typeof day.iconDay === 'string' ? day.iconDay : '';
    if (!conditionCode) throw new Error('invalid weather response');
    const window = dayWindow(day.fxDate, now);
    return {
      cityId,
      cityName,
      ...coordinates,
      fetchedAt: now,
      windowStart: window.start,
      windowEnd: window.end,
      minTempC,
      maxTempC,
      conditionCode,
      provider: 'qweather',
    };
  }
}

export class OpenMeteoAdapter implements WeatherAdapter {
  constructor(private readonly fetchImpl: FetchLike = (url) => fetch(url)) {}

  async fetchDaily(
    coordinates: Coordinates,
    now: number,
    cityName: string,
    cityId = `${coordinates.latitude},${coordinates.longitude}`,
  ): Promise<WeatherCacheEntry> {
    const url =
      'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${coordinates.latitude}&longitude=${coordinates.longitude}` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=1&timezone=auto';
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error('weather request failed');
    const body = await response.json() as {
      daily?: {
        time?: unknown[];
        weather_code?: unknown[];
        temperature_2m_min?: unknown[];
        temperature_2m_max?: unknown[];
      };
    };
    const date = body.daily?.time?.[0];
    const condition = body.daily?.weather_code?.[0];
    if (condition == null) throw new Error('invalid weather response');
    const window = dayWindow(date, now);
    return {
      cityId,
      cityName,
      ...coordinates,
      fetchedAt: now,
      windowStart: window.start,
      windowEnd: window.end,
      minTempC: finiteNumber(body.daily?.temperature_2m_min?.[0]),
      maxTempC: finiteNumber(body.daily?.temperature_2m_max?.[0]),
      conditionCode: String(condition),
      provider: 'open-meteo',
    };
  }
}

export interface ForegroundLocationProvider {
  requestForegroundPermissionsAsync(): Promise<{ status: string }>;
  getCurrentPositionAsync(): Promise<{ coords: Coordinates }>;
}

export async function getForegroundCoordinates(
  provider: ForegroundLocationProvider,
): Promise<
  | { status: 'granted'; coordinates: Coordinates }
  | { status: 'denied' | 'unavailable'; coordinates: null }
> {
  try {
    const permission = await provider.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return { status: 'denied', coordinates: null };
    const position = await provider.getCurrentPositionAsync();
    const { latitude, longitude } = position.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { status: 'unavailable', coordinates: null };
    }
    return { status: 'granted', coordinates: { latitude, longitude } };
  } catch {
    return { status: 'unavailable', coordinates: null };
  }
}
