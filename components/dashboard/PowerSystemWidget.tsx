import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { getActiveVehicleContext } from '../../lib/activeVehicleContext';
import {
  getDashboardSourceLabel,
  getDashboardSourceTone,
  resolveDashboardValue,
} from '../../lib/dashboardWidgetSources';
import { bluPowerAuthority } from '../../lib/BluPowerAuthority';
import { bluDeviceRegistry } from '../../lib/BluDeviceRegistry';
import { bluStateStore } from '../../lib/BluStateStore';
import type { BluDevice, BluTelemetry } from '../../lib/BluTypes';
import {
  BLU_PROVIDER_TO_POWER_PROVIDER,
  resolvePowerReadiness,
  type PowerReadinessState,
} from '../../lib/powerReadiness';
import {
  WidgetCardShell,
  WidgetCompactRow,
  WidgetMetaLine,
  WidgetMicroStrip,
  WidgetPrimaryValue,
  WidgetSecondaryRow,
} from './WidgetChrome';
import { resolvePowerWidgetPresentation } from '../../lib/resource/resourceCommandResolvers';
import type { ECSAIState } from '../../lib/ai/aiOrchestrator';
import type { ECSOrchestratorTargetView } from '../../lib/ai/orchestratorSelectors';

export interface PowerDeviceReading {
  deviceId: string;
  deviceName: string;
  model: string;
  provider: string;
  providerDisplayName: string;
  providerAccentColor: string;
  providerIcon: string;
  batteryPercent: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarInputWatts: number | null;
  temperatureCelsius: number | null;
  estimatedRuntimeMinutes: number | null;
  chargingState: 'idle' | 'charging' | 'discharging' | 'full' | 'unknown';
  connectionState: 'connected' | 'disconnected' | 'reconnecting' | 'scanning';
  warningState: 'normal' | 'low_battery' | 'high_temp' | 'overload' | 'comm_loss' | 'error';
  isPrimary: boolean;
  isStale: boolean;
  readinessState: PowerReadinessState;
  readinessLabel: string;
  lastUpdated: number;
  capacityWh: number | null;
  batteryVolts: number | null;
  batteryAmps: number | null;
  signalStrength: number | null;
  role: string | null;
}

type PowerWidgetContextData = {
  aiState?: ECSAIState | null;
  aiDashboardView?: ECSOrchestratorTargetView | null;
};

type AuthoritySnapshot = ReturnType<typeof bluPowerAuthority.getSnapshot>;

const PROVIDER_BRANDING: Record<string, { displayName: string; accentColor: string; iconName: string }> = {
  ecoflow: { displayName: 'EcoFlow', accentColor: '#00A6FF', iconName: 'flash' },
  bluetti: { displayName: 'Bluetti', accentColor: '#2196F3', iconName: 'battery-charging' },
  anker_solix: { displayName: 'Anker SOLIX', accentColor: '#00C4B4', iconName: 'battery-charging' },
  jackery: { displayName: 'Jackery', accentColor: '#FF8C00', iconName: 'sunny' },
  goal_zero: { displayName: 'Goal Zero', accentColor: '#4CAF50', iconName: 'leaf' },
  renogy: { displayName: 'Renogy', accentColor: '#9C27B0', iconName: 'hardware-chip' },
  redarc: { displayName: 'REDARC', accentColor: '#C62828', iconName: 'car' },
  dakota_lithium: { displayName: 'Dakota Lithium', accentColor: '#6FBF4B', iconName: 'shield' },
  unknown: { displayName: 'Power', accentColor: TACTICAL.amber, iconName: 'flash' },
};

export const CHARGING_STATE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  charging: { label: 'CHARGING', color: '#4CAF50', icon: 'flash' },
  discharging: { label: 'DISCHARGING', color: '#FF9800', icon: 'arrow-down' },
  idle: { label: 'IDLE', color: TACTICAL.textMuted, icon: 'pause' },
  full: { label: 'FULL', color: '#4CAF50', icon: 'checkmark-circle' },
  unknown: { label: 'STANDBY', color: TACTICAL.textMuted, icon: 'ellipsis-horizontal' },
};

export const CONNECTION_STATE_CONFIG: Record<string, { label: string; color: string }> = {
  connected: { label: 'CONNECTED', color: '#4CAF50' },
  disconnected: { label: 'UNAVAILABLE', color: '#8B949E' },
  reconnecting: { label: 'PARTIAL', color: '#FFB300' },
  scanning: { label: 'PARTIAL', color: '#2196F3' },
};

export const WARNING_STATE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  normal: { label: 'NORMAL', color: '#4CAF50', icon: 'shield-checkmark' },
  low_battery: { label: 'LOW BATTERY', color: '#EF5350', icon: 'battery-dead' },
  high_temp: { label: 'HIGH TEMP', color: '#EF5350', icon: 'thermometer' },
  overload: { label: 'OVERLOAD', color: '#EF5350', icon: 'warning' },
  comm_loss: { label: 'COMM LOSS', color: '#FFB300', icon: 'cloud-offline' },
  error: { label: 'ERROR', color: '#EF5350', icon: 'alert-circle' },
};

function telemetryKey(provider: string, deviceId: string): string {
  return `${provider}:${deviceId}`;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function deriveChargingState(
  inputW: number | null,
  outputW: number | null,
  battPct: number | null,
): PowerDeviceReading['chargingState'] {
  if (battPct != null && battPct >= 100) return 'full';
  if ((inputW ?? 0) > 5 && (inputW ?? 0) > (outputW ?? 0)) return 'charging';
  if ((outputW ?? 0) > 5) return 'discharging';
  if (inputW != null || outputW != null) return 'idle';
  return 'unknown';
}

function deriveWarningState(
  battPct: number | null,
  tempC: number | null,
  freshness: string,
): PowerDeviceReading['warningState'] {
  if (freshness === 'stale' || freshness === 'last_known' || freshness === 'disconnected') return 'comm_loss';
  if (tempC != null && tempC > 55) return 'high_temp';
  if (battPct != null && battPct <= 10) return 'low_battery';
  return 'normal';
}

export function getBatteryColor(pct: number | null): string {
  if (pct == null) return TACTICAL.textMuted;
  if (pct >= 60) return '#4CAF50';
  if (pct >= 25) return '#FFB300';
  return '#EF5350';
}

export function formatRuntime(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return '\u2014';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

export function formatLastUpdatedTime(timestamp: number | null): string {
  if (timestamp == null || timestamp <= 0) return '\u2014';
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '\u2014';
  }
}

function formatFlowValue(watts: number, direction: 'input' | 'output') {
  if (watts <= 0) return '\u2014';
  return direction === 'input' ? `+${Math.round(watts)}W` : `-${Math.round(watts)}W`;
}

function useAuthoritySnapshot(): AuthoritySnapshot {
  const [snapshot, setSnapshot] = useState<AuthoritySnapshot>(() => bluPowerAuthority.getSnapshot());

  useEffect(() => {
    const off = bluPowerAuthority.subscribe((next) => setSnapshot(next));
    return off;
  }, []);

  return snapshot;
}

function getProviderFreshness(snapshot: AuthoritySnapshot, provider: string): string {
  return snapshot.providers[provider as keyof typeof snapshot.providers]?.freshness ?? 'disconnected';
}

function buildDeviceReading(
  snapshot: AuthoritySnapshot,
  device: BluDevice,
  telemetry: BluTelemetry | null,
): PowerDeviceReading {
  const providerKey = String(device.provider || telemetry?.provider || 'unknown').toLowerCase();
  const branding = PROVIDER_BRANDING[providerKey] ?? PROVIDER_BRANDING.unknown;
  const freshness = String(getProviderFreshness(snapshot, providerKey));
  const connectionState: PowerDeviceReading['connectionState'] =
    freshness === 'reconnecting' ? 'reconnecting' :
    freshness === 'disconnected' ? 'disconnected' :
    device.connection_state === 'connecting' ? 'scanning' :
    device.connection_state === 'error' ? 'disconnected' :
    'connected';

  const battPct = asNumber(telemetry?.battery_percent);
  const inputW = asNumber(telemetry?.input_watts);
  const outputW = asNumber(telemetry?.output_watts);
  const solarW = asNumber(telemetry?.solar_input_watts);
  const tempC = asNumber(telemetry?.temperature_celsius);
  const runtimeMin = asNumber(telemetry?.estimated_runtime_minutes);
  const isStale =
    freshness === 'stale' ||
    freshness === 'last_known' ||
    freshness === 'disconnected' ||
    !telemetry;
  const powerProviderId = BLU_PROVIDER_TO_POWER_PROVIDER[providerKey] ?? null;
  const readiness = resolvePowerReadiness({
    providerId: powerProviderId,
    connectionState,
    hasTelemetry: !!telemetry,
    hasStoredSnapshot: !!telemetry,
  });

  return {
    deviceId: String(device.device_id),
    deviceName: String(device.display_name ?? device.model ?? 'Power System'),
    model: String(device.model ?? branding.displayName),
    provider: providerKey,
    providerDisplayName: branding.displayName,
    providerAccentColor: branding.accentColor,
    providerIcon: branding.iconName,
    batteryPercent: battPct,
    inputWatts: inputW,
    outputWatts: outputW,
    solarInputWatts: solarW,
    temperatureCelsius: tempC,
    estimatedRuntimeMinutes: runtimeMin,
    chargingState: deriveChargingState(inputW, outputW, battPct),
    connectionState,
    warningState: deriveWarningState(battPct, tempC, freshness),
    isPrimary: device.is_primary,
    isStale,
    readinessState: readiness.state,
    readinessLabel: readiness.label,
    lastUpdated: asNumber(telemetry?.timestamp) ?? 0,
    capacityWh: asNumber(telemetry?.capacity_wh),
    batteryVolts: asNumber(telemetry?.battery_volts),
    batteryAmps: asNumber(telemetry?.battery_amps),
    signalStrength: asNumber(telemetry?.signal_strength),
    role: device.is_primary ? 'Primary House Battery' : 'Supporting Power Source',
  };
}

export function useUnifiedPowerDevices(): {
  devices: PowerDeviceReading[];
  primaryDevice: PowerDeviceReading | null;
  secondaryDevices: PowerDeviceReading[];
  totalConnected: number;
  totalInputWatts: number;
  totalOutputWatts: number;
  totalSolarWatts: number;
  aggregatedBatteryPercent: number | null;
  isAnyConnected: boolean;
  isAnyReconnecting: boolean;
} {
  const snapshot = useAuthoritySnapshot();

  return useMemo(() => {
    const telemetryMap = new Map(
      bluStateStore
        .getAllTelemetry()
        .map((telemetry) => [telemetryKey(telemetry.provider, telemetry.device_id), telemetry] as const),
    );

    const registeredDevices = bluDeviceRegistry.getAll();
    const sortedDevices = [...registeredDevices].sort((a, b) => {
      if (a.is_primary && !b.is_primary) return -1;
      if (!a.is_primary && b.is_primary) return 1;
      if (a.connection_state !== b.connection_state) {
        return a.connection_state === 'connected' ? -1 : 1;
      }
      return a.display_name.localeCompare(b.display_name);
    });

    let devices = sortedDevices.map((device) =>
      buildDeviceReading(
        snapshot,
        device,
        telemetryMap.get(telemetryKey(device.provider, device.device_id)) ?? null,
      ),
    );

    if (devices.length === 0 && snapshot.primaryDevice) {
      devices = [
        buildDeviceReading(
          snapshot,
          snapshot.primaryDevice,
          snapshot.primaryTelemetry,
        ),
      ];
    }

    const primaryDevice = devices.find((device) => device.isPrimary) ?? devices[0] ?? null;
    const secondaryDevices = primaryDevice
      ? devices.filter((device) => device.deviceId !== primaryDevice.deviceId)
      : [];
    const totalConnected = devices.filter((device) => device.connectionState === 'connected').length;
    const totalInputWatts = devices.reduce((sum, device) => sum + (device.inputWatts ?? 0), 0);
    const totalOutputWatts = devices.reduce((sum, device) => sum + (device.outputWatts ?? 0), 0);
    const totalSolarWatts = devices.reduce((sum, device) => sum + (device.solarInputWatts ?? 0), 0);
    const batteryDevices = devices.filter((device) => device.batteryPercent != null);
    const weightedBattery = batteryDevices.reduce(
      (sum, device) => sum + (device.batteryPercent ?? 0) * (device.capacityWh ?? 1000),
      0,
    );
    const totalWeight = batteryDevices.reduce((sum, device) => sum + (device.capacityWh ?? 1000), 0);
    const aggregatedBatteryPercent = totalWeight > 0 ? Math.round(weightedBattery / totalWeight) : null;
    const isAnyConnected = snapshot.isConnected || totalConnected > 0;
    const isAnyReconnecting = snapshot.isReconnecting || snapshot.freshness === 'reconnecting';

    return {
      devices,
      primaryDevice,
      secondaryDevices,
      totalConnected,
      totalInputWatts,
      totalOutputWatts,
      totalSolarWatts,
      aggregatedBatteryPercent,
      isAnyConnected,
      isAnyReconnecting,
    };
  }, [snapshot]);
}

function PowerFlowGraphic({
  inputWatts,
  outputWatts,
  compact = false,
}: {
  inputWatts: number;
  outputWatts: number;
  compact?: boolean;
}) {
  const activeInput = inputWatts > 0;
  const activeOutput = outputWatts > 0;
  const hasFlow = activeInput || activeOutput;

  return (
    <View style={[ws.flowGraphic, compact && ws.flowGraphicCompact]}>
      <View style={[ws.flowNode, compact && ws.flowNodeCompact, activeInput && ws.flowNodeInActive]}>
        <Ionicons name="arrow-down-outline" size={compact ? 10 : 12} color={activeInput ? '#4CAF50' : TACTICAL.textMuted} />
      </View>
      <View style={ws.flowTrackWrap}>
        <View style={ws.flowTrackBase} />
        <View
          style={[
            ws.flowTrackSegment,
            ws.flowTrackLeft,
            activeInput && ws.flowTrackLeftActive,
            compact && ws.flowTrackSegmentCompact,
          ]}
        />
        <View
          style={[
            ws.flowTrackSegment,
            ws.flowTrackRight,
            activeOutput && ws.flowTrackRightActive,
            compact && ws.flowTrackSegmentCompact,
          ]}
        />
        <View style={[ws.flowCore, hasFlow && ws.flowCoreActive, compact && ws.flowCoreCompact]}>
          <Ionicons name="flash-outline" size={compact ? 11 : 13} color={hasFlow ? TACTICAL.amber : TACTICAL.textMuted} />
        </View>
      </View>
      <View style={[ws.flowNode, compact && ws.flowNodeCompact, activeOutput && ws.flowNodeOutActive]}>
        <Ionicons name="arrow-up-outline" size={compact ? 10 : 12} color={activeOutput ? '#EF5350' : TACTICAL.textMuted} />
      </View>
    </View>
  );
}

export function PowerSystemCompact({ data }: { data?: PowerWidgetContextData }) {
  const power = useUnifiedPowerDevices();
  const { primaryDevice, devices, totalConnected, totalInputWatts, totalOutputWatts } = power;
  const activeVehicleContext = getActiveVehicleContext();
  const configuredBatteryWh = activeVehicleContext.resourceProfile.batteryUsableWh ?? null;
  const hasConfiguredPowerProfile = configuredBatteryWh != null && configuredBatteryWh > 0;
  const connectedPrimaryDevice =
    devices.find((device) => device.connectionState === 'connected' && !device.isStale) ?? null;
  const hasLivePower = Boolean(connectedPrimaryDevice);
  const hasStalePower = devices.some((device) => device.isStale || device.connectionState !== 'connected');
  const powerSource = resolveDashboardValue([
    { source: 'bluetooth', value: hasLivePower ? 'Connected' : null, detail: 'Verified live power' },
    {
      source: 'manual',
      value: hasConfiguredPowerProfile ? 'Manual' : null,
      detail: hasStalePower ? 'Manual profile fallback' : 'Manual profile',
    },
  ]);
  const fallbackSummary =
    hasLivePower && connectedPrimaryDevice?.batteryPercent != null
      ? `${Math.round(connectedPrimaryDevice.batteryPercent)}% reserve | ${formatFlowValue(totalInputWatts, 'input')} / ${formatFlowValue(totalOutputWatts, 'output')}`
      : hasConfiguredPowerProfile
        ? `${Math.round(configuredBatteryWh).toLocaleString()} Wh manual profile`
        : hasStalePower
          ? 'Partial power state from last known telemetry'
          : 'No connected power source';
  const presentation = resolvePowerWidgetPresentation({
    batteryPercent: connectedPrimaryDevice?.batteryPercent ?? primaryDevice?.batteryPercent ?? null,
    runtimeMinutes: connectedPrimaryDevice?.estimatedRuntimeMinutes ?? primaryDevice?.estimatedRuntimeMinutes ?? null,
    inputWatts: totalInputWatts,
    outputWatts: totalOutputWatts,
    solarWatts: power.totalSolarWatts,
    connectedDeviceCount: totalConnected,
    providerTelemetry: data?.aiState?.richContext?.resources?.providerTelemetry ?? null,
    aiState: data?.aiState ?? null,
    dashboardView: data?.aiDashboardView ?? null,
  });

  return (
    <WidgetCompactRow
      title="Power"
      summary={presentation.compact.summary || fallbackSummary}
      tone={presentation.compact.tone}
      status={presentation.compact.status || (powerSource?.value ?? 'None')}
      statusTone={presentation.compact.statusTone}
    />
  );
}

export function PowerSystemCard({ data }: { data?: PowerWidgetContextData }) {
  const power = useUnifiedPowerDevices();
  const { primaryDevice, devices, totalConnected, totalInputWatts, totalOutputWatts, totalSolarWatts } = power;
  const activeVehicleContext = getActiveVehicleContext();
  const configuredBatteryWh = activeVehicleContext.resourceProfile.batteryUsableWh ?? null;
  const hasConfiguredPowerProfile = configuredBatteryWh != null && configuredBatteryWh > 0;
  const connectedPrimaryDevice =
    devices.find((device) => device.connectionState === 'connected' && !device.isStale) ?? null;
  const hasLivePower = Boolean(connectedPrimaryDevice);
  const hasStalePower = devices.some((device) => device.isStale || device.connectionState !== 'connected');
  const powerSource = resolveDashboardValue([
    { source: 'bluetooth', value: hasLivePower ? 'Connected' : null, detail: 'Verified live power' },
    {
      source: 'manual',
      value: hasConfiguredPowerProfile ? 'Manual' : null,
      detail: hasStalePower ? 'Manual profile fallback' : 'Manual profile',
    },
  ]);

  const presentation = resolvePowerWidgetPresentation({
    batteryPercent: connectedPrimaryDevice?.batteryPercent ?? primaryDevice?.batteryPercent ?? null,
    runtimeMinutes: connectedPrimaryDevice?.estimatedRuntimeMinutes ?? primaryDevice?.estimatedRuntimeMinutes ?? null,
    inputWatts: totalInputWatts,
    outputWatts: totalOutputWatts,
    solarWatts: totalSolarWatts,
    connectedDeviceCount: totalConnected,
    providerTelemetry: data?.aiState?.richContext?.resources?.providerTelemetry ?? null,
    aiState: data?.aiState ?? null,
    dashboardView: data?.aiDashboardView ?? null,
  });

  if (!hasLivePower) {
    return (
      <WidgetCardShell
        badge={presentation.badge}
        footer={
          <WidgetMetaLine
            text={
              hasConfiguredPowerProfile
                ? `${getDashboardSourceLabel('manual')} | ${Math.round(configuredBatteryWh).toLocaleString()} Wh configured`
                : hasStalePower
                  ? 'Showing partial last-known power state only'
                  : 'No connected expedition power source'
            }
            tone={hasStalePower ? 'stale' : 'neutral'}
          />
        }
      >
        <WidgetPrimaryValue
          label={presentation.detail.eyebrow}
          value={presentation.detail.title || (powerSource?.source === 'manual' ? 'Manual' : hasStalePower ? 'Partial' : 'Unavailable')}
          tone={presentation.detail.tone}
        />
        <WidgetSecondaryRow
          items={[
            presentation.microMetrics[0] ?? { label: 'Runtime', value: '\u2014', tone: 'neutral' },
            presentation.microMetrics[1] ?? { label: 'Input', value: '\u2014', tone: 'neutral' },
          ]}
        />
        <PowerFlowGraphic inputWatts={0} outputWatts={0} />
      </WidgetCardShell>
    );
  }

  const reserveText =
    connectedPrimaryDevice?.batteryPercent != null ? `${connectedPrimaryDevice.batteryPercent}% reserve` : 'Reserve unavailable';
  const footerBits = [
    connectedPrimaryDevice?.deviceName ?? 'Connected power source',
    reserveText,
    totalConnected > 1 ? `+${totalConnected - 1} more` : null,
    totalSolarWatts > 0 ? `Solar ${Math.round(totalSolarWatts)}W` : null,
  ].filter(Boolean);

  return (
    <WidgetCardShell
      badge={presentation.badge}
      footer={<WidgetMetaLine text={footerBits.join(' | ')} tone="neutral" />}
    >
      <WidgetPrimaryValue
        label={presentation.detail.eyebrow}
        value={presentation.detail.title || (connectedPrimaryDevice?.batteryPercent != null ? `${connectedPrimaryDevice.batteryPercent}%` : 'Connected')}
        tone={presentation.detail.tone}
      />
      <WidgetSecondaryRow
        items={[
          presentation.microMetrics[1] ?? { label: 'Input', value: formatFlowValue(totalInputWatts, 'input'), tone: totalInputWatts > 0 ? 'live' : 'neutral' },
          presentation.microMetrics[2] ?? { label: 'Output', value: formatFlowValue(totalOutputWatts, 'output'), tone: totalOutputWatts > 0 ? 'critical' : 'neutral' },
        ]}
      />
      <WidgetMicroStrip
        items={[
          presentation.microMetrics[0] ?? { label: 'Runtime', value: '\u2014', tone: 'neutral' },
          { label: 'Source', value: connectedPrimaryDevice?.providerDisplayName ?? 'Power', tone: 'neutral' },
          { label: 'Updated', value: formatLastUpdatedTime(connectedPrimaryDevice?.lastUpdated ?? 0), tone: connectedPrimaryDevice?.isStale ? 'attention' : 'neutral' },
          ...(totalSolarWatts > 0 ? [{ label: 'Solar', value: `${Math.round(totalSolarWatts)}W`, tone: 'good' as const }] : []),
        ]}
      />
    </WidgetCardShell>
  );
}

export default PowerSystemCard;

const ws = StyleSheet.create({
  compactShell: {
    flex: 1,
    minHeight: 0,
    gap: 4,
    justifyContent: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  statusValue: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
  },
  compactLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  compactMetricRow: {
    flexDirection: 'row',
    gap: 6,
  },
  compactMetricCell: {
    flex: 1,
    gap: 2,
  },
  compactMetricLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1,
  },
  compactMetricValue: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  compactMetaText: {
    color: TACTICAL.textMuted,
    fontSize: 7.5,
    fontWeight: '700',
    lineHeight: 10,
  },
  footerStack: {
    gap: 3,
  },
  flowGraphic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 30,
    marginTop: 1,
  },
  flowGraphicCompact: {
    minHeight: 22,
    gap: 5,
  },
  flowNode: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowNodeCompact: {
    width: 18,
    height: 18,
    borderRadius: 9,
  },
  flowNodeInActive: {
    borderColor: 'rgba(76,175,80,0.35)',
    backgroundColor: 'rgba(76,175,80,0.10)',
  },
  flowNodeOutActive: {
    borderColor: 'rgba(239,83,80,0.35)',
    backgroundColor: 'rgba(239,83,80,0.10)',
  },
  flowTrackWrap: {
    flex: 1,
    height: 16,
    justifyContent: 'center',
  },
  flowTrackBase: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  flowTrackSegment: {
    position: 'absolute',
    top: 7,
    height: 2,
    borderRadius: 2,
  },
  flowTrackSegmentCompact: {
    top: 7,
  },
  flowTrackLeft: {
    left: 0,
    right: '50%',
    marginRight: 14,
    backgroundColor: 'rgba(76,175,80,0.18)',
  },
  flowTrackRight: {
    left: '50%',
    right: 0,
    marginLeft: 14,
    backgroundColor: 'rgba(239,83,80,0.18)',
  },
  flowTrackLeftActive: {
    backgroundColor: '#4CAF50',
  },
  flowTrackRightActive: {
    backgroundColor: '#EF5350',
  },
  flowCore: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 28,
    height: 28,
    marginLeft: -14,
    marginTop: -14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowCoreCompact: {
    width: 20,
    height: 20,
    marginLeft: -10,
    marginTop: -10,
    borderRadius: 10,
  },
  flowCoreActive: {
    borderColor: 'rgba(196,138,44,0.32)',
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  cardStatusRow: {
    gap: 1,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 18,
    paddingVertical: 2,
  },
  metricLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.9,
  },
  metricValue: {
    color: TACTICAL.text,
    fontSize: 9.5,
    fontWeight: '800',
  },
});

