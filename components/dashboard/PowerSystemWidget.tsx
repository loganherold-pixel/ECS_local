import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import {
  resolveTelemetrySourceState,
  type TelemetrySourceState,
} from '../../lib/telemetrySourceState';
import {
  BLU_PROVIDER_TO_POWER_PROVIDER,
  resolvePowerReadiness,
  type PowerReadinessState,
} from '../../lib/powerReadiness';
import { usePowerIntelligence } from '../../lib/powerIntelligence';
import {
  WidgetCardShell,
  getWidgetToneColor,
  WidgetMetaLine,
  type WidgetTone,
} from './WidgetChrome';
import { useReducedMotion, useStableAnimatedValue } from '../../lib/ecsAnimations';
import { resolvePowerWidgetPresentation } from '../../lib/resource/resourceCommandResolvers';
import type { ECSAIState } from '../../lib/ai/aiOrchestrator';
import type { ECSOrchestratorTargetView } from '../../lib/ai/orchestratorSelectors';
import { publishPowerBriefAdvisories } from '../../lib/powerBriefPublisher';
import type { PowerTelemetryTruth } from '../../src/power/types/PowerTelemetry';
import {
  getPowerTruthLabel,
  isPowerSimulationAllowed,
  normalizePowerTelemetryTruth,
} from '../../src/power/types/PowerTelemetry';
import { normalizePowerTelemetrySnapshot } from '../../src/features/power/services/powerTruthService';
import type { PowerTelemetrySnapshot } from '../../src/types/telemetry';
import { useECSPowerTelemetryReadings } from '../../src/telemetry/useECSTelemetry';
import type { ECSPowerTelemetryDeviceReading } from '../../src/telemetry/ECSTelemetryTypes';
import type { BluetoothTelemetrySource } from '../../lib/bluetoothLiveTelemetry';
import PowerModuleRiveWidget from './PowerModuleRiveWidget';
import { adaptPowerTelemetryForRive } from '../../lib/powerModuleRiveTelemetry';

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
  telemetrySource: BluetoothTelemetrySource | null;
  telemetrySourceLabel: string | null;
  isTelemetryLive: boolean;
  truth: PowerTelemetryTruth;
  sourceTruthLabel: string;
}

type PowerWidgetContextData = {
  aiState?: ECSAIState | null;
  aiDashboardView?: ECSOrchestratorTargetView | null;
};

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

export const POWER_CHARGE_IN_COLOR = getWidgetToneColor('good');
export const POWER_DRAW_OUT_COLOR = getWidgetToneColor('warning');
export const POWER_SOLAR_COLOR = TACTICAL.amber;

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

function telemetryTransportToBluetoothSource(transport: ECSPowerTelemetryDeviceReading['transport']): BluetoothTelemetrySource {
  if (transport === 'ble') return 'ble_live';
  if (transport === 'cloud' || transport === 'gateway' || transport === 'wifi') return 'provider_cloud';
  return 'unavailable';
}

function buildDeviceReading(
  telemetry: ECSPowerTelemetryDeviceReading,
): PowerDeviceReading {
  const providerKey = String(telemetry.provider || 'unknown').toLowerCase();
  const branding = PROVIDER_BRANDING[providerKey] ?? PROVIDER_BRANDING.unknown;
  const freshness = telemetry.quality;
  const connectionState: PowerDeviceReading['connectionState'] =
    telemetry.quality === 'live' ? 'connected' :
    telemetry.quality === 'stale' ? 'reconnecting' :
    'disconnected';

  const battPct = asNumber(telemetry.batteryPercent);
  const inputW = asNumber(telemetry.inputWatts);
  const outputW = asNumber(telemetry.outputWatts);
  const solarW = asNumber(telemetry.solarWatts);
  const tempC = asNumber(telemetry.temperatureCelsius);
  const runtimeMin = asNumber(telemetry.estimatedRuntimeMinutes);
  const telemetrySource = telemetryTransportToBluetoothSource(telemetry.transport);
  const truth = normalizePowerTelemetryTruth({
    source: telemetry.transport === 'ble'
      ? 'ble'
      : telemetry.transport === 'cloud' || telemetry.transport === 'gateway' || telemetry.transport === 'wifi'
        ? 'cloud'
        : 'unavailable',
    timestamp: telemetry.lastUpdated,
    device: {
      id: telemetry.deviceId,
      vendor: providerKey,
      model: telemetry.deviceName,
    },
  });
  const simulationBlocked = truth.isSimulated && !isPowerSimulationAllowed();
  const isStale =
    simulationBlocked ||
    truth.isStale ||
    freshness === 'stale' ||
    freshness === 'unavailable';
  const powerProviderId = BLU_PROVIDER_TO_POWER_PROVIDER[providerKey] ?? null;
  const readiness = resolvePowerReadiness({
    providerId: powerProviderId,
    connectionState,
    hasTelemetry: truth.isLive,
    hasStoredSnapshot: telemetry.lastUpdated > 0,
  });

  return {
    deviceId: telemetry.deviceId,
    deviceName: telemetry.deviceName || branding.displayName,
    model: telemetry.deviceName || branding.displayName,
    provider: providerKey,
    providerDisplayName: telemetry.providerLabel || branding.displayName,
    providerAccentColor: branding.accentColor,
    providerIcon: branding.iconName,
    batteryPercent: simulationBlocked ? null : battPct,
    inputWatts: simulationBlocked ? null : inputW,
    outputWatts: simulationBlocked ? null : outputW,
    solarInputWatts: simulationBlocked ? null : solarW,
    temperatureCelsius: simulationBlocked ? null : tempC,
    estimatedRuntimeMinutes: simulationBlocked ? null : runtimeMin,
    chargingState: deriveChargingState(inputW, outputW, battPct),
    connectionState: simulationBlocked ? 'disconnected' : connectionState,
    warningState: deriveWarningState(battPct, tempC, freshness),
    isPrimary: false,
    isStale,
    readinessState: readiness.state,
    readinessLabel: readiness.label,
    lastUpdated: simulationBlocked ? 0 : telemetry.lastUpdated,
    capacityWh: simulationBlocked ? null : asNumber(telemetry.capacityWh),
    batteryVolts: simulationBlocked ? null : asNumber(telemetry.batteryVolts),
    batteryAmps: simulationBlocked ? null : asNumber(telemetry.batteryAmps),
    signalStrength: simulationBlocked ? null : asNumber(telemetry.signalStrength),
    role: 'Primary House Battery',
    telemetrySource,
    telemetrySourceLabel: getPowerTruthLabel(truth),
    isTelemetryLive: truth.isLive,
    truth,
    sourceTruthLabel: getPowerTruthLabel(truth),
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
  const telemetryReadings = useECSPowerTelemetryReadings();

  return useMemo(() => {
    const devices = telemetryReadings
      .filter((reading) => reading.quality !== 'unavailable')
      .map((reading, index) => ({
        ...buildDeviceReading(reading),
        isPrimary: index === 0,
        role: index === 0 ? 'Primary House Battery' : 'Supporting Power Source',
      }));

    const primaryDevice = devices[0] ?? null;
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
    const isAnyConnected = totalConnected > 0;
    const isAnyReconnecting = devices.some((device) => device.connectionState === 'reconnecting');

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
  }, [telemetryReadings]);
}

export interface PowerTelemetrySummary {
  snapshot: PowerTelemetrySnapshot;
  sourceState: TelemetrySourceState;
  inputWatts: number | null;
  outputWatts: number | null;
  solarWatts: number | null;
  batteryPercent: number | null;
  chargingState: PowerDeviceReading['chargingState'];
  sourceLabel: string;
  lastUpdated: number | null;
  isLive: boolean;
  isStale: boolean;
  connectedDeviceCount: number;
  primaryDevice: PowerDeviceReading | null;
  truth: PowerTelemetryTruth;
  canDisplayTelemetryValues: boolean;
  canAnimateFlow: boolean;
}

export function normalizePowerTelemetrySummary(power: ReturnType<typeof useUnifiedPowerDevices>): PowerTelemetrySummary {
  const connectedLiveDevice =
    power.devices.find((device) => device.connectionState === 'connected' && device.truth.isLive) ?? null;
  const primaryDevice = connectedLiveDevice ?? power.primaryDevice;
  const lastUpdated = power.devices.reduce((latest, device) => {
    if (device.lastUpdated <= 0) return latest;
    return latest == null || device.lastUpdated > latest ? device.lastUpdated : latest;
  }, null as number | null);
  const hasLiveTelemetry = Boolean(connectedLiveDevice);
  const sumKnownWatts = (
    field: 'inputWatts' | 'outputWatts' | 'solarInputWatts',
  ): number | null => {
    const known = power.devices
      .map((device) => device[field])
      .filter((value): value is number => value != null);
    if (known.length === 0) return null;
    return Math.max(0, Math.round(known.reduce((sum, value) => sum + value, 0)));
  };
  const inputWatts = sumKnownWatts('inputWatts');
  const outputWatts = sumKnownWatts('outputWatts');
  const solarWatts = sumKnownWatts('solarInputWatts');
  const batteryPercent = connectedLiveDevice?.batteryPercent ?? primaryDevice?.batteryPercent ?? power.aggregatedBatteryPercent ?? null;
  const truth = connectedLiveDevice?.truth
    ?? primaryDevice?.truth
    ?? normalizePowerTelemetryTruth({
      source: 'unavailable',
      device: { id: 'unavailable', vendor: 'unknown' },
    });
  const snapshot = normalizePowerTelemetrySnapshot(
    {
      batteryPercent: batteryPercent ?? undefined,
      capacityWh: primaryDevice?.capacityWh ?? undefined,
      inputWatts: inputWatts ?? undefined,
      outputWatts: outputWatts ?? undefined,
      solarWatts: solarWatts ?? undefined,
      temperatureC: primaryDevice?.temperatureCelsius ?? undefined,
      estimatedRuntimeMinutes: primaryDevice?.estimatedRuntimeMinutes ?? undefined,
    },
    truth,
  );
  const sourceState = resolveTelemetrySourceState({
    sourceType: snapshot.sourceType,
    freshness: snapshot.freshness,
    updatedAt: snapshot.updatedAt,
    isStreaming: snapshot.isLive,
  });
  const isStrictlyStale = truth.isStale;
  const hasConfidentManualEstimate = truth.isManual && truth.confidence >= 0.5;
  const hasRecentCachedTelemetry = truth.sourceTruth === 'cached' && !truth.isStale;
  const canDisplayTelemetryValues = hasLiveTelemetry || hasConfidentManualEstimate || hasRecentCachedTelemetry;
  const canAnimateFlow = hasLiveTelemetry || hasConfidentManualEstimate;

  return {
    snapshot,
    sourceState,
    inputWatts,
    outputWatts,
    solarWatts,
    batteryPercent,
    chargingState: deriveChargingState(inputWatts, outputWatts, batteryPercent),
    sourceLabel: sourceState.label,
    lastUpdated,
    isLive: sourceState.isHighConfidenceLive,
    isStale: sourceState.isStale || snapshot.isStale || isStrictlyStale,
    connectedDeviceCount: power.totalConnected,
    primaryDevice,
    truth,
    canDisplayTelemetryValues,
    canAnimateFlow,
  };
}

function usePowerFlowPulse(active: boolean, duration: number) {
  const pulse = useStableAnimatedValue(0);
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);
  const runningKeyRef = useRef<string | null>(null);
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 1250;

  useEffect(() => {
    const nextKey = active ? `flow:${safeDuration}` : 'idle';
    if (runningKeyRef.current === nextKey) {
      return undefined;
    }

    loopRef.current?.stop();
    loopRef.current = null;
    runningKeyRef.current = nextKey;
    pulse.stopAnimation();

    if (!active) {
      pulse.setValue(0);
      return;
    }

    pulse.setValue(0);
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: safeDuration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loopRef.current = loop;
    loop.start();

    return () => {
      loop.stop();
      if (loopRef.current === loop) {
        loopRef.current = null;
      }
      if (runningKeyRef.current === nextKey) {
        runningKeyRef.current = null;
      }
      pulse.stopAnimation();
    };
  }, [active, pulse, safeDuration]);

  return pulse;
}

function PowerMonitorRiveHero({
  summary,
  compact = false,
}: {
  summary: PowerTelemetrySummary;
  compact?: boolean;
}) {
  const riveTelemetry = adaptPowerTelemetryForRive(summary);
  const batteryLabel = summary.batteryPercent == null ? 'battery unavailable' : `${Math.round(summary.batteryPercent)} percent battery`;
  const sourceLabel = summary.sourceLabel ? `, ${summary.sourceLabel}` : '';

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Power Monitor module: ${batteryLabel}${sourceLabel}`}
      style={[ws.riveHero, compact && ws.riveHeroCompact]}
      testID={compact ? 'power-monitor-rive-hero-compact' : 'power-monitor-rive-hero'}
    >
      <PowerModuleRiveWidget
        hasEcsData={riveTelemetry.hasEcsData}
        batteryPercent={riveTelemetry.batteryPercent}
        inputWatts={riveTelemetry.inputWatts}
        outputWatts={riveTelemetry.outputWatts}
        style={[ws.riveHeroModule, compact && ws.riveHeroModuleCompact]}
        testID={compact ? 'power-monitor-blu-rive-compact' : 'power-monitor-blu-rive'}
      />
    </View>
  );
}

function PowerFlowGraphic({
  inputWatts,
  outputWatts,
  isStale = false,
  allowAnimation = true,
  compact = false,
}: {
  inputWatts: number;
  outputWatts: number;
  isStale?: boolean;
  allowAnimation?: boolean;
  compact?: boolean;
}) {
  const reducedMotion = useReducedMotion();
  const activeInput = inputWatts > 0 && !isStale && allowAnimation;
  const activeOutput = outputWatts > 0 && !isStale && allowAnimation;
  const hasFlow = activeInput || activeOutput;
  const shouldAnimate = hasFlow && !reducedMotion;
  const inputFlowPulse = usePowerFlowPulse(activeInput && shouldAnimate, 1250);
  const outputFlowPulse = usePowerFlowPulse(activeOutput && shouldAnimate, 1250);

  const inputPulseStyle = useMemo(
    () => ({
      opacity: inputFlowPulse.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.15, 0.9, 0.15],
      }),
      transform: [
        {
          translateX: inputFlowPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [-28, 28],
          }),
        },
      ],
    }),
    [inputFlowPulse],
  );
  const outputPulseStyle = useMemo(
    () => ({
      opacity: outputFlowPulse.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0.15, 0.85, 0.15],
      }),
      transform: [
        {
          translateX: outputFlowPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [-28, 28],
          }),
        },
      ],
    }),
    [outputFlowPulse],
  );

  return (
    <View style={[ws.flowGraphic, compact && ws.flowGraphicCompact]}>
      <View style={[ws.flowNode, compact && ws.flowNodeCompact, activeInput && ws.flowNodeInActive]}>
        <Ionicons name="arrow-down-outline" size={compact ? 10 : 12} color={activeInput ? POWER_CHARGE_IN_COLOR : TACTICAL.textMuted} />
      </View>
      <View style={ws.flowTrackWrap}>
        <View style={ws.flowTrackBase} />
        <View
          style={[
            ws.flowTrackSegment,
            ws.flowTrackLeft,
            activeInput && { backgroundColor: POWER_CHARGE_IN_COLOR },
            compact && ws.flowTrackSegmentCompact,
          ]}
        >
          {activeInput && shouldAnimate ? (
            <Animated.View
              pointerEvents="none"
              style={[ws.flowPulse, { backgroundColor: POWER_CHARGE_IN_COLOR }, inputPulseStyle]}
            />
          ) : null}
        </View>
        <View
          style={[
            ws.flowTrackSegment,
            ws.flowTrackRight,
            activeOutput && { backgroundColor: POWER_DRAW_OUT_COLOR },
            compact && ws.flowTrackSegmentCompact,
          ]}
        >
          {activeOutput && shouldAnimate ? (
            <Animated.View
              pointerEvents="none"
              style={[ws.flowPulse, { backgroundColor: POWER_DRAW_OUT_COLOR }, outputPulseStyle]}
            />
          ) : null}
        </View>
        <View style={[ws.flowCore, hasFlow && ws.flowCoreActive, compact && ws.flowCoreCompact]}>
          <Ionicons name="flash-outline" size={compact ? 11 : 13} color={hasFlow ? TACTICAL.amber : TACTICAL.textMuted} />
        </View>
      </View>
      <View style={[ws.flowNode, compact && ws.flowNodeCompact, activeOutput && ws.flowNodeOutActive]}>
        <Ionicons name="arrow-up-outline" size={compact ? 10 : 12} color={activeOutput ? POWER_DRAW_OUT_COLOR : TACTICAL.textMuted} />
      </View>
    </View>
  );
}

export function PowerSystemCompact({ data }: { data?: PowerWidgetContextData }) {
  const power = useUnifiedPowerDevices();
  const summary = normalizePowerTelemetrySummary(power);
  const livePowerIntelligence = usePowerIntelligence();
  const { primaryDevice, totalConnected, totalInputWatts, totalOutputWatts } = power;
  const connectedPrimaryDevice = summary.isLive ? summary.primaryDevice : null;
  const hasLivePower = summary.isLive;
  const powerIntelligence =
    hasLivePower
      ? data?.aiState?.richContext?.resources?.powerIntelligence ?? livePowerIntelligence
      : null;
  const runtimeMinutes = connectedPrimaryDevice?.estimatedRuntimeMinutes ?? primaryDevice?.estimatedRuntimeMinutes ?? null;
  const compactFooter = summary.sourceLabel;
  const presentation = resolvePowerWidgetPresentation({
    batteryPercent: connectedPrimaryDevice?.batteryPercent ?? primaryDevice?.batteryPercent ?? null,
    runtimeMinutes,
    inputWatts: totalInputWatts,
    outputWatts: totalOutputWatts,
    solarWatts: power.totalSolarWatts,
    connectedDeviceCount: totalConnected,
    powerIntelligence,
    providerTelemetry: data?.aiState?.richContext?.resources?.providerTelemetry ?? null,
    aiState: data?.aiState ?? null,
    dashboardView: data?.aiDashboardView ?? null,
  });

  useEffect(() => {
    publishPowerBriefAdvisories({
      batteryPercent: summary.batteryPercent,
      outputWatts: summary.outputWatts,
      solarWatts: summary.solarWatts,
      estimatedRuntimeMinutes: runtimeMinutes,
      deviceId: summary.primaryDevice?.deviceId,
      deviceName: summary.primaryDevice?.deviceName,
      providerId: summary.primaryDevice?.provider,
      truth: summary.truth,
    });
  }, [
    runtimeMinutes,
    summary.batteryPercent,
    summary.outputWatts,
    summary.solarWatts,
    summary.primaryDevice?.deviceId,
    summary.primaryDevice?.deviceName,
    summary.primaryDevice?.provider,
    summary.truth,
  ]);

  return (
    <WidgetCardShell
      badge={presentation.badge}
      footer={compactFooter ? <WidgetMetaLine text={compactFooter} tone="neutral" /> : undefined}
    >
      <View style={ws.riveShell}>
        <PowerMonitorRiveHero summary={summary} compact />
      </View>
    </WidgetCardShell>
  );
}

export function PowerSystemCard({ data }: { data?: PowerWidgetContextData }) {
  const power = useUnifiedPowerDevices();
  const summary = normalizePowerTelemetrySummary(power);
  const livePowerIntelligence = usePowerIntelligence();
  const { primaryDevice, totalConnected, totalInputWatts, totalOutputWatts, totalSolarWatts } = power;
  const connectedPrimaryDevice = summary.isLive ? summary.primaryDevice : null;
  const hasLivePower = summary.isLive;
  const powerIntelligence =
    hasLivePower
      ? data?.aiState?.richContext?.resources?.powerIntelligence ?? livePowerIntelligence
      : null;
  const runtimeMinutes = connectedPrimaryDevice?.estimatedRuntimeMinutes ?? primaryDevice?.estimatedRuntimeMinutes ?? null;
  const sourceTone: WidgetTone = summary.sourceState.tone;

  const presentation = resolvePowerWidgetPresentation({
    batteryPercent: connectedPrimaryDevice?.batteryPercent ?? primaryDevice?.batteryPercent ?? null,
    runtimeMinutes,
    inputWatts: totalInputWatts,
    outputWatts: totalOutputWatts,
    solarWatts: totalSolarWatts,
    connectedDeviceCount: totalConnected,
    powerIntelligence,
    providerTelemetry: data?.aiState?.richContext?.resources?.providerTelemetry ?? null,
    aiState: data?.aiState ?? null,
    dashboardView: data?.aiDashboardView ?? null,
  });

  useEffect(() => {
    publishPowerBriefAdvisories({
      batteryPercent: summary.batteryPercent,
      outputWatts: summary.outputWatts,
      solarWatts: summary.solarWatts,
      estimatedRuntimeMinutes: runtimeMinutes,
      deviceId: summary.primaryDevice?.deviceId,
      deviceName: summary.primaryDevice?.deviceName,
      providerId: summary.primaryDevice?.provider,
      truth: summary.truth,
    });
  }, [
    runtimeMinutes,
    summary.batteryPercent,
    summary.outputWatts,
    summary.solarWatts,
    summary.primaryDevice?.deviceId,
    summary.primaryDevice?.deviceName,
    summary.primaryDevice?.provider,
    summary.truth,
  ]);

  if (!hasLivePower) {
    return (
      <WidgetCardShell
        badge={presentation.badge}
        footer={
          <WidgetMetaLine
            text={summary.sourceLabel}
            tone={sourceTone}
          />
        }
      >
        <View style={ws.riveShell}>
          <PowerMonitorRiveHero summary={summary} />
        </View>
      </WidgetCardShell>
    );
  }

  const footerBits = [
    summary.sourceLabel,
    totalConnected > 1 ? `${totalConnected} sources` : null,
    totalSolarWatts > 0 ? `Solar ${Math.round(totalSolarWatts)}W` : null,
  ].filter(Boolean);

  return (
    <WidgetCardShell
      badge={presentation.badge}
      footer={<WidgetMetaLine text={footerBits.join(' | ')} tone="neutral" />}
    >
      <View style={ws.riveShell}>
        <PowerMonitorRiveHero summary={summary} />
      </View>
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
  riveShell: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 4,
    elevation: 4,
  },
  riveHero: {
    width: '100%',
    minWidth: 150,
    maxWidth: 230,
    height: 118,
    minHeight: 100,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 8,
    elevation: 8,
  },
  riveHeroCompact: {
    minWidth: 118,
    maxWidth: 176,
    height: 86,
    minHeight: 76,
  },
  riveHeroModule: {
    width: '100%',
    height: '100%',
    minWidth: 144,
    minHeight: 94,
    alignSelf: 'center',
    zIndex: 9,
    elevation: 9,
  },
  riveHeroModuleCompact: {
    minWidth: 112,
    minHeight: 70,
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
    overflow: 'hidden',
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
  flowPulse: {
    width: 18,
    height: 2,
    borderRadius: 2,
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

