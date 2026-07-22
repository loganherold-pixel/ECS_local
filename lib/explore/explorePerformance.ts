export type ExplorePerformanceEventName =
  | 'explore_screen_focus'
  | 'explore_control_tap_received'
  | 'explore_control_visual_acknowledged'
  | 'explore_search_fingerprint_changed'
  | 'explore_search_request_dispatched'
  | 'explore_cache_result_available'
  | 'explore_provider_result_available'
  | 'explore_result_normalization_complete'
  | 'explore_first_route_list_commit'
  | 'explore_route_card_press_received'
  | 'explore_trip_builder_navigation_dispatched'
  | 'explore_search_cancelled'
  | 'explore_stale_result_rejected'
  | 'fixture_records_created'
  | 'provider_records_normalized'
  | 'access_filter_complete'
  | 'moderation_filter_complete'
  | 'validation_filter_complete'
  | 'QA_search_region_resolved'
  | 'radius_filter_complete'
  | 'viewport_filter_complete'
  | 'category_filter_complete'
  | 'refinement_filter_complete'
  | 'duplicate_filter_complete'
  | 'ranking_complete'
  | 'result_cap_complete'
  | 'availability_classification_complete'
  | 'visible_card_projection_complete'
  | 'list_commit_complete';

export type ExplorePerformanceRecord = {
  event: ExplorePerformanceEventName;
  atMs: number;
  durationMs?: number;
  resultCount?: number;
  searchFingerprint?: string;
  cacheHit?: boolean;
  inputCount?: number;
  outputCount?: number;
  qaRegionId?: string;
  radiusCategory?: string;
  exclusionReasonCounts?: Record<string, number>;
};

type Clock = () => number;
let clock: Clock = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const records: ExplorePerformanceRecord[] = [];
const MAX_RECORDS = 200;

export function recordExplorePerformanceEvent(
  event: ExplorePerformanceEventName,
  details: Omit<ExplorePerformanceRecord, 'event' | 'atMs'> = {},
): ExplorePerformanceRecord {
  const record = { event, atMs: clock(), ...details };
  records.push(record);
  if (records.length > MAX_RECORDS) records.splice(0, records.length - MAX_RECORDS);
  return record;
}

export function getExplorePerformanceRecords(): ExplorePerformanceRecord[] {
  return records.map((record) => ({ ...record }));
}

export function resetExplorePerformanceRecords(): void {
  records.length = 0;
}

export function setExplorePerformanceClockForTests(nextClock: Clock | null): void {
  clock = nextClock ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
}

export function createPrivacySafeSearchFingerprint(criteria: Record<string, unknown>): string {
  const canonical = Object.keys(criteria)
    .sort()
    .map((key) => `${key}:${String(criteria[key] ?? '')}`)
    .join('|');
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `explore-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
