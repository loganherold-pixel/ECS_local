/**
 * OfflineIntelligencePanel — Phase 9 UI Component
 *
 * Displays Offline Expedition Intelligence outputs on the
 * Status screen during ExpeditionDrive mode.
 *
 * All outputs are driver-safe:
 *   - Short messages
 *   - Simple labels
 *   - Large text
 *   - No complex charts
 *   - No large text blocks
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { offlineExpeditionIntelligence } from '../../lib/offlineExpeditionIntelligence';
import type { OfflineExpeditionIntelligenceOutput } from '../../lib/offlineIntelligenceTypes';

// ── Colors ──────────────────────────────────────────────────
const BG = '#0D1117';
const CARD_BG = '#161B22';
const BORDER = '#30363D';
const TEXT_PRIMARY = '#E6EDF3';
const TEXT_SECONDARY = '#8B949E';
const GOLD = '#D4A017';

// ── Component ───────────────────────────────────────────────

export default function OfflineIntelligencePanel() {
  const [intel, setIntel] = useState<OfflineExpeditionIntelligenceOutput>(
    offlineExpeditionIntelligence.get()
  );

  useEffect(() => {
    // Start the intelligence engine
    offlineExpeditionIntelligence.start();

    const unsub = offlineExpeditionIntelligence.subscribe(() => {
      setIntel(offlineExpeditionIntelligence.get());
    });

    return () => {
      unsub();
      // Don't stop the engine on unmount — it may be used by other consumers
    };
  }, []);

  if (!intel.isActive) {
    return (
      <View style={styles.container}>
        <View style={styles.inactiveCard}>
          <Ionicons name="analytics-outline" size={20} color={TEXT_SECONDARY} />
          <Text style={styles.inactiveText}>Expedition Intelligence Standby</Text>
        </View>
      </View>
    );
  }

  const { terrainDifficulty, remoteness, elevationAlerts, weatherAwareness, hazards, riskAssessment, dataAvailability } = intel;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={styles.header}>
        <Ionicons name="analytics-outline" size={16} color={GOLD} />
        <Text style={styles.headerText}>EXPEDITION INTELLIGENCE</Text>
        {intel.isOffline && (
          <View style={styles.offlineBadge}>
            <Ionicons name="cloud-offline-outline" size={12} color="#EF5350" />
            <Text style={styles.offlineBadgeText}>OFFLINE</Text>
          </View>
        )}
      </View>

      {/* ── Risk Assessment (Primary) ── */}
      <View style={[styles.riskCard, { borderLeftColor: riskAssessment.color }]}>
        <View style={styles.riskHeader}>
          <Ionicons name={riskAssessment.icon as any} size={22} color={riskAssessment.color} />
          <Text style={[styles.riskLevel, { color: riskAssessment.color }]}>
            {riskAssessment.level}
          </Text>
          <Text style={styles.riskScore}>{riskAssessment.score}</Text>
        </View>
        {riskAssessment.drivers.map((driver, idx) => (
          <Text key={idx} style={styles.riskDriver}>{driver}</Text>
        ))}
      </View>

      {/* ── Terrain + Remoteness Row ── */}
      <View style={styles.row}>
        <View style={styles.halfCard}>
          <Text style={styles.cardLabel}>TERRAIN</Text>
          <View style={styles.cardValueRow}>
            <Ionicons name={terrainDifficulty.icon as any} size={16} color={terrainDifficulty.color} />
            <Text style={[styles.cardValue, { color: terrainDifficulty.color }]}>
              {terrainDifficulty.level}
            </Text>
          </View>
          <Text style={styles.cardDetail} numberOfLines={1}>{terrainDifficulty.reason}</Text>
        </View>

        <View style={styles.halfCard}>
          <Text style={styles.cardLabel}>REMOTENESS</Text>
          <View style={styles.cardValueRow}>
            <View style={[styles.dot, { backgroundColor: remoteness.color }]} />
            <Text style={[styles.cardValue, { color: remoteness.color }]}>
              {remoteness.score}
            </Text>
          </View>
          <Text style={styles.cardDetail} numberOfLines={1}>{remoteness.tier}</Text>
        </View>
      </View>

      {/* ── Elevation Alerts ── */}
      {elevationAlerts.length > 0 && (
        <View style={styles.alertsSection}>
          {elevationAlerts.map((alert, idx) => (
            <View key={idx} style={[styles.alertRow, { borderLeftColor: alert.color }]}>
              <Ionicons name={alert.icon as any} size={14} color={alert.color} />
              <Text style={styles.alertText} numberOfLines={1}>{alert.message}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Hazard Warnings ── */}
      {hazards.length > 0 && (
        <View style={styles.alertsSection}>
          {hazards.map((hazard, idx) => (
            <View key={idx} style={[styles.alertRow, { borderLeftColor: hazard.color }]}>
              <Ionicons name={hazard.icon as any} size={14} color={hazard.color} />
              <Text style={styles.alertText} numberOfLines={1}>{hazard.message}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Weather Snapshot ── */}
      <View style={styles.weatherCard}>
        <View style={styles.weatherHeader}>
          <Ionicons name="cloud-outline" size={14} color={weatherAwareness.stalenessColor} />
          <Text style={styles.cardLabel}>WEATHER</Text>
          {weatherAwareness.ageLabel && (
            <Text style={[styles.weatherAge, { color: weatherAwareness.stalenessColor }]}>
              {weatherAwareness.ageLabel}
            </Text>
          )}
        </View>
        {weatherAwareness.available ? (
          <View style={styles.weatherBody}>
            {weatherAwareness.temperatureF != null && (
              <Text style={styles.weatherTemp}>{Math.round(weatherAwareness.temperatureF)}°F</Text>
            )}
            {weatherAwareness.windSpeedMph != null && (
              <Text style={styles.weatherWind}>
                {Math.round(weatherAwareness.windSpeedMph)} mph {weatherAwareness.windDirection ?? ''}
              </Text>
            )}
            {weatherAwareness.stormRisk !== 'unknown' && (
              <Text style={[styles.weatherStorm, {
                color: weatherAwareness.stormRisk === 'high' ? '#EF5350' :
                       weatherAwareness.stormRisk === 'moderate' ? '#FFB74D' : '#66BB6A'
              }]}>
                Storm: {weatherAwareness.stormRisk}
              </Text>
            )}
            {weatherAwareness.description && (
              <Text style={styles.weatherDesc} numberOfLines={1}>{weatherAwareness.description}</Text>
            )}
          </View>
        ) : (
          <Text style={styles.weatherUnavailable}>Weather data unavailable</Text>
        )}
      </View>

      {/* ── Data Availability ── */}
      <View style={styles.dataRow}>
        <DataDot label="GPS" available={dataAvailability.hasGps} />
        <DataDot label="Route" available={dataAvailability.hasRoute} />
        <DataDot label="Trail" available={dataAvailability.hasBreadcrumbs} />
        <DataDot label="Elev" available={dataAvailability.hasElevation} />
        <DataDot label="Wx" available={dataAvailability.hasWeatherCache} />
      </View>
    </View>
  );
}

// ── Data Availability Dot ───────────────────────────────────

function DataDot({ label, available }: { label: string; available: boolean }) {
  return (
    <View style={styles.dataDotContainer}>
      <View style={[styles.dataDotIndicator, { backgroundColor: available ? '#66BB6A' : '#30363D' }]} />
      <Text style={[styles.dataDotLabel, { color: available ? TEXT_SECONDARY : '#30363D' }]}>{label}</Text>
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
    color: GOLD,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    flex: 1,
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(239,83,80,0.15)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  offlineBadgeText: {
    color: '#EF5350',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
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
  cardLabel: {
    color: TEXT_SECONDARY,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 4,
  },
  cardValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  cardValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardDetail: {
    color: TEXT_SECONDARY,
    fontSize: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  alertsSection: {
    gap: 4,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: CARD_BG,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: BORDER,
    borderLeftWidth: 3,
  },
  alertText: {
    color: TEXT_PRIMARY,
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  weatherCard: {
    backgroundColor: CARD_BG,
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: BORDER,
  },
  weatherHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  weatherAge: {
    fontSize: 10,
    fontWeight: '500',
    marginLeft: 'auto',
  },
  weatherBody: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  weatherTemp: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: '700',
  },
  weatherWind: {
    color: TEXT_SECONDARY,
    fontSize: 12,
  },
  weatherStorm: {
    fontSize: 11,
    fontWeight: '600',
  },
  weatherDesc: {
    color: TEXT_SECONDARY,
    fontSize: 11,
    fontStyle: 'italic',
  },
  weatherUnavailable: {
    color: TEXT_SECONDARY,
    fontSize: 12,
    fontStyle: 'italic',
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



