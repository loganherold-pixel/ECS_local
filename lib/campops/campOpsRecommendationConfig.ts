export type CampOpsRecommendationRolloutFeature =
  | 'campopsRecommendationsEnabled'
  | 'campOpsRecommendationSetEnabled'
  | 'campopsProviderAdaptersEnabled'
  | 'campopsAiAssistEnabled'
  | 'campopsEndpointRecommendationEnabled'
  | 'campopsDecisionPointsEnabled'
  | 'campopsDebriefCommunityPublishingEnabled'
  | 'campopsSourceTransparencyEnabled'
  | 'campopsProviderValidationShadowModeEnabled'
  | 'campopsTelemetryEnabled';

export type CampOpsRecommendationRolloutConfig = Record<CampOpsRecommendationRolloutFeature, boolean>;

export type CampOpsFeatureState = CampOpsRecommendationRolloutConfig & {
  recommendationsEnabled: boolean;
  providerAdaptersEnabled: boolean;
  aiAssistEnabled: boolean;
  endpointRecommendationEnabled: boolean;
  decisionPointsEnabled: boolean;
  debriefCommunityPublishingEnabled: boolean;
  sourceTransparencyEnabled: boolean;
  providerValidationShadowModeEnabled: boolean;
  telemetryEnabled: boolean;
};

export type CampOpsInternalBetaTester = {
  testerId?: string | null;
  email?: string | null;
  cohorts?: string[] | null;
  approved?: boolean | null;
};

export type CampOpsInternalBetaActivationInput = {
  tester?: CampOpsInternalBetaTester | null;
  requestedFlags?: Partial<CampOpsRecommendationRolloutConfig> | null;
  allowlistedTesterIds?: string[] | null;
  allowlistedEmails?: string[] | null;
  allowedCohorts?: string[] | null;
  providerInfluenceApproved?: boolean | null;
  aiAssistRealOutputReviewApproved?: boolean | null;
  telemetrySinkPrivacyApproved?: boolean | null;
  communityPublishingApproved?: boolean | null;
};

export type CampOpsInternalBetaActivationResult = {
  enabled: boolean;
  testerApproved: boolean;
  reason: string;
  rolloutConfig: CampOpsRecommendationRolloutConfig;
};

export type CampOpsRestrictedFieldTestActivationInput = {
  riskAcceptanceAccepted?: boolean | null;
  tester?: CampOpsInternalBetaTester | null;
  approvedCohorts?: string[] | null;
  buildIdentifier?: string | null;
  approvedBuildIdentifiers?: string[] | null;
  regionLabel?: string | null;
  routeLabel?: string | null;
  scenarioLabel?: string | null;
  approvedRegionLabels?: string[] | null;
  approvedRouteLabels?: string[] | null;
  approvedScenarioLabels?: string[] | null;
  approvedDelayedDayScenarioLabels?: string[] | null;
  routeProgressSupportsDecisionPointReview?: boolean | null;
  requestedFlags?: Partial<CampOpsRecommendationRolloutConfig> | null;
  providerInfluenceApprovedForExactCategoryRegion?: boolean | null;
  aiAssistApprovedForExactModelConfig?: boolean | null;
  telemetrySinkPrivacyApproved?: boolean | null;
  communityPublishingApprovedForExactGovernance?: boolean | null;
};

export type CampOpsRestrictedFieldTestActivationResult = {
  enabled: boolean;
  riskAccepted: boolean;
  testerApproved: boolean;
  buildApproved: boolean;
  labelsApproved: boolean;
  reason: string;
  rolloutConfig: CampOpsRecommendationRolloutConfig;
};

export const DEFAULT_CAMP_OPS_RECOMMENDATION_ROLLOUT_CONFIG: CampOpsRecommendationRolloutConfig = {
  campopsRecommendationsEnabled: false,
  campOpsRecommendationSetEnabled: false,
  campopsProviderAdaptersEnabled: false,
  campopsAiAssistEnabled: false,
  campopsEndpointRecommendationEnabled: false,
  campopsDecisionPointsEnabled: false,
  campopsDebriefCommunityPublishingEnabled: false,
  campopsSourceTransparencyEnabled: false,
  campopsProviderValidationShadowModeEnabled: false,
  campopsTelemetryEnabled: false,
};

const CAMP_OPS_INTERNAL_BETA_ALLOWED_FLAGS: Array<keyof CampOpsRecommendationRolloutConfig> = [
  'campopsRecommendationsEnabled',
  'campOpsRecommendationSetEnabled',
  'campopsEndpointRecommendationEnabled',
  'campopsDecisionPointsEnabled',
  'campopsSourceTransparencyEnabled',
  'campopsProviderValidationShadowModeEnabled',
];

function normalizedStringSet(values: string[] | null | undefined): Set<string> {
  return new Set((values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function testerMatchesAllowlist(input: CampOpsInternalBetaActivationInput): boolean {
  const tester = input.tester;
  if (!tester) return false;
  if (tester.approved === true) return true;
  const ids = normalizedStringSet(input.allowlistedTesterIds);
  const emails = normalizedStringSet(input.allowlistedEmails);
  const cohorts = normalizedStringSet(input.allowedCohorts);
  const testerId = tester.testerId?.trim().toLowerCase();
  const email = tester.email?.trim().toLowerCase();
  if (testerId && ids.has(testerId)) return true;
  if (email && emails.has(email)) return true;
  return (tester.cohorts ?? []).some((cohort) => cohorts.has(cohort.trim().toLowerCase()));
}

function valueMatchesApprovedLabel(value: string | null | undefined, approvedValues: string[] | null | undefined): boolean {
  const normalizedValue = value?.trim().toLowerCase();
  return Boolean(normalizedValue && normalizedStringSet(approvedValues).has(normalizedValue));
}

function testerMatchesApprovedCohort(
  tester: CampOpsInternalBetaTester | null | undefined,
  approvedCohorts: string[] | null | undefined,
): boolean {
  if (!tester) return false;
  if (tester.approved === true) return true;
  const cohorts = normalizedStringSet(approvedCohorts);
  return (tester.cohorts ?? []).some((cohort) => cohorts.has(cohort.trim().toLowerCase()));
}

function requestedFlag(
  flags: Partial<CampOpsRecommendationRolloutConfig> | null | undefined,
  feature: CampOpsRecommendationRolloutFeature,
): boolean {
  return flags?.[feature] === true;
}

export function resolveCampOpsRecommendationRolloutConfig(
  overrides: Partial<CampOpsRecommendationRolloutConfig> = {},
): CampOpsRecommendationRolloutConfig {
  const recommendationsEnabled = overrides.campopsRecommendationsEnabled ?? overrides.campOpsRecommendationSetEnabled ?? false;
  const endpointRecommendationEnabled =
    recommendationsEnabled && overrides.campopsEndpointRecommendationEnabled === true;
  return {
    ...DEFAULT_CAMP_OPS_RECOMMENDATION_ROLLOUT_CONFIG,
    ...overrides,
    campopsRecommendationsEnabled: recommendationsEnabled,
    campOpsRecommendationSetEnabled: recommendationsEnabled,
    campopsProviderAdaptersEnabled: recommendationsEnabled && overrides.campopsProviderAdaptersEnabled === true,
    campopsAiAssistEnabled: recommendationsEnabled && overrides.campopsAiAssistEnabled === true,
    campopsEndpointRecommendationEnabled: endpointRecommendationEnabled,
    campopsDecisionPointsEnabled: endpointRecommendationEnabled && overrides.campopsDecisionPointsEnabled === true,
    campopsSourceTransparencyEnabled: recommendationsEnabled && overrides.campopsSourceTransparencyEnabled === true,
    campopsProviderValidationShadowModeEnabled:
      overrides.campopsProviderValidationShadowModeEnabled === true,
    campopsTelemetryEnabled: overrides.campopsTelemetryEnabled === true,
    campopsDebriefCommunityPublishingEnabled:
      overrides.campopsDebriefCommunityPublishingEnabled === true,
  };
}

export function resolveCampOpsInternalBetaActivation(
  input: CampOpsInternalBetaActivationInput = {},
): CampOpsInternalBetaActivationResult {
  const testerApproved = testerMatchesAllowlist(input);
  if (!testerApproved) {
    return {
      enabled: false,
      testerApproved: false,
      reason: 'CampOps internal beta is disabled because the tester is not approved for the cohort.',
      rolloutConfig: resolveCampOpsRecommendationRolloutConfig({}),
    };
  }

  const requested = input.requestedFlags ?? {};
  const safeRequested: Partial<CampOpsRecommendationRolloutConfig> = {};
  for (const flag of CAMP_OPS_INTERNAL_BETA_ALLOWED_FLAGS) {
    if (requestedFlag(requested, flag)) safeRequested[flag] = true;
  }
  if (input.providerInfluenceApproved === true && requestedFlag(requested, 'campopsProviderAdaptersEnabled')) {
    safeRequested.campopsProviderAdaptersEnabled = true;
  }
  if (input.aiAssistRealOutputReviewApproved === true && requestedFlag(requested, 'campopsAiAssistEnabled')) {
    safeRequested.campopsAiAssistEnabled = true;
  }
  safeRequested.campopsTelemetryEnabled =
    input.telemetrySinkPrivacyApproved === true &&
    requestedFlag(requested, 'campopsTelemetryEnabled');
  safeRequested.campopsDebriefCommunityPublishingEnabled =
    input.communityPublishingApproved === true &&
    requestedFlag(requested, 'campopsDebriefCommunityPublishingEnabled');

  const rolloutConfig = resolveCampOpsRecommendationRolloutConfig(safeRequested);
  return {
    enabled: rolloutConfig.campopsRecommendationsEnabled,
    testerApproved: true,
    reason: rolloutConfig.campopsRecommendationsEnabled
      ? 'CampOps internal beta is enabled for the approved tester cohort.'
      : 'Tester is approved, but CampOps recommendation flags were not requested.',
    rolloutConfig,
  };
}

export function rollbackCampOpsInternalBetaActivation(): CampOpsInternalBetaActivationResult {
  return {
    enabled: false,
    testerApproved: false,
    reason: 'CampOps internal beta rollback disabled all CampOps beta surfaces.',
    rolloutConfig: resolveCampOpsRecommendationRolloutConfig({}),
  };
}

export function resolveCampOpsRiskAcceptedRestrictedFieldTestActivation(
  input: CampOpsRestrictedFieldTestActivationInput = {},
): CampOpsRestrictedFieldTestActivationResult {
  const riskAccepted = input.riskAcceptanceAccepted === true;
  const testerApproved = testerMatchesApprovedCohort(input.tester, input.approvedCohorts);
  const buildApproved = valueMatchesApprovedLabel(input.buildIdentifier, input.approvedBuildIdentifiers);
  const labelsApproved =
    valueMatchesApprovedLabel(input.regionLabel, input.approvedRegionLabels) &&
    valueMatchesApprovedLabel(input.routeLabel, input.approvedRouteLabels) &&
    valueMatchesApprovedLabel(input.scenarioLabel, input.approvedScenarioLabels);

  if (!riskAccepted) {
    return {
      enabled: false,
      riskAccepted: false,
      testerApproved,
      buildApproved,
      labelsApproved,
      reason: 'CampOps restricted field test is disabled because risk acceptance is not accepted.',
      rolloutConfig: resolveCampOpsRecommendationRolloutConfig({}),
    };
  }

  if (!testerApproved) {
    return {
      enabled: false,
      riskAccepted: true,
      testerApproved: false,
      buildApproved,
      labelsApproved,
      reason: 'CampOps restricted field test is disabled because the tester is outside the approved cohort.',
      rolloutConfig: resolveCampOpsRecommendationRolloutConfig({}),
    };
  }

  if (!buildApproved) {
    return {
      enabled: false,
      riskAccepted: true,
      testerApproved: true,
      buildApproved: false,
      labelsApproved,
      reason: 'CampOps restricted field test is disabled because the build identifier is not approved.',
      rolloutConfig: resolveCampOpsRecommendationRolloutConfig({}),
    };
  }

  if (!labelsApproved) {
    return {
      enabled: false,
      riskAccepted: true,
      testerApproved: true,
      buildApproved: true,
      labelsApproved: false,
      reason: 'CampOps restricted field test is disabled because the region, route, or scenario label is not approved.',
      rolloutConfig: resolveCampOpsRecommendationRolloutConfig({}),
    };
  }

  const requested = input.requestedFlags ?? {};
  const delayedDayScenarioApproved = valueMatchesApprovedLabel(
    input.scenarioLabel,
    input.approvedDelayedDayScenarioLabels,
  );
  const safeRequested: Partial<CampOpsRecommendationRolloutConfig> = {
    campopsRecommendationsEnabled: true,
    campOpsRecommendationSetEnabled: true,
    campopsSourceTransparencyEnabled: true,
    campopsProviderValidationShadowModeEnabled: true,
    campopsEndpointRecommendationEnabled:
      delayedDayScenarioApproved && requestedFlag(requested, 'campopsEndpointRecommendationEnabled'),
    campopsDecisionPointsEnabled:
      delayedDayScenarioApproved &&
      input.routeProgressSupportsDecisionPointReview === true &&
      requestedFlag(requested, 'campopsDecisionPointsEnabled'),
    campopsProviderAdaptersEnabled:
      input.providerInfluenceApprovedForExactCategoryRegion === true &&
      requestedFlag(requested, 'campopsProviderAdaptersEnabled'),
    campopsAiAssistEnabled:
      input.aiAssistApprovedForExactModelConfig === true &&
      requestedFlag(requested, 'campopsAiAssistEnabled'),
    campopsTelemetryEnabled:
      input.telemetrySinkPrivacyApproved === true &&
      requestedFlag(requested, 'campopsTelemetryEnabled'),
    campopsDebriefCommunityPublishingEnabled:
      input.communityPublishingApprovedForExactGovernance === true &&
      requestedFlag(requested, 'campopsDebriefCommunityPublishingEnabled'),
  };

  const rolloutConfig = resolveCampOpsRecommendationRolloutConfig(safeRequested);
  return {
    enabled: rolloutConfig.campopsRecommendationsEnabled,
    riskAccepted: true,
    testerApproved: true,
    buildApproved: true,
    labelsApproved: true,
    reason: 'CampOps restricted field test is enabled for the approved risk-accepted cohort, labels, and build posture.',
    rolloutConfig,
  };
}

export function resolveCampOpsRestrictedFieldTestActivation(
  input: CampOpsRestrictedFieldTestActivationInput = {},
): CampOpsRestrictedFieldTestActivationResult {
  return resolveCampOpsRiskAcceptedRestrictedFieldTestActivation(input);
}

export function getCampOpsFeatureState(
  overrides: Partial<CampOpsRecommendationRolloutConfig> = {},
): CampOpsFeatureState {
  const config = resolveCampOpsRecommendationRolloutConfig(overrides);
  return {
    ...config,
    recommendationsEnabled: config.campopsRecommendationsEnabled,
    providerAdaptersEnabled: config.campopsProviderAdaptersEnabled,
    aiAssistEnabled: config.campopsAiAssistEnabled,
    endpointRecommendationEnabled: config.campopsEndpointRecommendationEnabled,
    decisionPointsEnabled: config.campopsDecisionPointsEnabled,
    debriefCommunityPublishingEnabled: config.campopsDebriefCommunityPublishingEnabled,
    sourceTransparencyEnabled: config.campopsSourceTransparencyEnabled,
    providerValidationShadowModeEnabled: config.campopsProviderValidationShadowModeEnabled,
    telemetryEnabled: config.campopsTelemetryEnabled,
  };
}

export function assertCampOpsFeatureEnabled(
  overrides: Partial<CampOpsRecommendationRolloutConfig> = {},
  feature: CampOpsRecommendationRolloutFeature,
): CampOpsFeatureState {
  const state = getCampOpsFeatureState(overrides);
  if (!state[feature]) {
    throw new Error(`CampOps feature ${feature} is disabled for this rollout.`);
  }
  return state;
}

export function isCampOpsRecommendationFeatureEnabled(
  config: CampOpsRecommendationRolloutConfig,
  feature: CampOpsRecommendationRolloutFeature,
): boolean {
  return config[feature] === true;
}

export function isCampOpsAiAssistFeatureEnabled(
  overrides: Partial<CampOpsRecommendationRolloutConfig> = {},
): boolean {
  return getCampOpsFeatureState(overrides).aiAssistEnabled;
}

export function isCampOpsDebriefCommunityPublishingFeatureEnabled(
  overrides: Partial<CampOpsRecommendationRolloutConfig> = {},
): boolean {
  return getCampOpsFeatureState(overrides).debriefCommunityPublishingEnabled;
}

function readBooleanFlag(name: string): boolean {
  const globalValue = (globalThis as Record<string, unknown> | undefined)?.[`__${name}__`];
  if (globalValue === true || globalValue === 'true' || globalValue === '1') return true;
  if (typeof process !== 'undefined') {
    const env = (process as { env?: Record<string, string | undefined> }).env;
    const value = env?.[name] ?? env?.[`EXPO_PUBLIC_${name}`];
    return value === 'true' || value === '1';
  }
  return false;
}

export function isCampOpsInternalBetaFeatureEnabled(): boolean {
  return (
    readBooleanFlag('ENABLE_CAMPOPS_INTERNAL_BETA') ||
    readBooleanFlag('ECS_CAMPOPS_INTERNAL_BETA')
  );
}

export function getCampOpsInternalBetaStatusLine(): string {
  return isCampOpsInternalBetaFeatureEnabled()
    ? 'CampOps internal beta: enabled for this build/session; closed field-test gates still apply.'
    : 'CampOps internal beta: disabled; route pins, Camp Intel, and CampOps scoring are inactive.';
}

export function isCampOpsRoutePinsFeatureEnabled(): boolean {
  return isCampOpsInternalBetaFeatureEnabled();
}

export function getCampOpsRoutePinsRolloutConfig(): Partial<CampOpsRecommendationRolloutConfig> {
  if (!isCampOpsRoutePinsFeatureEnabled()) return {};
  return {
    campopsRecommendationsEnabled: true,
    campOpsRecommendationSetEnabled: true,
    campopsSourceTransparencyEnabled: true,
  };
}

export type CampOpsRecommendationConfig = {
  minimumPrimaryScore: number;
  minimumOverallScore: number;
  minimumTerrainScore: number;
  minimumAccessScore: number;
  minimumLegalSourceScore: number;
  minimumCampSuitabilityScore: number;
  minimumEmergencySafetyScore: number;
  plannedCampRetentionScoreDelta: number;
  backupMeaningfulDistanceMiles: number;
  weatherFallbackMinimumWeatherScore: number;
  trailerSafeMinimumTrailerScore: number;
  resupplyMinimumResourceScore: number;
  noGoodCampWarningScore: number;
  routeCandidateLimit: number;
  duplicateCandidateRadiusMiles: number;
  sourcePreferenceScoreDelta: number;
};

export const DEFAULT_CAMP_OPS_RECOMMENDATION_CONFIG: CampOpsRecommendationConfig = {
  minimumPrimaryScore: 70,
  minimumOverallScore: 70,
  minimumTerrainScore: 70,
  minimumAccessScore: 70,
  minimumLegalSourceScore: 70,
  minimumCampSuitabilityScore: 70,
  minimumEmergencySafetyScore: 68,
  plannedCampRetentionScoreDelta: 8,
  backupMeaningfulDistanceMiles: 0.5,
  weatherFallbackMinimumWeatherScore: 70,
  trailerSafeMinimumTrailerScore: 80,
  resupplyMinimumResourceScore: 76,
  noGoodCampWarningScore: 70,
  routeCandidateLimit: 5,
  duplicateCandidateRadiusMiles: 0.12,
  sourcePreferenceScoreDelta: 5,
};

export function resolveCampOpsRecommendationConfig(
  overrides: Partial<CampOpsRecommendationConfig> = {},
): CampOpsRecommendationConfig {
  return {
    ...DEFAULT_CAMP_OPS_RECOMMENDATION_CONFIG,
    ...overrides,
  };
}
