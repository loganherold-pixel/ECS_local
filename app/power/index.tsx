/**
 * Power Center — Phase 3I-3 / 4B / 8
 *
 * Displays:
 *   • Power Flow Diagram (Solar → Battery → Load) — visual widget
 *   • Power Forecast Panel — net watts, time estimates (Phase 3H-2)
 *     ↳ Now uses computed system capacity from device models (Phase 3H-3)
 *   • Power Events Panel — detected load events (Phase 3I-3)
 *   • Device Contribution Panel — per-device telemetry cards (Phase 3G-2)
 *   • Aggregated PowerTelemetry from usePowerTelemetry()
 *   • EcoFlow Live telemetry from useEcoFlowLive() (Phase 4B)
 *     ↳ Provider card shows active device name, LIVE/STANDBY status
 *     ↳ Auto-refreshes when returning from device picker via useFocusEffect
 *   • "Manage Devices" navigation button
 *   • Phase 8: "Add Power System" and "Manage Power Systems" entry points
 *
 * Matches ECS tactical dark theme. Self-contained — no external UI deps
 * beyond SafeIcon, theme context, the power telemetry hook, PowerFlowDiagram,
 * PowerForecastPanel, PowerEventsPanel, and PowerDeviceCard.
 */


import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Platform,
  RefreshControl,
} from 'react-native';

import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';

import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { ECS, SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';

import { usePowerTelemetry } from '../../src/power/hooks/usePowerTelemetry';
import type { PowerTelemetry } from '../../src/power/types/PowerTelemetry';

import { useEcoFlowLive } from '../../lib/useEcoFlowLive';

import PowerFlowDiagram from '../../src/components/power/PowerFlowDiagram';
import PowerDeviceCard from '../../src/components/power/PowerDeviceCard';
import PowerForecastPanel from '../../src/components/power/PowerForecastPanel';
import PowerEventsPanel from '../../src/components/power/PowerEventsPanel';

import { EcoFlowCloudProvider, powerDeviceStore } from '../../src/power';
import { computeSystemCapacity } from '../../src/power/forecast/deviceCapacity';

import { powerSetupStore, PROVIDER_DISPLAY } from '../../lib/powerSetupStore';
import type { ManagedPowerDevice } from '../../lib/powerSetupStore';



// ── Dev default capacity (Wh) ───────────────────────────────────────────
// Fallback when no device models are recognised. 3600 Wh is a reasonable
// default for a single large power station (e.g. EcoFlow DELTA Pro).
// TODO: Remove once all devices report explicit capacityWh via the cloud API.
const DEV_DEFAULT_CAPACITY_WH = 3600;




// ── Module-level provider instance for diagnostics ──────────────────────
// Same pattern as devices.tsx. In a future phase, this will be replaced
// with a shared singleton that the polling infrastructure also uses.
const ecoFlowProvider = new EcoFlowCloudProvider();

// ── Per-device telemetry entry type ─────────────────────────────────────
interface DeviceEntry {
  deviceId: string;
  name?: string;
  model?: string;
  socPct?: number;
  wattsIn?: number;
  wattsOut?: number;
  solarWatts?: number;
}

// ── Helper: format watts with unit ──────────────────────────────────────
function fmtWatts(w: number | undefined | null): string {
  if (w === undefined || w === null) return '--';
  if (w >= 1000) return `${(w / 1000).toFixed(1)} kW`;
  return `${Math.round(w)} W`;
}

// ── Helper: format runtime minutes ──────────────────────────────────────
function fmtRuntime(min: number | undefined): string {
  if (min === undefined || min === null) return '--';
  if (min >= 60) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}h ${m}m`;
  }
  return `${min}m`;
}

// ── Helper: format temperature ──────────────────────────────────────────
function fmtTemp(c: number | undefined): string {
  if (c === undefined || c === null) return '--';
  return `${c.toFixed(1)}°C`;
}

// ── Helper: format voltage ──────────────────────────────────────────────
function fmtVolts(v: number | undefined): string {
  if (v === undefined || v === null) return '--';
  return `${v.toFixed(1)} V`;
}

// ── SOC color helper ────────────────────────────────────────────────────
function socColor(soc: number | undefined | null, palette: any): string {
  if (soc === undefined || soc === null) return palette.textMuted;
  if (soc >= 60) return '#34C759';
  if (soc >= 30) return '#FFB800';
  if (soc >= 15) return '#FF9500';
  return '#FF3B30';
}

// ── SOC bar component ───────────────────────────────────────────────────
function SOCBar({ soc, palette }: { soc: number | undefined; palette: any }) {
  const pct = soc !== undefined ? Math.max(0, Math.min(100, soc)) : 0;
  const color = socColor(soc, palette);

  return (
    <View style={[socBarStyles.track, { backgroundColor: palette.border }]}>
      <View
        style={[
          socBarStyles.fill,
          {
            width: `${pct}%`,
            backgroundColor: color,
          },
        ]}
      />
    </View>
  );
}

const socBarStyles = StyleSheet.create({
  track: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    marginTop: 8,
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});

// ── Telemetry stat row ──────────────────────────────────────────────────
function TelemetryStat({
  icon,
  label,
  value,
  valueColor,
  palette,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
  palette: any;
}) {
  return (
    <View style={[statStyles.row, { borderBottomColor: GOLD_RAIL.subsection }]}>
      <Ionicons name={icon} size={16} color={palette.amber} />
      <Text style={[statStyles.label, { color: palette.textMuted }]}>{label}</Text>
      <Text
        style={[
          statStyles.value,
          { color: valueColor || palette.text },
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
  },
  label: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
});

// ── EcoFlow Live Status Badge ───────────────────────────────────────────
function EcoFlowStatusBadge({
  status,
  palette,
}: {
  status: string;
  palette: any;
}) {
  const config: Record<string, { label: string; color: string; icon: string }> = {
    live:     { label: 'LIVE', color: '#34C759', icon: 'radio-outline' },
    degraded: { label: 'DEGRADED', color: '#FF9500', icon: 'warning-outline' },
    offline:  { label: 'OFFLINE', color: '#FF3B30', icon: 'alert-circle-outline' },
    standby:  { label: 'STANDBY', color: palette.textMuted, icon: 'moon-outline' },
  };

  const c = config[status] || config.standby;

  return (
    <View
      style={[
        ecoStyles.statusBadge,
        {
          backgroundColor: c.color + '12',
          borderColor: c.color + '30',
        },
      ]}
    >
      <View style={[ecoStyles.statusDotLive, { backgroundColor: c.color }]} />
      <Text style={[ecoStyles.statusLabel, { color: c.color }]}>
        {c.label}
      </Text>
    </View>
  );
}


// ── EcoFlow telemetry chip ──────────────────────────────────────────────
function EcoFlowChip({
  icon,
  label,
  value,
  valueColor,
  palette,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
  palette: any;
}) {
  return (
    <View style={[ecoStyles.chip, { backgroundColor: palette.border + '30' }]}>
      <Ionicons name={icon} size={13} color={valueColor || palette.amber} />
      <View style={ecoStyles.chipTextBlock}>
        <Text style={[ecoStyles.chipLabel, { color: palette.textMuted }]}>{label}</Text>
        <Text style={[ecoStyles.chipValue, { color: valueColor || palette.text }]}>{value}</Text>
      </View>
    </View>
  );
}

const ecoStyles = StyleSheet.create({
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusDotLive: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 1,
    minWidth: 90,
  },
  chipTextBlock: {
    gap: 1,
  },
  chipLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  chipValue: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
});

// ── Main Screen ─────────────────────────────────────────────────────────
export default function PowerCenterScreen() {
  const router = useRouter();
  const { palette, colors } = useTheme();
  const telemetry = usePowerTelemetry();
  const ecoFlow = useEcoFlowLive();
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);

  // ── Auto-refresh EcoFlow telemetry on screen focus ────────────────
  // When user returns from the device picker, the persisted device ID
  // may have changed. refresh() re-reads it and re-polls immediately.
  useFocusEffect(
    useCallback(() => {
      ecoFlow.refresh();
    }, [ecoFlow.refresh]),
  );

  // ── Per-device state (Phase 3G-2) ─────────────────────────────────
  const [deviceEntries, setDeviceEntries] = useState<DeviceEntry[]>([]);

  // ── Load per-device data ──────────────────────────────────────────
  const loadDeviceData = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      // 1. Try provider diagnostics (will have data when cloud path is active)
      const perDevice = ecoFlowProvider.getPerDeviceTelemetry();

      if (perDevice.length > 0) {
        setDeviceEntries(
          perDevice.map((d) => ({
            deviceId: d.deviceId,
            name: d.name,
            model: d.model,
            socPct: d.socPct,
            wattsIn: d.wattsIn,
            wattsOut: d.wattsOut,
            solarWatts: d.solarWatts,
          })),
        );
        return;
      }

      // 2. Fallback: load selected devices from store (show as "awaiting")
      const selected = await powerDeviceStore.getSelected('EcoFlow');
      if (!mountedRef.current) return;

      if (selected.length > 0) {
        setDeviceEntries(
          selected.map((id) => ({
            deviceId: id,
            name: undefined,
            model: undefined,
            // No telemetry values — cards will show "Idle"
          })),
        );
        return;
      }

      // 3. No devices at all
      setDeviceEntries([]);
    } catch {
      // Silent fail — empty state is fine
      if (mountedRef.current) {
        setDeviceEntries([]);
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadDeviceData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadDeviceData]);

  // Refresh device data when telemetry updates (provider may have new per-device data)
  useEffect(() => {
    loadDeviceData();
  }, [telemetry, loadDeviceData]);

  // Pull-to-refresh — also triggers EcoFlow re-poll
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadDeviceData();
    ecoFlow.refresh();
    setTimeout(() => setRefreshing(false), 800);
  }, [loadDeviceData, ecoFlow.refresh]);

  // ── Derive display values ───────────────────────────────────────────
  const bat = telemetry?.battery;
  const sol = telemetry?.solar;
  const flags = telemetry?.flags;
  const device = telemetry?.device;
  const source = telemetry?.source;
  const ts = telemetry?.timestamp;

  const isStale = flags?.stale === true;
  const isCharging = flags?.charging === true;
  const isSimulator = source === 'sim' || source === 'cloud'; // cloud includes sim mode
  const hasTelemetry = telemetry !== null;

  // ── System capacity from connected devices (Phase 3H-3) ─────────────
  // Aggregate capacity across all device entries using model-name lookup.
  // Falls back to DEV_DEFAULT_CAPACITY_WH when no devices have a known model.
  const systemCapacityWh = useMemo(
    () => computeSystemCapacity(deviceEntries) ?? DEV_DEFAULT_CAPACITY_WH,
    [deviceEntries],
  );

  // ── EcoFlow provider status (Phase 4B / V1.1) ────────────────────────
  // Determine the provider card display based on useEcoFlowLive state.
  // V1.1: status is now 'standby' | 'live' | 'degraded' | 'offline'
  const getEcoFlowProviderDisplay = () => {
    const isLive = ecoFlow.status === 'live';
    const isDegraded = ecoFlow.status === 'degraded';
    const isOffline = ecoFlow.status === 'offline';
    const isStandbyEco = ecoFlow.status === 'standby';

    // Status color for the main dot
    const dotColor = isLive
      ? '#34C759'
      : isDegraded
        ? '#FF9500'
        : isOffline
          ? '#FF3B30'
          : palette.textMuted;

    // Status text
    let statusText = 'Standby';
    if (isLive) {
      statusText = ecoFlow.deviceName
        ? `Live — ${ecoFlow.deviceName}`
        : 'Live';
    } else if (isDegraded) {
      statusText = ecoFlow.deviceName
        ? `Degraded — ${ecoFlow.deviceName}`
        : 'Connection unstable';
    } else if (isOffline) {
      statusText = ecoFlow.error || 'Offline';
    } else if (isStandbyEco) {
      statusText = ecoFlow.error || 'EcoFlow not configured';
    }

    return { dotColor, statusText, isLive };
  };

  const ecoDisplay = getEcoFlowProviderDisplay();

  // Determine provider status text (legacy — for non-EcoFlow providers)
  const getProviderStatus = (): { text: string; color: string; icon: string } => {
    if (!hasTelemetry) {
      return { text: 'No Data', color: palette.textMuted, icon: 'radio-outline' };
    }
    if (isStale) {
      return { text: 'Stale / Pending', color: '#FF9500', icon: 'time-outline' };
    }
    if (device?.vendor === 'EcoFlow' || device?.vendor === 'Mock') {
      // Check if this is simulation
      if (device?.id === 'mock-dev' || device?.firmware) {
        return { text: 'Simulator Active', color: '#5AC8FA', icon: 'pulse-outline' };
      }
      if (device?.id?.includes('aggregate')) {
        return { text: 'Multi-Device Connected', color: '#34C759', icon: 'git-merge-outline' };
      }
      return { text: 'Connected', color: '#34C759', icon: 'checkmark-circle-outline' };
    }
    return { text: 'Active', color: '#34C759', icon: 'checkmark-circle-outline' };
  };

  const providerStatus = getProviderStatus();

  // Format last update time
  const lastUpdate = ts
    ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '--:--:--';

  // Format EcoFlow last poll time (V1.1: lastUpdatedAt replaces lastPollAt)
  const ecoLastPoll = ecoFlow.lastUpdatedAt
    ? new Date(ecoFlow.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : null;


  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {/* ── Header ──────────────────────────────────────────── */}
      <View style={[styles.header, { backgroundColor: palette.panel }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={22} color={palette.amber} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: palette.textMuted }]}>
            ECS SYSTEMS
          </Text>
          <Text style={[styles.headerTitle, { color: palette.text }]}>
            POWER CENTER
          </Text>
        </View>
        <View style={styles.headerRight}>
          {isStale && (
            <View style={[styles.staleBadgeHeader, { backgroundColor: '#FF9500' + '20', borderColor: '#FF9500' + '40' }]}>
              <Ionicons name="warning-outline" size={12} color="#FF9500" />
            </View>
          )}
        </View>
        {/* Gold rail */}
        <View style={[styles.goldRail, { backgroundColor: GOLD_RAIL.major }]} />
      </View>

      {/* ── Content ─────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={palette.amber}
            colors={[palette.amber]}
          />
        }
        >
          {/* ── Power Flow Diagram ──────────────────────────── */}
          <View style={[styles.flowDiagramCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            <Text style={[styles.flowDiagramTitle, { color: palette.amber }]}>
              ENERGY FLOW
            </Text>
            <View style={[styles.flowDiagramDivider, { backgroundColor: GOLD_RAIL.section }]} />
            <PowerFlowDiagram
              socPct={bat?.socPct}
              wattsIn={bat?.wattsIn}
              wattsOut={bat?.wattsOut}
              solarWatts={sol?.watts}
              isStale={isStale}
              palette={palette}
            />
          </View>

          {/* ── Power Forecast Panel (Phase 3H-2 / 3H-3) ──────── */}
          <PowerForecastPanel
            socPct={bat?.socPct}
            wattsIn={bat?.wattsIn}
            wattsOut={bat?.wattsOut}
            capacityWh={systemCapacityWh}
            stale={isStale}
            palette={palette}
          />

          {/* ── Power Events Panel (Phase 3I-3) ────────────────── */}
          <PowerEventsPanel palette={palette} />

          {/* ── Device Contribution Panel (Phase 3G-2) ──────── */}
          <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: GOLD_RAIL.section }]}>
            DEVICES
          </Text>


          {deviceEntries.length > 0 ? (
            <View style={styles.deviceList}>
              {deviceEntries.map((entry) => (
                <PowerDeviceCard
                  key={entry.deviceId}
                  name={entry.name}
                  model={entry.model}
                  deviceId={entry.deviceId}
                  socPct={entry.socPct}
                  wattsIn={entry.wattsIn}
                  wattsOut={entry.wattsOut}
                  solarWatts={entry.solarWatts}
                  palette={palette}
                />
              ))}
            </View>
          ) : (
            <View style={[styles.deviceEmptyCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
              <Ionicons name="hardware-chip-outline" size={28} color={palette.textMuted} />
              <Text style={[styles.deviceEmptyText, { color: palette.textMuted }]}>
                No device telemetry available
              </Text>
              <Text style={[styles.deviceEmptyHint, { color: palette.textMuted }]}>
                Select devices in Manage Devices to see per-device contributions here.
              </Text>
            </View>
          )}

          {/* ── SOC Hero Card ─────────────────────────────────── */}

        <View style={[styles.heroCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <View style={styles.heroTop}>
            <View style={styles.heroLeft}>
              <Text style={[styles.heroLabel, { color: palette.textMuted }]}>
                BATTERY
              </Text>
              <View style={styles.heroValueRow}>
                <Text
                  style={[
                    styles.heroValue,
                    { color: socColor(bat?.socPct, palette) },
                  ]}
                >
                  {bat?.socPct !== undefined ? `${bat.socPct.toFixed(1)}` : '--'}
                </Text>
                <Text style={[styles.heroUnit, { color: palette.textMuted }]}>%</Text>
              </View>
              <SOCBar soc={bat?.socPct} palette={palette} />
            </View>

            <View style={styles.heroRight}>
              {/* Charging indicator */}
              <View
                style={[
                  styles.chargingBadge,
                  {
                    backgroundColor: isCharging
                      ? '#34C759' + '15'
                      : palette.border + '40',
                    borderColor: isCharging
                      ? '#34C759' + '40'
                      : palette.border,
                  },
                ]}
              >
                <Ionicons
                  name={isCharging ? 'flash' : 'flash-outline'}
                  size={16}
                  color={isCharging ? '#34C759' : palette.textMuted}
                />
                <Text
                  style={[
                    styles.chargingText,
                    { color: isCharging ? '#34C759' : palette.textMuted },
                  ]}
                >
                  {isCharging ? 'CHARGING' : 'DISCHARGING'}
                </Text>
              </View>

              {/* Device model */}
              <Text style={[styles.deviceModel, { color: palette.textMuted }]}>
                {device?.model || device?.vendor || 'Unknown'}
              </Text>

              {/* Last update */}
              <Text style={[styles.lastUpdate, { color: palette.textMuted }]}>
                {lastUpdate}
              </Text>
            </View>
          </View>

          {/* Stale banner */}
          {isStale && (
            <View style={[styles.staleBanner, { backgroundColor: '#FF9500' + '10', borderColor: '#FF9500' + '30' }]}>
              <Ionicons name="warning-outline" size={14} color="#FF9500" />
              <Text style={[styles.staleBannerText, { color: '#FF9500' }]}>
                Telemetry data is stale — waiting for fresh readings
              </Text>
            </View>
          )}
        </View>

        {/* ── Live Telemetry Section ────────────────────────── */}
        <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: GOLD_RAIL.section }]}>
          LIVE TELEMETRY
        </Text>

        <View style={[styles.telemetryCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <TelemetryStat
            icon="battery-half-outline"
            label="SOC"
            value={bat?.socPct !== undefined ? `${bat.socPct.toFixed(1)}%` : '--'}
            valueColor={socColor(bat?.socPct, palette)}
            palette={palette}
          />
          <TelemetryStat
            icon="arrow-down-outline"
            label="Watts In"
            value={fmtWatts(bat?.wattsIn)}
            valueColor={bat?.wattsIn && bat.wattsIn > 0 ? '#34C759' : undefined}
            palette={palette}
          />
          <TelemetryStat
            icon="arrow-up-outline"
            label="Watts Out"
            value={fmtWatts(bat?.wattsOut)}
            valueColor={bat?.wattsOut && bat.wattsOut > 50 ? '#FF9500' : undefined}
            palette={palette}
          />
          <TelemetryStat
            icon="sunny-outline"
            label="Solar"
            value={fmtWatts(sol?.watts)}
            valueColor={sol?.watts && sol.watts > 0 ? '#FFD700' : undefined}
            palette={palette}
          />
          <TelemetryStat
            icon="speedometer-outline"
            label="Voltage"
            value={fmtVolts(bat?.volts)}
            palette={palette}
          />
          <TelemetryStat
            icon="thermometer-outline"
            label="Temperature"
            value={fmtTemp(bat?.tempC)}
            palette={palette}
          />
          <TelemetryStat
            icon="time-outline"
            label="Est. Runtime"
            value={fmtRuntime(bat?.estRuntimeMin)}
            palette={palette}
          />
          {/* Last row — no bottom border */}
          <View style={styles.lastStatRow}>
            <Ionicons name="radio-outline" size={16} color={palette.amber} />
            <Text style={[statStyles.label, { color: palette.textMuted }]}>SOURCE</Text>
            <Text style={[statStyles.value, { color: palette.text, fontSize: 13 }]}>
              {source?.toUpperCase() || '--'}
            </Text>
          </View>
        </View>

        {/* ── Flags Section ─────────────────────────────────── */}
        <View style={[styles.flagsRow]}>
          {[
            {
              label: 'Charging',
              active: flags?.charging === true,
              icon: 'flash-outline',
              activeColor: '#34C759',
            },
            {
              label: 'Inverter',
              active: flags?.inverterOn === true,
              icon: 'power-outline',
              activeColor: '#5AC8FA',
            },
            {
              label: 'Low Battery',
              active: flags?.lowBattery === true,
              icon: 'battery-dead-outline',
              activeColor: '#FF3B30',
            },
            {
              label: 'Stale',
              active: flags?.stale === true,
              icon: 'time-outline',
              activeColor: '#FF9500',
            },
          ].map((flag) => (
            <View
              key={flag.label}
              style={[
                styles.flagChip,
                {
                  backgroundColor: flag.active
                    ? flag.activeColor + '15'
                    : palette.panel,
                  borderColor: flag.active
                    ? flag.activeColor + '40'
                    : palette.border,
                },
              ]}
            >
              <Ionicons
                name={flag.icon}
                size={14}
                color={flag.active ? flag.activeColor : palette.textMuted}
              />
              <Text
                style={[
                  styles.flagLabel,
                  { color: flag.active ? flag.activeColor : palette.textMuted },
                ]}
              >
                {flag.label}
              </Text>
            </View>
          ))}
        </View>

        {/* ── Provider Section (Phase 4B — EcoFlow Live) ────── */}
        <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: GOLD_RAIL.section }]}>
          PROVIDER
        </Text>

        <View style={[styles.providerCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          {/* ── Main provider row ──────────────────────────────── */}
          <View style={styles.providerRow}>
            <View style={[styles.providerIcon, { backgroundColor: palette.amber + '12' }]}>
              <Ionicons name="flash" size={22} color={palette.amber} />
            </View>
            <View style={styles.providerInfo}>
              <Text style={[styles.providerName, { color: palette.text }]}>
                EcoFlow
              </Text>
              <View style={styles.providerStatusRow}>
                <View
                  style={[
                    styles.statusDot,
                    { backgroundColor: ecoDisplay.dotColor },
                  ]}
                />
                <Text
                  style={[
                    styles.providerStatusText,
                    { color: ecoDisplay.dotColor },
                  ]}
                  numberOfLines={1}
                >
                  {ecoDisplay.statusText}
                </Text>
              </View>
            </View>
            <EcoFlowStatusBadge status={ecoFlow.status} palette={palette} />
          </View>

          {/* ── EcoFlow Live Telemetry Chips (visible when LIVE) ── */}
          {ecoDisplay.isLive && (
            <View style={[styles.ecoLiveSection, { borderTopColor: GOLD_RAIL.subsection }]}>
              <View style={styles.ecoChipRow}>
                <EcoFlowChip
                  icon="battery-half-outline"
                  label="BATTERY"
                  value={ecoFlow.batteryPct !== null ? `${ecoFlow.batteryPct}%` : '--'}
                  valueColor={socColor(ecoFlow.batteryPct, palette)}
                  palette={palette}
                />
                <EcoFlowChip
                  icon="sunny-outline"
                  label="SOLAR"
                  value={fmtWatts(ecoFlow.solarWatts)}
                  valueColor={ecoFlow.solarWatts && ecoFlow.solarWatts > 0 ? '#FFD700' : undefined}
                  palette={palette}
                />
              </View>
              <View style={styles.ecoChipRow}>
                <EcoFlowChip
                  icon="arrow-up-outline"
                  label="OUTPUT"
                  value={fmtWatts(ecoFlow.outputWatts)}
                  valueColor={ecoFlow.outputWatts && ecoFlow.outputWatts > 50 ? '#FF9500' : undefined}
                  palette={palette}
                />
                <EcoFlowChip
                  icon="arrow-down-outline"
                  label="INPUT"
                  value={fmtWatts(ecoFlow.inputWatts)}
                  valueColor={ecoFlow.inputWatts && ecoFlow.inputWatts > 0 ? '#34C759' : undefined}
                  palette={palette}
                />
              </View>

              {/* Last poll timestamp */}
              {ecoLastPoll && (
                <View style={styles.ecoTimestampRow}>
                  <Ionicons name="time-outline" size={11} color={palette.textMuted} />
                  <Text style={[styles.ecoTimestamp, { color: palette.textMuted }]}>
                    Last poll: {ecoLastPoll}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Standby / Error message ──────────────────────── */}
          {(ecoFlow.status === 'standby' || ecoFlow.status === 'error') && (
            <View style={[styles.ecoMessageSection, { borderTopColor: GOLD_RAIL.subsection }]}>
              <View style={styles.ecoMessageRow}>
                <Ionicons
                  name={ecoFlow.status === 'error' ? 'alert-circle-outline' : 'information-circle-outline'}
                  size={16}
                  color={ecoFlow.status === 'error' ? '#FF3B30' : palette.textMuted}
                />
                <Text
                  style={[
                    styles.ecoMessageText,
                    {
                      color: ecoFlow.status === 'error' ? '#FF3B30' : palette.textMuted,
                    },
                  ]}
                >
                  {ecoFlow.error || 'EcoFlow not configured'}
                </Text>
              </View>
              {ecoFlow.status === 'standby' && (
                <Text style={[styles.ecoMessageHint, { color: palette.textMuted }]}>
                  Configure your EcoFlow API keys in Supabase secrets, or select a device in Manage Devices.
                </Text>
              )}
            </View>
          )}

          {/* ── Legacy device info (from usePowerTelemetry) ──── */}
          {device && !ecoDisplay.isLive && (
            <View style={[styles.deviceInfoSection, { borderTopColor: GOLD_RAIL.subsection }]}>
              <View style={styles.deviceInfoRow}>
                <Text style={[styles.deviceInfoLabel, { color: palette.textMuted }]}>Device ID</Text>
                <Text style={[styles.deviceInfoValue, { color: palette.text }]}>
                  {device.id || '--'}
                </Text>
              </View>
              {device.model && (
                <View style={styles.deviceInfoRow}>
                  <Text style={[styles.deviceInfoLabel, { color: palette.textMuted }]}>Model</Text>
                  <Text style={[styles.deviceInfoValue, { color: palette.text }]}>
                    {device.model}
                  </Text>
                </View>
              )}
              {device.firmware && (
                <View style={styles.deviceInfoRow}>
                  <Text style={[styles.deviceInfoLabel, { color: palette.textMuted }]}>Firmware</Text>
                  <Text style={[styles.deviceInfoValue, { color: palette.text }]}>
                    {device.firmware}
                  </Text>
                </View>
              )}
              {device.serial && (
                <View style={styles.deviceInfoRow}>
                  <Text style={[styles.deviceInfoLabel, { color: palette.textMuted }]}>Serial</Text>
                  <Text style={[styles.deviceInfoValue, { color: palette.text }]}>
                    {device.serial}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Active device ID (when EcoFlow is live) ──────── */}
          {ecoDisplay.isLive && ecoFlow.selectedDeviceId && (
            <View style={[styles.ecoDeviceIdRow, { borderTopColor: GOLD_RAIL.subsection }]}>
              <Ionicons name="finger-print-outline" size={11} color={palette.textMuted} />
              <Text style={[styles.ecoDeviceIdText, { color: palette.textMuted }]} numberOfLines={1}>
                {ecoFlow.selectedDeviceId}
              </Text>
            </View>
          )}
        </View>

        {/* ── No Telemetry State ────────────────────────────── */}
        {!hasTelemetry && ecoFlow.status !== 'live' && (
          <View style={[styles.emptyCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
            <Ionicons name="battery-dead-outline" size={40} color={palette.textMuted} />
            <Text style={[styles.emptyTitle, { color: palette.text }]}>
              No Telemetry Data
            </Text>
            <Text style={[styles.emptyDesc, { color: palette.textMuted }]}>
              Waiting for power telemetry from a connected device or simulator.
              Ensure a power connector is attached in the app configuration.
            </Text>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: palette.amber, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}
              onPress={() => router.push('/power/setup')}
              activeOpacity={0.7}
            >
              <Ionicons name="add-circle-outline" size={16} color="#000" />
              <Text style={{ color: '#000', fontSize: 12, fontWeight: '800', letterSpacing: 2 }}>ADD POWER SYSTEM</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Phase 8: Power System Management Buttons ───── */}
        <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: GOLD_RAIL.section, marginTop: SPACING.md }]}>
          POWER SYSTEMS
        </Text>

        {/* Add Power System */}
        <TouchableOpacity
          style={[styles.manageBtn, { backgroundColor: palette.amber, marginBottom: SPACING.sm }]}
          onPress={() => router.push('/power/setup')}
          activeOpacity={0.7}
        >
          <Ionicons name="add-circle-outline" size={18} color="#000" />
          <Text style={[styles.manageBtnText, { color: '#000' }]}>ADD POWER SYSTEM</Text>
          <Ionicons name="chevron-forward" size={16} color="#000" />
        </TouchableOpacity>

        {/* Manage Power Systems */}
        <TouchableOpacity
          style={[styles.manageBtn, { backgroundColor: palette.panel, borderWidth: 1, borderColor: palette.amber + '40', marginBottom: SPACING.sm }]}
          onPress={() => router.push('/power/manage')}
          activeOpacity={0.7}
        >
          <Ionicons name="settings-outline" size={18} color={palette.amber} />
          <Text style={[styles.manageBtnText, { color: palette.amber }]}>MANAGE POWER SYSTEMS</Text>
          <Ionicons name="chevron-forward" size={16} color={palette.amber} />
        </TouchableOpacity>

        {/* BLU Power Sources */}
        <TouchableOpacity
          style={[styles.manageBtn, { backgroundColor: '#2196F3', marginBottom: SPACING.md }]}
          onPress={() => router.push('/power/blu')}
          activeOpacity={0.7}
        >
          <Ionicons name="bluetooth-outline" size={18} color="#FFF" />
          <Text style={[styles.manageBtnText, { color: '#FFF' }]}>BLU POWER SOURCES</Text>
          <Ionicons name="chevron-forward" size={16} color="#FFF" />
        </TouchableOpacity>

        {/* ── Supported Power Systems (expanded to 6 providers) ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: SPACING.sm, padding: SPACING.md, borderRadius: RADIUS.md, borderWidth: 1, borderColor: palette.amber + '30', backgroundColor: palette.panel }}>
          <Ionicons name="shield-checkmark-outline" size={18} color={palette.amber} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: palette.text, fontSize: 13, fontWeight: '700', letterSpacing: 0.5 }}>Supported Power Systems</Text>
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {(['EcoFlow', 'Bluetti', 'AnkerSolix', 'Jackery', 'GoalZero', 'Renogy'] as const).map((pid) => {
                const pd = PROVIDER_DISPLAY[pid];
                return (
                  <View key={pid} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: pd.color + '12', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                    <Ionicons name={pd.icon} size={10} color={pd.color} />
                    <Text style={{ color: pd.color, fontSize: 9, fontWeight: '800', letterSpacing: 1 }}>{pd.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}




// ── Styles ───────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingBottom: 14,
    paddingHorizontal: SPACING.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 3,
    marginTop: 2,
  },
  headerRight: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  staleBadgeHeader: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  goldRail: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,
  },

  // ── Content ───────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: 100,
  },

  // ── Flow Diagram Card ─────────────────────────────────────
  flowDiagramCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  flowDiagramTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  flowDiagramDivider: {
    height: 1,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },

  // ── Device Contribution Panel (Phase 3G-2) ────────────────
  deviceList: {
    marginBottom: SPACING.xl,
  },
  deviceEmptyCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.xl,
  },
  deviceEmptyText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1,
  },
  deviceEmptyHint: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
  },

  // ── Hero Card ─────────────────────────────────────────────
  heroCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  heroTop: {
    flexDirection: 'row',
    gap: SPACING.lg,
  },
  heroLeft: {
    flex: 1,
  },
  heroLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 4,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  heroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  heroValue: {
    fontSize: 48,
    fontWeight: '900',
    fontFamily: 'Courier',
    letterSpacing: -1,
  },
  heroUnit: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  heroRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 8,
  },
  chargingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  chargingText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2,
  },
  deviceModel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Courier',
  },
  lastUpdate: {
    fontSize: 11,
    fontFamily: 'Courier',
  },

  // ── Stale banner ──────────────────────────────────────────
  staleBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: SPACING.md,
    padding: SPACING.sm,
    borderRadius: RADIUS.sm,
    borderWidth: 1,
  },
  staleBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },

  // ── Section label ─────────────────────────────────────────
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 4,
    marginBottom: SPACING.md,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    paddingBottom: 8,
    textTransform: 'uppercase',
  },

  // ── Telemetry card ────────────────────────────────────────
  telemetryCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    paddingHorizontal: SPACING.lg,
    paddingTop: 4,
    paddingBottom: 4,
    marginBottom: SPACING.lg,
  },
  lastStatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },

  // ── Flags row ─────────────────────────────────────────────
  flagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: SPACING.xl,
  },
  flagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  flagLabel: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // ── Provider card ─────────────────────────────────────────
  providerCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  providerIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerInfo: {
    flex: 1,
  },
  providerName: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  providerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  providerStatusText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    flex: 1,
  },

  // ── EcoFlow Live Section (Phase 4B) ───────────────────────
  ecoLiveSection: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    gap: 8,
  },
  ecoChipRow: {
    flexDirection: 'row',
    gap: 8,
  },
  ecoTimestampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  ecoTimestamp: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  // ── EcoFlow Message Section ───────────────────────────────
  ecoMessageSection: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    gap: 6,
  },
  ecoMessageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ecoMessageText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  ecoMessageHint: {
    fontSize: 11,
    lineHeight: 16,
    marginLeft: 24,
  },

  // ── EcoFlow Device ID Row ─────────────────────────────────
  ecoDeviceIdRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
  },
  ecoDeviceIdText: {
    flex: 1,
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  // ── Device info ───────────────────────────────────────────
  deviceInfoSection: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
  },
  deviceInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  deviceInfoLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  deviceInfoValue: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Courier',
  },

  // ── Empty state ───────────────────────────────────────────
  emptyCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: 10,
    marginBottom: SPACING.xl,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
  },
  emptyDesc: {
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
  },

  // ── Manage Devices button ─────────────────────────────────
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: RADIUS.md,
  },
  manageBtnText: {
    flex: 1,
    textAlign: 'center',
    color: '#000',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 3,
  },
});




