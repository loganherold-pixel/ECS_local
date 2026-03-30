/**
 * BLU Power Sources — ECS Settings / Integrations Panel
 *
 * Phase 1B: Full EcoFlow connection flow.
 * Phase 1D: Persistence, multi-device handling, error recovery.
 * Phase 2A: Bluetti BLE integration — scan, connect, multi-device.
 * Phase 3A: Anker SOLIX BLE integration — scan, connect, multi-device.
 * Phase 4A: Jackery BLE integration — scan, connect, multi-device.
 * Phase 5A: Goal Zero BLE integration — scan, connect, multi-device.
 * Phase 6A: Renogy BLE integration — scan, connect, multi-device.
 * Phase 7A: Architecture hardening — unified provider rendering.
 *
 * Secrets are never rendered in the UI.
 * Raw API errors are never exposed to the user.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';

import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';
import {
  getAllProviders,
  getActiveProviderCount,
  bluDeviceRegistry,
} from '../../src/power/blu';
import { useBluConnection } from '../../src/power/blu/useBluConnection';
import { useBlu } from '../../src/power/blu/useBlu';
import { ECS_PROVIDER_BRANDING } from '../../src/power/providers/EcsProviderRegistry';
import type { BluProviderMeta, BluDevice, BluSystemStatus, BluProviderId } from '../../src/power/blu';
import type { BluettiDiscoveredDevice } from '../../src/power/blu/adapters/BluettiBluAdapter';
import type { AnkerSolixDiscoveredDevice } from '../../src/power/blu/adapters/AnkerSolixBluAdapter';
import type { JackeryDiscoveredDevice } from '../../src/power/blu/adapters/JackeryBluAdapter';
import type { GoalZeroDiscoveredDevice } from '../../src/power/blu/adapters/GoalZeroBluAdapter';
import type { RenogyDiscoveredDevice } from '../../src/power/blu/adapters/RenogyBluAdapter';

// ── Provider Branding Helper ────────────────────────────────────────────

function getProviderBranding(providerId: BluProviderId) {
  return ECS_PROVIDER_BRANDING[providerId] ?? {
    displayName: providerId,
    accentColor: '#8E8E93',
    iconName: 'hardware-chip',
    transportLabel: 'Unknown',
  };
}

// ── System Status Badge ─────────────────────────────────────────────────

function SystemStatusBadge({ status, palette }: { status: BluSystemStatus; palette: any }) {
  const config: Record<string, { color: string; label: string; icon: string }> = {
    live: { color: '#34C759', label: 'LIVE', icon: 'radio' },
    reconnecting: { color: '#FFB800', label: 'RECONNECTING', icon: 'sync' },
    updating: { color: '#5AC8FA', label: 'UPDATING', icon: 'refresh' },
    stale: { color: '#FF9500', label: 'STALE', icon: 'time-outline' },
    disconnected: { color: '#8E8E93', label: 'DISCONNECTED', icon: 'radio-button-off' },
  };
  const c = config[status] || config.disconnected;
  return (
    <View style={[styles.systemBadge, { backgroundColor: c.color + '12', borderColor: c.color + '30' }]}>
      {status === 'reconnecting' && <ActivityIndicator size={10} color={c.color} style={{ marginRight: 4 }} />}
      <Ionicons name={c.icon} size={10} color={c.color} />
      <Text style={[styles.systemBadgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

// ── Connection State Badge ──────────────────────────────────────────────

function ConnectionStateBadge({ state, palette }: { state: string; palette: any }) {
  const config: Record<string, { color: string; label: string; icon: string }> = {
    disconnected: { color: '#8E8E93', label: 'DISCONNECTED', icon: 'radio-button-off' },
    connecting: { color: '#FFB800', label: 'CONNECTING', icon: 'sync' },
    connected: { color: '#34C759', label: 'CONNECTED', icon: 'checkmark-circle' },
    error: { color: '#FF3B30', label: 'ERROR', icon: 'alert-circle' },
    unsupported: { color: '#8E8E93', label: 'UNSUPPORTED', icon: 'close-circle' },
  };
  const c = config[state] || config.disconnected;
  return (
    <View style={[styles.connBadge, { backgroundColor: c.color + '12', borderColor: c.color + '30' }]}>
      <Ionicons name={c.icon} size={12} color={c.color} />
      <Text style={[styles.connBadgeText, { color: c.color }]}>{c.label}</Text>
    </View>
  );
}

// ── Device Card (Unified — renders any provider) ────────────────────────

function DeviceCard({
  device, isPrimary, onSetPrimary, palette,
}: {
  device: BluDevice; isPrimary: boolean; onSetPrimary: () => void; palette: any;
}) {
  const stateColor = device.connection_state === 'connected' ? '#34C759'
    : device.connection_state === 'connecting' ? '#FFB800'
    : device.connection_state === 'error' ? '#FF3B30' : '#8E8E93';
  const branding = getProviderBranding(device.provider);

  return (
    <TouchableOpacity
      style={[styles.deviceCard, {
        backgroundColor: isPrimary ? palette.amber + '08' : palette.panel,
        borderColor: isPrimary ? palette.amber + '40' : palette.border,
        borderWidth: isPrimary ? 1.5 : 1,
      }]}
      onPress={onSetPrimary}
      activeOpacity={0.7}
    >
      <View style={styles.deviceCardRow}>
        <View style={[styles.deviceRadio, {
          borderColor: isPrimary ? palette.amber : palette.textMuted + '50',
          backgroundColor: isPrimary ? palette.amber : 'transparent',
        }]}>
          {isPrimary && <View style={styles.deviceRadioInner} />}
        </View>
        <View style={[styles.deviceIconWrap, {
          backgroundColor: isPrimary ? palette.amber + '15' : branding.accentColor + '15',
        }]}>
          <Ionicons
            name={branding.iconName}
            size={20}
            color={isPrimary ? palette.amber : branding.accentColor}
          />
        </View>
        <View style={styles.deviceInfo}>
          <Text style={[styles.deviceName, { color: palette.text }]} numberOfLines={1}>
            {device.display_name || device.device_id}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[styles.providerPill, { backgroundColor: branding.accentColor + '15' }]}>
              <Text style={[styles.providerPillText, { color: branding.accentColor }]}>
                {branding.displayName.toUpperCase()}
              </Text>
            </View>
            <Text style={[styles.deviceModel, { color: palette.textMuted }]} numberOfLines={1}>
              {device.model}
            </Text>
          </View>
        </View>
        <View style={styles.deviceStatusCol}>
          <View style={styles.deviceStatusRow}>
            <View style={[styles.deviceStateDot, { backgroundColor: stateColor }]} />
            <Text style={[styles.deviceStateText, { color: stateColor }]}>
              {device.connection_state.toUpperCase()}
            </Text>
          </View>
          {isPrimary && (
            <View style={[styles.primaryPill, { backgroundColor: palette.amber + '15' }]}>
              <Text style={[styles.primaryPillText, { color: palette.amber }]}>PRIMARY</Text>
            </View>
          )}
        </View>
      </View>
      <View style={[styles.deviceIdRow, { borderTopColor: GOLD_RAIL.subsection }]}>
        <Ionicons name="finger-print-outline" size={10} color={palette.textMuted} />
        <Text style={[styles.deviceIdText, { color: palette.textMuted }]} numberOfLines={1}>
          {device.device_id}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

// ── Generic BLE Scan Card ───────────────────────────────────────────────

function BleScanCard({
  name, modelDisplay, rssi, accentColor, iconName, onConnect, palette, isConnecting,
}: {
  name: string; modelDisplay: string; rssi: number; accentColor: string; iconName: string;
  onConnect: () => void; palette: any; isConnecting: boolean;
}) {
  return (
    <View style={[styles.scanCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
      <View style={styles.scanCardRow}>
        <View style={[styles.scanCardIcon, { backgroundColor: accentColor + '15' }]}>
          <Ionicons name={iconName} size={20} color={accentColor} />
        </View>
        <View style={styles.scanCardInfo}>
          <Text style={[styles.scanCardName, { color: palette.text }]}>{name}</Text>
          <Text style={[styles.scanCardModel, { color: palette.textMuted }]}>{modelDisplay}</Text>
        </View>
        <View style={styles.scanCardRight}>
          <View style={[styles.rssiBadge, { backgroundColor: palette.border + '40' }]}>
            <Ionicons name="wifi-outline" size={10} color={palette.textMuted} />
            <Text style={[styles.rssiText, { color: palette.textMuted }]}>{rssi}dBm</Text>
          </View>
          <TouchableOpacity
            style={[styles.scanConnectBtn, { backgroundColor: accentColor }]}
            onPress={onConnect}
            activeOpacity={0.7}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator size={12} color="#FFF" />
            ) : (
              <Text style={styles.scanConnectBtnText}>CONNECT</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// ── Generic BLE Provider Section ────────────────────────────────────────

function BleProviderSection({
  providerId, palette, connectionState, isScanning, discoveredDevices,
  connectedDevices, error, pollCount, isPolling, isConnectingLocal,
  onScan, onConnect, onConnectAll, onDisconnect,
}: {
  providerId: BluProviderId; palette: any; connectionState: string;
  isScanning: boolean; discoveredDevices: any[]; connectedDevices: BluDevice[];
  error: string | null; pollCount: number; isPolling: boolean; isConnectingLocal: boolean;
  onScan: () => Promise<void>; onConnect: (id?: string) => Promise<void>;
  onConnectAll: () => Promise<void>; onDisconnect: () => Promise<void>;
}) {
  const branding = getProviderBranding(providerId);
  const isConnected = connectionState === 'connected';
  const hasError = connectionState === 'error';

  return (
    <>
      <Text style={[styles.sectionLabel, { color: branding.accentColor, borderBottomColor: branding.accentColor + '40' }]}>
        {branding.displayName.toUpperCase()} PROVIDER
      </Text>
      <View style={[styles.ecoflowCard, { backgroundColor: palette.panel, borderColor: isConnected ? branding.accentColor + '40' : hasError ? '#FF3B3030' : palette.border }]}>
        <View style={styles.providerRow}>
          <View style={[styles.providerIconWrap, { backgroundColor: branding.accentColor + '15' }]}>
            <Ionicons name={branding.iconName} size={22} color={branding.accentColor} />
          </View>
          <View style={styles.providerInfo}>
            <Text style={[styles.providerName, { color: palette.text }]}>{branding.displayName}</Text>
            <Text style={[styles.providerNote, { color: branding.accentColor }]}>{branding.transportLabel}</Text>
          </View>
          <ConnectionStateBadge state={connectionState} palette={palette} />
        </View>
        <View style={[styles.actionSection, { borderTopColor: GOLD_RAIL.subsection }]}>
          {!isConnected && !hasError && (
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                style={[styles.connectBtn, { backgroundColor: branding.accentColor }]}
                onPress={onScan}
                activeOpacity={0.7}
                disabled={isScanning}
              >
                {isScanning ? <ActivityIndicator size={16} color="#FFF" /> : <Ionicons name="bluetooth-outline" size={18} color="#FFF" />}
                <Text style={styles.connectBtnText}>
                  {isScanning ? 'SCANNING...' : `SCAN FOR ${branding.displayName.toUpperCase()}`}
                </Text>
              </TouchableOpacity>
              {discoveredDevices.length > 0 && (
                <View style={{ gap: 8 }}>
                  <Text style={[styles.scanResultLabel, { color: palette.textMuted }]}>
                    {discoveredDevices.length} device(s) found
                  </Text>
                  {discoveredDevices.map((d: any) => (
                    <BleScanCard
                      key={d.id}
                      name={d.name}
                      modelDisplay={`${d.modelSpec?.displayName || d.model || 'Unknown Model'}${d.modelSpec ? ` — ${d.modelSpec.capacityWh}Wh` : ''}`}
                      rssi={d.rssi}
                      accentColor={branding.accentColor}
                      iconName={branding.iconName + '-outline'}
                      onConnect={() => onConnect(d.id)}
                      palette={palette}
                      isConnecting={isConnectingLocal}
                    />
                  ))}
                  {discoveredDevices.length > 1 && (
                    <TouchableOpacity
                      style={[styles.connectAllBtn, { borderColor: branding.accentColor + '40' }]}
                      onPress={onConnectAll}
                      activeOpacity={0.7}
                      disabled={isConnectingLocal}
                    >
                      <Ionicons name="git-merge-outline" size={14} color={branding.accentColor} />
                      <Text style={[styles.connectAllBtnText, { color: branding.accentColor }]}>CONNECT ALL DEVICES</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}
          {hasError && (
            <View style={styles.errorSection}>
              <View style={[styles.errorCard, { backgroundColor: '#FF3B3008', borderColor: '#FF3B3025' }]}>
                <Ionicons name="alert-circle-outline" size={20} color="#FF3B30" />
                <Text style={[styles.errorText, { color: palette.textMuted }]}>{error || 'Connection failed.'}</Text>
              </View>
              <TouchableOpacity style={[styles.retryBtn, { borderColor: '#FF3B3040' }]} onPress={onScan} activeOpacity={0.7}>
                <Ionicons name="refresh-outline" size={14} color="#FF3B30" />
                <Text style={[styles.retryBtnText, { color: '#FF3B30' }]}>RETRY SCAN</Text>
              </TouchableOpacity>
            </View>
          )}
          {isConnected && (
            <View style={styles.connectedSection}>
              <View style={styles.successRow}>
                <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                <Text style={[styles.successText, { color: '#34C759' }]}>
                  {branding.displayName} connected — {connectedDevices.length} device(s)
                </Text>
              </View>
              <View style={styles.deviceSummaryRow}>
                <View style={styles.deviceSummaryItem}>
                  <Text style={[styles.deviceSummaryValue, { color: palette.text }]}>{connectedDevices.length}</Text>
                  <Text style={[styles.deviceSummaryLabel, { color: palette.textMuted }]}>DEVICES</Text>
                </View>
                <View style={[styles.deviceSummaryDivider, { backgroundColor: palette.border }]} />
                <View style={styles.deviceSummaryItem}>
                  <Text style={[styles.deviceSummaryValue, { color: isPolling ? '#34C759' : palette.textMuted }]}>{pollCount}</Text>
                  <Text style={[styles.deviceSummaryLabel, { color: palette.textMuted }]}>POLLS</Text>
                </View>
              </View>
              <TouchableOpacity style={[styles.disconnectBtn, { borderColor: palette.border, backgroundColor: palette.border + '20' }]} onPress={onDisconnect} activeOpacity={0.7}>
                <Ionicons name="close-circle-outline" size={14} color={palette.textMuted} />
                <Text style={[styles.disconnectBtnText, { color: palette.textMuted }]}>DISCONNECT</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </>
  );
}

// ── Planned Provider Card ───────────────────────────────────────────────

function PlannedProviderCard({ provider, palette }: { provider: BluProviderMeta; palette: any }) {
  return (
    <View style={[styles.providerCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
      <View style={styles.providerRow}>
        <View style={[styles.providerIconWrap, { backgroundColor: palette.border + '40' }]}>
          <Ionicons name={provider.icon} size={22} color={palette.textMuted} />
        </View>
        <View style={styles.providerInfo}>
          <Text style={[styles.providerName, { color: palette.textMuted }]}>{provider.displayName}</Text>
          <Text style={[styles.providerNote, { color: palette.textMuted }]}>{provider.statusNote}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: '#8E8E93' + '15', borderColor: '#8E8E93' + '40' }]}>
          <View style={[styles.statusDot, { backgroundColor: '#8E8E93' }]} />
          <Text style={[styles.statusLabel, { color: '#8E8E93' }]}>PLANNED</Text>
        </View>
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────────

export default function BluPowerSourcesScreen() {
  const router = useRouter();
  const { palette, colors } = useTheme();
  const providers = getAllProviders();
  const activeCount = getActiveProviderCount();

  const blu = useBluConnection();
  const bluData = useBlu();
  const summary = bluData.summary;
  const [allDevices, setAllDevices] = useState<BluDevice[]>(() => bluDeviceRegistry.getAll());
  const [bluettiConnecting, setBluettiConnecting] = useState(false);
  const [ankerSolixConnecting, setAnkerSolixConnecting] = useState(false);
  const [jackeryConnecting, setJackeryConnecting] = useState(false);
  const [goalZeroConnecting, setGoalZeroConnecting] = useState(false);
  const [renogyConnecting, setRenogyConnecting] = useState(false);

  useEffect(() => {
    const unsub = bluDeviceRegistry.subscribe(() => setAllDevices(bluDeviceRegistry.getAll()));
    return unsub;
  }, []);

  const ecoFlowDevices = allDevices.filter((d) => d.provider === 'ecoflow');
  const bluettiDevices = allDevices.filter((d) => d.provider === 'bluetti');
  const ankerSolixDevices = allDevices.filter((d) => d.provider === 'anker_solix');
  const jackeryDevices = allDevices.filter((d) => d.provider === 'jackery');
  const goalZeroDevices = allDevices.filter((d) => d.provider === 'goal_zero');
  const renogyDevices = allDevices.filter((d) => d.provider === 'renogy');
  const isConnected = blu.connectionState === 'connected';
  const isConnecting = blu.isConnecting || blu.connectionState === 'connecting';
  const hasError = blu.connectionState === 'error';
  const hasDevices = allDevices.length > 0;

  const handleConnect = useCallback(async () => { await blu.connect(); }, [blu]);
  const handleDisconnect = useCallback(async () => { await blu.disconnect(); }, [blu]);
  const handleRefresh = useCallback(async () => { await blu.refreshDevices(); }, [blu]);
  const handleSetPrimary = useCallback(async (deviceId: string) => { await blu.setPrimary(deviceId); }, [blu]);

  // Bluetti handlers
  const handleBluettiScan = useCallback(async () => { await blu.bluettiScan(); }, [blu]);
  const handleBluettiConnect = useCallback(async (deviceId?: string) => { setBluettiConnecting(true); await blu.bluettiConnect(deviceId); setBluettiConnecting(false); }, [blu]);
  const handleBluettiConnectAll = useCallback(async () => { setBluettiConnecting(true); await blu.bluettiConnectAll(); setBluettiConnecting(false); }, [blu]);
  const handleBluettiDisconnect = useCallback(async () => { await blu.bluettiDisconnect(); }, [blu]);

  // Anker SOLIX handlers
  const handleAnkerSolixScan = useCallback(async () => { await blu.ankerSolixScan(); }, [blu]);
  const handleAnkerSolixConnect = useCallback(async (deviceId?: string) => { setAnkerSolixConnecting(true); await blu.ankerSolixConnect(deviceId); setAnkerSolixConnecting(false); }, [blu]);
  const handleAnkerSolixConnectAll = useCallback(async () => { setAnkerSolixConnecting(true); await blu.ankerSolixConnectAll(); setAnkerSolixConnecting(false); }, [blu]);
  const handleAnkerSolixDisconnect = useCallback(async () => { await blu.ankerSolixDisconnect(); }, [blu]);

  // Jackery handlers
  const handleJackeryScan = useCallback(async () => { await blu.jackeryScan(); }, [blu]);
  const handleJackeryConnect = useCallback(async (deviceId?: string) => { setJackeryConnecting(true); await blu.jackeryConnect(deviceId); setJackeryConnecting(false); }, [blu]);
  const handleJackeryConnectAll = useCallback(async () => { setJackeryConnecting(true); await blu.jackeryConnectAll(); setJackeryConnecting(false); }, [blu]);
  const handleJackeryDisconnect = useCallback(async () => { await blu.jackeryDisconnect(); }, [blu]);

  // Goal Zero handlers
  const handleGoalZeroScan = useCallback(async () => { await blu.goalZeroScan(); }, [blu]);
  const handleGoalZeroConnect = useCallback(async (deviceId?: string) => { setGoalZeroConnecting(true); await blu.goalZeroConnect(deviceId); setGoalZeroConnecting(false); }, [blu]);
  const handleGoalZeroConnectAll = useCallback(async () => { setGoalZeroConnecting(true); await blu.goalZeroConnectAll(); setGoalZeroConnecting(false); }, [blu]);
  const handleGoalZeroDisconnect = useCallback(async () => { await blu.goalZeroDisconnect(); }, [blu]);

  // Renogy handlers
  const handleRenogyScan = useCallback(async () => { await blu.renogyScan(); }, [blu]);
  const handleRenogyConnect = useCallback(async (deviceId?: string) => { setRenogyConnecting(true); await blu.renogyConnect(deviceId); setRenogyConnecting(false); }, [blu]);
  const handleRenogyConnectAll = useCallback(async () => { setRenogyConnecting(true); await blu.renogyConnectAll(); setRenogyConnecting(false); }, [blu]);
  const handleRenogyDisconnect = useCallback(async () => { await blu.renogyDisconnect(); }, [blu]);

  // Active provider brand chips for the banner
  const activeProviderChips: { id: BluProviderId; color: string; icon: string; label: string }[] = [
    { id: 'ecoflow', color: '#00A6FF', icon: 'flash', label: 'EcoFlow' },
    { id: 'bluetti', color: '#2196F3', icon: 'cube', label: 'Bluetti' },
    { id: 'anker_solix', color: '#00C4B4', icon: 'battery-charging', label: 'Anker SOLIX' },
    { id: 'jackery', color: '#FF8C00', icon: 'sunny', label: 'Jackery' },
    { id: 'goal_zero', color: '#4CAF50', icon: 'compass', label: 'Goal Zero' },
    { id: 'renogy', color: '#FF5722', icon: 'hardware-chip', label: 'Renogy' },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: palette.panel }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={palette.amber} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: palette.textMuted }]}>ECS INTEGRATIONS</Text>
          <Text style={[styles.headerTitle, { color: palette.text }]}>BLU POWER SOURCES</Text>
        </View>
        <View style={{ width: 36 }} />
        <View style={[styles.goldRail, { backgroundColor: GOLD_RAIL.major }]} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* BLU System Overview */}
        <View style={[styles.overviewCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <View style={styles.overviewRow}>
            <View style={[styles.bluIconWrap, { backgroundColor: palette.amber + '12' }]}>
              <Ionicons name="flash" size={24} color={palette.amber} />
            </View>
            <View style={styles.overviewInfo}>
              <Text style={[styles.overviewTitle, { color: palette.text }]}>Battery Link Utility</Text>
              <Text style={[styles.overviewSubtitle, { color: palette.textMuted }]}>Universal power telemetry layer</Text>
            </View>
            <SystemStatusBadge status={bluData.systemStatus} palette={palette} />
          </View>
          <View style={[styles.overviewStats, { borderTopColor: GOLD_RAIL.subsection }]}>
            {[
              { value: String(providers.length), label: 'PROVIDERS', color: palette.amber },
              { value: String(activeCount), label: 'ACTIVE', color: '#34C759' },
              { value: String(allDevices.length), label: 'DEVICES', color: palette.text },
              { value: bluData.isAvailable ? 'ON' : 'OFF', label: 'TELEMETRY', color: bluData.isAvailable ? '#34C759' : palette.textMuted },
            ].map((stat, i) => (
              <React.Fragment key={stat.label}>
                {i > 0 && <View style={[styles.overviewStatDivider, { backgroundColor: palette.border }]} />}
                <View style={styles.overviewStat}>
                  <Text style={[styles.overviewStatValue, { color: stat.color }]}>{stat.value}</Text>
                  <Text style={[styles.overviewStatLabel, { color: palette.textMuted }]}>{stat.label}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>

          {/* Live summary */}
          {bluData.isAvailable && (
            <View style={[styles.liveSummary, { borderTopColor: GOLD_RAIL.subsection }]}>
              <View style={styles.liveSummaryRow}>
                <View style={[styles.liveDot, { backgroundColor: bluData.isStale ? '#FF9500' : bluData.isLive ? '#34C759' : '#8E8E93' }]} />
                <Text style={[styles.liveSummaryText, { color: bluData.isStale ? '#FF9500' : bluData.isLive ? '#34C759' : '#8E8E93' }]}>
                  {bluData.isStale ? 'STALE' : bluData.isLive ? 'LIVE' : 'OFFLINE'}
                </Text>
                <Text style={[styles.freshnessText, { color: palette.textMuted }]}>{bluData.freshnessText}</Text>
                <Text style={[styles.liveSummaryDevice, { color: palette.text }]} numberOfLines={1}>
                  {summary.active_device_name || summary.active_device_model || 'Unknown'}
                </Text>
              </View>
              <View style={styles.liveSummaryMetrics}>
                {summary.battery_percent != null && (
                  <View style={styles.liveSummaryMetric}>
                    <Text style={[styles.liveSummaryMetricLabel, { color: palette.textMuted }]}>SOC</Text>
                    <Text style={[styles.liveSummaryMetricValue, { color: summary.battery_percent >= 60 ? '#34C759' : summary.battery_percent >= 25 ? '#FFB800' : '#FF3B30' }]}>
                      {summary.battery_percent}%
                    </Text>
                  </View>
                )}
                {summary.solar_input != null && (
                  <View style={styles.liveSummaryMetric}>
                    <Text style={[styles.liveSummaryMetricLabel, { color: palette.textMuted }]}>SOLAR</Text>
                    <Text style={[styles.liveSummaryMetricValue, { color: summary.solar_input > 0 ? '#FFD700' : palette.textMuted }]}>
                      {summary.solar_input}W
                    </Text>
                  </View>
                )}
                {summary.live_output != null && (
                  <View style={styles.liveSummaryMetric}>
                    <Text style={[styles.liveSummaryMetricLabel, { color: palette.textMuted }]}>OUTPUT</Text>
                    <Text style={[styles.liveSummaryMetricValue, { color: palette.text }]}>{summary.live_output}W</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {/* ── Supported Power Systems Banner ──────────────────── */}
        <View style={[styles.supportedBanner, { backgroundColor: palette.panel, borderColor: palette.amber + '30' }]}>
          <Ionicons name="shield-checkmark-outline" size={18} color={palette.amber} />
          <View style={styles.supportedBannerInfo}>
            <Text style={[styles.supportedBannerTitle, { color: palette.text }]}>Supported Power Systems</Text>
            <View style={[styles.supportedBrandsRow, { flexWrap: 'wrap' }]}>
              {activeProviderChips.map((chip) => (
                <View key={chip.id} style={[styles.brandChip, { backgroundColor: chip.color + '15' }]}>
                  <Ionicons name={chip.icon} size={12} color={chip.color} />
                  <Text style={[styles.brandChipText, { color: chip.color }]}>{chip.label}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── EcoFlow Provider (Cloud API — unique section) ──── */}
        <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: GOLD_RAIL.section }]}>
          ECOFLOW PROVIDER
        </Text>
        <View style={[styles.ecoflowCard, { backgroundColor: palette.panel, borderColor: isConnected ? '#00A6FF40' : hasError ? '#FF3B3030' : palette.border }]}>
          <View style={styles.providerRow}>
            <View style={[styles.providerIconWrap, { backgroundColor: '#00A6FF15' }]}>
              <Ionicons name="flash" size={22} color="#00A6FF" />
            </View>
            <View style={styles.providerInfo}>
              <Text style={[styles.providerName, { color: palette.text }]}>EcoFlow</Text>
              <Text style={[styles.providerNote, { color: '#00A6FF' }]}>Cloud API integration</Text>
            </View>
            <ConnectionStateBadge state={blu.connectionState} palette={palette} />
          </View>
          <View style={[styles.actionSection, { borderTopColor: GOLD_RAIL.subsection }]}>
            {!isConnected && !isConnecting && !hasError && (
              <TouchableOpacity style={[styles.connectBtn, { backgroundColor: '#00A6FF' }]} onPress={handleConnect} activeOpacity={0.7}>
                <Ionicons name="link-outline" size={18} color="#FFF" />
                <Text style={styles.connectBtnText}>CONNECT TO ECOFLOW</Text>
              </TouchableOpacity>
            )}
            {isConnecting && (
              <View style={styles.connectingRow}>
                <ActivityIndicator size="small" color="#00A6FF" />
                <Text style={[styles.connectingText, { color: '#00A6FF' }]}>Connecting to EcoFlow...</Text>
              </View>
            )}
            {hasError && !isConnecting && (
              <View style={styles.errorSection}>
                <View style={[styles.errorCard, { backgroundColor: '#FF3B3008', borderColor: '#FF3B3025' }]}>
                  <Ionicons name="alert-circle-outline" size={20} color="#FF3B30" />
                  <Text style={[styles.errorText, { color: palette.textMuted }]}>{blu.error || 'Connection failed.'}</Text>
                </View>
                <TouchableOpacity style={[styles.retryBtn, { borderColor: '#FF3B3040' }]} onPress={handleConnect} activeOpacity={0.7}>
                  <Ionicons name="refresh-outline" size={14} color="#FF3B30" />
                  <Text style={[styles.retryBtnText, { color: '#FF3B30' }]}>RETRY</Text>
                </TouchableOpacity>
              </View>
            )}
            {isConnected && !isConnecting && (
              <View style={styles.connectedSection}>
                <View style={styles.successRow}>
                  <Ionicons name="checkmark-circle" size={18} color="#34C759" />
                  <Text style={[styles.successText, { color: '#34C759' }]}>EcoFlow connected — {ecoFlowDevices.length} device(s)</Text>
                </View>
                <TouchableOpacity style={[styles.disconnectBtn, { borderColor: palette.border, backgroundColor: palette.border + '20' }]} onPress={handleDisconnect} activeOpacity={0.7}>
                  <Ionicons name="close-circle-outline" size={14} color={palette.textMuted} />
                  <Text style={[styles.disconnectBtnText, { color: palette.textMuted }]}>DISCONNECT</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* ── Bluetti Provider (BLE) ──────────────────────────── */}
        <BleProviderSection
          providerId="bluetti" palette={palette}
          connectionState={blu.bluettiConnectionState} isScanning={blu.bluettiIsScanning}
          discoveredDevices={blu.bluettiDiscoveredDevices} connectedDevices={bluettiDevices}
          error={blu.bluettiError} pollCount={blu.bluettiPollCount} isPolling={blu.bluettiIsPolling}
          isConnectingLocal={bluettiConnecting}
          onScan={handleBluettiScan} onConnect={handleBluettiConnect}
          onConnectAll={handleBluettiConnectAll} onDisconnect={handleBluettiDisconnect}
        />

        {/* ── Anker SOLIX Provider (BLE) ──────────────────────── */}
        <BleProviderSection
          providerId="anker_solix" palette={palette}
          connectionState={blu.ankerSolixConnectionState} isScanning={blu.ankerSolixIsScanning}
          discoveredDevices={blu.ankerSolixDiscoveredDevices} connectedDevices={ankerSolixDevices}
          error={blu.ankerSolixError} pollCount={blu.ankerSolixPollCount} isPolling={blu.ankerSolixIsPolling}
          isConnectingLocal={ankerSolixConnecting}
          onScan={handleAnkerSolixScan} onConnect={handleAnkerSolixConnect}
          onConnectAll={handleAnkerSolixConnectAll} onDisconnect={handleAnkerSolixDisconnect}
        />

        {/* ── Jackery Provider (BLE) ──────────────────────────── */}
        <BleProviderSection
          providerId="jackery" palette={palette}
          connectionState={blu.jackeryConnectionState} isScanning={blu.jackeryIsScanning}
          discoveredDevices={blu.jackeryDiscoveredDevices} connectedDevices={jackeryDevices}
          error={blu.jackeryError} pollCount={blu.jackeryPollCount} isPolling={blu.jackeryIsPolling}
          isConnectingLocal={jackeryConnecting}
          onScan={handleJackeryScan} onConnect={handleJackeryConnect}
          onConnectAll={handleJackeryConnectAll} onDisconnect={handleJackeryDisconnect}
        />

        {/* ── Goal Zero Provider (BLE) ────────────────────────── */}
        <BleProviderSection
          providerId="goal_zero" palette={palette}
          connectionState={blu.goalZeroConnectionState} isScanning={blu.goalZeroIsScanning}
          discoveredDevices={blu.goalZeroDiscoveredDevices} connectedDevices={goalZeroDevices}
          error={blu.goalZeroError} pollCount={blu.goalZeroPollCount} isPolling={blu.goalZeroIsPolling}
          isConnectingLocal={goalZeroConnecting}
          onScan={handleGoalZeroScan} onConnect={handleGoalZeroConnect}
          onConnectAll={handleGoalZeroConnectAll} onDisconnect={handleGoalZeroDisconnect}
        />

        {/* ── Renogy Provider (BLE / Modbus) ──────────────────── */}
        <BleProviderSection
          providerId="renogy" palette={palette}
          connectionState={blu.renogyConnectionState} isScanning={blu.renogyIsScanning}
          discoveredDevices={blu.renogyDiscoveredDevices} connectedDevices={renogyDevices}
          error={blu.renogyError} pollCount={blu.renogyPollCount} isPolling={blu.renogyIsPolling}
          isConnectingLocal={renogyConnecting}
          onScan={handleRenogyScan} onConnect={handleRenogyConnect}
          onConnectAll={handleRenogyConnectAll} onDisconnect={handleRenogyDisconnect}
        />

        {/* ── All Registered Devices ─────────────────────────────── */}
        {hasDevices && (
          <>
            <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: GOLD_RAIL.section }]}>
              ALL REGISTERED DEVICES
            </Text>
            <Text style={[styles.sectionHint, { color: palette.textMuted }]}>
              Tap a device to set it as the primary BLU power source. Telemetry will reroute to the selected device.
            </Text>
            {allDevices.map((device) => (
              <DeviceCard
                key={`${device.provider}:${device.device_id}`}
                device={device}
                isPrimary={device.is_primary}
                onSetPrimary={() => handleSetPrimary(device.device_id)}
                palette={palette}
              />
            ))}
          </>
        )}

        {/* ── Planned Providers ──────────────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: palette.textMuted, borderBottomColor: palette.border }]}>
          PLANNED PROVIDERS
        </Text>
        {providers.filter((p) => p.status === 'planned').map((provider) => (
          <PlannedProviderCard key={provider.id} provider={provider} palette={palette} />
        ))}

        {/* ── BLU Info ───────────────────────────────────────────── */}
        <View style={[styles.infoCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <Ionicons name="information-circle-outline" size={16} color={palette.textMuted} />
          <View style={styles.infoContent}>
            <Text style={[styles.infoTitle, { color: palette.textMuted }]}>About BLU</Text>
            <Text style={[styles.infoText, { color: palette.textMuted }]}>
              BLU (Battery Link Utility) is the universal power telemetry abstraction layer for ECS. It normalises data from multiple power ecosystems into a single schema, enabling dashboard widgets and system panels to display power data regardless of the connected provider.
            </Text>
            <Text style={[styles.infoVersion, { color: palette.textMuted }]}>
              BLU v7.0 — Phase 7A Hexa-Provider + Universal Contract
            </Text>
            <Text style={[styles.infoText, { color: palette.textMuted, marginTop: 6 }]}>
              Active: EcoFlow + Bluetti + Anker SOLIX + Jackery + Goal Zero + Renogy
            </Text>
            <Text style={[styles.infoText, { color: palette.textMuted, marginTop: 4 }]}>
              Architecture: IEcsPowerProvider contract + EcsProviderRegistry + unified diagnostics
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: Platform.OS === 'web' ? 16 : 54, paddingBottom: 14, paddingHorizontal: SPACING.lg },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerLabel: { fontSize: 9, fontWeight: '600', letterSpacing: 3, textTransform: 'uppercase' },
  headerTitle: { fontSize: 16, fontWeight: '800', letterSpacing: 3, marginTop: 2 },
  goldRail: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 1.5 },
  scroll: { flex: 1 },
  scrollContent: { padding: SPACING.lg, paddingBottom: 100 },

  systemBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  systemBadgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 2 },

  overviewCard: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.lg, marginBottom: SPACING.xl },
  overviewRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bluIconWrap: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  overviewInfo: { flex: 1 },
  overviewTitle: { fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  overviewSubtitle: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  overviewStats: { flexDirection: 'row', marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: GOLD_RAIL.subsectionWidth },
  overviewStat: { flex: 1, alignItems: 'center' },
  overviewStatValue: { fontSize: 22, fontWeight: '900', fontFamily: 'Courier' },
  overviewStatLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 2, marginTop: 2 },
  overviewStatDivider: { width: 1, height: 28, alignSelf: 'center' },

  supportedBanner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.xl },
  supportedBannerInfo: { flex: 1, gap: 6 },
  supportedBannerTitle: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },
  supportedBrandsRow: { flexDirection: 'row', gap: 8 },
  brandChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  brandChipText: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },

  liveSummary: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: GOLD_RAIL.subsectionWidth },
  liveSummaryRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3 },
  liveSummaryText: { fontSize: 9, fontWeight: '800', letterSpacing: 2 },
  freshnessText: { fontSize: 9, fontWeight: '500', letterSpacing: 0.5 },
  liveSummaryDevice: { fontSize: 12, fontWeight: '700', flex: 1 },
  liveSummaryMetrics: { flexDirection: 'row', gap: 12 },
  liveSummaryMetric: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.03)' },
  liveSummaryMetricLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 1.5 },
  liveSummaryMetricValue: { fontSize: 16, fontWeight: '900', fontFamily: 'Courier', marginTop: 2 },

  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 4, marginBottom: SPACING.md, borderBottomWidth: GOLD_RAIL.sectionWidth, paddingBottom: 8, textTransform: 'uppercase' },
  sectionHint: { fontSize: 12, fontWeight: '500', lineHeight: 18, marginBottom: SPACING.lg, letterSpacing: 0.3 },

  connBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  connBadgeText: { fontSize: 8, fontWeight: '800', letterSpacing: 2 },

  ecoflowCard: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.xl },
  providerCard: { borderRadius: RADIUS.lg, borderWidth: 1, padding: SPACING.md, marginBottom: SPACING.md },
  providerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerIconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  providerInfo: { flex: 1 },
  providerName: { fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  providerNote: { fontSize: 11, fontWeight: '600', marginTop: 2 },

  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 2 },

  actionSection: { marginTop: SPACING.md, paddingTop: SPACING.md, borderTopWidth: GOLD_RAIL.subsectionWidth },
  connectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 10 },
  connectBtnText: { color: '#FFF', fontSize: 13, fontWeight: '800', letterSpacing: 3 },
  connectingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14 },
  connectingText: { fontSize: 13, fontWeight: '700', letterSpacing: 1 },

  errorSection: { gap: 10 },
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1 },
  errorText: { flex: 1, fontSize: 12, lineHeight: 18 },
  retryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  retryBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  connectedSection: { gap: 12 },
  successRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  successText: { fontSize: 13, fontWeight: '700', letterSpacing: 0.5 },

  deviceSummaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: 8 },
  deviceSummaryItem: { alignItems: 'center', gap: 2 },
  deviceSummaryValue: { fontSize: 18, fontWeight: '900', fontFamily: 'Courier' },
  deviceSummaryLabel: { fontSize: 8, fontWeight: '700', letterSpacing: 3 },
  deviceSummaryDivider: { width: 1, height: 24, opacity: 0.3 },

  disconnectBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 6, borderWidth: 1 },
  disconnectBtnText: { fontSize: 10, fontWeight: '700', letterSpacing: 2 },

  deviceCard: { borderRadius: RADIUS.lg, padding: SPACING.md, marginBottom: SPACING.md },
  deviceCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  deviceRadio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  deviceRadioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#000' },
  deviceIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  deviceInfo: { flex: 1, gap: 3 },
  deviceName: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  deviceModel: { fontSize: 11, fontWeight: '500' },
  providerPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  providerPillText: { fontSize: 7, fontWeight: '800', letterSpacing: 1.5 },
  deviceStatusCol: { alignItems: 'flex-end', gap: 4 },
  deviceStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  deviceStateDot: { width: 6, height: 6, borderRadius: 3 },
  deviceStateText: { fontSize: 9, fontWeight: '700', letterSpacing: 1 },
  primaryPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  primaryPillText: { fontSize: 7, fontWeight: '800', letterSpacing: 1.5 },
  deviceIdRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingTop: 8, borderTopWidth: GOLD_RAIL.subsectionWidth },
  deviceIdText: { fontSize: 10, fontFamily: 'Courier', letterSpacing: 0.5, flex: 1 },

  scanCard: { borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING.md },
  scanCardRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scanCardIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  scanCardInfo: { flex: 1, gap: 2 },
  scanCardName: { fontSize: 14, fontWeight: '700', letterSpacing: 0.5 },
  scanCardModel: { fontSize: 11, fontWeight: '500' },
  scanCardRight: { alignItems: 'flex-end', gap: 6 },
  rssiBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  rssiText: { fontSize: 9, fontWeight: '600', fontFamily: 'Courier' },
  scanConnectBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, minWidth: 80, alignItems: 'center' },
  scanConnectBtnText: { color: '#FFF', fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  scanResultLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  connectAllBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 8, borderWidth: 1 },
  connectAllBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 2 },

  infoCard: { flexDirection: 'row', borderRadius: RADIUS.md, borderWidth: 1, padding: SPACING.md, gap: 10, marginTop: SPACING.lg },
  infoContent: { flex: 1 },
  infoTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  infoText: { fontSize: 11, lineHeight: 16 },
  infoVersion: { fontSize: 9, fontWeight: '700', letterSpacing: 1, marginTop: 8, fontFamily: 'Courier' },
});




