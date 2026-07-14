import { validateExpeditionAgentResponse } from './expeditionAgentSchemas';
import {
  buildExpeditionAgentRuntimePrompt,
  getExpeditionAgentDefinition,
  listExpeditionAgentDefinitions,
} from './expeditionAgentRegistry';
import { evaluateExpeditionAgentSafety } from './expeditionSafetyPolicy';
import type { ECSFeatureVisibilityContext } from '../features/featureVisibilityRegistry';
import {
  buildExpeditionAIProviderContext,
  buildExpeditionDeterministicFallbackResponse,
  buildExpeditionDeterministicSnapshot,
  buildExpeditionTrace,
  createExpeditionAIInputFingerprint,
  featureForExpeditionAgent,
  validateExpeditionAIProviderOutput,
} from './expeditionAIContract';
import { createECSAIInputFingerprint, resolveECSAIExecutionPolicy } from './aiPolicyBoundary';
import {
  ecsAIRequestCoordinator,
  type ECSAIProviderEnvelope,
  type ECSAIProviderUsage,
} from './aiRequestCoordinator';
import type {
  ExpeditionAgentContextInput,
  ExpeditionAgentDefinition,
  ExpeditionAgentProvider,
  ExpeditionAgentResponse,
  ExpeditionAgentRunResult,
  ExpeditionIntelligenceAgentId,
  ExpeditionIntelligenceRunResult,
} from './expeditionIntelligenceTypes';

export type ExpeditionIntelligenceOrchestratorInput = {
  context: ExpeditionAgentContextInput;
  agentIds?: ExpeditionIntelligenceAgentId[];
  provider?: ExpeditionAgentProvider | null;
  visibilityContext?: ECSFeatureVisibilityContext | null;
  signal?: AbortSignal | null;
  timeoutMs?: number;
  maxRetries?: number;
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

function normalizeProviderEnvelope(value: unknown): ECSAIProviderEnvelope {
  const normalized = normalizeProviderResponse(value);
  if (normalized && typeof normalized === 'object' && !Array.isArray(normalized) && 'output' in normalized) {
    const envelope = normalized as { output: unknown; usage?: ECSAIProviderUsage | null };
    return { output: normalizeProviderResponse(envelope.output), usage: envelope.usage ?? null };
  }
  return { output: normalized, usage: null };
}

async function runSingleAgent(
  agent: ExpeditionAgentDefinition,
  context: ExpeditionAgentContextInput,
  options: Pick<
    ExpeditionIntelligenceOrchestratorInput,
    'provider' | 'visibilityContext' | 'signal' | 'timeoutMs' | 'maxRetries'
  >,
): Promise<ExpeditionAgentRunResult> {
  const snapshot = buildExpeditionDeterministicSnapshot(agent, context);
  const providerContext = buildExpeditionAIProviderContext(context, snapshot);
  const inputFingerprint = createExpeditionAIInputFingerprint(agent, providerContext.context, context);
  const providerContextFingerprint = createECSAIInputFingerprint(
    featureForExpeditionAgent(agent.id),
    providerContext.context,
  );
  const trace = buildExpeditionTrace(snapshot, inputFingerprint);
  const prompt = buildExpeditionAgentRuntimePrompt(agent.id, providerContext.contextJson);
  let response = buildExpeditionDeterministicFallbackResponse(agent, context, snapshot, trace);
  let source: ExpeditionAgentRunResult['source'] = 'fallback';
  let providerStatus: ExpeditionAgentRunResult['providerStatus'] = 'not_requested';
  let providerUsage: ECSAIProviderUsage | null = null;
  let suppressionReasons: string[] = [];

  if (options.provider) {
    const featureId = featureForExpeditionAgent(agent.id);
    const executionDecision = resolveECSAIExecutionPolicy(featureId, options.visibilityContext);
    const outcome = await ecsAIRequestCoordinator.execute<ExpeditionAgentResponse>({
      featureId,
      executionDecision,
      fingerprint: inputFingerprint,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      maxRetries: options.maxRetries,
      invoke: async (signal, attempt) => normalizeProviderEnvelope(
        await options.provider!.generateAgentResponse({
          agent,
          prompt,
          context: providerContext.context,
          contextJson: providerContext.contextJson,
          deterministicSnapshot: providerContext.context.deterministicSnapshot,
          signal,
          request: {
            featureId,
            providerContextFingerprint,
            attempt,
          },
        }),
      ),
      validate: (output) => {
        const validation = validateExpeditionAIProviderOutput({
          value: output,
          agent,
          context,
          snapshot,
          trace,
        });
        return {
          accepted: validation.accepted,
          value: validation.response ?? undefined,
          reasons: validation.issues.map(item => item.code),
          classification: validation.classification,
        };
      },
    });
    providerStatus = outcome.status;
    providerUsage = outcome.usage;
    suppressionReasons = outcome.suppressionReasons;
    if (outcome.value) {
      response = outcome.value;
      source = 'provider';
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
    providerStatus,
    providerUsage,
    deterministicState: snapshot.deterministicAvailable ? 'available' : 'unavailable',
    suppressionReasons,
    trace,
  };
}

export async function runExpeditionIntelligenceAgents(
  input: ExpeditionIntelligenceOrchestratorInput,
): Promise<ExpeditionIntelligenceRunResult> {
  const agents = (input.agentIds?.length ? input.agentIds.map(getExpeditionAgentDefinition) : listExpeditionAgentDefinitions())
    .filter((agent) => agent.defaultEnabled);
  const results: ExpeditionAgentRunResult[] = [];

  for (const agent of agents) {
    results.push(await runSingleAgent(agent, input.context, input));
  }

  return {
    generatedAt: new Date().toISOString(),
    context: input.context,
    results,
  };
}
