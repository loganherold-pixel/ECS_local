export type NavigateRouteCoordinate = {
  latitude: number;
  longitude: number;
};

export type NavigateRouteAnchor = {
  id: string;
  label: string;
  coordinate: NavigateRouteCoordinate;
  routeableSegment?: NavigateRouteTraceableSegment | null;
};

export type NavigateRouteTraceProvider = 'ecs_route_geometry' | 'rendered_features' | 'mapbox_map_matching' | 'unavailable';
export type NavigateRouteLegStatus = 'snapped' | 'blocked';

export type NavigateRouteLeg = {
  id: string;
  fromAnchorId: string;
  toAnchorId: string;
  coordinates: NavigateRouteCoordinate[];
  provider: NavigateRouteTraceProvider;
  status: NavigateRouteLegStatus;
  confidence: 'high' | 'medium' | 'low' | 'unknown';
  source: string;
  sourceSegmentId: string | null;
  sourceLabel: string | null;
  dataState: string | null;
  warnings: string[];
  unavailableReason: string | null;
};

export type NavigateRouteDraft = {
  anchors: NavigateRouteAnchor[];
  legs: NavigateRouteLeg[];
};

export type NavigateRouteTraceableSegment = {
  id: string;
  name?: string | null;
  sourceLabel?: string | null;
  confidence?: 'high' | 'medium' | 'low' | 'unknown' | string | null;
  dataState?: string | null;
  provider?: NavigateRouteTraceProvider | null;
  coordinates: NavigateRouteCoordinate[];
  warnings?: string[] | null;
};

export type AddAnchorToDraftInput = {
  coordinate: NavigateRouteCoordinate;
  availableSegments?: NavigateRouteTraceableSegment[];
  routeableSegment?: NavigateRouteTraceableSegment | null;
};

export type RouteBuilderSegmentFromDraft = {
  id: string;
  coordinates: [number, number][];
  rawSegment: [number, number][];
  snappedSegment: [number, number][];
  snapConfidence: 'high' | 'medium' | 'low' | null;
  snapSource: string | null;
  snapStatus: 'snapped';
  snapProvider: 'ecs_route_geometry' | 'rendered_features';
  snapProfile: null;
  snapMessage: string | null;
  sourceSegmentId: string | null;
  buildSource: { kind: string; sourceLabel: string | null; confidence: string | null } | null;
};

const EARTH_RADIUS_MI = 3958.8;
const DEFAULT_TRACE_MATCH_THRESHOLD_MI = 0.35;
const MILES_PER_LATITUDE_DEGREE = 69.0;
const COORDINATE_EPSILON = 0.0000005;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function distanceMiles(a: NavigateRouteCoordinate, b: NavigateRouteCoordinate): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function normalizeCoordinate(coordinate: NavigateRouteCoordinate): NavigateRouteCoordinate | null {
  const latitude = Number(coordinate?.latitude);
  const longitude = Number(coordinate?.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

function nextAnchorLabel(index: number): string {
  const normalized = Math.max(0, index);
  if (normalized < 26) return String.fromCharCode(65 + normalized);
  return `P${normalized + 1}`;
}

type ProjectedPoint = {
  segmentIndex: number;
  t: number;
  coordinate: NavigateRouteCoordinate;
  distanceMiles: number;
};

function pointsEqual(a: NavigateRouteCoordinate, b: NavigateRouteCoordinate): boolean {
  return (
    Math.abs(a.latitude - b.latitude) <= COORDINATE_EPSILON &&
    Math.abs(a.longitude - b.longitude) <= COORDINATE_EPSILON
  );
}

function dedupeLine(line: NavigateRouteCoordinate[]): NavigateRouteCoordinate[] {
  const output: NavigateRouteCoordinate[] = [];
  for (const point of line) {
    const coordinate = normalizeCoordinate(point);
    if (!coordinate) continue;
    const previous = output[output.length - 1];
    if (!previous || !pointsEqual(previous, coordinate)) output.push(coordinate);
  }
  return output;
}

function projectPointToSegment(
  point: NavigateRouteCoordinate,
  a: NavigateRouteCoordinate,
  b: NavigateRouteCoordinate,
): { t: number; coordinate: NavigateRouteCoordinate; distanceMiles: number } | null {
  const latScale = MILES_PER_LATITUDE_DEGREE;
  const lngScale = Math.max(
    0.000001,
    Math.cos(toRadians((point.latitude + a.latitude + b.latitude) / 3)),
  ) * MILES_PER_LATITUDE_DEGREE;
  const ax = a.longitude * lngScale;
  const ay = a.latitude * latScale;
  const bx = b.longitude * lngScale;
  const by = b.latitude * latScale;
  const px = point.longitude * lngScale;
  const py = point.latitude * latScale;
  const abx = bx - ax;
  const aby = by - ay;
  const abLengthSq = abx * abx + aby * aby;
  if (abLengthSq <= 0) return null;
  const unclampedT = ((px - ax) * abx + (py - ay) * aby) / abLengthSq;
  const t = Math.max(0, Math.min(1, unclampedT));
  const snappedX = ax + abx * t;
  const snappedY = ay + aby * t;
  const coordinate = {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
  const dx = px - snappedX;
  const dy = py - snappedY;
  return {
    t,
    coordinate,
    distanceMiles: Math.sqrt(dx * dx + dy * dy),
  };
}

function nearestProjectedPointOnLine(
  line: NavigateRouteCoordinate[],
  coordinate: NavigateRouteCoordinate,
): ProjectedPoint | null {
  let nearest: ProjectedPoint | null = null;
  for (let index = 1; index < line.length; index += 1) {
    const projected = projectPointToSegment(coordinate, line[index - 1], line[index]);
    if (!projected) continue;
    const candidate = {
      segmentIndex: index - 1,
      t: projected.t,
      coordinate: projected.coordinate,
      distanceMiles: projected.distanceMiles,
    };
    if (!nearest || candidate.distanceMiles < nearest.distanceMiles) nearest = candidate;
  }
  return nearest;
}

function projectionProgress(projection: ProjectedPoint): number {
  return projection.segmentIndex + projection.t;
}

function extractProjectedLine(
  line: NavigateRouteCoordinate[],
  start: ProjectedPoint,
  end: ProjectedPoint,
): NavigateRouteCoordinate[] {
  const startProgress = projectionProgress(start);
  const endProgress = projectionProgress(end);
  if (startProgress > endProgress) {
    return extractProjectedLine(line, end, start).reverse();
  }

  const output: NavigateRouteCoordinate[] = [start.coordinate];
  for (let vertexIndex = start.segmentIndex + 1; vertexIndex <= end.segmentIndex; vertexIndex += 1) {
    const vertex = line[vertexIndex];
    if (vertex) output.push(vertex);
  }
  output.push(end.coordinate);
  return dedupeLine(output);
}

function cleanConfidence(value: unknown): 'high' | 'medium' | 'low' | 'unknown' {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return 'unknown';
}

function cleanTraceProvider(value: unknown): Exclude<NavigateRouteTraceProvider, 'unavailable'> {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'rendered_features' || normalized === 'mapbox_map_matching') return normalized;
  return 'ecs_route_geometry';
}

function normalizeTraceableSegments(
  segments: Array<NavigateRouteTraceableSegment | null | undefined>,
): NavigateRouteTraceableSegment[] {
  const seen = new Set<string>();
  const normalized: NavigateRouteTraceableSegment[] = [];
  for (const segment of segments) {
    if (!segment) continue;
    const line = (segment.coordinates ?? [])
      .map(normalizeCoordinate)
      .filter((point): point is NavigateRouteCoordinate => !!point);
    if (line.length < 2) continue;
    const id = String(segment.id || `segment-${normalized.length}`).trim();
    const signature = `${id}:${line
      .slice(0, 4)
      .map((point) => `${point.latitude.toFixed(6)},${point.longitude.toFixed(6)}`)
      .join(';')}:${line.length}`;
    if (seen.has(signature)) continue;
    seen.add(signature);
    normalized.push({
      ...segment,
      id,
      coordinates: dedupeLine(line),
    });
  }
  return normalized;
}

function traceLeg(
  from: NavigateRouteAnchor,
  to: NavigateRouteAnchor,
  segments: NavigateRouteTraceableSegment[],
): NavigateRouteLeg {
  let best:
    | {
        segment: NavigateRouteTraceableSegment;
        line: NavigateRouteCoordinate[];
        start: ProjectedPoint;
        end: ProjectedPoint;
        score: number;
      }
    | null = null;

  for (const segment of normalizeTraceableSegments(segments)) {
    const line = segment.coordinates;
    if (line.length < 2) continue;
    const start = nearestProjectedPointOnLine(line, from.coordinate);
    const end = nearestProjectedPointOnLine(line, to.coordinate);
    if (!start || !end) continue;
    if (
      start.distanceMiles > DEFAULT_TRACE_MATCH_THRESHOLD_MI ||
      end.distanceMiles > DEFAULT_TRACE_MATCH_THRESHOLD_MI
    ) {
      continue;
    }
    const score = start.distanceMiles + end.distanceMiles;
    if (!best || score < best.score) {
      best = { segment, line, start, end, score };
    }
  }

  if (best) {
    const snappedLine = extractProjectedLine(best.line, best.start, best.end);
    const provider = cleanTraceProvider(best.segment.provider);
    const sourceLabel =
      best.segment.sourceLabel ??
      best.segment.name ??
      (provider === 'rendered_features' ? 'Visible routeable geometry' : null);

    return {
      id: `leg-${from.label}-${to.label}`,
      fromAnchorId: from.id,
      toAnchorId: to.id,
      coordinates: snappedLine,
      provider,
      status: 'snapped',
      confidence: cleanConfidence(best.segment.confidence),
      source: provider,
      sourceSegmentId: best.segment.id,
      sourceLabel,
      dataState: best.segment.dataState ?? null,
      warnings: [...(best.segment.warnings ?? [])],
      unavailableReason: null,
    };
  }

  return {
    id: `leg-${from.label}-${to.label}`,
    fromAnchorId: from.id,
    toAnchorId: to.id,
    coordinates: [from.coordinate, to.coordinate],
    provider: 'unavailable',
    status: 'blocked',
    confidence: 'unknown',
    source: 'unavailable',
    sourceSegmentId: null,
    sourceLabel: null,
    dataState: null,
    warnings: [],
    unavailableReason: 'Point not linked. Tap closer to loaded road or trail geometry.',
  };
}

function flattenLegCoordinates(legs: NavigateRouteLeg[]): NavigateRouteCoordinate[] {
  const output: NavigateRouteCoordinate[] = [];
  legs.forEach((leg) => {
    if (leg.status !== 'snapped') return;
    leg.coordinates.forEach((coordinate, index) => {
      const previous = output[output.length - 1];
      if (index > 0 || !previous || previous.latitude !== coordinate.latitude || previous.longitude !== coordinate.longitude) {
        output.push(coordinate);
      }
    });
  });
  return output;
}

export function createNavigateRouteDraft(): NavigateRouteDraft {
  return { anchors: [], legs: [] };
}

export function addAnchorToDraft(
  draft: NavigateRouteDraft,
  input: AddAnchorToDraftInput,
): { draft: NavigateRouteDraft; leg: NavigateRouteLeg | null } {
  const coordinate = normalizeCoordinate(input.coordinate);
  if (!coordinate) return { draft, leg: null };
  const routeableSegment = normalizeTraceableSegments([input.routeableSegment])[0] ?? null;
  const anchor: NavigateRouteAnchor = {
    id: `anchor-${draft.anchors.length + 1}`,
    label: nextAnchorLabel(draft.anchors.length),
    coordinate,
    routeableSegment,
  };
  const anchors = [...draft.anchors, anchor];
  const previous = draft.anchors[draft.anchors.length - 1] ?? null;
  if (!previous) return { draft: { anchors, legs: [...draft.legs] }, leg: null };
  const leg = traceLeg(
    previous,
    anchor,
    normalizeTraceableSegments([
      previous.routeableSegment,
      routeableSegment,
      ...(input.availableSegments ?? []),
    ]),
  );
  return {
    draft: {
      anchors,
      legs: [...draft.legs, leg],
    },
    leg,
  };
}

export function undoLastNavigateRouteAnchor(draft: NavigateRouteDraft): NavigateRouteDraft {
  if (draft.anchors.length === 0) return createNavigateRouteDraft();
  return {
    anchors: draft.anchors.slice(0, -1),
    legs: draft.legs.slice(0, Math.max(0, draft.legs.length - 1)),
  };
}

export function clearNavigateRouteDraft(_draft?: NavigateRouteDraft): NavigateRouteDraft {
  return createNavigateRouteDraft();
}

export function buildRouteBuilderSegmentsFromDraft(
  draft: NavigateRouteDraft,
): RouteBuilderSegmentFromDraft[] {
  return draft.legs
    .filter((leg) => leg.status === 'snapped' && leg.coordinates.length >= 2)
    .map((leg) => {
      const coordinates = leg.coordinates.map((point) => [point.longitude, point.latitude] as [number, number]);
      const sourceLabel =
        leg.sourceLabel ??
        (leg.provider === 'rendered_features' ? 'Visible routeable geometry' : 'ECS route geometry');
      const snapProvider = leg.provider === 'rendered_features' ? 'rendered_features' : 'ecs_route_geometry';
      return {
        id: `route-builder-${leg.id}`,
        coordinates,
        rawSegment: coordinates,
        snappedSegment: coordinates,
        snapConfidence: leg.confidence === 'unknown' ? 'medium' : leg.confidence,
        snapSource: leg.provider === 'rendered_features' ? sourceLabel : 'route_geometry_overlay',
        snapStatus: 'snapped',
        snapProvider,
        snapProfile: null,
        snapMessage:
          leg.provider === 'rendered_features'
            ? 'Snapped to visible routeable map geometry. Verify access, closures, and posted rules before travel.'
            : 'ECS route geometry is planning/reference geometry. Verify access, closures, and posted rules before travel.',
        sourceSegmentId: leg.sourceSegmentId,
        buildSource: {
          kind: leg.provider === 'rendered_features' ? 'rendered_routeable_geometry' : 'ecs_route_geometry',
          sourceLabel,
          confidence: 'planning_geometry',
        },
      };
    });
}

export function resolveNearestNavigateRouteAnchor(
  draft: NavigateRouteDraft,
  origin: NavigateRouteCoordinate | null | undefined,
): NavigateRouteAnchor | null {
  const safeOrigin = origin ? normalizeCoordinate(origin) : null;
  if (!safeOrigin) return null;
  let nearest: { anchor: NavigateRouteAnchor; distanceMiles: number } | null = null;
  for (const anchor of draft.anchors) {
    const distance = distanceMiles(anchor.coordinate, safeOrigin);
    if (!nearest || distance < nearest.distanceMiles) nearest = { anchor, distanceMiles: distance };
  }
  return nearest?.anchor ?? null;
}

export function buildRouteFromNearestAnchor(
  draft: NavigateRouteDraft,
  origin: NavigateRouteCoordinate | null | undefined,
): { entryAnchor: NavigateRouteAnchor | null; coordinates: NavigateRouteCoordinate[] } {
  const entryAnchor = resolveNearestNavigateRouteAnchor(draft, origin);
  if (!entryAnchor) return { entryAnchor: null, coordinates: flattenLegCoordinates(draft.legs) };
  const entryIndex = draft.anchors.findIndex((anchor) => anchor.id === entryAnchor.id);
  if (entryIndex < 0) return { entryAnchor, coordinates: flattenLegCoordinates(draft.legs) };

  const forwardLegs = draft.legs.slice(entryIndex);
  const forward = flattenLegCoordinates(forwardLegs);
  if (forward.length >= 2) return { entryAnchor, coordinates: forward };

  const reverseLegs = draft.legs.slice(0, entryIndex).reverse().map((leg) => ({
    ...leg,
    coordinates: [...leg.coordinates].reverse(),
  }));
  return { entryAnchor, coordinates: flattenLegCoordinates(reverseLegs) };
}
