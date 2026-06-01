/**
 * Custom Widget Store
 *
 * Manages user-created dashboard widgets.
 * Persisted to localStorage. Each custom widget has:
 * - Unique ID (custom-<timestamp>)
 * - Name, icon, description
 * - Data fields to display (from trip, vehicle, loadout sources)
 * - Threshold color rules (green/amber/red)
 */

import { getActiveVehicleContext } from './activeVehicleContext';

// ── Data Field Definitions ─────────────────────────────

export type DataSource = 'trip' | 'vehicle' | 'loadout';
export type FieldFormat = 'number' | 'text' | 'percentage' | 'days' | 'miles' | 'gallons' | 'watts';

export interface DataFieldOption {
  source: DataSource;
  field: string;
  label: string;
  format: FieldFormat;
  unit?: string;
}

/** All available data fields users can pick from */
export const AVAILABLE_DATA_FIELDS: DataFieldOption[] = [
  // Trip fields
  { source: 'trip', field: 'team_size', label: 'Team Size', format: 'number' },
  { source: 'trip', field: 'terrain_type', label: 'Terrain Type', format: 'text' },
  { source: 'trip', field: 'season', label: 'Season', format: 'text' },
  { source: 'trip', field: 'route_distance_miles', label: 'Route Distance', format: 'miles', unit: 'mi' },
  { source: 'trip', field: 'avg_miles_per_day', label: 'Avg Miles/Day', format: 'miles', unit: 'mi/day' },
  { source: 'trip', field: 'active_mode', label: 'Active Mode', format: 'text' },
  { source: 'trip', field: 'emergency_contact', label: 'Emergency Contact', format: 'text' },

  // Vehicle / Fuel fields
  { source: 'vehicle', field: 'capac_fuel_gal', label: 'Fuel Capacity', format: 'gallons', unit: 'gal' },
  { source: 'vehicle', field: 'capac_mpg', label: 'Fuel Economy (MPG)', format: 'number', unit: 'mpg' },
  { source: 'vehicle', field: 'primary_vehicle', label: 'Vehicle Name', format: 'text' },
  { source: 'vehicle', field: 'fuel_range_miles', label: 'Fuel Range', format: 'miles', unit: 'mi' },
  { source: 'vehicle', field: 'fuel_days', label: 'Fuel Days', format: 'days', unit: 'days' },

  // Water fields
  { source: 'vehicle', field: 'capac_water_gal', label: 'Water Capacity', format: 'gallons', unit: 'gal' },
  { source: 'vehicle', field: 'water_use_per_person_day', label: 'Water Use/Person/Day', format: 'gallons', unit: 'gal' },
  { source: 'vehicle', field: 'water_days', label: 'Water Days Supply', format: 'days', unit: 'days' },

  // Power fields
  { source: 'vehicle', field: 'battery_usable_wh', label: 'Battery Capacity', format: 'watts', unit: 'Wh' },
  { source: 'vehicle', field: 'solar_watts', label: 'Solar Panel Watts', format: 'watts', unit: 'W' },
  { source: 'vehicle', field: 'sun_hours_per_day', label: 'Sun Hours/Day', format: 'number', unit: 'hrs' },
  { source: 'vehicle', field: 'solar_daily_wh', label: 'Solar Daily Return', format: 'watts', unit: 'Wh' },

  // Loadout fields
  { source: 'loadout', field: 'total_items', label: 'Total Items', format: 'number' },
  { source: 'loadout', field: 'packed_items', label: 'Packed Items', format: 'number' },
  { source: 'loadout', field: 'pack_percentage', label: 'Pack Readiness', format: 'percentage', unit: '%' },
  { source: 'loadout', field: 'total_weight', label: 'Total Weight', format: 'number', unit: 'lbs' },
  { source: 'loadout', field: 'waypoint_count', label: 'Waypoint Count', format: 'number' },
  { source: 'loadout', field: 'mission_days', label: 'Mission Duration', format: 'days', unit: 'days' },
];

/** Grouped by source for the picker UI */
export const DATA_FIELD_GROUPS: { source: DataSource; label: string; fields: DataFieldOption[] }[] = [
  { source: 'trip', label: 'TRIP DATA', fields: AVAILABLE_DATA_FIELDS.filter(f => f.source === 'trip') },
  { source: 'vehicle', label: 'VEHICLE DATA', fields: AVAILABLE_DATA_FIELDS.filter(f => f.source === 'vehicle') },
  { source: 'loadout', label: 'LOADOUT DATA', fields: AVAILABLE_DATA_FIELDS.filter(f => f.source === 'loadout') },
];

// ── Threshold Configuration ────────────────────────────

export interface ThresholdConfig {
  enabled: boolean;
  targetField: string; // field key to evaluate
  greenAbove: number;  // value >= this is green
  amberAbove: number;  // value >= this is amber (but < greenAbove)
  // value < amberAbove is red
}

// ── Custom Widget Definition ───────────────────────────

export interface CustomWidgetDefinition {
  id: string;            // 'custom-<timestamp>'
  name: string;
  icon: string;          // Ionicons name
  description: string;
  dataFields: string[];  // field keys from AVAILABLE_DATA_FIELDS
  thresholds: ThresholdConfig;
  createdAt: string;
}

// ── Icon Options ───────────────────────────────────────

export const ICON_OPTIONS: { name: string; label: string }[] = [
  { name: 'speedometer-outline', label: 'Speedometer' },
  { name: 'thermometer-outline', label: 'Temperature' },
  { name: 'compass-outline', label: 'Compass' },
  { name: 'analytics-outline', label: 'Analytics' },
  { name: 'bar-chart-outline', label: 'Bar Chart' },
  { name: 'trending-up-outline', label: 'Trending Up' },
  { name: 'pie-chart-outline', label: 'Pie Chart' },
  { name: 'stats-chart-outline', label: 'Stats' },
  { name: 'timer-outline', label: 'Timer' },
  { name: 'stopwatch-outline', label: 'Stopwatch' },
  { name: 'hourglass-outline', label: 'Hourglass' },
  { name: 'map-outline', label: 'Map' },
  { name: 'location-outline', label: 'Location' },
  { name: 'trail-sign-outline', label: 'Trail Sign' },
  { name: 'flag-outline', label: 'Flag' },
  { name: 'earth-outline', label: 'Globe' },
  { name: 'sunny-outline', label: 'Sun' },
  { name: 'moon-outline', label: 'Moon' },
  { name: 'cloud-outline', label: 'Cloud' },
  { name: 'rainy-outline', label: 'Rain' },
  { name: 'snow-outline', label: 'Snow' },
  { name: 'flash-outline', label: 'Lightning' },
  { name: 'water-outline', label: 'Water' },
  { name: 'flame-outline', label: 'Flame' },
  { name: 'leaf-outline', label: 'Leaf' },
  { name: 'fitness-outline', label: 'Fitness' },
  { name: 'heart-outline', label: 'Heart' },
  { name: 'eye-outline', label: 'Eye' },
  { name: 'shield-outline', label: 'Shield' },
  { name: 'warning-outline', label: 'Warning' },
  { name: 'alert-circle-outline', label: 'Alert' },
  { name: 'checkmark-circle-outline', label: 'Check' },
  { name: 'radio-outline', label: 'Radio' },
  { name: 'wifi-outline', label: 'WiFi' },
  { name: 'cellular-outline', label: 'Signal' },
  { name: 'battery-full-outline', label: 'Battery' },
  { name: 'car-outline', label: 'Vehicle' },
  { name: 'construct-outline', label: 'Tools' },
  { name: 'cube-outline', label: 'Cargo' },
  { name: 'layers-outline', label: 'Layers' },
];

// ── Storage ────────────────────────────────────────────

const STORAGE_KEY = 'ecs_custom_widgets';

function loadWidgets(): CustomWidgetDefinition[] {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch (e) {
    console.warn('[CustomWidgetStore] Failed to load:', e);
  }
  return [];
}

function saveWidgets(widgets: CustomWidgetDefinition[]): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(widgets));
    }
  } catch (e) {
    console.warn('[CustomWidgetStore] Failed to save:', e);
  }
}

// ── Public API ─────────────────────────────────────────

export const customWidgetStore = {
  getAll(): CustomWidgetDefinition[] {
    return loadWidgets();
  },

  getById(id: string): CustomWidgetDefinition | null {
    return loadWidgets().find(w => w.id === id) || null;
  },

  create(widget: Omit<CustomWidgetDefinition, 'id' | 'createdAt'>): CustomWidgetDefinition {
    const widgets = loadWidgets();
    const newWidget: CustomWidgetDefinition = {
      ...widget,
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    widgets.push(newWidget);
    saveWidgets(widgets);
    return newWidget;
  },

  update(id: string, updates: Partial<Omit<CustomWidgetDefinition, 'id' | 'createdAt'>>): CustomWidgetDefinition | null {
    const widgets = loadWidgets();
    const idx = widgets.findIndex(w => w.id === id);
    if (idx === -1) return null;
    widgets[idx] = { ...widgets[idx], ...updates };
    saveWidgets(widgets);
    return widgets[idx];
  },

  delete(id: string): boolean {
    const widgets = loadWidgets();
    const filtered = widgets.filter(w => w.id !== id);
    if (filtered.length === widgets.length) return false;
    saveWidgets(filtered);
    return true;
  },

  /** Resolve a data field value from the widget data context */
  resolveFieldValue(
    fieldKey: string,
    data: {
      activeTrip: any;
      loadItems: any[];
      waypoints: any[];
    }
  ): { value: string | number | null; raw: number | null } {
    const fieldDef = AVAILABLE_DATA_FIELDS.find(f => f.field === fieldKey);
    if (!fieldDef) return { value: null, raw: null };

    const trip = data.activeTrip;
    const activeVehicleContext = getActiveVehicleContext();
    const activeVehicleId = activeVehicleContext.activeVehicleId;
    const activeVehicle = activeVehicleContext.vehicle;
    const activeVehicleSpec = activeVehicleContext.spec;
    const resourceProfile = activeVehicleContext.resourceProfile;
    const fuelCapacityGal = activeVehicleSpec?.fuel_tank_capacity_gal ?? resourceProfile.fuelTankCapacityGal ?? trip?.capac_fuel_gal ?? null;
    const mpg = activeVehicle?.avg_mpg ?? trip?.capac_mpg ?? null;
    const waterCapacityGal = resourceProfile.waterCapacityGal ?? trip?.capac_water_gal ?? null;
    const batteryUsableWh = resourceProfile.batteryUsableWh ?? trip?.battery_usable_wh ?? null;

    // Trip fields
    if (fieldDef.source === 'trip') {
      const val = trip?.[fieldKey];
      if (val == null) return { value: '--', raw: null };
      return { value: val, raw: typeof val === 'number' ? val : null };
    }

    // Vehicle fields (derived from trip data)
    if (fieldDef.source === 'vehicle') {
      switch (fieldKey) {
        case 'capac_fuel_gal': return numVal(fuelCapacityGal);
        case 'capac_mpg': return numVal(mpg);
        case 'primary_vehicle': return { value: activeVehicle?.name || trip?.primary_vehicle || '--', raw: null };
        case 'capac_water_gal': return numVal(waterCapacityGal);
        case 'water_use_per_person_day': return numVal(trip?.water_use_per_person_day);
        case 'battery_usable_wh': return numVal(batteryUsableWh);
        case 'solar_watts': return numVal(trip?.solar_watts);
        case 'sun_hours_per_day': return numVal(trip?.sun_hours_per_day);
        case 'fuel_range_miles': {
          if (fuelCapacityGal && mpg) { const v = fuelCapacityGal * mpg; return { value: v.toFixed(0), raw: v }; }
          return { value: '--', raw: null };
        }
        case 'fuel_days': {
          const mpd = trip?.avg_miles_per_day;
          if (fuelCapacityGal && mpg && mpd) { const v = fuelCapacityGal / (mpd / mpg); return { value: v.toFixed(1), raw: v }; }
          return { value: '--', raw: null };
        }
        case 'water_days': {
          const wpp = trip?.water_use_per_person_day || 1;
          const ts = trip?.team_size || 1;
          if (waterCapacityGal) { const v = waterCapacityGal / (wpp * ts); return { value: v.toFixed(1), raw: v }; }
          return { value: '--', raw: null };
        }
        case 'solar_daily_wh': {
          const sw = trip?.solar_watts;
          const sh = trip?.sun_hours_per_day;
          const eff = trip?.solar_efficiency || 0.8;
          if (sw && sh) { const v = sw * sh * eff; return { value: v.toFixed(0), raw: v }; }
          return { value: '--', raw: null };
        }
        default: return { value: '--', raw: null };
      }
    }

    // Loadout fields (derived from loadItems + trip)
    if (fieldDef.source === 'loadout') {
      const items = data.loadItems?.filter((i: any) => !i.deleted_at) || [];
      const mode = trip?.active_mode || 'Trip';
      const active = items.filter((i: any) => i.mode === mode || i.mode === 'Both');

      switch (fieldKey) {
        case 'total_items': return { value: active.length, raw: active.length };
        case 'packed_items': {
          const p = active.filter((i: any) => i.packed).length;
          return { value: p, raw: p };
        }
        case 'pack_percentage': {
          const packed = active.filter((i: any) => i.packed).length;
          const pct = active.length > 0 ? Math.round((packed / active.length) * 100) : 0;
          return { value: pct, raw: pct };
        }
        case 'total_weight': {
          const w = active.reduce((acc: number, i: any) => acc + ((i.weight_lbs || 0) * (i.qty || 1)), 0);
          return { value: w.toFixed(1), raw: w };
        }
        case 'waypoint_count': {
          const c = data.waypoints?.length || 0;
          return { value: c, raw: c };
        }
        case 'mission_days': {
          if (trip?.start_date && trip?.end_date) {
            const d = Math.ceil((new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000);
            return { value: d, raw: d };
          }
          return { value: '--', raw: null };
        }
        default: return { value: '--', raw: null };
      }
    }

    return { value: '--', raw: null };
  },

  /** Evaluate threshold color for a numeric value */
  evaluateThreshold(value: number | null, thresholds: ThresholdConfig): string {
    if (!thresholds.enabled || value == null) return '#8A8A85'; // muted
    if (value >= thresholds.greenAbove) return '#4CAF50';
    if (value >= thresholds.amberAbove) return '#C48A2C';
    return '#C0392B';
  },
};

function numVal(v: any): { value: string | number | null; raw: number | null } {
  if (v == null) return { value: '--', raw: null };
  return { value: v, raw: typeof v === 'number' ? v : null };
}

