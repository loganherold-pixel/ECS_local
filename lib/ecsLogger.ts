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
  | 'CONFIG'
  | 'DISCOVERY'
  | 'ATTITUDE'
  | 'MAP'
  | 'SYSTEM';

export type EcsLogLevel = 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

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

// ── Telemetry failure tracking ───────────────────────────
const failureCounts: Record<string, number> = {};
const FAILURE_THRESHOLD = 3; // After 3 consecutive failures, revert to placeholder

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
  /** Log informational message (not an error) */
  info(category: EcsLogCategory, message: string, details?: Record<string, any>): void {
    const entry = createEntry('INFO', category, message, details);
    pushToBuffer(entry);
    console.log(formatTag(category), message, details || '');
  },

  /** Log a warning (potential issue, not critical) */
  warn(category: EcsLogCategory, message: string, details?: Record<string, any>): void {
    const entry = createEntry('WARN', category, message, details);
    pushToBuffer(entry);
    console.warn(formatTag(category), message, details || '');
  },

  /** Log an error (something failed, but app continues) */
  error(category: EcsLogCategory, message: string, error?: any, details?: Record<string, any>): void {
    const entry = createEntry('ERROR', category, message, {
      ...details,
      errorMessage: error?.message,
      errorStack: error?.stack?.split('\n').slice(0, 4).join('\n'),
    });
    pushToBuffer(entry);
    console.error(formatTag(category), message, error || '', details || '');
  },

  /** Log a critical error (system-level failure) */
  critical(category: EcsLogCategory, message: string, error?: any, details?: Record<string, any>): void {
    const entry = createEntry('CRITICAL', category, message, {
      ...details,
      errorMessage: error?.message,
      errorStack: error?.stack?.split('\n').slice(0, 6).join('\n'),
    });
    pushToBuffer(entry);
    console.error(`${formatTag(category)} CRITICAL:`, message, error || '', details || '');
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
};

