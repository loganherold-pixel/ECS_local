export const ROUTE_CATALOG_MAX_PAGE_SIZE = 500;
export const ROUTE_CATALOG_MAX_PAGINATION_WINDOW = 2_000;

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

export function normalizeRouteCatalogPagination(
  value: UnknownRecord,
): {
  page: number;
  pageSize: number;
  offset: number;
  windowEnd: number;
  windowExceeded: boolean;
} {
  const requestedPage = readNumber(value.page);
  const requestedPageSize = readNumber(value.pageSize ?? value.page_size ?? value.limit);
  const page = requestedPage != null && requestedPage >= 1 ? Math.floor(requestedPage) : 1;
  const pageSize = Math.max(
    1,
    Math.min(
      ROUTE_CATALOG_MAX_PAGE_SIZE,
      requestedPageSize != null && requestedPageSize > 0 ? Math.round(requestedPageSize) : 200,
    ),
  );
  const explicitOffset = readNumber(value.offset);
  const offset = explicitOffset != null && explicitOffset >= 0
    ? Math.floor(explicitOffset)
    : (page - 1) * pageSize;
  const windowEnd = offset + pageSize;
  return {
    page,
    pageSize,
    offset,
    windowEnd,
    windowExceeded: windowEnd > ROUTE_CATALOG_MAX_PAGINATION_WINDOW,
  };
}
