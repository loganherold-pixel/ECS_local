import {
  buildDispersedCampingCaveats,
  classifyDispersedCampingRegion,
  getDispersedCampingEligibilityLabel,
  getDispersedCampingStyleKey,
} from './dispersedCampingEligibility';
import type { PublicLandEligibilitySourceRecord } from './publicLandSources';
import type {
  DispersedCampingEligibilityFeature,
  DispersedCampingEligibilityFeatureCollection,
  DispersedCampingRegion,
} from './dispersedCampingTypes';

export type DispersedCampingFeatureCollectionOptions = {
  routeNearbyRegionIds?: Set<string> | string[];
  routeDistanceByRegionId?: Record<string, number>;
  routeCorridorMiles?: number;
};

export function buildDispersedCampingRegionFromSource(
  source: PublicLandEligibilitySourceRecord,
): DispersedCampingRegion {
  const confidence = classifyDispersedCampingRegion(source);
  const closureKnown = typeof source.knownClosure === 'boolean';
  const fireRestrictionKnown = typeof source.fireRestriction === 'boolean';
  const permitStatusKnown = typeof source.permitRequired === 'boolean';
  const accessKnown =
    typeof source.hasMvumAccessNearby === 'boolean' || typeof source.accessType === 'string';

  const basis = [
    `${source.landManager} source boundary`,
    source.designation ? `Designation: ${source.designation}` : null,
    source.accessType ? `Access: ${source.accessType}` : null,
    source.hasMvumAccessNearby ? 'MVUM/access signal nearby' : null,
  ].filter((item): item is string => !!item);

  const restrictions = [
    !permitStatusKnown ? 'Permit status needs verification' : null,
    !fireRestrictionKnown ? 'Fire restriction status needs verification' : null,
    !closureKnown ? 'Closure status needs verification' : null,
    !accessKnown ? 'Access status needs verification' : null,
    source.knownClosure ? 'Known closure signal present' : null,
    source.permitRequired ? 'Permit may be required' : null,
    source.fireRestriction ? 'Fire restriction signal present' : null,
  ].filter((item): item is string => !!item);

  return {
    id: source.id,
    name: source.name,
    geometry: source.geometry,
    landManager: source.landManager,
    confidence,
    eligibilityLabel: getDispersedCampingEligibilityLabel(confidence),
    basis,
    restrictions,
    sourceNames: source.sourceNames,
    source: source.source,
    sourceProvider: source.sourceProvider,
    sourceUpdatedAt: source.sourceUpdatedAt,
    requiresVerification: confidence !== 'restricted' ? true : true,
    permitRequired: source.permitRequired,
    fireRestrictionKnown,
    seasonalAccessKnown: accessKnown,
    closureKnown,
  };
}

export function toDispersedCampingFeatureCollection(
  regions: DispersedCampingRegion[],
  options: DispersedCampingFeatureCollectionOptions = {},
): DispersedCampingEligibilityFeatureCollection {
  const routeNearbyRegionIds =
    options.routeNearbyRegionIds instanceof Set
      ? options.routeNearbyRegionIds
      : new Set(options.routeNearbyRegionIds ?? []);

  return {
    type: 'FeatureCollection',
    features: regions.map((region): DispersedCampingEligibilityFeature => ({
      type: 'Feature',
      id: region.id,
      geometry: region.geometry,
      properties: {
        id: region.id,
        name: region.name,
        confidence: region.confidence,
        landManager: region.landManager,
        eligibilityLabel: region.eligibilityLabel as DispersedCampingEligibilityFeature['properties']['eligibilityLabel'],
        basis: region.basis,
        restrictions: buildDispersedCampingCaveats(region),
        sourceNames: region.sourceNames,
        source: region.source,
        sourceProvider: region.sourceProvider,
        sourceUpdatedAt: region.sourceUpdatedAt,
        requiresVerification: region.requiresVerification,
        permitRequired: region.permitRequired,
        fireRestrictionKnown: region.fireRestrictionKnown,
        seasonalAccessKnown: region.seasonalAccessKnown,
        closureKnown: region.closureKnown,
        routeNearby: routeNearbyRegionIds.has(region.id),
        distanceFromRouteMiles: options.routeDistanceByRegionId?.[region.id],
        routeCorridorMiles: options.routeCorridorMiles,
      },
    })),
  };
}

export function toDispersedCampingRegions(
  sources: PublicLandEligibilitySourceRecord[],
): DispersedCampingRegion[] {
  return sources.map(buildDispersedCampingRegionFromSource);
}

export { getDispersedCampingStyleKey };
