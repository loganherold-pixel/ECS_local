import type {
  ExpeditionRecap,
  ExpeditionRecapElevationChange,
  ExpeditionRecapNotableMoment,
  ExpeditionRecapSteepGradeSegment,
  ExpeditionRecapTerrainRiskEvent,
  ExpeditionRecapTemperatureRange,
  ExpeditionTripCoordinate,
  ExpeditionTripDeviation,
  ExpeditionTripNotableMoment,
  ExpeditionTripRecord,
  ExpeditionTripTerrainRiskSnapshot,
} from './expeditionTripRecordTypes';

const SIGNIFICANT_ELEVATION_CHANGE_FT = 500;
const STEEP_GRADE_THRESHOLD_PERCENT = 8;

function round(value: number, precision = 1): number {
  const multiplier = 10 ** precision;
  return Math.round(value * multiplier) / multiplier;
}

function finiteNumberOrNull(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function hoursFromSeconds(seconds: number | null): number | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return null;
  return round(seconds / 3600, 2);
}

function averageSpeedMph(distanceMiles: number | null, durationHours: number | null): number | null {
  if (distanceMiles == null || durationHours == null || durationHours <= 0) return null;
  return round(distanceMiles / durationHours, 1);
}

function distanceMiles(a: ExpeditionTripCoordinate, b: ExpeditionTripCoordinate): number {
  const earthRadiusMiles = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMiles * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function weatherConditions(record: ExpeditionTripRecord): string[] | undefined {
  const values = new Set<string>();
  for (const snapshot of record.weatherSnapshots) {
    const summary = snapshot.summary?.trim();
    if (summary) values.add(summary);
    const precipitation = snapshot.precipitation?.trim();
    if (precipitation) values.add(precipitation);
  }
  return values.size > 0 ? Array.from(values).slice(0, 8) : undefined;
}

function temperatureRange(record: ExpeditionTripRecord): ExpeditionRecapTemperatureRange | undefined {
  const temperatures = record.weatherSnapshots
    .map((snapshot) => finiteNumberOrNull(snapshot.temperatureF))
    .filter((value): value is number => value != null);
  if (temperatures.length === 0) return undefined;
  return {
    minF: Math.round(Math.min(...temperatures)),
    maxF: Math.round(Math.max(...temperatures)),
  };
}

function buildEnvironmentSummary(record: ExpeditionTripRecord): ExpeditionRecap['environmentSummary'] {
  const conditions = weatherConditions(record);
  const temperatures = temperatureRange(record);
  if (!conditions && !temperatures) return undefined;
  return {
    ...(conditions ? { weatherConditionsEncountered: conditions } : null),
    ...(temperatures ? { temperatureRange: temperatures } : null),
  };
}

function terrainRiskEvents(record: ExpeditionTripRecord): ExpeditionRecapTerrainRiskEvent[] | undefined {
  const events = record.terrainRiskSnapshots
    .filter((snapshot) => snapshot.riskLevel && snapshot.riskLevel !== 'normal')
    .map((snapshot) => ({
      id: snapshot.id,
      capturedAt: snapshot.capturedAt,
      riskLevel: snapshot.riskLevel,
      summary: snapshot.summary ?? null,
      coordinate: snapshot.coordinate ?? null,
    }));
  return events.length > 0 ? events : undefined;
}

function steepGradeSegments(routeGeometry: ExpeditionTripCoordinate[]): ExpeditionRecapSteepGradeSegment[] | undefined {
  const segments: ExpeditionRecapSteepGradeSegment[] = [];
  for (let index = 1; index < routeGeometry.length; index += 1) {
    const start = routeGeometry[index - 1];
    const end = routeGeometry[index];
    if (start.elevationFt == null || end.elevationFt == null) continue;
    const horizontalFeet = distanceMiles(start, end) * 5280;
    if (horizontalFeet <= 0) continue;
    const elevationChangeFt = end.elevationFt - start.elevationFt;
    const gradePercent = round((Math.abs(elevationChangeFt) / horizontalFeet) * 100, 1);
    if (gradePercent < STEEP_GRADE_THRESHOLD_PERCENT) continue;
    segments.push({
      id: `steep-grade:${index}`,
      startCoordinate: start,
      endCoordinate: end,
      gradePercent,
      elevationChangeFt: Math.round(elevationChangeFt),
    });
  }
  return segments.length > 0 ? segments.slice(0, 12) : undefined;
}

function notableElevationChanges(routeGeometry: ExpeditionTripCoordinate[]): ExpeditionRecapElevationChange[] | undefined {
  const changes: ExpeditionRecapElevationChange[] = [];
  for (let index = 1; index < routeGeometry.length; index += 1) {
    const previous = routeGeometry[index - 1];
    const current = routeGeometry[index];
    if (previous.elevationFt == null || current.elevationFt == null) continue;
    const changeFt = Math.round(current.elevationFt - previous.elevationFt);
    if (Math.abs(changeFt) < SIGNIFICANT_ELEVATION_CHANGE_FT) continue;
    changes.push({
      id: `elevation-change:${index}`,
      fromElevationFt: Math.round(previous.elevationFt),
      toElevationFt: Math.round(current.elevationFt),
      changeFt,
      coordinate: current,
    });
  }
  return changes.length > 0 ? changes.slice(0, 12) : undefined;
}

function buildTerrainSummary(record: ExpeditionTripRecord): ExpeditionRecap['terrainSummary'] {
  const risks = terrainRiskEvents(record);
  const steepSegments = steepGradeSegments(record.routeGeometry);
  const elevationChanges = notableElevationChanges(record.routeGeometry);
  if (!risks && !steepSegments && !elevationChanges) return undefined;
  return {
    ...(risks ? { terrainRiskEvents: risks } : null),
    ...(steepSegments ? { steepGradeSegments: steepSegments } : null),
    ...(elevationChanges ? { notableElevationChanges: elevationChanges } : null),
  };
}

function tripMomentToRecapMoment(moment: ExpeditionTripNotableMoment): ExpeditionRecapNotableMoment {
  const type =
    moment.type === 'route_deviation'
      ? 'route_deviation'
      : moment.type === 'recovery_used'
        ? 'recovery_tools_opened'
      : moment.type === 'guidance_completed'
        ? 'guidance_completed'
        : moment.type === 'badge_unlocked'
          ? 'badge_unlocked'
          : 'manual_note';
  return {
    id: moment.id,
    capturedAt: moment.capturedAt,
    type,
    title: moment.title,
    detail: moment.detail ?? null,
    coordinate: moment.coordinate ?? null,
  };
}

function timestampMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function recordAlreadyHasDeviationMoment(record: ExpeditionTripRecord, deviation: ExpeditionTripDeviation): boolean {
  const directMomentId = `${deviation.id}:moment`;
  const deviationMs = timestampMs(deviation.capturedAt);
  return record.notableMoments.some((moment) => {
    if (moment.type !== 'route_deviation') return false;
    if (moment.id === directMomentId) return true;
    const momentMs = timestampMs(moment.capturedAt);
    return (
      deviationMs != null &&
      momentMs != null &&
      Math.abs(momentMs - deviationMs) <= 1000
    );
  });
}

function recapMomentsFromRecord(record: ExpeditionTripRecord): ExpeditionRecapNotableMoment[] {
  const moments = record.notableMoments.map(tripMomentToRecapMoment);
  const generatedAt = record.completedAt ?? record.updatedAt;

  if (record.maxElevationFt != null) {
    const highestCoordinate =
      record.routeGeometry.find((point) => point.elevationFt === record.maxElevationFt) ??
      record.endCoordinate;
    moments.push({
      id: `highest-elevation:${record.id}`,
      capturedAt: highestCoordinate?.recordedAt ?? generatedAt,
      type: 'highest_elevation',
      title: 'Highest elevation reached',
      detail: `${Math.round(record.maxElevationFt).toLocaleString()} ft`,
      coordinate: highestCoordinate ?? null,
    });
  }

  const temperatures = temperatureRange(record);
  if (temperatures && Math.abs(temperatures.maxF - temperatures.minF) >= 20) {
    moments.push({
      id: `weather-change:${record.id}`,
      capturedAt: generatedAt,
      type: 'weather_change',
      title: 'Weather change recorded',
      detail: `${temperatures.minF}-${temperatures.maxF} F`,
      coordinate: record.endCoordinate,
    });
  }

  for (const deviation of record.deviations) {
    if (recordAlreadyHasDeviationMoment(record, deviation)) continue;
    moments.push({
      id: `recap:${deviation.id}`,
      capturedAt: deviation.capturedAt,
      type: deviation.statusLabel?.toLowerCase().includes('rerout') ? 'reroute_accepted' : 'route_deviation',
      title: deviation.statusLabel?.toLowerCase().includes('rerout') ? 'Reroute recorded' : 'Route deviation recorded',
      detail: deviation.distanceMeters == null ? deviation.statusLabel ?? null : `${Math.round(deviation.distanceMeters)} m from route`,
      coordinate: deviation.coordinate ?? null,
    });
  }

  for (const usage of record.recoveryPanelUsed) {
    moments.push({
      id: `recovery:${usage.usedAt}`,
      capturedAt: usage.usedAt,
      type: 'recovery_tools_opened',
      title: 'Recovery tools opened',
      detail: usage.context ?? null,
      coordinate: null,
    });
  }

  for (const risk of record.terrainRiskSnapshots) {
    if (!risk.riskLevel || risk.riskLevel === 'normal') continue;
    moments.push({
      id: `terrain-risk:${risk.id}`,
      capturedAt: risk.capturedAt,
      type: 'terrain_risk_warning',
      title: 'Terrain risk warning encountered',
      detail: risk.summary ?? risk.riskLevel,
      coordinate: risk.coordinate ?? null,
    });
  }

  const unique = new Map<string, ExpeditionRecapNotableMoment>();
  for (const moment of moments) {
    if (!unique.has(moment.id)) unique.set(moment.id, moment);
  }
  return Array.from(unique.values()).slice(0, 100);
}

function rerouteMoments(moments: ExpeditionRecapNotableMoment[]): ExpeditionRecapNotableMoment[] {
  return moments.filter((moment) => moment.type === 'reroute_accepted');
}

function ratingCandidate(record: ExpeditionTripRecord, moments: ExpeditionRecapNotableMoment[]): ExpeditionRecap['tripOutcome']['tripRatingCandidate'] {
  if (record.status !== 'completed') return 'incomplete';
  const hasCriticalTerrain = record.terrainRiskSnapshots.some((snapshot) => snapshot.riskLevel === 'critical');
  if (hasCriticalTerrain || record.recoveryPanelUsed.length > 0) return 'challenging';
  if (record.deviations.length > 0 || moments.length > 3) return 'eventful';
  return 'clean';
}

function formatDistance(distanceMiles: number | null): string | null {
  if (distanceMiles == null) return null;
  return `${round(distanceMiles, distanceMiles < 10 ? 1 : 0).toLocaleString()}-mile`;
}

function buildNarrative(record: ExpeditionTripRecord, recap: Pick<ExpeditionRecap, 'journeySummary' | 'environmentSummary' | 'terrainSummary'>): ExpeditionRecap['generatedNarrative'] {
  const distance = formatDistance(recap.journeySummary.totalDistanceMiles);
  const terrainParts: string[] = [];
  if (recap.journeySummary.elevationGainFt != null && recap.journeySummary.elevationGainFt >= 1000) {
    terrainParts.push('significant elevation gain');
  }
  if (recap.terrainSummary?.terrainRiskEvents?.length) {
    terrainParts.push('terrain risk warnings');
  }
  if (recap.terrainSummary?.steepGradeSegments?.length) {
    terrainParts.push('steep grade segments');
  }

  const weatherParts: string[] = [];
  if (recap.environmentSummary?.weatherConditionsEncountered?.length) {
    weatherParts.push('recorded weather conditions');
  }
  if (recap.environmentSummary?.temperatureRange) {
    const { minF, maxF } = recap.environmentSummary.temperatureRange;
    if (maxF - minF >= 20) weatherParts.push('a notable temperature range');
  }

  const descriptors = [...terrainParts, ...weatherParts];
  const base = distance
    ? `Completed a ${distance} expedition`
    : `Completed ${record.title}`;
  const summaryParagraph = descriptors.length > 0
    ? `${base} with ${descriptors.join(' and ')}.`
    : `${base}.`;

  return {
    headline: `Completed ${record.title}`,
    summaryParagraph,
  };
}

export function generateExpeditionRecap(record: ExpeditionTripRecord, generatedAt = new Date().toISOString()): ExpeditionRecap {
  const totalDurationHours = hoursFromSeconds(record.totalDurationSeconds);
  const notableMoments = recapMomentsFromRecord(record);
  const partial: Pick<ExpeditionRecap, 'journeySummary' | 'environmentSummary' | 'terrainSummary'> = {
    journeySummary: {
      totalDistanceMiles: record.totalDistanceMiles,
      totalDurationHours,
      averageSpeedMph: averageSpeedMph(record.totalDistanceMiles, totalDurationHours),
      maxElevationFt: record.maxElevationFt,
      elevationGainFt: record.totalElevationGainFt,
    },
    environmentSummary: buildEnvironmentSummary(record),
    terrainSummary: buildTerrainSummary(record),
  };

  const recap: ExpeditionRecap = {
    tripId: record.id,
    generatedAt,
    journeySummary: partial.journeySummary,
    routeSummary: {
      startLocation: record.startCoordinate ? { coordinate: record.startCoordinate } : null,
      endLocation: record.endCoordinate ? { coordinate: record.endCoordinate } : null,
      routeBounds: record.routeBounds,
      routeGeometryReference: record.routeGeometry.length > 0 ? `trip-record:${record.id}:routeGeometry` : null,
    },
    ...(partial.environmentSummary ? { environmentSummary: partial.environmentSummary } : null),
    ...(partial.terrainSummary ? { terrainSummary: partial.terrainSummary } : null),
    expeditionEvents: {
      notableMoments,
      routeDeviations: record.deviations,
      reroutes: rerouteMoments(notableMoments),
      recoveryPanelUsage: record.recoveryPanelUsed,
    },
    tripOutcome: {
      completionStatus: record.status,
      tripRatingCandidate: ratingCandidate(record, notableMoments),
    },
    generatedNarrative: buildNarrative(record, partial),
  };

  // TODO Expedition Recap: generate recap map layers from routeBounds and routeGeometryReference.
  // TODO Expedition Recap: transform notable moments into a story timeline.
  // TODO Expedition Recap: evaluate badges from recap metrics and events.
  // TODO Expedition Recap: compute expedition scoring after scoring rules exist.
  // TODO Expedition Recap: feed PDF/export payloads after export contracts are ready.

  return recap;
}
