/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE EXPEDITION DATABASE ENGINE — Phase 6A/6B/6C/6D
 * ═══════════════════════════════════════════════════════════
 *
 * Service layer for the Offline Expedition Database.
 * Manages region downloads, seed data generation, and
 * integration with Discovery, Navigation, Connectivity
 * Intelligence, and Remoteness systems.
 *
 * Phase 6D additions:
 *   - Post-download dataset integrity validation
 *   - Safe update: keeps old data until replacement is ready
 *   - If update fails midway, older valid dataset stays active
 *   - Stale dataset detection on initialization
 *   - Enhanced console logging for field reliability
 *   - Deferred heavy operations for startup performance
 *   - Corruption-safe query paths
 *   - Android Auto / CarPlay safe consumption preserved
 *
 * Phase 6C additions:
 *   - Enhanced Discovery integration with all 7 dataset categories
 *   - Enhanced Navigation integration with category-specific queries
 *   - Lightweight console logging for offline query behavior
 *   - isActivelyUsable() — confirms data is not just cached but queryable
 *   - queryAllCategories() — query all categories for a position
 *   - Invalidates navigation bridge cache on download/remove
 *
 * Phase 6B additions:
 *   - Region download manager with progress tracking
 *   - Resume interrupted downloads automatically
 *   - Download queue processing (sequential)
 *   - Dataset version tracking and update detection
 *   - Duplicate download prevention
 *   - Storage usage tracking per region
 */


import { offlineExpeditionDbStore } from './offlineExpeditionDbStore';
import { invalidateCacheReadiness } from './offlineCacheAwarenessEngine';
import type {
  OfflineExpeditionRegion,
  OfflineRegionBounds,
  DatasetCategory,
  DatasetEntry,
  OfflineDownloadProgress,
  OfflineDownloadProgressCallback,
  OfflineDatasetQuery,
  OfflineDatasetQueryResult,
  OfflineExpeditionReadiness,
  OfflineDownloadQueueItem,
  OfflineStorageSummary,
  DatasetValidationResult,
} from './offlineExpeditionDbTypes';
import {
  DATASET_CATEGORIES,
  createDefaultOfflineDownloadProgress,
} from './offlineExpeditionDbTypes';


// ── Constants ────────────────────────────────────────────

const TAG = '[OfflineExpeditionDB-Engine]';

/** Debounce for readiness re-evaluation after signal changes */
const READINESS_DEBOUNCE_MS = 5_000;

/** Queue processing interval (check every 2 seconds) */
const QUEUE_PROCESS_INTERVAL_MS = 2_000;

/** Subscriptions to external signal sources */
let _subscriptions: (() => void)[] = [];
let _readinessDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let _queueProcessTimer: ReturnType<typeof setInterval> | null = null;
let _initialized = false;
let _isProcessingQueue = false;

/** Phase 6B: Active download progress callbacks */
let _activeProgressCallback: OfflineDownloadProgressCallback | null = null;

/** Phase 6D: Backup datasets for safe updates */
const _updateBackups: Map<string, Map<DatasetCategory, DatasetEntry[]>> = new Map();


// ── Seed Data Helpers ────────────────────────────────────

function _seedId(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`;
}

function _generateProceduralEntries(
  category: DatasetCategory,
  centerLat: number,
  centerLng: number,
  bounds: OfflineRegionBounds,
  count: number,
): DatasetEntry[] {
  const entries: DatasetEntry[] = [];
  const latRange = bounds.max_lat - bounds.min_lat;
  const lngRange = bounds.max_lng - bounds.min_lng;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const radius = 0.3 + (i % 3) * 0.15;
    const lat = centerLat + Math.sin(angle) * radius * latRange * 0.4;
    const lng = centerLng + Math.cos(angle) * radius * lngRange * 0.4;

    const clampedLat = Math.max(bounds.min_lat, Math.min(bounds.max_lat, lat));
    const clampedLng = Math.max(bounds.min_lng, Math.min(bounds.max_lng, lng));

    const entry = _generateEntryForCategory(category, i, clampedLat, clampedLng);
    if (entry) entries.push(entry);
  }

  return entries;
}

function _generateEntryForCategory(
  category: DatasetCategory,
  index: number,
  lat: number,
  lng: number,
): DatasetEntry | null {
  const baseId = _seedId(category, `${lat.toFixed(4)}-${lng.toFixed(4)}-${index}`);

  switch (category) {
    case 'campsites':
      return {
        id: baseId,
        category: 'campsites',
        name: `Campsite ${index + 1}`,
        latitude: lat,
        longitude: lng,
        description: `Dispersed camping area with ${index % 2 === 0 ? 'fire ring' : 'flat ground'}`,
        campsite_type: index % 3 === 0 ? 'established' : index % 3 === 1 ? 'dispersed' : 'primitive',
        water_available: index % 4 === 0,
        permit_required: index % 5 === 0,
        max_capacity: 2 + (index % 6),
        source: 'ecs_seed',
        updated_at: new Date().toISOString(),
      };

    case 'fuel_stations':
      return {
        id: baseId,
        category: 'fuel_stations',
        name: `Fuel Stop ${index + 1}`,
        latitude: lat,
        longitude: lng,
        description: `Gas station with ${index % 2 === 0 ? 'diesel' : 'regular fuel'}`,
        service_type: index % 2 === 0 ? 'diesel + regular' : 'regular only',
        seasonal: false,
        hours: index % 3 === 0 ? '24 hours' : '6am \u2013 10pm',
        source: 'ecs_seed',
        updated_at: new Date().toISOString(),
      };

    case 'water_sources':
      return {
        id: baseId,
        category: 'water_sources',
        name: `Water Source ${index + 1}`,
        latitude: lat,
        longitude: lng,
        description: index % 2 === 0 ? 'Potable water fill station' : 'Natural spring \u2014 filter recommended',
        service_type: index % 2 === 0 ? 'potable' : 'natural',
        seasonal: index % 3 === 0,
        source: 'ecs_seed',
        updated_at: new Date().toISOString(),
      };

    case 'ranger_stations':
      return {
        id: baseId,
        category: 'ranger_stations',
        name: `Ranger Station ${index + 1}`,
        latitude: lat,
        longitude: lng,
        description: 'Forest service ranger station and visitor center',
        service_type: 'ranger_station',
        seasonal: index % 4 === 0,
        hours: index % 2 === 0 ? '8am \u2013 5pm' : '9am \u2013 4pm',
        phone: `(555) ${100 + index}-${1000 + index * 7}`,
        source: 'ecs_seed',
        updated_at: new Date().toISOString(),
      };

    case 'recovery_points':
      return {
        id: baseId,
        category: 'recovery_points',
        name: `Recovery Point ${index + 1}`,
        latitude: lat,
        longitude: lng,
        description: index % 2 === 0 ? 'Tow service staging area' : 'Winch recovery point',
        recovery_type: index % 4 === 0 ? 'tow' : index % 4 === 1 ? 'winch' : index % 4 === 2 ? 'staging' : 'mechanic',
        phone: `(555) ${200 + index}-${2000 + index * 3}`,
        source: 'ecs_seed',
        updated_at: new Date().toISOString(),
      };

    case 'hazard_zones':
      return {
        id: baseId,
        category: 'hazard_zones',
        name: `Hazard Zone ${index + 1}`,
        latitude: lat,
        longitude: lng,
        hazard_type: index % 3 === 0 ? 'flood_zone' : index % 3 === 1 ? 'rock_fall' : 'steep_grade',
        hazard_severity: index % 4 === 0 ? 'high' : index % 4 === 1 ? 'moderate' : 'low',
        hazard_description: index % 3 === 0
          ? 'Flash flood risk during rain events'
          : index % 3 === 1
            ? 'Loose rock and potential rock fall area'
            : 'Steep grade \u2014 low range recommended',
        source: 'ecs_seed',
        updated_at: new Date().toISOString(),
      };

    default:
      return null;
  }
}


// ── Trail Data from Discovery Engine ─────────────────────

function _extractTrailsFromDiscovery(bounds: OfflineRegionBounds): DatasetEntry[] {
  try {
    const { loadExpeditionOpportunities } = require('./discoverEngine');
    const opportunities = loadExpeditionOpportunities();

    return opportunities
      .filter((op: any) =>
        op.startLat >= bounds.min_lat &&
        op.startLat <= bounds.max_lat &&
        op.startLng >= bounds.min_lng &&
        op.startLng <= bounds.max_lng
      )
      .map((op: any): DatasetEntry => ({
        id: `trail-${op.id}`,
        category: 'trails',
        name: op.name,
        latitude: op.startLat,
        longitude: op.startLng,
        description: op.description,
        difficulty_rating: Math.ceil((op.terrainDifficulty || op.remotenessScore || 5) / 2),
        trail_distance_mi: op.distanceMiles,
        elevation_gain_ft: op.elevationGainFt,
        terrain_type: op.terrainType,
        tags: [
          op.terrainType,
          op.bestSeason,
          op.permitRequired ? 'permit-required' : 'no-permit',
          op.region,
        ].filter(Boolean),
        source: 'ecs_discovery',
        updated_at: new Date().toISOString(),
      }));
  } catch (e) {
    console.warn(`${TAG} Failed to extract trails from Discovery:`, e);
    return [];
  }
}


// ── Available Regions ────────────────────────────────────

function _getAvailableRegions(): OfflineExpeditionRegion[] {
  try {
    const { REGION_GROUPS, loadExpeditionOpportunities } = require('./discoverEngine');
    const opportunities = loadExpeditionOpportunities();

    const regions: OfflineExpeditionRegion[] = [];

    for (const [groupId, meta] of Object.entries(REGION_GROUPS)) {
      const groupMeta = meta as { name: string };
      const groupTrails = opportunities.filter((op: any) => op.regionGroup === groupId);
      if (groupTrails.length === 0) continue;

      let minLat = Infinity, maxLat = -Infinity;
      let minLng = Infinity, maxLng = -Infinity;
      let centerLat = 0, centerLng = 0;

      for (const trail of groupTrails) {
        minLat = Math.min(minLat, trail.startLat);
        maxLat = Math.max(maxLat, trail.startLat);
        minLng = Math.min(minLng, trail.startLng);
        maxLng = Math.max(maxLng, trail.startLng);
        centerLat += trail.startLat;
        centerLng += trail.startLng;
      }

      centerLat /= groupTrails.length;
      centerLng /= groupTrails.length;

      const bufferDeg = 50 / 69;
      const lngBuffer = bufferDeg / Math.cos((centerLat * Math.PI) / 180);

      const bounds: OfflineRegionBounds = {
        min_lat: minLat - bufferDeg,
        max_lat: maxLat + bufferDeg,
        min_lng: minLng - lngBuffer,
        max_lng: maxLng + lngBuffer,
      };

      const trailCount = groupTrails.length;
      const campsiteCount = Math.max(3, trailCount * 2);
      const fuelCount = Math.max(2, Math.ceil(trailCount * 0.8));
      const waterCount = Math.max(2, Math.ceil(trailCount * 1.2));
      const rangerCount = Math.max(1, Math.ceil(trailCount * 0.5));
      const recoveryCount = Math.max(1, Math.ceil(trailCount * 0.4));
      const hazardCount = Math.max(1, Math.ceil(trailCount * 0.6));
      const totalEntries = trailCount + campsiteCount + fuelCount + waterCount + rangerCount + recoveryCount + hazardCount;

      regions.push({
        region_id: `oexp-${groupId}`,
        region_name: groupMeta.name,
        geographic_bounds: bounds,
        download_status: 'not_downloaded',
        last_updated: null,
        download_started_at: null,
        download_completed_at: null,
        download_progress: 0,
        error_message: null,
        total_entries: totalEntries,
        category_counts: {
          trails: trailCount,
          campsites: campsiteCount,
          fuel_stations: fuelCount,
          water_sources: waterCount,
          ranger_stations: rangerCount,
          recovery_points: recoveryCount,
          hazard_zones: hazardCount,
        },
        estimated_size_mb: Math.round(totalEntries * 0.002 * 10) / 10,
        actual_size_mb: 0,
        datasets: [],
        description: `Expedition data for ${groupMeta.name} including trails, campsites, fuel, water, and services.`,
        region_group_id: groupId,
        center_lat: centerLat,
        center_lng: centerLng,
        // Phase 6B: Version tracking
        dataset_version: 0,
        data_version_available: 1,
        completed_categories: [],
        resume_token: null,
        retry_count: 0,
        // Phase 6D: Integrity
        integrity_status: 'unchecked',
        integrity_checked_at: null,
        previous_dataset_version: 0,
      });
    }

    return regions;
  } catch (e) {
    console.warn(`${TAG} Failed to generate available regions:`, e);
    return [];
  }
}


// ── Phase 6D: Safe Update Backup ─────────────────────────

/**
 * Before an update, back up the existing datasets so we can
 * restore them if the update fails midway.
 */
function _backupRegionDatasets(regionId: string): void {
  const backup = new Map<DatasetCategory, DatasetEntry[]>();
  for (const cat of DATASET_CATEGORIES) {
    try {
      const entries = offlineExpeditionDbStore.loadDatasetEntries(regionId, cat);
      if (entries.length > 0) {
        backup.set(cat, entries);
      }
    } catch {}
  }
  _updateBackups.set(regionId, backup);
  console.log(`${TAG} [6D] Backed up ${backup.size} categories for safe update: ${regionId}`);
}

/**
 * Restore backed-up datasets after a failed update.
 */
function _restoreRegionBackup(regionId: string): boolean {
  const backup = _updateBackups.get(regionId);
  if (!backup || backup.size === 0) {
    console.warn(`${TAG} [6D] No backup found for region ${regionId}`);
    return false;
  }

  let restored = 0;
  for (const [cat, entries] of backup) {
    try {
      offlineExpeditionDbStore.storeDatasetEntries(regionId, cat, entries);
      restored++;
    } catch (e) {
      console.warn(`${TAG} [6D] Failed to restore backup for ${cat} in ${regionId}:`, e);
    }
  }

  _updateBackups.delete(regionId);
  console.log(`${TAG} [6D] Restored ${restored} categories from backup for ${regionId}`);
  return restored > 0;
}

/**
 * Clear the backup after a successful update.
 */
function _clearRegionBackup(regionId: string): void {
  _updateBackups.delete(regionId);
}


// ── Download Engine ──────────────────────────────────────

/**
 * Phase 6B/6D: Download expedition data for a region with resume support.
 * Phase 6D: Includes post-download integrity validation and safe update backup.
 */
async function _downloadRegion(
  regionId: string,
  onProgress?: OfflineDownloadProgressCallback,
  isResume: boolean = false,
): Promise<boolean> {
  const region = offlineExpeditionDbStore.getRegion(regionId);
  if (!region) {
    console.warn(`${TAG} Region not found: ${regionId}`);
    return false;
  }

  // Phase 6B: Duplicate download prevention
  if (offlineExpeditionDbStore.isDownloading() && offlineExpeditionDbStore.getActiveDownload()?.region_id !== regionId) {
    console.log(`${TAG} Another download is in progress \u2014 queueing ${regionId}`);
    offlineExpeditionDbStore.enqueueDownload(regionId, region.download_status === 'update_available');
    return false;
  }

  const isUpdate = region.download_status === 'updating' || region.download_status === 'update_available';

  // Phase 6D: Back up existing data before update
  if (isUpdate && !isResume) {
    _backupRegionDatasets(regionId);
    // Preserve previous version for rollback
    offlineExpeditionDbStore.updateRegion(regionId, {
      previous_dataset_version: region.dataset_version,
    });
  }

  console.log(
    `${TAG} ${isResume ? 'Resuming' : 'Starting'} download for region: ` +
    `"${region.region_name}" (${regionId})${isUpdate ? ' [UPDATE]' : ''}`
  );

  // Phase 6B: Determine which categories to download
  const remainingCategories = isResume
    ? offlineExpeditionDbStore.getRemainingCategories(regionId)
    : [...DATASET_CATEGORIES];

  const completedBefore = DATASET_CATEGORIES.length - remainingCategories.length;

  // Update status
  offlineExpeditionDbStore.updateRegion(regionId, {
    download_status: isUpdate ? 'updating' : 'downloading',
    download_started_at: new Date().toISOString(),
    download_progress: isResume ? Math.round((completedBefore / DATASET_CATEGORIES.length) * 100) : 0,
    error_message: null,
  });

  const progress = createDefaultOfflineDownloadProgress(regionId);
  progress.status = isResume ? 'resuming' : 'fetching';
  progress.categories_total = DATASET_CATEGORIES.length;
  progress.categories_completed = completedBefore;
  progress.percent = isResume ? Math.round((completedBefore / DATASET_CATEGORIES.length) * 100) : 0;
  progress.message = isResume
    ? `Resuming download (${completedBefore}/${DATASET_CATEGORIES.length} categories)\u2026`
    : 'Preparing download\u2026';
  offlineExpeditionDbStore.setActiveDownload(progress);
  onProgress?.(progress);

  try {
    const bounds = region.geographic_bounds;
    const centerLat = region.center_lat ?? (bounds.min_lat + bounds.max_lat) / 2;
    const centerLng = region.center_lng ?? (bounds.min_lng + bounds.max_lng) / 2;
    let totalEntries = 0;
    let totalSizeKb = 0;

    // Count already-downloaded entries
    if (isResume) {
      const completedCats = DATASET_CATEGORIES.filter(c => !remainingCategories.includes(c));
      for (const cat of completedCats) {
        const existing = offlineExpeditionDbStore.loadDatasetEntries(regionId, cat);
        totalEntries += existing.length;
        totalSizeKb += Math.round(JSON.stringify(existing).length / 1024 * 10) / 10;
      }
    }

    // Download remaining categories
    for (let i = 0; i < remainingCategories.length; i++) {
      const category = remainingCategories[i];

      // Update progress
      progress.current_category = category;
      progress.categories_completed = completedBefore + i;
      progress.percent = Math.round(((completedBefore + i) / DATASET_CATEGORIES.length) * 100);
      progress.message = `Downloading ${category.replace(/_/g, ' ')}\u2026`;
      progress.status = 'processing';
      offlineExpeditionDbStore.setActiveDownload({ ...progress });
      onProgress?.({ ...progress });

      // Generate entries for this category
      let entries: DatasetEntry[];
      if (category === 'trails') {
        entries = _extractTrailsFromDiscovery(bounds);
      } else {
        const count = region.category_counts[category] || 3;
        entries = _generateProceduralEntries(category, centerLat, centerLng, bounds, count);
      }

      // Store entries
      progress.status = 'storing';
      offlineExpeditionDbStore.storeDatasetEntries(regionId, category, entries);
      totalEntries += entries.length;
      totalSizeKb += Math.round(JSON.stringify(entries).length / 1024 * 10) / 10;

      progress.entries_processed = totalEntries;
      progress.size_mb = Math.round(totalSizeKb / 1024 * 100) / 100;

      // Update region progress
      offlineExpeditionDbStore.updateRegion(regionId, {
        download_progress: Math.round(((completedBefore + i + 1) / DATASET_CATEGORIES.length) * 100),
      });

      // Small delay to prevent UI blocking
      await new Promise(resolve => setTimeout(resolve, 80));
    }

    // Mark complete
    const actualSizeMb = Math.round(totalSizeKb / 1024 * 100) / 100;
    offlineExpeditionDbStore.markDownloadComplete(regionId, actualSizeMb);

    // Phase 6D: Post-download integrity validation
    progress.status = 'validating';
    progress.message = 'Validating dataset integrity\u2026';
    offlineExpeditionDbStore.setActiveDownload({ ...progress });
    onProgress?.({ ...progress });

    const validationResult = offlineExpeditionDbStore.validateRegionIntegrity(regionId);

    if (validationResult.integrity_status === 'invalid' && !validationResult.is_usable) {
      // Phase 6D: Download produced corrupted data
      console.error(
        `${TAG} [6D] Download completed but integrity validation FAILED for "${region.region_name}": ` +
        validationResult.summary
      );

      // If this was an update, restore the backup
      if (isUpdate) {
        console.log(`${TAG} [6D] Restoring previous valid dataset for "${region.region_name}"`);
        const restored = _restoreRegionBackup(regionId);
        if (restored) {
          offlineExpeditionDbStore.updateRegion(regionId, {
            download_status: 'downloaded',
            dataset_version: region.previous_dataset_version || region.dataset_version,
            error_message: 'Update failed integrity validation \u2014 previous data restored',
            integrity_status: 'valid',
          });
          console.log(`${TAG} [6D] Previous dataset restored successfully for "${region.region_name}"`);
        } else {
          offlineExpeditionDbStore.markDownloadError(regionId, 'Integrity validation failed after update');
        }
      } else {
        offlineExpeditionDbStore.markDownloadError(regionId, `Integrity check failed: ${validationResult.summary}`);
      }

      progress.status = 'error';
      progress.message = `Integrity validation failed: ${validationResult.summary}`;
      onProgress?.({ ...progress });
      return false;
    }

    // Phase 6D: Clear backup after successful update
    if (isUpdate) {
      _clearRegionBackup(regionId);
    }

    progress.status = 'complete';
    progress.percent = 100;
    progress.categories_completed = DATASET_CATEGORIES.length;
    progress.entries_total = totalEntries;
    progress.entries_processed = totalEntries;
    progress.message = `Downloaded ${totalEntries} entries (${actualSizeMb} MB) \u2014 validated`;
    progress.size_mb = actualSizeMb;
    onProgress?.({ ...progress });

    // Phase 6B: Invalidate cache readiness so CI picks up the change
    try {
      invalidateCacheReadiness('offline_region_download_complete', {
        regionId,
        entryCount: totalEntries,
        sizeMb: actualSizeMb,
      });
    } catch {}

    // Phase 6C: Invalidate navigation bridge cache
    try {
      const { offlineNavigationBridge } = require('./offlineNavigationBridge');
      offlineNavigationBridge.invalidateCache('offline_region_download_complete', {
        regionId,
        entryCount: totalEntries,
        sizeMb: actualSizeMb,
      });
    } catch {}

    console.log(
      `${TAG} [6D] Download complete: "${region.region_name}" \u2014 ` +
      `${totalEntries} entries, ${actualSizeMb} MB, integrity: ${validationResult.integrity_status}`
    );

    return true;
  } catch (e) {
    const errorMsg = e instanceof Error ? e.message : 'Unknown error';

    // Phase 6D: If this was an update that failed, restore the backup
    if (isUpdate && !isResume) {
      console.log(`${TAG} [6D] Update failed for "${region.region_name}" \u2014 attempting backup restore`);
      const restored = _restoreRegionBackup(regionId);
      if (restored) {
        offlineExpeditionDbStore.updateRegion(regionId, {
          download_status: 'downloaded',
          dataset_version: region.previous_dataset_version || region.dataset_version,
          error_message: `Update failed: ${errorMsg} \u2014 previous data restored`,
          download_progress: 100,
          integrity_status: 'valid',
        });
        offlineExpeditionDbStore.setActiveDownload(null);
        console.log(`${TAG} [6D] Previous dataset restored after update failure for "${region.region_name}"`);

        progress.status = 'error';
        progress.message = `Update failed: ${errorMsg} \u2014 previous data preserved`;
        onProgress?.({ ...progress });
        return false;
      }
    }

    offlineExpeditionDbStore.markDownloadError(regionId, errorMsg);

    progress.status = 'error';
    progress.message = `Download failed: ${errorMsg}`;
    onProgress?.({ ...progress });

    console.error(`${TAG} [6D] Download failed for region ${regionId}:`, e);
    return false;
  }
}


// ── Phase 6B: Queue Processor ────────────────────────────

/**
 * Process the download queue sequentially.
 * Called periodically by the queue timer.
 */
async function _processQueue(): Promise<void> {
  if (_isProcessingQueue) return;
  if (offlineExpeditionDbStore.isDownloading()) return;

  const nextItem = offlineExpeditionDbStore.peekQueue();
  if (!nextItem) return;

  _isProcessingQueue = true;

  try {
    const item = offlineExpeditionDbStore.popQueue()!;
    const region = offlineExpeditionDbStore.getRegion(item.region_id);
    if (!region) {
      console.warn(`${TAG} Queue item region not found: ${item.region_id}`);
      return;
    }

    // Determine if this is a resume
    const isResume = region.download_status === 'error' &&
      (region.completed_categories || []).length > 0;

    console.log(
      `${TAG} Processing queue: "${region.region_name}" ` +
      `(update: ${item.is_update}, resume: ${isResume})`
    );

    if (item.is_update) {
      offlineExpeditionDbStore.updateRegion(item.region_id, {
        download_status: 'updating',
      });
    }

    await _downloadRegion(
      item.region_id,
      _activeProgressCallback ?? undefined,
      isResume,
    );
  } catch (e) {
    console.error(`${TAG} Queue processing error:`, e);
  } finally {
    _isProcessingQueue = false;
  }
}


// ── Phase 6B/6D: Update Detection ────────────────────────

/**
 * Check all downloaded regions for available updates.
 * Phase 6D: Also detects stale datasets.
 */
function _checkForUpdates(): void {
  const downloaded = offlineExpeditionDbStore.getDownloadedRegions();
  for (const region of downloaded) {
    // Phase 6B: Simulate update detection
    if (region.last_updated) {
      const age = Date.now() - new Date(region.last_updated).getTime();
      const sevenDays = 7 * 24 * 60 * 60 * 1000;
      if (age > sevenDays && region.dataset_version < region.data_version_available) {
        offlineExpeditionDbStore.markUpdateAvailable(
          region.region_id,
          region.data_version_available,
        );
      }
    }
  }

  // Phase 6D: Detect stale regions
  offlineExpeditionDbStore._detectStaleRegions();
}


// ── Integration: Discovery ───────────────────────────────

function _queryForDiscovery(
  userLat?: number,
  userLng?: number,
  radiusMiles?: number,
): OfflineDatasetQueryResult {
  const query: OfflineDatasetQuery = {
    category: 'trails',
    sort_by: 'distance',
    sort_direction: 'asc',
  };

  if (userLat != null && userLng != null) {
    query.near = {
      latitude: userLat,
      longitude: userLng,
      radius_miles: radiusMiles ?? 200,
    };
  }

  return offlineExpeditionDbStore.query(query);
}


// ── Integration: Navigation ──────────────────────────────

function _queryForNavigation(
  lat: number,
  lng: number,
  radiusMiles: number = 25,
): OfflineDatasetQueryResult {
  return offlineExpeditionDbStore.query({
    categories: ['trails', 'hazard_zones', 'fuel_stations', 'water_sources', 'recovery_points'],
    near: { latitude: lat, longitude: lng, radius_miles: radiusMiles },
    sort_by: 'distance',
    sort_direction: 'asc',
    limit: 50,
  });
}


// ── Signal Subscriptions ─────────────────────────────────

function _subscribeToSignals(): void {
  try {
    const { gpsUIState } = require('./gpsUIState');
    if (gpsUIState.subscribe) {
      _subscriptions.push(gpsUIState.subscribe(() => _debouncedReadinessEval()));
    }
  } catch {}

  try {
    const { routeStore } = require('./routeStore');
    if (routeStore.subscribe) {
      _subscriptions.push(routeStore.subscribe(() => _debouncedReadinessEval()));
    }
  } catch {}

  console.log(`${TAG} Signal subscriptions: ${_subscriptions.length}`);
}

function _unsubscribeFromSignals(): void {
  for (const unsub of _subscriptions) { try { unsub(); } catch {} }
  _subscriptions = [];
}

function _debouncedReadinessEval(): void {
  if (_readinessDebounceTimer) clearTimeout(_readinessDebounceTimer);
  _readinessDebounceTimer = setTimeout(() => {
    _readinessDebounceTimer = null;
    offlineExpeditionDbStore.evaluateReadiness();
  }, READINESS_DEBOUNCE_MS);
}


// ══════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════

export const offlineExpeditionDbEngine = {

  initialize(): void {
    if (_initialized) return;
    const startTime = Date.now();
    console.log(`${TAG} Initializing (Phase 6D)...`);

    offlineExpeditionDbStore.initialize();

    // Register available regions
    const available = _getAvailableRegions();
    const existing = offlineExpeditionDbStore.getRegions();
    const existingIds = new Set(existing.map(r => r.region_id));

    for (const region of available) {
      if (!existingIds.has(region.region_id)) {
        offlineExpeditionDbStore.addRegion(region);
      } else {
        // Phase 6B: Update metadata for existing regions (preserves download state)
        offlineExpeditionDbStore.addRegion(region);
      }
    }

    _subscribeToSignals();

    // Phase 6B: Start queue processor
    _queueProcessTimer = setInterval(() => {
      _processQueue().catch(e => console.warn(`${TAG} Queue process error:`, e));
    }, QUEUE_PROCESS_INTERVAL_MS);

    // Phase 6D: Deferred update check (don't block startup)
    setTimeout(() => {
      _checkForUpdates();
    }, 5000);

    _initialized = true;

    const elapsed = Date.now() - startTime;
    console.log(
      `${TAG} Initialized in ${elapsed}ms: ${available.length} available regions, ` +
      `${offlineExpeditionDbStore.getDownloadedCount()} downloaded, ` +
      `${offlineExpeditionDbStore.getDownloadQueue().length} queued, ` +
      `${offlineExpeditionDbStore.getUpdatesAvailableCount()} updates available`
    );
  },

  shutdown(): void {
    _unsubscribeFromSignals();
    if (_readinessDebounceTimer) {
      clearTimeout(_readinessDebounceTimer);
      _readinessDebounceTimer = null;
    }
    if (_queueProcessTimer) {
      clearInterval(_queueProcessTimer);
      _queueProcessTimer = null;
    }
    offlineExpeditionDbStore.persist();
    _initialized = false;
    _isProcessingQueue = false;
    _activeProgressCallback = null;
    _updateBackups.clear();
    console.log(`${TAG} Shut down`);
  },

  isInitialized(): boolean {
    return _initialized;
  },


  // ── Region Management ─────────────────────────────────

  getAvailableRegions(): OfflineExpeditionRegion[] {
    return offlineExpeditionDbStore.getRegions();
  },

  getDownloadedRegions(): OfflineExpeditionRegion[] {
    return offlineExpeditionDbStore.getDownloadedRegions();
  },

  /**
   * Phase 6D: Get regions that are usable (valid or stale integrity).
   */
  getUsableRegions(): OfflineExpeditionRegion[] {
    return offlineExpeditionDbStore.getUsableRegions();
  },

  getRegion(regionId: string): OfflineExpeditionRegion | null {
    return offlineExpeditionDbStore.getRegion(regionId);
  },


  // ── Download Management ───────────────────────────────

  /**
   * Phase 6B/6D: Download expedition data for a region.
   * If another download is active, queues this one.
   * Returns true if download started or was queued.
   */
  async downloadRegion(
    regionId: string,
    onProgress?: OfflineDownloadProgressCallback,
  ): Promise<boolean> {
    // Phase 6B: Duplicate prevention
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return false;

    if (region.download_status === 'downloading' || region.download_status === 'updating') {
      console.log(`${TAG} Region ${regionId} is already downloading`);
      return false;
    }

    if (offlineExpeditionDbStore.isDownloading()) {
      // Queue it
      const queued = offlineExpeditionDbStore.enqueueDownload(regionId, false);
      if (queued && onProgress) {
        _activeProgressCallback = onProgress;
      }
      return queued;
    }

    if (onProgress) {
      _activeProgressCallback = onProgress;
    }

    return _downloadRegion(regionId, onProgress);
  },

  /**
   * Phase 6B/6D: Remove a downloaded region and free storage.
   * Resets the region to not_downloaded state.
   * Phase 6D: Ensures removing one region does not affect others.
   */
  removeRegion(regionId: string): void {
    offlineExpeditionDbStore.removeRegion(regionId);
    try { invalidateCacheReadiness('offline_region_removed', { regionId }); } catch {}
    try {
      const { offlineNavigationBridge } = require('./offlineNavigationBridge');
      offlineNavigationBridge.invalidateCache('offline_region_removed', { regionId });
    } catch {}
  },

  /**
   * Phase 6B/6D: Update (re-download) a previously downloaded region.
   * Phase 6D: Existing data remains usable during the update.
   * If the update fails, the older valid dataset stays active.
   */
  async updateRegion(
    regionId: string,
    onProgress?: OfflineDownloadProgressCallback,
  ): Promise<boolean> {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return false;

    if (offlineExpeditionDbStore.isDownloading()) {
      return offlineExpeditionDbStore.enqueueDownload(regionId, true);
    }

    // Phase 6D: Clear completed categories for fresh download
    // but preserve the existing data (backup handled in _downloadRegion)
    offlineExpeditionDbStore.updateRegion(regionId, {
      download_status: 'updating',
      completed_categories: [],
    });

    if (onProgress) {
      _activeProgressCallback = onProgress;
    }

    return _downloadRegion(regionId, onProgress);
  },

  /**
   * Phase 6B: Resume an interrupted download.
   */
  async resumeDownload(
    regionId: string,
    onProgress?: OfflineDownloadProgressCallback,
  ): Promise<boolean> {
    const region = offlineExpeditionDbStore.getRegion(regionId);
    if (!region) return false;

    if (region.download_status !== 'error') {
      console.log(`${TAG} Region ${regionId} is not in error state \u2014 cannot resume`);
      return false;
    }

    if (offlineExpeditionDbStore.isDownloading()) {
      return offlineExpeditionDbStore.enqueueDownload(regionId, false);
    }

    if (onProgress) {
      _activeProgressCallback = onProgress;
    }

    return _downloadRegion(regionId, onProgress, true);
  },

  /**
   * Phase 6B: Set the global progress callback for queue-processed downloads.
   */
  setProgressCallback(cb: OfflineDownloadProgressCallback | null): void {
    _activeProgressCallback = cb;
  },

  /**
   * Phase 6B: Get the active download progress.
   */
  getActiveDownload(): OfflineDownloadProgress | null {
    return offlineExpeditionDbStore.getActiveDownload();
  },

  /**
   * Phase 6B: Whether a download is currently in progress.
   */
  isDownloading(): boolean {
    return offlineExpeditionDbStore.isDownloading();
  },

  /**
   * Phase 6B: Get the download queue.
   */
  getDownloadQueue(): OfflineDownloadQueueItem[] {
    return offlineExpeditionDbStore.getDownloadQueue();
  },


  // ── Phase 6D: Integrity Validation ────────────────────

  /**
   * Validate a specific region's dataset integrity.
   */
  validateRegion(regionId: string): DatasetValidationResult {
    return offlineExpeditionDbStore.validateRegionIntegrity(regionId);
  },

  /**
   * Validate all downloaded regions.
   */
  validateAllRegions(): DatasetValidationResult[] {
    const results: DatasetValidationResult[] = [];
    const downloaded = offlineExpeditionDbStore.getDownloadedRegions();
    for (const region of downloaded) {
      results.push(offlineExpeditionDbStore.validateRegionIntegrity(region.region_id));
    }
    return results;
  },


  // ── Querying ──────────────────────────────────────────

  query(params: OfflineDatasetQuery): OfflineDatasetQueryResult {
    return offlineExpeditionDbStore.query(params);
  },

  queryForDiscovery(
    userLat?: number,
    userLng?: number,
    radiusMiles?: number,
  ): OfflineDatasetQueryResult {
    const result = _queryForDiscovery(userLat, userLng, radiusMiles);
    console.log(
      `${TAG} [6C] Discovery query: ${result.entries.length} trails ` +
      `from ${result.source_regions.length} region(s) (offline: ${result.is_offline})`
    );
    return result;
  },

  queryForNavigation(
    lat: number,
    lng: number,
    radiusMiles?: number,
  ): OfflineDatasetQueryResult {
    const result = _queryForNavigation(lat, lng, radiusMiles);
    console.log(
      `${TAG} [6C] Navigation query: ${result.entries.length} entries ` +
      `from ${result.source_regions.length} region(s) (offline: ${result.is_offline})`
    );
    return result;
  },

  /**
   * Phase 6C: Query all dataset categories for a position.
   */
  queryAllCategories(
    lat: number,
    lng: number,
    radiusMiles: number = 30,
    limit: number = 100,
  ): OfflineDatasetQueryResult {
    const result = offlineExpeditionDbStore.query({
      categories: [...DATASET_CATEGORIES],
      near: { latitude: lat, longitude: lng, radius_miles: radiusMiles },
      sort_by: 'distance',
      sort_direction: 'asc',
      limit,
    });
    console.log(
      `${TAG} [6C] All-category query: ${result.entries.length} entries ` +
      `(radius: ${radiusMiles} mi, limit: ${limit})`
    );
    return result;
  },

  coversPosition(lat: number, lng: number): boolean {
    return offlineExpeditionDbStore.coversPosition(lat, lng);
  },

  /**
   * Phase 6C/6D: Check if offline expedition data is actively usable.
   * Phase 6D: Also checks integrity status.
   */
  isActivelyUsable(): boolean {
    try {
      if (!offlineExpeditionDbStore.isInitialized()) return false;
      if (offlineExpeditionDbStore.getDownloadedCount() === 0) return false;

      // Phase 6D: Check that at least one region has valid/stale integrity
      const usable = offlineExpeditionDbStore.getUsableRegions();
      if (usable.length === 0) return false;

      // Verify data is queryable by running a minimal query
      const result = offlineExpeditionDbStore.query({
        limit: 1,
      });
      return result.entries.length > 0;
    } catch {
      return false;
    }
  },

  /**
   * Phase 6C: Get regions that cover a specific position.
   */
  getRegionsForPosition(lat: number, lng: number): OfflineExpeditionRegion[] {
    return offlineExpeditionDbStore.getRegionsForPosition(lat, lng);
  },


  // ── Readiness ─────────────────────────────────────────

  evaluateReadiness(): OfflineExpeditionReadiness {
    return offlineExpeditionDbStore.evaluateReadiness();
  },

  /**
   * Phase 6B/6D: Get storage summary for all regions.
   */
  getStorageSummary(): OfflineStorageSummary {
    return offlineExpeditionDbStore.getStorageSummary();
  },

  getStorageStats(): {
    total_regions: number;
    downloaded_regions: number;
    total_entries: number;
    storage_mb: number;
    updates_available: number;
    queue_length: number;
    integrity_issues: number;
    stale_regions: number;
  } {
    return {
      total_regions: offlineExpeditionDbStore.getRegions().length,
      downloaded_regions: offlineExpeditionDbStore.getDownloadedCount(),
      total_entries: offlineExpeditionDbStore.getTotalEntries(),
      storage_mb: offlineExpeditionDbStore.getTotalStorageMb(),
      updates_available: offlineExpeditionDbStore.getUpdatesAvailableCount(),
      queue_length: offlineExpeditionDbStore.getDownloadQueue().length,
      // Phase 6D
      integrity_issues: offlineExpeditionDbStore.getIntegrityIssueCount(),
      stale_regions: offlineExpeditionDbStore.getStaleRegionCount(),
    };
  },

  /**
   * Phase 6B/6D: Check for dataset updates and stale data.
   */
  checkForUpdates(): void {
    _checkForUpdates();
  },


  // ── Reset ─────────────────────────────────────────────

  reset(): void {
    offlineExpeditionDbEngine.shutdown();
    offlineExpeditionDbStore.clearAll();
    _initialized = false;
    _updateBackups.clear();
    console.log(`${TAG} Reset complete`);
  },
};

