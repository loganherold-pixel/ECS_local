/**
 * ECS Power System Widget — Unified Expedition Energy Monitor
 *
 * Phase 8: Multi-Provider Power Dashboard Widget
 *
 * Displays connected power systems from all ECS providers in a single
 * unified widget. Supports compact (dashboard grid) and full (card) modes.
 *
 * Data sources:
 *   1. useEcsProviders() — unified provider registry (primary)
 *   2. useBlu() — BLE adapter fallback for live telemetry
 *   3. useEcoFlowLive() — EcoFlow cloud fallback
 *
 * Compact mode: primary device + system count
 * Full mode: primary device with SOC bar + summary
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { useBlu } from '../../src/power/blu/useBlu';
import { useEcoFlowLive } from '../../lib/useEcoFlowLive';
import { bluStateStore } from '../../src/power/blu/BluStateStore';
import { ECS_PROVIDER_BRANDING } from '../../src/power/providers/EcsProviderRegistry';
import type { BluProviderId } from '../../src/power/blu/BluTypes';

// ── Unified Device Shape (internal) ─────────────────────────────────────

export interface PowerDeviceReading {
  deviceId: string;
  deviceName: string;
  model: string;
  provider: BluProviderId;
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
  lastUpdated: number;
  capacityWh: number | null;
  batteryVolts: number | null;
  role: string | null; // e.g., "Primary House Battery", "Solar Source"
}

// ── Charging State Helpers ──────────────────────────────────────────────

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
  isStale: boolean,
): PowerDeviceReading['warningState'] {
  if (isStale) return 'comm_loss';
  if (tempC != null && tempC > 55) return 'high_temp';
  if (battPct != null && battPct <= 10) return 'low_battery';
  return 'normal';
}

// ── State Colors & Labels ───────────────────────────────────────────────

export const CHARGING_STATE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  charging:     { label: 'CHARGING',     color: '#4CAF50', icon: 'flash' },
  discharging:  { label: 'DISCHARGING',  color: '#FF9800', icon: 'arrow-down' },
  idle:         { label: 'IDLE',         color: TACTICAL.textMuted, icon: 'pause' },
  full:         { label: 'FULL',         color: '#4CAF50', icon: 'checkmark-circle' },
  unknown:      { label: 'STANDBY',      color: TACTICAL.textMuted, icon: 'ellipsis-horizontal' },
};

export const CONNECTION_STATE_CONFIG: Record<string, { label: string; color: string }> = {
  connected:    { label: 'CONNECTED',    color: '#4CAF50' },
  disconnected: { label: 'DISCONNECTED', color: '#EF5350' },
  reconnecting: { label: 'RECONNECTING', color: '#FFB300' },
  scanning:     { label: 'SCANNING',     color: '#2196F3' },
};

export const WARNING_STATE_CONFIG: Record<string, { label: string; color: string; icon: string }> = {
  normal:      { label: 'NORMAL',      color: '#4CAF50', icon: 'shield-checkmark' },
  low_battery: { label: 'LOW BATTERY', color: '#EF5350', icon: 'battery-dead' },
  high_temp:   { label: 'HIGH TEMP',   color: '#EF5350', icon: 'thermometer' },
  overload:    { label: 'OVERLOAD',    color: '#EF5350', icon: 'warning' },
  comm_loss:   { label: 'COMM LOSS',   color: '#FFB300', icon: 'cloud-offline' },
  error:       { label: 'ERROR',       color: '#EF5350', icon: 'alert-circle' },
};

// ── Battery Color Helper ────────────────────────────────────────────────

export function getBatteryColor(pct: number | null): string {
  if (pct == null) return TACTICAL.textMuted;
  if (pct >= 60) return '#4CAF50';
  if (pct >= 25) return '#FFB300';
  return '#EF5350';
}

// ── Runtime Format Helper ───────────────────────────────────────────────

export function formatRuntime(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return '\u2014';
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${minutes}m`;
}

// ── Hook: Aggregate all power devices ───────────────────────────────────

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
  const blu = useBlu();
  const eco = useEcoFlowLive();

  // Subscribe to bluStateStore for reactive updates
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = bluStateStore.subscribe(() => setRev((r) => r + 1));
    return unsub;
  }, []);

  return useMemo(() => {
    const devices: PowerDeviceReading[] = [];

    // ── EcoFlow Cloud Device ──
    const ecoLive = eco.status === 'live' || eco.status === 'degraded';
    if (eco.selectedDeviceId || ecoLive) {
      const branding = ECS_PROVIDER_BRANDING.ecoflow;
      const isStale = eco.status === 'degraded' || eco.status === 'offline';
      const inputW = eco.inputWatts ?? 0;
      const outputW = eco.outputWatts ?? 0;
      const solarW = eco.solarWatts ?? 0;
      const battPct = eco.batteryPct ?? null;

      devices.push({
        deviceId: eco.selectedDeviceId || 'ecoflow-cloud',
        deviceName: eco.deviceName || 'EcoFlow Device',
        model: eco.deviceName || 'EcoFlow',
        provider: 'ecoflow',
        providerDisplayName: branding.displayName,
        providerAccentColor: branding.accentColor,
        providerIcon: branding.iconName,
        batteryPercent: battPct,
        inputWatts: ecoLive ? inputW : null,
        outputWatts: ecoLive ? outputW : null,
        solarInputWatts: ecoLive ? solarW : null,
        temperatureCelsius: null,
        estimatedRuntimeMinutes: null,
        chargingState: ecoLive ? deriveChargingState(inputW, outputW, battPct) : 'unknown',
        connectionState: ecoLive ? 'connected' : eco.status === 'offline' ? 'disconnected' : 'reconnecting',
        warningState: deriveWarningState(battPct, null, isStale && ecoLive),
        isPrimary: false,
        isStale: isStale && !ecoLive,
        lastUpdated: eco.lastUpdatedAt ?? 0,
        capacityWh: null,
        batteryVolts: null,
        role: null,
      });
    }

    // ── BLU Devices (all providers) ──
    if (blu.isAvailable && blu.summary) {
      const bluSummary = blu.summary;
      const bluBattPct = bluSummary.battery_percent ?? null;
      const bluInputW = bluSummary.live_input ?? 0;
      const bluOutputW = bluSummary.live_output ?? 0;
      const bluSolarW = bluSummary.solar_input ?? 0;
      const isStale = blu.isStale;

      // Get connected BLU devices from state store
      const bluState = bluStateStore.getSnapshot();
      const connectedDevices = bluState?.connectedDevices || [];

      if (connectedDevices.length > 0) {
        for (const dev of connectedDevices) {
          const providerId = (dev.provider_id || 'ecoflow') as BluProviderId;
          const branding = ECS_PROVIDER_BRANDING[providerId] || ECS_PROVIDER_BRANDING.ecoflow;

          devices.push({
            deviceId: dev.device_id || `blu-${providerId}`,
            deviceName: dev.name || dev.model || branding.displayName,
            model: dev.model || branding.displayName,
            provider: providerId,
            providerDisplayName: branding.displayName,
            providerAccentColor: branding.accentColor,
            providerIcon: branding.iconName,
            batteryPercent: bluBattPct,
            inputWatts: bluInputW,
            outputWatts: bluOutputW,
            solarInputWatts: bluSolarW,
            temperatureCelsius: null,
            estimatedRuntimeMinutes: bluSummary.runtime_remaining ?? null,
            chargingState: deriveChargingState(bluInputW, bluOutputW, bluBattPct),
            connectionState: isStale ? 'reconnecting' : 'connected',
            warningState: deriveWarningState(bluBattPct, null, isStale),
            isPrimary: false,
            isStale,
            lastUpdated: Date.now(),
            capacityWh: null,
            batteryVolts: null,
            role: null,
          });
        }
      } else if (bluBattPct != null) {
        // Fallback: no individual device info, use summary
        devices.push({
          deviceId: 'blu-primary',
          deviceName: 'BLU Power System',
          model: 'BLU Device',
          provider: 'ecoflow',
          providerDisplayName: 'BLU',
          providerAccentColor: '#00A6FF',
          providerIcon: 'flash',
          batteryPercent: bluBattPct,
          inputWatts: bluInputW,
          outputWatts: bluOutputW,
          solarInputWatts: bluSolarW,
          temperatureCelsius: null,
          estimatedRuntimeMinutes: bluSummary.runtime_remaining ?? null,
          chargingState: deriveChargingState(bluInputW, bluOutputW, bluBattPct),
          connectionState: isStale ? 'reconnecting' : 'connected',
          warningState: deriveWarningState(bluBattPct, null, isStale),
          isPrimary: false,
          isStale,
          lastUpdated: Date.now(),
          capacityWh: null,
          batteryVolts: null,
          role: null,
        });
      }
    }

    // Deduplicate by deviceId (prefer non-stale)
    const seen = new Map<string, PowerDeviceReading>();
    for (const d of devices) {
      const existing = seen.get(d.deviceId);
      if (!existing || (!d.isStale && existing.isStale)) {
        seen.set(d.deviceId, d);
      }
    }
    const deduped = Array.from(seen.values());

    // Mark primary: first connected device, or highest battery
    if (deduped.length > 0) {
      const connected = deduped.filter((d) => d.connectionState === 'connected');
      const target = connected.length > 0
        ? connected.reduce((best, d) => {
            if (d.isPrimary) return d;
            if ((d.capacityWh ?? 0) > (best.capacityWh ?? 0)) return d;
            if ((d.batteryPercent ?? 0) > (best.batteryPercent ?? 0)) return d;
            return best;
          }, connected[0])
        : deduped[0];
      target.isPrimary = true;
    }

    const primary = deduped.find((d) => d.isPrimary) ?? null;
    const secondary = deduped.filter((d) => !d.isPrimary);

    let totalInput = 0;
    let totalOutput = 0;
    let totalSolar = 0;
    let weightedSoc = 0;
    let totalWeight = 0;

    for (const d of deduped) {
      if (d.connectionState === 'connected' || d.connectionState === 'reconnecting') {
        totalInput += d.inputWatts ?? 0;
        totalOutput += d.outputWatts ?? 0;
        totalSolar += d.solarInputWatts ?? 0;
        if (d.batteryPercent != null) {
          const w = d.capacityWh ?? 1000;
          weightedSoc += d.batteryPercent * w;
          totalWeight += w;
        }
      }
    }

    const aggBatt = totalWeight > 0 ? Math.round(weightedSoc / totalWeight) : null;
    const anyConnected = deduped.some((d) => d.connectionState === 'connected');
    const anyReconnecting = deduped.some((d) => d.connectionState === 'reconnecting');

    return {
      devices: deduped,
      primaryDevice: primary,
      secondaryDevices: secondary,
      totalConnected: deduped.filter((d) => d.connectionState === 'connected').length,
      totalInputWatts: Math.round(totalInput),
      totalOutputWatts: Math.round(totalOutput),
      totalSolarWatts: Math.round(totalSolar),
      aggregatedBatteryPercent: aggBatt,
      isAnyConnected: anyConnected,
      isAnyReconnecting: anyReconnecting,
    };
  }, [blu.isAvailable, blu.isStale, blu.summary, eco.status, eco.batteryPct, eco.solarWatts, eco.outputWatts, eco.inputWatts, eco.lastUpdatedAt, eco.selectedDeviceId, eco.deviceName]);
}

// ── MetricRow (local) ───────────────────────────────────────────────────

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={ws.metricRow}>
      <Text style={ws.metricLabel}>{label}</Text>
      <Text style={[ws.metricValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

// ── Compact Mode ────────────────────────────────────────────────────────

export function PowerSystemCompact({ }: {}) {
  const power = useUnifiedPowerDevices();
  const { primaryDevice, devices, totalConnected, totalInputWatts, totalOutputWatts } = power;

  if (!primaryDevice || devices.length === 0) {
    return (
      <View style={ws.compactRow}>
        <View style={ws.compactCell}>
          <Text style={ws.compactLabel}>POWER</Text>
          <Text style={[ws.compactValue, { fontSize: 9, color: TACTICAL.textMuted }]}>NONE</Text>
        </View>
        <View style={ws.compactCell}>
          <Text style={ws.compactLabel}>INPUT</Text>
          <Text style={[ws.compactValue, { color: TACTICAL.textMuted }]}>{'\u2014'}</Text>
        </View>
        <View style={ws.compactCell}>
          <Text style={ws.compactLabel}>OUTPUT</Text>
          <Text style={[ws.compactValue, { color: TACTICAL.textMuted }]}>{'\u2014'}</Text>
        </View>
      </View>
    );
  }

  const battColor = getBatteryColor(primaryDevice.batteryPercent);
  const stateConf = CHARGING_STATE_CONFIG[primaryDevice.chargingState] || CHARGING_STATE_CONFIG.unknown;

  return (
    <View style={ws.compactRow}>
      <View style={ws.compactCell}>
        <Text style={ws.compactLabel}>SOC</Text>
        <Text style={[ws.compactValue, { color: primaryDevice.isStale ? TACTICAL.textMuted : battColor }]}>
          {primaryDevice.batteryPercent != null ? `${primaryDevice.batteryPercent}%` : '\u2014'}
        </Text>
      </View>
      <View style={ws.compactCell}>
        <Text style={ws.compactLabel}>IN/OUT</Text>
        <Text style={[ws.compactValue, { fontSize: 9 }]}>
          {totalInputWatts > 0 || totalOutputWatts > 0
            ? `${totalInputWatts}/${totalOutputWatts}`
            : '\u2014'}
        </Text>
      </View>
      <View style={ws.compactCell}>
        <Text style={ws.compactLabel}>SYS</Text>
        <Text style={[ws.compactValue, { color: stateConf.color, fontSize: 9 }]}>
          {totalConnected > 1 ? `${totalConnected}` : stateConf.label.slice(0, 4)}
        </Text>
      </View>
    </View>
  );
}

// ── Full Card Mode ──────────────────────────────────────────────────────

export function PowerSystemCard({ }: {}) {
  const power = useUnifiedPowerDevices();
  const { primaryDevice, devices, totalConnected, totalInputWatts, totalOutputWatts, totalSolarWatts } = power;

  // ── Empty State ──
  if (!primaryDevice || devices.length === 0) {
    return (
      <View style={ws.body}>
        <View style={ws.emptyContainer}>
          <Ionicons name="battery-dead-outline" size={18} color={TACTICAL.textMuted} />
          <Text style={ws.emptyPrimary}>No power systems connected</Text>
          <Text style={ws.emptySecondary}>Connect via Power tab</Text>
        </View>
      </View>
    );
  }

  const battPct = primaryDevice.batteryPercent;
  const battColor = getBatteryColor(battPct);
  const stateConf = CHARGING_STATE_CONFIG[primaryDevice.chargingState] || CHARGING_STATE_CONFIG.unknown;
  const connConf = CONNECTION_STATE_CONFIG[primaryDevice.connectionState] || CONNECTION_STATE_CONFIG.connected;
  const warnConf = WARNING_STATE_CONFIG[primaryDevice.warningState] || WARNING_STATE_CONFIG.normal;
  const isWarning = primaryDevice.warningState !== 'normal';
  const secondaryCount = devices.length - 1;

  return (
    <View style={ws.body}>
      {/* ── Status Row ── */}
      <View style={ws.statusRow}>
        <View style={[ws.statusBadge, { backgroundColor: `${stateConf.color}12` }]}>
          <View style={[ws.statusDot, { backgroundColor: stateConf.color }]} />
          <Text style={[ws.statusText, { color: stateConf.color }]}>{stateConf.label}</Text>
        </View>
        {primaryDevice.isStale && (
          <View style={[ws.statusBadge, { backgroundColor: 'rgba(255,179,0,0.10)' }]}>
            <Ionicons name="time-outline" size={8} color="#FFB300" />
            <Text style={[ws.statusText, { color: '#FFB300' }]}>STALE</Text>
          </View>
        )}
        {isWarning && (
          <View style={[ws.statusBadge, { backgroundColor: `${warnConf.color}12` }]}>
            <Ionicons name={warnConf.icon as any} size={8} color={warnConf.color} />
            <Text style={[ws.statusText, { color: warnConf.color }]}>{warnConf.label}</Text>
          </View>
        )}
      </View>

      {/* ── Primary Device Name + Provider ── */}
      <View style={ws.deviceHeader}>
        <Text style={ws.deviceName} numberOfLines={1}>{primaryDevice.deviceName}</Text>
        <View style={[ws.providerChip, { borderColor: primaryDevice.providerAccentColor + '40' }]}>
          <View style={[ws.providerDot, { backgroundColor: primaryDevice.providerAccentColor }]} />
          <Text style={[ws.providerLabel, { color: primaryDevice.providerAccentColor }]}>
            {primaryDevice.providerDisplayName}
          </Text>
        </View>
      </View>

      {/* ── SOC Bar ── */}
      {battPct != null && (
        <View style={ws.socBarOuter}>
          <View
            style={[
              ws.socBarFill,
              {
                width: `${Math.min(100, Math.max(0, battPct))}%`,
                backgroundColor: primaryDevice.isStale ? TACTICAL.textMuted : battColor,
              },
            ]}
          />
        </View>
      )}

      {/* ── Core Metrics ── */}
      <MetricRow
        label="BATTERY"
        value={battPct != null ? `${battPct}%` : '\u2014'}
        color={primaryDevice.isStale ? TACTICAL.textMuted : battColor}
      />

      {totalInputWatts > 0 && (
        <MetricRow
          label="INPUT"
          value={`${totalInputWatts} W`}
          color={primaryDevice.isStale ? TACTICAL.textMuted : '#4FC3F7'}
        />
      )}

      {totalOutputWatts > 0 && (
        <MetricRow
          label="OUTPUT"
          value={`${totalOutputWatts} W`}
          color={primaryDevice.isStale ? TACTICAL.textMuted : TACTICAL.amber}
        />
      )}

      {totalSolarWatts > 0 && (
        <MetricRow
          label="SOLAR"
          value={`${totalSolarWatts} W`}
          color={primaryDevice.isStale ? TACTICAL.textMuted : '#FFB300'}
        />
      )}

      {primaryDevice.estimatedRuntimeMinutes != null && primaryDevice.estimatedRuntimeMinutes > 0 && (
        <MetricRow
          label="RUNTIME"
          value={formatRuntime(primaryDevice.estimatedRuntimeMinutes)}
          color={
            primaryDevice.isStale
              ? TACTICAL.textMuted
              : (primaryDevice.estimatedRuntimeMinutes ?? 0) < 60
              ? '#EF5350'
              : (primaryDevice.estimatedRuntimeMinutes ?? 0) < 180
              ? '#FFB300'
              : '#4CAF50'
          }
        />
      )}

      {/* ── Multi-System Indicator ── */}
      {secondaryCount > 0 && (
        <View style={ws.multiSystemRow}>
          <View style={ws.multiDot} />
          <Text style={ws.multiText}>
            +{secondaryCount} connected system{secondaryCount > 1 ? 's' : ''}
          </Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const ws = StyleSheet.create({
  body: {
    gap: 2,
  },

  // ── Compact ──
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  compactCell: {
    flex: 1,
    alignItems: 'center',
  },
  compactLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginBottom: 1,
  },
  compactValue: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },

  // ── Status ──
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
    marginBottom: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  // ── Device Header ──
  deviceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  deviceName: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.5,
    flex: 1,
    marginRight: 6,
  },
  providerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
    borderWidth: 1,
  },
  providerDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  providerLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ── SOC Bar ──
  socBarOuter: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 3,
  },
  socBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── Metrics ──
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  metricValue: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },

  // ── Multi-System ──
  multiSystemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  multiDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#4FC3F7',
  },
  multiText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Empty State ──
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
    gap: 4,
  },
  emptyPrimary: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  emptySecondary: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
    opacity: 0.85,
  },
});




