import {
  getAppPreferences,
  setRecommendationFactors,
  setPhotoUploadEnabled,
  type AppPreferences,
} from '@/core/preferences';
import type { RecommendationFactors } from '@/core/recommend';

export interface PreferenceUiService {
  get(): Promise<AppPreferences>;
  setPhotoUpload(enabled: boolean): Promise<AppPreferences>;
  setRecommendationFactors(factors: RecommendationFactors): Promise<AppPreferences>;
}

export const defaultPreferenceUiService: PreferenceUiService = {
  get: getAppPreferences,
  setPhotoUpload: setPhotoUploadEnabled,
  setRecommendationFactors,
};
