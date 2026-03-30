/**
 * TiltRiskPanel — Stability & Tilt Risk Warnings
 *
 * Integrates with stabilityEngine to show:
 *   - Stability index gauge
 *   - Critical roll/pitch angles
 *   - Risk level badge
 *   - Safety recommendations
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import type { TiltRisk } from '../../lib/weightDashboardStore';
import type { StabilityResult } from '../../lib/stabilityEngine';

interface Props {
  tiltRisk: TiltRisk;
  stability: StabilityResult;
}

export default function TiltRiskPanel({ tiltRisk, stability }: Props) {
  const [expanded, setExpanded] = useState(false);

  const gaugeWidth = Math.min(100, tiltRisk.stabilityIndex);
  const isAdvanced = stability.isAdvanced;

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="speedometer-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>TILT RISK ANALYSIS</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={[styles.riskBadge, { backgroundColor: tiltRisk.color + '18', borderColor: tiltRisk.color + '50' }]}>
            <View style={[styles.riskDot, { backgroundColor: tiltRisk.color }]} />
            <Text style={[styles.riskLabel, { color: tiltRisk.color }]}>{tiltRisk.label}</Text>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={TACTICAL.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* Stability Gauge */}
      <View style={styles.gaugeSection}>
        <View style={styles.gaugeHeader}>
          <Text style={styles.gaugeLabel}>STABILITY INDEX</Text>
          <Text style={[styles.gaugeValue, { color: tiltRisk.color }]}>
            {tiltRisk.stabilityIndex}
          </Text>
        </View>
        <View style={styles.gaugeTrack}>
          {/* Zone markers */}
          <View style={[styles.gaugeZone, { width: '50%', backgroundColor: 'rgba(102, 187, 106, 0.15)' }]} />
          <View style={[styles.gaugeZone, { width: '25%', backgroundColor: 'rgba(255, 152, 0, 0.15)' }]} />
          <View style={[styles.gaugeZone, { width: '15%', backgroundColor: 'rgba(239, 83, 80, 0.15)' }]} />
          <View style={[styles.gaugeZone, { width: '10%', backgroundColor: 'rgba(239, 83, 80, 0.25)' }]} />
          {/* Fill */}
          <View style={[styles.gaugeFill, { width: `${gaugeWidth}%`, backgroundColor: tiltRisk.color }]} />
          {/* Threshold markers */}
          <View style={[styles.thresholdLine, { left: '75%' }]} />
          <View style={[styles.thresholdLine, { left: '90%' }]} />
        </View>
        <View style={styles.gaugeLabels}>
          <Text style={styles.gaugeLabelText}>SAFE</Text>
          <Text style={styles.gaugeLabelText}>CAUTION</Text>
          <Text style={styles.gaugeLabelText}>HIGH</Text>
          <Text style={styles.gaugeLabelText}>CRIT</Text>
        </View>
      </View>

      {/* Angle Limits */}
      <View style={styles.anglesRow}>
        <View style={styles.angleCard}>
          <Ionicons name="swap-horizontal-outline" size={16} color={TACTICAL.amber} />
          <View style={styles.angleInfo}>
            <Text style={styles.angleLabel}>ROLL LIMIT</Text>
            <Text style={styles.angleValue}>{tiltRisk.rollAngleLimit}°</Text>
          </View>
          <View style={styles.angleThresholds}>
            <Text style={styles.thresholdText}>
              Warn: {stability.rollWarningDeg.toFixed(1)}°
            </Text>
            <Text style={styles.thresholdText}>
              High: {stability.rollHighRiskDeg.toFixed(1)}°
            </Text>
          </View>
        </View>

        <View style={styles.angleCard}>
          <Ionicons name="swap-vertical-outline" size={16} color={TACTICAL.amber} />
          <View style={styles.angleInfo}>
            <Text style={styles.angleLabel}>PITCH LIMIT</Text>
            <Text style={styles.angleValue}>{tiltRisk.pitchAngleLimit}°</Text>
          </View>
          <View style={styles.angleThresholds}>
            <Text style={styles.thresholdText}>
              Warn: {stability.pitchWarningDeg.toFixed(1)}°
            </Text>
            <Text style={styles.thresholdText}>
              High: {stability.pitchHighRiskDeg.toFixed(1)}°
            </Text>
          </View>
        </View>
      </View>

      {/* Expanded: Recommendations */}
      {expanded && (
        <View style={styles.recommendations}>
          <Text style={styles.recsTitle}>RECOMMENDATIONS</Text>
          {tiltRisk.recommendations.map((rec, i) => (
            <View key={i} style={styles.recRow}>
              <Ionicons
                name={tiltRisk.level === 'low' ? 'checkmark-circle' : 'information-circle'}
                size={12}
                color={tiltRisk.level === 'low' ? '#66BB6A' : tiltRisk.color}
              />
              <Text style={styles.recText}>{rec}</Text>
            </View>
          ))}

          {/* CG Details */}
          <View style={styles.cgDetails}>
            <Text style={styles.cgDetailsTitle}>CG PARAMETERS</Text>
            <View style={styles.cgDetailRow}>
              <Text style={styles.cgDetailLabel}>CG Height</Text>
              <Text style={styles.cgDetailValue}>{tiltRisk.cgHeight}" from ground</Text>
            </View>
            <View style={styles.cgDetailRow}>
              <Text style={styles.cgDetailLabel}>Lateral Offset</Text>
              <Text style={styles.cgDetailValue}>{tiltRisk.lateralOffset}" from center</Text>
            </View>
            <View style={styles.cgDetailRow}>
              <Text style={styles.cgDetailLabel}>Model Type</Text>
              <Text style={[styles.cgDetailValue, { color: isAdvanced ? '#66BB6A' : TACTICAL.amber }]}>
                {isAdvanced ? 'ADVANCED (zone data)' : 'SIMPLIFIED (baseline)'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Expand hint */}
      {!expanded && tiltRisk.recommendations.length > 1 && (
        <TouchableOpacity
          style={styles.expandHint}
          onPress={() => setExpanded(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.expandHintText}>
            {tiltRisk.recommendations.length} RECOMMENDATIONS — TAP TO EXPAND
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  riskDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  riskLabel: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Gauge
  gaugeSection: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  gaugeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  gaugeLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  gaugeValue: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  gaugeTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  gaugeZone: {
    height: '100%',
  },
  gaugeFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    borderRadius: 5,
    opacity: 0.85,
  },
  thresholdLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 2,
  },
  gaugeLabels: {
    flexDirection: 'row',
    marginTop: 4,
  },
  gaugeLabelText: {
    flex: 1,
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    textAlign: 'center',
  },

  // Angles
  anglesRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  angleCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  angleInfo: {
    flex: 1,
  },
  angleLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  angleValue: {
    fontSize: 18,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  angleThresholds: {
    gap: 2,
  },
  thresholdText: {
    fontSize: 7,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  // Recommendations
  recommendations: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
    paddingTop: 12,
    gap: 8,
  },
  recsTitle: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  recRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  recText: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.text,
    flex: 1,
    lineHeight: 16,
  },

  // CG Details
  cgDetails: {
    marginTop: 8,
    padding: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.15)',
    gap: 6,
  },
  cgDetailsTitle: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  cgDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cgDetailLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  cgDetailValue: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },

  // Expand hint
  expandHint: {
    paddingVertical: 8,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.1)',
  },
  expandHintText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
});



