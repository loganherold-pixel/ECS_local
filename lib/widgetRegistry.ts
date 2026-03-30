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
  default_size: '1x1' | '1x2';
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
// CORE 6 INSTRUMENT IDS — Canonical list
// ═══════════════════════════════════════════════════════════
export const CORE_INSTRUMENT_IDS: readonly string[] = [
  'vehicle-systems',
  'attitude-monitor',
  'remoteness',
  'progress',
  'sustainability',
  'vehicle-twin',
] as const;

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
    description: 'At-a-glance mission health: load, balance, fuel, water, power',
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
    data_provides: ['total_load', 'front_axle', 'rear_axle', 'cg_height', 'fuel_range', 'water_level', 'power_remaining', 'endurance'],
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
    default_size: '1x2',
    default_dashboard: true,
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

  // 4) Progress — Route Status
  {
    widget_id: 'progress',
    display_name: 'Progress',
    description: 'Distance and route snapshot with completion tracking',
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

  // 5) Sustainability — Resource Awareness
  {
    widget_id: 'sustainability',
    display_name: 'Sustainability',
    description: 'Combined fuel and water overview with days-remaining projections',
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
    supports_modes: ['expedition', 'highway'],
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
    display_name: 'ECS Power Systems',
    description: 'Unified expedition energy monitor: all connected battery and power providers in one tactical widget',
    icon: 'battery-charging-outline',
    category: 'vehicle',
    default_size: '1x1',
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
    display_name: 'Forward Weather',
    description: 'Predict weather conditions along your route: storms, wind, temperature',
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
    supports_modes: ['highway'] as DashboardMode[],
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
    display_name: 'Cell Coverage',
    description: 'Predict signal availability: carrier, signal loss distance, dead zones',
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
    supports_modes: ['highway'] as DashboardMode[],
    data_provides: ['carrier', 'signal_strength', 'signal_loss_distance', 'dead_zone_distance'],
    render_ready: true,
    core_instrument: false,
    widget_status: 'active',
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
    display_name: 'Elevation Profile',
    description: 'Road elevation profile with grade and altitude tracking',
    icon: 'trending-up-outline',
    category: 'highway' as WidgetCategory,
    default_size: '1x1' as const,
    default_dashboard: false,
    default_position_order: 74,
    removable: true,
    requires_advanced_mode: false,
    requires_sensor: 'gps' as RequiredSensor,
    tab_scope: 'dashboard_only' as TabScope,
    supports_compact: true,
    supports_advanced: false,
    supports_modes: ['highway'] as DashboardMode[],
    data_provides: ['elevation', 'grade', 'altitude_gain'],
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
  // Phase 10: Default dashboard = core instruments only
  return getCoreInstruments();
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
export function getDashboardLibraryWidgets(advancedModeEnabled: boolean = false): WidgetRegistryEntry[] {
  return WIDGET_REGISTRY.filter(w => {
    if (!w.render_ready) return false;
    // Core instruments + addable dashboard widgets (e.g. ecoflow-power)
    if (w.core_instrument) return true;
    if (w.tab_scope === 'dashboard_only' && w.removable) return true;
    return false;
  });
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
  sustainment: 'SUSTAINMENT',
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
  console.log(`[WidgetRegistry] Audit complete: ${WIDGET_REGISTRY.length} widgets, ${ids.size} unique IDs.`);
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

