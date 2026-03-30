/**
 * PinTypes — ECS Navigate Pin System Type Definitions
 *
 * Defines all pin categories, types, icons, colors, and severity levels
 * for the waypoint + incident pin system.
 */

// ── Pin Categories ──────────────────────────────────────────
export type PinCategory = 'waypoint' | 'incident';

// ── Waypoint Types ──────────────────────────────────────────
export type WaypointType = 'camp' | 'fuel' | 'water' | 'poi';

// ── Incident Types ──────────────────────────────────────────
export type IncidentType = 'hazard' | 'recovery' | 'medical' | 'mechanical';

// ── Combined Pin Type ───────────────────────────────────────
export type PinType = WaypointType | IncidentType;

// ── Severity Levels (incidents only) ────────────────────────
export type PinSeverity = 'low' | 'med' | 'high';

// ── Sort Options ────────────────────────────────────────────
export type PinSortMode = 'nearest' | 'recent' | 'type';

// ── Pin Data Model ──────────────────────────────────────────
export interface ECSPin {
  id: string;
  type: PinType;
  category: PinCategory;
  title: string;
  notes: string;
  lat: number;
  lng: number;
  created_at: string;
  created_by: string;
  expedition_id: string | null;
  vehicle_id: string | null;
  severity: PinSeverity | null;
  resolved: boolean;
  photo_url: string | null;
  icon_key: string;
}

// ── Pin Type Metadata ───────────────────────────────────────
export interface PinTypeMeta {
  type: PinType;
  category: PinCategory;
  label: string;
  shortLabel: string;
  icon: string;       // Ionicons name
  color: string;
  bgColor: string;
  mapChar: string;    // Single char for map marker
  defaultTitle: string;
}

// ── Pin Type Registry ───────────────────────────────────────
export const PIN_TYPE_REGISTRY: PinTypeMeta[] = [
  // Waypoints
  {
    type: 'camp',
    category: 'waypoint',
    label: 'Camp',
    shortLabel: 'CAMP',
    icon: 'bonfire-outline',
    color: '#66BB6A',
    bgColor: 'rgba(102,187,106,0.15)',
    mapChar: 'C',
    defaultTitle: 'Camp Site',
  },
  {
    type: 'fuel',
    category: 'waypoint',
    label: 'Fuel',
    shortLabel: 'FUEL',
    icon: 'speedometer-outline',
    color: '#FFB300',
    bgColor: 'rgba(255,179,0,0.15)',
    mapChar: 'F',
    defaultTitle: 'Fuel Stop',
  },
  {
    type: 'water',
    category: 'waypoint',
    label: 'Water',
    shortLabel: 'WATER',
    icon: 'water-outline',
    color: '#42A5F5',
    bgColor: 'rgba(66,165,245,0.15)',
    mapChar: 'W',
    defaultTitle: 'Water Source',
  },
  {
    type: 'poi',
    category: 'waypoint',
    label: 'Point of Interest',
    shortLabel: 'POI',
    icon: 'location-outline',
    color: '#AB47BC',
    bgColor: 'rgba(171,71,188,0.15)',
    mapChar: 'P',
    defaultTitle: 'Point of Interest',
  },
  // Incidents
  {
    type: 'hazard',
    category: 'incident',
    label: 'Hazard',
    shortLabel: 'HAZARD',
    icon: 'warning-outline',
    color: '#EF5350',
    bgColor: 'rgba(239,83,80,0.15)',
    mapChar: 'H',
    defaultTitle: 'Hazard',
  },
  {
    type: 'recovery',
    category: 'incident',
    label: 'Recovery',
    shortLabel: 'RECOV',
    icon: 'construct-outline',
    color: '#FF7043',
    bgColor: 'rgba(255,112,67,0.15)',
    mapChar: 'R',
    defaultTitle: 'Recovery Point',
  },
  {
    type: 'medical',
    category: 'incident',
    label: 'Medical',
    shortLabel: 'MED',
    icon: 'medkit-outline',
    color: '#E53935',
    bgColor: 'rgba(229,57,53,0.15)',
    mapChar: 'M',
    defaultTitle: 'Medical Incident',
  },
  {
    type: 'mechanical',
    category: 'incident',
    label: 'Mechanical',
    shortLabel: 'MECH',
    icon: 'cog-outline',
    color: '#FFA726',
    bgColor: 'rgba(255,167,38,0.15)',
    mapChar: 'K',
    defaultTitle: 'Mechanical Issue',
  },
];

// ── Lookup Helpers ──────────────────────────────────────────
export function getPinTypeMeta(type: PinType): PinTypeMeta {
  return PIN_TYPE_REGISTRY.find(p => p.type === type) || PIN_TYPE_REGISTRY[0];
}

export function getWaypointTypes(): PinTypeMeta[] {
  return PIN_TYPE_REGISTRY.filter(p => p.category === 'waypoint');
}

export function getIncidentTypes(): PinTypeMeta[] {
  return PIN_TYPE_REGISTRY.filter(p => p.category === 'incident');
}

export function getAllPinTypes(): PinTypeMeta[] {
  return PIN_TYPE_REGISTRY;
}

// ── Severity Colors ─────────────────────────────────────────
export const SEVERITY_COLORS: Record<PinSeverity, string> = {
  low: '#66BB6A',
  med: '#FFB300',
  high: '#EF5350',
};

export const SEVERITY_LABELS: Record<PinSeverity, string> = {
  low: 'LOW',
  med: 'MEDIUM',
  high: 'HIGH',
};

// ── Category icon for map marker ────────────────────────────
export function getCategoryIcon(category: PinCategory): string {
  return category === 'waypoint' ? 'flag-outline' : 'alert-circle-outline';
}



