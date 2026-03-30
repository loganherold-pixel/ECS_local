/**
 * Navigate Tab — ECS Tactical Navigation Center (Redesigned)
 *
 * Zero-scroll, map-primary layout.
 * Compact TacticalActionBar with icon + micro-label pills.
 * All configuration opens as modal sheets.
 *
 * Layout: Header → TacticalActionBar → Map (fills remaining space)
 *
 * Actions:
 *   IMPORT  — GPX file import
 *   PIN     — Drop pin at map center / GPS
 *   OFFLINE — Navigate to offline maps manager
 *   BAIL    — Navigate to bailouts manager
 *   TRAIL   — Open trail recording modal sheet
 *
 * Tilt Alert Zones layer: plots GPS-located tilt alerts as colored
 * diamond markers on the map (orange=warning, red=critical) with
 * tap-to-view detail modal and toggle in overlay controls.
 */
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { parseGeoFile, getPrimaryRouteCoordinates } from '../../lib/gpxParser';

import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { hapticMicro, hapticCommand } from '../../lib/haptics';

import TabErrorBoundary from '../../components/TabErrorBoundary';

// ── Phase 15: Stability Guards ──────────────────────────────
import {
  isValidGPS,
  isValidRouteGeometry,
  stabilityLog,
  shallowEqual,
} from '../../lib/ecsStabilityGuards';




import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { TACTICAL, TYPO, DENSITY, GOLD_RAIL } from '../../lib/theme';


import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import {
  runStore,
  computeRunHealth,
  type ECSRun,
  type BuildSnapshot,
} from '../../lib/runStore';

import { routeStore } from '../../lib/routeStore';
import {
  getMapboxToken,
  clearTokenCache,
  setMapboxToken,
  setMapboxTokenAsync,
  DEFAULT_MAP_STYLE,
  type MapStyleKey,
} from '../../lib/mapConfig';



import {
  computeSegmentRisk,
  getSegmentColor,
  type SegmentRiskProfile,
} from '../../lib/segmentRiskEngine';

import {
  bailoutStore,
  getBailoutTypeMeta,
  type BailoutPoint,
  type ExitPlan,
} from '../../lib/bailoutStore';

import { pinStore } from '../../lib/pinStore';
import { missionExpeditionStore } from '../../lib/missionStore';
import {
  trailStore,
  type TrailRecordingStatus,
  type TrailStats,
  type TrailReplayPoint,
  type TrailAnalytics,
  type TrailSpeedSegment,
} from '../../lib/trailStore';

import {
  getPinTypeMeta,
  type ECSPin,
  type PinType,
} from '../../components/navigate/PinTypes';

import type {
  PinMarker,
  TrailSegmentData,
  SpeedSegmentData,
} from '../../components/navigate/MapRenderer';

// ── Remoteness Store import for campsite scoring (Phase 2) ──
import { remotenessStore } from '../../lib/remotenessStore';

// ── Tilt Alert Zones imports ────────────────────────────────
import {
  useTiltAlertMarkers,
  TiltAlertDetailModal,
  type TiltAlertMarker,
} from '../../components/navigate/TiltAlertZonesLayer';

import {
  loadAlertHistory,
  type TiltAlertEvent,
} from '../../lib/tiltAlertStore';

// ── Weather Alert Layer imports ─────────────────────────────
import {
  useWeatherAlerts,
  WeatherAlertMapOverlay,
  WeatherAlertDetailModal,
} from '../../components/navigate/WeatherAlertLayer';

// ── Route Corridor Weather imports ──────────────────────────
import {
  useRouteCorridorWeather,
  RouteWeatherTimeline,
  RouteWeatherDetailModal,
} from '../../components/navigate/RouteCorridorWeather';

import Header from '../../components/Header';
import AuthModal from '../../components/AuthModal';
import Toast from '../../components/Toast';
import RoutePolyline from '../../components/navigate/RoutePolyline';
import MapRenderer from '../../components/navigate/MapRenderer';
import MapOverlayControls from '../../components/navigate/MapOverlayControls';
import PinDetailsModal from '../../components/navigate/PinDetailsModal';
import PinDrawer from '../../components/navigate/PinDrawer';
import TelemetryHUD from '../../components/navigate/TelemetryHUD';
import ReplayBar, { type ReplaySpeed } from '../../components/navigate/ReplayBar';
import TacticalActionBar from '../../components/navigate/TacticalActionBar';
import TrailStatusModal from '../../components/navigate/TrailStatusModal';
import CompassRose from '../../components/navigate/CompassRose';
import OfflineCacheModal from '../../components/navigate/OfflineCacheModal';
import StorageWarningBanner from '../../components/navigate/StorageWarningBanner';
import LiveOdometer from '../../components/navigate/LiveOdometer';
import StorageDashboardModal from '../../components/offline-maps/StorageDashboardModal';

import { trailHistoryStore } from '../../lib/trailHistoryStore';
import { routeAnalysisEngine, type RouteIntelligence } from '../../lib/routeAnalysisEngine';

import {
  resourceForecastEngine,
  type ResourceForecast,
  type VehicleProfileSnapshot,
  type LoadoutTotalsSnapshot,
  type TelemetrySnapshot,
} from '../../lib/resourceForecastEngine';

import { vehicleSpecStore } from '../../lib/vehicleSpecStore';
import { telemetryConfigStore } from '../../lib/telemetryStore';

import {
  terrainAnalysisEngine,
  type TerrainIntelligence,
} from '../../lib/terrainAnalysisEngine';

import {
  expeditionForecastEngine,
  type ExpeditionForecast,
} from '../../lib/expeditionForecastEngine';

import {
  campsiteCandidateEngine,
  type CampsiteCandidateResult,
} from '../../lib/campsiteCandidateEngine';

// ── VCD Adaptive Panel State Engine ─────────────────────────
import { useVCDPanelStates } from '../../lib/vcdPanelStateEngine';
import VCDAdaptivePanel from '../../components/navigate/VCDAdaptivePanel';

// ── Intelligence Panels ─────────────────────────────────────
import RouteAnalysisPanel from '../../components/navigate/RouteAnalysisPanel';
import ResourceForecastPanel from '../../components/navigate/ResourceForecastPanel';
import TerrainAnalysisPanel from '../../components/navigate/TerrainAnalysisPanel';
import CampsiteCandidatePanel from '../../components/navigate/CampsiteCandidatePanel';
import ExpeditionForecastPanel from '../../components/dashboard/ExpeditionForecastPanel';

import type { TileBounds } from '../../lib/tileCacheStore';
import { fsReadFileFromPickerUri } from '../../lib/fsCompat';

import { useThrottledGPS } from '../../lib/useThrottledGPS';
import { useVehicleHeading, type CompassMode } from '../../lib/useVehicleHeading';

import GPSStatusOverlay from '../../components/navigate/GPSStatusOverlay';

import {
  runStartupCleanup,
  analyzeCache,
  type CleanupReport,
  type CleanupResult,
} from '../../lib/tileAutoCleanup';

import { runAutoCleanupCheck } from '../../lib/storageCleanupEngine';

// ── Road Classification Bridge → Dashboard Mode Engine ──────
import { roadClassificationBridge } from '../../lib/roadClassificationBridge';
import { dashboardModeEngine } from '../../lib/dashboardModeEngine';




// ── Tilt Alert Zones localStorage key ───────────────────────
const TILT_ZONES_VISIBLE_KEY = 'ecs_tilt_alert_zones_visible';






const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

const DEFAULT_TRAIL_STATS: TrailStats = {
  distance_miles: 0, distance_km: 0, elapsed_seconds: 0,
  elapsed_formatted: '0:00', avg_speed_mph: 0, max_speed_mph: 0,
  point_count: 0, segment_count: 0,
};


function NavigateScreenInner() {
  const { showToast, user } = useApp();
  const { feedSpeed, dismissAutoDriving } = useTheme();
  const router = useRouter();
const insets = useSafeAreaInsets();
const MAP_TOP_ANCHOR = insets.top + 4;
const [intelOpen, setIntelOpen] = useState(false);

// ── ECS UI State ─────────────────────────────
const [mapStyleMode, setMapStyleMode] = useState<'day' | 'tac' | 'sat'>('day');


// ── Top layout measurement ────────────────────────────────
const [headerHeight, setHeaderHeight] = useState(0);
const [actionBarHeight, setActionBarHeight] = useState(0);
const [storageBannerHeight, setStorageBannerHeight] = useState(0);

// ── Layout offsets ────────────────────────────────────────
const COMMAND_DOCK_BASE_HEIGHT = 68;
const commandDockBottomPadding = Math.max(insets.bottom, 6);
const commandDockHeight = COMMAND_DOCK_BASE_HEIGHT + commandDockBottomPadding;
const OVERLAY_EDGE = 14;
const OVERLAY_GAP = 12;


// All lower floating controls should sit 4px above the ECS dock
const FLOATING_CONTROLS_BOTTOM = commandDockHeight + 4;

const MAP_POPUP_TOP = MAP_TOP_ANCHOR + 46;
const MAP_POPUP_BOTTOM = commandDockHeight + 12;

const FLOATING_CONTROLS_TOP_LEFT = MAP_TOP_ANCHOR;

const COMPASS_SIZE = 84;
const COMPASS_BOTTOM = FLOATING_CONTROLS_BOTTOM;

const FLOATING_PILL_HEIGHT = 34;
const FLOATING_PILL_TOP_LEFT = FLOATING_CONTROLS_TOP_LEFT;

const DROP_PIN_BOTTOM = COMPASS_BOTTOM + COMPASS_SIZE + 24;
const REPLAY_BOTTOM = commandDockHeight + 44;

const minimizeTopOffset = insets.top + 12;
const collapsedRouteBadgeTop = 10;

const MPH_OVERLAY_TOP = MAP_TOP_ANCHOR + 4;
const PIN_LIST_TOP = MPH_OVERLAY_TOP + 34 + 10;

// Map already sits below header/action/banner in collapsed mode,
// so the route badge only needs a small offset inside the map.
const collapsedTopChromeHeight =
  headerHeight + actionBarHeight + storageBannerHeight;

const renderMapPopup = (
  visible: boolean,
  title: string,
  icon: React.ComponentProps<typeof Ionicons>['name'],
  onClose: () => void,
  children: React.ReactNode,
) => {
  if (!visible) return null;

  return (
    <View style={styles.mapPopupLayer} pointerEvents="box-none">
      <TouchableOpacity
        style={styles.mapPopupBackdrop}
        activeOpacity={1}
        onPress={onClose}
      />

      <View
        style={[
          styles.mapPopupShell,
          {
            top: MAP_POPUP_TOP,
            bottom: MAP_POPUP_BOTTOM,
          },
        ]}
      >
        <View style={styles.mapPopupHeader}>
          <View style={styles.mapPopupTitleRow}>
            <Ionicons name={icon} size={16} color={TACTICAL.amber} />
            <Text style={styles.mapPopupTitle}>{title}</Text>
          </View>

          <TouchableOpacity onPress={onClose} activeOpacity={0.8}>
            <Ionicons name="close" size={18} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        <View style={styles.mapPopupBody}>{children}</View>
      </View>
    </View>
  );
};

  
  // ── Mounted ref for memory leak prevention ────────────────
  const mountedRef = useRef(true);
  const cleanupRanRef = useRef(false);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      roadClassificationBridge.reset();
    };
  }, []);



  const [authVisible, setAuthVisible] = useState(false);
const [runs, setRuns] = useState<ECSRun[]>([]);
const [activeRun, setActiveRun] = useState<ECSRun | null>(null);
const [snapshotModalVisible, setSnapshotModalVisible] = useState(false);

// Map state
const [mapToken, setMapToken] = useState<string | null>(null);
const [mapLoading, setMapLoading] = useState(true);

const hasToken = !!mapToken;


const [mapStyle, setMapStyle] = useState<MapStyleKey>(DEFAULT_MAP_STYLE);
useEffect(() => {
  if (mapStyleMode === 'day') setMapStyle('ecs');
  else if (mapStyleMode === 'tac') setMapStyle('tactical');
  else if (mapStyleMode === 'sat') setMapStyle('satellite');
}, [mapStyleMode]);

const [followUser, setFollowUser] = useState(false);
const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
const [mapExpanded, setMapExpanded] = useState(false);


const tokenRetryCountRef = useRef(0);
const tokenRetryTimerRef = useRef<any>(null);

// NEW — prevents the 20s guard timeout from firing after the token already resolved
const tokenResolvedRef = useRef(false);
const tokenGuardTimeoutRef = useRef<any>(null);

console.log('[Navigate Render]', {
  mapLoading,
  hasToken,
  tokenLength: mapToken?.length ?? 0,
  followUser,
  userLocation,
});

  


  const handleMapRetry = useCallback(async () => {
    setMapLoading(true);
    clearTokenCache();

    try {
      const token = await getMapboxToken();
      setMapToken(token || '');
    } catch {
      setMapToken('');
    }

    setMapLoading(false);
  }, []);



  // ── Phase 2.8: Pin state ──────────────────────────────────
  const [allPins, setAllPins] = useState<ECSPin[]>([]);
const [pinModalVisible, setPinModalVisible] = useState(false);
const [editingPin, setEditingPin] = useState<ECSPin | null>(null);
const [dropCoords, setDropCoords] = useState<{ lat: number; lng: number } | null>(null);

// Direct-tap pin mode
const [pinDropMode, setPinDropMode] = useState(false);

const pinModePulse = useRef(new Animated.Value(1)).current;

useEffect(() => {
  if (pinDropMode) {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pinModePulse, {
          toValue: 1.06,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(pinModePulse, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }

  pinModePulse.stopAnimation();
  pinModePulse.setValue(1);
}, [pinDropMode, pinModePulse]);

// Keep crosshair available only if you still want it for other workflows
const [showCrosshair, setShowCrosshair] = useState(false);

// ── Phase 3: Center + Zoom command state ──────────────────
const [centerZoomTrigger, setCenterZoomTrigger] = useState(0);
const [centerZoomTarget, setCenterZoomTarget] = useState<{ lat: number; lng: number; zoom: number } | null>(null);


  // ── Phase 3.0: Pin category filter state ──────────────────
  const [activePinTypeFilters, setActivePinTypeFilters] = useState<PinType[]>([]);

  const handlePinTypeFilterToggle = useCallback((type: PinType) => {
    setActivePinTypeFilters(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  }, []);

  const handlePinTypeFilterReset = useCallback(() => {
    setActivePinTypeFilters([]);
  }, []);

  // ── Offline map caching state ─────────────────────────────
  const [mapBounds, setMapBounds] = useState<TileBounds | null>(null);
  const [mapZoom, setMapZoom] = useState(10);
  const [requestBoundsTrigger, setRequestBoundsTrigger] = useState(0);

  // ── Phase 2.8.1: Trail recording state ────────────────────
  // ── Phase 2.8.1: Trail recording state ────────────────────
  const [trailStatus, setTrailStatus] = useState<TrailRecordingStatus>('idle');
  const [trailStats, setTrailStats] = useState<TrailStats | null>(null);
  const [trailSegments, setTrailSegments] = useState<TrailSegmentData[]>([]);
  const [trailExportVisible, setTrailExportVisible] = useState(false);
  const [trailStyle, setTrailStyle] = useState<'normal' | 'speed'>('normal');
  const trailUpdateTimer = useRef<any>(null);

  // ── Phase 2.8.2: Trail replay state ───────────────────────
  const [isReplayActive, setIsReplayActive] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState<ReplaySpeed>(1);
  const [replayCurrentSeconds, setReplayCurrentSeconds] = useState(0);
  const [replayAnalytics, setReplayAnalytics] = useState<TrailAnalytics | null>(null);
  const [replayMarkerPos, setReplayMarkerPos] = useState<{ lat: number; lng: number } | null>(null);
  const replayTimerRef = useRef<any>(null);

  // ── Phase 2.8.3: Trail history state ──────────────────────
  const [trailHistoryRefreshKey, setTrailHistoryRefreshKey] = useState(0);
  const [replayFromHistory, setReplayFromHistory] = useState(false);
  const [replayHistoryTrailSegments, setReplayHistoryTrailSegments] = useState<TrailSegmentData[]>([]);

   // ── Modal visibility state ────────────────────────────────
  const [trailModalVisible, setTrailModalVisible] = useState(false);
  const [pinDrawerVisible, setPinDrawerVisible] = useState(false);
  const [offlineCacheModalVisible, setOfflineCacheModalVisible] = useState(false);
  const [storageDashboardVisible, setStorageDashboardVisible] = useState(false);

  // ── Route Analysis Intelligence state ─────────────────────
  const [routeIntelligence, setRouteIntelligence] = useState<RouteIntelligence | null>(
    () => routeAnalysisEngine.getCurrent()
  );

  // ── Resource Forecast Intelligence state (Phase 2) ────────
  const [resourceForecast, setResourceForecast] = useState<ResourceForecast | null>(
    () => resourceForecastEngine.getCurrent()
  );

  // ── Terrain Analysis Intelligence state (Phase 3) ─────────
  const [terrainIntelligence, setTerrainIntelligence] = useState<TerrainIntelligence | null>(
    () => terrainAnalysisEngine.getCurrent()
  );

  // ── Expedition Forecast Intelligence state (Phase 4) ──────
  const [expeditionForecast, setExpeditionForecast] = useState<ExpeditionForecast | null>(
    () => expeditionForecastEngine.getCurrent()
  );

  // ── Campsite Candidate Detection state (Predictive Campsite Phase 1) ──
  const [campsiteCandidates, setCampsiteCandidates] = useState<CampsiteCandidateResult | null>(
    () => campsiteCandidateEngine.getCurrent()
  );


  // ── Performance: Ref-based dedup to prevent redundant engine computations ──
  // Tracks the last computed ID for each engine to avoid duplicate work
  // from both useEffect triggers and subscriber notifications firing together.
  const lastRouteIntelIdRef = useRef<string | null>(routeIntelligence?.id ?? null);
  const lastTerrainIntelIdRef = useRef<string | null>(terrainIntelligence?.id ?? null);
  const lastResourceForecastIdRef = useRef<string | null>(resourceForecast?.routeIntelligenceId ?? null);
  const lastExpeditionForecastInputRef = useRef<string>('');
  const lastCampsiteInputRef = useRef<string>('');





  // ── Tilt Alert Zones state ────────────────────────────────
  // Persisted toggle: show/hide tilt alert markers on map
  const [showTiltAlertZones, setShowTiltAlertZones] = useState<boolean>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const stored = localStorage.getItem(TILT_ZONES_VISIBLE_KEY);
        return stored === 'true';
      }
    } catch {}
    return false;
  });

  // Detail modal state for tapped tilt alert markers
  const [tiltAlertDetailVisible, setTiltAlertDetailVisible] = useState(false);
  const [tiltAlertDetailEvent, setTiltAlertDetailEvent] = useState<TiltAlertEvent | null>(null);
  const [tiltAlertDetailCluster, setTiltAlertDetailCluster] = useState<any>(null);

  // Hook: loads tilt alert markers from history when layer is visible
  const {
    markers: tiltAlertMarkers,
    clusters: tiltAlertClusters,
    totalCount: tiltAlertTotalCount,
    gpsCount: tiltAlertGpsCount,
    reload: reloadTiltAlertMarkers,
  } = useTiltAlertMarkers(showTiltAlertZones);

  // Toggle handler with localStorage persistence
  const handleToggleTiltAlertZones = useCallback(() => {
    hapticMicro();
    setShowTiltAlertZones(prev => {
      const next = !prev;
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem(TILT_ZONES_VISIBLE_KEY, String(next));
        }
      } catch {}
      return next;
    });
  }, []);

  // Tap handler: find the event by marker ID and show detail modal
  const handleTiltAlertTap = useCallback((markerId: string) => {
    hapticMicro();
    // Try to find the event in the full alert history
    const history = loadAlertHistory();
    const event = history.find(e => e.id === markerId) || null;

    // Also check if this marker is part of a cluster
    const cluster = tiltAlertClusters.find(c =>
      c.events.some(e => e.id === markerId)
    ) || null;

    setTiltAlertDetailEvent(event);
    setTiltAlertDetailCluster(cluster && cluster.events.length > 1 ? cluster : null);
    setTiltAlertDetailVisible(true);
  }, [tiltAlertClusters]);


  // ── Weather Alert Layer ───────────────────────────────────
  const [weatherAlertDetailVisible, setWeatherAlertDetailVisible] = useState(false);

  const weatherAlerts = useWeatherAlerts(userLocation, showToast);

  // ── Route Corridor Weather ────────────────────────────────
  const [routeWeatherDetailVisible, setRouteWeatherDetailVisible] = useState(false);

  const routeCorridorWeather = useRouteCorridorWeather(activeRun, userLocation, showToast);


  // ── Auto-cleanup state ────────────────────────────────────
  const [cleanupReport, setCleanupReport] = useState<CleanupReport | null>(null);



  // Run startup cleanup and intelligent auto-cleanup once on mount
  useEffect(() => {
    if (cleanupRanRef.current) return;
    cleanupRanRef.current = true;

    (async () => {
      try {
        // Legacy startup cleanup
        const { report, cleanupResult } = await runStartupCleanup();
        if (!mountedRef.current) return;
        setCleanupReport(report);

        if (cleanupResult && cleanupResult.regionsDeleted > 0) {
          showToast(`AUTO-CLEANUP: ${cleanupResult.message}`);
        }

        // Intelligent LRU-based auto-cleanup check
        const smartResult = await runAutoCleanupCheck();
        if (!mountedRef.current) return;
        if (smartResult && smartResult.performed) {
          showToast(`SMART CLEANUP: ${smartResult.message}`);
          // Re-analyze after smart cleanup
          try {
            const newReport = analyzeCache();
            setCleanupReport(newReport);
          } catch {}
        }
      } catch (e) {
        console.warn('[Navigate] Startup cleanup failed:', e);
      }
    })();
  }, [showToast]);


  const handleCleanupComplete = useCallback((result: CleanupResult) => {
    // Re-analyze after cleanup to update the banner
    try {
      const { analyzeCache } = require('../lib/tileAutoCleanup');
      const newReport = analyzeCache();
      setCleanupReport(newReport);
    } catch {}
  }, []);



  // ── Phase 2.8: Expedition context ─────────────────────────
  const activeExpedition = useMemo(() => missionExpeditionStore.getActive(), []);
  const activeExpeditionId = activeExpedition?.id || null;
  const activeExpeditionName = activeExpedition?.name || null;

  // ── Phase 2.8: Export modal ───────────────────────────────
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [exportPins, setExportPins] = useState<ECSPin[]>([]);

  // Build snapshot form state
  const [pendingGpxContent, setPendingGpxContent] = useState<string | null>(null);
  const [pendingGpxName, setPendingGpxName] = useState('');
  const [bsVehicleName, setBsVehicleName] = useState('');
  const [bsRange, setBsRange] = useState('');
  const [bsTotalWeight, setBsTotalWeight] = useState('');
  const [bsRoofWeight, setBsRoofWeight] = useState('');
  const [bsHitchWeight, setBsHitchWeight] = useState('');
  const [bsRoofLimit, setBsRoofLimit] = useState('');
  const [bsHitchLimit, setBsHitchLimit] = useState('');

  // ── Fetch Mapbox token with auto-retry (up to 3 attempts, exponential backoff) ──
// The token is pre-configured by the developer via env vars, app.json extra,
// SecureStore, or Supabase edge function. No manual user entry is needed.
useEffect(() => {
  let cancelled = false;
  const MAX_RETRIES = 3;

  tokenResolvedRef.current = false;

  const finishTokenLoad = (token: string) => {
    if (cancelled || !mountedRef.current) return;

    tokenResolvedRef.current = true;

    if (tokenGuardTimeoutRef.current) {
      clearTimeout(tokenGuardTimeoutRef.current);
      tokenGuardTimeoutRef.current = null;
    }

    if (tokenRetryTimerRef.current) {
      clearTimeout(tokenRetryTimerRef.current);
      tokenRetryTimerRef.current = null;
    }

    setMapToken(token);
    setMapLoading(false);
  };

  const attemptFetch = async (attempt: number) => {
    if (cancelled || !mountedRef.current || tokenResolvedRef.current) return;

    
    try {
      if (attempt > 0) clearTokenCache(); // Clear cache on retries to force re-resolution

      const token = await getMapboxToken();

      if (cancelled || !mountedRef.current || tokenResolvedRef.current) return;

      if (token && token.length > 0) {
        
        finishTokenLoad(token);
      } else if (attempt < MAX_RETRIES) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
        
        tokenRetryTimerRef.current = setTimeout(() => attemptFetch(attempt + 1), delay);
      } else {
        console.warn('[Navigate] All token fetch attempts exhausted');
        finishTokenLoad('');
      }
    } catch {
      if (cancelled || !mountedRef.current || tokenResolvedRef.current) return;

      if (attempt < MAX_RETRIES) {
        const delay = Math.min(2000 * Math.pow(2, attempt), 10000);
        tokenRetryTimerRef.current = setTimeout(() => attemptFetch(attempt + 1), delay);
      } else {
        finishTokenLoad('');
      }
    }
  };

  // Overall timeout guard: if nothing resolves in 20s, stop loading
  tokenGuardTimeoutRef.current = setTimeout(() => {
    if (cancelled || tokenResolvedRef.current) return;

    console.warn('[Navigate] Token fetch guard timeout (20s)');
    finishTokenLoad('');
  }, 20000);

  attemptFetch(0);

  return () => {
    cancelled = true;

    if (tokenGuardTimeoutRef.current) {
      clearTimeout(tokenGuardTimeoutRef.current);
      tokenGuardTimeoutRef.current = null;
    }

    if (tokenRetryTimerRef.current) {
      clearTimeout(tokenRetryTimerRef.current);
      tokenRetryTimerRef.current = null;
    }
  };
}, []);

  // ── Throttled GPS for UI (Phase 3A: max 1 update/sec) ─────
  // Raw GPS still available via gps.rawGPS for internal calculations
  const [mapReady, setMapReady] = useState(false);
  const gpsCenteredRef = useRef(false);

  const gps = useThrottledGPS({ enabled: true, highAccuracy: true, maxRetries: 5, retryIntervalMs: 3000 });

  // ── Vehicle Heading (North-Up map, rotating arrow only) ──────
  // Phase 6: Pass GPS speed for stationary drift prevention + adaptive smoothing
  const vehicleHeadingHook = useVehicleHeading({
    enabled: true,
    gpsHeadingDeg: gps.position?.headingDeg ?? null,
    initialMode: 'auto',
    speedMph: gps.position?.speedMph ?? null,
  });

  // Sync GPS position → userLocation state + auto-center map on first fix
  // ── Phase 15: Connectivity state listener ──────────────────
  // Gracefully transitions between online/offline without crashing.
  const [isOnline, setIsOnline] = useState(true);
  const prevOnlineRef = useRef(true);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleOnline = () => {
      if (!prevOnlineRef.current) {
        stabilityLog('Navigation', 'info', 'Connectivity restored — online');
      }
      prevOnlineRef.current = true;
      if (mountedRef.current) setIsOnline(true);
    };
    const handleOffline = () => {
      if (prevOnlineRef.current) {
        stabilityLog('Navigation', 'warn', 'Connectivity lost — switching to offline mode');
      }
      prevOnlineRef.current = false;
      if (mountedRef.current) setIsOnline(false);
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    // Set initial state
    setIsOnline(navigator.onLine !== false);
    prevOnlineRef.current = navigator.onLine !== false;
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Phase 15: Rerender guard — prevent excessive navigation state updates ──
  // Tracks the last navigation state hash to skip redundant re-renders
  // during long trips where GPS updates fire continuously.
  const lastNavStateHashRef = useRef('');

  // Sync GPS position → userLocation state + auto-center map on first fix
  // Phase 15: Validate GPS coordinates before accepting
  useEffect(() => {
    if (gps.position) {
      const { latitude, longitude } = gps.position;

      // Phase 15: GPS validation guard
      if (!isValidGPS(latitude, longitude)) {
        stabilityLog('Navigation', 'warn', `Invalid GPS coordinates rejected: ${latitude}, ${longitude}`);
        return;
      }

      // Phase 15: Rerender guard — skip if position hasn't meaningfully changed
      const navHash = `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
      if (navHash === lastNavStateHashRef.current) return;
      lastNavStateHashRef.current = navHash;

      const loc = { lat: latitude, lng: longitude };
      setUserLocation(loc);
      if (!gpsCenteredRef.current) {
        gpsCenteredRef.current = true;
        setFollowUser(true);
        setCenterZoomTarget({ lat: loc.lat, lng: loc.lng, zoom: 13 });
        setCenterZoomTrigger(prev => prev + 1);
      }
    }
  }, [gps.position]);


  // Phase 3: Handle user manual pan → disable auto-follow
  const handleUserDrag = useCallback(() => {
    if (followUser) {
      setFollowUser(false);
    }
  }, [followUser]);

  // Phase 3: Recenter on current GPS location
  const handleRecenter = useCallback(() => {
    hapticMicro();
    if (userLocation) {
      setFollowUser(true);
      setCenterZoomTarget({ lat: userLocation.lat, lng: userLocation.lng, zoom: 13 });
      setCenterZoomTrigger(prev => prev + 1);
    }
  }, [userLocation]);

  const handleGpsRetry = useCallback(() => { gps.refresh(); }, [gps]);

  // ── Road Classification Bridge: Feed Mapbox road data → dashboardModeEngine ──
  // When the MapRenderer WebView detects the road type under the user's GPS
  // position (via queryRenderedFeatures on the Mapbox Streets v8 'road' layer),
  // it sends a 'roadClassification' message back to React Native.
  // This callback feeds that data into the roadClassificationBridge, which
  // maps Mapbox road classes to ECS RoadClassification types and feeds
  // the dashboardModeEngine for context-aware Highway/Expedition switching.
  const handleRoadClassification = useCallback((data: {
    roadClass: string;
    roadName: string | null;
    hasRoad: boolean;
    featureCount: number;
    allClasses: string[];
    timestamp: number;
  }) => {
    roadClassificationBridge.feed({
      roadClass: data.roadClass,
      roadName: data.roadName ?? undefined,
      hasRoad: data.hasRoad,
      featureCount: data.featureCount,
      timestamp: data.timestamp,
    });
  }, []);

  // ── GPS Speed → Dashboard Mode Engine ─────────────────────
  // Feed the current GPS speed in mph to the dashboardModeEngine
  // whenever the throttled GPS position changes. This provides a
  // direct, low-latency speed signal for the multi-signal evaluation
  // (road type + speed + remoteness) used for context-aware
  // Highway/Expedition mode switching.
  useEffect(() => {
    if (gps.position && gps.position.speedMph != null) {
      dashboardModeEngine.feedSpeed(gps.position.speedMph);
    }
  }, [gps.position?.speedMph]);


  const loadRuns = useCallback(() => {
    const all = runStore.getAll();
    setRuns(all);
    setActiveRun(runStore.getActive());
  }, []);

  const loadPins = useCallback(() => {
    setAllPins(pinStore.getAll());
  }, []);

  // Reload runs, pins, and tilt alert markers when tab gains focus
  useFocusEffect(useCallback(() => {
    loadRuns();
    loadPins();
    // Reload tilt alert markers when tab regains focus (new alerts may have been recorded)
    if (showTiltAlertZones) {
      reloadTiltAlertMarkers();
    }
  }, [loadRuns, loadPins, showTiltAlertZones, reloadTiltAlertMarkers]));

  // ── Route Analysis Intelligence — auto-analyze when active run changes ──
  useEffect(() => {
    if (!activeRun || activeRun.points.length < 2) {
      // No active run or insufficient points — check if we should clear
      const current = routeAnalysisEngine.getCurrent();
      if (current && activeRun && current.sourceId !== activeRun.id) {
        routeAnalysisEngine.clear();
        setRouteIntelligence(null);
      }
      return;
    }

    // Check if we already have intelligence for this run
    if (routeAnalysisEngine.hasIntelligenceFor(activeRun.id)) {
      setRouteIntelligence(routeAnalysisEngine.getCurrent());
      return;
    }

    // Analyze the active run's route
    try {
      const intel = routeAnalysisEngine.analyzeFromRunPoints(
        activeRun.points,
        activeRun.id,
        activeRun.title,
      );
      setRouteIntelligence(intel);
    } catch (e) {
      console.error('[Navigate] Route analysis failed:', e);

    }
  }, [activeRun?.id, activeRun?.points?.length]);

  // Subscribe to route analysis engine changes (from external triggers)
  useEffect(() => {
    const unsub = routeAnalysisEngine.subscribe((intel) => {
      setRouteIntelligence(intel);
    });
    return unsub;
  }, []);


  // ── Resource Forecast — auto-compute when route intelligence changes ──
  useEffect(() => {
    if (!routeIntelligence) {
      // Clear forecast when no route intelligence
      if (resourceForecastEngine.getCurrent()) {
        resourceForecastEngine.clear();
        setResourceForecast(null);
      }
      return;
    }

    // Skip if forecast already matches this route intelligence
    if (resourceForecastEngine.isCurrentFor(routeIntelligence.id)) {
      setResourceForecast(resourceForecastEngine.getCurrent());
      return;
    }

    // Gather vehicle profile from active run's build snapshot + vehicleSpecStore
    let vehicleProfile: VehicleProfileSnapshot | null = null;
    try {
      const bs = activeRun?.build_snapshot;
      const vehicleId = bs?.vehicle_id;
      const spec = vehicleId ? vehicleSpecStore.get(vehicleId) : null;
      vehicleProfile = {
        fuelCapacityGallons: spec?.fuel_tank_capacity_gal ?? null,
        currentFuelPercent: null, // no live fuel % yet
        avgMpg: null, // could come from trip config
      };
      if (bs?.estimated_range_miles && spec?.fuel_tank_capacity_gal) {
        // Derive MPG from range / tank capacity
        vehicleProfile.avgMpg = bs.estimated_range_miles / spec.fuel_tank_capacity_gal;
      }
    } catch {}

    // Gather loadout totals (water, spare fuel)
    let loadoutTotals: LoadoutTotalsSnapshot | null = null;
    // (Will be enriched when loadout integration is deeper)

    // Gather telemetry snapshot (EcoFlow / power station)
    let telemetrySnap: TelemetrySnapshot | null = null;
    try {
      const activeExp = missionExpeditionStore.getActive();
      if (activeExp) {
        const tc = telemetryConfigStore.get(activeExp.id);
        if (tc) {
          telemetrySnap = {
            batterySocPercent: tc.powerRemainingWh != null && tc.powerCapacityWh != null && tc.powerCapacityWh > 0
              ? (tc.powerRemainingWh / tc.powerCapacityWh) * 100
              : null,
            batteryCapacityWh: tc.powerCapacityWh,
            avgDrawWatts: tc.powerAvgDrawW,
            estimatedRuntimeHours: null,
          };
        }
      }
    } catch {}

    // Compute forecast
    try {
      const forecast = resourceForecastEngine.compute(
        routeIntelligence,
        vehicleProfile,
        loadoutTotals,
        telemetrySnap,
      );
      setResourceForecast(forecast);
    } catch (e) {
      console.warn('[Navigate] Resource forecast computation failed:', e);
    }
  }, [routeIntelligence?.id, activeRun?.build_snapshot?.vehicle_id]);

  // Subscribe to resource forecast engine changes (from external triggers)
  useEffect(() => {
    const unsub = resourceForecastEngine.subscribe((forecast) => {
      setResourceForecast(forecast);
    });
    return unsub;
  }, []);

  // ── Terrain Analysis — auto-analyze when route intelligence changes (Phase 3) ──
  useEffect(() => {
    if (!routeIntelligence) {
      // Clear terrain intelligence when no route intelligence
      if (terrainAnalysisEngine.getCurrent()) {
        terrainAnalysisEngine.clear();
        setTerrainIntelligence(null);
      }
      return;
    }

    // Skip if terrain analysis already matches this route intelligence
    if (terrainAnalysisEngine.isCurrentFor(routeIntelligence.id)) {
      setTerrainIntelligence(terrainAnalysisEngine.getCurrent());
      return;
    }

    // Analyze terrain from route intelligence
    try {
      const terrainIntel = terrainAnalysisEngine.analyze(routeIntelligence);
      setTerrainIntelligence(terrainIntel);

    } catch (e) {
      console.warn('[Navigate] Terrain analysis failed:', e);
    }
  }, [routeIntelligence?.id]);

  // Subscribe to terrain analysis engine changes (from external triggers)
  useEffect(() => {
    const unsub = terrainAnalysisEngine.subscribe((intel) => {
      setTerrainIntelligence(intel);
    });
    return unsub;
  }, []);

  // ── Expedition Forecast — auto-generate when any input changes (Phase 4) ──
  useEffect(() => {
    if (!routeIntelligence) {
      // Clear forecast when no route intelligence
      if (expeditionForecastEngine.getCurrent()) {
        expeditionForecastEngine.clear();
        setExpeditionForecast(null);
      }
      return;
    }

    // Check if forecast needs recomputation
    const needsRecompute = expeditionForecastEngine.needsRecompute(
      routeIntelligence.id,
      resourceForecast?.routeIntelligenceId ?? null,
      terrainIntelligence?.id ?? null,
    );

    if (!needsRecompute) {
      setExpeditionForecast(expeditionForecastEngine.getCurrent());
      return;
    }

    // Generate expedition forecast from all three engines
    try {
      const forecast = expeditionForecastEngine.generate(
        routeIntelligence,
        resourceForecast,
        terrainIntelligence,
      );
      setExpeditionForecast(forecast);

    } catch (e) {
      console.warn('[Navigate] Expedition forecast generation failed:', e);
    }
  }, [routeIntelligence?.id, resourceForecast?.routeIntelligenceId, terrainIntelligence?.id]);

  // Subscribe to expedition forecast engine changes (from external triggers)
  useEffect(() => {
    const unsub = expeditionForecastEngine.subscribe((forecast) => {
      setExpeditionForecast(forecast);
    });
    return unsub;
  }, []);


  // ── Campsite Candidate Detection — Phase 2: Suitability Scoring ──
  useEffect(() => {
    if (!routeIntelligence) {
      // Clear campsite candidates when no route intelligence
      if (campsiteCandidateEngine.getCurrent()) {
        campsiteCandidateEngine.clear();
        setCampsiteCandidates(null);
      }
      return;
    }

    // Skip if analysis already matches this route intelligence
    if (campsiteCandidateEngine.isCurrentFor(routeIntelligence.id)) {
      setCampsiteCandidates(campsiteCandidateEngine.getCurrent());
      return;
    }

    // Gather remoteness data for Phase 2 scoring
    let remotenessSnapshot = null;
    try {
      const remoteness = remotenessStore.getCurrent();
      if (remoteness) {
        remotenessSnapshot = {
          tier: remoteness.tier ?? null,
          score: remoteness.score ?? null,
        };
      }
    } catch {
      // Remoteness data may not be available — proceed without it
    }


    // Wait for terrain intelligence before analyzing (optional but preferred)
    // If terrain intel is not yet available, analyze without it
    try {
      const result = campsiteCandidateEngine.analyze(
        routeIntelligence,
        terrainIntelligence,
        remotenessSnapshot,
      );
      setCampsiteCandidates(result);

    } catch (e) {
      console.warn('[Navigate] Campsite candidate detection failed:', e);
    }
  }, [routeIntelligence?.id, terrainIntelligence?.id]);

  // Subscribe to campsite candidate engine changes (from external triggers)
  useEffect(() => {
    const unsub = campsiteCandidateEngine.subscribe((result) => {
      setCampsiteCandidates(result);
    });
    return unsub;
  }, []);





  // ── Pin markers for map ────────────────────────────────
  const pinMarkers: PinMarker[] = useMemo(() => {
    return allPins.map(pin => {
      const meta = getPinTypeMeta(pin.type);
      return {
        id: pin.id, lat: pin.lat, lng: pin.lng, title: pin.title,
        type: pin.type, category: pin.category, color: meta.color,
        mapChar: meta.mapChar, resolved: pin.resolved,
      };
    });
  }, [allPins]);

  // ── Category-filtered pins + markers ───────────
  const categoryFilteredPins = useMemo(() => {
    if (activePinTypeFilters.length === 0) return allPins;
    return allPins.filter(pin => activePinTypeFilters.includes(pin.type));
  }, [allPins, activePinTypeFilters]);

  const filteredPinMarkers = useMemo(() => {
    if (activePinTypeFilters.length === 0) return pinMarkers;
    return pinMarkers.filter(pm => activePinTypeFilters.includes(pm.type as PinType));
  }, [pinMarkers, activePinTypeFilters]);

  // ── Pin CRUD handlers ─────────────────────────
  const handleDropPinHere = useCallback(() => {
  hapticCommand();

  if (followUser && userLocation) {
    setDropCoords({ lat: userLocation.lat, lng: userLocation.lng });
    setEditingPin(null);
    setPinDropMode(false);
    setPinModalVisible(true);
    return;
  }

  setEditingPin(null);
  setDropCoords(null);
  setShowCrosshair(false);
  setPinDropMode(prev => !prev);

  showToast(!pinDropMode ? 'TAP MAP TO DROP PIN' : 'PIN DROP CANCELED');
}, [followUser, userLocation, pinDropMode, showToast]);

  const handleMapCenterReply = useCallback(
  (center: { latitude: number; longitude: number; zoom?: number } | null) => {
    if (!center) return;
    // Center replies can still be used for other map utilities if needed.
  },
  [],
);

  const handleQuickPinDrop = useCallback(() => {
  hapticCommand();
  setEditingPin(null);
  setDropCoords(null);
  setShowCrosshair(false);
  setPinDropMode(true);
  showToast('TAP MAP TO DROP PIN');
}, [showToast]);

  const handleLongPress = useCallback((coord: { latitude: number; longitude: number }) => {
  hapticCommand();
  setPinDropMode(false);
  setShowCrosshair(false);
  setDropCoords({ lat: coord.latitude, lng: coord.longitude });
  setEditingPin(null);
  setPinModalVisible(true);
}, []);

  const handlePinTap = useCallback((pinPayload: any) => {
  hapticMicro();

  const pinId =
    typeof pinPayload === 'string'
      ? pinPayload
      : typeof pinPayload?.id === 'string'
        ? pinPayload.id
        : null;

  if (!pinId) return;

  const pin = pinStore.getById(pinId);
  if (pin) {
    setEditingPin(pin);
    setDropCoords({ lat: pin.lat, lng: pin.lng });
    setPinModalVisible(true);
  }
}, []);

  const handlePinSave = useCallback((data: {
  type: PinType; title: string; notes: string; severity: any;
}) => {
  if (editingPin) {
    pinStore.update(editingPin.id, {
      type: data.type, title: data.title, notes: data.notes, severity: data.severity,
    });
    showToast(`PIN UPDATED: ${data.title}`);
  } else if (dropCoords) {
    pinStore.create({
      type: data.type, lat: dropCoords.lat, lng: dropCoords.lng,
      title: data.title, notes: data.notes, severity: data.severity,
      expedition_id: activeExpeditionId, created_by: user?.email || 'local',
    });
    showToast(`PIN DROPPED: ${data.title}`);
  }

  setPinDropMode(false);
  setShowCrosshair(false);
  setPinModalVisible(false);
  setEditingPin(null);
  setDropCoords(null);
  loadPins();
}, [editingPin, dropCoords, activeExpeditionId, user, showToast, loadPins]);

  const handlePinDelete = useCallback(() => {
  if (editingPin) {
    const doDelete = () => {
      pinStore.delete(editingPin.id);
      setPinDropMode(false);
      setShowCrosshair(false);
      setPinModalVisible(false);
      setEditingPin(null);
      setDropCoords(null);
      loadPins();
      showToast('PIN DELETED');
    };
    if (Platform.OS === 'web') { if (confirm('Delete this pin?')) doDelete(); }
    else { Alert.alert('Delete Pin', 'Remove this pin?', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: doDelete }]); }
  }
}, [editingPin, loadPins, showToast]);

  const handlePinResolve = useCallback(() => {
  if (editingPin) {
    pinStore.resolve(editingPin.id);
    setPinDropMode(false);
    setShowCrosshair(false);
    setPinModalVisible(false);
    setEditingPin(null);
    setDropCoords(null);
    loadPins();
    showToast('INCIDENT RESOLVED');
  }
}, [editingPin, loadPins, showToast]);

  const handleSelectPin = useCallback((_pin: ECSPin) => {
    hapticMicro();
    showToast(`CENTERED ON: ${_pin.title}`);
  }, [showToast]);

  const handleEditPin = useCallback((pin: ECSPin) => {
    setEditingPin(pin);
    setDropCoords({ lat: pin.lat, lng: pin.lng });
    setPinModalVisible(true);
    setPinDrawerVisible(false);
  }, []);

  const handleResolvePin = useCallback((pin: ECSPin) => {
    if (pin.resolved) {
      pinStore.unresolve(pin.id);
      showToast('INCIDENT REOPENED');
    } else {
      pinStore.resolve(pin.id);
      showToast('INCIDENT RESOLVED');
    }
    loadPins();
  }, [loadPins, showToast]);

  const handleExportPins = useCallback((pins: ECSPin[]) => {
    setExportPins(pins);
    setExportModalVisible(true);
  }, []);

  const handleExportAction = useCallback((format: 'gpx' | 'json' | 'coords') => {
    let content = '';
    switch (format) {
      case 'gpx':
        content = pinStore.exportToGPX(exportPins, activeExpeditionName || 'ECS Pins');
        break;
      case 'json':
        content = pinStore.exportToJSON(exportPins);
        break;
      case 'coords':
        content = pinStore.exportCoordinatesList(exportPins);
        break;
    }
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(content).then(() => {
        showToast(`${format.toUpperCase()} COPIED TO CLIPBOARD (${exportPins.length} pins)`);
      }).catch(() => showToast('COPY FAILED'));
    } else {
      showToast(`EXPORT: ${exportPins.length} pins as ${format.toUpperCase()}`);
    }
    setExportModalVisible(false);
  }, [exportPins, activeExpeditionName, showToast]);

const handleDirectMapTapForPin = useCallback(
  ({ latitude, longitude }: { latitude: number; longitude: number }) => {
    if (!pinDropMode) return;

    hapticCommand();
    setDropCoords({ lat: latitude, lng: longitude });
    setEditingPin(null);
    setPinDropMode(false);
    setShowCrosshair(false);
    setPinModalVisible(true);
  },
  [pinDropMode],
);

  // ── Phase 15: Route geometry validation before MapRenderer ──
// Validates route points before passing to the map to prevent rendering crashes.
const validatedRunPoints = useMemo(() => {
  try {
    const pts = activeRun?.points || [];
    if (pts.length === 0) return [];

    const filtered = pts.filter((p) => {
      if (!p) return false;
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return false;
      if (p.lat < -90 || p.lat > 90) return false;
      if (p.lng < -180 || p.lng > 180) return false;
      return true;
    });

    if (filtered.length < 2) {
      stabilityLog(
        'Navigation',
        'warn',
        `Route geometry invalid for run "${activeRun?.id}" — fewer than 2 valid coordinates after filtering (${pts.length} raw, ${filtered.length} valid)`
      );
      return [];
    }

    let hasDistinctPair = false;
    for (let i = 1; i < filtered.length; i += 1) {
      const prev = filtered[i - 1];
      const curr = filtered[i];
      if (prev.lat !== curr.lat || prev.lng !== curr.lng) {
        hasDistinctPair = true;
        break;
      }
    }

    if (!hasDistinctPair) {
      stabilityLog(
        'Navigation',
        'warn',
        `Route geometry invalid for run "${activeRun?.id}" — all coordinates collapse to the same point (${filtered.length} valid points)`
      );
      return [];
    }

    
    return filtered;
  } catch (e) {
    stabilityLog('Navigation', 'error', 'Route geometry validation failed', e);
    return [];
  }
}, [activeRun?.id, activeRun?.points]);

// ── Segment risk for active run ────────────────
const activeSegmentProfile = useMemo<SegmentRiskProfile | null>(() => {
  if (!activeRun || validatedRunPoints.length < 2) return null;

  try {
    return computeSegmentRisk(
      activeRun.id,
      validatedRunPoints,
      activeRun.build_snapshot
    );
  } catch (e) {
    stabilityLog('Navigation', 'error', 'Segment risk computation failed', e);
    return null;
  }
}, [activeRun, validatedRunPoints]);


    // ── Bailouts + Remoteness for active run ───────
  const [activeBailouts, setActiveBailouts] = useState<BailoutPoint[]>([]);

  useEffect(() => {
    if (!activeRun) {
      setActiveBailouts([]);
      return;
    }

    const runBailouts = bailoutStore.getRunBailouts(activeRun.id);
    setActiveBailouts(runBailouts.length > 0 ? runBailouts : bailoutStore.getAll());
  }, [activeRun]);

  const enrichedProfile = useMemo(() => {
    if (!activeSegmentProfile || activeBailouts.length === 0) return activeSegmentProfile;
    const result = bailoutStore.computeRemoteness(activeSegmentProfile.segments, activeBailouts);
    return { ...activeSegmentProfile, segments: result.segments };
  }, [activeSegmentProfile, activeBailouts]);

  const activeExitPlan = useMemo<ExitPlan | null>(() => {
    if (!enrichedProfile || activeBailouts.length === 0) return null;
    return bailoutStore.computeExitPlan(enrichedProfile.segments, activeBailouts);
  }, [enrichedProfile, activeBailouts]);

  const segmentFeatures = useMemo(() => {
    if (!enrichedProfile || !activeRun) return undefined;

    return enrichedProfile.segments.map((seg) => {
      const coords: [number, number][] = [];
      for (let i = seg.start_idx; i <= seg.end_idx && i < activeRun.points.length; i++) {
        coords.push([activeRun.points[i].lng, activeRun.points[i].lat]);
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
  }, [enrichedProfile, activeRun]);

  const bailoutMarkers = useMemo(() => {
    return activeBailouts.map((bp) => {
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
  }, [activeBailouts]);

  const resetSnapshotForm = useCallback(() => {
    setPendingGpxContent(null);
    setPendingGpxName('');
    setBsVehicleName('');
    setBsRange('');
    setBsTotalWeight('');
    setBsRoofWeight('');
    setBsHitchWeight('');
    setBsRoofLimit('');
    setBsHitchLimit('');
    setSnapshotModalVisible(false);
  }, []);

  const simplifyRouteCoords = useCallback(
    (coords: Array<[number, number]>, maxPoints = 1000): Array<[number, number]> => {
      if (!Array.isArray(coords) || coords.length <= maxPoints) return coords;

      const step = Math.ceil(coords.length / maxPoints);
      const simplified = coords.filter(
        (_, i) => i === 0 || i === coords.length - 1 || i % step === 0
      );

      return simplified.length > maxPoints
        ? simplified.slice(0, maxPoints - 1).concat([coords[coords.length - 1]])
        : simplified;
    },
    []
  );

  const validateImportedRouteContent = useCallback(
  (fileName: string, ext: string, content: string) => {
    let primaryCoords: Array<[number, number]> = [];
    let parsed: any = null;

    if (ext === 'geojson' || ext === 'json') {
      const geo = JSON.parse(content);

      if (geo?.type === 'FeatureCollection' && Array.isArray(geo.features)) {
        geo.features.forEach((f: any) => {
          if (f.geometry?.type === 'LineString' && Array.isArray(f.geometry.coordinates)) {
            primaryCoords.push(...f.geometry.coordinates);
          }

          if (
            f.geometry?.type === 'MultiLineString' &&
            Array.isArray(f.geometry.coordinates)
          ) {
            f.geometry.coordinates.forEach((line: any) => {
              if (Array.isArray(line)) primaryCoords.push(...line);
            });
          }
        });
      }

      primaryCoords = simplifyRouteCoords(primaryCoords, 1000);

      
    } else {
      parsed = parseGeoFile(fileName, content);
      primaryCoords = simplifyRouteCoords(getPrimaryRouteCoordinates(parsed), 1000);
    }

    
    if (primaryCoords.length < 2) {
      throw new Error('IMPORT FAILED — Route needs at least 2 valid points');
    }

    return {
      parsed,
      primaryCoords,
    };
  },
  [simplifyRouteCoords]
);

const handleImmediateImport = useCallback(
  (content: string, fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';

    try {
      const { parsed, primaryCoords } = validateImportedRouteContent(fileName, ext, content);

      let run: ECSRun;

      if (ext === 'geojson' || ext === 'json') {
        const geo = JSON.parse(content);

        const geoPoints = (primaryCoords ?? [])
          .map((coord: any, idx: number) => {
            const lng = Array.isArray(coord) ? Number(coord[0]) : null;
            const lat = Array.isArray(coord) ? Number(coord[1]) : null;
            const ele =
              Array.isArray(coord) && coord.length > 2 && Number.isFinite(Number(coord[2]))
                ? Number(coord[2])
                : null;

            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

            return {
              lat,
              lng,
              ele_m: ele,
              time: null,
              type: 'route' as const,
            };
          })
          .filter(Boolean);

        run = runStore.createFromParsedImport(
          {
            name: fileName.replace(/\.[^.]+$/, ''),
            routePoints: geoPoints,
            trackPoints: [],
            primaryCoords: geoPoints,
            waypoints: [],
            raw: geo,
          },
          undefined,
          'geojson',
          fileName.replace(/\.[^.]+$/, '')
        );
      } else {
        const routePoints =
          parsed?.routes?.flatMap((r: any) =>
            (r.points ?? []).map((pt: any) => ({
              lat: pt?.lat,
              lng: pt?.lon ?? pt?.lng,
              ele_m: pt?.ele ?? null,
              time: pt?.time ?? null,
            }))
          ) ?? [];

        const trackPoints =
          parsed?.tracks?.flatMap((t: any) =>
            (t.segments ?? []).flatMap((s: any) =>
              (s.points ?? []).map((pt: any) => ({
                lat: pt?.lat,
                lng: pt?.lon ?? pt?.lng,
                ele_m: pt?.ele ?? null,
                time: pt?.time ?? null,
              }))
            )
          ) ?? [];

        const fallbackPrimary =
          routePoints.length === 0 && trackPoints.length === 0
            ? (primaryCoords ?? [])
                .map((coord: any) => {
                  const lng = Array.isArray(coord) ? Number(coord[0]) : null;
                  const lat = Array.isArray(coord) ? Number(coord[1]) : null;

                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

                  return {
                    lat,
                    lng,
                    ele_m: null,
                    time: null,
                  };
                })
                .filter(Boolean)
            : [];

        const normalizedParsed = {
          name: parsed?.name || fileName.replace(/\.[^.]+$/, '') || 'Imported Route',
          routePoints,
          trackPoints,
          primaryCoords: fallbackPrimary,
          waypoints: parsed?.waypoints ?? [],
          routes: parsed?.routes ?? [],
          tracks: parsed?.tracks ?? [],
        };

        
        run = runStore.createFromParsedImport(
          normalizedParsed,
          undefined,
          ext,
          normalizedParsed.name
        );
      }

      
      if (!run || (run.points?.length ?? 0) < 2) {
        throw new Error('IMPORT FAILED — Parsed route could not be converted into run points');
      }

      runStore.setActive(run.id);
      loadRuns();
      resetSnapshotForm();

      showToast(`RUN CREATED: ${run.title} (${run.stats.distance_miles.toFixed(1)} mi)`);
    } catch (err: any) {
      console.error('[Navigate] Immediate import failed:', err);
      showToast(err?.message || 'FAILED TO IMPORT ROUTE');
    }
  },
  [loadRuns, resetSnapshotForm, showToast, validateImportedRouteContent]
);

// ── GPX/KML/GeoJSON Import — immediate route creation ─────
const handleImportGPX = useCallback(async () => {
  
  // ── Web: Use DOM file input ──
  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.gpx,.xml,.kml,.geojson,.json';

    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) {
        showToast('IMPORT CANCELED');
        return;
      }

      const fileName = file.name || 'imported.gpx';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';

      if (!['gpx', 'xml', 'kml', 'geojson', 'json'].includes(ext)) {
        showToast('UNSUPPORTED FORMAT — Use .gpx, .kml, or .geojson');
        return;
      }

      try {
        const text = await file.text();

        if (!text || text.length === 0) {
          showToast('IMPORT FAILED — File appears to be empty');
          return;
        }

        
        showToast(`FILE SELECTED: ${fileName}`);
        handleImmediateImport(text, fileName);
      } catch (readErr) {
        console.error('[Navigate] Failed to read file:', readErr);
        showToast('IMPORT FAILED — Could not read file');
      }
    };

    input.click();
    return;
  }

  // ── Native (Android/iOS): Use expo-document-picker ──
try {
  const DocumentPicker = await import('expo-document-picker');

  const result = await DocumentPicker.getDocumentAsync({
    type: [
      'application/gpx+xml',
      'text/xml',
      'application/xml',
      'application/json',
      'application/geo+json',
      'text/plain',
      '*/*',
    ],
    copyToCacheDirectory: true,
  });

  if (result.canceled || !result.assets || result.assets.length === 0) {
    showToast('IMPORT CANCELED');
    return;
  }

  const asset = result.assets[0];
  const fileName = asset.name || 'imported.gpx';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (!['gpx', 'xml', 'kml', 'geojson', 'json'].includes(ext)) {
    showToast(`UNSUPPORTED FORMAT: .${ext} — Use .gpx, .kml, or .geojson`);
    return;
  }

  showToast(`FILE SELECTED: ${fileName}`);

  try {
    const fileUri = asset.uri;
    const content = await fsReadFileFromPickerUri(fileUri);

    if (!content || content.length === 0) {
      showToast('IMPORT FAILED — File appears to be empty');
      return;
    }

    handleImmediateImport(content, fileName);
  } catch (readErr: any) {
    console.error('[Navigate] Failed to read file content:', readErr);
    showToast('IMPORT FAILED — Could not read file content');
  }
} catch (pickerErr) {
  console.error('[Navigate] Document picker failed:', pickerErr);
  if (Platform.OS === 'android') {
    showToast('FILE IMPORT UNAVAILABLE — expo-document-picker may need to be installed');
  } else {
    showToast('FILE IMPORT UNAVAILABLE — Check build configuration');
  }
}
}, [handleImmediateImport, showToast]);

// Legacy snapshot-based import retained for optional future use
const handleCreateRun = useCallback(() => {
  if (!pendingGpxContent || !pendingGpxName) return;

  const snapshot: Partial<BuildSnapshot> = {
    vehicle_name: bsVehicleName || 'No Vehicle',
    estimated_range_miles: parseFloat(bsRange) || 0,
    total_weight_lb: parseFloat(bsTotalWeight) || 0,
    roof_weight_lb: parseFloat(bsRoofWeight) || 0,
    hitch_weight_lb: parseFloat(bsHitchWeight) || 0,
    limits: {
      roof_limit_lb: parseFloat(bsRoofLimit) || 0,
      hitch_limit_lb: parseFloat(bsHitchLimit) || 0,
    },
  };

  try {
    const ext = pendingGpxName.split('.').pop()?.toLowerCase() || '';
    const { parsed, primaryCoords } = validateImportedRouteContent(
      pendingGpxName,
      ext,
      pendingGpxContent
    );

    let run: ECSRun;

    if (ext === 'geojson' || ext === 'json') {
      const geoPoints = (primaryCoords ?? [])
        .map((coord: any) => {
          const lng = Array.isArray(coord) ? Number(coord[0]) : null;
          const lat = Array.isArray(coord) ? Number(coord[1]) : null;
          const ele =
            Array.isArray(coord) && coord.length > 2 && Number.isFinite(Number(coord[2]))
              ? Number(coord[2])
              : null;

          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

          return {
            lat,
            lng,
            ele_m: ele,
            time: null,
            type: 'route' as const,
          };
        })
        .filter(Boolean);

      run = runStore.createFromParsedImport(
        {
          name: pendingGpxName.replace(/\.[^.]+$/, ''),
          routePoints: geoPoints,
          trackPoints: [],
          primaryCoords: geoPoints,
          waypoints: [],
        },
        snapshot,
        'geojson',
        pendingGpxName.replace(/\.[^.]+$/, '')
      );
    } else {
      const routePoints =
        parsed?.routes?.flatMap((r: any) =>
          (r.points ?? []).map((pt: any) => ({
            lat: pt?.lat,
            lng: pt?.lon ?? pt?.lng,
            ele_m: pt?.ele ?? null,
            time: pt?.time ?? null,
          }))
        ) ?? [];

      const trackPoints =
        parsed?.tracks?.flatMap((t: any) =>
          (t.segments ?? []).flatMap((s: any) =>
            (s.points ?? []).map((pt: any) => ({
              lat: pt?.lat,
              lng: pt?.lon ?? pt?.lng,
              ele_m: pt?.ele ?? null,
              time: pt?.time ?? null,
            }))
          )
        ) ?? [];

      const fallbackPrimary =
        routePoints.length === 0 && trackPoints.length === 0
          ? (primaryCoords ?? [])
              .map((coord: any) => {
                const lng = Array.isArray(coord) ? Number(coord[0]) : null;
                const lat = Array.isArray(coord) ? Number(coord[1]) : null;

                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

                return {
                  lat,
                  lng,
                  ele_m: null,
                  time: null,
                };
              })
              .filter(Boolean)
          : [];

      run = runStore.createFromParsedImport(
        {
          name: parsed?.name || pendingGpxName.replace(/\.[^.]+$/, '') || 'Imported Route',
          routePoints,
          trackPoints,
          primaryCoords: fallbackPrimary,
          waypoints: parsed?.waypoints ?? [],
          routes: parsed?.routes ?? [],
          tracks: parsed?.tracks ?? [],
        },
        snapshot,
        ext,
        parsed?.name || pendingGpxName.replace(/\.[^.]+$/, '') || 'Imported Route'
      );
    }

    if (!run || (run.points?.length ?? 0) < 2) {
      throw new Error('FAILED TO PARSE GPX');
    }

    runStore.setActive(run.id);
    loadRuns();
    resetSnapshotForm();
    showToast(`RUN CREATED: ${run.title} (${run.stats.distance_miles.toFixed(1)} mi)`);
  } catch (err: any) {
    console.error('[Navigate] handleCreateRun failed:', err);
    showToast(err?.message || 'FAILED TO PARSE GPX');
  }
}, [
  pendingGpxContent,
  pendingGpxName,
  bsVehicleName,
  bsRange,
  bsTotalWeight,
  bsRoofWeight,
  bsHitchWeight,
  bsRoofLimit,
  bsHitchLimit,
  loadRuns,
  resetSnapshotForm,
  showToast,
  validateImportedRouteContent,
]);

  const handleQuickImport = useCallback(() => {
    if (!pendingGpxContent || !pendingGpxName) return;
    handleImmediateImport(pendingGpxContent, pendingGpxName);
  }, [handleImmediateImport, pendingGpxContent, pendingGpxName]);

  const activeHealth = useMemo(
    () => (activeRun ? computeRunHealth(activeRun) : null),
    [activeRun]
  );

  
  // ── Trail recording integration ──────────────────────────
  const refreshTrailState = useCallback(() => {
    setTrailStatus(trailStore.getStatus());
    setTrailStats(trailStore.getStats());
    setTrailSegments(trailStore.getTrailSegmentCoordinates());
    setTrailHistoryRefreshKey((k) => k + 1);
  }, []);

useEffect(() => {
  trailStore.recover();
  refreshTrailState();
  try { trailHistoryStore.autoCleanup(); } catch {}
}, [refreshTrailState]);

// GPS-based trail recording
useEffect(() => {
  if (!followUser || Platform.OS !== 'web') return;
  if (!navigator.geolocation) return;

  const watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, altitude, heading: gpsHeading, speed: gpsSpeed } = pos.coords;
      const speedMph = (gpsSpeed != null && gpsSpeed >= 0) ? gpsSpeed * 2.237 : 0;
      const result = trailStore.checkMovement(speedMph, activeExpeditionId);

      if (result === 'started') showToast('TRAIL RECORDING STARTED');
      else if (result === 'paused') showToast('TRAIL AUTO-PAUSED (STATIONARY)');

      const recorded = trailStore.recordPoint({
        lat: latitude,
        lng: longitude,
        elevation: altitude != null ? altitude : null,
        speed: speedMph,
        heading: gpsHeading != null && gpsHeading >= 0 ? gpsHeading : null,
      });

      if (recorded || result) refreshTrailState();
    },
    () => {},
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 2000 }
  );

  return () => navigator.geolocation.clearWatch(watchId);
}, [followUser, activeExpeditionId, showToast, refreshTrailState]);

  // Periodic stats refresh
  useEffect(() => {
    if (trailStatus === 'recording') {
      trailUpdateTimer.current = setInterval(() => {
        setTrailStats(trailStore.getStats());
        setTrailSegments(trailStore.getTrailSegmentCoordinates());
      }, 2000);
      return () => clearInterval(trailUpdateTimer.current);
    } else {
      if (trailUpdateTimer.current) clearInterval(trailUpdateTimer.current);
    }
  }, [trailStatus]);

  // Trail export handler
  const handleTrailExport = useCallback(() => {
    setTrailExportVisible(true);
  }, []);

  const handleTrailExportAction = useCallback((format: 'gpx' | 'json' | 'coords') => {
    let content = '';
    const expeditionPins = activeExpeditionId ? pinStore.getByExpedition(activeExpeditionId) : [];
    switch (format) {
      case 'gpx': content = trailStore.exportToGPX(expeditionPins, activeExpeditionName || 'ECS Trail'); break;
      case 'json': content = trailStore.exportToJSON(); break;
      case 'coords': content = trailStore.exportCoordinatesList(); break;
    }
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(content).then(() => {
        showToast(`TRAIL ${format.toUpperCase()} COPIED TO CLIPBOARD`);
      }).catch(() => showToast('COPY FAILED'));
    } else {
      showToast(`TRAIL EXPORTED AS ${format.toUpperCase()}`);
    }
    setTrailExportVisible(false);
  }, [activeExpeditionId, activeExpeditionName, showToast]);

  // ── Trail replay handlers ────────────────────────
  const currentReplayPoint = useMemo<TrailReplayPoint | null>(() => {
    if (!isReplayActive || !replayAnalytics) return null;
    if (replayFromHistory) return trailStore.getReplayPointFromAnalytics(replayAnalytics, replayCurrentSeconds);
    return trailStore.getReplayPointAtTime(replayCurrentSeconds);
  }, [isReplayActive, replayAnalytics, replayCurrentSeconds, replayFromHistory]);

  const replayTotalSeconds = useMemo(() => {
    if (!replayAnalytics || replayAnalytics.replay_data.length === 0) return 0;
    return replayAnalytics.replay_data[replayAnalytics.replay_data.length - 1].elapsed_seconds;
  }, [replayAnalytics]);

  const handleReplayStart = useCallback(() => {
    hapticCommand();
    const analytics = trailStore.getAnalytics();
    if (!analytics || analytics.replay_data.length < 2) {
      showToast('NOT ENOUGH TRAIL DATA FOR REPLAY');
      return;
    }
    setReplayFromHistory(false);
    setReplayHistoryTrailSegments([]);
    setReplayAnalytics(analytics);
    setReplayCurrentSeconds(0);
    setReplayPlaying(false);
    setReplaySpeed(1);
    setIsReplayActive(true);
    const firstPoint = analytics.replay_data[0];
    setReplayMarkerPos({ lat: firstPoint.lat, lng: firstPoint.lng });
    showToast('REPLAY MODE ACTIVATED');
  }, [showToast]);

  const handleReplayPlay = useCallback(() => { hapticMicro(); setReplayPlaying(true); }, []);
  const handleReplayPause = useCallback(() => { hapticMicro(); setReplayPlaying(false); }, []);

  const handleReplaySeek = useCallback((seconds: number) => {
    setReplayCurrentSeconds(seconds);
    if (replayFromHistory && replayAnalytics) {
      const point = trailStore.getReplayPointFromAnalytics(replayAnalytics, seconds);
      if (point) setReplayMarkerPos({ lat: point.lat, lng: point.lng });
    } else {
      const point = trailStore.getReplayPointAtTime(seconds);
      if (point) setReplayMarkerPos({ lat: point.lat, lng: point.lng });
    }
  }, [replayFromHistory, replayAnalytics]);

  const handleReplaySpeedChange = useCallback((speed: ReplaySpeed) => { setReplaySpeed(speed); }, []);

  const handleReplayExit = useCallback(() => {
    hapticMicro();
    setIsReplayActive(false);
    setReplayPlaying(false);
    setReplayCurrentSeconds(0);
    setReplayMarkerPos(null);
    setReplayAnalytics(null);
    setReplayFromHistory(false);
    setReplayHistoryTrailSegments([]);
    if (replayTimerRef.current) { clearInterval(replayTimerRef.current); replayTimerRef.current = null; }
    showToast('REPLAY MODE EXITED');
  }, [showToast]);

  // Replay playback timer
  useEffect(() => {
    if (isReplayActive && replayPlaying && replayAnalytics) {
      const totalSec = replayAnalytics.replay_data.length > 0
        ? replayAnalytics.replay_data[replayAnalytics.replay_data.length - 1].elapsed_seconds : 0;
      replayTimerRef.current = setInterval(() => {
        setReplayCurrentSeconds(prev => {
          const next = prev + replaySpeed;
          if (next >= totalSec) { setReplayPlaying(false); return totalSec; }
          return next;
        });
      }, 1000);
      return () => { if (replayTimerRef.current) { clearInterval(replayTimerRef.current); replayTimerRef.current = null; } };
    } else {
      if (replayTimerRef.current) { clearInterval(replayTimerRef.current); replayTimerRef.current = null; }
    }
  }, [isReplayActive, replayPlaying, replaySpeed, replayAnalytics]);

  // Update replay marker
  useEffect(() => {
    if (!isReplayActive || !replayAnalytics) return;
    if (replayFromHistory) {
      const point = trailStore.getReplayPointFromAnalytics(replayAnalytics, replayCurrentSeconds);
      if (point) setReplayMarkerPos({ lat: point.lat, lng: point.lng });
    } else {
      const point = trailStore.getReplayPointAtTime(replayCurrentSeconds);
      if (point) setReplayMarkerPos({ lat: point.lat, lng: point.lng });
    }
  }, [replayCurrentSeconds, isReplayActive, replayAnalytics, replayFromHistory]);

  // ── Trail history handlers ───────────────────────
  const handleReplayFromHistory = useCallback((trailId: string) => {
    hapticCommand();
    const data = trailHistoryStore.getReplayData(trailId);
    if (!data || data.analytics.replay_data.length < 2) {
      showToast('NOT ENOUGH DATA TO REPLAY THIS TRAIL');
      return;
    }
    const segMap = new Map<string, [number, number][]>();
    for (const p of data.points) {
      if (!segMap.has(p.segment_id)) segMap.set(p.segment_id, []);
      segMap.get(p.segment_id)!.push([p.lng, p.lat]);
    }
    const historySegs: TrailSegmentData[] = [];
    for (const [segId, coords] of segMap) {
      historySegs.push({ segment_id: segId, coordinates: coords });
    }
    setReplayHistoryTrailSegments(historySegs);
    setReplayFromHistory(true);
    setReplayAnalytics(data.analytics);
    setReplayCurrentSeconds(0);
    setReplayPlaying(false);
    setReplaySpeed(1);
    setIsReplayActive(true);
    const firstPoint = data.analytics.replay_data[0];
    setReplayMarkerPos({ lat: firstPoint.lat, lng: firstPoint.lng });
    showToast('REPLAYING SAVED TRAIL');
  }, [showToast]);

  const handleExportFromHistory = useCallback((trailId: string, format: 'gpx' | 'json') => {
    let content: string | null = null;
    if (format === 'gpx') content = trailHistoryStore.exportTrailAsGPX(trailId);
    else content = trailHistoryStore.exportTrailAsJSON(trailId);
    if (!content) { showToast('EXPORT FAILED'); return; }
    if (Platform.OS === 'web' && navigator.clipboard) {
      navigator.clipboard.writeText(content).then(() => {
        showToast(`TRAIL ${format.toUpperCase()} COPIED TO CLIPBOARD`);
      }).catch(() => showToast('COPY FAILED'));
    } else {
      showToast(`TRAIL EXPORTED AS ${format.toUpperCase()}`);
    }
  }, [showToast]);

  const effectiveTrailSegments = replayFromHistory ? replayHistoryTrailSegments : trailSegments;

  // ── Speed bucket segments for heatmap rendering ──────────
  const speedBucketSegments: SpeedSegmentData[] = useMemo(() => {
    if (trailStyle !== 'speed') return [];
    try {
      return trailStore.getSpeedBucketSegments() as SpeedSegmentData[];
    } catch { return []; }
  }, [trailStyle, trailSegments]);

// ─────────────────────────────────────────────────────────
// MapRenderer stability layer (prevents re-render storms)
// ─────────────────────────────────────────────────────────

const mapWaypoints = useMemo(
  () => activeRun?.waypoints || [],
  [activeRun?.waypoints]
);

const mapSegments = useMemo(
  () => segmentFeatures || [],
  [segmentFeatures]
);

const mapBailoutMarkers = useMemo(
  () => bailoutMarkers || [],
  [bailoutMarkers]
);

const mapPinMarkers = useMemo(
  () => filteredPinMarkers || [],
  [filteredPinMarkers]
);

const mapTrailSegments = useMemo(
  () => trailSegments || [],
  [trailSegments]
);

const mapSpeedSegments = useMemo(
  () => speedBucketSegments || [],
  [speedBucketSegments]
);

const mapHealthLevel = useMemo(
  () => activeHealth?.overall || 'green',
  [activeHealth?.overall]
);

const mapFollowReplay = useMemo(
  () => isReplayActive && replayPlaying,
  [isReplayActive, replayPlaying]
);

const mapTrailActive = useMemo(
  () => trailStatus === 'recording',
  [trailStatus]
);


  // ── Offline map bounds callback ───────────────────────────
  const handleMapBoundsReply = useCallback((bounds: TileBounds, zoom: number) => {
    setMapBounds(bounds);
    setMapZoom(zoom);
  }, []);

  const handleRequestMapBounds = useCallback(() => {
    setRequestBoundsTrigger(prev => prev + 1);
  }, []);

  const handleOpenOfflineCache = useCallback(() => {
    hapticCommand();
    setRequestBoundsTrigger(prev => prev + 1);
    setOfflineCacheModalVisible(true);
  }, []);


  // ── Expand/collapse for true fullscreen ───────────────────
  const toggleMapExpanded = useCallback(() => {
    hapticMicro();
    setMapExpanded(prev => !prev);
  }, []);

  const collapseMap = useCallback(() => {
    if (mapExpanded) { hapticMicro(); setMapExpanded(false); }
  }, [mapExpanded]);

useEffect(() => {
    console.log('[Navigate JSX] Gate check', {
      hasToken,
      mapLoading,
      tokenLength: mapToken?.length ?? 0,
      points: validatedRunPoints.length,
    });
  }, [hasToken, mapLoading, mapToken, validatedRunPoints.length]);

  return (
  <View style={styles.container}>
  {/* ═══════════ HEADER ═══════════ */}
  {!mapExpanded && (
    <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>
      <Header onAuthPress={() => setAuthVisible(true)} />
    </View>
  )}

  {/* ═══════════ TACTICAL ACTION BAR ═══════════ */}
  {!mapExpanded && (
    <View onLayout={(e) => setActionBarHeight(e.nativeEvent.layout.height)}>
      <View style={styles.actionBarWithIntelRow}>
        <View style={styles.actionBarFlex}>
          <TacticalActionBar
  onImport={handleImportGPX}
  onDropPin={handleDropPinHere}
  onOffline={handleOpenOfflineCache}
  onIntel={() => setIntelOpen((v) => !v)}
  onTrail={() => setTrailModalVisible(true)}
  trailStatus={trailStatus}
  pinActive={pinDropMode}
/>
        </View>
      </View>
    </View>
  )}

  {/* ═══════════ STORAGE WARNING BANNER ═══════════ */}
  {!mapExpanded && (
    <View onLayout={(e) => setStorageBannerHeight(e.nativeEvent.layout.height)}>
      <StorageWarningBanner
        report={cleanupReport}
        onCleanupComplete={handleCleanupComplete}
        onOpenOfflineCache={handleOpenOfflineCache}
        showToast={showToast}
      />
    </View>
  )}

                  {/* ═══════════ MAP CONTAINER (fills remaining space) ═══════════ */}
      <View style={mapExpanded ? styles.mapFullscreen : styles.mapContainer}>
        {/* Loading overlay */}
        {mapLoading && (
          <View style={styles.mapLoadingOverlay}>
            <ActivityIndicator size="small" color={TACTICAL.amber} />
            <Text style={styles.mapLoadingText}>INITIALIZING MAP</Text>
          </View>
        )}

        {/* GPS Status Overlay — non-blocking, fades when fix acquired */}
        {!mapLoading && (
          <GPSStatusOverlay
            gpsStatus={gps.gpsStatus}
            fixQuality={gps.fixQuality}
            hasFix={gps.hasFix}
            retryCount={gps.retryCount}
            permissionDenied={gps.permissionDenied}
            error={gps.error}
            onRetry={handleGpsRetry}
            mapReady={!mapLoading}
          />
        )}

        {/* MapRenderer */}
{hasToken ? (
  <View style={{ flex: 1 }}>
    <MapRenderer
      points={validatedRunPoints}
      waypoints={activeRun?.waypoints || []}
      healthLevel={activeHealth?.overall || 'green'}
      mapStyle={mapStyle}
      mapboxToken={mapToken || ''}
      showUserLocation={!!userLocation}
      followUser={followUser}
      userLocation={userLocation}
      interactive
      segments={segmentFeatures}
      bailoutMarkers={bailoutMarkers}
      pinMarkers={filteredPinMarkers}
      showCrosshair={showCrosshair}
      onLongPress={handleLongPress}
      onPinTap={handlePinTap}
      onMapTap={handleDirectMapTapForPin}
      onMapCenterReply={handleMapCenterReply}
      requestCenterTrigger={centerZoomTrigger}
      onMapBoundsReply={handleMapBoundsReply}
      requestBoundsTrigger={requestBoundsTrigger}
      trailSegments={trailSegments}
      trailActive={trailStatus === 'recording'}
      replayMarker={replayMarkerPos}
      followReplay={isReplayActive && replayPlaying}
      speedSegments={speedBucketSegments}
      trailStyle={trailStyle}
      onTiltAlertTap={handleTiltAlertTap}
      onUserDrag={handleUserDrag}
      onRoadClassification={handleRoadClassification}
      vehicleHeading={vehicleHeadingHook.heading}
      isLoading={mapLoading}
      hasToken={hasToken}
      onRetry={handleMapRetry}
      campsiteMarkers={campsiteCandidates?.candidates ?? []}
      tiltAlertMarkers={showTiltAlertZones ? tiltAlertMarkers : []}
    />

    <WeatherAlertMapOverlay
      alerts={weatherAlerts}
      onPress={() => setWeatherAlertDetailVisible(true)}
    />

    {intelOpen && (
      <View style={styles.intelPanel}>
        <RouteAnalysisPanel routeIntelligence={routeIntelligence} />
        <ResourceForecastPanel forecast={resourceForecast} />
        <TerrainAnalysisPanel terrain={terrainIntelligence} />
      </View>
    )}

    <TelemetryHUD
      userLocation={userLocation}
      followUser={followUser}
      activeExpeditionName={activeExpeditionName}
      visible={followUser}
      trailStatus={trailStatus}
      trailStats={trailStats}
      replayMode={isReplayActive}
      replayPoint={currentReplayPoint}
      gpsPosition={gps.position}
      fixQuality={gps.fixQuality}
    />

    {mapExpanded && (
  <View
    style={[
      styles.mapStyleSelectorWrap,
      { top: MAP_TOP_ANCHOR + 4 },
    ]}
  >
    <View style={styles.mapStyleSelectorPillHorizontal}>
      {[
        { key: 'day', label: 'DAY' },
        { key: 'tac', label: 'TAC' },
        { key: 'sat', label: 'SAT' },
      ].map(({ key, label }) => {
        const isActive = mapStyleMode === key;

        return (
          <TouchableOpacity
            key={key}
            style={[
              styles.mapStyleButtonHorizontal,
              isActive && styles.mapStyleButtonActive,
            ]}
            onPress={() => setMapStyleMode(key as any)}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.mapStyleButtonText,
                isActive && styles.mapStyleButtonTextActive,
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
)}

    <CompassRose
      heading={vehicleHeadingHook.heading != null ? vehicleHeadingHook.heading : undefined}
      followUser={followUser}
      userLocation={userLocation}
      visible={true}
      onPress={handleRecenter}
      accuracy={vehicleHeadingHook.accuracy}
      needsRecalibration={vehicleHeadingHook.needsRecalibration}
      isStationaryLocked={vehicleHeadingHook.isStationaryLocked}
      source={vehicleHeadingHook.source}
      containerStyle={{ bottom: COMPASS_BOTTOM }}
    />
  </View>
) : (
  <View style={styles.emptyMap}>
    <ActivityIndicator size="large" color={TACTICAL.amber} />
    <Text style={styles.emptyMapTitle}>CONNECTING TO MAP SERVICE</Text>
    <Text style={styles.emptyMapBody}>
      Resolving map configuration. This may take a moment on first launch.
    </Text>
  </View>
)}
</View>

{/* ═══════════ FLOATING MAP OVERLAYS ═══════════ */}
<View pointerEvents="box-none" style={styles.mapOverlayLayer}>
  {mapExpanded && allPins.length > 0 && (
  <TouchableOpacity
    style={[
      styles.floatingPill,
      styles.pinListPill,
      { top: PIN_LIST_TOP },
    ]}
    onPress={() => setPinDrawerVisible(true)}
    activeOpacity={0.85}
  >
    <Ionicons name="list-outline" size={14} color={TACTICAL.amber} />
    <View style={styles.pinCountBubble}>
      <Text style={styles.pinCountText}>{allPins.length}</Text>
    </View>
  </TouchableOpacity>
)}

  {!mapExpanded && activeRun && activeHealth && (
    <TouchableOpacity
      style={[
        styles.activeRunBadge,
        {
          top: undefined,
          bottom: commandDockHeight - 35,
        },
      ]}
      onPress={() =>
        router.push({ pathname: '/navigate-run', params: { runId: activeRun.id } } as any)
      }
      activeOpacity={0.85}
    >
      <View
        style={[
          styles.runHealthDot,
          {
            backgroundColor:
              activeHealth.overall === 'green'
                ? '#66BB6A'
                : activeHealth.overall === 'yellow'
                  ? '#FFB300'
                  : '#EF5350',
          },
        ]}
      />
      <Text style={styles.activeRunBadgeText} numberOfLines={2}>
        {activeRun.title}
      </Text>
      <Text style={styles.activeRunBadgeDist}>
        {activeRun.stats.distance_miles.toFixed(1)} MI
      </Text>
      <Ionicons name="chevron-forward" size={10} color={TACTICAL.textMuted} />
    </TouchableOpacity>
  )}

  {mapExpanded && !pinModalVisible && !pinDropMode && (
    <View
      style={[
        styles.dropPinHereContainer,
        { bottom: DROP_PIN_BOTTOM },
      ]}
    >
      <TouchableOpacity
        style={[
          styles.dropPinHereBtn,
          pinDropMode && styles.dropPinHereBtnActive,
        ]}
        onPress={handleQuickPinDrop}
        activeOpacity={0.85}
      >
        <Ionicons
          name={pinDropMode ? 'radio-button-on' : 'pin-outline'}
          size={16}
          color="#0B0F12"
        />
        <Text style={styles.dropPinHereBtnText}>
          {pinDropMode ? 'PIN ARMED' : 'DROP PIN HERE'}
        </Text>
      </TouchableOpacity>

      <Text style={styles.dropPinHereHint}>
        Pin mode will place the next tap exactly
      </Text>
    </View>
  )}

  {!isReplayActive && activeExpeditionId && !activeRun && (
    <LiveOdometer
      expeditionId={activeExpeditionId}
      expeditionName={activeExpeditionName}
      visible={!mapExpanded || !pinModalVisible}
      showToast={showToast}
    />
  )}

  {isReplayActive && (
    <View
      style={[
        styles.replayBarOverlay,
        {
          top: MAP_TOP_ANCHOR + 46,
        },
      ]}
    >
      <ReplayBar
        visible={isReplayActive}
        totalSeconds={replayTotalSeconds}
        totalPoints={replayAnalytics?.replay_data?.length || 0}
        currentSeconds={replayCurrentSeconds}
        currentPoint={currentReplayPoint}
        isPlaying={replayPlaying}
        speed={replaySpeed}
        onPlay={handleReplayPlay}
        onPause={handleReplayPause}
        onSeek={handleReplaySeek}
        onSpeedChange={handleReplaySpeedChange}
        onExit={handleReplayExit}
      />
    </View>
  )}

  {pinDropMode && (
    <Animated.View
      style={[
        styles.pinModeBanner,
        {
          bottom: commandDockHeight + 44,
          transform: [{ scale: pinModePulse }],
        },
      ]}
      pointerEvents="none"
    >
      <Ionicons name="location" size={14} color={TACTICAL.amber} />
      <Text style={styles.pinModeBannerText}>PIN MODE ACTIVE • TAP MAP</Text>
    </Animated.View>
  )}

  {mapExpanded && (
    <View style={styles.expandedActionBar}>
      <View style={styles.actionBarWithIntelRow}>
        <View style={styles.actionBarFlex}>
          <TacticalActionBar
            onImport={handleImportGPX}
            onDropPin={handleDropPinHere}
            onOffline={handleOpenOfflineCache}
            onIntel={() => setIntelOpen((v) => !v)}
            onTrail={() => setTrailModalVisible(true)}
            trailStatus={trailStatus}
            pinActive={pinDropMode}
          />
        </View>
      </View>
    </View>
  )}

  {renderMapPopup(
  pinDrawerVisible,
  'PINS',
  'pin-outline',
  () => setPinDrawerVisible(false),
  <ScrollView
    style={styles.mapPopupScroll}
    contentContainerStyle={styles.mapPopupScrollContent}
    showsVerticalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
  >
    <PinDrawer
      pins={categoryFilteredPins}
      allPins={allPins}
      userLocation={userLocation}
      activeExpeditionId={activeExpeditionId}
      onSelectPin={handleSelectPin}
      onEditPin={handleEditPin}
      onResolvePin={handleResolvePin}
      onExport={handleExportPins}
      onRefresh={loadPins}
      activePinTypeFilters={activePinTypeFilters}
      onPinTypeFilterToggle={handlePinTypeFilterToggle}
      onPinTypeFilterReset={handlePinTypeFilterReset}
    />
  </ScrollView>
)}

  {renderMapPopup(
    intelOpen,
    'INTEL',
    'analytics-outline',
    () => setIntelOpen(false),
    <ScrollView
      style={styles.mapPopupScroll}
      contentContainerStyle={styles.mapPopupScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <RouteAnalysisPanel routeIntelligence={routeIntelligence} />
      <ResourceForecastPanel forecast={resourceForecast} />
      <TerrainAnalysisPanel terrain={terrainIntelligence} />
      <CampsiteCandidatePanel result={campsiteCandidates} />
      <ExpeditionForecastPanel forecast={expeditionForecast} />
    </ScrollView>
  )}

  {renderMapPopup(
    trailModalVisible,
    trailStatus === 'idle' ? 'TRAIL' : 'TRAIL STATUS',
    'trail-sign-outline',
    () => setTrailModalVisible(false),
    <ScrollView
      style={styles.mapPopupScroll}
      contentContainerStyle={styles.mapPopupScrollContent}
      showsVerticalScrollIndicator={false}
    >
      <TrailStatusModal
        visible={true}
        onClose={() => setTrailModalVisible(false)}
        status={trailStatus}
        stats={trailStats || DEFAULT_TRAIL_STATS}
        activeExpeditionId={activeExpeditionId}
        activeExpeditionName={activeExpeditionName}
        onStatusChange={refreshTrailState}
        onExport={handleTrailExport}
        onReplay={handleReplayStart}
        onReplayFromHistory={handleReplayFromHistory}
        onExportFromHistory={handleExportFromHistory}
        showToast={showToast}
      />
    </ScrollView>
  )}

  {renderMapPopup(
  offlineCacheModalVisible,
  'OFFLINE CACHE',
  'cloud-download-outline',
  () => setOfflineCacheModalVisible(false),
  <ScrollView
    style={styles.mapPopupScroll}
    contentContainerStyle={styles.mapPopupScrollContent}
    showsVerticalScrollIndicator={false}
  >
    <OfflineCacheModal
      embedded
      mapBounds={mapBounds}
      mapZoom={mapZoom}
      mapStyle={mapStyle}
      showToast={showToast}
      onRequestMapBounds={handleRequestMapBounds}
    />
  </ScrollView>
)}

  {renderMapPopup(
  storageDashboardVisible,
  'STORAGE',
  'server-outline',
  () => setStorageDashboardVisible(false),
  <ScrollView
    style={styles.mapPopupScroll}
    contentContainerStyle={styles.mapPopupScrollContent}
    showsVerticalScrollIndicator={false}
  >
    <StorageDashboardModal
      embedded
      showToast={showToast}
    />
  </ScrollView>
)}
</View>

{/* ═══════════ PIN DETAILS POPUP ═══════════ */}
{renderMapPopup(
  pinModalVisible,
  editingPin ? 'EDIT PIN' : 'DROP PIN',
  editingPin ? 'create-outline' : 'pin-outline',
  () => {
    setPinModalVisible(false);
    setEditingPin(null);
    setDropCoords(null);
    setShowCrosshair(false);
  },
  <ScrollView
    style={styles.mapPopupScroll}
    contentContainerStyle={styles.mapPopupScrollContent}
    showsVerticalScrollIndicator={false}
    keyboardShouldPersistTaps="handled"
  >
    <PinDetailsModal
      embedded
      onClose={() => {
        setPinModalVisible(false);
        setEditingPin(null);
        setDropCoords(null);
        setShowCrosshair(false);
      }}
      onSave={handlePinSave}
      onDelete={handlePinDelete}
      onResolve={handlePinResolve}
      editPin={editingPin}
      coordinates={dropCoords}
      activeExpeditionId={activeExpeditionId}
      activeExpeditionName={activeExpeditionName}
    />
  </ScrollView>
)}

{/* ═══════════ TILT ALERT DETAIL MODAL ═══════════ */}
<TiltAlertDetailModal
  visible={tiltAlertDetailVisible}
  onClose={() => {
    setTiltAlertDetailVisible(false);
    setTiltAlertDetailEvent(null);
    setTiltAlertDetailCluster(null);
  }}
  event={tiltAlertDetailEvent}
  cluster={tiltAlertDetailCluster}
/>

{/* ═══════════ WEATHER ALERT DETAIL MODAL ═══════════ */}
<WeatherAlertDetailModal
  visible={weatherAlertDetailVisible}
  onClose={() => setWeatherAlertDetailVisible(false)}
  alerts={weatherAlerts.alerts}
  source={weatherAlerts.source}
  lastFetchAt={weatherAlerts.lastFetchAt}
  conditionsSummary={weatherAlerts.conditionsSummary}
  tempString={weatherAlerts.tempString}
  windString={weatherAlerts.windString}
  onRefresh={weatherAlerts.refresh}
  loading={weatherAlerts.loading}
  error={weatherAlerts.error}
/>

{/* ═══════════ ROUTE CORRIDOR WEATHER DETAIL MODAL ═══════════ */}
<RouteWeatherDetailModal
  visible={routeWeatherDetailVisible}
  onClose={() => setRouteWeatherDetailVisible(false)}
  points={routeCorridorWeather.points}
  totalDistanceMi={routeCorridorWeather.totalDistanceMi}
  worstHazard={routeCorridorWeather.worstHazard}
  allAlerts={routeCorridorWeather.allAlerts}
  source={routeCorridorWeather.source}
  lastFetchAt={routeCorridorWeather.lastFetchAt}
  loading={routeCorridorWeather.loading}
  error={routeCorridorWeather.error}
  onRefresh={routeCorridorWeather.refresh}
  approachingHazard={routeCorridorWeather.approachingHazard}
/>

<AuthModal visible={authVisible} onClose={() => setAuthVisible(false)} />
<Toast />
        
      </View>
    );
}

function FormField({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  keyboardType?: 'numeric' | 'default';
}) {

  return (
    <View style={styles.formField}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={styles.formInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TACTICAL.textMuted + '60'}
        keyboardType={keyboardType}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const FLOATING_PILL_BOTTOM = 120;

const MAP_EDGE = 16;
const MAP_BOTTOM_CONTROLS = 118;
const MAP_RIGHT_STACK_GAP = 12;
const MAP_STYLE_TOP_OFFSET = 14;
const EXPANDED_ACTION_TOP = 60;

export default function NavigateScreen() {
  return (
    <TabErrorBoundary tabName="NAVIGATE">
      <NavigateScreenInner />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: TACTICAL.bg },

mapOverlayLayer: {
  ...StyleSheet.absoluteFillObject,
  zIndex: 40,
},

  // ── Map Container (fills remaining space) ─────────────────
  mapContainer: {
  flex: 1,
  borderTopWidth: GOLD_RAIL.sectionWidth,
  borderTopColor: GOLD_RAIL.section,
  backgroundColor: TACTICAL.panel,
  position: 'relative',
  marginTop: 2,
},
  mapFullscreen: {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 100,
  backgroundColor: TACTICAL.panel,
},
  phase1Fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8 },
  emptyMap: {
  flex: 1,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 24,
  backgroundColor: '#0A0D12',
},

emptyMapTitle: {
  marginTop: 12,
  color: TACTICAL.text,
  fontSize: 13,
  fontWeight: '800',
  letterSpacing: 1,
},

emptyMapBody: {
  marginTop: 6,
  color: TACTICAL.textMuted,
  fontSize: 12,
  textAlign: 'center',
  lineHeight: 18,
  maxWidth: 260,
},

  mapLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
    backgroundColor: TACTICAL.panel,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  mapLoadingText: { ...TYPO.U2, color: TACTICAL.textMuted, fontSize: 8 },

  // ── Floating Map Overlays ─────────────────────────────────
floatingPill: {
  position: 'absolute',
  zIndex: 30,
  backgroundColor: 'rgba(11,15,18,0.9)',
  borderRadius: 8,
  borderWidth: 1,
  borderColor: 'rgba(62,79,60,0.4)',
  alignItems: 'center',
  justifyContent: 'center',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.4,
  shadowRadius: 4,
  elevation: 6,
},

expandPill: {
  right: 14,
  width: 34,
  height: 34,
},

pinListPill: {
  left: 14,
  width: 34,
  height: 34,
  zIndex: 50,
  elevation: 50,
},

replayBarOverlay: {
  position: 'absolute',
  left: 8,
  right: 8,
  zIndex: 35,
},

mapStyleSelectorWrap: {
  position: 'absolute',
  right: MAP_EDGE,
  zIndex: 120,
  elevation: 120,
  alignItems: 'center',
},

mapStyleSelectorPillHorizontal: {
  flexDirection: 'row',
  alignItems: 'center',
  padding: 3,
  borderRadius: 12,
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
  gap: 4,
},

actionBarWithIntelRow: {
  flexDirection: 'row',
  alignItems: 'stretch',
  paddingHorizontal: 16,
  gap: 10,
},

actionBarFlex: {
  flex: 1,
},

topIntelTile: {
  width: 84,
  height: 106,
  borderRadius: 18,
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
  flexShrink: 0,
},

topIntelTileActive: {
  backgroundColor: 'rgba(196,138,44,0.95)',
  borderColor: 'rgba(255,220,140,0.35)',
},

topIntelTileText: {
  color: TACTICAL.textMuted,
  fontSize: 11,
  fontWeight: '900',
  letterSpacing: 1.8,
},

topIntelTileTextActive: {
  color: '#091014',
},

mapRightRail: {
  position: 'absolute',
  right: 16,
  top: 148,
  alignItems: 'center',
  gap: 12,
  zIndex: 110,
  elevation: 110,
},

mapStyleContainer: {
  position: 'absolute',
  right: 16,
  top: 140,
  padding: 4,
  borderRadius: 16,
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
  zIndex: 110,
},

mapStyleButtonHorizontal: {
  minWidth: 44,
  height: 24,
  paddingHorizontal: 10,
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
},

mapStyleButtonActive: {
  backgroundColor: 'rgba(196,138,44,0.95)',
  borderColor: 'rgba(255,220,140,0.35)',
},

mapStyleButtonText: {
  color: TACTICAL.amber,
  fontSize: 9,
  fontWeight: '900',
  letterSpacing: 1.0,
},

mapStyleButtonTextActive: {
  color: '#091014',
},

mapRailButton: {
  width: 54,
  height: 54,
  borderRadius: 16,
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
},

// ── Active Run Badge ──────────────────────────────────────
activeRunBadge: {
  position: 'absolute',
  left: 16,
  right: 16,
  zIndex: 25,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  backgroundColor: 'rgba(11,15,18,0.92)',
  paddingHorizontal: 10,
  paddingVertical: 7,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.25)',
  alignSelf: 'center',
  maxWidth: 360,
},
runHealthDot: {
  width: 7,
  height: 7,
  borderRadius: 4,
},
activeRunBadgeText: {
  ...TYPO.T3,
  color: TACTICAL.text,
  fontSize: 11,
  flex: 1,
  letterSpacing: 1,
},
activeRunBadgeDist: {
  fontFamily: 'Courier',
  fontSize: 11,
  fontWeight: '700',
  color: TACTICAL.amber,
  letterSpacing: 0.5,
},

// ── Minimize Button (expanded) ────────────────────────────
minimizeBtn: {
  position: 'absolute',
  right: 16,
  zIndex: 110,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  backgroundColor: 'rgba(11,15,18,0.94)',
  paddingHorizontal: 14,
  paddingVertical: 10,
  borderRadius: 10,
  borderWidth: 1.5,
  borderColor: 'rgba(196,138,44,0.45)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.6,
  shadowRadius: 8,
  elevation: 12,
},
minimizeBtnText: {
  ...TYPO.U2,
  fontSize: 9,
  color: TACTICAL.amber,
  letterSpacing: 3,
},

// ── Expanded Action Bar (overlay at top of fullscreen map) ──
expandedActionBar: {
  position: 'absolute',
  top: 60,
  left: 0,
  right: 0,
  zIndex: 108,
},

topRightControlsRow: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: 10,
},

topRightIntelPill: {
  width: 116,
  height: 104,
  borderRadius: 18,
  paddingHorizontal: 10,
  paddingVertical: 10,
  alignItems: 'center',
  justifyContent: 'center',
},

// ── Popup Layer ─────────────────────────────────────
mapPopupLayer: {
  ...StyleSheet.absoluteFillObject,
  zIndex: 160,
  elevation: 160,
},

mapPopupBackdrop: {
  ...StyleSheet.absoluteFillObject,
  backgroundColor: 'rgba(0,0,0,0.30)',
},

mapPopupShell: {
  position: 'absolute',
  left: 10,
  right: 10,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  backgroundColor: 'rgba(8,12,15,0.985)',
  overflow: 'hidden',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.35,
  shadowRadius: 16,
  elevation: 18,
},

mapPopupHeader: {
  minHeight: 48,
  paddingHorizontal: 14,
  borderBottomWidth: 1,
  borderBottomColor: 'rgba(196,138,44,0.16)',
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'rgba(12,16,20,0.98)',
},

mapPopupTitleRow: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},

mapPopupTitle: {
  color: TACTICAL.amber,
  fontSize: 12,
  fontWeight: '900',
  letterSpacing: 1.4,
},

mapPopupBody: {
  flex: 1,
},

mapPopupScroll: {
  flex: 1,
},

mapPopupScrollContent: {
  padding: 14,
  paddingBottom: 28,
},

// ── Crosshair Reticle ─────────────────────────────────────
crosshairContainer: {
  ...StyleSheet.absoluteFillObject,
  zIndex: 105,
  alignItems: 'center',
  justifyContent: 'center',
},
crosshairRing: {
  position: 'absolute',
  width: 28,
  height: 28,
  borderRadius: 14,
  borderWidth: 1.5,
  borderColor: 'rgba(196,138,44,0.7)',
  backgroundColor: 'transparent',
},
crosshairLineH: {
  position: 'absolute',
  top: '50%',
  width: 18,
  height: 1.5,
  marginTop: -0.75,
  backgroundColor: 'rgba(196,138,44,0.6)',
},
crosshairLineV: {
  position: 'absolute',
  left: '50%',
  width: 1.5,
  height: 18,
  marginLeft: -0.75,
  backgroundColor: 'rgba(196,138,44,0.6)',
},
crosshairDot: {
  position: 'absolute',
  width: 4,
  height: 4,
  borderRadius: 2,
  backgroundColor: 'rgba(196,138,44,0.9)',
},

  // ── Drop Pin Here ─────────────────────────────────────────
  dropPinHereContainer: {
  position: 'absolute',
  left: 0,
  right: 0,
  zIndex: 108,
  alignItems: 'center',
  
},
  dropPinHereBtn: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
  backgroundColor: TACTICAL.amber,
  paddingHorizontal: 22,
  paddingVertical: 12,
  borderRadius: 12,
  opacity: 0.6, // 👈 moved here
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.5,
  shadowRadius: 10,
  elevation: 10,
},
  dropPinHereBtnText: {
    ...TYPO.U1,
    color: '#0B0F12',
    fontSize: 13,
    letterSpacing: 3,
  },
  dropPinHereHint: {
    ...TYPO.B2,
    color: 'rgba(230,230,225,0.6)',
    fontSize: 10,
    marginTop: 6,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },


  // ── Export Modal ─────────────────────────────────────────
  exportOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  exportContainer: {
    backgroundColor: TACTICAL.panel, borderRadius: 16, padding: 20,
    width: '85%', maxWidth: 360,
    borderWidth: 1, borderColor: TACTICAL.amber + '30',
  },
  exportHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  exportTitle: { ...TYPO.T2, color: TACTICAL.amber },
  exportSub: { ...TYPO.B2, color: TACTICAL.textMuted, fontSize: 11, marginBottom: 16 },
  exportActions: { flexDirection: 'row', gap: 10 },
  exportBtn: {
    flex: 1, alignItems: 'center', gap: 6,
    paddingVertical: 16, borderRadius: 10,
    borderWidth: 1, borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.06)',
  },
  exportBtnLabel: { ...TYPO.U2, color: TACTICAL.amber, fontSize: 9, letterSpacing: 3 },
  exportBtnSub: { ...TYPO.B2, color: TACTICAL.textMuted, fontSize: 8 },

  // ── Snapshot Modal ───────────────────────────────────────
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContainer: {
    backgroundColor: TACTICAL.panel, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '90%', borderTopWidth: 2, borderColor: TACTICAL.amber + '40',
    paddingBottom: Platform.OS === 'web' ? 20 : 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: DENSITY.modalPad, borderBottomWidth: GOLD_RAIL.sectionWidth, borderBottomColor: GOLD_RAIL.section,
  },


  modalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modalTitle: { ...TYPO.T2, color: TACTICAL.amber },
  fileNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: DENSITY.modalPad, paddingTop: 12, paddingBottom: 4 },
  fileName: { ...TYPO.K3, color: TACTICAL.text, fontSize: 11 },
  modalSectionTitle: { ...TYPO.T4, color: TACTICAL.amber, paddingHorizontal: DENSITY.modalPad, marginTop: 14 },
  modalSectionSub: { ...TYPO.B2, fontSize: 10, paddingHorizontal: DENSITY.modalPad, marginTop: 4, marginBottom: 12 },

  formGrid: { paddingHorizontal: DENSITY.modalPad, gap: 10 },
  formField: { gap: 4 },
  formLabel: { ...TYPO.T4, fontSize: 8, letterSpacing: 3 },
  formInput: {
    ...TYPO.B1, color: TACTICAL.text,
    backgroundColor: 'rgba(62,79,60,0.08)',
    borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10,
  },

  modalActions: { flexDirection: 'row', gap: 10, padding: DENSITY.modalPad, paddingTop: 16 },
  quickImportBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: TACTICAL.border,
  },
  quickImportBtnText: { ...TYPO.U2, color: TACTICAL.textMuted, fontSize: 9 },
  createRunBtn: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 13, borderRadius: 10, backgroundColor: TACTICAL.amber,
  },
  createRunBtnText: { ...TYPO.U1, color: '#0B0F12', letterSpacing: 3 },
  mapOverlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 109,
    pointerEvents: 'box-none',
  },

  topRightOverlay: {
  position: 'absolute',
  top: 14,
  right: 14,
  zIndex: 110,
},

  mapStylePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,14,18,0.94)',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 12,
  },

  mapStyleSegment: {
    minWidth: 58,
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  mapStyleSegmentActive: {
    backgroundColor: 'rgba(196,138,44,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255,220,140,0.35)',
  },

  mapStyleSegmentText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },

  mapStyleSegmentTextActive: {
    color: '#091014',
    fontWeight: '900',
  },

  bottomLeftOverlay: {
    position: 'absolute',
    left: 14,
    zIndex: 110,
  },

  intelPill: {
    height: 42,
    minWidth: 110,
    paddingHorizontal: 16,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(10,14,18,0.94)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.32,
    shadowRadius: 10,
    elevation: 12,
  },

  intelPillActive: {
    backgroundColor: 'rgba(196,138,44,0.95)',
    borderColor: 'rgba(255,220,140,0.35)',
  },

  intelPillText: {
  color: TACTICAL.text,
  fontSize: 11,
  fontWeight: '800',
  letterSpacing: 2.2,
  marginTop: 6,
},

  intelPillTextActive: {
    color: '#091014',
  },

  intelPanelPremium: {
    position: 'absolute',
    left: 14,
    width: 290,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(10,14,18,0.97)',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.24)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.36,
    shadowRadius: 14,
    elevation: 16,
    zIndex: 111,
  },

  bottomRouteOverlay: {
  position: 'absolute',
  left: 16,
  right: 16,
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 40,
  elevation: 40,
  pointerEvents: 'box-none',
},

  activeRouteBanner: {
  width: '100%',
  maxWidth: 520,
  minHeight: 58,
  borderRadius: 16,
  paddingHorizontal: 16,
  paddingVertical: 12,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  backgroundColor: 'rgba(10, 12, 15, 0.92)',
  borderWidth: 1,
  borderColor: 'rgba(255, 184, 0, 0.22)',
},

  activeRouteLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },

  activeRouteDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#68D391',
    marginRight: 10,
  },

  activeRouteTitle: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
  },

  activeRouteRight: {
    marginLeft: 10,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },

  activeRouteDistance: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },

  minimizeBtn: {
    position: 'absolute',
    right: 14,
    zIndex: 108,
  },

intelPanelHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
},

intelPanelHeaderLeft: {
  flexDirection: 'row',
  alignItems: 'center',
},

intelPanelHeaderBadge: {
  width: 30,
  height: 30,
  borderRadius: 9,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.30)',
  backgroundColor: 'rgba(196,138,44,0.08)',
  marginRight: 10,
},

intelPanelEyebrow: {
  color: TACTICAL.textMuted,
  fontSize: 8,
  fontWeight: '800',
  letterSpacing: 1.8,
  marginBottom: 2,
},

intelPanelPremiumTitle: {
  color: TACTICAL.amber,
  fontSize: 13,
  fontWeight: '900',
  letterSpacing: 1.5,
},

intelPanelClose: {
  width: 28,
  height: 28,
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.14)',
  backgroundColor: 'rgba(255,255,255,0.02)',
},

intelPanelDivider: {
  height: 1,
  backgroundColor: 'rgba(196,138,44,0.14)',
  marginTop: 10,
  marginBottom: 12,
},

intelPanelRowPremium: {
  flexDirection: 'row',
  gap: 10,
},

intelCard: {
  flex: 1,
  minHeight: 92,
  borderRadius: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.18)',
  backgroundColor: 'rgba(255,255,255,0.025)',
  padding: 10,
  justifyContent: 'space-between',
},

intelCardTop: {
  flexDirection: 'row',
  alignItems: 'center',
  marginBottom: 8,
},

intelCardIconWrap: {
  width: 28,
  height: 28,
  borderRadius: 8,
  alignItems: 'center',
  justifyContent: 'center',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.22)',
  backgroundColor: 'rgba(196,138,44,0.06)',
  marginRight: 8,
},

intelCardLabel: {
  color: TACTICAL.amber,
  fontSize: 10,
  fontWeight: '900',
  letterSpacing: 1.5,
},

intelCardTitle: {
  color: TACTICAL.text,
  fontSize: 12,
  fontWeight: '800',
  marginBottom: 4,
},

intelCardMeta: {
  color: TACTICAL.textMuted,
  fontSize: 10,
  fontWeight: '600',
  letterSpacing: 0.4,
},

mapStyleContainer: {
  position: 'absolute',
  right: 16,
  top: 140,
  flexDirection: 'column',
  alignItems: 'stretch',
  padding: 4,
  borderRadius: 16,
  backgroundColor: 'rgba(10,14,18,0.94)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.28)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.32,
  shadowRadius: 10,
  elevation: 12,
  zIndex: 110,
},

mapStyleButton: {
  minWidth: 60,
  height: 34,
  paddingHorizontal: 14,
  borderRadius: 10,
  alignItems: 'center',
  justifyContent: 'center',
},

mapStyleButtonActive: {
  backgroundColor: 'rgba(196,138,44,0.95)',
  borderColor: 'rgba(255,220,140,0.35)',
},

mapStyleButtonText: {
  color: TACTICAL.amber,
  fontSize: 11,
  fontWeight: '900',
  letterSpacing: 1.2,
},

mapStyleButtonTextActive: {
  color: '#091014',
},

intelBtn: {
  position: 'absolute',
  right: 14,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 7,
  paddingHorizontal: 14,
  paddingVertical: 9,
  borderRadius: 14,
  backgroundColor: 'rgba(10,14,18,0.92)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.24)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.28,
  shadowRadius: 10,
  elevation: 10,
  zIndex: 121,
},

intelBtnActive: {
  backgroundColor: 'rgba(196,138,44,0.96)',
  borderColor: 'rgba(255,220,140,0.35)',
},

intelText: {
  fontSize: 11,
  color: TACTICAL.amber,
  fontWeight: '900',
  letterSpacing: 1.2,
},

intelPanel: {
  position: 'absolute',
  left: 14,
  right: 14,
  backgroundColor: 'rgba(10,14,18,0.96)',
  borderRadius: 16,
  padding: 12,
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.22)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 6 },
  shadowOpacity: 0.32,
  shadowRadius: 12,
  elevation: 14,
  zIndex: 119,
},

intelPanelHeader: {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
},

intelPanelTitleWrap: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},

intelPanelTitle: {
  color: TACTICAL.amber,
  fontSize: 12,
  fontWeight: '900',
  letterSpacing: 1.3,
},

intelPanelSubtitle: {
  color: TACTICAL.textMuted,
  fontSize: 9,
  fontWeight: '700',
  letterSpacing: 1.0,
  marginTop: 2,
},

intelPanelGrid: {
  flexDirection: 'row',
  gap: 10,
},

intelCard: {
  flex: 1,
  minHeight: 84,
  borderRadius: 12,
  padding: 10,
  backgroundColor: 'rgba(255,255,255,0.025)',
  borderWidth: 1,
  borderColor: 'rgba(196,138,44,0.14)',
  justifyContent: 'space-between',
},

intelCardTop: {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 8,
},

intelCardLabel: {
  color: TACTICAL.amber,
  fontSize: 10,
  fontWeight: '900',
  letterSpacing: 1.2,
},

intelCardTitle: {
  color: TACTICAL.text,
  fontSize: 11,
  fontWeight: '800',
},

intelCardMeta: {
  color: TACTICAL.textMuted,
  fontSize: 9,
  fontWeight: '600',
  letterSpacing: 0.2,
},
});


