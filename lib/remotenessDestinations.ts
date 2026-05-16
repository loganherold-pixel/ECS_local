import type {
  ProximityEstimate,
  RemotenessDestination,
  RemotenessDestinationType,
  RemotenessIndexOutput,
} from './remotenessTypes';

export type RemotenessNavigationTargetType = 'town' | 'fuel' | 'paved_road';

const TARGET_TO_DESTINATION: Record<RemotenessNavigationTargetType, RemotenessDestinationType> = {
  town: 'town',
  fuel: 'fuel',
  paved_road: 'road',
};

const DESTINATION_LABELS: Record<RemotenessDestinationType, string> = {
  town: 'Nearest Town',
  fuel: 'Nearest Fuel',
  road: 'Nearest Paved Road',
};

function getEstimateForType(
  index: RemotenessIndexOutput,
  type: RemotenessDestinationType,
): ProximityEstimate {
  switch (type) {
    case 'town':
      return index.proximity.nearestTown;
    case 'fuel':
      return index.proximity.nearestFuelStation;
    case 'road':
      return index.proximity.nearestPavedRoad;
  }
}

function isFiniteCoordinate(latitude: unknown, longitude: unknown): latitude is number {
  return Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));
}

export function mapRemotenessTargetToDestinationType(
  target: RemotenessNavigationTargetType,
): RemotenessDestinationType {
  return TARGET_TO_DESTINATION[target];
}

export function getRemotenessDestinationLabel(type: RemotenessDestinationType): string {
  return DESTINATION_LABELS[type];
}

export function resolveRemotenessDestination(
  index: RemotenessIndexOutput | null,
  type: RemotenessDestinationType,
  options: { log?: boolean } = {},
): RemotenessDestination | null {
  if (!index) return null;
  const estimate = getEstimateForType(index, type);
  const latitude = estimate.latitude;
  const longitude = estimate.longitude;

  if (
    estimate.sourceState === 'unavailable' ||
    !isFiniteCoordinate(latitude, longitude)
  ) {
    if (options.log) {
      console.log(`[REMOTENESS] destination_unavailable type=${type} reason=${estimate.source || 'missing coordinates'}`);
    }
    return null;
  }

  const label = (estimate.label ?? '').trim() || DESTINATION_LABELS[type];
  const destination: RemotenessDestination = {
    type,
    label,
    latitude: Number(latitude),
    longitude: Number(longitude),
    source: estimate.sourceState === 'cache' ? 'cache' : 'live',
    updatedAt: estimate.updatedAt,
  };

  if (estimate.distanceMi != null && Number.isFinite(estimate.distanceMi)) {
    destination.distanceMiles = estimate.distanceMi;
  }

  if (options.log) {
    console.log(`[REMOTENESS] destination_resolved type=${type} label=${destination.label} distance=${destination.distanceMiles ?? '--'}`);
  }
  return destination;
}

export function buildRemotenessDestinations(
  index: RemotenessIndexOutput | null,
): Record<RemotenessDestinationType, RemotenessDestination | null> {
  return {
    road: resolveRemotenessDestination(index, 'road'),
    town: resolveRemotenessDestination(index, 'town'),
    fuel: resolveRemotenessDestination(index, 'fuel'),
  };
}

export function formatRemotenessDistance(distanceMiles?: number): string {
  if (distanceMiles == null || !Number.isFinite(distanceMiles)) return '--';
  const normalized = Math.max(0, distanceMiles);
  if (normalized <= 0.05) return 'Here';
  if (normalized < 0.1) return `${Math.max(100, Math.round(normalized * 5280))} ft`;
  if (normalized < 10) return `${normalized.toFixed(1)} mi`;
  return `${Math.round(normalized)} mi`;
}
