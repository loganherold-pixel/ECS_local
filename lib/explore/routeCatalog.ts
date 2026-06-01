import type {
  ECSTrailPack,
  ECSTrailPackActiveGuidance,
  ECSTrailPackCoordinate,
  ECSTrailPackDifficulty,
  ECSTrailPackReviewStatus,
  ECSTrailPackRouteGeometry,
  ECSTrailPackRouteType,
  ECSTrailPackSource,
} from './trailPacks';

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
  distanceMiles?: number;
  estimatedDurationMinutes?: number;
  difficulty?: ECSTrailPackDifficulty;
  vehicleFit?: string[];
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
  communitySignal?: {
    positiveReports?: number;
    negativeReports?: number;
    completions?: number;
    independentConfirmations?: number;
    activeGuidance?: ECSTrailPackActiveGuidance;
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

export type RouteCatalogVerification = {
  status: RouteCatalogOperationalStatus;
  sourceLabel: string;
  publicRecommendation: boolean;
  confidenceScore: number;
  reasons: string[];
  warnings: string[];
  blockers: string[];
  activeGuidance?: ECSTrailPackActiveGuidance;
  dataUsed: RouteCatalogDataUsed[];
  lastEvaluatedAt: string;
};

export type RouteCatalogCoverageState = {
  state: 'ready' | 'no_verified_routes' | 'lower_confidence_nearby' | 'unavailable';
  title: string;
  message: string;
};

export type RouteCatalogSearchResult = {
  trailPacks: ECSTrailPack[];
  records: RouteCatalogRecord[];
  coverageState: RouteCatalogCoverageState;
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
    distanceMiles: readNumber(record, 'distance_miles', 'distanceMiles'),
    estimatedDurationMinutes: readNumber(record, 'estimated_duration_minutes', 'estimatedDurationMinutes'),
    difficulty: normalizeDifficulty(record.difficulty),
    vehicleFit: readStringArray(record.vehicle_fit ?? record.vehicleFit),
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
  const hasOfficialSource = route.sourceRecords.some(isAuthoritativeSource);
  const hasCommunitySource = route.sourceRecords.some((source) => source.sourceType === 'community');
  const hasOsmOnly =
    route.sourceRecords.length > 0 &&
    route.sourceRecords.every((source) => source.sourceType === 'osm_supplemental');
  const hasRestrictedPartner = route.sourceRecords.some(
    (source) => source.sourceType === 'partner_restricted' && source.usePermission !== 'granted',
  );
  const activeGuidance = route.communitySignal?.activeGuidance;
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
  if (hasImpossibleJump(points)) blockers.push('Route geometry contains impossible jumps');
  if (route.activeClosureCount > 0) blockers.push('Route intersects an active official closure');
  if (route.restrictedAccessCoveragePct > 0) blockers.push('Route includes restricted or prohibited access');
  if (route.vehicleMismatch) blockers.push('Route vehicle fit conflicts with selected criteria');
  if (hasRestrictedPartner) blockers.push('Partner/licensed route requires permission before publishing');
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
  } else if (publicRecommendation) {
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

export function catalogRouteToTrailPack(
  route: RouteCatalogRecord,
  verification: RouteCatalogVerification = verifyRouteCatalogRecord(route),
): ECSTrailPack {
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
      dataUsed: verification.dataUsed,
      lastEvaluatedAt: verification.lastEvaluatedAt,
    },
    createdAt: route.createdAt,
    updatedAt: route.updatedAt,
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
  const trailPacks = evaluated
    .filter(({ verification }) => verification.publicRecommendation)
    .map(({ route, verification }) => catalogRouteToTrailPack(route, verification));
  const fallbackCoverage = getRouteCatalogCoverageState(trailPacks, {
    userHasCriteria: true,
    lowerConfidenceCount: evaluated.length - trailPacks.length,
  });

  return {
    trailPacks,
    records,
    coverageState: normalizeCoverageState(record?.coverageState ?? record?.coverage_state, fallbackCoverage),
  };
}
