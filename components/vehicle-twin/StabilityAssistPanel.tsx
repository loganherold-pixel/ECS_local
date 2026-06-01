/**
 * StabilityAssistPanel — Actionable stability recommendations
 *
 * Generates 2–4 short recommended actions based on existing Vehicle Twin
 * physics values: roll/pitch, stability status, tilt margin, CG bias,
 * axle distribution, and zone weights.
 *
 * Mobile-optimized: responsive padding, compact text sizing.
 * Display-only logic — no data mutations, no background tasks.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import type { StabilityResult } from './StabilityStrip';
import type { VehicleTwinData } from '../../lib/useVehicleTwinData';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_SMALL = SCREEN_W < 380;

/* ── Constants ──────────────────────────────────────────── */
const MAX_RECOMMENDATIONS = 4;

const STATUS_COLORS: Record<string, string> = {
  SAFE: '#66BB6A',
  CAUTION: '#FFB74D',
  'HIGH RISK': '#EF5350',
};

const STATUS_ICONS: Record<string, string> = {
  SAFE: 'shield-checkmark-outline',
  CAUTION: 'warning-outline',
  'HIGH RISK': 'alert-circle-outline',
};

/* ── Recommendation engine ──────────────────────────────── */

interface RecommendationInput {
  stability: StabilityResult | null;
  twin: VehicleTwinData;
}

interface Recommendation {
  id: string;
  text: string;
  severity: 'info' | 'warn' | 'critical';
}

function generateRecommendations(input: RecommendationInput): Recommendation[] {
  const { stability, twin } = input;
  const recs: Recommendation[] = [];

  if (!twin.hasVehicle || !twin.hasSpecs) {
    recs.push({
      id: 'no-vehicle',
      text: 'Select a vehicle and loadout to receive stability recommendations.',
      severity: 'info',
    });
    return recs;
  }

  if (!stability) {
    recs.push({
      id: 'no-sensor',
      text: 'Attitude sensor data unavailable. Enable accelerometer for live stability analysis.',
      severity: 'info',
    });
    return recs;
  }

  const { tiltMargin, status } = stability;

  const roofW = twin.roofWeightLbs ?? 0;
  const cabW = twin.cabWeightLbs ?? 0;
  const bedW = twin.bedWeightLbs ?? 0;
  const totalZoneWeight = roofW + cabW + bedW;
  const roofPct = totalZoneWeight > 0 ? (roofW / totalZoneWeight) * 100 : 0;
  const roofHeavy = roofPct > 15;

  const frontPct = twin.frontAxlePercent;
  const rearPct = twin.rearAxlePercent;
  const rearBias = frontPct != null ? 50 - frontPct : 0;
  const frontHeavy = frontPct != null && frontPct > 55;
  const rearHeavy = rearBias > 5;

  const leftW = twin.leftDrawerLbs ?? 0;
  const rightW = twin.rightDrawerLbs ?? 0;
  const drawerTotal = leftW + rightW;
  let rightShiftPct = 0;
  if (drawerTotal > 0) {
    rightShiftPct = ((rightW / drawerTotal) - 0.5) * 100;
  }
  const lateralImbalance = Math.abs(rightShiftPct) >= 3;

  if (status === 'HIGH RISK' || tiltMargin < 8) {
    recs.push({
      id: 'hr-speed',
      text: 'Reduce speed and avoid off-camber lines.',
      severity: 'critical',
    });
    recs.push({
      id: 'hr-rebalance',
      text: 'Stop and rebalance load to lower center of gravity.',
      severity: 'critical',
    });
    if (roofHeavy) {
      recs.push({
        id: 'hr-roof',
        text: 'Move heavy roof items to bed storage.',
        severity: 'critical',
      });
    }
  }

  if (status === 'CAUTION' || (tiltMargin >= 8 && tiltMargin <= 15)) {
    if (status !== 'HIGH RISK') {
      recs.push({
        id: 'ca-pace',
        text: 'Maintain steady pace; avoid sudden steering inputs.',
        severity: 'warn',
      });
    }
    if (rearHeavy && !recs.find(r => r.id === 'hr-rebalance')) {
      recs.push({
        id: 'ca-rear-shift',
        text: 'Shift dense gear forward (rear containers to bed/cab).',
        severity: 'warn',
      });
    }
    if (roofHeavy && !recs.find(r => r.id === 'hr-roof')) {
      recs.push({
        id: 'ca-roof',
        text: 'Lower roof load to improve stability margin.',
        severity: 'warn',
      });
    }
  }

  if (lateralImbalance) {
    recs.push({
      id: 'lateral',
      text: 'Balance left/right storage (swap drawer-heavy items).',
      severity: recs.length > 0 && recs[0].severity === 'critical' ? 'critical' : 'warn',
    });
  }

  if (frontHeavy && !recs.find(r => r.id.includes('rear-shift'))) {
    recs.push({
      id: 'front-heavy',
      text: 'Move heavy items rearward to improve balance (cab to bed).',
      severity: 'warn',
    });
  } else if (rearHeavy && !recs.find(r => r.id === 'ca-rear-shift') && !recs.find(r => r.id === 'hr-rebalance')) {
    recs.push({
      id: 'rear-heavy',
      text: 'Move heavy items forward (rear to bed/cab) to reduce rear bias.',
      severity: 'warn',
    });
  }

  if (recs.length === 0 && status === 'SAFE') {
    recs.push({
      id: 'safe-ok',
      text: 'Vehicle balance is within safe operating parameters.',
      severity: 'info',
    });
    recs.push({
      id: 'safe-monitor',
      text: 'Continue monitoring on steep grades or off-camber terrain.',
      severity: 'info',
    });
  }

  const seen = new Set<string>();
  const deduped: Recommendation[] = [];
  for (const rec of recs) {
    if (!seen.has(rec.id) && deduped.length < MAX_RECOMMENDATIONS) {
      seen.add(rec.id);
      deduped.push(rec);
    }
  }

  return deduped;
}

/* ── Summary line builder ───────────────────────────────── */
function buildSummaryLine(stability: StabilityResult | null, twin: VehicleTwinData): string {
  const parts: string[] = [];

  if (stability) {
    parts.push(`Margin: ${stability.tiltMargin.toFixed(1)}°`);
  }

  const frontPct = twin.frontAxlePercent;
  if (frontPct != null) {
    const bias = Math.abs(frontPct - 50);
    const dir = frontPct > 50 ? 'front' : frontPct < 50 ? 'rear' : '';
    if (bias > 0.5) {
      parts.push(`${dir} bias: +${bias.toFixed(1)}%`);
    }
  }

  const roofW = twin.roofWeightLbs;
  if (roofW != null && roofW > 0) {
    parts.push(`Roof: ${Math.round(roofW)} lb`);
  }

  if (parts.length === 0) return '--';
  return parts.join(' \u2022 ');
}

/* ── Severity styling ───────────────────────────────────── */
const SEVERITY_COLORS = {
  info: ECS.muted,
  warn: '#FFB74D',
  critical: '#EF5350',
};

const SEVERITY_ICONS: Record<string, string> = {
  info: 'information-circle-outline',
  warn: 'alert-outline',
  critical: 'close-circle-outline',
};

/* ── Component ──────────────────────────────────────────── */

interface StabilityAssistPanelProps {
  stability: StabilityResult | null;
  twin: VehicleTwinData;
}

export function StabilityAssistPanel({ stability, twin }: StabilityAssistPanelProps) {
  const recommendations = useMemo(
    () => generateRecommendations({ stability, twin }),
    [stability, twin],
  );

  const summaryLine = useMemo(
    () => buildSummaryLine(stability, twin),
    [stability, twin],
  );

  const statusLabel = stability?.status ?? 'NO DATA';
  const statusColor = stability ? STATUS_COLORS[stability.status] ?? ECS.muted : ECS.muted;
  const statusIcon = stability ? STATUS_ICONS[stability.status] ?? 'help-outline' : 'help-outline';

  return (
    <View style={s.container}>
      {/* ── Header ────────────────────────────────────── */}
      <View style={s.header}>
        <View style={s.headerLeft}>
          <Ionicons name="compass-outline" size={IS_SMALL ? 11 : 13} color={ECS.accent} />
          <Text style={s.headerTitle} numberOfLines={1}>STABILITY ASSIST</Text>
        </View>
        <View style={[s.statusPill, { borderColor: statusColor }]}>
          <Ionicons name={statusIcon as any} size={9} color={statusColor} />
          <Text style={[s.statusPillText, { color: statusColor }]} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {/* ── Gold rule ─────────────────────────────────── */}
      <View style={s.goldRule} />

      {/* ── Summary line ──────────────────────────────── */}
      <Text style={s.summaryLine} numberOfLines={2}>{summaryLine}</Text>

      {/* ── Recommendations ───────────────────────────── */}
      <View style={s.recList}>
        {recommendations.map((rec) => {
          const sevColor = SEVERITY_COLORS[rec.severity];
          const sevIcon = SEVERITY_ICONS[rec.severity];
          return (
            <View key={rec.id} style={s.recRow}>
              <View style={s.recBullet}>
                <View style={[s.recBulletLine, { backgroundColor: sevColor }]} />
                <Ionicons name={sevIcon as any} size={11} color={sevColor} />
              </View>
              <Text
                style={[s.recText, rec.severity === 'critical' && { color: '#EF5350' }]}
                numberOfLines={3}
              >
                {rec.text}
              </Text>
            </View>
          );
        })}
      </View>

      {/* ── Footer accent ─────────────────────────────── */}
      <View style={s.footerAccent} />
    </View>
  );
}

/* ── Styles ──────────────────────────────────────────────── */
const s = StyleSheet.create({
  container: {
    backgroundColor: ECS.bgPanel,
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: ECS.radius,
    overflow: 'hidden',
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: IS_SMALL ? 10 : 14,
    paddingTop: IS_SMALL ? 10 : 12,
    paddingBottom: IS_SMALL ? 6 : 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  headerTitle: {
    fontSize: IS_SMALL ? 9 : 10,
    fontWeight: '700',
    letterSpacing: IS_SMALL ? 3 : 4,
    color: ECS.accent,
  },

  /* Status pill */
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  statusPillText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  /* Gold rule */
  goldRule: {
    height: GOLD_RAIL.sectionWidth,
    backgroundColor: GOLD_RAIL.section,
    marginHorizontal: IS_SMALL ? 10 : 14,
  },

  /* Summary */
  summaryLine: {
    fontSize: IS_SMALL ? 9 : 10,
    fontWeight: '500',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    color: ECS.muted,
    paddingHorizontal: IS_SMALL ? 10 : 14,
    paddingTop: 8,
    paddingBottom: 4,
  },

  /* Recommendation list */
  recList: {
    paddingHorizontal: IS_SMALL ? 10 : 14,
    paddingBottom: 12,
    gap: 0,
  },

  /* Recommendation row */
  recRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 6,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: GOLD_RAIL.internal,
    gap: 8,
  },
  recBullet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 1,
  },
  recBulletLine: {
    width: 3,
    height: 12,
    borderRadius: 1.5,
    opacity: 0.6,
  },
  recText: {
    flex: 1,
    fontSize: IS_SMALL ? 10 : 11,
    fontWeight: '500',
    letterSpacing: 0.3,
    lineHeight: IS_SMALL ? 14 : 16,
    color: ECS.text,
  },

  /* Footer accent */
  footerAccent: {
    height: 2,
    backgroundColor: GOLD_RAIL.internal,
  },
});



