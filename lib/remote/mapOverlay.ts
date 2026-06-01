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
const BUFFER_DEGREES = 0.00055;

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

function closedSegmentCorridor(coordinates: [number, number][]): [number, number][] {
  if (coordinates.length < 2) return [];
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const dx = last[0] - first[0];
  const dy = last[1] - first[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const offX = (-dy / len) * BUFFER_DEGREES;
  const offY = (dx / len) * BUFFER_DEGREES;
  return [
    [first[0] + offX, first[1] + offY],
    [last[0] + offX, last[1] + offY],
    [last[0] - offX, last[1] - offY],
    [first[0] - offX, first[1] - offY],
    [first[0] + offX, first[1] + offY],
  ];
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
  const segmentFeatures = (input.segmentFeatures ?? []).filter(
    (segment) => (segment.coordinates ?? []).length > 1,
  );

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

  const forecastStart = findForecastStartIndex(routeCoords, progressCoords);
  const forecastRoute = routeCoords.slice(forecastStart);
  const forecastSegments = chunkCoordinates(forecastRoute, MAX_FORECAST_SEGMENTS).map((chunk, index) => {
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

  return {
    enabled: true,
    heatmapAreas,
    forecastSegments,
  };
}
