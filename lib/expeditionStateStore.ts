// ============================================================
// EXPEDITION STATE STORE — Global System State Layer
// ============================================================
// Expedition is a background operational state, NOT a navigation tab.
//
// States:
//   standby  — default, no active expedition
//   active   — expedition in progress (auto or manual trigger)
//   paused   — expedition temporarily paused, preserving all data
//   complete — expedition just finished, summary available
//
// Triggers:
//   Auto: geofence exit (200m default radius)
//   Manual: "Begin Expedition" button on Fleet tab
//
// Pause/Resume:
//   Manual: "Pause Expedition" / "Resume Expedition" from Quick Actions
//
// Closure:
//   Auto: geofence re-entry
//   Manual: "End Expedition" from Dashboard header or Quick Actions
//
// Language rules:
//   Begin Expedition / Expedition Active / Pause Expedition /
//   Resume Expedition / End Expedition / Expedition Complete
//   NO mission, deploy, or launch language.
//
// Cloud Persistence:
//   - expedition_sessions table for session records
//   - expedition_timeline_events table for lifecycle events
//   - Offline-first: local state is primary, cloud sync is background
// ============================================================

import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { createPersistedKeyValueCache } from './keyValuePersistence';
import {
  isExpeditionCloudTableUnavailable,
  markExpeditionCloudTableUnavailable,
} from './expeditionCloudSyncAvailability';
import {
  buildCompletionKey,
  canonicalJourneyEntityId,
  decideJourneyTransition,
  mergeJourneyLinkage,
  type ECSJourneyLinkage,
} from './lifecycle/routeTripExpeditionLifecycle';
import {
  createCanonicalExpeditionLifecycle,
  createCanonicalExpeditionPlan,
  normalizeCanonicalExpeditionLifecycle,
  transitionExpeditionLifecycle,
  type CanonicalExpeditionLifecycle,
} from './expedition/expeditionLifecycle';

const TAG = '[EXPEDITION_STATE]';

// ── Types ────────────────────────────────────────────────────
export type ExpeditionState = 'standby' | 'active' | 'paused' | 'complete';

export type ExpeditionRuntimeHydrationStatus = 'restoring' | 'ready' | 'error';
export type ExpeditionRuntimeSource = 'none' | 'restored' | 'live';
export type ExpeditionRuntimeFreshness = 'missing' | 'cached' | 'current';

export interface ExpeditionRuntimeSnapshot {
  state: ExpeditionState;
  record: ExpeditionRecord | null;
  activeRecord: ExpeditionRecord | null;
  hydrationStatus: ExpeditionRuntimeHydrationStatus;
  source: ExpeditionRuntimeSource;
  freshness: ExpeditionRuntimeFreshness;
  revision: number;
  safeErrorCode: 'expedition_persistence_hydration_failed' | null;
}

export interface ExpeditionRecord {
  id: string;
  idempotencyKey?: string | null;
  state: ExpeditionState;
  activeVehicleId: string;
  vehicleName: string;
  expeditionName?: string;
  description?: string;
  teamLeaderName?: string;
  teamLeaderCallsign?: string;
  startLocationLabel?: string;
  destination?: string;
  areaOfOperation?: string;
  commsNotes?: string;
  privacyMode?: 'invite_only' | 'open';
  joinMode?: 'approval_required' | 'open';
  startTime: string;
  endTime: string | null;
  pausedAt: string | null;       // timestamp when paused
  totalPausedMs: number;         // accumulated paused duration in ms
  duration: number | null; // seconds
  distance: number | null; // meters
  startFuelLevel: number | null;
  endFuelLevel: number | null;
  fuelDelta: number | null;
  startWaterLevel: number | null;
  endWaterLevel: number | null;
  waterDelta: number | null;
  peakRemoteness: number | null;
  homeLatitude: number | null;
  homeLongitude: number | null;
  cloudSessionId: string | null; // Supabase expedition_sessions.id
  routeAssetId?: string | null;
  tripPlanId?: string | null;
  offlinePackageId?: string | null;
  runId?: string | null;
  lifecycle?: ECSJourneyLinkage | null;
  canonicalLifecycle?: CanonicalExpeditionLifecycle | null;
}

export interface GeofenceExpeditionTransitionProposal {
  id: string;
  idempotencyKey: string;
  direction: 'start' | 'end';
  status: 'pending' | 'accepted' | 'rejected';
  vehicleId: string;
  expeditionId: string | null;
  cycleAnchor: string;
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ExpeditionLogEntry {
  id: string;
  vehicleId: string;
  vehicleName: string;
  startTime: string;
  endTime: string;
  duration: number; // seconds
  distance: number; // meters
  fuelDelta: number | null;
  waterDelta: number | null;
  peakRemoteness: number | null;
}

// ── Timeline Event Types ─────────────────────────────────────
export type TimelineEventType =
  | 'expedition_started'
  | 'expedition_paused'
  | 'expedition_resumed'
  | 'expedition_ended'
  | 'tracking_update'
  | 'geofence_exit'
  | 'geofence_entry'
  | 'resource_alert'
  | 'checkpoint_reached'
  | 'manual_note';

export interface TimelineEvent {
  id: string;
  sessionId: string;
  eventType: TimelineEventType;
  eventData: Record<string, any>;
  occurredAt: string;
}


// ── Storage helpers ──────────────────────────────────────────
const mem: Record<string, string> = {};
const expeditionPersistence = createPersistedKeyValueCache('ecs_expedition_state');

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    const value = expeditionPersistence.get(key);
    return value != null ? value : mem[key] || null;
  } catch {
    const persistedValue = expeditionPersistence.get(key);
    return persistedValue != null ? persistedValue : (mem[key] || null);
  }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
    if (Platform.OS !== 'web') {
      expeditionPersistence.set(key, value);
    }
  } catch {
    mem[key] = value;
    if (Platform.OS !== 'web') {
      expeditionPersistence.set(key, value);
    }
  }
}

function sClear(key: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
    delete mem[key];
    if (Platform.OS !== 'web') {
      expeditionPersistence.delete(key);
    }
  } catch {
    delete mem[key];
    if (Platform.OS !== 'web') {
      expeditionPersistence.delete(key);
    }
  }
}

function uuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Storage keys ─────────────────────────────────────────────
const KEYS = {
  currentExpedition: 'ecs_expedition_current',
  expeditionLog: 'ecs_expedition_log',
  homeGeofence: 'ecs_expedition_home_geofence',
  geofenceRadius: 'ecs_expedition_geofence_radius',
  timelineEvents: 'ecs_expedition_timeline',
  geofenceProposals: 'ecs_expedition_geofence_proposals',
};

// ── Default geofence radius (meters) ─────────────────────────
const DEFAULT_GEOFENCE_RADIUS = 200;

// ── Listeners ────────────────────────────────────────────────
type StateListener = (state: ExpeditionState, record: ExpeditionRecord | null) => void;
const listeners: Set<StateListener> = new Set();
let expeditionPublishedRevision = 0;
let trackingNotificationPending = false;
let expeditionRuntimeHydrationStatus: ExpeditionRuntimeHydrationStatus =
  Platform.OS === 'web' ? 'ready' : 'restoring';
let expeditionRuntimeSource: ExpeditionRuntimeSource = 'none';
let expeditionRuntimeSafeErrorCode: ExpeditionRuntimeSnapshot['safeErrorCode'] = null;
let latestExpeditionProducerEvent = {
  revision: 0,
  source: 'none' as 'none' | 'hydration' | 'mutation' | 'tracking',
  state: 'standby' as ExpeditionState,
  hasRecord: false,
  publishedAt: null as string | null,
};

// ── Timeline Event Listeners ─────────────────────────────────
type TimelineListener = (event: TimelineEvent) => void;
const timelineListeners: Set<TimelineListener> = new Set();

async function hydrateNativeState(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    await expeditionPersistence.waitForHydration();
    const keys = Object.values(KEYS);
    const restoredValues = keys.map((key) => ({
      key,
      result: expeditionPersistence.readResult(key),
    }));
    if (restoredValues.some(({ result }) => !result.ok && result.hydrationStatus === 'failed')) {
      expeditionRuntimeHydrationStatus = 'error';
      expeditionRuntimeSafeErrorCode = 'expedition_persistence_hydration_failed';
      expeditionStateStore._notify('hydration');
      return;
    }
    restoredValues.forEach(({ key, result }) => {
      if (result.value != null) mem[key] = result.value;
    });

    const rawCurrent = mem[KEYS.currentExpedition];
    const current = rawCurrent ? JSON.parse(rawCurrent) as ExpeditionRecord : null;
    const hasActiveLifecycle = current?.state === 'active' || current?.state === 'paused';
    if (!hasActiveLifecycle) {
      sClear(KEYS.homeGeofence);
    }
  } catch {
    sClear(KEYS.currentExpedition);
    sClear(KEYS.homeGeofence);
    expeditionRuntimeHydrationStatus = 'error';
    expeditionRuntimeSafeErrorCode = 'expedition_persistence_hydration_failed';
    expeditionStateStore._notify('hydration');
    return;
  }

  expeditionRuntimeHydrationStatus = 'ready';
  expeditionRuntimeSafeErrorCode = null;
  // Native persistence hydrates after subscribers may already be mounted.
  // Publish the restored identity so Dispatch and other expedition consumers
  // do not remain pinned to their pre-hydration local fallback.
  expeditionStateStore._notify('hydration');
}

const expeditionStateHydration = hydrateNativeState();

// ── Cloud Sync Helpers ───────────────────────────────────────

async function syncSessionToCloud(record: ExpeditionRecord, userId?: string | null): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  if (isExpeditionCloudTableUnavailable('expedition_sessions')) {
    return record.cloudSessionId;
  }
  try {
    const payload: any = {
      vehicle_id: record.activeVehicleId,
      vehicle_name: record.vehicleName,
      state: record.state.toUpperCase(),
      start_time: record.startTime,
      end_time: record.endTime,
      duration_seconds: record.duration,
      distance_meters: record.distance,
      fuel_delta: record.fuelDelta,
      water_delta: record.waterDelta,
      peak_remoteness: record.peakRemoteness,
      home_latitude: record.homeLatitude,
      home_longitude: record.homeLongitude,
      updated_at: new Date().toISOString(),
    };
    if (userId) payload.user_id = userId;

    if (record.cloudSessionId) {
      // Update existing session
      const { error } = await supabase
        .from('expedition_sessions')
        .update(payload)
        .eq('id', record.cloudSessionId);
      if (error) {
        if (markExpeditionCloudTableUnavailable(TAG, 'expedition_sessions', error)) {
          return record.cloudSessionId;
        }
        console.warn(TAG, 'Cloud session update failed:', error.message);
        return record.cloudSessionId;
      }
      return record.cloudSessionId;
    } else {
      // Create new session
      payload.id = record.id;
      payload.meta = {};
      const { data, error } = await supabase
        .from('expedition_sessions')
        .insert(payload)
        .select('id')
        .single();
      if (error || !data) {
        if (error && markExpeditionCloudTableUnavailable(TAG, 'expedition_sessions', error)) {
          return null;
        }
        console.warn(TAG, 'Cloud session create failed:', error?.message);
        return null;
      }
      return data.id;
    }
  } catch (e: any) {
    if (markExpeditionCloudTableUnavailable(TAG, 'expedition_sessions', e)) {
      return record.cloudSessionId;
    }
    console.warn(TAG, 'Cloud sync error:', e?.message);
    return null;
  }
}

async function logTimelineToCloud(sessionId: string, eventType: TimelineEventType, eventData: Record<string, any>): Promise<void> {
  if (!isSupabaseConfigured) return;
  if (isExpeditionCloudTableUnavailable('expedition_timeline_events')) return;
  try {
    const { error } = await supabase
      .from('expedition_timeline_events')
      .insert({
        session_id: sessionId,
        event_type: eventType,
        event_data: eventData,
        occurred_at: new Date().toISOString(),
      });
    if (error) {
      if (markExpeditionCloudTableUnavailable(TAG, 'expedition_timeline_events', error)) return;
      console.warn(TAG, 'Timeline cloud log failed:', error.message);
    }
  } catch (e: any) {
    if (markExpeditionCloudTableUnavailable(TAG, 'expedition_timeline_events', e)) return;
    console.warn(TAG, 'Timeline cloud log failed:', e?.message);
  }
}

// ── Local Timeline Helpers ───────────────────────────────────

function getLocalTimeline(): TimelineEvent[] {
  try {
    const raw = sGet(KEYS.timelineEvents);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function appendLocalTimeline(event: TimelineEvent): void {
  const timeline = getLocalTimeline();
  timeline.unshift(event);
  // Keep last 200 events
  if (timeline.length > 200) timeline.length = 200;
  sSet(KEYS.timelineEvents, JSON.stringify(timeline));
  // Notify timeline listeners
  timelineListeners.forEach(fn => {
    try { fn(event); } catch (e) { console.error(TAG, 'Timeline listener error:', e); }
  });
}

function runtimeStateToCanonical(state: ExpeditionState): 'active' | 'paused' | 'completed' {
  if (state === 'paused') return 'paused';
  if (state === 'complete') return 'completed';
  return 'active';
}

function canonicalLifecycleForRuntime(record: ExpeditionRecord): CanonicalExpeditionLifecycle {
  return normalizeCanonicalExpeditionLifecycle(record.canonicalLifecycle, {
    expeditionId: record.id,
    title: record.expeditionName ?? record.vehicleName,
    activeVehicleId: record.activeVehicleId,
    routeAssetId: record.routeAssetId ?? null,
    tripPlanId: record.tripPlanId ?? null,
    offlinePackageId: record.offlinePackageId ?? null,
    legacyStatus: runtimeStateToCanonical(record.state),
    createdAt: record.startTime,
    updatedAt: record.endTime ?? record.pausedAt ?? record.startTime,
  });
}

function getLocalGeofenceProposals(): GeofenceExpeditionTransitionProposal[] {
  try {
    const parsed = JSON.parse(sGet(KEYS.geofenceProposals) || '[]');
    return Array.isArray(parsed)
      ? parsed
          .filter((item) => item && typeof item.id === 'string')
          .slice(-24)
      : [];
  } catch {
    return [];
  }
}

function saveLocalGeofenceProposals(proposals: GeofenceExpeditionTransitionProposal[]): void {
  sSet(KEYS.geofenceProposals, JSON.stringify(proposals.slice(-24)));
}

function safeProposalPart(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 72) || 'unknown';
}

// ============================================================
// EXPEDITION STATE STORE
// ============================================================
export const expeditionStateStore = {
  // ── Subscribe to state changes ─────────────────────────
  subscribe(listener: StateListener): () => void {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  },

  // ── Subscribe to timeline events ───────────────────────
  subscribeTimeline(listener: TimelineListener): () => void {
    timelineListeners.add(listener);
    return () => { timelineListeners.delete(listener); };
  },

  _notify(source: 'hydration' | 'mutation' | 'tracking' = 'mutation'): void {
    const state = this.getState();
    const record = this.getCurrentExpedition();
    if (source === 'mutation' || source === 'tracking') {
      expeditionRuntimeSource = 'live';
    } else if (source === 'hydration' && expeditionRuntimeSource !== 'live') {
      expeditionRuntimeSource = record ? 'restored' : 'none';
    }
    expeditionPublishedRevision += 1;
    latestExpeditionProducerEvent = {
      revision: expeditionPublishedRevision,
      source,
      state,
      hasRecord: record != null,
      publishedAt: new Date().toISOString(),
    };
    listeners.forEach(fn => {
      try { fn(state, record); } catch (e) { console.error(TAG, 'Listener error:', e); }
    });
  },

  // ── Get current state ──────────────────────────────────
  getState(): ExpeditionState {
    const record = this.getCurrentExpedition();
    if (!record) return 'standby';
    return record.state;
  },

  // ── Get current expedition record ──────────────────────
  getCurrentExpedition(): ExpeditionRecord | null {
    try {
      const raw = sGet(KEYS.currentExpedition);
      if (!raw) return null;
      const record = JSON.parse(raw) as ExpeditionRecord;
      record.canonicalLifecycle = canonicalLifecycleForRuntime(record);
      return record;
    } catch { return null; }
  },

  // ── Get timeline events ────────────────────────────────
  getTimeline(sessionId?: string): TimelineEvent[] {
    const all = getLocalTimeline();
    if (!sessionId) return all;
    return all.filter(e => e.sessionId === sessionId);
  },

  // ── Log a timeline event ───────────────────────────────
  logTimelineEvent(eventType: TimelineEventType, eventData: Record<string, any> = {}): TimelineEvent | null {
    const record = this.getCurrentExpedition();
    const sessionId = record?.id || 'system';

    const event: TimelineEvent = {
      id: uuid(),
      sessionId,
      eventType,
      eventData,
      occurredAt: new Date().toISOString(),
    };

    appendLocalTimeline(event);

    // Background cloud sync
    if (record?.cloudSessionId) {
      logTimelineToCloud(record.cloudSessionId, eventType, eventData).catch(() => {});
    }

    return event;
  },

  // ── Begin expedition ───────────────────────────────────
  beginExpedition(params: {
    expeditionId?: string | null;
    idempotencyKey?: string | null;
    activeVehicleId: string;
    vehicleName: string;
    expeditionName?: string;
    description?: string;
    teamLeaderName?: string;
    teamLeaderCallsign?: string;
    startLocationLabel?: string;
    destination?: string;
    areaOfOperation?: string;
    commsNotes?: string;
    privacyMode?: 'invite_only' | 'open';
    joinMode?: 'approval_required' | 'open';
    startTime?: string;
    startFuelLevel?: number | null;
    startWaterLevel?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    userId?: string | null;
    routeAssetId?: string | null;
    tripPlanId?: string | null;
    offlinePackageId?: string | null;
    runId?: string | null;
    lifecycle?: ECSJourneyLinkage | null;
    transitionCause?: 'navigate' | 'dispatch' | 'geofence' | 'operator' | 'system';
  }): ExpeditionRecord {
    const existing = this.getCurrentExpedition();
    if (existing?.state === 'active' || existing?.state === 'paused') {
      return existing;
    }
    if (
      existing?.state === 'complete' &&
      params.idempotencyKey &&
      existing.idempotencyKey === params.idempotencyKey
    ) {
      return existing;
    }
    const recordId = params.expeditionId?.trim() || uuid();
    const startTime = params.startTime ?? new Date().toISOString();
    const identity = {
      routeAssetId: params.routeAssetId
        ? canonicalJourneyEntityId('route_asset', params.routeAssetId)
        : null,
      tripPlanId: params.tripPlanId ?? null,
      offlinePackageId: params.offlinePackageId ?? null,
      expeditionId: canonicalJourneyEntityId('expedition', recordId),
      recordedRunId: params.runId
        ? canonicalJourneyEntityId('recorded_run', params.runId)
        : null,
    };
    const lifecycle = mergeJourneyLinkage(params.lifecycle, {
      phase: 'active',
      identity: {
        ...identity,
        completedOutcomeId: buildCompletionKey(identity),
      },
      activeVehicleId: params.activeVehicleId,
      updatedAt: startTime,
    });
    const canonicalPlan = createCanonicalExpeditionPlan({
      expeditionId: recordId,
      title: params.expeditionName ?? params.vehicleName,
      activeVehicleId: params.activeVehicleId,
      routeAssetId: params.routeAssetId,
      tripPlanId: params.tripPlanId,
      offlinePackageId: params.offlinePackageId,
      createdAt: startTime,
      updatedAt: startTime,
    });
    const readyLifecycle = createCanonicalExpeditionLifecycle({
      plan: canonicalPlan,
      initialState: 'ready',
      cause: params.transitionCause ?? 'system',
      occurredAt: startTime,
      allowDegradedPlanning: true,
    });
    const activeLifecycleResult = transitionExpeditionLifecycle(readyLifecycle, 'active', {
      idempotencyKey: params.idempotencyKey?.trim() || `runtime-begin:${recordId}`,
      cause: params.transitionCause ?? 'system',
      actor: params.transitionCause === 'geofence' ? 'geofence' : params.transitionCause === 'operator' ? 'operator' : 'system',
      reason: 'Live Expedition runtime started.',
      occurredAt: startTime,
      allowDegradedPlanning: true,
    });
    const record: ExpeditionRecord = {
      id: recordId,
      idempotencyKey: params.idempotencyKey?.trim() || null,
      state: 'active',
      activeVehicleId: params.activeVehicleId,
      vehicleName: params.vehicleName,
      expeditionName: params.expeditionName,
      description: params.description,
      teamLeaderName: params.teamLeaderName,
      teamLeaderCallsign: params.teamLeaderCallsign,
      startLocationLabel: params.startLocationLabel,
      destination: params.destination,
      areaOfOperation: params.areaOfOperation,
      commsNotes: params.commsNotes,
      privacyMode: params.privacyMode,
      joinMode: params.joinMode,
      startTime,
      endTime: null,
      pausedAt: null,
      totalPausedMs: 0,
      duration: null,
      distance: null,
      startFuelLevel: params.startFuelLevel ?? null,
      endFuelLevel: null,
      fuelDelta: null,
      startWaterLevel: params.startWaterLevel ?? null,
      endWaterLevel: null,
      waterDelta: null,
      peakRemoteness: null,
      homeLatitude: params.latitude ?? null,
      homeLongitude: params.longitude ?? null,
      cloudSessionId: null,
      routeAssetId: params.routeAssetId ?? null,
      tripPlanId: params.tripPlanId ?? null,
      offlinePackageId: params.offlinePackageId ?? null,
      runId: params.runId ?? null,
      lifecycle,
      canonicalLifecycle: activeLifecycleResult.lifecycle,
    };


    sSet(KEYS.currentExpedition, JSON.stringify(record));

    // Set home geofence if coordinates provided
    if (params.latitude != null && params.longitude != null) {
      this.setHomeGeofence(params.latitude, params.longitude);
    }

    console.log(TAG, `Expedition started: ${record.id}`);

    // Log timeline event
    this.logTimelineEvent('expedition_started', {
      vehicleId: params.activeVehicleId,
      vehicleName: params.vehicleName,
      expeditionName: params.expeditionName,
      description: params.description,
      teamLeaderName: params.teamLeaderName,
      teamLeaderCallsign: params.teamLeaderCallsign,
      destination: params.destination,
      areaOfOperation: params.areaOfOperation,
      commsNotes: params.commsNotes,
      privacyMode: params.privacyMode,
      joinMode: params.joinMode,
      startFuelLevel: params.startFuelLevel,
      startWaterLevel: params.startWaterLevel,
    });

    // Background cloud sync
    syncSessionToCloud(record, params.userId).then(cloudId => {
      if (cloudId) {
        const current = this.getCurrentExpedition();
        if (current && current.id === record.id) {
          current.cloudSessionId = cloudId;
          sSet(KEYS.currentExpedition, JSON.stringify(current));
          console.log(TAG, `Cloud session linked: ${cloudId}`);
          this._notify();
        }
      }
    }).catch(() => {});

    this._notify();
    return record;
  },

  // ── Pause expedition ────────────────────────────────────
  pauseExpedition(params?: { userId?: string | null }): ExpeditionRecord | null {
    const record = this.getCurrentExpedition();
    if (!record || record.state !== 'active') return null;
    if (!decideJourneyTransition(record.lifecycle?.phase ?? 'active', 'paused').accepted) return null;
    const canonical = canonicalLifecycleForRuntime(record);
    const canonicalResult = transitionExpeditionLifecycle(canonical, 'paused', {
      idempotencyKey: `runtime-pause:${record.id}:${canonical.revision}`,
      cause: 'operator',
      actor: 'operator',
      reason: 'Operator paused the live Expedition.',
      allowDegradedPlanning: true,
    });
    if (!canonicalResult.decision.accepted) return null;

    record.state = 'paused';
    record.pausedAt = new Date().toISOString();
    record.lifecycle = mergeJourneyLinkage(record.lifecycle, {
      phase: 'paused',
      updatedAt: record.pausedAt,
    });
    record.canonicalLifecycle = canonicalResult.lifecycle;

    sSet(KEYS.currentExpedition, JSON.stringify(record));

    console.log(TAG, `Expedition paused: ${record.id}`);

    // Log timeline event
    this.logTimelineEvent('expedition_paused', {
      vehicleName: record.vehicleName,
      elapsedBeforePause: this._computeActiveSeconds(record),
    });

    // Background cloud sync
    syncSessionToCloud(record, params?.userId).catch(() => {});

    this._notify();
    return record;
  },

  // ── Resume expedition ──────────────────────────────────
  resumeExpedition(params?: { userId?: string | null }): ExpeditionRecord | null {
    const record = this.getCurrentExpedition();
    if (!record || record.state !== 'paused') return null;
    if (!decideJourneyTransition(record.lifecycle?.phase ?? 'paused', 'active').accepted) return null;
    const canonical = canonicalLifecycleForRuntime(record);
    const canonicalResult = transitionExpeditionLifecycle(canonical, 'active', {
      idempotencyKey: `runtime-resume:${record.id}:${canonical.revision}`,
      cause: 'operator',
      actor: 'operator',
      reason: 'Operator resumed the live Expedition.',
      allowDegradedPlanning: true,
    });
    if (!canonicalResult.decision.accepted) return null;

    // Accumulate paused duration
    if (record.pausedAt) {
      const pausedMs = Date.now() - new Date(record.pausedAt).getTime();
      record.totalPausedMs = (record.totalPausedMs || 0) + Math.max(0, pausedMs);
    }

    record.state = 'active';
    record.pausedAt = null;
    record.lifecycle = mergeJourneyLinkage(record.lifecycle, {
      phase: 'active',
      updatedAt: new Date().toISOString(),
    });
    record.canonicalLifecycle = canonicalResult.lifecycle;

    sSet(KEYS.currentExpedition, JSON.stringify(record));

    console.log(TAG, `Expedition resumed: ${record.id}`);

    // Log timeline event
    this.logTimelineEvent('expedition_resumed', {
      vehicleName: record.vehicleName,
      totalPausedMs: record.totalPausedMs,
    });

    // Background cloud sync
    syncSessionToCloud(record, params?.userId).catch(() => {});

    this._notify();
    return record;
  },

  // ── End expedition ─────────────────────────────────────
  // Can end from either 'active' or 'paused' state
  endExpedition(params?: {
    endFuelLevel?: number | null;
    endWaterLevel?: number | null;
    distance?: number | null;
    peakRemoteness?: number | null;
    userId?: string | null;
    transitionCause?: 'operator' | 'geofence' | 'system';
    idempotencyKey?: string | null;
  }): ExpeditionRecord | null {
    const record = this.getCurrentExpedition();
    if (!record || (record.state !== 'active' && record.state !== 'paused')) return null;
    if (!decideJourneyTransition(record.lifecycle?.phase ?? record.state, 'completed').accepted) return null;

    // If ending while paused, accumulate final pause duration
    if (record.state === 'paused' && record.pausedAt) {
      const pausedMs = Date.now() - new Date(record.pausedAt).getTime();
      record.totalPausedMs = (record.totalPausedMs || 0) + Math.max(0, pausedMs);
    }

    const endTime = new Date().toISOString();
    const canonical = canonicalLifecycleForRuntime(record);
    const completionKey = params?.idempotencyKey?.trim() || `runtime-complete:${record.id}:${canonical.revision}`;
    const completingResult = transitionExpeditionLifecycle(canonical, 'completing', {
      idempotencyKey: `${completionKey}:begin`,
      cause: params?.transitionCause ?? 'operator',
      actor: params?.transitionCause === 'geofence' ? 'geofence' : params?.transitionCause === 'operator' ? 'operator' : 'system',
      reason: 'Live Expedition completion captured.',
      occurredAt: endTime,
      allowDegradedPlanning: true,
    });
    if (!completingResult.decision.accepted) return null;
    const completedResult = transitionExpeditionLifecycle(completingResult.lifecycle, 'completed', {
      idempotencyKey: `${completionKey}:commit`,
      cause: params?.transitionCause ?? 'operator',
      actor: params?.transitionCause === 'geofence' ? 'geofence' : params?.transitionCause === 'operator' ? 'operator' : 'system',
      reason: 'Live Expedition outcome committed.',
      occurredAt: endTime,
      allowDegradedPlanning: true,
    });
    if (!completedResult.decision.accepted) return null;
    const startMs = new Date(record.startTime).getTime();
    const endMs = new Date(endTime).getTime();
    // Total wall-clock duration minus accumulated paused time
    const totalMs = endMs - startMs;
    const activeDurationMs = totalMs - (record.totalPausedMs || 0);
    const durationSec = Math.round(Math.max(0, activeDurationMs) / 1000);

    record.state = 'complete';
    record.endTime = endTime;
    record.pausedAt = null;
    record.duration = durationSec;
    record.distance = params?.distance ?? record.distance;
    record.endFuelLevel = params?.endFuelLevel ?? null;
    record.endWaterLevel = params?.endWaterLevel ?? null;
    record.peakRemoteness = params?.peakRemoteness ?? record.peakRemoteness;
    record.lifecycle = mergeJourneyLinkage(record.lifecycle, {
      phase: 'completed',
      updatedAt: endTime,
    });
    record.canonicalLifecycle = completedResult.lifecycle;

    // Calculate deltas
    if (record.startFuelLevel != null && record.endFuelLevel != null) {
      record.fuelDelta = record.startFuelLevel - record.endFuelLevel;
    }
    if (record.startWaterLevel != null && record.endWaterLevel != null) {
      record.waterDelta = record.startWaterLevel - record.endWaterLevel;
    }

    sSet(KEYS.currentExpedition, JSON.stringify(record));

    // Add to log
    this._addToLog(record);

    console.log(TAG, `Expedition ended: ${record.id}, duration: ${durationSec}s`);

    // Log timeline event
    this.logTimelineEvent('expedition_ended', {
      duration: durationSec,
      distance: record.distance,
      fuelDelta: record.fuelDelta,
      waterDelta: record.waterDelta,
      peakRemoteness: record.peakRemoteness,
      totalPausedMs: record.totalPausedMs,
    });

    // Background cloud sync
    syncSessionToCloud(record, params?.userId).catch(() => {});

    // Completed expeditions should not leave a stale auto-start geofence behind.
    this.clearHomeGeofence();

    this._notify();
    return record;
  },

  // ── Update tracking data during active expedition ──────
  updateTracking(params: {
    distance?: number;
    peakRemoteness?: number;
  }): void {
    const record = this.getCurrentExpedition();
    if (!record || (record.state !== 'active' && record.state !== 'paused')) return;

    const previousDistance = record.distance;
    const previousPeakRemoteness = record.peakRemoteness;
    if (params.distance != null) record.distance = params.distance;
    if (params.peakRemoteness != null) {
      record.peakRemoteness = Math.max(record.peakRemoteness ?? 0, params.peakRemoteness);
    }

    if (
      record.distance === previousDistance &&
      record.peakRemoteness === previousPeakRemoteness
    ) return;

    sSet(KEYS.currentExpedition, JSON.stringify(record));
    if (!trackingNotificationPending) {
      trackingNotificationPending = true;
      const publish = () => {
        trackingNotificationPending = false;
        this._notify('tracking');
      };
      if (typeof queueMicrotask === 'function') queueMicrotask(publish);
      else Promise.resolve().then(publish);
    }
  },

  // ── Force reset to standby ─────────────────────────────
  reset(): void {
    sClear(KEYS.currentExpedition);
    this.clearHomeGeofence();
    this._notify();
  },

  // ── Compute active seconds (excluding paused time) ─────
  _computeActiveSeconds(record: ExpeditionRecord): number {
    const startMs = new Date(record.startTime).getTime();
    const nowMs = Date.now();
    const totalMs = nowMs - startMs;
    const pausedMs = record.totalPausedMs || 0;
    // If currently paused, don't count current pause segment (it hasn't been accumulated yet)
    return Math.round(Math.max(0, totalMs - pausedMs) / 1000);
  },

  // ── Get elapsed time for active/paused expedition ──────
  getElapsedSeconds(): number {
    const record = this.getCurrentExpedition();
    if (!record || (record.state !== 'active' && record.state !== 'paused')) return 0;
    const startMs = new Date(record.startTime).getTime();
    const nowMs = Date.now();
    const totalMs = nowMs - startMs;
    let pausedMs = record.totalPausedMs || 0;
    // If currently paused, add the current pause segment
    if (record.state === 'paused' && record.pausedAt) {
      pausedMs += nowMs - new Date(record.pausedAt).getTime();
    }
    return Math.round(Math.max(0, totalMs - pausedMs) / 1000);
  },


  // ── Geofence ───────────────────────────────────────────
  getGeofenceTransitionProposals(): GeofenceExpeditionTransitionProposal[] {
    return getLocalGeofenceProposals();
  },

  proposeGeofenceTransition(input: {
    direction: 'start' | 'end';
    vehicleId: string;
    expeditionId?: string | null;
    reason?: string | null;
  }): { proposal: GeofenceExpeditionTransitionProposal; idempotent: boolean } {
    const proposals = getLocalGeofenceProposals();
    const current = this.getCurrentExpedition();
    const mostRecentAcceptedEnd = [...proposals]
      .reverse()
      .find((proposal) => proposal.direction === 'end' && proposal.status === 'accepted');
    const cycleAnchor = input.direction === 'end'
      ? input.expeditionId ?? current?.id ?? 'missing-expedition'
      : mostRecentAcceptedEnd?.id ?? 'initial-cycle';
    const idempotencyKey = [
      'geofence',
      input.direction,
      safeProposalPart(input.vehicleId),
      safeProposalPart(cycleAnchor),
    ].join(':');
    const existing = proposals.find((proposal) => proposal.idempotencyKey === idempotencyKey);
    if (existing) return { proposal: existing, idempotent: true };
    const createdAt = new Date().toISOString();
    const proposal: GeofenceExpeditionTransitionProposal = {
      id: `geofence-proposal:${idempotencyKey}`,
      idempotencyKey,
      direction: input.direction,
      status: 'pending',
      vehicleId: input.vehicleId,
      expeditionId: input.expeditionId ?? current?.id ?? null,
      cycleAnchor,
      reason: input.reason?.trim() || (
        input.direction === 'start'
          ? 'Confirmed departure from the home geofence.'
          : 'Confirmed return to the home geofence.'
      ),
      createdAt,
      resolvedAt: null,
    };
    saveLocalGeofenceProposals([...proposals, proposal]);
    return { proposal, idempotent: false };
  },

  resolveGeofenceTransitionProposal(
    proposalId: string,
    status: 'accepted' | 'rejected',
  ): GeofenceExpeditionTransitionProposal | null {
    const proposals = getLocalGeofenceProposals();
    const existing = proposals.find((proposal) => proposal.id === proposalId);
    if (!existing) return null;
    if (existing.status !== 'pending') return existing;
    const resolved: GeofenceExpeditionTransitionProposal = {
      ...existing,
      status,
      resolvedAt: new Date().toISOString(),
    };
    saveLocalGeofenceProposals(proposals.map((proposal) => proposal.id === proposalId ? resolved : proposal));
    return resolved;
  },

  clearGeofenceTransitionProposalsForTests(): void {
    sSet(KEYS.geofenceProposals, JSON.stringify([]));
  },

  setHomeGeofence(lat: number, lng: number): void {
    sSet(KEYS.homeGeofence, JSON.stringify({ lat, lng }));
  },

  clearHomeGeofence(): void {
    sClear(KEYS.homeGeofence);
  },

  getHomeGeofence(): { lat: number; lng: number } | null {
    try {
      const raw = sGet(KEYS.homeGeofence);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  },

  getGeofenceRadius(): number {
    return DEFAULT_GEOFENCE_RADIUS;
  },

  setGeofenceRadius(_meters: number): void {
    sClear(KEYS.geofenceRadius);
  },

  // ── Check if position is outside geofence ──────────────
  isOutsideGeofence(lat: number, lng: number): boolean {
    const home = this.getHomeGeofence();
    if (!home) return false;
    const radius = this.getGeofenceRadius();
    const distance = haversineDistance(home.lat, home.lng, lat, lng);
    return distance > radius;
  },

  // ── Check if position is inside geofence ───────────────
  isInsideGeofence(lat: number, lng: number): boolean {
    const home = this.getHomeGeofence();
    if (!home) return false;
    const radius = this.getGeofenceRadius();
    const distance = haversineDistance(home.lat, home.lng, lat, lng);
    return distance <= radius;
  },

  // ── Expedition Log ─────────────────────────────────────
  getLog(): ExpeditionLogEntry[] {
    try {
      const raw = sGet(KEYS.expeditionLog);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  clearLog(): void {
    sSet(KEYS.expeditionLog, JSON.stringify([]));
  },

  importLog(entries: ExpeditionLogEntry[]): { imported: number; skipped: number } {
    const existing = this.getLog();
    const byId = new Map(existing.map((entry) => [entry.id, entry]));
    let imported = 0;
    let skipped = 0;

    for (const incoming of entries) {
      if (!incoming?.id) {
        skipped++;
        continue;
      }
      byId.set(incoming.id, incoming);
      imported++;
    }

    if (imported > 0) {
      const merged = Array.from(byId.values())
        .sort((a, b) => new Date(b.endTime || b.startTime).getTime() - new Date(a.endTime || a.startTime).getTime())
        .slice(0, 100);
      sSet(KEYS.expeditionLog, JSON.stringify(merged));
    }

    return { imported, skipped };
  },

  clearTimeline(): void {
    sSet(KEYS.timelineEvents, JSON.stringify([]));
  },

  _addToLog(record: ExpeditionRecord): void {
    const log = this.getLog().filter((existing) => existing.id !== record.id);
    const entry: ExpeditionLogEntry = {
      id: record.id,
      vehicleId: record.activeVehicleId,
      vehicleName: record.vehicleName,
      startTime: record.startTime,
      endTime: record.endTime || new Date().toISOString(),
      duration: record.duration || 0,
      distance: record.distance || 0,
      fuelDelta: record.fuelDelta,
      waterDelta: record.waterDelta,
      peakRemoteness: record.peakRemoteness,
    };
    log.unshift(entry); // newest first
    // Keep last 100 entries
    if (log.length > 100) log.length = 100;
    sSet(KEYS.expeditionLog, JSON.stringify(log));
  },

  // ── Load session history from cloud ────────────────────
  async loadCloudHistory(userId: string): Promise<ExpeditionLogEntry[]> {
    if (!isSupabaseConfigured) return [];
    if (isExpeditionCloudTableUnavailable('expedition_sessions')) return [];
    try {
      const { data, error } = await supabase
        .from('expedition_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) {
        if (error) markExpeditionCloudTableUnavailable(TAG, 'expedition_sessions', error);
        return [];
      }

      return data.map((row: any) => ({
        id: row.id,
        vehicleId: row.vehicle_id,
        vehicleName: row.vehicle_name,
        startTime: row.start_time,
        endTime: row.end_time || '',
        duration: row.duration_seconds || 0,
        distance: row.distance_meters || 0,
        fuelDelta: row.fuel_delta,
        waterDelta: row.water_delta,
        peakRemoteness: row.peak_remoteness,
      }));
    } catch (e) {
      markExpeditionCloudTableUnavailable(TAG, 'expedition_sessions', e);
      return [];
    }
  },
};

export function waitForExpeditionStateHydration(): Promise<void> {
  return expeditionStateHydration;
}

export function selectActiveExpeditionRecord(
  state: ExpeditionState,
  record: ExpeditionRecord | null,
): ExpeditionRecord | null {
  return state === 'active' || state === 'paused' ? record : null;
}

export function getExpeditionRuntimeSnapshot(): ExpeditionRuntimeSnapshot {
  const state = expeditionStateStore.getState();
  const record = expeditionStateStore.getCurrentExpedition();
  const source = expeditionRuntimeSource === 'none' && expeditionRuntimeHydrationStatus === 'ready' && record
    ? 'restored'
    : expeditionRuntimeSource;
  return {
    state,
    record,
    activeRecord: selectActiveExpeditionRecord(state, record),
    hydrationStatus: expeditionRuntimeHydrationStatus,
    source,
    freshness: record ? (source === 'restored' ? 'cached' : 'current') : 'missing',
    revision: expeditionPublishedRevision,
    safeErrorCode: expeditionRuntimeSafeErrorCode,
  };
}

export function getExpeditionStateSubscriptionDiagnostics() {
  return {
    consumerCount: listeners.size,
    publishedRevision: expeditionPublishedRevision,
    trackingNotificationPending,
    latestProducerEvent: { ...latestExpeditionProducerEvent },
  };
}

// ── Haversine distance (meters) ──────────────────────────────
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

// ── Duration formatter ───────────────────────────────────────
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${mins}m`;
  return `${hours}h ${mins}m`;
}

// ── Distance formatter ───────────────────────────────────────
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  const miles = meters / 1609.344;
  return `${miles.toFixed(1)} mi`;
}

