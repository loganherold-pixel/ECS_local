import type { ECSTrailPack, ECSTrailPackCoordinate } from './trailPacks';

export type ECSTrailPackConfidenceBand = 'low' | 'moderate' | 'high' | 'verified';

export type ECSTrailPackProviderStatus =
  | 'clear'
  | 'watch'
  | 'restricted'
  | 'conflict'
  | 'unknown'
  | 'unavailable';

export type ECSTrailPackRouteSnapStatus = 'matched' | 'partial' | 'mismatch' | 'unavailable';

export type ECSTrailPackConfidenceInput = {
  saveCount?: number;
  independentConfirmationCount?: number;
  lastCompletedAt?: string;
  recentHazardReportsCount?: number;
  closureStatus?: ECSTrailPackProviderStatus;
  weatherStatus?: ECSTrailPackProviderStatus;
  fireSmokeStatus?: ECSTrailPackProviderStatus;
  routeSnapStatus?: ECSTrailPackRouteSnapStatus;
  offlineCacheReady?: boolean | null;
  vehicleFitMatchesSelectedProfile?: boolean | null;
  feedbackNeedsReview?: boolean;
  feedbackBlockers?: string[];
};

export type ECSTrailPackConfidence = {
  score: number;
  band: ECSTrailPackConfidenceBand;
  reasons: string[];
  warnings: string[];
  blockers: string[];
  lastEvaluatedAt: string;
};

const MS_PER_DAY = 86400000;
const IMPOSSIBLE_JUMP_MILES = 80;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function unique(values: string[], limit = 6): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const clean = value.trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
    if (out.length >= limit) break;
  }
  return out;
}

function bandFromScore(score: number): ECSTrailPackConfidenceBand {
  if (score >= 90) return 'verified';
  if (score >= 70) return 'high';
  if (score >= 40) return 'moderate';
  return 'low';
}

function daysSince(isoDate: string | undefined, nowMs: number): number | null {
  if (!isoDate) return null;
  const timestamp = Date.parse(isoDate);
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.round((nowMs - timestamp) / MS_PER_DAY));
}

function distanceMiles(left: ECSTrailPackCoordinate, right: ECSTrailPackCoordinate): number {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusMiles = 3958.7613;
  const dLat = toRadians(right.latitude - left.latitude);
  const dLng = toRadians(right.longitude - left.longitude);
  const lat1 = toRadians(left.latitude);
  const lat2 = toRadians(right.latitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusMiles * c;
}

function geometryCoordinates(pack: Pick<ECSTrailPack, 'routeGeometry'>): ECSTrailPackCoordinate[] {
  const geometry = pack.routeGeometry;
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

function routeLengthFromGeometry(points: ECSTrailPackCoordinate[]): number {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += distanceMiles(points[index - 1], points[index]);
  }
  return total;
}

function hasImpossibleJump(points: ECSTrailPackCoordinate[]): boolean {
  for (let index = 1; index < points.length; index += 1) {
    if (distanceMiles(points[index - 1], points[index]) > IMPOSSIBLE_JUMP_MILES) {
      return true;
    }
  }
  return false;
}

function isLoop(points: ECSTrailPackCoordinate[]): boolean {
  if (points.length < 3) return false;
  return distanceMiles(points[0], points[points.length - 1]) <= 0.5;
}

function communitySignalScore(pack: ECSTrailPack, input: ECSTrailPackConfidenceInput, reasons: string[], warnings: string[]): number {
  const positive = Math.max(0, pack.positiveFeedbackCount ?? 0);
  const negative = Math.max(0, pack.negativeFeedbackCount ?? 0);
  const completions = Math.max(0, pack.completionCount ?? 0);
  const saves = Math.max(0, input.saveCount ?? 0);
  const confirmations = Math.max(0, input.independentConfirmationCount ?? 0);
  const recentHazards = Math.max(0, input.recentHazardReportsCount ?? 0);

  if (positive === 0 && completions === 0 && confirmations === 0) {
    warnings.push('Community confirmations limited');
    return negative > 0 ? 4 : 8;
  }

  let score = 8;
  score += Math.min(8, positive * 0.55);
  score += Math.min(7, completions * 0.75);
  score += Math.min(5, confirmations * 1.4);
  score += Math.min(3, saves * 0.25);
  score -= Math.min(12, negative * 2.5);
  score -= Math.min(8, recentHazards * 3);

  if (positive >= 10) reasons.push(`Route has ${positive} positive ECS report${positive === 1 ? '' : 's'}`);
  if (completions >= 5) reasons.push(`Route completed by ${completions} ECS user${completions === 1 ? '' : 's'}`);
  if (confirmations >= 2) reasons.push(`${confirmations} independent confirmations are available`);
  if (negative > 0) warnings.push(`${negative} negative report${negative === 1 ? '' : 's'} require review`);
  if (recentHazards > 0) warnings.push('Recent hazard reports need review');

  return Math.max(0, Math.min(25, score));
}

function integrityScore(pack: ECSTrailPack, input: ECSTrailPackConfidenceInput, reasons: string[], warnings: string[], blockers: string[]): number {
  const points = geometryCoordinates(pack);
  const declaredLength = Number(pack.distanceMiles);
  const geometryLength = routeLengthFromGeometry(points);
  const hasLength = Number.isFinite(declaredLength) && declaredLength > 0;

  if (points.length < 2) {
    blockers.push('Route geometry is incomplete');
    return 0;
  }

  let score = 18;
  reasons.push('Route geometry is available');

  if (hasLength || geometryLength > 0.1) {
    score += 5;
    reasons.push('Route length is usable');
  } else {
    blockers.push('Route is zero-length');
    return 0;
  }

  if (hasImpossibleJump(points)) {
    blockers.push('Route geometry contains impossible jumps');
    return 8;
  }
  score += 5;

  if (pack.routeType === 'loop' || isLoop(points)) {
    score += 4;
    reasons.push('Usable loop structure detected');
  } else if (pack.routeType === 'point_to_point' || pack.routeType === 'out_and_back' || pack.routeType === 'area_pack') {
    score += 3;
    reasons.push('Usable route structure is present');
  } else {
    warnings.push('Route structure needs review');
  }

  switch (input.routeSnapStatus ?? 'unavailable') {
    case 'matched':
      score += 3;
      reasons.push('Geometry matches known trail corridor');
      break;
    case 'partial':
      score += 1;
      warnings.push('Route snapping is only partial');
      break;
    case 'mismatch':
      blockers.push('Route does not match expected road/trail corridor');
      break;
    case 'unavailable':
    default:
      warnings.push('Known road/trail snapping unavailable');
      break;
  }

  return Math.max(0, Math.min(35, score));
}

function recencyScore(pack: ECSTrailPack, input: ECSTrailPackConfidenceInput, nowMs: number, reasons: string[], warnings: string[]): number {
  const verifiedDays = daysSince(pack.lastVerifiedAt, nowMs);
  const completedDays = daysSince(input.lastCompletedAt, nowMs);
  const submissionAge = daysSince(pack.createdAt, nowMs);

  let score = 6;

  if (verifiedDays != null) {
    if (verifiedDays <= 30) {
      score += 10;
      reasons.push('Recent verification within 30 days');
    } else if (verifiedDays <= 120) {
      score += 8;
      reasons.push(`Verified ${verifiedDays} days ago`);
    } else if (verifiedDays <= 240) {
      score += 4;
      warnings.push('Verification is aging');
    } else {
      warnings.push('Trail Pack verification is stale');
    }
  } else {
    warnings.push('Last verified date unavailable');
  }

  if (completedDays != null) {
    if (completedDays <= 60) {
      score += 4;
      reasons.push('Recent completion signal is available');
    } else if (completedDays <= 180) {
      score += 2;
    } else {
      warnings.push('Last completion signal is stale');
    }
  }

  if (submissionAge != null && submissionAge <= 180) {
    score += 2;
  }

  return Math.max(0, Math.min(20, score));
}

function operationalScore(pack: ECSTrailPack, input: ECSTrailPackConfidenceInput, reasons: string[], warnings: string[], blockers: string[]): number {
  let score = 8;

  if ((pack.vehicleFit?.length ?? 0) > 0) {
    score += 3;
    reasons.push('Vehicle fit guidance is available');
  } else {
    warnings.push('Vehicle fit unavailable');
  }

  if (input.vehicleFitMatchesSelectedProfile === true) {
    score += 3;
    reasons.push('Vehicle fit matches selected profile');
  } else if (input.vehicleFitMatchesSelectedProfile === false) {
    warnings.push('Vehicle fit does not match selected profile');
    score -= 4;
  }

  switch (input.closureStatus ?? 'unavailable') {
    case 'clear':
      score += 4;
      reasons.push('No active closure conflict found');
      break;
    case 'restricted':
    case 'conflict':
      blockers.push('Route crosses restricted area');
      break;
    case 'unknown':
      warnings.push('Closure validation unknown');
      break;
    case 'unavailable':
    default:
      warnings.push('Closure validation unavailable');
      break;
  }

  switch (input.weatherStatus ?? 'unavailable') {
    case 'clear':
      score += 2;
      break;
    case 'watch':
      warnings.push('Weather risk requires review');
      score -= 2;
      break;
    case 'restricted':
    case 'conflict':
      warnings.push('Weather risk is elevated');
      score -= 5;
      break;
    case 'unknown':
      warnings.push('Weather context unknown');
      break;
    case 'unavailable':
    default:
      warnings.push('Weather context unavailable');
      break;
  }

  switch (input.fireSmokeStatus ?? 'unavailable') {
    case 'clear':
      score += 1;
      break;
    case 'watch':
      warnings.push('Fire or smoke risk requires review');
      score -= 2;
      break;
    case 'restricted':
    case 'conflict':
      warnings.push('Fire or smoke conflict needs review');
      score -= 4;
      break;
    case 'unknown':
      warnings.push('Fire/smoke context unknown');
      break;
    case 'unavailable':
    default:
      warnings.push('Fire/smoke validation unavailable');
      break;
  }

  if (input.offlineCacheReady === true) {
    score += 2;
    reasons.push('Offline cache readiness is available');
  } else if (input.offlineCacheReady === false) {
    warnings.push('Offline cache readiness unavailable');
  } else {
    warnings.push('Offline cache readiness not evaluated');
  }

  if (input.feedbackNeedsReview) {
    warnings.push('Community feedback requires review');
    score -= 5;
  }

  (input.feedbackBlockers ?? []).forEach((blocker) => blockers.push(blocker));

  return Math.max(0, Math.min(20, score));
}

function sourceAdjustment(pack: ECSTrailPack, reasons: string[], warnings: string[], blockers: string[]): number {
  switch (pack.reviewStatus) {
    case 'approved':
      break;
    case 'rejected':
      blockers.push('Route was rejected by community review');
      return -100;
    case 'pending_review':
      warnings.push('Trail Pack is pending review');
      return -18;
    case 'needs_more_data':
      warnings.push('Trail Pack needs more review data');
      return -14;
    case 'draft':
    default:
      warnings.push('Trail Pack is not approved for public suggestions');
      return -22;
  }

  switch (pack.source) {
    case 'ecs_validated':
      reasons.push('ECS validated source signal is present');
      return 6;
    case 'community_reviewed':
      reasons.push('Community reviewed source signal is present');
      return 4;
    case 'imported_gpx':
    case 'imported_kml':
      warnings.push('Imported route source needs ECS review context');
      return 1;
    case 'ecs_submitted':
      warnings.push('ECS submitted route depends on review confidence');
      return 0;
    case 'partner_source':
      warnings.push('Partner source behavior is reserved for future use');
      return -8;
    case 'needs_review':
    default:
      warnings.push('Trail Pack source needs review');
      return -10;
  }
}

export function scoreECSTrailPackConfidence(
  pack: ECSTrailPack,
  input: ECSTrailPackConfidenceInput = {},
): ECSTrailPackConfidence {
  const lastEvaluatedAt = new Date().toISOString();
  const nowMs = Date.parse(lastEvaluatedAt);
  const reasons: string[] = [];
  const warnings: string[] = [];
  const blockers: string[] = [];

  const score =
    communitySignalScore(pack, input, reasons, warnings) +
    integrityScore(pack, input, reasons, warnings, blockers) +
    recencyScore(pack, input, nowMs, reasons, warnings) +
    operationalScore(pack, input, reasons, warnings, blockers) +
    sourceAdjustment(pack, reasons, warnings, blockers);

  const finalScore = blockers.length > 0 ? Math.min(clampScore(score), 39) : clampScore(score);

  return {
    score: finalScore,
    band: bandFromScore(finalScore),
    reasons: unique(reasons, 12),
    warnings: unique(warnings, 8),
    blockers: unique(blockers, 5),
    lastEvaluatedAt,
  };
}

export function shouldPromoteTrailPackByDefault(confidence: ECSTrailPackConfidence): boolean {
  return confidence.blockers.length === 0 && (confidence.band === 'high' || confidence.band === 'verified');
}
