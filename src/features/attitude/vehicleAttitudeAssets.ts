import type { ImageSourcePropType } from 'react-native';

import {
  VEHICLE_ATTITUDE_ASSET_MANIFEST,
  type VehicleAttitudeId,
} from './vehicleAttitudeAssetManifest';

export type VehicleAttitudePanelGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
  labelX: number;
  labelY: number;
};

export type VehicleAttitudeAsset = {
  vehicleId: string;
  label: string;
  attitudeImageSrc: string;
  sourceFilename: string;
  aspectRatio: number;
  viewBox: {
    width: number;
    height: number;
  };
  pitchPanel: VehicleAttitudePanelGeometry;
  rollPanel: VehicleAttitudePanelGeometry;
  zeroButtonAnchor: {
    x: number;
    y: number;
  };
};

export type VehicleAttitudeAssetRegistryEntry = VehicleAttitudeAsset & {
  attitudeImageSource: ImageSourcePropType;
};

export const ATTITUDE_READOUT_ANCHORS = {
  pitch: {
    x: 438.25,
    y: 770,
  },
  roll: {
    x: 1314.75,
    y: 770,
  },
} as const;

export const ZERO_BUTTON_NUDGE_X = 4;

export const DEFAULT_ATTITUDE_GEOMETRY = {
  aspectRatio: 1753 / 1024,
  viewBox: { width: 1753, height: 1024 },
  pitchPanel: {
    x: 0,
    y: 0,
    width: 876.5,
    height: 1024,
    labelX: ATTITUDE_READOUT_ANCHORS.pitch.x,
    labelY: ATTITUDE_READOUT_ANCHORS.pitch.y,
  },
  rollPanel: {
    x: 876.5,
    y: 0,
    width: 876.5,
    height: 1024,
    labelX: ATTITUDE_READOUT_ANCHORS.roll.x,
    labelY: ATTITUDE_READOUT_ANCHORS.roll.y,
  },
  zeroButtonAnchor: {
    x: 876.5 + ZERO_BUTTON_NUDGE_X,
    y: 880,
  },
} as const;

export const VEHICLE_ATTITUDE_ASSETS = Object.fromEntries(
  Object.entries(VEHICLE_ATTITUDE_ASSET_MANIFEST).map(([vehicleId, asset]) => [
    vehicleId,
    {
      ...asset,
      ...DEFAULT_ATTITUDE_GEOMETRY,
    },
  ]),
) as Record<VehicleAttitudeId, VehicleAttitudeAssetRegistryEntry>;

export const VEHICLE_ATTITUDE_ASSET_COUNT = Object.keys(VEHICLE_ATTITUDE_ASSETS).length;

const reportedMissingVehicleIds = new Set<string>();
const FALLBACK_VEHICLE_ATTITUDE_ID: VehicleAttitudeId = 'toyota_tacoma';

function isDevelopmentAttitudeRuntime(): boolean {
  return typeof __DEV__ === 'undefined' ? true : __DEV__;
}

export function getVehicleAttitudeAsset(
  vehicleId: string | null | undefined,
): VehicleAttitudeAssetRegistryEntry {
  if (vehicleId && hasVehicleAttitudeAsset(vehicleId)) {
    return VEHICLE_ATTITUDE_ASSETS[vehicleId as VehicleAttitudeId];
  }

  reportMissingVehicleAttitudeAsset(vehicleId ?? 'unresolved');
  return VEHICLE_ATTITUDE_ASSETS[FALLBACK_VEHICLE_ATTITUDE_ID];
}

export function hasVehicleAttitudeAsset(vehicleId: string | null | undefined): boolean {
  return Boolean(
    vehicleId &&
      Object.prototype.hasOwnProperty.call(VEHICLE_ATTITUDE_ASSETS, vehicleId),
  );
}

export function reportMissingVehicleAttitudeAsset(vehicleId: string): void {
  if (reportedMissingVehicleIds.has(vehicleId)) {
    return;
  }
  reportedMissingVehicleIds.add(vehicleId);
  if (isDevelopmentAttitudeRuntime()) {
    console.warn(
      `[ECS attitude assets] Missing vehicle attitude asset for vehicleId "${vehicleId}". Falling back to Toyota Tacoma.`,
    );
  }
}
