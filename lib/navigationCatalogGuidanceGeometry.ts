import type { RoadNavCoordinate } from './mapboxRoadNavigation';

export type NavigationGuidanceGeometryStatus = 'ready' | 'preview_only' | 'unavailable';

export type NavigationGuidanceGeometryResult = {
  status: NavigationGuidanceGeometryStatus;
  points: RoadNavCoordinate[];
  segments: RoadNavCoordinate[][];
  sourceGeometryType: string | null;
  sourceSegmentCount: number;
  joinedSegmentGapCount: number;
  disjointSegmentGapCount: number;
  maxSegmentGapMeters: number | null;
  topologyResolved: boolean;
  unavailableReason: string | null;
};

export const CATALOG_GUIDANCE_JOIN_GAP_MAX_METERS = 120;
const CATALOG_GUIDANCE_REVISIT_MAX_METERS = 35;
const CATALOG_GUIDANCE_MIN_REVISIT_PATH_METERS = 120;

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstOptionalFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (value == null || (typeof value === 'string' && value.trim().length === 0)) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function appendCoordinateElevation(
  coordinate: { lat: number; lng: number },
  source: Record<string, unknown> | unknown[],
): RoadNavCoordinate {
  const elevationMeters = Array.isArray(source)
    ? firstOptionalFiniteNumber(source[2])
    : firstOptionalFiniteNumber(
        source.ele,
        source.ele_m,
        source.elevationM,
        source.elevation_m,
        source.altitudeM,
        source.altitude_m,
      );
  const elevationFeet = Array.isArray(source)
    ? null
    : firstOptionalFiniteNumber(
        source.elevationFeet,
        source.elevation_ft,
        source.altitudeFeet,
        source.altitude_ft,
      );

  return {
    ...coordinate,
    ...(elevationMeters != null ? { ele: elevationMeters, ele_m: elevationMeters } : {}),
    ...(elevationFeet != null ? { elevationFeet } : {}),
  };
}

function mergeCoordinateElevation(
  coordinate: RoadNavCoordinate,
  supplemental: RoadNavCoordinate,
): RoadNavCoordinate {
  const elevationMeters = firstOptionalFiniteNumber(
    coordinate.ele,
    coordinate.ele_m,
    supplemental.ele,
    supplemental.ele_m,
  );
  const elevationFeet = firstOptionalFiniteNumber(
    coordinate.elevationFeet,
    supplemental.elevationFeet,
  );
  return {
    ...coordinate,
    ...(elevationMeters != null ? { ele: elevationMeters, ele_m: elevationMeters } : {}),
    ...(elevationFeet != null ? { elevationFeet } : {}),
  };
}

function normalizeCoordinate(value: unknown): RoadNavCoordinate | null {
  if (Array.isArray(value) && value.length >= 2) {
    const lng = finiteNumber(value[0]);
    const lat = finiteNumber(value[1]);
    if (lat == null || lng == null) return null;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
    return appendCoordinateElevation({ lat, lng }, value);
  }

  const record = readRecord(value);
  if (!record) return null;

  const lat = finiteNumber(record.lat ?? record.latitude ?? record.y);
  const lng = finiteNumber(record.lng ?? record.lon ?? record.longitude ?? record.x);
  if (lat == null || lng == null) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;

  return appendCoordinateElevation({ lat, lng }, record);
}

function dedupeConsecutive(points: RoadNavCoordinate[]): RoadNavCoordinate[] {
  const deduped: RoadNavCoordinate[] = [];
  points.forEach((point) => {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.lat === point.lat && previous.lng === point.lng) {
      deduped[deduped.length - 1] = mergeCoordinateElevation(previous, point);
      return;
    }
    deduped.push(point);
  });
  return deduped;
}

function normalizeCoordinateLine(value: unknown): RoadNavCoordinate[] {
  if (!Array.isArray(value)) return [];
  const points = value
    .map((entry) => normalizeCoordinate(entry))
    .filter((point): point is RoadNavCoordinate => !!point);
  return dedupeConsecutive(points);
}

function extractLineSegments(
  value: unknown,
  depth = 0,
): { lines: RoadNavCoordinate[][]; sourceGeometryType: string | null } {
  if (depth > 8 || value == null) {
    return { lines: [], sourceGeometryType: null };
  }

  if (Array.isArray(value)) {
    const line = normalizeCoordinateLine(value);
    if (line.length >= 2) {
      return { lines: [line], sourceGeometryType: null };
    }

    const nestedLines = value.flatMap((entry) => extractLineSegments(entry, depth + 1).lines);
    return { lines: nestedLines, sourceGeometryType: nestedLines.length > 1 ? 'MultiLineString' : null };
  }

  const record = readRecord(value);
  if (!record) return { lines: [], sourceGeometryType: null };

  const geometryType = typeof record.type === 'string' ? record.type : null;
  if (geometryType === 'Feature') {
    const extracted = extractLineSegments(record.geometry, depth + 1);
    return {
      ...extracted,
      sourceGeometryType: extracted.sourceGeometryType ?? 'Feature',
    };
  }

  if (geometryType === 'FeatureCollection' && Array.isArray(record.features)) {
    const lines = record.features.flatMap((feature) => extractLineSegments(feature, depth + 1).lines);
    return { lines, sourceGeometryType: 'FeatureCollection' };
  }

  if (geometryType === 'LineString') {
    return {
      lines: normalizeCoordinateLine(record.coordinates).length >= 2
        ? [normalizeCoordinateLine(record.coordinates)]
        : [],
      sourceGeometryType: 'LineString',
    };
  }

  if (geometryType === 'MultiLineString' && Array.isArray(record.coordinates)) {
    const lines = record.coordinates
      .map((line) => normalizeCoordinateLine(line))
      .filter((line) => line.length >= 2);
    return { lines, sourceGeometryType: 'MultiLineString' };
  }

  if (geometryType === 'GeometryCollection' && Array.isArray(record.geometries)) {
    const lines = record.geometries.flatMap((geometry) => extractLineSegments(geometry, depth + 1).lines);
    return { lines, sourceGeometryType: 'GeometryCollection' };
  }

  if (Array.isArray(record.segments)) {
    const lines = record.segments.flatMap((segment) => extractLineSegments(segment, depth + 1).lines);
    return { lines, sourceGeometryType: lines.length > 1 ? 'segments' : null };
  }

  const candidates = [
    record.geometry,
    record.coordinates,
    record.routeGeometry,
    record.route_geometry,
    record.trailGeometry,
    record.trail_geometry,
    record.geojson,
    record.polyline,
    record.points,
    record.path,
  ];

  for (const candidate of candidates) {
    const extracted = extractLineSegments(candidate, depth + 1);
    if (extracted.lines.length > 0) return extracted;
  }

  return { lines: [], sourceGeometryType: null };
}

function distanceMeters(a: RoadNavCoordinate, b: RoadNavCoordinate): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function cumulativeLineDistances(points: RoadNavCoordinate[]): number[] {
  const distances = [0];
  for (let index = 1; index < points.length; index += 1) {
    distances[index] = distances[index - 1] + distanceMeters(points[index - 1], points[index]);
  }
  return distances;
}

function findLineRevisitIssue(
  points: RoadNavCoordinate[],
  options: { allowLoop?: boolean; revisitMaxMeters?: number; minRevisitPathMeters?: number },
): string | null {
  if (points.length < 3) return null;

  const revisitMaxMeters = Math.max(0, options.revisitMaxMeters ?? CATALOG_GUIDANCE_REVISIT_MAX_METERS);
  const minRevisitPathMeters = Math.max(
    0,
    options.minRevisitPathMeters ?? CATALOG_GUIDANCE_MIN_REVISIT_PATH_METERS,
  );
  const cumulativeDistances = cumulativeLineDistances(points);
  const lastIndex = points.length - 1;

  for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 2; rightIndex < points.length; rightIndex += 1) {
      const isAllowedClosingLoop =
        options.allowLoop === true &&
        leftIndex === 0 &&
        rightIndex === lastIndex &&
        distanceMeters(points[leftIndex], points[rightIndex]) <= revisitMaxMeters;
      if (isAllowedClosingLoop) continue;

      const revisitDistanceMeters = distanceMeters(points[leftIndex], points[rightIndex]);
      if (revisitDistanceMeters > revisitMaxMeters) continue;

      const pathBetweenMeters = cumulativeDistances[rightIndex] - cumulativeDistances[leftIndex];
      if (pathBetweenMeters < minRevisitPathMeters) continue;

      const closingDescription = leftIndex === 0 && rightIndex === lastIndex
        ? 'closes back onto its start'
        : 'revisits the same corridor or junction';
      return `Active guidance is blocked because this route line ${closingDescription}. ECS requires one curated point-to-point route spine, or an explicit loop route label when the source is intentionally a loop.`;
    }
  }

  return null;
}

function joinConnectedSegments(
  segments: RoadNavCoordinate[][],
  joinGapMaxMeters: number,
  preferredStart: RoadNavCoordinate | null,
): Pick<
  NavigationGuidanceGeometryResult,
  | 'points'
  | 'joinedSegmentGapCount'
  | 'disjointSegmentGapCount'
  | 'maxSegmentGapMeters'
  | 'topologyResolved'
> {
  type Candidate = {
    segmentIndex: number;
    reversed: boolean;
    startDistanceM: number;
    endpointRank: number;
  };
  type Match = {
    segmentIndex: number;
    reversed: boolean;
    gapMeters: number;
    line: RoadNavCoordinate[];
  };

  const endpoints = segments.flatMap((segment, segmentIndex) => [
    { segmentIndex, point: segment[0] },
    { segmentIndex, point: segment[segment.length - 1] },
  ]);
  const connectionCounts = endpoints.map((endpoint) =>
    endpoints.filter((candidate) =>
      candidate.segmentIndex !== endpoint.segmentIndex &&
      distanceMeters(endpoint.point, candidate.point) <= joinGapMaxMeters,
    ).length,
  );
  const hasBranch = connectionCounts.some((count) => count > 1);
  const looseEndpointCount = connectionCounts.filter((count) => count === 0).length;
  const looksLikeSingleChainOrLoop = looseEndpointCount === 0 || looseEndpointCount === 2;

  if (hasBranch || !looksLikeSingleChainOrLoop) {
    return {
      points: [],
      joinedSegmentGapCount: 0,
      disjointSegmentGapCount: Math.max(1, looseEndpointCount - 2),
      maxSegmentGapMeters: null,
      topologyResolved: false,
    };
  }

  const orientLine = (segmentIndex: number, reversed: boolean) => {
    const line = segments[segmentIndex];
    return reversed ? [...line].reverse() : [...line];
  };
  const endpointConnectionCount = (segmentIndex: number, reversed: boolean) => {
    const point = reversed ? segments[segmentIndex][segments[segmentIndex].length - 1] : segments[segmentIndex][0];
    const endpointIndex = endpoints.findIndex(
      (endpoint) => endpoint.segmentIndex === segmentIndex && endpoint.point === point,
    );
    return endpointIndex >= 0 ? connectionCounts[endpointIndex] : 0;
  };
  const startCandidates: Candidate[] = segments.flatMap((_, segmentIndex) => [false, true].map((reversed) => {
    const start = reversed ? segments[segmentIndex][segments[segmentIndex].length - 1] : segments[segmentIndex][0];
    return {
      segmentIndex,
      reversed,
      startDistanceM: preferredStart ? distanceMeters(preferredStart, start) : 0,
      endpointRank: preferredStart ? 0 : endpointConnectionCount(segmentIndex, reversed),
    };
  }));

  startCandidates.sort((left, right) => {
    if (preferredStart && left.startDistanceM !== right.startDistanceM) {
      return left.startDistanceM - right.startDistanceM;
    }
    if (left.endpointRank !== right.endpointRank) return left.endpointRank - right.endpointRank;
    if (left.segmentIndex !== right.segmentIndex) return left.segmentIndex - right.segmentIndex;
    return Number(left.reversed) - Number(right.reversed);
  });

  let bestDisconnectedGapMeters: number | null = null;

  for (const candidate of startCandidates) {
    const remaining = new Set(segments.map((_, index) => index));
    remaining.delete(candidate.segmentIndex);
    const points = orientLine(candidate.segmentIndex, candidate.reversed);
    let joinedSegmentGapCount = 0;
    let maxSegmentGapMeters: number | null = null;
    let ambiguous = false;
    let disconnected = false;

    while (remaining.size > 0) {
      const previous = points[points.length - 1];
      const matches: Match[] = [];
      remaining.forEach((segmentIndex) => {
        const line = segments[segmentIndex];
        const forwardGap = distanceMeters(previous, line[0]);
        const reverseGap = distanceMeters(previous, line[line.length - 1]);
        if (forwardGap <= joinGapMaxMeters) {
          matches.push({ segmentIndex, reversed: false, gapMeters: forwardGap, line: orientLine(segmentIndex, false) });
        }
        if (reverseGap <= joinGapMaxMeters) {
          matches.push({ segmentIndex, reversed: true, gapMeters: reverseGap, line: orientLine(segmentIndex, true) });
        }
        bestDisconnectedGapMeters = Math.min(
          bestDisconnectedGapMeters ?? Number.POSITIVE_INFINITY,
          forwardGap,
          reverseGap,
        );
      });

      if (matches.length === 0) {
        disconnected = true;
        break;
      }
      if (matches.length > 1) {
        ambiguous = true;
        break;
      }

      const match = matches[0];
      remaining.delete(match.segmentIndex);
      maxSegmentGapMeters = Math.max(maxSegmentGapMeters ?? 0, match.gapMeters);
      if (match.gapMeters > 1) joinedSegmentGapCount += 1;
      if (match.gapMeters <= 1) {
        points[points.length - 1] = mergeCoordinateElevation(points[points.length - 1], match.line[0]);
        points.push(...match.line.slice(1));
      } else {
        points.push(...match.line);
      }
    }

    if (!ambiguous && !disconnected && remaining.size === 0) {
      return {
        points: dedupeConsecutive(points),
        joinedSegmentGapCount,
        disjointSegmentGapCount: 0,
        maxSegmentGapMeters,
        topologyResolved: segments.length > 1,
      };
    }
  }

  let joinedSegmentGapCount = 0;
  let disjointSegmentGapCount = 0;
  let maxSegmentGapMeters: number | null = null;
  const points = [...segments[0]];

  for (let index = 1; index < segments.length; index += 1) {
    const previous = points[points.length - 1];
    const nextLine = segments[index];
    const next = nextLine[0];
    const gapMeters = distanceMeters(previous, next);
    maxSegmentGapMeters = Math.max(maxSegmentGapMeters ?? 0, gapMeters);

    if (gapMeters > joinGapMaxMeters) {
      disjointSegmentGapCount += 1;
      continue;
    }

    if (gapMeters > 1) joinedSegmentGapCount += 1;
    if (gapMeters <= 1) {
      points[points.length - 1] = mergeCoordinateElevation(points[points.length - 1], nextLine[0]);
      points.push(...nextLine.slice(1));
    } else {
      points.push(...nextLine);
    }
  }

  return {
    points: disjointSegmentGapCount > 0 ? [] : dedupeConsecutive(points),
    joinedSegmentGapCount,
    disjointSegmentGapCount,
    maxSegmentGapMeters: maxSegmentGapMeters ?? (
      Number.isFinite(bestDisconnectedGapMeters) ? bestDisconnectedGapMeters : null
    ),
    topologyResolved: false,
  };
}

export function normalizeNavigationGuidanceGeometry(
  value: unknown,
  options: {
    joinGapMaxMeters?: number;
    preferredStart?: RoadNavCoordinate | null;
    allowLoop?: boolean;
    revisitMaxMeters?: number;
    minRevisitPathMeters?: number;
  } = {},
): NavigationGuidanceGeometryResult {
  const joinGapMaxMeters = Math.max(0, options.joinGapMaxMeters ?? CATALOG_GUIDANCE_JOIN_GAP_MAX_METERS);
  const preferredStart = options.preferredStart ?? null;
  const extracted = extractLineSegments(value);
  const segments = extracted.lines
    .map(dedupeConsecutive)
    .filter((line) => line.length >= 2);
  const sourceSegmentCount = segments.length;
  const sourceGeometryType =
    extracted.sourceGeometryType ?? (sourceSegmentCount > 1 ? 'MultiLineString' : sourceSegmentCount === 1 ? 'LineString' : null);

  if (sourceSegmentCount === 0) {
    return {
      status: 'unavailable',
      points: [],
      segments: [],
      sourceGeometryType,
      sourceSegmentCount,
      joinedSegmentGapCount: 0,
      disjointSegmentGapCount: 0,
      maxSegmentGapMeters: null,
      topologyResolved: false,
      unavailableReason: 'Route geometry is unavailable for active guidance.',
    };
  }

  if (sourceSegmentCount === 1) {
    const revisitIssue = findLineRevisitIssue(segments[0], {
      allowLoop: options.allowLoop === true,
      revisitMaxMeters: options.revisitMaxMeters,
      minRevisitPathMeters: options.minRevisitPathMeters,
    });
    if (revisitIssue) {
      return {
        status: 'preview_only',
        points: [],
        segments,
        sourceGeometryType,
        sourceSegmentCount,
        joinedSegmentGapCount: 0,
        disjointSegmentGapCount: 0,
        maxSegmentGapMeters: 0,
        topologyResolved: false,
        unavailableReason: revisitIssue,
      };
    }

    return {
      status: 'ready',
      points: segments[0],
      segments,
      sourceGeometryType,
      sourceSegmentCount,
      joinedSegmentGapCount: 0,
      disjointSegmentGapCount: 0,
      maxSegmentGapMeters: 0,
      topologyResolved: false,
      unavailableReason: null,
    };
  }

  const joined = joinConnectedSegments(segments, joinGapMaxMeters, preferredStart);
  if (joined.disjointSegmentGapCount > 0) {
    return {
      status: 'preview_only',
      points: [],
      segments,
      sourceGeometryType,
      sourceSegmentCount,
      joinedSegmentGapCount: joined.joinedSegmentGapCount,
      disjointSegmentGapCount: joined.disjointSegmentGapCount,
      maxSegmentGapMeters: joined.maxSegmentGapMeters,
      topologyResolved: joined.topologyResolved,
      unavailableReason:
        'Active guidance is blocked because this catalog route has disconnected official source segments. Preview and offline caching can use the source-backed segments, but ECS will not invent a connector.',
    };
  }

  return {
    status: 'ready',
    points: joined.points,
    segments,
    sourceGeometryType,
    sourceSegmentCount,
    joinedSegmentGapCount: joined.joinedSegmentGapCount,
    disjointSegmentGapCount: 0,
    maxSegmentGapMeters: joined.maxSegmentGapMeters,
    topologyResolved: joined.topologyResolved,
    unavailableReason: null,
  };
}
