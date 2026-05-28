export interface Trip {
  id: string;
  user_id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  terrain_type: string | null;
  season: string | null;
  team_size: number;
  primary_vehicle: string | null;
  route_distance_miles: number | null;
  avg_miles_per_day: number | null;
  active_mode: string;
  capac_fuel_gal: number | null;
  capac_mpg: number | null;
  capac_water_gal: number | null;
  water_use_per_person_day: number | null;
  battery_usable_wh: number | null;
  solar_watts: number | null;
  sun_hours_per_day: number | null;
  solar_efficiency: number;
  emergency_contact: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty?: boolean | number;
}

export interface RiskScore {
  id: string;
  user_id: string;
  trip_id: string;
  terrain_complexity: number;
  weather_exposure: number;
  remoteness: number;
  recovery_availability: number;
  comms_coverage: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty?: boolean | number;
}

export interface LoadItem {
  id: string;
  user_id: string;
  trip_id: string;
  name: string;
  zone: string;
  qty: number;
  packed: boolean;
  mode: string;
  weight_lbs: number | null;
  notes: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty?: boolean | number;
}

export interface LoadMapSlot {
  id: string;
  user_id: string;
  trip_id: string;
  zone: string;
  slot_key: string;
  load_item_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty?: boolean | number;
}

export interface FuelWaterLog {
  id: string;
  user_id: string;
  trip_id: string;
  log_date: string;
  fuel_remaining_gal: number | null;
  water_remaining_gal: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty?: boolean | number;
}



export interface Waypoint {
  id: string;
  user_id: string;
  trip_id: string;
  latitude: number;
  longitude: number;
  altitude: number | null;
  speed: number | null;
  heading: number | null;
  accuracy: number | null;
  recorded_at: string;
  session_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  dirty?: boolean | number;
}

export interface UserSettings {
  user_id: string;
  roof_load_threshold_lbs: number;
  roof_share_warn: number;
  roof_share_alert: number;
  created_at: string;
  updated_at: string;
}

export type SyncStatus = 'offline' | 'syncing' | 'synced' | 'error';

export interface TripKPIs {
  missionDuration: number | null;
  dailyFuelUse: number | null;
  fuelDays: number | null;
  waterDays: number | null;
  solarDailyReturn: number | null;
  powerSustainable: boolean;
  powerDays: number | null;
}

export interface RiskResult {
  score: number;
  level: 'Low' | 'Moderate' | 'Elevated' | 'High';
}

export interface RouteStats {
  totalDistanceMiles: number;
  plannedDistanceMiles: number | null;
  completionPct: number | null;
  waypointCount: number;
  avgSpeedMph: number | null;
  maxAltitudeFt: number | null;
  elapsedTimeHrs: number | null;
  sessionCount: number;
}


// ============================================================
// EXPEDITION & VEHICLE TYPES
// ============================================================

export type ExpeditionStatus = 'planning' | 'active' | 'completed' | 'aborted';

export interface Vehicle {
  id: string;
  owner_user_id: string;
  name: string;
  type: string;
  make: string | null;
  model: string | null;
  year: number | null;
  notes: string | null;
  fuel_tank_capacity_gal: number | null;
  avg_mpg: number | null;
  current_fuel_percent: number | null;
  water_capacity_gal: number | null;
  current_water_gal: number | null;
  water_updated_at: string | null;
  battery_usable_wh?: number | null;
  /** Local Fleet spec mirrors keep advanced/readiness inputs attached to the vehicle record without requiring cloud columns. */
  fuel_type?: 'diesel' | 'gas' | null;
  base_weight_lb?: number | null;
  curb_weight_lb?: number | null;
  empty_weight_lb?: number | null;
  gvwr_lb?: number | null;
  front_base_weight_lb?: number | null;
  rear_base_weight_lb?: number | null;
  front_gawr_lb?: number | null;
  rear_gawr_lb?: number | null;
  wheelbase_in?: number | null;
  tire_size_inches?: number | null;
  tire_width_inches?: number | null;
  wheel_diameter_inches?: number | null;
  tire_model?: string | null;
  suspension_lift_inches?: number | null;
  is_leveled?: boolean | null;
  /** Front-only leveling amount, separate from total suspension lift. */
  front_level_inches?: number | null;
  ground_clearance_inches?: number | null;
  overall_length_in?: number | null;
  overall_width_in?: number | null;
  overall_height_in?: number | null;
  track_width_front_in?: number | null;
  track_width_rear_in?: number | null;
  approach_angle_deg?: number | null;
  breakover_angle_deg?: number | null;
  departure_angle_deg?: number | null;
  turning_diameter_ft?: number | null;
  created_at: string;
  updated_at: string;
}


export interface Expedition {
  id: string;
  owner_user_id: string;
  title: string;
  vehicle_id: string | null;
  loadout_id: string | null;
  status: ExpeditionStatus;
  start_at: string | null;
  end_at: string | null;
  primary_contact: string | null;
  comms_plan: string | null;
  objectives: string | null;
  hazards: string | null;
  notes: string | null;
  water_daily_use_gal: number | null;
  people_count: number;
  water_gal_per_person_per_day: number;
  water_daily_use_override: boolean;
  // Route & position fields
  route_name: string | null;
  route_notes: string | null;
  start_waypoint_id: string | null;
  current_lat: number | null;
  current_lon: number | null;
  current_position_updated_at: string | null;
  created_at: string;
  updated_at: string;
  // Joined vehicle fields
  vehicles?: {
    name: string;
    fuel_tank_capacity_gal: number | null;
    avg_mpg: number | null;
    current_fuel_percent: number | null;
    water_capacity_gal: number | null;
    current_water_gal: number | null;
    water_updated_at: string | null;
  } | null;
}





export interface ExpeditionInsert {
  title: string;
  vehicle_id?: string | null;
  loadout_id?: string | null;
  status?: ExpeditionStatus;
  start_at?: string | null;
  end_at?: string | null;
  primary_contact?: string | null;
  comms_plan?: string | null;
  objectives?: string | null;
  hazards?: string | null;
  owner_user_id: string;
}

// ============================================================
// EXPEDITION WAYPOINTS
// ============================================================
export type WaypointType = 'stop' | 'camp' | 'resupply' | 'poi' | 'hazard' | 'water' | 'fuel';

export interface ExpeditionWaypoint {
  id: string;
  expedition_id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  latitude: number | null;
  longitude: number | null;
  elevation_ft: number | null;
  order_index: number;
  waypoint_type: WaypointType;
  eta: string | null;
  water_resupply_gal: number | null;
  is_primary_resupply: boolean;
  created_at: string;
  updated_at: string;
}

// ============================================================
// ROUTE SEGMENTS & SUMMARY
// ============================================================

export interface RouteSegment {
  id: string;
  expedition_id: string;
  from_waypoint_id: string | null;
  to_waypoint_id: string | null;
  order_index: number;
  distance_miles: number | null;
  estimated_time_hours: number | null;
  terrain_type: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RouteSummary {
  id: string;
  expedition_id: string;
  total_planned_miles: number | null;
  total_segments: number | null;
  total_estimated_hours: number | null;
  last_computed_at: string | null;
  created_at: string;
  updated_at: string;
}



// ============================================================
// LOADOUTS (v2 — Tactical Loadout Builder)
// ============================================================

export type LoadoutMode = 'trip' | 'daily';
export type OperatingProfile = 'weekend' | 'solo' | 'family' | 'sar';

export type LoadoutItemCategory =
  | 'water' | 'food' | 'power' | 'medical' | 'recovery'
  | 'tools' | 'shelter' | 'comms' | 'navigation' | 'clothing' | 'general';

export const LOADOUT_CATEGORIES: LoadoutItemCategory[] = [
  'water', 'food', 'power', 'medical', 'recovery',
  'tools', 'shelter', 'comms', 'navigation', 'clothing', 'general',
];

export const CATEGORY_ICONS: Record<LoadoutItemCategory, string> = {
  water: 'water-outline',
  food: 'restaurant-outline',
  power: 'battery-charging-outline',
  medical: 'medkit-outline',
  recovery: 'construct-outline',
  tools: 'hammer-outline',
  shelter: 'home-outline',
  comms: 'radio-outline',
  navigation: 'compass-outline',
  clothing: 'shirt-outline',
  general: 'cube-outline',
};

export const CATEGORY_COLORS: Record<LoadoutItemCategory, string> = {
  water: '#4FC3F7',
  food: '#FFB74D',
  power: '#FFD54F',
  medical: '#EF5350',
  recovery: '#AB47BC',
  tools: '#78909C',
  shelter: '#66BB6A',
  comms: '#42A5F5',
  navigation: '#26A69A',
  clothing: '#8D6E63',
  general: '#9E9E9E',
};

export const OPERATING_PROFILE_LABELS: Record<OperatingProfile, string> = {
  weekend: 'Weekend Overland',
  solo: 'Hardcore Solo Remote',
  family: 'Family / Group',
  sar: 'SAR / Preparedness',
};

export const OPERATING_PROFILE_DESCRIPTIONS: Record<OperatingProfile, string> = {
  weekend: 'Balanced essentials for short trips with comfort and redundancy.',
  solo: 'Survival-biased loadout. Critical items emphasized.',
  family: 'Consumption-scaled packing. Water/food quantities typically higher.',
  sar: 'Rapid deployment kit. Critical readiness prioritized.',
};

export const OPERATING_PROFILE_COLORS: Record<OperatingProfile, string> = {
  weekend: '#66BB6A',
  solo: '#EF5350',
  family: '#42A5F5',
  sar: '#FFB74D',
};

export type LoadoutViewMode = 'basic' | 'advanced';

export interface Loadout {
  id: string;
  owner_user_id: string;
  vehicle_id?: string | null;
  name: string;
  description: string | null;
  mode: LoadoutMode;
  operating_profile: OperatingProfile | null;
  people_count: number | null;
  trip_length_days: number | null;
  total_weight_lbs: number | null;
  item_count: number;
  loadout_view_mode: LoadoutViewMode;
  created_at: string;
  updated_at: string;
  // Computed fields (not in DB, added client-side)
  _item_count?: number;
  _critical_count?: number;
  _packed_count?: number;
  _readiness_pct?: number;
}



export type WeightSource = 'manufacturer' | 'measured' | 'estimate';

export interface LoadoutItem {
  id: string;
  loadout_id: string;
  owner_user_id: string;
  name: string;
  category: LoadoutItemCategory;
  quantity: number;
  is_critical: boolean;
  is_packed: boolean;
  storage_location: string | null;
  notes: string | null;
  weight_lbs: number | null;
  /** Weight accuracy source: manufacturer, measured, or estimate */
  weight_source: WeightSource;
  sort_order: number;
  created_at: string;
  updated_at: string;
}


export interface LoadoutInsert {
  name: string;
  owner_user_id: string;
  mode: LoadoutMode;
  operating_profile?: OperatingProfile | null;
  people_count?: number;
  trip_length_days?: number;
  description?: string | null;
}

export interface LoadoutItemInsert {
  loadout_id: string;
  owner_user_id: string;
  name: string;
  category?: LoadoutItemCategory;
  quantity?: number;
  is_critical?: boolean;
  storage_location?: string | null;
  notes?: string | null;
  weight_lbs?: number | null;
  sort_order?: number;
}


// ============================================================
// TRIP CHECKLISTS
// ============================================================

export interface TripChecklist {
  id: string;
  expedition_id: string;
  owner_user_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
  items?: TripChecklistItem[];
}

export interface TripChecklistItem {
  id: string;
  checklist_id: string;
  owner_user_id: string;
  label: string;
  is_done: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// ============================================================
// TRIP LOGS (FIELD LOG)
// ============================================================

export type LogType = 'note' | 'observation' | 'incident' | 'weather' | 'camp' | 'mechanical';

export interface TripLog {
  id: string;
  expedition_id: string;
  owner_user_id: string;
  title: string | null;
  body: string;
  log_type: LogType;
  logged_at: string;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// ATTACHMENTS
// ============================================================

export type AttachmentCategory = 'general' | 'map' | 'photo' | 'document' | 'permit' | 'receipt';

export interface Attachment {
  id: string;
  expedition_id: string;
  owner_user_id: string;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string;
  description: string | null;
  category: AttachmentCategory;
  created_at: string;
  updated_at: string;
}

// ============================================================
// VEHICLE ZONES (EXPANDED with position + weight data)
// ============================================================


export type VehicleZoneType = 'area' | 'container' | 'slot' | 'drawer' | 'rack' | 'hitch';

export interface VehicleZone {
  id: string;
  vehicle_id: string;
  parent_zone_id: string | null;
  owner_user_id: string;
  name: string;
  zone_type: VehicleZoneType;
  slot_count: number;
  color: string | null;
  icon: string | null;
  sort_order: number;
  notes: string | null;
  /** Default position X (relative to wheelbase center, normalized 0–1) */
  default_position_x: number | null;
  /** Default position Y (relative to vehicle centerline, normalized -1 to 1) */
  default_position_y: number | null;
  /** Default position Z (height estimate, normalized 0–1) */
  default_position_z: number | null;
  /** Zone weight total (lbs) — user-settable for CG computation */
  zone_weight_total: number | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleZoneTreeNode {
  id: string;
  name: string;
  zone_type: string;
  slot_count: number;
  color: string | null;
  icon: string | null;
  sort_order: number;
  notes: string | null;
  depth: number;
  children: VehicleZoneTreeNode[];
}


