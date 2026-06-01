import { validateExpeditionAgentResponse } from './expeditionAgentSchemas';
import {
  buildExpeditionAgentRuntimePrompt,
  getExpeditionAgentDefinition,
  listExpeditionAgentDefinitions,
} from './expeditionAgentRegistry';
import { summarizeExpeditionEvidenceConfidence } from './expeditionEvidenceConfidence';
import { evaluateExpeditionAgentSafety } from './expeditionSafetyPolicy';
import type {
  ExpeditionAgentContextInput,
  ExpeditionAgentDefinition,
  ExpeditionAgentProvider,
  ExpeditionAgentResponse,
  ExpeditionAgentRunResult,
  ExpeditionIntelligenceAgentId,
  ExpeditionIntelligenceConfidence,
  ExpeditionIntelligenceRiskLevel,
  ExpeditionIntelligenceRunResult,
} from './expeditionIntelligenceTypes';

export type ExpeditionIntelligenceOrchestratorInput = {
  context: ExpeditionAgentContextInput;
  agentIds?: ExpeditionIntelligenceAgentId[];
  provider?: ExpeditionAgentProvider | null;
};

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeProviderResponse(value: unknown): unknown {
  if (typeof value === 'string') return safeJsonParse(value);
  return value;
}

function riskFromContext(context: ExpeditionAgentContextInput): ExpeditionIntelligenceRiskLevel {
  if (context.incident) return 'critical';
  if (context.missingData.length > 0) return 'unknown';
  if (context.staleData.length > 0) return 'watch';
  return 'normal';
}

function actionForAgent(agent: ExpeditionAgentDefinition, context: ExpeditionAgentContextInput): string {
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

function buildFallbackAgentResponse(
  agent: ExpeditionAgentDefinition,
  context: ExpeditionAgentContextInput,
): ExpeditionAgentResponse {
  const evidenceConfidence = summarizeExpeditionEvidenceConfidence(context.evidence);
  const status = riskFromContext(context);
  const confidence: ExpeditionIntelligenceConfidence =
    status === 'critical' && evidenceConfidence.confidence === 'unknown'
      ? 'low'
      : evidenceConfidence.confidence;
  const limitations = [
    ...evidenceConfidence.limitations,
    ...context.missingData.map((item) => `${item} is missing.`),
    ...context.staleData.map((item) => `${item} is stale.`),
  ];
  const recommendedAction = actionForAgent(agent, context);
  const risks = [
    status === 'critical' ? 'Incident context requires conservative handling.' : '',
    context.missingData.length > 0 ? 'Assessment is limited by missing data.' : '',
    context.staleData.length > 0 ? 'Assessment confidence is reduced by stale data.' : '',
  ].filter(Boolean);

  return {
    agentId: agent.id,
    lifecyclePhase: agent.lifecyclePhase,
    status,
    confidence,
    summary:
      status === 'normal'
        ? `${agent.label} has no elevated ECS signal from the available context.`
        : `${agent.label} is limited by current expedition context.`,
    recommendations: [recommendedAction],
    risks: risks.length > 0 ? risks : ['No elevated risk identified from the available evidence.'],
    why: context.evidence.length > 0
      ? context.evidence.slice(0, 3).map((item) => `${item.label}: ${item.value ?? 'unknown'}`)
      : ['No evidence fields were provided to this agent.'],
    evidence: context.evidence.length > 0
      ? context.evidence
      : [{
          id: 'agent-context',
          label: 'Agent context',
          value: 'missing',
          source: 'unknown',
          missing: true,
          confidence: 'unknown',
        }],
    uncertainty: limitations.length > 0 ? limitations : ['No current data limitations flagged by ECS.'],
    recommendedAction,
    nextActions: [recommendedAction],
    escalationRecommended: status === 'critical',
    escalationReason: status === 'critical' ? risks[0] ?? 'Critical expedition context.' : null,
    dataLimitations: limitations.length > 0 ? limitations : ['No current data limitations flagged by ECS.'],
    safetyNotes: ['ECS recommendations are advisory and should be verified against field conditions and user judgment.'],
    doNotDo: [
      'Do not treat ECS output as proof that a route, campsite, condition, or recovery method is safe.',
      'Do not replace emergency services, medical professionals, recovery operators, or local authorities.',
    ],
  };
}

async function runSingleAgent(
  agent: ExpeditionAgentDefinition,
  context: ExpeditionAgentContextInput,
  provider?: ExpeditionAgentProvider | null,
): Promise<ExpeditionAgentRunResult> {
  const contextJson = JSON.stringify(context);
  const prompt = buildExpeditionAgentRuntimePrompt(agent.id, contextJson);
  let response = buildFallbackAgentResponse(agent, context);
  let source: ExpeditionAgentRunResult['source'] = 'fallback';

  if (provider) {
    const providerResult = normalizeProviderResponse(await provider.generateAgentResponse({
      agent,
      prompt,
      context,
      contextJson,
    }));
    const validation = validateExpeditionAgentResponse(providerResult);
    if (validation.valid) {
      const safety = evaluateExpeditionAgentSafety(providerResult as ExpeditionAgentResponse);
      if (safety.valid) {
        response = providerResult as ExpeditionAgentResponse;
        source = 'provider';
      }
    }
  }

  const schemaValidation = validateExpeditionAgentResponse(response);
  const safetyValidation = evaluateExpeditionAgentSafety(response);
  return {
    agent,
    response,
    validation: {
      valid: schemaValidation.valid && safetyValidation.valid,
      issues: [...schemaValidation.issues, ...safetyValidation.issues],
    },
    source,
  };
}

export async function runExpeditionIntelligenceAgents(
  input: ExpeditionIntelligenceOrchestratorInput,
): Promise<ExpeditionIntelligenceRunResult> {
  const agents = (input.agentIds?.length ? input.agentIds.map(getExpeditionAgentDefinition) : listExpeditionAgentDefinitions())
    .filter((agent) => agent.defaultEnabled);
  const results: ExpeditionAgentRunResult[] = [];

  for (const agent of agents) {
    results.push(await runSingleAgent(agent, input.context, input.provider));
  }

  return {
    generatedAt: new Date().toISOString(),
    context: input.context,
    results,
  };
}
