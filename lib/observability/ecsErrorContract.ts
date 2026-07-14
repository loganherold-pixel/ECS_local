import {
  createECSDiagnosticToken,
  sanitizeECSDiagnosticText,
  sanitizeECSDiagnosticValue,
  type ECSDiagnosticValue,
} from './ecsDiagnosticRedaction';

export const ECS_ERROR_KINDS = [
  'validation',
  'permission',
  'configuration',
  'provider',
  'network',
  'timeout',
  'persistence',
  'migration',
  'native_hardware',
  'realtime',
  'degraded_data',
  'invariant_violation',
  'unexpected',
] as const;

export type ECSErrorKind = typeof ECS_ERROR_KINDS[number];
export type ECSErrorSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';
export type ECSErrorRecoverability =
  | 'automatic'
  | 'user_action'
  | 'restart_required'
  | 'not_recoverable'
  | 'unknown';
export type ECSErrorRetryability = 'retryable' | 'not_retryable' | 'conditional' | 'unknown';

export type ECSObservabilitySourceState =
  | 'live'
  | 'recent'
  | 'stale'
  | 'expired'
  | 'cached'
  | 'last_known'
  | 'manual'
  | 'estimated'
  | 'inferred'
  | 'simulated'
  | 'missing'
  | 'partial'
  | 'conflicted'
  | 'unavailable'
  | 'unknown';

export type ECSObservabilityDomain =
  | 'app_shell'
  | 'startup'
  | 'auth'
  | 'fleet'
  | 'navigate'
  | 'dashboard'
  | 'explore'
  | 'dispatch'
  | 'expedition'
  | 'campops'
  | 'weather'
  | 'map'
  | 'route'
  | 'offline_sync'
  | 'persistence'
  | 'device'
  | 'telemetry'
  | 'realtime'
  | 'supabase'
  | 'provider'
  | 'widget'
  | 'vehicle_display'
  | 'system'
  | (string & {});

export type ECSErrorPolicy = {
  severity: ECSErrorSeverity;
  recoverability: ECSErrorRecoverability;
  retryability: ECSErrorRetryability;
};

export type ECSErrorDiagnosticInput = {
  kind?: ECSErrorKind;
  domain: ECSObservabilityDomain;
  operation: string;
  code: string;
  severity?: ECSErrorSeverity;
  recoverability?: ECSErrorRecoverability;
  retryability?: ECSErrorRetryability;
  sourceState?: ECSObservabilitySourceState;
  requestId?: string | null;
  correlationId?: string | null;
  featureFlag?: string | null;
  context?: Record<string, unknown>;
};

export type ECSErrorDiagnostic = {
  occurredAt: string;
  kind: ECSErrorKind;
  domain: string;
  operation: string;
  code: string;
  severity: ECSErrorSeverity;
  recoverability: ECSErrorRecoverability;
  retryability: ECSErrorRetryability;
  sourceState: ECSObservabilitySourceState;
  requestId: string | null;
  correlationId: string | null;
  featureFlag: string | null;
  context: Record<string, ECSDiagnosticValue>;
  cause: {
    name: string;
    message: string;
    stack: string | null;
  } | null;
};

export type ECSErrorUserCopy = {
  title: string;
  message: string;
  actionLabel?: string;
};

const ERROR_POLICIES: Record<ECSErrorKind, ECSErrorPolicy> = {
  validation: {
    severity: 'warning',
    recoverability: 'user_action',
    retryability: 'not_retryable',
  },
  permission: {
    severity: 'warning',
    recoverability: 'user_action',
    retryability: 'conditional',
  },
  configuration: {
    severity: 'error',
    recoverability: 'user_action',
    retryability: 'conditional',
  },
  provider: {
    severity: 'warning',
    recoverability: 'automatic',
    retryability: 'retryable',
  },
  network: {
    severity: 'warning',
    recoverability: 'automatic',
    retryability: 'retryable',
  },
  timeout: {
    severity: 'warning',
    recoverability: 'automatic',
    retryability: 'retryable',
  },
  persistence: {
    severity: 'error',
    recoverability: 'user_action',
    retryability: 'conditional',
  },
  migration: {
    severity: 'error',
    recoverability: 'restart_required',
    retryability: 'not_retryable',
  },
  native_hardware: {
    severity: 'warning',
    recoverability: 'user_action',
    retryability: 'conditional',
  },
  realtime: {
    severity: 'warning',
    recoverability: 'automatic',
    retryability: 'retryable',
  },
  degraded_data: {
    severity: 'warning',
    recoverability: 'automatic',
    retryability: 'conditional',
  },
  invariant_violation: {
    severity: 'critical',
    recoverability: 'not_recoverable',
    retryability: 'not_retryable',
  },
  unexpected: {
    severity: 'error',
    recoverability: 'unknown',
    retryability: 'unknown',
  },
};

const USER_COPY: Record<ECSErrorKind, ECSErrorUserCopy> = {
  validation: {
    title: 'Check the entered information',
    message: 'Some information is incomplete or invalid. Review it and try again.',
    actionLabel: 'Review',
  },
  permission: {
    title: 'Permission required',
    message: 'This action needs permission that ECS does not currently have.',
    actionLabel: 'Review Permissions',
  },
  configuration: {
    title: 'Feature unavailable',
    message: 'This feature is not configured for the current ECS build.',
  },
  provider: {
    title: 'Live data temporarily unavailable',
    message: 'The provider did not return usable data. Cached or manual data remains labeled.',
    actionLabel: 'Retry',
  },
  network: {
    title: 'Network unavailable',
    message: 'ECS could not reach the network. Available offline data remains accessible.',
    actionLabel: 'Retry',
  },
  timeout: {
    title: 'Request timed out',
    message: 'The operation took too long to complete. Existing data has not been replaced.',
    actionLabel: 'Retry',
  },
  persistence: {
    title: 'Changes not fully saved',
    message: 'ECS could not confirm that this change was stored. Review the current state before retrying.',
    actionLabel: 'Retry',
  },
  migration: {
    title: 'Stored data needs recovery',
    message: 'ECS could not safely update older stored data. Reopen the app before making further changes.',
  },
  native_hardware: {
    title: 'Device connection unavailable',
    message: 'The device or native connection is not currently usable. Existing readings remain labeled.',
    actionLabel: 'Retry',
  },
  realtime: {
    title: 'Live updates interrupted',
    message: 'Realtime updates are unavailable. Local and cached information remains labeled until sync resumes.',
    actionLabel: 'Retry',
  },
  degraded_data: {
    title: 'Using limited data',
    message: 'Some expected source data is stale, partial, or unavailable. ECS has kept that limitation visible.',
  },
  invariant_violation: {
    title: 'Operation stopped safely',
    message: 'ECS detected an inconsistent state and stopped this operation without changing safety conclusions.',
  },
  unexpected: {
    title: 'Something went wrong',
    message: 'ECS could not complete the operation. Existing operational data has been left unchanged.',
    actionLabel: 'Retry',
  },
};

function textFromUnknown(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name} ${value.message}`;
  if (!value || typeof value !== 'object') return String(value ?? '');
  const record = value as Record<string, unknown>;
  return [record.name, record.message, record.code, record.details, record.hint]
    .filter((entry) => typeof entry === 'string')
    .join(' ');
}

function statusFromUnknown(value: unknown): number | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const direct = Number(record.status ?? record.statusCode);
  if (Number.isFinite(direct)) return direct;
  const context = record.context;
  if (context && typeof context === 'object') {
    const nested = Number((context as Record<string, unknown>).status);
    if (Number.isFinite(nested)) return nested;
  }
  return null;
}

export function classifyECSErrorKind(error: unknown, fallback: ECSErrorKind = 'unexpected'): ECSErrorKind {
  const text = textFromUnknown(error).toLowerCase();
  const status = statusFromUnknown(error);

  if (status === 401 || status === 403 || /permission|forbidden|unauthori[sz]ed|row level security|\brls\b/.test(text)) {
    return 'permission';
  }
  if (/timeout|timed out|aborterror|deadline exceeded/.test(text)) return 'timeout';
  if (/network request failed|failed to fetch|network unavailable|offline|econnreset|enotfound|socket/.test(text)) {
    return 'network';
  }
  if (/not configured|missing environment|configuration|config unavailable|invalid api configuration/.test(text)) {
    return 'configuration';
  }
  if (/migration|schema version|legacy persisted|upgrade stored data/.test(text)) return 'migration';
  if (/indexeddb|localstorage|securestore|storage unavailable|persist|database write|sqlite/.test(text)) {
    return 'persistence';
  }
  if (/bluetooth|\bble\b|obd|native module|hardware|sensor|device unavailable/.test(text)) {
    return 'native_hardware';
  }
  if (/realtime|channel_error|channel closed|subscription failed|websocket/.test(text)) return 'realtime';
  if (/stale data|partial data|last known|degraded data|cache expired/.test(text)) return 'degraded_data';
  if (/invariant|impossible state|contradictory state|assertion failed/.test(text)) return 'invariant_violation';
  if (status === 400 || status === 404 || status === 409 || status === 422 || /validation|invalid input|malformed/.test(text)) {
    return 'validation';
  }
  if (status === 429 || (status != null && status >= 500) || /provider|edge function|upstream|rate limit/.test(text)) {
    return 'provider';
  }
  return fallback;
}

export function getDefaultECSErrorPolicy(kind: ECSErrorKind): ECSErrorPolicy {
  return { ...ERROR_POLICIES[kind] };
}

export function normalizeECSSafeCode(code: string): string {
  const normalized = String(code || 'ECS_UNEXPECTED')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return normalized || 'ECS_UNEXPECTED';
}

function normalizeLabel(value: string, fallback: string): string {
  const normalized = String(value || fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 72);
  return normalized || fallback;
}

function normalizeCause(error: unknown): ECSErrorDiagnostic['cause'] {
  if (!error) return null;
  const sanitized = sanitizeECSDiagnosticValue(error, {
    maxDepth: 3,
    maxArrayLength: 8,
    maxObjectKeys: 12,
    maxStringLength: 600,
  }) as unknown;

  if (sanitized && typeof sanitized === 'object' && !Array.isArray(sanitized)) {
    const record = sanitized as Record<string, unknown>;
    return {
      name: sanitizeECSDiagnosticText(String(record.name ?? 'Error'), 80),
      message: sanitizeECSDiagnosticText(String(record.message ?? textFromUnknown(error) ?? 'Unexpected error'), 600),
      stack: typeof record.stack === 'string' ? sanitizeECSDiagnosticText(record.stack, 600) : null,
    };
  }

  return {
    name: 'Error',
    message: sanitizeECSDiagnosticText(String(sanitized ?? textFromUnknown(error) ?? 'Unexpected error'), 600),
    stack: null,
  };
}

export function createECSErrorDiagnostic(
  input: ECSErrorDiagnosticInput,
  error?: unknown,
  occurredAt = new Date().toISOString(),
): ECSErrorDiagnostic {
  const kind = input.kind ?? classifyECSErrorKind(error);
  const policy = getDefaultECSErrorPolicy(kind);
  const sanitizedContext = sanitizeECSDiagnosticValue(input.context ?? {}, {
    maxDepth: 5,
    maxArrayLength: 20,
    maxObjectKeys: 28,
    maxStringLength: 500,
  }) as Record<string, ECSDiagnosticValue>;

  return {
    occurredAt,
    kind,
    domain: normalizeLabel(input.domain, 'system'),
    operation: normalizeLabel(input.operation, 'operation'),
    code: normalizeECSSafeCode(input.code),
    severity: input.severity ?? policy.severity,
    recoverability: input.recoverability ?? policy.recoverability,
    retryability: input.retryability ?? policy.retryability,
    sourceState: input.sourceState ?? 'unknown',
    requestId: createECSDiagnosticToken('request', input.requestId),
    correlationId: createECSDiagnosticToken('correlation', input.correlationId),
    featureFlag: input.featureFlag ? normalizeLabel(input.featureFlag, 'feature') : null,
    context: sanitizedContext,
    cause: normalizeCause(error),
  };
}

export function getECSErrorUserCopy(
  error: ECSErrorKind | Pick<ECSErrorDiagnostic, 'kind' | 'domain'>,
): ECSErrorUserCopy {
  const kind = typeof error === 'string' ? error : error.kind;
  const domain = typeof error === 'string' ? null : error.domain;
  const base = USER_COPY[kind];

  if (kind === 'provider' && domain === 'weather') {
    return {
      ...base,
      title: 'Weather data temporarily unavailable',
    };
  }
  return { ...base };
}
