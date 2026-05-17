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
 * or density constants Ã¢â‚¬â€ all encapsulated in the centralized function.
 *
 * CORE 4 WIDGET STYLING (Phase 2: Consistent Widget Styling):
 * All four Core 4 widgets (Vehicle Systems, Attitude Monitor,
 * Sustainability, Progress) share identical:
 *   - Internal padding (inherited from WidgetGrid widgetContent)
 *   - MetricRow typography (9px label, 11px Courier value)
 *   - Line spacing (paddingVertical: 3 per row)
 *   - Density cap (3Ã¢â‚¬â€œ4 MetricRows max, no extra chrome)
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
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Animated, Easing, Image, AppState } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

import { SafeIcon as Ionicons } from '../SafeIcon';
import TacticalPopupShell from '../TacticalPopupShell';
import WeatherIntelPanel from '../weather/WeatherIntelPanel';

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
import {
  getActiveVehicleContext,
  subscribeActiveVehicleState,
  waitForActiveVehicleStateHydration,
} from '../../lib/activeVehicleContext';
import { consumablesStore, type ConsumableInputSource, type ConsumablesState } from '../../lib/consumablesStore';
import { routeStore } from '../../lib/routeStore';
import { expeditionRiskStore } from '../../lib/expeditionRiskStore';
import { useApp } from '../../context/AppContext';
import { missionExpeditionStore } from '../../lib/missionStore';
import { ecsSyncCoordinator } from '../../lib/ecsSyncCoordinator';
import {
  useActiveRouteProgressSnapshot,
  type ActiveRouteProgressSnapshot,
} from '../../lib/activeRouteProgress';
import { useOperationalWeather } from '../../lib/useOperationalWeather';
import {
  formatWeatherAlertLine,
  formatWeatherHeadline,
  formatWeatherWindLine,
  getCurrentWeatherTemperatureF,
  type ECSWeatherSnapshot,
} from '../../lib/ecsWeather';
import { formatWeatherDegrees, type NormalizedWeatherForecast } from '../../lib/weatherNormalization';
import {
  normalizeWeatherForecastRows,
  type WeatherForecastRenderRow,
  type WeatherForecastRowKeyScope,
} from '../../lib/dashboardWeatherForecastRows';
import { getWeatherSnapshotStaleness, getWeatherSolarTimes } from '../../lib/weatherSurfaceSelectors';
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
  resolveDashboardValue,
  type DashboardValueSource,
} from '../../lib/dashboardWidgetSources';
import {
  resolveElevationTerrainSnapshot,
  type ElevationTerrainStatus,
} from '../../lib/dashboardElevationTerrain';
import {
  buildEnvironmentSnapshot,
  formatEnvironmentTime,
  formatSunlightCountdownValue,
  formatSunlightRemaining,
  getSunlightCountdownLabel,
  getSunlightSourceLabel,
} from '../../lib/environmentSnapshotService';
import {
  buildRemotenessDestinations,
  formatRemotenessDistance,
} from '../../lib/remotenessDestinations';
import {
  ECSInstrumentPanel,
  WidgetCardShell,
  WidgetCompactRow,
  WidgetEmptyState,
  WidgetMetaLine,
  WidgetMicroStrip,
  WidgetPrimaryValue,
  WidgetSecondaryRow,
  WidgetStateMessage,
  createWidgetStateDescriptor,
  getWidgetToneColor,
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
import {
  PowerSystemCompact,
  PowerSystemCard,
  normalizePowerTelemetrySummary,
  useUnifiedPowerDevices,
} from './PowerSystemWidget';
import PowerModuleRiveWidget from './PowerModuleRiveWidget';
import RouteGuidanceProgressRive from './RouteGuidanceProgressRive';
import { PowerSystemDetailView } from './PowerSystemDetail';
import { useReducedMotion, useStableAnimatedValue } from '../../lib/ecsAnimations';

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
import { RouteConfidenceCompact, RouteConfidenceWidget } from './RouteConfidenceWidget';
import NavigateSurfaceWidget, { Mini3DFollowMap, NavigateSurfaceDetailView } from './NavigateSurfaceWidget';

// Phase 10: Terrain Risk Prediction Widget
// Phase 10: Terrain Risk Prediction Widget
import { TerrainRiskCompact, TerrainRiskCard, TerrainRiskDetailView } from './TerrainRiskWidget';

// Phase 5: Expedition Risk Engine Widget
import { ExpeditionRiskCompact, ExpeditionRiskCard, ExpeditionRiskDetailView } from './ExpeditionRiskWidget';
import { ExpeditionStatusSummaryWidget } from './ExpeditionStatusSummaryWidget';
import ExpeditionReadinessWidget from './ExpeditionReadinessWidget';
import AttitudeMonitorExpandedView from '../attitude/AttitudeMonitorExpandedView';
import VehicleAttitudeStage from '../../src/features/attitude/components/VehicleAttitudeStage';
import type { VehicleAttitudeStageProps } from '../../src/features/attitude/components/VehicleAttitudeStage';
import { resolveAttitudeMonitorVehicleId } from '../../lib/attitudeMonitorVehicleVisual';
import type { VehicleAttitudeKey } from '../../lib/vehicles/vehicleAttitudeAssets';
import { useAttitudeMonitorDisplayState } from '../../lib/useAttitudeMonitorDisplayState';
import { normalizeDeviceAttitudeTelemetry } from '../../lib/deviceAttitudeTelemetry';
import {
  formatAttitudeDegrees,
  getAttitudeSensorState,
} from '../../lib/attitudeMonitorModel';
import {
  syncAttitudeApproachingLimitTone,
  useAttitudeMonitorSoundPreference,
} from '../../lib/attitudeMonitorAudio';
import { publishAttitudeTelemetryBriefAdvisory } from '../../lib/telemetryBriefPublisher';

// Resource Forecast Widget
import { ResourceForecastCompact, ResourceForecastCard, ResourceForecastDetailView } from './ResourceForecastWidget';

// Trip Recorder Widget
import { TripRecorderCompact, TripRecorderCard, TripRecorderDetailView } from './TripRecorderWidget';
import { resolveResourceWidgetPresentation } from '../../lib/resource/resourceCommandResolvers';
import type { ECSAIState } from '../../lib/ai/aiOrchestrator';
import type { ECSOrchestratorTargetView } from '../../lib/ai/orchestratorSelectors';
import {
  ECS_COMMAND_MODULE_ORDER,
  ECS_COMMAND_MODULE_REGISTRY,
  ecsCommandModuleStore,
  type ECSCommandModuleDefinition,
  type ECSCommandModuleId,
} from '../../lib/ecsCommandModuleStore';
import CommandCenterHost from './commandCenter/CommandCenterHost';
import {
  COMMAND_CENTER_IMPLEMENTED_MODES,
  centerModeToCommandModule,
  commandModuleToCenterMode,
  isCommandCenterModuleId,
} from './commandCenter/commandCenterRegistry';
import type { CommandCenterMode } from './commandCenter/commandCenterTypes';

type WeatherBackgroundType =
  | 'clearDay'
  | 'clearNight'
  | 'cloudDay'
  | 'cloudNight'
  | 'rainDay'
  | 'rainNight'
  | 'snowDay'
  | 'snowNight'
  | 'fogDay'
  | 'fogNight';
type SunlightBackgroundType = 'dawn' | 'day' | 'dusk' | 'night';
type VehicleProfileImageKey =
  | 'jeep_wrangler'
  | 'jeep_gladiator'
  | 'toyota_tacoma'
  | 'toyota_4runner'
  | 'toyota_land_cruiser'
  | 'ford_bronco'
  | 'ford_f150'
  | 'chevy_colorado'
  | 'subaru_outback'
  | 'generic_suv'
  | 'generic_truck'
  | 'generic_van'
  | 'ram_1500'
  | 'toyota_sequoia'
  | 'lexus_lx'
  | 'ram_2500_3500'
  | 'ford_super_duty'
  | 'nissan_frontier'
  | 'nissan_xterra'
  | 'mercedes_benz_sprinter'
  | 'toyota_tundra';

const COMMAND_CENTER_MODES: CommandCenterMode[] = COMMAND_CENTER_IMPLEMENTED_MODES;

const WEATHER_BACKGROUND_IMAGES = {
  clearDay: require('../../assets/weather/Weather_Clear_Sun.png'),
  clearNight: require('../../assets/sunlight/Remaining_Sunlight_Night.png'),
  cloudDay: require('../../assets/weather/Weather_Overcast_Cloud.png'),
  cloudNight: require('../../assets/sunlight/Remaining_Sunlight_Night.png'),
  rainDay: require('../../assets/weather/Weather_Rain.png'),
  rainNight: require('../../assets/weather/Weather_Rain.png'),
  snowDay: require('../../assets/weather/Weather_Snow.png'),
  snowNight: require('../../assets/weather/Weather_Snow.png'),
  fogDay: require('../../assets/weather/Weather_Overcast_Cloud.png'),
  fogNight: require('../../assets/sunlight/Remaining_Sunlight_Night.png'),
} as const;

const WEATHER_BACKGROUND_FADE_MS = 540;

const SUNLIGHT_BACKGROUND_IMAGES = {
  dawn: require('../../assets/sunlight/Remaining_Sunlight_Dawn.png'),
  day: require('../../assets/sunlight/Remaining_Sunlight_Day.png'),
  dusk: require('../../assets/sunlight/Remaining_Sunlight_Dusk.png'),
  night: require('../../assets/sunlight/Remaining_Sunlight_Night.png'),
} as const;

const SUNLIGHT_BACKGROUND_FADE_MS = 540;

const VEHICLE_PROFILE_IMAGES = {
  jeep_wrangler: require('../../assets/vehicles/profile/Jeep_Wrangler_Vehicle_Profile.png'),
  jeep_gladiator: require('../../assets/vehicles/profile/Jeep_Gladiator_Vehicle_Profile.png'),
  toyota_tacoma: require('../../assets/vehicles/profile/Toyota_Tacoma_Vehicle_Profile.png'),
  toyota_4runner: require('../../assets/vehicles/profile/Toyota_4Runner_Vehicle_Profile.png'),
  toyota_land_cruiser: require('../../assets/vehicles/profile/Toyota_Land_Cruiser_Vehicle_Profile.png'),
  ford_bronco: require('../../assets/vehicles/profile/Ford_Bronco_Vehicle_Profile.png'),
  ford_f150: require('../../assets/vehicles/profile/Ford_F150_Vehicle_Profile.png'),
  chevy_colorado: require('../../assets/vehicles/profile/Chevy_Colorado_Vehicle_Profile.png'),
  subaru_outback: require('../../assets/vehicles/profile/Subaru_Outback_Vehicle_Profile.png'),
  generic_suv: require('../../assets/vehicles/profile/Generic_SUV_Vehicle_Profile.png'),
  generic_truck: require('../../assets/vehicles/profile/Generic_Truck_Vehicle_Profile.png'),
  generic_van: require('../../assets/vehicles/profile/Generic_Van_Vehicle_Profile.png'),
  ram_1500: require('../../assets/vehicles/profile/Ram_1500_Vehicle_Profile.png'),
  toyota_sequoia: require('../../assets/vehicles/profile/Toyota_Sequoia_Vehicle_Profile.png'),
  lexus_lx: require('../../assets/vehicles/profile/Lexus_LX_Vehicle_Profile.png'),
  ram_2500_3500: require('../../assets/vehicles/profile/Ram_2500_3500_Vehicle_Profile.png'),
  ford_super_duty: require('../../assets/vehicles/profile/Ford_Super_Duty_Vehicle_Profile.png'),
  nissan_frontier: require('../../assets/vehicles/profile/Nissan_Frontier_Vehicle_Profile.png'),
  nissan_xterra: require('../../assets/vehicles/profile/Nissan_Xterra_Vehicle_Profile.png'),
  mercedes_benz_sprinter: require('../../assets/vehicles/profile/Mercedes_Benz_Sprinter_Vehicle_Profile.png'),
  toyota_tundra: require('../../assets/vehicles/profile/Toyota_Tundra_Vehicle_Profile.png'),
} as const;

const VEHICLE_PROFILE_IMAGE_KEY_BY_ATTITUDE_KEY: Record<VehicleAttitudeKey, VehicleProfileImageKey> = {
  jeep_wrangler: 'jeep_wrangler',
  jeep_gladiator: 'jeep_gladiator',
  toyota_tacoma: 'toyota_tacoma',
  toyota_4runner: 'toyota_4runner',
  toyota_land_cruiser: 'toyota_land_cruiser',
  ford_bronco: 'ford_bronco',
  ford_f150: 'ford_f150',
  chevy_colorado: 'chevy_colorado',
  subaru_outback: 'subaru_outback',
  ram_1500: 'ram_1500',
  toyota_sequoia: 'toyota_sequoia',
  lexus_lx: 'lexus_lx',
  ram_2500_3500: 'ram_2500_3500',
  ford_super_duty: 'ford_super_duty',
  nissan_frontier: 'nissan_frontier',
  nissan_xterra: 'nissan_xterra',
  mercedes_benz_sprinter: 'mercedes_benz_sprinter',
  toyota_tundra: 'toyota_tundra',
  generic_pickup: 'generic_truck',
  generic_van: 'generic_van',
  generic_suv: 'generic_suv',
};

const VEHICLE_PROFILE_IMAGE_FADE_MS = 540;

const POWER_MANAGEMENT_BACKGROUND = require('../../assets/power/Power_Management_Background.png');
const ROUTE_PROGRESS_MAP_BACKGROUND = require('../../assets/route/Route_Progress_Map_Background.png');
const ROUTE_PROGRESS_PATH = 'M 88 332 C 184 270 238 364 346 292 C 454 220 500 284 598 204 C 696 124 728 212 818 142 C 872 100 904 92 932 84';
const ROUTE_PROGRESS_SEGMENTS = [
  {
    start: { x: 88, y: 332 },
    c1: { x: 184, y: 270 },
    c2: { x: 238, y: 364 },
    end: { x: 346, y: 292 },
  },
  {
    start: { x: 346, y: 292 },
    c1: { x: 454, y: 220 },
    c2: { x: 500, y: 284 },
    end: { x: 598, y: 204 },
  },
  {
    start: { x: 598, y: 204 },
    c1: { x: 696, y: 124 },
    c2: { x: 728, y: 212 },
    end: { x: 818, y: 142 },
  },
  {
    start: { x: 818, y: 142 },
    c1: { x: 872, y: 100 },
    c2: { x: 904, y: 92 },
    end: { x: 932, y: 84 },
  },
] as const;
const ROUTE_PROGRESS_PATH_LENGTH = 1040;

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
    left.profileSignature === right.profileSignature &&
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
    (left?.isCalibrated ?? false) === (right?.isCalibrated ?? false) &&
    left?.onCalibrate === right?.onCalibrate &&
    left?.onResetCalibration === right?.onResetCalibration &&
    (left?.advancedMode ?? false) === (right?.advancedMode ?? false) &&
    (left?.isFeatured ?? false) === (right?.isFeatured ?? false) &&
    (left?.isCompressedRow ?? false) === (right?.isCompressedRow ?? false) &&
    (left?.gpsHasFix ?? false) === (right?.gpsHasFix ?? false) &&
    (left?.gpsLatitude ?? null) === (right?.gpsLatitude ?? null) &&
    (left?.gpsLongitude ?? null) === (right?.gpsLongitude ?? null) &&
    (left?.gpsAccuracyM ?? null) === (right?.gpsAccuracyM ?? null) &&
    (left?.gpsAltitudeFt ?? null) === (right?.gpsAltitudeFt ?? null) &&
    (left?.gpsTimestampMs ?? null) === (right?.gpsTimestampMs ?? null)
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
  weatherSnapshot?: ECSWeatherSnapshot | { status?: { kind?: string | null } | null } | null;
  activeVehicleContext?: ReturnType<typeof getActiveVehicleContext>;
  aiState?: ECSAIState | null;
  aiDashboardView?: ECSOrchestratorTargetView | null;
}

export interface WidgetRenderOptions {
  dashboardMode?: DashboardMode;
  compact?: boolean;
  /** Accelerometer data for attitude monitor */
  rollDeg?: number | null;
  pitchDeg?: number | null;
  sensorStatus?: string;
  sampleTimestampMs?: number | null;
  isCalibrated?: boolean;
  onCalibrate?: () => void;
  onResetCalibration?: () => void;
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
  /** Timestamp for the current GPS fix */
  gpsTimestampMs?: number | null;
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
  /** Dashboard detail modal close action for detail panels that expose an explicit Close button */
  onCloseDetail?: () => void;
  /** Opens the dashboard Command Brief surface for readiness-focused widgets */
  onOpenCommandBrief?: () => void;
  /** Measured widget footprint from WidgetGrid for responsive widget internals */
  widgetWidth?: number | null;
  widgetHeight?: number | null;
  /** Current screen dimensions for orientation-aware dashboard widget layout */
  screenWidth?: number | null;
  screenHeight?: number | null;
}

function useDashboardActiveVehicleContext(): ReturnType<typeof getActiveVehicleContext> {
  const [vehicleRevision, setVehicleRevision] = useState(0);

  useEffect(() => {
    let mounted = true;
    const bumpRevision = () => {
      if (mounted) {
        setVehicleRevision((revision) => revision + 1);
      }
    };
    const unsubscribe = subscribeActiveVehicleState(bumpRevision);

    waitForActiveVehicleStateHydration()
      .then(bumpRevision)
      .catch(() => bumpRevision());

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return useMemo(() => {
    void vehicleRevision;
    return getActiveVehicleContext();
  }, [vehicleRevision]);
}

function areVehicleSystemsWidgetPropsEqual(
  prev: { data: WidgetData; options?: WidgetRenderOptions },
  next: { data: WidgetData; options?: WidgetRenderOptions },
) {
  return (
    prev.data.loadItems === next.data.loadItems &&
    prev.data.activeVehicleContext?.profileSignature === next.data.activeVehicleContext?.profileSignature &&
    prev.options?.compact === next.options?.compact &&
    prev.options?.isFeatured === next.options?.isFeatured &&
    prev.options?.gpsHasFix === next.options?.gpsHasFix
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
    prev.options?.isCalibrated === next.options?.isCalibrated &&
    prev.options?.onCalibrate === next.options?.onCalibrate &&
    prev.options?.onResetCalibration === next.options?.onResetCalibration &&
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

function compactResourceModeLabel(source?: ConsumableInputSource | null): string {
  return source === 'sensor' ? 'Auto' : 'Manual';
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

function compactResourceSourceLabel(detail?: string | null): string {
  const normalized = (detail ?? '').trim().toLowerCase();
  if (!normalized) return 'Stored';
  if (normalized.includes('live telemetry')) return 'Live';
  if (normalized.includes('last known')) return 'Stored';
  if (normalized.includes('manual')) return 'Manual';
  if (normalized.includes('automatic')) return 'Auto';
  return detail!.trim();
}

function compactPowerSourceLabel(powerSummary: ReturnType<typeof getEcsPowerSummary>): string {
  if (!powerSummary) return 'Stored';
  if (!powerSummary.available) return 'Stored';
  if (powerSummary.has_devices) return 'Bluetooth';
  return 'Stored';
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

function getElevationTerrainTone(status: ElevationTerrainStatus): WidgetTone {
  switch (status) {
    case 'live':
      return 'live';
    case 'stale':
      return 'stale';
    case 'route':
      return 'neutral';
    case 'unavailable':
    default:
      return 'unavailable';
  }
}

function isCriticalWeatherAlert(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): boolean {
  return snapshot.alerts.some((alert) => alert.severity === 'extreme');
}

function getCriticalWeatherAlertSignature(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string | null {
  const extremeAlerts = snapshot.alerts.filter((alert) => alert.severity === 'extreme');
  if (extremeAlerts.length === 0) return null;
  return extremeAlerts
    .map((alert) => `${alert.title}|${alert.effective ?? ''}|${alert.expires ?? ''}`)
    .join(' Â· ');
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
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return '--';
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Viewer-aware color helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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


// Ã¢â€â‚¬Ã¢â€â‚¬ Metric Row Helper Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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


// Ã¢â€â‚¬Ã¢â€â‚¬ Empty State Microcopy Helper Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
    case 'permission_required':
    case 'permission-blocked':
      return renderWidgetState('unavailable', 'Enable location for live forecast.', 'Device location is required for live coordinate-based weather.', 'LOCATION REQUIRED');
    case 'network-blocked':
      return renderWidgetState('unavailable', 'Network required', 'Reconnect to refresh live weather from the current ECS position', 'NETWORK REQUIRED');
    case 'loading':
      return renderWidgetState('loading', 'Loading weather', 'Refreshing current conditions', 'LOADING');
    case 'waiting_for_gps':
      return renderWidgetState('loading', 'Waiting for GPS', 'Weather will populate once ECS regains a usable location fix', 'WAITING FOR GPS');
    case 'stale':
      return renderWidgetState('stale', 'Using cached weather', 'Showing the latest saved weather context until a fresh update arrives', 'STALE WEATHER');
    case 'cached':
      return renderWidgetState('stale', 'Using cached weather', 'Showing cached weather while ECS checks for a fresher update', 'CACHED WEATHER');
    case 'offline':
      return renderWidgetState('stale', 'Offline weather support', 'Showing cached local weather until connectivity returns', 'OFFLINE CACHE');
    case 'provider_error':
      return renderWidgetState('unavailable', hasMeaningfulWeatherSnapshot(snapshot) ? 'Using cached forecast.' : 'Forecast unavailable.', 'ECS will retry the weather provider automatically.', 'PROVIDER ERROR');
    case 'unavailable':
      return renderWidgetState('unavailable', 'Set location to enable forecast.', 'No valid coordinate or cached forecast is currently available.', 'UNAVAILABLE');
    default:
      return renderWidgetState('unavailable', 'Forecast unavailable.', 'No usable weather source is currently available.', 'UNAVAILABLE');
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
      primary: 'Active telemetry',
      secondary: 'Vehicle systems are updating from live telemetry',
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
      badgeLabel: params.hasPowerContext ? 'MANUAL + POWER' : 'MANUAL DATA',
      primary: 'Live telemetry unavailable',
      secondary: params.hasPowerContext
        ? 'Manual data entered with power context'
        : 'Manual data entered',
    });
  }

  return createWidgetStateDescriptor({
    kind: 'misconfigured',
    badgeLabel: 'SETUP REQUIRED',
    primary: 'Setup required',
    secondary: 'Add a vehicle profile or power source',
  });
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Tactical Bar (for Power/Energy Monitor) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Helper: get total weight from load items (qty Ãƒ- weight) Ã¢â€â‚¬Ã¢â€â‚¬
function getTotalWeightLbs(items: LoadItem[]): number {
  return items
    .filter(i => !i.deleted_at)
    .reduce((sum, i) => sum + ((i.weight_lbs || 0) * (i.qty || 1)), 0);
}

function getMechanicalProfileSummary(context: ReturnType<typeof getActiveVehicleContext>): string {
  const tires = context.resourceProfile.tireSizeInches ?? 0;
  const lift = context.resourceProfile.suspensionLiftInches ?? 0;
  const leveled = Boolean(context.resourceProfile.isLeveled);
  const frontLevel = context.resourceProfile.frontLevelInches ?? null;
  const parts: string[] = [];

  if (tires > 0) parts.push(`${tires}" tires`);
  if (lift > 0) parts.push(`${lift}" lift`);
  if (leveled) parts.push(frontLevel ? `leveled +${frontLevel}" front` : 'leveled');

  return parts.join(' | ');
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

  return parts.join(' | ');
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Helper: check if any items have 0 weight Ã¢â€â‚¬Ã¢â€â‚¬
function readAttitudeVehicleText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function formatAttitudeVehicleLbs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  return `${Math.round(value).toLocaleString()} lb`;
}

function resolveAttitudeVehicleProfile(context: ReturnType<typeof getActiveVehicleContext>) {
  const vehicle = context.vehicle;
  const spec = context.spec;
  const wizard = context.wizardConfig ?? {};
  const fabric = context.fleetFabricPayload;
  const weightSummary = fabric?.weightSummary;
  const scoring = fabric?.scoring;
  const identityParts = [
    vehicle?.year ?? fabric?.vehicle.year ?? null,
    vehicle?.make ?? fabric?.vehicle.make ?? null,
    vehicle?.model ?? fabric?.vehicle.model ?? null,
    readAttitudeVehicleText(spec?.trim, fabric?.vehicle.trim, wizard.trim),
  ].filter((part) => part != null && String(part).trim());
  const identity = identityParts.length > 0 ? identityParts.join(' ') : 'Vehicle identity unavailable';
  const vehicleName = vehicle?.name || fabric?.vehicle.nickname || identity;
  const drivetrain = readAttitudeVehicleText(spec?.drivetrain, fabric?.build.drivetrain, wizard.drivetrain, wizard.drive_type);
  const engine = readAttitudeVehicleText(spec?.engine, fabric?.build.engine, wizard.engine);
  const suspensionParts = [
    context.resourceProfile.suspensionLiftInches > 0
      ? `${context.resourceProfile.suspensionLiftInches}" lift`
      : null,
    context.resourceProfile.isLeveled
      ? `leveled${context.resourceProfile.frontLevelInches != null ? ` +${context.resourceProfile.frontLevelInches}" front` : ''}`
      : null,
    readAttitudeVehicleText(wizard.suspension_setup, wizard.suspensionSetup, wizard.suspension),
  ].filter(Boolean);
  const tireParts = [
    context.resourceProfile.tireSizeInches != null && context.resourceProfile.tireSizeInches > 0
      ? `${context.resourceProfile.tireSizeInches}" tire`
      : null,
    context.tiresLift?.wheelDiameterInches != null && context.tiresLift.wheelDiameterInches > 0
      ? `${context.tiresLift.wheelDiameterInches}" wheel`
      : null,
    readAttitudeVehicleText(context.tiresLift?.tireModel, wizard.tire_model, wizard.tireSize, wizard.tire_size),
  ].filter(Boolean);
  const buildParts = [
    context.accessoryInstalledCount > 0 ? `${context.accessoryInstalledCount} installed accessories` : null,
    context.accessoryPlannedCount > 0 ? `${context.accessoryPlannedCount} planned` : null,
    context.zoneSummary || null,
  ].filter(Boolean);
  const loadoutSummary = getLoadoutProfileSummary(context) || fabric?.activeLoadout.name || 'No active loadout summary';
  const operatingWeight =
    weightSummary?.operatingWeightLb ??
    ((spec?.base_weight_lb ?? 0) + (spec?.hardware_additions_lb ?? 0) + (context.loadoutTotalWeightLbs ?? 0));
  const hasOperatingWeight = operatingWeight > 0;
  const payloadMargin =
    weightSummary?.payloadRemainingLb ??
    (spec?.gvwr_lb != null && hasOperatingWeight ? spec.gvwr_lb - operatingWeight : null);
  const readiness = scoring
    ? `${Math.round(scoring.readinessScore)} readiness | ${scoring.riskLevel} risk`
    : weightSummary?.readinessScore != null
      ? `${Math.round(weightSummary.readinessScore)} readiness`
      : 'Readiness unavailable';
  const confidence = scoring
    ? `${Math.round(scoring.confidence)}% Fleet confidence`
    : weightSummary?.confidenceScore != null
      ? `${Math.round(weightSummary.confidenceScore)}% weight confidence`
      : 'Confidence unavailable';

  return {
    vehicleName,
    identity,
    drivetrain: drivetrain || 'Drivetrain unavailable',
    engine: engine || 'Engine unavailable',
    suspension: suspensionParts.join(' | ') || 'Suspension setup unavailable',
    tires: tireParts.join(' | ') || 'Tire size unavailable',
    buildSummary: buildParts.join(' | ') || 'Build accessories unavailable',
    loadoutSummary,
    operatingWeight: hasOperatingWeight ? formatAttitudeVehicleLbs(operatingWeight) : 'Operating weight unavailable',
    baseWeight: formatAttitudeVehicleLbs(spec?.base_weight_lb ?? fabric?.weight.baseNetWeight?.lbs ?? null),
    gvwr: formatAttitudeVehicleLbs(spec?.gvwr_lb ?? fabric?.weight.gvwr?.lbs ?? null),
    payloadMargin: payloadMargin != null ? formatAttitudeVehicleLbs(payloadMargin) : 'Payload margin unavailable',
    readiness,
    confidence,
    source: context.hasVehicleRecord ? 'Fleet selected vehicle/build' : context.hasVehicleContext ? 'Stored Fleet context' : 'No selected Fleet vehicle',
  };
}

function hasZeroWeightItems(items: LoadItem[]): boolean {
  return items.filter(i => !i.deleted_at).some(i => !i.weight_lbs || i.weight_lbs === 0);
}


// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// CORE 4 WIDGET A Ã¢â‚¬â€ VEHICLE SYSTEMS
//
// Phase 2E: Live OBD-II Telemetry Integration
//
// Priority rendering:
//   1) Live OBD-II telemetry Ã¢â€ â€™ engine status, battery, fuel, speed
//   2) Grace window Ã¢â€ â€™ last known values + "Updating..." indicator
//   3) Stale/disconnected Ã¢â€ â€™ fall back to weight-based display
//   4) No specs Ã¢â€ â€™ setup required
//
// Weight data (build weight, margin) remains available in detail view.
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
const VehicleSystemsWidget = React.memo(function VehicleSystemsWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const isFeatured = options?.isFeatured ?? false;
  const activeVehicleContext = data.activeVehicleContext ?? getActiveVehicleContext();
  const [, setRemotenessRevision] = useState(0);
  useEffect(() => {
    remotenessStore.start();
    const unsubscribe = remotenessStore.subscribe(() => setRemotenessRevision((value) => value + 1));
    return () => {
      unsubscribe();
      remotenessStore.stop();
    };
  }, []);
  const remotenessOutput = remotenessStore.get();
  const hasRemotenessContext = (options?.gpsHasFix ?? false) || remotenessOutput.score > 0;
  const consumables = useVehicleConsumables(
    activeVehicleContext.activeVehicleId,
    activeVehicleContext.consumables ?? undefined,
  );

  // Ã¢â€â‚¬Ã¢â€â‚¬ Phase 2E: Live Vehicle Telemetry Ã¢â€â‚¬Ã¢â€â‚¬
  const vt = useVehicleTelemetry();
  const telemetrySnapshot = vt.snapshot;
  const hasLiveTelemetry = telemetrySnapshot.isLive;
  const hasGraceData = telemetrySnapshot.source === 'cache' && Boolean(telemetrySnapshot.updatedAt);
  const showLiveData = hasLiveTelemetry || hasGraceData;

  // Ã¢â€â‚¬Ã¢â€â‚¬ ECS power summary (bus-backed) Ã¢â€â‚¬Ã¢â€â‚¬
  const ecsPower = getEcsPowerSummary();
  const powerAvailable = !!(ecsPower?.available && ecsPower?.has_devices);
  const powerPct = ecsPower?.battery_percent ?? null;
  const powerInput = ecsPower?.input_watts ?? null;
  const powerOutput = ecsPower?.output_watts ?? null;
  const powerRuntime = ecsPower?.runtime_minutes ?? null;
  const powerBadge = getEcsPowerBadge(ecsPower);
  const powerPctColor = getPowerPercentColor(powerPct);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Weight data (fallback) Ã¢â€â‚¬Ã¢â€â‚¬
  const itemsWt = getTotalWeightLbs(data.loadItems);
  const bw: BuildWeightBreakdown = computeFullBuildWeightBreakdown(undefined, {
    items_weight_lb: itemsWt,
  });

  const { build_weight_lb, payload_margin_lb, has_specs, margin_color,
          fuel_percent_current } = bw;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Fuel color Ã¢â€â‚¬Ã¢â€â‚¬
  const fuelColor = fuel_percent_current <= 15 ? '#EF5350' : fuel_percent_current <= 30 ? '#FFB74D' : TACTICAL.text;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Engine status display Ã¢â€â‚¬Ã¢â€â‚¬
  const engineStatusDisplay: Record<string, { label: string; color: string }> = {
    running: { label: 'RUNNING', color: '#4CAF50' },
    idle:    { label: 'IDLE',    color: TACTICAL.amber },
    off:     { label: 'OFF',     color: TACTICAL.textMuted },
    unknown: { label: 'UNKNOWN', color: TACTICAL.textMuted },
  };
  const engineInfo = engineStatusDisplay[vt.engineStatus] || engineStatusDisplay.unknown;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Battery voltage color Ã¢â€â‚¬Ã¢â€â‚¬
  const battV = showLiveData ? telemetrySnapshot.batteryVoltage ?? null : null;
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Live fuel level from OBD-II Ã¢â€â‚¬Ã¢â€â‚¬
  const liveFuelPct = showLiveData ? telemetrySnapshot.fuelPercent ?? null : null;
  const liveFuelColor = liveFuelPct != null
    ? (liveFuelPct <= 15 ? '#EF5350' : liveFuelPct <= 30 ? '#FFB74D' : '#4CAF50')
    : TACTICAL.textMuted;
  const mechanicalSummary = getMechanicalProfileSummary(activeVehicleContext);
  const currentFuelPercent = showLiveData
    ? liveFuelPct
    : consumables.fuel_percent_current ?? fuel_percent_current;
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
  const systemsPrimaryLabel = 'VEHICLE READINESS';
  const systemsPrimaryValue = faultReason
    ? 'CRITICAL'
    : hasLiveTelemetry
      ? 'READY'
      : hasGraceData
        ? 'STALE'
        : systemsHasFallbackContext
          ? 'MANUAL'
          : 'UNAVAILABLE';
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
  const systemsSourceText = hasLiveTelemetry
    ? 'Active telemetry'
    : hasGraceData
      ? 'Last known telemetry'
      : powerAvailable
        ? 'Manual data entered + power'
        : 'Manual data entered';
  const systemsCompactSourceText = hasLiveTelemetry
    ? 'Active telemetry'
    : hasGraceData
      ? 'Last known telemetry'
      : powerAvailable
        ? 'Manual data + power'
        : 'Manual data entered';
  const systemsFooterText = faultReason
    ? faultReason
    : showLiveData || systemsHasFallbackContext || powerAvailable
      ? systemsSourceText
      : systemsSummary.footer?.text ?? 'No active faults';
  const systemsCompactSupportText = faultReason
    ? 'Needs attention'
    : showLiveData || systemsHasFallbackContext || powerAvailable
      ? systemsCompactSourceText
      : 'Vehicle ready';
  const systemsCompactFooterText =
    liveFuelPct != null && liveFuelPct <= 15
      ? 'Low fuel reserve'
      : battV != null && battV < 11.8
        ? 'Low starter battery'
        : hasGraceData
          ? 'Telemetry refresh pending'
          : hasLiveTelemetry
            ? 'Active telemetry'
          : !showLiveData
            ? powerAvailable
              ? 'Manual data entered + power'
              : 'Manual data entered'
            : 'No active faults';
  const systemsReadinessText =
    faultReason
      ? 'Needs attention'
      : hasGraceData
        ? 'Use caution'
        : hasLiveTelemetry
          ? 'Active telemetry'
        : !showLiveData
          ? 'Manual data entered'
          : 'Systems nominal';
  const systemsBandTone = faultReason ? 'critical' : hasGraceData ? 'stale' : !showLiveData ? 'degraded' : 'good';
  const systemsFuelTone =
    currentFuelPercent == null ? 'neutral' : currentFuelPercent <= 10 ? 'critical' : currentFuelPercent <= 30 ? 'attention' : 'good';
  if (compact) {
    const compactSummary = faultReason
      ? `Attention: ${faultReason}`
      : hasGraceData
        ? 'Use caution'
        : hasLiveTelemetry
          ? 'Active telemetry'
        : !showLiveData
          ? 'Manual data entered'
          : 'Vehicle ready';
    const compactStatus = currentFuelPercent != null && currentFuelPercent > 0
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

  // Ã¢-ÂÃ¢-ÂÃ¢-Â LIVE TELEMETRY MODE Ã¢-ÂÃ¢-ÂÃ¢-Â
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

  if (!isFeatured) {
    const compactMetricSecondary = battV != null
      ? {
          label: 'BATT',
          value: `${battV.toFixed(1)}V`,
          tone: batteryTone,
        }
      : powerAvailable
        ? {
            label: 'POWER',
            value: powerPct != null ? `${Math.round(powerPct)}%` : 'LIVE',
            tone: powerTone,
          }
        : {
            label: 'WATER',
            value: `${waterGallons.toFixed(1)}g`,
            tone: waterTone,
          };

    return (
      <WidgetCardShell
        badge={
          faultReason
            ? getWidgetStateBadge(systemsState.kind, systemsState.badgeLabel)
            : powerBadge != null && hasLiveTelemetry
              ? { label: powerBadge?.label ?? 'POWER', tone: ecsPower?.is_sustainable ? 'good' : 'attention' }
              : getWidgetStateBadge(systemsState.kind, systemsState.badgeLabel)
        }
        footer={<WidgetMetaLine text={systemsCompactFooterText} tone={systemsFooterTone} />}
      >
        <View style={vehicleSystemsS.compactCardBody}>
          <View
            style={[
              vehicleSystemsS.compactStatusCard,
              systemsBandTone === 'critical'
                ? vehicleSystemsS.readinessBandCritical
                : systemsBandTone === 'stale' || systemsBandTone === 'degraded'
                  ? vehicleSystemsS.readinessBandDegraded
                  : vehicleSystemsS.readinessBandGood,
            ]}
          >
            <View style={vehicleSystemsS.compactStatusHeader}>
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
              <Text style={vehicleSystemsS.compactStatusLabel} numberOfLines={1}>
                {systemsPrimaryLabel}
              </Text>
            </View>

            <Text
              style={[
                vehicleSystemsS.compactStatusValue,
                systemsPrimaryTone === 'critical'
                  ? vehicleSystemsS.readinessValueCritical
                  : systemsPrimaryTone === 'stale' || systemsPrimaryTone === 'degraded'
                    ? vehicleSystemsS.readinessValueDegraded
                    : vehicleSystemsS.readinessValueGood,
              ]}
              numberOfLines={1}
              minimumFontScale={0.85}
            >
              {systemsPrimaryValue}
            </Text>

            <Text
              style={vehicleSystemsS.compactSupportText}
              numberOfLines={1}
              minimumFontScale={0.85}
            >
              {systemsCompactSupportText}
            </Text>
          </View>

          <View style={vehicleSystemsS.compactMetricRow}>
            <View style={vehicleSystemsS.compactMetricTile}>
              <Text style={vehicleSystemsS.compactMetricLabel} numberOfLines={1}>
                FUEL
              </Text>
              <Text
                style={[
                  vehicleSystemsS.compactMetricValue,
                  { color: getWidgetToneColor(systemsFuelTone) },
                ]}
                numberOfLines={1}
                minimumFontScale={0.8}
              >
                {currentFuelPercent != null ? `${Math.round(currentFuelPercent)}%` : systemsHasFallbackContext ? 'MANUAL' : '--'}
              </Text>
            </View>

            <View style={vehicleSystemsS.compactMetricTile}>
              <Text style={vehicleSystemsS.compactMetricLabel} numberOfLines={1}>
                {compactMetricSecondary.label}
              </Text>
              <Text
                style={[
                  vehicleSystemsS.compactMetricValue,
                  { color: getWidgetToneColor(compactMetricSecondary.tone) },
                ]}
                numberOfLines={1}
                minimumFontScale={0.8}
              >
                {compactMetricSecondary.value}
              </Text>
            </View>
          </View>
        </View>
      </WidgetCardShell>
    );
  }

  const vehicleSupportItems: { label: string; value: string; tone: WidgetTone }[] = [
    {
      label: 'Engine',
      value: showLiveData ? engineInfo.label : systemsHasFallbackContext ? 'MANUAL' : '--',
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
      label: powerAvailable ? 'Power' : 'Manual',
      value: powerAvailable
        ? (powerPct != null ? `${Math.round(powerPct)}%` : formatPowerFlow(powerInput, powerOutput))
        : mechanicalSummary || (has_specs ? `${Math.round(payload_margin_lb).toLocaleString()} lb margin` : systemsHasFallbackContext ? 'Manual data' : 'Unavailable'),
      tone: powerAvailable ? powerTone : weightTone,
    },
    {
      label: 'Remote',
      value: hasRemotenessContext ? remotenessOutput.tier : 'Waiting',
      tone: hasRemotenessContext ? 'neutral' : 'unavailable',
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Phase 2E: Vehicle Telemetry Widget Styles Ã¢â€â‚¬Ã¢â€â‚¬
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
  compactCardBody: {
    flex: 1,
    minHeight: 0,
    gap: 8,
    justifyContent: 'space-between',
  },
  compactStatusCard: {
    minHeight: 0,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 9,
    gap: 4,
  },
  compactStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  compactStatusLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  compactStatusValue: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 0.3,
    lineHeight: 22,
  },
  compactSupportText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    lineHeight: 10,
  },
  compactMetricRow: {
    flexDirection: 'row',
    gap: 6,
  },
  compactMetricTile: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 3,
  },
  compactMetricLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  compactMetricValue: {
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 15,
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











// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// WIDGET B Ã¢â‚¬â€ STABILITY INDEX
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
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

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// CORE 4 WIDGET B Ã¢â‚¬â€ ATTITUDE MONITOR
//
// Phase 2 Consistent Styling:
// Card view: exactly 3 MetricRows (Roll, Pitch, Tilt) + sensor badge.
// No inclinometer graphic, subtitle rows, or threshold warnings.
// Detail modal retains full inclinometer visualization.
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
const attitudeMonitorStageS = StyleSheet.create({
  fullBleed: {
    flex: 1,
    minHeight: 0,
    margin: -2,
  },
  controlLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  soundPill: {
    position: 'absolute',
    top: 8,
    left: 10,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    minHeight: 28,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.28)',
    backgroundColor: 'rgba(19, 24, 30, 0.82)',
  },
  soundPillOff: {
    borderColor: 'rgba(139, 148, 158, 0.2)',
    backgroundColor: 'rgba(20, 24, 30, 0.84)',
  },
  statusPill: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 1,
    maxWidth: 138,
    minHeight: 24,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(28, 23, 14, 0.82)',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusPillText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
});

const AttitudeMonitorWidget = React.memo(function AttitudeMonitorWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const rollDeg = options?.rollDeg ?? null;
  const pitchDeg = options?.pitchDeg ?? null;
  const sensorStatus = options?.sensorStatus || 'OFFLINE';
  const sampleTimestampMs = options?.sampleTimestampMs ?? null;
  const advanced = options?.advancedMode;
  const onCalibrate = options?.onCalibrate;
  const onResetCalibration = options?.onResetCalibration;
  const isCalibrated = options?.isCalibrated;
  const [localZeroOffset, setLocalZeroOffset] = useState<{ rollDeg: number; pitchDeg: number } | null>(null);
  const activeVehicleContext = useDashboardActiveVehicleContext();
  const attitudeVehicleId = resolveAttitudeMonitorVehicleId(activeVehicleContext);
  const attitudeTelemetry = useMemo(
    () =>
      normalizeDeviceAttitudeTelemetry({
        rollDeg,
        pitchDeg,
        sensorStatus,
        sampleTimestampMs,
      }),
    [pitchDeg, rollDeg, sampleTimestampMs, sensorStatus],
  );
  const displayState = useAttitudeMonitorDisplayState({
    rollDeg: attitudeTelemetry.rollDeg,
    pitchDeg: attitudeTelemetry.pitchDeg,
    sensorStatus,
    sampleTimestampMs: attitudeTelemetry.updatedAt,
    advanced,
    sourceOrigin: 'device_sensors',
    telemetryHealthOverride: attitudeTelemetry.displayHealth,
    sourceLabelOverride: attitudeTelemetry.sourceLabel,
    sourceShortLabelOverride: attitudeTelemetry.sourceLabel,
    sourceChipLabelOverride: attitudeTelemetry.sourceChipLabel,
    sourceStatusLineOverride: attitudeTelemetry.sourceStatusLine,
  });
  const critical = displayState.severity === 'warning';
  const sensorLive = attitudeTelemetry.isLive && displayState.liveMotion;
  const liveTelemetry = displayState.telemetryHealth === 'live';
  const attitudeSensorUnavailable =
    attitudeTelemetry.isUnavailable &&
    sensorStatus !== 'AWAITING';
  const criticalHapticSent = useRef(false);
  const { enabled: soundEnabled, toggle: toggleSoundEnabled } = useAttitudeMonitorSoundPreference();
  const handleToggleSound = useCallback(() => {
    void hapticMicro();
    toggleSoundEnabled();
  }, [toggleSoundEnabled]);
  const hasExternalZeroAction = Boolean(onCalibrate);
  const displayRollDeg = displayState.displayRollDeg ?? 0;
  const displayPitchDeg = displayState.displayPitchDeg ?? 0;
  const stageRollDeg = sensorLive
    ? (hasExternalZeroAction ? displayRollDeg : (attitudeTelemetry.rollDeg ?? 0) - (localZeroOffset?.rollDeg ?? 0))
    : 0;
  const stagePitchDeg = sensorLive
    ? (hasExternalZeroAction ? displayPitchDeg : (attitudeTelemetry.pitchDeg ?? 0) - (localZeroOffset?.pitchDeg ?? 0))
    : 0;
  const stageZeroActive = sensorLive && Boolean(isCalibrated || localZeroOffset);
  const stageStatusLabel = sensorLive ? displayState.label : attitudeTelemetry.sourceLabel;
  const stageStatusColor =
    displayState.tone === 'critical'
      ? TACTICAL.danger
      : displayState.tone === 'attention'
        ? TACTICAL.amber
        : sensorLive
          ? TACTICAL.text
          : TACTICAL.textMuted;
  const stageStatusBorderColor = sensorLive ? `${stageStatusColor}45` : 'rgba(139, 148, 158, 0.2)';
  const handleZeroAttitudeStage = useCallback(() => {
    if (onCalibrate) {
      onCalibrate();
      return;
    }

    if (!attitudeTelemetry.isLive || attitudeTelemetry.rollDeg == null || attitudeTelemetry.pitchDeg == null) {
      return;
    }

    setLocalZeroOffset({ rollDeg: attitudeTelemetry.rollDeg, pitchDeg: attitudeTelemetry.pitchDeg });
  }, [attitudeTelemetry.isLive, attitudeTelemetry.pitchDeg, attitudeTelemetry.rollDeg, onCalibrate]);
  const handleResetAttitudeStageZero = useCallback(() => {
    if (onResetCalibration) {
      onResetCalibration();
      return;
    }

    setLocalZeroOffset(null);
  }, [onResetCalibration]);

  useEffect(() => {
    publishAttitudeTelemetryBriefAdvisory({
      attitudeWidgetActive: true,
      attitudeSensorAvailable: !attitudeSensorUnavailable,
      sensorStatus,
      deviceId: attitudeVehicleId,
    });
  }, [attitudeSensorUnavailable, attitudeVehicleId, sensorStatus]);

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

  useEffect(() => {
    syncAttitudeApproachingLimitTone({
      severity: displayState.severity,
      telemetryHealth: displayState.telemetryHealth,
      soundEnabled,
    });
  }, [displayState.severity, displayState.telemetryHealth, soundEnabled]);

  return (
    <View style={attitudeMonitorStageS.fullBleed}>
      <VehicleAttitudeStage
        vehicleId={attitudeVehicleId}
        pitchDeg={stagePitchDeg}
        rollDeg={stageRollDeg}
        telemetryFrame="device"
        mode="monitor"
        showZeroButton={sensorLive}
        showReadouts={sensorLive}
        showLiveHashIndicators={sensorLive}
        onZero={sensorLive ? handleZeroAttitudeStage : undefined}
        onResetZero={sensorLive ? handleResetAttitudeStageZero : undefined}
        zeroActive={stageZeroActive}
      >
        <View pointerEvents="box-none" style={attitudeMonitorStageS.controlLayer}>
          <TouchableOpacity
            accessibilityLabel={soundEnabled ? 'Disable attitude monitor sound' : 'Enable attitude monitor sound'}
            accessibilityRole="button"
            activeOpacity={0.82}
            onPress={handleToggleSound}
            style={[
              attitudeMonitorStageS.soundPill,
              !soundEnabled ? attitudeMonitorStageS.soundPillOff : null,
            ]}
          >
            <Ionicons
              name={soundEnabled ? 'volume-high-outline' : 'volume-off-outline'}
              size={15}
              color={soundEnabled ? TACTICAL.text : 'rgba(197, 206, 214, 0.86)'}
            />
          </TouchableOpacity>

          <View
            pointerEvents="none"
            style={[
              attitudeMonitorStageS.statusPill,
              { borderColor: stageStatusBorderColor },
            ]}
          >
            <Text
              style={[attitudeMonitorStageS.statusPillText, { color: stageStatusColor }]}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
              numberOfLines={1}
            >
              {stageStatusLabel}
            </Text>
          </View>
        </View>
      </VehicleAttitudeStage>
    </View>
  );
}, areAttitudeMonitorWidgetPropsEqual);

function getVehicleProfileImageKeyFromAttitudeKey(vehicleKey: VehicleAttitudeKey): VehicleProfileImageKey {
  return VEHICLE_PROFILE_IMAGE_KEY_BY_ATTITUDE_KEY[vehicleKey] ?? 'generic_suv';
}

function formatCommandClockHour(hourValue: number): string {
  if (!Number.isFinite(hourValue)) return 'Unavailable';
  const normalized = ((hourValue % 24) + 24) % 24;
  const hr = Math.floor(normalized);
  const min = Math.round((normalized - hr) * 60);
  const adjustedHr = min >= 60 ? (hr + 1) % 24 : hr;
  const adjustedMin = min >= 60 ? 0 : min;
  const ampm = adjustedHr >= 12 ? 'PM' : 'AM';
  const hr12 = ((adjustedHr - 1) % 12) + 1;
  return `${hr12}:${adjustedMin.toString().padStart(2, '0')} ${ampm}`;
}

type CommandSunlightRadiancePhase =
  | 'sunrise'
  | 'midday'
  | 'golden_hour'
  | 'sunset'
  | 'night'
  | 'unavailable';

type CommandSunlightVisualData = {
  phase: string;
  radiancePhase: CommandSunlightRadiancePhase;
  backgroundType: SunlightBackgroundType;
  countdownLabel: string;
  sunrise: string;
  sunset: string;
  uvIndex: string;
};

type CommandWeatherSceneKind = 'clear' | 'overcast' | 'rain' | 'snow' | 'unavailable';

type CommandWeatherVisualData = {
  scene: CommandWeatherSceneKind;
  backgroundType: WeatherBackgroundType;
  condition: string;
  temperature: string;
  feelsLike: string;
  wind: string;
  humidity: string;
  precipitation: string;
  live: boolean;
};

function AttitudeStageHexButtonChrome({
  active = false,
  muted = false,
}: {
  active?: boolean;
  muted?: boolean;
}) {
  const borderColor = muted
    ? 'rgba(139, 148, 158, 0.24)'
    : active
      ? 'rgba(245, 199, 73, 0.58)'
      : 'rgba(212, 160, 23, 0.34)';
  const fillColor = muted
    ? 'rgba(2, 5, 7, 0.46)'
    : active
      ? 'rgba(42, 32, 11, 0.86)'
      : 'rgba(9, 14, 17, 0.76)';

  return (
    <Svg
      pointerEvents="none"
      viewBox="0 0 34 30"
      style={attitudeCommandS.stageHexButtonChrome}
    >
      <Path
        d="M17 1.2 L31.2 8.6 L31.2 21.4 L17 28.8 L2.8 21.4 L2.8 8.6 Z"
        fill={fillColor}
        stroke={borderColor}
        strokeWidth={1.25}
      />
      <Path
        d="M17 4 L28.2 9.9 L28.2 20.1 L17 26 L5.8 20.1 L5.8 9.9 Z"
        fill="transparent"
        stroke="rgba(255, 220, 132, 0.12)"
        strokeWidth={0.8}
      />
    </Svg>
  );
}

type CommandVehicleVisualData = {
  imageKey: VehicleProfileImageKey;
  name: string;
  identity: string;
  readiness: string;
  drivetrain: string;
  fuel: string;
  battery: string;
  source: string;
  ready: boolean;
};

type CommandRouteVisualData = {
  active: boolean;
  isOffline: boolean;
  hasGeometry: boolean;
  progressPercent: number;
  remaining: string;
  eta: string;
  total: string;
  completed: string;
  routeLabel: string;
  estimatedTime: string;
  status: string;
  geometryStatus: string;
};

type RouteProgressPoint = { x: number; y: number };

type CommandPowerVisualData = {
  live: boolean;
  canDisplayTelemetryValues: boolean;
  canAnimateFlow: boolean;
  batteryPercent: number | null;
  inputWatts: number | null;
  outputWatts: number | null;
  solarWatts: number | null;
  netWatts: number | null;
  runtime: string;
  sourceLabel: string;
  inputLabel: string;
  outputLabel: string;
  statusLabel: string;
  inputRows: CommandPowerFlowRow[];
  outputRows: CommandPowerFlowRow[];
  unavailableMessage: string | null;
};

type CommandEnvironmentalVisualData = {
  statusLabel: string;
  statusTone: WidgetTone;
  daylight: string;
  daylightLabel: string;
  daylightTone: WidgetTone;
  phase: string;
  sunlightSource: string;
  sunset: string;
  uvIndex: string;
  weatherValue: string;
  weatherTone: WidgetTone;
  weatherDetail: string;
  elevation: string;
  elevationTone: WidgetTone;
  elevationSource: string;
  remoteness: string;
  remotenessTone: WidgetTone;
  remotenessDetail: string;
  nearestRoad: string;
  nearestTown: string;
  nearestFuel: string;
  footer: string;
};

type CommandPowerFlowRow = {
  label: string;
  value: string;
  active: boolean;
};

type ECSCommandModuleMetric = {
  label: string;
  value: string;
  tone?: WidgetTone;
};

function formatCommandVehicleCompactMetric(label: string, value: string | null | undefined): string {
  if (!value || value.toLowerCase().includes('unavailable')) return `${label} --`;
  return `${label} ${value}`.toUpperCase();
}

type VehicleProfileMetricReadout = {
  compact: string;
  detail: string;
  tone: WidgetTone;
  source: 'live' | 'manual' | 'unavailable';
};

function readVehicleProfileNumber(source: unknown, fields: string[]): number | null {
  if (!source || typeof source !== 'object') return null;
  const record = source as Record<string, unknown>;
  for (const field of fields) {
    const path = field.split('.');
    let value: unknown = record;
    for (const segment of path) {
      if (!value || typeof value !== 'object') {
        value = undefined;
        break;
      }
      value = (value as Record<string, unknown>)[segment];
    }
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function isValidVehicleVoltage(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 60;
}

function isValidFuelPercent(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
}

function formatVehicleFuelGallons(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded.toFixed(0)} gal` : `${rounded.toFixed(1)} gal`;
}

function formatVehicleFuelPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatVehicleVoltage(value: number): string {
  return `${value.toFixed(1)} V`;
}

function resolveVehicleProfileFuelReadout(
  context: ReturnType<typeof getActiveVehicleContext>,
  snapshot: ReturnType<typeof useVehicleTelemetry>['snapshot'],
): VehicleProfileMetricReadout {
  const liveFuelPercent = snapshot.isLive && snapshot.sourceType !== 'simulated'
    ? snapshot.fuelPercent ?? snapshot.fuelLevelPct
    : null;
  const tankCapacityGal = context.resourceProfile.fuelTankCapacityGal;

  if (isValidFuelPercent(liveFuelPercent)) {
    if (typeof tankCapacityGal === 'number' && Number.isFinite(tankCapacityGal) && tankCapacityGal > 0) {
      const liveGallons = tankCapacityGal * (liveFuelPercent / 100);
      const gallonsLabel = formatVehicleFuelGallons(liveGallons);
      const percentLabel = formatVehicleFuelPercent(liveFuelPercent);
      return {
        compact: `FUEL ${gallonsLabel} live`,
        detail: `${gallonsLabel} (${percentLabel} live)`,
        tone: 'live',
        source: 'live',
      };
    }

    const percentLabel = formatVehicleFuelPercent(liveFuelPercent);
    return {
      compact: `FUEL ${percentLabel} live`,
      detail: `${percentLabel} live`,
      tone: 'live',
      source: 'live',
    };
  }

  const consumables = context.consumables;
  const explicitManualGallons =
    consumables?.fuel_source === 'manual' &&
    (
      typeof consumables.fuel_gal_updated_at === 'number' ||
      (typeof consumables.fuel_gal_current === 'number' && consumables.fuel_gal_current > 0)
    ) &&
    typeof consumables.fuel_gal_current === 'number' &&
    Number.isFinite(consumables.fuel_gal_current)
      ? Math.max(0, consumables.fuel_gal_current)
      : null;
  const storedManualFuelPercent =
    consumables?.fuel_source === 'manual' && isValidFuelPercent(consumables.fuel_percent_current) &&
    (
      typeof consumables.fuel_gal_updated_at === 'number' ||
      (typeof context.vehicle?.current_fuel_percent === 'number' && context.vehicle.current_fuel_percent !== 100)
    )
      ? consumables.fuel_percent_current
      : null;
  const manualTelemetryFuelPercent =
    snapshot.sourceType === 'manual' && isValidFuelPercent(snapshot.fuelPercent ?? snapshot.fuelLevelPct)
      ? snapshot.fuelPercent ?? snapshot.fuelLevelPct
      : null;
  const manualFuelPercent = storedManualFuelPercent ?? manualTelemetryFuelPercent;
  const manualFuelGallons =
    explicitManualGallons ??
    (manualFuelPercent != null && typeof tankCapacityGal === 'number' && Number.isFinite(tankCapacityGal) && tankCapacityGal > 0
      ? tankCapacityGal * (manualFuelPercent / 100)
      : null);

  if (manualFuelGallons != null) {
    const gallonsLabel = formatVehicleFuelGallons(manualFuelGallons);
    return {
      compact: `FUEL ${gallonsLabel} (manually set)`,
      detail: `${gallonsLabel} (manually set)`,
      tone: 'neutral',
      source: 'manual',
    };
  }

  if (manualFuelPercent != null) {
    const percentLabel = formatVehicleFuelPercent(manualFuelPercent);
    return {
      compact: `FUEL ${percentLabel} (manually set)`,
      detail: `${percentLabel} (manually set)`,
      tone: 'neutral',
      source: 'manual',
    };
  }

  return {
    compact: 'FUEL --',
    detail: 'Fuel unavailable',
    tone: 'unavailable',
    source: 'unavailable',
  };
}

function resolveVehicleProfileVoltageReadout(
  context: ReturnType<typeof getActiveVehicleContext>,
  snapshot: ReturnType<typeof useVehicleTelemetry>['snapshot'],
): VehicleProfileMetricReadout {
  if (snapshot.isLive && snapshot.sourceType !== 'simulated' && isValidVehicleVoltage(snapshot.batteryVoltage)) {
    const voltageLabel = formatVehicleVoltage(snapshot.batteryVoltage);
    return {
      compact: `VOLTAGE ${voltageLabel} live`,
      detail: `${voltageLabel} live`,
      tone: 'live',
      source: 'live',
    };
  }

  const manualVehicleVoltage = readVehicleProfileNumber(
    {
      vehicle: context.vehicle,
      wizardConfig: context.wizardConfig,
      resourceProfile: context.resourceProfile,
      capability: context.capabilitySnapshot,
    },
    [
      'vehicle.battery_voltage',
      'vehicle.batteryVoltage',
      'vehicle.starter_battery_voltage',
      'vehicle.starterBatteryVoltage',
      'vehicle.manual_battery_voltage',
      'vehicle.manualBatteryVoltage',
      'vehicle.voltage',
      'wizardConfig.battery_voltage',
      'wizardConfig.batteryVoltage',
      'wizardConfig.manual_battery_voltage',
      'wizardConfig.manualBatteryVoltage',
      'wizardConfig._resources.battery_voltage',
      'wizardConfig._resources.batteryVoltage',
      'resourceProfile.batteryVoltage',
      'capability.batteryVoltage',
    ],
  );
  const manualTelemetryVoltage =
    snapshot.sourceType === 'manual' && isValidVehicleVoltage(snapshot.batteryVoltage)
      ? snapshot.batteryVoltage
      : null;
  const manualVoltage = isValidVehicleVoltage(manualVehicleVoltage)
    ? manualVehicleVoltage
    : manualTelemetryVoltage;

  if (manualVoltage != null) {
    const voltageLabel = formatVehicleVoltage(manualVoltage);
    return {
      compact: `VOLTAGE ${voltageLabel} (manually set)`,
      detail: `${voltageLabel} (manually set)`,
      tone: 'neutral',
      source: 'manual',
    };
  }

  return {
    compact: 'VOLTAGE --',
    detail: 'Voltage unavailable',
    tone: 'unavailable',
    source: 'unavailable',
  };
}

function sanitizeCommandPowerLabel(value: string | null | undefined): string {
  const clean = (value ?? '').replace(/\/\s*fallback/gi, '').replace(/\bfallback\b/gi, '').replace(/\s{2,}/g, ' ').trim();
  return clean || 'Power source unavailable';
}

function sanitizeCommandPowerFlowLabel(value: string | null | undefined, fallbackLabel: string): string {
  const clean = sanitizeCommandPowerLabel(value).replace(/\bpower source unavailable\b/gi, '').trim();
  return (clean || fallbackLabel).toUpperCase();
}

function compactCommandEnvironmentSource(value: string | null | undefined): string {
  const clean = (value ?? '').replace(/\s{2,}/g, ' ').trim();
  if (!clean) return 'Source unavailable';
  if (/weather solar/i.test(clean)) return 'Weather solar time';
  if (/coordinate/i.test(clean)) return 'Coordinate estimate';
  if (/gps/i.test(clean)) return 'GPS source';
  if (/unavailable/i.test(clean)) return 'Source unavailable';
  return clean.length > 34 ? `${clean.slice(0, 31).trim()}...` : clean;
}

function formatCommandEnvironmentNearest(
  label: string,
  destination: { label: string; distanceMiles?: number } | null,
): string {
  if (!destination) return `${label} --`;
  const distance = formatRemotenessDistance(destination.distanceMiles);
  if (distance === '--') return `${label} ${destination.label}`;
  return `${label} ${distance}`;
}

function resolveCommandEnvironmentRemotenessTone(score: number | null): WidgetTone {
  if (score == null) return 'unavailable';
  if (score >= 76) return 'critical';
  if (score >= 51) return 'attention';
  if (score >= 26) return 'neutral';
  return 'good';
}

function resolveCommandSunlightRadiancePhase(params: {
  hour: number;
  remainingHours: number | null;
  unavailable: boolean;
  nextEvent?: 'sunrise' | 'sunset' | null;
  status?: string | null;
}): { phase: string; radiancePhase: CommandSunlightRadiancePhase } {
  if (params.unavailable || !Number.isFinite(params.hour)) {
    return { phase: 'Unavailable', radiancePhase: 'unavailable' };
  }
  if (params.nextEvent === 'sunrise') {
    return {
      phase: params.status === 'before_sunrise' ? 'Before sunrise' : 'Night conditions',
      radiancePhase: 'night',
    };
  }
  if (params.remainingHours != null && params.remainingHours <= 0) {
    return { phase: 'Night conditions', radiancePhase: 'night' };
  }
  if (params.hour >= 5 && params.hour <= 8) {
    return { phase: 'Sunrise window', radiancePhase: 'sunrise' };
  }
  if (params.remainingHours != null && params.remainingHours < 1) {
    return { phase: 'Sunset window', radiancePhase: 'sunset' };
  }
  if ((params.hour >= 16 && params.hour <= 19) || (params.hour >= 6 && params.hour <= 9)) {
    return { phase: 'Golden hour', radiancePhase: 'golden_hour' };
  }
  if (params.hour >= 10 && params.hour <= 15) {
    return { phase: 'Daylight', radiancePhase: 'midday' };
  }
  return { phase: 'Civil twilight', radiancePhase: 'night' };
}

function formatCommandUvIndex(value: number | null): string {
  if (value == null || !Number.isFinite(value)) {
    return 'UV --';
  }
  return `UV ${Math.max(0, Math.round(value))}`;
}

function getSunlightBackgroundType(input: unknown): SunlightBackgroundType {
  if (!input || typeof input !== 'object') return 'day';
  const record = input as Record<string, unknown>;
  const phaseText = [
    record.backgroundType,
    record.radiancePhase,
    record.phase,
    record.dayPhase,
    record.status,
  ]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ')
    .toLowerCase();
  const localHour = typeof record.localHour === 'number' && Number.isFinite(record.localHour)
    ? record.localHour
    : typeof record.hour === 'number' && Number.isFinite(record.hour)
      ? record.hour
      : null;

  if (
    phaseText.includes('night') ||
    phaseText.includes('civil twilight') ||
    phaseText.includes('after sunset') ||
    phaseText.includes('before sunrise')
  ) {
    return 'night';
  }
  if (phaseText.includes('sunrise') || phaseText.includes('dawn') || phaseText.includes('early morning')) {
    return 'dawn';
  }
  if (phaseText.includes('sunset') || phaseText.includes('dusk') || phaseText.includes('late day') || phaseText.includes('twilight')) {
    return 'dusk';
  }
  if (phaseText.includes('golden_hour') || phaseText.includes('golden hour')) {
    return localHour != null && localHour < 12 ? 'dawn' : 'dusk';
  }
  if (phaseText.includes('midday') || phaseText.includes('daylight') || phaseText.includes('daytime') || phaseText.includes('high sun')) {
    return 'day';
  }

  const nowMinutes = typeof record.nowMinutes === 'number' ? record.nowMinutes : null;
  const sunriseMinutes = typeof record.sunriseMinutes === 'number' ? record.sunriseMinutes : null;
  const sunsetMinutes = typeof record.sunsetMinutes === 'number' ? record.sunsetMinutes : null;
  if (
    nowMinutes != null &&
    sunriseMinutes != null &&
    sunsetMinutes != null &&
    Number.isFinite(nowMinutes) &&
    Number.isFinite(sunriseMinutes) &&
    Number.isFinite(sunsetMinutes)
  ) {
    if (nowMinutes < sunriseMinutes - 45 || nowMinutes > sunsetMinutes + 45) return 'night';
    if (nowMinutes <= sunriseMinutes + 90) return 'dawn';
    if (nowMinutes >= sunsetMinutes - 90) return 'dusk';
    return 'day';
  }

  return 'day';
}

function getRouteProgressPercent(input: { progressPercent?: number | null }): number {
  const raw = Number(input.progressPercent ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, raw));
}

function hasRenderableRouteProgressGeometry(routeProgress: RouteProgressSnapshot | null | undefined): boolean {
  if (!routeProgress?.isActive) return false;
  const geometryStatus = routeProgress.geometryStatus.toLowerCase();
  if (!geometryStatus.trim()) return false;
  return !geometryStatus.includes('unavailable') && !geometryStatus.includes('limited');
}

function getCubicBezierPoint(
  start: RouteProgressPoint,
  c1: RouteProgressPoint,
  c2: RouteProgressPoint,
  end: RouteProgressPoint,
  t: number,
): RouteProgressPoint {
  const clamped = Math.max(0, Math.min(1, t));
  const inv = 1 - clamped;
  const inv2 = inv * inv;
  const t2 = clamped * clamped;
  return {
    x: inv2 * inv * start.x + 3 * inv2 * clamped * c1.x + 3 * inv * t2 * c2.x + t2 * clamped * end.x,
    y: inv2 * inv * start.y + 3 * inv2 * clamped * c1.y + 3 * inv * t2 * c2.y + t2 * clamped * end.y,
  };
}

function getRouteMarkerPoint(progressPercent: number): RouteProgressPoint {
  const targetRatio = Math.max(0, Math.min(100, progressPercent)) / 100;
  const samples: { point: RouteProgressPoint; length: number }[] = [];
  let totalLength = 0;
  let previousPoint: RouteProgressPoint | null = null;

  for (const segment of ROUTE_PROGRESS_SEGMENTS) {
    for (let step = 0; step <= 20; step += 1) {
      const point = getCubicBezierPoint(segment.start, segment.c1, segment.c2, segment.end, step / 20);
      if (previousPoint) {
        totalLength += Math.hypot(point.x - previousPoint.x, point.y - previousPoint.y);
      }
      samples.push({ point, length: totalLength });
      previousPoint = point;
    }
  }

  if (samples.length === 0 || totalLength <= 0) {
    return { x: 88, y: 332 };
  }

  const targetLength = totalLength * targetRatio;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (current.length >= targetLength) {
      const span = current.length - previous.length;
      const localRatio = span > 0 ? (targetLength - previous.length) / span : 0;
      return {
        x: previous.point.x + (current.point.x - previous.point.x) * localRatio,
        y: previous.point.y + (current.point.y - previous.point.y) * localRatio,
      };
    }
  }

  return samples[samples.length - 1].point;
}

function useAppForegroundState(): boolean {
  const [isForeground, setIsForeground] = useState(() => AppState.currentState === 'active');

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setIsForeground(nextState === 'active');
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return isForeground;
}

function collectWeatherConditionText(value: unknown, output: string[] = [], depth = 0): string[] {
  if (value == null || depth > 4) return output;
  if (typeof value === 'string' || typeof value === 'number') {
    const text = String(value).trim();
    if (text) output.push(text);
    return output;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectWeatherConditionText(item, output, depth + 1);
    return output;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['condition', 'description', 'main', 'text', 'summary', 'label', 'precipType']) {
      collectWeatherConditionText(record[key], output, depth + 1);
    }
    for (const key of ['current', 'weather', 'conditions']) {
      collectWeatherConditionText(record[key], output, depth + 1);
    }
  }
  return output;
}

function readWeatherConditionCode(value: unknown, depth = 0): number | null {
  if (value == null || depth > 4) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const code = readWeatherConditionCode(item, depth + 1);
      if (code != null) return code;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['weatherId', 'weather_id', 'id', 'code', 'conditionCode', 'weather_code', 'weatherCode']) {
      const code = readWeatherConditionCode(record[key], depth + 1);
      if (code != null) return code;
    }
    for (const key of ['current', 'weather', 'conditions']) {
      const code = readWeatherConditionCode(record[key], depth + 1);
      if (code != null) return code;
    }
  }
  return null;
}

function readWeatherIconCode(value: unknown, depth = 0): string | null {
  if (value == null || depth > 4) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return /^\d{2}[dn]$/i.test(trimmed) ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const icon = readWeatherIconCode(item, depth + 1);
      if (icon) return icon;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['iconCode', 'weather_icon', 'weatherIcon', 'icon']) {
      const icon = readWeatherIconCode(record[key], depth + 1);
      if (icon) return icon;
    }
    for (const key of ['current', 'weather', 'conditions']) {
      const icon = readWeatherIconCode(record[key], depth + 1);
      if (icon) return icon;
    }
  }
  return null;
}

function readWeatherCloudCover(value: unknown, depth = 0): number | null {
  if (value == null || depth > 4) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const clouds = readWeatherCloudCover(item, depth + 1);
      if (clouds != null) return clouds;
    }
    return null;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['clouds', 'cloudCover', 'cloud_cover', 'cloudPct', 'cloudPercent']) {
      const clouds = readWeatherCloudCover(record[key], depth + 1);
      if (clouds != null) return clouds;
    }
    for (const key of ['current', 'weather', 'conditions']) {
      const clouds = readWeatherCloudCover(record[key], depth + 1);
      if (clouds != null) return clouds;
    }
  }
  return null;
}

function isWeatherNight(value: unknown): boolean {
  const iconCode = readWeatherIconCode(value)?.toLowerCase();
  if (iconCode?.endsWith('n')) return true;
  if (iconCode?.endsWith('d')) return false;

  if (typeof value === 'object' && value != null) {
    const dt = readAttitudeCommandNumber(value, ['dt', 'current.dt']) ?? Math.round(Date.now() / 1000);
    const sunrise = readAttitudeCommandNumber(value, ['sunrise', 'current.sunrise']);
    const sunset = readAttitudeCommandNumber(value, ['sunset', 'current.sunset']);
    const hasSolarWindow =
      sunrise != null &&
      sunset != null &&
      Number.isFinite(sunrise) &&
      Number.isFinite(sunset);
    if (hasSolarWindow) {
      const normalizedDt = dt > 10_000_000_000 ? Math.round(dt / 1000) : dt;
      const normalizedSunrise = sunrise > 10_000_000_000 ? Math.round(sunrise / 1000) : sunrise;
      const normalizedSunset = sunset > 10_000_000_000 ? Math.round(sunset / 1000) : sunset;
      return normalizedDt < normalizedSunrise || normalizedDt > normalizedSunset;
    }
  }

  return false;
}

function getWeatherBackgroundType(condition: unknown): WeatherBackgroundType {
  const text = collectWeatherConditionText(condition).join(' ').toLowerCase();
  const weatherCode = readWeatherConditionCode(condition);
  const clouds = readWeatherCloudCover(condition);
  const isNight = isWeatherNight(condition);

  if (weatherCode != null) {
    if (weatherCode >= 600 && weatherCode < 700) return isNight ? 'snowNight' : 'snowDay';
    if ((weatherCode >= 200 && weatherCode < 600) || weatherCode === 771 || weatherCode === 781) {
      return isNight ? 'rainNight' : 'rainDay';
    }
    if (weatherCode >= 700 && weatherCode < 800) return isNight ? 'fogNight' : 'fogDay';
    if (weatherCode >= 802 && weatherCode < 805) return isNight ? 'cloudNight' : 'cloudDay';
    if (weatherCode === 801 && clouds != null && clouds >= 45) return isNight ? 'cloudNight' : 'cloudDay';
    if (weatherCode === 800) return isNight ? 'clearNight' : 'clearDay';
  }

  if (/\b(snow|flurries|flurry|blizzard|sleet|ice pellets?|wintry mix|winter)\b/.test(text)) {
    return isNight ? 'snowNight' : 'snowDay';
  }
  if (/\b(freezing rain|rain|drizzle|showers?|thunderstorm|storm)\b/.test(text)) {
    return isNight ? 'rainNight' : 'rainDay';
  }
  if (/\b(fog|mist|haze|smoke|dust|sand|ash|squall)\b/.test(text)) {
    return isNight ? 'fogNight' : 'fogDay';
  }
  if (/\b(clouds?|cloudy|overcast)\b/.test(text) || (clouds != null && clouds >= 45)) {
    return isNight ? 'cloudNight' : 'cloudDay';
  }
  if (/\b(clear|sunny|mostly sunny|fair)\b/.test(text)) {
    return isNight ? 'clearNight' : 'clearDay';
  }
  return isNight ? 'cloudNight' : 'cloudDay';
}

function getCommandWeatherConditionSource(snapshot: ECSWeatherSnapshot): unknown {
  return {
    condition: snapshot.current.condition,
    description: snapshot.current.description,
    main: snapshot.current.condition,
    precipType: snapshot.current.precipType,
    iconCode: snapshot.current.iconCode,
    clouds: snapshot.raw?.current?.clouds,
    weatherId: snapshot.raw?.current?.weather_id,
    weather_icon: snapshot.raw?.current?.weather_icon,
    dt: snapshot.raw?.current?.dt,
    sunrise: snapshot.current.sunrise ?? snapshot.raw?.current?.sunrise,
    sunset: snapshot.current.sunset ?? snapshot.raw?.current?.sunset,
    current: snapshot.current,
    weather: [
      {
        main: snapshot.current.condition,
        description: snapshot.current.description,
        id: snapshot.raw?.current?.weather_id,
        icon: snapshot.current.iconCode ?? snapshot.raw?.current?.weather_icon,
      },
    ],
    headline: formatWeatherHeadline(snapshot),
  };
}

function resolveCommandWeatherBackgroundType(snapshot: ECSWeatherSnapshot, weatherAvailable: boolean): WeatherBackgroundType {
  if (!weatherAvailable) return 'cloudDay';
  return getWeatherBackgroundType(getCommandWeatherConditionSource(snapshot));
}

function resolveCommandWeatherScene(snapshot: ECSWeatherSnapshot, weatherAvailable: boolean): CommandWeatherSceneKind {
  if (!weatherAvailable) return 'unavailable';
  switch (resolveCommandWeatherBackgroundType(snapshot, weatherAvailable)) {
    case 'clearDay':
    case 'clearNight':
      return 'clear';
    case 'rainDay':
    case 'rainNight':
      return 'rain';
    case 'snowDay':
    case 'snowNight':
      return 'snow';
    case 'fogDay':
    case 'fogNight':
    case 'cloudDay':
    case 'cloudNight':
    default:
      return 'overcast';
  }
}

function formatCommandWeatherHumidity(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'HUM --';
  return `HUM ${Math.max(0, Math.round(value))}%`;
}

function formatCommandWeatherFeelsLike(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return 'FEELS --';
  return `FEELS ${formatWeatherDegrees(value)}`;
}

function formatCommandWeatherWind(snapshot: ECSWeatherSnapshot): string {
  if (snapshot.current.windSpeed == null || !Number.isFinite(snapshot.current.windSpeed)) return 'WIND --';
  const direction = snapshot.current.windDirection && snapshot.current.windDirection !== '--'
    ? ` ${snapshot.current.windDirection}`
    : '';
  return `WIND ${Math.round(snapshot.current.windSpeed)}${direction}`;
}

function readAttitudeCommandNumber(source: unknown, paths: string[]): number | null {
  const readPath = (value: unknown, path: string): unknown =>
    path.split('.').reduce<unknown>((acc, key) => {
      if (acc == null || typeof acc !== 'object') return undefined;
      return (acc as Record<string, unknown>)[key];
    }, value);

  for (const path of paths) {
    const value = readPath(source, path);
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function resolveAttitudeCommandDaylight(
  snapshot: ReturnType<typeof useOperationalWeather>['snapshot'],
  options?: WidgetRenderOptions,
): {
  daylight: string;
  daylightLabel: string;
  daylightTone: WidgetTone;
  glare: string;
  glareTone: WidgetTone;
  support: string;
  sunset: string;
  sunrise: string;
  civilTwilight: string;
  source: string;
  updated: string;
  location: string;
  latitude: string;
  longitude: string;
  sunElevation: string;
  sunAzimuth: string;
  phase: string;
  radiancePhase: CommandSunlightRadiancePhase;
  backgroundType: SunlightBackgroundType;
  uvIndex: string;
  unavailableReason: 'location-required' | 'waiting-position' | 'unavailable' | null;
} {
  const solarTimes = getWeatherSolarTimes(snapshot.raw);
  const liveSunrise = solarTimes.sunrise != null ? new Date(solarTimes.sunrise * 1000) : null;
  const liveSunset = solarTimes.sunset != null ? new Date(solarTimes.sunset * 1000) : null;
  const hasGpsSolarFallback =
    options?.gpsHasFix === true &&
    typeof options.gpsLatitude === 'number' &&
    Number.isFinite(options.gpsLatitude) &&
    typeof options.gpsLongitude === 'number' &&
    Number.isFinite(options.gpsLongitude);
  const sunElevation = readAttitudeCommandNumber(snapshot.raw, [
    'current.sun_elevation',
    'current.sunElevation',
    'current.solar_elevation',
    'current.solarElevation',
    'current.sun.elevation',
    'current.solar.elevation',
  ]);
  const sunAzimuth = readAttitudeCommandNumber(snapshot.raw, [
    'current.sun_azimuth',
    'current.sunAzimuth',
    'current.solar_azimuth',
    'current.solarAzimuth',
    'current.sun.azimuth',
    'current.solar.azimuth',
  ]);
  const uvIndex = readAttitudeCommandNumber(snapshot.raw, [
    'current.uvi',
    'current.uv',
    'current.uv_index',
    'current.uvIndex',
    'daily.0.uvi',
    'daily.0.uv',
    'daily.0.uv_index',
    'daily.0.uvIndex',
  ]);
  const updatedSource = snapshot.status.timestampMs ?? snapshot.status.cachedAt ?? snapshot.fetchedAt ?? null;
  const updated = updatedSource ? formatAttitudeCommandTimestamp(updatedSource) : 'Unavailable';

  if (!liveSunset && !hasGpsSolarFallback) {
    const unavailableReason =
      snapshot.status.kind === 'permission-blocked'
        ? 'location-required'
        : snapshot.status.kind === 'loading'
          ? 'waiting-position'
          : 'unavailable';
    const support =
      unavailableReason === 'location-required'
        ? 'Location required'
        : unavailableReason === 'waiting-position'
          ? 'Waiting for current position'
          : 'Sunlight data unavailable';
    return {
      daylight: 'Unavailable',
      daylightLabel: 'Sunlight data unavailable',
      daylightTone: 'unavailable',
      glare: 'Glare Unknown',
      glareTone: 'unavailable',
      support,
      sunset: 'Unavailable',
      sunrise: 'Unavailable',
      civilTwilight: 'Unavailable',
      source: 'No location or weather solar time',
      updated,
      location: snapshot.locationName || 'Current position unavailable',
      latitude: 'Unavailable',
      longitude: 'Unavailable',
      sunElevation: sunElevation != null ? `${Math.round(sunElevation)} deg` : 'Unavailable',
      sunAzimuth: sunAzimuth != null ? `${Math.round(sunAzimuth)} deg` : 'Unavailable',
      phase: 'Unavailable',
      radiancePhase: 'unavailable',
      backgroundType: getSunlightBackgroundType({ radiancePhase: 'unavailable', phase: 'Unavailable' }),
      uvIndex: formatCommandUvIndex(uvIndex),
      unavailableReason,
    };
  }

  const now = new Date();
  const lat = hasGpsSolarFallback ? options!.gpsLatitude! : null;
  const lon = hasGpsSolarFallback ? options!.gpsLongitude! : null;
  const environment = buildEnvironmentSnapshot({
    coordinate: hasGpsSolarFallback
      ? {
          latitude: lat,
          longitude: lon,
          accuracyM: options?.gpsAccuracyM ?? null,
          altitudeFt: options?.gpsAltitudeFt ?? null,
          source: 'gps',
          updatedAt: options?.gpsTimestampMs ?? null,
        }
      : null,
    regionLabel: snapshot.locationName || null,
    regionSource: snapshot.locationName ? 'weather_provider' : 'unavailable',
    solarTimes: {
      sunrise: solarTimes.sunrise,
      sunset: solarTimes.sunset,
      source: 'weather_provider',
      updatedAt: updatedSource,
    },
    nowMs: now.getTime(),
  });
  const remainingHours =
    environment.sunlight.remainingMinutes == null
      ? null
      : environment.sunlight.remainingMinutes / 60;
  const isNightCountdown = environment.sunlight.nextEvent === 'sunrise';
  const daylightLabel = getSunlightCountdownLabel(environment.sunlight);
  const daylightValue = formatSunlightCountdownValue(environment.sunlight);
  const hourFormatter = environment.timezone.id
    ? new Intl.DateTimeFormat('en-US', {
        timeZone: environment.timezone.id,
        hour: 'numeric',
        hour12: false,
      })
    : null;
  const hour = hourFormatter ? Number(hourFormatter.format(now)) : now.getHours();
  const glareRisk = (hour >= 6 && hour <= 9) || (hour >= 16 && hour <= 19);
  const glareLevel = glareRisk ? 'Glare' : 'No Glare';
  const glareTone: WidgetTone = glareRisk ? 'attention' : 'neutral';
  const sunsetLabel = formatEnvironmentTime(environment.sunlight.sunsetIso, environment.timezone.id);
  const sunriseLabel = formatEnvironmentTime(environment.sunlight.sunriseIso, environment.timezone.id);
  const civilTwilight = formatEnvironmentTime(environment.sunlight.civilTwilightEndIso, environment.timezone.id);
  const source = environment.sunlight.source === 'weather_provider'
    ? `Weather solar time${liveSunrise ? ' with sunrise' : ''}`
    : getSunlightSourceLabel(environment.sunlight);
  const daylightTone: WidgetTone =
    remainingHours == null
      ? 'unavailable'
      : isNightCountdown
        ? 'attention'
        : remainingHours < 1
          ? 'attention'
          : 'good';
  const phase = resolveCommandSunlightRadiancePhase({
    hour,
    remainingHours,
    unavailable: daylightTone === 'unavailable',
    nextEvent: environment.sunlight.nextEvent,
    status: environment.sunlight.status,
  });
  const supportEvent = isNightCountdown ? `Sunrise ${sunriseLabel}` : `Sunset ${sunsetLabel}`;

  return {
    daylight: daylightValue,
    daylightLabel,
    daylightTone,
    glare: glareLevel,
    glareTone,
    support: environment.sunlight.source === 'weather_provider' ? supportEvent : getSunlightSourceLabel(environment.sunlight),
    sunset: sunsetLabel,
    sunrise: sunriseLabel,
    civilTwilight,
    source,
    updated,
    location: environment.region.label || snapshot.locationName || (hasGpsSolarFallback ? 'Current position' : 'Weather source'),
    latitude: lat != null ? `${lat.toFixed(4)} deg` : 'Weather source',
    longitude: lon != null ? `${lon.toFixed(4)} deg` : 'Weather source',
    sunElevation: sunElevation != null ? `${Math.round(sunElevation)} deg` : 'Unavailable',
    sunAzimuth: sunAzimuth != null ? `${Math.round(sunAzimuth)} deg` : 'Unavailable',
    phase: phase.phase,
    radiancePhase: phase.radiancePhase,
    // When ECS is counting down to sunrise, it is currently night. Keep the
    // visual state honest even near dawn, while preserving daytime behavior
    // for sunset countdowns.
    backgroundType: isNightCountdown
      ? 'night'
      : getSunlightBackgroundType({
          radiancePhase: phase.radiancePhase,
          phase: phase.phase,
          status: environment.sunlight.status,
          localHour: hour,
        }),
    uvIndex: formatCommandUvIndex(uvIndex),
    unavailableReason: null,
  };
}

function AttitudeCommandPanel({
  eyebrow,
  title,
  detail,
  icon,
  tone = 'neutral',
  align = 'left',
  onPress,
  accessibilityLabel,
  sunlightVisual,
  weatherVisual,
  vehicleVisual,
  routeVisual,
  powerVisual,
  children,
}: {
  eyebrow: string;
  title: string;
  detail?: string | null;
  icon?: string;
  tone?: WidgetTone;
  align?: 'left' | 'center' | 'right';
  onPress?: () => void;
  accessibilityLabel?: string;
  sunlightVisual?: CommandSunlightVisualData;
  weatherVisual?: CommandWeatherVisualData;
  vehicleVisual?: CommandVehicleVisualData;
  routeVisual?: CommandRouteVisualData;
  powerVisual?: CommandPowerVisualData;
  children?: React.ReactNode;
}) {
  const isSunlightPanel = eyebrow === 'REMAINING SUNLIGHT';
  const isWeatherPanel = eyebrow === 'CURRENT WEATHER';
  const isVehiclePanel = eyebrow === 'VEHICLE PROFILE';
  const isRoutePanel = eyebrow === 'ROUTE PROGRESS';
  const isPowerPanel = eyebrow === 'POWER MONITOR';
  const color = getWidgetToneColor(tone);
  const statusPill =
    isSunlightPanel || isWeatherPanel || isRoutePanel || isPowerPanel
      ? null
      : tone === 'live'
      ? { label: 'LIVE', tone }
      : tone === 'good'
        ? { label: 'READY', tone }
        : tone === 'attention' || tone === 'warning' || tone === 'degraded' || tone === 'stale'
          ? { label: 'WATCH', tone }
          : tone === 'critical'
            ? { label: 'ALERT', tone }
            : null;
  const content = (
    <ECSInstrumentPanel
      title={isSunlightPanel ? undefined : isVehiclePanel ? 'Vehicle Profile' : eyebrow}
      header={isSunlightPanel ? (
        <View style={attitudeCommandS.sunPanelHeader}>
          {icon ? (
            <View style={attitudeCommandS.sunPanelHeaderIcon}>
              <Ionicons name={icon as any} size={10} color={color} />
            </View>
          ) : null}
          <Text
            style={attitudeCommandS.sunPanelHeaderTitle}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.64}
          >
            Remaining Sunlight
          </Text>
        </View>
      ) : undefined}
      icon={icon && !isPowerPanel ? <Ionicons name={icon as any} size={11} color={color} /> : null}
      statusPill={statusPill}
      titleAlign={align}
      sizeVariant={eyebrow === 'ROUTE PROGRESS' || eyebrow === 'POWER MONITOR' ? 'wide' : 'compact'}
      glowIntensity={tone === 'live' || tone === 'good' ? 'medium' : tone === 'critical' ? 'high' : 'low'}
      active={tone === 'live' || tone === 'good'}
      selected={tone === 'attention' || tone === 'warning' || tone === 'critical'}
      showActiveEdge={false}
      innerTexture={false}
      style={attitudeCommandS.panelFrame}
      contentStyle={attitudeCommandS.panelFrameContent}
      background={(
        <AttitudeCommandPanelVisual
          icon={icon}
          color={color}
          tone={tone}
          sunlight={sunlightVisual}
          weather={weatherVisual}
          vehicle={vehicleVisual}
          route={routeVisual}
          power={powerVisual}
        />
      )}
    >
      <View style={[
        attitudeCommandS.panelContent,
        isSunlightPanel && attitudeCommandS.sunPanelContent,
        isWeatherPanel && attitudeCommandS.weatherPanelContent,
        isVehiclePanel && attitudeCommandS.vehiclePanelContent,
        isRoutePanel && attitudeCommandS.routePanelContent,
        isPowerPanel && attitudeCommandS.powerPanelContent,
        align === 'center' && attitudeCommandS.panelContentCenter,
        align === 'right' && attitudeCommandS.panelContentRight,
      ]}>
        {isSunlightPanel ? (
          <View pointerEvents="none" style={attitudeCommandS.sunlightBottomReadout}>
            <View style={attitudeCommandS.sunlightRemainingBlock}>
              <Text style={attitudeCommandS.sunlightBottomLabel} numberOfLines={1}>
                {sunlightVisual?.countdownLabel ?? 'Daylight remaining'}
              </Text>
              <Text
                style={[attitudeCommandS.sunlightTimeReadout, { color: 'rgba(247, 201, 104, 0.9)' }]}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.68}
              >
                {title}
              </Text>
            </View>
            <View style={attitudeCommandS.sunlightRiseSetStack}>
              <Text style={attitudeCommandS.sunlightRiseSetText} numberOfLines={1}>
                RISE {sunlightVisual?.sunrise ?? '--'}
              </Text>
              <Text style={attitudeCommandS.sunlightRiseSetText} numberOfLines={1}>
                SET {sunlightVisual?.sunset ?? '--'}
              </Text>
            </View>
          </View>
        ) : !isVehiclePanel && !isPowerPanel ? (
          <Text
            style={[
              attitudeCommandS.panelTitle,
              { color },
              align === 'center' && attitudeCommandS.panelTextCenter,
              align === 'right' && attitudeCommandS.panelTextRight,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.74}
          >
            {title}
          </Text>
        ) : null}
        {detail && !isSunlightPanel && !isVehiclePanel && !isPowerPanel ? (
          <Text
            style={[
              attitudeCommandS.panelDetail,
              align === 'center' && attitudeCommandS.panelTextCenter,
              align === 'right' && attitudeCommandS.panelTextRight,
            ]}
            numberOfLines={2}
          >
            {detail}
          </Text>
        ) : null}
        {children}
      </View>
    </ECSInstrumentPanel>
  );
  const panelStyle = [attitudeCommandS.panel, align === 'center' && attitudeCommandS.panelCenter, align === 'right' && attitudeCommandS.panelRight];

  if (onPress) {
    return (
      <TouchableOpacity
        style={panelStyle}
        onPress={onPress}
        onLongPress={() => {}}
        delayLongPress={650}
        activeOpacity={0.78}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel || `${eyebrow}: ${title}`}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return (
    <View style={panelStyle}>
      {content}
    </View>
  );
}

function AttitudeCommandDetailRow({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string | number | null | undefined;
  tone?: WidgetTone;
}) {
  const displayValue = value == null || value === '' ? 'Unavailable' : String(value);
  const color = getWidgetToneColor(tone);
  return (
    <View style={attitudeCommandS.detailRow}>
      <Text style={attitudeCommandS.detailLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[attitudeCommandS.detailValue, { color }]} numberOfLines={2}>
        {displayValue}
      </Text>
    </View>
  );
}

function AttitudeCommandUnavailableNotice({ message }: { message: string }) {
  return (
    <View style={attitudeCommandS.unavailableNotice}>
      <Ionicons name="information-circle-outline" size={16} color={TACTICAL.amber} />
      <Text style={attitudeCommandS.unavailableText}>{message}</Text>
    </View>
  );
}

function ECSCommandModulePlaceholder({
  definition,
  tone = 'neutral',
  statusLabel,
  metrics,
  background,
}: {
  definition: ECSCommandModuleDefinition;
  tone?: WidgetTone;
  statusLabel: string;
  metrics: ECSCommandModuleMetric[];
  background?: React.ReactNode;
}) {
  const color = getWidgetToneColor(tone);

  return (
    <View style={attitudeCommandS.moduleHost}>
      {background ? (
        <View pointerEvents="none" style={attitudeCommandS.moduleBackgroundLayer}>
          {background}
        </View>
      ) : null}
      <View pointerEvents="none" style={attitudeCommandS.moduleTopoLayer}>
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineA]} />
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineB]} />
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineC]} />
      </View>

      <View style={attitudeCommandS.moduleContent}>
        <View style={attitudeCommandS.moduleHeaderRow}>
          <View style={[attitudeCommandS.moduleIconChip, { borderColor: `${color}38` }]}>
            <Ionicons name={definition.icon as any} size={15} color={color} />
          </View>
          <View style={attitudeCommandS.moduleHeaderText}>
            <Text style={[attitudeCommandS.moduleLabel, { color }]} numberOfLines={1}>
              {definition.label}
            </Text>
            <Text style={attitudeCommandS.moduleDescription} numberOfLines={2}>
              {definition.description}
            </Text>
          </View>
          <View style={[attitudeCommandS.moduleStatusChip, { borderColor: `${color}3d` }]}>
            <Text style={[attitudeCommandS.moduleStatusText, { color }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <View style={attitudeCommandS.moduleMetricGrid}>
          {metrics.map((metric) => {
            const metricColor = getWidgetToneColor(metric.tone ?? tone);
            return (
              <View key={`${definition.id}-${metric.label}`} style={attitudeCommandS.moduleMetric}>
                <Text style={attitudeCommandS.moduleMetricLabel} numberOfLines={1}>
                  {metric.label}
                </Text>
                <Text style={[attitudeCommandS.moduleMetricValue, { color: metricColor }]} numberOfLines={1}>
                  {metric.value}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

function RouteCommandModule({
  definition,
  routeProgress,
}: {
  definition: ECSCommandModuleDefinition;
  routeProgress: RouteProgressSnapshot | null;
}) {
  const isActive = Boolean(routeProgress?.isActive);
  const tone: WidgetTone = isActive ? routeProgress?.stateTone ?? 'live' : 'neutral';
  const color = getWidgetToneColor(tone);
  const progressPercent = isActive
    ? Math.max(0, Math.min(100, Math.round(routeProgress?.progressPercent ?? 0)))
    : 0;
  const nextInstruction = routeProgress?.nextInstruction?.trim() || null;
  const nextDistance =
    routeProgress?.nextInstructionDistanceText && routeProgress.nextInstructionDistanceText !== '--'
      ? routeProgress.nextInstructionDistanceText
      : null;
  const warningLine =
    routeProgress?.warningLine && !routeProgress.warningLine.toLowerCase().startsWith('no route warning')
      ? routeProgress.warningLine
      : routeProgress?.navigationStatus ?? null;
  const routeLabel = routeProgress?.routeLabel?.trim() || 'Active route';
  const statusLabel = isActive ? routeProgress?.stateLabel ?? 'ACTIVE' : 'STANDBY';
  const metricRows = [
    { label: 'Remaining', value: routeProgress?.remainingMilesText ?? '--', tone: 'live' as WidgetTone },
    { label: 'Completed', value: routeProgress?.completedMilesText ?? '--', tone: 'good' as WidgetTone },
    { label: 'ETA', value: routeProgress?.etaLabel ?? '--', tone: 'attention' as WidgetTone },
    { label: 'Total', value: routeProgress?.totalMilesText ?? '--', tone: 'neutral' as WidgetTone },
  ];

  return (
    <View style={attitudeCommandS.moduleHost}>
      <View pointerEvents="none" style={attitudeCommandS.moduleTopoLayer}>
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineA]} />
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineB]} />
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineC]} />
      </View>

      <View style={attitudeCommandS.routeCommandContent}>
        <View style={attitudeCommandS.moduleHeaderRow}>
          <View style={[attitudeCommandS.moduleIconChip, { borderColor: `${color}38` }]}>
            <Ionicons name={definition.icon as any} size={15} color={color} />
          </View>
          <View style={attitudeCommandS.moduleHeaderText}>
            <Text style={[attitudeCommandS.moduleLabel, { color }]} numberOfLines={1}>
              {definition.label}
            </Text>
            <Text style={attitudeCommandS.moduleDescription} numberOfLines={1}>
              {isActive ? routeLabel : 'Guidance standby'}
            </Text>
          </View>
          <View style={[attitudeCommandS.moduleStatusChip, { borderColor: `${color}3d` }]}>
            <Text style={[attitudeCommandS.moduleStatusText, { color }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {isActive ? (
          <>
            <View style={attitudeCommandS.routeCommandMainRow}>
              <View
                style={[
                  attitudeCommandS.routeCommandProgressRing,
                  {
                    borderColor: `${color}58`,
                    shadowColor: color,
                  },
                ]}
              >
                <Text style={[attitudeCommandS.routeCommandProgressValue, { color }]} numberOfLines={1}>
                  {progressPercent}%
                </Text>
                <Text style={attitudeCommandS.routeCommandProgressLabel} numberOfLines={1}>
                  COMPLETE
                </Text>
              </View>

              <View style={attitudeCommandS.routeCommandMetricStack}>
                {metricRows.map((metric) => {
                  const metricColor = getWidgetToneColor(metric.tone);
                  return (
                    <View key={metric.label} style={attitudeCommandS.routeCommandMetricRow}>
                      <Text style={attitudeCommandS.routeCommandMetricLabel} numberOfLines={1}>
                        {metric.label}
                      </Text>
                      <Text style={[attitudeCommandS.routeCommandMetricValue, { color: metricColor }]} numberOfLines={1}>
                        {metric.value}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={[attitudeCommandS.routeCommandManeuver, { borderColor: `${color}2f` }]}>
              <View style={[attitudeCommandS.routeCommandManeuverIcon, { borderColor: `${color}36` }]}>
                <Ionicons name="git-branch-outline" size={15} color={color} />
              </View>
              <View style={attitudeCommandS.routeCommandManeuverCopy}>
                <Text style={attitudeCommandS.routeCommandManeuverLabel} numberOfLines={1}>
                  NEXT MANEUVER
                </Text>
                <Text style={attitudeCommandS.routeCommandManeuverTitle} numberOfLines={2}>
                  {nextInstruction ?? 'Next maneuver unavailable'}
                </Text>
              </View>
              <Text style={[attitudeCommandS.routeCommandManeuverDistance, { color }]} numberOfLines={1}>
                {nextDistance ?? 'DIST --'}
              </Text>
            </View>

            <View style={attitudeCommandS.routeCommandFooterRow}>
              <Text style={attitudeCommandS.routeCommandFooterText} numberOfLines={1}>
                {warningLine ?? 'Route status unavailable'}
              </Text>
              <Text style={[attitudeCommandS.routeCommandFooterText, attitudeCommandS.routeCommandFooterRight]} numberOfLines={1}>
                {routeProgress?.confidenceLine ?? 'Confidence unavailable'}
              </Text>
            </View>
          </>
        ) : (
          <View style={attitudeCommandS.routeCommandEmpty}>
            <Ionicons name="navigate-outline" size={25} color="rgba(245, 199, 73, 0.72)" />
            <Text style={attitudeCommandS.routeCommandEmptyTitle} numberOfLines={1}>
              No active route
            </Text>
            <Text style={attitudeCommandS.routeCommandEmptyText} numberOfLines={2}>
              Start guidance from Navigate or Explore
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

function formatAttitudeCommandTimestamp(value: string | number | null | undefined): string {
  if (value == null || value === '') return 'Unavailable';
  const date = typeof value === 'number' ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAttitudeWeatherVisibility(visibilityMeters: number | null | undefined): string {
  if (visibilityMeters == null || !Number.isFinite(visibilityMeters)) return 'Visibility unavailable';
  if (visibilityMeters >= 1609.34) {
    const miles = visibilityMeters / 1609.34;
    return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
  }
  return `${Math.max(0, Math.round(visibilityMeters))} m`;
}

function formatAttitudeWeatherPrecipitation(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string {
  const chance = snapshot.current.precipChance;
  if (chance == null || !Number.isFinite(chance)) return 'Precipitation unavailable';
  const normalizedChance = chance <= 1 ? chance * 100 : chance;
  const label = snapshot.current.precipType === 'snow' ? 'Snow' : 'Rain';
  return `${label} ${Math.max(0, Math.round(normalizedChance))}%`;
}

function formatAttitudeWeatherLastUpdated(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string {
  return formatAttitudeCommandTimestamp(
    snapshot.status.timestampMs ??
      snapshot.status.cachedAt ??
      snapshot.fetchedAt ??
      snapshot.normalized.updatedAt ??
      null,
  );
}

function resolveAttitudeWeatherNotice(
  snapshot: ReturnType<typeof useOperationalWeather>['snapshot'],
  weatherAvailable: boolean,
): string | null {
  const weatherFreshness = getWeatherSnapshotStaleness(snapshot);
  if (weatherFreshness === 'stale' || weatherFreshness === 'very_stale' || snapshot.status.kind === 'stale' || snapshot.status.kind === 'offline') {
    return 'Weather data stale. Showing last known weather from ECS cache.';
  }

  if (weatherAvailable) return null;

  switch (snapshot.status.kind) {
    case 'permission_required':
    case 'permission-blocked':
      return 'Permission required. Grant location access so ECS can load current-location weather.';
    case 'waiting_for_gps':
    case 'loading':
      return 'Location unavailable. Waiting for current position before ECS can resolve weather.';
    case 'network-blocked':
    case 'provider_error':
    case 'error':
      return 'Weather provider unavailable. Reconnect or wait for provider recovery to refresh current weather.';
    case 'unavailable':
      return 'Weather unavailable. ECS needs a valid coordinate or cached forecast for this location.';
    default:
      return 'Weather provider unavailable. ECS does not have current weather for this location.';
  }
}

function getWeatherForecastProviderLabel(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string | null {
  const statusSource = snapshot.status.source;
  if (typeof statusSource === 'string' && statusSource.trim()) return statusSource;
  if (statusSource && typeof statusSource === 'object') {
    const record = statusSource as Record<string, unknown>;
    for (const key of ['provider', 'providerId', 'provider_id', 'source', 'type', 'name']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return snapshot.normalized.source ?? null;
}

function getWeatherForecastKeyScope(
  snapshot: ReturnType<typeof useOperationalWeather>['snapshot'],
  widgetType: string,
): WeatherForecastRowKeyScope {
  return {
    widgetType,
    sourceType: snapshot.sourceType,
    provider: getWeatherForecastProviderLabel(snapshot),
    locationName: snapshot.locationName,
    routeScope: snapshot.sourceType,
  };
}

function getAttitudeWeatherForecastRows(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): WeatherForecastRenderRow[] {
  return normalizeWeatherForecastRows(
    getNormalizedForecastDays(snapshot),
    getWeatherForecastKeyScope(snapshot, 'attitude-command-weather'),
    {
      label: (day, index) => `Forecast ${formatForecastDateLabel(day) || index + 1}`,
      value: (day) => formatForecastDetailLine(day) || 'Forecast unavailable',
    },
    3,
  );
}

type AttitudePowerDevice = ReturnType<typeof useUnifiedPowerDevices>['devices'][number];
type AttitudePowerSummary = ReturnType<typeof normalizePowerTelemetrySummary>;
type AttitudePowerFlowDirection = 'inward' | 'outward' | 'idle' | 'unavailable';

type AttitudePowerFlowState = {
  direction: AttitudePowerFlowDirection;
  label: string;
  detail: string;
  tone: WidgetTone;
};

function formatAttitudePowerWatts(value: number | null | undefined, direction?: 'input' | 'output'): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  const rounded = Math.max(0, Math.round(value));
  if (direction === 'input' && rounded > 0) return `+${rounded}W`;
  if (direction === 'output' && rounded > 0) return `-${rounded}W`;
  return `${rounded}W`;
}

function formatAttitudePowerWattsCompact(value: number | null | undefined, direction?: 'input' | 'output'): string {
  if (value == null || !Number.isFinite(value)) return '--';
  const rounded = Math.max(0, Math.round(value));
  if (direction === 'input' && rounded > 0) return `+${rounded}W`;
  if (direction === 'output' && rounded > 0) return `-${rounded}W`;
  return `${rounded}W`;
}

function formatAttitudePowerMetric(value: number | null | undefined, unit: 'A' | 'V'): string {
  if (value == null || !Number.isFinite(value)) return 'Unavailable';
  const normalized = Math.abs(value);
  const precision = unit === 'V' ? 1 : 1;
  return `${normalized.toFixed(precision)}${unit}`;
}

function formatAttitudePowerState(state: AttitudePowerDevice['chargingState'] | null | undefined): string {
  switch (state) {
    case 'charging':
      return 'Charging';
    case 'discharging':
      return 'Discharging';
    case 'full':
      return 'Full';
    case 'idle':
      return 'Idle';
    default:
      return 'Unknown';
  }
}

function readAttitudePowerNumber(device: AttitudePowerDevice | null | undefined, fields: string[]): number | null {
  if (!device) return null;
  const record = device as unknown as Record<string, unknown>;
  for (const field of fields) {
    const raw = record[field];
    if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
    if (typeof raw === 'string' && raw.trim() !== '') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function resolveAttitudePowerFlowState(summary: AttitudePowerSummary): AttitudePowerFlowState {
  if (!summary.isLive) {
    return {
      direction: 'unavailable',
      label: 'Power monitor unavailable',
      detail: summary.isStale ? 'Waiting for telemetry from the last known source.' : 'No live power source connected.',
      tone: 'unavailable',
    };
  }

  const inputWatts = Math.max(0, summary.inputWatts ?? 0);
  const outputWatts = Math.max(0, summary.outputWatts ?? 0);
  const deltaWatts = inputWatts - outputWatts;

  if (Math.abs(deltaWatts) <= 5) {
    return {
      direction: 'idle',
      label: summary.chargingState === 'full' ? 'Full / idle' : 'Idle / balanced',
      detail: 'Input and output are roughly balanced.',
      tone: 'neutral',
    };
  }

  if (deltaWatts > 0) {
    return {
      direction: 'inward',
      label: 'Charging',
      detail: `Net +${Math.round(deltaWatts)}W flowing into reserve.`,
      tone: 'good',
    };
  }

  return {
    direction: 'outward',
    label: 'Discharging',
    detail: `Net -${Math.round(Math.abs(deltaWatts))}W flowing to loads.`,
    tone: 'attention',
  };
}

function resolveAttitudePowerUnavailableMessage(
  power: ReturnType<typeof useUnifiedPowerDevices>,
  summary: AttitudePowerSummary,
): string | null {
  if (summary.isLive) return null;
  if (power.isAnyReconnecting) {
    return 'Waiting for telemetry. ECS sees a power source reconnecting but does not have live readings yet.';
  }
  if (summary.isStale) {
    return 'Waiting for telemetry. Last known power data is stale or disconnected.';
  }
  if (power.devices.length === 0) {
    return 'No live power source connected. Pair or connect a supported power source to populate reserve and flow data.';
  }
  return 'Power monitor unavailable. ECS cannot read live power telemetry from the configured source.';
}

function formatAttitudePowerDeviceLine(device: AttitudePowerDevice): string {
  const parts = [
    device.deviceName || device.providerDisplayName || 'Power source',
    device.role,
    device.connectionState !== 'connected' ? device.connectionState : null,
    device.isStale ? 'stale' : null,
  ].filter(Boolean);
  return parts.join(' | ');
}

function resolveAttitudePowerSources(
  power: ReturnType<typeof useUnifiedPowerDevices>,
  summary: AttitudePowerSummary,
): string {
  const liveSources = power.devices.filter((device) => device.connectionState === 'connected' && !device.isStale);
  if (liveSources.length > 0) {
    return liveSources.map(formatAttitudePowerDeviceLine).join('; ');
  }
  if (power.isAnyReconnecting) return 'Waiting for telemetry';
  if (summary.primaryDevice) return formatAttitudePowerDeviceLine(summary.primaryDevice);
  return 'No live power source connected';
}

function resolveAttitudePowerLoads(power: ReturnType<typeof useUnifiedPowerDevices>, summary: AttitudePowerSummary): string {
  if (!summary.isLive) return 'Power monitor unavailable';
  const drawingDevices = power.devices.filter((device) => (device.outputWatts ?? 0) > 0 && !device.isStale);
  if (drawingDevices.length === 0) return (summary.outputWatts ?? 0) > 0 ? `${Math.round(summary.outputWatts ?? 0)}W load` : 'No connected loads reporting draw';
  return drawingDevices
    .map((device) => `${device.deviceName || device.providerDisplayName || 'Power load'} ${formatAttitudePowerWatts(device.outputWatts, 'output')}`)
    .join('; ');
}

function addCommandPowerFlowRow(rows: CommandPowerFlowRow[], label: string, value: number | null, direction: 'input' | 'output'): void {
  if (value == null || !Number.isFinite(value) || value <= 0) return;
  rows.push({
    label: sanitizeCommandPowerFlowLabel(label, direction === 'input' ? 'Input' : 'Load'),
    value: formatAttitudePowerWattsCompact(value, direction),
    active: true,
  });
}

function resolveCommandPowerInputRows(
  power: ReturnType<typeof useUnifiedPowerDevices>,
  summary: AttitudePowerSummary,
  inputWatts: number | null,
  solarWatts: number | null,
  sourceLabel: string,
): CommandPowerFlowRow[] {
  if (!summary.canDisplayTelemetryValues) {
    return [
      { label: 'SOLAR', value: '--', active: false },
      { label: 'SOURCE', value: '--', active: false },
    ];
  }

  const rows: CommandPowerFlowRow[] = [];
  const primaryDevice = summary.primaryDevice;
  addCommandPowerFlowRow(rows, 'Solar', solarWatts, 'input');

  const alternatorWatts = readAttitudePowerNumber(primaryDevice, [
    'alternatorWatts',
    'alternatorInputWatts',
    'alternator_input_watts',
    'vehicleInputWatts',
    'vehicle_input_watts',
  ]);
  addCommandPowerFlowRow(rows, 'Alternator', alternatorWatts, 'input');

  const shoreWatts = readAttitudePowerNumber(primaryDevice, [
    'shoreWatts',
    'shoreInputWatts',
    'shore_input_watts',
    'acInputWatts',
    'ac_input_watts',
  ]);
  addCommandPowerFlowRow(rows, 'Shore/Aux', shoreWatts, 'input');

  const knownInput = rows.reduce((total, row) => {
    const parsed = Number(row.value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? total + Math.abs(parsed) : total;
  }, 0);
  const otherInput = inputWatts != null ? Math.max(0, inputWatts - knownInput) : null;
  if (rows.length === 0) {
    addCommandPowerFlowRow(rows, sourceLabel && sourceLabel !== 'Power source unavailable' ? sourceLabel : 'Input', inputWatts, 'input');
  } else if (otherInput != null && otherInput > 5) {
    addCommandPowerFlowRow(rows, 'Other', otherInput, 'input');
  }

  if (rows.length === 0 && power.isAnyReconnecting) {
    return [{ label: 'SOURCE', value: '--', active: false }];
  }

  return rows.slice(0, 3);
}

function resolveCommandPowerOutputRows(
  power: ReturnType<typeof useUnifiedPowerDevices>,
  summary: AttitudePowerSummary,
  outputWatts: number | null,
): CommandPowerFlowRow[] {
  if (!summary.canDisplayTelemetryValues) {
    return [
      { label: 'DC LOAD', value: '--', active: false },
    ];
  }

  const rows: CommandPowerFlowRow[] = [];
  const primaryDevice = summary.primaryDevice;
  const dcLoadWatts = readAttitudePowerNumber(primaryDevice, [
    'dcOutputWatts',
    'dc_output_watts',
    'dcLoadWatts',
    'dc_load_watts',
    'usbOutputWatts',
    'usb_output_watts',
  ]);
  addCommandPowerFlowRow(rows, 'DC load', dcLoadWatts, 'output');

  const inverterWatts = readAttitudePowerNumber(primaryDevice, [
    'inverterWatts',
    'inverterOutputWatts',
    'inverter_output_watts',
  ]);
  addCommandPowerFlowRow(rows, 'Inverter', inverterWatts, 'output');

  const knownOutput = rows.reduce((total, row) => {
    const parsed = Number(row.value.replace(/[^\d.-]/g, ''));
    return Number.isFinite(parsed) ? total + Math.abs(parsed) : total;
  }, 0);
  const otherOutput = outputWatts != null ? Math.max(0, outputWatts - knownOutput) : null;
  if (rows.length === 0) {
    addCommandPowerFlowRow(rows, 'Load', outputWatts, 'output');
  } else if (otherOutput != null && otherOutput > 5) {
    addCommandPowerFlowRow(rows, 'Other', otherOutput, 'output');
  }

  if (rows.length === 0 && power.isAnyReconnecting) {
    return [{ label: 'LOAD', value: '--', active: false }];
  }

  return rows.slice(0, 3);
}

function AttitudePowerLiquidFlowIndicator({ flow }: { flow: AttitudePowerFlowState }) {
  const reducedMotion = useReducedMotion();
  const flowAnim = useStableAnimatedValue(0);
  const shouldAnimate = !reducedMotion && (flow.direction === 'inward' || flow.direction === 'outward');

  useEffect(() => {
    flowAnim.stopAnimation();
    if (!shouldAnimate) {
      flowAnim.setValue(0.5);
      return undefined;
    }

    flowAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(flowAnim, {
        toValue: 1,
        duration: 1300,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      flowAnim.stopAnimation();
    };
  }, [flowAnim, shouldAnimate]);

  const flowColor = getWidgetToneColor(flow.tone);
  const translateX = flowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: flow.direction === 'outward' ? [46, -46] : [-46, 46],
  });
  const pulseOpacity = shouldAnimate
    ? flowAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 0.9, 0.2] })
    : 0.42;

  return (
    <View style={attitudeCommandS.powerFlowCard}>
      <View style={attitudeCommandS.powerFlowHeader}>
        <Text style={[attitudeCommandS.powerFlowLabel, { color: flowColor }]}>{flow.label}</Text>
        <Text style={attitudeCommandS.powerFlowDetail}>{flow.detail}</Text>
      </View>
      <View style={attitudeCommandS.powerFlowRail}>
        <Ionicons
          name={flow.direction === 'outward' ? 'arrow-up-outline' : 'arrow-down-outline'}
          size={14}
          color={flow.direction === 'unavailable' ? TACTICAL.textMuted : flowColor}
        />
        <View style={attitudeCommandS.powerFlowTrack}>
          <View style={[attitudeCommandS.powerFlowTrackTint, { backgroundColor: flowColor }]} />
          <Animated.View
            pointerEvents="none"
            style={[
              attitudeCommandS.powerFlowPulse,
              {
                backgroundColor: flowColor,
                opacity: pulseOpacity,
                transform: [{ translateX }],
              },
            ]}
          />
        </View>
        <Ionicons
          name="battery-charging-outline"
          size={15}
          color={flow.direction === 'unavailable' ? TACTICAL.textMuted : flowColor}
        />
      </View>
    </View>
  );
}

function PowerCommandModule({
  definition,
  power,
  summary,
  flow,
  tone,
}: {
  definition: ECSCommandModuleDefinition;
  power: CommandPowerVisualData;
  summary: AttitudePowerSummary;
  flow: AttitudePowerFlowState;
  tone: WidgetTone;
}) {
  const color = getWidgetToneColor(tone);
  const sourceModeLabel =
    summary.sourceState.isManual || summary.truth.isManual
      ? 'Manual entry'
      : summary.isLive
        ? 'Live telemetry'
        : summary.isStale
          ? 'Last known'
          : 'Unavailable';
  const statusLabel =
    summary.sourceState.isManual || summary.truth.isManual
      ? 'MANUAL'
      : summary.isLive
        ? 'LIVE'
        : summary.isStale
          ? 'STALE'
          : 'OFFLINE';
  const deviceName = sanitizeCommandPowerLabel(
    summary.primaryDevice?.deviceName ||
      summary.primaryDevice?.providerDisplayName ||
      power.sourceLabel ||
      summary.sourceLabel,
  );
  const stateLabel = formatAttitudePowerState(summary.chargingState);
  const canShowTelemetry = power.canDisplayTelemetryValues;
  const powerMetrics = [
    {
      label: 'Reserve',
      value: power.batteryPercent != null ? `${Math.round(power.batteryPercent)}%` : '--',
      tone: power.batteryPercent != null ? tone : 'unavailable',
    },
    {
      label: 'Input',
      value: formatAttitudePowerWattsCompact(power.inputWatts, 'input'),
      tone: power.inputWatts != null && power.inputWatts > 0 ? 'good' : 'neutral',
    },
    {
      label: 'Output',
      value: formatAttitudePowerWattsCompact(power.outputWatts, 'output'),
      tone: power.outputWatts != null && power.outputWatts > 0 ? 'attention' : 'neutral',
    },
    {
      label: 'Runtime',
      value: power.runtime,
      tone: power.runtime !== '--' ? 'good' : 'unavailable',
    },
  ] as const;

  return (
    <View style={attitudeCommandS.moduleHost}>
      <View pointerEvents="none" style={attitudeCommandS.powerCommandBackgroundLayer}>
        <AttitudeCommandPowerManagementVisual power={power} />
      </View>
      <View pointerEvents="none" style={attitudeCommandS.moduleTopoLayer}>
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineA]} />
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineB]} />
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineC]} />
      </View>

      <View style={attitudeCommandS.powerCommandContent}>
        <View style={attitudeCommandS.moduleHeaderRow}>
          <View style={[attitudeCommandS.moduleIconChip, { borderColor: `${color}38` }]}>
            <Ionicons name={definition.icon as any} size={15} color={color} />
          </View>
          <View style={attitudeCommandS.moduleHeaderText}>
            <Text style={[attitudeCommandS.moduleLabel, { color }]} numberOfLines={1}>
              {definition.label}
            </Text>
            <Text style={attitudeCommandS.moduleDescription} numberOfLines={1}>
              {deviceName}
            </Text>
          </View>
          <View style={[attitudeCommandS.moduleStatusChip, { borderColor: `${color}3d` }]}>
            <Text style={[attitudeCommandS.moduleStatusText, { color }]} numberOfLines={1}>
              {statusLabel}
            </Text>
          </View>
        </View>

        <View style={attitudeCommandS.powerCommandMainRow}>
          <View
            style={[
              attitudeCommandS.powerCommandReserveModule,
              {
                borderColor: `${color}62`,
                shadowColor: color,
              },
            ]}
          >
            <Text style={attitudeCommandS.powerCommandModuleLabel} numberOfLines={1}>
              BLU RESERVE
            </Text>
            <Text style={[attitudeCommandS.powerCommandReserveValue, { color }]} numberOfLines={1}>
              {power.batteryPercent != null ? `${Math.round(power.batteryPercent)}%` : '--'}
            </Text>
            <Text style={attitudeCommandS.powerCommandModuleState} numberOfLines={1}>
              {canShowTelemetry ? stateLabel : sourceModeLabel}
            </Text>
          </View>

          <View style={attitudeCommandS.powerCommandMetricStack}>
            {powerMetrics.map((metric) => {
              const metricColor = getWidgetToneColor(metric.tone);
              return (
                <View key={metric.label} style={attitudeCommandS.powerCommandMetric}>
                  <Text style={attitudeCommandS.powerCommandMetricLabel} numberOfLines={1}>
                    {metric.label}
                  </Text>
                  <Text style={[attitudeCommandS.powerCommandMetricValue, { color: metricColor }]} numberOfLines={1}>
                    {metric.value}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[attitudeCommandS.powerCommandFlowStatus, { borderColor: `${color}2f` }]}>
          <View style={[attitudeCommandS.powerCommandFlowIcon, { borderColor: `${color}36` }]}>
            <Ionicons
              name={
                flow.direction === 'inward'
                  ? 'arrow-down-outline'
                  : flow.direction === 'outward'
                    ? 'arrow-up-outline'
                    : 'swap-horizontal-outline'
              }
              size={15}
              color={color}
            />
          </View>
          <View style={attitudeCommandS.powerCommandFlowCopy}>
            <Text style={[attitudeCommandS.powerCommandFlowLabel, { color }]} numberOfLines={1}>
              {canShowTelemetry ? flow.label : sourceModeLabel}
            </Text>
            <Text style={attitudeCommandS.powerCommandFlowDetail} numberOfLines={2}>
              {canShowTelemetry ? flow.detail : power.unavailableMessage ?? 'Power telemetry unavailable'}
            </Text>
          </View>
        </View>

        <View style={attitudeCommandS.powerCommandFooterRow}>
          <Text style={attitudeCommandS.powerCommandFooterText} numberOfLines={1}>
            {sourceModeLabel}
          </Text>
          <Text style={[attitudeCommandS.powerCommandFooterText, attitudeCommandS.powerCommandFooterRight]} numberOfLines={1}>
            {sanitizeCommandPowerLabel(summary.sourceLabel)}
          </Text>
        </View>
      </View>
    </View>
  );
}

function EnvironmentalCommandModule({
  definition,
  environment,
}: {
  definition: ECSCommandModuleDefinition;
  environment: CommandEnvironmentalVisualData;
}) {
  const color = getWidgetToneColor(environment.statusTone);
  const daylightColor = getWidgetToneColor(environment.daylightTone);
  const weatherColor = getWidgetToneColor(environment.weatherTone);
  const elevationColor = getWidgetToneColor(environment.elevationTone);
  const remotenessColor = getWidgetToneColor(environment.remotenessTone);
  const remotenessMetricValue =
    environment.remoteness === 'Unknown'
      ? 'Unknown'
      : `${environment.remoteness} ${environment.remotenessDetail}`;
  const environmentalMetrics = [
    { label: 'Weather', value: environment.weatherValue, tone: environment.weatherTone },
    { label: 'Elevation', value: environment.elevation, tone: environment.elevationTone },
    { label: 'Remote', value: remotenessMetricValue, tone: environment.remotenessTone },
  ] as const;
  const nearestRows = [
    environment.nearestRoad,
    environment.nearestTown,
    environment.nearestFuel,
  ];

  return (
    <View style={attitudeCommandS.moduleHost}>
      <View pointerEvents="none" style={attitudeCommandS.moduleTopoLayer}>
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineA]} />
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineB]} />
        <View style={[attitudeCommandS.moduleTopoLine, attitudeCommandS.moduleTopoLineC]} />
      </View>

      <View style={attitudeCommandS.environmentCommandContent}>
        <View style={attitudeCommandS.moduleHeaderRow}>
          <View style={[attitudeCommandS.moduleIconChip, { borderColor: `${color}38` }]}>
            <Ionicons name={definition.icon as any} size={15} color={color} />
          </View>
          <View style={attitudeCommandS.moduleHeaderText}>
            <Text style={[attitudeCommandS.moduleLabel, { color }]} numberOfLines={1}>
              {definition.label}
            </Text>
            <Text style={attitudeCommandS.moduleDescription} numberOfLines={1}>
              {definition.description}
            </Text>
          </View>
          <View style={[attitudeCommandS.moduleStatusChip, { borderColor: `${color}3d` }]}>
            <Text style={[attitudeCommandS.moduleStatusText, { color }]} numberOfLines={1}>
              {environment.statusLabel}
            </Text>
          </View>
        </View>

        <View style={attitudeCommandS.environmentCommandMainRow}>
          <View style={[attitudeCommandS.environmentCommandDaylightModule, { borderColor: `${daylightColor}52`, shadowColor: daylightColor }]}>
            <View style={[attitudeCommandS.environmentCommandSunCore, { backgroundColor: `${daylightColor}2f`, shadowColor: daylightColor }]} />
            <Text style={attitudeCommandS.environmentCommandLabel} numberOfLines={1}>
              REMAINING SUNLIGHT
            </Text>
            <Text
              style={[attitudeCommandS.environmentCommandDaylightValue, { color: daylightColor }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.74}
            >
              {environment.daylight}
            </Text>
            <Text style={attitudeCommandS.environmentCommandDetail} numberOfLines={1}>
              {environment.phase}
            </Text>
          </View>

          <View style={attitudeCommandS.environmentCommandMetricStack}>
            {environmentalMetrics.map((metric) => {
              const metricColor = getWidgetToneColor(metric.tone);
              return (
                <View key={metric.label} style={attitudeCommandS.environmentCommandMetric}>
                  <Text style={attitudeCommandS.environmentCommandMetricLabel} numberOfLines={1}>
                    {metric.label}
                  </Text>
                  <Text style={[attitudeCommandS.environmentCommandMetricValue, { color: metricColor }]} numberOfLines={1}>
                    {metric.value}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={[attitudeCommandS.environmentCommandSignalRow, { borderColor: `${weatherColor}2f` }]}>
          <View style={[attitudeCommandS.environmentCommandSignalIcon, { borderColor: `${weatherColor}36` }]}>
            <Ionicons name="partly-sunny-outline" size={15} color={weatherColor} />
          </View>
          <View style={attitudeCommandS.environmentCommandSignalCopy}>
            <Text style={[attitudeCommandS.environmentCommandSignalLabel, { color: weatherColor }]} numberOfLines={1}>
              {environment.weatherDetail}
            </Text>
            <Text style={attitudeCommandS.environmentCommandSignalDetail} numberOfLines={1}>
              {environment.sunset} | {environment.uvIndex}
            </Text>
          </View>
          <Text style={[attitudeCommandS.environmentCommandSignalValue, { color: elevationColor }]} numberOfLines={1}>
            {environment.elevationSource}
          </Text>
        </View>

        <View style={attitudeCommandS.environmentCommandNearestRow}>
          {nearestRows.map((nearest) => (
            <Text key={nearest} style={[attitudeCommandS.environmentCommandNearestText, { color: remotenessColor }]} numberOfLines={1}>
              {nearest}
            </Text>
          ))}
        </View>

        <View style={attitudeCommandS.environmentCommandFooterRow}>
          <Text style={attitudeCommandS.environmentCommandFooterText} numberOfLines={1}>
            {environment.sunlightSource}
          </Text>
          <Text style={[attitudeCommandS.environmentCommandFooterText, attitudeCommandS.environmentCommandFooterRight]} numberOfLines={1}>
            {environment.footer}
          </Text>
        </View>
      </View>
    </View>
  );
}

type AttitudeCommandWidgetConnectedProps = VehicleAttitudeStageProps & {
  telemetryEnabled?: boolean;
  activeVehicleName?: string;
};

function AttitudeCommandWidgetConnected({
  telemetryEnabled,
  activeVehicleName,
  ...stageProps
}: AttitudeCommandWidgetConnectedProps) {
  void telemetryEnabled;
  void activeVehicleName;

  return <VehicleAttitudeStage {...stageProps} />;
}

const AttitudeCommandWidget = React.memo(function AttitudeCommandWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const [activePanel, setActivePanel] = useState<AttitudeCommandFocusPanel | null>(null);
  const [moduleSelectorVisible, setModuleSelectorVisible] = useState(false);
  const [selectedCommandModule, setSelectedCommandModule] = useState<ECSCommandModuleId>(() => ecsCommandModuleStore.selectedModule);
  const [commandLocalZeroOffset, setCommandLocalZeroOffset] = useState<{ rollDeg: number; pitchDeg: number } | null>(null);
  const [environmentalRevision, setEnvironmentalRevision] = useState(0);
  const moduleTransitionOpacity = useStableAnimatedValue(1);
  const reduceCommandModuleMotion = useReducedMotion();
  const rollDeg = options?.rollDeg ?? null;
  const pitchDeg = options?.pitchDeg ?? null;
  const sensorStatus = options?.sensorStatus || 'OFFLINE';
  const sampleTimestampMs = options?.sampleTimestampMs ?? null;
  const advanced = options?.advancedMode;
  const onCalibrate = options?.onCalibrate;
  const onResetCalibration = options?.onResetCalibration;
  const isCalibrated = options?.isCalibrated;
  const activeVehicleContext = useDashboardActiveVehicleContext();
  const attitudeVehicleId = resolveAttitudeMonitorVehicleId(activeVehicleContext);
  const attitudeTelemetry = useMemo(
    () =>
      normalizeDeviceAttitudeTelemetry({
        rollDeg,
        pitchDeg,
        sensorStatus,
        sampleTimestampMs,
      }),
    [pitchDeg, rollDeg, sampleTimestampMs, sensorStatus],
  );
  const displayState = useAttitudeMonitorDisplayState({
    rollDeg: attitudeTelemetry.rollDeg,
    pitchDeg: attitudeTelemetry.pitchDeg,
    sensorStatus,
    sampleTimestampMs: attitudeTelemetry.updatedAt,
    advanced,
    sourceOrigin: 'device_sensors',
    telemetryHealthOverride: attitudeTelemetry.displayHealth,
    sourceLabelOverride: attitudeTelemetry.sourceLabel,
    sourceShortLabelOverride: attitudeTelemetry.sourceLabel,
    sourceChipLabelOverride: attitudeTelemetry.sourceChipLabel,
    sourceStatusLineOverride: attitudeTelemetry.sourceStatusLine,
  });
  const { enabled: soundEnabled, toggle: toggleSoundEnabled } = useAttitudeMonitorSoundPreference();
  const handleToggleSound = useCallback(() => {
    void hapticMicro();
    toggleSoundEnabled();
  }, [toggleSoundEnabled]);
  const hasExternalZeroAction = Boolean(onCalibrate);
  const commandDisplayRollDeg = displayState.displayRollDeg ?? 0;
  const commandDisplayPitchDeg = displayState.displayPitchDeg ?? 0;
  const commandSensorLive = attitudeTelemetry.isLive && displayState.liveMotion;
  const commandStageRollDeg = commandSensorLive
    ? (hasExternalZeroAction ? commandDisplayRollDeg : (attitudeTelemetry.rollDeg ?? 0) - (commandLocalZeroOffset?.rollDeg ?? 0))
    : 0;
  const commandStagePitchDeg = commandSensorLive
    ? (hasExternalZeroAction ? commandDisplayPitchDeg : (attitudeTelemetry.pitchDeg ?? 0) - (commandLocalZeroOffset?.pitchDeg ?? 0))
    : 0;
  const commandStageStatusLabel = commandSensorLive ? displayState.postureLabel : attitudeTelemetry.sourceLabel;
  const commandStageStatusColor =
    displayState.tone === 'critical'
      ? TACTICAL.danger
      : displayState.tone === 'attention'
        ? TACTICAL.amber
        : commandSensorLive
          ? TACTICAL.text
          : TACTICAL.textMuted;
  const commandStageStatusBorderColor = commandSensorLive ? `${commandStageStatusColor}45` : 'rgba(139, 148, 158, 0.2)';
  const handleZeroCommandStage = useCallback(() => {
    if (onCalibrate) {
      onCalibrate();
      return;
    }

    if (!attitudeTelemetry.isLive || attitudeTelemetry.rollDeg == null || attitudeTelemetry.pitchDeg == null) {
      return;
    }

    setCommandLocalZeroOffset({ rollDeg: attitudeTelemetry.rollDeg, pitchDeg: attitudeTelemetry.pitchDeg });
  }, [attitudeTelemetry.isLive, attitudeTelemetry.pitchDeg, attitudeTelemetry.rollDeg, onCalibrate]);
  const handleResetCommandStageZero = useCallback(() => {
    if (onResetCalibration) {
      onResetCalibration();
      return;
    }

    setCommandLocalZeroOffset(null);
  }, [onResetCalibration]);
  const openFocusPanel = useCallback((panel: AttitudeCommandFocusPanel) => {
    void hapticMicro();
    setActivePanel(panel);
  }, []);
  const closeFocusPanel = useCallback(() => {
    setActivePanel(null);
  }, []);
  const openModuleSelector = useCallback(() => {
    void hapticMicro();
    setModuleSelectorVisible(true);
  }, []);
  const closeModuleSelector = useCallback(() => {
    setModuleSelectorVisible(false);
  }, []);
  const handleSelectCommandModule = useCallback((moduleId: ECSCommandModuleId) => {
    void hapticMicro();
    ecsCommandModuleStore.setSelectedModule(moduleId);
    setModuleSelectorVisible(false);
  }, []);
  const handleSelectCommandCenterMode = useCallback((mode: CommandCenterMode) => {
    void hapticMicro();
    ecsCommandModuleStore.setSelectedModule(centerModeToCommandModule(mode));
  }, []);

  useEffect(() => {
    return ecsCommandModuleStore.subscribe((moduleId) => {
      setSelectedCommandModule(moduleId);
    });
  }, []);

  useEffect(() => {
    const unsubscribe = remotenessStore.subscribe(() => {
      setEnvironmentalRevision((revision) => revision + 1);
    });
    const shouldRunRemoteness = selectedCommandModule === 'environmentalCommand';
    const shouldStopOnCleanup = shouldRunRemoteness && !remotenessStore.isRunning();

    if (shouldRunRemoteness) {
      remotenessStore.start();
    }

    return () => {
      unsubscribe();
      if (shouldStopOnCleanup) {
        remotenessStore.stop();
      }
    };
  }, [selectedCommandModule]);

  useEffect(() => {
    syncAttitudeApproachingLimitTone({
      severity: displayState.severity,
      telemetryHealth: displayState.telemetryHealth,
      soundEnabled: selectedCommandModule === 'attitude' && soundEnabled,
    });
  }, [displayState.severity, displayState.telemetryHealth, selectedCommandModule, soundEnabled]);

  useEffect(() => {
    if (reduceCommandModuleMotion) {
      moduleTransitionOpacity.setValue(1);
      return;
    }

    moduleTransitionOpacity.stopAnimation();
    moduleTransitionOpacity.setValue(0.28);
    Animated.timing(moduleTransitionOpacity, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [moduleTransitionOpacity, reduceCommandModuleMotion, selectedCommandModule]);

  const snapshot = useCanonicalWidgetWeatherSnapshot(data, options);
  const currentTempF = getCurrentWeatherTemperatureF(snapshot);
  const weatherAvailable = hasMeaningfulWeatherSnapshot(snapshot);
  const compactWeatherCondition = formatCompactWeatherCondition(snapshot.current.condition || formatWeatherHeadline(snapshot));
  const weatherTitle = weatherAvailable
    ? formatWeatherDegrees(currentTempF)
    : resolveWeatherWidgetState(snapshot).message.primary;
  const weatherDetail = weatherAvailable
    ? [compactWeatherCondition, formatWeatherWindLine(snapshot) || formatWeatherAlertLine(snapshot) || getCompactWeatherSourceLabel(snapshot)]
        .filter((part) => part && part !== '--')
        .join(' | ')
    : 'Weather unavailable';
  const weatherTone: WidgetTone =
    snapshot.alerts[0]?.severity === 'extreme'
      ? 'critical'
      : snapshot.alerts.length > 0
        ? 'attention'
        : weatherAvailable
          ? snapshot.status.kind === 'live'
            ? 'live'
            : snapshot.status.kind === 'cached' || snapshot.status.kind === 'stale' || snapshot.status.kind === 'offline'
              ? 'stale'
              : 'good'
          : 'unavailable';
  const weatherVisual: CommandWeatherVisualData = {
    scene: resolveCommandWeatherScene(snapshot, weatherAvailable),
    backgroundType: resolveCommandWeatherBackgroundType(snapshot, weatherAvailable),
    condition: weatherAvailable ? compactWeatherCondition : 'Unavailable',
    temperature: weatherAvailable ? formatWeatherDegrees(currentTempF) : '--',
    feelsLike: formatCommandWeatherFeelsLike(snapshot.current.feelsLike),
    wind: formatCommandWeatherWind(snapshot),
    humidity: formatCommandWeatherHumidity(snapshot.current.humidity),
    precipitation: formatAttitudeWeatherPrecipitation(snapshot).replace('Precipitation unavailable', 'PRECIP --').toUpperCase(),
    live: snapshot.status.kind === 'live',
  };
  const weatherNotice = resolveAttitudeWeatherNotice(snapshot, weatherAvailable);
  const weatherForecastRows = getAttitudeWeatherForecastRows(snapshot);
  const weatherLastUpdated = formatAttitudeWeatherLastUpdated(snapshot);
  const daylight = resolveAttitudeCommandDaylight(snapshot, options);
  const routeProgress = useRouteProgressCommandSnapshot(options);
  const hasActiveRouteProgress = Boolean(routeProgress?.isActive);
  const hasRouteProgressGeometry = hasRenderableRouteProgressGeometry(routeProgress);
  const routeVisual: CommandRouteVisualData = {
    active: hasActiveRouteProgress,
    isOffline: hasActiveRouteProgress && !hasRouteProgressGeometry,
    hasGeometry: hasRouteProgressGeometry,
    progressPercent: routeProgress?.progressPercent ?? 0,
    remaining: routeProgress?.remainingMilesText ?? '--',
    eta: routeProgress?.etaLabel ?? '--',
    total: routeProgress?.totalMilesText ?? '--',
    completed: routeProgress?.completedMilesText ?? '--',
    routeLabel: routeProgress?.routeLabel ?? 'Active route',
    estimatedTime: routeProgress?.remainingDurationText ?? '--',
    status: routeProgress?.stateLabel ?? 'Standby',
    geometryStatus: routeProgress?.geometryStatus ?? 'Route geometry unavailable',
  };
  const activeRouteForEnvironment = routeStore.getActive();
  const environmentalTerrainSnapshot = resolveElevationTerrainSnapshot({
    gpsHasFix: options?.gpsHasFix ?? false,
    gpsAltitudeFt: options?.gpsAltitudeFt ?? null,
    gpsTimestampMs: options?.gpsTimestampMs ?? null,
    gpsAccuracyM: options?.gpsAccuracyM ?? null,
    activeRoute: activeRouteForEnvironment,
  });
  const environmentalElevationTone = getElevationTerrainTone(environmentalTerrainSnapshot.status);
  const remotenessOutput = remotenessStore.get();
  const remotenessIndex = remotenessStore.getIndex();
  const remotenessDestinations = buildRemotenessDestinations(remotenessIndex);
  const remotenessScore = remotenessIndex?.score ?? null;
  const environmentalRemotenessTone = resolveCommandEnvironmentRemotenessTone(remotenessScore);
  const environmentalWeatherDetail = weatherAvailable
    ? [weatherVisual.condition, weatherVisual.wind, weatherVisual.precipitation]
        .filter((part) => part && part !== '--' && part !== 'PRECIP --')
        .join(' | ') || 'Weather source available'
    : 'Weather unavailable';
  const environmentalElevationValue =
    environmentalTerrainSnapshot.currentElevationFt != null
      ? environmentalTerrainSnapshot.currentElevationLabel
      : environmentalTerrainSnapshot.hasRouteProfile
        ? 'Route profile'
        : 'Unavailable';
  const environmentalRemotenessValue =
    remotenessScore != null ? `${Math.round(remotenessScore)}` : 'Unknown';
  const environmentalRemotenessDetail =
    remotenessIndex?.level ?? (remotenessOutput.signals.connectivityState === 'unknown' ? 'Remoteness unknown' : remotenessOutput.tier);
  const environmentalDataCount = [
    daylight.daylightTone !== 'unavailable',
    weatherAvailable,
    environmentalTerrainSnapshot.status !== 'unavailable',
    remotenessIndex != null,
  ].filter(Boolean).length;
  const environmentalHasCritical =
    daylight.daylightTone === 'critical' ||
    weatherTone === 'critical' ||
    environmentalRemotenessTone === 'critical';
  const environmentalHasDegraded =
    daylight.daylightTone === 'unavailable' ||
    weatherTone === 'unavailable' ||
    weatherTone === 'stale' ||
    environmentalTerrainSnapshot.status === 'stale' ||
    environmentalTerrainSnapshot.status === 'unavailable' ||
    remotenessIndex == null;
  const environmentalStatus =
    environmentalDataCount === 0
      ? { label: 'UNAVAILABLE', tone: 'unavailable' as WidgetTone }
      : environmentalHasCritical
        ? { label: 'WATCH', tone: 'critical' as WidgetTone }
        : environmentalHasDegraded
          ? { label: 'DEGRADED', tone: 'stale' as WidgetTone }
          : { label: weatherVisual.live || environmentalTerrainSnapshot.hasLiveElevation ? 'SOURCE READY' : 'SOURCE MIXED', tone: weatherVisual.live || environmentalTerrainSnapshot.hasLiveElevation ? 'live' as WidgetTone : 'good' as WidgetTone };
  const environmentalVisual: CommandEnvironmentalVisualData = {
    statusLabel: environmentalStatus.label,
    statusTone: environmentalStatus.tone,
    daylight: daylight.daylight,
    daylightLabel: daylight.daylightLabel,
    daylightTone: daylight.daylightTone,
    phase: daylight.phase,
    sunlightSource: compactCommandEnvironmentSource(daylight.source),
    sunset: daylight.sunset === 'Unavailable' ? 'Sunset unavailable' : `Sunset ${daylight.sunset}`,
    uvIndex: daylight.uvIndex,
    weatherValue: weatherAvailable ? weatherVisual.temperature : 'Unavailable',
    weatherTone,
    weatherDetail: environmentalWeatherDetail,
    elevation: environmentalElevationValue,
    elevationTone: environmentalElevationTone,
    elevationSource: compactCommandEnvironmentSource(environmentalTerrainSnapshot.sourceLabel),
    remoteness: environmentalRemotenessValue,
    remotenessTone: environmentalRemotenessTone,
    remotenessDetail: environmentalRemotenessDetail,
    nearestRoad: formatCommandEnvironmentNearest('Road', remotenessDestinations.road),
    nearestTown: formatCommandEnvironmentNearest('Town', remotenessDestinations.town),
    nearestFuel: formatCommandEnvironmentNearest('Fuel', remotenessDestinations.fuel),
    footer: remotenessIndex
      ? `${remotenessIndex.availableFactorCount}/${remotenessIndex.totalFactorCount} remoteness factors`
      : 'Remoteness source unavailable',
  };
  const power = useUnifiedPowerDevices();
  const powerSummary = normalizePowerTelemetrySummary(power);
  const powerBatteryTone: WidgetTone =
    powerSummary.batteryPercent == null
      ? 'unavailable'
      : powerSummary.batteryPercent <= 20
        ? 'critical'
        : powerSummary.batteryPercent <= 40
          ? 'attention'
          : 'good';
  const powerFlowState = resolveAttitudePowerFlowState(powerSummary);
  const powerUnavailableMessage = resolveAttitudePowerUnavailableMessage(power, powerSummary);
  const primaryPowerDevice = powerSummary.primaryDevice;
  const powerInputAmps = readAttitudePowerNumber(primaryPowerDevice, ['inputAmps', 'input_amps', 'inputCurrentAmps', 'input_current_amps']);
  const powerInputVolts = readAttitudePowerNumber(primaryPowerDevice, ['inputVolts', 'input_volts', 'inputVoltage', 'input_voltage']);
  const powerOutputAmps = readAttitudePowerNumber(primaryPowerDevice, ['outputAmps', 'output_amps', 'outputCurrentAmps', 'output_current_amps']);
  const powerOutputVolts = readAttitudePowerNumber(primaryPowerDevice, ['outputVolts', 'output_volts', 'outputVoltage', 'output_voltage']);
  const powerBatteryVolts = primaryPowerDevice?.batteryVolts ?? null;
  const powerBatteryAmps = primaryPowerDevice?.batteryAmps ?? null;
  const powerSources = resolveAttitudePowerSources(power, powerSummary);
  const powerLoads = resolveAttitudePowerLoads(power, powerSummary);
  const powerRuntimeMinutes = primaryPowerDevice?.estimatedRuntimeMinutes ?? null;
  const powerVisibleInputWatts = powerSummary.canDisplayTelemetryValues ? powerSummary.inputWatts : null;
  const powerVisibleOutputWatts = powerSummary.canDisplayTelemetryValues ? powerSummary.outputWatts : null;
  const powerVisibleSolarWatts = powerSummary.canDisplayTelemetryValues ? powerSummary.solarWatts : null;
  const powerNetWatts =
    powerVisibleInputWatts != null || powerVisibleOutputWatts != null
      ? (powerVisibleInputWatts ?? 0) - (powerVisibleOutputWatts ?? 0)
      : null;
  const powerSourceLabel = sanitizeCommandPowerLabel(powerSummary.sourceLabel || primaryPowerDevice?.providerDisplayName);
  const powerInputRows = resolveCommandPowerInputRows(power, powerSummary, powerVisibleInputWatts, powerVisibleSolarWatts, powerSourceLabel);
  const powerOutputRows = resolveCommandPowerOutputRows(power, powerSummary, powerVisibleOutputWatts);
  const powerVisual: CommandPowerVisualData = {
    live: powerSummary.isLive,
    canDisplayTelemetryValues: powerSummary.canDisplayTelemetryValues,
    canAnimateFlow: powerSummary.canAnimateFlow,
    batteryPercent: powerSummary.canDisplayTelemetryValues ? powerSummary.batteryPercent : null,
    inputWatts: powerVisibleInputWatts,
    outputWatts: powerVisibleOutputWatts,
    solarWatts: powerVisibleSolarWatts,
    netWatts: powerNetWatts,
    runtime: formatMinutesToRuntime(powerRuntimeMinutes),
    sourceLabel: powerSourceLabel,
    inputLabel: powerVisibleSolarWatts != null && powerVisibleSolarWatts > 0 ? `SOLAR ${Math.round(powerVisibleSolarWatts)}W` : 'INPUT',
    outputLabel: powerSummary.connectedDeviceCount > 0 ? `${powerSummary.connectedDeviceCount} LOAD${powerSummary.connectedDeviceCount === 1 ? '' : 'S'}` : 'OUTPUT',
    statusLabel: powerSummary.isLive ? 'SYSTEM NOMINAL' : powerSummary.isStale ? 'LAST KNOWN' : 'CONNECT POWER',
    inputRows: powerInputRows,
    outputRows: powerOutputRows,
    unavailableMessage: powerUnavailableMessage,
  };
  const vehicleTelemetry = useVehicleTelemetry();
  const vehicleProfile = resolveAttitudeVehicleProfile(activeVehicleContext);
  const vehicleFuelReadout = resolveVehicleProfileFuelReadout(activeVehicleContext, vehicleTelemetry.snapshot);
  const vehicleVoltageReadout = resolveVehicleProfileVoltageReadout(activeVehicleContext, vehicleTelemetry.snapshot);
  const vehicleLabel = activeVehicleContext.hasVehicleContext
    ? vehicleProfile.vehicleName
    : vehicleTelemetry.snapshot.isLive
      ? 'Telemetry live'
      : 'Vehicle profile';
  const vehicleDetail = activeVehicleContext.hasVehicleContext
    ? vehicleProfile.identity
    : vehicleTelemetry.snapshot.isLive
      ? [
        vehicleFuelReadout.source !== 'unavailable' ? vehicleFuelReadout.detail : null,
        vehicleVoltageReadout.source !== 'unavailable' ? vehicleVoltageReadout.detail : null,
      ].filter(Boolean).join(' | ') || 'Live systems online'
      : 'Vehicle systems unavailable';
  const vehicleTone: WidgetTone =
    vehicleTelemetry.snapshot.isLive
      ? 'live'
      : activeVehicleContext.hasVehicleContext
        ? 'neutral'
        : 'unavailable';
  const vehicleVisual: CommandVehicleVisualData = {
    imageKey: getVehicleProfileImageKeyFromAttitudeKey(attitudeVehicleId),
    name: vehicleLabel,
    identity: vehicleDetail,
    readiness: activeVehicleContext.hasVehicleContext
      ? vehicleProfile.readiness
      : vehicleTelemetry.snapshot.isLive
        ? 'Telemetry source active'
        : 'Profile unavailable',
    drivetrain: activeVehicleContext.hasVehicleContext
      ? formatCommandVehicleCompactMetric('DRV', vehicleProfile.drivetrain)
      : 'DRV --',
    fuel: vehicleFuelReadout.compact,
    battery: vehicleVoltageReadout.compact,
    source: vehicleProfile.source,
    ready: vehicleTelemetry.snapshot.isLive || activeVehicleContext.hasVehicleContext,
  };
  const sensorLive = commandSensorLive;
  const commandCenterDataContext = useMemo(
    () => {
      void environmentalRevision;
      return {
        hasActiveRoute: hasActiveRouteProgress,
        hasLocation:
          options?.gpsHasFix === true &&
          typeof options.gpsLatitude === 'number' &&
          Number.isFinite(options.gpsLatitude) &&
          typeof options.gpsLongitude === 'number' &&
          Number.isFinite(options.gpsLongitude),
        hasHeading: sensorLive,
        hasSavedPins: false,
        hasCampCandidates: false,
        hasReadinessSystems: true,
        hasConvoy: false,
        hasConvoyMembers: false,
        hasConvoyCheckIns: false,
        isOffline: remotenessStore.get().signals.connectivityState === 'offline',
      };
    },
    [
      environmentalRevision,
      hasActiveRouteProgress,
      options?.gpsHasFix,
      options?.gpsLatitude,
      options?.gpsLongitude,
      sensorLive,
    ],
  );
  const commandLayout = resolveAttitudeCommandLayoutMetrics(options);
  const selectedCommandModuleDefinition =
    ECS_COMMAND_MODULE_REGISTRY[selectedCommandModule] ?? ECS_COMMAND_MODULE_REGISTRY.attitude;
  const selectedCommandModuleStatus = useMemo((): { label: string; tone: WidgetTone } => {
    switch (selectedCommandModule) {
      case 'routeCommand':
        return hasActiveRouteProgress
          ? { label: 'ACTIVE ROUTE', tone: 'live' }
          : { label: 'STANDBY', tone: 'neutral' };
      case 'powerCommand':
        return powerSummary.isLive
          ? { label: 'POWER LIVE', tone: powerBatteryTone }
          : { label: powerSummary.isStale ? 'LAST KNOWN' : 'UNAVAILABLE', tone: powerSummary.isStale ? 'stale' : 'unavailable' };
      case 'environmentalCommand':
        return { label: environmentalVisual.statusLabel, tone: environmentalVisual.statusTone };
      case 'follow3d':
        return hasActiveRouteProgress
          ? { label: 'ROUTE READY', tone: 'good' }
          : { label: 'STANDBY', tone: 'neutral' };
      case 'convoy-command':
        return { label: 'CONVOY', tone: 'neutral' };
      case 'attitude':
      default:
        return { label: commandStageStatusLabel, tone: displayState.tone };
    }
  }, [
    commandStageStatusLabel,
    displayState.tone,
    environmentalVisual.statusLabel,
    environmentalVisual.statusTone,
    hasActiveRouteProgress,
    powerBatteryTone,
    powerSummary.isLive,
    powerSummary.isStale,
    selectedCommandModule,
  ]);
  const selectedCommandModuleStatusColor =
    selectedCommandModule === 'attitude'
      ? commandStageStatusColor
      : getWidgetToneColor(selectedCommandModuleStatus.tone);
  const selectedCommandModuleStatusBorderColor =
    selectedCommandModule === 'attitude'
      ? commandStageStatusBorderColor
      : `${selectedCommandModuleStatusColor}45`;
  const selectedCommandCenterMode = commandModuleToCenterMode(selectedCommandModule);
  const commandCenterHostSelected = isCommandCenterModuleId(selectedCommandModule);
  const commandCenterFrameSelected =
    commandCenterHostSelected &&
    selectedCommandCenterMode !== 'attitude' &&
    selectedCommandCenterMode !== 'threeDNavigation';
  const selectedCommandModuleMetrics = useMemo((): ECSCommandModuleMetric[] => {
    switch (selectedCommandModule) {
      case 'follow3d':
        return [
          { label: 'ROUTE', value: routeVisual.active ? routeVisual.status : 'No active route', tone: routeVisual.active ? 'live' : 'neutral' },
          { label: 'GEOMETRY', value: routeVisual.hasGeometry ? 'Available' : 'Unavailable', tone: routeVisual.hasGeometry ? 'good' : 'unavailable' },
          { label: 'HOST', value: 'Follow map ready', tone: 'neutral' },
        ];
      case 'routeCommand':
        return [
          { label: 'REMAINING', value: routeVisual.remaining, tone: routeVisual.active ? 'live' : 'unavailable' },
          { label: 'ETA', value: routeVisual.eta, tone: routeVisual.active ? 'good' : 'neutral' },
          { label: 'PROGRESS', value: `${routeVisual.progressPercent}%`, tone: routeVisual.active ? 'good' : 'neutral' },
        ];
      case 'powerCommand':
        return [
          { label: 'RESERVE', value: powerVisual.batteryPercent != null ? `${Math.round(powerVisual.batteryPercent)}%` : '--', tone: powerSummary.isLive ? powerBatteryTone : 'unavailable' },
          { label: 'INPUT', value: formatAttitudePowerWattsCompact(powerVisual.inputWatts, 'input'), tone: powerVisual.inputWatts != null && powerVisual.inputWatts > 0 ? 'good' : 'neutral' },
          { label: 'OUTPUT', value: formatAttitudePowerWattsCompact(powerVisual.outputWatts, 'output'), tone: powerVisual.outputWatts != null && powerVisual.outputWatts > 0 ? 'attention' : 'neutral' },
        ];
      case 'environmentalCommand':
        return [
          { label: 'DAYLIGHT', value: environmentalVisual.daylight, tone: environmentalVisual.daylightTone },
          { label: 'WEATHER', value: environmentalVisual.weatherValue, tone: environmentalVisual.weatherTone },
          { label: 'REMOTE', value: environmentalVisual.remoteness, tone: environmentalVisual.remotenessTone },
        ];
      case 'convoy-command':
        return [
          { label: 'MODE', value: 'Plan/check-in', tone: 'neutral' },
          { label: 'TRACKING', value: 'Not live', tone: 'neutral' },
          { label: 'SOURCE', value: 'Convoy setup', tone: 'neutral' },
        ];
      case 'attitude':
      default:
        return [
          { label: 'PITCH', value: formatAttitudeDegrees(commandStagePitchDeg), tone: displayState.tone },
          { label: 'ROLL', value: formatAttitudeDegrees(commandStageRollDeg), tone: displayState.tone },
          { label: 'SOURCE', value: commandSensorLive ? 'Live sensors' : attitudeTelemetry.sourceLabel, tone: commandSensorLive ? 'live' : 'unavailable' },
        ];
    }
  }, [
    attitudeTelemetry.sourceLabel,
    commandSensorLive,
    commandStagePitchDeg,
    commandStageRollDeg,
    displayState.tone,
    environmentalVisual.daylight,
    environmentalVisual.daylightTone,
    environmentalVisual.remoteness,
    environmentalVisual.remotenessTone,
    environmentalVisual.weatherTone,
    environmentalVisual.weatherValue,
    powerBatteryTone,
    powerSummary.isLive,
    powerVisual.batteryPercent,
    powerVisual.inputWatts,
    powerVisual.outputWatts,
    routeVisual.active,
    routeVisual.eta,
    routeVisual.hasGeometry,
    routeVisual.progressPercent,
    routeVisual.remaining,
    routeVisual.status,
    selectedCommandModule,
  ]);
  const selectedCommandModuleBackground = (() => {
    switch (selectedCommandModule) {
      default:
        return null;
    }
  })();
  const activeFocusConfig = useMemo(() => {
    switch (activePanel) {
      case 'sunlight':
        return { title: 'Remaining Sunlight', icon: 'sunny-outline' as const };
      case 'weather':
        return { title: 'Current Weather', icon: 'partly-sunny-outline' as const };
      case 'vehicle':
        return { title: 'Vehicle Profile', icon: 'car-sport-outline' as const };
      case 'route':
        return { title: 'Route Progress', icon: 'navigate-outline' as const };
      case 'power':
        return { title: 'Power Monitor', icon: 'battery-charging-outline' as const };
      default:
        return { title: 'Attitude Command', icon: 'speedometer-outline' as const };
    }
  }, [activePanel]);

  return (
    <>
      <ECSInstrumentPanel
        variant="command"
        sizeVariant="dominant"
        glowIntensity={commandSensorLive ? 'high' : 'medium'}
        active={commandSensorLive}
        showActiveEdge={false}
        innerTexture={false}
        style={attitudeCommandS.shellFrame}
        contentStyle={[attitudeCommandS.shell, commandLayout.shell]}
      >
        <View style={[attitudeCommandS.topRow, commandLayout.topRow]}>
          <AttitudeCommandPanel
            eyebrow="REMAINING SUNLIGHT"
            title={daylight.daylight}
            icon="sunny-outline"
            tone={daylight.daylightTone}
            onPress={() => openFocusPanel('sunlight')}
            accessibilityLabel="Open remaining sunlight details"
            sunlightVisual={{
              phase: daylight.phase,
              radiancePhase: daylight.radiancePhase,
              backgroundType: daylight.backgroundType,
              countdownLabel: daylight.daylightLabel,
              sunrise: daylight.sunrise,
              sunset: daylight.sunset,
              uvIndex: daylight.uvIndex,
            }}
          />
          <AttitudeCommandPanel
            eyebrow="CURRENT WEATHER"
            title={weatherTitle || 'Weather unavailable'}
            detail={weatherDetail}
            icon="partly-sunny-outline"
            tone={weatherTone}
            align="center"
            onPress={() => openFocusPanel('weather')}
            accessibilityLabel="Open current weather details"
            weatherVisual={weatherVisual}
          >
            <View pointerEvents="none" style={attitudeCommandS.weatherMetricStrip}>
              <Text style={attitudeCommandS.weatherMetricText} numberOfLines={1}>
                {weatherVisual.feelsLike}
              </Text>
              <Text style={attitudeCommandS.weatherMetricText} numberOfLines={1}>
                {weatherVisual.wind}
              </Text>
              <Text style={attitudeCommandS.weatherMetricText} numberOfLines={1}>
                {weatherVisual.humidity}
              </Text>
            </View>
          </AttitudeCommandPanel>
          <AttitudeCommandPanel
            eyebrow="VEHICLE PROFILE"
            title="Vehicle Profile"
            detail={undefined}
            icon="car-sport-outline"
            tone={vehicleTone}
            align="left"
            onPress={() => openFocusPanel('vehicle')}
            accessibilityLabel="Open vehicle profile details"
            vehicleVisual={vehicleVisual}
          >
            <View pointerEvents="none" style={attitudeCommandS.vehicleBaseIdentityBlock}>
              <Text
                style={attitudeCommandS.vehicleBaseNameText}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {vehicleVisual.name}
              </Text>
              <Text
                style={attitudeCommandS.vehicleBaseIdentityText}
                numberOfLines={1}
                ellipsizeMode="tail"
                adjustsFontSizeToFit
                minimumFontScale={0.82}
              >
                {vehicleVisual.identity}
              </Text>
            </View>
            <View pointerEvents="none" style={attitudeCommandS.vehicleBaseTelemetryRow}>
              <Text
                style={attitudeCommandS.vehicleBaseTelemetryText}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {vehicleVisual.fuel}
              </Text>
              <Text
                style={[attitudeCommandS.vehicleBaseTelemetryText, attitudeCommandS.vehicleBaseTelemetryTextRight]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.72}
              >
                {vehicleVisual.battery}
              </Text>
            </View>
          </AttitudeCommandPanel>
        </View>

        <View
          style={[
            attitudeCommandS.attitudeStage,
            selectedCommandModule === 'attitude' ? attitudeCommandS.attitudeStageVehicleImageMode : null,
            commandLayout.attitudeStage,
          ]}
        >
          {selectedCommandModule !== 'attitude' ? (
            commandCenterFrameSelected ? null : (
              <View pointerEvents="none" style={[attitudeCommandS.commandTitleBlock, commandLayout.commandTitleBlock]}>
                <Text style={attitudeCommandS.commandTitle} numberOfLines={1}>
                  {selectedCommandModuleDefinition.title}
                </Text>
                <Text style={attitudeCommandS.commandSubtitle} numberOfLines={1}>
                  {selectedCommandModuleDefinition.subtitle}
                </Text>
              </View>
            )
          ) : null}
          <View style={attitudeCommandS.moduleTouchTarget}>
            <Animated.View
              style={[
                attitudeCommandS.moduleTransitionShell,
                commandCenterFrameSelected ? attitudeCommandS.moduleTransitionShellFramedCommand : null,
                { opacity: moduleTransitionOpacity },
              ]}
            >
              {selectedCommandModule === 'attitude' ? (
                <AttitudeCommandWidgetConnected
                  vehicleId={attitudeVehicleId}
                  pitchDeg={commandStagePitchDeg}
                  rollDeg={commandStageRollDeg}
                  telemetryEnabled={false}
                  activeVehicleName={activeVehicleContext.vehicle?.name ?? undefined}
                  telemetryFrame="device"
                  mode="command"
                  showZeroButton={false}
                  showReadouts={commandSensorLive}
                  showLiveHashIndicators={false}
                  onZero={undefined}
                />
              ) : commandCenterHostSelected ? (
                <CommandCenterHost
                  mode={selectedCommandCenterMode}
                  availableModes={COMMAND_CENTER_MODES}
                  onModeChange={handleSelectCommandCenterMode}
                  dataContext={commandCenterDataContext}
                  externalRenderers={{
                    threeDNavigation: ({ mode }) => (
                      <Mini3DFollowMap options={options} selected={mode === 'threeDNavigation'} />
                    ),
                  }}
                />
              ) : selectedCommandModule === 'routeCommand' ? (
                <RouteCommandModule
                  definition={selectedCommandModuleDefinition}
                  routeProgress={routeProgress}
                />
              ) : selectedCommandModule === 'powerCommand' ? (
                <PowerCommandModule
                  definition={selectedCommandModuleDefinition}
                  power={powerVisual}
                  summary={powerSummary}
                  flow={powerFlowState}
                  tone={powerSummary.isLive || powerSummary.canDisplayTelemetryValues ? powerBatteryTone : powerSummary.isStale ? 'stale' : 'unavailable'}
                />
              ) : selectedCommandModule === 'environmentalCommand' ? (
                <EnvironmentalCommandModule
                  definition={selectedCommandModuleDefinition}
                  environment={environmentalVisual}
                />
              ) : (
                <ECSCommandModulePlaceholder
                  definition={selectedCommandModuleDefinition}
                  tone={selectedCommandModuleStatus.tone}
                  statusLabel={selectedCommandModuleStatus.label}
                  metrics={selectedCommandModuleMetrics}
                  background={selectedCommandModuleBackground}
                />
              )}
            </Animated.View>
          </View>

          <View pointerEvents="box-none" style={attitudeCommandS.stageControlLayer}>
            {selectedCommandModule === 'attitude' ? (
              <TouchableOpacity
                accessibilityLabel={soundEnabled ? 'Disable attitude monitor sound' : 'Enable attitude monitor sound'}
                accessibilityRole="button"
                activeOpacity={0.82}
                hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
                onPress={handleToggleSound}
                style={[
                  attitudeCommandS.stageSoundPill,
                  !soundEnabled ? attitudeCommandS.stageSoundPillOff : null,
                ]}
              >
                <AttitudeStageHexButtonChrome muted={!soundEnabled} />
                <Ionicons
                  name={soundEnabled ? 'volume-high-outline' : 'volume-off-outline'}
                  size={15}
                  color={soundEnabled ? TACTICAL.text : 'rgba(197, 206, 214, 0.86)'}
                />
              </TouchableOpacity>
            ) : null}

            {selectedCommandModule === 'attitude' ? (
              <View pointerEvents="none" style={attitudeCommandS.stageZeroLabelSlot}>
                <Text style={attitudeCommandS.stageZeroLabel} numberOfLines={1}>
                  zero
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              accessibilityLabel="Change center module"
              accessibilityHint="Opens the Command Module selector"
              accessibilityRole="button"
              activeOpacity={0.82}
              hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}
              onPress={openModuleSelector}
              style={[
                attitudeCommandS.stageModulePill,
                selectedCommandModule !== 'attitude' ? attitudeCommandS.stageModulePillActive : null,
                commandCenterFrameSelected ? attitudeCommandS.stageModulePillRecoveryMode : null,
              ]}
            >
              <Ionicons name="ellipsis-horizontal" size={17} color={TACTICAL.text} />
            </TouchableOpacity>

            {selectedCommandModule === 'attitude' ? (
              <View pointerEvents="none" style={attitudeCommandS.stageStatusPillCenterSlot}>
                <View
                  style={[
                    attitudeCommandS.stageStatusPillBase,
                    attitudeCommandS.stageStatusPillCentered,
                    { borderColor: selectedCommandModuleStatusBorderColor },
                  ]}
                >
                  <Text
                    style={[attitudeCommandS.stageStatusPillText, { color: selectedCommandModuleStatusColor }]}
                    adjustsFontSizeToFit
                    minimumFontScale={0.78}
                    numberOfLines={1}
                  >
                    {selectedCommandModuleStatus.label}
                  </Text>
                </View>
              </View>
            ) : selectedCommandModule !== 'follow3d' && !commandCenterFrameSelected ? (
              <View
                pointerEvents="none"
                style={[
                  attitudeCommandS.stageStatusPill,
                  { borderColor: selectedCommandModuleStatusBorderColor },
                ]}
              >
                <Text
                  style={[attitudeCommandS.stageStatusPillText, { color: selectedCommandModuleStatusColor }]}
                  adjustsFontSizeToFit
                  minimumFontScale={0.78}
                  numberOfLines={1}
                >
                  {selectedCommandModuleStatus.label}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[attitudeCommandS.bottomRow, commandLayout.bottomRow]}>
          <AttitudeCommandPanel
            eyebrow="ROUTE PROGRESS"
            title={hasActiveRouteProgress ? `${routeProgress!.progressPercent}% | ${routeProgress!.remainingMilesText}` : 'No active route'}
            detail={hasActiveRouteProgress ? 'Guidance active' : 'Start guidance to view route progress'}
            icon="navigate-outline"
            tone={hasActiveRouteProgress ? 'live' : 'neutral'}
            onPress={() => openFocusPanel('route')}
            accessibilityLabel="Open route progress details"
            routeVisual={routeVisual}
          >
            {hasActiveRouteProgress ? (
              <View pointerEvents="none" style={attitudeCommandS.routeMetricStrip}>
                <Text style={attitudeCommandS.routeMetricName} numberOfLines={1}>
                  {routeVisual.routeLabel}
                </Text>
                <Text style={attitudeCommandS.routeMetricText} numberOfLines={1}>
                  ETA {routeVisual.eta}
                </Text>
                <Text style={attitudeCommandS.routeMetricText} numberOfLines={1}>
                  TIME {routeVisual.estimatedTime}
                </Text>
                <Text style={attitudeCommandS.routeMetricText} numberOfLines={1}>
                  TOTAL {routeVisual.total}
                </Text>
                <Text style={attitudeCommandS.routeMetricText} numberOfLines={1}>
                  DONE {routeVisual.completed}
                </Text>
              </View>
            ) : (
              <View pointerEvents="none" style={attitudeCommandS.routeStandbyStrip}>
                <Text style={attitudeCommandS.routeStandbyText} numberOfLines={1}>
                  Guidance standby
                </Text>
              </View>
            )}
          </AttitudeCommandPanel>
          <AttitudeCommandPanel
            eyebrow="POWER MONITOR"
            title="Power Monitor"
            detail={undefined}
            icon="battery-charging-outline"
            tone={powerSummary.isLive ? powerBatteryTone : 'unavailable'}
            align="right"
            onPress={() => openFocusPanel('power')}
            accessibilityLabel="Open power monitor details"
            powerVisual={powerVisual}
          >
            <AttitudeCommandPowerRiveForeground power={powerVisual} />
            <View pointerEvents="none" style={attitudeCommandS.powerBottomStrip}>
              <Text style={attitudeCommandS.powerBottomStripText} numberOfLines={1}>
                NET {powerVisual.netWatts != null ? `${powerVisual.netWatts >= 0 ? '+' : '-'}${Math.abs(Math.round(powerVisual.netWatts))}W` : '--'}
              </Text>
              <Text style={attitudeCommandS.powerBottomStripText} numberOfLines={1}>
                RUN {powerVisual.runtime}
              </Text>
            </View>
          </AttitudeCommandPanel>
        </View>
      </ECSInstrumentPanel>

      <TacticalPopupShell
        visible={activePanel != null}
        onClose={closeFocusPanel}
        eyebrow="ATTITUDE COMMAND"
        title={activeFocusConfig.title}
        icon={activeFocusConfig.icon}
        tier="global"
        overlayClass="editor"
        maxWidth={560}
        maxHeightFraction={0.76}
        scrollable
        showHandle
      >
        {activePanel === 'sunlight' ? (
          <View style={attitudeCommandS.detailStack}>
            {daylight.unavailableReason ? (
              <AttitudeCommandUnavailableNotice
                message={
                  daylight.unavailableReason === 'location-required'
                    ? 'Location required. Grant location access or wait for weather solar times before ECS can show daylight detail.'
                    : daylight.unavailableReason === 'waiting-position'
                      ? 'Waiting for current position. Sunlight detail will populate once GPS or weather solar times are available.'
                      : 'Sunlight data unavailable. ECS needs a current location fix or weather solar times for daylight detail.'
                }
              />
            ) : null}
            <AttitudeCommandDetailRow label={daylight.daylightLabel} value={daylight.daylight} tone={daylight.daylightTone} />
            <AttitudeCommandDetailRow label="Estimated sunrise" value={daylight.sunrise} tone={daylight.daylightTone} />
            <AttitudeCommandDetailRow label="Estimated sunset" value={daylight.sunset} tone={daylight.daylightTone} />
            <AttitudeCommandDetailRow label="Civil twilight" value={daylight.civilTwilight} />
            <AttitudeCommandDetailRow label="Glare status" value={daylight.glare} tone={daylight.glareTone} />
            <AttitudeCommandDetailRow label="Sun elevation" value={daylight.sunElevation} />
            <AttitudeCommandDetailRow label="Sun azimuth" value={daylight.sunAzimuth} />
            <AttitudeCommandDetailRow label="Location context" value={daylight.location} />
            <AttitudeCommandDetailRow label="Latitude" value={daylight.latitude} />
            <AttitudeCommandDetailRow label="Longitude" value={daylight.longitude} />
            <AttitudeCommandDetailRow label="Source" value={daylight.source} />
            <AttitudeCommandDetailRow label="Last updated" value={daylight.updated} />
          </View>
        ) : null}

        {activePanel === 'weather' ? (
          <View style={attitudeCommandS.detailStack}>
            {weatherNotice ? (
              <AttitudeCommandUnavailableNotice message={weatherNotice} />
            ) : null}
            <AttitudeCommandDetailRow
              label="Condition"
              value={snapshot.current.description || snapshot.current.condition || formatWeatherHeadline(snapshot) || weatherTitle || 'Weather unavailable'}
              tone={weatherTone}
            />
            <AttitudeCommandDetailRow label="Temperature" value={formatWeatherDegrees(currentTempF)} />
            <AttitudeCommandDetailRow label="Feels like" value={formatWeatherDegrees(snapshot.current.feelsLike)} />
            <AttitudeCommandDetailRow label="Wind" value={formatWeatherWindLine(snapshot) || 'Wind unavailable'} />
            <AttitudeCommandDetailRow label="Precipitation" value={formatAttitudeWeatherPrecipitation(snapshot)} />
            <AttitudeCommandDetailRow label="Visibility" value={formatAttitudeWeatherVisibility(snapshot.current.visibility)} />
            <AttitudeCommandDetailRow label="Alerts" value={formatWeatherAlertLine(snapshot) || (weatherAvailable ? 'No active alert in source' : 'Alerts unavailable')} tone={snapshot.alerts.length > 0 ? 'attention' : 'neutral'} />
            {weatherForecastRows.length > 0 ? (
              weatherForecastRows.map((row) => (
                <AttitudeCommandDetailRow key={row.key} label={row.label} value={row.value} />
              ))
            ) : (
              <AttitudeCommandDetailRow label="Forecast" value="Forecast unavailable" />
            )}
            <AttitudeCommandDetailRow label="Location" value={snapshot.locationName || 'Current position'} />
            <AttitudeCommandDetailRow label="Source" value={getCompactWeatherSourceLabel(snapshot)} />
            <AttitudeCommandDetailRow label="Freshness" value={snapshot.status.label || snapshot.status.kind || 'Unknown'} />
            <AttitudeCommandDetailRow label="Last updated" value={weatherLastUpdated} />
          </View>
        ) : null}

        {activePanel === 'vehicle' ? (
          <View style={attitudeCommandS.detailStack}>
            {!activeVehicleContext.hasVehicleContext && !vehicleTelemetry.snapshot.isLive ? (
              <AttitudeCommandUnavailableNotice message="No active vehicle profile or live telemetry is available. Add or select a Fleet vehicle to improve this panel." />
            ) : null}
            <AttitudeCommandDetailRow label="Vehicle" value={vehicleProfile.vehicleName || 'Vehicle profile unavailable'} tone={vehicleTone} />
            <AttitudeCommandDetailRow label="Year/make/model" value={vehicleProfile.identity} />
            <AttitudeCommandDetailRow label="Drivetrain" value={vehicleProfile.drivetrain} />
            <AttitudeCommandDetailRow label="Engine" value={vehicleProfile.engine} />
            <AttitudeCommandDetailRow label="Suspension" value={vehicleProfile.suspension} />
            <AttitudeCommandDetailRow label="Tires" value={vehicleProfile.tires} />
            <AttitudeCommandDetailRow label="Build summary" value={vehicleProfile.buildSummary} />
            <AttitudeCommandDetailRow label="Loadout" value={vehicleProfile.loadoutSummary} />
            <AttitudeCommandDetailRow label="Operating weight" value={vehicleProfile.operatingWeight} />
            <AttitudeCommandDetailRow label="Base weight" value={vehicleProfile.baseWeight} />
            <AttitudeCommandDetailRow label="GVWR" value={vehicleProfile.gvwr} />
            <AttitudeCommandDetailRow label="Payload margin" value={vehicleProfile.payloadMargin} />
            <AttitudeCommandDetailRow label="Readiness" value={vehicleProfile.readiness} tone={activeVehicleContext.hasVehicleContext ? 'neutral' : 'unavailable'} />
            <AttitudeCommandDetailRow label="Confidence" value={vehicleProfile.confidence} />
            <AttitudeCommandDetailRow label="Telemetry" value={vehicleTelemetry.snapshot.isLive ? vehicleTelemetry.engineStatus || 'Live telemetry' : 'Stored profile only'} tone={vehicleTelemetry.snapshot.isLive ? 'live' : 'neutral'} />
            <AttitudeCommandDetailRow label="Fuel" value={vehicleFuelReadout.detail} tone={vehicleFuelReadout.tone} />
            <AttitudeCommandDetailRow label="Voltage" value={vehicleVoltageReadout.detail} tone={vehicleVoltageReadout.tone} />
            <AttitudeCommandDetailRow label="Source" value={vehicleProfile.source} />
          </View>
        ) : null}

        {activePanel === 'route' ? (
          <View style={attitudeCommandS.detailStack}>
            {!routeProgress ? (
              <AttitudeCommandUnavailableNotice message="No active route. Start or select a route to view progress." />
            ) : routeProgress.calculationState.toLowerCase().includes('loading') ||
              routeProgress.calculationState.toLowerCase().includes('unavailable') ? (
              <AttitudeCommandUnavailableNotice message={routeProgress.calculationState} />
            ) : null}
            <AttitudeCommandDetailRow label="Route" value={routeProgress?.routeLabel || 'No active route'} tone={routeProgress?.stateTone ?? 'unavailable'} />
            <AttitudeCommandDetailRow label="Destination" value={routeProgress?.destinationLabel || (routeProgress ? 'Destination unavailable' : 'Start or select a route to view progress')} />
            <AttitudeCommandDetailRow label="Distance remaining" value={routeProgress?.remainingMilesText || 'Unavailable'} />
            <AttitudeCommandDetailRow label="Time remaining" value={routeProgress?.remainingDurationText || 'Unavailable'} />
            <AttitudeCommandDetailRow label="ETA" value={routeProgress?.etaLabel || 'Unavailable'} />
            <AttitudeCommandDetailRow label="Progress" value={routeProgress ? `${routeProgress.progressPercent}%` : 'Unavailable'} />
            <AttitudeCommandDetailRow label="Current leg" value={routeProgress?.currentLegLabel || 'Unavailable'} />
            <AttitudeCommandDetailRow label="Navigation status" value={routeProgress?.navigationStatus || 'Route unavailable'} tone={routeProgress?.stateTone ?? 'unavailable'} />
            <AttitudeCommandDetailRow label="Next" value={routeProgress?.nextInstruction || routeProgress?.footerText || 'Unavailable'} />
            <AttitudeCommandDetailRow label="Route warning" value={routeProgress?.warningLine || 'Unavailable'} tone={routeProgress?.warningLine && !routeProgress.warningLine.startsWith('No route warning') ? 'attention' : 'neutral'} />
            <AttitudeCommandDetailRow label="Confidence" value={routeProgress?.confidenceLine || 'Unavailable'} />
            <AttitudeCommandDetailRow label="Route geometry" value={routeProgress?.geometryStatus || 'Unavailable'} />
            <AttitudeCommandDetailRow label="Total route" value={routeProgress?.totalMilesText || 'Unavailable'} />
            <AttitudeCommandDetailRow label="Completed" value={routeProgress?.completedMilesText || 'Unavailable'} />
            <AttitudeCommandDetailRow label="Calculation" value={routeProgress?.calculationState || 'Progress cannot be calculated until a route is active'} />
            <AttitudeCommandDetailRow label="Source" value={routeProgress?.sourceDetail || 'No route source'} />
            <AttitudeCommandDetailRow label="Last updated" value={formatAttitudeCommandTimestamp(routeProgress?.lastUpdated)} />
          </View>
        ) : null}

        {activePanel === 'power' ? (
          <View style={attitudeCommandS.detailStack}>
            {powerUnavailableMessage ? (
              <AttitudeCommandUnavailableNotice message={powerUnavailableMessage} />
            ) : null}
            <AttitudePowerLiquidFlowIndicator flow={powerFlowState} />
            <AttitudeCommandDetailRow label="Charge state" value={formatAttitudePowerState(powerSummary.chargingState)} tone={powerFlowState.tone} />
            <AttitudeCommandDetailRow label="Battery" value={powerSummary.batteryPercent != null ? `${Math.round(powerSummary.batteryPercent)}% state of charge` : 'Battery percentage unavailable'} tone={powerSummary.isLive ? powerBatteryTone : 'unavailable'} />
            <AttitudeCommandDetailRow label="Input watts" value={formatAttitudePowerWatts(powerSummary.inputWatts ?? 0, 'input')} tone={(powerSummary.inputWatts ?? 0) > 0 && powerSummary.isLive ? 'good' : 'neutral'} />
            <AttitudeCommandDetailRow label="Input amps" value={formatAttitudePowerMetric(powerInputAmps, 'A')} />
            <AttitudeCommandDetailRow label="Input volts" value={formatAttitudePowerMetric(powerInputVolts, 'V')} />
            <AttitudeCommandDetailRow label="Output watts" value={formatAttitudePowerWatts(powerSummary.outputWatts ?? 0, 'output')} tone={(powerSummary.outputWatts ?? 0) > 0 && powerSummary.isLive ? 'attention' : 'neutral'} />
            <AttitudeCommandDetailRow label="Output amps" value={formatAttitudePowerMetric(powerOutputAmps, 'A')} />
            <AttitudeCommandDetailRow label="Output volts" value={formatAttitudePowerMetric(powerOutputVolts, 'V')} />
            <AttitudeCommandDetailRow label="Battery voltage" value={formatAttitudePowerMetric(powerBatteryVolts, 'V')} />
            <AttitudeCommandDetailRow label="Battery current" value={formatAttitudePowerMetric(powerBatteryAmps, 'A')} />
            <AttitudeCommandDetailRow label="Solar" value={formatAttitudePowerWatts(powerSummary.solarWatts ?? 0, 'input')} tone={(powerSummary.solarWatts ?? 0) > 0 && powerSummary.isLive ? 'good' : 'neutral'} />
            <AttitudeCommandDetailRow label="Connected sources" value={powerSources} tone={powerSummary.isLive ? 'live' : 'unavailable'} />
            <AttitudeCommandDetailRow label="Connected loads" value={powerLoads} />
            <AttitudeCommandDetailRow label="Telemetry source" value={powerSummary.sourceLabel || primaryPowerDevice?.providerDisplayName || 'Power source unavailable'} />
            <AttitudeCommandDetailRow label="Freshness" value={powerSummary.isLive ? 'Live telemetry' : powerSummary.isStale ? 'Stale or disconnected' : 'Unavailable'} tone={powerSummary.isLive ? 'live' : 'unavailable'} />
            <AttitudeCommandDetailRow label="Last updated" value={formatAttitudeCommandTimestamp(powerSummary.lastUpdated)} />
          </View>
        ) : null}
      </TacticalPopupShell>

      <TacticalPopupShell
        visible={moduleSelectorVisible}
        onClose={closeModuleSelector}
        eyebrow="ECS COMMAND MODULE"
        title="Change Center Module"
        icon="grid-outline"
        subtitle="Choose the instrument shown inside the Command Module shell."
        tier="global"
        overlayClass="dialog"
        maxWidth={540}
        maxHeightFraction={0.72}
        minHeightFraction={0.42}
        scrollable
        bodyStyle={attitudeCommandS.moduleSelectorBody}
        contentContainerStyle={attitudeCommandS.moduleSelectorContent}
        showHandle
      >
        <View style={attitudeCommandS.moduleSelectorStack}>
          {ECS_COMMAND_MODULE_ORDER.map((moduleId) => {
            const definition = ECS_COMMAND_MODULE_REGISTRY[moduleId];
            const selected = selectedCommandModule === moduleId;
            const moduleTone = selected ? TACTICAL.amber : 'rgba(230,237,243,0.76)';
            return (
              <TouchableOpacity
                key={moduleId}
                accessibilityRole="button"
                accessibilityLabel={`${definition.label}. ${definition.description}. ${selected ? 'Selected' : 'Not selected'}`}
                accessibilityState={{ selected }}
                activeOpacity={0.78}
                onPress={() => handleSelectCommandModule(moduleId)}
                style={[
                  attitudeCommandS.moduleSelectorOption,
                  selected ? attitudeCommandS.moduleSelectorOptionSelected : null,
                ]}
              >
                <View style={attitudeCommandS.moduleSelectorIcon}>
                  <Ionicons
                    name={definition.icon as any}
                    size={18}
                    color={moduleTone}
                  />
                </View>
                <View style={attitudeCommandS.moduleSelectorText}>
                  <Text
                    style={[attitudeCommandS.moduleSelectorLabel, selected ? attitudeCommandS.moduleSelectorLabelSelected : null]}
                    numberOfLines={1}
                  >
                    {definition.label}
                  </Text>
                  <Text style={attitudeCommandS.moduleSelectorDetail} numberOfLines={2}>
                    {definition.description}
                  </Text>
                </View>
                <View style={[attitudeCommandS.moduleSelectorState, selected ? attitudeCommandS.moduleSelectorStateSelected : null]}>
                  <Text style={[attitudeCommandS.moduleSelectorStateText, selected ? attitudeCommandS.moduleSelectorStateTextSelected : null]}>
                    {selected ? 'ACTIVE' : 'SELECT'}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </TacticalPopupShell>
    </>
  );
}, (prev, next) => (
  areAttitudeMonitorWidgetPropsEqual(prev, next) &&
  prev.data.weatherSnapshot === next.data.weatherSnapshot
));

const attitudeCommandS = StyleSheet.create({
  shellFrame: {
    flex: 1,
    minHeight: 0,
  },
  shell: {
    flex: 1,
    minHeight: 0,
    gap: 7,
  },
  shellTopoLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.5,
  },
  shellTopoLine: {
    position: 'absolute',
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
  },
  shellTopoLineA: {
    top: 30,
    left: -30,
    width: 260,
    transform: [{ rotate: '-7deg' }],
  },
  shellTopoLineB: {
    top: '48%',
    right: -44,
    width: 330,
    transform: [{ rotate: '6deg' }],
  },
  shellTopoLineC: {
    bottom: 38,
    left: 20,
    width: 300,
    transform: [{ rotate: '-4deg' }],
  },
  shellInnerStroke: {
    position: 'absolute',
    top: 4,
    right: 4,
    bottom: 4,
    left: 4,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(241, 199, 103, 0.13)',
  },
  topRow: { flexDirection: 'row', gap: 8, minHeight: 82, zIndex: 2 },
  bottomRow: { flexDirection: 'row', gap: 8, minHeight: 90, zIndex: 2 },
  attitudeStage: {
    flex: 1,
    alignSelf: 'stretch',
    minHeight: 206,
    marginVertical: 4,
    position: 'relative',
    zIndex: 2,
    overflow: 'hidden',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.24)',
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  attitudeStageVehicleImageMode: {
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  commandTitleBlock: {
    position: 'absolute',
    top: 8,
    zIndex: 3,
    alignItems: 'center',
    gap: 1,
  },
  commandTitle: {
    color: TACTICAL.amber,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 1.6,
    includeFontPadding: false,
    textAlign: 'center',
  },
  commandSubtitle: {
    color: 'rgba(230, 237, 243, 0.66)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    includeFontPadding: false,
    textAlign: 'center',
  },
  stageControlLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
  },
  stageSoundPill: {
    position: 'absolute',
    top: 4,
    left: 12,
    zIndex: 4,
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 30,
    minHeight: 30,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  stageSoundPillOff: {
    backgroundColor: 'transparent',
  },
  stageHexButtonChrome: {
    ...StyleSheet.absoluteFillObject,
  },
  stageZeroLabelSlot: {
    position: 'absolute',
    top: 9,
    left: 52,
    right: 52,
    zIndex: 4,
    minHeight: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stageZeroLabel: {
    color: 'rgba(230, 237, 243, 0.48)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 1.15,
    textTransform: 'uppercase',
    includeFontPadding: false,
    textShadowColor: 'rgba(0, 0, 0, 0.72)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
  stageStatusPillBase: {
    zIndex: 1,
    maxWidth: 150,
    minHeight: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(28, 23, 14, 0.82)',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  stageStatusPill: {
    position: 'absolute',
    top: 8,
    right: 10,
    zIndex: 1,
    maxWidth: 150,
    minHeight: 24,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: 'rgba(28, 23, 14, 0.82)',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  stageStatusPillCenterSlot: {
    position: 'absolute',
    bottom: '18%',
    left: 0,
    right: 0,
    zIndex: 4,
    alignItems: 'center',
  },
  stageStatusPillCentered: {
    alignSelf: 'center',
    maxWidth: 150,
    minHeight: 18,
    paddingHorizontal: 9,
    paddingVertical: 2,
    alignItems: 'center',
    backgroundColor: 'rgba(28, 23, 14, 0.78)',
  },
  stageStatusPillText: {
    fontSize: 7.8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    includeFontPadding: false,
  },
  moduleTransitionShell: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moduleTransitionShellFramedCommand: {
    alignSelf: 'stretch',
    alignItems: 'stretch',
    width: '100%',
  },
  moduleTouchTarget: {
    flex: 1,
    minHeight: 0,
    zIndex: 0,
  },
  stageModulePill: {
    position: 'absolute',
    right: 10,
    top: 8,
    zIndex: 4,
    alignItems: 'center',
    justifyContent: 'center',
    width: 34,
    height: 34,
    minHeight: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.34)',
    backgroundColor: 'rgba(9, 14, 17, 0.76)',
  },
  stageModulePillActive: {
    borderColor: 'rgba(245, 199, 73, 0.58)',
    backgroundColor: 'rgba(42, 32, 11, 0.86)',
  },
  stageModulePillRecoveryMode: {
    top: 8,
    bottom: undefined,
  },
  moduleHost: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    justifyContent: 'flex-end',
    overflow: 'hidden',
    paddingTop: 54,
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  moduleBackgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.58,
  },
  moduleTopoLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.6,
  },
  moduleTopoLine: {
    position: 'absolute',
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(212, 160, 23, 0.18)',
  },
  moduleTopoLineA: {
    top: 62,
    left: -26,
    width: 220,
    transform: [{ rotate: '-8deg' }],
  },
  moduleTopoLineB: {
    top: '54%',
    right: -38,
    width: 260,
    transform: [{ rotate: '7deg' }],
  },
  moduleTopoLineC: {
    bottom: 32,
    left: 28,
    width: 280,
    transform: [{ rotate: '-3deg' }],
  },
  moduleContent: {
    position: 'relative',
    zIndex: 2,
    gap: 10,
  },
  moduleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  moduleIconChip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3, 7, 10, 0.7)',
  },
  moduleHeaderText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  moduleLabel: {
    fontSize: 13,
    lineHeight: 15,
    fontWeight: '900',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  moduleDescription: {
    color: 'rgba(230, 237, 243, 0.66)',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '700',
  },
  moduleStatusChip: {
    minHeight: 24,
    maxWidth: 116,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(19, 24, 30, 0.78)',
    paddingHorizontal: 8,
  },
  moduleStatusText: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  moduleMetricGrid: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 7,
  },
  moduleMetric: {
    flex: 1,
    minWidth: 0,
    minHeight: 42,
    justifyContent: 'center',
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.18)',
    backgroundColor: 'rgba(2, 5, 7, 0.32)',
    paddingHorizontal: 7,
    paddingVertical: 6,
  },
  moduleMetricLabel: {
    color: 'rgba(230, 237, 243, 0.48)',
    fontSize: 7.5,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  moduleMetricValue: {
    marginTop: 2,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  routeCommandContent: {
    position: 'relative',
    zIndex: 2,
    flex: 1,
    minHeight: 0,
    gap: 9,
    justifyContent: 'space-between',
  },
  routeCommandMainRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  routeCommandProgressRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3, 7, 10, 0.64)',
    shadowOpacity: 0.42,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 0 },
  },
  routeCommandProgressValue: {
    fontSize: 28,
    lineHeight: 31,
    fontWeight: '900',
    letterSpacing: 0.2,
    includeFontPadding: false,
  },
  routeCommandProgressLabel: {
    color: 'rgba(230, 237, 243, 0.5)',
    fontSize: 7.5,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 1,
  },
  routeCommandMetricStack: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  routeCommandMetricRow: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.16)',
    backgroundColor: 'rgba(2, 5, 7, 0.28)',
    paddingHorizontal: 8,
  },
  routeCommandMetricLabel: {
    color: 'rgba(230, 237, 243, 0.5)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  routeCommandMetricValue: {
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  routeCommandManeuver: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(3, 7, 10, 0.58)',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  routeCommandManeuverIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 5, 7, 0.72)',
  },
  routeCommandManeuverCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  routeCommandManeuverLabel: {
    color: 'rgba(230, 237, 243, 0.48)',
    fontSize: 7.5,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  routeCommandManeuverTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
  },
  routeCommandManeuverDistance: {
    maxWidth: 66,
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textAlign: 'right',
  },
  routeCommandFooterRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.16)',
    paddingTop: 5,
  },
  routeCommandFooterText: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(230, 237, 243, 0.6)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  routeCommandFooterRight: {
    textAlign: 'right',
  },
  routeCommandEmpty: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.15)',
    backgroundColor: 'rgba(3, 7, 10, 0.26)',
    paddingHorizontal: 14,
  },
  routeCommandEmptyTitle: {
    color: TACTICAL.text,
    fontSize: 14,
    lineHeight: 16,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  routeCommandEmptyText: {
    color: 'rgba(230, 237, 243, 0.58)',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  powerCommandBackgroundLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.34,
  },
  powerCommandContent: {
    position: 'relative',
    zIndex: 2,
    flex: 1,
    minHeight: 0,
    gap: 9,
    justifyContent: 'space-between',
  },
  powerCommandMainRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  powerCommandReserveModule: {
    width: 106,
    minHeight: 104,
    borderRadius: 14,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3, 7, 10, 0.68)',
    shadowOpacity: 0.36,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 0 },
    paddingHorizontal: 8,
    gap: 3,
  },
  powerCommandModuleLabel: {
    color: 'rgba(230, 237, 243, 0.54)',
    fontSize: 7.5,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  powerCommandReserveValue: {
    fontSize: 30,
    lineHeight: 33,
    fontWeight: '900',
    letterSpacing: 0.1,
    includeFontPadding: false,
  },
  powerCommandModuleState: {
    color: 'rgba(230, 237, 243, 0.68)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  powerCommandMetricStack: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  powerCommandMetric: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.16)',
    backgroundColor: 'rgba(2, 5, 7, 0.3)',
    paddingHorizontal: 8,
  },
  powerCommandMetricLabel: {
    color: 'rgba(230, 237, 243, 0.5)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  powerCommandMetricValue: {
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  powerCommandFlowStatus: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(3, 7, 10, 0.58)',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  powerCommandFlowIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 5, 7, 0.72)',
  },
  powerCommandFlowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  powerCommandFlowLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  powerCommandFlowDetail: {
    color: 'rgba(230, 237, 243, 0.62)',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
  },
  powerCommandFooterRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.16)',
    paddingTop: 5,
  },
  powerCommandFooterText: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(230, 237, 243, 0.6)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  powerCommandFooterRight: {
    textAlign: 'right',
  },
  environmentCommandContent: {
    position: 'relative',
    zIndex: 2,
    flex: 1,
    minHeight: 0,
    gap: 9,
    justifyContent: 'space-between',
  },
  environmentCommandMainRow: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  environmentCommandDaylightModule: {
    width: 132,
    minHeight: 104,
    borderRadius: 14,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(3, 7, 10, 0.66)',
    shadowOpacity: 0.34,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 0 },
    paddingHorizontal: 9,
    gap: 3,
    overflow: 'hidden',
  },
  environmentCommandSunCore: {
    position: 'absolute',
    top: 10,
    width: 54,
    height: 54,
    borderRadius: 27,
    opacity: 0.58,
    shadowOpacity: 0.72,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  environmentCommandLabel: {
    color: 'rgba(230, 237, 243, 0.54)',
    fontSize: 7.5,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  environmentCommandDaylightValue: {
    marginTop: 20,
    fontSize: 23,
    lineHeight: 26,
    fontWeight: '900',
    letterSpacing: 0.1,
    includeFontPadding: false,
    textAlign: 'center',
  },
  environmentCommandDetail: {
    color: 'rgba(230, 237, 243, 0.68)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  environmentCommandMetricStack: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  environmentCommandMetric: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.16)',
    backgroundColor: 'rgba(2, 5, 7, 0.3)',
    paddingHorizontal: 8,
  },
  environmentCommandMetricLabel: {
    color: 'rgba(230, 237, 243, 0.5)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  environmentCommandMetricValue: {
    flexShrink: 0,
    maxWidth: 96,
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0.2,
    textAlign: 'right',
  },
  environmentCommandSignalRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    borderRadius: 10,
    borderWidth: 1,
    backgroundColor: 'rgba(3, 7, 10, 0.58)',
    paddingHorizontal: 9,
    paddingVertical: 7,
  },
  environmentCommandSignalIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2, 5, 7, 0.72)',
  },
  environmentCommandSignalCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  environmentCommandSignalLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  environmentCommandSignalDetail: {
    color: 'rgba(230, 237, 243, 0.62)',
    fontSize: 9,
    lineHeight: 11,
    fontWeight: '800',
  },
  environmentCommandSignalValue: {
    maxWidth: 100,
    fontSize: 8.5,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
    textAlign: 'right',
    textTransform: 'uppercase',
  },
  environmentCommandNearestRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  environmentCommandNearestText: {
    flex: 1,
    minWidth: 0,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.15)',
    backgroundColor: 'rgba(2, 5, 7, 0.28)',
    paddingHorizontal: 7,
    paddingVertical: 5,
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  environmentCommandFooterRow: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.16)',
    paddingTop: 5,
  },
  environmentCommandFooterText: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(230, 237, 243, 0.6)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  environmentCommandFooterRight: {
    textAlign: 'right',
  },
  moduleSelectorBody: {
    flex: 1,
    minHeight: 280,
  },
  moduleSelectorContent: {
    flexGrow: 1,
  },
  moduleSelectorStack: {
    alignSelf: 'stretch',
    flexGrow: 1,
    gap: 8,
  },
  moduleSelectorOption: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.16)',
    backgroundColor: 'rgba(8, 12, 16, 0.72)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  moduleSelectorOptionSelected: {
    borderColor: 'rgba(245, 199, 73, 0.42)',
    backgroundColor: 'rgba(39, 29, 10, 0.68)',
  },
  moduleSelectorIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.18)',
    backgroundColor: 'rgba(2, 5, 7, 0.74)',
  },
  moduleSelectorText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  moduleSelectorLabel: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  moduleSelectorLabelSelected: {
    color: TACTICAL.amber,
  },
  moduleSelectorDetail: {
    color: 'rgba(230, 237, 243, 0.62)',
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '700',
  },
  moduleSelectorState: {
    minWidth: 70,
    minHeight: 28,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(139, 148, 158, 0.22)',
    backgroundColor: 'rgba(19, 24, 30, 0.72)',
    paddingHorizontal: 10,
  },
  moduleSelectorStateSelected: {
    borderColor: 'rgba(245, 199, 73, 0.42)',
    backgroundColor: 'rgba(42, 32, 11, 0.8)',
  },
  moduleSelectorStateText: {
    color: 'rgba(230, 237, 243, 0.58)',
    fontSize: 8,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  moduleSelectorStateTextSelected: {
    color: TACTICAL.amber,
  },
  panel: {
    flex: 1,
    minWidth: 0,
  },
  panelCenter: { flex: 1.18 },
  panelRight: {},
  panelFrame: {
    flex: 1,
    minWidth: 0,
  },
  panelFrameContent: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  panelContent: {
    position: 'relative',
    zIndex: 2,
    alignSelf: 'stretch',
    gap: 3,
    justifyContent: 'center',
  },
  panelContentCenter: {
    alignItems: 'center',
  },
  panelContentRight: {
    alignItems: 'flex-end',
  },
  panelTopoLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.55,
  },
  panelTopoLine: {
    position: 'absolute',
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(212, 160, 23, 0.13)',
  },
  panelTopoLineA: {
    top: 13,
    left: -18,
    width: 120,
    transform: [{ rotate: '-8deg' }],
  },
  panelTopoLineB: {
    bottom: 14,
    right: -16,
    width: 140,
    transform: [{ rotate: '7deg' }],
  },
  panelInnerStroke: {
    position: 'absolute',
    top: 3,
    right: 3,
    bottom: 3,
    left: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(241, 199, 103, 0.11)',
  },
  sunPanelHeader: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sunPanelHeaderIcon: {
    width: 12,
    minWidth: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sunPanelHeaderTitle: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.amber,
    fontSize: 7.6,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.35,
    includeFontPadding: false,
  },
  panelEyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'stretch' },
  panelEyebrowCenter: { justifyContent: 'center' },
  panelEyebrowRight: { justifyContent: 'flex-end' },
  panelEyebrow: { fontSize: 7.5, fontWeight: '900', letterSpacing: 1 },
  panelTitle: { fontSize: 12.5, lineHeight: 15, fontWeight: '900' },
  panelDetail: { color: 'rgba(230, 237, 243, 0.66)', fontSize: 8.5, lineHeight: 11, fontWeight: '700' },
  panelTextCenter: { textAlign: 'center' },
  panelTextRight: { textAlign: 'right' },
  sunPanelContent: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-end',
    alignItems: 'stretch',
    paddingTop: 0,
    paddingBottom: 0,
  },
  vehiclePanelContent: {
    flex: 1,
    minHeight: 0,
    position: 'relative',
    justifyContent: 'space-between',
    alignItems: 'stretch',
    paddingTop: 2,
  },
  weatherPanelContent: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-start',
    paddingBottom: 21,
  },
  routePanelContent: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-start',
    paddingBottom: 30,
  },
  powerPanelContent: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'flex-end',
    paddingBottom: 22,
  },
  sunlightTimeReadout: {
    maxWidth: '100%',
    fontSize: 9.4,
    lineHeight: 11,
    fontWeight: '800',
    letterSpacing: 0.08,
    includeFontPadding: false,
    textShadowColor: 'rgba(0, 0, 0, 0.74)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  sunlightBottomReadout: {
    alignSelf: 'stretch',
    marginTop: 'auto',
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  sunlightRemainingBlock: {
    flex: 1,
    minWidth: 0,
    maxWidth: '62%',
    gap: 1,
  },
  sunlightBottomLabel: {
    color: 'rgba(230, 237, 243, 0.62)',
    fontSize: 6.4,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.62,
    textTransform: 'uppercase',
    includeFontPadding: false,
    textShadowColor: 'rgba(0, 0, 0, 0.82)',
    textShadowRadius: 4,
    textShadowOffset: { width: 0, height: 1 },
  },
  sunlightRiseSetStack: {
    minWidth: 58,
    maxWidth: '42%',
    alignItems: 'flex-end',
    justifyContent: 'flex-end',
    gap: 1,
  },
  sunlightRiseSetText: {
    color: 'rgba(230, 237, 243, 0.78)',
    fontSize: 7.2,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.35,
    includeFontPadding: false,
    textShadowColor: 'rgba(0, 0, 0, 0.82)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
    textAlign: 'right',
  },
  sunGlyphLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 12,
    overflow: 'hidden',
    opacity: 0.96,
  },
  sunBackgroundImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  sunBackgroundScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(4, 5, 3, 0.34)',
    borderRadius: 12,
  },
  weatherGlyphLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 12,
    overflow: 'hidden',
    opacity: 0.96,
  },
  weatherBackgroundImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  weatherBackgroundScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(2, 5, 7, 0.38)',
    borderRadius: 12,
  },
  weatherBackgroundNightScrim: {
    backgroundColor: 'rgba(1, 3, 12, 0.54)',
  },
  weatherBackgroundFogScrim: {
    backgroundColor: 'rgba(16, 21, 24, 0.48)',
  },
  weatherMetricStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignSelf: 'stretch',
    minHeight: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.16)',
    paddingTop: 3,
  },
  weatherMetricText: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(230, 237, 243, 0.68)',
    fontSize: 6.8,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.45,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  vehicleGlyphLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: 12,
    overflow: 'hidden',
    opacity: 0.96,
  },
  vehicleProfileBackgroundImage: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  vehicleProfileBackgroundScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(2, 5, 7, 0.34)',
    borderRadius: 12,
  },
  vehicleBaseTelemetryRow: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  vehicleBaseIdentityBlock: {
    alignSelf: 'flex-end',
    width: '58%',
    maxWidth: '58%',
    minHeight: 0,
    gap: 1,
    paddingRight: 2,
    alignItems: 'flex-end',
  },
  vehicleBaseNameText: {
    maxWidth: '100%',
    color: 'rgba(245, 199, 73, 0.94)',
    fontSize: 6.8,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.28,
    textTransform: 'uppercase',
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.86)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  vehicleBaseIdentityText: {
    maxWidth: '100%',
    color: 'rgba(230, 237, 243, 0.72)',
    fontSize: 5.6,
    lineHeight: 7,
    fontWeight: '800',
    letterSpacing: 0.24,
    textTransform: 'uppercase',
    textAlign: 'right',
    textShadowColor: 'rgba(0, 0, 0, 0.82)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
  vehicleBaseTelemetryText: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(230, 237, 243, 0.82)',
    fontSize: 7.4,
    lineHeight: 9,
    fontWeight: '900',
    letterSpacing: 0.36,
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.82)',
    textShadowRadius: 5,
    textShadowOffset: { width: 0, height: 1 },
  },
  vehicleBaseTelemetryTextRight: {
    textAlign: 'right',
  },
  routeGlyphLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    opacity: 0.86,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: 'rgba(1, 7, 10, 0.38)',
  },
  routeProgressMapBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.9,
  },
  routeProgressRiveBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.92,
  },
  routeProgressMapScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(1, 6, 8, 0.24)',
    borderRadius: 12,
  },
  routeProgressOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
  },
  routeTopoLineA: {
    position: 'absolute',
    left: -12,
    top: 13,
    width: 120,
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 199, 73, 0.12)',
    transform: [{ rotate: '-9deg' }],
  },
  routeTopoLineB: {
    position: 'absolute',
    right: -18,
    top: 31,
    width: 136,
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 199, 73, 0.1)',
    transform: [{ rotate: '8deg' }],
  },
  routeTopoLineC: {
    position: 'absolute',
    left: 18,
    bottom: 12,
    width: 96,
    height: 1,
    borderRadius: 999,
    backgroundColor: 'rgba(245, 199, 73, 0.08)',
    transform: [{ rotate: '5deg' }],
  },
  routePathShadow: {
    position: 'absolute',
    left: 18,
    right: 20,
    top: 29,
    height: 5,
    borderRadius: 999,
    opacity: 0.75,
    shadowOpacity: 0.72,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  routePath: {
    position: 'absolute',
    left: 18,
    right: 20,
    top: 18,
    height: 26,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderTopRightRadius: 22,
    borderBottomRightRadius: 22,
    borderBottomLeftRadius: 16,
    transform: [{ rotate: '-5deg' }],
  },
  routePathCompleted: {
    position: 'absolute',
    left: 21,
    top: 30,
    height: 3,
    borderRadius: 999,
    opacity: 0.82,
    shadowOpacity: 0.72,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  routeMarkerStart: {
    position: 'absolute',
    left: 17,
    bottom: 20,
    width: 8,
    height: 8,
    borderRadius: 999,
    shadowOpacity: 0.86,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  routeMarkerCheckpoint: {
    position: 'absolute',
    left: 76,
    top: 18,
    width: 6,
    height: 6,
    borderRadius: 999,
    shadowOpacity: 0.72,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 0 },
  },
  routeMarkerEnd: {
    position: 'absolute',
    right: 18,
    top: 14,
    width: 9,
    height: 9,
    borderRadius: 999,
    shadowOpacity: 0.8,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 0 },
  },
  routeProgressPill: {
    position: 'absolute',
    right: 8,
    top: 6,
    minHeight: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.48)',
    backgroundColor: 'rgba(28, 20, 7, 0.68)',
    paddingHorizontal: 5,
    justifyContent: 'center',
  },
  routeProgressPillText: {
    fontSize: 6,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  routeMetricStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 5,
    rowGap: 2,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.16)',
    paddingTop: 3,
  },
  routeMetricName: {
    flexBasis: '100%',
    color: 'rgba(247, 201, 104, 0.8)',
    fontSize: 6.9,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.55,
    textTransform: 'uppercase',
  },
  routeMetricText: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(230, 237, 243, 0.68)',
    fontSize: 6.8,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  routeStandbyStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.12)',
    paddingTop: 3,
  },
  routeStandbyText: {
    color: 'rgba(230, 237, 243, 0.58)',
    fontSize: 6.8,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  powerGlyphLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 0,
    opacity: 0.88,
    overflow: 'hidden',
    borderRadius: 12,
    backgroundColor: 'rgba(1, 7, 10, 0.52)',
  },
  powerManagementBackground: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },
  powerManagementBackgroundScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(2, 5, 7, 0.34)',
    borderRadius: 12,
  },
  powerSolarSourceBlock: {
    position: 'absolute',
    left: 7,
    top: 7,
    width: 76,
    gap: 1,
  },
  powerSolarSourceLabel: {
    color: 'rgba(245, 199, 73, 0.72)',
    fontSize: 5.8,
    lineHeight: 7,
    fontWeight: '900',
    letterSpacing: 0.75,
  },
  powerSolarSourceValue: {
    fontSize: 9.2,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0,
  },
  powerColumnLeft: {
    position: 'absolute',
    left: 8,
    top: 34,
    width: 64,
    gap: 1,
  },
  powerColumnRight: {
    position: 'absolute',
    right: 8,
    top: 34,
    width: 64,
    alignItems: 'flex-end',
    gap: 1,
  },
  powerColumnLabel: {
    color: 'rgba(245, 199, 73, 0.72)',
    fontSize: 6,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  powerColumnValue: {
    fontSize: 11,
    lineHeight: 13,
    fontWeight: '900',
    letterSpacing: 0,
  },
  powerColumnSub: {
    maxWidth: 54,
    color: 'rgba(230, 237, 243, 0.58)',
    fontSize: 5.8,
    lineHeight: 7,
    fontWeight: '900',
    letterSpacing: 0.45,
  },
  powerFlowRows: {
    alignSelf: 'stretch',
    gap: 1,
    marginTop: 1,
  },
  powerFlowRow: {
    minHeight: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  powerFlowRowRight: {
    justifyContent: 'flex-end',
  },
  powerFlowRowLabel: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(230, 237, 243, 0.56)',
    fontSize: 5.4,
    lineHeight: 7,
    fontWeight: '900',
    letterSpacing: 0.26,
    textTransform: 'uppercase',
  },
  powerFlowRowValue: {
    color: 'rgba(139,148,158,0.86)',
    fontSize: 5.6,
    lineHeight: 7,
    fontWeight: '900',
    letterSpacing: 0,
    textAlign: 'right',
  },
  powerFlowRowValueActiveIn: {
    color: 'rgba(218, 255, 228, 0.94)',
  },
  powerFlowRowValueActiveOut: {
    color: 'rgba(255, 217, 143, 0.94)',
  },
  powerFlowLineInput: {
    position: 'absolute',
    left: 72,
    top: 63,
    width: 28,
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  powerFlowLineOutput: {
    position: 'absolute',
    right: 72,
    top: 63,
    width: 28,
    height: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  powerFlowPulseMini: {
    position: 'absolute',
    left: 0,
    top: -1,
    width: 18,
    height: 5,
    borderRadius: 999,
  },
  powerModuleBlock: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 122,
    height: 72,
    borderRadius: 8,
    borderWidth: 0,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    transform: [{ translateX: -61 }, { translateY: -36 }],
  },
  powerRiveForegroundLayer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 12,
    elevation: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  powerRiveForegroundBlock: {
    width: 236,
    height: 142,
    minWidth: 184,
    minHeight: 110,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    transform: [{ translateY: -12 }],
  },
  powerRiveModule: {
    width: '100%',
    height: '100%',
    minWidth: 96,
    minHeight: 56,
    alignSelf: 'center',
  },
  powerModuleLabel: {
    color: 'rgba(245, 199, 73, 0.72)',
    fontSize: 5.7,
    lineHeight: 7,
    fontWeight: '900',
    letterSpacing: 0.6,
  },
  powerModulePercent: {
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  powerBatteryIcon: {
    width: 34,
    height: 8,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(245, 199, 73, 0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 2,
  },
  powerBatteryBar: {
    flex: 1,
    height: 4,
    borderRadius: 1,
  },
  powerModuleStatus: {
    color: 'rgba(230, 237, 243, 0.58)',
    fontSize: 5.3,
    lineHeight: 6,
    fontWeight: '900',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  powerBottomStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 4,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderTopWidth: 0,
    borderColor: 'transparent',
    paddingTop: 0,
  },
  powerBottomStripText: {
    flex: 1,
    minWidth: 0,
    color: 'rgba(230, 237, 243, 0.68)',
    fontSize: 6.8,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.45,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  powerBottomStripLive: {
    color: 'rgba(218, 255, 228, 0.9)',
  },
  detailStack: { gap: 10 },
  detailRow: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    backgroundColor: 'rgba(8,12,16,0.62)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    gap: 4,
  },
  detailLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  detailValue: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '800',
  },
  powerFlowCard: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(8,12,16,0.72)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
  },
  powerFlowHeader: { gap: 3 },
  powerFlowLabel: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  powerFlowDetail: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  powerFlowRail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  powerFlowTrack: {
    flex: 1,
    minWidth: 0,
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  powerFlowTrackTint: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
  },
  powerFlowPulse: {
    width: 42,
    height: 8,
    borderRadius: 999,
    alignSelf: 'center',
  },
  unavailableNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: TACTICAL.amber + '10',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  unavailableText: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
});

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// WIDGET Ã¢â‚¬â€ MISSION SUSTAINMENT (Advanced Mode)
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
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

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// WIDGET Ã¢â‚¬â€ OPERATIONAL READINESS
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
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


// Ã¢â€â‚¬Ã¢â€â‚¬ Status Overview Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Route Progress Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Loadout Readiness Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Water Projection Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Fuel Range Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Vehicle Health Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Emergency Controls Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// WIDGET Ã¢â‚¬â€ POWER / ENERGY MONITOR (V2 Enhanced)
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
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


// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// CORE 4 WIDGET C Ã¢â‚¬â€ SUSTAINABILITY (Phase 5: Single Source of Truth)
//
// Planning mode (no active expedition): editable fuel% + water gal
// Active mode (expedition IN_PROGRESS): read-only display
// On save Ã¢â€ â€™ consumablesStore persists immediately Ã¢â€ â€™ weight system
// recalculates Ã¢â€ â€™ Vehicle Systems widget updates via WidgetGrid
// consumablesStore subscription.
//
// Tank capacity guardrail: if missing, show helper text in editor.
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
function SustainabilityWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // Ã¢â€â‚¬Ã¢â€â‚¬ ECS Power Summary (bus-backed) Ã¢â€â‚¬Ã¢â€â‚¬
  const ecsPower = getEcsPowerSummary();
  const powerAvailable = !!(ecsPower?.available && ecsPower?.has_devices);
  const powerPct = ecsPower?.battery_percent ?? null;
  const powerInput = ecsPower?.input_watts ?? null;
  const powerOutput = ecsPower?.output_watts ?? null;
  const powerRuntimeMin = ecsPower?.runtime_minutes ?? null;
  const powerFreshness = ecsPower?.freshness ?? 'unavailable';
  const powerStable = !!ecsPower?.is_sustainable;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Resolve vehicle context Ã¢â€â‚¬Ã¢â€â‚¬
  const activeVehicleContext = data.activeVehicleContext ?? getActiveVehicleContext();
  const activeVehicleId = activeVehicleContext.activeVehicleId;
  const spec = activeVehicleContext.spec || null;
  const consumables = useVehicleConsumables(activeVehicleId, activeVehicleContext.consumables ?? undefined);
  const hasActiveVehicle = activeVehicleContext.hasActiveVehicleId;
  const hasFuelContext = Boolean((spec?.fuel_tank_capacity_gal ?? 0) > 0);
  const hasWaterContext = activeVehicleContext.resourceProfile.waterCapacityGal != null;
  const configuredBatteryWh = activeVehicleContext.resourceProfile.batteryUsableWh ?? null;
  const hasConfiguredPowerProfile = configuredBatteryWh != null && configuredBatteryWh > 0;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Current values Ã¢â€â‚¬Ã¢â€â‚¬
  const fuelPct = hasFuelContext ? consumables?.fuel_percent_current ?? null : null;
  const waterGal = hasWaterContext ? consumables?.water_gal_current ?? 0 : null;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Planning vs Active mode Ã¢â€â‚¬Ã¢â€â‚¬
  const alternateFluidValue = formatAlternateFluidValue(consumables);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Est. Range (only if tank capacity + mpg available) Ã¢â€â‚¬Ã¢â€â‚¬
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
          text={`Configured power ${Math.round(configuredBatteryWh).toLocaleString()} Wh${configuredPowerRuntimeMin ? ` | Est. ${formatMinutesToRuntime(configuredPowerRuntimeMin)}` : ''}`}
          tone="neutral"
        />
      ) : null}
      {powerAvailable && powerPct != null ? (
        <WidgetMetaLine
          text={`Water ${waterGal != null ? `${waterGal.toFixed(1)} gal` : '--'}${estRange != null ? ` | Range ${estRange} mi` : ''}`}
          tone={waterGal != null && waterGal > 0 ? 'neutral' : 'attention'}
        />
      ) : (
        <WidgetMetaLine
          text={`Water ${waterGal != null ? `${waterGal.toFixed(1)} gal` : '--'}${estRange != null ? ` | Range ${estRange} mi` : ''}`}
          tone={waterGal != null && waterGal > 0 ? 'neutral' : 'attention'}
        />
      )}
    </WidgetCardShell>
  );
}

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// CORE 4 WIDGET D Ã¢â‚¬â€ PROGRESS
//
// Route Progress uses the shared active route progress contract from lib/activeRouteProgress.ts.
type RouteProgressSnapshot = ActiveRouteProgressSnapshot;
type AttitudeCommandFocusPanel = 'sunlight' | 'weather' | 'vehicle' | 'route' | 'power';
type DashboardWidgetViewportClass = 'phone_portrait' | 'tablet_portrait' | 'landscape_wide';

type AttitudeCommandLayoutMetrics = {
  viewportClass: DashboardWidgetViewportClass;
  shell: {
    gap: number;
    paddingHorizontal: number;
    paddingVertical: number;
  };
  topRow: {
    gap: number;
    minHeight: number;
    flexBasis: number;
  };
  bottomRow: {
    gap: number;
    minHeight: number;
    flexBasis: number;
  };
  attitudeStage: {
    minHeight: number;
    marginHorizontal?: number;
  };
  commandTitleBlock: {
    left: number;
    right: number;
    top: number;
  };
};

function clampCommandLayoutValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolveDashboardWidgetViewportClass(options?: WidgetRenderOptions): DashboardWidgetViewportClass {
  const widgetWidth = typeof options?.widgetWidth === 'number' && Number.isFinite(options.widgetWidth) ? options.widgetWidth : 0;
  const widgetHeight = typeof options?.widgetHeight === 'number' && Number.isFinite(options.widgetHeight) ? options.widgetHeight : 0;
  const screenWidth = typeof options?.screenWidth === 'number' && Number.isFinite(options.screenWidth) ? options.screenWidth : widgetWidth;
  const screenHeight = typeof options?.screenHeight === 'number' && Number.isFinite(options.screenHeight) ? options.screenHeight : widgetHeight;
  const isLandscape = screenWidth > screenHeight || (widgetWidth > widgetHeight && widgetWidth >= 560);

  if (isLandscape || widgetWidth >= 720 || screenWidth >= 840) return 'landscape_wide';
  if (widgetWidth >= 560 || screenWidth >= 700) return 'tablet_portrait';
  return 'phone_portrait';
}

function resolveAttitudeCommandLayoutMetrics(options?: WidgetRenderOptions): AttitudeCommandLayoutMetrics {
  const viewportClass = resolveDashboardWidgetViewportClass(options);
  const height = typeof options?.widgetHeight === 'number' && Number.isFinite(options.widgetHeight) ? options.widgetHeight : 560;

  if (viewportClass === 'landscape_wide') {
    const topHeight = clampCommandLayoutValue(height * 0.22, 92, 128);
    const bottomHeight = clampCommandLayoutValue(height * 0.24, 104, 142);
    const shellPaddingHorizontal = 8;
    return {
      viewportClass,
      shell: { gap: 6, paddingHorizontal: shellPaddingHorizontal, paddingVertical: 8 },
      topRow: { gap: 9, minHeight: topHeight, flexBasis: topHeight },
      bottomRow: { gap: 9, minHeight: bottomHeight, flexBasis: bottomHeight },
      attitudeStage: {
        minHeight: clampCommandLayoutValue(height * 0.4, 214, 330),
        marginHorizontal: 1 - shellPaddingHorizontal,
      },
      commandTitleBlock: { left: 150, right: 150, top: 9 },
    };
  }

  if (viewportClass === 'tablet_portrait') {
    const topHeight = clampCommandLayoutValue(height * 0.2, 88, 122);
    const bottomHeight = clampCommandLayoutValue(height * 0.21, 96, 132);
    const shellPaddingHorizontal = 7;
    return {
      viewportClass,
      shell: { gap: 6, paddingHorizontal: shellPaddingHorizontal, paddingVertical: 7 },
      topRow: { gap: 8, minHeight: topHeight, flexBasis: topHeight },
      bottomRow: { gap: 8, minHeight: bottomHeight, flexBasis: bottomHeight },
      attitudeStage: {
        minHeight: clampCommandLayoutValue(height * 0.4, 210, 320),
        marginHorizontal: 1 - shellPaddingHorizontal,
      },
      commandTitleBlock: { left: 128, right: 128, top: 8 },
    };
  }

  const topHeight = clampCommandLayoutValue(height * 0.19, 82, 108);
  const bottomHeight = clampCommandLayoutValue(height * 0.2, 90, 118);
  const shellPaddingHorizontal = 5;
  return {
    viewportClass,
    shell: { gap: 5, paddingHorizontal: shellPaddingHorizontal, paddingVertical: 6 },
    topRow: { gap: 5, minHeight: topHeight, flexBasis: topHeight },
    bottomRow: { gap: 6, minHeight: bottomHeight, flexBasis: bottomHeight },
    attitudeStage: {
      minHeight: clampCommandLayoutValue(height * 0.38, 186, 270),
      marginHorizontal: 1 - shellPaddingHorizontal,
    },
    commandTitleBlock: { left: 88, right: 88, top: 7 },
  };
}

function useRouteProgressCommandSnapshot(options?: WidgetRenderOptions): RouteProgressSnapshot | null {
  return useActiveRouteProgressSnapshot(options);
}
function ProgressWidget({ data: _data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const [, setRouteRevision] = useState(0);

  useEffect(() => {
    const syncRoute = () => {
      setRouteRevision((rev) => rev + 1);
    };
    return routeStore.subscribe(syncRoute);
  }, []);

  const progressSummary = useRouteProgressCommandSnapshot(options);

  if (compact) {
    if (!progressSummary) {
      return (
        <WidgetCompactRow
          title="Progress"
          summary={ECS_STATE_COPY.dashboard.noRouteActive.title}
          tone="unavailable"
        />
      );
    }
    const compactSummary = progressSummary.isActive
      ? `${progressSummary.routeLabel} - ${progressSummary.progressPercent}%`
      : `${progressSummary.stateLabel} - ${progressSummary.progressPercent}%`;
    const compactStatus = progressSummary.remainingDurationText !== '--'
      ? `${progressSummary.remainingMilesText} - ${progressSummary.remainingDurationText}`
      : `${progressSummary.progressPercent}% - ${progressSummary.remainingMilesText}`;
    return (
      <WidgetCompactRow
        title="Progress"
        summary={compactSummary.replace('Ã¢â‚¬Â¢', '-').replace('-', '-')}
        tone={progressSummary.stateTone}
        status={compactStatus.replace('Ã¢â‚¬Â¢', '-').replace('-', '-')}
        statusTone={progressSummary.isComplete ? 'good' : 'neutral'}
      />
    );
  }

  // Ã¢-ÂÃ¢-ÂÃ¢-Â FALLBACK: No active route Ã¢-ÂÃ¢-ÂÃ¢-Â
  if (!progressSummary) {
    return (
      <WidgetCardShell badge={{ label: 'NO ROUTE', tone: 'unavailable' }}>
        <View style={progS.summaryBody}>
          <WidgetPrimaryValue
            label="ROUTE STATUS"
            value="INACTIVE"
            tone="neutral"
          />
          <WidgetSecondaryRow
            items={[
              { label: 'REMAINING', value: '--', tone: 'neutral' },
              { label: 'TIME', value: '--', tone: 'neutral' },
            ]}
          />
          <WidgetMetaLine text="Open Navigate to stage a route." tone="neutral" />
        </View>
      </WidgetCardShell>
    );
  }

  const progressTone: WidgetTone = progressSummary.stateTone;

  return (
    <WidgetCardShell badge={{
      label: progressSummary.stateLabel,
      tone: progressSummary.stateTone,
    }}>
      <View style={progS.summaryBody}>
        <WidgetPrimaryValue
          label="COMPLETE"
          value={`${progressSummary.progressPercent}%`}
          tone={progressTone}
        />
        <WidgetMetaLine
          text={[
            progressSummary.routeLabel,
            progressSummary.destinationLabel && progressSummary.destinationLabel !== progressSummary.routeLabel
              ? `to ${progressSummary.destinationLabel}`
              : null,
          ].filter(Boolean).join(' ')}
          tone="neutral"
        />
        <WidgetSecondaryRow
          items={[
            { label: 'REMAINING', value: progressSummary.remainingMilesText, tone: progressSummary.isComplete ? 'good' : 'neutral' },
            { label: 'DONE', value: progressSummary.completedMilesText, tone: progressSummary.isComplete ? 'good' : 'neutral' },
          ]}
        />
        <WidgetSecondaryRow
          items={[
            { label: 'ETA', value: progressSummary.etaLabel, tone: progressSummary.isComplete ? 'good' : 'neutral' },
            { label: 'LEFT', value: `${Math.max(0, 100 - progressSummary.progressPercent)}%`, tone: progressSummary.stateTone },
          ]}
        />
        {progressSummary.nextInstruction ? (
          <WidgetMetaLine text={progressSummary.nextInstruction} tone="neutral" />
        ) : null}
        <WidgetMetaLine
          text={progressSummary.footerText}
          tone={progressSummary.isComplete ? 'good' : progressSummary.isActive ? 'neutral' : 'attention'}
        />
      </View>
    </WidgetCardShell>
  );
}




// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// ACTIVE MODE WIDGET A Ã¢â‚¬â€ REMOTENESS (v2.0 Phase 3B)
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
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â


const RemotenessWidget = React.memo(function RemotenessWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Subscribe to remotenessStore for reactive re-renders Ã¢â€â‚¬Ã¢â€â‚¬
  // Phase 3B: Notifications only fire when output meaningfully changes
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = remotenessStore.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Start/stop store lifecycle on mount/unmount Ã¢â€â‚¬Ã¢â€â‚¬
  // Phase 3B: Store gathers its own signals internally;
  // no feed() call needed from the widget.
  useEffect(() => {
    remotenessStore.start();
    return () => {
      remotenessStore.stop();
    };
  }, []); // mount/unmount only

  // Ã¢â€â‚¬Ã¢â€â‚¬ Read current output from store Ã¢â€â‚¬Ã¢â€â‚¬
  // Phase 3B: Returns a stable cached object reference
  const output = remotenessStore.get();

  // Ã¢â€â‚¬Ã¢â€â‚¬ Empty state: no active expedition Ã¢â€â‚¬Ã¢â€â‚¬
  const activeExpedition = missionExpeditionStore.getActive();
  const hasFix = options?.gpsHasFix ?? false;
  const hasLiveRemotenessContext = hasFix || output.score > 0;

  if (compact) {
    if (!hasLiveRemotenessContext) {
      return <WidgetCompactRow title="Remote" summary="Waiting for GPS" tone="unavailable" />;
    }
    return <WidgetCompactRow title="Remote" summary={output.tier} tone="neutral" status={activeExpedition ? 'Expedition live' : 'GPS live'} statusTone="neutral" />;
  }

  // Ã¢â€â‚¬Ã¢â€â‚¬ Full widget empty states Ã¢â€â‚¬Ã¢â€â‚¬
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
  // Ã¢â€â‚¬Ã¢â€â‚¬ Subscribe for live updates Ã¢â€â‚¬Ã¢â€â‚¬
  const [, setRev] = useState(0);
  useEffect(() => {
    const unsub = remotenessStore.subscribe(() => setRev(r => r + 1));
    return unsub;
  }, []);

  // Ã¢â€â‚¬Ã¢â€â‚¬ Phase 4A: Subscribe to Risk Engine updates Ã¢â€â‚¬Ã¢â€â‚¬
  const [, setRiskRev] = useState(0);
  useEffect(() => {
    try {
      const unsub = expeditionRiskStore.subscribe(() => setRiskRev((r: number) => r + 1));
      return unsub;
    } catch { return undefined; }
  }, []);

  const output = remotenessStore.get();
  const { signals } = output;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Elevation complexity from cached store result (Phase 3B) Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Connectivity display Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Speed display Ã¢â€â‚¬Ã¢â€â‚¬
  const sustainedStr = signals.sustainedSpeedMph != null
    ? `${signals.sustainedSpeedMph.toFixed(1)} mph`
    : '\u2014';
  const speedActive = signals.speedScore > 0;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Phase 3C: Cache readiness display Ã¢â€â‚¬Ã¢â€â‚¬
  const cacheColor = signals.cacheReady ? '#2196F3' : TACTICAL.textMuted;
  const cacheLabel = signals.cacheReady ? 'READY' : 'NONE';

  // Ã¢â€â‚¬Ã¢â€â‚¬ Phase 3D: Freshness display Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Phase 4A: Risk Engine data Ã¢â€â‚¬Ã¢â€â‚¬
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Signal A: Elevation complexity Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Signal B: Connectivity (Phase 3D: freshness-aware) Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Signal C: Speed Nuance (Phase 2) Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Phase 4A/4C: Expedition Risk Engine Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Phase 4C: Environmental Risk Inputs Ã¢â€â‚¬Ã¢â€â‚¬ */}
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

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Tier Scale Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <View style={s.detailDivider} />
      <Text style={s.detailSection}>TIER SCALE</Text>
      <MetricRow label="0\u201315" value="NEAR CIVILIZATION" color="#4CAF50" />
      <MetricRow label="16\u201335" value="BACKCOUNTRY" color="#C48A2C" />
      <MetricRow label="36\u201360" value="REMOTE" color="#E67E22" />
      <MetricRow label="61\u201380" value="DEEP REMOTE" color="#EF5350" />
      <MetricRow label="81\u2013100" value="EXTREME" color="#C0392B" />

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ Engine Info Ã¢â€â‚¬Ã¢â€â‚¬ */}
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


















// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// ACTIVE MODE WIDGET B Ã¢â‚¬â€ EXPEDITION CHANNEL (Phase 6)
//
// Team connectivity and recent expedition activity.
// Solo fallback when no team members detected.
// Tap opens Team / Channel screen (placeholder).
// Active mode only Ã¢â‚¬â€ never shown in planning mode.
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â

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


// Ã¢â€â‚¬Ã¢â€â‚¬ Custom Widget Renderer Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬


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

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// ECOFLOW POWER WIDGET Ã¢â‚¬â€ Unified Power Authority Bridge
//
// Production path: legacy EcoFlow widget type now delegates to the
// unified power system widget so dashboard power rendering flows through
// BluPowerAuthority instead of the legacy direct EcoFlow live hook.
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
function EcoFlowPowerWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  return compact ? <PowerSystemCompact /> : <PowerSystemCard />;
}


// Ã¢â€â‚¬Ã¢â€â‚¬ EcoFlow Power Widget Styles Ã¢â€â‚¬Ã¢â€â‚¬
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



// Ã¢â€â‚¬Ã¢â€â‚¬ EcoFlow Power Detail Styles Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Large SOC display Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Large SOC bar Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Power flow rows Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Net power row Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Solar history Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Refresh button Ã¢â€â‚¬Ã¢â€â‚¬
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


// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// HIGHWAY WIDGETS Ã¢â‚¬â€ Mode-specific awareness instruments
//
// These widgets now render from the consolidated Widgets dashboard tab.
// They keep ECS.highwayBlue as their accent color to preserve
// their travel-awareness visual language.
//
// Default Highway Widgets:
//   1) Forward Weather   Ã¢â‚¬â€ route weather forecast
//   2) Daylight Remaining Ã¢â‚¬â€ sunset / civil twilight
//   3) Cell Coverage     Ã¢â‚¬â€ signal strength forecast
//
// Library Highway Widgets:
//   4) Wind Monitor      Ã¢â‚¬â€ wind speed & direction
//   5) Elevation Profile Ã¢â‚¬â€ grade & altitude
//   6) Road Hazards      Ã¢â‚¬â€ hazard alerts
//   7) Power Monitor     Ã¢â‚¬â€ vehicle electrical
//   8) Sun Glare Forecast Ã¢â‚¬â€ glare risk
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â

const HWY_ACCENT = ECS.highwayBlue;       // #5B8DEF
const HWY_ACCENT_SOFT = ECS.highwayBlueSoft; // rgba(91,141,239,0.15)

function hasMeaningfulWeatherSnapshot(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): boolean {
  return (
    getCurrentWeatherTemperatureF(snapshot) != null ||
    snapshot.current.windSpeed != null ||
    snapshot.current.windGust != null ||
    snapshot.current.windDirection != null ||
    snapshot.current.precipChance != null ||
    Boolean(snapshot.current.condition) ||
    snapshot.alerts.length > 0 ||
    snapshot.daily.length > 0
  );
}

function isECSWeatherSnapshot(
  snapshot: WidgetData['weatherSnapshot'],
): snapshot is ECSWeatherSnapshot {
  return Boolean(
    snapshot &&
    typeof snapshot === 'object' &&
    'locationName' in snapshot &&
    'current' in snapshot &&
    'alerts' in snapshot,
  );
}

function getWeatherSnapshotUpdatedMs(snapshot: ECSWeatherSnapshot | null | undefined): number {
  if (!snapshot) return 0;
  const timestampCandidates = [
    snapshot.status.timestampMs,
    snapshot.status.cachedAt,
    snapshot.cache.cachedAt,
    snapshot.fetchedAt,
    snapshot.normalized.updatedAt,
  ];

  for (const candidate of timestampCandidates) {
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      return candidate;
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      const parsed = Date.parse(candidate);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  }

  return 0;
}

function shouldUseOperationalWeatherSnapshot(
  injectedSnapshot: ECSWeatherSnapshot | null,
  operationalSnapshot: ECSWeatherSnapshot,
): boolean {
  if (!injectedSnapshot) return true;

  const operationalHasData = hasMeaningfulWeatherSnapshot(operationalSnapshot);
  const injectedHasData = hasMeaningfulWeatherSnapshot(injectedSnapshot);
  if (operationalHasData && !injectedHasData) return true;
  if (!operationalHasData && injectedHasData) return false;

  const operationalIsLive = operationalSnapshot.status.kind === 'live';
  const injectedIsLive = injectedSnapshot.status.kind === 'live';
  if (operationalHasData && operationalIsLive && !injectedIsLive) return true;

  const operationalUpdatedAt = getWeatherSnapshotUpdatedMs(operationalSnapshot);
  const injectedUpdatedAt = getWeatherSnapshotUpdatedMs(injectedSnapshot);
  if (operationalHasData && operationalUpdatedAt > injectedUpdatedAt) return true;

  return !injectedHasData;
}

function useCanonicalWidgetWeatherSnapshot(
  data: WidgetData,
  options?: WidgetRenderOptions,
): ECSWeatherSnapshot {
  const operationalWeather = useOperationalWeather({
    enabled: true,
    gps: {
      lat: options?.gpsLatitude ?? null,
      lng: options?.gpsLongitude ?? null,
      hasFix: options?.gpsHasFix ?? false,
      accuracyM: options?.gpsAccuracyM ?? null,
    },
  });
  const injectedSnapshot = isECSWeatherSnapshot(data.weatherSnapshot)
    ? data.weatherSnapshot
    : null;

  return shouldUseOperationalWeatherSnapshot(injectedSnapshot, operationalWeather.snapshot)
    ? operationalWeather.snapshot
    : injectedSnapshot ?? operationalWeather.snapshot;
}

function formatCompactWeatherCondition(condition: string | null | undefined): string {
  if (!condition) return 'WEATHER';

  const normalized = condition
    .replace(/thunderstorms?/gi, 'Storm')
    .replace(/showers?/gi, 'Rain')
    .replace(/scattered/gi, 'Sct')
    .replace(/isolated/gi, 'Iso')
    .replace(/freezing/gi, 'Frz')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= 18) return normalized.toUpperCase();

  const words = normalized.split(' ').filter(Boolean);
  if (words.length >= 2) {
    const twoWord = `${words[0]} ${words[1]}`.trim();
    if (twoWord.length <= 18) return twoWord.toUpperCase();
    return words[0].toUpperCase();
  }

  return normalized.slice(0, 18).trim().toUpperCase();
}

function getCompactWeatherSourceLabel(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string {
  if (snapshot.sourceType === 'current_location') return 'GPS WEATHER';
  if (snapshot.sourceType === 'cached') return 'CACHED WEATHER';
  return 'ROUTE WEATHER';
}

type DashboardWeatherForecastDay = NormalizedWeatherForecast & {
  sourceShape?: 'normalized.forecast' | 'daily.forecast';
  sourceIndex?: number;
  sourceState?: string;
};

function annotateForecastDaySource(
  day: NormalizedWeatherForecast,
  sourceShape: DashboardWeatherForecastDay['sourceShape'],
  sourceIndex: number,
  sourceState: string,
): DashboardWeatherForecastDay {
  return {
    ...day,
    sourceShape,
    sourceIndex,
    sourceState,
  };
}

function getNormalizedForecastDays(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): DashboardWeatherForecastDay[] {
  if (snapshot.normalized.forecast?.length) {
    return snapshot.normalized.forecast
      .slice(0, 16)
      .map((day, index) => annotateForecastDaySource(day, 'normalized.forecast', index, snapshot.status.kind));
  }

  return snapshot.daily
    .map((day, index): DashboardWeatherForecastDay | null => {
      if (!day) return null;
      const highTemperatureF = day.temp_max ?? undefined;
      const lowTemperatureF = day.temp_min ?? undefined;
      const temperatureF = day.temp_day ?? day.temp_max ?? day.temp_min ?? undefined;
      const condition = day.weather_main || day.weather_description || undefined;
      const windMph = day.wind_max ?? undefined;
      const windGustMph = day.wind_gust_max ?? undefined;
      const precipitationChance = day.pop ?? undefined;
      if (
        temperatureF == null &&
        highTemperatureF == null &&
        lowTemperatureF == null &&
        windMph == null &&
        windGustMph == null &&
        precipitationChance == null &&
        !condition
      ) {
        return null;
      }
      return annotateForecastDaySource(
        {
          time: day.date ?? '',
          ...(temperatureF != null ? { temperatureF } : null),
          ...(highTemperatureF != null ? { highTemperatureF } : null),
          ...(lowTemperatureF != null ? { lowTemperatureF } : null),
          ...(condition ? { condition } : null),
          ...(windMph != null ? { windMph } : null),
          ...(windGustMph != null ? { windGustMph } : null),
          ...(precipitationChance != null ? { precipitationChance } : null),
        },
        'daily.forecast',
        index,
        snapshot.status.kind,
      );
    })
    .filter((day): day is DashboardWeatherForecastDay => day != null)
    .slice(0, 16);
}

function getNextWeatherForecast(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): NormalizedWeatherForecast | null {
  return getNormalizedForecastDays(snapshot)[0] ?? null;
}

function formatForecastCompactLine(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string | null {
  const next = getNextWeatherForecast(snapshot);
  if (!next) return null;
  const condition = formatCompactWeatherCondition(next.condition);
  const temp = formatWeatherDegrees(next.highTemperatureF ?? next.lowTemperatureF ?? next.temperatureF);
  const wind = next.windMph != null ? `W ${Math.round(next.windMph)}` : null;
  return [condition, temp, wind].filter(Boolean).join(' ');
}

function formatForecastDateLabel(day: NormalizedWeatherForecast): string {
  const time = day.time;
  return time.length >= 10 ? time.slice(5, 10).replace('-', '/') : time;
}

function formatForecastTemperatureRange(day: NormalizedWeatherForecast): string {
  const high = formatWeatherDegrees(day.highTemperatureF);
  const low = formatWeatherDegrees(day.lowTemperatureF);
  if (day.highTemperatureF != null && day.lowTemperatureF != null) return `${high} / ${low}`;
  return formatWeatherDegrees(day.highTemperatureF ?? day.lowTemperatureF ?? day.temperatureF);
}

function formatWeatherTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'Unavailable';
  return new Date(seconds * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatForecastDetailLine(day: NormalizedWeatherForecast): string {
  const condition = day.condition || 'Forecast';
  const temp = formatForecastTemperatureRange(day);
  const wind = day.windMph != null ? `Wind ${Math.round(day.windMph)} mph` : null;
  const gust = day.windGustMph != null ? `Gust ${Math.round(day.windGustMph)} mph` : null;
  const precip = day.precipitationChance != null && day.precipitationChance > 0 ? `Rain ${Math.round(day.precipitationChance)}%` : null;
  return [temp, condition, wind, gust, precip].filter(Boolean).join(' | ');
}

function getDashboardWeatherLocationLabel(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string {
  const label = (snapshot.location.label || snapshot.locationName || '').trim();
  if (label) return label;
  if (snapshot.location.lat != null && snapshot.location.lng != null) {
    return `${snapshot.location.lat.toFixed(2)}, ${snapshot.location.lng.toFixed(2)}`;
  }
  return 'Current location';
}

function getDashboardWeatherStateLabel(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string {
  switch (snapshot.status.kind) {
    case 'live':
    case 'ready':
      return 'Live';
    case 'cached':
      return 'Cached';
    case 'stale':
    case 'offline':
      return 'Stale';
    case 'provider_error':
      return hasMeaningfulWeatherSnapshot(snapshot) ? 'Cached' : 'Unavailable';
    case 'permission_required':
    case 'permission-blocked':
      return 'Permission required';
    case 'loading':
    case 'waiting_for_gps':
      return 'Loading';
    default:
      return 'Unavailable';
  }
}

function getDashboardWeatherStateTone(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): WidgetTone {
  if (snapshot.alerts[0]?.severity === 'extreme') return 'critical';
  if (snapshot.alerts.length > 0 || snapshot.status.kind === 'provider_error') return 'attention';
  if (snapshot.status.kind === 'stale' || snapshot.status.kind === 'offline' || snapshot.status.kind === 'cached') return 'stale';
  return 'good';
}

function getDashboardWeatherHighLow(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string | null {
  const firstDay = getNormalizedForecastDays(snapshot)[0] ?? null;
  const high = snapshot.current.highTemperature ?? snapshot.normalized.current?.highTemperatureF ?? firstDay?.highTemperatureF ?? null;
  const low = snapshot.current.lowTemperature ?? snapshot.normalized.current?.lowTemperatureF ?? firstDay?.lowTemperatureF ?? null;
  if (high == null && low == null) return null;
  return `H ${formatWeatherDegrees(high)} / L ${formatWeatherDegrees(low)}`;
}

function getDashboardWeatherSecondaryField(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): {
  label: string;
  value: string;
  tone: WidgetTone;
} {
  const precipChance = snapshot.current.precipChance != null ? Math.round(snapshot.current.precipChance) : null;
  const windSpeed = snapshot.current.windSpeed != null ? Math.round(snapshot.current.windSpeed) : null;
  const windGust = snapshot.current.windGust != null ? Math.round(snapshot.current.windGust) : null;
  const highLow = getDashboardWeatherHighLow(snapshot);

  if (precipChance != null && precipChance >= 30) {
    return {
      label: snapshot.current.precipType === 'snow' ? 'Snow' : 'Rain',
      value: `${precipChance}%`,
      tone: precipChance >= 60 ? 'attention' : 'neutral',
    };
  }

  if (windGust != null || windSpeed != null) {
    const value = windGust != null ? `G ${windGust} mph` : `${windSpeed} mph`;
    return {
      label: windGust != null ? 'Gusts' : 'Wind',
      value,
      tone: (windGust ?? windSpeed ?? 0) >= 25 ? 'attention' : 'neutral',
    };
  }

  if (highLow) return { label: 'Today', value: highLow, tone: 'neutral' };

  return { label: 'Source', value: getCompactWeatherSourceLabel(snapshot), tone: getDashboardWeatherStateTone(snapshot) };
}

function getDashboardWeatherForecastStrip(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): {
  label: string;
  value: string;
  tone: WidgetTone;
}[] {
  return getNormalizedForecastDays(snapshot)
    .slice(0, 3)
    .map((day, index) => ({
      label: formatForecastDateLabel(day) || `D${index + 1}`,
      value: formatForecastTemperatureRange(day),
      tone: day.precipitationChance != null && day.precipitationChance >= 50 ? 'attention' as const : 'neutral' as const,
    }));
}

function formatDashboardWeatherCacheAge(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string {
  const ageMinutes = snapshot.status.ageMinutes ?? (snapshot.cacheAgeMs != null ? Math.round(snapshot.cacheAgeMs / 60000) : null);
  if (ageMinutes == null) return '--';
  if (ageMinutes < 60) return `${ageMinutes}m`;
  const hours = Math.floor(ageMinutes / 60);
  const minutes = ageMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

function formatDashboardWeatherLocationConfidence(snapshot: ReturnType<typeof useOperationalWeather>['snapshot']): string {
  const labelConfidence = snapshot.location.labelConfidence.toUpperCase();
  const confidencePct = Math.round(Math.max(0, Math.min(1, snapshot.locationConfidence)) * 100);
  return `${labelConfidence} / ${confidencePct}%`;
}

// Ã¢â€â‚¬Ã¢â€â‚¬ Highway MetricRow with blue accent Ã¢â€â‚¬Ã¢â€â‚¬
function HwyMetricRow({ label, value, color, muted }: { label: string; value: string; color?: string; muted?: boolean }) {
  return (
    <View style={hwyS.metricRow}>
      <Text style={hwyS.metricLabel}>{label}</Text>
      <Text style={[hwyS.metricValue, color ? { color } : null, muted ? { color: TACTICAL.textMuted } : null]}>{value}</Text>
    </View>
  );
}

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// HIGHWAY WIDGET 1 Ã¢â‚¬â€ FORWARD WEATHER
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
function HwyForwardWeatherWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const isFeatured = options?.isFeatured ?? false;
  const lastCriticalAlertRef = useRef<string | null>(null);
  const snapshot = useCanonicalWidgetWeatherSnapshot(data, options);
  const currentTempF = getCurrentWeatherTemperatureF(snapshot);
  const alertLine = formatWeatherAlertLine(snapshot) || 'Operational weather nominal';
  const hasMeaningfulData = hasMeaningfulWeatherSnapshot(snapshot);
  const weatherState = resolveWeatherWidgetState(snapshot);
  const criticalAlertSignature = getCriticalWeatherAlertSignature(snapshot);
  const tempCompact = formatWeatherDegrees(currentTempF);
  const windCompact = snapshot.current.windSpeed != null ? `${Math.round(snapshot.current.windSpeed)} mph` : '--';
  const precipCompact = snapshot.current.precipChance != null ? `${Math.round(snapshot.current.precipChance)}%` : '--';
  const compactCondition = formatCompactWeatherCondition(snapshot.current.condition || snapshot.current.description);
  const weatherCompactSummary =
    snapshot.alerts.length > 0
      ? alertLine
      : hasMeaningfulData
        ? `${getDashboardWeatherLocationLabel(snapshot)} | ${compactCondition}`
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
      featured={isFeatured}
    />
  );

  /*
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
      Status badge
      <View style={[hwyS.statusBadge]}>
        <Ionicons name="cloud-outline" size={10} color={HWY_ACCENT} />
        <Text style={[hwyS.statusText, { color: HWY_ACCENT }]}>{conditions.toUpperCase()}</Text>
      </View>

      <HwyMetricRow label="TEMPERATURE" value={`${tempF}°F`} color={tempF > 95 ? '#EF5350' : tempF < 32 ? '#4FC3F7' : HWY_ACCENT} />
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
  const snapshot = useCanonicalWidgetWeatherSnapshot(data, options);
  const currentTempF = getCurrentWeatherTemperatureF(snapshot);
  const tempF = currentTempF != null ? Math.round(currentTempF) : 0;
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
      <HwyMetricRow label="TEMPERATURE" value={`${tempF}°F`} />
      <HwyMetricRow label="FEELS LIKE" value={`${tempF - 2}°F`} />
      <HwyMetricRow label="DEW POINT" value={`${dewPoint}°F`} />
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

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// HIGHWAY WIDGET 2 Ã¢â‚¬â€ DAYLIGHT REMAINING
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
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
  locationText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0,
    lineHeight: 10,
    textTransform: 'uppercase',
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
    letterSpacing: 0,
  },
  todayRangeText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    lineHeight: 11,
    letterSpacing: 0,
    fontFamily: 'Courier',
  },
  tempHeroTile: {
    minWidth: 80,
    maxWidth: 96,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 2,
  },
  tempHeroValue: {
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 34,
    letterSpacing: 0,
    fontFamily: 'Courier',
  },
  statePillText: {
    fontSize: 7,
    fontWeight: '900',
    lineHeight: 9,
    letterSpacing: 0,
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
  compactCardBody: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'space-between',
    gap: 4,
    paddingVertical: 2,
  },
  compactLocationText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    lineHeight: 10,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  compactCardLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    lineHeight: 9,
  },
  compactCardCondition: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    lineHeight: 15,
    letterSpacing: 0,
  },
  compactCardTemp: {
    fontSize: 30,
    fontWeight: '900',
    color: TACTICAL.text,
    lineHeight: 32,
    letterSpacing: 0,
    fontFamily: 'Courier',
  },
  compactCardSupport: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
    letterSpacing: 0,
  },
});

function HwyForwardWeatherCardBlock({
  snapshot,
  alertLine,
  featured = false,
}: {
  snapshot: ReturnType<typeof useOperationalWeather>['snapshot'];
  alertLine: string;
  featured?: boolean;
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
  const windGust = snapshot.current.windGust != null ? Math.round(snapshot.current.windGust) : null;
  const precipChance = snapshot.current.precipChance != null ? Math.round(snapshot.current.precipChance) : null;
  const tempValue = formatWeatherDegrees(snapshot.current.temp);
  const windValue = windSpeed != null ? `${windSpeed} mph` : '--';
  const gustValue = windGust != null ? `${windGust} mph` : '--';
  const precipLabel = snapshot.current.precipType === 'snow' ? 'Snow' : 'Rain';
  const precipValue = precipChance != null ? `${precipChance}%` : '--';
  const hasAlert = snapshot.alerts.length > 0;
  const severeAlert = snapshot.alerts[0]?.severity === 'extreme';
  const windConcern = (windGust ?? windSpeed) != null && (windGust ?? windSpeed)! >= 25;
  const precipConcern = precipChance != null && precipChance >= 60;
  const temperatureConcern = snapshot.current.temp != null && (snapshot.current.temp >= 95 || snapshot.current.temp <= 32);
  const bandTone = severeAlert || temperatureConcern ? 'critical' : hasAlert || windConcern || precipConcern ? 'attention' : 'live';
  const compactCondition = formatCompactWeatherCondition(snapshot.current.condition);
  const locationLabel = getDashboardWeatherLocationLabel(snapshot);
  const stateLabel = getDashboardWeatherStateLabel(snapshot);
  const highLowLine = getDashboardWeatherHighLow(snapshot);
  const secondaryField = getDashboardWeatherSecondaryField(snapshot);
  const alternateField = secondaryField.label === 'Wind' || secondaryField.label === 'Gusts'
    ? { label: precipLabel, value: precipValue, tone: precipConcern ? 'attention' as const : 'neutral' as const }
    : {
        label: windGust != null ? 'Gusts' : 'Wind',
        value: windGust != null ? gustValue : windValue,
        tone: windConcern ? 'attention' as const : 'neutral' as const,
      };
  const stateTone = getDashboardWeatherStateTone(snapshot);
  const forecastStrip = getDashboardWeatherForecastStrip(snapshot);
  const compactSupportLine = hasAlert
    ? `${snapshot.alerts[0]?.severity?.toUpperCase() ?? 'ACTIVE'} ALERT`
    : `${secondaryField.label.toUpperCase()} ${secondaryField.value}`;
  const compactSupportTone =
    severeAlert
      ? 'critical'
      : hasAlert || secondaryField.tone === 'attention'
        ? 'attention'
        : snapshot.status.kind === 'stale' || snapshot.status.kind === 'offline'
          ? 'stale'
          : 'neutral';
  const compactFooterLine =
    snapshot.status.kind === 'stale' || snapshot.status.kind === 'offline'
      ? (snapshot.status.label || getCompactWeatherSourceLabel(snapshot)).toUpperCase()
      : getCompactWeatherSourceLabel(snapshot);

  if (!featured) {
    return (
      <WidgetCardShell
        badge={status}
        footer={<WidgetMetaLine text={compactFooterLine} tone={compactSupportTone} />}
      >
        <View style={hwyWeatherCardS.compactCardBody}>
          <Text
            style={hwyWeatherCardS.compactLocationText}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.74}
          >
            {locationLabel}
          </Text>
          <Text
            style={hwyWeatherCardS.compactCardTemp}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.86}
          >
            {tempValue}
          </Text>
          <Text
            style={hwyWeatherCardS.compactCardCondition}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.78}
          >
            {compactCondition}
          </Text>
          <Text
            style={[
              hwyWeatherCardS.compactCardSupport,
              { color: getWidgetToneColor(compactSupportTone) },
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {compactSupportLine}
          </Text>
        </View>
      </WidgetCardShell>
    );
  }

  return (
    <WidgetCardShell
      badge={status}
      footer={<WidgetMetaLine text={hasAlert ? alertLine.toUpperCase() : `${stateLabel.toUpperCase()} | ${getCompactWeatherSourceLabel(snapshot)}`} tone={hasAlert ? 'critical' : stateTone} />}
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
            <Text
              style={hwyWeatherCardS.locationText}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.78}
            >
              {locationLabel}
            </Text>
            <Text style={hwyWeatherCardS.conditionValue} numberOfLines={1}>{conditionText}</Text>
            {highLowLine ? (
              <Text style={hwyWeatherCardS.todayRangeText} numberOfLines={1}>
                {highLowLine}
              </Text>
            ) : null}
          </View>
          <View style={hwyWeatherCardS.tempHeroTile}>
            <Text
              style={[
                hwyWeatherCardS.tempHeroValue,
                { color: bandTone === 'critical' ? '#EF5350' : bandTone === 'attention' ? '#FFB300' : TACTICAL.text },
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.76}
            >
              {tempValue}
            </Text>
            <Text style={[hwyWeatherCardS.statePillText, { color: getWidgetToneColor(stateTone) }]} numberOfLines={1}>
              {stateLabel.toUpperCase()}
            </Text>
          </View>
        </View>

        <WidgetSecondaryRow
          items={[
            {
              label: secondaryField.label,
              value: secondaryField.value,
              tone: secondaryField.tone,
            },
            alternateField,
          ]}
        />
        <WidgetMicroStrip
          items={[
            ...(hasAlert ? [{ label: 'Alert', value: 'Active', tone: severeAlert ? 'critical' as const : 'attention' as const }] : []),
            ...(hasAlert || (secondaryField.label !== precipLabel && alternateField.label !== precipLabel)
              ? [{ label: precipLabel, value: precipValue, tone: precipConcern ? 'attention' as const : 'neutral' as const }]
              : []),
            ...(snapshot.current.windDirection ? [{ label: 'Dir', value: snapshot.current.windDirection, tone: 'neutral' as const }] : []),
            ...forecastStrip,
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
  const currentTempF = getCurrentWeatherTemperatureF(snapshot);
  const forecastDays = getNormalizedForecastDays(snapshot);
  const detailLocationLabel = getDashboardWeatherLocationLabel(snapshot);
  const hourlyRows = snapshot.hourly.slice(0, 6);
  const forecastRows = normalizeWeatherForecastRows(
    forecastDays,
    getWeatherForecastKeyScope(snapshot, 'forward-weather-detail'),
    {
      label: (day) => formatForecastDateLabel(day),
      value: (day) => formatForecastDetailLine(day),
    },
  );

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
        title={detailLocationLabel.toUpperCase()}
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
      <WeatherIntelPanel
        latitude={snapshot.location.lat}
        longitude={snapshot.location.lng}
        locationLabel={detailLocationLabel}
        weatherSnapshot={snapshot}
        autoFetch={false}
        compact={false}
        units={snapshot.provider.units}
        frameless
      />
      <View style={s.detailDivider} />
      <WidgetDetailSectionTitle>CURRENT CONDITIONS</WidgetDetailSectionTitle>
      <HwyMetricRow label="LOCATION" value={detailLocationLabel.toUpperCase()} />
      <HwyMetricRow label="TEMPERATURE" value={currentTempF != null ? `${tempF}°F` : '--°'} />
      <HwyMetricRow label="FEELS LIKE" value={snapshot.current.feelsLike != null ? `${dewPoint}°F` : '--°'} />
      <HwyMetricRow label="TODAY HIGH" value={formatWeatherDegrees(snapshot.current.highTemperature ?? snapshot.normalized.current?.highTemperatureF)} />
      <HwyMetricRow label="TODAY LOW" value={formatWeatherDegrees(snapshot.current.lowTemperature ?? snapshot.normalized.current?.lowTemperatureF)} />
      <HwyMetricRow label="HUMIDITY" value={snapshot.current.humidity != null ? `${humidity}%` : '--'} />
      <HwyMetricRow label="SUNUP" value={formatWeatherTime(snapshot.current.sunrise ?? snapshot.normalized.current?.sunrise)} />
      <HwyMetricRow label="SUNDOWN" value={formatWeatherTime(snapshot.current.sunset ?? snapshot.normalized.current?.sunset)} />
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
      <WidgetDetailSectionTitle>HOURLY</WidgetDetailSectionTitle>
      {hourlyRows.length > 0 ? (
        hourlyRows.map((hour, index) => (
          <HwyMetricRow
            key={`weather-hourly-${hour.date || 'hour'}-${index}`}
            label={hour.date ? hour.date.toUpperCase() : `HOUR ${index + 1}`}
            value={[
              formatWeatherDegrees(hour.temp_day ?? hour.temp_max ?? hour.temp_min),
              hour.weather_main || hour.weather_description || null,
              hour.wind_max != null ? `Wind ${Math.round(hour.wind_max)} mph` : null,
            ].filter(Boolean).join(' | ') || 'Unavailable'}
          />
        ))
      ) : (
        <HwyMetricRow label="HOURLY" value="Unavailable from provider" muted />
      )}
      {forecastRows.length > 0 && (
        <>
          <View style={s.detailDivider} />
          <WidgetDetailSectionTitle>FORECAST</WidgetDetailSectionTitle>
          {forecastRows.map(row => (
            <HwyMetricRow
              key={row.key}
              label={row.label}
              value={row.value}
            />
          ))}
        </>
      )}
      <View style={s.detailDivider} />
      <WidgetDetailSectionTitle>DATA SOURCE</WidgetDetailSectionTitle>
      <HwyMetricRow
        label="PROVIDER"
        value={snapshot.provider.name.toUpperCase()}
        muted
      />
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
      <HwyMetricRow label="CACHE AGE" value={formatDashboardWeatherCacheAge(snapshot).toUpperCase()} muted />
      <HwyMetricRow label="LOCATION CONF" value={formatDashboardWeatherLocationConfidence(snapshot)} muted />
      <HwyMetricRow label="ACCURACY" value={snapshot.location.accuracyM != null ? `${Math.round(snapshot.location.accuracyM)} m` : '--'} muted />
      <HwyMetricRow label="STATUS" value={alertLine.toUpperCase()} muted />
    </View>
  );
}

function HwyDaylightRemainingWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const snapshot = useCanonicalWidgetWeatherSnapshot(data, options);

  const now = new Date();
  const solarTimes = getWeatherSolarTimes(snapshot.raw);
  const hasGpsSolarFallback =
    options?.gpsHasFix === true &&
    typeof options.gpsLatitude === 'number' &&
    Number.isFinite(options.gpsLatitude) &&
    typeof options.gpsLongitude === 'number' &&
    Number.isFinite(options.gpsLongitude);
  const environment = buildEnvironmentSnapshot({
    coordinate: hasGpsSolarFallback
      ? {
          latitude: options.gpsLatitude,
          longitude: options.gpsLongitude,
          accuracyM: options.gpsAccuracyM ?? null,
          altitudeFt: options.gpsAltitudeFt ?? null,
          source: 'gps',
          updatedAt: options.gpsTimestampMs ?? null,
        }
      : null,
    regionLabel: snapshot.locationName || null,
    regionSource: snapshot.locationName ? 'weather_provider' : 'unavailable',
    solarTimes: {
      sunrise: solarTimes.sunrise,
      sunset: solarTimes.sunset,
      source: 'weather_provider',
      updatedAt: snapshot.status.timestampMs ?? snapshot.status.cachedAt ?? snapshot.fetchedAt ?? null,
    },
    nowMs: now.getTime(),
  });
  const hasSunlight = environment.sunlight.status !== 'unavailable' && environment.sunlight.remainingMinutes != null;

  if (!hasSunlight) {
    const state = resolveWeatherWidgetState(snapshot);
    if (compact) {
      return (
        <WidgetCompactRow
          title="Daylight"
          summary={state.message.primary}
          tone={state.message.tone}
          status={state.message.badgeLabel}
          statusTone={state.message.tone}
        />
      );
    }

    return (
      <WidgetCardShell badge={state.badge}>
        <WidgetStateMessage state={state.message} />
      </WidgetCardShell>
    );
  }

  const sunsetStr = formatEnvironmentTime(environment.sunlight.sunsetIso, environment.timezone.id);
  const sunriseStr = formatEnvironmentTime(environment.sunlight.sunriseIso, environment.timezone.id);
  const twilightStr = formatEnvironmentTime(environment.sunlight.civilTwilightEndIso, environment.timezone.id);
  const hoursRemaining = (environment.sunlight.remainingMinutes ?? 0) / 60;
  const isNightCountdown = environment.sunlight.nextEvent === 'sunrise';
  const sunlightSummary = formatSunlightRemaining(environment.sunlight);
  const countdownLabel = getSunlightCountdownLabel(environment.sunlight);

  const remainingColor = isNightCountdown ? '#B7A7FF' : hoursRemaining < 1 ? '#FFB74D' : hoursRemaining < 2 ? HWY_ACCENT : '#4CAF50';

  if (compact) {
    return (
      <WidgetCompactRow
        title="Daylight"
        summary={`${countdownLabel}: ${formatSunlightCountdownValue(environment.sunlight)}`}
        tone={isNightCountdown ? 'attention' : hoursRemaining < 1 ? 'attention' : 'good'}
        status={isNightCountdown ? sunriseStr : environment.sunlight.status === 'near_sunset' ? 'Civil twilight' : sunsetStr}
        statusTone="neutral"
      />
    );
  }

  return (
    <View style={hwyS.body}>
      {/* Status badge */}
      <View style={hwyS.statusBadge}>
        <Ionicons name={isNightCountdown ? 'moon-outline' : 'sunny-outline'} size={10} color={remainingColor} />
        <Text style={[hwyS.statusText, { color: remainingColor }]}>
          {isNightCountdown ? 'TIME UNTIL SUNRISE' : hoursRemaining < 1 ? 'LOW LIGHT' : 'DAYLIGHT'}
        </Text>
      </View>

      <HwyMetricRow
        label={isNightCountdown ? 'UNTIL SUNRISE' : 'DAYLIGHT LEFT'}
        value={sunlightSummary}
        color={remainingColor}
      />
      <HwyMetricRow label="SUNRISE" value={sunriseStr} />
      <HwyMetricRow label="SUNSET" value={sunsetStr} />
      <HwyMetricRow label="CIVIL TWILIGHT" value={twilightStr} muted />
    </View>
  );
}

function HwyDaylightRemainingDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const snapshot = useCanonicalWidgetWeatherSnapshot(data, options);
  const now = new Date();
  const solarTimes = getWeatherSolarTimes(snapshot.raw);
  const hasGpsSolarFallback =
    options?.gpsHasFix === true &&
    typeof options.gpsLatitude === 'number' &&
    Number.isFinite(options.gpsLatitude) &&
    typeof options.gpsLongitude === 'number' &&
    Number.isFinite(options.gpsLongitude);
  const environment = buildEnvironmentSnapshot({
    coordinate: hasGpsSolarFallback
      ? {
          latitude: options.gpsLatitude,
          longitude: options.gpsLongitude,
          accuracyM: options.gpsAccuracyM ?? null,
          altitudeFt: options.gpsAltitudeFt ?? null,
          source: 'gps',
          updatedAt: options.gpsTimestampMs ?? null,
        }
      : null,
    regionLabel: snapshot.locationName || null,
    regionSource: snapshot.locationName ? 'weather_provider' : 'unavailable',
    solarTimes: {
      sunrise: solarTimes.sunrise,
      sunset: solarTimes.sunset,
      source: 'weather_provider',
      updatedAt: snapshot.status.timestampMs ?? snapshot.status.cachedAt ?? snapshot.fetchedAt ?? null,
    },
    nowMs: now.getTime(),
  });

  if (environment.sunlight.status === 'unavailable' || environment.sunlight.remainingMinutes == null) {
    const state = resolveWeatherWidgetState(snapshot);
    return (
      <View style={s.detailContainer}>
        <WidgetDetailStateCard
          title={state.message.primary}
          message={state.message.secondary ?? 'ECS needs a current GPS fix or live weather solar times before daylight estimates are shown.'}
          tone={state.message.kind === 'loading' ? 'attention' : 'muted'}
          badgeLabel={state.message.badgeLabel}
          icon="sunny-outline"
          metaLines={[
            `Weather state: ${snapshot.status.label}`,
            'No fixed fallback coordinates are used.',
          ]}
        />
      </View>
    );
  }

  const lat = hasGpsSolarFallback ? options.gpsLatitude! : null;
  const lon =
    typeof options?.gpsLongitude === 'number' && Number.isFinite(options.gpsLongitude)
      ? options.gpsLongitude
      : null;
  const hoursRemaining = (environment.sunlight.remainingMinutes ?? 0) / 60;
  const isNightCountdown = environment.sunlight.nextEvent === 'sunrise';
  const sunriseMs = environment.sunlight.sunriseIso ? Date.parse(environment.sunlight.sunriseIso) : null;
  const sunsetMs = environment.sunlight.sunsetIso ? Date.parse(environment.sunlight.sunsetIso) : null;
  const totalDaylight =
    sunriseMs != null && sunsetMs != null && Number.isFinite(sunriseMs) && Number.isFinite(sunsetMs)
      ? Math.max(0, (sunsetMs - sunriseMs) / (60 * 60 * 1000))
      : null;

  return (
    <View style={s.detailContainer}>
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>DAYLIGHT ANALYSIS</Text>
      <HwyMetricRow
        label={isNightCountdown ? 'UNTIL SUNRISE' : 'DAYLIGHT LEFT'}
        value={formatSunlightRemaining(environment.sunlight)}
        color={isNightCountdown ? '#B7A7FF' : hoursRemaining > 0 ? HWY_ACCENT : '#EF5350'}
      />
      <HwyMetricRow label="TOTAL DAYLIGHT" value={totalDaylight != null ? `${totalDaylight.toFixed(1)} hrs` : 'Unavailable'} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>SOLAR EVENTS</Text>
      <HwyMetricRow label="SUNRISE" value={formatEnvironmentTime(environment.sunlight.sunriseIso, environment.timezone.id)} />
      <HwyMetricRow label="SUNSET" value={formatEnvironmentTime(environment.sunlight.sunsetIso, environment.timezone.id)} />
      <HwyMetricRow label="CIVIL TWILIGHT" value={formatEnvironmentTime(environment.sunlight.civilTwilightEndIso, environment.timezone.id)} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>LOCATION</Text>
      <HwyMetricRow label="LATITUDE" value={lat != null ? `${lat.toFixed(2)}°` : 'Weather source'} />
      <HwyMetricRow label="LONGITUDE" value={lon != null ? `${lon.toFixed(2)}°` : 'Weather source'} />
      <HwyMetricRow label="TIMEZONE" value={environment.timezone.id ?? 'Unavailable'} />
      <HwyMetricRow label="TZ SOURCE" value={environment.timezone.source === 'device_fallback' ? 'Device fallback' : 'Coordinate'} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>MODEL</Text>
      <HwyMetricRow label="METHOD" value={getSunlightSourceLabel(environment.sunlight)} muted />
      <HwyMetricRow label="ACCURACY" value={environment.sunlight.confidence.toUpperCase()} muted />
    </View>
  );
}

function AttitudeCommandWeatherBackgroundVisual({ weather }: { weather?: CommandWeatherVisualData }) {
  const reducedMotion = useReducedMotion();
  const fadeAnim = useStableAnimatedValue(1);
  const targetType = weather?.backgroundType ?? 'cloudDay';
  const [currentType, setCurrentType] = useState<WeatherBackgroundType>(targetType);
  const [previousType, setPreviousType] = useState<WeatherBackgroundType | null>(null);

  useEffect(() => {
    if (targetType === currentType) return;

    fadeAnim.stopAnimation();
    if (reducedMotion) {
      fadeAnim.setValue(1);
      setPreviousType(null);
      setCurrentType(targetType);
      return;
    }

    setPreviousType(currentType);
    setCurrentType(targetType);
    fadeAnim.setValue(0);
    const animation = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: WEATHER_BACKGROUND_FADE_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setPreviousType(null);
    });
    return () => animation.stop();
  }, [currentType, fadeAnim, reducedMotion, targetType]);

  const currentSource = WEATHER_BACKGROUND_IMAGES[currentType] ?? WEATHER_BACKGROUND_IMAGES.cloudDay;
  const previousSource = previousType ? WEATHER_BACKGROUND_IMAGES[previousType] : null;
  const effectStyle =
    currentType.startsWith('fog')
      ? attitudeCommandS.weatherBackgroundFogScrim
      : currentType.endsWith('Night')
        ? attitudeCommandS.weatherBackgroundNightScrim
        : null;

  return (
    <View pointerEvents="none" style={attitudeCommandS.weatherGlyphLayer}>
      {previousSource ? (
        <Image
          source={previousSource}
          resizeMode="cover"
          style={attitudeCommandS.weatherBackgroundImage}
        />
      ) : null}
      <Animated.Image
        source={currentSource}
        resizeMode="cover"
        style={[
          attitudeCommandS.weatherBackgroundImage,
          previousSource ? { opacity: fadeAnim } : null,
        ]}
      />
      <View style={[attitudeCommandS.weatherBackgroundScrim, effectStyle]} />
    </View>
  );
}

function AttitudeCommandSunlightBackgroundVisual({ sunlight }: { sunlight?: CommandSunlightVisualData }) {
  const reducedMotion = useReducedMotion();
  const fadeAnim = useStableAnimatedValue(1);
  const targetType = sunlight?.backgroundType ?? 'day';
  const [currentType, setCurrentType] = useState<SunlightBackgroundType>(targetType);
  const [previousType, setPreviousType] = useState<SunlightBackgroundType | null>(null);

  useEffect(() => {
    if (targetType === currentType) return;

    fadeAnim.stopAnimation();
    if (reducedMotion) {
      fadeAnim.setValue(1);
      setPreviousType(null);
      setCurrentType(targetType);
      return;
    }

    setPreviousType(currentType);
    setCurrentType(targetType);
    fadeAnim.setValue(0);
    const animation = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: SUNLIGHT_BACKGROUND_FADE_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setPreviousType(null);
    });
    return () => animation.stop();
  }, [currentType, fadeAnim, reducedMotion, targetType]);

  const currentSource = SUNLIGHT_BACKGROUND_IMAGES[currentType] ?? SUNLIGHT_BACKGROUND_IMAGES.day;
  const previousSource = previousType ? SUNLIGHT_BACKGROUND_IMAGES[previousType] : null;

  return (
    <View pointerEvents="none" style={attitudeCommandS.sunGlyphLayer}>
      {previousSource ? (
        <Image
          source={previousSource}
          resizeMode="cover"
          style={attitudeCommandS.sunBackgroundImage}
        />
      ) : null}
      <Animated.Image
        source={currentSource}
        resizeMode="cover"
        style={[
          attitudeCommandS.sunBackgroundImage,
          previousSource ? { opacity: fadeAnim } : null,
        ]}
      />
      <View style={attitudeCommandS.sunBackgroundScrim} />
    </View>
  );
}

function AttitudeCommandVehicleProfileBackgroundVisual({
  vehicle,
}: {
  vehicle?: CommandVehicleVisualData;
}) {
  const reducedMotion = useReducedMotion();
  const fadeAnim = useStableAnimatedValue(1);
  const targetKey = vehicle?.imageKey ?? 'generic_suv';
  const [currentKey, setCurrentKey] = useState<VehicleProfileImageKey>(targetKey);
  const [previousKey, setPreviousKey] = useState<VehicleProfileImageKey | null>(null);

  useEffect(() => {
    if (targetKey === currentKey) return;

    fadeAnim.stopAnimation();
    if (reducedMotion) {
      fadeAnim.setValue(1);
      setPreviousKey(null);
      setCurrentKey(targetKey);
      return;
    }

    setPreviousKey(currentKey);
    setCurrentKey(targetKey);
    fadeAnim.setValue(0);
    const animation = Animated.timing(fadeAnim, {
      toValue: 1,
      duration: VEHICLE_PROFILE_IMAGE_FADE_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) setPreviousKey(null);
    });
    return () => animation.stop();
  }, [currentKey, fadeAnim, reducedMotion, targetKey]);

  const currentSource = VEHICLE_PROFILE_IMAGES[currentKey] ?? VEHICLE_PROFILE_IMAGES.generic_suv;
  const previousSource = previousKey ? VEHICLE_PROFILE_IMAGES[previousKey] : null;

  return (
    <View pointerEvents="none" style={attitudeCommandS.vehicleGlyphLayer}>
      {previousSource ? (
        <Image
          source={previousSource}
          resizeMode="cover"
          style={attitudeCommandS.vehicleProfileBackgroundImage}
        />
      ) : null}
      <Animated.Image
        source={currentSource}
        resizeMode="cover"
        style={[
          attitudeCommandS.vehicleProfileBackgroundImage,
          previousSource ? { opacity: fadeAnim } : null,
        ]}
      />
      <View style={attitudeCommandS.vehicleProfileBackgroundScrim} />
    </View>
  );
}

function AttitudeCommandRouteProgressMapVisual({ route }: { route?: CommandRouteVisualData }) {
  const targetProgress = getRouteProgressPercent({ progressPercent: route?.progressPercent });
  const reducedMotion = useReducedMotion();
  const animatedProgress = useStableAnimatedValue(targetProgress);
  const [displayProgress, setDisplayProgress] = useState(targetProgress);
  const displayProgressRef = useRef(targetProgress);

  useEffect(() => {
    const listenerId = animatedProgress.addListener(({ value }) => {
      const nextProgress = getRouteProgressPercent({ progressPercent: value });
      if (Math.abs(nextProgress - displayProgressRef.current) >= 0.3) {
        displayProgressRef.current = nextProgress;
        setDisplayProgress(nextProgress);
      }
    });

    return () => {
      animatedProgress.removeListener(listenerId);
    };
  }, [animatedProgress]);

  useEffect(() => {
    if (reducedMotion) {
      animatedProgress.stopAnimation();
      animatedProgress.setValue(targetProgress);
      displayProgressRef.current = targetProgress;
      setDisplayProgress(targetProgress);
      return undefined;
    }

    const animation = Animated.timing(animatedProgress, {
      toValue: targetProgress,
      duration: 780,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    });

    animation.start(({ finished }) => {
      if (finished) {
        displayProgressRef.current = targetProgress;
        setDisplayProgress(targetProgress);
      }
    });

    return () => {
      animation.stop();
    };
  }, [animatedProgress, reducedMotion, targetProgress]);

  const progress = displayProgress;
  const progressRatio = progress / 100;
  const marker = getRouteMarkerPoint(progress);
  const routeActive = Boolean(route?.active);
  const routeCanRenderPath = routeActive && route?.hasGeometry === true;
  const glowOpacity = routeActive ? 0.35 + progressRatio * 0.55 : 0.28;
  const glowStrokeWidth = 9 + progressRatio * 4;
  const baseRouteColor = routeActive ? 'rgba(245, 199, 73, 0.26)' : 'rgba(139,148,158,0.34)';
  const progressRouteColor = routeActive ? '#F2B93F' : 'rgba(139,148,158,0.66)';
  const markerColor = routeActive ? TACTICAL.amber : 'rgba(139,148,158,0.74)';
  const legacyRouteVisual = (
    <>
      <Image
        source={ROUTE_PROGRESS_MAP_BACKGROUND}
        resizeMode="cover"
        style={attitudeCommandS.routeProgressMapBackground}
      />
      {routeCanRenderPath ? (
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 1000 420"
          preserveAspectRatio="none"
          style={attitudeCommandS.routeProgressOverlay}
        >
          <Path
            d={ROUTE_PROGRESS_PATH}
            fill="none"
            stroke={baseRouteColor}
            strokeWidth={22}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.34}
          />
          <Path
            d={ROUTE_PROGRESS_PATH}
            fill="none"
            stroke={baseRouteColor}
            strokeWidth={8}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.82}
          />
          <Path
            d={ROUTE_PROGRESS_PATH}
            fill="none"
            stroke={progressRouteColor}
            strokeWidth={glowStrokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={ROUTE_PROGRESS_PATH_LENGTH}
            strokeDashoffset={ROUTE_PROGRESS_PATH_LENGTH * (1 - progressRatio)}
            opacity={glowOpacity}
          />
          <Path
            d={ROUTE_PROGRESS_PATH}
            fill="none"
            stroke={progressRouteColor}
            strokeWidth={5}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={ROUTE_PROGRESS_PATH_LENGTH}
            strokeDashoffset={ROUTE_PROGRESS_PATH_LENGTH * (1 - progressRatio)}
            opacity={0.94}
          />
          <Circle cx={88} cy={332} r={13} fill={TACTICAL.success} opacity={0.92} />
          <Circle cx={932} cy={84} r={13} fill={TACTICAL.amber} opacity={0.88} />
          <Circle cx={598} cy={204} r={8} fill="rgba(245, 199, 73, 0.72)" opacity={0.82} />
          <Circle
            cx={marker.x}
            cy={marker.y}
            r={17}
            fill={markerColor}
            opacity={0.28 + progressRatio * 0.26}
          />
          <Circle
            cx={marker.x}
            cy={marker.y}
            r={8}
            fill={markerColor}
            stroke="rgba(255, 238, 180, 0.9)"
            strokeWidth={2}
            opacity={1}
          />
        </Svg>
      ) : null}
    </>
  );

  return (
    <View pointerEvents="none" style={attitudeCommandS.routeGlyphLayer}>
      <RouteGuidanceProgressRive
        progressPercent={routeActive ? targetProgress : 0}
        isActive={routeActive}
        isOffline={route?.isOffline ?? false}
        style={attitudeCommandS.routeProgressRiveBackground}
        testID="attitude-command-route-guidance-progress-rive"
        fallback={legacyRouteVisual}
      />
      <View style={attitudeCommandS.routeProgressMapScrim} />
      <View style={attitudeCommandS.routeProgressPill}>
        <Text style={[attitudeCommandS.routeProgressPillText, { color: routeActive ? TACTICAL.amber : TACTICAL.textMuted }]} numberOfLines={1}>
          {routeActive ? 'ACTIVE' : 'STANDBY'}
        </Text>
      </View>
    </View>
  );
}

function AttitudeCommandPowerRiveForeground({ power }: { power?: CommandPowerVisualData }) {
  return (
    <View pointerEvents="none" style={attitudeCommandS.powerRiveForegroundLayer}>
      <View style={attitudeCommandS.powerRiveForegroundBlock}>
        <PowerModuleRiveWidget
          hasEcsData={Boolean(power?.live)}
          batteryPercent={power?.batteryPercent ?? null}
          inputWatts={power?.canDisplayTelemetryValues ? power.inputWatts : null}
          outputWatts={power?.canDisplayTelemetryValues ? power.outputWatts : null}
          style={attitudeCommandS.powerRiveModule}
          testID="attitude-command-blu-power-module-rive"
        />
      </View>
    </View>
  );
}

function AttitudeCommandPowerManagementVisual({
  power,
}: {
  power?: CommandPowerVisualData;
}) {
  const reducedMotion = useReducedMotion();
  const isAppForeground = useAppForegroundState();
  const flowAnim = useStableAnimatedValue(0);
  const inputActive = Boolean(power?.inputWatts != null && power.inputWatts > 0 && power.canDisplayTelemetryValues);
  const outputActive = Boolean(power?.outputWatts != null && power.outputWatts > 0 && power.canDisplayTelemetryValues);
  const shouldAnimate = Boolean(power?.canAnimateFlow && power.live && !reducedMotion && isAppForeground && (inputActive || outputActive));

  useEffect(() => {
    flowAnim.stopAnimation();
    if (!shouldAnimate) {
      flowAnim.setValue(0.45);
      return undefined;
    }

    flowAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(flowAnim, {
        toValue: 1,
        duration: 1450,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
      flowAnim.stopAnimation();
    };
  }, [flowAnim, shouldAnimate]);

  const inputPulseX = flowAnim.interpolate({ inputRange: [0, 1], outputRange: [-32, 34] });
  const outputPulseX = flowAnim.interpolate({ inputRange: [0, 1], outputRange: [-34, 32] });
  const pulseOpacity = shouldAnimate
    ? flowAnim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.16, 0.84, 0.16] })
    : 0.38;
  const solarSourceValue = formatAttitudePowerWattsCompact(power?.solarWatts, 'input');

  return (
    <View pointerEvents="none" style={attitudeCommandS.powerGlyphLayer}>
      <Image
        source={POWER_MANAGEMENT_BACKGROUND}
        resizeMode="cover"
        style={attitudeCommandS.powerManagementBackground}
      />
      <View style={attitudeCommandS.powerManagementBackgroundScrim} />
      <View style={attitudeCommandS.powerSolarSourceBlock}>
        <Text style={attitudeCommandS.powerSolarSourceLabel} numberOfLines={1}>SOLAR SOURCE</Text>
        <Text style={[attitudeCommandS.powerSolarSourceValue, { color: power?.solarWatts != null && power.solarWatts > 0 ? TACTICAL.success : TACTICAL.textMuted }]} numberOfLines={1}>
          {solarSourceValue}
        </Text>
      </View>
      <View style={attitudeCommandS.powerColumnLeft}>
        <Text style={attitudeCommandS.powerColumnLabel} numberOfLines={1}>INPUT</Text>
        <Text style={[attitudeCommandS.powerColumnValue, { color: inputActive ? TACTICAL.success : TACTICAL.textMuted }]} numberOfLines={1}>
          {formatAttitudePowerWattsCompact(power?.inputWatts, 'input')}
        </Text>
      </View>
      <View style={attitudeCommandS.powerColumnRight}>
        <Text style={attitudeCommandS.powerColumnLabel} numberOfLines={1}>OUTPUT</Text>
        <Text style={[attitudeCommandS.powerColumnValue, { color: outputActive ? TACTICAL.amber : TACTICAL.textMuted }]} numberOfLines={1}>
          {formatAttitudePowerWattsCompact(power?.outputWatts, 'output')}
        </Text>
      </View>
      <View style={[attitudeCommandS.powerFlowLineInput, { backgroundColor: inputActive ? `${TACTICAL.success}6E` : 'rgba(139,148,158,0.24)' }]}>
        {shouldAnimate && inputActive ? (
          <Animated.View
            style={[
              attitudeCommandS.powerFlowPulseMini,
              { backgroundColor: TACTICAL.success, opacity: pulseOpacity, transform: [{ translateX: inputPulseX }] },
            ]}
          />
        ) : null}
      </View>
      <View style={[attitudeCommandS.powerFlowLineOutput, { backgroundColor: outputActive ? `${TACTICAL.amber}72` : 'rgba(139,148,158,0.24)' }]}>
        {shouldAnimate && outputActive ? (
          <Animated.View
            style={[
              attitudeCommandS.powerFlowPulseMini,
              { backgroundColor: TACTICAL.amber, opacity: pulseOpacity, transform: [{ translateX: outputPulseX }] },
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

function AttitudeCommandPanelVisual({
  icon,
  color,
  tone,
  sunlight,
  weather,
  vehicle,
  route,
  power,
}: {
  icon?: string;
  color: string;
  tone: WidgetTone;
  sunlight?: CommandSunlightVisualData;
  weather?: CommandWeatherVisualData;
  vehicle?: CommandVehicleVisualData;
  route?: CommandRouteVisualData;
  power?: CommandPowerVisualData;
}) {
  if (icon === 'sunny-outline') {
    return <AttitudeCommandSunlightBackgroundVisual sunlight={sunlight} />;
  }

  if (icon === 'partly-sunny-outline') {
    return <AttitudeCommandWeatherBackgroundVisual weather={weather} />;
  }

  if (icon === 'car-sport-outline') {
    return <AttitudeCommandVehicleProfileBackgroundVisual vehicle={vehicle} />;
  }

  if (icon === 'navigate-outline') {
    return <AttitudeCommandRouteProgressMapVisual route={route} />;
  }

  if (icon === 'battery-charging-outline') {
    return <AttitudeCommandPowerManagementVisual power={power} />;
  }

  return null;
}

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

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// HIGHWAY WIDGET 4 Ã¢â‚¬â€ WIND MONITOR
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
function HwyWindMonitorWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const snapshot = useCanonicalWidgetWeatherSnapshot(data, options);
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

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// HIGHWAY WIDGET 5 Ã¢â‚¬â€ ELEVATION PROFILE
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
function HwyElevationProfileWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const compact = options?.compact;
  const snapshot = useCanonicalWidgetWeatherSnapshot(data, options);
  const activeRoute = routeStore.getActive();
  const environment = buildEnvironmentSnapshot({
    coordinate: {
      latitude: options?.gpsLatitude ?? null,
      longitude: options?.gpsLongitude ?? null,
      accuracyM: options?.gpsAccuracyM ?? null,
      altitudeFt: options?.gpsAltitudeFt ?? null,
      source: options?.gpsHasFix ? 'gps' : 'unavailable',
      updatedAt: options?.gpsTimestampMs ?? null,
    },
  });
  const terrainSnapshot = resolveElevationTerrainSnapshot({
    gpsHasFix: options?.gpsHasFix ?? false,
    gpsAltitudeFt: options?.gpsAltitudeFt ?? null,
    gpsTimestampMs: options?.gpsTimestampMs ?? null,
    gpsAccuracyM: options?.gpsAccuracyM ?? null,
    activeRoute,
  });
  const grade = terrainSnapshot.routeGradePercent;
  const hazardCount = (activeRoute?.waypoints ?? []).filter((waypoint) => waypoint.waypointType === 'hazard').length;
  const terrainOutlook = getTerrainOutlook({
    gradePercent: grade,
    hazardCount,
    hasRoute: Boolean(activeRoute),
    hasLiveFix: terrainSnapshot.hasLiveElevation,
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
  const terrainMode = terrainSnapshot.modeLabel;
  const hazardSummary = activeRoute
    ? hazardCount > 0
      ? `${hazardCount} Haz`
      : 'Clear'
    : '--';
  const altitudeValue =
    environment.elevation.feet != null
      ? `${Math.round(environment.elevation.feet).toLocaleString()} ft`
      : terrainSnapshot.currentElevationLabel;
  const badgeTone = getElevationTerrainTone(terrainSnapshot.status);
  const compactFooterText = hazardCount > 0 && terrainSnapshot.hasRouteProfile
    ? `${hazardCount} mapped hazards`
    : terrainSnapshot.footerLabel;
  const terrainFooterText = hazardCount > 0 && terrainSnapshot.hasRouteProfile
    ? 'Mapped hazards may affect route movement'
    : terrainSnapshot.footerLabel;
  const daylight = resolveAttitudeCommandDaylight(snapshot, options);
  const windMph = snapshot.current.windSpeed != null ? Math.round(snapshot.current.windSpeed) : null;
  const gustMph = snapshot.current.windGust != null ? Math.round(snapshot.current.windGust) : null;
  const windTone: WidgetTone = windMph == null
    ? 'unavailable'
    : windMph > 30
      ? 'critical'
      : windMph > 20
        ? 'attention'
        : 'live';
  const gustTone: WidgetTone = gustMph == null
    ? 'unavailable'
    : gustMph > 35
      ? 'critical'
      : gustMph > 25
        ? 'attention'
        : 'neutral';
  const glareTone: WidgetTone = daylight.glare.includes('Moderate')
    ? 'attention'
    : daylight.glare.includes('unknown')
      ? 'unavailable'
      : 'neutral';
  const daylightFooter = daylight.daylightTone === 'unavailable'
    ? terrainFooterText
    : `${terrainFooterText} | ${daylight.support}`;

  if (compact) {
    return (
      <WidgetCardShell
        badge={{ label: terrainSnapshot.badgeLabel, tone: badgeTone }}
        footer={<WidgetMetaLine text={compactFooterText} tone={outlookTone === 'good' ? 'neutral' : outlookTone} />}
      >
        <View style={hwyElevationCompactS.body}>
          <Text style={hwyElevationCompactS.label} numberOfLines={1}>
            ELEVATION / TERRAIN
          </Text>
          <Text
            style={hwyElevationCompactS.value}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
          >
            {altitudeValue}
          </Text>
          <Text
            style={[hwyElevationCompactS.primaryStatus, { color: getWidgetToneColor(outlookTone) }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.82}
          >
            {terrainCompactValue}
          </Text>
          <View style={hwyElevationCompactS.metricRow}>
            <View style={hwyElevationCompactS.metricCell}>
              <Text style={hwyElevationCompactS.metricLabel} numberOfLines={1}>
                GRADE
              </Text>
              <Text
                style={[hwyElevationCompactS.metricValue, { color: getWidgetToneColor(gradeTone) }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.84}
              >
                {grade != null ? `${grade}%` : '--'}
              </Text>
            </View>
            <View style={hwyElevationCompactS.metricCell}>
              <Text style={hwyElevationCompactS.metricLabel} numberOfLines={1}>
                WIND
              </Text>
              <Text
                style={[hwyElevationCompactS.metricValue, { color: getWidgetToneColor(windTone) }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.84}
              >
                {windMph != null ? `${windMph} mph` : '--'}
              </Text>
            </View>
          </View>
        </View>
      </WidgetCardShell>
    );
  }

  return (
    <WidgetCardShell
      badge={{ label: terrainSnapshot.badgeLabel, tone: badgeTone }}
      footer={<WidgetMetaLine text={daylightFooter} tone={outlookTone === 'good' ? 'neutral' : outlookTone} />}
    >
      <WidgetPrimaryValue
        label="TERRAIN"
        value={terrainPrimaryValue}
        tone={outlookTone}
      />
      <WidgetSecondaryRow
        items={[
          { label: 'ELEV', value: altitudeValue, tone: badgeTone },
          { label: 'GRADE', value: grade != null ? `${grade}%` : '--', tone: gradeTone },
        ]}
      />
      <WidgetSecondaryRow
        items={[
          { label: 'WIND', value: windMph != null ? `${windMph} mph` : '--', tone: windTone },
          { label: 'DAYLIGHT', value: daylight.daylight, tone: daylight.daylightTone },
        ]}
      />
      <WidgetMicroStrip
        items={[
          { label: 'Mode', value: terrainMode, tone: badgeTone },
          { label: 'Hazards', value: hazardSummary, tone: activeRoute ? (hazardCount > 0 ? 'attention' : 'good') : 'neutral' },
          { label: 'Glare', value: daylight.glare, tone: glareTone },
          { label: 'Gust', value: gustMph != null ? `${gustMph} mph` : '--', tone: gustTone },
        ]}
      />
    </WidgetCardShell>
  );
}

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// HIGHWAY WIDGET 6 Ã¢â‚¬â€ ROAD HAZARDS
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
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

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// HIGHWAY WIDGET 7 Ã¢â‚¬â€ POWER MONITOR
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
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
        value={housePct != null ? `${Math.round(housePct)}%` : '--'}
        color={houseColor}
        muted={housePct == null}
      />
      <HwyMetricRow
        label="START BATTERY"
        value={startBattV != null ? `${startBattV.toFixed(1)} V` : '--'}
        color={startBattColor}
        muted={startBattV == null}
      />
      <HwyMetricRow
        label="POWER FLOW"
        value={powerInput != null || powerOutput != null
          ? `IN ${Math.round(powerInput ?? 0)}W / OUT ${Math.round(powerOutput ?? 0)}W`
          : '--'}
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

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// HIGHWAY WIDGET 8 Ã¢â‚¬â€ SUN GLARE FORECAST
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Highway Widget Styles Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Renderer Map Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

function HwyElevationProfileDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  void data;
  const activeRoute = routeStore.getActive();
  const environment = buildEnvironmentSnapshot({
    coordinate: {
      latitude: options?.gpsLatitude ?? null,
      longitude: options?.gpsLongitude ?? null,
      accuracyM: options?.gpsAccuracyM ?? null,
      altitudeFt: options?.gpsAltitudeFt ?? null,
      source: options?.gpsHasFix ? 'gps' : 'unavailable',
      updatedAt: options?.gpsTimestampMs ?? null,
    },
  });
  const terrainSnapshot = resolveElevationTerrainSnapshot({
    gpsHasFix: options?.gpsHasFix ?? false,
    gpsAltitudeFt: options?.gpsAltitudeFt ?? null,
    gpsTimestampMs: options?.gpsTimestampMs ?? null,
    gpsAccuracyM: options?.gpsAccuracyM ?? null,
    activeRoute,
  });
  const routeDistance = terrainSnapshot.routeDistanceMiles;
  const gainFt = terrainSnapshot.routeGainFt;
  const grade = terrainSnapshot.routeGradePercent;
  const hazardCount = (activeRoute?.waypoints ?? []).filter((waypoint) => waypoint.waypointType === 'hazard').length;
  const terrainOutlook = getTerrainOutlook({
    gradePercent: grade,
    hazardCount,
    hasRoute: Boolean(activeRoute),
    hasLiveFix: terrainSnapshot.hasLiveElevation,
  });
  const terrainTone = getElevationTerrainTone(terrainSnapshot.status);

  return (
    <View style={s.detailContainer}>
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>ELEVATION / TERRAIN</Text>
      <HwyMetricRow
        label="ELEVATION"
        value={environment.elevation.feet != null ? `${Math.round(environment.elevation.feet).toLocaleString()} ft` : terrainSnapshot.currentElevationLabel}
        muted={environment.elevation.feet == null && terrainSnapshot.currentElevationFt == null}
      />
      <HwyMetricRow
        label="METERS"
        value={environment.elevation.meters != null ? `${Math.round(environment.elevation.meters).toLocaleString()} m` : '--'}
        muted={environment.elevation.meters == null}
      />
      <HwyMetricRow label="GRADE" value={grade != null ? `${grade}%` : '--'} />
      <HwyMetricRow label="CTX" value={terrainSnapshot.badgeLabel} color={getWidgetToneColor(terrainTone)} />
      <HwyMetricRow label="SOURCE" value={terrainSnapshot.sourceLabel} muted={terrainSnapshot.status !== 'live'} />
      <HwyMetricRow label="UPDATED" value={terrainSnapshot.lastUpdatedLabel} muted={terrainSnapshot.status !== 'live'} />
      <HwyMetricRow label="ACCURACY" value={terrainSnapshot.gpsAccuracyM != null ? `${Math.round(terrainSnapshot.gpsAccuracyM)} m` : '--'} muted={terrainSnapshot.gpsAccuracyM == null} />
      <HwyMetricRow label="AHEAD" value={terrainOutlook.label.replace('Ahead: ', '').replace('Terrain Risk: ', '')} color={terrainOutlook.tone === 'critical' ? '#EF5350' : terrainOutlook.tone === 'attention' ? '#FFB74D' : terrainOutlook.tone === 'good' ? '#4CAF50' : TACTICAL.textMuted} />
      <View style={s.detailDivider} />
      <Text style={[s.detailSection, { color: HWY_ACCENT }]}>ROUTE PROFILE</Text>
      <HwyMetricRow label="ROUTE" value={terrainSnapshot.routeName ?? 'No route staged'} muted={!activeRoute} />
      <HwyMetricRow label="DISTANCE" value={routeDistance > 0 ? `${Math.round(routeDistance)} mi` : '--'} muted={!activeRoute} />
      <HwyMetricRow label="GAIN" value={gainFt != null ? `${Math.round(gainFt).toLocaleString()} ft` : '--'} muted={!activeRoute} />
      <HwyMetricRow label="HAZARDS" value={activeRoute ? `${hazardCount}` : '--'} muted={!activeRoute} />
      {!activeRoute ? (
        <>
          <View style={s.detailDivider} />
          <Text style={[s.detailSection, { color: HWY_ACCENT }]}>LIVE CONTEXT</Text>
          <HwyMetricRow label="STATUS" value={terrainSnapshot.footerLabel} muted={terrainSnapshot.status !== 'live'} />
        </>
      ) : null}
    </View>
  );
}

const hwyElevationCompactS = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'space-between',
    gap: 4,
    paddingVertical: 2,
  },
  label: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.9,
    lineHeight: 9,
  },
  value: {
    fontSize: 24,
    fontWeight: '900',
    color: TACTICAL.text,
    lineHeight: 26,
    letterSpacing: -0.4,
    fontFamily: 'Courier',
  },
  primaryStatus: {
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 13,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  metricCell: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  metricLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.9,
    lineHeight: 9,
  },
  metricValue: {
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
});

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
    case 'vehicle-systems': return <VehicleTelemetryCompact />;
    case 'stability-index': return <StabilityIndexWidget data={data} options={options} />;
    case 'attitude-monitor': return <AttitudeMonitorWidget data={data} options={options} />;
    case 'attitude-command': return <AttitudeCommandWidget data={data} options={options} />;
    case 'mission-sustainment': return <MissionSustainmentWidget data={data} options={options} />;
    case 'operational-readiness': return <OperationalReadinessWidget data={data} options={options} />;
    case 'status-overview': return <StatusOverview data={data} options={options} />;
    case 'route-progress': return <ProgressWidget data={data} options={options} />;
    case 'loadout-readiness': return <LoadoutReadiness data={data} options={options} />;
    case 'water-projection': return <WaterProjection data={data} options={options} />;
    case 'fuel-range': return <FuelRange data={data} options={options} />;
    case 'vehicle-health': return <VehicleHealth data={data} options={options} />;
    case 'emergency-controls': return <EmergencyControls data={data} options={options} />;
    case 'sustainability': return <ResourceStatusWidget data={data} options={options} />;
    case 'progress': return <ProgressWidget data={data} options={options} />;
    case 'navigate-surface': return <NavigateSurfaceDetailView data={data} options={options} />;
    case 'remoteness': return options?.compact ? <RemotenessIndexCompact /> : <RemotenessIndexCard />;
    case 'route-confidence': return options?.compact ? <RouteConfidenceCompact /> : <RouteConfidenceWidget />;
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
    case 'expedition-readiness':
      return (
        <ExpeditionReadinessWidget
          compact={options?.compact}
          width={options?.widgetWidth}
          height={options?.widgetHeight}
          onOpenBrief={options?.onOpenCommandBrief}
        />
      );
    case 'expedition-status-summary': return <ExpeditionStatusSummaryWidget compact={options?.compact} />;
    case 'expedition-risk': return options?.compact ? <ExpeditionRiskCompact /> : <ExpeditionRiskCard />;
    case 'resource-forecast': return options?.compact ? <ResourceForecastCompact /> : <ResourceForecastCard />;
    case 'trip-recorder': return options?.compact ? <TripRecorderCompact /> : <TripRecorderCard />;





    // Ã¢â€â‚¬Ã¢â€â‚¬ Highway Widgets Ã¢â€â‚¬Ã¢â€â‚¬
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
      // Ã¢-ÂÃ¢-ÂÃ¢-Â PHASE 7: Standardized Telemetry Placeholder System Ã¢-ÂÃ¢-ÂÃ¢-Â
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Detail Renderers (expanded view for modal) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

// Ã¢â€â‚¬Ã¢â€â‚¬ Detail Renderers (expanded view for modal) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
    case 'vehicle-systems': return <VehicleTelemetryDetailView onClose={options?.onCloseDetail} />;
    case 'stability-index': return <StabilityIndexDetail data={data} options={options} />;
    case 'attitude-monitor': return <AttitudeMonitorDetail data={data} options={options} />;
    case 'attitude-command': return <AttitudeCommandWidget data={data} options={options} />;
    case 'mission-sustainment': return <MissionSustainmentDetail data={data} options={options} />;
    case 'operational-readiness': return <OperationalReadinessDetail data={data} options={options} />;
    case 'sustainability': return <ResourceStatusDetail data={data} />;
    case 'progress': return <ProgressDetail data={data} options={options} />;
    case 'navigate-surface': return <NavigateSurfaceWidget data={data} options={options} />;
    case 'remoteness': return <RemotenessIndexDetailView onNavigateToTarget={options?.onRemotenessNavigateToTarget} />;
    case 'route-confidence': return <RouteConfidenceWidget />;

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
          <VehicleTelemetryDetailView onClose={options?.onCloseDetail} />
        </PremiumAwareWidgetDetail>
      );
    case 'resource-forecast': return <ResourceForecastDetailView />;
    case 'expedition-readiness':
      return <ExpeditionReadinessWidget compact={false} onOpenBrief={options?.onOpenCommandBrief} />;
    case 'expedition-status-summary': return <ExpeditionStatusSummaryWidget compact={false} />;
    case 'expedition-risk': return <ExpeditionRiskDetailView />;
    case 'trip-recorder': return <TripRecorderDetailView />;






    // Ã¢â€â‚¬Ã¢â€â‚¬ Highway Widget Details Ã¢â€â‚¬Ã¢â€â‚¬
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


// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// PROGRESS DETAIL (expanded view for modal)
//
// Phase 4.1: Route breakdown using routeStore + waypointProgressStore.
// Shows waypoint list with reached/current/upcoming status,
// total distance, remaining distance, ETA, and progress index.
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
function ProgressDetail({ data: _data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  const progressSummary = useRouteProgressCommandSnapshot(options);

  if (!progressSummary) {
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

  const routeProgressSource = resolveDashboardValue<string>([
    {
      source: progressSummary.isActive ? 'live' : 'unavailable',
      value: progressSummary.isActive ? progressSummary.sourceDetail : null,
      detail: progressSummary.isActive ? progressSummary.sourceDetail : null,
    },
    {
      source: 'ai-derived',
      value: progressSummary.sourceDetail,
      detail: progressSummary.sourceDetail,
    },
  ]);

  return (
    <View style={s.detailContainer}>
      <WidgetDetailLeadCard
        eyebrow="ROUTE PROGRESS"
        title={progressSummary.routeLabel}
        summary={`${progressSummary.remainingMilesText} remaining with ${progressSummary.etaLabel} projected.`}
        tone={progressSummary.isActive ? 'live' : 'manual'}
        badges={[
          {
            label: routeProgressSource?.detail ?? getDashboardSourceLabel(routeProgressSource?.source ?? 'unavailable'),
            tone: progressSummary.isActive ? 'live' : 'manual',
          },
        ]}
      />
      {!progressSummary.isActive ? (
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
        <MetricRow label="CURRENT ROUTE" value={progressSummary.routeLabel} />
        <MetricRow
          label="SOURCE"
          value={routeProgressSource?.detail ?? getDashboardSourceLabel(routeProgressSource?.source ?? 'unavailable')}
          color={routeProgressSource ? getDashboardSourceTone(routeProgressSource.source) : TACTICAL.textMuted}
        />
        <MetricRow label="REMAINING" value={progressSummary.remainingMilesText} />
        <MetricRow label="COMPLETED" value={progressSummary.completedMilesText} />
        <MetricRow label="ETA" value={progressSummary.etaLabel} color={progressSummary.isComplete ? '#4CAF50' : undefined} />
        {progressSummary.destinationLabel ? (
          <MetricRow label="DESTINATION" value={progressSummary.destinationLabel} />
        ) : null}
        <MetricRow label="UPDATED" value={progressSummary.updatedAt ?? 'Unavailable'} />
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

// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// VEHICLE WEIGHT DETAIL (Phase 4 Ã¢â‚¬â€ Single Source of Truth)
//
// Full weight breakdown with header, sections, edge-case messages.
// Opened by tapping Vehicle Systems widget.
// Uses computeFullBuildWeightBreakdown() for ALL weight values.
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â

// Display-only density constants (not used for calculation Ã¢â‚¬â€ that's in weightEngine)
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Single source of truth: centralized breakdown Ã¢â€â‚¬Ã¢â€â‚¬
  const itemsWt = getTotalWeightLbs(data.loadItems);
  const bw: BuildWeightBreakdown = computeFullBuildWeightBreakdown(undefined, {
    items_weight_lb: itemsWt,
  });

  // Ã¢â€â‚¬Ã¢â€â‚¬ Destructure all values from the centralized breakdown Ã¢â€â‚¬Ã¢â€â‚¬
  const {
    base_weight_lb, gvwr_lb, hardware_additions_lb,
    fuel_percent_current, fuel_gal_current, fuel_weight_lb,
    fuel_tank_capacity_gal, fuel_type, has_fuel_tank_capacity,
    water_gal_current, water_weight_lb, consumables_weight_lb,
    items_weight_lb, build_weight_lb, payload_margin_lb,
    has_specs, status_tag, status_color, margin_color,
  } = bw;

  // Ã¢â€â‚¬Ã¢â€â‚¬ Items edge-case detection (needs raw item list) Ã¢â€â‚¬Ã¢â€â‚¬
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
      {/* Ã¢-ÂÃ¢-ÂÃ¢-Â HEADER Ã¢-ÂÃ¢-ÂÃ¢-Â */}
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

      {/* Ã¢-ÂÃ¢-ÂÃ¢-Â 1) VEHICLE BASE Ã¢-ÂÃ¢-ÂÃ¢-Â */}
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

      {/* Ã¢-ÂÃ¢-ÂÃ¢-Â 2) ITEMS Ã¢-ÂÃ¢-ÂÃ¢-Â */}
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
            Some items have 0 lb - update item weights for accuracy
          </Text>
        </View>
      )}

      {/* Ã¢-ÂÃ¢-ÂÃ¢-Â 3) CONSUMABLES Ã¢-ÂÃ¢-ÂÃ¢-Â */}
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
            Tank capacity not set - fuel weight excluded
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

      {/* Ã¢-ÂÃ¢-ÂÃ¢-Â 4) TOTAL Ã¢-ÂÃ¢-ÂÃ¢-Â */}
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

      {/* Ã¢-ÂÃ¢-ÂÃ¢-Â ADVANCED MODE: Axle splits (future) Ã¢-ÂÃ¢-ÂÃ¢-Â */}
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
  const rollDeg = options?.rollDeg ?? null;
  const pitchDeg = options?.pitchDeg ?? null;
  const sensorStatus = options?.sensorStatus || 'OFFLINE';
  const sampleTimestampMs = options?.sampleTimestampMs ?? null;
  const advanced = options?.advancedMode;
  const attitudeTelemetry = useMemo(
    () =>
      normalizeDeviceAttitudeTelemetry({
        rollDeg,
        pitchDeg,
        sensorStatus,
        sampleTimestampMs,
      }),
    [pitchDeg, rollDeg, sampleTimestampMs, sensorStatus],
  );
  const displayState = useAttitudeMonitorDisplayState({
    rollDeg: attitudeTelemetry.rollDeg,
    pitchDeg: attitudeTelemetry.pitchDeg,
    sensorStatus,
    sampleTimestampMs: attitudeTelemetry.updatedAt,
    advanced,
    sourceOrigin: 'device_sensors',
    telemetryHealthOverride: attitudeTelemetry.displayHealth,
    sourceLabelOverride: attitudeTelemetry.sourceLabel,
    sourceShortLabelOverride: attitudeTelemetry.sourceLabel,
    sourceChipLabelOverride: attitudeTelemetry.sourceChipLabel,
    sourceStatusLineOverride: attitudeTelemetry.sourceStatusLine,
  });
  const sensorState = useMemo(() => getAttitudeSensorState(sensorStatus), [sensorStatus]);
  const activeVehicleContext = useDashboardActiveVehicleContext();
  const attitudeVehicleId = resolveAttitudeMonitorVehicleId(activeVehicleContext);

  return (
    <AttitudeMonitorExpandedView
      displayState={displayState}
      sensorState={sensorState}
      sensorStatus={sensorStatus}
      vehicleId={attitudeVehicleId}
      rawRollDeg={attitudeTelemetry.rawRollDeg}
      rawPitchDeg={attitudeTelemetry.rawPitchDeg}
      onCalibrate={options?.onCalibrate}
      onResetCalibration={options?.onResetCalibration}
      calibrationActive={Boolean(options?.isCalibrated)}
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
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
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



// Ã¢â€â‚¬Ã¢â€â‚¬ Styles Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function ResourceStatusWidget({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
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
  const fuelTone =
    fuelPct != null && fuelPct <= 15 ? 'critical' :
    fuelPct != null && fuelPct <= 30 ? 'attention' :
    'good';
  const waterTone =
    waterGal != null && waterGal <= 0 ? 'critical' :
    waterGal != null && waterGal < 5 ? 'attention' :
    'good';
  const powerLevelText =
    powerPercent != null
      ? `${Math.round(powerPercent)}%`
      : powerInput != null && powerInput > 0
        ? `+${Math.round(powerInput)}W`
        : powerOutput != null && powerOutput > 0
          ? `-${Math.round(powerOutput)}W`
          : '--';
  const powerLevelTone =
    powerPercent != null && powerPercent < 20 ? 'critical' :
    powerPercent != null && powerPercent < 40 ? 'attention' :
    powerInput != null && powerInput > 0 ? 'good' :
    powerOutput != null && powerOutput > 0 ? 'critical' :
    'neutral';
  const powerSupportText =
    powerPercent != null
      ? `${Math.round(powerPercent)}% reserve`
      : powerInput != null && powerInput > 0
        ? `+${Math.round(powerInput)}W in`
        : powerOutput != null && powerOutput > 0
          ? `-${Math.round(powerOutput)}W out`
          : 'No live power';

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
  const footerTokens = [
    `Fuel ${compactResourceSourceLabel(fuelResolution?.detail ?? getDashboardSourceLabel(fuelResolution?.source ?? 'manual'))}`,
    `Water ${compactResourceModeLabel(consumables.water_source)}`,
    `Power ${compactPowerSourceLabel(ecsPower)}`,
  ];
  const footerLine = footerTokens.join(' - ');
  const headlineTone =
    resourcePresentation.heroTone === 'critical'
      ? 'critical'
      : resourcePresentation.heroTone === 'attention' || resourcePresentation.heroTone === 'warning'
        ? 'attention'
        : resourcePresentation.heroTone === 'good'
          ? 'good'
          : 'neutral';

  if (!hasActiveVehicle) {
    return (
      <WidgetCardShell badge={{ label: 'UNAVAILABLE', tone: 'unavailable' }}>
        <WidgetEmptyState primary="Select an active vehicle" secondary="Fleet resources appear here once a vehicle is active." />
      </WidgetCardShell>
    );
  }

  return (
    <WidgetCardShell
      badge={resourcePresentation.badge}
      footer={<WidgetMetaLine text={footerLine} tone="neutral" />}
    >
      <View style={resourceWidgetS.compactCardBody}>
        <Text style={resourceWidgetS.compactEyebrow} numberOfLines={1}>
          {resourcePresentation.heroLabel}
        </Text>
        <Text
          style={[resourceWidgetS.compactHeroValue, { color: getWidgetToneColor(headlineTone) }]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.72}
        >
          {resourcePresentation.heroValue}
        </Text>
        <Text
          style={resourceWidgetS.compactSupport}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {resourcePresentation.heroSupport}
        </Text>

        <View style={resourceWidgetS.compactMetricStack}>
          <View style={resourceWidgetS.compactMetricRow}>
            <Text style={resourceWidgetS.compactMetricLabel} numberOfLines={1}>
              FUEL
            </Text>
            <Text
              style={[resourceWidgetS.compactMetricValue, { color: getWidgetToneColor(fuelTone) }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.84}
            >
              {fuelPct != null ? `${Math.round(fuelPct)}%` : '--'}
            </Text>
          </View>
          <View style={resourceWidgetS.compactMetricRow}>
            <Text style={resourceWidgetS.compactMetricLabel} numberOfLines={1}>
              WATER
            </Text>
            <Text
              style={[resourceWidgetS.compactMetricValue, { color: getWidgetToneColor(waterTone) }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.84}
            >
              {waterGal != null ? `${waterGal.toFixed(1)} gal` : '--'}
            </Text>
          </View>
          <View style={resourceWidgetS.compactMetricRow}>
            <Text style={resourceWidgetS.compactMetricLabel} numberOfLines={1}>
              POWER
            </Text>
            <Text
              style={[resourceWidgetS.compactMetricValue, { color: getWidgetToneColor(powerLevelTone) }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.84}
            >
              {powerLevelText}
            </Text>
          </View>
        </View>

        <Text
          style={resourceWidgetS.compactFooterNote}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.82}
        >
          {alternateFluidValue ?? powerSupportText}
        </Text>
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
  compactCardBody: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'space-between',
    gap: 4,
    paddingVertical: 2,
  },
  compactEyebrow: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.95,
    lineHeight: 9,
  },
  compactHeroValue: {
    fontSize: 18,
    fontWeight: '900',
    color: TACTICAL.text,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
  compactSupport: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    lineHeight: 11,
  },
  compactMetricStack: {
    gap: 3,
  },
  compactMetricRow: {
    minHeight: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  compactMetricLabel: {
    flexShrink: 0,
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 0.9,
    lineHeight: 9,
  },
  compactMetricValue: {
    flex: 1,
    minWidth: 0,
    textAlign: 'right',
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    lineHeight: 12,
  },
  compactFooterNote: {
    fontSize: 8.5,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    lineHeight: 10,
  },
});

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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Two-column layout Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  twoCol: { flexDirection: 'row', gap: 0 },
  colLeft: { flex: 1, paddingRight: 6 },
  colRight: { flex: 1, paddingLeft: 6 },
  colDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: 2 },
  colHeader: { fontSize: 7, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.2, marginBottom: 4 },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Compact mode Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  compactRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'stretch', minHeight: 42, gap: 8 },
  compactCell: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  compactLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 3, lineHeight: 8 },
  compactValue: { fontSize: 12, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text, lineHeight: 14 },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Vehicle Systems V2: expedition badges Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Stability Index Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Attitude Monitor (Inclinometer) V2 Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ V2: Enterprise Vehicle Schematic Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

  // Ã¢â€â‚¬Ã¢â€â‚¬ Tactical Bar (Power/Energy Monitor) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  tacticalBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  tacticalBarLabel: { fontSize: 7, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, width: 48 },
  tacticalBarOuter: { flex: 1, height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden', position: 'relative' },
  tacticalBarFill: { height: '100%', borderRadius: 3 },
  tacticalBarWarning: { position: 'absolute', left: '25%', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(192,57,43,0.4)' },
  tacticalBarValue: { fontSize: 9, fontWeight: '800', fontFamily: 'Courier', width: 38, textAlign: 'right' },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Mission Sustainment Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  limitBadge: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4, marginTop: 4, alignSelf: 'flex-start' },
  limitText: { fontSize: 7, fontWeight: '900', letterSpacing: 1 },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Vehicle Systems Phase 4: Status Tag Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  vsStatusTag: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4,
    marginTop: 4, alignSelf: 'flex-start',
  },
  vsStatusTagText: { fontSize: 8, fontWeight: '800', letterSpacing: 1.2 },

  // Ã¢â€â‚¬Ã¢â€â‚¬ Operational Readiness Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  readinessHeader: { marginBottom: 2 },
  readinessGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 },
  readinessCell: { alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)', minWidth: 52 },
  readinessCellLabel: { fontSize: 6, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1, marginBottom: 1 },
  readinessCellValue: { fontSize: 11, fontWeight: '900', fontFamily: 'Courier', color: TACTICAL.text },
});


// Ã¢â€â‚¬Ã¢â€â‚¬ Phase 4: Vehicle Weight Detail Styles Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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


// Ã¢â€â‚¬Ã¢â€â‚¬ Core 4 Shared Styles (Phase 2: Consistent Widget Styling) Ã¢â€â‚¬Ã¢â€â‚¬
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


// Ã¢â€â‚¬Ã¢â€â‚¬ BLU Power Widget Styles (Phase 1C) Ã¢â€â‚¬Ã¢â€â‚¬
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
  // Ã¢â€â‚¬Ã¢â€â‚¬ Phase 5: Read-only badge for active mode Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
  // Ã¢â€â‚¬Ã¢â€â‚¬ Phase 5: Tank capacity helper text Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Progress Widget Styles (Phase 4) Ã¢â€â‚¬Ã¢â€â‚¬
const progS = StyleSheet.create({
  summaryBody: {
    flex: 1,
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
});

// Ã¢â€â‚¬Ã¢â€â‚¬ Phase 6: Remoteness Widget Styles (v1.0 Ã¢â‚¬â€ Store-backed) Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Phase 4 (v1.3): Remoteness Detail Styles Ã¢â€â‚¬Ã¢â€â‚¬
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


// Ã¢â€â‚¬Ã¢â€â‚¬ Phase 6: Expedition Channel Widget Styles Ã¢â€â‚¬Ã¢â€â‚¬
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


// Ã¢â€â‚¬Ã¢â€â‚¬ Custom Widget Content (must be defined before renderWidgetContent references it) Ã¢â€â‚¬Ã¢â€â‚¬
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

// Ã¢â€â‚¬Ã¢â€â‚¬ Empty State Microcopy Styles Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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







// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
// ECOFLOW POWER DETAIL Ã¢â‚¬â€ Unified Power Authority Bridge
//
// Production path: legacy EcoFlow detail now delegates to the unified
// power detail view so there is one canonical power-detail surface.
// Ã¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-ÂÃ¢-Â
function EcoFlowPowerDetail({ data, options }: { data: WidgetData; options?: WidgetRenderOptions }) {
  return <PowerSystemDetailView />;
}

