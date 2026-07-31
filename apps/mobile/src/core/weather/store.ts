import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type { ExpoSQLiteDatabase } from 'drizzle-orm/expo-sqlite';

import * as schema from '../db/schema';
import { weatherCache, type WeatherCacheRow } from '../db/schema';
import type { WeatherCacheEntry } from './index';

type AnyDb =
  | BetterSQLite3Database<typeof schema>
  | ExpoSQLiteDatabase<typeof schema>;

function toEntry(row: WeatherCacheRow): WeatherCacheEntry {
  return {
    ...row,
    provider: row.provider === 'qweather' ? 'qweather' : 'open-meteo',
  };
}

export async function getWeatherCache(
  db: AnyDb,
  cityId: string,
): Promise<WeatherCacheEntry | null> {
  const row = await db
    .select()
    .from(weatherCache)
    .where(eq(weatherCache.cityId, cityId))
    .get() as WeatherCacheRow | undefined;
  return row ? toEntry(row) : null;
}

export async function putWeatherCache(
  db: AnyDb,
  entry: WeatherCacheEntry,
): Promise<void> {
  await db
    .insert(weatherCache)
    .values(entry)
    .onConflictDoUpdate({
      target: weatherCache.cityId,
      set: entry,
    });
}

export async function clearWeatherCache(db: AnyDb, cityId?: string): Promise<void> {
  if (cityId) {
    await db.delete(weatherCache).where(eq(weatherCache.cityId, cityId));
  } else {
    await db.delete(weatherCache);
  }
}
