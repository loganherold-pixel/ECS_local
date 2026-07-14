import {
  resolveECSFeatureVisibility,
  type ECSFeatureDecisionReason,
  type ECSFeatureVisibilityContext,
} from '../features/featureVisibilityRegistry';
import type {
  SourceTruthAuthorityKind,
  SourceTruthAvailability,
  SourceTruthConfidence,
  SourceTruthConflictState,
  SourceTruthCoverage,
  SourceTruthFreshness,
  SourceTruthOrigin,
} from '../sourceTruth';

export const ECS_AI_POLICY_VERSION = 'ecs-ai-policy-v1';

export const ECS_AI_FEATURE_IDS = [
  'expedition_explanation',
  'readiness_explanation',
  'campops_explanation',
  'route_idea',
  'mission_scenario_explanation',
  'recovery_support',
  'weather_route_advisory',
  'debrief_synthesis',
  'community_synthesis',
] as const;

export type ECSAIFeatureId = (typeof ECS_AI_FEATURE_IDS)[number];
export type ECSAIOutputDesignation = 'explanation' | 'synthesis' | 'proposal';
export type ECSAIOperation = 'explain' | 'summarize' | 'synthesize' | 'propose';

export type ECSAIProhibitedBehavior =
  | 'invent_fact'
  | 'change_deterministic_status'
  | 'claim_live_without_evidence'
  | 'select_safety_critical_action'
  | 'suppress_hard_warning'
  | 'contradict_source_confidence'
  | 'assert_unsupported_legal_access'
  | 'assert_unsupported_weather'
  | 'publish_or_execute_action'
  | 'present_proposal_as_verified';

export type ECSAIFeaturePolicy = {
  id: ECSAIFeatureId;
  label: string;
  operation: ECSAIOperation;
  outputDesignation: ECSAIOutputDesignation;
  rolloutFeatureId: 'ai_assist';
  deterministicAuthority: true;
  allowedBehavior: readonly string[];
  prohibitedBehavior: readonly ECSAIProhibitedBehavior[];
  fallbackCopy: string;
  mustRemainProposal: boolean;
};

const SHARED_PROHIBITIONS: readonly ECSAIProhibitedBehavior[] = Object.freeze([
  'invent_fact',
  'change_deterministic_status',
  'claim_live_without_evidence',
  'select_safety_critical_action',
  'suppress_hard_warning',
  'contradict_source_confidence',
  'assert_unsupported_legal_access',
  'assert_unsupported_weather',
  'publish_or_execute_action',
]);

function policy(
  value: Omit<ECSAIFeaturePolicy, 'rolloutFeatureId' | 'deterministicAuthority' | 'prohibitedBehavior'> & {
    prohibitedBehavior?: readonly ECSAIProhibitedBehavior[];
  },
): ECSAIFeaturePolicy {
  return Object.freeze({
    ...value,
    rolloutFeatureId: 'ai_assist' as const,
    deterministicAuthority: true as const,
    prohibitedBehavior: Object.freeze([
      ...SHARED_PROHIBITIONS,
      ...(value.prohibitedBehavior ?? []),
    ]),
  });
}

export const ECS_AI_POLICY_REGISTRY: Readonly<Record<ECSAIFeatureId, ECSAIFeaturePolicy>> = Object.freeze({
  expedition_explanation: policy({
    id: 'expedition_explanation',
    label: 'Expedition explanation',
    operation: 'explain',
    outputDesignation: 'explanation',
    allowedBehavior: ['Explain a validated expedition status.', 'Summarize cited evidence and limitations.'],
    fallbackCopy: 'AI explanation is unavailable. Deterministic expedition status remains available.',
    mustRemainProposal: false,
  }),
  readiness_explanation: policy({
    id: 'readiness_explanation',
    label: 'Readiness explanation',
    operation: 'explain',
    outputDesignation: 'explanation',
    allowedBehavior: ['Explain deterministic readiness factors.', 'Restate validated improvement actions.'],
    fallbackCopy: 'AI explanation is unavailable. Deterministic readiness remains available.',
    mustRemainProposal: false,
  }),
  campops_explanation: policy({
    id: 'campops_explanation',
    label: 'CampOps explanation',
    operation: 'explain',
    outputDesignation: 'explanation',
    allowedBehavior: ['Explain CampOps ranking, hard gates, tradeoffs, and source limitations.'],
    fallbackCopy: 'AI narration is unavailable. Deterministic CampOps recommendations remain available.',
    mustRemainProposal: false,
  }),
  route_idea: policy({
    id: 'route_idea',
    label: 'Route idea',
    operation: 'propose',
    outputDesignation: 'proposal',
    allowedBehavior: ['Propose a route concept for inspection.', 'Identify verification work before use.'],
    prohibitedBehavior: ['present_proposal_as_verified'],
    fallbackCopy: 'AI route ideas are unavailable. Verified and saved routes remain available.',
    mustRemainProposal: true,
  }),
  mission_scenario_explanation: policy({
    id: 'mission_scenario_explanation',
    label: 'Mission scenario explanation',
    operation: 'explain',
    outputDesignation: 'explanation',
    allowedBehavior: ['Explain deterministic scenario results and cited uncertainty.'],
    fallbackCopy: 'AI explanation is unavailable. Deterministic mission scenarios remain available.',
    mustRemainProposal: false,
  }),
  recovery_support: policy({
    id: 'recovery_support',
    label: 'Recovery support explanation',
    operation: 'explain',
    outputDesignation: 'explanation',
    allowedBehavior: ['Explain validated stabilization, communication, and escalation guidance.'],
    fallbackCopy: 'AI recovery explanation is unavailable. ECS incident and recovery tools remain available.',
    mustRemainProposal: false,
  }),
  weather_route_advisory: policy({
    id: 'weather_route_advisory',
    label: 'Weather and route advisory explanation',
    operation: 'synthesize',
    outputDesignation: 'synthesis',
    allowedBehavior: ['Summarize broker-normalized weather and deterministic route advisories.'],
    fallbackCopy: 'AI synthesis is unavailable. Provider weather and deterministic advisories remain available.',
    mustRemainProposal: false,
  }),
  debrief_synthesis: policy({
    id: 'debrief_synthesis',
    label: 'Debrief synthesis',
    operation: 'synthesize',
    outputDesignation: 'synthesis',
    allowedBehavior: ['Summarize durable debrief facts and explicitly labeled participant reflections.'],
    fallbackCopy: 'AI debrief synthesis is unavailable. Recorded debrief and AAR data remain available.',
    mustRemainProposal: false,
  }),
  community_synthesis: policy({
    id: 'community_synthesis',
    label: 'Community evidence synthesis',
    operation: 'synthesize',
    outputDesignation: 'synthesis',
    allowedBehavior: ['Summarize untrusted community evidence without publishing or verifying it.'],
    fallbackCopy: 'AI community synthesis is unavailable. Source reports remain available for review.',
    mustRemainProposal: false,
  }),
});

export type ECSAIExecutionBlockReason =
  | 'rollout_context_missing'
  | 'policy_missing'
  | ECSFeatureDecisionReason;

export type ECSAIExecutionDecision = {
  featureId: ECSAIFeatureId;
  allowed: boolean;
  reason: ECSAIExecutionBlockReason;
  explanation: string;
  fallbackCopy: string;
  policy: ECSAIFeaturePolicy;
};

export function getECSAIFeaturePolicy(featureId: ECSAIFeatureId): ECSAIFeaturePolicy {
  return ECS_AI_POLICY_REGISTRY[featureId];
}

export function validateECSAIPolicyRegistry(): string[] {
  const errors: string[] = [];
  for (const featureId of ECS_AI_FEATURE_IDS) {
    const entry = ECS_AI_POLICY_REGISTRY[featureId];
    if (!entry) {
      errors.push(`missing_policy:${featureId}`);
      continue;
    }
    if (entry.id !== featureId) errors.push(`policy_id_mismatch:${featureId}`);
    if (!entry.allowedBehavior.length) errors.push(`missing_allowed_behavior:${featureId}`);
    if (!entry.prohibitedBehavior.includes('change_deterministic_status')) {
      errors.push(`status_override_not_prohibited:${featureId}`);
    }
    if (entry.mustRemainProposal && entry.outputDesignation !== 'proposal') {
      errors.push(`proposal_designation_missing:${featureId}`);
    }
  }
  return errors;
}

export function resolveECSAIExecutionPolicy(
  featureId: ECSAIFeatureId,
  visibilityContext?: ECSFeatureVisibilityContext | null,
): ECSAIExecutionDecision {
  const entry = ECS_AI_POLICY_REGISTRY[featureId];
  if (!entry) {
    throw new Error(`Unknown ECS AI feature policy: ${featureId}`);
  }
  if (!visibilityContext) {
    return {
      featureId,
      allowed: false,
      reason: 'rollout_context_missing',
      explanation: 'AI execution is fail-closed because rollout and approval context was not supplied.',
      fallbackCopy: entry.fallbackCopy,
      policy: entry,
    };
  }

  const decision = resolveECSFeatureVisibility(entry.rolloutFeatureId, visibilityContext);
  return {
    featureId,
    allowed: decision.availability === 'available',
    reason: decision.reason,
    explanation: decision.explanation,
    fallbackCopy: entry.fallbackCopy,
    policy: entry,
  };
}

export type ECSAIRedactionKind =
  | 'secret'
  | 'personal_data'
  | 'exact_location'
  | 'private_identifier'
  | 'instruction_like_text'
  | 'bounded';

export type ECSAIRedactionResult<T = unknown> = {
  value: T;
  redactionCount: number;
  kinds: ECSAIRedactionKind[];
  truncated: boolean;
};

const SECRET_KEY_PATTERN = /(api[_-]?key|secret|token|password|credential|authorization|cookie|service[_-]?role|private[_-]?key)/i;
const PRIVATE_IDENTIFIER_KEY_PATTERN = /^(?:user|expedition|trip|route|vehicle|member|actor|recipient|debrief|account|profile|team|convoy|session)[_-]?id$/i;
const PERSONAL_KEY_PATTERN = /^(?:display|full|first|last|actor|recipient)[_-]?name$|^(?:email|phone|callsign|author)$/i;
const EXACT_LOCATION_KEY_PATTERN = /^(?:lat|lng|lon|latitude|longitude|coordinates?|exact[_-]?location|location[_-]?coordinates|gps[_-]?position|address)$/i;
const INTERNAL_FINGERPRINT_KEY_PATTERN = /(?:fingerprint|hash)$/i;
const SECRET_VALUE_PATTERN = /(bearer\s+[a-z0-9._~+\/-]{10,}|sk-[a-z0-9_-]{8,}|eyj[a-z0-9_-]{12,}|(?:api[_-]?key|secret|token|password|authorization)\s*[:=]\s*[^\s,;}]{4,})/i;
const COORDINATE_PAIR_PATTERN = /-?\d{1,3}\.\d{3,}\s*[,/]\s*-?\d{1,3}\.\d{3,}/g;
const LABELED_COORDINATE_PATTERN = /\b(?:lat(?:itude)?|lon(?:gitude)?|lng)\s*[:=]\s*-?\d{1,3}\.\d{3,}\b/gi;
const COORDINATE_PAIR_DETECTION_PATTERN = /-?\d{1,3}\.\d{3,}\s*[,/]\s*-?\d{1,3}\.\d{3,}/;
const LABELED_COORDINATE_DETECTION_PATTERN = /\b(?:lat(?:itude)?|lon(?:gitude)?|lng)\s*[:=]\s*-?\d{1,3}\.\d{3,}\b/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE_PATTERN = /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g;
const UUID_PATTERN = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
const STREET_ADDRESS_PATTERN = /\b\d{1,6}\s+[a-z0-9.' -]{2,40}\s(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|highway|hwy)\b/gi;
const STREET_ADDRESS_DETECTION_PATTERN = /\b\d{1,6}\s+[a-z0-9.' -]{2,40}\s(?:street|st|avenue|ave|road|rd|drive|dr|lane|ln|boulevard|blvd|highway|hwy)\b/i;
const PROMPT_INJECTION_PATTERN = /\b(?:ignore|disregard|override)\s+(?:all\s+|any\s+)?(?:previous|prior|system|developer|safety)\s+(?:instructions?|rules?|messages?)|\b(?:reveal|print|return)\s+(?:the\s+)?(?:system prompt|developer message|secret|credentials?)|\byou are now\b|\bjailbreak\b/gi;
const PROMPT_INJECTION_DETECTION_PATTERN = /\b(?:ignore|disregard|override)\s+(?:all\s+|any\s+)?(?:previous|prior|system|developer|safety)\s+(?:instructions?|rules?|messages?)|\b(?:reveal|print|return)\s+(?:the\s+)?(?:system prompt|developer message|secret|credentials?)|\byou are now\b|\bjailbreak\b/i;

function redactionMarker(kind: ECSAIRedactionKind): string {
  return `[redacted_${kind}]`;
}

export function redactECSAIContext<T>(
  input: T,
  options: { maxDepth?: number; maxArrayItems?: number; maxObjectKeys?: number; maxStringLength?: number } = {},
): ECSAIRedactionResult<T> {
  const maxDepth = Math.max(2, Math.min(12, options.maxDepth ?? 8));
  const maxArrayItems = Math.max(4, Math.min(100, options.maxArrayItems ?? 40));
  const maxObjectKeys = Math.max(8, Math.min(160, options.maxObjectKeys ?? 80));
  const maxStringLength = Math.max(80, Math.min(2_000, options.maxStringLength ?? 600));
  const kinds = new Set<ECSAIRedactionKind>();
  let redactionCount = 0;
  let truncated = false;
  const seen = new WeakSet<object>();

  const mark = (kind: ECSAIRedactionKind) => {
    kinds.add(kind);
    redactionCount += 1;
    return redactionMarker(kind);
  };

  const sanitizeString = (value: string): string => {
    if (SECRET_VALUE_PATTERN.test(value)) return mark('secret');
    let next = value
      .replace(COORDINATE_PAIR_PATTERN, () => mark('exact_location'))
      .replace(LABELED_COORDINATE_PATTERN, () => mark('exact_location'))
      .replace(EMAIL_PATTERN, () => mark('personal_data'))
      .replace(PHONE_PATTERN, () => mark('personal_data'))
      .replace(UUID_PATTERN, () => mark('private_identifier'))
      .replace(STREET_ADDRESS_PATTERN, () => mark('exact_location'))
      .replace(PROMPT_INJECTION_PATTERN, () => mark('instruction_like_text'));
    next = next.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (next.length > maxStringLength) {
      truncated = true;
      kinds.add('bounded');
      redactionCount += 1;
      next = `${next.slice(0, maxStringLength - 3).trimEnd()}...`;
    }
    return next;
  };

  const visit = (value: unknown, depth: number, key = ''): unknown => {
    if (SECRET_KEY_PATTERN.test(key)) return mark('secret');
    if (PRIVATE_IDENTIFIER_KEY_PATTERN.test(key)) return mark('private_identifier');
    if (PERSONAL_KEY_PATTERN.test(key)) return mark('personal_data');
    if (EXACT_LOCATION_KEY_PATTERN.test(key)) return mark('exact_location');
    if (INTERNAL_FINGERPRINT_KEY_PATTERN.test(key) || key === 'snapshotId') return mark('private_identifier');
    if (value == null || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return sanitizeString(value);
    if (typeof value === 'bigint') return String(value);
    if (typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : null;
    if (depth >= maxDepth) {
      truncated = true;
      return mark('bounded');
    }
    if (typeof value !== 'object') return String(value);
    if (seen.has(value as object)) return '[circular]';
    seen.add(value as object);

    if (Array.isArray(value)) {
      if (value.length > maxArrayItems) {
        truncated = true;
        kinds.add('bounded');
        redactionCount += 1;
      }
      return value.slice(0, maxArrayItems).map(item => visit(item, depth + 1));
    }

    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    if (entries.length > maxObjectKeys) {
      truncated = true;
      kinds.add('bounded');
      redactionCount += 1;
    }
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of entries.slice(0, maxObjectKeys)) {
      const sanitized = visit(childValue, depth + 1, childKey);
      if (sanitized !== undefined) output[childKey] = sanitized;
    }
    return output;
  };

  return {
    value: visit(input, 0) as T,
    redactionCount,
    kinds: Array.from(kinds).sort(),
    truncated,
  };
}

function canonicalize(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return '__nan__';
    if (!Number.isFinite(value)) return value > 0 ? '__infinity__' : '__negative_infinity__';
    return value;
  }
  if (typeof value === 'bigint') return String(value);
  if (typeof value === 'function') return `__function__:${value.name || 'anonymous'}`;
  if (typeof value === 'symbol') return String(value);
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.toISOString() : '__invalid_date__';
  if (typeof value !== 'object') return String(value);
  if (seen.has(value as object)) return '__circular__';
  seen.add(value as object);
  if (Array.isArray(value)) return value.map(item => canonicalize(item, seen));
  const output: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    output[key] = canonicalize((value as Record<string, unknown>)[key], seen);
  }
  return output;
}

function fnv1a(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

const ECS_AI_PROCESS_FINGERPRINT_SALT = `${Date.now().toString(36)}:${Math.random().toString(36).slice(2)}`;

export function stableECSAIValueHash(value: unknown): string {
  const serialized = JSON.stringify(canonicalize(value)) ?? '__undefined__';
  return `${fnv1a(serialized)}${fnv1a(`${serialized.length}:${serialized}`)}`;
}

export function createECSAIInputFingerprint(featureId: ECSAIFeatureId, value: unknown): string {
  return `${ECS_AI_POLICY_VERSION}:${featureId}:${stableECSAIValueHash({
    processSalt: ECS_AI_PROCESS_FINGERPRINT_SALT,
    value,
  })}`;
}

export type ECSAISourceSnapshot = {
  id: string;
  label: string;
  origin: SourceTruthOrigin;
  freshness: SourceTruthFreshness;
  availability: SourceTruthAvailability;
  coverage: SourceTruthCoverage;
  confidence: SourceTruthConfidence;
  authority: SourceTruthAuthorityKind;
  conflict: SourceTruthConflictState;
  missing: boolean;
  valueFingerprint: string;
  warningCodes: string[];
};

export type ECSAIDeterministicSnapshot = {
  policyVersion: typeof ECS_AI_POLICY_VERSION;
  featureId: ECSAIFeatureId;
  snapshotId: string;
  generatedAt: string;
  deterministicAvailable: boolean;
  status: string;
  confidence: SourceTruthConfidence;
  sources: ECSAISourceSnapshot[];
  missingData: string[];
  staleData: string[];
  hardWarnings: string[];
  allowedActions: string[];
};

export type ECSAIDeterministicTrace = {
  policyVersion: typeof ECS_AI_POLICY_VERSION;
  featureId: ECSAIFeatureId;
  snapshotId: string;
  inputFingerprint: string;
  sourceIds: string[];
  warningCodes: string[];
  deterministicStatus: string;
  generatedAt: string;
};

export function buildECSAIDeterministicTrace(
  snapshot: ECSAIDeterministicSnapshot,
  inputFingerprint: string,
): ECSAIDeterministicTrace {
  return {
    policyVersion: ECS_AI_POLICY_VERSION,
    featureId: snapshot.featureId,
    snapshotId: snapshot.snapshotId,
    inputFingerprint,
    sourceIds: snapshot.sources.map(source => source.id),
    warningCodes: [...snapshot.hardWarnings],
    deterministicStatus: snapshot.status,
    generatedAt: snapshot.generatedAt,
  };
}

export type ECSAIPolicyViolationCode =
  | 'sensitive_output'
  | 'exact_location_output'
  | 'prompt_injection_output'
  | 'unsupported_live_claim'
  | 'unsupported_weather_claim'
  | 'unsupported_legal_claim';

export type ECSAIPolicyViolation = {
  code: ECSAIPolicyViolationCode;
  message: string;
};

const ASSERTIVE_WEATHER_PATTERN = /\b(?:weather|forecast|snow|rain|storm|wind|temperature|wildfire|fire detection|flood)\b.{0,48}\b(?:is|are|will|shows?|reports?|expected|confirmed|currently)\b|\b(?:is|are|will|shows?|reports?|expected|confirmed|currently)\b.{0,48}\b(?:weather|forecast|snow|rain|storm|wind|temperature|wildfire|fire detection|flood)\b/i;
const ASSERTIVE_LEGAL_PATTERN = /\b(?:legal|access|route|trail|road|camp(?:site)?)\b.{0,48}\b(?:is|are)\s+(?:open|allowed|legal|verified|permitted|accessible)\b|\b(?:open|allowed|legal|verified|permitted|accessible)\b.{0,48}\b(?:access|route|trail|road|camp(?:site)?)\b/i;
const ASSERTIVE_LIVE_PATTERN = /\b(?:current|currently|live|real-time|up[- ]to[- ]date|fresh)\s+(?:data|weather|conditions?|status|location|availability|telemetry|position)\b/i;
const LIMITATION_PATTERN = /\b(?:unknown|missing|unavailable|stale|expired|cached|unverified|cannot confirm|not confirmed|requires verification)\b/i;

function outputText(value: unknown): string {
  try {
    return JSON.stringify(value).slice(0, 80_000);
  } catch {
    return String(value ?? '').slice(0, 80_000);
  }
}

function outputStrings(value: unknown, depth = 0, seen = new WeakSet<object>()): string[] {
  if (depth > 8 || value == null) return [];
  if (typeof value === 'string') return [value.slice(0, 8_000)];
  if (typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 80).flatMap(item => outputStrings(item, depth + 1, seen));
  }
  return Object.values(value as Record<string, unknown>)
    .slice(0, 120)
    .flatMap(item => outputStrings(item, depth + 1, seen));
}

function outputHasSensitiveShape(value: unknown, depth = 0, seen = new WeakSet<object>()): {
  secret: boolean;
  exactLocation: boolean;
} {
  if (depth > 8 || value == null || typeof value !== 'object') {
    return { secret: false, exactLocation: false };
  }
  if (seen.has(value)) return { secret: false, exactLocation: false };
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 80).reduce((result, item) => {
      const nested = outputHasSensitiveShape(item, depth + 1, seen);
      return {
        secret: result.secret || nested.secret,
        exactLocation: result.exactLocation || nested.exactLocation,
      };
    }, { secret: false, exactLocation: false });
  }
  let secret = false;
  let exactLocation = false;
  for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 120)) {
    if (SECRET_KEY_PATTERN.test(key) && item != null && item !== '') secret = true;
    if (EXACT_LOCATION_KEY_PATTERN.test(key) && item != null && item !== '') exactLocation = true;
    const nested = outputHasSensitiveShape(item, depth + 1, seen);
    secret ||= nested.secret;
    exactLocation ||= nested.exactLocation;
  }
  return { secret, exactLocation };
}

export function inspectECSAIProviderOutput(
  _featureId: ECSAIFeatureId,
  value: unknown,
  evidence: {
    hasLiveSource?: boolean;
    supportsWeatherClaims?: boolean;
    supportsLegalClaims?: boolean;
  } = {},
): ECSAIPolicyViolation[] {
  const text = outputText(value);
  const strings = outputStrings(value);
  const claimSegments = strings.flatMap(item => item.split(/[.!?\n]+/).map(segment => segment.trim()).filter(Boolean));
  const sensitiveShape = outputHasSensitiveShape(value);
  const violations: ECSAIPolicyViolation[] = [];
  if (SECRET_VALUE_PATTERN.test(text) || sensitiveShape.secret) {
    violations.push({ code: 'sensitive_output', message: 'Provider output contained secret or credential-like material.' });
  }
  if (
    COORDINATE_PAIR_DETECTION_PATTERN.test(text) ||
    LABELED_COORDINATE_DETECTION_PATTERN.test(text) ||
    STREET_ADDRESS_DETECTION_PATTERN.test(text) ||
    sensitiveShape.exactLocation
  ) {
    violations.push({ code: 'exact_location_output', message: 'Provider output contained an exact coordinate.' });
  }
  if (PROMPT_INJECTION_DETECTION_PATTERN.test(text)) {
    violations.push({ code: 'prompt_injection_output', message: 'Provider output contained instruction-like or prompt-exfiltration text.' });
  }
  if (evidence.hasLiveSource !== true && claimSegments.some(segment => (
    ASSERTIVE_LIVE_PATTERN.test(segment) && !LIMITATION_PATTERN.test(segment)
  ))) {
    violations.push({ code: 'unsupported_live_claim', message: 'Provider output claimed current or live data without a live source.' });
  }
  if (evidence.supportsWeatherClaims !== true && claimSegments.some(segment => (
    ASSERTIVE_WEATHER_PATTERN.test(segment) && !LIMITATION_PATTERN.test(segment)
  ))) {
    violations.push({ code: 'unsupported_weather_claim', message: 'Provider output asserted weather or environmental facts without supporting evidence.' });
  }
  if (evidence.supportsLegalClaims !== true && claimSegments.some(segment => (
    ASSERTIVE_LEGAL_PATTERN.test(segment) && !LIMITATION_PATTERN.test(segment)
  ))) {
    violations.push({ code: 'unsupported_legal_claim', message: 'Provider output asserted legal or access status without supporting evidence.' });
  }
  return violations;
}

export type ECSAIRouteIdeaPolicyMetadata = {
  designation: 'proposal';
  verificationState: 'unverified';
  mayStartGuidance: false;
  requiresInspection: true;
  policyVersion: typeof ECS_AI_POLICY_VERSION;
};

export function buildECSAIRouteIdeaPolicyMetadata(): ECSAIRouteIdeaPolicyMetadata {
  return {
    designation: 'proposal',
    verificationState: 'unverified',
    mayStartGuidance: false,
    requiresInspection: true,
    policyVersion: ECS_AI_POLICY_VERSION,
  };
}
