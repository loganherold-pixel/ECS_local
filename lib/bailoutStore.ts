/**
 * ECS Bailout Store — Phase 2.6
 *
 * Manages bailout points (safe exits / fuel / hospitals / towns)
 * and their association with runs.
 *
 * Offline-first: localStorage (web) / memory (native).
 * Computes distance-to-nearest-bailout per segment for remoteness scoring.
 *
 * Remoteness thresholds:
 *   Green:  ≤ 3 miles (4,828 m)
 *   Yellow: 3–10 miles
 *   Red:    > 10 miles
 *
 * remoteness_score = clamp((bailout_miles / 10) * 40, 0, 40)
 */
import { Platform } from 'react-native';
import { haversineMeters, metersToMiles, type RunHealthLevel } from './runStore';
import type { RunSegment, SegmentReason } from './segmentRiskEngine';

// ── Storage helpers ─────────────────────────────────────────
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

function generateId(): string {
  const c: any = typeof crypto !== 'undefined' ? crypto : null;
  if (c && c.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ── Types ───────────────────────────────────────────────────

export type BailoutType =
  | 'pavement'
  | 'town'
  | 'fuel'
  | 'water'
  | 'supplies'
  | 'repair'
  | 'hospital'
  | 'ranger'
  | 'camp'
  | 'staging'
  | 'alternate_route'
  | 'custom';

export const BAILOUT_TYPES: { key: BailoutType; label: string; icon: string; color: string }[] = [
  { key: 'pavement', label: 'Pavement', icon: 'car-outline', color: '#78909C' },
  { key: 'town', label: 'Town', icon: 'business-outline', color: '#42A5F5' },
  { key: 'fuel', label: 'Fuel', icon: 'flame-outline', color: '#FFA726' },
  { key: 'water', label: 'Water', icon: 'water-outline', color: '#4FC3F7' },
  { key: 'supplies', label: 'Supplies', icon: 'storefront-outline', color: '#26C6DA' },
  { key: 'repair', label: 'Repair', icon: 'construct-outline', color: '#B0BEC5' },
  { key: 'hospital', label: 'Hospital', icon: 'medkit-outline', color: '#EF5350' },
  { key: 'ranger', label: 'Ranger Station', icon: 'shield-outline', color: '#66BB6A' },
  { key: 'camp', label: 'Camp', icon: 'bonfire-outline', color: '#AB47BC' },
  { key: 'staging', label: 'Staging Area', icon: 'flag-outline', color: '#26C6DA' },
  { key: 'alternate_route', label: 'Alt Route', icon: 'git-branch-outline', color: '#FFCA28' },
  { key: 'custom', label: 'Custom', icon: 'pin-outline', color: '#8A8A85' },
];

export interface BailoutPoint {
  id: string;
  user_id: string | null;
  title: string;
  type: BailoutType;
  lat: number;
  lng: number;
  notes: string | null;
  priority: number;
  is_shared: boolean;
  created_at: string;
}

export interface RunBailoutAssociation {
  id: string;
  run_id: string;
  bailout_id: string;
  idx: number;
  created_at: string;
}

export interface RemotenessResult {
  segments: RunSegment[];
  nearest_bailout: { point: BailoutPoint; distance_miles: number } | null;
  max_remoteness_segment: RunSegment | null;
  avg_remoteness_score: number;
}

export interface ExitPlan {
  nearest_bailout_name: string;
  nearest_bailout_distance_miles: number;
  nearest_bailout_type: BailoutType;
  max_remoteness_miles: number;
  max_remoteness_seg_index: number;
  total_bailouts: number;
  remoteness_level: RunHealthLevel;
}

// ── Storage keys ────────────────────────────────────────────
const LS_BAILOUTS = 'ecs_bailout_points';
const LS_RUN_BAILOUTS = 'ecs_run_bailouts';

function getLocalBailouts(): BailoutPoint[] {
  const raw = lsGet(LS_BAILOUTS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveLocalBailouts(points: BailoutPoint[]): void {
  lsSet(LS_BAILOUTS, JSON.stringify(points));
}

function getLocalRunBailouts(): RunBailoutAssociation[] {
  const raw = lsGet(LS_RUN_BAILOUTS);
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function saveLocalRunBailouts(assocs: RunBailoutAssociation[]): void {
  lsSet(LS_RUN_BAILOUTS, JSON.stringify(assocs));
}

// ── Remoteness Thresholds ───────────────────────────────────

const REMOTENESS_GREEN_MILES = 3;
const REMOTENESS_YELLOW_MILES = 10;

function remotenessLevelFromMiles(miles: number): RunHealthLevel {
  if (miles <= REMOTENESS_GREEN_MILES) return 'green';
  if (miles <= REMOTENESS_YELLOW_MILES) return 'yellow';
  return 'red';
}

function remotenessScoreFromMiles(miles: number): number {
  return clamp((miles / 10) * 40, 0, 40);
}

// ── Bailout Store ───────────────────────────────────────────

export const bailoutStore = {
  // ── CRUD ──────────────────────────────────────────────

  getAll: (): BailoutPoint[] => {
    return getLocalBailouts().sort(
      (a, b) => b.priority - a.priority || new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  },

  getById: (id: string): BailoutPoint | null => {
    return getLocalBailouts().find(b => b.id === id) || null;
  },

  getByType: (type: BailoutType): BailoutPoint[] => {
    return getLocalBailouts().filter(b => b.type === type);
  },

  create: (data: {
    title: string;
    type: BailoutType;
    lat: number;
    lng: number;
    notes?: string;
    priority?: number;
  }): BailoutPoint => {
    const point: BailoutPoint = {
      id: generateId(),
      user_id: null,
      title: data.title,
      type: data.type,
      lat: data.lat,
      lng: data.lng,
      notes: data.notes || null,
      priority: data.priority || 0,
      is_shared: false,
      created_at: new Date().toISOString(),
    };
    const all = getLocalBailouts();
    all.push(point);
    saveLocalBailouts(all);
    return point;
  },

  update: (id: string, data: Partial<Omit<BailoutPoint, 'id' | 'created_at'>>): BailoutPoint | null => {
    const all = getLocalBailouts();
    const idx = all.findIndex(b => b.id === id);
    if (idx === -1) return null;
    all[idx] = { ...all[idx], ...data };
    saveLocalBailouts(all);
    return all[idx];
  },

  delete: (id: string): void => {
    const all = getLocalBailouts().filter(b => b.id !== id);
    saveLocalBailouts(all);
    // Also remove from run associations
    const assocs = getLocalRunBailouts().filter(a => a.bailout_id !== id);
    saveLocalRunBailouts(assocs);
  },

  count: (): number => getLocalBailouts().length,

  // ── Run Associations ──────────────────────────────────

  getRunBailouts: (runId: string): BailoutPoint[] => {
    const assocs = getLocalRunBailouts().filter(a => a.run_id === runId);
    const allBailouts = getLocalBailouts();
    const bailoutIds = new Set(assocs.map(a => a.bailout_id));
    return allBailouts
      .filter(b => bailoutIds.has(b.id))
      .sort((a, b) => {
        const aIdx = assocs.find(x => x.bailout_id === a.id)?.idx ?? 0;
        const bIdx = assocs.find(x => x.bailout_id === b.id)?.idx ?? 0;
        return aIdx - bIdx;
      });
  },

  getRunBailoutAssociations: (runId: string): RunBailoutAssociation[] => {
    return getLocalRunBailouts().filter(a => a.run_id === runId);
  },

  addBailoutToRun: (runId: string, bailoutId: string): void => {
    const all = getLocalRunBailouts();
    // Check for duplicate
    if (all.some(a => a.run_id === runId && a.bailout_id === bailoutId)) return;
    const maxIdx = all.filter(a => a.run_id === runId).reduce((m, a) => Math.max(m, a.idx), -1);
    all.push({
      id: generateId(),
      run_id: runId,
      bailout_id: bailoutId,
      idx: maxIdx + 1,
      created_at: new Date().toISOString(),
    });
    saveLocalRunBailouts(all);
  },

  removeBailoutFromRun: (runId: string, bailoutId: string): void => {
    const all = getLocalRunBailouts().filter(
      a => !(a.run_id === runId && a.bailout_id === bailoutId)
    );
    saveLocalRunBailouts(all);
  },

  setRunBailouts: (runId: string, bailoutIds: string[]): void => {
    // Remove existing
    let all = getLocalRunBailouts().filter(a => a.run_id !== runId);
    // Add new
    bailoutIds.forEach((bid, idx) => {
      all.push({
        id: generateId(),
        run_id: runId,
        bailout_id: bid,
        idx,
        created_at: new Date().toISOString(),
      });
    });
    saveLocalRunBailouts(all);
  },

  // ── Auto-Suggest ──────────────────────────────────────

  /**
   * Auto-suggest bailouts near a route bounding box.
   * Returns up to maxCount bailouts, prioritized by priority then distance.
   */
  autoSuggest: (
    routeBounds: { minLat: number; maxLat: number; minLng: number; maxLng: number },
    maxCount: number = 25
  ): BailoutPoint[] => {
    const allBailouts = getLocalBailouts();
    if (allBailouts.length === 0) return [];

    // Buffer the bounds by ~15 miles (~0.22 degrees)
    const buffer = 0.22;
    const bufferedBounds = {
      minLat: routeBounds.minLat - buffer,
      maxLat: routeBounds.maxLat + buffer,
      minLng: routeBounds.minLng - buffer,
      maxLng: routeBounds.maxLng + buffer,
    };

    // Filter bailouts within buffered bounds
    const nearby = allBailouts.filter(b =>
      b.lat >= bufferedBounds.minLat && b.lat <= bufferedBounds.maxLat &&
      b.lng >= bufferedBounds.minLng && b.lng <= bufferedBounds.maxLng
    );

    // Sort by priority (descending), then by distance to center
    const centerLat = (routeBounds.minLat + routeBounds.maxLat) / 2;
    const centerLng = (routeBounds.minLng + routeBounds.maxLng) / 2;

    nearby.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      const distA = haversineMeters(a.lat, a.lng, centerLat, centerLng);
      const distB = haversineMeters(b.lat, b.lng, centerLat, centerLng);
      return distA - distB;
    });

    return nearby.slice(0, maxCount);
  },

  // ── Remoteness Computation ────────────────────────────

  /**
   * Compute remoteness scores for all segments in a run.
   *
   * For each segment, finds the nearest bailout point and computes
   * distance + remoteness_score + remoteness_level.
   *
   * Performance: downsamples if segment count > 200 (every 2nd/3rd).
   */
  computeRemoteness: (
    segments: RunSegment[],
    bailouts: BailoutPoint[]
  ): RemotenessResult => {
    if (bailouts.length === 0 || segments.length === 0) {
      return {
        segments,
        nearest_bailout: null,
        max_remoteness_segment: null,
        avg_remoteness_score: 0,
      };
    }

    // Cap bailouts to 25 for performance
    const useBailouts = bailouts.slice(0, 25);

    // Determine downsampling
    const shouldDownsample = segments.length > 200;
    const sampleStep = shouldDownsample ? Math.ceil(segments.length / 100) : 1;

    // Compute for sampled segments
    const computedMap = new Map<number, { dist: number; bailoutId: string }>();

    for (let i = 0; i < segments.length; i += sampleStep) {
      const seg = segments[i];
      let minDist = Infinity;
      let nearestId = '';

      for (const bp of useBailouts) {
        const dist = haversineMeters(seg.mid_lat, seg.mid_lng, bp.lat, bp.lng);
        if (dist < minDist) {
          minDist = dist;
          nearestId = bp.id;
        }
      }

      computedMap.set(i, { dist: minDist, bailoutId: nearestId });
    }

    // Interpolate for non-sampled segments
    if (shouldDownsample) {
      const sampledIndices = Array.from(computedMap.keys()).sort((a, b) => a - b);
      for (let i = 0; i < segments.length; i++) {
        if (computedMap.has(i)) continue;

        // Find nearest sampled indices
        let lower = 0, upper = segments.length - 1;
        for (const si of sampledIndices) {
          if (si <= i) lower = si;
          if (si >= i && upper === segments.length - 1) upper = si;
        }

        const lowerData = computedMap.get(lower);
        const upperData = computedMap.get(upper);

        if (lowerData && upperData) {
          // Linear interpolation
          const t = upper === lower ? 0 : (i - lower) / (upper - lower);
          const interpDist = lowerData.dist + t * (upperData.dist - lowerData.dist);
          computedMap.set(i, {
            dist: interpDist,
            bailoutId: t < 0.5 ? lowerData.bailoutId : upperData.bailoutId,
          });
        } else if (lowerData) {
          computedMap.set(i, lowerData);
        } else if (upperData) {
          computedMap.set(i, upperData);
        }
      }
    }

    // Apply remoteness to segments
    let globalMinDist = Infinity;
    let globalMinBailout: BailoutPoint | null = null;
    let maxRemotenessSeg: RunSegment | null = null;
    let maxRemotenessScore = -1;
    let totalRemotenessScore = 0;

    for (let i = 0; i < segments.length; i++) {
      const data = computedMap.get(i);
      if (!data) continue;

      const seg = segments[i];
      const distMiles = metersToMiles(data.dist);
      const rScore = remotenessScoreFromMiles(distMiles);
      const rLevel = remotenessLevelFromMiles(distMiles);

      seg.bailout_dist_m = data.dist;
      seg.remoteness_score = rScore;
      seg.bailout_id_nearest = data.bailoutId;
      seg.remoteness_level = rLevel;

      // Add remoteness reason
      const bailoutPoint = useBailouts.find(b => b.id === data.bailoutId);
      const remotenessReason: SegmentReason = {
        code: 'remoteness',
        label: rLevel === 'red' ? 'Highly Remote' : rLevel === 'yellow' ? 'Moderately Remote' : 'Near Bailout',
        value: Math.round(distMiles * 10) / 10,
        unit: 'mi',
        detail: bailoutPoint ? `Nearest: ${bailoutPoint.title}` : undefined,
      };

      // Only add if not already present
      if (!seg.reasons.some(r => r.code === 'remoteness')) {
        seg.reasons.push(remotenessReason);
      } else {
        const idx = seg.reasons.findIndex(r => r.code === 'remoteness');
        seg.reasons[idx] = remotenessReason;
      }

      // Recompute final risk level with escalation
      const totalScore = clamp(seg.risk_score + seg.remoteness_score, 0, 100);
      // Escalation: remote + any other warning = red
      if (rLevel === 'red') {
        const hasOtherWarning = seg.reasons.some(r =>
          r.code === 'grade_high' || r.code === 'grade_moderate' ||
          r.code === 'low_range_buffer' ||
          r.code === 'top_heavy' || r.code === 'rear_bias'
        );
        if (hasOtherWarning) {
          seg.risk_level = 'red';
        } else {
          seg.risk_level = totalScore >= 60 ? 'red' : totalScore >= 30 ? 'yellow' : 'green';
        }
      } else {
        seg.risk_level = totalScore >= 60 ? 'red' : totalScore >= 30 ? 'yellow' : 'green';
      }

      // Track globals
      if (data.dist < globalMinDist) {
        globalMinDist = data.dist;
        globalMinBailout = bailoutPoint || null;
      }
      if (rScore > maxRemotenessScore) {
        maxRemotenessScore = rScore;
        maxRemotenessSeg = seg;
      }
      totalRemotenessScore += rScore;
    }

    return {
      segments,
      nearest_bailout: globalMinBailout
        ? { point: globalMinBailout, distance_miles: metersToMiles(globalMinDist) }
        : null,
      max_remoteness_segment: maxRemotenessSeg,
      avg_remoteness_score: segments.length > 0 ? totalRemotenessScore / segments.length : 0,
    };
  },

  // ── Exit Plan ─────────────────────────────────────────

  /**
   * Compute the Exit Plan summary for a run.
   */
  computeExitPlan: (
    segments: RunSegment[],
    bailouts: BailoutPoint[]
  ): ExitPlan | null => {
    if (segments.length === 0) return null;

    // Find nearest bailout across all segments
    let nearestBailout: BailoutPoint | null = null;
    let nearestDist = Infinity;
    let maxRemoteMiles = 0;
    let maxRemoteSegIdx = 0;

    for (const seg of segments) {
      if (seg.bailout_dist_m != null) {
        const miles = metersToMiles(seg.bailout_dist_m);
        if (seg.bailout_dist_m < nearestDist) {
          nearestDist = seg.bailout_dist_m;
          nearestBailout = bailouts.find(b => b.id === seg.bailout_id_nearest) || null;
        }
        if (miles > maxRemoteMiles) {
          maxRemoteMiles = miles;
          maxRemoteSegIdx = seg.seg_index;
        }
      }
    }

    if (!nearestBailout) return null;

    // Overall remoteness level
    const avgRemoteness = segments.reduce((sum, s) => sum + metersToMiles(s.bailout_dist_m || 0), 0) / segments.length;

    return {
      nearest_bailout_name: nearestBailout.title,
      nearest_bailout_distance_miles: metersToMiles(nearestDist),
      nearest_bailout_type: nearestBailout.type,
      max_remoteness_miles: maxRemoteMiles,
      max_remoteness_seg_index: maxRemoteSegIdx,
      total_bailouts: bailouts.length,
      remoteness_level: remotenessLevelFromMiles(avgRemoteness),
    };
  },
};

/**
 * Get bailout type metadata (icon, color, label).
 */
export function getBailoutTypeMeta(type: BailoutType) {
  return BAILOUT_TYPES.find(t => t.key === type) || BAILOUT_TYPES[BAILOUT_TYPES.length - 1];
}

