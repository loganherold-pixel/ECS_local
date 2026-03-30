/**
 * ═══════════════════════════════════════════════════════════
 * ECS OBD SETUP WIZARD
 * ═══════════════════════════════════════════════════════════
 *
 * Guided multi-step flow for connecting Bluetooth OBD-II
 * adapters to ECS. Steps:
 *   1. Welcome / Adapter Info
 *   2. BLE Scan & Device Discovery
 *   3. Connect & Confirm
 *   4. Device Configuration (name, vehicle assignment)
 *   5. Success / First Telemetry
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import Header from '../components/Header';
import { useOBD2Scanner } from '../src/vehicle-telemetry/useOBD2Scanner';
import { useVehicleTelemetry } from '../src/vehicle-telemetry/useVehicleTelemetry';
import type { OBD2DiscoveredDevice } from '../src/vehicle-telemetry/OBD2Adapter';

// ═══════════════════════════════════════════════════════════
// SUPPORTED ADAPTERS
// ═══════════════════════════════════════════════════════════

const SUPPORTED_ADAPTERS = [
  { name: 'OBDLink MX+', desc: 'Premium BLE adapter', icon: 'hardware-chip-outline' },
  { name: 'OBDLink CX', desc: 'Compact BLE adapter', icon: 'hardware-chip-outline' },
  { name: 'Veepeak BLE', desc: 'Budget BLE adapter', icon: 'bluetooth-outline' },
  { name: 'BAFX Products', desc: 'Bluetooth OBD-II', icon: 'bluetooth-outline' },
  { name: 'Carista', desc: 'BLE diagnostic adapter', icon: 'bluetooth-outline' },
  { name: 'Generic ELM327', desc: 'ELM327 compatible', icon: 'bluetooth-outline' },
];

// ═══════════════════════════════════════════════════════════
// SIGNAL STRENGTH BARS
// ═══════════════════════════════════════════════════════════

function SignalBars({ rssi }: { rssi: number }) {
  const bars = rssi > -50 ? 4 : rssi > -65 ? 3 : rssi > -80 ? 2 : rssi > -90 ? 1 : 0;
  const color = bars >= 3 ? '#4CAF50' : bars >= 2 ? '#FFB300' : '#EF5350';
  const label = bars >= 3 ? 'Strong' : bars >= 2 ? 'Moderate' : bars >= 1 ? 'Weak' : 'Very Weak';

  return (
    <View style={sigS.container}>
      <View style={sigS.bars}>
        {[0, 1, 2, 3].map(i => (
          <View
            key={i}
            style={[sigS.bar, { height: 4 + i * 3 }, i <= bars ? { backgroundColor: color } : { backgroundColor: 'rgba(255,255,255,0.1)' }]}
          />
        ))}
      </View>
      <Text style={[sigS.label, { color }]}>{label}</Text>
    </View>
  );
}

const sigS = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 1.5, height: 16 },
  bar: { width: 3, borderRadius: 1 },
  label: { fontSize: 9, fontWeight: '600' },
});

// ═══════════════════════════════════════════════════════════
// STEP PROGRESS BAR
// ═══════════════════════════════════════════════════════════

function StepProgress({ current, total }: { current: number; total: number }) {
  return (
    <View style={stepS.container}>
      {Array.from({ length: total }, (_, i) => (
        <React.Fragment key={i}>
          <View style={[stepS.dot, i <= current ? stepS.dotActive : null]}>
            {i < current ? (
              <Ionicons name="checkmark" size={10} color={TACTICAL.bg} />
            ) : (
              <Text style={[stepS.dotText, i === current ? stepS.dotTextActive : null]}>{i + 1}</Text>
            )}
          </View>
          {i < total - 1 && (
            <View style={[stepS.line, i < current ? stepS.lineActive : null]} />
          )}
        </React.Fragment>
      ))}
    </View>
  );
}

const stepS = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 24 },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: TACTICAL.amber, borderColor: TACTICAL.amber },
  dotText: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted },
  dotTextActive: { color: TACTICAL.bg },
  line: { flex: 1, height: 2, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 4 },
  lineActive: { backgroundColor: TACTICAL.amber },
});

// ═══════════════════════════════════════════════════════════
// MAIN WIZARD
// ═══════════════════════════════════════════════════════════

export default function OBDSetupWizard() {
  const router = useRouter();
  const scanner = useOBD2Scanner();
  const vt = useVehicleTelemetry();
  const [step, setStep] = useState(0);
  const [deviceName, setDeviceName] = useState('');
  const [selectedDevice, setSelectedDevice] = useState<OBD2DiscoveredDevice | null>(null);

  // ── Step 0: Welcome ──
  const renderWelcome = () => (
    <ScrollView style={ws.scroll} contentContainerStyle={ws.scrollContent}>
      <View style={ws.heroSection}>
        <View style={ws.heroIcon}>
          <Ionicons name="car-outline" size={36} color={TACTICAL.amber} />
        </View>
        <Text style={ws.heroTitle}>Vehicle Telemetry Setup</Text>
        <Text style={ws.heroDesc}>
          Connect a Bluetooth OBD-II adapter to monitor live engine data, fuel levels, battery voltage, and vehicle diagnostics during your expedition.
        </Text>
      </View>

      <Text style={ws.sectionTitle}>WHAT YOU'LL NEED</Text>
      <View style={ws.reqCard}>
        <View style={ws.reqRow}>
          <Ionicons name="checkmark-circle-outline" size={16} color={TACTICAL.amber} />
          <Text style={ws.reqText}>A compatible Bluetooth OBD-II adapter</Text>
        </View>
        <View style={ws.reqRow}>
          <Ionicons name="checkmark-circle-outline" size={16} color={TACTICAL.amber} />
          <Text style={ws.reqText}>Adapter plugged into vehicle OBD-II port</Text>
        </View>
        <View style={ws.reqRow}>
          <Ionicons name="checkmark-circle-outline" size={16} color={TACTICAL.amber} />
          <Text style={ws.reqText}>Vehicle ignition ON or engine running</Text>
        </View>
        <View style={ws.reqRow}>
          <Ionicons name="checkmark-circle-outline" size={16} color={TACTICAL.amber} />
          <Text style={ws.reqText}>Bluetooth enabled on your device</Text>
        </View>
      </View>

      <Text style={ws.sectionTitle}>SUPPORTED ADAPTERS</Text>
      <View style={ws.adapterGrid}>
        {SUPPORTED_ADAPTERS.map(adapter => (
          <View key={adapter.name} style={ws.adapterCard}>
            <Ionicons name={adapter.icon as any} size={18} color={TACTICAL.amber} />
            <Text style={ws.adapterName}>{adapter.name}</Text>
            <Text style={ws.adapterDesc}>{adapter.desc}</Text>
          </View>
        ))}
      </View>

      <Text style={ws.sectionTitle}>AVAILABLE TELEMETRY</Text>
      <View style={ws.telemetryList}>
        {['Engine RPM', 'Vehicle Speed', 'Coolant Temperature', 'Battery Voltage', 'Fuel Level', 'Engine Load', 'Throttle Position', 'Intake Temperature', 'Transmission Temperature'].map(item => (
          <View key={item} style={ws.telemetryRow}>
            <View style={ws.telemetryDot} />
            <Text style={ws.telemetryText}>{item}</Text>
          </View>
        ))}
      </View>

      <TouchableOpacity style={ws.primaryBtn} onPress={() => setStep(1)} activeOpacity={0.7}>
        <Text style={ws.primaryBtnText}>BEGIN SETUP</Text>
        <Ionicons name="arrow-forward" size={16} color={TACTICAL.bg} />
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Step 1: Scan ──
  const renderScan = () => {
    // Auto-start scan
    useEffect(() => {
      if (step === 1 && !scanner.isScanning && !scanner.isConnected && !scanner.isConnecting) {
        scanner.startScan(15000);
      }
    }, [step]);

    return (
      <ScrollView style={ws.scroll} contentContainerStyle={ws.scrollContent}>
        <Text style={ws.stepTitle}>Scanning for OBD-II Adapters</Text>
        <Text style={ws.stepDesc}>
          Make sure your adapter is plugged in and the vehicle ignition is ON.
        </Text>

        {/* Scan progress */}
        {scanner.isScanning && (
          <View style={ws.scanProgressContainer}>
            <View style={[ws.scanProgressBar, { width: `${scanner.scanProgress * 100}%` }]} />
          </View>
        )}

        {/* Error */}
        {scanner.error && (
          <View style={ws.errorCard}>
            <Ionicons name="alert-circle" size={16} color="#EF5350" />
            <Text style={ws.errorText}>{scanner.error}</Text>
          </View>
        )}

        {/* Device list */}
        {scanner.devices.length > 0 ? (
          <View style={ws.deviceList}>
            {scanner.obdDeviceCount > 0 && (
              <Text style={ws.deviceListTitle}>
                {scanner.obdDeviceCount} OBD-II ADAPTER{scanner.obdDeviceCount !== 1 ? 'S' : ''} DETECTED
              </Text>
            )}
            {scanner.devices.map(device => (
              <TouchableOpacity
                key={device.id}
                style={[ws.deviceCard, device.isLikelyOBD && ws.deviceCardOBD]}
                onPress={() => { setSelectedDevice(device); setStep(2); }}
                activeOpacity={0.7}
              >
                <View style={ws.deviceIcon}>
                  <Ionicons
                    name={device.isLikelyOBD ? 'car-outline' : 'bluetooth-outline'}
                    size={20}
                    color={device.isLikelyOBD ? TACTICAL.amber : TACTICAL.textMuted}
                  />
                </View>
                <View style={ws.deviceInfo}>
                  <View style={ws.deviceNameRow}>
                    <Text style={[ws.deviceName, device.isLikelyOBD && ws.deviceNameOBD]}>{device.name}</Text>
                    {device.isLikelyOBD && (
                      <View style={ws.obdBadge}>
                        <Text style={ws.obdBadgeText}>OBD-II</Text>
                      </View>
                    )}
                  </View>
                  <SignalBars rssi={device.rssi} />
                </View>
                <Ionicons name="chevron-forward" size={16} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            ))}
          </View>
        ) : scanner.isScanning ? (
          <View style={ws.scanningState}>
            <ActivityIndicator size="large" color={TACTICAL.amber} />
            <Text style={ws.scanningText}>Scanning for Bluetooth devices...</Text>
          </View>
        ) : (
          <View style={ws.emptyState}>
            <Ionicons name="bluetooth-outline" size={40} color={TACTICAL.textMuted} />
            <Text style={ws.emptyTitle}>No Devices Found</Text>
            <Text style={ws.emptyDesc}>
              Ensure your OBD-II adapter is plugged in and Bluetooth is enabled.
            </Text>
          </View>
        )}

        {/* Rescan button */}
        {!scanner.isScanning && (
          <TouchableOpacity style={ws.secondaryBtn} onPress={() => scanner.startScan(15000)} activeOpacity={0.7}>
            <Ionicons name="refresh-outline" size={14} color={TACTICAL.amber} />
            <Text style={ws.secondaryBtnText}>SCAN AGAIN</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    );
  };

  // ── Step 2: Connect ──
  const renderConnect = () => {
    const [connecting, setConnecting] = useState(false);
    const [connectError, setConnectError] = useState<string | null>(null);

    const handleConnect = async () => {
      if (!selectedDevice) return;
      setConnecting(true);
      setConnectError(null);
      try {
        if (scanner.isScanning) await scanner.stopScan();
        const success = await scanner.connectToDevice(selectedDevice.id, selectedDevice.name);
        if (success) {
          setDeviceName(selectedDevice.name);
          setStep(3);
        } else {
          setConnectError('Connection failed. Please try again.');
        }
      } catch (err: any) {
        setConnectError(err?.message || 'Connection failed');
      }
      setConnecting(false);
    };

    return (
      <ScrollView style={ws.scroll} contentContainerStyle={ws.scrollContent}>
        <Text style={ws.stepTitle}>Connect to Adapter</Text>

        {selectedDevice && (
          <View style={ws.confirmCard}>
            <View style={ws.confirmIcon}>
              <Ionicons name="car-outline" size={28} color={TACTICAL.amber} />
            </View>
            <Text style={ws.confirmName}>{selectedDevice.name}</Text>
            <SignalBars rssi={selectedDevice.rssi} />
            <Text style={ws.confirmId}>
              {selectedDevice.id.length > 20 ? `${selectedDevice.id.slice(0, 8)}...${selectedDevice.id.slice(-6)}` : selectedDevice.id}
            </Text>
          </View>
        )}

        {connectError && (
          <View style={ws.errorCard}>
            <Ionicons name="alert-circle" size={16} color="#EF5350" />
            <Text style={ws.errorText}>{connectError}</Text>
          </View>
        )}

        <TouchableOpacity
          style={[ws.primaryBtn, connecting && ws.primaryBtnDisabled]}
          onPress={handleConnect}
          activeOpacity={0.7}
          disabled={connecting}
        >
          {connecting ? (
            <ActivityIndicator size="small" color={TACTICAL.bg} />
          ) : (
            <Ionicons name="bluetooth-outline" size={16} color={TACTICAL.bg} />
          )}
          <Text style={ws.primaryBtnText}>
            {connecting ? 'CONNECTING...' : 'CONNECT'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={ws.secondaryBtn} onPress={() => setStep(1)} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={14} color={TACTICAL.amber} />
          <Text style={ws.secondaryBtnText}>BACK TO SCAN</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Step 3: Configure ──
  const renderConfigure = () => (
    <ScrollView style={ws.scroll} contentContainerStyle={ws.scrollContent}>
      <Text style={ws.stepTitle}>Configure Device</Text>
      <Text style={ws.stepDesc}>
        Optionally rename the device and assign it to a vehicle.
      </Text>

      <View style={ws.configSection}>
        <Text style={ws.configLabel}>DEVICE NAME</Text>
        <TextInput
          style={ws.configInput}
          value={deviceName}
          onChangeText={setDeviceName}
          placeholder={selectedDevice?.name || 'OBD-II Adapter'}
          placeholderTextColor={TACTICAL.textMuted + '60'}
          maxLength={40}
        />
        <Text style={ws.configHint}>Leave blank to use the default name</Text>
      </View>

      <View style={ws.configSection}>
        <Text style={ws.configLabel}>TELEMETRY FIELDS</Text>
        <Text style={ws.configDesc}>
          ECS will automatically discover which telemetry fields your vehicle supports during the first polling cycle.
        </Text>
        <View style={ws.fieldGrid}>
          {['RPM', 'Speed', 'Coolant', 'Voltage', 'Fuel', 'Load', 'Throttle', 'Intake Temp'].map(field => (
            <View key={field} style={ws.fieldChip}>
              <Ionicons name="checkmark-circle" size={10} color="#4CAF50" />
              <Text style={ws.fieldChipText}>{field}</Text>
            </View>
          ))}
        </View>
      </View>

      <TouchableOpacity style={ws.primaryBtn} onPress={() => setStep(4)} activeOpacity={0.7}>
        <Text style={ws.primaryBtnText}>COMPLETE SETUP</Text>
        <Ionicons name="checkmark" size={16} color={TACTICAL.bg} />
      </TouchableOpacity>
    </ScrollView>
  );

  // ── Step 4: Success ──
  const renderSuccess = () => {
    const hasLiveData = vt.hasData && vt.freshnessLabel === 'live';

    return (
      <ScrollView style={ws.scroll} contentContainerStyle={ws.scrollContent}>
        <View style={ws.successSection}>
          <View style={ws.successIcon}>
            <Ionicons name="checkmark-circle" size={48} color="#4CAF50" />
          </View>
          <Text style={ws.successTitle}>OBD-II Connected</Text>
          <Text style={ws.successDesc}>
            Your vehicle telemetry adapter is now connected and providing live data to ECS.
          </Text>
        </View>

        <View style={ws.successCard}>
          <View style={ws.successRow}>
            <Text style={ws.successLabel}>DEVICE</Text>
            <Text style={ws.successValue}>{deviceName || selectedDevice?.name || 'OBD-II Adapter'}</Text>
          </View>
          <View style={ws.successRow}>
            <Text style={ws.successLabel}>STATUS</Text>
            <View style={ws.successStatusBadge}>
              <View style={[ws.successStatusDot, { backgroundColor: scanner.isConnected ? '#4CAF50' : '#FFB300' }]} />
              <Text style={[ws.successStatusText, { color: scanner.isConnected ? '#4CAF50' : '#FFB300' }]}>
                {scanner.isConnected ? 'CONNECTED' : 'CONNECTING'}
              </Text>
            </View>
          </View>
          {vt.summary.battery_voltage != null && (
            <View style={ws.successRow}>
              <Text style={ws.successLabel}>BATTERY</Text>
              <Text style={ws.successValue}>{vt.summary.battery_voltage.toFixed(1)} V</Text>
            </View>
          )}
          {vt.summary.engine_rpm != null && (
            <View style={ws.successRow}>
              <Text style={ws.successLabel}>ENGINE</Text>
              <Text style={ws.successValue}>{Math.round(vt.summary.engine_rpm)} RPM</Text>
            </View>
          )}
          {vt.summary.coolant_temp != null && (
            <View style={ws.successRow}>
              <Text style={ws.successLabel}>COOLANT</Text>
              <Text style={ws.successValue}>{Math.round(vt.summary.coolant_temp)}°F</Text>
            </View>
          )}
          {vt.summary.fuel_level != null && (
            <View style={ws.successRow}>
              <Text style={ws.successLabel}>FUEL</Text>
              <Text style={ws.successValue}>{Math.round(vt.summary.fuel_level)}%</Text>
            </View>
          )}
        </View>

        {!hasLiveData && (
          <View style={ws.waitingCard}>
            <ActivityIndicator size="small" color={TACTICAL.amber} />
            <Text style={ws.waitingText}>Waiting for first telemetry data...</Text>
          </View>
        )}

        <TouchableOpacity
          style={ws.primaryBtn}
          onPress={() => router.replace('/(tabs)/dashboard')}
          activeOpacity={0.7}
        >
          <Text style={ws.primaryBtnText}>RETURN TO DASHBOARD</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={ws.secondaryBtn}
          onPress={() => router.push('/vehicle-telemetry-settings')}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={14} color={TACTICAL.amber} />
          <Text style={ws.secondaryBtnText}>TELEMETRY SETTINGS</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };

  // ── Render current step ──
  const renderStep = () => {
    switch (step) {
      case 0: return renderWelcome();
      case 1: return renderScan();
      case 2: return renderConnect();
      case 3: return renderConfigure();
      case 4: return renderSuccess();
      default: return renderWelcome();
    }
  };

  return (
    <View style={ws.container}>
      <Header />

      {/* Back / Close */}
      <View style={ws.navRow}>
        <TouchableOpacity
          style={ws.backBtn}
          onPress={() => step > 0 ? setStep(step - 1) : router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={TACTICAL.amber} />
          <Text style={ws.backText}>{step > 0 ? 'Back' : 'Close'}</Text>
        </TouchableOpacity>
        <Text style={ws.navTitle}>OBD-II Setup</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Step progress */}
      <StepProgress current={step} total={5} />

      {/* Step content */}
      {renderStep()}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════

const ws = StyleSheet.create({
  container: { flex: 1, backgroundColor: TACTICAL.bg },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: TACTICAL.border },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 13, fontWeight: '600', color: TACTICAL.amber },
  navTitle: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.5 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, gap: 16, paddingBottom: 40 },

  // ── Hero ──
  heroSection: { alignItems: 'center', gap: 10, paddingVertical: 16 },
  heroIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: TACTICAL.amber + '12', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontSize: 22, fontWeight: '900', color: TACTICAL.text, letterSpacing: 0.5 },
  heroDesc: { fontSize: 12, fontWeight: '500', color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },

  // ── Sections ──
  sectionTitle: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 2, marginTop: 8 },
  stepTitle: { fontSize: 18, fontWeight: '900', color: TACTICAL.text, letterSpacing: 0.5 },
  stepDesc: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 16 },

  // ── Requirements ──
  reqCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 14, gap: 10 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  reqText: { fontSize: 12, fontWeight: '600', color: TACTICAL.text, flex: 1 },

  // ── Adapters ──
  adapterGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  adapterCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 12, gap: 4, minWidth: '45%', flex: 1 },
  adapterName: { fontSize: 11, fontWeight: '700', color: TACTICAL.text },
  adapterDesc: { fontSize: 9, fontWeight: '500', color: TACTICAL.textMuted },

  // ── Telemetry list ──
  telemetryList: { gap: 6 },
  telemetryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  telemetryDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: TACTICAL.amber + '60' },
  telemetryText: { fontSize: 11, fontWeight: '600', color: TACTICAL.textMuted },

  // ── Buttons ──
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10, backgroundColor: TACTICAL.amber },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { fontSize: 13, fontWeight: '800', color: TACTICAL.bg, letterSpacing: 1.5 },
  secondaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.amber + '30', backgroundColor: TACTICAL.amber + '08' },
  secondaryBtnText: { fontSize: 11, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5 },

  // ── Scan ──
  scanProgressContainer: { height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' },
  scanProgressBar: { height: 3, backgroundColor: TACTICAL.amber, borderRadius: 2 },
  scanningState: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  scanningText: { fontSize: 12, fontWeight: '600', color: TACTICAL.textMuted },

  // ── Devices ──
  deviceList: { gap: 8 },
  deviceListTitle: { fontSize: 9, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5, marginBottom: 4 },
  deviceCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.02)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  deviceCardOBD: { borderColor: TACTICAL.amber + '25', backgroundColor: 'rgba(196,138,44,0.03)' },
  deviceIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, gap: 4 },
  deviceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deviceName: { fontSize: 14, fontWeight: '700', color: TACTICAL.text },
  deviceNameOBD: { color: TACTICAL.amber },
  obdBadge: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3, backgroundColor: TACTICAL.amber + '15' },
  obdBadgeText: { fontSize: 7, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 0.8 },

  // ── Empty ──
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 40 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: TACTICAL.textMuted },
  emptyDesc: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 16, paddingHorizontal: 20 },

  // ── Error ──
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 8, backgroundColor: 'rgba(239,83,80,0.08)', borderWidth: 1, borderColor: 'rgba(239,83,80,0.15)' },
  errorText: { fontSize: 11, fontWeight: '600', color: '#EF5350', flex: 1 },

  // ── Confirm ──
  confirmCard: { alignItems: 'center', gap: 8, paddingVertical: 24, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  confirmIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: TACTICAL.amber + '12', alignItems: 'center', justifyContent: 'center' },
  confirmName: { fontSize: 18, fontWeight: '800', color: TACTICAL.text },
  confirmId: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, fontFamily: 'Courier' },

  // ── Configure ──
  configSection: { gap: 6 },
  configLabel: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5 },
  configInput: { backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontWeight: '700', color: TACTICAL.text },
  configHint: { fontSize: 9, fontWeight: '500', color: TACTICAL.textMuted, fontStyle: 'italic' },
  configDesc: { fontSize: 10, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 14 },
  fieldGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  fieldChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: 'rgba(76,175,80,0.08)', borderWidth: 1, borderColor: 'rgba(76,175,80,0.15)' },
  fieldChipText: { fontSize: 9, fontWeight: '700', color: '#4CAF50' },

  // ── Success ──
  successSection: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  successIcon: {},
  successTitle: { fontSize: 22, fontWeight: '900', color: '#4CAF50' },
  successDesc: { fontSize: 12, fontWeight: '500', color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 18, paddingHorizontal: 20 },
  successCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 14, gap: 8 },
  successRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  successLabel: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  successValue: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  successStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  successStatusDot: { width: 6, height: 6, borderRadius: 3 },
  successStatusText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  waitingCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 12, borderRadius: 8, backgroundColor: TACTICAL.amber + '08', borderWidth: 1, borderColor: TACTICAL.amber + '20' },
  waitingText: { fontSize: 11, fontWeight: '600', color: TACTICAL.amber },
});




