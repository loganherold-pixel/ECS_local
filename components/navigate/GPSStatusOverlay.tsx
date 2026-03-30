/**
 * GPSStatusOverlay — Navigate Tab GPS Status UI
 *
 * Non-blocking overlay that displays GPS acquisition status:
 *   - "Locating..." with subtle pulse animation while acquiring
 *   - "Retrying..." with attempt count when GPS temporarily unavailable
 *   - Permission denied prompt with explanation and settings link
 *   - Fades out automatically when GPS fix is acquired
 *
 * Does NOT block the entire screen — map remains visible beneath.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  Linking,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import type { GPSLocationOutput } from '../../lib/useGPSLocation';

interface Props {
  gpsStatus: GPSLocationOutput['gpsStatus'];
  fixQuality: GPSLocationOutput['fixQuality'];
  hasFix: boolean;
  retryCount: number;
  permissionDenied: boolean;
  error: string | null;
  onRetry: () => void;
  /** Whether the map has finished loading */
  mapReady: boolean;
}

export default function GPSStatusOverlay({
  gpsStatus,
  fixQuality,
  hasFix,
  retryCount,
  permissionDenied,
  error,
  onRetry,
  mapReady,
}: Props) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const [dismissed, setDismissed] = useState(false);

  // Pulse animation for the locating indicator
  useEffect(() => {
    if (!hasFix && !permissionDenied) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1200,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 1200,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [hasFix, permissionDenied, pulseAnim]);

  // Fade out when GPS fix acquired
  useEffect(() => {
    if (hasFix && !dismissed) {
      // Brief delay to let the map center before fading
      const timer = setTimeout(() => {
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 600,
          useNativeDriver: true,
        }).start(() => {
          setDismissed(true);
        });
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [hasFix, fadeAnim, dismissed]);

  // Don't render if dismissed or already have fix and animation complete
  if (dismissed) return null;

  // Don't show overlay until map is ready (map has its own loading overlay)
  if (!mapReady && !permissionDenied) return null;

  // ── Permission Denied State ──────────────────────────
  if (permissionDenied) {
    return (
      <View style={styles.deniedContainer}>
        <View style={styles.deniedCard}>
          <View style={styles.deniedIconWrap}>
            <Ionicons name="location-outline" size={28} color={TACTICAL.danger} />
            <View style={styles.deniedSlash} />
          </View>
          <Text style={styles.deniedTitle}>LOCATION ACCESS REQUIRED</Text>
          <Text style={styles.deniedBody}>
            ECS Navigate requires GPS access to center the map on your position,
            track trails, and provide real-time navigation features.
          </Text>
          <Text style={styles.deniedHint}>
            Enable location access in your device settings to use navigation.
          </Text>
          <View style={styles.deniedActions}>
            <TouchableOpacity
              style={styles.deniedSettingsBtn}
              onPress={() => {
                if (Platform.OS === 'ios') {
                  Linking.openURL('app-settings:');
                } else if (Platform.OS === 'android') {
                  Linking.openSettings();
                } else {
                  // Web — can't open settings, just retry
                  onRetry();
                }
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={14} color="#0B0F12" />
              <Text style={styles.deniedSettingsBtnText}>
                {Platform.OS === 'web' ? 'RETRY PERMISSION' : 'OPEN SETTINGS'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deniedDismissBtn}
              onPress={() => setDismissed(true)}
              activeOpacity={0.8}
            >
              <Text style={styles.deniedDismissBtnText}>CONTINUE WITHOUT GPS</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Acquiring / Retrying State ───────────────────────
  if (!hasFix) {
    const isRetrying = gpsStatus === 'RETRYING';
    const statusLabel = isRetrying
      ? `RETRYING${retryCount > 0 ? ` (${retryCount})` : ''}...`
      : 'LOCATING...';

    return (
      <Animated.View
        style={[styles.acquiringOverlay, { opacity: fadeAnim }]}
        pointerEvents="box-none"
      >
        <View style={styles.acquiringBanner}>
          {/* Animated pulse ring */}
          <Animated.View
            style={[
              styles.pulseRing,
              { opacity: pulseAnim, transform: [{ scale: pulseAnim }] },
            ]}
          />
          <View style={styles.locatingDot} />
          <View style={styles.acquiringContent}>
            <Text style={styles.acquiringLabel}>{statusLabel}</Text>
            <Text style={styles.acquiringHint}>
              {isRetrying
                ? 'GPS signal temporarily unavailable'
                : 'Acquiring GPS signal for map centering'}
            </Text>
          </View>
          {/* Fix quality indicator placeholder */}
          <View style={styles.signalBars}>
            <View style={[styles.signalBar, styles.signalBar1, isRetrying && styles.signalBarDim]} />
            <View style={[styles.signalBar, styles.signalBar2, styles.signalBarDim]} />
            <View style={[styles.signalBar, styles.signalBar3, styles.signalBarDim]} />
          </View>
        </View>
      </Animated.View>
    );
  }

  // ── Fix Acquired — Fading Out ────────────────────────
  return (
    <Animated.View
      style={[styles.acquiringOverlay, { opacity: fadeAnim }]}
      pointerEvents="none"
    >
      <View style={[styles.acquiringBanner, styles.acquiredBanner]}>
        <View style={styles.acquiredDot} />
        <View style={styles.acquiringContent}>
          <Text style={[styles.acquiringLabel, styles.acquiredLabel]}>
            GPS LOCKED
          </Text>
          <Text style={styles.acquiringHint}>
            {fixQuality === 'HIGH'
              ? 'High accuracy fix'
              : fixQuality === 'MEDIUM'
                ? 'Medium accuracy fix'
                : 'Low accuracy fix'}
          </Text>
        </View>
        <View style={styles.signalBars}>
          <View style={[styles.signalBar, styles.signalBar1, styles.signalBarActive]} />
          <View style={[styles.signalBar, styles.signalBar2, fixQuality !== 'LOW' && styles.signalBarActive]} />
          <View style={[styles.signalBar, styles.signalBar3, fixQuality === 'HIGH' && styles.signalBarActive]} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // ── Permission Denied ─────────────────────────────────
  deniedContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 50,
    backgroundColor: 'rgba(11,15,18,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  deniedCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(192,57,43,0.4)',
    padding: 28,
    maxWidth: 380,
    width: '100%',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    elevation: 12,
  },
  deniedIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(192,57,43,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  deniedSlash: {
    position: 'absolute',
    width: 36,
    height: 2,
    backgroundColor: TACTICAL.danger,
    transform: [{ rotate: '45deg' }],
    opacity: 0.6,
  },
  deniedTitle: {
    ...TYPO.T2,
    color: TACTICAL.danger,
    textAlign: 'center',
    letterSpacing: 4,
  },
  deniedBody: {
    ...TYPO.B2,
    color: TACTICAL.text,
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 13,
  },
  deniedHint: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    fontSize: 11,
    lineHeight: 17,
  },
  deniedActions: {
    width: '100%',
    gap: 10,
    marginTop: 8,
  },
  deniedSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TACTICAL.amber,
    paddingVertical: 14,
    borderRadius: 10,
  },
  deniedSettingsBtnText: {
    ...TYPO.U1,
    color: '#0B0F12',
    letterSpacing: 3,
    fontSize: 12,
  },
  deniedDismissBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  deniedDismissBtnText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    letterSpacing: 3,
  },

  // ── Acquiring / Locating ──────────────────────────────
  acquiringOverlay: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    zIndex: 40,
    alignItems: 'center',
  },
  acquiringBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(11,15,18,0.92)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.35)',
    maxWidth: 360,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 8,
  },
  acquiredBanner: {
    borderColor: 'rgba(62,107,62,0.5)',
  },
  acquiringContent: {
    flex: 1,
    gap: 2,
  },
  acquiringLabel: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
    color: TACTICAL.amber,
    textTransform: 'uppercase' as any,
  },
  acquiredLabel: {
    color: TACTICAL.successText,
  },
  acquiringHint: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Pulse Ring ────────────────────────────────────────
  pulseRing: {
    position: 'absolute',
    left: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: TACTICAL.amber,
    backgroundColor: 'transparent',
  },

  // ── Locating Dot ──────────────────────────────────────
  locatingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: TACTICAL.amber,
    borderWidth: 2,
    borderColor: 'rgba(196,138,44,0.4)',
  },
  acquiredDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: TACTICAL.successText,
    borderWidth: 2,
    borderColor: 'rgba(62,107,62,0.4)',
  },

  // ── Signal Bars ───────────────────────────────────────
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
  },
  signalBar: {
    width: 4,
    borderRadius: 1,
    backgroundColor: TACTICAL.amber,
  },
  signalBar1: {
    height: 6,
  },
  signalBar2: {
    height: 10,
  },
  signalBar3: {
    height: 16,
  },
  signalBarDim: {
    backgroundColor: 'rgba(138,138,133,0.25)',
  },
  signalBarActive: {
    backgroundColor: TACTICAL.successText,
  },
});



