/**
 * Navigate Run Detail — Phase 2.5/2.6
 *
 * Displays:
 *   - Full Mapbox map with segmented heat map (green/yellow/red per segment)
 *   - Bailout point markers on map
 *   - Segment tap → detail modal with risk reasons
 *   - Exit Plan panel (nearest bailout, max remoteness)
 *   - Run Health status panel
 *   - Route statistics + coordinates
 *   - Build snapshot summary
 *   - Export GPX buttons
 *   - Bailouts management section
 *
 * Falls back to Phase 1 SVG polyline if no Mapbox token.
 * Works fully offline after import.
 */

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Share,
  Dimensions,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL, TYPO, DENSITY } from '../lib/theme';
import { useApp } from '../context/AppContext';
import type { GPSPosition } from '../lib/useGPSLocation';
import {
  runStore,
  computeRunHealth,
  generateRunGPX,
  metersToMiles,
  type ECSRun,
} from '../lib/runStore';
import { navigateRouteSessionStore } from '../lib/navigateRouteSessionStore';
import { getMapboxToken, type MapStyleKey } from '../lib/mapConfig';
import { connectivity } from '../lib/connectivity';
import {
  getSegmentColor,
  type RunSegment,
  type SegmentRiskProfile,
  computeSegmentRisk,
} from '../lib/segmentRiskEngine';
import {
  cacheOfflineRoute,
  getOfflineCachedRoute,
  getOfflineCachedRouteBySourceRouteId,
  markOfflineRouteCacheFailed,
  offlineCachedRouteToRun,
  offlineCachedRouteToRunCacheManifest,
  type OfflineRouteCacheStatus,
} from '../lib/offlineRouteCacheService';
import {
  bailoutStore,
  getBailoutTypeMeta,
  type BailoutPoint,
  type ExitPlan,
} from '../lib/bailoutStore';
import RunHealthBadge from '../components/navigate/RunHealthBadge';
import RoutePolyline from '../components/navigate/RoutePolyline';
import BuildSnapshotCard from '../components/navigate/BuildSnapshotCard';
import MapRenderer from '../components/navigate/MapRenderer';
import MapOverlayControls from '../components/navigate/MapOverlayControls';
import ExitPlanPanel from '../components/navigate/ExitPlanPanel';
import RouteTileCacheCard from '../components/navigate/RouteTileCacheCard';
import Toast from '../components/Toast';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

type CameraMode = 'free' | 'follow-north' | 'follow-heading';

const NAVIGATION_GPS_MAX_AGE_MS = 2 * 60 * 1000;

function isSegmentRiskProfile(value: unknown): value is SegmentRiskProfile {
  return !!value && typeof value === 'object' && Array.isArray((value as any).segments);
}

function isFreshGpsPosition(position: GPSPosition | null): position is GPSPosition {
  return !!position && Date.now() - position.timestamp <= NAVIGATION_GPS_MAX_AGE_MS;
}

function gpsPositionFromCoords(coords: any, timestamp?: number): GPSPosition {
  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    altitudeFt: coords.altitude != null ? coords.altitude * 3.28084 : null,
    speedMph: coords.speed != null && coords.speed >= 0 ? coords.speed * 2.23694 : null,
    headingDeg: coords.heading != null && coords.heading >= 0 ? coords.heading : null,
    accuracyM: coords.accuracy != null ? coords.accuracy : null,
    timestamp: timestamp || Date.now(),
  };
}

async function requestImmediateGpsPosition(): Promise<GPSPosition | null> {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve(gpsPositionFromCoords(pos.coords, pos.timestamp)),
        (err) => reject(new Error(err?.message || 'GPS fix unavailable')),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
    });
  }

  if (Platform.OS !== 'web') {
    const Location = await import('expo-location');
    const servicesEnabled = await Location.hasServicesEnabledAsync();
    if (!servicesEnabled) {
      throw new Error('Location services are disabled.');
    }

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      throw new Error('Location permission is required to start navigation.');
    }

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    return gpsPositionFromCoords(loc.coords, loc.timestamp);
  }

  return null;
}

function describeOfflineRouteCache(
  status?: string | null,
  tileRegionId?: string | null,
): string {
  if (status === 'complete' && tileRegionId) {
    return 'Route and map area cached.';
  }
  if (status === 'downloading') {
    return 'Route cached; map area cache is still downloading.';
  }
  if (status === 'failed') {
    return 'Route cached; map tiles unavailable offline.';
  }
  if (status === 'unavailable') {
    return 'Route cached; map tiles unavailable offline.';
  }
  return 'Route cached; map tiles unavailable offline.';
}

export default function NavigateRunDetail() {
  const router = useRouter();
  const { showToast } = useApp();
  const params = useLocalSearchParams<{ runId?: string }>();
  const runId = params.runId || '';

  const [run, setRun] = useState<ECSRun | null>(null);
  const [isRunLoading, setIsRunLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [isExporting, setIsExporting] = useState(false);

  const [mapToken, setMapToken] = useState<string | null>(null);
  const [mapStyle, setMapStyle] = useState<MapStyleKey>('tactical');

  // Default to route view on this screen so imported runs are visible immediately.
  const [cameraMode, setCameraMode] = useState<CameraMode>('free');
  const [mapExpanded, setMapExpanded] = useState(false);
  const [offlineCacheStatus, setOfflineCacheStatus] = useState<OfflineRouteCacheStatus>('not_cached');
  const [offlineCacheMessage, setOfflineCacheMessage] = useState<string | null>(null);
  const [loadedFromOfflineCache, setLoadedFromOfflineCache] = useState(false);

  const [selectedSegment, setSelectedSegment] = useState<RunSegment | null>(null);
  const [segDetailVisible, setSegDetailVisible] = useState(false);
  const [bailouts, setBailouts] = useState<BailoutPoint[]>([]);
  const [navigationStarting, setNavigationStarting] = useState(false);
  const [runDetailGpsPosition, setRunDetailGpsPosition] = useState<GPSPosition | null>(null);

  const userLocation = useMemo(
    () =>
      runDetailGpsPosition
        ? {
            lat: runDetailGpsPosition.latitude,
            lng: runDetailGpsPosition.longitude,
          }
        : null,
    [runDetailGpsPosition]
  );

  const vehicleHeading = runDetailGpsPosition?.headingDeg ?? null;
  const isFollowing = cameraMode !== 'free';
  const isHeadingMode = cameraMode === 'follow-heading';

  useEffect(() => {
    let cancelled = false;
    requestImmediateGpsPosition()
      .then((position) => {
        if (!cancelled && position) setRunDetailGpsPosition(position);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!runId) {
      setRun(null);
      setIsRunLoading(false);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempts = 0;
    const maxAttempts = 12;
    let offlineFallbackRequested = false;
    let resolvedOfflineRun = false;
    setRun(null);
    setIsRunLoading(true);

    const loadRun = () => {
      if (cancelled) return;
      if (resolvedOfflineRun) return;

      const latest = runStore.getById(runId);

      if (latest) {
        setLoadedFromOfflineCache(false);
        setOfflineCacheStatus(latest.offline_cache ? 'cached' : 'not_cached');
        setOfflineCacheMessage(
          latest.offline_cache
            ? `${describeOfflineRouteCache(
                latest.offline_cache.tile_cache_status,
                latest.offline_cache.tile_region_id,
              )} Saved ${new Date(latest.offline_cache.cached_at).toLocaleDateString()}.`
            : connectivity.isOnline()
              ? null
              : 'Offline cache unavailable for this route.'
        );

        if ((latest.points?.length ?? 0) > 0) {
          setRun(latest);
          setIsRunLoading(false);
          return;
        }
      }

      if ((!latest || (latest.points?.length ?? 0) < 2) && !offlineFallbackRequested) {
        offlineFallbackRequested = true;
        Promise.all([getOfflineCachedRoute(runId), getOfflineCachedRouteBySourceRouteId(runId)])
          .then((cachedRoute) => {
            if (cancelled) return;
            const resolvedRoute = cachedRoute[0] ?? cachedRoute[1];
            if (!resolvedRoute) return;
            resolvedOfflineRun = true;
            setRun(offlineCachedRouteToRun(resolvedRoute));
            setLoadedFromOfflineCache(true);
            setIsRunLoading(false);
            setOfflineCacheStatus(resolvedRoute.cacheStatus === 'failed' ? 'failed' : 'cached');
            setOfflineCacheMessage(
              `Loaded from offline route cache. ${describeOfflineRouteCache(
                resolvedRoute.tileCacheStatus,
                resolvedRoute.offlineTileRegionId,
              )}`,
            );
          })
          .catch(() => {
            if (!cancelled) {
              setOfflineCacheMessage('Offline cache unavailable for this route.');
            }
          });
      }

      attempts += 1;
      if (attempts < maxAttempts) {
        retryTimer = setTimeout(loadRun, 150);
      } else if (!latest || (latest.points?.length ?? 0) < 2) {
        setIsRunLoading(false);
        setOfflineCacheMessage('Offline cache unavailable for this route.');
      }
    };

    loadRun();

    return () => {
      cancelled = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [runId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await getMapboxToken();
      if (!cancelled) {
        setMapToken(token || '');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (run) {
      setEditTitle(run.title || '');
    }
  }, [run]);

  useEffect(() => {
    if (!runId) return;

    const runBailouts = bailoutStore.getRunBailouts(runId);
    if (runBailouts.length > 0) {
      setBailouts(runBailouts);
    } else {
      setBailouts(bailoutStore.getAll());
    }
  }, [runId]);

  const health = useMemo(() => (run ? computeRunHealth(run) : null), [run]);
  const hasToken = !!(mapToken && mapToken.length > 0);
  const mapHeight = mapExpanded ? SCREEN_H - 140 : Math.min(SCREEN_H * 0.42, 360);

  const cachedSegmentProfile = useMemo<SegmentRiskProfile | null>(() => {
    const cached = run?.offline_cache?.segment_risk;
    return isSegmentRiskProfile(cached) ? cached : null;
  }, [run?.offline_cache?.segment_risk]);

  const segmentProfile = useMemo<SegmentRiskProfile | null>(() => {
    if (cachedSegmentProfile) return cachedSegmentProfile;
    if (!run || run.points.length < 2) return null;
    if (loadedFromOfflineCache && !connectivity.isOnline()) return null;
    return computeSegmentRisk(run.id, run.points, run.build_snapshot);
  }, [cachedSegmentProfile, loadedFromOfflineCache, run]);

  const enrichedProfile = useMemo(() => {
    if (!segmentProfile || bailouts.length === 0) return segmentProfile;
    const result = bailoutStore.computeRemoteness(segmentProfile.segments, bailouts);
    return {
      ...segmentProfile,
      segments: result.segments,
    };
  }, [segmentProfile, bailouts]);

  const exitPlan = useMemo<ExitPlan | null>(() => {
    if (!enrichedProfile || bailouts.length === 0) return null;
    return bailoutStore.computeExitPlan(enrichedProfile.segments, bailouts);
  }, [enrichedProfile, bailouts]);

  const segmentFeatures = useMemo(() => {
    if (!enrichedProfile || !run) return undefined;

    return enrichedProfile.segments.map((seg) => {
      const coords: [number, number][] = [];

      for (let i = seg.start_idx; i <= seg.end_idx && i < run.points.length; i += 1) {
        const point = run.points[i];
        if (point && typeof point.lat === 'number' && typeof point.lng === 'number') {
          coords.push([point.lng, point.lat]);
        }
      }

      return {
        coordinates: coords,
        color: getSegmentColor(seg),
        risk_level: seg.risk_level,
        seg_index: seg.seg_index,
        risk_score: seg.risk_score + seg.remoteness_score,
        remoteness_level: seg.remoteness_level,
      };
    });
  }, [enrichedProfile, run]);

  const bailoutMarkers = useMemo(() => {
    return bailouts.map((bp) => {
      const meta = getBailoutTypeMeta(bp.type);
      return {
        id: bp.id,
        lat: bp.lat,
        lng: bp.lng,
        title: bp.title,
        type: bp.type,
        color: meta.color,
      };
    });
  }, [bailouts]);

  const mapRunPoints = useMemo(() => {
    if (!run) return [];

    const preferred = run.points.filter(
      (p: any) =>
        p &&
        (p.type === 'route' || p.type === 'track') &&
        typeof p.lat === 'number' &&
        typeof p.lng === 'number'
    );

    const fallback = run.points.filter(
      (p: any) => p && typeof p.lat === 'number' && typeof p.lng === 'number'
    );

    return preferred.length > 0 ? preferred : fallback;
  }, [run]);

  const routePoints = useMemo(
    () => run?.points.filter((p: any) => p.type === 'route') ?? [],
    [run]
  );

  const trackPoints = useMemo(
    () => run?.points.filter((p: any) => p.type === 'track') ?? [],
    [run]
  );

  const riskProfile = enrichedProfile || segmentProfile;
  const offlineCacheLabel = useMemo(() => {
    switch (offlineCacheStatus) {
      case 'caching':
        return 'Caching';
      case 'cached':
        return 'Cached';
      case 'failed':
        return 'Cache Failed';
      case 'not_cached':
      default:
        return 'Not Cached';
    }
  }, [offlineCacheStatus]);
  const offlineCacheColor =
    offlineCacheStatus === 'cached'
      ? '#66BB6A'
      : offlineCacheStatus === 'caching'
        ? '#FFB300'
        : offlineCacheStatus === 'failed'
          ? '#EF5350'
          : TACTICAL.textMuted;

  const handleSaveTitle = useCallback(() => {
    if (!run || !editTitle.trim()) return;

    const updated = runStore.updateTitle(run.id, editTitle.trim());
    if (updated) setRun(updated);

    setIsEditing(false);
    showToast('RUN TITLE UPDATED');
  }, [run, editTitle, showToast]);

  const handleExportGPX = useCallback(async () => {
    if (!run) return;

    setIsExporting(true);

    try {
      const gpxXml = generateRunGPX(run);
      const safeName = run.title
        .replace(/[^a-zA-Z0-9_\-\s]/g, '')
        .replace(/\s+/g, '_')
        .substring(0, 50)
        .toLowerCase();
      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `ecs_${safeName}_${dateStr}.gpx`;

      if (Platform.OS === 'web') {
        const blob = new Blob([gpxXml], { type: 'application/gpx+xml' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        anchor.style.display = 'none';
        document.body.appendChild(anchor);
        anchor.click();

        setTimeout(() => {
          document.body.removeChild(anchor);
          URL.revokeObjectURL(url);
        }, 100);

        showToast(`EXPORTED: ${filename}`);
      } else {
        await Share.share({ message: gpxXml, title: filename });
        showToast('GPX SHARED');
      }
    } catch (err: any) {
      if (err?.message !== 'User did not share') {
        showToast('EXPORT FAILED');
      }
    } finally {
      setIsExporting(false);
    }
  }, [run, showToast]);

  const handleDelete = useCallback(() => {
    if (!run) return;

    const doDelete = () => {
      runStore.delete(run.id);
      showToast('RUN DELETED');
      router.back();
    };

    if (Platform.OS === 'web') {
      if (confirm('Delete this run?')) {
        doDelete();
      }
    } else {
      Alert.alert('Delete Run', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: doDelete },
      ]);
    }
  }, [run, showToast, router]);

  const handleSetActive = useCallback(() => {
    if (!run) return;
    runStore.setActive(run.id);
    setRun(runStore.getById(run.id));
    showToast('RUN SET AS ACTIVE');
  }, [run, showToast]);

  const cacheRunForOfflineNavigation = useCallback(
    async (
      tileRegionId?: string | null,
      tileCacheStatus: 'not_requested' | 'downloading' | 'complete' | 'failed' | 'unavailable' =
        tileRegionId ? 'complete' : 'not_requested',
      tileCacheError?: string | null,
      options?: { includeRemoteConnectivityCache?: boolean },
    ) => {
      if (!run || !health) return null;

      setOfflineCacheStatus('caching');
      setOfflineCacheMessage('Saving route geometry and run detail for offline navigation...');

      try {
        const cachedRoute = await cacheOfflineRoute({
          run,
          health,
          segmentRiskAnalysis: riskProfile,
          offlineTileRegionId: tileRegionId ?? run.offline_cache?.tile_region_id ?? null,
          tileCacheStatus,
          tileCacheError,
          includeRemoteConnectivityCache: options?.includeRemoteConnectivityCache ?? true,
        });

        const updated = runStore.cacheOffline(
          run.id,
          offlineCachedRouteToRunCacheManifest(cachedRoute, run),
        );

        if (updated) setRun(updated);
        setOfflineCacheStatus('cached');
        setOfflineCacheMessage(
          describeOfflineRouteCache(cachedRoute.tileCacheStatus, cachedRoute.offlineTileRegionId)
        );
        return updated;
      } catch (err: any) {
        setOfflineCacheStatus('failed');
        setOfflineCacheMessage(err?.message || 'Offline route cache failed.');
        return null;
      }
    },
    [health, riskProfile, run]
  );

  const handleOfflineRouteCacheFailure = useCallback(
    async (message: string) => {
      if (!run) return;
      await markOfflineRouteCacheFailed(run, message).catch(() => null);
      setOfflineCacheStatus('failed');
      setOfflineCacheMessage(message);
    },
    [run]
  );

  const handleNavigateRun = useCallback(async () => {
    if (!run || navigationStarting) return;

    const routePoints = mapRunPoints.map((point) => ({
      lat: point.lat,
      lng: point.lng,
    }));

    if (routePoints.length < 2) {
      showToast('ROUTE GEOMETRY UNAVAILABLE');
      return;
    }

    setNavigationStarting(true);
    try {
      const startPosition = isFreshGpsPosition(runDetailGpsPosition)
        ? runDetailGpsPosition
        : await requestImmediateGpsPosition();

      if (!startPosition) {
        showToast('WAITING FOR GPS FIX TO START NAVIGATION');
        return;
      }
      setRunDetailGpsPosition(startPosition);

      const storedRun = runStore.upsert(run);
      runStore.setActive(storedRun.id);
      const updated = runStore.getById(storedRun.id) ?? storedRun;
      setRun(updated);

      navigateRouteSessionStore.setSnapshot({
        sessionId: `run-${updated.id}`,
        lifecycle: 'active',
        source: 'run',
        routeId: updated.id,
        routeTitle: updated.title,
        routeSubtitle: `${updated.stats.distance_miles.toFixed(1)} mi imported route`,
        statusLabel: 'Route navigation active',
        instruction: 'Navigation started. Proceed to the highlighted route.',
        routePoints,
        progressPoints: [{ lat: startPosition.latitude, lng: startPosition.longitude }],
        currentLocation: {
          latitude: startPosition.latitude,
          longitude: startPosition.longitude,
        },
        headingDeg: startPosition.headingDeg ?? vehicleHeading,
        remainingDistanceM: updated.stats.distance_m,
        remainingDurationS: null,
        etaIso: null,
        progressPercent: 0,
        nextInstructionDistanceM: null,
        isRerouting: false,
        isOffRoute: false,
        offRouteDistanceM: null,
        routeStatusKind: 'nominal',
        updatedAt: new Date().toISOString(),
      });
      showToast('NAVIGATION STARTED. PROCEED TO THE HIGHLIGHTED ROUTE.');
      router.back();
    } catch (err: any) {
      const message = String(err?.message || '');
      if (/permission/i.test(message)) {
        showToast('LOCATION PERMISSION REQUIRED');
      } else {
        showToast('WAITING FOR GPS FIX TO START NAVIGATION');
      }
    } finally {
      setNavigationStarting(false);
    }
  }, [
    mapRunPoints,
    navigationStarting,
    router,
    run,
    runDetailGpsPosition,
    showToast,
    vehicleHeading,
  ]);

  const openSegmentRiskAnalysis = useCallback(() => {
    if (!riskProfile?.segments.length) return;
    setSelectedSegment(riskProfile.max_risk_segment ?? riskProfile.segments[0]);
    setSegDetailVisible(true);
  }, [riskProfile]);

  const handleSegmentTap = useCallback(
    (segIndex: number) => {
      if (!enrichedProfile) return;
      const seg = enrichedProfile.segments.find((s) => s.seg_index === segIndex);
      if (seg) {
        setSelectedSegment(seg);
        setSegDetailVisible(true);
      }
    },
    [enrichedProfile]
  );

  if (!run) {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={TACTICAL.text} />
          </TouchableOpacity>
          <Text style={styles.topTitle}>{isRunLoading ? 'LOADING RUN' : 'RUN NOT FOUND'}</Text>
        </View>

        <View style={styles.emptyState}>
          <Ionicons
            name={isRunLoading ? 'sync-outline' : 'alert-circle-outline'}
            size={48}
            color={TACTICAL.textMuted}
          />
          <Text style={styles.emptyText}>
            {isRunLoading
              ? 'Checking local route data and offline cache...'
              : offlineCacheMessage || 'This run could not be loaded.'}
          </Text>
          {!isRunLoading ? (
            <TouchableOpacity style={styles.backNavBtn} onPress={() => router.back()}>
              <Text style={styles.backNavBtnText}>BACK TO NAVIGATE</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TACTICAL.text} />
        </TouchableOpacity>

        <Text style={styles.topTitle} numberOfLines={1}>
          RUN DETAIL
        </Text>

        <View style={styles.topActions}>
          {!run.is_active && (
            <TouchableOpacity onPress={handleSetActive} style={styles.topActionBtn}>
              <Ionicons name="radio-button-off-outline" size={18} color={TACTICAL.amber} />
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={handleDelete} style={styles.topActionBtn}>
            <Ionicons name="trash-outline" size={18} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollEnabled={!mapExpanded}
      >
        <View style={styles.titleSection}>
          {run.is_active && (
            <View style={styles.activeBadge}>
              <View style={styles.activeDot} />
              <Text style={styles.activeBadgeText}>ACTIVE</Text>
            </View>
          )}

          {isEditing ? (
            <View style={styles.editRow}>
              <TextInput
                style={styles.editInput}
                value={editTitle}
                onChangeText={setEditTitle}
                autoFocus
                selectTextOnFocus
              />

              <TouchableOpacity onPress={handleSaveTitle} style={styles.editSaveBtn}>
                <Ionicons name="checkmark" size={18} color="#0B0F12" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  setIsEditing(false);
                  setEditTitle(run.title);
                }}
                style={styles.editCancelBtn}
              >
                <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => {
                setEditTitle(run.title);
                setIsEditing(true);
              }}
              style={styles.titleTouchable}
            >
              <Text style={styles.runTitle}>{run.title}</Text>
              <Ionicons name="pencil-outline" size={14} color={TACTICAL.textMuted} />
            </TouchableOpacity>
          )}

          <Text style={styles.runMeta}>
            {run.source.toUpperCase()} — {new Date(run.created_at).toLocaleDateString()} —{' '}
            {run.stats.point_count} points
          </Text>
          <View style={[styles.offlineStatusPill, { borderColor: offlineCacheColor + '66' }]}>
            <View style={[styles.offlineStatusDot, { backgroundColor: offlineCacheColor }]} />
            <Text style={[styles.offlineStatusText, { color: offlineCacheColor }]}>
              Offline Cache: {offlineCacheLabel}
            </Text>
          </View>
          {offlineCacheMessage ? (
            <Text style={styles.offlineStatusMessage}>{offlineCacheMessage}</Text>
          ) : null}
          {run.points.length > 1 ? (
            <TouchableOpacity
              style={[
                styles.navigateRouteButton,
                navigationStarting && styles.navigateRouteButtonDisabled,
              ]}
              onPress={handleNavigateRun}
              activeOpacity={0.86}
              disabled={navigationStarting}
            >
              <Ionicons name="navigate-outline" size={15} color="#0B0F12" />
              <Text style={styles.navigateRouteButtonText}>
                {navigationStarting ? 'STARTING...' : 'NAVIGATE ROUTE'}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {health && <RunHealthBadge health={health} />}

        {riskProfile && riskProfile.segments.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="pulse-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.sectionTitle}>SEGMENT RISK ANALYSIS</Text>
              <Text style={styles.sectionSub}>PHASE 2.5</Text>
            </View>

            <TouchableOpacity
              style={styles.riskSummaryCard}
              onPress={openSegmentRiskAnalysis}
              activeOpacity={0.88}
              accessibilityRole="button"
              accessibilityLabel="Open segment risk analysis"
            >
              <View style={styles.riskStatsRow}>
                <RiskStat label="SEGMENTS" value={`${riskProfile.segments.length}`} />
                <RiskStat
                  label="GREEN"
                  value={`${riskProfile.total_green_segments}`}
                  color="#66BB6A"
                />
                <RiskStat
                  label="YELLOW"
                  value={`${riskProfile.total_yellow_segments}`}
                  color="#FFB300"
                />
                <RiskStat
                  label="RED"
                  value={`${riskProfile.total_red_segments}`}
                  color="#EF5350"
                />
              </View>

              <View style={styles.riskBarContainer}>
                {riskProfile.segments.length > 0 && (
                  <View style={styles.riskBar}>
                    {riskProfile.total_green_segments > 0 && (
                      <View
                        style={[
                          styles.riskBarSeg,
                          {
                            flex: riskProfile.total_green_segments,
                            backgroundColor: '#66BB6A',
                          },
                        ]}
                      />
                    )}
                    {riskProfile.total_yellow_segments > 0 && (
                      <View
                        style={[
                          styles.riskBarSeg,
                          {
                            flex: riskProfile.total_yellow_segments,
                            backgroundColor: '#FFB300',
                          },
                        ]}
                      />
                    )}
                    {riskProfile.total_red_segments > 0 && (
                      <View
                        style={[
                          styles.riskBarSeg,
                          {
                            flex: riskProfile.total_red_segments,
                            backgroundColor: '#EF5350',
                          },
                        ]}
                      />
                    )}
                  </View>
                )}
              </View>

              {riskProfile.max_risk_segment && (
                <TouchableOpacity
                  style={styles.maxRiskRow}
                  onPress={() => {
                    setSelectedSegment(riskProfile.max_risk_segment);
                    setSegDetailVisible(true);
                  }}
                >
                  <Ionicons name="warning-outline" size={12} color="#EF5350" />
                  <Text style={styles.maxRiskText}>
                    Highest risk: Segment #{riskProfile.max_risk_segment.seg_index + 1} — Score{' '}
                    {Math.round(
                      riskProfile.max_risk_segment.risk_score +
                        riskProfile.max_risk_segment.remoteness_score
                    )}
                  </Text>
                  <Ionicons name="chevron-forward" size={12} color={TACTICAL.textMuted} />
                </TouchableOpacity>
              )}
            </TouchableOpacity>
          </View>
        )}

        {run.points.length > 1 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="map-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.sectionTitle}>ROUTE MAP</Text>
              <Text style={styles.sectionSub}>
                {hasToken ? (segmentFeatures ? 'HEAT MAP' : 'MAPBOX') : 'PHASE 1'}
              </Text>
            </View>

            <View style={[styles.mapContainer, { height: mapHeight }]}>
              {hasToken ? (
                <>
                  <MapRenderer
                    points={mapRunPoints}
                    waypoints={(run.waypoints || []).map((waypoint: any, index: number) => ({
                      id: waypoint?.id ?? `wp_${index}`,
                      latitude: Number(waypoint?.latitude ?? waypoint?.lat ?? 0),
                      longitude: Number(waypoint?.longitude ?? waypoint?.lng ?? 0),
                      title: waypoint?.title ?? waypoint?.name,
                      description: waypoint?.description,
                    }))}
                    healthLevel={health?.overall || 'green'}
                    mapStyle={mapStyle}
                    mapboxToken={mapToken || ''}
                    showUserLocation={!!userLocation}
                    followUser={cameraMode !== 'free'}
                    userLocation={userLocation}
                    vehicleHeading={cameraMode === 'follow-heading' ? vehicleHeading : null}
                    interactive
                    segments={segmentFeatures}
                    bailoutMarkers={bailoutMarkers}
                    onUserDrag={() => setCameraMode('free')}
                  />

                  <MapOverlayControls
                    currentStyle={mapStyle}
                    onStyleChange={setMapStyle}
                    onCenterRoute={() => setCameraMode('free')}
                    onCenterUser={() => {
                      if (userLocation) setCameraMode('follow-north');
                    }}
                    followUser={cameraMode !== 'free'}
                    onToggleFollow={() => {
                      if (!userLocation) return;

                      setCameraMode((prev) => {
                        if (prev === 'free') return 'follow-north';
                        if (prev === 'follow-north') return 'follow-heading';
                        return 'follow-north';
                      });
                    }}
                    healthLevel={health?.overall}
                    hasUserLocation={!!userLocation}
                    hasRoute={mapRunPoints.length > 1}
                  />
                </>
              ) : (
                <RoutePolyline
                  points={mapRunPoints}
                  width={Math.min(SCREEN_W - 32, 500)}
                  height={mapHeight}
                />
              )}

              <TouchableOpacity
                style={styles.expandToggle}
                onPress={() => setMapExpanded(!mapExpanded)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={mapExpanded ? 'contract-outline' : 'expand-outline'}
                  size={14}
                  color={TACTICAL.textMuted}
                />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {exitPlan && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="exit-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.sectionTitle}>EXIT PLAN</Text>
              <Text style={styles.sectionSub}>PHASE 2.6</Text>
            </View>

            <ExitPlanPanel
              exitPlan={exitPlan}
              onViewBailouts={() =>
                router.push({ pathname: '/navigate-bailouts', params: { runId: run.id } } as any)
              }
            />
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="flag-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.sectionTitle}>BAILOUT POINTS</Text>
            <Text style={styles.sectionSub}>{bailouts.length}</Text>
          </View>

          <View style={styles.bailoutCard}>
            {bailouts.length === 0 ? (
              <Text style={styles.bailoutEmpty}>
                No bailout points defined. Add safe exits to enable remoteness scoring.
              </Text>
            ) : (
              <>
                {bailouts.slice(0, 5).map((bp) => {
                  const meta = getBailoutTypeMeta(bp.type);
                  return (
                    <View key={bp.id} style={styles.bailoutRow}>
                      <Ionicons name={meta.icon as any} size={14} color={meta.color} />
                      <Text style={styles.bailoutName} numberOfLines={1}>
                        {bp.title}
                      </Text>
                      <Text style={styles.bailoutType}>{meta.label}</Text>
                    </View>
                  );
                })}

                {bailouts.length > 5 && (
                  <Text style={styles.bailoutMore}>+{bailouts.length - 5} more</Text>
                )}
              </>
            )}

            <TouchableOpacity
              style={styles.manageBailoutBtn}
              onPress={() =>
                router.push({ pathname: '/navigate-bailouts', params: { runId: run.id } } as any)
              }
              activeOpacity={0.8}
            >
              <Ionicons name="settings-outline" size={12} color={TACTICAL.amber} />
              <Text style={styles.manageBailoutText}>MANAGE BAILOUTS</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="analytics-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.sectionTitle}>ROUTE STATISTICS</Text>
          </View>

          <View style={styles.statsCard}>
            <StatsRow
              label="TOTAL DISTANCE"
              value={`${run.stats.distance_miles.toFixed(2)} mi / ${run.stats.distance_km.toFixed(
                2
              )} km`}
            />
            <StatsRow label="POINT COUNT" value={`${run.stats.point_count}`} />
            {routePoints.length > 0 && (
              <StatsRow label="ROUTE POINTS" value={`${routePoints.length}`} />
            )}
            {trackPoints.length > 0 && (
              <StatsRow label="TRACK POINTS" value={`${trackPoints.length}`} />
            )}
            {run.stats.elevation_gain_ft != null && (
              <StatsRow label="ELEVATION GAIN" value={`${run.stats.elevation_gain_ft} ft`} />
            )}
            {run.stats.elevation_loss_ft != null && (
              <StatsRow label="ELEVATION LOSS" value={`${run.stats.elevation_loss_ft} ft`} />
            )}
            {run.stats.min_ele_ft != null && (
              <StatsRow label="MIN ELEVATION" value={`${run.stats.min_ele_ft} ft`} />
            )}
            {run.stats.max_ele_ft != null && (
              <StatsRow label="MAX ELEVATION" value={`${run.stats.max_ele_ft} ft`} />
            )}
          </View>
        </View>

        {run.stats.start_lat != null && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="location-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.sectionTitle}>COORDINATES</Text>
            </View>

            <View style={styles.coordsCard}>
              <View style={styles.coordRow}>
                <View style={[styles.coordMarker, { backgroundColor: '#66BB6A' }]} />
                <View style={styles.coordInfo}>
                  <Text style={styles.coordLabel}>START</Text>
                  <Text style={styles.coordValue}>
                    {run.stats.start_lat?.toFixed(6)}, {run.stats.start_lng?.toFixed(6)}
                  </Text>
                </View>
              </View>

              <View style={styles.coordDivider}>
                <View style={styles.coordLine} />
                <Ionicons name="arrow-down" size={12} color={TACTICAL.textMuted} />
                <View style={styles.coordLine} />
              </View>

              <View style={styles.coordRow}>
                <View style={[styles.coordMarker, { backgroundColor: '#EF5350' }]} />
                <View style={styles.coordInfo}>
                  <Text style={styles.coordLabel}>END</Text>
                  <Text style={styles.coordValue}>
                    {run.stats.end_lat?.toFixed(6)}, {run.stats.end_lng?.toFixed(6)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="car-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.sectionTitle}>BUILD SNAPSHOT</Text>
          </View>
          <BuildSnapshotCard snapshot={run.build_snapshot} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="download-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.sectionTitle}>EXPORT</Text>
          </View>

          <View style={styles.exportCard}>
            <Text style={styles.exportNote}>
              GPX 1.1 - compatible with common GPX navigation apps
            </Text>

            <View style={styles.exportBtns}>
              <TouchableOpacity
                style={styles.exportBtn}
                onPress={handleExportGPX}
                disabled={isExporting}
                activeOpacity={0.8}
              >
                <Ionicons name="download-outline" size={14} color="#0B0F12" />
                <Text style={styles.exportBtnText}>
                  {Platform.OS === 'web' ? 'DOWNLOAD GPX' : 'SHARE GPX'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {run.points.length >= 2 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons name="layers-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.sectionTitle}>OFFLINE TILE CACHE</Text>
              <Text style={styles.sectionSub}>PRE-CACHE</Text>
            </View>

            <RouteTileCacheCard
              run={run}
              floating={false}
              showToast={showToast}
              onCacheStart={async (options) => {
                await cacheRunForOfflineNavigation(null, 'downloading', null, options);
                showToast('ROUTE CACHED; MAP AREA DOWNLOADING');
              }}
              onCacheComplete={async (regionId, options) => {
                await cacheRunForOfflineNavigation(regionId, 'complete', null, options);
                showToast('ROUTE AND MAP AREA CACHED');
              }}
              onCacheError={async (message) => {
                await handleOfflineRouteCacheFailure(message);
                showToast('ROUTE CACHE FAILED');
              }}
            />
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <Modal
        visible={segDetailVisible}
        transparent={false}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSegDetailVisible(false)}
      >
        <View style={styles.segFullScreen}>
          <View style={styles.segFullScreenHeader}>
            <Text style={styles.segFullScreenEyebrow}>SEGMENT RISK ANALYSIS</Text>
            <TouchableOpacity
              style={styles.segCloseButton}
              onPress={() => setSegDetailVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close segment risk analysis"
            >
              <Ionicons name="close" size={22} color={TACTICAL.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.segFullScreenScroll}
            contentContainerStyle={styles.segFullScreenContent}
          >
            {riskProfile && riskProfile.segments.length > 0 ? (
              <>
                <View style={styles.segReportSummary}>
                  <Text style={styles.segReportTitle}>{run.title}</Text>
                  <View style={styles.riskStatsRow}>
                    <RiskStat label="SEGMENTS" value={`${riskProfile.segments.length}`} />
                    <RiskStat
                      label="GREEN"
                      value={`${riskProfile.total_green_segments}`}
                      color="#66BB6A"
                    />
                    <RiskStat
                      label="YELLOW"
                      value={`${riskProfile.total_yellow_segments}`}
                      color="#FFB300"
                    />
                    <RiskStat
                      label="RED"
                      value={`${riskProfile.total_red_segments}`}
                      color="#EF5350"
                    />
                  </View>
                </View>

                {riskProfile.segments.map((segment) => (
                  <SegmentRiskCard
                    key={segment.id}
                    segment={segment}
                    highlighted={selectedSegment?.id === segment.id}
                  />
                ))}
              </>
            ) : (
              <Text style={styles.segReasonText}>No segment risk data is available for this route.</Text>
            )}
          </ScrollView>
        </View>
      </Modal>

      <Toast />
    </View>
  );
}

function StatsRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statsRow}>
      <Text style={styles.statsLabel}>{label}</Text>
      <Text style={styles.statsValue}>{value}</Text>
    </View>
  );
}

function RiskStat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.riskStatItem}>
      <Text style={[styles.riskStatValue, color ? { color } : null]}>{value}</Text>
      <Text style={styles.riskStatLabel}>{label}</Text>
    </View>
  );
}

function getRiskLevelColor(level: string): string {
  if (level === 'red') return '#EF5350';
  if (level === 'yellow') return '#FFB300';
  return '#66BB6A';
}

function getRiskLevelBg(level: string): string {
  if (level === 'red') return 'rgba(239,83,80,0.15)';
  if (level === 'yellow') return 'rgba(255,179,0,0.15)';
  return 'rgba(102,187,106,0.15)';
}

function getRiskReasonColor(code: string): string {
  if (code === 'remoteness') return '#AB47BC';
  if (code.includes('grade')) return '#FFB300';
  if (code.includes('range')) return '#EF5350';
  return '#78909C';
}

function SegmentRiskCard({
  segment,
  highlighted,
}: {
  segment: RunSegment;
  highlighted?: boolean;
}) {
  return (
    <View style={[styles.segCard, highlighted && styles.segCardHighlighted]}>
      <View style={styles.segModalHeader}>
        <View style={[styles.segLevelDot, { backgroundColor: getSegmentColor(segment) }]} />
        <Text style={styles.segModalTitle}>SEGMENT #{segment.seg_index + 1}</Text>
        <Text style={styles.segModalScore}>
          Score: {Math.round(segment.risk_score + segment.remoteness_score)}/100
        </Text>
      </View>

      <View style={styles.segStatsRow}>
        <View style={styles.segStat}>
          <Text style={styles.segStatLabel}>DISTANCE</Text>
          <Text style={styles.segStatValue}>{metersToMiles(segment.distance_m).toFixed(2)} mi</Text>
        </View>

        <View style={styles.segStat}>
          <Text style={styles.segStatLabel}>GRADE</Text>
          <Text style={styles.segStatValue}>
            {segment.grade_pct == null ? 'N/A' : `${Math.abs(segment.grade_pct).toFixed(1)}%`}
          </Text>
        </View>

        <View style={styles.segStat}>
          <Text style={styles.segStatLabel}>BAILOUT</Text>
          <Text style={styles.segStatValue}>
            {segment.bailout_dist_m == null
              ? 'N/A'
              : `${metersToMiles(segment.bailout_dist_m).toFixed(1)} mi`}
          </Text>
        </View>
      </View>

      <View style={styles.segReasonsSection}>
        <Text style={styles.segReasonsTitle}>RISK FACTORS</Text>

        {segment.reasons.length === 0 ? (
          <Text style={styles.segReasonText}>Risk factors not flagged from available data</Text>
        ) : (
          segment.reasons.map((reason, index) => (
            <View key={`${segment.id}-${reason.code}-${index}`} style={styles.segReasonRow}>
              <View
                style={[
                  styles.segReasonDot,
                  { backgroundColor: getRiskReasonColor(reason.code) },
                ]}
              />
              <View style={styles.segReasonContent}>
                <Text style={styles.segReasonLabel}>{reason.label}</Text>
                {reason.value != null && (
                  <Text style={styles.segReasonValue}>
                    {reason.value}
                    {reason.unit}
                  </Text>
                )}
                {reason.detail && <Text style={styles.segReasonDetail}>{reason.detail}</Text>}
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.segLevelRow}>
        <View style={styles.segLevelItem}>
          <Text style={styles.segLevelLabel}>BASE RISK</Text>
          <View
            style={[
              styles.segLevelBadge,
              { backgroundColor: getRiskLevelBg(segment.risk_level) },
            ]}
          >
            <Text style={[styles.segLevelText, { color: getRiskLevelColor(segment.risk_level) }]}>
              {segment.risk_level.toUpperCase()}
            </Text>
          </View>
        </View>

        <View style={styles.segLevelItem}>
          <Text style={styles.segLevelLabel}>REMOTENESS</Text>
          <View
            style={[
              styles.segLevelBadge,
              { backgroundColor: getRiskLevelBg(segment.remoteness_level) },
            ]}
          >
            <Text
              style={[styles.segLevelText, { color: getRiskLevelColor(segment.remoteness_level) }]}
            >
              {segment.remoteness_level.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
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

  topTitle: { ...TYPO.T2, color: TACTICAL.amber, flex: 1 },

  topActions: {
    flexDirection: 'row',
    gap: 4,
  },

  topActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scroll: { flex: 1 },
  scrollContent: { padding: DENSITY.screenPad, gap: DENSITY.cardGap },

  titleSection: { marginBottom: 4 },

  activeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },

  activeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#66BB6A',
  },

  activeBadgeText: { ...TYPO.U2, color: '#66BB6A', fontSize: 8 },

  titleTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  runTitle: { ...TYPO.T0, color: TACTICAL.text, flex: 1 },
  runMeta: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, marginTop: 4 },

  offlineStatusPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    minHeight: 26,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(11,15,18,0.55)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 10,
  },

  offlineStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  offlineStatusText: {
    ...TYPO.U2,
    fontSize: 8,
    letterSpacing: 1,
  },

  offlineStatusMessage: {
    ...TYPO.B2,
    marginTop: 6,
    fontSize: 10,
    color: TACTICAL.textMuted,
  },

  navigateRouteButton: {
    marginTop: 12,
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: TACTICAL.amber,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 14,
  },

  navigateRouteButtonDisabled: {
    opacity: 0.72,
  },

  navigateRouteButtonText: {
    ...TYPO.U1,
    color: '#0B0F12',
    fontSize: 10,
    letterSpacing: 1.2,
  },

  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  editInput: {
    ...TYPO.T0,
    color: TACTICAL.text,
    flex: 1,
    borderBottomWidth: 2,
    borderBottomColor: TACTICAL.amber,
    paddingBottom: 4,
  },

  editSaveBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },

  editCancelBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    alignItems: 'center',
    justifyContent: 'center',
  },

  section: {},

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: DENSITY.titleBodyGap,
  },

  sectionTitle: { ...TYPO.T4, color: TACTICAL.amber, flex: 1 },
  sectionSub: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted },

  riskSummaryCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
  },

  riskStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 10,
  },

  riskStatItem: {
    alignItems: 'center',
    gap: 2,
  },

  riskStatValue: { ...TYPO.K2, color: TACTICAL.text },
  riskStatLabel: { ...TYPO.T4, fontSize: 7, letterSpacing: 2 },

  riskBarContainer: { marginBottom: 8 },

  riskBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },

  riskBarSeg: { height: 6 },

  maxRiskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62,79,60,0.15)',
  },

  maxRiskText: { ...TYPO.B2, fontSize: 10, color: TACTICAL.text, flex: 1 },

  mapContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: TACTICAL.panel,
    position: 'relative',
  },

  expandToggle: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    zIndex: 30,
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(11,15,18,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bailoutCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
    gap: 6,
  },

  bailoutEmpty: { ...TYPO.B2, fontSize: 11, color: TACTICAL.textMuted },

  bailoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },

  bailoutName: { ...TYPO.B1, color: TACTICAL.text, fontSize: 12, flex: 1 },
  bailoutType: { ...TYPO.U2, fontSize: 7, color: TACTICAL.textMuted },
  bailoutMore: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted },

  manageBailoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '30',
    backgroundColor: 'rgba(196,138,44,0.06)',
  },

  manageBailoutText: { ...TYPO.U2, color: TACTICAL.amber, fontSize: 9 },

  statsCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
  },

  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62,79,60,0.1)',
  },

  statsLabel: { ...TYPO.T4, fontSize: 9, letterSpacing: 2 },
  statsValue: { ...TYPO.K2, color: TACTICAL.text, fontSize: 13 },

  coordsCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
  },

  coordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },

  coordMarker: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  coordInfo: { flex: 1 },
  coordLabel: { ...TYPO.T4, fontSize: 8, letterSpacing: 3, marginBottom: 2 },
  coordValue: { ...TYPO.K3, color: TACTICAL.text, fontSize: 11 },

  coordDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 4,
    paddingVertical: 4,
  },

  coordLine: {
    width: 1,
    height: 8,
    backgroundColor: TACTICAL.border,
  },

  exportCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
  },

  exportNote: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted, marginBottom: 4 },

  exportBtns: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },

  exportBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: TACTICAL.amber,
    borderRadius: 10,
    paddingVertical: 12,
  },

  exportBtnText: { ...TYPO.U1, color: '#0B0F12' },

  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 32,
  },

  emptyText: { ...TYPO.B1, color: TACTICAL.textMuted },

  backNavBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },

  backNavBtnText: { ...TYPO.U2, color: TACTICAL.textMuted },

  segFullScreen: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
  },

  segFullScreenHeader: {
    paddingTop: Platform.OS === 'web' ? 18 : 54,
    paddingHorizontal: DENSITY.screenPad,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },

  segFullScreenEyebrow: {
    ...TYPO.T2,
    color: TACTICAL.amber,
    flex: 1,
  },

  segCloseButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(62,79,60,0.12)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },

  segFullScreenScroll: {
    flex: 1,
  },

  segFullScreenContent: {
    padding: DENSITY.screenPad,
    paddingBottom: Platform.OS === 'web' ? 28 : 48,
  },

  segReportSummary: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
    marginBottom: 12,
  },

  segReportTitle: {
    ...TYPO.T3,
    color: TACTICAL.text,
    marginBottom: 10,
  },

  segCard: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    padding: DENSITY.cardPad,
    marginBottom: 12,
  },

  segCardHighlighted: {
    borderColor: TACTICAL.amber,
    backgroundColor: 'rgba(196,138,44,0.08)',
  },

  segModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },

  segLevelDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },

  segModalTitle: { ...TYPO.T2, color: TACTICAL.text, flex: 1 },
  segModalScore: { ...TYPO.K3, color: TACTICAL.amber, fontSize: 11 },

  segStatsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },

  segStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderRadius: 8,
    paddingVertical: 8,
  },

  segStatLabel: { ...TYPO.T4, fontSize: 7, letterSpacing: 2 },
  segStatValue: { ...TYPO.K2, color: TACTICAL.text, fontSize: 13 },

  segReasonsSection: { marginBottom: 12 },
  segReasonsTitle: { ...TYPO.T4, color: TACTICAL.amber, fontSize: 9, marginBottom: 8 },

  segReasonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },

  segReasonDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 5,
  },

  segReasonContent: { flex: 1 },
  segReasonLabel: { ...TYPO.B1, color: TACTICAL.text, fontSize: 12 },
  segReasonText: { ...TYPO.B2, fontSize: 11, color: TACTICAL.textMuted },
  segReasonValue: { ...TYPO.K3, color: TACTICAL.text, fontSize: 11 },
  segReasonDetail: { ...TYPO.B2, fontSize: 10, color: TACTICAL.textMuted },

  segLevelRow: {
    flexDirection: 'row',
    gap: 10,
  },

  segLevelItem: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },

  segLevelLabel: { ...TYPO.T4, fontSize: 7, letterSpacing: 2 },

  segLevelBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
  },

  segLevelText: { ...TYPO.U2, fontSize: 9 },
});
