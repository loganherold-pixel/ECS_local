import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { getActiveVehicleContext } from '../../lib/activeVehicleContext';
import {
  useUnifiedPowerDevices,
  getBatteryColor,
  formatRuntime,
  formatLastUpdatedTime,
  CHARGING_STATE_CONFIG,
  WARNING_STATE_CONFIG,
  type PowerDeviceReading,
} from './PowerSystemWidget';
import { resolvePowerWidgetPresentation } from '../../lib/resource/resourceCommandResolvers';
import type { ECSAIState } from '../../lib/ai/aiOrchestrator';
import type { ECSOrchestratorTargetView } from '../../lib/ai/orchestratorSelectors';
import {
  WidgetDetailLeadCard,
  WidgetDetailSectionTitle,
  WidgetDetailStateCard,
} from './WidgetDetailChrome';

type PowerSystemDetailData = {
  aiState?: ECSAIState | null;
  aiDashboardView?: ECSOrchestratorTargetView | null;
};

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={ds.metricRow}>
      <Text style={ds.metricLabel}>{label}</Text>
      <Text style={[ds.metricValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function PowerFlowBar({ label, watts, maxWatts, color, icon }: { label: string; watts: number; maxWatts: number; color: string; icon: string }) {
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
      <Text style={[ds.flowValue, { color: watts > 0 ? color : TACTICAL.textMuted }]}>{watts > 0 ? `${watts} W` : '\u2014'}</Text>
    </View>
  );
}

function DeviceCard({ device }: { device: PowerDeviceReading }) {
  const battPct = device.batteryPercent;
  const battColor = getBatteryColor(battPct);
  const stateConf = CHARGING_STATE_CONFIG[device.chargingState] || CHARGING_STATE_CONFIG.unknown;
  const warnConf = WARNING_STATE_CONFIG[device.warningState] || WARNING_STATE_CONFIG.normal;
  const isWarning = device.warningState !== 'normal';
  const isDisconnected = device.connectionState === 'disconnected';
  const dimColor = isDisconnected || device.isStale;
  const readinessColor =
    device.readinessState === 'connected'
      ? '#4CAF50'
      : device.readinessState === 'manual'
        ? TACTICAL.amber
        : device.readinessState === 'partial'
          ? '#FFB300'
          : TACTICAL.textMuted;

  const inputW = device.inputWatts ?? 0;
  const outputW = device.outputWatts ?? 0;
  const solarW = device.solarInputWatts ?? 0;
  const maxW = Math.max(inputW, outputW, solarW, 100);

  return (
    <View style={[ds.deviceCard, device.isPrimary && ds.deviceCardPrimary]}>
      <View style={ds.cardHeader}>
        <View style={ds.cardHeaderLeft}>
          {device.isPrimary && (
            <View style={ds.primaryBadge}><Text style={ds.primaryBadgeText}>PRIMARY</Text></View>
          )}
          <Text style={[ds.cardDeviceName, dimColor && { color: TACTICAL.textMuted }]} numberOfLines={1}>{device.deviceName}</Text>
        </View>
        <View style={[ds.providerChip, { borderColor: device.providerAccentColor + '40' }]}>
          <View style={[ds.providerDot, { backgroundColor: device.providerAccentColor }]} />
          <Text style={[ds.providerLabel, { color: device.providerAccentColor }]}>{device.providerDisplayName}</Text>
        </View>
      </View>

      <View style={ds.cardSubRow}>
        <Text style={ds.cardModel}>{device.model}</Text>
        <View style={ds.cardConnRow}>
          <View style={[ds.connDot, { backgroundColor: readinessColor }]} />
          <Text style={[ds.connLabel, { color: readinessColor }]}>{device.readinessLabel}</Text>
        </View>
      </View>

      {battPct != null && (
        <View style={ds.socSection}>
          <View style={ds.socHeader}>
            <Text style={[ds.socBigValue, { color: dimColor ? TACTICAL.textMuted : battColor }]}>{battPct}</Text>
            <Text style={[ds.socBigUnit, { color: dimColor ? TACTICAL.textMuted : battColor }]}>%</Text>
            <View style={[ds.chargingBadge, { backgroundColor: `${stateConf.color}12` }]}>
              <Ionicons name={stateConf.icon as any} size={9} color={stateConf.color} />
              <Text style={[ds.chargingLabel, { color: stateConf.color }]}>{stateConf.label}</Text>
            </View>
          </View>
          <View style={ds.socBarOuter}>
            <View style={[ds.socBarFill, { width: `${Math.min(100, Math.max(0, battPct))}%`, backgroundColor: dimColor ? TACTICAL.textMuted : battColor }]} />
            <View style={[ds.socMarker, { left: '25%' }]} />
            <View style={[ds.socMarker, { left: '60%' }]} />
          </View>
        </View>
      )}

      {(inputW > 0 || outputW > 0 || solarW > 0) && (
        <View style={ds.flowSection}>
          {solarW > 0 && <PowerFlowBar label="SOLAR" watts={solarW} maxWatts={maxW} color="#FFB300" icon="sunny-outline" />}
          {inputW > 0 && <PowerFlowBar label="INPUT" watts={inputW} maxWatts={maxW} color="#4FC3F7" icon="flash-outline" />}
          {outputW > 0 && <PowerFlowBar label="OUTPUT" watts={outputW} maxWatts={maxW} color={TACTICAL.amber} icon="power-outline" />}
        </View>
      )}

      <View style={ds.metricsSection}>
        {device.estimatedRuntimeMinutes != null && device.estimatedRuntimeMinutes > 0 && (
          <MetricRow label="RUNTIME" value={formatRuntime(device.estimatedRuntimeMinutes)} color={dimColor ? TACTICAL.textMuted : device.estimatedRuntimeMinutes < 60 ? '#EF5350' : device.estimatedRuntimeMinutes < 180 ? '#FFB300' : '#4CAF50'} />
        )}
        {device.temperatureCelsius != null && <MetricRow label="TEMPERATURE" value={`${device.temperatureCelsius}\u00B0C`} color={device.temperatureCelsius > 45 ? '#EF5350' : device.temperatureCelsius > 35 ? '#FFB300' : undefined} />}
        {device.batteryVolts != null && <MetricRow label="VOLTAGE" value={`${device.batteryVolts.toFixed(1)} V`} />}
        {device.batteryAmps != null && <MetricRow label="CURRENT" value={`${device.batteryAmps > 0 ? '+' : ''}${device.batteryAmps.toFixed(1)} A`} color={device.batteryAmps >= 0 ? '#4CAF50' : '#FFB300'} />}
        {device.signalStrength != null && <MetricRow label="SIGNAL" value={`${Math.round(device.signalStrength)} dBm`} color={device.signalStrength >= -60 ? '#4CAF50' : device.signalStrength >= -75 ? '#FFB300' : '#EF5350'} />}
        {device.lastUpdated > 0 && <MetricRow label="UPDATED" value={formatLastUpdatedTime(device.lastUpdated)} color={device.isStale ? '#FFB300' : TACTICAL.text} />}
        {device.role && <MetricRow label="ROLE" value={device.role} color={TACTICAL.amber} />}
      </View>

      {isWarning && (
        <View style={[ds.warningBanner, { backgroundColor: `${warnConf.color}0C`, borderColor: `${warnConf.color}25` }]}>
          <Ionicons name={warnConf.icon as any} size={10} color={warnConf.color} />
          <Text style={[ds.warningText, { color: warnConf.color }]}>{warnConf.label}</Text>
        </View>
      )}

      {isDisconnected && (
        <View style={ds.disconnectedOverlay}>
          <Ionicons name="cloud-offline-outline" size={10} color={TACTICAL.textMuted} />
          <Text style={ds.disconnectedText}>Partial state using last known values</Text>
        </View>
      )}
    </View>
  );
}

export function PowerSystemDetailView({ data }: { data?: PowerSystemDetailData }) {
  const power = useUnifiedPowerDevices();
  const { devices, totalConnected, totalInputWatts, totalOutputWatts, totalSolarWatts, aggregatedBatteryPercent, isAnyReconnecting } = power;
  const activeVehicleContext = getActiveVehicleContext();
  const configuredBatteryWh = activeVehicleContext.resourceProfile.batteryUsableWh ?? null;
  const hasConfiguredPowerProfile = configuredBatteryWh != null && configuredBatteryWh > 0;
  const configuredRuntimeMinutes = hasConfiguredPowerProfile ? Math.round((configuredBatteryWh / 50) * 60) : null;
  const primaryDevice =
    devices.find((device) => device.connectionState === 'connected' && !device.isStale)
    ?? devices.find((device) => device.isPrimary)
    ?? devices[0]
    ?? null;
  const presentation = resolvePowerWidgetPresentation({
    batteryPercent: primaryDevice?.batteryPercent ?? aggregatedBatteryPercent ?? null,
    runtimeMinutes: primaryDevice?.estimatedRuntimeMinutes ?? configuredRuntimeMinutes,
    inputWatts: totalInputWatts,
    outputWatts: totalOutputWatts,
    solarWatts: totalSolarWatts,
    connectedDeviceCount: totalConnected,
    providerTelemetry: data?.aiState?.richContext?.resources?.providerTelemetry ?? null,
    aiState: data?.aiState ?? null,
    dashboardView: data?.aiDashboardView ?? null,
  });
  const presentationTone =
    presentation.detail.tone === 'critical'
      ? 'critical'
      : presentation.detail.tone === 'attention' || presentation.detail.tone === 'warning'
        ? 'attention'
        : presentation.detail.tone === 'good'
          ? 'live'
          : 'neutral';

  if (devices.length === 0) {
    if (hasConfiguredPowerProfile) {
      return (
        <View style={ds.container}>
          <WidgetDetailLeadCard
            eyebrow={presentation.detail.eyebrow}
            title={presentation.detail.title}
            summary={presentation.detail.summary}
            tone={presentationTone}
            metaLines={[presentation.detail.sourceLine, presentation.detail.rationaleLine]}
          />
          <WidgetDetailStateCard
            title="Configured power baseline"
            message="No live power device is connected. ECS is using the saved vehicle power profile from Fleet."
            badgeLabel="PROFILE FALLBACK"
            tone="manual"
            icon="battery-charging-outline"
          >
            <View style={ds.summaryMetrics}>
              <MetricRow
                label="CAPACITY"
                value={`${Math.round(configuredBatteryWh).toLocaleString()} Wh`}
                color={TACTICAL.text}
              />
              <MetricRow
                label="EST. RUNTIME"
                value={configuredRuntimeMinutes != null ? formatRuntime(configuredRuntimeMinutes) : '\u2014'}
                color={TACTICAL.textMuted}
              />
              <MetricRow
                label="MOUNTED SYSTEMS"
                value={activeVehicleContext.zoneSummary || 'Vehicle profile only'}
                color={TACTICAL.amber}
              />
            </View>
          </WidgetDetailStateCard>
        </View>
      );
    }

    return (
      <View style={ds.container}>
        <WidgetDetailLeadCard
          eyebrow={presentation.detail.eyebrow}
          title={presentation.detail.title}
          summary={presentation.detail.summary}
          tone={presentationTone}
          metaLines={[presentation.detail.sourceLine, presentation.detail.rationaleLine]}
        />
        <WidgetDetailStateCard
          title="No power systems connected"
          message="Shared power authority is not reporting a connected or last-known power source."
          badgeLabel="UNAVAILABLE"
          tone="muted"
          icon="battery-dead-outline"
        >
          <View style={ds.supportedRow}>
            <Text style={ds.supportedLabel}>SUPPORTED PROVIDERS</Text>
            <View style={ds.brandRow}>
              {[
                ['EcoFlow', '#00A6FF'],
                ['Bluetti', '#2196F3'],
                ['Anker SOLIX', '#00C4B4'],
                ['Jackery', '#FF8C00'],
                ['Goal Zero', '#4CAF50'],
                ['Renogy', '#9C27B0'],
                ['REDARC', '#C62828'],
                ['Dakota Lithium', '#6FBF4B'],
              ].map(([name, color]) => (
                <View key={name} style={[ds.brandChip, { borderColor: `${color}30` }]}>
                  <View style={[ds.brandDot, { backgroundColor: color }]} />
                  <Text style={[ds.brandName, { color }]}>{name}</Text>
                </View>
              ))}
            </View>
          </View>
        </WidgetDetailStateCard>
      </View>
    );
  }

  const aggBattColor = getBatteryColor(aggregatedBatteryPercent);
  const netW = totalInputWatts - totalOutputWatts;
  const netColor = netW > 0 ? '#4CAF50' : netW < 0 ? '#EF5350' : TACTICAL.textMuted;
  const netLabel = netW > 0 ? `+${netW} W` : netW < 0 ? `${netW} W` : '0 W';

  return (
    <View style={ds.container}>
      <WidgetDetailLeadCard
        eyebrow={presentation.detail.eyebrow}
        title={presentation.detail.title}
        summary={presentation.detail.summary}
        tone={presentationTone}
        metaLines={[presentation.detail.sourceLine, presentation.detail.rationaleLine]}
      />
      <WidgetDetailSectionTitle>SYSTEM SUMMARY</WidgetDetailSectionTitle>
      <View style={ds.summaryCard}>
        <View style={ds.summaryRow}>
          <View style={ds.summaryCell}>
            <Text style={ds.summaryCellLabel}>SYSTEM SOC</Text>
            <Text style={[ds.summaryCellValue, { color: aggBattColor }]}>{aggregatedBatteryPercent != null ? `${aggregatedBatteryPercent}%` : '\u2014'}</Text>
          </View>
          <View style={ds.summaryDivider} />
          <View style={ds.summaryCell}>
            <Text style={ds.summaryCellLabel}>SYSTEMS</Text>
            <Text style={ds.summaryCellValue}>{totalConnected}</Text>
          </View>
          <View style={ds.summaryDivider} />
          <View style={ds.summaryCell}>
            <Text style={ds.summaryCellLabel}>NET</Text>
            <Text style={[ds.summaryCellValue, { color: netColor }]}>{netLabel}</Text>
          </View>
        </View>
        {aggregatedBatteryPercent != null && (
          <View style={ds.aggSocBarOuter}>
            <View style={[ds.aggSocBarFill, { width: `${Math.min(100, Math.max(0, aggregatedBatteryPercent))}%`, backgroundColor: aggBattColor }]} />
          </View>
        )}
        <View style={ds.summaryMetrics}>
          <MetricRow label="INPUT" value={totalInputWatts > 0 ? `${totalInputWatts} W` : '\u2014'} color="#4FC3F7" />
          <MetricRow label="OUTPUT" value={totalOutputWatts > 0 ? `${totalOutputWatts} W` : '\u2014'} color={TACTICAL.amber} />
          <MetricRow label="SOLAR" value={totalSolarWatts > 0 ? `${totalSolarWatts} W` : '\u2014'} color="#FFB300" />
        </View>
        {isAnyReconnecting && (
          <View style={ds.reconnectingRow}>
            <Ionicons name="sync-outline" size={10} color="#FFB300" />
            <Text style={ds.reconnectingText}>Partial provider state while telemetry reconnects</Text>
          </View>
        )}
      </View>

      <WidgetDetailSectionTitle>CONNECTED DEVICES</WidgetDetailSectionTitle>
      {devices.map((device) => <DeviceCard key={device.deviceId} device={device} />)}
    </View>
  );
}

export default PowerSystemDetailView;

const ds = StyleSheet.create({
  container: { gap: 10 },
  commandBanner: { gap: 4, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(79,195,247,0.18)', backgroundColor: 'rgba(79,195,247,0.05)' },
  commandBannerWatch: { borderColor: 'rgba(255,179,0,0.28)', backgroundColor: 'rgba(255,179,0,0.06)' },
  commandBannerCritical: { borderColor: 'rgba(239,83,80,0.32)', backgroundColor: 'rgba(239,83,80,0.08)' },
  commandEyebrow: { color: '#4FC3F7', fontSize: 8, fontWeight: '900', letterSpacing: 1.4 },
  commandEyebrowWatch: { color: '#FFB300' },
  commandEyebrowCritical: { color: '#EF5350' },
  commandTitle: { color: TACTICAL.text, fontSize: 13, fontWeight: '800', letterSpacing: 0.2 },
  commandSummary: { color: TACTICAL.text, fontSize: 10, fontWeight: '700', lineHeight: 14 },
  commandMeta: { color: TACTICAL.textMuted, fontSize: 9, fontWeight: '600', lineHeight: 13 },
  sectionTitle: { color: TACTICAL.amber, fontSize: 10, fontWeight: '900', letterSpacing: 1.4, marginBottom: 2 },
  summaryCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 12 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryCellLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 4, textAlign: 'center' },
  summaryCellValue: { fontSize: 18, fontWeight: '900', color: TACTICAL.text },
  summaryDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.08)', marginHorizontal: 4 },
  aggSocBarOuter: { height: 6, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginTop: 10, marginBottom: 6 },
  aggSocBarFill: { height: '100%', borderRadius: 3 },
  summaryMetrics: { marginTop: 4 },
  reconnectingRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, backgroundColor: 'rgba(255,179,0,0.06)' },
  reconnectingText: { fontSize: 8, fontWeight: '600', color: '#FFB300', fontStyle: 'italic' },
  deviceCard: { backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 12, marginBottom: 8 },
  deviceCardPrimary: { borderColor: TACTICAL.amber + '30', backgroundColor: 'rgba(196,138,44,0.03)' },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6, marginRight: 8 },
  primaryBadge: { backgroundColor: TACTICAL.amber + '18', paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  primaryBadgeText: { fontSize: 6, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  cardDeviceName: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.3, flex: 1 },
  providerChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  providerDot: { width: 4, height: 4, borderRadius: 2 },
  providerLabel: { fontSize: 7, fontWeight: '700', letterSpacing: 0.5 },
  cardSubRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  cardModel: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 0.5 },
  cardConnRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  connDot: { width: 5, height: 5, borderRadius: 3 },
  connLabel: { fontSize: 7, fontWeight: '700', letterSpacing: 1 },
  socSection: { marginBottom: 6 },
  socHeader: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4, gap: 2 },
  socBigValue: { fontSize: 32, fontWeight: '900' },
  socBigUnit: { fontSize: 14, fontWeight: '800', marginBottom: 4 },
  chargingBadge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginLeft: 8 },
  chargingLabel: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  socBarOuter: { height: 8, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 4, overflow: 'hidden', position: 'relative' },
  socBarFill: { height: '100%', borderRadius: 4 },
  socMarker: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
  flowSection: { marginBottom: 4, gap: 2 },
  flowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.03)' },
  flowIconWrap: { width: 24, height: 24, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.04)', alignItems: 'center', justifyContent: 'center' },
  flowInfo: { flex: 1 },
  flowLabel: { color: TACTICAL.textMuted, fontSize: 8, fontWeight: '800', letterSpacing: 0.8, marginBottom: 4 },
  flowBarOuter: { height: 6, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)', overflow: 'hidden' },
  flowBarFill: { height: '100%', borderRadius: 4 },
  flowValue: { minWidth: 48, textAlign: 'right', fontSize: 9.5, fontWeight: '700' },
  metricsSection: { marginTop: 4 },
  metricRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 3 },
  metricLabel: { color: TACTICAL.textMuted, fontSize: 8.5, fontWeight: '800', letterSpacing: 0.8 },
  metricValue: { color: TACTICAL.text, fontSize: 10, fontWeight: '800' },
  warningBanner: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5, borderWidth: 1 },
  warningText: { fontSize: 8.5, fontWeight: '800', letterSpacing: 0.7 },
  disconnectedOverlay: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' },
  disconnectedText: { fontSize: 8, fontWeight: '600', color: TACTICAL.textMuted, fontStyle: 'italic' },
  emptyCard: { backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', padding: 20, alignItems: 'center', gap: 8 },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },
  emptySubtitle: { fontSize: 10, fontWeight: '600', color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 16, opacity: 0.8 },
  supportedRow: { marginTop: 12, alignItems: 'center', gap: 6 },
  supportedLabel: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  brandRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4 },
  brandChip: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, borderWidth: 1 },
  brandDot: { width: 4, height: 4, borderRadius: 2 },
  brandName: { fontSize: 7, fontWeight: '700', letterSpacing: 0.5 },
});
