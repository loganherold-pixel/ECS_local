/**
 * ═══════════════════════════════════════════════════════════
 * ECS EXPEDITION RISK WIDGET — Phase 5
 * ═══════════════════════════════════════════════════════════
 *
 * Dashboard widget for the unified Expedition Risk Engine.
 * Provides compact, card, and detail views.
 *
 * Features:
 *   - Current risk level with score
 *   - Forward risk forecast (route-ahead prediction)
 *   - Risk category breakdown (7 categories)
 *   - Intelligence advisories
 *   - Sub-score visualization
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { useExpeditionRisk } from '../../lib/useExpeditionRisk';
import type {
  RiskEvaluation,
  RiskInputSnapshot,
  OperationalStatus,
  ExpeditionRiskLevel,
  RiskCategoryScore,
  ForwardRiskForecast,
  ForwardRiskSegment,
  ExpeditionRiskAdvisory,
  ExpeditionRiskOutput,
  RiskCategory,
} from '../../lib/expeditionRiskTypes';
import {
  EXPEDITION_RISK_LEVEL_MAP,
  EXPEDITION_RISK_LEVEL_COLORS,
  EXPEDITION_RISK_DESCRIPTORS,
  OPERATIONAL_STATUS_DISPLAY,
  RISK_FACTOR_LABELS,
} from '../../lib/expeditionRiskTypes';


// ═══════════════════════════════════════════════════════════
// DERIVED OUTPUT BUILDER
// ═══════════════════════════════════════════════════════════

function buildRiskCategories(
  eval_: RiskEvaluation | null,
  snapshot: RiskInputSnapshot | null,
): RiskCategoryScore[] {
  if (!eval_) return [];
  const cats: RiskCategoryScore[] = [
    {
      category: 'vehicle',
      label: 'Vehicle',
      score: Math.round(100 - eval_.capability_score),
      contributing: eval_.capability_score < 60,
      description: eval_.capability_score >= 60 ? 'Vehicle well-configured' : 'Vehicle capability concern',
    },
    {
      category: 'terrain',
      label: 'Terrain',
      score: eval_.route_difficulty_score,
      contributing: eval_.route_difficulty_score > 40,
      description: eval_.route_difficulty_score > 60 ? 'Challenging terrain' : eval_.route_difficulty_score > 30 ? 'Moderate terrain' : 'Easy terrain',
    },
    {
      category: 'resource',
      label: 'Resources',
      score: Math.round(100 - eval_.resource_readiness),
      contributing: eval_.resource_readiness < 60,
      description: eval_.resource_readiness >= 60 ? 'Resources adequate' : 'Resource concern',
    },
    {
      category: 'environmental',
      label: 'Environment',
      score: Math.round((eval_.isolation_risk + eval_.connectivity_risk) / 2),
      contributing: eval_.isolation_risk > 40 || eval_.connectivity_risk > 40,
      description: eval_.isolation_risk > 60 ? 'Remote environment' : 'Accessible environment',
    },
    {
      category: 'isolation',
      label: 'Isolation',
      score: eval_.isolation_risk,
      contributing: eval_.isolation_risk > 40,
      description: snapshot?.remoteness?.distance_from_services_mi != null
        ? `~${snapshot.remoteness.distance_from_services_mi} mi from services`
        : eval_.isolation_risk > 50 ? 'Significant isolation' : 'Moderate isolation',
    },
    {
      category: 'connectivity',
      label: 'Connectivity',
      score: eval_.connectivity_risk,
      contributing: eval_.connectivity_risk > 30,
      description: eval_.connectivity_risk <= 20 ? 'Connected' : eval_.connectivity_risk <= 50 ? 'Limited connectivity' : 'Poor connectivity',
    },
    {
      category: 'time_completion',
      label: 'Route Balance',
      score: Math.round(100 - eval_.resource_route_balance),
      contributing: eval_.resource_route_balance < 60,
      description: eval_.resource_route_balance >= 70 ? 'Route well-matched' : 'Route may strain resources',
    },
  ];
  return cats.sort((a, b) => b.score - a.score);
}

function buildForwardForecast(
  eval_: RiskEvaluation | null,
  snapshot: RiskInputSnapshot | null,
): ForwardRiskForecast {
  if (!eval_ || !snapshot?.route_difficulty?.has_active_route) {
    return { available: false, segments: [], trend: 'stable', trend_description: 'No route data', computed_at: new Date().toISOString() };
  }

  const baseScore = eval_.risk_score;
  const remScore = snapshot.remoteness?.remoteness_score ?? 0;
  const routeChallenge = snapshot.route_difficulty?.route_challenge_score ?? 0;
  const fuelPct = snapshot.expedition_resources?.fuel_percent ?? 100;
  const connRisk = eval_.connectivity_risk;

  // Predict risk at 4 distance intervals
  const distances = [5, 10, 15, 20];
  const segments: ForwardRiskSegment[] = distances.map((dist) => {
    // Heuristic: risk tends to increase with distance from services
    const distFactor = dist / 20; // 0.25 to 1.0
    const remotenessDrift = remScore > 40 ? distFactor * 8 : distFactor * 3;
    const routeDrift = routeChallenge > 50 ? distFactor * 6 : distFactor * 2;
    const fuelDrift = fuelPct < 30 ? distFactor * 10 : fuelPct < 50 ? distFactor * 4 : 0;
    const connDrift = connRisk > 50 ? distFactor * 5 : 0;

    const predicted = Math.min(100, Math.max(0, Math.round(
      baseScore + remotenessDrift + routeDrift + fuelDrift + connDrift
    )));

    const level: ExpeditionRiskLevel =
      predicted <= 25 ? 'Low' :
      predicted <= 50 ? 'Moderate' :
      predicted <= 75 ? 'Elevated' : 'High';

    let concern = 'Stable conditions';
    if (fuelDrift > routeDrift && fuelDrift > remotenessDrift) concern = 'Fuel reserves declining';
    else if (remotenessDrift > routeDrift) concern = 'Increasing remoteness';
    else if (routeDrift > 3) concern = 'Route difficulty ahead';
    else if (connDrift > 3) concern = 'Connectivity may drop';

    return {
      distance_mi: dist,
      label: `${dist} mi`,
      predicted_score: predicted,
      predicted_level: level,
      primary_concern: concern,
      color: EXPEDITION_RISK_LEVEL_COLORS[level],
    };
  });

  const lastScore = segments[segments.length - 1]?.predicted_score ?? baseScore;
  const delta = lastScore - baseScore;
  const trend: 'improving' | 'stable' | 'worsening' =
    delta > 5 ? 'worsening' : delta < -5 ? 'improving' : 'stable';

  const trendDesc =
    trend === 'worsening' ? 'Risk increasing ahead' :
    trend === 'improving' ? 'Conditions improving ahead' :
    'Conditions stable ahead';

  return { available: true, segments, trend, trend_description: trendDesc, computed_at: new Date().toISOString() };
}

function buildAdvisories(
  eval_: RiskEvaluation | null,
  snapshot: RiskInputSnapshot | null,
  forecast: ForwardRiskForecast,
): ExpeditionRiskAdvisory[] {
  if (!eval_) return [];
  const advisories: ExpeditionRiskAdvisory[] = [];
  const now = new Date().toISOString();

  // Isolation advisory
  if (eval_.isolation_risk > 60) {
    advisories.push({
      key: 'isolation-high', severity: 'caution', category: 'isolation',
      message: 'Remote terrain — limited support access',
      color: '#E67E22', timestamp: now,
    });
  } else if (eval_.isolation_risk > 40) {
    advisories.push({
      key: 'isolation-mod', severity: 'watch', category: 'isolation',
      message: 'Increasing distance from services',
      color: '#FFB300', timestamp: now,
    });
  }

  // Resource advisories
  const res = snapshot?.expedition_resources;
  if (res?.fuel_low && res?.water_low) {
    advisories.push({
      key: 'resources-multi', severity: 'warning', category: 'resource',
      message: 'Multiple resources running low',
      color: '#EF5350', timestamp: now,
    });
  } else if (res?.fuel_low) {
    advisories.push({
      key: 'fuel-low', severity: 'caution', category: 'resource',
      message: 'Fuel reserves below 25%',
      color: '#E67E22', timestamp: now,
    });
  } else if (res?.water_low) {
    advisories.push({
      key: 'water-low', severity: 'caution', category: 'resource',
      message: 'Water reserves low',
      color: '#E67E22', timestamp: now,
    });
  }

  // Connectivity advisory
  if (eval_.connectivity_risk > 60) {
    advisories.push({
      key: 'conn-poor', severity: 'watch', category: 'connectivity',
      message: 'Limited connectivity — offline cache recommended',
      color: '#FFB300', timestamp: now,
    });
  }

  // Route capability mismatch
  if (snapshot?.route_difficulty?.route_exceeds_capability) {
    advisories.push({
      key: 'route-cap', severity: 'caution', category: 'terrain',
      message: 'Route difficulty may exceed vehicle setup',
      color: '#E67E22', timestamp: now,
    });
  }

  // Vehicle health
  if (snapshot?.vehicle_health?.coolant_high) {
    advisories.push({
      key: 'coolant-high', severity: 'warning', category: 'vehicle',
      message: 'Coolant temperature high — monitor closely',
      color: '#EF5350', timestamp: now,
    });
  }

  // Forward forecast advisory
  if (forecast.available && forecast.trend === 'worsening') {
    advisories.push({
      key: 'forecast-worsen', severity: 'watch', category: 'environmental',
      message: 'Expedition risk increasing ahead',
      color: '#FFB300', timestamp: now,
    });
  }

  return advisories.slice(0, 5);
}

function buildExpeditionRiskOutput(risk: ReturnType<typeof useExpeditionRisk>): ExpeditionRiskOutput {
  const eval_ = risk.evaluation;
  const snapshot = risk.inputSnapshot;
  const level = EXPEDITION_RISK_LEVEL_MAP[risk.operationalStatus] || 'Low';
  const categories = buildRiskCategories(eval_, snapshot);
  const forecast = buildForwardForecast(eval_, snapshot);
  const advisories = buildAdvisories(eval_, snapshot, forecast);

  const topFactors: string[] = [];
  if (eval_) {
    const factorScores = [
      { label: 'Isolation', score: eval_.isolation_risk },
      { label: 'Connectivity', score: eval_.connectivity_risk },
      { label: 'Resources', score: 100 - eval_.resource_readiness },
      { label: 'Route Difficulty', score: eval_.route_difficulty_score },
      { label: 'Vehicle', score: 100 - eval_.capability_score },
    ].sort((a, b) => b.score - a.score);
    for (const f of factorScores) {
      if (f.score > 20 && topFactors.length < 3) topFactors.push(f.label);
    }
  }

  return {
    level,
    score: risk.riskScore,
    descriptor: EXPEDITION_RISK_DESCRIPTORS[level],
    status: risk.operationalStatus,
    primary_factor: risk.primaryRiskLabel,
    summary: risk.summaryLine,
    categories,
    forward_forecast: forecast,
    advisories,
    top_factors: topFactors,
    data_completeness: risk.totalInputs > 0 ? Math.round((risk.availableInputs / risk.totalInputs) * 100) : 0,
    engine_active: risk.isRunning,
    updated_at: new Date().toISOString(),
  };
}


// ═══════════════════════════════════════════════════════════
// COMPACT MODE — 3-cell row
// ═══════════════════════════════════════════════════════════

export function ExpeditionRiskCompact() {
  const risk = useExpeditionRisk();
  const output = useMemo(() => buildExpeditionRiskOutput(risk), [risk.riskScore, risk.operationalStatus, risk.primaryRiskFactor]);
  const levelColor = EXPEDITION_RISK_LEVEL_COLORS[output.level];
  const forecastIndicator = output.forward_forecast.available
    ? output.forward_forecast.trend === 'worsening' ? '\u2191' : output.forward_forecast.trend === 'improving' ? '\u2193' : '\u2192'
    : '\u2014';

  return (
    <View style={cs.row}>
      <View style={cs.cell}>
        <Text style={cs.label}>RISK</Text>
        <Text style={[cs.value, { color: levelColor }]}>{output.level.toUpperCase()}</Text>
      </View>
      <View style={cs.cell}>
        <Text style={cs.label}>SCORE</Text>
        <Text style={[cs.value, { color: levelColor }]}>{output.score}</Text>
      </View>
      <View style={cs.cell}>
        <Text style={cs.label}>AHEAD</Text>
        <Text style={[cs.value, { color: output.forward_forecast.trend === 'worsening' ? '#E67E22' : output.forward_forecast.trend === 'improving' ? '#4CAF50' : TACTICAL.textMuted }]}>
          {forecastIndicator}
        </Text>
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
// CARD MODE — Risk level + descriptor + forecast indicator
// ═══════════════════════════════════════════════════════════

export function ExpeditionRiskCard() {
  const risk = useExpeditionRisk();
  const output = useMemo(() => buildExpeditionRiskOutput(risk), [risk.riskScore, risk.operationalStatus, risk.primaryRiskFactor, risk.summaryLine]);
  const levelColor = EXPEDITION_RISK_LEVEL_COLORS[output.level];

  return (
    <View style={cs2.body}>
      {/* Level badge */}
      <View style={[cs2.badge, { backgroundColor: levelColor + '15' }]}>
        <View style={[cs2.dot, { backgroundColor: levelColor }]} />
        <Text style={[cs2.badgeText, { color: levelColor }]}>{output.level.toUpperCase()}</Text>
        <Text style={[cs2.scoreChip, { color: levelColor }]}>{output.score}</Text>
      </View>

      {/* Descriptor */}
      <Text style={cs2.descriptor} numberOfLines={1}>{output.descriptor}</Text>

      {/* Primary factor */}
      {output.primary_factor !== 'No Concerns' && (
        <Text style={cs2.factor} numberOfLines={1}>{output.primary_factor}</Text>
      )}

      {/* Forecast indicator */}
      {output.forward_forecast.available && (
        <View style={cs2.forecastRow}>
          <Ionicons
            name={output.forward_forecast.trend === 'worsening' ? 'trending-up-outline' : output.forward_forecast.trend === 'improving' ? 'trending-down-outline' : 'remove-outline'}
            size={10}
            color={output.forward_forecast.trend === 'worsening' ? '#E67E22' : output.forward_forecast.trend === 'improving' ? '#4CAF50' : TACTICAL.textMuted}
          />
          <Text style={[cs2.forecastText, {
            color: output.forward_forecast.trend === 'worsening' ? '#E67E22' : output.forward_forecast.trend === 'improving' ? '#4CAF50' : TACTICAL.textMuted,
          }]}>{output.forward_forecast.trend_description}</Text>
        </View>
      )}
    </View>
  );
}

const cs2 = StyleSheet.create({
  body: { gap: 3 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  badgeText: { fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  scoreChip: { fontSize: 10, fontWeight: '900', fontFamily: 'Courier', marginLeft: 'auto' },
  descriptor: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  factor: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, fontStyle: 'italic' },
  forecastRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  forecastText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
});


// ═══════════════════════════════════════════════════════════
// DETAIL VIEW — Full expanded view
// ═══════════════════════════════════════════════════════════

export function ExpeditionRiskDetailView() {
  const risk = useExpeditionRisk();
  const output = useMemo(() => buildExpeditionRiskOutput(risk), [
    risk.riskScore, risk.operationalStatus, risk.primaryRiskFactor, risk.summaryLine,
    risk.capabilityScore, risk.resourceReadiness, risk.connectivityRisk, risk.isolationRisk,
    risk.routeDifficultyScore, risk.resourceRouteBalance, risk.healthScore, risk.availableInputs,
  ]);
  const levelColor = EXPEDITION_RISK_LEVEL_COLORS[output.level];

  return (
    <ScrollView style={ds.container} showsVerticalScrollIndicator={false}>
      {/* ═══ HEADER: Large score display ═══ */}
      <View style={ds.header}>
        <View style={ds.scoreCircle}>
          <Text style={[ds.scoreBig, { color: levelColor }]}>{output.score}</Text>
          <Text style={[ds.scoreUnit, { color: levelColor }]}>/ 100</Text>
        </View>
        <View style={ds.headerRight}>
          <Text style={[ds.levelLabel, { color: levelColor }]}>{output.level.toUpperCase()}</Text>
          <Text style={ds.descriptorText}>{output.descriptor}</Text>
          <Text style={ds.summaryText} numberOfLines={2}>{output.summary}</Text>
        </View>
      </View>

      {/* Score bar */}
      <View style={ds.scoreBarOuter}>
        <View style={[ds.scoreBarFill, { width: `${Math.min(100, output.score)}%`, backgroundColor: levelColor }]} />
        <View style={[ds.scoreBarMarker, { left: '25%' }]} />
        <View style={[ds.scoreBarMarker, { left: '50%' }]} />
        <View style={[ds.scoreBarMarker, { left: '75%' }]} />
      </View>
      <View style={ds.scoreBarLabels}>
        <Text style={[ds.scoreBarLabel, { color: '#4CAF50' }]}>LOW</Text>
        <Text style={[ds.scoreBarLabel, { color: '#FFB300' }]}>MOD</Text>
        <Text style={[ds.scoreBarLabel, { color: '#E67E22' }]}>ELEV</Text>
        <Text style={[ds.scoreBarLabel, { color: '#EF5350' }]}>HIGH</Text>
      </View>

      {/* ═══ ADVISORIES ═══ */}
      {output.advisories.length > 0 && (
        <>
          <View style={ds.divider} />
          <Text style={ds.section}>INTELLIGENCE ADVISORIES</Text>
          {output.advisories.map((adv) => (
            <View key={adv.key} style={[ds.advisoryRow, { borderLeftColor: adv.color }]}>
              <Ionicons
                name={adv.severity === 'warning' ? 'alert-circle' : adv.severity === 'caution' ? 'warning-outline' : 'information-circle-outline'}
                size={12}
                color={adv.color}
              />
              <Text style={[ds.advisoryText, { color: adv.color }]}>{adv.message}</Text>
            </View>
          ))}
        </>
      )}

      {/* ═══ RISK CATEGORIES ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>RISK CATEGORIES</Text>
      {output.categories.map((cat) => {
        const catColor = cat.score > 60 ? '#EF5350' : cat.score > 35 ? '#FFB300' : '#4CAF50';
        return (
          <View key={cat.category} style={ds.catRow}>
            <View style={ds.catHeader}>
              <Text style={ds.catLabel}>{cat.label.toUpperCase()}</Text>
              <Text style={[ds.catScore, { color: catColor }]}>{cat.score}</Text>
            </View>
            <View style={ds.catBarOuter}>
              <View style={[ds.catBarFill, { width: `${Math.min(100, cat.score)}%`, backgroundColor: catColor }]} />
            </View>
            <Text style={ds.catDesc}>{cat.description}</Text>
          </View>
        );
      })}

      {/* ═══ SUB-SCORES ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>SUB-SCORES</Text>
      <SubScoreRow label="CAPABILITY" value={risk.capabilityScore} inverted />
      <SubScoreRow label="HEALTH" value={risk.healthScore} inverted />
      <SubScoreRow label="RESOURCES" value={risk.resourceReadiness} inverted />
      <SubScoreRow label="CONNECTIVITY RISK" value={risk.connectivityRisk} />
      <SubScoreRow label="ISOLATION RISK" value={risk.isolationRisk} />
      <SubScoreRow label="ROUTE DIFFICULTY" value={risk.routeDifficultyScore} />
      <SubScoreRow label="ROUTE BALANCE" value={risk.resourceRouteBalance} inverted />

      {/* ═══ FORWARD FORECAST ═══ */}
      {output.forward_forecast.available && (
        <>
          <View style={ds.divider} />
          <Text style={ds.section}>FORWARD RISK FORECAST</Text>
          <View style={ds.forecastRow}>
            {output.forward_forecast.segments.map((seg) => (
              <View key={seg.distance_mi} style={ds.forecastSegment}>
                <View style={[ds.forecastDot, { backgroundColor: seg.color }]} />
                <Text style={[ds.forecastScore, { color: seg.color }]}>{seg.predicted_score}</Text>
                <Text style={ds.forecastLabel}>{seg.label}</Text>
              </View>
            ))}
          </View>
          <View style={ds.trendRow}>
            <Ionicons
              name={output.forward_forecast.trend === 'worsening' ? 'trending-up-outline' : output.forward_forecast.trend === 'improving' ? 'trending-down-outline' : 'remove-outline'}
              size={12}
              color={output.forward_forecast.trend === 'worsening' ? '#E67E22' : output.forward_forecast.trend === 'improving' ? '#4CAF50' : TACTICAL.textMuted}
            />
            <Text style={[ds.trendText, {
              color: output.forward_forecast.trend === 'worsening' ? '#E67E22' : output.forward_forecast.trend === 'improving' ? '#4CAF50' : TACTICAL.textMuted,
            }]}>{output.forward_forecast.trend_description}</Text>
          </View>
          {output.forward_forecast.segments.map((seg) => (
            <View key={`detail-${seg.distance_mi}`} style={ds.forecastDetailRow}>
              <Text style={ds.forecastDetailLabel}>{seg.label} AHEAD</Text>
              <Text style={[ds.forecastDetailValue, { color: seg.color }]}>{seg.predicted_level}</Text>
              <Text style={ds.forecastDetailConcern}>{seg.primary_concern}</Text>
            </View>
          ))}
        </>
      )}

      {/* ═══ DATA QUALITY ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>DATA QUALITY</Text>
      <MetricRow label="DATA INPUTS" value={`${risk.availableInputs} / ${risk.totalInputs}`} color={risk.isComplete ? '#4CAF50' : '#FFB300'} />
      <MetricRow label="COMPLETENESS" value={`${output.data_completeness}%`} color={output.data_completeness >= 80 ? '#4CAF50' : '#FFB300'} />
      <MetricRow label="ENGINE" value={risk.isRunning ? 'ACTIVE' : risk.isInitialized ? 'IDLE' : 'NOT INIT'} color={risk.isRunning ? '#4CAF50' : TACTICAL.textMuted} />
      <MetricRow label="EVALUATIONS" value={`${risk.evaluationCount}`} />

      {/* ═══ RISK SCALE ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>RISK SCALE</Text>
      <MetricRow label="0\u201325" value="LOW" color="#4CAF50" />
      <MetricRow label="26\u201350" value="MODERATE" color="#FFB300" />
      <MetricRow label="51\u201375" value="ELEVATED" color="#E67E22" />
      <MetricRow label="76\u2013100" value="HIGH" color="#EF5350" />

      {/* ═══ ENGINE INFO ═══ */}
      <View style={ds.divider} />
      <Text style={ds.section}>ENGINE</Text>
      <MetricRow label="VERSION" value="v5.0 (Phase 5)" />
      <MetricRow label="SCORING" value="7-factor weighted composite" />
      <MetricRow label="HYSTERESIS" value="Stabilized transitions" />
      <MetricRow label="FORWARD FORECAST" value="4-segment route-ahead" />
      <MetricRow label="CATEGORIES" value="7 risk categories" />
      <MetricRow label="ADVISORIES" value="Tactical intelligence" />

      <View style={{ height: 32 }} />
    </ScrollView>
  );
}

function SubScoreRow({ label, value, inverted }: { label: string; value: number; inverted?: boolean }) {
  const displayScore = inverted ? value : value;
  const riskLevel = inverted ? (100 - value) : value;
  const color = riskLevel > 60 ? '#EF5350' : riskLevel > 35 ? '#FFB300' : '#4CAF50';
  return (
    <View style={ds.subScoreRow}>
      <Text style={ds.subScoreLabel}>{label}</Text>
      <View style={ds.subScoreBarOuter}>
        <View style={[ds.subScoreBarFill, { width: `${Math.min(100, displayScore)}%`, backgroundColor: color }]} />
      </View>
      <Text style={[ds.subScoreValue, { color }]}>{displayScore}</Text>
    </View>
  );
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={ds.metricRow}>
      <Text style={ds.metricLabel}>{label}</Text>
      <Text style={[ds.metricValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const ds = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, marginBottom: 12 },
  scoreCircle: { alignItems: 'center', justifyContent: 'center' },
  scoreBig: { fontSize: 42, fontWeight: '900', fontFamily: 'Courier' },
  scoreUnit: { fontSize: 11, fontWeight: '700', marginTop: -4 },
  headerRight: { flex: 1, gap: 2 },
  levelLabel: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  descriptorText: { fontSize: 11, fontWeight: '700', color: TACTICAL.textMuted },
  summaryText: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, fontStyle: 'italic', marginTop: 2 },

  scoreBarOuter: { height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', position: 'relative' },
  scoreBarFill: { height: '100%', borderRadius: 4 },
  scoreBarMarker: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  scoreBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, paddingHorizontal: 2 },
  scoreBarLabel: { fontSize: 7, fontWeight: '700', letterSpacing: 0.8 },

  divider: { height: 1, backgroundColor: TACTICAL.border, marginVertical: 10 },
  section: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5, marginBottom: 6 },

  advisoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 8, borderLeftWidth: 3, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.02)', marginBottom: 4 },
  advisoryText: { fontSize: 10, fontWeight: '700', flex: 1 },

  catRow: { marginBottom: 8 },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 },
  catLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  catScore: { fontSize: 11, fontWeight: '900', fontFamily: 'Courier' },
  catBarOuter: { height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
  catBarFill: { height: '100%', borderRadius: 2 },
  catDesc: { fontSize: 8, fontWeight: '600', color: TACTICAL.textMuted, marginTop: 2 },

  subScoreRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  subScoreLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8, width: 110 },
  subScoreBarOuter: { flex: 1, height: 5, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' },
  subScoreBarFill: { height: '100%', borderRadius: 3 },
  subScoreValue: { fontSize: 10, fontWeight: '900', fontFamily: 'Courier', width: 28, textAlign: 'right' },

  forecastRow: { flexDirection: 'row', justifyContent: 'space-around', marginVertical: 8 },
  forecastSegment: { alignItems: 'center', gap: 3 },
  forecastDot: { width: 10, height: 10, borderRadius: 5 },
  forecastScore: { fontSize: 12, fontWeight: '900', fontFamily: 'Courier' },
  forecastLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },

  trendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.03)' },
  trendText: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5 },

  forecastDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 3 },
  forecastDetailLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8, width: 70 },
  forecastDetailValue: { fontSize: 10, fontWeight: '800', fontFamily: 'Courier', width: 60 },
  forecastDetailConcern: { fontSize: 8, fontWeight: '600', color: TACTICAL.textMuted, flex: 1 },

  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  metricLabel: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  metricValue: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
});



