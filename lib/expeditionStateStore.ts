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

const TAG = '[EXPEDITION_STATE]';

// ── Types ────────────────────────────────────────────────────
export type ExpeditionState = 'standby' | 'active' | 'paused' | 'complete';

export interface ExpeditionRecord {
  id: string;
  state: ExpeditionState;
  activeVehicleId: string;
  vehicleName: string;
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
  | 'expedition_dismissed'
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
};

// ── Default geofence radius (meters) ─────────────────────────
const DEFAULT_GEOFENCE_RADIUS = 200;

// ── Listeners ────────────────────────────────────────────────
type StateListener = (state: ExpeditionState, record: ExpeditionRecord | null) => void;
const listeners: Set<StateListener> = new Set();

// ── Timeline Event Listeners ─────────────────────────────────
type TimelineListener = (event: TimelineEvent) => void;
const timelineListeners: Set<TimelineListener> = new Set();

async function hydrateNativeState(): Promise<void> {
  if (Platform.OS === 'web') return;
  await expeditionPersistence.waitForHydration();
  const keys = Object.values(KEYS);
  keys.forEach((key) => {
    const value = expeditionPersistence.get(key);
    if (value != null) {
      mem[key] = value;
    }
  });
}

const expeditionStateHydration = hydrateNativeState();

// ── Cloud Sync Helpers ───────────────────────────────────────

async function syncSessionToCloud(record: ExpeditionRecord, userId?: string | null): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
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
        console.warn(TAG, 'Cloud session create failed:', error?.message);
        return null;
      }
      return data.id;
    }
  } catch (e: any) {
    console.warn(TAG, 'Cloud sync error:', e?.message);
    return null;
  }
}

async function logTimelineToCloud(sessionId: string, eventType: TimelineEventType, eventData: Record<string, any>): Promise<void> {
  if (!isSupabaseConfigured) return;
  try {
    await supabase
      .from('expedition_timeline_events')
      .insert({
        session_id: sessionId,
        event_type: eventType,
        event_data: eventData,
        occurred_at: new Date().toISOString(),
      });
  } catch (e: any) {
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

  _notify(): void {
    const state = this.getState();
    const record = this.getCurrentExpedition();
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
      return JSON.parse(raw);
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
    if (record?.cloudSessionId || record?.id) {
      logTimelineToCloud(record?.cloudSessionId || record?.id || sessionId, eventType, eventData).catch(() => {});
    }

    return event;
  },

  // ── Begin expedition ───────────────────────────────────
  beginExpedition(params: {
    activeVehicleId: string;
    vehicleName: string;
    startFuelLevel?: number | null;
    startWaterLevel?: number | null;
    latitude?: number | null;
    longitude?: number | null;
    userId?: string | null;
  }): ExpeditionRecord {
    const record: ExpeditionRecord = {
      id: uuid(),
      state: 'active',
      activeVehicleId: params.activeVehicleId,
      vehicleName: params.vehicleName,
      startTime: new Date().toISOString(),
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

    record.state = 'paused';
    record.pausedAt = new Date().toISOString();

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

    // Accumulate paused duration
    if (record.pausedAt) {
      const pausedMs = Date.now() - new Date(record.pausedAt).getTime();
      record.totalPausedMs = (record.totalPausedMs || 0) + Math.max(0, pausedMs);
    }

    record.state = 'active';
    record.pausedAt = null;

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
  }): ExpeditionRecord | null {
    const record = this.getCurrentExpedition();
    if (!record || (record.state !== 'active' && record.state !== 'paused')) return null;

    // If ending while paused, accumulate final pause duration
    if (record.state === 'paused' && record.pausedAt) {
      const pausedMs = Date.now() - new Date(record.pausedAt).getTime();
      record.totalPausedMs = (record.totalPausedMs || 0) + Math.max(0, pausedMs);
    }

    const endTime = new Date().toISOString();
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

    this._notify();
    return record;
  },

  // ── Dismiss completed expedition (back to standby) ─────
  dismissExpedition(): void {
    const record = this.getCurrentExpedition();
    if (record && record.state === 'complete') {
      // Log timeline event before clearing
      this.logTimelineEvent('expedition_dismissed', {
        expeditionId: record.id,
        vehicleName: record.vehicleName,
        duration: record.duration,
      });

      sSet(KEYS.currentExpedition, '');
      console.log(TAG, 'Expedition dismissed, returning to standby');
      this._notify();
    }
  },

  // ── Update tracking data during active expedition ──────
  updateTracking(params: {
    distance?: number;
    peakRemoteness?: number;
  }): void {
    const record = this.getCurrentExpedition();
    if (!record || (record.state !== 'active' && record.state !== 'paused')) return;

    if (params.distance != null) record.distance = params.distance;
    if (params.peakRemoteness != null) {
      record.peakRemoteness = Math.max(record.peakRemoteness ?? 0, params.peakRemoteness);
    }

    sSet(KEYS.currentExpedition, JSON.stringify(record));
  },

  // ── Force reset to standby ─────────────────────────────
  reset(): void {
    sSet(KEYS.currentExpedition, '');
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
  setHomeGeofence(lat: number, lng: number): void {
    sSet(KEYS.homeGeofence, JSON.stringify({ lat, lng }));
  },

  getHomeGeofence(): { lat: number; lng: number } | null {
    try {
      const raw = sGet(KEYS.homeGeofence);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
  },

  getGeofenceRadius(): number {
    try {
      const raw = sGet(KEYS.geofenceRadius);
      if (raw) return parseInt(raw, 10) || DEFAULT_GEOFENCE_RADIUS;
    } catch {}
    return DEFAULT_GEOFENCE_RADIUS;
  },

  setGeofenceRadius(meters: number): void {
    sSet(KEYS.geofenceRadius, String(meters));
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

  clearTimeline(): void {
    sSet(KEYS.timelineEvents, JSON.stringify([]));
  },

  _addToLog(record: ExpeditionRecord): void {
    const log = this.getLog();
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
    try {
      const { data, error } = await supabase
        .from('expedition_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error || !data) return [];

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
    } catch {
      return [];
    }
  },
};

export function waitForExpeditionStateHydration(): Promise<void> {
  return expeditionStateHydration;
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

