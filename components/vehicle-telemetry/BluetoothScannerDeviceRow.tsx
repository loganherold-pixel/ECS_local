import React, { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import type { BluetoothProviderBadge, BluetoothSignalPresentation } from '../../lib/bluetoothDevicePresentation';

export type BluetoothDeviceRowState = 'idle' | 'connecting' | 'connected' | 'failed';

interface BluetoothScannerDeviceRowProps {
  deviceId: string;
  displayName: string;
  secondaryLabel: string;
  providerBadge: BluetoothProviderBadge | null;
  categoryHint: string;
  signal: BluetoothSignalPresentation;
  state: BluetoothDeviceRowState;
  failureReason?: string;
  iconName: React.ComponentProps<typeof Ionicons>['name'];
  connectLocked?: boolean;
  onPress: (deviceId: string) => void;
}

function getActionLabel(state: BluetoothDeviceRowState): string {
  switch (state) {
    case 'connecting':
      return 'Connecting...';
    case 'connected':
      return 'Connected';
    case 'failed':
      return 'Retry';
    case 'idle':
    default:
      return 'Connect';
  }
}

function getSignalColor(signal: BluetoothSignalPresentation): string {
  switch (signal.bucket) {
    case 'strong':
      return '#4CAF50';
    case 'good':
      return '#8BC34A';
    case 'fair':
      return TACTICAL.amber;
    case 'weak':
      return '#EF5350';
    case 'unknown':
    default:
      return TACTICAL.textMuted;
  }
}

function getBadgeToneColor(badge: BluetoothProviderBadge | null): string {
  if (badge === 'OBD') return TACTICAL.amber;
  if (badge === 'Sensor') return '#5AC8FA';
  if (badge) return '#B7A379';
  return TACTICAL.textMuted;
}

function getRowBorderColor(state: BluetoothDeviceRowState, isObd: boolean): string {
  if (state === 'connected') return 'rgba(76,175,80,0.24)';
  if (state === 'failed') return 'rgba(239,83,80,0.24)';
  if (state === 'connecting') return `${TACTICAL.amber}34`;
  if (isObd) return `${TACTICAL.amber}22`;
  return 'rgba(255,255,255,0.08)';
}

function getRowBackgroundColor(state: BluetoothDeviceRowState, isObd: boolean): string {
  if (state === 'connected') return 'rgba(76,175,80,0.07)';
  if (state === 'failed') return 'rgba(239,83,80,0.07)';
  if (state === 'connecting') return `${TACTICAL.amber}12`;
  if (isObd) return 'rgba(196,138,44,0.05)';
  return 'rgba(255,255,255,0.03)';
}

function getActionColors(state: BluetoothDeviceRowState, connectLocked: boolean) {
  if (state === 'connected') {
    return {
      text: '#4CAF50',
      border: 'rgba(76,175,80,0.24)',
      background: 'rgba(76,175,80,0.10)',
    };
  }
  if (state === 'failed') {
    return {
      text: '#FF8A80',
      border: 'rgba(239,83,80,0.24)',
      background: 'rgba(239,83,80,0.10)',
    };
  }
  if (state === 'connecting') {
    return {
      text: TACTICAL.amber,
      border: `${TACTICAL.amber}30`,
      background: `${TACTICAL.amber}14`,
    };
  }
  if (connectLocked) {
    return {
      text: TACTICAL.textMuted,
      border: 'rgba(255,255,255,0.08)',
      background: 'rgba(255,255,255,0.04)',
    };
  }
  return {
    text: TACTICAL.amber,
    border: `${TACTICAL.amber}30`,
    background: `${TACTICAL.amber}12`,
  };
}

function BluetoothScannerDeviceRowComponent({
  deviceId,
  displayName,
  secondaryLabel,
  providerBadge,
  categoryHint,
  signal,
  state,
  failureReason,
  iconName,
  connectLocked = false,
  onPress,
}: BluetoothScannerDeviceRowProps) {
  const isObd = providerBadge === 'OBD';
  const actionDisabled = connectLocked || state === 'connecting' || state === 'connected';
  const signalColor = getSignalColor(signal);
  const actionColors = getActionColors(state, connectLocked);
  const badgeToneColor = getBadgeToneColor(providerBadge);
  const rowDisabled = actionDisabled && state !== 'failed';

  return (
    <Pressable
      onPress={() => {
        if (!rowDisabled) {
          onPress(deviceId);
        }
      }}
      disabled={rowDisabled}
      style={({ pressed }) => [
        styles.row,
        {
          borderColor: getRowBorderColor(state, isObd),
          backgroundColor: getRowBackgroundColor(state, isObd),
          opacity: pressed ? 0.9 : 1,
        },
      ]}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={iconName}
          size={18}
          color={isObd ? TACTICAL.amber : badgeToneColor}
        />
      </View>

      <View style={styles.copyWrap}>
        <View style={styles.nameRow}>
          <Text style={styles.displayName} numberOfLines={1}>
            {displayName}
          </Text>
          {providerBadge ? (
            <View
              style={[
                styles.providerBadge,
                {
                  borderColor: `${badgeToneColor}55`,
                  backgroundColor: `${badgeToneColor}18`,
                },
              ]}
            >
              <Text style={[styles.providerBadgeText, { color: badgeToneColor }]}>{providerBadge}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.secondaryLabel} numberOfLines={1}>
          {secondaryLabel}
        </Text>

        <View style={styles.metaRow}>
          {signal.rssiText ? (
            <View style={styles.signalGroup}>
              <View style={styles.signalBars}>
                {[0, 1, 2, 3].map((index) => (
                  <View
                    key={index}
                    style={[
                      styles.signalBar,
                      {
                        height: 4 + index * 3,
                        backgroundColor: index < signal.bars ? signalColor : 'rgba(255,255,255,0.08)',
                      },
                    ]}
                  />
                ))}
              </View>
              <Text style={[styles.metaText, { color: signalColor }]} numberOfLines={1}>
                {signal.label}
              </Text>
            </View>
          ) : null}

          <Text style={styles.metaText} numberOfLines={1}>
            {failureReason && state === 'failed' ? failureReason : categoryHint}
          </Text>
        </View>
      </View>

      <View
        style={[
          styles.actionSurface,
          {
            borderColor: actionColors.border,
            backgroundColor: actionColors.background,
          },
        ]}
      >
        {state === 'connecting' ? (
          <View style={styles.actionBusy}>
            <ActivityIndicator size="small" color={actionColors.text} />
            <Text style={[styles.actionText, { color: actionColors.text }]}>{getActionLabel(state)}</Text>
          </View>
        ) : (
          <Text
            style={[
              styles.actionText,
              {
                color: actionColors.text,
              },
            ]}
            numberOfLines={1}
          >
            {getActionLabel(state)}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

function areEqual(
  prev: BluetoothScannerDeviceRowProps,
  next: BluetoothScannerDeviceRowProps,
) {
  return (
    prev.deviceId === next.deviceId
    && prev.displayName === next.displayName
    && prev.secondaryLabel === next.secondaryLabel
    && prev.providerBadge === next.providerBadge
    && prev.categoryHint === next.categoryHint
    && prev.signal.bars === next.signal.bars
    && prev.signal.bucket === next.signal.bucket
    && prev.signal.label === next.signal.label
    && prev.signal.rssiText === next.signal.rssiText
    && prev.state === next.state
    && prev.failureReason === next.failureReason
    && prev.iconName === next.iconName
    && prev.connectLocked === next.connectLocked
    && prev.onPress === next.onPress
  );
}

const BluetoothScannerDeviceRow = memo(BluetoothScannerDeviceRowComponent, areEqual);

export default BluetoothScannerDeviceRow;

const styles = StyleSheet.create({
  row: {
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyWrap: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  displayName: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  providerBadge: {
    minHeight: 20,
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  secondaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  signalGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  signalBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    height: 16,
  },
  signalBar: {
    width: 3,
    borderRadius: 999,
  },
  metaText: {
    flexShrink: 1,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  actionSurface: {
    minWidth: 110,
    minHeight: 38,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBusy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  actionText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
