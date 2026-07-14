import { ECS_AI_POLICY_VERSION } from './aiPolicyBoundary';

export type ECSAIDebriefDeterministicSource = 'debrief_aar' | 'cross_expedition_trends';

export type ECSAIDebriefTraceLike = {
  policyVersion?: unknown;
  featureId?: unknown;
  inputFingerprint?: unknown;
  deterministicSource?: unknown;
};

export type ECSAILegacyOwnershipDecision = {
  accepted: boolean;
  reasons: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyArray(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function nonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isPolicyValidatedDebriefTrace(
  value: ECSAIDebriefTraceLike | null | undefined,
  source: ECSAIDebriefDeterministicSource,
): boolean {
  return value?.policyVersion === ECS_AI_POLICY_VERSION &&
    value.featureId === 'debrief_synthesis' &&
    value.deterministicSource === source &&
    typeof value.inputFingerprint === 'string' &&
    value.inputFingerprint.length > 8;
}

export function evaluateLegacyDebriefAnalysisOwnership(
  value: unknown,
): ECSAILegacyOwnershipDecision {
  if (!isRecord(value)) return { accepted: false, reasons: ['invalid_output_schema'] };
  const hasModelOwnedEvaluation =
    nonEmptyArray(value.resource_optimization) ||
    nonEmptyArray(value.route_improvements) ||
    (typeof value.overall_risk_score === 'number' && Number.isFinite(value.overall_risk_score)) ||
    nonEmptyText(value.expedition_grade);
  return hasModelOwnedEvaluation
    ? { accepted: false, reasons: ['legacy_ai_analysis_requires_deterministic_projection'] }
    : { accepted: true, reasons: [] };
}

export function evaluateLegacyTrendSynthesisOwnership(
  value: unknown,
): ECSAILegacyOwnershipDecision {
  if (!isRecord(value)) return { accepted: false, reasons: ['invalid_output_schema'] };
  const hasModelOwnedEvaluation =
    nonEmptyArray(value.operational_recommendations) ||
    (typeof value.fleet_health_score === 'number' && Number.isFinite(value.fleet_health_score)) ||
    nonEmptyText(value.readiness_grade);
  return hasModelOwnedEvaluation
    ? { accepted: false, reasons: ['legacy_ai_trends_require_deterministic_projection'] }
    : { accepted: true, reasons: [] };
}

export function stripUnvalidatedAARAI<T extends Record<string, unknown>>(
  aar: T,
): Omit<T, 'ai_analysis'> & { ai_analysis: null } {
  return { ...aar, ai_analysis: null };
}
