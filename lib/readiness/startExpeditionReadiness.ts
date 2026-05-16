import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessStatus,
} from './expeditionReadinessTypes';

const STORAGE_KEY = 'ecs_start_expedition_readiness_acknowledgements_v1';
const startExpeditionStorage = createMigratingNonSecureStorage('ecs_start_expedition_readiness', {
  logTag: 'StartExpeditionReadiness',
});

export type StartExpeditionOverridePolicy = {
  allowCautionOverride: boolean;
  allowHoldOverride: boolean;
};

export type StartExpeditionAcknowledgement = {
  id: string;
  routeId: string | null;
  tripId: string | null;
  status: ExpeditionReadinessStatus;
  score: number;
  acknowledgedAt: string;
  reason: string;
};

export type StartExpeditionReviewReasonId =
  | 'hold_pattern'
  | 'low_confidence'
  | 'readiness_warnings';

export type StartExpeditionReviewReason = {
  id: StartExpeditionReviewReasonId;
  label: string;
};

export const DEFAULT_START_EXPEDITION_OVERRIDE_POLICY: StartExpeditionOverridePolicy = {
  allowCautionOverride: true,
  allowHoldOverride: true,
};

function routeIdFromAssessment(assessment: ExpeditionReadinessAssessment | null | undefined): string | null {
  const routeFreshness = assessment?.sourceFreshness.route;
  if (!assessment || routeFreshness?.isMissing) return null;
  return null;
}

export function canOverrideStartExpeditionStatus(
  status: ExpeditionReadinessStatus,
  policy: StartExpeditionOverridePolicy = DEFAULT_START_EXPEDITION_OVERRIDE_POLICY,
): boolean {
  if (status === 'ready') return true;
  if (status === 'caution') return policy.allowCautionOverride;
  return policy.allowHoldOverride;
}

export function getStartExpeditionPrimaryActionLabel(
  status: ExpeditionReadinessStatus,
  policy: StartExpeditionOverridePolicy = DEFAULT_START_EXPEDITION_OVERRIDE_POLICY,
): string | null {
  if (status === 'ready') return 'Start Expedition';
  if (status === 'caution') return policy.allowCautionOverride ? 'Start Anyway' : null;
  return policy.allowHoldOverride ? 'Continue Anyway' : null;
}

export function getStartExpeditionDecisionTitle(status: ExpeditionReadinessStatus): string {
  if (status === 'ready') return 'ECS Readiness: Ready';
  if (status === 'caution') return 'ECS Readiness: Caution';
  return 'ECS Readiness: Hold';
}

export function getStartExpeditionReviewReasons(
  assessment: ExpeditionReadinessAssessment | null | undefined,
): StartExpeditionReviewReason[] {
  if (!assessment) return [];

  const hasHoldPattern =
    assessment.status === 'hold' ||
    assessment.blockers.length > 0 ||
    assessment.categories.some((category) => category.status === 'hold');
  const hasLowConfidence =
    assessment.confidence === 'low';
  const hasWarnings =
    assessment.status === 'caution' ||
    assessment.warnings.length > 0 ||
    assessment.categories.some((category) => category.status === 'caution');

  const reasons: StartExpeditionReviewReason[] = [];
  if (hasHoldPattern) {
    reasons.push({ id: 'hold_pattern', label: 'Hold pattern' });
  }
  if (hasLowConfidence) {
    reasons.push({ id: 'low_confidence', label: 'Low confidence' });
  }
  if (hasWarnings) {
    reasons.push({ id: 'readiness_warnings', label: 'Readiness warnings' });
  }

  return reasons;
}

export function shouldShowStartExpeditionReadinessReview(
  assessment: ExpeditionReadinessAssessment | null | undefined,
): boolean {
  return getStartExpeditionReviewReasons(assessment).length > 0;
}

export function buildStartExpeditionAcknowledgement(
  assessment: ExpeditionReadinessAssessment,
  input: {
    routeId?: string | null;
    tripId?: string | null;
    reason?: string | null;
  } = {},
): StartExpeditionAcknowledgement {
  const routeId = input.routeId ?? routeIdFromAssessment(assessment);
  const acknowledgedAt = new Date().toISOString();
  return {
    id: `${routeId ?? 'route'}:${assessment.status}:${acknowledgedAt}`,
    routeId,
    tripId: input.tripId ?? null,
    status: assessment.status,
    score: Math.round(assessment.overallScore),
    acknowledgedAt,
    reason: input.reason ?? assessment.blockers[0]?.detail ?? assessment.warnings[0]?.detail ?? assessment.explanation,
  };
}

async function readAcknowledgements(): Promise<StartExpeditionAcknowledgement[]> {
  const raw = await startExpeditionStorage.read(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item === 'object') : [];
  } catch {
    return [];
  }
}

export async function recordStartExpeditionReadinessAcknowledgement(
  acknowledgement: StartExpeditionAcknowledgement,
): Promise<void> {
  const existing = await readAcknowledgements();
  const next = [acknowledgement, ...existing].slice(0, 50);
  await startExpeditionStorage.write(STORAGE_KEY, JSON.stringify(next));
}

export async function getStartExpeditionReadinessAcknowledgements(): Promise<StartExpeditionAcknowledgement[]> {
  return readAcknowledgements();
}
