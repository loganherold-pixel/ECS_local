/**
 * ECS Remoteness Store v3.0 — Full Remoteness Index Engine Integration
 *
 * CHANGES FROM v2.4 (Phase 10: Remoteness Index Engine):
 *   - Integrated computeFullRemoteness() from remotenessEngine.ts
 *   - New getIndex() method returns full RemotenessIndexOutput
 *   - Forward Remoteness Forecast available via getIndex().forecast
 *   - Infrastructure proximity estimates via getIndex().proximity
 *   - Intelligence advisories via getIndex().advisories
 *   - Factor breakdown via getIndex().factors
 *   - Connectivity assessment via getIndex().connectivity
 *   - Terrain context via getIndex().terrain
 *   - Existing get() API preserved for backward compatibility
 *
 * SIGNALS:
 *   A) Elevation Complexity — from route segments + GPS position
 *   B) Connectivity — from Connectivity Intelligence (Phase 3D freshness-aware)
 *   C) Speed Nuance — from gpsUIState (rolling avg < 8 mph)
 *   D) Service Distance — estimated from heuristics (NEW)
 *   E) Infrastructure Distance — estimated from heuristics (NEW)
 *   F) Population Density — estimated from heuristics (NEW)
 *   G) Route Isolation — from terrain + connectivity (NEW)
 *
 * TIER THRESHOLDS:
 *   0–15:   NEAR CIVILIZATION
 *   16–35:  BACKCOUNTRY
 *   36–60:  REMOTE
 *   61–80:  DEEP REMOTE
 *   81–100: EXTREME
 *
 * RUN CONDITIONS:
 *   - Only active when started (expedition IN_PROGRESS)
 *   - Recompute raw score every ~12 seconds on timer
 *   - Smoothing: smoothed = prev*0.85 + raw*0.15
 *   - Tier change requires sustained 30s OR crossing by >= 8 pts
 */

import type { TerrainComplexityTier, ElevationComplexityResult } from './elevationComplexity';
import { TERRAIN_COMPLEXITY_SCORES, analyzeElevationComplexity } from './elevationComplexity';
import { gpsUIState } from './gpsUIState';
import { routeStore } from './routeStore';
import { connectivity } from './connectivity';
import type { RemotenessIndexOutput } from './remotenessTypes';
import { computeFullRemoteness, scoreToLevel } from './remotenessEngine';
import type { ECSConfidenceResult } from './ai/confidenceTypes';
import type { ECSPriorityResult } from './ai/priorityTypes';
import { createPriorityResult } from './ai/priorityEngine';


// ── Tier definitions ────────────────────────────────────
export type RemotenessTier =
  | 'NEAR CIVILIZATION'
  | 'BACKCOUNTRY'
  | 'REMOTE'
  | 'DEEP REMOTE'
  | 'EXTREME';

export interface RemotenessOutput {
  score: number;            // smoothed 0–100
  rawScore: number;         // unsmoothed 0–100
  tier: RemotenessTier;
  reason: string;           // single supporting line
  tierColor: string;
  confidence: ECSConfidenceResult;
  priority: ECSPriorityResult;
  /** Individual signal contributions for detail modal */
  signals: {
    elevationScore: number;
    connectivityScore: number;
    speedScore: number;
    connectivityState: ConnectivityState;
    sustainedSpeedMph: number | null;
    /** Phase 3C: Whether offline cache is ready for the current area */
    cacheReady: boolean;
    /** Phase 3D: Current data freshness state */
    freshness: string;
    /** Phase 6A: Whether offline expedition data is cached for the current area */
    expeditionDataReady: boolean;
  };
}

// ── Connectivity state ──────────────────────────────────
// Phase 3B: Added 'degraded' state for connected-but-no-internet
export type ConnectivityState = 'online' | 'offline' | 'degraded' | 'unknown';

// ── Phase 3C/6A: Cache-aware connectivity resolution result ──
interface CacheAwareConnectivity {
  state: ConnectivityState;
  cacheReady: boolean;
  cachedRegionAvailable: boolean;
  cachedRouteAvailable: boolean;
  /** Phase 3D: Current freshness from CI */
  freshness: string;
  /** Phase 6A: Whether offline expedition data is cached for the current area */
  expeditionDataReady: boolean;
}

// ── Input signals (kept for backward compat / manual overrides) ──
export interface RemotenessFeedInput {
  terrainComplexity: TerrainComplexityTier | null;
  hasActiveRoute: boolean;
  connectivityState: ConnectivityState;
  speedMph: number | null;
}


// ── Tier thresholds ─────────────────────────────────────
const TIER_THRESHOLDS: { max: number; tier: RemotenessTier; color: string }[] = [
  { max: 15,  tier: 'NEAR CIVILIZATION', color: '#4CAF50' },
  { max: 35,  tier: 'BACKCOUNTRY',       color: '#C48A2C' },
  { max: 60,  tier: 'REMOTE',            color: '#E67E22' },
  { max: 80,  tier: 'DEEP REMOTE',       color: '#EF5350' },
  { max: 100, tier: 'EXTREME',           color: '#C0392B' },
];

function scoreToTier(score: number): { tier: RemotenessTier; color: string } {
  const clamped = Math.max(0, Math.min(100, score));
  for (const t of TIER_THRESHOLDS) {
    if (clamped <= t.max) return { tier: t.tier, color: t.color };
  }
  return { tier: 'EXTREME', color: '#C0392B' };
}

function tierLowerBound(tier: RemotenessTier): number {
  switch (tier) {
    case 'NEAR CIVILIZATION': return 0;
    case 'BACKCOUNTRY':       return 16;
    case 'REMOTE':            return 36;
    case 'DEEP REMOTE':       return 61;
    case 'EXTREME':           return 81;
  }
}

function tierUpperBound(tier: RemotenessTier): number {
  switch (tier) {
    case 'NEAR CIVILIZATION': return 15;
    case 'BACKCOUNTRY':       return 35;
    case 'REMOTE':            return 60;
    case 'DEEP REMOTE':       return 80;
    case 'EXTREME':           return 100;
  }
}


// ── Connectivity scoring constants ──────────────────────
const CONNECTIVITY_SCORES: Record<ConnectivityState, number> = {
  offline:  15,
  degraded: 12,
  unknown:   6,
  online:    0,
};

// ── Phase 3C: Cache-aware scoring adjustments ───────────
const CACHE_ADJUSTMENTS = {
  offline_cached: -5,
  offline_uncached: 3,
  degraded_cached: -3,
  degraded_uncached: 2,
} as const;

// ── Speed nuance constants ──────────────────────────────
const SPEED_SUSTAINED_THRESHOLD_MPH = 8;
const SPEED_SUSTAINED_SCORE = 6;
const SPEED_ROLLING_WINDOW_MS = 60_000;

// ── Speed rolling average state ─────────────────────────
interface SpeedSample {
  speedMph: number;
  timestamp: number;
}
let _speedSamples: SpeedSample[] = [];
let _sustainedSpeedMph: number | null = null;

function recordSpeedSample(speedMph: number | null): void {
  const now = Date.now();
  if (speedMph != null && speedMph >= 0) {
    _speedSamples.push({ speedMph, timestamp: now });
  }
  const cutoff = now - SPEED_ROLLING_WINDOW_MS;
  _speedSamples = _speedSamples.filter(s => s.timestamp >= cutoff);
  if (_speedSamples.length === 0) {
    _sustainedSpeedMph = null;
  } else {
    const sum = _speedSamples.reduce((acc, s) => acc + s.speedMph, 0);
    _sustainedSpeedMph = sum / _speedSamples.length;
  }
}

function computeSpeedScore(): number {
  if (_sustainedSpeedMph == null) return 0;
  return _sustainedSpeedMph < SPEED_SUSTAINED_THRESHOLD_MPH ? SPEED_SUSTAINED_SCORE : 0;
}


// ── Smoothing constants ─────────────────────────────────
const SMOOTH_PREV = 0.85;
const SMOOTH_NEW = 0.15;

// ── Anti-flicker constants ──────────────────────────────
const TIER_HOLD_MS = 30_000;
const TIER_FORCE_DELTA = 8;

// ── Recomputation interval ──────────────────────────────
const RECOMPUTE_INTERVAL_MS = 12_000;

const UNKNOWN_CONFIDENCE: ECSConfidenceResult = {
  level: 'unknown',
  score: 0,
  label: 'Confidence unavailable',
  shortReason: 'Awaiting stronger signal',
  reasons: ['awaiting_signal'],
  sourceSummary: {
    live: 0,
    manual: 0,
    inferred: 0,
    stale: 0,
    missing: 0,
  },
};

const UNKNOWN_PRIORITY: ECSPriorityResult = createPriorityResult({
  level: 'informational',
  domain: 'remoteness',
  title: 'Remoteness assessing',
  shortReason: 'Awaiting stronger signal',
  reasons: ['missing_signal'],
  sourceKey: 'remoteness',
});


// ══════════════════════════════════════════════════════════
// SEGMENT MEMOIZATION CACHE
// ══════════════════════════════════════════════════════════
let _cachedRouteId: string | null = null;
let _cachedElevResult: ElevationComplexityResult | null = null;
let _cachedElevGpsLat: number | null = null;
let _cachedElevGpsLon: number | null = null;

function _clearSegmentCache(): void {
  _cachedRouteId = null;
  _cachedElevResult = null;
  _cachedElevGpsLat = null;
  _cachedElevGpsLon = null;
}


// ══════════════════════════════════════════════════════════
// CONNECTIVITY STATE RESOLUTION
//
// Phase 3D: Reads live CI summary with freshness awareness.
//
// During 'recovering' or 'stale' freshness, the resolver
// holds the previous connectivity state to prevent rapid
// oscillation in remoteness scoring.
//
// Priority:
//   1. CI summary (if initialized, monitoring, and live/recovering)
//   2. Raw connectivity module (fallback)
// ══════════════════════════════════════════════════════════

/** Phase 3D: Last known good connectivity state from CI */
let _lastKnownCIState: ConnectivityState = 'unknown';
let _lastKnownCIFreshness: string = 'offline';

function _resolveConnectivityState(): CacheAwareConnectivity {
  // Phase 3D: Try Connectivity Intelligence summary first
  let expeditionDataReady = false;
  try {
    const { offlineExpeditionDbStore } = require('./offlineExpeditionDbStore');
    if (offlineExpeditionDbStore.isInitialized()) {
      const readiness = offlineExpeditionDbStore.evaluateReadiness();
      expeditionDataReady = readiness.has_offline_data && readiness.covers_current_position;
    }
  } catch {}

  try {
    const { connectivityIntelStore } = require('./connectivityIntelStore');
    if (connectivityIntelStore.isInitialized() && connectivityIntelStore.isMonitoring()) {
      const summary = connectivityIntelStore.getSummary();
      if (summary) {
        const freshness = summary.freshness || 'offline';

        // Phase 3D: During recovery or stale, hold last known good state
        if (freshness === 'recovering' || freshness === 'stale') {
          return {
            state: _lastKnownCIState,
            cacheReady: summary.offline_cache_ready,
            cachedRegionAvailable: summary.cached_region_available,
            cachedRouteAvailable: summary.cached_route_available,
            freshness,
            expeditionDataReady,
          };
        }

        // Live or offline — use the actual state
        if (summary.is_live || freshness === 'live' || freshness === 'offline') {
          let state: ConnectivityState;
          switch (summary.connectivity_state) {
            case 'connected': state = 'online'; break;
            case 'limited':   state = 'unknown'; break;
            case 'degraded':  state = 'degraded'; break;
            case 'offline':   state = 'offline'; break;
            case 'unknown':
            default:          state = 'unknown'; break;
          }

          if (freshness === 'live') {
            _lastKnownCIState = state;
            _lastKnownCIFreshness = freshness;
          }

          return {
            state,
            cacheReady: summary.offline_cache_ready,
            cachedRegionAvailable: summary.cached_region_available,
            cachedRouteAvailable: summary.cached_route_available,
            freshness,
            expeditionDataReady,
          };
        }
      }
    }
  } catch {}

  // Legacy fallback
  const level = connectivity.getLevel();
  let state: ConnectivityState;
  switch (level) {
    case 'no_service': state = 'offline'; break;
    case 'limited':    state = 'unknown'; break;
    case 'normal':     state = 'online'; break;
    case 'unknown':
    default:           state = 'unknown'; break;
  }

  return {
    state,
    cacheReady: false,
    cachedRegionAvailable: false,
    cachedRouteAvailable: false,
    freshness: 'offline',
    expeditionDataReady,
  };
}




// ══════════════════════════════════════════════════════════
// INTERNAL STATE
// ══════════════════════════════════════════════════════════
let _smoothedScore = -1;
let _rawScore = 0;
let _currentTier: RemotenessTier = 'NEAR CIVILIZATION';
let _currentTierColor = '#4CAF50';
let _currentReason = 'Assessing environment\u2026';

// Signal contributions
let _elevationScore = 0;
let _connectivityScore = 0;
let _speedScore = 0;
let _connectivityState: ConnectivityState = 'unknown';
let _cacheReady = false;
let _currentFreshness = 'offline';
/** Phase 6A/6D: Whether offline expedition data is cached */
let _expeditionDataReady = false;

// Anti-flicker state
let _pendingTier: RemotenessTier | null = null;
let _pendingTierSince: number = 0;

// Recomputation state
let _recomputeTimer: ReturnType<typeof setInterval> | null = null;
let _isRunning = false;

// ── Cached output (identity stability) ──────────────────
let _cachedOutput: RemotenessOutput | null = null;

// Listeners
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify() {
  _listeners.forEach(fn => { try { fn(); } catch {} });
}


// ══════════════════════════════════════════════════════════
// SIGNAL GATHERING
// ══════════════════════════════════════════════════════════

interface GatheredSignals {
  terrainComplexity: TerrainComplexityTier | null;
  hasActiveRoute: boolean;
  connectivityState: ConnectivityState;
  cacheReady: boolean;
  cachedRegionAvailable: boolean;
  cachedRouteAvailable: boolean;
  speedMph: number | null;
  elevResult: ElevationComplexityResult | null;
  /** Phase 3D: Current freshness from CI */
  freshness: string;
  /** Phase 6A: Whether offline expedition data is cached for the current area */
  expeditionDataReady: boolean;
}

function _gatherSignals(): GatheredSignals {
  const gps = gpsUIState.get();
  const gpsLat = gps.hasFix && gps.position ? gps.position.latitude : null;
  const gpsLon = gps.hasFix && gps.position ? gps.position.longitude : null;
  const speedMph = gps.hasFix && gps.position ? (gps.position.speedMph ?? null) : null;

  const activeRoute = routeStore.getActive();
  const hasActiveRoute = activeRoute != null;
  const currentRouteId = activeRoute?.id ?? null;

  if (currentRouteId !== _cachedRouteId) {
    _clearSegmentCache();
    _cachedRouteId = currentRouteId;
  }

  let terrainComplexity: TerrainComplexityTier | null = null;
  let elevResult: ElevationComplexityResult | null = _cachedElevResult;

  if (activeRoute && activeRoute.segments && activeRoute.segments.length > 0) {
    const result = analyzeElevationComplexity(activeRoute.segments, gpsLat, gpsLon);
    elevResult = result;
    _cachedElevResult = result;
    _cachedElevGpsLat = gpsLat;
    _cachedElevGpsLon = gpsLon;

    if (result.hasElevation) {
      terrainComplexity = result.tier;
    }
  } else {
    _cachedElevResult = null;
  }

  const cacheAware = _resolveConnectivityState();

  return {
    terrainComplexity,
    hasActiveRoute,
    connectivityState: cacheAware.state,
    cacheReady: cacheAware.cacheReady,
    cachedRegionAvailable: cacheAware.cachedRegionAvailable,
    cachedRouteAvailable: cacheAware.cachedRouteAvailable,
    speedMph,
    elevResult,
    freshness: cacheAware.freshness,
    expeditionDataReady: cacheAware.expeditionDataReady,
  };
}



// ══════════════════════════════════════════════════════════
// RAW SCORE COMPUTATION
// ══════════════════════════════════════════════════════════

function _computeRawScore(signals: GatheredSignals): {
  score: number;
  reason: string;
  elevationScore: number;
  connectivityScore: number;
  speedScore: number;
} {
  if (!signals.hasActiveRoute) {
    return {
      score: 25,
      reason: 'Backcountry conditions',
      elevationScore: 0,
      connectivityScore: 0,
      speedScore: 0,
    };
  }

  // ═══ SIGNAL A: Elevation Complexity ═══
  const complexity = signals.terrainComplexity;
  let elevationScore = 0;
  let terrainLabel = 'Low';

  if (complexity != null) {
    elevationScore = TERRAIN_COMPLEXITY_SCORES[complexity] ?? 0;
    terrainLabel = complexity.charAt(0).toUpperCase() + complexity.slice(1);
  }

  // ═══ SIGNAL B: Connectivity (with Phase 3C cache adjustments) ═══
  let connectivityScore = CONNECTIVITY_SCORES[signals.connectivityState] ?? 0;

  const cacheUseful = signals.cacheReady &&
    (signals.cachedRegionAvailable || signals.cachedRouteAvailable);

  if (signals.connectivityState === 'offline') {
    if (cacheUseful) {
      connectivityScore += CACHE_ADJUSTMENTS.offline_cached;
    } else {
      connectivityScore += CACHE_ADJUSTMENTS.offline_uncached;
    }
  } else if (signals.connectivityState === 'degraded') {
    if (cacheUseful) {
      connectivityScore += CACHE_ADJUSTMENTS.degraded_cached;
    } else {
      connectivityScore += CACHE_ADJUSTMENTS.degraded_uncached;
    }
  }

  connectivityScore = Math.max(0, Math.min(20, connectivityScore));

  // ═══ SIGNAL C: Speed Nuance ═══
  recordSpeedSample(signals.speedMph);
  const speedScore = computeSpeedScore();

  // ═══ FINAL SCORE ═══
  const rawTotal = elevationScore + connectivityScore + speedScore;
  const clampedScore = Math.max(0, Math.min(100, rawTotal));

  // ═══ REASON PRIORITY ═══
  let reason: string;
  if (signals.connectivityState === 'offline') {
    if (cacheUseful) {
      reason = 'Offline \u2014 cached maps available';
    } else {
      reason = 'Offline \u2014 no cached data';
    }
  } else if (signals.connectivityState === 'degraded') {
    if (cacheUseful) {
      reason = 'Degraded connectivity \u2014 cache fallback available';
    } else {
      reason = 'Degraded connectivity \u2014 no cache fallback';
    }
  } else if (elevationScore > 0) {
    reason = `Terrain complexity: ${terrainLabel}`;
  } else if (speedScore > 0) {
    reason = 'Technical terrain conditions';
  } else {
    reason = `Terrain complexity: ${terrainLabel}`;
  }

  return { score: clampedScore, reason, elevationScore, connectivityScore, speedScore };
}


// ══════════════════════════════════════════════════════════
// CORE RECOMPUTATION (timer-driven only)
// ══════════════════════════════════════════════════════════

function _recompute() {
  const signals = _gatherSignals();

  const result = _computeRawScore(signals);
  _rawScore = result.score;
  _currentReason = result.reason;
  _elevationScore = result.elevationScore;
  _connectivityScore = result.connectivityScore;
  _speedScore = result.speedScore;
  _connectivityState = signals.connectivityState;
  _cacheReady = signals.cacheReady;
  _currentFreshness = signals.freshness;
  _expeditionDataReady = signals.expeditionDataReady;

  // ── Smoothing ──
  if (_smoothedScore < 0) {
    _smoothedScore = result.score;
  } else {
    _smoothedScore = _smoothedScore * SMOOTH_PREV + result.score * SMOOTH_NEW;
  }
  _smoothedScore = Math.max(0, Math.min(100, _smoothedScore));

  // ── Tier mapping from smoothed score ──
  const { tier: newTier, color: newColor } = scoreToTier(_smoothedScore);

  // ── Anti-flicker logic ──
  if (newTier !== _currentTier) {
    const now = Date.now();
    let forceChange = false;

    const lower = tierLowerBound(newTier);
    const upper = tierUpperBound(newTier);
    const distFromLower = _smoothedScore - lower;
    const distFromUpper = upper - _smoothedScore;
    const distIntoBoundary = Math.min(distFromLower, distFromUpper);

    if (distIntoBoundary >= TIER_FORCE_DELTA) {
      forceChange = true;
    }

    if (forceChange) {
      _currentTier = newTier;
      _currentTierColor = newColor;
      _pendingTier = null;
      _pendingTierSince = 0;
    } else if (_pendingTier === newTier) {
      if (now - _pendingTierSince >= TIER_HOLD_MS) {
        _currentTier = newTier;
        _currentTierColor = newColor;
        _pendingTier = null;
        _pendingTierSince = 0;
      }
    } else {
      _pendingTier = newTier;
      _pendingTierSince = now;
    }
  } else {
    _pendingTier = null;
    _pendingTierSince = 0;
  }

  // ── Build output and check for meaningful change ──
  const newScore = Math.round(_smoothedScore < 0 ? 0 : _smoothedScore);

  if (_cachedOutput != null &&
      _cachedOutput.score === newScore &&
      _cachedOutput.rawScore === _rawScore &&
      _cachedOutput.tier === _currentTier &&
      _cachedOutput.reason === _currentReason &&
      _cachedOutput.signals.elevationScore === _elevationScore &&
      _cachedOutput.signals.connectivityScore === _connectivityScore &&
      _cachedOutput.signals.speedScore === _speedScore &&
      _cachedOutput.signals.connectivityState === _connectivityState &&
      _cachedOutput.signals.cacheReady === _cacheReady &&
      _cachedOutput.signals.freshness === _currentFreshness &&
      _cachedOutput.signals.expeditionDataReady === _expeditionDataReady) {
    return;
  }

  _cachedOutput = {
    score: newScore,
    rawScore: _rawScore,
    tier: _currentTier,
    reason: _currentReason,
    tierColor: _currentTierColor,
    signals: {
      elevationScore: _elevationScore,
      connectivityScore: _connectivityScore,
      speedScore: _speedScore,
      connectivityState: _connectivityState,
      sustainedSpeedMph: _sustainedSpeedMph,
      cacheReady: _cacheReady,
      freshness: _currentFreshness,
      expeditionDataReady: _expeditionDataReady,
    },
  };

  _notify();
}


// ══════════════════════════════════════════════════════════
// ENHANCED REMOTENESS INDEX (v3.0)
// ══════════════════════════════════════════════════════════
// Runs alongside the legacy scoring on the same timer.
// Provides full multi-factor analysis, forward forecast,
// infrastructure proximity, and intelligence advisories.

let _cachedIndexOutput: RemotenessIndexOutput | null = null;

function _recomputeIndex(signals: GatheredSignals): void {
  const gps = gpsUIState.get();
  const gpsLat = gps.hasFix && gps.position ? gps.position.latitude : null;
  const gpsLon = gps.hasFix && gps.position ? gps.position.longitude : null;
  const elevFt = gps.hasFix && gps.position ? (gps.position.altitudeFt ?? null) : null;

  const result = computeFullRemoteness({
    speedMph: signals.speedMph,
    connectivityState: signals.connectivityState,
    elevationFt: elevFt,
    terrainComplexity: signals.terrainComplexity,
    hasActiveRoute: signals.hasActiveRoute,
    cacheReady: signals.cacheReady,
    gpsLat,
    gpsLon,
  });

  const { level, color } = scoreToLevel(result.score);

  _cachedIndexOutput = {
    score: result.score,
    rawScore: result.score,
    level,
    levelColor: color,
    reason: result.reason,
    description: result.description,
    confidence: result.confidence,
    priority: result.priority,
    explanation: result.explanation ?? null,
    factors: result.factors,
    availableFactorCount: result.factors.filter(f => f.available).length,
    totalFactorCount: result.factors.length,
    proximity: result.proximity,
    connectivity: result.connectivity,
    terrain: result.terrain,
    forecast: result.forecast,
    advisories: result.advisories,
    isActive: _isRunning,
    lastComputedAt: Date.now(),
    gpsLat,
    gpsLon,
    speedMph: signals.speedMph,
  };
}

// Patch _recompute to also compute index
const _originalRecompute = _recompute;
function _recomputeWithIndex() {
  const signals = _gatherSignals();

  // Run legacy computation
  const result = _computeRawScore(signals);
  _rawScore = result.score;
  _currentReason = result.reason;
  _elevationScore = result.elevationScore;
  _connectivityScore = result.connectivityScore;
  _speedScore = result.speedScore;
  _connectivityState = signals.connectivityState;
  _cacheReady = signals.cacheReady;
  _currentFreshness = signals.freshness;
  _expeditionDataReady = signals.expeditionDataReady;

  if (_smoothedScore < 0) {
    _smoothedScore = result.score;
  } else {
    _smoothedScore = _smoothedScore * SMOOTH_PREV + result.score * SMOOTH_NEW;
  }
  _smoothedScore = Math.max(0, Math.min(100, _smoothedScore));

  const { tier: newTier, color: newColor } = scoreToTier(_smoothedScore);

  if (newTier !== _currentTier) {
    const now = Date.now();
    let forceChange = false;
    const lower = tierLowerBound(newTier);
    const upper = tierUpperBound(newTier);
    const distIntoBoundary = Math.min(_smoothedScore - lower, upper - _smoothedScore);
    if (distIntoBoundary >= TIER_FORCE_DELTA) forceChange = true;

    if (forceChange) {
      _currentTier = newTier;
      _currentTierColor = newColor;
      _pendingTier = null;
      _pendingTierSince = 0;
    } else if (_pendingTier === newTier) {
      if (Date.now() - _pendingTierSince >= TIER_HOLD_MS) {
        _currentTier = newTier;
        _currentTierColor = newColor;
        _pendingTier = null;
        _pendingTierSince = 0;
      }
    } else {
      _pendingTier = newTier;
      _pendingTierSince = Date.now();
    }
  } else {
    _pendingTier = null;
    _pendingTierSince = 0;
  }

  const newScore = Math.round(_smoothedScore < 0 ? 0 : _smoothedScore);

  const changed = _cachedOutput == null ||
    _cachedOutput.score !== newScore ||
    _cachedOutput.rawScore !== _rawScore ||
    _cachedOutput.tier !== _currentTier ||
    _cachedOutput.reason !== _currentReason;

  _cachedOutput = {
    score: newScore,
    rawScore: _rawScore,
    tier: _currentTier,
    reason: _currentReason,
    tierColor: _currentTierColor,
    confidence: _cachedIndexOutput?.confidence ?? UNKNOWN_CONFIDENCE,
    priority: _cachedIndexOutput?.priority ?? UNKNOWN_PRIORITY,
    signals: {
      elevationScore: _elevationScore,
      connectivityScore: _connectivityScore,
      speedScore: _speedScore,
      connectivityState: _connectivityState,
      sustainedSpeedMph: _sustainedSpeedMph,
      cacheReady: _cacheReady,
      freshness: _currentFreshness,
      expeditionDataReady: _expeditionDataReady,
    },
  };

  // Run enhanced index computation
  try {
    _recomputeIndex(signals);
  } catch (e) {
    // Gracefully handle engine errors
  }

  if (changed) _notify();
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const remotenessStore = {
  /**
   * Feed signal overrides (backward compatibility).
   * @deprecated Prefer letting the store gather signals internally.
   */
  feed: (_input: RemotenessFeedInput): void => {
    // No-op in v2.3
  },

  /**
   * Get current remoteness output (legacy format).
   * Returns a STABLE cached object reference.
   */
  get: (): RemotenessOutput => {
    if (_cachedOutput != null) return _cachedOutput;

    return {
      score: 0,
      rawScore: 0,
      tier: 'NEAR CIVILIZATION',
      reason: 'Assessing environment\u2026',
      tierColor: '#4CAF50',
      confidence: UNKNOWN_CONFIDENCE,
      priority: UNKNOWN_PRIORITY,
      signals: {
        elevationScore: 0,
        connectivityScore: 0,
        speedScore: 0,
        connectivityState: 'unknown',
        sustainedSpeedMph: null,
        cacheReady: false,
        freshness: 'offline',
        expeditionDataReady: false,
      },
    };
  },

  /**
   * Get full Remoteness Index output (v3.0 enhanced format).
   * Returns the comprehensive multi-factor analysis including:
   *   - Factor breakdown with weighted scores
   *   - Infrastructure proximity estimates
   *   - Connectivity assessment
   *   - Terrain context
   *   - Forward remoteness forecast
   *   - Intelligence advisories
   */
  getIndex: (): RemotenessIndexOutput | null => {
    return _cachedIndexOutput;
  },

  /**
   * Get cached elevation complexity result for detail views.
   */
  getElevationResult: (): ElevationComplexityResult | null => {
    return _cachedElevResult;
  },

  /**
   * Start periodic recomputation.
   */
  start: (): void => {
    if (_isRunning) return;
    _isRunning = true;

    _recomputeWithIndex();

    _recomputeTimer = setInterval(() => {
      _recomputeWithIndex();
    }, RECOMPUTE_INTERVAL_MS);
  },

  /**
   * Stop periodic recomputation.
   */
  stop: (): void => {
    _isRunning = false;
    if (_recomputeTimer) {
      clearInterval(_recomputeTimer);
      _recomputeTimer = null;
    }
  },

  /**
   * Reset all state.
   */
  reset: (): void => {
    remotenessStore.stop();
    _smoothedScore = -1;
    _rawScore = 0;
    _currentTier = 'NEAR CIVILIZATION';
    _currentTierColor = '#4CAF50';
    _currentReason = 'Assessing environment\u2026';
    _elevationScore = 0;
    _connectivityScore = 0;
    _speedScore = 0;
    _connectivityState = 'unknown';
    _cacheReady = false;
    _currentFreshness = 'offline';
    _expeditionDataReady = false;
    _sustainedSpeedMph = null;
    _speedSamples = [];
    _pendingTier = null;
    _pendingTierSince = 0;
    _cachedOutput = null;
    _cachedIndexOutput = null;
    _lastKnownCIState = 'unknown';
    _lastKnownCIFreshness = 'offline';
    _clearSegmentCache();
    _notify();
  },


  /**
   * Whether the engine is actively recomputing.
   */
  isRunning: (): boolean => _isRunning,

  /**
   * Subscribe to remoteness changes.
   */
  subscribe: (fn: Listener): (() => void) => {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

