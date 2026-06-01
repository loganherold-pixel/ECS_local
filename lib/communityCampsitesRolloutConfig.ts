export type CommunityCampsitesRolloutFeature =
  | 'communityCampsitesEnabled'
  | 'campsiteCommunityReviewEnabled'
  | 'campsiteReviewerQuorumEnabled'
  | 'campsiteAutoPublishAfterQuorumEnabled'
  | 'campsiteModerationEnabled'
  | 'gpxCampsiteImportEnabled'
  | 'campsitePhotosEnabled'
  | 'campsiteGroupSharingEnabled'
  | 'campsiteOfflineQueueEnabled'
  | 'campsiteLandUseReviewEnabled'
  | 'campsitePostPublicationReviewEnabled';

export type CommunityCampsitesRolloutConfig = Record<CommunityCampsitesRolloutFeature, boolean>;

export const DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG: CommunityCampsitesRolloutConfig = {
  communityCampsitesEnabled: true,
  campsiteCommunityReviewEnabled: true,
  campsiteReviewerQuorumEnabled: true,
  campsiteAutoPublishAfterQuorumEnabled: false,
  campsiteModerationEnabled: true,
  gpxCampsiteImportEnabled: true,
  campsitePhotosEnabled: true,
  campsiteGroupSharingEnabled: true,
  campsiteOfflineQueueEnabled: true,
  campsiteLandUseReviewEnabled: false,
  campsitePostPublicationReviewEnabled: true,
};

export const PRODUCTION_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG: CommunityCampsitesRolloutConfig = {
  ...DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG,
  communityCampsitesEnabled: false,
  gpxCampsiteImportEnabled: false,
  campsitePhotosEnabled: false,
  campsiteLandUseReviewEnabled: false,
};

export function resolveCommunityCampsitesRolloutConfig(
  overrides: Partial<CommunityCampsitesRolloutConfig> = {},
): CommunityCampsitesRolloutConfig {
  const moderationEnabled =
    overrides.campsiteModerationEnabled ??
    overrides.campsiteCommunityReviewEnabled ??
    DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG.campsiteModerationEnabled;
  const communityReviewEnabled =
    overrides.campsiteCommunityReviewEnabled ??
    overrides.campsiteModerationEnabled ??
    DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG.campsiteCommunityReviewEnabled;

  return {
    ...DEFAULT_COMMUNITY_CAMPSITES_ROLLOUT_CONFIG,
    ...overrides,
    campsiteCommunityReviewEnabled: communityReviewEnabled,
    campsiteModerationEnabled: moderationEnabled,
  };
}

export function isCommunityCampsitesFeatureEnabled(
  config: CommunityCampsitesRolloutConfig,
  feature: CommunityCampsitesRolloutFeature,
): boolean {
  return config[feature] === true;
}
