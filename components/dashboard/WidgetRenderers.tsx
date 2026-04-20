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
 * or density constants â€” all encapsulated in the centralized function.
 *
 * CORE 4 WIDGET STYLING (Phase 2: Consistent Widget Styling):
 * All four Core 4 widgets (Vehicle Systems, Attitude Monitor,
 * Sustainability, Progress) share identical:
 *   - Internal padding (inherited from WidgetGrid widgetContent)
 *   - MetricRow typography (9px label, 11px Courier value)
 *   - Line spacing (paddingVertical: 3 per row)
 *   - Density cap (3â€“4 MetricRows max, no extra chrome)
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


import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Animated, Image } from 'react-native';

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
import { getActiveVehicleContext } from '../../lib/activeVehicleContext';
import { consumablesStore, type ConsumableInputSource, type ConsumablesState } from '../../lib/consumablesStore';
import { routeStore } from '../../lib/routeStore';
import { waypointProgressStore, ARRIVAL_THRESHOLD_MI } from '../../lib/waypointProgressStore';
import { expeditionRiskStore } from '../../lib/expeditionRiskStore';
import { useApp } from '../../context/AppContext';
import { missionExpeditionStore } from '../../lib/missionStore';
import { ecsSyncCoordinator } from '../../lib/ecsSyncCoordinator';
import { useOperationalWeather } from '../../lib/useOperationalWeather';
import {
  formatWeatherAlertLine,
  formatWeatherHeadline,
  formatWeatherWindLine,
} from '../../lib/ecsWeather';
import {
  summarizeRemoteness,
  summarizeResourceStatus,
  summarizeSignal,
  summarizeVehicleSystems,
  summarizeWeatherStatus,
} from '../../lib/dashboardWidgetSelectors';
import {
  getDashboardSourceLabel,
  getDashboardSourceTone,
  isDashboardLiveSource,
  resolveDashboardValue,
  type DashboardValueSource,
} from '../../lib/dashboardWidgetSources';
import {
  WidgetCardShell,
  WidgetCompactRow,
  WidgetEmptyState,
  WidgetMetaLine,
  WidgetMicroStrip,
  WidgetPrimaryValue,
  WidgetSecondaryRow,
  WidgetStateMessage,
  createWidgetStateDescriptor,
  getWidgetStateBadge,
  type WidgetStateKind,
  type WidgetTone,
} from './WidgetChrome';
import { ECSWidgetFallback } from '../ECSStateMessage';
import { ECS_STATE_COPY } from '../../lib/ecsStateCopy';
import ProPaywallView from '../premium/ProPaywallView';
import { hasPremiumEntitlement, isPremiumWidget } from '../../lib/subscriptionAccess';
import { hapticMicro, hapticWarning } from '../../lib/haptics';

// Phase 8: Unified ECS Power System Widget
import { PowerSystemCompact, PowerSystemCard } from './PowerSystemWidget';
import { PowerSystemDetailView } from './PowerSystemDetail';

// Phase 9: OBD-II Vehicle Telemetry Widget
import { VehicleTelemetryCompact, VehicleTelemetryCard, VehicleTelemetryDetailView } from './VehicleTelemetryWidget';
import {
  WidgetDetailLeadCard,
  WidgetDetailSectionCard,
  WidgetDetailSectionTitle,
  WidgetDetailStateCard,
} from './WidgetDetailChrome';
// Phase 2C: Vehicle Telemetry
import { useVehicleTelemetry } from '../../src/vehicle-telemetry/useVehicleTelemetry';

import { remotenessStore, type ConnectivityState } from '../../lib/remotenessStore';
import { TERRAIN_COMPLEXITY_SCORES } from '../../lib/elevationComplexity';

// Phase 10: Enhanced Remoteness Index Widget
// Phase 10: Enhanced Remoteness Index Widget
import { RemotenessIndexCompact, RemotenessIndexCard, RemotenessIndexDetailView } from './RemotenessIndexWidget';
import NavigateSurfaceWidget, { NavigateSurfaceDetailView } from './NavigateSurfaceWidget';

// Phase 10: Terrain Risk Prediction Widget
// Phase 10: Terrain Risk Prediction Widget
import { TerrainRiskCompact, TerrainRiskCard, TerrainRiskDetailView } from './TerrainRiskWidget';

// Phase 5: Expedition Risk Engine Widget
import { ExpeditionRiskCompact, ExpeditionRiskCard, ExpeditionRiskDetailView } from './ExpeditionRiskWidget';
import AttitudeMonitorExpandedView from '../attitude/AttitudeMonitorExpandedView';
import AttitudeMonitorSurface from '../attitude/AttitudeMonitorSurface';
import { getAttitudeMonitorFallbackHeroSource } from '../../lib/attitudeMonitorAssets';
import { resolveAttitudeMonitorVehicleVisual } from '../../lib/attitudeMonitorVehicleVisual';
import { useAttitudeMonitorDisplayState } from '../../lib/useAttitudeMonitorDisplayState';
import {
  formatAttitudeDegrees,
  getAttitudeSensorState,
} from '../../lib/attitudeMonitorModel';

// Resource Forecast Widget
import { ResourceForecastCompact, ResourceForecastCard, ResourceForecastDetailView } from './ResourceForecastWidget';

// Trip Recorder Widget
import { TripRecorderCompact, TripRecorderCard, TripRecorderDetailView } from './TripRecorderWidget';
import { resolveResourceWidgetPresentation } from '../../lib/resource/resourceCommandResolvers';
import type { ECSAIState } from '../../lib/ai/aiOrchestrator';
import type { ECSOrchestratorTargetView } from '../../lib/ai/orchestratorSelectors';

const ATTITUDE_MONITOR_VEHICLE_IMAGE = getAttitudeMonitorFallbackHeroSource();

function areAttitudeVehicleContextsEqual(
  left?: WidgetData['activeVehicleContext'],
  right?: WidgetData['activeVehicleContext'],
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return !left && !right;
  }

  return (
    left.activeVehicleId === right.activeVehicleId &&
    left.vehicle?.id === right.vehicle?.id &&
    left.vehicle?.type === right.vehicle?.type &&
    left.vehicle?.make === right.vehicle?.make &&
    left.vehicle?.model === right.vehicle?.model &&
    left.vehicle?.name === right.vehicle?.name &&
    left.spec?.gvwr_lb === right.spec?.gvwr_lb &&
    left.spec?.base_weight_lb === right.spec?.base_weight_lb &&
    left.wizardConfig?.vehicleType === right.wizardConfig?.vehicleType &&
    left.wizardConfig?.platformType === right.wizardConfig?.platformType
  );
}

function areAttitudeWidgetOptionsEqual(
  left?: WidgetRenderOptions,
  right?: WidgetRenderOptions,
): boolean {
  return (
    (left?.compact ?? false) === (right?.compact ?? false) &&
    (left?.rollDeg ?? 0) === (right?.rollDeg ?? 0) &&
    (left?.pitchDeg ?? 0) === (right?.pitchDeg ?? 0) &&
    (left?.sensorStatus ?? 'OFFLINE') === (right?.sensorStatus ?? 'OFFLINE') &&
    (left?.sampleTimestampMs ?? null) === (right?.sampleTimestampMs ?? null) &&
    (left?.advancedMode ?? false) === (right?.advancedMode ?? false) &&
    (left?.isFeatured ?? false) === (right?.isFeatured ?? false) &&
    (left?.isCompressedRow ?? false) === (right?.isCompressedRow ?? false)
  );
}

function areAttitudeWidgetPropsEqual(
  previous: Readonly<{ data: WidgetData; options?: WidgetRenderOptions }>,
  next: Readonly<{ data: WidgetData; options?: WidgetRenderOptions }>,
): boolean {
  return (
    areAttitudeVehicleContextsEqual(previous.data.activeVehicleContext, next.data.activeVehicleContext) &&
    areAttitudeWidgetOptionsEqual(previous.options, next.options)
  );
}


export interface WidgetData {
  activeTrip: Trip | null;
  loadItems: LoadItem[];
  riskScore: RiskScore | null;
  waypoints: Waypoint[];
  userSettings: UserSettings | null;
  syncStatus: string;
  activeVehicleContext?: ReturnType<typeof getActiveVehicleContext>;
  aiState?: ECSAIState | null;
  aiDashboardView?: ECSOrchestratorTargetView | null;
}

export interface WidgetRenderOptions {
  dashboardMode?: DashboardMode;
  compact?: boolean;
  /** Accelerometer data for attitude monitor */
  rollDeg?: number;
  pitchDeg?: number;
  sensorStatus?: string;
  sampleTimestampMs?: number | null;
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
  /** Dashboard detail action for remoteness emergency routing */
  onRemotenessNavigateToTarget?: (target: 'town' | 'fuel' | 'paved_road') => void;
}

function areVehicleSystemsWidgetPropsEqual(
  prev: { data: WidgetData; options?: WidgetRenderOptions },
  next: { data: WidgetData; options?: WidgetRenderOptions },
) {
  return (
    prev.data.loadItems === next.data.loadItems &&
    prev.data.activeVehicleContext?.profileSignature === next.data.activeVehicleContext?.profileSignature &&
    prev.options?.compact === next.options?.compact
  );
}

function areAttitudeMonitorWidgetPropsEqual(
  prev: { data: WidgetData; options?: WidgetRenderOptions },
  next: { data: WidgetData; options?: WidgetRenderOptions },
) {
  return (
    prev.data.activeVehicleContext?.profileSignature === next.data.activeVehicleContext?.profileSignature &&
    prev.options?.compact === next.options?.compact &&
    prev.options?.rollDeg === next.options?.rollDeg &&
    prev.options?.pitchDeg === next.options?.pitchDeg &&
    prev.options?.sensorStatus === next.options?.sensorStatus &&
    prev.options?.sampleTimestampMs === next.options?.sampleTimestampMs &&
    prev.options?.advancedMode === next.options?.advancedMode &&
    prev.options?.isFeatured === next.options?.isFeatured &&
    prev.options?.isCompressedRow === next.options?.isCompressedRow
  );
}

function areRemotenessWidgetPropsEqual(
  prev: { data: WidgetData; options?: WidgetRenderOptions },
  next: { data: WidgetData; options?: WidgetRenderOptions },
) {
  return (
    prev.options?.compact === next.options?.compact &&
    prev.options?.gpsHasFix === next.options?.gpsHasFix
  );
}

function useVehicleConsumables(
  vehicleId?: string | null,
  fallback?: Partial<ConsumablesState> | null,
): ConsumablesState {
  const fallbackFuel = fallback?.fuel_percent_current ?? 100;
  const fallbackFuelSource = fallback?.fuel_source === 'sensor' ? 'sensor' : 'manual';
  const fallbackWater = fallback?.water_gal_current ?? 0;
  const fallbackSource = fallback?.water_source === 'sensor' ? 'sensor' : 'manual';
  const fallbackUpdatedAt = fallback?.water_updated_at ?? null;
  const fallbackAlternateLabel = fallback?.alternate_fluid_label ?? null;
  const fallbackAlternateUnit = fallback?.alternate_fluid_unit ?? null;
  const fallbackAlternateCurrent = fallback?.alternate_fluid_current ?? null;
  const fallbackAlternateCapacity = fallback?.alternate_fluid_capacity ?? null;
  const fallbackAlternateSource = fallback?.alternate_fluid_source === 'sensor' ? 'sensor' : 'manual';
  const fallbackAlternateUpdatedAt = fallback?.alternate_fluid_updated_at ?? null;
  const [state, setState] = useState<ConsumablesState>(() => (
    vehicleId
      ? consumablesStore.get(vehicleId)
      : {
          fuel_percent_current: fallbackFuel,
          fuel_source: fallbackFuelSource,
          water_gal_current: fallbackWater,
          water_source: fallbackSource,
          water_updated_at: fallbackUpdatedAt,
          alternate_fluid_label: fallbackAlternateLabel,
          alternate_fluid_unit: fallbackAlternateUnit,
          alternate_fluid_current: fallbackAlternateCurrent,
          alternate_fluid_capacity: fallbackAlternateCapacity,
          alternate_fluid_source: fallbackAlternateSource,
          alternate_fluid_updated_at: fallbackAlternateUpdatedAt,
        }
  ));

  useEffect(() => {
    if (!vehicleId) {
      setState({
        fuel_percent_current: fallbackFuel,
        fuel_source: fallbackFuelSource,
        water_gal_current: fallbackWater,
        water_source: fallbackSource,
        water_updated_at: fallbackUpdatedAt,
        alternate_fluid_label: fallbackAlternateLabel,
        alternate_fluid_unit: fallbackAlternateUnit,
        alternate_fluid_current: fallbackAlternateCurrent,
        alternate_fluid_capacity: fallbackAlternateCapacity,
        alternate_fluid_source: fallbackAlternateSource,
        alternate_fluid_updated_at: fallbackAlternateUpdatedAt,
      });
      return undefined;
    }

    const sync = () => {
      setState(consumablesStore.get(vehicleId));
    };

    sync();
    return consumablesStore.subscribe(sync);
  }, [
    vehicleId,
    fallbackFuel,
    fallbackFuelSource,
    fallbackWater,
    fallbackSource,
    fallbackUpdatedAt,
    fallbackAlternateLabel,
    fallbackAlternateUnit,
    fallbackAlternateCurrent,
    fallbackAlternateCapacity,
    fallbackAlternateSource,
    fallbackAlternateUpdatedAt,
  ]);

  return state;
}

function formatPowerFlow(powerInput: number | null, powerOutput: number | null) {
  if (powerInput != null && powerInput > 0) return `+${Math.round(powerInput)}W In`;
  if (powerOutput != null && powerOutput > 0) return `-${Math.round(powerOutput)}W Out`;
  return 'Power idle';
}

function formatFuelStatus(fuelPercent: number) {
  if (fuelPercent <= 10) return `Near Empty - ${Math.round(fuelPercent)}%`;
  return `${Math.round(fuelPercent)}%`;
}

function formatWeightStatus(buildWeightLb: number, payloadMarginLb: number, hasSpecs: boolean) {
  if (hasSpecs) {
    if (payloadMarginLb <= 0) return 'Over limit';
    if (payloadMarginLb < 250) return `${Math.round(payloadMarginLb)} lb margin`;
    return `${Math.round(buildWeightLb).toLocaleString()} lb loaded`;
  }
  if (buildWeightLb > 0) return `${Math.round(buildWeightLb).toLocaleString()} lb`;
  return 'Awaiting profile';
}

function formatWaterSourceLabel(source?: ConsumableInputSource | null) {
  return source === 'sensor' ? 'Sensor source' : 'Manual source';
}

function formatUpdatedLabel(timestamp?: number | null) {
  if (!timestamp) return 'Not updated yet';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));
  if (minutes < 1) return 'Updated just now';
  if (minutes === 1) return 'Updated 1 min ago';
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return 'Updated 1 hr ago';
  return `Updated ${hours} hr ago`;
}

function formatResourceModeLabel(source?: ConsumableInputSource | null) {
  return source === 'sensor' ? 'Automatic' : 'Manual';
}

function mapConsumableSourceToDashboardSource(source?: ConsumableInputSource | null): DashboardValueSource {
  return source === 'sensor' ? 'live' : 'manual';
}

function getVehicleTelemetryFuelSource(vt: ReturnType<typeof useVehicleTelemetry>) {
  const hasFreshTelemetry = vt.hasData && (vt.freshnessLabel === 'live' || vt.freshnessLabel === 'reconnecting');
  const hasRenderableTelemetry = vt.hasData && (hasFreshTelemetry || vt.isWithinGraceWindow || vt.isShowingLastKnown);
  return resolveDashboardValue<number>([
    {
      source: 'live',
      value: hasRenderableTelemetry ? vt.summary.fuel_level : null,
      detail: hasFreshTelemetry ? 'Live telemetry' : 'Last known telemetry',
    },
  ]);
}

function formatAlternateFluidValue(consumables: ConsumablesState): string | null {
  const current = consumables.alternate_fluid_current;
  if (current == null || !Number.isFinite(current)) return null;
  const label = consumables.alternate_fluid_label?.trim() || 'Propane';
  const unit = consumables.alternate_fluid_unit?.trim() || '%';
  const capacity = consumables.alternate_fluid_capacity;
  if (unit === '%') {
    return `${label} ${Math.round(current)}%`;
  }
  if (capacity != null && Number.isFinite(capacity) && capacity > 0) {
    return `${label} ${current.toFixed(1)} / ${capacity.toFixed(1)} ${unit}`;
  }
  return `${label} ${current.toFixed(1)} ${unit}`;
}

function formatAlternateFluidLabel(consumables: ConsumablesState): string {
  return consumables.alternate_fluid_label?.trim() || 'Propane';
}

function formatPowerFlowRow(powerInput: number | null, powerOutput: number | null): {
  text: string;
  tone: 'good' | 'critical' | 'neutral';
} {
  if (powerInput != null && powerInput > 0) {
    return { text: `+${Math.round(powerInput)}W In`, tone: 'good' };
  }
  if (powerOutput != null && powerOutput > 0) {
    return { text: `-${Math.round(powerOutput)}W Out`, tone: 'critical' };
  }
  return { text: 'Idle', tone: 'neutral' };
}

function getTerrainOutlook(params: {
  gradePercent: number | null;
  hazardCount: number;
  hasRoute: boolean;
  hasLiveFix: boolean;
}): { label: string; tone: 'critical' | 'attention' | 'good' | 'neutral' } {
  const absGrade = Math.abs(params.gradePercent ?? 0);
  if (params.hazardCount >= 2 || absGrade >= 12) {
    return { label: 'Ahead: Impassable', tone: 'critical' };
  }
  if (params.hazardCount >= 1 || absGrade >= 8) {
    return { label: 'Ahead: Hazardous', tone: 'attention' };
  }
  if (absGrade >= 5) {
    return { label: 'Terrain Risk: Elevated', tone: 'attention' };
  }
  if (params.hasRoute || params.hasLiveFix) {
    return { label: 'Ahead: Passable', tone: 'good' };
  }
  return { label: 'Ahead: Awaiting context', tone: 'neutral' };
}

function isCriticalWeatherAlert(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): boolean {
  return snapshot.alerts.some((alert) => alert.severity === 'extreme');
}

function getCriticalWeatherAlertSignature(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string | null {
  const extremeAlerts = snapshot.alerts.filter((alert) => alert.severity === 'extreme');
  if (extremeAlerts.length === 0) return null;
  return extremeAlerts
    .map((alert) => `${alert.title}|${alert.effective ?? ''}|${alert.expires ?? ''}`)
    .join(' · ');
}

function triggerCriticalWeatherHapticBurst() {
  const burstSpacingMs = 360;
  void hapticMicro();
  setTimeout(() => {
    void hapticMicro();
  }, burstSpacingMs);
  setTimeout(() => {
    void hapticMicro();
  }, burstSpacingMs * 2);
}

function AttitudeOrientationScene({
  rollDeg,
  pitchDeg,
  tone,
  large = false,
}: {
  rollDeg: number;
  pitchDeg: number;
  tone: 'good' | 'attention' | 'critical' | 'neutral';
  large?: boolean;
}) {
  const clampedRoll = Math.max(-34, Math.min(34, rollDeg));
  const clampedPitch = Math.max(-28, Math.min(28, pitchDeg));
  const toneColor =
    tone === 'critical' ? TACTICAL.danger : tone === 'attention' ? '#E67E22' : TACTICAL.amber;

  return (
    <View style={[attitudeCardS.scene, large && attitudeCardS.sceneLarge]}>
      <View style={attitudeCardS.sceneGlow} />
      <View
        style={[
          attitudeCardS.horizonRail,
          {
            transform: [
              { translateY: Math.max(-10, Math.min(10, (clampedPitch / 28) * 10)) },
              { rotate: `${-clampedRoll}deg` },
            ],
          },
        ]}
      >
        <View style={attitudeCardS.horizonWing} />
        <View style={[attitudeCardS.horizonCore, { borderColor: `${toneColor}70` }]}>
          <View style={[attitudeCardS.horizonCoreDot, { backgroundColor: toneColor }]} />
        </View>
        <View style={attitudeCardS.horizonWing} />
      </View>

      <View
        style={[
          attitudeCardS.vehicleRig,
          {
            transform: [
              { translateY: Math.max(-16, Math.min(16, (-clampedPitch / 28) * 16)) },
              { rotate: `${clampedRoll}deg` },
            ],
          },
        ]}
      >
        <View style={[attitudeCardS.vehicleImageFrame, large && attitudeCardS.vehicleImageFrameLarge]}>
          <Image
            source={ATTITUDE_MONITOR_VEHICLE_IMAGE}
            resizeMode="contain"
            style={attitudeCardS.vehicleImage}
          />
        </View>
      </View>

      <View style={attitudeCardS.groundRow}>
        <View style={[attitudeCardS.groundSegment, { backgroundColor: `${toneColor}30` }]} />
        <View style={attitudeCardS.groundSegmentSoft} />
      </View>
    </View>
  );
}

function VehicleSystemsMetricTile({
  label,
  value,
  helper,
  tone = 'neutral',
  compact = false,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: 'neutral' | 'good' | 'attention' | 'critical';
  compact?: boolean;
}) {
  const color =
    tone === 'critical' ? TACTICAL.danger : tone === 'attention' ? '#FFB74D' : tone === 'good' ? '#66BB6A' : TACTICAL.text;
  return (
    <View style={[vehicleSystemsS.metricTile, compact && vehicleSystemsS.metricTileCompact]}>
      <Text style={vehicleSystemsS.metricTileLabel}>{label}</Text>
      <Text
        style={[vehicleSystemsS.metricTileValue, compact && vehicleSystemsS.metricTileValueCompact, { color }]}
        numberOfLines={compact ? 1 : 2}
      >
        {value}
      </Text>
      {helper ? (
        <Text style={vehicleSystemsS.metricTileHelper} numberOfLines={1}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}







type EcsPowerSummaryLike = ReturnType<typeof ecsSyncCoordinator.getSummary<'power'>>;

function getEcsPowerSummary(): EcsPowerSummaryLike {
  try {
    return ecsSyncCoordinator.getSummary('power');
  } catch {
    return null;
  }
}

function formatMinutesToRuntime(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return 'â€”';
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded >= 60) {
    const h = Math.floor(rounded / 60);
    const m = rounded % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  return `${rounded}m`;
}

function getPowerPercentColor(pct: number | null | undefined): string {
  if (pct == null || !Number.isFinite(pct)) return TACTICAL.textMuted;
  if (pct >= 60) return '#4CAF50';
  if (pct >= 25) return '#FFB300';
  return '#EF5350';
}

function getEcsPowerBadge(powerSummary: EcsPowerSummaryLike): { label: string; color: string } | null {
  if (!powerSummary || !powerSummary.available || !powerSummary.has_devices) return null;
  if (powerSummary.freshness === 'stale') return { label: 'POWER STALE', color: '#FFB300' };
  return {
    label: powerSummary.is_sustainable ? 'POWER STABLE' : 'POWER LIMITED',
    color: powerSummary.is_sustainable ? '#4CAF50' : '#FFB300',
  };
}

// â”€â”€ Viewer-aware color helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


// â”€â”€ Metric Row Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


// â”€â”€ Empty State Microcopy Helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Standardized 2-line empty state: primary status + optional action hint.
// Maintains industrial tone, no icons, no height expansion.
function EmptyStateMicrocopy({ primary, secondary }: { primary: string; secondary?: string }) {
  return <ECSWidgetFallback title={primary} message={secondary ?? ''} />;
}

function renderWidgetState(kind: WidgetStateKind, primary: string, secondary?: string, badgeLabel?: string) {
  return {
    badge: getWidgetStateBadge(kind, badgeLabel),
    message: createWidgetStateDescriptor({
      kind,
      badgeLabel,
      primary,
      secondary,
    }),
  };
}

function resolveWeatherWidgetState(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']) {
  switch (snapshot.status.kind) {
    case 'loading':
      return renderWidgetState('loading', 'Loading weather', 'Refreshing current conditions', 'LOADING');
    case 'waiting_for_gps':
      return renderWidgetState('loading', 'Waiting for GPS', 'Weather will populate once ECS regains a usable location fix', 'WAITING FOR GPS');
    case 'stale':
      return renderWidgetState('stale', 'Using cached weather', 'Showing the latest saved weather context until a fresh update arrives', 'STALE WEATHER');
    case 'offline':
      return renderWidgetState('stale', 'Offline weather support', 'Showing cached local weather until connectivity returns', 'OFFLINE CACHE');
    default:
      return renderWidgetState('unavailable', 'Weather unavailable', 'No usable weather source is currently available for this widget', 'UNAVAILABLE');
  }
}

function resolveVehicleSystemsFallbackState(params: {
  hasLiveTelemetry: boolean;
  hasGraceData: boolean;
  hasFallbackContext: boolean;
  hasPowerContext: boolean;
  faultReason: string | null;
}) {
  if (params.faultReason) {
    return createWidgetStateDescriptor({
      kind: 'critical',
      badgeLabel: 'SYSTEM ALERT',
      primary: 'Critical condition',
      secondary: params.faultReason,
    });
  }

  if (params.hasLiveTelemetry) {
    return createWidgetStateDescriptor({
      kind: 'live',
      badgeLabel: 'LIVE VEHICLE',
      primary: 'Live telemetry active',
      secondary: 'Vehicle systems are updating from current telemetry',
    });
  }

  if (params.hasGraceData) {
    return createWidgetStateDescriptor({
      kind: 'stale',
      badgeLabel: 'STALE TELEMETRY',
      primary: 'Telemetry is stale',
      secondary: 'Showing last known vehicle system data',
    });
  }

  if (params.hasFallbackContext) {
    return createWidgetStateDescriptor({
      kind: 'degraded',
      badgeLabel: params.hasPowerContext ? 'PROFILE + POWER' : 'PROFILE MODE',
      primary: 'Live telemetry unavailable',
      secondary: params.hasPowerContext
        ? 'Using power and vehicle profile context'
        : 'Using saved vehicle profile context',
    });
  }

  return createWidgetStateDescriptor({
    kind: 'misconfigured',
    badgeLabel: 'SETUP REQUIRED',
    primary: 'Setup required',
    secondary: 'Add a vehicle profile or power source',
  });
}

// â”€â”€ Tactical Bar (for Power/Energy Monitor) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Helper: get total weight from load items (qty Ã— weight) â”€â”€
function getTotalWeightLbs(items: LoadItem[]): number {
  return items
    .filter(i => !i.deleted_at)
    .reduce((sum, i) => sum + ((i.weight_lbs || 0) * (i.qty || 1)), 0);
}

function getMechanicalProfileSummary(context: ReturnType<typeof getActiveVehicleContext>): string {
  const tires = context.tiresLift?.tireSizeInches ?? 0;
  const lift = context.tiresLift?.suspensionLiftInches ?? 0;
  const leveled = Boolean(context.tiresLift?.isLeveled);
  const parts: string[] = [];

  if (tires > 0) parts.push(`${tires}" tires`);
  if (lift > 0) parts.push(`${lift}" lift`);
  if (!lift && leveled) parts.push('leveled');

  return parts.join(' Â· ');
}

function getLoadoutProfileSummary(context: ReturnType<typeof getActiveVehicleContext>): string {
  if (!context.loadout) return '';

  const parts: string[] = [];
  if (context.loadoutItemCount > 0) {
    parts.push(`${context.loadoutItemCount} item${context.loadoutItemCount === 1 ? '' : 's'}`);
  }
  if (context.loadoutTotalWeightLbs > 0) {
    parts.push(`${Math.round(context.loadoutTotalWeightLbs).toLocaleString()} lb loadout`);
  }
  if (context.loadout.people_count != null && context.loadout.people_count > 0) {
    parts.push(`${context.loadout.people_count} crew`);
  }

  return parts.join(' Â· ');
}

// â”€â”€ Helper: check if any items have 0 weight â”€â”€
function hasZeroWeightItems(items: LoadItem[]): boolean {
  return items.filter(i => !i.deleted_at).some(i => !i.weight_lbs || i.weight_lbs === 0);
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CORE 4 WIDGET A â€” VEHICLE SYSTEMS
//
// Phase 2E: Live OBD-II Telemetry Integration
//
// Priority rendering:
//   1) Live OBD-II telemetry â†’ engine status, battery, fuel, speed
//   2) Grace window â†’ last known values + "Updating..." indicator
//   3) Stale/disconnected â†’ fall back to weight-based display
//   4) No specs â†’ setup required
//
// Weight data (build weight, margin) remains available in detail view.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const VehicleSystemsWidget = React.memo(function VehicleSystemsWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const activeVehicleContext = data.activeVehicleContext ?? getActiveVehicleContext();
  const consumables = useVehicleConsumables(
    activeVehicleContext.activeVehicleId,
    activeVehicleContext.consumables ?? undefined,
  );

  // â”€â”€ Phase 2E: Live Vehicle Telemetry â”€â”€
  const vt = useVehicleTelemetry();
  const hasLiveTelemetry = vt.hasData && (vt.freshnessLabel === 'live' || vt.freshnessLabel === 'reconnecting');
  const hasGraceData = vt.hasData && vt.isWithinGraceWindow;
  const showLiveData = hasLiveTelemetry || hasGraceData;

  // â”€â”€ ECS power summary (bus-backed) â”€â”€
  const ecsPower = getEcsPowerSummary();
  const powerAvailable = !!(ecsPower?.available && ecsPower?.has_devices);
  const powerPct = ecsPower?.battery_percent ?? null;
  const powerInput = ecsPower?.input_watts ?? null;
  const powerOutput = ecsPower?.output_watts ?? null;
  const powerRuntime = ecsPower?.runtime_minutes ?? null;
  const powerBadge = getEcsPowerBadge(ecsPower);
  const powerPctColor = getPowerPercentColor(powerPct);

  // â”€â”€ Weight data (fallback) â”€â”€
  const itemsWt = getTotalWeightLbs(data.loadItems);
  const bw: BuildWeightBreakdown = computeFullBuildWeightBreakdown(undefined, {
    items_weight_lb: itemsWt,
  });

  const { build_weight_lb, payload_margin_lb, has_specs, margin_color,
          fuel_percent_current } = bw;

  // â”€â”€ Fuel color â”€â”€
  const fuelColor = fuel_percent_current <= 15 ? '#EF5350' : fuel_percent_current <= 30 ? '#FFB74D' : TACTICAL.text;

  // â”€â”€ Engine status display â”€â”€
  const engineStatusDisplay: Record<string, { label: string; color: string }> = {
    running: { label: 'RUNNING', color: '#4CAF50' },
    idle:    { label: 'IDLE',    color: TACTICAL.amber },
    off:     { label: 'OFF',     color: TACTICAL.textMuted },
    unknown: { label: 'UNKNOWN', color: TACTICAL.textMuted },
  };
  const engineInfo = engineStatusDisplay[vt.engineStatus] || engineStatusDisplay.unknown;

  // â”€â”€ Battery voltage color â”€â”€
  const battV = vt.summary.battery_voltage;
  const battColor = battV != null
    ? (battV >= 12.4 ? '#4CAF50' : battV >= 11.8 ? '#FFB300' : '#EF5350')
    : TACTICAL.textMuted;
  const batteryTone: 'good' | 'attention' | 'critical' | 'neutral' =
    battV == null
      ? 'neutral'
      : battV >= 12.4
        ? 'good'
        : battV >= 11.8
          ? 'attention'
          : 'critical';

  // â”€â”€ Live fuel level from OBD-II â”€â”€
  const liveFuelPct = vt.summary.fuel_level;
  const liveFuelColor = liveFuelPct != null
    ? (liveFuelPct <= 15 ? '#EF5350' : liveFuelPct <= 30 ? '#FFB74D' : '#4CAF50')
    : TACTICAL.textMuted;
  const mechanicalSummary = getMechanicalProfileSummary(activeVehicleContext);
  const currentFuelPercent = liveFuelPct ?? consumables.fuel_percent_current ?? fuel_percent_current;
  const waterGallons = consumables.water_gal_current ?? bw.water_gal_current ?? 0;
  const waterTone: 'good' | 'attention' | 'critical' =
    waterGallons <= 0 ? 'critical' : waterGallons <= 5 ? 'attention' : 'good';
  const weightTone: 'good' | 'attention' | 'critical' | 'neutral' =
    !has_specs
      ? 'neutral'
      : payload_margin_lb <= 0
        ? 'critical'
        : payload_margin_lb < 250
          ? 'attention'
          : 'good';
  const powerTone: 'good' | 'attention' | 'critical' | 'neutral' =
    powerInput != null && powerInput > 0
      ? 'good'
      : powerOutput != null && powerOutput > 0
        ? 'attention'
        : powerPct != null && powerPct < 20
          ? 'critical'
          : powerPct != null && powerPct < 40
            ? 'attention'
            : powerPct != null
              ? 'good'
              : 'neutral';
  const faultReason =
    liveFuelPct != null && liveFuelPct <= 15
      ? 'Fuel reserve below 15%'
      : battV != null && battV < 11.8
        ? 'Starter battery voltage is low'
        : null;
  const systemsActiveItems = data.loadItems.filter(i => !i.deleted_at);
  const systemsHasFallbackContext =
    powerAvailable ||
    has_specs ||
    systemsActiveItems.length > 0 ||
    build_weight_lb > 0 ||
    activeVehicleContext.hasVehicleContext;
  const systemsState = resolveVehicleSystemsFallbackState({
    hasLiveTelemetry,
    hasGraceData: hasGraceData && !hasLiveTelemetry,
    hasFallbackContext: systemsHasFallbackContext,
    hasPowerContext: powerAvailable,
    faultReason,
  });
  const systemsSummary = summarizeVehicleSystems({
    engineLabel: engineInfo.label,
    hasLiveTelemetry,
    batteryVoltage: battV,
    fuelPercent: currentFuelPercent,
    powerPercent: powerPct,
    powerRuntime: formatMinutesToRuntime(powerRuntime),
    faultReason,
    buildWeightLb: build_weight_lb,
  });
  const systemsPrimaryLabel = 'SYSTEM STATE';
  const systemsPrimaryValue = faultReason
    ? 'CRITICAL'
    : hasLiveTelemetry
      ? 'READY'
      : hasGraceData
        ? 'STALE'
        : 'PROFILE';
  const systemsPrimaryTone: WidgetStateKind =
    faultReason
      ? 'critical'
      : hasLiveTelemetry
        ? 'live'
        : hasGraceData
          ? 'stale'
          : 'degraded';
  const systemsFooterTone =
    faultReason
      ? 'critical'
      : hasGraceData
        ? 'stale'
        : !showLiveData
          ? 'degraded'
          : systemsSummary.footer?.tone ?? 'neutral';
  const systemsFooterText =
    faultReason
      ? faultReason
      : hasGraceData
        ? 'Last known telemetry'
        : !showLiveData
          ? powerAvailable
            ? 'Profile + power context'
            : 'Profile context'
          : systemsSummary.footer?.text ?? 'No active faults';
  const systemsReadinessText =
    faultReason
      ? 'Needs attention'
      : hasGraceData
        ? 'Use caution'
        : !showLiveData
          ? 'Profile summary'
          : 'Systems nominal';
  const systemsBandTone = faultReason ? 'critical' : hasGraceData ? 'stale' : !showLiveData ? 'degraded' : 'good';
  const systemsFuelTone =
    currentFuelPercent <= 10 ? 'critical' : currentFuelPercent <= 30 ? 'attention' : 'good';
  if (compact) {
    const compactSummary = faultReason
      ? `Attention: ${faultReason}`
      : hasGraceData
        ? 'Use caution'
        : !showLiveData
          ? 'Profile summary'
          : 'Vehicle ready';
    const compactStatus = currentFuelPercent > 0
      ? `Fuel ${Math.round(currentFuelPercent)}%`
      : powerPct != null
        ? `Batt ${Math.round(powerPct)}%`
        : 'Standby';
    return (
      <WidgetCompactRow
        title="Systems"
        summary={compactSummary}
        tone={systemsBandTone}
        status={compactStatus}
        statusTone={systemsFuelTone}
      />
    );
  }

  // â•â•â• LIVE TELEMETRY MODE â•â•â•
  if (!showLiveData && !has_specs && !powerAvailable) {
    const state = createWidgetStateDescriptor({
      kind: 'misconfigured',
      badgeLabel: 'SETUP REQUIRED',
      primary: 'Setup required',
      secondary: 'Add a vehicle or live power data',
    });
    return (
      <WidgetCardShell badge={getWidgetStateBadge(state.kind, state.badgeLabel)}>
        <WidgetStateMessage state={state} />
      </WidgetCardShell>
    );
  }

  if (!showLiveData && !powerAvailable && systemsActiveItems.length === 0 && build_weight_lb <= 0) {
    const state = createWidgetStateDescriptor({
      kind: 'misconfigured',
      badgeLabel: 'NO PROFILE',
      primary: 'No loadout active',
      secondary: 'Select a vehicle profile',
    });
    return (
      <WidgetCardShell badge={getWidgetStateBadge(state.kind, state.badgeLabel)}>
        <WidgetStateMessage state={state} />
      </WidgetCardShell>
    );
  }

  const vehicleSupportItems: { label: string; value: string; tone: WidgetTone }[] = [
    {
      label: 'Engine',
      value: showLiveData ? engineInfo.label : 'PROFILE',
      tone: showLiveData
        ? (engineInfo.label === 'RUNNING' || engineInfo.label === 'IDLE' ? 'good' : 'neutral')
        : 'neutral' as const,
    },
    {
      label: 'Water',
      value: `${waterGallons.toFixed(1)}g`,
      tone: waterTone,
    },
    {
      label: powerAvailable ? 'Power' : 'Profile',
      value: powerAvailable
        ? (powerPct != null ? `${Math.round(powerPct)}%` : formatPowerFlow(powerInput, powerOutput))
        : mechanicalSummary || (has_specs ? `${Math.round(payload_margin_lb).toLocaleString()} lb margin` : 'Awaiting'),
      tone: powerAvailable ? powerTone : weightTone,
    },
  ];

  return (
    <WidgetCardShell
      badge={
        faultReason
          ? getWidgetStateBadge(systemsState.kind, systemsState.badgeLabel)
          : powerBadge != null && hasLiveTelemetry
            ? { label: powerBadge?.label ?? 'POWER', tone: ecsPower?.is_sustainable ? 'good' : 'attention' }
            : getWidgetStateBadge(systemsState.kind, systemsState.badgeLabel)
      }
      footer={<WidgetMetaLine text={systemsFooterText} tone={systemsFooterTone} />}
    >
      <View style={vehicleSystemsS.cardBody}>
        <View
          style={[
            vehicleSystemsS.readinessBand,
            systemsBandTone === 'critical'
              ? vehicleSystemsS.readinessBandCritical
              : systemsBandTone === 'stale' || systemsBandTone === 'degraded'
                ? vehicleSystemsS.readinessBandDegraded
                : vehicleSystemsS.readinessBandGood,
          ]}
        >
          <View
            style={[
              vehicleSystemsS.readinessDot,
              systemsBandTone === 'critical'
                ? vehicleSystemsS.readinessDotCritical
                : systemsBandTone === 'stale' || systemsBandTone === 'degraded'
                  ? vehicleSystemsS.readinessDotDegraded
                  : vehicleSystemsS.readinessDotGood,
            ]}
          />
          <View style={vehicleSystemsS.readinessMain}>
            <Text style={vehicleSystemsS.readinessLabel}>{systemsPrimaryLabel}</Text>
            <Text
              style={[
                vehicleSystemsS.readinessValue,
                systemsPrimaryTone === 'critical'
                  ? vehicleSystemsS.readinessValueCritical
                  : systemsPrimaryTone === 'stale' || systemsPrimaryTone === 'degraded'
                    ? vehicleSystemsS.readinessValueDegraded
                    : vehicleSystemsS.readinessValueGood,
              ]}
              numberOfLines={1}
            >
              {systemsPrimaryValue}
            </Text>
          </View>
          <Text style={vehicleSystemsS.readinessCaption} numberOfLines={2}>
            {systemsReadinessText}
          </Text>
        </View>

        <WidgetSecondaryRow
          items={[
            {
              label: 'FUEL',
              value: currentFuelPercent != null ? `${Math.round(currentFuelPercent)}%` : '--',
              tone: systemsFuelTone,
            },
            {
              label: battV != null ? 'BATT' : 'LOAD',
              value: battV != null
                ? `${battV.toFixed(1)}V`
                : has_specs
                  ? `${Math.round(payload_margin_lb).toLocaleString()} lb`
                  : '--',
              tone: battV != null ? batteryTone : weightTone,
            },
          ]}
        />
        <WidgetMicroStrip items={vehicleSupportItems} />
      </View>
    </WidgetCardShell>
  );

}, areVehicleSystemsWidgetPropsEqual);

// â”€â”€ Phase 2E: Vehicle Telemetry Widget Styles â”€â”€
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

const vehicleSystemsS = StyleSheet.create({
  cardBody: {
    flex: 1,
    minHeight: 0,
    gap: 6,
    justifyContent: 'space-between',
  },
  readinessBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  readinessBandGood: {
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderColor: 'rgba(76,175,80,0.16)',
  },
  readinessBandDegraded: {
    backgroundColor: 'rgba(255,179,0,0.08)',
    borderColor: 'rgba(255,179,0,0.16)',
  },
  readinessBandCritical: {
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderColor: 'rgba(239,83,80,0.16)',
  },
  readinessDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  readinessDotGood: { backgroundColor: '#4CAF50' },
  readinessDotDegraded: { backgroundColor: '#FFB300' },
  readinessDotCritical: { backgroundColor: '#EF5350' },
  readinessMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  readinessLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  readinessValue: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
    lineHeight: 22,
  },
  readinessValueGood: { color: '#4CAF50' },
  readinessValueDegraded: { color: '#FFB300' },
  readinessValueCritical: { color: '#EF5350' },
  readinessCaption: {
    width: 78,
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    lineHeight: 10,
    textAlign: 'right',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  gridCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  metricTile: {
    width: '48%',
    minHeight: 60,
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
    minHeight: 48,
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  metricTileLabel: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
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
  metricTileHelper: {
    fontSize: 7,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    lineHeight: 9,
  },
});











// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// WIDGET B â€” STABILITY INDEX
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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

  let marginColor: string = TACTICAL.amber;
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
      <WidgetCompactRow
        title="Stability"
        summary={`Roll ${rollDeg.toFixed(1)}° | Pitch ${pitchDeg.toFixed(1)}°`}
        tone={stabilityMargin < 15 ? 'critical' : stabilityMargin < 40 ? 'attention' : 'good'}
        status={`${stabilityMargin.toFixed(0)}% margin`}
        statusTone={stabilityMargin < 15 ? 'critical' : stabilityMargin < 40 ? 'attention' : 'good'}
      />
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CORE 4 WIDGET B â€” ATTITUDE MONITOR
//
// Phase 2 Consistent Styling:
// Card view: exactly 3 MetricRows (Roll, Pitch, Tilt) + sensor badge.
// No inclinometer graphic, subtitle rows, or threshold warnings.
// Detail modal retains full inclinometer visualization.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
const AttitudeMonitorWidget = React.memo(function AttitudeMonitorWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const rollDeg = options?.rollDeg ?? 0;
  const pitchDeg = options?.pitchDeg ?? 0;
  const sensorStatus = options?.sensorStatus || 'OFFLINE';
  const sampleTimestampMs = options?.sampleTimestampMs ?? null;
  const advanced = options?.advancedMode;
  const isFeatured = options?.isFeatured ?? false;
  const isCompressedRow = options?.isCompressedRow ?? false;
  const heroVisual = resolveAttitudeMonitorVehicleVisual(data.activeVehicleContext);
  const displayState = useAttitudeMonitorDisplayState({
    rollDeg,
    pitchDeg,
    sensorStatus,
    sampleTimestampMs,
    advanced,
    sourceOrigin: 'device_sensors',
  });
  const tilt = displayState.tilt ?? 0;
  const critical = displayState.severity === 'warning';
  const warning = displayState.severity === 'caution';
  const tone = displayState.tone;
  const label = displayState.label;
  const statusText = displayState.statusText;
  const postureLabel = displayState.postureLabel;
  const postureInstruction = displayState.postureInstruction;
  const rollColor = displayState.rollColor;
  const pitchColor = displayState.pitchColor;
  const sensorState = useMemo(() => getAttitudeSensorState(sensorStatus), [sensorStatus]);
  const sensorLive = displayState.liveMotion;
  const liveTelemetry = displayState.telemetryHealth === 'live';
  const criticalHapticSent = useRef(false);

  useEffect(() => {
    if (critical && liveTelemetry) {
      if (!criticalHapticSent.current) {
        criticalHapticSent.current = true;
        void hapticWarning();
      }
      return;
    }
    criticalHapticSent.current = false;
  }, [critical, liveTelemetry]);

  const badgeTone =
    sensorLive
      ? tone
      : sensorState.tone === 'attention'
        ? 'attention'
        : 'unavailable';
  const footerTone =
    displayState.telemetryHealth === 'stale'
      ? 'attention'
      : sensorLive
      ? critical
        ? 'critical'
        : warning
          ? 'attention'
          : 'live'
      : sensorState.tone === 'attention'
        ? 'attention'
        : 'unavailable';
  const stageHeight = isFeatured ? (isCompressedRow ? 114 : 146) : (isCompressedRow ? 96 : 122);
  const statusPillTone = critical ? 'critical' : warning ? 'attention' : 'good';
  const statusPillLabel = critical ? 'CRITICAL' : warning ? 'CAUTION' : 'STABLE';

  if (!sensorLive) {
    return (
      <WidgetCardShell
        badge={{ label: sensorState.badgeLabel, tone: badgeTone }}
        footer={<WidgetMetaLine text={sensorState.hint} tone={footerTone} />}
      >
        <AttitudeMonitorSurface
          rollDeg={null}
          pitchDeg={null}
          live={false}
          tone={displayState.tone}
          postureLabel={displayState.postureLabel}
          postureInstruction={displayState.postureInstruction}
          rollColor={TACTICAL.textMuted}
          pitchColor={TACTICAL.textMuted}
          topLabel={!compact ? displayState.sourceChipLabel ?? displayState.badgeLabel : undefined}
          variant={compact ? 'widgetCompact' : 'widget'}
          heroVehicle={heroVisual}
        />
      </WidgetCardShell>
    );
  }

  return (
    <WidgetCardShell
      badge={{ label, tone: badgeTone }}
      footer={<WidgetMetaLine text={displayState.sourceStatusLine ?? displayState.statusText} tone={footerTone} />}
    >
      <AttitudeMonitorSurface
        rollDeg={displayState.displayRollDeg}
        pitchDeg={displayState.displayPitchDeg}
        live={displayState.liveMotion}
        tone={tone}
        postureLabel={postureLabel}
        postureInstruction={postureInstruction}
        rollColor={rollColor}
        pitchColor={pitchColor}
        topLabel={!compact ? displayState.sourceChipLabel ?? undefined : undefined}
        variant={compact ? 'widgetCompact' : 'widget'}
        heroVehicle={heroVisual}
      />
    </WidgetCardShell>
  );

  return (
    <WidgetCardShell
      badge={{ label, tone: badgeTone }}
      footer={<WidgetMetaLine text={sensorStatus === 'CALIBRATED' ? 'Sensor calibrated' : statusText} tone={footerTone} />}
    >
      <View style={[attitudeCardS.body, isCompressedRow && attitudeCardS.bodyCompressed]}>
        <View style={[attitudeCardS.stageWrap, { height: stageHeight }]}>
          <AttitudeOrientationScene
            rollDeg={rollDeg}
            pitchDeg={pitchDeg}
            tone={tone}
            large={isFeatured || !isCompressedRow}
          />
          <View
            style={[
              attitudeCardS.statePill,
              attitudeCardS.statePillTopRight,
              {
                backgroundColor:
                  statusPillTone === 'critical'
                    ? 'rgba(239, 83, 80, 0.16)'
                    : statusPillTone === 'attention'
                      ? 'rgba(255, 179, 0, 0.16)'
                      : 'rgba(102, 187, 106, 0.14)',
                borderColor:
                  statusPillTone === 'critical'
                    ? 'rgba(239, 83, 80, 0.24)'
                    : statusPillTone === 'attention'
                      ? 'rgba(255, 179, 0, 0.22)'
                      : 'rgba(102, 187, 106, 0.2)',
              },
            ]}
          >
            <View
              style={[
                attitudeCardS.statePillDot,
                {
                  backgroundColor:
                    statusPillTone === 'critical'
                      ? TACTICAL.danger
                      : statusPillTone === 'attention'
                        ? '#FFB300'
                        : '#66BB6A',
                },
              ]}
            />
            <Text style={attitudeCardS.statePillText}>{statusPillLabel}</Text>
          </View>
        </View>

        <View style={attitudeCardS.metricsRow}>
          <View style={attitudeCardS.metricCell}>
            <Text style={attitudeCardS.metricLabel}>ROLL</Text>
            <Text style={[attitudeCardS.metricValue, { color: rollColor }]} numberOfLines={1}>
              {rollDeg.toFixed(1)}Â°
            </Text>
          </View>
          <View style={attitudeCardS.metricCell}>
            <Text style={attitudeCardS.metricLabel}>PITCH</Text>
            <Text style={[attitudeCardS.metricValue, { color: pitchColor }]} numberOfLines={1}>
              {pitchDeg.toFixed(1)}Â°
            </Text>
          </View>
        </View>

        <WidgetMicroStrip
          items={[
            { label: 'Tilt', value: `${tilt.toFixed(1)}Â°`, tone: critical ? 'critical' : warning ? 'attention' : 'good' },
            { label: 'Sensor', value: sensorStatus === 'CALIBRATED' ? 'Ready' : 'Live', tone: 'live' },
          ]}
        />
      </View>
    </WidgetCardShell>
  );
}, areAttitudeMonitorWidgetPropsEqual);

const attitudeCardS = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'space-between',
    gap: 5,
  },
  bodyCompressed: {
    gap: 4,
  },
  stageWrap: {
    position: 'relative',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  scene: {
    position: 'relative',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.1)',
  },
  sceneLarge: {
    minHeight: 98,
  },
  sceneGlow: {
    position: 'absolute',
    width: '94%',
    height: '90%',
    borderRadius: 22,
    backgroundColor: 'rgba(212, 175, 55, 0.045)',
  },
  horizonRail: {
    position: 'absolute',
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  horizonWing: {
    flex: 1,
    maxWidth: '32%',
    height: 2,
    backgroundColor: 'rgba(212, 175, 55, 0.24)',
  },
  horizonCore: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    backgroundColor: 'rgba(15,15,15,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  horizonCoreDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  vehicleRig: {
    width: '84%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleImageFrame: {
    width: '100%',
    height: 84,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vehicleImageFrameLarge: {
    height: 96,
  },
  vehicleImage: {
    width: '100%',
    height: '100%',
  },
  groundRow: {
    position: 'absolute',
    bottom: 10,
    width: '82%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  groundSegment: {
    width: '100%',
    height: 3,
    borderRadius: 999,
  },
  groundSegmentSoft: {
    width: '70%',
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(212, 175, 55, 0.16)',
  },
  statePill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  statePillTopRight: {
    top: 8,
    right: 8,
  },
  statePillIdle: {
    backgroundColor: 'rgba(22,22,22,0.72)',
    borderColor: 'rgba(255,255,255,0.06)',
  },
  statePillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statePillText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.9,
    color: TACTICAL.text,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'stretch',
  },
  metricCell: {
    flex: 1,
    minHeight: 34,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.025)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    justifyContent: 'center',
    gap: 2,
  },
  metricLabel: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 0.9,
    color: TACTICAL.textMuted,
  },
  metricValue: {
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 16,
  },
  waitingSummary: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
    minHeight: 30,
  },
  waitingPrimary: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  waitingSecondary: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    lineHeight: 10,
    textAlign: 'center',
  },
});

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// WIDGET â€” MISSION SUSTAINMENT (Advanced Mode)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      <WidgetCompactRow
        title="Sustain"
        summary={limiting ? `${limiting.days.toFixed(1)}d endurance | ${limiting.name}` : 'No sustainment estimate'}
        tone={limiting && missionDays && limiting.days < missionDays ? 'attention' : 'good'}
        status={powerSustainable ? 'Power sustainable' : 'Power limited'}
        statusTone={powerSustainable ? 'good' : 'attention'}
      />
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// WIDGET â€” OPERATIONAL READINESS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      <WidgetCompactRow
        title="Ready"
        summary={`${composite}% readiness`}
        tone={composite >= 80 ? 'good' : composite >= 50 ? 'attention' : 'critical'}
        status={`Gear ${gearPct}% | Fuel ${fuelPct}%`}
        statusTone={composite >= 80 ? 'good' : composite >= 50 ? 'attention' : 'critical'}
      />
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


// â”€â”€ Status Overview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatusOverview({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const compact = options?.compact;
  if (!trip) {
    if (compact) {
      return <WidgetCompactRow title="Mission" summary="No expedition staged" tone="unavailable" />;
    }
    return (
      <WidgetCardShell badge={{ label: 'UNAVAILABLE', tone: 'unavailable' }}>
        <WidgetEmptyState
          primary="No expedition staged"
          secondary="Stage an expedition to load mission timing, team size, and route-ready context."
        />
      </WidgetCardShell>
    );
  }
  const days = trip.start_date && trip.end_date
    ? Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000)
    : null;
  const alerts: string[] = [];
  if (data.riskScore) {
    const avg = (data.riskScore.terrain_complexity + data.riskScore.weather_exposure +
      data.riskScore.remoteness + data.riskScore.recovery_availability + data.riskScore.comms_coverage) / 5;
    if (avg > 3) alerts.push('HIGH RISK');
  }
  if (compact) {
    return (
      <WidgetCompactRow
        title="Mission"
        summary={days ? `${days} day expedition` : (trip.terrain_type || 'Expedition staged')}
        tone={alerts.length > 0 ? 'attention' : 'neutral'}
        status={alerts[0] ?? `Team ${trip.team_size}`}
        statusTone={alerts.length > 0 ? 'attention' : 'neutral'}
      />
    );
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

// â”€â”€ Route Progress â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function RouteProgress({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const wps = data.waypoints;
  const compact = options?.compact;
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
  if (compact) {
    if (!trip || !planned) {
      return (
        <WidgetCompactRow
          title="Progress"
          summary={wps.length > 0 ? `${totalDist.toFixed(1)} mi tracked` : 'No route planned'}
          tone={wps.length > 0 ? 'neutral' : 'unavailable'}
          status={wps.length > 0 ? `${wps.length} waypoints` : undefined}
          statusTone="neutral"
        />
      );
    }
    return (
      <WidgetCompactRow
        title="Progress"
        summary={`${pct}% complete`}
        tone={pct >= 100 ? 'good' : pct >= 65 ? 'attention' : 'live'}
        status={`${totalDist.toFixed(1)}/${planned.toFixed(0)} mi`}
        statusTone={pct >= 100 ? 'good' : 'neutral'}
      />
    );
  }
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

// â”€â”€ Loadout Readiness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function LoadoutReadiness({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const items = data.loadItems;
  const mode = data.activeTrip?.active_mode || 'Trip';
  const compact = options?.compact;
  const active = items.filter(i => !i.deleted_at && (i.mode === mode || i.mode === 'Both'));
  const packed = active.filter(i => i.packed);
  const pct = active.length > 0 ? Math.round((packed.length / active.length) * 100) : 0;
  const color = pct >= 100 ? '#4CAF50' : pct >= 70 ? TACTICAL.amber : TACTICAL.danger;
  if (compact) {
    return (
      <WidgetCompactRow
        title="Loadout"
        summary={active.length > 0 ? `Packed ${packed.length}/${active.length}` : 'No active loadout'}
        tone={pct >= 100 ? 'good' : pct >= 70 ? 'attention' : active.length > 0 ? 'critical' : 'unavailable'}
        status={active.length > 0 ? `${pct}% ready` : mode.toUpperCase()}
        statusTone={pct >= 100 ? 'good' : pct >= 70 ? 'attention' : 'neutral'}
      />
    );
  }
  return (
    <View>
      <Text style={[s.bigMetric, { color }]}>{pct}%</Text>
      <ProgressBar pct={pct} color={color} />
      <MetricRow label="PACKED" value={`${packed.length}/${active.length}`} />
      <MetricRow label="MODE" value={mode.toUpperCase()} />
    </View>
  );
}

// â”€â”€ Water Projection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function WaterProjection({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const compact = options?.compact;
  if (!trip) {
    if (compact) {
      return <WidgetCompactRow title="Water" summary="Awaiting expedition plan" tone="unavailable" />;
    }
    return (
      <WidgetCardShell badge={{ label: 'UNAVAILABLE', tone: 'unavailable' }}>
        <WidgetEmptyState
          primary="No expedition water plan"
          secondary="Stage an expedition to calculate water demand and onboard reserve."
        />
      </WidgetCardShell>
    );
  }
  const waterGal = trip.capac_water_gal;
  const usePerDay = (trip.water_use_per_person_day || 1) * trip.team_size;
  const waterDays = waterGal && usePerDay > 0 ? waterGal / usePerDay : null;
  const missionDays = trip.start_date && trip.end_date
    ? Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000)
    : null;
  const sufficient = waterDays != null && missionDays != null && waterDays >= missionDays;
  const color = sufficient ? '#4CAF50' : TACTICAL.danger;
  if (compact) {
    return (
      <WidgetCompactRow
        title="Water"
        summary={waterDays != null ? `${waterDays.toFixed(1)} day supply` : 'Water plan unavailable'}
        tone={sufficient ? 'good' : waterDays != null ? 'attention' : 'unavailable'}
        status={waterGal ? `${waterGal} gal onboard` : undefined}
        statusTone="neutral"
      />
    );
  }
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

// â”€â”€ Fuel Range â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FuelRange({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const compact = options?.compact;
  if (!trip) {
    if (compact) {
      return <WidgetCompactRow title="Fuel" summary="Awaiting expedition plan" tone="unavailable" />;
    }
    return (
      <WidgetCardShell badge={{ label: 'UNAVAILABLE', tone: 'unavailable' }}>
        <WidgetEmptyState
          primary="No expedition fuel plan"
          secondary="Stage an expedition to calculate fuel range and daily draw."
        />
      </WidgetCardShell>
    );
  }
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
  if (compact) {
    return (
      <WidgetCompactRow
        title="Fuel"
        summary={fuelDays != null ? `${fuelDays.toFixed(1)} day range` : 'Fuel range unavailable'}
        tone={sufficient ? 'good' : fuelDays != null ? 'attention' : 'unavailable'}
        status={rangeMiles ? `${rangeMiles.toFixed(0)} mi est.` : undefined}
        statusTone="neutral"
      />
    );
  }
  return (
    <View>
      <Text style={[s.bigMetric, { color }]}>{fuelDays ? fuelDays.toFixed(1) : '--'}</Text>
      <Text style={s.bigMetricUnit}>days range</Text>
      <MetricRow label="RANGE" value={rangeMiles ? `${rangeMiles.toFixed(0)} mi` : '--'} />
      <MetricRow label="DAILY" value={dailyFuel ? `${dailyFuel.toFixed(2)} gal` : '--'} />
    </View>
  );
}

// â”€â”€ Vehicle Health â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function VehicleHealth({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const compact = options?.compact;
  if (compact) {
    return (
      <WidgetCompactRow
        title="Vehicle"
        summary={trip?.primary_vehicle || 'No vehicle configured'}
        tone={trip ? 'good' : 'unavailable'}
        status={trip?.capac_mpg ? `${trip.capac_mpg} mpg` : trip?.capac_fuel_gal ? `${trip.capac_fuel_gal} gal tank` : undefined}
        statusTone="neutral"
      />
    );
  }
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

// â”€â”€ Emergency Controls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function EmergencyControls({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const contact = trip?.emergency_contact;
  const compact = options?.compact;
  if (compact) {
    return (
      <WidgetCompactRow
        title="Emergency"
        summary={contact || 'Emergency contact not set'}
        tone={contact ? 'attention' : 'unavailable'}
        status={data.syncStatus === 'synced' ? 'Comms online' : 'Limited comms'}
        statusTone={data.syncStatus === 'synced' ? 'good' : 'attention'}
      />
    );
  }
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// WIDGET â€” POWER / ENERGY MONITOR (V2 Enhanced)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function PowerSystems({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  const compact = options?.compact;

  if (!trip) {
    if (compact) {
      return <WidgetCompactRow title="Power" summary="Awaiting expedition power plan" tone="unavailable" status="Idle" statusTone="unavailable" />;
    }
    return (
      <WidgetCardShell badge={{ label: 'UNAVAILABLE', tone: 'unavailable' }}>
        <WidgetEmptyState
          primary="No expedition power plan"
          secondary="Stage an expedition to load battery, solar, and runtime context."
        />
      </WidgetCardShell>
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
      <WidgetCompactRow
        title="Power"
        summary={batteryWh > 0 ? `Battery ${batteryPct}% | Solar ${solarW > 0 ? `${solarW}W` : '--'}` : 'No power telemetry'}
        tone={batteryPct >= 60 ? 'good' : batteryPct >= 30 ? 'attention' : 'critical'}
        status={runtimeHrs > 0 ? `${runtimeHrs}h runtime` : sustainable ? 'Sustainable' : 'Limited'}
        statusTone={sustainable ? 'good' : 'attention'}
      />
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


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CORE 4 WIDGET C â€” SUSTAINABILITY (Phase 5: Single Source of Truth)
//
// Planning mode (no active expedition): editable fuel% + water gal
// Active mode (expedition IN_PROGRESS): read-only display
// On save â†’ consumablesStore persists immediately â†’ weight system
// recalculates â†’ Vehicle Systems widget updates via WidgetGrid
// consumablesStore subscription.
//
// Tank capacity guardrail: if missing, show helper text in editor.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function SustainabilityWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // â”€â”€ ECS Power Summary (bus-backed) â”€â”€
  const ecsPower = getEcsPowerSummary();
  const powerAvailable = !!(ecsPower?.available && ecsPower?.has_devices);
  const powerPct = ecsPower?.battery_percent ?? null;
  const powerInput = ecsPower?.input_watts ?? null;
  const powerOutput = ecsPower?.output_watts ?? null;
  const powerRuntimeMin = ecsPower?.runtime_minutes ?? null;
  const powerFreshness = ecsPower?.freshness ?? 'unavailable';
  const powerStable = !!ecsPower?.is_sustainable;

  // â”€â”€ Resolve vehicle context â”€â”€
  const activeVehicleContext = data.activeVehicleContext ?? getActiveVehicleContext();
  const activeVehicleId = activeVehicleContext.activeVehicleId;
  const spec = activeVehicleContext.spec || null;
  const consumables = useVehicleConsumables(activeVehicleId, activeVehicleContext.consumables ?? undefined);
  const hasActiveVehicle = activeVehicleContext.hasActiveVehicleId;
  const hasFuelContext = Boolean((spec?.fuel_tank_capacity_gal ?? 0) > 0);
  const hasWaterContext = activeVehicleContext.resourceProfile.waterCapacityGal != null;
  const configuredBatteryWh = activeVehicleContext.resourceProfile.batteryUsableWh ?? null;
  const hasConfiguredPowerProfile = configuredBatteryWh != null && configuredBatteryWh > 0;

  // â”€â”€ Current values â”€â”€
  const fuelPct = hasFuelContext ? consumables?.fuel_percent_current ?? null : null;
  const waterGal = hasWaterContext ? consumables?.water_gal_current ?? 0 : null;

  // â”€â”€ Planning vs Active mode â”€â”€
  const alternateFluidValue = formatAlternateFluidValue(consumables);

  // â”€â”€ Est. Range (only if tank capacity + mpg available) â”€â”€
  const tankCapGal = spec?.fuel_tank_capacity_gal ?? 0;
  const trip = data.activeTrip;
  const mpg = trip?.capac_mpg ?? 0;
  const currentFuelGal = tankCapGal > 0 && fuelPct != null ? tankCapGal * (fuelPct / 100) : 0;
  const estRange = currentFuelGal > 0 && mpg > 0 ? Math.round(currentFuelGal * mpg) : null;

  const fuelColor = fuelPct == null ? TACTICAL.textMuted : fuelPct <= 15 ? '#EF5350' : fuelPct <= 30 ? '#FFB74D' : '#4CAF50';
  const waterColor = waterGal != null && waterGal > 0 ? '#4CAF50' : TACTICAL.textMuted;
  const configuredPowerRuntimeMin = hasConfiguredPowerProfile ? Math.round((configuredBatteryWh / 50) * 60) : null;
  const powerPctColor = getPowerPercentColor(powerPct);
  const powerStatusColor = powerFreshness === 'stale' ? '#FFB300' : powerStable ? '#4CAF50' : TACTICAL.amber;
  const powerStatusLabel = powerFreshness === 'stale' ? 'POWER STALE' : powerStable ? 'POWER STABLE' : 'POWER LIMITED';
  const activeExpedition = missionExpeditionStore.getActive();
  const isPlanningMode = activeExpedition == null;
  const powerSummary = formatPowerFlowRow(powerInput, powerOutput);
  const badge = powerAvailable
    ? { label: powerFreshness === 'stale' ? 'POWER STALE' : 'RESOURCE LIVE', tone: powerFreshness === 'stale' ? 'stale' as const : 'live' as const }
    : { label: 'RESOURCE SNAPSHOT', tone: 'neutral' as const };
  void alternateFluidValue;
  void powerSummary;
  void badge;


  if (!hasActiveVehicle) {
    return (
        <View style={core4.body}>
          <EmptyStateMicrocopy
            primary={ECS_STATE_COPY.dashboard.noActiveVehicle.title}
            secondary={ECS_STATE_COPY.dashboard.noActiveVehicle.message}
          />
        </View>
    );
  }

  if (!spec && !powerAvailable && !alternateFluidValue) {
    return (
        <View style={core4.body}>
          <EmptyStateMicrocopy
            primary="Complete resources in Fleet"
            secondary="Fuel, water, or power setup is incomplete."
          />
        </View>
    );
  }

  if (compact) {
    const compactTone =
      powerAvailable && powerPct != null
        ? powerPct <= 20
          ? 'critical'
          : powerFreshness === 'stale' || fuelPct != null && fuelPct <= 30
            ? 'attention'
            : 'good'
        : fuelPct != null && fuelPct <= 15
          ? 'critical'
          : fuelPct != null && fuelPct <= 30
            ? 'attention'
            : 'good';
    if (powerAvailable && powerPct != null) {
      return (
        <WidgetCompactRow
          title="Resources"
          summary={`Power ${Math.round(powerPct)}% | Fuel ${fuelPct != null ? `${fuelPct}%` : '--'}`}
          tone={compactTone}
          status={powerFreshness === 'stale' ? 'Stale' : powerStable ? 'Stable' : 'Limited'}
          statusTone={powerFreshness === 'stale' ? 'stale' : powerStable ? 'good' : 'attention'}
        />
      );
    }
    return (
      <WidgetCompactRow
        title="Resources"
        summary={`Fuel ${fuelPct != null ? `${fuelPct}%` : '--'} | Water ${waterGal != null ? `${Math.round(waterGal)} gal` : '--'}`}
        tone={compactTone}
        status={estRange != null ? `${estRange} mi range` : isPlanningMode ? 'Planning' : 'Snapshot'}
        statusTone={estRange != null ? 'neutral' : 'unavailable'}
      />
    );
  }

  if (!hasActiveVehicle) {
    return (
        <View style={core4.body}>
          <EmptyStateMicrocopy
            primary={ECS_STATE_COPY.dashboard.noActiveVehicle.title}
            secondary={ECS_STATE_COPY.dashboard.noActiveVehicle.message}
          />
        </View>
    );
  }

  if (!spec && !powerAvailable && !hasConfiguredPowerProfile) {
    return (
        <View style={core4.body}>
          <EmptyStateMicrocopy
            primary="Complete resources in Fleet"
            secondary="Fuel, water, or power setup is incomplete."
          />
        </View>
    );
  }

  const ecsPowerSection = powerAvailable && powerPct != null ? (
    <View style={bluWidgetS.section}>
      <View style={[bluWidgetS.badge, {
        backgroundColor: powerFreshness === 'stale'
          ? 'rgba(255,179,0,0.10)'
          : powerStable ? 'rgba(76,175,80,0.10)' : 'rgba(212,160,23,0.12)',
      }]}> 
        <View style={[bluWidgetS.badgeDot, {
          backgroundColor: powerStatusColor,
        }]} />
        <Text style={[bluWidgetS.badgeText, { color: powerStatusColor }]}>{powerStatusLabel}</Text>
        <Text style={bluWidgetS.freshnessText}>{powerFreshness.toUpperCase()}</Text>
      </View>

      <MetricRow
        label="BATTERY"
        value={`${Math.round(powerPct)}%`}
        color={powerPctColor}
      />

      {powerInput != null && powerInput > 0 && (
        <MetricRow
          label="INPUT"
          value={`${Math.round(powerInput)} W`}
          color="#4FC3F7"
        />
      )}

      {powerOutput != null && powerOutput > 0 && (
        <MetricRow
          label="OUTPUT"
          value={`${Math.round(powerOutput)} W`}
          color={TACTICAL.amber}
        />
      )}

      {powerRuntimeMin != null && powerRuntimeMin > 0 && (
        <MetricRow
          label="RUNTIME"
          value={formatMinutesToRuntime(powerRuntimeMin)}
          color={powerRuntimeMin < 60 ? '#EF5350' : powerRuntimeMin < 180 ? '#FFB300' : '#4CAF50'}
        />
      )}
    </View>
  ) : null;

  if (tankCapGal <= 0 && (waterGal == null || waterGal <= 0) && !powerAvailable && !hasConfiguredPowerProfile) {
    return (
        <WidgetCardShell badge={{ label: 'UNAVAILABLE', tone: 'unavailable' }}>
          <WidgetEmptyState primary="Complete vehicle resources in Fleet" secondary="Fuel, water, or power setup is incomplete" />
        </WidgetCardShell>
    );
  }

  const resourceSummary = summarizeResourceStatus({
    fuelPercent: fuelPct ?? 0,
    waterGallons: waterGal ?? 0,
    estRangeMi: estRange,
    powerPercent: powerPct,
    runtimeText: formatMinutesToRuntime(powerAvailable ? powerRuntimeMin : configuredPowerRuntimeMin),
    isPlanningMode,
  });

  if (!spec && (powerAvailable || hasConfiguredPowerProfile)) {
    return (
      <WidgetCardShell
        badge={resourceSummary.badge}
        footer={resourceSummary.footer ? <WidgetMetaLine text={resourceSummary.footer.text} tone={resourceSummary.footer.tone} /> : null}
      >
        <WidgetPrimaryValue
          label={resourceSummary.primaryLabel}
          value={resourceSummary.primaryValue}
          tone={resourceSummary.primaryTone}
        />
        <WidgetSecondaryRow items={resourceSummary.secondary} />
      </WidgetCardShell>
    );
  }

  return (
    <WidgetCardShell
      badge={resourceSummary.badge}
      footer={resourceSummary.footer ? <WidgetMetaLine text={resourceSummary.footer.text} tone={resourceSummary.footer.tone} /> : null}
    >
      <WidgetPrimaryValue
        label={resourceSummary.primaryLabel}
        value={resourceSummary.primaryValue}
        tone={resourceSummary.primaryTone}
      />
      <WidgetSecondaryRow items={resourceSummary.secondary} />
      {hasConfiguredPowerProfile && !powerAvailable ? (
        <WidgetMetaLine
          text={`Configured power ${Math.round(configuredBatteryWh).toLocaleString()} Wh${configuredPowerRuntimeMin ? ` â€¢ Est. ${formatMinutesToRuntime(configuredPowerRuntimeMin)}` : ''}`}
          tone="neutral"
        />
      ) : null}
      {powerAvailable && powerPct != null ? (
        <WidgetMetaLine
          text={`Water ${waterGal != null ? `${waterGal.toFixed(1)} gal` : '--'}${estRange != null ? ` â€¢ Range ${estRange} mi` : ''}`}
          tone={waterGal != null && waterGal > 0 ? 'neutral' : 'attention'}
        />
      ) : (
        <WidgetMetaLine
          text={`Water ${waterGal != null ? `${waterGal.toFixed(1)} gal` : '--'}${estRange != null ? ` â€¢ Range ${estRange} mi` : ''}`}
          tone={waterGal != null && waterGal > 0 ? 'neutral' : 'attention'}
        />
      )}
    </WidgetCardShell>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// CORE 4 WIDGET D â€” PROGRESS
//
// Phase 4.1: Route context via routeStore + GPS with
// automatic waypoint advancement.
//
// Data sources:
//   - routeStore.getActive() â†’ ImportedRoute (waypoints[], total_distance_miles)
//   - options.gpsLatitude/gpsLongitude/gpsSpeedMph/gpsHasFix from useGPSLocation
//   - waypointProgressStore â†’ persisted waypoint index per route
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
//   1) Next: <WaypointName> â€” <X.X> mi
//   2) Remaining: <X.X> mi  (or Total if no GPS)
//   3) ETA: <Xh Xm>
//
// ETA priority:
//   A) GPS speed > 3 mph â†’ remainingMi / speedMph
//   B) Else â†’ remainingMi / 20 mph (conservative default)
//
// Tap â†’ Navigate tab (handled externally in dashboard.tsx)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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

/** Format hours-until-arrival into a field-friendly clock time. */
function formatArrivalClock(hours: number): string {
  const arrival = new Date(Date.now() + Math.max(0, hours) * 60 * 60 * 1000);
  const rawHours = arrival.getHours();
  const minutes = String(arrival.getMinutes()).padStart(2, '0');
  const meridiem = rawHours >= 12 ? 'PM' : 'AM';
  const displayHour = rawHours % 12 || 12;
  return `${displayHour}:${minutes} ${meridiem}`;
}

/** Default average speed for ETA when GPS speed unavailable */
const DEFAULT_AVG_MPH = 20;

/**
 * Calculate remaining distance from current GPS position through
 * remaining waypoints in order (straight-line approximation).
 *
 * remainingMi = haversine(pos â†’ wp[idx]) + haversine(wp[idx] â†’ wp[idx+1]) + ...
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

function calcRemainingWaypointPathMiles(
  waypoints: { lat: number; lon: number }[],
  wpIndex: number,
): number {
  if (waypoints.length < 2 || wpIndex >= waypoints.length) return 0;
  let remaining = 0;
  for (let i = Math.max(0, wpIndex); i < waypoints.length - 1; i += 1) {
    remaining += haversineMi(
      waypoints[i].lat,
      waypoints[i].lon,
      waypoints[i + 1].lat,
      waypoints[i + 1].lon,
    );
  }
  return remaining;
}

function formatRoundedMiles(distanceMiles: number | null): string {
  if (distanceMiles == null || !Number.isFinite(distanceMiles)) return '--';
  return `${Math.max(0, Math.round(distanceMiles))} mi`;
}

function getProgressRouteSummary(params: {
  activeRoute: ReturnType<typeof routeStore.getActive>;
  routeWaypoints: { lat: number; lon: number; name: string | null }[];
  safeWpIndex: number;
  hasGps: boolean;
  gpsLat?: number;
  gpsLon?: number;
  gpsSpeed?: number | null;
  isComplete: boolean;
  totalMi: number;
}): {
  routeLabel: string;
  destinationLabel: string | null;
  remainingMiles: number | null;
  remainingMilesText: string;
  etaText: string;
} {
  const { activeRoute, routeWaypoints, safeWpIndex, hasGps, gpsLat, gpsLon, gpsSpeed, isComplete, totalMi } = params;
  const routeLabel =
    activeRoute?.name?.trim() ||
    activeRoute?.description?.trim() ||
    'Active Route';
  const destinationLabel =
    routeWaypoints.length > 0
      ? routeWaypoints[routeWaypoints.length - 1]?.name || `WP ${routeWaypoints.length}`
      : null;

  let remainingMiles: number | null = null;
  if (routeWaypoints.length > 0) {
    remainingMiles = hasGps && gpsLat != null && gpsLon != null
      ? calcRemainingDistance(routeWaypoints, safeWpIndex, gpsLat, gpsLon)
      : calcRemainingWaypointPathMiles(routeWaypoints, safeWpIndex);
  } else if (totalMi > 0) {
    remainingMiles = totalMi;
  }

  if (isComplete) {
    remainingMiles = 0;
  }

  const etaDistance = remainingMiles ?? (totalMi > 0 ? totalMi : null);
  let etaText = '--';
  if (isComplete) {
    etaText = 'Arrived';
  } else if (etaDistance != null && etaDistance > 0) {
    const speed = gpsSpeed != null && gpsSpeed > 3 ? gpsSpeed : DEFAULT_AVG_MPH;
    etaText = formatArrivalClock(etaDistance / speed);
  }

  return {
    routeLabel,
    destinationLabel,
    remainingMiles,
    remainingMilesText: formatRoundedMiles(remainingMiles),
    etaText,
  };
}

function ProgressWidget({ data: _data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // â”€â”€ Toast for waypoint arrival â”€â”€
  let showToast: ((msg: string) => void) | null = null;
  try {
    const app = useApp();
    showToast = app.showToast;
  } catch {
    // AppContext may not be available in some render paths
  }

  // â”€â”€ Route data from routeStore â”€â”€
  const activeRoute = routeStore.getActive();
  const hasRoute = activeRoute != null;
  const routeId = activeRoute?.id ?? '';
  const totalMi = activeRoute?.total_distance_miles ?? 0;
  const routeWaypoints = React.useMemo(() => activeRoute?.waypoints ?? [], [activeRoute?.waypoints]);
  const hasWaypoints = routeWaypoints.length > 0;
  const maxWpIndex = hasWaypoints ? routeWaypoints.length - 1 : 0;

  // â”€â”€ GPS data from options â”€â”€
  const gpsLat = options?.gpsLatitude;
  const gpsLon = options?.gpsLongitude;
  const gpsSpeed = options?.gpsSpeedMph;
  const hasFix = options?.gpsHasFix ?? false;
  const hasGps = hasFix && gpsLat != null && gpsLon != null;

  // â”€â”€ Waypoint progress tracking (Phase 4.1) â”€â”€
  // Initialize from persisted store; default to 0 for new routes
  const [wpIndex, setWpIndex] = useState(() => {
    if (!routeId) return 0;
    return waypointProgressStore.getIndex(routeId);
  });

  // Ref to prevent duplicate arrival triggers within the same GPS update cycle
  const lastAdvancedIdxRef = useRef(-1);
  // Track previous route ID to detect route changes
  const prevRouteIdRef = useRef(routeId);

  // â”€â”€ Reset progress when active route changes â”€â”€
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

  // â”€â”€ Arrival detection & auto-advancement â”€â”€
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
        // Last waypoint reached â€” mark as reached but don't advance
        waypointProgressStore.advance(routeId, maxWpIndex);
        lastAdvancedIdxRef.current = wpIndex;

        if (showToast) {
          showToast(`Reached ${wpName} \u2014 Route complete`);
        }
      }
    }
  }, [gpsLat, gpsLon, hasGps, hasRoute, hasWaypoints, routeId, wpIndex, maxWpIndex, routeWaypoints, showToast]);

  // â”€â”€ Clamp wpIndex to valid range (failsafe) â”€â”€
  const safeWpIndex = hasWaypoints ? Math.min(wpIndex, maxWpIndex) : 0;

  // â”€â”€ Route completion check â”€â”€
  const isComplete = hasRoute && routeId
    ? waypointProgressStore.isRouteComplete(routeId, routeWaypoints.length)
    : false;

  const progressSummary = getProgressRouteSummary({
    activeRoute,
    routeWaypoints,
    safeWpIndex,
    hasGps,
    gpsLat,
    gpsLon,
    gpsSpeed,
    isComplete,
    totalMi,
  });

  // â•â•â• COMPACT MODE â•â•â•
  if (compact) {
    if (!hasRoute) {
      return (
        <WidgetCompactRow
          title="Progress"
          summary={ECS_STATE_COPY.dashboard.noRouteActive.title}
          tone="unavailable"
        />
      );
    }
    const compactSummary = isComplete
      ? 'Route complete'
      : `${progressSummary.remainingMilesText} remaining`;
    return (
      <WidgetCompactRow
        title="Progress"
        summary={compactSummary}
        tone={isComplete ? 'good' : 'live'}
        status={isComplete ? 'Arrived' : progressSummary.etaText}
        statusTone={isComplete ? 'good' : 'neutral'}
      />
    );
  }

  // â•â•â• FALLBACK: No active route â•â•â•
  if (!hasRoute) {
    return (
        <WidgetCardShell badge={{ label: 'NO ROUTE', tone: 'unavailable' }}>
          <WidgetEmptyState
            primary={ECS_STATE_COPY.dashboard.noRouteActive.title}
            secondary={ECS_STATE_COPY.dashboard.noRouteActive.message}
          />
        </WidgetCardShell>
    );
  }

  // â•â•â• FULL WIDGET: up to 3 lines â•â•â•
  return (
    <WidgetCardShell>
      <View style={progS.faceBody}>
        <Text style={progS.routeLine} numberOfLines={2}>
          On: {progressSummary.routeLabel}
        </Text>
        <View style={progS.statStack}>
          <View style={progS.statRow}>
            <Text style={progS.statLabel}>Remaining</Text>
            <Text style={progS.statValue}>{progressSummary.remainingMilesText}</Text>
          </View>
          <View style={progS.statRow}>
            <Text style={progS.statLabel}>ETA</Text>
            <Text style={progS.statValue}>{progressSummary.etaText}</Text>
          </View>
        </View>
      </View>
    </WidgetCardShell>
  );
}




// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ACTIVE MODE WIDGET A â€” REMOTENESS (v2.0 Phase 3B)
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
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•


const RemotenessWidget = React.memo(function RemotenessWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // â”€â”€ Subscribe to remotenessStore for reactive re-renders â”€â”€
  // Phase 3B: Notifications only fire when output meaningfully changes
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = remotenessStore.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  // â”€â”€ Start/stop store lifecycle on mount/unmount â”€â”€
  // Phase 3B: Store gathers its own signals internally;
  // no feed() call needed from the widget.
  useEffect(() => {
    remotenessStore.start();
    return () => {
      remotenessStore.stop();
    };
  }, []); // mount/unmount only

  // â”€â”€ Read current output from store â”€â”€
  // Phase 3B: Returns a stable cached object reference
  const output = remotenessStore.get();

  // â”€â”€ Empty state: no active expedition â”€â”€
  const activeExpedition = missionExpeditionStore.getActive();
  const hasFix = options?.gpsHasFix ?? false;
  const hasLiveRemotenessContext = hasFix || output.score > 0;

  if (compact) {
    if (!hasLiveRemotenessContext) {
      return <WidgetCompactRow title="Remote" summary="Waiting for GPS" tone="unavailable" />;
    }
    return <WidgetCompactRow title="Remote" summary={output.tier} tone="neutral" status={activeExpedition ? 'Expedition live' : 'GPS live'} statusTone="neutral" />;
  }

  // â”€â”€ Full widget empty states â”€â”€
  if (!hasLiveRemotenessContext) {
    return (
        <WidgetCardShell badge={{ label: 'GPS REQUIRED', tone: 'unavailable' }}>
          <WidgetEmptyState primary="GPS required" secondary="Remoteness becomes live once ECS has a usable location fix." />
        </WidgetCardShell>
    );
  }

  if (!hasFix && output.score === 0) {
    return (
        <WidgetCardShell badge={{ label: 'GPS REQUIRED', tone: 'unavailable' }}>
          <WidgetEmptyState primary="GPS required" secondary="Assessing nearby infrastructure as soon as location is available." />
        </WidgetCardShell>
    );
  }

  const remotenessSummary = summarizeRemoteness({
    active: Boolean(activeExpedition) || hasLiveRemotenessContext,
    hasFix,
    tier: output.tier,
    reason: output.reason,
    connectivityState: output.signals.connectivityState,
    freshness: output.signals.freshness,
  });

  return (
    <WidgetCardShell
      badge={remotenessSummary.badge}
      footer={remotenessSummary.footer ? <WidgetMetaLine text={remotenessSummary.footer.text} tone={remotenessSummary.footer.tone} /> : null}
    >
      <WidgetPrimaryValue
        label={remotenessSummary.primaryLabel}
        value={remotenessSummary.primaryValue}
        tone={remotenessSummary.primaryTone}
      />
      <WidgetSecondaryRow items={remotenessSummary.secondary} />
    </WidgetCardShell>
  );
}, areRemotenessWidgetPropsEqual);



function RemotenessDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  // â”€â”€ Subscribe for live updates â”€â”€
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = remotenessStore.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  // â”€â”€ Phase 4A: Subscribe to Risk Engine updates â”€â”€
  const [, setRiskRev] = useState(0);
  useEffect(() => {
    try {
      const unsub = expeditionRiskStore.subscribe(() => setRiskRev((r: number) => r + 1));
      return unsub;
    } catch { return undefined; }
  }, []);

  const output = remotenessStore.get();
  const { signals } = output;

  // â”€â”€ Elevation complexity from cached store result (Phase 3B) â”€â”€
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

  // â”€â”€ Connectivity display â”€â”€
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

  // â”€â”€ Speed display â”€â”€
  const sustainedStr = signals.sustainedSpeedMph != null
    ? `${signals.sustainedSpeedMph.toFixed(1)} mph`
    : '\u2014';
  const speedActive = signals.speedScore > 0;

  // â”€â”€ Phase 3C: Cache readiness display â”€â”€
  const cacheColor = signals.cacheReady ? '#2196F3' : TACTICAL.textMuted;
  const cacheLabel = signals.cacheReady ? 'READY' : 'NONE';

  // â”€â”€ Phase 3D: Freshness display â”€â”€
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

  // â”€â”€ Phase 4A: Risk Engine data â”€â”€
  let riskEvaluation: any = null;
  let riskState: any = null;
  try {
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

      {/* â”€â”€ Signal A: Elevation complexity â”€â”€ */}
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

      {/* â”€â”€ Signal B: Connectivity (Phase 3D: freshness-aware) â”€â”€ */}
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

      {/* â”€â”€ Signal C: Speed Nuance (Phase 2) â”€â”€ */}
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

      {/* â”€â”€ Phase 4A/4C: Expedition Risk Engine â”€â”€ */}
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

      {/* â”€â”€ Phase 4C: Environmental Risk Inputs â”€â”€ */}
      {(() => {
        let riskSnapshot: ReturnType<typeof expeditionRiskStore.getLastInputSnapshot> | null = null;
        try {
          riskSnapshot = expeditionRiskStore.getLastInputSnapshot();
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

      {/* â”€â”€ Tier Scale â”€â”€ */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>TIER SCALE</Text>
      <MetricRow label="0\u201315" value="NEAR CIVILIZATION" color="#4CAF50" />
      <MetricRow label="16\u201335" value="BACKCOUNTRY" color="#C48A2C" />
      <MetricRow label="36\u201360" value="REMOTE" color="#E67E22" />
      <MetricRow label="61\u201380" value="DEEP REMOTE" color="#EF5350" />
      <MetricRow label="81\u2013100" value="EXTREME" color="#C0392B" />

      {/* â”€â”€ Engine Info â”€â”€ */}
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


















// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ACTIVE MODE WIDGET B â€” EXPEDITION CHANNEL (Phase 6)
//
// Team connectivity and recent expedition activity.
// Solo fallback when no team members detected.
// Tap opens Team / Channel screen (placeholder).
// Active mode only â€” never shown in planning mode.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

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
      <WidgetCompactRow
        title="Channel"
        summary={isSolo ? 'Solo expedition' : `${teamSize} members connected`}
        tone={syncOnline ? 'good' : 'degraded'}
        status={syncOnline ? lastUpdateStr : 'Offline'}
        statusTone={syncOnline ? 'good' : 'degraded'}
      />
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


// â”€â”€ Custom Widget Renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€


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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ECOFLOW POWER WIDGET â€” Unified Power Authority Bridge
//
// Production path: legacy EcoFlow widget type now delegates to the
// unified power system widget so dashboard power rendering flows through
// BluPowerAuthority instead of the legacy direct EcoFlow live hook.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function EcoFlowPowerWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  return compact ? <PowerSystemCompact /> : <PowerSystemCard />;
}


// â”€â”€ EcoFlow Power Widget Styles â”€â”€
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



// â”€â”€ EcoFlow Power Detail Styles â”€â”€
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

  // â”€â”€ Large SOC display â”€â”€
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

  // â”€â”€ Large SOC bar â”€â”€
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

  // â”€â”€ Power flow rows â”€â”€
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

  // â”€â”€ Net power row â”€â”€
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

  // â”€â”€ Solar history â”€â”€
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

  // â”€â”€ Refresh button â”€â”€
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


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HIGHWAY WIDGETS â€” Mode-specific awareness instruments
//
// These widgets render on the Highway dashboard tab.
// They use ECS.highwayBlue as their accent color to
// reinforce the Highway mode color cue system.
//
// Default Highway Widgets:
//   1) Forward Weather   â€” route weather forecast
//   2) Daylight Remaining â€” sunset / civil twilight
//   3) Cell Coverage     â€” signal strength forecast
//
// Library Highway Widgets:
//   4) Wind Monitor      â€” wind speed & direction
//   5) Elevation Profile â€” grade & altitude
//   6) Road Hazards      â€” hazard alerts
//   7) Power Monitor     â€” vehicle electrical
//   8) Sun Glare Forecast â€” glare risk
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

const HWY_ACCENT = ECS.highwayBlue;       // #5B8DEF
const HWY_ACCENT_SOFT = ECS.highwayBlueSoft; // rgba(91,141,239,0.15)

// â”€â”€ Helper: Approximate sunset hour (UTC) for a given day-of-year & latitude â”€â”€
function approxSunsetHour(lat: number, dayOfYear: number): number {
  // Simple sinusoidal model â€” good enough for a dashboard widget
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

function hasMeaningfulWeatherSnapshot(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): boolean {
  return (
    snapshot.current.temp != null ||
    snapshot.current.windSpeed != null ||
    snapshot.current.precipChance != null ||
    Boolean(snapshot.current.condition) ||
    snapshot.alerts.length > 0
  );
}

// â”€â”€ Highway MetricRow with blue accent â”€â”€
function HwyMetricRow({ label, value, color, muted }: { label: string; value: string; color?: string; muted?: boolean }) {
  return (
    <View style={hwyS.metricRow}>
      <Text style={hwyS.metricLabel}>{label}</Text>
      <Text style={[hwyS.metricValue, color ? { color } : null, muted ? { color: TACTICAL.textMuted } : null]}>{value}</Text>
    </View>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HIGHWAY WIDGET 1 â€” FORWARD WEATHER
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function HwyForwardWeatherWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  void data;
  const compact = options?.compact;
  const lastCriticalAlertRef = useRef<string | null>(null);

  const activeRoute = routeStore.getActive();
  const routePoint = activeRoute?.waypoints?.[0];
  const weather = useOperationalWeather({
    gps: {
      lat: options?.gpsLatitude ?? null,
      lng: options?.gpsLongitude ?? null,
      hasFix: options?.gpsHasFix ?? false,
    },
    routeCoordinate: routePoint
      ? { lat: routePoint.lat, lng: routePoint.lon, label: activeRoute?.name || 'Route Origin' }
      : null,
  });
  const snapshot = weather.snapshot;
  const headline = formatWeatherHeadline(snapshot);
  const windLine = formatWeatherWindLine(snapshot);
  const alertLine = formatWeatherAlertLine(snapshot) || 'Operational weather nominal';
  const hasMeaningfulData = hasMeaningfulWeatherSnapshot(snapshot);
  const weatherState = resolveWeatherWidgetState(snapshot);
  const criticalAlertSignature = getCriticalWeatherAlertSignature(snapshot);
  const alertColor = snapshot.alerts[0]?.severity === 'extreme'
    ? '#EF5350'
    : snapshot.alerts[0]?.severity === 'warning'
      ? '#FFB74D'
      : snapshot.status.kind === 'stale' || snapshot.status.kind === 'offline'
        ? TACTICAL.textMuted
        : '#4CAF50';
  const tempCompact = snapshot.current.temp != null ? `${Math.round(snapshot.current.temp)}°` : '--';
  const windCompact = snapshot.current.windSpeed != null ? `${Math.round(snapshot.current.windSpeed)} mph` : '--';
  const precipCompact = snapshot.current.precipChance != null ? `${Math.round(snapshot.current.precipChance)}%` : '--';
  const weatherCompactSummary =
    snapshot.alerts.length > 0
      ? alertLine
      : hasMeaningfulData
        ? `${headline} ${tempCompact}`.trim()
        : weatherState.message.primary;
  const weatherCompactStatus =
    snapshot.alerts.length > 0
      ? (snapshot.current.windSpeed != null && snapshot.current.windSpeed > 0 ? `Wind ${windCompact}` : tempCompact)
      : snapshot.current.precipChance != null && snapshot.current.precipChance >= 30
        ? `Rain ${precipCompact}`
        : snapshot.current.windSpeed != null && snapshot.current.windSpeed > 12
          ? `Wind ${windCompact}`
          : tempCompact;
  const weatherCompactTone =
    snapshot.alerts[0]?.severity === 'extreme'
      ? 'critical'
      : snapshot.alerts.length > 0
        ? 'attention'
        : snapshot.status.kind === 'stale' || snapshot.status.kind === 'offline'
          ? 'stale'
          : 'good';

  useEffect(() => {
    if (!isCriticalWeatherAlert(snapshot) || !criticalAlertSignature) return;
    if (lastCriticalAlertRef.current === criticalAlertSignature) return;
    lastCriticalAlertRef.current = criticalAlertSignature;
    triggerCriticalWeatherHapticBurst();
  }, [criticalAlertSignature, snapshot]);

  if (compact) {
    return (
      <WidgetCompactRow
        title="Weather"
        summary={weatherCompactSummary}
        tone={weatherCompactTone}
        status={weatherCompactStatus}
        statusTone={weatherCompactTone}
      />
    );
  }

  return (
    <HwyForwardWeatherCardBlock
      snapshot={snapshot}
      alertLine={alertLine}
    />
  );

  /*
  if (compact) {
    return (
      <View style={s.compactRow}>
        <View style={s.compactCell}>
          <Text style={s.compactLabel}>TEMP</Text>
          <Text style={[s.compactValue, { color: HWY_ACCENT }]}>{tempF}Â°F</Text>
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
      Status badge
      <View style={[hwyS.statusBadge]}>
        <Ionicons name="cloud-outline" size={10} color={HWY_ACCENT} />
        <Text style={[hwyS.statusText, { color: HWY_ACCENT }]}>{conditions.toUpperCase()}</Text>
      </View>

      <HwyMetricRow label="TEMPERATURE" value={`${tempF}Â°F`} color={tempF > 95 ? '#EF5350' : tempF < 32 ? '#4FC3F7' : HWY_ACCENT} />
      <HwyMetricRow label="WIND" value={`${windMph} mph`} color={windMph > 25 ? '#EF5350' : windMph > 15 ? '#FFB74D' : undefined} />
      {stormDistMi != null ? (
        <HwyMetricRow
          label={snapshot.current.precipType === 'snow' ? 'SNOW CHANCE' : 'RAIN CHANCE'}
          value={`${stormDistMi}%`}
          color={stormDistMi >= 60 ? '#4FC3F7' : '#FFB74D'}
        />
      ) : (
        <HwyMetricRow label="STATUS" value={alertLine.toUpperCase()} color={alertColor} />
      )}
    </View>
  );
  */
}

function HwyForwardWeatherDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  void data;
  const activeRoute = routeStore.getActive();
  const routePoint = activeRoute?.waypoints?.[0];
  const weather = useOperationalWeather({
    gps: {
      lat: options?.gpsLatitude ?? null,
      lng: options?.gpsLongitude ?? null,
      hasFix: options?.gpsHasFix ?? false,
    },
    routeCoordinate: routePoint
      ? { lat: routePoint.lat, lng: routePoint.lon, label: activeRoute?.name || 'Route Origin' }
      : null,
  });
  const snapshot = weather.snapshot;
  const tempF = snapshot.current.temp != null ? Math.round(snapshot.current.temp) : 0;
  const windMph = snapshot.current.windSpeed != null ? Math.round(snapshot.current.windSpeed) : 0;
  const humidity = snapshot.current.humidity != null ? Math.round(snapshot.current.humidity) : 0;
  const visibility = snapshot.current.visibility != null ? Number((snapshot.current.visibility / 1609.34).toFixed(1)) : 0;
  const dewPoint = snapshot.current.feelsLike != null ? Math.round(snapshot.current.feelsLike) : tempF;
  const alertLine = formatWeatherAlertLine(snapshot) || 'Operational weather nominal';

  return (
    <HwyForwardWeatherDetailBlock
      snapshot={snapshot}
      tempF={tempF}
      humidity={humidity}
      visibility={visibility}
      dewPoint={dewPoint}
      windMph={windMph}
      alertLine={alertLine}
    />
  );

  /*
  return (
    <View style={s.detailContainer}>
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>FORWARD WEATHER</Text>
      <HwyMetricRow label="LOCATION" value={snapshot.locationName.toUpperCase()} />
      <HwyMetricRow label="TEMPERATURE" value={`${tempF}Â°F`} />
      <HwyMetricRow label="FEELS LIKE" value={`${tempF - 2}Â°F`} />
      <HwyMetricRow label="DEW POINT" value={`${dewPoint}Â°F`} />
      <HwyMetricRow label="HUMIDITY" value={`${humidity}%`} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>WIND</Text>
      <HwyMetricRow label="SPEED" value={`${windMph} mph`} />
      <HwyMetricRow label="GUSTS" value={snapshot.current.windGust != null ? `${Math.round(snapshot.current.windGust ?? 0)} mph` : '--'} />
      <HwyMetricRow label="DIRECTION" value={snapshot.current.windDirection || '--'} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>VISIBILITY / ALERTS</Text>
      <HwyMetricRow label="RANGE" value={`${visibility} mi`} />
      <HwyMetricRow label="CONDITIONS" value={(snapshot.current.condition || '--').toUpperCase()} color="#4CAF50" />
      <HwyMetricRow label="ALERTS" value={`${snapshot.alerts.length}`} color={snapshot.alerts.length ? '#FFB74D' : '#4CAF50'} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>DATA SOURCE</Text>
      <HwyMetricRow label="SOURCE" value={snapshot.sourceType === 'current_location' ? 'CURRENT LOCATION' : 'ROUTE ORIGIN'} muted />
      <HwyMetricRow label="STATE" value={(snapshot.status.label || 'LIVE').toUpperCase()} muted />
      <HwyMetricRow label="STATUS" value={alertLine.toUpperCase()} muted />
    </View>
  );
  */
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HIGHWAY WIDGET 2 â€” DAYLIGHT REMAINING
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function HwyForwardWeatherCompactBlock({
  headline,
  windLine,
  alertLine,
  alertColor,
  sourceType,
}: {
  headline: string;
  windLine: string;
  alertLine: string;
  alertColor: string;
  sourceType: 'current_location' | 'route_origin' | 'route_segment' | 'cached';
}) {
  return (
    <View style={hwyWeatherCompact.container}>
      <View style={hwyWeatherCompact.headerRow}>
        <Text style={hwyWeatherCompact.headerText} numberOfLines={1}>
          {headline.toUpperCase()}
        </Text>
        <Text style={hwyWeatherCompact.sourceText}>
          {sourceType === 'current_location' ? 'GPS' : sourceType === 'cached' ? 'CACHE' : 'ROUTE'}
        </Text>
      </View>
      <Text style={hwyWeatherCompact.detailLine} numberOfLines={1}>{windLine}</Text>
      <Text style={[hwyWeatherCompact.alertLine, { color: alertColor }]} numberOfLines={1}>
        {alertLine.toUpperCase()}
      </Text>
    </View>
  );
}

const hwyWeatherCompact = StyleSheet.create({
  container: {
    gap: 4,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  headerText: {
    flex: 1,
    fontSize: 10,
    fontWeight: '900',
    color: HWY_ACCENT,
    letterSpacing: 0.6,
  },
  sourceText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.8,
    fontFamily: 'Courier',
  },
  detailLine: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
  },
  alertLine: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
});

const hwyWeatherCardS = StyleSheet.create({
  cardBody: {
    flex: 1,
    minHeight: 0,
    gap: 6,
    justifyContent: 'space-between',
  },
  conditionBand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 50,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  conditionBandCritical: {
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderColor: 'rgba(239,83,80,0.16)',
  },
  conditionBandAttention: {
    backgroundColor: 'rgba(255,179,0,0.08)',
    borderColor: 'rgba(255,179,0,0.16)',
  },
  conditionBandLive: {
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderColor: 'rgba(76,175,80,0.16)',
  },
  conditionMain: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  conditionLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  conditionValue: {
    fontSize: 17,
    fontWeight: '900',
    color: TACTICAL.text,
    lineHeight: 19,
    letterSpacing: 0.3,
  },
  concernTile: {
    minWidth: 74,
    maxWidth: 86,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(0,0,0,0.14)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    gap: 2,
    alignItems: 'flex-end',
  },
  concernLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.9,
  },
  concernValue: {
    fontSize: 12,
    fontWeight: '900',
    lineHeight: 14,
  },
});

function HwyForwardWeatherCardBlock({
  snapshot,
  alertLine,
}: {
  snapshot: ReturnType<typeof useOperationalWeather>['snapshot'];
  alertLine: string;
}) {
  const status = summarizeWeatherStatus(snapshot.status.kind, snapshot.alerts.length > 0);
  const hasMeaningfulData = hasMeaningfulWeatherSnapshot(snapshot);
  const weatherState = resolveWeatherWidgetState(snapshot);

  if (!hasMeaningfulData && snapshot.alerts.length === 0) {
    return (
      <WidgetCardShell badge={weatherState.badge}>
        <WidgetStateMessage state={weatherState.message} />
      </WidgetCardShell>
    );
  }

  const conditionText = (snapshot.current.condition || 'WEATHER').toUpperCase();
  const windSpeed = snapshot.current.windSpeed != null ? Math.round(snapshot.current.windSpeed) : null;
  const precipChance = snapshot.current.precipChance != null ? Math.round(snapshot.current.precipChance) : null;
  const tempValue = snapshot.current.temp != null ? `${Math.round(snapshot.current.temp)}°` : '--';
  const windValue = windSpeed != null ? `${windSpeed} mph` : '--';
  const precipLabel = snapshot.current.precipType === 'snow' ? 'Snow' : 'Rain';
  const precipValue = precipChance != null ? `${precipChance}%` : '--';
  const hasAlert = snapshot.alerts.length > 0;
  const severeAlert = snapshot.alerts[0]?.severity === 'extreme';
  const windConcern = windSpeed != null && windSpeed >= 25;
  const tempConcern = snapshot.current.temp != null && snapshot.current.temp >= 95;
  const precipConcern = precipChance != null && precipChance >= 60;
  const bandTone = severeAlert || tempConcern ? 'critical' : hasAlert || windConcern || precipConcern ? 'attention' : 'live';
  const concernLabel = severeAlert || hasAlert ? 'ALERT' : windConcern ? 'WIND' : precipConcern ? precipLabel.toUpperCase() : 'TEMP';
  const concernValue = severeAlert || hasAlert ? snapshot.alerts[0]?.severity?.toUpperCase() ?? 'ACTIVE' : windConcern ? windValue : precipConcern ? precipValue : tempValue;
  const concernTone = severeAlert || tempConcern ? 'critical' : hasAlert || windConcern || precipConcern ? 'attention' : 'live';

  return (
    <WidgetCardShell
      badge={status}
      footer={<WidgetMetaLine text={alertLine.toUpperCase()} tone={hasAlert ? 'critical' : status.tone} />}
    >
      <View style={hwyWeatherCardS.cardBody}>
        <View
          style={[
            hwyWeatherCardS.conditionBand,
            bandTone === 'critical'
              ? hwyWeatherCardS.conditionBandCritical
              : bandTone === 'attention'
                ? hwyWeatherCardS.conditionBandAttention
                : hwyWeatherCardS.conditionBandLive,
          ]}
        >
          <View style={hwyWeatherCardS.conditionMain}>
            <Text style={hwyWeatherCardS.conditionLabel}>CURRENT</Text>
            <Text style={hwyWeatherCardS.conditionValue} numberOfLines={1}>{conditionText}</Text>
          </View>
          <View style={hwyWeatherCardS.concernTile}>
            <Text style={hwyWeatherCardS.concernLabel}>{concernLabel}</Text>
            <Text
              style={[
                hwyWeatherCardS.concernValue,
                { color: concernTone === 'critical' ? '#EF5350' : concernTone === 'attention' ? '#FFB300' : '#4CAF50' },
              ]}
              numberOfLines={1}
            >
              {concernValue}
            </Text>
          </View>
        </View>

        <WidgetSecondaryRow
          items={[
            {
              label: 'TEMP',
              value: tempValue,
              tone: tempConcern ? 'critical' : 'neutral',
            },
            {
              label: 'WIND',
              value: windValue,
              tone: windConcern ? 'attention' : 'neutral',
            },
          ]}
        />
        <WidgetMicroStrip
          items={[
            { label: precipLabel, value: precipValue, tone: precipConcern ? 'attention' : 'neutral' },
            ...(snapshot.current.windDirection ? [{ label: 'Dir', value: snapshot.current.windDirection, tone: 'neutral' as const }] : []),
            ...(hasAlert ? [{ label: 'Alert', value: 'Active', tone: severeAlert ? 'critical' as const : 'attention' as const }] : []),
          ]}
        />
      </View>
    </WidgetCardShell>
  );
}

function HwyForwardWeatherDetailBlock({
  snapshot,
  tempF,
  humidity,
  visibility,
  dewPoint,
  windMph,
  alertLine,
}: {
  snapshot: ReturnType<typeof useOperationalWeather>['snapshot'];
  tempF: number;
  humidity: number;
  visibility: number;
  dewPoint: number;
  windMph: number;
  alertLine: string;
}) {
  const hasMeaningfulData = hasMeaningfulWeatherSnapshot(snapshot);
  const weatherState = resolveWeatherWidgetState(snapshot);

  if (!hasMeaningfulData && snapshot.alerts.length === 0) {
    return (
      <View style={s.detailContainer}>
        <WidgetDetailStateCard
          title={weatherState.message.primary}
          message={weatherState.message.secondary || 'Weather context is waiting for a usable source.'}
          badgeLabel={weatherState.message.badgeLabel}
          tone={snapshot.status.kind === 'offline' ? 'muted' : snapshot.status.kind === 'stale' ? 'warning' : 'attention'}
          icon="partly-sunny-outline"
          metaLines={[
            snapshot.sourceType === 'current_location'
              ? 'Source current location'
              : snapshot.sourceType === 'cached'
                ? 'Source cached location'
                : 'Source route origin',
            `Location ${snapshot.locationName.toUpperCase()}`,
          ]}
        />
      </View>
    );
  }

  return (
    <View style={s.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="FORWARD WEATHER"
        title={snapshot.locationName.toUpperCase()}
        summary={alertLine.toUpperCase()}
        tone={snapshot.alerts.length ? 'attention' : snapshot.status.kind === 'stale' ? 'warning' : 'live'}
        badges={[
          {
            label: snapshot.sourceType === 'current_location'
              ? 'CURRENT LOCATION'
              : snapshot.sourceType === 'cached'
                ? 'CACHED LOCATION'
                : 'ROUTE ORIGIN',
            tone: snapshot.sourceType === 'cached' ? 'manual' : 'live',
          },
          { label: (snapshot.status.label || 'LIVE').toUpperCase(), tone: snapshot.status.kind === 'stale' ? 'warning' : 'live' },
        ]}
      />
      <HwyMetricRow label="LOCATION" value={snapshot.locationName.toUpperCase()} />
      <HwyMetricRow label="TEMPERATURE" value={snapshot.current.temp != null ? `${tempF}Â°F` : '--'} />
      <HwyMetricRow label="FEELS LIKE" value={snapshot.current.feelsLike != null ? `${dewPoint}Â°F` : '--'} />
      <HwyMetricRow label="HUMIDITY" value={snapshot.current.humidity != null ? `${humidity}%` : '--'} />
      <View style={s.detailDivider} />
      <WidgetDetailSectionTitle>WIND</WidgetDetailSectionTitle>
      <HwyMetricRow label="SPEED" value={snapshot.current.windSpeed != null ? `${windMph} mph` : '--'} />
      <HwyMetricRow label="GUSTS" value={snapshot.current.windGust != null ? `${Math.round(snapshot.current.windGust)} mph` : '--'} />
      <HwyMetricRow label="DIRECTION" value={snapshot.current.windDirection || '--'} />
      <View style={s.detailDivider} />
      <WidgetDetailSectionTitle>PRECIP / VISIBILITY</WidgetDetailSectionTitle>
      <HwyMetricRow
        label={snapshot.current.precipType === 'snow' ? 'SNOW CHANCE' : 'RAIN CHANCE'}
        value={snapshot.current.precipChance != null ? `${Math.round(snapshot.current.precipChance)}%` : '--'}
      />
      <HwyMetricRow label="RANGE" value={snapshot.current.visibility != null ? `${visibility} mi` : '--'} />
      <HwyMetricRow label="CONDITIONS" value={(snapshot.current.condition || '--').toUpperCase()} color="#4CAF50" />
      <HwyMetricRow label="ALERTS" value={`${snapshot.alerts.length}`} color={snapshot.alerts.length ? '#FFB74D' : '#4CAF50'} />
      <View style={s.detailDivider} />
      <WidgetDetailSectionTitle>DATA SOURCE</WidgetDetailSectionTitle>
      <HwyMetricRow
        label="SOURCE"
        value={
          snapshot.sourceType === 'current_location'
            ? 'CURRENT LOCATION'
            : snapshot.sourceType === 'cached'
              ? 'CACHED LOCATION'
              : 'ROUTE ORIGIN'
        }
        muted
      />
      <HwyMetricRow label="STATE" value={(snapshot.status.label || 'LIVE').toUpperCase()} muted />
      <HwyMetricRow label="STATUS" value={alertLine.toUpperCase()} muted />
    </View>
  );
}

function HwyDaylightRemainingWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // Use GPS latitude if available, otherwise default to ~37Â°N (US mid-latitude)
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
      <WidgetCompactRow
        title="Daylight"
        summary={isAfterSunset ? 'Dark' : `${hoursRemaining.toFixed(1)}h daylight left`}
        tone={isAfterSunset ? 'critical' : hoursRemaining < 1 ? 'attention' : 'good'}
        status={sunsetStr}
        statusTone="neutral"
      />
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
      <HwyMetricRow label="LATITUDE" value={`${lat.toFixed(2)}Â°`} />
      <HwyMetricRow label="LONGITUDE" value={`${lon.toFixed(2)}Â°`} />
      <HwyMetricRow label="DAY OF YEAR" value={`${dayOfYear}`} />
      <HwyMetricRow label="TZ OFFSET" value={`UTC${tzOffsetHrs >= 0 ? '+' : ''}${tzOffsetHrs}`} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>MODEL</Text>
      <HwyMetricRow label="METHOD" value="Sinusoidal approx" muted />
      <HwyMetricRow label="ACCURACY" value="\u00B110 min" muted />
    </View>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HIGHWAY WIDGET 3 â€” CELL COVERAGE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function HwyCellCoverageWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const [, setRev] = useState(0);
  useEffect(() => {
    remotenessStore.start();
    const unsub = remotenessStore.subscribe(() => setRev((value) => value + 1));
    return () => {
      unsub();
      remotenessStore.stop();
    };
  }, []);

  const remoteness = remotenessStore.get();
  const signalSummary = summarizeSignal({
    syncStatus: data.syncStatus,
    connectivityState: remoteness.signals.connectivityState,
    remotenessTier: remoteness.tier,
    freshness: remoteness.signals.freshness,
  });
  const syncOnline = signalSummary.primaryValue !== 'OFFLINE';
  const signalColor =
    signalSummary.primaryTone === 'good' || signalSummary.primaryTone === 'live'
      ? '#4CAF50'
      : signalSummary.primaryTone === 'degraded' || signalSummary.primaryTone === 'stale'
        ? '#FFB74D'
        : TACTICAL.textMuted;

  if (compact) {
    return (
      <WidgetCompactRow
        title="Comms"
        summary={signalSummary.primaryValue}
        tone={signalSummary.primaryTone}
        status={signalSummary.secondary[1]?.value ?? 'Status only'}
        statusTone={signalSummary.primaryTone}
      />
    );
  }

  return (
    <WidgetCardShell
      badge={signalSummary.badge}
      footer={signalSummary.footer ? <WidgetMetaLine text={signalSummary.footer.text} tone={signalSummary.footer.tone} /> : null}
    >
      <WidgetPrimaryValue
        label={signalSummary.primaryLabel}
        value={signalSummary.primaryValue}
        tone={signalSummary.primaryTone}
      />
      <WidgetSecondaryRow items={signalSummary.secondary} />
    </WidgetCardShell>
  );
}

function HwyCellCoverageDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const remoteness = remotenessStore.get();
  const signalSummary = summarizeSignal({
    syncStatus: data.syncStatus,
    connectivityState: remoteness.signals.connectivityState,
    remotenessTier: remoteness.tier,
    freshness: remoteness.signals.freshness,
  });
  const syncOnline = signalSummary.primaryValue !== 'OFFLINE';
  const networkValue = syncOnline
    ? (remoteness.signals.connectivityState === 'degraded' ? 'LIMITED' : 'AVAILABLE')
    : 'UNAVAILABLE';
  const confidenceValue =
    remoteness.signals.freshness === 'stale'
      ? 'STALE'
      : syncOnline
        ? 'STATUS ONLY'
        : 'OFFLINE';

  return (
    <View style={s.detailContainer}>
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>COMMS / SIGNAL</Text>
      <HwyMetricRow label="STATUS" value={signalSummary.primaryValue} color={syncOnline ? '#4CAF50' : '#EF5350'} />
      <HwyMetricRow label="NETWORK" value={networkValue} />
      <HwyMetricRow label="REMOTENESS" value={remoteness.tier} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>CONFIDENCE</Text>
      <HwyMetricRow label="LEVEL" value={confidenceValue} />
      <HwyMetricRow label="SYNC" value={data.syncStatus.toUpperCase()} />
      <HwyMetricRow label="FRESHNESS" value={remoteness.signals.freshness.toUpperCase()} />
      <HwyMetricRow label="SUPPORT" value={remoteness.reason} color={TACTICAL.textMuted} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>DATA SOURCE</Text>
      <HwyMetricRow label="SOURCE" value="REMOTENESS + SYNC CONTEXT" muted />
      <HwyMetricRow label="MODE" value="HIGH-LEVEL STATUS" muted />
    </View>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HIGHWAY WIDGET 4 â€” WIND MONITOR
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function HwyWindMonitorWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  void data;
  const compact = options?.compact;
  const activeRoute = routeStore.getActive();
  const routePoint = activeRoute?.waypoints?.[0];
  const weather = useOperationalWeather({
    gps: {
      lat: options?.gpsLatitude ?? null,
      lng: options?.gpsLongitude ?? null,
      hasFix: options?.gpsHasFix ?? false,
    },
    routeCoordinate: routePoint
      ? { lat: routePoint.lat, lng: routePoint.lon, label: activeRoute?.name || 'Route Origin' }
      : null,
  });
  const snapshot = weather.snapshot;
  const windMph = snapshot.current.windSpeed != null ? Math.round(snapshot.current.windSpeed) : null;
  const gustMph = snapshot.current.windGust != null ? Math.round(snapshot.current.windGust) : null;
  const direction = snapshot.current.windDirection || '--';
  const weatherState = resolveWeatherWidgetState(snapshot);
  const windColor =
    windMph == null ? TACTICAL.textMuted :
    windMph > 30 ? '#EF5350' :
    windMph > 20 ? '#FFB74D' :
    HWY_ACCENT;

  if (compact) {
    if (windMph == null && gustMph == null) {
      return <WidgetCompactRow title="Wind" summary={weatherState.message.badgeLabel} tone="unavailable" />;
    }
    return (
      <WidgetCompactRow
        title="Wind"
        summary={`${windMph != null ? `${windMph} mph` : '--'} ${direction}`}
        tone={windMph != null && windMph > 30 ? 'critical' : windMph != null && windMph > 20 ? 'attention' : 'live'}
        status={gustMph != null ? `Gust ${gustMph}` : 'Live'}
        statusTone={windMph != null && windMph > 30 ? 'critical' : windMph != null && windMph > 20 ? 'attention' : 'neutral'}
      />
    );
  }

  if (windMph == null && gustMph == null) {
    return (
      <WidgetCardShell badge={weatherState.badge}>
        <WidgetStateMessage state={weatherState.message} />
      </WidgetCardShell>
    );
  }

  return (
    <WidgetCardShell
      badge={{
        label: windMph != null && windMph > 30 ? 'HIGH WIND' : windMph != null && windMph > 20 ? 'MODERATE WIND' : 'WIND LIVE',
        tone: windMph != null && windMph > 30 ? 'critical' : windMph != null && windMph > 20 ? 'attention' : 'live',
      }}
      footer={
        <WidgetMetaLine
          text={snapshot.sourceType === 'current_location' ? 'GPS weather context' : snapshot.sourceType === 'cached' ? 'Cached weather context' : 'Route weather context'}
          tone={snapshot.sourceType === 'cached' ? 'stale' : 'neutral'}
        />
      }
    >
      <WidgetPrimaryValue
        label="WIND"
        value={windMph != null ? `${windMph} mph` : '--'}
        tone={windMph != null && windMph > 30 ? 'critical' : windMph != null && windMph > 20 ? 'attention' : 'live'}
      />
      <WidgetSecondaryRow
        items={[
          {
            label: 'GUSTS',
            value: gustMph != null ? `${gustMph} mph` : '--',
            tone: gustMph != null && gustMph > 35 ? 'critical' : gustMph != null && gustMph > 25 ? 'attention' : 'neutral',
          },
          {
            label: 'DIR',
            value: direction,
            tone: 'neutral',
          },
        ]}
      />
    </WidgetCardShell>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HIGHWAY WIDGET 5 â€” ELEVATION PROFILE
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function HwyElevationProfileWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const activeRoute = routeStore.getActive();
  const altFt = options?.gpsAltitudeFt ?? null;
  const routeDistance = activeRoute?.total_distance_miles ?? 0;
  const gainFt = activeRoute?.elevation_gain_ft ?? null;
  const grade = gainFt != null && routeDistance > 0
    ? Number(((gainFt / (routeDistance * 5280)) * 100).toFixed(1))
    : null;
  const hazardCount = (activeRoute?.waypoints ?? []).filter((waypoint) => waypoint.waypointType === 'hazard').length;
  const terrainOutlook = getTerrainOutlook({
    gradePercent: grade,
    hazardCount,
    hasRoute: Boolean(activeRoute),
    hasLiveFix: options?.gpsHasFix ?? false,
  });
  const outlookTone = terrainOutlook.tone === 'critical'
    ? 'critical'
    : terrainOutlook.tone === 'attention'
      ? 'attention'
      : terrainOutlook.tone === 'good'
        ? 'good'
        : 'neutral';
  const terrainPrimaryValue = terrainOutlook.label
    .replace('Ahead: ', '')
    .replace('Terrain Risk: ', '');
  const terrainCompactValue = terrainPrimaryValue === 'Awaiting context'
    ? 'Awaiting'
    : terrainPrimaryValue === 'Impassable'
      ? 'Blocked'
      : terrainPrimaryValue;
  const gradeTone = grade != null && Math.abs(grade) >= 8
    ? 'critical'
    : grade != null && Math.abs(grade) >= 5
      ? 'attention'
      : 'neutral';
  const terrainMode = activeRoute ? 'Route' : options?.gpsHasFix ? 'Live' : 'Offline';
  const hazardSummary = activeRoute
    ? hazardCount > 0
      ? `${hazardCount} Haz`
      : 'Clear'
    : '--';
  const terrainFooterText = activeRoute
    ? hazardCount > 0
      ? 'Mapped hazards may affect route movement'
      : 'Active route terrain profile ready'
    : options?.gpsHasFix
      ? 'Using live elevation and grade context'
      : 'Awaiting live terrain context';

  if (compact) {
    const compactSummary = `${terrainCompactValue} | Elev ${altFt != null ? Math.round(altFt).toLocaleString() : '--'} ft`;
    return (
      <WidgetCompactRow
        title="Terrain"
        summary={compactSummary}
        tone={outlookTone}
        status={grade != null ? `Grade ${grade}%` : terrainMode}
        statusTone={gradeTone}
      />
    );
  }

  return (
    <WidgetCardShell
      badge={{ label: activeRoute ? 'ROUTE TERRAIN' : 'LIVE TERRAIN', tone: activeRoute ? 'live' : 'neutral' }}
      footer={<WidgetMetaLine text={terrainFooterText} tone={outlookTone === 'good' ? 'neutral' : outlookTone} />}
    >
      <WidgetPrimaryValue
        label="TERRAIN"
        value={terrainPrimaryValue}
        tone={outlookTone}
      />
      <WidgetSecondaryRow
        items={[
          { label: 'ELEV', value: altFt != null ? `${Math.round(altFt).toLocaleString()} ft` : '--', tone: 'live' },
          { label: 'GRADE', value: grade != null ? `${grade}%` : '--', tone: gradeTone },
        ]}
      />
      <WidgetMicroStrip
        items={[
          { label: 'Mode', value: terrainMode, tone: activeRoute ? 'live' : options?.gpsHasFix ? 'good' : 'neutral' },
          { label: 'Hazards', value: hazardSummary, tone: activeRoute ? (hazardCount > 0 ? 'attention' : 'good') : 'neutral' },
        ]}
      />
    </WidgetCardShell>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HIGHWAY WIDGET 6 â€” ROAD HAZARDS
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function HwyRoadHazardsWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  void data;
  const compact = options?.compact;
  const activeRoute = routeStore.getActive();
  const hazardWaypoints = (activeRoute?.waypoints ?? []).filter((waypoint) => waypoint.waypointType === 'hazard');
  const hazardCount = hazardWaypoints.length;
  const nextHazard = hazardWaypoints[0] ?? null;
  const hasHazardContext = Boolean(activeRoute);
  const statusColor = hazardCount > 0 ? '#FFB74D' : hasHazardContext ? '#4CAF50' : TACTICAL.textMuted;

  if (compact) {
    if (!hasHazardContext) {
      return <WidgetCompactRow title="Hazards" summary="No route hazard feed" tone="unavailable" />;
    }
    return (
      <WidgetCompactRow
        title="Hazards"
        summary={hazardCount > 0 ? `${hazardCount} route hazard${hazardCount > 1 ? 's' : ''}` : 'Route clear'}
        tone={hazardCount > 0 ? 'attention' : 'good'}
        status={nextHazard?.name ?? (hazardCount > 0 ? 'Hazard ahead' : 'Clear')}
        statusTone={hazardCount > 0 ? 'attention' : 'good'}
      />
    );
  }

  if (!hasHazardContext) {
    return (
      <WidgetCardShell badge={{ label: 'UNAVAILABLE', tone: 'unavailable' }}>
        <WidgetEmptyState
          primary="No hazard feed connected"
          secondary="Load a route with mapped hazard waypoints to surface road alerts"
        />
      </WidgetCardShell>
    );
  }

  return (
    <WidgetCardShell
      badge={{
        label: hazardCount > 0 ? `${hazardCount} HAZARD${hazardCount > 1 ? 'S' : ''}` : 'ROUTE CLEAR',
        tone: hazardCount > 0 ? 'attention' : 'good',
      }}
      footer={
        <WidgetMetaLine
          text={hazardCount > 0 ? 'Mapped route hazards require attention' : 'No mapped route hazards on the active route'}
          tone={hazardCount > 0 ? 'attention' : 'neutral'}
        />
      }
    >
      <WidgetPrimaryValue
        label="ACTIVE HAZARDS"
        value={`${hazardCount}`}
        tone={hazardCount > 0 ? 'attention' : 'good'}
      />
      <WidgetSecondaryRow
        items={[
          {
            label: 'NEXT',
            value: nextHazard?.name ?? (hazardCount > 0 ? 'Hazard waypoint' : 'None mapped'),
            tone: hazardCount > 0 ? 'attention' : 'neutral',
          },
          {
            label: 'ROUTE',
            value: activeRoute?.name ?? 'Active route',
            tone: 'neutral',
          },
        ]}
      />
    </WidgetCardShell>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HIGHWAY WIDGET 7 â€” POWER MONITOR
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function HwyPowerMonitorWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  const power = ecsSyncCoordinator.getSummary('power');
  const vehicleHealth = ecsSyncCoordinator.getSummary('vehicle_health');

  const housePct = power?.available ? power.battery_percent ?? null : null;
  const powerInput = power?.available ? power.input_watts ?? null : null;
  const powerOutput = power?.available ? power.output_watts ?? null : null;
  const powerRuntime = power?.available ? power.runtime_minutes ?? null : null;
  const powerFreshness = power?.freshness ?? 'unavailable';
  const powerStable = !!power?.is_sustainable;

  const startBattV = vehicleHealth?.available ? vehicleHealth.battery_voltage ?? null : null;
  const fuelPct = vehicleHealth?.available ? vehicleHealth.fuel_percent ?? null : null;
  const engineStatus = (vehicleHealth?.engine_status ?? 'unknown').toUpperCase();

  const houseColor = getPowerPercentColor(housePct);
  const startBattColor =
    startBattV != null
      ? (startBattV >= 12.4 ? '#4CAF50' : startBattV >= 12.0 ? '#FFB74D' : '#EF5350')
      : TACTICAL.textMuted;
  const fuelColor =
    fuelPct != null
      ? (fuelPct <= 15 ? '#EF5350' : fuelPct <= 30 ? '#FFB74D' : '#4CAF50')
      : TACTICAL.textMuted;

  const netStatus =
    powerFreshness === 'unavailable'
      ? { label: 'OFFLINE', color: TACTICAL.textMuted, icon: 'cloud-offline-outline' }
      : powerFreshness === 'stale'
        ? { label: 'STALE', color: '#FFB300', icon: 'time-outline' }
        : powerStable
          ? { label: 'CHARGING', color: '#4CAF50', icon: 'flash-outline' }
          : ((powerOutput ?? 0) > 0 || (housePct ?? 0) > 0)
            ? { label: 'DRAWING', color: TACTICAL.amber, icon: 'battery-half-outline' }
            : { label: 'IDLE', color: TACTICAL.textMuted, icon: 'pause-outline' };

  if (compact) {
    const compactTone =
      powerFreshness === 'unavailable'
        ? 'unavailable'
        : powerFreshness === 'stale' || (housePct != null && housePct <= 25) || (startBattV != null && startBattV < 12.0)
          ? 'attention'
          : 'good';
    return (
      <WidgetCompactRow
        title="Power"
        summary={`House ${housePct != null ? `${Math.round(housePct)}%` : '--'} | Start ${startBattV != null ? `${startBattV.toFixed(1)}V` : '--'}`}
        tone={compactTone}
        status={netStatus.label}
        statusTone={compactTone}
      />
    );
  }

  return (
    <View style={hwyS.body}>
      <View style={hwyS.statusBadge}>
        <Ionicons name={netStatus.icon as any} size={10} color={netStatus.color} />
        <Text style={[hwyS.statusText, { color: netStatus.color }]}>{netStatus.label}</Text>
      </View>
      <HwyMetricRow
        label="HOUSE BATTERY"
        value={housePct != null ? `${Math.round(housePct)}%` : 'â€”'}
        color={houseColor}
        muted={housePct == null}
      />
      <HwyMetricRow
        label="START BATTERY"
        value={startBattV != null ? `${startBattV.toFixed(1)} V` : 'â€”'}
        color={startBattColor}
        muted={startBattV == null}
      />
      <HwyMetricRow
        label="POWER FLOW"
        value={powerInput != null || powerOutput != null
          ? `IN ${Math.round(powerInput ?? 0)}W / OUT ${Math.round(powerOutput ?? 0)}W`
          : 'â€”'}
        color={netStatus.color}
        muted={powerInput == null && powerOutput == null}
      />
      <HwyMetricRow
        label="RUNTIME"
        value={formatMinutesToRuntime(powerRuntime)}
        color={powerRuntime != null ? (powerStable ? '#4CAF50' : '#FFB300') : TACTICAL.textMuted}
        muted={powerRuntime == null}
      />
      <HwyMetricRow
        label="ENGINE / FUEL"
        value={fuelPct != null ? `${engineStatus} / ${Math.round(fuelPct)}%` : engineStatus}
        color={fuelPct != null ? fuelColor : TACTICAL.textMuted}
        muted={fuelPct == null && engineStatus === 'UNKNOWN'}
      />
    </View>
  );
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// HIGHWAY WIDGET 8 â€” SUN GLARE FORECAST
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
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
      <WidgetCompactRow
        title="Glare"
        summary={glareLevel}
        tone={isGlareRisk ? 'attention' : glareLevel === 'LOW' ? 'good' : 'neutral'}
        status={isGlareRisk ? 'Visor recommended' : 'No action'}
        statusTone={isGlareRisk ? 'attention' : 'neutral'}
      />
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

// â”€â”€ Highway Widget Styles â”€â”€
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


function PremiumWidgetCard({
  widgetId,
  compact,
}: {
  widgetId: string;
  compact?: boolean;
}) {
  const entry = getWidgetEntry(widgetId);

  if (compact) {
    return <WidgetCompactRow title="Pro" summary="Premium widget locked" tone="attention" status="Upgrade" statusTone="attention" />;
  }

  return (
    <WidgetCardShell badge={{ label: 'ECS PRO', tone: 'attention' }}>
      <WidgetPrimaryValue
        label={entry?.display_name || 'Premium Widget'}
        value="Locked"
        tone="attention"
      />
      <WidgetSecondaryRow
        items={[
          { label: 'ACCESS', value: 'Pro Required' },
          { label: 'MODE', value: 'Free Limited' },
        ]}
      />
      <WidgetMetaLine text="Upgrade to enable live premium behavior." tone="neutral" />
    </WidgetCardShell>
  );
}

function PremiumWidgetDetail({ widgetId }: { widgetId: string }) {
  const entry = getWidgetEntry(widgetId);
  return <ProPaywallView compact featureLabel={entry?.display_name || 'This widget'} />;
}

function PremiumAwareWidgetContent({
  widgetId,
  compact,
  children,
}: {
  widgetId: string;
  compact?: boolean;
  children: React.ReactNode;
}) {
  const { operatorInfo } = useApp();
  if (!isPremiumWidget(widgetId) || hasPremiumEntitlement(operatorInfo)) {
    return <>{children}</>;
  }
  return <PremiumWidgetCard widgetId={widgetId} compact={compact} />;
}

function PremiumAwareWidgetDetail({
  widgetId,
  children,
}: {
  widgetId: string;
  children: React.ReactNode;
}) {
  const { operatorInfo } = useApp();
  if (!isPremiumWidget(widgetId) || hasPremiumEntitlement(operatorInfo)) {
    return <>{children}</>;
  }
  return <PremiumWidgetDetail widgetId={widgetId} />;
}

// â”€â”€ Renderer Map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function HwyElevationProfileDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  void data;
  const activeRoute = routeStore.getActive();
  const altFt = options?.gpsAltitudeFt ?? null;
  const hasFix = options?.gpsHasFix ?? false;
  const routeDistance = activeRoute?.total_distance_miles ?? 0;
  const gainFt = activeRoute?.elevation_gain_ft ?? null;
  const grade = gainFt != null && routeDistance > 0
    ? Number(((gainFt / (routeDistance * 5280)) * 100).toFixed(1))
    : null;
  const hazardCount = (activeRoute?.waypoints ?? []).filter((waypoint) => waypoint.waypointType === 'hazard').length;
  const terrainOutlook = getTerrainOutlook({
    gradePercent: grade,
    hazardCount,
    hasRoute: Boolean(activeRoute),
    hasLiveFix: hasFix,
  });
  const terrainSource = resolveDashboardValue<string>([
    {
      source: activeRoute ? 'ai-derived' : 'unavailable',
      value: activeRoute ? 'Route terrain profile' : null,
      detail: activeRoute ? 'AI / navigation-derived route context' : null,
    },
    {
      source: hasFix ? 'live' : 'unavailable',
      value: hasFix ? 'Live GPS terrain context' : null,
      detail: hasFix ? 'Live GPS terrain context' : null,
    },
  ]);

  return (
    <View style={s.detailContainer}>
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>ELEVATION / TERRAIN</Text>
      <HwyMetricRow label="ELEVATION" value={altFt != null ? `${Math.round(altFt).toLocaleString()} ft` : '--'} />
      <HwyMetricRow label="GRADE" value={grade != null ? `${grade}%` : '--'} />
      <HwyMetricRow label="CTX" value={activeRoute ? 'CTX ROUTE' : hasFix ? 'CTX LIVE' : 'CTX OFFLINE'} color={activeRoute ? HWY_ACCENT : hasFix ? '#4CAF50' : TACTICAL.textMuted} />
      <HwyMetricRow label="SOURCE" value={terrainSource?.detail ?? getDashboardSourceLabel(terrainSource?.source ?? 'unavailable')} muted={!terrainSource || !isDashboardLiveSource(terrainSource.source)} />
      <HwyMetricRow label="AHEAD" value={terrainOutlook.label.replace('Ahead: ', '').replace('Terrain Risk: ', '')} color={terrainOutlook.tone === 'critical' ? '#EF5350' : terrainOutlook.tone === 'attention' ? '#FFB74D' : terrainOutlook.tone === 'good' ? '#4CAF50' : TACTICAL.textMuted} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>ROUTE PROFILE</Text>
      <HwyMetricRow label="ROUTE" value={activeRoute?.name ?? 'No route staged'} muted={!activeRoute} />
      <HwyMetricRow label="DISTANCE" value={routeDistance > 0 ? `${Math.round(routeDistance)} mi` : '--'} muted={!activeRoute} />
      <HwyMetricRow label="GAIN" value={gainFt != null ? `${Math.round(gainFt).toLocaleString()} ft` : '--'} muted={!activeRoute} />
      <HwyMetricRow label="HAZARDS" value={activeRoute ? `${hazardCount}` : '--'} muted={!activeRoute} />
      {!activeRoute ? (
        <>
          <View style={s.detailDivider} />
          <Text style={[s.detailSection, { color: HWY_ACCENT }]}>LIVE CONTEXT</Text>
          <HwyMetricRow label="STATUS" value={hasFix ? 'Using live elevation and grade context' : 'Awaiting live terrain context'} muted={!hasFix} />
        </>
      ) : null}
    </View>
  );
}

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
    case 'status-overview': return <StatusOverview data={data} options={options} />;
    case 'route-progress': return <RouteProgress data={data} options={options} />;
    case 'loadout-readiness': return <LoadoutReadiness data={data} options={options} />;
    case 'water-projection': return <WaterProjection data={data} options={options} />;
    case 'fuel-range': return <FuelRange data={data} options={options} />;
    case 'vehicle-health': return <VehicleHealth data={data} options={options} />;
    case 'emergency-controls': return <EmergencyControls data={data} options={options} />;
    case 'sustainability': return <ResourceStatusWidget data={data} options={options} />;
    case 'progress': return <ProgressWidget data={data} options={options} />;
    case 'navigate-surface': return <NavigateSurfaceDetailView data={data} options={options} />;
    case 'remoteness': return options?.compact ? <RemotenessIndexCompact /> : <RemotenessIndexCard />;
    case 'vehicle-twin': return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="car-sport-outline" size={22} color={TACTICAL.amber} /><Text style={{ color: TACTICAL.amber, fontSize: 9, fontWeight: '800', letterSpacing: 2, marginTop: 6 }}>VEHICLE TWIN</Text><Text style={{ color: '#8A8A7A', fontSize: 8, marginTop: 2 }}>Tap to open</Text></View>;
    case 'ecoflow-power': return <EcoFlowPowerWidget data={data} options={options} />;
    case 'ecs-power':
      return (
        <PremiumAwareWidgetContent widgetId="ecs-power" compact={options?.compact}>
          {options?.compact ? <PowerSystemCompact data={data} /> : <PowerSystemCard data={data} />}
        </PremiumAwareWidgetContent>
      );
    case 'vehicle-telemetry':
      return (
        <PremiumAwareWidgetContent widgetId="vehicle-telemetry" compact={options?.compact}>
          {options?.compact ? <VehicleTelemetryCompact /> : <VehicleTelemetryCard />}
        </PremiumAwareWidgetContent>
      );
    case 'terrain-risk': return options?.compact ? <TerrainRiskCompact /> : <TerrainRiskCard />;
    case 'expedition-risk': return options?.compact ? <ExpeditionRiskCompact /> : <ExpeditionRiskCard />;
    case 'resource-forecast': return options?.compact ? <ResourceForecastCompact /> : <ResourceForecastCard />;
    case 'trip-recorder': return options?.compact ? <TripRecorderCompact /> : <TripRecorderCard />;





    // â”€â”€ Highway Widgets â”€â”€
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
      // â•â•â• PHASE 7: Standardized Telemetry Placeholder System â•â•â•
      // Replaces broken/empty/confusing fallback with clean ECS placeholder.
      // Uses TelemetryPlaceholder component for consistent empty states.
      console.warn(`[WidgetRenderers] Phase 7 fallback for "${type}"`);
      const rStatus = resolveWidgetStatus(type as string);
      const fallbackState =
        rStatus === 'awaiting_data'
          ? createWidgetStateDescriptor({
              kind: 'degraded',
              badgeLabel: 'DATA REQUIRED',
              primary: 'No live source available',
              secondary: 'Connect a supported source or configure fallback data.',
            })
          : rStatus === 'unavailable'
            ? createWidgetStateDescriptor({
                kind: 'unavailable',
                badgeLabel: 'UNAVAILABLE',
                primary: 'Widget unavailable',
                secondary: 'This widget is not available in the current ECS configuration.',
              })
            : createWidgetStateDescriptor({
                kind: 'misconfigured',
                badgeLabel: 'UNSUPPORTED',
                primary: 'Widget temporarily unavailable',
                secondary: 'The dashboard requested a widget that no longer has an active renderer.',
              });
      return (
        <WidgetCardShell badge={getWidgetStateBadge(fallbackState.kind, fallbackState.badgeLabel)}>
          <WidgetStateMessage state={fallbackState} />
        </WidgetCardShell>
      );
    }
  }
}

// â”€â”€ Detail Renderers (expanded view for modal) â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Detail Renderers (expanded view for modal) â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    case 'sustainability': return <ResourceStatusDetail data={data} />;
    case 'progress': return <ProgressDetail data={data} options={options} />;
    case 'navigate-surface': return <NavigateSurfaceWidget data={data} options={options} />;
    case 'remoteness': return <RemotenessIndexDetailView onNavigateToTarget={options?.onRemotenessNavigateToTarget} />;

    case 'expedition-channel': return <ExpeditionChannelDetail data={data} options={options} />;
    case 'ecoflow-power': return <EcoFlowPowerDetail data={data} options={options} />;
    case 'ecs-power':
      return (
        <PremiumAwareWidgetDetail widgetId="ecs-power">
          <PowerSystemDetailView data={data} />
        </PremiumAwareWidgetDetail>
      );
    case 'vehicle-telemetry':
      return (
        <PremiumAwareWidgetDetail widgetId="vehicle-telemetry">
          <VehicleTelemetryDetailView />
        </PremiumAwareWidgetDetail>
      );
    case 'resource-forecast': return <ResourceForecastDetailView />;
    case 'expedition-risk': return <ExpeditionRiskDetailView />;
    case 'trip-recorder': return <TripRecorderDetailView />;






    // â”€â”€ Highway Widget Details â”€â”€
    case 'hwy-forward-weather': return <HwyForwardWeatherDetail data={data} options={options} />;
    case 'hwy-daylight-remaining': return <HwyDaylightRemainingDetail data={data} options={options} />;
    case 'hwy-cell-coverage': return <HwyCellCoverageDetail data={data} options={options} />;
    // Library highway widgets fall through to card view for detail
    case 'hwy-wind-monitor':
    case 'hwy-road-hazards':
    case 'hwy-power-monitor':
    case 'hwy-sun-glare':
      return renderWidgetContent(type, data, options);
    case 'hwy-elevation-profile':
      return <HwyElevationProfileDetail data={data} options={options} />;

    default: return renderWidgetContent(type, data, options);


  }
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// PROGRESS DETAIL (expanded view for modal)
//
// Phase 4.1: Route breakdown using routeStore + waypointProgressStore.
// Shows waypoint list with reached/current/upcoming status,
// total distance, remaining distance, ETA, and progress index.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function ProgressDetail({ data: _data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const activeRoute = routeStore.getActive();

  if (!activeRoute) {
    return (
      <View style={s.detailContainer}>
        <WidgetDetailStateCard
          title="No route staged"
          message="Open Navigate to stage a destination, import a route, or activate a trail for progress tracking."
          badgeLabel="UNAVAILABLE"
          tone="muted"
          icon="navigate-outline"
        />
      </View>
    );
  }

  const routeId = activeRoute.id;
  const routeWaypoints = activeRoute.waypoints;
  const wpCount = routeWaypoints.length;
  const currentIdx = waypointProgressStore.getIndex(routeId);
  const isComplete = waypointProgressStore.isRouteComplete(routeId, wpCount);
  const safeIdx = wpCount > 0 ? Math.min(currentIdx, wpCount - 1) : 0;
  const gpsLat = options?.gpsLatitude;
  const gpsLon = options?.gpsLongitude;
  const gpsSpeed = options?.gpsSpeedMph;
  const hasFix = options?.gpsHasFix ?? false;
  const hasGps = hasFix && gpsLat != null && gpsLon != null;
  const summary = getProgressRouteSummary({
    activeRoute,
    routeWaypoints,
    safeWpIndex: safeIdx,
    hasGps,
    gpsLat,
    gpsLon,
    gpsSpeed,
    isComplete,
    totalMi: activeRoute.total_distance_miles,
  });
  const routeProgressSource = resolveDashboardValue<string>([
    {
      source: hasGps ? 'live' : 'unavailable',
      value: hasGps ? 'Live GPS route tracking' : null,
      detail: hasGps ? 'Live GPS route tracking' : null,
    },
    {
      source: 'ai-derived',
      value: activeRoute ? 'Route plan context' : null,
      detail: activeRoute ? 'Navigation route context' : null,
    },
  ]);

  return (
    <View style={s.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="ROUTE PROGRESS"
        title={summary.routeLabel}
        summary={`${summary.remainingMilesText} remaining with ${summary.etaText} projected.`}
        tone={hasGps ? 'live' : 'manual'}
        badges={[
          {
            label: routeProgressSource?.detail ?? getDashboardSourceLabel(routeProgressSource?.source ?? 'unavailable'),
            tone: hasGps ? 'live' : 'manual',
          },
        ]}
      />
      {!hasGps ? (
        <WidgetDetailStateCard
          title="Using planned route context"
          message="Live GPS is unavailable, so ECS is tracking progress from the active route plan and saved waypoint state."
          badgeLabel="LIMITED LIVE"
          tone="manual"
          icon="locate-outline"
        />
      ) : null}
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>ROUTE STATUS</WidgetDetailSectionTitle>
        <MetricRow label="CURRENT ROUTE" value={summary.routeLabel} />
        <MetricRow
          label="SOURCE"
          value={routeProgressSource?.detail ?? getDashboardSourceLabel(routeProgressSource?.source ?? 'unavailable')}
          color={routeProgressSource ? getDashboardSourceTone(routeProgressSource.source) : TACTICAL.textMuted}
        />
        <MetricRow label="REMAINING" value={summary.remainingMilesText} />
        <MetricRow label="ETA" value={summary.etaText} color={isComplete ? '#4CAF50' : undefined} />
        {summary.destinationLabel ? (
          <MetricRow label="DESTINATION" value={summary.destinationLabel} />
        ) : null}
      </WidgetDetailSectionCard>
    </View>
  );
}







function StatusOverviewDetail({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  if (!trip) {
    return (
      <View style={s.detailContainer}>
        <WidgetDetailStateCard
          title="No active expedition"
          message="Stage an expedition plan to review readiness, terrain, and route support."
          badgeLabel="WAITING FOR PLAN"
          tone="manual"
          icon="map-outline"
        />
      </View>
    );
  }
  const days = trip.start_date && trip.end_date
    ? Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000)
    : null;
  const items = data.loadItems.filter(i => !i.deleted_at);
  const packed = items.filter(i => i.packed);
  const readinessPct = items.length > 0 ? Math.round((packed.length / items.length) * 100) : null;
  return (
    <View style={s.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="EXPEDITION STATUS"
        title={readinessPct != null ? `${readinessPct}% ready` : 'Expedition staged'}
        summary={
          days != null
            ? `${days}-day ${trip.terrain_type || 'field'} plan for ${trip.team_size} with ${data.waypoints.length} waypoint${data.waypoints.length === 1 ? '' : 's'} staged.`
            : `${trip.team_size}-person expedition with ${data.waypoints.length} waypoint${data.waypoints.length === 1 ? '' : 's'} ready for staging.`
        }
        tone={readinessPct != null && readinessPct < 50 ? 'attention' : 'manual'}
        badges={[
          {
            label: data.syncStatus.toUpperCase(),
            tone: data.syncStatus === 'synced' ? 'live' : 'manual',
          },
        ]}
      />
      <View style={s.detailDivider} />
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>READINESS</WidgetDetailSectionTitle>
        <MetricRow label="PACKED" value={`${packed.length}/${items.length}`} />
        <MetricRow label="WAYPOINTS" value={`${data.waypoints.length}`} />
        <MetricRow label="SYNC STATUS" value={data.syncStatus.toUpperCase()} />
      </WidgetDetailSectionCard>
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>MISSION CONTEXT</WidgetDetailSectionTitle>
        <MetricRow label="DURATION" value={days ? `${days} days` : '--'} />
        <MetricRow label="TERRAIN" value={trip.terrain_type || '--'} />
        <MetricRow label="SEASON" value={trip.season || '--'} />
        <MetricRow label="TEAM SIZE" value={`${trip.team_size}`} />
        <MetricRow label="VEHICLE" value={trip.primary_vehicle || '--'} />
      </WidgetDetailSectionCard>
    </View>
  );
}

function FuelRangeDetail({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  if (!trip) {
    return (
      <View style={s.detailContainer}>
        <WidgetDetailStateCard
          title="No active expedition"
          message="Stage an expedition plan to project fuel range and endurance."
          badgeLabel="WAITING FOR PLAN"
          tone="manual"
          icon="speedometer-outline"
        />
      </View>
    );
  }
  const fuelGal = trip.capac_fuel_gal;
  const mpg = trip.capac_mpg;
  const milesPerDay = trip.avg_miles_per_day;
  const dailyFuel = mpg && milesPerDay ? milesPerDay / mpg : null;
  const fuelDays = fuelGal && dailyFuel ? fuelGal / dailyFuel : null;
  const rangeMiles = fuelGal && mpg ? fuelGal * mpg : null;
  return (
    <View style={s.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="FUEL RANGE"
        title={rangeMiles ? `${rangeMiles.toFixed(0)} mi projected range` : 'Fuel projection pending'}
        summary={
          fuelDays
            ? `${fuelDays.toFixed(1)} days of fuel support at ${milesPerDay ? `${milesPerDay} mi/day` : 'the current expedition pace'}.`
            : 'Add tank capacity and daily distance assumptions to project endurance.'
        }
        tone={fuelDays != null && fuelDays < 2 ? 'attention' : 'manual'}
        badges={[{ label: 'EXPEDITION PROFILE', tone: 'manual' }]}
      />
      <View style={s.detailDivider} />
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>CURRENT PROJECTION</WidgetDetailSectionTitle>
        <MetricRow label="RANGE" value={rangeMiles ? `${rangeMiles.toFixed(0)} miles` : '--'} />
        <MetricRow label="ENDURANCE" value={fuelDays ? `${fuelDays.toFixed(1)} days` : '--'} />
        <MetricRow label="DAILY DISTANCE" value={milesPerDay ? `${milesPerDay} mi/day` : '--'} />
      </WidgetDetailSectionCard>
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>PLANNING INPUTS</WidgetDetailSectionTitle>
        <MetricRow label="TANK CAPACITY" value={fuelGal ? `${fuelGal} gal` : '--'} />
        <MetricRow label="FUEL ECONOMY" value={mpg ? `${mpg} mpg` : '--'} />
        <MetricRow label="DAILY CONSUMPTION" value={dailyFuel ? `${dailyFuel.toFixed(2)} gal/day` : '--'} />
      </WidgetDetailSectionCard>
    </View>
  );
}

function WaterProjectionDetail({ data }: { data: WidgetData }) {
  const trip = data.activeTrip;
  if (!trip) {
    return (
      <View style={s.detailContainer}>
        <WidgetDetailStateCard
          title="No active expedition"
          message="Stage an expedition plan to project water endurance for the current crew."
          badgeLabel="WAITING FOR PLAN"
          tone="manual"
          icon="water-outline"
        />
      </View>
    );
  }
  const waterGal = trip.capac_water_gal;
  const usePerPerson = trip.water_use_per_person_day || 1;
  const usePerDay = usePerPerson * trip.team_size;
  const waterDays = waterGal && usePerDay > 0 ? waterGal / usePerDay : null;
  return (
    <View style={s.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="WATER PROJECTION"
        title={waterDays ? `${waterDays.toFixed(1)} days of water` : 'Water projection pending'}
        summary={
          waterDays
            ? `${trip.team_size}-person crew at ${usePerPerson.toFixed(1)} gal per person each day.`
            : 'Add water capacity and crew use assumptions to estimate endurance.'
        }
        tone={waterDays != null && waterDays < 2 ? 'attention' : 'manual'}
        badges={[{ label: 'CREW PROFILE', tone: 'manual' }]}
      />
      <View style={s.detailDivider} />
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>CURRENT PROJECTION</WidgetDetailSectionTitle>
        <MetricRow label="DAYS SUPPLY" value={waterDays ? `${waterDays.toFixed(1)} days` : '--'} />
        <MetricRow label="TOTAL DAILY USE" value={`${usePerDay.toFixed(1)} gal`} />
      </WidgetDetailSectionCard>
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>PLANNING INPUTS</WidgetDetailSectionTitle>
        <MetricRow label="CAPACITY" value={waterGal ? `${waterGal} gal` : '--'} />
        <MetricRow label="PER PERSON / DAY" value={`${usePerPerson.toFixed(1)} gal`} />
        <MetricRow label="TEAM SIZE" value={`${trip.team_size}`} />
      </WidgetDetailSectionCard>
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

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// VEHICLE WEIGHT DETAIL (Phase 4 â€” Single Source of Truth)
//
// Full weight breakdown with header, sections, edge-case messages.
// Opened by tapping Vehicle Systems widget.
// Uses computeFullBuildWeightBreakdown() for ALL weight values.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

// Display-only density constants (not used for calculation â€” that's in weightEngine)
const DISPLAY_FUEL_DENSITY: Record<string, number> = { diesel: 7.1, gas: 6.0 };
const DISPLAY_WATER_DENSITY = 8.34;

function VehicleSystemsDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const advanced = options?.advancedMode;
  const activeVehicleContext = data.activeVehicleContext ?? getActiveVehicleContext();
  const activeVehicleId = activeVehicleContext.activeVehicleId;
  const consumables = useVehicleConsumables(activeVehicleId, activeVehicleContext.consumables ?? undefined);
  const [isEditingWater, setIsEditingWater] = useState(false);
  const [waterDraft, setWaterDraft] = useState('');
  const mechanicalSummary = getMechanicalProfileSummary(activeVehicleContext);
  const loadoutSummary = getLoadoutProfileSummary(activeVehicleContext);
  const hasAccessoryContext =
    activeVehicleContext.accessoryInstalledCount > 0 ||
    activeVehicleContext.accessoryPlannedCount > 0 ||
    Boolean(activeVehicleContext.zoneSummary);

  // â”€â”€ Single source of truth: centralized breakdown â”€â”€
  const itemsWt = getTotalWeightLbs(data.loadItems);
  const bw: BuildWeightBreakdown = computeFullBuildWeightBreakdown(undefined, {
    items_weight_lb: itemsWt,
  });

  // â”€â”€ Destructure all values from the centralized breakdown â”€â”€
  const {
    base_weight_lb, gvwr_lb, hardware_additions_lb,
    fuel_percent_current, fuel_gal_current, fuel_weight_lb,
    fuel_tank_capacity_gal, fuel_type, has_fuel_tank_capacity,
    water_gal_current, water_weight_lb, consumables_weight_lb,
    items_weight_lb, build_weight_lb, payload_margin_lb,
    has_specs, status_tag, status_color, margin_color,
  } = bw;

  // â”€â”€ Items edge-case detection (needs raw item list) â”€â”€
  const activeItems = data.loadItems.filter(i => !i.deleted_at);
  const zeroWeightItems = hasZeroWeightItems(data.loadItems);
  const currentWaterGallons = consumables.water_gal_current ?? water_gal_current ?? 0;
  const waterUpdatedLabel = formatUpdatedLabel(consumables.water_updated_at);
  const waterSourceLabel = formatWaterSourceLabel(consumables.water_source);
  const beginWaterEdit = () => {
    setWaterDraft(currentWaterGallons.toFixed(1));
    setIsEditingWater(true);
  };
  const cancelWaterEdit = () => {
    setWaterDraft('');
    setIsEditingWater(false);
  };
  const saveWaterEdit = () => {
    if (!activeVehicleId) {
      cancelWaterEdit();
      return;
    }
    const parsed = Number(waterDraft);
    consumablesStore.setWaterGal(
      activeVehicleId,
      Number.isFinite(parsed) ? Math.max(0, parsed) : currentWaterGallons,
      'manual',
    );
    setIsEditingWater(false);
  };

  // Display-only density for fuel type label
  const fuelDensity = DISPLAY_FUEL_DENSITY[fuel_type] ?? 7.1;

  return (
    <View style={s.detailContainer}>
      {/* â•â•â• HEADER â•â•â• */}
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

      {/* â•â•â• 1) VEHICLE BASE â•â•â• */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>1. VEHICLE BASE</Text>
      <MetricRow
        label="BASE WEIGHT"
        value={base_weight_lb > 0 ? `${base_weight_lb.toLocaleString()} lb` : '\u2014'}
      />
      <MetricRow
        label="TIRE SIZE"
        value={activeVehicleContext.tiresLift?.tireSizeInches ? `${activeVehicleContext.tiresLift.tireSizeInches}"` : '\u2014'}
      />
      <MetricRow
        label="SUSPENSION"
        value={
          activeVehicleContext.tiresLift?.suspensionLiftInches
            ? `${activeVehicleContext.tiresLift.suspensionLiftInches}" Lift`
            : activeVehicleContext.tiresLift?.isLeveled
              ? 'Leveled'
              : 'Stock'
        }
      />
      {hardware_additions_lb > 0 && (
        <MetricRow
          label="HARDWARE ADDITIONS"
          value={`+${hardware_additions_lb.toLocaleString()} lb`}
          color={TACTICAL.textMuted}
        />
      )}
      {mechanicalSummary ? <Text style={detailS.subNote}>{mechanicalSummary}</Text> : null}
      {hasAccessoryContext ? (
        <>
          <View style={s.detailDivider} />
          <Text style={s.detailSection}>1B. MOUNTED SYSTEMS</Text>
          <MetricRow label="INSTALLED" value={`${activeVehicleContext.accessoryInstalledCount}`} />
          <MetricRow label="PLANNED" value={`${activeVehicleContext.accessoryPlannedCount}`} />
          {activeVehicleContext.zoneSummary ? (
            <Text style={detailS.subNote}>{activeVehicleContext.zoneSummary}</Text>
          ) : null}
        </>
      ) : null}

      {/* â•â•â• 2) ITEMS â•â•â• */}
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
            Some items have 0 lb â€” update item weights for accuracy
          </Text>
        </View>
      )}

      {/* â•â•â• 3) CONSUMABLES â•â•â• */}
      {activeVehicleContext.loadout ? (
        <>
          <MetricRow label="LOADOUT" value={activeVehicleContext.loadout.name} />
          {activeVehicleContext.loadout.operating_profile ? (
            <MetricRow
              label="PROFILE"
              value={String(activeVehicleContext.loadout.operating_profile).toUpperCase()}
              color={TACTICAL.amber}
            />
          ) : null}
          {loadoutSummary ? <Text style={detailS.subNote}>{loadoutSummary}</Text> : null}
        </>
      ) : null}

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
            Tank capacity not set â€” fuel weight excluded
          </Text>
        </View>
      )}

      {/* Water */}
      <View style={[detailS.consumableRow, { marginTop: 6 }]}>
        <View style={detailS.consumableLeft}>
          <Text style={detailS.consumableLabel}>WATER</Text>
          {isEditingWater ? (
            <View style={sustS.editorInputRow}>
              <TextInput
                value={waterDraft}
                onChangeText={setWaterDraft}
                placeholder="0.0"
                placeholderTextColor={TACTICAL.textMuted}
                keyboardType="decimal-pad"
                autoFocus
                style={sustS.editorInput}
              />
              <Text style={sustS.editorUnit}>gal</Text>
              <TouchableOpacity style={sustS.editorSaveBtn} onPress={saveWaterEdit}>
                <Ionicons name="checkmark" size={12} color="#000" />
              </TouchableOpacity>
              <TouchableOpacity style={sustS.editorCancelBtn} onPress={cancelWaterEdit}>
                <Ionicons name="close" size={11} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={sustS.tappableValue} onPress={beginWaterEdit} disabled={!activeVehicleId}>
              <Text style={detailS.consumableDetail}>
                {currentWaterGallons > 0 ? `${currentWaterGallons.toFixed(1)} gal` : '0 gal'}
              </Text>
              <Ionicons name="create-outline" size={12} color={TACTICAL.amber} />
            </TouchableOpacity>
          )}
        </View>
        <Text style={[detailS.consumableWeight, { color: water_weight_lb > 0 ? TACTICAL.text : TACTICAL.textMuted }]}>
          {water_weight_lb > 0 ? `${Math.round(water_weight_lb).toLocaleString()} lb` : '0 lb'}
        </Text>
      </View>
      <View style={sustS.helperRow}>
        <Ionicons name="water-outline" size={10} color="#FFB74D" />
        <Text style={sustS.helperText}>{waterSourceLabel} - {waterUpdatedLabel}</Text>
      </View>
      {currentWaterGallons > 0 && (
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

      {/* â•â•â• 4) TOTAL â•â•â• */}
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

      {/* â•â•â• ADVANCED MODE: Axle splits (future) â•â•â• */}
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
  const sampleTimestampMs = options?.sampleTimestampMs ?? null;
  const advanced = options?.advancedMode;
  const displayState = useAttitudeMonitorDisplayState({
    rollDeg,
    pitchDeg,
    sensorStatus,
    sampleTimestampMs,
    advanced,
    sourceOrigin: 'device_sensors',
  });
  const sensorState = useMemo(() => getAttitudeSensorState(sensorStatus), [sensorStatus]);
  const heroVisual = useMemo(
    () => resolveAttitudeMonitorVehicleVisual(data.activeVehicleContext),
    [data.activeVehicleContext],
  );

  return (
    <AttitudeMonitorExpandedView
      displayState={displayState}
      sensorState={sensorState}
      sensorStatus={sensorStatus}
      heroVehicle={heroVisual}
      style={s.attitudeDetailExpanded}
    />
  );
}
function MissionSustainmentDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  if (!trip) {
    return (
      <View style={s.detailContainer}>
        <WidgetDetailStateCard
          title="No active expedition"
          message="Stage an expedition plan to compare fuel, water, and power endurance."
          badgeLabel="WAITING FOR PLAN"
          tone="manual"
          icon="layers-outline"
        />
      </View>
    );
  }
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
  const limitingResource = [
    waterDays != null ? { label: 'Water', days: waterDays } : null,
    fuelDays != null ? { label: 'Fuel', days: fuelDays } : null,
  ].filter(Boolean).sort((a, b) => a!.days - b!.days)[0];
  return (
    <View style={s.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="MISSION SUSTAINMENT"
        title={
          limitingResource
            ? `${limitingResource.label} limits endurance first`
            : 'Sustainment profile pending'
        }
        summary={
          limitingResource
            ? `${limitingResource.days.toFixed(1)} days at the current expedition assumptions, with solar returning ${solarDaily ? `${solarDaily.toFixed(0)} Wh/day` : 'limited support'}.`
            : 'Add fuel, water, and power assumptions to build a sustainment projection.'
        }
        tone={limitingResource && limitingResource.days < 2 ? 'attention' : 'manual'}
        badges={[{ label: 'EXPEDITION PROFILE', tone: 'manual' }]}
      />
      <View style={s.detailDivider} />
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>ENDURANCE</WidgetDetailSectionTitle>
        <MetricRow label="WATER ENDURANCE" value={waterDays ? `${waterDays.toFixed(1)} days` : '\u2014'} />
        <MetricRow label="FUEL ENDURANCE" value={fuelDays ? `${fuelDays.toFixed(1)} days` : '\u2014'} />
        <MetricRow label="BATTERY CAPACITY" value={batteryWh ? `${batteryWh} Wh` : '\u2014'} />
      </WidgetDetailSectionCard>
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>DAILY BURN</WidgetDetailSectionTitle>
        <MetricRow label="WATER DAILY" value={`${usePerDay.toFixed(1)} gal/day`} />
        <MetricRow label="FUEL DAILY" value={dailyFuel ? `${dailyFuel.toFixed(2)} gal/day` : '\u2014'} />
        <MetricRow label="SOLAR RETURN" value={solarDaily ? `${solarDaily.toFixed(0)} Wh/day` : '\u2014'} />
      </WidgetDetailSectionCard>
      <WidgetDetailSectionCard tone="muted">
        <WidgetDetailSectionTitle>RESUPPLY</WidgetDetailSectionTitle>
        <MetricRow label="NEXT WATER" value="Not configured" color={TACTICAL.textMuted} />
        <MetricRow label="NEXT FUEL" value="Not configured" color={TACTICAL.textMuted} />
      </WidgetDetailSectionCard>
    </View>
  );
}

function OperationalReadinessDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const trip = data.activeTrip;
  if (!trip) {
    return (
      <View style={s.detailContainer}>
        <WidgetDetailStateCard
          title="No active expedition"
          message="Stage an expedition plan to review active-mode readiness and required gear."
          badgeLabel="WAITING FOR PLAN"
          tone="manual"
          icon="checkmark-done-outline"
        />
      </View>
    );
  }
  const items = data.loadItems.filter(i => !i.deleted_at);
  const mode = trip.active_mode || 'Trip';
  const active = items.filter(i => i.mode === mode || i.mode === 'Both');
  const packed = active.filter(i => i.packed);
  const gearPct = active.length > 0 ? Math.round((packed.length / active.length) * 100) : 0;
  return (
    <View style={s.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="OPERATIONAL READINESS"
        title={`${gearPct}% ready`}
        summary={`${packed.length} of ${active.length} active-mode items packed for ${mode.toLowerCase()} operations.`}
        tone={gearPct >= 80 ? 'live' : gearPct >= 50 ? 'attention' : 'critical'}
        badges={[{ label: mode.toUpperCase(), tone: 'manual' }]}
      />
      <View style={s.detailDivider} />
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>ACTIVE LOADOUT</WidgetDetailSectionTitle>
        <MetricRow label="PACKED" value={`${packed.length}/${active.length}`} />
        <MetricRow label="READINESS" value={`${gearPct}%`} color={gearPct >= 80 ? '#4CAF50' : gearPct >= 50 ? TACTICAL.amber : TACTICAL.danger} />
        <MetricRow label="WAYPOINTS" value={`${data.waypoints.length}`} />
      </WidgetDetailSectionCard>
      <WidgetDetailSectionCard tone="neutral">
        <WidgetDetailSectionTitle>MISSION CONTEXT</WidgetDetailSectionTitle>
        <MetricRow label="MODE" value={mode.toUpperCase()} />
        <MetricRow label="VEHICLE" value={trip.primary_vehicle || '\u2014'} />
        <MetricRow label="TEAM" value={`${trip.team_size}`} />
        <MetricRow label="TERRAIN" value={trip.terrain_type || '\u2014'} />
      </WidgetDetailSectionCard>
    </View>
  );
}



// SUSTAINABILITY DETAIL (expanded view for modal)
// Full consumable breakdown with inline editing.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function SustainabilityDetail({ data }: { data: WidgetData }) {
  const activeVehicleContext = data.activeVehicleContext ?? getActiveVehicleContext();
  const spec = activeVehicleContext.spec || null;
  const consumables = activeVehicleContext.consumables;
  const hasActiveVehicle = activeVehicleContext.hasActiveVehicleId;
  const hasFuelContext = Boolean((spec?.fuel_tank_capacity_gal ?? 0) > 0);
  const hasWaterContext = activeVehicleContext.resourceProfile.waterCapacityGal != null;
  const configuredBatteryWh = activeVehicleContext.resourceProfile.batteryUsableWh ?? null;
  const fuelPct = hasFuelContext ? consumables?.fuel_percent_current ?? null : null;
  const waterGal = hasWaterContext ? consumables?.water_gal_current ?? 0 : null;
  const tankCapGal = spec?.fuel_tank_capacity_gal ?? 0;
  const fuelType = spec?.fuel_type ?? 'diesel';
  const currentFuelGal = tankCapGal > 0 && fuelPct != null ? tankCapGal * (fuelPct / 100) : 0;
  const fuelWeightLb = currentFuelGal * (fuelType === 'diesel' ? 7.1 : 6.0);
  const waterWeightLb = (waterGal ?? 0) * 8.34;
  const configuredPowerRuntimeMin =
    configuredBatteryWh != null && configuredBatteryWh > 0
      ? Math.round((configuredBatteryWh / 50) * 60)
      : null;
  const trip = data.activeTrip;
  const mpg = trip?.capac_mpg ?? 0;
  const estRange = currentFuelGal > 0 && mpg > 0 ? Math.round(currentFuelGal * mpg) : null;

  return (
    <View style={s.detailContainer}>
        {!hasActiveVehicle ? (
          <Text style={s.noData}>Select an active vehicle in Fleet to view resource detail.</Text>
        ) : (
          <>
        <Text style={s.detailSection}>CONSUMABLES</Text>
        <MetricRow
          label="FUEL LEVEL"
          value={fuelPct != null ? `${fuelPct}%` : '\u2014'}
          color={
            fuelPct == null
              ? TACTICAL.textMuted
              : fuelPct <= 15
                ? '#EF5350'
                : fuelPct <= 30
                  ? '#FFB74D'
                  : '#4CAF50'
          }
        />
        {tankCapGal > 0 && <MetricRow label="FUEL VOLUME" value={`${currentFuelGal.toFixed(1)} gal`} />}
        <MetricRow label="FUEL WEIGHT" value={fuelWeightLb > 0 ? `${Math.round(fuelWeightLb)} lb` : '\u2014'} />
        <View style={s.detailDivider} />
        <MetricRow
          label="WATER ON BOARD"
          value={waterGal != null ? `${waterGal} gal` : '\u2014'}
          color={waterGal != null && waterGal > 0 ? '#4CAF50' : TACTICAL.textMuted}
        />
        <MetricRow
          label="WATER WEIGHT"
          value={waterGal != null ? `${Math.round(waterWeightLb)} lb` : '\u2014'}
        />
        <View style={s.detailDivider} />
        <Text style={s.detailSection}>PROJECTIONS</Text>
        <MetricRow label="EST. RANGE" value={estRange ? `${estRange} mi` : '\u2014'} />
        <MetricRow label="TANK CAPACITY" value={tankCapGal > 0 ? `${tankCapGal} gal` : '\u2014'} />
        <MetricRow label="FUEL TYPE" value={fuelType.toUpperCase()} />
        <View style={s.detailDivider} />
        <Text style={s.detailSection}>POWER BASELINE</Text>
        <MetricRow
          label="CONFIGURED CAPACITY"
          value={configuredBatteryWh != null && configuredBatteryWh > 0 ? `${Math.round(configuredBatteryWh).toLocaleString()} Wh` : '\u2014'}
        />
        <MetricRow
          label="EST. RUNTIME"
          value={configuredPowerRuntimeMin != null ? formatMinutesToRuntime(configuredPowerRuntimeMin) : '\u2014'}
        />
        </>
      )}
    </View>
  );
}



// â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ResourceStatusWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const activeVehicleContext = data.activeVehicleContext ?? getActiveVehicleContext();
  const activeVehicleId = activeVehicleContext.activeVehicleId;
  const consumables = useVehicleConsumables(activeVehicleId, activeVehicleContext.consumables ?? undefined);
  const vt = useVehicleTelemetry();
  const spec = activeVehicleContext.spec || null;
  const hasActiveVehicle = activeVehicleContext.hasActiveVehicleId;
  const liveFuel = getVehicleTelemetryFuelSource(vt);
  const fuelResolution = resolveDashboardValue<number>([
    {
      source: liveFuel?.source ?? 'unavailable',
      value: liveFuel?.value,
      detail: liveFuel?.detail,
    },
    {
      source: mapConsumableSourceToDashboardSource(consumables.fuel_source),
      value: spec?.fuel_tank_capacity_gal ? consumables.fuel_percent_current : null,
      detail: getDashboardSourceLabel(mapConsumableSourceToDashboardSource(consumables.fuel_source)),
    },
  ]);
  const fuelPct = fuelResolution?.value ?? null;
  const waterGal = activeVehicleContext.resourceProfile.waterCapacityGal != null ? consumables.water_gal_current : null;
  const alternateFluidValue = formatAlternateFluidValue(consumables);
  const trip = data.activeTrip;
  const fuelTankGal = spec?.fuel_tank_capacity_gal ?? 0;
  const fuelGallons = fuelPct != null ? fuelTankGal * (fuelPct / 100) : 0;
  const estRange = fuelGallons > 0 && (trip?.capac_mpg ?? 0) > 0 ? Math.round(fuelGallons * (trip?.capac_mpg ?? 0)) : null;
  const ecsPower = getEcsPowerSummary();
  const powerPercent = ecsPower?.battery_percent ?? null;
  const powerInput = ecsPower?.input_watts ?? null;
  const powerOutput = ecsPower?.output_watts ?? null;
  const powerSummary = formatPowerFlowRow(powerInput, powerOutput);
  const badge = ecsPower?.available
    ? { label: ecsPower.freshness === 'stale' ? 'POWER STALE' : 'RESOURCE LIVE', tone: ecsPower.freshness === 'stale' ? 'stale' as const : 'live' as const }
    : { label: 'RESOURCE SNAPSHOT', tone: 'neutral' as const };
  const fuelTone =
    fuelPct != null && fuelPct <= 15 ? 'critical' :
    fuelPct != null && fuelPct <= 30 ? 'attention' :
    'good';
  const waterTone =
    waterGal != null && waterGal <= 0 ? 'critical' :
    waterGal != null && waterGal < 5 ? 'attention' :
    'good';
  const powerLevelText = powerPercent != null ? `${Math.round(powerPercent)}%` : powerSummary.text;
  const powerLevelTone =
    powerPercent != null && powerPercent < 20 ? 'critical' :
    powerPercent != null && powerPercent < 40 ? 'attention' :
    powerSummary.tone === 'critical' ? 'critical' :
    powerSummary.tone === 'good' ? 'good' :
    'neutral';
  const inputText = powerInput != null && powerInput > 0 ? `+${Math.round(powerInput)}W` : '--';
  const outputText = powerOutput != null && powerOutput > 0 ? `-${Math.round(powerOutput)}W` : '--';
  const resourceFooterLine = `Fuel ${fuelResolution?.detail ?? getDashboardSourceLabel(fuelResolution?.source ?? 'manual')} â€¢ Water ${formatResourceModeLabel(consumables.water_source)}${alternateFluidValue ? ` â€¢ ${formatAlternateFluidLabel(consumables)} ${formatResourceModeLabel(consumables.alternate_fluid_source)}` : ''}`;
  const resourceFooterText = `Fuel ${fuelResolution?.detail ?? getDashboardSourceLabel(fuelResolution?.source ?? 'manual')} Â· Water ${formatResourceModeLabel(consumables.water_source)}${alternateFluidValue ? ` Â· ${formatAlternateFluidLabel(consumables)} ${formatResourceModeLabel(consumables.alternate_fluid_source)}` : ''}`;
  void resourceFooterText;
  const resourceFooterDisplayLine = `Fuel ${fuelResolution?.detail ?? getDashboardSourceLabel(fuelResolution?.source ?? 'manual')} • Water ${formatResourceModeLabel(consumables.water_source)}${alternateFluidValue ? ` • ${formatAlternateFluidLabel(consumables)} ${formatResourceModeLabel(consumables.alternate_fluid_source)}` : ''}`;

  const resourcePresentation = resolveResourceWidgetPresentation({
    fuelPercent: fuelPct,
    fuelRangeMiles: estRange,
    fuelSourceLabel: fuelResolution?.detail ?? getDashboardSourceLabel(fuelResolution?.source ?? 'manual'),
    fuelSourceTone: fuelResolution ? getDashboardSourceTone(fuelResolution.source) : 'neutral',
    waterGallons: waterGal,
    waterSourceLabel: formatResourceModeLabel(consumables.water_source),
    alternateFluidValue,
    alternateFluidLabel: formatAlternateFluidLabel(consumables),
    alternateFluidSourceLabel: formatResourceModeLabel(consumables.alternate_fluid_source),
    powerPercent,
    powerRuntimeMinutes: ecsPower?.runtime_minutes ?? null,
    powerInputWatts: powerInput,
    powerOutputWatts: powerOutput,
    providerTelemetry: data.aiState?.richContext?.resources?.providerTelemetry ?? null,
    forecast: data.aiState?.richContext?.resources?.forecast ?? null,
    aiState: data.aiState ?? null,
    dashboardView: data.aiDashboardView ?? null,
  });

  if (!hasActiveVehicle) {
    if (compact) {
      return <WidgetCompactRow title="Resources" summary="Select active vehicle" tone="unavailable" />;
    }
    return (
      <WidgetCardShell badge={{ label: 'UNAVAILABLE', tone: 'unavailable' }}>
        <WidgetEmptyState primary="Select an active vehicle" secondary="Fleet resources appear here once a vehicle is active." />
      </WidgetCardShell>
    );
  }

  if (compact) {
    return (
      <WidgetCompactRow
        title="Resources"
        summary={resourcePresentation.compact.summary}
        tone={resourcePresentation.compact.tone}
        status={resourcePresentation.compact.status}
        statusTone={resourcePresentation.compact.statusTone}
      />
    );
  }

  return (
    <WidgetCardShell
      badge={resourcePresentation.badge}
      footer={
        <View style={resourceWidgetS.footerStack}>
          {resourcePresentation.rationale ? (
            <WidgetMetaLine text={resourcePresentation.rationale.text} tone={resourcePresentation.rationale.tone} />
          ) : null}
          <WidgetMetaLine
            text={resourcePresentation.footer?.text || resourceFooterDisplayLine}
            tone={resourcePresentation.footer?.tone ?? (fuelResolution?.source === 'manual' ? 'neutral' : 'live')}
          />
        </View>
      }
    >
      <View style={resourceWidgetS.cardBody}>
        <View style={resourceWidgetS.primaryCluster}>
          <View style={resourceWidgetS.fuelHero}>
            <Text style={resourceWidgetS.heroLabel}>{resourcePresentation.heroLabel}</Text>
            <Text style={[resourceWidgetS.heroValue, { color: resourcePresentation.heroTone === 'critical' ? '#EF5350' : resourcePresentation.heroTone === 'attention' || resourcePresentation.heroTone === 'warning' ? '#FFB300' : resourcePresentation.heroTone === 'good' ? '#4CAF50' : TACTICAL.text }]} numberOfLines={1}>
              {resourcePresentation.heroValue}
            </Text>
            <Text style={resourceWidgetS.heroSupport} numberOfLines={1}>
              {resourcePresentation.heroSupport}
            </Text>
          </View>

          <View style={resourceWidgetS.sideStack}>
            <View style={resourceWidgetS.resourceTile}>
              <Text style={resourceWidgetS.tileLabel}>{resourcePresentation.resourceTiles[0]?.label ?? 'WATER'}</Text>
              <Text style={[resourceWidgetS.tileValue, { color: resourcePresentation.resourceTiles[0]?.tone === 'critical' ? '#EF5350' : resourcePresentation.resourceTiles[0]?.tone === 'attention' || resourcePresentation.resourceTiles[0]?.tone === 'warning' ? '#FFB300' : resourcePresentation.resourceTiles[0]?.tone === 'good' ? '#4CAF50' : TACTICAL.text }]} numberOfLines={1}>
                {resourcePresentation.resourceTiles[0]?.value ?? '--'}
              </Text>
            </View>

            <View style={resourceWidgetS.resourceTile}>
              <Text style={resourceWidgetS.tileLabel}>{resourcePresentation.resourceTiles[1]?.label ?? 'POWER'}</Text>
              <Text style={[resourceWidgetS.tileValue, { color: resourcePresentation.resourceTiles[1]?.tone === 'critical' ? '#EF5350' : resourcePresentation.resourceTiles[1]?.tone === 'attention' || resourcePresentation.resourceTiles[1]?.tone === 'warning' ? '#FFB300' : resourcePresentation.resourceTiles[1]?.tone === 'good' ? '#4CAF50' : TACTICAL.text }]} numberOfLines={1}>
                {resourcePresentation.resourceTiles[1]?.value ?? '--'}
              </Text>
            </View>
          </View>
        </View>

        <WidgetMicroStrip
          items={resourcePresentation.microMetrics}
        />
        {alternateFluidValue ? <WidgetMetaLine text={alternateFluidValue} tone="neutral" /> : null}
      </View>
    </WidgetCardShell>
  );
}

function ResourceStatusDetail({ data }: { data: WidgetData }) {
  const activeVehicleContext = data.activeVehicleContext ?? getActiveVehicleContext();
  const activeVehicleId = activeVehicleContext.activeVehicleId;
  const consumables = useVehicleConsumables(activeVehicleId, activeVehicleContext.consumables ?? undefined);
  const vt = useVehicleTelemetry();
  const trip = data.activeTrip;
  const spec = activeVehicleContext.spec || null;
  const ecsPower = getEcsPowerSummary();
  const powerSummary = formatPowerFlowRow(ecsPower?.input_watts ?? null, ecsPower?.output_watts ?? null);
  const liveFuel = getVehicleTelemetryFuelSource(vt);
  const fuelResolution = resolveDashboardValue<number>([
    {
      source: liveFuel?.source ?? 'unavailable',
      value: liveFuel?.value,
      detail: liveFuel?.detail,
    },
    {
      source: mapConsumableSourceToDashboardSource(consumables.fuel_source),
      value: spec?.fuel_tank_capacity_gal ? consumables.fuel_percent_current : null,
      detail: getDashboardSourceLabel(mapConsumableSourceToDashboardSource(consumables.fuel_source)),
    },
  ]);
  const fuelPct = fuelResolution?.value ?? null;
  const waterCapacity = activeVehicleContext.resourceProfile.waterCapacityGal ?? null;
  const fuelTankGal = spec?.fuel_tank_capacity_gal ?? 0;
  const fuelGallons = fuelPct != null ? fuelTankGal * (fuelPct / 100) : 0;
  const fuelRange = fuelGallons > 0 && (trip?.capac_mpg ?? 0) > 0 ? Math.round(fuelGallons * (trip?.capac_mpg ?? 0)) : null;
  const resourcePresentation = resolveResourceWidgetPresentation({
    fuelPercent: fuelPct,
    fuelRangeMiles: fuelRange,
    fuelSourceLabel: fuelResolution?.detail ?? getDashboardSourceLabel(fuelResolution?.source ?? 'manual'),
    fuelSourceTone: fuelResolution ? getDashboardSourceTone(fuelResolution.source) : 'neutral',
    waterGallons: waterCapacity != null ? consumables.water_gal_current : null,
    waterSourceLabel: formatResourceModeLabel(consumables.water_source),
    alternateFluidValue: formatAlternateFluidValue(consumables),
    alternateFluidLabel: formatAlternateFluidLabel(consumables),
    alternateFluidSourceLabel: formatResourceModeLabel(consumables.alternate_fluid_source),
    powerPercent: ecsPower?.battery_percent ?? null,
    powerRuntimeMinutes: ecsPower?.runtime_minutes ?? null,
    powerInputWatts: ecsPower?.input_watts ?? null,
    powerOutputWatts: ecsPower?.output_watts ?? null,
    providerTelemetry: data.aiState?.richContext?.resources?.providerTelemetry ?? null,
    forecast: data.aiState?.richContext?.resources?.forecast ?? null,
    aiState: data.aiState ?? null,
    dashboardView: data.aiDashboardView ?? null,
  });
  const [waterDraft, setWaterDraft] = useState(() => consumables.water_gal_current.toFixed(1));
  const [alternateDraft, setAlternateDraft] = useState(() => consumables.alternate_fluid_current != null ? consumables.alternate_fluid_current.toFixed(1) : '');
  const [alternateCapacityDraft, setAlternateCapacityDraft] = useState(() => consumables.alternate_fluid_capacity != null ? consumables.alternate_fluid_capacity.toFixed(1) : '');

  useEffect(() => {
    setWaterDraft(consumables.water_gal_current.toFixed(1));
  }, [consumables.water_gal_current]);

  useEffect(() => {
    setAlternateDraft(consumables.alternate_fluid_current != null ? consumables.alternate_fluid_current.toFixed(1) : '');
    setAlternateCapacityDraft(consumables.alternate_fluid_capacity != null ? consumables.alternate_fluid_capacity.toFixed(1) : '');
  }, [consumables.alternate_fluid_capacity, consumables.alternate_fluid_current]);

  const saveWater = () => {
    if (!activeVehicleId || consumables.water_source === 'sensor') return;
    const parsed = Number(waterDraft);
    consumablesStore.setWaterGal(activeVehicleId, Number.isFinite(parsed) ? Math.max(0, parsed) : consumables.water_gal_current, 'manual');
  };

  const saveAlternateFluid = () => {
    if (!activeVehicleId || consumables.alternate_fluid_source === 'sensor') return;
    const parsedCurrent = Number(alternateDraft);
    const parsedCapacity = Number(alternateCapacityDraft);
    consumablesStore.setAlternateFluid(activeVehicleId, {
      current: Number.isFinite(parsedCurrent) ? Math.max(0, parsedCurrent) : null,
      capacity: Number.isFinite(parsedCapacity) ? Math.max(0, parsedCapacity) : null,
      label: consumables.alternate_fluid_label ?? 'Propane',
      unit: consumables.alternate_fluid_unit ?? '%',
      source: 'manual',
    });
  };

  if (!activeVehicleContext.hasActiveVehicleId) {
    return (
      <View style={s.detailContainer}>
        <WidgetDetailStateCard
          title="No active vehicle selected"
          message="Select an active vehicle in Fleet to review expedition resources."
          badgeLabel="WAITING FOR PROFILE"
          tone="manual"
          icon="car-sport-outline"
        />
      </View>
    );
  }

  return (
    <View style={s.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow={resourcePresentation.detail.eyebrow}
        title={resourcePresentation.detail.title}
        summary={resourcePresentation.detail.summary}
        tone={
          resourcePresentation.detail.tone === 'critical'
            ? 'critical'
            : resourcePresentation.detail.tone === 'attention' || resourcePresentation.detail.tone === 'warning'
              ? 'attention'
              : resourcePresentation.detail.tone === 'good'
                ? 'live'
                : 'neutral'
        }
        metaLines={[resourcePresentation.detail.sourceLine, resourcePresentation.detail.rationaleLine]}
      />
      <View style={s.detailDivider} />
      <WidgetDetailSectionTitle>PRIMARY STATUS</WidgetDetailSectionTitle>
      <MetricRow label="FUEL" value={fuelPct != null ? `${Math.round(fuelPct)}%` : '--'} />
      <MetricRow label="FUEL RANGE" value={fuelRange != null ? `${fuelRange} mi` : '--'} />
      <MetricRow label="POWER" value={powerSummary.text} color={powerSummary.tone === 'good' ? '#4CAF50' : powerSummary.tone === 'critical' ? '#EF5350' : TACTICAL.text} />
      <MetricRow label="WATER" value={`${consumables.water_gal_current.toFixed(1)} gal`} />
      <MetricRow
        label="FUEL CONTEXT"
        value={fuelResolution?.detail ?? getDashboardSourceLabel(fuelResolution?.source ?? 'unavailable')}
        color={fuelResolution ? getDashboardSourceTone(fuelResolution.source) : TACTICAL.textMuted}
      />
      <MetricRow
        label="POWER CONTEXT"
        value={ecsPower?.available ? (ecsPower.freshness === 'stale' ? 'Last known power bus' : 'Live power bus') : 'Unavailable'}
        color={ecsPower?.available ? (ecsPower.freshness === 'stale' ? '#FFB300' : '#4CAF50') : TACTICAL.textMuted}
      />
      <View style={s.detailDivider} />
      <WidgetDetailSectionTitle>WATER DETAIL</WidgetDetailSectionTitle>
      <View style={resourceDetailS.modeRow}>
        <Text style={resourceDetailS.modeLabel}>Source</Text>
        <View style={resourceDetailS.modeToggle}>
          <TouchableOpacity style={[resourceDetailS.modeButton, consumables.water_source !== 'sensor' && resourceDetailS.modeButtonActive]} onPress={() => activeVehicleId && consumablesStore.setWaterGal(activeVehicleId, consumables.water_gal_current, 'manual')} activeOpacity={0.8}>
            <Text style={[resourceDetailS.modeButtonText, consumables.water_source !== 'sensor' && resourceDetailS.modeButtonTextActive]}>Manual</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[resourceDetailS.modeButton, consumables.water_source === 'sensor' && resourceDetailS.modeButtonActive]} onPress={() => activeVehicleId && consumablesStore.setWaterGal(activeVehicleId, consumables.water_gal_current, 'sensor')} activeOpacity={0.8}>
            <Text style={[resourceDetailS.modeButtonText, consumables.water_source === 'sensor' && resourceDetailS.modeButtonTextActive]}>Automatic</Text>
          </TouchableOpacity>
        </View>
      </View>
      <MetricRow label="CURRENT" value={`${consumables.water_gal_current.toFixed(1)} gal`} />
      <MetricRow label="MODE" value={formatResourceModeLabel(consumables.water_source)} />
      <MetricRow label="UPDATED" value={formatUpdatedLabel(consumables.water_updated_at)} color={TACTICAL.textMuted} />
      {consumables.water_source === 'sensor' ? null : (
        <View style={resourceDetailS.editCard}>
          <Text style={resourceDetailS.editLabel}>Current Water</Text>
          <View style={resourceDetailS.editRow}>
            <TextInput value={waterDraft} onChangeText={setWaterDraft} keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={TACTICAL.textMuted} style={resourceDetailS.input} />
            <Text style={resourceDetailS.unitText}>gal</Text>
            <TouchableOpacity style={resourceDetailS.saveButton} onPress={saveWater} activeOpacity={0.8}>
              <Text style={resourceDetailS.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
          {waterCapacity != null ? <Text style={resourceDetailS.helperText}>Capacity {waterCapacity.toFixed(1)} gal</Text> : null}
        </View>
      )}
      <View style={s.detailDivider} />
      <WidgetDetailSectionTitle>{formatAlternateFluidLabel(consumables).toUpperCase()} DETAIL</WidgetDetailSectionTitle>
      <View style={resourceDetailS.modeRow}>
        <Text style={resourceDetailS.modeLabel}>Source</Text>
        <View style={resourceDetailS.modeToggle}>
          <TouchableOpacity style={[resourceDetailS.modeButton, consumables.alternate_fluid_source !== 'sensor' && resourceDetailS.modeButtonActive]} onPress={() => activeVehicleId && consumablesStore.setAlternateFluid(activeVehicleId, { source: 'manual' })} activeOpacity={0.8}>
            <Text style={[resourceDetailS.modeButtonText, consumables.alternate_fluid_source !== 'sensor' && resourceDetailS.modeButtonTextActive]}>Manual</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[resourceDetailS.modeButton, consumables.alternate_fluid_source === 'sensor' && resourceDetailS.modeButtonActive]} onPress={() => activeVehicleId && consumablesStore.setAlternateFluid(activeVehicleId, { source: 'sensor' })} activeOpacity={0.8}>
            <Text style={[resourceDetailS.modeButtonText, consumables.alternate_fluid_source === 'sensor' && resourceDetailS.modeButtonTextActive]}>Automatic</Text>
          </TouchableOpacity>
        </View>
      </View>
      <MetricRow label="CURRENT" value={formatAlternateFluidValue(consumables) ?? 'No live sensor available'} />
      <MetricRow label="MODE" value={formatResourceModeLabel(consumables.alternate_fluid_source)} />
      <MetricRow label="UPDATED" value={formatUpdatedLabel(consumables.alternate_fluid_updated_at)} color={TACTICAL.textMuted} />
      {consumables.alternate_fluid_source === 'sensor' ? null : (
        <View style={resourceDetailS.editCard}>
          <Text style={resourceDetailS.editLabel}>Alternate Fluid</Text>
          <View style={resourceDetailS.editRow}>
            <TextInput value={alternateDraft} onChangeText={setAlternateDraft} keyboardType="decimal-pad" placeholder="0.0" placeholderTextColor={TACTICAL.textMuted} style={resourceDetailS.input} />
            <Text style={resourceDetailS.unitText}>{consumables.alternate_fluid_unit ?? '%'}</Text>
            <TouchableOpacity style={resourceDetailS.saveButton} onPress={saveAlternateFluid} activeOpacity={0.8}>
              <Text style={resourceDetailS.saveButtonText}>Save</Text>
            </TouchableOpacity>
          </View>
          <View style={resourceDetailS.editRow}>
            <TextInput value={alternateCapacityDraft} onChangeText={setAlternateCapacityDraft} keyboardType="decimal-pad" placeholder="Capacity" placeholderTextColor={TACTICAL.textMuted} style={resourceDetailS.input} />
            <Text style={resourceDetailS.unitText}>{consumables.alternate_fluid_unit ?? '%'}</Text>
          </View>
          <Text style={resourceDetailS.helperText}>Manual values stay active until a live source takes over.</Text>
        </View>
      )}
    </View>
  );
}

const resourceWidgetS = StyleSheet.create({
  cardBody: { flex: 1, minHeight: 0, gap: 6, justifyContent: 'space-between' },
  footerStack: { gap: 3 },
  primaryCluster: { flexDirection: 'row', gap: 8, alignItems: 'stretch' },
  fuelHero: {
    flex: 1.15,
    minHeight: 78,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    justifyContent: 'center',
    gap: 2,
  },
  heroLabel: { fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },
  heroValue: { fontSize: 23, fontWeight: '900', color: TACTICAL.text, fontFamily: 'Courier', lineHeight: 25 },
  heroSupport: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, lineHeight: 11 },
  sideStack: { flex: 0.95, gap: 8 },
  resourceTile: {
    flex: 1,
    minHeight: 35,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
    backgroundColor: 'rgba(255,255,255,0.02)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    justifyContent: 'center',
    gap: 2,
  },
  tileLabel: { fontSize: 7, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.9 },
  tileValue: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier', lineHeight: 14 },
  compactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  compactCell: { width: '48%', minHeight: 22 },
  compactLabel: { fontSize: 8, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8, marginBottom: 2 },
  compactPowerLabel: { letterSpacing: 0.7 },
  compactValue: { fontSize: 10, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier', lineHeight: 12 },
  metricStack: { gap: 0 },
}, areAttitudeWidgetPropsEqual);

const resourceDetailS = StyleSheet.create({
  modeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  modeLabel: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  modeToggle: { flexDirection: 'row', gap: 8 },
  modeButton: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: 'rgba(255,255,255,0.03)' },
  modeButtonActive: { borderColor: `${TACTICAL.amber}55`, backgroundColor: 'rgba(196,138,44,0.12)' },
  modeButtonText: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  modeButtonTextActive: { color: TACTICAL.amber },
  editCard: { gap: 8, borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: 'rgba(255,255,255,0.02)', padding: 10 },
  editLabel: { fontSize: 10, fontWeight: '700', color: TACTICAL.text, letterSpacing: 0.8 },
  editRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minHeight: 38, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: 'rgba(0,0,0,0.24)', paddingHorizontal: 10, color: TACTICAL.text, fontSize: 13, fontWeight: '700', fontFamily: 'Courier' },
  unitText: { fontSize: 10, fontWeight: '700', color: TACTICAL.textMuted, minWidth: 26 },
  saveButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 8, backgroundColor: 'rgba(196,138,44,0.16)', borderWidth: 1, borderColor: `${TACTICAL.amber}55` },
  saveButtonText: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 0.8 },
  helperText: { fontSize: 9, color: TACTICAL.textMuted, lineHeight: 13 },
});

const s = StyleSheet.create({
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 18, paddingVertical: 3 },
  metricLabel: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, lineHeight: 10 },
  metricValue: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, fontFamily: 'Courier', lineHeight: 13 },
  bigMetric: { fontSize: 28, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text, marginBottom: -2 },
  bigMetricUnit: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  progressOuter: { height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden', marginVertical: 4 },
  progressInner: { height: '100%', borderRadius: 2 },
  pctText: { fontSize: 10, fontWeight: '800', fontFamily: 'Courier', textAlign: 'right', marginBottom: 2 },
  noData: { fontSize: 10, color: TACTICAL.textMuted, fontStyle: 'italic', lineHeight: 14, textAlign: 'center' },
  alertBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, backgroundColor: 'rgba(192,57,43,0.12)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start' },
  alertText: { fontSize: 8, fontWeight: '900', color: TACTICAL.danger, letterSpacing: 1 },
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, marginBottom: 6, alignSelf: 'flex-start' },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  emergencyHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  emergencyTitle: { fontSize: 11, fontWeight: '900', color: TACTICAL.danger, letterSpacing: 1.5 },
  detailContainer: { gap: 4 },
  attitudeDetailExpanded: { paddingTop: 4 },
  detailSection: { fontSize: 10, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5, marginTop: 8, marginBottom: 4 },
  detailDivider: { height: 1, backgroundColor: TACTICAL.border, marginVertical: 8 },

  // â”€â”€ Two-column layout â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  twoCol: { flexDirection: 'row', gap: 0 },
  colLeft: { flex: 1, paddingRight: 6 },
  colRight: { flex: 1, paddingLeft: 6 },
  colDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 2 },
  colHeader: { fontSize: 7, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.2, marginBottom: 4 },

  // â”€â”€ Compact mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  compactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch', minHeight: 42, gap: 8 },
  compactCell: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  compactLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 3, lineHeight: 8 },
  compactValue: { fontSize: 12, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text, lineHeight: 14 },

  // â”€â”€ Vehicle Systems V2: expedition badges â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Stability Index â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Attitude Monitor (Inclinometer) V2 â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ V2: Enterprise Vehicle Schematic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Tactical Bar (Power/Energy Monitor) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tacticalBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tacticalBarLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, width: 48 },
  tacticalBarOuter: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' },
  tacticalBarFill: { height: '100%', borderRadius: 3 },
  tacticalBarWarning: { position: 'absolute', left: '25%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(192,57,43,0.4)' },
  tacticalBarValue: { fontSize: 9, fontWeight: '800', fontFamily: 'Courier', width: 38, textAlign: 'right' },

  // â”€â”€ Mission Sustainment â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  limitBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, marginTop: 4, alignSelf: 'flex-start' },
  limitText: { fontSize: 7, fontWeight: '900', letterSpacing: 1 },

  // â”€â”€ Vehicle Systems Phase 4: Status Tag â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  vsStatusTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    marginTop: 4, alignSelf: 'flex-start',
  },
  vsStatusTagText: { fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },

  // â”€â”€ Operational Readiness â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  readinessHeader: { marginBottom: 2 },
  readinessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  readinessCell: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', minWidth: 52 },
  readinessCellLabel: { fontSize: 6, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 1 },
  readinessCellValue: { fontSize: 11, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text },
});


// â”€â”€ Phase 4: Vehicle Weight Detail Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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


// â”€â”€ Core 4 Shared Styles (Phase 2: Consistent Widget Styling) â”€â”€
const core4 = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    gap: 4,
  },
  sensorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 16,
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


// â”€â”€ BLU Power Widget Styles (Phase 1C) â”€â”€
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
  // â”€â”€ Phase 5: Read-only badge for active mode â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  // â”€â”€ Phase 5: Tank capacity helper text â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

// â”€â”€ Progress Widget Styles (Phase 4) â”€â”€
const progS = StyleSheet.create({
  faceBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 10,
  },
  faceBodyCompact: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  routeLine: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.text,
    lineHeight: 16,
  },
  routeLineCompact: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    lineHeight: 14,
  },
  statStack: {
    gap: 6,
  },
  statStackCompact: {
    gap: 4,
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  statRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  statLabel: {
    flex: 1,
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
  statValueCompact: {
    fontSize: 11,
    fontWeight: '900',
    fontFamily: 'Courier',
    color: TACTICAL.text,
  },
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

// â”€â”€ Phase 6: Remoteness Widget Styles (v1.0 â€” Store-backed) â”€â”€
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

// â”€â”€ Phase 4 (v1.3): Remoteness Detail Styles â”€â”€
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


// â”€â”€ Phase 6: Expedition Channel Widget Styles â”€â”€
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


// â”€â”€ Custom Widget Content (must be defined before renderWidgetContent references it) â”€â”€
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

// â”€â”€ Empty State Microcopy Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const emptyS = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  primary: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    lineHeight: 13,
    textAlign: 'center',
  },
  secondary: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
    lineHeight: 12,
    opacity: 0.85,
    textAlign: 'center',
  },
});







// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ECOFLOW POWER DETAIL â€” Unified Power Authority Bridge
//
// Production path: legacy EcoFlow detail now delegates to the unified
// power detail view so there is one canonical power-detail surface.
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
function EcoFlowPowerDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  return <PowerSystemDetailView />;
}

