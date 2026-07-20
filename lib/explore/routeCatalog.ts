import { capUniqueRankedRoutes } from './routeSearchResultPolicy';
import type {
  ECSTrailPack,
  ECSTrailPackActiveGuidance,
  ECSTrailPackCatalogDataUsed,
  ECSTrailPackCoordinate,
  ECSTrailPackCurrentConditionOverlay,
  ECSTrailPackDetailAssessment,
  ECSTrailPackDifficulty,
  ECSTrailPackOfflineCacheMetadata,
  ECSTrailPackOperationalCriteria,
  ECSTrailPackReviewStatus,
  ECSTrailPackRouteGeometry,
  ECSTrailPackRouteType,
  ECSTrailPackSource,
} from './trailPacks';
import { getRouteCatalogSourcePublishingBlocker } from './routeCatalogSourceRestrictions';

export type RouteCatalogSourceType =
  | 'official'
  | 'federal_agency'
  | 'state_agency'
  | 'county_agency'
  | 'community'
  | 'osm_supplemental'
  | 'partner_restricted'
  | 'supplemental';

export type RouteCatalogVerificationStatus =
  | 'official_verified'
  | 'partially_verified'
  | 'geometry_only'
  | 'stale'
  | 'not_recommended';

export type RouteCatalogOperationalStatus = 'normal' | 'watch' | 'caution' | 'critical';
export type RouteCatalogCurrentConditionOverlay = ECSTrailPackCurrentConditionOverlay;

export type RouteCatalogSourceRecord = {
  providerId: string;
  sourceType: RouteCatalogSourceType;
  label: string;
  authority: string;
  lastVerifiedAt?: string;
  sourceUrl?: string;
  attribution?: string;
  license?: string;
  usePermission?: 'granted' | 'not_granted' | 'unknown';
};

export type RouteCatalogRecord = {
  id: string;
  publicId?: string;
  name: string;
  description?: string;
  routeType: ECSTrailPackRouteType;
  centerCoordinate: ECSTrailPackCoordinate;
  routeGeometry?: ECSTrailPackRouteGeometry;
  routeGeometryMode?: 'full' | 'preview_simplified' | 'omitted';
  distanceMiles?: number;
  estimatedDurationMinutes?: number;
  difficulty?: ECSTrailPackDifficulty;
  vehicleFit?: string[];
  remotenessScore?: number;
  campabilityScore?: number;
  minimumFuelRangeMiles?: number;
  minimumWaterCapacityGallons?: number;
  routeIntelligence?: Record<string, unknown>;
  officialAccessCoveragePct: number;
  unknownAccessCoveragePct: number;
  restrictedAccessCoveragePct: number;
  activeClosureCount: number;
  seasonalRestrictionCount?: number;
  vehicleMismatch?: boolean;
  geometryQuality?: 'good' | 'partial' | 'poor' | 'missing';
  verificationStatus: RouteCatalogVerificationStatus;
  reviewStatus: ECSTrailPackReviewStatus;
  recommendationStatus?: 'recommendable' | 'not_recommended' | 'needs_review';
  sourceRecords: RouteCatalogSourceRecord[];
  closureSummaries?: string[];
  currentCondition?: RouteCatalogCurrentConditionOverlay;
  communitySignal?: {
    positiveReports?: number;
    negativeReports?: number;
    completions?: number;
    independentConfirmations?: number;
    activeGuidance?: ECSTrailPackActiveGuidance;
    currentConditions?: Record<string, unknown>;
  };
  tags?: string[];
  createdAt: string;
  updatedAt: string;
};

export type RouteCatalogDataUsed = {
  providerId: string;
  label: string;
  sourceType: string;
  authority: string;
  freshness: 'fresh' | 'aging' | 'stale' | 'missing';
  lastVerifiedAt?: string;
  attribution?: string;
  license?: string;
};

export type RouteCatalogDetailAssessment = ECSTrailPackDetailAssessment;
export type RouteCatalogOfflineCacheMetadata = ECSTrailPackOfflineCacheMetadata;

export type RouteCatalogVerification = {
  status: RouteCatalogOperationalStatus;
  sourceLabel: string;
  publicRecommendation: boolean;
  confidenceScore: number;
  reasons: string[];
  warnings: string[];
  blockers: string[];
  activeGuidance?: ECSTrailPackActiveGuidance;
  currentCondition?: RouteCatalogCurrentConditionOverlay;
  dataUsed: RouteCatalogDataUsed[];
  lastEvaluatedAt: string;
};

export type RouteCatalogCoverageState = {
  state: 'ready' | 'no_verified_routes' | 'lower_confidence_nearby' | 'unavailable';
  title: string;
  message: string;
};

export type RouteCatalogSearchMeta = {
  candidateCount: number;
  radiusMatchedCount: number;
  curationCandidateCount: number;
  anySourceBackedCandidateCount: number;
  radiusFilterApplied: boolean;
  additionalMatchesExist: boolean;
};

export type RouteCatalogSearchResult = {
  trailPacks: ECSTrailPack[];
  records: RouteCatalogRecord[];
  coverageState: RouteCatalogCoverageState;
  searchMeta: RouteCatalogSearchMeta;
};

const MS_PER_DAY = 86_400_000;
const FRESH_DAYS = 180;
const STALE_DAYS = 365;
const OFFICIAL_ACCESS_RECOMMENDATION_THRESHOLD = 80;
const UNKNOWN_ACCESS_MAX_RECOMMENDATION_THRESHOLD = 20;
const IMPOSSIBLE_JUMP_MILES = 80;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function readString(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return undefined;
}

function readBoolean(record: Record<string, unknown>, ...keys: string[]): boolean | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string' && /^true|false$/i.test(value.trim())) {
      return /^true$/i.test(value.trim());
    }
  }
  return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const values = value.map((item) => String(item ?? '').trim()).filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function readNullableNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue;
    if (record[key] == null) return null;
    const value = Number(record[key]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function unique(values: string[], limit = 10): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach((value) => {
    const normalized = value.trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result.slice(0, limit);
}

function daysSince(isoDate: string | undefined, nowMs: number): number | null {
  if (!isoDate) return null;
  const parsed = Date.parse(isoDate);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((nowMs - parsed) / MS_PER_DAY));
}

function freshnessForSource(source: RouteCatalogSourceRecord, nowMs: number): RouteCatalogDataUsed['freshness'] {
  const days = daysSince(source.lastVerifiedAt, nowMs);
  if (days == null) return 'missing';
  if (days <= FRESH_DAYS) return 'fresh';
  if (days <= STALE_DAYS) return 'aging';
  return 'stale';
}

function normalizeRouteType(value: unknown): ECSTrailPackRouteType {
  const routeType = String(value ?? '').trim();
  if (
    routeType === 'loop' ||
    routeType === 'out_and_back' ||
    routeType === 'point_to_point' ||
    routeType === 'area_pack' ||
    routeType === 'unknown'
  ) {
    return routeType;
  }
  return 'unknown';
}

function normalizeDifficulty(value: unknown): ECSTrailPackDifficulty {
  const difficulty = String(value ?? '').trim();
  if (
    difficulty === 'easy' ||
    difficulty === 'moderate' ||
    difficulty === 'technical' ||
    difficulty === 'extreme' ||
    difficulty === 'unknown'
  ) {
    return difficulty;
  }
  if (difficulty === 'difficult') return 'technical';
  return 'unknown';
}

function normalizeReviewStatus(value: unknown): ECSTrailPackReviewStatus {
  const status = String(value ?? '').trim();
  if (
    status === 'draft' ||
    status === 'pending_review' ||
    status === 'approved' ||
    status === 'rejected' ||
    status === 'needs_more_data'
  ) {
    return status;
  }
  return 'needs_more_data';
}

function normalizeVerificationStatus(value: unknown): RouteCatalogVerificationStatus {
  const status = String(value ?? '').trim();
  if (
    status === 'official_verified' ||
    status === 'partially_verified' ||
    status === 'geometry_only' ||
    status === 'stale' ||
    status === 'not_recommended'
  ) {
    return status;
  }
  return 'not_recommended';
}

function normalizeRouteGeometryMode(value: unknown): RouteCatalogRecord['routeGeometryMode'] {
  const mode = String(value ?? '').trim();
  if (mode === 'full' || mode === 'preview_simplified' || mode === 'omitted') return mode;
  return undefined;
}

function normalizeSourceType(value: unknown): RouteCatalogSourceType {
  const sourceType = String(value ?? '').trim();
  if (
    sourceType === 'official' ||
    sourceType === 'federal_agency' ||
    sourceType === 'state_agency' ||
    sourceType === 'county_agency' ||
    sourceType === 'community' ||
    sourceType === 'osm_supplemental' ||
    sourceType === 'partner_restricted' ||
    sourceType === 'supplemental'
  ) {
    return sourceType;
  }
  return 'supplemental';
}

function normalizeCoordinate(value: unknown): ECSTrailPackCoordinate | null {
  const record = readRecord(value);
  if (!record) return null;
  const latitude = readNumber(record, 'latitude', 'lat');
  const longitude = readNumber(record, 'longitude', 'lng', 'lon');
  if (
    latitude != null &&
    longitude != null &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    return { latitude, longitude };
  }
  return null;
}

function normalizeCoordinatePair(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180
  ) {
    return [longitude, latitude];
  }
  return null;
}

function normalizeGeometry(value: unknown): ECSTrailPackRouteGeometry | undefined {
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value);
        } catch {
          return null;
        }
      })()
    : value;
  const record = readRecord(parsed);
  if (!record) return undefined;

  if (record.type === 'LineString' && Array.isArray(record.coordinates)) {
    const coordinates = record.coordinates
      .map(normalizeCoordinatePair)
      .filter((point): point is number[] => !!point);
    return coordinates.length >= 2 ? { type: 'LineString', coordinates } : undefined;
  }

  if (record.type === 'MultiLineString' && Array.isArray(record.coordinates)) {
    const coordinates = record.coordinates
      .map((line) =>
        Array.isArray(line)
          ? line.map(normalizeCoordinatePair).filter((point): point is number[] => !!point)
          : [],
      )
      .filter((line) => line.length >= 2);
    return coordinates.length > 0 ? { type: 'MultiLineString', coordinates } : undefined;
  }

  return undefined;
}

function normalizeActiveGuidance(value: unknown): ECSTrailPackActiveGuidance | undefined {
  const record = readRecord(value);
  if (!record) return undefined;
  const status = readString(record, 'status');
  if (status !== 'ready' && status !== 'preview_only' && status !== 'unavailable') return undefined;
  return {
    status,
    topologyResolved: readBoolean(record, 'topologyResolved', 'topology_resolved') ?? false,
    sourceSegmentCount: readNumber(record, 'sourceSegmentCount', 'source_segment_count') ?? 0,
    componentCount: readNumber(record, 'componentCount', 'component_count') ?? 0,
    branchDetected: readBoolean(record, 'branchDetected', 'branch_detected') ?? false,
    joinedSegmentGapCount: readNumber(record, 'joinedSegmentGapCount', 'joined_segment_gap_count') ?? 0,
    disjointSegmentGapCount: readNumber(record, 'disjointSegmentGapCount', 'disjoint_segment_gap_count') ?? 0,
    maxJoinGapMeters: readNullableNumber(record, 'maxJoinGapMeters', 'max_join_gap_meters'),
    maxSegmentGapMeters: readNullableNumber(record, 'maxSegmentGapMeters', 'max_segment_gap_meters'),
    unavailableReason: readString(record, 'unavailableReason', 'unavailable_reason') ?? null,
  };
}

function normalizeCommunitySignal(value: unknown): RouteCatalogRecord['communitySignal'] {
  const record = readRecord(value);
  if (!record) return undefined;
  const activeGuidance = normalizeActiveGuidance(record.activeGuidance ?? record.active_guidance);
  const signal = {
    ...record,
    positiveReports: readNumber(record, 'positiveReports', 'positive_reports'),
    negativeReports: readNumber(record, 'negativeReports', 'negative_reports'),
    completions: readNumber(record, 'completions'),
    independentConfirmations: readNumber(record, 'independentConfirmations', 'independent_confirmations'),
  } as NonNullable<RouteCatalogRecord['communitySignal']>;
  if (activeGuidance) signal.activeGuidance = activeGuidance;
  return signal;
}

function normalizeCurrentConditionStatus(value: unknown): RouteCatalogCurrentConditionOverlay['status'] | null {
  const status = String(value ?? '').trim();
  if (status === 'clear' || status === 'watch' || status === 'blocked' || status === 'not_assessed') {
    return status;
  }
  return null;
}

function normalizeCurrentOpenStatus(value: unknown): RouteCatalogCurrentConditionOverlay['currentlyOpenStatus'] | null {
  const status = String(value ?? '').trim();
  if (status === 'no_known_closure' || status === 'requires_review' || status === 'closed' || status === 'unknown') {
    return status;
  }
  return null;
}

function normalizePassabilityStatus(value: unknown): RouteCatalogCurrentConditionOverlay['passabilityStatus'] | null {
  const status = String(value ?? '').trim();
  if (status === 'not_assessed' || status === 'requires_review' || status === 'unknown') {
    return status;
  }
  return null;
}

function conditionStringArray(record: Record<string, unknown> | null, ...keys: string[]): string[] {
  if (!record) return [];
  for (const key of keys) {
    const values = readStringArray(record[key]);
    if (values) return values;
  }
  return [];
}

function buildCurrentConditionOverlay(
  route: RouteCatalogRecord,
  lastEvaluatedAt: string,
): RouteCatalogCurrentConditionOverlay {
  const explicit = readRecord(route.currentCondition);
  const rawCommunitySignal = readRecord(route.communitySignal);
  const signal = readRecord(rawCommunitySignal?.currentConditions ?? rawCommunitySignal?.current_conditions);
  const sourceCount = Math.max(
    readNumber(explicit ?? {}, 'sourceCount', 'source_count') ?? 0,
    readNumber(signal ?? {}, 'sourceCount', 'source_count') ?? 0,
  );
  const activeClosureCount = Math.max(
    route.activeClosureCount,
    readNumber(explicit ?? {}, 'activeClosureCount', 'active_closure_count') ?? 0,
    readNumber(signal ?? {}, 'activeClosureCount', 'active_closure_count') ?? 0,
  );
  const watchClosureCount = Math.max(
    readNumber(explicit ?? {}, 'watchClosureCount', 'watch_closure_count') ?? 0,
    readNumber(signal ?? {}, 'watchClosureCount', 'watch_closure_count') ?? 0,
  );
  const seasonalRestrictionCount = route.seasonalRestrictionCount ?? 0;
  const closureSummaries = unique([
    ...(route.closureSummaries ?? []),
    ...conditionStringArray(explicit, 'closureSummaries', 'closure_summaries'),
    ...conditionStringArray(signal, 'closureSummaries', 'closure_summaries'),
  ], 8);
  const sourceCheckedAt = unique([
    ...conditionStringArray(explicit, 'sourceCheckedAt', 'source_checked_at', 'checkedAt', 'checked_at'),
    ...conditionStringArray(signal, 'sourceCheckedAt', 'source_checked_at', 'checkedAt', 'checked_at'),
  ], 8);
  const staleAt = unique([
    ...conditionStringArray(explicit, 'staleAt', 'stale_at'),
    ...conditionStringArray(signal, 'staleAt', 'stale_at'),
  ], 8);

  const blockers: string[] = [];
  const warnings: string[] = [];
  if (activeClosureCount > 0) {
    blockers.push('Current-condition overlay reports an active official closure.');
  }
  if (watchClosureCount > 0) {
    warnings.push('Current-condition notice requires trip-date review.');
  }
  if (seasonalRestrictionCount > 0) {
    warnings.push('Seasonal restrictions require trip-date review.');
  }
  if (sourceCount === 0 && sourceCheckedAt.length === 0) {
    warnings.push('No current-condition/closure overlay has verified this route as currently open or passable.');
  }

  const explicitWarnings = [
    ...conditionStringArray(explicit, 'warnings', 'warningReasons', 'warning_reasons'),
    ...conditionStringArray(signal, 'warnings', 'warningReasons', 'warning_reasons'),
  ];
  const explicitBlockers = [
    ...conditionStringArray(explicit, 'blockers', 'blockerReasons', 'blocker_reasons'),
    ...conditionStringArray(signal, 'blockers', 'blockerReasons', 'blocker_reasons'),
  ];

  let status: RouteCatalogCurrentConditionOverlay['status'] =
    activeClosureCount > 0 || explicitBlockers.length > 0
      ? 'blocked'
      : watchClosureCount > 0 || seasonalRestrictionCount > 0 || explicitWarnings.length > 0
        ? 'watch'
        : sourceCount > 0 || sourceCheckedAt.length > 0
          ? 'clear'
          : 'not_assessed';
  status = normalizeCurrentConditionStatus(explicit?.status ?? signal?.status) ?? status;

  const currentlyOpenStatus = normalizeCurrentOpenStatus(explicit?.currentlyOpenStatus ?? explicit?.currently_open_status) ??
    normalizeCurrentOpenStatus(signal?.currentlyOpenStatus ?? signal?.currently_open_status) ??
    (status === 'blocked'
      ? 'closed'
      : status === 'clear'
        ? 'no_known_closure'
        : status === 'watch'
          ? 'requires_review'
          : 'unknown');
  const passabilityStatus = normalizePassabilityStatus(explicit?.passabilityStatus ?? explicit?.passability_status) ??
    normalizePassabilityStatus(signal?.passabilityStatus ?? signal?.passability_status) ??
    (status === 'watch' ? 'requires_review' : status === 'clear' ? 'unknown' : 'not_assessed');
  const label = readString(explicit ?? {}, 'label') ??
    readString(signal ?? {}, 'label') ??
    (status === 'blocked'
      ? 'Current-condition closure conflict'
      : status === 'watch'
        ? 'Current conditions require trip-date review'
        : status === 'clear'
          ? 'No active current-condition closure known'
          : 'Current conditions not assessed');

  return {
    status,
    label,
    currentlyOpenStatus,
    passabilityStatus,
    activeClosureCount,
    seasonalRestrictionCount,
    warnings: unique([...warnings, ...explicitWarnings], 10),
    blockers: unique([...blockers, ...explicitBlockers], 8),
    closureSummaries: closureSummaries.length > 0 ? closureSummaries : undefined,
    sourceCheckedAt: sourceCheckedAt.length > 0 ? sourceCheckedAt : undefined,
    staleAt: staleAt.length > 0 ? staleAt : undefined,
    lastEvaluatedAt,
  };
}

function normalizeOperationalStatus(value: unknown, fallback: RouteCatalogOperationalStatus): RouteCatalogOperationalStatus {
  const status = String(value ?? '').trim();
  if (status === 'normal' || status === 'watch' || status === 'caution' || status === 'critical') {
    return status;
  }
  return fallback;
}

function readDetailTextArray(value: unknown): string[] {
  if (typeof value === 'string' && value.trim().length > 0) return [value.trim()];
  return readStringArray(value) ?? [];
}

function normalizeDetailDataUsed(value: unknown, fallback: RouteCatalogDataUsed[]): ECSTrailPackCatalogDataUsed[] {
  if (!Array.isArray(value)) return fallback;
  const normalized: ECSTrailPackCatalogDataUsed[] = [];
  const nowMs = Date.now();
  value.forEach((item) => {
    const source = sourceRecordFromValue(item);
    if (source) {
      normalized.push({
        providerId: source.providerId,
        label: source.label,
        sourceType: source.sourceType,
        authority: source.authority,
        freshness: freshnessForSource(source, nowMs),
        lastVerifiedAt: source.lastVerifiedAt,
        attribution: source.attribution,
        license: source.license,
      });
      return;
    }

    const record = readRecord(item);
    if (!record) return;
    const providerId = readString(record, 'provider_id', 'providerId');
    const label = readString(record, 'label');
    if (!providerId || !label) return;
    const freshness = readString(record, 'freshness');
    normalized.push({
      providerId,
      label,
      sourceType: readString(record, 'source_type', 'sourceType') ?? 'supplemental',
      authority: readString(record, 'authority') ?? 'unknown',
      freshness:
        freshness === 'fresh' || freshness === 'aging' || freshness === 'stale' || freshness === 'missing'
          ? freshness
          : 'missing',
      lastVerifiedAt: readString(record, 'last_verified_at', 'lastVerifiedAt'),
      attribution: readString(record, 'attribution'),
      license: readString(record, 'license'),
    });
  });
  return normalized.length > 0 ? normalized : fallback;
}

function normalizeRouteCatalogDetailAssessment(
  value: unknown,
  verification: RouteCatalogVerification,
): RouteCatalogDetailAssessment {
  const record = readRecord(value);
  const why = readDetailTextArray(record?.why).concat(readDetailTextArray(record?.reasons));
  const whatToWatch = readDetailTextArray(record?.whatToWatch ?? record?.what_to_watch);
  const toImproveStatus = readDetailTextArray(record?.toImproveStatus ?? record?.to_improve_status);
  const recommendedAction = record
    ? readString(record, 'recommendedAction', 'recommended_action')
    : undefined;
  const activeGuidance = record
    ? normalizeActiveGuidance(record.activeGuidance ?? record.active_guidance) ?? verification.activeGuidance
    : verification.activeGuidance;
  const currentCondition = record
    ? buildCurrentConditionOverlay(
        {
          id: 'detail-current-condition',
          name: 'Detail current condition',
          routeType: 'unknown',
          centerCoordinate: { latitude: 0, longitude: 0 },
          officialAccessCoveragePct: 0,
          unknownAccessCoveragePct: 100,
          restrictedAccessCoveragePct: 0,
          activeClosureCount: verification.currentCondition?.activeClosureCount ?? 0,
          seasonalRestrictionCount: verification.currentCondition?.seasonalRestrictionCount ?? 0,
          verificationStatus: 'not_recommended',
          reviewStatus: 'needs_more_data',
          sourceRecords: [],
          closureSummaries: verification.currentCondition?.closureSummaries,
          currentCondition: (readRecord(record.currentCondition ?? record.current_condition) as RouteCatalogCurrentConditionOverlay | null) ??
            verification.currentCondition,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        },
        verification.currentCondition?.lastEvaluatedAt ?? verification.lastEvaluatedAt,
      )
    : verification.currentCondition;

  return {
    status: normalizeOperationalStatus(record?.status, verification.status),
    why: unique(why.length > 0 ? why : verification.reasons, 8),
    whatToWatch: unique(whatToWatch.length > 0 ? whatToWatch : [
      ...verification.warnings,
      ...(verification.currentCondition?.warnings ?? []),
      ...(verification.currentCondition?.blockers ?? []),
    ], 8),
    recommendedAction: recommendedAction ?? (verification.publicRecommendation
      ? 'Verify current local conditions before departure and cache the route for offline use.'
      : 'Do not recommend this route until blockers are cleared by official source review.'),
    toImproveStatus: unique(
      toImproveStatus.length > 0
        ? toImproveStatus
        : verification.blockers.length > 0
          ? verification.blockers
          : ['Refresh official source checks', 'Confirm seasonal restrictions for the trip date'],
      8,
    ),
    confidence: clampScore(record ? readNumber(record, 'confidence') ?? verification.confidenceScore : verification.confidenceScore),
    activeGuidance,
    currentCondition,
    dataUsed: normalizeDetailDataUsed(record?.dataUsed ?? record?.data_used, verification.dataUsed),
  };
}

function normalizeRouteCatalogOfflineCache(
  value: unknown,
  trailPack: ECSTrailPack,
  verification: RouteCatalogVerification,
): RouteCatalogOfflineCacheMetadata {
  const record = readRecord(value);
  const sourceTimestamps = readStringArray(record?.sourceTimestamps ?? record?.source_timestamps);
  const freshnessWarnings = readStringArray(record?.freshnessWarnings ?? record?.freshness_warnings);
  const rawSourceAttribution = record?.sourceAttribution ?? record?.source_attribution;
  type OfflineSourceAttribution = NonNullable<RouteCatalogOfflineCacheMetadata['sourceAttribution']>[number];
  const sourceAttribution = Array.isArray(rawSourceAttribution)
    ? rawSourceAttribution
        .map((item): OfflineSourceAttribution | null => {
          const attributionRecord = readRecord(item);
          if (!attributionRecord) return null;
          const providerId = readString(attributionRecord, 'providerId', 'provider_id');
          const label = readString(attributionRecord, 'label');
          if (!providerId || !label) return null;
          const normalized: OfflineSourceAttribution = {
            providerId,
            label,
          };
          const attribution = readString(attributionRecord, 'attribution');
          const license = readString(attributionRecord, 'license');
          if (attribution) normalized.attribution = attribution;
          if (license) normalized.license = license;
          return normalized;
        })
        .filter((item): item is OfflineSourceAttribution => !!item)
    : undefined;
  const currentConditionPayload = record?.currentCondition ?? record?.current_condition;
  const currentCondition = currentConditionPayload
    ? buildCurrentConditionOverlay(
        {
          id: 'offline-current-condition',
          name: 'Offline current condition',
          routeType: 'unknown',
          centerCoordinate: { latitude: 0, longitude: 0 },
          officialAccessCoveragePct: 0,
          unknownAccessCoveragePct: 100,
          restrictedAccessCoveragePct: 0,
          activeClosureCount: verification.currentCondition?.activeClosureCount ?? 0,
          seasonalRestrictionCount: verification.currentCondition?.seasonalRestrictionCount ?? 0,
          verificationStatus: 'not_recommended',
          reviewStatus: 'needs_more_data',
          sourceRecords: [],
          closureSummaries: verification.currentCondition?.closureSummaries,
          currentCondition: readRecord(currentConditionPayload) as RouteCatalogCurrentConditionOverlay | undefined,
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        },
        verification.currentCondition?.lastEvaluatedAt ?? verification.lastEvaluatedAt,
      )
    : verification.currentCondition;
  return {
    cacheable: record
      ? readBoolean(record, 'cacheable', 'available') ?? Boolean(trailPack.routeGeometry && verification.publicRecommendation)
      : Boolean(trailPack.routeGeometry && verification.publicRecommendation),
    lastVerifiedAt: record
      ? readString(record, 'lastVerifiedAt', 'last_verified_at') ?? trailPack.lastVerifiedAt ?? null
      : trailPack.lastVerifiedAt ?? null,
    staleAt: record ? readString(record, 'staleAt', 'stale_at') ?? null : null,
    sourceTimestamps,
    sourceAttribution: sourceAttribution && sourceAttribution.length > 0 ? sourceAttribution : undefined,
    currentCondition,
    freshnessWarnings,
  };
}

function centerFromGeometry(geometry: ECSTrailPackRouteGeometry | undefined): ECSTrailPackCoordinate | null {
  if (!geometry) return null;
  const coordinates = geometry.type === 'MultiLineString'
    ? (geometry.coordinates as number[][][]).flat()
    : (geometry.coordinates as number[][]);
  if (coordinates.length === 0) return null;
  const totals = coordinates.reduce(
    (acc, coordinate) => ({
      latitude: acc.latitude + Number(coordinate[1]),
      longitude: acc.longitude + Number(coordinate[0]),
    }),
    { latitude: 0, longitude: 0 },
  );
  return {
    latitude: totals.latitude / coordinates.length,
    longitude: totals.longitude / coordinates.length,
  };
}

function geometryCoordinates(geometry: ECSTrailPackRouteGeometry | undefined): ECSTrailPackCoordinate[] {
  if (!geometry) return [];
  const raw = geometry.type === 'MultiLineString'
    ? (geometry.coordinates as number[][][]).flat()
    : (geometry.coordinates as number[][]);

  return raw
    .map(([longitude, latitude]) => ({ latitude, longitude }))
    .filter((point) =>
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Math.abs(point.latitude) <= 90 &&
      Math.abs(point.longitude) <= 180,
    );
}

function distanceMiles(left: ECSTrailPackCoordinate, right: ECSTrailPackCoordinate): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLng = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 3958.7613 * c;
}

function hasImpossibleJump(points: ECSTrailPackCoordinate[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (distanceMiles(points[index - 1], points[index]) > IMPOSSIBLE_JUMP_MILES) return true;
  }
  return false;
}

function isAuthoritativeSource(source: RouteCatalogSourceRecord): boolean {
  return (
    source.sourceType === 'official' ||
    source.sourceType === 'federal_agency' ||
    source.sourceType === 'state_agency' ||
    source.sourceType === 'county_agency' ||
    /official|agency|authoritative|mvum|gtlf/i.test(source.authority)
  );
}

function sourceRecordFromValue(value: unknown): RouteCatalogSourceRecord | null {
  const record = readRecord(value);
  if (!record) return null;
  const providerId = readString(record, 'provider_id', 'providerId', 'source_key', 'sourceKey');
  const label = readString(record, 'label', 'source_name', 'sourceName', 'provider_name', 'providerName');
  if (!providerId || !label) return null;
  return {
    providerId,
    label,
    sourceType: normalizeSourceType(record.source_type ?? record.sourceType),
    authority: readString(record, 'authority', 'authority_level', 'authorityLevel') ?? 'unknown',
    lastVerifiedAt: readString(record, 'last_verified_at', 'lastVerifiedAt', 'last_seen_at', 'lastSeenAt'),
    sourceUrl: readString(record, 'source_url', 'sourceUrl', 'source_uri', 'sourceUri'),
    attribution: readString(record, 'attribution', 'attribution_text', 'attributionText'),
    license: readString(record, 'license', 'license_name', 'licenseName'),
    usePermission: readString(record, 'use_permission', 'usePermission') as RouteCatalogSourceRecord['usePermission'],
  };
}

export function normalizeRouteCatalogRecord(value: unknown): RouteCatalogRecord | null {
  const record = readRecord(value);
  if (!record) return null;
  const id = readString(record, 'public_id', 'publicId', 'route_slug', 'routeSlug', 'id');
  const name = readString(record, 'name', 'title');
  if (!id || !name) return null;

  const routeGeometry = normalizeGeometry(record.route_geometry ?? record.routeGeometry ?? record.geometry);
  const centerCoordinate =
    normalizeCoordinate(record.center_coordinate ?? record.centerCoordinate) ??
    (() => {
      const latitude = readNumber(record, 'center_latitude', 'centerLatitude', 'latitude', 'lat');
      const longitude = readNumber(record, 'center_longitude', 'centerLongitude', 'longitude', 'lng', 'lon');
      return latitude != null && longitude != null ? { latitude, longitude } : null;
    })() ??
    centerFromGeometry(routeGeometry);
  if (!centerCoordinate) return null;

  const rawSources = record.source_records ?? record.sourceRecords ?? [];
  const sourceRecords = Array.isArray(rawSources)
    ? rawSources.map(sourceRecordFromValue).filter((source): source is RouteCatalogSourceRecord => !!source)
    : [];

  return {
    id,
    publicId: readString(record, 'public_id', 'publicId'),
    name,
    description: readString(record, 'description'),
    routeType: normalizeRouteType(record.route_type ?? record.routeType),
    centerCoordinate,
    routeGeometry,
    routeGeometryMode: normalizeRouteGeometryMode(record.route_geometry_mode ?? record.routeGeometryMode),
    distanceMiles: readNumber(record, 'distance_miles', 'distanceMiles'),
    estimatedDurationMinutes: readNumber(record, 'estimated_duration_minutes', 'estimatedDurationMinutes'),
    difficulty: normalizeDifficulty(record.difficulty),
    vehicleFit: readStringArray(record.vehicle_fit ?? record.vehicleFit),
    remotenessScore: readNumber(record, 'remoteness_score', 'remotenessScore'),
    campabilityScore: readNumber(record, 'campability_score', 'campabilityScore'),
    minimumFuelRangeMiles: readNumber(
      record,
      'minimum_fuel_range_miles',
      'minimumFuelRangeMiles',
      'minFuelRangeMiles',
    ),
    minimumWaterCapacityGallons: readNumber(
      record,
      'minimum_water_capacity_gallons',
      'minimumWaterCapacityGallons',
      'minWaterCapacityGallons',
    ),
    routeIntelligence: readRecord(record.route_intelligence ?? record.routeIntelligence) ?? undefined,
    officialAccessCoveragePct: readNumber(record, 'official_access_coverage_pct', 'officialAccessCoveragePct') ?? 0,
    unknownAccessCoveragePct: readNumber(record, 'unknown_access_coverage_pct', 'unknownAccessCoveragePct') ?? 100,
    restrictedAccessCoveragePct: readNumber(record, 'restricted_access_coverage_pct', 'restrictedAccessCoveragePct') ?? 0,
    activeClosureCount: readNumber(record, 'active_closure_count', 'activeClosureCount') ?? 0,
    seasonalRestrictionCount: readNumber(record, 'seasonal_restriction_count', 'seasonalRestrictionCount') ?? 0,
    vehicleMismatch: Boolean(record.vehicle_mismatch ?? record.vehicleMismatch ?? false),
    geometryQuality: readString(record, 'geometry_quality', 'geometryQuality') as RouteCatalogRecord['geometryQuality'],
    verificationStatus: normalizeVerificationStatus(record.verification_status ?? record.verificationStatus),
    reviewStatus: normalizeReviewStatus(record.review_status ?? record.reviewStatus),
    recommendationStatus: readString(record, 'recommendation_status', 'recommendationStatus') as RouteCatalogRecord['recommendationStatus'],
    sourceRecords,
    closureSummaries: readStringArray(record.closure_summaries ?? record.closureSummaries),
    currentCondition: readRecord(record.current_condition ?? record.currentCondition) as RouteCatalogCurrentConditionOverlay | undefined,
    communitySignal: normalizeCommunitySignal(record.community_signal ?? record.communitySignal),
    tags: readStringArray(record.tags),
    createdAt: readString(record, 'created_at', 'createdAt') ?? new Date(0).toISOString(),
    updatedAt: readString(record, 'updated_at', 'updatedAt') ?? new Date(0).toISOString(),
  };
}

export function verifyRouteCatalogRecord(
  route: RouteCatalogRecord,
  options: { now?: string | Date } = {},
): RouteCatalogVerification {
  const nowDate = options.now instanceof Date
    ? options.now
    : options.now
      ? new Date(options.now)
      : new Date();
  const nowMs = Number.isFinite(nowDate.getTime()) ? nowDate.getTime() : Date.now();
  const lastEvaluatedAt = new Date(nowMs).toISOString();
  const reasons: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];
  const points = geometryCoordinates(route.routeGeometry);
  const geometryIsPreview = route.routeGeometryMode === 'preview_simplified';
  const hasOfficialSource = route.sourceRecords.some(isAuthoritativeSource);
  const hasCommunitySource = route.sourceRecords.some((source) => source.sourceType === 'community');
  const hasOsmOnly =
    route.sourceRecords.length > 0 &&
    route.sourceRecords.every((source) => source.sourceType === 'osm_supplemental');
  const hasRestrictedPartner = route.sourceRecords.some(
    (source) => source.sourceType === 'partner_restricted' && source.usePermission !== 'granted',
  );
  const activeGuidance = route.communitySignal?.activeGuidance;
  const currentCondition = buildCurrentConditionOverlay(route, lastEvaluatedAt);
  const dataUsed: RouteCatalogDataUsed[] = route.sourceRecords.map((source) => ({
    providerId: source.providerId,
    label: source.label,
    sourceType: source.sourceType,
    authority: source.authority,
    freshness: freshnessForSource(source, nowMs),
    lastVerifiedAt: source.lastVerifiedAt,
    attribution: source.attribution,
    license: source.license,
  }));
  const authoritativeFreshness = dataUsed
    .filter((source) => route.sourceRecords.some((candidate) => candidate.providerId === source.providerId && isAuthoritativeSource(candidate)))
    .map((source) => source.freshness);
  const officialSourceStale =
    authoritativeFreshness.length === 0 ||
    authoritativeFreshness.every((freshness) => freshness === 'stale' || freshness === 'missing');

  if (points.length < 2) blockers.push('Route geometry is incomplete');
  if (!geometryIsPreview && hasImpossibleJump(points)) blockers.push('Route geometry contains impossible jumps');
  if (route.activeClosureCount > 0) blockers.push('Route intersects an active official closure');
  currentCondition.blockers.forEach((blocker) => blockers.push(blocker));
  if (route.restrictedAccessCoveragePct > 0) blockers.push('Route includes restricted or prohibited access');
  if (route.vehicleMismatch) blockers.push('Route vehicle fit conflicts with selected criteria');
  route.sourceRecords
    .map(getRouteCatalogSourcePublishingBlocker)
    .filter((blocker): blocker is string => !!blocker)
    .forEach((blocker) => blockers.push(blocker));
  if (
    hasRestrictedPartner &&
    !blockers.some((blocker) => blocker === 'Partner/licensed route requires permission before publishing')
  ) {
    blockers.push('Partner/licensed route requires permission before publishing');
  }
  if (route.reviewStatus !== 'approved') blockers.push('Route is not approved for public recommendation');
  if (route.officialAccessCoveragePct < OFFICIAL_ACCESS_RECOMMENDATION_THRESHOLD) {
    blockers.push('Official legal-access coverage is below recommendation threshold');
  }
  if (route.unknownAccessCoveragePct > UNKNOWN_ACCESS_MAX_RECOMMENDATION_THRESHOLD) {
    warnings.push('Route contains unknown legal-access gaps');
  }
  if (officialSourceStale && hasOfficialSource) warnings.push('Official source verification is stale');
  if (hasOsmOnly) warnings.push('OpenStreetMap is supplemental geometry and not legal-access authority');
  if (!hasOfficialSource && !hasOsmOnly) warnings.push('No official legal-access source is attached');
  if ((route.seasonalRestrictionCount ?? 0) > 0) warnings.push('Seasonal restrictions require trip-date review');
  if ((route.communitySignal?.negativeReports ?? 0) > 0) warnings.push('Community reports include unresolved concerns');
  if (activeGuidance?.unavailableReason) warnings.push(activeGuidance.unavailableReason);

  if (route.officialAccessCoveragePct >= OFFICIAL_ACCESS_RECOMMENDATION_THRESHOLD && hasOfficialSource) {
    reasons.push('Official legal-access coverage meets recommendation threshold');
  }
  if (points.length >= 2) reasons.push('Route geometry is available');
  if (!officialSourceStale && hasOfficialSource) reasons.push('Official source verification is fresh enough for catalog use');
  if ((route.communitySignal?.independentConfirmations ?? 0) > 0) {
    reasons.push('Independent community confirmations are available');
  }

  const hasHardBlocker = blockers.length > 0 || officialSourceStale || route.unknownAccessCoveragePct > UNKNOWN_ACCESS_MAX_RECOMMENDATION_THRESHOLD;
  const publicRecommendation = !hasHardBlocker && hasOfficialSource && route.recommendationStatus !== 'not_recommended';
  const confidenceScore = clampScore(
    38 +
      Math.min(34, Math.max(0, route.officialAccessCoveragePct) * 0.34) -
      Math.min(24, Math.max(0, route.unknownAccessCoveragePct) * 0.45) -
      Math.min(30, Math.max(0, route.restrictedAccessCoveragePct) * 0.8) +
      (hasOfficialSource ? 12 : 0) +
      (!officialSourceStale && hasOfficialSource ? 8 : 0) +
      Math.min(6, (route.communitySignal?.independentConfirmations ?? 0) * 2) +
      Math.min(5, (route.communitySignal?.completions ?? 0)) -
      (blockers.length * 18) -
      (hasOsmOnly ? 16 : 0),
  );

  let sourceLabel = 'Geometry only, not recommended';
  if (officialSourceStale && hasOfficialSource) {
    sourceLabel = 'Source stale';
  } else if (hasOfficialSource && route.officialAccessCoveragePct >= OFFICIAL_ACCESS_RECOMMENDATION_THRESHOLD) {
    sourceLabel = 'Official access verified';
  } else if (hasCommunitySource || route.verificationStatus === 'partially_verified') {
    sourceLabel = 'Community suggested, partially verified';
  } else if (route.verificationStatus === 'geometry_only' || hasOsmOnly) {
    sourceLabel = 'Geometry only, not recommended';
  }

  let status: RouteCatalogOperationalStatus = 'normal';
  if (blockers.some((blocker) => /closure|restricted|prohibited|partner|incomplete|impossible/i.test(blocker))) {
    status = 'critical';
  } else if (!publicRecommendation) {
    status = confidenceScore >= 60 ? 'caution' : 'critical';
  } else if (warnings.length > 0) {
    status = 'watch';
  }

  return {
    status,
    sourceLabel,
    publicRecommendation,
    confidenceScore: publicRecommendation ? Math.max(confidenceScore, 82) : Math.min(confidenceScore, 74),
    reasons: unique([sourceLabel, ...reasons], 12),
    warnings: unique(warnings, 10),
    blockers: unique(blockers, 8),
    activeGuidance,
    currentCondition,
    dataUsed,
    lastEvaluatedAt,
  };
}

function sourceForTrailPack(route: RouteCatalogRecord, verification: RouteCatalogVerification): ECSTrailPackSource {
  if (verification.publicRecommendation) return 'ecs_validated';
  if (route.sourceRecords.some((source) => source.sourceType === 'community')) return 'community_reviewed';
  if (route.sourceRecords.some((source) => source.sourceType === 'partner_restricted')) return 'partner_source';
  return 'needs_review';
}

function operationalCriteriaForRoute(route: RouteCatalogRecord): ECSTrailPackOperationalCriteria | undefined {
  const criteria: ECSTrailPackOperationalCriteria = {
    remotenessScore: route.remotenessScore,
    campabilityScore: route.campabilityScore,
    minimumFuelRangeMiles: route.minimumFuelRangeMiles,
    minimumWaterCapacityGallons: route.minimumWaterCapacityGallons,
    routeIntelligence: route.routeIntelligence,
  };
  return Object.values(criteria).some((value) => value !== undefined) ? criteria : undefined;
}

export function catalogRouteToTrailPack(
  route: RouteCatalogRecord,
  verification: RouteCatalogVerification = verifyRouteCatalogRecord(route),
): ECSTrailPack {
  const operationalCriteria = operationalCriteriaForRoute(route);
  return {
    id: route.publicId ?? route.id,
    name: route.name,
    description: route.description,
    source: sourceForTrailPack(route, verification),
    routeType: route.routeType,
    centerCoordinate: route.centerCoordinate,
    routeGeometry: route.routeGeometry,
    distanceMiles: route.distanceMiles,
    estimatedDurationMinutes: route.estimatedDurationMinutes,
    difficulty: route.difficulty ?? 'unknown',
    vehicleFit: route.vehicleFit,
    remotenessScore: route.remotenessScore,
    campabilityScore: route.campabilityScore,
    minimumFuelRangeMiles: route.minimumFuelRangeMiles,
    minimumWaterCapacityGallons: route.minimumWaterCapacityGallons,
    routeIntelligence: route.routeIntelligence,
    confidenceScore: verification.confidenceScore,
    confidenceReasons: verification.reasons.length > 0 ? verification.reasons : [verification.sourceLabel],
    dataState: 'live',
    lastVerifiedAt: verification.dataUsed.find((source) => source.freshness === 'fresh' || source.freshness === 'aging')?.lastVerifiedAt,
    positiveFeedbackCount: route.communitySignal?.positiveReports ?? 0,
    negativeFeedbackCount: route.communitySignal?.negativeReports ?? 0,
    completionCount: route.communitySignal?.completions ?? 0,
    reviewStatus: route.reviewStatus,
    tags: route.tags,
    catalogVerification: {
      status: verification.status,
      sourceLabel: verification.sourceLabel,
      publicRecommendation: verification.publicRecommendation,
      confidenceScore: verification.confidenceScore,
      warnings: verification.warnings,
      blockers: verification.blockers,
      activeGuidance: verification.activeGuidance,
      currentCondition: verification.currentCondition,
      dataUsed: verification.dataUsed,
      lastEvaluatedAt: verification.lastEvaluatedAt,
      operationalCriteria,
    },
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
  };
}

export function normalizeRouteCatalogDetailResponse(
  value: unknown,
  fallbackTrailPack?: ECSTrailPack,
): ECSTrailPack | null {
  const response = readRecord(value);
  const rawRecord =
    response?.record ??
    response?.route ??
    response?.routeRecord ??
    response?.route_record ??
    response?.verifiedRoute ??
    response?.verified_route ??
    value;
  const route = normalizeRouteCatalogRecord(rawRecord);

  if (!route && !fallbackTrailPack) return null;

  const verification = route
    ? verifyRouteCatalogRecord(route)
    : fallbackTrailPack?.catalogVerification
      ? {
          status: fallbackTrailPack.catalogVerification.status,
          sourceLabel: fallbackTrailPack.catalogVerification.sourceLabel,
          publicRecommendation: fallbackTrailPack.catalogVerification.publicRecommendation,
          confidenceScore: fallbackTrailPack.catalogVerification.confidenceScore,
          reasons: fallbackTrailPack.confidenceReasons,
          warnings: fallbackTrailPack.catalogVerification.warnings,
          blockers: fallbackTrailPack.catalogVerification.blockers,
          activeGuidance: fallbackTrailPack.catalogVerification.activeGuidance,
          currentCondition: fallbackTrailPack.catalogVerification.currentCondition,
          dataUsed: fallbackTrailPack.catalogVerification.dataUsed,
          lastEvaluatedAt: fallbackTrailPack.catalogVerification.lastEvaluatedAt,
        }
      : null;

  if (!verification) return fallbackTrailPack ?? null;

  const baseTrailPack = route
    ? catalogRouteToTrailPack(route, verification)
    : fallbackTrailPack;
  if (!baseTrailPack) return null;

  const detailAssessment = normalizeRouteCatalogDetailAssessment(
    response?.assessment ?? response?.detailAssessment ?? response?.detail_assessment,
    verification,
  );
  const offlineCache = normalizeRouteCatalogOfflineCache(
    response?.offlineCache ?? response?.offline_cache,
    baseTrailPack,
    verification,
  );
  const baseCatalogVerification = baseTrailPack.catalogVerification ?? {
    status: verification.status,
    sourceLabel: verification.sourceLabel,
    publicRecommendation: verification.publicRecommendation,
    confidenceScore: verification.confidenceScore,
    warnings: verification.warnings,
    blockers: verification.blockers,
    activeGuidance: verification.activeGuidance,
    currentCondition: verification.currentCondition,
    dataUsed: verification.dataUsed,
    lastEvaluatedAt: verification.lastEvaluatedAt,
  };

  return {
    ...baseTrailPack,
    routeGeometry: baseTrailPack.routeGeometry ?? fallbackTrailPack?.routeGeometry,
    distanceMiles: baseTrailPack.distanceMiles ?? fallbackTrailPack?.distanceMiles,
    estimatedDurationMinutes: baseTrailPack.estimatedDurationMinutes ?? fallbackTrailPack?.estimatedDurationMinutes,
    vehicleFit: baseTrailPack.vehicleFit ?? fallbackTrailPack?.vehicleFit,
    catalogVerification: {
      ...(fallbackTrailPack?.catalogVerification ?? {}),
      ...baseCatalogVerification,
      activeGuidance: detailAssessment.activeGuidance ?? baseCatalogVerification.activeGuidance,
      currentCondition: detailAssessment.currentCondition ?? baseCatalogVerification.currentCondition,
      detailAssessment,
      offlineCache,
      detailFetchedAt: new Date().toISOString(),
    },
  };
}

export function getRouteCatalogCoverageState(
  trailPacks: ECSTrailPack[],
  options: { userHasCriteria?: boolean; lowerConfidenceCount?: number; unavailable?: boolean } = {},
): RouteCatalogCoverageState {
  if (options.unavailable) {
    return {
      state: 'unavailable',
      title: 'Verified route catalog unavailable',
      message: 'ECS could not reach the source-backed route catalog. No seed or mock routes are shown as verified.',
    };
  }
  if (trailPacks.length > 0) {
    return {
      state: 'ready',
      title: 'Verified routes available',
      message: 'Source-backed ECS route catalog records match the current criteria.',
    };
  }
  if ((options.lowerConfidenceCount ?? 0) > 0) {
    return {
      state: 'lower_confidence_nearby',
      title: 'Lower-confidence routes nearby',
      message: 'ECS found route candidates nearby, but they are not verified enough for public recommendation yet.',
    };
  }
  return {
    state: 'no_verified_routes',
    title: 'No verified routes yet in this area',
    message: options.userHasCriteria
      ? 'ECS has no source-backed route catalog records matching the current criteria. Try a wider radius or import a GPX as a private pending suggestion.'
      : 'ECS has no source-backed route catalog records ready to recommend yet. Import a GPX as a private pending suggestion or try again later.',
  };
}

function normalizeCoverageState(value: unknown, fallback: RouteCatalogCoverageState): RouteCatalogCoverageState {
  const record = readRecord(value);
  if (!record) return fallback;
  const title = readString(record, 'title') ?? fallback.title;
  const message = readString(record, 'message') ?? fallback.message;
  const state = readString(record, 'state');
  if (
    state === 'ready' ||
    state === 'no_verified_routes' ||
    state === 'lower_confidence_nearby' ||
    state === 'unavailable'
  ) {
    return { state, title, message };
  }
  return fallback;
}

function normalizeRouteCatalogSearchMeta(value: unknown): RouteCatalogSearchMeta {
  const record = readRecord(value);
  const radiusMatchedCount = record ? readNumber(record, 'radiusMatchedCount', 'radius_matched_count') ?? 0 : 0;
  const curationCandidateCount = record ? readNumber(record, 'curationCandidateCount', 'curation_candidate_count') ?? 0 : 0;
  return {
    candidateCount: record ? readNumber(record, 'candidateCount', 'candidate_count') ?? 0 : 0,
    radiusMatchedCount,
    curationCandidateCount,
    anySourceBackedCandidateCount: record
      ? readNumber(record, 'anySourceBackedCandidateCount', 'any_source_backed_candidate_count') ??
        radiusMatchedCount + curationCandidateCount
      : 0,
    radiusFilterApplied: record ? readBoolean(record, 'radiusFilterApplied', 'radius_filter_applied') ?? false : false,
    additionalMatchesExist: record
      ? readBoolean(record, 'additionalMatchesExist', 'additional_matches_exist') ?? false
      : false,
  };
}

export function normalizeRouteCatalogSearchResponse(value: unknown): RouteCatalogSearchResult {
  const record = readRecord(value);
  const rawRecords = Array.isArray(record?.records)
    ? record?.records
    : Array.isArray(record?.routes)
      ? record?.routes
      : Array.isArray(value)
        ? value
        : [];
  const records = rawRecords
    .map(normalizeRouteCatalogRecord)
    .filter((route): route is RouteCatalogRecord => !!route);
  const evaluated = records.map((route) => ({
    route,
    verification: verifyRouteCatalogRecord(route),
  }));
  const eligible = evaluated.filter(({ verification }) => verification.publicRecommendation);
  const selected = capUniqueRankedRoutes(
    eligible,
    ({ route }) => route.publicId || route.id,
  );
  const trailPacks = selected.map(({ route, verification }) => catalogRouteToTrailPack(route, verification));
  const fallbackCoverage = getRouteCatalogCoverageState(trailPacks, {
    userHasCriteria: true,
    lowerConfidenceCount: evaluated.length - trailPacks.length,
  });

  return {
    trailPacks,
    records: selected.map(({ route }) => route),
    coverageState: normalizeCoverageState(record?.coverageState ?? record?.coverage_state, fallbackCoverage),
    searchMeta: normalizeRouteCatalogSearchMeta(record?.meta),
  };
}
