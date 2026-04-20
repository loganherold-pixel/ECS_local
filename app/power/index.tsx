/**
 * Power Center — Pass 1 simplified structure
 *
 * Structure:
 *   1. System Overview
 *   2. Energy Flow
 *   3. Attached Devices
 *   4. Primary Device Details
 *   5. Actions
 *
 * This pass keeps the existing live telemetry wiring intact while simplifying
 * the hierarchy and reducing the stacked-card clutter.
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
import { SPACING, RADIUS, GOLD_RAIL } from '../../lib/theme';
import { useTheme } from '../../context/ThemeContext';

import { usePowerTelemetry } from '../../src/power/hooks/usePowerTelemetry';
import { useEcoFlowLive, setSelectedEcoFlowDevice } from '../../lib/useEcoFlowLive';
import { resolvePowerReadiness } from '../../lib/powerReadiness';

import PowerFlowDiagram from '../../src/components/power/PowerFlowDiagram';

import { EcoFlowCloudProvider, powerDeviceStore } from '../../src/power';

const ecoFlowProvider = new EcoFlowCloudProvider();

interface DeviceEntry {
  deviceId: string;
  name?: string;
  model?: string;
  productType?: string;
  role?: 'primary' | 'supporting';
  socPct?: number;
  wattsIn?: number;
  wattsOut?: number;
  solarWatts?: number;
  restricted?: boolean;
  restrictionReason?: string | null;
}

function fmtWatts(w: number | undefined | null): string {
  if (w === undefined || w === null) return '--';
  if (Math.abs(w) >= 1000) return `${(w / 1000).toFixed(1)} kW`;
  return `${Math.round(w)} W`;
}

function fmtVolts(v: number | undefined | null): string {
  if (v === undefined || v === null) return '--';
  return `${v.toFixed(1)} V`;
}

function fmtTemp(c: number | undefined | null): string {
  if (c === undefined || c === null) return '--';
  return `${c.toFixed(1)}°C`;
}

function fmtRuntimeMinutes(min: number | undefined | null): string {
  if (min === undefined || min === null) return '--';
  const whole = Math.max(0, Math.round(min));
  if (whole >= 60) {
    const h = Math.floor(whole / 60);
    const m = whole % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${whole}m`;
}

function socColor(soc: number | undefined | null, palette: any): string {
  if (soc === undefined || soc === null) return palette.textMuted;
  if (soc >= 60) return '#34C759';
  if (soc >= 30) return '#FFB800';
  if (soc >= 15) return '#FF9500';
  return '#FF3B30';
}

function titleFromModel(model?: string | null, name?: string | null) {
  if (model && model.trim().length > 0) return model.trim();
  if (name && name.trim().length > 0) return name.trim();
  return 'EcoFlow';
}

function prettyProductType(productType?: string | null) {
  if (!productType) return 'Power Device';
  return productType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function SummaryStat({
  label,
  value,
  palette,
  valueColor,
}: {
  label: string;
  value: string;
  palette: any;
  valueColor?: string;
}) {
  return (
    <View style={[styles.summaryStat, { backgroundColor: palette.border + '22' }]}>
      <Text style={[styles.summaryStatLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[styles.summaryStatValue, { color: valueColor || palette.text }]}>{value}</Text>
    </View>
  );
}

function DetailRow({
  label,
  value,
  palette,
  valueColor,
}: {
  label: string;
  value: string;
  palette: any;
  valueColor?: string;
}) {
  return (
    <View style={[styles.detailRow, { borderBottomColor: GOLD_RAIL.subsection }]}>
      <Text style={[styles.detailLabel, { color: palette.textMuted }]}>{label}</Text>
      <Text style={[styles.detailValue, { color: valueColor || palette.text }]}>{value}</Text>
    </View>
  );
}

export default function PowerCenterScreen() {
  const router = useRouter();
  const { palette, colors } = useTheme();
  const telemetry = usePowerTelemetry();
  const ecoFlow = useEcoFlowLive();
  const ecoFlowRefresh = ecoFlow.refresh;
  const ecoFlowVersion = ecoFlow.version;
  const selectedEcoFlowDeviceId = ecoFlow.selectedDeviceId;

  const [refreshing, setRefreshing] = useState(false);
  const [deviceEntries, setDeviceEntries] = useState<DeviceEntry[]>([]);
  const [expandedDeviceId, setExpandedDeviceId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useFocusEffect(
    useCallback(() => {
      ecoFlowRefresh();
    }, [ecoFlowRefresh]),
  );

  const loadDeviceData = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      const perDevice = ecoFlowProvider.getPerDeviceTelemetry();
      const selectedIds = await powerDeviceStore.getSelected('EcoFlow');
      const selectedId = ecoFlow.selectedDeviceId ?? selectedIds[0] ?? null;

      if (perDevice.length > 0) {
        const mapped = perDevice.map((d: any) => {
          const restricted =
            typeof d?.error === 'string' &&
            d.error.toLowerCase().includes('not allowed');

          return {
            deviceId: d.deviceId,
            name: d.name,
            model: d.model,
            productType: d.productType,
            role: d.deviceId === selectedId ? 'primary' : 'supporting',
            socPct: d.socPct,
            wattsIn: d.wattsIn,
            wattsOut: d.wattsOut,
            solarWatts: d.solarWatts,
            restricted,
            restrictionReason: restricted ? 'Cloud access unavailable for this device.' : d.error ?? null,
          } as DeviceEntry;
        });

        if (mountedRef.current) setDeviceEntries(mapped);
        return;
      }

      const catalog = await ecoFlowProvider.listDevices();
      const selectedSet = new Set(selectedIds);

      const fallbackEntries: DeviceEntry[] = catalog.map((item) => ({
        deviceId: item.deviceId,
        name: item.name,
        model: item.model,
        productType: item.productType,
        role: item.deviceId === selectedId ? 'primary' : selectedSet.has(item.deviceId) ? 'supporting' : 'supporting',
        socPct: item.deviceId === selectedId ? ecoFlow.batteryPct ?? undefined : undefined,
        wattsIn: item.deviceId === selectedId ? ecoFlow.inputWatts ?? undefined : undefined,
        wattsOut: item.deviceId === selectedId ? ecoFlow.outputWatts ?? undefined : undefined,
        solarWatts: item.deviceId === selectedId ? ecoFlow.solarWatts ?? undefined : undefined,
      }));

      if (selectedId && !fallbackEntries.find((item) => item.deviceId === selectedId)) {
        fallbackEntries.unshift({
          deviceId: selectedId,
          name: ecoFlow.deviceName || 'Selected EcoFlow Device',
          model: titleFromModel(undefined, ecoFlow.deviceName || undefined),
          role: 'primary',
          socPct: ecoFlow.batteryPct ?? undefined,
          wattsIn: ecoFlow.inputWatts ?? undefined,
          wattsOut: ecoFlow.outputWatts ?? undefined,
          solarWatts: ecoFlow.solarWatts ?? undefined,
        });
      }

      if (mountedRef.current) setDeviceEntries(fallbackEntries);
    } catch {
      if (mountedRef.current) setDeviceEntries([]);
    }
  }, [
    ecoFlow.selectedDeviceId,
    ecoFlow.deviceName,
    ecoFlow.batteryPct,
    ecoFlow.inputWatts,
    ecoFlow.outputWatts,
    ecoFlow.solarWatts,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    void loadDeviceData();
    return () => {
      mountedRef.current = false;
    };
  }, [loadDeviceData]);

  useEffect(() => {
    void loadDeviceData();
  }, [telemetry, ecoFlowVersion, loadDeviceData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void loadDeviceData();
    void ecoFlowRefresh();
    setTimeout(() => setRefreshing(false), 800);
  }, [loadDeviceData, ecoFlowRefresh]);

  const handleMakePrimary = useCallback(
    async (entry: DeviceEntry) => {
      if (!entry?.deviceId) return;

      setSelectedEcoFlowDevice(entry.deviceId, entry.name ?? entry.model ?? null);

      if (mountedRef.current) {
        setDeviceEntries((prev) =>
          prev.map((item) => ({
            ...item,
            role: item.deviceId === entry.deviceId ? 'primary' : 'supporting',
          })),
        );
        setExpandedDeviceId(entry.deviceId);
      }

      await ecoFlowRefresh();
      await loadDeviceData();
    },
    [ecoFlowRefresh, loadDeviceData],
  );

  const bat = telemetry?.battery;
  const sol = telemetry?.solar;
  const flags = telemetry?.flags;

  const selectedDeviceEntry = useMemo(() => {
    if (selectedEcoFlowDeviceId) {
      const exact = deviceEntries.find((entry) => entry.deviceId === selectedEcoFlowDeviceId);
      if (exact) return exact;
    }
    return deviceEntries.find((entry) => entry.role === 'primary') ?? deviceEntries[0] ?? null;
  }, [deviceEntries, selectedEcoFlowDeviceId]);

  const attachedDevices = useMemo(() => {
    if (!selectedDeviceEntry) return deviceEntries;
    return [
      selectedDeviceEntry,
      ...deviceEntries.filter((entry) => entry.deviceId !== selectedDeviceEntry.deviceId),
    ];
  }, [deviceEntries, selectedDeviceEntry]);

  const selectedSoc = selectedDeviceEntry?.socPct ?? ecoFlow.batteryPct ?? bat?.socPct;
  const selectedWattsIn = selectedDeviceEntry?.wattsIn ?? ecoFlow.inputWatts ?? bat?.wattsIn;
  const selectedWattsOut = selectedDeviceEntry?.wattsOut ?? ecoFlow.outputWatts ?? bat?.wattsOut;
  const selectedSolarWatts = selectedDeviceEntry?.solarWatts ?? ecoFlow.solarWatts ?? sol?.watts;

  const totalInput = attachedDevices.reduce((sum, entry) => sum + (entry.wattsIn ?? 0), 0) || (selectedWattsIn ?? 0);
  const totalOutput = attachedDevices.reduce((sum, entry) => sum + (entry.wattsOut ?? 0), 0) || (selectedWattsOut ?? 0);
  const totalSolar = attachedDevices.reduce((sum, entry) => sum + (entry.solarWatts ?? 0), 0) || (selectedSolarWatts ?? 0);
  const netFlow = totalInput + totalSolar - totalOutput;

  const ecoCfg = resolvePowerReadiness({
    providerId: 'EcoFlow',
    connectionMethod: 'cloud',
    connectionState:
      ecoFlow.status === 'live'
        ? 'connected'
        : ecoFlow.status === 'degraded'
          ? 'reconnecting'
          : ecoFlow.status === 'offline'
            ? (attachedDevices.length > 0 ? 'disconnected' : 'unavailable')
            : 'unavailable',
    hasTelemetry: attachedDevices.some(
      (entry) => entry.socPct != null || entry.wattsIn != null || entry.wattsOut != null,
    ),
    hasStoredSnapshot: attachedDevices.length > 0,
  });
  const selectedTitle = titleFromModel(
    selectedDeviceEntry?.model ?? undefined,
    selectedDeviceEntry?.name ?? ecoFlow.deviceName,
  );

  const heroStateText = (() => {
    if (ecoCfg.state === 'unavailable') return 'Provider unavailable';
    if (ecoCfg.state === 'partial') return 'Provider state limited';
    if (netFlow > 30) return 'Charging from external source';
    if (netFlow < -30) return 'Discharging under load';
    return 'Power state balanced';
  })();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.header, { backgroundColor: palette.panel }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.7}>
          <Ionicons name="chevron-back" size={22} color={palette.amber} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={[styles.headerLabel, { color: palette.textMuted }]}>ECS SYSTEMS</Text>
          <Text style={[styles.headerTitle, { color: palette.text }]}>POWER CENTER</Text>
        </View>

        <TouchableOpacity
          style={[styles.headerAction, { borderColor: palette.border, backgroundColor: palette.border + '18' }]}
          onPress={() => router.push('/power/devices')}
          activeOpacity={0.75}
        >
          <Ionicons name="hardware-chip-outline" size={16} color={palette.amber} />
        </TouchableOpacity>

        <View style={[styles.goldRail, { backgroundColor: GOLD_RAIL.major }]} />
      </View>

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
        <View style={[styles.heroCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <View style={styles.heroTop}>
            <View style={styles.heroLeft}>
              <Text style={[styles.heroEyebrow, { color: palette.textMuted }]}>SYSTEM OVERVIEW</Text>
              <Text style={[styles.heroTitle, { color: palette.text }]}>{heroStateText}</Text>
              <Text style={[styles.heroCaption, { color: palette.textMuted }]}>
                Live, limited, or unavailable provider state with attached-device context.
              </Text>
              <View style={styles.heroStatusRow}>
                <View style={[styles.statusPill, { backgroundColor: ecoCfg.color + '12', borderColor: ecoCfg.color + '28' }]}>
                  <Ionicons name={ecoCfg.icon as any} size={13} color={ecoCfg.color} />
                  <Text style={[styles.statusPillText, { color: ecoCfg.color }]}>{ecoCfg.label}</Text>
                </View>
                <Text style={[styles.heroSubtext, { color: palette.textMuted }]}>
                  {attachedDevices.length} system{attachedDevices.length === 1 ? '' : 's'} · {ecoCfg.summary}
                </Text>
              </View>
            </View>

            <View style={styles.heroRight}>
              <Text style={[styles.heroNetLabel, { color: palette.textMuted }]}>NET FLOW</Text>
              <Text style={[styles.heroNetValue, { color: netFlow >= 0 ? '#34C759' : '#FF9500' }]}>
                {netFlow >= 0 ? '+' : ''}{fmtWatts(netFlow)}
              </Text>
            </View>
          </View>

          <View style={styles.summaryGrid}>
            <SummaryStat
              label="TOTAL INPUT"
              value={fmtWatts(totalInput + totalSolar)}
              valueColor={totalInput + totalSolar > 0 ? '#34C759' : undefined}
              palette={palette}
            />
            <SummaryStat
              label="TOTAL OUTPUT"
              value={fmtWatts(totalOutput)}
              valueColor={totalOutput > 0 ? '#FF9500' : undefined}
              palette={palette}
            />
            <SummaryStat
              label="PRIMARY SOC"
              value={selectedSoc != null ? `${Math.round(selectedSoc)}%` : '--'}
              valueColor={socColor(selectedSoc, palette)}
              palette={palette}
            />
            <SummaryStat
              label="PRIMARY DEVICE"
              value={selectedTitle}
              palette={palette}
            />
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: GOLD_RAIL.section }]}>
          ENERGY FLOW
        </Text>

        <View style={[styles.flowCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <Text style={[styles.flowIntro, { color: palette.textMuted }]}>
            Source → Battery → Loads
          </Text>

          <PowerFlowDiagram
            socPct={selectedSoc}
            wattsIn={selectedWattsIn}
            wattsOut={selectedWattsOut}
            solarWatts={selectedSolarWatts}
            isStale={flags?.stale === true}
            palette={palette}
          />

          <View style={styles.flowFooter}>
            <View style={styles.flowCol}>
              <Text style={[styles.flowLabel, { color: palette.textMuted }]}>SOURCE</Text>
              <Text style={[styles.flowValue, { color: palette.text }]}>
                {fmtWatts(totalInput + totalSolar)}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={palette.amber} />
            <View style={styles.flowCol}>
              <Text style={[styles.flowLabel, { color: palette.textMuted }]}>BATTERY</Text>
              <Text style={[styles.flowValue, { color: socColor(selectedSoc, palette) }]}>
                {selectedSoc != null ? `${Math.round(selectedSoc)}%` : '--'}
              </Text>
            </View>
            <Ionicons name="arrow-forward" size={18} color={palette.amber} />
            <View style={styles.flowCol}>
              <Text style={[styles.flowLabel, { color: palette.textMuted }]}>LOADS</Text>
              <Text style={[styles.flowValue, { color: palette.text }]}>
                {fmtWatts(totalOutput)}
              </Text>
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: GOLD_RAIL.section }]}>
          ATTACHED SYSTEMS
        </Text>

        <View style={styles.deviceList}>
          {attachedDevices.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
              <Ionicons name="hardware-chip-outline" size={26} color={palette.textMuted} />
              <Text style={[styles.emptyTitle, { color: palette.text }]}>No attached devices</Text>
              <Text style={[styles.emptyHint, { color: palette.textMuted }]}>
                Add a provider to start viewing connected, partial, or manual power state.
              </Text>
            </View>
          ) : attachedDevices.map((entry) => {
            const isPrimary = selectedDeviceEntry?.deviceId === entry.deviceId;
            const isExpanded = expandedDeviceId === entry.deviceId;
            const title = titleFromModel(entry.model, entry.name);
            const restricted = entry.restricted === true;
            const statusText = restricted ? 'Restricted' : isPrimary ? 'Primary' : 'Attached';
            const statusColor = restricted ? '#FF9500' : isPrimary ? '#34C759' : palette.textMuted;

            return (
              <View
                key={entry.deviceId}
                style={[styles.deviceCard, { backgroundColor: palette.panel, borderColor: palette.border }]}
              >
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => setExpandedDeviceId((prev) => (prev === entry.deviceId ? null : entry.deviceId))}
                  style={styles.deviceRow}
                >
                  <View style={styles.deviceLeft}>
                    <View
                      style={[
                        styles.deviceIcon,
                        { backgroundColor: isPrimary ? '#34C75914' : palette.border + '35' },
                      ]}
                    >
                      <Ionicons
                        name={restricted ? 'alert-circle-outline' : isPrimary ? 'flash-outline' : 'hardware-chip-outline'}
                        size={18}
                        color={restricted ? '#FF9500' : isPrimary ? '#34C759' : palette.amber}
                      />
                    </View>

                    <View style={styles.deviceIdentity}>
                      <View style={styles.deviceTitleRow}>
                        <Text style={[styles.deviceTitle, { color: palette.text }]}>{title}</Text>
                        <View
                          style={[
                            styles.deviceStatusPill,
                            {
                              backgroundColor: statusColor + '12',
                              borderColor: statusColor + '28',
                            },
                          ]}
                        >
                          <Text style={[styles.deviceStatusText, { color: statusColor }]}>{statusText}</Text>
                        </View>
                      </View>
                      <Text style={[styles.deviceSubtitle, { color: palette.textMuted }]}>
                        {prettyProductType(entry.productType)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.deviceRight}>
                    <View style={styles.deviceMetric}>
                      <Text style={[styles.deviceMetricValue, { color: socColor(entry.socPct, palette) }]}>
                        {entry.socPct != null ? `${Math.round(entry.socPct)}%` : '--'}
                      </Text>
                      <Text style={[styles.deviceMetricLabel, { color: palette.textMuted }]}>SOC</Text>
                    </View>
                    <View style={styles.deviceMetric}>
                      <Text style={[styles.deviceMetricValue, { color: palette.text }]}>
                        {fmtWatts(entry.wattsIn)}
                      </Text>
                      <Text style={[styles.deviceMetricLabel, { color: palette.textMuted }]}>IN</Text>
                    </View>
                    <View style={styles.deviceMetric}>
                      <Text style={[styles.deviceMetricValue, { color: palette.text }]}>
                        {fmtWatts(entry.wattsOut)}
                      </Text>
                      <Text style={[styles.deviceMetricLabel, { color: palette.textMuted }]}>OUT</Text>
                    </View>
                    <Ionicons
                      name={isExpanded ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color={palette.textMuted}
                    />
                  </View>
                </TouchableOpacity>

                {isExpanded && (
                  <View style={[styles.deviceExpanded, { borderTopColor: GOLD_RAIL.subsection }]}>
                    <Text style={[styles.expandedLabel, { color: palette.textMuted }]}>DEVICE SNAPSHOT</Text>
                    {restricted ? (
                      <View style={[styles.restrictedBox, { backgroundColor: '#FF950012', borderColor: '#FF950030' }]}>
                        <Ionicons name="warning-outline" size={16} color="#FF9500" />
                        <Text style={[styles.restrictedText, { color: '#FF9500' }]}>
                          {entry.restrictionReason || 'Cloud access unavailable for this device.'}
                        </Text>
                      </View>
                    ) : (
                      <>
                        <View style={styles.summaryGrid}>
                          <SummaryStat
                            label="INPUT"
                            value={fmtWatts(entry.wattsIn)}
                            valueColor={entry.wattsIn && entry.wattsIn > 0 ? '#34C759' : undefined}
                            palette={palette}
                          />
                          <SummaryStat
                            label="OUTPUT"
                            value={fmtWatts(entry.wattsOut)}
                            valueColor={entry.wattsOut && entry.wattsOut > 0 ? '#FF9500' : undefined}
                            palette={palette}
                          />
                          <SummaryStat
                            label="SOLAR"
                            value={fmtWatts(entry.solarWatts)}
                            valueColor={entry.solarWatts && entry.solarWatts > 0 ? '#FFD700' : undefined}
                            palette={palette}
                          />
                          <SummaryStat
                            label="SOC"
                            value={entry.socPct != null ? `${Math.round(entry.socPct)}%` : '--'}
                            valueColor={socColor(entry.socPct, palette)}
                            palette={palette}
                          />
                        </View>

                        {!isPrimary && (
                          <TouchableOpacity
                            activeOpacity={0.78}
                            onPress={() => handleMakePrimary(entry)}
                            style={[styles.makePrimaryBtn, { borderColor: palette.amber + '40', backgroundColor: palette.border + '20' }]}
                          >
                            <Ionicons name="swap-up-outline" size={14} color={palette.amber} />
                            <Text style={[styles.makePrimaryBtnText, { color: palette.amber }]}>MAKE PRIMARY</Text>
                          </TouchableOpacity>
                        )}
                      </>
                    )}

                    <Text style={[styles.deviceIdText, { color: palette.textMuted }]}>
                      {entry.deviceId}
                    </Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {selectedDeviceEntry && (
          <>
            <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: GOLD_RAIL.section }]}>
              DEVICE DETAILS
            </Text>

            <View style={[styles.detailsCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
              <View style={styles.detailsHeader}>
                <View>
                  <Text style={[styles.detailsTitle, { color: palette.text }]}>{selectedTitle}</Text>
                  <Text style={[styles.detailsSubtitle, { color: palette.textMuted }]}>
                    {selectedDeviceEntry.deviceId}
                  </Text>
                </View>

                <View style={[styles.statusPill, { backgroundColor: ecoCfg.color + '12', borderColor: ecoCfg.color + '28' }]}>
                  <Ionicons name={ecoCfg.icon} size={13} color={ecoCfg.color} />
                  <Text style={[styles.statusPillText, { color: ecoCfg.color }]}>{ecoCfg.label}</Text>
                </View>
              </View>

              <Text style={[styles.detailsIntro, { color: palette.textMuted }]}>
                Focused view of the current primary asset and its live operating state.
              </Text>

              <DetailRow
                label="Battery"
                value={selectedSoc != null ? `${Math.round(selectedSoc)}%` : '--'}
                palette={palette}
                valueColor={socColor(selectedSoc, palette)}
              />
              <DetailRow
                label="Input"
                value={fmtWatts(selectedWattsIn)}
                palette={palette}
                valueColor={selectedWattsIn && selectedWattsIn > 0 ? '#34C759' : undefined}
              />
              <DetailRow
                label="Output"
                value={fmtWatts(selectedWattsOut)}
                palette={palette}
                valueColor={selectedWattsOut && selectedWattsOut > 0 ? '#FF9500' : undefined}
              />
              <DetailRow
                label="Solar"
                value={fmtWatts(selectedSolarWatts)}
                palette={palette}
                valueColor={selectedSolarWatts && selectedSolarWatts > 0 ? '#FFD700' : undefined}
              />
              <DetailRow label="Voltage" value={fmtVolts(bat?.volts)} palette={palette} />
              <DetailRow label="Temperature" value={fmtTemp(bat?.tempC)} palette={palette} />
              <DetailRow label="Runtime" value={fmtRuntimeMinutes(bat?.estRuntimeMin)} palette={palette} />
              <DetailRow label="Telemetry Age" value={ecoFlow.updatedAgoText || '--'} palette={palette} />
            </View>
          </>
        )}

        <Text style={[styles.sectionLabel, { color: palette.amber, borderBottomColor: GOLD_RAIL.section }]}>
          POWER ACTIONS
        </Text>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: palette.amber }]}
          onPress={() => router.push('/power/devices')}
          activeOpacity={0.76}
        >
          <Ionicons name="hardware-chip-outline" size={18} color="#000" />
          <Text style={[styles.actionBtnText, { color: '#000' }]}>MANAGE DEVICES</Text>
          <Ionicons name="chevron-forward" size={16} color="#000" />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: palette.panel, borderColor: palette.amber + '35', borderWidth: 1 }]}
          onPress={() => router.push('/power/manage')}
          activeOpacity={0.76}
        >
          <Ionicons name="settings-outline" size={18} color={palette.amber} />
          <Text style={[styles.actionBtnText, { color: palette.amber }]}>MANAGE SYSTEMS</Text>
          <Ionicons name="chevron-forward" size={16} color={palette.amber} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#2196F3' }]}
          onPress={() => router.push('/power/blu')}
          activeOpacity={0.76}
        >
          <Ionicons name="bluetooth-outline" size={18} color="#FFF" />
          <Text style={[styles.actionBtnText, { color: '#FFF' }]}>BLU SOURCES</Text>
          <Ionicons name="chevron-forward" size={16} color="#FFF" />
        </TouchableOpacity>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

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
  headerAction: {
    width: 36,
    height: 36,
    borderRadius: 10,
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

  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: SPACING.lg,
    paddingBottom: SPACING.xl,
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 3,
    textTransform: 'uppercase',
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    paddingBottom: 8,
    marginBottom: SPACING.md,
  },

  heroCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  heroLeft: {
    flex: 1,
  },
  heroRight: {
    alignItems: 'flex-end',
    minWidth: 110,
  },
  heroEyebrow: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 0.6,
    marginTop: 6,
  },
  heroCaption: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    maxWidth: '92%',
  },
  heroStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  heroSubtext: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  heroNetLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  heroNetValue: {
    fontSize: 28,
    fontWeight: '900',
    marginTop: 6,
    textAlign: 'right',
  },

  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.3,
  },

  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: SPACING.md,
  },
  summaryStat: {
    flexGrow: 1,
    minWidth: '47%',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  summaryStatLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  summaryStatValue: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 4,
  },

  flowCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  flowIntro: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  flowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: SPACING.md,
  },
  flowCol: {
    flex: 1,
    alignItems: 'center',
  },
  flowLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  flowValue: {
    fontSize: 14,
    fontWeight: '800',
    marginTop: 6,
    textAlign: 'center',
  },

  deviceList: {
    gap: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  deviceCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOpacity: 0,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  deviceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  deviceRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  deviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deviceIdentity: {
    flex: 1,
    gap: 4,
  },
  deviceTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  deviceTitle: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  deviceSubtitle: {
    fontSize: 11,
    fontWeight: '600',
  },
  deviceStatusPill: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  deviceStatusText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  deviceMetric: {
    alignItems: 'flex-end',
    minWidth: 48,
  },
  deviceMetricValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  deviceMetricLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  deviceExpanded: {
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: 10,
  },
  expandedLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  },
  restrictedBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  restrictedText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  makePrimaryBtn: {
    marginTop: 2,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  makePrimaryBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
  },
  deviceIdText: {
    fontSize: 10,
    fontFamily: 'Courier',
    letterSpacing: 0.4,
  },

  detailsCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.lg,
    marginBottom: SPACING.xl,
  },
  detailsHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: SPACING.sm,
  },
  detailsIntro: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  detailsSubtitle: {
    fontSize: 10,
    fontFamily: 'Courier',
    marginTop: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'right',
  },

  emptyCard: {
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    padding: SPACING.xl,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  emptyHint: {
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: '90%',
  },

  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: RADIUS.md,
    marginBottom: SPACING.sm,
  },
  actionBtnText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2.2,
  },
});
