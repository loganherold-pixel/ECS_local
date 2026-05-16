import type { CampSite, CampSiteJsonObject, CampSiteReport } from './campsiteRecommendationTypes';

export const CAMPSITE_CONFIRMATION_SPAM_WINDOW_MS = 6 * 60 * 60 * 1000;
export const CAMPSITE_STALE_CONFIRMED_AFTER_MS = 18 * 30 * 24 * 60 * 60 * 1000;

export type CampSiteTrustLabel =
  | 'High confidence'
  | 'Medium confidence'
  | 'Low confidence'
  | 'Unverified';

export interface CampSiteTrustScoreInput {
  originalVerifiedInPerson?: boolean | null;
  originalUserStayedHere?: boolean | null;
  originalLocationAccuracyM?: number | null;
  approvedPhotoCount?: number | null;
  uniqueConfirmationCount?: number | null;
  unresolvedFlagCount?: number | null;
  lastConfirmedAt?: string | null;
  now?: number;
}

export interface CampSiteTrustMetadata {
  original_verified_in_person?: boolean;
  original_user_stayed_here?: boolean;
  original_location_accuracy_m?: number | null;
  approved_photo_count?: number;
}

export const CAMPSITE_TRUST_METADATA_KEY = 'ecs_trust';

function clampScore(score: number): number {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function getCampSiteTrustLabel(score: number | null | undefined): CampSiteTrustLabel {
  if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0) return 'Unverified';
  if (score >= 80) return 'High confidence';
  if (score >= 50) return 'Medium confidence';
  return 'Low confidence';
}

export function calculateCampSiteTrustScore(input: CampSiteTrustScoreInput): number {
  let score = 0;

  if (input.originalVerifiedInPerson) score += 20;
  if (input.originalUserStayedHere) score += 20;

  const accuracy = finiteNumber(input.originalLocationAccuracyM);
  if (accuracy !== null && accuracy <= 50) score += 10;

  if ((input.approvedPhotoCount ?? 0) > 0) score += 10;

  const confirmations = Math.max(0, Math.floor(input.uniqueConfirmationCount ?? 0));
  score += Math.min(30, confirmations * 5);

  const flags = Math.max(0, Math.floor(input.unresolvedFlagCount ?? 0));
  score -= Math.min(40, flags * 10);

  if (input.lastConfirmedAt) {
    const confirmedAt = Date.parse(input.lastConfirmedAt);
    if (Number.isFinite(confirmedAt) && (input.now ?? Date.now()) - confirmedAt > CAMPSITE_STALE_CONFIRMED_AFTER_MS) {
      score -= 15;
    }
  }

  return clampScore(score);
}

export function buildTrustMetadataFromReport(
  report: Pick<CampSiteReport, 'verified_in_person' | 'user_stayed_here' | 'location_accuracy_m'>,
  approvedPhotoCount = 0,
): CampSiteTrustMetadata {
  return {
    original_verified_in_person: report.verified_in_person,
    original_user_stayed_here: report.user_stayed_here,
    original_location_accuracy_m: finiteNumber(report.location_accuracy_m),
    approved_photo_count: Math.max(0, Math.floor(approvedPhotoCount)),
  };
}

export function readTrustMetadata(conditions: CampSiteJsonObject | null | undefined): CampSiteTrustMetadata {
  const raw = conditions?.[CAMPSITE_TRUST_METADATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const object = raw as Record<string, unknown>;
  return {
    original_verified_in_person:
      typeof object.original_verified_in_person === 'boolean'
        ? object.original_verified_in_person
        : undefined,
    original_user_stayed_here:
      typeof object.original_user_stayed_here === 'boolean'
        ? object.original_user_stayed_here
        : undefined,
    original_location_accuracy_m: finiteNumber(object.original_location_accuracy_m),
    approved_photo_count: Math.max(0, Math.floor(finiteNumber(object.approved_photo_count) ?? 0)),
  };
}

export function writeTrustMetadata(
  conditions: CampSiteJsonObject,
  metadata: CampSiteTrustMetadata,
): CampSiteJsonObject {
  return {
    ...conditions,
    [CAMPSITE_TRUST_METADATA_KEY]: metadata,
  };
}

export function calculateTrustScoreForCampSite(
  campSite: Pick<CampSite, 'conditions' | 'confirmation_count' | 'flag_count' | 'last_confirmed_at'>,
): number {
  const metadata = readTrustMetadata(campSite.conditions);
  return calculateCampSiteTrustScore({
    originalVerifiedInPerson: metadata.original_verified_in_person,
    originalUserStayedHere: metadata.original_user_stayed_here,
    originalLocationAccuracyM: metadata.original_location_accuracy_m,
    approvedPhotoCount: metadata.approved_photo_count,
    uniqueConfirmationCount: campSite.confirmation_count,
    unresolvedFlagCount: campSite.flag_count,
    lastConfirmedAt: campSite.last_confirmed_at,
  });
}

export function hasRecentUserConfirmation(
  reports: Pick<CampSiteReport, 'camp_site_id' | 'created_at' | 'moderation_status' | 'verified_in_person'>[],
  campSiteId: string,
  now = Date.now(),
): boolean {
  return reports.some((report) => {
    if (report.camp_site_id !== campSiteId) return false;
    if (report.moderation_status !== 'approved') return false;
    if (!report.verified_in_person) return false;
    const createdAt = Date.parse(report.created_at);
    return Number.isFinite(createdAt) && now - createdAt < CAMPSITE_CONFIRMATION_SPAM_WINDOW_MS;
  });
}
