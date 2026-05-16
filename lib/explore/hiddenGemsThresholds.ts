export type HiddenGemsMode = 'strict' | 'balanced' | 'relaxed';
export type HiddenGemsTripTypeMatchMode =
  | 'primary_only'
  | 'primary_or_strong_secondary'
  | 'primary_or_secondary';

export enum HiddenGemsFallbackStage {
  None = 0,
  LowerScoreSlightly = 1,
  ExpandRadiusSlightly = 2,
  AllowSecondaryTripType = 3,
  LowerScoreModerately = 4,
  ExpandRadiusModerately = 5,
}

export interface HiddenGemsThresholdProfile {
  mode: HiddenGemsMode;
  radiusTolerance: number;
  minScoreNormalized: number;
  popularityPenaltyStrength: number;
  tripTypeMatchMode: HiddenGemsTripTypeMatchMode;
}

export interface HiddenGemsFallbackStageDefinition extends HiddenGemsThresholdProfile {
  stage: HiddenGemsFallbackStage;
  label: string;
  uiNotice: string | null;
}

export const DEFAULT_HIDDEN_GEMS_MODE: HiddenGemsMode = 'balanced';

export const HIDDEN_GEMS_HEALTHY_MIN_RESULTS = 20;
export const HIDDEN_GEMS_ACCEPTABLE_MIN_RESULTS = 10;
export const HIDDEN_GEMS_LOW_RESULTS_TRIGGER = 10;
export const HIDDEN_GEMS_EMPTY_RESULTS_TRIGGER = 0;

export const HIDDEN_GEMS_RADIUS_TOLERANCE_STRICT = 1.0;
export const HIDDEN_GEMS_RADIUS_TOLERANCE_BALANCED = 1.0;
export const HIDDEN_GEMS_RADIUS_TOLERANCE_RELAXED = 1.0;

export const HIDDEN_GEMS_MIN_SCORE_STRICT = 0.7;
export const HIDDEN_GEMS_MIN_SCORE_BALANCED = 0.5;
export const HIDDEN_GEMS_MIN_SCORE_RELAXED = 0.3;

export const HIDDEN_GEMS_POPULARITY_PENALTY_STRICT = 1.0;
export const HIDDEN_GEMS_POPULARITY_PENALTY_BALANCED = 0.5;
export const HIDDEN_GEMS_POPULARITY_PENALTY_RELAXED = 0.25;

export const HIDDEN_GEMS_TRIP_TYPE_MATCH_STRICT: HiddenGemsTripTypeMatchMode = 'primary_only';
export const HIDDEN_GEMS_TRIP_TYPE_MATCH_BALANCED: HiddenGemsTripTypeMatchMode =
  'primary_or_strong_secondary';
export const HIDDEN_GEMS_TRIP_TYPE_MATCH_RELAXED: HiddenGemsTripTypeMatchMode =
  'primary_or_secondary';

export const HIDDEN_GEMS_MAX_RESULTS_RENDERED = 100;

export const HIDDEN_GEMS_UI_NOTICE_EXPANDED =
  'Expanded search criteria to surface more nearby Hidden Gems';
export const HIDDEN_GEMS_UI_NOTICE_BROADER = 'Showing broader Hidden Gems matches';

export const HIDDEN_GEMS_PROFILES: Record<HiddenGemsMode, HiddenGemsThresholdProfile> = {
  strict: {
    mode: 'strict',
    radiusTolerance: HIDDEN_GEMS_RADIUS_TOLERANCE_STRICT,
    minScoreNormalized: HIDDEN_GEMS_MIN_SCORE_STRICT,
    popularityPenaltyStrength: HIDDEN_GEMS_POPULARITY_PENALTY_STRICT,
    tripTypeMatchMode: HIDDEN_GEMS_TRIP_TYPE_MATCH_STRICT,
  },
  balanced: {
    mode: 'balanced',
    radiusTolerance: HIDDEN_GEMS_RADIUS_TOLERANCE_BALANCED,
    minScoreNormalized: HIDDEN_GEMS_MIN_SCORE_BALANCED,
    popularityPenaltyStrength: HIDDEN_GEMS_POPULARITY_PENALTY_BALANCED,
    tripTypeMatchMode: HIDDEN_GEMS_TRIP_TYPE_MATCH_BALANCED,
  },
  relaxed: {
    mode: 'relaxed',
    radiusTolerance: HIDDEN_GEMS_RADIUS_TOLERANCE_RELAXED,
    minScoreNormalized: HIDDEN_GEMS_MIN_SCORE_RELAXED,
    popularityPenaltyStrength: HIDDEN_GEMS_POPULARITY_PENALTY_RELAXED,
    tripTypeMatchMode: HIDDEN_GEMS_TRIP_TYPE_MATCH_RELAXED,
  },
};

export const HIDDEN_GEMS_FALLBACK_STAGES: HiddenGemsFallbackStageDefinition[] = [
  {
    stage: HiddenGemsFallbackStage.None,
    label: 'baseline_strict_curation',
    uiNotice: null,
    ...HIDDEN_GEMS_PROFILES.strict,
  },
  {
    stage: HiddenGemsFallbackStage.LowerScoreSlightly,
    label: 'lower_score_slightly',
    uiNotice: HIDDEN_GEMS_UI_NOTICE_EXPANDED,
    mode: 'balanced',
    radiusTolerance: HIDDEN_GEMS_RADIUS_TOLERANCE_STRICT,
    minScoreNormalized: HIDDEN_GEMS_MIN_SCORE_BALANCED,
    popularityPenaltyStrength: HIDDEN_GEMS_POPULARITY_PENALTY_BALANCED,
    tripTypeMatchMode: HIDDEN_GEMS_TRIP_TYPE_MATCH_STRICT,
  },
  {
    stage: HiddenGemsFallbackStage.ExpandRadiusSlightly,
    label: 'expand_radius_slightly',
    uiNotice: HIDDEN_GEMS_UI_NOTICE_EXPANDED,
    mode: 'balanced',
    radiusTolerance: HIDDEN_GEMS_RADIUS_TOLERANCE_BALANCED,
    minScoreNormalized: HIDDEN_GEMS_MIN_SCORE_BALANCED,
    popularityPenaltyStrength: HIDDEN_GEMS_POPULARITY_PENALTY_BALANCED,
    tripTypeMatchMode: HIDDEN_GEMS_TRIP_TYPE_MATCH_STRICT,
  },
  {
    stage: HiddenGemsFallbackStage.AllowSecondaryTripType,
    label: 'allow_secondary_trip_type',
    uiNotice: HIDDEN_GEMS_UI_NOTICE_BROADER,
    ...HIDDEN_GEMS_PROFILES.balanced,
  },
  {
    stage: HiddenGemsFallbackStage.LowerScoreModerately,
    label: 'lower_score_moderately',
    uiNotice: HIDDEN_GEMS_UI_NOTICE_BROADER,
    mode: 'relaxed',
    radiusTolerance: HIDDEN_GEMS_RADIUS_TOLERANCE_BALANCED,
    minScoreNormalized: HIDDEN_GEMS_MIN_SCORE_RELAXED,
    popularityPenaltyStrength: HIDDEN_GEMS_POPULARITY_PENALTY_RELAXED,
    tripTypeMatchMode: HIDDEN_GEMS_TRIP_TYPE_MATCH_RELAXED,
  },
  {
    stage: HiddenGemsFallbackStage.ExpandRadiusModerately,
    label: 'expand_radius_moderately',
    uiNotice: HIDDEN_GEMS_UI_NOTICE_BROADER,
    ...HIDDEN_GEMS_PROFILES.relaxed,
  },
];

export function getHiddenGemsThresholdProfile(mode: HiddenGemsMode): HiddenGemsThresholdProfile {
  return HIDDEN_GEMS_PROFILES[mode];
}

export function getHiddenGemsFallbackStageDefinition(
  stage: number,
): HiddenGemsFallbackStageDefinition {
  return (
    HIDDEN_GEMS_FALLBACK_STAGES.find((definition) => definition.stage === stage) ??
    HIDDEN_GEMS_FALLBACK_STAGES[HIDDEN_GEMS_FALLBACK_STAGES.length - 1]
  );
}

export function resolveHiddenGemsEffectiveRadiusMiles(radiusMiles: number, stage: number): number {
  const safeRadiusMiles = Number.isFinite(radiusMiles) && radiusMiles > 0 ? radiusMiles : 500;
  const thresholds = getHiddenGemsFallbackStageDefinition(stage);
  return Math.round(safeRadiusMiles * thresholds.radiusTolerance * 10) / 10;
}

export function resolveHiddenGemsFallbackMode(stage: number): HiddenGemsMode {
  return getHiddenGemsFallbackStageDefinition(stage).mode;
}

export function resolveHiddenGemsTripTypeFitFloor(mode: HiddenGemsTripTypeMatchMode): number {
  switch (mode) {
    case 'primary_only':
      return 72;
    case 'primary_or_strong_secondary':
      return 48;
    case 'primary_or_secondary':
    default:
      return 20;
  }
}

export function normalizeHiddenGemsScore(score: number | null | undefined): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, (score as number) / 100));
}

export function resolveHiddenGemsMaxFallbackStage(strictCount: number): HiddenGemsFallbackStage {
  if (strictCount >= HIDDEN_GEMS_HEALTHY_MIN_RESULTS) {
    return HiddenGemsFallbackStage.None;
  }
  if (strictCount >= HIDDEN_GEMS_ACCEPTABLE_MIN_RESULTS) {
    return HiddenGemsFallbackStage.AllowSecondaryTripType;
  }
  return HiddenGemsFallbackStage.ExpandRadiusModerately;
}
