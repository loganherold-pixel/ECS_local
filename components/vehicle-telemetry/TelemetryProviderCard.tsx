/**
 * ═══════════════════════════════════════════════════════════
 * TELEMETRY PROVIDER CARD — Phase 2E
 * ═══════════════════════════════════════════════════════════
 *
 * Displays a vehicle telemetry provider in the settings UI.
 * Shows provider name, description, status indicator, and
 * connection state. Coming-soon providers are clearly labeled
 * and prevented from opening dead-end screens.
 *
 * Phase 2E adds:
 *   - Reconnecting state display
 *   - Provider status indicator dot on card
 *   - Connected device name under provider card
 *   - Last updated timestamp
 *   - Better coming-soon lockout UX
 *   - Chevron rotation hint for expanded state
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import type {
  VehicleTelemetryProviderInfo,
  VehicleTelemetryConnectionState,
} from '../../src/vehicle-telemetry/VehicleTelemetryTypes';

interface TelemetryProviderCardProps {
  provider: VehicleTelemetryProviderInfo;
  /** Connection state (only relevant for active providers) */
  connectionState?: VehicleTelemetryConnectionState | 'reconnecting';
  /** Connected device name (if any) */
  connectedDeviceName?: string | null;
  /** Number of registered devices for this provider */
  deviceCount?: number;
  /** Called when the user taps an active provider card */
  onPress?: () => void;
  /** Whether this card is currently expanded */
  isExpanded?: boolean;
  /** Last updated timestamp string */
  lastUpdated?: string | null;
}

const CONNECTION_STATE_DISPLAY: Record<string, {
  label: string;
  color: string;
  icon: string;
}> = {
  connected:    { label: 'CONNECTED',    color: '#4CAF50', icon: 'checkmark-circle' },
  connecting:   { label: 'CONNECTING',   color: '#FFB300', icon: 'sync-outline' },
  reconnecting: { label: 'RECONNECTING', color: '#FFB300', icon: 'sync-outline' },
  disconnected: { label: 'NOT CONNECTED', color: '#78909C', icon: 'cloud-offline-outline' },
  error:        { label: 'ERROR',        color: '#EF5350', icon: 'alert-circle-outline' },
  unsupported:  { label: 'UNSUPPORTED',  color: '#78909C', icon: 'close-circle-outline' },
};

export default function TelemetryProviderCard({
  provider,
  connectionState = 'disconnected',
  connectedDeviceName,
  deviceCount = 0,
  onPress,
  isExpanded = false,
  lastUpdated,
}: TelemetryProviderCardProps) {
  const isActive = provider.availability === 'active';
  const isComingSoon = provider.availability === 'coming_soon';
  const stateDisplay = CONNECTION_STATE_DISPLAY[connectionState] || CONNECTION_STATE_DISPLAY.disconnected;
  const isConnected = connectionState === 'connected';
  const isReconnecting = connectionState === 'reconnecting';

  const handlePress = () => {
    if (isActive && onPress) {
      onPress();
    }
  };

  return (
    <TouchableOpacity
      style={[
        styles.card,
        isActive && styles.cardActive,
        isComingSoon && styles.cardComingSoon,
        isExpanded && styles.cardExpanded,
      ]}
      onPress={handlePress}
      activeOpacity={isActive ? 0.7 : 1}
      disabled={!isActive}
    >
      {/* Header row: icon + name + status */}
      <View style={styles.headerRow}>
        <View style={[
          styles.iconWrap,
          isActive && styles.iconWrapActive,
          isConnected && styles.iconWrapConnected,
        ]}>
          <Ionicons
            name={provider.iconName as any}
            size={18}
            color={isConnected ? '#4CAF50' : isActive ? TACTICAL.amber : TACTICAL.textMuted}
          />
          {/* Phase 2E: Small status indicator dot on icon */}
          {isActive && (
            <View style={[styles.iconStatusDot, { backgroundColor: stateDisplay.color }]} />
          )}
        </View>

        <View style={styles.headerInfo}>
          <View style={styles.nameRow}>
            <Text style={[
              styles.providerName,
              isActive && styles.providerNameActive,
            ]}>
              {provider.displayName}
            </Text>

            {/* Status indicator */}
            {isActive && (
              <View style={[styles.statusBadge, { backgroundColor: stateDisplay.color + '15' }]}>
                <View style={[styles.statusDot, { backgroundColor: stateDisplay.color }]} />
                <Text style={[styles.statusText, { color: stateDisplay.color }]}>
                  {stateDisplay.label}
                </Text>
              </View>
            )}

            {isComingSoon && (
              <View style={styles.comingSoonBadge}>
                <Ionicons name="time-outline" size={7} color={TACTICAL.textMuted} />
                <Text style={styles.comingSoonText}>COMING SOON</Text>
              </View>
            )}
          </View>

          {/* Connected device name */}
          {isActive && connectedDeviceName && (isConnected || isReconnecting) && (
            <View style={styles.deviceRow}>
              <Ionicons name="bluetooth-outline" size={9} color={isConnected ? TACTICAL.amber : TACTICAL.textMuted} />
              <Text style={[styles.deviceName, isReconnecting && styles.deviceNameReconnecting]} numberOfLines={1}>
                {connectedDeviceName}
                {deviceCount > 1 ? ` (+${deviceCount - 1})` : ''}
              </Text>
              {/* Phase 2E: Last updated timestamp */}
              {lastUpdated && isConnected && (
                <Text style={styles.lastUpdatedText}>{lastUpdated}</Text>
              )}
            </View>
          )}

          {/* Phase 2E: Reconnecting hint text */}
          {isReconnecting && (
            <Text style={styles.reconnectingHint}>Attempting to restore connection...</Text>
          )}
        </View>

        {/* Chevron for active providers */}
        {isActive && (
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color={TACTICAL.textMuted}
          />
        )}

        {/* Lock icon for coming soon */}
        {isComingSoon && (
          <Ionicons name="lock-closed-outline" size={14} color={TACTICAL.textMuted + '60'} />
        )}
      </View>

      {/* Description */}
      <Text style={[
        styles.description,
        isComingSoon && styles.descriptionMuted,
      ]} numberOfLines={2}>
        {provider.description}
      </Text>

      {/* Transport badges */}
      <View style={styles.transportRow}>
        {provider.transports.map(transport => (
          <View key={transport} style={[
            styles.transportBadge,
            isComingSoon && styles.transportBadgeMuted,
          ]}>
            <Ionicons
              name={
                transport === 'bluetooth' ? 'bluetooth-outline' :
                transport === 'wifi' ? 'wifi-outline' :
                transport === 'usb' ? 'swap-horizontal-outline' :
                'hardware-chip-outline'
              }
              size={9}
              color={isActive ? TACTICAL.amber : TACTICAL.textMuted}
            />
            <Text style={[
              styles.transportText,
              isComingSoon && styles.transportTextMuted,
            ]}>
              {transport.toUpperCase()}
            </Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 14,
    gap: 8,
  },
  cardActive: {
    borderColor: TACTICAL.amber + '25',
    backgroundColor: 'rgba(196,138,44,0.03)',
  },
  cardComingSoon: {
    opacity: 0.55,
  },
  cardExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  iconWrapActive: {
    backgroundColor: TACTICAL.amber + '12',
  },
  iconWrapConnected: {
    backgroundColor: 'rgba(76,175,80,0.10)',
  },
  iconStatusDot: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: TACTICAL.bg,
  },

  headerInfo: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  providerName: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  providerNameActive: {
    color: TACTICAL.text,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },

  comingSoonBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  comingSoonText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  deviceName: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
    letterSpacing: 0.3,
    flex: 1,
  },
  deviceNameReconnecting: {
    color: TACTICAL.textMuted,
    opacity: 0.7,
  },
  lastUpdatedText: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    opacity: 0.7,
  },
  reconnectingHint: {
    fontSize: 8,
    fontWeight: '600',
    color: '#FFB300',
    fontStyle: 'italic',
    marginTop: 1,
  },

  description: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },
  descriptionMuted: {
    opacity: 0.7,
  },

  transportRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  transportBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber + '08',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '15',
  },
  transportBadgeMuted: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  transportText: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 0.8,
  },
  transportTextMuted: {
    color: TACTICAL.textMuted,
  },
});




