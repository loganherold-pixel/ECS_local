import { bailoutStore, type BailoutPoint, type BailoutType } from './bailoutStore';
import { offlineExpeditionDbStore } from './offlineExpeditionDbStore';
import type { DatasetEntry } from './offlineExpeditionDbTypes';
import type { NavigationHandoffPayload } from './navigationHandoffStore';

export type RemotenessNavigationTargetType = 'town' | 'fuel' | 'paved_road';

export interface RemotenessResolvedTarget {
  type: RemotenessNavigationTargetType;
  title: string;
  subtitle: string | null;
  coordinate: {
    lat: number;
    lng: number;
  };
  distanceMiles: number | null;
  source: 'bailout' | 'offline_dataset';
  raw: BailoutPoint | DatasetEntry;
}

const TARGET_CONFIG: Record<
  RemotenessNavigationTargetType,
  {
    bailoutType: BailoutType;
    label: string;
    unavailableMessage: string;
  }
> = {
  town: {
    bailoutType: 'town',
    label: 'Nearest Town',
    unavailableMessage: 'Nearest town unavailable',
  },
  fuel: {
    bailoutType: 'fuel',
    label: 'Nearest Fuel',
    unavailableMessage: 'Nearest fuel unavailable',
  },
  paved_road: {
    bailoutType: 'pavement',
    label: 'Nearest Paved Road',
    unavailableMessage: 'Nearest paved road unavailable',
  },
};

function haversineMiles(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number {
  const earthRadiusMiles = 3958.8;
  const dLat = ((latitudeB - latitudeA) * Math.PI) / 180;
  const dLng = ((longitudeB - longitudeA) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((latitudeA * Math.PI) / 180) *
      Math.cos((latitudeB * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestBailoutPoint(
  targetType: RemotenessNavigationTargetType,
  latitude: number,
  longitude: number,
): RemotenessResolvedTarget | null {
  const config = TARGET_CONFIG[targetType];
  const bailoutPoints = bailoutStore.getByType(config.bailoutType);
  if (bailoutPoints.length === 0) return null;

  const resolvedNearest = bailoutPoints.reduce<BailoutPoint | null>((best, point) => {
    if (!best) return point;
    const bestDistance = haversineMiles(latitude, longitude, best.lat, best.lng);
    const pointDistance = haversineMiles(latitude, longitude, point.lat, point.lng);
    return pointDistance < bestDistance ? point : best;
  }, null);
  if (!resolvedNearest) return null;
  const nearestDistanceMiles = haversineMiles(
    latitude,
    longitude,
    resolvedNearest.lat,
    resolvedNearest.lng,
  );

  return {
    type: targetType,
    title: resolvedNearest.title || config.label,
    subtitle:
      targetType === 'paved_road'
        ? 'Fastest known pavement exit'
        : `Closest ${config.label.toLowerCase()} target`,
    coordinate: {
      lat: resolvedNearest.lat,
      lng: resolvedNearest.lng,
    },
    distanceMiles: nearestDistanceMiles,
    source: 'bailout',
    raw: resolvedNearest,
  };
}

function findNearestOfflineFuelStation(
  latitude: number,
  longitude: number,
): RemotenessResolvedTarget | null {
  try {
    const result = offlineExpeditionDbStore.query({
      categories: ['fuel_stations'],
      near: {
        latitude,
        longitude,
        radius_miles: 250,
      },
      sort_by: 'distance',
      limit: 1,
    });

    const fuelStation = result.entries[0];
    if (!fuelStation) return null;

    return {
      type: 'fuel',
      title: fuelStation.name || TARGET_CONFIG.fuel.label,
      subtitle: 'Offline expedition fuel reference',
      coordinate: {
        lat: fuelStation.latitude,
        lng: fuelStation.longitude,
      },
      distanceMiles: haversineMiles(latitude, longitude, fuelStation.latitude, fuelStation.longitude),
      source: 'offline_dataset',
      raw: fuelStation,
    };
  } catch {
    return null;
  }
}

export function resolveRemotenessNavigationTarget(params: {
  type: RemotenessNavigationTargetType;
  latitude: number;
  longitude: number;
}): RemotenessResolvedTarget | null {
  const bailoutMatch = findNearestBailoutPoint(params.type, params.latitude, params.longitude);
  if (bailoutMatch) return bailoutMatch;

  if (params.type === 'fuel') {
    return findNearestOfflineFuelStation(params.latitude, params.longitude);
  }

  return null;
}

export function getRemotenessNavigationLabel(
  type: RemotenessNavigationTargetType,
): string {
  return TARGET_CONFIG[type].label;
}

export function getRemotenessNavigationUnavailableMessage(
  type: RemotenessNavigationTargetType,
): string {
  return TARGET_CONFIG[type].unavailableMessage;
}

export function buildRemotenessNavigationPayload(
  target: RemotenessResolvedTarget,
): NavigationHandoffPayload {
  return {
    id: `remoteness-${target.type}-${Date.now()}`,
    source: 'search',
    type: 'place',
    title: target.title,
    subtitle: target.subtitle,
    coordinate: target.coordinate,
    trailheadCoordinate: null,
    roadDestinationCoordinate: target.coordinate,
    trailGeometry: [],
    trailLengthMiles: target.distanceMiles != null ? Math.round(target.distanceMiles * 10) / 10 : null,
    trailCategory: null,
    tripMode: 'road',
    trailWaypoints: [],
    trailDecisionPoints: [],
    routeMetadata: {
      remotenessTargetType: target.type,
      remotenessSource: target.source,
      distanceMiles: target.distanceMiles,
    },
    landmarkMetadata: null,
    raw: target.raw,
    createdAt: new Date().toISOString(),
  };
}
