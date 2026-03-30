/**
 * Storage Cleanup Engine — Intelligent LRU-based Automatic Cleanup
 *
 * Features:
 *   - Device storage threshold monitoring (default 500MB free)
 *   - LRU (Least Recently Used) scoring algorithm for region prioritization
 *   - Access frequency tracking per region
 *   - Configurable auto-cleanup rules:
 *       • Max cache age (days)
 *       • Max total cache size (MB)
 *       • Min device free space threshold (MB)
 *       • Priority protection for active expedition routes
 *   - Smart cleanup: targets a specific amount of space to free
 *   - Persistent rule configuration and access tracking
 *
 * Architecture:
 *   - `getCleanupRules()` / `setCleanupRules()` — Manage auto-cleanup config
 *   - `trackAccess()` — Record region access events for LRU scoring
 *   - `computeLRUScores()` — Score all regions by recency + frequency
 *   - `smartCleanup()` — Free a target amount using LRU ordering
 *   - `checkDeviceThreshold()` — Monitor device free space
 *   - `runAutoCleanupCheck()` — Full auto-cleanup lifecycle
 */

import { Platform } from 'react-native';
import {
  tileCacheStore,
  type TileCacheRegion,
} from './tileCacheStore';
import { missionExpeditionStore } from './missionStore';
import { routeStore } from './routeStore';
import { getDeviceStorageInfo } from './nativeTileStorage';


// ── Persistence keys ────────────────────────────────────────
const RULES_KEY = 'ecs_storage_cleanup_rules';
const ACCESS_LOG_KEY = 'ecs_region_access_log';
const LAST_AUTO_CHECK_KEY = 'ecs_last_auto_cleanup_check';

// ── Types ───────────────────────────────────────────────────

/** Configurable auto-cleanup rules */
export interface CleanupRules {
  /** Enable automatic cleanup when thresholds are exceeded */
  autoCleanupEnabled: boolean;
  /** Minimum device free space in MB (default 500) */
  minFreeSpaceMB: number;
  /** Maximum total tile cache size in MB (default 2048) */
  maxCacheSizeMB: number;
  /** Maximum cache age in days — regions older than this are candidates (default 90) */
  maxCacheAgeDays: number;
  /** Protect regions associated with active expeditions (default true) */
  protectActiveExpeditions: boolean;
  /** Protect regions accessed within this many days (default 7) */
  recentAccessProtectionDays: number;
  /** Target amount to free when auto-cleanup triggers, as fraction of threshold (default 0.5) */
  cleanupTargetFraction: number;
  /** Minimum interval between auto-cleanup checks in minutes (default 30) */
  checkIntervalMinutes: number;
}

export const DEFAULT_CLEANUP_RULES: CleanupRules = {
  autoCleanupEnabled: true,
  minFreeSpaceMB: 500,
  maxCacheSizeMB: 2048,
  maxCacheAgeDays: 90,
  protectActiveExpeditions: true,
  recentAccessProtectionDays: 7,
  cleanupTargetFraction: 0.5,
  checkIntervalMinutes: 30,
};

/** Access log entry for a region */
export interface RegionAccessEntry {
  regionId: string;
  /** ISO timestamps of access events (most recent last) */
  accessTimes: string[];
  /** Total access count */
  totalAccesses: number;
  /** Last access ISO timestamp */
  lastAccessedAt: string;
}

/** LRU score for a region (higher = more likely to be cleaned) */
export interface LRUScore {
  regionId: string;
  regionName: string;
  sizeMB: number;
  tileCount: number;
  /** Days since last access */
  daysSinceAccess: number;
  /** Total access count */
  accessCount: number;
  /** Access frequency (accesses per day since creation) */
  accessFrequency: number;
  /** Composite LRU score (0-100, higher = better cleanup candidate) */
  score: number;
  /** Whether this region is protected from cleanup */
  isProtected: boolean;
  /** Protection reason if protected */
  protectionReason: string | null;
  /** Region status */
  status: TileCacheRegion['status'];
  /** Last accessed date string */
  lastAccessedAt: string;
  /** Region age in days */
  ageDays: number;
  /** Source type */
  sourceType: TileCacheRegion['sourceType'];
}

/** Result of a smart cleanup operation */
export interface SmartCleanupResult {
  /** Whether cleanup was performed */
  performed: boolean;
  /** Trigger reason */
  trigger: 'device-threshold' | 'cache-size' | 'manual' | 'age' | 'none';
  /** Regions deleted */
  regionsDeleted: number;
  /** MB freed */
  freedMB: number;
  /** Regions skipped (protected) */
  skippedProtected: number;
  /** Target MB that was requested to free */
  targetMB: number;
  /** Device free space before cleanup (if available) */
  deviceFreeMBBefore: number | null;
  /** Device free space after cleanup (if available) */
  deviceFreeMBAfter: number | null;
  /** Duration in ms */
  durationMs: number;
  /** Human-readable message */
  message: string;
  /** Deleted region details */
  deletedRegions: Array<{ id: string; name: string; sizeMB: number; score: number }>;
}

/** Device storage status */
export interface DeviceStorageStatus {
  totalMB: number;
  freeMB: number;
  usedMB: number;
  cacheMB: number;
  freePercent: number;
  cachePercent: number;
  belowThreshold: boolean;
  thresholdMB: number;
  shortfallMB: number;
  level: 'ok' | 'warning' | 'critical' | 'exceeded';
}

// ── Persistence helpers ─────────────────────────────────────

function loadRules(): CleanupRules {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(RULES_KEY);
      if (raw) return { ...DEFAULT_CLEANUP_RULES, ...JSON.parse(raw) };
    }
  } catch {}
  return { ...DEFAULT_CLEANUP_RULES };
}

function saveRules(rules: CleanupRules): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    }
  } catch {}
}

function loadAccessLog(): Record<string, RegionAccessEntry> {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(ACCESS_LOG_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return {};
}

function saveAccessLog(log: Record<string, RegionAccessEntry>): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(ACCESS_LOG_KEY, JSON.stringify(log));
    }
  } catch {}
}

function getLastAutoCheckTime(): number {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(LAST_AUTO_CHECK_KEY);
      if (raw) return parseInt(raw, 10);
    }
  } catch {}
  return 0;
}

function setLastAutoCheckTime(): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(LAST_AUTO_CHECK_KEY, String(Date.now()));
    }
  } catch {}
}

// ── Rules management ────────────────────────────────────────

export function getCleanupRules(): CleanupRules {
  return loadRules();
}

export function setCleanupRules(updates: Partial<CleanupRules>): CleanupRules {
  const current = loadRules();
  const merged = { ...current, ...updates };
  saveRules(merged);
  return merged;
}

export function resetCleanupRules(): CleanupRules {
  saveRules(DEFAULT_CLEANUP_RULES);
  return { ...DEFAULT_CLEANUP_RULES };
}

// ── Access tracking (debounced) ─────────────────────────────

/**
 * In-memory access log cache to avoid reading/writing localStorage on every
 * trackAccess() call. Flushed to localStorage after a debounce interval.
 */
let _accessLogCache: Record<string, RegionAccessEntry> | null = null;
let _accessLogDirty = false;
let _accessLogFlushTimer: ReturnType<typeof setTimeout> | null = null;
const ACCESS_LOG_FLUSH_INTERVAL_MS = 5000; // 5 seconds debounce

function getAccessLogCached(): Record<string, RegionAccessEntry> {
  if (_accessLogCache === null) {
    _accessLogCache = loadAccessLog();
  }
  return _accessLogCache;
}

function scheduleAccessLogFlush(): void {
  if (_accessLogFlushTimer) return; // already scheduled
  _accessLogFlushTimer = setTimeout(() => {
    _accessLogFlushTimer = null;
    if (_accessLogDirty && _accessLogCache) {
      saveAccessLog(_accessLogCache);
      _accessLogDirty = false;
    }
  }, ACCESS_LOG_FLUSH_INTERVAL_MS);
}

/** Force-flush the in-memory access log to localStorage immediately. */
export function flushAccessLog(): void {
  if (_accessLogFlushTimer) {
    clearTimeout(_accessLogFlushTimer);
    _accessLogFlushTimer = null;
  }
  if (_accessLogDirty && _accessLogCache) {
    saveAccessLog(_accessLogCache);
    _accessLogDirty = false;
  }
}

/**
 * Record an access event for a region.
 * Called when a region's tiles are served to the map renderer.
 *
 * Uses an in-memory cache with debounced persistence to avoid
 * localStorage thrashing on high-frequency tile-serving paths.
 */
export function trackAccess(regionId: string): void {
  const log = getAccessLogCached();
  const now = new Date().toISOString();

  if (!log[regionId]) {
    log[regionId] = {
      regionId,
      accessTimes: [now],
      totalAccesses: 1,
      lastAccessedAt: now,
    };
  } else {
    // Keep last 50 access timestamps
    log[regionId].accessTimes.push(now);
    if (log[regionId].accessTimes.length > 50) {
      log[regionId].accessTimes = log[regionId].accessTimes.slice(-50);
    }
    log[regionId].totalAccesses++;
    log[regionId].lastAccessedAt = now;
  }

  _accessLogDirty = true;
  scheduleAccessLogFlush();
}


/**
 * Get access log for a specific region.
 */
export function getRegionAccessLog(regionId: string): RegionAccessEntry | null {
  const log = loadAccessLog();
  return log[regionId] || null;
}

/**
 * Get all access logs.
 */
export function getAllAccessLogs(): Record<string, RegionAccessEntry> {
  return loadAccessLog();
}

/**
 * Clean up access log entries for regions that no longer exist.
 * Also invalidates the in-memory cache to stay in sync.
 */
export function pruneAccessLog(): number {
  // Flush any pending writes first so we prune the latest data
  flushAccessLog();

  const log = loadAccessLog();
  const regions = tileCacheStore.getRegions();
  const regionIds = new Set(regions.map(r => r.id));
  let pruned = 0;

  for (const id of Object.keys(log)) {
    if (!regionIds.has(id)) {
      delete log[id];
      pruned++;
    }
  }

  if (pruned > 0) {
    saveAccessLog(log);
    // Invalidate in-memory cache so next read picks up pruned data
    _accessLogCache = log;
    _accessLogDirty = false;
  }
  return pruned;
}


// ── Protection logic ────────────────────────────────────────

/**
 * Determine which regions are protected from cleanup.
 */
function computeProtectedRegions(
  regions: TileCacheRegion[],
  rules: CleanupRules,
  accessLog: Record<string, RegionAccessEntry>
): Map<string, string> {
  const protectedMap = new Map<string, string>();
  const now = Date.now();

  // Active expedition & route — wrapped in try/catch to prevent
  // cleanup engine from crashing if stores are in an unexpected state
  let activeExpedition: { name: string } | null = null;
  let activeRoute: { name: string } | null = null;
  try { activeExpedition = missionExpeditionStore.getActive(); } catch {}
  try { activeRoute = routeStore.getActive(); } catch {}

  for (const region of regions) {
    // Currently downloading — always protected
    if (region.status === 'downloading') {
      protectedMap.set(region.id, 'Active download in progress');
      continue;
    }

    // Downloaded within last 24 hours — protected
    const downloadAge = now - new Date(region.downloadedAt).getTime();
    if (downloadAge < 24 * 60 * 60 * 1000) {
      protectedMap.set(region.id, 'Downloaded within last 24 hours');
      continue;
    }

    // Active expedition protection
    if (rules.protectActiveExpeditions && activeExpedition && region.routeId) {
      protectedMap.set(region.id, `Active expedition: ${activeExpedition.name}`);
      continue;
    }

    // Active route protection
    if (activeRoute && region.routeId) {
      protectedMap.set(region.id, `Active route: ${activeRoute.name}`);
      continue;
    }

    // Recent access protection
    if (rules.recentAccessProtectionDays > 0) {
      const access = accessLog[region.id];
      if (access) {
        const lastAccess = new Date(access.lastAccessedAt).getTime();
        const daysSinceAccess = (now - lastAccess) / (1000 * 60 * 60 * 24);
        if (daysSinceAccess < rules.recentAccessProtectionDays) {
          protectedMap.set(region.id, `Accessed ${Math.floor(daysSinceAccess)}d ago (within ${rules.recentAccessProtectionDays}d protection window)`);
          continue;
        }
      }
    }
  }

  return protectedMap;
}

// ── LRU scoring ─────────────────────────────────────────────

/**
 * Compute LRU scores for all cached regions.
 * Higher score = better candidate for cleanup (least recently used, least frequently accessed).
 *
 * Score formula:
 *   - Recency: 0-50 points (older = higher)
 *   - Frequency: 0-30 points (less frequent = higher)
 *   - Size: 0-20 points (larger = higher, to free more space efficiently)
 */
export function computeLRUScores(): LRUScore[] {
  const regions = tileCacheStore.getRegions();
  const rules = loadRules();
  const accessLog = loadAccessLog();
  const protectedMap = computeProtectedRegions(regions, rules, accessLog);
  const now = Date.now();

  // Find max values for normalization
  let maxAge = 1;
  let maxSize = 1;
  let maxAccess = 1;

  for (const region of regions) {
    const lastAccess = accessLog[region.id]?.lastAccessedAt || region.completedAt || region.downloadedAt;
    const daysSince = (now - new Date(lastAccess).getTime()) / (1000 * 60 * 60 * 24);
    maxAge = Math.max(maxAge, daysSince);

    const sizeMB = region.actualSizeMB > 0 ? region.actualSizeMB : region.estimatedSizeMB;
    maxSize = Math.max(maxSize, sizeMB);

    const accessCount = accessLog[region.id]?.totalAccesses || 0;
    maxAccess = Math.max(maxAccess, accessCount);
  }

  const scores: LRUScore[] = regions.map(region => {
    const access = accessLog[region.id];
    const lastAccessDate = access?.lastAccessedAt || region.completedAt || region.downloadedAt;
    const daysSinceAccess = (now - new Date(lastAccessDate).getTime()) / (1000 * 60 * 60 * 24);
    const accessCount = access?.totalAccesses || 0;
    const sizeMB = region.actualSizeMB > 0 ? region.actualSizeMB : region.estimatedSizeMB;

    // Region age
    const ageDays = (now - new Date(region.downloadedAt).getTime()) / (1000 * 60 * 60 * 24);

    // Access frequency (accesses per day)
    const accessFrequency = ageDays > 0 ? accessCount / ageDays : 0;

    // Recency score: 0-50 (older = higher)
    const recencyScore = Math.min(50, (daysSinceAccess / maxAge) * 50);

    // Frequency score: 0-30 (less frequent = higher)
    const frequencyScore = maxAccess > 0
      ? Math.min(30, (1 - accessCount / maxAccess) * 30)
      : 15; // default mid-score if no access data

    // Size score: 0-20 (larger = higher, to maximize freed space)
    const sizeScore = Math.min(20, (sizeMB / maxSize) * 20);

    // Broken/error regions get max score
    let compositeScore = recencyScore + frequencyScore + sizeScore;
    if (region.status === 'error' || region.status === 'cancelled') {
      compositeScore = 95;
    } else if (region.status === 'partial') {
      compositeScore = Math.max(compositeScore, 80);
    }

    const isProtected = protectedMap.has(region.id);
    const protectionReason = protectedMap.get(region.id) || null;

    // Protected regions get score capped at 10
    if (isProtected) {
      compositeScore = Math.min(10, compositeScore);
    }

    return {
      regionId: region.id,
      regionName: region.name,
      sizeMB: Math.round(sizeMB * 10) / 10,
      tileCount: region.tileCount,
      daysSinceAccess: Math.round(daysSinceAccess * 10) / 10,
      accessCount,
      accessFrequency: Math.round(accessFrequency * 100) / 100,
      score: Math.round(compositeScore * 10) / 10,
      isProtected,
      protectionReason,
      status: region.status,
      lastAccessedAt: lastAccessDate,
      ageDays: Math.round(ageDays),
      sourceType: region.sourceType,
    };
  });

  // Sort by score descending (highest = best cleanup candidate)
  return scores.sort((a, b) => b.score - a.score);
}

// ── Device storage monitoring ───────────────────────────────

/**
 * Get current device storage status with threshold analysis.
 */
export async function getDeviceStorageStatus(): Promise<DeviceStorageStatus> {
  const rules = loadRules();
  const stats = tileCacheStore.getStats();
  const cacheMB = stats.totalSizeMB;

  let totalMB = 0;
  let freeMB = 0;

  // Try native device info first
  if (Platform.OS !== 'web') {
    const info = await getDeviceStorageInfo();
    if (info) {
      totalMB = info.totalMB;
      freeMB = info.freeMB;
    }
  } else {
    // Web: use Storage API
    try {
      if (typeof navigator !== 'undefined' && 'storage' in navigator && 'estimate' in (navigator as any).storage) {
        const estimate = await (navigator as any).storage.estimate();
        totalMB = Math.round((estimate.quota || 0) / (1024 * 1024));
        freeMB = Math.round(((estimate.quota || 0) - (estimate.usage || 0)) / (1024 * 1024));
      }
    } catch {}
  }

  const usedMB = totalMB - freeMB;
  const freePercent = totalMB > 0 ? (freeMB / totalMB) * 100 : 100;
  const cachePercent = totalMB > 0 ? (cacheMB / totalMB) * 100 : 0;
  const belowThreshold = freeMB < rules.minFreeSpaceMB && totalMB > 0;
  const shortfallMB = belowThreshold ? rules.minFreeSpaceMB - freeMB : 0;

  let level: DeviceStorageStatus['level'] = 'ok';
  if (belowThreshold) {
    if (freeMB < rules.minFreeSpaceMB * 0.5) level = 'critical';
    else level = 'warning';
  }
  if (cacheMB > rules.maxCacheSizeMB) {
    level = level === 'critical' ? 'critical' : 'exceeded';
  }

  return {
    totalMB,
    freeMB,
    usedMB,
    cacheMB,
    freePercent: Math.round(freePercent * 10) / 10,
    cachePercent: Math.round(cachePercent * 100) / 100,
    belowThreshold,
    thresholdMB: rules.minFreeSpaceMB,
    shortfallMB: Math.round(shortfallMB),
    level,
  };
}

// ── Smart cleanup ───────────────────────────────────────────

/**
 * Smart Cleanup — Free a target amount of space using LRU ordering.
 *
 * Algorithm:
 *   1. Compute LRU scores for all regions
 *   2. Filter out protected regions
 *   3. Delete regions in LRU order (highest score first) until target is met
 *   4. Stop when target is reached or no more candidates
 *
 * @param targetMB - Amount of space to free (in MB). If 0, uses auto-calculated target.
 * @param trigger - What triggered the cleanup
 */
export async function smartCleanup(
  targetMB: number = 0,
  trigger: SmartCleanupResult['trigger'] = 'manual'
): Promise<SmartCleanupResult> {
  const startTime = Date.now();
  const rules = loadRules();

  // Get device storage status for threshold-based target
  let deviceFreeMBBefore: number | null = null;
  if (targetMB === 0) {
    const deviceStatus = await getDeviceStorageStatus();
    deviceFreeMBBefore = deviceStatus.freeMB;

    if (deviceStatus.belowThreshold) {
      targetMB = deviceStatus.shortfallMB * (1 + rules.cleanupTargetFraction);
    }

    // Also check cache size limit
    const stats = tileCacheStore.getStats();
    if (stats.totalSizeMB > rules.maxCacheSizeMB) {
      const overageMB = stats.totalSizeMB - rules.maxCacheSizeMB;
      targetMB = Math.max(targetMB, overageMB * (1 + rules.cleanupTargetFraction));
    }

    if (targetMB === 0) {
      return {
        performed: false,
        trigger: 'none',
        regionsDeleted: 0,
        freedMB: 0,
        skippedProtected: 0,
        targetMB: 0,
        deviceFreeMBBefore,
        deviceFreeMBAfter: deviceFreeMBBefore,
        durationMs: Date.now() - startTime,
        message: 'No cleanup needed — storage within thresholds',
        deletedRegions: [],
      };
    }
  }

  // Compute LRU scores
  const scores = computeLRUScores();
  const candidates = scores.filter(s => !s.isProtected && s.score > 10);

  let freedMB = 0;
  let regionsDeleted = 0;
  let skippedProtected = 0;
  const deletedRegions: SmartCleanupResult['deletedRegions'] = [];

  for (const candidate of candidates) {
    if (freedMB >= targetMB) break;

    try {
      await tileCacheStore.deleteRegion(candidate.regionId);
      freedMB += candidate.sizeMB;
      regionsDeleted++;
      deletedRegions.push({
        id: candidate.regionId,
        name: candidate.regionName,
        sizeMB: candidate.sizeMB,
        score: candidate.score,
      });
      console.log(`[SmartCleanup] Deleted: ${candidate.regionName} (${candidate.sizeMB}MB, score=${candidate.score})`);
    } catch (e) {
      console.warn(`[SmartCleanup] Failed to delete ${candidate.regionId}:`, e);
    }
  }

  // Count protected that were skipped
  skippedProtected = scores.filter(s => s.isProtected).length;

  // Clean up access log
  pruneAccessLog();

  // Get device free space after
  let deviceFreeMBAfter: number | null = null;
  try {
    const afterStatus = await getDeviceStorageStatus();
    deviceFreeMBAfter = afterStatus.freeMB;
  } catch {}

  freedMB = Math.round(freedMB * 10) / 10;
  const durationMs = Date.now() - startTime;

  // Build message
  const parts: string[] = [];
  if (regionsDeleted > 0) parts.push(`${regionsDeleted} region${regionsDeleted !== 1 ? 's' : ''} removed`);
  if (freedMB > 0) parts.push(`${formatMB(freedMB)} freed`);
  if (skippedProtected > 0) parts.push(`${skippedProtected} protected`);
  const message = parts.length > 0 ? parts.join(', ') : 'No regions eligible for cleanup';

  return {
    performed: regionsDeleted > 0,
    trigger,
    regionsDeleted,
    freedMB,
    skippedProtected,
    targetMB: Math.round(targetMB * 10) / 10,
    deviceFreeMBBefore,
    deviceFreeMBAfter,
    durationMs,
    message,
    deletedRegions,
  };
}

// ── Auto-cleanup check ──────────────────────────────────────

/**
 * Run automatic cleanup check.
 * Should be called periodically (e.g., on Navigate tab mount).
 * Respects the check interval to avoid running too frequently.
 */
export async function runAutoCleanupCheck(): Promise<SmartCleanupResult | null> {
  const rules = loadRules();

  if (!rules.autoCleanupEnabled) return null;

  // Check interval
  const lastCheck = getLastAutoCheckTime();
  const elapsed = (Date.now() - lastCheck) / (1000 * 60);
  if (elapsed < rules.checkIntervalMinutes) return null;

  setLastAutoCheckTime();

  console.log('[StorageCleanup] Running auto-cleanup check...');

  // Check device storage
  const deviceStatus = await getDeviceStorageStatus();

  if (deviceStatus.belowThreshold) {
    console.log(`[StorageCleanup] Device storage below threshold: ${deviceStatus.freeMB}MB free (threshold: ${rules.minFreeSpaceMB}MB)`);
    return smartCleanup(0, 'device-threshold');
  }

  // Check cache size
  const stats = tileCacheStore.getStats();
  if (stats.totalSizeMB > rules.maxCacheSizeMB) {
    console.log(`[StorageCleanup] Cache size exceeded: ${stats.totalSizeMB}MB (limit: ${rules.maxCacheSizeMB}MB)`);
    return smartCleanup(0, 'cache-size');
  }

  // Check for very old regions
  const breakdown = tileCacheStore.getRegionBreakdown();
  const veryOld = breakdown.filter(r => r.ageDays > rules.maxCacheAgeDays && r.status !== 'downloading');
  if (veryOld.length > 0) {
    const totalOldMB = veryOld.reduce((sum, r) => sum + r.sizeMB, 0);
    if (totalOldMB > 50) { // Only auto-clean if old regions are significant
      console.log(`[StorageCleanup] Found ${veryOld.length} regions older than ${rules.maxCacheAgeDays} days (${formatMB(totalOldMB)})`);
      return smartCleanup(totalOldMB, 'age');
    }
  }

  console.log('[StorageCleanup] No cleanup needed');
  return null;
}

// ── Pie chart data ──────────────────────────────────────────

/** Data for pie chart visualization */
export interface PieSlice {
  id: string;
  label: string;
  value: number; // MB
  percent: number;
  color: string;
  isProtected: boolean;
  lastAccessed: string;
  accessCount: number;
  ageDays: number;
}

const PIE_COLORS = [
  '#C48A2C', '#3E6B3E', '#5AABB8', '#B43C3C', '#8C64B4',
  '#C87850', '#508CDC', '#50B4AA', '#B8A050', '#50AA96',
  '#CE93D8', '#FFB300', '#66BB6A', '#EF5350', '#42A5F5',
];

/**
 * Generate pie chart data for region size breakdown.
 */
export function getPieChartData(): PieSlice[] {
  const regions = tileCacheStore.getRegions();
  const accessLog = loadAccessLog();
  const rules = loadRules();
  const protectedMap = computeProtectedRegions(regions, rules, accessLog);
  const now = Date.now();

  const totalMB = regions.reduce((sum, r) => sum + (r.actualSizeMB > 0 ? r.actualSizeMB : r.estimatedSizeMB), 0);

  return regions
    .filter(r => r.status === 'complete' || r.status === 'partial')
    .map((region, idx) => {
      const sizeMB = region.actualSizeMB > 0 ? region.actualSizeMB : region.estimatedSizeMB;
      const access = accessLog[region.id];
      const lastAccessed = access?.lastAccessedAt || region.completedAt || region.downloadedAt;
      const ageDays = Math.floor((now - new Date(region.downloadedAt).getTime()) / (1000 * 60 * 60 * 24));

      return {
        id: region.id,
        label: region.name,
        value: Math.round(sizeMB * 10) / 10,
        percent: totalMB > 0 ? Math.round((sizeMB / totalMB) * 1000) / 10 : 0,
        color: PIE_COLORS[idx % PIE_COLORS.length],
        isProtected: protectedMap.has(region.id),
        lastAccessed,
        accessCount: access?.totalAccesses || 0,
        ageDays,
      };
    })
    .sort((a, b) => b.value - a.value);
}

// ── Helpers ─────────────────────────────────────────────────

function formatMB(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return `${Math.floor(diffDays / 30)}mo ago`;
}

export { formatMB as formatStorageSize };

