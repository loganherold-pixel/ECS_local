import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { ECSButton } from '../ECSButton';
import ECSActionRow from '../ECSActionRow';

import { TACTICAL } from '../../lib/theme';
import { resolveTelemetrySourceState } from '../../lib/telemetrySourceState';
import { publishTelemetryBriefAdvisories } from '../../lib/telemetryBriefPublisher';
import { useVehicleTelemetry } from '../../src/vehicle-telemetry/useVehicleTelemetry';
import { useUnifiedOBD2Scanner } from '../../lib/unifiedScanner';
import OBD2ScannerModal from '../vehicle-telemetry/OBD2ScannerModal';
import { evaluateOBDTelemetry, getAlertSeverityColor } from '../../lib/obdIntelligenceEngine';
import type { OBDIntelligenceAlert } from '../../lib/obdIntelligenceEngine';
import {
  WidgetCardShell,
  WidgetEmptyState,
  WidgetMetaLine,
} from './WidgetChrome';
import type { WidgetTone } from './WidgetChrome';
import {
  WidgetDetailLeadCard,
  WidgetDetailSectionTitle,
  WidgetDetailStateCard,
} from './WidgetDetailChrome';
import type { VehicleTelemetrySnapshot } from '../../src/types/telemetry';

type VehicleTelemetryState = ReturnType<typeof useVehicleTelemetry>;
type VehicleTelemetryScannerState = ReturnType<typeof useUnifiedOBD2Scanner>;
type VehicleTelemetrySourceState = ReturnType<typeof resolveTelemetrySourceState>;

type VehicleTelemetryMetric = {
  label: string;
  value: string;
  color?: string;
};

type VehicleTelemetryFieldDefinition = {
  key: keyof VehicleTelemetrySnapshot;
  label: string;
  formatter: (value: unknown) => string;
};

function logVehicleTelemetryWidgetDev(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, color ? { color } : null]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function TelemetryMetricTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricTileLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text
        style={[styles.metricTileValue, color ? { color } : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.72}
      >
        {value}
      </Text>
    </View>
  );
}

function TelemetryActionNote({ children }: { children: React.ReactNode }) {
  return (
    <Text style={styles.actionNote} numberOfLines={2}>
      {children}
    </Text>
  );
}

const ENGINE_STATUS: Record<string, { label: string; color: string }> = {
  running: { label: 'RUNNING', color: '#4CAF50' },
  idle: { label: 'IDLE', color: TACTICAL.amber },
  off: { label: 'OFF', color: TACTICAL.textMuted },
  unknown: { label: 'UNKNOWN', color: TACTICAL.textMuted },
};

const FRESHNESS_COLORS: Record<string, string> = {
  live: '#4CAF50',
  reconnecting: '#FFB300',
  stale: '#EF5350',
  disconnected: '#78909C',
  last_known: '#90A4AE',
};

function getBattColor(v: number | null): string {
  if (v == null) return TACTICAL.textMuted;
  if (v >= 12.4) return '#4CAF50';
  if (v >= 11.8) return '#FFB300';
  return '#EF5350';
}

function getCoolantColor(t: number | null): string {
  if (t == null) return TACTICAL.textMuted;
  if (t <= 220) return '#4CAF50';
  if (t <= 235) return '#FFB300';
  return '#EF5350';
}

function getFuelColor(f: number | null): string {
  if (f == null) return TACTICAL.textMuted;
  if (f >= 30) return '#4CAF50';
  if (f >= 15) return '#FFB74D';
  return '#EF5350';
}

function getVehicleTelemetrySourceState(vt: VehicleTelemetryState) {
  return resolveTelemetrySourceState({
    sourceType: vt.snapshot.sourceType,
    freshness: vt.snapshot.freshness,
    updatedAt: vt.snapshot.updatedAt,
    isStreaming: vt.snapshot.isLive,
  });
}

function getConnectionLabel(
  vt: VehicleTelemetryState,
  scanner: VehicleTelemetryScannerState,
  sourceState: VehicleTelemetrySourceState = getVehicleTelemetrySourceState(vt),
) {
  if (sourceState.isHighConfidenceLive) return `${sourceState.label} telemetry`;
  if (sourceState.isRecent) return 'Recent telemetry';
  if (sourceState.isStale) return 'Stale telemetry';
  if (sourceState.isManual) return 'Manual telemetry';
  if (sourceState.isSimulated) return 'Simulation telemetry';
  if (scanner.isConnected || vt.snapshot.unsupportedReason) return 'Connected — telemetry not yet decoded';
  if (vt.freshnessLabel === 'reconnecting') return 'Telemetry reconnecting';
  return 'Telemetry source unavailable';
}

function formatBatteryVoltage(value: number | null | undefined) {
  return value != null ? `${value.toFixed(1)}V` : '--';
}

function formatFuelLevel(value: number | null | undefined) {
  return value != null ? `${Math.round(value)}%` : '--';
}

function formatCoolantTemp(value: number | null | undefined) {
  return value != null ? `${Math.round(value)}F` : '--';
}

function formatRpm(value: number | null | undefined) {
  return value != null ? `${Math.round(value)}` : '--';
}

function formatEngineLoad(value: number | null | undefined) {
  return value != null ? `${Math.round(value)}%` : '--';
}

function formatSpeed(value: number | null | undefined) {
  return value != null ? `${Math.round(value)} MPH` : '--';
}

function formatDegrees(value: number | null | undefined) {
  return value != null ? `${value.toFixed(1)} deg` : '--';
}

function formatGenericPercent(value: number | null | undefined) {
  return value != null ? `${Math.round(value)}%` : '--';
}

function formatIntakeTemp(value: number | null | undefined) {
  return value != null ? `${Math.round(value)}F` : '--';
}

function formatRange(value: number | null | undefined) {
  return value != null ? `${Math.round(value)} mi` : '--';
}

function hasTelemetryMetricValue(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

const VEHICLE_TELEMETRY_FIELDS: VehicleTelemetryFieldDefinition[] = [
  { key: 'speedMph', label: 'Speed', formatter: (value) => formatSpeed(value as number | null | undefined) },
  { key: 'rpm', label: 'RPM', formatter: (value) => formatRpm(value as number | null | undefined) },
  { key: 'coolantTempF', label: 'Coolant', formatter: (value) => formatCoolantTemp(value as number | null | undefined) },
  { key: 'intakeTempF', label: 'Intake', formatter: (value) => formatIntakeTemp(value as number | null | undefined) },
  { key: 'engineLoadPct', label: 'Engine Load', formatter: (value) => formatGenericPercent(value as number | null | undefined) },
  { key: 'throttlePct', label: 'Throttle', formatter: (value) => formatGenericPercent(value as number | null | undefined) },
  { key: 'batteryVoltage', label: 'Battery', formatter: (value) => formatBatteryVoltage(value as number | null | undefined) },
  { key: 'fuelLevelPct', label: 'Fuel', formatter: (value) => formatFuelLevel(value as number | null | undefined) },
  { key: 'rangeMiles', label: 'Range', formatter: (value) => formatRange(value as number | null | undefined) },
  { key: 'oilTempF', label: 'Oil Temp', formatter: (value) => formatIntakeTemp(value as number | null | undefined) },
  { key: 'transmissionTempF', label: 'Trans Temp', formatter: (value) => formatIntakeTemp(value as number | null | undefined) },
  { key: 'pitchDeg', label: 'Pitch', formatter: (value) => formatDegrees(value as number | null | undefined) },
  { key: 'rollDeg', label: 'Roll', formatter: (value) => formatDegrees(value as number | null | undefined) },
  { key: 'headingDeg', label: 'Heading', formatter: (value) => formatDegrees(value as number | null | undefined) },
];

function getTelemetryDetailSourceLabel(snapshot: VehicleTelemetrySnapshot, sourceState: VehicleTelemetrySourceState) {
  switch (snapshot.sourceType) {
    case 'obd_live':
      return sourceState.isHighConfidenceLive ? 'OBD Live' : sourceState.label;
    case 'ble_live':
      return sourceState.isHighConfidenceLive ? 'BLE Live' : sourceState.label;
    case 'device_sensor':
      return sourceState.isHighConfidenceLive || sourceState.isRecent ? 'Device Attitude' : sourceState.label;
    case 'manual':
      return 'Manual Profile';
    case 'cached':
      return sourceState.isStale ? 'Cached - stale' : 'Cached';
    case 'simulated':
      return 'Simulation';
    case 'unavailable':
    default:
      return 'Unavailable';
  }
}

function buildVehicleTelemetryMetrics(snapshot: VehicleTelemetrySnapshot): VehicleTelemetryMetric[] {
  const metrics: VehicleTelemetryMetric[] = [];

  if (hasTelemetryMetricValue(snapshot.rpm)) {
    metrics.push({ label: 'RPM', value: formatRpm(snapshot.rpm) });
  }
  if (hasTelemetryMetricValue(snapshot.speedMph)) {
    metrics.push({ label: 'SPD', value: formatSpeed(snapshot.speedMph) });
  }
  if (hasTelemetryMetricValue(snapshot.batteryVoltage)) {
    metrics.push({
      label: 'BATT',
      value: formatBatteryVoltage(snapshot.batteryVoltage),
      color: getBattColor(snapshot.batteryVoltage),
    });
  }
  if (hasTelemetryMetricValue(snapshot.fuelLevelPct)) {
    metrics.push({
      label: 'FUEL',
      value: formatFuelLevel(snapshot.fuelLevelPct),
      color: getFuelColor(snapshot.fuelLevelPct),
    });
  }
  if (hasTelemetryMetricValue(snapshot.coolantTempF)) {
    metrics.push({
      label: 'COOL',
      value: formatCoolantTemp(snapshot.coolantTempF),
      color: getCoolantColor(snapshot.coolantTempF),
    });
  }
  if (hasTelemetryMetricValue(snapshot.engineLoadPct)) {
    metrics.push({ label: 'LOAD', value: formatEngineLoad(snapshot.engineLoadPct) });
  }

  return metrics;
}

function hasDisplayableTelemetry(
  vt: VehicleTelemetryState,
  sourceState: VehicleTelemetrySourceState = getVehicleTelemetrySourceState(vt),
) {
  const hasSource =
    sourceState.isHighConfidenceLive ||
    sourceState.isRecent ||
    sourceState.isStale ||
    sourceState.isManual ||
    sourceState.isSimulated;
  return hasSource && buildVehicleTelemetryMetrics(vt.snapshot).length > 0;
}

function getTelemetryBadge(
  vt: VehicleTelemetryState,
  scanner: VehicleTelemetryScannerState,
  sourceState: VehicleTelemetrySourceState = getVehicleTelemetrySourceState(vt),
) {
  if (sourceState.isHighConfidenceLive) {
    return { label: sourceState.label.toUpperCase(), tone: 'live' as const };
  }
  if (sourceState.isRecent) {
    return { label: 'RECENT TELEMETRY', tone: 'attention' as const };
  }
  if (sourceState.isStale) {
    return { label: 'STALE TELEMETRY', tone: 'stale' as const };
  }
  if (sourceState.isManual) {
    return { label: 'MANUAL TELEMETRY', tone: 'attention' as const };
  }
  if (sourceState.isSimulated) {
    return { label: 'SIMULATION', tone: 'warning' as const };
  }
  if (!scanner.isConnected && !vt.hasData) {
    return { label: 'TELEMETRY UNAVAILABLE', tone: 'unavailable' as const };
  }
  if (scanner.isConnected && vt.freshnessLabel === 'reconnecting') {
    return { label: 'TELEMETRY RECONNECTING', tone: 'attention' as const };
  }
  if (scanner.isConnected) {
    return { label: 'CONNECTED - NOT DECODED', tone: 'attention' as const };
  }
  return { label: 'TELEMETRY UNAVAILABLE', tone: 'unavailable' as const };
}

function getTelemetryFooter(
  vt: VehicleTelemetryState,
  scanner: VehicleTelemetryScannerState,
  sourceState: VehicleTelemetrySourceState = getVehicleTelemetrySourceState(vt),
) {
  const tone: WidgetTone = sourceState.isUnavailable && scanner.isConnected
    ? 'attention'
    : sourceState.tone;

  if (vt.lastUpdatedText) {
    return {
      text: `${sourceState.label} | ${vt.lastUpdatedText}`,
      tone,
    };
  }
  if (scanner.isConnected) {
    return {
      text: vt.snapshot.unsupportedReason ?? 'Connected — telemetry not yet decoded',
      tone,
    };
  }
  return {
    text: sourceState.isUnavailable ? 'Telemetry source unavailable' : sourceState.label,
    tone,
  };
}

function getTelemetryAlert(vt: VehicleTelemetryState): OBDIntelligenceAlert | null {
  if (!vt.snapshot.isLive) return null;
  return evaluateOBDTelemetry(vt.rawTelemetry)[0] ?? null;
}

function useVehicleTelemetryBriefPublisher(
  vt: VehicleTelemetryState,
  scanner: VehicleTelemetryScannerState,
) {
  const lastPublishSignatureRef = useRef<string | null>(null);
  const latestPublishInputRef = useRef({
    snapshot: vt.snapshot,
    scannerConnected: scanner.isConnected,
    scannerSourceStatus: scanner.sourceStatus,
    deviceId: scanner.connectedDeviceId ?? vt.snapshot.deviceId ?? vt.primaryDevice?.device_id ?? null,
    deviceName: scanner.connectedDeviceName ?? vt.primaryDevice?.device_name ?? null,
  });
  const publishSignature = [
    vt.snapshot.sourceType,
    vt.snapshot.freshness,
    vt.snapshot.confidence,
    vt.snapshot.updatedAt,
    vt.snapshot.batteryVoltage,
    vt.snapshot.coolantTempF,
    vt.snapshot.transmissionTempF,
    vt.snapshot.isLive,
    vt.snapshot.deviceId,
    scanner.isConnected,
    scanner.sourceStatus,
    scanner.connectedDeviceId,
  ].join('|');
  latestPublishInputRef.current = {
    snapshot: vt.snapshot,
    scannerConnected: scanner.isConnected,
    scannerSourceStatus: scanner.sourceStatus,
    deviceId: scanner.connectedDeviceId ?? vt.snapshot.deviceId ?? vt.primaryDevice?.device_id ?? null,
    deviceName: scanner.connectedDeviceName ?? vt.primaryDevice?.device_name ?? null,
  };

  useEffect(() => {
    if (lastPublishSignatureRef.current === publishSignature) return;
    lastPublishSignatureRef.current = publishSignature;
    publishTelemetryBriefAdvisories(latestPublishInputRef.current);
  }, [publishSignature]);
}

function getAlertSummary(alert: OBDIntelligenceAlert | null) {
  if (!alert) return null;
  return `${alert.category.trim()} ${alert.severity.trim()}`.toUpperCase();
}

function getAlertTone(alert: OBDIntelligenceAlert | null) {
  if (!alert) return null;
  if (alert.severity === 'critical') return '#EF5350';
  if (alert.severity === 'warning') return '#FFB300';
  if (alert.severity === 'caution') return '#FFB74D';
  return '#4CAF50';
}

function getDiagnosticsSummary(
  vt: VehicleTelemetryState,
  scanner: VehicleTelemetryScannerState,
  alert: OBDIntelligenceAlert | null,
  sourceState: VehicleTelemetrySourceState = getVehicleTelemetrySourceState(vt),
) {
  if (alert) return getAlertSummary(alert) ?? 'ACTIVE ALERT';
  if (!scanner.isConnected && !hasDisplayableTelemetry(vt, sourceState)) return 'UNAVAILABLE';
  if (!hasDisplayableTelemetry(vt, sourceState) && scanner.isConnected) return 'NOT DECODED';
  if (vt.freshnessLabel === 'reconnecting') return 'RECONNECTING';
  return sourceState.label.toUpperCase();
}

function getDiagnosticsTone(
  vt: VehicleTelemetryState,
  scanner: VehicleTelemetryScannerState,
  alert: OBDIntelligenceAlert | null,
  sourceState: VehicleTelemetrySourceState = getVehicleTelemetrySourceState(vt),
) {
  if (alert) return getAlertTone(alert) ?? TACTICAL.text;
  if (!scanner.isConnected && !hasDisplayableTelemetry(vt, sourceState)) return TACTICAL.textMuted;
  if (!hasDisplayableTelemetry(vt, sourceState) && scanner.isConnected) return '#FFB300';
  if (vt.freshnessLabel === 'reconnecting') return '#FFB300';
  if (sourceState.isStale || sourceState.isRecent) return '#FFB300';
  if (sourceState.isManual || sourceState.isSimulated) return TACTICAL.amber;
  return '#4CAF50';
}

function getCompactEventText(
  vt: VehicleTelemetryState,
  scanner: VehicleTelemetryScannerState,
  alert: OBDIntelligenceAlert | null,
  sourceState: VehicleTelemetrySourceState = getVehicleTelemetrySourceState(vt),
) {
  if (alert) return getAlertSummary(alert) ?? 'ACTIVE ALERT';
  if (!scanner.isConnected && !hasDisplayableTelemetry(vt, sourceState)) return 'Telemetry source unavailable';
  if (!hasDisplayableTelemetry(vt, sourceState) && scanner.isConnected) return 'Connected - not decoded';
  if (vt.freshnessLabel === 'reconnecting') return 'Reconnecting telemetry feed';
  return sourceState.label;
}

function getAlertListSignature(alerts: OBDIntelligenceAlert[]): string {
  return alerts
    .map((alert) => `${alert.category}:${alert.severity}:${alert.message}`)
    .join('|');
}

export function VehicleTelemetryCompact() {
  const vt = useVehicleTelemetry();
  const scanner = useUnifiedOBD2Scanner();
  useVehicleTelemetryBriefPublisher(vt, scanner);
  const sourceState = getVehicleTelemetrySourceState(vt);
  const badge = getTelemetryBadge(vt, scanner, sourceState);
  const footer = getTelemetryFooter(vt, scanner, sourceState);
  const alert = getTelemetryAlert(vt);
  const eventText = getCompactEventText(vt, scanner, alert, sourceState);
  const eventColor = getDiagnosticsTone(vt, scanner, alert, sourceState);
  const hasRenderableData = hasDisplayableTelemetry(vt, sourceState);
  const metrics = buildVehicleTelemetryMetrics(vt.snapshot).slice(0, 2);
  const lastWidgetLogSignatureRef = useRef<string | null>(null);
  const {
    batteryVoltage,
    coolantTempF,
    engineLoadPct,
    fuelLevelPct,
    rpm,
    sourceType,
    speedMph,
    transmissionTempF,
  } = vt.snapshot;
  const widgetLogSignature = useMemo(() => {
    const fields = [
      ['batteryVoltage', batteryVoltage],
      ['coolantTempF', coolantTempF],
      ['engineLoadPct', engineLoadPct],
      ['fuelLevelPct', fuelLevelPct],
      ['rpm', rpm],
      ['speedMph', speedMph],
      ['transmissionTempF', transmissionTempF],
    ].filter(([, value]) => value != null).map(([key]) => String(key));
    return {
      fields,
      signature: `${sourceType}|${sourceState.label}|${fields.join(',')}`,
    };
  }, [
    batteryVoltage,
    coolantTempF,
    engineLoadPct,
    fuelLevelPct,
    rpm,
    sourceState.label,
    sourceType,
    speedMph,
    transmissionTempF,
  ]);

  useEffect(() => {
    if (lastWidgetLogSignatureRef.current === widgetLogSignature.signature) return;
    lastWidgetLogSignatureRef.current = widgetLogSignature.signature;
    logVehicleTelemetryWidgetDev('[VEHICLE_TELEMETRY_WIDGET] render', {
      sourceType: vt.snapshot.sourceType,
      sourceState: sourceState.label,
      fields: widgetLogSignature.fields,
    });
  }, [sourceState.label, vt.snapshot.sourceType, widgetLogSignature]);

  if (!scanner.isConnected && !hasRenderableData) {
    return (
      <WidgetCardShell
        badge={badge}
        footer={<WidgetMetaLine text={footer.text} tone={footer.tone} />}
      >
        <View style={styles.compactUnavailableState}>
          <Text style={styles.compactUnavailableTitle}>Telemetry unavailable</Text>
          <Text style={styles.compactUnavailableText} numberOfLines={2}>
            Connect a supported vehicle feed.
          </Text>
        </View>
      </WidgetCardShell>
    );
  }

  if (scanner.isConnected && !hasRenderableData) {
    return (
      <WidgetCardShell
        badge={badge}
        footer={<WidgetMetaLine text={footer.text} tone={footer.tone} />}
      >
        <View style={styles.compactUnavailableState}>
          <Text style={styles.compactUnavailableTitle}>Connected — telemetry not yet decoded</Text>
          <Text style={styles.compactUnavailableText} numberOfLines={2}>
            ECS is waiting for readable vehicle signals.
          </Text>
        </View>
      </WidgetCardShell>
    );
  }

  return (
    <WidgetCardShell
      badge={badge}
      footer={<WidgetMetaLine text={footer.text} tone={footer.tone} />}
    >
      <View style={styles.compactTelemetryShell}>
        {metrics.length > 0 ? (
          <View style={styles.snapshotRow}>
            {metrics.map((metric) => (
              <TelemetryMetricTile
                key={metric.label}
                label={metric.label}
                value={metric.value}
                color={metric.color}
              />
            ))}
          </View>
        ) : null}
        <View style={styles.compactEventBand}>
          <Text style={styles.compactEventLabel} numberOfLines={1}>
            SOURCE
          </Text>
          <Text
            style={[styles.compactEventValue, { color: eventColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.72}
          >
            {eventText}
          </Text>
        </View>
      </View>
    </WidgetCardShell>
  );
}

export function VehicleTelemetryCard() {
  const vt = useVehicleTelemetry();
  const scanner = useUnifiedOBD2Scanner();
  useVehicleTelemetryBriefPublisher(vt, scanner);
  const sourceState = getVehicleTelemetrySourceState(vt);
  const hasRenderableData = hasDisplayableTelemetry(vt, sourceState);
  const badge = getTelemetryBadge(vt, scanner, sourceState);
  const footer = getTelemetryFooter(vt, scanner, sourceState);
  const alert = getTelemetryAlert(vt);
  const metrics = buildVehicleTelemetryMetrics(vt.snapshot).slice(0, 6);

  if (!scanner.isConnected && !hasRenderableData) {
    return (
      <WidgetCardShell
        badge={badge}
        footer={<WidgetMetaLine text={footer.text} tone={footer.tone} />}
      >
        <WidgetEmptyState
          primary="Telemetry source unavailable"
          secondary="Connect a supported vehicle feed to restore live expedition telemetry."
        />
      </WidgetCardShell>
    );
  }

  if (scanner.isConnected && !hasRenderableData) {
    return (
      <WidgetCardShell
        badge={badge}
        footer={<WidgetMetaLine text={footer.text} tone={footer.tone} />}
      >
        <WidgetEmptyState
          primary="Connected — telemetry not yet decoded"
          secondary="ECS can see the adapter, but no supported vehicle signals are readable yet."
        />
      </WidgetCardShell>
    );
  }

  return (
    <WidgetCardShell
      badge={badge}
      footer={<WidgetMetaLine text={footer.text} tone={footer.tone} />}
    >
      <View style={styles.expandedTelemetryGrid}>
        {metrics.map((metric) => (
          <TelemetryMetricTile
            key={metric.label}
            label={metric.label}
            value={metric.value}
            color={metric.color}
          />
        ))}
        <TelemetryMetricTile
          label="DIAGNOSTICS"
          value={getDiagnosticsSummary(vt, scanner, alert, sourceState)}
          color={getDiagnosticsTone(vt, scanner, alert, sourceState)}
        />
      </View>
    </WidgetCardShell>
  );
}

export function VehicleTelemetryDetailView({ onClose }: { onClose?: () => void }) {
  const vt = useVehicleTelemetry();
  const scanner = useUnifiedOBD2Scanner();
  const [alerts, setAlerts] = useState<OBDIntelligenceAlert[]>([]);
  const alertsSignatureRef = useRef('');
  const latestRawTelemetryRef = useRef(vt.rawTelemetry);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const sourceState = getVehicleTelemetrySourceState(vt);
  const freshColor = FRESHNESS_COLORS[vt.freshnessLabel] || TACTICAL.textMuted;
  const raw = vt.rawTelemetry;
  const hasData = hasDisplayableTelemetry(vt, sourceState);
  const connectionLabel = getConnectionLabel(vt, scanner, sourceState);
  const sourceLabel = getTelemetryDetailSourceLabel(vt.snapshot, sourceState);
  const hasAnySource = hasData || scanner.isConnected || scanner.isConnecting || scanner.isReconnecting;
  const permissionRequired = scanner.sourceStatus === 'permission_required';
  const canReconnect = Boolean(scanner.lastDevice) && !scanner.isConnected && !scanner.isConnecting && !scanner.isReconnecting;
  const canDisableTelemetry = hasAnySource || vt.deviceCount > 0;
  const detailTone =
    sourceState.isHighConfidenceLive
      ? 'live'
    : scanner.isConnecting || scanner.isReconnecting
      ? 'attention'
      : scanner.isConnected || sourceState.isManual || sourceState.isSimulated || sourceState.isRecent
        ? 'warning'
        : sourceState.isStale
          ? 'warning'
          : 'muted';
  const primarySignals = useMemo(
    () => buildVehicleTelemetryMetrics(vt.snapshot),
    [vt.snapshot],
  );
  const {
    battery_voltage: rawBatteryVoltage,
    coolant_temp: rawCoolantTemp,
    device_id: rawDeviceId,
    engine_rpm: rawEngineRpm,
    provider: rawProvider,
    timestamp: rawTimestamp,
    transmission_temp: rawTransmissionTemp,
    vehicle_speed: rawVehicleSpeed,
  } = vt.rawTelemetry;
  latestRawTelemetryRef.current = vt.rawTelemetry;
  const rawTelemetryAlertSignature = [
    rawProvider,
    rawDeviceId,
    rawTimestamp,
    rawBatteryVoltage,
    rawCoolantTemp,
    rawTransmissionTemp,
    rawEngineRpm,
    rawVehicleSpeed,
  ].join('|');

  useEffect(() => {
    const nextAlerts = vt.snapshot.isLive
      ? evaluateOBDTelemetry(latestRawTelemetryRef.current).slice(0, 3)
      : [];
    const nextSignature = getAlertListSignature(nextAlerts);
    if (alertsSignatureRef.current === nextSignature) return;
    alertsSignatureRef.current = nextSignature;
    setAlerts(nextAlerts);
  }, [rawTelemetryAlertSignature, vt.snapshot.isLive]);

  const fieldRows = useMemo(
    () => VEHICLE_TELEMETRY_FIELDS.map((field) => {
      const rawValue = vt.snapshot[field.key];
      return {
        key: String(field.key),
        label: field.label,
        value: field.formatter(rawValue),
        available: rawValue != null,
      };
    }),
    [vt.snapshot],
  );

  const handleReconnect = useCallback(async () => {
    setActionBusy('reconnect');
    setActionMessage(null);
    try {
      const restored = await scanner.attemptReconnect();
      setActionMessage(
        restored
          ? 'Reconnect started for the last known telemetry source.'
          : 'No saved telemetry adapter was available. Open Scan / Connect to choose a source.',
      );
      if (!restored) {
        setScannerVisible(true);
      }
    } catch (error: any) {
      setActionMessage(error?.message ?? 'Reconnect failed. Open Scan / Connect to choose a source.');
    } finally {
      setActionBusy(null);
    }
  }, [scanner]);

  const handleManualProfileOnly = useCallback(async () => {
    setActionBusy('manual');
    setActionMessage(null);
    try {
      await vt.disconnectProvider();
      setActionMessage('Live telemetry disabled. Vehicle profile/manual values remain the fallback source where configured.');
    } catch (error: any) {
      setActionMessage(error?.message ?? 'Could not switch to manual profile only.');
    } finally {
      setActionBusy(null);
    }
  }, [vt]);

  const handleDisableTelemetry = useCallback(async () => {
    setActionBusy('disable');
    setActionMessage(null);
    try {
      await scanner.stopScan('telemetry_detail_disable');
      await vt.disconnectProvider();
      setActionMessage('Telemetry provider disconnected and scanner stopped.');
    } catch (error: any) {
      setActionMessage(error?.message ?? 'Could not disable telemetry cleanly.');
    } finally {
      setActionBusy(null);
    }
  }, [scanner, vt]);

  if (!hasData && !scanner.isConnected) {
    return (
      <View style={styles.detailContainer}>
        <WidgetDetailStateCard
          title="Telemetry source unavailable"
          message="Connect a supported vehicle telemetry source to restore live expedition signals."
          badgeLabel="UNAVAILABLE"
          tone="muted"
          icon="car-outline"
        >
          <ECSActionRow style={styles.actionRow}>
            <ECSButton
              label="Scan / Connect"
              icon="bluetooth-outline"
              variant="secondary"
              size="compact"
              onPress={() => setScannerVisible(true)}
              grow
            />
            <ECSButton
              label="Reconnect"
              icon="sync-outline"
              variant="tertiary"
              size="compact"
              onPress={handleReconnect}
              disabled={!canReconnect}
              loading={actionBusy === 'reconnect'}
              grow
            />
            <ECSButton
              label="Close"
              icon="close-outline"
              variant="tertiary"
              size="compact"
              onPress={onClose}
              disabled={!onClose}
              grow
            />
          </ECSActionRow>
          {!canReconnect ? <TelemetryActionNote>No saved telemetry adapter is available for reconnect.</TelemetryActionNote> : null}
          {actionMessage ? <TelemetryActionNote>{actionMessage}</TelemetryActionNote> : null}
          <OBD2ScannerModal
            visible={scannerVisible}
            onClose={() => setScannerVisible(false)}
          />
        </WidgetDetailStateCard>
      </View>
    );
  }

  return (
    <View style={styles.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="VEHICLE TELEMETRY"
        title={sourceLabel}
        summary={
          sourceState.isHighConfidenceLive
            ? 'Live vehicle telemetry is active from the normalized ECS snapshot.'
            : sourceState.isStale
              ? 'Showing stale vehicle telemetry. Live updates are not active.'
            : sourceState.isRecent
              ? 'Showing recent vehicle telemetry. Streaming is not currently confirmed.'
            : sourceState.isManual
              ? 'Manual vehicle telemetry is active. ECS will not treat it as live.'
            : sourceState.isSimulated
              ? 'Simulation telemetry is active. ECS will not treat it as live.'
            : scanner.isConnecting || scanner.isReconnecting
              ? 'Reconnecting telemetry feed from the paired vehicle source.'
              : scanner.isConnected
                ? 'Connected, but ECS has not decoded readable vehicle telemetry from this adapter yet.'
                : 'Vehicle telemetry is unavailable.'
        }
        tone={detailTone}
        badges={[
          {
            label: sourceState.isUnavailable && scanner.isConnected
              ? 'NOT DECODED'
              : sourceLabel.toUpperCase(),
            tone: detailTone,
          },
          { label: vt.snapshot.confidence.toUpperCase(), tone: detailTone },
        ]}
        metaLines={[
          `Source ${vt.snapshot.sourceType}`,
          `Scanner ${scanner.sourceStatus}`,
          scanner.connectedDeviceName ? `Adapter ${scanner.connectedDeviceName}` : null,
          vt.primaryDevice?.protocol ? `Protocol ${vt.primaryDevice.protocol}` : null,
          vt.lastUpdatedText ? `Updated ${vt.lastUpdatedText}` : 'No live source.',
        ]}
      >
        <View style={styles.connectionRow}>
          <View style={[styles.connectionDot, { backgroundColor: freshColor }]} />
          <Text style={[styles.connectionLabel, { color: freshColor }]}>{connectionLabel}</Text>
          {vt.lastUpdatedText ? <Text style={styles.statusTime}>{vt.lastUpdatedText}</Text> : null}
        </View>
        <MetricRow label="POLLING" value={vt.isPolling ? 'Active' : 'Inactive'} color={vt.isPolling ? '#4CAF50' : TACTICAL.textMuted} />
      </WidgetDetailLeadCard>

      {permissionRequired ? (
        <>
          <View style={styles.detailDivider} />
          <WidgetDetailStateCard
            title="Bluetooth permission required"
            message={scanner.error ?? 'Enable Bluetooth permission before ECS can scan for vehicle telemetry sources.'}
            badgeLabel="PERMISSION REQUIRED"
            tone="attention"
            icon="lock-closed-outline"
          >
            <ECSButton
              label="Retry Scan"
              icon="refresh-outline"
              variant="secondary"
              size="compact"
              onPress={() => setScannerVisible(true)}
            />
          </WidgetDetailStateCard>
        </>
      ) : null}

      <View style={styles.detailDivider} />
      <WidgetDetailSectionTitle>SOURCE CONTROLS</WidgetDetailSectionTitle>
      <View style={styles.actionPanel}>
        <ECSActionRow style={styles.actionRow}>
          <ECSButton
            label="Scan / Connect"
            icon="bluetooth-outline"
            variant="secondary"
            size="compact"
            onPress={() => setScannerVisible(true)}
            grow
          />
          <ECSButton
            label="Reconnect"
            icon="sync-outline"
            variant="tertiary"
            size="compact"
            onPress={handleReconnect}
            disabled={!canReconnect}
            loading={actionBusy === 'reconnect'}
            grow
          />
        </ECSActionRow>
        <ECSActionRow style={styles.actionRow}>
          <ECSButton
            label="Use Manual Profile Only"
            icon="create-outline"
            variant="tertiary"
            size="compact"
            onPress={handleManualProfileOnly}
            disabled={!canDisableTelemetry}
            loading={actionBusy === 'manual'}
            grow
          />
          <ECSButton
            label="Disable Telemetry"
            icon="power-outline"
            variant="destructive"
            size="compact"
            onPress={handleDisableTelemetry}
            disabled={!canDisableTelemetry}
            loading={actionBusy === 'disable'}
            grow
          />
        </ECSActionRow>
        <ECSButton
          label="Close"
          icon="close-outline"
          variant="secondary"
          size="compact"
          onPress={onClose}
          disabled={!onClose}
        />
        {!canReconnect ? <TelemetryActionNote>Reconnect is available after a telemetry adapter has been saved.</TelemetryActionNote> : null}
        {!canDisableTelemetry ? <TelemetryActionNote>No active telemetry source is available to disable.</TelemetryActionNote> : null}
        {actionMessage ? <TelemetryActionNote>{actionMessage}</TelemetryActionNote> : null}
      </View>

      <View style={styles.detailDivider} />
      <WidgetDetailSectionTitle>EXPEDITION SIGNALS</WidgetDetailSectionTitle>
      {primarySignals.length > 0 ? (
        <View style={styles.detailGrid}>
          {primarySignals.map((metric) => (
            <TelemetryMetricTile key={metric.label} label={metric.label} value={metric.value} color={metric.color} />
          ))}
        </View>
      ) : (
        <WidgetDetailStateCard
          title="No decoded telemetry values"
          message="ECS has source state, but no readable vehicle values are available yet."
          badgeLabel={sourceState.label.toUpperCase()}
          tone={detailTone}
          icon="pulse-outline"
        />
      )}

      {(raw.engine_load != null || raw.throttle_position != null) ? (
        <>
          <View style={styles.detailDivider} />
          <WidgetDetailSectionTitle>POWERTRAIN LOAD</WidgetDetailSectionTitle>
          {raw.engine_load != null ? (
            <MetricRow
              label="ENGINE LOAD"
              value={`${Math.round(raw.engine_load)}%`}
              color={raw.engine_load > 85 ? '#FFB300' : TACTICAL.text}
            />
          ) : null}
          {raw.throttle_position != null ? (
            <MetricRow label="THROTTLE" value={`${Math.round(raw.throttle_position)}%`} />
          ) : null}
        </>
      ) : null}

      {alerts.length > 0 ? (
        <>
          <View style={styles.detailDivider} />
          <WidgetDetailSectionTitle>ECS ALERTS</WidgetDetailSectionTitle>
          {alerts.map((alert) => (
            <View key={alert.id} style={[styles.alertCard, { borderLeftColor: getAlertSeverityColor(alert.severity) }]}>
              <View style={styles.alertHeader}>
                <Ionicons name="alert-circle-outline" size={12} color={getAlertSeverityColor(alert.severity)} />
                <Text style={[styles.alertTitle, { color: getAlertSeverityColor(alert.severity) }]}>{alert.title}</Text>
              </View>
              <Text style={styles.alertMessage}>{alert.message}</Text>
            </View>
          ))}
        </>
      ) : null}

      <View style={styles.detailDivider} />
      <WidgetDetailSectionTitle>FIELD AVAILABILITY</WidgetDetailSectionTitle>
      <View style={styles.fieldGrid}>
        {fieldRows.map((field) => (
          <View
            key={field.key}
            style={[
              styles.fieldTile,
              field.available ? styles.fieldTileAvailable : styles.fieldTileMissing,
            ]}
          >
            <Text style={styles.fieldLabel} numberOfLines={1}>{field.label}</Text>
            <Text
              style={[
                styles.fieldValue,
                !field.available ? styles.fieldValueMissing : null,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.76}
            >
              {field.value}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.detailDivider} />
      <WidgetDetailSectionTitle>DEVICE INFO</WidgetDetailSectionTitle>
      <MetricRow label="DEVICES" value={`${vt.deviceCount}`} />
      <MetricRow label="PROVIDER" value={vt.activeProvider?.toUpperCase() || '--'} />
      <MetricRow label="STATE" value={vt.connectionDisplayState.toUpperCase()} color={freshColor} />
      <MetricRow label="LAST UPDATE" value={vt.lastUpdatedText ?? 'No live source'} />
      <OBD2ScannerModal
        visible={scannerVisible}
        onClose={() => setScannerVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 18,
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
  metricTile: {
    flexBasis: '48%',
    flexGrow: 1,
    minWidth: 0,
    minHeight: 50,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    justifyContent: 'space-between',
    gap: 3,
  },
  metricTileLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  metricTileValue: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    lineHeight: 14,
    includeFontPadding: false,
  },
  compactTelemetryShell: {
    flex: 1,
    minHeight: 0,
    gap: 7,
    justifyContent: 'center',
  },
  snapshotRow: {
    flexDirection: 'row',
    gap: 6,
  },
  compactEventBand: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    justifyContent: 'space-between',
    gap: 3,
  },
  compactEventLabel: {
    fontSize: 7.5,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  compactEventValue: {
    fontSize: 10.5,
    lineHeight: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    includeFontPadding: false,
  },
  compactUnavailableState: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  compactUnavailableTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    textAlign: 'center',
    lineHeight: 14,
  },
  compactUnavailableText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 12,
  },
  expandedTelemetryGrid: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignContent: 'flex-start',
  },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  connectionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  connectionLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  detailContainer: {
    gap: 4,
  },
  detailDivider: {
    height: 1,
    backgroundColor: TACTICAL.border,
    marginVertical: 8,
  },
  statusTime: {
    marginLeft: 'auto',
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  alertCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    borderLeftWidth: 3,
    padding: 10,
    gap: 4,
    marginBottom: 6,
  },
  alertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  alertTitle: {
    fontSize: 10,
    fontWeight: '700',
    flex: 1,
  },
  alertMessage: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    lineHeight: 13,
  },
  actionPanel: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    padding: 10,
    gap: 8,
  },
  actionRow: {
    flexWrap: 'wrap',
  },
  actionNote: {
    fontSize: 9,
    fontWeight: '700',
    lineHeight: 13,
    color: TACTICAL.textMuted,
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  fieldTile: {
    flexBasis: '30%',
    flexGrow: 1,
    minWidth: 92,
    borderRadius: 9,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 4,
  },
  fieldTileAvailable: {
    borderColor: 'rgba(76,175,80,0.22)',
    backgroundColor: 'rgba(76,175,80,0.06)',
  },
  fieldTileMissing: {
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  fieldLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  fieldValue: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  fieldValueMissing: {
    color: TACTICAL.textMuted,
  },
});
