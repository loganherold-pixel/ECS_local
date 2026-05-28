import * as assert from 'assert';

import {
  DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
  findDispersedCampingRegionsNearRoute,
  getDispersedCampingRouteDistanceByRegionId,
  getDispersedCampingRouteNearbyIdSet,
  hasRouteGeometryForDispersedCampingSearch,
  type RouteNearbyDispersedCampingRegion,
} from '../../lib/map/dispersedCampingRouteSearch';
import { toDispersedCampingFeatureCollection } from '../../lib/map/dispersedCampingGeojsonAdapter';
import type { DispersedCampingRegion, GeoJSON } from '../../lib/map/dispersedCampingTypes';

function square(id: string, longitude: number, latitude: number): GeoJSON.Polygon {
  return {
    type: 'Polygon',
    coordinates: [[
      [longitude, latitude],
      [longitude + 0.04, latitude],
      [longitude + 0.04, latitude + 0.04],
      [longitude, latitude + 0.04],
      [longitude, latitude],
    ]],
  };
}

function region(
  id: string,
  confidence: DispersedCampingRegion['confidence'],
  landManager: DispersedCampingRegion['landManager'],
  longitude: number,
  latitude: number,
): DispersedCampingRegion {
  return {
    id,
    geometry: square(id, longitude, latitude),
    landManager,
    confidence,
    eligibilityLabel: confidence === 'verify' ? 'Verify locally' : 'Likely eligible',
    basis: [`${landManager} source boundary`],
    restrictions: ['Verify locally'],
    sourceNames: ['Unit route source'],
    requiresVerification: true,
  };
}

const route = [
  { lat: 37.0, lng: -119.0 },
  { lat: 37.35, lng: -119.0 },
];

const regions: DispersedCampingRegion[] = [
  region('verify-near', 'verify', 'UNKNOWN', -119.01, 37.05),
  region('medium-near', 'medium', 'USFS', -119.015, 37.12),
  region('high-near', 'high', 'BLM', -119.02, 37.2),
  region('restricted-near', 'restricted', 'PRIVATE', -119.01, 37.26),
  region('high-far', 'high', 'BLM', -119.45, 37.2),
];

assert.strictEqual(hasRouteGeometryForDispersedCampingSearch(route), true);
assert.strictEqual(hasRouteGeometryForDispersedCampingSearch([route[0]]), false);

const results = findDispersedCampingRegionsNearRoute({
  regions,
  routeCoordinates: route,
  currentLocation: route[0],
  corridorMiles: DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
  maxResults: 3,
});

assert.deepStrictEqual(
  results.map((result: RouteNearbyDispersedCampingRegion) => result.regionId),
  ['medium-near', 'high-near', 'verify-near'],
  'Route search should sort by distance inside the 5-mile corridor and exclude restricted regions.',
);
assert.ok(results.every((result) => result.confidence !== 'restricted'));
assert.ok(results.every((result) => (result.distanceFromRouteMiles ?? 999) <= 5));

const distanceFirstResults = findDispersedCampingRegionsNearRoute({
  regions: [
    region('high-edge', 'high', 'BLM', -119.09, 37.16),
    region('medium-crossing', 'medium', 'USFS', -119.005, 37.16),
  ],
  routeCoordinates: route,
  corridorMiles: DEFAULT_DISPERSED_CAMPING_ROUTE_CORRIDOR_MILES,
  maxResults: 2,
});
assert.deepStrictEqual(
  distanceFirstResults.map((result) => result.regionId),
  ['medium-crossing', 'high-edge'],
  'Route search should favor regions closest to the active route before confidence ties.',
);

const limitedResults = findDispersedCampingRegionsNearRoute({
  regions,
  routeCoordinates: route,
  corridorMiles: 5,
  maxResults: 2,
});
assert.strictEqual(limitedResults.length, 2, 'Route summary should cap visible results.');

const noRouteResults = findDispersedCampingRegionsNearRoute({
  regions,
  routeCoordinates: [],
});
assert.strictEqual(noRouteResults.length, 0, 'No route should produce no route-aware results.');

const nearbyIds = getDispersedCampingRouteNearbyIdSet(results);
const distanceById = getDispersedCampingRouteDistanceByRegionId(results);
const geojson = toDispersedCampingFeatureCollection(regions, {
  routeNearbyRegionIds: nearbyIds,
  routeDistanceByRegionId: distanceById,
  routeCorridorMiles: 5,
});

const highFeature = geojson.features.find((feature) => feature.id === 'high-near');
const farFeature = geojson.features.find((feature) => feature.id === 'high-far');
assert.strictEqual(highFeature?.properties.routeNearby, true);
assert.strictEqual(farFeature?.properties.routeNearby, false);
assert.strictEqual(highFeature?.properties.routeCorridorMiles, 5);
assert.strictEqual(typeof highFeature?.properties.distanceFromRouteMiles, 'number');

console.log('Dispersed camping route search tests passed.');
