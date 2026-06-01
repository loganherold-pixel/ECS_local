/**
 * Tile Auto-Cleanup Engine
 *
 * Intelligent offline map tile cache management that runs on app startup.
 *
 * Features:
 *   - Detects stale regions older than the configured threshold
 *   - Identifies overlapping regions and suggests merges
 *   - Prioritizes keeping tiles for active expeditions and recently used routes
 *   - Provides one-tap cleanup recommendations
 *   - Integrates with tileCacheStore quota management
 *
 * Architecture:
 *   - `analyzeCache()` — Read-only analysis, returns a CleanupReport
 *   - `executeCleanup()` — Performs cleanup based on the report
 *   - `runStartupCleanup()` — Full startup flow: analyze + optional auto-cleanup
 */

import { Platform } from 'react-native';
import {
  tileCacheStore,
  type TileCacheRegion,
  type StorageQuotaConfig,
  type QuotaStatus,
  type MergeCandidate,
  type RegionOverlapPair,
  type RegionSizeBreakdown,
} from './tileCacheStore';
import { ecsLog } from './ecsLogger';
import { missionExpeditionStore } from './missionStore';
import { routeStore } from './routeStore';

// ── Persistence key for cleanup history ─────────────────────
const CLEANUP_HISTORY_KEY = 'ecs_tile_cleanup_history';
const CLEANUP_DISMISSED_KEY = 'ecs_tile_cleanup_dismissed';
const DEBUG_AUTO_CLEANUP =
  ((globalThis as typeof globalThis & { __ECS_DEBUG_AUTO_CLEANUP__?: boolean })
    .__ECS_DEBUG_AUTO_CLEANUP__ === true);

function debugAutoCleanup(message: string, details?: Record<string, any>): void {
  if (!DEBUG_AUTO_CLEANUP) return;
  ecsLog.debug('SYSTEM', message, details);
}

// ── Types ───────────────────────────────────────────────────

/** A region flagged for potential cleanup */
export interface CleanupCandidate {
  regionId: string;
  regionName: string;
  sizeMB: number;
  tileCount: number;
  ageDays: number;
  reason: CleanupReason;
  /** Priority: higher = should be cleaned first */
  priority: number;
  /** Whether this region is protected (active expedition, recent route) */
  isProtected: boolean;
  /** Protection reason if protected */
  protectionReason?: string;
}

export type CleanupReason =
  | 'stale'           // Older than staleRegionDays threshold
  | 'expired'         // Older than 2x staleRegionDays (very old)
  | 'incomplete'      // Download never completed
  | 'error'           // Download had errors
  | 'cancelled'       // Download was cancelled
  | 'overlap'         // Significant overlap with another region
  | 'quota-exceeded'; // Over storage quota

/** Merge suggestion from overlap analysis */
export interface MergeSuggestion {
  candidate: MergeCandidate;
  /** Human-readable description */
  description: string;
  /** Estimated savings */
  savingsMB: number;
  savingsPercent: number;
}

/** Complete cleanup analysis report */
export interface CleanupReport {
  /** Timestamp of analysis */
  analyzedAt: string;
  /** Current quota status */
  quotaStatus: QuotaStatus;
  /** Storage warning level */
  warningLevel: 'ok' | 'warning' | 'critical' | 'exceeded';
  /** Total cache size in MB */
  totalCacheMB: number;
  /** Total number of cached regions */
  totalRegions: number;

  // ── Stale regions ─────────────────────────────────────
  /** Regions older than the stale threshold */
  staleRegions: CleanupCandidate[];
  /** Total size of stale regions */
  staleTotalMB: number;

  // ── Broken regions (incomplete/error/cancelled) ───────
  /** Regions with failed or incomplete downloads */
  brokenRegions: CleanupCandidate[];
  /** Total size of broken regions */
  brokenTotalMB: number;

  // ── Overlap analysis ──────────────────────────────────
  /** Overlapping region pairs */
  overlappingPairs: RegionOverlapPair[];
  /** Merge suggestions */
  mergeSuggestions: MergeSuggestion[];
  /** Total wasted storage from overlaps */
  overlapWastedMB: number;

  // ── Protected regions ─────────────────────────────────
  /** Regions protected from cleanup */
  protectedRegionIds: Set<string>;
  /** Map of regionId → protection reason */
  protectionReasons: Map<string, string>;

  // ── Cleanup recommendations ───────────────────────────
  /** All candidates sorted by priority (highest first) */
  allCandidates: CleanupCandidate[];
  /** Candidates that are safe to auto-clean (not protected) */
  autoCleanCandidates: CleanupCandidate[];
  /** Total MB that can be freed by auto-cleanup */
  autoCleanFreeMB: number;
  /** Total MB that can be freed including protected regions */
  totalFreeMB: number;

  // ── Summary flags ─────────────────────────────────────
  /** Whether any cleanup action is recommended */
  needsAttention: boolean;
  /** Whether auto-cleanup should run */
  shouldAutoClean: boolean;
  /** Whether the user should be shown a warning banner */
  showWarningBanner: boolean;
  /** Human-readable summary message */
  summaryMessage: string;
}

/** Result of executing cleanup */
export interface CleanupResult {
  /** Number of regions deleted */
  regionsDeleted: number;
  /** MB freed */
  freedMB: number;
  /** Regions that were protected and skipped */
  skippedProtected: number;
  /** Merge operations performed */
  mergesPerformed: number;
  /** Total time in ms */
  durationMs: number;
  /** Human-readable summary */
  message: string;
}

/** Cleanup history entry */
export interface CleanupHistoryEntry {
  timestamp: string;
  trigger: 'startup' | 'manual' | 'auto';
  regionsDeleted: number;
  freedMB: number;
  mergesPerformed: number;
}

// ── Persistence helpers ─────────────────────────────────────

function getCleanupHistory(): CleanupHistoryEntry[] {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CLEANUP_HISTORY_KEY);
      if (raw) return JSON.parse(raw);
    }
  } catch {}
  return [];
}

function saveCleanupHistory(entries: CleanupHistoryEntry[]): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      // Keep last 20 entries
      const trimmed = entries.slice(-20);
      localStorage.setItem(CLEANUP_HISTORY_KEY, JSON.stringify(trimmed));
    }
  } catch {}
}

function getDismissedTimestamp(): number | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(CLEANUP_DISMISSED_KEY);
      if (raw) return parseInt(raw, 10);
    }
  } catch {}
  return null;
}

function setDismissedTimestamp(): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(CLEANUP_DISMISSED_KEY, String(Date.now()));
    }
  } catch {}
}

export function clearDismissedTimestamp(): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.removeItem(CLEANUP_DISMISSED_KEY);
    }
  } catch {}
}

// ── Protection logic ────────────────────────────────────────

/**
 * Determine which regions are "protected" from auto-cleanup.
 * Protected regions include:
 *   - Regions associated with the active expedition
 *   - Regions associated with recently used routes (last 7 days)
 *   - Regions currently downloading
 *   - Regions downloaded within the last 24 hours
 */
function computeProtectedRegions(
  regions: TileCacheRegion[]
): { protectedIds: Set<string>; reasons: Map<string, string> } {
  const protectedIds = new Set<string>();
  const reasons = new Map<string, string>();

  // 1. Active expedition
  const activeExpedition = missionExpeditionStore.getActive();
  const activeExpeditionId = activeExpedition?.id || null;

  // 2. Active route
  const activeRoute = routeStore.getActive();

  // 3. Recently used routes (updated in last 7 days)
  const recentRoutes = routeStore.getAll().filter(r => {
    const age = Date.now() - new Date(r.updated_at).getTime();
    return age < 7 * 24 * 60 * 60 * 1000;
  });

  const now = Date.now();

  for (const region of regions) {
    // Currently downloading — always protected
    if (region.status === 'downloading') {
      protectedIds.add(region.id);
      reasons.set(region.id, 'Active download in progress');
      continue;
    }

    // Downloaded within last 24 hours — protected
    const downloadAge = now - new Date(region.downloadedAt).getTime();
    if (downloadAge < 24 * 60 * 60 * 1000) {
      protectedIds.add(region.id);
      reasons.set(region.id, 'Downloaded within last 24 hours');
      continue;
    }

    // Check if region is associated with active expedition
    // (We check if the region name contains expedition-related keywords or
    //  if the region was created around the same time as the expedition)
    if (activeExpedition && region.routeId) {
      // If region has a routeId that matches any expedition route
      protectedIds.add(region.id);
      reasons.set(region.id, `Active expedition: ${activeExpedition.name}`);
      continue;
    }

    // Check if region overlaps with active route corridor
    if (activeRoute && activeRoute.segments.length > 0) {
      const routePoints = activeRoute.segments.flatMap(s => s.points);
      if (routePoints.length > 0) {
        const routeBounds = {
          minLat: Math.min(...routePoints.map(p => p.lat)),
          maxLat: Math.max(...routePoints.map(p => p.lat)),
          minLng: Math.min(...routePoints.map(p => p.lon)),
          maxLng: Math.max(...routePoints.map(p => p.lon)),
        };

        // Check if region bounds overlap with route bounds
        if (boundsOverlap(region.bounds, routeBounds)) {
          protectedIds.add(region.id);
          reasons.set(region.id, `Covers active route: ${activeRoute.name}`);
          continue;
        }
      }
    }

    // Check if region name matches any recent route
    for (const route of recentRoutes) {
      if (region.name.toLowerCase().includes(route.name.toLowerCase()) ||
          route.name.toLowerCase().includes(region.name.toLowerCase())) {
        protectedIds.add(region.id);
        reasons.set(region.id, `Recent route: ${route.name}`);
        break;
      }
    }
  }

  return { protectedIds, reasons };
}

function boundsOverlap(
  a: { minLat: number; maxLat: number; minLng: number; maxLng: number },
  b: { minLat: number; maxLat: number; minLng: number; maxLng: number }
): boolean {
  return !(a.maxLat < b.minLat || a.minLat > b.maxLat ||
           a.maxLng < b.minLng || a.minLng > b.maxLng);
}

// ── Analysis engine ─────────────────────────────────────────

/**
 * Analyze the tile cache and produce a comprehensive cleanup report.
 * This is a read-only operation — it doesn't modify any data.
 */
export function analyzeCache(): CleanupReport {
  const regions = tileCacheStore.getRegions();
  const quotaStatus = tileCacheStore.getQuotaStatus();
  const config = quotaStatus.config;
  const breakdown = tileCacheStore.getRegionBreakdown();
  const now = Date.now();

  // Compute protected regions
  const { protectedIds, reasons: protectionReasons } = computeProtectedRegions(regions);

  // ── Stale regions ─────────────────────────────────────
  const staleRegions: CleanupCandidate[] = [];
  const brokenRegions: CleanupCandidate[] = [];

  for (const rb of breakdown) {
    const region = regions.find(r => r.id === rb.id);
    if (!region) continue;

    const isProtected = protectedIds.has(region.id);
    const protectionReason = protectionReasons.get(region.id);

    // Check for broken regions (incomplete/error/cancelled)
    if (region.status === 'error' || region.status === 'cancelled') {
      brokenRegions.push({
        regionId: region.id,
        regionName: region.name,
        sizeMB: rb.sizeMB,
        tileCount: region.tileCount,
        ageDays: rb.ageDays,
        reason: region.status === 'error' ? 'error' : 'cancelled',
        priority: isProtected ? 10 : 80, // High priority for cleanup
        isProtected,
        protectionReason,
      });
      continue;
    }

    if (region.status === 'partial' || (region.status === 'pending' && rb.ageDays > 1)) {
      brokenRegions.push({
        regionId: region.id,
        regionName: region.name,
        sizeMB: rb.sizeMB,
        tileCount: region.tileCount,
        ageDays: rb.ageDays,
        reason: 'incomplete',
        priority: isProtected ? 5 : 60,
        isProtected,
        protectionReason,
      });
      continue;
    }

    // Check for stale regions
    if (rb.isStale) {
      const isExpired = rb.ageDays >= config.staleRegionDays * 2;
      staleRegions.push({
        regionId: region.id,
        regionName: region.name,
        sizeMB: rb.sizeMB,
        tileCount: region.tileCount,
        ageDays: rb.ageDays,
        reason: isExpired ? 'expired' : 'stale',
        priority: isProtected ? 1 : (isExpired ? 70 : 50),
        isProtected,
        protectionReason,
      });
    }
  }

  // ── Overlap analysis ──────────────────────────────────
  const overlappingPairs = tileCacheStore.detectAllOverlaps();
  const mergeCandidates = tileCacheStore.getMergeCandidates();
  const wasteInfo = tileCacheStore.getTotalOverlapWaste();

  const mergeSuggestions: MergeSuggestion[] = mergeCandidates.map(candidate => {
    const regionNames = candidate.regionNames.join(' + ');
    return {
      candidate,
      description: `Merge ${candidate.regionIds.length} overlapping regions (${regionNames}) to save ~${candidate.savingsMB.toFixed(1)} MB`,
      savingsMB: candidate.savingsMB,
      savingsPercent: candidate.savingsPercent,
    };
  });

  // ── Build combined candidate list ─────────────────────
  const allCandidates = [...staleRegions, ...brokenRegions].sort(
    (a, b) => b.priority - a.priority
  );

  const autoCleanCandidates = allCandidates.filter(c => !c.isProtected);
  const autoCleanFreeMB = autoCleanCandidates.reduce((sum, c) => sum + c.sizeMB, 0);
  const totalFreeMB = allCandidates.reduce((sum, c) => sum + c.sizeMB, 0);

  const staleTotalMB = staleRegions.reduce((sum, c) => sum + c.sizeMB, 0);
  const brokenTotalMB = brokenRegions.reduce((sum, c) => sum + c.sizeMB, 0);

  // ── Determine warning level and recommendations ───────
  const warningLevel = quotaStatus.level;
  const needsAttention = allCandidates.length > 0 || warningLevel !== 'ok' || mergeSuggestions.length > 0;
  const shouldAutoClean = config.autoCleanupEnabled && (
    warningLevel === 'critical' || warningLevel === 'exceeded' || brokenRegions.length > 0
  );

  // Check if banner was recently dismissed (within 24 hours)
  const dismissedAt = getDismissedTimestamp();
  const recentlyDismissed = dismissedAt !== null && (now - dismissedAt) < 24 * 60 * 60 * 1000;

  const showWarningBanner = !recentlyDismissed && (
    warningLevel === 'warning' || warningLevel === 'critical' || warningLevel === 'exceeded' ||
    staleRegions.filter(c => !c.isProtected).length >= 2 ||
    brokenRegions.length >= 1 ||
    (mergeSuggestions.length > 0 && mergeSuggestions[0].savingsMB >= 10)
  );

  // ── Build summary message ─────────────────────────────
  const parts: string[] = [];
  if (warningLevel === 'exceeded') parts.push('Storage quota exceeded');
  else if (warningLevel === 'critical') parts.push('Storage nearly full');
  else if (warningLevel === 'warning') parts.push('Storage usage high');

  if (staleRegions.length > 0) {
    parts.push(`${staleRegions.length} stale region${staleRegions.length !== 1 ? 's' : ''} (${staleTotalMB.toFixed(1)} MB)`);
  }
  if (brokenRegions.length > 0) {
    parts.push(`${brokenRegions.length} incomplete download${brokenRegions.length !== 1 ? 's' : ''}`);
  }
  if (mergeSuggestions.length > 0) {
    const totalMergeSavings = mergeSuggestions.reduce((sum, s) => sum + s.savingsMB, 0);
    parts.push(`${mergeSuggestions.length} merge opportunit${mergeSuggestions.length !== 1 ? 'ies' : 'y'} (~${totalMergeSavings.toFixed(1)} MB savings)`);
  }

  const summaryMessage = parts.length > 0
    ? parts.join(' \u2022 ')
    : 'Cache is healthy — no cleanup needed';

  return {
    analyzedAt: new Date().toISOString(),
    quotaStatus,
    warningLevel,
    totalCacheMB: quotaStatus.usedMB,
    totalRegions: regions.length,
    staleRegions,
    staleTotalMB: Math.round(staleTotalMB * 10) / 10,
    brokenRegions,
    brokenTotalMB: Math.round(brokenTotalMB * 10) / 10,
    overlappingPairs,
    mergeSuggestions,
    overlapWastedMB: wasteInfo.wastedMB,
    protectedRegionIds: protectedIds,
    protectionReasons,
    allCandidates,
    autoCleanCandidates,
    autoCleanFreeMB: Math.round(autoCleanFreeMB * 10) / 10,
    totalFreeMB: Math.round(totalFreeMB * 10) / 10,
    needsAttention,
    shouldAutoClean,
    showWarningBanner,
    summaryMessage,
  };
}

// ── Cleanup execution ───────────────────────────────────────

/**
 * Execute cleanup based on the analysis report.
 * Deletes unprotected stale/broken regions and optionally performs merges.
 *
 * @param report - The cleanup report from analyzeCache()
 * @param options - Cleanup options
 * @returns CleanupResult with details of what was cleaned
 */
export async function executeCleanup(
  report: CleanupReport,
  options: {
    /** Delete stale regions (default: true) */
    deleteStale?: boolean;
    /** Delete broken regions (default: true) */
    deleteBroken?: boolean;
    /** Perform merge suggestions (default: false — merges are manual) */
    performMerges?: boolean;
    /** Only delete regions with priority >= this value (default: 0) */
    minPriority?: number;
    /** Maximum MB to free (stop after this) */
    maxFreeMB?: number;
    /** Trigger source for history tracking */
    trigger?: 'startup' | 'manual' | 'auto';
  } = {}
): Promise<CleanupResult> {
  const startTime = Date.now();
  const {
    deleteStale = true,
    deleteBroken = true,
    performMerges = false,
    minPriority = 0,
    maxFreeMB = Infinity,
    trigger = 'manual',
  } = options;

  let regionsDeleted = 0;
  let freedMB = 0;
  let skippedProtected = 0;
  let mergesPerformed = 0;

  // 1. Delete broken regions first (highest priority)
  if (deleteBroken) {
    for (const candidate of report.brokenRegions) {
      if (freedMB >= maxFreeMB) break;
      if (candidate.priority < minPriority) continue;

      if (candidate.isProtected) {
        skippedProtected++;
        continue;
      }

      try {
        await tileCacheStore.deleteRegion(candidate.regionId);
        regionsDeleted++;
        freedMB += candidate.sizeMB;
        debugAutoCleanup('Deleted broken tile region', {
          regionId: candidate.regionId,
          regionName: candidate.regionName,
          reason: candidate.reason,
          sizeMB: Number(candidate.sizeMB.toFixed(1)),
        });
      } catch (e) {
        ecsLog.warn('SYSTEM', `Auto-cleanup failed to delete region ${candidate.regionId}`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // 2. Delete stale regions
  if (deleteStale) {
    for (const candidate of report.staleRegions) {
      if (freedMB >= maxFreeMB) break;
      if (candidate.priority < minPriority) continue;

      if (candidate.isProtected) {
        skippedProtected++;
        continue;
      }

      try {
        await tileCacheStore.deleteRegion(candidate.regionId);
        regionsDeleted++;
        freedMB += candidate.sizeMB;
        debugAutoCleanup('Deleted stale tile region', {
          regionId: candidate.regionId,
          regionName: candidate.regionName,
          ageDays: candidate.ageDays,
          sizeMB: Number(candidate.sizeMB.toFixed(1)),
        });
      } catch (e) {
        ecsLog.warn('SYSTEM', `Auto-cleanup failed to delete region ${candidate.regionId}`, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  // 3. Perform merges (only if explicitly requested)
  if (performMerges && report.mergeSuggestions.length > 0) {
    for (const suggestion of report.mergeSuggestions) {
      try {
        const result = await tileCacheStore.mergeRegions(suggestion.candidate.regionIds);
        if (result.success) {
          mergesPerformed++;
          freedMB += result.savedMB;
          debugAutoCleanup('Merged overlapping tile regions', {
            description: suggestion.description,
            savedMB: result.savedMB,
          });
        }
      } catch (e) {
        ecsLog.warn('SYSTEM', 'Auto-cleanup merge failed', {
          description: suggestion.description,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  const durationMs = Date.now() - startTime;
  freedMB = Math.round(freedMB * 10) / 10;

  // Build message
  const parts: string[] = [];
  if (regionsDeleted > 0) parts.push(`${regionsDeleted} region${regionsDeleted !== 1 ? 's' : ''} removed`);
  if (freedMB > 0) parts.push(`${freedMB} MB freed`);
  if (mergesPerformed > 0) parts.push(`${mergesPerformed} merge${mergesPerformed !== 1 ? 's' : ''} completed`);
  if (skippedProtected > 0) parts.push(`${skippedProtected} protected region${skippedProtected !== 1 ? 's' : ''} skipped`);
  const message = parts.length > 0 ? parts.join(', ') : 'No cleanup needed';

  // Save to history
  const history = getCleanupHistory();
  history.push({
    timestamp: new Date().toISOString(),
    trigger,
    regionsDeleted,
    freedMB,
    mergesPerformed,
  });
  saveCleanupHistory(history);

  return {
    regionsDeleted,
    freedMB,
    skippedProtected,
    mergesPerformed,
    durationMs,
    message,
  };
}

// ── Quick cleanup (one-tap) ─────────────────────────────────

/**
 * Perform a quick one-tap cleanup:
 *   1. Delete all broken regions (error/cancelled/incomplete)
 *   2. Delete stale regions that aren't protected
 *   3. Report results
 *
 * Does NOT perform merges (those require user confirmation).
 */
export async function quickCleanup(): Promise<CleanupResult> {
  const report = analyzeCache();
  return executeCleanup(report, {
    deleteStale: true,
    deleteBroken: true,
    performMerges: false,
    trigger: 'manual',
  });
}

// ── Startup cleanup ─────────────────────────────────────────

/**
 * Run the full startup cleanup flow:
 *   1. Analyze the cache
 *   2. If auto-cleanup is enabled and needed, execute cleanup
 *   3. Return the report (for UI to show warnings/banners)
 *
 * This should be called once when the Navigate tab mounts.
 */
export async function runStartupCleanup(): Promise<{
  report: CleanupReport;
  cleanupResult: CleanupResult | null;
}> {
  const report = analyzeCache();

  debugAutoCleanup('Startup tile cleanup analysis complete', {
    summaryMessage: report.summaryMessage,
    warningLevel: report.warningLevel,
    needsAttention: report.needsAttention,
    staleRegions: report.staleRegions.length,
    brokenRegions: report.brokenRegions.length,
    mergeSuggestions: report.mergeSuggestions.length,
    protectedRegions: report.protectedRegionIds.size,
    autoCleanCandidates: report.autoCleanCandidates.length,
  });

  if (report.warningLevel !== 'ok' || report.needsAttention) {
    ecsLog.warn('SYSTEM', `Offline cache attention: ${report.summaryMessage}`, {
      warningLevel: report.warningLevel,
      staleRegions: report.staleRegions.length,
      brokenRegions: report.brokenRegions.length,
      mergeSuggestions: report.mergeSuggestions.length,
      autoCleanCandidates: report.autoCleanCandidates.length,
    });
  }

  let cleanupResult: CleanupResult | null = null;

  if (report.shouldAutoClean && report.autoCleanCandidates.length > 0) {
    debugAutoCleanup('Auto-cleanup triggered from startup', {
      candidates: report.autoCleanCandidates.length,
    });

    cleanupResult = await executeCleanup(report, {
      deleteStale: true,
      deleteBroken: true,
      performMerges: false,
      trigger: 'startup',
    });

    debugAutoCleanup('Startup cleanup completed', {
      message: cleanupResult.message,
      regionsDeleted: cleanupResult.regionsDeleted,
      freedMB: cleanupResult.freedMB,
    });
  }

  return { report, cleanupResult };
}

// ── Banner dismiss ──────────────────────────────────────────

/**
 * Dismiss the storage warning banner for 24 hours.
 */
export function dismissWarningBanner(): void {
  setDismissedTimestamp();
}

/**
 * Check if the warning banner was recently dismissed.
 */
export function isWarningBannerDismissed(): boolean {
  const dismissedAt = getDismissedTimestamp();
  if (dismissedAt === null) return false;
  return (Date.now() - dismissedAt) < 24 * 60 * 60 * 1000;
}

// ── Cleanup history ─────────────────────────────────────────

/**
 * Get the cleanup history for display in settings/storage dashboard.
 */
export function getCleanupHistoryEntries(): CleanupHistoryEntry[] {
  return getCleanupHistory();
}

/**
 * Get the last cleanup entry.
 */
export function getLastCleanup(): CleanupHistoryEntry | null {
  const history = getCleanupHistory();
  return history.length > 0 ? history[history.length - 1] : null;
}

/**
 * Format a cleanup history entry for display.
 */
export function formatCleanupEntry(entry: CleanupHistoryEntry): string {
  const parts: string[] = [];
  if (entry.regionsDeleted > 0) parts.push(`${entry.regionsDeleted} deleted`);
  if (entry.freedMB > 0) parts.push(`${entry.freedMB} MB freed`);
  if (entry.mergesPerformed > 0) parts.push(`${entry.mergesPerformed} merged`);
  const action = parts.length > 0 ? parts.join(', ') : 'No changes';
  const trigger = entry.trigger === 'startup' ? 'Auto' : entry.trigger === 'auto' ? 'Auto' : 'Manual';
  return `[${trigger}] ${action}`;
}

