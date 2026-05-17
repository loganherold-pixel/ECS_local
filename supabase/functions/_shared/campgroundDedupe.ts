import {
  normalizeCampgroundName,
  type CampgroundAvailabilityStatus,
  type CampgroundStatus,
  type ProviderId,
} from '../../../lib/map/establishedCampgrounds.ts';

export type DedupeProviderId = ProviderId | 'unknown';

export type DedupeCampgroundRow = {
  id: string;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  facility_type?: string | null;
  managing_agency?: string | null;
  managing_org?: string | null;
  reservation_url?: string | null;
  detail_url?: string | null;
  status?: CampgroundStatus | string | null;
  availability_status?: CampgroundAvailabilityStatus | string | null;
  site_count?: number | null;
  site_types?: string[] | null;
  amenities?: string[] | null;
  source_confidence?: number | string | null;
  primary_provider?: ProviderId | string | null;
  attribution?: string | null;
  last_synced_at?: string | null;
  last_verified_at?: string | null;
  last_availability_checked_at?: string | null;
};

export type DedupeSourceRecord = {
  campground_id: string | null;
  provider_id: string;
  provider_record_id: string;
  source_url?: string | null;
  first_seen_at?: string | null;
  last_seen_at?: string | null;
};

export type DedupeScore = {
  score: number;
  shouldMerge: boolean;
  reasons: string[];
  distanceMeters: number | null;
  nameSimilarity: number;
};

export type DedupeGroupPlan = {
  canonicalId: string;
  duplicateIds: string[];
  memberIds: string[];
  mergedCampground: DedupeCampgroundRow;
  reasons: string[];
};

const OFFICIAL_PROVIDER_PRIORITY: Record<string, number> = {
  manual: 1000,
  ridb: 920,
  nps: 900,
  reserveamerica: 860,
  aspira: 860,
  active: 840,
  campflare: 780,
  osm: 580,
  unknown: 0,
};

const DEFAULT_PROXIMITY_METERS = 250;
const TIGHT_PROXIMITY_METERS = 100;

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(/\s+/g, ' ');
  return text.length > 0 ? text : null;
}

function numberOrNull(value: unknown): number | null {
  const candidate = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(candidate) ? candidate : null;
}

function normalizedProvider(value: unknown): string {
  return cleanText(value)?.toLowerCase() ?? 'unknown';
}

function providerPriority(value: unknown): number {
  return OFFICIAL_PROVIDER_PRIORITY[normalizedProvider(value)] ?? 0;
}

function rowConfidence(row: DedupeCampgroundRow): number {
  const confidence = numberOrNull(row.source_confidence);
  return confidence == null ? 0 : Math.max(0, Math.min(100, confidence));
}

function nonEmptyArray<T>(value: T[] | null | undefined): T[] | null {
  return Array.isArray(value) && value.length > 0 ? Array.from(new Set(value.filter(Boolean))) : null;
}

function mergeStringArrays(a: string[] | null | undefined, b: string[] | null | undefined): string[] | null {
  const values = [...(a ?? []), ...(b ?? [])].map((value) => cleanText(value)).filter(Boolean) as string[];
  return values.length > 0 ? Array.from(new Set(values)) : null;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    value
      .split(' ')
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size && !b.size) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  return intersection / (a.size + b.size - intersection);
}

export function normalizeDedupeName(value: unknown): string {
  return normalizeCampgroundName(value)
    .toLowerCase()
    .replace(/\b(campground|campgrounds|camp|cg|rv park|rv resort|recreation area|reserve|site)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeDedupeUrl(value: unknown): string | null {
  const text = cleanText(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    url.hash = '';
    url.search = '';
    const pathname = url.pathname.replace(/\/+$/, '');
    return `${url.protocol}//${url.hostname.toLowerCase()}${pathname}`.toLowerCase();
  } catch (_error) {
    return text.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthMeters = 6371008.8;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * earthMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function nameSimilarity(a: unknown, b: unknown): number {
  const left = normalizeDedupeName(a);
  const right = normalizeDedupeName(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return Math.min(0.92, Math.min(left.length, right.length) / Math.max(left.length, right.length) + 0.25);
  return jaccard(tokenSet(left), tokenSet(right));
}

function agencySimilarity(a: DedupeCampgroundRow, b: DedupeCampgroundRow): boolean {
  const left = normalizeDedupeName(a.managing_agency ?? a.managing_org);
  const right = normalizeDedupeName(b.managing_agency ?? b.managing_org);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function sourceKey(record: DedupeSourceRecord): string {
  return `${record.provider_id.toLowerCase()}:${record.provider_record_id.toLowerCase()}`;
}

function rowSourceKeys(row: DedupeCampgroundRow, sourcesByCampgroundId: Map<string, DedupeSourceRecord[]>): Set<string> {
  return new Set((sourcesByCampgroundId.get(row.id) ?? []).map(sourceKey));
}

function rowUrls(row: DedupeCampgroundRow, sourcesByCampgroundId: Map<string, DedupeSourceRecord[]>): Set<string> {
  const urls = [
    normalizeDedupeUrl(row.reservation_url),
    normalizeDedupeUrl(row.detail_url),
    ...(sourcesByCampgroundId.get(row.id) ?? []).map((source) => normalizeDedupeUrl(source.source_url)),
  ].filter(Boolean) as string[];
  return new Set(urls);
}

function intersect<T>(a: Set<T>, b: Set<T>): boolean {
  for (const item of a) {
    if (b.has(item)) return true;
  }
  return false;
}

function coordinates(row: DedupeCampgroundRow): { latitude: number; longitude: number } | null {
  const latitude = numberOrNull(row.latitude);
  const longitude = numberOrNull(row.longitude);
  if (latitude == null || longitude == null) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  return { latitude, longitude };
}

export function scoreCampgroundPair(
  a: DedupeCampgroundRow,
  b: DedupeCampgroundRow,
  sourcesByCampgroundId = new Map<string, DedupeSourceRecord[]>(),
): DedupeScore {
  const reasons: string[] = [];
  let score = 0;

  if (intersect(rowSourceKeys(a, sourcesByCampgroundId), rowSourceKeys(b, sourcesByCampgroundId))) {
    score += 140;
    reasons.push('same provider source record');
  }

  if (intersect(rowUrls(a, sourcesByCampgroundId), rowUrls(b, sourcesByCampgroundId))) {
    score += 110;
    reasons.push('reservation/detail/source URL match');
  }

  const similarity = nameSimilarity(a.name, b.name);
  if (similarity >= 0.92) {
    score += 60;
    reasons.push('exact normalized name match');
  } else if (similarity >= 0.72) {
    score += 42;
    reasons.push('strong normalized name similarity');
  } else if (similarity >= 0.55) {
    score += 24;
    reasons.push('moderate normalized name similarity');
  }

  const leftCoordinates = coordinates(a);
  const rightCoordinates = coordinates(b);
  const meters = leftCoordinates && rightCoordinates ? distanceMeters(leftCoordinates, rightCoordinates) : null;
  if (meters != null && meters <= TIGHT_PROXIMITY_METERS) {
    score += 58;
    reasons.push('within 100 meters');
  } else if (meters != null && meters <= DEFAULT_PROXIMITY_METERS) {
    score += 42;
    reasons.push('within 250 meters');
  }

  const sameAgency = agencySimilarity(a, b);
  if (sameAgency) {
    score += 15;
    reasons.push('same managing agency or organization');
  }

  const providerMix = new Set([normalizedProvider(a.primary_provider), normalizedProvider(b.primary_provider)]);
  if (providerMix.has('osm') && providerMix.size > 1) {
    score += 8;
    reasons.push('OSM supplemental record matched to provider-backed campground');
  }

  const hardMatch = reasons.includes('same provider source record') || reasons.includes('reservation/detail/source URL match');
  const shouldMerge =
    hardMatch ||
    (similarity >= 0.9 && meters != null && meters <= DEFAULT_PROXIMITY_METERS) ||
    (similarity >= 0.72 && meters != null && meters <= TIGHT_PROXIMITY_METERS) ||
    (similarity >= 0.55 && meters != null && meters <= TIGHT_PROXIMITY_METERS && sameAgency);

  return {
    score,
    shouldMerge,
    reasons,
    distanceMeters: meters,
    nameSimilarity: similarity,
  };
}

export function chooseCanonicalCampground(rows: DedupeCampgroundRow[]): DedupeCampgroundRow {
  return [...rows].sort((a, b) => {
    const priorityDelta = providerPriority(b.primary_provider) - providerPriority(a.primary_provider);
    if (priorityDelta !== 0) return priorityDelta;
    const confidenceDelta = rowConfidence(b) - rowConfidence(a);
    if (confidenceDelta !== 0) return confidenceDelta;
    return String(a.id).localeCompare(String(b.id));
  })[0];
}

function chooseTextField(rows: DedupeCampgroundRow[], field: keyof DedupeCampgroundRow): string | null {
  for (const row of [...rows].sort((a, b) => providerPriority(b.primary_provider) - providerPriority(a.primary_provider) || rowConfidence(b) - rowConfidence(a))) {
    const value = cleanText(row[field]);
    if (value) return value;
  }
  return null;
}

function chooseNumericField(rows: DedupeCampgroundRow[], field: keyof DedupeCampgroundRow): number | null {
  for (const row of [...rows].sort((a, b) => providerPriority(b.primary_provider) - providerPriority(a.primary_provider) || rowConfidence(b) - rowConfidence(a))) {
    const value = numberOrNull(row[field]);
    if (value != null) return value;
  }
  return null;
}

function chooseStatus(rows: DedupeCampgroundRow[], field: 'status' | 'availability_status', fallback: string): string {
  for (const row of [...rows].sort((a, b) => providerPriority(b.primary_provider) - providerPriority(a.primary_provider) || rowConfidence(b) - rowConfidence(a))) {
    const value = cleanText(row[field]);
    if (value && value !== 'unknown') return value;
  }
  return fallback;
}

function mergeAttribution(rows: DedupeCampgroundRow[]): string | null {
  const values = rows.map((row) => cleanText(row.attribution)).filter(Boolean) as string[];
  const unique: string[] = [];
  for (const value of values) {
    if (!unique.some((existing) => existing.toLowerCase().includes(value.toLowerCase()))) unique.push(value);
  }
  return unique.length > 0 ? unique.join('; ') : null;
}

export function mergeCampgroundRows(rows: DedupeCampgroundRow[], canonicalId?: string): DedupeCampgroundRow {
  const canonical = canonicalId ? rows.find((row) => row.id === canonicalId) ?? chooseCanonicalCampground(rows) : chooseCanonicalCampground(rows);
  const ordered = [canonical, ...rows.filter((row) => row.id !== canonical.id)];
  const rowsWithCoordinates = rows.filter((row) => coordinates(row));
  const coordinateWinner = rowsWithCoordinates.length > 0 ? chooseCanonicalCampground(rowsWithCoordinates) : canonical;
  const mergedConfidence = Math.max(...rows.map(rowConfidence));

  return {
    ...canonical,
    name: chooseTextField(ordered, 'name') ?? canonical.name,
    latitude: numberOrNull(coordinateWinner.latitude) ?? canonical.latitude,
    longitude: numberOrNull(coordinateWinner.longitude) ?? canonical.longitude,
    facility_type: chooseTextField(ordered, 'facility_type') ?? canonical.facility_type ?? 'campground',
    managing_agency: chooseTextField(ordered, 'managing_agency'),
    managing_org: chooseTextField(ordered, 'managing_org'),
    reservation_url: chooseTextField(ordered, 'reservation_url'),
    detail_url: chooseTextField(ordered, 'detail_url'),
    status: chooseStatus(ordered, 'status', 'unknown'),
    availability_status: chooseStatus(ordered, 'availability_status', 'unknown'),
    site_count: chooseNumericField(ordered, 'site_count'),
    site_types: rows.reduce<string[] | null>((merged, row) => mergeStringArrays(merged, row.site_types), null) ?? nonEmptyArray(canonical.site_types),
    amenities: rows.reduce<string[] | null>((merged, row) => mergeStringArrays(merged, row.amenities), null) ?? nonEmptyArray(canonical.amenities),
    source_confidence: mergedConfidence,
    primary_provider: normalizedProvider(canonical.primary_provider) as ProviderId,
    attribution: mergeAttribution(rows),
    last_synced_at: chooseTextField(ordered, 'last_synced_at'),
    last_verified_at: chooseTextField(ordered, 'last_verified_at'),
    last_availability_checked_at: chooseTextField(ordered, 'last_availability_checked_at'),
  };
}

class UnionFind {
  private parent = new Map<string, string>();

  constructor(ids: string[]) {
    for (const id of ids) this.parent.set(id, id);
  }

  find(id: string): string {
    const parent = this.parent.get(id) ?? id;
    if (parent === id) return id;
    const root = this.find(parent);
    this.parent.set(id, root);
    return root;
  }

  union(a: string, b: string): void {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA !== rootB) this.parent.set(rootB, rootA);
  }
}

export function groupSourceRecordsByCampgroundId(sources: DedupeSourceRecord[]): Map<string, DedupeSourceRecord[]> {
  const grouped = new Map<string, DedupeSourceRecord[]>();
  for (const source of sources) {
    if (!source.campground_id) continue;
    grouped.set(source.campground_id, [...(grouped.get(source.campground_id) ?? []), source]);
  }
  return grouped;
}

export function buildCampgroundDedupePlan(
  rows: DedupeCampgroundRow[],
  sources: DedupeSourceRecord[] = [],
): DedupeGroupPlan[] {
  const activeRows = rows.filter((row) => row.id && row.status !== 'removed');
  const sourcesByCampgroundId = groupSourceRecordsByCampgroundId(sources);
  const union = new UnionFind(activeRows.map((row) => row.id));
  const reasonsByPair = new Map<string, string[]>();

  for (let i = 0; i < activeRows.length; i += 1) {
    for (let j = i + 1; j < activeRows.length; j += 1) {
      const left = activeRows[i];
      const right = activeRows[j];
      const result = scoreCampgroundPair(left, right, sourcesByCampgroundId);
      if (result.shouldMerge) {
        union.union(left.id, right.id);
        reasonsByPair.set(`${left.id}:${right.id}`, result.reasons);
      }
    }
  }

  const groups = new Map<string, DedupeCampgroundRow[]>();
  for (const row of activeRows) {
    const root = union.find(row.id);
    groups.set(root, [...(groups.get(root) ?? []), row]);
  }

  const plans: DedupeGroupPlan[] = [];
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const canonical = chooseCanonicalCampground(members);
    const memberIds = members.map((member) => member.id).sort();
    const reasons = Array.from(
      new Set(
        Array.from(reasonsByPair.entries())
          .filter(([key]) => {
            const [left, right] = key.split(':');
            return memberIds.includes(left) && memberIds.includes(right);
          })
          .flatMap(([, pairReasons]) => pairReasons),
      ),
    );
    plans.push({
      canonicalId: canonical.id,
      duplicateIds: memberIds.filter((id) => id !== canonical.id),
      memberIds,
      mergedCampground: mergeCampgroundRows(members, canonical.id),
      reasons,
    });
  }

  return plans.sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
}
