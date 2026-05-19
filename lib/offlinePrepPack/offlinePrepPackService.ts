import { generateGPX } from '../gpxExport';
import type { ImportedRoute, RouteSegment, RouteWaypoint } from '../routeStore';
import type {
  CampCandidate,
  ExitPoint,
  ResupplyPoint,
  TripBuilderCoordinate,
  TripBuilderRouteInput,
} from '../tripBuilder';
import type {
  OfflineMapPreparationAdapter,
  OfflinePrepPack,
  OfflinePrepPackBounds,
  OfflinePrepPackError,
  OfflinePrepPackInput,
  OfflinePrepPackItem,
  OfflinePrepPackItemAvailability,
  OfflinePrepPackItemType,
  OfflinePrepPackManifest,
  OfflinePrepPackProgress,
  OfflinePrepPackStatus,
} from './offlinePrepPackTypes';

type NormalizedPoint = TripBuilderCoordinate;

const DEFAULT_CORRIDOR_MILES = 3;
const MAX_AUTO_MAP_AREA_DEGREES = 8;

function finiteNumber(value: unknown): number | null {
  const next = typeof value === 'string' ? Number(value) : value;
  return typeof next === 'number' && Number.isFinite(next) ? next : null;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'offline-prep';
}

function routeName(route: TripBuilderRouteInput): string {
  return String(route.name ?? route.title ?? route.id ?? 'Selected Route');
}

function routeId(route: TripBuilderRouteInput): string {
  return String(route.id ?? route.name ?? route.title ?? 'selected-route');
}

function validCoordinate(latitude: number | null, longitude: number | null): TripBuilderCoordinate | null {
  if (
    latitude == null ||
    longitude == null ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function coordinateFromValue(value: unknown): TripBuilderCoordinate | null {
  if (Array.isArray(value)) return validCoordinate(finiteNumber(value[1]), finiteNumber(value[0]));
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  return validCoordinate(
    finiteNumber(record.latitude) ?? finiteNumber(record.lat),
    finiteNumber(record.longitude) ?? finiteNumber(record.lng) ?? finiteNumber(record.lon),
  );
}

function coordinatesFromGeoJson(value: unknown): NormalizedPoint[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  if (record.type === 'Feature') return coordinatesFromGeoJson(record.geometry);
  if (record.type === 'FeatureCollection' && Array.isArray(record.features)) {
    return record.features.flatMap(coordinatesFromGeoJson);
  }
  if (record.type === 'LineString' && Array.isArray(record.coordinates)) {
    return record.coordinates.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null);
  }
  if (record.type === 'MultiLineString' && Array.isArray(record.coordinates)) {
    return record.coordinates.flatMap((line) => Array.isArray(line)
      ? line.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null)
      : []);
  }
  if (Array.isArray(record.coordinates)) {
    return record.coordinates.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null);
  }
  return [];
}

export function getOfflinePrepRouteCoordinates(route: TripBuilderRouteInput): NormalizedPoint[] {
  const geometry = [
    ...coordinatesFromGeoJson(route.trailGeometry),
    ...coordinatesFromGeoJson(route.routeGeometry),
    ...coordinatesFromGeoJson(route.geojson),
  ];
  if (geometry.length >= 2) return geometry;

  for (const key of ['trailGeometry', 'routeGeometry'] as const) {
    const value = route[key];
    if (Array.isArray(value)) {
      const points = value.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null);
      if (points.length >= 2) return points;
    }
  }

  if (Array.isArray(route.segments)) {
    const points = route.segments.flatMap((segment) => {
      if (!segment || typeof segment !== 'object') return [];
      const raw = (segment as { points?: unknown }).points;
      return Array.isArray(raw) ? raw.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null) : [];
    });
    if (points.length >= 2) return points;
  }

  if (Array.isArray(route.waypoints)) {
    const points = route.waypoints.map(coordinateFromValue).filter((point): point is NormalizedPoint => point != null);
    if (points.length >= 2) return points;
  }

  const start = coordinateFromValue(
    typeof route.startLat === 'number' && typeof route.startLng === 'number'
      ? { latitude: route.startLat, longitude: route.startLng }
      : route.coordinate,
  );
  const end = coordinateFromValue(route.destinationCoordinate ?? route.endpointCoordinate ?? route.endCoordinate);
  return start && end ? [start, end] : [];
}

export function buildOfflinePrepRouteBounds(
  route: TripBuilderRouteInput,
  corridorMiles = DEFAULT_CORRIDOR_MILES,
): OfflinePrepPackBounds | null {
  const points = getOfflinePrepRouteCoordinates(route);
  if (points.length === 0) return null;

  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (const point of points) {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  }

  const bufferDeg = corridorMiles / 69;
  const avgLat = (minLat + maxLat) / 2;
  const lngBuffer = bufferDeg / Math.max(0.25, Math.cos((avgLat * Math.PI) / 180));
  return {
    minLat: Math.max(-90, minLat - bufferDeg),
    maxLat: Math.min(90, maxLat + bufferDeg),
    minLng: Math.max(-180, minLng - lngBuffer),
    maxLng: Math.min(180, maxLng + lngBuffer),
    corridorMiles,
  };
}

function boundsArea(bounds: OfflinePrepPackBounds | null): number | null {
  if (!bounds) return null;
  return Math.max(0, bounds.maxLat - bounds.minLat) * Math.max(0, bounds.maxLng - bounds.minLng);
}

function makeError(id: string, itemType: OfflinePrepPackItemType | null, message: string, recoverable = true): OfflinePrepPackError {
  return { id, itemType, message, recoverable };
}

function item(input: {
  type: OfflinePrepPackItemType;
  label: string;
  status: OfflinePrepPackStatus;
  availability: OfflinePrepPackItemAvailability;
  required?: boolean;
  source: string;
  summary: string;
  count?: number | null;
  estimatedSizeMB?: number | null;
  cacheKey?: string | null;
  error?: OfflinePrepPackError | null;
  metadata?: Record<string, unknown> | null;
}): OfflinePrepPackItem {
  return {
    id: `offline-prep-${input.type}`,
    required: input.required ?? false,
    count: null,
    estimatedSizeMB: null,
    cacheKey: null,
    error: null,
    metadata: null,
    ...input,
  };
}

function countArray(value: unknown[] | null | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

function pointsFromTripPlan(input: OfflinePrepPackInput): {
  campsites: CampCandidate[];
  exits: ExitPoint[];
  resupply: ResupplyPoint[];
} {
  const campsites = [...(input.campsiteCandidates ?? [])];
  if (input.tripPlan?.primaryCampCandidate) campsites.push(input.tripPlan.primaryCampCandidate);
  if (input.tripPlan?.backupCampCandidate) campsites.push(input.tripPlan.backupCampCandidate);

  const exits = [...(input.exitPoints ?? [])];
  if (input.tripPlan?.primaryExitPoint) exits.push(input.tripPlan.primaryExitPoint);

  const resupply = [...(input.resupplyPoints ?? [])];
  const smart = input.smartResupplyPlan ?? input.tripPlan?.smartResupplyPlan ?? null;
  if (smart) {
    [
      smart.fuel.keyPoint,
      smart.water.keyPoint,
      smart.supplies.keyPoint,
      smart.repair.keyPoint,
      smart.medical.keyPoint,
      smart.exitAccess.keyPoint,
    ].forEach((point) => {
      if (point && point.category !== 'exit_access') resupply.push(point);
    });
  }

  return {
    campsites: dedupeById(campsites),
    exits: dedupeById(exits),
    resupply: dedupeById(resupply),
  };
}

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((entry) => {
    if (seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function routeToImportedRoute(route: TripBuilderRouteInput, points: NormalizedPoint[]): ImportedRoute | null {
  if (points.length < 2) return null;
  const waypoints: RouteWaypoint[] = Array.isArray(route.waypoints)
    ? route.waypoints
      .map((waypoint): RouteWaypoint | null => {
        const coordinate = coordinateFromValue(waypoint);
        if (!coordinate) return null;
        const record = waypoint && typeof waypoint === 'object' ? waypoint as Record<string, unknown> : {};
        return {
          lat: coordinate.latitude,
          lon: coordinate.longitude,
          ele: finiteNumber(record.ele) ?? null,
          name: typeof record.name === 'string' ? record.name : typeof record.title === 'string' ? record.title : null,
          time: typeof record.time === 'string' ? record.time : null,
          waypointType: typeof record.waypointType === 'string' ? record.waypointType as RouteWaypoint['waypointType'] : null,
        };
      })
      .filter((point): point is RouteWaypoint => point != null)
    : [];
  const segment: RouteSegment = {
    points: points.map((point) => ({ lat: point.latitude, lon: point.longitude, ele: null })),
  };
  return {
    id: routeId(route),
    user_id: null,
    device_id: 'offline-prep',
    name: routeName(route),
    description: 'Offline Prep Pack GPX export',
    source_format: 'custom',
    source_app: 'ECS Trip Builder',
    route_category: 'custom',
    linked_run_id: null,
    total_distance_miles: finiteNumber(route.distanceMiles) ?? finiteNumber(route.total_distance_miles) ?? 0,
    elevation_gain_ft: finiteNumber(route.elevationGainFt),
    waypoint_count: waypoints.length,
    segment_count: 1,
    waypoints,
    segments: [segment],
    is_active: false,
    sync_status: 'local',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function defaultOfflineMapAdapter(): OfflineMapPreparationAdapter {
  return {
    prepareRouteRegion({ routeId, routeName, bounds, routePointCount }) {
      if (!bounds || routePointCount < 2) {
        return {
          supported: false,
          status: 'unavailable',
          availability: 'unavailable',
          summary: 'Offline map download is not available yet because route geometry is missing.',
          error: 'Route geometry data unavailable.',
        };
      }

      if ((boundsArea(bounds) ?? 0) > MAX_AUTO_MAP_AREA_DEGREES) {
        return {
          supported: true,
          status: 'unavailable',
          availability: 'unavailable',
          summary: 'Offline map download is not available yet for this route size.',
          error: 'Route bounds exceed the automatic offline prep limit.',
          metadata: { bounds, routePointCount },
        };
      }

      try {
        const { tileCacheStore } = require('../tileCacheStore');
        const regions = typeof tileCacheStore?.getRegions === 'function' ? tileCacheStore.getRegions() : [];
        const matching = regions.find((region: any) => {
          if (region.routeId === routeId && (region.status === 'complete' || region.status === 'partial')) return true;
          const rb = region.bounds;
          return rb &&
            rb.minLat <= bounds.minLat &&
            rb.maxLat >= bounds.maxLat &&
            rb.minLng <= bounds.minLng &&
            rb.maxLng >= bounds.maxLng &&
            (region.status === 'complete' || region.status === 'partial');
        });
        if (matching?.status === 'complete') {
          return {
            supported: true,
            status: 'ready',
            availability: 'already_cached',
            summary: `Offline map region already cached for ${routeName}.`,
            estimatedSizeMB: matching.actualSizeMB ?? matching.estimatedSizeMB ?? null,
            cacheKey: matching.id,
            metadata: { bounds, regionId: matching.id, cacheStatus: matching.status },
          };
        }
        return {
          supported: true,
          status: 'not_started',
          availability: 'pending_download',
          summary: 'Offline map download is pending. This screen does not start the download yet.',
          metadata: { bounds, routePointCount },
        };
      } catch {
        return {
          supported: false,
          status: 'unavailable',
          availability: 'unavailable',
          summary: 'Offline map download is not available yet in this runtime.',
          error: 'Offline map cache adapter unavailable.',
          metadata: { bounds, routePointCount },
        };
      }
    },
  };
}

function buildOfflineMapItem(
  input: OfflinePrepPackInput,
  bounds: OfflinePrepPackBounds | null,
  routePointCount: number,
  adapter: OfflineMapPreparationAdapter,
): OfflinePrepPackItem {
  const result = adapter.prepareRouteRegion({
    routeId: routeId(input.route),
    routeName: routeName(input.route),
    bounds,
    routePointCount,
  });
  const error = result.error
    ? makeError('offline-map-unavailable', 'offline_map', result.error)
    : null;
  return item({
    type: 'offline_map',
    label: 'Offline Map',
    status: result.status,
    availability: result.availability,
    required: true,
    source: result.supported ? 'tile_cache_store' : 'offline_map_adapter',
    summary: result.summary,
    estimatedSizeMB: result.estimatedSizeMB ?? null,
    cacheKey: result.cacheKey ?? null,
    error,
    metadata: result.metadata ?? null,
  });
}

function buildGpxItem(input: OfflinePrepPackInput, points: NormalizedPoint[]): OfflinePrepPackItem {
  const importedRoute = routeToImportedRoute(input.route, points);
  if (!importedRoute) {
    const error = makeError('gpx-route-geometry-missing', 'gpx_export', 'GPX export is not supported in this build without route geometry.');
    return item({
      type: 'gpx_export',
      label: 'GPX Export',
      status: 'unavailable',
      availability: 'unavailable',
      source: 'gpx_export',
      summary: 'GPX export is not supported in this build without route geometry.',
      error,
    });
  }
  const gpx = generateGPX(importedRoute, { creator: 'Expedition Command System', description: 'Offline Prep Pack route export.' });
  return item({
    type: 'gpx_export',
    label: 'GPX Export',
    status: 'ready',
    availability: 'available',
    source: 'gpx_export',
    summary: 'GPX route export is available from the selected route.',
    estimatedSizeMB: Math.max(0.01, Math.round((gpx.length / 1024 / 1024) * 100) / 100),
    metadata: { filename: `${slug(importedRoute.name)}.gpx`, bytes: gpx.length },
  });
}

function buildTripSheetItem(input: OfflinePrepPackInput): OfflinePrepPackItem {
  if (!input.tripPlan) {
    return item({
      type: 'trip_sheet',
      label: 'Trip Sheet',
      status: 'unavailable',
      availability: 'unavailable',
      source: 'trip_builder',
      summary: 'Trip sheet is not supported until a Trip Builder plan exists.',
      error: makeError('trip-sheet-plan-missing', 'trip_sheet', 'TripPlan is unavailable.'),
    });
  }
  return item({
    type: 'trip_sheet',
    label: 'Trip Sheet',
    status: 'ready',
    availability: 'available',
    source: 'trip_builder_json_summary',
    summary: 'Trip sheet summary is available from the generated Trip Builder plan.',
    metadata: {
      planId: input.tripPlan.id,
      stopCount: input.tripPlan.suggestedStops.length,
      warningCount: input.tripPlan.warnings.length,
    },
  });
}

function buildManifestProgress(items: OfflinePrepPackItem[]): OfflinePrepPackProgress {
  const readyItems = items.filter((entry) => entry.status === 'ready').length;
  const unavailableItems = items.filter((entry) => entry.status === 'unavailable').length;
  const failedItems = items.filter((entry) => entry.status === 'failed').length;
  const activeItems = items.filter((entry) => entry.status === 'preparing' || entry.status === 'downloading').length;
  const requiredItems = items.filter((entry) => entry.required);
  let status: OfflinePrepPackStatus = 'not_started';
  if (failedItems > 0) status = 'failed';
  else if (activeItems > 0) status = items.some((entry) => entry.status === 'downloading') ? 'downloading' : 'preparing';
  else if (requiredItems.some((entry) => entry.status === 'unavailable')) status = 'partially_ready';
  else if (readyItems === items.length) status = 'ready';
  else if (readyItems > 0 || unavailableItems > 0) status = 'partially_ready';

  return {
    status,
    totalItems: items.length,
    readyItems,
    unavailableItems,
    failedItems,
    percent: items.length === 0 ? 0 : Math.round((readyItems / items.length) * 100),
  };
}

export function buildOfflinePrepPackManifest(
  input: OfflinePrepPackInput,
  options: { offlineMapAdapter?: OfflineMapPreparationAdapter | null } = {},
): OfflinePrepPackManifest {
  const generatedAt = input.capturedAt ?? new Date().toISOString();
  const points = getOfflinePrepRouteCoordinates(input.route);
  const bounds = buildOfflinePrepRouteBounds(input.route);
  const route = input.route;
  const routeKey = routeId(route);
  const derived = pointsFromTripPlan(input);
  const smart = input.smartResupplyPlan ?? input.tripPlan?.smartResupplyPlan ?? null;
  const adapter = options.offlineMapAdapter ?? defaultOfflineMapAdapter();

  const items: OfflinePrepPackItem[] = [
    buildOfflineMapItem(input, bounds, points.length, adapter),
    item({
      type: 'route_line',
      label: 'Route Line',
      status: points.length >= 2 ? 'ready' : 'unavailable',
      availability: points.length >= 2 ? 'available' : 'unavailable',
      required: true,
      source: 'selected_route',
      summary: points.length >= 2 ? `${points.length} route points are available for offline prep.` : 'Route geometry data unavailable.',
      count: points.length,
      error: points.length >= 2 ? null : makeError('route-line-missing', 'route_line', 'Route geometry is missing.'),
    }),
    item({
      type: 'waypoints',
      label: 'Waypoints',
      status: countArray(route.waypoints) > 0 ? 'ready' : 'unavailable',
      availability: countArray(route.waypoints) > 0 ? 'available' : 'unavailable',
      source: 'selected_route',
      summary: countArray(route.waypoints) > 0 ? 'Route waypoints can be saved with the pack.' : 'No known waypoint source detected.',
      count: countArray(route.waypoints),
    }),
    item({
      type: 'campsites',
      label: 'Campsites',
      status: derived.campsites.length > 0 ? 'ready' : 'unavailable',
      availability: derived.campsites.length > 0 ? 'available' : 'unavailable',
      source: 'trip_builder_camps',
      summary: derived.campsites.length > 0 ? 'Camp candidates can be saved with the pack.' : 'No known camp source detected.',
      count: derived.campsites.length,
    }),
    item({
      type: 'exit_points',
      label: 'Exit Points',
      status: derived.exits.length > 0 ? 'ready' : 'unavailable',
      availability: derived.exits.length > 0 ? 'available' : 'unavailable',
      required: true,
      source: 'trip_builder_exits',
      summary: derived.exits.length > 0 ? 'Known exit points can be saved.' : 'No known exit source detected.',
      count: derived.exits.length,
      error: derived.exits.length > 0 ? null : makeError('exit-points-missing', 'exit_points', 'Exit access data unavailable.'),
    }),
    item({
      type: 'resupply_points',
      label: 'Resupply Points',
      status: derived.resupply.length > 0 ? 'ready' : 'unavailable',
      availability: derived.resupply.length > 0 ? 'available' : 'unavailable',
      source: 'smart_resupply_plan',
      summary: derived.resupply.length > 0 ? 'Known resupply points can be saved.' : 'No known resupply source detected.',
      count: derived.resupply.length,
    }),
    item({
      type: 'emergency_points',
      label: 'Emergency Points',
      status: countArray(input.emergencyPoints) > 0 ? 'ready' : 'unavailable',
      availability: countArray(input.emergencyPoints) > 0 ? 'available' : 'unavailable',
      source: 'emergency_support_points',
      summary: countArray(input.emergencyPoints) > 0 ? 'Emergency/support points can be saved.' : 'No known emergency support source detected.',
      count: countArray(input.emergencyPoints),
    }),
    item({
      type: 'vehicle_readiness_summary',
      label: 'Vehicle Readiness',
      status: input.readiness || input.tripPlan?.readinessReference || input.vehicleProfile ? 'ready' : 'unavailable',
      availability: input.readiness || input.tripPlan?.readinessReference || input.vehicleProfile ? 'available' : 'unavailable',
      source: 'readiness_vehicle_profile',
      summary: input.readiness || input.tripPlan?.readinessReference || input.vehicleProfile
        ? 'Vehicle/readiness summary can be included.'
        : 'Vehicle readiness data unavailable.',
    }),
    item({
      type: 'trip_itinerary',
      label: 'Trip Itinerary',
      status: input.tripPlan ? 'ready' : 'unavailable',
      availability: input.tripPlan ? 'available' : 'unavailable',
      required: true,
      source: 'trip_builder',
      summary: input.tripPlan ? 'Trip Builder itinerary can be saved.' : 'Trip itinerary data unavailable until a Trip Builder plan exists.',
      count: input.tripPlan?.suggestedStops.length ?? 0,
      error: input.tripPlan ? null : makeError('trip-itinerary-missing', 'trip_itinerary', 'Trip plan data unavailable.'),
    }),
    item({
      type: 'smart_resupply_summary',
      label: 'Smart Resupply Summary',
      status: smart ? 'ready' : 'unavailable',
      availability: smart ? 'available' : 'unavailable',
      source: 'smart_resupply_plan',
      summary: smart ? `Smart Resupply summary is available with ${smart.warnings.length} item${smart.warnings.length === 1 ? '' : 's'} to verify.` : 'Smart Resupply data unavailable.',
    }),
    item({
      type: 'weather_snapshot',
      label: 'Weather Snapshot',
      status: input.weatherSnapshot ? 'ready' : 'unavailable',
      availability: input.weatherSnapshot ? 'available' : 'unavailable',
      source: 'weather_snapshot',
      summary: input.weatherSnapshot ? 'Weather snapshot can be saved.' : 'No known weather snapshot source detected.',
    }),
    buildGpxItem(input, points),
    buildTripSheetItem(input),
  ];

  const errors = items.map((entry) => entry.error).filter((error): error is OfflinePrepPackError => !!error);
  const progress = buildManifestProgress(items);
  return {
    id: `offline-prep-${slug(routeKey)}`,
    generatedAt,
    routeId: routeKey,
    routeName: routeName(route),
    routeBounds: bounds,
    items,
    progress,
    errors,
  };
}

export function buildOfflinePrepPack(
  input: OfflinePrepPackInput,
  options: { offlineMapAdapter?: OfflineMapPreparationAdapter | null } = {},
): OfflinePrepPack {
  const manifest = buildOfflinePrepPackManifest(input, options);
  return {
    id: manifest.id,
    status: manifest.progress.status,
    manifest,
    createdAt: manifest.generatedAt,
    updatedAt: manifest.generatedAt,
  };
}
