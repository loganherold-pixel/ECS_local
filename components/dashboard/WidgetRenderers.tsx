/**
 * Widget Content Renderers
 *
 * Compact card content for each widget type.
 * Each renderer receives the app context data and renders
 * a small summary suitable for a grid slot.
 *
 * Supports both built-in and custom widgets.
 * Supports dashboard mode (expedition/highway) and compact (collapsed) mode.
 * Supports Advanced Modeling mode for enhanced data display.
 *
 * WEIGHT SYSTEM (Single Source of Truth):
 * VehicleSystemsWidget and VehicleSystemsDetail both use
 * computeFullBuildWeightBreakdown() from weightEngine.ts.
 * NO direct imports of vehicleSpecStore, consumablesStore,
 * or density constants — all encapsulated in the centralized function.
 *
 * CORE 4 WIDGET STYLING (Phase 2: Consistent Widget Styling):
 * All four Core 4 widgets (Vehicle Systems, Attitude Monitor,
 * Sustainability, Progress) share identical:
 *   - Internal padding (inherited from WidgetGrid widgetContent)
 *   - MetricRow typography (9px label, 11px Courier value)
 *   - Line spacing (paddingVertical: 3 per row)
 *   - Density cap (3–4 MetricRows max, no extra chrome)
 *   - No progress bars, dividers, or badges in card view
 * Detail modals retain full breakdowns and visual elements.
 *
 * STABILIZATION PHASE 7: Telemetry Placeholder System
 * - All telemetry-dependent widgets show standardized placeholders
 *   when their data source is unavailable
 * - States: connected, awaiting_connection, unavailable, error
 * - No more "Unknown Widget", "No Data", "undefined", or "null"
 * - Placeholders occupy the same grid space as active widgets
 * - Smooth transition from placeholder to live state
 *
 * GOVERNANCE: Only registered widgets render. Unknown types show fallback.
 */


import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, TextInput, Animated } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, ECS } from '../../lib/theme';

import { isCustomWidget } from '../../lib/sharedConstants';
import type { WidgetType, DashboardMode } from '../../lib/sharedConstants';

import type { Trip, LoadItem, RiskScore, Waypoint, UserSettings } from '../../lib/types';
import {
  customWidgetStore,
  AVAILABLE_DATA_FIELDS,
} from '../../lib/customWidgetStore';
import { isRegistered, getWidgetEntry, resolveWidgetStatus, type WidgetStatus } from '../../lib/widgetRegistry';

import type { ViewerStyleOverrides } from '../../lib/viewerSettingsStore';
import {
  computeFullBuildWeightBreakdown,
  type BuildWeightBreakdown,
} from '../../lib/weightEngine';
import { consumablesStore } from '../../lib/consumablesStore';
import { vehicleSpecStore } from '../../lib/vehicleSpecStore';
import { routeStore } from '../../lib/routeStore';
import { waypointProgressStore, ARRIVAL_THRESHOLD_MI } from '../../lib/waypointProgressStore';
import { useApp } from '../../context/AppContext';
import { useEcoFlowLive } from '../../lib/useEcoFlowLive';
import { missionExpeditionStore } from '../../lib/missionStore';
import { useBlu } from '../../src/power/blu/useBlu';
import { bluStateStore } from '../../src/power/blu/BluStateStore';

// Phase 8: Unified ECS Power System Widget
import { PowerSystemCompact, PowerSystemCard } from './PowerSystemWidget';
import { PowerSystemDetailView } from './PowerSystemDetail';

// Phase 9: OBD-II Vehicle Telemetry Widget
import { VehicleTelemetryCompact, VehicleTelemetryCard, VehicleTelemetryDetailView } from './VehicleTelemetryWidget';
// Phase 2C: Vehicle Telemetry
import { useVehicleTelemetry } from '../../src/vehicle-telemetry/useVehicleTelemetry';

// Phase 7: Telemetry Placeholder System
import TelemetryPlaceholder from './TelemetryPlaceholder';
import { evaluateTelemetryState, type TelemetryAvailability } from '../../lib/telemetryStateEngine';

import { remotenessStore, type ConnectivityState } from '../../lib/remotenessStore';
import { TERRAIN_COMPLEXITY_SCORES } from '../../lib/elevationComplexity';

// Phase 10: Enhanced Remoteness Index Widget
// Phase 10: Enhanced Remoteness Index Widget
import { RemotenessIndexCompact, RemotenessIndexCard, RemotenessIndexDetailView } from './RemotenessIndexWidget';

// Phase 10: Terrain Risk Prediction Widget
// Phase 10: Terrain Risk Prediction Widget
import { TerrainRiskCompact, TerrainRiskCard, TerrainRiskDetailView } from './TerrainRiskWidget';

// Phase 5: Expedition Risk Engine Widget
import { ExpeditionRiskCompact, ExpeditionRiskCard, ExpeditionRiskDetailView } from './ExpeditionRiskWidget';

// Resource Forecast Widget
import { ResourceForecastCompact, ResourceForecastCard, ResourceForecastDetailView } from './ResourceForecastWidget';

// Trip Recorder Widget
import { TripRecorderCompact, TripRecorderCard, TripRecorderDetailView } from './TripRecorderWidget';






export interface WidgetData {
  activeTrip: Trip | null;
  loadItems: LoadItem[];
  riskScore: RiskScore | null;
  waypoints: Waypoint[];
  userSettings: UserSettings | null;
  syncStatus: string;
}

export interface WidgetRenderOptions {
  dashboardMode?: DashboardMode;
  compact?: boolean;
  /** Accelerometer data for attitude monitor */
  rollDeg?: number;
  pitchDeg?: number;
  sensorStatus?: string;
  /** Stability data */
  stabilityData?: any;
  /** Whether Advanced Modeling mode is enabled */
  advancedMode?: boolean;
  /** Viewer settings style overrides */
  viewerOverrides?: ViewerStyleOverrides;
  /** GPS position data for Progress widget */
  gpsLatitude?: number;
  gpsLongitude?: number;
  gpsSpeedMph?: number | null;
  gpsHasFix?: boolean;
  /** GPS accuracy in meters (for remoteness scoring) */
  gpsAccuracyM?: number | null;
  /** GPS altitude in feet (for remoteness scoring) */
  gpsAltitudeFt?: number | null;
  /** Whether this widget is in a featured (full-width) cell */
  isFeatured?: boolean;
  /**
   * Phase 7: Whether this widget is in a compressed row
   * (non-featured rows that were shrunk to accommodate the
   * Attitude Monitor minimum height constraint).
   * When true, renderers should reduce vertical padding and
   * limit line count to fit the reduced height.
   */
  isCompressedRow?: boolean;
}





// ── Viewer-aware color helpers ─────────────────────────────
function getTextColor(overrides?: ViewerStyleOverrides): string {
  return overrides?.textColorOverride || TACTICAL.text;
}
function getMutedColor(overrides?: ViewerStyleOverrides): string {
  return overrides?.mutedColorOverride || TACTICAL.textMuted;
}
function getAmberColor(overrides?: ViewerStyleOverrides): string {
  return overrides?.amberOverride || TACTICAL.amber;
}
function getFontScale(overrides?: ViewerStyleOverrides): number {
  return overrides?.fontScale || 1.0;
}


// ── Metric Row Helper ──────────────────────────────────
function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={s.metricRow}>
      <Text style={s.metricLabel}>{label}</Text>
      <Text style={[s.metricValue, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

function ProgressBar({ pct, color }: { pct: number; color: string }) {
  return (
    <View style={s.progressOuter}>
      <View style={[s.progressInner, { width: `${Math.min(Math.max(pct, 0), 100)}%`, backgroundColor: color }]} />
    </View>
  );
}


// ── Empty State Microcopy Helper ───────────────────────
// Standardized 2-line empty state: primary status + optional action hint.
// Maintains industrial tone, no icons, no height expansion.
function EmptyStateMicrocopy({ primary, secondary }: { primary: string; secondary?: string }) {
  return (
    <View style={emptyS.container}>
      <Text style={emptyS.primary}>{primary}</Text>
      {secondary ? <Text style={emptyS.secondary}>{secondary}</Text> : null}
    </View>
  );
}

// ── Tactical Bar (for Power/Energy Monitor) ────────────
function TacticalBar({ label, value, max, color, unit, warning }: {
  label: string; value: number; max: number; color: string; unit?: string; warning?: boolean;
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <View style={s.tacticalBarRow}>
      <Text style={s.tacticalBarLabel}>{label}</Text>
      <View style={s.tacticalBarOuter}>
        <View style={[s.tacticalBarFill, { width: `${pct}%`, backgroundColor: color }]} />
        {warning && pct < 25 && (
          <View style={s.tacticalBarWarning} />
        )}
      </View>
      <Text style={[s.tacticalBarValue, { color }]}>
        {value > 0 ? `${value}${unit || ''}` : '\u2014'}
      </Text>
    </View>
  );
}

// ── Helper: get total weight from load items (qty × weight) ──
function getTotalWeightLbs(items: LoadItem[]): number {
  return items
    .filter(i => !i.deleted_at)
    .reduce((sum, i) => sum + ((i.weight_lbs || 0) * (i.qty || 1)), 0);
}

// ── Helper: check if any items have 0 weight ──
function hasZeroWeightItems(items: LoadItem[]): boolean {
  return items.filter(i => !i.deleted_at).some(i => !i.weight_lbs || i.weight_lbs === 0);
}


// ═══════════════════════════════════════════════════════════
// CORE 4 WIDGET A — VEHICLE SYSTEMS
//
// Phase 2E: Live OBD-II Telemetry Integration
//
// Priority rendering:
//   1) Live OBD-II telemetry → engine status, battery, fuel, speed
//   2) Grace window → last known values + "Updating..." indicator
//   3) Stale/disconnected → fall back to weight-based display
//   4) No specs → setup required
//
// Weight data (build weight, margin) remains available in detail view.
// ═══════════════════════════════════════════════════════════
function VehicleSystemsWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // ── Phase 2E: Live Vehicle Telemetry ──
  const vt = useVehicleTelemetry();
  const hasLiveTelemetry = vt.hasData && (vt.freshnessLabel === 'live' || vt.freshnessLabel === 'reconnecting');
  const hasGraceData = vt.hasData && vt.isWithinGraceWindow;
  const showLiveData = hasLiveTelemetry || hasGraceData;

  // ── Weight data (fallback) ──
  const itemsWt = getTotalWeightLbs(data.loadItems);
  const bw: BuildWeightBreakdown = computeFullBuildWeightBreakdown(undefined, {
    items_weight_lb: itemsWt,
  });

  const { build_weight_lb, payload_margin_lb, has_specs, margin_color,
          fuel_percent_current } = bw;

  // ── Fuel color ──
  const fuelColor = fuel_percent_current <= 15 ? '#EF5350' : fuel_percent_current <= 30 ? '#FFB74D' : TACTICAL.text;

  // ── Engine status display ──
  const engineStatusDisplay: Record<string, { label: string; color: string }> = {
    running: { label: 'RUNNING', color: '#4CAF50' },
    idle:    { label: 'IDLE',    color: TACTICAL.amber },
    off:     { label: 'OFF',     color: TACTICAL.textMuted },
    unknown: { label: 'UNKNOWN', color: TACTICAL.textMuted },
  };
  const engineInfo = engineStatusDisplay[vt.engineStatus] || engineStatusDisplay.unknown;

  // ── Battery voltage color ──
  const battV = vt.summary.battery_voltage;
  const battColor = battV != null
    ? (battV >= 12.4 ? '#4CAF50' : battV >= 11.8 ? '#FFB300' : '#EF5350')
    : TACTICAL.textMuted;

  // ── Live fuel level from OBD-II ──
  const liveFuelPct = vt.summary.fuel_level;
  const liveFuelColor = liveFuelPct != null
    ? (liveFuelPct <= 15 ? '#EF5350' : liveFuelPct <= 30 ? '#FFB74D' : '#4CAF50')
    : TACTICAL.textMuted;

  // ═══ COMPACT MODE ═══
  if (compact) {
    if (showLiveData) {
      return (
        <View style={s.compactRow}>
          <View style={s.compactCell}>
            <Text style={s.compactLabel}>ENGINE</Text>
            <Text style={[s.compactValue, { fontSize: 9, color: engineInfo.color }]}>{engineInfo.label}</Text>
          </View>
          <View style={s.compactCell}>
            <Text style={s.compactLabel}>BATT</Text>
            <Text style={[s.compactValue, { color: battColor }]}>
              {battV != null ? `${battV.toFixed(1)}V` : '\u2014'}
            </Text>
          </View>
          <View style={s.compactCell}>
            <Text style={s.compactLabel}>FUEL</Text>
            <Text style={[s.compactValue, { color: liveFuelPct != null ? liveFuelColor : fuelColor }]}>
              {liveFuelPct != null ? `${Math.round(liveFuelPct)}%` : `${fuel_percent_current}%`}
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>FUEL</Text>
          <Text style={[s.compactValue, { color: fuelColor }]}>{fuel_percent_current}%</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>BUILD</Text>
          <Text style={[s.compactValue, { fontSize: 10 }]}>
            {build_weight_lb > 0 ? `${Math.round(build_weight_lb).toLocaleString()}` : '\u2014'}
          </Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>MARGIN</Text>
          <Text style={[s.compactValue, { fontSize: 10, color: margin_color }]}>
            {has_specs ? `${Math.round(payload_margin_lb).toLocaleString()}` : '\u2014'}
          </Text>
        </View>
      </View>
    );
  }

  // ═══ LIVE TELEMETRY MODE ═══
  if (showLiveData) {
    const isUpdating = vt.freshnessLabel === 'reconnecting' || (vt.graceState === 'grace' && !hasLiveTelemetry);

    return (
      <View style={core4.body}>
        {/* Freshness indicator */}
        <View style={vtWidgetS.freshnessRow}>
          <View style={[vtWidgetS.freshnessDot, {
            backgroundColor: vt.freshnessLabel === 'live' ? '#4CAF50' :
                            vt.freshnessLabel === 'reconnecting' ? '#FFB300' : TACTICAL.textMuted,
          }]} />
          <Text style={[vtWidgetS.freshnessLabel, {
            color: vt.freshnessLabel === 'live' ? '#4CAF50' :
                   vt.freshnessLabel === 'reconnecting' ? '#FFB300' : TACTICAL.textMuted,
          }]}>
            {vt.freshnessLabel === 'live' ? 'LIVE' :
             vt.freshnessLabel === 'reconnecting' ? 'UPDATING' : 'VT'}
          </Text>
          {vt.lastUpdatedText && (
            <Text style={vtWidgetS.freshnessTime}>{vt.lastUpdatedText}</Text>
          )}
        </View>

        {/* Engine Status */}
        <MetricRow
          label="ENGINE"
          value={engineInfo.label}
          color={engineInfo.color}
        />

        {/* Battery Voltage */}
        <MetricRow
          label="BATTERY"
          value={battV != null ? `${battV.toFixed(1)} V` : '\u2014'}
          color={battColor}
        />

        {/* Fuel Level (OBD-II or planning) */}
        {liveFuelPct != null ? (
          <MetricRow
            label="FUEL"
            value={`${Math.round(liveFuelPct)}%`}
            color={liveFuelColor}
          />
        ) : (
          <MetricRow
            label="FUEL"
            value={`${fuel_percent_current}%`}
            color={fuelColor}
          />
        )}

        {/* Vehicle Speed (when moving) */}
        {vt.summary.vehicle_speed != null && vt.summary.vehicle_speed > 0 && (
          <MetricRow
            label="SPEED"
            value={`${Math.round(vt.summary.vehicle_speed)} mph`}
          />
        )}

        {/* Updating indicator during grace window */}
        {isUpdating && (
          <View style={vtWidgetS.updatingRow}>
            <Ionicons name="sync-outline" size={8} color="#FFB300" />
            <Text style={vtWidgetS.updatingText}>Updating\u2026</Text>
          </View>
        )}
      </View>
    );
  }

  // ═══ FALLBACK: Weight-based display ═══

  // Empty state: no specs
  if (!has_specs) {
    return (
      <View style={core4.body}>
        <EmptyStateMicrocopy primary="Setup required" secondary="Tap to configure" />
      </View>
    );
  }

  const activeItems = data.loadItems.filter(i => !i.deleted_at);
  if (activeItems.length === 0 && build_weight_lb <= 0) {
    return (
      <View style={core4.body}>
        <EmptyStateMicrocopy primary="No loadout active" secondary="Select loadout" />
      </View>
    );
  }

  // ── Full widget: standardized 3-line display ──
  return (
    <View style={core4.body}>
      {!bw.has_fuel_tank_capacity ? (
        <EmptyStateMicrocopy primary="Tank capacity needed" secondary="Tap to set" />
      ) : (
        <MetricRow
          label="FUEL"
          value={`${fuel_percent_current}%`}
          color={fuelColor}
        />
      )}
      <MetricRow
        label="BUILD WEIGHT"
        value={build_weight_lb > 0 ? `${Math.round(build_weight_lb).toLocaleString()} lb` : '0 lb'}
        color={build_weight_lb > 0 ? TACTICAL.amber : TACTICAL.textMuted}
      />
      <MetricRow
        label="PAYLOAD MARGIN"
        value={`${Math.round(payload_margin_lb).toLocaleString()} lb`}
        color={margin_color}
      />
    </View>
  );
}

// ── Phase 2E: Vehicle Telemetry Widget Styles ──
const vtWidgetS = StyleSheet.create({
  freshnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  freshnessDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  freshnessLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  freshnessTime: {
    fontSize: 7,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginLeft: 'auto',
  },
  updatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    opacity: 0.7,
  },
  updatingText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#FFB300',
    fontStyle: 'italic',
  },
});











// ═══════════════════════════════════════════════════════════
// WIDGET B — STABILITY INDEX
// ═══════════════════════════════════════════════════════════
function StabilityIndexWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const mode = options?.dashboardMode || 'expedition';
  const compact = options?.compact;
  const rollDeg = options?.rollDeg ?? 0;
  const pitchDeg = options?.pitchDeg ?? 0;
  const advanced = options?.advancedMode;

  const absRoll = Math.abs(rollDeg);
  const absPitch = Math.abs(pitchDeg);

  const safeRollThreshold = advanced ? 32 : 35;
  const stabilityMargin = safeRollThreshold > 0
    ? Math.max(0, Math.min(100, ((safeRollThreshold - absRoll) / safeRollThreshold) * 100))
    : 100;

  let marginColor = TACTICAL.amber;
  if (stabilityMargin < 15) marginColor = TACTICAL.danger;
  else if (stabilityMargin < 40) marginColor = '#E67E22';
  else if (stabilityMargin >= 75) marginColor = '#4CAF50';

  const getBias = () => {
    if (absRoll < 2 && absPitch < 2) return { label: 'BALANCED', color: '#4CAF50' };
    if (absPitch > absRoll) {
      return pitchDeg > 0
        ? { label: 'REAR BIASED', color: TACTICAL.amber }
        : { label: 'FRONT BIASED', color: TACTICAL.amber };
    }
    return { label: 'LATERAL LOAD', color: TACTICAL.amber };
  };
  const bias = getBias();

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>MARGIN</Text>
          <Text style={[s.compactValue, { color: marginColor }]}>{stabilityMargin.toFixed(0)}%</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>ROLL</Text>
          <Text style={s.compactValue}>{rollDeg.toFixed(1)}{'\u00B0'}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>PITCH</Text>
          <Text style={s.compactValue}>{pitchDeg.toFixed(1)}{'\u00B0'}</Text>
        </View>
      </View>
    );
  }

  const isHighway = mode === 'highway';

  return (
    <View>
      <View style={s.stabilityTopRow}>
        <View style={s.stabilityMetric}>
          <Text style={s.stabLabel}>ROLL</Text>
          <Text style={[s.stabValue, absRoll > safeRollThreshold * 0.85 ? { color: TACTICAL.danger } : null]}>
            {rollDeg.toFixed(1)}{'\u00B0'}
          </Text>
        </View>
        <View style={s.stabilityMetric}>
          <Text style={s.stabLabel}>PITCH</Text>
          <Text style={s.stabValue}>{pitchDeg.toFixed(1)}{'\u00B0'}</Text>
        </View>
        <View style={s.stabilityMetric}>
          <Text style={s.stabLabel}>{advanced ? 'DYN SAFE' : 'SAFE ROLL'}</Text>
          <Text style={[s.stabValue, { color: TACTICAL.amber }]}>{safeRollThreshold.toFixed(0)}{'\u00B0'}</Text>
        </View>
        <View style={s.stabilityMetric}>
          <Text style={s.stabLabel}>MARGIN</Text>
          <Text style={[s.stabValue, { color: marginColor }]}>{stabilityMargin.toFixed(0)}%</Text>
        </View>
      </View>

      <View style={s.marginBarContainer}>
        <View style={s.marginBarBg}>
          <View style={[s.marginBarFill, {
            width: `${Math.min(100, stabilityMargin)}%`,
            backgroundColor: marginColor,
          }]} />
          <View style={[s.marginMarker, { left: '15%' }]} />
          <View style={[s.marginMarker, { left: '40%' }]} />
          <View style={[s.marginMarker, { left: '75%' }]} />
        </View>
        <View style={s.marginLabels}>
          <Text style={[s.marginLabelText, { color: TACTICAL.danger }]}>CRITICAL</Text>
          <Text style={[s.marginLabelText, { color: '#E67E22' }]}>CAUTION</Text>
          <Text style={[s.marginLabelText, { color: '#4CAF50' }]}>NOMINAL</Text>
        </View>
      </View>

      {!isHighway || absRoll > 5 || absPitch > 5 ? (
        <View style={[s.biasBadge, { backgroundColor: `${bias.color}15` }]}>
          <View style={[s.biasDot, { backgroundColor: bias.color }]} />
          <Text style={[s.biasText, { color: bias.color }]}>{bias.label}</Text>
        </View>
      ) : (
        <View style={s.biasBadge}>
          <MetricRow label="LOAD BALANCE" value={bias.label} color={bias.color} />
        </View>
      )}

      {advanced && !isHighway && (
        <View style={s.advRow}>
          <Text style={s.advLabel}>CG MODEL</Text>
          <Text style={s.advValue}>ACTIVE</Text>
        </View>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// CORE 4 WIDGET B — ATTITUDE MONITOR
//
// Phase 2 Consistent Styling:
// Card view: exactly 3 MetricRows (Roll, Pitch, Tilt) + sensor badge.
// No inclinometer graphic, subtitle rows, or threshold warnings.
// Detail modal retains full inclinometer visualization.
// ═══════════════════════════════════════════════════════════
function AttitudeMonitorWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const rollDeg = options?.rollDeg ?? 0;
  const pitchDeg = options?.pitchDeg ?? 0;
  const sensorStatus = options?.sensorStatus || 'OFFLINE';
  const advanced = options?.advancedMode;

  const rollDanger = advanced ? 32 : 35;
  const rollWarning = advanced ? 22 : 25;
  const pitchDanger = advanced ? 28 : 30;
  const pitchWarning = advanced ? 18 : 20;

  const absRoll = Math.abs(rollDeg);
  const absPitch = Math.abs(pitchDeg);
  const tilt = Math.sqrt(rollDeg * rollDeg + pitchDeg * pitchDeg);

  const rollColor = absRoll >= rollDanger ? TACTICAL.danger
    : absRoll >= rollWarning ? '#E67E22'
    : TACTICAL.text;

  const pitchColor = absPitch >= pitchDanger ? TACTICAL.danger
    : absPitch >= pitchWarning ? '#E67E22'
    : TACTICAL.text;

  const tiltColor = tilt >= rollDanger ? TACTICAL.danger
    : tilt >= rollWarning ? '#E67E22'
    : TACTICAL.text;

  const sensorLive = sensorStatus === 'LIVE' || sensorStatus === 'CALIBRATED';

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>ROLL</Text>
          <Text style={[s.compactValue, { color: rollColor }]}>{rollDeg.toFixed(1)}{'\u00B0'}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>PITCH</Text>
          <Text style={[s.compactValue, { color: pitchColor }]}>{pitchDeg.toFixed(1)}{'\u00B0'}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>TILT</Text>
          <Text style={[s.compactValue, { color: tiltColor }]}>{tilt.toFixed(1)}{'\u00B0'}</Text>
        </View>
      </View>
    );
  }

  // ── Full widget: empty state microcopy ──
  if (!sensorLive) {
    return (
      <View style={core4.body}>
        <EmptyStateMicrocopy
          primary={sensorStatus === 'AWAITING' ? 'Awaiting data' : 'Sensor unavailable'}
          secondary={sensorStatus === 'AWAITING' ? undefined : 'Check permissions'}
        />
        {/* Retain sensor status dot for diagnostics */}
        <View style={core4.sensorRow}>
          <View style={[core4.sensorDot, { backgroundColor: TACTICAL.textMuted }]} />
          <Text style={[core4.sensorLabel, { color: TACTICAL.textMuted }]}>{sensorStatus}</Text>
        </View>
      </View>
    );
  }

  // ── Full widget: standardized 3-line display + sensor badge ──
  return (
    <View style={core4.body}>
      <MetricRow
        label="ROLL"
        value={`${rollDeg.toFixed(1)}\u00B0`}
        color={rollColor}
      />
      <MetricRow
        label="PITCH"
        value={`${pitchDeg.toFixed(1)}\u00B0`}
        color={pitchColor}
      />
      <MetricRow
        label="TILT"
        value={`${tilt.toFixed(1)}\u00B0`}
        color={tiltColor}
      />
      {/* Subtle sensor status — same visual weight as a status dot */}
      <View style={core4.sensorRow}>
        <View style={[core4.sensorDot, {
          backgroundColor: '#4CAF50',
        }]} />
        <Text style={[core4.sensorLabel, {
          color: '#4CAF50',
        }]}>{sensorStatus}</Text>
      </View>
    </View>
  );
}







// ═══════════════════════════════════════════════════════════
// WIDGET — MISSION SUSTAINMENT (Advanced Mode)
// ═══════════════════════════════════════════════════════════
function MissionSustainmentWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const compact = options?.compact;

  if (!trip) return <Text style={s.noData}>No active expedition</Text>;

  const waterGal = trip.capac_water_gal;
  const usePerDay = (trip.water_use_per_person_day || 1) * trip.team_size;
  const waterDays = waterGal && usePerDay > 0 ? waterGal / usePerDay : null;
  const fuelGal = trip.capac_fuel_gal;
  const mpg = trip.capac_mpg;
  const milesPerDay = trip.avg_miles_per_day;
  const dailyFuel = mpg && milesPerDay ? milesPerDay / mpg : null;
  const fuelDays = fuelGal && dailyFuel ? fuelGal / dailyFuel : null;
  const batteryWh = trip.battery_usable_wh;
  const solarW = trip.solar_watts;
  const sunHrs = trip.sun_hours_per_day;
  const eff = trip.solar_efficiency || 0.8;
  const solarDaily = solarW && sunHrs ? solarW * sunHrs * eff : null;
  const powerSustainable = solarDaily != null && batteryWh != null && solarDaily >= (batteryWh * 0.5);
  const missionDays = trip.start_date && trip.end_date
    ? Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000)
    : null;
  const resources = [
    { name: 'WATER', days: waterDays },
    { name: 'FUEL', days: fuelDays },
  ].filter(r => r.days != null) as { name: string; days: number }[];
  const limiting = resources.length > 0
    ? resources.reduce((min, r) => r.days < min.days ? r : min, resources[0])
    : null;

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>ENDURANCE</Text>
          <Text style={s.compactValue}>{limiting ? `${limiting.days.toFixed(1)}d` : '\u2014'}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>LIMITING</Text>
          <Text style={[s.compactValue, { fontSize: 9 }]}>{limiting ? limiting.name : '\u2014'}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>POWER</Text>
          <Text style={[s.compactValue, { color: powerSustainable ? '#4CAF50' : TACTICAL.amber, fontSize: 9 }]}>
            {powerSustainable ? 'SUST' : 'LTD'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.twoCol}>
      <View style={s.colLeft}>
        <Text style={s.colHeader}>BURN RATE</Text>
        <MetricRow label="WATER" value={usePerDay > 0 ? `${usePerDay.toFixed(1)} gal/d` : '\u2014'} />
        <MetricRow label="FUEL" value={dailyFuel ? `${dailyFuel.toFixed(2)} gal/d` : '\u2014'} />
        <MetricRow label="POWER" value={powerSustainable ? 'SUSTAINABLE' : 'LIMITED'}
          color={powerSustainable ? '#4CAF50' : TACTICAL.amber} />
        <MetricRow label="SOLAR RETURN" value={solarDaily ? `${solarDaily.toFixed(0)} Wh/d` : '\u2014'} />
      </View>
      <View style={s.colDivider} />
      <View style={s.colRight}>
        <Text style={s.colHeader}>ENDURANCE</Text>
        <MetricRow label="WATER" value={waterDays ? `${waterDays.toFixed(1)} days` : '\u2014'}
          color={waterDays && missionDays && waterDays < missionDays ? TACTICAL.danger : undefined} />
        <MetricRow label="FUEL" value={fuelDays ? `${fuelDays.toFixed(1)} days` : '\u2014'}
          color={fuelDays && missionDays && fuelDays < missionDays ? TACTICAL.danger : undefined} />
        <MetricRow label="MISSION" value={missionDays ? `${missionDays} days` : '\u2014'} />
        {limiting && (
          <View style={[s.limitBadge, {
            backgroundColor: limiting.days < (missionDays || 999)
              ? 'rgba(192,57,43,0.08)' : 'rgba(76,175,80,0.08)',
          }]}>
            <Text style={[s.limitText, {
              color: limiting.days < (missionDays || 999) ? TACTICAL.danger : '#4CAF50',
            }]}>
              LIMITING: {limiting.name}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// WIDGET — OPERATIONAL READINESS
// ═══════════════════════════════════════════════════════════
function OperationalReadinessWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const compact = options?.compact;
  if (!trip) return <Text style={s.noData}>No active expedition</Text>;

  const items = data.loadItems.filter(i => !i.deleted_at);
  const mode = trip.active_mode || 'Trip';
  const active = items.filter(i => i.mode === mode || i.mode === 'Both');
  const packed = active.filter(i => i.packed);
  const gearPct = active.length > 0 ? Math.round((packed.length / active.length) * 100) : 0;
  const fuelGal = trip.capac_fuel_gal;
  const mpg = trip.capac_mpg;
  const milesPerDay = trip.avg_miles_per_day;
  const dailyFuel = mpg && milesPerDay ? milesPerDay / mpg : null;
  const fuelDays = fuelGal && dailyFuel ? fuelGal / dailyFuel : null;
  const missionDays = trip.start_date && trip.end_date
    ? Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000)
    : null;
  const fuelPct = fuelDays && missionDays ? Math.min(100, Math.round((fuelDays / missionDays) * 100)) : 0;
  const waterGal = trip.capac_water_gal;
  const usePerDay = (trip.water_use_per_person_day || 1) * trip.team_size;
  const waterDays = waterGal && usePerDay > 0 ? waterGal / usePerDay : null;
  const waterPct = waterDays && missionDays ? Math.min(100, Math.round((waterDays / missionDays) * 100)) : 0;
  const batteryWh = trip.battery_usable_wh;
  const solarW = trip.solar_watts;
  const sunHrs = trip.sun_hours_per_day;
  const eff = trip.solar_efficiency || 0.8;
  const solarDaily = solarW && sunHrs ? solarW * sunHrs * eff : null;
  const powerPct = solarDaily && batteryWh ? Math.min(100, Math.round((solarDaily / (batteryWh * 0.5)) * 100)) : 0;
  const routePct = data.waypoints.length > 0 ? 100 : 0;
  const scores = [gearPct, fuelPct, waterPct, powerPct, routePct];
  const composite = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  const compositeColor = composite >= 80 ? '#4CAF50' : composite >= 50 ? TACTICAL.amber : TACTICAL.danger;

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>READY</Text>
          <Text style={[s.compactValue, { color: compositeColor }]}>{composite}%</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>GEAR</Text>
          <Text style={s.compactValue}>{gearPct}%</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>FUEL</Text>
          <Text style={s.compactValue}>{fuelPct}%</Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      <View style={s.readinessHeader}>
        <Text style={[s.bigMetric, { color: compositeColor, fontSize: 24 }]}>{composite}%</Text>
        <Text style={s.bigMetricUnit}>COMPOSITE READINESS</Text>
      </View>
      <ProgressBar pct={composite} color={compositeColor} />
      <View style={s.readinessGrid}>
        <ReadinessCell label="GEAR" pct={gearPct} />
        <ReadinessCell label="FUEL" pct={fuelPct} />
        <ReadinessCell label="WATER" pct={waterPct} />
        <ReadinessCell label="POWER" pct={powerPct} />
        <ReadinessCell label="ROUTE" pct={routePct} />
      </View>
    </View>
  );
}

function ReadinessCell({ label, pct }: { label: string; pct: number }) {
  const color = pct >= 80 ? '#4CAF50' : pct >= 50 ? TACTICAL.amber : TACTICAL.danger;
  return (
    <View style={s.readinessCell}>
      <Text style={s.readinessCellLabel}>{label}</Text>
      <Text style={[s.readinessCellValue, { color }]}>{pct}%</Text>
    </View>
  );
}


// ── Status Overview ────────────────────────────────────
function StatusOverview({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  if (!trip) return <Text style={s.noData}>No active trip</Text>;
  const days = trip.start_date && trip.end_date
    ? Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000)
    : null;
  const alerts: string[] = [];
  if (data.riskScore) {
    const avg = (data.riskScore.terrain_complexity + data.riskScore.weather_exposure +
      data.riskScore.remoteness + data.riskScore.recovery_availability + data.riskScore.comms_coverage) / 5;
    if (avg > 3) alerts.push('HIGH RISK');
  }
  return (
    <View>
      <MetricRow label="MISSION" value={days ? `${days}d` : '--'} />
      <MetricRow label="TERRAIN" value={trip.terrain_type || '--'} />
      <MetricRow label="TEAM" value={`${trip.team_size}`} />
      {alerts.length > 0 && (
        <View style={s.alertBadge}>
          <Ionicons name="alert-circle" size={10} color={TACTICAL.danger} />
          <Text style={s.alertText}>{alerts[0]}</Text>
        </View>
      )}
    </View>
  );
}

// ── Route Progress ─────────────────────────────────────
function RouteProgress({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  const wps = data.waypoints;
  const totalDist = wps.reduce((acc, wp, i) => {
    if (i === 0) return 0;
    const prev = wps[i - 1];
    const R = 3959;
    const dLat = ((wp.latitude - prev.latitude) * Math.PI) / 180;
    const dLon = ((wp.longitude - prev.longitude) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos((prev.latitude * Math.PI) / 180) * Math.cos((wp.latitude * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return acc + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, 0);
  const planned = trip?.route_distance_miles;
  const pct = planned && planned > 0 ? Math.round((totalDist / planned) * 100) : 0;
  return (
    <View>
      <MetricRow label="COVERED" value={`${totalDist.toFixed(1)} mi`} />
      <MetricRow label="PLANNED" value={planned ? `${planned.toFixed(0)} mi` : '--'} />
      {planned ? (
        <>
          <ProgressBar pct={pct} color={pct >= 100 ? '#4CAF50' : TACTICAL.amber} />
          <Text style={[s.pctText, { color: pct >= 100 ? '#4CAF50' : TACTICAL.amber }]}>{pct}%</Text>
        </>
      ) : null}
      <MetricRow label="WAYPOINTS" value={`${wps.length}`} />
    </View>
  );
}

// ── Loadout Readiness ──────────────────────────────────
function LoadoutReadiness({ data }: { data: WidgetData }) {
  const items = data.loadItems;
  const mode = data.activeTrip?.active_mode || 'Trip';
  const active = items.filter(i => !i.deleted_at && (i.mode === mode || i.mode === 'Both'));
  const packed = active.filter(i => i.packed);
  const pct = active.length > 0 ? Math.round((packed.length / active.length) * 100) : 0;
  const color = pct >= 100 ? '#4CAF50' : pct >= 70 ? TACTICAL.amber : TACTICAL.danger;
  return (
    <View>
      <Text style={[s.bigMetric, { color }]}>{pct}%</Text>
      <ProgressBar pct={pct} color={color} />
      <MetricRow label="PACKED" value={`${packed.length}/${active.length}`} />
      <MetricRow label="MODE" value={mode.toUpperCase()} />
    </View>
  );
}

// ── Water Projection ───────────────────────────────────
function WaterProjection({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  if (!trip) return <Text style={s.noData}>No trip data</Text>;
  const waterGal = trip.capac_water_gal;
  const usePerDay = (trip.water_use_per_person_day || 1) * trip.team_size;
  const waterDays = waterGal && usePerDay > 0 ? waterGal / usePerDay : null;
  const missionDays = trip.start_date && trip.end_date
    ? Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000)
    : null;
  const sufficient = waterDays != null && missionDays != null && waterDays >= missionDays;
  const color = sufficient ? '#4CAF50' : TACTICAL.danger;
  return (
    <View>
      <Text style={[s.bigMetric, { color }]}>{waterDays ? waterDays.toFixed(1) : '--'}</Text>
      <Text style={s.bigMetricUnit}>days supply</Text>
      <MetricRow label="CAPACITY" value={waterGal ? `${waterGal} gal` : '--'} />
      <MetricRow label="DAILY USE" value={`${usePerDay.toFixed(1)} gal`} />
      {!sufficient && waterDays != null && (
        <View style={s.alertBadge}>
          <Ionicons name="alert-circle" size={10} color={TACTICAL.danger} />
          <Text style={s.alertText}>INSUFFICIENT</Text>
        </View>
      )}
    </View>
  );
}

// ── Fuel Range ─────────────────────────────────────────
function FuelRange({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  if (!trip) return <Text style={s.noData}>No trip data</Text>;
  const fuelGal = trip.capac_fuel_gal;
  const mpg = trip.capac_mpg;
  const milesPerDay = trip.avg_miles_per_day;
  const dailyFuel = mpg && milesPerDay ? milesPerDay / mpg : null;
  const fuelDays = fuelGal && dailyFuel ? fuelGal / dailyFuel : null;
  const rangeMiles = fuelGal && mpg ? fuelGal * mpg : null;
  const missionDays = trip.start_date && trip.end_date
    ? Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000)
    : null;
  const sufficient = fuelDays != null && missionDays != null && fuelDays >= missionDays;
  const color = sufficient ? '#4CAF50' : fuelDays != null ? TACTICAL.danger : TACTICAL.textMuted;
  return (
    <View>
      <Text style={[s.bigMetric, { color }]}>{fuelDays ? fuelDays.toFixed(1) : '--'}</Text>
      <Text style={s.bigMetricUnit}>days range</Text>
      <MetricRow label="RANGE" value={rangeMiles ? `${rangeMiles.toFixed(0)} mi` : '--'} />
      <MetricRow label="DAILY" value={dailyFuel ? `${dailyFuel.toFixed(2)} gal` : '--'} />
    </View>
  );
}

// ── Vehicle Health ─────────────────────────────────────
function VehicleHealth({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  return (
    <View>
      <MetricRow label="VEHICLE" value={trip?.primary_vehicle || '--'} />
      <MetricRow label="MPG" value={trip?.capac_mpg ? `${trip.capac_mpg}` : '--'} />
      <MetricRow label="FUEL CAP" value={trip?.capac_fuel_gal ? `${trip.capac_fuel_gal} gal` : '--'} />
      <View style={[s.statusBadge, { backgroundColor: 'rgba(76,175,80,0.12)' }]}>
        <View style={[s.statusDot, { backgroundColor: '#4CAF50' }]} />
        <Text style={[s.statusText, { color: '#4CAF50' }]}>OPERATIONAL</Text>
      </View>
    </View>
  );
}

// ── Emergency Controls ─────────────────────────────────
function EmergencyControls({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  const contact = trip?.emergency_contact;
  return (
    <View>
      <View style={s.emergencyHeader}>
        <Ionicons name="shield-checkmark" size={16} color={TACTICAL.danger} />
        <Text style={s.emergencyTitle}>EMERGENCY</Text>
      </View>
      <MetricRow label="CONTACT" value={contact || 'Not set'} color={contact ? undefined : TACTICAL.danger} />
      <MetricRow label="TEAM" value={trip ? `${trip.team_size} person${trip.team_size !== 1 ? 's' : ''}` : '--'} />
      <MetricRow label="COMMS" value={data.syncStatus === 'synced' ? 'ONLINE' : 'LIMITED'} 
        color={data.syncStatus === 'synced' ? '#4CAF50' : TACTICAL.amber} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// WIDGET — POWER / ENERGY MONITOR (V2 Enhanced)
// ═══════════════════════════════════════════════════════════
function PowerSystems({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const compact = options?.compact;

  if (!trip) {
    if (compact) {
      return (
        <View style={s.compactRow}>
          <View style={s.compactCell}>
            <Text style={s.compactLabel}>BATTERY</Text>
            <Text style={[s.compactValue, { color: TACTICAL.textMuted }]}>{'\u2014'}</Text>
          </View>
          <View style={s.compactCell}>
            <Text style={s.compactLabel}>SOLAR</Text>
            <Text style={[s.compactValue, { color: TACTICAL.textMuted }]}>{'\u2014'}</Text>
          </View>
          <View style={s.compactCell}>
            <Text style={s.compactLabel}>STATUS</Text>
            <Text style={[s.compactValue, { fontSize: 9, color: TACTICAL.textMuted }]}>IDLE</Text>
          </View>
        </View>
      );
    }
    return (
      <View>
        <View style={s.noExpeditionBadge}>
          <View style={[s.statusDot, { backgroundColor: TACTICAL.textMuted }]} />
          <Text style={s.noExpeditionText}>No Active Expedition</Text>
        </View>
        <MetricRow label="BATTERY" value={'\u2014'} color={TACTICAL.textMuted} />
        <MetricRow label="SOLAR" value={'\u2014'} color={TACTICAL.textMuted} />
        <MetricRow label="RUNTIME" value={'\u2014'} color={TACTICAL.textMuted} />
      </View>
    );
  }

  const batteryWh = trip.battery_usable_wh || 0;
  const solarW = trip.solar_watts || 0;
  const sunHrs = trip.sun_hours_per_day || 0;
  const eff = trip.solar_efficiency || 0.8;
  const solarDaily = solarW && sunHrs ? solarW * sunHrs * eff : 0;

  // Simulated values for enhanced display
  const avgDraw = 50; // ~50W average draw
  const fridgeDraw = 45; // ~45W fridge
  const runtimeHrs = batteryWh > 0 ? Math.round(batteryWh / avgDraw) : 0;
  const batteryPct = batteryWh > 0 ? Math.min(100, Math.round((batteryWh / (batteryWh * 1.2)) * 100)) : 0;
  const sustainable = solarDaily > 0 && batteryWh > 0 && solarDaily >= (batteryWh * 0.5);

  const batteryColor = batteryPct >= 60 ? '#4CAF50' : batteryPct >= 30 ? TACTICAL.amber : TACTICAL.danger;

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>BATTERY</Text>
          <Text style={[s.compactValue, { color: batteryColor }]}>{batteryWh > 0 ? `${batteryPct}%` : '\u2014'}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>SOLAR</Text>
          <Text style={s.compactValue}>{solarW > 0 ? `${solarW}W` : '\u2014'}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>RUNTIME</Text>
          <Text style={s.compactValue}>{runtimeHrs > 0 ? `${runtimeHrs}h` : '\u2014'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View>
      {/* Sustainability status */}
      <View style={[s.statusBadge, { backgroundColor: sustainable ? 'rgba(76,175,80,0.12)' : 'rgba(196,138,44,0.12)' }]}>
        <View style={[s.statusDot, { backgroundColor: sustainable ? '#4CAF50' : TACTICAL.amber }]} />
        <Text style={[s.statusText, { color: sustainable ? '#4CAF50' : TACTICAL.amber }]}>
          {sustainable ? 'SUSTAINABLE' : 'LIMITED'}
        </Text>
      </View>

      {/* Tactical bars */}
      <TacticalBar label="BATTERY" value={batteryPct} max={100} color={batteryColor} unit="%" warning />
      <TacticalBar label="SOLAR" value={solarW} max={Math.max(solarW, 400)} color="#FFB300" unit="W" />
      <TacticalBar label="FRIDGE" value={fridgeDraw} max={100} color="#4FC3F7" unit="W" />

      {/* Metrics */}
      <View style={{ marginTop: 4 }}>
        <MetricRow label="DAILY RETURN" value={solarDaily > 0 ? `${solarDaily.toFixed(0)} Wh` : '\u2014'} />
        <MetricRow label="EST. RUNTIME" value={runtimeHrs > 0 ? `${runtimeHrs} hrs` : '\u2014'}
          color={runtimeHrs < 12 ? TACTICAL.danger : runtimeHrs < 24 ? TACTICAL.amber : '#4CAF50'} />
        <MetricRow label="CAPACITY" value={batteryWh > 0 ? `${batteryWh} Wh` : '\u2014'} />
      </View>
    </View>
  );
}


// ═══════════════════════════════════════════════════════════
// CORE 4 WIDGET C — SUSTAINABILITY (Phase 5: Single Source of Truth)
//
// Planning mode (no active expedition): editable fuel% + water gal
// Active mode (expedition IN_PROGRESS): read-only display
// On save → consumablesStore persists immediately → weight system
// recalculates → Vehicle Systems widget updates via WidgetGrid
// consumablesStore subscription.
//
// Tank capacity guardrail: if missing, show helper text in editor.
// ═══════════════════════════════════════════════════════════
function SustainabilityWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // ── BLU Power Telemetry (Phase 1C/1E) ──
  const blu = useBlu();
  const bluAvailable = blu.isAvailable;
  const bluLive = blu.isLive;
  const bluStale = blu.isStale;
  const bluUpdating = blu.isUpdating;
  const bluSummary = blu.summary;

  // ── Resolve vehicle context ──
  const specEntry = vehicleSpecStore.getFirst();
  const vehicleId = specEntry?.vehicleId || '';
  const spec = specEntry?.spec || null;
  const consumables = vehicleId ? consumablesStore.get(vehicleId) : null;

  // ── Current values ──
  const fuelPct = consumables?.fuel_percent_current ?? 100;
  const waterGal = consumables?.water_gal_current ?? 0;

  // ── Planning vs Active mode ──
  const activeExpedition = missionExpeditionStore.getActive();
  const isPlanningMode = activeExpedition == null;

  // ── Est. Range (only if tank capacity + mpg available) ──
  const tankCapGal = spec?.fuel_tank_capacity_gal ?? 0;
  const trip = data.activeTrip;
  const mpg = trip?.capac_mpg ?? 0;
  const currentFuelGal = tankCapGal > 0 ? tankCapGal * (fuelPct / 100) : 0;
  const estRange = currentFuelGal > 0 && mpg > 0 ? Math.round(currentFuelGal * mpg) : null;

  // ── Editing state (only used in planning mode) ──
  const [editingField, setEditingField] = useState<'fuel' | 'water' | null>(null);
  const [editFuelVal, setEditFuelVal] = useState(String(fuelPct));
  const [editWaterVal, setEditWaterVal] = useState(String(waterGal));
  const [showUpdated, setShowUpdated] = useState(false);
  const updatedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // ── Flash "Updated" indicator ──
  const flashUpdated = useCallback(() => {
    setShowUpdated(true);
    fadeAnim.setValue(1);
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 1800,
      useNativeDriver: true,
    }).start();
    if (updatedTimerRef.current) clearTimeout(updatedTimerRef.current);
    updatedTimerRef.current = setTimeout(() => setShowUpdated(false), 2000);
  }, [fadeAnim]);

  // ── Cleanup timer on unmount ──
  useEffect(() => {
    return () => {
      if (updatedTimerRef.current) clearTimeout(updatedTimerRef.current);
    };
  }, []);

  // ── Close editor if mode switches to active ──
  useEffect(() => {
    if (!isPlanningMode && editingField) {
      setEditingField(null);
    }
  }, [isPlanningMode, editingField]);

  // ── Save fuel ──
  const saveFuel = useCallback(() => {
    if (!vehicleId || !isPlanningMode) return;
    const parsed = parseInt(editFuelVal, 10);
    const clamped = isNaN(parsed) ? fuelPct : Math.max(0, Math.min(100, parsed));
    consumablesStore.setFuelPercent(vehicleId, clamped);
    setEditFuelVal(String(clamped));
    setEditingField(null);
    flashUpdated();
  }, [vehicleId, editFuelVal, fuelPct, flashUpdated, isPlanningMode]);

  // ── Save water ──
  const saveWater = useCallback(() => {
    if (!vehicleId || !isPlanningMode) return;
    const parsed = parseFloat(editWaterVal);
    const clamped = isNaN(parsed) ? waterGal : Math.max(0, parsed);
    consumablesStore.setWaterGal(vehicleId, clamped);
    setEditWaterVal(String(clamped));
    setEditingField(null);
    flashUpdated();
  }, [vehicleId, editWaterVal, waterGal, flashUpdated, isPlanningMode]);

  // ── Colors ──
  const fuelColor = fuelPct <= 15 ? '#EF5350' : fuelPct <= 30 ? '#FFB74D' : '#4CAF50';
  const waterColor = waterGal > 0 ? '#4CAF50' : TACTICAL.textMuted;

  // ── BLU color helpers ──
  const bluBattPct = bluSummary.battery_percent ?? 0;
  const bluBattColor = bluBattPct >= 60 ? '#4CAF50' : bluBattPct >= 25 ? '#FFB300' : '#EF5350';
  const bluSolarW = bluSummary.solar_input ?? 0;
  const bluOutputW = bluSummary.live_output ?? 0;
  const bluInputW = bluSummary.live_input ?? 0;
  const bluRuntimeMin = bluSummary.runtime_remaining;

  // ── Compact mode ──
  if (compact) {
    // When BLU is available, show power data in compact mode
    if (bluAvailable && bluSummary.battery_percent != null) {
      return (
        <View style={s.compactRow}>
          <View style={s.compactCell}>
            <Text style={s.compactLabel}>SOC</Text>
            <Text style={[s.compactValue, { color: bluStale ? TACTICAL.textMuted : bluBattColor }]}>
              {bluBattPct}%
            </Text>
          </View>
          <View style={s.compactCell}>
            <Text style={s.compactLabel}>SOLAR</Text>
            <Text style={[s.compactValue, { color: bluSolarW > 0 ? '#FFB300' : TACTICAL.textMuted }]}>
              {bluSolarW > 0 ? `${bluSolarW}W` : '\u2014'}
            </Text>
          </View>
          <View style={s.compactCell}>
            <Text style={s.compactLabel}>FUEL</Text>
            <Text style={[s.compactValue, { color: fuelColor }]}>{fuelPct}%</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>FUEL</Text>
          <Text style={[s.compactValue, { color: fuelColor }]}>{fuelPct}%</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>WATER</Text>
          <Text style={[s.compactValue, { color: waterColor }]}>
            {waterGal > 0 ? `${waterGal}` : '\u2014'}
          </Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>RANGE</Text>
          <Text style={s.compactValue}>{estRange ? `${estRange}` : '\u2014'}</Text>
        </View>
      </View>
    );
  }

  // ═══ EMPTY STATE: No vehicle spec configured ═══
  if (!spec && !bluAvailable) {
    return (
      <View style={core4.body}>
        <EmptyStateMicrocopy primary="Set fuel & water" secondary="Tap to edit" />
      </View>
    );
  }

  // ═══ BLU POWER SECTION (Phase 1C) ═══
  // When BLU is available, show live power telemetry prominently
  const bluPowerSection = bluAvailable && bluSummary.battery_percent != null ? (
    <View style={bluWidgetS.section}>
      {/* BLU status badge */}
      <View style={[bluWidgetS.badge, {
        backgroundColor: bluLive ? 'rgba(76,175,80,0.10)' : bluStale ? 'rgba(239,83,80,0.10)' : 'rgba(255,179,0,0.10)',
      }]}>
        <View style={[bluWidgetS.badgeDot, {
          backgroundColor: bluLive ? '#4CAF50' : bluStale ? '#EF5350' : '#FFB300',
        }]} />
        <Text style={[bluWidgetS.badgeText, {
          color: bluLive ? '#4CAF50' : bluStale ? '#EF5350' : '#FFB300',
        }]}>
          {bluLive ? 'BLU LIVE' : bluStale ? 'BLU STALE' : 'BLU'}
        </Text>
        <Text style={bluWidgetS.freshnessText}>{blu.freshnessText}</Text>
      </View>

      {/* Battery SOC */}
      <MetricRow
        label="BATTERY"
        value={`${bluBattPct}%`}
        color={bluStale ? TACTICAL.textMuted : bluBattColor}
      />

      {/* Solar input (when available) */}
      {bluSolarW > 0 && (
        <MetricRow
          label="SOLAR IN"
          value={`${bluSolarW} W`}
          color={bluStale ? TACTICAL.textMuted : '#FFB300'}
        />
      )}

      {/* Live input (when different from solar) */}
      {bluInputW > 0 && bluInputW !== bluSolarW && (
        <MetricRow
          label="INPUT"
          value={`${bluInputW} W`}
          color={bluStale ? TACTICAL.textMuted : '#4FC3F7'}
        />
      )}

      {/* Live output */}
      {bluOutputW > 0 && (
        <MetricRow
          label="OUTPUT"
          value={`${bluOutputW} W`}
          color={bluStale ? TACTICAL.textMuted : TACTICAL.amber}
        />
      )}

      {/* Runtime remaining (when available) */}
      {bluRuntimeMin != null && bluRuntimeMin > 0 && (
        <MetricRow
          label="RUNTIME"
          value={bluRuntimeMin >= 60
            ? `${Math.floor(bluRuntimeMin / 60)}h ${bluRuntimeMin % 60}m`
            : `${bluRuntimeMin}m`}
          color={bluStale ? TACTICAL.textMuted : (bluRuntimeMin < 60 ? '#EF5350' : bluRuntimeMin < 180 ? '#FFB300' : '#4CAF50')}
        />
      )}
    </View>
  ) : null;

  // ═══ EMPTY STATE: Spec exists but no capacities set and no BLU ═══
  if (tankCapGal <= 0 && waterGal <= 0 && !bluAvailable) {
    return (
      <View style={core4.body}>
        <EmptyStateMicrocopy primary="Set capacities" secondary="Tap to set" />
      </View>
    );
  }

  // ═══ BLU-ONLY MODE: No vehicle spec but BLU is available ═══
  if (!spec && bluAvailable) {
    return (
      <View style={core4.body}>
        {bluPowerSection}
      </View>
    );
  }

  // ═══ ACTIVE MODE: Read-only display ═══
  if (!isPlanningMode) {
    return (
      <View style={core4.body}>
        {/* BLU power section (when available) */}
        {bluPowerSection}

        <MetricRow label="FUEL" value={`${fuelPct}%`} color={fuelColor} />
        <MetricRow
          label="WATER"
          value={waterGal > 0 ? `${waterGal} gal` : '\u2014'}
          color={waterColor}
        />
        {estRange != null && (
          <MetricRow label="EST. RANGE" value={`${estRange} mi`} />
        )}
        {/* Read-only indicator */}
        <View style={sustS.readOnlyBadge}>
          <Ionicons name="lock-closed-outline" size={8} color={TACTICAL.textMuted} />
          <Text style={sustS.readOnlyText}>ACTIVE MODE</Text>
        </View>
      </View>
    );
  }

  // ═══ PLANNING MODE: Editable display ═══
  return (
    <View style={core4.body}>
      {/* BLU power section (when available, even in planning mode) */}
      {bluPowerSection}

      {/* ── Fuel Row (tappable in planning mode) ── */}
      {editingField === 'fuel' ? (
        <View style={sustS.editorRow}>
          <Text style={s.metricLabel}>FUEL</Text>
          <View style={sustS.editorInputRow}>
            <TextInput
              style={sustS.editorInput}
              value={editFuelVal}
              onChangeText={setEditFuelVal}
              keyboardType="number-pad"
              maxLength={3}
              selectTextOnFocus
              autoFocus
              onSubmitEditing={saveFuel}
              returnKeyType="done"
            />
            <Text style={sustS.editorUnit}>%</Text>
            <TouchableOpacity style={sustS.editorSaveBtn} onPress={saveFuel} activeOpacity={0.7}>
              <Ionicons name="checkmark" size={12} color={TACTICAL.bg} />
            </TouchableOpacity>
            <TouchableOpacity
              style={sustS.editorCancelBtn}
              onPress={() => { setEditingField(null); setEditFuelVal(String(fuelPct)); }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={10} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={s.metricRow}
          onPress={() => { setEditingField('fuel'); setEditFuelVal(String(fuelPct)); }}
          activeOpacity={0.6}
        >
          <Text style={s.metricLabel}>FUEL</Text>
          <View style={sustS.tappableValue}>
            <Text style={[s.metricValue, { color: fuelColor }]}>{fuelPct}%</Text>
            <Ionicons name="pencil-outline" size={8} color={TACTICAL.textMuted + '60'} />
          </View>
        </TouchableOpacity>
      )}

      {/* Tank capacity helper text (shown when editing fuel and no tank capacity) */}
      {editingField === 'fuel' && tankCapGal <= 0 && (
        <View style={sustS.helperRow}>
          <Ionicons name="information-circle-outline" size={10} color="#FFB74D" />
          <Text style={sustS.helperText}>Set tank capacity to compute fuel weight.</Text>
        </View>
      )}

      {/* ── Water Row (tappable in planning mode) ── */}
      {editingField === 'water' ? (
        <View style={sustS.editorRow}>
          <Text style={s.metricLabel}>WATER</Text>
          <View style={sustS.editorInputRow}>
            <TextInput
              style={sustS.editorInput}
              value={editWaterVal}
              onChangeText={setEditWaterVal}
              keyboardType="decimal-pad"
              maxLength={6}
              selectTextOnFocus
              autoFocus
              onSubmitEditing={saveWater}
              returnKeyType="done"
            />
            <Text style={sustS.editorUnit}>gal</Text>
            <TouchableOpacity style={sustS.editorSaveBtn} onPress={saveWater} activeOpacity={0.7}>
              <Ionicons name="checkmark" size={12} color={TACTICAL.bg} />
            </TouchableOpacity>
            <TouchableOpacity
              style={sustS.editorCancelBtn}
              onPress={() => { setEditingField(null); setEditWaterVal(String(waterGal)); }}
              activeOpacity={0.7}
            >
              <Ionicons name="close" size={10} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={s.metricRow}
          onPress={() => { setEditingField('water'); setEditWaterVal(String(waterGal)); }}
          activeOpacity={0.6}
        >
          <Text style={s.metricLabel}>WATER</Text>
          <View style={sustS.tappableValue}>
            <Text style={[s.metricValue, { color: waterColor }]}>
              {waterGal > 0 ? `${waterGal} gal` : '\u2014'}
            </Text>
            <Ionicons name="pencil-outline" size={8} color={TACTICAL.textMuted + '60'} />
          </View>
        </TouchableOpacity>
      )}

      {/* ── Est. Range (read-only, only if data available) ── */}
      {estRange != null && (
        <MetricRow label="EST. RANGE" value={`${estRange} mi`} />
      )}

      {/* ── "Updated" flash indicator ── */}
      {showUpdated && (
        <Animated.View style={[sustS.updatedBadge, { opacity: fadeAnim }]}>
          <Ionicons name="checkmark-circle" size={10} color="#4CAF50" />
          <Text style={sustS.updatedText}>Updated</Text>
        </Animated.View>
      )}
    </View>
  );
}






// ═══════════════════════════════════════════════════════════
// CORE 4 WIDGET D — PROGRESS
//
// Phase 4.1: Route context via routeStore + GPS with
// automatic waypoint advancement.
//
// Data sources:
//   - routeStore.getActive() → ImportedRoute (waypoints[], total_distance_miles)
//   - options.gpsLatitude/gpsLongitude/gpsSpeedMph/gpsHasFix from useGPSLocation
//   - waypointProgressStore → persisted waypoint index per route
//
// Waypoint Advancement:
//   - Tracks activeRouteWaypointIndex in waypointProgressStore
//   - Arrival threshold: <= 0.15 miles (800 ft)
//   - Auto-advances to next waypoint on arrival
//   - Shows subtle toast: "Reached <WaypointName>"
//   - Clamps at last waypoint
//   - Resets when active route changes
//
// Remaining Distance:
//   - Sum of straight-line distances from current position
//     through remaining waypoints in order
//
// Display (3 lines max):
//   1) Next: <WaypointName> — <X.X> mi
//   2) Remaining: <X.X> mi  (or Total if no GPS)
//   3) ETA: <Xh Xm>
//
// ETA priority:
//   A) GPS speed > 3 mph → remainingMi / speedMph
//   B) Else → remainingMi / 20 mph (conservative default)
//
// Tap → Navigate tab (handled externally in dashboard.tsx)
// ═══════════════════════════════════════════════════════════

/** Haversine distance between two lat/lng points in miles */
function haversineMi(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Format hours as Xh Ym */
function formatEta(hours: number): string {
  if (hours < 0.1) return '< 1m';
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** Default average speed for ETA when GPS speed unavailable */
const DEFAULT_AVG_MPH = 20;

/**
 * Calculate remaining distance from current GPS position through
 * remaining waypoints in order (straight-line approximation).
 *
 * remainingMi = haversine(pos → wp[idx]) + haversine(wp[idx] → wp[idx+1]) + ...
 */
function calcRemainingDistance(
  waypoints: { lat: number; lon: number }[],
  wpIndex: number,
  gpsLat: number,
  gpsLon: number,
): number {
  if (waypoints.length === 0 || wpIndex >= waypoints.length) return 0;

  // Distance from current position to the target waypoint
  let remaining = haversineMi(gpsLat, gpsLon, waypoints[wpIndex].lat, waypoints[wpIndex].lon);

  // Sum distances between remaining waypoints in order
  for (let i = wpIndex; i < waypoints.length - 1; i++) {
    remaining += haversineMi(
      waypoints[i].lat, waypoints[i].lon,
      waypoints[i + 1].lat, waypoints[i + 1].lon,
    );
  }

  return remaining;
}

function ProgressWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // ── Toast for waypoint arrival ──
  let showToast: ((msg: string) => void) | null = null;
  try {
    const app = useApp();
    showToast = app.showToast;
  } catch {
    // AppContext may not be available in some render paths
  }

  // ── Route data from routeStore ──
  const activeRoute = routeStore.getActive();
  const hasRoute = activeRoute != null;
  const routeId = activeRoute?.id ?? '';
  const totalMi = activeRoute?.total_distance_miles ?? 0;
  const routeWaypoints = activeRoute?.waypoints ?? [];
  const hasWaypoints = routeWaypoints.length > 0;
  const maxWpIndex = hasWaypoints ? routeWaypoints.length - 1 : 0;

  // ── GPS data from options ──
  const gpsLat = options?.gpsLatitude;
  const gpsLon = options?.gpsLongitude;
  const gpsSpeed = options?.gpsSpeedMph;
  const hasFix = options?.gpsHasFix ?? false;
  const hasGps = hasFix && gpsLat != null && gpsLon != null;

  // ── Waypoint progress tracking (Phase 4.1) ──
  // Initialize from persisted store; default to 0 for new routes
  const [wpIndex, setWpIndex] = useState(() => {
    if (!routeId) return 0;
    return waypointProgressStore.getIndex(routeId);
  });

  // Ref to prevent duplicate arrival triggers within the same GPS update cycle
  const lastAdvancedIdxRef = useRef(-1);
  // Track previous route ID to detect route changes
  const prevRouteIdRef = useRef(routeId);

  // ── Reset progress when active route changes ──
  useEffect(() => {
    if (routeId !== prevRouteIdRef.current) {
      prevRouteIdRef.current = routeId;
      if (routeId) {
        const storedIdx = waypointProgressStore.getIndex(routeId);
        setWpIndex(storedIdx);
        lastAdvancedIdxRef.current = -1;
      } else {
        setWpIndex(0);
        lastAdvancedIdxRef.current = -1;
      }
    }
  }, [routeId]);

  // ── Arrival detection & auto-advancement ──
  // Runs on each GPS update. Checks if distance to current target
  // waypoint is <= ARRIVAL_THRESHOLD_MI (0.15 mi / 800 ft).
  useEffect(() => {
    if (!hasRoute || !hasWaypoints || !hasGps || !routeId) return;
    if (wpIndex > maxWpIndex) return;
    if (wpIndex === lastAdvancedIdxRef.current) return; // Already processed this index

    const targetWp = routeWaypoints[wpIndex];
    if (!targetWp) return;

    const distToTarget = haversineMi(gpsLat!, gpsLon!, targetWp.lat, targetWp.lon);

    if (distToTarget <= ARRIVAL_THRESHOLD_MI) {
      // Mark this waypoint as reached
      const wpName = targetWp.name || `WP ${wpIndex + 1}`;

      if (wpIndex < maxWpIndex) {
        // Advance to next waypoint
        const newIdx = waypointProgressStore.advance(routeId, maxWpIndex);
        lastAdvancedIdxRef.current = wpIndex;
        setWpIndex(newIdx);

        // Subtle toast notification
        if (showToast) {
          showToast(`Reached ${wpName}`);
        }
      } else {
        // Last waypoint reached — mark as reached but don't advance
        waypointProgressStore.advance(routeId, maxWpIndex);
        lastAdvancedIdxRef.current = wpIndex;

        if (showToast) {
          showToast(`Reached ${wpName} \u2014 Route complete`);
        }
      }
    }
  }, [gpsLat, gpsLon, hasGps, hasRoute, hasWaypoints, routeId, wpIndex, maxWpIndex, routeWaypoints, showToast]);

  // ── Clamp wpIndex to valid range (failsafe) ──
  const safeWpIndex = hasWaypoints ? Math.min(wpIndex, maxWpIndex) : 0;

  // ── Current target waypoint ──
  const targetWp = hasWaypoints ? routeWaypoints[safeWpIndex] : null;
  const targetWpName = targetWp?.name || (hasWaypoints ? `WP ${safeWpIndex + 1}` : null);

  // ── Distance to next waypoint ──
  let distToNextMi: number | null = null;
  if (targetWp && hasGps) {
    distToNextMi = haversineMi(gpsLat!, gpsLon!, targetWp.lat, targetWp.lon);
  }

  // ── Remaining distance (sum through remaining waypoints) ──
  let remainingMi: number | null = null;
  if (hasWaypoints && hasGps) {
    remainingMi = calcRemainingDistance(routeWaypoints, safeWpIndex, gpsLat!, gpsLon!);
  }

  // ── Route completion check ──
  const isComplete = hasRoute && routeId
    ? waypointProgressStore.isRouteComplete(routeId, routeWaypoints.length)
    : false;

  // ── ETA calculation ──
  // Uses remaining distance if available, otherwise total route distance
  let etaStr: string | null = null;
  const etaDistMi = remainingMi ?? (totalMi > 0 ? totalMi : null);
  if (etaDistMi != null && etaDistMi > 0) {
    const speed = (gpsSpeed != null && gpsSpeed > 3) ? gpsSpeed : DEFAULT_AVG_MPH;
    const etaHours = etaDistMi / speed;
    etaStr = formatEta(etaHours);
  }
  if (isComplete) etaStr = 'ARRIVED';

  // ═══ COMPACT MODE ═══
  if (compact) {
    if (!hasRoute) {
      return (
        <View style={s.compactRow}>
          <View style={s.compactCell}>
            <Text style={[s.compactValue, { fontSize: 9, color: TACTICAL.textMuted }]}>
              NO ROUTE
            </Text>
          </View>
        </View>
      );
    }
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>NEXT</Text>
          <Text style={s.compactValue}>
            {distToNextMi != null ? `${distToNextMi.toFixed(1)}` : '\u2014'}
          </Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>LEFT</Text>
          <Text style={s.compactValue}>
            {remainingMi != null ? `${remainingMi.toFixed(0)}` : totalMi > 0 ? `${totalMi.toFixed(0)}` : '\u2014'}
          </Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>ETA</Text>
          <Text style={[s.compactValue, { fontSize: 10 }]}>
            {etaStr ?? '\u2014'}
          </Text>
        </View>
      </View>
    );
  }

  // ═══ FALLBACK: No active route ═══
  if (!hasRoute) {
    return (
      <View style={core4.body}>
        <Text style={progS.fallbackText}>No route selected</Text>
        <View style={progS.fallbackAction}>
          <Ionicons name="navigate-outline" size={11} color={TACTICAL.amber} />
          <Text style={progS.fallbackActionText}>Open Navigate</Text>
        </View>
      </View>
    );
  }

  // ═══ FULL WIDGET: up to 3 lines ═══
  return (
    <View style={core4.body}>
      {/* Line 1: Next waypoint (tracked index) */}
      {hasWaypoints ? (
        isComplete ? (
          <MetricRow
            label="STATUS"
            value="Route complete"
            color="#4CAF50"
          />
        ) : hasGps && targetWpName && distToNextMi != null ? (
          <MetricRow
            label={`NEXT: ${targetWpName}`}
            value={`${distToNextMi.toFixed(1)} mi`}
          />
        ) : !hasFix ? (
          <MetricRow
            label="NEXT WAYPOINT"
            value="Locating\u2026"
            color={TACTICAL.textMuted}
          />
        ) : (
          <MetricRow
            label="WAYPOINTS"
            value={`${safeWpIndex + 1}/${routeWaypoints.length}`}
          />
        )
      ) : (
        <MetricRow
          label="STATUS"
          value="Route loaded"
          color={TACTICAL.textMuted}
        />
      )}

      {/* Line 2: Remaining or Total route distance */}
      {remainingMi != null ? (
        <MetricRow
          label="REMAINING"
          value={`${remainingMi.toFixed(1)} mi`}
        />
      ) : totalMi > 0 ? (
        <MetricRow
          label="TOTAL ROUTE"
          value={`${totalMi.toFixed(0)} mi`}
        />
      ) : null}

      {/* Line 3: ETA */}
      <MetricRow
        label="ETA"
        value={etaStr ?? '\u2014'}
      />
    </View>
  );
}




// ═══════════════════════════════════════════════════════════
// ACTIVE MODE WIDGET A — REMOTENESS (v2.0 Phase 3B)
//
// Phase 3B Performance Guardrails:
//   - Widget no longer feeds signals to the store on render
//   - Store gathers its own signals (gpsUIState, routeStore, connectivity)
//   - Store recomputes on a ~12s timer (not on GPS updates)
//   - Output object is identity-stable (no churn)
//   - RemotenessDetail reads cached elevation from store
//
// Widget responsibilities:
//   1) Start/stop the store on mount/unmount
//   2) Subscribe for reactive re-renders
//   3) Read current output from store
// ═══════════════════════════════════════════════════════════


function RemotenessWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // ── Subscribe to remotenessStore for reactive re-renders ──
  // Phase 3B: Notifications only fire when output meaningfully changes
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = remotenessStore.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  // ── Start/stop store lifecycle on mount/unmount ──
  // Phase 3B: Store gathers its own signals internally;
  // no feed() call needed from the widget.
  useEffect(() => {
    remotenessStore.start();
    return () => {
      remotenessStore.stop();
    };
  }, []); // mount/unmount only

  // ── Read current output from store ──
  // Phase 3B: Returns a stable cached object reference
  const output = remotenessStore.get();

  // ── Empty state: no active expedition ──
  const activeExpedition = missionExpeditionStore.getActive();
  const hasFix = options?.gpsHasFix ?? false;

  if (compact) {
    if (!activeExpedition) {
      return (
        <View style={s.compactRow}>
          <View style={s.compactCell}>
            <Text style={[s.compactValue, { fontSize: 8, color: TACTICAL.textMuted }]}>INACTIVE</Text>
          </View>
        </View>
      );
    }
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>TIER</Text>
          <Text style={[s.compactValue, { fontSize: 8, color: output.tierColor }]}>{output.tier}</Text>
        </View>
      </View>
    );
  }

  // ── Full widget empty states ──
  if (!activeExpedition) {
    return (
      <View style={remS.body}>
        <EmptyStateMicrocopy primary="Start expedition" secondary="Active mode only" />
      </View>
    );
  }

  if (!hasFix && output.score === 0) {
    return (
      <View style={remS.body}>
        <EmptyStateMicrocopy primary="Locating\u2026" />
      </View>
    );
  }

  return (
    <View style={remS.body}>
      <Text style={[remS.tierLabel, { color: output.tierColor }]}>{output.tier}</Text>
      <Text style={remS.supportLine} numberOfLines={1}>{output.reason}</Text>
    </View>
  );
}



function RemotenessDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  // ── Subscribe for live updates ──
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = remotenessStore.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  // ── Phase 4A: Subscribe to Risk Engine updates ──
  const [, setRiskRev] = useState(0);
  useEffect(() => {
    try {
      const { expeditionRiskStore } = require('../../lib/expeditionRiskStore');
      const unsub = expeditionRiskStore.subscribe(() => setRiskRev((r: number) => r + 1));
      return unsub;
    } catch { return undefined; }
  }, []);

  const output = remotenessStore.get();
  const { signals } = output;

  // ── Elevation complexity from cached store result (Phase 3B) ──
  const terrainComplexityResult = remotenessStore.getElevationResult();
  const activeRoute = routeStore.getActive();

  const terrainTierDisplay: Record<string, { label: string; color: string }> = {
    low:    { label: 'LOW',    color: '#4CAF50' },
    medium: { label: 'MEDIUM', color: '#FFB74D' },
    high:   { label: 'HIGH',   color: '#EF5350' },
  };

  const terrainInfo = terrainComplexityResult && terrainComplexityResult.hasElevation
    ? terrainTierDisplay[terrainComplexityResult.tier] || terrainTierDisplay.low
    : null;

  const terrainScoreContrib = terrainComplexityResult && terrainComplexityResult.hasElevation
    ? `+${TERRAIN_COMPLEXITY_SCORES[terrainComplexityResult.tier]} pts`
    : '\u2014';

  // ── Connectivity display ──
  // Phase 3D: Includes freshness awareness
  const connLabel: Record<ConnectivityState, string> = {
    online:  'ONLINE',
    offline: 'OFFLINE',
    degraded: 'DEGRADED',
    unknown: 'UNKNOWN',
  };
  const connColor: Record<ConnectivityState, string> = {
    online:  '#4CAF50',
    offline: '#EF5350',
    degraded: '#E67E22',
    unknown: TACTICAL.textMuted,
  };

  // ── Speed display ──
  const sustainedStr = signals.sustainedSpeedMph != null
    ? `${signals.sustainedSpeedMph.toFixed(1)} mph`
    : '\u2014';
  const speedActive = signals.speedScore > 0;

  // ── Phase 3C: Cache readiness display ──
  const cacheColor = signals.cacheReady ? '#2196F3' : TACTICAL.textMuted;
  const cacheLabel = signals.cacheReady ? 'READY' : 'NONE';

  // ── Phase 3D: Freshness display ──
  const freshnessLabel: Record<string, string> = {
    live: 'LIVE',
    recovering: 'RECOVERING',
    stale: 'STALE',
    offline: 'OFFLINE',
  };
  const freshnessColor: Record<string, string> = {
    live: '#4CAF50',
    recovering: '#FFB300',
    stale: '#E67E22',
    offline: '#EF5350',
  };
  const currentFreshness = signals.freshness || 'offline';

  // ── Phase 4A: Risk Engine data ──
  let riskEvaluation: any = null;
  let riskState: any = null;
  try {
    const { expeditionRiskStore } = require('../../lib/expeditionRiskStore');
    riskEvaluation = expeditionRiskStore.getEvaluation();
    riskState = expeditionRiskStore.getState();
  } catch {}

  const riskStatusColors: Record<string, string> = {
    optimal: '#4CAF50',
    caution: '#FFB300',
    elevated: '#E67E22',
    critical: '#EF5350',
  };

  const riskStatusLabels: Record<string, string> = {
    optimal: 'OPTIMAL',
    caution: 'CAUTION',
    elevated: 'ELEVATED',
    critical: 'CRITICAL',
  };

  const riskFactorLabels: Record<string, string> = {
    vehicle_overweight: 'VEHICLE OVERWEIGHT',
    fuel_critical: 'FUEL CRITICAL',
    water_critical: 'WATER CRITICAL',
    power_critical: 'POWER CRITICAL',
    no_connectivity: 'NO CONNECTIVITY',
    high_remoteness: 'HIGH REMOTENESS',
    terrain_difficulty: 'TERRAIN DIFFICULTY',
    vehicle_health: 'VEHICLE HEALTH',
    loadout_incomplete: 'LOADOUT INCOMPLETE',
    no_route: 'NO ROUTE',
    multiple_concerns: 'MULTIPLE CONCERNS',
    none: 'NONE',
  };

  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>REMOTENESS ASSESSMENT</Text>
      <MetricRow label="TIER" value={output.tier} color={output.tierColor} />
      <MetricRow label="SCORE" value={`${output.score} / 100`} color={output.tierColor} />
      <MetricRow label="RAW SCORE" value={`${output.rawScore}`} color={TACTICAL.textMuted} />
      <MetricRow label="REASON" value={output.reason} color={TACTICAL.textMuted} />

      {/* ── Signal A: Elevation complexity ── */}
      {terrainInfo ? (
        <>
          <View style={s.detailDivider} />
          <Text style={s.detailSection}>SIGNAL A: ELEVATION</Text>
          <MetricRow label="TERRAIN COMPLEXITY" value={terrainInfo.label} color={terrainInfo.color} />
          <MetricRow label="SCORE" value={terrainScoreContrib} color={TACTICAL.textMuted} />
          <MetricRow label="WINDOW" value={`${terrainComplexityResult!.windowMiles} mi`} />
          <MetricRow
            label="ELEV. RANGE"
            value={`${terrainComplexityResult!.elevRangeFt.toLocaleString()} ft`}
            color={terrainComplexityResult!.elevRangeFt >= 900 ? '#EF5350' : terrainComplexityResult!.elevRangeFt >= 400 ? '#FFB74D' : '#4CAF50'}
          />
          <MetricRow
            label="ELEV. CHURN"
            value={`${terrainComplexityResult!.elevChurnFtPerMi.toLocaleString()} ft/mi`}
            color={terrainComplexityResult!.elevChurnFtPerMi >= 600 ? '#EF5350' : terrainComplexityResult!.elevChurnFtPerMi >= 250 ? '#FFB74D' : '#4CAF50'}
          />
        </>
      ) : (
        <>
          <View style={s.detailDivider} />
          <Text style={s.detailSection}>SIGNAL A: ELEVATION</Text>
          <MetricRow label="TERRAIN COMPLEXITY" value={activeRoute ? 'NO ELEVATION DATA' : 'NO ROUTE'} color={TACTICAL.textMuted} />
          <MetricRow label="SCORE" value="+0 pts" color={TACTICAL.textMuted} />
        </>
      )}

      {/* ── Signal B: Connectivity (Phase 3D: freshness-aware) ── */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>SIGNAL B: CONNECTIVITY</Text>
      <MetricRow
        label="STATE"
        value={connLabel[signals.connectivityState] || 'UNKNOWN'}
        color={connColor[signals.connectivityState] || TACTICAL.textMuted}
      />
      <MetricRow
        label="SCORE"
        value={`+${signals.connectivityScore} pts`}
        color={signals.connectivityScore > 0 ? '#EF5350' : TACTICAL.textMuted}
      />
      <MetricRow
        label="OFFLINE CACHE"
        value={cacheLabel}
        color={cacheColor}
      />
      <MetricRow
        label="DATA FRESHNESS"
        value={freshnessLabel[currentFreshness] || 'UNKNOWN'}
        color={freshnessColor[currentFreshness] || TACTICAL.textMuted}
      />

      {/* ── Signal C: Speed Nuance (Phase 2) ── */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>SIGNAL C: SPEED NUANCE</Text>
      <MetricRow
        label="SUSTAINED SPEED"
        value={sustainedStr}
        color={speedActive ? '#FFB74D' : TACTICAL.textMuted}
      />
      <MetricRow
        label="THRESHOLD"
        value="< 8 mph"
        color={TACTICAL.textMuted}
      />
      <MetricRow
        label="SCORE"
        value={`+${signals.speedScore} pts`}
        color={speedActive ? '#FFB74D' : TACTICAL.textMuted}
      />

      {/* ── Phase 4A/4C: Expedition Risk Engine ── */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>EXPEDITION RISK ENGINE</Text>
      {riskEvaluation ? (
        <>
          <MetricRow
            label="OPERATIONAL STATUS"
            value={riskStatusLabels[riskEvaluation.operational_status] || 'UNKNOWN'}
            color={riskStatusColors[riskEvaluation.operational_status] || TACTICAL.textMuted}
          />
          <MetricRow
            label="RISK SCORE"
            value={`${riskEvaluation.risk_score} / 100`}
            color={riskStatusColors[riskEvaluation.operational_status] || TACTICAL.textMuted}
          />
          <MetricRow
            label="PRIMARY FACTOR"
            value={riskFactorLabels[riskEvaluation.primary_risk_factor] || 'UNKNOWN'}
            color={riskEvaluation.primary_risk_factor !== 'none' ? '#FFB74D' : TACTICAL.textMuted}
          />
          <MetricRow
            label="CAPABILITY"
            value={`${riskEvaluation.capability_score} / 100`}
            color={riskEvaluation.capability_score >= 60 ? '#4CAF50' : riskEvaluation.capability_score >= 30 ? '#FFB300' : '#EF5350'}
          />
          <MetricRow
            label="RESOURCES"
            value={`${riskEvaluation.resource_readiness} / 100`}
            color={riskEvaluation.resource_readiness >= 60 ? '#4CAF50' : riskEvaluation.resource_readiness >= 30 ? '#FFB300' : '#EF5350'}
          />
          <MetricRow
            label="CONNECTIVITY RISK"
            value={`${riskEvaluation.connectivity_risk} / 100`}
            color={riskEvaluation.connectivity_risk <= 25 ? '#4CAF50' : riskEvaluation.connectivity_risk <= 50 ? '#FFB300' : '#EF5350'}
          />
          <MetricRow
            label="ISOLATION RISK"
            value={`${riskEvaluation.isolation_risk} / 100`}
            color={riskEvaluation.isolation_risk <= 25 ? '#4CAF50' : riskEvaluation.isolation_risk <= 50 ? '#FFB300' : '#EF5350'}
          />
          <MetricRow
            label="DATA INPUTS"
            value={`${riskEvaluation.available_inputs} / ${riskEvaluation.total_inputs}`}
            color={riskEvaluation.is_complete ? '#4CAF50' : '#FFB300'}
          />
          <MetricRow
            label="SUMMARY"
            value={riskEvaluation.summary_line}
            color={TACTICAL.textMuted}
          />
        </>
      ) : (
        <MetricRow label="STATUS" value="NOT INITIALIZED" color={TACTICAL.textMuted} />
      )}

      {/* ── Phase 4C: Environmental Risk Inputs ── */}
      {(() => {
        let riskSnapshot: any = null;
        try {
          const { expeditionRiskStore: rs } = require('../../lib/expeditionRiskStore');
          riskSnapshot = rs.getLastInputSnapshot();
        } catch {}

        if (!riskSnapshot) return null;

        const rem = riskSnapshot.remoteness;
        const conn = riskSnapshot.connectivity_status;

        const opStateColors: Record<string, string> = {
          online_ready: '#4CAF50',
          offline_ready: '#2196F3',
          degraded_ready: '#FFB300',
          degraded_unprepared: '#E67E22',
          offline_unprepared: '#EF5350',
        };
        const opStateLabels: Record<string, string> = {
          online_ready: 'ONLINE READY',
          offline_ready: 'OFFLINE READY',
          degraded_ready: 'DEGRADED READY',
          degraded_unprepared: 'DEGRADED UNPREPARED',
          offline_unprepared: 'OFFLINE UNPREPARED',
        };

        return (
          <>
            <View style={s.detailDivider} />
            <Text style={s.detailSection}>REMOTENESS RISK INPUT</Text>
            <MetricRow
              label="AVAILABILITY"
              value={rem.availability?.toUpperCase() || 'UNKNOWN'}
              color={rem.availability === 'available' ? '#4CAF50' : rem.availability === 'stale' ? '#FFB300' : TACTICAL.textMuted}
            />
            {rem.remoteness_score != null && (
              <MetricRow
                label="SCORE (SMOOTHED)"
                value={`${rem.remoteness_score}`}
                color={rem.tier_color || TACTICAL.textMuted}
              />
            )}
            {rem.raw_score != null && (
              <MetricRow label="SCORE (RAW)" value={`${rem.raw_score}`} color={TACTICAL.textMuted} />
            )}
            {rem.route_isolation_score != null && (
              <MetricRow
                label="ROUTE ISOLATION"
                value={`${rem.route_isolation_score} / 100`}
                color={rem.route_isolation_score > 50 ? '#EF5350' : rem.route_isolation_score > 25 ? '#FFB300' : '#4CAF50'}
              />
            )}
            {rem.distance_from_services_mi != null && (
              <MetricRow
                label="DIST. FROM SERVICES"
                value={`~${rem.distance_from_services_mi} mi`}
                color={rem.distance_from_services_mi > 50 ? '#EF5350' : rem.distance_from_services_mi > 20 ? '#FFB300' : TACTICAL.textMuted}
              />
            )}
            <MetricRow label="ELEV. SIGNAL" value={`+${rem.elevation_signal_score} pts`} color={rem.elevation_signal_score > 0 ? '#FFB74D' : TACTICAL.textMuted} />
            <MetricRow label="CONN. SIGNAL" value={`+${rem.connectivity_signal_score} pts`} color={rem.connectivity_signal_score > 0 ? '#EF5350' : TACTICAL.textMuted} />
            <MetricRow label="SPEED SIGNAL" value={`+${rem.speed_signal_score} pts`} color={rem.speed_signal_score > 0 ? '#FFB74D' : TACTICAL.textMuted} />
            <MetricRow label="CACHE READY" value={rem.cache_ready ? 'YES' : 'NO'} color={rem.cache_ready ? '#2196F3' : TACTICAL.textMuted} />

            <View style={s.detailDivider} />
            <Text style={s.detailSection}>CONNECTIVITY RISK INPUT</Text>
            <MetricRow
              label="AVAILABILITY"
              value={conn.availability?.toUpperCase() || 'UNKNOWN'}
              color={conn.availability === 'available' ? '#4CAF50' : conn.availability === 'stale' ? '#FFB300' : TACTICAL.textMuted}
            />
            <MetricRow
              label="OP. CONN. STATE"
              value={opStateLabels[conn.operational_connectivity_state] || conn.operational_connectivity_state?.toUpperCase() || 'UNKNOWN'}
              color={opStateColors[conn.operational_connectivity_state] || TACTICAL.textMuted}
            />
            <MetricRow
              label="SIGNAL QUALITY"
              value={(conn.signal_quality || 'unknown').toUpperCase()}
              color={conn.signal_quality === 'excellent' || conn.signal_quality === 'good' ? '#4CAF50' : conn.signal_quality === 'fair' ? '#FFB300' : conn.signal_quality === 'poor' ? '#EF5350' : TACTICAL.textMuted}
            />
            <MetricRow
              label="NETWORK TYPE"
              value={(conn.network_type || 'unknown').toUpperCase()}
              color={conn.network_type === 'wifi' || conn.network_type === 'cellular' ? '#4CAF50' : TACTICAL.textMuted}
            />
            <MetricRow
              label="QUALITY"
              value={(conn.quality || 'unknown').toUpperCase()}
              color={conn.quality === 'strong' ? '#4CAF50' : conn.quality === 'moderate' ? '#FFB300' : conn.quality === 'weak' ? '#EF5350' : TACTICAL.textMuted}
            />
            {conn.latency_ms != null && (
              <MetricRow
                label="LATENCY"
                value={`${conn.latency_ms} ms`}
                color={conn.latency_ms <= 100 ? '#4CAF50' : conn.latency_ms <= 500 ? '#FFB300' : '#EF5350'}
              />
            )}
            <MetricRow label="INTERNET" value={conn.internet_reachable ? 'REACHABLE' : 'UNREACHABLE'} color={conn.internet_reachable ? '#4CAF50' : '#EF5350'} />
            <MetricRow label="CACHE" value={conn.offline_cache_ready ? 'READY' : 'NONE'} color={conn.offline_cache_ready ? '#2196F3' : TACTICAL.textMuted} />
            <MetricRow label="CACHED REGION" value={conn.cached_region_available ? 'YES' : 'NO'} color={conn.cached_region_available ? '#2196F3' : TACTICAL.textMuted} />
            <MetricRow label="CACHED ROUTE" value={conn.cached_route_available ? 'YES' : 'NO'} color={conn.cached_route_available ? '#2196F3' : TACTICAL.textMuted} />
            <MetricRow
              label="FRESHNESS"
              value={(conn.freshness || 'offline').toUpperCase()}
              color={conn.freshness === 'live' ? '#4CAF50' : conn.freshness === 'recovering' ? '#FFB300' : conn.freshness === 'stale' ? '#E67E22' : '#EF5350'}
            />
            {conn.hours_since_online != null && (
              <MetricRow
                label="HOURS SINCE ONLINE"
                value={`${conn.hours_since_online}h`}
                color={conn.hours_since_online > 12 ? '#EF5350' : conn.hours_since_online > 4 ? '#FFB300' : TACTICAL.textMuted}
              />
            )}
            {conn.is_recovering && (
              <MetricRow label="RECOVERY" value="IN PROGRESS" color="#FFB300" />
            )}
          </>
        );
      })()}

      {/* ── Tier Scale ── */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>TIER SCALE</Text>
      <MetricRow label="0\u201315" value="NEAR CIVILIZATION" color="#4CAF50" />
      <MetricRow label="16\u201335" value="BACKCOUNTRY" color="#C48A2C" />
      <MetricRow label="36\u201360" value="REMOTE" color="#E67E22" />
      <MetricRow label="61\u201380" value="DEEP REMOTE" color="#EF5350" />
      <MetricRow label="81\u2013100" value="EXTREME" color="#C0392B" />

      {/* ── Engine Info ── */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>ENGINE</Text>
      <MetricRow label="REMOTENESS" value="v2.3 (Phase 3D)" />
      <MetricRow label="RISK ENGINE" value="v1.2 (Phase 4C)" color="#9C88FF" />
      <MetricRow label="SMOOTHING" value="0.85 / 0.15" />
      <MetricRow label="ANTI-FLICKER" value="30s hold / 8pt force" />
      <MetricRow label="DEBOUNCE" value="3s state / immediate connect" />
      <MetricRow label="RISK DEBOUNCE" value="3s signal / 15s periodic" />
      <MetricRow label="INTERVAL" value="~12s (timer-driven)" />
      <MetricRow label="GPS SOURCE" value="gpsUIState (throttled 1Hz)" />
      <MetricRow label="SIGNALS" value="3 (Elevation, Connectivity, Speed)" />
      <MetricRow label="RISK INPUTS" value="6 (Vehicle, Health, Resources, Route, Remote, Conn)" />
      <MetricRow label="CACHE AWARE" value="Yes (Phase 3C)" color="#2196F3" />
      <MetricRow label="FRESHNESS AWARE" value="Yes (Phase 3D)" color="#4CAF50" />
      <MetricRow label="RISK SCORING" value="Yes (Phase 4C)" color="#9C88FF" />
      <MetricRow label="ENV. RISK" value="Active (Phase 4C)" color="#9C88FF" />
      <MetricRow label="OP. CONN. STATE" value="5-state model (Phase 4C)" color="#9C88FF" />
      <MetricRow label="PERSISTENCE" value="Session restore + grace window" />
      <MetricRow label="SEGMENT CACHE" value="Memoized (route-keyed)" />
      <MetricRow
        label="REMOTENESS STATUS"
        value={remotenessStore.isRunning() ? 'ACTIVE' : 'IDLE'}
        color={remotenessStore.isRunning() ? '#4CAF50' : TACTICAL.textMuted}
      />
      <MetricRow
        label="RISK ENGINE STATUS"
        value={riskState?.running ? 'ACTIVE' : riskState?.initialized ? 'IDLE' : 'NOT INIT'}
        color={riskState?.running ? '#4CAF50' : riskState?.initialized ? '#FFB300' : TACTICAL.textMuted}
      />
      {riskState?.evaluation_count > 0 && (
        <MetricRow
          label="RISK EVALUATIONS"
          value={`${riskState.evaluation_count}`}
          color={TACTICAL.textMuted}
        />
      )}

    </View>
  );
}


















// ═══════════════════════════════════════════════════════════
// ACTIVE MODE WIDGET B — EXPEDITION CHANNEL (Phase 6)
//
// Team connectivity and recent expedition activity.
// Solo fallback when no team members detected.
// Tap opens Team / Channel screen (placeholder).
// Active mode only — never shown in planning mode.
// ═══════════════════════════════════════════════════════════

function ExpeditionChannelWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const trip = data.activeTrip;
  const teamSize = trip?.team_size ?? 1;
  const isSolo = teamSize <= 1;

  // Simulated last update time (based on sync status)
  const syncOnline = data.syncStatus === 'synced';
  const lastUpdateStr = syncOnline ? '< 1m ago' : 'No connection';

  // Simulated recent activity (based on expedition events if available)
  const recentActivity = isSolo
    ? 'Solo Expedition'
    : `${teamSize} members connected`;

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>TEAM</Text>
          <Text style={s.compactValue}>{isSolo ? '1' : `${teamSize}`}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>STATUS</Text>
          <Text style={[s.compactValue, { fontSize: 9, color: syncOnline ? '#4CAF50' : TACTICAL.textMuted }]}>
            {syncOnline ? 'LIVE' : 'OFF'}
          </Text>
        </View>
      </View>
    );
  }

  if (isSolo) {
    return (
      <View style={chanS.body}>
        <View style={chanS.soloRow}>
          <View style={chanS.soloDot} />
          <Text style={chanS.soloLabel}>Solo Expedition</Text>
        </View>
        <Text style={chanS.soloSub}>No live team members.</Text>
      </View>
    );
  }

  return (
    <View style={chanS.body}>
      <MetricRow
        label="TEAM"
        value={`${teamSize} Connected`}
        color="#4CAF50"
      />
      <MetricRow
        label="LAST UPDATE"
        value={lastUpdateStr}
        color={syncOnline ? TACTICAL.text : TACTICAL.textMuted}
      />
      <View style={chanS.activityRow}>
        <View style={[chanS.activityDot, { backgroundColor: syncOnline ? '#4CAF50' : TACTICAL.textMuted }]} />
        <Text style={chanS.activityText} numberOfLines={1}>{recentActivity}</Text>
      </View>
    </View>
  );
}

function ExpeditionChannelDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const teamSize = trip?.team_size ?? 1;
  const isSolo = teamSize <= 1;
  const syncOnline = data.syncStatus === 'synced';

  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>EXPEDITION CHANNEL</Text>
      <MetricRow label="MODE" value={isSolo ? 'SOLO' : 'TEAM'} />
      <MetricRow label="TEAM SIZE" value={`${teamSize}`} />
      <MetricRow label="CONNECTION" value={syncOnline ? 'ONLINE' : 'OFFLINE'} color={syncOnline ? '#4CAF50' : TACTICAL.textMuted} />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>CHANNEL INFO</Text>
      <MetricRow label="PROTOCOL" value="ECS Dispatch" />
      <MetricRow label="ENCRYPTION" value="AES-256" />
      {!isSolo && (
        <>
          <View style={s.detailDivider} />
          <Text style={s.detailSection}>TEAM MEMBERS</Text>
          <Text style={s.noData}>Team roster available in Dispatch tab</Text>
        </>
      )}
    </View>
  );
}


// ── Custom Widget Renderer ─────────────────────────────


function CustomWidgetDetail({ widgetId, data }: { widgetId: string; data: WidgetData }) {
  const widgetDef = customWidgetStore.getById(widgetId);
  if (!widgetDef) return <Text style={s.noData}>Widget not found</Text>;
  const resolvedFields = widgetDef.dataFields.map(fieldKey => {
    const fieldDef = AVAILABLE_DATA_FIELDS.find(f => f.field === fieldKey);
    const resolved = customWidgetStore.resolveFieldValue(fieldKey, {
      activeTrip: data.activeTrip, loadItems: data.loadItems, waypoints: data.waypoints,
    });
    return { fieldKey, fieldDef, resolved };
  });
  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>CUSTOM WIDGET DATA</Text>
      {resolvedFields.map(({ fieldKey, fieldDef, resolved }) => {
        const label = fieldDef?.label?.toUpperCase() || fieldKey.toUpperCase();
        const displayVal = resolved.value != null ? String(resolved.value) : '--';
        const unit = fieldDef?.unit ? ` ${fieldDef.unit}` : '';
        let color: string | undefined;
        if (widgetDef.thresholds.enabled && fieldKey === widgetDef.thresholds.targetField) {
          color = customWidgetStore.evaluateThreshold(resolved.raw, widgetDef.thresholds);
        }
        return <MetricRow key={fieldKey} label={label} value={`${displayVal}${unit}`} color={color} />;
      })}
      {widgetDef.thresholds.enabled && (
        <>
          <View style={s.detailDivider} />
          <Text style={s.detailSection}>THRESHOLD RULES</Text>
          <MetricRow label="TARGET" value={widgetDef.thresholds.targetField} />
          <MetricRow label="GREEN" value={`>= ${widgetDef.thresholds.greenAbove}`} color="#4CAF50" />
          <MetricRow label="AMBER" value={`>= ${widgetDef.thresholds.amberAbove}`} color="#C48A2C" />
          <MetricRow label="RED" value={`< ${widgetDef.thresholds.amberAbove}`} color="#C0392B" />
        </>
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// ECOFLOW POWER WIDGET — Live EcoFlow Telemetry
//
// Uses useEcoFlowLive hook for real-time battery SOC, solar
// input, and output watts from the user's EcoFlow device.
// Displays a mini SOC bar, device name, and LIVE/STANDBY badge.
// Tapping navigates to /power (handled in dashboard.tsx).
// ═══════════════════════════════════════════════════════════
function EcoFlowPowerWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const eco = useEcoFlowLive();

  const isLive = eco.status === 'live';
  const isDegraded = eco.status === 'degraded';
  const isConnecting = eco.status === 'offline' && !eco.error && !eco.lastUpdatedAt;
  const battPct = eco.batteryPct ?? 0;
  const solarW = eco.solarWatts ?? 0;
  const outputW = eco.outputWatts ?? 0;
  const devName = eco.deviceName || 'EcoFlow';

  // Battery color coding
  const battColor = battPct >= 60 ? '#4CAF50' : battPct >= 25 ? '#FFB300' : '#EF5350';

  // Status badge
  const statusLabel = isLive ? 'LIVE' : isDegraded ? 'DEGRADED' : isConnecting ? 'CONNECTING' : eco.status === 'standby' ? 'STANDBY' : eco.status === 'offline' ? 'OFFLINE' : 'STANDBY';
  const statusColor = isLive ? '#4CAF50' : isDegraded ? '#FF9500' : isConnecting ? '#FFB300' : eco.status === 'offline' ? '#EF5350' : TACTICAL.textMuted;

  const showData = isLive || isDegraded;

  // ── Compact mode ──
  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>SOC</Text>
          <Text style={[s.compactValue, { color: showData ? battColor : TACTICAL.textMuted }]}>
            {showData ? `${battPct}%` : '\u2014'}
          </Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>SOLAR</Text>
          <Text style={[s.compactValue, { color: showData && solarW > 0 ? '#FFB300' : TACTICAL.textMuted }]}>
            {showData ? `${solarW}W` : '\u2014'}
          </Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>OUTPUT</Text>
          <Text style={[s.compactValue, { color: showData && outputW > 0 ? TACTICAL.amber : TACTICAL.textMuted }]}>
            {showData ? `${outputW}W` : '\u2014'}
          </Text>
        </View>
      </View>
    );
  }

  // ── Standby / Offline / Connecting states ──
  if (!showData) {
    return (
      <View style={ecoS.body}>
        {/* Status badge */}
        <View style={[s.statusBadge, { backgroundColor: `${statusColor}15` }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {isConnecting ? (
          <EmptyStateMicrocopy primary="Connecting\u2026" />
        ) : eco.status === 'standby' ? (
          <EmptyStateMicrocopy primary="Not configured" secondary="Tap to set up" />
        ) : (
          <EmptyStateMicrocopy primary="Connection lost" secondary="Tap to retry" />
        )}
      </View>
    );
  }

  // ── Live / Degraded state: full widget ──
  return (
    <View style={ecoS.body}>
      {/* Status + device name row */}
      <View style={ecoS.headerRow}>
        <View style={[ecoS.liveDot, { backgroundColor: statusColor }]} />
        <Text style={[ecoS.liveLabel, { color: statusColor }]}>{statusLabel}</Text>
        <Text style={ecoS.deviceName} numberOfLines={1}>{devName}</Text>
      </View>

      {/* Mini SOC bar */}
      <View style={ecoS.socBarOuter}>
        <View style={[ecoS.socBarFill, { width: `${Math.min(100, Math.max(0, battPct))}%`, backgroundColor: battColor }]} />
      </View>

      {/* Telemetry metrics */}
      <MetricRow label="BATTERY" value={`${battPct}%`} color={battColor} />
      <MetricRow label="SOLAR IN" value={solarW > 0 ? `${solarW} W` : '\u2014'} color={solarW > 0 ? '#FFB300' : TACTICAL.textMuted} />
      <MetricRow label="OUTPUT" value={outputW > 0 ? `${outputW} W` : '\u2014'} color={outputW > 0 ? TACTICAL.amber : TACTICAL.textMuted} />

      {/* Degraded note */}
      {isDegraded && (
        <View style={[s.alertBadge, { backgroundColor: 'rgba(255,152,0,0.08)' }]}>
          <Ionicons name="warning-outline" size={10} color="#FF9500" />
          <Text style={[s.alertText, { color: '#FF9500' }]}>CACHED DATA</Text>
        </View>
      )}
    </View>
  );
}


// ── EcoFlow Power Widget Styles ──
const ecoS = StyleSheet.create({
  body: {
    gap: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1.5,
  },
  deviceName: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    flex: 1,
    textAlign: 'right',
    letterSpacing: 0.5,
  },
  socBarOuter: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 4,
  },
  socBarFill: {
    height: '100%',
    borderRadius: 2,
  },
});

// ═══════════════════════════════════════════════════════════
// ECOFLOW POWER DETAIL — Expanded View for WidgetDetailModal
//
// Full telemetry breakdown: battery SOC with large progress bar,
// solar input, output load, input charging watts, device serial,
// last poll timestamp, connection status, and a Refresh button.
// ═══════════════════════════════════════════════════════════
function EcoFlowPowerDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const eco = useEcoFlowLive();

  const isLive = eco.status === 'live';
  const isDegraded = eco.status === 'degraded';
  const isConnecting = eco.status === 'offline' && !eco.error && !eco.lastUpdatedAt;
  const showData = isLive || isDegraded;
  const battPct = eco.batteryPct ?? 0;
  const solarW = eco.solarWatts ?? 0;
  const outputW = eco.outputWatts ?? 0;
  const inputW = eco.inputWatts ?? 0;
  const devName = eco.deviceName || 'EcoFlow Device';
  const serialNo = eco.selectedDeviceId || '\u2014';

  // Battery color
  const battColor = battPct >= 60 ? '#4CAF50' : battPct >= 25 ? '#FFB300' : '#EF5350';

  // Connection status (V1.1 status machine)
  const statusLabel = isLive ? 'LIVE' : isDegraded ? 'DEGRADED' : isConnecting ? 'CONNECTING' : eco.status === 'standby' ? 'STANDBY' : eco.status === 'offline' ? 'OFFLINE' : 'STANDBY';
  const statusColor = isLive ? '#4CAF50' : isDegraded ? '#FF9500' : isConnecting ? '#FFB300' : eco.status === 'offline' ? '#EF5350' : TACTICAL.textMuted;

  // Last poll timestamp (V1.1: lastUpdatedAt replaces lastPollAt)
  const lastPollStr = eco.lastUpdatedAt
    ? new Date(eco.lastUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '\u2014';
  const lastPollDateStr = eco.lastUpdatedAt
    ? new Date(eco.lastUpdatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : '';

  // Net power (input - output)
  const netW = inputW - outputW;
  const netColor = netW > 0 ? '#4CAF50' : netW < 0 ? '#EF5350' : TACTICAL.textMuted;
  const netLabel = netW > 0 ? `+${netW} W` : netW < 0 ? `${netW} W` : '0 W';

  // Refresh / Reconnect state
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    if (eco.status === 'offline') {
      eco.reconnect();
    } else {
      eco.refresh();
    }
    setTimeout(() => setRefreshing(false), 2000);
  }, [eco.refresh, eco.reconnect, eco.status]);

  // ── Not connected states ──
  if (!showData && !isConnecting) {
    return (
      <View style={s.detailContainer}>
        <Text style={s.detailSection}>CONNECTION STATUS</Text>
        <View style={[s.statusBadge, { backgroundColor: `${statusColor}15` }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        {eco.updatedAgoText && (
          <MetricRow label="LAST UPDATE" value={eco.updatedAgoText} color={TACTICAL.textMuted} />
        )}
        {eco.error && (
          <MetricRow label="ERROR" value={eco.error} color="#EF5350" />
        )}
        {eco.isBackoff && (
          <MetricRow label="BACKOFF" value="Rate limited \u2014 60s interval" color="#FF9500" />
        )}
        <MetricRow label="DEVICE" value={devName} />
        <MetricRow label="SERIAL" value={serialNo} />

        <View style={s.detailDivider} />
        <TouchableOpacity
          style={ecoDetailS.refreshBtn}
          onPress={handleRefresh}
          activeOpacity={0.7}
        >
          <Ionicons name={eco.status === 'offline' ? 'refresh-outline' : 'refresh-outline'} size={14} color={TACTICAL.amber} />
          <Text style={ecoDetailS.refreshBtnText}>
            {refreshing ? 'RECONNECTING\u2026' : eco.status === 'offline' ? 'RECONNECT' : 'REFRESH'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={s.detailContainer}>
      {/* ═══ CONNECTION STATUS ═══ */}
      <Text style={s.detailSection}>CONNECTION STATUS</Text>
      <View style={ecoDetailS.statusRow}>
        <View style={[s.statusBadge, { backgroundColor: `${statusColor}15`, marginBottom: 0 }]}>
          <View style={[s.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[s.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>
        <Text style={ecoDetailS.versionText}>v{eco.version}</Text>
      </View>
      {/* V1.1: "Updated Xs ago" */}
      {eco.updatedAgoText && (
        <MetricRow label="UPDATED" value={eco.updatedAgoText} color={isDegraded ? '#FF9500' : TACTICAL.textMuted} />
      )}
      {/* V1.1: Degraded warning */}
      {isDegraded && (
        <View style={[s.alertBadge, { backgroundColor: 'rgba(255,152,0,0.08)' }]}>
          <Ionicons name="warning-outline" size={10} color="#FF9500" />
          <Text style={[s.alertText, { color: '#FF9500' }]}>CONNECTION UNSTABLE \u2014 CACHED DATA</Text>
        </View>
      )}
      {eco.isBackoff && (
        <MetricRow label="BACKOFF" value="Rate limited \u2014 60s interval" color="#FF9500" />
      )}
      <MetricRow label="DEVICE" value={devName} />
      <MetricRow label="SERIAL / ID" value={serialNo} />

      {/* ═══ BATTERY SOC ═══ */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>BATTERY STATE OF CHARGE</Text>

      {/* Large SOC display */}
      <View style={ecoDetailS.socHeader}>
        <Text style={[ecoDetailS.socBigValue, { color: battColor }]}>{showData ? battPct : '\u2014'}</Text>
        <Text style={[ecoDetailS.socBigUnit, { color: battColor }]}>%</Text>
      </View>

      {/* Large progress bar */}
      <View style={ecoDetailS.socBarOuter}>
        <View style={[ecoDetailS.socBarFill, {
          width: `${Math.min(100, Math.max(0, showData ? battPct : 0))}%`,
          backgroundColor: battColor,
        }]} />
        {/* Threshold markers */}
        <View style={[ecoDetailS.socMarker, { left: '25%' }]} />
        <View style={[ecoDetailS.socMarker, { left: '60%' }]} />
      </View>
      <View style={ecoDetailS.socLabels}>
        <Text style={[ecoDetailS.socLabelText, { color: '#EF5350' }]}>LOW</Text>
        <Text style={[ecoDetailS.socLabelText, { color: '#FFB300' }]}>MID</Text>
        <Text style={[ecoDetailS.socLabelText, { color: '#4CAF50' }]}>GOOD</Text>
      </View>

      {/* ═══ POWER FLOW ═══ */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>POWER FLOW</Text>

      {/* Solar Input */}
      <View style={ecoDetailS.powerRow}>
        <View style={ecoDetailS.powerIconWrap}>
          <Ionicons name="sunny-outline" size={14} color="#FFB300" />
        </View>
        <View style={ecoDetailS.powerInfo}>
          <Text style={ecoDetailS.powerLabel}>SOLAR INPUT</Text>
          <View style={ecoDetailS.powerBarOuter}>
            <View style={[ecoDetailS.powerBarFill, {
              width: `${Math.min(100, solarW > 0 ? Math.max(5, (solarW / Math.max(solarW, 400)) * 100) : 0)}%`,
              backgroundColor: '#FFB300',
            }]} />
          </View>
        </View>
        <Text style={[ecoDetailS.powerValue, { color: solarW > 0 ? '#FFB300' : TACTICAL.textMuted }]}>
          {showData ? `${solarW} W` : '\u2014'}
        </Text>
      </View>

      {/* AC/DC Input (Charging) */}
      <View style={ecoDetailS.powerRow}>
        <View style={ecoDetailS.powerIconWrap}>
          <Ionicons name="flash-outline" size={14} color="#4FC3F7" />
        </View>
        <View style={ecoDetailS.powerInfo}>
          <Text style={ecoDetailS.powerLabel}>INPUT CHARGING</Text>
          <View style={ecoDetailS.powerBarOuter}>
            <View style={[ecoDetailS.powerBarFill, {
              width: `${Math.min(100, inputW > 0 ? Math.max(5, (inputW / Math.max(inputW, 500)) * 100) : 0)}%`,
              backgroundColor: '#4FC3F7',
            }]} />
          </View>
        </View>
        <Text style={[ecoDetailS.powerValue, { color: inputW > 0 ? '#4FC3F7' : TACTICAL.textMuted }]}>
          {showData ? `${inputW} W` : '\u2014'}
        </Text>
      </View>

      {/* Output Load */}
      <View style={ecoDetailS.powerRow}>
        <View style={ecoDetailS.powerIconWrap}>
          <Ionicons name="power-outline" size={14} color={TACTICAL.amber} />
        </View>
        <View style={ecoDetailS.powerInfo}>
          <Text style={ecoDetailS.powerLabel}>OUTPUT LOAD</Text>
          <View style={ecoDetailS.powerBarOuter}>
            <View style={[ecoDetailS.powerBarFill, {
              width: `${Math.min(100, outputW > 0 ? Math.max(5, (outputW / Math.max(outputW, 500)) * 100) : 0)}%`,
              backgroundColor: TACTICAL.amber,
            }]} />
          </View>
        </View>
        <Text style={[ecoDetailS.powerValue, { color: outputW > 0 ? TACTICAL.amber : TACTICAL.textMuted }]}>
          {showData ? `${outputW} W` : '\u2014'}
        </Text>
      </View>

      {/* Net Power */}
      <View style={ecoDetailS.netRow}>
        <Text style={ecoDetailS.netLabel}>NET POWER</Text>
        <Text style={[ecoDetailS.netValue, { color: netColor }]}>{showData ? netLabel : '\u2014'}</Text>
      </View>

      {/* ═══ SOLAR INPUT HISTORY ═══ */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>SOLAR INPUT TREND</Text>
      <View style={ecoDetailS.historyNote}>
        <Ionicons name="time-outline" size={10} color={TACTICAL.textMuted} />
        <Text style={ecoDetailS.historyNoteText}>
          Polling every 12s — current reading: {showData ? `${solarW} W` : 'N/A'}
        </Text>
      </View>
      {/* Mini bar visualization of current solar vs capacity */}
      {showData && (
        <View style={ecoDetailS.miniChart}>
          {[0.3, 0.5, 0.7, 0.85, 1.0, 0.9, 0.75, 0.6].map((factor, i) => {
            const simW = Math.round(solarW * factor * (0.8 + Math.random() * 0.4));
            const barH = Math.max(4, (simW / Math.max(solarW || 1, 100)) * 40);
            return (
              <View key={i} style={ecoDetailS.miniChartBarWrap}>
                <View style={[ecoDetailS.miniChartBar, {
                  height: barH,
                  backgroundColor: i === 7 ? '#FFB300' : 'rgba(255,179,0,0.35)',
                }]} />
                <Text style={ecoDetailS.miniChartLabel}>{i === 7 ? 'NOW' : ''}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ═══ TELEMETRY METADATA ═══ */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>TELEMETRY</Text>
      <MetricRow label="LAST POLL" value={lastPollStr} />
      {lastPollDateStr ? <MetricRow label="DATE" value={lastPollDateStr} /> : null}
      <MetricRow label="POLL INTERVAL" value={eco.isBackoff ? '60s (backoff)' : '12s'} />
      <MetricRow label="POLL COUNT" value={`${eco.version}`} />
      <MetricRow label="STATUS" value={statusLabel} color={statusColor} />

      {/* ═══ REFRESH BUTTON ═══ */}
      <View style={s.detailDivider} />
      <TouchableOpacity
        style={[ecoDetailS.refreshBtn, refreshing && ecoDetailS.refreshBtnActive]}
        onPress={handleRefresh}
        activeOpacity={0.7}
        disabled={refreshing}
      >
        <Ionicons
          name={refreshing ? 'sync-outline' : 'refresh-outline'}
          size={14}
          color={refreshing ? '#4CAF50' : TACTICAL.amber}
        />
        <Text style={[ecoDetailS.refreshBtnText, refreshing && { color: '#4CAF50' }]}>
          {refreshing ? 'REFRESHING\u2026' : 'REFRESH TELEMETRY'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}


// ── EcoFlow Power Detail Styles ──
const ecoDetailS = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  versionText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    fontFamily: 'Courier',
  },

  // ── Large SOC display ──
  socHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 8,
    marginTop: 4,
  },
  socBigValue: {
    fontSize: 48,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  socBigUnit: {
    fontSize: 18,
    fontWeight: '800',
    marginLeft: 2,
    marginBottom: 6,
  },

  // ── Large SOC bar ──
  socBarOuter: {
    height: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  socBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  socMarker: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  socLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 3,
    paddingHorizontal: 4,
  },
  socLabelText: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // ── Power flow rows ──
  powerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  powerIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerInfo: {
    flex: 1,
    gap: 3,
  },
  powerLabel: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  powerBarOuter: {
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  powerBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  powerValue: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'Courier',
    minWidth: 52,
    textAlign: 'right',
  },

  // ── Net power row ──
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  netLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  netValue: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Courier',
  },

  // ── Solar history ──
  historyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 8,
  },
  historyNoteText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },
  miniChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 48,
    paddingHorizontal: 4,
    gap: 4,
  },
  miniChartBarWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  miniChartBar: {
    width: '80%',
    borderRadius: 2,
    minHeight: 4,
  },
  miniChartLabel: {
    fontSize: 6,
    fontWeight: '700',
    color: '#FFB300',
    marginTop: 2,
    letterSpacing: 0.5,
  },

  // ── Refresh button ──
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '08',
  },
  refreshBtnActive: {
    borderColor: '#4CAF5030',
    backgroundColor: '#4CAF5008',
  },
  refreshBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
});


// ═══════════════════════════════════════════════════════════
// HIGHWAY WIDGETS — Mode-specific awareness instruments
//
// These widgets render on the Highway dashboard tab.
// They use ECS.highwayBlue as their accent color to
// reinforce the Highway mode color cue system.
//
// Default Highway Widgets:
//   1) Forward Weather   — route weather forecast
//   2) Daylight Remaining — sunset / civil twilight
//   3) Cell Coverage     — signal strength forecast
//
// Library Highway Widgets:
//   4) Wind Monitor      — wind speed & direction
//   5) Elevation Profile — grade & altitude
//   6) Road Hazards      — hazard alerts
//   7) Power Monitor     — vehicle electrical
//   8) Sun Glare Forecast — glare risk
// ═══════════════════════════════════════════════════════════

const HWY_ACCENT = ECS.highwayBlue;       // #5B8DEF
const HWY_ACCENT_SOFT = ECS.highwayBlueSoft; // rgba(91,141,239,0.15)

// ── Helper: Approximate sunset hour (UTC) for a given day-of-year & latitude ──
function approxSunsetHour(lat: number, dayOfYear: number): number {
  // Simple sinusoidal model — good enough for a dashboard widget
  const declination = 23.45 * Math.sin(((360 / 365) * (dayOfYear - 81)) * (Math.PI / 180));
  const latRad = lat * (Math.PI / 180);
  const declRad = declination * (Math.PI / 180);
  const cosHA = -Math.tan(latRad) * Math.tan(declRad);
  const clampedCos = Math.max(-1, Math.min(1, cosHA));
  const hourAngle = Math.acos(clampedCos) * (180 / Math.PI);
  const sunsetUTC = 12 + hourAngle / 15; // hours after midnight UTC
  return sunsetUTC;
}

function getDayOfYear(): number {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = now.getTime() - start.getTime();
  return Math.floor(diff / 86400000);
}

// ── Highway MetricRow with blue accent ──
function HwyMetricRow({ label, value, color, muted }: { label: string; value: string; color?: string; muted?: boolean }) {
  return (
    <View style={hwyS.metricRow}>
      <Text style={hwyS.metricLabel}>{label}</Text>
      <Text style={[hwyS.metricValue, color ? { color } : null, muted ? { color: TACTICAL.textMuted } : null]}>{value}</Text>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// HIGHWAY WIDGET 1 — FORWARD WEATHER
// ═══════════════════════════════════════════════════════════
function HwyForwardWeatherWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // Placeholder forecast data (simulated from device time)
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour > 20;
  const tempF = isNight ? 58 : (68 + Math.round(Math.sin(hour / 4) * 12));
  const conditions = isNight ? 'Clear' : hour < 12 ? 'Partly Cloudy' : 'Fair';
  const windMph = 8 + Math.round(Math.sin(hour / 3) * 6);
  const stormDistMi = hour > 14 && hour < 20 ? 45 : null;

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>TEMP</Text>
          <Text style={[s.compactValue, { color: HWY_ACCENT }]}>{tempF}°F</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>WIND</Text>
          <Text style={s.compactValue}>{windMph} mph</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>SKY</Text>
          <Text style={[s.compactValue, { fontSize: 9 }]}>{isNight ? 'CLR' : 'FAIR'}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={hwyS.body}>
      {/* Status badge */}
      <View style={[hwyS.statusBadge]}>
        <Ionicons name="cloud-outline" size={10} color={HWY_ACCENT} />
        <Text style={[hwyS.statusText, { color: HWY_ACCENT }]}>{conditions.toUpperCase()}</Text>
      </View>

      <HwyMetricRow label="TEMPERATURE" value={`${tempF}°F`} color={tempF > 95 ? '#EF5350' : tempF < 32 ? '#4FC3F7' : HWY_ACCENT} />
      <HwyMetricRow label="WIND" value={`${windMph} mph`} color={windMph > 25 ? '#EF5350' : windMph > 15 ? '#FFB74D' : undefined} />
      {stormDistMi != null ? (
        <HwyMetricRow label="STORM AHEAD" value={`${stormDistMi} mi`} color="#FFB74D" />
      ) : (
        <HwyMetricRow label="STORM RISK" value="LOW" color="#4CAF50" />
      )}
    </View>
  );
}

function HwyForwardWeatherDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const hour = new Date().getHours();
  const isNight = hour < 6 || hour > 20;
  const tempF = isNight ? 58 : (68 + Math.round(Math.sin(hour / 4) * 12));
  const windMph = 8 + Math.round(Math.sin(hour / 3) * 6);
  const humidity = 35 + Math.round(Math.sin(hour / 5) * 20);
  const visibility = isNight ? 8 : 10;
  const dewPoint = tempF - 15 - Math.round(Math.random() * 5);

  return (
    <View style={s.detailContainer}>
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>FORWARD WEATHER</Text>
      <HwyMetricRow label="TEMPERATURE" value={`${tempF}°F`} />
      <HwyMetricRow label="FEELS LIKE" value={`${tempF - 2}°F`} />
      <HwyMetricRow label="DEW POINT" value={`${dewPoint}°F`} />
      <HwyMetricRow label="HUMIDITY" value={`${humidity}%`} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>WIND</Text>
      <HwyMetricRow label="SPEED" value={`${windMph} mph`} />
      <HwyMetricRow label="GUSTS" value={`${windMph + 8} mph`} />
      <HwyMetricRow label="DIRECTION" value="SW" />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>VISIBILITY</Text>
      <HwyMetricRow label="RANGE" value={`${visibility} mi`} />
      <HwyMetricRow label="CONDITIONS" value={isNight ? 'CLEAR' : 'GOOD'} color="#4CAF50" />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>DATA SOURCE</Text>
      <HwyMetricRow label="SOURCE" value="DEVICE ESTIMATE" muted />
      <HwyMetricRow label="ACCURACY" value="PLACEHOLDER" muted />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// HIGHWAY WIDGET 2 — DAYLIGHT REMAINING
// ═══════════════════════════════════════════════════════════
function HwyDaylightRemainingWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // Use GPS latitude if available, otherwise default to ~37°N (US mid-latitude)
  const lat = options?.gpsLatitude ?? 37.0;
  const now = new Date();
  const dayOfYear = getDayOfYear();
  const tzOffsetHrs = -now.getTimezoneOffset() / 60;

  // Approximate sunset in local time
  const sunsetUTC = approxSunsetHour(lat, dayOfYear);
  const sunsetLocal = sunsetUTC + tzOffsetHrs;
  const sunsetHr = Math.floor(sunsetLocal);
  const sunsetMin = Math.round((sunsetLocal - sunsetHr) * 60);
  const sunsetStr = `${((sunsetHr - 1) % 12) + 1}:${sunsetMin.toString().padStart(2, '0')} PM`;

  // Civil twilight is ~30 min after sunset
  const twilightLocal = sunsetLocal + 0.5;
  const twilightHr = Math.floor(twilightLocal);
  const twilightMin = Math.round((twilightLocal - twilightHr) * 60);
  const twilightStr = `${((twilightHr - 1) % 12) + 1}:${twilightMin.toString().padStart(2, '0')} PM`;

  // Hours remaining
  const currentDecimalHr = now.getHours() + now.getMinutes() / 60;
  const hoursRemaining = Math.max(0, sunsetLocal - currentDecimalHr);
  const isAfterSunset = hoursRemaining <= 0;

  const remainingColor = isAfterSunset ? '#EF5350' : hoursRemaining < 1 ? '#FFB74D' : hoursRemaining < 2 ? HWY_ACCENT : '#4CAF50';

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>DAYLIGHT</Text>
          <Text style={[s.compactValue, { color: remainingColor }]}>
            {isAfterSunset ? 'DARK' : `${hoursRemaining.toFixed(1)}h`}
          </Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>SUNSET</Text>
          <Text style={[s.compactValue, { fontSize: 9 }]}>{sunsetStr}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={hwyS.body}>
      {/* Status badge */}
      <View style={hwyS.statusBadge}>
        <Ionicons name={isAfterSunset ? 'moon-outline' : 'sunny-outline'} size={10} color={remainingColor} />
        <Text style={[hwyS.statusText, { color: remainingColor }]}>
          {isAfterSunset ? 'AFTER SUNSET' : hoursRemaining < 1 ? 'LOW LIGHT' : 'DAYLIGHT'}
        </Text>
      </View>

      <HwyMetricRow
        label="REMAINING"
        value={isAfterSunset ? 'After sunset' : `${hoursRemaining.toFixed(1)} hrs`}
        color={remainingColor}
      />
      <HwyMetricRow label="SUNSET" value={sunsetStr} />
      <HwyMetricRow label="CIVIL TWILIGHT" value={twilightStr} muted />
    </View>
  );
}

function HwyDaylightRemainingDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const lat = options?.gpsLatitude ?? 37.0;
  const lon = options?.gpsLongitude ?? -122.0;
  const now = new Date();
  const dayOfYear = getDayOfYear();
  const tzOffsetHrs = -now.getTimezoneOffset() / 60;
  const sunsetUTC = approxSunsetHour(lat, dayOfYear);
  const sunsetLocal = sunsetUTC + tzOffsetHrs;
  const sunriseLocal = sunsetLocal - (2 * (sunsetLocal - 12)); // symmetric around noon
  const currentDecimalHr = now.getHours() + now.getMinutes() / 60;
  const hoursRemaining = Math.max(0, sunsetLocal - currentDecimalHr);
  const totalDaylight = sunsetLocal - sunriseLocal;

  const formatHr = (h: number) => {
    const hr = Math.floor(h);
    const min = Math.round((h - hr) * 60);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const hr12 = ((hr - 1) % 12) + 1;
    return `${hr12}:${min.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <View style={s.detailContainer}>
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>DAYLIGHT ANALYSIS</Text>
      <HwyMetricRow label="REMAINING" value={hoursRemaining > 0 ? `${hoursRemaining.toFixed(1)} hrs` : 'After sunset'} color={hoursRemaining > 0 ? HWY_ACCENT : '#EF5350'} />
      <HwyMetricRow label="TOTAL DAYLIGHT" value={`${totalDaylight.toFixed(1)} hrs`} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>SOLAR EVENTS</Text>
      <HwyMetricRow label="SUNRISE" value={formatHr(sunriseLocal)} />
      <HwyMetricRow label="SOLAR NOON" value={formatHr(12 + (sunsetLocal - 12 - (sunsetLocal - sunriseLocal) / 2))} />
      <HwyMetricRow label="SUNSET" value={formatHr(sunsetLocal)} />
      <HwyMetricRow label="CIVIL TWILIGHT" value={formatHr(sunsetLocal + 0.5)} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>LOCATION</Text>
      <HwyMetricRow label="LATITUDE" value={`${lat.toFixed(2)}°`} />
      <HwyMetricRow label="LONGITUDE" value={`${lon.toFixed(2)}°`} />
      <HwyMetricRow label="DAY OF YEAR" value={`${dayOfYear}`} />
      <HwyMetricRow label="TZ OFFSET" value={`UTC${tzOffsetHrs >= 0 ? '+' : ''}${tzOffsetHrs}`} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>MODEL</Text>
      <HwyMetricRow label="METHOD" value="Sinusoidal approx" muted />
      <HwyMetricRow label="ACCURACY" value="\u00B110 min" muted />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// HIGHWAY WIDGET 3 — CELL COVERAGE
// ═══════════════════════════════════════════════════════════
function HwyCellCoverageWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // Placeholder signal data
  const syncOnline = data.syncStatus === 'synced';
  const signalBars = syncOnline ? 3 : 0;
  const carrier = syncOnline ? 'T-Mobile' : 'No Service';
  const deadZoneMi = syncOnline ? 12 : 0;
  const signalType = syncOnline ? 'LTE' : '\u2014';

  const signalColor = signalBars >= 3 ? '#4CAF50' : signalBars >= 2 ? '#FFB74D' : signalBars >= 1 ? '#EF5350' : TACTICAL.textMuted;

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>SIGNAL</Text>
          <Text style={[s.compactValue, { color: signalColor }]}>
            {syncOnline ? `${signalBars}/5` : 'NONE'}
          </Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>TYPE</Text>
          <Text style={[s.compactValue, { fontSize: 9 }]}>{signalType}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={hwyS.body}>
      {/* Signal bars visualization */}
      <View style={hwyS.signalRow}>
        {[1, 2, 3, 4, 5].map(i => (
          <View
            key={i}
            style={[
              hwyS.signalBar,
              { height: 4 + i * 3 },
              i <= signalBars ? { backgroundColor: signalColor } : { backgroundColor: 'rgba(255,255,255,0.08)' },
            ]}
          />
        ))}
        <Text style={[hwyS.signalLabel, { color: signalColor }]}>
          {syncOnline ? signalType : 'NO SIGNAL'}
        </Text>
      </View>

      <HwyMetricRow label="CARRIER" value={carrier} color={syncOnline ? undefined : '#EF5350'} />
      <HwyMetricRow label="STRENGTH" value={syncOnline ? `${signalBars}/5 bars` : 'No service'} color={signalColor} />
      {syncOnline && deadZoneMi > 0 && (
        <HwyMetricRow label="NEXT DEAD ZONE" value={`~${deadZoneMi} mi`} muted />
      )}
    </View>
  );
}

function HwyCellCoverageDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const syncOnline = data.syncStatus === 'synced';
  const signalBars = syncOnline ? 3 : 0;

  return (
    <View style={s.detailContainer}>
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>CELL COVERAGE</Text>
      <HwyMetricRow label="STATUS" value={syncOnline ? 'CONNECTED' : 'NO SERVICE'} color={syncOnline ? '#4CAF50' : '#EF5350'} />
      <HwyMetricRow label="SIGNAL" value={`${signalBars}/5 bars`} />
      <HwyMetricRow label="CARRIER" value={syncOnline ? 'T-Mobile' : '\u2014'} />
      <HwyMetricRow label="TYPE" value={syncOnline ? 'LTE' : '\u2014'} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>COVERAGE FORECAST</Text>
      <HwyMetricRow label="NEXT DEAD ZONE" value={syncOnline ? '~12 mi' : 'N/A'} />
      <HwyMetricRow label="DEAD ZONE LENGTH" value={syncOnline ? '~3 mi' : 'N/A'} />
      <HwyMetricRow label="COVERAGE AHEAD" value={syncOnline ? 'GOOD' : 'UNKNOWN'} color={syncOnline ? '#4CAF50' : TACTICAL.textMuted} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>DATA SOURCE</Text>
      <HwyMetricRow label="SOURCE" value="DEVICE STATUS" muted />
      <HwyMetricRow label="FORECAST" value="PLACEHOLDER" muted />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// HIGHWAY WIDGET 4 — WIND MONITOR
// ═══════════════════════════════════════════════════════════
function HwyWindMonitorWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const hour = new Date().getHours();
  const windMph = 6 + Math.round(Math.sin(hour / 3) * 8);
  const gustMph = windMph + 5 + Math.round(Math.random() * 5);
  const direction = 'SW';
  const windColor = windMph > 30 ? '#EF5350' : windMph > 20 ? '#FFB74D' : HWY_ACCENT;

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>WIND</Text>
          <Text style={[s.compactValue, { color: windColor }]}>{windMph}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>GUST</Text>
          <Text style={s.compactValue}>{gustMph}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>DIR</Text>
          <Text style={[s.compactValue, { fontSize: 10 }]}>{direction}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={hwyS.body}>
      <View style={hwyS.statusBadge}>
        <Ionicons name="flag-outline" size={10} color={windColor} />
        <Text style={[hwyS.statusText, { color: windColor }]}>
          {windMph > 30 ? 'HIGH WIND' : windMph > 20 ? 'MODERATE' : 'CALM'}
        </Text>
      </View>
      <HwyMetricRow label="SPEED" value={`${windMph} mph`} color={windColor} />
      <HwyMetricRow label="GUSTS" value={`${gustMph} mph`} color={gustMph > 30 ? '#EF5350' : undefined} />
      <HwyMetricRow label="DIRECTION" value={direction} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// HIGHWAY WIDGET 5 — ELEVATION PROFILE
// ═══════════════════════════════════════════════════════════
function HwyElevationProfileWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const altFt = options?.gpsAltitudeFt ?? 2450;
  const grade = 3.2; // placeholder grade %
  const gainFt = 820; // placeholder cumulative gain

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>ELEV</Text>
          <Text style={[s.compactValue, { color: HWY_ACCENT }]}>{Math.round(altFt)}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>GRADE</Text>
          <Text style={s.compactValue}>{grade}%</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>GAIN</Text>
          <Text style={s.compactValue}>{gainFt}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={hwyS.body}>
      <View style={hwyS.statusBadge}>
        <Ionicons name="trending-up-outline" size={10} color={HWY_ACCENT} />
        <Text style={[hwyS.statusText, { color: HWY_ACCENT }]}>CLIMBING</Text>
      </View>
      <HwyMetricRow label="ALTITUDE" value={`${Math.round(altFt)} ft`} color={HWY_ACCENT} />
      <HwyMetricRow label="GRADE" value={`${grade}%`} color={grade > 6 ? '#FFB74D' : undefined} />
      <HwyMetricRow label="TOTAL GAIN" value={`${gainFt} ft`} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// HIGHWAY WIDGET 6 — ROAD HAZARDS
// ═══════════════════════════════════════════════════════════
function HwyRoadHazardsWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const hazardCount = 0; // placeholder — no active hazards
  const nextHazardMi = null;
  const statusColor = hazardCount > 0 ? '#FFB74D' : '#4CAF50';

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>HAZARDS</Text>
          <Text style={[s.compactValue, { color: statusColor }]}>{hazardCount}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>STATUS</Text>
          <Text style={[s.compactValue, { fontSize: 9, color: statusColor }]}>CLEAR</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={hwyS.body}>
      <View style={hwyS.statusBadge}>
        <Ionicons name="shield-checkmark-outline" size={10} color={statusColor} />
        <Text style={[hwyS.statusText, { color: statusColor }]}>
          {hazardCount > 0 ? `${hazardCount} ALERT${hazardCount > 1 ? 'S' : ''}` : 'ALL CLEAR'}
        </Text>
      </View>
      <HwyMetricRow label="ACTIVE HAZARDS" value={`${hazardCount}`} color={statusColor} />
      <HwyMetricRow label="CONSTRUCTION" value="None reported" muted />
      <HwyMetricRow label="CLOSURES" value="None" muted />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// HIGHWAY WIDGET 7 — POWER MONITOR
// ═══════════════════════════════════════════════════════════
function HwyPowerMonitorWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const batteryV = 12.6; // placeholder
  const alternatorV = 14.2;
  const auxStatus = 'OK';
  const battColor = batteryV >= 12.4 ? '#4CAF50' : batteryV >= 12.0 ? '#FFB74D' : '#EF5350';

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>BATT</Text>
          <Text style={[s.compactValue, { color: battColor }]}>{batteryV}V</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>ALT</Text>
          <Text style={s.compactValue}>{alternatorV}V</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>AUX</Text>
          <Text style={[s.compactValue, { fontSize: 9, color: '#4CAF50' }]}>{auxStatus}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={hwyS.body}>
      <View style={hwyS.statusBadge}>
        <Ionicons name="flash-outline" size={10} color={battColor} />
        <Text style={[hwyS.statusText, { color: battColor }]}>NOMINAL</Text>
      </View>
      <HwyMetricRow label="BATTERY" value={`${batteryV} V`} color={battColor} />
      <HwyMetricRow label="ALTERNATOR" value={`${alternatorV} V`} color={alternatorV >= 13.5 ? '#4CAF50' : '#FFB74D'} />
      <HwyMetricRow label="AUX SYSTEMS" value={auxStatus} color="#4CAF50" />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// HIGHWAY WIDGET 8 — SUN GLARE FORECAST
// ═══════════════════════════════════════════════════════════
function HwySunGlareWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const hour = new Date().getHours();

  // Glare risk is highest near sunrise/sunset
  const isGlareRisk = (hour >= 6 && hour <= 9) || (hour >= 16 && hour <= 19);
  const glareLevel = isGlareRisk ? 'MODERATE' : hour >= 10 && hour <= 15 ? 'LOW' : 'NONE';
  const glareColor = glareLevel === 'MODERATE' ? '#FFB74D' : glareLevel === 'LOW' ? '#4CAF50' : TACTICAL.textMuted;
  const visorAdvisory = isGlareRisk ? 'Visor recommended' : 'No action needed';

  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>GLARE</Text>
          <Text style={[s.compactValue, { fontSize: 9, color: glareColor }]}>{glareLevel}</Text>
        </View>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>RISK</Text>
          <Text style={[s.compactValue, { fontSize: 9, color: glareColor }]}>
            {isGlareRisk ? 'YES' : 'NO'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={hwyS.body}>
      <View style={hwyS.statusBadge}>
        <Ionicons name="sunny-outline" size={10} color={glareColor} />
        <Text style={[hwyS.statusText, { color: glareColor }]}>{glareLevel} GLARE</Text>
      </View>
      <HwyMetricRow label="RISK LEVEL" value={glareLevel} color={glareColor} />
      <HwyMetricRow label="ADVISORY" value={visorAdvisory} muted={!isGlareRisk} />
      <HwyMetricRow label="SUN POSITION" value={hour < 12 ? 'EAST' : 'WEST'} />
    </View>
  );
}

// ── Highway Widget Styles ──
const hwyS = StyleSheet.create({
  body: {
    gap: 2,
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: HWY_ACCENT_SOFT,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    color: HWY_ACCENT,
  },
  signalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    marginBottom: 6,
    paddingVertical: 2,
  },
  signalBar: {
    width: 6,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  signalLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: 6,
    marginBottom: 1,
  },
});


// ── Renderer Map ───────────────────────────────────────

export function renderWidgetContent(
  type: string,
  data: WidgetData,
  options?: WidgetRenderOptions,
): React.ReactNode {
  if (isCustomWidget(type)) return <CustomWidgetContent widgetId={type} data={data} />;
  if (!isRegistered(type) && !isCustomWidget(type)) {
    return <Text style={s.noData}>Unregistered widget: {type}</Text>;
  }
  switch (type) {
    case 'vehicle-systems': return <VehicleSystemsWidget data={data} options={options} />;
    case 'stability-index': return <StabilityIndexWidget data={data} options={options} />;
    case 'attitude-monitor': return <AttitudeMonitorWidget data={data} options={options} />;
    case 'mission-sustainment': return <MissionSustainmentWidget data={data} options={options} />;
    case 'operational-readiness': return <OperationalReadinessWidget data={data} options={options} />;
    case 'status-overview': return <StatusOverview data={data} />;
    case 'route-progress': return <RouteProgress data={data} />;
    case 'loadout-readiness': return <LoadoutReadiness data={data} />;
    case 'water-projection': return <WaterProjection data={data} />;
    case 'fuel-range': return <FuelRange data={data} />;
    case 'vehicle-health': return <VehicleHealth data={data} />;
    case 'emergency-controls': return <EmergencyControls data={data} />;
    case 'power-systems': return <PowerSystems data={data} options={options} />;
    case 'sustainability': return <SustainabilityWidget data={data} options={options} />;
    case 'progress': return <ProgressWidget data={data} options={options} />;
    case 'remoteness': return <RemotenessWidget data={data} options={options} />;
    case 'vehicle-twin': return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="car-sport-outline" size={22} color={TACTICAL.gold} /><Text style={{ color: TACTICAL.gold, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginTop: 6 }}>VEHICLE TWIN</Text><Text style={{ color: '#8A8A7A', fontSize: 8, marginTop: 2 }}>Tap to open</Text></View>;
    case 'ecoflow-power': return <EcoFlowPowerWidget data={data} options={options} />;
    case 'ecs-power': return options?.compact ? <PowerSystemCompact /> : <PowerSystemCard />;
    case 'vehicle-telemetry': return options?.compact ? <VehicleTelemetryCompact /> : <VehicleTelemetryCard />;
    case 'terrain-risk': return options?.compact ? <TerrainRiskCompact /> : <TerrainRiskCard />;
    case 'expedition-risk': return options?.compact ? <ExpeditionRiskCompact /> : <ExpeditionRiskCard />;
    case 'resource-forecast': return options?.compact ? <ResourceForecastCompact /> : <ResourceForecastCard />;
    case 'trip-recorder': return options?.compact ? <TripRecorderCompact /> : <TripRecorderCard />;





    // ── Highway Widgets ──
    case 'hwy-forward-weather': return <HwyForwardWeatherWidget data={data} options={options} />;
    case 'hwy-daylight-remaining': return <HwyDaylightRemainingWidget data={data} options={options} />;
    case 'hwy-cell-coverage': return <HwyCellCoverageWidget data={data} options={options} />;
    case 'hwy-wind-monitor': return <HwyWindMonitorWidget data={data} options={options} />;
    case 'hwy-elevation-profile': return <HwyElevationProfileWidget data={data} options={options} />;
    case 'hwy-road-hazards': return <HwyRoadHazardsWidget data={data} options={options} />;
    case 'hwy-power-monitor': return <HwyPowerMonitorWidget data={data} options={options} />;
    case 'hwy-sun-glare': return <HwySunGlareWidget data={data} options={options} />;

    case 'expedition-channel': return <ExpeditionChannelWidget data={data} options={options} />;
    default: {
      // ═══ PHASE 7: Standardized Telemetry Placeholder System ═══
      // Replaces broken/empty/confusing fallback with clean ECS placeholder.
      // Uses TelemetryPlaceholder component for consistent empty states.
      console.warn(`[WidgetRenderers] Phase 7 fallback for "${type}"`);
      const rStatus = resolveWidgetStatus(type as string);
      if (rStatus === 'awaiting_data') {
        return (
          <TelemetryPlaceholder
            state="awaiting_connection"
            compact={options?.compact}
          />
        );
      }
      if (rStatus === 'unavailable') {
        return (
          <TelemetryPlaceholder
            state="unavailable"
            compact={options?.compact}
          />
        );
      }
      return (
        <TelemetryPlaceholder
          state="error"
          compact={options?.compact}
          primaryMessage="Widget temporarily unavailable"
          secondaryMessage={null}
        />
      );
    }
  }
}

// ── Detail Renderers (expanded view for modal) ─────────

// ── Detail Renderers (expanded view for modal) ─────────
export function renderWidgetDetail(
  type: string,
  data: WidgetData,
  options?: WidgetRenderOptions,
): React.ReactNode {
  if (isCustomWidget(type)) return <CustomWidgetDetail widgetId={type} data={data} />;
  switch (type) {
    case 'status-overview': return <StatusOverviewDetail data={data} />;
    case 'fuel-range': return <FuelRangeDetail data={data} />;
    case 'water-projection': return <WaterProjectionDetail data={data} />;
    case 'emergency-controls': return <EmergencyControlsDetail data={data} />;
    case 'vehicle-systems': return <VehicleSystemsDetail data={data} options={options} />;
    case 'stability-index': return <StabilityIndexDetail data={data} options={options} />;
    case 'attitude-monitor': return <AttitudeMonitorDetail data={data} options={options} />;
    case 'mission-sustainment': return <MissionSustainmentDetail data={data} options={options} />;
    case 'operational-readiness': return <OperationalReadinessDetail data={data} options={options} />;
    case 'sustainability': return <SustainabilityDetail data={data} />;
    case 'progress': return <ProgressDetail data={data} />;
    case 'remoteness': return <RemotenessIndexDetailView />;

    case 'expedition-channel': return <ExpeditionChannelDetail data={data} options={options} />;
    case 'ecoflow-power': return <EcoFlowPowerDetail data={data} options={options} />;
    case 'resource-forecast': return <ResourceForecastDetailView />;
    case 'expedition-risk': return <ExpeditionRiskDetailView />;
    case 'trip-recorder': return <TripRecorderDetailView />;






    // ── Highway Widget Details ──
    case 'hwy-forward-weather': return <HwyForwardWeatherDetail data={data} options={options} />;
    case 'hwy-daylight-remaining': return <HwyDaylightRemainingDetail data={data} options={options} />;
    case 'hwy-cell-coverage': return <HwyCellCoverageDetail data={data} options={options} />;
    // Library highway widgets fall through to card view for detail
    case 'hwy-wind-monitor':
    case 'hwy-elevation-profile':
    case 'hwy-road-hazards':
    case 'hwy-power-monitor':
    case 'hwy-sun-glare':
      return renderWidgetContent(type, data, options);

    default: return renderWidgetContent(type, data, options);


  }
}


// ═══════════════════════════════════════════════════════════
// PROGRESS DETAIL (expanded view for modal)
//
// Phase 4.1: Route breakdown using routeStore + waypointProgressStore.
// Shows waypoint list with reached/current/upcoming status,
// total distance, remaining distance, ETA, and progress index.
// ═══════════════════════════════════════════════════════════
function ProgressDetail({ data }: { data: WidgetData }) {
  const activeRoute = routeStore.getActive();

  if (!activeRoute) {
    return (
      <View style={s.detailContainer}>
        <Text style={s.detailSection}>ROUTE PROGRESS</Text>
        <Text style={s.noData}>No active route selected</Text>
        <Text style={[s.noData, { marginTop: 8 }]}>
          Import a GPX/KML route or create waypoints in Navigate to enable progress tracking.
        </Text>
      </View>
    );
  }

  const routeId = activeRoute.id;
  const totalMi = activeRoute.total_distance_miles;
  const routeWaypoints = activeRoute.waypoints;
  const wpCount = routeWaypoints.length;
  const currentIdx = waypointProgressStore.getIndex(routeId);
  const reachedWps = waypointProgressStore.getReachedWaypoints(routeId);
  const isComplete = waypointProgressStore.isRouteComplete(routeId, wpCount);
  const safeIdx = wpCount > 0 ? Math.min(currentIdx, wpCount - 1) : 0;

  // Calculate total waypoint-to-waypoint distance
  let wpTotalDist = 0;
  for (let i = 0; i < wpCount - 1; i++) {
    wpTotalDist += haversineMi(
      routeWaypoints[i].lat, routeWaypoints[i].lon,
      routeWaypoints[i + 1].lat, routeWaypoints[i + 1].lon,
    );
  }

  // Covered distance (sum of segments up to current index)
  let coveredDist = 0;
  for (let i = 0; i < safeIdx && i < wpCount - 1; i++) {
    coveredDist += haversineMi(
      routeWaypoints[i].lat, routeWaypoints[i].lon,
      routeWaypoints[i + 1].lat, routeWaypoints[i + 1].lon,
    );
  }

  const pct = totalMi > 0 ? Math.min(100, Math.round((coveredDist / totalMi) * 100)) : 0;

  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>ROUTE OVERVIEW</Text>
      <MetricRow label="ROUTE" value={activeRoute.name || 'Unnamed Route'} />
      <MetricRow label="TOTAL DISTANCE" value={totalMi > 0 ? `${totalMi.toFixed(1)} mi` : '\u2014'} />
      <MetricRow label="WP DISTANCE" value={wpTotalDist > 0 ? `${wpTotalDist.toFixed(1)} mi` : '\u2014'} />
      <MetricRow label="WAYPOINTS" value={`${wpCount}`} />
      <MetricRow label="FORMAT" value={activeRoute.source_format.toUpperCase()} />

      <View style={s.detailDivider} />
      <Text style={s.detailSection}>PROGRESS</Text>
      <MetricRow
        label="CURRENT TARGET"
        value={wpCount > 0 ? (routeWaypoints[safeIdx]?.name || `WP ${safeIdx + 1}`) : '\u2014'}
      />
      <MetricRow label="INDEX" value={wpCount > 0 ? `${safeIdx + 1} of ${wpCount}` : '\u2014'} />
      <MetricRow label="REACHED" value={`${reachedWps.length} / ${wpCount}`} />
      <MetricRow
        label="COVERED"
        value={coveredDist > 0 ? `${coveredDist.toFixed(1)} mi` : '0 mi'}
      />
      {totalMi > 0 && (
        <MetricRow
          label="COMPLETION"
          value={`${pct}%`}
          color={isComplete ? '#4CAF50' : pct >= 50 ? TACTICAL.amber : TACTICAL.text}
        />
      )}

      {/* Waypoint list (max 10 shown) */}
      {wpCount > 0 && (
        <>
          <View style={s.detailDivider} />
          <Text style={s.detailSection}>WAYPOINTS</Text>
          {routeWaypoints.slice(0, 10).map((wp, i) => {
            const isReached = reachedWps.includes(i);
            const isCurrent = i === safeIdx && !isComplete;
            const wpName = wp.name || `WP ${i + 1}`;
            const statusLabel = isReached ? 'REACHED' : isCurrent ? 'NEXT' : '';
            const color = isReached ? '#4CAF50' : isCurrent ? TACTICAL.amber : TACTICAL.textMuted;
            return (
              <MetricRow
                key={i}
                label={`${i + 1}. ${wpName}`}
                value={statusLabel}
                color={color}
              />
            );
          })}
          {wpCount > 10 && (
            <Text style={[s.noData, { marginTop: 4 }]}>
              +{wpCount - 10} more waypoints
            </Text>
          )}
        </>
      )}

      <View style={s.detailDivider} />
      <Text style={s.detailSection}>SETTINGS</Text>
      <MetricRow label="ARRIVAL RADIUS" value={`${ARRIVAL_THRESHOLD_MI} mi (${Math.round(ARRIVAL_THRESHOLD_MI * 5280)} ft)`} />
      <MetricRow label="DEFAULT SPEED" value={`${DEFAULT_AVG_MPH} mph`} />
    </View>
  );
}







function StatusOverviewDetail({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  if (!trip) return <Text style={s.noData}>No active trip</Text>;
  const days = trip.start_date && trip.end_date
    ? Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000)
    : null;
  const items = data.loadItems.filter(i => !i.deleted_at);
  const packed = items.filter(i => i.packed);
  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>MISSION PARAMETERS</Text>
      <MetricRow label="DURATION" value={days ? `${days} days` : '--'} />
      <MetricRow label="TERRAIN" value={trip.terrain_type || '--'} />
      <MetricRow label="SEASON" value={trip.season || '--'} />
      <MetricRow label="TEAM SIZE" value={`${trip.team_size}`} />
      <MetricRow label="VEHICLE" value={trip.primary_vehicle || '--'} />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>READINESS</Text>
      <MetricRow label="ITEMS PACKED" value={`${packed.length}/${items.length}`} />
      <MetricRow label="WAYPOINTS" value={`${data.waypoints.length}`} />
      <MetricRow label="SYNC STATUS" value={data.syncStatus.toUpperCase()} />
    </View>
  );
}

function FuelRangeDetail({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  if (!trip) return <Text style={s.noData}>No trip data</Text>;
  const fuelGal = trip.capac_fuel_gal;
  const mpg = trip.capac_mpg;
  const milesPerDay = trip.avg_miles_per_day;
  const dailyFuel = mpg && milesPerDay ? milesPerDay / mpg : null;
  const fuelDays = fuelGal && dailyFuel ? fuelGal / dailyFuel : null;
  const rangeMiles = fuelGal && mpg ? fuelGal * mpg : null;
  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>FUEL ANALYSIS</Text>
      <MetricRow label="TANK CAPACITY" value={fuelGal ? `${fuelGal} gal` : '--'} />
      <MetricRow label="FUEL ECONOMY" value={mpg ? `${mpg} mpg` : '--'} />
      <MetricRow label="DAILY DISTANCE" value={milesPerDay ? `${milesPerDay} mi/day` : '--'} />
      <MetricRow label="DAILY CONSUMPTION" value={dailyFuel ? `${dailyFuel.toFixed(2)} gal/day` : '--'} />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>PROJECTIONS</Text>
      <MetricRow label="RANGE" value={rangeMiles ? `${rangeMiles.toFixed(0)} miles` : '--'} />
      <MetricRow label="ENDURANCE" value={fuelDays ? `${fuelDays.toFixed(1)} days` : '--'} />
    </View>
  );
}

function WaterProjectionDetail({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  if (!trip) return <Text style={s.noData}>No trip data</Text>;
  const waterGal = trip.capac_water_gal;
  const usePerPerson = trip.water_use_per_person_day || 1;
  const usePerDay = usePerPerson * trip.team_size;
  const waterDays = waterGal && usePerDay > 0 ? waterGal / usePerDay : null;
  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>WATER ANALYSIS</Text>
      <MetricRow label="CAPACITY" value={waterGal ? `${waterGal} gal` : '--'} />
      <MetricRow label="PER PERSON/DAY" value={`${usePerPerson} gal`} />
      <MetricRow label="TEAM SIZE" value={`${trip.team_size}`} />
      <MetricRow label="TOTAL DAILY USE" value={`${usePerDay.toFixed(1)} gal`} />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>PROJECTIONS</Text>
      <MetricRow label="DAYS SUPPLY" value={waterDays ? `${waterDays.toFixed(1)} days` : '--'} />
    </View>
  );
}

function EmergencyControlsDetail({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>EMERGENCY INFORMATION</Text>
      <MetricRow label="CONTACT" value={trip?.emergency_contact || 'Not configured'} />
      <MetricRow label="TEAM SIZE" value={trip ? `${trip.team_size}` : '--'} />
      <MetricRow label="COMMS" value={data.syncStatus === 'synced' ? 'ONLINE' : 'LIMITED'} />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>PROTOCOLS</Text>
      <MetricRow label="VEHICLE" value={trip?.primary_vehicle || '--'} />
      <MetricRow label="TERRAIN" value={trip?.terrain_type || '--'} />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// VEHICLE WEIGHT DETAIL (Phase 4 — Single Source of Truth)
//
// Full weight breakdown with header, sections, edge-case messages.
// Opened by tapping Vehicle Systems widget.
// Uses computeFullBuildWeightBreakdown() for ALL weight values.
// ═══════════════════════════════════════════════════════════

// Display-only density constants (not used for calculation — that's in weightEngine)
const DISPLAY_FUEL_DENSITY: Record<string, number> = { diesel: 7.1, gas: 6.0 };
const DISPLAY_WATER_DENSITY = 8.34;

function VehicleSystemsDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const advanced = options?.advancedMode;

  // ── Single source of truth: centralized breakdown ──
  const itemsWt = getTotalWeightLbs(data.loadItems);
  const bw: BuildWeightBreakdown = computeFullBuildWeightBreakdown(undefined, {
    items_weight_lb: itemsWt,
  });

  // ── Destructure all values from the centralized breakdown ──
  const {
    base_weight_lb, gvwr_lb, hardware_additions_lb,
    fuel_percent_current, fuel_gal_current, fuel_weight_lb,
    fuel_tank_capacity_gal, fuel_type, has_fuel_tank_capacity,
    water_gal_current, water_weight_lb, consumables_weight_lb,
    items_weight_lb, build_weight_lb, payload_margin_lb,
    has_specs, status_tag, status_color, margin_color,
  } = bw;

  // ── Items edge-case detection (needs raw item list) ──
  const activeItems = data.loadItems.filter(i => !i.deleted_at);
  const zeroWeightItems = hasZeroWeightItems(data.loadItems);

  // Display-only density for fuel type label
  const fuelDensity = DISPLAY_FUEL_DENSITY[fuel_type] ?? 7.1;

  return (
    <View style={s.detailContainer}>
      {/* ═══ HEADER ═══ */}
      <Text style={s.detailSection}>WEIGHT SUMMARY</Text>
      <View style={detailS.headerCard}>
        <View style={detailS.headerRow}>
          <View style={detailS.headerCell}>
            <Text style={detailS.headerLabel}>BUILD WEIGHT</Text>
            <Text style={[detailS.headerValue, { color: TACTICAL.amber }]}>
              {build_weight_lb > 0 ? `${Math.round(build_weight_lb).toLocaleString()}` : '\u2014'}
            </Text>
            <Text style={detailS.headerUnit}>lb</Text>
          </View>
          <View style={detailS.headerDivider} />
          <View style={detailS.headerCell}>
            <Text style={detailS.headerLabel}>GVWR</Text>
            <Text style={detailS.headerValue}>
              {gvwr_lb > 0 ? `${gvwr_lb.toLocaleString()}` : '\u2014'}
            </Text>
            <Text style={detailS.headerUnit}>lb</Text>
          </View>
          <View style={detailS.headerDivider} />
          <View style={detailS.headerCell}>
            <Text style={detailS.headerLabel}>PAYLOAD MARGIN</Text>
            <Text style={[detailS.headerValue, { color: margin_color }]}>
              {has_specs ? `${Math.round(payload_margin_lb).toLocaleString()}` : '\u2014'}
            </Text>
            <Text style={detailS.headerUnit}>lb</Text>
          </View>
        </View>

        {/* Progress bar */}
        {has_specs && (
          <View style={{ marginTop: 8 }}>
            <View style={s.progressOuter}>
              <View style={[s.progressInner, {
                width: `${Math.min(100, Math.max(0, (build_weight_lb / gvwr_lb) * 100))}%`,
                backgroundColor: margin_color,
              }]} />
            </View>
          </View>
        )}

        {/* Status tag */}
        {status_tag && (
          <View style={[s.vsStatusTag, { backgroundColor: `${status_color}15`, marginTop: 6 }]}>
            <View style={[s.statusDot, { backgroundColor: status_color }]} />
            <Text style={[s.vsStatusTagText, { color: status_color }]}>{status_tag}</Text>
          </View>
        )}
      </View>

      {/* ═══ 1) VEHICLE BASE ═══ */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>1. VEHICLE BASE</Text>
      <MetricRow
        label="BASE WEIGHT"
        value={base_weight_lb > 0 ? `${base_weight_lb.toLocaleString()} lb` : '\u2014'}
      />
      {hardware_additions_lb > 0 && (
        <MetricRow
          label="HARDWARE ADDITIONS"
          value={`+${hardware_additions_lb.toLocaleString()} lb`}
          color={TACTICAL.textMuted}
        />
      )}

      {/* ═══ 2) ITEMS ═══ */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>2. ITEMS</Text>
      <MetricRow
        label="ITEMS TOTAL"
        value={items_weight_lb > 0 ? `${Math.round(items_weight_lb).toLocaleString()} lb` : '0 lb'}
      />
      <Text style={detailS.subNote}>
        Based on item weights {'\u00D7'} quantity ({activeItems.length} item{activeItems.length !== 1 ? 's' : ''})
      </Text>
      {/* Edge case: some items have 0 weight */}
      {zeroWeightItems && activeItems.length > 0 && (
        <View style={detailS.edgeCaseRow}>
          <Ionicons name="information-circle-outline" size={12} color="#FFB74D" />
          <Text style={detailS.edgeCaseText}>
            Some items have 0 lb — update item weights for accuracy
          </Text>
        </View>
      )}

      {/* ═══ 3) CONSUMABLES ═══ */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>3. CONSUMABLES</Text>

      {/* Fuel */}
      <View style={detailS.consumableRow}>
        <View style={detailS.consumableLeft}>
          <Text style={detailS.consumableLabel}>FUEL</Text>
          <Text style={detailS.consumableDetail}>
            {fuel_percent_current}%
            {has_fuel_tank_capacity ? ` (${fuel_gal_current.toFixed(1)} gal)` : ''}
          </Text>
        </View>
        <Text style={[detailS.consumableWeight, { color: fuel_weight_lb > 0 ? TACTICAL.text : TACTICAL.textMuted }]}>
          {fuel_weight_lb > 0 ? `${Math.round(fuel_weight_lb).toLocaleString()} lb` : '\u2014'}
        </Text>
      </View>
      {has_fuel_tank_capacity && (
        <Text style={detailS.densityNote}>
          {fuel_type} @ {fuelDensity} lb/gal
        </Text>
      )}
      {/* Edge case: tank capacity missing */}
      {!has_fuel_tank_capacity && (
        <View style={detailS.edgeCaseRow}>
          <Ionicons name="information-circle-outline" size={12} color="#FFB74D" />
          <Text style={detailS.edgeCaseText}>
            Tank capacity not set — fuel weight excluded
          </Text>
        </View>
      )}

      {/* Water */}
      <View style={[detailS.consumableRow, { marginTop: 6 }]}>
        <View style={detailS.consumableLeft}>
          <Text style={detailS.consumableLabel}>WATER</Text>
          <Text style={detailS.consumableDetail}>
            {water_gal_current > 0 ? `${water_gal_current.toFixed(1)} gal` : '0 gal'}
          </Text>
        </View>
        <Text style={[detailS.consumableWeight, { color: water_weight_lb > 0 ? TACTICAL.text : TACTICAL.textMuted }]}>
          {water_weight_lb > 0 ? `${Math.round(water_weight_lb).toLocaleString()} lb` : '0 lb'}
        </Text>
      </View>
      {water_gal_current > 0 && (
        <Text style={detailS.densityNote}>
          water @ {DISPLAY_WATER_DENSITY} lb/gal
        </Text>
      )}

      {/* Consumables total */}
      <View style={detailS.consumableTotalRow}>
        <Text style={detailS.consumableTotalLabel}>CONSUMABLES TOTAL</Text>
        <Text style={[detailS.consumableTotalValue, { color: consumables_weight_lb > 0 ? '#4FC3F7' : TACTICAL.textMuted }]}>
          {consumables_weight_lb > 0 ? `${Math.round(consumables_weight_lb).toLocaleString()} lb` : '0 lb'}
        </Text>
      </View>

      {/* ═══ 4) TOTAL ═══ */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>4. TOTAL</Text>
      <View style={detailS.totalCard}>
        <View style={detailS.totalRow}>
          <Text style={detailS.totalLabel}>Base Weight</Text>
          <Text style={detailS.totalValue}>{base_weight_lb > 0 ? `${base_weight_lb.toLocaleString()}` : '0'}</Text>
        </View>
        {hardware_additions_lb > 0 && (
          <View style={detailS.totalRow}>
            <Text style={detailS.totalLabel}>+ Hardware</Text>
            <Text style={detailS.totalValue}>{hardware_additions_lb.toLocaleString()}</Text>
          </View>
        )}
        <View style={detailS.totalRow}>
          <Text style={detailS.totalLabel}>+ Items</Text>
          <Text style={detailS.totalValue}>{Math.round(items_weight_lb).toLocaleString()}</Text>
        </View>
        <View style={detailS.totalRow}>
          <Text style={detailS.totalLabel}>+ Consumables</Text>
          <Text style={detailS.totalValue}>{Math.round(consumables_weight_lb).toLocaleString()}</Text>
        </View>
        <View style={detailS.totalDivider} />
        <View style={detailS.totalRow}>
          <Text style={[detailS.totalLabel, { color: TACTICAL.amber, fontWeight: '900' }]}>BUILD WEIGHT</Text>
          <Text style={[detailS.totalValue, { color: TACTICAL.amber, fontWeight: '900', fontSize: 14 }]}>
            {build_weight_lb > 0 ? `${Math.round(build_weight_lb).toLocaleString()} lb` : '\u2014'}
          </Text>
        </View>
      </View>

      {/* ═══ ADVANCED MODE: Axle splits (future) ═══ */}
      {advanced && (
        <>
          <View style={s.detailDivider} />
          <View style={s.advRow}>
            <Text style={s.advLabel}>CG MODEL</Text>
            <Text style={s.advValue}>ACTIVE</Text>
          </View>
        </>
      )}
    </View>
  );
}





function StabilityIndexDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const rollDeg = options?.rollDeg ?? 0;
  const pitchDeg = options?.pitchDeg ?? 0;
  const advanced = options?.advancedMode;
  const absRoll = Math.abs(rollDeg);
  const safeRollThreshold = advanced ? 32 : 35;
  const stabilityMargin = Math.max(0, Math.min(100, ((safeRollThreshold - absRoll) / safeRollThreshold) * 100));
  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>STABILITY ANALYSIS</Text>
      <MetricRow label="CURRENT ROLL" value={`${rollDeg.toFixed(1)}\u00B0`} />
      <MetricRow label="CURRENT PITCH" value={`${pitchDeg.toFixed(1)}\u00B0`} />
      <MetricRow label={advanced ? 'DYNAMIC SAFE ROLL' : 'SAFE ROLL LIMIT'} value={`${safeRollThreshold}\u00B0`} />
      <MetricRow label="STABILITY MARGIN" value={`${stabilityMargin.toFixed(0)}%`} />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>THRESHOLDS</Text>
      <MetricRow label="ROLL WARNING" value={`${(safeRollThreshold * 0.85).toFixed(0)}\u00B0`} color="#E67E22" />
      <MetricRow label="ROLL CRITICAL" value={`${(safeRollThreshold * 0.95).toFixed(0)}\u00B0`} color={TACTICAL.danger} />
      <MetricRow label="PITCH WARNING" value={advanced ? '18\u00B0' : '20\u00B0'} color="#E67E22" />
      <MetricRow label="PITCH CRITICAL" value={advanced ? '28\u00B0' : '30\u00B0'} color={TACTICAL.danger} />
      {advanced && (
        <>
          <View style={s.detailDivider} />
          <Text style={s.detailSection}>ADVANCED MODEL</Text>
          <MetricRow label="CG MODEL" value="ACTIVE" color="#9C88FF" />
          <MetricRow label="DYNAMIC THRESHOLD" value="ENABLED" color="#9C88FF" />
        </>
      )}
    </View>
  );
}

function AttitudeMonitorDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const rollDeg = options?.rollDeg ?? 0;
  const pitchDeg = options?.pitchDeg ?? 0;
  const sensorStatus = options?.sensorStatus || 'OFFLINE';
  const advanced = options?.advancedMode;
  const tilt = Math.sqrt(rollDeg * rollDeg + pitchDeg * pitchDeg);
  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>ATTITUDE DATA</Text>
      <MetricRow label="ROLL" value={`${rollDeg.toFixed(2)}\u00B0`} />
      <MetricRow label="PITCH" value={`${pitchDeg.toFixed(2)}\u00B0`} />
      <MetricRow label="TOTAL TILT" value={`${tilt.toFixed(2)}\u00B0`} />
      <MetricRow label="SENSOR" value={sensorStatus} />
      <MetricRow label="MOUNT" value="VERTICAL CRADLE" />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>SENSOR INFO</Text>
      <MetricRow label="UPDATE RATE" value="60 Hz" />
      <MetricRow label="FILTER" value="LP(0.12) + RA(4) + LP(0.35)" />
      <MetricRow label="DEAD ZONE" value="0.2°" />
      <MetricRow label="MOTION" value="200–350ms bezier" />
      <MetricRow label="PITCH MODE" value="translateY (V8)" />
      <MetricRow label="HORIZON" value="dual-axis (V10)" />



      <MetricRow label="CALIBRATION" value={sensorStatus === 'CALIBRATED' ? 'APPLIED' : 'DEFAULT'} />

      {advanced && (
        <>
          <View style={s.detailDivider} />
          <Text style={s.detailSection}>DYNAMIC THRESHOLDS</Text>
          <MetricRow label="ROLL WARN" value="22\u00B0" color="#E67E22" />
          <MetricRow label="ROLL DANGER" value="32\u00B0" color={TACTICAL.danger} />
          <MetricRow label="PITCH WARN" value="18\u00B0" color="#E67E22" />
          <MetricRow label="PITCH DANGER" value="28\u00B0" color={TACTICAL.danger} />
        </>
      )}
    </View>
  );
}

function MissionSustainmentDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  if (!trip) return <Text style={s.noData}>No active expedition</Text>;
  const waterGal = trip.capac_water_gal;
  const usePerDay = (trip.water_use_per_person_day || 1) * trip.team_size;
  const waterDays = waterGal && usePerDay > 0 ? waterGal / usePerDay : null;
  const fuelGal = trip.capac_fuel_gal;
  const mpg = trip.capac_mpg;
  const milesPerDay = trip.avg_miles_per_day;
  const dailyFuel = mpg && milesPerDay ? milesPerDay / mpg : null;
  const fuelDays = fuelGal && dailyFuel ? fuelGal / dailyFuel : null;
  const batteryWh = trip.battery_usable_wh;
  const solarW = trip.solar_watts;
  const sunHrs = trip.sun_hours_per_day;
  const eff = trip.solar_efficiency || 0.8;
  const solarDaily = solarW && sunHrs ? solarW * sunHrs * eff : null;
  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>RESOURCE BURN RATES</Text>
      <MetricRow label="WATER DAILY" value={`${usePerDay.toFixed(1)} gal/day`} />
      <MetricRow label="FUEL DAILY" value={dailyFuel ? `${dailyFuel.toFixed(2)} gal/day` : '\u2014'} />
      <MetricRow label="SOLAR RETURN" value={solarDaily ? `${solarDaily.toFixed(0)} Wh/day` : '\u2014'} />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>ENDURANCE PROJECTIONS</Text>
      <MetricRow label="WATER ENDURANCE" value={waterDays ? `${waterDays.toFixed(1)} days` : '\u2014'} />
      <MetricRow label="FUEL ENDURANCE" value={fuelDays ? `${fuelDays.toFixed(1)} days` : '\u2014'} />
      <MetricRow label="BATTERY CAPACITY" value={batteryWh ? `${batteryWh} Wh` : '\u2014'} />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>RESUPPLY</Text>
      <MetricRow label="NEXT WATER" value="Not configured" color={TACTICAL.textMuted} />
      <MetricRow label="NEXT FUEL" value="Not configured" color={TACTICAL.textMuted} />
    </View>
  );
}

function OperationalReadinessDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  if (!trip) return <Text style={s.noData}>No active expedition</Text>;
  const items = data.loadItems.filter(i => !i.deleted_at);
  const mode = trip.active_mode || 'Trip';
  const active = items.filter(i => i.mode === mode || i.mode === 'Both');
  const packed = active.filter(i => i.packed);
  const gearPct = active.length > 0 ? Math.round((packed.length / active.length) * 100) : 0;
  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>GEAR READINESS</Text>
      <MetricRow label="PACKED" value={`${packed.length}/${active.length}`} />
      <MetricRow label="READINESS" value={`${gearPct}%`} color={gearPct >= 80 ? '#4CAF50' : gearPct >= 50 ? TACTICAL.amber : TACTICAL.danger} />
      <MetricRow label="MODE" value={mode.toUpperCase()} />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>MISSION PARAMETERS</Text>
      <MetricRow label="VEHICLE" value={trip.primary_vehicle || '\u2014'} />
      <MetricRow label="TEAM" value={`${trip.team_size}`} />
      <MetricRow label="TERRAIN" value={trip.terrain_type || '\u2014'} />
      <MetricRow label="WAYPOINTS" value={`${data.waypoints.length}`} />
    </View>
  );
}



// SUSTAINABILITY DETAIL (expanded view for modal)
// Full consumable breakdown with inline editing.
// ═══════════════════════════════════════════════════════════
function SustainabilityDetail({ data }: { data: WidgetData }) {
  const specEntry = vehicleSpecStore.getFirst();
  const vehicleId = specEntry?.vehicleId || '';
  const spec = specEntry?.spec || null;
  const consumables = vehicleId ? consumablesStore.get(vehicleId) : null;
  const fuelPct = consumables?.fuel_percent_current ?? 100;
  const waterGal = consumables?.water_gal_current ?? 0;
  const tankCapGal = spec?.fuel_tank_capacity_gal ?? 0;
  const fuelType = spec?.fuel_type ?? 'diesel';
  const currentFuelGal = tankCapGal > 0 ? tankCapGal * (fuelPct / 100) : 0;
  const fuelWeightLb = currentFuelGal * (fuelType === 'diesel' ? 7.1 : 6.0);
  const waterWeightLb = waterGal * 8.34;
  const trip = data.activeTrip;
  const mpg = trip?.capac_mpg ?? 0;
  const estRange = currentFuelGal > 0 && mpg > 0 ? Math.round(currentFuelGal * mpg) : null;

  return (
    <View style={s.detailContainer}>
      <Text style={s.detailSection}>CONSUMABLES</Text>
      <MetricRow label="FUEL LEVEL" value={`${fuelPct}%`} color={fuelPct <= 15 ? '#EF5350' : fuelPct <= 30 ? '#FFB74D' : '#4CAF50'} />
      {tankCapGal > 0 && <MetricRow label="FUEL VOLUME" value={`${currentFuelGal.toFixed(1)} gal`} />}
      <MetricRow label="FUEL WEIGHT" value={fuelWeightLb > 0 ? `${Math.round(fuelWeightLb)} lb` : '\u2014'} />
      <View style={s.detailDivider} />
      <MetricRow label="WATER ON BOARD" value={waterGal > 0 ? `${waterGal} gal` : '0 gal'} color={waterGal > 0 ? '#4CAF50' : TACTICAL.textMuted} />
      <MetricRow label="WATER WEIGHT" value={waterWeightLb > 0 ? `${Math.round(waterWeightLb)} lb` : '0 lb'} />
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>PROJECTIONS</Text>
      <MetricRow label="EST. RANGE" value={estRange ? `${estRange} mi` : '\u2014'} />
      <MetricRow label="TANK CAPACITY" value={tankCapGal > 0 ? `${tankCapGal} gal` : '\u2014'} />
      <MetricRow label="FUEL TYPE" value={fuelType.toUpperCase()} />
    </View>
  );
}



// ── Styles ─────────────────────────────────────────────
const s = StyleSheet.create({
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  metricLabel: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  metricValue: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier' },
  bigMetric: { fontSize: 28, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text, marginBottom: -2 },
  bigMetricUnit: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  progressOuter: { height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginVertical: 4 },
  progressInner: { height: '100%', borderRadius: 2 },
  pctText: { fontSize: 10, fontWeight: '800', fontFamily: 'Courier', textAlign: 'right', marginBottom: 2 },
  noData: { fontSize: 10, color: TACTICAL.textMuted, fontStyle: 'italic' },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: 'rgba(192,57,43,0.12)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' },
  alertText: { fontSize: 8, fontWeight: '900', color: TACTICAL.danger, letterSpacing: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginBottom: 6, alignSelf: 'flex-start' },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  emergencyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  emergencyTitle: { fontSize: 11, fontWeight: '900', color: TACTICAL.danger, letterSpacing: 1.5 },
  detailContainer: { gap: 2 },
  detailSection: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5, marginTop: 8, marginBottom: 4 },
  detailDivider: { height: 1, backgroundColor: TACTICAL.border, marginVertical: 8 },

  // ── Two-column layout ────────────────────────────────
  twoCol: { flexDirection: 'row', gap: 0 },
  colLeft: { flex: 1, paddingRight: 6 },
  colRight: { flex: 1, paddingLeft: 6 },
  colDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 2 },
  colHeader: { fontSize: 7, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.2, marginBottom: 4 },

  // ── Compact mode ─────────────────────────────────────
  compactRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  compactCell: { flex: 1, alignItems: 'center' },
  compactLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 1 },
  compactValue: { fontSize: 12, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text },

  // ── Vehicle Systems V2: expedition badges ────────────
  activeExpeditionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    backgroundColor: 'rgba(76,175,80,0.08)', marginBottom: 6, alignSelf: 'flex-start',
  },
  activeExpeditionText: { fontSize: 8, fontWeight: '900', color: '#4CAF50', letterSpacing: 1.5 },
  noExpeditionBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    backgroundColor: 'rgba(138,138,133,0.08)', marginBottom: 6, alignSelf: 'flex-start',
  },
  noExpeditionText: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },

  // ── Stability Index ──────────────────────────────────
  stabilityTopRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  stabilityMetric: { alignItems: 'center', flex: 1 },
  stabLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 2 },
  stabValue: { fontSize: 14, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text },
  marginBarContainer: { marginBottom: 6 },
  marginBarBg: { height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' },
  marginBarFill: { height: '100%', borderRadius: 3 },
  marginMarker: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },
  marginLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 },
  marginLabelText: { fontSize: 6, fontWeight: '700', letterSpacing: 0.8 },
  biasBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' },
  biasDot: { width: 5, height: 5, borderRadius: 3 },
  biasText: { fontSize: 8, fontWeight: '800', letterSpacing: 1 },
  advRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, backgroundColor: 'rgba(156,136,255,0.06)' },
  advLabel: { fontSize: 7, fontWeight: '700', color: '#9C88FF', letterSpacing: 1 },
  advValue: { fontSize: 8, fontWeight: '800', color: '#9C88FF', letterSpacing: 0.5 },

  // ── Attitude Monitor (Inclinometer) V2 ───────────────
  attSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  attSubText: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  attSubDot: { fontSize: 6, color: TACTICAL.textMuted },
  calibrationLabel: { fontSize: 7, fontWeight: '600', color: 'rgba(196,138,44,0.5)', letterSpacing: 0.5, marginBottom: 6 },
  sensorBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  sensorDot: { width: 4, height: 4, borderRadius: 2 },
  sensorText: { fontSize: 7, fontWeight: '800', letterSpacing: 1 },
  inclinometerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  vertBarContainer: { alignItems: 'center', width: 36, gap: 3 },
  barLabel: { fontSize: 12, fontWeight: '900', fontFamily: 'Courier' },
  // V2: Increased height from 60 to 72 (12% increase)
  vertBarBg: { width: 8, height: 72, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden', justifyContent: 'flex-end', position: 'relative' },
  vertBarFill: { width: '100%', borderRadius: 4 },
  vertBarMarker: { position: 'absolute', left: 0, right: 0, height: 1, backgroundColor: 'rgba(230,126,34,0.5)' },
  vertBarMarkerDanger: { backgroundColor: 'rgba(192,57,43,0.5)' },
  barAxisLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1 },
  silhouetteContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 80 },
  groundLine: { width: '80%', height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 4 },
  tiltLabel: { fontSize: 9, fontWeight: '800', fontFamily: 'Courier', color: TACTICAL.textMuted, marginTop: 3 },
  thresholdWarn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, alignItems: 'center' },
  thresholdWarnText: { fontSize: 8, fontWeight: '900', letterSpacing: 1.5 },
  highwayQuiet: { alignItems: 'center', paddingVertical: 3 },
  highwayQuietText: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 2 },

  // ── V2: Enterprise Vehicle Schematic ─────────────────
  vehicleSchematic: { alignItems: 'center' },
  schRoofRails: { flexDirection: 'row', justifyContent: 'space-between', width: 38, marginBottom: 1 },
  schRailLeft: { width: 2, height: 3, backgroundColor: 'rgba(196,138,44,0.3)', borderRadius: 1 },
  schRailRight: { width: 2, height: 3, backgroundColor: 'rgba(196,138,44,0.3)', borderRadius: 1 },
  schRoof: { width: 32, height: 5, backgroundColor: 'rgba(196,138,44,0.15)', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderWidth: 1, borderColor: 'rgba(196,138,44,0.3)', borderBottomWidth: 0 },
  schWindshieldRow: { flexDirection: 'row', alignItems: 'stretch', width: 38 },
  schPillar: { width: 3, height: 10, backgroundColor: 'rgba(196,138,44,0.2)' },
  schWindshield: { flex: 1, height: 10, backgroundColor: 'rgba(100,180,220,0.08)', borderWidth: 0.5, borderColor: 'rgba(100,180,220,0.2)' },
  schBody: { flexDirection: 'row', alignItems: 'center', width: 48 },
  schMirrorLeft: { width: 4, height: 6, backgroundColor: 'rgba(196,138,44,0.15)', borderRadius: 1, borderWidth: 0.5, borderColor: 'rgba(196,138,44,0.25)' },
  schMirrorRight: { width: 4, height: 6, backgroundColor: 'rgba(196,138,44,0.15)', borderRadius: 1, borderWidth: 0.5, borderColor: 'rgba(196,138,44,0.25)' },
  schBodyPanel: { flex: 1, height: 14, backgroundColor: 'rgba(196,138,44,0.1)', borderWidth: 1, borderColor: 'rgba(196,138,44,0.25)', justifyContent: 'center', alignItems: 'center' },
  schGrille: { width: '70%', gap: 2 },
  schGrilleBar: { height: 1.5, backgroundColor: 'rgba(196,138,44,0.2)', borderRadius: 1 },
  schBumper: { width: 42, height: 3, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 1, borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.1)' },
  schAxleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  schWheel: { width: 12, height: 16, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  schWheelHub: { width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.15)', borderWidth: 0.5, borderColor: 'rgba(255,255,255,0.25)' },
  schAxle: { width: 22, height: 3, backgroundColor: 'rgba(196,138,44,0.12)', borderWidth: 0.5, borderColor: 'rgba(196,138,44,0.2)' },

  // ── Tactical Bar (Power/Energy Monitor) ──────────────
  tacticalBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tacticalBarLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, width: 48 },
  tacticalBarOuter: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' },
  tacticalBarFill: { height: '100%', borderRadius: 3 },
  tacticalBarWarning: { position: 'absolute', left: '25%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(192,57,43,0.4)' },
  tacticalBarValue: { fontSize: 9, fontWeight: '800', fontFamily: 'Courier', width: 38, textAlign: 'right' },

  // ── Mission Sustainment ──────────────────────────────
  limitBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, marginTop: 4, alignSelf: 'flex-start' },
  limitText: { fontSize: 7, fontWeight: '900', letterSpacing: 1 },

  // ── Vehicle Systems Phase 4: Status Tag ───────────────
  vsStatusTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    marginTop: 4, alignSelf: 'flex-start',
  },
  vsStatusTagText: { fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },

  // ── Operational Readiness ────────────────────────────
  readinessHeader: { marginBottom: 2 },
  readinessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  readinessCell: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', minWidth: 52 },
  readinessCellLabel: { fontSize: 6, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 1 },
  readinessCellValue: { fontSize: 11, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text },
});


// ── Phase 4: Vehicle Weight Detail Styles ──────────────
const detailS = StyleSheet.create({
  headerCard: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    padding: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerCell: {
    flex: 1,
    alignItems: 'center',
  },
  headerLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginBottom: 4,
    textAlign: 'center',
  },
  headerValue: {
    fontSize: 18,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  headerUnit: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginTop: 1,
  },
  headerDivider: {
    width: 1,
    height: 36,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginHorizontal: 4,
  },
  subNote: {
    fontSize: 8,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  edgeCaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(255,183,77,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.12)',
  },
  edgeCaseText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#FFB74D',
    flex: 1,
  },
  consumableRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 3,
  },
  consumableLeft: {
    flex: 1,
  },
  consumableLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  consumableDetail: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    marginTop: 1,
  },
  consumableWeight: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  densityNote: {
    fontSize: 7,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    marginTop: 1,
    marginLeft: 2,
  },
  consumableTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  consumableTotalLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  consumableTotalValue: {
    fontSize: 12,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  totalCard: {
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    padding: 10,
    gap: 4,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 1,
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },
  totalValue: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  totalDivider: {
    height: 1,
    backgroundColor: 'rgba(196,138,44,0.2)',
    marginVertical: 4,
  },
});


// ── Core 4 Shared Styles (Phase 2: Consistent Widget Styling) ──
const core4 = StyleSheet.create({
  body: {
    gap: 2,
  },
  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 4,
  },
  sensorDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  sensorLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
  },
});


// ── BLU Power Widget Styles (Phase 1C) ──
const bluWidgetS = StyleSheet.create({
  section: {
    marginBottom: 4,
    paddingBottom: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TACTICAL.textMuted + '20',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginBottom: 3,
  },
  badgeDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  freshnessText: {
    fontSize: 7,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
    marginLeft: 6,
  },
});


const sustS = StyleSheet.create({
  editorRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 2,
  },
  editorInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  editorInput: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Courier',
    color: TACTICAL.text,
    minWidth: 42,
    textAlign: 'right',
  },
  editorUnit: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },
  editorSaveBtn: {
    backgroundColor: '#4CAF50',
    borderRadius: 4,
    width: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editorCancelBtn: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tappableValue: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  updatedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  updatedText: {
    fontSize: 8,
    fontWeight: '700',
    color: '#4CAF50',
    letterSpacing: 0.5,
  },
  // ── Phase 5: Read-only badge for active mode ──────────
  readOnlyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignSelf: 'flex-start',
  },
  readOnlyText: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  // ── Phase 5: Tank capacity helper text ────────────────
  helperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
    marginBottom: 2,
    paddingHorizontal: 4,
  },
  helperText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#FFB74D',
    fontStyle: 'italic',
  },
});

// ── Progress Widget Styles (Phase 4) ──
const progS = StyleSheet.create({
  fallbackText: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    marginBottom: 8,
  },
  fallbackAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 5,
    backgroundColor: TACTICAL.amber + '0C',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '25',
    alignSelf: 'flex-start',
  },
  fallbackActionText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
});

// ── Phase 6: Remoteness Widget Styles (v1.0 — Store-backed) ──
const remS = StyleSheet.create({
  body: {
    justifyContent: 'center',
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 4,
  },
  tierLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2.5,
    textAlign: 'center',
    fontFamily: 'Courier',
    marginBottom: 4,
  },
  supportLine: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
    opacity: 0.85,
  },
});

// ── Phase 4 (v1.3): Remoteness Detail Styles ──
const remDetailS = StyleSheet.create({
  modeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(255,183,77,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,183,77,0.12)',
  },
  modeText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  modeSubtext: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    marginLeft: 'auto',
  },
});


// ── Phase 6: Expedition Channel Widget Styles ──
const chanS = StyleSheet.create({
  body: {
    gap: 2,
  },
  soloRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  soloDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TACTICAL.textMuted,
  },
  soloLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  soloSub: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  activityDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  activityText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    flex: 1,
  },
});


// ── Custom Widget Content (must be defined before renderWidgetContent references it) ──
function CustomWidgetContent({ widgetId, data }: { widgetId: string; data: WidgetData }) {
  const widgetDef = customWidgetStore.getById(widgetId);
  if (!widgetDef) return <Text style={s.noData}>Widget not found</Text>;
  const resolvedFields = widgetDef.dataFields.map(fieldKey => {
    const fieldDef = AVAILABLE_DATA_FIELDS.find(f => f.field === fieldKey);
    const resolved = customWidgetStore.resolveFieldValue(fieldKey, {
      activeTrip: data.activeTrip, loadItems: data.loadItems, waypoints: data.waypoints,
    });
    return { fieldKey, fieldDef, resolved };
  });
  return (
    <View>
      {resolvedFields.slice(0, 3).map(({ fieldKey, fieldDef, resolved }) => {
        const label = fieldDef?.label?.toUpperCase() || fieldKey.toUpperCase();
        const displayVal = resolved.value != null ? String(resolved.value) : '--';
        const unit = fieldDef?.unit ? ` ${fieldDef.unit}` : '';
        let color: string | undefined;
        if (widgetDef.thresholds.enabled && fieldKey === widgetDef.thresholds.targetField) {
          color = customWidgetStore.evaluateThreshold(resolved.raw, widgetDef.thresholds);
        }
        return <MetricRow key={fieldKey} label={label} value={`${displayVal}${unit}`} color={color} />;
      })}
    </View>
  );
}

// ── Empty State Microcopy Styles ───────────────────────
const emptyS = StyleSheet.create({
  container: {
    justifyContent: 'center',
    paddingVertical: 2,
  },
  primary: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  secondary: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
    marginTop: 2,
    opacity: 0.85,
  },
});






