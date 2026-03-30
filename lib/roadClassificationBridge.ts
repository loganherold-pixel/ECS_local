/**
 * Road Classification Bridge
 *
 * Connects Mapbox map road layer data (from the MapRenderer WebView)
 * to the dashboardModeEngine for context-aware dashboard switching.
 *
 * Architecture:
 *   MapRenderer WebView
 *     → queryRenderedFeatures() at user GPS position
 *     → extracts road `class` from Mapbox Streets v8 source layer
 *     → postMessage({ type: 'roadClassification', ... })
 *     → React Native handleMessage
 *     → roadClassificationBridge.feed()
 *     → dashboardModeEngine.feedRoadClassification()
 *
 * Mapbox Streets v8 road `class` values:
 *   motorway, motorway_link  → 'motorway'
 *   trunk, trunk_link        → 'primary'
 *   primary, primary_link    → 'primary'
 *   secondary, secondary_link → 'secondary'
 *   tertiary, tertiary_link  → 'tertiary'
 *   street, street_limited   → 'tertiary'
 *   service                  → 'service'
 *   track                    → 'track'
 *   path                     → 'trail'
 *   (no features found)      → 'unknown'
 *
 * Features:
 *   - Maps Mapbox road classes to ECS RoadClassification enum
 *   - Debounces rapid updates (min 3s between feeds)
 *   - Confidence tracking: requires 2 consecutive same-class readings
 *   - Priority ranking: picks highest-class road when multiple overlap
 *   - Subscribe/get pattern for reactive UI
 *   - Debug logging for road classification changes
 */

import {
  dashboardModeEngine,
  type RoadClassification,
} from './dashboardModeEngine';

// ── Types ───────────────────────────────────────────────────

/** Raw road data received from the MapRenderer WebView */
export interface MapboxRoadData {
  /** Mapbox Streets v8 road `class` property */
  roadClass: string;
  /** Optional: road `type` property (e.g., 'motorway', 'trunk') */
  roadType?: string;
  /** Optional: road name */
  roadName?: string;
  /** Optional: road surface type */
  surface?: string;
  /** Whether any road features were found at the query point */
  hasRoad: boolean;
  /** Number of road features found */
  featureCount: number;
  /** Timestamp of the query */
  timestamp: number;
}

export interface RoadClassificationState {
  /** Current mapped classification */
  classification: RoadClassification;
  /** Raw Mapbox road class string */
  rawClass: string;
  /** Road name (if available) */
  roadName: string | null;
  /** Whether we're currently on a road */
  onRoad: boolean;
  /** Confidence level (0-3): how many consecutive readings agree */
  confidence: number;
  /** Last update timestamp */
  lastUpdate: number;
  /** Whether the bridge is actively receiving data */
  active: boolean;
}

// ── Constants ───────────────────────────────────────────────

/** Minimum interval between feeding the mode engine (debounce) */
const FEED_DEBOUNCE_MS = 3_000;

/** How many consecutive same-class readings needed for high confidence */
const HIGH_CONFIDENCE_THRESHOLD = 2;

/**
 * Road class priority ranking (higher = more prominent road).
 * When multiple road features overlap at a point, we pick the highest priority.
 */
const ROAD_CLASS_PRIORITY: Record<string, number> = {
  motorway: 100,
  motorway_link: 95,
  trunk: 90,
  trunk_link: 85,
  primary: 80,
  primary_link: 75,
  secondary: 70,
  secondary_link: 65,
  tertiary: 60,
  tertiary_link: 55,
  street: 50,
  street_limited: 45,
  service: 40,
  pedestrian: 30,
  track: 20,
  path: 10,
};

/**
 * Mapping from Mapbox Streets v8 road `class` to ECS RoadClassification.
 */
const MAPBOX_TO_ECS: Record<string, RoadClassification> = {
  motorway: 'motorway',
  motorway_link: 'motorway',
  trunk: 'primary',
  trunk_link: 'primary',
  primary: 'primary',
  primary_link: 'primary',
  secondary: 'secondary',
  secondary_link: 'secondary',
  tertiary: 'tertiary',
  tertiary_link: 'tertiary',
  street: 'tertiary',
  street_limited: 'tertiary',
  service: 'service',
  pedestrian: 'service',
  track: 'track',
  path: 'trail',
};

// ── Internal State ──────────────────────────────────────────

let _currentClassification: RoadClassification = 'unknown';
let _rawClass = '';
let _roadName: string | null = null;
let _onRoad = false;
let _confidence = 0;
let _lastUpdate = 0;
let _lastFeedTime = 0;
let _active = false;

// Consecutive reading tracker for confidence
let _previousClassification: RoadClassification = 'unknown';
let _consecutiveCount = 0;

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();
let _cachedState: RoadClassificationState | null = null;

function _notify(): void {
  _cachedState = null;
  for (const fn of _listeners) {
    try { fn(); } catch {}
  }
}

// ── Classification Logic ────────────────────────────────────

/**
 * Pick the highest-priority road class from an array of Mapbox road classes.
 */
function _pickHighestPriority(classes: string[]): string {
  if (classes.length === 0) return '';
  let best = classes[0];
  let bestPriority = ROAD_CLASS_PRIORITY[best] ?? 0;
  for (let i = 1; i < classes.length; i++) {
    const p = ROAD_CLASS_PRIORITY[classes[i]] ?? 0;
    if (p > bestPriority) {
      best = classes[i];
      bestPriority = p;
    }
  }
  return best;
}

/**
 * Map a Mapbox road class string to an ECS RoadClassification.
 */
function _mapToECS(mapboxClass: string): RoadClassification {
  if (!mapboxClass) return 'unknown';
  const normalized = mapboxClass.toLowerCase().trim();
  return MAPBOX_TO_ECS[normalized] ?? 'unclassified';
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

export const roadClassificationBridge = {
  /**
   * Feed raw road data from the MapRenderer WebView.
   * Called when the WebView sends a 'roadClassification' message.
   *
   * This method:
   *   1. Picks the highest-priority road class
   *   2. Maps it to an ECS RoadClassification
   *   3. Tracks confidence (consecutive same readings)
   *   4. Debounces feeding the dashboardModeEngine
   */
  feed(data: MapboxRoadData): void {
    _active = true;
    _lastUpdate = data.timestamp || Date.now();

    if (!data.hasRoad || !data.roadClass) {
      // No road found at GPS position — likely off-road
      _rawClass = '';
      _roadName = null;
      _onRoad = false;

      const newClassification: RoadClassification = 'unknown';

      // Track confidence
      if (newClassification === _previousClassification) {
        _consecutiveCount++;
      } else {
        _consecutiveCount = 1;
        _previousClassification = newClassification;
      }
      _confidence = Math.min(_consecutiveCount, 3);

      // Only feed the engine if we have sufficient confidence and debounce has elapsed
      const now = Date.now();
      if (_consecutiveCount >= HIGH_CONFIDENCE_THRESHOLD && (now - _lastFeedTime >= FEED_DEBOUNCE_MS)) {
        _currentClassification = newClassification;
        _lastFeedTime = now;
        dashboardModeEngine.feedRoadClassification(newClassification);
        console.log('[RoadBridge] Fed: unknown (off-road)');
      }

      _notify();
      return;
    }

    // Road found — map to ECS classification
    _rawClass = data.roadClass;
    _roadName = data.roadName || null;
    _onRoad = true;

    const ecsClass = _mapToECS(data.roadClass);

    // Track confidence
    if (ecsClass === _previousClassification) {
      _consecutiveCount++;
    } else {
      _consecutiveCount = 1;
      _previousClassification = ecsClass;
    }
    _confidence = Math.min(_consecutiveCount, 3);

    // Debounce + confidence gate before feeding the engine
    const now = Date.now();
    if (_consecutiveCount >= HIGH_CONFIDENCE_THRESHOLD && (now - _lastFeedTime >= FEED_DEBOUNCE_MS)) {
      const changed = ecsClass !== _currentClassification;
      _currentClassification = ecsClass;
      _lastFeedTime = now;
      dashboardModeEngine.feedRoadClassification(ecsClass);

      if (changed) {
        console.log(
          `[RoadBridge] Classification changed → ${ecsClass}` +
          (data.roadName ? ` (${data.roadName})` : '') +
          ` [raw: ${data.roadClass}, confidence: ${_confidence}]`
        );
      }
    }

    _notify();
  },

  /**
   * Feed multiple road classes from overlapping features.
   * Picks the highest-priority class and feeds it.
   */
  feedMultiple(classes: string[], roadName?: string): void {
    const bestClass = _pickHighestPriority(classes);
    this.feed({
      roadClass: bestClass,
      roadName: roadName || undefined,
      hasRoad: classes.length > 0,
      featureCount: classes.length,
      timestamp: Date.now(),
    });
  },

  /**
   * Get current road classification state.
   */
  get(): RoadClassificationState {
    if (_cachedState) return _cachedState;
    _cachedState = {
      classification: _currentClassification,
      rawClass: _rawClass,
      roadName: _roadName,
      onRoad: _onRoad,
      confidence: _confidence,
      lastUpdate: _lastUpdate,
      active: _active,
    };
    return _cachedState;
  },

  /**
   * Get the current ECS road classification.
   */
  getClassification(): RoadClassification {
    return _currentClassification;
  },

  /**
   * Whether the user is currently on a detected road.
   */
  isOnRoad(): boolean {
    return _onRoad;
  },

  /**
   * Reset all state.
   */
  reset(): void {
    _currentClassification = 'unknown';
    _rawClass = '';
    _roadName = null;
    _onRoad = false;
    _confidence = 0;
    _lastUpdate = 0;
    _lastFeedTime = 0;
    _active = false;
    _previousClassification = 'unknown';
    _consecutiveCount = 0;
    _cachedState = null;
    _notify();
  },

  /**
   * Subscribe to state changes.
   */
  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

