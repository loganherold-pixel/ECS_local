import {
  analyzeTerrainElevationRoute,
  type TerrainElevationRouteAnalysis,
  type TerrainElevationSegment,
  type TerrainSegmentHazardKind,
  type TerrainThermalRiskBand,
} from './terrainElevationRouteEngine';

export type DistanceUnit = 'mi' | 'km';

export type TerrainRiskLevel = 'low' | 'moderate' | 'high';

export type TerrainProfilePoint = {
  distanceMiles: number;
  elevationFeet: number;
  riskScore: number;
  riskLevel: TerrainRiskLevel;
  gradePercent?: number;
  thermalBand?: TerrainThermalRiskBand;
  hazardKinds?: TerrainSegmentHazardKind[];
};

export type TerrainRiskFactor = {
  key: string;
  label: string;
  value: string | number;
  status: TerrainRiskLevel | 'neutral';
  detail?: string;
};

export type TerrainHazard = {
  id: string;
  label: string;
  distanceMiles: number;
  riskLevel: TerrainRiskLevel;
  actionLabel?: string;
  segmentId?: string;
  hazardKinds?: TerrainSegmentHazardKind[];
};

export type TerrainRiskRoute = {
  id: string;
  name: string;
  totalDistanceMiles: number;
  overallRiskScore: number;
  overallRiskLabel: TerrainRiskLevel;
  profile: TerrainProfilePoint[];
  terrainSegments: TerrainElevationSegment[];
  elevationGainFeet: number;
  elevationLossFeet: number;
  maxGradePercent: number;
  hotSpotCount: number;
  warmSpotCount: number;
  factors: TerrainRiskFactor[];
  nextHazard: TerrainHazard;
  sourceLabel: string;
  dataState: 'live-route' | 'estimated-route';
};

export type TerrainRiskRoutePoint = {
  lat?: number | null;
  lon?: number | null;
  lng?: number | null;
  ele?: number | null;
  ele_m?: number | null;
  elevationFeet?: number | null;
};

export type TerrainRiskRouteSegment = {
  points?: TerrainRiskRoutePoint[] | null;
};

export type TerrainRiskRouteContext = {
  routeId?: string | null;
  routeName?: string | null;
  totalDistanceMiles?: number | null;
  completedDistanceMiles?: number | null;
  active?: boolean | null;
  sourceLabel?: string | null;
  routeSegments?: TerrainRiskRouteSegment[] | null;
  routePoints?: TerrainRiskRoutePoint[] | null;
  currentElevationFeet?: number | null;
};

export const MILES_TO_KILOMETERS = 1.609344;
const METERS_TO_FEET = 3.28084;
const EARTH_RADIUS_MI = 3958.8;
const MAX_PROFILE_POINTS = 42;

type RouteProfileDraftPoint = {
  distanceMiles: number;
  elevationFeet: number;
  gradePercent: number;
  riskScore?: number;
  thermalBand?: TerrainThermalRiskBand;
  hazardKinds?: TerrainSegmentHazardKind[];
};

function isFinitePositive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampRiskScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function classifyTerrainCommandRisk(score: number): TerrainRiskLevel {
  const normalized = clampRiskScore(score);
  if (normalized >= 67) return 'high';
  if (normalized >= 34) return 'moderate';
  return 'low';
}

export function formatTerrainRiskLabel(level: TerrainRiskLevel): string {
  switch (level) {
    case 'high':
      return 'High';
    case 'moderate':
      return 'Moderate';
    case 'low':
    default:
      return 'Low';
  }
}

export function milesToKilometers(miles: number): number {
  return miles * MILES_TO_KILOMETERS;
}

export function formatDistance(
  miles: number,
  unit: DistanceUnit,
  precision = 1,
): string {
  const safeMiles = Number.isFinite(miles) ? miles : 0;
  const value = unit === 'km' ? milesToKilometers(safeMiles) : safeMiles;
  return `${value.toFixed(precision)} ${unit}`;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function normalizeCoordinate(point: TerrainRiskRoutePoint): { lat: number; lon: number } | null {
  const lat = point.lat;
  const lon = point.lon ?? point.lng;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

function normalizeElevationFeet(point: TerrainRiskRoutePoint): number | null {
  if (isFiniteNumber(point.elevationFeet)) return point.elevationFeet;
  if (isFiniteNumber(point.ele_m)) return point.ele_m * METERS_TO_FEET;
  if (isFiniteNumber(point.ele)) return point.ele * METERS_TO_FEET;
  return null;
}

function flattenLiveRoutePoints(
  segments: TerrainRiskRouteSegment[] | null | undefined,
): Array<{ lat: number; lon: number; elevationFeet: number }> {
  if (!Array.isArray(segments)) return [];

  const points: Array<{ lat: number; lon: number; elevationFeet: number }> = [];
  segments.forEach((segment) => {
    (segment.points ?? []).forEach((point) => {
      const coordinate = normalizeCoordinate(point);
      const elevationFeet = normalizeElevationFeet(point);
      if (!coordinate || !isFiniteNumber(elevationFeet)) return;
      points.push({ ...coordinate, elevationFeet });
    });
  });

  return points;
}

function buildRouteProfileDraft(
  context: TerrainRiskRouteContext,
): RouteProfileDraftPoint[] {
  const livePointsFromSegments = flattenLiveRoutePoints(context.routeSegments);
  const livePoints = livePointsFromSegments.length >= 2
    ? livePointsFromSegments
    : flattenLiveRoutePoints([{ points: context.routePoints ?? [] }]);
  if (livePoints.length < 2) return [];

  const draft: RouteProfileDraftPoint[] = [];
  let cumulativeMiles = 0;
  draft.push({
    distanceMiles: 0,
    elevationFeet: livePoints[0].elevationFeet,
    gradePercent: 0,
  });

  for (let index = 1; index < livePoints.length; index += 1) {
    const previous = livePoints[index - 1];
    const point = livePoints[index];
    const legMiles = haversineMiles(previous.lat, previous.lon, point.lat, point.lon);
    const safeLegMiles = Number.isFinite(legMiles) && legMiles < 500 ? Math.max(0, legMiles) : 0;
    cumulativeMiles += safeLegMiles;
    const legFeet = Math.max(safeLegMiles * 5280, 1);
    const gradePercent = Math.abs(((point.elevationFeet - previous.elevationFeet) / legFeet) * 100);
    draft.push({
      distanceMiles: cumulativeMiles,
      elevationFeet: point.elevationFeet,
      gradePercent: Number.isFinite(gradePercent) ? gradePercent : 0,
    });
  }

  const routeDistanceMiles = isFinitePositive(context.totalDistanceMiles)
    ? context.totalDistanceMiles
    : cumulativeMiles;
  if (!isFinitePositive(routeDistanceMiles) || cumulativeMiles <= 0) return [];

  const scale = routeDistanceMiles / cumulativeMiles;
  return draft.map((point, index) => ({
    ...point,
    distanceMiles: index === draft.length - 1
      ? routeDistanceMiles
      : Number((point.distanceMiles * scale).toFixed(3)),
  }));
}

function flattenRouteGeometryPoints(
  context: TerrainRiskRouteContext,
): Array<{ lat: number; lon: number }> {
  const routePoints =
    Array.isArray(context.routePoints) && context.routePoints.length > 1
      ? context.routePoints
      : (context.routeSegments ?? []).flatMap((segment) => segment.points ?? []);
  const points: Array<{ lat: number; lon: number }> = [];

  routePoints.forEach((point) => {
    const coordinate = normalizeCoordinate(point);
    if (!coordinate) return;
    const previous = points[points.length - 1];
    if (previous && previous.lat === coordinate.lat && previous.lon === coordinate.lon) return;
    points.push(coordinate);
  });

  return points;
}

function buildEstimatedRouteProfileDraft(
  context: TerrainRiskRouteContext,
): RouteProfileDraftPoint[] {
  if (!isFiniteNumber(context.currentElevationFeet)) return [];
  const geometryPoints = flattenRouteGeometryPoints(context);
  if (geometryPoints.length < 2) return [];

  const draft: RouteProfileDraftPoint[] = [];
  let cumulativeMiles = 0;
  draft.push({
    distanceMiles: 0,
    elevationFeet: Math.round(context.currentElevationFeet),
    gradePercent: 0,
  });

  for (let index = 1; index < geometryPoints.length; index += 1) {
    const previous = geometryPoints[index - 1];
    const point = geometryPoints[index];
    const legMiles = haversineMiles(previous.lat, previous.lon, point.lat, point.lon);
    const safeLegMiles = Number.isFinite(legMiles) && legMiles < 500 ? Math.max(0, legMiles) : 0;
    cumulativeMiles += safeLegMiles;
    draft.push({
      distanceMiles: cumulativeMiles,
      elevationFeet: Math.round(context.currentElevationFeet),
      gradePercent: 0,
    });
  }

  const routeDistanceMiles = isFinitePositive(context.totalDistanceMiles)
    ? context.totalDistanceMiles
    : cumulativeMiles;
  if (!isFinitePositive(routeDistanceMiles) || cumulativeMiles <= 0) return [];

  const scale = routeDistanceMiles / cumulativeMiles;
  return draft.map((point, index) => ({
    ...point,
    distanceMiles: index === draft.length - 1
      ? routeDistanceMiles
      : Number((point.distanceMiles * scale).toFixed(3)),
  }));
}

function sampleProfile(profile: RouteProfileDraftPoint[]): RouteProfileDraftPoint[] {
  if (profile.length <= MAX_PROFILE_POINTS) return profile;

  const sampled: RouteProfileDraftPoint[] = [];
  const usedIndexes = new Set<number>();
  for (let index = 0; index < MAX_PROFILE_POINTS; index += 1) {
    const sourceIndex = Math.round((index / (MAX_PROFILE_POINTS - 1)) * (profile.length - 1));
    if (!usedIndexes.has(sourceIndex)) {
      sampled.push(profile[sourceIndex]);
      usedIndexes.add(sourceIndex);
    }
  }
  return sampled;
}

function scoreProfilePoint(
  point: RouteProfileDraftPoint,
  averageElevationFeet: number,
): number {
  const gradeScore = Math.min(58, point.gradePercent * 4.8);
  const elevationScore =
    point.elevationFeet >= 10000
      ? 18
      : point.elevationFeet >= 8500
        ? 12
        : point.elevationFeet >= 7000
          ? 7
          : point.elevationFeet >= 5500
            ? 3
            : 0;
  const reliefScore = Math.min(12, Math.abs(point.elevationFeet - averageElevationFeet) / 220);
  return clampRiskScore(16 + gradeScore + elevationScore + reliefScore);
}

function buildTerrainProfile(profile: RouteProfileDraftPoint[]): TerrainProfilePoint[] {
  const averageElevationFeet =
    profile.reduce((sum, point) => sum + point.elevationFeet, 0) / Math.max(1, profile.length);
  return sampleProfile(profile).map((point) => {
    const riskScore = point.riskScore ?? scoreProfilePoint(point, averageElevationFeet);
    return {
      distanceMiles: point.distanceMiles,
      elevationFeet: Math.round(point.elevationFeet),
      riskScore,
      riskLevel: classifyTerrainCommandRisk(riskScore),
      gradePercent: point.gradePercent,
      thermalBand: point.thermalBand,
      hazardKinds: point.hazardKinds,
    };
  });
}

function buildRouteProfileDraftFromAnalysis(
  analysis: TerrainElevationRouteAnalysis,
): RouteProfileDraftPoint[] {
  return analysis.samples.map((sample, index) => {
    const segment =
      analysis.segments[Math.max(0, index - 1)] ??
      analysis.segments[0];
    return {
      distanceMiles: sample.distanceMiles,
      elevationFeet: sample.elevationFeet,
      gradePercent: segment?.gradePercent ?? 0,
      riskScore: segment?.riskScore,
      thermalBand: segment?.thermalBand,
      hazardKinds: segment?.hazardKinds ?? [],
    };
  });
}

function routeContextName(context: TerrainRiskRouteContext): string {
  const name = context?.routeName?.trim();
  if (name) return name;
  return 'Active guidance';
}

function getMaxGradePercent(profile: RouteProfileDraftPoint[]): number {
  return profile.reduce((max, point) => Math.max(max, point.gradePercent), 0);
}

function getAverageGradePercent(profile: RouteProfileDraftPoint[]): number {
  const gradeSum = profile.reduce((sum, point) => sum + point.gradePercent, 0);
  return profile.length > 0 ? gradeSum / profile.length : 0;
}

function getGradeDetail(maxGradePercent: number): string {
  if (maxGradePercent >= 12) return 'Steep';
  if (maxGradePercent >= 6) return 'Moderate';
  return 'Controlled';
}

function buildTerrainRiskFactors(
  draftProfile: RouteProfileDraftPoint[],
  overallRiskLabel: TerrainRiskLevel,
  dataState: TerrainRiskRoute['dataState'],
  analysis?: TerrainElevationRouteAnalysis | null,
): TerrainRiskFactor[] {
  const maxGradePercent = analysis?.maxGradePercent ?? getMaxGradePercent(draftProfile);
  const averageGradePercent = analysis?.averageGradePercent ?? getAverageGradePercent(draftProfile);
  const gradeStatus = classifyTerrainCommandRisk(maxGradePercent >= 12 ? 72 : maxGradePercent >= 6 ? 48 : 24);
  const estimated = dataState === 'estimated-route';

  return [
    {
      key: 'grade',
      label: 'Grade',
      value: estimated ? 'Est.' : `${Math.round(maxGradePercent)}%`,
      status: estimated ? 'neutral' : gradeStatus,
      detail: estimated ? 'GPS alt' : getGradeDetail(maxGradePercent),
    },
    {
      key: 'surface',
      label: 'Surface',
      value: 'Unknown',
      status: 'neutral',
      detail: 'No feed',
    },
    {
      key: 'traction',
      label: 'Traction',
      value: '--',
      status: 'neutral',
      detail: 'No surface',
    },
    {
      key: 'rollover',
      label: 'Rollover Risk',
      value: estimated
        ? 'Pending'
        : analysis?.hotSpotCount
          ? `${analysis.hotSpotCount} hot`
          : formatTerrainRiskLabel(overallRiskLabel),
      status: estimated ? 'neutral' : overallRiskLabel,
      detail: estimated ? 'No grade feed' : `Avg grade ${averageGradePercent.toFixed(1)}%`,
    },
    {
      key: 'weather',
      label: 'Weather Effect',
      value: 'Pending',
      status: 'neutral',
      detail: 'Weather feed',
    },
  ];
}

function buildNextHazard(
  profile: TerrainProfilePoint[],
  context: TerrainRiskRouteContext,
  analysis?: TerrainElevationRouteAnalysis | null,
): TerrainHazard {
  const totalDistanceMiles = profile[profile.length - 1]?.distanceMiles ?? context.totalDistanceMiles ?? 0;
  const completedDistanceMiles = clampNumber(
    context.completedDistanceMiles ?? 0,
    0,
    Math.max(0, totalDistanceMiles),
  );
  const aheadProfile = profile.filter((point) => point.distanceMiles >= completedDistanceMiles + 0.05);
  const aheadSegments = (analysis?.segments ?? []).filter(
    (segment) => segment.endDistanceMiles >= completedDistanceMiles + 0.05,
  );
  const segmentCandidate =
    aheadSegments.find((segment) => segment.riskLevel === 'high') ??
    [...aheadSegments].sort((a, b) => b.riskScore - a.riskScore)[0] ??
    null;
  const candidate =
    segmentCandidate
      ? {
          distanceMiles: segmentCandidate.endDistanceMiles,
          riskLevel: segmentCandidate.riskLevel,
          riskScore: segmentCandidate.riskScore,
          hazardKinds: segmentCandidate.hazardKinds,
        }
      : aheadProfile.find((point) => point.riskLevel === 'high') ??
    [...aheadProfile].sort((a, b) => b.riskScore - a.riskScore)[0] ??
    profile[profile.length - 1];
  const distanceMiles = Math.max(0.1, candidate.distanceMiles - completedDistanceMiles);
  const label =
    'hazardKinds' in candidate && candidate.hazardKinds?.includes('washout_watch')
      ? 'Washout watch'
      : 'hazardKinds' in candidate && candidate.hazardKinds?.includes('tipover_watch')
        ? 'Tipover watch'
        : candidate.riskLevel === 'high'
      ? 'High-risk grade'
      : candidate.riskLevel === 'moderate'
        ? 'Moderate terrain change'
        : 'No elevated terrain ahead';

  return {
    id: `terrain-risk-${Math.round(candidate.distanceMiles * 10)}`,
    label,
    distanceMiles,
    riskLevel: candidate.riskLevel,
    actionLabel: 'View on Map',
    segmentId: segmentCandidate?.id,
    hazardKinds: 'hazardKinds' in candidate ? candidate.hazardKinds : undefined,
  };
}

export function buildTerrainRiskCommandRoute(
  context?: TerrainRiskRouteContext | null,
): TerrainRiskRoute | null {
  if (!context?.active) return null;

  const analysis = analyzeTerrainElevationRoute({
    routeSegments: context.routeSegments,
    routePoints: context.routePoints,
    totalDistanceMiles: context.totalDistanceMiles,
    currentElevationFeet: context.currentElevationFeet,
    sourceLabel: context.sourceLabel,
  });
  if (!analysis) return null;

  const dataState: TerrainRiskRoute['dataState'] =
    analysis.dataState === 'elevation-backed' ? 'live-route' : 'estimated-route';
  const draftProfile = buildRouteProfileDraftFromAnalysis(analysis);
  if (draftProfile.length < 2) return null;

  const profile = buildTerrainProfile(draftProfile);
  if (profile.length < 2) return null;

  const peakRisk = profile.reduce((max, point) => Math.max(max, point.riskScore), 0);
  const averageRisk = profile.reduce((sum, point) => sum + point.riskScore, 0) / profile.length;
  const overallRiskScore = clampRiskScore(peakRisk * 0.58 + averageRisk * 0.42);
  const overallRiskLabel = classifyTerrainCommandRisk(overallRiskScore);
  const totalDistanceMiles = isFinitePositive(context.totalDistanceMiles)
    ? context.totalDistanceMiles
    : profile[profile.length - 1].distanceMiles;

  return {
    id: context.routeId?.trim() || 'terrain-risk-live-route',
    name: routeContextName(context),
    totalDistanceMiles,
    overallRiskScore,
    overallRiskLabel,
    profile,
    terrainSegments: analysis.segments,
    elevationGainFeet: analysis.elevationGainFeet,
    elevationLossFeet: analysis.elevationLossFeet,
    maxGradePercent: analysis.maxGradePercent,
    hotSpotCount: analysis.hotSpotCount,
    warmSpotCount: analysis.warmSpotCount,
    factors: buildTerrainRiskFactors(draftProfile, overallRiskLabel, dataState, analysis),
    nextHazard: buildNextHazard(profile, context, analysis),
    sourceLabel: analysis.sourceLabel,
    dataState,
  };
}
