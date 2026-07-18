export type NavigateRouteCoordinate = {
  latitude: number;
  longitude: number;
};

export type NavigateRouteAnchor = {
  id: string;
  label: string;
  coordinate: NavigateRouteCoordinate;
  routeableSegment?: NavigateRouteTraceableSegment | null;
  role?: 'operator_drop' | 'active_guidance_end';
  hidden?: boolean;
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

export type NavigateRouteDraftHistory = {
  past: NavigateRouteDraft[];
  present: NavigateRouteDraft;
  future: NavigateRouteDraft[];
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

export type AddActiveGuidanceExtensionAnchorInput = AddAnchorToDraftInput & {
  activeRouteEnd?: NavigateRouteCoordinate | null;
};

export type NavigateRouteGeometryRole =
  | 'raw_user_draft'
  | 'snapped_draft'
  | 'finalized_route'
  | 'preview_route'
  | 'active_guidance_route';

export type RouteBuilderSegmentFromDraft = {
  id: string;
  coordinates: [number, number][];
  rawSegment: [number, number][];
  snappedSegment: [number, number][];
  snapConfidence: 'high' | 'medium' | 'low' | null;
  snapSource: string | null;
  snapStatus: 'snapped' | 'blocked';
  snapProvider: 'ecs_route_geometry' | 'rendered_features' | null;
  snapProfile: null;
  snapMessage: string | null;
  sourceSegmentId: string | null;
  buildSource: {
    kind: string;
    sourceLabel: string;
    confidence: string;
    warnings?: string[];
  } | null;
  geometryRole: Extract<NavigateRouteGeometryRole, 'raw_user_draft' | 'snapped_draft'>;
  provisional: boolean;
};

const EARTH_RADIUS_MI = 3958.8;
const DEFAULT_TRACE_MATCH_THRESHOLD_MI = 0.35;
const MILES_PER_LATITUDE_DEGREE = 69.0;
const COORDINATE_EPSILON = 0.0000005;
const ROUTE_BUILDER_RENDER_EPSILON = 0.000001;
const TRACE_NETWORK_JOIN_THRESHOLD_MI = 0.012;
const TRACE_NETWORK_MAX_SEGMENTS = 96;
const TRACE_NETWORK_MAX_POINTS = 12000;
const TRACE_NETWORK_MAX_ATTACHMENTS = 8;

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

function normalizeCoordinate(coordinate: NavigateRouteCoordinate | null | undefined): NavigateRouteCoordinate | null {
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

function nextOperatorAnchorLabel(anchors: NavigateRouteAnchor[]): string {
  const visibleOperatorAnchors = anchors.filter(
    (anchor) => !anchor.hidden && anchor.role !== 'active_guidance_end',
  );
  return nextAnchorLabel(visibleOperatorAnchors.length);
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

function pointsRenderDistinct(a: NavigateRouteCoordinate, b: NavigateRouteCoordinate): boolean {
  return (
    Math.abs(a.latitude - b.latitude) > ROUTE_BUILDER_RENDER_EPSILON ||
    Math.abs(a.longitude - b.longitude) > ROUTE_BUILDER_RENDER_EPSILON
  );
}

function hasDrawableLegCoordinates(coordinates: NavigateRouteCoordinate[]): boolean {
  const normalized = dedupeLine(coordinates);
  if (normalized.length < 2) return false;
  const first = normalized[0];
  return normalized.some((coordinate, index) => index > 0 && pointsRenderDistinct(first, coordinate));
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

type TraceGraphEdge = {
  to: number;
  weight: number;
  coordinates: NavigateRouteCoordinate[];
  segmentIndex: number | null;
};

type TraceGraphNode = {
  coordinate: NavigateRouteCoordinate;
  segmentIndex: number | null;
  edges: TraceGraphEdge[];
};

type TraceNetworkPath = {
  coordinates: NavigateRouteCoordinate[];
  segments: NavigateRouteTraceableSegment[];
};

function addTraceGraphEdge(
  nodes: TraceGraphNode[],
  from: number,
  to: number,
  coordinates: NavigateRouteCoordinate[],
  segmentIndex: number | null,
  weight = distanceMiles(coordinates[0], coordinates[coordinates.length - 1]),
): void {
  if (!nodes[from] || !nodes[to] || coordinates.length < 2) return;
  nodes[from].edges.push({
    to,
    weight: Math.max(0.000001, weight),
    coordinates,
    segmentIndex,
  });
}

function addBidirectionalTraceGraphEdge(
  nodes: TraceGraphNode[],
  from: number,
  to: number,
  coordinates: NavigateRouteCoordinate[],
  segmentIndex: number | null,
): void {
  const weight = distanceMiles(coordinates[0], coordinates[coordinates.length - 1]);
  addTraceGraphEdge(nodes, from, to, coordinates, segmentIndex, weight);
  addTraceGraphEdge(nodes, to, from, [...coordinates].reverse(), segmentIndex, weight);
}

function pushTraceHeap(
  heap: Array<{ node: number; distance: number }>,
  item: { node: number; distance: number },
): void {
  heap.push(item);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (heap[parent].distance <= item.distance) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = item;
}

function popTraceHeap(
  heap: Array<{ node: number; distance: number }>,
): { node: number; distance: number } | null {
  if (heap.length === 0) return null;
  const first = heap[0];
  const last = heap.pop();
  if (heap.length === 0 || !last) return first;

  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    const right = left + 1;
    if (left >= heap.length) break;
    const smaller = right < heap.length && heap[right].distance < heap[left].distance ? right : left;
    if (heap[smaller].distance >= last.distance) break;
    heap[index] = heap[smaller];
    index = smaller;
  }
  heap[index] = last;
  return first;
}

function weakestTraceConfidence(
  segments: NavigateRouteTraceableSegment[],
): 'high' | 'medium' | 'low' | 'unknown' {
  const rank = { unknown: 0, low: 1, medium: 2, high: 3 } as const;
  return segments.reduce<'high' | 'medium' | 'low' | 'unknown'>((weakest, segment) => {
    const confidence = cleanConfidence(segment.confidence);
    return rank[confidence] < rank[weakest] ? confidence : weakest;
  }, 'high');
}

function traceConnectedNetwork(
  from: NavigateRouteAnchor,
  to: NavigateRouteAnchor,
  allSegments: NavigateRouteTraceableSegment[],
): TraceNetworkPath | null {
  const segments: NavigateRouteTraceableSegment[] = [];
  let pointCount = 0;
  for (const segment of allSegments) {
    if (segments.length >= TRACE_NETWORK_MAX_SEGMENTS) break;
    if (pointCount + segment.coordinates.length > TRACE_NETWORK_MAX_POINTS) continue;
    segments.push(segment);
    pointCount += segment.coordinates.length;
  }
  if (segments.length < 2) return null;

  const nodes: TraceGraphNode[] = [];
  const segmentNodeIds: number[][] = [];
  segments.forEach((segment, segmentIndex) => {
    const nodeIds = segment.coordinates.map((coordinate) => {
      const nodeId = nodes.length;
      nodes.push({ coordinate, segmentIndex, edges: [] });
      return nodeId;
    });
    segmentNodeIds.push(nodeIds);
    for (let index = 1; index < nodeIds.length; index += 1) {
      addBidirectionalTraceGraphEdge(
        nodes,
        nodeIds[index - 1],
        nodeIds[index],
        [segment.coordinates[index - 1], segment.coordinates[index]],
        segmentIndex,
      );
    }
  });

  const referenceLatitude = (from.coordinate.latitude + to.coordinate.latitude) / 2;
  const longitudeScale = Math.max(0.000001, Math.cos(toRadians(referenceLatitude))) * MILES_PER_LATITUDE_DEGREE;
  const buckets = new Map<string, number[]>();
  const bucketKey = (coordinate: NavigateRouteCoordinate) => {
    const x = Math.floor((coordinate.longitude * longitudeScale) / TRACE_NETWORK_JOIN_THRESHOLD_MI);
    const y = Math.floor(
      (coordinate.latitude * MILES_PER_LATITUDE_DEGREE) / TRACE_NETWORK_JOIN_THRESHOLD_MI,
    );
    return { x, y, key: `${x}:${y}` };
  };

  nodes.forEach((node, nodeId) => {
    const bucket = bucketKey(node.coordinate);
    const nearby: Array<{ nodeId: number; distance: number }> = [];
    for (let xOffset = -1; xOffset <= 1; xOffset += 1) {
      for (let yOffset = -1; yOffset <= 1; yOffset += 1) {
        for (const candidateId of buckets.get(`${bucket.x + xOffset}:${bucket.y + yOffset}`) ?? []) {
          const candidate = nodes[candidateId];
          if (candidate.segmentIndex === node.segmentIndex) continue;
          const distance = distanceMiles(candidate.coordinate, node.coordinate);
          if (distance <= TRACE_NETWORK_JOIN_THRESHOLD_MI) {
            nearby.push({ nodeId: candidateId, distance });
          }
        }
      }
    }
    nearby
      .sort((a, b) => a.distance - b.distance)
      .slice(0, TRACE_NETWORK_MAX_ATTACHMENTS)
      .forEach((candidate) => {
        addBidirectionalTraceGraphEdge(
          nodes,
          candidate.nodeId,
          nodeId,
          [nodes[candidate.nodeId].coordinate, node.coordinate],
          null,
        );
      });
    buckets.set(bucket.key, [...(buckets.get(bucket.key) ?? []), nodeId]);
  });

  const projectionCandidates = (
    coordinate: NavigateRouteCoordinate,
    preferredSegmentId: string | null | undefined,
  ) => {
    const candidates = segments
      .map((segment, segmentIndex) => ({
        segmentIndex,
        projection: nearestProjectedPointOnLine(segment.coordinates, coordinate),
      }))
      .filter(
        (candidate): candidate is { segmentIndex: number; projection: ProjectedPoint } =>
          !!candidate.projection &&
          candidate.projection.distanceMiles <= DEFAULT_TRACE_MATCH_THRESHOLD_MI,
      )
      .sort((a, b) => a.projection.distanceMiles - b.projection.distanceMiles);
    const preferredCandidates = preferredSegmentId
      ? candidates.filter((candidate) => segments[candidate.segmentIndex].id === preferredSegmentId)
      : [];
    return (preferredCandidates.length > 0 ? preferredCandidates : candidates).slice(
      0,
      TRACE_NETWORK_MAX_ATTACHMENTS,
    );
  };

  const startCandidates = projectionCandidates(from.coordinate, from.routeableSegment?.id);
  const endCandidates = projectionCandidates(to.coordinate, to.routeableSegment?.id);
  if (startCandidates.length === 0 || endCandidates.length === 0) return null;

  const startNodeId = nodes.length;
  nodes.push({ coordinate: from.coordinate, segmentIndex: null, edges: [] });
  const endNodeId = nodes.length;
  nodes.push({ coordinate: to.coordinate, segmentIndex: null, edges: [] });

  startCandidates.forEach(({ segmentIndex, projection }) => {
    const segment = segments[segmentIndex];
    const endpointIndexes = [projection.segmentIndex, projection.segmentIndex + 1];
    endpointIndexes.forEach((endpointIndex) => {
      const endpointNodeId = segmentNodeIds[segmentIndex][endpointIndex];
      const endpoint = segment.coordinates[endpointIndex];
      if (endpointNodeId == null || !endpoint) return;
      const snapPenalty = projection.distanceMiles * 4;
      addTraceGraphEdge(
        nodes,
        startNodeId,
        endpointNodeId,
        [projection.coordinate, endpoint],
        segmentIndex,
        snapPenalty + distanceMiles(projection.coordinate, endpoint),
      );
    });
  });

  endCandidates.forEach(({ segmentIndex, projection }) => {
    const segment = segments[segmentIndex];
    const endpointIndexes = [projection.segmentIndex, projection.segmentIndex + 1];
    endpointIndexes.forEach((endpointIndex) => {
      const endpointNodeId = segmentNodeIds[segmentIndex][endpointIndex];
      const endpoint = segment.coordinates[endpointIndex];
      if (endpointNodeId == null || !endpoint) return;
      const snapPenalty = projection.distanceMiles * 4;
      addTraceGraphEdge(
        nodes,
        endpointNodeId,
        endNodeId,
        [endpoint, projection.coordinate],
        segmentIndex,
        snapPenalty + distanceMiles(endpoint, projection.coordinate),
      );
    });
  });

  const distances = Array(nodes.length).fill(Infinity) as number[];
  const previousNode = Array(nodes.length).fill(-1) as number[];
  const previousEdge = Array(nodes.length).fill(null) as Array<TraceGraphEdge | null>;
  const heap: Array<{ node: number; distance: number }> = [];
  distances[startNodeId] = 0;
  pushTraceHeap(heap, { node: startNodeId, distance: 0 });

  while (heap.length > 0) {
    const current = popTraceHeap(heap);
    if (!current) break;
    if (current.distance !== distances[current.node]) continue;
    if (current.node === endNodeId) break;
    for (const edge of nodes[current.node].edges) {
      const distance = current.distance + edge.weight;
      if (distance >= distances[edge.to]) continue;
      distances[edge.to] = distance;
      previousNode[edge.to] = current.node;
      previousEdge[edge.to] = edge;
      pushTraceHeap(heap, { node: edge.to, distance });
    }
  }

  if (!Number.isFinite(distances[endNodeId])) return null;
  const pathEdges: TraceGraphEdge[] = [];
  let nodeId = endNodeId;
  while (nodeId !== startNodeId) {
    const edge = previousEdge[nodeId];
    const previous = previousNode[nodeId];
    if (!edge || previous < 0) return null;
    pathEdges.push(edge);
    nodeId = previous;
  }
  pathEdges.reverse();

  const coordinates = dedupeLine(pathEdges.flatMap((edge) => edge.coordinates));
  if (coordinates.length < 2) return null;
  const usedSegmentIndexes = new Set<number>();
  pathEdges.forEach((edge) => {
    if (edge.segmentIndex != null) usedSegmentIndexes.add(edge.segmentIndex);
  });
  const usedSegments = [...usedSegmentIndexes].map((index) => segments[index]).filter(Boolean);
  return usedSegments.length > 0 ? { coordinates, segments: usedSegments } : null;
}

function traceLeg(
  from: NavigateRouteAnchor,
  to: NavigateRouteAnchor,
  segments: NavigateRouteTraceableSegment[],
): NavigateRouteLeg {
  const normalizedSegments = normalizeTraceableSegments(segments);
  let best:
    | {
        segment: NavigateRouteTraceableSegment;
        snappedLine: NavigateRouteCoordinate[];
        score: number;
      }
    | null = null;
  let collapsedProjectionFound = false;

  for (const segment of normalizedSegments) {
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
    const snappedLine = extractProjectedLine(line, start, end);
    if (!hasDrawableLegCoordinates(snappedLine)) {
      collapsedProjectionFound = true;
      continue;
    }
    const score = start.distanceMiles + end.distanceMiles;
    if (!best || score < best.score) {
      best = { segment, snappedLine, score };
    }
  }

  let directLeg: NavigateRouteLeg | null = null;
  if (best) {
    const provider = cleanTraceProvider(best.segment.provider);
    const sourceLabel =
      best.segment.sourceLabel ??
      best.segment.name ??
      (provider === 'rendered_features' ? 'Visible routeable geometry' : null);

    directLeg = {
      id: `leg-${from.label}-${to.label}`,
      fromAnchorId: from.id,
      toAnchorId: to.id,
      coordinates: best.snappedLine,
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

  const anchorsReferenceDifferentSegments =
    !!from.routeableSegment?.id &&
    !!to.routeableSegment?.id &&
    from.routeableSegment.id !== to.routeableSegment.id;
  if (directLeg && !anchorsReferenceDifferentSegments) return directLeg;

  const connectedPath = traceConnectedNetwork(from, to, normalizedSegments);
  if (connectedPath && hasDrawableLegCoordinates(connectedPath.coordinates)) {
    const providers = connectedPath.segments.map((segment) => cleanTraceProvider(segment.provider));
    const provider = providers.includes('rendered_features')
      ? 'rendered_features'
      : providers.includes('mapbox_map_matching')
        ? 'mapbox_map_matching'
        : 'ecs_route_geometry';
    const sourceLabels = Array.from(
      new Set(
        connectedPath.segments
          .map((segment) => segment.sourceLabel ?? segment.name ?? null)
          .filter((label): label is string => !!label),
      ),
    );
    const dataStates = Array.from(
      new Set(connectedPath.segments.map((segment) => segment.dataState ?? null)),
    );
    const warnings = Array.from(
      new Set(connectedPath.segments.flatMap((segment) => segment.warnings ?? [])),
    );

    return {
      id: `leg-${from.label}-${to.label}`,
      fromAnchorId: from.id,
      toAnchorId: to.id,
      coordinates: connectedPath.coordinates,
      provider,
      status: 'snapped',
      confidence: weakestTraceConfidence(connectedPath.segments),
      source: provider,
      sourceSegmentId:
        connectedPath.segments.length === 1 ? connectedPath.segments[0].id : null,
      sourceLabel:
        sourceLabels.length === 1
          ? sourceLabels[0]
          : provider === 'rendered_features'
            ? 'Connected visible road or trail geometry'
            : 'Connected ECS route geometry',
      dataState: dataStates.length === 1 ? dataStates[0] : 'mixed',
      warnings,
      unavailableReason: null,
    };
  }

  if (directLeg) return directLeg;

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
    unavailableReason: collapsedProjectionFound
      ? 'Point overlaps the previous route position. Drop it farther along the road or trail.'
      : 'Point not linked. Tap closer to loaded road or trail geometry.',
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

export function createNavigateRouteDraftHistory(
  present = createNavigateRouteDraft(),
): NavigateRouteDraftHistory {
  return { past: [], present, future: [] };
}

export function recordNavigateRouteDraft(
  history: NavigateRouteDraftHistory,
  next: NavigateRouteDraft,
): NavigateRouteDraftHistory {
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-100),
    present: next,
    future: [],
  };
}

export function undoNavigateRouteDraftHistory(
  history: NavigateRouteDraftHistory,
): NavigateRouteDraftHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future].slice(0, 100),
  };
}

export function redoNavigateRouteDraftHistory(
  history: NavigateRouteDraftHistory,
): NavigateRouteDraftHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present].slice(-100),
    present: next,
    future: history.future.slice(1),
  };
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
    label: nextOperatorAnchorLabel(draft.anchors),
    coordinate,
    role: 'operator_drop',
    routeableSegment,
  };
  const anchors = [...draft.anchors, anchor];
  const previous = draft.anchors[draft.anchors.length - 1] ?? null;
  if (!previous) return { draft: { anchors, legs: [...draft.legs] }, leg: null };
  if (!pointsRenderDistinct(previous.coordinate, coordinate)) {
    return { draft, leg: null };
  }
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

export function addActiveGuidanceExtensionAnchor(
  draft: NavigateRouteDraft,
  input: AddActiveGuidanceExtensionAnchorInput,
): { draft: NavigateRouteDraft; leg: NavigateRouteLeg | null; seededFromActiveGuidanceEnd: boolean } {
  const activeRouteEnd = normalizeCoordinate(input.activeRouteEnd);
  if (!activeRouteEnd || draft.anchors.length > 0) {
    const result = addAnchorToDraft(draft, input);
    return { ...result, seededFromActiveGuidanceEnd: false };
  }

  const routeableSegment = normalizeTraceableSegments([input.routeableSegment])[0] ?? null;
  const seededDraft: NavigateRouteDraft = {
    anchors: [
      {
        id: 'active-guidance-end',
        label: 'END',
        coordinate: activeRouteEnd,
        role: 'active_guidance_end',
        hidden: true,
        routeableSegment,
      },
    ],
    legs: [],
  };
  const result = addAnchorToDraft(seededDraft, input);
  return { ...result, seededFromActiveGuidanceEnd: true };
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

function buildSnappedRouteBuilderSegment(
  draft: NavigateRouteDraft,
  leg: NavigateRouteLeg,
): RouteBuilderSegmentFromDraft {
  const coordinates = leg.coordinates.map((point) => [point.longitude, point.latitude] as [number, number]);
  const sourceLabel =
    leg.sourceLabel ??
    (leg.provider === 'rendered_features' ? 'Visible routeable geometry' : 'ECS route geometry');
  const snapProvider = leg.provider === 'rendered_features' ? 'rendered_features' : 'ecs_route_geometry';
  const fromAnchor = draft.anchors.find((anchor) => anchor.id === leg.fromAnchorId) ?? null;
  const isActiveGuidanceExtension = fromAnchor?.role === 'active_guidance_end';
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
      kind: isActiveGuidanceExtension
        ? 'active_guidance_extension'
        : leg.provider === 'rendered_features'
          ? 'rendered_routeable_geometry'
          : 'ecs_route_geometry',
      sourceLabel: isActiveGuidanceExtension
        ? `Active guidance extension via ${sourceLabel}`
        : sourceLabel,
      confidence: 'planning_geometry',
      warnings: isActiveGuidanceExtension
        ? [
            'Operator-added extension beyond the original active guidance. Verify access, closures, and posted rules.',
          ]
        : undefined,
    },
    geometryRole: 'snapped_draft',
    provisional: false,
  };
}

export function buildRouteBuilderSegmentsFromDraft(
  draft: NavigateRouteDraft,
): RouteBuilderSegmentFromDraft[] {
  return draft.legs
    .filter((leg) => leg.status === 'snapped' && hasDrawableLegCoordinates(leg.coordinates))
    .map((leg) => buildSnappedRouteBuilderSegment(draft, leg));
}

export function buildRouteBuilderPresentationSegmentsFromDraft(
  draft: NavigateRouteDraft,
): RouteBuilderSegmentFromDraft[] {
  return draft.legs.flatMap((leg) => {
    const coordinates = leg.coordinates
      .map(normalizeCoordinate)
      .filter((point): point is NavigateRouteCoordinate => !!point)
      .map((point) => [point.longitude, point.latitude] as [number, number]);
    if (coordinates.length < 2 || !hasDrawableLegCoordinates(leg.coordinates)) return [];
    if (leg.status === 'snapped') return [buildSnappedRouteBuilderSegment(draft, leg)];

    return [{
      id: `route-builder-${leg.id}`,
      coordinates,
      rawSegment: coordinates,
      snappedSegment: [],
      snapConfidence: null,
      snapSource: 'operator_draft',
      snapStatus: 'blocked',
      snapProvider: null,
      snapProfile: null,
      snapMessage:
        leg.unavailableReason ??
        'Unsnapped operator draft. Link this leg to loaded routeable geometry before saving or starting guidance.',
      sourceSegmentId: null,
      buildSource: {
        kind: 'operator_draft',
        sourceLabel: 'Operator draft — unverified',
        confidence: 'unknown',
        warnings: [
          'Unsnapped operator draft. This line is not verified, routable, legal, or guidance-ready.',
        ],
      },
      geometryRole: 'raw_user_draft',
      provisional: true,
    }];
  });
}

export function isNavigateRouteDraftFullyLinked(draft: NavigateRouteDraft): boolean {
  if (draft.anchors.length < 2) return false;
  if (draft.legs.length !== draft.anchors.length - 1) return false;
  return draft.legs.every(
    (leg) => leg.status === 'snapped' && hasDrawableLegCoordinates(leg.coordinates),
  );
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
