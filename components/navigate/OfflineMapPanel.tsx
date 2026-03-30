/**
 * OfflineMapPanel — Inline Offline Map Management for Navigate Tab
 *
 * Provides direct access to offline tile caching within the Navigate tab:
 *   - Compact storage dashboard (regions, tiles, size, completion %)
 *   - "Cache Current View" button using current map viewport bounds
 *   - Active download progress with cancel support
 *   - Cached regions list with resume/delete controls
 *   - Freshness checking: "Check for Updates" button
 *   - Per-region freshness indicators with last-verified timestamps
 *   - Offer to re-download stale regions with upstream changes
 *   - Region creation via bounding box (current viewport)
 *   - Zoom level selection
 *   - Map style selection for tile source
 *   - Connectivity awareness
 *   - Storage quota management with auto-cleanup
 *   - Settings panel for quota configuration
 *   - Link to full offline maps manager
 *
 * Integrates with:
 *   - tileCacheStore for region CRUD + download engine + quota + freshness
 *   - connectivity for online/offline detection
 *   - MapRenderer viewport bounds (via parent props)
 *   - StorageSettingsPanel for detailed storage management
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  tileCacheStore,
  countTilesForRegion,
  estimateSizeMB,
  type TileCacheRegion,
  type TileCacheStats,
  type TileBounds,
  type DownloadProgress,
  type QuotaStatus,
  type FreshnessCheckProgress,
  type FreshnessCheckResult,
} from '../../lib/tileCacheStore';
import { connectivity } from '../../lib/connectivity';
import StorageSettingsPanel from './StorageSettingsPanel';


// ── Types ───────────────────────────────────────────────

interface Props {
  /** Current map viewport bounds (from MapRenderer) */
  mapBounds?: TileBounds | null;
  /** Current map style key */
  mapStyle?: string;
  /** Current map zoom level */
  mapZoom?: number;
  /** Request map bounds from parent (triggers getMapBounds) */
  onRequestMapBounds?: () => void;
  /** Toast callback */
  showToast: (msg: string) => void;
}

// ── Zoom Presets ────────────────────────────────────────

const ZOOM_PRESETS = [
  { label: 'NAV', min: 8, max: 14, desc: 'Driving' },
  { label: 'DETAIL', min: 10, max: 16, desc: 'Trail' },
  { label: 'FULL', min: 5, max: 16, desc: 'All' },
];

// ── Helpers ─────────────────────────────────────────────

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

function formatAge(iso: string | null | undefined): string {
  if (!iso) return 'Unknown';
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHrs = Math.floor(diffMin / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(iso).toLocaleDateString();
}

function getFreshnessColor(iso: string | null | undefined): string {
  if (!iso) return TACTICAL.textMuted;
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 7) return '#66BB6A';
  if (diffDays < 30) return '#FFB300';
  return '#EF5350';
}

function formatETA(seconds: number): string {
  if (seconds <= 0) return '';
  if (seconds < 60) return `~${seconds}s`;
  if (seconds < 3600) return `~${Math.ceil(seconds / 60)}m`;
  return `~${(seconds / 3600).toFixed(1)}h`;
}

function getFreshnessStatusColor(status: string | undefined): string {
  switch (status) {
    case 'fresh': return '#66BB6A';
    case 'update-available': return '#FFB300';
    case 'checking': return '#64B5F6';
    case 'error': return '#EF5350';
    default: return TACTICAL.textMuted;
  }
}

// ── Component ───────────────────────────────────────────

export default function OfflineMapPanel({
  mapBounds,
  mapStyle = 'tactical',
  mapZoom = 10,
  onRequestMapBounds,
  showToast,
}: Props) {
  const router = useRouter();

  // ── State ─────────────────────────────────────────────
  const [expanded, setExpanded] = useState(false);
  const [regions, setRegions] = useState<TileCacheRegion[]>([]);
  const [stats, setStats] = useState<TileCacheStats>({
    totalRegions: 0, totalTiles: 0, downloadedTiles: 0,
    totalSizeMB: 0, lastDownloadAt: null,
    storageQuotaMB: null, storageUsedMB: null,
  });
  const [activeProgress, setActiveProgress] = useState<Map<string, DownloadProgress>>(new Map());
  const [isOnline, setIsOnline] = useState(true);
  const [cacheViewZoomMin, setCacheViewZoomMin] = useState(8);
  const [cacheViewZoomMax, setCacheViewZoomMax] = useState(14);
  const [isCaching, setIsCaching] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);

  // ── Freshness checking state ──────────────────────────
  const [isCheckingAll, setIsCheckingAll] = useState(false);
  const [checkProgress, setCheckProgress] = useState<FreshnessCheckProgress | null>(null);
  const [checkingRegionIds, setCheckingRegionIds] = useState<Set<string>>(new Set());
  const [refreshingRegionIds, setRefreshingRegionIds] = useState<Set<string>>(new Set());
  const [updateAvailableCount, setUpdateAvailableCount] = useState(0);

  // ── Connectivity monitoring ────────────────────────────
  useEffect(() => {
    setIsOnline(connectivity.isOnline());
    const unsub = connectivity.onStatusChange((status) => {
      setIsOnline(status === 'online');
    });
    connectivity.startMonitoring();
    return () => { unsub(); };
  }, []);

  // ── Load data + subscribe to changes ──────────────────
  const refreshData = useCallback(async () => {
    const r = tileCacheStore.getRegions();
    setRegions(r);
    setQuotaStatus(tileCacheStore.getQuotaStatus());
    setUpdateAvailableCount(tileCacheStore.getUpdateAvailableCount());
    try {
      const s = await tileCacheStore.getStatsWithStorage();
      setStats(s);
    } catch {
      setStats(tileCacheStore.getStats());
    }
  }, []);

  useEffect(() => {
    refreshData();
    const unsub = tileCacheStore.subscribe(refreshData);
    return unsub;
  }, [refreshData]);

  // ── Tile estimate for current view ────────────────────
  const viewTileEstimate = useMemo(() => {
    if (!mapBounds) return { count: 0, sizeMB: 0 };
    const count = countTilesForRegion(mapBounds, cacheViewZoomMin, cacheViewZoomMax);
    const sizeMB = estimateSizeMB(count, mapStyle);
    return { count, sizeMB };
  }, [mapBounds, cacheViewZoomMin, cacheViewZoomMax, mapStyle]);

  // ── Quota check for current estimate ──────────────────
  const quotaCheck = useMemo(() => {
    if (!viewTileEstimate.sizeMB || viewTileEstimate.sizeMB === 0) return null;
    return tileCacheStore.checkQuotaBeforeDownload(viewTileEstimate.sizeMB);
  }, [viewTileEstimate.sizeMB]);

  // ── Download management (quota-aware) ─────────────────
  const startDownload = useCallback(async (regionId: string) => {
    if (!isOnline) {
      showToast('CANNOT DOWNLOAD \u2014 NO NETWORK');
      return;
    }

    const onProgress = (progress: DownloadProgress) => {
      setActiveProgress(prev => {
        const next = new Map(prev);
        next.set(regionId, progress);
        return next;
      });
      if (progress.downloadedTiles % 10 === 0 || progress.status === 'complete' || progress.status === 'error') {
        refreshData();
      }
    };

    showToast('DOWNLOAD STARTED');

    // Use quota-aware download
    const result = await tileCacheStore.startDownloadWithQuota(regionId, onProgress);

    if (result.cleanupResult && result.cleanupResult.purged > 0) {
      showToast(`AUTO-CLEANUP: FREED ${formatSize(result.cleanupResult.freedMB)}`);
    }

    setTimeout(() => {
      setActiveProgress(prev => {
        const next = new Map(prev);
        next.delete(regionId);
        return next;
      });
      refreshData();
    }, 2000);

    showToast(result.success ? 'DOWNLOAD COMPLETE' : 'DOWNLOAD FAILED');
  }, [showToast, refreshData, isOnline]);

  // ── Cache Current View ────────────────────────────────
  const handleCacheCurrentView = useCallback(() => {
    if (!mapBounds) {
      onRequestMapBounds?.();
      showToast('GETTING MAP BOUNDS...');
      return;
    }

    if (viewTileEstimate.count === 0) {
      showToast('NO TILES IN CURRENT VIEW');
      return;
    }

    if (viewTileEstimate.count > 100000) {
      showToast('TOO MANY TILES \u2014 ZOOM IN OR REDUCE ZOOM RANGE');
      return;
    }

    if (!isOnline) {
      showToast('CANNOT DOWNLOAD \u2014 NO NETWORK');
      return;
    }

    // Check quota before creating region
    if (quotaCheck && !quotaCheck.canProceed) {
      showToast(`QUOTA EXCEEDED \u2014 ${quotaCheck.message}`);
      return;
    }

    setIsCaching(true);

    const region = tileCacheStore.createFromBounds(
      `Map View \u2014 Z${cacheViewZoomMin}-${cacheViewZoomMax}`,
      mapBounds,
      cacheViewZoomMin,
      cacheViewZoomMax,
      mapStyle
    );

    showToast(`REGION CREATED: ${region.tileCount.toLocaleString()} TILES`);
    refreshData();

    startDownload(region.id).finally(() => setIsCaching(false));
  }, [mapBounds, viewTileEstimate, cacheViewZoomMin, cacheViewZoomMax, mapStyle, isOnline, showToast, refreshData, startDownload, onRequestMapBounds, quotaCheck]);

  // ── Region actions ────────────────────────────────────
  const handleResume = useCallback((regionId: string) => {
    startDownload(regionId);
  }, [startDownload]);

  const handleCancel = useCallback((regionId: string) => {
    tileCacheStore.cancelDownload(regionId);
    showToast('DOWNLOAD CANCELLED');
    refreshData();
  }, [showToast, refreshData]);

  const handleDelete = useCallback((regionId: string) => {
    const doDelete = async () => {
      await tileCacheStore.deleteRegion(regionId);
      showToast('REGION DELETED');
      refreshData();
    };
    if (Platform.OS === 'web') {
      if (confirm('Delete this cached region?')) doDelete();
    } else {
      Alert.alert('Delete Region', 'Remove this cached region and all tiles?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [showToast, refreshData]);

  // ══════════════════════════════════════════════════════
  // FRESHNESS CHECKING
  // ══════════════════════════════════════════════════════

  /** Check freshness of a single region */
  const handleCheckRegionFreshness = useCallback(async (regionId: string) => {
    if (!isOnline) {
      showToast('CANNOT CHECK \u2014 NO NETWORK');
      return;
    }

    setCheckingRegionIds(prev => new Set(prev).add(regionId));

    try {
      const result = await tileCacheStore.checkRegionFreshness(regionId);
      refreshData();

      if (result.status === 'fresh') {
        showToast('TILES ARE UP TO DATE');
      } else if (result.status === 'update-available') {
        showToast(`UPDATE AVAILABLE \u2014 ~${result.changePercent}% CHANGED`);
      } else if (result.status === 'error') {
        showToast('FRESHNESS CHECK FAILED');
      }
    } catch {
      showToast('FRESHNESS CHECK ERROR');
    }

    setCheckingRegionIds(prev => {
      const next = new Set(prev);
      next.delete(regionId);
      return next;
    });
  }, [isOnline, showToast, refreshData]);

  /** Check freshness of all regions */
  const handleCheckAllFreshness = useCallback(async () => {
    if (!isOnline) {
      showToast('CANNOT CHECK \u2014 NO NETWORK');
      return;
    }

    const checkableRegions = regions.filter(r => r.status === 'complete' || r.status === 'partial');
    if (checkableRegions.length === 0) {
      showToast('NO REGIONS TO CHECK');
      return;
    }

    setIsCheckingAll(true);
    setCheckProgress({
      totalRegions: checkableRegions.length,
      checkedRegions: 0,
      currentRegionName: '',
      results: [],
      status: 'checking',
    });

    // Mark all checkable regions as checking
    const allIds = new Set(checkableRegions.map(r => r.id));
    setCheckingRegionIds(allIds);

    try {
      const results = await tileCacheStore.checkAllRegionsFreshness((progress) => {
        setCheckProgress(progress);
      });

      refreshData();

      const updatesFound = results.filter(r => r.status === 'update-available').length;
      const freshCount = results.filter(r => r.status === 'fresh').length;
      const errorCount = results.filter(r => r.status === 'error').length;

      if (updatesFound > 0) {
        showToast(`${updatesFound} REGION${updatesFound > 1 ? 'S' : ''} WITH UPDATES AVAILABLE`);
      } else if (errorCount === results.length) {
        showToast('ALL CHECKS FAILED \u2014 CHECK NETWORK');
      } else {
        showToast(`ALL ${freshCount} REGION${freshCount > 1 ? 'S' : ''} UP TO DATE`);
      }
    } catch {
      showToast('FRESHNESS CHECK FAILED');
    }

    setIsCheckingAll(false);
    setCheckingRegionIds(new Set());
    setCheckProgress(null);
  }, [isOnline, regions, showToast, refreshData]);

  /** Refresh (re-download) a region with upstream updates */
  const handleRefreshRegion = useCallback(async (regionId: string) => {
    if (!isOnline) {
      showToast('CANNOT UPDATE \u2014 NO NETWORK');
      return;
    }

    setRefreshingRegionIds(prev => new Set(prev).add(regionId));

    const onProgress = (progress: DownloadProgress) => {
      setActiveProgress(prev => {
        const next = new Map(prev);
        next.set(regionId, progress);
        return next;
      });
      if (progress.downloadedTiles % 10 === 0 || progress.status === 'complete' || progress.status === 'error') {
        refreshData();
      }
    };

    showToast('REFRESHING REGION...');

    try {
      const success = await tileCacheStore.refreshRegion(regionId, onProgress);

      setTimeout(() => {
        setActiveProgress(prev => {
          const next = new Map(prev);
          next.delete(regionId);
          return next;
        });
        refreshData();
      }, 2000);

      showToast(success ? 'REGION UPDATED SUCCESSFULLY' : 'REGION UPDATE FAILED');
    } catch {
      showToast('REGION UPDATE ERROR');
    }

    setRefreshingRegionIds(prev => {
      const next = new Set(prev);
      next.delete(regionId);
      return next;
    });
  }, [isOnline, showToast, refreshData]);

  /** Update all regions that have updates available */
  const handleUpdateAll = useCallback(async () => {
    const regionsWithUpdates = tileCacheStore.getRegionsWithUpdates();
    if (regionsWithUpdates.length === 0) {
      showToast('NO UPDATES AVAILABLE');
      return;
    }

    const doUpdate = async () => {
      for (const region of regionsWithUpdates) {
        await handleRefreshRegion(region.id);
      }
    };

    if (Platform.OS === 'web') {
      if (confirm(`Update ${regionsWithUpdates.length} region(s) with new map data?`)) {
        doUpdate();
      }
    } else {
      Alert.alert(
        'Update All Regions',
        `Re-download ${regionsWithUpdates.length} region(s) with upstream changes?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Update All', onPress: doUpdate },
        ]
      );
    }
  }, [showToast, handleRefreshRegion]);

  // ── Sorted regions ────────────────────────────────────
  const sortedRegions = useMemo(() => {
    return [...regions].sort((a, b) => {
      // Downloading first
      if (a.status === 'downloading' && b.status !== 'downloading') return -1;
      if (b.status === 'downloading' && a.status !== 'downloading') return 1;
      // Update-available next
      if (a.freshnessStatus === 'update-available' && b.freshnessStatus !== 'update-available') return -1;
      if (b.freshnessStatus === 'update-available' && a.freshnessStatus !== 'update-available') return 1;
      // Pending next
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return b.downloadedAt.localeCompare(a.downloadedAt);
    });
  }, [regions]);

  const completeCount = regions.filter(r => r.status === 'complete').length;
  const downloadingCount = regions.filter(r => r.status === 'downloading').length;
  const completionPercent = stats.totalTiles > 0
    ? Math.round((stats.downloadedTiles / stats.totalTiles) * 100) : 0;

  // ── Quota level helpers ───────────────────────────────
  const quotaLevelColor = quotaStatus
    ? quotaStatus.level === 'ok' ? '#66BB6A'
      : quotaStatus.level === 'warning' ? '#FFB300'
      : quotaStatus.level === 'critical' ? '#FF7043'
      : '#EF5350'
    : TACTICAL.textMuted;

  // ── Apply zoom preset ─────────────────────────────────
  const applyZoomPreset = useCallback((preset: typeof ZOOM_PRESETS[0]) => {
    setCacheViewZoomMin(preset.min);
    setCacheViewZoomMax(preset.max);
  }, []);

  return (
    <View style={styles.container}>
      {/* ═══════ HEADER ═══════ */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.8}
      >
        <View style={styles.headerLeft}>
          <Ionicons name="cloud-download-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>OFFLINE MAPS</Text>
          {downloadingCount > 0 && (
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>{downloadingCount}</Text>
            </View>
          )}
          {!isOnline && (
            <View style={styles.offlineBadge}>
              <Ionicons name="cloud-offline-outline" size={8} color="#EF5350" />
            </View>
          )}
          {/* Update available indicator */}
          {updateAvailableCount > 0 && (
            <View style={styles.updateBadge}>
              <Ionicons name="arrow-up-circle-outline" size={9} color="#FFB300" />
              <Text style={styles.updateBadgeText}>{updateAvailableCount}</Text>
            </View>
          )}
          {/* Quota level indicator */}
          {quotaStatus && quotaStatus.level !== 'ok' && (
            <View style={[styles.quotaLevelBadge, { backgroundColor: quotaLevelColor + '18' }]}>
              <View style={[styles.quotaLevelDot, { backgroundColor: quotaLevelColor }]} />
              <Text style={[styles.quotaLevelText, { color: quotaLevelColor }]}>
                {Math.round(quotaStatus.usedFraction * 100)}%
              </Text>
            </View>
          )}
        </View>
        <View style={styles.headerRight}>
          {stats.totalRegions > 0 && (
            <View style={styles.compactStats}>
              <Text style={styles.compactStatValue}>{stats.totalRegions}</Text>
              <Text style={styles.compactStatLabel}>RGN</Text>
              <View style={styles.compactStatDivider} />
              <Text style={styles.compactStatValue}>{formatSize(stats.totalSizeMB)}</Text>
              <View style={styles.compactStatDivider} />
              <Text style={[
                styles.compactStatValue,
                { color: completionPercent >= 100 ? '#66BB6A' : TACTICAL.text },
              ]}>
                {completionPercent}%
              </Text>
            </View>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={TACTICAL.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* ═══════ EXPANDED CONTENT ═══════ */}
      {expanded && !showSettings && (
        <View style={styles.expandedContent}>
          {/* ── Quota Bar (compact) ── */}
          {quotaStatus && (
            <View style={styles.quotaCompactRow}>
              <Ionicons name="speedometer-outline" size={10} color={quotaLevelColor} />
              <Text style={[styles.quotaCompactText, { color: quotaLevelColor }]}>
                {formatSize(quotaStatus.usedMB)} / {formatSize(quotaStatus.config.quotaLimitMB)}
              </Text>
              <View style={styles.quotaCompactBarBg}>
                <View style={[
                  styles.quotaCompactBarFill,
                  {
                    width: `${Math.min(100, quotaStatus.usedFraction * 100)}%`,
                    backgroundColor: quotaLevelColor,
                  },
                ]} />
              </View>
              {quotaStatus.staleRegionCount > 0 && (
                <Text style={styles.quotaStaleText}>
                  {quotaStatus.staleRegionCount} stale
                </Text>
              )}
              <TouchableOpacity
                onPress={() => setShowSettings(true)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.settingsBtn}
              >
                <Ionicons name="options-outline" size={12} color={TACTICAL.amber} />
              </TouchableOpacity>
            </View>
          )}

          {/* ═══════ CHECK FOR UPDATES SECTION ═══════ */}
          {completeCount > 0 && (
            <View style={styles.freshnessCheckSection}>
              <View style={styles.freshnessCheckHeader}>
                <View style={styles.freshnessCheckLeft}>
                  <Ionicons name="shield-checkmark-outline" size={12} color="#64B5F6" />
                  <Text style={styles.freshnessCheckTitle}>TILE FRESHNESS</Text>
                </View>
                {updateAvailableCount > 0 && (
                  <View style={styles.updateCountBadge}>
                    <Ionicons name="arrow-up-circle-outline" size={9} color="#FFB300" />
                    <Text style={styles.updateCountText}>
                      {updateAvailableCount} UPDATE{updateAvailableCount > 1 ? 'S' : ''}
                    </Text>
                  </View>
                )}
              </View>

              {/* Check progress bar */}
              {isCheckingAll && checkProgress && (
                <View style={styles.checkProgressSection}>
                  <View style={styles.checkProgressBarBg}>
                    <View style={[
                      styles.checkProgressBarFill,
                      {
                        width: `${checkProgress.totalRegions > 0
                          ? Math.round((checkProgress.checkedRegions / checkProgress.totalRegions) * 100)
                          : 0}%`,
                      },
                    ]} />
                  </View>
                  <Text style={styles.checkProgressText}>
                    Checking {checkProgress.currentRegionName || '...'}
                    {' \u2014 '}
                    {checkProgress.checkedRegions}/{checkProgress.totalRegions}
                  </Text>
                </View>
              )}

              {/* Action buttons row */}
              <View style={styles.freshnessActionsRow}>
                <TouchableOpacity
                  style={[
                    styles.checkAllBtn,
                    (isCheckingAll || !isOnline) && styles.checkAllBtnDisabled,
                  ]}
                  onPress={handleCheckAllFreshness}
                  disabled={isCheckingAll || !isOnline}
                  activeOpacity={0.8}
                >
                  {isCheckingAll ? (
                    <ActivityIndicator size={10} color="#64B5F6" />
                  ) : (
                    <Ionicons name="sync-outline" size={11} color="#64B5F6" />
                  )}
                  <Text style={styles.checkAllBtnText}>
                    {isCheckingAll ? 'CHECKING...' : 'CHECK FOR UPDATES'}
                  </Text>
                </TouchableOpacity>

                {updateAvailableCount > 0 && (
                  <TouchableOpacity
                    style={[
                      styles.updateAllBtn,
                      (!isOnline || isCheckingAll) && styles.checkAllBtnDisabled,
                    ]}
                    onPress={handleUpdateAll}
                    disabled={!isOnline || isCheckingAll}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="cloud-download-outline" size={11} color="#FFB300" />
                    <Text style={styles.updateAllBtnText}>UPDATE ALL</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* ── Cache Current View Section ── */}
          <View style={styles.cacheViewSection}>
            <View style={styles.cacheViewHeader}>
              <Ionicons name="scan-outline" size={12} color={TACTICAL.amber} />
              <Text style={styles.cacheViewTitle}>CACHE CURRENT VIEW</Text>
            </View>

            <View style={styles.zoomRow}>
              <Text style={styles.zoomLabel}>ZOOM</Text>
              <View style={styles.zoomPresets}>
                {ZOOM_PRESETS.map(preset => {
                  const isActive = cacheViewZoomMin === preset.min && cacheViewZoomMax === preset.max;
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      style={[styles.zoomChip, isActive && styles.zoomChipActive]}
                      onPress={() => applyZoomPreset(preset)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.zoomChipText, isActive && styles.zoomChipTextActive]}>
                        {preset.label}
                      </Text>
                      <Text style={styles.zoomChipRange}>Z{preset.min}-{preset.max}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {mapBounds && viewTileEstimate.count > 0 && (
              <View style={styles.estimateRow}>
                <View style={styles.estimateItem}>
                  <Ionicons name="grid-outline" size={10} color={TACTICAL.textMuted} />
                  <Text style={styles.estimateText}>
                    {viewTileEstimate.count >= 1000
                      ? `${(viewTileEstimate.count / 1000).toFixed(1)}K`
                      : viewTileEstimate.count} tiles
                  </Text>
                </View>
                <View style={styles.estimateItem}>
                  <Ionicons name="cloud-download-outline" size={10} color={TACTICAL.textMuted} />
                  <Text style={styles.estimateText}>
                    ~{formatSize(viewTileEstimate.sizeMB)}
                  </Text>
                </View>
                {viewTileEstimate.count > 50000 && (
                  <View style={styles.estimateItem}>
                    <Ionicons name="warning-outline" size={10} color="#FFB300" />
                    <Text style={[styles.estimateText, { color: '#FFB300' }]}>Large</Text>
                  </View>
                )}
                {/* Quota warning for this download */}
                {quotaCheck && !quotaCheck.canProceed && (
                  <View style={styles.estimateItem}>
                    <Ionicons name="alert-circle-outline" size={10} color="#EF5350" />
                    <Text style={[styles.estimateText, { color: '#EF5350' }]}>Over quota</Text>
                  </View>
                )}
              </View>
            )}

            {!mapBounds && (
              <Text style={styles.noBoundsText}>
                Pan/zoom the map to define the area to cache
              </Text>
            )}

            <TouchableOpacity
              style={[
                styles.cacheBtn,
                (!mapBounds || !isOnline || viewTileEstimate.count === 0 || viewTileEstimate.count > 100000 || isCaching) && styles.cacheBtnDisabled,
              ]}
              onPress={handleCacheCurrentView}
              activeOpacity={0.8}
              disabled={!mapBounds || !isOnline || viewTileEstimate.count === 0 || viewTileEstimate.count > 100000 || isCaching}
            >
              {isCaching ? (
                <ActivityIndicator size="small" color="#0B0F12" />
              ) : (
                <Ionicons name="download-outline" size={14} color="#0B0F12" />
              )}
              <Text style={styles.cacheBtnText}>
                {isCaching ? 'CACHING...' :
                  !mapBounds ? 'WAITING FOR MAP BOUNDS' :
                  !isOnline ? 'OFFLINE' :
                  viewTileEstimate.count > 100000 ? 'TOO MANY TILES' :
                  `CACHE ${viewTileEstimate.count > 0 ? viewTileEstimate.count.toLocaleString() + ' TILES' : 'VIEW'}`
                }
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Active Downloads ── */}
          {downloadingCount > 0 && (
            <View style={styles.activeDownloads}>
              <Text style={styles.sectionLabel}>ACTIVE DOWNLOADS</Text>
              {sortedRegions
                .filter(r => r.status === 'downloading')
                .map(region => {
                  const progress = activeProgress.get(region.id);
                  const dlPercent = progress
                    ? progress.percent
                    : region.tileCount > 0
                      ? Math.round((region.downloadedTiles / region.tileCount) * 100)
                      : 0;

                  return (
                    <View key={region.id} style={styles.downloadCard}>
                      <View style={styles.downloadHeader}>
                        <Text style={styles.downloadName} numberOfLines={1}>{region.name}</Text>
                        <TouchableOpacity
                          onPress={() => handleCancel(region.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons name="pause" size={12} color="#FFB300" />
                        </TouchableOpacity>
                      </View>
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${Math.min(dlPercent, 100)}%` }]} />
                      </View>
                      <View style={styles.downloadMeta}>
                        <Text style={styles.downloadPercent}>{dlPercent}%</Text>
                        {progress && progress.speed > 0 && (
                          <Text style={styles.downloadSpeed}>{progress.speed} t/s</Text>
                        )}
                        {progress && progress.eta > 0 && (
                          <Text style={styles.downloadETA}>{formatETA(progress.eta)}</Text>
                        )}
                        {progress && (
                          <Text style={styles.downloadSize}>
                            {formatSize(progress.downloadedSizeMB)} / ~{formatSize(progress.estimatedSizeMB)}
                          </Text>
                        )}
                      </View>
                    </View>
                  );
                })}
            </View>
          )}

          {/* ── Cached Regions ── */}
          {sortedRegions.length > 0 && (
            <View style={styles.regionsSection}>
              <View style={styles.regionsSectionHeader}>
                <Text style={styles.sectionLabel}>
                  CACHED REGIONS ({regions.length})
                </Text>
                {completeCount > 0 && (
                  <View style={styles.readyBadge}>
                    <Ionicons name="checkmark-circle" size={9} color="#66BB6A" />
                    <Text style={styles.readyText}>{completeCount} READY</Text>
                  </View>
                )}
              </View>

              {sortedRegions
                .filter(r => r.status !== 'downloading')
                .slice(0, 5)
                .map(region => {
                  const statusColor = region.status === 'complete' ? '#66BB6A' :
                    region.status === 'error' ? '#EF5350' :
                    region.status === 'partial' ? '#FFB300' :
                    TACTICAL.textMuted;
                  const actualSize = region.actualSizeMB > 0 ? region.actualSizeMB : region.estimatedSizeMB;
                  const completedDate = region.completedAt || (region.status === 'complete' ? region.downloadedAt : null);
                  const isRegionChecking = checkingRegionIds.has(region.id);
                  const isRegionRefreshing = refreshingRegionIds.has(region.id);
                  const hasUpdate = region.freshnessStatus === 'update-available';
                  const freshColor = getFreshnessStatusColor(region.freshnessStatus);

                  return (
                    <View key={region.id} style={[styles.regionCard, hasUpdate && styles.regionCardUpdate]}>
                      <View style={styles.regionRow}>
                        <View style={[styles.regionDot, { backgroundColor: statusColor }]} />
                        <Text style={styles.regionName} numberOfLines={1}>{region.name}</Text>
                        <Text style={styles.regionSize}>{formatSize(actualSize)}</Text>

                        {(region.status === 'pending' || region.status === 'cancelled' || region.status === 'error') && (
                          <TouchableOpacity
                            onPress={() => handleResume(region.id)}
                            style={styles.regionActionBtn}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          >
                            <Ionicons
                              name={region.status === 'error' ? 'refresh' : 'play'}
                              size={10}
                              color={region.status === 'error' ? '#EF5350' : TACTICAL.amber}
                            />
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          onPress={() => handleDelete(region.id)}
                          style={styles.regionActionBtn}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <Ionicons name="trash-outline" size={10} color={TACTICAL.textMuted} />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.regionMeta}>
                        <Text style={styles.regionMetaText}>
                          {region.downloadedTiles.toLocaleString()}/{region.tileCount.toLocaleString()} tiles
                        </Text>
                        <Text style={styles.regionMetaText}>
                          Z{region.zoomMin}\u2013{region.zoomMax}
                        </Text>
                        <Text style={styles.regionMetaText}>
                          {region.styleKey.toUpperCase()}
                        </Text>
                        {completedDate && (
                          <Text style={[styles.regionMetaText, { color: getFreshnessColor(completedDate) }]}>
                            {formatAge(completedDate)}
                          </Text>
                        )}
                      </View>

                      {/* Freshness indicator row */}
                      {(region.status === 'complete' || region.status === 'partial') && (
                        <View style={styles.regionFreshnessRow}>
                          {/* Status badge */}
                          <View style={[styles.regionFreshnessBadge, { backgroundColor: freshColor + '15' }]}>
                            {isRegionChecking ? (
                              <ActivityIndicator size={7} color="#64B5F6" />
                            ) : (
                              <View style={[styles.regionFreshnessDot, { backgroundColor: freshColor }]} />
                            )}
                            <Text style={[styles.regionFreshnessLabel, { color: freshColor }]}>
                              {isRegionChecking ? 'CHECKING' :
                                region.freshnessStatus === 'fresh' ? 'VERIFIED' :
                                region.freshnessStatus === 'update-available' ? 'UPDATE' :
                                region.freshnessStatus === 'error' ? 'CHECK FAILED' :
                                'UNVERIFIED'}
                            </Text>
                          </View>

                          {/* Last verified */}
                          {region.lastVerifiedAt && (
                            <Text style={styles.regionVerifiedText}>
                              {formatAge(region.lastVerifiedAt)}
                            </Text>
                          )}

                          {/* Inline check button */}
                          {!isRegionRefreshing && (
                            <TouchableOpacity
                              onPress={() => handleCheckRegionFreshness(region.id)}
                              disabled={isRegionChecking || !isOnline}
                              style={[styles.regionCheckBtn, (isRegionChecking || !isOnline) && { opacity: 0.4 }]}
                              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                            >
                              <Ionicons name="sync-outline" size={9} color="#64B5F6" />
                            </TouchableOpacity>
                          )}

                          {/* Inline update button */}
                          {hasUpdate && !isRegionChecking && (
                            <TouchableOpacity
                              onPress={() => handleRefreshRegion(region.id)}
                              disabled={isRegionRefreshing || !isOnline}
                              style={[styles.regionUpdateBtn, (isRegionRefreshing || !isOnline) && { opacity: 0.4 }]}
                              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                            >
                              {isRegionRefreshing ? (
                                <ActivityIndicator size={8} color="#FFB300" />
                              ) : (
                                <Ionicons name="cloud-download-outline" size={9} color="#FFB300" />
                              )}
                            </TouchableOpacity>
                          )}
                        </View>
                      )}

                      {region.status === 'partial' && (
                        <View style={styles.miniProgressBg}>
                          <View style={[
                            styles.miniProgressFill,
                            { width: `${Math.min(100, Math.round((region.downloadedTiles / Math.max(1, region.tileCount)) * 100))}%` },
                          ]} />
                        </View>
                      )}

                      {region.status === 'error' && region.errorMessage && (
                        <Text style={styles.regionError}>{region.errorMessage}</Text>
                      )}
                    </View>
                  );
                })}

              {sortedRegions.filter(r => r.status !== 'downloading').length > 5 && (
                <Text style={styles.moreText}>
                  +{sortedRegions.filter(r => r.status !== 'downloading').length - 5} more regions
                </Text>
              )}
            </View>
          )}

          {/* ── Empty state ── */}
          {regions.length === 0 && (
            <View style={styles.emptyState}>
              <Ionicons name="cloud-offline-outline" size={20} color={TACTICAL.textMuted} />
              <Text style={styles.emptyText}>
                No cached regions. Use "Cache Current View" above or open the full manager.
              </Text>
            </View>
          )}

          {/* ── Bottom Actions Row ── */}
          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={styles.fullManagerBtn}
              onPress={() => router.push('/navigate-offline' as any)}
              activeOpacity={0.8}
            >
              <Ionicons name="map-outline" size={12} color={TACTICAL.amber} />
              <Text style={styles.fullManagerText}>OFFLINE MANAGER</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.storageSettingsBtn}
              onPress={() => setShowSettings(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="options-outline" size={12} color={TACTICAL.amber} />
              <Text style={styles.storageSettingsBtnText}>STORAGE</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ═══════ STORAGE SETTINGS PANEL ═══════ */}
      {expanded && showSettings && (
        <StorageSettingsPanel
          visible={showSettings}
          onClose={() => { setShowSettings(false); refreshData(); }}
          showToast={showToast}
        />
      )}
    </View>
  );
}


// ── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    borderRadius: TACTICAL.radius,
    backgroundColor: TACTICAL.panel,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: DENSITY.cardPad,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,179,0,0.12)',
  },
  activeDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#FFB300',
  },
  activeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#FFB300',
  },
  offlineBadge: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(239,83,80,0.12)',
  },
  updateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,179,0,0.12)',
  },
  updateBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#FFB300',
    letterSpacing: 1,
  },
  quotaLevelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
  },
  quotaLevelDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  quotaLevelText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1,
  },

  // Compact stats
  compactStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  compactStatValue: {
    ...TYPO.K3,
    fontSize: 10,
    color: TACTICAL.text,
  },
  compactStatLabel: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },
  compactStatDivider: {
    width: 1,
    height: 10,
    backgroundColor: TACTICAL.border,
    marginHorizontal: 2,
  },

  // Expanded content
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    paddingHorizontal: DENSITY.cardPad,
    paddingBottom: DENSITY.cardPad,
    gap: 12,
  },

  // Quota compact row
  quotaCompactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 10,
    paddingBottom: 2,
  },
  quotaCompactText: {
    ...TYPO.K3,
    fontSize: 9,
  },
  quotaCompactBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(62,79,60,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  quotaCompactBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  quotaStaleText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#FFB300',
    letterSpacing: 1,
  },
  settingsBtn: {
    padding: 4,
  },

  // ═══════ Freshness check section ═══════
  freshnessCheckSection: {
    borderWidth: 1,
    borderColor: '#64B5F6' + '20',
    borderRadius: 8,
    padding: 10,
    gap: 8,
    backgroundColor: 'rgba(100,181,246,0.03)',
  },
  freshnessCheckHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  freshnessCheckLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  freshnessCheckTitle: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 3,
    color: '#64B5F6',
  },
  updateCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(255,179,0,0.12)',
  },
  updateCountText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1,
    color: '#FFB300',
  },
  checkProgressSection: {
    gap: 4,
  },
  checkProgressBarBg: {
    height: 3,
    backgroundColor: 'rgba(100,181,246,0.12)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  checkProgressBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: '#64B5F6',
  },
  checkProgressText: {
    ...TYPO.B2,
    fontSize: 8,
    color: '#64B5F6',
  },
  freshnessActionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  checkAllBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#64B5F6' + '30',
    backgroundColor: 'rgba(100,181,246,0.06)',
  },
  checkAllBtnDisabled: {
    opacity: 0.4,
  },
  checkAllBtnText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: '#64B5F6',
  },
  updateAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFB300' + '30',
    backgroundColor: 'rgba(255,179,0,0.06)',
  },
  updateAllBtnText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: '#FFB300',
  },

  // Cache view section
  cacheViewSection: {
    gap: 8,
  },
  cacheViewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 4,
  },
  cacheViewTitle: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 3,
    color: TACTICAL.amber,
  },

  // Zoom row
  zoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  zoomLabel: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  zoomPresets: {
    flexDirection: 'row',
    gap: 6,
    flex: 1,
  },
  zoomChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    gap: 1,
  },
  zoomChipActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  zoomChipText: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 1,
    color: TACTICAL.textMuted,
  },
  zoomChipTextActive: {
    color: TACTICAL.amber,
  },
  zoomChipRange: {
    ...TYPO.B2,
    fontSize: 7,
    color: TACTICAL.textMuted,
  },

  // Estimate row
  estimateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  estimateItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  estimateText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },

  noBoundsText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
    textAlign: 'center',
    paddingVertical: 4,
  },

  // Cache button
  cacheBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
  },
  cacheBtnDisabled: {
    opacity: 0.4,
  },
  cacheBtnText: {
    ...TYPO.U2,
    fontSize: 9,
    letterSpacing: 2,
    color: '#0B0F12',
  },

  // Section label
  sectionLabel: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 3,
    color: TACTICAL.textMuted,
    paddingBottom: 4,
  },

  // Active downloads
  activeDownloads: {
    gap: 6,
  },
  downloadCard: {
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    gap: 4,
  },
  downloadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  downloadName: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.text,
    flex: 1,
    marginRight: 8,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
    backgroundColor: TACTICAL.amber,
  },
  downloadMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  downloadPercent: {
    ...TYPO.K3,
    fontSize: 10,
    color: TACTICAL.amber,
  },
  downloadSpeed: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  downloadETA: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  downloadSize: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
    marginLeft: 'auto',
  },

  // Regions section
  regionsSection: {
    gap: 4,
  },
  regionsSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readyBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  readyText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1,
    color: '#66BB6A',
  },

  // Region card
  regionCard: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border + '40',
    gap: 3,
  },
  regionCardUpdate: {
    borderLeftWidth: 2,
    borderLeftColor: '#FFB300' + '60',
    paddingLeft: 8,
  },
  regionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  regionDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  regionName: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.text,
    flex: 1,
  },
  regionSize: {
    ...TYPO.K3,
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginRight: 4,
  },
  regionActionBtn: {
    padding: 4,
  },
  regionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 12,
  },
  regionMetaText: {
    ...TYPO.B2,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },

  // Region freshness indicator row
  regionFreshnessRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 12,
    paddingTop: 2,
  },
  regionFreshnessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 3,
  },
  regionFreshnessDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  regionFreshnessLabel: {
    ...TYPO.U2,
    fontSize: 6,
    letterSpacing: 1,
  },
  regionVerifiedText: {
    ...TYPO.B2,
    fontSize: 7,
    color: TACTICAL.textMuted,
  },
  regionCheckBtn: {
    padding: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#64B5F6' + '30',
  },
  regionUpdateBtn: {
    padding: 3,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#FFB300' + '30',
    backgroundColor: 'rgba(255,179,0,0.06)',
  },

  miniProgressBg: {
    height: 2,
    backgroundColor: 'rgba(62,79,60,0.1)',
    borderRadius: 1,
    overflow: 'hidden',
    marginLeft: 12,
  },
  miniProgressFill: {
    height: '100%',
    borderRadius: 1,
    backgroundColor: '#FFB300',
  },
  regionError: {
    ...TYPO.B2,
    fontSize: 8,
    color: '#EF5350',
    paddingLeft: 12,
  },
  moreText: {
    ...TYPO.B2,
    fontSize: 9,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    paddingTop: 4,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  emptyText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },

  // Bottom actions
  bottomActions: {
    flexDirection: 'row',
    gap: 8,
    paddingTop: 4,
  },
  fullManagerBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  fullManagerText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: TACTICAL.amber,
  },
  storageSettingsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: 'rgba(196,138,44,0.04)',
  },
  storageSettingsBtnText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: TACTICAL.amber,
  },
});



