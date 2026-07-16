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
  StyleSheet,
  Animated,
  Platform,
  Linking,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECSButton } from '../ECSButton';
import { TACTICAL, TYPO } from '../../lib/theme';
import { useReducedMotion } from '../../lib/ecsAnimations';
import type { GPSLocationOutput } from '../../lib/useGPSLocation';
import {
  resolveForegroundLocationPermissionRecoveryAction,
  type ForegroundLocationPermissionState,
} from '../../lib/locationPermissions';

interface Props {
  gpsStatus: GPSLocationOutput['gpsStatus'];
  fixQuality: GPSLocationOutput['fixQuality'];
  hasFix: boolean;
  retryCount: number;
  permissionDenied: boolean;
  permissionState: ForegroundLocationPermissionState;
  canAskAgain: boolean | null;
  permissionRequestPending: boolean;
  error: string | null;
  onRetry: () => void;
  onRequestPermission: () => Promise<void>;
  /** Whether the map has finished loading */
  mapReady: boolean;
  topOffset?: number;
  bottomOffset?: number;
  horizontalInset?: number;
  maxWidth?: number;
}

export default function GPSStatusOverlay({
  gpsStatus,
  fixQuality,
  hasFix,
  retryCount,
  permissionDenied,
  permissionState,
  canAskAgain,
  permissionRequestPending,
  error,
  onRetry,
  onRequestPermission,
  mapReady,
  topOffset = 8,
  bottomOffset,
  horizontalInset = 8,
  maxWidth = 320,
}: Props) {
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const [dismissed, setDismissed] = useState(false);
  const reducedMotion = useReducedMotion();

  // Pulse animation for the locating indicator
  useEffect(() => {
    if (reducedMotion) {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
      return undefined;
    }
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
  }, [hasFix, permissionDenied, pulseAnim, reducedMotion]);

  // Fade out when GPS fix acquired
  useEffect(() => {
    if (hasFix && !dismissed) {
      // Brief delay to let the map center before fading
      const timer = setTimeout(() => {
        if (reducedMotion) {
          fadeAnim.setValue(0);
          setDismissed(true);
          return;
        }
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
  }, [hasFix, fadeAnim, dismissed, reducedMotion]);

  useEffect(() => {
    if ((hasFix && permissionState === 'granted') || !dismissed) return;
    fadeAnim.setValue(1);
    setDismissed(false);
  }, [dismissed, fadeAnim, hasFix, permissionState]);

  // Don't render if dismissed or already have fix and animation complete
  if (dismissed) return null;

  // Don't show overlay until map is ready (map has its own loading overlay)
  if (!mapReady && !permissionDenied) return null;

  const effectivePermissionState = permissionState === 'unknown' && permissionDenied
    ? canAskAgain === false
      ? 'blocked'
      : 'denied_requestable'
    : permissionState;
  const recoveryAction = resolveForegroundLocationPermissionRecoveryAction(
    effectivePermissionState,
    Platform.OS === 'web' ? 'web' : 'native',
  );
  const permissionRequestable = recoveryAction === 'request_in_app';
  const permissionBlocked =
    effectivePermissionState === 'blocked' || effectivePermissionState === 'restricted';

  // ── Permission Recovery State ────────────────────────
  if (permissionRequestable || permissionBlocked) {
    const canOpenNativeSettings = recoveryAction === 'open_native_settings';
    const title = permissionRequestable ? 'LOCATION PERMISSION' : 'LOCATION BLOCKED';
    const message = permissionRequestable
      ? 'The map remains available. Allow location to show your position and enable camera follow.'
      : effectivePermissionState === 'restricted'
        ? 'The map remains available. Device policy currently restricts location access.'
        : 'The map remains available. Location access is blocked for ECS.';
    const overlayPosition =
      bottomOffset != null
        ? { bottom: bottomOffset, left: horizontalInset, right: horizontalInset }
        : { top: topOffset, left: horizontalInset, right: horizontalInset };

    return (
      <View
        style={[styles.acquiringOverlay, overlayPosition]}
        pointerEvents="box-none"
      >
        <View
          style={[styles.acquiringBanner, styles.permissionBanner, { maxWidth }]}
        >
          <Ionicons name="location-outline" size={18} color={TACTICAL.amber} />
          <View style={styles.acquiringContent}>
          <Text
            style={styles.permissionTitle}
            accessible
            accessibilityRole="alert"
            accessibilityLiveRegion="assertive"
            accessibilityLabel={`${title}. ${message}`}
          >
            {title}
          </Text>
            <Text style={styles.acquiringHint}>{message}</Text>
          </View>
          <ECSButton
            label={canOpenNativeSettings ? 'OPEN SETTINGS' : 'RETRY PERMISSION'}
            icon={canOpenNativeSettings ? 'settings-outline' : 'location-outline'}
            variant="secondary"
            size="compact"
            loading={!canOpenNativeSettings && permissionRequestPending}
            accessibilityLabel={canOpenNativeSettings ? 'Open location settings' : 'Retry location permission'}
            accessibilityHint={
              canOpenNativeSettings
                ? 'Opens system settings. The map remains usable without location.'
                : 'Opens the supported system or browser permission request in ECS.'
            }
            onPress={() => {
              if (!canOpenNativeSettings) {
                void onRequestPermission();
              } else if (Platform.OS === 'ios') {
                void Linking.openURL('app-settings:');
              } else if (Platform.OS === 'android') {
                void Linking.openSettings();
              }
            }}
          />
        </View>
      </View>
    );
  }

  // ── Acquiring / Retrying State ───────────────────────
  if (!hasFix) {
    const terminalUnavailable =
      gpsStatus === 'UNAVAILABLE'
      || gpsStatus === 'OFFLINE'
      || (Boolean(error) && gpsStatus !== 'ACQUIRING' && gpsStatus !== 'RETRYING');
    const isRetrying = gpsStatus === 'RETRYING';
    const statusLabel = isRetrying
      ? `REFRESHING LOCATION${retryCount > 0 ? ` (${retryCount})` : ''}`
      : 'LOCATING POSITION';
    const overlayPosition =
      bottomOffset != null
        ? { bottom: bottomOffset, left: horizontalInset, right: horizontalInset }
        : { top: topOffset, left: horizontalInset, right: horizontalInset };

    if (terminalUnavailable) {
      const unavailableMessage = gpsStatus === 'OFFLINE'
        ? 'Location tracking stopped. Saved map context remains available.'
        : gpsStatus === 'UNAVAILABLE'
          ? 'No location provider is currently available. Saved map context remains available.'
          : 'ECS could not acquire a current position. Saved map context remains available.';

      return (
        <View
          style={[styles.acquiringOverlay, overlayPosition]}
          pointerEvents="box-none"
        >
          <View
            style={[styles.acquiringBanner, styles.unavailableBanner, { maxWidth }]}
          >
            <Ionicons name="location-outline" size={18} color={TACTICAL.danger} />
            <View style={styles.acquiringContent}>
              <Text
                style={[styles.acquiringLabel, styles.unavailableLabel]}
                accessible
                accessibilityRole="alert"
                accessibilityLiveRegion="assertive"
                accessibilityLabel={`Location unavailable. ${unavailableMessage}`}
              >
                LOCATION UNAVAILABLE
              </Text>
              <Text style={styles.acquiringHint}>{unavailableMessage}</Text>
            </View>
            <ECSButton
              label="CHECK AGAIN"
              variant="secondary"
              size="compact"
              onPress={onRetry}
              accessibilityLabel="Check location service again"
              accessibilityHint="Rechecks location service availability without opening settings."
            />
          </View>
        </View>
      );
    }

    return (
      <Animated.View
        style={[
          styles.acquiringOverlay,
          { opacity: fadeAnim },
          overlayPosition,
        ]}
        pointerEvents="box-none"
      >
        <View
          style={[styles.acquiringBanner, { maxWidth }]}
          accessible
          accessibilityRole="progressbar"
          accessibilityLiveRegion="polite"
          accessibilityState={{ busy: true }}
          accessibilityValue={{ text: statusLabel }}
          accessibilityLabel={`${statusLabel}. ${isRetrying ? 'GPS signal is weak. ECS is retrying.' : 'Getting a position fix for Navigate.'}`}
        >
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
                ? 'GPS signal is weak. ECS will keep trying.'
                : 'Getting a position fix for Navigate.'}
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
  const overlayPosition =
    bottomOffset != null
      ? { bottom: bottomOffset, left: horizontalInset, right: horizontalInset }
      : { top: topOffset, left: horizontalInset, right: horizontalInset };

  return (
    <Animated.View
      style={[
        styles.acquiringOverlay,
        { opacity: fadeAnim },
        overlayPosition,
      ]}
      pointerEvents="none"
    >
      <View
        style={[styles.acquiringBanner, styles.acquiredBanner, { maxWidth }]}
        accessible
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Location live. ${fixQuality.toLowerCase()} accuracy fix.`}
      >
        <View style={styles.acquiredDot} />
        <View style={styles.acquiringContent}>
          <Text style={[styles.acquiringLabel, styles.acquiredLabel]}>
            LOCATION LIVE
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
  permissionBanner: {
    borderColor: 'rgba(196,138,44,0.55)',
  },
  permissionTitle: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 10,
    letterSpacing: 1.8,
  },

  // ── Acquiring / Locating ──────────────────────────────
  acquiringOverlay: {
    position: 'absolute',
    zIndex: 40,
    alignItems: 'flex-start',
  },
  acquiringBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(11,15,18,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.35)',
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
  unavailableBanner: {
    borderColor: 'rgba(192,57,43,0.55)',
  },
  acquiringContent: {
    flex: 1,
    gap: 2,
  },
  acquiringLabel: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2.4,
    color: TACTICAL.amber,
    textTransform: 'uppercase' as any,
  },
  acquiredLabel: {
    color: TACTICAL.successText,
  },
  unavailableLabel: {
    color: TACTICAL.danger,
  },
  acquiringHint: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    letterSpacing: 0.35,
  },

  // ── Pulse Ring ────────────────────────────────────────
  pulseRing: {
    position: 'absolute',
    left: 8,
    width: 22,
    height: 22,
    borderRadius: 11,
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



