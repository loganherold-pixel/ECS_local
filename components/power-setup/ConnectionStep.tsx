/**
 * ConnectionStep — Step 2: Discover and connect to a power device.
 *
 * For BLE providers: simulates a Bluetooth scan with discovered devices.
 * For Cloud providers (EcoFlow): shows cloud connection flow.
 *
 * In production, this would integrate with the actual BLE scanning
 * infrastructure in src/power/blu/. For now, it provides a realistic
 * UI flow with simulated discovery results.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';
import {
  PROVIDER_DISPLAY,
  type PowerProviderId,
} from '../../lib/powerSetupStore';

// ── Simulated discovered devices per provider ───────────────────────────
const SIMULATED_DEVICES: Record<PowerProviderId, { name: string; model: string; signal: number }[]> = {
  EcoFlow: [
    { name: 'EcoFlow DELTA 3 Plus', model: 'DELTA 3 Plus', signal: 92 },
    { name: 'EcoFlow RIVER 3', model: 'RIVER 3', signal: 78 },
  ],
  Bluetti: [
    { name: 'Bluetti AC200MAX', model: 'AC200MAX', signal: 85 },
    { name: 'Bluetti EB3A', model: 'EB3A', signal: 65 },
  ],
  AnkerSolix: [
    { name: 'Anker SOLIX F2000', model: 'F2000', signal: 88 },
  ],
  Jackery: [
    { name: 'Jackery Explorer 2000 Plus', model: 'Explorer 2000 Plus', signal: 80 },
    { name: 'Jackery Explorer 1000 v2', model: 'Explorer 1000 v2', signal: 72 },
  ],
  GoalZero: [
    { name: 'Goal Zero Yeti 1500X', model: 'Yeti 1500X', signal: 76 },
  ],
  Renogy: [
    { name: 'Renogy Lycan 5000', model: 'Lycan 5000', signal: 82 },
  ],
};

export interface DiscoveredDevice {
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

function getSignalLabel(signal: number): { label: string; color: string } {
  if (signal >= 80) return { label: 'STRONG', color: '#34C759' };
  if (signal >= 60) return { label: 'MODERATE', color: '#FFB800' };
  return { label: 'WEAK', color: '#FF9500' };
}

export default function ConnectionStep({ palette, provider, onDeviceSelected, onBack }: Props) {
  const display = PROVIDER_DISPLAY[provider];
  const isCloudProvider = provider === 'EcoFlow';

  const [scanState, setScanState] = useState<ScanState>('idle');
  const [devices, setDevices] = useState<DiscoveredDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Pulse animation during scan
  useEffect(() => {
    if (scanState === 'scanning') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        ])
      );
      loop.start();
      return () => loop.stop();
    }
  }, [scanState]);

  const startScan = useCallback(() => {
    setScanState('scanning');
    setDevices([]);
    setError(null);
    setSelectedDevice(null);

    // Simulate scan delay
    setTimeout(() => {
      if (!mountedRef.current) return;
      const simDevices = SIMULATED_DEVICES[provider] || [];
      const discovered: DiscoveredDevice[] = simDevices.map((d) => ({
        ...d,
        provider,
      }));
      setDevices(discovered);
      setScanState(discovered.length > 0 ? 'found' : 'error');
      if (discovered.length === 0) {
        setError('No devices found. Make sure your power station is powered on and nearby.');
      }
    }, 2500);
  }, [provider]);

  const connectToDevice = useCallback((device: DiscoveredDevice) => {
    setSelectedDevice(device);
    setScanState('connecting');

    // Simulate connection delay
    setTimeout(() => {
      if (!mountedRef.current) return;
      setScanState('connected');

      // Auto-advance after brief confirmation
      setTimeout(() => {
        if (!mountedRef.current) return;
        onDeviceSelected(device);
      }, 1000);
    }, 1800);
  }, [onDeviceSelected]);

  // Auto-start scan on mount
  useEffect(() => {
    const timer = setTimeout(startScan, 500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.stepBadge, { backgroundColor: display.color + '15', borderColor: display.color + '30' }]}>
          <Text style={[styles.stepNumber, { color: display.color }]}>2</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={[styles.stepLabel, { color: palette.textMuted }]}>STEP 2</Text>
          <Text style={[styles.title, { color: palette.text }]}>
            {isCloudProvider ? 'Cloud Connection' : 'Device Discovery'}
          </Text>
        </View>
        <View style={[styles.brandChip, { backgroundColor: display.color + '12', borderColor: display.color + '25' }]}>
          <Ionicons name={display.icon} size={12} color={display.color} />
          <Text style={[styles.brandChipText, { color: display.color }]}>{display.label}</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: GOLD_RAIL.section }]} />

      {/* Scanning State */}
      {scanState === 'scanning' && (
        <View style={styles.scanningContainer}>
          <Animated.View style={[styles.scanPulse, { opacity: pulseAnim, borderColor: display.color }]}>
            <View style={[styles.scanIcon, { backgroundColor: display.color + '15' }]}>
              <Ionicons
                name={isCloudProvider ? 'cloud-outline' : 'bluetooth-outline'}
                size={32}
                color={display.color}
              />
            </View>
          </Animated.View>
          <Text style={[styles.scanningText, { color: palette.text }]}>
            {isCloudProvider ? 'Connecting to cloud...' : 'Scanning for devices...'}
          </Text>
          <Text style={[styles.scanningHint, { color: palette.textMuted }]}>
            {isCloudProvider
              ? 'Authenticating with EcoFlow API'
              : `Make sure your ${display.label} device is powered on and Bluetooth is enabled`}
          </Text>
          <ActivityIndicator size="small" color={display.color} style={{ marginTop: 16 }} />
        </View>
      )}

      {/* Connecting State */}
      {scanState === 'connecting' && selectedDevice && (
        <View style={styles.scanningContainer}>
          <View style={[styles.scanIcon, { backgroundColor: display.color + '15' }]}>
            <Ionicons name="link-outline" size={32} color={display.color} />
          </View>
          <Text style={[styles.scanningText, { color: palette.text }]}>
            Connecting to {selectedDevice.name}...
          </Text>
          <ActivityIndicator size="small" color={display.color} style={{ marginTop: 16 }} />
        </View>
      )}

      {/* Connected State */}
      {scanState === 'connected' && selectedDevice && (
        <View style={styles.scanningContainer}>
          <View style={[styles.successIcon, { backgroundColor: '#34C759' + '15' }]}>
            <Ionicons name="checkmark-circle" size={40} color="#34C759" />
          </View>
          <Text style={[styles.scanningText, { color: '#34C759' }]}>
            Connected
          </Text>
          <Text style={[styles.scanningHint, { color: palette.textMuted }]}>
            {selectedDevice.name}
          </Text>
        </View>
      )}

      {/* Found Devices */}
      {scanState === 'found' && devices.length > 0 && (
        <View style={styles.deviceList}>
          <Text style={[styles.foundLabel, { color: palette.textMuted }]}>
            {devices.length} DEVICE{devices.length > 1 ? 'S' : ''} FOUND
          </Text>

          {devices.map((device, idx) => {
            const sig = getSignalLabel(device.signal);
            return (
              <TouchableOpacity
                key={idx}
                style={[
                  styles.deviceCard,
                  { backgroundColor: palette.panel, borderColor: palette.border },
                ]}
                onPress={() => connectToDevice(device)}
                activeOpacity={0.7}
              >
                <View style={[styles.deviceIcon, { backgroundColor: display.color + '12' }]}>
                  <Ionicons name="battery-charging-outline" size={22} color={display.color} />
                </View>
                <View style={styles.deviceInfo}>
                  <Text style={[styles.deviceName, { color: palette.text }]}>
                    {device.name}
                  </Text>
                  <Text style={[styles.deviceModel, { color: palette.textMuted }]}>
                    {device.model}
                  </Text>
                </View>
                <View style={styles.deviceRight}>
                  <View style={[styles.signalBadge, { backgroundColor: sig.color + '12', borderColor: sig.color + '25' }]}>
                    <Ionicons name="wifi-outline" size={10} color={sig.color} />
                    <Text style={[styles.signalText, { color: sig.color }]}>{sig.label}</Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.connectBtn, { backgroundColor: display.color }]}
                    onPress={() => connectToDevice(device)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.connectBtnText}>CONNECT</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Rescan button */}
          <TouchableOpacity
            style={[styles.rescanBtn, { borderColor: palette.border }]}
            onPress={startScan}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={14} color={palette.textMuted} />
            <Text style={[styles.rescanText, { color: palette.textMuted }]}>SCAN AGAIN</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Error State */}
      {scanState === 'error' && (
        <View style={styles.errorContainer}>
          <View style={[styles.errorIcon, { backgroundColor: '#FF9500' + '12' }]}>
            <Ionicons name="alert-circle-outline" size={36} color="#FF9500" />
          </View>
          <Text style={[styles.errorTitle, { color: '#FF9500' }]}>
            No Devices Found
          </Text>
          <Text style={[styles.errorDesc, { color: palette.textMuted }]}>
            {error || 'Unable to discover devices. Please try again.'}
          </Text>
          <View style={styles.errorHints}>
            {[
              `Ensure your ${display.label} device is powered on`,
              'Move closer to the device',
              'Check that Bluetooth is enabled on this device',
            ].map((hint, idx) => (
              <View key={idx} style={styles.hintRow}>
                <View style={[styles.hintDot, { backgroundColor: '#FF9500' + '50' }]} />
                <Text style={[styles.hintText, { color: palette.textMuted }]}>{hint}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={[styles.retryBtn, { backgroundColor: display.color }]}
            onPress={startScan}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={14} color="#FFF" />
            <Text style={styles.retryBtnText}>TRY AGAIN</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Back button */}
      <TouchableOpacity
        style={[styles.backBtn, { borderColor: palette.border }]}
        onPress={onBack}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={14} color={palette.textMuted} />
        <Text style={[styles.backText, { color: palette.textMuted }]}>BACK TO PROVIDERS</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  stepBadge: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  stepNumber: { fontSize: 16, fontWeight: '800' },
  headerText: { flex: 1, gap: 2 },
  stepLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 3, textTransform: 'uppercase' },
  title: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  brandChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  brandChipText: { fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  divider: { height: 1, marginBottom: SPACING.lg },

  // Scanning
  scanningContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 40 },
  scanPulse: { borderWidth: 2, borderRadius: 50, padding: 8 },
  scanIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  scanningText: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  scanningHint: { fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },

  // Success
  successIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },

  // Device list
  deviceList: { flex: 1, gap: SPACING.sm },
  foundLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 3, marginBottom: 4 },
  deviceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: SPACING.lg, borderRadius: RADIUS.lg, borderWidth: 1 },
  deviceIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, gap: 2 },
  deviceName: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  deviceModel: { fontSize: 11, fontWeight: '500' },
  deviceRight: { alignItems: 'flex-end', gap: 8 },
  signalBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  signalText: { fontSize: 7, fontWeight: '800', letterSpacing: 1 },
  connectBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  connectBtnText: { color: '#000', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  rescanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: RADIUS.md, borderWidth: 1, marginTop: 4 },
  rescanText: { fontSize: 10, fontWeight: '700', letterSpacing: 2 },

  // Error
  errorContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 30 },
  errorIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  errorTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  errorDesc: { fontSize: 13, textAlign: 'center', lineHeight: 19, paddingHorizontal: 20 },
  errorHints: { width: '100%', paddingHorizontal: 20, gap: 8, marginTop: 8 },
  hintRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hintDot: { width: 5, height: 5, borderRadius: 3 },
  hintText: { fontSize: 12, fontWeight: '500' },
  retryBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 8, marginTop: 8 },
  retryBtnText: { color: '#000', fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  // Back
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: RADIUS.md, borderWidth: 1, marginTop: SPACING.sm },
  backText: { fontSize: 11, fontWeight: '700', letterSpacing: 2 },
});



