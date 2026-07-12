import type { ExpeditionReadinessAssessment } from './readiness/expeditionReadinessTypes';
import type { RouteCatalogSummary } from './routeDataContracts';
import type { SourceTruthPolicyKey, SourceTruthRef } from './sourceTruth';

export type SourceTruthBinding = {
  ref: SourceTruthRef;
  policyKey: SourceTruthPolicyKey;
  dependencies: string[];
};

export type WeatherSourceTruthAdapterInput = {
  id?: string | null;
  source?: string | null;
  authority?: string | null;
  provider?: string | null;
  observedAt?: string | null;
  retrievedAt?: string | number | null;
  expiresAt?: string | null;
  available?: boolean | null;
  stale?: boolean;
  hasCurrentConditions?: boolean;
  hasForecast?: boolean;
  locationStale?: boolean;
  providerLimited?: boolean;
  policyKey?: 'weather_observation' | 'weather_forecast';
};

export function buildReadinessAssessmentSourceTruthBinding(
  assessment: ExpeditionReadinessAssessment,
): SourceTruthBinding {
  const sourceRecords = Object.values(assessment.sourceFreshness);
  const hasMissing = sourceRecords.some((record) => record.isMissing);
  const hasStale = sourceRecords.some((record) => record.isStale);
  const hasMock = sourceRecords.some((record) => record.isMock);
  const hasDemo = sourceRecords.some((record) => record.isDemo);
  const hasInferred = sourceRecords.some((record) => record.isInferred);
  const hasUnmarkedSynthetic = assessment.dataIntegrity.unmarkedSyntheticData.length > 0;
  const warningCodes = [
    'readiness_assessment_inferred',
    hasMissing ? 'readiness_sources_missing' : null,
    hasStale ? 'readiness_sources_stale' : null,
    hasMock ? 'readiness_sources_mock' : null,
    hasDemo ? 'readiness_sources_demo' : null,
    hasInferred ? 'readiness_sources_inferred' : null,
    hasUnmarkedSynthetic ? 'readiness_unmarked_synthetic_data' : null,
  ].filter((value): value is string => Boolean(value));
  const degraded = assessment.confidence === 'low' ||
    hasMissing ||
    hasStale ||
    hasMock ||
    hasDemo ||
    hasInferred ||
    hasUnmarkedSynthetic;

  return {
    ref: {
      id: 'expedition-readiness-assessment',
      origin: 'inferred',
      authority: 'ECS Readiness Engine',
      provider: null,
      observedAt: assessment.updatedAt,
      fetchedAt: null,
      expiresAt: null,
      confidence: assessment.confidence,
      coverage: hasMissing ? 'partial' : 'complete',
      availability: degraded ? 'degraded' : 'usable',
      conflict: false,
      warningCodes,
    },
    policyKey: 'default',
    dependencies: [
      'Overall Expedition Readiness score, decision status, confidence, and explanation shown in this detail view.',
    ],
  };
}

export function buildWeatherSourceTruthBinding(
  input: WeatherSourceTruthAdapterInput,
): SourceTruthBinding {
  const source = String(input.source ?? '').trim().toLowerCase();
  const origin = source === 'cache' || source === 'cache_fresh' || source === 'cache_stale'
    ? 'cached'
    : source === 'live'
      ? 'live'
      : source === 'manual'
        ? 'manual'
        : source === 'estimated'
          ? 'estimated'
          : source === 'inferred'
            ? 'inferred'
            : source === 'mock' || source === 'demo' || source === 'fallback'
              ? source === 'fallback' ? 'unavailable' : 'simulated'
              : 'unavailable';
  const hasData = input.hasCurrentConditions === true || input.hasForecast === true;
  const unavailable = input.available === false || origin === 'unavailable' || !hasData;
  const warningCodes = [
    input.locationStale ? 'weather_location_stale' : null,
    input.providerLimited ? 'weather_provider_limited' : null,
    unavailable ? 'weather_data_unavailable' : null,
  ].filter((value): value is string => Boolean(value));

  return {
    ref: {
      id: input.id?.trim() || 'weather-intelligence',
      origin,
      authority: input.authority ?? null,
      provider: input.provider ?? 'ECS Weather Pipeline',
      observedAt: input.observedAt ?? null,
      fetchedAt: timestampToIso(input.retrievedAt),
      expiresAt: input.expiresAt ?? null,
      confidence: 'unknown',
      coverage: !hasData
        ? 'unknown'
        : input.hasCurrentConditions && input.hasForecast
          ? 'complete'
          : 'partial',
      availability: unavailable ? 'unavailable' : input.stale ? 'degraded' : 'usable',
      conflict: false,
      warningCodes,
    },
    policyKey: input.policyKey ?? 'weather_observation',
    dependencies: [
      'Current conditions, forecast, and trail-weather status shown in this Weather panel.',
    ],
  };
}

export function buildRouteCatalogSourceTruthBinding(
  summary: RouteCatalogSummary,
): SourceTruthBinding {
  const authority = summary.sourceType === 'official'
    ? 'Official route source'
    : summary.sourceType === 'community'
      ? 'Community route source'
      : summary.sourceType === 'imported'
        ? 'Imported route source'
        : 'ECS route preview';
  const warningCodes = [
    'route_catalog_summary_only',
    'route_legal_status_unverified',
    summary.sourceType === 'preview' ? 'route_catalog_preview_unverified' : null,
    summary.sourceType === 'community' ? 'route_catalog_community_source' : null,
    summary.sourceType === 'imported' ? 'route_catalog_imported_source' : null,
  ].filter((value): value is string => Boolean(value));

  return {
    ref: {
      id: summary.routeId,
      origin: 'inferred',
      authority,
      provider: 'ECS Route Catalog',
      observedAt: summary.updatedAt,
      fetchedAt: null,
      expiresAt: null,
      confidence: 'unknown',
      coverage: summary.sourceType === 'preview' ? 'partial' : 'unknown',
      availability: summary.sourceType === 'preview' ? 'degraded' : 'usable',
      conflict: false,
      warningCodes,
    },
    policyKey: 'route_legal_access_evidence',
    dependencies: [
      'The route source label and summary metadata shown before preview or guidance handoff.',
    ],
  };
}

function timestampToIso(value: string | number | null | undefined): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : value.trim();
}
