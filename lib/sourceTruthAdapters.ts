import type { ExpeditionReadinessAssessment } from './readiness/expeditionReadinessTypes';
import type { RouteCatalogSummary } from './routeDataContracts';
import type { FleetWeightResult, FleetWeightValue } from './fleet/fleetPremiumDomain';
import type { EstablishedCampground } from './map/establishedCampgrounds';
import type { EstablishedCampsite } from './map/establishedCampsiteTypes';
import type {
  SourceTruthAuthorityKind,
  SourceTruthConfidence,
  SourceTruthOrigin,
  SourceTruthPolicyKey,
  SourceTruthRef,
} from './sourceTruth';

export type SourceTruthBinding = {
  ref: SourceTruthRef;
  sources: SourceTruthRef[];
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

export type RouteCampAccessSourceTruthAdapterInput = {
  id: string;
  authority?: string | null;
  authorityKind?: SourceTruthAuthorityKind;
  provider?: string | null;
  legalAccessVerified?: boolean | null;
  legalObservedAt?: string | null;
  currentConditionsKnown?: boolean | null;
  conditionsObservedAt?: string | null;
  passabilityKnown?: boolean | null;
  passabilityObservedAt?: string | null;
  availabilityKnown?: boolean | null;
  availabilityObservedAt?: string | null;
  availabilityExpiresAt?: string | null;
  confidence?: SourceTruthConfidence;
  conflict?: boolean;
};

export type ConvoyLocationSourceTruthAdapterInput = {
  memberId: string;
  sourceLabel?: string | null;
  observedAt?: string | number | null;
  accuracyMeters?: number | null;
  stale?: boolean;
  offline?: boolean;
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

  const ref: SourceTruthRef = {
      id: 'expedition-readiness-assessment',
      origin: 'inferred',
      role: 'primary',
      policyKey: 'default',
      authority: 'ECS Readiness Engine',
      authorityKind: 'ecs',
      provider: null,
      observedAt: assessment.updatedAt,
      fetchedAt: null,
      expiresAt: null,
      confidence: assessment.confidence,
      coverage: hasMissing ? 'partial' : 'complete',
      availability: degraded ? 'degraded' : 'usable',
      conflictState: 'none',
      conflict: false,
      warningCodes,
    };
  return {
    ref,
    sources: [ref],
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

  const policyKey = input.policyKey ?? 'weather_observation';
  const cachedRef: SourceTruthRef = {
      id: input.id?.trim() || 'weather-intelligence',
      origin,
      role: origin === 'cached' ? 'last_good' : 'primary',
      policyKey,
      authority: input.authority ?? null,
      authorityKind: input.authority ? 'provider' : 'ecs',
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
      conflictState: 'none',
      conflict: false,
      warningCodes,
    };
  const liveUnavailableRef: SourceTruthRef | null = input.providerLimited && origin === 'cached'
    ? {
        id: `${cachedRef.id}-live`,
        origin: 'live',
        role: 'primary',
        policyKey,
        authority: input.authority ?? null,
        authorityKind: input.authority ? 'provider' : 'ecs',
        provider: input.provider ?? 'ECS Weather Pipeline',
        observedAt: null,
        fetchedAt: timestampToIso(input.retrievedAt),
        expiresAt: null,
        confidence: 'unknown',
        coverage: 'unknown',
        availability: 'unavailable',
        conflictState: 'none',
        conflict: false,
        warningCodes: ['weather_provider_limited', 'weather_data_unavailable'],
      }
    : null;
  return {
    ref: cachedRef,
    sources: liveUnavailableRef ? [liveUnavailableRef, cachedRef] : [cachedRef],
    policyKey,
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

  const ref: SourceTruthRef = {
      id: summary.routeId,
      origin: 'inferred',
      role: 'primary',
      policyKey: 'route_legal_access_evidence',
      authority,
      authorityKind: summary.sourceType === 'official'
        ? 'official'
        : summary.sourceType === 'community'
          ? 'community'
          : 'ecs',
      provider: 'ECS Route Catalog',
      observedAt: summary.updatedAt,
      fetchedAt: null,
      expiresAt: null,
      confidence: 'unknown',
      coverage: summary.sourceType === 'preview' ? 'partial' : 'unknown',
      availability: summary.sourceType === 'preview' ? 'degraded' : 'usable',
      conflictState: 'none',
      conflict: false,
      warningCodes,
    };
  return {
    ref,
    sources: [ref],
    policyKey: 'route_legal_access_evidence',
    dependencies: [
      'The route source label and summary metadata shown before preview or guidance handoff.',
    ],
  };
}

export function buildFleetWeightSourceTruthBinding(input: {
  vehicleId: string;
  vehicleName?: string | null;
  updatedAt?: string | null;
  weightResult: FleetWeightResult;
}): SourceTruthBinding {
  const values = [input.weightResult.baseNetWeight, input.weightResult.gvwr].filter(
    (value): value is FleetWeightValue => Boolean(value),
  );
  const sources = values.map((value, index) => fleetWeightValueToSourceTruthRef({
    id: `${input.vehicleId}-${index === 0 ? 'base-weight' : 'gvwr'}`,
    value,
    updatedAt: input.updatedAt,
    role: index === 0 ? 'primary' : 'supporting',
  }));
  if (sources.length === 0) {
    sources.push(fleetWeightValueToSourceTruthRef({
      id: `${input.vehicleId}-weight-unavailable`,
      value: null,
      updatedAt: input.updatedAt,
      role: 'primary',
    }));
  }

  return {
    ref: sources[0],
    sources,
    policyKey: 'vehicle_profile',
    dependencies: [
      `${input.vehicleName?.trim() || 'Active vehicle'} payload, GVWR usage, and Fleet confidence calculations.`,
    ],
  };
}

export function buildRouteCampAccessSourceTruthBinding(
  input: RouteCampAccessSourceTruthAdapterInput,
): SourceTruthBinding {
  const authority = input.authority ?? null;
  const authorityKind = input.authorityKind ?? (authority ? 'provider' : 'unknown');
  const provider = input.provider ?? null;
  const confidence = input.confidence ?? 'unknown';
  const conflictState = input.conflict ? 'present' : 'none';
  const legalRef = evidenceRef({
    id: `${input.id}-legal-access`,
    policyKey: 'route_legal_access_evidence',
    authority,
    authorityKind,
    provider,
    observedAt: input.legalObservedAt,
    known: input.legalAccessVerified === true,
    confidence,
    conflictState,
    unknownWarning: 'legal_verification_unknown',
  });
  const conditionRef = evidenceRef({
    id: `${input.id}-current-conditions`,
    policyKey: 'condition_closure_advisory',
    authority,
    authorityKind,
    provider,
    observedAt: input.conditionsObservedAt,
    known: input.currentConditionsKnown === true,
    confidence,
    conflictState,
    unknownWarning: 'current_conditions_unknown',
  });
  const passabilityRef = evidenceRef({
    id: `${input.id}-passability`,
    policyKey: 'condition_closure_advisory',
    authority,
    authorityKind,
    provider,
    observedAt: input.passabilityObservedAt,
    known: input.passabilityKnown === true,
    confidence,
    conflictState,
    unknownWarning: 'passability_unknown',
  });
  const availabilityRef = evidenceRef({
    id: `${input.id}-availability`,
    policyKey: 'camp_provider_availability',
    authority,
    authorityKind,
    provider,
    observedAt: input.availabilityObservedAt,
    expiresAt: input.availabilityExpiresAt,
    known: input.availabilityKnown === true,
    confidence,
    conflictState,
    unknownWarning: 'camp_availability_unknown',
  });
  const sources = [legalRef, conditionRef, passabilityRef, availabilityRef];
  return {
    ref: legalRef,
    sources,
    policyKey: 'route_legal_access_evidence',
    dependencies: [
      'Legal-access evidence, current conditions, passability, and campground availability remain separate.',
    ],
  };
}

export function buildEstablishedCampgroundSourceTruthBinding(
  campground: EstablishedCampground | EstablishedCampsite,
): SourceTruthBinding {
  const fallbackProvider = 'source' in campground ? campground.source : null;
  const provider = (campground.primaryProvider ?? fallbackProvider)?.toUpperCase() ?? null;
  const authority = campground.managingAgency ?? campground.managingOrg ?? campground.attribution;
  const confidence = confidenceFromScore(campground.sourceConfidence);
  const statusKnown = !['', 'unknown', 'verify'].includes(String(campground.status ?? '').toLowerCase());
  const availabilityKnown = !['', 'unknown'].includes(String(campground.availabilityStatus ?? '').toLowerCase());
  return buildRouteCampAccessSourceTruthBinding({
    id: campground.id,
    authority,
    authorityKind: campground.managingAgency ? 'official' : provider ? 'provider' : 'unknown',
    provider,
    legalAccessVerified: null,
    legalObservedAt: campground.lastVerifiedAt,
    currentConditionsKnown: statusKnown,
    conditionsObservedAt: campground.lastVerifiedAt ?? campground.lastSyncedAt,
    passabilityKnown: null,
    passabilityObservedAt: null,
    availabilityKnown,
    availabilityObservedAt: campground.lastAvailabilityCheckedAt ?? campground.lastSyncedAt,
    confidence,
  });
}

export function buildConvoyLocationSourceTruthBinding(
  input: ConvoyLocationSourceTruthAdapterInput,
): SourceTruthBinding {
  const observedAt = timestampToIso(input.observedAt);
  const sourceText = String(input.sourceLabel ?? '').trim().toLowerCase();
  const cached = input.offline === true || sourceText.includes('cache') || sourceText.includes('last known');
  const unavailable = !observedAt;
  const accuracy = Number(input.accuracyMeters);
  const confidence: SourceTruthConfidence = Number.isFinite(accuracy)
    ? accuracy <= 25 ? 'high' : accuracy <= 100 ? 'medium' : 'low'
    : 'unknown';
  const ref: SourceTruthRef = {
    id: `${input.memberId}-convoy-location`,
    origin: unavailable ? 'unavailable' : cached ? 'cached' : 'live',
    role: cached ? 'last_good' : 'primary',
    policyKey: 'convoy_member_location',
    authority: cached ? 'Last known member location' : 'Member GPS device',
    authorityKind: 'device',
    provider: input.sourceLabel ?? 'ECS Convoy Location',
    observedAt,
    fetchedAt: null,
    expiresAt: null,
    confidence,
    coverage: unavailable ? 'unknown' : 'complete',
    availability: unavailable ? 'unavailable' : input.stale || input.offline ? 'degraded' : 'usable',
    conflictState: 'none',
    conflict: false,
    warningCodes: [
      input.stale ? 'convoy_location_stale' : null,
      input.offline ? 'convoy_member_offline' : null,
    ].filter((value): value is string => Boolean(value)),
  };
  return {
    ref,
    sources: [ref],
    policyKey: 'convoy_member_location',
    dependencies: ['Selected convoy member position and freshness shown on Navigate.'],
  };
}

function fleetWeightValueToSourceTruthRef(input: {
  id: string;
  value: FleetWeightValue | null;
  updatedAt?: string | null;
  role: 'primary' | 'supporting';
}): SourceTruthRef {
  const source = input.value?.source ?? 'unknown';
  const origin: SourceTruthOrigin = source === 'scale_ticket' || source === 'user_estimate'
    ? 'manual'
    : source === 'ecs_default'
      ? 'estimated'
      : source === 'calculated'
        ? 'inferred'
        : source === 'unknown'
          ? 'unavailable'
          : 'cached';
  const authorityKind: SourceTruthAuthorityKind = source === 'scale_ticket'
    ? 'verified_document'
    : source === 'vin_oem_match' || source === 'manufacturer_spec' || source === 'exact_build_match'
      ? 'official'
      : source === 'user_estimate'
        ? 'user'
        : source === 'ecs_default' || source === 'calculated'
          ? 'ecs'
          : 'unknown';
  const confidence = confidenceFromScore(input.value?.confidence);
  return {
    id: input.id,
    origin,
    role: input.role,
    policyKey: 'vehicle_profile',
    authority: input.value?.sourceLabel ?? fleetWeightAuthorityLabel(source),
    authorityKind,
    provider: authorityKind === 'ecs' ? 'ECS Fleet' : null,
    observedAt: input.value?.verifiedAt ?? input.updatedAt ?? null,
    fetchedAt: null,
    expiresAt: null,
    confidence,
    coverage: input.value ? 'complete' : 'unknown',
    availability: input.value ? (confidence === 'low' ? 'degraded' : 'usable') : 'unavailable',
    conflictState: 'none',
    conflict: false,
    warningCodes: [
      origin === 'estimated' ? 'fleet_weight_estimated' : null,
      origin === 'manual' ? 'fleet_weight_manual' : null,
      !input.value ? 'fleet_weight_missing' : null,
    ].filter((value): value is string => Boolean(value)),
  };
}

function evidenceRef(input: {
  id: string;
  policyKey: SourceTruthPolicyKey;
  authority: string | null;
  authorityKind: SourceTruthAuthorityKind;
  provider: string | null;
  observedAt?: string | null;
  expiresAt?: string | null;
  known: boolean;
  confidence: SourceTruthConfidence;
  conflictState: 'none' | 'present';
  unknownWarning: string;
}): SourceTruthRef {
  return {
    id: input.id,
    origin: input.known ? 'cached' : 'unavailable',
    role: input.id.endsWith('legal-access') ? 'primary' : 'supporting',
    policyKey: input.policyKey,
    authority: input.authority,
    authorityKind: input.authorityKind,
    provider: input.provider,
    observedAt: input.observedAt ?? null,
    fetchedAt: null,
    expiresAt: input.expiresAt ?? null,
    confidence: input.known ? input.confidence : 'unknown',
    coverage: input.known ? 'complete' : 'unknown',
    availability: input.known ? 'usable' : 'unavailable',
    conflictState: input.conflictState,
    conflict: input.conflictState === 'present',
    warningCodes: input.known ? [] : [input.unknownWarning],
  };
}

function confidenceFromScore(value: number | null | undefined): SourceTruthConfidence {
  const score = Number(value);
  if (!Number.isFinite(score)) return 'unknown';
  if (score >= 85) return 'high';
  if (score >= 65) return 'medium';
  return 'low';
}

function fleetWeightAuthorityLabel(source: FleetWeightValue['source']): string {
  if (source === 'scale_ticket') return 'Verified scale ticket';
  if (source === 'vin_oem_match') return 'VIN and OEM match';
  if (source === 'manufacturer_spec') return 'Manufacturer specification';
  if (source === 'exact_build_match') return 'Exact vehicle build match';
  if (source === 'ecs_default') return 'ECS vehicle-class estimate';
  if (source === 'user_estimate') return 'Owner estimate';
  if (source === 'calculated') return 'ECS deterministic calculation';
  return 'Unknown weight source';
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
