export type RouteBuilderSnapStatus =
  | 'snapped'
  | 'raw_smoothed'
  | 'too_short'
  | 'ambiguous'
  | 'failed'
  | 'network_pending'
  | 'blocked'
  | null;

export type RouteBuilderSnapProvider =
  | 'rendered_features'
  | 'mapbox_map_matching'
  | null;

export type RouteBuilderSnapProfile = 'driving' | null;

export type RouteBuilderCoordinate =
  | [number, number]
  | { latitude?: number; longitude?: number; lat?: number; lng?: number };

export type FinalizableRouteBuilderSegment = {
  id: string;
  coordinates: RouteBuilderCoordinate[];
  rawSegment?: RouteBuilderCoordinate[];
  snappedSegment?: RouteBuilderCoordinate[];
  snapConfidence?: 'high' | 'medium' | 'low' | null;
  snapSource?: string | null;
  snapStatus?: RouteBuilderSnapStatus;
  snapProvider?: RouteBuilderSnapProvider;
  snapProfile?: RouteBuilderSnapProfile;
  snapMessage?: string | null;
  sourceSegmentId?: string | null;
  buildSource?: { kind?: string | null; sourceLabel?: string | null } | null;
};

export type MapboxMapMatchingCandidate = {
  coordinates: RouteBuilderCoordinate[];
  confidence?: number | null;
  distanceM?: number | null;
};

export type FinalSnapInput = {
  segment: FinalizableRouteBuilderSegment;
  mapboxMatch?: MapboxMapMatchingCandidate | null;
  mapboxAvailable: boolean;
};

export type FinalSnapResult = {
  accepted: boolean;
  reason: RouteBuilderSnapStatus;
  segment: FinalizableRouteBuilderSegment;
};

export type MapboxMapMatchingResponse = {
  code?: string;
  matchings?: Array<{
    confidence?: number;
    distance?: number;
    geometry?: {
      coordinates?: [number, number][];
      type?: string;
    };
  }>;
};

const EARTH_RADIUS_M = 6371000;
const MAPBOX_MAX_MATCHING_COORDINATES = 100;
const MAPBOX_MAX_RADIUS_M = 50;
const FINAL_ENDPOINT_TOLERANCE_M = 120;
const FINAL_MIN_CONFIDENCE = 0.5;
const FINAL_MIN_DISTANCE_RATIO = 0.5;
const FINAL_MAX_DISTANCE_RATIO = 2.5;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

export function normalizeRouteBuilderCoordinate(
  coordinate: RouteBuilderCoordinate | null | undefined,
): [number, number] | null {
  if (!coordinate) return null;
  const lng = Array.isArray(coordinate)
    ? Number(coordinate[0])
    : Number(coordinate.longitude ?? coordinate.lng);
  const lat = Array.isArray(coordinate)
    ? Number(coordinate[1])
    : Number(coordinate.latitude ?? coordinate.lat);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lng, lat];
}

export function normalizeRouteBuilderLine(
  coordinates: RouteBuilderCoordinate[] | null | undefined,
): [number, number][] {
  const normalized: [number, number][] = [];
  for (const coordinate of coordinates ?? []) {
    const next = normalizeRouteBuilderCoordinate(coordinate);
    if (!next) continue;
    const previous = normalized[normalized.length - 1];
    if (previous && previous[0] === next[0] && previous[1] === next[1]) continue;
    normalized.push(next);
  }
  return normalized;
}

export function routeBuilderLineDistanceMeters(coordinates: RouteBuilderCoordinate[]): number {
  const line = normalizeRouteBuilderLine(coordinates);
  let total = 0;
  for (let index = 1; index < line.length; index += 1) {
    total += haversineMeters(
      { lng: line[index - 1][0], lat: line[index - 1][1] },
      { lng: line[index][0], lat: line[index][1] },
    );
  }
  return total;
}

export function resampleMapMatchingCoordinates(
  coordinates: RouteBuilderCoordinate[],
  maxCoordinates = MAPBOX_MAX_MATCHING_COORDINATES,
): [number, number][] {
  const line = normalizeRouteBuilderLine(coordinates);
  const limit = Math.max(2, Math.min(MAPBOX_MAX_MATCHING_COORDINATES, Math.floor(maxCoordinates)));
  if (line.length <= limit) return line;

  const sampled: [number, number][] = [];
  for (let index = 0; index < limit; index += 1) {
    const sourceIndex = Math.round((index * (line.length - 1)) / (limit - 1));
    const point = line[sourceIndex];
    if (!sampled.length || sampled[sampled.length - 1][0] !== point[0] || sampled[sampled.length - 1][1] !== point[1]) {
      sampled.push(point);
    }
  }

  const finalPoint = line[line.length - 1];
  if (
    sampled[sampled.length - 1][0] !== finalPoint[0] ||
    sampled[sampled.length - 1][1] !== finalPoint[1]
  ) {
    sampled[sampled.length - 1] = finalPoint;
  }
  return sampled;
}

function cloneSegmentWith(
  segment: FinalizableRouteBuilderSegment,
  updates: Partial<FinalizableRouteBuilderSegment>,
): FinalizableRouteBuilderSegment {
  return {
    ...segment,
    ...updates,
  };
}

function localSnapIsAcceptable(segment: FinalizableRouteBuilderSegment): boolean {
  const confidence = segment.snapConfidence ?? null;
  const source = String(segment.snapSource ?? '').toLowerCase();
  const snappedLine = normalizeRouteBuilderLine(segment.snappedSegment?.length ? segment.snappedSegment : segment.coordinates);
  return (
    segment.snapStatus === 'snapped' &&
    (confidence === 'high' || confidence === 'medium') &&
    snappedLine.length >= 2 &&
    !['free', 'raw', 'raw-smoothed', 'ambiguous-local-routeable'].includes(source)
  );
}

function localRenderedSourceLabel(source: string | null | undefined): string {
  const normalized = String(source ?? '').toLowerCase();
  if (normalized.includes('road') || normalized.includes('street')) return 'rendered_road';
  if (normalized.includes('trail') || normalized.includes('path') || normalized.includes('track')) {
    return 'rendered_trail';
  }
  return 'rendered_routeable';
}

export function routeBuilderSegmentMetadataSourceLabel(
  segment: Pick<FinalizableRouteBuilderSegment, 'snapProvider' | 'snapSource' | 'snapProfile' | 'buildSource'>,
): string {
  if (segment.buildSource?.sourceLabel) return segment.buildSource.sourceLabel;
  if (segment.snapProvider === 'mapbox_map_matching') return 'mapbox_map_matching_driving';
  return localRenderedSourceLabel(segment.snapSource);
}

export function isVerifiedRouteBuilderSegment(segment: FinalizableRouteBuilderSegment): boolean {
  const line = normalizeRouteBuilderLine(segment.coordinates);
  if (line.length < 2) return false;
  if (segment.buildSource?.kind === 'dispersed_route_leg' && segment.snapStatus === 'snapped') {
    return true;
  }
  if (segment.snapStatus !== 'snapped') return false;
  if (segment.snapProvider === 'mapbox_map_matching' && segment.snapProfile === 'driving') return true;
  if (segment.snapProvider === 'rendered_features' && localSnapIsAcceptable(segment)) return true;
  return false;
}

export function canSaveRouteBuilderSegments(segments: FinalizableRouteBuilderSegment[]): boolean {
  const drawable = segments.filter((segment) => normalizeRouteBuilderLine(segment.coordinates).length >= 2);
  return drawable.length > 0 && drawable.every(isVerifiedRouteBuilderSegment);
}

export function finalizeRouteBuilderSegmentSnap(input: FinalSnapInput): FinalSnapResult {
  const rawLine = normalizeRouteBuilderLine(
    input.segment.rawSegment?.length ? input.segment.rawSegment : input.segment.coordinates,
  );
  const rawDistanceM = routeBuilderLineDistanceMeters(rawLine);

  if (rawLine.length < 2 || rawDistanceM <= 0) {
    return {
      accepted: false,
      reason: 'too_short',
      segment: cloneSegmentWith(input.segment, {
        coordinates: rawLine,
        rawSegment: rawLine,
        snappedSegment: [],
        snapConfidence: 'low',
        snapStatus: 'too_short',
        snapProvider: null,
        snapProfile: null,
        snapMessage: 'Segment too short. Draw a longer verified stroke.',
      }),
    };
  }

  if (input.mapboxMatch) {
    const matchedLine = normalizeRouteBuilderLine(input.mapboxMatch.coordinates);
    const matchedDistanceM = Number.isFinite(Number(input.mapboxMatch.distanceM))
      ? Number(input.mapboxMatch.distanceM)
      : routeBuilderLineDistanceMeters(matchedLine);
    const confidence =
      Number.isFinite(Number(input.mapboxMatch.confidence)) ? Number(input.mapboxMatch.confidence) : null;
    const endpointStartM =
      matchedLine.length >= 2
        ? haversineMeters(
            { lng: rawLine[0][0], lat: rawLine[0][1] },
            { lng: matchedLine[0][0], lat: matchedLine[0][1] },
          )
        : Infinity;
    const endpointEndM =
      matchedLine.length >= 2
        ? haversineMeters(
            { lng: rawLine[rawLine.length - 1][0], lat: rawLine[rawLine.length - 1][1] },
            { lng: matchedLine[matchedLine.length - 1][0], lat: matchedLine[matchedLine.length - 1][1] },
          )
        : Infinity;
    const distanceRatio = matchedDistanceM / rawDistanceM;
    const passesConfidence = confidence == null || confidence >= FINAL_MIN_CONFIDENCE;
    const accepted =
      matchedLine.length >= 2 &&
      passesConfidence &&
      endpointStartM <= FINAL_ENDPOINT_TOLERANCE_M &&
      endpointEndM <= FINAL_ENDPOINT_TOLERANCE_M &&
      distanceRatio >= FINAL_MIN_DISTANCE_RATIO &&
      distanceRatio <= FINAL_MAX_DISTANCE_RATIO;

    if (accepted) {
      return {
        accepted: true,
        reason: 'snapped',
        segment: cloneSegmentWith(input.segment, {
          coordinates: matchedLine,
          rawSegment: rawLine,
          snappedSegment: matchedLine,
          snapConfidence: confidence == null || confidence >= 0.8 ? 'high' : 'medium',
          snapSource: 'mapbox_map_matching_driving',
          snapStatus: 'snapped',
          snapProvider: 'mapbox_map_matching',
          snapProfile: 'driving',
          snapMessage: 'Verified with Mapbox driving map matching.',
        }),
      };
    }

    return {
      accepted: false,
      reason: 'blocked',
      segment: cloneSegmentWith(input.segment, {
        coordinates: input.segment.coordinates,
        rawSegment: rawLine,
        snapConfidence: 'low',
        snapStatus: 'blocked',
        snapProvider: null,
        snapProfile: null,
        snapMessage: 'Mapbox driving match did not pass ECS verification. Undo and redraw this segment.',
      }),
    };
  }

  if (!input.mapboxAvailable && localSnapIsAcceptable(input.segment)) {
    const localLine = normalizeRouteBuilderLine(
      input.segment.snappedSegment?.length ? input.segment.snappedSegment : input.segment.coordinates,
    );
    return {
      accepted: true,
      reason: 'snapped',
      segment: cloneSegmentWith(input.segment, {
        coordinates: localLine,
        rawSegment: rawLine,
        snappedSegment: localLine,
        snapProvider: 'rendered_features',
        snapProfile: null,
        snapStatus: 'snapped',
        snapMessage: input.segment.snapMessage ?? 'Verified against rendered routeable map geometry.',
      }),
    };
  }

  return {
    accepted: false,
    reason: 'blocked',
    segment: cloneSegmentWith(input.segment, {
      rawSegment: rawLine,
      snapConfidence: 'low',
      snapStatus: 'blocked',
      snapProvider: null,
      snapProfile: null,
      snapMessage: input.mapboxAvailable
        ? 'Mapbox driving match failed. Undo and redraw this segment.'
        : 'Raw or ambiguous strokes cannot be saved offline. Use a rendered road or trail snap.',
    }),
  };
}

export function buildMapboxMapMatchingRequest(params: {
  accessToken: string;
  coordinates: RouteBuilderCoordinate[];
  radiusM?: number;
}): string | null {
  const coordinates = resampleMapMatchingCoordinates(params.coordinates);
  if (coordinates.length < 2) return null;
  const radius = Math.max(0, Math.min(MAPBOX_MAX_RADIUS_M, Number(params.radiusM ?? 25)));
  const encodedCoordinates = coordinates
    .map((coordinate) => `${coordinate[0]},${coordinate[1]}`)
    .join(';');
  const url = new URL(`https://api.mapbox.com/matching/v5/mapbox/driving/${encodedCoordinates}.json`);
  url.searchParams.set('access_token', params.accessToken);
  url.searchParams.set('geometries', 'geojson');
  url.searchParams.set('overview', 'full');
  url.searchParams.set('radiuses', coordinates.map(() => String(radius)).join(';'));
  return url.toString();
}

export function mapboxMapMatchingCandidateFromResponse(
  response: MapboxMapMatchingResponse,
): MapboxMapMatchingCandidate | null {
  if (response?.code && response.code !== 'Ok') return null;
  const matchings = Array.isArray(response?.matchings) ? response.matchings : [];
  if (matchings.length !== 1) return null;
  const match = matchings[0];
  const coordinates = normalizeRouteBuilderLine(match?.geometry?.coordinates ?? []);
  if (coordinates.length < 2) return null;
  return {
    coordinates,
    confidence: Number.isFinite(Number(match.confidence)) ? Number(match.confidence) : null,
    distanceM: Number.isFinite(Number(match.distance)) ? Number(match.distance) : null,
  };
}

export async function fetchMapboxMapMatchingCandidate(params: {
  accessToken: string;
  coordinates: RouteBuilderCoordinate[];
  radiusM?: number;
  timeoutMs?: number;
}): Promise<MapboxMapMatchingCandidate | null> {
  const url = buildMapboxMapMatchingRequest(params);
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs ?? 9000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return mapboxMapMatchingCandidateFromResponse((await response.json()) as MapboxMapMatchingResponse);
  } finally {
    clearTimeout(timer);
  }
}
