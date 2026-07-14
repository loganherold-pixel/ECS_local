import { ecsLog } from '../ecsLogger';
import type {
  ECSAIExecutionDecision,
  ECSAIFeatureId,
} from './aiPolicyBoundary';

export const ECS_AI_REQUEST_DIAGNOSTICS_SCHEMA_VERSION = 1;
export const DEFAULT_ECS_AI_REQUEST_TIMEOUT_MS = 8_000;
export const DEFAULT_ECS_AI_CACHE_TTL_MS = 5 * 60_000;
export const DEFAULT_ECS_AI_MAX_RETRIES = 1;

export type ECSAIProviderUsage = {
  inputTokens?: number | null;
  outputTokens?: number | null;
  costMicros?: number | null;
};

export type ECSAIProviderEnvelope = {
  output: unknown;
  usage?: ECSAIProviderUsage | null;
};

export type ECSAIProviderStatus =
  | 'accepted'
  | 'cache_hit'
  | 'not_requested'
  | 'feature_disabled'
  | 'offline'
  | 'cancelled'
  | 'timed_out'
  | 'provider_failed'
  | 'invalid_output'
  | 'policy_rejected';

export type ECSAIRequestValidation<T> = {
  accepted: boolean;
  value?: T;
  reasons: string[];
  classification?: 'invalid_output' | 'policy_rejected';
};

export type ECSAIRequestOutcome<T> = {
  status: ECSAIProviderStatus;
  value: T | null;
  attempts: number;
  fromCache: boolean;
  suppressionReasons: string[];
  usage: ECSAIProviderUsage | null;
  latencyMs: number;
  latencyBucket: ECSAILatencyBucket;
};

export type ECSAILatencyBucket = 'under_250ms' | '250_to_999ms' | '1_to_3s' | '3_to_8s' | 'over_8s';
export type ECSAITokenBucket = 'unknown' | 'under_1k' | '1k_to_4k' | 'over_4k';
export type ECSAICostBucket = 'unknown' | 'under_1_cent' | '1_to_10_cents' | 'over_10_cents';

type ECSAIRequestFeatureDiagnostics = {
  requested: number;
  providerCalls: number;
  accepted: number;
  cacheHits: number;
  deduplicated: number;
  retries: number;
  failures: number;
  suppressions: number;
  cancellations: number;
  timeouts: number;
  latencyBuckets: Record<ECSAILatencyBucket, number>;
  tokenBuckets: Record<ECSAITokenBucket, number>;
  costBuckets: Record<ECSAICostBucket, number>;
};

export type ECSAIRequestDiagnosticsSnapshot = {
  schemaVersion: typeof ECS_AI_REQUEST_DIAGNOSTICS_SCHEMA_VERSION;
  generatedAt: string;
  inFlightRequests: number;
  cacheEntries: number;
  features: Partial<Record<ECSAIFeatureId, ECSAIRequestFeatureDiagnostics>>;
};

export type ECSAIRequest<T> = {
  featureId: ECSAIFeatureId;
  executionDecision: ECSAIExecutionDecision;
  fingerprint: string;
  invoke: (signal: AbortSignal, attempt: number) => Promise<ECSAIProviderEnvelope>;
  validate: (output: unknown) => ECSAIRequestValidation<T>;
  signal?: AbortSignal | null;
  timeoutMs?: number;
  maxRetries?: number;
  cacheTtlMs?: number;
  retryable?: (error: unknown) => boolean;
};

type CacheEntry = {
  value: unknown;
  expiresAt: number;
  lastAccessedAt: number;
  usage: ECSAIProviderUsage | null;
};

class ECSAIRequestLifecycleError extends Error {
  constructor(
    readonly kind: 'cancelled' | 'timed_out',
    message: string,
  ) {
    super(message);
    this.name = 'ECSAIRequestLifecycleError';
  }
}

function emptyFeatureDiagnostics(): ECSAIRequestFeatureDiagnostics {
  return {
    requested: 0,
    providerCalls: 0,
    accepted: 0,
    cacheHits: 0,
    deduplicated: 0,
    retries: 0,
    failures: 0,
    suppressions: 0,
    cancellations: 0,
    timeouts: 0,
    latencyBuckets: {
      under_250ms: 0,
      '250_to_999ms': 0,
      '1_to_3s': 0,
      '3_to_8s': 0,
      over_8s: 0,
    },
    tokenBuckets: {
      unknown: 0,
      under_1k: 0,
      '1k_to_4k': 0,
      over_4k: 0,
    },
    costBuckets: {
      unknown: 0,
      under_1_cent: 0,
      '1_to_10_cents': 0,
      over_10_cents: 0,
    },
  };
}

function latencyBucket(durationMs: number): ECSAILatencyBucket {
  if (durationMs < 250) return 'under_250ms';
  if (durationMs < 1_000) return '250_to_999ms';
  if (durationMs < 3_000) return '1_to_3s';
  if (durationMs < 8_000) return '3_to_8s';
  return 'over_8s';
}

function tokenBucket(usage: ECSAIProviderUsage | null): ECSAITokenBucket {
  const input = Number(usage?.inputTokens);
  const output = Number(usage?.outputTokens);
  if (!Number.isFinite(input) && !Number.isFinite(output)) return 'unknown';
  const total = Math.max(0, Number.isFinite(input) ? input : 0) + Math.max(0, Number.isFinite(output) ? output : 0);
  if (total < 1_000) return 'under_1k';
  if (total <= 4_000) return '1k_to_4k';
  return 'over_4k';
}

function costBucket(usage: ECSAIProviderUsage | null): ECSAICostBucket {
  const costMicros = Number(usage?.costMicros);
  if (!Number.isFinite(costMicros) || costMicros < 0) return 'unknown';
  if (costMicros < 10_000) return 'under_1_cent';
  if (costMicros <= 100_000) return '1_to_10_cents';
  return 'over_10_cents';
}

function normalizeUsage(usage?: ECSAIProviderUsage | null): ECSAIProviderUsage | null {
  if (!usage) return null;
  const normalized: ECSAIProviderUsage = {};
  for (const key of ['inputTokens', 'outputTokens', 'costMicros'] as const) {
    const value = Number(usage[key]);
    if (Number.isFinite(value) && value >= 0) normalized[key] = Math.round(value);
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function clampTimeout(value: number | undefined): number {
  const candidate = Number(value ?? DEFAULT_ECS_AI_REQUEST_TIMEOUT_MS);
  return Number.isFinite(candidate) ? Math.max(10, Math.min(30_000, Math.round(candidate))) : DEFAULT_ECS_AI_REQUEST_TIMEOUT_MS;
}

function clampRetries(value: number | undefined): number {
  const candidate = Number(value ?? DEFAULT_ECS_AI_MAX_RETRIES);
  return Number.isFinite(candidate) ? Math.max(0, Math.min(2, Math.round(candidate))) : DEFAULT_ECS_AI_MAX_RETRIES;
}

function clampCacheTtl(value: number | undefined): number {
  const candidate = Number(value ?? DEFAULT_ECS_AI_CACHE_TTL_MS);
  return Number.isFinite(candidate) ? Math.max(0, Math.min(10 * 60_000, Math.round(candidate))) : DEFAULT_ECS_AI_CACHE_TTL_MS;
}

function isDevelopmentRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

function defaultRetryable(error: unknown): boolean {
  if (error instanceof ECSAIRequestLifecycleError) return false;
  const code = String((error as { code?: unknown } | null)?.code ?? '').toLowerCase();
  if (/invalid|permission|auth|denied|unsupported|schema/.test(code)) return false;
  return true;
}

function lifecycleStatus(error: unknown): ECSAIProviderStatus | null {
  if (!(error instanceof ECSAIRequestLifecycleError)) return null;
  return error.kind === 'timed_out' ? 'timed_out' : 'cancelled';
}

async function invokeWithLifecycle(
  invoke: (signal: AbortSignal, attempt: number) => Promise<ECSAIProviderEnvelope>,
  attempt: number,
  timeoutMs: number,
  externalSignal?: AbortSignal | null,
): Promise<ECSAIProviderEnvelope> {
  if (externalSignal?.aborted) {
    throw new ECSAIRequestLifecycleError('cancelled', 'AI request cancelled before provider execution.');
  }

  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let removeExternalAbort: () => void = () => undefined;

  const lifecyclePromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      controller.abort();
      reject(new ECSAIRequestLifecycleError('timed_out', 'AI provider request timed out.'));
    }, timeoutMs);

    if (externalSignal) {
      const onAbort = () => {
        controller.abort();
        reject(new ECSAIRequestLifecycleError('cancelled', 'AI provider request was cancelled.'));
      };
      externalSignal.addEventListener('abort', onAbort, { once: true });
      removeExternalAbort = () => externalSignal.removeEventListener('abort', onAbort);
    }
  });

  try {
    return await Promise.race([
      Promise.resolve().then(() => invoke(controller.signal, attempt)),
      lifecyclePromise,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
    removeExternalAbort();
  }
}

export class ECSAIRequestCoordinator {
  private readonly inFlight = new Map<string, Promise<ECSAIRequestOutcome<unknown>>>();
  private readonly cache = new Map<string, CacheEntry>();
  private readonly diagnostics = new Map<ECSAIFeatureId, ECSAIRequestFeatureDiagnostics>();

  constructor(
    private readonly maxCacheEntries = 32,
  ) {}

  private featureDiagnostics(featureId: ECSAIFeatureId): ECSAIRequestFeatureDiagnostics {
    const existing = this.diagnostics.get(featureId);
    if (existing) return existing;
    const created = emptyFeatureDiagnostics();
    this.diagnostics.set(featureId, created);
    return created;
  }

  private pruneCache(now = Date.now()): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) this.cache.delete(key);
    }
    if (this.cache.size <= this.maxCacheEntries) return;
    const oldest = Array.from(this.cache.entries())
      .sort((left, right) => left[1].lastAccessedAt - right[1].lastAccessedAt)
      .slice(0, this.cache.size - this.maxCacheEntries);
    oldest.forEach(([key]) => this.cache.delete(key));
  }

  private outcome<T>(
    status: ECSAIProviderStatus,
    value: T | null,
    startedAt: number,
    options: {
      attempts?: number;
      fromCache?: boolean;
      reasons?: string[];
      usage?: ECSAIProviderUsage | null;
    } = {},
  ): ECSAIRequestOutcome<T> {
    const latencyMs = Math.max(0, Date.now() - startedAt);
    return {
      status,
      value,
      attempts: options.attempts ?? 0,
      fromCache: options.fromCache ?? false,
      suppressionReasons: [...(options.reasons ?? [])],
      usage: normalizeUsage(options.usage),
      latencyMs,
      latencyBucket: latencyBucket(latencyMs),
    };
  }

  private record(featureId: ECSAIFeatureId, outcome: ECSAIRequestOutcome<unknown>): void {
    const diagnostics = this.featureDiagnostics(featureId);
    diagnostics.latencyBuckets[outcome.latencyBucket] += 1;
    diagnostics.tokenBuckets[tokenBucket(outcome.usage)] += 1;
    diagnostics.costBuckets[costBucket(outcome.usage)] += 1;
    if (outcome.status === 'accepted') diagnostics.accepted += 1;
    if (outcome.status === 'cache_hit') diagnostics.cacheHits += 1;
    if (outcome.status === 'timed_out') diagnostics.timeouts += 1;
    if (outcome.status === 'cancelled') diagnostics.cancellations += 1;
    if (outcome.status === 'provider_failed') diagnostics.failures += 1;
    if (outcome.status === 'invalid_output' || outcome.status === 'policy_rejected') diagnostics.suppressions += 1;

    if (isDevelopmentRuntime()) {
      ecsLog.dev('SYSTEM', 'ai_request_completed', {
        featureId,
        status: outcome.status,
        attempts: outcome.attempts,
        latencyBucket: outcome.latencyBucket,
        suppressionCount: outcome.suppressionReasons.length,
        tokenBucket: tokenBucket(outcome.usage),
        costBucket: costBucket(outcome.usage),
      }, {
        tag: 'ECS_AI_POLICY',
        throttleMs: 250,
        aggregateWindowMs: 2_000,
      });
    }
  }

  async execute<T>(request: ECSAIRequest<T>): Promise<ECSAIRequestOutcome<T>> {
    const startedAt = Date.now();
    const diagnostics = this.featureDiagnostics(request.featureId);
    diagnostics.requested += 1;

    if (!request.executionDecision.allowed) {
      const status: ECSAIProviderStatus = request.executionDecision.reason === 'offline_unavailable'
        ? 'offline'
        : 'feature_disabled';
      const blocked = this.outcome<T>(status, null, startedAt, {
        reasons: [request.executionDecision.reason],
      });
      this.record(request.featureId, blocked);
      return blocked;
    }

    const key = `${request.featureId}:${request.fingerprint}`;
    const cacheTtlMs = clampCacheTtl(request.cacheTtlMs);
    this.pruneCache(startedAt);
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > startedAt) {
      cached.lastAccessedAt = startedAt;
      const hit = this.outcome<T>('cache_hit', cached.value as T, startedAt, {
        fromCache: true,
        usage: cached.usage,
      });
      this.record(request.featureId, hit);
      return hit;
    }

    const active = this.inFlight.get(key);
    if (active) {
      diagnostics.deduplicated += 1;
      return active as Promise<ECSAIRequestOutcome<T>>;
    }

    const timeoutMs = clampTimeout(request.timeoutMs);
    const maxRetries = clampRetries(request.maxRetries);
    const retryable = request.retryable ?? defaultRetryable;

    const execution = (async (): Promise<ECSAIRequestOutcome<T>> => {
      let attempts = 0;
      let lastError: unknown = null;
      while (attempts <= maxRetries) {
        attempts += 1;
        diagnostics.providerCalls += 1;
        try {
          const envelope = await invokeWithLifecycle(request.invoke, attempts, timeoutMs, request.signal);
          const usage = normalizeUsage(envelope.usage);
          const validation = request.validate(envelope.output);
          if (!validation.accepted || validation.value === undefined) {
            const rejected = this.outcome<T>(
              validation.classification ?? 'invalid_output',
              null,
              startedAt,
              { attempts, reasons: validation.reasons, usage },
            );
            this.record(request.featureId, rejected);
            return rejected;
          }

          if (cacheTtlMs > 0) {
            this.cache.set(key, {
              value: validation.value,
              expiresAt: Date.now() + cacheTtlMs,
              lastAccessedAt: Date.now(),
              usage,
            });
            this.pruneCache();
          }
          const accepted = this.outcome<T>('accepted', validation.value, startedAt, {
            attempts,
            usage,
          });
          this.record(request.featureId, accepted);
          return accepted;
        } catch (error) {
          lastError = error;
          const lifecycle = lifecycleStatus(error);
          if (lifecycle) {
            const stopped = this.outcome<T>(lifecycle, null, startedAt, {
              attempts,
              reasons: [lifecycle],
            });
            this.record(request.featureId, stopped);
            return stopped;
          }
          if (attempts <= maxRetries && retryable(error)) {
            diagnostics.retries += 1;
            continue;
          }
          break;
        }
      }

      const failed = this.outcome<T>('provider_failed', null, startedAt, {
        attempts,
        reasons: [String((lastError as { code?: unknown } | null)?.code ?? 'provider_error')],
      });
      this.record(request.featureId, failed);
      return failed;
    })();

    this.inFlight.set(key, execution as Promise<ECSAIRequestOutcome<unknown>>);
    try {
      return await execution;
    } finally {
      if (this.inFlight.get(key) === execution) this.inFlight.delete(key);
    }
  }

  snapshot(): ECSAIRequestDiagnosticsSnapshot {
    const features: Partial<Record<ECSAIFeatureId, ECSAIRequestFeatureDiagnostics>> = {};
    for (const [featureId, value] of this.diagnostics.entries()) {
      features[featureId] = {
        ...value,
        latencyBuckets: { ...value.latencyBuckets },
        tokenBuckets: { ...value.tokenBuckets },
        costBuckets: { ...value.costBuckets },
      };
    }
    return {
      schemaVersion: ECS_AI_REQUEST_DIAGNOSTICS_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      inFlightRequests: this.inFlight.size,
      cacheEntries: this.cache.size,
      features,
    };
  }

  resetForTests(): void {
    this.inFlight.clear();
    this.cache.clear();
    this.diagnostics.clear();
  }
}

export const ecsAIRequestCoordinator = new ECSAIRequestCoordinator();

export function getECSAIRequestDiagnostics(): ECSAIRequestDiagnosticsSnapshot {
  return ecsAIRequestCoordinator.snapshot();
}

export function resetECSAIRequestCoordinatorForTests(): void {
  ecsAIRequestCoordinator.resetForTests();
}
