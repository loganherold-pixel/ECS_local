/**
 * OfflineCacheModal — Integrated Offline Map Tile Caching System
 *
 * A comprehensive modal accessible from the Navigate tab that provides:
 *   - Region selection from current map viewport
 *   - Zoom level selection with tactical presets
 *   - Real-time download progress with animated tactical progress bars
 *   - Storage usage dashboard with quota gauge
 *   - Cached region management (resume, delete, freshness check)
 *   - Map style selection for tile source
 *   - Connectivity awareness
 *
 * Integrates with:
 *   - tileCacheStore for tile storage + metadata + quota
 *   - connectivity for online/offline detection
 *   - MapRenderer viewport bounds
 */
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useSheetLayout } from '../../lib/useSheetLayout';

import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  tileCacheStore,
  countTilesForRegion,
  estimateSizeMB,
  getTileBreakdown,
  computeRouteCorridor,
  type TileCacheRegion,
  type TileCacheStats,
  type TileBounds,
  type DownloadProgress,
  type QuotaStatus,
} from '../../lib/tileCacheStore';
import {
  offlineTileSyncCoordinator,
  type OfflineTileSyncSnapshot,
  type OfflineTileSyncSource,
} from '../../lib/offlineTileSyncCoordinator';
import {
  listOfflineCachedRoutes,
  removeOfflineCachedRoute,
  type OfflineCachedRoute,
} from '../../lib/offlineRouteCacheService';
import {
  formatRemoteCacheLastVerified,
  formatRemoteCacheSize,
} from '../../lib/remote/offlineRemoteCache';
import { connectivity } from '../../lib/connectivity';
import {
  analyzeCache,
  quickCleanup,
  type CleanupReport,
  type CleanupResult,
} from '../../lib/tileAutoCleanup';
import { getDeviceStorageInfo } from '../../lib/nativeTileStorage';
import RegionSelector from '../offline-maps/RegionSelector';


const { width: SCREEN_W } = Dimensions.get('window');

// ── Types ───────────────────────────────────────────────

interface Props {
  visible?: boolean;
  onClose?: () => void;
  embedded?: boolean;
  mapBounds: TileBounds | null;
  mapZoom: number;
  mapStyle: string;
  showToast: (msg: string) => void;
  onRequestMapBounds?: () => void;
  onOpenDownloadedSync?: (item: DownloadedSyncOpenTarget) => void | Promise<void>;
}

type TabKey = 'cache' | 'regions' | 'storage';
export type DownloadedSyncOpenTarget =
  | {
      kind: 'route';
      route: OfflineCachedRoute;
    }
  | {
      kind: 'region';
      region: TileCacheRegion;
    };

type DownloadedSyncCard =
  | {
      kind: 'route';
      id: string;
      title: string;
      region: string;
      metricPrimary: string;
      metricSecondary: string;
      typeLabel: string;
      guidanceLabel: string;
      cachedLabel: string;
      statusLabel: string;
      tone: 'route' | 'region';
      route: OfflineCachedRoute;
    }
  | {
      kind: 'region';
      id: string;
      title: string;
      region: string;
      metricPrimary: string;
      metricSecondary: string;
      typeLabel: string;
      guidanceLabel: string;
      cachedLabel: string;
      statusLabel: string;
      tone: 'route' | 'region';
      regionItem: TileCacheRegion;
    };

// ── Zoom Presets ────────────────────────────────────────

const ZOOM_PRESETS = [
  { label: 'NAV', min: 8, max: 14, desc: 'Driving', icon: 'car-outline' },
  { label: 'TRAIL', min: 10, max: 16, desc: 'Detail', icon: 'walk-outline' },
  { label: 'RECON', min: 5, max: 12, desc: 'Overview', icon: 'eye-outline' },
  { label: 'FULL', min: 5, max: 16, desc: 'All', icon: 'layers-outline' },
];

const STYLE_OPTIONS = [
  { key: 'tactical', label: 'TACTICAL', icon: 'shield-outline' },
  { key: 'terrain', label: 'TERRAIN', icon: 'trail-sign-outline' },
  { key: 'satellite', label: 'SAT', icon: 'earth-outline' },
  { key: '3d', label: '3D', icon: 'cube-outline' },
];

// ── Helpers ─────────────────────────────────────────────

function formatSize(mb: number | null | undefined): string {
  const safeMb = typeof mb === 'number' && Number.isFinite(mb) ? mb : 0;
  if (safeMb >= 1024) return `${(safeMb / 1024).toFixed(1)} GB`;
  if (safeMb >= 1) return `${safeMb.toFixed(1)} MB`;
  return `${Math.round(safeMb * 1024)} KB`;
}

function formatAge(iso: string | null | undefined): string {
  if (!iso) return 'Never';
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

function formatETA(seconds: number | null | undefined): string {
  const safeSeconds = typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : 0;
  if (safeSeconds <= 0) return '';
  if (safeSeconds < 60) return `${Math.round(safeSeconds)}s`;
  if (safeSeconds < 3600) return `${Math.ceil(safeSeconds / 60)}m`;
  return `${(safeSeconds / 3600).toFixed(1)}h`;
}

function formatMiles(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '--';
  if (value < 10) return `${value.toFixed(1)} mi`;
  return `${Math.round(value)} mi`;
}

function formatBoundsArea(bounds: TileBounds | null | undefined): string {
  if (!bounds) return 'Map area';
  const latSpan = Math.abs(bounds.maxLat - bounds.minLat);
  const lngSpan = Math.abs(bounds.maxLng - bounds.minLng);
  if (!Number.isFinite(latSpan) || !Number.isFinite(lngSpan)) return 'Map area';
  return `${latSpan.toFixed(2)}\u00B0 x ${lngSpan.toFixed(2)}\u00B0`;
}

function formatBoundsCenter(bounds: TileBounds | null | undefined): string {
  if (!bounds) return 'Saved offline region';
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const centerLng = (bounds.minLng + bounds.maxLng) / 2;
  if (!Number.isFinite(centerLat) || !Number.isFinite(centerLng)) return 'Saved offline region';
  return `${centerLat.toFixed(3)}, ${centerLng.toFixed(3)}`;
}

function routeSourceLabel(source: string | null | undefined): string {
  const value = String(source ?? '').trim();
  if (!value) return 'OFFLINE ROUTE';
  if (value === 'gpx') return 'GPX ROUTE';
  if (value === 'explore') return 'EXPLORE ROUTE';
  if (value === 'drawn') return 'DRAWN ROUTE';
  if (value === 'built') return 'BUILT ROUTE';
  return `${value.toUpperCase()} ROUTE`;
}

function downloadedRouteTypeLabel(route: OfflineCachedRoute): string {
  if (route.routeIntent?.syncType === 'route') return 'ROUTE SYNC';
  return routeSourceLabel(route.source);
}

function formatMapStyleLabel(styleKey: string | null | undefined): string {
  const key = String(styleKey ?? '').trim().toLowerCase();
  if (!key) return 'STYLE UNKNOWN';
  if (key === 'ecs') return 'DAY STYLE';
  if (key === 'tactical') return 'TAC STYLE';
  if (key === 'satellite') return 'SAT STYLE';
  if (key === '3d') return '3D STYLE';
  if (key === 'terrain') return 'TERRAIN STYLE';
  return `${key.toUpperCase()} STYLE`;
}

function regionSourceLabel(sourceType: TileCacheRegion['sourceType']): string {
  if (sourceType === 'route-corridor') return 'ROUTE CORRIDOR';
  if (sourceType === 'bounding-box') return 'MAP VIEW';
  return 'MANUAL REGION';
}

function getFreshnessColor(iso: string | null | undefined): string {
  if (!iso) return TACTICAL.textMuted;
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  if (diffDays < 7) return '#66BB6A';
  if (diffDays < 30) return '#FFB300';
  return '#EF5350';
}

function getLevelColor(level: string): string {
  switch (level) {
    case 'ok': return '#66BB6A';
    case 'warning': return '#FFB300';
    case 'critical': return '#FF7043';
    case 'exceeded': return '#EF5350';
    default: return TACTICAL.textMuted;
  }
}

// ── Animated Progress Bar ───────────────────────────────

function TacticalProgressBar({ percent, color = TACTICAL.amber, height = 6, animated = true }: {
  percent: number; color?: string; height?: number; animated?: boolean;
}) {
  const animValue = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.timing(animValue, {
      toValue: Math.min(percent, 100),
      duration: animated ? 400 : 0,
      useNativeDriver: false,
    }).start();
  }, [animValue, percent, animated]);

  useEffect(() => {
    if (percent > 0 && percent < 100) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: false }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [percent, pulseAnim]);

  const width = animValue.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[progressStyles.bg, { height }]}>
      {/* Track marks */}
      <View style={progressStyles.trackMarks}>
        {[25, 50, 75].map(mark => (
          <View key={mark} style={[progressStyles.trackMark, { left: `${mark}%` }]} />
        ))}
      </View>
      {/* Fill */}
      <Animated.View style={[
        progressStyles.fill,
        { width, backgroundColor: color, height, opacity: pulseAnim },
      ]} />
      {/* Glow overlay at leading edge */}
      {percent > 0 && percent < 100 && (
        <Animated.View style={[
          progressStyles.glowEdge,
          { left: width, opacity: pulseAnim },
        ]} />
      )}
    </View>
  );
}

const progressStyles = StyleSheet.create({
  bg: {
    backgroundColor: 'rgba(62,79,60,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  trackMarks: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
  },
  trackMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(62,79,60,0.3)',
  },
  fill: {
    borderRadius: 3,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  glowEdge: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    width: 8,
    marginLeft: -4,
    borderRadius: 4,
    backgroundColor: 'rgba(196,138,44,0.4)',
  },
});

// ── Main Component ──────────────────────────────────────

export default function OfflineCacheModal({
  visible = false,
  onClose,
  embedded = false,   // ✅ ADD THIS
  mapBounds,
  mapZoom,
  mapStyle: currentMapStyle,
  showToast,
  onRequestMapBounds,
  onOpenDownloadedSync,
}: Props) {
  // ── Safe sheet layout — responsive height + safe-area padding ──
  const { sheetMaxHeight, contentBottomPadding, safeBottom } = useSheetLayout({
    maxFraction: 0.88,
    minFraction: 0.55,
  });

  // ── State ─────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<TabKey>('cache');
  const [regions, setRegions] = useState<TileCacheRegion[]>([]);
  const [offlineRoutes, setOfflineRoutes] = useState<OfflineCachedRoute[]>([]);
  const [stats, setStats] = useState<TileCacheStats>({
    totalRegions: 0, totalTiles: 0, downloadedTiles: 0,
    totalSizeMB: 0, lastDownloadAt: null,
    storageQuotaMB: null, storageUsedMB: null,
  });
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null);
  const [syncSnapshot, setSyncSnapshot] = useState<OfflineTileSyncSnapshot>(
    () => offlineTileSyncCoordinator.getSnapshot(),
  );
  const [isOnline, setIsOnline] = useState(true);

  // Cache config
  const [cacheZoomMin, setCacheZoomMin] = useState(8);
  const [cacheZoomMax, setCacheZoomMax] = useState(14);
  const [cacheStyleKey, setCacheStyleKey] = useState(currentMapStyle || 'tactical');
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Freshness checking
  const [checkingRegionIds, setCheckingRegionIds] = useState<Set<string>>(new Set());

  // RegionSelector state
  const [showRouteSelector, setShowRouteSelector] = useState(false);

  // Cleanup state
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<CleanupResult | null>(null);
  const [deviceStorage, setDeviceStorage] = useState<{ totalMB: number; freeMB: number } | null>(null);
  const surfaceVisible = embedded || visible;


  // ── Connectivity ──────────────────────────────────────
  useEffect(() => {
    if (!surfaceVisible) return;
    setIsOnline(connectivity.isOnline());
    const unsub = connectivity.onStatusChange((status) => {
      setIsOnline(status === 'online');
    });
    connectivity.startMonitoring();
    return () => { unsub(); };
  }, [surfaceVisible]);

  // ── Load data ─────────────────────────────────────────
  const refreshData = useCallback(async () => {
    const r = tileCacheStore.getRegions();
    setRegions(r);
    setQuotaStatus(tileCacheStore.getQuotaStatus());
    try {
      const routes = await listOfflineCachedRoutes();
      setOfflineRoutes(routes);
    } catch {
      setOfflineRoutes([]);
    }
    try {
      const s = await tileCacheStore.getStatsWithStorage();
      setStats(s);
    } catch {
      setStats(tileCacheStore.getStats());
    }
  }, []);

  useEffect(() => {
    if (!surfaceVisible) return;
    refreshData();
    const unsub = tileCacheStore.subscribe(refreshData);
    return unsub;
  }, [surfaceVisible, refreshData]);

  useEffect(() => {
    setSyncSnapshot(offlineTileSyncCoordinator.getSnapshot());
    const unsubscribe = offlineTileSyncCoordinator.subscribe(() => {
      setSyncSnapshot(offlineTileSyncCoordinator.getSnapshot());
    });
    return unsubscribe;
  }, []);

  // Sync style key with map
  useEffect(() => {
    if (surfaceVisible && currentMapStyle) setCacheStyleKey(currentMapStyle);
  }, [surfaceVisible, currentMapStyle]);

  // ── Tile estimates ────────────────────────────────────
  const viewTileEstimate = useMemo(() => {
    if (!mapBounds) return { count: 0, sizeMB: 0 };
    const count = countTilesForRegion(mapBounds, cacheZoomMin, cacheZoomMax);
    const sizeMB = estimateSizeMB(count, cacheStyleKey);
    return { count, sizeMB };
  }, [mapBounds, cacheZoomMin, cacheZoomMax, cacheStyleKey]);

  const breakdown = useMemo(() => {
    if (!mapBounds) return [];
    return getTileBreakdown(mapBounds, cacheZoomMin, cacheZoomMax);
  }, [mapBounds, cacheZoomMin, cacheZoomMax]);

  const quotaCheck = useMemo(() => {
    if (!viewTileEstimate.sizeMB) return null;
    return tileCacheStore.checkQuotaBeforeDownload(viewTileEstimate.sizeMB);
  }, [viewTileEstimate.sizeMB]);

  // ── Bounds display ────────────────────────────────────
  const boundsDisplay = useMemo(() => {
    if (!mapBounds) return null;
    const latSpan = Math.abs(mapBounds.maxLat - mapBounds.minLat);
    const lngSpan = Math.abs(mapBounds.maxLng - mapBounds.minLng);
    const centerLat = ((mapBounds.maxLat + mapBounds.minLat) / 2).toFixed(4);
    const centerLng = ((mapBounds.maxLng + mapBounds.minLng) / 2).toFixed(4);
    return {
      latSpan: latSpan.toFixed(2),
      lngSpan: lngSpan.toFixed(2),
      center: `${centerLat}, ${centerLng}`,
      area: `${latSpan.toFixed(2)}\u00B0 \u00D7 ${lngSpan.toFixed(2)}\u00B0`,
    };
  }, [mapBounds]);

  // ── Download management ───────────────────────────────
  const startDownload = useCallback((regionId: string, source: OfflineTileSyncSource = 'manual-region') => {
    if (!isOnline) {
      showToast('CANNOT DOWNLOAD \u2014 NO NETWORK');
      return;
    }
    showToast('DOWNLOAD STARTED');
    void offlineTileSyncCoordinator.startRegionSync({ regionId, source });
    refreshData();
  }, [showToast, refreshData, isOnline]);

  // ── Cache Current View ────────────────────────────────
  const handleCacheCurrentView = useCallback(() => {
    if (!mapBounds) {
      onRequestMapBounds?.();
      showToast('GETTING MAP BOUNDS...');
      return;
    }
    if (viewTileEstimate.count === 0) { showToast('NO TILES IN CURRENT VIEW'); return; }
    if (viewTileEstimate.count > 100000) { showToast('TOO MANY TILES \u2014 ZOOM IN OR REDUCE RANGE'); return; }
    if (!isOnline) { showToast('CANNOT DOWNLOAD \u2014 NO NETWORK'); return; }
    if (quotaCheck && !quotaCheck.canProceed) { showToast(`QUOTA EXCEEDED \u2014 ${quotaCheck.message}`); return; }

    const region = tileCacheStore.createFromBounds(
      `Map View \u2014 Z${cacheZoomMin}-${cacheZoomMax}`,
      mapBounds,
      cacheZoomMin,
      cacheZoomMax,
      cacheStyleKey
    );
    showToast(`REGION CREATED: ${region.tileCount.toLocaleString()} TILES`);
    refreshData();
    startDownload(region.id, 'current-view');
  }, [mapBounds, viewTileEstimate, cacheZoomMin, cacheZoomMax, cacheStyleKey, isOnline, showToast, refreshData, startDownload, onRequestMapBounds, quotaCheck]);

  // ── Region actions ────────────────────────────────────
  const handleResume = useCallback((regionId: string) => startDownload(regionId), [startDownload]);

  const handleCancel = useCallback((regionId: string) => {
    offlineTileSyncCoordinator.cancelRegion(regionId);
    showToast('DOWNLOAD CANCELLED');
    refreshData();
  }, [showToast, refreshData]);

  const handleDelete = useCallback((regionId: string) => {
    const doDelete = async () => {
      await tileCacheStore.deleteRegion(regionId);
      showToast('REGION DELETED');
      refreshData();
    };
    if (Platform.OS === 'web') { if (confirm('Delete this cached region?')) doDelete(); }
    else { Alert.alert('Delete Region', 'Remove this cached region and all tiles?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: doDelete },
    ]); }
  }, [showToast, refreshData]);

  const handleDeleteDownloadedSync = useCallback((item: DownloadedSyncCard) => {
    const doDelete = async () => {
      if (item.kind === 'route') {
        await removeOfflineCachedRoute(item.route.id);
        if (item.route.offlineTileRegionId) {
          await tileCacheStore.deleteRegion(item.route.offlineTileRegionId).catch(() => {});
        }
        showToast('OFFLINE ROUTE REMOVED');
      } else {
        await tileCacheStore.deleteRegion(item.regionItem.id);
        showToast('DOWNLOADED SYNC REMOVED');
      }
      refreshData();
    };
    if (Platform.OS === 'web') {
      if (confirm('Remove this downloaded sync?')) doDelete();
    } else {
      Alert.alert('Remove Downloaded Sync', 'Remove this offline item and cached tiles?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [refreshData, showToast]);

  const handleCheckFreshness = useCallback(async (regionId: string) => {
    if (!isOnline) { showToast('CANNOT CHECK \u2014 NO NETWORK'); return; }
    setCheckingRegionIds(prev => new Set(prev).add(regionId));
    try {
      const result = await tileCacheStore.checkRegionFreshness(regionId);
      refreshData();
      if (result.status === 'fresh') showToast('TILES ARE UP TO DATE');
      else if (result.status === 'update-available') showToast(`UPDATE AVAILABLE \u2014 ~${result.changePercent}% CHANGED`);
      else showToast('FRESHNESS CHECK FAILED');
    } catch { showToast('FRESHNESS CHECK ERROR'); }
    setCheckingRegionIds(prev => { const next = new Set(prev); next.delete(regionId); return next; });
  }, [isOnline, showToast, refreshData]);

  const handleOpenDownloadedSync = useCallback((item: DownloadedSyncCard) => {
    if (!onOpenDownloadedSync) {
      showToast(`${item.kind === 'route' ? 'OFFLINE ROUTE' : 'OFFLINE SYNC'}: ${item.title}`);
      return;
    }

    void onOpenDownloadedSync(
      item.kind === 'route'
        ? { kind: 'route', route: item.route }
        : { kind: 'region', region: item.regionItem },
    );
  }, [onOpenDownloadedSync, showToast]);

  const handleClearAll = useCallback(() => {
    const doClear = () => {
      tileCacheStore.clearAll();
      showToast('ALL CACHED TILES CLEARED');
      refreshData();
    };
    if (Platform.OS === 'web') { if (confirm('Delete ALL cached regions? This cannot be undone.')) doClear(); }
    else { Alert.alert('Clear All Cache', 'Delete all cached regions and tiles?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear All', style: 'destructive', onPress: doClear },
    ]); }
  }, [showToast, refreshData]);

  // ── RegionSelector handlers ───────────────────────────

  // ── RegionSelector handlers ───────────────────────────
  const handleCreateFromRoute = useCallback((
    name: string,
    points: { lat: number; lng: number }[],
    corridorMiles: number,
    zoomMin: number,
    zoomMax: number,
    styleKey: string
  ) => {

    try {
      const bounds = computeRouteCorridor(points, corridorMiles);
      if (!bounds) {
        showToast('FAILED TO COMPUTE ROUTE CORRIDOR');
        return;
      }
      const region = tileCacheStore.createFromBounds(name, bounds, zoomMin, zoomMax, styleKey);
      showToast(`ROUTE CORRIDOR: ${region.tileCount.toLocaleString()} TILES`);
      setShowRouteSelector(false);
      refreshData();
      startDownload(region.id, 'route-corridor');
    } catch (e: any) {
      showToast(e?.message || 'FAILED TO CREATE REGION');
    }
  }, [showToast, refreshData, startDownload]);

  const handleCreateFromBounds = useCallback((
    name: string,
    bounds: TileBounds,
    zoomMin: number,
    zoomMax: number,
    styleKey: string
  ) => {
    if (!isOnline) { showToast('CANNOT DOWNLOAD \u2014 NO NETWORK'); return; }
    try {
      const region = tileCacheStore.createFromBounds(name, bounds, zoomMin, zoomMax, styleKey);
      showToast(`REGION CREATED: ${region.tileCount.toLocaleString()} TILES`);
      setShowRouteSelector(false);
      refreshData();
      startDownload(region.id, 'manual-region');
    } catch (e: any) {
      showToast(e?.message || 'FAILED TO CREATE REGION');
    }
  }, [isOnline, showToast, refreshData, startDownload]);


  // ── Cleanup handlers ──────────────────────────────────
  const handleQuickCleanup = useCallback(async () => {
    setIsCleaning(true);
    try {
      const result = await quickCleanup();
      setCleanupResult(result);
      refreshData();
      showToast(result.message || 'CLEANUP COMPLETE');
    } catch {
      showToast('CLEANUP FAILED');
    } finally {
      setIsCleaning(false);
    }
  }, [refreshData, showToast]);

  const loadDeviceStorage = useCallback(async () => {
    try {
      const info = await getDeviceStorageInfo();
      if (info) setDeviceStorage(info);
    } catch {}
  }, []);


  // ── Sorted regions ────────────────────────────────────
  const sortedRegions = useMemo(() => {
    return [...regions].sort((a, b) => {
      if (a.status === 'downloading' && b.status !== 'downloading') return -1;
      if (b.status === 'downloading' && a.status !== 'downloading') return 1;
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (b.status === 'pending' && a.status !== 'pending') return 1;
      return (b.downloadedAt || '').localeCompare(a.downloadedAt || '');
    });
  }, [regions]);

  const completeCount = regions.filter(r => r.status === 'complete').length;
  const downloadingCount = regions.filter(r => r.status === 'downloading').length;
  const completionPercent = stats.totalTiles > 0
    ? Math.round((stats.downloadedTiles / stats.totalTiles) * 100) : 0;

  const quotaLevelColor = quotaStatus ? getLevelColor(quotaStatus.level) : TACTICAL.textMuted;
  const activeProgress = useMemo(() => {
    const progressByRegion = new Map<string, DownloadProgress>();
    syncSnapshot.activeJobs.forEach((job) => {
      if (job.progress) progressByRegion.set(job.regionId, job.progress);
    });
    return progressByRegion;
  }, [syncSnapshot.activeJobs]);
  const isCaching = syncSnapshot.activeJobs.length > 0;
  const activeDownloads = useMemo(() => Array.from(activeProgress.values()), [activeProgress]);
  const primaryDownloadProgress = activeDownloads[0] ?? null;
  const downloadedSyncCards = useMemo<DownloadedSyncCard[]>(() => {
    const regionIdsClaimedByRoutes = new Set(
      offlineRoutes
        .map((route) => route.offlineTileRegionId)
        .filter((id): id is string => !!id),
    );
    const routeCards: DownloadedSyncCard[] = offlineRoutes
      .filter((route) => route.cacheStatus === 'cached')
      .map((route) => {
        const linkedRegion = route.offlineTileRegionId
          ? sortedRegions.find((region) => region.id === route.offlineTileRegionId)
          : null;
        const styleLabel = formatMapStyleLabel(
          route.routeIntent?.mapContext?.styleKey ?? linkedRegion?.styleKey,
        );
        return {
          kind: 'route',
          id: route.id,
          title: route.name,
          region: formatBoundsCenter(route.routeBounds),
          metricPrimary: formatMiles(route.routeDistanceMiles),
          metricSecondary: styleLabel,
          typeLabel: downloadedRouteTypeLabel(route),
          guidanceLabel:
            route.routeIntent?.destination?.label
              ? `Opens road preview to ${route.routeIntent.destination.label}`
              : route.runDetail?.buildSnapshot?.vehicle_name
                ? `${route.runDetail.buildSnapshot.vehicle_name} guidance`
                : 'Route guidance ready',
          cachedLabel: route.remoteCache?.enabled
            ? formatRemoteCacheLastVerified(route.remoteCache.lastUpdated)
            : formatAge(route.cachedAt),
          statusLabel: route.tileCacheStatus === 'complete' ? 'OFFLINE READY' : 'ROUTE SAVED',
          tone: 'route',
          route,
        };
      });

    const regionCards: DownloadedSyncCard[] = sortedRegions
      .filter((region) => region.status === 'complete' && !regionIdsClaimedByRoutes.has(region.id))
      .map((region) => ({
        kind: 'region',
        id: region.id,
        title: region.name,
        region: formatBoundsCenter(region.bounds),
        metricPrimary: formatBoundsArea(region.bounds),
        metricSecondary: `${region.downloadedTiles.toLocaleString()} tiles`,
        typeLabel: regionSourceLabel(region.sourceType),
        guidanceLabel: `Z${region.zoomMin}-${region.zoomMax} ${formatMapStyleLabel(region.styleKey)}`,
        cachedLabel: formatAge(region.completedAt || region.downloadedAt),
        statusLabel: 'SAVED',
        tone: 'region',
        regionItem: region,
      }));

    return [...routeCards, ...regionCards].sort((a, b) => {
      const aDate = a.kind === 'route' ? a.route.cachedAt : a.regionItem.completedAt || a.regionItem.downloadedAt;
      const bDate = b.kind === 'route' ? b.route.cachedAt : b.regionItem.completedAt || b.regionItem.downloadedAt;
      return bDate.localeCompare(aDate);
    });
  }, [offlineRoutes, sortedRegions]);

  const renderDownloadedSyncsSection = useCallback((compact = false) => (
    <View style={[styles.downloadedSyncsSection, compact && styles.downloadedSyncsSectionCompact]}>
      <View style={styles.downloadedSyncsHeader}>
        <View>
          <Text style={styles.downloadedSyncsEyebrow}>OFFLINE LIBRARY</Text>
          <Text style={styles.downloadedSyncsTitle}>Downloaded Syncs</Text>
        </View>
        <View style={styles.downloadedSyncsCountBadge}>
          <Text style={styles.downloadedSyncsCountText}>{downloadedSyncCards.length}</Text>
        </View>
      </View>

      {downloadedSyncCards.length === 0 ? (
        <View style={styles.downloadedSyncsEmptyCard}>
          <Ionicons name="map-outline" size={18} color={TACTICAL.textMuted} />
          <View style={styles.downloadedSyncsEmptyCopy}>
            <Text style={styles.downloadedSyncsEmptyTitle}>No offline routes saved yet.</Text>
            <Text style={styles.downloadedSyncsEmptyText}>
              Synced map views and saved offline routes will appear here after they finish downloading.
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.downloadedSyncsList}>
          {downloadedSyncCards.map((item) => {
            const accentColor = item.tone === 'route' ? TACTICAL.amber : '#66BB6A';
            return (
              <View key={`${item.kind}:${item.id}`} style={styles.downloadedSyncCard}>
                <View style={styles.downloadedSyncAccentBar}>
                  <View style={[styles.downloadedSyncAccentTop, { backgroundColor: accentColor }]} />
                  <View style={styles.downloadedSyncAccentBottom} />
                </View>

                <View style={styles.downloadedSyncCardBody}>
                  <View style={styles.downloadedSyncBadgeRow}>
                    <View
                      style={[
                        styles.downloadedSyncTypeBadge,
                        { borderColor: `${accentColor}50`, backgroundColor: `${accentColor}14` },
                      ]}
                    >
                      <Ionicons
                        name={item.kind === 'route' ? 'navigate-outline' : 'layers-outline'}
                        size={9}
                        color={accentColor}
                      />
                      <Text style={[styles.downloadedSyncTypeText, { color: accentColor }]}>
                        {item.typeLabel}
                      </Text>
                    </View>
                    <View style={styles.downloadedSyncStatusBadge}>
                      <Text style={styles.downloadedSyncStatusText}>{item.statusLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.downloadedSyncNameBlock}>
                    <Text style={styles.downloadedSyncName} numberOfLines={2}>
                      {item.title}
                    </Text>
                    <Text style={styles.downloadedSyncRegion} numberOfLines={1}>
                      {item.region}
                    </Text>
                  </View>

                  <View style={styles.downloadedSyncStatsRow}>
                    <View style={styles.downloadedSyncStatItem}>
                      <Ionicons name="resize-outline" size={10} color={TACTICAL.amber} />
                      <Text style={styles.downloadedSyncStatValue}>{item.metricPrimary}</Text>
                    </View>
                    <View style={styles.downloadedSyncStatItem}>
                      <Ionicons name="file-tray-full-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={styles.downloadedSyncStatValue}>{item.metricSecondary}</Text>
                    </View>
                    <View style={styles.downloadedSyncStatItem}>
                      <Ionicons name="time-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={styles.downloadedSyncStatValue}>{item.cachedLabel}</Text>
                    </View>
                  </View>

                  <View style={styles.downloadedSyncChipRow}>
                    <View style={styles.downloadedSyncChip}>
                      <Text style={styles.downloadedSyncChipText}>{item.guidanceLabel}</Text>
                    </View>
                    <View style={styles.downloadedSyncChip}>
                      <Text style={styles.downloadedSyncChipText}>
                        {item.kind === 'route' ? 'ROUTE DETAIL' : 'MAP TILES'}
                      </Text>
                    </View>
                    {item.kind === 'route' && item.route.remoteCache?.enabled ? (
                      <View style={styles.downloadedSyncChip}>
                        <Text style={styles.downloadedSyncChipText}>
                          REMOTE {formatRemoteCacheSize(item.route.remoteCache.estimatedBytes)}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  <View style={styles.downloadedSyncActionRow}>
                    <TouchableOpacity
                      style={styles.downloadedSyncActionBtn}
                      activeOpacity={0.78}
                      onPress={() => handleOpenDownloadedSync(item)}
                    >
                      <Ionicons name="open-outline" size={11} color={TACTICAL.amber} />
                      <Text style={styles.downloadedSyncActionText}>OPEN</Text>
                    </TouchableOpacity>
                    {item.kind === 'region' ? (
                      <TouchableOpacity
                        style={styles.downloadedSyncActionBtn}
                        activeOpacity={0.78}
                        onPress={() => handleCheckFreshness(item.regionItem.id)}
                      >
                        <Ionicons name="refresh-outline" size={11} color={TACTICAL.textMuted} />
                        <Text style={styles.downloadedSyncActionTextMuted}>REFRESH</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={[styles.downloadedSyncActionBtn, styles.downloadedSyncDeleteBtn]}
                      activeOpacity={0.78}
                      onPress={() => handleDeleteDownloadedSync(item)}
                    >
                      <Ionicons name="trash-outline" size={11} color="#EF5350" />
                      <Text style={styles.downloadedSyncDeleteText}>DELETE</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  ), [downloadedSyncCards, handleCheckFreshness, handleDeleteDownloadedSync, handleOpenDownloadedSync]);

  if (!embedded && !visible) return null;

  if (embedded) {
    return (
      <View style={styles.embeddedShell}>
        <View style={styles.embeddedHero}>
          <View style={styles.embeddedHeroCopy}>
            <Text style={styles.embeddedEyebrow}>OFFLINE MAP READY</Text>
            <Text style={styles.embeddedTitle}>
              {mapBounds ? 'Sync the current map view for offline use.' : 'Choose a map area to prepare offline.'}
            </Text>
            <Text style={styles.embeddedBody}>
              {mapBounds
                ? `Current view will cache ${viewTileEstimate.count.toLocaleString()} tiles at approximately ${formatSize(viewTileEstimate.sizeMB)}.`
                : 'Pan or zoom the map first, then sync the area you want available without service.'}
            </Text>
          </View>

          <View style={styles.embeddedStatusChipRow}>
            <View
              style={[
                styles.embeddedStatusChip,
                isOnline ? styles.embeddedStatusChipOnline : styles.embeddedStatusChipOffline,
              ]}
            >
              <Ionicons
                name={isOnline ? 'cloud-done-outline' : 'cloud-offline-outline'}
                size={12}
                color={isOnline ? '#66BB6A' : '#EF5350'}
              />
              <Text
                style={[
                  styles.embeddedStatusChipText,
                  { color: isOnline ? '#66BB6A' : '#EF5350' },
                ]}
              >
                {isOnline ? 'ONLINE' : 'OFFLINE'}
              </Text>
            </View>

            {!!downloadingCount && (
              <View style={styles.embeddedStatusChip}>
                <Ionicons name="download-outline" size={12} color={TACTICAL.amber} />
                <Text style={styles.embeddedStatusChipText}>{downloadingCount} ACTIVE</Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.embeddedSummaryRow}>
          <View style={styles.embeddedSummaryCard}>
            <Text style={styles.embeddedSummaryLabel}>AREA</Text>
            <Text style={styles.embeddedSummaryValue}>
              {boundsDisplay?.area ?? 'Map view required'}
            </Text>
          </View>
          <View style={styles.embeddedSummaryCard}>
            <Text style={styles.embeddedSummaryLabel}>CACHE</Text>
            <Text style={styles.embeddedSummaryValue}>{formatSize(stats.totalSizeMB)}</Text>
          </View>
          <View style={styles.embeddedSummaryCard}>
            <Text style={styles.embeddedSummaryLabel}>REGIONS</Text>
            <Text style={styles.embeddedSummaryValue}>{stats.totalRegions}</Text>
          </View>
        </View>

        {primaryDownloadProgress ? (
          <View style={styles.embeddedDownloadCard}>
            <View style={styles.embeddedDownloadHeader}>
              <Text style={styles.embeddedDownloadTitle}>Sync in progress</Text>
              <Text style={styles.embeddedDownloadPercent}>
                {Math.round(primaryDownloadProgress.percent)}%
              </Text>
            </View>
            <TacticalProgressBar percent={primaryDownloadProgress.percent} />
            <View style={styles.embeddedDownloadMetaRow}>
              <Text style={styles.embeddedDownloadMeta}>
                {primaryDownloadProgress.downloadedTiles.toLocaleString()} /{' '}
                {primaryDownloadProgress.totalTiles.toLocaleString()} tiles
              {primaryDownloadProgress.eta
                ? ` • ${formatETA(primaryDownloadProgress.eta)} left`
                : ''}
              </Text>
              <TouchableOpacity
                style={styles.embeddedCancelButton}
                onPress={() => handleCancel(primaryDownloadProgress.regionId)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel="Cancel offline sync"
              >
                <Text style={styles.embeddedCancelButtonText}>CANCEL</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {quotaCheck?.canProceed === false ? (
          <View style={styles.embeddedNoteCard}>
            <Ionicons name="warning-outline" size={14} color="#FFB300" />
            <Text style={styles.embeddedNoteText}>{quotaCheck.message}</Text>
          </View>
        ) : (
          <View style={styles.embeddedNoteCard}>
            <Ionicons
              name={mapBounds ? 'download-outline' : 'map-outline'}
              size={14}
              color={TACTICAL.amber}
            />
            <Text style={styles.embeddedNoteText}>
              {mapBounds
                ? 'Use sync to keep the visible route area ready when service drops.'
                : 'Map sync becomes available as soon as the current view bounds are captured.'}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.embeddedPrimaryButton,
            (!mapBounds || !isOnline || isCaching || (quotaCheck?.canProceed === false)) &&
              styles.embeddedPrimaryButtonDisabled,
          ]}
          onPress={handleCacheCurrentView}
          activeOpacity={0.85}
          disabled={!mapBounds || !isOnline || isCaching || quotaCheck?.canProceed === false}
        >
          {isCaching ? (
            <ActivityIndicator size="small" color="#091014" />
          ) : (
            <Ionicons name="cloud-download-outline" size={16} color="#091014" />
          )}
          <Text style={styles.embeddedPrimaryButtonText}>
            {isCaching ? 'SYNCING CURRENT VIEW' : 'SYNC CURRENT VIEW'}
          </Text>
        </TouchableOpacity>

        {renderDownloadedSyncsSection(true)}
      </View>
    );
  }

  const content = (
    <>
      {/* ═══════ COMPACT STATS BAR ═══════ */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{stats.totalRegions}</Text>
          <Text style={styles.statLabel}>REGIONS</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {stats.downloadedTiles >= 1000
              ? `${(stats.downloadedTiles / 1000).toFixed(1)}K`
              : stats.downloadedTiles}
          </Text>
          <Text style={styles.statLabel}>TILES</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{formatSize(stats.totalSizeMB)}</Text>
          <Text style={styles.statLabel}>CACHED</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text
            style={[
              styles.statValue,
              { color: completionPercent >= 100 ? '#66BB6A' : TACTICAL.text },
            ]}
          >
            {completionPercent}%
          </Text>
          <Text style={styles.statLabel}>COMPLETE</Text>
        </View>
      </View>

      {/* ═══════ QUOTA BAR ═══════ */}
      {quotaStatus && (
        <View style={styles.quotaRow}>
          <View
            style={[styles.quotaLevelDot, { backgroundColor: quotaLevelColor }]}
          />
          <Text style={[styles.quotaText, { color: quotaLevelColor }]}>
            {formatSize(quotaStatus.usedMB)} /{' '}
            {formatSize(quotaStatus.config.quotaLimitMB)}
          </Text>
          <View style={styles.quotaBarBg}>
            <View
              style={[
                styles.quotaBarFill,
                {
                  width: `${Math.min(100, quotaStatus.usedFraction * 100)}%`,
                  backgroundColor: quotaLevelColor,
                },
              ]}
            />
          </View>
          <Text style={[styles.quotaPercent, { color: quotaLevelColor }]}>
            {Math.round(quotaStatus.usedFraction * 100)}%
          </Text>
        </View>
      )}

      {/* ═══════ TAB BAR ═══════ */}
      <View style={styles.tabBar}>
        {([
          { key: 'cache' as TabKey, label: 'CACHE VIEW', icon: 'scan-outline' },
          {
            key: 'regions' as TabKey,
            label: `REGIONS (${regions.length})`,
            icon: 'layers-outline',
          },
          { key: 'storage' as TabKey, label: 'STORAGE', icon: 'server-outline' },
        ]).map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.tabActive]}
            onPress={() => setActiveTab(tab.key)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={tab.icon as any}
              size={12}
              color={
                activeTab === tab.key ? TACTICAL.amber : TACTICAL.textMuted
              }
            />
            <Text
              style={[styles.tabText, activeTab === tab.key && styles.tabTextActive]}
            >
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ═══════ TAB CONTENT ═══════ */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={[
          styles.contentInner,
          { paddingBottom: contentBottomPadding },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={true}
      >
        {/* ═══════ CACHE VIEW TAB ═══════ */}
        {activeTab === 'cache' && (
          <>
            {/* Region Preview */}
            <View style={styles.regionPreview}>
              <View style={styles.regionPreviewHeader}>
                <Ionicons
                  name="scan-outline"
                  size={13}
                  color={TACTICAL.amber}
                />
                <Text style={styles.regionPreviewTitle}>CURRENT MAP VIEWPORT</Text>
              </View>
              {boundsDisplay ? (
                <View style={styles.boundsGrid}>
                  <View style={styles.boundsRow}>
                    <View style={styles.boundsItem}>
                      <Text style={styles.boundsLabel}>AREA</Text>
                      <Text style={styles.boundsValue}>{boundsDisplay.area}</Text>
                    </View>
                    <View style={styles.boundsItem}>
                      <Text style={styles.boundsLabel}>CENTER</Text>
                      <Text style={styles.boundsValue}>{boundsDisplay.center}</Text>
                    </View>
                  </View>

                  <View style={styles.miniMapContainer}>
                    <View style={styles.miniMap}>
                      <View style={styles.miniMapGrid}>
                        {Array.from({ length: 9 }).map((_, i) => (
                          <View key={i} style={styles.miniMapCell} />
                        ))}
                      </View>
                      <View style={styles.miniMapCenter}>
                        <Ionicons
                          name="locate-outline"
                          size={10}
                          color={TACTICAL.amber}
                        />
                      </View>
                      <Text style={styles.miniMapLabel}>Z{Math.round(mapZoom)}</Text>
                    </View>
                    <View style={styles.miniMapCoords}>
                      <Text style={styles.miniMapCoordText}>
                        N{' '}
                        {typeof mapBounds?.maxLat === 'number'
                          ? mapBounds.maxLat.toFixed(3)
                          : '---'}
                        °
                      </Text>

                      <View style={styles.miniMapCoordsRow}>
                        <Text style={styles.miniMapCoordText}>
                          W{' '}
                          {typeof mapBounds?.minLng === 'number'
                            ? Math.abs(mapBounds.minLng).toFixed(3)
                            : '---'}
                          °
                        </Text>
                        <Text style={styles.miniMapCoordText}>
                          E{' '}
                          {typeof mapBounds?.maxLng === 'number'
                            ? Math.abs(mapBounds.maxLng).toFixed(3)
                            : '---'}
                          °
                        </Text>
                      </View>

                      <Text style={styles.miniMapCoordText}>
                        S{' '}
                        {typeof mapBounds?.minLat === 'number'
                          ? mapBounds.minLat.toFixed(3)
                          : '---'}
                        °
                      </Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.noBoundsState}>
                  <Ionicons
                    name="map-outline"
                    size={20}
                    color={TACTICAL.textMuted}
                  />
                  <Text style={styles.noBoundsText}>
                    Pan/zoom the map to define the cache area
                  </Text>
                  {onRequestMapBounds && (
                    <TouchableOpacity
                      style={styles.getBoundsBtn}
                      onPress={onRequestMapBounds}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="refresh-outline"
                        size={12}
                        color={TACTICAL.amber}
                      />
                      <Text style={styles.getBoundsBtnText}>GET MAP BOUNDS</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>

            {/* Zoom Level Selection */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="search-outline"
                  size={12}
                  color={TACTICAL.amber}
                />
                <Text style={styles.sectionTitle}>ZOOM LEVELS</Text>
              </View>
              <View style={styles.zoomPresets}>
                {ZOOM_PRESETS.map((preset) => {
                  const isActive =
                    cacheZoomMin === preset.min && cacheZoomMax === preset.max;
                  return (
                    <TouchableOpacity
                      key={preset.label}
                      style={[styles.zoomChip, isActive && styles.zoomChipActive]}
                      onPress={() => {
                        setCacheZoomMin(preset.min);
                        setCacheZoomMax(preset.max);
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={preset.icon as any}
                        size={11}
                        color={
                          isActive ? TACTICAL.amber : TACTICAL.textMuted
                        }
                      />
                      <Text
                        style={[
                          styles.zoomChipLabel,
                          isActive && styles.zoomChipLabelActive,
                        ]}
                      >
                        {preset.label}
                      </Text>
                      <Text style={styles.zoomChipRange}>
                        Z{preset.min}-{preset.max}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.zoomSteppers}>
                <View style={styles.stepper}>
                  <Text style={styles.stepperLabel}>MIN</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() =>
                      setCacheZoomMin(Math.max(1, cacheZoomMin - 1))
                    }
                  >
                    <Ionicons name="remove" size={12} color={TACTICAL.text} />
                  </TouchableOpacity>
                  <Text style={styles.stepValue}>{cacheZoomMin}</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() =>
                      setCacheZoomMin(Math.min(cacheZoomMax - 1, cacheZoomMin + 1))
                    }
                  >
                    <Ionicons name="add" size={12} color={TACTICAL.text} />
                  </TouchableOpacity>
                </View>
                <View style={styles.stepperDash}>
                  <Text style={styles.stepperDashText}>—</Text>
                </View>
                <View style={styles.stepper}>
                  <Text style={styles.stepperLabel}>MAX</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() =>
                      setCacheZoomMax(Math.max(cacheZoomMin + 1, cacheZoomMax - 1))
                    }
                  >
                    <Ionicons name="remove" size={12} color={TACTICAL.text} />
                  </TouchableOpacity>
                  <Text style={styles.stepValue}>{cacheZoomMax}</Text>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() =>
                      setCacheZoomMax(Math.min(18, cacheZoomMax + 1))
                    }
                  >
                    <Ionicons name="add" size={12} color={TACTICAL.text} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Map Style Selection */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="color-palette-outline"
                  size={12}
                  color={TACTICAL.amber}
                />
                <Text style={styles.sectionTitle}>TILE SOURCE</Text>
              </View>
              <View style={styles.styleRow}>
                {STYLE_OPTIONS.map((opt) => {
                  const isActive = cacheStyleKey === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.styleChip, isActive && styles.styleChipActive]}
                      onPress={() => setCacheStyleKey(opt.key)}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={opt.icon as any}
                        size={13}
                        color={
                          isActive ? TACTICAL.amber : TACTICAL.textMuted
                        }
                      />
                      <Text
                        style={[
                          styles.styleChipText,
                          isActive && styles.styleChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Tile Estimate Panel */}
            {mapBounds && viewTileEstimate.count > 0 && (
              <View style={styles.estimatePanel}>
                <View style={styles.estimateKPIs}>
                  <View style={styles.estimateKPI}>
                    <Text style={styles.estimateKPIValue}>
                      {viewTileEstimate.count >= 1000
                        ? `${(viewTileEstimate.count / 1000).toFixed(1)}K`
                        : viewTileEstimate.count}
                    </Text>
                    <Text style={styles.estimateKPILabel}>TILES</Text>
                  </View>
                  <View style={styles.estimateKPIDivider} />
                  <View style={styles.estimateKPI}>
                    <Text style={styles.estimateKPIValue}>
                      ~{formatSize(viewTileEstimate.sizeMB)}
                    </Text>
                    <Text style={styles.estimateKPILabel}>EST. SIZE</Text>
                  </View>
                  <View style={styles.estimateKPIDivider} />
                  <View style={styles.estimateKPI}>
                    <Text style={styles.estimateKPIValue}>
                      {cacheZoomMax - cacheZoomMin + 1}
                    </Text>
                    <Text style={styles.estimateKPILabel}>ZOOM LVLS</Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.breakdownToggle}
                  onPress={() => setShowBreakdown(!showBreakdown)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.breakdownToggleText}>
                    {showBreakdown ? 'HIDE' : 'SHOW'} ZOOM BREAKDOWN
                  </Text>
                  <Ionicons
                    name={showBreakdown ? 'chevron-up' : 'chevron-down'}
                    size={12}
                    color={TACTICAL.textMuted}
                  />
                </TouchableOpacity>

                {showBreakdown && breakdown.length > 0 && (
                  <View style={styles.breakdownList}>
                    {breakdown.map((item) => {
                      const maxTiles = Math.max(...breakdown.map((b) => b.tiles));
                      return (
                        <View key={item.zoom} style={styles.breakdownRow}>
                          <Text style={styles.breakdownZoom}>Z{item.zoom}</Text>
                          <View style={styles.breakdownBarBg}>
                            <View
                              style={[
                                styles.breakdownBarFill,
                                {
                                  width: `${Math.max(
                                    2,
                                    (item.tiles / maxTiles) * 100
                                  )}%`,
                                },
                              ]}
                            />
                          </View>
                          <Text style={styles.breakdownTiles}>
                            {item.tiles.toLocaleString()}
                          </Text>
                          <Text style={styles.breakdownSize}>
                            {item.sizeMB} MB
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}

                {viewTileEstimate.count > 50000 &&
                  viewTileEstimate.count <= 100000 && (
                    <View style={styles.warningBanner}>
                      <Ionicons
                        name="warning-outline"
                        size={11}
                        color="#FFB300"
                      />
                      <Text style={styles.warningText}>
                        Large download. Consider reducing zoom range.
                      </Text>
                    </View>
                  )}

                {viewTileEstimate.count > 100000 && (
                  <View style={styles.errorBanner}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={11}
                      color="#EF5350"
                    />
                    <Text style={styles.errorText}>
                      Too many tiles. Max 100K. Reduce zoom or area.
                    </Text>
                  </View>
                )}

                {quotaCheck && !quotaCheck.canProceed && (
                  <View style={styles.errorBanner}>
                    <Ionicons
                      name="alert-circle-outline"
                      size={11}
                      color="#EF5350"
                    />
                    <Text style={styles.errorText}>
                      Over quota. Free space or increase limit.
                    </Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[
                styles.downloadBtn,
                (!mapBounds ||
                  !isOnline ||
                  viewTileEstimate.count === 0 ||
                  viewTileEstimate.count > 100000 ||
                  isCaching) &&
                  styles.downloadBtnDisabled,
              ]}
              onPress={handleCacheCurrentView}
              activeOpacity={0.8}
              disabled={
                !mapBounds ||
                !isOnline ||
                viewTileEstimate.count === 0 ||
                viewTileEstimate.count > 100000 ||
                isCaching
              }
            >
              {isCaching ? (
                <ActivityIndicator size="small" color="#0B0F12" />
              ) : (
                <Ionicons name="download-outline" size={16} color="#0B0F12" />
              )}
              <Text style={styles.downloadBtnText}>
                {isCaching
                  ? 'CACHING...'
                  : !mapBounds
                  ? 'WAITING FOR MAP BOUNDS'
                  : !isOnline
                  ? 'OFFLINE — NO NETWORK'
                  : viewTileEstimate.count > 100000
                  ? 'TOO MANY TILES'
                  : `CACHE ${
                      viewTileEstimate.count > 0
                        ? viewTileEstimate.count.toLocaleString() + ' TILES'
                        : 'VIEW'
                    }`}
              </Text>
            </TouchableOpacity>

            {renderDownloadedSyncsSection()}

            {downloadingCount > 0 && (
              <View style={styles.activeDownloadsSection}>
                <Text style={styles.sectionLabel}>ACTIVE DOWNLOADS</Text>
                {sortedRegions
                  .filter((r) => r.status === 'downloading')
                  .map((region) => {
                    const progress = activeProgress.get(region.id);
                    const dlPercent = progress
                      ? progress.percent
                      : region.tileCount > 0
                      ? Math.round(
                          (region.downloadedTiles / region.tileCount) * 100
                        )
                      : 0;

                    return (
                      <View key={region.id} style={styles.downloadCard}>
                        <View style={styles.downloadCardHeader}>
                          <Text
                            style={styles.downloadCardName}
                            numberOfLines={1}
                          >
                            {region.name}
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleCancel(region.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Ionicons
                              name="pause"
                              size={12}
                              color="#FFB300"
                            />
                          </TouchableOpacity>
                        </View>
                        <TacticalProgressBar percent={dlPercent} />
                        <View style={styles.downloadCardMeta}>
                          <Text style={styles.downloadPercent}>{dlPercent}%</Text>
                          {progress && progress.speed > 0 && (
                            <Text style={styles.downloadSpeed}>
                              {progress.speed} t/s
                            </Text>
                          )}
                          {progress && progress.eta > 0 && (
                            <Text style={styles.downloadETA}>
                              ETA {formatETA(progress.eta)}
                            </Text>
                          )}
                          {progress && (
                            <Text style={styles.downloadSize}>
                              {formatSize(progress.downloadedSizeMB)} / ~
                              {formatSize(progress.estimatedSizeMB)}
                            </Text>
                          )}
                        </View>
                      </View>
                    );
                  })}
              </View>
            )}
          </>
        )}

        {/* ═══════ REGIONS TAB ═══════ */}
        {activeTab === 'regions' && (
          <>
            {sortedRegions.length > 0 ? (
              <>
                <View style={styles.regionSummary}>
                  {completeCount > 0 && (
                    <View style={styles.readyBadge}>
                      <Ionicons
                        name="checkmark-circle"
                        size={10}
                        color="#66BB6A"
                      />
                      <Text style={styles.readyText}>{completeCount} READY</Text>
                    </View>
                  )}
                  {regions.length > 0 && (
                    <TouchableOpacity
                      style={styles.clearAllBtn}
                      onPress={handleClearAll}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={10}
                        color="#EF5350"
                      />
                      <Text style={styles.clearAllText}>CLEAR ALL</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {sortedRegions.map((region) => {
                  const statusColor =
                    region.status === 'complete'
                      ? '#66BB6A'
                      : region.status === 'error'
                      ? '#EF5350'
                      : region.status === 'downloading'
                      ? '#FFB300'
                      : region.status === 'partial'
                      ? '#FF7043'
                      : TACTICAL.textMuted;

                  const actualSize =
                    region.actualSizeMB > 0
                      ? region.actualSizeMB
                      : region.estimatedSizeMB;

                  const progress = activeProgress.get(region.id);
                  const isDownloading = region.status === 'downloading';
                  const dlPercent = progress
                    ? progress.percent
                    : region.tileCount > 0
                    ? Math.round(
                        (region.downloadedTiles / region.tileCount) * 100
                      )
                    : 0;
                  const isChecking = checkingRegionIds.has(region.id);
                  const completedDate =
                    region.completedAt ||
                    (region.status === 'complete' ? region.downloadedAt : null);

                  return (
                    <View
                      key={region.id}
                      style={[styles.regionCard, { borderLeftColor: statusColor }]}
                    >
                      <View style={styles.regionCardHeader}>
                        <View
                          style={[styles.regionDot, { backgroundColor: statusColor }]}
                        />
                        <Text style={styles.regionCardName} numberOfLines={1}>
                          {region.name}
                        </Text>
                        <Text style={styles.regionCardSize}>
                          {formatSize(actualSize)}
                        </Text>
                      </View>

                      {(isDownloading || region.status === 'partial') && (
                        <TacticalProgressBar
                          percent={dlPercent}
                          color={isDownloading ? '#FFB300' : '#66BB6A'}
                          height={4}
                        />
                      )}

                      {isDownloading && progress && (
                        <View style={styles.regionDownloadMeta}>
                          <Text style={styles.regionDlPercent}>{dlPercent}%</Text>
                          {progress.speed > 0 && (
                            <Text style={styles.regionDlSpeed}>
                              {progress.speed} t/s
                            </Text>
                          )}
                          {progress.eta > 0 && (
                            <Text style={styles.regionDlETA}>
                              ETA {formatETA(progress.eta)}
                            </Text>
                          )}
                        </View>
                      )}

                      <View style={styles.regionCardMeta}>
                        <Text style={styles.regionMetaText}>
                          {region.downloadedTiles.toLocaleString()}/
                          {region.tileCount.toLocaleString()} tiles
                        </Text>
                        <Text style={styles.regionMetaText}>
                          Z{region.zoomMin}–{region.zoomMax}
                        </Text>
                        <Text style={styles.regionMetaText}>
                          {region.styleKey.toUpperCase()}
                        </Text>
                        {completedDate && (
                          <Text
                            style={[
                              styles.regionMetaText,
                              { color: getFreshnessColor(completedDate) },
                            ]}
                          >
                            {formatAge(completedDate)}
                          </Text>
                        )}
                      </View>

                      {(region.status === 'complete' ||
                        region.status === 'partial') && (
                        <View style={styles.freshnessRow}>
                          <View
                            style={[
                              styles.freshnessBadge,
                              {
                                backgroundColor:
                                  (region.freshnessStatus === 'fresh'
                                    ? '#66BB6A'
                                    : region.freshnessStatus ===
                                      'update-available'
                                    ? '#FFB300'
                                    : region.freshnessStatus === 'error'
                                    ? '#EF5350'
                                    : TACTICAL.textMuted) + '15',
                              },
                            ]}
                          >
                            {isChecking ? (
                              <ActivityIndicator size={7} color="#64B5F6" />
                            ) : (
                              <View
                                style={[
                                  styles.freshnessDot,
                                  {
                                    backgroundColor:
                                      region.freshnessStatus === 'fresh'
                                        ? '#66BB6A'
                                        : region.freshnessStatus ===
                                          'update-available'
                                        ? '#FFB300'
                                        : region.freshnessStatus === 'error'
                                        ? '#EF5350'
                                        : TACTICAL.textMuted,
                                  },
                                ]}
                              />
                            )}
                            <Text
                              style={[
                                styles.freshnessLabel,
                                {
                                  color: isChecking
                                    ? '#64B5F6'
                                    : region.freshnessStatus === 'fresh'
                                    ? '#66BB6A'
                                    : region.freshnessStatus ===
                                      'update-available'
                                    ? '#FFB300'
                                    : region.freshnessStatus === 'error'
                                    ? '#EF5350'
                                    : TACTICAL.textMuted,
                                },
                              ]}
                            >
                              {isChecking
                                ? 'CHECKING'
                                : region.freshnessStatus === 'fresh'
                                ? 'VERIFIED'
                                : region.freshnessStatus === 'update-available'
                                ? 'UPDATE'
                                : region.freshnessStatus === 'error'
                                ? 'FAILED'
                                : 'UNVERIFIED'}
                            </Text>
                          </View>
                          {region.lastVerifiedAt && (
                            <Text style={styles.verifiedText}>
                              {formatAge(region.lastVerifiedAt)}
                            </Text>
                          )}
                        </View>
                      )}

                      <View style={styles.regionActions}>
                        {(region.status === 'pending' ||
                          region.status === 'cancelled' ||
                          region.status === 'error') && (
                          <TouchableOpacity
                            style={styles.regionActionBtn}
                            onPress={() => handleResume(region.id)}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name={region.status === 'error' ? 'refresh' : 'play'}
                              size={11}
                              color={
                                region.status === 'error'
                                  ? '#EF5350'
                                  : TACTICAL.amber
                              }
                            />
                            <Text
                              style={[
                                styles.regionActionText,
                                {
                                  color:
                                    region.status === 'error'
                                      ? '#EF5350'
                                      : TACTICAL.amber,
                                },
                              ]}
                            >
                              {region.status === 'error' ? 'RETRY' : 'RESUME'}
                            </Text>
                          </TouchableOpacity>
                        )}

                        {isDownloading && (
                          <TouchableOpacity
                            style={styles.regionActionBtn}
                            onPress={() => handleCancel(region.id)}
                            activeOpacity={0.8}
                          >
                            <Ionicons name="pause" size={11} color="#FFB300" />
                            <Text
                              style={[
                                styles.regionActionText,
                                { color: '#FFB300' },
                              ]}
                            >
                              PAUSE
                            </Text>
                          </TouchableOpacity>
                        )}

                        {(region.status === 'complete' ||
                          region.status === 'partial') && (
                          <TouchableOpacity
                            style={[styles.regionActionBtn, isChecking && { opacity: 0.4 }]}
                            onPress={() => handleCheckFreshness(region.id)}
                            disabled={isChecking || !isOnline}
                            activeOpacity={0.8}
                          >
                            <Ionicons
                              name="sync-outline"
                              size={11}
                              color="#64B5F6"
                            />
                            <Text
                              style={[
                                styles.regionActionText,
                                { color: '#64B5F6' },
                              ]}
                            >
                              CHECK
                            </Text>
                          </TouchableOpacity>
                        )}

                        <TouchableOpacity
                          style={styles.regionActionBtn}
                          onPress={() => handleDelete(region.id)}
                          activeOpacity={0.8}
                        >
                          <Ionicons
                            name="trash-outline"
                            size={11}
                            color={TACTICAL.textMuted}
                          />
                          <Text
                            style={[
                              styles.regionActionText,
                              { color: TACTICAL.textMuted },
                            ]}
                          >
                            DELETE
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {region.status === 'error' && region.errorMessage && (
                        <Text style={styles.regionError}>{region.errorMessage}</Text>
                      )}
                    </View>
                  );
                })}
              </>
            ) : (
              <View style={styles.emptyState}>
                <Ionicons
                  name="cloud-offline-outline"
                  size={28}
                  color={TACTICAL.textMuted}
                />
                <Text style={styles.emptyTitle}>NO CACHED REGIONS</Text>
                <Text style={styles.emptyBody}>
                  Use the Cache View tab to download map tiles for offline
                  navigation.
                </Text>
              </View>
            )}
          </>
        )}

        {/* ═══════ STORAGE TAB ═══════ */}
        {activeTab === 'storage' && quotaStatus && (
          <>
            <View style={styles.storageGauge}>
              <View style={styles.storageGaugeHeader}>
                <Text style={styles.storageGaugeUsed}>
                  {formatSize(quotaStatus.usedMB)}
                </Text>
                <Text style={styles.storageGaugeSep}>/</Text>
                <Text style={styles.storageGaugeLimit}>
                  {formatSize(quotaStatus.config.quotaLimitMB)}
                </Text>
                <View
                  style={[
                    styles.storageLevelBadge,
                    { backgroundColor: quotaLevelColor + '20' },
                  ]}
                >
                  <View
                    style={[
                      styles.storageLevelDot,
                      { backgroundColor: quotaLevelColor },
                    ]}
                  />
                  <Text
                    style={[
                      styles.storageLevelText,
                      { color: quotaLevelColor },
                    ]}
                  >
                    {quotaStatus.level === 'ok'
                      ? 'HEALTHY'
                      : quotaStatus.level === 'warning'
                      ? 'WARNING'
                      : quotaStatus.level === 'critical'
                      ? 'CRITICAL'
                      : 'EXCEEDED'}
                  </Text>
                </View>
              </View>

              <View style={styles.storageBarBg}>
                <View
                  style={[
                    styles.storageThreshold,
                    { left: `${quotaStatus.config.warningThreshold * 100}%` },
                  ]}
                />
                <View
                  style={[
                    styles.storageThreshold,
                    styles.storageCritThreshold,
                    { left: `${quotaStatus.config.criticalThreshold * 100}%` },
                  ]}
                />
                <View
                  style={[
                    styles.storageBarFill,
                    {
                      width: `${Math.min(100, quotaStatus.usedFraction * 100)}%`,
                      backgroundColor: quotaLevelColor,
                    },
                  ]}
                />
              </View>

              <View style={styles.storageBarLabels}>
                <Text style={styles.storageBarLabel}>0</Text>
                <Text style={styles.storageBarLabel}>
                  {formatSize(quotaStatus.config.quotaLimitMB * 0.5)}
                </Text>
                <Text style={styles.storageBarLabel}>
                  {formatSize(quotaStatus.config.quotaLimitMB)}
                </Text>
              </View>

              <View style={styles.storageSummary}>
                <View style={styles.storageSummaryItem}>
                  <Text style={styles.storageSummaryValue}>
                    {quotaStatus.regionBreakdown.length}
                  </Text>
                  <Text style={styles.storageSummaryLabel}>REGIONS</Text>
                </View>
                <View style={styles.storageSummaryDivider} />
                <View style={styles.storageSummaryItem}>
                  <Text style={styles.storageSummaryValue}>
                    {formatSize(quotaStatus.availableMB)}
                  </Text>
                  <Text style={styles.storageSummaryLabel}>AVAILABLE</Text>
                </View>
                <View style={styles.storageSummaryDivider} />
                <View style={styles.storageSummaryItem}>
                  <Text
                    style={[
                      styles.storageSummaryValue,
                      quotaStatus.staleRegionCount > 0 && { color: '#FFB300' },
                    ]}
                  >
                    {quotaStatus.staleRegionCount}
                  </Text>
                  <Text style={styles.storageSummaryLabel}>STALE</Text>
                </View>
              </View>
            </View>

            {quotaStatus.regionBreakdown.length > 0 && (
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="bar-chart-outline"
                    size={12}
                    color={TACTICAL.amber}
                  />
                  <Text style={styles.sectionTitle}>REGION BREAKDOWN</Text>
                </View>
                {quotaStatus.regionBreakdown.map((region) => {
                  const maxSize = Math.max(
                    ...quotaStatus.regionBreakdown.map((r) => r.sizeMB)
                  );
                  const barWidth =
                    maxSize > 0 ? Math.max(2, (region.sizeMB / maxSize) * 100) : 0;
                  const statusColor =
                    region.status === 'complete'
                      ? '#66BB6A'
                      : region.status === 'downloading'
                      ? '#FFB300'
                      : region.status === 'error'
                      ? '#EF5350'
                      : TACTICAL.textMuted;

                  return (
                    <View key={region.id} style={styles.breakdownRegion}>
                      <View style={styles.breakdownRegionHeader}>
                        <View
                          style={[
                            styles.breakdownRegionDot,
                            { backgroundColor: statusColor },
                          ]}
                        />
                        <Text
                          style={styles.breakdownRegionName}
                          numberOfLines={1}
                        >
                          {region.name}
                        </Text>
                        {region.isStale && (
                          <View style={styles.staleBadge}>
                            <Text style={styles.staleBadgeText}>STALE</Text>
                          </View>
                        )}
                        <Text style={styles.breakdownRegionSize}>
                          {formatSize(region.sizeMB)}
                        </Text>
                      </View>
                      <View style={styles.breakdownRegionBarBg}>
                        <View
                          style={[
                            styles.breakdownRegionBarFill,
                            {
                              width: `${barWidth}%`,
                              backgroundColor: region.isStale
                                ? '#FFB300'
                                : statusColor,
                            },
                          ]}
                        />
                      </View>
                      <View style={styles.breakdownRegionMeta}>
                        <Text style={styles.breakdownRegionMetaText}>
                          {region.zoomRange}
                        </Text>
                        <Text style={styles.breakdownRegionMetaText}>
                          {region.styleKey.toUpperCase()}
                        </Text>
                        <Text
                          style={[
                            styles.breakdownRegionMetaText,
                            region.ageDays > 90 && { color: '#FFB300' },
                          ]}
                        >
                          {region.ageDays}d old
                        </Text>
                        <Text style={styles.breakdownRegionMetaText}>
                          {(region.fractionOfTotal * 100).toFixed(0)}%
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.storageInfo}>
              <View style={styles.storageInfoRow}>
                <Ionicons
                  name={
                    Platform.OS !== 'web'
                      ? 'phone-portrait-outline'
                      : 'globe-outline'
                  }
                  size={10}
                  color={TACTICAL.textMuted}
                />
                <Text style={styles.storageInfoText}>
                  Engine: {Platform.OS !== 'web' ? 'expo-file-system' : 'IndexedDB'}
                </Text>
              </View>
              <View style={styles.storageInfoRow}>
                <Ionicons
                  name="shield-checkmark-outline"
                  size={10}
                  color={TACTICAL.textMuted}
                />
                <Text style={styles.storageInfoText}>
                  Max region: 100,000 tiles
                </Text>
              </View>
              <View style={styles.storageInfoRow}>
                <Ionicons
                  name="time-outline"
                  size={10}
                  color={TACTICAL.textMuted}
                />
                <Text style={styles.storageInfoText}>
                  Last download: {formatAge(stats.lastDownloadAt)}
                </Text>
              </View>
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </>
  );

  if (embedded) {
    return <View style={{ paddingTop: 6 }}>{content}</View>;
  }

  return (
    <View
      style={[
        styles.sheet,
        {
          maxHeight: sheetMaxHeight,
          paddingBottom: safeBottom,
        },
      ]}
    >
      {/* ═══════ HANDLE + HEADER ═══════ */}
      <View style={styles.handleBar} />
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Ionicons
            name="cloud-download-outline"
            size={16}
            color={TACTICAL.amber}
          />
          <Text style={styles.headerTitle}>OFFLINE CACHE</Text>
          {downloadingCount > 0 && (
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeText}>{downloadingCount}</Text>
            </View>
          )}
          {!isOnline && (
            <View style={styles.offlineBadge}>
              <Ionicons
                name="cloud-offline-outline"
                size={9}
                color="#EF5350"
              />
              <Text style={styles.offlineText}>OFFLINE</Text>
            </View>
          )}
        </View>

        <TouchableOpacity
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
        </TouchableOpacity>
      </View>

      {content}
    </View>
  );
}  

// ── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  embeddedShell: {
    gap: 12,
    paddingTop: 6,
  },
  embeddedHero: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    backgroundColor: 'rgba(10,14,18,0.94)',
    padding: 16,
    gap: 12,
  },
  embeddedHeroCopy: {
    gap: 6,
  },
  embeddedEyebrow: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 2.4,
  },
  embeddedTitle: {
    ...TYPO.T2,
    color: TACTICAL.text,
    fontSize: 16,
    lineHeight: 21,
  },
  embeddedBody: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  embeddedStatusChipRow: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
  },
  embeddedStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.16)',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  embeddedStatusChipOnline: {
    backgroundColor: 'rgba(102,187,106,0.08)',
    borderColor: 'rgba(102,187,106,0.22)',
  },
  embeddedStatusChipOffline: {
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderColor: 'rgba(239,83,80,0.22)',
  },
  embeddedStatusChipText: {
    ...TYPO.U2,
    color: TACTICAL.text,
    fontSize: 8,
    letterSpacing: 1.2,
  },
  embeddedSummaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  embeddedSummaryCard: {
    flex: 1,
    minHeight: 78,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.16)',
    backgroundColor: 'rgba(8,12,15,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 6,
  },
  embeddedSummaryLabel: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    letterSpacing: 1.5,
  },
  embeddedSummaryValue: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 16,
  },
  embeddedDownloadCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.16)',
    backgroundColor: 'rgba(8,12,15,0.92)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  embeddedDownloadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  embeddedDownloadTitle: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 12,
  },
  embeddedDownloadPercent: {
    ...TYPO.K3,
    color: TACTICAL.amber,
    fontSize: 12,
  },
  embeddedDownloadMeta: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 11,
  },
  embeddedDownloadMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  embeddedCancelButton: {
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.26)',
    backgroundColor: 'rgba(255,179,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  embeddedCancelButtonText: {
    ...TYPO.U2,
    color: '#FFB300',
    fontSize: 8,
    letterSpacing: 1.2,
  },
  embeddedNoteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.14)',
    backgroundColor: 'rgba(8,12,15,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  embeddedNoteText: {
    ...TYPO.B2,
    flex: 1,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
  },
  embeddedPrimaryButton: {
    minHeight: 48,
    borderRadius: 14,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.26,
    shadowRadius: 10,
    elevation: 8,
  },
  embeddedPrimaryButtonDisabled: {
    opacity: 0.45,
  },
  embeddedPrimaryButtonText: {
    ...TYPO.U1,
    color: '#091014',
    fontSize: 11,
    letterSpacing: 1.8,
  },
  downloadedSyncsSection: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.16)',
    backgroundColor: 'rgba(8,12,15,0.82)',
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 10,
  },
  downloadedSyncsSectionCompact: {
    marginTop: 0,
  },
  downloadedSyncsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  downloadedSyncsEyebrow: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 1.4,
  },
  downloadedSyncsTitle: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 13,
  },
  downloadedSyncsCountBadge: {
    minWidth: 28,
    minHeight: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(196,138,44,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  downloadedSyncsCountText: {
    ...TYPO.K3,
    color: TACTICAL.amber,
    fontSize: 10,
  },
  downloadedSyncsEmptyCard: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.10)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  downloadedSyncsEmptyCopy: {
    flex: 1,
    gap: 3,
  },
  downloadedSyncsEmptyTitle: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 11,
  },
  downloadedSyncsEmptyText: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
  },
  downloadedSyncsList: {
    gap: 10,
  },
  downloadedSyncCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.14)',
    backgroundColor: 'rgba(10,14,18,0.94)',
  },
  downloadedSyncAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
  },
  downloadedSyncAccentTop: {
    flex: 1,
  },
  downloadedSyncAccentBottom: {
    flex: 1,
    backgroundColor: 'rgba(102,187,106,0.82)',
  },
  downloadedSyncCardBody: {
    paddingLeft: 13,
    paddingRight: 10,
    paddingVertical: 10,
    gap: 8,
  },
  downloadedSyncBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  downloadedSyncTypeBadge: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  downloadedSyncTypeText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 1.1,
  },
  downloadedSyncStatusBadge: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(102,187,106,0.24)',
    backgroundColor: 'rgba(102,187,106,0.08)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  downloadedSyncStatusText: {
    ...TYPO.U2,
    color: '#66BB6A',
    fontSize: 7,
    letterSpacing: 1.1,
  },
  downloadedSyncNameBlock: {
    gap: 3,
  },
  downloadedSyncName: {
    ...TYPO.T3,
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 17,
  },
  downloadedSyncRegion: {
    ...TYPO.B2,
    color: TACTICAL.textMuted,
    fontSize: 10,
  },
  downloadedSyncStatsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  downloadedSyncStatItem: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  downloadedSyncStatValue: {
    ...TYPO.K3,
    color: TACTICAL.text,
    fontSize: 9,
  },
  downloadedSyncChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  downloadedSyncChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.12)',
    backgroundColor: 'rgba(196,138,44,0.06)',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  downloadedSyncChipText: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 1,
  },
  downloadedSyncActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,138,44,0.08)',
    paddingTop: 8,
  },
  downloadedSyncActionBtn: {
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.16)',
    backgroundColor: 'rgba(255,255,255,0.025)',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  downloadedSyncDeleteBtn: {
    borderColor: 'rgba(239,83,80,0.22)',
    backgroundColor: 'rgba(239,83,80,0.06)',
  },
  downloadedSyncActionText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 7,
    letterSpacing: 1.1,
  },
  downloadedSyncActionTextMuted: {
    ...TYPO.U2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    letterSpacing: 1.1,
  },
  downloadedSyncDeleteText: {
    ...TYPO.U2,
    color: '#EF5350',
    fontSize: 7,
    letterSpacing: 1.1,
  },
  sheet: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '88%',
    borderTopWidth: 2,
    borderColor: 'rgba(196,138,44,0.3)',
    overflow: 'hidden',
  },
  handleBar: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: 'rgba(138,138,133,0.3)',
    alignSelf: 'center', marginTop: 10, marginBottom: 4,
  },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: TACTICAL.border,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { ...TYPO.T2, color: TACTICAL.amber, fontSize: 13 },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: 'rgba(255,179,0,0.12)',
  },
  activeDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#FFB300' },
  activeText: { ...TYPO.U2, fontSize: 7, color: '#FFB300' },
  offlineBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4,
    backgroundColor: 'rgba(239,83,80,0.12)',
  },
  offlineText: { ...TYPO.U2, fontSize: 7, color: '#EF5350', letterSpacing: 1 },

  // Stats bar
  statsBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: TACTICAL.border + '60',
  },
  statItem: { flex: 1, alignItems: 'center', gap: 2 },
  statValue: { ...TYPO.K3, fontSize: 12, color: TACTICAL.text },
  statLabel: { ...TYPO.U2, fontSize: 6, letterSpacing: 2, color: TACTICAL.textMuted },
  statDivider: { width: 1, height: 22, backgroundColor: TACTICAL.border },

  // Quota row
  quotaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: TACTICAL.border + '40',
  },
  quotaLevelDot: { width: 5, height: 5, borderRadius: 3 },
  quotaText: { ...TYPO.K3, fontSize: 9 },
  quotaBarBg: {
    flex: 1, height: 4, backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 2, overflow: 'hidden',
  },
  quotaBarFill: { height: '100%', borderRadius: 2 },
  quotaPercent: { ...TYPO.K3, fontSize: 9, width: 30, textAlign: 'right' },

  // Tab bar
  tabBar: {
    flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, gap: 4,
  },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: 'transparent',
  },
  tabActive: {
    borderColor: TACTICAL.amber + '40',
    backgroundColor: 'rgba(196,138,44,0.06)',
  },
  tabText: { ...TYPO.U2, fontSize: 7, letterSpacing: 1.5, color: TACTICAL.textMuted },
  tabTextActive: { color: TACTICAL.amber },

  // Content
  content: { flex: 1 },
  contentInner: { padding: 16, gap: 14 },

  // Region preview
  regionPreview: {
    borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.amber + '25',
    padding: 12, gap: 10, backgroundColor: 'rgba(196,138,44,0.04)',
  },
  regionPreviewHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  regionPreviewTitle: { ...TYPO.U2, fontSize: 8, letterSpacing: 3, color: TACTICAL.amber },
  boundsGrid: { gap: 8 },
  boundsRow: { flexDirection: 'row', gap: 12 },
  boundsItem: { flex: 1, gap: 2 },
  boundsLabel: { ...TYPO.U2, fontSize: 6, letterSpacing: 2, color: TACTICAL.textMuted },
  boundsValue: { ...TYPO.K3, fontSize: 10, color: TACTICAL.text },

  miniMapContainer: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingTop: 4 },
  miniMap: {
    width: 64, height: 48, borderRadius: 6, borderWidth: 1,
    borderColor: TACTICAL.amber + '30', backgroundColor: 'rgba(11,15,18,0.6)',
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  miniMapGrid: {
    ...StyleSheet.absoluteFillObject, flexDirection: 'row', flexWrap: 'wrap',
  },
  miniMapCell: {
    width: '33.33%', height: '33.33%', borderWidth: 0.5,
    borderColor: 'rgba(62,79,60,0.2)',
  },
  miniMapCenter: { zIndex: 1 },
  miniMapLabel: {
    position: 'absolute', bottom: 2, right: 3,
    ...TYPO.K3, fontSize: 7, color: TACTICAL.amber,
  },
  miniMapCoords: { flex: 1, alignItems: 'center', gap: 1 },
  miniMapCoordsRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%' },
  miniMapCoordText: { ...TYPO.K3, fontSize: 8, color: TACTICAL.textMuted },

  noBoundsState: { alignItems: 'center', gap: 8, paddingVertical: 12 },
  noBoundsText: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, textAlign: 'center' },
  getBoundsBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6,
    borderWidth: 1, borderColor: TACTICAL.amber + '30',
  },
  getBoundsBtnText: { ...TYPO.U2, fontSize: 7, letterSpacing: 2, color: TACTICAL.amber },

  // Section
  section: { gap: 8 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { ...TYPO.U2, fontSize: 8, letterSpacing: 3, color: TACTICAL.amber },
  sectionLabel: { ...TYPO.U2, fontSize: 7, letterSpacing: 3, color: TACTICAL.textMuted, paddingBottom: 4 },

  // Zoom presets
  zoomPresets: { flexDirection: 'row', gap: 6 },
  zoomChip: {
    flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 8,
    borderWidth: 1, borderColor: TACTICAL.border, gap: 2,
  },
  zoomChipActive: { borderColor: TACTICAL.amber, backgroundColor: 'rgba(196,138,44,0.08)' },
  zoomChipLabel: { ...TYPO.U2, fontSize: 7, letterSpacing: 1, color: TACTICAL.textMuted },
  zoomChipLabelActive: { color: TACTICAL.amber },
  zoomChipRange: { ...TYPO.B2, fontSize: 7, color: TACTICAL.textMuted },

  // Zoom steppers
  zoomSteppers: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepper: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepperLabel: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted, width: 24 },
  stepBtn: {
    width: 28, height: 28, borderRadius: 6, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: 'rgba(62,79,60,0.08)',
  },
  stepValue: { ...TYPO.K3, fontSize: 12, color: TACTICAL.text, width: 20, textAlign: 'center' },
  stepperDash: { paddingHorizontal: 4 },
  stepperDashText: { color: TACTICAL.textMuted, fontSize: 12 },

  // Style row
  styleRow: { flexDirection: 'row', gap: 6 },
  styleChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  styleChipActive: { borderColor: TACTICAL.amber, backgroundColor: 'rgba(196,138,44,0.08)' },
  styleChipText: { ...TYPO.U2, fontSize: 8, letterSpacing: 1, color: TACTICAL.textMuted },
  styleChipTextActive: { color: TACTICAL.amber },

  // Estimate panel
  estimatePanel: {
    borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border,
    padding: 12, gap: 8, backgroundColor: 'rgba(62,79,60,0.06)',
  },
  estimateKPIs: { flexDirection: 'row', alignItems: 'center' },
  estimateKPI: { flex: 1, alignItems: 'center', gap: 2 },
  estimateKPIValue: { ...TYPO.K2, fontSize: 15, color: TACTICAL.amber },
  estimateKPILabel: { ...TYPO.U2, fontSize: 6, letterSpacing: 2, color: TACTICAL.textMuted },
  estimateKPIDivider: { width: 1, height: 24, backgroundColor: TACTICAL.border },

  breakdownToggle: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 4,
  },
  breakdownToggleText: { ...TYPO.U2, fontSize: 7, letterSpacing: 2, color: TACTICAL.textMuted },
  breakdownList: { gap: 3 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownZoom: { ...TYPO.K3, fontSize: 9, color: TACTICAL.textMuted, width: 22 },
  breakdownBarBg: {
    flex: 1, height: 3, backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 2, overflow: 'hidden',
  },
  breakdownBarFill: { height: '100%', backgroundColor: TACTICAL.amber + '60', borderRadius: 2 },
  breakdownTiles: { ...TYPO.K3, fontSize: 9, color: TACTICAL.text, width: 40, textAlign: 'right' },
  breakdownSize: { ...TYPO.B2, fontSize: 8, color: TACTICAL.textMuted, width: 36, textAlign: 'right' },

  warningBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 6,
    backgroundColor: 'rgba(255,179,0,0.08)', borderWidth: 1, borderColor: '#FFB300' + '25',
  },
  warningText: { ...TYPO.B2, fontSize: 9, color: '#FFB300', flex: 1 },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, padding: 8, borderRadius: 6,
    backgroundColor: 'rgba(239,83,80,0.08)', borderWidth: 1, borderColor: '#EF5350' + '25',
  },
  errorText: { ...TYPO.B2, fontSize: 9, color: '#EF5350', flex: 1 },

  // Download button
  downloadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 10, backgroundColor: TACTICAL.amber,
  },
  downloadBtnDisabled: { opacity: 0.35 },
  downloadBtnText: { ...TYPO.U1, color: '#0B0F12', fontSize: 11, letterSpacing: 2 },

  // Active downloads
  activeDownloadsSection: { gap: 6 },
  downloadCard: {
    padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#FFB300' + '30',
    gap: 6, backgroundColor: 'rgba(255,179,0,0.04)',
  },
  downloadCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  downloadCardName: { ...TYPO.B2, fontSize: 11, color: TACTICAL.text, flex: 1, marginRight: 8 },
  downloadCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  downloadPercent: { ...TYPO.K3, fontSize: 11, color: TACTICAL.amber },
  downloadSpeed: { ...TYPO.B2, fontSize: 8, color: TACTICAL.textMuted },
  downloadETA: { ...TYPO.B2, fontSize: 8, color: TACTICAL.textMuted },
  downloadSize: { ...TYPO.B2, fontSize: 8, color: TACTICAL.textMuted, marginLeft: 'auto' },

  // Region summary
  regionSummary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  readyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  readyText: { ...TYPO.U2, fontSize: 7, letterSpacing: 1, color: '#66BB6A' },
  clearAllBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4,
    borderWidth: 1, borderColor: '#EF5350' + '25',
  },
  clearAllText: { ...TYPO.U2, fontSize: 7, letterSpacing: 1, color: '#EF5350' },

  // Region card
  regionCard: {
    padding: 10, borderRadius: 8, borderWidth: 1, borderColor: TACTICAL.border,
    borderLeftWidth: 3, gap: 6, backgroundColor: 'rgba(62,79,60,0.04)',
  },
  regionCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  regionDot: { width: 6, height: 6, borderRadius: 3 },
  regionCardName: { ...TYPO.T3, fontSize: 11, color: TACTICAL.text, flex: 1 },
  regionCardSize: { ...TYPO.K3, fontSize: 9, color: TACTICAL.textMuted },
  regionCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12 },
  regionMetaText: { ...TYPO.B2, fontSize: 8, color: TACTICAL.textMuted },
  regionDownloadMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12 },
  regionDlPercent: { ...TYPO.K3, fontSize: 10, color: '#FFB300' },
  regionDlSpeed: { ...TYPO.B2, fontSize: 8, color: TACTICAL.textMuted },
  regionDlETA: { ...TYPO.B2, fontSize: 8, color: TACTICAL.textMuted },

  // Freshness
  freshnessRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 12 },
  freshnessBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3,
  },
  freshnessDot: { width: 4, height: 4, borderRadius: 2 },
  freshnessLabel: { ...TYPO.U2, fontSize: 6, letterSpacing: 1 },
  verifiedText: { ...TYPO.B2, fontSize: 7, color: TACTICAL.textMuted },

  // Region actions
  regionActions: { flexDirection: 'row', gap: 6, paddingTop: 2 },
  regionActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 5, borderRadius: 5,
    borderWidth: 1, borderColor: TACTICAL.border,
  },
  regionActionText: { ...TYPO.U2, fontSize: 6, letterSpacing: 1 },
  regionError: { ...TYPO.B2, fontSize: 8, color: '#EF5350', paddingLeft: 12 },

  // Empty state
  emptyState: { alignItems: 'center', gap: 10, paddingVertical: 32 },
  emptyTitle: { ...TYPO.T3, color: TACTICAL.text },
  emptyBody: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 16 },

  // Storage gauge
  storageGauge: { gap: 8, paddingBottom: 4 },
  storageGaugeHeader: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  storageGaugeUsed: { ...TYPO.K1, fontSize: 22, color: TACTICAL.text },
  storageGaugeSep: { ...TYPO.B2, fontSize: 14, color: TACTICAL.textMuted, marginHorizontal: 2 },
  storageGaugeLimit: { ...TYPO.K2, fontSize: 14, color: TACTICAL.textMuted },
  storageLevelBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, marginLeft: 'auto',
  },
  storageLevelDot: { width: 6, height: 6, borderRadius: 3 },
  storageLevelText: { ...TYPO.U2, fontSize: 7, letterSpacing: 2 },

  storageBarBg: {
    height: 8, backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 4, overflow: 'hidden', position: 'relative',
  },
  storageBarFill: { height: '100%', borderRadius: 4 },
  storageThreshold: {
    position: 'absolute', top: 0, bottom: 0, width: 1,
    backgroundColor: '#FFB300' + '60', zIndex: 1,
  },
  storageCritThreshold: { backgroundColor: '#EF5350' + '60' },
  storageBarLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  storageBarLabel: { ...TYPO.B2, fontSize: 7, color: TACTICAL.textMuted },

  storageSummary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingTop: 4,
  },
  storageSummaryItem: { alignItems: 'center', gap: 2 },
  storageSummaryValue: { ...TYPO.K3, fontSize: 13, color: TACTICAL.text },
  storageSummaryLabel: { ...TYPO.U2, fontSize: 6, letterSpacing: 2, color: TACTICAL.textMuted },
  storageSummaryDivider: { width: 1, height: 24, backgroundColor: TACTICAL.border },

  // Breakdown regions
  breakdownRegion: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: TACTICAL.border + '40', gap: 3 },
  breakdownRegionHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownRegionDot: { width: 5, height: 5, borderRadius: 3 },
  breakdownRegionName: { ...TYPO.B2, fontSize: 10, color: TACTICAL.text, flex: 1 },
  breakdownRegionSize: { ...TYPO.K3, fontSize: 9, color: TACTICAL.textMuted },
  breakdownRegionBarBg: {
    height: 3, backgroundColor: 'rgba(62,79,60,0.1)',
    borderRadius: 2, overflow: 'hidden', marginLeft: 11,
  },
  breakdownRegionBarFill: { height: '100%', borderRadius: 2 },
  breakdownRegionMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 11 },
  breakdownRegionMetaText: { ...TYPO.B2, fontSize: 7, color: TACTICAL.textMuted },
  staleBadge: {
    paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3,
    backgroundColor: 'rgba(255,179,0,0.12)',
  },
  staleBadgeText: { ...TYPO.U2, fontSize: 5, letterSpacing: 1, color: '#FFB300' },

  // Storage info
  storageInfo: {
    gap: 6, padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.04)',
  },
  storageInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  storageInfoText: { ...TYPO.B2, fontSize: 9, color: TACTICAL.textMuted },
});
