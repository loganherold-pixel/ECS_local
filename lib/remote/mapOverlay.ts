export type RemoteOverlayLabel = 'A' | 'B' | 'C' | 'D';

export type RemoteForecastSignal = 'good' | 'weak' | 'dead';

export type RemoteRoutePoint = {
  lat: number;
  lng: number;
};

export type RemoteSegmentFeatureInput = {
  coordinates?: [number, number][];
  remoteness_level?: string | null;
  risk_level?: string | null;
  risk_score?: number | null;
};

export type RemoteHeatmapArea = {
  id: string;
  label: RemoteOverlayLabel;
  coordinates: [number, number][];
};

export type RemoteForecastSegment = {
  id: string;
  signal: RemoteForecastSignal;
  coordinates: [number, number][];
  color: string;
};

export type RemoteMapOverlayPayload = {
  enabled: boolean;
  heatmapAreas: RemoteHeatmapArea[];
  forecastSegments: RemoteForecastSegment[];
};

export type BuildRemoteMapOverlayInput = {
  enabled: boolean;
  routePoints?: RemoteRoutePoint[];
  progressPoints?: RemoteRoutePoint[];
  segmentFeatures?: RemoteSegmentFeatureInput[] | null;
  remotenessScore?: number | null;
};

const MAX_HEATMAP_AREAS = 48;
const MAX_FORECAST_SEGMENTS = 12;
const BUFFER_DEGREES = 0.00125;

const FORECAST_COLORS: Record<RemoteForecastSignal, string> = {
  good: '#66BB6A',
  weak: '#F2C24D',
  dead: '#C66A4A',
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function remoteLabelForScore(score: number): RemoteOverlayLabel {
  const clamped = clamp(Math.round(score), 0, 100);
  if (clamped >= 76) return 'A';
  if (clamped >= 51) return 'B';
  if (clamped >= 26) return 'C';
  return 'D';
}

export function forecastSignalForLabel(label: RemoteOverlayLabel): RemoteForecastSignal {
  if (label === 'A') return 'dead';
  if (label === 'B') return 'weak';
  return 'good';
}

function labelForSegmentFeature(segment: RemoteSegmentFeatureInput, fallbackScore: number): RemoteOverlayLabel {
  const level = String(segment.remoteness_level ?? segment.risk_level ?? '').toLowerCase();
  if (level === 'red' || level === 'extreme' || level === 'wilderness') return 'A';
  if (level === 'yellow' || level === 'remote' || level === 'backcountry') return 'B';
  if (level === 'moderate' || level === 'rural') return 'C';
  if (level === 'green' || level === 'low' || level === 'urban' || level === 'suburban') return 'D';
  return remoteLabelForScore(isFiniteNumber(segment.risk_score) ? segment.risk_score : fallbackScore);
}

function normalizeRouteCoordinates(points?: RemoteRoutePoint[]): [number, number][] {
  return (points ?? [])
    .filter((point) => point && isFiniteNumber(point.lat) && isFiniteNumber(point.lng))
    .map((point) => [point.lng, point.lat]);
}

function normalizeLineCoordinates(coordinates: [number, number][]): [number, number][] {
  return (coordinates ?? [])
    .filter((coordinate): coordinate is [number, number] =>
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      isFiniteNumber(coordinate[0]) &&
      isFiniteNumber(coordinate[1]),
    )
    .map((coordinate) => [coordinate[0], coordinate[1]]);
}

function closedSegmentCorridor(coordinates: [number, number][]): [number, number][] {
  const line = normalizeLineCoordinates(coordinates);
  if (line.length < 2) return [];

  const segmentNormals = line.slice(0, -1).map((coord, index) => {
    const next = line[index + 1];
    const dx = next[0] - coord[0];
    const dy = next[1] - coord[1];
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return {
      x: (-dy / len) * BUFFER_DEGREES,
      y: (dx / len) * BUFFER_DEGREES,
    };
  });

  const left: [number, number][] = [];
  const right: [number, number][] = [];

  line.forEach((coord, index) => {
    const previous = segmentNormals[Math.max(0, index - 1)];
    const next = segmentNormals[Math.min(segmentNormals.length - 1, index)];
    let offsetX = ((previous?.x ?? 0) + (next?.x ?? 0)) / 2;
    let offsetY = ((previous?.y ?? 0) + (next?.y ?? 0)) / 2;
    const offsetLen = Math.sqrt(offsetX * offsetX + offsetY * offsetY);

    if (offsetLen > 0) {
      const limitedOffset = Math.min(BUFFER_DEGREES * 1.8, Math.max(BUFFER_DEGREES, offsetLen));
      offsetX = (offsetX / offsetLen) * limitedOffset;
      offsetY = (offsetY / offsetLen) * limitedOffset;
    }

    left.push([coord[0] + offsetX, coord[1] + offsetY]);
    right.push([coord[0] - offsetX, coord[1] - offsetY]);
  });

  const polygon = [...left, ...right.reverse()];
  polygon.push(polygon[0]);
  return polygon;
}

function chunkCoordinates(coordinates: [number, number][], maxChunks: number): [number, number][][] {
  if (coordinates.length < 2) return [];
  const segmentCount = coordinates.length - 1;
  const chunkSize = Math.max(1, Math.ceil(segmentCount / maxChunks));
  const chunks: [number, number][][] = [];

  for (let start = 0; start < segmentCount && chunks.length < maxChunks; start += chunkSize) {
    const end = Math.min(coordinates.length - 1, start + chunkSize);
    const chunk = coordinates.slice(start, end + 1);
    if (chunk.length > 1) chunks.push(chunk);
  }

  return chunks;
}

function findForecastStartIndex(routeCoords: [number, number][], progressCoords: [number, number][]): number {
  if (routeCoords.length < 2 || progressCoords.length === 0) return 0;
  const lastProgress = progressCoords[progressCoords.length - 1];
  let bestIndex = 0;
  let bestDistance = Infinity;

  routeCoords.forEach((coord, index) => {
    const dx = coord[0] - lastProgress[0];
    const dy = coord[1] - lastProgress[1];
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  });

  return Math.min(routeCoords.length - 2, Math.max(0, bestIndex));
}

export function buildRemoteMapOverlay(input: BuildRemoteMapOverlayInput): RemoteMapOverlayPayload {
  if (!input.enabled) {
    return { enabled: false, heatmapAreas: [], forecastSegments: [] };
  }

  const fallbackScore = isFiniteNumber(input.remotenessScore) ? input.remotenessScore : 35;
  const routeCoords = normalizeRouteCoordinates(input.routePoints);
  const progressCoords = normalizeRouteCoordinates(input.progressPoints);
  const segmentFeatures = (input.segmentFeatures ?? [])
    .map((segment) => ({
      ...segment,
      coordinates: normalizeLineCoordinates(segment.coordinates ?? []),
    }))
    .filter((segment) => segment.coordinates.length > 1);

  const heatmapAreas: RemoteHeatmapArea[] = segmentFeatures.length > 0
    ? segmentFeatures.slice(0, MAX_HEATMAP_AREAS).map((segment, index) => ({
        id: `remote-segment-${index}`,
        label: labelForSegmentFeature(segment, fallbackScore),
        coordinates: closedSegmentCorridor(segment.coordinates ?? []),
      })).filter((area) => area.coordinates.length >= 4)
    : chunkCoordinates(routeCoords, Math.min(MAX_HEATMAP_AREAS, 18)).map((chunk, index) => {
        const routeProgress = index / Math.max(1, Math.min(MAX_HEATMAP_AREAS, 18) - 1);
        const label = remoteLabelForScore(fallbackScore + routeProgress * 18);
        return {
          id: `remote-route-${index}`,
          label,
          coordinates: closedSegmentCorridor(chunk),
        };
      }).filter((area) => area.coordinates.length >= 4);

  const forecastSegments =
    segmentFeatures.length > 0
      ? segmentFeatures.slice(0, MAX_HEATMAP_AREAS).map((segment, index) => {
          const label = labelForSegmentFeature(segment, fallbackScore);
          const signal = forecastSignalForLabel(label);
          return {
            id: `remote-forecast-segment-${index}`,
            signal,
            coordinates: segment.coordinates,
            color: FORECAST_COLORS[signal],
          };
        })
      : (() => {
          const forecastStart = findForecastStartIndex(routeCoords, progressCoords);
          const forecastRoute = routeCoords.slice(forecastStart);
          return chunkCoordinates(forecastRoute, MAX_FORECAST_SEGMENTS).map((chunk, index) => {
            const matchingArea = heatmapAreas[Math.min(heatmapAreas.length - 1, index)] ?? null;
            const label = matchingArea?.label ?? remoteLabelForScore(fallbackScore);
            const signal = forecastSignalForLabel(label);
            return {
              id: `remote-forecast-${index}`,
              signal,
              coordinates: chunk,
              color: FORECAST_COLORS[signal],
            };
          });
        })();

  return {
    enabled: true,
    heatmapAreas,
    forecastSegments,
  };
}
