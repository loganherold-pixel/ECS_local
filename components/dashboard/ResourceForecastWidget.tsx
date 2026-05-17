/**
 * Resource Forecast Widget — Dashboard Integration
 *
 * Compact and card views for the Resource Forecast Engine.
 * Shows resource sufficiency level, fuel/water/power status,
 * and terrain-adjusted margins.
 *
 * Compact mode: Sufficiency label + F/W/P status indicators
 * Card mode: Sufficiency badge + resource bars + margin values
 * Detail mode: Full breakdown with notes, penalties, and planning
 */

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import { WidgetCompactRow } from './WidgetChrome';
import {
  type ResourceForecast,
  type ForecastStatus,
  type SufficiencyLevel,
  resourceForecastEngine,
  SUFFICIENCY_CONFIGS,
} from '../../lib/resourceForecastEngine';

// ── Shared Helpers ──────────────────────────────────────────

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

function ResourceBar({
  label,
  icon,
  iconColor,
  status,
  available,
  required,
  margin,
  unit,
}: {
  label: string;
  icon: string;
  iconColor: string;
  status: ForecastStatus;
  available: number;
  required: number;
  margin: number;
  unit: string;
}) {
  const statusColor = resourceForecastEngine.getStatusColor(status);
  const pct = required > 0 ? Math.min(100, (available / required) * 100) : 100;

  return (
    <View style={barS.container}>
      <View style={barS.headerRow}>
        <Ionicons name={icon as any} size={11} color={iconColor} />
        <Text style={barS.label}>{label}</Text>
        <View style={[barS.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[barS.marginText, { color: statusColor }]}>
          {margin >= 0 ? '+' : ''}{margin.toFixed(1)} {unit}
        </Text>
      </View>
      <View style={barS.track}>
        <View style={[barS.fill, { width: `${Math.min(100, Math.max(0, pct))}%`, backgroundColor: statusColor }]} />
        {required > 0 && <View style={barS.marker} />}
      </View>
      <View style={barS.valuesRow}>
        <Text style={barS.valueText}>{available.toFixed(1)} {unit} avail</Text>
        <Text style={barS.valueText}>{required.toFixed(1)} {unit} req</Text>
      </View>
    </View>
  );
}

const barS = StyleSheet.create({
  container: { marginBottom: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  label: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5, flex: 1 },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  marginText: { fontSize: 9, fontWeight: '800', fontFamily: 'Courier', minWidth: 52, textAlign: 'right' },
  track: { height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden', position: 'relative' },
  fill: { height: '100%', borderRadius: 2, opacity: 0.7 },
  marker: { position: 'absolute', top: -1, right: 0, width: 2, height: 5, backgroundColor: TACTICAL.text, opacity: 0.3 },
  valuesRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 1 },
  valueText: { fontSize: 7, fontWeight: '600', color: TACTICAL.textMuted, fontFamily: 'Courier', letterSpacing: 0.3 },
});

// ═══════════════════════════════════════════════════════════
// COMPACT VIEW — For collapsed dashboard widget
// ═══════════════════════════════════════════════════════════

export function ResourceForecastCompact() {
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = resourceForecastEngine.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  const forecast = resourceForecastEngine.getCurrent();

  if (!forecast || forecast.routeMiles <= 0) {
    return <WidgetCompactRow title="Forecast" summary="No route forecast" tone="unavailable" />;
  }

  const config = SUFFICIENCY_CONFIGS[forecast.sufficiencyLevel];
  const limitingResource =
    [
      { label: 'Fuel', status: forecast.fuel.status },
      { label: 'Water', status: forecast.water.status },
      { label: 'Power', status: forecast.power.status },
    ].find((item) => item.status !== 'OK') ?? null;
  const compactTone =
    forecast.sufficiencyLevel === 'Resources Insufficient'
      ? 'critical'
      : forecast.sufficiencyLevel === 'Resources Limited'
        ? 'attention'
        : forecast.sufficiencyLevel === 'Watch Consumption'
          ? 'warning'
          : 'good';
  const compactSummary = `${config.shortLabel} | ${forecast.routeMiles} mi route`;
  const compactStatus = limitingResource
    ? `${limitingResource.label} ${limitingResource.status}`
    : 'Balanced';

  return (
    <WidgetCompactRow
      title="Forecast"
      summary={compactSummary}
      tone={compactTone}
      status={compactStatus}
      statusTone={compactTone}
    />
  );
}

// ═══════════════════════════════════════════════════════════
// CARD VIEW — For expanded dashboard widget
// ═══════════════════════════════════════════════════════════

export function ResourceForecastCard() {
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = resourceForecastEngine.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  const forecast = resourceForecastEngine.getCurrent();

  if (!forecast || forecast.routeMiles <= 0) {
    return (
      <View style={cardS.body}>
        <Text style={cardS.emptyPrimary}>No route loaded</Text>
        <Text style={cardS.emptySecondary}>Load a route to forecast resources</Text>
      </View>
    );
  }

  const config = SUFFICIENCY_CONFIGS[forecast.sufficiencyLevel];

  return (
    <View style={cardS.body}>
      {/* Sufficiency badge */}
      <View style={[cardS.suffBadge, { backgroundColor: config.color + '15' }]}>
        <Ionicons name={config.icon as any} size={10} color={config.color} />
        <Text style={[cardS.suffLabel, { color: config.color }]}>{config.shortLabel}</Text>
        <Text style={cardS.routeChip}>{forecast.routeMiles} mi</Text>
      </View>

      {/* Resource bars */}
      <ResourceBar
        label="FUEL"
        icon="flame-outline"
        iconColor="#FFB74D"
        status={forecast.fuel.status}
        available={forecast.fuel.availableGallons}
        required={forecast.fuel.requiredGallons}
        margin={forecast.fuel.marginGallons}
        unit="gal"
      />
      <ResourceBar
        label="WATER"
        icon="water-outline"
        iconColor="#4FC3F7"
        status={forecast.water.status}
        available={forecast.water.availableGallons}
        required={forecast.water.requiredGallons}
        margin={forecast.water.marginGallons}
        unit="gal"
      />
      <ResourceBar
        label="POWER"
        icon="battery-charging-outline"
        iconColor="#FFD54F"
        status={forecast.power.status}
        available={forecast.power.availableHours}
        required={forecast.power.requiredHours}
        margin={forecast.power.marginHours}
        unit="hrs"
      />
    </View>
  );
}

const cardS = StyleSheet.create({
  body: { gap: 1 },
  emptyPrimary: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  emptySecondary: { fontSize: 9, fontWeight: '600', color: TACTICAL.amber, letterSpacing: 0.5, marginTop: 2, opacity: 0.85 },
  suffBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    marginBottom: 3, alignSelf: 'flex-start',
  },
  suffLabel: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  routeChip: { fontSize: 8, fontWeight: '600', color: TACTICAL.textMuted, fontFamily: 'Courier', marginLeft: 'auto' },
});

// ═══════════════════════════════════════════════════════════
// DETAIL VIEW — For WidgetDetailModal
// ═══════════════════════════════════════════════════════════

export function ResourceForecastDetailView() {
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = resourceForecastEngine.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  const forecast = resourceForecastEngine.getCurrent();

  if (!forecast || forecast.routeMiles <= 0) {
    return (
      <View style={detS.container}>
        <Text style={detS.section}>RESOURCE FORECAST</Text>
        <Text style={detS.empty}>No route loaded. Import a GPX/KML route to generate resource forecast.</Text>
      </View>
    );
  }

  const config = SUFFICIENCY_CONFIGS[forecast.sufficiencyLevel];
  const pe = forecast.planningEstimate;

  return (
    <View style={detS.container}>
      {/* Sufficiency */}
      <Text style={detS.section}>RESOURCE SUFFICIENCY</Text>
      <MetricRow label="LEVEL" value={forecast.sufficiencyLevel.toUpperCase()} color={config.color} />
      <MetricRow label="ROUTE" value={`${forecast.routeMiles} mi`} />
      <MetricRow label="DURATION" value={`~${forecast.estimatedDays} day${forecast.estimatedDays > 1 ? 's' : ''}`} />
      <MetricRow label="DRIVE TIME" value={`${forecast.estimatedDriveHours} hrs`} />
      <MetricRow label="DIFFICULTY" value={forecast.routeDifficulty.toUpperCase()} />
      {!forecast.hasRealData && (
        <MetricRow label="DATA" value="USING DEFAULTS" color="#FFB74D" />
      )}

      {/* Fuel Detail */}
      <View style={detS.divider} />
      <Text style={detS.section}>FUEL FORECAST</Text>
      <MetricRow label="BASE MPG" value={`${forecast.fuel.mpgUsed}`} />
      <MetricRow label="ADJUSTED MPG" value={`${forecast.fuel.adjustedMpg}`} color={forecast.fuel.adjustedMpg < forecast.fuel.mpgUsed ? '#FFB74D' : undefined} />
      <MetricRow label="AVAILABLE" value={`${forecast.fuel.availableGallons} gal`} />
      <MetricRow label="REQUIRED" value={`${forecast.fuel.requiredGallons} gal`} />
      <MetricRow label="MARGIN" value={resourceForecastEngine.formatMargin(forecast.fuel.marginGallons, 'gal')} color={resourceForecastEngine.getStatusColor(forecast.fuel.status)} />
      {forecast.fuel.terrainPenalty > 1.05 && (
        <MetricRow label="TERRAIN PENALTY" value={`+${Math.round((forecast.fuel.terrainPenalty - 1) * 100)}%`} color="#FFB74D" />
      )}
      {forecast.fuel.weightPenalty > 1.02 && (
        <MetricRow label="WEIGHT PENALTY" value={`+${Math.round((forecast.fuel.weightPenalty - 1) * 100)}%`} color="#FFB74D" />
      )}
      {forecast.fuel.offRoadPenalty > 1.0 && (
        <MetricRow label="OFF-ROAD PENALTY" value={`+${Math.round((forecast.fuel.offRoadPenalty - 1) * 100)}%`} color="#FFB74D" />
      )}
      {forecast.fuel.notes.map((note, i) => (
        <View key={`fn-${i}`} style={detS.noteRow}>
          <View style={[detS.noteDot, { backgroundColor: i === 0 ? resourceForecastEngine.getStatusColor(forecast.fuel.status) : TACTICAL.textMuted + '60' }]} />
          <Text style={detS.noteText}>{note}</Text>
        </View>
      ))}

      {/* Water Detail */}
      <View style={detS.divider} />
      <Text style={detS.section}>WATER FORECAST</Text>
      <MetricRow label="AVAILABLE" value={`${forecast.water.availableGallons} gal`} />
      <MetricRow label="REQUIRED" value={`${forecast.water.requiredGallons} gal`} />
      <MetricRow label="MARGIN" value={resourceForecastEngine.formatMargin(forecast.water.marginGallons, 'gal')} color={resourceForecastEngine.getStatusColor(forecast.water.status)} />
      <MetricRow label="PEOPLE" value={`${forecast.water.peopleCount}`} />
      <MetricRow label="DAILY/PERSON" value={`${forecast.water.dailyUsagePerPerson.toFixed(1)} gal`} />
      {forecast.water.notes.map((note, i) => (
        <View key={`wn-${i}`} style={detS.noteRow}>
          <View style={[detS.noteDot, { backgroundColor: i === 0 ? resourceForecastEngine.getStatusColor(forecast.water.status) : TACTICAL.textMuted + '60' }]} />
          <Text style={detS.noteText}>{note}</Text>
        </View>
      ))}

      {/* Power Detail */}
      <View style={detS.divider} />
      <Text style={detS.section}>POWER FORECAST</Text>
      <MetricRow label="AVAILABLE" value={`${forecast.power.availableHours} hrs`} />
      <MetricRow label="REQUIRED" value={`${forecast.power.requiredHours} hrs`} />
      <MetricRow label="MARGIN" value={resourceForecastEngine.formatMargin(forecast.power.marginHours, 'hrs')} color={resourceForecastEngine.getStatusColor(forecast.power.status)} />
      {forecast.power.solarContributionHours > 0 && (
        <MetricRow label="SOLAR CONTRIB." value={`+${forecast.power.solarContributionHours} hrs`} color="#FFD54F" />
      )}
      {forecast.power.notes.map((note, i) => (
        <View key={`pn-${i}`} style={detS.noteRow}>
          <View style={[detS.noteDot, { backgroundColor: i === 0 ? resourceForecastEngine.getStatusColor(forecast.power.status) : TACTICAL.textMuted + '60' }]} />
          <Text style={detS.noteText}>{note}</Text>
        </View>
      ))}

      {/* Planning Estimate */}
      <View style={detS.divider} />
      <Text style={detS.section}>PLANNING ESTIMATE</Text>
      <MetricRow label="FUEL NEEDED" value={`${pe.fuelRequiredGallons} gal`} />
      <MetricRow label="WATER NEEDED" value={`${pe.waterRequiredGallons} gal`} />
      <MetricRow label="POWER NEEDED" value={`${pe.powerRequiredHours} hrs`} />
      {pe.fuelCostEstimate != null && (
        <MetricRow label="EST. FUEL COST" value={`~$${pe.fuelCostEstimate.toFixed(0)}`} color={TACTICAL.textMuted} />
      )}

      {/* Intelligence Messages */}
      {forecast.intelMessages.length > 0 && (
        <>
          <View style={detS.divider} />
          <Text style={detS.section}>EXPEDITION INTELLIGENCE</Text>
          {forecast.intelMessages.map((msg) => (
            <View key={msg.id} style={detS.intelRow}>
              <Ionicons name={msg.icon as any} size={11} color={msg.color} />
              <Text style={[detS.intelText, { color: msg.severity === 'info' ? TACTICAL.textMuted : msg.color }]}>
                {msg.message}
              </Text>
            </View>
          ))}
        </>
      )}

    </View>
  );
}

const detS = StyleSheet.create({
  container: { gap: 2 },
  section: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5, marginTop: 8, marginBottom: 4 },
  divider: { height: 1, backgroundColor: TACTICAL.border, marginVertical: 8 },
  empty: { fontSize: 10, color: TACTICAL.textMuted, fontStyle: 'italic' },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, paddingLeft: 2, marginTop: 2 },
  noteDot: { width: 4, height: 4, borderRadius: 2, marginTop: 4 },
  noteText: { fontSize: 9, color: TACTICAL.textMuted, lineHeight: 13, flex: 1 },
  intelRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, paddingVertical: 3 },
  intelText: { fontSize: 9, fontWeight: '600', lineHeight: 13, flex: 1 },
});



