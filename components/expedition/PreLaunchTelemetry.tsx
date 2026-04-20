// ============================================================
// PRE-LAUNCH TELEMETRY — Mission Readiness Preview
// ============================================================
// Shown below CollapsedExpeditionBar when expeditionReady=true.
// Previews telemetry gauges, nav controls, and system status
// that will become live after expedition launch.
// ============================================================

import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';

interface Props {
  vehicleName: string | null;
  zoneCount: number;
  loadoutItemCount: number;
  criticalItemCount: number;
  isOnline: boolean;
}

// ── Gauge Component ──────────────────────────────────────────
function ReadinessGauge({
  label,
  value,
  maxValue,
  color,
  icon,
  unit,
}: {
  label: string;
  value: number;
  maxValue: number;
  color: string;
  icon: string;
  unit?: string;
}) {
  const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
  return (
    <View style={gaugeStyles.container}>
      <View style={gaugeStyles.header}>
        <Ionicons name={icon as any} size={12} color={color} />
        <Text style={[gaugeStyles.label, { color }]}>{label}</Text>
      </View>
      <View style={gaugeStyles.track}>
        <View
          style={[
            gaugeStyles.fill,
            { width: `${pct}%`, backgroundColor: color },
          ]}
        />
      </View>
      <Text style={gaugeStyles.value}>
        {value}{unit || ''} <Text style={gaugeStyles.maxValue}>/ {maxValue}{unit || ''}</Text>
      </Text>
    </View>
  );
}

const gaugeStyles = StyleSheet.create({
  container: { flex: 1, gap: 4 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  label: { fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },
  track: {
    height: 4, borderRadius: 2,
    backgroundColor: 'rgba(138,138,133,0.12)',
    overflow: 'hidden',
  },
  fill: { height: 4, borderRadius: 2 },
  value: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  maxValue: { fontSize: 9, color: TACTICAL.textMuted },
});

// ── Main Component ───────────────────────────────────────────
export default function PreLaunchTelemetry({
  vehicleName,
  zoneCount,
  loadoutItemCount,
  criticalItemCount,
  isOnline,
}: Props) {
  const router = useRouter();
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: 3000,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [scanAnim]);

  const scanTranslate = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 400],
  });

  return (
    <View style={styles.container}>
      {/* Section Header */}
      <View style={styles.sectionHeader}>
        <View style={styles.sectionHeaderLeft}>
          <Ionicons name="analytics-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.sectionTitle}>MISSION TELEMETRY</Text>
        </View>
        <View style={styles.prelaunchBadge}>
          <Text style={styles.prelaunchText}>PRE-LAUNCH</Text>
        </View>
      </View>

      {/* Scan line effect */}
      <View style={styles.scanContainer}>
        <Animated.View
          style={[
            styles.scanLine,
            { transform: [{ translateX: scanTranslate }] },
          ]}
        />
      </View>

      {/* System Status Grid */}
      <View style={styles.statusGrid}>
        {[
          {
            icon: 'car-sport-outline',
            label: 'VEHICLE',
            value: vehicleName || 'Configured',
            color: '#4CAF50',
            status: 'READY',
          },
          {
            icon: 'grid-outline',
            label: 'ZONES',
            value: `${zoneCount} configured`,
            color: '#4CAF50',
            status: 'READY',
          },
          {
            icon: 'cube-outline',
            label: 'LOADOUT',
            value: `${loadoutItemCount} items`,
            color: '#4CAF50',
            status: 'PACKED',
          },
          {
            icon: 'alert-circle-outline',
            label: 'CRITICAL',
            value: `${criticalItemCount} items`,
            color: criticalItemCount > 0 ? TACTICAL.amber : '#4CAF50',
            status: criticalItemCount > 0 ? 'MONITOR' : 'CLEAR',
          },
        ].map((sys, i) => (
          <View key={i} style={styles.statusCard}>
            <View style={[styles.statusIconWrap, { backgroundColor: `${sys.color}15` }]}>
              <Ionicons name={sys.icon as any} size={14} color={sys.color} />
            </View>
            <View style={styles.statusInfo}>
              <Text style={styles.statusLabel}>{sys.label}</Text>
              <Text style={styles.statusValue} numberOfLines={1}>{sys.value}</Text>
            </View>
            <View style={[styles.statusBadge, { borderColor: `${sys.color}60` }]}>
              <Text style={[styles.statusBadgeText, { color: sys.color }]}>{sys.status}</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Readiness Gauges */}
      <View style={styles.gaugesRow}>
        <ReadinessGauge
          label="GEAR"
          value={loadoutItemCount}
          maxValue={Math.max(loadoutItemCount, 1)}
          color="#4CAF50"
          icon="cube-outline"
          unit=" items"
        />
        <View style={styles.gaugeDivider} />
        <ReadinessGauge
          label="ZONES"
          value={zoneCount}
          maxValue={Math.max(zoneCount, 1)}
          color="#4FC3F7"
          icon="grid-outline"
        />
        <View style={styles.gaugeDivider} />
        <ReadinessGauge
          label="READINESS"
          value={100}
          maxValue={100}
          color="#4CAF50"
          icon="shield-checkmark-outline"
          unit="%"
        />
      </View>

      {/* Quick Navigation Controls */}
      <View style={styles.navControlsSection}>
        <Text style={styles.navControlsTitle}>QUICK ACCESS</Text>
        <View style={styles.navControlsRow}>
          {[
            { icon: 'navigate-outline', label: 'NAV', route: '/(tabs)/navigate', color: '#4FC3F7' },
            { icon: 'map-outline', label: 'ROUTE', route: '/(tabs)/route', color: TACTICAL.amber },
            { icon: 'cube-outline', label: 'LOADOUT', route: '/(tabs)/fleet', color: '#7C4DFF' },

            { icon: 'car-sport-outline', label: 'VEHICLE', route: '/(tabs)/vehicle-config', color: '#FF9500' },
            { icon: 'cloud-outline', label: 'WEATHER', route: '/(tabs)/alert', color: '#4CAF50' },

          ].map((nav) => (
            <TouchableOpacity
              key={nav.label}
              style={styles.navControlBtn}
              onPress={() => router.push(nav.route as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.navControlIcon, { backgroundColor: `${nav.color}12`, borderColor: `${nav.color}30` }]}>
                <Ionicons name={nav.icon as any} size={16} color={nav.color} />
              </View>
              <Text style={styles.navControlLabel}>{nav.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Connection Status */}
      <View style={styles.connectionBar}>
        <View style={[styles.connectionDot, { backgroundColor: isOnline ? '#4CAF50' : '#E53935' }]} />
        <Text style={[styles.connectionText, { color: isOnline ? '#4CAF50' : '#E53935' }]}>
          {isOnline ? 'CLOUD SYNC ACTIVE' : 'OFFLINE MODE'}
        </Text>
        <View style={styles.connectionSpacer} />
        <Text style={styles.connectionTimestamp}>
          SYSTEMS NOMINAL
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    overflow: 'hidden',
  },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  prelaunchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.3)',
  },
  prelaunchText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  scanContainer: {
    height: 1,
    backgroundColor: 'rgba(138,138,133,0.08)',
    overflow: 'hidden',
    marginHorizontal: 14,
  },
  scanLine: {
    width: 80,
    height: 1,
    backgroundColor: 'rgba(76, 175, 80, 0.4)',
  },

  // Status Grid
  statusGrid: {
    paddingHorizontal: 14,
    paddingTop: 10,
    gap: 6,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
  },
  statusIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  statusValue: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    marginTop: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // Gauges
  gaugesRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 14,
    paddingTop: 12,
    gap: 0,
  },
  gaugeDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(62, 79, 60, 0.2)',
    marginHorizontal: 10,
    marginTop: 4,
  },

  // Nav Controls
  navControlsSection: {
    paddingHorizontal: 14,
    paddingTop: 14,
  },
  navControlsTitle: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 8,
  },
  navControlsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 6,
  },
  navControlBtn: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  navControlIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  navControlLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // Connection Bar
  connectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.15)',
  },
  connectionDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  connectionText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  connectionSpacer: { flex: 1 },
  connectionTimestamp: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    fontFamily: 'Courier',
  },
});



