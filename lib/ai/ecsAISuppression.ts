import type { ECSAIAdvisory, ECSAISeverity } from './ecsAITypes';

export const ECS_AI_ADVISORY_SUPPRESSION_MS = 10 * 60 * 1000;

const SEVERITY_RANK: Record<ECSAISeverity, number> = {
  info: 1,
  low: 2,
  moderate: 3,
  high: 4,
  critical: 5,
};

export type ECSAISuppressionRecord = {
  suppressKey: string;
  severity: ECSAISeverity;
  shownAt: number;
};

export type ECSAISuppressionState = Record<string, ECSAISuppressionRecord>;

export type ECSAISuppressionResult = {
  active: ECSAIAdvisory[];
  suppressed: ECSAIAdvisory[];
  state: ECSAISuppressionState;
};

function advisoryTime(advisory: ECSAIAdvisory): number {
  const parsed = Date.parse(advisory.createdAt);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function severityIncreased(next: ECSAISeverity, previous: ECSAISeverity): boolean {
  return SEVERITY_RANK[next] > SEVERITY_RANK[previous];
}

export function applyECSAIAdvisorySuppression(
  advisories: ECSAIAdvisory[],
  previousState: ECSAISuppressionState = {},
  windowMs = ECS_AI_ADVISORY_SUPPRESSION_MS,
  evaluationNow: number = Date.now(),
): ECSAISuppressionResult {
  const state: ECSAISuppressionState = {};
  for (const [key, record] of Object.entries(previousState)) {
    if (evaluationNow - record.shownAt <= windowMs) state[key] = record;
  }

  const active: ECSAIAdvisory[] = [];
  const suppressed: ECSAIAdvisory[] = [];

  for (const advisory of advisories) {
    const key = advisory.suppressKey || advisory.id;
    const previous = state[key];
    const createdAt = advisoryTime(advisory);
    const withinWindow = previous && createdAt - previous.shownAt <= windowMs;
    const allowCritical = advisory.severity === 'critical' && !withinWindow;
    const allowEscalation = previous ? severityIncreased(advisory.severity, previous.severity) : true;

    if (previous && withinWindow && !allowEscalation && !allowCritical) {
      suppressed.push(advisory);
      continue;
    }

    active.push(advisory);
    state[key] = {
      suppressKey: key,
      severity: advisory.severity,
      shownAt: createdAt,
    };
  }

  return { active, suppressed, state };
}
