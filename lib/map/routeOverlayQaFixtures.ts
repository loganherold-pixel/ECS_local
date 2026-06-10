import {
  classifyExploreRouteAuthority,
  type ExploreRouteAuthority,
} from '../exploreRouteAuthority';
import {
  normalizeCanonicalRouteGeometry,
  type CanonicalRouteGeometryResult,
} from '../routeGeometryLifecycle';

export const ROUTE_OVERLAY_QA_SCENARIO_IDS = [
  'valid_geometry',
  'malformed_geometry',
  'missing_geometry',
  'trailhead_only',
  'approach_only',
  'demo_route_geometry',
  'preview_route_geometry',
  'imported_route_geometry',
  'source_backed_trail_geometry',
] as const;

export type RouteOverlayQaScenarioId = typeof ROUTE_OVERLAY_QA_SCENARIO_IDS[number];

export type RouteOverlayQaRuntime = {
  dev?: boolean | null;
  nodeEnv?: string | null;
};

export type RouteOverlayQaGeometryClass =
  | 'valid_geometry'
  | 'malformed_geometry'
  | 'missing_geometry'
  | 'trailhead_only'
  | 'approach_only'
  | 'demo_route'
  | 'preview_geometry'
  | 'imported_geometry'
  | 'source_backed_trail_geometry';

export type RouteOverlayQaExpectedOverlayState =
  | 'route_line'
  | 'approach_route_line'
  | 'trailhead_marker_only'
  | 'controlled_fallback';

export type RouteOverlayQaRouteRecord = {
  id: string;
  name: string;
  startLat?: number | null;
  startLng?: number | null;
  routeGeometry?: unknown;
  trailGeometry?: unknown;
  approachGeometry?: unknown;
  routeMetadata?: Record<string, unknown>;
};

export type RouteOverlayQaValidationRow = {
  label: string;
  value: string;
  state: 'ok' | 'watch' | 'caution' | 'critical' | 'non_live';
};

export type RouteOverlayQaFixture = {
  id: RouteOverlayQaScenarioId;
  title: string;
  description: string;
  disclosure: string;
  route: RouteOverlayQaRouteRecord;
  geometryClass: RouteOverlayQaGeometryClass;
  normalized: CanonicalRouteGeometryResult;
  authority: ExploreRouteAuthority;
  authorityLabel: string;
  authorityNotice: string;
  sourceLabel: string;
  expectedOverlayState: RouteOverlayQaExpectedOverlayState;
  expectedMapLine: boolean;
  expectedMarker: boolean;
  mapPoints: Array<{ latitude: number; longitude: number }>;
  waypoints: Array<{ id: string; latitude: number; longitude: number; title: string }>;
  routeColor: string;
  validationRows: RouteOverlayQaValidationRow[];
};

const DISCLOSURE =
  'NON-PRODUCTION QA FIXTURE. Local dev/test-only route overlay data; no route catalog, itinerary, Active Trip, Offline Packet, Badge, Convoy, Fleet, telemetry, or provider state is read or written.';

const POINT_A = { latitude: 38.78421, longitude: -121.20971 };
const POINT_B = { latitude: 38.79102, longitude: -121.19742 };
const POINT_C = { latitude: 38.79925, longitude: -121.18581 };

const LINE_STRING = {
  type: 'LineString',
  coordinates: [
    [POINT_A.longitude, POINT_A.latitude],
    [POINT_B.longitude, POINT_B.latitude],
    [POINT_C.longitude, POINT_C.latitude],
  ],
};

const APPROACH_LINE_STRING = {
  type: 'LineString',
  coordinates: [
    [-121.2351, 38.761],
    [-121.2224, 38.773],
    [POINT_A.longitude, POINT_A.latitude],
  ],
};

function runtimeDevFlag(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export function isRouteOverlayQaHarnessEnabled(runtime: RouteOverlayQaRuntime = {}): boolean {
  const dev = runtime.dev ?? runtimeDevFlag();
  const nodeEnv =
    runtime.nodeEnv ??
    (typeof process !== 'undefined' && process?.env ? process.env.NODE_ENV : undefined);
  return dev === true || nodeEnv === 'test';
}

function route(
  id: RouteOverlayQaScenarioId,
  name: string,
  fields: Partial<RouteOverlayQaRouteRecord>,
): RouteOverlayQaRouteRecord {
  return {
    id: `route-overlay-qa-${id}`,
    name,
    routeMetadata: {
      qaFixture: true,
      nonProduction: true,
      sourceLabel: 'Route Overlay QA sample',
      ...(fields.routeMetadata ?? {}),
    },
    ...fields,
  };
}

function scenarioRoute(id: RouteOverlayQaScenarioId): RouteOverlayQaRouteRecord {
  switch (id) {
    case 'valid_geometry':
      return route(id, 'QA Valid LineString Route', {
        startLat: POINT_A.latitude,
        startLng: POINT_A.longitude,
        routeGeometry: LINE_STRING,
        routeMetadata: {
          sourceLabel: 'Dev/test valid LineString',
          isTrailGeometry: true,
        },
      });
    case 'malformed_geometry':
      return route(id, 'QA Malformed Geometry Route', {
        routeGeometry: {
          type: 'LineString',
          coordinates: [[-121.2, 95.4], ['bad', 'coordinate']],
        },
        routeMetadata: {
          sourceLabel: 'Dev/test malformed geometry',
        },
      });
    case 'missing_geometry':
      return route(id, 'QA Missing Geometry Route', {
        routeMetadata: {
          sourceLabel: 'Dev/test missing geometry',
        },
      });
    case 'trailhead_only':
      return route(id, 'QA Trailhead Only Route', {
        startLat: POINT_A.latitude,
        startLng: POINT_A.longitude,
        routeMetadata: {
          sourceLabel: 'Trailhead coordinate only',
          previewMetadataStatus: 'trailhead_only',
        },
      });
    case 'approach_only':
      return route(id, 'QA Approach Only Route', {
        startLat: POINT_A.latitude,
        startLng: POINT_A.longitude,
        approachGeometry: APPROACH_LINE_STRING,
        routeMetadata: {
          sourceLabel: 'Mapbox approach route',
          geometryRole: 'approach',
          isApproachGeometry: true,
        },
      });
    case 'demo_route_geometry':
      return route(id, 'QA Demo Fixture Route', {
        startLat: POINT_A.latitude,
        startLng: POINT_A.longitude,
        routeGeometry: LINE_STRING,
        routeMetadata: {
          geometrySource: 'ecs_demo_full_route_fixture',
          routeScope: 'full_trail_route',
          sourceLabel: 'ECS demo fixture',
          dataState: 'fixture',
        },
      });
    case 'preview_route_geometry':
      return route(id, 'QA Preview Geometry Route', {
        startLat: POINT_A.latitude,
        startLng: POINT_A.longitude,
        routeGeometry: LINE_STRING,
        routeMetadata: {
          source: 'discover_preview',
          sourceLabel: 'Preview geometry',
          previewMetadataStatus: 'geometry',
        },
      });
    case 'imported_route_geometry':
      return route(id, 'QA Imported GPX Route', {
        startLat: POINT_A.latitude,
        startLng: POINT_A.longitude,
        routeGeometry: LINE_STRING,
        routeMetadata: {
          source: 'trip_builder_import',
          sourceFileType: 'gpx',
          sourceLabel: 'Operator import sample',
        },
      });
    case 'source_backed_trail_geometry':
      return route(id, 'QA Source-backed Trail Route', {
        startLat: POINT_A.latitude,
        startLng: POINT_A.longitude,
        routeGeometry: LINE_STRING,
        routeMetadata: {
          source: 'trail_pack',
          dataState: 'live',
          reviewStatus: 'approved',
          sourceLabel: 'Source-backed QA sample',
          catalogVerification: {
            status: 'ready',
            publicRecommendation: true,
          },
        },
      });
    default:
      return scenarioRoute('missing_geometry');
  }
}

function trailheadWaypoint(routeRecord: RouteOverlayQaRouteRecord) {
  const latitude = Number(routeRecord.startLat);
  const longitude = Number(routeRecord.startLng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return {
    id: `${routeRecord.id}-trailhead`,
    latitude,
    longitude,
    title: 'Trailhead',
  };
}

function fixtureClass(id: RouteOverlayQaScenarioId): RouteOverlayQaGeometryClass {
  if (id === 'demo_route_geometry') return 'demo_route';
  if (id === 'preview_route_geometry') return 'preview_geometry';
  if (id === 'imported_route_geometry') return 'imported_geometry';
  if (id === 'source_backed_trail_geometry') return 'source_backed_trail_geometry';
  return id;
}

function overlayState(
  id: RouteOverlayQaScenarioId,
  normalized: CanonicalRouteGeometryResult,
): RouteOverlayQaExpectedOverlayState {
  if (id === 'trailhead_only') return 'trailhead_marker_only';
  if (id === 'approach_only' && normalized.valid) return 'approach_route_line';
  if (normalized.valid) return 'route_line';
  return 'controlled_fallback';
}

function authorityLabelForFixture(
  id: RouteOverlayQaScenarioId,
  authority: ExploreRouteAuthority,
): string {
  if (id === 'approach_only') return 'Approach-only guidance';
  if (id === 'malformed_geometry') return 'Geometry malformed';
  if (id === 'missing_geometry') return 'Geometry unavailable';
  return authority.label;
}

function authorityNoticeForFixture(
  id: RouteOverlayQaScenarioId,
  authority: ExploreRouteAuthority,
): string {
  if (id === 'approach_only') {
    return 'Approach route only. Trail terrain and full trail geometry are not verified.';
  }
  if (id === 'malformed_geometry') {
    return 'Malformed geometry should show a controlled fallback and must not render a stale route line.';
  }
  if (id === 'missing_geometry') {
    return 'Missing geometry should show unavailable copy and must not imply a safe or verified route.';
  }
  return authority.notice;
}

function routeColorForFixture(id: RouteOverlayQaScenarioId): string {
  switch (id) {
    case 'preview_route_geometry':
      return '#65D4FF';
    case 'demo_route_geometry':
      return '#FFB74D';
    case 'approach_only':
      return '#CFD8C8';
    case 'source_backed_trail_geometry':
      return '#8BC34A';
    default:
      return '#C48A2C';
  }
}

function row(
  label: string,
  value: string,
  state: RouteOverlayQaValidationRow['state'],
): RouteOverlayQaValidationRow {
  return { label, value, state };
}

export function buildRouteOverlayQaFixture(
  id: RouteOverlayQaScenarioId,
): RouteOverlayQaFixture {
  const routeRecord = scenarioRoute(id);
  const normalized = normalizeCanonicalRouteGeometry(routeRecord);
  const authority = classifyExploreRouteAuthority(routeRecord);
  const expectedOverlayState = overlayState(id, normalized);
  const waypoint = trailheadWaypoint(routeRecord);
  const expectedMapLine = expectedOverlayState === 'route_line' || expectedOverlayState === 'approach_route_line';
  const mapPoints = normalized.valid ? normalized.latitudeLongitude : [];

  return {
    id,
    title: routeRecord.name,
    description: descriptionFor(id),
    disclosure: DISCLOSURE,
    route: routeRecord,
    geometryClass: fixtureClass(id),
    normalized,
    authority,
    authorityLabel: authorityLabelForFixture(id, authority),
    authorityNotice: authorityNoticeForFixture(id, authority),
    sourceLabel: authority.sourceLabel,
    expectedOverlayState,
    expectedMapLine,
    expectedMarker: !!waypoint,
    mapPoints,
    waypoints: waypoint ? [waypoint] : [],
    routeColor: routeColorForFixture(id),
    validationRows: [
      row('Fixture guard', 'Dev/test only', 'non_live'),
      row('Product mutation', 'None', 'ok'),
      row('Geometry status', normalized.status, normalized.valid ? 'ok' : id === 'malformed_geometry' ? 'critical' : 'watch'),
      row('Authority label', authorityLabelForFixture(id, authority), authority.isPreviewOrDemo ? 'caution' : 'ok'),
      row('Overlay expectation', expectedOverlayState.replace(/_/g, ' '), expectedMapLine ? 'ok' : 'watch'),
    ],
  };
}

function descriptionFor(id: RouteOverlayQaScenarioId): string {
  switch (id) {
    case 'valid_geometry':
      return 'Renderable LineString route geometry should draw a route line.';
    case 'malformed_geometry':
      return 'Malformed coordinates should show controlled fallback copy and never crash.';
    case 'missing_geometry':
      return 'Missing/null geometry should show unavailable copy and never imply route authority.';
    case 'trailhead_only':
      return 'Trailhead-only guidance should show a trailhead marker without pretending full trail geometry exists.';
    case 'approach_only':
      return 'Approach-only road guidance should remain separate from trail geometry.';
    case 'demo_route_geometry':
      return 'Demo fixture geometry should remain labeled demo and non-production.';
    case 'preview_route_geometry':
      return 'Preview geometry should remain renderable but not verified.';
    case 'imported_route_geometry':
      return 'Imported geometry should remain imported and require operator verification.';
    case 'source_backed_trail_geometry':
      return 'Source-backed status should appear only when fixture metadata explicitly supports it.';
    default:
      return 'Route overlay QA fixture.';
  }
}

export function getRouteOverlayQaFixture(
  id: RouteOverlayQaScenarioId,
  runtime: RouteOverlayQaRuntime = {},
): RouteOverlayQaFixture | null {
  if (!isRouteOverlayQaHarnessEnabled(runtime)) return null;
  return ROUTE_OVERLAY_QA_SCENARIO_IDS.includes(id) ? buildRouteOverlayQaFixture(id) : null;
}

export function getRouteOverlayQaFixtures(
  runtime: RouteOverlayQaRuntime = {},
): RouteOverlayQaFixture[] {
  if (!isRouteOverlayQaHarnessEnabled(runtime)) return [];
  return ROUTE_OVERLAY_QA_SCENARIO_IDS.map((id) => buildRouteOverlayQaFixture(id));
}
