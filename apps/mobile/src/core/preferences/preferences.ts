import * as SecureStore from 'expo-secure-store';

import {
  grantUploadConsent,
  hasUploadConsent,
  revokeUploadConsent,
} from '@/core/cutout/apiConfig';
import {
  DEFAULT_RECOMMENDATION_FACTORS,
  resolveRecommendationFactors,
  type RecommendationFactors,
} from '@/core/recommend/factors';

const PREFERENCES_KEY = 'clothes-app-preferences-v1';

interface StoredPreferences {
  telemetryEnabled: boolean;
  recommendationFactors: RecommendationFactors;
}

export interface AppPreferences extends StoredPreferences {
  photoUploadEnabled: boolean;
}

export type PreferencesListener = (preferences: AppPreferences) => void;

/**
 * Photo upload and telemetry are deliberately opt-in and therefore default to false.
 */
export const DEFAULT_STORED_PREFERENCES: Readonly<StoredPreferences> = {
  telemetryEnabled: false,
  recommendationFactors: { ...DEFAULT_RECOMMENDATION_FACTORS },
};

const listeners = new Set<PreferencesListener>();

function parseStored(raw: string | null): StoredPreferences {
  if (!raw) return { ...DEFAULT_STORED_PREFERENCES };
  try {
    const value = JSON.parse(raw) as Partial<StoredPreferences>;
    return {
      // A corrupt or unknown value must never silently opt the user into telemetry.
      telemetryEnabled:
        typeof value.telemetryEnabled === 'boolean'
          ? value.telemetryEnabled
          : DEFAULT_STORED_PREFERENCES.telemetryEnabled,
      recommendationFactors: resolveRecommendationFactors(value.recommendationFactors),
    };
  } catch {
    return { ...DEFAULT_STORED_PREFERENCES };
  }
}

async function readStored(): Promise<StoredPreferences> {
  return parseStored(await SecureStore.getItemAsync(PREFERENCES_KEY));
}

async function writeStored(next: StoredPreferences): Promise<void> {
  await SecureStore.setItemAsync(PREFERENCES_KEY, JSON.stringify(next));
}

async function emit(): Promise<AppPreferences> {
  const next = await getAppPreferences();
  for (const listener of listeners) listener(next);
  return next;
}

export async function getAppPreferences(): Promise<AppPreferences> {
  const [stored, photoUploadEnabled] = await Promise.all([
    readStored(),
    hasUploadConsent(),
  ]);
  return { ...stored, photoUploadEnabled };
}

export async function setPhotoUploadEnabled(enabled: boolean): Promise<AppPreferences> {
  if (enabled) await grantUploadConsent();
  else await revokeUploadConsent();
  return emit();
}

/**
 * Persists an explicit future opt-in only. This repository currently ships no
 * telemetry SDK and no caller sends events, regardless of this stored value.
 */
export async function setTelemetryEnabled(enabled: boolean): Promise<AppPreferences> {
  const current = await readStored();
  await writeStored({ ...current, telemetryEnabled: enabled });
  return emit();
}

export async function setRecommendationFactors(
  factors: RecommendationFactors,
): Promise<AppPreferences> {
  const current = await readStored();
  await writeStored({ ...current, recommendationFactors: resolveRecommendationFactors(factors) });
  return emit();
}

/** Stable getter for future telemetry adapters; no telemetry adapter exists today. */
export async function isTelemetryEnabled(): Promise<boolean> {
  return (await readStored()).telemetryEnabled;
}

export function subscribeAppPreferences(listener: PreferencesListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Removes non-secret app preferences. Tencent credentials are deliberately not
 * touched here; destructive data deletion owns that separate explicit step.
 */
export async function clearAppPreferences(): Promise<AppPreferences> {
  await SecureStore.deleteItemAsync(PREFERENCES_KEY);
  return emit();
}

/** Test-only listener cleanup; persistence remains controlled by SecureStore mock. */
export function __resetPreferenceListenersForTest(): void {
  listeners.clear();
}
