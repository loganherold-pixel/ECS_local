/**
 * Loadout Container Registry — Default Container Definitions
 *
 * Defines the standard container set for the Loadout 2.0 system.
 * Matches the Accessory Framework categories 1:1.
 *
 * Each entry includes:
 *   key          — unique identifier (snake_case, matches ContainerZone.id)
 *   label        — human-readable name
 *   iconKey      — Ionicons icon name
 *   color        — accent color for UI rendering
 *   defaultEnabled — whether enabled by default
 *   sortOrder    — display order in the grid
 *   categoryId   — maps to AccessoryCategory.id for framework integration
 */

export interface LoadoutContainerDef {
  /** Unique key (snake_case, matches ContainerZone.id) */
  key: string;
  /** Human-readable label */
  label: string;
  /** Ionicons icon name */
  iconKey: string;
  /** Accent color */
  color: string;
  /** Whether enabled by default */
  defaultEnabled: boolean;
  /** Display sort order */
  sortOrder: number;
  /** Maps to AccessoryCategory.id */
  categoryId: string;
}

/**
 * Standard container definitions — matches the 10 Accessory Framework categories.
 *
 * Order matches the Accessory Framework grid layout:
 *   Row 1: Cab Rack, Cab Rack Acc.
 *   Row 2: Bed / Drawer, Roof / Crossbars
 *   Row 3: RTT, Interior Storage
 *   Row 4: Fridge / Slide, Recovery Mount
 *   Row 5: Water Storage, Power / Battery
 */
export const DEFAULT_LOADOUT_CONTAINERS: LoadoutContainerDef[] = [
  {
    key: 'cab_rack',
    label: 'Cab Rack',
    iconKey: 'barbell-outline',
    color: '#FF6B6B',
    defaultEnabled: true,
    sortOrder: 0,
    categoryId: 'cab_rack',
  },
  {
    key: 'bed_drawer',
    label: 'Drawer Storage',
    iconKey: 'server-outline',
    color: '#96CEB4',
    defaultEnabled: true,
    sortOrder: 1,
    categoryId: 'bed_drawer',
  },
  {
    key: 'roof_rack',
    label: 'Roof / Crossbars',
    iconKey: 'resize-outline',
    color: '#4FC3F7',
    defaultEnabled: true,
    sortOrder: 2,
    categoryId: 'roof_rack',
  },
  {
    key: 'rtt',
    label: 'RTT',
    iconKey: 'trail-sign-outline',
    color: '#C77DFF',
    defaultEnabled: true,
    sortOrder: 3,
    categoryId: 'rtt',
  },
  {
    key: 'interior_storage',
    label: 'Interior Storage',
    iconKey: 'file-tray-stacked-outline',
    color: '#4ECDC4',
    defaultEnabled: true,
    sortOrder: 4,
    categoryId: 'interior_storage',
  },
  {
    key: 'recovery_mount',
    label: 'Recovery Mount Hitch System',
    iconKey: 'construct-outline',
    color: '#AB47BC',
    defaultEnabled: true,
    sortOrder: 5,
    categoryId: 'recovery_mount',
  },
  {
    key: 'shell_system',
    label: 'SmartCap / AluCab / Other Shell',
    iconKey: 'archive-outline',
    color: '#7E8CE0',
    defaultEnabled: false,
    sortOrder: 6,
    categoryId: 'shell_system',
  },
  {
    key: 'truck_bed',
    label: 'Truck Bed',
    iconKey: 'layers-outline',
    color: '#6B8F71',
    defaultEnabled: false,
    sortOrder: 7,
    categoryId: 'truck_bed',
  },
  {
    key: 'water_storage',
    label: 'Water / Liquid Storage',
    iconKey: 'water-outline',
    color: '#26A69A',
    defaultEnabled: true,
    sortOrder: 8,
    categoryId: 'water_storage',
  },
  {
    key: 'power_system',
    label: 'Power / Battery',
    iconKey: 'flash-outline',
    color: '#FFB74D',
    defaultEnabled: true,
    sortOrder: 9,
    categoryId: 'power_system',
  },
];

/**
 * Get a container definition by key.
 */
export function getContainerDef(key: string): LoadoutContainerDef | undefined {
  return DEFAULT_LOADOUT_CONTAINERS.find(c => c.key === key);
}

/**
 * Get all container definitions sorted by sortOrder.
 */
export function getSortedContainerDefs(): LoadoutContainerDef[] {
  return [...DEFAULT_LOADOUT_CONTAINERS].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Get the total number of default containers.
 */
export function getContainerCount(): number {
  return DEFAULT_LOADOUT_CONTAINERS.length;
}

