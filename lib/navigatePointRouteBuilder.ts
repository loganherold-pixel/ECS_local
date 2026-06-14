export type NavigateRouteCoordinate = {
  latitude: number;
  longitude: number;
};

export type NavigateRouteAnchor = {
  id: string;
  label: string;
  coordinate: NavigateRouteCoordinate;
};

export type NavigateRouteTraceProvider = 'ecs_route_geometry' | 'mapbox_map_matching' | 'unavailable';
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
  coordinates: NavigateRouteCoordinate[];
  warnings?: string[] | null;
};

export type AddAnchorToDraftInput = {
  coordinate: NavigateRouteCoordinate;
  availableSegments?: NavigateRouteTraceableSegment[];
};

export type RouteBuilderSegmentFromDraft = {
  id: string;
  coordinates: [number, number][];
  rawSegment: [number, number][];
  snappedSegment: [number, number][];
  snapConfidence: 'high' | 'medium' | 'low' | null;
  snapSource: string | null;
  snapStatus: 'snapped';
  snapProvider: 'ecs_route_geometry';
  snapProfile: null;
  snapMessage: string | null;
  sourceSegmentId: string | null;
  buildSource: { kind: string; sourceLabel: string | null; confidence: string | null } | null;
};

const EARTH_RADIUS_MI = 3958.8;
const DEFAULT_TRACE_MATCH_THRESHOLD_MI = 0.35;

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

function nearestCoordinateIndex(
  line: NavigateRouteCoordinate[],
  coordinate: NavigateRouteCoordinate,
): { index: number; distanceMiles: number } | null {
  let nearest: { index: number; distanceMiles: number } | null = null;
  line.forEach((point, index) => {
    const distance = distanceMiles(point, coordinate);
    if (!nearest || distance < nearest.distanceMiles) nearest = { index, distanceMiles: distance };
  });
  return nearest;
}

function cleanConfidence(value: unknown): 'high' | 'medium' | 'low' | 'unknown' {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'high' || normalized === 'medium' || normalized === 'low') return normalized;
  return 'unknown';
}

function traceLeg(
  from: NavigateRouteAnchor,
  to: NavigateRouteAnchor,
  segments: NavigateRouteTraceableSegment[],
): NavigateRouteLeg {
  for (const segment of segments) {
    const line = (segment.coordinates ?? []).map(normalizeCoordinate).filter((point): point is NavigateRouteCoordinate => !!point);
    if (line.length < 2) continue;
    const start = nearestCoordinateIndex(line, from.coordinate);
    const end = nearestCoordinateIndex(line, to.coordinate);
    if (!start || !end) continue;
    if (
      start.distanceMiles > DEFAULT_TRACE_MATCH_THRESHOLD_MI ||
      end.distanceMiles > DEFAULT_TRACE_MATCH_THRESHOLD_MI
    ) {
      continue;
    }
    const coordinates =
      start.index <= end.index
        ? line.slice(start.index, end.index + 1)
        : line.slice(end.index, start.index + 1).reverse();
    const snappedLine =
      coordinates.length >= 2
        ? coordinates
        : [from.coordinate, to.coordinate];

    return {
      id: `leg-${from.label}-${to.label}`,
      fromAnchorId: from.id,
      toAnchorId: to.id,
      coordinates: snappedLine,
      provider: 'ecs_route_geometry',
      status: 'snapped',
      confidence: cleanConfidence(segment.confidence),
      source: 'ecs_route_geometry',
      sourceSegmentId: segment.id,
      sourceLabel: segment.sourceLabel ?? segment.name ?? null,
      dataState: segment.dataState ?? null,
      warnings: [...(segment.warnings ?? [])],
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
    unavailableReason: 'No loaded ECS route geometry connects these anchors.',
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
  const anchor: NavigateRouteAnchor = {
    id: `anchor-${draft.anchors.length + 1}`,
    label: nextAnchorLabel(draft.anchors.length),
    coordinate,
  };
  const anchors = [...draft.anchors, anchor];
  const previous = draft.anchors[draft.anchors.length - 1] ?? null;
  if (!previous) return { draft: { anchors, legs: [...draft.legs] }, leg: null };
  const leg = traceLeg(previous, anchor, input.availableSegments ?? []);
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
      const sourceLabel = leg.sourceLabel ?? 'ECS route geometry';
      return {
        id: `route-builder-${leg.id}`,
        coordinates,
        rawSegment: coordinates,
        snappedSegment: coordinates,
        snapConfidence: leg.confidence === 'unknown' ? 'medium' : leg.confidence,
        snapSource: 'route_geometry_overlay',
        snapStatus: 'snapped',
        snapProvider: 'ecs_route_geometry',
        snapProfile: null,
        snapMessage: 'ECS route geometry is planning/reference geometry. Verify access, closures, and posted rules before travel.',
        sourceSegmentId: leg.sourceSegmentId,
        buildSource: {
          kind: 'ecs_route_geometry',
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
