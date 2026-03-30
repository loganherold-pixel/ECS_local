/**
 * Waypoint Type Classification System
 *
 * Defines all available waypoint types with:
 *   - Unique color for map markers and UI badges
 *   - Ionicons icon name for visual identification
 *   - Short label and description
 *
 * Used by WaypointEditor (chip selector, filter, list badges)
 * and RouteMapPreview (type-specific colored markers).
 */

/** All valid waypoint type keys */
export type RouteWaypointType =
  | 'camp'
  | 'water'
  | 'fuel'
  | 'hazard'
  | 'viewpoint'
  | 'trailhead'
  | 'junction';

/** Full list of waypoint type keys (ordered for chip selector) */
export const WAYPOINT_TYPES: RouteWaypointType[] = [
  'camp',
  'water',
  'fuel',
  'hazard',
  'viewpoint',
  'trailhead',
  'junction',
];

/** Configuration for each waypoint type */
export interface WaypointTypeConfig {
  key: RouteWaypointType;
  label: string;
  shortLabel: string;
  icon: string;       // Ionicons icon name
  color: string;      // Primary accent color
  bgColor: string;    // Background tint (low alpha)
  borderColor: string; // Border color (medium alpha)
  description: string;
}

/** Master config map */
export const WAYPOINT_TYPE_CONFIG: Record<RouteWaypointType, WaypointTypeConfig> = {
  camp: {
    key: 'camp',
    label: 'Camp',
    shortLabel: 'CAMP',
    icon: 'bonfire-outline',
    color: '#66BB6A',
    bgColor: 'rgba(102,187,106,0.12)',
    borderColor: 'rgba(102,187,106,0.35)',
    description: 'Campsite or overnight stop',
  },
  water: {
    key: 'water',
    label: 'Water',
    shortLabel: 'WATER',
    icon: 'water-outline',
    color: '#4FC3F7',
    bgColor: 'rgba(79,195,247,0.12)',
    borderColor: 'rgba(79,195,247,0.35)',
    description: 'Water source or resupply point',
  },
  fuel: {
    key: 'fuel',
    label: 'Fuel',
    shortLabel: 'FUEL',
    icon: 'speedometer-outline',
    color: '#FFB74D',
    bgColor: 'rgba(255,183,77,0.12)',
    borderColor: 'rgba(255,183,77,0.35)',
    description: 'Fuel station or resupply',
  },
  hazard: {
    key: 'hazard',
    label: 'Hazard',
    shortLabel: 'HAZARD',
    icon: 'warning-outline',
    color: '#EF5350',
    bgColor: 'rgba(239,83,80,0.12)',
    borderColor: 'rgba(239,83,80,0.35)',
    description: 'Hazard or danger zone',
  },
  viewpoint: {
    key: 'viewpoint',
    label: 'Viewpoint',
    shortLabel: 'VIEW',
    icon: 'eye-outline',
    color: '#AB47BC',
    bgColor: 'rgba(171,71,188,0.12)',
    borderColor: 'rgba(171,71,188,0.35)',
    description: 'Scenic viewpoint or overlook',
  },
  trailhead: {
    key: 'trailhead',
    label: 'Trailhead',
    shortLabel: 'TRAIL',
    icon: 'trail-sign-outline',
    color: '#26A69A',
    bgColor: 'rgba(38,166,154,0.12)',
    borderColor: 'rgba(38,166,154,0.35)',
    description: 'Trailhead or route start point',
  },
  junction: {
    key: 'junction',
    label: 'Junction',
    shortLabel: 'JCT',
    icon: 'git-branch-outline',
    color: '#78909C',
    bgColor: 'rgba(120,144,156,0.12)',
    borderColor: 'rgba(120,144,156,0.35)',
    description: 'Trail junction or intersection',
  },
};

/**
 * Get config for a waypoint type, with fallback for untyped waypoints.
 */
export function getWaypointTypeConfig(type: RouteWaypointType | null | undefined): WaypointTypeConfig | null {
  if (!type) return null;
  return WAYPOINT_TYPE_CONFIG[type] || null;
}

/**
 * Default marker color for untyped waypoints.
 */
export const DEFAULT_WAYPOINT_COLOR = '#66BB6A';
export const DEFAULT_WAYPOINT_BG = 'rgba(102,187,106,0.2)';

