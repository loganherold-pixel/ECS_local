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
  | 'CONFIG'
  | 'DISCOVERY'
  | 'CAMPOPS'
  | 'ATTITUDE'
  | 'MAP'
  | 'SYSTEM';

export type EcsLogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
export type EcsConsoleVisibility = 'warn' | 'info' | 'debug';

interface EcsLogEntry {
  timestamp: string;
  level: EcsLogLevel;
  category: EcsLogCategory;
  message: string;
  details?: Record<string, any>;
}

// ── In-memory log buffer (last 100 entries) ──────────────
const LOG_BUFFER_SIZE = 100;
const logBuffer: EcsLogEntry[] = [];
const logOnceCache = new Set<string>();

// ── Telemetry failure tracking ───────────────────────────
const failureCounts: Record<string, number> = {};
const FAILURE_THRESHOLD = 3; // After 3 consecutive failures, revert to placeholder

const DEBUG_CATEGORY_ALIASES = {
  shell: 'SHELL',
  weather: 'WEATHER',
  dedupe: 'DEDUPE',
  telemetry: 'TELEMETRY',
  power: 'POWER',
  discovery: 'DISCOVERY',
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
  lastDetails?: Record<string, any>;
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

function getCategoryDebugFlagName(category: EcsLogCategory): string {
  return `ECS_DEBUG_${category}`;
}

function isExplicitDevDebugEnabled(category: EcsLogCategory, debugFlag?: string): boolean {
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
  details?: Record<string, any>,
  error?: unknown,
): void {
  if (!shouldPrintToConsole(level, category)) return;

  const tag = level === 'CRITICAL'
    ? `${formatTag(category)} CRITICAL:`
    : formatTag(category);

  if (level === 'CRITICAL' || level === 'ERROR') {
    console.error(tag, message, error || '', details || '');
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
  details?: Record<string, any>,
  tag?: string,
): void {
  const prefix = tag || formatTag(category);
  if (details) console.log(prefix, message, details);
  else console.log(prefix, message);
}

function sanitizeForFingerprint(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeForFingerprint);
  if (typeof value !== 'object') return String(value);
  return Object.keys(value as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sanitizeForFingerprint((value as Record<string, unknown>)[key]);
      return acc;
    }, {});
}

function stableDetailsFingerprint(details?: Record<string, any>): string {
  if (!details) return '';
  try {
    return JSON.stringify(sanitizeForFingerprint(details));
  } catch {
    return 'unserializable';
  }
}

function createEntry(
  level: EcsLogLevel,
  category: EcsLogCategory,
  message: string,
  details?: Record<string, any>,
): EcsLogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    details,
  };
}

function pushToBuffer(entry: EcsLogEntry): void {
  logBuffer.push(entry);
  if (logBuffer.length > LOG_BUFFER_SIZE) {
    logBuffer.shift();
  }
}

function formatTag(category: EcsLogCategory): string {
  return `[ECS:${category}]`;
}

// ── Public API ───────────────────────────────────────────

export const ecsLog = {
  /** Log debug diagnostics (suppressed by default) */
  debug(category: EcsLogCategory, message: string, details?: Record<string, any>): void {
    const entry = createEntry('DEBUG', category, message, details);
    pushToBuffer(entry);
    emitConsole('DEBUG', category, message, details);
  },

  /**
   * Debug-only developer diagnostics for high-frequency lifecycle paths.
   * First occurrence is emitted when the category/debug flag is enabled; repeated
   * identical entries are aggregated so polling/render loops stay readable.
   */
  dev(
    category: EcsLogCategory,
    message: string,
    details?: Record<string, any>,
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

    const now = options?.nowMs ?? Date.now();
    const throttleMs = options?.throttleMs ?? 2500;
    const aggregateWindowMs = options?.aggregateWindowMs ?? 10_000;
    const key = [
      category,
      message,
      options?.fingerprint ?? stableDetailsFingerprint(details),
    ].join('::');
    const state = devLogThrottleState.get(key);

    if (state && now - state.lastEmittedAt < throttleMs) {
      state.suppressedCount += 1;
      state.lastDetails = details;
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

    const entry = createEntry('DEBUG', category, message, details);
    pushToBuffer(entry);
    emitDevConsole(category, message, details, options?.tag);
    devLogThrottleState.set(key, {
      lastEmittedAt: now,
      windowStartedAt: state && now - state.windowStartedAt < aggregateWindowMs ? state.windowStartedAt : now,
      suppressedCount: 0,
      lastDetails: details,
    });
  },

  /** Log informational message (not an error) */
  info(category: EcsLogCategory, message: string, details?: Record<string, any>): void {
    const entry = createEntry('INFO', category, message, details);
    pushToBuffer(entry);
    emitConsole('INFO', category, message, details);
  },

  /** Log a warning (potential issue, not critical) */
  warn(category: EcsLogCategory, message: string, details?: Record<string, any>): void {
    const entry = createEntry('WARN', category, message, details);
    pushToBuffer(entry);
    emitConsole('WARN', category, message, details);
  },

  /** Log a warning only once for a stable dedupe key. */
  warnOnce(category: EcsLogCategory, dedupeKey: string, message: string, details?: Record<string, any>): void {
    const key = `WARN:${category}:${dedupeKey}`;
    if (logOnceCache.has(key)) return;
    logOnceCache.add(key);
    ecsLog.warn(category, message, details);
  },

  /** Log an error (something failed, but app continues) */
  error(category: EcsLogCategory, message: string, error?: any, details?: Record<string, any>): void {
    const entry = createEntry('ERROR', category, message, {
      ...details,
      errorMessage: error?.message,
      errorStack: error?.stack?.split('\n').slice(0, 4).join('\n'),
    });
    pushToBuffer(entry);
    emitConsole('ERROR', category, message, details, error);
  },

  /** Log a critical error (system-level failure) */
  critical(category: EcsLogCategory, message: string, error?: any, details?: Record<string, any>): void {
    const entry = createEntry('CRITICAL', category, message, {
      ...details,
      errorMessage: error?.message,
      errorStack: error?.stack?.split('\n').slice(0, 6).join('\n'),
    });
    pushToBuffer(entry);
    emitConsole('CRITICAL', category, message, details, error);
  },

  /** Get the last N log entries */
  getRecentLogs(count: number = 20): EcsLogEntry[] {
    return logBuffer.slice(-count);
  },

  /** Get logs filtered by category */
  getLogsByCategory(category: EcsLogCategory, count: number = 20): EcsLogEntry[] {
    return logBuffer.filter(e => e.category === category).slice(-count);
  },

  /** Get logs filtered by level */
  getLogsByLevel(level: EcsLogLevel, count: number = 20): EcsLogEntry[] {
    return logBuffer.filter(e => e.level === level).slice(-count);
  },

  /** Clear all logs */
  clear(): void {
    logBuffer.length = 0;
    logOnceCache.clear();
    devLogThrottleState.clear();
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
      ecsLog.warn('TELEMETRY', `Source "${source}" failed ${count} times — reverting to placeholder`, { source, count });
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

