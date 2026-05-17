import type { ExpeditionOpportunity } from './discoverEngine';

export type ExploreRouteCampMarker = {
  id: string;
  latitude: number;
  longitude: number;
  title: string;
  subtitle: string;
  category: 'suggested' | 'backup' | 'emergency' | 'established' | 'community';
  confidence: 'low' | 'medium' | 'high';
  confidenceScore: number;
  rating: 'A' | 'B' | 'C' | 'D';
  score: number;
  rank?: number;
  rankLabel?: string;
  source?: string | null;
};

const CAMP_FIELD_KEYS = [
  'campCandidates',
  'camps',
  'campLocations',
  'campsites',
  'dispersedCamps',
  'dispersedCamping',
  'viableCamps',
  'viableCampLocations',
  'suggestedCampsites',
] as const;

const REJECTED_STATUS_TOKENS = [
  'closed',
  'denied',
  'ineligible',
  'invalid',
  'not_allowed',
  'not viable',
  'private',
  'rejected',
  'restricted',
  'unsafe',
  'unavailable',
] as const;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function normalizeCampCoordinate(value: unknown): { latitude: number; longitude: number } | null {
  if (!value) return null;

  if (Array.isArray(value) && value.length >= 2) {
    const first = Number(value[0]);
    const second = Number(value[1]);
    const latitude = Math.abs(first) <= 90 ? first : second;
    const longitude = Math.abs(first) <= 90 ? second : first;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      return { latitude, longitude };
    }
  }

  const record = asRecord(value);
  if (!record) return null;

  const directLat = Number(record.latitude ?? record.lat ?? record.y);
  const directLng = Number(record.longitude ?? record.lng ?? record.lon ?? record.x);
  if (Number.isFinite(directLat) && Number.isFinite(directLng)) {
    return { latitude: directLat, longitude: directLng };
  }

  const nested =
    record.coordinate ??
    record.location ??
    record.point ??
    record.center ??
    record.centroid;
  const nestedCoordinate = normalizeCampCoordinate(nested);
  if (nestedCoordinate) return nestedCoordinate;

  const geometry = asRecord(record.geometry);
  if (geometry) {
    return normalizeCampCoordinate(geometry.coordinates);
  }

  return null;
}

function clampScore(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(100, Math.round(numeric)));
}

function ratingFromScore(score: number): ExploreRouteCampMarker['rating'] {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

function confidenceFromScore(score: number): ExploreRouteCampMarker['confidence'] {
  if (score >= 78) return 'high';
  if (score >= 55) return 'medium';
  return 'low';
}

function isRejectedCampCandidate(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  const statusParts = [
    record.status,
    record.viabilityStatus,
    record.suitabilityStatus,
    record.legalityStatus,
    record.recommendationClass,
  ]
    .map((part) => (typeof part === 'string' ? part.toLowerCase() : ''))
    .filter(Boolean);
  return statusParts.some((status) =>
    REJECTED_STATUS_TOKENS.some((token) => status.includes(token)),
  );
}

function collectCampCandidateValues(route: ExpeditionOpportunity): unknown[] {
  const routeRecord = route as unknown as Record<string, unknown>;
  const metadata = asRecord(routeRecord.routeMetadata);
  const values: unknown[] = [];

  for (const key of CAMP_FIELD_KEYS) {
    const direct = routeRecord[key];
    if (Array.isArray(direct)) values.push(...direct);

    const nested = metadata?.[key];
    if (Array.isArray(nested)) values.push(...nested);
  }

  return values;
}

function campMarkerDedupeKey(marker: ExploreRouteCampMarker): string {
  return `${marker.latitude.toFixed(5)}:${marker.longitude.toFixed(5)}`;
}

export function extractExploreRouteCampMarkers(
  route: ExpeditionOpportunity | null | undefined,
): ExploreRouteCampMarker[] {
  if (!route) return [];
  const candidates = collectCampCandidateValues(route);
  const markers: ExploreRouteCampMarker[] = [];
  const seen = new Set<string>();

  candidates.forEach((candidate, index) => {
    if (isRejectedCampCandidate(candidate)) return;
    const coordinate = normalizeCampCoordinate(candidate);
    if (!coordinate) return;

    const record = asRecord(candidate) ?? {};
    const score = clampScore(
      record.score ??
        record.suitabilityScore ??
        record.campingScore ??
        record.confidenceScore,
      70,
    );
    const title =
      typeof record.title === 'string' && record.title.trim().length > 0
        ? record.title.trim()
        : typeof record.name === 'string' && record.name.trim().length > 0
          ? record.name.trim()
          : `Camp Candidate ${markers.length + 1}`;
    const subtitle =
      typeof record.subtitle === 'string' && record.subtitle.trim().length > 0
        ? record.subtitle.trim()
        : typeof record.description === 'string' && record.description.trim().length > 0
          ? record.description.trim()
          : 'Explorer route camp candidate';
    const id =
      typeof record.id === 'string' && record.id.trim().length > 0
        ? `explore-camp:${route.id}:${record.id.trim()}`
        : `explore-camp:${route.id}:${index}:${coordinate.latitude.toFixed(5)}:${coordinate.longitude.toFixed(5)}`;
    const marker: ExploreRouteCampMarker = {
      id,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      title,
      subtitle,
      category: 'suggested',
      confidence: confidenceFromScore(score),
      confidenceScore: score,
      rating: ratingFromScore(score),
      score,
      rank: Number.isFinite(Number(record.rank)) ? Number(record.rank) : markers.length + 1,
      rankLabel:
        typeof record.rankLabel === 'string' && record.rankLabel.trim().length > 0
          ? record.rankLabel.trim()
          : `C${markers.length + 1}`,
      source:
        typeof record.source === 'string' && record.source.trim().length > 0
          ? record.source.trim()
          : null,
    };
    const dedupeKey = campMarkerDedupeKey(marker);
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    markers.push(marker);
  });

  return markers;
}

export function hasExploreRouteCampMarkers(
  route: ExpeditionOpportunity | null | undefined,
): boolean {
  return extractExploreRouteCampMarkers(route).length > 0;
}
