/**
 * ECS Power System Detail — Expanded Multi-Provider Power Panel
 *
 * Phase 8: Multi-Provider Power Dashboard Detail View
 *
 * Opened when the user taps the Power System widget.
 * Shows all connected devices as individual ECS device cards with:
 *   - Device name + provider brand
 *   - Battery % with SOC bar
 *   - Input/output watts with flow bars
 *   - Charging/discharging/idle state
 *   - Connection state
 *   - Runtime estimate
 *   - Temperature (if available)
 *   - Solar input (if available)
 *   - Vehicle role assignment
 *
 * System-wide summary at top:
 *   - Total connected systems
 *   - Aggregated battery %
 *   - Total input/output/solar watts
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  useUnifiedPowerDevices,
  getBatteryColor,
  formatRuntime,
  CHARGING_STATE_CONFIG,
  CONNECTION_STATE_CONFIG,
  WARNING_STATE_CONFIG,
  type PowerDeviceReading,
} from './PowerSystemWidget';

// ── MetricRow ───────────────────────────────────────────────────────────

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={ds.metricRow}>
      <Text style={ds.metricLabel}>{label}</Text>
      <Text style={[ds.metricValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

// ── Power Flow Bar ──────────────────────────────────────────────────────

function PowerFlowBar({ label, watts, maxWatts, color, icon }: {
  label: string;
  watts: number;
  maxWatts: number;
  color: string;
  icon: string;
}) {
  const pct = maxWatts > 0 ? Math.min(100, Math.max(3, (watts / maxWatts) * 100)) : 0;

  return (
    <View style={ds.flowRow}>
      <View style={ds.flowIconWrap}>
        <Ionicons name={icon as any} size={12} color={color} />
      </View>
      <View style={ds.flowInfo}>
        <Text style={ds.flowLabel}>{label}</Text>
        <View style={ds.flowBarOuter}>
          <View style={[ds.flowBarFill, { width: `${pct}%`, backgroundColor: color }]} />
        </View>
      </View>
      <Text style={[ds.flowValue, { color: watts > 0 ? color : TACTICAL.textMuted }]}>
        {watts > 0 ? `${watts} W` : '\u2014'}
      </Text>
    </View>
  );
}

// ── Device Card ─────────────────────────────────────────────────────────

function DeviceCard({ device }: { device: PowerDeviceReading }) {
  const battPct = device.batteryPercent;
  const battColor = getBatteryColor(battPct);
  const stateConf = CHARGING_STATE_CONFIG[device.chargingState] || CHARGING_STATE_CONFIG.unknown;
  const connConf = CONNECTION_STATE_CONFIG[device.connectionState] || CONNECTION_STATE_CONFIG.connected;
  const warnConf = WARNING_STATE_CONFIG[device.warningState] || WARNING_STATE_CONFIG.normal;
  const isWarning = device.warningState !== 'normal';
  const isDisconnected = device.connectionState === 'disconnected';
  const dimColor = isDisconnected || device.isStale;

  const inputW = device.inputWatts ?? 0;
  const outputW = device.outputWatts ?? 0;
  const solarW = device.solarInputWatts ?? 0;
  const maxW = Math.max(inputW, outputW, solarW, 100);

  return (
    <View style={[ds.deviceCard, device.isPrimary && ds.deviceCardPrimary]}>
      {/* ── Card Header ── */}
      <View style={ds.cardHeader}>
        <View style={ds.cardHeaderLeft}>
          {device.isPrimary && (
            <View style={ds.primaryBadge}>
              <Text style={ds.primaryBadgeText}>PRIMARY</Text>
            </View>
          )}
          <Text style={[ds.cardDeviceName, dimColor && { color: TACTICAL.textMuted }]} numberOfLines={1}>
            {device.deviceName}
          </Text>
        </View>
        <View style={[ds.providerChip, { borderColor: device.providerAccentColor + '40' }]}>
          <View style={[ds.providerDot, { backgroundColor: device.providerAccentColor }]} />
          <Text style={[ds.providerLabel, { color: device.providerAccentColor }]}>
            {device.providerDisplayName}
          </Text>
        </View>
      </View>

      {/* ── Model + Connection ── */}
      <View style={ds.cardSubRow}>
        <Text style={ds.cardModel}>{device.model}</Text>
        <View style={ds.cardConnRow}>
          <View style={[ds.connDot, { backgroundColor: connConf.color }]} />
          <Text style={[ds.connLabel, { color: connConf.color }]}>{connConf.label}</Text>
        </View>
      </View>

      {/* ── SOC Display ── */}
      {battPct != null && (
        <View style={ds.socSection}>
          <View style={ds.socHeader}>
            <Text style={[ds.socBigValue, { color: dimColor ? TACTICAL.textMuted : battColor }]}>
              {battPct}
            </Text>
            <Text style={[ds.socBigUnit, { color: dimColor ? TACTICAL.textMuted : battColor }]}>%</Text>
            <View style={[ds.chargingBadge, { backgroundColor: `${stateConf.color}12` }]}>
              <Ionicons name={stateConf.icon as any} size={9} color={stateConf.color} />
              <Text style={[ds.chargingLabel, { color: stateConf.color }]}>{stateConf.label}</Text>
            </View>
          </View>
          <View style={ds.socBarOuter}>
            <View
              style={[
                ds.socBarFill,
                {
                  width: `${Math.min(100, Math.max(0, battPct))}%`,
                  backgroundColor: dimColor ? TACTICAL.textMuted : battColor,
                },
              ]}
            />
            {/* Threshold markers */}
            <View style={[ds.socMarker, { left: '25%' }]} />
            <View style={[ds.socMarker, { left: '60%' }]} />
          </View>
        </View>
      )}

      {/* ── Power Flow ── */}
      {(inputW > 0 || outputW > 0 || solarW > 0) && (
        <View style={ds.flowSection}>
          {solarW > 0 && (
            <PowerFlowBar label="SOLAR" watts={solarW} maxWatts={maxW} color="#FFB300" icon="sunny-outline" />
          )}
          {inputW > 0 && (
            <PowerFlowBar label="INPUT" watts={inputW} maxWatts={maxW} color="#4FC3F7" icon="flash-outline" />
          )}
          {outputW > 0 && (
            <PowerFlowBar label="OUTPUT" watts={outputW} maxWatts={maxW} color={TACTICAL.amber} icon="power-outline" />
          )}
        </View>
      )}

      {/* ── Extended Metrics ── */}
      <View style={ds.metricsSection}>
        {device.estimatedRuntimeMinutes != null && device.estimatedRuntimeMinutes > 0 && (
          <MetricRow
            label="RUNTIME"
            value={formatRuntime(device.estimatedRuntimeMinutes)}
            color={
              dimColor
                ? TACTICAL.textMuted
                : (device.estimatedRuntimeMinutes ?? 0) < 60
                ? '#EF5350'
                : (device.estimatedRuntimeMinutes ?? 0) < 180
                ? '#FFB300'
                : '#4CAF50'
            }
          />
        )}
        {device.temperatureCelsius != null && (
          <MetricRow
            label="TEMPERATURE"
            value={`${device.temperatureCelsius}°C`}
            color={device.temperatureCelsius > 45 ? '#EF5350' : device.temperatureCelsius > 35 ? '#FFB300' : undefined}
          />
        )}
        {device.batteryVolts != null && (
          <MetricRow label="VOLTAGE" value={`${device.batteryVolts.toFixed(1)} V`} />
        )}
        {device.role && (
          <MetricRow label="ROLE" value={device.role} color={TACTICAL.amber} />
        )}
      </View>

      {/* ── Warning Banner ── */}
      {isWarning && (
        <View style={[ds.warningBanner, { backgroundColor: `${warnConf.color}0C`, borderColor: `${warnConf.color}25` }]}>
          <Ionicons name={warnConf.icon as any} size={10} color={warnConf.color} />
          <Text style={[ds.warningText, { color: warnConf.color }]}>{warnConf.label}</Text>
        </View>
      )}

      {/* ── Disconnected Overlay ── */}
      {isDisconnected && (
        <View style={ds.disconnectedOverlay}>
          <Ionicons name="cloud-offline-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={ds.disconnectedText}>Last known values preserved</Text>
        </View>
      )}
    </View>
  );
}

// ── Main Detail Component ───────────────────────────────────────────────

export function PowerSystemDetailView() {
  const power = useUnifiedPowerDevices();
  const {
    devices,
    primaryDevice,
    totalConnected,
    totalInputWatts,
    totalOutputWatts,
    totalSolarWatts,
    aggregatedBatteryPercent,
    isAnyReconnecting,
  } = power;

  // ── Empty State ──
  if (devices.length === 0) {
    return (
      <View style={ds.container}>
        <Text style={ds.sectionTitle}>ECS POWER SYSTEMS</Text>
        <View style={ds.emptyCard}>
          <Ionicons name="battery-dead-outline" size={28} color={TACTICAL.textMuted} />
          <Text style={ds.emptyTitle}>No Power Systems Connected</Text>
          <Text style={ds.emptySubtitle}>
            Connect a power system via the Power tab to monitor battery, solar, and load telemetry.
          </Text>
          <View style={ds.supportedRow}>
            <Text style={ds.supportedLabel}>SUPPORTED PROVIDERS</Text>
            <View style={ds.brandRow}>
              {(['ecoflow', 'bluetti', 'anker_solix', 'jackery', 'goal_zero', 'renogy'] as const).map((id) => {
                const b = require('../../src/power/providers/EcsProviderRegistry').ECS_PROVIDER_BRANDING[id];
                return (
                  <View key={id} style={[ds.brandChip, { borderColor: b.accentColor + '30' }]}>
                    <View style={[ds.brandDot, { backgroundColor: b.accentColor }]} />
                    <Text style={[ds.brandName, { color: b.accentColor }]}>{b.displayName}</Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>
      </View>
    );
  }

  // ── System Summary ──
  const aggBattColor = getBatteryColor(aggregatedBatteryPercent);
  const netW = totalInputWatts - totalOutputWatts;
  const netColor = netW > 0 ? '#4CAF50' : netW < 0 ? '#EF5350' : TACTICAL.textMuted;
  const netLabel = netW > 0 ? `+${netW} W` : netW < 0 ? `${netW} W` : '0 W';

  return (
    <View style={ds.container}>
      {/* ═══ SYSTEM SUMMARY ═══ */}
      <Text style={ds.sectionTitle}>SYSTEM SUMMARY</Text>

      <View style={ds.summaryCard}>
        <View style={ds.summaryRow}>
          {/* Aggregated SOC */}
          <View style={ds.summaryCell}>
            <Text style={ds.summaryCellLabel}>SYSTEM SOC</Text>
            <Text style={[ds.summaryCellValue, { color: aggBattColor }]}>
              {aggregatedBatteryPercent != null ? `${aggregatedBatteryPercent}%` : '\u2014'}
            </Text>
          </View>
          <View style={ds.summaryDivider} />
          {/* Connected Systems */}
          <View style={ds.summaryCell}>
            <Text style={ds.summaryCellLabel}>SYSTEMS</Text>
            <Text style={ds.summaryCellValue}>{totalConnected}</Text>
          </View>
          <View style={ds.summaryDivider} />
          {/* Net Power */}
          <View style={ds.summaryCell}>
            <Text style={ds.summaryCellLabel}>NET POWER</Text>
            <Text style={[ds.summaryCellValue, { color: netColor, fontSize: 13 }]}>{netLabel}</Text>
          </View>
        </View>

        {/* Aggregated SOC bar */}
        {aggregatedBatteryPercent != null && (
          <View style={ds.aggSocBarOuter}>
            <View
              style={[
                ds.aggSocBarFill,
                {
                  width: `${Math.min(100, Math.max(0, aggregatedBatteryPercent))}%`,
                  backgroundColor: aggBattColor,
                },
              ]}
            />
          </View>
        )}

        {/* Power totals */}
        <View style={ds.summaryMetrics}>
          <MetricRow label="TOTAL INPUT" value={totalInputWatts > 0 ? `${totalInputWatts} W` : '\u2014'} color={totalInputWatts > 0 ? '#4FC3F7' : undefined} />
          <MetricRow label="TOTAL OUTPUT" value={totalOutputWatts > 0 ? `${totalOutputWatts} W` : '\u2014'} color={totalOutputWatts > 0 ? TACTICAL.amber : undefined} />
          {totalSolarWatts > 0 && (
            <MetricRow label="TOTAL SOLAR" value={`${totalSolarWatts} W`} color="#FFB300" />
          )}
        </View>

        {/* Reconnecting indicator */}
        {isAnyReconnecting && (
          <View style={ds.reconnectingRow}>
            <Ionicons name="sync-outline" size={9} color="#FFB300" />
            <Text style={ds.reconnectingText}>Reconnecting to one or more systems\u2026</Text>
          </View>
        )}
      </View>

      {/* ═══ DEVICE CARDS ═══ */}
      <View style={ds.divider} />
      <Text style={ds.sectionTitle}>CONNECTED DEVICES</Text>

      {/* Primary device first, then secondary */}
      {devices
        .sort((a, b) => {
          if (a.isPrimary && !b.isPrimary) return -1;
          if (!a.isPrimary && b.isPrimary) return 1;
          // Connected before disconnected
          if (a.connectionState === 'connected' && b.connectionState !== 'connected') return -1;
          if (a.connectionState !== 'connected' && b.connectionState === 'connected') return 1;
          return 0;
        })
        .map((device) => (
          <DeviceCard key={device.deviceId} device={device} />
        ))}

      {/* ═══ ENGINE INFO ═══ */}
      <View style={ds.divider} />
      <Text style={ds.sectionTitle}>ECS POWER ENGINE</Text>
      <MetricRow label="VERSION" value="v8.0 (Phase 8)" />
      <MetricRow label="PROVIDERS" value="6 (EcoFlow, Bluetti, Anker, Jackery, Goal Zero, Renogy)" />
      <MetricRow label="ARCHITECTURE" value="Universal Provider Contract" />
      <MetricRow label="TRANSPORT" value="BLE + Cloud API" />
      <MetricRow label="RENDERING" value="Provider-agnostic unified cards" />
      <MetricRow label="ACTIVE DEVICES" value={`${devices.length}`} />
      <MetricRow
        label="PRIMARY"
        value={primaryDevice?.deviceName ?? 'Auto-selected'}
        color={TACTICAL.amber}
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────

const ds = StyleSheet.create({
  container: {
    gap: 2,
  },

  // ── Section ──
  sectionTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    marginTop: 8,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: TACTICAL.border,
    marginVertical: 8,
  },

  // ── Summary Card ──
  summaryCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  summaryCell: {
    flex: 1,
    alignItems: 'center',
  },
  summaryCellLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
    textAlign: 'center',
  },
  summaryCellValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 4,
  },
  aggSocBarOuter: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 6,
  },
  aggSocBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  summaryMetrics: {
    marginTop: 4,
  },
  reconnectingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,179,0,0.06)',
  },
  reconnectingText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#FFB300',
    fontStyle: 'italic',
  },

  // ── Device Card ──
  deviceCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
    marginBottom: 8,
  },
  deviceCardPrimary: {
    borderColor: TACTICAL.amber + '30',
    backgroundColor: 'rgba(196,138,44,0.03)',
  },

  // ── Card Header ──
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: 6,
    marginRight: 8,
  },
  primaryBadge: {
    backgroundColor: TACTICAL.amber + '18',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 3,
  },
  primaryBadgeText: {
    fontSize: 6,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  cardDeviceName: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
    flex: 1,
  },
  providerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
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

  // ── Card Sub Row ──
  cardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cardModel: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  cardConnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  connDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  connLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ── SOC Section ──
  socSection: {
    marginBottom: 6,
  },
  socHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 4,
    gap: 2,
  },
  socBigValue: {
    fontSize: 32,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  socBigUnit: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 4,
  },
  chargingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    marginLeft: 8,
  },
  chargingLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },
  socBarOuter: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  socBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  socMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },

  // ── Flow Section ──
  flowSection: {
    marginBottom: 4,
    gap: 2,
  },
  flowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.03)',
  },
  flowIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowInfo: {
    flex: 1,
    gap: 2,
  },
  flowLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  flowBarOuter: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  flowBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  flowValue: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'Courier',
    minWidth: 48,
    textAlign: 'right',
  },

  // ── Metrics Section ──
  metricsSection: {
    marginTop: 2,
  },
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

  // ── Warning Banner ──
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  warningText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ── Disconnected Overlay ──
  disconnectedOverlay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  disconnectedText: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },

  // ── Empty State ──
  emptyCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  emptySubtitle: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
    opacity: 0.8,
  },
  supportedRow: {
    marginTop: 12,
    alignItems: 'center',
    gap: 6,
  },
  supportedLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  brandRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
  },
  brandChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    borderWidth: 1,
  },
  brandDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  brandName: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});




