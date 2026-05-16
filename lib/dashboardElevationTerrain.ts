export type ElevationTerrainStatus = 'live' | 'stale' | 'route' | 'unavailable';

export interface ElevationTerrainRouteContext {
  name?: string | null;
  total_distance_miles?: number | null;
  elevation_gain_ft?: number | null;
  updated_at?: string | null;
}

export interface ElevationTerrainInput {
  gpsHasFix?: boolean | null;
  gpsAltitudeFt?: number | null;
  gpsTimestampMs?: number | null;
  gpsAccuracyM?: number | null;
  activeRoute?: ElevationTerrainRouteContext | null;
  nowMs?: number;
  staleAfterMs?: number;
}

export interface ElevationTerrainSnapshot {
  status: ElevationTerrainStatus;
  badgeLabel: string;
  modeLabel: string;
  sourceLabel: string;
  footerLabel: string;
  currentElevationFt: number | null;
  currentElevationM: number | null;
  currentElevationLabel: string;
  lastUpdatedLabel: string;
  gpsAgeMs: number | null;
  gpsAccuracyM: number | null;
  routeName: string | null;
  routeDistanceMiles: number;
  routeGainFt: number | null;
  routeGradePercent: number | null;
  hasRouteProfile: boolean;
  hasLiveElevation: boolean;
  isStale: boolean;
}

const DEFAULT_STALE_AFTER_MS = 60_000;

function isFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function formatAgeLabel(ageMs: number | null): string {
  if (ageMs == null) return 'Timestamp unavailable';
  const seconds = Math.max(0, Math.round(ageMs / 1000));
  if (seconds < 5) return 'Updated just now';
  if (seconds < 60) return `Updated ${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes === 1) return 'Updated 1 min ago';
  return `Updated ${minutes} min ago`;
}

export function resolveElevationTerrainSnapshot(input: ElevationTerrainInput): ElevationTerrainSnapshot {
  const nowMs = input.nowMs ?? Date.now();
  const staleAfterMs = input.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const activeRoute = input.activeRoute ?? null;
  const routeDistanceMiles = Math.max(0, activeRoute?.total_distance_miles ?? 0);
  const routeGainFt = isFiniteNumber(activeRoute?.elevation_gain_ft) ? activeRoute.elevation_gain_ft : null;
  const routeGradePercent = routeGainFt != null && routeDistanceMiles > 0
    ? Number(((routeGainFt / (routeDistanceMiles * 5280)) * 100).toFixed(1))
    : null;
  const hasRouteProfile = Boolean(activeRoute) && (routeGainFt != null || routeDistanceMiles > 0);
  const hasGpsAltitude = Boolean(input.gpsHasFix) && isFiniteNumber(input.gpsAltitudeFt);
  const gpsAgeMs = input.gpsTimestampMs != null ? Math.max(0, nowMs - input.gpsTimestampMs) : null;
  const hasFreshTimestamp = gpsAgeMs != null && gpsAgeMs <= staleAfterMs;
  const hasLiveElevation = hasGpsAltitude && hasFreshTimestamp;
  const hasStaleElevation = hasGpsAltitude && !hasFreshTimestamp;
  const currentElevationFt = hasGpsAltitude ? Math.round(input.gpsAltitudeFt as number) : null;
  const currentElevationM = currentElevationFt != null ? currentElevationFt / 3.28084 : null;
  const currentElevationLabel = currentElevationFt != null ? `${currentElevationFt.toLocaleString()} ft` : '--';

  if (hasLiveElevation) {
    return {
      status: 'live',
      badgeLabel: 'LIVE ELEVATION',
      modeLabel: 'Live',
      sourceLabel: hasRouteProfile ? 'Live GPS elevation + route profile' : 'Live GPS elevation',
      footerLabel: hasRouteProfile ? 'Live elevation with active route terrain context' : 'Live elevation from current GPS fix',
      currentElevationFt,
      currentElevationM,
      currentElevationLabel,
      lastUpdatedLabel: formatAgeLabel(gpsAgeMs),
      gpsAgeMs,
      gpsAccuracyM: input.gpsAccuracyM ?? null,
      routeName: activeRoute?.name ?? null,
      routeDistanceMiles,
      routeGainFt,
      routeGradePercent,
      hasRouteProfile,
      hasLiveElevation,
      isStale: false,
    };
  }

  if (hasStaleElevation) {
    return {
      status: 'stale',
      badgeLabel: 'STALE ELEVATION',
      modeLabel: 'Stale',
      sourceLabel: 'Last known GPS elevation',
      footerLabel: 'Showing last known elevation until GPS refreshes',
      currentElevationFt,
      currentElevationM,
      currentElevationLabel,
      lastUpdatedLabel: formatAgeLabel(gpsAgeMs),
      gpsAgeMs,
      gpsAccuracyM: input.gpsAccuracyM ?? null,
      routeName: activeRoute?.name ?? null,
      routeDistanceMiles,
      routeGainFt,
      routeGradePercent,
      hasRouteProfile,
      hasLiveElevation,
      isStale: true,
    };
  }

  if (hasRouteProfile) {
    return {
      status: 'route',
      badgeLabel: 'ROUTE PROFILE',
      modeLabel: 'Route',
      sourceLabel: 'Active route elevation profile',
      footerLabel: 'Route terrain profile available; live elevation unavailable',
      currentElevationFt: null,
      currentElevationM: null,
      currentElevationLabel: '--',
      lastUpdatedLabel: activeRoute?.updated_at ? `Route updated ${activeRoute.updated_at}` : 'Route timestamp unavailable',
      gpsAgeMs,
      gpsAccuracyM: input.gpsAccuracyM ?? null,
      routeName: activeRoute?.name ?? null,
      routeDistanceMiles,
      routeGainFt,
      routeGradePercent,
      hasRouteProfile,
      hasLiveElevation,
      isStale: false,
    };
  }

  return {
    status: 'unavailable',
    badgeLabel: 'ELEVATION PENDING',
    modeLabel: 'Waiting',
    sourceLabel: input.gpsHasFix ? 'GPS fix has no altitude' : 'No live GPS or route profile',
    footerLabel: input.gpsHasFix ? 'GPS fix active, altitude not provided' : 'Awaiting current GPS elevation or a route profile',
    currentElevationFt: null,
    currentElevationM: null,
    currentElevationLabel: '--',
    lastUpdatedLabel: 'Not updated yet',
    gpsAgeMs,
    gpsAccuracyM: input.gpsAccuracyM ?? null,
    routeName: activeRoute?.name ?? null,
    routeDistanceMiles,
    routeGainFt,
    routeGradePercent,
    hasRouteProfile,
    hasLiveElevation,
    isStale: false,
  };
}
