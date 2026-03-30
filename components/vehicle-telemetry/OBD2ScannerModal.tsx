/**
 * ═══════════════════════════════════════════════════════════
 * OBD-II SCANNER MODAL — Phase 2B
 * ═══════════════════════════════════════════════════════════
 *
 * Full-screen modal for discovering and connecting to
 * Bluetooth OBD-II adapters. Shows:
 *   - BLE scan progress
 *   - Discovered device list (OBD-II likely devices first)
 *   - Device selection and connection
 *   - Connection success confirmation
 *   - Error handling
 */

import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { useOBD2Scanner } from '../../src/vehicle-telemetry/useOBD2Scanner';
import type { OBD2DiscoveredDevice } from '../../src/vehicle-telemetry/OBD2Adapter';

interface OBD2ScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onConnected?: (deviceId: string, deviceName: string) => void;
}

// ═══════════════════════════════════════════════════════════
// SIGNAL STRENGTH INDICATOR
// ═══════════════════════════════════════════════════════════

function SignalBars({ rssi }: { rssi: number }) {
  // Map RSSI to 0–4 bars
  // -30 = excellent, -60 = good, -80 = fair, -90 = weak, -100 = very weak
  const bars = rssi > -50 ? 4 : rssi > -65 ? 3 : rssi > -80 ? 2 : rssi > -90 ? 1 : 0;
  const color = bars >= 3 ? '#4CAF50' : bars >= 2 ? '#FFB300' : '#EF5350';

  return (
    <View style={sigStyles.container}>
      {[0, 1, 2, 3].map(i => (
        <View
          key={i}
          style={[
            sigStyles.bar,
            { height: 4 + i * 3 },
            i <= bars ? { backgroundColor: color } : { backgroundColor: 'rgba(255,255,255,0.1)' },
          ]}
        />
      ))}
    </View>
  );
}

const sigStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 1.5,
    height: 16,
  },
  bar: {
    width: 3,
    borderRadius: 1,
  },
});

// ═══════════════════════════════════════════════════════════
// DEVICE ROW
// ═══════════════════════════════════════════════════════════

function DeviceRow({
  device,
  isConnecting,
  connectingId,
  onSelect,
}: {
  device: OBD2DiscoveredDevice;
  isConnecting: boolean;
  connectingId: string | null;
  onSelect: (device: OBD2DiscoveredDevice) => void;
}) {
  const isThisConnecting = isConnecting && connectingId === device.id;

  return (
    <TouchableOpacity
      style={[
        styles.deviceRow,
        device.isLikelyOBD && styles.deviceRowOBD,
        isThisConnecting && styles.deviceRowConnecting,
      ]}
      onPress={() => onSelect(device)}
      activeOpacity={0.7}
      disabled={isConnecting}
    >
      <View style={styles.deviceIcon}>
        <Ionicons
          name={device.isLikelyOBD ? 'car-outline' : 'bluetooth-outline'}
          size={18}
          color={device.isLikelyOBD ? TACTICAL.amber : TACTICAL.textMuted}
        />
      </View>

      <View style={styles.deviceInfo}>
        <View style={styles.deviceNameRow}>
          <Text style={[
            styles.deviceName,
            device.isLikelyOBD && styles.deviceNameOBD,
          ]} numberOfLines={1}>
            {device.name}
          </Text>
          {device.isLikelyOBD && (
            <View style={styles.obdBadge}>
              <Text style={styles.obdBadgeText}>OBD-II</Text>
            </View>
          )}
        </View>

        <View style={styles.deviceMeta}>
          <Text style={styles.deviceId} numberOfLines={1}>
            {device.id.length > 20 ? `${device.id.slice(0, 8)}...${device.id.slice(-6)}` : device.id}
          </Text>
          <Text style={styles.deviceRssi}>
            {device.rssi} dBm
          </Text>
        </View>
      </View>

      {isThisConnecting ? (
        <ActivityIndicator size="small" color={TACTICAL.amber} />
      ) : (
        <View style={styles.deviceSignal}>
          <SignalBars rssi={device.rssi} />
        </View>
      )}
    </TouchableOpacity>
  );
}

// ═══════════════════════════════════════════════════════════
// MAIN MODAL
// ═══════════════════════════════════════════════════════════

export default function OBD2ScannerModal({
  visible,
  onClose,
  onConnected,
}: OBD2ScannerModalProps) {
  const scanner = useOBD2Scanner();

  // Auto-start scan when modal opens
  useEffect(() => {
    if (visible && !scanner.isScanning && !scanner.isConnected && !scanner.isConnecting) {
      scanner.startScan(15000);
    }
    // Stop scan when modal closes
    return () => {
      if (scanner.isScanning) {
        scanner.stopScan();
      }
    };
  }, [visible]);

  // Notify parent on connection success
  useEffect(() => {
    if (scanner.connectionJustSucceeded && scanner.connectedDeviceId && scanner.connectedDeviceName) {
      onConnected?.(scanner.connectedDeviceId, scanner.connectedDeviceName);
    }
  }, [scanner.connectionJustSucceeded]);

  const handleSelectDevice = useCallback(async (device: OBD2DiscoveredDevice) => {
    // Stop scan before connecting
    if (scanner.isScanning) {
      await scanner.stopScan();
    }
    await scanner.connectToDevice(device.id, device.name);
  }, [scanner]);

  const handleRescan = useCallback(() => {
    scanner.startScan(15000);
  }, [scanner]);

  const handleClose = useCallback(() => {
    if (scanner.isScanning) {
      scanner.stopScan();
    }
    onClose();
  }, [scanner, onClose]);

  const renderDevice = useCallback(({ item }: { item: OBD2DiscoveredDevice }) => (
    <DeviceRow
      device={item}
      isConnecting={scanner.isConnecting}
      connectingId={scanner.connectedDeviceId}
      onSelect={handleSelectDevice}
    />
  ), [scanner.isConnecting, scanner.connectedDeviceId, handleSelectDevice]);

  const keyExtractor = useCallback((item: OBD2DiscoveredDevice) => item.id, []);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
          </TouchableOpacity>

          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>OBD-II Scanner</Text>
            <Text style={styles.headerSubtitle}>
              {scanner.isScanning
                ? 'Scanning for Bluetooth devices...'
                : scanner.isConnected
                  ? `Connected to ${scanner.connectedDeviceName}`
                  : scanner.isConnecting
                    ? 'Connecting...'
                    : `${scanner.deviceCount} device${scanner.deviceCount !== 1 ? 's' : ''} found`
              }
            </Text>
          </View>

          {!scanner.isScanning && !scanner.isConnected && !scanner.isConnecting && (
            <TouchableOpacity
              style={styles.rescanBtn}
              onPress={handleRescan}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh-outline" size={16} color={TACTICAL.amber} />
            </TouchableOpacity>
          )}
        </View>

        {/* Scan progress bar */}
        {scanner.isScanning && (
          <View style={styles.progressContainer}>
            <View style={[styles.progressBar, { width: `${scanner.scanProgress * 100}%` }]} />
          </View>
        )}

        {/* Connection success banner */}
        {scanner.connectionJustSucceeded && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
            <Text style={styles.successText}>
              Connected to {scanner.connectedDeviceName}
            </Text>
          </View>
        )}

        {/* Error banner */}
        {scanner.error && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color="#EF5350" />
            <Text style={styles.errorText} numberOfLines={2}>
              {scanner.error}
            </Text>
            <TouchableOpacity onPress={handleRescan} activeOpacity={0.7}>
              <Text style={styles.errorRetry}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Reconnecting banner */}
        {scanner.isReconnecting && (
          <View style={styles.reconnectBanner}>
            <ActivityIndicator size="small" color={TACTICAL.amber} />
            <Text style={styles.reconnectText}>
              Reconnecting... (attempt {scanner.reconnectAttempt})
            </Text>
          </View>
        )}

        {/* Connected state */}
        {scanner.isConnected && !scanner.connectionJustSucceeded && (
          <View style={styles.connectedCard}>
            <View style={styles.connectedIcon}>
              <Ionicons name="car-outline" size={28} color={TACTICAL.amber} />
            </View>
            <Text style={styles.connectedName}>{scanner.connectedDeviceName}</Text>
            <Text style={styles.connectedStatus}>OBD-II adapter connected</Text>
            <View style={styles.connectedActions}>
              <TouchableOpacity
                style={styles.disconnectBtn}
                onPress={() => scanner.disconnect()}
                activeOpacity={0.7}
              >
                <Ionicons name="power-outline" size={14} color="#EF5350" />
                <Text style={styles.disconnectText}>Disconnect</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.doneBtn}
                onPress={handleClose}
                activeOpacity={0.7}
              >
                <Text style={styles.doneBtnText}>DONE</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Device list */}
        {!scanner.isConnected && (
          <>
            {/* Section headers */}
            {scanner.obdDeviceCount > 0 && scanner.deviceCount > scanner.obdDeviceCount && (
              <View style={styles.sectionHeader}>
                <Ionicons name="car-outline" size={12} color={TACTICAL.amber} />
                <Text style={styles.sectionHeaderText}>
                  {scanner.obdDeviceCount} OBD-II ADAPTER{scanner.obdDeviceCount !== 1 ? 'S' : ''} DETECTED
                </Text>
              </View>
            )}

            <FlatList
              data={scanner.devices}
              renderItem={renderDevice}
              keyExtractor={keyExtractor}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                scanner.isScanning ? (
                  <View style={styles.emptyState}>
                    <ActivityIndicator size="large" color={TACTICAL.amber} />
                    <Text style={styles.emptyTitle}>Scanning for devices...</Text>
                    <Text style={styles.emptyDesc}>
                      Make sure your OBD-II adapter is plugged in and Bluetooth is enabled.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.emptyState}>
                    <Ionicons name="bluetooth-outline" size={40} color={TACTICAL.textMuted} />
                    <Text style={styles.emptyTitle}>No Devices Found</Text>
                    <Text style={styles.emptyDesc}>
                      Ensure your OBD-II adapter is plugged into the vehicle's diagnostic port
                      and Bluetooth is enabled on your device.
                    </Text>
                    <TouchableOpacity
                      style={styles.rescanFullBtn}
                      onPress={handleRescan}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="refresh-outline" size={14} color={TACTICAL.bg} />
                      <Text style={styles.rescanFullBtnText}>SCAN AGAIN</Text>
                    </TouchableOpacity>
                  </View>
                )
              }
            />
          </>
        )}

        {/* Tips section */}
        {!scanner.isConnected && !scanner.isConnecting && scanner.deviceCount === 0 && !scanner.isScanning && (
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>TROUBLESHOOTING</Text>
            <View style={styles.tipRow}>
              <Ionicons name="checkmark-outline" size={12} color={TACTICAL.amber} />
              <Text style={styles.tipText}>OBD-II adapter plugged into vehicle port</Text>
            </View>
            <View style={styles.tipRow}>
              <Ionicons name="checkmark-outline" size={12} color={TACTICAL.amber} />
              <Text style={styles.tipText}>Vehicle ignition is ON (or engine running)</Text>
            </View>
            <View style={styles.tipRow}>
              <Ionicons name="checkmark-outline" size={12} color={TACTICAL.amber} />
              <Text style={styles.tipText}>Bluetooth is enabled on your phone</Text>
            </View>
            <View style={styles.tipRow}>
              <Ionicons name="checkmark-outline" size={12} color={TACTICAL.amber} />
              <Text style={styles.tipText}>Adapter LED is blinking (powered on)</Text>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
  },

  // ── Header ─────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 56 : 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
    gap: 12,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  rescanBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: TACTICAL.amber + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Progress ───────────────────────────────────────────
  progressContainer: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  progressBar: {
    height: 2,
    backgroundColor: TACTICAL.amber,
  },

  // ── Banners ────────────────────────────────────────────
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(76,175,80,0.15)',
  },
  successText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
    flex: 1,
  },

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239,83,80,0.15)',
  },
  errorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF5350',
    flex: 1,
  },
  errorRetry: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.amber,
    paddingHorizontal: 8,
  },

  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: TACTICAL.amber + '08',
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.amber + '15',
  },
  reconnectText: {
    fontSize: 11,
    fontWeight: '600',
    color: TACTICAL.amber,
  },

  // ── Connected card ─────────────────────────────────────
  connectedCard: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    gap: 8,
  },
  connectedIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: TACTICAL.amber + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  connectedName: {
    fontSize: 18,
    fontWeight: '800',
    color: TACTICAL.text,
    textAlign: 'center',
  },
  connectedStatus: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
    letterSpacing: 0.5,
  },
  connectedActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
  },
  disconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.20)',
  },
  disconnectText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#EF5350',
  },
  doneBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.bg,
    letterSpacing: 1.5,
  },

  // ── Section header ─────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  sectionHeaderText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },

  // ── Device list ────────────────────────────────────────
  listContent: {
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 20,
    gap: 6,
  },

  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  deviceRowOBD: {
    borderColor: TACTICAL.amber + '25',
    backgroundColor: 'rgba(196,138,44,0.03)',
  },
  deviceRowConnecting: {
    opacity: 0.7,
  },

  deviceIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  deviceInfo: {
    flex: 1,
    gap: 3,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deviceName: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    flexShrink: 1,
  },
  deviceNameOBD: {
    color: TACTICAL.amber,
  },
  obdBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber + '15',
  },
  obdBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 0.8,
  },

  deviceMeta: {
    flexDirection: 'row',
    gap: 10,
  },
  deviceId: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    flexShrink: 1,
  },
  deviceRssi: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },

  deviceSignal: {
    paddingLeft: 4,
  },

  // ── Empty state ────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 30,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    marginTop: 4,
  },
  emptyDesc: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.8,
  },
  rescanFullBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
    marginTop: 12,
  },
  rescanFullBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.bg,
    letterSpacing: 1.5,
  },

  // ── Tips ───────────────────────────────────────────────
  tipsCard: {
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    gap: 8,
  },
  tipsTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tipText: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
});




