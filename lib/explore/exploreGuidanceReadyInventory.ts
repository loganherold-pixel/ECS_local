import {
  MIN_DISCOVERY_ROUTE_MILES,
  type ExpeditionOpportunity,
} from '../discoverEngine';
import {
  EXPLORE_REFINEMENT_OPTIONS,
  applyExploreRefinementFilter,
  type ExploreRefinementFilter,
} from './exploreRefinementFilter';
import {
  normalizeExploreWizardRouteCandidates,
  type ExploreWizardCandidateSet,
  type ExploreWizardHiddenRoute,
  type ExploreWizardRouteSourceKind,
  type NormalizeExploreWizardCandidatesInput,
} from './exploreTripBuilderWizard';
import { normalizeExploreDiscoveryItems } from './exploreDiscoveryItem';
import { normalizeNavigationGuidanceGeometry } from '../navigationCatalogGuidanceGeometry';

export const EXPLORE_GUIDANCE_READY_EXCLUSION_CODES = [
  'missing_geometry',
  'invalid_geometry',
  'too_short',
  'access_unverified',
  'current_condition_blocked',
  'source_restricted',
  'moderation_pending',
  'vehicle_incompatible',
  'date_or_season_blocked',
  'stale_required_source',
  'duplicate',
  'outside_radius',
  'filtered_by_user',
  'feature_disabled',
  'unsupported_route_type',
] as const;

export type ExploreGuidanceReadyExclusionCode =
  (typeof EXPLORE_GUIDANCE_READY_EXCLUSION_CODES)[number];

export type ExploreGuidanceReadyExclusionReason = {
  code: ExploreGuidanceReadyExclusionCode;
  reason: string;
};

export type ExploreReadyRouteEligibilityResult = {
  eligible: boolean;
  reason: string | null;
  exclusionCodes: ExploreGuidanceReadyExclusionCode[];
  exclusionReasons: ExploreGuidanceReadyExclusionReason[];
};

export type ExploreGuidanceReadyRouteExclusion = ExploreWizardHiddenRoute & {
  exclusionCodes: ExploreGuidanceReadyExclusionCode[];
  exclusionReasons: ExploreGuidanceReadyExclusionReason[];
};

type ExploreGuidanceReadyCandidateSet = ExploreWizardCandidateSet & {
  exclusions: ExploreGuidanceReadyRouteExclusion[];
};

export type ExploreGuidanceReadyInventoryInput = NormalizeExploreWizardCandidatesInput & {
  selectedRefinement?: ExploreRefinementFilter | null;
  isRouteEligible?: (route: ExpeditionOpportunity) => ExploreReadyRouteEligibilityResult;
};

export type ExploreGuidanceReadyInventory = {
  candidateSet: ExploreGuidanceReadyCandidateSet;
  readyCount: number;
  totalReadyCount: number;
  refinementCounts: Record<ExploreRefinementFilter, number>;
  sourceCounts: Record<ExploreWizardRouteSourceKind | 'all', number>;
  hiddenTotal: number;
  hiddenBySource: Record<ExploreWizardRouteSourceKind, number>;
  hiddenReasons: ExploreWizardHiddenRoute[];
  exclusions: ExploreGuidanceReadyRouteExclusion[];
  exclusionTotal: number;
  rangeHiddenTotal: number;
  rangeHiddenBySource: Record<ExploreWizardRouteSourceKind, number>;
  rangeHiddenReasons: ExploreWizardHiddenRoute[];
  rangeExclusions: ExploreGuidanceReadyRouteExclusion[];
  rangeExclusionTotal: number;
};

export type ExploreGuidanceProviderAvailability = {
  providerUnavailableWithoutData: boolean;
  providerUnavailableWithLocalInventory: boolean;
  providerUnavailableWithLocalReady: boolean;
  blockCanonicalInventory: boolean;
};

export function deriveExploreGuidanceProviderAvailability(input: {
  providerStatus: string;
  providerHasData: boolean;
  evaluatedCount: number;
  readyCount: number;
}): ExploreGuidanceProviderAvailability {
  const providerUnavailableWithoutData =
    !input.providerHasData &&
    ['error', 'cancelled', 'disabled', 'stale', 'degraded'].includes(input.providerStatus);
  const providerUnavailableWithLocalInventory =
    providerUnavailableWithoutData && input.evaluatedCount > 0;
  const providerUnavailableWithLocalReady =
    providerUnavailableWithoutData && input.readyCount > 0;
  return {
    providerUnavailableWithoutData,
    providerUnavailableWithLocalInventory,
    providerUnavailableWithLocalReady,
    blockCanonicalInventory:
      providerUnavailableWithoutData && input.evaluatedCount === 0,
  };
}

const EXCLUSION_REASON_PRIORITY: ExploreGuidanceReadyExclusionCode[] = [
  // Preserve the legacy first-reason priority: length, public state, geometry.
  'too_short',
  'moderation_pending',
  'source_restricted',
  'access_unverified',
  'missing_geometry',
  'invalid_geometry',
  'current_condition_blocked',
  'vehicle_incompatible',
  'date_or_season_blocked',
  'stale_required_source',
  'feature_disabled',
  'unsupported_route_type',
  'duplicate',
  'outside_radius',
  'filtered_by_user',
];

const EXCLUSION_CODE_SET = new Set<ExploreGuidanceReadyExclusionCode>(
  EXPLORE_GUIDANCE_READY_EXCLUSION_CODES,
);

const SOURCE_ORDER: {
  key: keyof NormalizeExploreWizardCandidatesInput;
  sourceKind: ExploreWizardRouteSourceKind;
}[] = [
  { key: 'trailPacks', sourceKind: 'trail_pack' },
  { key: 'hiddenGemRoutes', sourceKind: 'hidden_gem' },
  { key: 'ecsRouteIdeas', sourceKind: 'ecs_idea' },
  { key: 'favoriteRoutes', sourceKind: 'saved_built' },
  { key: 'savedRouteAssets', sourceKind: 'imported_stitched' },
];

function exclusionReasonCopy(code: ExploreGuidanceReadyExclusionCode): string {
  switch (code) {
    case 'missing_geometry':
    case 'invalid_geometry':
      return 'Active guidance requires continuous route geometry.';
    case 'too_short':
      return `Route must be at least ${MIN_DISCOVERY_ROUTE_MILES} miles for Explorer guidance-ready cards.`;
    case 'access_unverified':
    case 'source_restricted':
    case 'moderation_pending':
      return 'Route is not public or production-ready for Explorer guidance-ready cards.';
    case 'current_condition_blocked':
      return 'Current route conditions block guidance readiness.';
    case 'vehicle_incompatible':
      return 'Route is not compatible with the active vehicle criteria.';
    case 'date_or_season_blocked':
      return 'Route is blocked for the selected date or active season restriction.';
    case 'stale_required_source':
      return 'Required route verification is stale or unavailable.';
    case 'duplicate':
      return 'Duplicate route record was consolidated into a canonical Explore route.';
    case 'outside_radius':
      return 'Route is outside the selected Explore radius.';
    case 'filtered_by_user':
      return 'Route is hidden by the active Explore filters.';
    case 'feature_disabled':
      return 'Guidance-ready route discovery is disabled.';
    case 'unsupported_route_type':
      return 'This route type is not supported for active guidance.';
  }
}

function isExclusionCode(value: unknown): value is ExploreGuidanceReadyExclusionCode {
  return typeof value === 'string' && EXCLUSION_CODE_SET.has(value as ExploreGuidanceReadyExclusionCode);
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry ?? '').trim())
    .filter(Boolean);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(record)
    .filter((entry) => Object.keys(entry).length > 0);
}

function normalizedToken(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizedTokens(...values: unknown[]): string[] {
  return values.map(normalizedToken).filter(Boolean);
}

function finiteNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function makeExclusionReason(
  code: ExploreGuidanceReadyExclusionCode,
  reason = exclusionReasonCopy(code),
): ExploreGuidanceReadyExclusionReason {
  return { code, reason };
}

function sortExclusionReasons(
  reasons: Iterable<ExploreGuidanceReadyExclusionReason>,
): ExploreGuidanceReadyExclusionReason[] {
  const byCode = new Map<ExploreGuidanceReadyExclusionCode, ExploreGuidanceReadyExclusionReason>();
  for (const reason of reasons) {
    if (!byCode.has(reason.code)) byCode.set(reason.code, reason);
  }
  return Array.from(byCode.values()).sort(
    (left, right) =>
      EXCLUSION_REASON_PRIORITY.indexOf(left.code) - EXCLUSION_REASON_PRIORITY.indexOf(right.code),
  );
}

function buildEligibilityResult(
  reasons: Iterable<ExploreGuidanceReadyExclusionReason>,
): ExploreReadyRouteEligibilityResult {
  const exclusionReasons = sortExclusionReasons(reasons);
  return {
    eligible: exclusionReasons.length === 0,
    reason: exclusionReasons[0]?.reason ?? null,
    exclusionCodes: exclusionReasons.map((entry) => entry.code),
    exclusionReasons,
  };
}

function emptyHiddenCounts(): Record<ExploreWizardRouteSourceKind, number> {
  return {
    trail_pack: 0,
    hidden_gem: 0,
    ecs_idea: 0,
    saved_built: 0,
    imported_stitched: 0,
  };
}

function emptySourceCounts(): Record<ExploreWizardRouteSourceKind | 'all', number> {
  return {
    all: 0,
    trail_pack: 0,
    hidden_gem: 0,
    ecs_idea: 0,
    saved_built: 0,
    imported_stitched: 0,
  };
}

function emptyCandidateSet(): ExploreGuidanceReadyCandidateSet {
  return {
    candidates: [],
    hiddenRoutes: [],
    hiddenTotal: 0,
    hiddenBySource: emptyHiddenCounts(),
    hiddenReasons: [],
    exclusions: [],
  };
}

function metadataRecord(route: ExpeditionOpportunity | null | undefined): Record<string, unknown> {
  const metadata = route?.routeMetadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function routeGeometryFields(route: ExpeditionOpportunity): unknown[] {
  const routeRecord = record(route);
  const metadata = metadataRecord(route);
  return [
    routeRecord.routeGeometry,
    routeRecord.route_geometry,
    routeRecord.trailGeometry,
    routeRecord.trail_geometry,
    routeRecord.geometry,
    metadata.routeGeometry,
    metadata.route_geometry,
    metadata.trailGeometry,
    metadata.trail_geometry,
    metadata.geometry,
  ];
}

function declaredExclusionCodes(route: ExpeditionOpportunity): ExploreGuidanceReadyExclusionCode[] {
  const routeRecord = record(route);
  const metadata = metadataRecord(route);
  return [
    ...stringArray(routeRecord.guidanceReadyExclusionCodes),
    ...stringArray(metadata.guidanceReadyExclusionCodes),
    ...stringArray(metadata.exploreGuidanceExclusionCodes),
  ].filter(isExclusionCode);
}

function textContains(value: string, pattern: RegExp): boolean {
  return value.length > 0 && pattern.test(value);
}

function collectExploreGuidanceReadyExclusions(
  route: ExpeditionOpportunity,
): ExploreGuidanceReadyExclusionReason[] {
  const reasons = new Map<ExploreGuidanceReadyExclusionCode, ExploreGuidanceReadyExclusionReason>();
  const exclude = (code: ExploreGuidanceReadyExclusionCode, reason?: string) => {
    if (!reasons.has(code)) reasons.set(code, makeExclusionReason(code, reason));
  };
  declaredExclusionCodes(route).forEach((code) => exclude(code));

  const routeRecord = record(route);
  const metadata = metadataRecord(route);
  const metadataCatalogVerification = record(metadata.catalogVerification);
  const routeCatalogVerification = record(routeRecord.catalogVerification);
  const currentConditionRecords = [
    record(metadataCatalogVerification.currentCondition),
    record(routeCatalogVerification.currentCondition),
    record(metadata.currentCondition),
    record(routeRecord.currentCondition),
  ];
  const blockerValues = [
    ...stringArray(metadataCatalogVerification.blockers),
    ...stringArray(routeCatalogVerification.blockers),
    ...currentConditionRecords.flatMap((condition) => stringArray(condition.blockers)),
  ];
  const blockerText = blockerValues.join(' ').toLowerCase();
  const warningText = [
    ...stringArray(metadataCatalogVerification.warnings),
    ...stringArray(routeCatalogVerification.warnings),
    ...currentConditionRecords.flatMap((condition) => stringArray(condition.warnings)),
  ].join(' ').toLowerCase();

  const distanceMiles = finiteNumber(route.distanceMiles);
  if (distanceMiles == null || distanceMiles < MIN_DISCOVERY_ROUTE_MILES) exclude('too_short');

  const routeStatuses = normalizedTokens(
    routeRecord.routeTypeStatus,
    metadata.routeTypeStatus,
    metadata.route_type_status,
  );
  const reviewStatuses = normalizedTokens(
    routeRecord.reviewStatus,
    metadata.reviewStatus,
    metadata.review_status,
    metadataCatalogVerification.reviewStatus,
    routeCatalogVerification.reviewStatus,
  );
  const dataStates = normalizedTokens(
    routeRecord.dataState,
    metadata.trailPackDataState,
    metadata.dataState,
    metadataCatalogVerification.dataState,
    routeCatalogVerification.dataState,
  );
  if (
    routeStatuses.some((status) => textContains(status, /private|draft|internal|not_public|fixture|mock|pending|rejected|needs_more_data/)) ||
    reviewStatuses.some((status) => textContains(status, /draft|pending|rejected|needs_more_data|private|not_public/)) ||
    dataStates.some((state) => textContains(state, /fixture|mock|simulated/)) ||
    textContains(blockerText, /not approved|moderation|pending review/)
  ) {
    exclude('moderation_pending');
  }

  const legalAccessStatuses = normalizedTokens(
    routeRecord.legalAccessStatus,
    metadata.legalAccessStatus,
    metadata.accessVerificationStatus,
    metadataCatalogVerification.legalAccessStatus,
    metadataCatalogVerification.accessVerificationStatus,
    routeCatalogVerification.legalAccessStatus,
    routeCatalogVerification.accessVerificationStatus,
  );
  if (
    legalAccessStatuses.some((status) => textContains(status, /unverified|unknown|requires_review|needs_review|conflict|restricted|prohibited/)) ||
    textContains(blockerText, /legal.?access|access coverage|unknown access|restricted or prohibited access/)
  ) {
    exclude('access_unverified');
  }
  if (
    metadataCatalogVerification.publicRecommendation === false ||
    routeCatalogVerification.publicRecommendation === false
  ) exclude('access_unverified');
  if (!hasExplicitVerifiedAccess(route)) exclude('access_unverified');

  const sourceRecords = [
    ...recordArray(routeRecord.sourceRecords),
    ...recordArray(metadata.sourceRecords),
    ...recordArray(metadataCatalogVerification.sourceRecords),
    ...recordArray(routeCatalogVerification.sourceRecords),
  ];
  const routeSources = [routeRecord.source, metadata.trailPackSource, metadata.source]
    .map(normalizedToken)
    .filter(Boolean);
  const restrictedSource = sourceRecords.some((source) => {
    const sourceType = normalizedToken(source.sourceType ?? source.source_type);
    const permission = normalizedToken(source.usePermission ?? source.use_permission);
    return (sourceType === 'partner_restricted' || sourceType === 'partner_source') &&
      permission !== 'granted';
  });
  if (
    restrictedSource ||
    routeSources.includes('partner_restricted') ||
    routeSources.includes('partner_source') ||
    routeRecord.sourceRestricted === true ||
    metadata.sourceRestricted === true ||
    textContains(blockerText, /partner|licensed route|publishing permission|use permission|source restricted/)
  ) {
    exclude('source_restricted');
  }

  const currentStatuses = currentConditionRecords.flatMap((condition) =>
    normalizedTokens(condition.status));
  const currentlyOpenStatuses = currentConditionRecords.flatMap((condition) =>
    normalizedTokens(condition.currentlyOpenStatus, condition.currently_open_status));
  const activeClosureCount = Math.max(
    0,
    ...currentConditionRecords.flatMap((condition) => [
      finiteNumber(condition.activeClosureCount) ?? 0,
      finiteNumber(condition.active_closure_count) ?? 0,
    ]),
    finiteNumber(routeRecord.activeClosureCount) ?? 0,
    finiteNumber(metadata.activeClosureCount) ?? 0,
  );
  if (
    currentStatuses.some((status) => textContains(status, /^(?:blocked|closed|closure_active|not_passable|restricted|unavailable)$/)) ||
    currentlyOpenStatuses.includes('closed') ||
    activeClosureCount > 0 ||
    currentConditionRecords.some((condition) => stringArray(condition.blockers).length > 0) ||
    textContains(blockerText, /active official closure|current condition|currently closed|route is closed/)
  ) {
    exclude('current_condition_blocked');
  }

  const vehicleFitStatuses = normalizedTokens(
    routeRecord.vehicleFitStatus,
    metadata.vehicleFitStatus,
    metadata.vehicleCompatibilityStatus,
    metadata.rigCompatibilityStatus,
  );
  const compatibilityScores = [
    finiteNumber(routeRecord.rigCompatibility),
    finiteNumber(metadata.rigCompatibility),
    finiteNumber(metadata.compatibilityScore),
  ].filter((score): score is number => score != null);
  const compatibilityScore = compatibilityScores.length > 0
    ? Math.min(...compatibilityScores)
    : null;
  if (
    routeRecord.vehicleMismatch === true ||
    metadata.vehicleMismatch === true ||
    metadataCatalogVerification.vehicleMismatch === true ||
    routeCatalogVerification.vehicleMismatch === true ||
    vehicleFitStatuses.some((status) => textContains(status, /incompatible|blocked|mismatch/)) ||
    (compatibilityScore != null && compatibilityScore < 40) ||
    textContains(blockerText, /vehicle fit|vehicle mismatch|vehicle incompatible/)
  ) {
    exclude('vehicle_incompatible');
  }

  const seasonStatuses = normalizedTokens(
    routeRecord.seasonEligibility,
    metadata.seasonEligibility,
    metadata.dateEligibility,
    ...currentConditionRecords.map((condition) => condition.seasonEligibility),
  );
  if (
    routeRecord.dateOrSeasonBlocked === true ||
    metadata.dateOrSeasonBlocked === true ||
    currentConditionRecords.some((condition) => condition.dateOrSeasonBlocked === true) ||
    seasonStatuses.some((status) => textContains(status, /blocked|closed|unavailable/)) ||
    textContains(blockerText, /seasonal|season restriction|trip.?date|date restriction/)
  ) {
    exclude('date_or_season_blocked');
  }

  const dataUsed = [
    ...recordArray(routeRecord.dataUsed),
    ...recordArray(metadata.dataUsed),
    ...recordArray(metadataCatalogVerification.dataUsed),
    ...recordArray(routeCatalogVerification.dataUsed),
  ];
  const requiredSources = dataUsed.filter((source) => {
    if (source.required === true) return true;
    const sourceType = normalizedToken(source.sourceType ?? source.source_type);
    return /^(official|federal_agency|state_agency|county_agency)$/.test(sourceType);
  });
  const requiredSourcesStale =
    requiredSources.length > 0 &&
    requiredSources.some((source) => {
      const freshness = normalizedToken(source.freshness ?? source.sourceState ?? source.source_state);
      return !/^(?:fresh|aging|current|live|recent)$/.test(freshness);
    });
  const verificationStatuses = normalizedTokens(
    routeRecord.verificationStatus,
    metadata.verificationStatus,
    metadataCatalogVerification.verificationStatus,
    routeCatalogVerification.verificationStatus,
  );
  if (
    requiredSourcesStale ||
    verificationStatuses.some((status) => /^(?:stale|expired|missing|unavailable|unknown)$/.test(status)) ||
    routeRecord.staleRequiredSource === true ||
    metadata.staleRequiredSource === true ||
    textContains(`${blockerText} ${warningText}`, /official source verification is stale|required source.*(?:stale|missing|expired)/)
  ) {
    exclude('stale_required_source');
  }

  const canonicalRouteId = normalizedToken(metadata.canonicalRouteId);
  const currentRouteIdentities = new Set([
    normalizedToken(route.id),
    normalizedToken(routeRecord.publicId),
    normalizedToken(metadata.publicId),
    normalizedToken(metadata.trailPackId),
    normalizedToken(metadata.routeCatalogId),
  ].filter(Boolean));
  const pointsToDifferentCanonicalRoute =
    canonicalRouteId.length > 0 && !currentRouteIdentities.has(canonicalRouteId);
  if (
    routeRecord.duplicate === true ||
    metadata.duplicate === true ||
    metadata.isDuplicate === true ||
    normalizedToken(metadata.duplicateOf).length > 0 ||
    pointsToDifferentCanonicalRoute
  ) {
    exclude('duplicate');
  }
  if (
    routeRecord.outsideRadius === true ||
    metadata.outsideRadius === true ||
    routeRecord.withinRadius === false ||
    metadata.withinRadius === false
  ) {
    exclude('outside_radius');
  }
  if (
    routeRecord.filteredByUser === true ||
    metadata.filteredByUser === true ||
    routeRecord.userFilterEligible === false ||
    metadata.userFilterEligible === false
  ) {
    exclude('filtered_by_user');
  }
  const featureStatuses = normalizedTokens(
    routeRecord.guidanceReadyFeatureStatus,
    metadata.guidanceReadyFeatureStatus,
  );
  if (
    routeRecord.exploreGuidanceReadyEnabled === false ||
    metadata.exploreGuidanceReadyEnabled === false ||
    routeRecord.guidanceFeatureEnabled === false ||
    metadata.guidanceFeatureEnabled === false ||
    featureStatuses.includes('disabled')
  ) {
    exclude('feature_disabled');
  }
  if (
    routeRecord.guidanceRouteTypeSupported === false ||
    metadata.guidanceRouteTypeSupported === false ||
    routeRecord.unsupportedRouteType === true ||
    metadata.unsupportedRouteType === true ||
    textContains(blockerText, /unsupported route type/)
  ) {
    exclude('unsupported_route_type');
  }

  if (!hasExploreGuidanceReadyGeometry(route)) {
    const routeGeometryModes = normalizedTokens(
      routeRecord.routeGeometryMode,
      metadata.routeGeometryMode,
      metadataCatalogVerification.routeGeometryMode,
      routeCatalogVerification.routeGeometryMode,
    );
    const hasGeometryInput = routeGeometryFields(route).some((field) => field != null);
    exclude(!hasGeometryInput || routeGeometryModes.includes('omitted') ? 'missing_geometry' : 'invalid_geometry');
  }
  if (textContains(blockerText, /geometry.*(?:impossible|invalid|incomplete|disconnected)/)) {
    exclude('invalid_geometry');
  }
  if (textContains(blockerText, /geometry.*(?:missing|unavailable|omitted)/)) {
    exclude('missing_geometry');
  }

  return sortExclusionReasons(reasons.values());
}

function routeAllowsLoopGuidance(route: ExpeditionOpportunity): boolean {
  const routeRecord = record(route);
  const metadata = metadataRecord(route);
  const catalogVerifications = [
    record(metadata.catalogVerification),
    record(routeRecord.catalogVerification),
  ];
  const declaredTypes = normalizedTokens(
    routeRecord.routeType,
    routeRecord.route_type,
    metadata.routeType,
    metadata.route_type,
    metadata.trailPackRouteType,
    metadata.trail_pack_route_type,
    metadata.routeShape,
    metadata.route_shape,
    metadata.guidanceRouteShape,
    metadata.guidance_route_shape,
    ...catalogVerifications.flatMap((verification) => [verification.routeType, verification.route_type]),
  );
  const allowDeclarations = [
    routeRecord.allowLoopGuidance,
    metadata.allowLoopGuidance,
    ...catalogVerifications.map((verification) => verification.allowLoopGuidance),
  ];
  if (allowDeclarations.includes(false)) return false;
  const isLoopType = (value: string) =>
    value === 'loop' || value === 'closed_loop' || value === 'loop_route';
  if (declaredTypes.some((value) => !isLoopType(value))) return false;
  return declaredTypes.some(isLoopType) || allowDeclarations.includes(true);
}

function hasReadyNormalizedGeometry(route: ExpeditionOpportunity): boolean {
  const routeRecord = record(route);
  const metadata = metadataRecord(route);
  const allowLoop = routeAllowsLoopGuidance(route);
  const fields = [
    routeRecord.routeGeometry,
    routeRecord.route_geometry,
    routeRecord.trailGeometry,
    routeRecord.trail_geometry,
    routeRecord.geometry,
    metadata.routeGeometry,
    metadata.route_geometry,
    metadata.trailGeometry,
    metadata.trail_geometry,
    metadata.geometry,
  ];

  return fields.some((field) => {
    const normalized = normalizeNavigationGuidanceGeometry(field, { allowLoop });
    return normalized.status === 'ready' && normalized.points.length > 1;
  });
}

export function hasExploreGuidanceReadyGeometry(
  route: ExpeditionOpportunity | null | undefined,
): route is ExpeditionOpportunity {
  if (!route) return false;
  const routeRecord = record(route);
  const metadata = metadataRecord(route);
  const metadataCatalogVerification = record(metadata.catalogVerification);
  const routeCatalogVerification = record(routeRecord.catalogVerification);
  const communitySignals = [
    record(metadata.communitySignal),
    record(routeRecord.communitySignal),
  ];
  const activeGuidanceRecords = [
    record(routeRecord.activeGuidance),
    record(metadata.activeGuidance),
    record(metadataCatalogVerification.activeGuidance),
    record(routeCatalogVerification.activeGuidance),
    ...communitySignals.map((signal) => record(signal.activeGuidance)),
  ];
  const activeGuidanceStatuses = activeGuidanceRecords.flatMap((guidance) =>
    normalizedTokens(guidance.status));
  const activeGuidanceReady = activeGuidanceStatuses.includes('ready') ||
    activeGuidanceRecords.some((guidance) =>
      guidance.guidanceReady === true || guidance.available === true);
  const routeGeometryModes = normalizedTokens(
    routeRecord.routeGeometryMode,
    metadata.routeGeometryMode,
    metadataCatalogVerification.routeGeometryMode,
    routeCatalogVerification.routeGeometryMode,
  );
  const stitchedOrFullGeometry =
    routeGeometryModes.includes('full') ||
    routeGeometryModes.includes('stitched') ||
    String(metadata.geometrySource ?? '').includes('stitched');

  if (
    activeGuidanceStatuses.some((status) => status === 'preview_only' || status === 'unavailable') ||
    activeGuidanceRecords.some((guidance) => guidance.available === false)
  ) return false;
  if (routeGeometryModes.includes('omitted')) return false;
  if (routeGeometryModes.includes('preview_simplified')) {
    return activeGuidanceReady && hasReadyNormalizedGeometry(route);
  }
  if (!activeGuidanceReady && !stitchedOrFullGeometry) {
    return hasReadyNormalizedGeometry(route);
  }
  return hasReadyNormalizedGeometry(route);
}

export function defaultExploreReadyRouteEligibility(
  route: ExpeditionOpportunity,
): ExploreReadyRouteEligibilityResult {
  return buildEligibilityResult(collectExploreGuidanceReadyExclusions(route));
}

function sourceTitle(route: ExpeditionOpportunity): string {
  return String(route.name || route.id || 'Explore route');
}

function routeExclusion(
  route: ExpeditionOpportunity,
  sourceKind: ExploreWizardRouteSourceKind,
  exclusionReasons: Iterable<ExploreGuidanceReadyExclusionReason>,
): ExploreGuidanceReadyRouteExclusion {
  const sortedReasons = sortExclusionReasons(exclusionReasons);
  return {
    id: String(route.id || `${sourceKind}:${sourceTitle(route)}`),
    sourceKind,
    title: sourceTitle(route),
    reason: sortedReasons[0]?.reason ?? 'Route is unavailable for Explorer guidance-ready cards.',
    exclusionCodes: sortedReasons.map((entry) => entry.code),
    exclusionReasons: sortedReasons,
  };
}

function hiddenRouteExclusion(
  hiddenRoute: ExploreWizardHiddenRoute,
): ExploreGuidanceReadyRouteExclusion {
  const geometryCode = /continuous|invalid|disconnected|topology/i.test(hiddenRoute.reason)
    ? 'invalid_geometry'
    : 'missing_geometry';
  return {
    ...hiddenRoute,
    exclusionCodes: [geometryCode],
    exclusionReasons: [makeExclusionReason(geometryCode, hiddenRoute.reason)],
  };
}

function uniqueRouteExclusions(
  exclusions: ExploreGuidanceReadyRouteExclusion[],
): ExploreGuidanceReadyRouteExclusion[] {
  const seen = new Set<string>();
  return exclusions.filter((entry) => {
    const key = `${entry.sourceKind}:${entry.id}:${entry.exclusionCodes.join('|')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type EligibilityResolver = (route: ExpeditionOpportunity) => ExploreReadyRouteEligibilityResult;

function hasExplicitVerifiedAccess(route: ExpeditionOpportunity): boolean {
  const routeRecord = record(route);
  const metadata = metadataRecord(route);
  const metadataCatalogVerification = record(metadata.catalogVerification);
  const routeCatalogVerification = record(routeRecord.catalogVerification);
  const catalogVerifications = [metadataCatalogVerification, routeCatalogVerification];
  if (catalogVerifications.some((verification) => verification.publicRecommendation === false)) {
    return false;
  }
  const accessStatuses = normalizedTokens(
    routeRecord.legalAccessStatus,
    metadata.legalAccessStatus,
    metadata.accessVerificationStatus,
    ...catalogVerifications.flatMap((verification) => [
      verification.legalAccessStatus,
      verification.accessVerificationStatus,
    ]),
  );
  if (accessStatuses.some((status) =>
    /unverified|unknown|requires_review|needs_review|conflict|restricted|prohibited/.test(status))) {
    return false;
  }
  if (catalogVerifications.some((verification) => verification.publicRecommendation === true)) {
    return true;
  }
  if (
    routeRecord.accessVerified === false ||
    metadata.accessVerified === false ||
    catalogVerifications.some((verification) => verification.accessVerified === false)
  ) {
    return false;
  }
  if (
    routeRecord.accessVerified === true ||
    metadata.accessVerified === true ||
    catalogVerifications.some((verification) => verification.accessVerified === true)
  ) {
    return true;
  }
  return accessStatuses.some((status) =>
    status === 'verified' || status === 'official_verified' || status === 'confirmed');
}

function applySourceAccessRequirement(
  route: ExpeditionOpportunity,
  sourceKind: ExploreWizardRouteSourceKind,
  eligibility: ExploreReadyRouteEligibilityResult,
): ExploreReadyRouteEligibilityResult {
  const requiresExplicitAccess = SOURCE_ORDER.some((source) => source.sourceKind === sourceKind);
  if (!eligibility.eligible || !requiresExplicitAccess || hasExplicitVerifiedAccess(route)) {
    return eligibility;
  }
  // Every source lane needs explicit access evidence. Geometry, source kind, or
  // an AI/saved/imported origin must never imply public or legal access.
  return buildEligibilityResult([
    ...eligibility.exclusionReasons,
    makeExclusionReason('access_unverified'),
  ]);
}

function createEligibilityResolver(input: ExploreGuidanceReadyInventoryInput): EligibilityResolver {
  const baseEligibilityCache = new WeakMap<object, ExploreReadyRouteEligibilityResult>();
  const baseEligibility: EligibilityResolver = (route) => {
    const key = route as unknown as object;
    const cached = baseEligibilityCache.get(key);
    if (cached) return cached;
    const eligibility = defaultExploreReadyRouteEligibility(route);
    baseEligibilityCache.set(key, eligibility);
    return eligibility;
  };
  const routesBySourceIdentity = new Map<string, ExpeditionOpportunity[]>();
  const discoveryInputs = SOURCE_ORDER.flatMap((source) =>
    (input[source.key] ?? []).map((route) => {
      const identity = `${source.sourceKind}:${String(route.id)}`;
      routesBySourceIdentity.set(identity, [
        ...(routesBySourceIdentity.get(identity) ?? []),
        route,
      ]);
      return { route, sourceKind: source.sourceKind };
    }));
  const inheritedCanonicalReasons = new WeakMap<object, ExploreGuidanceReadyExclusionReason[]>();
  const conflictReasonCode = (code: string): ExploreGuidanceReadyExclusionCode | null => {
    switch (code) {
      case 'legal_access_conflict':
        return 'access_unverified';
      case 'current_condition_conflict':
        return 'current_condition_blocked';
      case 'vehicle_fit_conflict':
        return 'vehicle_incompatible';
      case 'guidance_conflict':
      case 'geometry_provenance_conflict':
        return 'invalid_geometry';
      default:
        return null;
    }
  };
  normalizeExploreDiscoveryItems(discoveryInputs).forEach((item) => {
    const primaryIdentity = `${item.primarySource.sourceKind}:${item.primarySource.sourceId}`;
    const primaryRoutes = routesBySourceIdentity.get(primaryIdentity) ?? [];
    const canonicalReasons = sortExclusionReasons([
      ...primaryRoutes.flatMap((route) => baseEligibility(route).exclusionReasons),
      ...item.conflicts.flatMap((conflict) => {
        const code = conflictReasonCode(conflict.code);
        return code ? [makeExclusionReason(code)] : [];
      }),
    ]);
    if (canonicalReasons.length === 0) return;
    item.sources.forEach((source) => {
      const identity = `${source.sourceKind}:${source.sourceId}`;
      (routesBySourceIdentity.get(identity) ?? []).forEach((route) => {
        inheritedCanonicalReasons.set(route as unknown as object, canonicalReasons);
      });
    });
  });
  const routeObjectCache = new WeakMap<object, ExploreReadyRouteEligibilityResult>();

  const resolve: EligibilityResolver = (route) => {
    const cachedByObject = routeObjectCache.get(route as unknown as object);
    if (cachedByObject) return cachedByObject;

    const defaultEligibility = baseEligibility(route);
    const canonicalReasons = inheritedCanonicalReasons.get(route as unknown as object) ?? [];
    const additionalEligibility = input.isRouteEligible?.(route);
    let eligibility = canonicalReasons.length > 0
      ? buildEligibilityResult([
          ...defaultEligibility.exclusionReasons,
          ...canonicalReasons,
        ])
      : defaultEligibility;
    if (additionalEligibility) {
      const additionalReasons = [
        ...(Array.isArray(additionalEligibility.exclusionReasons)
          ? additionalEligibility.exclusionReasons
          : []),
        ...(Array.isArray(additionalEligibility.exclusionCodes)
          ? additionalEligibility.exclusionCodes
              .filter(isExclusionCode)
              .map((code) => makeExclusionReason(code))
          : []),
      ];
      const combinedReasons = sortExclusionReasons([
        ...eligibility.exclusionReasons,
        ...additionalReasons,
      ]);
      if (combinedReasons.length > 0) {
        eligibility = buildEligibilityResult(combinedReasons);
      } else if (eligibility.eligible && !additionalEligibility.eligible) {
        eligibility = additionalEligibility;
      }
    }
    routeObjectCache.set(route as unknown as object, eligibility);
    return eligibility;
  };

  SOURCE_ORDER.forEach((source) => {
    (input[source.key] ?? []).forEach(resolve);
  });

  return resolve;
}

function buildForRefinement(
  input: ExploreGuidanceReadyInventoryInput,
  refinement: ExploreRefinementFilter | null,
  getEligibility: EligibilityResolver,
): ExploreGuidanceReadyCandidateSet {
  const eligibleInput: NormalizeExploreWizardCandidatesInput = {};
  const eligibleRoutes: {
    route: ExpeditionOpportunity;
    sourceKind: ExploreWizardRouteSourceKind;
  }[] = [];
  const hiddenRoutes: ExploreWizardHiddenRoute[] = [];
  const hiddenBySource = emptyHiddenCounts();
  const exclusions: ExploreGuidanceReadyRouteExclusion[] = [];

  SOURCE_ORDER.forEach((source) => {
    const routes = input[source.key] ?? [];
    const refinedRoutes = applyExploreRefinementFilter(routes, refinement);
    const refinedRouteSet = new Set(refinedRoutes);
    eligibleInput[source.key] = [];

    if (refinement) {
      routes.forEach((route) => {
        if (refinedRouteSet.has(route)) return;
        const eligibility = applySourceAccessRequirement(
          route,
          source.sourceKind,
          getEligibility(route),
        );
        exclusions.push(routeExclusion(route, source.sourceKind, [
          ...eligibility.exclusionReasons,
          makeExclusionReason('filtered_by_user'),
        ]));
      });
    }

    refinedRoutes.forEach((route) => {
      const eligibility = applySourceAccessRequirement(
        route,
        source.sourceKind,
        getEligibility(route),
      );
      if (eligibility.eligible) {
        eligibleInput[source.key]?.push(route);
        eligibleRoutes.push({ route, sourceKind: source.sourceKind });
        return;
      }

      const exclusion = routeExclusion(route, source.sourceKind, eligibility.exclusionReasons);
      hiddenRoutes.push(exclusion);
      exclusions.push(exclusion);
      hiddenBySource[source.sourceKind] += 1;
    });
  });

  const normalized = normalizeExploreWizardRouteCandidates(eligibleInput);
  const routeSourceKey = (routeId: unknown, sourceKind: ExploreWizardRouteSourceKind) =>
    `${sourceKind}:${String(routeId)}`;
  const retainedRouteCounts = new Map<string, number>();
  normalized.candidates.forEach((candidate) => {
    const key = routeSourceKey(candidate.route.id, candidate.sourceKind);
    retainedRouteCounts.set(key, (retainedRouteCounts.get(key) ?? 0) + 1);
  });
  const normalizedHiddenCounts = new Map<string, number>();
  normalized.hiddenRoutes.forEach((route) => {
    const key = routeSourceKey(route.id, route.sourceKind);
    normalizedHiddenCounts.set(key, (normalizedHiddenCounts.get(key) ?? 0) + 1);
  });
  const consume = (counts: Map<string, number>, key: string): boolean => {
    const count = counts.get(key) ?? 0;
    if (count <= 0) return false;
    if (count === 1) counts.delete(key);
    else counts.set(key, count - 1);
    return true;
  };
  eligibleRoutes.forEach(({ route, sourceKind }) => {
    const key = routeSourceKey(route.id, sourceKind);
    if (consume(retainedRouteCounts, key) || consume(normalizedHiddenCounts, key)) return;
    exclusions.push(routeExclusion(route, sourceKind, [makeExclusionReason('duplicate')]));
  });
  normalized.hiddenRoutes.forEach((hiddenRoute) => {
    exclusions.push(hiddenRouteExclusion(hiddenRoute));
  });
  const combinedHiddenBySource = emptyHiddenCounts();
  SOURCE_ORDER.forEach((source) => {
    combinedHiddenBySource[source.sourceKind] =
      hiddenBySource[source.sourceKind] + normalized.hiddenBySource[source.sourceKind];
  });
  const combinedHiddenRoutes = [...hiddenRoutes, ...normalized.hiddenRoutes];

  return {
    ...normalized,
    hiddenRoutes: combinedHiddenRoutes,
    hiddenTotal: combinedHiddenRoutes.length,
    hiddenBySource: combinedHiddenBySource,
    hiddenReasons: combinedHiddenRoutes,
    exclusions: uniqueRouteExclusions(exclusions),
  };
}

function countCanonicalEligibleRoutesForRefinement(
  input: ExploreGuidanceReadyInventoryInput,
  refinement: ExploreRefinementFilter | null,
  getEligibility: EligibilityResolver,
): number {
  return buildForRefinement(input, refinement, getEligibility).candidates.length;
}

function sourceCounts(candidateSet: ExploreWizardCandidateSet): Record<ExploreWizardRouteSourceKind | 'all', number> {
  const counts = emptySourceCounts();
  candidateSet.candidates.forEach((candidate) => {
    counts[candidate.sourceKind] += 1;
    counts.all += 1;
  });
  return counts;
}

export function buildExploreGuidanceReadyInventory(
  input: ExploreGuidanceReadyInventoryInput,
): ExploreGuidanceReadyInventory {
  const selectedRefinement = input.selectedRefinement ?? null;
  const getEligibility = createEligibilityResolver(input);
  const candidateSet = buildForRefinement(input, selectedRefinement, getEligibility);
  const rangeCandidateSet = selectedRefinement == null
    ? candidateSet
    : buildForRefinement(input, null, getEligibility);
  const refinementCounts = EXPLORE_REFINEMENT_OPTIONS.reduce(
    (counts, option) => {
      counts[option.key] = option.key === selectedRefinement
        ? candidateSet.candidates.length
        : countCanonicalEligibleRoutesForRefinement(input, option.key, getEligibility);
      return counts;
    },
    {
      remoteness: 0,
      dayTrip: 0,
      weekendTrip: 0,
      expedition: 0,
    } as Record<ExploreRefinementFilter, number>,
  );
  const totalReadyCount = rangeCandidateSet.candidates.length;
  const rangeHiddenCandidateSet = totalReadyCount === 0
    ? rangeCandidateSet
    : emptyCandidateSet();

  return {
    candidateSet,
    readyCount: candidateSet.candidates.length,
    totalReadyCount,
    refinementCounts,
    sourceCounts: sourceCounts(candidateSet),
    hiddenTotal: candidateSet.hiddenTotal,
    hiddenBySource: candidateSet.hiddenBySource,
    hiddenReasons: candidateSet.hiddenReasons,
    exclusions: candidateSet.exclusions,
    exclusionTotal: candidateSet.exclusions.length,
    rangeHiddenTotal: rangeHiddenCandidateSet.hiddenTotal,
    rangeHiddenBySource: rangeHiddenCandidateSet.hiddenBySource,
    rangeHiddenReasons: rangeHiddenCandidateSet.hiddenReasons,
    rangeExclusions: rangeCandidateSet.exclusions,
    rangeExclusionTotal: rangeCandidateSet.exclusions.length,
  };
}
