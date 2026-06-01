import type { EstablishedCampsite } from './establishedCampsiteTypes';

export type EstablishedCampgroundScoreSummary = {
  score: number;
  label: string;
  explanation: string;
  dataBasis: string[];
};

const RECENT_SYNC_MS = 14 * 24 * 60 * 60 * 1000;
const FRESH_AVAILABILITY_MS = 60 * 60 * 1000;

function cleanToken(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
}

function clampScore(value: number): number {
  return Math.max(20, Math.min(96, Math.round(value)));
}

function providerBaseline(campsite: EstablishedCampsite): number {
  const provider = cleanToken(campsite.primaryProvider ?? campsite.source);
  switch (provider) {
    case 'ridb':
    case 'recreation_gov':
      return 82;
    case 'nps':
      return 80;
    case 'campflare':
    case 'reserveamerica':
    case 'aspira':
    case 'active':
      return 76;
    case 'state':
    case 'county':
      return 72;
    case 'osm':
      return 58;
    default:
      return 48;
  }
}

function scoreNumber(value: unknown): number | null {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) ? Math.max(0, Math.min(100, numberValue)) : null;
}

function isRecent(value?: string | null, maxAgeMs = RECENT_SYNC_MS, now = Date.now()): boolean {
  if (!value) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && now - timestamp <= maxAgeMs;
}

export function resolveEstablishedCampgroundScore(
  campsite: EstablishedCampsite,
  now = Date.now(),
): EstablishedCampgroundScoreSummary {
  const sourceConfidence = scoreNumber(campsite.sourceConfidence);
  let score = sourceConfidence ?? providerBaseline(campsite);
  const dataBasis: string[] = [];

  if (sourceConfidence != null) {
    dataBasis.push(`source confidence ${Math.round(sourceConfidence)}/100`);
  } else {
    dataBasis.push(`${campsite.primaryProvider ?? campsite.source ?? 'unknown'} provider baseline`);
  }

  const status = cleanToken(campsite.status);
  if (status === 'open' || status === 'active') {
    score += 8;
    dataBasis.push('open status');
  } else if (status === 'seasonal') {
    score += 2;
    dataBasis.push('seasonal status');
  } else if (status === 'verify' || status === 'temporarily_closed') {
    score -= status === 'temporarily_closed' ? 18 : 4;
    dataBasis.push(status === 'temporarily_closed' ? 'temporary closure signal' : 'verify status');
  } else if (status === 'closed' || status === 'removed') {
    score -= 28;
    dataBasis.push('closed or removed status');
  } else {
    score -= 4;
    dataBasis.push('status unknown');
  }

  const availability = cleanToken(campsite.availabilityStatus);
  const availabilityFresh = isRecent(campsite.lastAvailabilityCheckedAt, FRESH_AVAILABILITY_MS, now);
  if (availability === 'available') {
    score += availabilityFresh ? 10 : 2;
    dataBasis.push(availabilityFresh ? 'fresh availability available' : 'stale available signal');
  } else if (availability === 'limited') {
    score += availabilityFresh ? 5 : 1;
    dataBasis.push(availabilityFresh ? 'fresh limited availability' : 'stale limited signal');
  } else if (availability === 'unavailable') {
    score -= availabilityFresh ? 14 : 4;
    dataBasis.push(availabilityFresh ? 'fresh unavailable signal' : 'stale unavailable signal');
  } else if (availability === 'closed') {
    score -= 20;
    dataBasis.push('availability closed');
  } else if (availability === 'stale') {
    score -= 4;
    dataBasis.push('availability stale');
  } else {
    dataBasis.push('availability unknown');
  }

  if (isRecent(campsite.lastVerifiedAt, RECENT_SYNC_MS, now)) {
    score += 5;
    dataBasis.push('recent verification');
  } else if (isRecent(campsite.sourceUpdatedAt ?? campsite.lastSyncedAt, RECENT_SYNC_MS, now)) {
    score += 3;
    dataBasis.push('recent source sync');
  }

  if (campsite.reservationUrl || campsite.bookingUrl || campsite.detailUrl) {
    score += 3;
    dataBasis.push('operator or reservation link');
  }

  if (campsite.managingAgency || campsite.managingOrg || campsite.operatorName) {
    score += 2;
    dataBasis.push('operator identified');
  }

  if (typeof campsite.siteCount === 'number' && Number.isFinite(campsite.siteCount)) {
    score += campsite.siteCount > 0 ? 2 : -2;
    dataBasis.push(`${campsite.siteCount} sites reported`);
  }

  const knownAmenities = campsite.amenities.filter((amenity) => amenity !== 'unknown').length;
  if (knownAmenities > 0) {
    score += Math.min(4, knownAmenities);
    dataBasis.push(`${knownAmenities} amenities listed`);
  }

  const finalScore = clampScore(score);
  const label = finalScore >= 82 ? 'Strong' : finalScore >= 68 ? 'Good' : finalScore >= 52 ? 'Verify' : 'Caution';
  const basisCopy = dataBasis.slice(0, 4).join(', ');

  return {
    score: finalScore,
    label,
    dataBasis,
    explanation:
      `ECS score is ${finalScore}/100. This combines live campground status, source confidence, availability freshness, operator data, and provider attribution. Inputs considered: ${basisCopy}.`,
  };
}
