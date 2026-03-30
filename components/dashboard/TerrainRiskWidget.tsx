/**
 * ECS Terrain Risk Prediction Widget
 *
 * Dashboard widget for the Terrain Risk Prediction Engine.
 *
 * Three display modes:
 *   1. TerrainRiskCompact — 3-cell compact for grid (Level / Score / Ahead)
 *   2. TerrainRiskCard — full card with risk level, descriptor, dominant factor
 *   3. TerrainRiskDetailView — expanded scrollable detail with all sub-risks,
 *      vehicle capability, route-ahead forecast, and advisories
 *
 * Data sources:
 *   - terrainRiskPredictionEngine (pure functions)
 *   - terrainProfile (from expedition or default)
 *   - stabilityEngine (CG data)
 *   - vehicleWeightEngine (load bias)
 *   - accelerometer (roll/pitch)
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  buildVehicleCapabilityProfile,
  computeTerrainRiskAssessment,
  classifyTerrainRiskLevel,
  getTerrainRiskColor,
  getTerrainRiskLabel,
  getTerrainRiskIcon,
  smoothScore,
  type VehicleCapabilityInput,
  type TerrainRiskInput,
} from '../../lib/terrainRiskPredictionEngine';
import type {
  TerrainRiskLevel,
  TerrainRiskAssessment,
  SubRiskFactor,
  VehicleCapabilityProfile,
  RouteAheadRiskForecast,
  TerrainRiskAdvisory,
} from '../../lib/terrainRiskTypes';
import { DEFAULT_TERRAIN_PROFILE } from '../../lib/terrainProfile';
import type { TerrainProfile } from '../../lib/terrainProfile';

// ═══════════════════════════════════════════════════════════
// SHARED HOOKS & DATA
// ═══════════════════════════════════════════════════════════

function useTerrainRiskData(): TerrainRiskAssessment {
  const [assessment, setAssessment] = useState<TerrainRiskAssessment>(() => {
    const profile = buildVehicleCapabilityProfile({});
    return computeTerrainRiskAssessment({
      vehicleProfile: profile,
      terrainProfile: DEFAULT_TERRAIN_PROFILE,
      rollDeg: 0,
      pitchDeg: 0,
      hasSensorData: false,
    });
  });

  // Recompute periodically (simulated — in production, driven by store subscriptions)
  useEffect(() => {
    const interval = setInterval(() => {
      const profile = buildVehicleCapabilityProfile({});
      const result = computeTerrainRiskAssessment({
        vehicleProfile: profile,
        terrainProfile: DEFAULT_TERRAIN_PROFILE,
        rollDeg: 0,
        pitchDeg: 0,
        hasSensorData: false,
      });
      setAssessment(result);
    }, 15000);

    return () => clearInterval(interval);
  }, []);

  return assessment;
}

// ═══════════════════════════════════════════════════════════
// COMPACT MODE (3-cell grid)
// ═══════════════════════════════════════════════════════════

export function TerrainRiskCompact() {
  const data = useTerrainRiskData();
  const color = getTerrainRiskColor(data.riskLevel);
  const label = getTerrainRiskLabel(data.riskLevel);

  const forecastLabel = data.forecast?.available
    ? getTerrainRiskLabel(data.forecast.peakRiskLevel)
    : '\u2014';
  const forecastColor = data.forecast?.available
    ? getTerrainRiskColor(data.forecast.peakRiskLevel)
    : TACTICAL.textMuted;

  return (
    <View style={cs.row}>
      <View style={cs.cell}>
        <Text style={cs.label}>TERRAIN</Text>
        <Text style={[cs.value, { color, fontSize: 9 }]}>{label}</Text>
      </View>
      <View style={cs.cell}>
        <Text style={cs.label}>SCORE</Text>
        <Text style={[cs.value, { color }]}>{data.riskScore}</Text>
      </View>
      <View style={cs.cell}>
        <Text style={cs.label}>AHEAD</Text>
        <Text style={[cs.value, { color: forecastColor, fontSize: 9 }]}>{forecastLabel}</Text>
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cell: { flex: 1, alignItems: 'center' },
  label: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 1 },
  value: { fontSize: 12, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text },
});

// ═══════════════════════════════════════════════════════════
// CARD MODE (full widget card)
// ═══════════════════════════════════════════════════════════

export function TerrainRiskCard() {
  const data = useTerrainRiskData();
  const color = getTerrainRiskColor(data.riskLevel);
  const label = getTerrainRiskLabel(data.riskLevel);
  const icon = getTerrainRiskIcon(data.riskLevel);

  return (
    <View style={ws.body}>
      {/* Status badge */}
      <View style={[ws.badge, { backgroundColor: color + '15' }]}>
        <Ionicons name={icon as any} size={10} color={color} />
        <Text style={[ws.badgeText, { color }]}>{label}</Text>
        <Text style={ws.scoreChip}>{data.riskScore}</Text>
      </View>

      {/* Descriptor */}
      <Text style={ws.descriptor} numberOfLines={1}>{data.descriptor}</Text>

      {/* Dominant factor */}
      {data.dominantFactor !== 'none' && (
        <View style={ws.factorRow}>
          <Text style={ws.factorLabel}>PRIMARY</Text>
          <Text style={ws.factorValue}>
            {formatSubRiskLabel(data.dominantFactor)}
          </Text>
        </View>
      )}

      {/* Forecast indicator */}
      {data.forecast?.available && data.forecast.peakRiskScore > 25 && (
        <View style={ws.forecastRow}>
          <Ionicons name="arrow-forward-outline" size={9} color={TACTICAL.textMuted} />
          <Text style={ws.forecastText} numberOfLines={1}>
            {data.forecast.summary}
          </Text>
        </View>
      )}
    </View>
  );
}

const ws = StyleSheet.create({
  body: { gap: 3 },
  badge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  scoreChip: {
    fontSize: 9, fontWeight: '900', fontFamily: 'Courier',
    color: TACTICAL.textMuted, marginLeft: 'auto',
  },
  descriptor: {
    fontSize: 10, fontWeight: '600', color: TACTICAL.text,
    letterSpacing: 0.3, marginTop: 2,
  },
  factorRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 2,
  },
  factorLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  factorValue: { fontSize: 9, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  forecastRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginTop: 2, opacity: 0.8,
  },
  forecastText: { fontSize: 8, fontWeight: '600', color: TACTICAL.textMuted, flex: 1 },
});

// ═══════════════════════════════════════════════════════════
// DETAIL VIEW (expanded modal)
// ═══════════════════════════════════════════════════════════

export function TerrainRiskDetailView() {
  const data = useTerrainRiskData();
  const color = getTerrainRiskColor(data.riskLevel);
  const label = getTerrainRiskLabel(data.riskLevel);

  return (
    <ScrollView style={ds.container} showsVerticalScrollIndicator={false}>
      {/* ═══ RISK OVERVIEW ═══ */}
      <Text style={ds.section}>TERRAIN RISK ASSESSMENT</Text>

      {/* Large score display */}
      <View style={ds.scoreHeader}>
        <Text style={[ds.scoreBig, { color }]}>{data.riskScore}</Text>
        <View style={ds.scoreMeta}>
          <Text style={[ds.levelLabel, { color }]}>{label}</Text>
          <Text style={ds.descriptorText}>{data.descriptor}</Text>
        </View>
      </View>

      {/* Score bar */}
      <View style={ds.scoreBarOuter}>
        <View style={[ds.scoreBarFill, {
          width: `${Math.min(100, data.riskScore)}%`,
          backgroundColor: color,
        }]} />
        <View style={[ds.scoreMarker, { left: '20%' }]} />
        <View style={[ds.scoreMarker, { left: '45%' }]} />
        <View style={[ds.scoreMarker, { left: '70%' }]} />
      </View>
      <View style={ds.scoreLabels}>
        <Text style={[ds.scoreLabelText, { color: '#4CAF50' }]}>STABLE</Text>
        <Text style={[ds.scoreLabelText, { color: '#FFB74D' }]}>CAUTION</Text>
        <Text style={[ds.scoreLabelText, { color: '#E67E22' }]}>ELEVATED</Text>
        <Text style={[ds.scoreLabelText, { color: '#C0392B' }]}>HIGH</Text>
      </View>

      {/* ═══ ADVISORIES ═══ */}
      {data.advisories.length > 0 && (
        <>
          <View style={ds.divider} />
          <Text style={ds.section}>ADVISORIES</Text>
          {data.advisories.slice(0, 5).map((adv, i) => (
            <AdvisoryRow key={adv.id || i} advisory={adv} />
          ))}
        </>
      )}

      {/* ═══ SUB-RISK FACTORS ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>RISK FACTORS</Text>
      {data.subRisks
        .sort((a, b) => b.score - a.score)
        .map((sub, i) => (
          <SubRiskRow key={sub.category} factor={sub} />
        ))}

      {/* ═══ ATTITUDE CONTRIBUTION ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>ATTITUDE CONTRIBUTION</Text>
      <MetricRow label="ROLL" value={`${data.attitudeContribution.rollDeg.toFixed(1)}\u00B0`} />
      <MetricRow label="PITCH" value={`${data.attitudeContribution.pitchDeg.toFixed(1)}\u00B0`} />
      <MetricRow label="TILT" value={`${data.attitudeContribution.tiltDeg.toFixed(1)}\u00B0`} />
      <MetricRow
        label="STATUS"
        value={data.attitudeContribution.isActive ? 'ACTIVE' : 'INACTIVE'}
        color={data.attitudeContribution.isActive ? '#4CAF50' : TACTICAL.textMuted}
      />

      {/* ═══ VEHICLE CAPABILITY ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>VEHICLE CAPABILITY PROFILE</Text>
      <MetricRow label="CLASS" value={formatVehicleClass(data.vehicleProfile.vehicleClass)} />
      <MetricRow label="TIRES" value={formatTireCategory(data.vehicleProfile.tireCategory)} />
      <MetricRow label="SUSPENSION" value={formatSuspension(data.vehicleProfile.suspensionLevel)} />
      <MetricRow
        label="CAPABILITY"
        value={`${data.vehicleProfile.capabilityScore} / 100`}
        color={scoreColor(data.vehicleProfile.capabilityScore)}
      />
      <MetricRow
        label="STABILITY"
        value={`${data.vehicleProfile.stabilityScore} / 100`}
        color={scoreColor(data.vehicleProfile.stabilityScore)}
      />
      <MetricRow
        label="TRACTION"
        value={`${data.vehicleProfile.tractionScore} / 100`}
        color={scoreColor(data.vehicleProfile.tractionScore)}
      />
      {data.vehicleProfile.hasRoofLoad && (
        <MetricRow
          label="ROOF LOAD"
          value={`${data.vehicleProfile.roofLoadPercent}%`}
          color={data.vehicleProfile.roofLoadPercent > 40 ? '#EF5350' : '#FFB74D'}
        />
      )}
      <MetricRow label="GVWR UTIL" value={`${data.vehicleProfile.gvwrPercent}%`}
        color={data.vehicleProfile.gvwrPercent > 90 ? '#EF5350' : data.vehicleProfile.gvwrPercent > 75 ? '#FFB74D' : TACTICAL.text} />
      <MetricRow label="REAR BIAS" value={`${data.vehicleProfile.rearBiasPercent}%`} />
      {data.vehicleProfile.hasTrailer && (
        <MetricRow label="TRAILER" value="ATTACHED" color="#FFB74D" />
      )}

      {/* ═══ ROUTE-AHEAD FORECAST ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>ROUTE-AHEAD FORECAST</Text>
      {data.forecast?.available ? (
        <>
          <Text style={ds.forecastSummary}>{data.forecast.summary}</Text>
          <View style={ds.forecastDots}>
            {data.forecast.segments.map((seg, i) => {
              const segColor = getTerrainRiskColor(seg.riskLevel);
              return (
                <View key={i} style={ds.forecastDot}>
                  <View style={[ds.dot, { backgroundColor: segColor }]} />
                  <Text style={ds.dotLabel}>{seg.distanceMi}mi</Text>
                  <Text style={[ds.dotScore, { color: segColor }]}>{seg.riskScore}</Text>
                </View>
              );
            })}
          </View>
          {data.forecast.riskIncreasing && (
            <View style={ds.trendRow}>
              <Ionicons name="trending-up-outline" size={10} color="#E67E22" />
              <Text style={ds.trendText}>Risk increasing ahead</Text>
            </View>
          )}
        </>
      ) : (
        <Text style={ds.noDataText}>No route data available for forecast</Text>
      )}

      {/* ═══ RISK SCALE REFERENCE ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>RISK SCALE</Text>
      <MetricRow label="0\u201320" value="STABLE" color="#4CAF50" />
      <MetricRow label="21\u201345" value="CAUTION" color="#FFB74D" />
      <MetricRow label="46\u201370" value="ELEVATED" color="#E67E22" />
      <MetricRow label="71\u2013100" value="HIGH" color="#C0392B" />

      {/* ═══ ENGINE INFO ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>ENGINE</Text>
      <MetricRow label="VERSION" value="v1.0 (Prediction)" />
      <MetricRow label="FACTORS" value="7 weighted" />
      <MetricRow label="SMOOTHING" value="EMA 0.25" />
      <MetricRow label="HOLD TIME" value="30s downgrade" />
      <MetricRow label="ADVISORY COOLDOWN" value="5 min" />
      <MetricRow label="INTERVAL" value="~15s" />

      {/* Disclaimer */}
      <View style={ds.disclaimer}>
        <Text style={ds.disclaimerText}>
          Decision support only. Does not guarantee safety. Use judgment.
        </Text>
      </View>

      <View style={{ height: 24 }} />
    </ScrollView>
  );
}

// ── Sub-components ──

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={ds.metricRow}>
      <Text style={ds.metricLabel}>{label}</Text>
      <Text style={[ds.metricValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function SubRiskRow({ factor }: { factor: SubRiskFactor }) {
  const color = getTerrainRiskColor(factor.level);
  const pct = Math.min(100, factor.score);

  return (
    <View style={ds.subRiskRow}>
      <View style={ds.subRiskHeader}>
        <Text style={ds.subRiskLabel}>{formatSubRiskLabel(factor.category)}</Text>
        <Text style={[ds.subRiskScore, { color }]}>{factor.score}</Text>
      </View>
      <View style={ds.subRiskBarOuter}>
        <View style={[ds.subRiskBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={ds.subRiskReason}>{factor.reason}</Text>
    </View>
  );
}

function AdvisoryRow({ advisory }: { advisory: TerrainRiskAdvisory }) {
  const severityColors: Record<string, string> = {
    info: '#4FC3F7', caution: '#FFB74D', warning: '#E67E22', critical: '#EF5350',
  };
  const severityIcons: Record<string, string> = {
    info: 'information-circle-outline', caution: 'alert-outline',
    warning: 'warning-outline', critical: 'alert-circle-outline',
  };
  const color = severityColors[advisory.severity] || TACTICAL.textMuted;
  const icon = severityIcons[advisory.severity] || 'information-circle-outline';

  return (
    <View style={[ds.advisoryRow, { borderLeftColor: color }]}>
      <Ionicons name={icon as any} size={12} color={color} />
      <Text style={[ds.advisoryText, { color }]}>{advisory.message}</Text>
    </View>
  );
}

// ── Format helpers ──

function formatSubRiskLabel(cat: string): string {
  const labels: Record<string, string> = {
    side_slope: 'SIDE SLOPE',
    steep_grade: 'STEEP GRADE',
    clearance: 'CLEARANCE',
    load_bias: 'LOAD BIAS',
    traction: 'TRACTION',
    articulation: 'STABILITY',
  };
  return labels[cat] || cat.toUpperCase();
}

function formatVehicleClass(cls: string): string {
  const labels: Record<string, string> = {
    stock_suv: 'STOCK SUV', stock_truck: 'STOCK TRUCK',
    modified_4x4: 'MODIFIED 4X4', built_overland: 'BUILT OVERLAND',
    heavy_overland: 'HEAVY OVERLAND', unknown: 'UNKNOWN',
  };
  return labels[cls] || cls.toUpperCase();
}

function formatTireCategory(cat: string): string {
  const labels: Record<string, string> = {
    stock: 'STOCK', plus_one: '+1 SIZE', plus_two: '+2 SIZE',
    oversize: 'OVERSIZE', unknown: 'UNKNOWN',
  };
  return labels[cat] || cat.toUpperCase();
}

function formatSuspension(level: string): string {
  const labels: Record<string, string> = {
    stock: 'STOCK', leveled: 'LEVELED', mild_lift: 'MILD LIFT',
    moderate_lift: 'MODERATE LIFT', heavy_lift: 'HEAVY LIFT', unknown: 'UNKNOWN',
  };
  return labels[level] || level.toUpperCase();
}

function scoreColor(score: number): string {
  if (score >= 70) return '#4CAF50';
  if (score >= 45) return '#FFB74D';
  return '#EF5350';
}

// ── Detail Styles ──

const ds = StyleSheet.create({
  container: { flex: 1 },
  section: {
    fontSize: 10, fontWeight: '800', color: TACTICAL.amber,
    letterSpacing: 1.5, marginTop: 8, marginBottom: 4,
  },
  divider: { height: 1, backgroundColor: TACTICAL.border, marginVertical: 8 },

  // Score header
  scoreHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    marginBottom: 8,
  },
  scoreBig: {
    fontSize: 42, fontWeight: '900', fontFamily: 'Courier',
  },
  scoreMeta: { flex: 1 },
  levelLabel: {
    fontSize: 14, fontWeight: '900', letterSpacing: 2,
  },
  descriptorText: {
    fontSize: 10, fontWeight: '600', color: TACTICAL.textMuted,
    marginTop: 2,
  },

  // Score bar
  scoreBarOuter: {
    height: 8, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4, overflow: 'hidden', position: 'relative',
  },
  scoreBarFill: { height: '100%', borderRadius: 4 },
  scoreMarker: {
    position: 'absolute', top: 0, bottom: 0, width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  scoreLabels: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 3, paddingHorizontal: 2,
  },
  scoreLabelText: { fontSize: 7, fontWeight: '700', letterSpacing: 0.5 },

  // Metrics
  metricRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingVertical: 3,
  },
  metricLabel: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  metricValue: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },

  // Sub-risk factors
  subRiskRow: { marginBottom: 8 },
  subRiskHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 3,
  },
  subRiskLabel: { fontSize: 9, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },
  subRiskScore: { fontSize: 11, fontWeight: '900', fontFamily: 'Courier' },
  subRiskBarOuter: {
    height: 4, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2, overflow: 'hidden', marginBottom: 2,
  },
  subRiskBarFill: { height: '100%', borderRadius: 2 },
  subRiskReason: { fontSize: 8, fontWeight: '600', color: TACTICAL.textMuted, fontStyle: 'italic' },

  // Advisories
  advisoryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 5, paddingHorizontal: 8, marginBottom: 4,
    borderLeftWidth: 3, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  advisoryText: { fontSize: 10, fontWeight: '700', flex: 1 },

  // Forecast
  forecastSummary: {
    fontSize: 10, fontWeight: '600', color: TACTICAL.text,
    marginBottom: 8,
  },
  forecastDots: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 8, marginBottom: 6,
  },
  forecastDot: { alignItems: 'center', gap: 3 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  dotLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  dotScore: { fontSize: 9, fontWeight: '900', fontFamily: 'Courier' },
  trendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
    backgroundColor: 'rgba(230,126,34,0.08)',
  },
  trendText: { fontSize: 9, fontWeight: '700', color: '#E67E22' },

  noDataText: { fontSize: 10, fontWeight: '600', color: TACTICAL.textMuted, fontStyle: 'italic' },

  // Disclaimer
  disclaimer: {
    marginTop: 12, paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  disclaimerText: {
    fontSize: 8, fontWeight: '600', color: TACTICAL.textMuted,
    fontStyle: 'italic', textAlign: 'center', letterSpacing: 0.3,
  },
});



