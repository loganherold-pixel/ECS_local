/**
 * SetupCompleteStep — Step 4: Success confirmation.
 *
 * Shows:
 *   - Success icon and message
 *   - Device summary (name, provider, role, battery level)
 *   - Navigation options (Dashboard, Power Systems)
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';
import {
  PROVIDER_DISPLAY,
  DEVICE_ROLE_LABELS,
  type ManagedPowerDevice,
} from '../../lib/powerSetupStore';
import { resolvePowerReadiness } from '../../lib/powerReadiness';

interface Props {
  palette: any;
  device: ManagedPowerDevice;
  onGoToDashboard: () => void;
  onGoToPowerSystems: () => void;
  onAddAnother: () => void;
}

export default function SetupCompleteStep({
  palette,
  device,
  onGoToDashboard,
  onGoToPowerSystems,
  onAddAnother,
}: Props) {
  const display = PROVIDER_DISPLAY[device.provider];
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const readiness = resolvePowerReadiness({
    providerId: device.provider,
    connectionMethod: device.connectionMethod,
    connectionState: device.connectionState,
    hasTelemetry:
      device.lastSocPct != null || device.lastWattsIn != null || device.lastWattsOut != null,
    hasStoredSnapshot:
      device.lastSocPct != null || device.lastWattsIn != null || device.lastWattsOut != null,
  });

  useEffect(() => {
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 60,
        friction: 8,
        useNativeDriver: true,
      }),
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, scaleAnim]);

  const batteryPct = device.lastSocPct;
  const supportColor = readiness.color;

  return (
    <View style={styles.container}>
      {/* Success Icon */}
      <Animated.View
        style={[
          styles.successContainer,
          { transform: [{ scale: scaleAnim }] },
        ]}
      >
        <View style={[styles.successCircleOuter, { borderColor: '#34C759' + '30' }]}>
          <View style={[styles.successCircle, { backgroundColor: '#34C759' + '15' }]}>
            <Ionicons name="checkmark-circle" size={56} color="#34C759" />
          </View>
        </View>
      </Animated.View>

      <Text style={[styles.successTitle, { color: supportColor }]}>Power System Saved</Text>
      <Text style={[styles.successSubtitle, { color: palette.textMuted }]}>
        {readiness.detail}
      </Text>

      {/* Device Summary Card */}
      <Animated.View
        style={[
          styles.summaryCard,
          {
            backgroundColor: palette.panel,
            borderColor: palette.border,
            opacity: fadeAnim,
          },
        ]}
      >
        {/* Device header */}
        <View style={styles.summaryHeader}>
          <View style={[styles.summaryIcon, { backgroundColor: display.color + '12' }]}>
            <Ionicons name={display.icon} size={22} color={display.color} />
          </View>
          <View style={styles.summaryInfo}>
            <Text style={[styles.summaryName, { color: palette.text }]}>
              {device.customName}
            </Text>
            <View style={styles.summaryBrandRow}>
              <Text style={[styles.summaryBrand, { color: display.color }]}>
                {display.label}
              </Text>
              <Text style={[styles.summaryModel, { color: palette.textMuted }]}>
                {device.model}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.summaryDivider, { backgroundColor: GOLD_RAIL.subsection }]} />

        {/* Stats grid */}
        <View style={styles.statsGrid}>
          <View style={styles.statItem}>
            <Ionicons name="battery-half-outline" size={16} color={batteryPct != null ? '#34C759' : palette.textMuted} />
            <Text style={[styles.statValue, { color: batteryPct != null ? '#34C759' : palette.textMuted }]}>
              {batteryPct != null ? `${batteryPct}%` : '—'}
            </Text>
            <Text style={[styles.statLabel, { color: palette.textMuted }]}>BATTERY</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
          <View style={styles.statItem}>
            <Ionicons name={device.isPrimary ? 'star' : 'star-outline'} size={16} color={palette.amber} />
            <Text style={[styles.statValue, { color: palette.text }]}>
              {device.isPrimary ? 'Primary' : 'Secondary'}
            </Text>
            <Text style={[styles.statLabel, { color: palette.textMuted }]}>PRIORITY</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: palette.border }]} />
          <View style={styles.statItem}>
            <Ionicons name={readiness.icon as any} size={16} color={supportColor} />
            <Text style={[styles.statValue, { color: supportColor }]}>{readiness.label}</Text>
            <Text style={[styles.statLabel, { color: palette.textMuted }]}>STATE</Text>
          </View>
        </View>

        <View style={[styles.summaryDivider, { backgroundColor: GOLD_RAIL.subsection }]} />

        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: palette.textMuted }]}>PROVIDER STATE</Text>
          <Text style={[styles.detailValue, { color: supportColor }]}>
            {readiness.label}
          </Text>
        </View>
        <Text style={[styles.supportNote, { color: palette.textMuted }]}>
          {readiness.summary}
        </Text>

        <View style={[styles.summaryDivider, { backgroundColor: GOLD_RAIL.subsection }]} />

        {/* Role */}
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: palette.textMuted }]}>ROLE</Text>
          <Text style={[styles.detailValue, { color: palette.text }]}>
            {DEVICE_ROLE_LABELS[device.role]}
          </Text>
        </View>

        {/* Connection */}
        <View style={styles.detailRow}>
          <Text style={[styles.detailLabel, { color: palette.textMuted }]}>CONNECTION</Text>
          <Text style={[styles.detailValue, { color: palette.text }]}>
            {device.connectionMethod === 'ble' ? 'Bluetooth' : device.connectionMethod === 'cloud' ? 'Cloud API' : 'Manual'}
          </Text>
        </View>

        {/* Vehicle */}
        {device.vehicleId && (
          <View style={styles.detailRow}>
            <Text style={[styles.detailLabel, { color: palette.textMuted }]}>VEHICLE</Text>
            <Text style={[styles.detailValue, { color: palette.text }]}>Assigned</Text>
          </View>
        )}
      </Animated.View>

      {/* Action Buttons */}
      <Animated.View style={[styles.actions, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: palette.amber }]}
          onPress={onGoToDashboard}
          activeOpacity={0.7}
        >
          <Ionicons name="grid-outline" size={16} color="#000" />
          <Text style={styles.primaryBtnText}>RETURN TO DASHBOARD</Text>
        </TouchableOpacity>

        <View style={styles.secondaryRow}>
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: palette.border, flex: 1 }]}
            onPress={onGoToPowerSystems}
            activeOpacity={0.7}
          >
            <Ionicons name="flash-outline" size={14} color={palette.textMuted} />
            <Text style={[styles.secondaryBtnText, { color: palette.textMuted }]}>
              POWER SYSTEMS
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: palette.border, flex: 1 }]}
            onPress={onAddAnother}
            activeOpacity={0.7}
          >
            <Ionicons name="add-outline" size={14} color={palette.textMuted} />
            <Text style={[styles.secondaryBtnText, { color: palette.textMuted }]}>
              ADD ANOTHER
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },

  // Success icon
  successContainer: { marginBottom: 16 },
  successCircleOuter: { borderWidth: 2, borderRadius: 60, padding: 6 },
  successCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  successTitle: { fontSize: 20, fontWeight: '900', letterSpacing: 1, marginBottom: 4 },
  successSubtitle: { fontSize: 13, marginBottom: 20 },

  // Summary card
  summaryCard: { width: '100%', borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: 20 },
  summaryHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  summaryIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  summaryInfo: { flex: 1, gap: 2 },
  summaryName: { fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  summaryBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  summaryBrand: { fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  summaryModel: { fontSize: 11, fontWeight: '500' },
  summaryDivider: { height: 1, marginVertical: SPACING.md },

  // Stats
  statsGrid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  statItem: { alignItems: 'center', gap: 4 },
  statValue: { fontSize: 15, fontWeight: '800', fontFamily: 'Courier' },
  statLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 2 },
  statDivider: { width: 1, height: 36, opacity: 0.3 },

  // Details
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  detailLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  detailValue: { fontSize: 13, fontWeight: '600' },
  supportNote: { fontSize: 11, lineHeight: 16, marginBottom: 2 },

  // Actions
  actions: { width: '100%', gap: SPACING.sm },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: RADIUS.md },
  primaryBtnText: { color: '#000', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  secondaryRow: { flexDirection: 'row', gap: SPACING.sm },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1 },
  secondaryBtnText: { fontSize: 10, fontWeight: '700', letterSpacing: 2 },
});



