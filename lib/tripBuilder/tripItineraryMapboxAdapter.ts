import type {
  GeoPoint,
  ItineraryPhase,
  ItineraryRoute,
  ItineraryStop,
  ItineraryWaypoint,
  RouteSegment,
  TripItinerary,
  WaypointType,
} from './tripBuilderTypes';
import { buildTripBuilderCanonicalRouteSpine } from './tripBuilderCanonicalRouteSpine';

export type TripItineraryRenderRole =
  | 'road_approach'
  | 'pre_trail_resupply'
  | 'trail_start'
  | 'trail_line'
  | 'camp_potential'
  | 'scenic_stop'
  | 'bailout'
  | 'hazard'
  | 'turnaround'
  | 'trail_end'
  | 'exit_route'
  | 'user_added'
  | 'waypoint';

export type TripItineraryMapGeometry =
  | {
      type: 'LineString';
      coordinates: [number, number][];
    }
  | {
      type: 'Point';
      coordinates: [number, number];
    };

export type TripItineraryMapFeatureProperties = {
  id: string;
  itineraryId: string;
  sourceRouteId?: string | null;
  featureKind: 'route_segment' | 'waypoint' | 'stop';
  renderRole: TripItineraryRenderRole;
  phase: ItineraryPhase;
  waypointType?: WaypointType | null;
  routeId?: string | null;
  segmentId?: string | null;
  waypointId?: string | null;
  stopId?: string | null;
  title?: string | null;
  sequence?: number | null;
  confidence?: string | null;
  sourceLabel?: string | null;
  dataState?: string | null;
  routeGeometryStatus?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type TripItineraryMapFeature = {
  type: 'Feature';
  id: string;
  geometry: TripItineraryMapGeometry;
  properties: TripItineraryMapFeatureProperties;
};

export type TripItineraryMapFeatureCollection = {
  type: 'FeatureCollection';
  features: TripItineraryMapFeature[];
};

export type TripItineraryLegacyRoutePoint = {
  latitude: number;
  longitude: number;
  phase: ItineraryPhase;
  renderRole: TripItineraryRenderRole;
};

export type TripItineraryLegacySegment = {
  id: string;
  coordinates: [number, number][];
  kind: string;
  name: string | null;
  category: string;
  categoryLabel: string;
};

export type TripItineraryLegacyMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle?: string;
  type: string;
  category?: string;
  mapChar?: string;
};

export type TripItineraryMapboxRenderData = {
  itineraryId: string;
  routeFeatureCollection: TripItineraryMapFeatureCollection;
  alternateRouteFeatureCollection: TripItineraryMapFeatureCollection;
  pointFeatureCollection: TripItineraryMapFeatureCollection;
  featureCollection: TripItineraryMapFeatureCollection;
  legacyMapRenderer: {
    points: TripItineraryLegacyRoutePoint[];
    segments: TripItineraryLegacySegment[];
    trailSegments: TripItineraryLegacySegment[];
    alternateSegments: TripItineraryLegacySegment[];
    waypoints: TripItineraryLegacyMarker[];
    bailoutMarkers: TripItineraryLegacyMarker[];
    pinMarkers: TripItineraryLegacyMarker[];
  };
  metadata: {
    routeFeatureCount: number;
    alternateRouteFeatureCount: number;
    pointFeatureCount: number;
    approachGeometryAvailable: boolean;
    trailGeometryAvailable: boolean;
    exitGeometryAvailable: boolean;
    missingGeometryPhases: ItineraryPhase[];
  };
};

function isFiniteCoordinate(point: GeoPoint | null | undefined): point is GeoPoint {
  return !!point &&
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    Math.abs(point.latitude) <= 90 &&
    Math.abs(point.longitude) <= 180;
}

function toPosition(point: GeoPoint): [number, number] {
  return [point.longitude, point.latitude];
}

function normalizeGeometry(points?: GeoPoint[] | null): GeoPoint[] {
  if (!Array.isArray(points)) return [];
  const normalized: GeoPoint[] = [];
  points.forEach((point) => {
    if (!isFiniteCoordinate(point)) return;
    const previous = normalized[normalized.length - 1];
    if (
      previous &&
      Math.abs(previous.latitude - point.latitude) < 0.000001 &&
      Math.abs(previous.longitude - point.longitude) < 0.000001
    ) {
      return;
    }
    normalized.push(point);
  });
  return normalized;
}

function renderRoleForRoute(phase: ItineraryPhase): TripItineraryRenderRole {
  if (phase === 'approach') return 'road_approach';
  if (phase === 'trail_navigation') return 'trail_line';
  if (phase === 'trail_exit') return 'exit_route';
  return 'waypoint';
}

function renderRoleForWaypoint(type: WaypointType): TripItineraryRenderRole {
  switch (type) {
    case 'trailhead_start':
      return 'trail_start';
    case 'fuel':
    case 'grocery':
    case 'water':
    case 'supply':
      return 'pre_trail_resupply';
    case 'camp_potential':
      return 'camp_potential';
    case 'scenic_stop':
      return 'scenic_stop';
    case 'bailout':
      return 'bailout';
    case 'hazard':
      return 'hazard';
    case 'turnaround':
      return 'turnaround';
    case 'trail_end':
      return 'trail_end';
    case 'exit':
      return 'exit_route';
    case 'user_added':
      return 'user_added';
    default:
      return 'waypoint';
  }
}

function sourceMetadata(item: {
  source?: { label?: string; state?: string } | null;
  confidence?: string | null;
  metadata?: Record<string, unknown> | null;
}): Pick<TripItineraryMapFeatureProperties, 'confidence' | 'sourceLabel' | 'dataState' | 'metadata'> {
  return {
    confidence: item.confidence ?? null,
    sourceLabel: item.source?.label ?? null,
    dataState: item.source?.state ?? null,
    metadata: item.metadata ?? null,
  };
}

function routeFeature(args: {
  itinerary: TripItinerary;
  route: ItineraryRoute;
  segment: RouteSegment | null;
  geometry: GeoPoint[];
  index: number;
}): TripItineraryMapFeature | null {
  if (args.geometry.length < 2) return null;
  const segmentId = args.segment?.id ?? `${args.route.id}-geometry`;
  const title = args.segment?.title ?? args.route.title;
  const source = args.segment?.source ?? args.route.source;
  const confidence = args.segment?.confidence ?? args.route.confidence;
  const metadata = {
    ...(args.route.metadata ?? {}),
    ...(args.segment?.metadata ?? {}),
  };
  const renderRole = renderRoleForRoute(args.route.phase);
  return {
    type: 'Feature',
    id: segmentId,
    geometry: {
      type: 'LineString',
      coordinates: args.geometry.map(toPosition),
    },
    properties: {
      id: segmentId,
      itineraryId: args.itinerary.id,
      sourceRouteId: args.itinerary.sourceRouteId ?? null,
      featureKind: 'route_segment',
      renderRole,
      phase: args.route.phase,
      waypointType: null,
      routeId: args.route.id,
      segmentId,
      title,
      sequence: args.segment?.sequence ?? args.index + 1,
      confidence: confidence ?? null,
      sourceLabel: source?.label ?? null,
      dataState: source?.state ?? null,
      routeGeometryStatus: args.itinerary.routeGeometryStatus,
      metadata,
    },
  };
}

function routeFeaturesForRoute(itinerary: TripItinerary, route?: ItineraryRoute | null): TripItineraryMapFeature[] {
  if (!route) return [];
  const segmentFeatures = (route.segments ?? [])
    .map((segment, index) => routeFeature({
      itinerary,
      route,
      segment,
      geometry: normalizeGeometry(segment.geometry),
      index,
    }))
    .filter((feature): feature is TripItineraryMapFeature => feature != null);
  if (segmentFeatures.length > 0) return segmentFeatures;
  const fallback = routeFeature({
    itinerary,
    route,
    segment: null,
    geometry: normalizeGeometry(route.geometry),
    index: 0,
  });
  return fallback ? [fallback] : [];
}

function primarySpineFeature(itinerary: TripItinerary): TripItineraryMapFeature | null {
  const trailGeometry = normalizeGeometry(itinerary.trailRoute?.geometry);
  if (trailGeometry.length >= 2) {
    const approachGeometry = normalizeGeometry(itinerary.approachRoute?.geometry);
    const trailMetadata = itinerary.trailRoute?.metadata ?? {};
    const itineraryMetadata = itinerary.metadata ?? {};
    const spine = buildTripBuilderCanonicalRouteSpine({
      route: {
        id: itinerary.sourceRouteId ?? itinerary.id,
        routeType: trailMetadata.routeType ?? itineraryMetadata.routeType ?? null,
        allowLoopGuidance: trailMetadata.allowLoopGuidance ?? itineraryMetadata.allowLoopGuidance ?? false,
        trailheadStart: itinerary.trailheadStart?.coordinate ?? itinerary.trailheadStartCandidate?.coordinate ?? null,
        trailEnd: itinerary.trailEnd?.coordinate ?? trailGeometry[trailGeometry.length - 1],
        trailGeometry,
        routeMetadata: {
          isTrailGeometry: true,
          geometryRole: 'trail',
          routeType: trailMetadata.routeType ?? itineraryMetadata.routeType ?? null,
          allowLoopGuidance: trailMetadata.allowLoopGuidance ?? itineraryMetadata.allowLoopGuidance ?? false,
        },
      },
      origin: itinerary.userStart ?? null,
      approachGeometry,
      trailhead: itinerary.trailheadStart?.coordinate ?? itinerary.trailheadStartCandidate?.coordinate ?? null,
      trailEnd: itinerary.trailEnd?.coordinate ?? trailGeometry[trailGeometry.length - 1],
      includeApproach: true,
    });
    if (spine.lineString) {
      const id = `${itinerary.id}-primary-spine`;
      return {
        type: 'Feature',
        id,
        geometry: spine.lineString,
        properties: {
          id,
          itineraryId: itinerary.id,
          sourceRouteId: itinerary.sourceRouteId ?? null,
          featureKind: 'route_segment',
          renderRole: 'trail_line',
          phase: 'trail_navigation',
          waypointType: null,
          routeId: itinerary.trailRoute?.id ?? null,
          segmentId: id,
          title: itinerary.trailRoute?.title ?? 'Primary route spine',
          sequence: 1,
          confidence: itinerary.trailRoute?.confidence ?? null,
          sourceLabel: itinerary.trailRoute?.source?.label ?? null,
          dataState: itinerary.trailRoute?.source?.state ?? null,
          routeGeometryStatus: itinerary.routeGeometryStatus,
          metadata: {
            ...(itinerary.trailRoute?.metadata ?? {}),
            canonicalPrimarySpine: true,
            spineStatus: spine.status,
            spineSafeCode: spine.safeCode,
            spineFingerprint: spine.fingerprint,
            approachPointCount: spine.approachPointCount,
            trailPointCount: spine.trailPointCount,
          },
        },
      };
    }
    return null;
  }

  const approachGeometry = normalizeGeometry(itinerary.approachRoute?.geometry);
  if (
    approachGeometry.length < 2 ||
    !itinerary.approachRoute ||
    itinerary.routeGeometryStatus !== 'approach_only'
  ) return null;
  return routeFeature({
    itinerary,
    route: itinerary.approachRoute,
    segment: null,
    geometry: approachGeometry,
    index: 0,
  });
}

function pointFeature(args: {
  itinerary: TripItinerary;
  waypoint: ItineraryWaypoint | ItineraryStop;
  featureKind: 'waypoint' | 'stop';
  index: number;
}): TripItineraryMapFeature | null {
  if (!isFiniteCoordinate(args.waypoint.coordinate)) return null;
  const renderRole = renderRoleForWaypoint(args.waypoint.type);
  const id = args.featureKind === 'stop'
    ? `stop-${args.waypoint.id}`
    : `waypoint-${args.waypoint.id}`;
  return {
    type: 'Feature',
    id,
    geometry: {
      type: 'Point',
      coordinates: toPosition(args.waypoint.coordinate),
    },
    properties: {
      id,
      itineraryId: args.itinerary.id,
      sourceRouteId: args.itinerary.sourceRouteId ?? null,
      featureKind: args.featureKind,
      renderRole,
      phase: args.waypoint.phase,
      waypointType: args.waypoint.type,
      waypointId: args.featureKind === 'waypoint' ? args.waypoint.id : null,
      stopId: args.featureKind === 'stop' ? args.waypoint.id : null,
      title: args.waypoint.title,
      sequence: args.waypoint.sequence ?? args.index + 1,
      routeGeometryStatus: args.itinerary.routeGeometryStatus,
      ...sourceMetadata(args.waypoint),
    },
  };
}

function pointKey(feature: TripItineraryMapFeature): string {
  const coordinates = feature.geometry.type === 'Point' ? feature.geometry.coordinates : null;
  return coordinates
    ? `${feature.properties.featureKind}:${feature.properties.waypointType ?? ''}:${coordinates[1].toFixed(5)},${coordinates[0].toFixed(5)}`
    : feature.id;
}

function dedupePointFeatures(features: TripItineraryMapFeature[]): TripItineraryMapFeature[] {
  const seen = new Set<string>();
  const unique: TripItineraryMapFeature[] = [];
  features.forEach((feature) => {
    const key = pointKey(feature);
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(feature);
  });
  return unique;
}

function preTrailStopFeatures(itinerary: TripItinerary): TripItineraryMapFeature[] {
  const stops = itinerary.preTrailStops
    ? [
        ...itinerary.preTrailStops.fuel,
        ...itinerary.preTrailStops.grocery,
        ...itinerary.preTrailStops.water,
        ...itinerary.preTrailStops.generalSupply,
      ]
    : [];
  return stops
    .map((stop, index) => pointFeature({
      itinerary,
      waypoint: stop,
      featureKind: 'stop',
      index,
    }))
    .filter((feature): feature is TripItineraryMapFeature => feature != null);
}

function waypointFeatures(itinerary: TripItinerary): TripItineraryMapFeature[] {
  const waypoints = [
    itinerary.trailheadStart,
    ...(itinerary.trailWaypoints ?? []),
    itinerary.trailEnd,
  ].filter((waypoint): waypoint is ItineraryWaypoint => waypoint != null);
  return dedupePointFeatures(
    waypoints
      .map((waypoint, index) => pointFeature({
        itinerary,
        waypoint,
        featureKind: 'waypoint',
        index,
      }))
      .filter((feature): feature is TripItineraryMapFeature => feature != null),
  );
}

function legacyPointsFromFeatures(features: TripItineraryMapFeature[]): TripItineraryLegacyRoutePoint[] {
  const points: TripItineraryLegacyRoutePoint[] = [];
  features.forEach((feature) => {
    if (feature.geometry.type !== 'LineString') return;
    feature.geometry.coordinates.forEach(([longitude, latitude]) => {
      const previous = points[points.length - 1];
      if (
        previous &&
        Math.abs(previous.latitude - latitude) < 0.000001 &&
        Math.abs(previous.longitude - longitude) < 0.000001
      ) {
        return;
      }
      points.push({
        latitude,
        longitude,
        phase: feature.properties.phase,
        renderRole: feature.properties.renderRole,
      });
    });
  });
  return points;
}

function legacySegment(feature: TripItineraryMapFeature): TripItineraryLegacySegment | null {
  if (feature.geometry.type !== 'LineString') return null;
  return {
    id: feature.id,
    coordinates: feature.geometry.coordinates,
    kind: feature.properties.renderRole,
    name: feature.properties.title ?? null,
    category: feature.properties.phase,
    categoryLabel: feature.properties.renderRole,
  };
}

function legacyMarker(feature: TripItineraryMapFeature): TripItineraryLegacyMarker | null {
  if (feature.geometry.type !== 'Point') return null;
  const [longitude, latitude] = feature.geometry.coordinates;
  return {
    id: feature.id,
    latitude,
    longitude,
    title: feature.properties.title ?? feature.properties.renderRole,
    subtitle: feature.properties.phase,
    type: feature.properties.waypointType ?? feature.properties.renderRole,
    category: feature.properties.renderRole,
    mapChar: markerChar(feature.properties.renderRole),
  };
}

function markerChar(role: TripItineraryRenderRole): string | undefined {
  switch (role) {
    case 'pre_trail_resupply':
      return '+';
    case 'trail_start':
      return 'S';
    case 'camp_potential':
      return 'C';
    case 'scenic_stop':
      return 'V';
    case 'bailout':
      return 'B';
    case 'hazard':
      return '!';
    case 'turnaround':
      return 'T';
    case 'trail_end':
      return 'E';
    case 'exit_route':
      return 'X';
    case 'user_added':
      return '*';
    default:
      return undefined;
  }
}

function featureCollection(features: TripItineraryMapFeature[]): TripItineraryMapFeatureCollection {
  return {
    type: 'FeatureCollection',
    features,
  };
}

function missingGeometryPhases(itinerary: TripItinerary): ItineraryPhase[] {
  const missing: ItineraryPhase[] = [];
  if (!itinerary.approachRoute || normalizeGeometry(itinerary.approachRoute.geometry).length < 2) {
    missing.push('approach');
  }
  if (!itinerary.trailRoute || normalizeGeometry(itinerary.trailRoute.geometry).length < 2) {
    missing.push('trail_navigation');
  }
  if (itinerary.exitRoute && normalizeGeometry(itinerary.exitRoute.geometry).length < 2) {
    missing.push('trail_exit');
  }
  return missing;
}

export function tripItineraryToMapboxRenderData(
  itinerary: TripItinerary,
): TripItineraryMapboxRenderData {
  const primaryFeature = primarySpineFeature(itinerary);
  const routeFeatures = primaryFeature ? [primaryFeature] : [];
  const alternateRouteFeatures = routeFeaturesForRoute(itinerary, itinerary.exitRoute);
  const pointFeatures = [
    ...preTrailStopFeatures(itinerary),
    ...waypointFeatures(itinerary),
  ];
  const legacySegments = routeFeatures
    .map(legacySegment)
    .filter((segment): segment is TripItineraryLegacySegment => segment != null);
  const legacyMarkers = pointFeatures
    .map(legacyMarker)
    .filter((marker): marker is TripItineraryLegacyMarker => marker != null);
  const trailSegments = legacySegments.filter((segment) => segment.kind === 'trail_line');
  const alternateSegments = alternateRouteFeatures
    .map(legacySegment)
    .filter((segment): segment is TripItineraryLegacySegment => segment != null);

  return {
    itineraryId: itinerary.id,
    routeFeatureCollection: featureCollection(routeFeatures),
    alternateRouteFeatureCollection: featureCollection(alternateRouteFeatures),
    pointFeatureCollection: featureCollection(pointFeatures),
    featureCollection: featureCollection([...routeFeatures, ...pointFeatures]),
    legacyMapRenderer: {
      points: legacyPointsFromFeatures(routeFeatures),
      segments: legacySegments,
      trailSegments,
      alternateSegments,
      waypoints: legacyMarkers.filter((marker) => marker.type !== 'bailout' && marker.type !== 'turnaround'),
      bailoutMarkers: legacyMarkers.filter((marker) => marker.type === 'bailout' || marker.type === 'turnaround'),
      pinMarkers: legacyMarkers,
    },
    metadata: {
      routeFeatureCount: routeFeatures.length,
      alternateRouteFeatureCount: alternateRouteFeatures.length,
      pointFeatureCount: pointFeatures.length,
      approachGeometryAvailable: normalizeGeometry(itinerary.approachRoute?.geometry).length >= 2,
      trailGeometryAvailable: normalizeGeometry(itinerary.trailRoute?.geometry).length >= 2,
      exitGeometryAvailable: alternateRouteFeatures.length > 0,
      missingGeometryPhases: missingGeometryPhases(itinerary),
    },
  };
}
