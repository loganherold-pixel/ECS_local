// ============================================================
// COLLAPSED EXPEDITION BAR — Compact Mission-Ready Status Bar
// ============================================================
// Shown when WizardStateContext.expeditionReady === true.
// Replaces the full ExpeditionBuilder with a slim bar showing:
//   • Vehicle/expedition name
//   • Step completion dots (all green)
//   • Prominent LAUNCH button
//   • Chevron toggle to re-expand the builder
// ============================================================

import React, { useRef, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  Animated, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';

interface Props {
  vehicleName: string | null;
  expeditionTitle: string | null;
  stepCount: number;
  completedSteps: number;
  zoneCount: number;
  onLaunch: () => void;
  onExpand: () => void;
  launching?: boolean;
}

export default function CollapsedExpeditionBar({
  vehicleName,
  expeditionTitle,
  stepCount,
  completedSteps,
  zoneCount,
  onLaunch,
  onExpand,
  launching = false,
}: Props) {
  // ── Pulse animation for the LAUNCH button ──────────────────
  const pulseAnim = useRef(new Animated.Value(0.85)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0.85, duration: 1200, useNativeDriver: true }),
      ])
    );
    const glow = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.7, duration: 2000, useNativeDriver: true }),
        Animated.timing(glowAnim, { toValue: 0.3, duration: 2000, useNativeDriver: true }),
      ])
    );
    pulse.start();
    glow.start();
    return () => { pulse.stop(); glow.stop(); };
  }, [glowAnim, pulseAnim]);

  const displayName = expeditionTitle || vehicleName || 'Expedition';
  const isAllComplete = completedSteps >= stepCount;

  return (
    <View style={styles.container}>
      {/* Green glow background */}
      <Animated.View style={[styles.glowBg, { opacity: glowAnim }]} />

      {/* Top accent line */}
      <View style={styles.accentLine} />

      {/* Main content row */}
      <View style={styles.mainRow}>
        {/* Left: Status icon + info */}
        <View style={styles.leftSection}>
          <View style={styles.shieldIcon}>
            <Ionicons name="shield-checkmark" size={18} color="#0B0F12" />
          </View>
          <View style={styles.infoColumn}>
            <View style={styles.readyBadgeRow}>
              <View style={styles.readyDot} />
              <Text style={styles.readyLabel}>MISSION READY</Text>
            </View>
            <Text style={styles.expeditionName} numberOfLines={1}>
              {displayName}
            </Text>
            {/* Step completion dots */}
            <View style={styles.stepDotsRow}>
              {Array.from({ length: stepCount }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.stepDot,
                    i < completedSteps && styles.stepDotComplete,
                  ]}
                >
                  {i < completedSteps && (
                    <Ionicons name="checkmark" size={7} color="#4CAF50" />
                  )}
                </View>
              ))}
              {zoneCount > 0 && (
                <Text style={styles.zoneCountText}>{zoneCount} zones</Text>
              )}
            </View>
          </View>
        </View>

        {/* Right: LAUNCH button + expand chevron */}
        <View style={styles.rightSection}>
          <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
            <TouchableOpacity
              style={[styles.launchButton, launching && styles.launchButtonDisabled]}
              onPress={onLaunch}
              activeOpacity={0.8}
              disabled={launching}
            >
              <Ionicons
                name={launching ? 'hourglass-outline' : 'rocket'}
                size={16}
                color="#0B0F12"
              />
              <Text style={styles.launchButtonText}>
                {launching ? 'LAUNCHING...' : 'LAUNCH'}
              </Text>
            </TouchableOpacity>
          </Animated.View>

          <TouchableOpacity
            style={styles.expandButton}
            onPress={onExpand}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="chevron-down" size={18} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom info strip */}
      <View style={styles.bottomStrip}>
        <View style={styles.stripItem}>
          <Ionicons name="checkmark-done-outline" size={10} color="#4CAF50" />
          <Text style={styles.stripText}>
            {completedSteps}/{stepCount} STEPS
          </Text>
        </View>
        <View style={styles.stripDivider} />
        <View style={styles.stripItem}>
          <Ionicons name="shield-checkmark-outline" size={10} color="#4CAF50" />
          <Text style={styles.stripText}>ALL SYSTEMS GO</Text>
        </View>
        <View style={styles.stripDivider} />
        <View style={styles.stripItem}>
          <Ionicons name="time-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={styles.stripText}>READY TO DEPLOY</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(76, 175, 80, 0.06)',
    borderWidth: 1.5,
    borderColor: 'rgba(76, 175, 80, 0.5)',
    overflow: 'hidden',
    position: 'relative',
  },
  glowBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(76, 175, 80, 0.06)',
    zIndex: 0,
  },
  accentLine: {
    height: 3,
    backgroundColor: '#4CAF50',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },

  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    zIndex: 1,
  },

  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  shieldIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  infoColumn: {
    flex: 1,
    gap: 2,
  },
  readyBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  readyDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  readyLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 2,
  },
  expeditionName: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  stepDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  stepDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepDotComplete: {
    backgroundColor: 'rgba(76, 175, 80, 0.2)',
    borderColor: 'rgba(76, 175, 80, 0.6)',
  },
  zoneCountText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    marginLeft: 4,
    letterSpacing: 0.5,
  },

  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  launchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    shadowColor: '#4CAF50',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  launchButtonDisabled: {
    backgroundColor: 'rgba(76, 175, 80, 0.5)',
    shadowOpacity: 0,
  },
  launchButtonText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },
  expandButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(76, 175, 80, 0.15)',
    zIndex: 1,
  },
  stripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stripText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  stripDivider: {
    width: 1,
    height: 10,
    backgroundColor: 'rgba(62, 79, 60, 0.3)',
    marginHorizontal: 10,
  },
});



