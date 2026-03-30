/**
 * ECS Segment Risk Engine — Phase 2.5
 *
 * Computes per-segment risk scores from:
 *   - Grade (elevation change between points)
 *   - Build snapshot (range buffer, weight distribution)
 *   - Cumulative distance vs estimated range
 *
 * Each segment gets a risk_score (0–60 base, before remoteness),
 * risk_level (green/yellow/red), and reasons array.
 *
 * Designed for offline computation — no API calls required.
 */
import { haversineMeters, metersToMiles, type RunPoint, type BuildSnapshot, type RunHealthLevel } from './runStore';

// ── Types ───────────────────────────────────────────────────

export interface SegmentReason {
  code: string;
  label: string;
  value?: number;
  unit?: string;
  detail?: string;
}

export interface RunSegment {
  id: string;
  run_id: string;
  seg_index: number;
  start_idx: number;
  end_idx: number;
  start_lat: number;
  start_lng: number;
  end_lat: number;
  end_lng: number;
  distance_m: number;
  grade_pct: number | null;
  start_ele_m: number | null;
  end_ele_m: number | null;
  risk_score: number;
  risk_level: RunHealthLevel;
  reasons: SegmentReason[];
  // Phase 2.6 remoteness (populated later)
  bailout_dist_m: number | null;
  remoteness_score: number;
  bailout_id_nearest: string | null;
  remoteness_level: RunHealthLevel;
  // Computed helpers (not stored)
  cumulative_distance_m: number;
  mid_lat: number;
  mid_lng: number;
}

export interface SegmentRiskProfile {
  segments: RunSegment[];
  overall_risk_score: number;
  overall_risk_level: RunHealthLevel;
  max_risk_segment: RunSegment | null;
  total_red_segments: number;
  total_yellow_segments: number;
  total_green_segments: number;
  grade_warnings: number;
  range_warnings: number;
  weight_warnings: number;
}

// ── Configuration ───────────────────────────────────────────

/** How many points per segment (group size) */
const SEGMENT_GROUP_SIZE = 5;

/** Grade thresholds */
const GRADE_YELLOW_PCT = 8;   // 8% grade = caution
const GRADE_RED_PCT = 15;     // 15% grade = critical

/** Range buffer thresholds (remaining range as % of total) */
const RANGE_YELLOW_BUFFER = 0.3;  // <30% range remaining = caution
const RANGE_RED_BUFFER = 0.1;     // <10% range remaining = critical

/** Weight distribution scoring */
const WEIGHT_ROOF_OVER_SCORE = 15;
const WEIGHT_HITCH_OVER_SCORE = 15;
const WEIGHT_ROOF_NEAR_SCORE = 5;
const WEIGHT_HITCH_NEAR_SCORE = 5;

// ── Helpers ─────────────────────────────────────────────────

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

function riskLevelFromScore(score: number): RunHealthLevel {
  if (score >= 60) return 'red';
  if (score >= 30) return 'yellow';
  return 'green';
}

// ── Core Computation ────────────────────────────────────────

/**
 * Compute segment-based risk scores for a run.
 *
 * Groups points into segments of SEGMENT_GROUP_SIZE,
 * then scores each segment based on grade, range buffer, and weight.
 */
export function computeSegmentRisk(
  runId: string,
  points: RunPoint[],
  buildSnapshot: BuildSnapshot,
  groupSize: number = SEGMENT_GROUP_SIZE
): SegmentRiskProfile {
  if (points.length < 2) {
    return {
      segments: [],
      overall_risk_score: 0,
      overall_risk_level: 'green',
      max_risk_segment: null,
      total_red_segments: 0,
      total_yellow_segments: 0,
      total_green_segments: 0,
      grade_warnings: 0,
      range_warnings: 0,
      weight_warnings: 0,
    };
  }

  const segments: RunSegment[] = [];
  let cumulativeDistM = 0;
  let segIndex = 0;

  // Pre-compute weight scores (constant across all segments)
  const weightReasons: SegmentReason[] = [];
  let weightScore = 0;

  // Roof weight check
  if (buildSnapshot.limits.roof_limit_lb > 0 && buildSnapshot.roof_weight_lb > 0) {
    const roofRatio = buildSnapshot.roof_weight_lb / buildSnapshot.limits.roof_limit_lb;
    if (roofRatio > 1.0) {
      weightScore += WEIGHT_ROOF_OVER_SCORE;
      weightReasons.push({
        code: 'top_heavy',
        label: 'Roof Overweight',
        value: Math.round(roofRatio * 100),
        unit: '%',
        detail: `${buildSnapshot.roof_weight_lb} lb / ${buildSnapshot.limits.roof_limit_lb} lb limit`,
      });
    } else if (roofRatio > 0.8) {
      weightScore += WEIGHT_ROOF_NEAR_SCORE;
      weightReasons.push({
        code: 'roof_near_limit',
        label: 'Roof Near Limit',
        value: Math.round(roofRatio * 100),
        unit: '%',
        detail: `${buildSnapshot.roof_weight_lb} lb / ${buildSnapshot.limits.roof_limit_lb} lb limit`,
      });
    }
  }

  // Hitch weight check
  if (buildSnapshot.limits.hitch_limit_lb > 0 && buildSnapshot.hitch_weight_lb > 0) {
    const hitchRatio = buildSnapshot.hitch_weight_lb / buildSnapshot.limits.hitch_limit_lb;
    if (hitchRatio > 1.0) {
      weightScore += WEIGHT_HITCH_OVER_SCORE;
      weightReasons.push({
        code: 'rear_bias',
        label: 'Hitch Overweight',
        value: Math.round(hitchRatio * 100),
        unit: '%',
        detail: `${buildSnapshot.hitch_weight_lb} lb / ${buildSnapshot.limits.hitch_limit_lb} lb limit`,
      });
    } else if (hitchRatio > 0.8) {
      weightScore += WEIGHT_HITCH_NEAR_SCORE;
      weightReasons.push({
        code: 'hitch_near_limit',
        label: 'Hitch Near Limit',
        value: Math.round(hitchRatio * 100),
        unit: '%',
        detail: `${buildSnapshot.hitch_weight_lb} lb / ${buildSnapshot.limits.hitch_limit_lb} lb limit`,
      });
    }
  }

  // Iterate through points in groups
  for (let i = 0; i < points.length - 1; i += groupSize) {
    const startPtIdx = i;
    const endPtIdx = Math.min(i + groupSize, points.length - 1);

    const startPt = points[startPtIdx];
    const endPt = points[endPtIdx];

    // Compute segment distance
    let segDistM = 0;
    for (let j = startPtIdx; j < endPtIdx; j++) {
      segDistM += haversineMeters(
        points[j].lat, points[j].lng,
        points[j + 1].lat, points[j + 1].lng
      );
    }

    cumulativeDistM += segDistM;

    // Compute grade
    let gradePct: number | null = null;
    if (startPt.ele_m != null && endPt.ele_m != null && segDistM > 0) {
      const eleChange = endPt.ele_m - startPt.ele_m;
      gradePct = (eleChange / segDistM) * 100;
    }

    // ── Score this segment ──────────────────────────────
    const reasons: SegmentReason[] = [...weightReasons];
    let score = weightScore;

    // Grade scoring (0–25)
    if (gradePct != null) {
      const absGrade = Math.abs(gradePct);
      if (absGrade >= GRADE_RED_PCT) {
        const gradeScore = clamp(15 + ((absGrade - GRADE_RED_PCT) / 10) * 10, 15, 25);
        score += gradeScore;
        reasons.push({
          code: 'grade_high',
          label: absGrade > 20 ? 'Extreme Grade' : 'Steep Grade',
          value: Math.round(absGrade * 10) / 10,
          unit: '%',
          detail: gradePct > 0 ? 'Uphill' : 'Downhill',
        });
      } else if (absGrade >= GRADE_YELLOW_PCT) {
        const gradeScore = clamp(5 + ((absGrade - GRADE_YELLOW_PCT) / (GRADE_RED_PCT - GRADE_YELLOW_PCT)) * 10, 5, 15);
        score += gradeScore;
        reasons.push({
          code: 'grade_moderate',
          label: 'Moderate Grade',
          value: Math.round(absGrade * 10) / 10,
          unit: '%',
          detail: gradePct > 0 ? 'Uphill' : 'Downhill',
        });
      }
    }

    // Range buffer scoring (0–20)
    if (buildSnapshot.estimated_range_miles > 0) {
      const totalRouteMiles = metersToMiles(cumulativeDistM);
      const rangeRemaining = buildSnapshot.estimated_range_miles - totalRouteMiles;
      const rangeRemainingPct = rangeRemaining / buildSnapshot.estimated_range_miles;

      if (rangeRemainingPct <= 0) {
        score += 20;
        reasons.push({
          code: 'low_range_buffer',
          label: 'Range Exceeded',
          value: Math.round(totalRouteMiles * 10) / 10,
          unit: 'mi',
          detail: `${Math.round(totalRouteMiles)} mi used of ${buildSnapshot.estimated_range_miles} mi range`,
        });
      } else if (rangeRemainingPct < RANGE_RED_BUFFER) {
        score += 15;
        reasons.push({
          code: 'low_range_buffer',
          label: 'Critical Range',
          value: Math.round(rangeRemainingPct * 100),
          unit: '%',
          detail: `${Math.round(rangeRemaining)} mi remaining`,
        });
      } else if (rangeRemainingPct < RANGE_YELLOW_BUFFER) {
        score += 8;
        reasons.push({
          code: 'low_range_buffer',
          label: 'Low Range Buffer',
          value: Math.round(rangeRemainingPct * 100),
          unit: '%',
          detail: `${Math.round(rangeRemaining)} mi remaining`,
        });
      }
    }

    // Clamp base score (before remoteness) to 0–60
    score = clamp(score, 0, 60);

    const midLat = (startPt.lat + endPt.lat) / 2;
    const midLng = (startPt.lng + endPt.lng) / 2;

    const segment: RunSegment = {
      id: generateId(),
      run_id: runId,
      seg_index: segIndex,
      start_idx: startPtIdx,
      end_idx: endPtIdx,
      start_lat: startPt.lat,
      start_lng: startPt.lng,
      end_lat: endPt.lat,
      end_lng: endPt.lng,
      distance_m: segDistM,
      grade_pct: gradePct,
      start_ele_m: startPt.ele_m,
      end_ele_m: endPt.ele_m,
      risk_score: score,
      risk_level: riskLevelFromScore(score),
      reasons,
      // Phase 2.6 (populated later)
      bailout_dist_m: null,
      remoteness_score: 0,
      bailout_id_nearest: null,
      remoteness_level: 'green',
      // Computed helpers
      cumulative_distance_m: cumulativeDistM,
      mid_lat: midLat,
      mid_lng: midLng,
    };

    segments.push(segment);
    segIndex++;
  }

  // Compute profile stats
  let maxRiskSeg: RunSegment | null = null;
  let maxScore = -1;
  let totalScore = 0;
  let redCount = 0, yellowCount = 0, greenCount = 0;
  let gradeWarnings = 0, rangeWarnings = 0, weightWarningCount = 0;

  for (const seg of segments) {
    totalScore += seg.risk_score;
    if (seg.risk_score > maxScore) {
      maxScore = seg.risk_score;
      maxRiskSeg = seg;
    }
    if (seg.risk_level === 'red') redCount++;
    else if (seg.risk_level === 'yellow') yellowCount++;
    else greenCount++;

    for (const r of seg.reasons) {
      if (r.code === 'grade_high' || r.code === 'grade_moderate') gradeWarnings++;
      if (r.code === 'low_range_buffer') rangeWarnings++;
      if (r.code === 'top_heavy' || r.code === 'rear_bias' || r.code === 'roof_near_limit' || r.code === 'hitch_near_limit') weightWarningCount++;
    }
  }

  const avgScore = segments.length > 0 ? totalScore / segments.length : 0;

  return {
    segments,
    overall_risk_score: Math.round(avgScore),
    overall_risk_level: riskLevelFromScore(avgScore),
    max_risk_segment: maxRiskSeg,
    total_red_segments: redCount,
    total_yellow_segments: yellowCount,
    total_green_segments: greenCount,
    grade_warnings: gradeWarnings,
    range_warnings: rangeWarnings,
    weight_warnings: weightWarningCount,
  };
}

/**
 * Build GeoJSON FeatureCollection of segments for heat map rendering.
 * Each feature is a LineString with risk_level and risk_score properties.
 */
export function segmentsToHeatMapGeoJSON(
  segments: RunSegment[],
  allPoints: RunPoint[]
): any {
  const features = segments.map(seg => {
    // Collect all points in this segment
    const segPoints: [number, number][] = [];
    for (let i = seg.start_idx; i <= seg.end_idx && i < allPoints.length; i++) {
      segPoints.push([allPoints[i].lng, allPoints[i].lat]);
    }

    return {
      type: 'Feature',
      properties: {
        seg_index: seg.seg_index,
        risk_score: seg.risk_score,
        risk_level: seg.risk_level,
        remoteness_level: seg.remoteness_level,
        remoteness_score: seg.remoteness_score,
        // Combined score for final rendering
        total_score: clamp(seg.risk_score + seg.remoteness_score, 0, 100),
        color: getSegmentColor(seg),
      },
      geometry: {
        type: 'LineString',
        coordinates: segPoints,
      },
    };
  });

  return {
    type: 'FeatureCollection',
    features,
  };
}

/**
 * Get the color for a segment based on its combined risk + remoteness score.
 */
export function getSegmentColor(seg: RunSegment): string {
  const totalScore = clamp(seg.risk_score + seg.remoteness_score, 0, 100);
  if (totalScore >= 60) return '#EF5350'; // red
  if (totalScore >= 30) return '#FFB300'; // yellow/amber
  return '#66BB6A'; // green
}

/**
 * Get the final risk level after combining base risk + remoteness.
 * Includes escalation rule: remote + any other warning = red.
 */
export function getFinalRiskLevel(seg: RunSegment): RunHealthLevel {
  const totalScore = clamp(seg.risk_score + seg.remoteness_score, 0, 100);

  // Escalation: if remote (red) AND has any other warning, force red
  if (seg.remoteness_level === 'red') {
    const hasOtherWarning = seg.reasons.some(r =>
      r.code === 'grade_high' || r.code === 'grade_moderate' ||
      r.code === 'low_range_buffer' ||
      r.code === 'top_heavy' || r.code === 'rear_bias'
    );
    if (hasOtherWarning) return 'red';
  }

  if (totalScore >= 60) return 'red';
  if (totalScore >= 30) return 'yellow';
  return 'green';
}

/**
 * Get human-readable summary of a segment's risk reasons.
 */
export function getSegmentReasonsSummary(seg: RunSegment): string[] {
  const summaries: string[] = [];
  for (const r of seg.reasons) {
    if (r.value != null && r.unit) {
      summaries.push(`${r.label}: ${r.value}${r.unit}`);
    } else {
      summaries.push(r.label);
    }
  }
  // Add remoteness if present
  if (seg.bailout_dist_m != null) {
    const miles = metersToMiles(seg.bailout_dist_m);
    summaries.push(`Nearest bailout: ${miles.toFixed(1)} mi`);
  }
  return summaries;
}

