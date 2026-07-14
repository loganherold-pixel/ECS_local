import { ecsLog } from '../ecsLogger';
import type { ECSPerformanceWorkflowId } from './performanceBudgets';

export const ECS_PERFORMANCE_SCHEMA_VERSION = 1;
export const ECS_PERFORMANCE_DEBUG_FLAG = 'ECS_DEBUG_PERFORMANCE';

export type ECSPerformanceSpanStatus = 'completed' | 'failed' | 'cancelled';

export type ECSPerformanceSpanRecord = {
  id: number;
  workflowId: ECSPerformanceWorkflowId;
  operation: string;
  startedAtMs: number;
  endedAtMs: number;
  durationMs: number;
  status: ECSPerformanceSpanStatus;
  metadata?: Record<string, string | number | boolean | null>;
};

export type ECSPerformanceCounterRecord = {
  workflowId: ECSPerformanceWorkflowId;
  counter: string;
  value: number;
};

export type ECSPerformanceSnapshot = {
  schemaVersion: number;
  generatedAt: string;
  enabled: boolean;
  spans: ECSPerformanceSpanRecord[];
  counters: ECSPerformanceCounterRecord[];
  activeSpanCount: number;
  outstandingAsyncJobs: number;
  peakOutstandingAsyncJobs: number;
  activeSubscriptionCount: number;
};

export type ECSPerformanceSpanHandle = {
  readonly joined: boolean;
  end: (status?: ECSPerformanceSpanStatus, metadata?: Record<string, unknown>) => void;
  cancel: (metadata?: Record<string, unknown>) => void;
};

type CollectorOptions = {
  enabled: boolean;
  now?: () => number;
  maxSpans?: number;
  longTaskThresholdMs?: number;
  onRecord?: (record: ECSPerformanceSpanRecord) => void;
};

type StartSpanOptions = {
  trackOutstanding?: boolean;
  metadata?: Record<string, unknown>;
};

const SENSITIVE_METADATA_KEY = /(token|secret|password|credential|authorization|cookie|email|user.?id|actor|recipient|latitude|longitude|coordinate|trace|payload)/i;
const MAX_OPERATION_LENGTH = 72;
const DEFAULT_MAX_SPANS = 240;
const DEFAULT_LONG_TASK_THRESHOLD_MS = 50;

function getNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    const value = performance.now();
    if (Number.isFinite(value)) return value;
  }
  return Date.now();
}

function safeOperation(value: string): string {
  const normalized = String(value || 'operation').replace(/[^a-z0-9_.:-]/gi, '_');
  return normalized.slice(0, MAX_OPERATION_LENGTH) || 'operation';
}

function internalFingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function sanitizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;
  const output: Record<string, string | number | boolean | null> = {};
  Object.entries(metadata).slice(0, 16).forEach(([key, value]) => {
    if (SENSITIVE_METADATA_KEY.test(key)) return;
    if (value === null || typeof value === 'string' || typeof value === 'boolean') {
      output[key] = typeof value === 'string' ? value.slice(0, 80) : value;
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      output[key] = Math.round(value * 100) / 100;
    }
  });
  return Object.keys(output).length > 0 ? output : undefined;
}

function readRuntimeFlag(key: string): unknown {
  try {
    const store = globalThis as unknown as Record<string, unknown>;
    const env = (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env;
    return store[key] ?? store[`__${key}`] ?? env?.[key] ?? env?.[`EXPO_PUBLIC_${key}`];
  } catch {
    return undefined;
  }
}

function truthy(value: unknown): boolean {
  return value === true || (typeof value === 'string' && /^(1|true|yes|on)$/i.test(value.trim()));
}

export function isECSPerformanceInstrumentationEnabled(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export function isECSPerformanceDebugEnabled(): boolean {
  return isECSPerformanceInstrumentationEnabled() && truthy(readRuntimeFlag(ECS_PERFORMANCE_DEBUG_FLAG));
}

export class ECSPerformanceCollector {
  private readonly enabled: boolean;
  private readonly now: () => number;
  private readonly maxSpans: number;
  private readonly longTaskThresholdMs: number;
  private readonly onRecord?: (record: ECSPerformanceSpanRecord) => void;
  private readonly spans: ECSPerformanceSpanRecord[] = [];
  private readonly counters = new Map<string, ECSPerformanceCounterRecord>();
  private readonly activeSpans = new Map<number, { trackOutstanding: boolean }>();
  private readonly activeRequests = new Map<string, ECSPerformanceSpanHandle>();
  private readonly subscriptions = new Map<string, number>();
  private nextId = 1;
  private outstandingAsyncJobs = 0;
  private peakOutstandingAsyncJobs = 0;

  constructor(options: CollectorOptions) {
    this.enabled = options.enabled;
    this.now = options.now ?? getNow;
    this.maxSpans = Math.max(20, options.maxSpans ?? DEFAULT_MAX_SPANS);
    this.longTaskThresholdMs = Math.max(1, options.longTaskThresholdMs ?? DEFAULT_LONG_TASK_THRESHOLD_MS);
    this.onRecord = options.onRecord;
  }

  startSpan(
    workflowId: ECSPerformanceWorkflowId,
    operation: string,
    options: StartSpanOptions = {},
  ): ECSPerformanceSpanHandle {
    if (!this.enabled) return NOOP_SPAN;
    if (this.activeSpans.size >= this.maxSpans) {
      this.increment(workflowId, 'dropped_spans');
      return NOOP_SPAN;
    }
    const id = this.nextId++;
    const startedAtMs = this.now();
    const normalizedOperation = safeOperation(operation);
    const initialMetadata = sanitizeMetadata(options.metadata);
    let settled = false;
    this.activeSpans.set(id, { trackOutstanding: options.trackOutstanding === true });
    if (options.trackOutstanding) {
      this.outstandingAsyncJobs += 1;
      this.peakOutstandingAsyncJobs = Math.max(this.peakOutstandingAsyncJobs, this.outstandingAsyncJobs);
    }

    const finish = (status: ECSPerformanceSpanStatus, metadata?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      const endedAtMs = this.now();
      const active = this.activeSpans.get(id);
      this.activeSpans.delete(id);
      if (active?.trackOutstanding) {
        this.outstandingAsyncJobs = Math.max(0, this.outstandingAsyncJobs - 1);
      }
      const record: ECSPerformanceSpanRecord = {
        id,
        workflowId,
        operation: normalizedOperation,
        startedAtMs,
        endedAtMs,
        durationMs: Math.max(0, Math.round((endedAtMs - startedAtMs) * 10) / 10),
        status,
        metadata: { ...initialMetadata, ...sanitizeMetadata(metadata) },
      };
      if (!record.metadata || Object.keys(record.metadata).length === 0) delete record.metadata;
      this.spans.push(record);
      if (this.spans.length > this.maxSpans) this.spans.splice(0, this.spans.length - this.maxSpans);
      this.onRecord?.(record);
    };

    return {
      joined: false,
      end: (status = 'completed', metadata) => finish(status, metadata),
      cancel: metadata => finish('cancelled', metadata),
    };
  }

  startRequest(
    workflowId: ECSPerformanceWorkflowId,
    operation: string,
    requestKey: string,
    metadata?: Record<string, unknown>,
  ): ECSPerformanceSpanHandle {
    if (!this.enabled) return NOOP_SPAN;
    const internalKey = `${workflowId}:${safeOperation(operation)}:${internalFingerprint(requestKey)}`;
    if (this.activeRequests.has(internalKey)) {
      this.increment(workflowId, 'repeated_requests');
      return JOINED_SPAN;
    }
    const span = this.startSpan(workflowId, operation, { trackOutstanding: true, metadata });
    this.activeRequests.set(internalKey, span);
    let settled = false;
    const release = (status: ECSPerformanceSpanStatus, endMetadata?: Record<string, unknown>) => {
      if (settled) return;
      settled = true;
      this.activeRequests.delete(internalKey);
      span.end(status, endMetadata);
    };
    return {
      joined: false,
      end: (status = 'completed', endMetadata) => release(status, endMetadata),
      cancel: endMetadata => release('cancelled', endMetadata),
    };
  }

  increment(workflowId: ECSPerformanceWorkflowId, counter: string, amount = 1): void {
    if (!this.enabled || !Number.isFinite(amount)) return;
    const safeCounter = safeOperation(counter);
    const key = `${workflowId}:${safeCounter}`;
    const current = this.counters.get(key);
    this.counters.set(key, {
      workflowId,
      counter: safeCounter,
      value: Math.max(0, (current?.value ?? 0) + amount),
    });
  }

  registerSubscription(
    workflowId: ECSPerformanceWorkflowId,
    subscriptionKind: string,
    identity: string,
  ): () => void {
    if (!this.enabled) return () => undefined;
    const key = `${workflowId}:${safeOperation(subscriptionKind)}:${internalFingerprint(identity)}`;
    if (!this.subscriptions.has(key) && this.subscriptions.size >= this.maxSpans) {
      this.increment(workflowId, 'dropped_subscriptions');
      return () => undefined;
    }
    const count = (this.subscriptions.get(key) ?? 0) + 1;
    this.subscriptions.set(key, count);
    if (count > 1) this.increment(workflowId, 'duplicate_subscriptions');
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.subscriptions.get(key) ?? 0;
      if (current <= 1) this.subscriptions.delete(key);
      else this.subscriptions.set(key, current - 1);
    };
  }

  measureSync<T>(
    workflowId: ECSPerformanceWorkflowId,
    operation: string,
    callback: () => T,
    metadata?: Record<string, unknown>,
  ): T {
    if (!this.enabled) return callback();
    const span = this.startSpan(workflowId, operation, { metadata });
    const startedAtMs = this.now();
    try {
      const value = callback();
      const durationMs = Math.max(0, this.now() - startedAtMs);
      if (durationMs >= this.longTaskThresholdMs) this.increment(workflowId, 'long_sync_tasks');
      span.end('completed', { longTask: durationMs >= this.longTaskThresholdMs });
      return value;
    } catch (error) {
      span.end('failed');
      throw error;
    }
  }

  snapshot(): ECSPerformanceSnapshot {
    return {
      schemaVersion: ECS_PERFORMANCE_SCHEMA_VERSION,
      generatedAt: new Date().toISOString(),
      enabled: this.enabled,
      spans: this.spans.map(span => ({ ...span, metadata: span.metadata ? { ...span.metadata } : undefined })),
      counters: Array.from(this.counters.values()).map(counter => ({ ...counter })),
      activeSpanCount: this.activeSpans.size,
      outstandingAsyncJobs: this.outstandingAsyncJobs,
      peakOutstandingAsyncJobs: this.peakOutstandingAsyncJobs,
      activeSubscriptionCount: Array.from(this.subscriptions.values()).reduce((sum, count) => sum + count, 0),
    };
  }

  reset(): void {
    this.spans.length = 0;
    this.counters.clear();
    this.activeSpans.clear();
    this.activeRequests.clear();
    this.subscriptions.clear();
    this.outstandingAsyncJobs = 0;
    this.peakOutstandingAsyncJobs = 0;
  }
}

const NOOP_SPAN: ECSPerformanceSpanHandle = Object.freeze({
  joined: false,
  end: () => undefined,
  cancel: () => undefined,
});

const JOINED_SPAN: ECSPerformanceSpanHandle = Object.freeze({
  joined: true,
  end: () => undefined,
  cancel: () => undefined,
});

const runtimeCollector = new ECSPerformanceCollector({
  enabled: isECSPerformanceInstrumentationEnabled(),
  onRecord: record => {
    if (!isECSPerformanceDebugEnabled()) return;
    ecsLog.dev('SYSTEM', '[PERFORMANCE] span_completed', {
      workflowId: record.workflowId,
      operation: record.operation,
      durationMs: record.durationMs,
      status: record.status,
      ...record.metadata,
    }, {
      tag: 'ECS_PERF',
      debugFlag: ECS_PERFORMANCE_DEBUG_FLAG,
      throttleMs: 250,
      aggregateWindowMs: 2_000,
    });
  },
});

export function startECSPerformanceSpan(
  workflowId: ECSPerformanceWorkflowId,
  operation: string,
  options?: StartSpanOptions,
): ECSPerformanceSpanHandle {
  return runtimeCollector.startSpan(workflowId, operation, options);
}

export function startECSPerformanceRequest(
  workflowId: ECSPerformanceWorkflowId,
  operation: string,
  requestKey: string,
  metadata?: Record<string, unknown>,
): ECSPerformanceSpanHandle {
  return runtimeCollector.startRequest(workflowId, operation, requestKey, metadata);
}

export function incrementECSPerformanceCounter(
  workflowId: ECSPerformanceWorkflowId,
  counter: string,
  amount = 1,
): void {
  runtimeCollector.increment(workflowId, counter, amount);
}

export function recordECSPerformanceRender(
  workflowId: ECSPerformanceWorkflowId,
  surface: string,
): void {
  runtimeCollector.increment(workflowId, `render_${safeOperation(surface)}`);
}

export function registerECSPerformanceSubscription(
  workflowId: ECSPerformanceWorkflowId,
  subscriptionKind: string,
  identity: string,
): () => void {
  return runtimeCollector.registerSubscription(workflowId, subscriptionKind, identity);
}

export function measureECSPerformanceSync<T>(
  workflowId: ECSPerformanceWorkflowId,
  operation: string,
  callback: () => T,
  metadata?: Record<string, unknown>,
): T {
  return runtimeCollector.measureSync(workflowId, operation, callback, metadata);
}

export function getECSPerformanceSnapshot(): ECSPerformanceSnapshot {
  return runtimeCollector.snapshot();
}

export function resetECSPerformanceDiagnostics(): void {
  runtimeCollector.reset();
}
