/**
 * ═══════════════════════════════════════════════════════════
 * ECS TELEMETRY PLACEHOLDER — Phase 7
 * ═══════════════════════════════════════════════════════════
 *
 * Standardized placeholder card for telemetry-dependent widgets
 * when no device, sensor, or telemetry source is connected.
 *
 * Design:
 *   - Clean ECS styling consistent with dashboard widgets
 *   - Subtle iconography (not warning-heavy or alarming)
 *   - Same grid space as active widgets (no layout reflow)
 *   - Widget titles remain visible
 *   - Optional "Connect Device" action
 *   - Smooth fade transition when telemetry becomes available
 *   - Works in both full and compact modes
 *
 * Usage:
 *   <TelemetryPlaceholder
 *     state="awaiting_connection"
 *     widgetTitle="EcoFlow Power"
 *     compact={false}
 *     onConnectDevice={() => router.push('/power')}
 *   />
 */

import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import type { TelemetryAvailability } from '../../lib/telemetryStateEngine';

// ── Props ────────────────────────────────────────────────────
export interface TelemetryPlaceholderProps {
  /** The telemetry availability state */
  state: TelemetryAvailability;
  /** Optional widget title to display above the placeholder */
  widgetTitle?: string;
  /** Whether to render in compact mode (collapsed bar) */
  compact?: boolean;
  /** Callback when "Connect Device" is tapped */
  onConnectDevice?: () => void;
  /** Whether to show the connect device action */
  showConnectAction?: boolean;
  /** Custom primary message override */
  primaryMessage?: string;
  /** Custom secondary message override */
  secondaryMessage?: string;
  /** Custom icon name override */
  iconName?: string;
}

// ── State-specific styling ───────────────────────────────────
const STATE_CONFIG: Record<TelemetryAvailability, {
  icon: string;
  iconColor: string;
  primary: string;
  secondary: string | null;
  accentColor: string;
  bgTint: string;
}> = {
  connected: {
    icon: 'checkmark-circle-outline',
    iconColor: '#4CAF50',
    primary: 'Connected',
    secondary: null,
    accentColor: '#4CAF50',
    bgTint: 'rgba(76,175,80,0.04)',
  },
  awaiting_connection: {
    icon: 'bluetooth-outline',
    iconColor: 'rgba(212,175,55,0.5)',
    primary: 'Awaiting Device Connection',
    secondary: 'Connect a compatible power or telemetry source to activate live data.',
    accentColor: 'rgba(212,175,55,0.6)',
    bgTint: 'rgba(212,175,55,0.03)',
  },
  unavailable: {
    icon: 'close-circle-outline',
    iconColor: 'rgba(255,255,255,0.25)',
    primary: 'Telemetry Source Unavailable',
    secondary: 'This source is not supported for the current configuration.',
    accentColor: 'rgba(255,255,255,0.3)',
    bgTint: 'rgba(255,255,255,0.02)',
  },
  error: {
    icon: 'alert-circle-outline',
    iconColor: 'rgba(239,83,80,0.5)',
    primary: 'Live Data Temporarily Unavailable',
    secondary: 'Telemetry will resume automatically when the connection is restored.',
    accentColor: 'rgba(239,83,80,0.5)',
    bgTint: 'rgba(239,83,80,0.03)',
  },
};

// ── Component ────────────────────────────────────────────────
export default function TelemetryPlaceholder({
  state,
  widgetTitle,
  compact = false,
  onConnectDevice,
  showConnectAction,
  primaryMessage,
  secondaryMessage,
  iconName,
}: TelemetryPlaceholderProps) {
  const config = STATE_CONFIG[state] || STATE_CONFIG.awaiting_connection;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Fade in on mount
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, []);

  // Resolve display values
  const displayIcon = iconName || config.icon;
  const displayPrimary = primaryMessage || config.primary;
  const displaySecondary = secondaryMessage !== undefined ? secondaryMessage : config.secondary;
  const displayAccent = config.accentColor;

  // Determine if connect action should show
  const shouldShowConnect = showConnectAction !== undefined
    ? showConnectAction
    : (state === 'awaiting_connection' && onConnectDevice != null);

  // ── Compact Mode ───────────────────────────────────────────
  if (compact) {
    return (
      <Animated.View style={[styles.compactContainer, { opacity: fadeAnim }]}>
        <Ionicons name={displayIcon} size={12} color={displayAccent} />
        <Text style={[styles.compactText, { color: displayAccent }]} numberOfLines={1}>
          {state === 'awaiting_connection' ? 'AWAITING' :
           state === 'unavailable' ? 'N/A' :
           state === 'error' ? 'ERROR' : 'OK'}
        </Text>
      </Animated.View>
    );
  }

  // ── Full Mode ──────────────────────────────────────────────
  return (
    <Animated.View style={[
      styles.container,
      { opacity: fadeAnim, backgroundColor: config.bgTint },
    ]}>
      {/* Icon */}
      <View style={styles.iconContainer}>
        <Ionicons name={displayIcon} size={24} color={displayAccent} />
      </View>

      {/* Primary message */}
      <Text style={[styles.primaryText, { color: displayAccent }]}>
        {displayPrimary}
      </Text>

      {/* Secondary message */}
      {displaySecondary && (
        <Text style={styles.secondaryText} numberOfLines={3}>
          {displaySecondary}
        </Text>
      )}

      {/* Connect Device action */}
      {shouldShowConnect && onConnectDevice && (
        <TouchableOpacity
          style={styles.connectButton}
          onPress={onConnectDevice}
          activeOpacity={0.7}
        >
          <Ionicons name="link-outline" size={12} color={TACTICAL.amber} />
          <Text style={styles.connectButtonText}>Connect Device</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

// ── Panel-level placeholder (for larger panels like VehicleTelemetry) ──
export function TelemetryPanelPlaceholder({
  state,
  panelTitle,
  onConnectDevice,
  showConnectAction,
}: {
  state: TelemetryAvailability;
  panelTitle?: string;
  onConnectDevice?: () => void;
  showConnectAction?: boolean;
}) {
  const config = STATE_CONFIG[state] || STATE_CONFIG.awaiting_connection;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  const shouldShowConnect = showConnectAction !== undefined
    ? showConnectAction
    : (state === 'awaiting_connection' && onConnectDevice != null);

  return (
    <Animated.View style={[panelStyles.container, { opacity: fadeAnim }]}>
      {/* Panel title */}
      {panelTitle && (
        <View style={panelStyles.titleRow}>
          <Text style={panelStyles.titleLabel}>{panelTitle}</Text>
        </View>
      )}

      {/* Placeholder content */}
      <View style={panelStyles.content}>
        <View style={[panelStyles.iconCircle, { borderColor: config.accentColor + '30' }]}>
          <Ionicons name={config.icon} size={28} color={config.accentColor} />
        </View>

        <Text style={[panelStyles.primaryText, { color: config.accentColor }]}>
          {config.primary}
        </Text>

        {config.secondary && (
          <Text style={panelStyles.secondaryText}>
            {config.secondary}
          </Text>
        )}

        {shouldShowConnect && onConnectDevice && (
          <TouchableOpacity
            style={panelStyles.connectButton}
            onPress={onConnectDevice}
            activeOpacity={0.7}
          >
            <Ionicons name="link-outline" size={14} color={TACTICAL.amber} />
            <Text style={panelStyles.connectButtonText}>Connect Device</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    gap: 6,
  },
  iconContainer: {
    marginBottom: 2,
  },
  primaryText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
    lineHeight: 14,
  },
  secondaryText: {
    fontSize: 8,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 12,
    paddingHorizontal: 8,
    opacity: 0.8,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: TACTICAL.amber + '0C',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
  },
  connectButtonText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // Compact mode
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  compactText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});

// ── Panel-level styles ───────────────────────────────────────
const panelStyles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginBottom: 14,
    overflow: 'hidden',
  },
  titleRow: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  titleLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2.5,
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 10,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.02)',
    marginBottom: 4,
  },
  primaryText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    textAlign: 'center',
  },
  secondaryText: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    paddingHorizontal: 16,
    opacity: 0.8,
  },
  connectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber + '0C',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
  },
  connectButtonText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
});



