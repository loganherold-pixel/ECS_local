import type {
  Confidence,
  RouteContextCoordinate,
  RouteContextProviderMetadata,
  RouteContextWarning,
  TrailheadAnchor,
  TrailheadAnchorSource,
} from './routeContextTypes';
import { UNKNOWN_CONFIDENCE, clampConfidence } from './routeContextTypes';

export type TrailheadResolverInput = {
  id?: string | null;
  name?: string | null;
  title?: string | null;
  startLat?: number | string | null;
  startLng?: number | string | null;
  userSelectedTrailhead?: unknown;
  user_selected_trailhead?: unknown;
  selectedTrailhead?: unknown;
  selected_trailhead?: unknown;
  selectedTrailheadCoordinate?: unknown;
  selected_trailhead_coordinate?: unknown;
  userSelectedAccessPoint?: unknown;
  user_selected_access_point?: unknown;
  selectedAccessPoint?: unknown;
  selected_access_point?: unknown;
  selectedAccessPointCoordinate?: unknown;
  selected_access_point_coordinate?: unknown;
  explicitTrailhead?: unknown;
  trailheadCoordinate?: unknown;
  trailhead_coordinate?: unknown;
  trailhead?: unknown;
  trailHeadCoordinate?: unknown;
  startCoordinate?: unknown;
  start_coordinate?: unknown;
  startLocation?: unknown;
  start_location?: unknown;
  endpointCoordinate?: unknown;
  destinationCoordinate?: unknown;
  endCoordinate?: unknown;
  coordinate?: unknown;
  poiCoordinate?: unknown;
  location?: unknown;
  center?: unknown;
  centerCoordinate?: unknown;
  routeGeometry?: unknown;
  trailGeometry?: unknown;
  geojson?: unknown;
  geometry?: unknown;
  coordinates?: unknown;
  polyline?: unknown;
  waypoints?: unknown[] | null;
  segments?: unknown[] | null;
  routeMetadata?: Record<string, unknown> | null;
  route_metadata?: Record<string, unknown> | null;
  bounds?: unknown;
  bbox?: unknown;
  boundingBox?: unknown;
  bounding_box?: unknown;
  [key: string]: unknown;
};

type CoordinateCandidate = RouteContextCoordinate & {
  sourcePath: string;
  sourceMetadata?: RouteContextProviderMetadata | null;
};

type EndpointCandidate = CoordinateCandidate & {
  heuristicScore: number;
  heuristicReasons: string[];
};

const USER_SELECTED_TRAILHEAD_KEYS = [
  'userSelectedTrailhead',
  'user_selected_trailhead',
  'selectedTrailhead',
  'selected_trailhead',
  'selectedTrailheadCoordinate',
  'selected_trailhead_coordinate',
  'userSelectedAccessPoint',
  'user_selected_access_point',
  'selectedAccessPoint',
  'selected_access_point',
  'selectedAccessPointCoordinate',
  'selected_access_point_coordinate',
];

const TRAILHEAD_KEYS = [
  'explicitTrailhead',
  'trailheadCoordinate',
  'trailhead_coordinate',
  'trailHeadCoordinate',
  'trailhead',
  'trailHead',
  'trailheadLocation',
  'trailhead_location',
];

const START_KEYS = [
  'startCoordinate',
  'start_coordinate',
  'startLocationCoordinate',
  'start_location_coordinate',
  'startPoint',
  'start_point',
  'start',
  'originPoint',
];

const ENDPOINT_KEYS = [
  'geometryEndpoint',
  'geometry_endpoint',
  'endpointCoordinate',
  'destinationCoordinate',
  'endCoordinate',
  'finishCoordinate',
  'roadDestinationCoordinate',
];

const POI_KEYS = [
  'poiCoordinate',
  'poi_coordinate',
  'coordinate',
  'location',
  'centerCoordinate',
  'center',
];

const GEOMETRY_KEYS = [
  'routeGeometry',
  'trailGeometry',
  'geojson',
  'geometry',
  'coordinates',
  'polyline',
  'points',
  'path',
  'segments',
];

const AREA_KEYS = [
  'polygon',
  'area',
  'bounds',
  'bbox',
  'boundingBox',
  'bounding_box',
  'routeBounds',
  'route_bounds',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isValidRouteContextCoordinate(lat: unknown, lng: unknown): boolean {
  const latitude = toFiniteNumber(lat);
  const longitude = toFiniteNumber(lng);
  return (
    latitude != null &&
    longitude != null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  );
}

function confidence(value: number, reasons: string[]): Confidence {
  return { value: clampConfidence(value), reasons };
}

function warning(
  code: RouteContextWarning['code'],
  message: string,
  severity: RouteContextWarning['severity'] = 'watch',
  source?: string | null,
): RouteContextWarning {
  return { code, message, severity, source };
}

function candidateMetadata(sourcePath: string, value: unknown): RouteContextProviderMetadata {
  const metadata: RouteContextProviderMetadata = { sourcePath };
  if (isRecord(value)) {
    const source = value.source ?? value.provider ?? value.providerId ?? value.sourceId;
    const id = value.id ?? value.placeId ?? value.providerPlaceId;
    const label = value.label ?? value.name ?? value.title;
    if (typeof source === 'string' && source.trim()) metadata.source = source.trim();
    if (typeof id === 'string' && id.trim()) metadata.sourceId = id.trim();
    if (typeof label === 'string' && label.trim()) metadata.label = label.trim();
  }
  return metadata;
}

export function normalizeRouteContextCoordinate(
  value: unknown,
  sourcePath = 'unknown',
): CoordinateCandidate | null {
  if (value == null) return null;

  if (Array.isArray(value)) {
    const lng = toFiniteNumber(value[0]);
    const lat = toFiniteNumber(value[1]);
    if (!isValidRouteContextCoordinate(lat, lng)) return null;
    return {
      lat: lat as number,
      lng: lng as number,
      sourcePath,
      sourceMetadata: candidateMetadata(sourcePath, value),
    };
  }

  if (!isRecord(value)) return null;

  if (Array.isArray(value.center)) {
    const center = normalizeRouteContextCoordinate(value.center, `${sourcePath}.center`);
    return center ? { ...center, sourceMetadata: candidateMetadata(sourcePath, value) } : null;
  }

  if (value.type === 'Point' && Array.isArray(value.coordinates)) {
    const point = normalizeRouteContextCoordinate(value.coordinates, `${sourcePath}.coordinates`);
    return point ? { ...point, sourceMetadata: candidateMetadata(sourcePath, value) } : null;
  }

  if (isRecord(value.coordinate)) {
    const nested = normalizeRouteContextCoordinate(value.coordinate, `${sourcePath}.coordinate`);
    return nested ? { ...nested, sourceMetadata: candidateMetadata(sourcePath, value) } : null;
  }

  if (isRecord(value.location)) {
    const nested = normalizeRouteContextCoordinate(value.location, `${sourcePath}.location`);
    return nested ? { ...nested, sourceMetadata: candidateMetadata(sourcePath, value) } : null;
  }

  const lat = toFiniteNumber(value.lat ?? value.latitude ?? value.y);
  const lng = toFiniteNumber(value.lng ?? value.lon ?? value.longitude ?? value.x);
  if (!isValidRouteContextCoordinate(lat, lng)) return null;

  const label = typeof value.label === 'string' || typeof value.name === 'string' || typeof value.title === 'string'
    ? String(value.label ?? value.name ?? value.title)
    : null;
  return {
    lat: lat as number,
    lng: lng as number,
    label,
    sourcePath,
    sourceMetadata: candidateMetadata(sourcePath, value),
  };
}

function readMetadata(input: TrailheadResolverInput): Record<string, unknown> {
  if (isRecord(input.routeMetadata)) return input.routeMetadata;
  if (isRecord(input.route_metadata)) return input.route_metadata;
  return {};
}

function getCandidateFromKeys(
  input: TrailheadResolverInput,
  keys: string[],
  prefix: string,
): CoordinateCandidate | null {
  const metadata = readMetadata(input);
  for (const key of keys) {
    const direct = normalizeRouteContextCoordinate(input[key], key);
    if (direct) return direct;
    const fromMetadata = normalizeRouteContextCoordinate(metadata[key], `routeMetadata.${key}`);
    if (fromMetadata) return fromMetadata;
  }
  return normalizeRouteContextCoordinate((input as Record<string, unknown>)[prefix], prefix);
}

function valuesFromKeys(
  input: TrailheadResolverInput,
  keys: string[],
): { sourcePath: string; value: unknown }[] {
  const metadata = readMetadata(input);
  const values: { sourcePath: string; value: unknown }[] = [];
  keys.forEach((key) => {
    if (input[key] != null) values.push({ sourcePath: key, value: input[key] });
    if (metadata[key] != null) {
      values.push({ sourcePath: `routeMetadata.${key}`, value: metadata[key] });
    }
  });
  return values;
}

function valueHasCoordinateIntent(value: unknown): boolean {
  if (Array.isArray(value)) return true;
  if (!isRecord(value)) return false;
  return [
    'lat',
    'latitude',
    'lng',
    'lon',
    'longitude',
    'x',
    'y',
    'coordinate',
    'coordinates',
    'center',
    'location',
  ].some((key) => key in value);
}

function userSelectedTrailheadWarning(
  value: unknown,
  sourcePath: string,
): RouteContextWarning {
  if (valueHasCoordinateIntent(value)) {
    return warning(
      'invalid_user_selected_trailhead',
      `Ignored invalid user-selected trailhead/access point from ${sourcePath}.`,
      'watch',
      sourcePath,
    );
  }
  return warning(
    'user_selected_trailhead_missing_coordinates',
    `Ignored user-selected trailhead/access point from ${sourcePath} because coordinates were missing.`,
    'watch',
    sourcePath,
  );
}

function getUserSelectedTrailheadCandidate(input: TrailheadResolverInput): {
  candidate: CoordinateCandidate | null;
  warnings: RouteContextWarning[];
} {
  const values = valuesFromKeys(input, USER_SELECTED_TRAILHEAD_KEYS);
  for (const { sourcePath, value } of values) {
    const candidate = normalizeRouteContextCoordinate(value, sourcePath);
    if (!candidate) continue;
    return {
      candidate: {
        ...candidate,
        sourceMetadata: {
          ...(candidate.sourceMetadata ?? { sourcePath: candidate.sourcePath }),
          sourcePath: candidate.sourceMetadata?.sourcePath ?? candidate.sourcePath,
          selectedByUser: true,
        },
      },
      warnings: [],
    };
  }

  return {
    candidate: null,
    warnings: values.map(({ sourcePath, value }) => userSelectedTrailheadWarning(value, sourcePath)),
  };
}

function getStartLatLngCandidate(input: TrailheadResolverInput): CoordinateCandidate | null {
  const direct = normalizeRouteContextCoordinate(
    { lat: input.startLat, lng: input.startLng },
    'startLat/startLng',
  );
  if (direct) return direct;

  const metadata = readMetadata(input);
  return normalizeRouteContextCoordinate(
    { lat: metadata.startLat, lng: metadata.startLng },
    'routeMetadata.startLat/startLng',
  );
}

function dedupeConsecutive(points: CoordinateCandidate[]): CoordinateCandidate[] {
  const deduped: CoordinateCandidate[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.lat === point.lat && previous.lng === point.lng) return;
    deduped.push(point);
  });
  return deduped;
}

function extractLineCoordinates(input: unknown, sourcePath: string, depth = 0): CoordinateCandidate[] {
  if (depth > 8 || input == null) return [];
  const point = normalizeRouteContextCoordinate(input, sourcePath);
  if (point) return [point];
  if (Array.isArray(input)) {
    return input.flatMap((item, index) => extractLineCoordinates(item, `${sourcePath}[${index}]`, depth + 1));
  }
  if (!isRecord(input)) return [];

  const type = typeof input.type === 'string' ? input.type : null;
  if (type === 'FeatureCollection' && Array.isArray(input.features)) {
    return input.features.flatMap((feature, index) => extractLineCoordinates(feature, `${sourcePath}.features[${index}]`, depth + 1));
  }
  if (type === 'Feature') return extractLineCoordinates(input.geometry, `${sourcePath}.geometry`, depth + 1);
  if (type === 'LineString' || type === 'MultiLineString') {
    return extractLineCoordinates(input.coordinates, `${sourcePath}.coordinates`, depth + 1);
  }
  if (type === 'GeometryCollection' && Array.isArray(input.geometries)) {
    return input.geometries.flatMap((geometry, index) => extractLineCoordinates(geometry, `${sourcePath}.geometries[${index}]`, depth + 1));
  }
  if (type === 'Polygon' || type === 'MultiPolygon') return [];
  if (Array.isArray(input.segments)) {
    return input.segments.flatMap((segment, index) => extractLineCoordinates(segment, `${sourcePath}.segments[${index}]`, depth + 1));
  }

  return [
    ['geometry', input.geometry],
    ['coordinates', input.coordinates],
    ['routeGeometry', input.routeGeometry],
    ['trailGeometry', input.trailGeometry],
    ['geojson', input.geojson],
    ['polyline', input.polyline],
    ['points', input.points],
    ['path', input.path],
  ].flatMap(([key, value]) => extractLineCoordinates(value, `${sourcePath}.${key}`, depth + 1));
}

export function getTrailRouteCoordinates(input: TrailheadResolverInput): RouteContextCoordinate[] {
  return getTrailRouteCoordinateCandidates(input).map(({ lat, lng, label }) => ({ lat, lng, label }));
}

function getTrailRouteCoordinateCandidates(input: TrailheadResolverInput): CoordinateCandidate[] {
  const metadata = readMetadata(input);
  const candidates = [
    ...GEOMETRY_KEYS.flatMap((key) => extractLineCoordinates(input[key], key)),
    ...GEOMETRY_KEYS.flatMap((key) => extractLineCoordinates(metadata[key], `routeMetadata.${key}`)),
  ];
  if (candidates.length >= 2) return dedupeConsecutive(candidates);

  const waypointCandidates = (input.waypoints ?? [])
    .map((waypoint, index) => normalizeRouteContextCoordinate(waypoint, `waypoints[${index}]`))
    .filter((point): point is CoordinateCandidate => point != null);
  return dedupeConsecutive(waypointCandidates);
}

function endpointHeuristic(candidate: CoordinateCandidate, sourceValue: unknown): EndpointCandidate {
  let heuristicScore = 0;
  const heuristicReasons: string[] = [];
  const text = [
    candidate.label,
    candidate.sourcePath,
    isRecord(sourceValue) ? sourceValue.type : null,
    isRecord(sourceValue) ? sourceValue.waypointType : null,
    isRecord(sourceValue) ? sourceValue.kind : null,
    isRecord(sourceValue) ? sourceValue.name : null,
  ].filter(Boolean).join(' ').toLowerCase();

  if (/\b(start|begin|entry|trailhead|staging|parking|access)\b/.test(text)) {
    heuristicScore += 3;
    heuristicReasons.push('Endpoint metadata contains start/trailhead language.');
  }
  if (/\b(end|finish|destination|exit)\b/.test(text)) {
    heuristicScore -= 2;
    heuristicReasons.push('Endpoint metadata contains finish/destination language.');
  }
  if (isRecord(sourceValue)) {
    const routeMileMarker = toFiniteNumber(sourceValue.routeMileMarker ?? sourceValue.distanceFromStartMiles ?? sourceValue.sequence ?? sourceValue.order);
    if (routeMileMarker != null) {
      heuristicScore += Math.max(0, 2 - Math.min(2, routeMileMarker / 10));
      heuristicReasons.push('Endpoint metadata includes a low route-mile/order marker.');
    }
  }

  return { ...candidate, heuristicScore, heuristicReasons };
}

function getEndpointCandidates(input: TrailheadResolverInput): EndpointCandidate[] {
  const metadata = readMetadata(input);
  const candidates: EndpointCandidate[] = [];

  ENDPOINT_KEYS.forEach((key) => {
    const direct = normalizeRouteContextCoordinate(input[key], key);
    if (direct) candidates.push(endpointHeuristic(direct, input[key]));
    const fromMetadata = normalizeRouteContextCoordinate(metadata[key], `routeMetadata.${key}`);
    if (fromMetadata) candidates.push(endpointHeuristic(fromMetadata, metadata[key]));
  });

  ['geometryEndpoints', 'geometry_endpoints', 'endpoints', 'routeEndpoints', 'route_endpoints'].forEach((key) => {
    const value = input[key] ?? metadata[key];
    if (!Array.isArray(value)) return;
    value.forEach((endpoint, index) => {
      const candidate = normalizeRouteContextCoordinate(endpoint, `${key}[${index}]`);
      if (candidate) candidates.push(endpointHeuristic(candidate, endpoint));
    });
  });

  return candidates.sort((left, right) => right.heuristicScore - left.heuristicScore);
}

function extractAreaCoordinates(input: unknown, sourcePath: string, depth = 0): CoordinateCandidate[] {
  if (depth > 8 || input == null) return [];
  if (Array.isArray(input)) {
    if (input.length === 4 && input.every((item) => toFiniteNumber(item) != null)) {
      const [west, south, east, north] = input.map((item) => toFiniteNumber(item) as number);
      if (isValidRouteContextCoordinate(south, west) && isValidRouteContextCoordinate(north, east)) {
        return [
          { lat: south, lng: west, sourcePath, sourceMetadata: candidateMetadata(sourcePath, input) },
          { lat: north, lng: east, sourcePath, sourceMetadata: candidateMetadata(sourcePath, input) },
        ];
      }
    }
    return input.flatMap((item, index) => extractAreaCoordinates(item, `${sourcePath}[${index}]`, depth + 1));
  }
  const point = normalizeRouteContextCoordinate(input, sourcePath);
  if (point) return [point];
  if (!isRecord(input)) return [];

  const type = typeof input.type === 'string' ? input.type : null;
  if (type === 'FeatureCollection' && Array.isArray(input.features)) {
    return input.features.flatMap((feature, index) => extractAreaCoordinates(feature, `${sourcePath}.features[${index}]`, depth + 1));
  }
  if (type === 'Feature') return extractAreaCoordinates(input.geometry, `${sourcePath}.geometry`, depth + 1);
  if (type === 'Polygon' || type === 'MultiPolygon') {
    return extractAreaCoordinates(input.coordinates, `${sourcePath}.coordinates`, depth + 1);
  }

  const west = toFiniteNumber(input.west ?? input.minLng ?? input.minLon ?? input.min_lng ?? input.min_lon);
  const east = toFiniteNumber(input.east ?? input.maxLng ?? input.maxLon ?? input.max_lng ?? input.max_lon);
  const south = toFiniteNumber(input.south ?? input.minLat ?? input.min_lat);
  const north = toFiniteNumber(input.north ?? input.maxLat ?? input.max_lat);
  if (west != null && east != null && south != null && north != null) {
    if (isValidRouteContextCoordinate(south, west) && isValidRouteContextCoordinate(north, east)) {
      return [
        { lat: south, lng: west, sourcePath, sourceMetadata: candidateMetadata(sourcePath, input) },
        { lat: north, lng: east, sourcePath, sourceMetadata: candidateMetadata(sourcePath, input) },
      ];
    }
  }

  return AREA_KEYS.flatMap((key) => extractAreaCoordinates(input[key], `${sourcePath}.${key}`, depth + 1));
}

function centroid(points: CoordinateCandidate[]): CoordinateCandidate | null {
  if (points.length === 0) return null;
  const totals = points.reduce(
    (sum, point) => ({ lat: sum.lat + point.lat, lng: sum.lng + point.lng }),
    { lat: 0, lng: 0 },
  );
  const sources = Array.from(new Set(points.map((point) => point.sourcePath))).slice(0, 4);
  return {
    lat: totals.lat / points.length,
    lng: totals.lng / points.length,
    label: 'Area centroid fallback',
    sourcePath: sources[0] ?? 'area',
    sourceMetadata: {
      sourcePath: sources[0] ?? 'area',
      sourcePaths: sources,
      pointCount: points.length,
    },
  };
}

function getCentroidFallback(input: TrailheadResolverInput): CoordinateCandidate | null {
  const metadata = readMetadata(input);
  const areaPoints = [
    ...AREA_KEYS.flatMap((key) => extractAreaCoordinates(input[key], key)),
    ...AREA_KEYS.flatMap((key) => extractAreaCoordinates(metadata[key], `routeMetadata.${key}`)),
  ];
  return centroid(dedupeConsecutive(areaPoints));
}

function anchorFromCandidate(
  candidate: CoordinateCandidate,
  source: TrailheadAnchorSource,
  value: number,
  reason: string,
  warnings: RouteContextWarning[] = [],
): TrailheadAnchor {
  return {
    lat: candidate.lat,
    lng: candidate.lng,
    label: candidate.label ?? null,
    source,
    confidence: confidence(value, [reason]),
    warnings,
    providerMetadata: candidate.sourceMetadata ?? { sourcePath: candidate.sourcePath },
  };
}

function invalidCoordinateWarnings(input: TrailheadResolverInput): RouteContextWarning[] {
  const warnings: RouteContextWarning[] = [];
  const metadata = readMetadata(input);
  [...TRAILHEAD_KEYS, ...START_KEYS, ...ENDPOINT_KEYS, ...POI_KEYS].forEach((key) => {
    const value = input[key] ?? metadata[key];
    if (value == null) return;
    if (normalizeRouteContextCoordinate(value, key)) return;
    if (Array.isArray(value) || isRecord(value)) {
      warnings.push(warning('invalid_coordinate', `Ignored invalid coordinate from ${key}.`, 'watch', key));
    }
  });
  if ((input.startLat != null || input.startLng != null) && !getStartLatLngCandidate(input)) {
    warnings.push(warning('invalid_coordinate', 'Ignored invalid startLat/startLng coordinate.', 'watch', 'startLat/startLng'));
  }
  return warnings;
}

export function resolveTrailheadAnchor(trailLike: TrailheadResolverInput | null | undefined): TrailheadAnchor {
  const input = (trailLike ?? {}) as TrailheadResolverInput;
  const selectedTrailhead = getUserSelectedTrailheadCandidate(input);
  const invalidWarnings = [
    ...selectedTrailhead.warnings,
    ...invalidCoordinateWarnings(input),
  ];

  if (selectedTrailhead.candidate) {
    return anchorFromCandidate(
      selectedTrailhead.candidate,
      'user_selected_trailhead',
      0.99,
      'User-selected trailhead/access point supplied by operator choice.',
      invalidCoordinateWarnings(input),
    );
  }

  const explicitTrailhead = getCandidateFromKeys(input, TRAILHEAD_KEYS, 'explicitTrailhead');
  if (explicitTrailhead) {
    return anchorFromCandidate(
      explicitTrailhead,
      'explicit_trailhead',
      0.95,
      'Explicit trailhead coordinate supplied by route data.',
      invalidWarnings,
    );
  }

  const explicitStart = getStartLatLngCandidate(input) ?? getCandidateFromKeys(input, START_KEYS, 'startCoordinate');
  if (explicitStart) {
    return anchorFromCandidate(
      explicitStart,
      'explicit_start_coordinate',
      0.9,
      'Explicit start coordinate supplied by route data.',
      invalidWarnings,
    );
  }

  const routeCoordinates = getTrailRouteCoordinateCandidates(input);
  if (routeCoordinates[0]) {
    return anchorFromCandidate(
      routeCoordinates[0],
      'geometry_first_point',
      0.78,
      'Route geometry first point used as trailhead anchor.',
      [
        ...invalidWarnings,
        warning('fallback_trailhead_used', 'Trailhead was inferred from route geometry first point.', 'info', routeCoordinates[0].sourcePath),
      ],
    );
  }

  const endpoint = getEndpointCandidates(input)[0] ?? null;
  if (endpoint) {
    return anchorFromCandidate(
      endpoint,
      'geometry_endpoint',
      0.62,
      endpoint.heuristicReasons[0] ?? 'Ambiguous route endpoint selected using available route metadata.',
      [
        ...invalidWarnings,
        warning('fallback_trailhead_used', 'Trailhead was inferred from ambiguous endpoint metadata.', 'watch', endpoint.sourcePath),
      ],
    );
  }

  const poi = getCandidateFromKeys(input, POI_KEYS, 'poiCoordinate');
  if (poi) {
    return anchorFromCandidate(
      poi,
      'poi_coordinate',
      0.48,
      'POI coordinate used because trailhead/start geometry was unavailable.',
      [
        ...invalidWarnings,
        warning('fallback_trailhead_used', 'Trailhead was inferred from POI data.', 'watch', poi.sourcePath),
      ],
    );
  }

  const fallback = getCentroidFallback(input);
  if (fallback) {
    return anchorFromCandidate(
      fallback,
      'centroid_fallback',
      0.32,
      'Centroid fallback used because only area/bounds data was available.',
      [
        ...invalidWarnings,
        warning('fallback_trailhead_used', 'Trailhead was inferred from area centroid.', 'caution', fallback.sourcePath),
      ],
    );
  }

  return {
    lat: 0,
    lng: 0,
    label: null,
    source: 'unknown',
    confidence: UNKNOWN_CONFIDENCE,
    warnings: [
      ...invalidWarnings,
      warning('fallback_trailhead_used', 'Trailhead anchor could not be resolved from available route data.', 'caution'),
    ],
    providerMetadata: {
      sourcePath: 'unknown',
    },
  };
}
