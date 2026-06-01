import type { ECSWeatherSnapshot } from './ecsWeather';
import type { ECSBriefSeverity } from './ai/ecsBriefTypes';

export type SharedWeatherAdvisoryKind =
  | 'severe_alert'
  | 'high_wind'
  | 'heavy_precipitation'
  | 'freezing_conditions'
  | 'heat_risk'
  | 'visibility_risk'
  | 'storm_condition';

export type SharedWeatherFreshnessLabel = 'live' | 'cached' | 'stale';

export type SharedWeatherBriefAdvisory = {
  advisoryKey: string;
  kind: SharedWeatherAdvisoryKind;
  severity: ECSBriefSeverity;
  title: string;
  message: string;
  recommendedAction: string;
  confidence: number;
  freshness: SharedWeatherFreshnessLabel;
  locationKey: string;
  expiresAt?: number;
};

const MAX_SHARED_WEATHER_ADVISORIES = 3;
const HIGH_WIND_WARNING_MPH = 35;
const HIGH_WIND_WATCH_MPH = 25;
const HEAVY_PRECIP_CHANCE_PERCENT = 70;
const FREEZING_TEMP_F = 32;
const HARD_FREEZE_TEMP_F = 20;
const HEAT_WATCH_TEMP_F = 90;
const HEAT_WARNING_TEMP_F = 100;
const VISIBILITY_WARNING_METERS = 1600;
const VISIBILITY_WATCH_METERS = 5000;

const SEVERITY_RANK: Record<ECSBriefSeverity, number> = {
  info: 0,
  watch: 1,
  warning: 2,
  critical: 3,
};

function safeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cleanText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizePercent(value: unknown): number | null {
  const numeric = safeNumber(value);
  if (numeric == null) return null;
  if (numeric > 0 && numeric <= 1) return numeric * 100;
  return numeric;
}

function getFreshnessLabel(snapshot: ECSWeatherSnapshot): SharedWeatherFreshnessLabel {
  if (
    snapshot.status.stale ||
    snapshot.location.stale ||
    snapshot.status.kind === 'stale' ||
    snapshot.status.source === 'cache_stale' ||
    snapshot.status.freshness === 'stale' ||
    snapshot.status.freshness === 'very_stale'
  ) {
    return 'stale';
  }
  if (snapshot.status.source === 'cache_fresh' || snapshot.status.kind === 'cached') {
    return 'cached';
  }
  return 'live';
}

function capStaleSeverity(
  severity: ECSBriefSeverity,
  freshness: SharedWeatherFreshnessLabel,
): ECSBriefSeverity {
  if (freshness !== 'stale') return severity;
  return SEVERITY_RANK[severity] > SEVERITY_RANK.watch ? 'watch' : severity;
}

function locationKey(snapshot: ECSWeatherSnapshot): string {
  const lat = safeNumber(snapshot.location.lat ?? snapshot.raw?.lat);
  const lng = safeNumber(snapshot.location.lng ?? snapshot.raw?.lng);
  if (lat != null && lng != null) {
    return `${lat.toFixed(3)},${lng.toFixed(3)}`;
  }
  return cleanText(snapshot.locationName || snapshot.location.label || 'weather-location')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'weather-location';
}

function hasWeatherData(snapshot: ECSWeatherSnapshot): boolean {
  return Boolean(
    snapshot.alerts.length ||
    snapshot.daily.length ||
    snapshot.hourly.length ||
    snapshot.raw ||
    safeNumber(snapshot.current.temp) != null ||
    safeNumber(snapshot.current.windSpeed) != null ||
    cleanText(snapshot.current.condition || snapshot.current.description),
  );
}

function getConditionText(snapshot: ECSWeatherSnapshot): string {
  return [
    snapshot.current.condition,
    snapshot.current.description,
    snapshot.normalized.current?.condition,
    snapshot.raw?.current?.weather_main,
    snapshot.raw?.current?.weather_description,
  ].map(cleanText).filter(Boolean).join(' ');
}

function buildMessage(params: {
  freshness: SharedWeatherFreshnessLabel;
  locationName: string;
  detail: string;
}): string {
  const prefix = params.freshness === 'stale'
    ? 'Stale weather advisory'
    : 'Weather advisory';
  return `${prefix}: Forecast indicates ${params.detail} near ${params.locationName}. Monitor conditions.`;
}

function buildRecommendedAction(freshness: SharedWeatherFreshnessLabel): string {
  const sourceLine = `Source freshness: ${freshness}.`;
  if (freshness === 'stale') {
    return `${sourceLine} ECS recommends reassessment before committing to the route or field action.`;
  }
  return `${sourceLine} ECS recommends reassessment if conditions trend worse.`;
}

function createAdvisory(args: {
  snapshot: ECSWeatherSnapshot;
  kind: SharedWeatherAdvisoryKind;
  severity: ECSBriefSeverity;
  detail: string;
  title?: string;
  expiresAt?: number;
}): SharedWeatherBriefAdvisory {
  const freshness = getFreshnessLabel(args.snapshot);
  const scopedLocationKey = locationKey(args.snapshot);
  const severity = capStaleSeverity(args.severity, freshness);
  const locationName = cleanText(args.snapshot.locationName || args.snapshot.location.label) || 'current position';
  return {
    advisoryKey: ['shared-weather', args.kind, severity, scopedLocationKey].join('|'),
    kind: args.kind,
    severity,
    title: args.title ?? 'WEATHER ADVISORY',
    message: buildMessage({
      freshness,
      locationName,
      detail: args.detail,
    }),
    recommendedAction: buildRecommendedAction(freshness),
    confidence: Number(Math.max(0.45, Math.min(0.95, args.snapshot.locationConfidence || 0.72)).toFixed(2)),
    freshness,
    locationKey: scopedLocationKey,
    expiresAt: args.expiresAt,
  };
}

function alertSeverity(value: string | null | undefined): ECSBriefSeverity | null {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized.includes('extreme') || normalized.includes('critical') || normalized.includes('severe')) {
    return 'critical';
  }
  if (normalized.includes('warning')) return 'warning';
  if (normalized.includes('watch') || normalized.includes('advisory')) return 'watch';
  return null;
}

function parseExpiresAt(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function buildSharedWeatherBriefAdvisories(
  snapshot: ECSWeatherSnapshot | null | undefined,
): SharedWeatherBriefAdvisory[] {
  if (!snapshot || !hasWeatherData(snapshot)) return [];

  const advisories: SharedWeatherBriefAdvisory[] = [];
  const conditionText = getConditionText(snapshot);
  const conditionLower = conditionText.toLowerCase();
  const windMph = safeNumber(snapshot.current.windGust) ?? safeNumber(snapshot.current.windSpeed);
  const tempF = safeNumber(snapshot.current.feelsLike) ?? safeNumber(snapshot.current.temp);
  const visibilityMeters = safeNumber(snapshot.current.visibility);
  const precipChance = normalizePercent(snapshot.current.precipChance ?? snapshot.normalized.current?.precipitationChance);

  const seenAlerts = new Set<string>();
  for (const alert of snapshot.alerts) {
    const severity = alertSeverity(alert.severity);
    if (!severity) continue;
    const alertTitle = cleanText(alert.title || alert.type || 'Weather alert');
    const key = [alertTitle.toLowerCase(), alert.severity, alert.effective, alert.expires].join('|');
    if (seenAlerts.has(key)) continue;
    seenAlerts.add(key);
    advisories.push(createAdvisory({
      snapshot,
      kind: 'severe_alert',
      severity,
      title: 'WEATHER ADVISORY',
      detail: alertTitle,
      expiresAt: parseExpiresAt(alert.expires),
    }));
  }

  if (windMph != null && windMph >= HIGH_WIND_WATCH_MPH) {
    advisories.push(createAdvisory({
      snapshot,
      kind: 'high_wind',
      severity: windMph >= HIGH_WIND_WARNING_MPH ? 'warning' : 'watch',
      detail: `${Math.round(windMph)} mph wind`,
    }));
  }

  if (precipChance != null && precipChance >= HEAVY_PRECIP_CHANCE_PERCENT) {
    advisories.push(createAdvisory({
      snapshot,
      kind: 'heavy_precipitation',
      severity: 'watch',
      detail: `${Math.round(precipChance)}% precipitation potential`,
    }));
  }

  if (tempF != null && tempF <= FREEZING_TEMP_F) {
    advisories.push(createAdvisory({
      snapshot,
      kind: 'freezing_conditions',
      severity: tempF <= HARD_FREEZE_TEMP_F ? 'warning' : 'watch',
      detail: `${Math.round(tempF)}F freezing conditions`,
    }));
  }

  if (tempF != null && tempF >= HEAT_WATCH_TEMP_F) {
    advisories.push(createAdvisory({
      snapshot,
      kind: 'heat_risk',
      severity: tempF >= HEAT_WARNING_TEMP_F ? 'warning' : 'watch',
      detail: `${Math.round(tempF)}F heat exposure`,
    }));
  }

  if (
    (visibilityMeters != null && visibilityMeters <= VISIBILITY_WATCH_METERS) ||
    /\b(fog|mist|haze|smoke)\b/.test(conditionLower)
  ) {
    const severity = visibilityMeters != null && visibilityMeters <= VISIBILITY_WARNING_METERS
      ? 'warning'
      : 'watch';
    const detail = visibilityMeters != null
      ? `${(visibilityMeters / 1609.344).toFixed(1)} mi visibility`
      : `${conditionText || 'reduced visibility'}`;
    advisories.push(createAdvisory({
      snapshot,
      kind: 'visibility_risk',
      severity,
      detail,
    }));
  }

  if (/\b(thunder|lightning|storm)\b/.test(conditionLower)) {
    advisories.push(createAdvisory({
      snapshot,
      kind: 'storm_condition',
      severity: 'warning',
      detail: conditionText || 'storm conditions',
    }));
  }

  const byKey = new Map<string, SharedWeatherBriefAdvisory>();
  for (const advisory of advisories) {
    const previous = byKey.get(advisory.advisoryKey);
    if (!previous || SEVERITY_RANK[advisory.severity] > SEVERITY_RANK[previous.severity]) {
      byKey.set(advisory.advisoryKey, advisory);
    }
  }

  return Array.from(byKey.values())
    .sort((left, right) => {
      const severityDelta = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
      if (severityDelta !== 0) return severityDelta;
      return left.kind.localeCompare(right.kind);
    })
    .slice(0, MAX_SHARED_WEATHER_ADVISORIES);
}
