/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE EXPEDITION DATABASE STORE — Phase 6A/6B/6D
 * ═══════════════════════════════════════════════════════════
 *
 * Central state store for the Offline Expedition Database.
 * Manages offline expedition regions, dataset storage,
 * download state, and query access.
 *
 * Phase 6D additions:
 *   - Dataset integrity validation after download
 *   - Stale dataset detection based on last_updated
 *   - Enhanced restore with validation and logging
 *   - Corrupted dataset protection in query paths
 *   - Safe region removal with storage accounting
 *   - Comprehensive console logging for field reliability
 *   - Session version 3 with integrity fields
 *   - Deferred heavy operations for startup performance
 *
 * Phase 6B additions:
 *   - Interrupted download recovery (completed_categories tracking)
 *   - Duplicate download prevention (isDownloading guard)
 *   - Dataset version tracking (dataset_version, data_version_available)
 *   - Download queue management
 *   - Storage management (per-region stats, summary)
 *   - Resume token persistence for interrupted downloads
 *   - Update detection and marking
 *   - Session version 2 with queue persistence
 *
 * Design:
 *   - Operates independently from tileCacheStore (map tiles)
 *   - Identity-stable output references
 *   - Safe for Android Auto / CarPlay consumption
 *   - Failures never crash ECS systems
 *   - Multiple regions can coexist on a device
 *   - Graceful degradation when storage is unavailable
 */

import { Platform } from 'react-native';
import type {
  OfflineExpeditionRegion,
  OfflineExpeditionDbState,
  OfflineExpeditionDbSession,
  OfflineDownloadProgress,
  OfflineExpeditionReadiness,
  OfflineDownloadQueueItem,
  RegionStorageStats,
  OfflineStorageSummary,
  DatasetCategory,
  DatasetEntry,
  DatasetCollection,
  OfflineDatasetQuery,
  OfflineDatasetQueryResult,
  OfflineRegionBounds,
  DatasetIntegrityStatus,
  DatasetValidationResult,
} from './offlineExpeditionDbTypes';
import {
  OFFLINE_EXPEDITION_DB_SESSION_VERSION,
  DATASET_CATEGORIES,
  DEFAULT_OFFLINE_EXPEDITION_READINESS,
  STALE_DATASET_THRESHOLD_DAYS,
  CRITICAL_STALE_THRESHOLD_DAYS,
  createDefaultOfflineExpeditionDbState,
} from './offlineExpeditionDbTypes';


// ── Constants ────────────────────────────────────────────

const TAG = '[OfflineExpeditionDB]';
const STORAGE_KEY = 'ecs_offline_expedition_db_session';
const DATASET_KEY_PREFIX = 'ecs_oexp_ds_';

/** Max age for a persisted session (30 days) */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Earth radius in miles (for haversine) */
const EARTH_RADIUS_MI = 3958.8;

/** Phase 6B: Max retry attempts for failed downloads */
const MAX_RETRY_ATTEMPTS = 3;

/** Phase 6D: Stale threshold in milliseconds */
const STALE_THRESHOLD_MS = STALE_DATASET_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

/** Phase 6D: Critical stale threshold in milliseconds */
const CRITICAL_STALE_MS = CRITICAL_STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;


// ── Storage Helpers ──────────────────────────────────────

const _memStore: Record<string, string> = {};
const _ls = {
  get: (k: string): string | null => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        return localStorage.getItem(k);
      }
    } catch {}
    return _memStore[k] || null;
  },
  set: (k: string, v: string) => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.setItem(k, v);
      }
    } catch {}
    _memStore[k] = v;
  },
  del: (k: string) => {
    try {
      if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
        localStorage.removeItem(k);
      }
    } catch {}
    delete _memStore[k];
  },
};


// ── Haversine Distance ───────────────────────────────────

function haversineDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_MI * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}


// ── Bounds Helpers ───────────────────────────────────────

function pointInBounds(
  lat: number, lng: number,
  bounds: OfflineRegionBounds,
): boolean {
  return (
    lat >= bounds.min_lat &&
    lat <= bounds.max_lat &&
    lng >= bounds.min_lng &&
    lng <= bounds.max_lng
  );
}

function boundsOverlap(
  a: OfflineRegionBounds,
  b: OfflineRegionBounds,
): boolean {
  return !(
    a.max_lat < b.min_lat ||
    a.min_lat > b.max_lat ||
    a.max_lng < b.min_lng ||
    a.min_lng > b.max_lng
  );
}


// ── Internal State ───────────────────────────────────────

let _state: OfflineExpeditionDbState = createDefaultOfflineExpeditionDbState();
let _cachedReadiness: OfflineExpeditionReadiness | null = null;
let _readinessCacheTime = 0;
const READINESS_CACHE_MS = 15_000;

/** Listeners */
type Listener = () => void;
const _listeners = new Set<Listener>();

function _notify() {
  _state.updated_at = new Date().toISOString();
  _cachedReadiness = null; // invalidate readiness cache
  _listeners.forEach(fn => { try { fn(); } catch {} });
}


// ── Dataset Storage ──────────────────────────────────────

function _storeDataset(regionId: string, category: DatasetCategory, entries: DatasetEntry[]): void {
  const key = `${DATASET_KEY_PREFIX}${regionId}_${category}`;
  try {
    _ls.set(key, JSON.stringify(entries));
  } catch (e) {
    console.warn(`${TAG} Failed to store dataset ${category} for region ${regionId}:`, e);
  }
}

function _loadDataset(regionId: string, category: DatasetCategory): DatasetEntry[] {
  const key = `${DATASET_KEY_PREFIX}${regionId}_${category}`;
  try {
    const raw = _ls.get(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Phase 6D: Validate parsed data is an array
      if (!Array.isArray(parsed)) {
        console.warn(`${TAG} [6D] Corrupted dataset ${category} for region ${regionId}: not an array`);
        return [];
      }
      return parsed;
    }
  } catch (e) {
    // Phase 6D: Log corruption detection
    console.warn(`${TAG} [6D] Failed to load/parse dataset ${category} for region ${regionId}:`, e);
  }
  return [];
}

function _deleteDataset(regionId: string, category: DatasetCategory): void {
  const key = `${DATASET_KEY_PREFIX}${regionId}_${category}`;
  _ls.del(key);
}

function _deleteAllDatasets(regionId: string): void {
  for (const cat of DATASET_CATEGORIES) {
    _deleteDataset(regionId, cat);
  }
}


// ── Phase 6D: Dataset Integrity Validation ───────────────

/**
 * Validate the integrity of a downloaded region's datasets.
 * Checks that each category has parseable data with valid entries.
 * Returns a DatasetValidationResult.
 */
function _validateRegionIntegrity(regionId: string): DatasetValidationResult {
  const region = _state.regions.find(r => r.region_id === regionId);
  const now = new Date().toISOString();

  if (!region) {
    return {
      region_id: regionId,
      integrity_status: 'invalid',
      category_results: {},
      valid_categories: 0,
      total_categories: DATASET_CATEGORIES.length,
      is_usable: false,
      summary: 'Region not found',
      validated_at: now,
    };
  }

  const categoryResults: DatasetValidationResult['category_results'] = {};
  let validCount = 0;
  let totalEntries = 0;

  for (const cat of DATASET_CATEGORIES) {
    try {
      const entries = _loadDataset(regionId, cat);
      const expectedCount = region.category_counts[cat] || 0;

      // Phase 6D: Validate each entry has required fields
      let validEntries = 0;
      for (const entry of entries) {
        if (
          entry &&
          typeof entry.id === 'string' &&
          typeof entry.latitude === 'number' &&
          typeof entry.longitude === 'number' &&
          typeof entry.name === 'string' &&
          !isNaN(entry.latitude) &&
          !isNaN(entry.longitude)
        ) {
          validEntries++;
        }
      }

      const isValid = entries.length > 0 && validEntries === entries.length;

      categoryResults[cat] = {
        valid: isValid,
        entry_count: entries.length,
        expected_count: expectedCount,
        error: !isValid
          ? entries.length === 0
            ? 'No entries found'
            : `${entries.length - validEntries} invalid entries`
          : undefined,
      };

      if (isValid) {
        validCount++;
        totalEntries += entries.length;
      }
    } catch (e) {
      categoryResults[cat] = {
        valid: false,
        entry_count: 0,
        expected_count: region.category_counts[cat] || 0,
        error: `Parse error: ${e instanceof Error ? e.message : 'unknown'}`,
      };
    }
  }

  // A region is usable if at least 50% of categories are valid
  const isUsable = validCount >= Math.ceil(DATASET_CATEGORIES.length / 2);
  const allValid = validCount === DATASET_CATEGORIES.length;

  let integrityStatus: DatasetIntegrityStatus = allValid ? 'valid' : 'invalid';

  // Phase 6D: Check staleness
  if (allValid && region.last_updated) {
    const age = Date.now() - new Date(region.last_updated).getTime();
    if (age > STALE_THRESHOLD_MS) {
      integrityStatus = 'stale';
    }
  }

  const summary = allValid
    ? `All ${validCount} categories valid (${totalEntries} entries)`
    : isUsable
      ? `${validCount}/${DATASET_CATEGORIES.length} categories valid \u2014 partially usable`
      : `Only ${validCount}/${DATASET_CATEGORIES.length} categories valid \u2014 not usable`;

  console.log(
    `${TAG} [6D] Integrity validation: "${region.region_name}" \u2014 ` +
    `${integrityStatus} (${validCount}/${DATASET_CATEGORIES.length} valid, ${totalEntries} entries)`
  );

  return {
    region_id: regionId,
    integrity_status: integrityStatus,
    category_results: categoryResults,
    valid_categories: validCount,
    total_categories: DATASET_CATEGORIES.length,
    is_usable: isUsable,
    summary,
    validated_at: now,
  };
}


// ── Phase 6D: Stale Detection ────────────────────────────

/**
 * Check if a region's data is stale based on last_updated.
 */
function _isRegionStale(region: OfflineExpeditionRegion): boolean {
  if (!region.last_updated) return false;
  const age = Date.now() - new Date(region.last_updated).getTime();
  return age > STALE_THRESHOLD_MS;
}

/**
 * Check if a region's data is critically stale.
 */
function _isRegionCriticallyStale(region: OfflineExpeditionRegion): boolean {
  if (!region.last_updated) return false;
  const age = Date.now() - new Date(region.last_updated).getTime();
  return age > CRITICAL_STALE_MS;
}

/**
 * Get the number of days since a region was last updated.
 */
function _daysSinceUpdate(region: OfflineExpeditionRegion): number | null {
  if (!region.last_updated) return null;
  const age = Date.now() - new Date(region.last_updated).getTime();
  return Math.floor(age / (24 * 60 * 60 * 1000));
}


// ── Recompute Aggregates ─────────────────────────────────

function _recomputeAggregates(): void {
  const downloaded = _state.regions.filter(
    r => r.download_status === 'downloaded' || r.download_status === 'update_available'
  );
  _state.downloaded_region_count = downloaded.length;
  _state.total_entries = downloaded.reduce((sum, r) => sum + r.total_entries, 0);
  _state.total_storage_mb = Math.round(
    downloaded.reduce((sum, r) => sum + (r.actual_size_mb || r.estimated_size_mb), 0) * 10
  ) / 10;
  _state.is_downloading = _state.active_download != null;
  _state.updates_available_count = _state.regions.filter(
    r => r.download_status === 'update_available'
  ).length;

  // Phase 6D: Integrity and stale counts
  _state.integrity_issue_count = downloaded.filter(
    r => r.integrity_status === 'invalid'
  ).length;
  _state.stale_region_count = downloaded.filter(
    r => r.integrity_status === 'stale' || _isRegionStale(r)
  ).length;
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const offlineExpeditionDbStore = {

  // ── Initialization ────────────────────────────────────

  initialize(): void {
    if (_state.initialized) return;
    console.log(`${TAG} Initializing (Phase 6D)...`);
    const startTime = Date.now();

    offlineExpeditionDbStore.restore();
    _state.initialized = true;
    _recomputeAggregates();

    // Phase 6B: Check for interrupted downloads and recover
    offlineExpeditionDbStore._recoverInterruptedDownloads();

    // Phase 6D: Deferred integrity check (don't block startup)
    setTimeout(() => {
      offlineExpeditionDbStore._deferredIntegrityCheck();
    }, 3000);

    const elapsed = Date.now() - startTime;
    console.log(
      `${TAG} Initialized in ${elapsed}ms: ${_state.regions.length} regions, ` +
      `${_state.downloaded_region_count} downloaded, ` +
      `${_state.total_entries} entries, ${_state.total_storage_mb} MB, ` +
      `${_state.download_queue.length} queued, ${_state.updates_available_count} updates, ` +
      `${_state.integrity_issue_count} integrity issues, ${_state.stale_region_count} stale`
    );
    _notify();
  },

  isInitialized(): boolean {
    return _state.initialized;
  },


  // ── Read ──────────────────────────────────────────────

  getState(): OfflineExpeditionDbState {
    return { ..._state };
  },

  getRegions(): OfflineExpeditionRegion[] {
    return [..._state.regions];
  },

  getDownloadedRegions(): OfflineExpeditionRegion[] {
    return _state.regions.filter(
      r => r.download_status === 'downloaded' || r.download_status === 'update_available'
    );
  },

  /**
   * Phase 6D: Get downloaded regions that are usable (valid or stale integrity).
   * Excludes regions with 'invalid' integrity status.
   */
  getUsableRegions(): OfflineExpeditionRegion[] {
    return _state.regions.filter(
      r => (r.download_status === 'downloaded' || r.download_status === 'update_available') &&
           r.integrity_status !== 'invalid'
    );
  },

  getRegion(regionId: string): OfflineExpeditionRegion | null {
    return _state.regions.find(r => r.region_id === regionId) ?? null;
  },

  getDownloadedCount(): number {
    return _state.downloaded_region_count;
  },

  getTotalStorageMb(): number {
    return _state.total_storage_mb;
  },

  getTotalEntries(): number {
    return _state.total_entries;
  },

  getActiveDownload(): OfflineDownloadProgress | null {
    return _state.active_download;
  },

  /** Phase 6B: Whether a download is currently in progress */
  isDownloading(): boolean {
    return _state.is_downloading;
  },

  /** Phase 6B: Get the download queue */
  getDownloadQueue(): OfflineDownloadQueueItem[] {
    return [..._state.download_queue];
  },

  /** Phase 6B: Get number of regions with available updates */
  getUpdatesAvailableCount(): number {
    return _state.updates_available_count;
  },

  /** Phase 6D: Get number of regions with integrity issues */
  getIntegrityIssueCount(): number {
    return _state.integrity_issue_count;
  },

  /** Phase 6D: Get number of stale regions */
  getStaleRegionCount(): number {
    return _state.stale_region_count;
  },


  // ── Region Management ─────────────────────────────────

  addRegion(region: OfflineExpeditionRegion): void {
    const existing = _state.regions.findIndex(r => r.region_id === region.region_id);
    if (existing >= 0) {
      // Phase 6B: Preserve download state when re-adding
      const prev = _state.regions[existing];
      if (prev.download_status === 'downloaded' || prev.download_status === 'update_available') {
        // Don't overwrite a downloaded region with a not_downloaded one
        _state.regions[existing] = {
          ...region,
          download_status: prev.download_status,
          last_updated: prev.last_updated,
          download_completed_at: prev.download_completed_at,
          actual_size_mb: prev.actual_size_mb,
          total_entries: prev.total_entries,
          category_counts: prev.category_counts,
          datasets: prev.datasets,
          dataset_version: prev.dataset_version,
          data_version_available: region.data_version_available ?? prev.data_version_available,
          completed_categories: prev.completed_categories,
          // Phase 6D: Preserve integrity fields
          integrity_status: prev.integrity_status,
          integrity_checked_at: prev.integrity_checked_at,
          previous_dataset_version: prev.previous_dataset_version,
        };
        // Phase 6B: Check for updates
        if (
          region.data_version_available != null &&
          region.data_version_available > prev.dataset_version &&
          prev.download_status === 'downloaded'
        ) {
          _state.regions[existing].download_status = 'update_available';
          console.log(`${TAG} Update available for "${region.region_name}" (v${prev.dataset_version} \u2192 v${region.data_version_available})`);
        }
      } else {
        _state.regions[existing] = region;
      }
    } else {
      _state.regions.push(region);
    }
    _recomputeAggregates();
    offlineExpeditionDbStore.persist();
    _notify();
  },

  updateRegion(regionId: string, updates: Partial<OfflineExpeditionRegion>): void {
    const idx = _state.regions.findIndex(r => r.region_id === regionId);
    if (idx < 0) return;
    _state.regions[idx] = { ..._state.regions[idx], ...updates };
    _recomputeAggregates();
    _notify();
  },

  removeRegion(regionId: string): void {
    const region = _state.regions.find(r => r.region_id === regionId);
    if (!region) return;

    // Delete all stored datasets
    _deleteAllDatasets(regionId);

    // Phase 6B: Remove from download queue
    _state.download_queue = _state.download_queue.filter(q => q.region_id !== regionId);

    // Reset to not_downloaded instead of removing entirely
    const idx = _state.regions.findIndex(r => r.region_id === regionId);
    if (idx >= 0) {
      _state.regions[idx] = {
        ..._state.regions[idx],
        download_status: 'not_downloaded',
        last_updated: null,
        download_started_at: null,
        download_completed_at: null,
        download_progress: 0,
        error_message: null,
        total_entries: _state.regions[idx].estimated_size_mb > 0
          ? Math.round(_state.regions[idx].estimated_size_mb / 0.002)
          : 0,
        actual_size_mb: 0,
        datasets: [],
        dataset_version: 0,
        completed_categories: [],
        resume_token: null,
        retry_count: 0,
        // Phase 6D: Reset integrity
        integrity_status: 'unchecked',
        integrity_checked_at: null,
        previous_dataset_version: 0,
      };
    }

    _recomputeAggregates();
    offlineExpeditionDbStore.persist();
    console.log(`${TAG} [6D] Region removed: "${region.region_name}" (${regionId}) \u2014 storage accounting updated`);
    _notify();
  },

  /** Phase 6B: Completely remove a region (not just reset) */
  deleteRegion(regionId: string): void {
    const region = _state.regions.find(r => r.region_id === regionId);
    if (!region) return;

    _deleteAllDatasets(regionId);
    _state.download_queue = _state.download_queue.filter(q => q.region_id !== regionId);
    _state.regions = _state.regions.filter(r => r.region_id !== regionId);

    _recomputeAggregates();
    offlineExpeditionDbStore.persist();
    console.log(`${TAG} [6D] Region deleted: "${region.region_name}" (${regionId})`);
    _notify();
  },

  storeDatasetEntries(
    regionId: string,
    category: DatasetCategory,
    entries: DatasetEntry[],
  ): void {
    _storeDataset(regionId, category, entries);

    const idx = _state.regions.findIndex(r => r.region_id === regionId);
    if (idx >= 0) {
      const region = _state.regions[idx];
      const counts = { ...region.category_counts };
      counts[category] = entries.length;
      const totalEntries = Object.values(counts).reduce((s, c) => s + (c || 0), 0);

      const datasets = [...region.datasets];
      const dsIdx = datasets.findIndex(d => d.category === category);
      const collection: DatasetCollection = {
        category,
        entry_count: entries.length,
        entries: [],
        updated_at: new Date().toISOString(),
        size_kb: Math.round(JSON.stringify(entries).length / 1024 * 10) / 10,
      };
      if (dsIdx >= 0) {
        datasets[dsIdx] = collection;
      } else {
        datasets.push(collection);
      }

      // Phase 6B: Track completed categories
      const completed = [...(region.completed_categories || [])];
      if (!completed.includes(category)) {
        completed.push(category);
      }

      _state.regions[idx] = {
        ...region,
        category_counts: counts,
        total_entries: totalEntries,
        datasets,
        completed_categories: completed,
      };
    }
  },

  loadDatasetEntries(regionId: string, category: DatasetCategory): DatasetEntry[] {
    return _loadDataset(regionId, category);
  },

  loadAllDatasetEntries(regionId: string): DatasetEntry[] {
    const all: DatasetEntry[] = [];
    for (const cat of DATASET_CATEGORIES) {
      try {
        const entries = _loadDataset(regionId, cat);
        all.push(...entries);
      } catch (e) {
        // Phase 6D: Don't let one corrupted category crash the entire load
        console.warn(`${TAG} [6D] Skipping corrupted category ${cat} for region ${regionId}:`, e);
      }
    }
    return all;
  },


  // ── Download State ────────────────────────────────────

  setActiveDownload(progress: OfflineDownloadProgress | null): void {
    _state.active_download = progress;
    _state.is_downloading = progress != null;
    _notify();
  },

  markDownloadComplete(regionId: string, actualSizeMb: number): void {
    const idx = _state.regions.findIndex(r => r.region_id === regionId);
    if (idx < 0) return;

    const region = _state.regions[idx];
    _state.regions[idx] = {
      ...region,
      download_status: 'downloaded',
      download_completed_at: new Date().toISOString(),
      download_progress: 100,
      actual_size_mb: actualSizeMb,
      error_message: null,
      last_updated: new Date().toISOString(),
      // Phase 6B: Update version tracking
      dataset_version: region.data_version_available || 1,
      completed_categories: [...DATASET_CATEGORIES],
      resume_token: null,
      retry_count: 0,
      // Phase 6D: Mark integrity as unchecked (will be validated post-download)
      integrity_status: 'unchecked',
      integrity_checked_at: null,
    };

    _state.active_download = null;
    _state.is_downloading = false;
    _recomputeAggregates();
    offlineExpeditionDbStore.persist();
    console.log(`${TAG} Download complete: region ${regionId} (${actualSizeMb} MB, v${_state.regions[idx].dataset_version})`);
    _notify();
  },

  markDownloadError(regionId: string, errorMessage: string): void {
    const idx = _state.regions.findIndex(r => r.region_id === regionId);
    if (idx < 0) return;

    const region = _state.regions[idx];
    const retryCount = (region.retry_count || 0) + 1;

    // Phase 6B: If we have completed categories, mark as error but preserve partial data
    const hasPartialData = (region.completed_categories || []).length > 0;

    _state.regions[idx] = {
      ...region,
      download_status: 'error',
      download_progress: hasPartialData
        ? Math.round(((region.completed_categories || []).length / DATASET_CATEGORIES.length) * 100)
        : 0,
      error_message: errorMessage,
      retry_count: retryCount,
    };

    _state.active_download = null;
    _state.is_downloading = false;
    _recomputeAggregates();
    offlineExpeditionDbStore.persist();
    console.warn(`${TAG} [6D] Download error: region ${regionId}: ${errorMessage} (attempt ${retryCount})`);
    _notify();
  },


  // ── Phase 6B: Download Queue ──────────────────────────

  /** Add a region to the download queue. Prevents duplicates. */
  enqueueDownload(regionId: string, isUpdate: boolean = false): boolean {
    // Phase 6B: Duplicate prevention
    if (_state.download_queue.some(q => q.region_id === regionId)) {
      console.log(`${TAG} Region ${regionId} already in download queue`);
      return false;
    }

    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) {
      console.warn(`${TAG} Cannot enqueue unknown region: ${regionId}`);
      return false;
    }

    // Prevent duplicate downloads of already-downloaded regions (unless update)
    if (region.download_status === 'downloaded' && !isUpdate) {
      console.log(`${TAG} Region ${regionId} already downloaded \u2014 use update instead`);
      return false;
    }

    // Prevent queueing if currently downloading this region
    if (_state.active_download?.region_id === regionId) {
      console.log(`${TAG} Region ${regionId} is currently downloading`);
      return false;
    }

    const item: OfflineDownloadQueueItem = {
      region_id: regionId,
      is_update: isUpdate,
      queued_at: new Date().toISOString(),
      priority: isUpdate ? 10 : 0,
    };

    _state.download_queue.push(item);
    _state.download_queue.sort((a, b) => a.priority - b.priority);
    offlineExpeditionDbStore.persist();
    console.log(`${TAG} Enqueued download: ${regionId} (update: ${isUpdate})`);
    _notify();
    return true;
  },

  /** Remove a region from the download queue */
  dequeueDownload(regionId: string): void {
    _state.download_queue = _state.download_queue.filter(q => q.region_id !== regionId);
    offlineExpeditionDbStore.persist();
    _notify();
  },

  /** Get the next item in the download queue */
  peekQueue(): OfflineDownloadQueueItem | null {
    return _state.download_queue[0] ?? null;
  },

  /** Pop the next item from the download queue */
  popQueue(): OfflineDownloadQueueItem | null {
    if (_state.download_queue.length === 0) return null;
    const item = _state.download_queue.shift()!;
    offlineExpeditionDbStore.persist();
    _notify();
    return item;
  },


  // ── Phase 6B: Version Tracking ────────────────────────

  /** Mark a region as having an available update */
  markUpdateAvailable(regionId: string, newVersion: number): void {
    const idx = _state.regions.findIndex(r => r.region_id === regionId);
    if (idx < 0) return;

    const region = _state.regions[idx];
    if (region.download_status !== 'downloaded' && region.download_status !== 'update_available') return;
    if (newVersion <= region.dataset_version) return;

    _state.regions[idx] = {
      ...region,
      download_status: 'update_available',
      data_version_available: newVersion,
    };

    _recomputeAggregates();
    offlineExpeditionDbStore.persist();
    console.log(`${TAG} [6D] Update available for ${regionId}: v${region.dataset_version} \u2192 v${newVersion} (stale detection)`);
    _notify();
  },

  /** Check if a region has an available update */
  hasUpdate(regionId: string): boolean {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return false;
    return region.download_status === 'update_available' ||
      (region.data_version_available > region.dataset_version && region.download_status === 'downloaded');
  },


  // ── Phase 6D: Dataset Integrity Validation ────────────

  /**
   * Validate the integrity of a downloaded region's datasets.
   * Marks the region's integrity_status accordingly.
   * Returns the validation result.
   */
  validateRegionIntegrity(regionId: string): DatasetValidationResult {
    const result = _validateRegionIntegrity(regionId);

    // Update the region's integrity fields
    const idx = _state.regions.findIndex(r => r.region_id === regionId);
    if (idx >= 0) {
      _state.regions[idx] = {
        ..._state.regions[idx],
        integrity_status: result.integrity_status,
        integrity_checked_at: result.validated_at,
      };

      // Phase 6D: If invalid, exclude from offline query results
      if (result.integrity_status === 'invalid' && !result.is_usable) {
        console.warn(
          `${TAG} [6D] Region "${_state.regions[idx].region_name}" failed integrity validation \u2014 ` +
          `excluded from offline queries. ${result.summary}`
        );
        // Mark as error so it's not treated as downloaded
        _state.regions[idx].download_status = 'error';
        _state.regions[idx].error_message = `Integrity check failed: ${result.summary}`;
      }

      _recomputeAggregates();
      offlineExpeditionDbStore.persist();
      _notify();
    }

    return result;
  },

  /**
   * Phase 6D: Deferred integrity check for all downloaded regions.
   * Called after initialization to avoid blocking startup.
   */
  _deferredIntegrityCheck(): void {
    const downloaded = _state.regions.filter(
      r => (r.download_status === 'downloaded' || r.download_status === 'update_available') &&
           (r.integrity_status === 'unchecked' || !r.integrity_status)
    );

    if (downloaded.length === 0) {
      // Phase 6D: Also check for stale regions
      offlineExpeditionDbStore._detectStaleRegions();
      return;
    }

    console.log(`${TAG} [6D] Deferred integrity check: ${downloaded.length} region(s)`);

    for (const region of downloaded) {
      offlineExpeditionDbStore.validateRegionIntegrity(region.region_id);
    }

    // Phase 6D: Check for stale regions after integrity validation
    offlineExpeditionDbStore._detectStaleRegions();
  },

  /**
   * Phase 6D: Detect stale regions and update their integrity status.
   */
  _detectStaleRegions(): void {
    let staleCount = 0;
    for (const region of _state.regions) {
      if (region.download_status !== 'downloaded' && region.download_status !== 'update_available') continue;
      if (region.integrity_status === 'invalid') continue; // Already invalid

      if (_isRegionStale(region)) {
        const days = _daysSinceUpdate(region);
        const wasPreviouslyStale = region.integrity_status === 'stale';

        if (!wasPreviouslyStale) {
          console.log(
            `${TAG} [6D] Stale region detected: "${region.region_name}" \u2014 ` +
            `${days} days since update (threshold: ${STALE_DATASET_THRESHOLD_DAYS} days)`
          );
        }

        // Mark as stale but keep usable
        const idx = _state.regions.findIndex(r => r.region_id === region.region_id);
        if (idx >= 0) {
          _state.regions[idx] = {
            ..._state.regions[idx],
            integrity_status: 'stale',
          };
        }
        staleCount++;
      }
    }

    if (staleCount > 0) {
      _recomputeAggregates();
      offlineExpeditionDbStore.persist();
      console.log(`${TAG} [6D] Stale detection complete: ${staleCount} stale region(s)`);
      _notify();
    }
  },


  // ── Phase 6B/6D: Storage Management ───────────────────

  /** Get storage statistics for all regions */
  getStorageSummary(): OfflineStorageSummary {
    const regions: RegionStorageStats[] = _state.regions
      .filter(r => r.download_status !== 'not_downloaded')
      .map(r => ({
        region_id: r.region_id,
        region_name: r.region_name,
        download_status: r.download_status,
        actual_size_mb: r.actual_size_mb,
        estimated_size_mb: r.estimated_size_mb,
        total_entries: r.total_entries,
        category_counts: r.category_counts,
        last_updated: r.last_updated,
        dataset_version: r.dataset_version,
        data_version_available: r.data_version_available,
        has_update: r.data_version_available > r.dataset_version,
        // Phase 6D
        integrity_status: r.integrity_status || 'unchecked',
        is_stale: _isRegionStale(r),
        days_since_update: _daysSinceUpdate(r),
      }));

    return {
      total_regions: _state.regions.length,
      downloaded_regions: _state.downloaded_region_count,
      total_entries: _state.total_entries,
      total_storage_mb: _state.total_storage_mb,
      regions,
      evaluated_at: new Date().toISOString(),
      // Phase 6D
      integrity_issues: _state.integrity_issue_count,
      stale_regions: _state.stale_region_count,
    };
  },

  /** Get storage stats for a single region */
  getRegionStorageStats(regionId: string): RegionStorageStats | null {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return null;
    return {
      region_id: region.region_id,
      region_name: region.region_name,
      download_status: region.download_status,
      actual_size_mb: region.actual_size_mb,
      estimated_size_mb: region.estimated_size_mb,
      total_entries: region.total_entries,
      category_counts: region.category_counts,
      last_updated: region.last_updated,
      dataset_version: region.dataset_version,
      data_version_available: region.data_version_available,
      has_update: region.data_version_available > region.dataset_version,
      // Phase 6D
      integrity_status: region.integrity_status || 'unchecked',
      is_stale: _isRegionStale(region),
      days_since_update: _daysSinceUpdate(region),
    };
  },


  // ── Phase 6B: Interrupted Download Recovery ───────────

  /** Check for and recover interrupted downloads */
  _recoverInterruptedDownloads(): void {
    let recovered = 0;
    for (const region of _state.regions) {
      if (region.download_status === 'downloading' || region.download_status === 'updating') {
        const completedCount = (region.completed_categories || []).length;
        if (completedCount > 0 && completedCount < DATASET_CATEGORIES.length) {
          // Partial download — mark as error with resume capability
          console.log(
            `${TAG} [6D] Recovering interrupted download: "${region.region_name}" ` +
            `(${completedCount}/${DATASET_CATEGORIES.length} categories)`
          );
          offlineExpeditionDbStore.updateRegion(region.region_id, {
            download_status: 'error',
            error_message: 'Download interrupted \u2014 tap to resume',
            download_progress: Math.round((completedCount / DATASET_CATEGORIES.length) * 100),
          });
          // Auto-enqueue for resume
          offlineExpeditionDbStore.enqueueDownload(region.region_id, false);
          recovered++;
        } else if (completedCount === 0) {
          // No data downloaded — reset to not_downloaded
          console.log(
            `${TAG} [6D] Resetting empty interrupted download: "${region.region_name}"`
          );
          offlineExpeditionDbStore.updateRegion(region.region_id, {
            download_status: 'not_downloaded',
            download_progress: 0,
            error_message: null,
          });
        } else if (completedCount === DATASET_CATEGORIES.length) {
          // All categories done but status not updated — mark complete
          console.log(
            `${TAG} [6D] Completing interrupted download: "${region.region_name}" (all categories done)`
          );
          offlineExpeditionDbStore.markDownloadComplete(
            region.region_id,
            region.actual_size_mb || region.estimated_size_mb
          );
        }
      }
    }
    if (recovered > 0) {
      console.log(`${TAG} [6D] Recovered ${recovered} interrupted download(s) \u2014 auto-queued for resume`);
    }
  },

  /** Get categories that still need to be downloaded for a region */
  getRemainingCategories(regionId: string): DatasetCategory[] {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return [...DATASET_CATEGORIES];
    const completed = new Set(region.completed_categories || []);
    return DATASET_CATEGORIES.filter(cat => !completed.has(cat));
  },

  /** Whether a region can be retried */
  canRetry(regionId: string): boolean {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return false;
    return region.download_status === 'error' && (region.retry_count || 0) < MAX_RETRY_ATTEMPTS;
  },


  // ── Querying ──────────────────────────────────────────

  query(params: OfflineDatasetQuery): OfflineDatasetQueryResult {
    // Phase 6D: Use usable regions (excludes invalid integrity)
    const downloaded = _state.regions.filter(
      r => (r.download_status === 'downloaded' || r.download_status === 'update_available') &&
           r.integrity_status !== 'invalid'
    );
    if (downloaded.length === 0) {
      return {
        entries: [],
        total_count: 0,
        is_offline: true,
        source_regions: [],
        queried_at: new Date().toISOString(),
      };
    }

    const categories = params.categories || (params.category ? [params.category] : DATASET_CATEGORIES);
    let allEntries: DatasetEntry[] = [];
    const sourceRegions: string[] = [];

    for (const region of downloaded) {
      if (params.bounds && !boundsOverlap(
        { min_lat: params.bounds.min_lat, max_lat: params.bounds.max_lat, min_lng: params.bounds.min_lng, max_lng: params.bounds.max_lng },
        region.geographic_bounds,
      )) {
        continue;
      }

      let regionContributed = false;
      for (const cat of categories) {
        try {
          const entries = _loadDataset(region.region_id, cat);
          if (entries.length > 0) {
            // Phase 6D: Validate entries before including in results
            const validEntries = entries.filter(e =>
              e && typeof e.id === 'string' && typeof e.latitude === 'number' &&
              typeof e.longitude === 'number' && !isNaN(e.latitude) && !isNaN(e.longitude)
            );
            if (validEntries.length > 0) {
              allEntries.push(...validEntries);
              regionContributed = true;
            }
            if (validEntries.length < entries.length) {
              console.warn(
                `${TAG} [6D] Filtered ${entries.length - validEntries.length} invalid entries ` +
                `from ${cat} in region ${region.region_id}`
              );
            }
          }
        } catch (e) {
          // Phase 6D: Corrupted category — skip silently
          console.warn(`${TAG} [6D] Query skipping corrupted ${cat} in region ${region.region_id}:`, e);
        }
      }
      if (regionContributed) {
        sourceRegions.push(region.region_id);
      }
    }

    // Apply filters
    if (params.bounds) {
      allEntries = allEntries.filter(e =>
        pointInBounds(e.latitude, e.longitude, params.bounds!),
      );
    }

    if (params.near) {
      const { latitude, longitude, radius_miles } = params.near;
      allEntries = allEntries.filter(e => {
        const dist = haversineDistanceMiles(latitude, longitude, e.latitude, e.longitude);
        return dist <= radius_miles;
      });
    }

    if (params.search_text) {
      const searchLower = params.search_text.toLowerCase();
      allEntries = allEntries.filter(e => {
        const name = (e.name || '').toLowerCase();
        const desc = (e.description || '').toLowerCase();
        const tags = (e.tags || []).join(' ').toLowerCase();
        return name.includes(searchLower) || desc.includes(searchLower) || tags.includes(searchLower);
      });
    }

    if (params.min_difficulty != null) {
      allEntries = allEntries.filter(e =>
        e.difficulty_rating == null || e.difficulty_rating >= params.min_difficulty!,
      );
    }

    if (params.max_difficulty != null) {
      allEntries = allEntries.filter(e =>
        e.difficulty_rating == null || e.difficulty_rating <= params.max_difficulty!,
      );
    }

    // Deduplicate by ID
    const seen = new Set<string>();
    allEntries = allEntries.filter(e => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });

    const totalCount = allEntries.length;

    // Sort
    if (params.sort_by === 'name') {
      allEntries.sort((a, b) => a.name.localeCompare(b.name));
    } else if (params.sort_by === 'difficulty') {
      allEntries.sort((a, b) => (a.difficulty_rating ?? 0) - (b.difficulty_rating ?? 0));
    } else if (params.sort_by === 'updated') {
      allEntries.sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));
    } else if (params.sort_by === 'distance' && params.near) {
      const { latitude, longitude } = params.near;
      allEntries.sort((a, b) => {
        const distA = haversineDistanceMiles(latitude, longitude, a.latitude, a.longitude);
        const distB = haversineDistanceMiles(latitude, longitude, b.latitude, b.longitude);
        return distA - distB;
      });
    }

    if (params.sort_direction === 'desc') {
      allEntries.reverse();
    }

    if (params.limit && params.limit > 0) {
      allEntries = allEntries.slice(0, params.limit);
    }

    return {
      entries: allEntries,
      total_count: totalCount,
      is_offline: true,
      source_regions: sourceRegions,
      queried_at: new Date().toISOString(),
    };
  },

  coversPosition(lat: number, lng: number): boolean {
    return _state.regions.some(r =>
      (r.download_status === 'downloaded' || r.download_status === 'update_available') &&
      r.integrity_status !== 'invalid' &&
      pointInBounds(lat, lng, r.geographic_bounds),
    );
  },

  coversRoute(points: Array<{ lat: number; lng: number }>): boolean {
    if (points.length === 0) return false;
    const downloaded = _state.regions.filter(
      r => (r.download_status === 'downloaded' || r.download_status === 'update_available') &&
           r.integrity_status !== 'invalid'
    );
    if (downloaded.length === 0) return false;

    let coveredCount = 0;
    for (const pt of points) {
      for (const region of downloaded) {
        if (pointInBounds(pt.lat, pt.lng, region.geographic_bounds)) {
          coveredCount++;
          break;
        }
      }
    }
    return (coveredCount / points.length) >= 0.8;
  },

  getRegionsForPosition(lat: number, lng: number): OfflineExpeditionRegion[] {
    return _state.regions.filter(r =>
      (r.download_status === 'downloaded' || r.download_status === 'update_available') &&
      r.integrity_status !== 'invalid' &&
      pointInBounds(lat, lng, r.geographic_bounds),
    );
  },


  // ── Readiness Evaluation ──────────────────────────────

  evaluateReadiness(): OfflineExpeditionReadiness {
    const now = Date.now();
    if (_cachedReadiness && (now - _readinessCacheTime) < READINESS_CACHE_MS) {
      return _cachedReadiness;
    }

    try {
      // Phase 6D: Only consider usable regions (not invalid)
      const downloaded = _state.regions.filter(
        r => (r.download_status === 'downloaded' || r.download_status === 'update_available') &&
             r.integrity_status !== 'invalid'
      );

      if (downloaded.length === 0) {
        _cachedReadiness = {
          ...DEFAULT_OFFLINE_EXPEDITION_READINESS,
          evaluated_at: new Date().toISOString(),
        };
        _readinessCacheTime = now;
        return _cachedReadiness;
      }

      let coversPosition = false;
      try {
        const { gpsUIState } = require('./gpsUIState');
        const gps = gpsUIState.get();
        if (gps.hasFix && gps.position) {
          coversPosition = offlineExpeditionDbStore.coversPosition(
            gps.position.latitude,
            gps.position.longitude,
          );
        }
      } catch {}

      let coversRoute = false;
      try {
        const { routeStore } = require('./routeStore');
        const activeRoute = routeStore.getActive();
        if (activeRoute?.segments) {
          const points: Array<{ lat: number; lng: number }> = [];
          for (const seg of activeRoute.segments) {
            for (const pt of seg.points || []) {
              points.push({ lat: pt.lat, lng: pt.lon ?? pt.lng });
            }
          }
          if (points.length > 0) {
            const sampled = points.filter((_, i) => i % 10 === 0);
            coversRoute = offlineExpeditionDbStore.coversRoute(sampled);
          }
        }
      } catch {}

      const categorySet = new Set<DatasetCategory>();
      for (const region of downloaded) {
        for (const cat of DATASET_CATEGORIES) {
          if (region.category_counts[cat] && region.category_counts[cat]! > 0) {
            categorySet.add(cat);
          }
        }
      }

      // Phase 6D: Check integrity status
      const allValid = downloaded.every(
        r => r.integrity_status === 'valid' || r.integrity_status === 'stale'
      );
      const staleCount = downloaded.filter(r => _isRegionStale(r)).length;

      _cachedReadiness = {
        has_offline_data: true,
        downloaded_regions: downloaded.length,
        total_entries: _state.total_entries,
        storage_mb: _state.total_storage_mb,
        covers_current_position: coversPosition,
        covers_active_route: coversRoute,
        available_categories: Array.from(categorySet),
        evaluated_at: new Date().toISOString(),
        // Phase 6D
        all_regions_valid: allValid,
        stale_regions: staleCount,
      };

      _readinessCacheTime = now;
      return _cachedReadiness;
    } catch (e) {
      console.warn(`${TAG} Readiness evaluation failed:`, e);
      return {
        ...DEFAULT_OFFLINE_EXPEDITION_READINESS,
        evaluated_at: new Date().toISOString(),
      };
    }
  },


  // ── Persistence ───────────────────────────────────────

  persist(): void {
    try {
      const session: OfflineExpeditionDbSession = {
        version: OFFLINE_EXPEDITION_DB_SESSION_VERSION,
        regions: _state.regions.map(r => {
          const { datasets, ...meta } = r;
          return meta;
        }),
        persisted_at: new Date().toISOString(),
        download_queue: _state.download_queue,
      };
      _ls.set(STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
      console.warn(`${TAG} [6D] Failed to persist session:`, e);
    }
  },

  restore(): boolean {
    try {
      const raw = _ls.get(STORAGE_KEY);
      if (!raw) {
        console.log(`${TAG} [6D] No persisted session found \u2014 starting fresh`);
        return false;
      }

      let session: OfflineExpeditionDbSession;
      try {
        session = JSON.parse(raw);
      } catch (parseError) {
        console.warn(`${TAG} [6D] Session data corrupted \u2014 discarding`);
        _ls.del(STORAGE_KEY);
        return false;
      }

      // Version check — accept v1, v2, v3
      if (session.version > OFFLINE_EXPEDITION_DB_SESSION_VERSION) {
        console.log(`${TAG} [6D] Session version too new (v${session.version}), discarding`);
        _ls.del(STORAGE_KEY);
        return false;
      }

      // Age check
      const age = Date.now() - new Date(session.persisted_at).getTime();
      if (age > SESSION_MAX_AGE_MS) {
        console.log(`${TAG} [6D] Session too old (${Math.round(age / 86400000)} days), discarding`);
        _ls.del(STORAGE_KEY);
        return false;
      }

      // Restore regions (re-attach empty datasets array + ensure all fields exist)
      _state.regions = session.regions.map(meta => ({
        ...meta,
        datasets: [],
        // Phase 6B: Ensure version fields exist
        dataset_version: (meta as any).dataset_version ?? 0,
        data_version_available: (meta as any).data_version_available ?? 1,
        completed_categories: (meta as any).completed_categories ?? [],
        resume_token: (meta as any).resume_token ?? null,
        retry_count: (meta as any).retry_count ?? 0,
        // Phase 6D: Ensure integrity fields exist
        integrity_status: (meta as any).integrity_status ?? 'unchecked',
        integrity_checked_at: (meta as any).integrity_checked_at ?? null,
        previous_dataset_version: (meta as any).previous_dataset_version ?? 0,
      }));

      // Phase 6B: Restore download queue
      _state.download_queue = session.download_queue ?? [];

      // Rebuild dataset collection metadata from stored entries
      let restoredEntryCount = 0;
      let corruptedCategories = 0;
      for (const region of _state.regions) {
        if (region.download_status !== 'downloaded' && region.download_status !== 'update_available') continue;
        const datasets: DatasetCollection[] = [];
        for (const cat of DATASET_CATEGORIES) {
          try {
            const entries = _loadDataset(region.region_id, cat);
            if (entries.length > 0) {
              datasets.push({
                category: cat,
                entry_count: entries.length,
                entries: [],
                updated_at: region.last_updated || new Date().toISOString(),
                size_kb: Math.round(JSON.stringify(entries).length / 1024 * 10) / 10,
              });
              restoredEntryCount += entries.length;
            }
          } catch (e) {
            corruptedCategories++;
            console.warn(`${TAG} [6D] Corrupted dataset during restore: ${cat} in ${region.region_id}`);
          }
        }
        region.datasets = datasets;
      }

      _recomputeAggregates();

      console.log(
        `${TAG} [6D] Session restored (v${session.version}): ` +
        `${_state.regions.length} regions, ${_state.downloaded_region_count} downloaded, ` +
        `${restoredEntryCount} entries verified, ${_state.download_queue.length} queued` +
        (corruptedCategories > 0 ? `, ${corruptedCategories} corrupted categories detected` : '')
      );
      return true;
    } catch (e) {
      console.warn(`${TAG} [6D] Failed to restore session:`, e);
      return false;
    }
  },

  clearAll(): void {
    for (const region of _state.regions) {
      _deleteAllDatasets(region.region_id);
    }
    _ls.del(STORAGE_KEY);
    _state = createDefaultOfflineExpeditionDbState();
    _state.initialized = true;
    _cachedReadiness = null;
    console.log(`${TAG} [6D] All data cleared`);
    _notify();
  },


  // ── Reset ─────────────────────────────────────────────

  reset(): void {
    _state = createDefaultOfflineExpeditionDbState();
    _cachedReadiness = null;
    _readinessCacheTime = 0;
    _notify();
    console.log(`${TAG} [6D] Store reset`);
  },


  // ── Subscriptions ─────────────────────────────────────

  subscribe(fn: Listener): () => void {
    _listeners.add(fn);
    return () => { _listeners.delete(fn); };
  },
};

