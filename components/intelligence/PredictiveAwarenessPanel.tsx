/**
 * PredictiveAwarenessPanel — Phase 10 UI Component
 *
 * Displays Predictive Expedition Awareness outputs on the
 * Status screen during ExpeditionDrive mode.
 *
 * All outputs are driver-safe:
 *   - Short messages
 *   - Simple labels
 *   - Large text
 *   - No complex charts
 *   - No large text blocks
 *
 * Predictions displayed:
 *   1. Combined Risk Summary (primary card)
 *   2. Fuel Range Risk
 *   3. Daylight Risk
 *   4. Water Supply Projection
 *   5. Remoteness Exposure
 *   6. Terrain Exposure
 *   7. Data Availability indicators
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { predictiveExpeditionAwareness } from '../../lib/predictiveExpeditionAwareness';
import type { PredictiveAwarenessOutput } from '../../lib/predictiveAwarenessTypes';
import {
  PREDICTION_STATUS_COLORS,
  PREDICTION_STATUS_ICONS,
  REMOTENESS_TREND_ICONS,
  REMOTENESS_TREND_LABELS,
} from '../../lib/predictiveAwarenessTypes';

// ── Colors ──────────────────────────────────────────────────
const BG = '#0D1117';
const CARD_BG = '#161B22';
const BORDER = '#30363D';
const TEXT_PRIMARY = '#E6EDF3';
const TEXT_SECONDARY = '#8B949E';
const AMBER = '#C48A2C';

// ── Component ───────────────────────────────────────────────

export default function PredictiveAwarenessPanel() {
  const [output, setOutput] = useState<PredictiveAwarenessOutput>(
    predictiveExpeditionAwareness.get()
  );

  useEffect(() => {
    // Start the predictive awareness engine
    predictiveExpeditionAwareness.start();

    const unsub = predictiveExpeditionAwareness.subscribe(() => {
      setOutput(predictiveExpeditionAwareness.get());
    });

    return () => {
      unsub();
      // Don't stop the engine on unmount — it may be used by other consumers
    };
  }, []);

  if (!output.isActive) {
    return (
      <View style={styles.container}>
        <View style={styles.inactiveCard}>
          <Ionicons name="pulse-outline" size={20} color={TEXT_SECONDARY} />
          <Text style={styles.inactiveText}>Predictive Awareness Standby</Text>
        </View>
      </View>
    );
  }

  const {
    fuelPrediction,
    daylightPrediction,
    waterPrediction,
    remotenessPrediction,
    terrainPrediction,
    riskSummary,
    dataAvailability,
  } = output;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Ionicons name="pulse-outline" size={16} color={AMBER} />
        <Text style={styles.headerText}>PREDICTIVE AWARENESS</Text>
      </View>

      {/* ── Risk Summary (Primary Card) ── */}
      <View style={[styles.riskCard, { borderLeftColor: riskSummary.color }]}>
        <View style={styles.riskHeader}>
          <Ionicons name={riskSummary.icon as any} size={22} color={riskSummary.color} />
          <Text style={[styles.riskLevel, { color: riskSummary.color }]}>
            {riskSummary.level}
          </Text>
          <Text style={styles.riskScore}>{riskSummary.score}</Text>
        </View>
        {riskSummary.drivers.map((driver, idx) => (
          <Text key={idx} style={styles.riskDriver}>{driver}</Text>
        ))}
      </View>

      {/* ── Fuel + Daylight Row ── */}
      <View style={styles.row}>
        <PredictionCard
          label="FUEL"
          icon="speedometer-outline"
          status={fuelPrediction.status}
          value={fuelPrediction.available
            ? (fuelPrediction.estimatedRangeMi != null
              ? `${fuelPrediction.estimatedRangeMi} mi`
              : '--')
            : '--'}
          detail={fuelPrediction.message}
          subDetail={fuelPrediction.fuelPercent != null
            ? `${fuelPrediction.fuelPercent}% remaining`
            : undefined}
        />
        <PredictionCard
          label="DAYLIGHT"
          icon="sunny-outline"
          status={daylightPrediction.status}
          value={daylightPrediction.available
            ? (daylightPrediction.daylightRemainingHours != null
              ? `${daylightPrediction.daylightRemainingHours}h`
              : '--')
            : '--'}
          detail={daylightPrediction.message}
          subDetail={daylightPrediction.sunsetTimeLocal
            ? `Sunset ${daylightPrediction.sunsetTimeLocal}`
            : undefined}
        />
      </View>

      {/* ── Water + Remoteness Row ── */}
      <View style={styles.row}>
        <PredictionCard
          label="WATER"
          icon="water-outline"
          status={waterPrediction.status}
          value={waterPrediction.available
            ? (waterPrediction.autonomyDays != null
              ? `${waterPrediction.autonomyDays}d`
              : '--')
            : '--'}
          detail={waterPrediction.message}
          subDetail={waterPrediction.waterRemainingL != null
            ? `${waterPrediction.waterRemainingL} L remaining`
            : undefined}
        />
        <PredictionCard
          label="REMOTENESS"
          icon="locate-outline"
          status={remotenessPrediction.status}
          value={remotenessPrediction.available
            ? (remotenessPrediction.currentScore != null
              ? `${remotenessPrediction.currentScore}`
              : '--')
            : '--'}
          detail={remotenessPrediction.message}
          subDetail={remotenessPrediction.trend !== 'unknown'
            ? `Trend: ${REMOTENESS_TREND_LABELS[remotenessPrediction.trend]}`
            : undefined}
          trendIcon={remotenessPrediction.trend !== 'unknown'
            ? REMOTENESS_TREND_ICONS[remotenessPrediction.trend]
            : undefined}
          trendColor={
            remotenessPrediction.trend === 'increasing' ? '#FF7043' :
            remotenessPrediction.trend === 'decreasing' ? '#66BB6A' :
            TEXT_SECONDARY
          }
        />
      </View>

      {/* ── Terrain Prediction ── */}
      <View style={[styles.terrainCard, {
        borderLeftColor: PREDICTION_STATUS_COLORS[terrainPrediction.status],
      }]}>
        <View style={styles.terrainHeader}>
          <Ionicons
            name="trail-sign-outline"
            size={16}
            color={PREDICTION_STATUS_COLORS[terrainPrediction.status]}
          />
          <Text style={styles.terrainLabel}>TERRAIN AHEAD</Text>
          <Text style={[styles.terrainDifficulty, {
            color: PREDICTION_STATUS_COLORS[terrainPrediction.status],
          }]}>
            {terrainPrediction.upcomingDifficulty}
          </Text>
        </View>
        <Text style={styles.terrainMessage} numberOfLines={1}>
          {terrainPrediction.message}
        </Text>
        <View style={styles.terrainDetails}>
          {terrainPrediction.elevationChangeAheadFt != null && (
            <View style={styles.terrainDetailItem}>
              <Ionicons name="trending-up-outline" size={12} color={TEXT_SECONDARY} />
              <Text style={styles.terrainDetailText}>
                {terrainPrediction.elevationChangeAheadFt} ft change
              </Text>
            </View>
          )}
          {terrainPrediction.slopeSeverity !== 'unknown' && (
            <View style={styles.terrainDetailItem}>
              <Ionicons name="analytics-outline" size={12} color={TEXT_SECONDARY} />
              <Text style={styles.terrainDetailText}>
                {terrainPrediction.slopeSeverity} slope
              </Text>
            </View>
          )}
          {terrainPrediction.curvatureLevel !== 'unknown' && (
            <View style={styles.terrainDetailItem}>
              <Ionicons name="git-branch-outline" size={12} color={TEXT_SECONDARY} />
              <Text style={styles.terrainDetailText}>
                {terrainPrediction.curvatureLevel}
              </Text>
            </View>
          )}
          {terrainPrediction.technicalSectionAhead && (
            <View style={[styles.terrainDetailItem, styles.technicalBadge]}>
              <Ionicons name="warning-outline" size={12} color="#FF7043" />
              <Text style={[styles.terrainDetailText, { color: '#FF7043' }]}>
                Technical
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Data Availability ── */}
      <View style={styles.dataRow}>
        <DataDot label="GPS" available={dataAvailability.hasGps} />
        <DataDot label="Route" available={dataAvailability.hasRoute} />
        <DataDot label="Fuel" available={dataAvailability.hasFuel} />
        <DataDot label="Water" available={dataAvailability.hasWater} />
        <DataDot label="Terrain" available={dataAvailability.hasTerrain} />
        <DataDot label="Remote" available={dataAvailability.hasRemoteness} />
        <DataDot label="Wx" available={dataAvailability.hasWeather} />
      </View>
    </View>
  );
}

// ── Prediction Card ─────────────────────────────────────────

function PredictionCard({
  label,
  icon,
  status,
  value,
  detail,
  subDetail,
  trendIcon,
  trendColor,
}: {
  label: string;
  icon: string;
  status: import('../../lib/predictiveAwarenessTypes').PredictionStatus;
  value: string;
  detail: string;
  subDetail?: string;
  trendIcon?: string;
  trendColor?: string;
}) {
  const statusColor = PREDICTION_STATUS_COLORS[status];

  return (
    <View style={styles.halfCard}>
      <View style={styles.cardLabelRow}>
        <Ionicons name={icon as any} size={12} color={TEXT_SECONDARY} />
        <Text style={styles.cardLabel}>{label}</Text>
      </View>
      <View style={styles.cardValueRow}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.cardValue, { color: statusColor }]}>{value}</Text>
        {trendIcon && (
          <Ionicons
            name={trendIcon as any}
            size={14}
            color={trendColor ?? TEXT_SECONDARY}
            style={{ marginLeft: 4 }}
          />
        )}
      </View>
      <Text style={styles.cardDetail} numberOfLines={2}>{detail}</Text>
      {subDetail && (
        <Text style={styles.cardSubDetail} numberOfLines={1}>{subDetail}</Text>
      )}
    </View>
  );
}

// ── Data Availability Dot ───────────────────────────────────

function DataDot({ label, available }: { label: string; available: boolean }) {
  return (
    <View style={styles.dataDotContainer}>
      <View style={[styles.dataDotIndicator, {
        backgroundColor: available ? '#66BB6A' : '#30363D',
      }]} />
      <Text style={[styles.dataDotLabel, {
        color: available ? TEXT_SECONDARY : '#30363D',
      }]}>
        {label}
      </Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  headerText: {
    color: AMBER,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    flex: 1,
  },
  inactiveCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
  },
  inactiveText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
  },
  riskCard: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 3,
  },
  riskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  riskLevel: {
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  riskScore: {
    color: TEXT_SECONDARY,
    fontSize: 14,
    fontWeight: '600',
  },
  riskDriver: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    marginLeft: 30,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  halfCard: {
    flex: 1,
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  cardLabel: {
    color: TEXT_SECONDARY,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  cardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cardValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardDetail: {
    color: TEXT_SECONDARY,
    fontSize: 10,
    marginTop: 2,
  },
  cardSubDetail: {
    color: TEXT_SECONDARY,
    fontSize: 9,
    marginTop: 1,
    opacity: 0.7,
  },
  terrainCard: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 3,
  },
  terrainHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  terrainLabel: {
    color: TEXT_SECONDARY,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    flex: 1,
  },
  terrainDifficulty: {
    fontSize: 13,
    fontWeight: '700',
  },
  terrainMessage: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 6,
  },
  terrainDetails: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  terrainDetailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  terrainDetailText: {
    color: TEXT_SECONDARY,
    fontSize: 10,
  },
  technicalBadge: {
    backgroundColor: 'rgba(255,112,67,0.12)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 4,
  },
  dataDotContainer: {
    alignItems: 'center',
    gap: 2,
  },
  dataDotIndicator: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dataDotLabel: {
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});



