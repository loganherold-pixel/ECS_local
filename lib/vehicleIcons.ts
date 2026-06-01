/**
 * Vehicle Icon Utility
 *
 * Maps vehicle types (from wizard_config) to appropriate Ionicons names.
 * Provides consistent vehicle silhouette icons throughout the app.
 *
 * Vehicle types:
 *   car_crossover → car icon
 *   suv_van       → bus/SUV icon
 *   truck         → truck/pickup icon
 *   jeep          → off-road/4x4 icon
 */

export type VehicleTypeKey = 'car_crossover' | 'suv_van' | 'truck' | 'jeep';

interface VehicleIconInfo {
  /** Outlined icon name (for lists, unselected states) */
  outline: string;
  /** Filled icon name (for selected states, badges) */
  filled: string;
  /** Short label */
  label: string;
  /** Color accent */
  color: string;
}

const VEHICLE_ICON_MAP: Record<VehicleTypeKey, VehicleIconInfo> = {
  car_crossover: {
    outline: 'car-outline',
    filled: 'car',
    label: 'CAR / CROSSOVER',
    color: '#66BB6A',
  },
  suv_van: {
    outline: 'bus-outline',
    filled: 'bus',
    label: 'SUV / VAN',
    color: '#AB47BC',
  },
  truck: {
    outline: 'car-sport-outline',
    filled: 'car-sport',
    label: 'TRUCK',
    color: '#4FC3F7',
  },
  jeep: {
    outline: 'navigate-outline',
    filled: 'navigate',
    label: 'JEEP / 4x4',
    color: '#FF7043',
  },
};

const DEFAULT_ICON: VehicleIconInfo = {
  outline: 'car-sport-outline',
  filled: 'car-sport',
  label: 'VEHICLE',
  color: '#C48A2C',
};

/**
 * Get the vehicle type key from a vehicle's wizard_config
 */
export function getVehicleTypeKey(vehicle: any): VehicleTypeKey | null {
  const config = vehicle?.wizard_config;
  if (!config) return null;
  const vt = typeof config === 'object' ? config.vehicle_type : null;
  if (vt && VEHICLE_ICON_MAP[vt as VehicleTypeKey]) {
    return vt as VehicleTypeKey;
  }
  return null;
}

/**
 * Get icon info for a vehicle type key
 */
export function getVehicleIconInfo(typeKey: VehicleTypeKey | string | null): VehicleIconInfo {
  if (typeKey && VEHICLE_ICON_MAP[typeKey as VehicleTypeKey]) {
    return VEHICLE_ICON_MAP[typeKey as VehicleTypeKey];
  }
  return DEFAULT_ICON;
}

/**
 * Get the outline icon name for a vehicle
 */
export function getVehicleIcon(vehicle: any, filled: boolean = false): string {
  const typeKey = getVehicleTypeKey(vehicle);
  const info = getVehicleIconInfo(typeKey);
  return filled ? info.filled : info.outline;
}

/**
 * Get the vehicle type label
 */
export function getVehicleTypeLabel(vehicle: any): string {
  const typeKey = getVehicleTypeKey(vehicle);
  const info = getVehicleIconInfo(typeKey);
  return info.label;
}

/**
 * Get all vehicle icon info (for use in lists, etc.)
 */
export function getAllVehicleTypes(): { key: VehicleTypeKey; info: VehicleIconInfo }[] {
  return Object.entries(VEHICLE_ICON_MAP).map(([key, info]) => ({
    key: key as VehicleTypeKey,
    info,
  }));
}

