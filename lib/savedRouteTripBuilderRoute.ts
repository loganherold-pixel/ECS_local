import type { TripBuilderRouteInput } from './tripBuilder/tripBuilderTypes';
import type { ImportedRoute, RouteSegment } from './routeStore';
import type { ECSRun, RunPoint } from './runStore';
import type { SavedRouteAsset } from './savedRouteAssets';

type Coordinate = {
  latitude: number;
  longitude: number;
};

type BuildSavedRouteTripBuilderInput = {
  route?: ImportedRoute | null;
  run?: ECSRun | null;
};

function isFiniteCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function routeSegmentToLine(segment: RouteSegment): [number, number][] {
  return segment.points
    .map((point) => [point.lon, point.lat] as [number, number])
    .filter(([longitude, latitude]) => isFiniteCoordinate(latitude, longitude));
}

function routeSegmentsToTrailGeometry(segments: RouteSegment[]): Coordinate[] {
  return segments.flatMap((segment) =>
    segment.points
      .map((point) => ({
        latitude: point.lat,
        longitude: point.lon,
      }))
      .filter((point) => isFiniteCoordinate(point.latitude, point.longitude)),
  );
}

function runPointToLine(points: RunPoint[]): [number, number][] {
  return points
    .map((point) => [point.lng, point.lat] as [number, number])
    .filter(([longitude, latitude]) => isFiniteCoordinate(latitude, longitude));
}

function runPointsToTrailGeometry(points: RunPoint[]): Coordinate[] {
  return points
    .map((point) => ({
      latitude: point.lat,
      longitude: point.lng,
    }))
    .filter((point) => isFiniteCoordinate(point.latitude, point.longitude));
}

function createRouteTripBuilderInput(
  asset: SavedRouteAsset,
  route: ImportedRoute,
): TripBuilderRouteInput | null {
  const routeGeometryCoordinates = route.segments
    .map(routeSegmentToLine)
    .filter((line) => line.length > 1);
  const trailGeometry = routeSegmentsToTrailGeometry(route.segments);

  if (routeGeometryCoordinates.length === 0 || trailGeometry.length < 2) {
    return null;
  }

  const startCoordinate = trailGeometry[0] ?? null;
  const endCoordinate = trailGeometry[trailGeometry.length - 1] ?? null;
  const source = route.source_format || asset.kind || 'saved_route';

  return {
    id: route.id,
    name: route.name || asset.title,
    title: route.name || asset.title,
    source,
    distanceMiles: route.total_distance_miles,
    total_distance_miles: route.total_distance_miles,
    coordinate: startCoordinate,
    destinationCoordinate: endCoordinate,
    endCoordinate,
    routeGeometry: {
      type: 'MultiLineString',
      coordinates: routeGeometryCoordinates,
    },
    routeGeometryStatus: 'trail_available',
    trailGeometry,
    segments: route.segments,
    routeMetadata: {
      sourceApp: route.source_app ?? 'ecs_saved_routes',
      sourceAssetId: asset.id,
      sourceLabel: asset.sourceLabel,
      sourceState: route.sync_status,
      sourceFormat: route.source_format,
      sourceRouteCategory: route.route_category ?? null,
      planningSource: 'saved_routes',
      savedRouteKind: asset.kind,
      importedRouteId: route.id,
      linkedRunId: route.linked_run_id ?? null,
      externalSourceId: route.external_source_id ?? null,
      externalSourceType: route.external_source_type ?? null,
    },
  };
}

function createRunTripBuilderInput(asset: SavedRouteAsset, run: ECSRun): TripBuilderRouteInput | null {
  const routeLine = runPointToLine(run.points);
  const trailGeometry = runPointsToTrailGeometry(run.points);

  if (routeLine.length < 2 || trailGeometry.length < 2) {
    return null;
  }

  const startCoordinate = trailGeometry[0] ?? null;
  const endCoordinate = trailGeometry[trailGeometry.length - 1] ?? null;
  const distanceMiles = Number.isFinite(run.stats.distance_miles) ? run.stats.distance_miles : null;

  return {
    id: run.id,
    name: run.title || asset.title,
    title: run.title || asset.title,
    source: run.source || asset.kind || 'saved_run',
    distanceMiles,
    total_distance_miles: distanceMiles,
    coordinate: startCoordinate,
    destinationCoordinate: endCoordinate,
    endCoordinate,
    routeGeometry: {
      type: 'MultiLineString',
      coordinates: [routeLine],
    },
    routeGeometryStatus: 'trail_available',
    trailGeometry,
    segments: [
      {
        points: run.points.map((point) => ({
          lat: point.lat,
          lon: point.lng,
          ele: point.ele_m ?? null,
        })),
      },
    ],
    routeMetadata: {
      sourceApp: run.source || 'ecs_saved_routes',
      sourceAssetId: asset.id,
      sourceLabel: asset.sourceLabel,
      sourceState: 'local',
      planningSource: 'saved_routes',
      savedRouteKind: asset.kind,
      runId: run.id,
      vehicleId: run.vehicle_id ?? null,
    },
  };
}

export function buildTripBuilderRouteFromSavedRouteAsset(
  asset: SavedRouteAsset,
  input: BuildSavedRouteTripBuilderInput,
): TripBuilderRouteInput | null {
  if (input.route) {
    return createRouteTripBuilderInput(asset, input.route);
  }

  if (input.run) {
    return createRunTripBuilderInput(asset, input.run);
  }

  return null;
}
