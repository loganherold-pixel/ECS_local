import { ecsLog, type ECSBreadcrumb, type EcsLogEntry } from '../ecsLogger';
import {
  sanitizeECSDiagnosticText,
  sanitizeECSDiagnosticValue,
  type ECSDiagnosticValue,
} from './ecsDiagnosticRedaction';
import type { ECSObservabilityTelemetryGate } from './ecsObservabilityTelemetryGate';

export const ECS_SUPPORT_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type ECSSupportSnapshotInput = {
  generatedAt?: string;
  featureArea?: string | null;
  runtime?: Record<string, unknown>;
  health?: {
    outstandingJobs?: number;
    activeSubscriptions?: number;
    cacheSizes?: Record<string, number>;
    lastSuccessfulRefresh?: Record<string, string | null>;
  };
  telemetryGate?: ECSObservabilityTelemetryGate | null;
  recentEvents?: unknown[];
  breadcrumbs?: unknown[];
  extra?: unknown;
};

export type ECSSupportSnapshot = {
  schemaVersion: typeof ECS_SUPPORT_SNAPSHOT_SCHEMA_VERSION;
  generatedAt: string;
  privacy: 'redacted_local_support_snapshot';
  featureArea: string | null;
  runtime: Record<string, ECSDiagnosticValue>;
  health: {
    outstandingJobs: number;
    activeSubscriptions: number;
    cacheSizes: Record<string, number>;
    lastSuccessfulRefresh: Record<string, string | null>;
  };
  telemetryGate: ECSObservabilityTelemetryGate | null;
  recentEvents: ECSDiagnosticValue[];
  breadcrumbs: ECSDiagnosticValue[];
  extra: ECSDiagnosticValue | null;
};

function safeCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

function sanitizeCountMap(value: Record<string, number> | undefined): Record<string, number> {
  return Object.entries(value ?? {}).slice(0, 24).reduce<Record<string, number>>((result, [key, count]) => {
    const safeKey = sanitizeECSDiagnosticText(key, 64).replace(/[^a-z0-9_.:-]/gi, '_');
    if (safeKey) result[safeKey] = safeCount(count);
    return result;
  }, {});
}

function sanitizeRefreshMap(
  value: Record<string, string | null> | undefined,
): Record<string, string | null> {
  return Object.entries(value ?? {}).slice(0, 24).reduce<Record<string, string | null>>((result, [key, at]) => {
    const safeKey = sanitizeECSDiagnosticText(key, 64).replace(/[^a-z0-9_.:-]/gi, '_');
    if (!safeKey) return result;
    const parsed = typeof at === 'string' ? Date.parse(at) : Number.NaN;
    result[safeKey] = Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
    return result;
  }, {});
}

function sanitizeEventList(value: unknown[] | undefined, maxLength: number): ECSDiagnosticValue[] {
  return (sanitizeECSDiagnosticValue((value ?? []).slice(-maxLength), {
    maxDepth: 5,
    maxArrayLength: maxLength,
    maxObjectKeys: 24,
    maxStringLength: 400,
  }) as ECSDiagnosticValue[]);
}

export function buildECSSupportSnapshot(input: ECSSupportSnapshotInput): ECSSupportSnapshot {
  const generatedAtMs = input.generatedAt ? Date.parse(input.generatedAt) : Date.now();
  const generatedAt = Number.isFinite(generatedAtMs)
    ? new Date(generatedAtMs).toISOString()
    : new Date().toISOString();
  const featureArea = input.featureArea
    ? sanitizeECSDiagnosticText(input.featureArea, 72).replace(/[^a-z0-9_.:-]/gi, '_').toLowerCase()
    : null;

  return {
    schemaVersion: ECS_SUPPORT_SNAPSHOT_SCHEMA_VERSION,
    generatedAt,
    privacy: 'redacted_local_support_snapshot',
    featureArea,
    runtime: sanitizeECSDiagnosticValue(input.runtime ?? {}, {
      maxDepth: 4,
      maxArrayLength: 16,
      maxObjectKeys: 24,
      maxStringLength: 320,
    }) as Record<string, ECSDiagnosticValue>,
    health: {
      outstandingJobs: safeCount(input.health?.outstandingJobs),
      activeSubscriptions: safeCount(input.health?.activeSubscriptions),
      cacheSizes: sanitizeCountMap(input.health?.cacheSizes),
      lastSuccessfulRefresh: sanitizeRefreshMap(input.health?.lastSuccessfulRefresh),
    },
    telemetryGate: input.telemetryGate
      ? {
          enabled: input.telemetryGate.enabled === true,
          reason: input.telemetryGate.reason,
        }
      : null,
    recentEvents: sanitizeEventList(input.recentEvents, 20),
    breadcrumbs: sanitizeEventList(input.breadcrumbs, 30),
    extra: input.extra == null
      ? null
      : sanitizeECSDiagnosticValue(input.extra, {
          maxDepth: 4,
          maxArrayLength: 16,
          maxObjectKeys: 24,
          maxStringLength: 320,
        }) as ECSDiagnosticValue,
  };
}

export function formatECSSupportSnapshotJson(snapshot: ECSSupportSnapshot): string {
  return JSON.stringify(buildECSSupportSnapshot(snapshot), null, 2);
}

function sumSubscriptionCounts(subscriptions: Record<string, unknown>): number {
  return Object.values(subscriptions).reduce<number>((sum, value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return sum + Math.max(0, value);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return sum;
    return sum + Object.values(value as Record<string, unknown>).reduce<number>((nestedSum, nested) => (
      typeof nested === 'number' && Number.isFinite(nested)
        ? nestedSum + Math.max(0, nested)
        : nestedSum
    ), 0);
  }, 0);
}

function selectSafeRecentEvents(entries: EcsLogEntry[]): unknown[] {
  return entries.map((entry) => ({
    timestamp: entry.timestamp,
    level: entry.level,
    category: entry.category,
    message: entry.message,
    details: entry.details ?? null,
  }));
}

function selectSafeBreadcrumbs(entries: ECSBreadcrumb[]): unknown[] {
  return entries.map((entry) => ({
    occurredAt: entry.occurredAt,
    domain: entry.domain,
    operation: entry.operation,
    code: entry.code,
    status: entry.status,
    sourceState: entry.sourceState,
    context: entry.context,
  }));
}

/**
 * Builds a local, aggregate-only support snapshot. Importing heavyweight runtime
 * diagnostics is deferred so this helper adds no startup work until requested.
 */
export async function captureECSSupportSnapshot(featureArea?: string): Promise<ECSSupportSnapshot> {
  const [performanceModule, stateModule, startupModule, weatherModule, issueModule, gateModule] = await Promise.all([
    import('../performance/ecsPerformanceDiagnostics'),
    import('../state/stateManagementDiagnostics'),
    import('../startupDiagnostics'),
    import('../weatherStore'),
    import('../ecsIssueIntelligence'),
    import('./ecsObservabilityTelemetryGate'),
  ]);
  const performance = performanceModule.getECSPerformanceSnapshot();
  const state = stateModule.getECSStateManagementDiagnostics();
  const startup = startupModule.getStartupDiagnosticsSnapshot();
  const weatherCache = weatherModule.getWeatherCacheStats();
  const issue = issueModule.getECSIssueIntelligenceDiagnostics();

  return buildECSSupportSnapshot({
    featureArea,
    runtime: {
      startupPhase: startup.currentPhase,
      startupTransitionCount: startup.transitions.length,
      performanceInstrumentationEnabled: performance.enabled,
      telemetryQueueState: issue.queueState,
      telemetryGateReason: issue.telemetryGate.reason,
    },
    health: {
      outstandingJobs: performance.outstandingAsyncJobs,
      activeSubscriptions: sumSubscriptionCounts(state.subscriptions),
      cacheSizes: {
        weatherMemoryEntries: weatherCache.memoryEntries,
        weatherPersistedEntries: weatherCache.count,
        loggerEntries: ecsLog.getDiagnostics().logEntryCount,
        breadcrumbs: ecsLog.getDiagnostics().breadcrumbCount,
        issueQueue: issue.queueLength,
      },
      lastSuccessfulRefresh: issue.lastSuccessfulRefresh,
    },
    telemetryGate: gateModule.getECSObservabilityTelemetryGate({
      backendConfigured: issue.backendConfigured,
    }),
    recentEvents: selectSafeRecentEvents(ecsLog.getRecentLogs(20)),
    breadcrumbs: selectSafeBreadcrumbs(ecsLog.getRecentBreadcrumbs(30)),
    extra: {
      logger: ecsLog.getDiagnostics(),
      persistence: {
        storageBackends: state.persistence.length,
        pendingWrites: state.persistence.filter((entry) => entry.pendingWrite).length,
      },
      subscriptions: state.subscriptions,
    },
  });
}
