/**
 * ECS Logger — Centralized Error & Diagnostic Logging
 * Phase 10: Stability + Crash Protection Layer
 *
 * Provides structured logging for critical ECS system errors.
 * Logs are console-only (no intrusive alerts to the user).
 *
 * Categories:
 *   - WIDGET: Widget render failures
 *   - WEIGHT: Weight calculation errors
 *   - GPS: GPS signal issues
 *   - GPX: Route file import errors
 *   - TELEMETRY: Telemetry polling failures
 *   - CONFIG: Vehicle configuration issues
 *   - DISCOVERY: Trail/discovery data errors
 *   - CAMPOPS: CampOps recommendation diagnostics
 *   - ATTITUDE: Attitude monitor calculation errors
 *   - MAP: Map initialization errors
 *   - SYSTEM: General system errors
 */

import {
  createECSDiagnosticToken,
  fingerprintECSDiagnosticValue,
  sanitizeECSDiagnosticText,
  sanitizeECSDiagnosticValue,
  type ECSDiagnosticValue,
} from './observability/ecsDiagnosticRedaction';
import {
  createECSErrorDiagnostic,
  normalizeECSSafeCode,
  type ECSErrorDiagnostic,
  type ECSErrorDiagnosticInput,
  type ECSErrorSeverity,
  type ECSObservabilityDomain,
  type ECSObservabilitySourceState,
} from './observability/ecsErrorContract';

export type EcsLogCategory =
  | 'WIDGET'
  | 'WEIGHT'
  | 'GPS'
  | 'GPX'
  | 'TELEMETRY'
  | 'WEATHER'
  | 'DEDUPE'
  | 'POWER'
  | 'SHELL'
  | 'AUTH'
  | 'SYNC'
  | 'DISPATCH'
  | 'EXPEDITION'
  | 'OFFLINE'
  | 'DEVICE'
  | 'REALTIME'
  | 'PROVIDER'
  | 'PERSISTENCE'
  | 'CONFIG'
  | 'DISCOVERY'
  | 'ROUTE_CONTEXT'
  | 'CAMPOPS'
  | 'ATTITUDE'
  | 'MAP'
  | 'SYSTEM';

export type EcsLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
export type EcsConsoleVisibility = 'warn' | 'info' | 'debug';
export type EcsLogDetails = object;

export interface EcsLogEntry {
  timestamp: string;
  level: EcsLogLevel;
  category: EcsLogCategory;
  message: string;
  details?: Record<string, ECSDiagnosticValue>;
}

export type ECSBreadcrumbInput = {
  domain: ECSObservabilityDomain;
  operation: string;
  code: string;
  status?: 'started' | 'completed' | 'failed' | 'cancelled' | 'degraded' | 'info';
  sourceState?: ECSObservabilitySourceState;
  correlationId?: string | null;
  featureFlag?: string | null;
  context?: Record<string, unknown>;
  occurredAt?: string;
};

export type ECSBreadcrumb = {
  occurredAt: string;
  domain: string;
  operation: string;
  code: string;
  status: 'started' | 'completed' | 'failed' | 'cancelled' | 'degraded' | 'info';
  sourceState: ECSObservabilitySourceState;
  correlationId: string | null;
  featureFlag: string | null;
  context: Record<string, ECSDiagnosticValue>;
};

export type ECSFailureCaptureOptions = {
  category?: EcsLogCategory;
  dedupeWindowMs?: number;
  fingerprint?: string;
  nowMs?: number;
};

export type ECSFailureCaptureResult = {
  diagnostic: ECSErrorDiagnostic;
  emitted: boolean;
  suppressedRepeats: number;
};

// ── In-memory log buffer (last 100 entries) ──────────────
const LOG_BUFFER_SIZE = 100;
const BREADCRUMB_BUFFER_SIZE = 80;
const FAILURE_DEDUPE_LIMIT = 200;
const DEFAULT_FAILURE_DEDUPE_WINDOW_MS = 30_000;
const logBuffer: EcsLogEntry[] = [];
const breadcrumbBuffer: ECSBreadcrumb[] = [];
const logOnceCache = new Set<string>();
const failureDedupeState = new Map<string, {
  lastEmittedAt: number;
  suppressedCount: number;
}>();
let suppressedFailureCount = 0;

// ── Telemetry failure tracking ───────────────────────────
const failureCounts: Record<string, number> = {};
const FAILURE_THRESHOLD = 3; // After 3 consecutive failures, revert to placeholder

const DEBUG_CATEGORY_ALIASES = {
  shell: 'SHELL',
  weather: 'WEATHER',
  dedupe: 'DEDUPE',
  telemetry: 'TELEMETRY',
  power: 'POWER',
  auth: 'AUTH',
  sync: 'SYNC',
  dispatch: 'DISPATCH',
  expedition: 'EXPEDITION',
  offline: 'OFFLINE',
  device: 'DEVICE',
  realtime: 'REALTIME',
  provider: 'PROVIDER',
  persistence: 'PERSISTENCE',
  discovery: 'DISCOVERY',
  route_context: 'ROUTE_CONTEXT',
  routeContext: 'ROUTE_CONTEXT',
  campops: 'CAMPOPS',
  gps: 'GPS',
  map: 'MAP',
  system: 'SYSTEM',
} as const satisfies Record<string, EcsLogCategory>;

const DEBUG_CATEGORY_VALUES = new Set<EcsLogCategory>(Object.values(DEBUG_CATEGORY_ALIASES));
const devLogThrottleState = new Map<string, {
  lastEmittedAt: number;
  windowStartedAt: number;
  suppressedCount: number;
  lastDetails?: Record<string, ECSDiagnosticValue>;
}>();

function readGlobalValue<T>(key: string): T | undefined {
  try {
    return (globalThis as unknown as Record<string, T | undefined>)[key];
  } catch {
    return undefined;
  }
}

function normalizeConsoleVisibility(value: unknown): EcsConsoleVisibility {
  if (typeof value !== 'string') return 'warn';
  const normalized = value.trim().toLowerCase();
  if (normalized === 'debug') return 'debug';
  if (normalized === 'info') return 'info';
  return 'warn';
}

function normalizeDebugCategory(value: unknown): EcsLogCategory | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const upper = trimmed.toUpperCase() as EcsLogCategory;
  if (DEBUG_CATEGORY_VALUES.has(upper)) return upper;
  return DEBUG_CATEGORY_ALIASES[trimmed.toLowerCase() as keyof typeof DEBUG_CATEGORY_ALIASES] ?? null;
}

function getConfiguredConsoleVisibility(): EcsConsoleVisibility {
  return normalizeConsoleVisibility(readGlobalValue('__ECS_LOG_LEVEL'));
}

function getConfiguredDebugCategories(): Set<EcsLogCategory> {
  const raw = readGlobalValue<unknown>('__ECS_DEBUG_CATEGORIES');
  if (!raw) return new Set();

  if (Array.isArray(raw)) {
    return new Set(raw.map(normalizeDebugCategory).filter((value): value is EcsLogCategory => value !== null));
  }

  if (typeof raw === 'string') {
    return new Set(
      raw
        .split(',')
        .map(normalizeDebugCategory)
        .filter((value): value is EcsLogCategory => value !== null),
    );
  }

  return new Set();
}

function readProcessEnvValue(key: string): string | undefined {
  try {
    return (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[key];
  } catch {
    return undefined;
  }
}

function isTruthyDebugValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function isDevelopmentRuntime(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

function isApprovedSupportDiagnosticsEnabled(): boolean {
  const globalStore = globalThis as unknown as Record<string, unknown>;
  return (
    (
      isTruthyDebugValue(globalStore.__ECS_SUPPORT_DIAGNOSTICS_ENABLED)
      || isTruthyDebugValue(readProcessEnvValue('ECS_SUPPORT_DIAGNOSTICS_ENABLED'))
    )
    && (
      isTruthyDebugValue(globalStore.__ECS_SUPPORT_DIAGNOSTICS_APPROVED)
      || isTruthyDebugValue(readProcessEnvValue('ECS_SUPPORT_DIAGNOSTICS_APPROVED'))
    )
  );
}

function canCaptureDetailedDiagnostics(): boolean {
  return isDevelopmentRuntime() || isApprovedSupportDiagnosticsEnabled();
}

function getCategoryDebugFlagName(category: EcsLogCategory): string {
  return `ECS_DEBUG_${category}`;
}

function isExplicitDevDebugEnabled(category: EcsLogCategory, debugFlag?: string): boolean {
  if (!canCaptureDetailedDiagnostics()) return false;
  const globalStore = globalThis as unknown as Record<string, unknown>;
  const flag = debugFlag || getCategoryDebugFlagName(category);
  const alternateGlobalFlag = flag.startsWith('__') ? flag : `__${flag}`;
  if (isTruthyDebugValue(globalStore[flag]) || isTruthyDebugValue(globalStore[alternateGlobalFlag])) return true;
  if (isTruthyDebugValue(readProcessEnvValue(flag)) || isTruthyDebugValue(readProcessEnvValue(`EXPO_PUBLIC_${flag}`))) return true;
  return getConfiguredDebugCategories().has(category) || getConfiguredConsoleVisibility() === 'debug';
}

function shouldPrintToConsole(level: EcsLogLevel, category: EcsLogCategory): boolean {
  if (level === 'CRITICAL' || level === 'ERROR' || level === 'WARN') {
    return true;
  }

  if (!canCaptureDetailedDiagnostics()) return false;

  const visibility = getConfiguredConsoleVisibility();
  if (visibility === 'debug') return true;
  if (level === 'INFO' && visibility === 'info') return true;

  const debugCategories = getConfiguredDebugCategories();
  return debugCategories.has(category);
}

function emitConsole(
  level: EcsLogLevel,
  category: EcsLogCategory,
  message: string,
  details?: Record<string, ECSDiagnosticValue>,
): void {
  if (!shouldPrintToConsole(level, category)) return;

  const tag = level === 'CRITICAL'
    ? `${formatTag(category)} CRITICAL:`
    : formatTag(category);

  if (level === 'CRITICAL' || level === 'ERROR') {
    console.error(tag, message, details || '');
    return;
  }

  if (level === 'WARN') {
    console.warn(tag, message, details || '');
    return;
  }

  console.log(tag, message, details || '');
}

function emitDevConsole(
  category: EcsLogCategory,
  message: string,
  details?: Record<string, ECSDiagnosticValue>,
  tag?: string,
): void {
  const prefix = tag || formatTag(category);
  if (details) console.log(prefix, message, details);
  else console.log(prefix, message);
}

function stableDetailsFingerprint(details?: object): string {
  return details ? fingerprintECSDiagnosticValue(details) : '';
}

function createEntry(
  level: EcsLogLevel,
  category: EcsLogCategory,
  message: string,
  details?: EcsLogDetails,
): EcsLogEntry {
  const sanitizedDetails = details
    ? sanitizeECSDiagnosticValue(details, {
        maxDepth: 5,
        maxArrayLength: 20,
        maxObjectKeys: 28,
        maxStringLength: 500,
      }) as Record<string, ECSDiagnosticValue>
    : undefined;
  return {
    timestamp: new Date().toISOString(),
    level,
    category,
    message: sanitizeECSDiagnosticText(message, 500),
    details: sanitizedDetails,
  };
}

function pushToBuffer(entry: EcsLogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

function pushBreadcrumb(entry: ECSBreadcrumb): void {
  breadcrumbBuffer.push(entry);
  if (breadcrumbBuffer.length > BREADCRUMB_BUFFER_SIZE) {
    breadcrumbBuffer.splice(0, breadcrumbBuffer.length - BREADCRUMB_BUFFER_SIZE);
  }
}

function writeEntry(
  level: EcsLogLevel,
  category: EcsLogCategory,
  message: string,
  details?: EcsLogDetails,
): EcsLogEntry {
  const entry = createEntry(level, category, message, details);
  pushToBuffer(entry);
  emitConsole(level, category, entry.message, entry.details);
  return entry;
}

function pruneFailureDedupeState(): void {
  if (failureDedupeState.size <= FAILURE_DEDUPE_LIMIT) return;
  const removeCount = failureDedupeState.size - FAILURE_DEDUPE_LIMIT;
  const oldest = [...failureDedupeState.entries()]
    .sort((left, right) => left[1].lastEmittedAt - right[1].lastEmittedAt)
    .slice(0, removeCount);
  oldest.forEach(([key]) => failureDedupeState.delete(key));
}

function categoryForDomain(domain: string): EcsLogCategory {
  const normalized = domain.toLowerCase();
  if (normalized.includes('auth')) return 'AUTH';
  if (normalized.includes('weather')) return 'WEATHER';
  if (normalized.includes('dispatch')) return 'DISPATCH';
  if (normalized.includes('expedition')) return 'EXPEDITION';
  if (normalized.includes('offline')) return 'OFFLINE';
  if (normalized.includes('realtime')) return 'REALTIME';
  if (normalized.includes('device') || normalized.includes('telemetry')) return 'DEVICE';
  if (normalized.includes('persist') || normalized.includes('storage')) return 'PERSISTENCE';
  if (normalized.includes('provider') || normalized.includes('supabase')) return 'PROVIDER';
  if (normalized.includes('route')) return 'ROUTE_CONTEXT';
  if (normalized.includes('map') || normalized.includes('navigate')) return 'MAP';
  if (normalized.includes('widget') || normalized.includes('dashboard')) return 'WIDGET';
  if (normalized.includes('sync')) return 'SYNC';
  return 'SYSTEM';
}

function logLevelForSeverity(severity: ECSErrorSeverity): EcsLogLevel {
  if (severity === 'critical') return 'CRITICAL';
  if (severity === 'error') return 'ERROR';
  if (severity === 'warning') return 'WARN';
  if (severity === 'info') return 'INFO';
  return 'DEBUG';
}

function formatTag(category: EcsLogCategory): string {
  return `[ECS:${category}]`;
}

// ── Public API ───────────────────────────────────────────

export const ecsLog = {
  /** Log debug diagnostics (suppressed by default) */
  debug(category: EcsLogCategory, message: string, details?: EcsLogDetails): void {
    if (!canCaptureDetailedDiagnostics()) return;
    writeEntry('DEBUG', category, message, details);
  },

  /**
   * Debug-only developer diagnostics for high-frequency lifecycle paths.
   * First occurrence is emitted when the category/debug flag is enabled; repeated
   * identical entries are aggregated so polling/render loops stay readable.
   */
  dev(
    category: EcsLogCategory,
    message: string,
    details?: EcsLogDetails,
    options?: {
      tag?: string;
      debugFlag?: string;
      fingerprint?: string;
      throttleMs?: number;
      aggregateWindowMs?: number;
      nowMs?: number;
    },
  ): void {
    if (!isExplicitDevDebugEnabled(category, options?.debugFlag)) return;

    const sanitizedDetails = details
      ? sanitizeECSDiagnosticValue(details, {
          maxDepth: 5,
          maxArrayLength: 20,
          maxObjectKeys: 28,
          maxStringLength: 500,
        }) as Record<string, ECSDiagnosticValue>
      : undefined;

    const now = options?.nowMs ?? Date.now();
    const throttleMs = options?.throttleMs ?? 2500;
    const aggregateWindowMs = options?.aggregateWindowMs ?? 10_000;
    const key = [
      category,
      message,
      options?.fingerprint ?? stableDetailsFingerprint(sanitizedDetails),
    ].join('::');
    const state = devLogThrottleState.get(key);

    if (state && now - state.lastEmittedAt < throttleMs) {
      state.suppressedCount += 1;
      state.lastDetails = sanitizedDetails;
      return;
    }

    if (state?.suppressedCount) {
      const elapsedMs = Math.max(1, Math.min(aggregateWindowMs, now - state.windowStartedAt));
      emitDevConsole(
        category,
        `${message} repeated ${state.suppressedCount}x in ${Math.max(1, Math.round(elapsedMs / 1000))}s`,
        state.lastDetails,
        options?.tag,
      );
    }

    const entry = createEntry('DEBUG', category, message, sanitizedDetails);
    pushToBuffer(entry);
    emitDevConsole(category, entry.message, entry.details, options?.tag);
    devLogThrottleState.set(key, {
      lastEmittedAt: now,
      windowStartedAt: state && now - state.windowStartedAt < aggregateWindowMs ? state.windowStartedAt : now,
      suppressedCount: 0,
      lastDetails: sanitizedDetails,
    });
  },

  /** Log informational message (not an error) */
  info(category: EcsLogCategory, message: string, details?: EcsLogDetails): void {
    writeEntry('INFO', category, message, details);
  },

  /** Log a warning (potential issue, not critical) */
  warn(category: EcsLogCategory, message: string, details?: EcsLogDetails): void {
    writeEntry('WARN', category, message, details);
  },

  /** Log a warning only once for a stable dedupe key. */
  warnOnce(category: EcsLogCategory, dedupeKey: string, message: string, details?: EcsLogDetails): void {
    const key = `WARN:${category}:${fingerprintECSDiagnosticValue(dedupeKey)}`;
    if (logOnceCache.has(key)) return;
    logOnceCache.add(key);
    ecsLog.warn(category, message, details);
  },

  /** Log an error (something failed, but app continues) */
  error(category: EcsLogCategory, message: string, error?: unknown, details?: EcsLogDetails): void {
    writeEntry('ERROR', category, message, {
      ...details,
      ...(error ? { cause: error } : {}),
    });
  },

  /** Log a critical error (system-level failure) */
  critical(category: EcsLogCategory, message: string, error?: unknown, details?: EcsLogDetails): void {
    writeEntry('CRITICAL', category, message, {
      ...details,
      ...(error ? { cause: error } : {}),
    });
  },

  /** Capture a typed operational failure with bounded repeat suppression. */
  captureFailure(
    input: ECSErrorDiagnosticInput,
    error?: unknown,
    options: ECSFailureCaptureOptions = {},
  ): ECSFailureCaptureResult {
    const diagnostic = createECSErrorDiagnostic(input, error);
    const now = options.nowMs ?? Date.now();
    const dedupeWindowMs = Math.max(0, options.dedupeWindowMs ?? DEFAULT_FAILURE_DEDUPE_WINDOW_MS);
    const dedupeKey = options.fingerprint
      ? fingerprintECSDiagnosticValue(options.fingerprint)
      : [
          diagnostic.domain,
          diagnostic.operation,
          diagnostic.code,
          diagnostic.requestId ?? '',
          diagnostic.correlationId ?? '',
          diagnostic.sourceState,
        ].join(':');
    const existing = failureDedupeState.get(dedupeKey);

    if (existing && now - existing.lastEmittedAt < dedupeWindowMs) {
      existing.suppressedCount += 1;
      suppressedFailureCount += 1;
      return {
        diagnostic,
        emitted: false,
        suppressedRepeats: existing.suppressedCount,
      };
    }

    const suppressedRepeats = existing?.suppressedCount ?? 0;
    failureDedupeState.set(dedupeKey, {
      lastEmittedAt: now,
      suppressedCount: 0,
    });
    pruneFailureDedupeState();

    const level = logLevelForSeverity(diagnostic.severity);
    const category = options.category ?? categoryForDomain(diagnostic.domain);
    writeEntry(level, category, `Failure ${diagnostic.code}`, {
      errorKind: diagnostic.kind,
      domain: diagnostic.domain,
      operation: diagnostic.operation,
      safeCode: diagnostic.code,
      severity: diagnostic.severity,
      recoverability: diagnostic.recoverability,
      retryability: diagnostic.retryability,
      sourceState: diagnostic.sourceState,
      requestId: diagnostic.requestId,
      correlationId: diagnostic.correlationId,
      featureFlag: diagnostic.featureFlag,
      redactedContext: diagnostic.context,
      cause: diagnostic.cause,
      ...(suppressedRepeats > 0 ? { suppressedRepeats } : {}),
    });

    return {
      diagnostic,
      emitted: true,
      suppressedRepeats,
    };
  },

  /** Record a privacy-safe lifecycle breadcrumb without producing console output. */
  breadcrumb(input: ECSBreadcrumbInput): void {
    const domain = sanitizeECSDiagnosticText(input.domain, 72)
      .toLowerCase()
      .replace(/[^a-z0-9_.:-]/g, '_');
    const operation = sanitizeECSDiagnosticText(input.operation, 72)
      .toLowerCase()
      .replace(/[^a-z0-9_.:-]/g, '_');
    const context = sanitizeECSDiagnosticValue(input.context ?? {}, {
      maxDepth: 4,
      maxArrayLength: 16,
      maxObjectKeys: 24,
      maxStringLength: 320,
    }) as Record<string, ECSDiagnosticValue>;
    pushBreadcrumb({
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      domain: domain || 'system',
      operation: operation || 'operation',
      code: normalizeECSSafeCode(input.code),
      status: input.status ?? 'info',
      sourceState: input.sourceState ?? 'unknown',
      correlationId: createECSDiagnosticToken('correlation', input.correlationId),
      featureFlag: input.featureFlag
        ? sanitizeECSDiagnosticText(input.featureFlag, 72).replace(/[^a-z0-9_.:-]/gi, '_').toLowerCase()
        : null,
      context,
    });
  },

  getRecentBreadcrumbs(count: number = 20): ECSBreadcrumb[] {
    const limit = Math.max(0, Math.floor(count));
    if (limit === 0) return [];
    return breadcrumbBuffer.slice(-limit).map((entry) => ({
      ...entry,
      context: { ...entry.context },
    }));
  },

  getDiagnostics(): {
    logEntryCount: number;
    breadcrumbCount: number;
    failureDedupeKeyCount: number;
    suppressedFailureCount: number;
    detailedDiagnosticsAllowed: boolean;
    approvedSupportMode: boolean;
  } {
    return {
      logEntryCount: logBuffer.length,
      breadcrumbCount: breadcrumbBuffer.length,
      failureDedupeKeyCount: failureDedupeState.size,
      suppressedFailureCount,
      detailedDiagnosticsAllowed: canCaptureDetailedDiagnostics(),
      approvedSupportMode: isApprovedSupportDiagnosticsEnabled(),
    };
  },

  /** Get the last N log entries */
  getRecentLogs(count: number = 20): EcsLogEntry[] {
    const limit = Math.max(0, Math.floor(count));
    if (limit === 0) return [];
    return logBuffer.slice(-limit).map((entry) => ({
      ...entry,
      details: entry.details ? { ...entry.details } : undefined,
    }));
  },

  /** Get logs filtered by category */
  getLogsByCategory(category: EcsLogCategory, count: number = 20): EcsLogEntry[] {
    const limit = Math.max(0, Math.floor(count));
    if (limit === 0) return [];
    return logBuffer
      .filter(e => e.category === category)
      .slice(-limit)
      .map((entry) => ({ ...entry, details: entry.details ? { ...entry.details } : undefined }));
  },

  /** Get logs filtered by level */
  getLogsByLevel(level: EcsLogLevel, count: number = 20): EcsLogEntry[] {
    const limit = Math.max(0, Math.floor(count));
    if (limit === 0) return [];
    return logBuffer
      .filter(e => e.level === level)
      .slice(-limit)
      .map((entry) => ({ ...entry, details: entry.details ? { ...entry.details } : undefined }));
  },

  /** Clear all logs */
  clear(): void {
    logBuffer.length = 0;
    breadcrumbBuffer.length = 0;
    logOnceCache.clear();
    devLogThrottleState.clear();
    failureDedupeState.clear();
    suppressedFailureCount = 0;
    Object.keys(failureCounts).forEach((source) => delete failureCounts[source]);
  },

  /** Get total log count */
  count(): number {
    return logBuffer.length;
  },

  // ── Telemetry failure tracking ─────────────────────────

  /** Record a telemetry failure for a specific source */
  recordTelemetryFailure(source: string): number {
    failureCounts[source] = (failureCounts[source] || 0) + 1;
    const count = failureCounts[source];
    if (count >= FAILURE_THRESHOLD) {
      ecsLog.captureFailure({
        kind: 'degraded_data',
        domain: 'telemetry',
        operation: 'source_read',
        code: 'TELEMETRY_SOURCE_DEGRADED',
        sourceState: 'unavailable',
        context: {
          sourceId: createECSDiagnosticToken('source', source),
          consecutiveFailureCount: count,
          fallback: 'placeholder',
        },
      }, undefined, {
        category: 'TELEMETRY',
        fingerprint: source,
      });
    }
    return count;
  },

  /** Reset telemetry failure count for a source */
  resetTelemetryFailure(source: string): void {
    failureCounts[source] = 0;
  },

  /** Check if a telemetry source has exceeded failure threshold */
  isTelemetryDegraded(source: string): boolean {
    return (failureCounts[source] || 0) >= FAILURE_THRESHOLD;
  },

  /** Get current failure count for a source */
  getTelemetryFailureCount(source: string): number {
    return failureCounts[source] || 0;
  },

  /** Default console policy is warn/error only; use this to opt into more noise intentionally. */
  setConsoleVisibility(visibility: EcsConsoleVisibility): void {
    (globalThis as Record<string, unknown>).__ECS_LOG_LEVEL = visibility;
  },

  getConsoleVisibility(): EcsConsoleVisibility {
    return getConfiguredConsoleVisibility();
  },

  setDebugCategories(categories: EcsLogCategory[]): void {
    (globalThis as Record<string, unknown>).__ECS_DEBUG_CATEGORIES = categories;
  },

  enableDebugCategory(category: EcsLogCategory): void {
    const categories = getConfiguredDebugCategories();
    categories.add(category);
    ecsLog.setDebugCategories(Array.from(categories));
  },

  disableDebugCategory(category: EcsLogCategory): void {
    const categories = getConfiguredDebugCategories();
    categories.delete(category);
    ecsLog.setDebugCategories(Array.from(categories));
  },

  getDebugCategories(): EcsLogCategory[] {
    return Array.from(getConfiguredDebugCategories());
  },
};

