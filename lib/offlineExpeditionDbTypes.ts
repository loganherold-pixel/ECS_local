/**
 * ═══════════════════════════════════════════════════════════
 * ECS OFFLINE EXPEDITION DATABASE — Phase 6A/6B/6D Types
 * ═══════════════════════════════════════════════════════════
 *
 * Defines the normalized offline region model, expedition
 * dataset schema, download states, and dataset categories
 * for the ECS Offline Expedition Database system.
 *
 * This system operates independently from Mapbox base map
 * caching (tileCacheStore). It stores expedition-related
 * geographic datasets locally for offline access.
 *
 * Architecture:
 *   - Regions: Geographic areas that can be downloaded
 *   - Datasets: Categorized geographic data within regions
 *   - Entries: Individual data points (trails, campsites, etc.)
 *   - Download management: Progress tracking and state
 *
 * Dataset Categories:
 *   - trails:           Off-road trails and routes
 *   - campsites:        Camping areas and dispersed sites
 *   - fuel_stations:    Gas stations and fuel resupply
 *   - water_sources:    Water fill stations and natural sources
 *   - ranger_stations:  Ranger stations and visitor centers
 *   - recovery_points:  Recovery/tow services and staging areas
 *   - hazard_zones:     Known hazard areas (flood, rock fall, etc.)
 *
 * Integration Points:
 *   - Discovery system: Offline trail/opportunity browsing
 *   - Navigation system: Cached trail and route data
 *   - Connectivity Intelligence: offline_expedition_data_ready
 *   - Remoteness system: Offline expedition readiness signal
 *
 * Phase 6B additions:
 *   - Dataset version tracking (dataset_version, data_version_available)
 *   - update_available download status
 *   - Interrupted download recovery types
 *   - Download queue management types
 *   - Storage management types
 *   - Resume token for interrupted downloads
 *
 * Phase 6D additions:
 *   - Dataset integrity validation types
 *   - Stale dataset detection constants
 *   - DatasetIntegrityStatus on region model
 *   - DatasetValidationResult for post-download checks
 *   - Session version 3 with integrity fields
 *   - Safe update tracking (previous_dataset_version)
 *
 * Session version: 3 (Phase 6D)
 */


// ── Download States ──────────────────────────────────────

/**
 * Download lifecycle states for an offline expedition region.
 *
 * not_downloaded:   Region metadata exists but no data has been fetched
 * downloading:      Data download is in progress
 * downloaded:       All datasets have been successfully stored locally
 * updating:         A previously downloaded region is being refreshed
 * update_available: A newer dataset version exists for this region (Phase 6B)
 * error:            Download or update failed (partial data may exist)
 */
export type OfflineRegionDownloadStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'downloaded'
  | 'updating'
  | 'update_available'
  | 'error';

/**
 * Display configuration for download states.
 */
export const DOWNLOAD_STATUS_DISPLAY: Record<OfflineRegionDownloadStatus, {
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
  description: string;
}> = {
  not_downloaded: {
    label: 'Not Downloaded',
    shortLabel: 'AVAIL',
    color: '#78909C',
    icon: 'cloud-download-outline',
    description: 'Region available for download',
  },
  downloading: {
    label: 'Downloading',
    shortLabel: 'DL',
    color: '#2196F3',
    icon: 'download-outline',
    description: 'Downloading expedition data\u2026',
  },
  downloaded: {
    label: 'Downloaded',
    shortLabel: 'READY',
    color: '#4CAF50',
    icon: 'checkmark-circle-outline',
    description: 'Expedition data available offline',
  },
  updating: {
    label: 'Updating',
    shortLabel: 'UPD',
    color: '#FFB300',
    icon: 'sync-outline',
    description: 'Refreshing expedition data\u2026',
  },
  update_available: {
    label: 'Update Available',
    shortLabel: 'UPDATE',
    color: '#42A5F5',
    icon: 'arrow-up-circle-outline',
    description: 'A newer version of this data is available',
  },
  error: {
    label: 'Error',
    shortLabel: 'ERR',
    color: '#EF5350',
    icon: 'alert-circle-outline',
    description: 'Download failed \u2014 tap to retry',
  },
};


// ── Geographic Bounds ────────────────────────────────────

/**
 * Geographic bounding box for a region.
 * Uses WGS84 coordinates (latitude/longitude).
 */
export interface OfflineRegionBounds {
  /** Southern boundary latitude */
  min_lat: number;
  /** Northern boundary latitude */
  max_lat: number;
  /** Western boundary longitude */
  min_lng: number;
  /** Eastern boundary longitude */
  max_lng: number;
}


// ── Dataset Categories ───────────────────────────────────

/**
 * Categories of expedition datasets that can be stored offline.
 * Each category represents a type of geographic data useful
 * for expedition planning and navigation.
 */
export type DatasetCategory =
  | 'trails'
  | 'campsites'
  | 'fuel_stations'
  | 'water_sources'
  | 'ranger_stations'
  | 'recovery_points'
  | 'hazard_zones';

/**
 * All supported dataset categories.
 */
export const DATASET_CATEGORIES: DatasetCategory[] = [
  'trails',
  'campsites',
  'fuel_stations',
  'water_sources',
  'ranger_stations',
  'recovery_points',
  'hazard_zones',
];

/**
 * Display configuration for dataset categories.
 */
export const DATASET_CATEGORY_DISPLAY: Record<DatasetCategory, {
  label: string;
  pluralLabel: string;
  icon: string;
  color: string;
  description: string;
}> = {
  trails: {
    label: 'Trail',
    pluralLabel: 'Trails',
    icon: 'trail-sign-outline',
    color: '#C48A2C',
    description: 'Off-road trails and routes',
  },
  campsites: {
    label: 'Campsite',
    pluralLabel: 'Campsites',
    icon: 'bonfire-outline',
    color: '#66BB6A',
    description: 'Camping areas and dispersed sites',
  },
  fuel_stations: {
    label: 'Fuel Station',
    pluralLabel: 'Fuel Stations',
    icon: 'car-outline',
    color: '#EF5350',
    description: 'Gas stations and fuel resupply points',
  },
  water_sources: {
    label: 'Water Source',
    pluralLabel: 'Water Sources',
    icon: 'water-outline',
    color: '#42A5F5',
    description: 'Water fill stations and natural sources',
  },
  ranger_stations: {
    label: 'Ranger Station',
    pluralLabel: 'Ranger Stations',
    icon: 'shield-outline',
    color: '#8D6E63',
    description: 'Ranger stations and visitor centers',
  },
  recovery_points: {
    label: 'Recovery Point',
    pluralLabel: 'Recovery Points',
    icon: 'construct-outline',
    color: '#FF7043',
    description: 'Recovery/tow services and staging areas',
  },
  hazard_zones: {
    label: 'Hazard Zone',
    pluralLabel: 'Hazard Zones',
    icon: 'warning-outline',
    color: '#FFA726',
    description: 'Known hazard areas (flood, rock fall, etc.)',
  },
};


// ── Dataset Entry ────────────────────────────────────────

/**
 * A single geographic data point within a dataset.
 * All entries have coordinates and can carry category-specific metadata.
 */
export interface DatasetEntry {
  /** Unique identifier for this entry */
  id: string;
  /** Dataset category this entry belongs to */
  category: DatasetCategory;
  /** Display name */
  name: string;
  /** Latitude (WGS84) */
  latitude: number;
  /** Longitude (WGS84) */
  longitude: number;
  /** Optional description */
  description?: string;

  // ── Category-specific metadata ─────────────────────────

  /** Trail difficulty rating (1–5, trails only) */
  difficulty_rating?: number;
  /** Trail distance in miles (trails only) */
  trail_distance_mi?: number;
  /** Elevation gain in feet (trails only) */
  elevation_gain_ft?: number;
  /** Terrain type description (trails only) */
  terrain_type?: string;

  /** Service type (fuel_stations, water_sources, ranger_stations) */
  service_type?: string;
  /** Whether the service is seasonal */
  seasonal?: boolean;
  /** Operating hours description */
  hours?: string;
  /** Phone number */
  phone?: string;

  /** Hazard type (hazard_zones only) */
  hazard_type?: string;
  /** Hazard severity: low, moderate, high, extreme */
  hazard_severity?: 'low' | 'moderate' | 'high' | 'extreme';
  /** Hazard description (hazard_zones only) */
  hazard_description?: string;

  /** Campsite type: dispersed, established, primitive */
  campsite_type?: 'dispersed' | 'established' | 'primitive';
  /** Whether a permit is required */
  permit_required?: boolean;
  /** Whether water is available at this location */
  water_available?: boolean;
  /** Maximum number of vehicles/sites */
  max_capacity?: number;

  /** Recovery service type (recovery_points only) */
  recovery_type?: 'tow' | 'winch' | 'staging' | 'mechanic';

  /** Tags for search/filtering */
  tags?: string[];
  /** Source of this data (e.g., 'ecs_seed', 'user_contributed', 'osm') */
  source?: string;
  /** ISO timestamp when this entry was last updated */
  updated_at?: string;
}


// ── Dataset Collection ───────────────────────────────────

/**
 * A collection of dataset entries for a specific category
 * within a region.
 */
export interface DatasetCollection {
  /** Dataset category */
  category: DatasetCategory;
  /** Number of entries in this collection */
  entry_count: number;
  /** The actual entries */
  entries: DatasetEntry[];
  /** ISO timestamp when this collection was last updated */
  updated_at: string;
  /** Estimated storage size in KB */
  size_kb: number;
}


// ── Phase 6D: Dataset Integrity ──────────────────────────

/**
 * Integrity status for a downloaded region's datasets.
 *
 * unchecked:  Integrity has not been validated yet
 * valid:      All datasets passed integrity validation
 * invalid:    One or more datasets failed validation (corrupted/incomplete)
 * stale:      Datasets are valid but older than the stale threshold
 */
export type DatasetIntegrityStatus =
  | 'unchecked'
  | 'valid'
  | 'invalid'
  | 'stale';

/**
 * Display configuration for integrity statuses.
 */
export const INTEGRITY_STATUS_DISPLAY: Record<DatasetIntegrityStatus, {
  label: string;
  shortLabel: string;
  color: string;
  icon: string;
}> = {
  unchecked: {
    label: 'Not Validated',
    shortLabel: 'UNCKD',
    color: '#78909C',
    icon: 'help-circle-outline',
  },
  valid: {
    label: 'Validated',
    shortLabel: 'VALID',
    color: '#4CAF50',
    icon: 'shield-checkmark-outline',
  },
  invalid: {
    label: 'Invalid',
    shortLabel: 'INVLD',
    color: '#EF5350',
    icon: 'alert-circle-outline',
  },
  stale: {
    label: 'Stale',
    shortLabel: 'STALE',
    color: '#FFB300',
    icon: 'time-outline',
  },
};

/**
 * Result of a dataset integrity validation check.
 */
export interface DatasetValidationResult {
  /** Region that was validated */
  region_id: string;
  /** Overall integrity status */
  integrity_status: DatasetIntegrityStatus;
  /** Per-category validation results */
  category_results: Partial<Record<DatasetCategory, {
    valid: boolean;
    entry_count: number;
    expected_count: number;
    error?: string;
  }>>;
  /** Number of categories that passed validation */
  valid_categories: number;
  /** Total categories checked */
  total_categories: number;
  /** Whether the region is usable (even if partially invalid) */
  is_usable: boolean;
  /** Human-readable summary */
  summary: string;
  /** ISO timestamp of validation */
  validated_at: string;
}

/**
 * Phase 6D: Stale dataset detection threshold.
 * Regions with data older than this are marked as stale.
 */
export const STALE_DATASET_THRESHOLD_DAYS = 14;

/**
 * Phase 6D: Maximum age before a region is considered critically stale.
 * Critically stale regions still work but show stronger warnings.
 */
export const CRITICAL_STALE_THRESHOLD_DAYS = 30;


// ── Offline Region Model ─────────────────────────────────

/**
 * An offline expedition region that can be downloaded and
 * stored locally on the device.
 *
 * Each region contains multiple dataset collections covering
 * different categories of expedition data.
 */
export interface OfflineExpeditionRegion {
  /** Unique region identifier */
  region_id: string;
  /** Human-readable region name */
  region_name: string;
  /** Geographic bounds of this region */
  geographic_bounds: OfflineRegionBounds;
  /** Current download status */
  download_status: OfflineRegionDownloadStatus;
  /** ISO timestamp of last successful update */
  last_updated: string | null;
  /** ISO timestamp when the download was initiated */
  download_started_at: string | null;
  /** ISO timestamp when the download completed */
  download_completed_at: string | null;
  /** Download progress (0–100) during active download */
  download_progress: number;
  /** Error message if download_status is 'error' */
  error_message: string | null;

  /** Total number of dataset entries across all categories */
  total_entries: number;
  /** Breakdown of entry counts by category */
  category_counts: Partial<Record<DatasetCategory, number>>;
  /** Estimated total storage size in MB */
  estimated_size_mb: number;
  /** Actual storage size in MB (after download) */
  actual_size_mb: number;

  /** Dataset collections (populated when downloaded) */
  datasets: DatasetCollection[];

  /** Region description for UI display */
  description?: string;
  /** Region group ID (links to discoverEngine region groups) */
  region_group_id?: string;
  /** Center point for map display */
  center_lat?: number;
  center_lng?: number;
  /** Whether this region was auto-generated from an expedition route */
  auto_generated?: boolean;
  /** Source expedition ID if auto-generated */
  source_expedition_id?: string;

  // ── Phase 6B: Dataset Version Tracking ──

  /** Current dataset version (incremented on each data refresh) */
  dataset_version: number;
  /** Latest available dataset version from the server */
  data_version_available: number;

  // ── Phase 6B: Download Recovery ──

  /** Categories that were successfully downloaded before interruption */
  completed_categories?: DatasetCategory[];
  /** Resume token for interrupted downloads */
  resume_token?: string | null;
  /** Number of download retry attempts */
  retry_count?: number;

  // ── Phase 6D: Dataset Integrity ──

  /** Integrity status of the downloaded datasets */
  integrity_status?: DatasetIntegrityStatus;
  /** ISO timestamp of last integrity check */
  integrity_checked_at?: string | null;
  /** Previous dataset version (preserved during safe updates) */
  previous_dataset_version?: number;
}


// ── Download Progress ────────────────────────────────────

/**
 * Progress information for an active region download.
 */
export interface OfflineDownloadProgress {
  /** Region being downloaded */
  region_id: string;
  /** Current download status */
  status: 'idle' | 'fetching' | 'processing' | 'storing' | 'complete' | 'error' | 'resuming' | 'validating';
  /** Overall progress (0–100) */
  percent: number;
  /** Current category being processed */
  current_category: DatasetCategory | null;
  /** Number of categories completed */
  categories_completed: number;
  /** Total number of categories to process */
  categories_total: number;
  /** Number of entries processed so far */
  entries_processed: number;
  /** Total entries expected */
  entries_total: number;
  /** Human-readable status message */
  message: string;
  /** Estimated size of downloaded data in MB */
  size_mb: number;
}

/**
 * Callback for download progress updates.
 */
export type OfflineDownloadProgressCallback = (progress: OfflineDownloadProgress) => void;


// ── Phase 6B: Download Queue ─────────────────────────────

/**
 * A queued download request.
 */
export interface OfflineDownloadQueueItem {
  /** Region ID to download */
  region_id: string;
  /** Whether this is an update (re-download) */
  is_update: boolean;
  /** ISO timestamp when queued */
  queued_at: string;
  /** Priority (lower = higher priority) */
  priority: number;
}


// ── Phase 6B: Storage Management ─────────────────────────

/**
 * Storage statistics for a single region.
 */
export interface RegionStorageStats {
  region_id: string;
  region_name: string;
  download_status: OfflineRegionDownloadStatus;
  actual_size_mb: number;
  estimated_size_mb: number;
  total_entries: number;
  category_counts: Partial<Record<DatasetCategory, number>>;
  last_updated: string | null;
  dataset_version: number;
  data_version_available: number;
  has_update: boolean;
  /** Phase 6D: Integrity status */
  integrity_status: DatasetIntegrityStatus;
  /** Phase 6D: Whether the region data is stale */
  is_stale: boolean;
  /** Phase 6D: Days since last update */
  days_since_update: number | null;
}

/**
 * Overall storage summary.
 */
export interface OfflineStorageSummary {
  total_regions: number;
  downloaded_regions: number;
  total_entries: number;
  total_storage_mb: number;
  regions: RegionStorageStats[];
  evaluated_at: string;
  /** Phase 6D: Number of regions with integrity issues */
  integrity_issues: number;
  /** Phase 6D: Number of stale regions */
  stale_regions: number;
}


// ── Query Types ──────────────────────────────────────────

/**
 * Query parameters for searching the offline expedition database.
 */
export interface OfflineDatasetQuery {
  /** Filter by dataset category */
  category?: DatasetCategory;
  /** Filter by categories (multiple) */
  categories?: DatasetCategory[];
  /** Filter by geographic bounds */
  bounds?: OfflineRegionBounds;
  /** Filter by proximity to a point (lat, lng, radius in miles) */
  near?: {
    latitude: number;
    longitude: number;
    radius_miles: number;
  };
  /** Filter by text search (name, description, tags) */
  search_text?: string;
  /** Filter by minimum difficulty rating (trails only) */
  min_difficulty?: number;
  /** Filter by maximum difficulty rating (trails only) */
  max_difficulty?: number;
  /** Maximum number of results */
  limit?: number;
  /** Sort by: distance, name, difficulty, updated */
  sort_by?: 'distance' | 'name' | 'difficulty' | 'updated';
  /** Sort direction */
  sort_direction?: 'asc' | 'desc';
}

/**
 * Result of an offline dataset query.
 */
export interface OfflineDatasetQueryResult {
  /** Matching entries */
  entries: DatasetEntry[];
  /** Total number of matches (before limit) */
  total_count: number;
  /** Whether results came from offline data */
  is_offline: boolean;
  /** Regions that contributed to the results */
  source_regions: string[];
  /** ISO timestamp of query execution */
  queried_at: string;
}


// ── Store State ──────────────────────────────────────────

/**
 * Internal state of the Offline Expedition Database store.
 */
export interface OfflineExpeditionDbState {
  /** Whether the store has been initialized */
  initialized: boolean;
  /** All registered offline regions */
  regions: OfflineExpeditionRegion[];
  /** Currently active download (null if none) */
  active_download: OfflineDownloadProgress | null;
  /** Total storage used by all downloaded regions in MB */
  total_storage_mb: number;
  /** Number of downloaded regions */
  downloaded_region_count: number;
  /** Total entries across all downloaded regions */
  total_entries: number;
  /** ISO timestamp of last store update */
  updated_at: string;

  // ── Phase 6B additions ──

  /** Download queue for pending downloads */
  download_queue: OfflineDownloadQueueItem[];
  /** Whether a download is currently in progress */
  is_downloading: boolean;
  /** Number of regions with available updates */
  updates_available_count: number;

  // ── Phase 6D additions ──

  /** Number of regions with integrity issues */
  integrity_issue_count: number;
  /** Number of stale regions */
  stale_region_count: number;
}


// ── Session Persistence ──────────────────────────────────

/**
 * Persisted session data for the Offline Expedition Database.
 */
export interface OfflineExpeditionDbSession {
  /** Schema version */
  version: number;
  /** Persisted region metadata (datasets stored separately) */
  regions: Omit<OfflineExpeditionRegion, 'datasets'>[];
  /** ISO timestamp when session was persisted */
  persisted_at: string;
  /** Phase 6B: Pending download queue */
  download_queue?: OfflineDownloadQueueItem[];
}

/** Current session schema version (Phase 6D: v3) */
export const OFFLINE_EXPEDITION_DB_SESSION_VERSION = 3;


// ── Integration Types ────────────────────────────────────

/**
 * Summary of offline expedition data readiness.
 * Consumed by Connectivity Intelligence and Remoteness systems.
 */
export interface OfflineExpeditionReadiness {
  /** Whether any expedition data is cached locally */
  has_offline_data: boolean;
  /** Number of downloaded regions */
  downloaded_regions: number;
  /** Total cached entries */
  total_entries: number;
  /** Total storage used in MB */
  storage_mb: number;
  /** Whether a cached region covers the current GPS position */
  covers_current_position: boolean;
  /** Whether a cached region covers the active route */
  covers_active_route: boolean;
  /** Categories available in cached data */
  available_categories: DatasetCategory[];
  /** ISO timestamp of evaluation */
  evaluated_at: string;
  /** Phase 6D: Whether all downloaded regions have valid integrity */
  all_regions_valid: boolean;
  /** Phase 6D: Number of stale regions */
  stale_regions: number;
}

/**
 * Default readiness when no offline data exists.
 */
export const DEFAULT_OFFLINE_EXPEDITION_READINESS: OfflineExpeditionReadiness = {
  has_offline_data: false,
  downloaded_regions: 0,
  total_entries: 0,
  storage_mb: 0,
  covers_current_position: false,
  covers_active_route: false,
  available_categories: [],
  evaluated_at: '',
  all_regions_valid: false,
  stale_regions: 0,
};


// ── Default Factories ────────────────────────────────────

export function createDefaultOfflineExpeditionDbState(): OfflineExpeditionDbState {
  return {
    initialized: false,
    regions: [],
    active_download: null,
    total_storage_mb: 0,
    downloaded_region_count: 0,
    total_entries: 0,
    updated_at: new Date().toISOString(),
    // Phase 6B
    download_queue: [],
    is_downloading: false,
    updates_available_count: 0,
    // Phase 6D
    integrity_issue_count: 0,
    stale_region_count: 0,
  };
}

export function createDefaultOfflineDownloadProgress(regionId: string): OfflineDownloadProgress {
  return {
    region_id: regionId,
    status: 'idle',
    percent: 0,
    current_category: null,
    categories_completed: 0,
    categories_total: DATASET_CATEGORIES.length,
    entries_processed: 0,
    entries_total: 0,
    message: 'Preparing download\u2026',
    size_mb: 0,
  };
}

/**
 * Phase 6B: Create default region with version tracking fields.
 */
export function createDefaultRegionVersionFields(): Pick<
  OfflineExpeditionRegion,
  'dataset_version' | 'data_version_available' | 'completed_categories' | 'resume_token' | 'retry_count' | 'integrity_status' | 'integrity_checked_at' | 'previous_dataset_version'
> {
  return {
    dataset_version: 0,
    data_version_available: 1,
    completed_categories: [],
    resume_token: null,
    retry_count: 0,
    // Phase 6D
    integrity_status: 'unchecked',
    integrity_checked_at: null,
    previous_dataset_version: 0,
  };
}

