import type { ImageResizeMode, ImageSourcePropType } from 'react-native';

import type { AttitudeMonitorVehicleVisualFamilyId } from './attitudeMonitorVehicleVisual';
import {
  ATTITUDE_MONITOR_TUNING,
  getAttitudeMonitorVisualUsageTuning,
} from './attitudeMonitorTuning';

export type AttitudeMonitorBackgroundUsage = 'compact' | 'standard' | 'detail' | 'automotive';

export interface AttitudeMonitorHeroAssetDefinition {
  familyId: AttitudeMonitorVehicleVisualFamilyId;
  displayName: string;
  assetName: string;
  relativeAssetPath: string;
  primarySource: ImageSourcePropType;
  compactSource?: ImageSourcePropType | null;
  automotiveSource?: ImageSourcePropType | null;
  fallsBackToDefault: boolean;
}

export interface AttitudeMonitorBackgroundAssetDefinition {
  id: 'darker-tactical-canyon';
  displayName: string;
  relativeAssetPath: string;
  source: ImageSourcePropType;
  resizeMode: ImageResizeMode;
  opacityByUsage: Record<AttitudeMonitorBackgroundUsage, number>;
}

export interface AttitudeMonitorOverlayAssetDefinition {
  id: 'subtle-topo-overlay';
  displayName: string;
  relativeAssetPath: string;
  source: ImageSourcePropType;
  resizeMode: ImageResizeMode;
  opacityByUsage: Partial<Record<AttitudeMonitorBackgroundUsage, number>>;
}

export interface AttitudeMonitorBackgroundPresentation {
  backgroundSource: ImageSourcePropType | null;
  backgroundOpacity: number;
  backgroundScale: number;
  backgroundOffsetX: number;
  backgroundOffsetY: number;
  overlaySource: ImageSourcePropType | null;
  overlayOpacity: number;
  overlayEnabled: boolean;
  overlayScale: number;
  overlayOffsetY: number;
  resizeMode: ImageResizeMode;
}

export const ATTITUDE_MONITOR_TOPO_OVERLAY_ENABLED = ATTITUDE_MONITOR_TUNING.visual.topoOverlayEnabled;

const DEFAULT_FULLSIZE_TRUCK_HERO = require('../assets/attitude/vehicles/default/fullsize-truck-hero.png');
const DARKER_TACTICAL_CANYON_BACKGROUND = require('../assets/attitude/backgrounds/darker-tactical-canyon.png');
const SUBTLE_TOPO_OVERLAY = require('../assets/attitude/overlays/subtle-topo-overlay.png');

export const ATTITUDE_MONITOR_BACKGROUND_ASSET: AttitudeMonitorBackgroundAssetDefinition = {
  id: 'darker-tactical-canyon',
  displayName: 'Darker tactical canyon',
  relativeAssetPath: 'assets/attitude/backgrounds/darker-tactical-canyon.png',
  source: DARKER_TACTICAL_CANYON_BACKGROUND,
  resizeMode: 'cover',
  opacityByUsage: {
    compact: ATTITUDE_MONITOR_TUNING.visual.backgroundByUsage.compact.opacity,
    standard: ATTITUDE_MONITOR_TUNING.visual.backgroundByUsage.standard.opacity,
    detail: ATTITUDE_MONITOR_TUNING.visual.backgroundByUsage.detail.opacity,
    automotive: ATTITUDE_MONITOR_TUNING.visual.backgroundByUsage.automotive.opacity,
  },
};

export const ATTITUDE_MONITOR_TOPO_OVERLAY_ASSET: AttitudeMonitorOverlayAssetDefinition = {
  id: 'subtle-topo-overlay',
  displayName: 'Subtle topo overlay',
  relativeAssetPath: 'assets/attitude/overlays/subtle-topo-overlay.png',
  source: SUBTLE_TOPO_OVERLAY,
  resizeMode: 'cover',
  opacityByUsage: {
    standard: ATTITUDE_MONITOR_TUNING.visual.overlayByUsage.standard.opacity,
    detail: ATTITUDE_MONITOR_TUNING.visual.overlayByUsage.detail.opacity,
    automotive: ATTITUDE_MONITOR_TUNING.visual.overlayByUsage.automotive.opacity,
  },
};

// Naming convention:
// - assets/attitude/vehicles/default/<family>-hero.png for fallback-approved hero art
// - assets/attitude/vehicles/fleet/<family>-hero.png for Fleet-linked family art
// - assets/attitude/backgrounds/<background-name>.png for rendered background plates
// - assets/attitude/overlays/<overlay-name>.png for optional transparent overlays
export const ATTITUDE_MONITOR_HERO_ASSETS: Record<
  AttitudeMonitorVehicleVisualFamilyId,
  AttitudeMonitorHeroAssetDefinition
> = {
  'default-truck': {
    familyId: 'default-truck',
    displayName: 'Full-size truck',
    assetName: 'fullsize-truck-hero',
    relativeAssetPath: 'assets/attitude/vehicles/default/fullsize-truck-hero.png',
    primarySource: DEFAULT_FULLSIZE_TRUCK_HERO,
    compactSource: null,
    automotiveSource: null,
    fallsBackToDefault: false,
  },
  'midsize-truck': {
    familyId: 'midsize-truck',
    displayName: 'Midsize truck',
    assetName: 'midsize-truck-hero',
    relativeAssetPath: 'assets/attitude/vehicles/fleet/midsize-truck-hero.png',
    primarySource: DEFAULT_FULLSIZE_TRUCK_HERO,
    compactSource: null,
    automotiveSource: null,
    fallsBackToDefault: true,
  },
  'heavy-duty-truck': {
    familyId: 'heavy-duty-truck',
    displayName: 'Heavy-duty truck',
    assetName: 'heavy-duty-truck-hero',
    relativeAssetPath: 'assets/attitude/vehicles/fleet/heavy-duty-truck-hero.png',
    primarySource: DEFAULT_FULLSIZE_TRUCK_HERO,
    compactSource: null,
    automotiveSource: null,
    fallsBackToDefault: true,
  },
  suv: {
    familyId: 'suv',
    displayName: 'Overland SUV',
    assetName: 'suv-hero',
    relativeAssetPath: 'assets/attitude/vehicles/fleet/suv-hero.png',
    primarySource: DEFAULT_FULLSIZE_TRUCK_HERO,
    compactSource: null,
    automotiveSource: null,
    fallsBackToDefault: true,
  },
  van: {
    familyId: 'van',
    displayName: 'Expedition van',
    assetName: 'van-hero',
    relativeAssetPath: 'assets/attitude/vehicles/fleet/van-hero.png',
    primarySource: DEFAULT_FULLSIZE_TRUCK_HERO,
    compactSource: null,
    automotiveSource: null,
    fallsBackToDefault: true,
  },
  crossover: {
    familyId: 'crossover',
    displayName: 'Crossover / wagon',
    assetName: 'crossover-hero',
    relativeAssetPath: 'assets/attitude/vehicles/fleet/crossover-hero.png',
    primarySource: DEFAULT_FULLSIZE_TRUCK_HERO,
    compactSource: null,
    automotiveSource: null,
    fallsBackToDefault: true,
  },
};

export function getAttitudeMonitorFallbackHeroAsset(): AttitudeMonitorHeroAssetDefinition {
  return ATTITUDE_MONITOR_HERO_ASSETS['default-truck'];
}

export function getAttitudeMonitorHeroAssetDefinition(
  familyId?: AttitudeMonitorVehicleVisualFamilyId | null,
): AttitudeMonitorHeroAssetDefinition {
  if (!familyId) {
    return getAttitudeMonitorFallbackHeroAsset();
  }
  return ATTITUDE_MONITOR_HERO_ASSETS[familyId] ?? getAttitudeMonitorFallbackHeroAsset();
}

export function getAttitudeMonitorFallbackHeroSource(options?: {
  compact?: boolean;
  automotive?: boolean;
}): ImageSourcePropType {
  return getAttitudeMonitorHeroSource(getAttitudeMonitorFallbackHeroAsset(), options);
}

export function getAttitudeMonitorHeroSource(
  asset: Pick<AttitudeMonitorHeroAssetDefinition, 'primarySource' | 'compactSource' | 'automotiveSource'>,
  options?: { compact?: boolean; automotive?: boolean },
): ImageSourcePropType {
  if (options?.automotive && asset.automotiveSource) {
    return asset.automotiveSource;
  }
  if (options?.compact && asset.compactSource) {
    return asset.compactSource;
  }
  return asset.primarySource;
}

export function getAttitudeMonitorBackgroundPresentation(
  usage: AttitudeMonitorBackgroundUsage,
): AttitudeMonitorBackgroundPresentation {
  // Keep crop/overlay tuning registry-driven so widget, detail, and automotive
  // surfaces share one image-composition model.
  const tuning = getAttitudeMonitorVisualUsageTuning(usage);

  return {
    backgroundSource: ATTITUDE_MONITOR_BACKGROUND_ASSET.source,
    backgroundOpacity: ATTITUDE_MONITOR_BACKGROUND_ASSET.opacityByUsage[usage],
    backgroundScale: tuning.background.scale,
    backgroundOffsetX: tuning.background.offsetX,
    backgroundOffsetY: tuning.background.offsetY,
    overlaySource: ATTITUDE_MONITOR_TOPO_OVERLAY_ASSET.source,
    overlayOpacity: ATTITUDE_MONITOR_TOPO_OVERLAY_ASSET.opacityByUsage[usage] ?? 0,
    overlayEnabled: ATTITUDE_MONITOR_TOPO_OVERLAY_ENABLED && tuning.overlay.enabled,
    overlayScale: tuning.overlay.scale,
    overlayOffsetY: tuning.overlay.offsetY,
    resizeMode: ATTITUDE_MONITOR_BACKGROUND_ASSET.resizeMode,
  };
}
