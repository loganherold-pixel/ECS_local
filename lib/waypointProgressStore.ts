/**
 * Waypoint Progress Store
 *
 * Tracks the user's progress through route waypoints.
 * Persists activeRouteWaypointIndex per route ID so progress
 * survives re-renders, tab switches, and app restarts.
 *
 * Phase 4.1: Next Waypoint Advancement
 *
 * Arrival logic:
 *   - Distance to current target waypoint <= 0.15 miles (800 ft)
 *   - Marks waypoint as reached, advances index by 1
 *   - Clamps at last waypoint
 *
 * Phase 2 Narrative Integration:
 *   - Arrival notification system via onArrival() subscriptions
 *   - When advance() marks a waypoint as reached, all arrival
 *     listeners are notified with { routeId, waypointIndex, isLast }
 *   - Used by narrativeEngine to emit WAYPOINT_REACHED /
 *     CAMP_ESTABLISHED events without independent proximity polling
 *
 * Storage: localStorage (web) / in-memory (native)
 */
import { Platform } from 'react-native';

// ── Storage helpers ─────────────────────────────────────
const memoryStore: Record<string, string> = {};

function lsGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return memoryStore[key] || null;
}

function lsSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
  memoryStore[key] = value;
}

// ── Types ───────────────────────────────────────────────
interface RouteProgress {
  /** Current target waypoint index (0-based) */
  waypointIndex: number;
  /** List of waypoint indices that have been reached */
  reachedWaypoints: number[];
  /** Route ID this progress belongs to */
  routeId: string;
  /** Timestamp of last advancement */
  lastAdvancedAt: string | null;
}

// ── Arrival notification types ──────────────────────────
export interface WaypointArrivalEvent {
  /** Route ID the waypoint belongs to */
  routeId: string;
  /** Index of the waypoint that was just reached */
  waypointIndex: number;
  /** Whether this is the last waypoint in the route */
  isLast: boolean;
}

type ArrivalListener = (event: WaypointArrivalEvent) => void;

// ── Storage key ─────────────────────────────────────────
const LS_KEY = 'ecs_waypoint_progress';

function getAllProgress(): Record<string, RouteProgress> {
  const raw = lsGet(LS_KEY);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function saveAllProgress(data: Record<string, RouteProgress>): void {
  lsSet(LS_KEY, JSON.stringify(data));
}

// ── Arrival threshold ───────────────────────────────────
/** Distance in miles at which a waypoint is considered "reached" */
export const ARRIVAL_THRESHOLD_MI = 0.15; // ~800 ft

// ── Arrival listeners ───────────────────────────────────
const _arrivalListeners = new Set<ArrivalListener>();

function _notifyArrival(event: WaypointArrivalEvent): void {
  for (const fn of _arrivalListeners) {
    try { fn(event); } catch {}
  }
}

// ── Store ───────────────────────────────────────────────
export const waypointProgressStore = {
  /**
   * Get the current waypoint index for a route.
   * Returns 0 if no progress exists for this route.
   */
  getIndex(routeId: string): number {
    const all = getAllProgress();
    return all[routeId]?.waypointIndex ?? 0;
  },

  /**
   * Get full progress record for a route.
   */
  getProgress(routeId: string): RouteProgress | null {
    const all = getAllProgress();
    return all[routeId] || null;
  },

  /**
   * Get list of reached waypoint indices for a route.
   */
  getReachedWaypoints(routeId: string): number[] {
    const all = getAllProgress();
    return all[routeId]?.reachedWaypoints ?? [];
  },

  /**
   * Set the waypoint index for a route.
   */
  setIndex(routeId: string, index: number): void {
    const all = getAllProgress();
    if (!all[routeId]) {
      all[routeId] = {
        waypointIndex: index,
        reachedWaypoints: [],
        routeId,
        lastAdvancedAt: null,
      };
    } else {
      all[routeId].waypointIndex = index;
    }
    saveAllProgress(all);
  },

  /**
   * Advance to the next waypoint. Returns the new index.
   * Marks the current waypoint as reached.
   * Clamps at maxIndex (last waypoint).
   *
   * Phase 2 Narrative: Notifies all arrival listeners when a
   * waypoint is marked as reached (arrival transition).
   */
  advance(routeId: string, maxIndex: number): number {
    const all = getAllProgress();
    if (!all[routeId]) {
      all[routeId] = {
        waypointIndex: 0,
        reachedWaypoints: [],
        routeId,
        lastAdvancedAt: null,
      };
    }

    const progress = all[routeId];
    const currentIdx = progress.waypointIndex;

    // Track whether this is a new arrival (not already reached)
    const isNewArrival = !progress.reachedWaypoints.includes(currentIdx);

    // Mark current as reached (if not already)
    if (isNewArrival) {
      progress.reachedWaypoints.push(currentIdx);
    }

    // Advance (clamp at last waypoint)
    const newIdx = Math.min(currentIdx + 1, maxIndex);
    progress.waypointIndex = newIdx;
    progress.lastAdvancedAt = new Date().toISOString();

    saveAllProgress(all);

    // ── Notify arrival listeners (Phase 2 Narrative) ──
    // Only notify on genuine new arrivals (not re-reaching already-reached waypoints)
    if (isNewArrival) {
      const isLast = currentIdx >= maxIndex;
      _notifyArrival({
        routeId,
        waypointIndex: currentIdx,
        isLast,
      });
    }

    return newIdx;
  },

  /**
   * Reset progress for a route (e.g., when route changes or user resets).
   */
  reset(routeId: string): void {
    const all = getAllProgress();
    delete all[routeId];
    saveAllProgress(all);
  },

  /**
   * Reset all route progress.
   */
  resetAll(): void {
    saveAllProgress({});
  },

  /**
   * Check if the current waypoint has been completed
   * (i.e., the last waypoint has been reached and there's nowhere to advance).
   */
  isRouteComplete(routeId: string, totalWaypoints: number): boolean {
    const all = getAllProgress();
    const progress = all[routeId];
    if (!progress) return false;
    return progress.waypointIndex >= totalWaypoints - 1 &&
           progress.reachedWaypoints.includes(totalWaypoints - 1);
  },

  // ═══════════════════════════════════════════════════════
  // ARRIVAL NOTIFICATION SYSTEM (Phase 2 Narrative)
  // ═══════════════════════════════════════════════════════

  /**
   * Subscribe to waypoint arrival events.
   *
   * Called whenever advance() marks a waypoint as newly reached.
   * The callback receives { routeId, waypointIndex, isLast }.
   *
   * Returns an unsubscribe function.
   *
   * Used by narrativeEngine to emit WAYPOINT_REACHED /
   * CAMP_ESTABLISHED events without independent proximity polling.
   */
  onArrival(listener: ArrivalListener): () => void {
    _arrivalListeners.add(listener);
    return () => { _arrivalListeners.delete(listener); };
  },
};

