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
import { bluDeviceRegistry, useBluConnection, type BluProviderId } from '../../src/power';

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

const POWER_TO_BLU_PROVIDER: Partial<Record<PowerProviderId, BluProviderId>> = {
  EcoFlow: 'ecoflow',
  Bluetti: 'bluetti',
  AnkerSolix: 'anker_solix',
  Jackery: 'jackery',
  GoalZero: 'goal_zero',
  Renogy: 'renogy',
  Redarc: 'redarc',
  DakotaLithium: 'dakota_lithium',
};

const PROVIDER_SETUP_NOTES: Partial<Record<PowerProviderId, string>> = {
  Redarc: 'Direct Bluetooth telemetry may be available on supported REDARC hardware, but field verification is still required.',
  DakotaLithium: 'Direct Bluetooth telemetry may be available on supported Dakota Lithium hardware, but field verification is still required.',
  Bluetti: 'This provider remains a UI-only path because native discovery still falls back to simulated devices.',
  AnkerSolix: 'This provider remains a UI-only path because native discovery still falls back to simulated devices.',
  Jackery: 'This provider remains a UI-only path because native discovery still falls back to simulated devices.',
  GoalZero: 'This provider remains a UI-only path because native discovery still falls back to simulated devices.',
  Renogy: 'This provider remains a UI-only path because native discovery still falls back to simulated devices.',
  EcoFlow: 'EcoFlow remains the strongest current ECS provider path and uses the existing integration flow.',
};

function getSignalLabel(signal: number): { label: string; color: string } {
  if (signal >= -60) return { label: 'STRONG', color: '#34C759' };
  if (signal >= -75) return { label: 'MODERATE', color: '#FFB800' };
  return { label: 'WEAK', color: '#FF9500' };
}

function normalizeDiscoveredDevices(
  provider: PowerProviderId,
  discoveredDevices: any[],
): DiscoveredDevice[] {
  return discoveredDevices.map((device) => ({
    id: String(device?.id ?? ''),
    name: String(device?.name ?? device?.display_name ?? 'Power Device'),
    model: String(device?.model ?? 'Unknown Model'),
    signal:
      typeof device?.rssi === 'number'
        ? device.rssi
        : typeof device?.signal_strength === 'number'
          ? device.signal_strength
          : provider === 'EcoFlow'
            ? -65
            : -90,
    provider,
  }));
}

export default function ConnectionStep({ palette, provider, onDeviceSelected, onBack }: Props) {
  const display = PROVIDER_DISPLAY[provider];
  const isUiOnlyPath = display.supportLevel === 'ui_only';
  const providerReadiness = resolveProviderReadiness(provider);
  const blu = useBluConnection();
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const mountedRef = useRef(true);
  const [scanState, setScanState] = useState<ScanState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);

  const bluProvider = POWER_TO_BLU_PROVIDER[provider] ?? null;
  const providerBinding = useMemo(() => {
    switch (provider) {
      case 'EcoFlow':
        return {
          connectionState: blu.connectionState,
          isScanning: blu.isConnecting,
          discoveredDevices: blu.discoveredDevices,
          scan: blu.refreshDevices,
          connect: blu.connect,
          error: blu.error,
        };
      case 'Bluetti':
        return {
          connectionState: blu.bluettiConnectionState,
          isScanning: blu.bluettiIsScanning,
          discoveredDevices: blu.bluettiDiscoveredDevices,
          scan: blu.bluettiScan,
          connect: blu.bluettiConnect,
          error: blu.bluettiError,
        };
      case 'AnkerSolix':
        return {
          connectionState: blu.ankerSolixConnectionState,
          isScanning: blu.ankerSolixIsScanning,
          discoveredDevices: blu.ankerSolixDiscoveredDevices,
          scan: blu.ankerSolixScan,
          connect: blu.ankerSolixConnect,
          error: blu.ankerSolixError,
        };
      case 'Jackery':
        return {
          connectionState: blu.jackeryConnectionState,
          isScanning: blu.jackeryIsScanning,
          discoveredDevices: blu.jackeryDiscoveredDevices,
          scan: blu.jackeryScan,
          connect: blu.jackeryConnect,
          error: blu.jackeryError,
        };
      case 'GoalZero':
        return {
          connectionState: blu.goalZeroConnectionState,
          isScanning: blu.goalZeroIsScanning,
          discoveredDevices: blu.goalZeroDiscoveredDevices,
          scan: blu.goalZeroScan,
          connect: blu.goalZeroConnect,
          error: blu.goalZeroError,
        };
      case 'Renogy':
        return {
          connectionState: blu.renogyConnectionState,
          isScanning: blu.renogyIsScanning,
          discoveredDevices: blu.renogyDiscoveredDevices,
          scan: blu.renogyScan,
          connect: blu.renogyConnect,
          error: blu.renogyError,
        };
      case 'Redarc':
        return {
          connectionState: blu.redarcConnectionState,
          isScanning: blu.redarcIsScanning,
          discoveredDevices: blu.redarcDiscoveredDevices,
          scan: blu.redarcScan,
          connect: blu.redarcConnect,
          error: blu.redarcError,
        };
      case 'DakotaLithium':
        return {
          connectionState: blu.dakotaLithiumConnectionState,
          isScanning: blu.dakotaLithiumIsScanning,
          discoveredDevices: blu.dakotaLithiumDiscoveredDevices,
          scan: blu.dakotaLithiumScan,
          connect: blu.dakotaLithiumConnect,
          error: blu.dakotaLithiumError,
        };
      default:
        return null;
    }
  }, [blu, provider]);

  const devices = useMemo(
    () => (providerBinding ? normalizeDiscoveredDevices(provider, providerBinding.discoveredDevices) : []),
    [provider, providerBinding],
  );
  const readinessConnectionState = useMemo(() => {
    if (scanState === 'connected') return 'connected';
    if (scanState === 'connecting') return 'connecting';
    if (scanState === 'scanning') return 'scanning';

    switch (providerBinding?.connectionState) {
      case 'error':
      case 'unsupported':
        return 'unavailable';
      default:
        return providerBinding?.connectionState ?? null;
    }
  }, [providerBinding?.connectionState, scanState]);
  const runtimeReadiness = resolvePowerReadiness({
    providerId: provider,
    connectionState: readinessConnectionState,
    hasTelemetry: scanState === 'connected',
    hasStoredSnapshot: devices.length > 0,
  });

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
    if (!providerBinding) return;
    if (providerBinding.error) {
      setError(providerBinding.error);
      setScanState('error');
      return;
    }
    if (providerBinding.isScanning) {
      setScanState('scanning');
      return;
    }
    if (providerBinding.connectionState === 'connected' && selectedDeviceId) {
      setScanState('connected');
      return;
    }
    if (devices.length > 0) {
      setScanState('found');
      return;
    }
  }, [devices.length, providerBinding, selectedDeviceId]);

  const startScan = useCallback(async () => {
    if (!providerBinding) return;
    setError(null);
    setSelectedDeviceId(null);
    setScanState('scanning');
    await providerBinding.scan();
  }, [providerBinding]);

  const connectToDevice = useCallback(async (device: DiscoveredDevice) => {
    if (!providerBinding || !bluProvider) return;

    setSelectedDeviceId(device.id);
    setError(null);
    setScanState('connecting');
    const result = await providerBinding.connect(device.id) as any;
    await new Promise((resolve) => setTimeout(resolve, 200));

    const registered =
      bluDeviceRegistry.getDevice(bluProvider, device.id) ??
      (Array.isArray(result?.devices)
        ? result.devices.find((candidate: any) => candidate?.provider === bluProvider)
        : null) ??
      bluDeviceRegistry.getByProvider(bluProvider).find((candidate) => candidate.connection_state === 'connected') ??
      null;

    if (registered?.connection_state === 'connected') {
      setScanState('connected');
      setTimeout(() => {
        if (!mountedRef.current) return;
        onDeviceSelected({
          ...device,
          id: String(registered.device_id ?? device.id),
          name: String(registered.display_name ?? device.name),
          model: String(registered.model ?? device.model),
        });
      }, 700);
      return;
    }

    setError(providerBinding.error ?? 'Connection failed.');
    setScanState('error');
  }, [bluProvider, onDeviceSelected, providerBinding]);

  useEffect(() => {
    if (isUiOnlyPath) {
      setError('This provider path remains UI-only until real hardware discovery replaces the simulated fallback.');
      setScanState('error');
      return;
    }
    if (!providerBinding) return;
    const timer = setTimeout(() => {
      void startScan();
    }, 400);
    return () => clearTimeout(timer);
  }, [isUiOnlyPath, providerBinding, startScan]);

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
          {PROVIDER_SETUP_NOTES[provider] ?? 'Bluetooth setup is handled directly inside ECS.'}
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
            <Text style={[styles.rescanText, { color: palette.textMuted }]}>SCAN AGAIN</Text>
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
          {!isUiOnlyPath && (
            <TouchableOpacity
              style={[styles.retryBtn, { backgroundColor: display.color }]}
              onPress={() => void startScan()}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={14} color="#FFF" />
              <Text style={styles.retryBtnText}>TRY AGAIN</Text>
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
  rescanText: { fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
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
  retryBtnText: { color: '#FFF', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
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
