/**
 * ECS TERRAIN ANALYSIS ENGINE — Predictive Expedition Intelligence (Phase 3)
 * ==========================================================================
 *
 * Analyzes the RouteAnalysisSegment[] data produced by Phase 1 and identifies
 * terrain characteristics that may impact an expedition.
 *
 * DETECTION RULES:
 *   - STEEP_GRADE:    elevation gain > 800 ft in a 10-mile segment
 *   - HIGH_ELEVATION: average segment elevation > 7,500 ft
 *   - MOUNTAIN_PASS:  cumulative climb > 2,500 ft within 3 consecutive segments
 *
 * OUTPUTS:
 *   - TerrainIntelligence object with warnings, counts, and pass detection
 *   - Feeds the Expedition Forecast panel (future)
 *
 * ARCHITECTURE:
 *   - Pure analysis functions (no side effects)
 *   - Subscriber pattern for UI updates
 *   - Stores locally (localStorage/memory)
 *   - Integrates with routeAnalysisEngine (Phase 1)
 */

import { Platform } from 'react-native';
import type { RouteAnalysisSegment, RouteIntelligence } from './routeAnalysisEngine';

const TAG = '[TERRAIN_ANALYSIS]';

// ── Types ────────────────────────────────────────────────────

/**
 * Types of terrain warnings the engine can detect.
 */
export type TerrainWarningType = 'STEEP_GRADE' | 'HIGH_ELEVATION' | 'MOUNTAIN_PASS';

/**
 * A terrain warning tied to a specific segment.
 */
export interface TerrainWarning {
  /** Index of the segment where the warning was detected */
  segmentIndex: number;
  /** Type of terrain warning */
  warningType: TerrainWarningType;
  /** Human-readable warning message */
  message: string;
  /** Segment distance range (e.g., "20–30 mi") */
  segmentRange: string;
  /** Relevant metric value (elevation gain, avg elevation, or cumulative climb) */
  metricValue: number;
  /** Metric unit label */
  metricUnit: string;
  /** Severity color for UI rendering */
  color: string;
}

/**
 * Complete terrain intelligence analysis result.
 */
export interface TerrainIntelligence {
  /** Unique analysis ID */
  id: string;
  /** Source route intelligence ID */
  routeIntelligenceId: string;
  /** Source route name */
  routeName: string;

  /** Number of segments flagged as steep terrain */
  steepSegments: number;
  /** Number of segments flagged as high elevation */
  highElevationSegments: number;
  /** Whether a mountain pass crossing was detected */
  mountainPassDetected: boolean;
  /** Number of mountain passes detected */
  mountainPassCount: number;

  /** Highest elevation on the route (feet) */
  highestElevationFeet: number;
  /** Lowest elevation on the route (feet) */
  lowestElevationFeet: number;
  /** Average elevation across all segments (feet) */
  avgElevationFeet: number;
  /** Total elevation gain (feet) */
  totalElevationGainFeet: number;

  /** All terrain warnings detected */
  terrainWarnings: TerrainWarning[];

  /** Total number of segments analyzed */
  totalSegments: number;
  /** Whether elevation data was available */
  hasElevation: boolean;

  /** Overall terrain risk level */
  overallRisk: 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE';

  /** Analysis timestamp */
  analyzedAt: string;

  /** Segment-level highlight data for map rendering */
  segmentHighlights: SegmentHighlight[];
}

/**
 * Per-segment highlight data for map rendering.
 */
export interface SegmentHighlight {
  segmentIndex: number;
  /** Highlight color based on warning type */
  color: string;
  /** Warning type that triggered the highlight */
  warningType: TerrainWarningType;
  /** Coordinates for the segment midpoint */
  coordinates: [number, number];
  /** Distance range label */
  rangeLabel: string;
}

// ── Constants ────────────────────────────────────────────────

/** Steep grade threshold: elevation gain per 10-mile segment (feet) */
const STEEP_GRADE_THRESHOLD_FT = 800;

/** High elevation threshold: average segment elevation (feet) */
const HIGH_ELEVATION_THRESHOLD_FT = 7500;

/** Mountain pass threshold: cumulative climb within N consecutive segments (feet) */
const MOUNTAIN_PASS_CLIMB_THRESHOLD_FT = 2500;

/** Number of consecutive segments to check for mountain pass detection */
const MOUNTAIN_PASS_WINDOW = 3;

/** Storage key for persistence */
const STORAGE_KEY = 'ecs_terrain_intelligence';

// ── Warning Colors ───────────────────────────────────────────

export const TERRAIN_WARNING_COLORS: Record<TerrainWarningType, string> = {
  STEEP_GRADE: '#FF9800',     // orange
  MOUNTAIN_PASS: '#EF5350',   // red
  HIGH_ELEVATION: '#AB47BC',  // purple
};

export const TERRAIN_WARNING_ICONS: Record<TerrainWarningType, string> = {
  STEEP_GRADE: 'trending-up-outline',
  MOUNTAIN_PASS: 'triangle-outline',
  HIGH_ELEVATION: 'arrow-up-circle-outline',
};

export const TERRAIN_WARNING_LABELS: Record<TerrainWarningType, string> = {
  STEEP_GRADE: 'STEEP GRADE',
  MOUNTAIN_PASS: 'MOUNTAIN PASS',
  HIGH_ELEVATION: 'HIGH ELEVATION',
};

export const RISK_META: Record<string, { label: string; color: string; icon: string }> = {
  LOW: { label: 'LOW', color: '#66BB6A', icon: 'shield-checkmark-outline' },
  MODERATE: { label: 'MODERATE', color: '#FFB74D', icon: 'alert-circle-outline' },
  HIGH: { label: 'HIGH', color: '#FF9800', icon: 'warning-outline' },
  SEVERE: { label: 'SEVERE', color: '#EF5350', icon: 'flame-outline' },
};

// ── Storage Helpers ──────────────────────────────────────────

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

// ── Core Analysis Function ───────────────────────────────────

/**
 * Analyze route segments and detect terrain-related expedition risks.
 *
 * Uses RouteAnalysisSegment[] from Phase 1 to detect:
 *   - Steep terrain (elevation gain > 800 ft per 10-mile segment)
 *   - High elevation travel (avg segment elevation > 7,500 ft)
 *   - Mountain pass crossings (cumulative climb > 2,500 ft within 3 segments)
 *
 * @param routeIntelligence - Phase 1 RouteIntelligence result
 * @returns TerrainIntelligence analysis result
 */
export function analyzeTerrain(routeIntelligence: RouteIntelligence): TerrainIntelligence {
  const now = new Date().toISOString();

  // ── Stabilization: Guard against null/undefined routeIntelligence ──
  if (!routeIntelligence) {
    console.warn(TAG, 'analyzeTerrain called with null routeIntelligence — returning safe defaults');
    return createSafeDefaultIntelligence(now);
  }

  const segments = routeIntelligence.segments;

  // ── Edge case: no segments ──
  if (!segments || segments.length === 0) {
    console.warn(TAG, 'No segments available for terrain analysis — returning safe defaults');
    return createEmptyIntelligence(routeIntelligence, now);
  }

  // ── Stabilization: Check if elevation data is sufficient for meaningful analysis ──
  // Count segments that have non-zero elevation data
  let segmentsWithElevation = 0;
  for (const seg of segments) {
    if (seg.avgElevation > 0 || seg.elevationGain > 0 || seg.maxElevation > 0) {
      segmentsWithElevation++;
    }
  }
  const hasUsableElevation = routeIntelligence.hasElevation && segmentsWithElevation > 0;
  const elevationDataSufficient = segmentsWithElevation >= Math.min(2, segments.length);

  const warnings: TerrainWarning[] = [];
  const segmentHighlights: SegmentHighlight[] = [];
  let steepSegments = 0;
  let highElevationSegments = 0;
  let mountainPassCount = 0;

  // Track which segments already have highlights (avoid duplicates)
  const highlightedSegments = new Set<number>();

  // ── Stabilization: Only run terrain detection if elevation data is usable ──
  if (hasUsableElevation) {
    // ── Pass 1: Detect steep grades and high elevation ──
    for (const seg of segments) {
      const rangeLabel = `${seg.distanceStart.toFixed(0)}–${seg.distanceEnd.toFixed(0)} mi`;

      // STEEP_GRADE: elevation gain > 800 ft in a 10-mile segment
      if (seg.elevationGain > STEEP_GRADE_THRESHOLD_FT) {
        steepSegments++;
        warnings.push({
          segmentIndex: seg.segmentIndex,
          warningType: 'STEEP_GRADE',
          message: `Steep terrain detected — ${seg.elevationGain.toLocaleString()} ft gain in segment ${seg.segmentIndex + 1}`,
          segmentRange: rangeLabel,
          metricValue: seg.elevationGain,
          metricUnit: 'ft gain',
          color: TERRAIN_WARNING_COLORS.STEEP_GRADE,
        });

        if (!highlightedSegments.has(seg.segmentIndex)) {
          highlightedSegments.add(seg.segmentIndex);
          segmentHighlights.push({
            segmentIndex: seg.segmentIndex,
            color: TERRAIN_WARNING_COLORS.STEEP_GRADE,
            warningType: 'STEEP_GRADE',
            coordinates: seg.coordinates,
            rangeLabel,
          });
        }
      }

      // HIGH_ELEVATION: average segment elevation > 7,500 ft
      if (seg.avgElevation > HIGH_ELEVATION_THRESHOLD_FT) {
        highElevationSegments++;
        warnings.push({
          segmentIndex: seg.segmentIndex,
          warningType: 'HIGH_ELEVATION',
          message: `High elevation travel — avg ${seg.avgElevation.toLocaleString()} ft in segment ${seg.segmentIndex + 1}`,
          segmentRange: rangeLabel,
          metricValue: seg.avgElevation,
          metricUnit: 'ft avg',
          color: TERRAIN_WARNING_COLORS.HIGH_ELEVATION,
        });

        // Only add highlight if not already highlighted by a higher-priority warning
        if (!highlightedSegments.has(seg.segmentIndex)) {
          highlightedSegments.add(seg.segmentIndex);
          segmentHighlights.push({
            segmentIndex: seg.segmentIndex,
            color: TERRAIN_WARNING_COLORS.HIGH_ELEVATION,
            warningType: 'HIGH_ELEVATION',
            coordinates: seg.coordinates,
            rangeLabel,
          });
        }
      }
    }

    // ── Pass 2: Detect mountain passes ──
    // ── Stabilization: Only detect mountain passes if elevation data is sufficient ──
    // Require at least MOUNTAIN_PASS_WINDOW segments with elevation data
    if (segments.length >= MOUNTAIN_PASS_WINDOW && elevationDataSufficient) {
      for (let i = 0; i <= segments.length - MOUNTAIN_PASS_WINDOW; i++) {
        let cumulativeClimb = 0;
        let windowHasElevation = true;

        for (let j = i; j < i + MOUNTAIN_PASS_WINDOW; j++) {
          // ── Stabilization: Verify each segment in window has valid elevation data ──
          if (segments[j].elevationGain === 0 && segments[j].avgElevation === 0 && segments[j].maxElevation === 0) {
            windowHasElevation = false;
            break;
          }
          cumulativeClimb += segments[j].elevationGain;
        }

        // ── Stabilization: Skip mountain pass detection if window lacks elevation data ──
        if (!windowHasElevation) continue;

        if (cumulativeClimb > MOUNTAIN_PASS_CLIMB_THRESHOLD_FT) {
          mountainPassCount++;

          // Use the middle segment of the window for the warning
          const midIdx = i + Math.floor(MOUNTAIN_PASS_WINDOW / 2);
          const midSeg = segments[midIdx];
          const startSeg = segments[i];
          const endSeg = segments[i + MOUNTAIN_PASS_WINDOW - 1];
          const rangeLabel = `${startSeg.distanceStart.toFixed(0)}–${endSeg.distanceEnd.toFixed(0)} mi`;

          warnings.push({
            segmentIndex: midIdx,
            warningType: 'MOUNTAIN_PASS',
            message: `Mountain pass crossing — ${cumulativeClimb.toLocaleString()} ft climb over ${MOUNTAIN_PASS_WINDOW} segments`,
            segmentRange: rangeLabel,
            metricValue: cumulativeClimb,
            metricUnit: 'ft climb',
            color: TERRAIN_WARNING_COLORS.MOUNTAIN_PASS,
          });

          // Highlight all segments in the pass window (mountain pass takes priority)
          for (let j = i; j < i + MOUNTAIN_PASS_WINDOW; j++) {
            const seg = segments[j];
            const segRange = `${seg.distanceStart.toFixed(0)}–${seg.distanceEnd.toFixed(0)} mi`;

            // Remove existing lower-priority highlights for these segments
            const existingIdx = segmentHighlights.findIndex(h => h.segmentIndex === j);
            if (existingIdx >= 0) {
              segmentHighlights[existingIdx] = {
                segmentIndex: j,
                color: TERRAIN_WARNING_COLORS.MOUNTAIN_PASS,
                warningType: 'MOUNTAIN_PASS',
                coordinates: seg.coordinates,
                rangeLabel: segRange,
              };
            } else {
              segmentHighlights.push({
                segmentIndex: j,
                color: TERRAIN_WARNING_COLORS.MOUNTAIN_PASS,
                warningType: 'MOUNTAIN_PASS',
                coordinates: seg.coordinates,
                rangeLabel: segRange,
              });
            }
            highlightedSegments.add(j);
          }

          // Skip ahead to avoid overlapping pass detections
          i += MOUNTAIN_PASS_WINDOW - 1;
        }
      }
    }
  } else {
    console.log(TAG, 'Insufficient elevation data — skipping terrain warning detection');
  }

  // ── Compute elevation stats from segments ──
  let highestEle = 0;
  let lowestEle = Infinity;
  let totalEle = 0;
  let totalGain = 0;
  let eleCount = 0;

  for (const seg of segments) {
    if (seg.maxElevation > 0) {
      highestEle = Math.max(highestEle, seg.maxElevation);
    }
    if (seg.minElevation > 0 && seg.minElevation < lowestEle) {
      lowestEle = seg.minElevation;
    }
    if (seg.avgElevation > 0) {
      totalEle += seg.avgElevation;
      eleCount++;
    }
    totalGain += seg.elevationGain;
  }

  // Use route-level values if available (more accurate)
  const highestElevationFeet = routeIntelligence.highestElevationFeet || highestEle;
  const lowestElevationFeet = routeIntelligence.lowestElevationFeet || (lowestEle === Infinity ? 0 : lowestEle);
  const avgElevationFeet = routeIntelligence.avgElevationFeet || (eleCount > 0 ? Math.round(totalEle / eleCount) : 0);
  const totalElevationGainFeet = routeIntelligence.elevationGainFeet || totalGain;

  // ── Classify overall terrain risk ──
  // ── Stabilization: Only classify risk if elevation data was usable ──
  const overallRisk = hasUsableElevation
    ? classifyOverallRisk(
        steepSegments,
        highElevationSegments,
        mountainPassCount > 0,
        segments.length,
        highestElevationFeet,
        totalElevationGainFeet,
      )
    : 'LOW' as const;

  // ── Sort warnings by segment index ──
  warnings.sort((a, b) => a.segmentIndex - b.segmentIndex);
  segmentHighlights.sort((a, b) => a.segmentIndex - b.segmentIndex);

  const result: TerrainIntelligence = {
    id: uuid(),
    routeIntelligenceId: routeIntelligence.id,
    routeName: routeIntelligence.routeName,
    steepSegments,
    highElevationSegments,
    mountainPassDetected: mountainPassCount > 0,
    mountainPassCount,
    highestElevationFeet,
    lowestElevationFeet,
    avgElevationFeet,
    totalElevationGainFeet,
    terrainWarnings: warnings,
    totalSegments: segments.length,
    hasElevation: routeIntelligence.hasElevation,
    overallRisk,
    analyzedAt: now,
    segmentHighlights,
  };

  console.log(
    TAG,
    `Analysis complete: ${routeIntelligence.routeName}`,
    `— ${steepSegments} steep, ${highElevationSegments} high-ele, ${mountainPassCount} passes,`,
    `risk=${overallRisk}, ${warnings.length} warnings`,
    hasUsableElevation ? '' : '(elevation data insufficient)',
  );

  return result;
}


// ── Overall Risk Classification ──────────────────────────────

function classifyOverallRisk(
  steepSegments: number,
  highElevationSegments: number,
  mountainPassDetected: boolean,
  totalSegments: number,
  highestElevationFeet: number,
  totalElevationGainFeet: number,
): 'LOW' | 'MODERATE' | 'HIGH' | 'SEVERE' {
  let score = 0;

  // Steep segment ratio
  if (totalSegments > 0) {
    const steepRatio = steepSegments / totalSegments;
    if (steepRatio > 0.5) score += 3;
    else if (steepRatio > 0.25) score += 2;
    else if (steepSegments > 0) score += 1;
  }

  // High elevation segment ratio
  if (totalSegments > 0) {
    const highEleRatio = highElevationSegments / totalSegments;
    if (highEleRatio > 0.5) score += 2;
    else if (highEleRatio > 0.25) score += 1;
    else if (highElevationSegments > 0) score += 0.5;
  }

  // Mountain pass detection
  if (mountainPassDetected) score += 2;

  // Absolute elevation thresholds
  if (highestElevationFeet > 12000) score += 2;
  else if (highestElevationFeet > 10000) score += 1;
  else if (highestElevationFeet > 8000) score += 0.5;

  // Total elevation gain per route distance
  // (heavy climbing routes are more demanding)
  if (totalElevationGainFeet > 8000) score += 1;
  else if (totalElevationGainFeet > 5000) score += 0.5;

  // Classify
  if (score >= 7) return 'SEVERE';
  if (score >= 4) return 'HIGH';
  if (score >= 2) return 'MODERATE';
  return 'LOW';
}

// ── Empty Intelligence ───────────────────────────────────────

function createEmptyIntelligence(
  routeIntelligence: RouteIntelligence,
  analyzedAt: string,
): TerrainIntelligence {
  return {
    id: uuid(),
    routeIntelligenceId: routeIntelligence.id,
    routeName: routeIntelligence.routeName,
    steepSegments: 0,
    highElevationSegments: 0,
    mountainPassDetected: false,
    mountainPassCount: 0,
    highestElevationFeet: routeIntelligence.highestElevationFeet || 0,
    lowestElevationFeet: routeIntelligence.lowestElevationFeet || 0,
    avgElevationFeet: routeIntelligence.avgElevationFeet || 0,
    totalElevationGainFeet: routeIntelligence.elevationGainFeet || 0,
    terrainWarnings: [],
    totalSegments: 0,
    hasElevation: routeIntelligence.hasElevation,
    overallRisk: 'LOW',
    analyzedAt,
    segmentHighlights: [],
  };
}

/**
 * Stabilization: Create safe default terrain intelligence when routeIntelligence is null.
 * Returns all-zero values with no warnings — prevents downstream crashes.
 */
function createSafeDefaultIntelligence(analyzedAt: string): TerrainIntelligence {
  return {
    id: uuid(),
    routeIntelligenceId: 'unknown',
    routeName: 'Unknown Route',
    steepSegments: 0,
    highElevationSegments: 0,
    mountainPassDetected: false,
    mountainPassCount: 0,
    highestElevationFeet: 0,
    lowestElevationFeet: 0,
    avgElevationFeet: 0,
    totalElevationGainFeet: 0,
    terrainWarnings: [],
    totalSegments: 0,
    hasElevation: false,
    overallRisk: 'LOW',
    analyzedAt,
    segmentHighlights: [],
  };
}


// ── Listeners ────────────────────────────────────────────────

type TerrainListener = (intel: TerrainIntelligence | null) => void;
const _listeners = new Set<TerrainListener>();

function _notify(intel: TerrainIntelligence | null) {
  _listeners.forEach(fn => {
    try { fn(intel); } catch (e) { console.error(TAG, 'Listener error:', e); }
  });
}

// ── Internal State ───────────────────────────────────────────

let _currentIntelligence: TerrainIntelligence | null = null;

// ── Persistence ──────────────────────────────────────────────

function loadStoredIntelligence(): TerrainIntelligence | null {
  try {
    const raw = sGet(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function saveIntelligence(intel: TerrainIntelligence): void {
  try {
    sSet(STORAGE_KEY, JSON.stringify(intel));
  } catch (e) {
    console.warn(TAG, 'Failed to save terrain intelligence:', e);
  }
}

function clearStoredIntelligence(): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
    delete mem[STORAGE_KEY];
  } catch {}
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API — terrainAnalysisEngine
// ══════════════════════════════════════════════════════════════

export const terrainAnalysisEngine = {
  /**
   * Subscribe to terrain intelligence changes.
   * Returns unsubscribe function.
   */
  subscribe(listener: TerrainListener): () => void {
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  },

  /**
   * Analyze terrain from a RouteIntelligence result (Phase 1).
   * Stores result and notifies listeners.
   */
  analyze(routeIntelligence: RouteIntelligence): TerrainIntelligence {
    const intel = analyzeTerrain(routeIntelligence);
    _currentIntelligence = intel;
    saveIntelligence(intel);
    _notify(intel);
    return intel;
  },

  /**
   * Get the current terrain intelligence (in-memory or from storage).
   */
  getCurrent(): TerrainIntelligence | null {
    if (_currentIntelligence) return _currentIntelligence;
    _currentIntelligence = loadStoredIntelligence();
    return _currentIntelligence;
  },

  /**
   * Check if terrain intelligence exists for a given route intelligence ID.
   */
  isCurrentFor(routeIntelligenceId: string): boolean {
    const current = this.getCurrent();
    return current != null && current.routeIntelligenceId === routeIntelligenceId;
  },

  /**
   * Clear current terrain intelligence.
   */
  clear(): void {
    _currentIntelligence = null;
    clearStoredIntelligence();
    _notify(null);
    console.log(TAG, 'Terrain intelligence cleared');
  },

  /**
   * Format elevation as human-readable string with commas.
   */
  formatElevation(feet: number): string {
    return feet.toLocaleString('en-US');
  },

  /**
   * Get a compact summary string.
   */
  getSummary(intel: TerrainIntelligence): string {
    const parts: string[] = [];
    if (intel.steepSegments > 0) parts.push(`${intel.steepSegments} steep`);
    if (intel.highElevationSegments > 0) parts.push(`${intel.highElevationSegments} high-ele`);
    if (intel.mountainPassDetected) parts.push(`${intel.mountainPassCount} pass${intel.mountainPassCount > 1 ? 'es' : ''}`);
    if (parts.length === 0) return 'No terrain warnings';
    return parts.join(', ');
  },

  /**
   * Get warning count by type.
   */
  getWarningCounts(intel: TerrainIntelligence): Record<TerrainWarningType, number> {
    const counts: Record<TerrainWarningType, number> = {
      STEEP_GRADE: 0,
      HIGH_ELEVATION: 0,
      MOUNTAIN_PASS: 0,
    };
    for (const w of intel.terrainWarnings) {
      counts[w.warningType]++;
    }
    return counts;
  },

  /**
   * Get the percentage of segments with warnings.
   */
  getWarningCoverage(intel: TerrainIntelligence): number {
    if (intel.totalSegments === 0) return 0;
    const uniqueSegments = new Set(intel.terrainWarnings.map(w => w.segmentIndex));
    return Math.round((uniqueSegments.size / intel.totalSegments) * 100);
  },
};

