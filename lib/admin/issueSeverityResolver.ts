import type {
  EcsFieldFeedbackConfidenceLabel,
  EcsFieldFeedbackEvent,
  EcsFieldFeedbackIssueClass,
  EcsIssueSeverity,
  EcsIssueTrendDirection,
} from './fieldFeedbackTypes';

function severityRank(severity: EcsIssueSeverity): number {
  switch (severity) {
    case 'critical':
      return 4;
    case 'high':
      return 3;
    case 'medium':
      return 2;
    default:
      return 1;
  }
}

export function maxSeverity(events: EcsFieldFeedbackEvent[]): EcsIssueSeverity {
  return [...events]
    .sort((left, right) => severityRank(right.severity) - severityRank(left.severity))[0]?.severity ?? 'low';
}

export function strongestIssueClass(events: EcsFieldFeedbackEvent[]): EcsFieldFeedbackIssueClass {
  const order: EcsFieldFeedbackIssueClass[] = [
    'critical_operational_failure',
    'release_polish_regression_candidate',
    'user_impacting_functional_failure',
    'feature_reliability_concern',
    'recurring_degraded_pattern',
    'informational_diagnostic_event',
  ];

  return order.find((issueClass) => events.some((event) => event.issueClass === issueClass))
    ?? 'informational_diagnostic_event';
}

export function computeGroupConfidence(events: EcsFieldFeedbackEvent[]): {
  score: number;
  label: EcsFieldFeedbackConfidenceLabel;
} {
  const eventCount = events.length;
  const uniqueSessions = new Set(events.map((event) => event.hashedSessionId).filter(Boolean)).size;
  const uniqueUsers = new Set(events.map((event) => event.hashedUserId).filter(Boolean)).size;
  const contextRichCount = events.filter((event) => event.runtimeContext.activeTab || event.runtimeContext.expeditionPhase || event.runtimeContext.syncStatus).length;
  const averageHint = events.reduce((sum, event) => sum + event.confidenceHint, 0) / Math.max(1, eventCount);

  const score = Math.max(
    0.12,
    Math.min(
      0.96,
      averageHint
        + Math.min(0.28, eventCount * 0.05)
        + Math.min(0.18, uniqueSessions * 0.06)
        + Math.min(0.12, uniqueUsers * 0.06)
        + Math.min(0.12, contextRichCount * 0.03),
    ),
  );

  const label: EcsFieldFeedbackConfidenceLabel =
    score >= 0.78
      ? 'high'
      : score >= 0.58
        ? 'moderate'
        : score >= 0.36
          ? 'limited'
          : 'low';

  return { score, label };
}

export function computeTrendDirection(events: EcsFieldFeedbackEvent[]): EcsIssueTrendDirection {
  if (events.length === 0) return 'quieted';

  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const recentStart = now - sevenDaysMs;
  const priorStart = now - sevenDaysMs * 2;

  const recentCount = events.filter((event) => {
    const time = Date.parse(event.occurredAt);
    return Number.isFinite(time) && time >= recentStart;
  }).length;

  const priorCount = events.filter((event) => {
    const time = Date.parse(event.occurredAt);
    return Number.isFinite(time) && time >= priorStart && time < recentStart;
  }).length;

  const newest = [...events].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0];
  const newestTime = newest ? Date.parse(newest.occurredAt) : 0;

  if (recentCount > 0 && priorCount === 0) {
    return now - newestTime <= 48 * 60 * 60 * 1000 ? 'new' : 'up';
  }
  if (recentCount === 0) return 'quieted';
  if (recentCount > priorCount * 1.25) return 'up';
  if (priorCount > recentCount * 1.25) return 'down';
  return 'flat';
}

export function computeOfflineCorrelation(events: EcsFieldFeedbackEvent[]): {
  rate: number;
  label: 'high' | 'moderate' | 'low';
} {
  if (events.length === 0) {
    return { rate: 0, label: 'low' };
  }

  const correlatedCount = events.filter((event) => {
    const connectivity = event.runtimeContext.connectivityState;
    return connectivity === 'offline' || connectivity === 'offline_capable' || connectivity === 'degraded';
  }).length;

  const rate = correlatedCount / events.length;
  return {
    rate,
    label: rate >= 0.66 ? 'high' : rate >= 0.34 ? 'moderate' : 'low',
  };
}
