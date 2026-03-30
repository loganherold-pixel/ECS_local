/**
 * RouteTileCacheCard — Automatic Offline Tile Pre-Caching Overlay
 *
 * Floating card on the Navigate tab map that:
 *   - Auto-analyzes route when loaded and computes optimal cache parameters
 *   - Shows auto-cache prompt for new routes (one-tap to start)
 *   - Displays animated download progress bar during caching
 *   - Shows cached status with storage usage indicator
 *   - Supports expand/collapse for detailed view
 *   - Allows deleting cached regions
 *   - Integrates with routeTileCacheEngine for smart analysis
 *
 * Modes:
 *   floating=true  — Absolute positioned overlay on the map (Navigate tab)
 *   floating=false — Inline card in a ScrollView (navigate-run detail)
 *
 * States:
 *   PROMPT   — Route loaded, not cached, offers auto-cache
 *   CACHING  — Download in progress with progress bar
 *   CACHED   — Route tiles cached, shows storage info
 *   COMPACT  — Minimized status indicator
 */
import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  Alert,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  analyzeRoute,
  startRouteCaching,
  cancelRouteCaching,
  deleteRouteCache,
  getStorageOverview,
  wasAutoCacheOffered,
  markAutoCacheOffered,
  formatStorageSize,
  formatETA,
  type RouteAnalysis,
  type CacheProgress,
  type StorageOverview,
} from '../../lib/routeTileCacheEngine';
import { connectivity } from '../../lib/connectivity';
import type { ECSRun } from '../../lib/runStore';

// ── Types ───────────────────────────────────────────────

interface Props {
  run: ECSRun;
  mapStyle?: string;
  visible?: boolean;
  showToast?: (msg: string) => void;
  /** When true, renders as a floating overlay with absolute positioning. Default: true */
  floating?: boolean;
  /** Legacy callback for navigate-run.tsx compatibility */
  onCacheComplete?: (regionId: string) => void;
}

type CardState = 'prompt' | 'caching' | 'cached' | 'compact' | 'error';

// ── Component ───────────────────────────────────────────

export default function RouteTileCacheCard({
  run,
  mapStyle = 'tactical',
  visible = true,
  showToast,
  floating = true,
  onCacheComplete,
}: Props) {
  // ── State ─────────────────────────────────────────────
  const [analysis, setAnalysis] = useState<RouteAnalysis | null>(null);
  const [cardState, setCardState] = useState<CardState>('compact');
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState<CacheProgress | null>(null);
  const [storage, setStorage] = useState<StorageOverview | null>(null);
  const [isOnline, setIsOnline] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // Animation refs
  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ── Connectivity ──────────────────────────────────────
  useEffect(() => {
    setIsOnline(connectivity.isOnline());
    const unsub = connectivity.onStatusChange((status) => {
      if (mountedRef.current) setIsOnline(status === 'online');
    });
    return unsub;
  }, []);

  // ── Analyze route ─────────────────────────────────────
  useEffect(() => {
    if (!run || run.points.length < 2) return;

    const result = analyzeRoute(run);
    if (!mountedRef.current) return;
    setAnalysis(result);
    setStorage(getStorageOverview());

    if (!result) {
      setCardState('compact');
      return;
    }

    if (result.cacheComplete) {
      setCardState('cached');
    } else if (result.hasCachedRegion && result.cachedRegion?.status === 'downloading') {
      setCardState('caching');
    } else if (result.autoRecommended && !wasAutoCacheOffered(run.id)) {
      setCardState('prompt');
      setExpanded(true);
    } else if (result.hasCachedRegion) {
      setCardState('cached');
    } else {
      setCardState('prompt');
    }
  }, [run.id, run.points.length]);

  // ── Progress animation ────────────────────────────────
  useEffect(() => {
    if (progress) {
      Animated.timing(progressAnim, {
        toValue: progress.percent,
        duration: 400,
        useNativeDriver: false,
      }).start();
    }
  }, [progress?.percent]);

  // Pulse animation during download
  useEffect(() => {
    if (cardState === 'caching') {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: false }),
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [cardState]);

  // ── Handlers ──────────────────────────────────────────

  const handleStartCache = useCallback(async () => {
    if (!analysis) return;
    setError(null);
    setCardState('caching');
    setExpanded(true);
    markAutoCacheOffered(run.id);

    const result = await startRouteCaching(analysis, mapStyle, (prog) => {
      if (!mountedRef.current) return;
      setProgress(prog);

      if (prog.status === 'complete') {
        setCardState('cached');
        setStorage(getStorageOverview());
        const updated = analyzeRoute(run);
        if (updated && mountedRef.current) setAnalysis(updated);
        showToast?.(`ROUTE CACHED: ${prog.downloadedTiles} tiles, ${formatStorageSize(prog.downloadedSizeMB)}`);
        if (prog.regionId) onCacheComplete?.(prog.regionId);
      } else if (prog.status === 'error') {
        setCardState('error');
        setError(prog.message || 'Download failed');
        showToast?.('ROUTE CACHE FAILED');
      } else if (prog.status === 'cancelled') {
        setCardState('prompt');
        showToast?.('ROUTE CACHE CANCELLED');
      }
    });

    if (!result.success && mountedRef.current) {
      setCardState('error');
      setError(result.error || 'Failed to start download');
    }
  }, [analysis, mapStyle, run, showToast, onCacheComplete]);

  const handleCancel = useCallback(() => {
    if (progress?.regionId) {
      cancelRouteCaching(progress.regionId);
    }
    setCardState('prompt');
    setProgress(null);
  }, [progress?.regionId]);

  const handleDeleteCache = useCallback(() => {
    const doDelete = async () => {
      await deleteRouteCache(run.id);
      if (!mountedRef.current) return;
      setCardState('prompt');
      setProgress(null);
      setStorage(getStorageOverview());
      const updated = analyzeRoute(run);
      if (updated && mountedRef.current) setAnalysis(updated);
      showToast?.('ROUTE CACHE DELETED');
    };

    if (Platform.OS === 'web') {
      if (confirm('Delete cached tiles for this route?')) doDelete();
    } else {
      Alert.alert('Delete Route Cache', 'Remove all cached tiles for this route?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [run, showToast]);

  const handleDismiss = useCallback(() => {
    markAutoCacheOffered(run.id);
    setExpanded(false);
    setCardState('compact');
  }, [run.id]);

  const handleToggleExpand = useCallback(() => {
    setExpanded(prev => !prev);
  }, []);

  // ── Derived values ────────────────────────────────────
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  const statusColor = cardState === 'cached' ? '#66BB6A' :
    cardState === 'caching' ? '#FFB300' :
    cardState === 'error' ? '#EF5350' :
    cardState === 'prompt' ? TACTICAL.amber :
    TACTICAL.textMuted;

  const storageQuotaColor = storage?.quotaLevel === 'ok' ? '#66BB6A' :
    storage?.quotaLevel === 'warning' ? '#FFB300' :
    storage?.quotaLevel === 'critical' ? '#FF7043' :
    '#EF5350';

  // ── Render guards ─────────────────────────────────────
  if (!visible || !analysis || run.points.length < 2) return null;

  // ── COMPACT MODE ──────────────────────────────────────
  if (!expanded && cardState !== 'caching') {
    return (
      <TouchableOpacity
        style={[
          styles.compactContainer,
          floating && styles.compactFloating,
          { borderColor: statusColor + '40' },
        ]}
        onPress={handleToggleExpand}
        activeOpacity={0.85}
      >
        <View style={[styles.compactDot, { backgroundColor: statusColor }]} />
        <Ionicons
          name={cardState === 'cached' ? 'checkmark-circle' : 'layers-outline'}
          size={11}
          color={statusColor}
        />
        <Text style={[styles.compactLabel, { color: statusColor }]}>
          {cardState === 'cached' ? 'OFFLINE' : 'CACHE'}
        </Text>
        {cardState === 'cached' && analysis.cachedRegion && (
          <Text style={styles.compactSize}>
            {formatStorageSize(analysis.cachedRegion.actualSizeMB || analysis.cachedRegion.estimatedSizeMB)}
          </Text>
        )}
        <Ionicons name="chevron-down" size={10} color={TACTICAL.textMuted} />
      </TouchableOpacity>
    );
  }

  // ── EXPANDED MODE ─────────────────────────────────────
  return (
    <View style={[
      styles.container,
      floating && styles.containerFloating,
      { borderColor: statusColor + '30' },
    ]}>
      {/* ═══════ HEADER ═══════ */}
      <View style={styles.header}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Ionicons name="layers-outline" size={13} color={statusColor} />
        <Text style={[styles.headerTitle, { color: statusColor }]}>
          {cardState === 'cached' ? 'ROUTE CACHED' :
           cardState === 'caching' ? 'CACHING ROUTE' :
           cardState === 'error' ? 'CACHE ERROR' :
           'OFFLINE CACHE'}
        </Text>
        <Text style={styles.headerZoom}>Z{analysis.zoomMin}\u2013{analysis.zoomMax}</Text>
        <TouchableOpacity
          onPress={cardState === 'caching' ? undefined : handleToggleExpand}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          disabled={cardState === 'caching'}
        >
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={TACTICAL.textMuted} />
        </TouchableOpacity>
      </View>

      {/* ═══════ CACHING PROGRESS ═══════ */}
      {cardState === 'caching' && progress && (
        <View style={styles.progressSection}>
          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>
              {progress.message || 'Downloading...'}
            </Text>
            <Text style={styles.progressPercent}>{progress.percent}%</Text>
          </View>

          {/* Animated progress bar */}
          <View style={styles.progressBarTrack}>
            <View style={styles.progressBarMarks}>
              {[25, 50, 75].map(mark => (
                <View key={mark} style={[styles.progressBarMark, { left: `${mark}%` as any }]} />
              ))}
            </View>
            <Animated.View
              style={[
                styles.progressBarFill,
                { width: progressWidth, opacity: pulseAnim },
              ]}
            />
          </View>

          {/* Progress stats */}
          <View style={styles.progressStats}>
            <Text style={styles.progressStat}>
              {progress.downloadedTiles.toLocaleString()}/{progress.totalTiles.toLocaleString()}
            </Text>
            <Text style={styles.progressStat}>
              {formatStorageSize(progress.downloadedSizeMB)}
            </Text>
            {progress.speed > 0 && (
              <Text style={styles.progressStat}>{progress.speed.toFixed(0)} t/s</Text>
            )}
            {progress.eta > 0 && (
              <Text style={styles.progressStat}>ETA {formatETA(progress.eta)}</Text>
            )}
          </View>

          {/* Zoom level indicator */}
          {progress.currentZoom > 0 && (
            <View style={styles.zoomIndicator}>
              {Array.from({ length: analysis.zoomMax - analysis.zoomMin + 1 }, (_, i) => {
                const z = analysis.zoomMin + i;
                const isActive = z === progress.currentZoom;
                const isDone = z < progress.currentZoom;
                return (
                  <View
                    key={z}
                    style={[
                      styles.zoomPip,
                      isDone && styles.zoomPipDone,
                      isActive && styles.zoomPipActive,
                    ]}
                  >
                    <Text style={[
                      styles.zoomPipText,
                      isDone && { color: '#66BB6A' },
                      isActive && { color: '#FFB300' },
                    ]}>
                      {z}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Cancel button */}
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
            <Ionicons name="close-circle-outline" size={11} color="#FFB300" />
            <Text style={styles.cancelBtnText}>CANCEL</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ═══════ CACHED STATUS ═══════ */}
      {cardState === 'cached' && analysis.cachedRegion && (
        <View style={styles.cachedSection}>
          <View style={styles.cachedRow}>
            <View style={styles.cachedKPI}>
              <Text style={styles.cachedKPIValue}>
                {(analysis.cachedRegion.downloadedTiles || 0).toLocaleString()}
              </Text>
              <Text style={styles.cachedKPILabel}>TILES</Text>
            </View>
            <View style={styles.cachedKPIDivider} />
            <View style={styles.cachedKPI}>
              <Text style={styles.cachedKPIValue}>
                {formatStorageSize(analysis.cachedRegion.actualSizeMB || analysis.cachedRegion.estimatedSizeMB)}
              </Text>
              <Text style={styles.cachedKPILabel}>SIZE</Text>
            </View>
            <View style={styles.cachedKPIDivider} />
            <View style={styles.cachedKPI}>
              <Text style={[styles.cachedKPIValue, { color: '#66BB6A' }]}>
                {analysis.cacheCoverage}%
              </Text>
              <Text style={styles.cachedKPILabel}>COVERAGE</Text>
            </View>
          </View>

          {/* Cached date */}
          {analysis.cachedRegion.completedAt && (
            <Text style={styles.cachedDate}>
              Cached {new Date(analysis.cachedRegion.completedAt).toLocaleDateString()} at{' '}
              {new Date(analysis.cachedRegion.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}

          {/* Storage usage bar */}
          {storage && renderStorageBar(storage, storageQuotaColor)}

          {/* Delete button */}
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteCache} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={11} color={TACTICAL.textMuted} />
            <Text style={styles.deleteBtnText}>DELETE CACHE</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ═══════ PROMPT — NOT YET CACHED ═══════ */}
      {(cardState === 'prompt' || cardState === 'error') && (
        <View style={styles.promptSection}>
          {/* Route analysis summary */}
          <View style={styles.analysisRow}>
            <View style={styles.analysisItem}>
              <Text style={styles.analysisValue}>
                {analysis.tileCount >= 1000
                  ? `${(analysis.tileCount / 1000).toFixed(1)}K`
                  : analysis.tileCount}
              </Text>
              <Text style={styles.analysisLabel}>TILES</Text>
            </View>
            <View style={styles.analysisDivider} />
            <View style={styles.analysisItem}>
              <Text style={styles.analysisValue}>
                ~{formatStorageSize(analysis.estimatedSizeMB)}
              </Text>
              <Text style={styles.analysisLabel}>EST. SIZE</Text>
            </View>
            <View style={styles.analysisDivider} />
            <View style={styles.analysisItem}>
              <Text style={styles.analysisValue}>{analysis.bufferMiles} mi</Text>
              <Text style={styles.analysisLabel}>BUFFER</Text>
            </View>
            <View style={styles.analysisDivider} />
            <View style={styles.analysisItem}>
              <Text style={[styles.analysisValue, { textTransform: 'uppercase', fontSize: 10 }]}>
                {analysis.routeType}
              </Text>
              <Text style={styles.analysisLabel}>TYPE</Text>
            </View>
          </View>

          {/* Recommendation text */}
          <Text style={styles.recommendText}>{analysis.recommendationReason}</Text>

          {/* Zoom breakdown toggle */}
          <TouchableOpacity
            style={styles.breakdownToggle}
            onPress={() => setShowBreakdown(!showBreakdown)}
            activeOpacity={0.8}
          >
            <Text style={styles.breakdownToggleText}>
              {showBreakdown ? 'HIDE' : 'SHOW'} ZOOM BREAKDOWN
            </Text>
            <Ionicons name={showBreakdown ? 'chevron-up' : 'chevron-down'} size={10} color={TACTICAL.textMuted} />
          </TouchableOpacity>

          {showBreakdown && (
            <View style={styles.breakdownList}>
              {analysis.zoomBreakdown.map(z => {
                const maxTiles = Math.max(...analysis.zoomBreakdown.map(b => b.tiles));
                return (
                  <View key={z.zoom} style={styles.breakdownRow}>
                    <Text style={styles.breakdownZoom}>Z{z.zoom}</Text>
                    <View style={styles.breakdownBarBg}>
                      <View style={[
                        styles.breakdownBarFill,
                        { width: `${Math.max(2, (z.tiles / maxTiles) * 100)}%` as any },
                      ]} />
                    </View>
                    <Text style={styles.breakdownTiles}>{z.tiles.toLocaleString()}</Text>
                    <Text style={styles.breakdownSize}>{z.sizeMB.toFixed(1)} MB</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Storage usage indicator */}
          {storage && renderStorageBar(storage, storageQuotaColor)}

          {/* Error message */}
          {error && (
            <View style={styles.errorRow}>
              <Ionicons name="warning-outline" size={11} color="#EF5350" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.dismissBtn} onPress={handleDismiss} activeOpacity={0.8}>
              <Text style={styles.dismissBtnText}>LATER</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cacheBtn, (!isOnline || analysis.tileCount > 100000) && styles.cacheBtnDisabled]}
              onPress={handleStartCache}
              activeOpacity={0.8}
              disabled={!isOnline || analysis.tileCount > 100000}
            >
              <Ionicons name="cloud-download-outline" size={14} color="#0B0F12" />
              <Text style={styles.cacheBtnText}>
                {!isOnline ? 'OFFLINE' :
                 analysis.tileCount > 100000 ? 'TOO LARGE' :
                 'CACHE ROUTE'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Storage Bar Helper ──────────────────────────────────

function renderStorageBar(storage: StorageOverview, color: string) {
  return (
    <View style={styles.storageRow}>
      <View style={[styles.storageDot, { backgroundColor: color }]} />
      <Text style={[styles.storageText, { color }]}>
        {formatStorageSize(storage.totalCachedMB)}
      </Text>
      <View style={styles.storageBarBg}>
        <View style={[
          styles.storageBarFill,
          { width: `${Math.min(100, storage.quotaUsedPercent)}%` as any, backgroundColor: color },
        ]} />
      </View>
      <Text style={[styles.storagePercent, { color }]}>
        {formatStorageSize(storage.availableMB)} free
      </Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Compact mode ────────────────────────────────────
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(11,15,18,0.92)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 6,
  },
  compactFloating: {
    position: 'absolute',
    top: 90,
    right: 10,
    zIndex: 28,
  },
  compactDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  compactLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
  },
  compactSize: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },

  // ── Expanded container ──────────────────────────────
  container: {
    backgroundColor: 'rgba(11,15,18,0.95)',
    borderRadius: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  containerFloating: {
    position: 'absolute',
    top: 90,
    left: 10,
    right: 10,
    zIndex: 28,
    maxWidth: 420,
    alignSelf: 'center',
  },

  // ── Header ──────────────────────────────────────────
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.2)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerTitle: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 2,
    flex: 1,
  },
  headerZoom: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
    letterSpacing: 0.5,
  },

  // ── Progress section ────────────────────────────────
  progressSection: {
    padding: 12,
    gap: 6,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabel: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.text,
    flex: 1,
  },
  progressPercent: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFB300',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
  progressBarTrack: {
    height: 6,
    backgroundColor: 'rgba(62,79,60,0.2)',
    borderRadius: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  progressBarMarks: {
    ...StyleSheet.absoluteFillObject,
  },
  progressBarMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(62,79,60,0.3)',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#FFB300',
    borderRadius: 3,
  },
  progressStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  progressStat: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },

  // ── Zoom level indicator ────────────────────────────
  zoomIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 2,
  },
  zoomPip: {
    width: 18,
    height: 16,
    borderRadius: 3,
    backgroundColor: 'rgba(62,79,60,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.15)',
  },
  zoomPipDone: {
    backgroundColor: 'rgba(102,187,106,0.1)',
    borderColor: 'rgba(102,187,106,0.3)',
  },
  zoomPipActive: {
    backgroundColor: 'rgba(255,179,0,0.15)',
    borderColor: 'rgba(255,179,0,0.4)',
  },
  zoomPipText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },

  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.25)',
    backgroundColor: 'rgba(255,179,0,0.06)',
  },
  cancelBtnText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#FFB300',
    letterSpacing: 1,
  },

  // ── Cached section ──────────────────────────────────
  cachedSection: {
    padding: 12,
    gap: 8,
  },
  cachedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cachedKPI: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  cachedKPIValue: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
  cachedKPILabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  cachedKPIDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(62,79,60,0.2)',
  },
  cachedDate: {
    fontSize: 8,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.2)',
    backgroundColor: 'rgba(138,138,133,0.04)',
  },
  deleteBtnText: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── Prompt section ──────────────────────────────────
  promptSection: {
    padding: 12,
    gap: 8,
  },
  analysisRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  analysisItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  analysisValue: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
  analysisLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  analysisDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(62,79,60,0.2)',
  },
  recommendText: {
    fontSize: 9,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 13,
  },

  // ── Breakdown ───────────────────────────────────────
  breakdownToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 4,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
  },
  breakdownToggleText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  breakdownList: {
    gap: 3,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  breakdownZoom: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    width: 22,
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
  breakdownBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  breakdownBarFill: {
    height: '100%',
    backgroundColor: TACTICAL.amber + '60',
    borderRadius: 2,
  },
  breakdownTiles: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.text,
    width: 38,
    textAlign: 'right',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
  breakdownSize: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    width: 36,
    textAlign: 'right',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },

  // ── Storage usage ───────────────────────────────────
  storageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  storageDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  storageText: {
    fontSize: 8,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },
  storageBarBg: {
    flex: 1,
    height: 3,
    backgroundColor: 'rgba(62,79,60,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  storageBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  storagePercent: {
    fontSize: 8,
    fontWeight: '700',
    fontFamily: Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' }),
  },

  // ── Error ───────────────────────────────────────────
  errorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.15)',
  },
  errorText: {
    fontSize: 8,
    fontWeight: '600',
    color: '#EF5350',
    flex: 1,
  },

  // ── Action buttons ──────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dismissBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  dismissBtnText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  cacheBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
  },
  cacheBtnDisabled: {
    opacity: 0.35,
  },
  cacheBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1,
  },
});



