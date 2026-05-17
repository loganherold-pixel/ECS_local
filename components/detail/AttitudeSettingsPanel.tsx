/**
 * AttitudeSettingsPanel
 *
 * Toggle for "Enable Advanced Stability Modeling" within the Expedition tab.
 * When enabled, the Attitude Monitor reads weight modules dynamically from load zones.
 * When disabled, standard safe thresholds apply (simplified CG estimate).
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { TACTICAL } from '../../lib/theme';

interface Props {
  advancedEnabled: boolean;
  onToggle: (value: boolean) => void;
  hasSufficientData: boolean;
}

export default function AttitudeSettingsPanel({ advancedEnabled, onToggle, hasSufficientData }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        {/* Tactical glyph icon — settings gear */}
        <View style={styles.iconWrap}>
          <View style={styles.gearOuter}>
            <View style={styles.gearInner} />
            <View style={[styles.gearTooth, { top: -2, left: 5.5 }]} />
            <View style={[styles.gearTooth, { bottom: -2, left: 5.5 }]} />
            <View style={[styles.gearTooth, { left: -2, top: 5.5 }]} />
            <View style={[styles.gearTooth, { right: -2, top: 5.5 }]} />
          </View>
        </View>
        <Text style={styles.headerTitle}>ECS STABILITY MODEL</Text>
      </View>

      <TouchableOpacity
        style={styles.toggleRow}
        onPress={() => onToggle(!advancedEnabled)}
        activeOpacity={0.7}
      >
        <View style={styles.toggleInfo}>
          <Text style={styles.toggleLabel}>Advanced stability model</Text>
          <Text style={styles.toggleDesc}>
            {advancedEnabled
              ? 'Live load-zone weighting and dynamic CG are active'
              : 'Using the standard ECS attitude model'}
          </Text>
        </View>

        {/* Custom toggle switch */}
        <View style={[styles.toggleTrack, advancedEnabled && styles.toggleTrackActive]}>
          <View style={[styles.toggleThumb, advancedEnabled && styles.toggleThumbActive]} />
        </View>
      </TouchableOpacity>

      {advancedEnabled && !hasSufficientData && (
        <View style={styles.warningRow}>
          {/* Warning triangle glyph */}
          <View style={styles.warningIcon}>
            <View style={styles.warningTriangle} />
            <View style={styles.warningDot} />
          </View>
          <Text style={styles.warningText}>
            Limited load data — standard ECS model in use
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(10,14,18,0.92)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    padding: 16,
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  iconWrap: {
    width: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearOuter: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearInner: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
  },
  gearTooth: {
    position: 'absolute',
    width: 3,
    height: 3,
    backgroundColor: TACTICAL.amber,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.8,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleInfo: {
    flex: 1,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  toggleDesc: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    marginTop: 2,
    lineHeight: 14,
  },
  toggleTrack: {
    width: 44,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 2,
    justifyContent: 'center',
  },
  toggleTrackActive: {
    backgroundColor: 'rgba(196, 138, 44, 0.25)',
    borderColor: TACTICAL.amber,
  },
  toggleThumb: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  toggleThumbActive: {
    backgroundColor: TACTICAL.amber,
    alignSelf: 'flex-end',
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
  },
  warningIcon: {
    width: 14,
    height: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  warningTriangle: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: TACTICAL.amber,
  },
  warningDot: {
    position: 'absolute',
    bottom: 1,
    width: 2,
    height: 2,
    backgroundColor: '#0B0F12',
    borderRadius: 1,
  },
  warningText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.amber,
    flex: 1,
    letterSpacing: 0.3,
  },
});



