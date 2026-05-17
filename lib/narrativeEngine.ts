/**
 * ECS Expedition Narrative Engine v1.4
 *
 * Fully automatic Expedition Timeline system that logs only meaningful
 * "memory moments" — not spam.
 *
 * EVENT TYPES:
 *   ROUTE_STARTED          — Expedition route activated
 *   WAYPOINT_REACHED       — Arrived at a named waypoint
 *   REMOTENESS_TIER_CHANGED — Entered a new remoteness tier
 *   OFFLINE_DETECTED       — Lost connectivity (confirmed after 30s)
 *   PAYLOAD_THRESHOLD_CROSSED — Payload exceeded 90% capacity or over GVWR
 *   CAMP_ESTABLISHED       — Arrived at a camp-type waypoint
 *   TRACKING_RESUMED       — Resumed after inactivity pause (Phase 6)
 *
 * DEDUP / ANTI-SPAM:
 *   - No duplicate eventType+message within 10 minutes
 *   - Max 1 event per minute overall (global rate limit)
 *   - Only state transitions (threshold crossings), not continuous updates
 *
 * HUMAN-READABLE STYLE:
 *   Messages read like a story:
 *     "Started route: Desert Canyon Loop"
 *     "Started route"  (fallback if no name)
 *     "Reached waypoint: Mile Marker 14"
 *     "Camp established: Sunset Ridge"
 *     "Entered DEEP REMOTE"
 *     "Offline conditions detected"
 *     "Payload exceeded 90% capacity"
 *     "Vehicle is over GVWR"
 *     "Resumed tracking"
 *
 * ARCHITECTURE:
 *   - Singleton engine with start/stop lifecycle
 *   - Subscribes to: remotenessStore, connectivity, waypointProgressStore.onArrival
 *   - Reads: routeStore, weightStore, weightEngine (computeFullBuildWeightBreakdown)
 *   - Local persistence via localStorage for offline resilience
 *   - Background sync to Supabase via expedition-events edge function
 *   - Listeners for UI components to subscribe to timeline updates
 *
 * Phase 2 (Route + Waypoint Moments):
 *   - ROUTE_STARTED fires on engine start when active route exists
 *     with human-readable fallback if route has no name
 *   - WAYPOINT_REACHED / CAMP_ESTABLISHED fire via waypointProgressStore
 *     arrival notifications — NOT via independent proximity polling
 *   - Only logs on arrival transitions (distance <= arrival threshold)
 *   - Does not log repeatedly if user hovers around arrival radius
 *     (waypointProgressStore only fires for genuinely new arrivals)
 *
 * Phase 3 (Remoteness + Offline + Payload Moments):
 *
 *   REMOTENESS_TIER_CHANGED:
 *     - Fires when remotenessTier changes and remains stable.
 *     - Stability is guaranteed by remotenessStore's anti-flicker logic:
 *       tier change requires sustained 30s hold OR crossing by >= 8 pts.
 *     - The store only notifies when the output meaningfully changes,
 *       so the narrative engine receives only stable tier transitions.
 *     - Message: "Entered {remotenessTier}"
 *
 *   OFFLINE_DETECTED:
 *     - Fires when connectivity becomes offline and REMAINS offline > 30s.
 *     - A debounce timer confirms the offline state before emitting.
 *     - If connectivity returns online before 30s, the timer is cancelled.
 *     - Does NOT log again until connectivity returns online and later
 *       goes offline again (prevents repeated offline events).
 *     - Message: "Offline conditions detected"
 *
 *   PAYLOAD_THRESHOLD_CROSSED (two thresholds):
 *     a) Zone utilization >= 90% and previously < 90%:
 *        "Payload exceeded 90% capacity"
 *     b) payload_margin_lb < 0 and previously >= 0 (GVWR exceeded):
 *        "Vehicle is over GVWR"  (always highlighted)
 *     - Uses computeFullBuildWeightBreakdown() as single source of truth
 *       for GVWR-based payload margin.
 *     - Uses computeVehicleWeightSummary() for zone-based utilization.
 *     - Dedup rules prevent repeats.
 *
 * Phase 5 (Event Coordinates):
 *   - Every narrative event stores GPS coordinates at time of creation:
 *       latitude  (number | null)
 *       longitude (number | null)
 *       elevationFt (number | null)
 *   - Reads from gpsUIState singleton (throttled GPS position store).
 *   - If GPS fix is available (hasFix === true): stores lat, lon, elevation.
 *   - If no GPS fix: stores null for all coordinate fields.
 *   - Event creation is NEVER blocked by missing GPS.
 *   - Coordinates are hidden metadata — NOT displayed in timeline UI.
 *   - Structured for future: map rendering, replay visualization, export.
 *   - Coordinates flow through to server via sync payload.
 *   - Server stores as: latitude, longitude, elevation_ft columns.
 *
 * Phase 6 (Inactivity Guard):
 *   - Pauses all automatic event logging when app is inactive > 5 min.
 *   - Inactive = app in background OR no GPS updates for > 5 min.
 *   - When user returns: emits single "Resumed tracking" event.
 *   - Does NOT retroactively generate events for the inactive period.
 *   - Does NOT auto-end expedition regardless of inactivity duration.
 *   - Inactivity guard checks state every 30 seconds via timer.
 *   - Uses AppState (React Native) for lifecycle detection.
 *   - TRACKING_RESUMED event bypasses the pause check (it IS the resume).
 */

import { Platform } from 'react-native';
import { isDeployedEdgeFunction, supabase } from './supabase';
import { remotenessStore, type RemotenessTier } from './remotenessStore';
import { connectivity, type ConnectivityStatus } from './connectivity';
import { routeStore } from './routeStore';
import { waypointProgressStore, type WaypointArrivalEvent } from './waypointProgressStore';
import { gpsUIState } from './gpsUIState';
import { inactivityGuard } from './inactivityGuard';

// ══════════════════════════════════════════════════════════
// TYPES
// ══════════════════════════════════════════════════════════

export type NarrativeEventType =
  | 'ROUTE_STARTED'
  | 'WAYPOINT_REACHED'
  | 'REMOTENESS_TIER_CHANGED'
  | 'OFFLINE_DETECTED'
  | 'PAYLOAD_THRESHOLD_CROSSED'
  | 'CAMP_ESTABLISHED'
  | 'TRACKING_RESUMED';

export interface NarrativeEvent {
  id: string;
  expeditionId: string;
  timestamp: string;
  eventType: NarrativeEventType;
  message: string;
  meta: Record<string, any>;
  highlight: boolean;
  /** GPS latitude at time of event (null if no fix) */
  latitude: number | null;
  /** GPS longitude at time of event (null if no fix) */
  longitude: number | null;
  /** GPS elevation in feet at time of event (null if unavailable) */
  elevationFt: number | null;
  /** Local-only: true while waiting for server confirmation */
  _synced: boolean;
}

export const NARRATIVE_EVENT_META: Record<NarrativeEventType, {
  label: string;
  icon: string;
  color: string;
  highlightDefault: boolean;
}> = {
  ROUTE_STARTED:             { label: 'Route Started',       icon: 'navigate-outline',      color: '#42A5F5', highlightDefault: true },
  WAYPOINT_REACHED:          { label: 'Waypoint Reached',    icon: 'flag-outline',           color: '#66BB6A', highlightDefault: false },
  REMOTENESS_TIER_CHANGED:   { label: 'Remoteness Changed',  icon: 'cellular-outline',       color: '#E67E22', highlightDefault: true },
  OFFLINE_DETECTED:          { label: 'Offline Detected',    icon: 'cloud-offline-outline',  color: '#EF5350', highlightDefault: true },
  PAYLOAD_THRESHOLD_CROSSED: { label: 'Payload Threshold',   icon: 'scale-outline',          color: '#FFB74D', highlightDefault: false },
  CAMP_ESTABLISHED:          { label: 'Camp Established',    icon: 'bonfire-outline',        color: '#CE93D8', highlightDefault: true },
  TRACKING_RESUMED:          { label: 'Tracking Resumed',    icon: 'play-outline',           color: '#81C784', highlightDefault: false },
};

// ══════════════════════════════════════════════════════════
// CONSTANTS
// ══════════════════════════════════════════════════════════

/** Minimum interval between any two events (ms) */
const GLOBAL_RATE_LIMIT_MS = 60_000; // 1 minute

/** Minimum interval between duplicate eventType+message (ms) */
const DEDUP_WINDOW_MS = 600_000; // 10 minutes

/** Payload utilization threshold (%) */
const PAYLOAD_THRESHOLD_PCT = 90;

/** Sync batch interval (ms) — flush unsynced events periodically */
const SYNC_INTERVAL_MS = 30_000; // 30 seconds

/** Payload threshold check interval (ms) */
const PAYLOAD_CHECK_INTERVAL_MS = 10_000; // 10 seconds

/**
 * Phase 3: Offline confirmation delay (ms).
 * Connectivity must remain offline for this duration before
 * the OFFLINE_DETECTED event is emitted. Prevents spurious
 * events from brief connectivity dips.
 */
const OFFLINE_CONFIRM_DELAY_MS = 30_000; // 30 seconds

/** Local storage key */
const LS_KEY = 'ecs_narrative_events';

// ══════════════════════════════════════════════════════════
// LOCAL PERSISTENCE
// ══════════════════════════════════════════════════════════

const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
  } catch {}
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  } catch {}
  memoryStore[key] = value;
}

function loadLocalEvents(): Record<string, NarrativeEvent[]> {
  const raw = lsGet(LS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function saveLocalEvents(data: Record<string, NarrativeEvent[]>): void {
  lsSet(LS_KEY, JSON.stringify(data));
}

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ══════════════════════════════════════════════════════════
// GPS COORDINATE CAPTURE (Phase 5)
// ══════════════════════════════════════════════════════════

/**
 * Capture current GPS coordinates from gpsUIState.
 *
 * Returns { latitude, longitude, elevationFt } if a GPS fix is
 * available, or { null, null, null } if no fix.
 *
 * This function is called at event creation time — it does NOT
 * block event creation if GPS is unavailable.
 *
 * Uses gpsUIState (throttled singleton) rather than the
 * useGPSLocation hook, since the narrative engine is not a
 * React component.
 */
function captureGPSCoordinates(): {
  latitude: number | null;
  longitude: number | null;
  elevationFt: number | null;
} {
  try {
    const gps = gpsUIState.get();

    if (gps.hasFix && gps.position) {
      return {
        latitude: gps.position.latitude,
        longitude: gps.position.longitude,
        elevationFt: gps.position.altitudeFt ?? null,
      };
    }
  } catch {
    // gpsUIState may not be initialized — silently return nulls
  }

  return {
    latitude: null,
    longitude: null,
    elevationFt: null,
  };
}

// ══════════════════════════════════════════════════════════
// ENGINE STATE
// ══════════════════════════════════════════════════════════

type Listener = () => void;

let _expeditionId: string | null = null;
let _isRunning = false;

// Event storage (keyed by expeditionId)
let _events: Record<string, NarrativeEvent[]> = loadLocalEvents();

// Listeners
const _listeners = new Set<Listener>();

// Dedup tracking
let _lastEventTimestamp = 0; // global rate limit
const _recentEvents = new Map<string, number>(); // "eventType|message" → timestamp

// State tracking for transition detection
let _lastRemotenessTier: RemotenessTier | null = null;
let _lastConnectivityOnline: boolean | null = null;
let _lastPayloadAboveThreshold = false;
let _lastReachedWaypointIndices: Set<number> = new Set();
let _routeStartedLogged = false;

// Phase 3: GVWR threshold tracking
let _lastPayloadOverGVWR = false;

// Phase 3: Offline debounce state
// When connectivity drops to offline, we start a 30-second timer.
// If still offline after 30s, we emit OFFLINE_DETECTED.
// If connectivity returns before 30s, the timer is cancelled.
// _offlineEventLogged prevents re-logging until connectivity
// returns online and later goes offline again.
let _offlineDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _offlineEventLogged = false;

// Subscription unsubs
let _unsubRemoteness: (() => void) | null = null;
let _unsubConnectivity: (() => void) | null = null;
let _unsubWaypointArrival: (() => void) | null = null;
let _payloadCheckTimer: ReturnType<typeof setInterval> | null = null;
let _syncTimer: ReturnType<typeof setInterval> | null = null;

// ══════════════════════════════════════════════════════════
// DEDUP / ANTI-SPAM
// ══════════════════════════════════════════════════════════

/**
 * Check if an event can be emitted (passes all anti-spam rules).
 */
function canEmit(eventType: NarrativeEventType, message: string): boolean {
  const now = Date.now();

  // Rule 1: Global rate limit — max 1 event per minute
  if (now - _lastEventTimestamp < GLOBAL_RATE_LIMIT_MS) {
    return false;
  }

  // Rule 2: Dedup — no duplicate eventType+message within 10 minutes
  const dedupKey = `${eventType}|${message}`;
  const lastSeen = _recentEvents.get(dedupKey);
  if (lastSeen != null && now - lastSeen < DEDUP_WINDOW_MS) {
    return false;
  }

  return true;
}

/**
 * Record that an event was emitted (for dedup tracking).
 */
function recordEmission(eventType: NarrativeEventType, message: string): void {
  const now = Date.now();
  _lastEventTimestamp = now;
  _recentEvents.set(`${eventType}|${message}`, now);

  // Prune old dedup entries (older than DEDUP_WINDOW_MS)
  for (const [key, ts] of _recentEvents) {
    if (now - ts > DEDUP_WINDOW_MS) {
      _recentEvents.delete(key);
    }
  }
}

// ══════════════════════════════════════════════════════════
// EVENT CREATION
// ══════════════════════════════════════════════════════════

/**
 * Attempt to log a narrative event. Returns true if emitted, false if suppressed.
 *
 * Phase 5: Now captures GPS coordinates from gpsUIState at creation time.
 * Coordinates are stored as hidden metadata on the event object.
 * If no GPS fix is available, coordinates are stored as null.
 * Event creation is NEVER blocked by missing GPS.
 *
 * Phase 6: Checks inactivity guard before emitting. If the guard
 * reports paused, the event is silently suppressed. The only
 * exception is TRACKING_RESUMED, which uses _bypassPauseCheck
 * to emit even during the resume transition.
 *
 * @param eventType — The type of narrative event
 * @param message — Human-readable message
 * @param meta — Additional metadata
 * @param highlight — Whether to highlight this event
 * @param _bypassPauseCheck — Internal: skip inactivity guard check
 *   (used only for TRACKING_RESUMED which fires during the
 *   pause→active transition before isPaused() returns false)
 */
function emitEvent(
  eventType: NarrativeEventType,
  message: string,
  meta: Record<string, any> = {},
  highlight?: boolean,
  _bypassPauseCheck?: boolean,
): boolean {
  if (!_expeditionId || !_isRunning) return false;

  // Phase 6: Inactivity guard — suppress automatic events while paused.
  // TRACKING_RESUMED bypasses this check because it IS the resume event.
  if (!_bypassPauseCheck && inactivityGuard.isPaused()) {
    return false;
  }

  // Anti-spam check
  if (!canEmit(eventType, message)) {
    return false;
  }

  const eventMeta = NARRATIVE_EVENT_META[eventType];

  // Phase 5: Capture GPS coordinates at event creation time
  const coords = captureGPSCoordinates();

  const event: NarrativeEvent = {
    id: generateId(),
    expeditionId: _expeditionId,
    timestamp: new Date().toISOString(),
    eventType,
    message,
    meta,
    highlight: highlight ?? eventMeta.highlightDefault,
    latitude: coords.latitude,
    longitude: coords.longitude,
    elevationFt: coords.elevationFt,
    _synced: false,
  };

  // Add to local store
  if (!_events[_expeditionId]) {
    _events[_expeditionId] = [];
  }
  _events[_expeditionId].unshift(event);

  // Persist locally
  saveLocalEvents(_events);

  // Record for dedup
  recordEmission(eventType, message);

  // Notify listeners
  _notify();

  // Phase 5: Log with coordinate info
  const coordStr = coords.latitude != null
    ? ` @ ${coords.latitude.toFixed(5)}, ${coords.longitude!.toFixed(5)}${coords.elevationFt != null ? ` (${Math.round(coords.elevationFt)}ft)` : ''}`
    : ' (no GPS fix)';
  console.log(`[Narrative] ${eventType}: ${message}${coordStr}`);
  return true;
}

function _notify(): void {
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ══════════════════════════════════════════════════════════
// PHASE 6: INACTIVITY GUARD RESUME HANDLER
// ══════════════════════════════════════════════════════════

/**
 * Called by the inactivity guard when the user returns from
 * an inactive period. Emits a single "Resumed tracking" event.
 *
 * This function bypasses the inactivity pause check because
 * it fires during the pause→active transition — the guard
 * has already set paused = false before calling this, but
 * we use _bypassPauseCheck for safety.
 *
 * @param pauseDurationMs — How long the app was paused (ms)
 */
function _onInactivityResume(pauseDurationMs: number): void {
  if (!_expeditionId || !_isRunning) return;

  const pauseMinutes = Math.round(pauseDurationMs / 60_000);
  const pauseDisplay = pauseMinutes >= 60
    ? `${Math.floor(pauseMinutes / 60)}h ${pauseMinutes % 60}m`
    : `${pauseMinutes}m`;

  emitEvent(
    'TRACKING_RESUMED',
    'Resumed tracking',
    {
      pauseDurationMs,
      pauseDurationDisplay: pauseDisplay,
      resumedAt: new Date().toISOString(),
    },
    false, // not highlighted by default (uses highlightDefault from meta)
    true,  // _bypassPauseCheck: this IS the resume event
  );
}

// ══════════════════════════════════════════════════════════
// STATE TRANSITION WATCHERS
// ══════════════════════════════════════════════════════════

// ──────────────────────────────────────────────────────────
// REMOTENESS TIER CHANGE (Phase 3)
//
// Fires when remotenessTier changes and remains stable.
//
// Stability is guaranteed UPSTREAM by remotenessStore's
// anti-flicker logic (Phase 3B of remotenessStore):
//   - Tier change requires sustained 30s hold OR crossing
//     by >= 8 pts (TIER_FORCE_DELTA).
//   - The store only replaces the cached output object when
//     values meaningfully change (identity stability).
//   - Subscribers are only notified on meaningful changes.
//
// Therefore the narrative engine does NOT need its own
// debounce/hold timer for remoteness — it simply reads
// the stable tier from the store on each notification.
//
// Message: "Entered {remotenessTier}"
// ──────────────────────────────────────────────────────────

/**
 * Watch remoteness tier changes.
 * Only fires on tier transitions (not continuous score updates).
 *
 * Phase 3: Relies on remotenessStore's anti-flicker logic for
 * tier stability. The store's 30s sustained hold / 8-pt force
 * delta ensures we only see stable tier transitions here.
 *
 * Phase 6: Suppressed while inactivity guard is paused.
 * State tracking (_lastRemotenessTier) is still updated so
 * we don't emit a stale transition on resume.
 */
function onRemotenessChange(): void {
  const output = remotenessStore.get();
  const newTier = output.tier;

  // Skip initial "Assessing environment" state
  if (_lastRemotenessTier === null) {
    _lastRemotenessTier = newTier;
    return;
  }

  // Only log on actual tier change
  if (newTier !== _lastRemotenessTier) {
    const prevTier = _lastRemotenessTier;
    _lastRemotenessTier = newTier;

    // Phase 6: emitEvent checks inactivityGuard.isPaused() internally.
    // If paused, the event is silently suppressed — no retroactive
    // events will be generated for tier changes during inactivity.
    emitEvent(
      'REMOTENESS_TIER_CHANGED',
      `Entered ${newTier}`,
      {
        previousTier: prevTier,
        newTier,
        score: output.score,
        rawScore: output.rawScore,
        reason: output.reason,
      },
    );
  }
}

// ──────────────────────────────────────────────────────────
// OFFLINE DETECTED (Phase 3)
//
// Fires when connectivity becomes offline and REMAINS offline
// for > 30 seconds (OFFLINE_CONFIRM_DELAY_MS).
//
// Flow:
//   1. Connectivity drops to offline/reconnecting:
//      - If _offlineEventLogged is true, skip (already logged
//        this offline session — waiting for online recovery).
//      - Start a 30-second debounce timer.
//
//   2. If connectivity returns to online before 30s:
//      - Cancel the debounce timer.
//      - Reset _offlineEventLogged so a future offline
//        transition can be logged.
//
//   3. If still offline after 30s:
//      - Emit OFFLINE_DETECTED: "Offline conditions detected"
//      - Set _offlineEventLogged = true to prevent re-logging
//        until connectivity returns online and later goes
//        offline again.
//
// This prevents:
//   - Spurious events from brief connectivity dips (< 30s)
//   - Repeated offline events during a single offline session
//
// Phase 6: Suppressed while inactivity guard is paused.
// ──────────────────────────────────────────────────────────

/**
 * Cancel any pending offline debounce timer.
 */
function _cancelOfflineDebounce(): void {
  if (_offlineDebounceTimer != null) {
    clearTimeout(_offlineDebounceTimer);
    _offlineDebounceTimer = null;
  }
}

/**
 * Callback fired after the 30-second offline confirmation delay.
 * Checks that we're still offline and the engine is still running,
 * then emits the OFFLINE_DETECTED event.
 *
 * Phase 6: emitEvent checks inactivityGuard.isPaused() internally.
 */
function _onOfflineConfirmed(): void {
  _offlineDebounceTimer = null;

  // Guard: engine must still be running and connectivity still offline
  if (!_isRunning || !_expeditionId) return;
  if (connectivity.isOnline()) return;

  // Guard: don't re-log if already logged this offline session
  if (_offlineEventLogged) return;

  _offlineEventLogged = true;

  emitEvent(
    'OFFLINE_DETECTED',
    'Offline conditions detected',
    {
      previousStatus: 'online',
      newStatus: connectivity.status,
      lastOnlineAt: connectivity.lastOnlineAt,
      confirmedAfterMs: OFFLINE_CONFIRM_DELAY_MS,
    },
  );
}

/**
 * Watch connectivity changes.
 *
 * Phase 3: Only fires OFFLINE_DETECTED after connectivity
 * remains offline for > 30 seconds. Does not log again until
 * connectivity returns online and later goes offline again.
 */
function onConnectivityChange(status: ConnectivityStatus): void {
  const isOnline = status === 'online';

  // Skip initial state — just record it
  if (_lastConnectivityOnline === null) {
    _lastConnectivityOnline = isOnline;
    return;
  }

  // ── Transition to ONLINE ──
  // Cancel any pending offline debounce and reset the logged flag
  // so the next offline transition can be logged.
  if (isOnline && !_lastConnectivityOnline) {
    _cancelOfflineDebounce();
    _offlineEventLogged = false;
    _lastConnectivityOnline = true;
    return;
  }

  // ── Transition to OFFLINE (or reconnecting) ──
  // Start the 30-second debounce timer if not already pending
  // and we haven't already logged an offline event this session.
  if (!isOnline && _lastConnectivityOnline) {
    _lastConnectivityOnline = false;

    // Don't start a new timer if we already logged this offline session
    if (_offlineEventLogged) return;

    // Don't start a new timer if one is already pending
    if (_offlineDebounceTimer != null) return;

    _offlineDebounceTimer = setTimeout(_onOfflineConfirmed, OFFLINE_CONFIRM_DELAY_MS);
    return;
  }

  // Update tracking for intermediate states (e.g., offline → reconnecting)
  _lastConnectivityOnline = isOnline;
}

// ══════════════════════════════════════════════════════════
// WAYPOINT ARRIVAL HANDLER (Phase 2)
//
// Triggered by waypointProgressStore.onArrival() — NOT by
// independent proximity polling. This ensures the narrative
// engine uses the same arrival logic as the ProgressWidget.
//
// Rules:
//   - Only logs on genuine arrival transitions (new arrivals)
//   - Does not log repeatedly if user hovers around radius
//     (waypointProgressStore only fires for new arrivals)
//   - Guard via _lastReachedWaypointIndices prevents duplicates
//     if the engine restarts mid-expedition
//   - If waypointType === 'camp', emits CAMP_ESTABLISHED
//     instead of WAYPOINT_REACHED
//
// Phase 6: Suppressed while inactivity guard is paused.
// State tracking (_lastReachedWaypointIndices) is still updated
// so we don't emit stale arrivals on resume.
// ══════════════════════════════════════════════════════════

/**
 * Handle a waypoint arrival event from waypointProgressStore.
 *
 * Looks up the waypoint from routeStore to determine name and type,
 * then emits the appropriate narrative event.
 */
function onWaypointArrival(event: WaypointArrivalEvent): void {
  if (!_expeditionId || !_isRunning) return;

  const { routeId, waypointIndex, isLast } = event;

  // Guard: skip if we've already logged this waypoint arrival
  // (handles engine restart mid-expedition)
  if (_lastReachedWaypointIndices.has(waypointIndex)) return;
  _lastReachedWaypointIndices.add(waypointIndex);

  // Look up the waypoint from the active route
  const activeRoute = routeStore.getActive();
  if (!activeRoute || activeRoute.id !== routeId) return;

  const wp = activeRoute.waypoints[waypointIndex];
  if (!wp) return;

  const wpName = wp.name || `Waypoint ${waypointIndex + 1}`;
  const isCamp = wp.waypointType === 'camp';

  if (isCamp) {
    // Camp waypoints get CAMP_ESTABLISHED (replaces WAYPOINT_REACHED)
    // Phase 6: emitEvent checks inactivityGuard.isPaused() internally.
    emitEvent(
      'CAMP_ESTABLISHED',
      `Camp established: ${wpName}`,
      {
        waypointIndex,
        waypointName: wpName,
        waypointType: 'camp',
        lat: wp.lat,
        lon: wp.lon,
        routeId,
        isLastWaypoint: isLast,
      },
      true, // always highlight camps
    );
  } else {
    // Standard waypoint arrival
    // Phase 6: emitEvent checks inactivityGuard.isPaused() internally.
    emitEvent(
      'WAYPOINT_REACHED',
      `Reached waypoint: ${wpName}`,
      {
        waypointIndex,
        waypointName: wpName,
        waypointType: wp.waypointType || 'waypoint',
        lat: wp.lat,
        lon: wp.lon,
        routeId,
        isLastWaypoint: isLast,
      },
    );
  }
}

// ──────────────────────────────────────────────────────────
// PAYLOAD THRESHOLD CROSSING (Phase 3)
//
// Two independent threshold checks, each with its own state
// tracking to detect crossing transitions:
//
// A) Zone utilization >= 90% (PAYLOAD_THRESHOLD_PCT):
//    - Reads from computeVehicleWeightSummary() in weightStore.
//    - Fires when overall utilization crosses from < 90% to >= 90%.
//    - Message: "Payload exceeded 90% capacity"
//    - Tracked by: _lastPayloadAboveThreshold
//
// B) GVWR exceeded (payload_margin_lb < 0):
//    - Reads from computeFullBuildWeightBreakdown() in weightEngine.
//    - Fires when payload_margin_lb crosses from >= 0 to < 0.
//    - Message: "Vehicle is over GVWR" (always highlighted)
//    - Tracked by: _lastPayloadOverGVWR
//
// Both checks run on the same timer (~10s interval).
// Dedup rules prevent repeats within 10 minutes.
//
// Phase 6: Suppressed while inactivity guard is paused.
// State tracking is still updated to prevent stale crossings.
// ──────────────────────────────────────────────────────────

/**
 * Check payload utilization and GVWR threshold crossings.
 * Called on a timer (~10s) to avoid per-render overhead.
 *
 * Phase 3: Now checks TWO thresholds:
 *   A) Zone utilization >= 90% → "Payload exceeded 90% capacity"
 *   B) payload_margin_lb < 0  → "Vehicle is over GVWR"
 *
 * Phase 6: emitEvent checks inactivityGuard.isPaused() internally.
 * State tracking (_lastPayloadAboveThreshold, _lastPayloadOverGVWR)
 * is still updated so we don't emit stale crossings on resume.
 */
function checkPayloadThreshold(): void {
  if (!_expeditionId) return;

  // ── Threshold A: Zone utilization (90%) ──
  try {
    const { computeVehicleWeightSummary } = require('./weightStore');
    const { vehicleStore: vs } = require('./vehicleStore');

    const vehicle = vs.getActive?.();
    if (vehicle) {
      const zones = vehicle.zones || [];
      const items = vehicle.items || [];

      if (zones.length > 0 && items.length > 0) {
        const summary = computeVehicleWeightSummary(zones, items);
        const overallUtilization = summary.totalCapacityLbs > 0
          ? (summary.totalLoadoutWeightLbs / summary.totalCapacityLbs) * 100
          : 0;

        const isAboveThreshold = overallUtilization >= PAYLOAD_THRESHOLD_PCT;

        // Only fire on threshold crossing (below → above)
        if (isAboveThreshold && !_lastPayloadAboveThreshold) {
          emitEvent(
            'PAYLOAD_THRESHOLD_CROSSED',
            `Payload exceeded ${PAYLOAD_THRESHOLD_PCT}% capacity`,
            {
              utilizationPct: Math.round(overallUtilization),
              totalWeightLbs: Math.round(summary.totalLoadoutWeightLbs),
              totalCapacityLbs: Math.round(summary.totalCapacityLbs),
              overweightZoneCount: summary.overweightZones.length,
              threshold: 'zone_utilization_90',
            },
          );
        }

        _lastPayloadAboveThreshold = isAboveThreshold;
      }
    }
  } catch {
    // Weight stores may not be available — silently skip
  }

  // ── Threshold B: GVWR exceeded (payload_margin_lb < 0) ──
  try {
    const { computeFullBuildWeightBreakdown } = require('./weightEngine');

    const breakdown = computeFullBuildWeightBreakdown();

    // Only check if vehicle specs are configured (has_specs = true)
    if (breakdown.has_specs) {
      const isOverGVWR = breakdown.payload_margin_lb < 0;

      // Only fire on threshold crossing (>= 0 → < 0)
      if (isOverGVWR && !_lastPayloadOverGVWR) {
        emitEvent(
          'PAYLOAD_THRESHOLD_CROSSED',
          'Vehicle is over GVWR',
          {
            payload_margin_lb: Math.round(breakdown.payload_margin_lb),
            build_weight_lb: Math.round(breakdown.build_weight_lb),
            gvwr_lb: Math.round(breakdown.gvwr_lb),
            base_weight_lb: Math.round(breakdown.base_weight_lb),
            hardware_additions_lb: Math.round(breakdown.hardware_additions_lb),
            consumables_weight_lb: Math.round(breakdown.consumables_weight_lb),
            items_weight_lb: Math.round(breakdown.items_weight_lb),
            threshold: 'gvwr_exceeded',
          },
          true, // always highlight GVWR exceedance
        );
      }

      _lastPayloadOverGVWR = isOverGVWR;
    }
  } catch {
    // Weight engine may not be available — silently skip
  }
}

/**
 * Log route started event (called once when engine starts with an active route).
 *
 * Phase 2: Human-readable fallback if route has no name.
 *   - With name:    "Started route: Desert Canyon Loop"
 *   - Without name: "Started route"
 */
function checkRouteStarted(): void {
  if (_routeStartedLogged) return;

  const activeRoute = routeStore.getActive();
  if (!activeRoute) return;

  _routeStartedLogged = true;

  // Phase 2: Fallback if no route name
  const routeName = activeRoute.name?.trim();
  const message = routeName
    ? `Started route: ${routeName}`
    : 'Started route';

  emitEvent(
    'ROUTE_STARTED',
    message,
    {
      routeId: activeRoute.id,
      routeName: routeName || null,
      distanceMiles: activeRoute.total_distance_miles,
      waypointCount: activeRoute.waypoint_count,
      elevationGainFt: activeRoute.elevation_gain_ft,
    },
    true, // always highlight route start
  );
}

// ══════════════════════════════════════════════════════════
// BACKGROUND SYNC
// ══════════════════════════════════════════════════════════

/**
 * Flush unsynced events to the server in a batch.
 *
 * Phase 5: Now includes latitude, longitude, elevation_ft
 * in the sync payload for each event.
 *
 * Phase 6: Sync continues even while paused — we still want
 * to flush any events that were created before the pause.
 */
async function syncUnsyncedEvents(): Promise<void> {
  if (!_expeditionId) return;
  if (!isDeployedEdgeFunction('expedition-events')) return;

  const events = _events[_expeditionId] || [];
  const unsynced = events.filter(e => !e._synced);

  if (unsynced.length === 0) return;

  try {
    const { data, error } = await supabase.functions.invoke('expedition-events', {
      body: {
        action: 'create_narrative_batch',
        events: unsynced.map(e => ({
          expedition_id: e.expeditionId,
          timestamp: e.timestamp,
          event_type: e.eventType,
          message: e.message,
          meta: e.meta,
          highlight: e.highlight,
          // Phase 5: Include coordinates in sync payload
          latitude: e.latitude,
          longitude: e.longitude,
          elevation_ft: e.elevationFt,
        })),
      },
    });

    if (error || !data?.events) {
      console.warn('[Narrative] Sync failed:', error?.message || 'No data returned');
      return;
    }

    // Mark as synced
    const syncedIds = new Set(unsynced.map(e => e.id));
    for (const event of events) {
      if (syncedIds.has(event.id)) {
        event._synced = true;
      }
    }

    saveLocalEvents(_events);
    console.log(`[Narrative] Synced ${unsynced.length} events`);
  } catch (err: any) {
    console.warn('[Narrative] Sync error:', err.message);
  }
}

// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const narrativeEngine = {
  /**
   * Start the narrative engine for an expedition.
   * Subscribes to all state sources and begins logging events.
   *
   * Phase 2: Subscribes to waypointProgressStore.onArrival()
   * for waypoint arrival events instead of polling GPS proximity.
   *
   * Phase 3: Initializes offline debounce and GVWR threshold state.
   *
   * Phase 6: Starts the inactivity guard with a resume callback.
   * The guard monitors AppState and GPS freshness, pausing
   * automatic event logging after 5 minutes of inactivity.
   *
   * @param expeditionId — The expedition to log events for
   */
  start(expeditionId: string): void {
    if (_isRunning && _expeditionId === expeditionId) return;

    // Stop any previous session
    if (_isRunning) {
      narrativeEngine.stop();
    }

    _expeditionId = expeditionId;
    _isRunning = true;

    // Reset transition tracking state
    _lastRemotenessTier = null;
    _lastConnectivityOnline = null;
    _lastPayloadAboveThreshold = false;
    _lastPayloadOverGVWR = false;
    _lastReachedWaypointIndices = new Set();
    _routeStartedLogged = false;
    _lastEventTimestamp = 0;
    _recentEvents.clear();

    // Phase 3: Reset offline debounce state
    _cancelOfflineDebounce();
    _offlineEventLogged = false;

    // Phase 6: Start inactivity guard with resume callback.
    // The guard will call _onInactivityResume when the user
    // returns from an inactive period (> 5 min).
    inactivityGuard.start(_onInactivityResume);

    // Initialize reached waypoints from waypointProgressStore
    // (prevents re-logging waypoints already reached before engine started)
    const activeRoute = routeStore.getActive();
    if (activeRoute) {
      const reached = waypointProgressStore.getReachedWaypoints(activeRoute.id);
      for (const idx of reached) {
        _lastReachedWaypointIndices.add(idx);
      }
    }

    // Initialize remoteness tier from current state
    const remoteness = remotenessStore.get();
    _lastRemotenessTier = remoteness.tier;

    // Initialize connectivity state
    _lastConnectivityOnline = connectivity.isOnline();

    // Phase 3: Initialize GVWR threshold state from current build weight
    try {
      const { computeFullBuildWeightBreakdown } = require('./weightEngine');
      const breakdown = computeFullBuildWeightBreakdown();
      if (breakdown.has_specs) {
        _lastPayloadOverGVWR = breakdown.payload_margin_lb < 0;
      }
    } catch {
      // Weight engine not available — start with false
    }

    // ── Subscribe to remoteness tier changes ──
    // Phase 3: remotenessStore's anti-flicker logic ensures
    // we only receive stable tier transitions.
    _unsubRemoteness = remotenessStore.subscribe(onRemotenessChange);

    // ── Subscribe to connectivity changes ──
    // Phase 3: onConnectivityChange now uses 30s debounce
    // before emitting OFFLINE_DETECTED.
    _unsubConnectivity = connectivity.onStatusChange(onConnectivityChange);

    // ── Subscribe to waypoint arrivals (Phase 2) ──
    // Uses waypointProgressStore.onArrival() instead of independent
    // GPS proximity polling. The ProgressWidget calls advance() when
    // distance <= ARRIVAL_THRESHOLD_MI, which triggers the notification.
    _unsubWaypointArrival = waypointProgressStore.onArrival(onWaypointArrival);

    // ── Check route started immediately ──
    checkRouteStarted();

    // ── Payload threshold check timer (every ~10s) ──
    // Phase 3: Now checks both zone utilization (90%) and GVWR.
    // Waypoint arrivals are event-driven via onArrival().
    _payloadCheckTimer = setInterval(() => {
      checkPayloadThreshold();
    }, PAYLOAD_CHECK_INTERVAL_MS);

    // ── Background sync timer (every 30s) ──
    _syncTimer = setInterval(() => {
      syncUnsyncedEvents();
    }, SYNC_INTERVAL_MS);

    console.log(`[Narrative] Engine v1.4 started for expedition: ${expeditionId}`);
  },

  /**
   * Stop the narrative engine. Unsubscribes from all sources.
   * Performs a final sync of any unsynced events.
   *
   * Phase 3: Also cancels any pending offline debounce timer.
   * Phase 6: Also stops the inactivity guard.
   */
  stop(): void {
    if (!_isRunning) return;
    _isRunning = false;

    // Phase 6: Stop inactivity guard
    inactivityGuard.stop();

    // Unsubscribe from remoteness
    if (_unsubRemoteness) {
      _unsubRemoteness();
      _unsubRemoteness = null;
    }

    // Unsubscribe from connectivity
    if (_unsubConnectivity) {
      _unsubConnectivity();
      _unsubConnectivity = null;
    }

    // Unsubscribe from waypoint arrivals (Phase 2)
    if (_unsubWaypointArrival) {
      _unsubWaypointArrival();
      _unsubWaypointArrival = null;
    }

    // Phase 3: Cancel any pending offline debounce timer
    _cancelOfflineDebounce();

    // Clear payload check timer
    if (_payloadCheckTimer) {
      clearInterval(_payloadCheckTimer);
      _payloadCheckTimer = null;
    }

    // Clear sync timer
    if (_syncTimer) {
      clearInterval(_syncTimer);
      _syncTimer = null;
    }

    // Final sync attempt
    syncUnsyncedEvents();

    console.log(`[Narrative] Engine v1.4 stopped for expedition: ${_expeditionId}`);
  },

  /**
   * Whether the engine is currently running.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Get the current expedition ID.
   */
  getExpeditionId(): string | null {
    return _expeditionId;
  },

  /**
   * Get all narrative events for an expedition (local).
   * Sorted by timestamp descending (newest first).
   */
  getEvents(expeditionId: string): NarrativeEvent[] {
    return _events[expeditionId] || [];
  },

  /**
   * Get highlighted events only.
   */
  getHighlights(expeditionId: string): NarrativeEvent[] {
    return (_events[expeditionId] || []).filter(e => e.highlight);
  },

  /**
   * Get events filtered by type.
   */
  getEventsByType(expeditionId: string, eventType: NarrativeEventType): NarrativeEvent[] {
    return (_events[expeditionId] || []).filter(e => e.eventType === eventType);
  },

  /**
   * Get total event count for an expedition.
   */
  getEventCount(expeditionId: string): number {
    return (_events[expeditionId] || []).length;
  },

  /**
   * Get events that have GPS coordinates (for map rendering / replay).
   * Returns only events where latitude and longitude are non-null.
   *
   * Phase 5: Enables future map overlay and replay visualization.
   */
  getGeotaggedEvents(expeditionId: string): NarrativeEvent[] {
    return (_events[expeditionId] || []).filter(
      e => e.latitude != null && e.longitude != null
    );
  },

  /**
   * Load events from the server (for viewing past expeditions).
   *
   * Phase 5: Now maps server latitude, longitude, elevation_ft
   * to local latitude, longitude, elevationFt fields.
   */
  async loadFromServer(expeditionId: string): Promise<NarrativeEvent[]> {
    if (!isDeployedEdgeFunction('expedition-events')) {
      return _events[expeditionId] || [];
    }
    try {
      const { data, error } = await supabase.functions.invoke('expedition-events', {
        body: {
          action: 'list_narrative',
          expedition_id: expeditionId,
          limit: 200,
        },
      });

      if (error || !data?.events) {
        console.warn('[Narrative] Load from server failed:', error?.message);
        return _events[expeditionId] || [];
      }

      // Map server events to local format
      // Phase 5: Include coordinate fields from server response
      const serverEvents: NarrativeEvent[] = data.events.map((e: any) => ({
        id: e.id,
        expeditionId: e.expedition_id,
        timestamp: e.timestamp,
        eventType: e.event_type,
        message: e.message,
        meta: e.meta || {},
        highlight: e.highlight || false,
        latitude: e.latitude ?? null,
        longitude: e.longitude ?? null,
        elevationFt: e.elevation_ft ?? null,
        _synced: true,
      }));

      // Merge with local unsynced events
      const localUnsynced = (_events[expeditionId] || []).filter(e => !e._synced);
      const serverIds = new Set(serverEvents.map(e => e.id));
      const uniqueLocal = localUnsynced.filter(e => !serverIds.has(e.id));

      _events[expeditionId] = [...uniqueLocal, ...serverEvents].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      saveLocalEvents(_events);
      _notify();

      return _events[expeditionId];
    } catch (err: any) {
      console.warn('[Narrative] Load error:', err.message);
      return _events[expeditionId] || [];
    }
  },

  /**
   * Manually emit a narrative event (for external triggers).
   * Subject to the same dedup/anti-spam rules.
   *
   * Phase 6: Also subject to inactivity guard pause check.
   * If the app is inactive, manual events are suppressed too.
   */
  emit(
    eventType: NarrativeEventType,
    message: string,
    meta?: Record<string, any>,
    highlight?: boolean,
  ): boolean {
    return emitEvent(eventType, message, meta || {}, highlight);
  },

  /**
   * Clear all events for an expedition (local only).
   */
  clearEvents(expeditionId: string): void {
    delete _events[expeditionId];
    saveLocalEvents(_events);
    _notify();
  },

  /**
   * Subscribe to narrative event changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: Listener): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  },

  /**
   * Force sync unsynced events now.
   */
  async syncNow(): Promise<void> {
    await syncUnsyncedEvents();
  },

  /**
   * Whether the narrative engine is currently paused due to
   * inactivity. UI components can use this to show a paused
   * indicator on the timeline.
   *
   * Phase 6: Delegates to inactivityGuard.isPaused().
   */
  isPaused(): boolean {
    return inactivityGuard.isPaused();
  },

  /**
   * Get inactivity guard diagnostic state.
   * Useful for debugging and status displays.
   *
   * Phase 6.
   */
  getInactivityState(): ReturnType<typeof inactivityGuard.getState> {
    return inactivityGuard.getState();
  },

  /**
   * Reset the engine completely (for testing/cleanup).
   *
   * Phase 3: Also resets offline debounce and GVWR state.
   * Phase 6: Also resets inactivity guard.
   */
  reset(): void {
    narrativeEngine.stop();
    _expeditionId = null;
    _lastRemotenessTier = null;
    _lastConnectivityOnline = null;
    _lastPayloadAboveThreshold = false;
    _lastPayloadOverGVWR = false;
    _lastReachedWaypointIndices = new Set();
    _routeStartedLogged = false;
    _lastEventTimestamp = 0;
    _recentEvents.clear();
    _cancelOfflineDebounce();
    _offlineEventLogged = false;
    inactivityGuard.reset();
  },
};

