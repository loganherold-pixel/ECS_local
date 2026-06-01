export type TerrainElevationRiskLevel = 'low' | 'moderate' | 'high';
export type TerrainThermalRiskBand = 'cold' | 'warm' | 'hot';
export type TerrainElevationDataState = 'elevation-backed' | 'gps-altitude-estimate';
export type TerrainSegmentHazardKind =
  | 'steep_grade'
  | 'rapid_elevation_change'
  | 'high_elevation'
  | 'tipover_watch'
  | 'washout_watch';

export type TerrainElevationRoutePoint = {
  lat?: number | null;
  lon?: number | null;
  lng?: number | null;
  ele?: number | null;
  ele_m?: number | null;
  elevationFeet?: number | null;
};

export type TerrainElevationRouteSegmentInput = {
  points?: TerrainElevationRoutePoint[] | null;
};

export type TerrainElevationSample = {
  lat: number;
  lon: number;
  distanceMiles: number;
  elevationFeet: number;
  source: TerrainElevationDataState;
};

export type TerrainElevationSegment = {
  id: string;
  startDistanceMiles: number;
  endDistanceMiles: number;
  distanceMiles: number;
  startElevationFeet: number;
  endElevationFeet: number;
  elevationGainFeet: number;
  elevationLossFeet: number;
  gradePercent: number;
  riskScore: number;
  riskLevel: TerrainElevationRiskLevel;
  thermalBand: TerrainThermalRiskBand;
  hazardKinds: TerrainSegmentHazardKind[];
  label: string;
};

export type TerrainElevationRouteAnalysis = {
  dataState: TerrainElevationDataState;
  sourceLabel: string;
  totalDistanceMiles: number;
  samples: TerrainElevationSample[];
  segments: TerrainElevationSegment[];
  maxGradePercent: number;
  averageGradePercent: number;
  elevationGainFeet: number;
  elevationLossFeet: number;
  minElevationFeet: number;
  maxElevationFeet: number;
  hotSpotCount: number;
  warmSpotCount: number;
};

const EARTH_RADIUS_MI = 3958.8;
const METERS_TO_FEET = 3.28084;

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeCoordinate(point: TerrainElevationRoutePoint): { lat: number; lon: number } | null {
  const lat = point.lat;
  const lon = point.lon ?? point.lng;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

export function normalizeTerrainElevationFeet(point: TerrainElevationRoutePoint): number | null {
  if (isFiniteNumber(point.elevationFeet)) return point.elevationFeet;
  if (isFiniteNumber(point.ele_m)) return point.ele_m * METERS_TO_FEET;
  if (isFiniteNumber(point.ele)) return point.ele * METERS_TO_FEET;
  return null;
}

export function haversineTerrainMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function flattenRoutePoints(
  segments: TerrainElevationRouteSegmentInput[] | null | undefined,
  routePoints: TerrainElevationRoutePoint[] | null | undefined,
): TerrainElevationRoutePoint[] {
  const segmentPoints = Array.isArray(segments)
    ? segments.flatMap((segment) => segment.points ?? [])
    : [];
  const sourcePoints = segmentPoints.length >= 2 ? segmentPoints : routePoints ?? [];
  const points: TerrainElevationRoutePoint[] = [];

  sourcePoints.forEach((point) => {
    const coordinate = normalizeCoordinate(point);
    if (!coordinate) return;
    const previous = points[points.length - 1];
    const previousCoordinate = previous ? normalizeCoordinate(previous) : null;
    if (
      previousCoordinate &&
      Math.abs(previousCoordinate.lat - coordinate.lat) < 0.000001 &&
      Math.abs(previousCoordinate.lon - coordinate.lon) < 0.000001
    ) {
      return;
    }
    points.push(point);
  });

  return points;
}

function buildSamplesFromElevationBackedPoints(
  points: TerrainElevationRoutePoint[],
  totalDistanceMiles?: number | null,
): TerrainElevationSample[] {
  const routePoints = points
    .map((point) => {
      const coordinate = normalizeCoordinate(point);
      const elevationFeet = normalizeTerrainElevationFeet(point);
      if (!coordinate || !isFiniteNumber(elevationFeet)) return null;
      return { ...coordinate, elevationFeet };
    })
    .filter((point): point is { lat: number; lon: number; elevationFeet: number } => !!point);

  if (routePoints.length < 2) return [];

  let cumulativeMiles = 0;
  const samples: TerrainElevationSample[] = [{
    lat: routePoints[0].lat,
    lon: routePoints[0].lon,
    distanceMiles: 0,
    elevationFeet: routePoints[0].elevationFeet,
    source: 'elevation-backed',
  }];

  for (let index = 1; index < routePoints.length; index += 1) {
    const previous = routePoints[index - 1];
    const point = routePoints[index];
    const legMiles = haversineTerrainMiles(previous.lat, previous.lon, point.lat, point.lon);
    cumulativeMiles += Number.isFinite(legMiles) && legMiles < 500 ? Math.max(0, legMiles) : 0;
    samples.push({
      lat: point.lat,
      lon: point.lon,
      distanceMiles: cumulativeMiles,
      elevationFeet: point.elevationFeet,
      source: 'elevation-backed',
    });
  }

  if (cumulativeMiles <= 0) return [];

  const routeDistanceMiles =
    isFiniteNumber(totalDistanceMiles) && totalDistanceMiles > 0
      ? totalDistanceMiles
      : cumulativeMiles;
  const scale = routeDistanceMiles / cumulativeMiles;
  return samples.map((sample, index) => ({
    ...sample,
    distanceMiles: index === samples.length - 1
      ? routeDistanceMiles
      : Number((sample.distanceMiles * scale).toFixed(3)),
  }));
}

function buildGpsAltitudeEstimateSamples(
  points: TerrainElevationRoutePoint[],
  currentElevationFeet: number | null | undefined,
  totalDistanceMiles?: number | null,
): TerrainElevationSample[] {
  if (!isFiniteNumber(currentElevationFeet)) return [];
  const coordinates = points
    .map(normalizeCoordinate)
    .filter((point): point is { lat: number; lon: number } => !!point);
  if (coordinates.length < 2) return [];

  let cumulativeMiles = 0;
  const samples: TerrainElevationSample[] = [{
    lat: coordinates[0].lat,
    lon: coordinates[0].lon,
    distanceMiles: 0,
    elevationFeet: Math.round(currentElevationFeet),
    source: 'gps-altitude-estimate',
  }];

  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const point = coordinates[index];
    const legMiles = haversineTerrainMiles(previous.lat, previous.lon, point.lat, point.lon);
    cumulativeMiles += Number.isFinite(legMiles) && legMiles < 500 ? Math.max(0, legMiles) : 0;
    samples.push({
      lat: point.lat,
      lon: point.lon,
      distanceMiles: cumulativeMiles,
      elevationFeet: Math.round(currentElevationFeet),
      source: 'gps-altitude-estimate',
    });
  }

  if (cumulativeMiles <= 0) return [];

  const routeDistanceMiles =
    isFiniteNumber(totalDistanceMiles) && totalDistanceMiles > 0
      ? totalDistanceMiles
      : cumulativeMiles;
  const scale = routeDistanceMiles / cumulativeMiles;
  return samples.map((sample, index) => ({
    ...sample,
    distanceMiles: index === samples.length - 1
      ? routeDistanceMiles
      : Number((sample.distanceMiles * scale).toFixed(3)),
  }));
}

function hasUsableElevationBackedSamples(samples: TerrainElevationSample[]): boolean {
  if (samples.length < 2) return false;
  const elevations = samples.map((sample) => sample.elevationFeet);
  const minElevationFeet = Math.min(...elevations);
  const maxElevationFeet = Math.max(...elevations);
  const hasNonZeroElevation = elevations.some((elevationFeet) => Math.abs(elevationFeet) >= 1);
  const hasElevationRelief = maxElevationFeet - minElevationFeet >= 3;
  return hasNonZeroElevation || hasElevationRelief;
}

export function classifyTerrainElevationRisk(score: number): TerrainElevationRiskLevel {
  const normalized = clampNumber(Math.round(score), 0, 100);
  if (normalized >= 67) return 'high';
  if (normalized >= 34) return 'moderate';
  return 'low';
}

export function thermalBandForTerrainRisk(level: TerrainElevationRiskLevel): TerrainThermalRiskBand {
  if (level === 'high') return 'hot';
  if (level === 'moderate') return 'warm';
  return 'cold';
}

function scoreTerrainSegment(args: {
  gradePercent: number;
  elevationDeltaFeet: number;
  distanceMiles: number;
  endElevationFeet: number;
  dataState: TerrainElevationDataState;
}): number {
  if (args.dataState === 'gps-altitude-estimate') return 18;
  const gradeScore = Math.min(56, Math.abs(args.gradePercent) * 4.5);
  const reliefPerMile = args.distanceMiles > 0 ? Math.abs(args.elevationDeltaFeet) / args.distanceMiles : 0;
  const reliefScore = Math.min(20, reliefPerMile / 60);
  const highElevationScore =
    args.endElevationFeet >= 10000
      ? 14
      : args.endElevationFeet >= 8500
        ? 9
        : args.endElevationFeet >= 7000
          ? 5
          : 0;
  return clampNumber(14 + gradeScore + reliefScore + highElevationScore, 0, 100);
}

function hazardKindsForSegment(args: {
  gradePercent: number;
  elevationDeltaFeet: number;
  distanceMiles: number;
  endElevationFeet: number;
  riskLevel: TerrainElevationRiskLevel;
  dataState: TerrainElevationDataState;
}): TerrainSegmentHazardKind[] {
  if (args.dataState === 'gps-altitude-estimate') return [];
  const kinds: TerrainSegmentHazardKind[] = [];
  const reliefPerMile = args.distanceMiles > 0 ? Math.abs(args.elevationDeltaFeet) / args.distanceMiles : 0;

  if (Math.abs(args.gradePercent) >= 8) kinds.push('steep_grade');
  if (reliefPerMile >= 450) kinds.push('rapid_elevation_change');
  if (args.endElevationFeet >= 8500) kinds.push('high_elevation');
  if (args.riskLevel === 'high' && Math.abs(args.gradePercent) >= 12) kinds.push('tipover_watch');
  if (args.elevationDeltaFeet < -180 && reliefPerMile >= 650) kinds.push('washout_watch');

  return kinds;
}

function labelForSegment(
  riskLevel: TerrainElevationRiskLevel,
  hazardKinds: TerrainSegmentHazardKind[],
  dataState: TerrainElevationDataState,
): string {
  if (dataState === 'gps-altitude-estimate') return 'Elevation pending';
  if (hazardKinds.includes('washout_watch')) return 'Washout watch';
  if (hazardKinds.includes('tipover_watch')) return 'Tipover watch';
  if (hazardKinds.includes('rapid_elevation_change')) return 'Rapid elevation change';
  if (hazardKinds.includes('steep_grade')) return 'Steep grade';
  if (riskLevel === 'moderate') return 'Moderate terrain change';
  return 'Controlled grade';
}

function buildSegments(samples: TerrainElevationSample[], dataState: TerrainElevationDataState): TerrainElevationSegment[] {
  return samples.slice(1).map((sample, index) => {
    const previous = samples[index];
    const distanceMiles = Math.max(0, sample.distanceMiles - previous.distanceMiles);
    const elevationDeltaFeet = sample.elevationFeet - previous.elevationFeet;
    const legFeet = Math.max(distanceMiles * 5280, 1);
    const gradePercent = dataState === 'gps-altitude-estimate'
      ? 0
      : (elevationDeltaFeet / legFeet) * 100;
    const riskScore = Math.round(scoreTerrainSegment({
      gradePercent,
      elevationDeltaFeet,
      distanceMiles,
      endElevationFeet: sample.elevationFeet,
      dataState,
    }));
    const riskLevel = classifyTerrainElevationRisk(riskScore);
    const hazardKinds = hazardKindsForSegment({
      gradePercent,
      elevationDeltaFeet,
      distanceMiles,
      endElevationFeet: sample.elevationFeet,
      riskLevel,
      dataState,
    });

    return {
      id: `terrain-segment-${index}-${Math.round(previous.distanceMiles * 100)}-${Math.round(sample.distanceMiles * 100)}`,
      startDistanceMiles: previous.distanceMiles,
      endDistanceMiles: sample.distanceMiles,
      distanceMiles,
      startElevationFeet: Math.round(previous.elevationFeet),
      endElevationFeet: Math.round(sample.elevationFeet),
      elevationGainFeet: Math.max(0, Math.round(elevationDeltaFeet)),
      elevationLossFeet: Math.max(0, Math.round(-elevationDeltaFeet)),
      gradePercent: Number(Math.abs(gradePercent).toFixed(1)),
      riskScore,
      riskLevel,
      thermalBand: thermalBandForTerrainRisk(riskLevel),
      hazardKinds,
      label: labelForSegment(riskLevel, hazardKinds, dataState),
    };
  });
}

export function analyzeTerrainElevationRoute(args: {
  routeSegments?: TerrainElevationRouteSegmentInput[] | null;
  routePoints?: TerrainElevationRoutePoint[] | null;
  totalDistanceMiles?: number | null;
  currentElevationFeet?: number | null;
  sourceLabel?: string | null;
}): TerrainElevationRouteAnalysis | null {
  const points = flattenRoutePoints(args.routeSegments, args.routePoints);
  if (points.length < 2) return null;

  const elevationSamples = buildSamplesFromElevationBackedPoints(points, args.totalDistanceMiles);
  const usableElevationSamples = hasUsableElevationBackedSamples(elevationSamples)
    ? elevationSamples
    : [];
  const dataState: TerrainElevationDataState =
    usableElevationSamples.length >= 2 ? 'elevation-backed' : 'gps-altitude-estimate';
  const samples = usableElevationSamples.length >= 2
    ? usableElevationSamples
    : buildGpsAltitudeEstimateSamples(points, args.currentElevationFeet, args.totalDistanceMiles);
  if (samples.length < 2) return null;

  const segments = buildSegments(samples, dataState);
  if (segments.length === 0) return null;

  const elevations = samples.map((sample) => sample.elevationFeet);
  const elevationGainFeet = segments.reduce((sum, segment) => sum + segment.elevationGainFeet, 0);
  const elevationLossFeet = segments.reduce((sum, segment) => sum + segment.elevationLossFeet, 0);
  const maxGradePercent = segments.reduce((max, segment) => Math.max(max, segment.gradePercent), 0);
  const averageGradePercent =
    segments.reduce((sum, segment) => sum + segment.gradePercent, 0) / Math.max(1, segments.length);

  return {
    dataState,
    sourceLabel: dataState === 'gps-altitude-estimate'
      ? 'Estimated from active guidance geometry + live GPS altitude'
      : args.sourceLabel?.trim() || 'Live route elevation profile',
    totalDistanceMiles: samples[samples.length - 1].distanceMiles,
    samples,
    segments,
    maxGradePercent: Number(maxGradePercent.toFixed(1)),
    averageGradePercent: Number(averageGradePercent.toFixed(1)),
    elevationGainFeet,
    elevationLossFeet,
    minElevationFeet: Math.round(Math.min(...elevations)),
    maxElevationFeet: Math.round(Math.max(...elevations)),
    hotSpotCount: segments.filter((segment) => segment.thermalBand === 'hot').length,
    warmSpotCount: segments.filter((segment) => segment.thermalBand === 'warm').length,
  };
}
