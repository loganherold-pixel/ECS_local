/**
 * ExpeditionTileCacheCard — Offline Tile Pre-Caching for Expedition Routes
 *
 * Appears on the expedition detail screen when waypoints are available.
 * Computes a route corridor from waypoint coordinates and offers one-tap
 * tile caching so the user can pre-download map tiles before departure.
 *
 * States:
 *   EMPTY     — No waypoints, card hidden
 *   ESTIMATE  — Waypoints loaded, shows tile count/size estimate + "Cache" button
 *   CACHING   — Download in progress with animated progress bar
 *   CACHED    — Route tiles fully cached, shows summary + delete option
 *   ERROR     — Download failed, shows retry option
 */
import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  tileCacheStore,
  computeRouteCorridor,
  countTilesForRegion,
  estimateSizeMB,
  getTileBreakdown,
  type TileCacheRegion,
  type DownloadProgress,
} from '../../lib/tileCacheStore';

// ── Constants ───────────────────────────────────────────

const CORRIDOR_MILES = 5;       // Buffer around route
const ZOOM_MIN = 8;             // Overview zoom
const ZOOM_MAX = 14;            // Detail zoom
const STYLE_KEY = 'tactical';   // Default map style
const REGION_PREFIX = 'exp-route-';

// ── Types ───────────────────────────────────────────────

interface Props {
  expeditionId: string;
  expeditionTitle: string;
  waypointCoords: { lat: number; lng: number; label?: string }[];
}

type CardState = 'estimate' | 'caching' | 'cached' | 'error';

// ── Helpers ─────────────────────────────────────────────

function formatSize(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(mb * 1024)} KB`;
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

function findExistingRegion(expeditionId: string): TileCacheRegion | undefined {
  const regionName = `${REGION_PREFIX}${expeditionId}`;
  return tileCacheStore.getRegions().find(
    r => r.name === regionName || r.routeId === expeditionId
  );
}

// ── Component ───────────────────────────────────────────

export default function ExpeditionTileCacheCard({
  expeditionId,
  expeditionTitle,
  waypointCoords,
}: Props) {
  const [cardState, setCardState] = useState<CardState>('estimate');
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [existingRegion, setExistingRegion] = useState<TileCacheRegion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  const progressAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ── Route corridor computation ────────────────────────

  const routeAnalysis = useMemo(() => {
    if (waypointCoords.length < 2) return null;

    const points = waypointCoords.map(c => ({ lat: c.lat, lng: c.lng }));
    const bounds = computeRouteCorridor(points, CORRIDOR_MILES);
    if (!bounds) return null;

    const tileCount = countTilesForRegion(bounds, ZOOM_MIN, ZOOM_MAX);
    const estSizeMB = estimateSizeMB(tileCount, STYLE_KEY);
    const breakdown = getTileBreakdown(bounds, ZOOM_MIN, ZOOM_MAX);

    return { bounds, tileCount, estSizeMB, breakdown, points };
  }, [waypointCoords]);

  // ── Check for existing cached region ──────────────────

  useEffect(() => {
    const existing = findExistingRegion(expeditionId);
    setExistingRegion(existing ?? null);

    if (existing) {
      if (existing.status === 'complete') {
        setCardState('cached');
      } else if (existing.status === 'downloading') {
        setCardState('caching');
      } else if (existing.status === 'error') {
        setCardState('error');
        setError(existing.errorMessage || 'Previous download failed');
      } else {
        setCardState('estimate');
      }
    } else {
      setCardState('estimate');
    }

    // Subscribe to store changes
    const unsub = tileCacheStore.subscribe(() => {
      if (!mountedRef.current) return;
      const updated = findExistingRegion(expeditionId);
      setExistingRegion(updated ?? null);
      if (updated?.status === 'complete') setCardState('cached');
    });

    return unsub;
  }, [expeditionId]);

  // ── Progress animation ────────────────────────────────

  useEffect(() => {
    if (progress) {
      Animated.timing(progressAnim, {
        toValue: progress.percent,
        duration: 350,
        useNativeDriver: false,
      }).start();
    }
  }, [progress, progressAnim]);

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
  }, [cardState, pulseAnim]);

  // ── Handlers ──────────────────────────────────────────

  const handleStartCache = useCallback(async () => {
    if (!routeAnalysis) return;
    setError(null);
    setCardState('caching');
    setExpanded(true);

    const regionName = `${REGION_PREFIX}${expeditionId}`;

    // Check if region already exists (pending/cancelled) — resume or recreate
    let region: TileCacheRegion | null | undefined = findExistingRegion(expeditionId);

    if (!region || region.status === 'error' || region.status === 'cancelled') {
      // Delete old failed region if exists
      if (region) {
        try { await tileCacheStore.deleteRegion(region.id); } catch {}
      }

      // Create new region from route corridor
      region = tileCacheStore.createFromRoute(
        regionName,
        routeAnalysis.points,
        CORRIDOR_MILES,
        ZOOM_MIN,
        ZOOM_MAX,
        STYLE_KEY,
      );

      if (!region) {
        setCardState('error');
        setError('Failed to compute route corridor');
        return;
      }

      // Tag with expedition ID for lookup
      tileCacheStore.updateRegion(region.id, { routeId: expeditionId });
    }

    setExistingRegion(region);

    // Start download with quota management
    const result = await tileCacheStore.startDownloadWithQuota(
      region.id,
      (prog: DownloadProgress) => {
        if (!mountedRef.current) return;
        setProgress(prog);

        if (prog.status === 'complete') {
          setCardState('cached');
          setExistingRegion(tileCacheStore.getRegion(region!.id) ?? null);
        } else if (prog.status === 'error') {
          setCardState('error');
          setError(prog.message || 'Download failed');
        } else if (prog.status === 'cancelled') {
          setCardState('estimate');
        }
      },
    );

    if (!result.success && mountedRef.current) {
      setCardState('error');
      setError('Download failed — check connectivity and storage');
    }
  }, [routeAnalysis, expeditionId]);

  const handleCancel = useCallback(() => {
    if (existingRegion) {
      tileCacheStore.cancelDownload(existingRegion.id);
    }
    setCardState('estimate');
    setProgress(null);
  }, [existingRegion]);

  const handleDeleteCache = useCallback(() => {
    const doDelete = async () => {
      if (!existingRegion) return;
      try {
        await tileCacheStore.deleteRegion(existingRegion.id);
      } catch {}
      if (!mountedRef.current) return;
      setExistingRegion(null);
      setCardState('estimate');
      setProgress(null);
    };

    if (Platform.OS === 'web') {
      if (confirm('Delete cached route tiles for this expedition?')) doDelete();
    } else {
      Alert.alert(
        'Delete Route Cache',
        'Remove all cached map tiles for this expedition route?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: doDelete },
        ],
      );
    }
  }, [existingRegion]);

  const handleRetry = useCallback(() => {
    setError(null);
    handleStartCache();
  }, [handleStartCache]);

  // ── Derived values ────────────────────────────────────

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 100],
    outputRange: ['0%', '100%'],
  });

  // ── Render guards ─────────────────────────────────────

  if (!routeAnalysis || waypointCoords.length < 2) return null;

  // ── CACHED STATE ──────────────────────────────────────

  if (cardState === 'cached' && existingRegion) {
    return (
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.header}
          onPress={() => setExpanded(e => !e)}
          activeOpacity={0.85}
        >
          <View style={[styles.statusDot, { backgroundColor: '#66BB6A' }]} />
          <Ionicons name="checkmark-circle" size={14} color="#66BB6A" />
          <Text style={[styles.headerTitle, { color: '#66BB6A' }]}>ROUTE TILES CACHED</Text>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={TACTICAL.textMuted}
          />
        </TouchableOpacity>

        {expanded && (
          <View style={styles.body}>
            {/* KPI Row */}
            <View style={styles.kpiRow}>
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>
                  {(existingRegion.downloadedTiles || 0).toLocaleString()}
                </Text>
                <Text style={styles.kpiLabel}>TILES</Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>
                  {formatSize(existingRegion.actualSizeMB || existingRegion.estimatedSizeMB)}
                </Text>
                <Text style={styles.kpiLabel}>SIZE</Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>Z{ZOOM_MIN}-{ZOOM_MAX}</Text>
                <Text style={styles.kpiLabel}>ZOOM</Text>
              </View>
              <View style={styles.kpiDivider} />
              <View style={styles.kpi}>
                <Text style={styles.kpiValue}>{CORRIDOR_MILES} mi</Text>
                <Text style={styles.kpiLabel}>BUFFER</Text>
              </View>
            </View>

            {/* Cached date */}
            {existingRegion.completedAt && (
              <Text style={styles.cachedDate}>
                Cached {new Date(existingRegion.completedAt).toLocaleDateString()} at{' '}
                {new Date(existingRegion.completedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </Text>
            )}

            {/* Waypoint count */}
            <View style={styles.infoRow}>
              <Ionicons name="navigate-outline" size={11} color={TACTICAL.textMuted} />
              <Text style={styles.infoText}>
                {waypointCoords.length} waypoints covered with {CORRIDOR_MILES}-mile corridor
              </Text>
            </View>

            {/* Delete button */}
            <TouchableOpacity style={styles.deleteBtn} onPress={handleDeleteCache} activeOpacity={0.8}>
              <Ionicons name="trash-outline" size={12} color={TACTICAL.textMuted} />
              <Text style={styles.deleteBtnText}>DELETE CACHE</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  }

  // ── CACHING STATE ─────────────────────────────────────

  if (cardState === 'caching' && progress) {
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={[styles.statusDot, { backgroundColor: '#FFB300' }]} />
          <Ionicons name="cloud-download-outline" size={14} color="#FFB300" />
          <Text style={[styles.headerTitle, { color: '#FFB300' }]}>CACHING ROUTE TILES</Text>
          <Text style={styles.headerPercent}>{progress.percent}%</Text>
        </View>

        <View style={styles.body}>
          {/* Progress message */}
          <Text style={styles.progressMessage}>{progress.message || 'Downloading...'}</Text>

          {/* Animated progress bar */}
          <View style={styles.progressTrack}>
            <View style={styles.progressMarks}>
              {[25, 50, 75].map(mark => (
                <View
                  key={mark}
                  style={[styles.progressMark, { left: `${mark}%` as any }]}
                />
              ))}
            </View>
            <Animated.View
              style={[
                styles.progressFill,
                { width: progressWidth, opacity: pulseAnim },
              ]}
            />
          </View>

          {/* Stats row */}
          <View style={styles.statsRow}>
            <Text style={styles.stat}>
              {progress.downloadedTiles.toLocaleString()}/{progress.totalTiles.toLocaleString()}
            </Text>
            <Text style={styles.stat}>{formatSize(progress.downloadedSizeMB)}</Text>
            {progress.speed > 0 && (
              <Text style={styles.stat}>{progress.speed.toFixed(0)} t/s</Text>
            )}
            {progress.eta > 0 && (
              <Text style={styles.stat}>ETA {formatETA(progress.eta)}</Text>
            )}
          </View>

          {/* Zoom level pips */}
          {progress.currentZoom > 0 && (
            <View style={styles.zoomPips}>
              {Array.from({ length: ZOOM_MAX - ZOOM_MIN + 1 }, (_, i) => {
                const z = ZOOM_MIN + i;
                const isDone = z < progress.currentZoom;
                const isActive = z === progress.currentZoom;
                return (
                  <View
                    key={z}
                    style={[
                      styles.zoomPip,
                      isDone && styles.zoomPipDone,
                      isActive && styles.zoomPipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.zoomPipText,
                        isDone && { color: '#66BB6A' },
                        isActive && { color: '#FFB300' },
                      ]}
                    >
                      {z}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Cancel button */}
          <TouchableOpacity style={styles.cancelBtn} onPress={handleCancel} activeOpacity={0.8}>
            <Ionicons name="close-circle-outline" size={12} color="#FFB300" />
            <Text style={styles.cancelBtnText}>CANCEL DOWNLOAD</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── ERROR STATE ───────────────────────────────────────

  if (cardState === 'error') {
    return (
      <View style={[styles.card, { borderColor: 'rgba(239,83,80,0.25)' }]}>
        <View style={styles.header}>
          <View style={[styles.statusDot, { backgroundColor: '#EF5350' }]} />
          <Ionicons name="warning-outline" size={14} color="#EF5350" />
          <Text style={[styles.headerTitle, { color: '#EF5350' }]}>CACHE ERROR</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error || 'Download failed'}</Text>
          </View>
          <TouchableOpacity style={styles.retryBtn} onPress={handleRetry} activeOpacity={0.8}>
            <Ionicons name="refresh-outline" size={14} color="#0B0F12" />
            <Text style={styles.retryBtnText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── ESTIMATE STATE (default) ──────────────────────────

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.85}
      >
        <View style={[styles.statusDot, { backgroundColor: TACTICAL.amber }]} />
        <Ionicons name="map-outline" size={14} color={TACTICAL.amber} />
        <Text style={[styles.headerTitle, { color: TACTICAL.amber }]}>OFFLINE MAP CACHE</Text>
        <Ionicons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={TACTICAL.textMuted}
        />
      </TouchableOpacity>

      {/* Collapsed summary */}
      {!expanded && (
        <View style={styles.collapsedSummary}>
          <Text style={styles.collapsedText}>
            {routeAnalysis.tileCount.toLocaleString()} tiles
            {' \u2022 '}
            ~{formatSize(routeAnalysis.estSizeMB)}
            {' \u2022 '}
            {waypointCoords.length} waypoints
          </Text>
          <TouchableOpacity
            style={styles.collapsedCacheBtn}
            onPress={handleStartCache}
            activeOpacity={0.8}
          >
            <Ionicons name="cloud-download-outline" size={11} color="#0B0F12" />
            <Text style={styles.collapsedCacheBtnText}>CACHE</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Expanded detail */}
      {expanded && (
        <View style={styles.body}>
          {/* Route analysis KPIs */}
          <View style={styles.kpiRow}>
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>
                {routeAnalysis.tileCount >= 1000
                  ? `${(routeAnalysis.tileCount / 1000).toFixed(1)}K`
                  : routeAnalysis.tileCount}
              </Text>
              <Text style={styles.kpiLabel}>TILES</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>~{formatSize(routeAnalysis.estSizeMB)}</Text>
              <Text style={styles.kpiLabel}>EST. SIZE</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>Z{ZOOM_MIN}-{ZOOM_MAX}</Text>
              <Text style={styles.kpiLabel}>ZOOM</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpi}>
              <Text style={styles.kpiValue}>{CORRIDOR_MILES} mi</Text>
              <Text style={styles.kpiLabel}>BUFFER</Text>
            </View>
          </View>

          {/* Info text */}
          <View style={styles.infoRow}>
            <Ionicons name="information-circle-outline" size={12} color={TACTICAL.textMuted} />
            <Text style={styles.infoText}>
              Pre-download map tiles along your {waypointCoords.length}-waypoint route
              with a {CORRIDOR_MILES}-mile corridor buffer for offline navigation.
            </Text>
          </View>

          {/* Zoom breakdown toggle */}
          <TouchableOpacity
            style={styles.breakdownToggle}
            onPress={() => setShowBreakdown(b => !b)}
            activeOpacity={0.8}
          >
            <Text style={styles.breakdownToggleText}>
              {showBreakdown ? 'HIDE' : 'SHOW'} ZOOM BREAKDOWN
            </Text>
            <Ionicons
              name={showBreakdown ? 'chevron-up' : 'chevron-down'}
              size={10}
              color={TACTICAL.textMuted}
            />
          </TouchableOpacity>

          {showBreakdown && (
            <View style={styles.breakdownList}>
              {routeAnalysis.breakdown.map(z => {
                const maxTiles = Math.max(...routeAnalysis.breakdown.map(b => b.tiles));
                return (
                  <View key={z.zoom} style={styles.breakdownRow}>
                    <Text style={styles.breakdownZoom}>Z{z.zoom}</Text>
                    <View style={styles.breakdownBarBg}>
                      <View
                        style={[
                          styles.breakdownBarFill,
                          {
                            width: `${Math.max(2, (z.tiles / maxTiles) * 100)}%` as any,
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.breakdownTiles}>{z.tiles.toLocaleString()}</Text>
                    <Text style={styles.breakdownSize}>{z.sizeMB.toFixed(1)} MB</Text>
                  </View>
                );
              })}
            </View>
          )}

          {/* Action buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.cacheBtn}
              onPress={handleStartCache}
              activeOpacity={0.8}
              disabled={routeAnalysis.tileCount > 100000}
            >
              <Ionicons name="cloud-download-outline" size={15} color="#0B0F12" />
              <Text style={styles.cacheBtnText}>
                {routeAnalysis.tileCount > 100000 ? 'TOO MANY TILES' : 'CACHE ROUTE TILES'}
              </Text>
            </TouchableOpacity>
          </View>

          {routeAnalysis.tileCount > 100000 && (
            <Text style={styles.warningText}>
              Route covers too many tiles ({routeAnalysis.tileCount.toLocaleString()}).
              Reduce zoom range or corridor width.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────

const MONO = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' });

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.35)',
    marginBottom: 14,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.15)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  headerTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
    flex: 1,
  },
  headerPercent: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFB300',
    fontFamily: MONO,
  },
  body: {
    padding: 14,
    gap: 10,
  },

  // ── Collapsed summary ───────────────────────────────
  collapsedSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  collapsedText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: MONO,
    flex: 1,
  },
  collapsedCacheBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
    marginLeft: 10,
  },
  collapsedCacheBtnText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1,
  },

  // ── KPI row ─────────────────────────────────────────
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  kpi: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
  },
  kpiValue: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: MONO,
  },
  kpiLabel: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  kpiDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(62,79,60,0.2)',
  },

  // ── Info row ────────────────────────────────────────
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 4,
  },
  infoText: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    flex: 1,
    lineHeight: 15,
  },

  // ── Breakdown ───────────────────────────────────────
  breakdownToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.12)',
  },
  breakdownToggleText: {
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  breakdownList: {
    gap: 4,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownZoom: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    width: 24,
    fontFamily: MONO,
  },
  breakdownBarBg: {
    flex: 1,
    height: 4,
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
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.text,
    width: 42,
    textAlign: 'right',
    fontFamily: MONO,
  },
  breakdownSize: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    width: 40,
    textAlign: 'right',
    fontFamily: MONO,
  },

  // ── Progress ────────────────────────────────────────
  progressMessage: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.text,
  },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(62,79,60,0.2)',
    borderRadius: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  progressMarks: {
    ...StyleSheet.absoluteFillObject,
  },
  progressMark: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: 'rgba(62,79,60,0.3)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#FFB300',
    borderRadius: 4,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  stat: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: MONO,
  },

  // ── Zoom pips ───────────────────────────────────────
  zoomPips: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  zoomPip: {
    width: 22,
    height: 18,
    borderRadius: 4,
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
    fontSize: 8,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    fontFamily: MONO,
  },

  // ── Action buttons ──────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  cacheBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  cacheBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.2,
  },
  cancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,179,0,0.25)',
    backgroundColor: 'rgba(255,179,0,0.06)',
  },
  cancelBtnText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFB300',
    letterSpacing: 1,
  },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.2)',
    backgroundColor: 'rgba(138,138,133,0.04)',
  },
  deleteBtnText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },

  // ── Cached date ─────────────────────────────────────
  cachedDate: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },

  // ── Error ───────────────────────────────────────────
  errorBox: {
    padding: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.15)',
  },
  errorText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#EF5350',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  retryBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.2,
  },

  // ── Warning ─────────────────────────────────────────
  warningText: {
    fontSize: 9,
    fontWeight: '500',
    color: '#FF7043',
    textAlign: 'center',
    lineHeight: 14,
  },
});



