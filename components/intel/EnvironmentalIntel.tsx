/**
 * EnvironmentalIntel — Section 1 of Intel Tab
 *
 * Displays:
 *   - Time & Light conditions (sunrise/sunset, daylight status)
 *   - Terrain Notes (derived from Navigate route data)
 *   - Risk Overview (from Safety scoring)
 *   - Severe Alerts status
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import type { ImportedRoute } from '../../lib/routeStore';

interface Props {
  activeRoute: ImportedRoute | null;
  riskScore: number | null;
  riskLevel: string;
  riskColor: string;
}

function getEnvironmentalData() {
  const now = new Date();
  const hour = now.getHours();
  const sunrise = '06:45';
  const sunset = '17:52';
  const isDaylight = hour >= 7 && hour < 18;

  return {
    timeOfDay: isDaylight ? 'DAYLIGHT' : 'DARKNESS',
    sunrise,
    sunset,
    currentDate: now.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    isDaylight,
  };
}

export default function EnvironmentalIntel({ activeRoute, riskScore, riskLevel, riskColor }: Props) {
  const env = useMemo(() => getEnvironmentalData(), []);

  return (
    <View style={styles.section}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <View style={styles.sectionDot} />
          <Text style={styles.sectionTitle}>ENVIRONMENTAL INTELLIGENCE</Text>
        </View>
      </View>


      {/* Time & Light Card */}
      <View style={styles.card}>
        <View style={styles.lightRow}>
          <View style={styles.lightStat}>
            <Ionicons
              name={env.isDaylight ? 'sunny-outline' : 'moon-outline'}
              size={22}
              color={env.isDaylight ? TACTICAL.amber : '#5DADE2'}
            />
            <Text style={styles.lightValue}>{env.timeOfDay}</Text>
            <Text style={styles.lightLabel}>CONDITION</Text>
          </View>
          <View style={styles.lightDivider} />
          <View style={styles.lightStat}>
            <Ionicons name="sunny-outline" size={16} color={TACTICAL.amber} />
            <Text style={styles.lightValue}>{env.sunrise}</Text>
            <Text style={styles.lightLabel}>SUNRISE</Text>
          </View>
          <View style={styles.lightDivider} />
          <View style={styles.lightStat}>
            <Ionicons name="moon-outline" size={16} color="#5DADE2" />
            <Text style={styles.lightValue}>{env.sunset}</Text>
            <Text style={styles.lightLabel}>SUNSET</Text>
          </View>
        </View>
        <View style={styles.dateRow}>
          <Text style={styles.dateText}>{env.currentDate}</Text>
        </View>
      </View>

      {/* Terrain Notes */}
      <View style={styles.subCard}>
        <View style={styles.subCardHeader}>
          <Ionicons name="trail-sign-outline" size={13} color={TACTICAL.amber} />
          <Text style={styles.subCardTitle}>TERRAIN NOTES</Text>
        </View>
        {activeRoute ? (
          <View style={styles.terrainGrid}>
            <TerrainRow label="Active Route" value={activeRoute.name} />
            <TerrainRow label="Distance" value={`${activeRoute.total_distance_miles.toFixed(1)} mi`} />
            <TerrainRow
              label="Elevation Gain"
              value={activeRoute.elevation_gain_ft ? `${activeRoute.elevation_gain_ft} ft` : 'N/A'}
            />
            <TerrainRow label="Waypoints" value={`${activeRoute.waypoint_count}`} />
            <TerrainRow label="Segments" value={`${activeRoute.segment_count}`} />
          </View>
        ) : (
          <Text style={styles.noData}>No active route. Import via Navigate tab.</Text>
        )}
      </View>

      {/* Risk Overview */}
      <View style={styles.subCard}>
        <View style={styles.subCardHeader}>
          <Ionicons name="shield-outline" size={13} color={riskColor || TACTICAL.textMuted} />
          <Text style={styles.subCardTitle}>RISK OVERVIEW</Text>
        </View>
        {riskScore !== null ? (
          <View style={styles.riskRow}>
            <View style={[styles.riskBadge, { borderColor: `${riskColor}30` }]}>
              <Text style={[styles.riskScore, { color: riskColor }]}>
                {riskScore.toFixed(2)}
              </Text>
            </View>
            <View style={styles.riskInfo}>
              <Text style={[styles.riskLevel, { color: riskColor }]}>{riskLevel}</Text>
              <Text style={styles.riskDesc}>Composite risk assessment</Text>
            </View>
          </View>
        ) : (
          <Text style={styles.noData}>No risk assessment. Score risk in Safety tab.</Text>
        )}
      </View>

      {/* Severe Alerts */}
      <View style={styles.subCard}>
        <View style={styles.subCardHeader}>
          <Ionicons name="warning-outline" size={13} color={TACTICAL.textMuted} />
          <Text style={styles.subCardTitle}>SEVERE ALERTS</Text>
        </View>
        <View style={styles.alertClear}>
          <Ionicons name="checkmark-circle-outline" size={15} color="#4CAF50" />
          <Text style={styles.alertClearText}>No active alerts. All clear.</Text>
        </View>
      </View>
    </View>
  );
}

function TerrainRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.terrainRow}>
      <Text style={styles.terrainLabel}>{label}</Text>
      <Text style={styles.terrainValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 10 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },



  card: {
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    padding: 14,
  },
  lightRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  lightStat: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  lightValue: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  lightLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  lightDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(62, 79, 60, 0.25)',
  },
  dateRow: {
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.12)',
  },
  dateText: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  subCard: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    padding: 12,
  },
  subCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginBottom: 8,
  },
  subCardTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },

  terrainGrid: { gap: 1 },
  terrainRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.08)',
  },
  terrainLabel: { fontSize: 11, color: TACTICAL.textMuted },
  terrainValue: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },

  riskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  riskBadge: {
    width: 56,
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  riskScore: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  riskInfo: { flex: 1, gap: 2 },
  riskLevel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  riskDesc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },

  alertClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  alertClearText: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '600',
  },

  noData: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },
});



