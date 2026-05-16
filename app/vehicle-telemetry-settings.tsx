/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY SETTINGS — Phase 2E
 * ═══════════════════════════════════════════════════════════
 *
 * Settings screen for managing vehicle telemetry integrations.
 *
 * Phase 2E adds:
 *   - Production-polished provider cards with reconnecting state
 *   - Safe disconnect action that cleans up inactive devices
 *   - Live telemetry preview panel when connected
 *   - Last updated timestamp in device panel
 *   - Connection success confirmation
 *   - Non-intrusive reconnect status messages
 *   - Coming-soon providers locked with clear UX
 *   - Tablet-responsive layout
 *   - Enhanced debug panel with Phase 2E fields
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';

import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL } from '../lib/theme';
import Header from '../components/Header';
import PremiumAccessGate from '../components/premium/PremiumAccessGate';
import TelemetryProviderCard from '../components/vehicle-telemetry/TelemetryProviderCard';
import OBD2ScannerModal from '../components/vehicle-telemetry/OBD2ScannerModal';
import {
  VEHICLE_TELEMETRY_PROVIDERS,
} from '../src/vehicle-telemetry/VehicleTelemetryTypes';
import { useVehicleTelemetry } from '../src/vehicle-telemetry/useVehicleTelemetry';
import { useUnifiedOBD2Scanner } from '../lib/unifiedScanner';
import { vehicleTelemetryService } from '../src/vehicle-telemetry/VehicleTelemetryService';
import { vehicleTelemetryDeviceRegistry } from '../src/vehicle-telemetry/VehicleTelemetryDeviceRegistry';

// ── Freshness label display config ───────────────────────
const FRESHNESS_DISPLAY: Record<string, { label: string; color: string; icon: string }> = {
  live:          { label: 'LIVE',          color: '#4CAF50', icon: 'pulse-outline' },
  reconnecting:  { label: 'RECONNECTING', color: '#FFB300', icon: 'sync-outline' },
  stale:         { label: 'STALE',         color: '#EF5350', icon: 'alert-circle-outline' },
  disconnected:  { label: 'DISCONNECTED',  color: '#78909C', icon: 'cloud-offline-outline' },
  last_known:    { label: 'LAST KNOWN',    color: '#90A4AE', icon: 'time-outline' },
};

// ── Engine status display ────────────────────────────────
const ENGINE_STATUS_DISPLAY: Record<string, { label: string; color: string }> = {
  running: { label: 'RUNNING', color: '#4CAF50' },
  idle:    { label: 'IDLE',    color: TACTICAL.amber },
  off:     { label: 'OFF',     color: TACTICAL.textMuted },
  unknown: { label: '\u2014',  color: TACTICAL.textMuted },
};

export default function VehicleTelemetrySettingsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isTablet = width >= 768;
  const vt = useVehicleTelemetry();
  const scanner = useUnifiedOBD2Scanner();
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [connectionSuccess, setConnectionSuccess] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);

  // ── Provider state helpers ─────────────────────────────

  const getProviderConnectionState = useCallback((providerId: string): string => {
    if (providerId === 'obd2') {
      if (scanner.isConnected) return 'connected';
      if (scanner.isReconnecting || vt.isReconnecting) return 'reconnecting';
      if (scanner.isConnecting) return 'connecting';
      if (scanner.error) return 'error';
    }

    const devices = vehicleTelemetryDeviceRegistry.getByProvider(providerId as any);
    if (devices.length === 0) return 'disconnected';
    const connected = devices.find(d => d.connection_state === 'connected');
    if (connected) return 'connected';
    const connecting = devices.find(d => d.connection_state === 'connecting');
    if (connecting) return 'connecting';
    const errored = devices.find(d => d.connection_state === 'error');
    if (errored) return 'error';
    return 'disconnected';
  }, [scanner.isConnected, scanner.isConnecting, scanner.isReconnecting, vt.isReconnecting, scanner.error]);

  const getProviderDeviceName = useCallback((providerId: string) => {
    if (providerId === 'obd2' && scanner.connectedDeviceName) {
      return scanner.connectedDeviceName;
    }
    const primary = vt.primaryDevice;
    if (primary && primary.provider === providerId) return primary.device_name;
    const devices = vehicleTelemetryDeviceRegistry.getByProvider(providerId as any);
    if (devices.length > 0) return devices[0].device_name;
    return null;
  }, [vt.primaryDevice, scanner.connectedDeviceName]);

  const getProviderDeviceCount = useCallback((providerId: string) => {
    return vehicleTelemetryDeviceRegistry.getByProvider(providerId as any).length;
  }, []);

  // ── Handlers ───────────────────────────────────────────

  const handleProviderPress = useCallback((providerId: string) => {
    if (providerId === 'obd2') {
      setExpandedProvider(expandedProvider === 'obd2' ? null : 'obd2');
    }
  }, [expandedProvider]);

  const handleChangePrimary = useCallback((deviceId: string) => {
    vt.changePrimary(deviceId);
  }, [vt]);

  const handleRemoveDevice = useCallback((deviceId: string) => {
    if (Platform.OS === 'web') {
      vehicleTelemetryService.removeDevice(deviceId);
    } else {
      Alert.alert(
        'Remove Device',
        'Are you sure you want to remove this device?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove',
            style: 'destructive',
            onPress: () => vehicleTelemetryService.removeDevice(deviceId),
          },
        ],
      );
    }
  }, []);

  const handleOpenScanner = useCallback(() => {
    setScannerVisible(true);
  }, []);

  const handleScannerClose = useCallback(() => {
    setScannerVisible(false);
  }, []);

  const handleScannerConnected = useCallback((deviceId: string, deviceName: string) => {
    setConnectionSuccess(deviceName);
    setTimeout(() => setConnectionSuccess(null), 6000);
  }, []);

  // Phase 2E: Safe disconnect that cleans up inactive devices
  const handleSafeDisconnect = useCallback(async () => {
    const doDisconnect = async () => {
      await vt.disconnectProvider();
      setExpandedProvider(null);
    };

    if (Platform.OS === 'web') {
      await doDisconnect();
    } else {
      Alert.alert(
        'Disconnect OBD-II',
        'Disconnect from the OBD-II adapter and remove inactive devices? The Vehicle Systems widget will revert to placeholder mode.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Disconnect',
            style: 'destructive',
            onPress: doDisconnect,
          },
        ],
      );
    }
  }, [vt]);

  const handleReconnect = useCallback(async () => {
    await scanner.attemptReconnect();
  }, [scanner]);

  // ── Derived state ──────────────────────────────────────

  const freshnessInfo = FRESHNESS_DISPLAY[vt.freshnessLabel] || FRESHNESS_DISPLAY.disconnected;
  const obd2Devices = vt.devices.filter(d => d.provider === 'obd2');
  const hasMultipleDevices = obd2Devices.length > 1;
  const engineInfo = ENGINE_STATUS_DISPLAY[vt.engineStatus] || ENGINE_STATUS_DISPLAY.unknown;
  const battV = vt.summary.battery_voltage;
  const battColor = battV != null
    ? (battV >= 12.4 ? '#4CAF50' : battV >= 11.8 ? '#FFB300' : '#EF5350')
    : TACTICAL.textMuted;

  return (
    <View style={styles.container}>
      <Header />

      {/* Back button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => router.back()}
        activeOpacity={0.7}
      >
        <Ionicons name="chevron-back" size={18} color={TACTICAL.amber} />
        <Text style={styles.backText}>Settings</Text>
      </TouchableOpacity>

      <PremiumAccessGate featureLabel="Vehicle telemetry">
      <ScrollView style={styles.scroll} contentContainerStyle={[
        styles.scrollContent,
        isTablet && styles.scrollContentTablet,
      ]}>
        {/* Title */}
        <View style={styles.titleRow}>
          <View style={styles.titleIcon}>
            <Ionicons name="speedometer-outline" size={22} color={TACTICAL.amber} />
          </View>
          <View style={styles.titleInfo}>
            <Text style={styles.title}>Vehicle Telemetry</Text>
            <Text style={styles.subtitle}>
              Connect vehicle data sources for live engine, fuel, and diagnostic telemetry.
            </Text>
          </View>
        </View>

        {/* Connection success banner */}
        {connectionSuccess && (
          <View style={styles.successBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#4CAF50" />
            <View style={{ flex: 1 }}>
              <Text style={styles.successBannerText}>
                Connected to {connectionSuccess}
              </Text>
              <Text style={styles.successBannerSub}>
                Live vehicle telemetry is now active
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setConnectionSuccess(null)}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>
        )}

        {/* Reconnecting banner (non-intrusive) */}
        {vt.isReconnecting && !connectionSuccess && (
          <View style={styles.reconnectBanner}>
            <Ionicons name="sync-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.reconnectText}>
              Restoring OBD-II connection{scanner.reconnectAttempt > 0 ? ` (attempt ${scanner.reconnectAttempt})` : ''}...
            </Text>
          </View>
        )}

        {/* Stale data banner */}
        {vt.freshnessLabel === 'stale' && vt.hasData && !vt.isReconnecting && (
          <View style={styles.staleBanner}>
            <Ionicons name="alert-circle-outline" size={14} color="#EF5350" />
            <Text style={styles.staleBannerText}>
              Vehicle data is stale — last updated {vt.freshnessText}
            </Text>
          </View>
        )}

        {/* Last known data banner */}
        {vt.isShowingLastKnown && !vt.isReconnecting && vt.freshnessLabel === 'last_known' && (
          <View style={styles.lastKnownBanner}>
            <Ionicons name="time-outline" size={14} color="#90A4AE" />
            <Text style={styles.lastKnownBannerText}>
              Showing last known data from {vt.freshnessText}
            </Text>
          </View>
        )}

        {/* ═══ STATUS SUMMARY ═══ */}
        {(vt.hasData || scanner.isConnected || vt.deviceCount > 0) && (
          <View style={styles.statusCard}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: freshnessInfo.color }]} />
              <Ionicons name={freshnessInfo.icon as any} size={11} color={freshnessInfo.color} />
              <Text style={[styles.statusLabel, { color: freshnessInfo.color }]}>
                {freshnessInfo.label}
              </Text>
              {vt.lastUpdatedText && (
                <Text style={styles.statusFreshness}>{vt.lastUpdatedText}</Text>
              )}
            </View>
            {(vt.primaryDevice || scanner.connectedDeviceName) && (
              <Text style={styles.statusDevice}>
                Primary: {scanner.connectedDeviceName || vt.primaryDevice?.device_name}
              </Text>
            )}
          </View>
        )}

        {/* ═══ LIVE TELEMETRY PREVIEW ═══ */}
        {vt.hasData && (vt.freshnessLabel === 'live' || vt.freshnessLabel === 'reconnecting') && (
          <View style={styles.livePreviewCard}>
            <View style={styles.livePreviewHeader}>
              <View style={[styles.livePreviewDot, {
                backgroundColor: vt.freshnessLabel === 'live' ? '#4CAF50' : '#FFB300',
              }]} />
              <Text style={[styles.livePreviewTitle, {
                color: vt.freshnessLabel === 'live' ? '#4CAF50' : '#FFB300',
              }]}>
                {vt.freshnessLabel === 'live' ? 'LIVE TELEMETRY' : 'UPDATING'}
              </Text>
              {vt.lastUpdatedText && (
                <Text style={styles.livePreviewTime}>{vt.lastUpdatedText}</Text>
              )}
            </View>
            <View style={[styles.livePreviewGrid, isTablet && styles.livePreviewGridTablet]}>
              <View style={styles.livePreviewCell}>
                <Text style={styles.livePreviewLabel}>ENGINE</Text>
                <Text style={[styles.livePreviewValue, { color: engineInfo.color }]}>
                  {engineInfo.label}
                </Text>
              </View>
              <View style={styles.livePreviewCell}>
                <Text style={styles.livePreviewLabel}>BATTERY</Text>
                <Text style={[styles.livePreviewValue, { color: battColor }]}>
                  {battV != null ? `${battV.toFixed(1)}V` : '\u2014'}
                </Text>
              </View>
              {vt.summary.fuel_level != null && (
                <View style={styles.livePreviewCell}>
                  <Text style={styles.livePreviewLabel}>FUEL</Text>
                  <Text style={[styles.livePreviewValue, {
                    color: vt.summary.fuel_level <= 15 ? '#EF5350' :
                           vt.summary.fuel_level <= 30 ? '#FFB74D' : '#4CAF50',
                  }]}>
                    {Math.round(vt.summary.fuel_level)}%
                  </Text>
                </View>
              )}
              {vt.summary.vehicle_speed != null && vt.summary.vehicle_speed > 0 && (
                <View style={styles.livePreviewCell}>
                  <Text style={styles.livePreviewLabel}>SPEED</Text>
                  <Text style={styles.livePreviewValue}>
                    {Math.round(vt.summary.vehicle_speed)} mph
                  </Text>
                </View>
              )}
              {vt.summary.coolant_temp != null && (
                <View style={styles.livePreviewCell}>
                  <Text style={styles.livePreviewLabel}>COOLANT</Text>
                  <Text style={[styles.livePreviewValue, {
                    color: vt.summary.coolant_temp <= 220 ? TACTICAL.text :
                           vt.summary.coolant_temp <= 240 ? '#FFB300' : '#EF5350',
                  }]}>
                    {Math.round(vt.summary.coolant_temp)}{'\u00B0'}F
                  </Text>
                </View>
              )}
              {vt.summary.engine_rpm != null && (
                <View style={styles.livePreviewCell}>
                  <Text style={styles.livePreviewLabel}>RPM</Text>
                  <Text style={styles.livePreviewValue}>
                    {Math.round(vt.summary.engine_rpm)}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* ═══ PROVIDER CARDS ═══ */}
        <Text style={styles.sectionTitle}>TELEMETRY PROVIDERS</Text>

        {VEHICLE_TELEMETRY_PROVIDERS.map(provider => {
          const connState = getProviderConnectionState(provider.id);
          const isExpanded = expandedProvider === provider.id;

          return (
            <View key={provider.id} style={styles.providerWrapper}>
              <TelemetryProviderCard
                provider={provider}
                connectionState={connState as any}
                connectedDeviceName={getProviderDeviceName(provider.id)}
                deviceCount={getProviderDeviceCount(provider.id)}
                onPress={() => handleProviderPress(provider.id)}
                isExpanded={isExpanded}
                lastUpdated={provider.id === 'obd2' ? vt.lastUpdatedText : null}
              />

              {/* Expanded OBD-II section */}
              {isExpanded && provider.id === 'obd2' && (
                <View style={styles.expandedSection}>
                  {/* Adapter connected status */}
                  {scanner.isConnected && (
                    <View style={styles.adapterStatusCard}>
                      <View style={styles.adapterStatusRow}>
                        <View style={[styles.adapterStatusDot, { backgroundColor: '#4CAF50' }]} />
                        <Text style={styles.adapterStatusLabel}>ADAPTER CONNECTED</Text>
                      </View>
                      <Text style={styles.adapterStatusDevice}>
                        {scanner.connectedDeviceName}
                      </Text>
                      {vt.lastUpdatedText && (
                        <Text style={styles.adapterLastUpdated}>
                          Last telemetry: {vt.lastUpdatedText}
                        </Text>
                      )}
                      <View style={styles.adapterActions}>
                        <TouchableOpacity
                          style={styles.adapterDisconnectBtn}
                          onPress={handleSafeDisconnect}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="power-outline" size={12} color="#EF5350" />
                          <Text style={styles.adapterDisconnectText}>Disconnect</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                  {/* Reconnecting adapter status */}
                  {(scanner.isReconnecting || vt.isReconnecting) && !scanner.isConnected && (
                    <View style={styles.adapterReconnectingCard}>
                      <View style={styles.adapterStatusRow}>
                        <Ionicons name="sync-outline" size={12} color="#FFB300" />
                        <Text style={[styles.adapterStatusLabel, { color: '#FFB300' }]}>
                          RECONNECTING
                        </Text>
                      </View>
                      <Text style={styles.adapterReconnectingText}>
                        Attempting to restore connection to the OBD-II adapter...
                      </Text>
                    </View>
                  )}

                  {/* Last device (for reconnect) */}
                  {!scanner.isConnected && !scanner.isReconnecting && !vt.isReconnecting && scanner.lastDevice && (
                    <View style={styles.lastDeviceCard}>
                      <View style={styles.lastDeviceRow}>
                        <Ionicons name="time-outline" size={12} color={TACTICAL.textMuted} />
                        <Text style={styles.lastDeviceLabel}>Last connected:</Text>
                        <Text style={styles.lastDeviceName}>{scanner.lastDevice.name}</Text>
                      </View>
                      <TouchableOpacity
                        style={styles.reconnectBtn}
                        onPress={handleReconnect}
                        activeOpacity={0.7}
                        disabled={scanner.isReconnecting}
                      >
                        <Ionicons name="sync-outline" size={12} color={TACTICAL.amber} />
                        <Text style={styles.reconnectBtnText}>RECONNECT</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Device switching control */}
                  {hasMultipleDevices && (
                    <>
                      <Text style={styles.expandedTitle}>CHANGE PRIMARY DEVICE</Text>
                      <Text style={styles.deviceSwitchHint}>
                        Tap a device to set it as the primary telemetry source. Only the primary device drives the Vehicle Systems widget.
                      </Text>
                    </>
                  )}

                  {/* Registered devices */}
                  {obd2Devices.length > 0 && (
                    <>
                      {!hasMultipleDevices && (
                        <Text style={styles.expandedTitle}>REGISTERED DEVICES</Text>
                      )}
                      {obd2Devices.map(device => (
                        <View key={device.device_id} style={[
                          styles.deviceCard,
                          device.is_primary && hasMultipleDevices && styles.deviceCardPrimary,
                        ]}>
                          <View style={styles.deviceHeader}>
                            <Ionicons
                              name="bluetooth-outline"
                              size={14}
                              color={device.is_primary ? TACTICAL.amber : TACTICAL.textMuted}
                            />
                            <Text style={[
                              styles.deviceName,
                              device.is_primary && styles.deviceNamePrimary,
                            ]}>
                              {device.device_name}
                            </Text>
                            {device.is_primary && (
                              <View style={styles.primaryBadge}>
                                <Text style={styles.primaryBadgeText}>PRIMARY</Text>
                              </View>
                            )}
                          </View>

                          <View style={styles.deviceMeta}>
                            <View style={[
                              styles.deviceStateBadge,
                              device.connection_state === 'connected' && styles.deviceStateBadgeConnected,
                              device.connection_state === 'error' && styles.deviceStateBadgeError,
                            ]}>
                              <View style={[
                                styles.deviceStateDot,
                                { backgroundColor:
                                  device.connection_state === 'connected' ? '#4CAF50' :
                                  device.connection_state === 'connecting' ? '#FFB300' :
                                  device.connection_state === 'error' ? '#EF5350' :
                                  TACTICAL.textMuted
                                },
                              ]} />
                              <Text style={[
                                styles.deviceStateText,
                                { color:
                                  device.connection_state === 'connected' ? '#4CAF50' :
                                  device.connection_state === 'connecting' ? '#FFB300' :
                                  device.connection_state === 'error' ? '#EF5350' :
                                  TACTICAL.textMuted
                                },
                              ]}>
                                {device.connection_state.toUpperCase()}
                              </Text>
                            </View>
                            {device.last_seen && (
                              <Text style={styles.deviceMetaText}>
                                Last seen: {new Date(device.last_seen).toLocaleTimeString()}
                              </Text>
                            )}
                          </View>

                          {device.protocol && (
                            <Text style={styles.deviceProtocol}>
                              Protocol: {device.protocol}
                            </Text>
                          )}

                          <View style={styles.deviceActions}>
                            {!device.is_primary && hasMultipleDevices && (
                              <TouchableOpacity
                                style={styles.deviceActionBtn}
                                onPress={() => handleChangePrimary(device.device_id)}
                                activeOpacity={0.7}
                              >
                                <Ionicons name="star-outline" size={12} color={TACTICAL.amber} />
                                <Text style={styles.deviceActionText}>Set Primary</Text>
                              </TouchableOpacity>
                            )}
                            <TouchableOpacity
                              style={[styles.deviceActionBtn, styles.deviceActionBtnDanger]}
                              onPress={() => handleRemoveDevice(device.device_id)}
                              activeOpacity={0.7}
                            >
                              <Ionicons name="trash-outline" size={12} color="#EF5350" />
                              <Text style={[styles.deviceActionText, { color: '#EF5350' }]}>Remove</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </>
                  )}

                  {/* No devices state */}
                  {obd2Devices.length === 0 && !scanner.isConnected && (
                    <View style={styles.noDevicesCard}>
                      <Ionicons name="bluetooth-outline" size={24} color={TACTICAL.textMuted} />
                      <Text style={styles.noDevicesTitle}>No OBD-II Devices</Text>
                      <Text style={styles.noDevicesDesc}>
                        Connect a Bluetooth OBD-II adapter to start receiving live vehicle telemetry.
                      </Text>
                    </View>
                  )}

                  {/* Scan button */}
                  <TouchableOpacity
                    style={styles.connectBtn}
                    activeOpacity={0.7}
                    onPress={handleOpenScanner}
                  >
                    <Ionicons name="search-outline" size={14} color={TACTICAL.bg} />
                    <Text style={styles.connectBtnText}>
                      {scanner.isConnected ? 'SCAN FOR ANOTHER ADAPTER' : 'SCAN FOR OBD-II ADAPTER'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Architecture info */}
        <View style={styles.infoCard}>
          <Ionicons name="information-circle-outline" size={16} color={TACTICAL.textMuted} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Vehicle Telemetry Architecture</Text>
            <Text style={styles.infoDesc}>
              Vehicle Telemetry operates independently from BLU power telemetry.
              BLU handles portable power stations while Vehicle Telemetry handles
              data from the vehicle itself — engine metrics, fuel levels, battery
              voltage, and diagnostics.
            </Text>
          </View>
        </View>

        {/* Supported adapters */}
        <View style={styles.infoCard}>
          <Ionicons name="hardware-chip-outline" size={16} color={TACTICAL.textMuted} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Supported OBD-II Adapters</Text>
            <Text style={styles.infoDesc}>
              ECS supports Bluetooth ELM327-based OBD-II adapters including
              Veepeak, BAFX, OBDLink, Carista, ScanTool, Vgate, and most
              generic ELM327 adapters. Plug the adapter into your vehicle's
              OBD-II port (usually under the dashboard) and scan to connect.
            </Text>
          </View>
        </View>

        {/* Debug toggle */}
        <TouchableOpacity
          style={styles.debugToggle}
          onPress={() => setShowDebug(!showDebug)}
          activeOpacity={0.7}
        >
          <Ionicons name="bug-outline" size={12} color={TACTICAL.textMuted} />
          <Text style={styles.debugToggleText}>
            {showDebug ? 'HIDE' : 'SHOW'} SERVICE STATE
          </Text>
          <Ionicons
            name={showDebug ? 'chevron-up' : 'chevron-down'}
            size={12}
            color={TACTICAL.textMuted}
          />
        </TouchableOpacity>

        {/* Debug panel */}
        {showDebug && (
          <View style={styles.debugSection}>
            <Text style={styles.debugTitle}>SERVICE STATE</Text>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Active Provider</Text>
              <Text style={styles.debugValue}>{vt.activeProvider || 'None'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Registered Devices</Text>
              <Text style={styles.debugValue}>{vt.deviceCount}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Primary Device</Text>
              <Text style={styles.debugValue}>{vt.primaryDevice?.device_name || 'None'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>OBD-II Adapter</Text>
              <Text style={styles.debugValue}>{scanner.state}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Auto-Reconnect</Text>
              <Text style={styles.debugValue}>{scanner.autoReconnectEnabled ? 'Enabled' : 'Disabled'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Has Data</Text>
              <Text style={styles.debugValue}>{vt.hasData ? 'Yes' : 'No'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Polling</Text>
              <Text style={styles.debugValue}>{vt.isPolling ? 'Active' : 'Inactive'}</Text>
            </View>
            <View style={styles.debugDivider} />
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Freshness Label</Text>
              <Text style={[styles.debugValue, { color: freshnessInfo.color }]}>
                {vt.freshnessLabel}
              </Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Connection Display</Text>
              <Text style={styles.debugValue}>{vt.connectionDisplayState}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Grace State</Text>
              <Text style={styles.debugValue}>{vt.graceState}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Is Reconnecting</Text>
              <Text style={styles.debugValue}>{vt.isReconnecting ? 'Yes' : 'No'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Showing Last Known</Text>
              <Text style={styles.debugValue}>{vt.isShowingLastKnown ? 'Yes' : 'No'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Session Recovery</Text>
              <Text style={styles.debugValue}>{vt.recoveryStatus}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>OBD2 Was Connected</Text>
              <Text style={styles.debugValue}>{vt.obd2WasConnected ? 'Yes' : 'No'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Last Updated</Text>
              <Text style={styles.debugValue}>{vt.lastUpdatedText || 'N/A'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Engine Status</Text>
              <Text style={[styles.debugValue, { color: engineInfo.color }]}>{vt.engineStatus}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Battery Voltage</Text>
              <Text style={styles.debugValue}>{battV != null ? `${battV.toFixed(1)}V` : 'N/A'}</Text>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Version</Text>
              <Text style={styles.debugValue}>Phase 2E</Text>
            </View>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
      </PremiumAccessGate>

      {/* OBD-II Scanner Modal */}
      <OBD2ScannerModal
        visible={scannerVisible}
        onClose={handleScannerClose}
        onConnected={handleScannerConnected}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  backText: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.amber,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    gap: 12,
  },
  scrollContentTablet: {
    maxWidth: 640,
    alignSelf: 'center',
    width: '100%',
  },

  titleRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 8,
  },
  titleIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber + '12',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleInfo: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    marginTop: 2,
    lineHeight: 15,
  },

  // ── Banners ────────────────────────────────────────────
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.20)',
  },
  successBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4CAF50',
  },
  successBannerSub: {
    fontSize: 10,
    fontWeight: '500',
    color: '#4CAF50',
    opacity: 0.8,
    marginTop: 1,
  },

  reconnectBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber + '08',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '20',
  },
  reconnectText: {
    fontSize: 11,
    fontWeight: '600',
    color: TACTICAL.amber,
    flex: 1,
  },

  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(239,83,80,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.15)',
  },
  staleBannerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF5350',
    flex: 1,
  },

  lastKnownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(144,164,174,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(144,164,174,0.15)',
  },
  lastKnownBannerText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#90A4AE',
    flex: 1,
  },

  statusCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    gap: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  statusFreshness: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginLeft: 'auto',
  },
  statusDevice: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.amber,
    fontFamily: 'Courier',
  },

  // ── Live telemetry preview ─────────────────────────────
  livePreviewCard: {
    backgroundColor: 'rgba(76,175,80,0.04)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.15)',
    padding: 12,
    gap: 10,
  },
  livePreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  livePreviewDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  livePreviewTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  livePreviewTime: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginLeft: 'auto',
  },
  livePreviewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  livePreviewGridTablet: {
    gap: 12,
  },
  livePreviewCell: {
    minWidth: 70,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 6,
    padding: 8,
    gap: 2,
  },
  livePreviewLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  livePreviewValue: {
    fontSize: 14,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },

  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
    marginTop: 12,
    marginBottom: 4,
  },

  providerWrapper: {
    gap: 0,
  },

  expandedSection: {
    backgroundColor: 'rgba(196,138,44,0.03)',
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: TACTICAL.amber + '20',
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    padding: 12,
    gap: 10,
    marginTop: -2,
  },
  expandedTitle: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  deviceSwitchHint: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 14,
    opacity: 0.8,
    marginTop: -4,
  },

  // ── Adapter status ─────────────────────────────────────
  adapterStatusCard: {
    backgroundColor: 'rgba(76,175,80,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.15)',
    padding: 10,
    gap: 6,
  },
  adapterStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  adapterStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  adapterStatusLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#4CAF50',
    letterSpacing: 1.5,
  },
  adapterStatusDevice: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  adapterLastUpdated: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  adapterActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  adapterDisconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.20)',
  },
  adapterDisconnectText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#EF5350',
  },

  // ── Reconnecting adapter ───────────────────────────────
  adapterReconnectingCard: {
    backgroundColor: 'rgba(255,179,0,0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.15)',
    padding: 10,
    gap: 6,
  },
  adapterReconnectingText: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 14,
  },

  // ── Last device / reconnect ────────────────────────────
  lastDeviceCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 10,
    gap: 8,
  },
  lastDeviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  lastDeviceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  lastDeviceName: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  reconnectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 6,
    backgroundColor: TACTICAL.amber + '12',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
  },
  reconnectBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // ── Device cards ───────────────────────────────────────
  deviceCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 10,
    gap: 6,
  },
  deviceCardPrimary: {
    borderColor: TACTICAL.amber + '30',
    backgroundColor: 'rgba(196,138,44,0.04)',
  },
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deviceName: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    flex: 1,
  },
  deviceNamePrimary: {
    color: TACTICAL.amber,
  },
  primaryBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 3,
    backgroundColor: TACTICAL.amber + '15',
  },
  primaryBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  deviceMeta: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  deviceMetaText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  deviceStateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  deviceStateBadgeConnected: {
    backgroundColor: 'rgba(76,175,80,0.08)',
  },
  deviceStateBadgeError: {
    backgroundColor: 'rgba(239,83,80,0.08)',
  },
  deviceStateDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  deviceStateText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  deviceProtocol: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  deviceActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  deviceActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: TACTICAL.amber + '10',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '20',
  },
  deviceActionBtnDanger: {
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderColor: 'rgba(239,83,80,0.20)',
  },
  deviceActionText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },

  noDevicesCard: {
    alignItems: 'center',
    paddingVertical: 20,
    gap: 6,
  },
  noDevicesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  noDevicesDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 14,
    paddingHorizontal: 20,
  },

  connectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
  },
  connectBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.bg,
    letterSpacing: 1.5,
  },

  infoCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    marginTop: 8,
  },
  infoContent: {
    flex: 1,
    gap: 4,
  },
  infoTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  infoDesc: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 14,
    opacity: 0.8,
  },

  // ── Debug toggle ───────────────────────────────────────
  debugToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 12,
    opacity: 0.5,
  },
  debugToggleText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },

  debugSection: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    gap: 4,
  },
  debugTitle: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
    marginBottom: 4,
  },
  debugRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  debugLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  debugValue: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  debugDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginVertical: 4,
  },
});




