// ============================================================
// ECS TIMELINE INTELLIGENCE ENGINE
// ============================================================
// Automatically logs key events during an active expedition.
// Acts as a mission logbook that records important moments:
//   - Expedition start / end
//   - Distance milestones (every 25 miles)
//   - Remote zone entry (remoteness index threshold)
//   - Power system warnings (battery < 20%)
//   - Camp established (manual)
//   - Fuel stops (manual)
//   - System warnings
//
// Architecture:
//   - Periodic monitor (every 10 seconds when active)
//   - Reads from gpsDistanceTracker, remotenessStore, ecoflow
//   - Stores locally first, background syncs to Supabase
//   - Subscriber pattern for UI updates
// ============================================================

import { Platform } from 'react-native';
import { supabase, isSupabaseConfigured } from './supabase';
import { expeditionStateStore, type ExpeditionState, type ExpeditionRecord } from './expeditionStateStore';
import { gpsDistanceTracker } from './gpsDistanceTracker';
import { remotenessStore, type RemotenessTier } from './remotenessStore';
import { gpsUIState } from './gpsUIState';
import {
  isExpeditionCloudTableUnavailable,
  markExpeditionCloudTableUnavailable,
} from './expeditionCloudSyncAvailability';

const TAG = '[TIMELINE_INTEL]';

// ── Types ────────────────────────────────────────────────────

export type TimelineEventType =
  | 'expedition_start'
  | 'expedition_end'
  | 'milestone'
  | 'remote_zone_entered'
  | 'remote_zone_exited'
  | 'system_warning'
  | 'fuel_stop'
  | 'camp_established'
  | 'power_warning'
  | 'checkpoint'
  | 'manual_note';

export interface TimelineEntry {
  id: string;
  expedition_id: string;
  timestamp: string;
  event_type: TimelineEventType;
  title: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  meta: Record<string, any>;
  _synced: boolean;
}

export interface TimelineSummary {
  totalEvents: number;
  distanceMi: number;
  durationFormatted: string;
  durationSeconds: number;
  remoteZonesEntered: number;
  milestonesReached: number;
  systemWarnings: number;
  peakRemoteness: RemotenessTier | null;
  fuelStops: number;
  campsEstablished: number;
}

// ── Storage helpers ──────────────────────────────────────────
const mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return mem[key] || null;
  } catch { return mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    mem[key] = value;
  } catch { mem[key] = value; }
}

function uuid(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ── Constants ────────────────────────────────────────────────
const STORAGE_KEY = 'ecs_timeline_intelligence';
const MONITOR_INTERVAL_MS = 10_000; // Check every 10 seconds
const MILESTONE_INTERVAL_MI = 25;   // Every 25 miles
const REMOTENESS_THRESHOLD = 50;    // Score >= 50 = remote zone
const BATTERY_LOW_THRESHOLD = 20;   // Battery < 20%

// ── Event Type Metadata ──────────────────────────────────────
export const TIMELINE_EVENT_META: Record<TimelineEventType, {
  label: string;
  icon: string;
  color: string;
  dotColor: string;
}> = {
  expedition_start:     { label: 'EXPEDITION START',   icon: 'flag-outline',            color: '#4CAF50', dotColor: '#4CAF50' },
  expedition_end:       { label: 'EXPEDITION END',     icon: 'checkmark-circle-outline', color: '#D4A017', dotColor: '#D4A017' },
  milestone:            { label: 'MILESTONE',          icon: 'trophy-outline',          color: '#42A5F5', dotColor: '#42A5F5' },
  remote_zone_entered:  { label: 'REMOTE ZONE',       icon: 'radio-outline',           color: '#E67E22', dotColor: '#E67E22' },
  remote_zone_exited:   { label: 'ZONE EXIT',         icon: 'exit-outline',            color: '#66BB6A', dotColor: '#66BB6A' },
  system_warning:       { label: 'WARNING',            icon: 'warning-outline',         color: '#FF9500', dotColor: '#FF9500' },
  fuel_stop:            { label: 'FUEL STOP',          icon: 'flame-outline',           color: '#EF5350', dotColor: '#EF5350' },
  camp_established:     { label: 'CAMP',               icon: 'bonfire-outline',         color: '#FFB74D', dotColor: '#FFB74D' },
  power_warning:        { label: 'POWER WARNING',      icon: 'flash-outline',           color: '#FF5722', dotColor: '#FF5722' },
  checkpoint:           { label: 'CHECKPOINT',         icon: 'location-outline',        color: '#CE93D8', dotColor: '#CE93D8' },
  manual_note:          { label: 'NOTE',               icon: 'create-outline',          color: '#8B949E', dotColor: '#8B949E' },
};

// ── Listeners ────────────────────────────────────────────────
type TimelineListener = (entries: TimelineEntry[]) => void;
const _listeners = new Set<TimelineListener>();

function _notify(entries: TimelineEntry[]) {
  _listeners.forEach(fn => {
    try { fn(entries); } catch (e) { console.error(TAG, 'Listener error:', e); }
  });
}

// ── Internal State ───────────────────────────────────────────
let _monitorTimer: ReturnType<typeof setInterval> | null = null;
let _isMonitoring = false;
let _lastMilestone = 0;              // Last milestone distance (miles)
let _isInRemoteZone = false;         // Currently in remote zone
let _lastRemotenessTier: RemotenessTier = 'NEAR CIVILIZATION';
let _batteryWarningLogged = false;   // Only log once per expedition
let _expeditionUnsubscribe: (() => void) | null = null;
let _currentExpeditionId: string | null = null;

// ── Local Storage ────────────────────────────────────────────

function loadEntries(): TimelineEntry[] {
  try {
    const raw = sGet(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch { return []; }
}

function saveEntries(entries: TimelineEntry[]): void {
  // Keep last 500 entries
  if (entries.length > 500) entries.length = 500;
  sSet(STORAGE_KEY, JSON.stringify(entries));
}

// ── Cloud Sync ───────────────────────────────────────────────

async function syncEntryToCloud(entry: TimelineEntry): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  if (isExpeditionCloudTableUnavailable('expedition_timeline')) return false;
  try {
    const { error } = await supabase
      .from('expedition_timeline')
      .insert({
        id: entry.id,
        expedition_id: entry.expedition_id,
        timestamp: entry.timestamp,
        event_type: entry.event_type,
        title: entry.title,
        description: entry.description,
        latitude: entry.latitude,
        longitude: entry.longitude,
        meta: entry.meta,
      });
    if (error) {
      if (markExpeditionCloudTableUnavailable(TAG, 'expedition_timeline', error)) {
        return false;
      }
      console.warn(TAG, 'Cloud sync failed:', error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    if (markExpeditionCloudTableUnavailable(TAG, 'expedition_timeline', e)) {
      return false;
    }
    console.warn(TAG, 'Cloud sync error:', e?.message);
    return false;
  }
}

async function syncUnsyncedEntries(): Promise<void> {
  const entries = loadEntries();
  const unsynced = entries.filter(e => !e._synced);
  if (unsynced.length === 0) return;

  for (const entry of unsynced) {
    const ok = await syncEntryToCloud(entry);
    if (ok) {
      entry._synced = true;
    }
  }
  saveEntries(entries);
}

// ── Get Current GPS Position ─────────────────────────────────

function getCurrentPosition(): { lat: number; lng: number } | null {
  const gps = gpsUIState.get();
  if (gps.hasFix && gps.position) {
    return { lat: gps.position.latitude, lng: gps.position.longitude };
  }
  return null;
}

// ── Create Timeline Entry ────────────────────────────────────

function createEntry(
  expeditionId: string,
  eventType: TimelineEventType,
  title: string,
  description: string,
  meta: Record<string, any> = {},
): TimelineEntry {
  const pos = getCurrentPosition();
  const entry: TimelineEntry = {
    id: uuid(),
    expedition_id: expeditionId,
    timestamp: new Date().toISOString(),
    event_type: eventType,
    title,
    description,
    latitude: pos?.lat ?? null,
    longitude: pos?.lng ?? null,
    meta,
    _synced: false,
  };

  // Prepend to local storage (newest first)
  const entries = loadEntries();
  entries.unshift(entry);
  saveEntries(entries);

  // Background cloud sync
  syncEntryToCloud(entry).then(ok => {
    if (ok) {
      entry._synced = true;
      const all = loadEntries();
      const idx = all.findIndex(e => e.id === entry.id);
      if (idx >= 0) {
        all[idx]._synced = true;
        saveEntries(all);
      }
    }
  }).catch(() => {});

  // Notify listeners
  _notify(getEntriesForExpedition(expeditionId));

  console.log(TAG, `Event logged: ${eventType} — ${title}`);
  return entry;
}

// ── Monitor Tick ─────────────────────────────────────────────

function monitorTick(): void {
  if (!_currentExpeditionId) return;

  const expState = expeditionStateStore.getState();
  if (expState !== 'active') return;

  // ── Check Distance Milestones ──────────────────────────
  try {
    const odometer = gpsDistanceTracker.getOdometer();
    const totalMi = odometer.totalDistanceMi;

    if (totalMi > 0) {
      const nextMilestone = (_lastMilestone + 1) * MILESTONE_INTERVAL_MI;
      if (totalMi >= nextMilestone) {
        const milesReached = Math.floor(totalMi / MILESTONE_INTERVAL_MI) * MILESTONE_INTERVAL_MI;
        _lastMilestone = Math.floor(totalMi / MILESTONE_INTERVAL_MI);

        createEntry(
          _currentExpeditionId,
          'milestone',
          'Distance Milestone',
          `${milesReached} miles traveled`,
          { distanceMi: milesReached, totalDistanceMi: totalMi },
        );
      }
    }
  } catch {}

  // ── Check Remoteness Index ─────────────────────────────
  try {
    const remoteness = remotenessStore.get();
    const score = remoteness.score;
    const tier = remoteness.tier;

    if (score >= REMOTENESS_THRESHOLD && !_isInRemoteZone) {
      _isInRemoteZone = true;
      _lastRemotenessTier = tier;

      createEntry(
        _currentExpeditionId,
        'remote_zone_entered',
        'Remote Zone Entered',
        `High isolation detected — ${tier}`,
        { remotenessScore: score, tier, reason: remoteness.reason },
      );
    } else if (score < REMOTENESS_THRESHOLD - 10 && _isInRemoteZone) {
      // Hysteresis: exit at threshold - 10 to prevent flicker
      _isInRemoteZone = false;

      createEntry(
        _currentExpeditionId,
        'remote_zone_exited',
        'Remote Zone Exited',
        `Returned to ${tier} conditions`,
        { remotenessScore: score, tier },
      );
    }

    // Update peak remoteness on expedition record
    if (score > 0) {
      const record = expeditionStateStore.getCurrentExpedition();
      if (record && (record.peakRemoteness == null || score > record.peakRemoteness)) {
        expeditionStateStore.updateTracking({ peakRemoteness: score });
      }
    }
  } catch {}

  // ── Check Power System (EcoFlow Battery) ───────────────
  try {
    // Read EcoFlow battery from localStorage (set by useEcoFlowLive hook)
    const batteryRaw = sGet('ecs_ecoflow_last_battery');
    if (batteryRaw && !_batteryWarningLogged) {
      const batteryPct = parseFloat(batteryRaw);
      if (!isNaN(batteryPct) && batteryPct > 0 && batteryPct < BATTERY_LOW_THRESHOLD) {
        _batteryWarningLogged = true;

        createEntry(
          _currentExpeditionId,
          'power_warning',
          'Power Reserve Low',
          `Battery reserve below ${BATTERY_LOW_THRESHOLD}% (${Math.round(batteryPct)}%)`,
          { batteryPct },
        );
      }
    }
  } catch {}

  // ── Update distance on expedition record ───────────────
  try {
    const odometer = gpsDistanceTracker.getOdometer();
    if (odometer.totalDistanceMi > 0) {
      const distanceMeters = odometer.totalDistanceMi * 1609.344;
      expeditionStateStore.updateTracking({ distance: distanceMeters });
    }
  } catch {}
}

// ── Get Entries ──────────────────────────────────────────────

function getEntriesForExpedition(expeditionId: string): TimelineEntry[] {
  const all = loadEntries();
  return all.filter(e => e.expedition_id === expeditionId);
}

function getAllEntries(): TimelineEntry[] {
  return loadEntries();
}

// ── Generate Summary ─────────────────────────────────────────

function generateSummary(expeditionId: string): TimelineSummary {
  const entries = getEntriesForExpedition(expeditionId);
  const record = expeditionStateStore.getCurrentExpedition();

  const distanceMi = record?.distance
    ? record.distance / 1609.344
    : gpsDistanceTracker.getOdometer().totalDistanceMi;

  const durationSeconds = record?.duration || expeditionStateStore.getElapsedSeconds();

  // Format duration
  let durationFormatted = '0m';
  if (durationSeconds > 0) {
    const days = Math.floor(durationSeconds / 86400);
    const hours = Math.floor((durationSeconds % 86400) / 3600);
    const mins = Math.floor((durationSeconds % 3600) / 60);
    if (days > 0) {
      durationFormatted = `${days}d ${hours}h`;
    } else if (hours > 0) {
      durationFormatted = `${hours}h ${mins}m`;
    } else {
      durationFormatted = `${mins}m`;
    }
  }

  // Count event types
  const remoteZonesEntered = entries.filter(e => e.event_type === 'remote_zone_entered').length;
  const milestonesReached = entries.filter(e => e.event_type === 'milestone').length;
  const systemWarnings = entries.filter(e =>
    e.event_type === 'system_warning' || e.event_type === 'power_warning'
  ).length;
  const fuelStops = entries.filter(e => e.event_type === 'fuel_stop').length;
  const campsEstablished = entries.filter(e => e.event_type === 'camp_established').length;

  // Peak remoteness tier
  let peakRemoteness: RemotenessTier | null = null;
  const remoteEntries = entries.filter(e => e.event_type === 'remote_zone_entered');
  if (remoteEntries.length > 0) {
    const tiers: RemotenessTier[] = ['NEAR CIVILIZATION', 'BACKCOUNTRY', 'REMOTE', 'DEEP REMOTE', 'EXTREME'];
    let maxIdx = 0;
    for (const re of remoteEntries) {
      const tier = re.meta?.tier as RemotenessTier;
      const idx = tiers.indexOf(tier);
      if (idx > maxIdx) maxIdx = idx;
    }
    peakRemoteness = tiers[maxIdx];
  }

  return {
    totalEvents: entries.length,
    distanceMi: Math.round(distanceMi * 10) / 10,
    durationFormatted,
    durationSeconds,
    remoteZonesEntered,
    milestonesReached,
    systemWarnings,
    peakRemoteness,
    fuelStops,
    campsEstablished,
  };
}

// ── Load from Cloud ──────────────────────────────────────────

async function loadCloudEntries(expeditionId: string): Promise<TimelineEntry[]> {
  if (!isSupabaseConfigured) return [];
  if (isExpeditionCloudTableUnavailable('expedition_timeline')) return [];
  try {
    const { data, error } = await supabase
      .from('expedition_timeline')
      .select('*')
      .eq('expedition_id', expeditionId)
      .order('timestamp', { ascending: false })
      .limit(100);

    if (error || !data) {
      if (error) markExpeditionCloudTableUnavailable(TAG, 'expedition_timeline', error);
      return [];
    }

    return data.map((row: any) => ({
      id: row.id,
      expedition_id: row.expedition_id,
      timestamp: row.timestamp,
      event_type: row.event_type as TimelineEventType,
      title: row.title,
      description: row.description || '',
      latitude: row.latitude,
      longitude: row.longitude,
      meta: row.meta || {},
      _synced: true,
    }));
  } catch (e) {
    markExpeditionCloudTableUnavailable(TAG, 'expedition_timeline', e);
    return [];
  }
}

// ============================================================
// PUBLIC API
// ============================================================

export const timelineIntelligenceEngine = {
  /**
   * Subscribe to timeline changes for the current expedition.
   * Returns unsubscribe function.
   */
  subscribe(listener: TimelineListener): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  },

  /**
   * Start monitoring for the active expedition.
   * Called when expedition state becomes ACTIVE.
   */
  start(expeditionId: string): void {
    if (_isMonitoring && _currentExpeditionId === expeditionId) {
      if (!_monitorTimer) {
        _monitorTimer = setInterval(monitorTick, MONITOR_INTERVAL_MS);
      }
      return;
    }

    if (_isMonitoring) this.stop();

    _currentExpeditionId = expeditionId;
    _isMonitoring = true;
    _lastMilestone = 0;
    _isInRemoteZone = false;
    _batteryWarningLogged = false;
    _lastRemotenessTier = 'NEAR CIVILIZATION';

    // Initialize milestone from current distance
    try {
      const odometer = gpsDistanceTracker.getOdometer();
      _lastMilestone = Math.floor(odometer.totalDistanceMi / MILESTONE_INTERVAL_MI);
    } catch {}

    // Log expedition start
    createEntry(
      expeditionId,
      'expedition_start',
      'Expedition Started',
      'Expedition deployment initiated',
      { vehicleName: expeditionStateStore.getCurrentExpedition()?.vehicleName },
    );

    // Start periodic monitoring
    _monitorTimer = setInterval(monitorTick, MONITOR_INTERVAL_MS);

    console.log(TAG, `Monitoring started for expedition ${expeditionId}`);
  },

  /**
   * Stop monitoring. Called when expedition ends.
   */
  stop(): void {
    if (!_isMonitoring && !_monitorTimer) return;

    if (_monitorTimer) {
      clearInterval(_monitorTimer);
      _monitorTimer = null;
    }
    _isMonitoring = false;
    console.log(TAG, 'Monitoring stopped');
  },

  /**
   * Log expedition end event and stop monitoring.
   */
  endExpedition(expeditionId: string): void {
    const summary = generateSummary(expeditionId);

    createEntry(
      expeditionId,
      'expedition_end',
      'Expedition Complete',
      `${summary.distanceMi} mi traveled over ${summary.durationFormatted}`,
      {
        distanceMi: summary.distanceMi,
        durationFormatted: summary.durationFormatted,
        durationSeconds: summary.durationSeconds,
        milestonesReached: summary.milestonesReached,
        remoteZonesEntered: summary.remoteZonesEntered,
      },
    );

    this.stop();
  },

  /**
   * Manually log a custom event.
   */
  logEvent(
    eventType: TimelineEventType,
    title: string,
    description: string,
    meta: Record<string, any> = {},
  ): TimelineEntry | null {
    if (!_currentExpeditionId) {
      // Try to get from current expedition
      const record = expeditionStateStore.getCurrentExpedition();
      if (!record) return null;
      _currentExpeditionId = record.id;
    }
    return createEntry(_currentExpeditionId, eventType, title, description, meta);
  },

  /**
   * Log a fuel stop event.
   */
  logFuelStop(description?: string): TimelineEntry | null {
    return this.logEvent('fuel_stop', 'Fuel Stop', description || 'Vehicle refueling', {});
  },

  /**
   * Log a camp established event.
   */
  logCampEstablished(description?: string): TimelineEntry | null {
    return this.logEvent('camp_established', 'Camp Established', description || 'Camp set up for the night', {});
  },

  /**
   * Log a manual note.
   */
  logNote(title: string, description: string): TimelineEntry | null {
    return this.logEvent('manual_note', title, description, {});
  },

  /**
   * Log a system warning.
   */
  logWarning(title: string, description: string, meta: Record<string, any> = {}): TimelineEntry | null {
    return this.logEvent('system_warning', title, description, meta);
  },

  /**
   * Get all timeline entries for an expedition.
   */
  getEntries(expeditionId: string): TimelineEntry[] {
    return getEntriesForExpedition(expeditionId);
  },

  /**
   * Get all timeline entries.
   */
  getAllEntries(): TimelineEntry[] {
    return getAllEntries();
  },

  /**
   * Generate expedition summary from timeline data.
   */
  getSummary(expeditionId: string): TimelineSummary {
    return generateSummary(expeditionId);
  },

  /**
   * Load entries from cloud for an expedition.
   */
  async loadFromCloud(expeditionId: string): Promise<TimelineEntry[]> {
    return loadCloudEntries(expeditionId);
  },

  /**
   * Sync all unsynced entries to cloud.
   */
  async syncToCloud(): Promise<void> {
    return syncUnsyncedEntries();
  },

  /**
   * Clear all local timeline entries for an expedition.
   */
  clearEntries(expeditionId: string): void {
    const all = loadEntries();
    const filtered = all.filter(e => e.expedition_id !== expeditionId);
    saveEntries(filtered);
    _notify([]);
  },

  /**
   * Clear all local timeline entries.
   */
  clearAll(): void {
    saveEntries([]);
    _notify([]);
  },

  /**
   * Whether the engine is actively monitoring.
   */
  isMonitoring(): boolean {
    return _isMonitoring;
  },

  /**
   * Get current expedition ID being monitored.
   */
  getCurrentExpeditionId(): string | null {
    return _currentExpeditionId;
  },

  /**
   * Initialize auto-monitoring based on expedition state changes.
   * Call once at app startup.
   */
  initAutoMonitor(): () => void {
    if (_expeditionUnsubscribe) {
      return () => {};
    }

    const resumeMonitoring = (expeditionId: string) => {
      if (_isMonitoring && _currentExpeditionId === expeditionId && _monitorTimer) return;
      _currentExpeditionId = expeditionId;
      _isMonitoring = true;
      if (!_monitorTimer) {
        _monitorTimer = setInterval(monitorTick, MONITOR_INTERVAL_MS);
      }
    };

    // Subscribe to expedition state changes
    const unsubscribe = expeditionStateStore.subscribe((state: ExpeditionState, record: ExpeditionRecord | null) => {
      if (state === 'active' && record && (!_isMonitoring || _currentExpeditionId !== record.id)) {
        // Expedition just became active — start monitoring
        // Don't log start event if we already have one for this expedition
        const existing = getEntriesForExpedition(record.id);
        const hasStart = existing.some(e => e.event_type === 'expedition_start');
        if (!hasStart) {
          this.start(record.id);
        } else {
          // Resume monitoring without logging start again
          resumeMonitoring(record.id);
        }
      } else if (state === 'complete' && record && _isMonitoring) {
        // Expedition just completed — log end and stop
        this.endExpedition(record.id);
      } else if (state === 'standby') {
        // Reset
        this.stop();
        _currentExpeditionId = null;
      }
    });

    _expeditionUnsubscribe = unsubscribe;

    // Check if there's already an active expedition
    const currentState = expeditionStateStore.getState();
    const currentRecord = expeditionStateStore.getCurrentExpedition();
    if (currentState === 'active' && currentRecord) {
      const existing = getEntriesForExpedition(currentRecord.id);
      const hasStart = existing.some(e => e.event_type === 'expedition_start');
      if (!hasStart) {
        this.start(currentRecord.id);
      } else {
        resumeMonitoring(currentRecord.id);
      }
    }

    return () => {
      if (_expeditionUnsubscribe) {
        _expeditionUnsubscribe();
        _expeditionUnsubscribe = null;
      }
      this.stop();
    };
  },
};

