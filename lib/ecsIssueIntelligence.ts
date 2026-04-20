import { Platform } from 'react-native';
import Constants from 'expo-constants';

import { createPersistedKeyValueCache } from './keyValuePersistence';
import { supabase, isSupabaseConfigured } from './supabase';
import { gpsUIState } from './gpsUIState';
import { routeStore } from './routeStore';
import { loadRoadNavigationSession } from './roadNavigationStore';
import { connectivityIntelStore } from './connectivityIntelStore';
import { remotenessStore } from './remotenessStore';
import { vehicleDisplayStore } from './vehicleDisplayStore';
import { bluStateStore } from './BluStateStore';
import { vehicleTelemetryStore } from '../src/vehicle-telemetry/VehicleTelemetryStore';
import {
  getIssueRuntimeLayoutClass,
  getIssueRuntimeSnapshot,
  type EcsIssueWeatherStatus,
} from './ecsIssueRuntime';
import {
  captureFieldFeedbackEvent,
  emitAdminFacingIssueSummaries,
} from './admin/fieldFeedbackPipeline';
import type {
  EcsFieldFeedbackEvent,
  EcsIssueAdminSummary,
  EcsIssueArea,
  EcsIssueContext,
  EcsIssueEventType,
  EcsIssueGroupSummary,
  EcsIssueSeverity,
} from './admin/fieldFeedbackTypes';

export type {
  EcsFieldFeedbackEvent,
  EcsIssueAdminSummary,
  EcsIssueArea,
  EcsIssueContext,
  EcsIssueEventType,
  EcsIssueGroupSummary,
  EcsIssueSeverity,
} from './admin/fieldFeedbackTypes';

export interface EcsIssueReportInput {
  eventType: EcsIssueEventType;
  severity: EcsIssueSeverity;
  issueTitle: string;
  ecsArea: EcsIssueArea;
  message?: string | null;
  error?: unknown;
  signature?: string | null;
  metadata?: Record<string, unknown>;
  fallbackUsed?: boolean;
}

export interface EcsFieldIssueReportInput {
  category: string;
  description?: string;
  screenshotAttached?: boolean;
  screenshotPath?: string | null;
}

const STORAGE = createPersistedKeyValueCache('ecs_issue_intelligence');
const QUEUE_KEY = 'ecs_issue_queue_v2';
const SESSION_KEY = 'ecs_issue_session_id_v1';
const THROTTLE_KEY = 'ecs_issue_last_sent_v2';
const MAX_QUEUE_LENGTH = 240;
const DEDUPE_WINDOW_MS = 120_000;
const UPLOAD_BATCH_SIZE = 20;

const memoryThrottleMap = new Map<string, number>();
let initialized = false;
let flushInFlight = false;

function simpleHash(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `ecs_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function getAppVersion(): string {
  const constantVersion = Constants.expoConfig?.version;
  if (typeof constantVersion === 'string' && constantVersion.trim().length > 0) {
    return constantVersion.trim();
  }
  return Constants.nativeAppVersion || '1.0.0';
}

function getBuildVersion(): string | null {
  const build =
    Constants.expoConfig?.ios?.buildNumber
    || Constants.expoConfig?.android?.versionCode
    || (Constants as any)?.nativeBuildVersion
    || null;

  return build == null ? null : String(build);
}

function getEnvironmentLabel(): string {
  const env = process.env.EXPO_PUBLIC_APP_ENV;
  if (typeof env === 'string' && env.trim().length > 0) {
    return env.trim();
  }
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production';
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readQueue(): EcsFieldFeedbackEvent[] {
  return safeJsonParse<EcsFieldFeedbackEvent[]>(STORAGE.get(QUEUE_KEY), []);
}

function writeQueue(queue: EcsFieldFeedbackEvent[]): void {
  STORAGE.set(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_LENGTH)));
}

function readThrottleMap(): Record<string, number> {
  return safeJsonParse<Record<string, number>>(STORAGE.get(THROTTLE_KEY), {});
}

function writeThrottleMap(next: Record<string, number>): void {
  STORAGE.set(THROTTLE_KEY, JSON.stringify(next));
}

function getSessionId(): string {
  const existing = STORAGE.get(SESSION_KEY);
  if (existing && existing.trim().length > 0) return existing;
  const sessionId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  STORAGE.set(SESSION_KEY, sessionId);
  return sessionId;
}

function sanitizeMessage(message: string | null | undefined): string | null {
  if (!message) return null;
  return message
    .replace(/-?\d+\.\d{3,}/g, '<coord>')
    .replace(/\b[0-9a-f]{8,}\b/gi, '<id>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 600);
}

function normalizeSignature(value: string): string {
  return value
    .toLowerCase()
    .replace(/-?\d+\.\d+/g, ':n')
    .replace(/\b\d+\b/g, ':n')
    .replace(/\b[0-9a-f]{8,}\b/gi, ':id')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeGpsState(raw: string | null | undefined): 'live' | 'degraded' | 'unavailable' {
  const value = String(raw ?? '').toLowerCase();
  if (value === 'tracking') return 'live';
  if (value === 'acquiring' || value === 'retrying') return 'degraded';
  return 'unavailable';
}

function normalizeOfflineReadiness(value: string | null | undefined): 'ready' | 'partial' | 'stale' | 'missing' {
  const lowered = String(value ?? '').toLowerCase();
  if (lowered.includes('ready')) return 'ready';
  if (lowered.includes('partial') || lowered.includes('degraded')) return 'partial';
  if (lowered.includes('stale')) return 'stale';
  return 'missing';
}

function normalizeWeatherStatus(value: EcsIssueWeatherStatus | null | undefined): 'live' | 'stale' | 'unavailable' {
  return value === 'live' || value === 'stale' ? value : 'unavailable';
}

function normalizeConnectivityState(summary: Record<string, unknown>): EcsIssueContext['connectivityState'] {
  const state = String(summary.connectivity_state ?? '').toLowerCase();
  const readiness = String(summary.operational_readiness ?? '').toLowerCase();
  const freshness = String(summary.freshness ?? '').toLowerCase();

  if (state === 'connected' || (state === 'online' && freshness === 'live')) return 'online';
  if (readiness.includes('offline_ready') || readiness.includes('degraded_ready')) return 'offline_capable';
  if (freshness === 'recovering' || state === 'reconnecting') return 'reconnecting';
  if (state === 'offline' || freshness === 'offline') return 'offline';
  if (readiness.includes('degraded') || freshness === 'stale') return 'degraded';
  return 'degraded';
}

function categoryToArea(category: string): EcsIssueArea {
  const normalized = category.trim().toLowerCase();
  if (normalized.includes('navigation')) return 'navigate';
  if (normalized.includes('gps')) return 'gps';
  if (normalized.includes('bluetooth') || normalized.includes('telemetry')) return 'bluetooth_telemetry';
  if (normalized.includes('widget')) return 'widgets';
  if (normalized.includes('explore')) return 'explore';
  if (normalized.includes('weather')) return 'weather';
  if (normalized.includes('vehicle display')) return 'vehicle_display';
  return 'unknown';
}

async function buildRuntimeContext(fallbackUsed = false): Promise<EcsIssueContext> {
  const runtime = getIssueRuntimeSnapshot();
  const gps = gpsUIState.get();
  const connectivitySummary = connectivityIntelStore.getSummary() as unknown as Record<string, unknown>;
  const telemetryState = vehicleTelemetryStore.getECSVehicleTelemetryState();
  const bluSummary = bluStateStore.getSummary() as unknown as Record<string, unknown>;

  let routeState: EcsIssueContext['routeState'] = 'none';
  try {
    const roadNavigationSession = await loadRoadNavigationSession();
    if (roadNavigationSession?.status === 'navigation_active' || roadNavigationSession?.status === 'rerouting') {
      routeState = 'active';
    } else if (roadNavigationSession?.status === 'route_preview' || roadNavigationSession?.status === 'destination_selected') {
      routeState = 'preview';
    } else if (roadNavigationSession?.status === 'arrived') {
      routeState = 'completed';
    } else if (routeStore.getActive()) {
      routeState = 'active';
    }
  } catch {
    routeState = routeStore.getActive() ? 'active' : 'none';
  }

  let bluetoothTelemetryState: EcsIssueContext['bluetoothTelemetryState'] = 'unavailable';
  if (telemetryState.isConnected || bluSummary.connection_state === 'connected') {
    bluetoothTelemetryState = 'connected';
  } else if (telemetryState.hasData || bluSummary.available || bluSummary.connection_state === 'error') {
    bluetoothTelemetryState = 'disconnected';
  }

  return {
    appVersion: getAppVersion(),
    buildVersion: getBuildVersion(),
    platform: Platform.OS,
    environment: getEnvironmentLabel(),
    activeTab: runtime.activeTab,
    routeState,
    gpsState: normalizeGpsState(gps.gpsStatus),
    bluetoothTelemetryState,
    connectivityState: normalizeConnectivityState(connectivitySummary),
    syncStatus: runtime.syncStatus,
    expeditionPhase: typeof connectivitySummary.current_phase === 'string' ? String(connectivitySummary.current_phase) : null,
    degradedState: typeof connectivitySummary.operational_readiness === 'string' ? String(connectivitySummary.operational_readiness) : null,
    offlineReadiness: normalizeOfflineReadiness(
      String(connectivitySummary.operational_readiness ?? connectivitySummary.freshness ?? ''),
    ),
    weatherStatus: normalizeWeatherStatus(runtime.weatherStatus),
    remotenessAvailable: remotenessStore.isRunning(),
    carSessionActive: vehicleDisplayStore.isRunning(),
    layoutClass: getIssueRuntimeLayoutClass(),
    fallbackUsed,
    activeGuidanceExpected: routeState === 'active',
    coldLaunchRestore: Boolean(runtime.currentPath && !runtime.activeTab),
  };
}

function deriveMessage(input: EcsIssueReportInput): string | null {
  const explicit = sanitizeMessage(input.message);
  if (explicit) return explicit;
  if (!input.error) return null;
  if (input.error instanceof Error) {
    return sanitizeMessage(input.error.message);
  }
  if (typeof input.error === 'string') {
    return sanitizeMessage(input.error);
  }
  try {
    return sanitizeMessage(JSON.stringify(input.error));
  } catch {
    return 'Unknown ECS runtime issue';
  }
}

function serializeError(input: unknown): Record<string, unknown> {
  if (input instanceof Error) {
    return {
      name: input.name,
      message: sanitizeMessage(input.message),
      stack: sanitizeMessage(input.stack ?? null),
    };
  }
  if (typeof input === 'string') {
    return { message: sanitizeMessage(input) };
  }
  if (!input || typeof input !== 'object') {
    return {};
  }
  try {
    return JSON.parse(JSON.stringify(input)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function shouldSuppressEvent(signature: string): boolean {
  const now = Date.now();
  const persisted = readThrottleMap();
  const lastSeen = memoryThrottleMap.get(signature) ?? persisted[signature] ?? 0;
  if (now - lastSeen < DEDUPE_WINDOW_MS) {
    return true;
  }
  memoryThrottleMap.set(signature, now);
  writeThrottleMap({ ...persisted, [signature]: now });
  return false;
}

async function createIssueEvent(input: EcsIssueReportInput): Promise<EcsFieldFeedbackEvent> {
  const runtimeContext = await buildRuntimeContext(Boolean(input.fallbackUsed));
  const runtime = getIssueRuntimeSnapshot();
  const message = deriveMessage(input);
  const signatureBase = input.signature || `${input.eventType}:${input.ecsArea}:${input.issueTitle}:${message ?? ''}`;
  const normalizedSignature = normalizeSignature(signatureBase);

  return captureFieldFeedbackEvent({
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    occurredAt: new Date().toISOString(),
    eventType: input.eventType,
    severity: input.severity,
    issueTitle: input.issueTitle.trim(),
    issueSignature: signatureBase,
    normalizedSignature,
    ecsArea: input.ecsArea,
    message,
    runtimeContext,
    metadata: {
      ...(input.metadata ?? {}),
      ...(input.error ? { error: serializeError(input.error) } : {}),
      path: runtime.currentPath,
      activeTab: runtime.activeTab,
    },
    sourceKind: input.eventType === 'field_report' ? 'field_report' : 'runtime',
    hashedUserId: runtime.actor.userId ? simpleHash(runtime.actor.userId) : null,
    hashedSessionId: simpleHash(getSessionId()),
  });
}

async function uploadEvents(events: EcsFieldFeedbackEvent[]): Promise<boolean> {
  if (!events.length || !isSupabaseConfigured) return false;
  try {
    const { data, error } = await supabase.functions.invoke('issue-intelligence', {
      body: {
        action: 'ingest_issue_event',
        schema_version: 2,
        events,
      },
    });
    if (error || data?.ok !== true) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function normalizeRemoteGroup(group: any): EcsIssueGroupSummary {
  const severity = (group?.severity || 'low') as EcsIssueSeverity;
  const confidenceScore = typeof group?.confidenceScore === 'number' ? group.confidenceScore : 0.35;
  const confidenceLabel =
    group?.confidenceLabel
    || (confidenceScore >= 0.78
      ? 'high'
      : confidenceScore >= 0.58
        ? 'moderate'
        : confidenceScore >= 0.36
          ? 'limited'
          : 'low');

  return {
    signature: String(group?.signature || group?.normalizedSignature || group?.title || Math.random().toString(36).slice(2)),
    title: String(group?.title || 'Grouped ECS issue'),
    issueType: (group?.issueType || group?.eventType || 'non_fatal') as EcsIssueEventType,
    severity,
    ecsArea: (group?.ecsArea || 'unknown') as EcsIssueArea,
    issueFamily: (group?.issueFamily || 'general_runtime_failure'),
    issueClass: (group?.issueClass || 'feature_reliability_concern'),
    confidenceLabel,
    confidenceScore: Number(confidenceScore.toFixed(2)),
    appVersionsAffected: Array.isArray(group?.appVersionsAffected) ? group.appVersionsAffected : [],
    buildVersionsAffected: Array.isArray(group?.buildVersionsAffected) ? group.buildVersionsAffected : [],
    usersImpactedCount: Number(group?.usersImpactedCount || 0),
    sessionsImpactedCount: Number(group?.sessionsImpactedCount || 0),
    eventCount: Number(group?.eventCount || 0),
    recurrenceCount: Number(group?.recurrenceCount || group?.eventCount || 0),
    firstSeen: String(group?.firstSeen || new Date().toISOString()),
    lastSeen: String(group?.lastSeen || new Date().toISOString()),
    trendDirection: (group?.trendDirection || 'flat'),
    releaseRegression: Boolean(group?.releaseRegression),
    topContextTags: typeof group?.topContextTags === 'object' && group.topContextTags ? group.topContextTags : {},
    affectedSurfaces: Array.isArray(group?.affectedSurfaces) ? group.affectedSurfaces : [],
    providerFamilies: Array.isArray(group?.providerFamilies) ? group.providerFamilies : [],
    degradedOrOfflineRate: typeof group?.degradedOrOfflineRate === 'number' ? group.degradedOrOfflineRate : 0,
    offlineCorrelation: group?.offlineCorrelation || 'low',
  };
}

function normalizeRemoteSummary(summary: any): EcsIssueAdminSummary {
  const groups: EcsIssueGroupSummary[] = Array.isArray(summary?.groups) ? summary.groups.map((group: unknown) => normalizeRemoteGroup(group)) : [];
  const toGroups = (value: any): EcsIssueGroupSummary[] =>
    Array.isArray(value) ? value.map((group: unknown) => normalizeRemoteGroup(group)) : [];
  return {
    latestVersion: summary?.latestVersion || getAppVersion(),
    groups,
    frequentIssues: toGroups(summary?.frequentIssues).length ? toGroups(summary?.frequentIssues) : [...groups].sort((a, b) => b.eventCount - a.eventCount).slice(0, 8),
    newSinceLatestRelease: toGroups(summary?.newSinceLatestRelease),
    regressions: toGroups(summary?.regressions),
    trendingUp: toGroups(summary?.trendingUp),
    trendingDown: toGroups(summary?.trendingDown),
    resolvedOrQuieted: toGroups(summary?.resolvedOrQuieted),
    severeActive: toGroups(summary?.severeActive).length
      ? toGroups(summary?.severeActive)
      : groups.filter((group) => group.severity === 'critical' || group.severity === 'high').slice(0, 8),
  };
}

export async function initializeEcsIssueIntelligence(): Promise<void> {
  if (initialized) return;
  try {
    await STORAGE.waitForHydration();
    getSessionId();
  } catch {
    // Ignore hydration failures; the queue falls back to memory-safe behavior.
  }
  initialized = true;
}

export async function flushQueuedIssueEvents(): Promise<void> {
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    await initializeEcsIssueIntelligence();
    if (!isSupabaseConfigured) return;
    const runtime = getIssueRuntimeSnapshot();
    if (runtime.isOnline === false) return;

    let queue = readQueue();
    while (queue.length > 0) {
      const batch = queue.slice(0, UPLOAD_BATCH_SIZE);
      const ok = await uploadEvents(batch);
      if (!ok) break;
      queue = queue.slice(batch.length);
      writeQueue(queue);
    }
  } finally {
    flushInFlight = false;
  }
}

export async function reportIssue(input: EcsIssueReportInput): Promise<void> {
  try {
    await initializeEcsIssueIntelligence();
    const event = await createIssueEvent(input);
    const suppressionKey =
      event.severity === 'critical'
        ? `${event.groupingSignature}:${event.severity}:${event.runtimeContext.routeState}`
        : event.groupingSignature;

    if (shouldSuppressEvent(suppressionKey)) {
      return;
    }

    const queue = readQueue();
    queue.push(event);
    writeQueue(queue);
    void flushQueuedIssueEvents();
  } catch {
    // Never block user flows on feedback capture.
  }
}

export function reportFatalIssue(input: Omit<EcsIssueReportInput, 'eventType'>): void {
  void reportIssue({ ...input, eventType: 'fatal' });
}

export function reportNonFatalIssue(input: Omit<EcsIssueReportInput, 'eventType'>): void {
  void reportIssue({ ...input, eventType: 'non_fatal' });
}

export function reportDegradedState(input: Omit<EcsIssueReportInput, 'eventType'>): void {
  void reportIssue({ ...input, eventType: 'degraded_state' });
}

export function reportRecoverableFailure(input: Omit<EcsIssueReportInput, 'eventType'>): void {
  void reportIssue({ ...input, eventType: 'recoverable_failure' });
}

export function reportLayoutFailure(input: Omit<EcsIssueReportInput, 'eventType'>): void {
  void reportIssue({ ...input, eventType: 'layout_failure' });
}

export function reportDataIntegrityFailure(input: Omit<EcsIssueReportInput, 'eventType'>): void {
  void reportIssue({ ...input, eventType: 'data_integrity_failure' });
}

export async function submitFieldIssueReport(input: EcsFieldIssueReportInput): Promise<{ ok: boolean; error?: string }> {
  try {
    await reportIssue({
      eventType: 'field_report',
      severity: 'medium',
      issueTitle: `Field report: ${input.category}`,
      ecsArea: categoryToArea(input.category),
      message: input.description ?? null,
      metadata: {
        category: input.category,
        screenshotAttached: Boolean(input.screenshotAttached),
        screenshotPath: input.screenshotPath ?? null,
        reportSource: 'operator_manual',
      },
      signature: `field_report:${input.category}:${input.description ?? ''}`,
    });
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error?.message || 'Unable to send field report' };
  }
}

export async function fetchIssueAdminSummary(): Promise<EcsIssueAdminSummary | null> {
  try {
    const { data, error } = await supabase.functions.invoke('issue-intelligence', {
      body: {
        action: 'get_issue_summary',
      },
    });

    if (!error && data?.summary) {
      return normalizeRemoteSummary(data.summary);
    }
  } catch {
    // Fall through to local grouped summary.
  }

  try {
    await initializeEcsIssueIntelligence();
    const queue = readQueue();
    return emitAdminFacingIssueSummaries(queue, getAppVersion());
  } catch {
    return null;
  }
}
