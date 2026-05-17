export type CampsiteLandUseProviderKey =
  | 'private_land'
  | 'closure'
  | 'protected_area'
  | 'sensitive_area'
  | 'water_buffer'
  | 'density';

export interface CampsiteLandUseReviewConfig {
  enabled: boolean;
  blockPrivateLandMatches: boolean;
  blockSensitiveMatches: boolean;
  waterBufferMeters: number;
  providers: CampsiteLandUseProviderKey[];
}

export const DEFAULT_CAMPSITE_LAND_USE_REVIEW_CONFIG: CampsiteLandUseReviewConfig = {
  enabled: true,
  blockPrivateLandMatches: true,
  blockSensitiveMatches: true,
  waterBufferMeters: 60,
  providers: [
    'private_land',
    'closure',
    'protected_area',
    'sensitive_area',
    'water_buffer',
    'density',
  ],
};

export function resolveCampsiteLandUseReviewConfig(
  overrides: Partial<CampsiteLandUseReviewConfig> = {},
): CampsiteLandUseReviewConfig {
  return {
    ...DEFAULT_CAMPSITE_LAND_USE_REVIEW_CONFIG,
    ...overrides,
    providers: overrides.providers ?? DEFAULT_CAMPSITE_LAND_USE_REVIEW_CONFIG.providers,
  };
}
