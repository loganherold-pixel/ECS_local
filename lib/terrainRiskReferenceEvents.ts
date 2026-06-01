import type { TerrainProfilePoint, TerrainRiskLevel } from './terrainRiskCommandProfile';
import type { TerrainSegmentHazardKind } from './terrainElevationRouteEngine';

export type TerrainRiskReferenceRiskType =
  | TerrainSegmentHazardKind
  | 'hot_terrain_segment'
  | 'high_risk_score'
  | 'terrain_risk_change';

export type TerrainRiskWeatherInfluence = {
  available: boolean;
  source: 'live' | 'cached' | 'stale' | 'unavailable';
  contribution:
    | 'wet_traction'
    | 'wind_exposure'
    | 'heat_exposure'
    | 'cold_exposure'
    | 'weather_available'
    | 'unavailable';
  summary: string;
  detail: string;
};

export type TerrainRiskReferenceEvent = {
  id: string;
  riskType: TerrainRiskReferenceRiskType;
  title: string;
  detail: string;
  distanceMiles: number;
  distanceAheadMiles: number;
  elevationFeet: number;
  gradePercent: number | null;
  hazardKind: TerrainSegmentHazardKind | null;
  riskLevel: TerrainRiskLevel;
  riskScore: number;
  weatherInfluence: TerrainRiskWeatherInfluence;
  fieldGuidance: string[];
  banner: {
    title: string;
    detail: string;
    badge: string;
  };
};

type WeatherLikeSnapshot = {
  status?: { kind?: string | null } | null;
  current?: {
    condition?: string | null;
    description?: string | null;
    precipChance?: number | null;
    precipType?: string | null;
    windSpeed?: number | null;
    windGust?: number | null;
    temp?: number | null;
    feelsLike?: number | null;
  } | null;
  alerts?: unknown[] | null;
} | null | undefined;

type BuildTerrainRiskReferenceEventsArgs = {
  profile: TerrainProfilePoint[];
  completedDistanceMiles?: number | null;
  totalDistanceMiles?: number | null;
  weatherSnapshot?: WeatherLikeSnapshot;
};

type SelectUpcomingTerrainRiskBannerEventArgs = {
  proximityMiles?: number;
};

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function roundDistance(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatMiles(value: number): string {
  return `${roundDistance(value).toFixed(1)} mi`;
}

function formatGrade(value: number | null): string | null {
  return value == null ? null : `${Math.round(value)}% grade`;
}

function terrainHazardLabel(kind: TerrainRiskReferenceRiskType): string {
  switch (kind) {
    case 'steep_grade':
      return 'Steep grade';
    case 'rapid_elevation_change':
      return 'Rapid elevation change';
    case 'washout_watch':
      return 'Washout watch';
    case 'tipover_watch':
      return 'Tipover watch';
    case 'high_elevation':
      return 'High elevation';
    case 'hot_terrain_segment':
      return 'Hot terrain segment';
    case 'high_risk_score':
      return 'High terrain risk';
    case 'terrain_risk_change':
    default:
      return 'Terrain risk change';
  }
}

function chooseRiskType(point: TerrainProfilePoint): TerrainRiskReferenceRiskType {
  const hazard = point.hazardKinds?.[0];
  if (hazard) return hazard;
  if (point.thermalBand === 'hot') return 'hot_terrain_segment';
  if (point.riskLevel === 'high') return 'high_risk_score';
  return 'terrain_risk_change';
}

function weatherSource(kind: string): TerrainRiskWeatherInfluence['source'] {
  if (kind === 'live' || kind === 'ready') return 'live';
  if (kind === 'cached') return 'cached';
  if (kind === 'stale') return 'stale';
  return 'unavailable';
}

export function buildTerrainRiskWeatherInfluence(
  weatherSnapshot: WeatherLikeSnapshot,
): TerrainRiskWeatherInfluence {
  const kind = String(weatherSnapshot?.status?.kind ?? '').toLowerCase();
  const source = weatherSource(kind);
  const current = weatherSnapshot?.current ?? null;
  const conditionText = [
    current?.condition,
    current?.description,
    current?.precipType,
  ].filter(Boolean).join(' ').toLowerCase();
  const precipChance = finiteNumber(current?.precipChance);
  const windSpeed = finiteNumber(current?.windSpeed);
  const windGust = finiteNumber(current?.windGust);
  const temp = finiteNumber(current?.feelsLike) ?? finiteNumber(current?.temp);
  const hasUsableWeather =
    source !== 'unavailable' &&
    Boolean(current) &&
    (
      conditionText.length > 0 ||
      precipChance != null ||
      windSpeed != null ||
      windGust != null ||
      temp != null
    );

  if (!hasUsableWeather) {
    return {
      available: false,
      source: 'unavailable',
      contribution: 'unavailable',
      summary: 'Weather unavailable',
      detail: 'Weather unavailable; ECS is not adding weather influence to this terrain risk.',
    };
  }

  if (
    conditionText.includes('rain') ||
    conditionText.includes('drizzle') ||
    conditionText.includes('storm') ||
    conditionText.includes('snow') ||
    (precipChance != null && precipChance >= 45)
  ) {
    return {
      available: true,
      source,
      contribution: 'wet_traction',
      summary: 'Wet terrain risk',
      detail: 'wet terrain risk from route weather signal',
    };
  }

  if ((windGust ?? windSpeed ?? 0) >= 28 || (windSpeed ?? 0) >= 20) {
    return {
      available: true,
      source,
      contribution: 'wind_exposure',
      summary: 'Wind exposure',
      detail: 'wind exposure signal from route weather',
    };
  }

  if (temp != null && temp >= 95) {
    return {
      available: true,
      source,
      contribution: 'heat_exposure',
      summary: 'Heat exposure',
      detail: 'heat exposure signal from route weather',
    };
  }

  if (temp != null && temp <= 32) {
    return {
      available: true,
      source,
      contribution: 'cold_exposure',
      summary: 'Cold exposure',
      detail: 'freezing temperature signal from route weather',
    };
  }

  return {
    available: true,
    source,
    contribution: 'weather_available',
    summary: 'Weather checked',
    detail: 'route weather available; no added weather terrain modifier',
  };
}

function buildFieldGuidance(
  riskType: TerrainRiskReferenceRiskType,
  weather: TerrainRiskWeatherInfluence,
): string[] {
  const guidance: string[] = [];

  if (riskType === 'steep_grade' || riskType === 'rapid_elevation_change') {
    guidance.push('Slow before grade changes and keep throttle inputs smooth.');
  }
  if (riskType === 'washout_watch') {
    guidance.push('Reassess the line before committing; look for erosion or soft shoulders.');
  }
  if (riskType === 'tipover_watch') {
    guidance.push('Watch exposure and avoid sudden steering or off-camber corrections.');
  }
  if (riskType === 'high_elevation') {
    guidance.push('Monitor temperature, power, and driver fatigue as elevation increases.');
  }
  if (weather.contribution === 'wet_traction') {
    guidance.push('Reassess traction before steep or exposed sections.');
  } else if (weather.contribution === 'wind_exposure') {
    guidance.push('Expect gust effects on exposed ridges and loaded vehicles.');
  }

  if (guidance.length === 0) {
    guidance.push('Pause before this point, confirm surface condition, and choose a conservative line.');
  }

  return guidance;
}

export function buildTerrainRiskReferenceEvents({
  completedDistanceMiles = 0,
  profile,
  weatherSnapshot,
}: BuildTerrainRiskReferenceEventsArgs): TerrainRiskReferenceEvent[] {
  const progressMiles = Math.max(0, finiteNumber(completedDistanceMiles) ?? 0);
  const weatherInfluence = buildTerrainRiskWeatherInfluence(weatherSnapshot);

  return profile
    .map((point, index): TerrainRiskReferenceEvent | null => {
      const distanceMiles = finiteNumber(point.distanceMiles);
      const elevationFeet = finiteNumber(point.elevationFeet);
      const riskScore = finiteNumber(point.riskScore);
      if (distanceMiles == null || elevationFeet == null || riskScore == null) return null;
      const isReference =
        point.riskLevel === 'high' ||
        point.thermalBand === 'hot' ||
        (point.hazardKinds?.length ?? 0) > 0;
      if (!isReference) return null;

      const distanceAheadMiles = roundDistance(distanceMiles - progressMiles);
      if (distanceAheadMiles <= 0) return null;

      const riskType = chooseRiskType(point);
      const gradePercent = finiteNumber(point.gradePercent);
      const hazardKind = point.hazardKinds?.[0] ?? null;
      const riskLabel = terrainHazardLabel(riskType);
      const gradeLabel = formatGrade(gradePercent);
      const elevationLabel = `${Math.round(elevationFeet).toLocaleString()} ft`;
      const detailParts = [
        gradeLabel,
        elevationLabel,
        weatherInfluence.detail,
      ].filter(Boolean);
      const bannerDetail = [
        gradeLabel,
        weatherInfluence.available && weatherInfluence.contribution !== 'weather_available'
          ? weatherInfluence.detail
          : null,
      ].filter(Boolean).join(' | ') || `${elevationLabel} | ${weatherInfluence.summary}`;

      return {
        id: `terrain-risk-reference-${index}-${distanceMiles.toFixed(2)}`,
        riskType,
        title: riskLabel,
        detail: detailParts.join(' | '),
        distanceMiles: roundDistance(distanceMiles),
        distanceAheadMiles,
        elevationFeet: Math.round(elevationFeet),
        gradePercent: gradePercent == null ? null : Math.round(gradePercent),
        hazardKind,
        riskLevel: point.riskLevel,
        riskScore: Math.round(riskScore),
        weatherInfluence,
        fieldGuidance: buildFieldGuidance(riskType, weatherInfluence),
        banner: {
          title: `${riskLabel} ${formatMiles(distanceAheadMiles)} ahead`,
          detail: bannerDetail,
          badge: 'TERRAIN',
        },
      };
    })
    .filter((event): event is TerrainRiskReferenceEvent => event != null)
    .sort((a, b) => a.distanceAheadMiles - b.distanceAheadMiles || b.riskScore - a.riskScore);
}

export function selectUpcomingTerrainRiskBannerEvent(
  events: TerrainRiskReferenceEvent[],
  args: SelectUpcomingTerrainRiskBannerEventArgs = {},
): TerrainRiskReferenceEvent | null {
  const proximityMiles = Math.max(0, finiteNumber(args.proximityMiles) ?? 0.75);
  return events.find((event) => event.distanceAheadMiles > 0 && event.distanceAheadMiles <= proximityMiles) ?? null;
}
