/**
 * NextSegmentRiskPanel — Predictive Terrain Risk Readout
 *
 * Displays predicted grade, side-slope, stability margin, status,
 * and recommended actions for the next segment of the active route.
 *
 * When no active route is present, shows an informational message.
 *
 * Data flow:
 *   routeStore.getActive() → segments
 *   useGPSLocation() → current position (optional)
 *   StabilityStrip.computeStability() → effectiveLimit + currentTilt
 *   terrainPredictionEngine.predictNextSegment() → prediction
 *
 * No data hooks, stores, or calculations are modified.
 * This is a display-only component.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import { routeStore } from '../../lib/routeStore';
import { predictNextSegment } from '../../lib/terrainPredictionEngine';

import type { TerrainPrediction } from '../../lib/terrainPredictionEngine';
import type { StabilityResult } from './StabilityStrip';

const { width: SCREEN_W } = Dimensions.get('window');
const IS_SMALL = SCREEN_W < 380;

// ── Props ───────────────────────────────────────────────────

interface Props {
  /** Stability result from computeStability (provides effectiveLimit + tiltAngle) */
  stability: StabilityResult | null;
  /** Current GPS latitude (null if no fix) */
  currentLat: number | null;
  /** Current GPS longitude (null if no fix) */
  currentLon: number | null;
}

// ── Component ───────────────────────────────────────────────

export function NextSegmentRiskPanel({ stability, currentLat, currentLon }: Props) {
  // Get active route
  const activeRoute = useMemo(() => routeStore.getActive(), []);

  // Compute prediction
  const prediction: TerrainPrediction | null = useMemo(() => {
    if (!activeRoute || !stability) return null;
    if (!activeRoute.segments || activeRoute.segments.length === 0) return null;

    return predictNextSegment(
      activeRoute.segments,
      currentLat,
      currentLon,
      stability.tiltAngle,
      stability.effectiveLimit,
    );
  }, [activeRoute, stability, currentLat, currentLon]);

  const hasRoute = activeRoute != null && activeRoute.segments.length > 0;

  return (
    <View style={s.container}>
      {/* ── Section header ─────────────────────────────── */}
      <View style={s.headerRow}>
        <View style={s.headerLeft}>
          <View style={s.headerAccent} />
          <Ionicons
            name="analytics-outline"
            size={IS_SMALL ? 11 : 13}
            color={ECS.accent}
          />
          <Text style={s.headerTitle} numberOfLines={1}>
            NEXT SEGMENT RISK
          </Text>
        </View>
        {hasRoute && prediction?.available && (
          <View style={[s.statusBadge, { borderColor: prediction.statusColor }]}>
            <View style={[s.statusDot, { backgroundColor: prediction.statusColor }]} />
            <Text style={[s.statusText, { color: prediction.statusColor }]} numberOfLines={1}>
              {prediction.status}
            </Text>
          </View>
        )}
        {hasRoute && !prediction?.available && (
          <View style={[s.statusBadge, { borderColor: ECS.muted }]}>
            <Text style={[s.statusText, { color: ECS.muted }]} numberOfLines={1}>
              END OF ROUTE
            </Text>
          </View>
        )}
      </View>

      <View style={s.divider} />

      {/* ── No active route ────────────────────────────── */}
      {!hasRoute && (
        <View style={s.noRouteWrap}>
          <Ionicons
            name="navigate-outline"
            size={16}
            color={ECS.muted}
          />
          <Text style={s.noRouteText}>
            No active route — prediction unavailable.
          </Text>
        </View>
      )}

      {/* ── Prediction data ────────────────────────────── */}
      {hasRoute && prediction && (
        <>
          {/* Metrics row */}
          <View style={s.metricsRow}>
            {/* Predicted Grade */}
            <View style={s.metricCell}>
              <Text style={s.metricLabel}>GRADE</Text>
              <Text style={[
                s.metricValue,
                prediction.gradeDeg != null && prediction.gradeDeg > 8 && { color: '#FFB74D' },
                prediction.gradeDeg != null && prediction.gradeDeg > 15 && { color: '#EF5350' },
              ]}>
                {prediction.gradeDeg != null ? `${prediction.gradeDeg}°` : '--'}
              </Text>
              <Text style={s.metricSub}>
                {prediction.hasElevation ? 'FROM ELEV' : 'NO ELEV DATA'}
              </Text>
            </View>

            <View style={s.metricSep} />

            {/* Predicted Side-Slope */}
            <View style={s.metricCell}>
              <Text style={s.metricLabel}>SIDE-SLOPE</Text>
              <Text style={[
                s.metricValue,
                prediction.sideSlopeDeg != null && prediction.sideSlopeDeg > 5 && { color: '#FFB74D' },
                prediction.sideSlopeDeg != null && prediction.sideSlopeDeg > 10 && { color: '#EF5350' },
              ]}>
                {prediction.sideSlopeDeg != null ? `${prediction.sideSlopeDeg}°` : '--'}
              </Text>
              <Text style={s.metricSub}>
                {prediction.sideSlopeDeg != null ? 'HEADING EST' : 'INSUFFICIENT'}
              </Text>
            </View>

            <View style={s.metricSep} />

            {/* Predicted Margin */}
            <View style={s.metricCell}>
              <Text style={s.metricLabel}>MARGIN</Text>
              <Text style={[s.metricValue, { color: prediction.statusColor }]}>
                {prediction.predictedMarginDeg.toFixed(1)}°
              </Text>
              <Text style={s.metricSub}>PREDICTED</Text>
            </View>
          </View>

          {/* Lookahead info */}
          {prediction.available && prediction.lookaheadM > 0 && (
            <View style={s.lookaheadRow}>
              <Ionicons name="resize-outline" size={9} color={ECS.muted} />
              <Text style={s.lookaheadText}>
                {prediction.lookaheadM}m lookahead
                {currentLat != null ? ' from GPS' : ' from route start'}
              </Text>
            </View>
          )}

          {/* Recommended actions */}
          {prediction.actions.length > 0 && (
            <View style={s.actionsWrap}>
              {prediction.actions.map((action, i) => (
                <View key={i} style={s.actionRow}>
                  <Ionicons
                    name={
                      prediction.status === 'SAFE'
                        ? 'checkmark-circle-outline'
                        : prediction.status === 'CAUTION'
                        ? 'alert-circle-outline'
                        : 'warning-outline'
                    }
                    size={IS_SMALL ? 10 : 12}
                    color={prediction.statusColor}
                  />
                  <Text style={[s.actionText, { color: prediction.statusColor }]}>
                    {action}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    backgroundColor: ECS.bgPanel,
    borderWidth: 1,
    borderColor: ECS.stroke,
    borderRadius: ECS.radius,
    padding: IS_SMALL ? 10 : 12,
  },

  /* Header */
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerAccent: {
    width: 3,
    height: 12,
    backgroundColor: ECS.accent,
    borderRadius: 1.5,
    opacity: 0.7,
  },
  headerTitle: {
    fontSize: IS_SMALL ? 8 : 9,
    fontWeight: '700',
    letterSpacing: IS_SMALL ? 3 : 4,
    color: ECS.accent,
  },

  /* Status badge */
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  statusText: {
    fontSize: IS_SMALL ? 7 : 8,
    fontWeight: '800',
    letterSpacing: 2,
  },

  /* Divider */
  divider: {
    height: GOLD_RAIL.sectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginBottom: 10,
  },

  /* No route */
  noRouteWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  noRouteText: {
    fontSize: IS_SMALL ? 10 : 11,
    color: ECS.muted,
    fontWeight: '500',
    letterSpacing: 0.5,
  },

  /* Metrics row */
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  metricCell: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 2,
  },
  metricSep: {
    width: 1,
    height: 36,
    backgroundColor: GOLD_RAIL.internal,
    alignSelf: 'center',
  },
  metricLabel: {
    fontSize: IS_SMALL ? 6 : 7,
    fontWeight: '600',
    letterSpacing: 2,
    color: ECS.muted,
    marginBottom: 3,
  },
  metricValue: {
    fontSize: IS_SMALL ? 14 : 16,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 1,
    color: ECS.text,
  },
  metricSub: {
    fontSize: 5,
    fontWeight: '600',
    letterSpacing: 1.5,
    color: ECS.muted,
    marginTop: 2,
    opacity: 0.7,
  },

  /* Lookahead info */
  lookaheadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 0.5,
    borderTopColor: GOLD_RAIL.internal,
  },
  lookaheadText: {
    fontSize: IS_SMALL ? 7 : 8,
    color: ECS.muted,
    letterSpacing: 0.5,
    fontWeight: '500',
  },

  /* Actions */
  actionsWrap: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 0.5,
    borderTopColor: GOLD_RAIL.internal,
    gap: 5,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  actionText: {
    fontSize: IS_SMALL ? 9 : 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    flex: 1,
    lineHeight: IS_SMALL ? 13 : 14,
  },
});



