import type { TerrainWarningType } from '../terrainAnalysisEngine';

export type CampsiteMode = 'strict' | 'balanced' | 'relaxed';
export type CampsiteCredibilityTier = 'standard' | 'broader' | 'possible_stop';
export type CampsiteTerrainBlockMode =
  | 'hard_exclusion'
  | 'mixed'
  | 'penalty_only_except_impossible';
export type CampsiteRemotenessMode =
  | 'preferred_band'
  | 'soft_preference'
  | 'contextual_bonus_only';

export enum CampsiteFallbackStage {
  None = 0,
  LowerScoreSlightly = 1,
  ExpandRouteDistance = 2,
  ConvertSomeTerrainBlocksToPenalties = 3,
  ReduceRemotenessStrictness = 4,
  LowerScoreModerately = 5,
}

export interface CampsiteDetectionThresholds {
  maxElevationGainFt: number;
  routeStartExclusion: number;
  routeEndExclusion: number;
  minCandidateDistanceMi: number;
  minCandidateSegmentSpacing: number;
  disqualifyingWarnings: TerrainWarningType[];
}

export interface CampsiteScoringThresholds {
  idealTimingMinHrs: number;
  idealTimingMaxHrs: number;
  acceptableTimingMinHrs: number;
  acceptableTimingMaxHrs: number;
  tooEarlyThreshold: number;
  tooLateThreshold: number;
  tooEarlyPenalty: number;
  tooLatePenalty: number;
  shortRouteReduction: number;
  overnightReduction: number;
  mountainPassPenaltyWindow: number;
  highElevationPenaltyWindow: number;
  routeDistanceLimitMiles: number;
  minScoreNormalized: number;
  terrainBlockMode: CampsiteTerrainBlockMode;
  remotenessMode: CampsiteRemotenessMode;
}

export interface CampsiteFallbackStageDefinition {
  stage: CampsiteFallbackStage;
  mode: CampsiteMode;
  credibilityTier: CampsiteCredibilityTier;
  label: string;
  uiNotice: string | null;
  detection: CampsiteDetectionThresholds;
  scoring: CampsiteScoringThresholds;
}

export const DEFAULT_CAMPSITE_MODE: CampsiteMode = 'balanced';

export const CAMPSITE_HEALTHY_MIN_RESULTS = 6;
export const CAMPSITE_ACCEPTABLE_MIN_RESULTS = 3;
export const CAMPSITE_LOW_RESULTS_TRIGGER = 2;
export const CAMPSITE_EMPTY_RESULTS_TRIGGER = 0;

export const CAMPSITE_ROUTE_DISTANCE_MI_STRICT = 3;
export const CAMPSITE_ROUTE_DISTANCE_MI_BALANCED = 6;
export const CAMPSITE_ROUTE_DISTANCE_MI_RELAXED = 10;

export const CAMPSITE_MIN_SCORE_STRICT = 0.74;
export const CAMPSITE_MIN_SCORE_BALANCED = 0.64;
export const CAMPSITE_MIN_SCORE_RELAXED = 0.52;

export const CAMPSITE_TERRAIN_BLOCK_MODE_STRICT: CampsiteTerrainBlockMode = 'hard_exclusion';
export const CAMPSITE_TERRAIN_BLOCK_MODE_BALANCED: CampsiteTerrainBlockMode = 'mixed';
export const CAMPSITE_TERRAIN_BLOCK_MODE_RELAXED: CampsiteTerrainBlockMode =
  'penalty_only_except_impossible';

export const CAMPSITE_REMOTENESS_MODE_STRICT: CampsiteRemotenessMode = 'preferred_band';
export const CAMPSITE_REMOTENESS_MODE_BALANCED: CampsiteRemotenessMode = 'soft_preference';
export const CAMPSITE_REMOTENESS_MODE_RELAXED: CampsiteRemotenessMode = 'contextual_bonus_only';

// Global campsite marker cap. Route/polygon locators apply this before map payloads,
// and renderers enforce the same cap defensively.
export const MAX_CAMPSITE_MARKERS = 5;
export const CAMPSITE_MAX_MARKERS_RENDERED = MAX_CAMPSITE_MARKERS;
export const CAMPSITE_MAX_HIGH_CONFIDENCE_MARKERS = MAX_CAMPSITE_MARKERS;
export const CAMPSITE_SCORE_REFERENCE_MAX = 10;

export const CAMPSITE_UI_NOTICE_BROADER = 'Showing broader campsite candidates along route';
export const CAMPSITE_UI_NOTICE_LOWER_CONFIDENCE =
  'Including lower-confidence route-adjacent camp options';

function createDetectionThresholds(args: {
  maxElevationGainFt: number;
  routeStartExclusion: number;
  routeEndExclusion: number;
  minCandidateDistanceMi: number;
  minCandidateSegmentSpacing: number;
  disqualifyingWarnings: TerrainWarningType[];
}): CampsiteDetectionThresholds {
  return args;
}

function createScoringThresholds(args: {
  idealTimingMinHrs: number;
  idealTimingMaxHrs: number;
  acceptableTimingMinHrs: number;
  acceptableTimingMaxHrs: number;
  tooEarlyThreshold: number;
  tooLateThreshold: number;
  tooEarlyPenalty: number;
  tooLatePenalty: number;
  shortRouteReduction: number;
  overnightReduction: number;
  mountainPassPenaltyWindow: number;
  highElevationPenaltyWindow: number;
  routeDistanceLimitMiles: number;
  minScoreNormalized: number;
  terrainBlockMode: CampsiteTerrainBlockMode;
  remotenessMode: CampsiteRemotenessMode;
}): CampsiteScoringThresholds {
  return args;
}

export const CAMPSITE_FALLBACK_STAGES: CampsiteFallbackStageDefinition[] = [
  {
    stage: CampsiteFallbackStage.None,
    mode: 'strict',
    credibilityTier: 'standard',
    label: 'baseline_strict_curation',
    uiNotice: null,
    detection: createDetectionThresholds({
      maxElevationGainFt: 150,
      routeStartExclusion: 0.2,
      routeEndExclusion: 0.1,
      minCandidateDistanceMi: 8,
      minCandidateSegmentSpacing: 2,
      disqualifyingWarnings: ['STEEP_GRADE', 'MOUNTAIN_PASS'],
    }),
    scoring: createScoringThresholds({
      idealTimingMinHrs: 6,
      idealTimingMaxHrs: 10,
      acceptableTimingMinHrs: 4,
      acceptableTimingMaxHrs: 12,
      tooEarlyThreshold: 0.35,
      tooLateThreshold: 0.9,
      tooEarlyPenalty: -4,
      tooLatePenalty: -4,
      shortRouteReduction: -3,
      overnightReduction: -3,
      mountainPassPenaltyWindow: 1,
      highElevationPenaltyWindow: 1,
      routeDistanceLimitMiles: CAMPSITE_ROUTE_DISTANCE_MI_STRICT,
      minScoreNormalized: CAMPSITE_MIN_SCORE_STRICT,
      terrainBlockMode: CAMPSITE_TERRAIN_BLOCK_MODE_STRICT,
      remotenessMode: CAMPSITE_REMOTENESS_MODE_STRICT,
    }),
  },
  {
    stage: CampsiteFallbackStage.LowerScoreSlightly,
    mode: 'balanced',
    credibilityTier: 'broader',
    label: 'lower_score_slightly',
    uiNotice: CAMPSITE_UI_NOTICE_LOWER_CONFIDENCE,
    detection: createDetectionThresholds({
      maxElevationGainFt: 150,
      routeStartExclusion: 0.2,
      routeEndExclusion: 0.1,
      minCandidateDistanceMi: 8,
      minCandidateSegmentSpacing: 2,
      disqualifyingWarnings: ['STEEP_GRADE', 'MOUNTAIN_PASS'],
    }),
    scoring: createScoringThresholds({
      idealTimingMinHrs: 5.5,
      idealTimingMaxHrs: 10.5,
      acceptableTimingMinHrs: 3.5,
      acceptableTimingMaxHrs: 12.5,
      tooEarlyThreshold: 0.32,
      tooLateThreshold: 0.92,
      tooEarlyPenalty: -3,
      tooLatePenalty: -3,
      shortRouteReduction: -2,
      overnightReduction: -2,
      mountainPassPenaltyWindow: 1,
      highElevationPenaltyWindow: 1,
      routeDistanceLimitMiles: CAMPSITE_ROUTE_DISTANCE_MI_STRICT,
      minScoreNormalized: CAMPSITE_MIN_SCORE_BALANCED,
      terrainBlockMode: CAMPSITE_TERRAIN_BLOCK_MODE_STRICT,
      remotenessMode: CAMPSITE_REMOTENESS_MODE_STRICT,
    }),
  },
  {
    stage: CampsiteFallbackStage.ExpandRouteDistance,
    mode: 'balanced',
    credibilityTier: 'broader',
    label: 'expand_route_distance',
    uiNotice: CAMPSITE_UI_NOTICE_BROADER,
    detection: createDetectionThresholds({
      maxElevationGainFt: 160,
      routeStartExclusion: 0.17,
      routeEndExclusion: 0.08,
      minCandidateDistanceMi: 6,
      minCandidateSegmentSpacing: 1,
      disqualifyingWarnings: ['STEEP_GRADE', 'MOUNTAIN_PASS'],
    }),
    scoring: createScoringThresholds({
      idealTimingMinHrs: 5,
      idealTimingMaxHrs: 11,
      acceptableTimingMinHrs: 3.5,
      acceptableTimingMaxHrs: 13,
      tooEarlyThreshold: 0.3,
      tooLateThreshold: 0.93,
      tooEarlyPenalty: -3,
      tooLatePenalty: -2,
      shortRouteReduction: -2,
      overnightReduction: -2,
      mountainPassPenaltyWindow: 1,
      highElevationPenaltyWindow: 1,
      routeDistanceLimitMiles: CAMPSITE_ROUTE_DISTANCE_MI_BALANCED,
      minScoreNormalized: CAMPSITE_MIN_SCORE_BALANCED,
      terrainBlockMode: CAMPSITE_TERRAIN_BLOCK_MODE_STRICT,
      remotenessMode: CAMPSITE_REMOTENESS_MODE_STRICT,
    }),
  },
  {
    stage: CampsiteFallbackStage.ConvertSomeTerrainBlocksToPenalties,
    mode: 'balanced',
    credibilityTier: 'broader',
    label: 'terrain_blocks_to_penalties',
    uiNotice: CAMPSITE_UI_NOTICE_BROADER,
    detection: createDetectionThresholds({
      maxElevationGainFt: 190,
      routeStartExclusion: 0.15,
      routeEndExclusion: 0.07,
      minCandidateDistanceMi: 6,
      minCandidateSegmentSpacing: 1,
      disqualifyingWarnings: ['MOUNTAIN_PASS'],
    }),
    scoring: createScoringThresholds({
      idealTimingMinHrs: 4.75,
      idealTimingMaxHrs: 11.5,
      acceptableTimingMinHrs: 3,
      acceptableTimingMaxHrs: 13.25,
      tooEarlyThreshold: 0.28,
      tooLateThreshold: 0.94,
      tooEarlyPenalty: -2,
      tooLatePenalty: -2,
      shortRouteReduction: -1,
      overnightReduction: -1,
      mountainPassPenaltyWindow: 1,
      highElevationPenaltyWindow: 0,
      routeDistanceLimitMiles: CAMPSITE_ROUTE_DISTANCE_MI_BALANCED,
      minScoreNormalized: CAMPSITE_MIN_SCORE_BALANCED,
      terrainBlockMode: CAMPSITE_TERRAIN_BLOCK_MODE_BALANCED,
      remotenessMode: CAMPSITE_REMOTENESS_MODE_BALANCED,
    }),
  },
  {
    stage: CampsiteFallbackStage.ReduceRemotenessStrictness,
    mode: 'relaxed',
    credibilityTier: 'broader',
    label: 'reduce_remoteness_strictness',
    uiNotice: CAMPSITE_UI_NOTICE_BROADER,
    detection: createDetectionThresholds({
      maxElevationGainFt: 210,
      routeStartExclusion: 0.13,
      routeEndExclusion: 0.06,
      minCandidateDistanceMi: 5,
      minCandidateSegmentSpacing: 1,
      disqualifyingWarnings: ['MOUNTAIN_PASS'],
    }),
    scoring: createScoringThresholds({
      idealTimingMinHrs: 4.5,
      idealTimingMaxHrs: 11.75,
      acceptableTimingMinHrs: 2.75,
      acceptableTimingMaxHrs: 13.5,
      tooEarlyThreshold: 0.25,
      tooLateThreshold: 0.95,
      tooEarlyPenalty: -2,
      tooLatePenalty: -1,
      shortRouteReduction: -1,
      overnightReduction: -1,
      mountainPassPenaltyWindow: 0,
      highElevationPenaltyWindow: 0,
      routeDistanceLimitMiles: CAMPSITE_ROUTE_DISTANCE_MI_BALANCED,
      minScoreNormalized: CAMPSITE_MIN_SCORE_BALANCED,
      terrainBlockMode: CAMPSITE_TERRAIN_BLOCK_MODE_RELAXED,
      remotenessMode: CAMPSITE_REMOTENESS_MODE_RELAXED,
    }),
  },
  {
    stage: CampsiteFallbackStage.LowerScoreModerately,
    mode: 'relaxed',
    credibilityTier: 'possible_stop',
    label: 'lower_score_moderately',
    uiNotice: CAMPSITE_UI_NOTICE_LOWER_CONFIDENCE,
    detection: createDetectionThresholds({
      maxElevationGainFt: 230,
      routeStartExclusion: 0.12,
      routeEndExclusion: 0.05,
      minCandidateDistanceMi: 5,
      minCandidateSegmentSpacing: 1,
      disqualifyingWarnings: ['MOUNTAIN_PASS'],
    }),
    scoring: createScoringThresholds({
      idealTimingMinHrs: 4,
      idealTimingMaxHrs: 12,
      acceptableTimingMinHrs: 2.5,
      acceptableTimingMaxHrs: 13.5,
      tooEarlyThreshold: 0.24,
      tooLateThreshold: 0.96,
      tooEarlyPenalty: -2,
      tooLatePenalty: -1,
      shortRouteReduction: 0,
      overnightReduction: -1,
      mountainPassPenaltyWindow: 0,
      highElevationPenaltyWindow: 0,
      routeDistanceLimitMiles: CAMPSITE_ROUTE_DISTANCE_MI_RELAXED,
      minScoreNormalized: CAMPSITE_MIN_SCORE_RELAXED,
      terrainBlockMode: CAMPSITE_TERRAIN_BLOCK_MODE_RELAXED,
      remotenessMode: CAMPSITE_REMOTENESS_MODE_RELAXED,
    }),
  },
];

export function getCampsiteFallbackStageDefinition(stage: number): CampsiteFallbackStageDefinition {
  return (
    CAMPSITE_FALLBACK_STAGES.find((definition) => definition.stage === stage) ??
    CAMPSITE_FALLBACK_STAGES[CAMPSITE_FALLBACK_STAGES.length - 1]
  );
}

export function getMaxCampsiteFallbackStage(strictCount: number): CampsiteFallbackStage {
  if (strictCount > CAMPSITE_LOW_RESULTS_TRIGGER) {
    return CampsiteFallbackStage.None;
  }
  if (strictCount > CAMPSITE_EMPTY_RESULTS_TRIGGER) {
    return CampsiteFallbackStage.ReduceRemotenessStrictness;
  }
  return CampsiteFallbackStage.LowerScoreModerately;
}

export function normalizeCampsiteScore(score: number | null | undefined): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(1, (score as number) / CAMPSITE_SCORE_REFERENCE_MAX));
}

export function denormalizeCampsiteScore(score: number): number {
  return Math.round(score * CAMPSITE_SCORE_REFERENCE_MAX * 10) / 10;
}

export function resolveCampsiteRouteDistanceLimitMiles(stage: number): number {
  return getCampsiteFallbackStageDefinition(stage).scoring.routeDistanceLimitMiles;
}
