import type {
  ExpeditionAgentResponse,
  ExpeditionAgentValidationIssue,
  ExpeditionAgentValidationResult,
} from './expeditionIntelligenceTypes';
import { validateExpeditionAgentResponse } from './expeditionAgentSchemas';

const UNSUPPORTED_CERTAINTY_PATTERNS = [
  /\bguaranteed\b/i,
  /\b100%\s+safe\b/i,
  /\bcompletely safe\b/i,
  /\ball systems normal\b/i,
  /\bno risk\b/i,
  /\bno hazards?\b/i,
  /\bdefinitely safe\b/i,
];

const UNSAFE_RECOVERY_PATTERNS = [
  /\bdrive through (the )?(flood|floodwater|water crossing|wash)\b/i,
  /\bwinch from\b/i,
  /\brigging angle\b/i,
  /\brecovery strap.*tow\b/i,
  /\bmedical treatment\b/i,
  /\bignore emergency\b/i,
];

const EMERGENCY_REPLACEMENT_PATTERNS = [
  /\bdo not call emergency\b/i,
  /\bno need for emergency services\b/i,
  /\breplaces emergency services\b/i,
  /\binstead of emergency services\b/i,
  /\bignore local authorities\b/i,
];

const LIFE_THREATENING_PATTERNS = [
  /\bserious injur/i,
  /\bcritical injur/i,
  /\bmedical emergency\b/i,
  /\btrapped\b/i,
  /\bmissing person\b/i,
  /\bnot responding\b/i,
  /\bseparated party\b/i,
  /\bwildfire\b/i,
  /\bfire\b/i,
  /\bflood\b/i,
  /\bfloodwater\b/i,
  /\bheat stroke\b/i,
  /\bhypothermia\b/i,
  /\bavalanche\b/i,
  /\bstranded\b/i,
];

const HIGH_RISK_EXPEDITION_PATTERNS = [
  /\bgarmin\b/i,
  /\binreach\b/i,
  /\bsos\b/i,
  /\bstale location\b/i,
  /\bmissed check-?in\b/i,
  /\broute deviation\b/i,
  /\btracking disabled\b/i,
  /\bdevice silent\b/i,
  /\bvehicle recovery\b/i,
  /\brecovery incident\b/i,
  /\bstranded vehicle\b/i,
  /\bcommunication failure\b/i,
  /\bcomms? (offline|failed|failure|unavailable)\b/i,
  /\bnight navigation\b/i,
  /\bafter dark\b/i,
  /\bconvoy separation\b/i,
  /\bseparated convoy\b/i,
  /\bdangerous weather\b/i,
  /\bsevere weather\b/i,
  /\bwildfire\b/i,
  /\bflood\b/i,
  /\bsnow\b/i,
  /\bheat risk\b/i,
  /\billegal\b/i,
  /\bclosed access\b/i,
  /\bunknown legal\b/i,
  /\bunclear trail access\b/i,
];

const GARMIN_AUTOMATION_PATTERNS = [
  /\bauto(?:matically)?\s+(send|queue|confirm|cancel|request)\b.{0,32}\b(garmin|inreach|message|locate|tracking|sos)\b/i,
  /\b(send|queue|confirm|cancel|request)\b.{0,32}\b(garmin|inreach|message|locate|tracking|sos)\b.{0,32}\bwithout (operator|human|confirmation)\b/i,
  /\bmark(?:ed)?\b.{0,24}\bgarmin\b.{0,24}\bdelivered\b/i,
  /\bclose(?:d)?\b.{0,24}\bincident\b.{0,24}\bsos cancel\b/i,
];

const VERIFY_BEFORE_PROCEEDING_PATTERNS = [
  /\bverify\b/i,
  /\bconfirm\b/i,
  /\breassess\b/i,
  /\bstop\b/i,
  /\bhold\b/i,
  /\bdo not proceed\b/i,
  /\bcheck\b/i,
  /\breroute\b/i,
];

const ESCALATION_PATTERNS = [
  /\bemergency services\b/i,
  /\blocal authorities\b/i,
  /\bdispatch\b/i,
  /\brecovery operator\b/i,
  /\brecovery provider\b/i,
  /\btrusted contact\b/i,
  /\bactivate sos\b/i,
  /\bsos\b/i,
  /\b911\b/i,
];

function combinedText(response: ExpeditionAgentResponse): string {
  return [
    response.summary,
    response.recommendedAction,
    response.escalationReason ?? '',
    ...response.recommendations,
    ...response.risks,
    ...response.why,
    ...response.uncertainty,
    ...response.nextActions,
    ...response.dataLimitations,
    ...response.safetyNotes,
    ...response.doNotDo,
  ].join(' ');
}

function evidenceText(response: ExpeditionAgentResponse): string {
  return response.evidence
    .map((item) => `${item.id} ${item.label} ${item.value ?? ''}`)
    .join(' ');
}

function textMatchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function hasSupportingSafetyEvidence(response: ExpeditionAgentResponse): boolean {
  return response.evidence.some((item) => {
    const label = `${item.label} ${item.value ?? ''}`.toLowerCase();
    return (
      label.includes('normal') ||
      label.includes('safe') ||
      label.includes('clear') ||
      label.includes('verified') ||
      label.includes('confirmed')
    ) && !item.stale && !item.missing;
  });
}

export function evaluateExpeditionAgentSafety(
  response: ExpeditionAgentResponse,
): ExpeditionAgentValidationResult {
  const base = validateExpeditionAgentResponse(response);
  const issues: ExpeditionAgentValidationIssue[] = [...base.issues];
  const text = combinedText(response);
  const evidence = evidenceText(response);
  const allText = `${text} ${evidence}`;
  const hasStaleOrMissing = response.evidence.some((item) => item.stale || item.missing);
  const hasMissingOrUncertainOutput =
    hasStaleOrMissing ||
    response.dataLimitations.length > 0 ||
    response.uncertainty.length > 0 ||
    response.evidence.some((item) => String(item.value ?? '').toLowerCase() === 'unknown');
  const highRisk =
    response.status === 'critical' ||
    response.escalationRecommended ||
    textMatchesAny(allText, HIGH_RISK_EXPEDITION_PATTERNS) ||
    textMatchesAny(allText, LIFE_THREATENING_PATTERNS);
  const lifeThreatening = textMatchesAny(allText, LIFE_THREATENING_PATTERNS);
  const unclearAccessOrConditions =
    /\b(unknown|unclear|restricted|closed|conflicting).{0,32}(legal|access|trail|route|weather|condition|emergency)\b/i.test(allText) ||
    /\b(legal|access|trail|route|weather|condition|emergency).{0,32}(unknown|unclear|restricted|closed|conflicting)\b/i.test(allText);

  if (
    UNSUPPORTED_CERTAINTY_PATTERNS.some((pattern) => pattern.test(text)) &&
    (hasStaleOrMissing || response.status !== 'normal' || response.confidence !== 'high' || !hasSupportingSafetyEvidence(response))
  ) {
    issues.push({
      code: 'unsafe_certainty',
      severity: 'error',
      message: 'Response makes a certainty/safety claim that is not supported by fresh evidence.',
    });
  }

  if (UNSAFE_RECOVERY_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push({
      code: 'unsafe_recovery_instruction',
      severity: 'error',
      message: 'Response includes unsafe tactical recovery, medical, or water-crossing instructions.',
    });
  }

  if (EMERGENCY_REPLACEMENT_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push({
      code: 'emergency_service_replacement',
      severity: 'error',
      message: 'Response implies ECS replaces emergency services, recovery operators, or local authorities.',
    });
  }

  if (GARMIN_AUTOMATION_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push({
      code: 'unsafe_recovery_instruction',
      severity: 'error',
      message: 'Garmin/inReach recommendations must not automate commands, imply delivery, or close SOS incidents without human review.',
    });
  }

  if (
    hasMissingOrUncertainOutput &&
    response.confidence === 'high' &&
    response.status !== 'normal'
  ) {
    issues.push({
      code: 'insufficient_data_overconfidence',
      severity: 'error',
      message: 'High confidence is not allowed when material expedition data is missing, stale, unknown, or uncertain.',
    });
  }

  if (
    lifeThreatening &&
    !response.escalationRecommended &&
    !textMatchesAny(text, ESCALATION_PATTERNS)
  ) {
    issues.push({
      code: 'missing_emergency_escalation',
      severity: 'error',
      message: 'Life-threatening expedition scenarios must recommend emergency escalation or appropriate authorities where possible.',
    });
  }

  if (
    lifeThreatening &&
    !textMatchesAny(text, ESCALATION_PATTERNS)
  ) {
    issues.push({
      code: 'missing_emergency_escalation',
      severity: 'error',
      message: 'Life-threatening situations must mention emergency services, local authorities, SOS, dispatch, or recovery operators.',
    });
  }

  if (
    unclearAccessOrConditions &&
    !textMatchesAny(text, VERIFY_BEFORE_PROCEEDING_PATTERNS)
  ) {
    issues.push({
      code: 'missing_verification_action',
      severity: 'error',
      message: 'Unclear legal access, weather, trail condition, or emergency status must recommend verification before proceeding.',
    });
  }

  if (
    highRisk &&
    !textMatchesAny(text, VERIFY_BEFORE_PROCEEDING_PATTERNS) &&
    !textMatchesAny(text, ESCALATION_PATTERNS)
  ) {
    issues.push({
      code: 'missing_high_risk_reassessment',
      severity: 'error',
      message: 'High-risk expedition scenarios must recommend stopping, reassessing, verifying, rerouting, or escalating.',
    });
  }

  if (
    /\bsafe\b/i.test(text) &&
    !hasSupportingSafetyEvidence(response) &&
    (response.status !== 'normal' || response.confidence !== 'high')
  ) {
    issues.push({
      code: 'unsupported_safety_claim',
      severity: 'warning',
      message: 'Safety wording should be grounded in fresh supporting evidence.',
    });
  }

  return {
    valid: !issues.some((item) => item.severity === 'error'),
    issues,
  };
}
