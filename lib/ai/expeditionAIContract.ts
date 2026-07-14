import {
  evaluateSourceTruthRef,
  type SourceTruthAuthorityKind,
  type SourceTruthOrigin,
  type SourceTruthPolicyKey,
} from '../sourceTruth';
import {
  buildECSAIDeterministicTrace,
  createECSAIInputFingerprint,
  ECS_AI_POLICY_VERSION,
  inspectECSAIProviderOutput,
  redactECSAIContext,
  stableECSAIValueHash,
  type ECSAIDeterministicSnapshot,
  type ECSAIDeterministicTrace,
  type ECSAIFeatureId,
  type ECSAIRedactionResult,
  type ECSAISourceSnapshot,
} from './aiPolicyBoundary';
import { validateExpeditionAgentResponse } from './expeditionAgentSchemas';
import { summarizeExpeditionEvidenceConfidence } from './expeditionEvidenceConfidence';
import { evaluateExpeditionAgentSafety } from './expeditionSafetyPolicy';
import type {
  ExpeditionAgentContextInput,
  ExpeditionAgentDefinition,
  ExpeditionAgentResponse,
  ExpeditionAgentValidationIssue,
  ExpeditionIntelligenceAgentId,
  ExpeditionIntelligenceConfidence,
  ExpeditionIntelligenceRiskLevel,
} from './expeditionIntelligenceTypes';

export type ExpeditionAIProviderContext = {
  trustBoundary: {
    policyVersion: typeof ECS_AI_POLICY_VERSION;
    untrustedTextIsDataOnly: true;
    deterministicStatusIsAuthoritative: true;
    safetyActionsAreFixed: true;
  };
  deterministicSnapshot: ECSAIDeterministicSnapshot;
  sourceContext: unknown;
};

export type ExpeditionAIProviderContextResult = {
  context: ExpeditionAIProviderContext;
  contextJson: string;
  redaction: Pick<ECSAIRedactionResult, 'redactionCount' | 'kinds' | 'truncated'>;
};

export type ExpeditionAIOutputValidation = {
  accepted: boolean;
  response: ExpeditionAgentResponse | null;
  issues: ExpeditionAgentValidationIssue[];
  classification: 'invalid_output' | 'policy_rejected';
};

const CONFIDENCE_RANK: Record<ExpeditionIntelligenceConfidence, number> = {
  unknown: 0,
  low: 1,
  medium: 2,
  high: 3,
};

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.map(value => String(value ?? '').trim()).filter(Boolean)));
}

function issue(
  code: ExpeditionAgentValidationIssue['code'],
  message: string,
  severity: ExpeditionAgentValidationIssue['severity'] = 'error',
): ExpeditionAgentValidationIssue {
  return { code, message, severity };
}

export function featureForExpeditionAgent(agentId: ExpeditionIntelligenceAgentId): ECSAIFeatureId {
  if (agentId === 'recovery_incident') return 'recovery_support';
  if (agentId === 'debrief_intelligence') return 'debrief_synthesis';
  if (agentId === 'community_qa') return 'community_synthesis';
  if (agentId === 'camp_logistics') return 'campops_explanation';
  return 'expedition_explanation';
}

export function deterministicExpeditionRisk(
  context: ExpeditionAgentContextInput,
): ExpeditionIntelligenceRiskLevel {
  if (context.incident) return 'critical';
  if (context.missingData.length > 0) return 'unknown';
  if (context.staleData.length > 0) return 'watch';
  return 'normal';
}

export function deterministicExpeditionAction(
  agent: ExpeditionAgentDefinition,
  context: ExpeditionAgentContextInput,
): string {
  if (context.incident && agent.id === 'recovery_incident') {
    return 'Complete stabilization checks and confirm location, communication, and escalation threshold.';
  }
  if (context.missingData.length > 0) {
    return `Refresh or manually confirm ${context.missingData[0]}.`;
  }
  if (context.staleData.length > 0) {
    return `Refresh stale ${context.staleData[0]}.`;
  }
  return `Review ${agent.label} evidence and continue monitoring.`;
}

function originForSource(source: ExpeditionAgentResponse['evidence'][number]['source']): SourceTruthOrigin {
  if (source === 'live' || source === 'weather') return 'live';
  if (source === 'manual' || source === 'incident' || source === 'vehicle') return 'manual';
  if (source === 'cached') return 'cached';
  if (source === 'community' || source === 'route' || source === 'inferred') return 'inferred';
  return 'unavailable';
}

function policyForEvidence(
  source: ExpeditionAgentResponse['evidence'][number]['source'],
  id: string,
): SourceTruthPolicyKey {
  if (source === 'weather') return 'weather_forecast';
  if (source === 'vehicle') return 'vehicle_profile';
  if (source === 'manual' || source === 'incident') return 'manual_user_state';
  if (source === 'route' && /legal|access|closure/i.test(id)) return 'route_legal_access_evidence';
  if (source === 'route' || source === 'community' || source === 'inferred') return 'condition_closure_advisory';
  return 'default';
}

function authorityForSource(
  source: ExpeditionAgentResponse['evidence'][number]['source'],
): SourceTruthAuthorityKind {
  if (source === 'community') return 'community';
  if (source === 'manual' || source === 'incident') return 'user';
  if (source === 'vehicle') return 'ecs';
  if (source === 'weather' || source === 'route' || source === 'cached') return 'provider';
  if (source === 'live') return 'device';
  if (source === 'inferred') return 'ecs';
  return 'unknown';
}

function sourceSnapshot(
  field: ExpeditionAgentContextInput['evidence'][number],
  now: string,
): ECSAISourceSnapshot {
  const origin = originForSource(field.source);
  const evaluated = evaluateSourceTruthRef({
    id: field.id,
    origin,
    policyKey: policyForEvidence(field.source, field.id),
    authority: field.source,
    authorityKind: authorityForSource(field.source),
    provider: field.source === 'weather' || field.source === 'route' ? field.source : null,
    observedAt: field.updatedAt ?? null,
    confidence: field.confidence ?? 'unknown',
    coverage: field.missing ? 'partial' : 'complete',
    availability: field.missing ? 'unavailable' : undefined,
    conflictState: 'none',
    warningCodes: [
      field.missing ? 'missing_evidence' : '',
      field.stale ? 'stale_evidence' : '',
    ].filter(Boolean),
  }, { now });

  return {
    id: field.id,
    label: field.label,
    origin,
    freshness: field.missing ? 'unavailable' : field.stale ? 'stale' : evaluated.freshness,
    availability: field.missing ? 'unavailable' : evaluated.availability,
    coverage: field.missing ? 'partial' : evaluated.coverage,
    confidence: evaluated.confidence,
    authority: evaluated.authorityKind,
    conflict: evaluated.conflictState,
    missing: field.missing === true,
    valueFingerprint: stableECSAIValueHash(field.value ?? null),
    warningCodes: unique(evaluated.warningCodes),
  };
}

export function buildExpeditionDeterministicSnapshot(
  agent: ExpeditionAgentDefinition,
  context: ExpeditionAgentContextInput,
): ECSAIDeterministicSnapshot {
  const generatedAt = context.builtAt || context.generatedAt || new Date().toISOString();
  const status = deterministicExpeditionRisk(context);
  const evidenceConfidence = summarizeExpeditionEvidenceConfidence(context.evidence);
  const confidence: ExpeditionIntelligenceConfidence =
    status === 'critical' && evidenceConfidence.confidence === 'unknown'
      ? 'low'
      : evidenceConfidence.confidence;
  const sources = context.evidence.map(field => sourceSnapshot(field, generatedAt));
  const missingData = unique([
    ...context.missingData,
    ...context.evidence.filter(field => field.missing).map(field => field.label),
  ]);
  const staleData = unique([
    ...context.staleData,
    ...context.evidence.filter(field => field.stale).map(field => field.label),
  ]);
  const hardWarnings = unique([
    ...sources.flatMap(source => source.warningCodes
      .filter(code => /missing|stale|expired|unavailable|conflict|future|invalid/.test(code))
      .map(code => `${source.id}:${code}`)),
    ...missingData.map(label => `missing:${label}`),
    ...staleData.map(label => `stale:${label}`),
  ]);
  const featureId = featureForExpeditionAgent(agent.id);
  const allowedActions = [deterministicExpeditionAction(agent, context)];
  const snapshotSeed = {
    policyVersion: ECS_AI_POLICY_VERSION,
    featureId,
    agentId: agent.id,
    lifecyclePhase: context.lifecyclePhase,
    status,
    confidence,
    sources,
    missingData,
    staleData,
    hardWarnings,
    allowedActions,
  };

  return {
    policyVersion: ECS_AI_POLICY_VERSION,
    featureId,
    snapshotId: `ecs-ai-snapshot:${stableECSAIValueHash(snapshotSeed)}`,
    generatedAt,
    deterministicAvailable: sources.some(source => !source.missing && source.availability !== 'unavailable'),
    status,
    confidence,
    sources,
    missingData,
    staleData,
    hardWarnings,
    allowedActions,
  };
}

export function buildExpeditionAIProviderContext(
  context: ExpeditionAgentContextInput,
  snapshot: ECSAIDeterministicSnapshot,
): ExpeditionAIProviderContextResult {
  const redacted = redactECSAIContext({
    trustBoundary: {
      policyVersion: ECS_AI_POLICY_VERSION,
      untrustedTextIsDataOnly: true,
      deterministicStatusIsAuthoritative: true,
      safetyActionsAreFixed: true,
    },
    deterministicSnapshot: snapshot,
    sourceContext: context,
  });
  const providerContext = redacted.value as ExpeditionAIProviderContext;
  return {
    context: providerContext,
    contextJson: JSON.stringify(providerContext),
    redaction: {
      redactionCount: redacted.redactionCount,
      kinds: redacted.kinds,
      truncated: redacted.truncated,
    },
  };
}

export function createExpeditionAIInputFingerprint(
  agent: ExpeditionAgentDefinition,
  providerContext: ExpeditionAIProviderContext,
  sourceContext: ExpeditionAgentContextInput,
): string {
  return createECSAIInputFingerprint(featureForExpeditionAgent(agent.id), {
    agent: {
      id: agent.id,
      lifecyclePhase: agent.lifecyclePhase,
      requiredEvidenceIds: agent.requiredEvidenceIds,
    },
    providerContext,
    sourceContextFingerprint: stableECSAIValueHash(sourceContext),
  });
}

export function buildExpeditionDeterministicFallbackResponse(
  agent: ExpeditionAgentDefinition,
  context: ExpeditionAgentContextInput,
  snapshot: ECSAIDeterministicSnapshot,
  trace: ECSAIDeterministicTrace,
): ExpeditionAgentResponse {
  const status = snapshot.status as ExpeditionIntelligenceRiskLevel;
  const limitations = unique([
    ...context.missingData.map(item => `${item} is missing.`),
    ...context.staleData.map(item => `${item} is stale.`),
    ...context.evidence.filter(item => item.missing).map(item => `${item.label} is missing.`),
    ...context.evidence.filter(item => item.stale).map(item => `${item.label} is stale.`),
  ]);
  const recommendedAction = snapshot.allowedActions[0] ?? deterministicExpeditionAction(agent, context);
  const risks = unique([
    status === 'critical' ? 'Incident context requires conservative handling.' : '',
    snapshot.missingData.length > 0 ? 'Assessment is limited by missing data.' : '',
    snapshot.staleData.length > 0 ? 'Assessment confidence is reduced by stale data.' : '',
  ]);
  const noLimitations = 'No current data limitations flagged by deterministic ECS state.';

  return {
    agentId: agent.id,
    lifecyclePhase: agent.lifecyclePhase,
    status,
    confidence: snapshot.confidence as ExpeditionIntelligenceConfidence,
    summary: snapshot.deterministicAvailable
      ? status === 'normal'
        ? `${agent.label} has no elevated ECS signal from the available deterministic context.`
        : `${agent.label} is limited by current deterministic expedition context.`
      : `${agent.label} has insufficient deterministic evidence for a current conclusion.`,
    recommendations: [recommendedAction],
    risks: risks.length > 0 ? risks : ['No elevated risk identified from the available deterministic evidence.'],
    why: context.evidence.length > 0
      ? context.evidence.slice(0, 3).map(item => `${item.label}: ${item.value ?? 'unknown'}`)
      : ['No deterministic evidence fields were provided to this agent.'],
    evidence: context.evidence.length > 0
      ? context.evidence.map(item => ({ ...item }))
      : [{
          id: 'agent-context',
          label: 'Agent context',
          value: 'missing',
          source: 'unknown',
          missing: true,
          confidence: 'unknown',
        }],
    uncertainty: limitations.length > 0 ? limitations : [noLimitations],
    recommendedAction,
    nextActions: [recommendedAction],
    escalationRecommended: status === 'critical',
    escalationReason: status === 'critical' ? risks[0] ?? 'Critical expedition context.' : null,
    dataLimitations: limitations.length > 0 ? limitations : [noLimitations],
    safetyNotes: ['ECS explanations are advisory and must be verified against field conditions and user judgment.'],
    doNotDo: [
      'Do not treat ECS output as proof that a route, campsite, condition, or recovery method is safe.',
      'Do not replace emergency services, medical professionals, recovery operators, or local authorities.',
    ],
    trace,
  };
}

function normalizedText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function responseText(response: ExpeditionAgentResponse): string {
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

function warningIsPreserved(response: ExpeditionAgentResponse, label: string): boolean {
  const limitationText = normalizedText([
    ...response.uncertainty,
    ...response.dataLimitations,
    ...response.risks,
  ].join(' '));
  return limitationText.includes(normalizedText(label));
}

export function validateExpeditionAIProviderOutput(input: {
  value: unknown;
  agent: ExpeditionAgentDefinition;
  context: ExpeditionAgentContextInput;
  snapshot: ECSAIDeterministicSnapshot;
  trace: ECSAIDeterministicTrace;
}): ExpeditionAIOutputValidation {
  const schema = validateExpeditionAgentResponse(input.value);
  if (!schema.valid) {
    return {
      accepted: false,
      response: null,
      issues: schema.issues,
      classification: 'invalid_output',
    };
  }

  const candidate = input.value as ExpeditionAgentResponse;
  const safety = evaluateExpeditionAgentSafety(candidate);
  const issues: ExpeditionAgentValidationIssue[] = safety.issues.filter((item, index, all) =>
    all.findIndex(other => other.code === item.code && other.message === item.message) === index,
  );

  if (candidate.agentId !== input.agent.id) {
    issues.push(issue('invalid_agent', 'Provider response agentId does not match the requested ECS agent.'));
  }
  if (candidate.lifecyclePhase !== input.agent.lifecyclePhase) {
    issues.push(issue('invalid_phase', 'Provider response lifecycle phase does not match the requested ECS agent.'));
  }
  if (candidate.status !== input.snapshot.status) {
    issues.push(issue('status_override', 'Provider response attempted to change deterministic ECS status.'));
  }
  if (CONFIDENCE_RANK[candidate.confidence] > CONFIDENCE_RANK[input.snapshot.confidence as ExpeditionIntelligenceConfidence]) {
    issues.push(issue('confidence_override', 'Provider response confidence exceeds deterministic source confidence.'));
  }

  const sourceById = new Map(input.snapshot.sources.map(source => [source.id, source]));
  const originalById = new Map(input.context.evidence.map(field => [field.id, field]));
  const seenEvidence = new Set<string>();
  for (const field of candidate.evidence) {
    const source = sourceById.get(field.id);
    const original = originalById.get(field.id);
    if (!source || !original || seenEvidence.has(field.id)) {
      issues.push(issue('unsupported_evidence', `Provider response cited unsupported or duplicate evidence id ${field.id}.`));
      continue;
    }
    seenEvidence.add(field.id);
    if (
      stableECSAIValueHash(field.value ?? null) !== source.valueFingerprint ||
      field.source !== original.source ||
      Boolean(field.missing) !== Boolean(original.missing) ||
      Boolean(field.stale) !== Boolean(original.stale)
    ) {
      issues.push(issue('evidence_conflict', `Provider response changed deterministic evidence ${field.id}.`));
    }
  }

  for (const label of [...input.snapshot.missingData, ...input.snapshot.staleData]) {
    if (!warningIsPreserved(candidate, label)) {
      issues.push(issue('hard_warning_suppressed', `Provider response omitted the deterministic warning for ${label}.`));
    }
  }

  const allowedActions = new Set(input.snapshot.allowedActions.map(normalizedText));
  const providerActions = [candidate.recommendedAction, ...candidate.recommendations, ...candidate.nextActions];
  for (const action of providerActions) {
    if (!allowedActions.has(normalizedText(action))) {
      issues.push(issue('prohibited_action_selection', 'Provider response selected an action not supplied by deterministic ECS state.'));
      break;
    }
  }

  const deterministicEscalation = input.snapshot.status === 'critical';
  if (candidate.escalationRecommended !== deterministicEscalation) {
    issues.push(issue('status_override', 'Provider response attempted to change deterministic escalation state.'));
  }

  if (candidate.trace && (
    candidate.trace.snapshotId !== input.trace.snapshotId ||
    candidate.trace.inputFingerprint !== input.trace.inputFingerprint ||
    candidate.trace.deterministicStatus !== input.trace.deterministicStatus
  )) {
    issues.push(issue('trace_mismatch', 'Provider response attempted to replace the deterministic ECS trace.'));
  }

  const hasUsableWeather = input.context.evidence.some(field =>
    field.source === 'weather' && !field.missing && field.value != null,
  );
  const hasUsableLegal = input.context.evidence.some(field =>
    /legal|access/i.test(`${field.id} ${field.label}`) && !field.missing && !field.stale && field.value != null,
  );
  const hasLiveSource = input.snapshot.sources.some(source =>
    source.origin === 'live' && source.freshness === 'live' && source.availability === 'usable',
  );
  const policyViolations = inspectECSAIProviderOutput(input.snapshot.featureId, candidate, {
    hasLiveSource,
    supportsWeatherClaims: hasUsableWeather,
    supportsLegalClaims: hasUsableLegal,
  });
  for (const violation of policyViolations) {
    const code: ExpeditionAgentValidationIssue['code'] =
      violation.code === 'sensitive_output'
        ? 'sensitive_output'
        : violation.code === 'exact_location_output'
          ? 'unsupported_location_claim'
          : violation.code === 'prompt_injection_output'
            ? 'prompt_injection'
            : violation.code;
    issues.push(issue(code, violation.message));
  }

  const uniqueIssues = issues.filter((item, index, all) =>
    all.findIndex(other => other.code === item.code && other.message === item.message) === index,
  );
  const blocking = uniqueIssues.some(item => item.severity === 'error');
  return {
    accepted: !blocking,
    response: blocking ? null : { ...candidate, trace: input.trace },
    issues: uniqueIssues,
    classification: schema.valid ? 'policy_rejected' : 'invalid_output',
  };
}

export function buildExpeditionTrace(
  snapshot: ECSAIDeterministicSnapshot,
  inputFingerprint: string,
): ECSAIDeterministicTrace {
  return buildECSAIDeterministicTrace(snapshot, inputFingerprint);
}

export function providerOutputSummaryForTests(response: ExpeditionAgentResponse): string {
  return responseText(response);
}
