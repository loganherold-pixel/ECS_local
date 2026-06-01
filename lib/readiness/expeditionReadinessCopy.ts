import type { ExpeditionReadinessAssessment, ExpeditionReadinessStatus } from './expeditionReadinessTypes';

export function getReadinessDecisionLabel(status: ExpeditionReadinessStatus): string {
  if (status === 'ready') return 'Ready';
  if (status === 'caution') return 'Caution';
  return 'Hold';
}

export function getReadinessColorToken(status: ExpeditionReadinessStatus): string {
  if (status === 'ready') return 'status.ready';
  if (status === 'caution') return 'status.caution';
  return 'status.hold';
}

export function getReadinessShortCopy(assessment: ExpeditionReadinessAssessment): string {
  const label = getReadinessDecisionLabel(assessment.status);
  if (assessment.status === 'ready') {
    return `${label}: ${assessment.overallScore}/100. ECS Intelligence sees no blockers.`;
  }
  const concern = assessment.blockers[0] ?? assessment.warnings[0];
  if (concern) {
    return `${label}: ${assessment.overallScore}/100. ${concern.detail}`;
  }
  return `${label}: ${assessment.overallScore}/100. Confidence is limited; confirm missing expedition inputs.`;
}

