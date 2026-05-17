export interface CampsiteReviewConfig {
  autoPublishAfterCommunityQuorum: boolean;
  minTrustedApprovals: number;
  duplicateRadiusMeters: number;
  maxCommunitySubmissionsPerDay: number;
  triageWarningThreshold: number;
}

export const DEFAULT_CAMPSITE_REVIEW_CONFIG: CampsiteReviewConfig = {
  autoPublishAfterCommunityQuorum: false,
  minTrustedApprovals: 3,
  duplicateRadiusMeters: 100,
  maxCommunitySubmissionsPerDay: 10,
  triageWarningThreshold: 60,
};

export function resolveCampsiteReviewConfig(
  overrides: Partial<CampsiteReviewConfig> = {},
): CampsiteReviewConfig {
  return {
    ...DEFAULT_CAMPSITE_REVIEW_CONFIG,
    ...overrides,
  };
}
