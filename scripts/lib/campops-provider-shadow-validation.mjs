export const REGION_001_LABEL = 'Region 001 - Northern Nevada controlled provider shadow cell';
export const REGION_001_COHORT = 'internal-shadow-validation-region-001';

export const REQUIRED_PROVIDER_CATEGORIES = [
  'legal/access',
  'closure/seasonal restriction',
  'fire restriction',
  'weather',
  'service/resupply',
];

const UNKNOWN_RATE = '100%';
const ZERO_RATE = '0%';

function numberValue(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function isoOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function dateAgeDays(value, now) {
  const iso = isoOrNull(value);
  if (!iso) return null;
  return Math.max(0, (now.getTime() - new Date(iso).getTime()) / 86_400_000);
}

function percent(numerator, denominator) {
  if (!denominator || denominator <= 0) return ZERO_RATE;
  const value = Math.max(0, Math.min(100, (numberValue(numerator) / numberValue(denominator)) * 100));
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}%`;
}

function bandFromPercent(rateText, { high = 80, medium = 40 } = {}) {
  const value = numberValue(String(rateText).replace('%', ''), 0);
  if (value >= high) return 'high';
  if (value >= medium) return 'medium';
  if (value > 0) return 'low';
  return 'none';
}

function freshnessBand(latestAt, now, freshDays = 45) {
  const age = dateAgeDays(latestAt, now);
  if (age == null) return 'unknown';
  if (age <= freshDays) return 'fresh';
  if (age <= freshDays * 2) return 'mixed';
  return 'stale';
}

function sourceIds(rows, fallback) {
  const ids = new Set();
  for (const row of Array.isArray(rows) ? rows : []) {
    const providerId = row?.provider_id ?? row?.providerId;
    if (typeof providerId !== 'string' || !providerId.trim()) continue;
    ids.add(providerId.trim().replace(/[^a-zA-Z0-9_.:-]+/g, '_').slice(0, 96));
    if (ids.size >= 6) break;
  }
  return ids.size > 0 ? Array.from(ids) : [fallback];
}

function sourceLabel(rows, fallback) {
  const ids = sourceIds(rows, fallback).filter((item) => item && item !== 'none observed');
  return ids.length > 0 ? ids.join(', ') : fallback;
}

function baseCategory({
  category,
  realShadowStatus,
  providerSources,
  candidateCount = 0,
  coveredCandidateCount = 0,
  coverageRate = ZERO_RATE,
  coverageBand = 'none',
  freshnessRate = 'unknown',
  freshnessBandValue = 'unknown',
  unknownRate = UNKNOWN_RATE,
  staleRate = ZERO_RATE,
  conflictRate = ZERO_RATE,
  latestObservedAt = null,
  oldestObservedAt = null,
  blockers = [],
  summary,
}) {
  return {
    category,
    realShadowStatus,
    providerSources,
    providerSource: providerSources.join(', '),
    candidateCount,
    coveredCandidateCount,
    coverageRate,
    coverageBand,
    freshnessRate,
    freshnessBand: freshnessBandValue,
    unknownRate,
    staleRate,
    conflictRate,
    latestObservedAt,
    oldestObservedAt,
    sourceTransparencyBehavior: 'Unknown, stale, missing, and conflicting provider signals remain visible and cannot imply safety, legality, access, availability, or service status.',
    acceptedForInfluence: false,
    providerInfluenceAllowed: false,
    providerOutputAppliedToRecommendations: false,
    blockers,
    summary,
  };
}

function legalAccessCategory(aggregate, now) {
  const route = aggregate.routeRollup ?? {};
  const candidateCount = numberValue(route.candidate_count);
  const coveredCandidateCount = numberValue(route.legal_access_covered_count);
  const coverageRate = percent(coveredCandidateCount, candidateCount);
  const sources = sourceIds(
    (aggregate.routeSources ?? []).filter((row) =>
      /official_access|land|access/i.test(`${row?.authority ?? ''} ${row?.source_type ?? ''}`),
    ),
    coveredCandidateCount > 0 ? 'verified_route_catalog' : 'none observed',
  );
  const status = candidateCount > 0 && coveredCandidateCount > 0
    ? 'shadow_validated'
    : 'missing_live_records';

  return baseCategory({
    category: 'legal/access',
    realShadowStatus: status,
    providerSources: sources,
    candidateCount,
    coveredCandidateCount,
    coverageRate,
    coverageBand: bandFromPercent(coverageRate),
    freshnessRate: freshnessBand(route.latest_verified_at, now),
    freshnessBandValue: freshnessBand(route.latest_verified_at, now),
    unknownRate: candidateCount > 0 ? percent(route.legal_access_unknown_count, candidateCount) : UNKNOWN_RATE,
    staleRate: candidateCount > 0 ? percent(route.stale_candidate_count, candidateCount) : ZERO_RATE,
    conflictRate: candidateCount > 0 ? percent(route.legal_access_conflict_count, candidateCount) : ZERO_RATE,
    latestObservedAt: isoOrNull(route.latest_verified_at),
    oldestObservedAt: isoOrNull(route.oldest_verified_at),
    blockers: status === 'shadow_validated' ? [] : ['no_region_001_legal_access_records'],
    summary: status === 'shadow_validated'
      ? 'Live route-catalog provider aggregates observed legal/access coverage in shadow mode only.'
      : 'No live legal/access provider-backed Region 001 route records were observed.',
  });
}

function closureCategory(aggregate, now) {
  const route = aggregate.routeRollup ?? {};
  const candidateCount = numberValue(route.candidate_count);
  const coveredCandidateCount = numberValue(route.closure_covered_count);
  const coverageRate = percent(coveredCandidateCount, candidateCount);
  const closureSources = Array.isArray(aggregate.routeClosureRollup?.providers)
    ? aggregate.routeClosureRollup.providers
    : [];
  const sources = sourceIds(
    closureSources.length > 0 ? closureSources : aggregate.routeSources,
    coveredCandidateCount > 0 ? 'verified_route_catalog' : 'none observed',
  );
  const status = candidateCount > 0 && coveredCandidateCount > 0
    ? 'shadow_validated'
    : 'missing_live_records';

  return baseCategory({
    category: 'closure/seasonal restriction',
    realShadowStatus: status,
    providerSources: sources,
    candidateCount,
    coveredCandidateCount,
    coverageRate,
    coverageBand: bandFromPercent(coverageRate),
    freshnessRate: freshnessBand(route.latest_verified_at, now),
    freshnessBandValue: freshnessBand(route.latest_verified_at, now),
    unknownRate: candidateCount > 0 ? percent(Math.max(0, candidateCount - coveredCandidateCount), candidateCount) : UNKNOWN_RATE,
    staleRate: candidateCount > 0 ? percent(route.stale_candidate_count, candidateCount) : ZERO_RATE,
    conflictRate: ZERO_RATE,
    latestObservedAt: isoOrNull(route.latest_verified_at),
    oldestObservedAt: isoOrNull(route.oldest_verified_at),
    blockers: status === 'shadow_validated' ? [] : ['no_region_001_closure_records'],
    summary: status === 'shadow_validated'
      ? 'Live route-catalog aggregates observed closure/seasonal restriction signals in shadow mode only.'
      : 'No live closure/seasonal restriction provider-backed Region 001 records were observed.',
  });
}

function missingPersistedCategory(category) {
  return baseCategory({
    category,
    realShadowStatus: 'missing_live_persisted_evidence',
    providerSources: ['none observed'],
    coverageRate: ZERO_RATE,
    coverageBand: 'none',
    freshnessRate: 'unknown',
    freshnessBandValue: 'unknown',
    unknownRate: UNKNOWN_RATE,
    staleRate: ZERO_RATE,
    conflictRate: ZERO_RATE,
    blockers: [`no_region_001_${category.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').toLowerCase()}_persisted_records`],
    summary: `No persisted live ${category} provider evidence was observed for Region 001. Edge-function or external probe output must be captured separately before influence review.`,
  });
}

function serviceResupplyCategory(aggregate, now) {
  const campground = aggregate.campgroundRollup ?? {};
  const availability = aggregate.availabilityRollup ?? {};
  const candidateCount = numberValue(campground.candidate_count);
  const coveredCandidateCount = numberValue(campground.provider_backed_count);
  const coverageRate = percent(coveredCandidateCount, candidateCount);
  const status = candidateCount > 0 && coveredCandidateCount > 0
    ? 'shadow_validated'
    : 'missing_live_records';
  const latestObservedAt = campground.latest_service_checked_at ?? availability.latest_availability_checked_at;
  const providerRows = (aggregate.campgroundByProvider?.length ? aggregate.campgroundByProvider : aggregate.sourceRecordRollup) ?? [];
  const freshness = freshnessBand(latestObservedAt, now, 14);

  return baseCategory({
    category: 'service/resupply',
    realShadowStatus: status,
    providerSources: status === 'shadow_validated' ? sourceIds(providerRows, 'campgrounds') : ['none observed'],
    candidateCount,
    coveredCandidateCount,
    coverageRate,
    coverageBand: bandFromPercent(coverageRate),
    freshnessRate: freshness,
    freshnessBandValue: freshness,
    unknownRate: candidateCount > 0
      ? percent(numberValue(campground.unknown_status_count) + Math.max(0, candidateCount - coveredCandidateCount), candidateCount)
      : UNKNOWN_RATE,
    staleRate: candidateCount > 0 ? percent(campground.stale_canonical_count, candidateCount) : ZERO_RATE,
    conflictRate: ZERO_RATE,
    latestObservedAt: isoOrNull(latestObservedAt),
    oldestObservedAt: isoOrNull(campground.oldest_service_checked_at ?? availability.oldest_availability_checked_at),
    blockers: status === 'shadow_validated' ? [] : ['no_region_001_service_or_resupply_records'],
    summary: status === 'shadow_validated'
      ? 'Live established campground/service aggregates were observed for Region 001 in shadow mode only.'
      : 'No live service/resupply campground or availability records were observed inside the Region 001 mask.',
  });
}

function collectBlockers(categories, aggregate) {
  const blockers = [];
  for (const category of Object.values(categories)) {
    blockers.push(...category.blockers.map((blocker) => `${category.category}:${blocker}`));
  }
  if (Array.isArray(aggregate.readLimitations) && aggregate.readLimitations.length > 0) {
    blockers.push('supabase_read_limitations_present');
  }
  return blockers;
}

export function buildCampOpsProviderShadowEvidence({
  generatedAt = new Date().toISOString(),
  regionLabel = REGION_001_LABEL,
  releaseCohortLabel = REGION_001_COHORT,
  projectRef = null,
  sourceAggregate = {},
} = {}) {
  const now = new Date(generatedAt);
  const safeProjectRef = typeof projectRef === 'string' && projectRef.trim()
    ? projectRef.trim().replace(/[^a-z0-9-]/gi, '').slice(0, 64)
    : null;
  const categories = {
    'legal/access': legalAccessCategory(sourceAggregate, now),
    'closure/seasonal restriction': closureCategory(sourceAggregate, now),
    'fire restriction': missingPersistedCategory('fire restriction'),
    weather: missingPersistedCategory('weather'),
    'service/resupply': serviceResupplyCategory(sourceAggregate, now),
  };

  const categoryValues = Object.values(categories);
  return {
    schemaVersion: 'campops-provider-shadow-region-001/v1',
    system: 'campops_provider_shadow_validation',
    generatedAt: now.toISOString(),
    generatedBy: 'scripts/run-campops-provider-shadow-validation-region-001.mjs',
    regionLabel,
    releaseCohortLabel,
    validationMode: 'real-shadow',
    source: 'active_supabase_project_aggregate',
    projectRef: safeProjectRef,
    regionQueryMask: 'region_001_northern_nevada_broad_mask',
    regionQueryMaskCoordinatesExcludedFromArtifact: true,
    providerInfluenceAllowed: false,
    providerOutputAppliedToRecommendations: false,
    rawProviderPayloadsExcluded: true,
    precisePrivateCoordinatesExcluded: true,
    privateUserVehicleAndDebriefDataExcluded: true,
    providerSecretValuesExcluded: true,
    categories,
    summary: {
      shadowValidatedCategories: categoryValues
        .filter((category) => category.realShadowStatus === 'shadow_validated')
        .map((category) => category.category),
      missingOrBlockedCategories: categoryValues
        .filter((category) => category.realShadowStatus !== 'shadow_validated')
        .map((category) => category.category),
      providerSourcesObserved: Array.from(new Set(categoryValues.flatMap((category) => category.providerSources)))
        .filter((item) => item !== 'none observed'),
      syncRunProviderCount: Array.isArray(sourceAggregate.syncRollup) ? sourceAggregate.syncRollup.length : 0,
      serviceCandidateCount: numberValue(sourceAggregate.campgroundRollup?.candidate_count),
      routeCandidateCount: numberValue(sourceAggregate.routeRollup?.candidate_count),
    },
    readLimitations: Array.isArray(sourceAggregate.readLimitations) ? sourceAggregate.readLimitations : [],
    blockers: collectBlockers(categories, sourceAggregate),
    notes: [
      'Real-shadow evidence is observational only and does not approve provider influence.',
      'Fire restriction and weather require persisted live evidence or separately captured sanitized probe output before influence review.',
      'Service/resupply remains missing when no Region 001 campground/service records are observed.',
    ],
  };
}

function ledgerStatus(status) {
  return status === 'shadow_validated' ? 'real-shadow observed' : status;
}

export function renderRegion001EvidenceLedgerRows(evidence) {
  return REQUIRED_PROVIDER_CATEGORIES
    .map((category) => {
      const row = evidence.categories[category];
      const source = row.realShadowStatus === 'shadow_validated'
        ? sourceLabel(row.providerSources.map((provider_id) => ({ provider_id })), 'observed provider set')
        : 'none observed';
      return `| ${category} | ${source} | ${ledgerStatus(row.realShadowStatus)} | ${row.coverageRate} | ${row.freshnessRate} | ${row.unknownRate} | ${row.staleRate} | ${row.conflictRate} | no |`;
    })
    .join('\n');
}

export function renderRegion001CategoryMatrixRows(evidence) {
  return REQUIRED_PROVIDER_CATEGORIES
    .map((category) => {
      const row = evidence.categories[category];
      const status = row.realShadowStatus === 'shadow_validated' ? 'shadow_validated' : 'not_approved';
      const mode = row.realShadowStatus === 'shadow_validated' ? 'real-shadow' : 'real-shadow missing';
      const remaining = row.blockers.length > 0
        ? row.blockers.join('; ')
        : 'Provider influence remains disabled until owner approval, approver/date, and accepted influence fields are complete.';
      return `| ${category} | ${status} | ${mode} | ${evidence.generatedAt.slice(0, 10)} live shadow | ${row.freshnessRate} | ${row.summary} Coverage ${row.coverageRate}; unknown ${row.unknownRate}; stale ${row.staleRate}. | ${row.conflictRate} | ${row.staleRate}/${row.unknownRate} | Unknown/missing/stale signals remain visible and cannot imply approval. | no | not approved | not approved | ${remaining} |`;
    })
    .join('\n');
}
