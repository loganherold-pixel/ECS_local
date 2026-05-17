import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  ScrollView,
} from 'react-native';

import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';
import {
  PROVIDER_DISPLAY,
  type PowerProviderId,
} from '../../lib/powerSetupStore';
import { resolvePowerReadiness, resolveProviderReadiness } from '../../lib/powerReadiness';
import { useUnifiedDeviceConnections, type ECSDeviceConnectionModel } from '../../lib/unifiedScanner';

export interface DiscoveredDevice {
  id: string;
  name: string;
  model: string;
  signal: number;
  provider: PowerProviderId;
}

interface Props {
  palette: any;
  provider: PowerProviderId;
  onDeviceSelected: (device: DiscoveredDevice) => void;
  onBack: () => void;
}

type ScanState = 'idle' | 'scanning' | 'found' | 'connecting' | 'connected' | 'error';

const POWER_TO_SCANNER_PROVIDER: Partial<Record<PowerProviderId, string>> = {
  EcoFlow: 'ecoflow',
  Bluetti: 'bluetti',
  AnkerSolix: 'anker_solix',
  Jackery: 'jackery',
  GoalZero: 'goal_zero',
  Renogy: 'renogy',
  Redarc: 'redarc',
  DakotaLithium: 'dakota_lithium',
};

function getSignalLabel(signal: number): { label: string; color: string } {
  if (signal >= -60) return { label: 'STRONG', color: '#34C759' };
  if (signal >= -75) return { label: 'MODERATE', color: '#FFB800' };
  return { label: 'WEAK', color: '#FF9500' };
}

function normalizeDiscoveredDevices(
  provider: PowerProviderId,
  discoveredDevices: ECSDeviceConnectionModel[],
): DiscoveredDevice[] {
  return discoveredDevices.map((device) => ({
    id: device.id,
    name: device.name,
    model: String(device.subtype ?? device.category ?? 'Unknown Model'),
    signal:
      typeof device.signalStrength === 'number'
        ? device.signalStrength
        : provider === 'EcoFlow'
          ? -65
          : -90,
    provider,
  }));
}

export default function ConnectionStep({ palette, provider, onDeviceSelected, onBack }: Props) {
  const display = PROVIDER_DISPLAY[provider];
  const providerReadiness = resolveProviderReadiness(provider);
  const connections = useUnifiedDeviceConnections();
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const completedSelectionRef = useRef<string | null>(null);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const scannerProviderId = POWER_TO_SCANNER_PROVIDER[provider] ?? null;
  const scannerDevices = useMemo(() => (
    connections.devices.filter((device) =>
      device.kind === 'power' &&
      device.providerId === scannerProviderId &&
      (device.isDiscoverable || device.isConnected || device.isConnecting)
    )
  ), [connections.devices, scannerProviderId]);

  const devices = useMemo(
    () => normalizeDiscoveredDevices(provider, scannerDevices),
    [provider, scannerDevices],
  );
  const readinessConnectionState = useMemo(() => {
    if (scanState === 'connected') return 'connected';
    if (scanState === 'connecting') return 'connecting';
    if (scanState === 'scanning') return 'scanning';
    switch (connections.scannerSnapshot.state) {
      case 'streaming':
        return 'live';
      case 'connected':
        return 'connected';
      case 'connecting':
        return 'connecting';
      case 'scanning':
        return 'scanning';
      case 'error':
      case 'permission_required':
      case 'bluetooth_off':
        return 'unavailable';
      case 'idle':
      case 'discovered':
      case 'disconnecting':
      case 'disconnected':
      default:
        return 'disconnected';
    }
  }, [connections.scannerSnapshot.state, scanState]);
  const runtimeReadiness = resolvePowerReadiness({
    providerId: provider,
    connectionState: readinessConnectionState,
    hasTelemetry: scanState === 'connected',
    hasStoredSnapshot: devices.length > 0,
  });

  useEffect(() => {
    if (scanState === 'scanning') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ]),
      );
      loop.start();
      return () => loop.stop();
    }
  }, [pulseAnim, scanState]);

  useEffect(() => {
    if (connections.isScanning) {
      setScanState('scanning');
      return;
    }
    const selectedScannerDevice = selectedDeviceId
      ? scannerDevices.find((device) => device.id === selectedDeviceId)
      : null;
    if (selectedScannerDevice?.lastError) {
      setError(selectedScannerDevice.lastError);
      setScanState('error');
      return;
    }
    if (selectedScannerDevice?.isConnected && selectedDeviceId) {
      setScanState('connected');
      if (completedSelectionRef.current !== selectedDeviceId) {
        completedSelectionRef.current = selectedDeviceId;
        onDeviceSelected({
          id: selectedScannerDevice.id,
          name: selectedScannerDevice.name,
          model: String(selectedScannerDevice.subtype ?? selectedScannerDevice.category ?? 'Unknown Model'),
          signal: selectedScannerDevice.signalStrength ?? -90,
          provider,
        });
      }
      return;
    }
    if (devices.length > 0) {
      setScanState('found');
      return;
    }
    if (connections.scanAreaState === 'permission_denied' || connections.scanAreaState === 'bluetooth_unavailable' || connections.scanAreaState === 'ble_failed') {
      setError(connections.scanAreaMessage);
      setScanState('error');
    }
  }, [connections.isScanning, connections.scanAreaMessage, connections.scanAreaState, devices.length, onDeviceSelected, provider, scannerDevices, selectedDeviceId]);

  const startScan = useCallback(async () => {
    setError(null);
    setSelectedDeviceId(null);
    completedSelectionRef.current = null;
    setScanState('scanning');
    await connections.rescan();
  }, [connections]);

  const connectToDevice = useCallback(async (device: DiscoveredDevice) => {
    setSelectedDeviceId(device.id);
    completedSelectionRef.current = null;
    setError(null);
    setScanState('connecting');
    await connections.connectDevice(device.id, 'user_device_action');
  }, [connections]);

  useEffect(() => {
    if (display.supportLevel === 'ui_only') {
      setError('This provider is not available through the production unified scanner yet.');
      setScanState('error');
    }
  }, [display.supportLevel]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={[styles.stepBadge, { backgroundColor: display.color + '15', borderColor: display.color + '30' }]}>
          <Text style={[styles.stepNumber, { color: display.color }]}>2</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.stepLabel, { color: palette.textMuted }]}>STEP 2</Text>
          <Text style={[styles.title, { color: palette.text }]}>Find Device</Text>
        </View>
        <View style={[styles.brandChip, { backgroundColor: display.color + '12', borderColor: display.color + '25' }]}>
          <Ionicons name={display.icon} size={12} color={display.color} />
          <Text style={[styles.brandChipText, { color: display.color }]}>{display.label}</Text>
        </View>
      </View>

      <View style={[styles.infoCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
        <Ionicons name="information-circle-outline" size={16} color={display.color} />
        <Text style={[styles.infoText, { color: palette.text }]}>
          Device discovery uses the ECS unified scanner. Only nearby devices returned by the production scanner can be selected here.
        </Text>
      </View>

      <View
        style={[
          styles.supportCard,
          {
            backgroundColor: providerReadiness.color + '10',
            borderColor: providerReadiness.color + '30',
          },
        ]}
      >
        <Ionicons
          name={providerReadiness.icon as any}
          size={16}
          color={providerReadiness.color}
        />
        <View style={styles.supportCardText}>
          <Text
            style={[
              styles.supportCardTitle,
              { color: providerReadiness.color },
            ]}
          >
            {providerReadiness.label}
          </Text>
          <Text style={[styles.supportCardNote, { color: palette.textMuted }]}>
            {providerReadiness.detail}
          </Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: GOLD_RAIL.section }]} />

      {scanState === 'scanning' && (
        <View style={styles.scanningContainer}>
          <Animated.View style={[styles.scanPulse, { opacity: pulseAnim, borderColor: display.color }]}>
            <View style={[styles.scanIcon, { backgroundColor: display.color + '15' }]}>
              <Ionicons name="bluetooth-outline" size={32} color={display.color} />
            </View>
          </Animated.View>
          <Text style={[styles.scanningText, { color: palette.text }]}>Scanning for devices...</Text>
          <Text style={[styles.scanningHint, { color: palette.textMuted }]}>
            Make sure your {display.label} device is powered on and nearby.
          </Text>
          <ActivityIndicator size="small" color={display.color} style={{ marginTop: 16 }} />
        </View>
      )}

      {scanState === 'connecting' && (
        <View style={styles.scanningContainer}>
          <View style={[styles.scanIcon, { backgroundColor: display.color + '15' }]}>
            <Ionicons name="link-outline" size={32} color={display.color} />
          </View>
          <Text style={[styles.scanningText, { color: palette.text }]}>Connecting to device...</Text>
          <ActivityIndicator size="small" color={display.color} style={{ marginTop: 16 }} />
        </View>
      )}

      {scanState === 'connected' && selectedDeviceId && (
        <View style={styles.scanningContainer}>
          <View style={[styles.successIcon, { backgroundColor: '#34C75915' }]}>
            <Ionicons name="checkmark-circle" size={40} color="#34C759" />
          </View>
          <Text style={[styles.scanningText, { color: runtimeReadiness.color }]}>
            {runtimeReadiness.label}
          </Text>
          <Text style={[styles.scanningHint, { color: palette.textMuted }]}>
            {runtimeReadiness.detail}
          </Text>
        </View>
      )}

      {scanState === 'found' && devices.length > 0 && (
        <ScrollView
          style={styles.deviceList}
          contentContainerStyle={styles.deviceListContent}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[styles.foundLabel, { color: palette.textMuted }]}>
            {devices.length} DEVICE{devices.length > 1 ? 'S' : ''} FOUND
          </Text>

          {devices.map((device) => {
            const sig = getSignalLabel(device.signal);
            return (
              <TouchableOpacity
                key={device.id}
                style={[
                  styles.deviceCard,
                  { backgroundColor: palette.panel, borderColor: palette.border },
                ]}
                onPress={() => void connectToDevice(device)}
                activeOpacity={0.7}
              >
                <View style={[styles.deviceIcon, { backgroundColor: display.color + '12' }]}>
                  <Ionicons name={display.icon} size={22} color={display.color} />
                </View>
                <View style={styles.deviceInfo}>
                  <Text style={[styles.deviceName, { color: palette.text }]}>{device.name}</Text>
                  <Text style={[styles.deviceModel, { color: palette.textMuted }]}>{device.model}</Text>
                </View>
                <View style={styles.deviceRight}>
                  <View style={[styles.signalBadge, { backgroundColor: sig.color + '12', borderColor: sig.color + '25' }]}>
                    <Ionicons name="wifi-outline" size={10} color={sig.color} />
                    <Text style={[styles.signalText, { color: sig.color }]}>{sig.label}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.connectBtn, { backgroundColor: display.color }]}
                    onPress={() => void connectToDevice(device)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.connectBtnText}>CONNECT</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[styles.rescanBtn, { borderColor: palette.border }]}
            onPress={() => void startScan()}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={14} color={palette.textMuted} />
            <Text
              style={[styles.rescanText, { color: palette.textMuted }]}
              numberOfLines={2}
            >
              SCAN FOR DEVICE CONNECTIONS
            </Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {scanState === 'error' && (
        <View style={styles.errorContainer}>
          <View style={[styles.errorIcon, { backgroundColor: '#FF950012' }]}>
            <Ionicons name="alert-circle-outline" size={36} color="#FF9500" />
          </View>
          <Text style={[styles.errorTitle, { color: '#FF9500' }]}>Bluetooth Setup Needs Attention</Text>
          <Text style={[styles.errorDesc, { color: palette.textMuted }]}>
            {error || 'Unable to discover or connect to a supported device.'}
          </Text>
          {display.supportLevel !== 'ui_only' && (
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: display.color }]}
              onPress={() => void startScan()}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={14} color="#FFF" />
              <Text style={styles.retryBtnText} numberOfLines={2}>
                SCAN FOR DEVICE CONNECTIONS
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.backBtn, { borderColor: palette.border }]}
        onPress={onBack}
        activeOpacity={0.7}
      >
        <Ionicons name="arrow-back-outline" size={14} color={palette.textMuted} />
        <Text style={[styles.backText, { color: palette.textMuted }]}>BACK</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  stepBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  stepNumber: { fontSize: 16, fontWeight: '800' },
  headerText: { flex: 1, gap: 2 },
  stepLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  brandChipText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  infoText: { flex: 1, fontSize: 12, fontWeight: '600', lineHeight: 18 },
  supportCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    padding: SPACING.md,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    marginTop: SPACING.sm,
  },
  supportCardText: { flex: 1, gap: 3 },
  supportCardTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  supportCardNote: { fontSize: 11, lineHeight: 16 },
  divider: { height: 1, marginBottom: SPACING.md },
  scanningContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: SPACING.xl },
  scanPulse: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  scanIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  scanningText: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  scanningHint: { marginTop: 8, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 24 },
  deviceList: { flex: 1 },
  deviceListContent: { paddingBottom: SPACING.lg, gap: SPACING.sm },
  foundLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 2, marginBottom: 8 },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
  },
  deviceIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceInfo: { flex: 1, gap: 2 },
  deviceName: { fontSize: 14, fontWeight: '800' },
  deviceModel: { fontSize: 12, fontWeight: '500' },
  deviceRight: { alignItems: 'flex-end', gap: 8 },
  signalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  signalText: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 92,
  },
  connectBtnText: { color: '#FFF', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  rescanBtn: {
    marginTop: SPACING.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
  },
  rescanText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4, flexShrink: 1, textAlign: 'center' },
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingBottom: SPACING.xl },
  errorIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  errorDesc: { fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 24 },
  retryBtn: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryBtnText: { color: '#FFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.4, flexShrink: 1, textAlign: 'center' },
  backBtn: {
    marginTop: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 10,
  },
  backText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
});
