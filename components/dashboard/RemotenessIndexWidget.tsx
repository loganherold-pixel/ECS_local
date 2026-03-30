/**
 * ECS Remoteness Index Widget — Enhanced Dashboard Views
 *
 * Three display modes:
 *   1. RemotenessIndexCompact — 3-cell compact for grid
 *   2. RemotenessIndexCard — Full card with score, factors, forecast
 *   3. RemotenessIndexDetailView — Expanded detail with all data
 *
 * Reads from remotenessStore.getIndex() for full multi-factor data.
 * Falls back to remotenessStore.get() for legacy tier display.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { remotenessStore } from '../../lib/remotenessStore';
import type { RemotenessIndexOutput, RemotenessFactor, ForwardForecastSegment, RemotenessAdvisory } from '../../lib/remotenessTypes';

// ══════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.metricRow}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function SectionHeader({ title, color }: { title: string; color?: string }) {
  return <Text style={[s.sectionHeader, color ? { color } : null]}>{title}</Text>;
}

function useRemotenessIndex() {
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = remotenessStore.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  useEffect(() => {
    remotenessStore.start();
    return () => { remotenessStore.stop(); };
  }, []);

  return {
    legacy: remotenessStore.get(),
    index: remotenessStore.getIndex(),
  };
}

// ══════════════════════════════════════════════════════════
// COMPACT VIEW
// ══════════════════════════════════════════════════════════

export function RemotenessIndexCompact() {
  const { legacy, index } = useRemotenessIndex();

  const level = index?.level ?? 'Low';
  const color = index?.levelColor ?? legacy.tierColor;
  const score = index?.score ?? legacy.score;

  // Forward forecast indicator
  const forecastUp = index?.forecast?.isIncreasing ?? false;

  return (
    <View style={s.compactRow}>
      <View style={s.compactCell}>
        <Text style={s.compactLabel}>LEVEL</Text>
        <Text style={[s.compactValue, { color, fontSize: 9 }]}>{level.toUpperCase()}</Text>
      </View>
      <View style={s.compactCell}>
        <Text style={s.compactLabel}>SCORE</Text>
        <Text style={[s.compactValue, { color }]}>{score}</Text>
      </View>
      <View style={s.compactCell}>
        <Text style={s.compactLabel}>AHEAD</Text>
        <Text style={[s.compactValue, { fontSize: 9, color: forecastUp ? '#E67E22' : '#4CAF50' }]}>
          {forecastUp ? 'RISING' : 'STABLE'}
        </Text>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════
// CARD VIEW
// ══════════════════════════════════════════════════════════

export function RemotenessIndexCard() {
  const { legacy, index } = useRemotenessIndex();

  if (!index) {
    // Fallback to legacy display
    return (
      <View style={s.cardBody}>
        <Text style={[s.tierLabel, { color: legacy.tierColor }]}>{legacy.tier}</Text>
        <Text style={s.reasonText} numberOfLines={1}>{legacy.reason}</Text>
      </View>
    );
  }

  const { level, levelColor, score, reason, forecast, connectivity } = index;

  // Signal indicator
  const signalIcon = connectivity.isOffline ? 'cloud-offline-outline' :
    connectivity.signal === 'strong' ? 'cellular-outline' :
    connectivity.signal === 'weak' ? 'cellular-outline' : 'wifi-outline';
  const signalColor = connectivity.isOffline ? '#EF5350' :
    connectivity.signal === 'strong' ? '#4CAF50' : '#FFB300';

  return (
    <View style={s.cardBody}>
      {/* Level + Score */}
      <View style={s.cardHeaderRow}>
        <Text style={[s.tierLabel, { color: levelColor }]}>{level.toUpperCase()}</Text>
        <View style={s.scoreChip}>
          <Text style={[s.scoreChipText, { color: levelColor }]}>{score}</Text>
        </View>
      </View>

      {/* Reason */}
      <Text style={s.reasonText} numberOfLines={1}>{reason}</Text>

      {/* Signal + Forecast row */}
      <View style={s.cardInfoRow}>
        <View style={s.cardInfoCell}>
          <Ionicons name={signalIcon as any} size={10} color={signalColor} />
          <Text style={[s.cardInfoText, { color: signalColor }]}>
            {connectivity.signal.replace('_', ' ').toUpperCase()}
          </Text>
        </View>
        {forecast.available && forecast.advisory && (
          <View style={s.cardInfoCell}>
            <Ionicons name="arrow-forward-outline" size={10} color="#E67E22" />
            <Text style={[s.cardInfoText, { color: '#E67E22' }]} numberOfLines={1}>
              {forecast.advisory}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════
// DETAIL VIEW
// ══════════════════════════════════════════════════════════

export function RemotenessIndexDetailView() {
  const { legacy, index } = useRemotenessIndex();

  if (!index) {
    return (
      <View style={s.detailContainer}>
        <SectionHeader title="REMOTENESS INDEX" />
        <MetricRow label="TIER" value={legacy.tier} color={legacy.tierColor} />
        <MetricRow label="SCORE" value={`${legacy.score} / 100`} color={legacy.tierColor} />
        <MetricRow label="STATUS" value="Engine initializing" color={TACTICAL.textMuted} />
      </View>
    );
  }

  const { level, levelColor, score, rawScore, reason, description, factors,
    availableFactorCount, totalFactorCount, proximity, connectivity,
    terrain, forecast, advisories } = index;

  const severityColor: Record<string, string> = {
    info: '#5AC8FA',
    caution: '#FFB300',
    warning: '#E67E22',
    critical: '#EF5350',
  };

  return (
    <ScrollView style={s.detailScroll} showsVerticalScrollIndicator={false}>
      <View style={s.detailContainer}>
        {/* ═══ CURRENT REMOTENESS ═══ */}
        <SectionHeader title="CURRENT REMOTENESS" />
        <View style={s.scoreDisplay}>
          <Text style={[s.scoreBig, { color: levelColor }]}>{score}</Text>
          <View style={s.scoreMeta}>
            <Text style={[s.levelBadge, { color: levelColor }]}>{level.toUpperCase()}</Text>
            <Text style={s.scoreSubtext}>{description}</Text>
          </View>
        </View>

        {/* Score bar */}
        <View style={s.scoreBarOuter}>
          <View style={[s.scoreBarFill, { width: `${Math.min(100, score)}%`, backgroundColor: levelColor }]} />
          <View style={[s.scoreBarMarker, { left: '25%' }]} />
          <View style={[s.scoreBarMarker, { left: '50%' }]} />
          <View style={[s.scoreBarMarker, { left: '75%' }]} />
        </View>
        <View style={s.scoreBarLabels}>
          <Text style={[s.scoreBarLabel, { color: '#4CAF50' }]}>LOW</Text>
          <Text style={[s.scoreBarLabel, { color: '#FFB300' }]}>MOD</Text>
          <Text style={[s.scoreBarLabel, { color: '#E67E22' }]}>REMOTE</Text>
          <Text style={[s.scoreBarLabel, { color: '#C0392B' }]}>EXTREME</Text>
        </View>

        <MetricRow label="REASON" value={reason} color={TACTICAL.textMuted} />
        <MetricRow label="DATA INPUTS" value={`${availableFactorCount} / ${totalFactorCount}`} />

        {/* ═══ INTELLIGENCE ADVISORIES ═══ */}
        {advisories.length > 0 && (
          <>
            <View style={s.divider} />
            <SectionHeader title="ADVISORIES" />
            {advisories.map((adv, i) => (
              <View key={i} style={[s.advisoryRow, { borderLeftColor: severityColor[adv.severity] || '#FFB300' }]}>
                <Ionicons
                  name={adv.severity === 'critical' ? 'alert-circle' : adv.severity === 'warning' ? 'warning-outline' : 'information-circle-outline'}
                  size={12}
                  color={severityColor[adv.severity] || '#FFB300'}
                />
                <Text style={[s.advisoryText, { color: severityColor[adv.severity] || '#FFB300' }]}>
                  {adv.message}
                </Text>
              </View>
            ))}
          </>
        )}

        {/* ═══ FACTOR BREAKDOWN ═══ */}
        <View style={s.divider} />
        <SectionHeader title="FACTOR BREAKDOWN" />
        {factors.map((factor, i) => (
          <View key={factor.id} style={s.factorRow}>
            <View style={s.factorInfo}>
              <Text style={s.factorLabel}>{factor.label.toUpperCase()}</Text>
              {factor.detail && (
                <Text style={s.factorDetail} numberOfLines={1}>{factor.detail}</Text>
              )}
            </View>
            <View style={s.factorScoreCol}>
              <View style={s.factorBarOuter}>
                <View style={[s.factorBarFill, {
                  width: `${Math.min(100, factor.rawScore)}%`,
                  backgroundColor: factor.rawScore >= 70 ? '#EF5350' : factor.rawScore >= 40 ? '#FFB300' : '#4CAF50',
                }]} />
              </View>
              <Text style={[s.factorScore, {
                color: !factor.available ? TACTICAL.textMuted :
                  factor.rawScore >= 70 ? '#EF5350' : factor.rawScore >= 40 ? '#FFB300' : '#4CAF50',
              }]}>
                {factor.available ? factor.rawScore : '\u2014'}
              </Text>
            </View>
          </View>
        ))}

        {/* ═══ INFRASTRUCTURE PROXIMITY ═══ */}
        <View style={s.divider} />
        <SectionHeader title="INFRASTRUCTURE PROXIMITY" />
        <MetricRow
          label="NEAREST PAVED ROAD"
          value={proximity.nearestPavedRoad.distanceMi != null ? `~${proximity.nearestPavedRoad.distanceMi} mi` : '\u2014'}
          color={proximity.nearestPavedRoad.distanceMi != null && proximity.nearestPavedRoad.distanceMi > 15 ? '#E67E22' : undefined}
        />
        <MetricRow
          label="NEAREST TOWN"
          value={proximity.nearestTown.distanceMi != null ? `~${proximity.nearestTown.distanceMi} mi` : '\u2014'}
          color={proximity.nearestTown.distanceMi != null && proximity.nearestTown.distanceMi > 30 ? '#E67E22' : undefined}
        />
        <MetricRow
          label="NEAREST FUEL"
          value={proximity.nearestFuelStation.distanceMi != null ? `~${proximity.nearestFuelStation.distanceMi} mi` : '\u2014'}
          color={proximity.nearestFuelStation.distanceMi != null && proximity.nearestFuelStation.distanceMi > 40 ? '#EF5350' : undefined}
        />
        <MetricRow
          label="EMERGENCY SERVICES"
          value={proximity.nearestEmergencyServices.distanceMi != null ? `~${proximity.nearestEmergencyServices.distanceMi} mi` : '\u2014'}
          color={proximity.nearestEmergencyServices.distanceMi != null && proximity.nearestEmergencyServices.distanceMi > 50 ? '#EF5350' : undefined}
        />
        <MetricRow
          label="NEAREST SERVICES"
          value={proximity.nearestServices.distanceMi != null ? `~${proximity.nearestServices.distanceMi} mi` : '\u2014'}
        />
        <MetricRow label="CONFIDENCE" value={proximity.nearestPavedRoad.confidence.toUpperCase()} color={TACTICAL.textMuted} />

        {/* ═══ CONNECTIVITY ═══ */}
        <View style={s.divider} />
        <SectionHeader title="CONNECTIVITY" />
        <MetricRow
          label="SIGNAL"
          value={connectivity.signal.replace('_', ' ').toUpperCase()}
          color={connectivity.isOffline ? '#EF5350' : connectivity.signal === 'strong' ? '#4CAF50' : '#FFB300'}
        />
        <MetricRow label="CELLULAR" value={connectivity.hasCellular ? 'AVAILABLE' : 'UNAVAILABLE'} color={connectivity.hasCellular ? '#4CAF50' : TACTICAL.textMuted} />
        <MetricRow label="QUALITY SCORE" value={`${connectivity.qualityScore} / 100`} />
        <MetricRow label="OFFLINE" value={connectivity.isOffline ? 'YES' : 'NO'} color={connectivity.isOffline ? '#EF5350' : '#4CAF50'} />

        {/* ═══ TERRAIN CONTEXT ═══ */}
        <View style={s.divider} />
        <SectionHeader title="TERRAIN CONTEXT" />
        <MetricRow
          label="ELEVATION"
          value={terrain.elevationFt != null ? `${Math.round(terrain.elevationFt).toLocaleString()} ft` : '\u2014'}
          color={terrain.elevationFt != null && terrain.elevationFt > 7000 ? '#E67E22' : undefined}
        />
        <MetricRow
          label="COMPLEXITY"
          value={terrain.complexity ? terrain.complexity.toUpperCase() : 'UNKNOWN'}
          color={terrain.complexity === 'high' ? '#EF5350' : terrain.complexity === 'medium' ? '#FFB300' : '#4CAF50'}
        />
        <MetricRow label="BACKCOUNTRY" value={terrain.isBackcountry ? 'YES' : 'NO'} color={terrain.isBackcountry ? '#E67E22' : '#4CAF50'} />
        <MetricRow label="ROUTE ISOLATION" value={`${terrain.routeIsolation} / 100`} color={terrain.routeIsolation > 60 ? '#EF5350' : terrain.routeIsolation > 30 ? '#FFB300' : '#4CAF50'} />

        {/* ═══ FORWARD FORECAST ═══ */}
        <View style={s.divider} />
        <SectionHeader title="FORWARD REMOTENESS FORECAST" />
        {!forecast.available ? (
          <MetricRow label="STATUS" value="No route data" color={TACTICAL.textMuted} />
        ) : (
          <>
            <MetricRow label="TREND" value={forecast.isIncreasing ? 'INCREASING' : 'STABLE'} color={forecast.isIncreasing ? '#E67E22' : '#4CAF50'} />
            <MetricRow label="PEAK SCORE" value={`${forecast.peakScore}`} color={forecast.peakScore >= 75 ? '#EF5350' : forecast.peakScore >= 50 ? '#E67E22' : undefined} />
            <MetricRow label="PEAK LEVEL" value={forecast.peakLevel.toUpperCase()} />
            {forecast.peakDistanceMi > 0 && (
              <MetricRow label="PEAK DISTANCE" value={`${forecast.peakDistanceMi} mi ahead`} />
            )}
            {forecast.advisory && (
              <View style={[s.advisoryRow, { borderLeftColor: '#E67E22', marginTop: 6 }]}>
                <Ionicons name="arrow-forward-outline" size={12} color="#E67E22" />
                <Text style={[s.advisoryText, { color: '#E67E22' }]}>{forecast.advisory}</Text>
              </View>
            )}

            {/* Forecast segments */}
            <View style={s.forecastGrid}>
              {forecast.segments.map((seg, i) => (
                <View key={i} style={s.forecastSegment}>
                  <Text style={s.forecastDist}>{seg.distanceAheadMi} mi</Text>
                  <View style={[s.forecastDot, { backgroundColor: seg.color }]} />
                  <Text style={[s.forecastScore, { color: seg.color }]}>{seg.score}</Text>
                  <Text style={s.forecastTime}>{seg.timeAheadMin}m</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ═══ LEVEL SCALE ═══ */}
        <View style={s.divider} />
        <SectionHeader title="REMOTENESS SCALE" />
        <MetricRow label="0\u201325" value="LOW" color="#4CAF50" />
        <MetricRow label="26\u201350" value="MODERATE" color="#FFB300" />
        <MetricRow label="51\u201375" value="REMOTE" color="#E67E22" />
        <MetricRow label="76\u2013100" value="EXTREME" color="#C0392B" />

        {/* ═══ ENGINE INFO ═══ */}
        <View style={s.divider} />
        <SectionHeader title="ENGINE" />
        <MetricRow label="VERSION" value="v3.0 (Remoteness Index)" />
        <MetricRow label="FACTORS" value="7 (weighted multi-factor)" />
        <MetricRow label="SMOOTHING" value="0.85 / 0.15" />
        <MetricRow label="ANTI-FLICKER" value="30s hold / 8pt force" />
        <MetricRow label="INTERVAL" value="~12s (timer-driven)" />
        <MetricRow label="FORECAST" value={forecast.available ? 'ACTIVE' : 'INACTIVE'} color={forecast.available ? '#4CAF50' : TACTICAL.textMuted} />
        <MetricRow
          label="STATUS"
          value={remotenessStore.isRunning() ? 'ACTIVE' : 'IDLE'}
          color={remotenessStore.isRunning() ? '#4CAF50' : TACTICAL.textMuted}
        />

        <View style={{ height: 24 }} />
      </View>
    </ScrollView>
  );
}

// ══════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════

const s = StyleSheet.create({
  // ── Compact ──
  compactRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  compactCell: { flex: 1, alignItems: 'center' },
  compactLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 1 },
  compactValue: { fontSize: 12, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text },

  // ── Card ──
  cardBody: { gap: 4, justifyContent: 'center', alignItems: 'center', flex: 1, paddingHorizontal: 4 },
  cardHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  tierLabel: { fontSize: 13, fontWeight: '800', letterSpacing: 2.5, textAlign: 'center', fontFamily: 'Courier' },
  scoreChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' },
  scoreChipText: { fontSize: 11, fontWeight: '900', fontFamily: 'Courier' },
  reasonText: { fontSize: 9, color: TACTICAL.textMuted, textAlign: 'center', fontFamily: 'Courier', letterSpacing: 0.5, opacity: 0.85 },
  cardInfoRow: { flexDirection: 'row', gap: 10, marginTop: 2, flexWrap: 'wrap', justifyContent: 'center' },
  cardInfoCell: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  cardInfoText: { fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },

  // ── Detail ──
  detailScroll: { flex: 1 },
  detailContainer: { gap: 2, paddingBottom: 16 },
  sectionHeader: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5, marginTop: 8, marginBottom: 4 },
  divider: { height: 1, backgroundColor: TACTICAL.border, marginVertical: 8 },

  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  metricLabel: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, flex: 1 },
  metricValue: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier', flexShrink: 0, maxWidth: '55%', textAlign: 'right' },

  // ── Score Display ──
  scoreDisplay: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8, marginTop: 4 },
  scoreBig: { fontSize: 42, fontWeight: '900', fontFamily: 'Courier' },
  scoreMeta: { flex: 1, gap: 2 },
  levelBadge: { fontSize: 14, fontWeight: '900', letterSpacing: 2 },
  scoreSubtext: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, lineHeight: 14 },

  // ── Score Bar ──
  scoreBarOuter: { height: 8, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', position: 'relative' },
  scoreBarFill: { height: '100%', borderRadius: 4 },
  scoreBarMarker: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  scoreBarLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, paddingHorizontal: 2 },
  scoreBarLabel: { fontSize: 7, fontWeight: '700', letterSpacing: 0.8 },

  // ── Advisory ──
  advisoryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 5, paddingHorizontal: 8, borderLeftWidth: 2, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.02)', marginBottom: 3 },
  advisoryText: { fontSize: 9, fontWeight: '700', flex: 1, lineHeight: 14 },

  // ── Factor Breakdown ──
  factorRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.04)' },
  factorInfo: { flex: 1, gap: 1 },
  factorLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  factorDetail: { fontSize: 8, fontWeight: '500', color: TACTICAL.textMuted, opacity: 0.7 },
  factorScoreCol: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 80 },
  factorBarOuter: { flex: 1, height: 4, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
  factorBarFill: { height: '100%', borderRadius: 2 },
  factorScore: { fontSize: 10, fontWeight: '900', fontFamily: 'Courier', width: 24, textAlign: 'right' },

  // ── Forecast Grid ──
  forecastGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, paddingHorizontal: 4 },
  forecastSegment: { alignItems: 'center', gap: 3 },
  forecastDist: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  forecastDot: { width: 8, height: 8, borderRadius: 4 },
  forecastScore: { fontSize: 11, fontWeight: '900', fontFamily: 'Courier' },
  forecastTime: { fontSize: 7, fontWeight: '600', color: TACTICAL.textMuted },
});



