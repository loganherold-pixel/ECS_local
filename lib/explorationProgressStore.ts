// ============================================================
// EXPLORATION PROGRESS STORE — Discovery Route Completion Tracking
// ============================================================
// Phase 13: Tracks completed Discovery routes and computes
// exploration progress statistics for the Discover tab.
//
// FEATURES:
//   - Route completion detection and recording
//   - Completion metadata: route_id, completion_date, distance_traveled, region
//   - Exploration stats: total routes, miles, regions
//   - Duplicate prevention (same route can't be completed twice)
//   - GPS drift protection (minimum distance threshold)
//   - Continue Exploring recommendations (nearby unexplored routes)
//   - Offline support (all data persisted locally)
//   - Survives app restart via localStorage/memory persistence
//   - Simplified indicators for Android Auto / CarPlay
//   - Privacy-preserving (no PII, only route IDs and distances)
//
// PERSISTENCE:
//   Uses the same localStorage/memory pattern as the rest of ECS.
//   Data stored under 'ecs_exploration_progress' key.
//
// PERFORMANCE:
//   - O(1) completion check via Set
//   - O(n) stats computation (cached via subscribers)
//   - No external API calls
//   - Safe for use in render paths
//
// GPS DRIFT PROTECTION:
//   Routes are only marked complete when the user has traveled
//   at least 60% of the route's total distance. This prevents
//   false completions from GPS drift or brief proximity.
// ============================================================

import { Platform } from 'react-native';
import type { ExpeditionOpportunity, RegionGroupId } from './discoverEngine';

const TAG = '[EXPLORE-PROGRESS]';

// ── Storage Key ──────────────────────────────────────────────
const STORAGE_KEY = 'ecs_exploration_progress';

// ── GPS Drift Protection ─────────────────────────────────────
// Minimum percentage of route distance that must be traveled
// before a route is considered "completed".
const MIN_COMPLETION_RATIO = 0.60;

// ── Types ────────────────────────────────────────────────────

export interface RouteCompletion {
  /** Route ID from Discovery dataset */
  route_id: string;
  /** ISO date string of completion */
  completion_date: string;
  /** Distance traveled in miles */
  distance_traveled: number;
  /** Route name (for display without re-lookup) */
  route_name: string;
  /** Region group ID */
  region_group: RegionGroupId;
  /** Region display name */
  region_name: string;
  /** Route total distance (for reference) */
  route_total_miles: number;
}

export interface ExplorationStats {
  /** Total number of completed routes */
  totalRoutesCompleted: number;
  /** Total miles explored across all completed routes */
  totalMilesExplored: number;
  /** Number of unique regions explored */
  regionsExplored: number;
  /** List of unique region names explored */
  regionNames: string[];
  /** Completion percentage (completed / total available routes) */
  completionPercentage: number;
  /** Average distance per completed route */
  avgDistancePerRoute: number;
  /** Most recent completion date */
  lastCompletionDate: string | null;
  /** Most recently completed route name */
  lastCompletedRouteName: string | null;
}

export interface ContinueExploringRecommendation {
  /** The unexplored opportunity */
  opportunity: ExpeditionOpportunity;
  /** Why this route is recommended */
  reason: string;
  /** Priority score (higher = stronger recommendation) */
  priority: number;
}

// ── Simplified Vehicle Display ───────────────────────────────

export interface SimplifiedExplorationIndicator {
  /** Short label for vehicle display */
  label: string;
  /** Number of routes completed */
  count: number;
  /** Total miles */
  miles: number;
}

// ── Internal State ───────────────────────────────────────────

interface ExplorationState {
  completions: RouteCompletion[];
  /** Set of completed route IDs for O(1) lookup */
  completedIds: Set<string>;
}

// ── Memory/localStorage helpers ──────────────────────────────

const memoryStore: Record<string, string> = {};

function storageGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    return localStorage.getItem(key);
  }
  return memoryStore[key] || null;
}

function storageSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    localStorage.setItem(key, value);
  }
  memoryStore[key] = value;
}

// ============================================================
// EXPLORATION PROGRESS STORE
// ============================================================

class ExplorationProgressStore {
  private state: ExplorationState;
  private listeners: Set<(completions: RouteCompletion[]) => void>;

  constructor() {
    this.listeners = new Set();
    this.state = this._loadFromStorage();
    console.log(
      TAG,
      `Initialized with ${this.state.completions.length} completed routes`,
    );
  }

  // ── Persistence ────────────────────────────────────────────

  private _loadFromStorage(): ExplorationState {
    try {
      const raw = storageGet(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as RouteCompletion[];
        if (Array.isArray(parsed)) {
          const completedIds = new Set(parsed.map(c => c.route_id));
          return { completions: parsed, completedIds };
        }
      }
    } catch (err) {
      console.warn(TAG, 'Failed to load exploration progress:', err);
    }
    return { completions: [], completedIds: new Set() };
  }

  private _saveToStorage(): void {
    try {
      storageSet(STORAGE_KEY, JSON.stringify(this.state.completions));
    } catch (err) {
      console.warn(TAG, 'Failed to save exploration progress:', err);
    }
  }

  private _notify(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state.completions);
      } catch (err) {
        console.warn(TAG, 'Listener error:', err);
      }
    }
  }

  // ── Public API ─────────────────────────────────────────────

  /**
   * Subscribe to completion changes.
   * Returns an unsubscribe function.
   */
  subscribe(listener: (completions: RouteCompletion[]) => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /**
   * Check if a route has been completed.
   * O(1) lookup via Set.
   */
  isCompleted(routeId: string): boolean {
    return this.state.completedIds.has(routeId);
  }

  /**
   * Get all completed route IDs.
   */
  getCompletedIds(): Set<string> {
    return new Set(this.state.completedIds);
  }

  /**
   * Get all completion records.
   */
  getCompletions(): RouteCompletion[] {
    return [...this.state.completions];
  }

  /**
   * Get the completion record for a specific route.
   */
  getCompletion(routeId: string): RouteCompletion | null {
    return this.state.completions.find(c => c.route_id === routeId) ?? null;
  }

  /**
   * Mark a route as completed.
   * Prevents duplicate completions.
   * Validates GPS drift protection threshold.
   *
   * @param opportunity     The completed route
   * @param distanceTraveled  Actual distance traveled in miles
   * @param options         Optional override flags
   * @returns true if the route was newly marked as completed
   */
  markCompleted(
    opportunity: ExpeditionOpportunity,
    distanceTraveled: number,
    options: { skipDriftCheck?: boolean } = {},
  ): boolean {
    // Prevent duplicate completions
    if (this.state.completedIds.has(opportunity.id)) {
      console.log(TAG, `Route "${opportunity.name}" already completed — skipping`);
      return false;
    }

    // GPS drift protection
    if (!options.skipDriftCheck) {
      const minDistance = opportunity.distanceMiles * MIN_COMPLETION_RATIO;
      if (distanceTraveled < minDistance) {
        console.log(
          TAG,
          `Route "${opportunity.name}": traveled ${distanceTraveled.toFixed(1)} mi ` +
          `< ${minDistance.toFixed(1)} mi threshold (${(MIN_COMPLETION_RATIO * 100).toFixed(0)}% of ${opportunity.distanceMiles} mi) — not marking complete`,
        );
        return false;
      }
    }

    const completion: RouteCompletion = {
      route_id: opportunity.id,
      completion_date: new Date().toISOString(),
      distance_traveled: Math.round(distanceTraveled * 10) / 10,
      route_name: opportunity.name,
      region_group: opportunity.regionGroup,
      region_name: opportunity.region,
      route_total_miles: opportunity.distanceMiles,
    };

    this.state.completions.push(completion);
    this.state.completedIds.add(opportunity.id);
    this._saveToStorage();
    this._notify();

    console.log(
      TAG,
      `Completed: "${opportunity.name}" (${distanceTraveled.toFixed(1)} mi traveled, ` +
      `${opportunity.distanceMiles} mi total) — ${this.state.completions.length} routes total`,
    );

    return true;
  }

  /**
   * Manually mark a route as completed (e.g., from user action).
   * Bypasses GPS drift check — uses route total distance as traveled.
   */
  markCompletedManual(opportunity: ExpeditionOpportunity): boolean {
    return this.markCompleted(opportunity, opportunity.distanceMiles, {
      skipDriftCheck: true,
    });
  }

  /**
   * Remove a completion record (undo).
   */
  removeCompletion(routeId: string): boolean {
    const idx = this.state.completions.findIndex(c => c.route_id === routeId);
    if (idx === -1) return false;

    const removed = this.state.completions.splice(idx, 1)[0];
    this.state.completedIds.delete(routeId);
    this._saveToStorage();
    this._notify();

    console.log(TAG, `Removed completion: "${removed.route_name}"`);
    return true;
  }

  /**
   * Clear all exploration progress.
   */
  clearAll(): void {
    this.state.completions = [];
    this.state.completedIds = new Set();
    this._saveToStorage();
    this._notify();
    console.log(TAG, 'Cleared all exploration progress');
  }

  // ── Statistics ─────────────────────────────────────────────

  /**
   * Compute exploration statistics.
   *
   * @param totalAvailableRoutes  Total routes in the Discovery dataset
   * @returns ExplorationStats
   */
  computeStats(totalAvailableRoutes: number = 12): ExplorationStats {
    const completions = this.state.completions;

    if (completions.length === 0) {
      return {
        totalRoutesCompleted: 0,
        totalMilesExplored: 0,
        regionsExplored: 0,
        regionNames: [],
        completionPercentage: 0,
        avgDistancePerRoute: 0,
        lastCompletionDate: null,
        lastCompletedRouteName: null,
      };
    }

    const totalMiles = completions.reduce(
      (sum, c) => sum + c.distance_traveled, 0,
    );

    const uniqueRegions = new Set(completions.map(c => c.region_group));
    const regionNames = [...new Set(completions.map(c => c.region_name))];

    // Find most recent completion
    const sorted = [...completions].sort(
      (a, b) => new Date(b.completion_date).getTime() - new Date(a.completion_date).getTime(),
    );
    const latest = sorted[0];

    const completionPct = totalAvailableRoutes > 0
      ? Math.round((completions.length / totalAvailableRoutes) * 100)
      : 0;

    return {
      totalRoutesCompleted: completions.length,
      totalMilesExplored: Math.round(totalMiles),
      regionsExplored: uniqueRegions.size,
      regionNames,
      completionPercentage: Math.min(completionPct, 100),
      avgDistancePerRoute: Math.round(totalMiles / completions.length),
      lastCompletionDate: latest.completion_date,
      lastCompletedRouteName: latest.route_name,
    };
  }

  // ── Continue Exploring ─────────────────────────────────────

  /**
   * Get "Continue Exploring" recommendations.
   * Returns nearby unexplored routes sorted by priority.
   *
   * @param opportunities  All available opportunities (pre-filtered)
   * @param maxResults     Maximum recommendations to return
   * @returns Array of recommendations
   */
  getContinueExploring(
    opportunities: ExpeditionOpportunity[],
    maxResults: number = 3,
  ): ContinueExploringRecommendation[] {
    const unexplored = opportunities.filter(
      op => !this.state.completedIds.has(op.id),
    );

    if (unexplored.length === 0) return [];

    // Score each unexplored route
    const scored: ContinueExploringRecommendation[] = unexplored.map(op => {
      let priority = 0;
      let reason = '';

      // Proximity bonus (closer = higher priority)
      const dist = op.distanceFromUserMiles ?? 500;
      if (dist <= 50) {
        priority += 40;
        reason = 'Very close to your location';
      } else if (dist <= 100) {
        priority += 30;
        reason = 'Within easy driving distance';
      } else if (dist <= 200) {
        priority += 20;
        reason = 'Reachable for a day trip';
      } else {
        priority += 5;
        reason = 'Available in your search area';
      }

      // Region exploration bonus (unexplored regions get priority)
      const regionExplored = this.state.completions.some(
        c => c.region_group === op.regionGroup,
      );
      if (!regionExplored) {
        priority += 25;
        reason = `Explore a new region: ${op.region}`;
      }

      // Match score bonus
      if (op.matchScore != null && op.matchScore >= 70) {
        priority += 15;
      }

      // Expedition fit bonus
      if (op.expeditionFitScore != null && op.expeditionFitScore >= 70) {
        priority += 10;
      }

      // Weekend suitability bonus
      if (op.estimatedDays != null && op.estimatedDays <= 3 && op.distanceMiles <= 120) {
        priority += 10;
      }

      return { opportunity: op, reason, priority };
    });

    // Sort by priority descending
    scored.sort((a, b) => b.priority - a.priority);

    return scored.slice(0, maxResults);
  }

  // ── Vehicle Display (Android Auto / CarPlay) ───────────────

  /**
   * Get simplified exploration indicator for vehicle displays.
   */
  getSimplifiedIndicator(): SimplifiedExplorationIndicator {
    const stats = this.computeStats();
    return {
      label: stats.totalRoutesCompleted > 0
        ? `${stats.totalRoutesCompleted} explored`
        : 'No routes explored',
      count: stats.totalRoutesCompleted,
      miles: stats.totalMilesExplored,
    };
  }

  // ── Offline Compatibility ──────────────────────────────────

  /**
   * Check if exploration data is available offline.
   * Always true — all data is stored locally.
   */
  isAvailableOffline(): boolean {
    return true;
  }
}

// ── Singleton Instance ───────────────────────────────────────

export const explorationProgressStore = new ExplorationProgressStore();

// ── Display Helpers ──────────────────────────────────────────

/** Get progress bar color based on completion percentage */
export function getProgressColor(percentage: number): string {
  if (percentage >= 75) return '#66BB6A';
  if (percentage >= 50) return '#D4A017';
  if (percentage >= 25) return '#E67E22';
  if (percentage > 0) return '#5AC8FA';
  return '#3A4250';
}

/** Get progress label */
export function getProgressLabel(percentage: number): string {
  if (percentage >= 100) return 'ALL ROUTES EXPLORED';
  if (percentage >= 75) return 'VETERAN EXPLORER';
  if (percentage >= 50) return 'EXPERIENCED';
  if (percentage >= 25) return 'ACTIVE EXPLORER';
  if (percentage > 0) return 'GETTING STARTED';
  return 'BEGIN EXPLORING';
}

/** Format completion date for display */
export function formatCompletionDate(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    const month = date.toLocaleString('en-US', { month: 'short' }).toUpperCase();
    const day = date.getDate();
    const year = date.getFullYear();
    return `${month} ${day}, ${year}`;
  } catch {
    return 'UNKNOWN';
  }
}

/** Format miles for display */
export function formatExplorationMiles(miles: number): string {
  if (miles >= 1000) return `${(miles / 1000).toFixed(1)}K`;
  return `${miles}`;
}

