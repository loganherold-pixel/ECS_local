import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { useVehicleTelemetry } from '../../src/vehicle-telemetry/useVehicleTelemetry';
import { useOBD2Scanner } from '../../src/vehicle-telemetry/useOBD2Scanner';
import { evaluateOBDTelemetry, getAlertSeverityColor } from '../../lib/obdIntelligenceEngine';
import type { OBDIntelligenceAlert } from '../../lib/obdIntelligenceEngine';
import {
  WidgetCardShell,
  WidgetCompactRow,
  WidgetEmptyState,
  WidgetMetaLine,
  WidgetMicroStrip,
  WidgetPrimaryValue,
  WidgetSecondaryRow,
} from './WidgetChrome';
import {
  WidgetDetailLeadCard,
  WidgetDetailSectionTitle,
  WidgetDetailStateCard,
} from './WidgetDetailChrome';

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
  compact = false,
}: {
  label: string;
  value: string;
  color?: string;
  compact?: boolean;
}) {
  return (
    <View style={[styles.metricTile, compact && styles.metricTileCompact]}>
      <Text style={styles.metricTileLabel}>{label}</Text>
      <Text style={[styles.metricTileValue, compact && styles.metricTileValueCompact, color ? { color } : null]} numberOfLines={compact ? 1 : 2}>
        {value}
      </Text>
    </View>
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
  if (v >= 13.5) return '#4CAF50';
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

function getConnectionLabel(scannerConnected: boolean, freshnessLabel: string) {
  if (!scannerConnected) {
    return freshnessLabel === 'last_known' || freshnessLabel === 'stale'
      ? 'Last known telemetry'
      : 'Telemetry source unavailable';
  }
  if (freshnessLabel === 'reconnecting') return 'Telemetry reconnecting';
  if (freshnessLabel === 'last_known' || freshnessLabel === 'stale') return 'Last known telemetry';
  return 'Telemetry connected';
}

function buildFaceMetrics(vt: ReturnType<typeof useVehicleTelemetry>) {
  const { coolant_temp, battery_voltage, engine_rpm, vehicle_speed, fuel_level } = vt.summary;
  const engineInfo = ENGINE_STATUS[vt.engineStatus] || ENGINE_STATUS.unknown;

  return [
    {
      label: 'Coolant',
      value: coolant_temp != null ? `${Math.round(coolant_temp)}°F` : '—',
      color: getCoolantColor(coolant_temp),
    },
    {
      label: 'Battery',
      value: battery_voltage != null ? `${battery_voltage.toFixed(1)}V` : '—',
      color: getBattColor(battery_voltage),
    },
    {
      label: 'RPM',
      value: engine_rpm != null && engine_rpm > 0 ? `${Math.round(engine_rpm)}` : engineInfo.label,
      color: engine_rpm != null && engine_rpm > 0 ? TACTICAL.text : engineInfo.color,
    },
    {
      label: vehicle_speed != null && vehicle_speed > 0 ? 'Speed' : 'Fuel',
      value:
        vehicle_speed != null && vehicle_speed > 0
          ? `${Math.round(vehicle_speed)} mph`
          : fuel_level != null
            ? `${Math.round(fuel_level)}%`
            : '—',
      color:
        vehicle_speed != null && vehicle_speed > 0
          ? TACTICAL.text
          : getFuelColor(fuel_level),
    },
  ];
}

export function VehicleTelemetryCompact() {
  const vt = useVehicleTelemetry();
  const scanner = useOBD2Scanner();
  const hasRenderableData = vt.hasData;
  const metrics = buildFaceMetrics(vt);
  const summary = hasRenderableData
    ? `${(ENGINE_STATUS[vt.engineStatus] || ENGINE_STATUS.unknown).label} | Batt ${metrics[1]?.value ?? '—'} | Coolant ${metrics[0]?.value ?? '—'}`
    : scanner.isConnected
      ? 'Waiting for vehicle data'
      : 'Connect telemetry source';

  const tone =
    scanner.isConnected && hasRenderableData
      ? 'live'
      : scanner.isConnected
        ? 'attention'
        : hasRenderableData
          ? 'stale'
          : 'unavailable';
  const status = scanner.isConnected
    ? hasRenderableData
      ? 'Connected'
      : 'Waiting'
    : hasRenderableData
      ? 'Cached'
      : 'Unavailable';

  return <WidgetCompactRow title="Telemetry" summary={summary} tone={tone} status={status} statusTone={tone} />;
}

export function VehicleTelemetryCard() {
  const vt = useVehicleTelemetry();
  const scanner = useOBD2Scanner();
  const hasData = vt.hasData && (vt.freshnessLabel === 'live' || vt.freshnessLabel === 'reconnecting' || vt.isWithinGraceWindow);
  const hasRenderableData = vt.hasData;

  if (!scanner.isConnected && !hasRenderableData) {
    return (
      <WidgetCardShell badge={{ label: 'TELEMETRY UNAVAILABLE', tone: 'unavailable' }}>
        <WidgetEmptyState
          primary="Telemetry source unavailable"
          secondary="Connect a supported vehicle feed to restore live expedition telemetry."
        />
      </WidgetCardShell>
    );
  }
  return (
    <WidgetCardShell
      badge={{ label: scanner.isConnected ? 'TELEMETRY LIVE' : 'LAST KNOWN', tone: scanner.isConnected ? 'live' : 'stale' }}
      footer={
        <WidgetMetaLine
          text={
            vt.lastUpdatedText
              ? `${vt.freshnessLabel.replace('_', ' ')} · ${vt.lastUpdatedText}`
              : scanner.isConnected ? 'Waiting for a fresh telemetry sample' : 'Using last known telemetry until the source returns'
          }
          tone={scanner.isConnected ? (hasData ? 'live' : 'stale') : 'stale'}
        />
      }
    >
      <WidgetPrimaryValue
        label="ENGINE"
        value={(ENGINE_STATUS[vt.engineStatus] || ENGINE_STATUS.unknown).label}
        tone={vt.engineStatus === 'running' ? 'live' : vt.engineStatus === 'idle' ? 'attention' : scanner.isConnected ? 'neutral' : 'stale'}
      />
      <WidgetSecondaryRow
        items={[
          {
            label: 'BATT',
            value: vt.summary.battery_voltage != null ? `${vt.summary.battery_voltage.toFixed(1)}V` : '—',
            tone: vt.summary.battery_voltage != null ? (getBattColor(vt.summary.battery_voltage) === '#EF5350' ? 'critical' : getBattColor(vt.summary.battery_voltage) === '#FFB300' ? 'attention' : 'good') : 'neutral',
          },
          {
            label: 'COOLANT',
            value: vt.summary.coolant_temp != null ? `${Math.round(vt.summary.coolant_temp)}°F` : '—',
            tone: vt.summary.coolant_temp != null ? (getCoolantColor(vt.summary.coolant_temp) === '#EF5350' ? 'critical' : getCoolantColor(vt.summary.coolant_temp) === '#FFB300' ? 'attention' : 'good') : 'neutral',
          },
        ]}
      />
      <WidgetMicroStrip
        items={[
          {
            label: 'RPM',
            value: vt.summary.engine_rpm != null && vt.summary.engine_rpm > 0 ? `${Math.round(vt.summary.engine_rpm)}` : '—',
            tone: 'neutral',
          },
          {
            label: vt.summary.vehicle_speed != null && vt.summary.vehicle_speed > 0 ? 'Speed' : 'Fuel',
            value: vt.summary.vehicle_speed != null && vt.summary.vehicle_speed > 0
              ? `${Math.round(vt.summary.vehicle_speed)} mph`
              : vt.summary.fuel_level != null
                ? `${Math.round(vt.summary.fuel_level)}%`
                : '—',
            tone: vt.summary.vehicle_speed != null && vt.summary.vehicle_speed > 0 ? 'neutral' : vt.summary.fuel_level != null && vt.summary.fuel_level <= 15 ? 'critical' : 'neutral',
          },
          {
            label: 'Feed',
            value: scanner.isConnected ? 'Live' : 'Last known',
            tone: scanner.isConnected ? 'live' : 'stale',
          },
        ]}
      />
    </WidgetCardShell>
  );
}

export function VehicleTelemetryDetailView() {
  const vt = useVehicleTelemetry();
  const scanner = useOBD2Scanner();
  const [alerts, setAlerts] = useState<OBDIntelligenceAlert[]>([]);
  const freshColor = FRESHNESS_COLORS[vt.freshnessLabel] || TACTICAL.textMuted;
  const engineInfo = ENGINE_STATUS[vt.engineStatus] || ENGINE_STATUS.unknown;
  const raw = vt.rawTelemetry;
  const hasData = vt.hasData;
  const connectionLabel = getConnectionLabel(scanner.isConnected, vt.freshnessLabel);
  const detailTone =
    hasData && scanner.isConnected
      ? 'live'
      : scanner.isConnecting || scanner.isReconnecting
        ? 'attention'
        : scanner.isConnected
          ? 'warning'
          : 'muted';
  const primarySignals = useMemo(() => ([
    {
      label: 'ENGINE',
      value: engineInfo.label,
      color: engineInfo.color,
    },
    {
      label: 'COOLANT',
      value: raw.coolant_temp != null ? `${Math.round(raw.coolant_temp)}°F` : '—',
      color: getCoolantColor(raw.coolant_temp ?? null),
    },
    {
      label: 'BATTERY',
      value: raw.battery_voltage != null ? `${raw.battery_voltage.toFixed(1)} V` : '—',
      color: getBattColor(raw.battery_voltage ?? null),
    },
    {
      label: 'RPM',
      value: raw.engine_rpm != null ? `${Math.round(raw.engine_rpm)}` : '—',
      color: TACTICAL.text,
    },
    {
      label: 'SPEED',
      value: raw.vehicle_speed != null ? `${Math.round(raw.vehicle_speed)} mph` : '—',
      color: TACTICAL.text,
    },
    {
      label: 'FUEL',
      value: raw.fuel_level != null ? `${Math.round(raw.fuel_level)}%` : '—',
      color: getFuelColor(raw.fuel_level ?? null),
    },
  ]), [engineInfo.color, engineInfo.label, raw]);

  useEffect(() => {
    if (vt.hasData) {
      setAlerts(evaluateOBDTelemetry(vt.rawTelemetry).slice(0, 3));
    } else {
      setAlerts([]);
    }
  }, [vt.hasData, vt.rawTelemetry]);

  if (!hasData && !scanner.isConnected) {
    return (
      <View style={styles.detailContainer}>
        <WidgetDetailStateCard
          title="Telemetry source unavailable"
          message="Connect a supported vehicle telemetry source to restore live expedition signals."
          badgeLabel="UNAVAILABLE"
          tone="muted"
          icon="car-outline"
        />
      </View>
    );
  }

  return (
    <View style={styles.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="VEHICLE TELEMETRY"
        title={connectionLabel}
        summary={
          hasData
            ? 'Live expedition telemetry is active from the paired vehicle source.'
            : scanner.isConnecting || scanner.isReconnecting
              ? 'Reconnecting telemetry feed from the paired vehicle source.'
              : 'Telemetry is connected, but ECS is still waiting for readable vehicle data.'
        }
        tone={detailTone}
        badges={[
          { label: hasData ? 'LIVE DATA' : scanner.isConnected ? 'WAITING FOR DATA' : 'UNAVAILABLE', tone: detailTone },
        ]}
        metaLines={[
          scanner.connectedDeviceName ? `Adapter ${scanner.connectedDeviceName}` : null,
          vt.primaryDevice?.protocol ? `Protocol ${vt.primaryDevice.protocol}` : null,
          vt.lastUpdatedText ?? null,
        ]}
      >
        <View style={styles.connectionRow}>
          <View style={[styles.connectionDot, { backgroundColor: freshColor }]} />
          <Text style={[styles.connectionLabel, { color: freshColor }]}>{connectionLabel}</Text>
          {vt.lastUpdatedText ? <Text style={styles.statusTime}>{vt.lastUpdatedText}</Text> : null}
        </View>
        <MetricRow label="POLLING" value={vt.isPolling ? 'Active' : 'Inactive'} color={vt.isPolling ? '#4CAF50' : TACTICAL.textMuted} />
      </WidgetDetailLeadCard>

      <View style={styles.detailDivider} />
      <WidgetDetailSectionTitle>EXPEDITION SIGNALS</WidgetDetailSectionTitle>
      <View style={styles.detailGrid}>
        {primarySignals.map((metric) => (
          <TelemetryMetricTile key={metric.label} label={metric.label} value={metric.value} color={metric.color} />
        ))}
      </View>

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
      <WidgetDetailSectionTitle>DEVICE INFO</WidgetDetailSectionTitle>
      <MetricRow label="DEVICES" value={`${vt.deviceCount}`} />
      <MetricRow label="PROVIDER" value={vt.activeProvider?.toUpperCase() || '—'} />
      <MetricRow label="STATE" value={vt.connectionDisplayState.toUpperCase()} color={freshColor} />
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
  metricTileCompact: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: 0,
    minHeight: 42,
    paddingHorizontal: 7,
    paddingVertical: 6,
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
  },
  metricTileValueCompact: {
    fontSize: 10,
    lineHeight: 12,
  },
  compactShell: {
    flex: 1,
    minHeight: 0,
    gap: 5,
    justifyContent: 'center',
  },
  compactMetricsRow: {
    flexDirection: 'row',
    gap: 5,
  },
  compactFallback: {
    color: TACTICAL.textMuted,
    fontSize: 8.5,
    fontWeight: '700',
    lineHeight: 12,
  },
  cardMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
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
  detailSection: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 4,
  },
  detailDivider: {
    height: 1,
    backgroundColor: TACTICAL.border,
    marginVertical: 8,
  },
  detailStatusCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    gap: 4,
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
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 26,
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: TACTICAL.textMuted,
  },
  emptyDesc: {
    fontSize: 10.5,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 15,
    textAlign: 'center',
    paddingHorizontal: 18,
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
});
