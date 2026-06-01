import {
  EXPEDITION_INTELLIGENCE_AGENT_IDS,
  EXPEDITION_INTELLIGENCE_CONFIDENCE_LEVELS,
  EXPEDITION_INTELLIGENCE_RISK_LEVELS,
  EXPEDITION_LIFECYCLE_PHASES,
  type ExpeditionAgentResponse,
  type ExpeditionAgentValidationIssue,
  type ExpeditionAgentValidationResult,
} from './expeditionIntelligenceTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasTextArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => hasText(item));
}

function issue(
  code: ExpeditionAgentValidationIssue['code'],
  message: string,
  severity: ExpeditionAgentValidationIssue['severity'] = 'error',
): ExpeditionAgentValidationIssue {
  return { code, message, severity };
}

export function validateExpeditionAgentResponse(
  value: unknown,
): ExpeditionAgentValidationResult {
  const issues: ExpeditionAgentValidationIssue[] = [];
  if (!isRecord(value)) {
    return {
      valid: false,
      issues: [issue('missing_required_field', 'Agent response must be a JSON object.')],
    };
  }

  const candidate = value as Partial<ExpeditionAgentResponse>;

  if (!EXPEDITION_INTELLIGENCE_AGENT_IDS.includes(candidate.agentId as any)) {
    issues.push(issue('invalid_agent', 'agentId must be a known ECS Expedition Intelligence agent.'));
  }
  if (!EXPEDITION_LIFECYCLE_PHASES.includes(candidate.lifecyclePhase as any)) {
    issues.push(issue('invalid_phase', 'lifecyclePhase must be a known expedition lifecycle phase.'));
  }
  if (!EXPEDITION_INTELLIGENCE_RISK_LEVELS.includes(candidate.status as any)) {
    issues.push(issue('invalid_status', 'status must be normal, watch, caution, critical, or unknown.'));
  }
  if (!EXPEDITION_INTELLIGENCE_CONFIDENCE_LEVELS.includes(candidate.confidence as any)) {
    issues.push(issue('invalid_confidence', 'confidence must be high, medium, low, or unknown.'));
  }

  for (const key of ['summary', 'recommendedAction'] as const) {
    if (!hasText(candidate[key])) {
      issues.push(issue('missing_required_field', `${key} is required.`));
    }
  }
  for (const key of [
    'recommendations',
    'risks',
    'why',
    'uncertainty',
    'nextActions',
    'dataLimitations',
    'safetyNotes',
    'doNotDo',
  ] as const) {
    if (!hasTextArray(candidate[key])) {
      issues.push(issue('missing_required_field', `${key} must be a non-empty string array.`));
    }
  }

  if (!Array.isArray(candidate.evidence) || candidate.evidence.length === 0) {
    issues.push(issue('missing_evidence', 'Agent response must cite evidence fields.'));
  } else {
    candidate.evidence.forEach((field, index) => {
      if (!field?.id || !field.label || !field.source) {
        issues.push(issue('missing_evidence', `Evidence field ${index + 1} is missing id, label, or source.`));
      }
    });
  }

  if (
    (candidate.status === 'unknown' || candidate.confidence === 'low' || candidate.confidence === 'unknown') &&
    (!candidate.uncertainty || candidate.uncertainty.length === 0)
  ) {
    issues.push(issue('missing_uncertainty', 'Low-confidence or unknown responses must explain uncertainty.'));
  }

  if (candidate.escalationRecommended === true && !hasText(candidate.escalationReason)) {
    issues.push(issue('missing_required_field', 'escalationReason is required when escalationRecommended is true.'));
  }
  if (typeof candidate.escalationRecommended !== 'boolean') {
    issues.push(issue('missing_required_field', 'escalationRecommended must be boolean.'));
  }

  return {
    valid: !issues.some((item) => item.severity === 'error'),
    issues,
  };
}
