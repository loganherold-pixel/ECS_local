/**
 * ECS Collaborative Expedition Intelligence — Phase 12
 * ======================================================
 *
 * Allows ECS users to share anonymized expedition insights such as
 * hazards, trail conditions, and campsite locations.
 *
 * FEATURES:
 *   1. Submit observations (anonymized, no personal data)
 *   2. Retrieve nearby observations within a configurable radius
 *   3. Route corridor observation queries
 *   4. Offline queue for pending uploads
 *   5. Local cache for offline access
 *   6. Confidence-based filtering
 *   7. Integration with AdaptiveExpeditionGuidance
 *
 * ACTIVATION:
 *   - Active during ExpeditionDrive or active expedition
 *   - Fetches nearby observations every 5 minutes
 *   - Uploads pending observations when connectivity returns
 *
 * PRIVACY:
 *   - No user names, vehicle details, or account identifiers stored
 *   - Only observation data needed for expedition safety
 *
 * ARCHITECTURE:
 *   - Singleton store with subscribe/get pattern
 *   - Timer-driven fetch (5 min)
 *   - Offline queue with retry
 *   - Local cache for offline access
 *   - Does NOT modify the mobile dashboard
 *   - Does NOT replace existing pin/waypoint systems
 */

import { Platform } from 'react-native';
import { isDeployedEdgeFunction, isEdgeFunctionUnavailableError } from './supabase';

import type {
  CollaborativeObservation,
  CollaborativeObservationType,
  CollaborativeIntelOutput,
  NearbyObservationSummary,
  PendingObservation,
  ObservationSeverity,
} from './collaborativeIntelTypes';

import {
  DEFAULT_SEARCH_RADIUS_KM,
  MAX_MAP_MARKERS,
  MAX_LIST_ITEMS,
  MIN_MAP_CONFIDENCE,
  CACHE_DURATION_MS,
  FETCH_INTERVAL_MS,
  OFFLINE_QUEUE_KEY,
  CACHE_STORAGE_KEY,
} from './collaborativeIntelTypes';

const TAG = '[COLLAB_INTEL]';
const EDGE_WARNING_COOLDOWN_MS = 5 * 60 * 1000;
const edgeWarningCache = new Map<string, number>();

function warnEdgeIssue(signature: string, message: string, detail?: Record<string, unknown>) {
  const now = Date.now();
  const last = edgeWarningCache.get(signature) ?? 0;
  if (now - last < EDGE_WARNING_COOLDOWN_MS) return;
  edgeWarningCache.set(signature, now);
  console.warn(TAG, message, detail ?? {});
}

function classifyCollaborativeError(error: unknown): {
  kind: 'unavailable' | 'request' | 'server';
  message: string;
} {
  if (isEdgeFunctionUnavailableError(error)) {
    return {
      kind: 'unavailable',
      message: 'Collaborative expedition intelligence is not deployed in the current ECS backend',
    };
  }

  if (error instanceof Error) {
    return {
      kind: 'request',
      message: error.message || 'Collaborative expedition intelligence request failed',
    };
  }

  if (typeof error === 'object' && error) {
    const maybeError = error as { message?: string; status?: number; context?: { status?: number } };
    return {
      kind: (maybeError.context?.status ?? maybeError.status ?? 0) >= 500 ? 'server' : 'request',
      message: maybeError.message || 'Collaborative expedition intelligence request failed',
    };
  }

  return {
    kind: 'request',
    message: String(error || 'Collaborative expedition intelligence request failed'),
  };
}

// ── Storage Helpers ─────────────────────────────────────────

const _mem: Record<string, string> = {};

function sGet(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return _mem[key] || null;
  } catch { return _mem[key] || null; }
}

function sSet(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    _mem[key] = value;
  } catch { _mem[key] = value; }
}

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ── Haversine Distance ──────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

function haversineKm(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Offline Queue ───────────────────────────────────────────

function loadPendingQueue(): PendingObservation[] {
  try {
    const raw = sGet(OFFLINE_QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function savePendingQueue(queue: PendingObservation[]): void {
  sSet(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

// ── Cache ───────────────────────────────────────────────────

interface CacheEntry {
  observations: CollaborativeObservation[];
  fetchedAt: number;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

function loadCache(): CacheEntry | null {
  try {
    const raw = sGet(CACHE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.fetchedAt) return null;
    // Check expiry
    if (Date.now() - parsed.fetchedAt > CACHE_DURATION_MS * 3) return null; // 30 min hard expiry
    return parsed;
  } catch { return null; }
}

function saveCache(entry: CacheEntry): void {
  sSet(CACHE_STORAGE_KEY, JSON.stringify(entry));
}

// ── Summary Computation ─────────────────────────────────────

function computeSummary(
  observations: CollaborativeObservation[],
  radiusKm: number,
): NearbyObservationSummary {
  const hazardCount = observations.filter(o => o.observation_type === 'hazard').length;
  const trailDifficultyCount = observations.filter(o => o.observation_type === 'trail_difficulty').length;
  const waterCrossingCount = observations.filter(o => o.observation_type === 'water_crossing').length;
  const campsiteCount = observations.filter(o => o.observation_type === 'campsite').length;
  const fuelCount = observations.filter(o => o.observation_type === 'fuel_availability').length;
  const blockedRouteCount = observations.filter(o => o.observation_type === 'blocked_route').length;

  // Top observations: closest + highest confidence
  const top = [...observations]
    .sort((a, b) => {
      // Priority: confidence desc, then distance asc
      const confDiff = (b.confidence_level || 1) - (a.confidence_level || 1);
      if (confDiff !== 0) return confDiff;
      return (a.distance_km || 999) - (b.distance_km || 999);
    })
    .slice(0, 5);

  return {
    totalCount: observations.length,
    hazardCount,
    trailDifficultyCount,
    waterCrossingCount,
    campsiteCount,
    fuelCount,
    blockedRouteCount,
    topObservations: top,
    radiusKm,
  };
}

// ── Default Output ──────────────────────────────────────────

function createDefaultOutput(): CollaborativeIntelOutput {
  return {
    isActive: false,
    lastFetchedAt: null,
    isOnline: false,
    isCached: false,
    nearbyObservations: [],
    summary: {
      totalCount: 0,
      hazardCount: 0,
      trailDifficultyCount: 0,
      waterCrossingCount: 0,
      campsiteCount: 0,
      fuelCount: 0,
      blockedRouteCount: 0,
      topObservations: [],
      radiusKm: DEFAULT_SEARCH_RADIUS_KM,
    },
    pendingUploads: [],
    pendingCount: 0,
    routeObservations: [],
    isFetching: false,
    lastError: null,
  };
}

// ══════════════════════════════════════════════════════════════
// CORE FETCH LOGIC
// ══════════════════════════════════════════════════════════════

async function _fetchNearbyObservations(
  lat: number, lng: number, radiusKm: number,
): Promise<CollaborativeObservation[]> {
  if (!isDeployedEdgeFunction('collaborative-intel')) {
    warnEdgeIssue('collaborative-intel:missing', 'Collaborative expedition intelligence is gated because the Edge Function is not deployed');
    return [];
  }

  try {
    const { supabase } = require('./supabase');
    const { data, error } = await supabase.functions.invoke('collaborative-intel', {
      body: { action: 'nearby', lat, lng, radiusKm },
    });

    if (error) {
      const classified = classifyCollaborativeError(error);
      warnEdgeIssue(`collaborative-intel:nearby:${classified.kind}:${classified.message}`, 'Nearby collaborative intel fetch failed', classified);
      return [];
    }

    if (data?.success && Array.isArray(data.observations)) {
      return data.observations;
    }

    return [];
  } catch (err) {
    const classified = classifyCollaborativeError(err);
    warnEdgeIssue(`collaborative-intel:nearby:exception:${classified.message}`, 'Nearby collaborative intel exception', classified);
    return [];
  }
}

async function _fetchRouteObservations(
  waypoints: Array<{ lat: number; lng: number }>,
  radiusKm: number,
): Promise<CollaborativeObservation[]> {
  if (!isDeployedEdgeFunction('collaborative-intel')) {
    return [];
  }

  try {
    const { supabase } = require('./supabase');
    const { data, error } = await supabase.functions.invoke('collaborative-intel', {
      body: { action: 'route', waypoints, radiusKm },
    });

    if (error) {
      const classified = classifyCollaborativeError(error);
      warnEdgeIssue(`collaborative-intel:route:${classified.kind}:${classified.message}`, 'Route collaborative intel fetch failed', classified);
      return [];
    }

    if (data?.success && Array.isArray(data.observations)) {
      return data.observations;
    }

    return [];
  } catch (err) {
    const classified = classifyCollaborativeError(err);
    warnEdgeIssue(`collaborative-intel:route:exception:${classified.message}`, 'Route collaborative intel exception', classified);
    return [];
  }
}

async function _submitObservation(obs: PendingObservation): Promise<boolean> {
  if (!isDeployedEdgeFunction('collaborative-intel')) {
    warnEdgeIssue('collaborative-intel:submit:missing', 'Collaborative expedition upload is gated because the Edge Function is not deployed');
    return false;
  }

  try {
    const { supabase } = require('./supabase');
    const { data, error } = await supabase.functions.invoke('collaborative-intel', {
      body: {
        action: 'submit',
        observation: {
          latitude: obs.latitude,
          longitude: obs.longitude,
          observation_type: obs.observation_type,
          description: obs.description,
          severity: obs.severity,
          altitude_ft: obs.altitude_ft,
        },
      },
    });

    if (error) {
      const classified = classifyCollaborativeError(error);
      warnEdgeIssue(`collaborative-intel:submit:${classified.kind}:${classified.message}`, 'Collaborative observation submit failed', classified);
      return false;
    }

    return data?.success === true;
  } catch (err) {
    const classified = classifyCollaborativeError(err);
    warnEdgeIssue(`collaborative-intel:submit:exception:${classified.message}`, 'Collaborative observation submit exception', classified);
    return false;
  }
}

async function _confirmObservation(observationId: string): Promise<boolean> {
  if (!isDeployedEdgeFunction('collaborative-intel')) {
    return false;
  }

  try {
    const { supabase } = require('./supabase');
    const { data, error } = await supabase.functions.invoke('collaborative-intel', {
      body: { action: 'confirm', observationId },
    });

    if (error) {
      const classified = classifyCollaborativeError(error);
      warnEdgeIssue(`collaborative-intel:confirm:${classified.kind}:${classified.message}`, 'Collaborative observation confirm failed', classified);
      return false;
    }
    return data?.success === true;
  } catch (err) {
    const classified = classifyCollaborativeError(err);
    warnEdgeIssue(`collaborative-intel:confirm:exception:${classified.message}`, 'Collaborative observation confirm exception', classified);
    return false;
  }
}

// ══════════════════════════════════════════════════════════════
// CORE EVALUATION
// ══════════════════════════════════════════════════════════════

async function _evaluate(): Promise<void> {
  try {
    // ── Check if we should be active ──
    let isExpeditionDrive = false;
    try {
      const { vehicleDisplayStore } = require('./vehicleDisplayStore');
      isExpeditionDrive = vehicleDisplayStore.getMode() === 'expedition_drive';
    } catch {}

    let hasActiveExpedition = false;
    try {
      const { missionExpeditionStore } = require('./missionStore');
      const activeExp = missionExpeditionStore.getActive();
      hasActiveExpedition = activeExp != null && activeExp.status === 'active';
    } catch {}

    const shouldBeActive = isExpeditionDrive || hasActiveExpedition;

    if (!shouldBeActive) {
      if (_cachedOutput?.isActive) {
        _cachedOutput = { ...createDefaultOutput(), isActive: false };
        _notify();
      }
      return;
    }

    // ── Check connectivity ──
    let isOnline = false;
    try {
      const { connectivity } = require('./connectivity');
      isOnline = connectivity.isOnline();
    } catch {}

    // ── Get GPS position ──
    let currentLat: number | null = null;
    let currentLng: number | null = null;
    let currentAltFt: number | null = null;

    try {
      const { gpsUIState } = require('./gpsUIState');
      const gps = gpsUIState.get();
      if (gps.hasFix && gps.position) {
        currentLat = gps.position.latitude;
        currentLng = gps.position.longitude;
        currentAltFt = gps.position.altitudeFt ?? null;
      }
    } catch {}

    if (currentLat == null || currentLng == null) {
      // No GPS — use cache if available
      const cache = loadCache();
      if (cache) {
        const output: CollaborativeIntelOutput = {
          isActive: true,
          lastFetchedAt: new Date(cache.fetchedAt).toISOString(),
          isOnline,
          isCached: true,
          nearbyObservations: cache.observations,
          summary: computeSummary(cache.observations, cache.radiusKm),
          pendingUploads: loadPendingQueue(),
          pendingCount: loadPendingQueue().length,
          routeObservations: [],
          isFetching: false,
          lastError: null,
        };
        _cachedOutput = output;
        _notify();
      }
      return;
    }

    // ── Process offline queue first ──
    if (isOnline) {
      await _processOfflineQueue();
    }

    // ── Fetch nearby observations ──
    let observations: CollaborativeObservation[] = [];
    let isCached = false;
    let lastError: string | null = null;

    if (isOnline) {
      // Check if we need to refetch (cache still valid?)
      const cache = loadCache();
      const cacheValid = cache &&
        (Date.now() - cache.fetchedAt) < CACHE_DURATION_MS &&
        haversineKm(currentLat, currentLng, cache.centerLat, cache.centerLng) < 2;

      if (cacheValid) {
        observations = cache!.observations;
        isCached = true;
      } else {
        _setFetching(true);
        observations = await _fetchNearbyObservations(
          currentLat, currentLng, DEFAULT_SEARCH_RADIUS_KM,
        );
        _setFetching(false);

        if (observations.length > 0 || !cache) {
          // Save to cache
          saveCache({
            observations,
            fetchedAt: Date.now(),
            centerLat: currentLat,
            centerLng: currentLng,
            radiusKm: DEFAULT_SEARCH_RADIUS_KM,
          });
        } else if (cache) {
          // Fetch returned empty but we have cache — use cache
          observations = cache.observations;
          isCached = true;
        }
      }
    } else {
      // Offline — use cache
      const cache = loadCache();
      if (cache) {
        observations = cache.observations;
        isCached = true;
      }
    }

    // ── Add distance from current position ──
    observations = observations.map(obs => ({
      ...obs,
      distance_km: haversineKm(currentLat!, currentLng!, obs.latitude, obs.longitude),
    }));

    // ── Filter by confidence ──
    const filtered = observations
      .filter(obs => obs.confidence_level >= MIN_MAP_CONFIDENCE)
      .sort((a, b) => (a.distance_km || 999) - (b.distance_km || 999))
      .slice(0, MAX_LIST_ITEMS);

    // ── Get route-relevant observations ──
    let routeObservations: CollaborativeObservation[] = [];
    try {
      const { routeStore } = require('./routeStore');
      const activeRoute = routeStore.getActive();
      if (activeRoute?.waypoints && activeRoute.waypoints.length > 0) {
        // Filter observations near route waypoints
        routeObservations = filtered.filter(obs => {
          for (const wp of activeRoute.waypoints) {
            const dist = haversineKm(obs.latitude, obs.longitude, wp.lat, wp.lng);
            if (dist < 10) return true;
          }
          return false;
        });
      }
    } catch {}

    // ── Build output ──
    const pendingQueue = loadPendingQueue();
    const summary = computeSummary(filtered, DEFAULT_SEARCH_RADIUS_KM);

    const output: CollaborativeIntelOutput = {
      isActive: true,
      lastFetchedAt: new Date().toISOString(),
      isOnline,
      isCached,
      nearbyObservations: filtered,
      summary,
      pendingUploads: pendingQueue,
      pendingCount: pendingQueue.length,
      routeObservations,
      isFetching: false,
      lastError,
    };

    // ── Check for meaningful change ──
    if (_cachedOutput && !_hasChanged(_cachedOutput, output)) {
      return;
    }

    _cachedOutput = output;
    _notify();

  } catch (err) {
    console.warn(TAG, 'Evaluation error:', err);
  }
}

function _hasChanged(
  prev: CollaborativeIntelOutput,
  next: CollaborativeIntelOutput,
): boolean {
  if (prev.isActive !== next.isActive) return true;
  if (prev.isOnline !== next.isOnline) return true;
  if (prev.isCached !== next.isCached) return true;
  if (prev.summary.totalCount !== next.summary.totalCount) return true;
  if (prev.pendingCount !== next.pendingCount) return true;
  if (prev.isFetching !== next.isFetching) return true;
  if (prev.nearbyObservations.length !== next.nearbyObservations.length) return true;
  if (prev.routeObservations.length !== next.routeObservations.length) return true;
  // Check if top observations changed
  const prevTopIds = prev.summary.topObservations.map(o => o.id).join(',');
  const nextTopIds = next.summary.topObservations.map(o => o.id).join(',');
  if (prevTopIds !== nextTopIds) return true;
  return false;
}

function _setFetching(fetching: boolean): void {
  if (_cachedOutput) {
    _cachedOutput = { ..._cachedOutput, isFetching: fetching };
    _notify();
  }
}

// ── Offline Queue Processing ────────────────────────────────

async function _processOfflineQueue(): Promise<void> {
  const queue = loadPendingQueue();
  if (queue.length === 0) return;

  console.log(TAG, `Processing ${queue.length} pending observations`);

  const remaining: PendingObservation[] = [];

  for (const pending of queue) {
    if (pending.attempts >= 3) {
      // Too many attempts, drop it
      console.warn(TAG, `Dropping observation after ${pending.attempts} attempts`);
      continue;
    }

    const success = await _submitObservation(pending);
    if (!success) {
      remaining.push({ ...pending, attempts: pending.attempts + 1 });
    } else {
      console.log(TAG, `Uploaded pending observation: ${pending.observation_type}`);
    }
  }

  savePendingQueue(remaining);
}

// ══════════════════════════════════════════════════════════════
// INTERNAL STATE
// ══════════════════════════════════════════════════════════════

let _cachedOutput: CollaborativeIntelOutput | null = null;
let _fetchTimer: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;

type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify(): void {
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const collaborativeExpeditionIntelligence = {
  /**
   * Get current collaborative intelligence output.
   */
  get(): CollaborativeIntelOutput {
    if (_cachedOutput) return _cachedOutput;
    return createDefaultOutput();
  },

  /**
   * Start the collaborative intelligence engine.
   * Begins periodic fetching (every 5 minutes).
   */
  start(): void {
    if (_isRunning) return;
    _isRunning = true;

    console.log(TAG, 'Starting Collaborative Expedition Intelligence');

    // Delay first fetch to let other systems initialize
    setTimeout(() => {
      if (_isRunning) {
        _evaluate();
        _fetchTimer = setInterval(_evaluate, FETCH_INTERVAL_MS);
      }
    }, 8000);
  },

  /**
   * Stop the collaborative intelligence engine.
   */
  stop(): void {
    if (!_isRunning) return;
    _isRunning = false;

    if (_fetchTimer) {
      clearInterval(_fetchTimer);
      _fetchTimer = null;
    }

    console.log(TAG, 'Stopped Collaborative Expedition Intelligence');
  },

  /**
   * Whether the engine is actively running.
   */
  isRunning(): boolean {
    return _isRunning;
  },

  /**
   * Force an immediate fetch/evaluation.
   */
  async forceRefresh(): Promise<void> {
    // Clear cache to force a fresh fetch
    sSet(CACHE_STORAGE_KEY, '');
    await _evaluate();
  },

  /**
   * Submit a new observation.
   * If offline, queues for later upload.
   */
  async submitObservation(data: {
    latitude: number;
    longitude: number;
    observation_type: CollaborativeObservationType;
    description: string;
    severity?: ObservationSeverity | null;
    altitude_ft?: number | null;
  }): Promise<{ success: boolean; queued: boolean }> {
    // Check connectivity
    let isOnline = false;
    try {
      const { connectivity } = require('./connectivity');
      isOnline = connectivity.isOnline();
    } catch {}

    const pending: PendingObservation = {
      localId: generateId(),
      latitude: data.latitude,
      longitude: data.longitude,
      observation_type: data.observation_type,
      description: data.description,
      severity: data.severity ?? null,
      altitude_ft: data.altitude_ft ?? null,
      queuedAt: new Date().toISOString(),
      attempts: 0,
    };

    if (isOnline) {
      const success = await _submitObservation(pending);
      if (success) {
        console.log(TAG, `Submitted observation: ${data.observation_type}`);
        // Refresh to include new observation
        setTimeout(() => _evaluate(), 2000);
        return { success: true, queued: false };
      }
    }

    // Queue for later
    const queue = loadPendingQueue();
    queue.push(pending);
    savePendingQueue(queue);

    // Update output
    if (_cachedOutput) {
      _cachedOutput = {
        ..._cachedOutput,
        pendingUploads: queue,
        pendingCount: queue.length,
      };
      _notify();
    }

    console.log(TAG, `Queued observation: ${data.observation_type} (offline)`);
    return { success: false, queued: true };
  },

  /**
   * Confirm/upvote an existing observation.
   */
  async confirmObservation(observationId: string): Promise<boolean> {
    const success = await _confirmObservation(observationId);
    if (success) {
      // Refresh to get updated confidence
      setTimeout(() => _evaluate(), 2000);
    }
    return success;
  },

  /**
   * Get observations relevant to the current route.
   */
  getRouteObservations(): CollaborativeObservation[] {
    return collaborativeExpeditionIntelligence.get().routeObservations;
  },

  /**
   * Get nearby observations of a specific type.
   */
  getByType(type: CollaborativeObservationType): CollaborativeObservation[] {
    return collaborativeExpeditionIntelligence.get().nearbyObservations
      .filter(o => o.observation_type === type);
  },

  /**
   * Get observations suitable for map display.
   * Filtered by confidence and limited to MAX_MAP_MARKERS.
   */
  getMapMarkers(): CollaborativeObservation[] {
    const obs = collaborativeExpeditionIntelligence.get().nearbyObservations;
    return obs
      .filter(o => o.confidence_level >= MIN_MAP_CONFIDENCE)
      .slice(0, MAX_MAP_MARKERS);
  },

  /**
   * Get the count of pending uploads.
   */
  getPendingCount(): number {
    return loadPendingQueue().length;
  },

  /**
   * Get observations that should generate guidance alerts.
   * Returns hazards, blocked routes, and high-severity items near the route.
   */
  getGuidanceRelevant(): CollaborativeObservation[] {
    const output = collaborativeExpeditionIntelligence.get();
    const all = [...output.routeObservations, ...output.nearbyObservations];

    // Deduplicate
    const seen = new Set<string>();
    const unique: CollaborativeObservation[] = [];
    for (const obs of all) {
      if (!seen.has(obs.id)) {
        seen.add(obs.id);
        unique.push(obs);
      }
    }

    // Filter for guidance-relevant types
    return unique.filter(obs => {
      // Always include hazards and blocked routes
      if (obs.observation_type === 'hazard' || obs.observation_type === 'blocked_route') {
        return obs.confidence_level >= 2 && (obs.distance_km || 999) < 15;
      }
      // Include water crossings and trail difficulty if close
      if (obs.observation_type === 'water_crossing' || obs.observation_type === 'trail_difficulty') {
        return obs.confidence_level >= 2 && (obs.distance_km || 999) < 10;
      }
      // Include campsites and fuel if close
      if (obs.observation_type === 'campsite' || obs.observation_type === 'fuel_availability') {
        return obs.confidence_level >= 1 && (obs.distance_km || 999) < 10;
      }
      return false;
    }).slice(0, 5);
  },

  /**
   * Get a compact status line for vehicle display.
   */
  getCompactStatus(): string {
    const output = collaborativeExpeditionIntelligence.get();
    if (!output.isActive) return 'Community intel standby';
    if (output.isFetching) return 'Fetching community intel...';
    if (output.summary.totalCount === 0) return 'No community reports nearby';

    const parts: string[] = [];
    if (output.summary.hazardCount > 0) parts.push(`${output.summary.hazardCount} hazard${output.summary.hazardCount > 1 ? 's' : ''}`);
    if (output.summary.campsiteCount > 0) parts.push(`${output.summary.campsiteCount} camp${output.summary.campsiteCount > 1 ? 's' : ''}`);
    if (output.summary.fuelCount > 0) parts.push(`${output.summary.fuelCount} fuel`);
    if (output.summary.blockedRouteCount > 0) parts.push(`${output.summary.blockedRouteCount} blocked`);

    if (parts.length === 0) {
      return `${output.summary.totalCount} community reports nearby`;
    }

    return parts.join(', ') + ' nearby';
  },

  /**
   * Reset all state.
   */
  reset(): void {
    collaborativeExpeditionIntelligence.stop();
    _cachedOutput = null;
    sSet(CACHE_STORAGE_KEY, '');
    _notify();
    console.log(TAG, 'Collaborative intelligence state reset');
  },

  /**
   * Subscribe to intelligence changes.
   * Returns unsubscribe function.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

