export const ROUTE_CATALOG_SEARCH_RESULT_LIMIT = 20;
// Keep provider inspection capacity separate from the consumer-facing result
// contract. The Edge Function may inspect a wider bounded candidate set so
// restricted rows and duplicate identities never consume one of the 20 slots.
export const ROUTE_CATALOG_CANDIDATE_INSPECTION_LIMIT = 500;
export const ROUTE_CATALOG_MAX_PAGE_SIZE = ROUTE_CATALOG_SEARCH_RESULT_LIMIT;
export const ROUTE_CATALOG_MAX_PAGINATION_WINDOW = 2_000;
export const ROUTE_CATALOG_CURSOR_VERSION = 1;
export const ROUTE_CATALOG_CURSOR_MAX_LENGTH = 512;

const ROUTE_CATALOG_UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RouteCatalogPageCursor = {
  routeId: string;
};

export async function routeCatalogCursorFingerprint(values: unknown[]): Promise<string> {
  const input = new TextEncoder().encode(JSON.stringify(values));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  return Array.from(digest.slice(0, 16))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function encodeCursorBytes(value: Uint8Array): string {
  return btoa(String.fromCharCode(...value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeCursorBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function routeCatalogCursorHmacKey(
  signingSecret: string,
  usage: KeyUsage[],
): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usage,
  );
}

function routeCatalogCursorSigningPayload(routeId: string, fingerprint: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([
    ROUTE_CATALOG_CURSOR_VERSION,
    fingerprint,
    routeId,
  ]));
}

export async function encodeRouteCatalogPageCursor(
  cursor: RouteCatalogPageCursor,
  fingerprint: string,
  signingSecret: string,
): Promise<string> {
  const key = await routeCatalogCursorHmacKey(signingSecret, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign(
    'HMAC',
    key,
    routeCatalogCursorSigningPayload(cursor.routeId, fingerprint),
  ));
  return btoa(JSON.stringify({
    v: ROUTE_CATALOG_CURSOR_VERSION,
    f: fingerprint,
    r: cursor.routeId,
    s: encodeCursorBytes(signature),
  }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

export async function decodeRouteCatalogPageCursor(
  value: unknown,
  fingerprint: string,
  signingSecret: string,
): Promise<RouteCatalogPageCursor | null> {
  const encoded = cleanText(value);
  if (!encoded || encoded.length > ROUTE_CATALOG_CURSOR_MAX_LENGTH) return null;
  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const record = readRecord(JSON.parse(atob(padded)));
    const routeId = cleanText(record?.r);
    const signature = cleanText(record?.s);
    if (
      record?.v !== ROUTE_CATALOG_CURSOR_VERSION ||
      record?.f !== fingerprint ||
      !ROUTE_CATALOG_UUID_PATTERN.test(routeId) ||
      !signature
    ) {
      return null;
    }
    const key = await routeCatalogCursorHmacKey(signingSecret, ['verify']);
    const verified = await crypto.subtle.verify(
      'HMAC',
      key,
      decodeCursorBytes(signature),
      routeCatalogCursorSigningPayload(routeId, fingerprint),
    );
    if (!verified) return null;
    return { routeId };
  } catch {
    return null;
  }
}

export type RouteCatalogSafeExclusionReason =
  | 'missing_geometry'
  | 'invalid_geometry'
  | 'access_unverified'
  | 'current_condition_blocked'
  | 'source_restricted'
  | 'moderation_pending'
  | 'vehicle_incompatible'
  | 'date_or_season_blocked'
  | 'stale_required_source'
  | 'unsupported_route_type';

export type RouteCatalogSafeDiagnosticRecord = {
  routeId: string;
  publicId: string | null;
  name: string | null;
  exclusionReasons: RouteCatalogSafeExclusionReason[];
  sourceTypes: string[];
  reviewStatus: string | null;
  recommendationStatus: string | null;
  updatedAt: string | null;
};

export type RouteCatalogPublicEligibilityOptions = {
  includeGeometry?: boolean;
  includePreviewGeometry?: boolean;
  nowMs?: number;
};

type UnknownRecord = Record<string, unknown>;

function readRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map(cleanText).filter(Boolean)
    : [];
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function sourceRecords(record: UnknownRecord): UnknownRecord[] {
  const raw = record.source_records ?? record.sourceRecords;
  return Array.isArray(raw)
    ? raw.map(readRecord).filter((source): source is UnknownRecord => !!source)
    : [];
}

function sourceType(source: UnknownRecord): string {
  return cleanText(source.source_type ?? source.sourceType).toLowerCase();
}

const ROUTE_CATALOG_PUBLIC_ROUTE_TYPES = new Set([
  'loop',
  'out_and_back',
  'point_to_point',
  'area_pack',
]);
const ROUTE_CATALOG_AUTHORITATIVE_SOURCE_TYPES = new Set([
  'official',
  'federal_agency',
  'state_agency',
  'county_agency',
]);
const ROUTE_CATALOG_RESTRICTED_PROVIDER_IDS = new Set([
  'bdr_partner_restricted',
  'bdr',
  'ride_bdr',
  'backcountry_discovery_routes',
  'california_state_parks_roads_trails_restricted',
  'california_state_parks_roads_trails',
  'california_state_parks',
  'ca_state_parks_roads_trails',
]);
const ROUTE_CATALOG_OFFICIAL_ACCESS_MIN_PCT = 80;
const ROUTE_CATALOG_UNKNOWN_ACCESS_MAX_PCT = 20;
const ROUTE_CATALOG_SOURCE_STALE_DAYS = 365;
const ROUTE_CATALOG_IMPOSSIBLE_JUMP_MILES = 80;

function sourceProviderId(source: UnknownRecord): string {
  return cleanText(source.provider_id ?? source.providerId ?? source.source_key ?? source.sourceKey)
    .toLowerCase();
}

function sourceLabel(source: UnknownRecord): string {
  return cleanText(source.label ?? source.source_name ?? source.sourceName ?? source.name);
}

function sourceAuthority(source: UnknownRecord): string {
  return cleanText(source.authority ?? source.authority_level ?? source.authorityLevel).toLowerCase();
}

function sourceLastVerifiedAt(source: UnknownRecord): string {
  return cleanText(
    source.last_verified_at ?? source.lastVerifiedAt ?? source.last_seen_at ?? source.lastSeenAt,
  );
}

function hasValidSourceIdentity(source: UnknownRecord): boolean {
  return !!sourceProviderId(source) && !!sourceLabel(source);
}

function isAuthoritativeSource(source: UnknownRecord): boolean {
  return ROUTE_CATALOG_AUTHORITATIVE_SOURCE_TYPES.has(sourceType(source)) ||
    /official|agency|authoritative|mvum|gtlf/i.test(sourceAuthority(source));
}

function isSourceFreshEnough(source: UnknownRecord, nowMs: number): boolean {
  const verifiedAtMs = Date.parse(sourceLastVerifiedAt(source));
  if (!Number.isFinite(verifiedAtMs)) return false;
  const ageDays = Math.max(0, Math.round((nowMs - verifiedAtMs) / 86_400_000));
  return ageDays <= ROUTE_CATALOG_SOURCE_STALE_DAYS;
}

function hasKnownRestrictedProvider(source: UnknownRecord): boolean {
  return ROUTE_CATALOG_RESTRICTED_PROVIDER_IDS.has(sourceProviderId(source));
}

function coordinatePair(value: unknown): { latitude: number; longitude: number } | null {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  ) {
    return null;
  }
  return { latitude, longitude };
}

function routeGeometryPoints(record: UnknownRecord): { latitude: number; longitude: number }[] {
  const geometry = readRecord(record.route_geometry ?? record.routeGeometry ?? record.geometry);
  if (!geometry || !Array.isArray(geometry.coordinates)) return [];
  if (geometry.type === 'LineString') {
    return geometry.coordinates
      .map(coordinatePair)
      .filter((point): point is { latitude: number; longitude: number } => !!point);
  }
  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates
      .filter(Array.isArray)
      .map((line) => line
        .map(coordinatePair)
        .filter((point): point is { latitude: number; longitude: number } => !!point))
      .filter((line) => line.length >= 2)
      .flat();
  }
  return [];
}

function routeCenterIsValid(record: UnknownRecord): boolean {
  const latitude = readNumber(record.center_latitude ?? record.centerLatitude ?? record.latitude ?? record.lat);
  const longitude = readNumber(
    record.center_longitude ?? record.centerLongitude ?? record.longitude ?? record.lng ?? record.lon,
  );
  return latitude != null && longitude != null && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

function distanceMiles(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const toRadians = (value: number) => value * Math.PI / 180;
  const deltaLatitude = toRadians(right.latitude - left.latitude);
  const deltaLongitude = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(leftLatitude) * Math.cos(rightLatitude) * Math.sin(deltaLongitude / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function hasImpossibleGeometryJump(points: { latitude: number; longitude: number }[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (distanceMiles(points[index - 1], points[index]) > ROUTE_CATALOG_IMPOSSIBLE_JUMP_MILES) {
      return true;
    }
  }
  return false;
}

export function hasRestrictedRouteCatalogSource(value: unknown): boolean {
  const record = readRecord(value);
  if (!record) return false;
  const directSource = cleanText(record.source).toLowerCase();
  if (directSource === 'partner_source' || directSource === 'partner_restricted') return true;
  return sourceRecords(record).some((source) => {
    const type = sourceType(source);
    const authority = cleanText(source.authority).toLowerCase();
    const permission = cleanText(source.use_permission ?? source.usePermission).toLowerCase();
    return (
      hasKnownRestrictedProvider(source) ||
      type === 'partner_restricted' ||
      authority === 'partner_restricted' ||
      permission === 'not_granted'
    );
  });
}

function blockerText(record: UnknownRecord): string {
  return [
    ...readStringArray(record.blocker_reasons ?? record.blockerReasons),
    ...readStringArray(record.warning_reasons ?? record.warningReasons),
    ...readStringArray(record.closure_summaries ?? record.closureSummaries),
  ].join(' ').toLowerCase();
}

function routeCatalogSafeExclusionReasons(record: UnknownRecord): RouteCatalogSafeExclusionReason[] {
  const reasons: RouteCatalogSafeExclusionReason[] = [];
  const blockers = blockerText(record);
  const geometryQuality = cleanText(record.geometry_quality ?? record.geometryQuality).toLowerCase();
  const reviewStatus = cleanText(record.review_status ?? record.reviewStatus).toLowerCase();
  const routeType = cleanText(record.route_type ?? record.routeType).toLowerCase();
  const officialAccess = readNumber(record.official_access_coverage_pct ?? record.officialAccessCoveragePct);
  const unknownAccess = readNumber(record.unknown_access_coverage_pct ?? record.unknownAccessCoveragePct);
  const restrictedAccess = readNumber(record.restricted_access_coverage_pct ?? record.restrictedAccessCoveragePct);
  const activeClosures = readNumber(record.active_closure_count ?? record.activeClosureCount);
  const seasonalRestrictions = readNumber(record.seasonal_restriction_count ?? record.seasonalRestrictionCount);
  const staleAt = cleanText(record.stale_at ?? record.staleAt);

  if (geometryQuality === 'missing' || /geometry[^.]*\bmissing|incomplete geometry/.test(blockers)) {
    reasons.push('missing_geometry');
  }
  if (geometryQuality === 'poor' || /invalid geometry|impossible jump|malformed geometry/.test(blockers)) {
    reasons.push('invalid_geometry');
  }
  if (
    (officialAccess != null && officialAccess < 80) ||
    (unknownAccess != null && unknownAccess > 20) ||
    /legal.?access|access[^.]*unverified|official access/.test(blockers)
  ) {
    reasons.push('access_unverified');
  }
  if (
    (activeClosures != null && activeClosures > 0) ||
    (restrictedAccess != null && restrictedAccess > 0) ||
    /closure|closed|current condition|restricted access|prohibited access/.test(blockers)
  ) {
    reasons.push('current_condition_blocked');
  }
  if (hasRestrictedRouteCatalogSource(record) || /partner|licensed source|source restriction/.test(blockers)) {
    reasons.push('source_restricted');
  }
  if (reviewStatus && reviewStatus !== 'approved') reasons.push('moderation_pending');
  if (record.vehicle_mismatch === true || record.vehicleMismatch === true || /vehicle[^.]*mismatch/.test(blockers)) {
    reasons.push('vehicle_incompatible');
  }
  if ((seasonalRestrictions != null && seasonalRestrictions > 0) || /season|trip date/.test(blockers)) {
    reasons.push('date_or_season_blocked');
  }
  if ((staleAt && Date.parse(staleAt) <= Date.now()) || /stale/.test(blockers)) {
    reasons.push('stale_required_source');
  }
  if (!['loop', 'out_and_back', 'point_to_point', 'area_pack'].includes(routeType)) {
    reasons.push('unsupported_route_type');
  }

  // Non-recommendable records must never become an unexplained diagnostic. When
  // the provider has no more specific typed signal, access remains unverified.
  if (reasons.length === 0) reasons.push('access_unverified');
  return unique(reasons);
}

export function buildSafeRouteCatalogDiagnostic(value: unknown): RouteCatalogSafeDiagnosticRecord | null {
  const record = readRecord(value);
  if (!record) return null;
  const routeId = cleanText(record.id ?? record.route_id ?? record.routeId ?? record.public_id ?? record.publicId);
  if (!routeId) return null;
  const sources = sourceRecords(record);
  return {
    routeId,
    publicId: cleanText(record.public_id ?? record.publicId) || null,
    name: cleanText(record.name ?? record.title) || null,
    exclusionReasons: routeCatalogSafeExclusionReasons(record),
    sourceTypes: unique(sources.map(sourceType).filter(Boolean)),
    reviewStatus: cleanText(record.review_status ?? record.reviewStatus) || null,
    recommendationStatus: cleanText(record.recommendation_status ?? record.recommendationStatus) || null,
    updatedAt: cleanText(record.updated_at ?? record.updatedAt) || null,
  };
}

function publicEligibilityExclusionReasons(
  record: UnknownRecord,
  options: RouteCatalogPublicEligibilityOptions,
): RouteCatalogSafeExclusionReason[] {
  const reasons: RouteCatalogSafeExclusionReason[] = [];
  const nowMs = typeof options.nowMs === 'number' && Number.isFinite(options.nowMs)
    ? options.nowMs
    : Date.now();
  const routeId = cleanText(record.id ?? record.route_id ?? record.routeId);
  const publicId = cleanText(record.public_id ?? record.publicId);
  const name = cleanText(record.name ?? record.title);
  const routeType = cleanText(record.route_type ?? record.routeType).toLowerCase();
  const reviewStatus = cleanText(record.review_status ?? record.reviewStatus).toLowerCase();
  const recommendationStatus = cleanText(
    record.recommendation_status ?? record.recommendationStatus,
  ).toLowerCase();
  const officialAccess = readNumber(
    record.official_access_coverage_pct ?? record.officialAccessCoveragePct,
  ) ?? 0;
  const unknownAccess = readNumber(
    record.unknown_access_coverage_pct ?? record.unknownAccessCoveragePct,
  ) ?? 100;
  const restrictedAccess = readNumber(
    record.restricted_access_coverage_pct ?? record.restrictedAccessCoveragePct,
  ) ?? 0;
  const activeClosures = readNumber(record.active_closure_count ?? record.activeClosureCount) ?? 0;
  const currentCondition = readRecord(record.current_condition ?? record.currentCondition);
  const currentConditionBlockers = readStringArray(
    currentCondition?.blockers ?? currentCondition?.blocker_reasons ?? currentCondition?.blockerReasons,
  );
  const rawGeometry = record.route_geometry ?? record.routeGeometry ?? record.geometry;
  const hasRawGeometry = rawGeometry != null;
  const points = routeGeometryPoints(record);
  const geometryQuality = cleanText(record.geometry_quality ?? record.geometryQuality).toLowerCase();
  const effectiveGeometryMode = options.includeGeometry
    ? 'full'
    : options.includePreviewGeometry && points.length >= 2
      ? 'preview_simplified'
      : 'omitted';
  const geometryOmittedFromLightweightSearch =
    effectiveGeometryMode === 'omitted' &&
    (geometryQuality === 'good' || geometryQuality === 'partial') &&
    recommendationStatus !== 'not_recommended';
  const validSources = sourceRecords(record).filter(hasValidSourceIdentity);
  const authoritativeSources = validSources.filter(isAuthoritativeSource);

  const responseCanDeriveCenterFromGeometry =
    effectiveGeometryMode !== 'omitted' && points.length >= 2;
  if (
    (!routeId && !publicId) ||
    !name ||
    (!routeCenterIsValid(record) && !responseCanDeriveCenterFromGeometry)
  ) {
    reasons.push('access_unverified');
  }
  if (!ROUTE_CATALOG_PUBLIC_ROUTE_TYPES.has(routeType)) reasons.push('unsupported_route_type');
  if (reviewStatus !== 'approved') reasons.push('moderation_pending');
  if (recommendationStatus === 'not_recommended') reasons.push('access_unverified');
  if (
    officialAccess < ROUTE_CATALOG_OFFICIAL_ACCESS_MIN_PCT ||
    unknownAccess > ROUTE_CATALOG_UNKNOWN_ACCESS_MAX_PCT
  ) {
    reasons.push('access_unverified');
  }
  if (restrictedAccess > 0 || activeClosures > 0 || currentConditionBlockers.length > 0) {
    reasons.push('current_condition_blocked');
  }
  if (record.vehicle_mismatch === true || record.vehicleMismatch === true) {
    reasons.push('vehicle_incompatible');
  }
  if (hasRestrictedRouteCatalogSource(record)) reasons.push('source_restricted');
  if (authoritativeSources.length === 0) {
    reasons.push('access_unverified');
  } else if (authoritativeSources.every((source) => !isSourceFreshEnough(source, nowMs))) {
    reasons.push('stale_required_source');
  }
  if (hasRawGeometry && points.length < 2) {
    reasons.push('invalid_geometry');
  } else if (points.length >= 2 && hasImpossibleGeometryJump(points)) {
    reasons.push('invalid_geometry');
  } else if (
    !geometryOmittedFromLightweightSearch &&
    (points.length < 2 || effectiveGeometryMode === 'omitted')
  ) {
    reasons.push('missing_geometry');
  }

  return unique(reasons);
}

/**
 * Mirrors the client public-recommendation gates at the Edge boundary. This
 * partition must run over the complete inspected candidate pool before user
 * refinement, ranking, identity dedupe, or the public 20-route slice.
 */
export function partitionRouteCatalogRecordsByPublicEligibility(
  values: UnknownRecord[],
  options: RouteCatalogPublicEligibilityOptions = {},
): { records: UnknownRecord[]; diagnosticRecords: RouteCatalogSafeDiagnosticRecord[] } {
  const records: UnknownRecord[] = [];
  const diagnosticRecords: RouteCatalogSafeDiagnosticRecord[] = [];

  values.forEach((record) => {
    const exclusionReasons = publicEligibilityExclusionReasons(record, options);
    if (exclusionReasons.length === 0) {
      records.push(record);
      return;
    }
    const diagnostic = buildSafeRouteCatalogDiagnostic(record);
    if (!diagnostic) return;
    diagnosticRecords.push({
      ...diagnostic,
      exclusionReasons: unique([...exclusionReasons, ...diagnostic.exclusionReasons]),
    });
  });

  return { records, diagnosticRecords };
}

export function partitionRestrictedRouteCatalogRecords(
  values: UnknownRecord[],
): { records: UnknownRecord[]; diagnosticRecords: RouteCatalogSafeDiagnosticRecord[] } {
  const records: UnknownRecord[] = [];
  const diagnosticRecords: RouteCatalogSafeDiagnosticRecord[] = [];
  values.forEach((record) => {
    if (!hasRestrictedRouteCatalogSource(record)) {
      records.push(record);
      return;
    }
    const diagnostic = buildSafeRouteCatalogDiagnostic(record);
    if (diagnostic) diagnosticRecords.push(diagnostic);
  });
  return { records, diagnosticRecords };
}

export function partitionRouteCatalogRecordsForPage(
  values: UnknownRecord[],
  options: { offset: number; pageSize: number },
): {
  records: UnknownRecord[];
  diagnosticRecords: RouteCatalogSafeDiagnosticRecord[];
  revealableMatchedCount: number;
  hasMoreRevealable: boolean;
} {
  const partition = partitionRestrictedRouteCatalogRecords(values);
  const offset = Math.max(0, Math.floor(options.offset));
  const pageSize = Math.max(1, Math.floor(options.pageSize));
  const windowEnd = offset + pageSize;
  return {
    records: partition.records.slice(offset, windowEnd),
    diagnosticRecords: partition.diagnosticRecords,
    revealableMatchedCount: partition.records.length,
    hasMoreRevealable: partition.records.length > windowEnd,
  };
}

export function normalizeRouteCatalogResultLimit(value: unknown): number {
  const requestedLimit = readNumber(value);
  if (requestedLimit == null || requestedLimit <= 0) {
    return ROUTE_CATALOG_SEARCH_RESULT_LIMIT;
  }
  return Math.min(
    ROUTE_CATALOG_SEARCH_RESULT_LIMIT,
    Math.max(1, Math.floor(requestedLimit)),
  );
}

export function nextRouteCatalogCandidateInspectionBatch(
  inspectedCount: number,
): { pageSize: number; queryLimit: number } | null {
  const inspected = Math.max(0, Math.floor(readNumber(inspectedCount) ?? 0));
  const remaining = ROUTE_CATALOG_MAX_PAGINATION_WINDOW - inspected;
  if (remaining <= 0) return null;
  const pageSize = Math.min(ROUTE_CATALOG_CANDIDATE_INSPECTION_LIMIT, remaining);
  return { pageSize, queryLimit: pageSize + 1 };
}

function routeCatalogRecordIdentity(record: UnknownRecord): string {
  return cleanText(record.public_id ?? record.publicId) ||
    cleanText(record.id ?? record.route_id ?? record.routeId);
}

/**
 * Applies the public total-search contract after provider filtering and ranking.
 * Candidate inspection remains wider and independently bounded by the caller.
 */
export function selectRouteCatalogSearchResults(
  values: UnknownRecord[],
  options: {
    requestedLimit?: unknown;
    compareRecords?: (left: UnknownRecord, right: UnknownRecord) => number;
  } = {},
): {
  records: UnknownRecord[];
  diagnosticRecords: RouteCatalogSafeDiagnosticRecord[];
  revealableMatchedCount: number;
  additionalMatchesAvailable: boolean;
  resultLimit: number;
} {
  const partition = partitionRestrictedRouteCatalogRecords(values);
  const rankedRecords = [...partition.records].sort((left, right) => {
    const rankDelta = options.compareRecords?.(left, right) ?? 0;
    if (rankDelta !== 0) return rankDelta;
    const identityDelta = routeCatalogRecordIdentity(left).localeCompare(
      routeCatalogRecordIdentity(right),
    );
    if (identityDelta !== 0) return identityDelta;
    return cleanText(left.id ?? left.route_id ?? left.routeId).localeCompare(
      cleanText(right.id ?? right.route_id ?? right.routeId),
    );
  });
  const seen = new Set<string>();
  const uniqueRankedRecords: UnknownRecord[] = [];
  rankedRecords.forEach((record) => {
    const identity = routeCatalogRecordIdentity(record);
    if (!identity || seen.has(identity)) return;
    seen.add(identity);
    uniqueRankedRecords.push(record);
  });
  const resultLimit = normalizeRouteCatalogResultLimit(options.requestedLimit);
  return {
    records: uniqueRankedRecords.slice(0, resultLimit),
    diagnosticRecords: partition.diagnosticRecords,
    revealableMatchedCount: uniqueRankedRecords.length,
    additionalMatchesAvailable: uniqueRankedRecords.length > resultLimit,
    resultLimit,
  };
}

export function expandRouteCatalogCandidateLimit(currentLimit: number, pageSize: number): number {
  const current = Math.max(1, Math.floor(currentLimit));
  const increment = Math.max(1, Math.floor(pageSize));
  return Math.min(
    ROUTE_CATALOG_MAX_PAGINATION_WINDOW,
    Math.max(current + increment, current * 2),
  );
}

export function normalizeRouteCatalogPagination(
  value: UnknownRecord,
): {
  page: number;
  pageSize: number;
  offset: number;
  windowEnd: number;
  windowExceeded: boolean;
} {
  const requestedPageSize = readNumber(value.pageSize ?? value.page_size ?? value.limit);
  const pageSize = normalizeRouteCatalogResultLimit(requestedPageSize);
  return {
    // Public route search is a single bounded result set. Page/offset inputs are
    // intentionally normalized away so callers cannot accumulate more than 20
    // routes by replaying the same search with continuation parameters.
    page: 1,
    pageSize,
    offset: 0,
    windowEnd: pageSize,
    windowExceeded: false,
  };
}
