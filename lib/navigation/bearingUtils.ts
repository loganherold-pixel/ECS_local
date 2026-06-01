export type NavigationCoordinate = {
  latitude: number;
  longitude: number;
};

const EARTH_RADIUS_MILES = 3958.8;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

export function normalizeDegrees(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return ((value % 360) + 360) % 360;
}

export function isValidCoordinate(value: unknown): value is NavigationCoordinate {
  const candidate = value as Partial<NavigationCoordinate> | null | undefined;
  return (
    candidate != null &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude) &&
    Number(candidate.latitude) >= -90 &&
    Number(candidate.latitude) <= 90 &&
    Number(candidate.longitude) >= -180 &&
    Number(candidate.longitude) <= 180
  );
}

export function normalizeCoordinate(value: unknown): NavigationCoordinate | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const latitude = Number(raw.latitude ?? raw.lat);
  const longitude = Number(raw.longitude ?? raw.lng ?? raw.lon);
  const coordinate = { latitude, longitude };
  return isValidCoordinate(coordinate) ? coordinate : null;
}

export function calculateBearingDegrees(
  from: NavigationCoordinate | null | undefined,
  to: NavigationCoordinate | null | undefined,
): number | null {
  if (!isValidCoordinate(from) || !isValidCoordinate(to)) return null;

  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const y = Math.sin(deltaLon) * Math.cos(toLat);
  const x =
    Math.cos(fromLat) * Math.sin(toLat) -
    Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon);
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

export function calculateDistanceMiles(
  from: NavigationCoordinate | null | undefined,
  to: NavigationCoordinate | null | undefined,
): number | null {
  if (!isValidCoordinate(from) || !isValidCoordinate(to)) return null;

  const deltaLat = toRadians(to.latitude - from.latitude);
  const deltaLon = toRadians(to.longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(to.latitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) ** 2;
  const distance = EARTH_RADIUS_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Number.isFinite(distance) ? distance : null;
}

export function degreesToCardinalDirection(degrees: number | null | undefined): string {
  const normalized = normalizeDegrees(degrees);
  if (normalized == null) return 'Unavailable';
  const labels = [
    'N',
    'NNE',
    'NE',
    'ENE',
    'E',
    'ESE',
    'SE',
    'SSE',
    'S',
    'SSW',
    'SW',
    'WSW',
    'W',
    'WNW',
    'NW',
    'NNW',
  ];
  return labels[Math.round(normalized / 22.5) % labels.length];
}
