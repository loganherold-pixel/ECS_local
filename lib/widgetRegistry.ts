/**
 * ═══════════════════════════════════════════════════════════
 * ECS WIDGET REGISTRY — CENTRALIZED SOURCE OF TRUTH
 * ═══════════════════════════════════════════════════════════
 *
 * Phase 10: Instrument Cluster Lock
 * Stabilization Phase 1: Widget System Reliability
 * Stabilization Phase 7: Telemetry Placeholder System
 *
 * Dashboard displays 6 core instruments:

 *   2) Attitude Monitor  (Physical Attitude)
 *   3) Remoteness        (Environmental Isolation)
 *   4) Progress          (Route Status)
 *   5) Sustainability    (Resource Awareness)
 *   6) Vehicle Twin      (Schematic Overview)
 *
 * All other widgets are retired from the dashboard.
 * Their triggers are converted to Expedition Timeline events
 * via instrumentClusterEvents.ts.
 *
 * Governs:
 * - Widget creation / modification / removal rules
 * - Default placement rules
 * - Instrument cluster lock (core_instrument flag)
 * - Tab-specific isolation
 * - Redundancy prevention
 * - Per-widget auto-collapse support
 * - Widget status tracking (active, disabled, awaiting_data, unavailable)
 */

export type WidgetCategory =
  | 'vehicle'
  | 'mission'
  | 'safety'
  | 'sustainment'
  | 'loadout'
  | 'system'
  | 'custom'
  | 'highway';

/**
 * Stabilization Phase 1: Widget Status
 *
 * Tracks the runtime readiness of each widget:
 *   - active:        Widget is fully operational and rendering
 *   - disabled:      Widget is intentionally turned off by user or system
 *   - awaiting_data: Widget requires telemetry/device connection not yet available
 *   - unavailable:   Widget component failed to load or is temporarily broken
 */
export type WidgetStatus = 'active' | 'disabled' | 'awaiting_data' | 'unavailable';

export type TabScope =
  | 'dashboard_only'
  | 'expedition_only'
  | 'emergency_only'
  | 'loadout_only'
  | 'global';

export type RequiredSensor = 'motion' | 'gps' | 'none';

export type DashboardMode = 'expedition' | 'highway';
export type DashboardWidgetFootprint = '1x1' | '1x2' | '2x1' | '2x2';
export type FixedDashboardWidgetFootprint = '1x1' | '2x1' | '2x2';
export type DashboardWidgetSizeClass = 'large' | 'standard';
export type DashboardTabEligibility = 'expedition' | 'highway' | 'both';

export interface WidgetRegistryEntry {
  /** Unique widget identifier */
  widget_id: string;
  /** Display name shown in UI */
  display_name: string;
  /** Short description */
  description: string;
  /** Ionicons icon name */
  icon: string;
  /** Functional category */
  category: WidgetCategory;
  /** Default widget size */
  default_size: DashboardWidgetFootprint;
  /** Whether this is a default dashboard widget */
  default_dashboard: boolean;
  /** Position order for default placement (lower = higher) */
  default_position_order: number;
  /** Whether user can remove this widget */
  removable: boolean;
  /** Whether this widget requires Advanced Mode to be visible */
  requires_advanced_mode: boolean;
  /** Required sensor hardware */
  requires_sensor: RequiredSensor;
  /** Which tab(s) this widget is allowed on */
  tab_scope: TabScope;
  /** Whether this widget supports compact/collapsed mode */
  supports_compact: boolean;
  /** Whether this widget has advanced mode expansion */
  supports_advanced: boolean;
  /** Dashboard modes this widget supports */
  supports_modes: DashboardMode[];
  /** Data fields this widget displays (for redundancy detection) */
  data_provides: string[];
  /** Whether this widget is ready to render (false = reserved/future) */
  render_ready: boolean;
  /**
   * Phase 10: Core instrument flag.
   * Only widgets with core_instrument=true appear on the locked dashboard.
   * All other widgets are retired from the dashboard and their triggers
   * are converted to Expedition Timeline events.
   */
  core_instrument?: boolean;
  /**
   * Stabilization Phase 1: Runtime widget status.
   * Tracks whether the widget is active, disabled, awaiting data, or unavailable.
   * Defaults to 'active' for render_ready widgets, 'unavailable' for non-render_ready.
   */
  widget_status: WidgetStatus;
}


// ═══════════════════════════════════════════════════════════
// CORE INSTRUMENT IDS — Canonical list
// ═══════════════════════════════════════════════════════════
export const CORE_INSTRUMENT_IDS: readonly string[] = [
  'vehicle-systems',
  'attitude-monitor',
  'attitude-command',
  'navigate-surface',
  'ecs-power',
  'expedition-readiness',
  'hwy-elevation-profile',
  'expedition-status-summary',
] as const;

export interface DashboardWidgetTemplate {
  widgetId: string;
  widgetSize: DashboardWidgetFootprint;
}

export interface DashboardCatalogEntry {
  widgetId: string;
  label: string;
  purpose: string;
  recommendedSize: DashboardWidgetSizeClass;
  recommendedWidgetSize: DashboardWidgetFootprint;
  supportedWidgetSizes: readonly DashboardWidgetFootprint[];
  minimumWidgetSize: DashboardWidgetFootprint;
  userResizable: boolean;
  priority: number;
  tabEligibility: DashboardTabEligibility;
  supportedModes: DashboardMode[];
  liveData: boolean;
  liveSources: string[];
  defaultModes: DashboardMode[];
  isDefaultSelectable: boolean;
  fallbackBehavior: string;
  pickerEnabled: boolean;
}

export const DASHBOARD_WIDGET_CATALOG: readonly DashboardCatalogEntry[] = [
  {
    widgetId: 'attitude-monitor',
    label: 'Attitude Monitor',
    purpose: 'Roll, pitch, and vehicle orientation awareness for off-camber and obstacle decisions.',
    recommendedSize: 'large',
    recommendedWidgetSize: '2x1',
    supportedWidgetSizes: ['2x1'],
    minimumWidgetSize: '2x1',
    userResizable: false,
    priority: 1,
    tabEligibility: 'expedition',
    supportedModes: ['expedition'],
    liveData: true,
    liveSources: ['motion sensors'],
    defaultModes: ['expedition'],
    isDefaultSelectable: true,
    fallbackBehavior: 'Shows sensor status and safe placeholder guidance until motion data is available.',
    pickerEnabled: true,
  },
  {
    widgetId: 'attitude-command',
    label: 'Attitude Command',
    purpose: 'Full-size attitude command surface with weather, daylight, route, power, and vehicle context around the inclinometer.',
    recommendedSize: 'large',
    recommendedWidgetSize: '2x2',
    supportedWidgetSizes: ['2x2'],
    minimumWidgetSize: '2x2',
    userResizable: false,
    priority: 2,
    tabEligibility: 'expedition',
    supportedModes: ['expedition'],
    liveData: true,
    liveSources: ['motion sensors', 'weather', 'route state', 'power authority', 'vehicle telemetry'],
    defaultModes: [],
    isDefaultSelectable: true,
    fallbackBehavior: 'Keeps the attitude surface visible while marking missing weather, route, power, or vehicle data compactly.',
    pickerEnabled: true,
  },
  {
    widgetId: 'vehicle-systems',
    label: 'Vehicle Systems',
    purpose: 'Compact vehicle systems, live telemetry, and remoteness context.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '1x1',
    supportedWidgetSizes: ['1x1'],
    minimumWidgetSize: '1x1',
    userResizable: false,
    priority: 3,
    tabEligibility: 'both',
    supportedModes: ['expedition', 'highway'],
    liveData: true,
    liveSources: ['vehicle state', 'vehicle telemetry service', 'stored vehicle profile', 'gps remoteness context'],
    defaultModes: ['highway'],
    isDefaultSelectable: true,
    fallbackBehavior: 'Falls back to configured vehicle profile data and clearly labels missing live inputs.',
    pickerEnabled: true,
  },
  {
    widgetId: 'remoteness',
    label: 'Remoteness',
    purpose: 'Isolation, bailout, and distance-from-help awareness for expedition decisions.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '1x1',
    supportedWidgetSizes: ['1x1'],
    minimumWidgetSize: '1x1',
    userResizable: false,
    priority: 3,
    tabEligibility: 'expedition',
    supportedModes: ['expedition'],
    liveData: true,
    liveSources: ['gps', 'signal confidence', 'route context'],
    defaultModes: ['expedition'],
    isDefaultSelectable: true,
    fallbackBehavior: 'Shows a degraded remoteness state until GPS and signal context are available.',
    pickerEnabled: false,
  },
  {
    widgetId: 'route-confidence',
    label: 'Route Confidence',
    purpose: 'Compact route confidence, remoteness, and signal-ahead awareness for expedition decisions.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '1x1',
    supportedWidgetSizes: ['1x1'],
    minimumWidgetSize: '1x1',
    userResizable: false,
    priority: 5,
    tabEligibility: 'expedition',
    supportedModes: ['expedition', 'highway'],
    liveData: true,
    liveSources: ['remoteness forecast', 'offline route cache', 'route context'],
    defaultModes: [],
    isDefaultSelectable: true,
    fallbackBehavior: 'Shows a pending confidence state until remoteness or route context is available.',
    pickerEnabled: false,
  },
  {
    widgetId: 'expedition-readiness',
    label: 'Expedition Readiness',
    purpose: 'Compact deterministic Expedition Readiness score, decision status, top concern, and freshness link into Command Brief.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '1x1',
    supportedWidgetSizes: ['1x1', '2x1'],
    minimumWidgetSize: '1x1',
    userResizable: true,
    priority: 4,
    tabEligibility: 'expedition',
    supportedModes: ['expedition'],
    liveData: true,
    liveSources: ['Expedition Readiness store', 'route context', 'fleet profile', 'weather freshness', 'offline package state'],
    defaultModes: [],
    isDefaultSelectable: true,
    fallbackBehavior: 'Shows no-active-expedition or limited-confidence states without recalculating readiness in the widget.',
    pickerEnabled: true,
  },
  {
    widgetId: 'progress',
    label: 'Route Progress',
    purpose: 'Trip progress, distance remaining, and time remaining at a glance.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '1x1',
    supportedWidgetSizes: ['1x1'],
    minimumWidgetSize: '1x1',
    userResizable: false,
    priority: 6,
    tabEligibility: 'both',
    supportedModes: ['expedition', 'highway'],
    liveData: true,
    liveSources: ['route state', 'gps'],
    defaultModes: ['highway'],
    isDefaultSelectable: true,
    fallbackBehavior: 'Keeps the widget visible with a neutral no-route state instead of blanking out.',
    pickerEnabled: false,
  },
  {
    widgetId: 'navigate-surface',
    label: 'Navigate Surface',
    purpose: 'A wide embedded route surface for monitoring live map context from Dashboard.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '2x1',
    supportedWidgetSizes: ['2x1'],
    minimumWidgetSize: '2x1',
    userResizable: false,
    priority: 5,
    tabEligibility: 'both',
    supportedModes: ['expedition', 'highway'],
    liveData: true,
    liveSources: ['route state', 'gps', 'map context'],
    defaultModes: [],
    isDefaultSelectable: true,
    fallbackBehavior: 'Shows a clean no-route state until Navigate stages a destination or route.',
    pickerEnabled: true,
  },
  {
    widgetId: 'hwy-forward-weather',
    label: 'Weather',
    purpose: 'Current and near-term weather relevant to the route and current operating area.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '1x1',
    supportedWidgetSizes: ['1x1', '2x1'],
    minimumWidgetSize: '1x1',
    userResizable: true,
    priority: 7,
    tabEligibility: 'both',
    supportedModes: ['expedition', 'highway'],
    liveData: true,
    liveSources: ['gps', 'route weather pipeline'],
    defaultModes: ['expedition', 'highway'],
    isDefaultSelectable: true,
    fallbackBehavior: 'Preserves cached weather and clearly marks stale, waiting, offline, or unavailable states.',
    pickerEnabled: false,
  },
  {
    widgetId: 'ecs-power',
    label: 'Power Systems',
    purpose: 'Portable and vehicle-side power reserve snapshot across connected ECS battery providers.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '2x1',
    supportedWidgetSizes: ['2x1', '1x1'],
    minimumWidgetSize: '1x1',
    userResizable: true,
    priority: 6,
    tabEligibility: 'both',
    supportedModes: ['expedition', 'highway'],
    liveData: true,
    liveSources: ['bluetooth power providers', 'power authority'],
    defaultModes: [],
    isDefaultSelectable: false,
    fallbackBehavior: 'Shows last-known readings and explicit disconnected or stale states when live telemetry drops.',
    pickerEnabled: true,
  },
  {
    widgetId: 'sustainability',
    label: 'Resource Status',
    purpose: 'High-level expedition resource sufficiency across fuel, water, and endurance horizon.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '1x1',
    supportedWidgetSizes: ['1x1'],
    minimumWidgetSize: '1x1',
    userResizable: false,
    priority: 9,
    tabEligibility: 'expedition',
    supportedModes: ['expedition'],
    liveData: true,
    liveSources: ['trip state', 'consumables', 'vehicle profile'],
    defaultModes: [],
    isDefaultSelectable: false,
    fallbackBehavior: 'Falls back to stored consumables and conservative reserve estimates when live data is partial.',
    pickerEnabled: false,
  },
  {
    widgetId: 'vehicle-telemetry',
    label: 'Vehicle Telemetry',
    purpose: 'Live OBD-II snapshot for engine, battery, load, and other high-signal vehicle telemetry.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '1x1',
    supportedWidgetSizes: ['1x1', '2x1'],
    minimumWidgetSize: '1x1',
    userResizable: true,
    priority: 10,
    tabEligibility: 'both',
    supportedModes: ['expedition', 'highway'],
    liveData: true,
    liveSources: ['vehicle telemetry service', 'obd adapter'],
    defaultModes: [],
    isDefaultSelectable: false,
    fallbackBehavior: 'Retains last-known telemetry and shows clean disconnected or reconnecting states.',
    pickerEnabled: false,
  },
  {
    widgetId: 'hwy-elevation-profile',
    label: 'Elevation / Terrain',
    purpose: 'Wide terrain surface combining elevation, wind, daylight, and sun-glare operating context.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '2x1',
    supportedWidgetSizes: ['2x1'],
    minimumWidgetSize: '2x1',
    userResizable: false,
    priority: 7,
    tabEligibility: 'both',
    supportedModes: ['expedition', 'highway'],
    liveData: true,
    liveSources: ['gps', 'route elevation context', 'weather solar times', 'weather wind'],
    defaultModes: [],
    isDefaultSelectable: false,
    fallbackBehavior: 'Shows current elevation context and gracefully degrades when terrain, daylight, or wind data is unavailable.',
    pickerEnabled: true,
  },
  {
    widgetId: 'expedition-status-summary',
    label: 'Expedition Status',
    purpose: 'Compact ECS expedition status with top concern, next action, convoy, resource, vehicle, and data-quality context.',
    recommendedSize: 'standard',
    recommendedWidgetSize: '2x1',
    supportedWidgetSizes: ['2x1', '1x1'],
    minimumWidgetSize: '1x1',
    userResizable: true,
    priority: 8,
    tabEligibility: 'expedition',
    supportedModes: ['expedition'],
    liveData: true,
    liveSources: ['expedition assessment store', 'route context', 'convoy context', 'logistics context', 'vehicle context'],
    defaultModes: [],
    isDefaultSelectable: false,
    fallbackBehavior: 'Shows a no-active-expedition state instead of treating demo or missing route data as live status.',
    pickerEnabled: true,
  },
] as const;

export const DASHBOARD_WIDGET_REPLACEMENTS: Readonly<Record<string, string | null>> = {
  progress: 'navigate-surface',
  'route-progress': 'navigate-surface',
  'hwy-forward-weather': 'attitude-command',
  'hwy-daylight-remaining': 'hwy-elevation-profile',
  'hwy-sun-glare': 'hwy-elevation-profile',
  'hwy-wind-monitor': 'hwy-elevation-profile',
  'hwy-road-hazards': 'hwy-elevation-profile',
  'hwy-power-monitor': 'ecs-power',
  'power-systems': 'ecs-power',
  'ecoflow-power': 'ecs-power',
  remoteness: 'vehicle-systems',
  'route-confidence': 'vehicle-systems',
  'vehicle-telemetry': 'vehicle-systems',
  sustainability: 'vehicle-systems',
};

export const ATTITUDE_COMMAND_REPLACEMENT_WIDGET_IDS: readonly string[] = [
  'attitude-command',
  'navigate-surface',
] as const;

const ATTITUDE_COMMAND_REPLACEMENT_LABELS: Readonly<Record<string, string>> = {
  'navigate-surface': 'Navigation Command',
};

export function getDashboardWidgetReplacement(widgetId: string | null | undefined): string | null {
  if (!widgetId) return null;
  return Object.prototype.hasOwnProperty.call(DASHBOARD_WIDGET_REPLACEMENTS, widgetId)
    ? DASHBOARD_WIDGET_REPLACEMENTS[widgetId]
    : widgetId;
}

export function filterDashboardWidgetPickerEntriesForReplacement<T extends { widget_id: string }>(
  entries: readonly T[],
  intent: 'add' | 'replace',
  currentWidgetType: string | null | undefined,
): T[] {
  if (intent === 'replace' && currentWidgetType === 'attitude-command') {
    return entries.filter(entry => ATTITUDE_COMMAND_REPLACEMENT_WIDGET_IDS.includes(entry.widget_id));
  }
  return [...entries];
}

export function getDashboardWidgetPickerDisplayName(
  widgetId: string,
  intent: 'add' | 'replace',
  currentWidgetType: string | null | undefined,
): string | null {
  if (intent === 'replace' && currentWidgetType === 'attitude-command') {
    return ATTITUDE_COMMAND_REPLACEMENT_LABELS[widgetId] ?? null;
  }
  return null;
}

export const CURATED_DASHBOARD_WIDGET_IDS: readonly string[] = DASHBOARD_WIDGET_CATALOG
  .filter(entry => entry.pickerEnabled)
  .map(entry => entry.widgetId);

export const DASHBOARD_MODE_WIDGET_IDS: Record<DashboardMode, readonly string[]> = {
  expedition: DASHBOARD_WIDGET_CATALOG
    .filter(entry => entry.pickerEnabled)
    .map(entry => entry.widgetId),
  highway: DASHBOARD_WIDGET_CATALOG
    .filter(entry => entry.pickerEnabled && entry.supportedModes.includes('highway'))
    .map(entry => entry.widgetId),
};

export const DEFAULT_DASHBOARD_LAYOUTS: Record<
  DashboardMode,
  {
    gridLayout: '2x2';
    slots: DashboardWidgetTemplate[];
  }
> = {
  expedition: {
    gridLayout: '2x2',
    slots: [
      { widgetId: 'attitude-command', widgetSize: '2x2' },
    ],
  },
  highway: {
    gridLayout: '2x2',
    slots: [
      { widgetId: 'vehicle-systems', widgetSize: '1x1' },
      { widgetId: 'navigate-surface', widgetSize: '2x1' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════
// WIDGET REGISTRY — ALL WIDGETS
// ═══════════════════════════════════════════════════════════

export const WIDGET_REGISTRY: WidgetRegistryEntry[] = [
  // ══════════════════════════════════════════════════════════
  // CORE 6 INSTRUMENTS (Phase 10+: Instrument Cluster Lock)
  // ══════════════════════════════════════════════════════════

  // 1) Vehicle Systems — Mechanical Integrity
  {
    widget_id: 'vehicle-systems',
    display_name: 'Vehicle Systems',
    description: 'Merged vehicle systems, live telemetry, load, power, and remoteness context',
    icon: 'speedometer-outline',
    category: 'vehicle',
    default_size: '1x1',
    default_dashboard: true,
    default_position_order: 2,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: true,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['total_load', 'front_axle', 'rear_axle', 'cg_height', 'fuel_range', 'water_level', 'power_remaining', 'endurance', 'engine_status', 'battery_voltage', 'remoteness_tier', 'cellular_status'],
    render_ready: true,
    core_instrument: true,
    widget_status: 'active',
  },

  // 2) Attitude Monitor — Physical Attitude
  {
    widget_id: 'attitude-monitor',
    display_name: 'Attitude Monitor',
    description: 'Roll, pitch, and tilt inclinometer with dynamic thresholds',
    icon: 'compass-outline',
    category: 'safety',
    default_size: '2x1',
    default_dashboard: false,
    default_position_order: 1,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'motion',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: true,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['roll', 'pitch', 'tilt', 'sensor_status'],
    render_ready: true,
    core_instrument: true,
    widget_status: 'active',
  },

  // 3) Remoteness — Environmental Isolation
  {
    widget_id: 'attitude-command',
    display_name: 'Attitude Command',
    description: 'Full-size attitude command surface with weather, route, power, and vehicle context',
    icon: 'compass-outline',
    category: 'safety',
    default_size: '2x2',
    default_dashboard: true,
    default_position_order: 1,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'motion',
    tab_scope: 'dashboard_only',
    supports_compact: false,
    supports_advanced: true,
    supports_modes: ['expedition'],
    data_provides: ['roll', 'pitch', 'tilt', 'sensor_status', 'weather', 'daylight', 'route_progress', 'power_remaining', 'vehicle_status'],
    render_ready: true,
    core_instrument: true,
    widget_status: 'active',
  },

  {
    widget_id: 'remoteness',
    display_name: 'Remoteness',
    description: 'Cinematic remoteness tier based on available signals',
    icon: 'globe-outline',
    category: 'mission',
    default_size: '1x1',
    default_dashboard: true,
    default_position_order: 3,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['remoteness_tier', 'distance_to_road', 'cellular_status'],
    render_ready: true,
    core_instrument: true,
    widget_status: 'active',
  },

  // Route Confidence — Compact remoteness readiness
  {
    widget_id: 'route-confidence',
    display_name: 'Route Confidence',
    description: 'Compact confidence score and signal forecast powered by remoteness context',
    icon: 'analytics-outline',
    category: 'mission',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 12,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['route_confidence', 'signal_forecast', 'offline_readiness'],
    render_ready: true,
    widget_status: 'active',
  },

  // 4) Progress — Route Status
  {
    widget_id: 'progress',
    display_name: 'Route Progress',
    description: 'Distance remaining, ETA, and route completion snapshot',
    icon: 'trending-up-outline',
    category: 'mission',
    default_size: '1x1',
    default_dashboard: true,
    default_position_order: 4,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['distance_covered', 'distance_planned', 'waypoints', 'route_completion'],
    render_ready: true,
    core_instrument: true,
    widget_status: 'active',
  },

  {
    widget_id: 'navigate-surface',
    display_name: 'Navigate Surface',
    description: 'Wide dashboard route surface with live map context and staged-route visibility',
    icon: 'navigate-outline',
    category: 'mission',
    default_size: '2x1',
    default_dashboard: false,
    default_position_order: 5,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'gps',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['route_state', 'destination', 'map_context', 'gps_position'],
    render_ready: true,
    widget_status: 'active',
  },

  {
    widget_id: 'expedition-readiness',
    display_name: 'Expedition Readiness',
    description: 'Deterministic Expedition Readiness score, status, top concern, and Command Brief handoff',
    icon: 'shield-checkmark-outline',
    category: 'mission',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 4,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition'],
    data_provides: ['readiness_score', 'readiness_status', 'readiness_concern', 'source_freshness'],
    render_ready: true,
    core_instrument: true,
    widget_status: 'active',
  },

  {
    widget_id: 'expedition-status-summary',
    display_name: 'Expedition Status',
    description: 'Compact ECS expedition status, top concern, next action, convoy, resources, vehicle, and data quality',
    icon: 'analytics-outline',
    category: 'mission',
    default_size: '2x1',
    default_dashboard: false,
    default_position_order: 6,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition'],
    data_provides: [
      'expedition_status',
      'top_concern',
      'next_recommended_action',
      'next_checkpoint',
      'convoy_accountability',
      'limiting_resource',
      'limiting_vehicle',
      'assessment_confidence',
      'data_quality',
    ],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  // 5) Sustainability — Resource Awareness
  {
    widget_id: 'sustainability',
    display_name: 'Resource Status',
    description: 'Fuel, water, and reserve horizon summary for expedition sustainment',
    icon: 'leaf-outline',
    category: 'sustainment',
    default_size: '1x1',
    default_dashboard: true,
    default_position_order: 5,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition'],
    data_provides: ['fuel_range', 'fuel_capacity', 'water_level', 'water_days', 'fuel_consumption'],
    render_ready: true,
    core_instrument: true,
    widget_status: 'active',
  },

  // 6) Vehicle Twin — Schematic Overview
  {
    widget_id: 'vehicle-twin',
    display_name: 'Vehicle Twin',
    description: 'View your expedition vehicle as a schematic showing loadout weight, axle load, and power systems',
    icon: 'car-sport-outline',
    category: 'vehicle',
    default_size: '1x1',
    default_dashboard: true,
    default_position_order: 6,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['vehicle_schematic', 'loadout_weight', 'axle_load', 'power_systems'],
    render_ready: true,
    core_instrument: true,
    widget_status: 'active',
  },

  // ══════════════════════════════════════════════════════════
  // RETIRED WIDGETS (Phase 10: Removed from dashboard)
  // ══════════════════════════════════════════════════════════

  {
    widget_id: 'stability-index',
    display_name: 'Stability Index',
    description: 'Retired — threshold crossings now emit RISK timeline events',
    icon: 'analytics-outline',
    category: 'safety',
    default_size: '1x2',
    default_dashboard: false,
    default_position_order: 15,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'motion',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: true,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['roll', 'pitch', 'safe_roll_threshold', 'stability_margin', 'bias'],
    render_ready: true,
    widget_status: 'disabled',
  },

  {
    widget_id: 'status-overview',
    display_name: 'Status Overview',
    description: 'Retired — covered by Progress + Sustainability instruments',
    icon: 'pulse-outline',
    category: 'mission',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 10,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['mission_duration', 'terrain', 'team_size', 'alerts'],
    render_ready: true,
    widget_status: 'disabled',
  },
  {
    widget_id: 'route-progress',
    display_name: 'Route Progress',
    description: 'Retired — covered by Progress instrument',
    icon: 'navigate-outline',
    category: 'mission',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 11,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['distance_covered', 'distance_planned', 'waypoints'],
    render_ready: true,
    widget_status: 'disabled',
  },
  {
    widget_id: 'operational-readiness',
    display_name: 'Operational Readiness',
    description: 'Retired — readiness changes now emit NOTE timeline events',
    icon: 'checkmark-done-circle-outline',
    category: 'mission',
    default_size: '1x2',
    default_dashboard: false,
    default_position_order: 12,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['readiness_score', 'gear_status', 'fuel_status', 'water_status', 'power_status'],
    render_ready: true,
    widget_status: 'disabled',
  },

  {
    widget_id: 'fuel-range',
    display_name: 'Fuel Range',
    description: 'Retired — covered by Sustainability instrument',
    icon: 'flame-outline',
    category: 'vehicle',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 20,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['fuel_range', 'fuel_capacity', 'fuel_consumption'],
    render_ready: true,
    widget_status: 'disabled',
  },
  {
    widget_id: 'vehicle-health',
    display_name: 'Vehicle Health',
    description: 'Retired — covered by Vehicle Systems instrument',
    icon: 'car-outline',
    category: 'vehicle',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 21,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['vehicle_name', 'mpg', 'fuel_capacity'],
    render_ready: true,
    widget_status: 'disabled',
  },
  {
    widget_id: 'power-systems',
    display_name: 'Power / Energy Monitor',
    description: 'Retired — threshold crossings now emit SUPPLY timeline events',
    icon: 'battery-half-outline',
    category: 'vehicle',
    default_size: '1x2',
    default_dashboard: false,
    default_position_order: 22,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['power_remaining', 'solar_input', 'power_sustainability', 'fridge_draw', 'runtime_estimate'],
    render_ready: true,
    widget_status: 'disabled',
  },

  {
    widget_id: 'water-projection',
    display_name: 'Water Projection',
    description: 'Retired — covered by Sustainability instrument',
    icon: 'water-outline',
    category: 'sustainment',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 30,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['water_level', 'water_consumption', 'water_days'],
    render_ready: true,
    widget_status: 'disabled',
  },
  {
    widget_id: 'mission-sustainment',
    display_name: 'Mission Sustainment',
    description: 'Retired — covered by Sustainability instrument',
    icon: 'hourglass-outline',
    category: 'sustainment',
    default_size: '1x2',
    default_dashboard: false,
    default_position_order: 31,
    removable: true,
    requires_advanced_mode: true,
    requires_sensor: 'none',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: true,
    supports_modes: ['expedition'],
    data_provides: ['burn_rate', 'resupply_eta', 'endurance_model', 'resource_projection'],
    render_ready: true,
    widget_status: 'disabled',
  },

  {
    widget_id: 'loadout-readiness',
    display_name: 'Loadout Readiness',
    description: 'Retired — packing changes now emit SUPPLY timeline events',
    icon: 'cube-outline',
    category: 'loadout',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 40,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['packed_items', 'missing_items', 'loadout_weight'],
    render_ready: true,
    widget_status: 'disabled',
  },

  // ── SAFETY / EMERGENCY (kept for emergency profile) ──────
  {
    widget_id: 'emergency-controls',
    display_name: 'Emergency Controls',
    description: 'Emergency contacts, SOS, and critical actions',
    icon: 'shield-outline',
    category: 'safety',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 50,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'emergency_only',
    supports_compact: false,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['emergency_contact', 'sos', 'comms_status'],
    render_ready: true,
    widget_status: 'active',
  },

  // ── RETIRED ACTIVE MODE WIDGETS ──────────────────────────
  {
    widget_id: 'expedition-channel',
    display_name: 'Expedition Channel',
    description: 'Retired — connectivity changes now emit COMMS timeline events',
    icon: 'radio-outline',
    category: 'mission',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 61,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition'],
    data_provides: ['team_connected', 'last_update', 'recent_activity'],
    render_ready: true,
    widget_status: 'disabled',
  },

  // ── FUTURE / RESERVED ────────────────────────────────
  {
    widget_id: 'trip-demand-analyzer',
    display_name: 'Trip Demand Analyzer',
    description: 'GPX-based resource demand analysis and route optimization',
    icon: 'map-outline',
    category: 'mission',
    default_size: '1x2',
    default_dashboard: false,
    default_position_order: 99,
    removable: true,
    requires_advanced_mode: true,
    requires_sensor: 'gps',
    tab_scope: 'expedition_only',
    supports_compact: true,
    supports_advanced: true,
    supports_modes: ['expedition'],
    data_provides: ['gpx_demand', 'route_optimization', 'elevation_analysis'],
    render_ready: false,
    widget_status: 'unavailable',
  },

  // ── ADDABLE WIDGETS (User-selectable from Widget Library) ──
  {
    widget_id: 'ecoflow-power',
    display_name: 'EcoFlow Power',
    description: 'Live EcoFlow telemetry: battery SOC, solar input, output watts',
    icon: 'flash-outline',
    category: 'vehicle',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 7,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['ecoflow_battery', 'ecoflow_solar', 'ecoflow_output', 'ecoflow_input'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  // Phase 8: Unified ECS Power System Widget (Multi-Provider)
  {
    widget_id: 'ecs-power',
    display_name: 'Power Systems',
    description: 'Unified battery and house power status across connected ECS power providers',
    icon: 'battery-charging-outline',
    category: 'vehicle',
    default_size: '2x1',
    default_dashboard: false,
    default_position_order: 8,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['ecs_battery', 'ecs_solar', 'ecs_output', 'ecs_input', 'ecs_runtime', 'ecs_multi_provider'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  // Phase 9: OBD-II Vehicle Telemetry Widget
  {
    widget_id: 'vehicle-telemetry',
    display_name: 'Vehicle Telemetry',
    description: 'Live OBD-II vehicle data: RPM, coolant temp, battery voltage, fuel level, engine load, and diagnostics',
    icon: 'speedometer-outline',
    category: 'vehicle',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 9,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['engine_rpm', 'vehicle_speed', 'coolant_temp', 'battery_voltage', 'fuel_level', 'engine_load', 'throttle_position', 'obd_connection'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  // Phase 10: Terrain Risk Prediction Widget
  {
    widget_id: 'terrain-risk',
    display_name: 'Terrain Risk',
    description: 'Predictive terrain risk assessment: side slope, grade, rollover, traction, and route-ahead forecast from vehicle build and live attitude',
    icon: 'trail-sign-outline',
    category: 'safety',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 10,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'motion',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['terrain_risk_level', 'terrain_risk_score', 'side_slope_risk', 'steep_grade_risk', 'rollover_risk', 'traction_risk', 'route_ahead_risk', 'vehicle_capability'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  // Phase 5: Expedition Risk Engine Widget
  {
    widget_id: 'expedition-risk',
    display_name: 'Expedition Risk',
    description: 'Unified expedition risk assessment: combines terrain, remoteness, weather, vehicle condition, and resources into one intelligent risk signal with forward forecast',
    icon: 'shield-half-outline',
    category: 'safety',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 11,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['expedition_risk_level', 'expedition_risk_score', 'forward_risk_forecast', 'risk_categories', 'risk_advisories', 'vehicle_risk', 'resource_risk', 'isolation_risk'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  // Resource Forecast Widget — Expedition Resource Intelligence
  {
    widget_id: 'resource-forecast',
    display_name: 'Resource Forecast',
    description: 'Predictive resource sufficiency: fuel, water, and power forecast with terrain-adjusted consumption, weight penalties, solar charging, and expedition intelligence',
    icon: 'flask-outline',
    category: 'sustainment',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 12,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['resource_sufficiency', 'fuel_forecast', 'water_forecast', 'power_forecast', 'terrain_fuel_penalty', 'weight_fuel_penalty', 'solar_contribution', 'planning_estimate'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  // Trip Recorder Widget — Expedition Journey Recording
  {
    widget_id: 'trip-recorder',
    display_name: 'Trip Recorder',
    description: 'Automated expedition recording: GPS route trace, distance, speed, elevation, resource snapshots, and expedition events with offline-first persistence',
    icon: 'trail-sign-outline',
    category: 'mission',
    default_size: '1x1',
    default_dashboard: false,
    default_position_order: 13,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none',
    tab_scope: 'dashboard_only',
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'],
    data_provides: ['trip_recording_state', 'trip_distance', 'trip_duration', 'trip_speed', 'trip_elevation', 'trip_events', 'trip_route_points', 'trip_resource_snapshots'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },


  // ══════════════════════════════════════════════════════════
  // HIGHWAY WIDGETS — Dog Ear Dashboard Context
  // ══════════════════════════════════════════════════════════

  {
    widget_id: 'hwy-forward-weather',
    display_name: 'Weather',
    description: 'Current and near-term weather relevant to your route and operating area',
    icon: 'thunderstorm-outline',
    category: 'highway' as WidgetCategory,
    default_size: '1x1' as const,
    default_dashboard: false,
    default_position_order: 70,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none' as RequiredSensor,
    tab_scope: 'dashboard_only' as TabScope,
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'] as DashboardMode[],
    data_provides: ['storm_distance', 'wind_gusts', 'temp_change', 'storm_eta'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  {
    widget_id: 'hwy-daylight-remaining',
    display_name: 'Daylight Remaining',
    description: 'Travel awareness: daylight remaining, sunset, civil twilight',
    icon: 'sunny-outline',
    category: 'highway' as WidgetCategory,
    default_size: '1x1' as const,
    default_dashboard: false,
    default_position_order: 71,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none' as RequiredSensor,
    tab_scope: 'dashboard_only' as TabScope,
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['highway'] as DashboardMode[],
    data_provides: ['daylight_remaining', 'sunset_time', 'civil_twilight'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  {
    widget_id: 'hwy-cell-coverage',
    display_name: 'Comms / Signal',
    description: 'Retired dashboard widget reserved for migration compatibility',
    icon: 'cellular-outline',
    category: 'highway' as WidgetCategory,
    default_size: '1x1' as const,
    default_dashboard: false,
    default_position_order: 72,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none' as RequiredSensor,
    tab_scope: 'dashboard_only' as TabScope,
    supports_compact: true,
    supports_advanced: false,
    supports_modes: [] as DashboardMode[],
    data_provides: ['carrier', 'signal_strength', 'signal_loss_distance', 'dead_zone_distance'],
    render_ready: false,
    core_instrument: false,
    widget_status: 'disabled',
  },

  {
    widget_id: 'hwy-wind-monitor',
    display_name: 'Wind Monitor',
    description: 'Real-time wind speed, direction, and gust monitoring',
    icon: 'flag-outline',
    category: 'highway' as WidgetCategory,
    default_size: '1x1' as const,
    default_dashboard: false,
    default_position_order: 73,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none' as RequiredSensor,
    tab_scope: 'dashboard_only' as TabScope,
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['highway'] as DashboardMode[],
    data_provides: ['wind_speed', 'wind_direction', 'wind_gusts'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  {
    widget_id: 'hwy-elevation-profile',
    display_name: 'Elevation / Terrain',
    description: 'Wide terrain context with elevation, grade, wind, daylight, and sun-glare awareness',
    icon: 'trending-up-outline',
    category: 'highway' as WidgetCategory,
    default_size: '2x1' as const,
    default_dashboard: false,
    default_position_order: 74,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'gps' as RequiredSensor,
    tab_scope: 'dashboard_only' as TabScope,
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['expedition', 'highway'] as DashboardMode[],
    data_provides: ['elevation', 'grade', 'altitude_gain', 'wind_monitor', 'daylight_remaining', 'sun_glare'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  {
    widget_id: 'hwy-road-hazards',
    display_name: 'Road Hazards',
    description: 'Alerts for road hazards, construction, and closures ahead',
    icon: 'warning-outline',
    category: 'highway' as WidgetCategory,
    default_size: '1x1' as const,
    default_dashboard: false,
    default_position_order: 75,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none' as RequiredSensor,
    tab_scope: 'dashboard_only' as TabScope,
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['highway'] as DashboardMode[],
    data_provides: ['hazard_type', 'hazard_distance', 'hazard_severity'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  {
    widget_id: 'hwy-power-monitor',
    display_name: 'Power Monitor',
    description: 'Highway power systems: battery, alternator, and auxiliary power',
    icon: 'battery-charging-outline',
    category: 'highway' as WidgetCategory,
    default_size: '1x1' as const,
    default_dashboard: false,
    default_position_order: 76,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'none' as RequiredSensor,
    tab_scope: 'dashboard_only' as TabScope,
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['highway'] as DashboardMode[],
    data_provides: ['battery_voltage', 'alternator_output', 'aux_power'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },

  {
    widget_id: 'hwy-sun-glare',
    display_name: 'Sun Glare Forecast',
    description: 'Predict sun glare based on heading, time, and sun position',
    icon: 'eye-outline',
    category: 'highway' as WidgetCategory,
    default_size: '1x1' as const,
    default_dashboard: false,
    default_position_order: 77,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'gps' as RequiredSensor,
    tab_scope: 'dashboard_only' as TabScope,
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['highway'] as DashboardMode[],
    data_provides: ['glare_risk', 'sun_azimuth', 'sun_elevation', 'visor_advisory'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
  },
];





// ═══════════════════════════════════════════════════════════
// REGISTRY ACCESS FUNCTIONS
// ═══════════════════════════════════════════════════════════

/** Get a widget entry by ID. Returns undefined if not registered. */
export function getWidgetEntry(widgetId: string): WidgetRegistryEntry | undefined {
  return WIDGET_REGISTRY.find(w => w.widget_id === widgetId);
}

/** Check if a widget ID is registered */
export function isRegistered(widgetId: string): boolean {
  return WIDGET_REGISTRY.some(w => w.widget_id === widgetId);
}

/** Check if a widget is a core instrument */
export function isCoreInstrument(widgetId: string): boolean {
  return CORE_INSTRUMENT_IDS.includes(widgetId);
}

/** Get all core instrument entries, sorted by position order */
export function getCoreInstruments(): WidgetRegistryEntry[] {
  return WIDGET_REGISTRY
    .filter(w => w.core_instrument && w.render_ready)
    .sort((a, b) => a.default_position_order - b.default_position_order);
}

/** Get all default dashboard widgets, sorted by position order */
export function getDefaultDashboardWidgets(): WidgetRegistryEntry[] {
  return CURATED_DASHBOARD_WIDGET_IDS
    .map(widgetId => getWidgetEntry(widgetId))
    .filter((entry): entry is WidgetRegistryEntry => !!entry)
    .sort((a, b) => a.default_position_order - b.default_position_order);
}

export function getDefaultDashboardLayout(mode: DashboardMode): {
  gridLayout: '2x2';
  slots: DashboardWidgetTemplate[];
} {
  const layout = DEFAULT_DASHBOARD_LAYOUTS[mode];
  return {
    gridLayout: layout.gridLayout,
    slots: layout.slots.map(slot => ({ ...slot })),
  };
}

export function isCuratedDashboardWidget(widgetId: string): boolean {
  return CURATED_DASHBOARD_WIDGET_IDS.includes(widgetId);
}

export function isRetiredDashboardWidget(widgetId: string): boolean {
  return widgetId === 'hwy-cell-coverage';
}

export function getDashboardCatalogEntry(widgetId: string): DashboardCatalogEntry | undefined {
  return DASHBOARD_WIDGET_CATALOG.find(entry => entry.widgetId === widgetId);
}

export function getDashboardCatalogEntries(mode?: DashboardMode): DashboardCatalogEntry[] {
  return DASHBOARD_WIDGET_CATALOG
    .filter(entry => entry.pickerEnabled && (!mode || DASHBOARD_MODE_WIDGET_IDS[mode].includes(entry.widgetId)))
    .sort((a, b) => a.priority - b.priority);
}

export function getDashboardReplacementOrder(mode: DashboardMode): string[] {
  return getDashboardCatalogEntries(mode).map(entry => entry.widgetId);
}

export function getDashboardRecommendedSize(widgetId: string): DashboardWidgetFootprint {
  const recommended = getDashboardCatalogEntry(widgetId)?.recommendedWidgetSize
    ?? getWidgetEntry(widgetId)?.default_size
    ?? '1x1';
  return normalizeFixedDashboardWidgetSize(widgetId, recommended);
}

export function getDashboardSupportedSizes(widgetId: string): DashboardWidgetFootprint[] {
  const entry = getDashboardCatalogEntry(widgetId);
  const supported = entry ? [...entry.supportedWidgetSizes] : [getDashboardRecommendedSize(widgetId)];
  const fixed = supported
    .map((size) => normalizeFixedDashboardWidgetSize(widgetId, size))
    .filter((size, index, list) => list.indexOf(size) === index);
  return fixed.length > 0 ? fixed : [normalizeFixedDashboardWidgetSize(widgetId)];
}

export function normalizeFixedDashboardWidgetSize(
  widgetId: string,
  requestedSize?: DashboardWidgetFootprint | null,
): FixedDashboardWidgetFootprint {
  if (widgetId === 'attitude-command') return '2x2';
  if (widgetId === 'attitude-monitor' || widgetId === 'navigate-surface') return '2x1';

  const requested =
    requestedSize ??
    getDashboardCatalogEntry(widgetId)?.recommendedWidgetSize ??
    getWidgetEntry(widgetId)?.default_size ??
    '1x1';

  if (requested === '2x2') return '2x2';
  if (requested === '2x1') return '2x1';
  return '1x1';
}

export function normalizeDashboardWidgetSize(
  widgetId: string,
  requestedSize?: DashboardWidgetFootprint | null,
): DashboardWidgetFootprint {
  const fixedRequested = normalizeFixedDashboardWidgetSize(widgetId, requestedSize);
  const supported = getDashboardSupportedSizes(widgetId);
  if (supported.includes(fixedRequested)) {
    return fixedRequested;
  }
  return supported[0] ?? getDashboardRecommendedSize(widgetId);
}

export function canResizeDashboardWidget(widgetId: string): boolean {
  const entry = getDashboardCatalogEntry(widgetId);
  return entry ? entry.userResizable && entry.supportedWidgetSizes.length > 1 : false;
}

export function isCuratedWidgetForMode(widgetId: string, mode: DashboardMode): boolean {
  if (DASHBOARD_MODE_WIDGET_IDS[mode].includes(widgetId)) return true;
  return false;
}

/** Get all widgets available for a given tab scope */
export function getWidgetsForScope(
  scope: TabScope,
  advancedModeEnabled: boolean = false,
): WidgetRegistryEntry[] {
  return WIDGET_REGISTRY.filter(w => {
    // Must be render-ready
    if (!w.render_ready) return false;

    // Tab scope filter
    if (w.tab_scope !== scope && w.tab_scope !== 'global') return false;

    // Advanced mode gate
    if (w.requires_advanced_mode && !advancedModeEnabled) return false;

    return true;
  });
}

/**
 * Get widgets available for the Dashboard tab's widget library.
 *
 * Phase 10: Instrument Cluster Lock — only core instruments
 * are available for the dashboard. All other widgets have been
 * retired and their triggers converted to timeline events.
 */
export function getDashboardLibraryWidgets(
  advancedModeEnabled: boolean = false,
  mode?: DashboardMode,
): WidgetRegistryEntry[] {
  const priorityMap = new Map(
    getDashboardCatalogEntries(mode).map(entry => [entry.widgetId, entry.priority]),
  );

  return WIDGET_REGISTRY
    .filter(w => {
      if (!w.render_ready) return false;
      if (w.widget_status === 'disabled' || w.widget_status === 'unavailable') return false;
      if (w.requires_advanced_mode && !advancedModeEnabled) return false;
      if (!isCuratedDashboardWidget(w.widget_id)) return false;
      if (mode && !isCuratedWidgetForMode(w.widget_id, mode)) return false;
      return true;
    })
    .map((entry) => ({
      ...entry,
      default_size: normalizeFixedDashboardWidgetSize(entry.widget_id, entry.default_size),
    }))
    .sort((a, b) => {
      const leftPriority = priorityMap.get(a.widget_id) ?? a.default_position_order ?? 999;
      const rightPriority = priorityMap.get(b.widget_id) ?? b.default_position_order ?? 999;
      return leftPriority - rightPriority;
    });
}

export function validateCuratedDashboardConfig(): string[] {
  const issues: string[] = [];
  const curatedUniqueIds = new Set(CURATED_DASHBOARD_WIDGET_IDS);
  const pickerEntries = DASHBOARD_WIDGET_CATALOG.filter(entry => entry.pickerEnabled);
  const catalogIds = pickerEntries.map(entry => entry.widgetId);

  if (CURATED_DASHBOARD_WIDGET_IDS.length !== 8) {
    issues.push(`Expected 8 curated dashboard widgets, found ${CURATED_DASHBOARD_WIDGET_IDS.length}.`);
  }
  if (curatedUniqueIds.size !== CURATED_DASHBOARD_WIDGET_IDS.length) {
    issues.push('Curated dashboard widget IDs contain duplicates.');
  }
  if (new Set(catalogIds).size !== catalogIds.length) {
    issues.push('Dashboard catalog contains duplicate widget IDs.');
  }

  for (const widgetId of CURATED_DASHBOARD_WIDGET_IDS) {
    const entry = getWidgetEntry(widgetId);
    if (!entry) {
      issues.push(`Curated widget "${widgetId}" is not registered.`);
      continue;
    }
    if (!entry.render_ready) {
      issues.push(`Curated widget "${widgetId}" is not render_ready.`);
    }
  }

  const expeditionDefault = DEFAULT_DASHBOARD_LAYOUTS.expedition.slots;
  if (expeditionDefault.length > 4) {
    issues.push(`Expedition default must fit inside 4 dashboard slots, found ${expeditionDefault.length}.`);
  }
  if (!expeditionDefault.some(slot => slot.widgetId === 'attitude-monitor' || slot.widgetId === 'attitude-command')) {
    issues.push('Expedition default must include an Attitude instrument.');
  }

  for (const mode of Object.keys(DEFAULT_DASHBOARD_LAYOUTS) as DashboardMode[]) {
    for (const slot of DEFAULT_DASHBOARD_LAYOUTS[mode].slots) {
      if (!isCuratedWidgetForMode(slot.widgetId, mode)) {
        issues.push(`Default ${mode} widget "${slot.widgetId}" is not allowed in ${mode} mode.`);
      }
    }
  }

  const priorities = pickerEntries.map(entry => entry.priority).sort((a, b) => a - b);
  for (let i = 0; i < priorities.length; i += 1) {
    if (priorities[i] !== i + 1) {
      issues.push('Dashboard widget priorities must form a complete 1-8 ranking.');
      break;
    }
  }

  return issues;
}


// ═══════════════════════════════════════════════════════════
// REDUNDANCY DETECTION ENGINE
// ═══════════════════════════════════════════════════════════

export interface RedundancyWarning {
  widget_id: string;
  overlapping_widget_id: string;
  overlapping_fields: string[];
  message: string;
}

/**
 * Check if adding a widget would create data redundancy with already-assigned widgets.
 * Returns warnings (not blockers) — user can still add the widget.
 */
export function checkRedundancy(
  candidateWidgetId: string,
  assignedWidgetIds: string[],
): RedundancyWarning[] {
  const candidate = getWidgetEntry(candidateWidgetId);
  if (!candidate) return [];

  const warnings: RedundancyWarning[] = [];

  for (const assignedId of assignedWidgetIds) {
    if (!assignedId) continue;
    const assigned = getWidgetEntry(assignedId);
    if (!assigned) continue;

    // Find overlapping data fields
    const overlap = candidate.data_provides.filter(field =>
      assigned.data_provides.includes(field)
    );

    if (overlap.length >= 2) {
      warnings.push({
        widget_id: candidateWidgetId,
        overlapping_widget_id: assignedId,
        overlapping_fields: overlap,
        message: `This data is already visible in ${assigned.display_name}.`,
      });
    }
  }

  return warnings;
}

/**
 * Check if a widget_id is already placed (duplicate prevention).
 * Returns true if duplicate would occur.
 */
export function isDuplicate(widgetId: string, assignedWidgetIds: (string | null)[]): boolean {
  return assignedWidgetIds.filter(id => id === widgetId).length > 0;
}

// ═══════════════════════════════════════════════════════════
// REMOVAL RULES
// ═══════════════════════════════════════════════════════════

/** Check if a widget can be removed — all widgets are now user-manageable */
export function canRemoveWidget(_widgetId: string): boolean {
  // All widgets are removable — no locked state
  return true;
}



/**
 * Check if all widgets have been removed from a profile.
 * Returns true if dashboard is empty and should prompt for restore.
 */
export function isDashboardEmpty(assignedWidgetIds: (string | null)[]): boolean {
  return assignedWidgetIds.every(id => id === null);
}

// ═══════════════════════════════════════════════════════════
// CATEGORY LABELS
// ═══════════════════════════════════════════════════════════

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
  vehicle: 'VEHICLE',
  mission: 'MISSION',
  safety: 'SAFETY',
  sustainment: 'SUSTAINABILITY',
  loadout: 'LOADOUT',
  system: 'SYSTEM',
  custom: 'CUSTOM',
  highway: 'HIGHWAY',
};

/** Get ordered category keys for display in the widget library */
export function getLibraryCategoryOrder(): WidgetCategory[] {
  return ['vehicle', 'mission', 'safety', 'sustainment', 'loadout', 'system', 'highway'];
}



// ═══════════════════════════════════════════════════════════
// STABILIZATION PHASE 1: RUNTIME STATUS RESOLUTION
// ═══════════════════════════════════════════════════════════

/**
 * Resolve the runtime status of a widget.
 *
 * Checks the registry's static widget_status, then applies runtime
 * conditions such as sensor availability and telemetry connectivity.
 *
 * Priority:
 *   1. If render_ready is false → 'unavailable'
 *   2. If widget_status is 'disabled' → 'disabled'
 *   3. If requires_sensor is 'motion' and hasSensorAccess is false → 'awaiting_data'
 *   4. If requires_sensor is 'gps' and hasGpsAccess is false → 'awaiting_data'
 *   5. Otherwise → widget_status (usually 'active')
 */
export function resolveWidgetStatus(
  widgetId: string,
  context?: {
    hasSensorAccess?: boolean;
    hasGpsAccess?: boolean;
    hasDeviceConnected?: boolean;
  },
): WidgetStatus {
  const entry = getWidgetEntry(widgetId);
  if (!entry) return 'unavailable';
  if (!entry.render_ready) return 'unavailable';
  if (entry.widget_status === 'disabled') return 'disabled';

  const ctx = context || {};

  // Sensor-dependent status resolution
  if (entry.requires_sensor === 'motion' && ctx.hasSensorAccess === false) {
    return 'awaiting_data';
  }
  if (entry.requires_sensor === 'gps' && ctx.hasGpsAccess === false) {
    return 'awaiting_data';
  }

  // EcoFlow / telemetry-dependent widgets
  if (entry.widget_id === 'ecoflow-power' && ctx.hasDeviceConnected === false) {
    return 'awaiting_data';
  }

  return entry.widget_status;
}

/**
 * Get all widgets with a specific runtime status.
 */
export function getWidgetsByStatus(status: WidgetStatus): WidgetRegistryEntry[] {
  return WIDGET_REGISTRY.filter(w => w.widget_status === status);
}

/**
 * Validate that all widget IDs in a layout are registered.
 * Returns an array of invalid widget IDs that should be removed.
 *
 * Stabilization Phase 1: Prevents "Unknown Widget" from ever appearing.
 */
export function validateLayoutWidgets(widgetIds: (string | null)[]): string[] {
  const invalid: string[] = [];
  for (const id of widgetIds) {
    if (id && !isRegistered(id)) {
      invalid.push(id);
      console.warn(`[WidgetRegistry] Invalid widget ID in layout: "${id}" — not registered. Removing.`);
    }
  }
  return invalid;
}

/**
 * Audit the widget registry for consistency.
 * Logs warnings for any issues found.
 *
 * Stabilization Phase 1: Called once at app startup.
 */
export function auditWidgetRegistry(): void {
  const curatedIssues = validateCuratedDashboardConfig();
  for (const issue of curatedIssues) {
    console.warn(`[WidgetRegistry] ${issue}`);
  }

  const ids = new Set<string>();
  for (const entry of WIDGET_REGISTRY) {
    // Check for duplicate IDs
    if (ids.has(entry.widget_id)) {
      console.warn(`[WidgetRegistry] Duplicate widget_id: "${entry.widget_id}"`);
    }
    ids.add(entry.widget_id);

    // Check render_ready / widget_status consistency
    if (!entry.render_ready && entry.widget_status !== 'unavailable') {
      console.warn(
        `[WidgetRegistry] Widget "${entry.widget_id}" is not render_ready but status is "${entry.widget_status}" — should be "unavailable".`
      );
    }

    // Check core instruments have render_ready
    if (entry.core_instrument && !entry.render_ready) {
      console.warn(
        `[WidgetRegistry] Core instrument "${entry.widget_id}" is not render_ready — this will break the dashboard.`
      );
    }
  }
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(`[WidgetRegistry] Audit complete: ${WIDGET_REGISTRY.length} widgets, ${ids.size} unique IDs.`);
  }
}




// ═══════════════════════════════════════════════════════════
// STABILIZATION PHASE 7: TELEMETRY AVAILABILITY BRIDGE
// ═══════════════════════════════════════════════════════════

import type { TelemetryAvailability, TelemetryContext } from './telemetryStateEngine';
import { evaluateTelemetryState, getPlaceholderContent, hasTelemetryDependency } from './telemetryStateEngine';

/**
 * Phase 7: Resolve the telemetry availability state for a widget.
 *
 * Bridges the widget registry with the telemetry state engine.
 * Returns 'connected' for widgets with no telemetry dependency.
 *
 * @param widgetId  - The widget identifier
 * @param context   - Runtime telemetry context
 * @returns TelemetryAvailability state
 */
export function resolveWidgetTelemetryState(
  widgetId: string,
  context: TelemetryContext,
): TelemetryAvailability {
  // Non-registered widgets → unavailable
  const entry = getWidgetEntry(widgetId);
  if (!entry) return 'unavailable';
  if (!entry.render_ready) return 'unavailable';

  // Widgets with no telemetry dependency → always connected
  if (!hasTelemetryDependency(widgetId)) return 'connected';

  // Delegate to telemetry state engine
  return evaluateTelemetryState(widgetId, context);
}

/**
 * Phase 7: Get placeholder content for a widget's current telemetry state.
 *
 * Returns null if the widget is connected (no placeholder needed).
 */
export function getWidgetPlaceholder(
  widgetId: string,
  context: TelemetryContext,
): ReturnType<typeof getPlaceholderContent> | null {
  const state = resolveWidgetTelemetryState(widgetId, context);
  if (state === 'connected') return null;
  return getPlaceholderContent(widgetId, state);
}


// ═══════════════════════════════════════════════════════════
// INTEGRATION PASS 2: ECS BUS-AWARE STATUS RESOLUTION
// ═══════════════════════════════════════════════════════════

import { WIDGET_CHANNEL_MAP, getWidgetFreshness } from './ecsWidgetBridge';
import type { EcsFreshness } from './ecsSyncTypes';

/**
 * Integration Pass 2: ECS channel dependencies for a widget.
 *
 * Returns the list of ECS bus channels this widget depends on.
 * Used by the dashboard to determine which systems affect which widgets.
 */
export function getWidgetEcsChannels(widgetId: string): string[] {
  return WIDGET_CHANNEL_MAP[widgetId] || [];
}

/**
 * Integration Pass 2: Resolve widget status with ECS bus freshness awareness.
 *
 * Extends resolveWidgetStatus with ECS bus data freshness checks.
 * If the widget's dependent ECS channels are all unavailable,
 * returns 'awaiting_data' even if the widget is otherwise 'active'.
 *
 * Priority:
 *   1. Base resolveWidgetStatus checks (render_ready, disabled, sensor)
 *   2. ECS bus channel freshness check
 *   3. If all channels unavailable → 'awaiting_data'
 *   4. Otherwise → base status
 */
export function resolveWidgetStatusWithBus(
  widgetId: string,
  context?: {
    hasSensorAccess?: boolean;
    hasGpsAccess?: boolean;
    hasDeviceConnected?: boolean;
  },
): WidgetStatus {
  // Start with base status resolution
  const baseStatus = resolveWidgetStatus(widgetId, context);

  // If already non-active, don't override
  if (baseStatus !== 'active') return baseStatus;

  // Check ECS bus channel freshness
  const channels = WIDGET_CHANNEL_MAP[widgetId] || [];
  if (channels.length === 0) return baseStatus; // No ECS dependency

  const freshness = getWidgetFreshness(widgetId);

  // If ALL channels are unavailable, widget is awaiting data
  if (!freshness.has_data && freshness.freshness === 'unavailable') {
    return 'awaiting_data';
  }

  return baseStatus;
}

/**
 * Integration Pass 2: Get the ECS bus freshness for a widget.
 *
 * Returns the overall freshness state considering all dependent channels.
 * Widgets with no ECS dependencies always return 'live'.
 */
export function getWidgetBusFreshness(widgetId: string): EcsFreshness {
  const channels = WIDGET_CHANNEL_MAP[widgetId] || [];
  if (channels.length === 0) return 'live';
  return getWidgetFreshness(widgetId).freshness;
}
