/**
 * ═══════════════════════════════════════════════════════════
 * ECS VEHICLE TELEMETRY WIDGET
 * ═══════════════════════════════════════════════════════════
 *
 * Dashboard widget for live OBD-II vehicle telemetry.
 * Three display modes:
 *   - Compact: RPM, Coolant, Voltage, Fuel (glanceable)
 *   - Card: Full telemetry with freshness indicator
 *   - Detail: Expanded view with all available PIDs
 *
 * Designed for expedition use — large text, high contrast,
 * readable while driving.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { useVehicleTelemetry } from '../../src/vehicle-telemetry/useVehicleTelemetry';
import { useOBD2Scanner } from '../../src/vehicle-telemetry/useOBD2Scanner';
import { evaluateOBDTelemetry, getAlertSeverityColor } from '../../lib/obdIntelligenceEngine';
import type { OBDIntelligenceAlert } from '../../lib/obdIntelligenceEngine';

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={ms.row}>
      <Text style={ms.label}>{label}</Text>
      <Text style={[ms.value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const ms = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  label: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  value: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
});

const ENGINE_STATUS: Record<string, { label: string; color: string }> = {
  running: { label: 'RUNNING', color: '#4CAF50' },
  idle: { label: 'IDLE', color: TACTICAL.amber },
  off: { label: 'OFF', color: TACTICAL.textMuted },
  unknown: { label: '\u2014', color: TACTICAL.textMuted },
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

// ═══════════════════════════════════════════════════════════
// COMPACT MODE — For dashboard grid (collapsed)
// ═══════════════════════════════════════════════════════════

export function VehicleTelemetryCompact() {
  const vt = useVehicleTelemetry();
  const hasData = vt.hasData && (vt.freshnessLabel === 'live' || vt.freshnessLabel === 'reconnecting' || vt.isWithinGraceWindow);

  if (!hasData) {
    return (
      <View style={cs.row}>
        <View style={cs.cell}>
          <Text style={[cs.value, { fontSize: 9, color: TACTICAL.textMuted }]}>NO OBD</Text>
        </View>
      </View>
    );
  }

  const rpm = vt.summary.engine_rpm;
  const coolant = vt.summary.coolant_temp;
  const voltage = vt.summary.battery_voltage;

  return (
    <View style={cs.row}>
      <View style={cs.cell}>
        <Text style={cs.label}>RPM</Text>
        <Text style={cs.value}>{rpm != null ? Math.round(rpm).toString() : '\u2014'}</Text>
      </View>
      <View style={cs.cell}>
        <Text style={cs.label}>COOL</Text>
        <Text style={[cs.value, { color: getCoolantColor(coolant) }]}>
          {coolant != null ? `${Math.round(coolant)}°` : '\u2014'}
        </Text>
      </View>
      <View style={cs.cell}>
        <Text style={cs.label}>BATT</Text>
        <Text style={[cs.value, { color: getBattColor(voltage) }]}>
          {voltage != null ? `${voltage.toFixed(1)}` : '\u2014'}
        </Text>
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  cell: { flex: 1, alignItems: 'center' },
  label: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 1 },
  value: { fontSize: 12, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text },
});

// ═══════════════════════════════════════════════════════════
// CARD MODE — For dashboard grid (full card)
// ═══════════════════════════════════════════════════════════

export function VehicleTelemetryCard() {
  const vt = useVehicleTelemetry();
  const scanner = useOBD2Scanner();
  const hasData = vt.hasData && (vt.freshnessLabel === 'live' || vt.freshnessLabel === 'reconnecting' || vt.isWithinGraceWindow);
  const freshColor = FRESHNESS_COLORS[vt.freshnessLabel] || TACTICAL.textMuted;
  const engineInfo = ENGINE_STATUS[vt.engineStatus] || ENGINE_STATUS.unknown;

  // ── Empty state ──
  if (!hasData && !scanner.isConnected) {
    return (
      <View style={cardS.body}>
        <View style={cardS.emptyState}>
          <Ionicons name="car-outline" size={20} color={TACTICAL.textMuted} />
          <Text style={cardS.emptyTitle}>No OBD-II Connected</Text>
          <Text style={cardS.emptyDesc}>Connect an adapter for live vehicle telemetry</Text>
        </View>
      </View>
    );
  }

  const { battery_voltage, fuel_level, coolant_temp, engine_rpm, vehicle_speed } = vt.summary;

  return (
    <View style={cardS.body}>
      {/* Freshness indicator */}
      <View style={cardS.freshnessRow}>
        <View style={[cardS.freshDot, { backgroundColor: freshColor }]} />
        <Text style={[cardS.freshLabel, { color: freshColor }]}>
          {vt.freshnessLabel === 'live' ? 'OBD LIVE' :
           vt.freshnessLabel === 'reconnecting' ? 'UPDATING' :
           vt.freshnessLabel === 'last_known' ? 'LAST KNOWN' : 'OBD'}
        </Text>
        {vt.lastUpdatedText && (
          <Text style={cardS.freshTime}>{vt.lastUpdatedText}</Text>
        )}
      </View>

      {/* Engine status */}
      <MetricRow label="ENGINE" value={engineInfo.label} color={engineInfo.color} />

      {/* Battery voltage */}
      <MetricRow
        label="BATTERY"
        value={battery_voltage != null ? `${battery_voltage.toFixed(1)} V` : '\u2014'}
        color={getBattColor(battery_voltage)}
      />

      {/* Coolant temp */}
      {coolant_temp != null && (
        <MetricRow
          label="COOLANT"
          value={`${Math.round(coolant_temp)}°F`}
          color={getCoolantColor(coolant_temp)}
        />
      )}

      {/* Fuel level */}
      {fuel_level != null && (
        <MetricRow
          label="FUEL"
          value={`${Math.round(fuel_level)}%`}
          color={getFuelColor(fuel_level)}
        />
      )}

      {/* Speed (when moving) */}
      {vehicle_speed != null && vehicle_speed > 0 && (
        <MetricRow label="SPEED" value={`${Math.round(vehicle_speed)} mph`} />
      )}

      {/* RPM */}
      {engine_rpm != null && engine_rpm > 0 && (
        <MetricRow label="RPM" value={`${Math.round(engine_rpm)}`} />
      )}
    </View>
  );
}

const cardS = StyleSheet.create({
  body: { gap: 2 },
  freshnessRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  freshDot: { width: 5, height: 5, borderRadius: 3 },
  freshLabel: { fontSize: 7, fontWeight: '800', letterSpacing: 1.5 },
  freshTime: { fontSize: 7, fontWeight: '600', color: TACTICAL.textMuted, fontFamily: 'Courier', marginLeft: 'auto' },
  emptyState: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  emptyTitle: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted },
  emptyDesc: { fontSize: 8, fontWeight: '500', color: TACTICAL.textMuted, textAlign: 'center', opacity: 0.7 },
});

// ═══════════════════════════════════════════════════════════
// DETAIL MODE — Expanded view for WidgetDetailModal
// ═══════════════════════════════════════════════════════════

export function VehicleTelemetryDetailView() {
  const vt = useVehicleTelemetry();
  const scanner = useOBD2Scanner();
  const [alerts, setAlerts] = useState<OBDIntelligenceAlert[]>([]);

  // Evaluate alerts when telemetry changes
  useEffect(() => {
    if (vt.hasData) {
      const newAlerts = evaluateOBDTelemetry(vt.rawTelemetry);
      if (newAlerts.length > 0) {
        setAlerts(prev => [...newAlerts, ...prev].slice(0, 10));
      }
    }
  }, [vt.rawTelemetry.timestamp]);

  const freshColor = FRESHNESS_COLORS[vt.freshnessLabel] || TACTICAL.textMuted;
  const engineInfo = ENGINE_STATUS[vt.engineStatus] || ENGINE_STATUS.unknown;
  const raw = vt.rawTelemetry;
  const hasData = vt.hasData;

  // ── No data state ──
  if (!hasData && !scanner.isConnected) {
    return (
      <View style={detailS.container}>
        <Text style={detailS.section}>OBD-II VEHICLE TELEMETRY</Text>
        <View style={detailS.emptyCard}>
          <Ionicons name="car-outline" size={32} color={TACTICAL.textMuted} />
          <Text style={detailS.emptyTitle}>No OBD-II Adapter Connected</Text>
          <Text style={detailS.emptyDesc}>
            Connect a Bluetooth OBD-II adapter to monitor live vehicle health and performance data.
          </Text>
          <View style={detailS.adapterList}>
            <Text style={detailS.adapterListTitle}>SUPPORTED ADAPTERS</Text>
            {['OBDLink MX+', 'OBDLink CX', 'Veepeak BLE', 'BAFX', 'Carista'].map(name => (
              <View key={name} style={detailS.adapterRow}>
                <View style={detailS.adapterDot} />
                <Text style={detailS.adapterName}>{name}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={detailS.container}>
      {/* ═══ CONNECTION STATUS ═══ */}
      <Text style={detailS.section}>CONNECTION STATUS</Text>
      <View style={detailS.statusCard}>
        <View style={detailS.statusRow}>
          <View style={[detailS.statusDot, { backgroundColor: freshColor }]} />
          <Text style={[detailS.statusLabel, { color: freshColor }]}>
            {vt.freshnessLabel.toUpperCase().replace('_', ' ')}
          </Text>
          {vt.lastUpdatedText && (
            <Text style={detailS.statusTime}>{vt.lastUpdatedText}</Text>
          )}
        </View>
        {scanner.connectedDeviceName && (
          <MetricRow label="ADAPTER" value={scanner.connectedDeviceName} />
        )}
        {vt.primaryDevice?.protocol && (
          <MetricRow label="PROTOCOL" value={vt.primaryDevice.protocol} />
        )}
        <MetricRow label="POLLING" value={vt.isPolling ? 'ACTIVE' : 'INACTIVE'} color={vt.isPolling ? '#4CAF50' : TACTICAL.textMuted} />
      </View>

      {/* ═══ ENGINE ═══ */}
      <Text style={detailS.section}>ENGINE</Text>
      <MetricRow label="STATUS" value={engineInfo.label} color={engineInfo.color} />
      <MetricRow label="RPM" value={raw.engine_rpm != null ? `${Math.round(raw.engine_rpm)}` : '\u2014'} />
      <MetricRow label="LOAD" value={raw.engine_load != null ? `${Math.round(raw.engine_load)}%` : '\u2014'}
        color={raw.engine_load != null && raw.engine_load > 85 ? '#FFB300' : undefined} />
      <MetricRow label="THROTTLE" value={raw.throttle_position != null ? `${Math.round(raw.throttle_position)}%` : '\u2014'} />
      {raw.engine_runtime != null && (
        <MetricRow label="RUNTIME" value={raw.engine_runtime >= 3600
          ? `${Math.floor(raw.engine_runtime / 3600)}h ${Math.floor((raw.engine_runtime % 3600) / 60)}m`
          : `${Math.floor(raw.engine_runtime / 60)}m`} />
      )}

      {/* ═══ TEMPERATURES ═══ */}
      <View style={detailS.divider} />
      <Text style={detailS.section}>TEMPERATURES</Text>
      <MetricRow label="COOLANT" value={raw.coolant_temp != null ? `${Math.round(raw.coolant_temp)}°F` : '\u2014'}
        color={getCoolantColor(raw.coolant_temp ?? null)} />
      {raw.intake_temp != null && (
        <MetricRow label="INTAKE AIR" value={`${Math.round(raw.intake_temp)}°F`}
          color={raw.intake_temp > 150 ? '#FFB300' : undefined} />
      )}
      {raw.transmission_temp != null && (
        <MetricRow label="TRANSMISSION" value={`${Math.round(raw.transmission_temp)}°F`}
          color={raw.transmission_temp > 230 ? '#EF5350' : raw.transmission_temp > 200 ? '#FFB300' : undefined} />
      )}
      {raw.oil_temp != null && (
        <MetricRow label="OIL" value={`${Math.round(raw.oil_temp)}°F`} />
      )}
      {raw.ambient_temp != null && (
        <MetricRow label="AMBIENT" value={`${Math.round(raw.ambient_temp)}°F`} />
      )}

      {/* ═══ ELECTRICAL ═══ */}
      <View style={detailS.divider} />
      <Text style={detailS.section}>ELECTRICAL</Text>
      <MetricRow label="BATTERY VOLTAGE" value={raw.battery_voltage != null ? `${raw.battery_voltage.toFixed(1)} V` : '\u2014'}
        color={getBattColor(raw.battery_voltage ?? null)} />

      {/* ═══ FUEL ═══ */}
      <View style={detailS.divider} />
      <Text style={detailS.section}>FUEL</Text>
      <MetricRow label="LEVEL" value={raw.fuel_level != null ? `${Math.round(raw.fuel_level)}%` : '\u2014'}
        color={getFuelColor(raw.fuel_level ?? null)} />
      {raw.fuel_rate != null && (
        <MetricRow label="CONSUMPTION" value={`${raw.fuel_rate.toFixed(2)} gal/hr`} />
      )}

      {/* ═══ VEHICLE ═══ */}
      <View style={detailS.divider} />
      <Text style={detailS.section}>VEHICLE</Text>
      <MetricRow label="SPEED" value={raw.vehicle_speed != null ? `${Math.round(raw.vehicle_speed)} mph` : '\u2014'} />
      {raw.mass_air_flow != null && (
        <MetricRow label="MAF" value={`${raw.mass_air_flow.toFixed(1)} g/s`} />
      )}
      {raw.barometric_pressure != null && (
        <MetricRow label="BARO PRESSURE" value={`${raw.barometric_pressure.toFixed(0)} kPa`} />
      )}
      {raw.odometer != null && (
        <MetricRow label="ODOMETER" value={`${Math.round(raw.odometer).toLocaleString()} mi`} />
      )}

      {/* ═══ INTELLIGENCE ALERTS ═══ */}
      {alerts.length > 0 && (
        <>
          <View style={detailS.divider} />
          <Text style={detailS.section}>INTELLIGENCE ALERTS</Text>
          {alerts.slice(0, 5).map((alert, i) => (
            <View key={`${alert.id}-${i}`} style={[detailS.alertCard, {
              borderLeftColor: getAlertSeverityColor(alert.severity),
            }]}>
              <View style={detailS.alertHeader}>
                <Ionicons name="alert-circle-outline" size={12} color={getAlertSeverityColor(alert.severity)} />
                <Text style={[detailS.alertTitle, { color: getAlertSeverityColor(alert.severity) }]}>
                  {alert.title}
                </Text>
              </View>
              <Text style={detailS.alertMessage}>{alert.message}</Text>
            </View>
          ))}
        </>
      )}

      {/* ═══ DEVICE INFO ═══ */}
      <View style={detailS.divider} />
      <Text style={detailS.section}>DEVICE INFO</Text>
      <MetricRow label="DEVICES" value={`${vt.deviceCount}`} />
      <MetricRow label="PROVIDER" value={vt.activeProvider?.toUpperCase() || '\u2014'} />
      <MetricRow label="GRACE STATE" value={vt.graceState.toUpperCase()} />
      <MetricRow label="RECOVERY" value={vt.recoveryStatus.toUpperCase()} />
      {vt.primaryDevice?.firmware_version && (
        <MetricRow label="FIRMWARE" value={vt.primaryDevice.firmware_version} />
      )}
    </View>
  );
}

const detailS = StyleSheet.create({
  container: { gap: 2 },
  section: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5, marginTop: 8, marginBottom: 4 },
  divider: { height: 1, backgroundColor: TACTICAL.border, marginVertical: 8 },
  statusCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 10,
    gap: 4,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1.5 },
  statusTime: { fontSize: 8, fontWeight: '600', color: TACTICAL.textMuted, fontFamily: 'Courier', marginLeft: 'auto' },
  emptyCard: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: TACTICAL.textMuted },
  emptyDesc: { fontSize: 11, fontWeight: '500', color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 16, paddingHorizontal: 20 },
  adapterList: { marginTop: 12, gap: 6, alignSelf: 'stretch', paddingHorizontal: 20 },
  adapterListTitle: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5, marginBottom: 4 },
  adapterRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adapterDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: TACTICAL.amber + '60' },
  adapterName: { fontSize: 10, fontWeight: '600', color: TACTICAL.textMuted },
  alertCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#FFB300',
    padding: 10,
    gap: 4,
    marginBottom: 6,
  },
  alertHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  alertTitle: { fontSize: 10, fontWeight: '700', flex: 1 },
  alertMessage: { fontSize: 9, fontWeight: '500', color: TACTICAL.textMuted, lineHeight: 13 },
});




