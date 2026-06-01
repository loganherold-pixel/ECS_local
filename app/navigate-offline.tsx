/**
 * Navigate Offline — Full-Page Offline Map Storage Dashboard
 *
 * Comprehensive offline map tile cache management:
 *   - StorageDashboard: KPIs for regions, tiles, storage, freshness
 *   - DeviceStorageGauge: Free space vs tile cache vs other usage
 *   - CachedRegionCard: Per-region controls (resume/delete/freshness/merge)
 *   - MergeRegionsPanel: Overlap detection and region merging
 *   - CleanupPanel: analyzeCache() recommendations with one-tap execution
 *   - BatchFreshnessChecker: Batch freshness verification with progress
 *   - RegionSelector: Create new regions from routes or bounding boxes
 *
 * Integrates with:
 *   - tileCacheStore.ts for tile storage + metadata
 *   - tileAutoCleanup.ts for cache analysis + cleanup
 *   - nativeTileStorage.ts for native file system persistence
 *   - connectivity.ts for online/offline detection
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../lib/theme';
import { useApp } from '../context/AppContext';
import {
  tileCacheStore,
  type TileCacheRegion,
  type TileCacheStats,
  type TileBounds,
  type DownloadProgress,
  type RegionOverlapInfo,
} from '../lib/tileCacheStore';
import { connectivity } from '../lib/connectivity';

import StorageDashboard from '../components/offline-maps/StorageDashboard';
import CachedRegionCard from '../components/offline-maps/CachedRegionCard';
import RegionSelector from '../components/offline-maps/RegionSelector';
import DeviceStorageGauge from '../components/offline-maps/DeviceStorageGauge';
import CleanupPanel from '../components/offline-maps/CleanupPanel';
import BatchFreshnessChecker from '../components/offline-maps/BatchFreshnessChecker';
import MergeRegionsPanel from '../components/offline-maps/MergeRegionsPanel';
import Toast from '../components/Toast';


export default function OfflinePacksScreen() {
  const router = useRouter();
  const { showToast } = useApp();

  const [regions, setRegions] = useState<TileCacheRegion[]>([]);
  const [stats, setStats] = useState<TileCacheStats>({
    totalRegions: 0,
    totalTiles: 0,
    downloadedTiles: 0,
    totalSizeMB: 0,
    lastDownloadAt: null,
    storageQuotaMB: null,
    storageUsedMB: null,
  });
  const [showCreate, setShowCreate] = useState(false);
  const [showMergePanel, setShowMergePanel] = useState(false);
  const [activeProgress, setActiveProgress] = useState<Map<string, DownloadProgress>>(new Map());
  const [isOnline, setIsOnline] = useState(connectivity.isOnline());
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Freshness checking state ──────────────────────────
  const [checkingRegionIds, setCheckingRegionIds] = useState<Set<string>>(new Set());
  const [refreshingRegionIds, setRefreshingRegionIds] = useState<Set<string>>(new Set());

  // ── Overlap data ──────────────────────────────────────
  const [allOverlaps, setAllOverlaps] = useState<Map<string, RegionOverlapInfo[]>>(new Map());

  // ── Active section tracking ───────────────────────────
  const [activeSection, setActiveSection] = useState<'regions' | 'cleanup' | 'merge' | 'freshness'>('regions');

  const progressRef = useRef(activeProgress);
  progressRef.current = activeProgress;
  const startDownloadRef = useRef<(regionId: string) => Promise<void> | void>(() => {});

  // ── Connectivity monitoring ────────────────────────────
  useEffect(() => {
    const unsub = connectivity.onStatusChange((status) => {
      setIsOnline(status === 'online');
    });
    connectivity.startMonitoring();
    return () => { unsub(); };
  }, []);

  // ── Load data ──────────────────────────────────────────
  const refreshData = useCallback(async () => {
    setRegions(tileCacheStore.getRegions());
    const s = await tileCacheStore.getStatsWithStorage();
    setStats(s);
    // Refresh overlap data
    const overlaps = tileCacheStore.getAllRegionOverlaps();
    setAllOverlaps(overlaps);
    setRefreshKey(k => k + 1);
  }, []);

  useEffect(() => {
    refreshData();
    const unsub = tileCacheStore.subscribe(refreshData);
    return unsub;
  }, [refreshData]);

  // ── Computed values ────────────────────────────────────
  const checkableCount = useMemo(() => {
    return regions.filter(r => r.status === 'complete' || r.status === 'partial').length;
  }, [regions]);

  const hasOverlaps = useMemo(() => {
    return allOverlaps.size > 0;
  }, [allOverlaps]);

  // ── Create region from route corridor ──────────────────
  const handleCreateFromRoute = useCallback((
    name: string,
    points: { lat: number; lng: number }[],
    corridorMiles: number,
    zoomMin: number,
    zoomMax: number,
    styleKey: string
  ) => {
    const region = tileCacheStore.createFromRoute(name, points, corridorMiles, zoomMin, zoomMax, styleKey);
    if (!region) {
      showToast('Region could not be created because no valid route points were found.');
      return;
    }

    setShowCreate(false);
    refreshData();
    showToast(`Region saved. ${region.tileCount.toLocaleString()} tiles are ready to download.`);

    if (isOnline) {
      void startDownloadRef.current(region.id);
    } else {
      showToast('Download is queued and can start when a connection returns.');
    }
  }, [showToast, refreshData, isOnline]);

  // ── Create region from bounding box ────────────────────
  const handleCreateFromBounds = useCallback((
    name: string,
    bounds: TileBounds,
    zoomMin: number,
    zoomMax: number,
    styleKey: string
  ) => {
    const region = tileCacheStore.createFromBounds(name, bounds, zoomMin, zoomMax, styleKey);

    setShowCreate(false);
    refreshData();
    showToast(`Region saved. ${region.tileCount.toLocaleString()} tiles are ready to download.`);

    if (isOnline) {
      void startDownloadRef.current(region.id);
    } else {
      showToast('Download is queued and can start when a connection returns.');
    }
  }, [showToast, refreshData, isOnline]);

  // ── Download management ────────────────────────────────
  const startDownload = useCallback(async (regionId: string) => {
    if (!isOnline) {
      showToast('Downloads need a network connection. Saved regions remain available offline.');
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

    showToast('Download started.');
    const success = await tileCacheStore.startDownload(regionId, onProgress);

    setTimeout(() => {
      setActiveProgress(prev => {
        const next = new Map(prev);
        next.delete(regionId);
        return next;
      });
      refreshData();
    }, 2000);

    if (success) {
      showToast('Download complete. Region is ready for offline use.');
    } else {
      showToast('Download finished with gaps. Some tiles could not be saved.');
    }
  }, [showToast, refreshData, isOnline]);
  startDownloadRef.current = startDownload;

  const handleResume = useCallback((regionId: string) => {
    startDownload(regionId);
  }, [startDownload]);

  const handleCancel = useCallback((regionId: string) => {
    tileCacheStore.cancelDownload(regionId);
    showToast('Download paused.');
    refreshData();
  }, [showToast, refreshData]);

  const handleRetry = useCallback((regionId: string) => {
    startDownload(regionId);
  }, [startDownload]);

  const handleDelete = useCallback((regionId: string) => {
    const doDelete = async () => {
      await tileCacheStore.deleteRegion(regionId);
      showToast('Saved region removed.');
      refreshData();
    };

    if (Platform.OS === 'web') {
      if (confirm('Delete this cached region and all its tiles?')) {
        doDelete();
      }
    } else {
      Alert.alert(
        'Delete Region',
        'Remove this cached region and all downloaded tiles?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ]
      );
    }
  }, [showToast, refreshData]);

  const handleClearAll = useCallback(() => {
    const doClear = () => {
      tileCacheStore.clearAll();
      setActiveProgress(new Map());
      showToast('All saved map regions were removed.');
      refreshData();
    };

    if (Platform.OS === 'web') {
      if (confirm('Delete ALL cached regions and tiles? This cannot be undone.')) {
        doClear();
      }
    } else {
      Alert.alert(
        'Clear All Cache',
        'Delete all cached regions and tiles? This cannot be undone.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Clear All', style: 'destructive', onPress: doClear },
        ]
      );
    }
  }, [showToast, refreshData]);

  // ── Freshness check for individual regions ─────────────
  const handleCheckFreshness = useCallback(async (regionId: string) => {
    if (!isOnline) {
      showToast('Freshness checks need a network connection.');
      return;
    }

    setCheckingRegionIds(prev => new Set(prev).add(regionId));

    try {
      const result = await tileCacheStore.checkRegionFreshness(regionId);
      showToast(result.message);
    } catch (e: any) {
      showToast('Freshness check could not be completed.');
    } finally {
      setCheckingRegionIds(prev => {
        const next = new Set(prev);
        next.delete(regionId);
        return next;
      });
      refreshData();
    }
  }, [isOnline, showToast, refreshData]);

  // ── Refresh (re-download) individual region ────────────
  const handleRefreshRegion = useCallback(async (regionId: string) => {
    if (!isOnline) {
      showToast('Refreshing saved coverage needs a network connection.');
      return;
    }

    setRefreshingRegionIds(prev => new Set(prev).add(regionId));

    const onProgress = (progress: DownloadProgress) => {
      setActiveProgress(prev => {
        const next = new Map(prev);
        next.set(regionId, progress);
        return next;
      });
    };

    try {
      showToast('Refreshing saved region...');
      const success = await tileCacheStore.refreshRegion(regionId, onProgress);

      if (success) {
        showToast('Saved region refreshed.');
      } else {
        showToast('Refresh finished with gaps. Some tiles could not be updated.');
      }
    } catch (e: any) {
      showToast('Refresh could not be completed.');
    } finally {
      setRefreshingRegionIds(prev => {
        const next = new Set(prev);
        next.delete(regionId);
        return next;
      });
      setTimeout(() => {
        setActiveProgress(prev => {
          const next = new Map(prev);
          next.delete(regionId);
          return next;
        });
      }, 2000);
      refreshData();
    }
  }, [isOnline, showToast, refreshData]);

  // ── Merge handler (from CachedRegionCard) ──────────────
  const handleMergeFromCard = useCallback((regionIds: string[]) => {
    setShowMergePanel(true);
    setActiveSection('merge');
  }, []);

  // ── Sort regions ───────────────────────────────────────
  const sortedRegions = [...regions].sort((a, b) => {
    if (a.status === 'downloading' && b.status !== 'downloading') return -1;
    if (b.status === 'downloading' && a.status !== 'downloading') return 1;
    if (a.status === 'pending' && b.status !== 'pending') return -1;
    if (b.status === 'pending' && a.status !== 'pending') return 1;
    return b.downloadedAt.localeCompare(a.downloadedAt);
  });

  const completeCount = regions.filter(r => r.status === 'complete').length;
  const downloadingCount = regions.filter(r => r.status === 'downloading').length;
  const pendingCount = regions.filter(r => r.status === 'pending' || r.status === 'cancelled').length;
  const updateAvailableCount = regions.filter(r => r.freshnessStatus === 'update-available').length;
  const isNative = Platform.OS !== 'web';
  const offlineReady = stats.totalRegions > 0 || stats.totalTiles > 0;
  const connectionLabel = isOnline ? 'ONLINE' : offlineReady ? 'OFFLINE READY' : 'OFFLINE';
  const connectionTone = isOnline ? '#66BB6A' : offlineReady ? TACTICAL.amber : '#EF5350';
  const connectionSummary = isOnline
    ? 'Connected now. You can download new regions, refresh saved coverage, and verify freshness.'
    : offlineReady
      ? 'You are offline. Saved regions stay available, and queued downloads can resume when signal returns.'
      : 'You are offline. Review saved status here, then reconnect before downloading new coverage.';
  const connectionIcon = isOnline
    ? 'wifi-outline'
    : offlineReady
      ? 'cloud-done-outline'
      : 'cloud-offline-outline';

  return (
    <View style={styles.container}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TACTICAL.text} />
        </TouchableOpacity>
        <View style={styles.topTitleGroup}>
          <Text style={styles.topTitle}>OFFLINE MAPS</Text>
          {downloadingCount > 0 && (
            <View style={styles.downloadingBadge}>
              <View style={styles.downloadingDot} />
              <Text style={styles.downloadingText}>{downloadingCount} DOWNLOADING</Text>
            </View>
          )}
          {updateAvailableCount > 0 && (
            <View style={styles.updateBadge}>
              <Ionicons name="arrow-up-circle-outline" size={9} color="#FFB300" />
              <Text style={styles.updateBadgeText}>{updateAvailableCount} UPDATE{updateAvailableCount > 1 ? 'S' : ''}</Text>
            </View>
          )}
          {!isOnline && (
            <View
              style={[
                styles.offlineBadge,
                {
                  borderColor: `${connectionTone}30`,
                  backgroundColor: `${connectionTone}12`,
                },
              ]}
            >
              <Ionicons name="cloud-offline-outline" size={10} color={connectionTone} />
              <Text style={[styles.offlineText, { color: connectionTone }]}>{connectionLabel}</Text>
            </View>
          )}
        </View>
        <View style={styles.topActions}>
          {regions.length > 0 && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClearAll}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.createPackBtn}
            onPress={() => setShowCreate(!showCreate)}
            activeOpacity={0.8}
          >
            <Ionicons name={showCreate ? 'close' : 'add'} size={18} color={TACTICAL.amber} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Section tabs */}
      <View style={styles.sectionTabs}>
        {[
          { key: 'regions' as const, label: 'REGIONS', icon: 'layers-outline', count: regions.length },
          { key: 'cleanup' as const, label: 'CLEANUP', icon: 'analytics-outline', count: null },
          { key: 'merge' as const, label: 'MERGE', icon: 'git-merge-outline', count: hasOverlaps ? allOverlaps.size : null },
          { key: 'freshness' as const, label: 'FRESHNESS', icon: 'sync-outline', count: updateAvailableCount || null },
        ].map(tab => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.sectionTab, activeSection === tab.key && styles.sectionTabActive]}
            onPress={() => setActiveSection(tab.key)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={tab.icon as any}
              size={12}
              color={activeSection === tab.key ? TACTICAL.amber : TACTICAL.textMuted}
            />
            <Text style={[styles.sectionTabText, activeSection === tab.key && styles.sectionTabTextActive]}>
              {tab.label}
            </Text>
            {tab.count !== null && tab.count > 0 && (
              <View style={[styles.sectionTabBadge, activeSection === tab.key && styles.sectionTabBadgeActive]}>
                <Text style={[styles.sectionTabBadgeText, activeSection === tab.key && styles.sectionTabBadgeTextActive]}>
                  {tab.count}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* Storage Dashboard — always visible */}
        <StorageDashboard stats={stats} regions={regions} />

        {/* Device Storage Gauge — always visible */}
        <DeviceStorageGauge stats={stats} refreshKey={refreshKey} />

        {/* Info banner */}
        <View style={styles.infoBanner}>
          <Ionicons name={connectionIcon as any} size={14} color={connectionTone} />
          <Text style={styles.infoText}>{connectionSummary}</Text>
        </View>

        {/* Pending downloads notice */}
        {pendingCount > 0 && !isOnline && (
          <View style={styles.pendingBanner}>
            <Ionicons name="hourglass-outline" size={13} color="#FFB300" />
            <Text style={styles.pendingText}>
              {pendingCount} saved region{pendingCount > 1 ? 's are' : ' is'} waiting to download when signal returns.
            </Text>
          </View>
        )}

        {/* Create region form */}
        {showCreate && (
          <RegionSelector
            onCreateFromRoute={handleCreateFromRoute}
            onCreateFromBounds={handleCreateFromBounds}
            onCancel={() => setShowCreate(false)}
          />
        )}

        {/* ═══════ REGIONS SECTION ═══════ */}
        {activeSection === 'regions' && (
          <>
            {sortedRegions.length > 0 && (
              <>
                <View style={styles.sectionHeader}>
                  <Ionicons name="layers-outline" size={14} color={TACTICAL.amber} />
                  <Text style={styles.sectionLabel}>
                    CACHED REGIONS ({regions.length})
                  </Text>
                  {completeCount > 0 && (
                    <View style={styles.completeBadge}>
                      <Ionicons name="checkmark-circle" size={10} color="#66BB6A" />
                      <Text style={styles.completeBadgeText}>{completeCount} READY</Text>
                    </View>
                  )}
                </View>

                {sortedRegions.map(region => (
                  <CachedRegionCard
                    key={region.id}
                    region={region}
                    progress={activeProgress.get(region.id) || null}
                    onResume={handleResume}
                    onCancel={handleCancel}
                    onDelete={handleDelete}
                    onRetry={handleRetry}
                    onCheckFreshness={handleCheckFreshness}
                    onRefresh={handleRefreshRegion}
                    isCheckingFreshness={checkingRegionIds.has(region.id)}
                    isRefreshing={refreshingRegionIds.has(region.id)}
                    overlaps={allOverlaps.get(region.id)}
                    onMerge={handleMergeFromCard}
                  />
                ))}
              </>
            )}

            {/* Empty state */}
            {regions.length === 0 && !showCreate && (
              <View style={styles.emptyState}>
                <View style={styles.emptyIconContainer}>
                  <Ionicons name="cloud-offline-outline" size={40} color={TACTICAL.textMuted} />
                </View>
                <Text style={styles.emptyTitle}>NO CACHED REGIONS</Text>
                <Text style={styles.emptyBody}>
                  Save map coverage for the areas you expect to cross, then keep it available offline
                  when service drops. Start with a route corridor or create a region around a key area.
                </Text>
                <View style={styles.emptyFeatures}>
                  <View style={styles.emptyFeatureRow}>
                    <Ionicons name="navigate-outline" size={12} color={TACTICAL.amber} />
                    <Text style={styles.emptyFeatureText}>Save coverage along your planned route</Text>
                  </View>
                  <View style={styles.emptyFeatureRow}>
                    <Ionicons name="crop-outline" size={12} color={TACTICAL.amber} />
                    <Text style={styles.emptyFeatureText}>Mark custom areas that need offline coverage</Text>
                  </View>
                  <View style={styles.emptyFeatureRow}>
                    <Ionicons name="search-outline" size={12} color={TACTICAL.amber} />
                    <Text style={styles.emptyFeatureText}>Choose the detail level you want to keep</Text>
                  </View>
                  <View style={styles.emptyFeatureRow}>
                    <Ionicons
                      name={isNative ? 'phone-portrait-outline' : 'server-outline'}
                      size={12}
                      color={TACTICAL.amber}
                    />
                    <Text style={styles.emptyFeatureText}>
                      {isNative
                        ? 'Saved on this device for repeat offline use'
                        : 'Saved in local browser storage for repeat offline use'
                      }
                    </Text>
                  </View>
                  <View style={styles.emptyFeatureRow}>
                    <Ionicons name="time-outline" size={12} color={TACTICAL.amber} />
                    <Text style={styles.emptyFeatureText}>Freshness checks show when saved coverage should be refreshed</Text>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.emptyBtn}
                  onPress={() => setShowCreate(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="add" size={16} color="#0B0F12" />
                  <Text style={styles.emptyBtnText}>CREATE REGION</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* ═══════ CLEANUP SECTION ═══════ */}
        {activeSection === 'cleanup' && (
          <CleanupPanel
            onCleanupComplete={refreshData}
            showToast={showToast}
            autoAnalyze={true}
          />
        )}

        {/* ═══════ MERGE SECTION ═══════ */}
        {activeSection === 'merge' && (
          <MergeRegionsPanel
            onMergeComplete={refreshData}
            showToast={showToast}
            onClose={() => setActiveSection('regions')}
          />
        )}

        {/* ═══════ FRESHNESS SECTION ═══════ */}
        {activeSection === 'freshness' && (
          <BatchFreshnessChecker
            checkableCount={checkableCount}
            isOnline={isOnline}
            onComplete={refreshData}
            showToast={showToast}
          />
        )}

        {/* Offline support footer */}
        <View style={styles.techFooter}>
          <Text style={styles.techTitle}>OFFLINE FIELD NOTES</Text>
          <View style={styles.techRow}>
            <Ionicons name="cube-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={styles.techText}>
              Saved regions stay available offline across app restarts.
            </Text>
          </View>
          <View style={styles.techRow}>
            <Ionicons name="server-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={styles.techText}>
              New downloads and freshness checks resume when a connection is available.
            </Text>
          </View>
          <View style={styles.techRow}>
            <Ionicons name="time-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={styles.techText}>
              Older regions can still be used, but they are worth refreshing before remote travel.
            </Text>
          </View>
          <View style={styles.techRow}>
            <Ionicons name="analytics-outline" size={10} color={TACTICAL.textMuted} />
            <Text style={styles.techText}>
              Cleanup protects current and recently used coverage before removing older regions.
            </Text>
          </View>
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
      <Toast />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TACTICAL.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'web' ? 16 : 54,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
    gap: 8,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitleGroup: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  topTitle: {
    ...TYPO.T2,
    color: TACTICAL.amber,
  },
  downloadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,179,0,0.1)',
    borderWidth: 1,
    borderColor: '#FFB300' + '30',
  },
  downloadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFB300',
  },
  downloadingText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: '#FFB300',
  },
  updateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(255,179,0,0.1)',
    borderWidth: 1,
    borderColor: '#FFB300' + '25',
  },
  updateBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1,
    color: '#FFB300',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(239,83,80,0.1)',
    borderWidth: 1,
    borderColor: '#EF5350' + '30',
  },
  offlineText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: '#EF5350',
  },
  topActions: {
    flexDirection: 'row',
    gap: 6,
  },
  clearBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  createPackBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
  },

  // Section tabs
  sectionTabs: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  sectionTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  sectionTabActive: {
    borderColor: TACTICAL.amber + '40',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  sectionTabText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1.5,
    color: TACTICAL.textMuted,
  },
  sectionTabTextActive: {
    color: TACTICAL.amber,
  },
  sectionTabBadge: {
    minWidth: 16,
    height: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(138,138,133,0.15)',
    paddingHorizontal: 4,
  },
  sectionTabBadgeActive: {
    backgroundColor: 'rgba(196,138,44,0.2)',
  },
  sectionTabBadgeText: {
    ...TYPO.K3,
    fontSize: 8,
    color: TACTICAL.textMuted,
  },
  sectionTabBadgeTextActive: {
    color: TACTICAL.amber,
  },

  scroll: { flex: 1 },
  scrollContent: {
    padding: DENSITY.screenPad,
    gap: DENSITY.cardGap,
  },

  // Info banner
  infoBanner: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(196,138,44,0.08)',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '20',
  },
  infoText: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.textMuted,
    flex: 1,
    lineHeight: 16,
  },

  // Pending banner
  pendingBanner: {
    flexDirection: 'row',
    gap: 8,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,179,0,0.08)',
    borderWidth: 1,
    borderColor: '#FFB300' + '25',
  },
  pendingText: {
    ...TYPO.B2,
    fontSize: 11,
    color: '#FFB300',
    flex: 1,
    lineHeight: 16,
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  sectionLabel: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    flex: 1,
  },
  completeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(102,187,106,0.1)',
  },
  completeBadgeText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 2,
    color: '#66BB6A',
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    padding: 28,
    gap: 12,
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  emptyIconContainer: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(62,79,60,0.1)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginBottom: 4,
  },
  emptyTitle: {
    ...TYPO.T2,
    color: TACTICAL.text,
  },
  emptyBody: {
    ...TYPO.B2,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
  emptyFeatures: {
    width: '100%',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  emptyFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  emptyFeatureText: {
    ...TYPO.B2,
    fontSize: 11,
    color: TACTICAL.text,
  },
  emptyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: TACTICAL.amber,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 4,
  },
  emptyBtnText: {
    ...TYPO.U1,
    color: '#0B0F12',
    fontSize: 11,
  },

  // Tech footer
  techFooter: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: 12,
    gap: 6,
    marginTop: 8,
  },
  techTitle: {
    ...TYPO.T4,
    fontSize: 8,
    letterSpacing: 3,
    color: TACTICAL.textMuted,
    marginBottom: 2,
  },
  techRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  techText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
});




