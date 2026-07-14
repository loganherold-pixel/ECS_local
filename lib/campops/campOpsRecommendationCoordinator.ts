import type { CampOpsHardGateConfig } from './campOpsHardGateConfig';
import {
  evaluateCampHardGateCandidates,
  type CampHardGateCandidateEvaluation,
} from './campOpsHardGates';
import {
  generateCampRecommendationSet,
} from './campOpsRecommendations';
import type { CampOpsRecommendationConfig } from './campOpsRecommendationConfig';
import {
  rankCampSuitabilityCandidates,
  type CampSuitabilityScoreResult,
} from './campOpsScoring';
import type { CampOpsScoringConfigOverrides } from './campOpsScoringConfig';
import {
  campOpsEnrichmentFromCandidateEvidence,
  normalizeCampCandidatePool,
  refreshCampCandidateSourceTruth,
  type CampCandidatePoolDiagnostics,
} from './campOpsCandidateNormalization';
import type {
  CampCandidate,
  CampCandidateEnrichment,
  CampRecommendationSet,
  CampSearchContext,
} from './campOpsTypes';

export type CampOpsRecommendationEvaluationInput = {
  context: CampSearchContext;
  candidates: CampCandidate[];
  enrichmentsByCandidateId?: Record<string, CampCandidateEnrichment | undefined>;
  hardGateConfig?: Partial<CampOpsHardGateConfig>;
  scoringConfig?: CampOpsScoringConfigOverrides;
  recommendationConfig?: Partial<CampOpsRecommendationConfig>;
  /** Optional stable key supplied by a caller that already fingerprints its context. */
  inputFingerprint?: string;
};

export type CampOpsRecommendationEvaluationDiagnostics = CampCandidatePoolDiagnostics & {
  fingerprint: string;
  cacheHit: boolean;
  durationMs: number;
  cacheSize: number;
};

export type CampOpsRecommendationEvaluation = {
  context: CampSearchContext;
  candidates: CampCandidate[];
  enrichmentsByCandidateId: Record<string, CampCandidateEnrichment | undefined>;
  aliasesByCandidateId: Record<string, string>;
  hardGateEvaluations: CampHardGateCandidateEvaluation[];
  hardGateEvaluationsByCandidateId: Record<string, CampHardGateCandidateEvaluation>;
  suitabilityScores: CampSuitabilityScoreResult[];
  suitabilityScoresByCandidateId: Record<string, CampSuitabilityScoreResult>;
  recommendationSet: CampRecommendationSet;
  diagnostics: CampOpsRecommendationEvaluationDiagnostics;
};

export type CampOpsRecommendationCoordinatorMetrics = {
  requestCount: number;
  calculationCount: number;
  cacheHitCount: number;
  evaluatedCandidateCount: number;
  deduplicatedCandidateCount: number;
  totalCalculationDurationMs: number;
  maxCalculationDurationMs: number;
  cacheSize: number;
  cacheLimit: number;
};

function stableSerialize(value: unknown, seen = new WeakSet<object>()): string {
  if (value == null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (seen.has(value as object)) return '"[circular]"';
  seen.add(value as object);
  if (Array.isArray(value)) return `[${value.map((item) => stableSerialize(item, seen)).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key], seen)}`)
    .join(',')}}`;
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

function fingerprintInput(input: CampOpsRecommendationEvaluationInput): string {
  if (input.inputFingerprint?.trim()) return input.inputFingerprint.trim();
  return `campops:${hash(stableSerialize({
    context: input.context,
    candidates: input.candidates,
    enrichmentsByCandidateId: input.enrichmentsByCandidateId ?? {},
    hardGateConfig: input.hardGateConfig ?? {},
    scoringConfig: input.scoringConfig ?? {},
    recommendationConfig: input.recommendationConfig ?? {},
  }))}`;
}

function withCacheDiagnostics(
  evaluation: CampOpsRecommendationEvaluation,
  cacheSize: number,
): CampOpsRecommendationEvaluation {
  return {
    ...evaluation,
    diagnostics: {
      ...evaluation.diagnostics,
      cacheHit: true,
      durationMs: 0,
      cacheSize,
    },
  };
}

export class CampOpsRecommendationCoordinator {
  private readonly cache = new Map<string, CampOpsRecommendationEvaluation>();
  private readonly cacheLimit: number;
  private metrics: CampOpsRecommendationCoordinatorMetrics;

  constructor(options: { cacheLimit?: number } = {}) {
    this.cacheLimit = Math.max(1, Math.trunc(options.cacheLimit ?? 8));
    this.metrics = {
      requestCount: 0,
      calculationCount: 0,
      cacheHitCount: 0,
      evaluatedCandidateCount: 0,
      deduplicatedCandidateCount: 0,
      totalCalculationDurationMs: 0,
      maxCalculationDurationMs: 0,
      cacheSize: 0,
      cacheLimit: this.cacheLimit,
    };
  }

  evaluate(input: CampOpsRecommendationEvaluationInput): CampOpsRecommendationEvaluation {
    this.metrics.requestCount += 1;
    const fingerprint = fingerprintInput(input);
    const cached = this.cache.get(fingerprint);
    if (cached) {
      this.metrics.cacheHitCount += 1;
      this.cache.delete(fingerprint);
      this.cache.set(fingerprint, cached);
      this.metrics.cacheSize = this.cache.size;
      return withCacheDiagnostics(cached, this.cache.size);
    }

    const startedAt = Date.now();
    const refreshedCandidates = input.candidates.map((candidate) =>
      refreshCampCandidateSourceTruth(candidate, input.context.currentTimeIso));
    const initialEnrichments: Record<string, CampCandidateEnrichment | undefined> = {};
    for (const candidate of refreshedCandidates) {
      const provided = input.enrichmentsByCandidateId?.[candidate.id];
      const sourceEnrichment = candidate.evidence ? campOpsEnrichmentFromCandidateEvidence(candidate) : undefined;
      const hasCanonicalSourceRefs = Boolean(candidate.evidence && (
        candidate.evidence.legalAccess.sourceRefs.length > 0 ||
        candidate.evidence.currentCondition.sourceRefs.length > 0 ||
        candidate.evidence.availability.sourceRefs.length > 0
      ));
      const merged = sourceEnrichment
        ? {
            ...sourceEnrichment,
            ...provided,
            candidateId: candidate.id,
            dataLimitations: Array.from(new Set([
              ...(sourceEnrichment.dataLimitations ?? []),
              ...(provided?.dataLimitations ?? []),
            ])),
          }
        : provided;
      initialEnrichments[candidate.id] = merged && sourceEnrichment && hasCanonicalSourceRefs
        ? {
            ...merged,
            legalStatus: sourceEnrichment.legalStatus,
            legalConfidence: sourceEnrichment.legalConfidence,
            closureStatus: sourceEnrichment.closureStatus,
            publicAccessStatus: sourceEnrichment.publicAccessStatus,
            vehicleFit: sourceEnrichment.vehicleFit,
            trailerSuitability: sourceEnrichment.trailerSuitability,
            groupCapacityEstimate: sourceEnrichment.groupCapacityEstimate,
            groupCapacityConfidence: sourceEnrichment.groupCapacityConfidence,
            availabilityStatus: sourceEnrichment.availabilityStatus,
            availabilityFreshness: sourceEnrichment.availabilityFreshness,
            availabilityUsableForDecision: sourceEnrichment.availabilityUsableForDecision,
          }
        : merged;
    }
    const pool = normalizeCampCandidatePool({
      candidates: refreshedCandidates,
      enrichmentsByCandidateId: initialEnrichments,
    });
    const plannedCampId = input.context.plannedCampId
      ? pool.aliasesByCandidateId[input.context.plannedCampId] ?? input.context.plannedCampId
      : input.context.plannedCampId;
    const context: CampSearchContext = plannedCampId === input.context.plannedCampId
      ? input.context
      : { ...input.context, plannedCampId };
    const hardGateEvaluations = evaluateCampHardGateCandidates({
      context,
      candidates: pool.candidates,
      enrichmentsByCandidateId: pool.enrichmentsByCandidateId,
      config: input.hardGateConfig ?? {},
    });
    const hardGateEvaluationsByCandidateId: Record<string, CampHardGateCandidateEvaluation> = {};
    for (const evaluation of hardGateEvaluations) {
      hardGateEvaluationsByCandidateId[evaluation.candidate.id] = evaluation;
    }
    const suitabilityScores = rankCampSuitabilityCandidates({
      context,
      candidates: pool.candidates,
      enrichmentsByCandidateId: pool.enrichmentsByCandidateId,
      hardGateEvaluationsByCandidateId,
      config: input.scoringConfig ?? {},
    });
    const suitabilityScoresByCandidateId: Record<string, CampSuitabilityScoreResult> = {};
    for (const score of suitabilityScores) {
      suitabilityScoresByCandidateId[score.candidate.id] = score;
    }
    const recommendationSet = generateCampRecommendationSet({
      context,
      candidates: pool.candidates,
      enrichmentsByCandidateId: pool.enrichmentsByCandidateId,
      hardGateEvaluationsByCandidateId,
      suitabilityScoresByCandidateId,
      config: input.recommendationConfig ?? {},
    });
    const durationMs = Math.max(0, Date.now() - startedAt);
    const evaluation: CampOpsRecommendationEvaluation = {
      context,
      candidates: pool.candidates,
      enrichmentsByCandidateId: pool.enrichmentsByCandidateId,
      aliasesByCandidateId: pool.aliasesByCandidateId,
      hardGateEvaluations,
      hardGateEvaluationsByCandidateId,
      suitabilityScores,
      suitabilityScoresByCandidateId,
      recommendationSet,
      diagnostics: {
        ...pool.diagnostics,
        fingerprint,
        cacheHit: false,
        durationMs,
        cacheSize: 0,
      },
    };

    this.cache.set(fingerprint, evaluation);
    while (this.cache.size > this.cacheLimit) {
      const oldest = this.cache.keys().next().value as string | undefined;
      if (!oldest) break;
      this.cache.delete(oldest);
    }
    evaluation.diagnostics.cacheSize = this.cache.size;
    this.metrics.calculationCount += 1;
    this.metrics.evaluatedCandidateCount += pool.candidates.length;
    this.metrics.deduplicatedCandidateCount += pool.diagnostics.duplicateCount;
    this.metrics.totalCalculationDurationMs += durationMs;
    this.metrics.maxCalculationDurationMs = Math.max(this.metrics.maxCalculationDurationMs, durationMs);
    this.metrics.cacheSize = this.cache.size;
    return evaluation;
  }

  getMetrics(): CampOpsRecommendationCoordinatorMetrics {
    return { ...this.metrics, cacheSize: this.cache.size };
  }

  reset(): void {
    this.cache.clear();
    this.metrics = {
      requestCount: 0,
      calculationCount: 0,
      cacheHitCount: 0,
      evaluatedCandidateCount: 0,
      deduplicatedCandidateCount: 0,
      totalCalculationDurationMs: 0,
      maxCalculationDurationMs: 0,
      cacheSize: 0,
      cacheLimit: this.cacheLimit,
    };
  }
}

export const campOpsRecommendationCoordinator = new CampOpsRecommendationCoordinator();

export function evaluateCampOpsRecommendations(
  input: CampOpsRecommendationEvaluationInput,
): CampOpsRecommendationEvaluation {
  return campOpsRecommendationCoordinator.evaluate(input);
}
