import type { CampsiteRatingFactor } from './campsiteRatingTypes';
import {
  evaluateLegacyCampHardGateSignals,
  type CampOpsLegacySafetyScoreKey,
} from '../campops/campOpsLegacyCompatibility';
import type { CampHardGateResult } from '../campops/campOpsTypes';

export const MIN_CAMPSITE_CORE_SCORE = 70;
export const CAMPSITE_GOOD_FALLBACK_SCORE = 60;
export const CAMPSITE_POSSIBLE_FALLBACK_SCORE = 55;
export const CAMPSITE_LIMITED_CONFIDENCE_SCORE = 50;
export const MIN_CAMPSITE_SAFETY_SCORE = 50;

export type CampsiteViabilityTier =
  | 'preferred'
  | 'good'
  | 'possible'
  | 'limited_confidence'
  | 'rejected_safety';

export type CampsiteCoreScoreKey =
  | 'campSuitability'
  | 'terrainSuitability'
  | 'accessConfidence'
  | 'legalAccess';

export interface CampsiteCoreScoreEvaluation {
  isViable: boolean;
  scores: Record<CampsiteCoreScoreKey, number | null>;
  missingScoreNames: CampsiteCoreScoreKey[];
  belowThresholdScoreNames: CampsiteCoreScoreKey[];
  failingScoreNames: CampsiteCoreScoreKey[];
  tier: CampsiteViabilityTier;
  activeThreshold: number;
  confidenceLabel: 'Preferred' | 'Good' | 'Possible' | 'Limited confidence' | 'Rejected';
  safetyRejected: boolean;
  safetyRejectionReasons: string[];
  hardGateResults: CampHardGateResult[];
}

export interface CampsiteViabilityEvaluationOptions {
  source?: string | null;
  debugLog?: boolean;
  generationId?: string | null;
  routeIntelligenceId?: string | null;
  polygonId?: string | null;
  analysisLayer?: 'display_filter' | 'camp_intel' | 'standalone';
}

type ScoreDefinition = {
  key: CampsiteCoreScoreKey;
  aliases: string[];
  labelMatchers: RegExp[];
};

const SCORE_DEFINITIONS: ScoreDefinition[] = [
  {
    key: 'campSuitability',
    aliases: [
      'campSuitability',
      'campsiteSuitability',
      'camp_suitability',
      'campsite_suitability',
      'campingSuitability',
      'campingSuitabilityScore',
      'campabilityScore',
      'overnightSuitabilityScore',
      'scores.overnightSuitabilityScore',
      'scores.campSuitability',
      'scores.campsiteSuitability',
      'scoreBreakdown.campSuitability',
      'scoreBreakdown.campability',
    ],
    labelMatchers: [/camp(?:ing|site)?\s+suitability/i, /overnight\s+suitability/i],
  },
  {
    key: 'terrainSuitability',
    aliases: [
      'terrainSuitability',
      'terrain_suitability',
      'terrainScore',
      'terrain_score',
      'campabilityScore',
      'campability_score',
      'scores.campabilityScore',
      'scores.campabilityScore.raw',
      'scores.terrainSuitability',
      'scoreBreakdown.terrain',
      'scoreBreakdown.campability',
    ],
    labelMatchers: [/terrain\s+suitability/i, /campability/i],
  },
  {
    key: 'accessConfidence',
    aliases: [
      'accessConfidence',
      'access_confidence',
      'accessConfidenceScore',
      'access_confidence_score',
      'accessScore',
      'access_score',
      'scores.accessScore',
      'scores.accessScore.raw',
      'scoreBreakdown.access',
    ],
    labelMatchers: [/access\s+confidence/i],
  },
  {
    key: 'legalAccess',
    aliases: [
      'legalAccess',
      'legal_access',
      'legalAccessScore',
      'legal_access_score',
      'legalScore',
      'legalityScore',
      'complianceScore',
      'compliance_score',
      'scores.complianceScore',
      'scores.complianceScore.raw',
      'scoreBreakdown.compliance',
    ],
    labelMatchers: [/legal\s+access/i, /compliance/i],
  },
];

const loggedRejections = new Set<string>();
const SAFETY_SCORE_KEYS: CampOpsLegacySafetyScoreKey[] = ['accessConfidence', 'legalAccess'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isDevLoggingEnabled(): boolean {
  const maybeDev = (globalThis as { __DEV__?: unknown }).__DEV__;
  if (typeof maybeDev === 'boolean') return maybeDev;
  return typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : false;
}

function normalizeScoreValue(value: unknown): number | null {
  let score: unknown = value;
  if (isRecord(score)) {
    score =
      score.raw ??
      score.score ??
      score.value ??
      score.normalizedScore ??
      score.percent ??
      score.rating;
  }

  if (score == null) return null;

  if (typeof score === 'string') {
    const slashMatch = score.match(/(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (slashMatch) {
      const numerator = Number(slashMatch[1]);
      const denominator = Number(slashMatch[2]);
      return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0
        ? Math.round((numerator / denominator) * 100)
        : null;
    }
    const numericMatch = score.match(/-?\d+(?:\.\d+)?/);
    score = numericMatch ? Number(numericMatch[0]) : NaN;
  }

  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return null;
  if (numeric >= 0 && numeric <= 1) return Math.round(numeric * 100);
  if (numeric > 1 && numeric <= 10) return Math.round(numeric * 10);
  if (numeric > 10 && numeric <= 15) return Math.round((numeric / 15) * 100);
  return Math.round(numeric);
}

function readPath(record: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(record, path)) return record[path];
  return path.split('.').reduce<unknown>((cursor, key) => {
    if (!isRecord(cursor)) return undefined;
    return cursor[key];
  }, record);
}

function confidenceLabelForTier(
  tier: CampsiteViabilityTier,
): CampsiteCoreScoreEvaluation['confidenceLabel'] {
  switch (tier) {
    case 'preferred':
      return 'Preferred';
    case 'good':
      return 'Good';
    case 'possible':
      return 'Possible';
    case 'limited_confidence':
      return 'Limited confidence';
    case 'rejected_safety':
    default:
      return 'Rejected';
  }
}

function thresholdForTier(tier: CampsiteViabilityTier): number {
  switch (tier) {
    case 'preferred':
      return MIN_CAMPSITE_CORE_SCORE;
    case 'good':
      return CAMPSITE_GOOD_FALLBACK_SCORE;
    case 'possible':
      return CAMPSITE_POSSIBLE_FALLBACK_SCORE;
    case 'limited_confidence':
      return CAMPSITE_LIMITED_CONFIDENCE_SCORE;
    case 'rejected_safety':
    default:
      return MIN_CAMPSITE_SAFETY_SCORE;
  }
}

function resolveViabilityTier(
  scores: Record<CampsiteCoreScoreKey, number | null>,
  missingScoreNames: CampsiteCoreScoreKey[],
  safetyRejectionReasons: string[],
): CampsiteViabilityTier {
  const lowSafetyScores = SAFETY_SCORE_KEYS.filter(
    (key) => scores[key] != null && scores[key]! < MIN_CAMPSITE_SAFETY_SCORE,
  );
  if (safetyRejectionReasons.length > 0 || lowSafetyScores.length > 0) {
    return 'rejected_safety';
  }

  const availableScores = Object.values(scores).filter((score): score is number => score != null);
  const lowestAvailableScore = availableScores.length > 0 ? Math.min(...availableScores) : null;
  const hasAllCoreScores = missingScoreNames.length === 0;
  if (hasAllCoreScores && availableScores.every((score) => score >= MIN_CAMPSITE_CORE_SCORE)) {
    return 'preferred';
  }
  if (lowestAvailableScore == null) {
    return 'limited_confidence';
  }
  if (SAFETY_SCORE_KEYS.some((key) => scores[key] == null)) {
    return lowestAvailableScore >= CAMPSITE_POSSIBLE_FALLBACK_SCORE
      ? 'possible'
      : 'limited_confidence';
  }
  if (missingScoreNames.length <= 1 && lowestAvailableScore >= CAMPSITE_GOOD_FALLBACK_SCORE) {
    return 'good';
  }
  if (lowestAvailableScore >= CAMPSITE_POSSIBLE_FALLBACK_SCORE) {
    return 'possible';
  }
  return 'limited_confidence';
}

function scoreFromRatingFactors(candidate: Record<string, unknown>, definition: ScoreDefinition): number | null {
  const ratingFactors = candidate.ratingFactors;
  if (!Array.isArray(ratingFactors)) return null;

  for (const factor of ratingFactors as CampsiteRatingFactor[]) {
    if (!factor || typeof factor.label !== 'string') continue;
    if (!definition.labelMatchers.some((matcher) => matcher.test(factor.label))) continue;
    const score = normalizeScoreValue(factor.value);
    if (score != null) return score;
  }

  return null;
}

export function getCampsiteScore(
  candidate: unknown,
  keyOrAliases: CampsiteCoreScoreKey | string[],
): number | null {
  if (!isRecord(candidate)) return null;
  const definition =
    Array.isArray(keyOrAliases)
      ? { key: 'campSuitability' as const, aliases: keyOrAliases, labelMatchers: [] }
      : SCORE_DEFINITIONS.find((item) => item.key === keyOrAliases);
  if (!definition) return null;

  for (const alias of definition.aliases) {
    const score = normalizeScoreValue(readPath(candidate, alias));
    if (score != null) return score;
  }

  return scoreFromRatingFactors(candidate, definition);
}

function candidateDebugId(candidate: unknown): string {
  if (!isRecord(candidate)) return 'unknown';
  const raw =
    candidate.id ??
    candidate.candidateId ??
    candidate.siteId ??
    candidate.segmentRange ??
    candidate.segmentIndex ??
    candidate.polygonId ??
    'unknown';
  return String(raw);
}

function candidateDebugSource(candidate: unknown, fallback?: string | null): string {
  if (!isRecord(candidate)) return fallback ?? 'unknown';
  return String(candidate.source ?? candidate.analysisSource ?? fallback ?? 'unknown');
}

function logViabilityRejection(
  candidate: unknown,
  evaluation: CampsiteCoreScoreEvaluation,
  options?: CampsiteViabilityEvaluationOptions,
): void {
  if (!options?.debugLog || !isDevLoggingEnabled()) return;
  const eventName =
    evaluation.safetyRejected
      ? 'candidate_rejected_safety'
      : evaluation.missingScoreNames.length > 0
      ? 'candidate_rejected_missing_required_score'
      : 'candidate_rejected_below_threshold';
  const id = candidateDebugId(candidate);
  const source = candidateDebugSource(candidate, options.source);
  const analysisLayer = options.analysisLayer ?? 'standalone';
  const generationId = options.generationId ?? 'unknown-generation';
  const logKey = [
    eventName,
    analysisLayer,
    generationId,
    source,
    id,
    evaluation.failingScoreNames.join(','),
  ].join(':');
  if (loggedRejections.has(logKey)) return;
  loggedRejections.add(logKey);
  console.debug('[CAMPSITE_CANDIDATE]', eventName, {
    id,
    source,
    analysisLayer,
    generationId,
    routeIntelligenceId: options.routeIntelligenceId ?? null,
    polygonId: options.polygonId ?? null,
    threshold: evaluation.activeThreshold,
    tier: evaluation.tier,
    confidenceLabel: evaluation.confidenceLabel,
    missingScoreNames: evaluation.missingScoreNames,
    belowThresholdScoreNames: evaluation.belowThresholdScoreNames,
    safetyRejectionReasons: evaluation.safetyRejectionReasons,
    scores: evaluation.scores,
  });
}

export function evaluateCampsiteCandidateViability(
  candidate: unknown,
  options?: CampsiteViabilityEvaluationOptions,
): CampsiteCoreScoreEvaluation {
  const scores = Object.fromEntries(
    SCORE_DEFINITIONS.map((definition) => [definition.key, getCampsiteScore(candidate, definition.key)]),
  ) as Record<CampsiteCoreScoreKey, number | null>;
  const missingScoreNames = SCORE_DEFINITIONS
    .map((definition) => definition.key)
    .filter((key) => scores[key] == null);
  const belowThresholdScoreNames = SCORE_DEFINITIONS
    .map((definition) => definition.key)
    .filter((key) => scores[key] != null && scores[key]! < MIN_CAMPSITE_CORE_SCORE);
  const legacyHardGateSignals = evaluateLegacyCampHardGateSignals({
    candidate,
    safetyScores: {
      accessConfidence: scores.accessConfidence,
      legalAccess: scores.legalAccess,
    },
    minimumSafetyScore: MIN_CAMPSITE_SAFETY_SCORE,
  });
  const safetyRejectionReasons = legacyHardGateSignals.safetyRejectionReasons;
  const tier = resolveViabilityTier(scores, missingScoreNames, safetyRejectionReasons);
  const safetyRejected = tier === 'rejected_safety';
  const failingScoreNames = [...missingScoreNames, ...belowThresholdScoreNames];
  const evaluation: CampsiteCoreScoreEvaluation = {
    isViable: !safetyRejected,
    scores,
    missingScoreNames,
    belowThresholdScoreNames,
    failingScoreNames,
    tier,
    activeThreshold: thresholdForTier(tier),
    confidenceLabel: confidenceLabelForTier(tier),
    safetyRejected,
    safetyRejectionReasons,
    hardGateResults: legacyHardGateSignals.hardGateResults,
  };

  if (!evaluation.isViable) {
    logViabilityRejection(candidate, evaluation, options);
  }

  return evaluation;
}

export function isViableCampsiteCandidate(candidate: unknown): boolean {
  return evaluateCampsiteCandidateViability(candidate).isViable;
}

export function filterCampCandidatesPassingLegacyHardGates<T>(
  candidates: T[],
  options?: CampsiteViabilityEvaluationOptions,
): T[] {
  return candidates.filter((candidate) =>
    evaluateCampsiteCandidateViability(candidate, options).isViable,
  );
}

export const filterViableCampsiteCandidates = filterCampCandidatesPassingLegacyHardGates;
