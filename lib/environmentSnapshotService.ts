import type { RemotenessIndexOutput } from './remotenessTypes';

export type EnvironmentSource =
  | 'gps'
  | 'route'
  | 'selected_coordinate'
  | 'last_known'
  | 'manual'
  | 'weather_provider'
  | 'calculated'
  | 'device_fallback'
  | 'remoteness_provider'
  | 'unavailable';

export type EnvironmentConfidence = 'high' | 'medium' | 'low' | 'unavailable';

export interface EnvironmentCoordinateInput {
  latitude?: number | null;
  longitude?: number | null;
  lat?: number | null;
  lon?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
  altitudeM?: number | null;
  altitudeFt?: number | null;
  source?: EnvironmentSource;
  updatedAt?: string | number | null;
}

export interface EnvironmentSolarTimesInput {
  sunrise?: number | null;
  sunset?: number | null;
  source?: EnvironmentSource | string;
  updatedAt?: string | number | null;
}

export interface EnvironmentSnapshotInput {
  coordinate?: EnvironmentCoordinateInput | null;
  deviceTimezoneId?: string | null;
  nowMs?: number;
  regionLabel?: string | null;
  regionSource?: EnvironmentSource;
  regionConfidence?: EnvironmentConfidence;
  solarTimes?: EnvironmentSolarTimesInput | null;
  remoteness?: RemotenessIndexOutput | null;
}

export interface EnvironmentCoordinateSnapshot {
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  source: EnvironmentSource;
  updatedAt: string | null;
}

export interface EnvironmentRegionSnapshot {
  label: string;
  confidence: EnvironmentConfidence;
  source: EnvironmentSource;
}

export interface EnvironmentTimezoneSnapshot {
  id: string | null;
  offsetMinutes: number | null;
  source: EnvironmentSource;
  confidence: EnvironmentConfidence;
  deviceTimezoneId: string | null;
}

export interface EnvironmentSunlightSnapshot {
  sunriseIso: string | null;
  sunsetIso: string | null;
  civilTwilightEndIso: string | null;
  remainingMinutes: number | null;
  status: 'before_sunrise' | 'daylight' | 'near_sunset' | 'after_sunset' | 'unavailable';
  nextEvent: 'sunrise' | 'sunset' | null;
  nextEventIso: string | null;
  source: EnvironmentSource;
  confidence: EnvironmentConfidence;
  timezoneId: string | null;
}

export interface EnvironmentElevationSnapshot {
  meters: number | null;
  feet: number | null;
  source: EnvironmentSource;
  confidence: EnvironmentConfidence;
}

export interface EnvironmentRemotenessSnapshot {
  score: number | null;
  label: string;
  nearestRoad: string | null;
  nearestTown: string | null;
  nearestFuel: string | null;
  cellSignalHint: string | null;
  source: EnvironmentSource;
  confidence: EnvironmentConfidence;
}

export interface EnvironmentSnapshot {
  coordinate: EnvironmentCoordinateSnapshot;
  region: EnvironmentRegionSnapshot;
  timezone: EnvironmentTimezoneSnapshot;
  sunlight: EnvironmentSunlightSnapshot;
  elevation: EnvironmentElevationSnapshot;
  remoteness: EnvironmentRemotenessSnapshot;
  warnings: string[];
}

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const CIVIL_TWILIGHT_MINUTES = 30;

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeLongitude(value: number): number {
  return ((((value + 180) % 360) + 360) % 360) - 180;
}

function normalizeUpdatedAt(value: string | number | null | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }
  return null;
}

function normalizeCoordinate(input?: EnvironmentCoordinateInput | null): EnvironmentCoordinateSnapshot {
  const latitude = finiteNumber(input?.latitude ?? input?.lat);
  const rawLongitude = finiteNumber(input?.longitude ?? input?.lon ?? input?.lng);
  const longitude = rawLongitude == null ? null : normalizeLongitude(rawLongitude);
  const valid =
    latitude != null &&
    longitude != null &&
    latitude >= -90 &&
    latitude <= 90;

  return {
    latitude: valid ? latitude : null,
    longitude: valid ? longitude : null,
    accuracyM: finiteNumber(input?.accuracyM),
    source: valid ? input?.source ?? 'gps' : 'unavailable',
    updatedAt: normalizeUpdatedAt(input?.updatedAt),
  };
}

function getDeviceTimezoneId(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function resolveTimezoneIdFromCoordinate(latitude: number, longitude: number): string {
  if (latitude >= 18 && latitude <= 23 && longitude >= -161 && longitude <= -154) {
    return 'Pacific/Honolulu';
  }
  if (latitude >= 51 && longitude <= -130) {
    return 'America/Anchorage';
  }
  if (longitude <= -114) return 'America/Los_Angeles';
  if (longitude <= -101) return 'America/Denver';
  if (longitude <= -86) return 'America/Chicago';
  if (longitude <= -66) return 'America/New_York';
  return getDeviceTimezoneId() ?? 'UTC';
}

export function getTimeZoneOffsetMinutes(timeZoneId: string, date: Date): number | null {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZoneId,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    const hour = Number(parts.hour);
    const minute = Number(parts.minute);
    const second = Number(parts.second);
    if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;
    const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
    return Math.round((localAsUtc - date.getTime()) / MS_PER_MINUTE);
  } catch {
    return null;
  }
}

function resolveTimezone(
  coordinate: EnvironmentCoordinateSnapshot,
  deviceTimezoneId: string | null,
  now: Date,
): EnvironmentTimezoneSnapshot {
  if (coordinate.latitude != null && coordinate.longitude != null) {
    const id = resolveTimezoneIdFromCoordinate(coordinate.latitude, coordinate.longitude);
    return {
      id,
      offsetMinutes: getTimeZoneOffsetMinutes(id, now),
      source: 'calculated',
      confidence: id === deviceTimezoneId ? 'medium' : 'medium',
      deviceTimezoneId,
    };
  }

  if (deviceTimezoneId) {
    return {
      id: deviceTimezoneId,
      offsetMinutes: getTimeZoneOffsetMinutes(deviceTimezoneId, now),
      source: 'device_fallback',
      confidence: 'low',
      deviceTimezoneId,
    };
  }

  return {
    id: null,
    offsetMinutes: null,
    source: 'unavailable',
    confidence: 'unavailable',
    deviceTimezoneId,
  };
}

function getLocalDateParts(timeZoneId: string, date: Date): { year: number; month: number; day: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZoneId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
      if (part.type !== 'literal') acc[part.type] = part.value;
      return acc;
    }, {});
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    if (![year, month, day].every(Number.isFinite)) return null;
    return { year, month, day };
  } catch {
    return null;
  }
}

function dayOfYearUtc(year: number, month: number, day: number): number {
  const start = Date.UTC(year, 0, 0);
  const current = Date.UTC(year, month - 1, day);
  return Math.floor((current - start) / (24 * MS_PER_HOUR));
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function solarEventUtcMs(
  date: Date,
  latitude: number,
  longitude: number,
  timeZoneId: string,
  event: 'sunrise' | 'sunset',
): number | null {
  const localDate = getLocalDateParts(timeZoneId, date);
  if (!localDate) return null;

  const zenith = 90.833;
  const lngHour = longitude / 15;
  const n = dayOfYearUtc(localDate.year, localDate.month, localDate.day);
  const t = n + (((event === 'sunrise' ? 6 : 18) - lngHour) / 24);
  const meanAnomaly = 0.9856 * t - 3.289;
  const trueLongitude = normalizeDegrees(
    meanAnomaly +
      1.916 * Math.sin(meanAnomaly * Math.PI / 180) +
      0.02 * Math.sin(2 * meanAnomaly * Math.PI / 180) +
      282.634,
  );

  let rightAscension = Math.atan(0.91764 * Math.tan(trueLongitude * Math.PI / 180)) * 180 / Math.PI;
  rightAscension = normalizeDegrees(rightAscension);
  const longitudeQuadrant = Math.floor(trueLongitude / 90) * 90;
  const ascensionQuadrant = Math.floor(rightAscension / 90) * 90;
  rightAscension = (rightAscension + longitudeQuadrant - ascensionQuadrant) / 15;

  const sinDeclination = 0.39782 * Math.sin(trueLongitude * Math.PI / 180);
  const cosDeclination = Math.cos(Math.asin(sinDeclination));
  const cosHourAngle =
    (Math.cos(zenith * Math.PI / 180) -
      sinDeclination * Math.sin(latitude * Math.PI / 180)) /
    (cosDeclination * Math.cos(latitude * Math.PI / 180));

  if (cosHourAngle > 1 || cosHourAngle < -1) return null;

  let hourAngle = Math.acos(cosHourAngle) * 180 / Math.PI;
  if (event === 'sunrise') hourAngle = 360 - hourAngle;
  hourAngle /= 15;

  const localMeanTime = hourAngle + rightAscension - 0.06571 * t - 6.622;
  const utcHour = ((localMeanTime - lngHour) % 24 + 24) % 24;
  let eventMs = Date.UTC(localDate.year, localDate.month - 1, localDate.day) + utcHour * MS_PER_HOUR;
  const eventLocalDate = getLocalDateParts(timeZoneId, new Date(eventMs));
  if (eventLocalDate) {
    const targetOrdinal = Date.UTC(localDate.year, localDate.month - 1, localDate.day);
    const eventOrdinal = Date.UTC(eventLocalDate.year, eventLocalDate.month - 1, eventLocalDate.day);
    if (eventOrdinal < targetOrdinal) eventMs += 24 * MS_PER_HOUR;
    if (eventOrdinal > targetOrdinal) eventMs -= 24 * MS_PER_HOUR;
  }
  return eventMs;
}

function normalizeSolarTimestampMs(value: number | null | undefined): number | null {
  const finite = finiteNumber(value);
  if (finite == null) return null;
  return finite < 10_000_000_000 ? finite * 1000 : finite;
}

function resolveSunlight(
  coordinate: EnvironmentCoordinateSnapshot,
  timezone: EnvironmentTimezoneSnapshot,
  solarTimes: EnvironmentSolarTimesInput | null | undefined,
  now: Date,
): EnvironmentSunlightSnapshot {
  const providerSunriseMs = normalizeSolarTimestampMs(solarTimes?.sunrise);
  const providerSunsetMs = normalizeSolarTimestampMs(solarTimes?.sunset);
  const hasProviderSunrise = providerSunriseMs != null;
  const hasProviderSunset = providerSunsetMs != null;
  const canCalculate =
    coordinate.latitude != null &&
    coordinate.longitude != null &&
    timezone.id != null;

  const calculatedSunriseMs = canCalculate
    ? solarEventUtcMs(now, coordinate.latitude!, coordinate.longitude!, timezone.id!, 'sunrise')
    : null;
  const calculatedSunsetMs = canCalculate
    ? solarEventUtcMs(now, coordinate.latitude!, coordinate.longitude!, timezone.id!, 'sunset')
    : null;
  const sunriseMs = providerSunriseMs ?? calculatedSunriseMs;
  const sunsetMs = providerSunsetMs ?? calculatedSunsetMs;
  const tomorrow = new Date(now.getTime() + 24 * MS_PER_HOUR);
  const calculatedNextSunriseMs = canCalculate
    ? solarEventUtcMs(tomorrow, coordinate.latitude!, coordinate.longitude!, timezone.id!, 'sunrise')
    : null;
  const nextSunriseMs = calculatedNextSunriseMs ?? (providerSunriseMs != null ? providerSunriseMs + 24 * MS_PER_HOUR : null);

  if (timezone.id == null || (sunriseMs == null && sunsetMs == null)) {
    return {
      sunriseIso: sunriseMs != null ? new Date(sunriseMs).toISOString() : null,
      sunsetIso: sunsetMs != null ? new Date(sunsetMs).toISOString() : null,
      civilTwilightEndIso: null,
      remainingMinutes: null,
      status: 'unavailable',
      nextEvent: null,
      nextEventIso: null,
      source: 'unavailable',
      confidence: 'unavailable',
      timezoneId: timezone.id,
    };
  }

  const nowMs = now.getTime();
  let status: EnvironmentSunlightSnapshot['status'] = 'unavailable';
  let nextEvent: EnvironmentSunlightSnapshot['nextEvent'] = null;
  let nextEventMs: number | null = null;

  if (sunriseMs != null && nowMs < sunriseMs) {
    status = 'before_sunrise';
    nextEvent = 'sunrise';
    nextEventMs = sunriseMs;
  } else if (sunriseMs != null && sunsetMs != null && nowMs >= sunriseMs && nowMs < sunsetMs) {
    nextEvent = 'sunset';
    nextEventMs = sunsetMs;
    const minutesUntilSunset = Math.max(0, Math.round((sunsetMs - nowMs) / MS_PER_MINUTE));
    status = minutesUntilSunset <= 90 ? 'near_sunset' : 'daylight';
  } else if (sunsetMs != null && nowMs >= sunsetMs) {
    status = 'after_sunset';
    nextEvent = 'sunrise';
    nextEventMs = nextSunriseMs;
  } else if (sunsetMs != null && nowMs < sunsetMs) {
    nextEvent = 'sunset';
    nextEventMs = sunsetMs;
    const minutesUntilSunset = Math.max(0, Math.round((sunsetMs - nowMs) / MS_PER_MINUTE));
    status = minutesUntilSunset <= 90 ? 'near_sunset' : 'daylight';
  }

  if (nextEventMs == null) {
    return {
      sunriseIso: sunriseMs != null ? new Date(sunriseMs).toISOString() : null,
      sunsetIso: sunsetMs != null ? new Date(sunsetMs).toISOString() : null,
      civilTwilightEndIso: sunsetMs != null ? new Date(sunsetMs + CIVIL_TWILIGHT_MINUTES * MS_PER_MINUTE).toISOString() : null,
      remainingMinutes: null,
      status: 'unavailable',
      nextEvent: null,
      nextEventIso: null,
      source: 'unavailable',
      confidence: 'unavailable',
      timezoneId: timezone.id,
    };
  }

  const remainingMinutes = Math.max(0, Math.round((nextEventMs - nowMs) / MS_PER_MINUTE));
  const source =
    nextEvent === 'sunrise'
      ? hasProviderSunrise && nextEventMs === (status === 'after_sunset' ? providerSunriseMs! + 24 * MS_PER_HOUR : providerSunriseMs)
        ? 'weather_provider'
        : 'calculated'
      : hasProviderSunset
        ? 'weather_provider'
        : 'calculated';

  return {
    sunriseIso: sunriseMs != null ? new Date(sunriseMs).toISOString() : null,
    sunsetIso: sunsetMs != null ? new Date(sunsetMs).toISOString() : null,
    civilTwilightEndIso: sunsetMs != null ? new Date(sunsetMs + CIVIL_TWILIGHT_MINUTES * MS_PER_MINUTE).toISOString() : null,
    remainingMinutes,
    status,
    nextEvent,
    nextEventIso: new Date(nextEventMs).toISOString(),
    source,
    confidence: source === 'weather_provider' ? 'high' : 'medium',
    timezoneId: timezone.id,
  };
}

function resolveElevation(input?: EnvironmentCoordinateInput | null): EnvironmentElevationSnapshot {
  const inputMeters = finiteNumber(input?.altitudeM);
  const inputFeet = finiteNumber(input?.altitudeFt);
  if (inputMeters != null) {
    return {
      meters: inputMeters,
      feet: inputMeters * 3.28084,
      source: input?.source ?? 'gps',
      confidence: 'medium',
    };
  }
  if (inputFeet != null) {
    return {
      meters: inputFeet / 3.28084,
      feet: inputFeet,
      source: input?.source ?? 'gps',
      confidence: 'medium',
    };
  }
  return {
    meters: null,
    feet: null,
    source: 'unavailable',
    confidence: 'unavailable',
  };
}

function formatDistanceMi(value: number | null | undefined, label: string | null | undefined): string | null {
  if (label) return label;
  if (typeof value === 'number' && Number.isFinite(value)) return `${Math.round(value)} mi`;
  return null;
}

function hasResolvedProximity(remoteness: RemotenessIndexOutput): boolean {
  const checks = [
    remoteness.proximity.nearestPavedRoad,
    remoteness.proximity.nearestTown,
    remoteness.proximity.nearestFuelStation,
  ];
  return checks.some((entry) => (
    entry.sourceState === 'live' ||
    entry.sourceState === 'cache' ||
    typeof entry.distanceMi === 'number'
  ));
}

function resolveRemoteness(remoteness?: RemotenessIndexOutput | null): EnvironmentRemotenessSnapshot {
  if (!remoteness || !remoteness.isActive || !hasResolvedProximity(remoteness)) {
    return {
      score: null,
      label: 'Unknown',
      nearestRoad: null,
      nearestTown: null,
      nearestFuel: null,
      cellSignalHint: null,
      source: 'unavailable',
      confidence: 'unavailable',
    };
  }

  const source =
    remoteness.proximity.nearestPavedRoad.sourceState === 'live' ||
    remoteness.proximity.nearestTown.sourceState === 'live' ||
    remoteness.proximity.nearestFuelStation.sourceState === 'live'
      ? 'remoteness_provider'
      : 'last_known';

  return {
    score: remoteness.score,
    label: remoteness.level,
    nearestRoad: formatDistanceMi(
      remoteness.proximity.nearestPavedRoad.distanceMi,
      remoteness.proximity.nearestPavedRoad.label,
    ),
    nearestTown: formatDistanceMi(
      remoteness.proximity.nearestTown.distanceMi,
      remoteness.proximity.nearestTown.label,
    ),
    nearestFuel: formatDistanceMi(
      remoteness.proximity.nearestFuelStation.distanceMi,
      remoteness.proximity.nearestFuelStation.label,
    ),
    cellSignalHint: remoteness.connectivity.signal,
    source,
    confidence: source === 'remoteness_provider' ? 'medium' : 'low',
  };
}

function resolveRegion(
  coordinate: EnvironmentCoordinateSnapshot,
  input: EnvironmentSnapshotInput,
): EnvironmentRegionSnapshot {
  if (input.regionLabel && input.regionLabel.trim().length > 0) {
    const regionSource = input.regionSource ?? 'selected_coordinate';
    const regionConfidence = input.regionConfidence ?? 'medium';
    const hasCoordinate = coordinate.latitude != null && coordinate.longitude != null;
    if (hasCoordinate && regionSource === 'weather_provider' && regionConfidence !== 'high') {
      return {
        label: `${coordinate.latitude!.toFixed(2)}, ${coordinate.longitude!.toFixed(2)}`,
        confidence: 'low',
        source: 'calculated',
      };
    }
    return {
      label: input.regionLabel.trim(),
      confidence: regionConfidence,
      source: regionSource,
    };
  }
  if (coordinate.latitude != null && coordinate.longitude != null) {
    return {
      label: `${coordinate.latitude.toFixed(2)}, ${coordinate.longitude.toFixed(2)}`,
      confidence: 'low',
      source: 'calculated',
    };
  }
  return {
    label: 'Region unavailable',
    confidence: 'unavailable',
    source: 'unavailable',
  };
}

export function getEnvironmentCoordinateKey(
  coordinate?: EnvironmentCoordinateInput | EnvironmentCoordinateSnapshot | null,
  precision = 3,
): string {
  const normalized = 'latitude' in (coordinate ?? {})
    ? coordinate as EnvironmentCoordinateSnapshot
    : normalizeCoordinate(coordinate as EnvironmentCoordinateInput | null | undefined);
  if (normalized.latitude == null || normalized.longitude == null) {
    return 'coordinate:unavailable';
  }
  return `${normalized.latitude.toFixed(precision)},${normalized.longitude.toFixed(precision)}`;
}

export function hasMeaningfulEnvironmentCoordinateChange(
  previous?: EnvironmentCoordinateInput | EnvironmentCoordinateSnapshot | null,
  next?: EnvironmentCoordinateInput | EnvironmentCoordinateSnapshot | null,
): boolean {
  return getEnvironmentCoordinateKey(previous) !== getEnvironmentCoordinateKey(next);
}

export function formatEnvironmentTime(iso: string | null, timeZoneId: string | null): string {
  if (!iso || !timeZoneId) return 'Unavailable';
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return 'Unavailable';
  try {
    return date.toLocaleTimeString([], {
      timeZone: timeZoneId,
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
}

function formatSunlightDuration(minutesValue: number | null): string {
  if (minutesValue == null || !Number.isFinite(minutesValue)) return 'Unavailable';
  const totalMinutes = Math.max(0, Math.round(minutesValue));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${Math.max(1, minutes)}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function getSunlightCountdownLabel(sunlight: EnvironmentSunlightSnapshot): string {
  if (sunlight.status === 'unavailable' || sunlight.remainingMinutes == null || sunlight.nextEvent == null) {
    return 'Sunlight data unavailable';
  }
  return sunlight.nextEvent === 'sunrise' ? 'Time until sunrise' : 'Daylight remaining';
}

export function formatSunlightCountdownValue(sunlight: EnvironmentSunlightSnapshot): string {
  if (sunlight.status === 'unavailable' || sunlight.remainingMinutes == null || sunlight.nextEvent == null) {
    return 'Unavailable';
  }
  return formatSunlightDuration(sunlight.remainingMinutes);
}

export function formatSunlightRemaining(sunlight: EnvironmentSunlightSnapshot): string {
  if (sunlight.status === 'unavailable' || sunlight.remainingMinutes == null || sunlight.nextEvent == null) {
    return 'Sunlight unavailable';
  }
  const duration = formatSunlightDuration(sunlight.remainingMinutes);
  return sunlight.nextEvent === 'sunrise'
    ? `${duration} until sunrise`
    : `${duration} daylight remaining`;
}

export function getSunlightSourceLabel(sunlight: EnvironmentSunlightSnapshot): string {
  if (sunlight.status === 'unavailable') return 'Sunlight unavailable';
  if (sunlight.source === 'weather_provider') return 'Weather solar time';
  if (sunlight.source === 'calculated') return 'Sunlight estimate degraded';
  return 'Sunlight estimate degraded';
}

export function buildEnvironmentSnapshot(input: EnvironmentSnapshotInput = {}): EnvironmentSnapshot {
  const now = new Date(input.nowMs ?? Date.now());
  const warnings: string[] = [];
  const coordinate = normalizeCoordinate(input.coordinate);
  const deviceTimezoneId = input.deviceTimezoneId ?? getDeviceTimezoneId();
  const timezone = resolveTimezone(coordinate, deviceTimezoneId, now);
  const sunlight = resolveSunlight(coordinate, timezone, input.solarTimes, now);
  const elevation = resolveElevation(input.coordinate);
  const remoteness = resolveRemoteness(input.remoteness);
  const region = resolveRegion(coordinate, input);

  if (coordinate.latitude == null || coordinate.longitude == null) {
    warnings.push('coordinate_unavailable');
  }
  if (timezone.source === 'device_fallback') {
    warnings.push('timezone_device_fallback');
  }
  if (sunlight.status === 'unavailable') {
    warnings.push('sunlight_unavailable');
  }
  if (elevation.feet == null) {
    warnings.push('elevation_unavailable');
  }
  if (remoteness.score == null) {
    warnings.push('remoteness_unknown');
  }

  return {
    coordinate,
    region,
    timezone,
    sunlight,
    elevation,
    remoteness,
    warnings,
  };
}

export function formatEnvironmentDiagnostics(snapshot: EnvironmentSnapshot): string {
  return [
    '[ENVIRONMENT] snapshot',
    `coord=${snapshot.coordinate.latitude ?? 'unavailable'},${snapshot.coordinate.longitude ?? 'unavailable'}`,
    `accuracyM=${snapshot.coordinate.accuracyM ?? 'unknown'}`,
    `region=${snapshot.region.label}`,
    `timezone=${snapshot.timezone.id ?? 'unavailable'}`,
    `deviceTimezone=${snapshot.timezone.deviceTimezoneId ?? 'unavailable'}`,
    `sunrise=${snapshot.sunlight.sunriseIso ?? 'unavailable'}`,
    `sunset=${snapshot.sunlight.sunsetIso ?? 'unavailable'}`,
    `nextSun=${snapshot.sunlight.nextEvent ?? 'unavailable'}`,
    `remainingMin=${snapshot.sunlight.remainingMinutes ?? 'unknown'}`,
    `elevationFt=${snapshot.elevation.feet == null ? 'unknown' : Math.round(snapshot.elevation.feet)}`,
    `remoteness=${snapshot.remoteness.score ?? 'unknown'}`,
    `sources=${snapshot.coordinate.source}/${snapshot.timezone.source}/${snapshot.sunlight.source}/${snapshot.elevation.source}/${snapshot.remoteness.source}`,
    `warnings=${snapshot.warnings.join(',') || 'none'}`,
  ].join(' ');
}

export function logEnvironmentDiagnostics(snapshot: EnvironmentSnapshot): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(formatEnvironmentDiagnostics(snapshot));
  }
}
