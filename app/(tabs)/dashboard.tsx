/**
 * Cockpit Dashboard — /dashboard
 *
 * Tactical, clean, infrastructure-focused dashboard with Expedition/Highway tabs.
 *
 * Features:
 * - Expedition / Highway tab toggle with smooth micro-animation
 * - Expedition default: 2x2 grid — Attitude Monitor (2x1 top) + Vehicle Systems + Remoteness (1x1 bottom row)
 * - Highway default: 2x2 grid — 4 equal awareness widgets (Forward Weather, Daylight, Cell Coverage, Wind)
 * - Fill-height 2x2 grid with no dead space

 * - Smart re-expand: only on verified sustained vehicle movement
 * - "Vehicle Movement Detected" banner on re-expand
 * - Accelerometer integration for stability + attitude widgets
 * - All widgets user-replaceable and reorderable
 * - Advanced Modeling toggle (exposes advanced widgets + enhanced data)
 * - Widget Governance: tab isolation, redundancy prevention, restore defaults
 * - Grid config hidden behind long-press Customize Mode
 * - Per-tab empty state with Customize CTA
 * - Theme-aware: uses palette from ThemeContext
 * - Adaptive brightness affects all widgets, text, icons, indicators
 * - Rotation / resize aware: useWindowDimensions listener re-measures
 *   container dimensions and recalculates widget placements automatically
 * - Expedition state integration: subscribes to expeditionStateStore,
 *   shows ExpeditionSummarySheet on completion, End Expedition in header
 * - Geofence monitor: auto-starts expedition on configurable radius exit
 *   (100m–2000m, default 400m), auto-ends on re-entry
 * - Phase 5: Context-aware auto-activation with 30s sustained conditions,
 *   geofence exit signal, route type signal, mode activation banners,
 *   CarPlay/Android Auto sync, manual override indicator
 */



import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Animated,
  Switch,
  Alert,
  Platform,
  LayoutChangeEvent,
  useWindowDimensions,
} from 'react-native';


import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';

import { TACTICAL, GOLD_RAIL } from '../../lib/theme';

import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';
import {
  dashboardStore,
  GRID_LAYOUT_CONFIG,
  EXPEDITION_TACTICAL_PRESET_ID,
  isExpeditionTacticalActive,
  WIDGET_SIZE_CONFIG,
  detectResizeCollision,
  getFullWidgetCatalog,
  getSlotSize,
  getPresetsForLayout,
  customPresetStore,
  type DashboardProfile,
  type WidgetSlot,
  type WidgetSize,
  type GridLayout,
  type DashboardMode,
  type ResizeCollisionInfo,
} from '../../lib/dashboardStore';




import { useAccelerometer } from '../../lib/useAccelerometer';
import DashboardHeader from '../../components/dashboard/DashboardHeader';
import WidgetGrid from '../../components/dashboard/WidgetGrid';
import WidgetLibrary from '../../components/dashboard/WidgetLibrary';
import WidgetDetailModal from '../../components/dashboard/WidgetDetailModal';
import CreateCustomWidgetModal from '../../components/dashboard/CreateCustomWidgetModal';
import GridLayoutPicker from '../../components/dashboard/GridLayoutPicker';
import AuthModal from '../../components/AuthModal';
import Toast from '../../components/Toast';
import CollisionWarningModal from '../../components/dashboard/CollisionWarningModal';
import LayoutPresetsModal from '../../components/dashboard/LayoutPresetsModal';
import ExpeditionTacticalView from '../../components/dashboard/ExpeditionTacticalView';
import ExpeditionControlPanel from '../../components/dashboard/ExpeditionControlPanel';
import DashboardManagerOverlay from '../../components/dashboard/DashboardManagerOverlay';
import ExpeditionSummarySheet from '../../components/expedition/ExpeditionSummarySheet';
import ExpeditionTimelinePanel from '../../components/expedition/ExpeditionTimelinePanel';
import WidgetLibraryManager from '../../components/dashboard/WidgetLibraryManager';
import ModeSwitchBanner from '../../components/dashboard/ModeSwitchBanner';
import ExpeditionIntelligenceBar from '../../components/dashboard/ExpeditionIntelligenceBar';
import ModeActivationBanner from '../../components/dashboard/ModeActivationBanner';
import AutoModeToggle from '../../components/dashboard/AutoModeToggle';
import OfflineStateBanner from '../../components/offline/OfflineStateBanner';


import { offlineExpeditionModeEngine } from '../../lib/offlineExpeditionModeEngine';
import { dashboardModeEngine, type ModeEngineOutput } from '../../lib/dashboardModeEngine';
import { tripRecorderEngine } from '../../lib/tripRecorderEngine';

import { routeStore } from '../../lib/routeStore';
import {
  advisoryStore,
  generateContextualMessages,
  type AdvisoryContext,
} from '../../lib/advisoryStore';
import {
  getTimeOfDay,
  estimateHoursUntilSunset,
  resetIntelligence,
} from '../../lib/assistantIntelligenceEngine';
import { remotenessStore } from '../../lib/remotenessStore';
import { gpsUIState } from '../../lib/gpsUIState';
import { connectivity } from '../../lib/connectivity';


import {
  expeditionStateStore,
  type ExpeditionState,
  type ExpeditionRecord,
} from '../../lib/expeditionStateStore';
import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleStore } from '../../lib/vehicleStore';
import { useGeofenceMonitor } from '../../lib/useGeofenceMonitor';
import ResourceAlertBanner from '../../components/ResourceAlertBanner';
import type { Vehicle } from '../../lib/types';
import { setupStore } from '../../lib/setupStore';






// ── Auto-collapse constants ────────────────────────────
const STATIONARY_THRESHOLD_MS = 20000; // 20 seconds
const MOTION_THRESHOLD_DEG = 0.5;      // near-zero movement threshold

// ── Smart re-expand constants ──────────────────────────
const SUSTAINED_MOTION_THRESHOLD_DEG = 2.5;
const SUSTAINED_MOTION_DURATION_MS = 3000;
const MOVEMENT_BANNER_DURATION_MS = 3000;

// ── Phase 9: Tab animation constants (refined timing) ──────
const TAB_ANIM_DURATION = 180; // Phase 9: reduced from 250ms for snappier feel

const TAB_SLIDE_PX = 6;       // Phase 9: reduced from 8px for subtler shift

// ── Mode Color Cues ────────────────────────────────────
// Expedition = ECS gold accent (existing palette.amber / #D4A017)
// Highway = muted navigation blue (complements ECS dark palette)
const HIGHWAY_BLUE = '#5B8DEF';

type DashboardTab = 'expedition' | 'highway';


function DashboardScreenInner() {

  const router = useRouter();
  const {
    activeTrip, loadItems, riskScore, waypoints, userSettings,
    syncStatus, refreshActiveTrip, user, showToast, isOnline,
  } = useApp();
  const { palette, isDriving, drivingOverrides } = useTheme();




  // ── Phase 8: Welcome Banner State ─────────────────────
  // Shows once after setup completion, then auto-dismisses after 4 seconds.
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const welcomeBannerAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (setupStore.shouldShowWelcomeBanner()) {
      setupStore.markWelcomeBannerShown();
      setShowWelcomeBanner(true);
      Animated.timing(welcomeBannerAnim, {
        toValue: 1, duration: 500, useNativeDriver: true,
      }).start();

      const timer = setTimeout(() => {
        Animated.timing(welcomeBannerAnim, {
          toValue: 0, duration: 500, useNativeDriver: true,
        }).start(() => setShowWelcomeBanner(false));
      }, 4000);

      return () => clearTimeout(timer);
    }
  }, []);



  // ── Tab State ─────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<DashboardTab>(
    dashboardStore.getLastSelectedTab()
  );

  // Map tab to profile: expedition → 'expedition', highway → 'vehicle'
  const getProfileForTab = (tab: DashboardTab): DashboardProfile =>
    tab === 'expedition' ? 'expedition' : 'vehicle';

  const activeProfile = getProfileForTab(activeTab);

  const [gridLayout, setGridLayout] = useState<GridLayout>(dashboardStore.getGridLayout(activeProfile));
  const [slots, setSlots] = useState<WidgetSlot[]>(dashboardStore.getProfileSlots(activeProfile));
  const [layoutMode, setLayoutMode] = useState(false);
  const [libraryVisible, setLibraryVisible] = useState(false);
  const [libraryTargetSlot, setLibraryTargetSlot] = useState<number>(0);
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailSlot, setDetailSlot] = useState<WidgetSlot | null>(null);
  const [authVisible, setAuthVisible] = useState(false);
  const [createWidgetVisible, setCreateWidgetVisible] = useState(false);
  const [libraryManagerVisible, setLibraryManagerVisible] = useState(false);
  const [dashboardManagerVisible, setDashboardManagerVisible] = useState(false);


  // ── Collision Detection State ─────────────────────────
  const [collisionModalVisible, setCollisionModalVisible] = useState(false);
  const [pendingCollision, setPendingCollision] = useState<ResizeCollisionInfo | null>(null);
  const [pendingResizeSlot, setPendingResizeSlot] = useState<number>(0);
  const [pendingResizeSize, setPendingResizeSize] = useState<WidgetSize>('1x1');
  const [pendingResizeWidgetName, setPendingResizeWidgetName] = useState('');

  // ── Layout Presets State ───────────────────────────────
  const [presetsModalVisible, setPresetsModalVisible] = useState(false);
  const [lastUsedPresetId, setLastUsedPresetId] = useState<string | undefined>(
    dashboardStore.getLastUsedPreset(getProfileForTab(dashboardStore.getLastSelectedTab()))
  );




  // ── Dashboard Mode ──────────────────────────────────
  const dashboardMode: DashboardMode = activeTab === 'expedition' ? 'expedition' : 'highway';
  const isHighwayPrecision = dashboardMode === 'highway' && gridLayout === '2x3';

  // ── Expedition Tactical Mode ──────────────────────────
  const isExpeditionTactical = lastUsedPresetId === EXPEDITION_TACTICAL_PRESET_ID && activeTab === 'expedition';


  // ── Auto-Collapse ─────────────────────────────────────
  const [autoCollapseEnabled, setAutoCollapseEnabled] = useState(dashboardStore.getAutoCollapseEnabled());
  const [isCompact, setIsCompact] = useState(false);
  const [showCollapseSettings, setShowCollapseSettings] = useState(false);

  // ── Advanced Mode ─────────────────────────────────────
  const [advancedModeEnabled, setAdvancedModeEnabled] = useState(dashboardStore.getAdvancedModeEnabled());
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(false);

  // ── Per-Widget Auto-Collapse ──────────────────────────
  const [perWidgetAutoCollapse, setPerWidgetAutoCollapse] = useState<Record<string, boolean>>({});

  // ── Auto-Collapse Motion Tracking Refs ─────────────────
  const lastMotionRef = useRef({ roll: 0, pitch: 0, time: Date.now() });
  const stationaryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isStationaryRef = useRef(false);
  const sustainedMotionStartRef = useRef<number | null>(null);


  // ── Context-Aware Dashboard Mode Engine ────────────────
  // Evaluates road type, speed, and remoteness to recommend
  // switching between Highway and Expedition modes.
  const [modeEngineState, setModeEngineState] = useState<ModeEngineOutput>(
    dashboardModeEngine.get()
  );

  // Subscribe to mode engine state changes
  useEffect(() => {
    const unsubscribe = dashboardModeEngine.subscribe(() => {
      setModeEngineState(dashboardModeEngine.get());
    });
    return unsubscribe;
  }, []);

  // Start/stop mode engine on mount/unmount
  // Start/stop mode engine + trip recorder on mount/unmount
  useEffect(() => {
    dashboardModeEngine.start();
    offlineExpeditionModeEngine.initialize();
    tripRecorderEngine.init();
    return () => {
      dashboardModeEngine.stop();
      offlineExpeditionModeEngine.stop();
      tripRecorderEngine.destroy();
    };
  }, []);



  // ── Context-Aware Mode Engine Handlers ─────────────────
  // These are defined here but reference handleTabSwitch via a ref
  // to avoid temporal dead zone issues with const declarations.
  const handleTabSwitchRef = useRef<(tab: DashboardTab) => void>(() => {});

  // Handle auto-mode switch: when engine switches, trigger tab animation
  const prevAutoModeRef = useRef<'highway' | 'expedition'>(modeEngineState.currentMode);
  useEffect(() => {
    const engineMode = modeEngineState.currentMode;
    if (engineMode !== prevAutoModeRef.current) {
      prevAutoModeRef.current = engineMode;
      if (modeEngineState.autoModeEnabled && !modeEngineState.switchRecommended) {
        const newTab: DashboardTab = engineMode;
        if (newTab !== activeTab) {
          handleTabSwitchRef.current(newTab);
        }
      }
    }
  }, [modeEngineState.currentMode, modeEngineState.autoModeEnabled, modeEngineState.switchRecommended, activeTab]);

  // Accept mode switch recommendation
  const handleAcceptModeSwitch = useCallback(() => {
    const recommended = modeEngineState.recommendedMode;
    dashboardModeEngine.acceptSwitch();
    if (recommended) {
      const newTab: DashboardTab = recommended;
      if (newTab !== activeTab) {
        handleTabSwitchRef.current(newTab);
      }
    }
  }, [modeEngineState.recommendedMode, activeTab]);

  // Dismiss mode switch recommendation
  const handleDismissModeSwitch = useCallback(() => {
    dashboardModeEngine.dismissSwitch();
  }, []);

  // Toggle auto mode
  const handleToggleAutoMode = useCallback(() => {
    const newEnabled = !modeEngineState.autoModeEnabled;
    dashboardModeEngine.setAutoMode(newEnabled);
    showToast(newEnabled ? 'Auto mode enabled' : 'Auto mode disabled');
  }, [modeEngineState.autoModeEnabled, showToast]);

  // Sync manual tab switches with mode engine (defined after handleTabSwitch)
  const handleTabSwitchWithModeSync = useCallback((newTab: DashboardTab) => {
    handleTabSwitchRef.current(newTab);
    dashboardModeEngine.setMode(newTab);
  }, []);




  // ── Expedition State Integration ────────────────────────

  // Subscribe to expeditionStateStore for real-time state changes.
  // When expedition ends (state → 'complete'), show ExpeditionSummarySheet.
  // GATING: Only show the modal once per expedition ID. Track the last
  // expedition ID that was acknowledged (dismissed) to prevent re-triggers
  // from duplicate _notify() calls or re-renders while state === 'complete'.
  const [showExpeditionSummary, setShowExpeditionSummary] = useState(false);
  const [completedExpeditionRecord, setCompletedExpeditionRecord] = useState<ExpeditionRecord | null>(null);

  // Track which expedition IDs have already been shown/acknowledged
  // to prevent duplicate modals from re-renders or multiple _notify() calls.
  const acknowledgedExpeditionIdsRef = useRef<Set<string>>(new Set());
  // Track the previous expedition state to detect transitions (not just current state)
  const prevExpStateRef = useRef<string>(expeditionStateStore.getState());
  // ── Modal State Guards ──────────────────────────────────
  // Prevents duplicate summary sheets from concurrent _notify() calls.
  const summaryShowingRef = useRef(false);
  // Cooldown after dismiss prevents immediate re-trigger from stale notifications.
  const summaryCooldownRef = useRef(false);
  const summaryCooldownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // isDismissing prevents double-dismiss from backdrop + button tap simultaneously.
  const summaryDismissingRef = useRef(false);

  useEffect(() => {
    const unsubscribe = expeditionStateStore.subscribe((state, record) => {
      const prevState = prevExpStateRef.current;
      prevExpStateRef.current = state;

      // Only trigger the modal on a TRANSITION into 'complete',
      // not on every notification where state happens to be 'complete'.
      if (state === 'complete' && record && prevState !== 'complete') {
        // Guard: Don't show if already showing, in cooldown, or already acknowledged
        if (summaryShowingRef.current) return;
        if (summaryCooldownRef.current) return;
        if (acknowledgedExpeditionIdsRef.current.has(record.id)) return;

        summaryShowingRef.current = true;
        summaryDismissingRef.current = false;
        setCompletedExpeditionRecord(record);
        setShowExpeditionSummary(true);
      }
    });
    return unsubscribe;
  }, []);

  // Cleanup cooldown timer on unmount
  useEffect(() => {
    return () => {
      if (summaryCooldownTimerRef.current) clearTimeout(summaryCooldownTimerRef.current);
    };
  }, []);

  // Called by DashboardHeader when user confirms "End Expedition"
  const handleExpeditionEnded = useCallback(() => {
    // The subscription above will handle showing the summary sheet
    // when the state transitions to 'complete'
  }, []);

  // Dismiss expedition summary sheet — marks this expedition as acknowledged
  // so it won't re-appear on subsequent renders or _notify() calls.
  const handleDismissExpeditionSummary = useCallback(() => {
    // Guard: prevent double-dismiss (backdrop tap + button tap simultaneously)
    if (summaryDismissingRef.current) return;
    summaryDismissingRef.current = true;

    // Mark this expedition ID as acknowledged BEFORE closing
    if (completedExpeditionRecord?.id) {
      acknowledgedExpeditionIdsRef.current.add(completedExpeditionRecord.id);
    }
    setShowExpeditionSummary(false);
    setCompletedExpeditionRecord(null);
    summaryShowingRef.current = false;
    expeditionStateStore.dismissExpedition();

    // Start cooldown to prevent immediate re-trigger from stale notifications
    summaryCooldownRef.current = true;
    if (summaryCooldownTimerRef.current) clearTimeout(summaryCooldownTimerRef.current);
    summaryCooldownTimerRef.current = setTimeout(() => {
      summaryCooldownRef.current = false;
      summaryCooldownTimerRef.current = null;
    }, 500);
  }, [completedExpeditionRecord]);




  // ── Geofence Monitor — Automatic Expedition Activation ──────
  // Monitors GPS position when expedition is in standby and an
  // active vehicle exists. Auto-starts expedition on configurable
  // geofence radius exit (100m–2000m, default 400m), auto-ends
  // on re-entry. Triggers haptic, toast, and gold underline
  // animation (via DashboardHeader subscription).

  // The geofence monitor is enabled when:
  //   1. expedition.state === 'standby' OR 'active'
  //   2. activeVehicleId exists
  //
  // Vehicle name is resolved from local vehicle store for the
  // expedition record. Falls back to 'Vehicle' if not found.


  const [geofenceVehicleId, setGeofenceVehicleId] = useState<string | null>(
    vehicleSetupStore.getActiveVehicleId()
  );
  const [geofenceVehicleName, setGeofenceVehicleName] = useState('Vehicle');


  // ── Active Vehicle Resource Data (for ResourceAlertBanner) ──
  const [activeVehicleData, setActiveVehicleData] = useState<Vehicle | null>(null);


  // Subscribe to vehicleSetupStore for activeVehicleId changes
  useEffect(() => {
    const unsubscribe = vehicleSetupStore.subscribe(() => {
      setGeofenceVehicleId(vehicleSetupStore.getActiveVehicleId());
    });
    return unsubscribe;
  }, []);

  // Resolve vehicle name + resource data when activeVehicleId changes
  useEffect(() => {
    if (!geofenceVehicleId) {
      setGeofenceVehicleName('Vehicle');
      setActiveVehicleData(null);
      return;
    }
    let cancelled = false;
    vehicleStore.getAll(user?.id || null).then(({ vehicles }) => {
      if (cancelled) return;
      const match = vehicles.find(v => v.id === geofenceVehicleId);
      if (match) {
        setGeofenceVehicleName(match.name || 'Vehicle');
        setActiveVehicleData(match);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [geofenceVehicleId, user?.id]);

  // Re-fetch vehicle resource data on screen focus (picks up water/fuel changes)
  useFocusEffect(useCallback(() => {
    if (!geofenceVehicleId) return;
    vehicleStore.getAll(user?.id || null).then(({ vehicles }) => {
      const match = vehicles.find(v => v.id === geofenceVehicleId);
      if (match) setActiveVehicleData(match);
    }).catch(() => {});
  }, [geofenceVehicleId, user?.id]));


  // Determine if geofence monitoring should be active
  const geofenceEnabled = useMemo(() => {
    if (!geofenceVehicleId) return false;
    const state = expeditionStateStore.getState();
    return state === 'standby' || state === 'active';
  }, [geofenceVehicleId]);


  // Geofence toast timer ref (for 2-second display)
  const geofenceToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup geofence toast timer
  useEffect(() => {
    return () => {
      if (geofenceToastTimerRef.current) clearTimeout(geofenceToastTimerRef.current);
    };
  }, []);

  // Geofence callbacks — show toast on auto-start/end
  const geofenceCallbacks = useMemo(() => ({
    onExpeditionStarted: () => {
      // Show 2-second toast: "Expedition started."
      showToast('Expedition started.');
    },
    onExpeditionEnded: () => {
      // Show 2-second toast: "Expedition ended."
      showToast('Expedition ended.');
      // The expeditionStateStore subscription above will handle
      // showing the ExpeditionSummarySheet when state → 'complete'
    },
  }), [showToast]);

  // ── Geofence Monitor Hook ─────────────────────────────────
  // Monitors GPS and auto-triggers expedition start/end based
  // on 400m geofence radius. Haptic feedback is handled inside
  // the hook. Gold underline animation is handled by DashboardHeader
  // subscription to expeditionStateStore.
  const geofenceMonitor = useGeofenceMonitor({
    enabled: geofenceEnabled,
    vehicleName: geofenceVehicleName,
    callbacks: geofenceCallbacks,
  });



  // ── Movement Detection Banner ─────────────────────────
  const [showMovementBanner, setShowMovementBanner] = useState(false);
  const movementBannerAnim = useRef(new Animated.Value(0)).current;
  const movementBannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Tab Animation ─────────────────────────────────────
  const tabSlideAnim = useRef(new Animated.Value(0)).current;
  const tabOpacityAnim = useRef(new Animated.Value(1)).current;
  const underlineAnim = useRef(new Animated.Value(activeTab === 'expedition' ? 0 : 1)).current;

  // ── Widget Container Dimensions ────────────────────────
  const [widgetContainerHeight, setWidgetContainerHeight] = useState(0);
  const [widgetContainerWidth, setWidgetContainerWidth] = useState(0);

  // ── Window Dimensions (reactive — updates on rotation / resize) ──
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const isLandscape = windowWidth > windowHeight;

  // Track previous window dimensions to detect rotation/resize
  const prevWindowDimsRef = useRef({ width: windowWidth, height: windowHeight });

  // ── Invalidate container measurements on rotation / resize ──
  // When window dimensions change significantly (rotation, split-screen,
  // external display), reset container measurements to 0 so the next
  // onLayout callback re-measures with correct values. This prevents
  // stale dimensions from producing mis-sized widget placements.
  useEffect(() => {
    const prev = prevWindowDimsRef.current;
    const widthChanged = Math.abs(prev.width - windowWidth) > 2;
    const heightChanged = Math.abs(prev.height - windowHeight) > 2;

    if (widthChanged || heightChanged) {
      // Invalidate stale container measurements — onLayout will re-fire
      // with the new layout dimensions after React re-renders the tree
      setWidgetContainerWidth(0);
      setWidgetContainerHeight(0);
      prevWindowDimsRef.current = { width: windowWidth, height: windowHeight };
    }
  }, [windowWidth, windowHeight]);

  // ── Adaptive dock padding ─────────────────────────────
  // In landscape the CommandDock bar is shorter (less bottom safe area),
  // so we can reduce the padding to give widgets more vertical space.
  // Portrait: 70px (standard dock + safe area)
  // Landscape: 50px (dock is more compact, less safe area needed)
  const dockPadding = useMemo(() => {
    if (Platform.OS === 'web') return 70; // Web doesn't rotate
    return isLandscape ? 50 : 70;
  }, [isLandscape]);

  // ── Accelerometer ─────────────────────────────────────
  const accel = useAccelerometer(true);

  // ── AI Assistant Intelligence Layer — Context Feeder ────
  // Periodically gathers comprehensive system state from all ECS
  // subsystems and feeds it to the Intelligence Engine via the
  // advisory store. The engine evaluates 9 systems (attitude,
  // fuel, water, power, remoteness, navigation, weather,
  // connectivity, expedition) and generates prioritized,
  // confidence-weighted advisory messages.
  //
  // Cadence: Initial feed after 3s, then every 15s.
  // This provides a calm, infrequent message cadence that
  // prevents information overload while surfacing critical data.
  useEffect(() => {
    /** Build comprehensive advisory context from all ECS subsystems */
    const buildAdvisoryContext = (): AdvisoryContext => {
      // ── Expedition State ──
      const expState = expeditionStateStore.getState();
      const expRecord = expeditionStateStore.getCurrentExpedition();

      // ── Remoteness Engine ──
      const remote = remotenessStore.get();

      // ── GPS / Navigation ──
      const gps = gpsUIState.get();
      const activeRoute = routeStore.getActive();

      // ── Connectivity ──
      const connDetail = connectivity.getDetailedState();

      // ── Vehicle Attitude ──
      const rollDeg = accel.isActive ? accel.rollDeg : undefined;
      const pitchDeg = accel.isActive ? accel.pitchDeg : undefined;

      // ── Time Context ──
      const timeOfDay = getTimeOfDay();
      const gpsLat = gps.hasFix && gps.position ? gps.position.latitude : null;
      const hoursUntilSunset = estimateHoursUntilSunset(gpsLat);

      // ── Build Context ──
      const ctx: AdvisoryContext = {
        // Expedition
        expeditionState: expState as any,
        expeditionElapsedSec: (expState === 'active' || expState === 'paused')
          ? expeditionStateStore.getElapsedSeconds()
          : undefined,
        expeditionDistanceM: expRecord?.distance ?? undefined,

        // Vehicle Attitude
        rollDeg,
        pitchDeg,
        sensorActive: accel.isActive,

        // Resources — from active vehicle data if available
        fuelPercent: activeVehicleData?.fuel_level ?? undefined,
        fuelConfigured: activeVehicleData?.fuel_level != null,
        waterPercent: activeVehicleData?.water_level ?? undefined,
        waterConfigured: activeVehicleData?.water_level != null,

        // Remoteness
        remotenessScore: remote.score,
        remotenessTier: remote.tier,
        connectivityState: remote.signals.connectivityState as any,

        // Navigation
        hasActiveRoute: activeRoute != null,
        routeTotalDistanceMi: activeRoute?.total_distance_miles ?? undefined,
        speedMph: gps.hasFix && gps.position ? gps.position.speedMph ?? undefined : undefined,
        altitudeFt: gps.hasFix && gps.position ? gps.position.altitudeFt ?? undefined : undefined,
        gpsFixQuality: gps.fixQuality,
        gpsStatus: gps.gpsStatus,

        // Connectivity
        isOnline: isOnline ?? connDetail.isOnline,
        internetReachable: connDetail.isInternetReachable,
        networkType: connDetail.networkType as any,
        latencyMs: connDetail.latencyMs,

        // Time
        timeOfDay,
        hoursUntilSunset,
      };

      return ctx;
    };

    // Initial feed after 3s delay (let dashboard settle)
    const initialTimer = setTimeout(() => {
      const ctx = buildAdvisoryContext();
      const messages = generateContextualMessages(ctx);
      advisoryStore.pushContextBatch(messages);
    }, 3000);

    // Periodic feed every 15s
    const interval = setInterval(() => {
      const ctx = buildAdvisoryContext();
      const messages = generateContextualMessages(ctx);
      advisoryStore.pushContextBatch(messages);
    }, 15000);

    return () => {
      clearTimeout(initialTimer);
      clearInterval(interval);
    };
  }, [isOnline, accel.isActive, activeVehicleData]);

  // Cleanup advisory store and intelligence engine on unmount
  useEffect(() => {
    return () => {
      advisoryStore.clear();
      resetIntelligence();
    };
  }, []);

  // ── Auto-collapse logic with smart re-expand ──────────

  useEffect(() => {
    if (!autoCollapseEnabled || !accel.isActive) {
      if (isCompact) setIsCompact(false);
      return;
    }

    const now = Date.now();
    const rollDelta = Math.abs(accel.rollDeg - lastMotionRef.current.roll);
    const pitchDelta = Math.abs(accel.pitchDeg - lastMotionRef.current.pitch);
    const isMoving = rollDelta > MOTION_THRESHOLD_DEG || pitchDelta > MOTION_THRESHOLD_DEG;
    const isSustainedMotion = rollDelta > SUSTAINED_MOTION_THRESHOLD_DEG || pitchDelta > SUSTAINED_MOTION_THRESHOLD_DEG;

    if (isMoving) {
      lastMotionRef.current = { roll: accel.rollDeg, pitch: accel.pitchDeg, time: now };

      if (stationaryTimerRef.current) {
        clearTimeout(stationaryTimerRef.current);
        stationaryTimerRef.current = null;
      }

      if (isStationaryRef.current && isCompact) {
        if (isSustainedMotion) {
          if (!sustainedMotionStartRef.current) {
            sustainedMotionStartRef.current = now;
          } else if (now - sustainedMotionStartRef.current >= SUSTAINED_MOTION_DURATION_MS) {
            isStationaryRef.current = false;
            sustainedMotionStartRef.current = null;
            setIsCompact(false);

            if (!drivingOverrides.disableAnimations) {
              setShowMovementBanner(true);
              Animated.timing(movementBannerAnim, {
                toValue: 1, duration: 400, useNativeDriver: true,
              }).start();

              if (movementBannerTimer.current) clearTimeout(movementBannerTimer.current);
              movementBannerTimer.current = setTimeout(() => {
                Animated.timing(movementBannerAnim, {
                  toValue: 0, duration: 400, useNativeDriver: true,
                }).start(() => setShowMovementBanner(false));
              }, MOVEMENT_BANNER_DURATION_MS);
            }
          }
        } else {
          sustainedMotionStartRef.current = null;
        }
      } else {
        isStationaryRef.current = false;
        sustainedMotionStartRef.current = null;
      }
    } else {
      sustainedMotionStartRef.current = null;

      if (!isStationaryRef.current && !stationaryTimerRef.current) {
        stationaryTimerRef.current = setTimeout(() => {
          isStationaryRef.current = true;
          setIsCompact(true);
          stationaryTimerRef.current = null;
        }, STATIONARY_THRESHOLD_MS);
      }
    }
  }, [accel.rollDeg, accel.pitchDeg, accel.isActive, autoCollapseEnabled, isCompact, drivingOverrides.disableAnimations]);

  // Cleanup timers
  useEffect(() => {
    return () => {
      if (stationaryTimerRef.current) clearTimeout(stationaryTimerRef.current);
      if (movementBannerTimer.current) clearTimeout(movementBannerTimer.current);
    };
  }, []);

  useFocusEffect(useCallback(() => {
    refreshActiveTrip();
    const profile = getProfileForTab(activeTab);
    const layout = dashboardStore.getGridLayout(profile);
    setGridLayout(layout);
    setSlots(dashboardStore.getProfileSlots(profile));
    setAutoCollapseEnabled(dashboardStore.getAutoCollapseEnabled());
    setAdvancedModeEnabled(dashboardStore.getAdvancedModeEnabled());
  }, [refreshActiveTrip, activeTab]));

  // ── Tab Switch Handler ────────────────────────────────
  const handleTabSwitch = useCallback((newTab: DashboardTab) => {
    if (newTab === activeTab) return;

    const slideDirection = newTab === 'highway' ? -TAB_SLIDE_PX : TAB_SLIDE_PX;

    // Exit layout mode on tab switch
    if (layoutMode) {
      setLayoutMode(false);
      setShowCollapseSettings(false);
      setShowAdvancedPanel(false);
    }

    // ── FIX: Separate native-driven and JS-driven animations ──
    // underlineAnim uses useNativeDriver: false (animates layout position/color).
    // tabOpacityAnim and tabSlideAnim use useNativeDriver: true (opacity/transform).
    // Mixing them in a single Animated.parallel can cause driver conflicts.
    // Run them independently instead.

    // JS-driven underline animation (runs independently)
    Animated.timing(underlineAnim, {
      toValue: newTab === 'expedition' ? 0 : 1,
      duration: TAB_ANIM_DURATION,
      useNativeDriver: false,
    }).start();

    // Native-driven content animations (animate out → switch → animate in)
    Animated.parallel([
      Animated.timing(tabOpacityAnim, {
        toValue: 0, duration: TAB_ANIM_DURATION / 2, useNativeDriver: true,
      }),
      Animated.timing(tabSlideAnim, {
        toValue: slideDirection, duration: TAB_ANIM_DURATION / 2, useNativeDriver: true,
      }),
    ]).start(() => {
      // Switch data
      setActiveTab(newTab);
      dashboardStore.setLastSelectedTab(newTab);
      const profile = getProfileForTab(newTab);
      setGridLayout(dashboardStore.getGridLayout(profile));
      setSlots(dashboardStore.getProfileSlots(profile));
      setLastUsedPresetId(dashboardStore.getLastUsedPreset(profile));

      // Reset slide position for entrance
      tabSlideAnim.setValue(-slideDirection);

      // Animate in (native-driven only)
      Animated.parallel([
        Animated.timing(tabOpacityAnim, {
          toValue: 1, duration: TAB_ANIM_DURATION / 2, useNativeDriver: true,
        }),
        Animated.timing(tabSlideAnim, {
          toValue: 0, duration: TAB_ANIM_DURATION / 2, useNativeDriver: true,
        }),
      ]).start();
    });

  }, [activeTab, layoutMode, tabOpacityAnim, tabSlideAnim, underlineAnim]);

  // ── Keep handleTabSwitchRef in sync ───────────────────
  // The ref is used by auto-mode engine and mode switch handlers
  // to call handleTabSwitch without temporal dead zone issues.
  useEffect(() => {
    handleTabSwitchRef.current = handleTabSwitch;
  }, [handleTabSwitch]);

  const widgetData = { activeTrip, loadItems, riskScore, waypoints, userSettings, syncStatus };



  const handleGridLayoutChange = useCallback((layout: GridLayout) => {
    dashboardStore.setGridLayout(activeProfile, layout);
    setGridLayout(layout);
    setSlots(dashboardStore.getProfileSlots(activeProfile));
  }, [activeProfile]);

  const handleWidgetAssign = useCallback((type: string) => {
    dashboardStore.assignWidget(activeProfile, libraryTargetSlot, type);
    setSlots(dashboardStore.getProfileSlots(activeProfile));
    setLibraryVisible(false);
  }, [activeProfile, libraryTargetSlot]);

  const handleCustomWidgetSaved = useCallback(() => {
    setCreateWidgetVisible(false);
    setSlots(dashboardStore.getProfileSlots(activeProfile));
  }, [activeProfile]);

  const handleWidgetRemove = useCallback((slotIndex: number) => {
    dashboardStore.removeWidget(activeProfile, slotIndex);
    const newSlots = dashboardStore.getProfileSlots(activeProfile);
    setSlots([...newSlots]); // Force new array reference for re-render
  }, [activeProfile]);

  const handleDetailRemove = useCallback(() => {
    if (detailSlot) {
      dashboardStore.removeWidget(activeProfile, detailSlot.slotIndex);
      setSlots([...dashboardStore.getProfileSlots(activeProfile)]);
      setDetailVisible(false);
      setDetailSlot(null);
    }
  }, [activeProfile, detailSlot]);

  const handleSwapSlots = useCallback((from: number, to: number) => {
    dashboardStore.swapSlots(activeProfile, from, to);
    setSlots(dashboardStore.getProfileSlots(activeProfile));
  }, [activeProfile]);

  // ── Resize Widget with Collision Detection ─────────────
  const handleResizeWidget = useCallback((slotIndex: number, newSize: WidgetSize) => {
    // Run collision detection before applying the resize
    const collision = detectResizeCollision(slots, gridLayout, slotIndex, newSize);

    if (collision.hasCollision) {
      // Collision detected — show warning modal
      const targetSlot = slots.find(s => s.slotIndex === slotIndex);
      const catalog = getFullWidgetCatalog();
      const widgetDef = catalog.find(w => w.type === targetSlot?.widgetType);
      const widgetName = widgetDef?.name || targetSlot?.widgetType || 'Widget';

      setPendingCollision(collision);
      setPendingResizeSlot(slotIndex);
      setPendingResizeSize(newSize);
      setPendingResizeWidgetName(widgetName);
      setCollisionModalVisible(true);
    } else {
      // No collision — apply resize immediately
      dashboardStore.setWidgetSize(activeProfile, slotIndex, newSize);
      setSlots([...dashboardStore.getProfileSlots(activeProfile)]);
    }
  }, [activeProfile, slots, gridLayout]);

  // ── Shrink Conflicting Widgets & Apply Resize ─────────
  const handleShrinkAndResize = useCallback(() => {
    if (!pendingCollision) return;

    // Step 1: Shrink all conflicting widgets to 1x1
    for (const conflict of pendingCollision.conflictingSlots) {
      dashboardStore.setWidgetSize(activeProfile, conflict.slotIndex, '1x1');
    }

    // Step 2: Apply the pending resize
    dashboardStore.setWidgetSize(activeProfile, pendingResizeSlot, pendingResizeSize);

    // Step 3: Refresh slots and close modal
    setSlots([...dashboardStore.getProfileSlots(activeProfile)]);
    setCollisionModalVisible(false);
    setPendingCollision(null);
  }, [activeProfile, pendingCollision, pendingResizeSlot, pendingResizeSize]);

  // ── Cancel Resize ─────────────────────────────────────
  const handleCancelResize = useCallback(() => {
    setCollisionModalVisible(false);
    setPendingCollision(null);
  }, []);

  // ── Apply Layout Preset (built-in) ─────────────────────
  const handleApplyPreset = useCallback((presetId: string) => {
    // Apply the preset to the store (changes grid layout + slot sizes + persists)
    const newLayout = dashboardStore.applyPreset(activeProfile, presetId);

    // Force-read the new grid layout from the store (always authoritative)
    const freshLayout = dashboardStore.getGridLayout(activeProfile);
    setGridLayout(freshLayout);

    // Force-read the new slots from the store (always authoritative)
    const freshSlots = dashboardStore.getProfileSlots(activeProfile);
    setSlots([...freshSlots]);

    // Update preset tracking
    setLastUsedPresetId(presetId);

    // Reset container measurements to force re-layout with new grid structure
    setWidgetContainerHeight(0);
    setWidgetContainerWidth(0);

    // Close the modal
    setPresetsModalVisible(false);
  }, [activeProfile]);


  // ── Apply Custom Preset (user-saved) ──────────────────
  const handleApplyCustomPreset = useCallback((preset: { gridLayout: string; slotSizes: any[]; id: string; name: string; icon: string; createdAt: number }) => {
    // Apply the custom preset using the store method that handles grid layout + sizes
    const newLayout = dashboardStore.applyCustomPreset(activeProfile, preset as any);

    // Force-read the new grid layout from the store
    const freshLayout = dashboardStore.getGridLayout(activeProfile);
    setGridLayout(freshLayout);

    // Force-read the new slots from the store
    const freshSlots = dashboardStore.getProfileSlots(activeProfile);
    setSlots([...freshSlots]);

    // Update preset tracking
    setLastUsedPresetId(preset.id);

    // Reset container measurements to force re-layout with new grid structure
    setWidgetContainerHeight(0);
    setWidgetContainerWidth(0);

    // Close the modal
    setPresetsModalVisible(false);
  }, [activeProfile]);





  const handleAutoCollapseToggle = useCallback((val: boolean) => {
    setAutoCollapseEnabled(val);
    dashboardStore.setAutoCollapseEnabled(val);
    if (!val && isCompact) setIsCompact(false);
  }, [isCompact]);

  const handleAdvancedModeToggle = useCallback((val: boolean) => {
    setAdvancedModeEnabled(val);
    dashboardStore.setAdvancedModeEnabled(val);
  }, []);

  const handleRestoreDefaults = useCallback(() => {
    Alert.alert(
      'Restore Default Layout?',
      'This will reset the dashboard to the default 2-widget stack (Vehicle Systems + Attitude Monitor).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: () => {
            dashboardStore.restoreDefaults(activeProfile);
            setGridLayout(dashboardStore.getGridLayout(activeProfile));
            setSlots(dashboardStore.getProfileSlots(activeProfile));
            setLayoutMode(false);
          },
        },
      ]
    );
  }, [activeProfile]);

  const handleExitLayoutMode = useCallback(() => {
    setLayoutMode(false);
    setShowCollapseSettings(false);
    setShowAdvancedPanel(false);
  }, []);

  const handleEnterCustomizeMode = useCallback(() => {
    setLayoutMode(true);
  }, []);

  const handleContainerLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (height > 0) setWidgetContainerHeight(height);
    if (width > 0) setWidgetContainerWidth(width);
  }, []);



  // Check if current tab is empty
  const allEmpty = slots.every(s => !s.widgetType);
  const assignedWidgets = slots.map(s => s.widgetType);

  // ── Widget lists for Library Manager ──────────────────
  const expeditionAssignedWidgets = useMemo(() =>
    dashboardStore.getProfileSlots('expedition').map(s => s.widgetType),
    [slots, activeTab]
  );
  const highwayAssignedWidgets = useMemo(() =>
    dashboardStore.getProfileSlots('vehicle').map(s => s.widgetType),
    [slots, activeTab]
  );

  // ── Library Manager Handlers ──────────────────────────
  const handleLibraryManagerWidgetAdded = useCallback((_profile: DashboardProfile, _widgetType: string) => {
    // Refresh slots for the active tab
    const profile = getProfileForTab(activeTab);
    setSlots([...dashboardStore.getProfileSlots(profile)]);
  }, [activeTab]);

  const handleLibraryManagerLayoutReset = useCallback((_profile: DashboardProfile) => {
    // Refresh slots and grid layout for the active tab
    const profile = getProfileForTab(activeTab);
    setGridLayout(dashboardStore.getGridLayout(profile));
    setSlots([...dashboardStore.getProfileSlots(profile)]);
  }, [activeTab]);

  // ── Underline interpolation ───────────────────────────
  const underlineLeft = underlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '50%'],
  });

  // ── Mode Color Cue: Animated underline color ──────────
  // Expedition (0) = ECS gold accent
  // Highway (1) = muted navigation blue
  // Smooth 250ms transition between colors when switching tabs
  const underlineColor = underlineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [palette.amber, HIGHWAY_BLUE],
  });

  // ── Mode Color Cue: Active tab accent color (non-animated) ──
  const expeditionAccent = palette.amber;
  const highwayAccent = HIGHWAY_BLUE;



  return (
    <View style={[styles.container, { backgroundColor: palette.bg, paddingBottom: dockPadding }]}>

      <DashboardHeader
        layoutMode={layoutMode}
        onDone={handleExitLayoutMode}
        onAuthPress={() => setAuthVisible(true)}
        onExpeditionEnded={handleExpeditionEnded}
      />

      {/* ── Expedition Intelligence Bar ────────────────────────────
           Fixed-height tactical intelligence strip. Surfaces short,
           high-value expedition advisories with fade-in/fade-out animation.
           Three modes: Alert, Advisory, Standby.
           Always reserves the same height to prevent layout shift. ── */}
      <ExpeditionIntelligenceBar />

      {/* ── Offline State Banner ─────────────────────────────────
           Calm, professional banner that shows connectivity state.
           Only visible when not fully online. Smooth slide animation. ── */}
      <OfflineStateBanner expanded />




      {/* ── Expedition / Highway Dog Ear Tab Toggle ── */}
      {/* Layout: [EXPEDITION] [HIGHWAY]  ...space...  [AUTO] [+] */}
      <View style={[styles.tabBar, { borderBottomColor: GOLD_RAIL.section }]}>

        {/* ── Tab Labels Section (left, flex fill) ── */}
        <View style={styles.tabsSection}>
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => handleTabSwitchWithModeSync('expedition')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
          >
            <Text style={[
              styles.tabLabel,
              { color: activeTab === 'expedition' ? expeditionAccent : palette.textMuted },
            ]}>
              EXPEDITION
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.tabBtn}
            onPress={() => handleTabSwitchWithModeSync('highway')}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 8, right: 8 }}
          >
            <Text style={[
              styles.tabLabel,
              { color: activeTab === 'highway' ? highwayAccent : palette.textMuted },
            ]}>
              HIGHWAY
            </Text>
          </TouchableOpacity>

          {/* Animated underline indicator — color transitions between
               gold (Expedition) and blue (Highway) over 250ms */}
          <Animated.View style={[
            styles.tabUnderline,
            {
              left: underlineLeft,
              backgroundColor: underlineColor,
            },
          ]} />
        </View>


        {/* ── Right Controls Section (auto-width) ── */}
        <View style={styles.tabControlsSection}>
          <AutoModeToggle
            enabled={modeEngineState.autoModeEnabled}
            inCooldown={modeEngineState.inCooldown}
            isManualOverride={modeEngineState.isManualOverride}
            isSustaining={modeEngineState.sustainedCondition?.isSustaining ?? false}
            onToggle={handleToggleAutoMode}
          />

          <TouchableOpacity
            style={styles.libraryManagerBtn}
            onPress={() => setLibraryManagerVisible(true)}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
          >
            <Ionicons name="add-circle-outline" size={18} color={palette.amber} />
          </TouchableOpacity>
        </View>
      </View>


      {/* ── Context-Aware Mode Switch Banner ──────────────────
           Shows when the mode engine recommends switching between
           Highway and Expedition based on road type, speed, and
           remoteness. Auto-switches after 5s countdown. ── */}
      <ModeSwitchBanner
        visible={modeEngineState.switchRecommended}
        recommendedMode={modeEngineState.recommendedMode}
        reason={modeEngineState.recommendationReason}
        countdown={modeEngineState.bannerCountdown}
        onAccept={handleAcceptModeSwitch}
        onDismiss={handleDismissModeSwitch}
      />



      {/* ── Customize Mode Controls (only visible in layout mode) ── */}
      {layoutMode && (
        <View style={[styles.customizeBar, { backgroundColor: palette.panel, borderBottomColor: GOLD_RAIL.section }]}>

          {/* Grid Layout Picker */}
          <GridLayoutPicker
            currentLayout={gridLayout}
            onSelect={handleGridLayoutChange}
            disabled={false}
          />

          {/* Presets button */}
          <TouchableOpacity
            style={[styles.presetsBtn, { backgroundColor: palette.panel, borderColor: lastUsedPresetId ? (palette.amber + '40') : palette.border }]}
            onPress={() => setPresetsModalVisible(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="copy-outline" size={12} color={lastUsedPresetId ? palette.amber : palette.textMuted} />
            <Text style={[styles.presetsBtnText, { color: lastUsedPresetId ? palette.amber : palette.textMuted }]}>Presets</Text>
          </TouchableOpacity>

          {/* Advanced Mode toggle */}
          <TouchableOpacity
            style={[styles.advToggle, { backgroundColor: palette.panel, borderColor: advancedModeEnabled ? 'rgba(156,136,255,0.25)' : palette.border }]}
            onPress={() => setShowAdvancedPanel(!showAdvancedPanel)}
            activeOpacity={0.7}
          >
            <Ionicons
              name="flask-outline"
              size={12}
              color={advancedModeEnabled ? '#9C88FF' : palette.textMuted}
            />
          </TouchableOpacity>

          {/* Auto-collapse toggle */}
          <TouchableOpacity
            style={[styles.collapseToggle, { backgroundColor: palette.panel, borderColor: palette.border }]}
            onPress={() => setShowCollapseSettings(!showCollapseSettings)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={isCompact ? 'contract-outline' : 'expand-outline'}
              size={12}
              color={isCompact ? palette.amber : palette.textMuted}
            />
          </TouchableOpacity>

          {/* Restore defaults */}
          <TouchableOpacity
            style={[styles.restoreToggle, { backgroundColor: palette.panel, borderColor: palette.border }]}
            onPress={handleRestoreDefaults}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={12} color={palette.textMuted} />
          </TouchableOpacity>
        </View>
      )}



      {/* Advanced Mode settings panel */}
      {showAdvancedPanel && (
        <View style={[styles.advPanel, { backgroundColor: 'rgba(156,136,255,0.04)', borderColor: 'rgba(156,136,255,0.15)' }]}>
          <View style={styles.advPanelRow}>
            <Ionicons name="flask-outline" size={14} color="#9C88FF" />
            <Text style={[styles.advPanelLabel, { color: palette.text }]}>Advanced Modeling</Text>
            <Switch
              value={advancedModeEnabled}
              onValueChange={handleAdvancedModeToggle}
              trackColor={{ false: 'rgba(255,255,255,0.08)', true: 'rgba(156,136,255,0.3)' }}
              thumbColor={advancedModeEnabled ? '#9C88FF' : palette.textMuted}
              style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
            />
          </View>
          <Text style={[styles.advPanelHint, { color: palette.textMuted }]}>
            {advancedModeEnabled
              ? 'Advanced widgets visible. Dynamic thresholds active. CG modeling enabled.'
              : 'Enable to access Mission Sustainment, CG Visualization, and dynamic stability thresholds.'}
          </Text>
          {advancedModeEnabled && (
            <View style={styles.advBadgeRow}>
              <View style={styles.advBadge}><Text style={styles.advBadgeText}>DYNAMIC THRESHOLDS</Text></View>
              <View style={styles.advBadge}><Text style={styles.advBadgeText}>CG MODEL</Text></View>
              <View style={styles.advBadge}><Text style={styles.advBadgeText}>SUSTAINMENT</Text></View>
            </View>
          )}
        </View>
      )}

      {/* Auto-collapse settings dropdown */}
      {showCollapseSettings && (
        <View style={[styles.collapseSettings, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <View style={styles.collapseRow}>
            <Ionicons name="pause-circle-outline" size={14} color={palette.textMuted} />
            <Text style={[styles.collapseLabel, { color: palette.text }]}>Auto-collapse when stopped</Text>
            <Switch
              value={autoCollapseEnabled}
              onValueChange={handleAutoCollapseToggle}
              trackColor={{ false: 'rgba(255,255,255,0.08)', true: palette.amber + '30' }}
              thumbColor={autoCollapseEnabled ? palette.amber : palette.textMuted}
              style={{ transform: [{ scaleX: 0.7 }, { scaleY: 0.7 }] }}
            />
          </View>
          <Text style={[styles.collapseHint, { color: palette.textMuted }]}>
            Widgets collapse after 20s stationary. Re-expands only on sustained vehicle movement ({'\u2265'}3s).
          </Text>
          {isCompact && (
            <TouchableOpacity
              style={[styles.expandBtn, { backgroundColor: palette.amber + '12', borderColor: palette.amber + '30' }]}
              onPress={() => { setIsCompact(false); isStationaryRef.current = false; }}
              activeOpacity={0.7}
            >
              <Ionicons name="expand-outline" size={12} color={palette.amber} />
              <Text style={[styles.expandBtnText, { color: palette.amber }]}>EXPAND NOW</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* ── Vehicle Movement Detected Banner ── */}
      {showMovementBanner && (
        <Animated.View style={[styles.movementBanner, { opacity: movementBannerAnim }]}>
          <View style={styles.movementBannerDot} />
          <Text style={styles.movementBannerText}>Vehicle Movement Detected</Text>
        </Animated.View>
      )}

      {/* Compact mode indicator */}
      {isCompact && !showCollapseSettings && (
        <TouchableOpacity
          style={[styles.compactIndicator, { backgroundColor: palette.amber + '08' }]}
          onPress={() => { setIsCompact(false); isStationaryRef.current = false; }}
          activeOpacity={0.7}
        >
          <Ionicons name="contract-outline" size={10} color={palette.amber} />
          <Text style={[styles.compactIndicatorText, { color: palette.amber }]}>COMPACT MODE {'\u2014'} TAP TO EXPAND</Text>
        </TouchableOpacity>
      )}

      {/* ── Customize Mode Dim Overlay ── */}
      {layoutMode && (
        <View style={styles.customizeDimOverlay} pointerEvents="none" />
      )}

      {/* ── Widget Container (wrapped in Pressable for long-press → Dashboard Manager) ── */}
      <Pressable
        style={{ flex: 1 }}
        onLongPress={() => { if (!layoutMode) setDashboardManagerVisible(true); }}
        delayLongPress={500}
      >
      <Animated.View

        style={[
          styles.gridContainer,
          isHighwayPrecision && styles.gridContainerHighway,
          isExpeditionTactical && styles.gridContainerTactical,
          {
            opacity: tabOpacityAnim,
            transform: [{ translateX: tabSlideAnim }],
          },
        ]}
      >
        {/* ── Expedition Tactical Preset (full takeover) ── */}
        {isExpeditionTactical && !layoutMode ? (
          <ExpeditionTacticalView
            accel={accel}
            advancedModeEnabled={advancedModeEnabled}
          />

        ) : allEmpty && !layoutMode ? (
          /* ── Empty State (per tab) ── */
          <View style={styles.emptyStateContainer}>
            <View style={[styles.emptyStateCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
              <Ionicons name="grid-outline" size={32} color={palette.textMuted} />
              <Text style={[styles.emptyStateTitle, { color: palette.text }]}>No widgets active</Text>
              <Text style={[styles.emptyStateSubtext, { color: palette.textMuted }]}>
                Long press any widget to customize,{'\n'}or tap Customize to add widgets.
              </Text>
              <TouchableOpacity
                style={[styles.emptyStateBtn, { backgroundColor: palette.amber + '12', borderColor: palette.amber + '30' }]}
                onPress={handleEnterCustomizeMode}
                activeOpacity={0.7}
              >
                <Ionicons name="settings-outline" size={14} color={palette.amber} />
                <Text style={[styles.emptyStateBtnText, { color: palette.amber }]}>CUSTOMIZE</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <>
            {/* Measuring wrapper — gives WidgetGrid its actual available height */}
            <View style={styles.widgetMeasureWrapper} onLayout={handleContainerLayout}>
              <WidgetGrid
                slots={slots}
                profile={activeProfile}
                gridLayout={gridLayout}
                layoutMode={layoutMode}
                onEnterLayoutMode={() => setLayoutMode(true)}
                onExitLayoutMode={handleExitLayoutMode}
                onEmptySlotPress={(i) => { setLibraryTargetSlot(i); setLibraryVisible(true); }}
                onWidgetPress={(slot) => { if (!layoutMode) { if (slot.widgetType === 'vehicle-twin') { router.push('/vehicle-twin'); } else { setDetailSlot(slot); setDetailVisible(true); } } }}



                onRemoveWidget={handleWidgetRemove}
                onSwapSlots={handleSwapSlots}
                onResizeWidget={handleResizeWidget}
                onRestoreDefaults={handleRestoreDefaults}
                widgetData={widgetData}
                dashboardMode={dashboardMode}
                isCompact={isCompact}
                rollDeg={accel.rollDeg}
                pitchDeg={accel.pitchDeg}
                sensorStatus={accel.sensorStatus}
                advancedModeEnabled={advancedModeEnabled}
                perWidgetAutoCollapse={perWidgetAutoCollapse}
                containerHeight={widgetContainerHeight}
                containerWidth={widgetContainerWidth}
              />
            </View>

            {layoutMode && !isHighwayPrecision && !isExpeditionTactical && (
              <View style={[styles.layoutHint, { backgroundColor: palette.amber + '0C', borderColor: palette.amber + '30' }]}>
                <Ionicons name="resize-outline" size={14} color={palette.amber} />
                <Text style={[styles.layoutHintText, { color: palette.amber }]}>Drag to reorder. Tap size badge to resize. Tap X to remove.</Text>
              </View>
            )}
            {!layoutMode && !isCompact && !isHighwayPrecision && !isExpeditionTactical && (
              <View style={styles.profileFooter}>
                <Text style={[styles.footerText, { color: palette.textMuted + '30' }]}>Long press to open Dashboard Manager</Text>
              </View>

            )}

          </>
        )}
      </Animated.View>
      </Pressable>


      {/* ── Phase 9: Gold Structural Separator ──────────────────
           Thin gold line between widget area and CommandDock space.
           Creates a continuous gold structural thread:
             Attitude Monitor gold border → separator → CommandDock gold rail
           Positioned at the bottom edge of the content area. ── */}
      <View style={styles.goldDockSeparator} pointerEvents="none" />



      <WidgetLibrary
        visible={libraryVisible}
        assignedWidgets={assignedWidgets}
        onSelect={handleWidgetAssign}
        onClose={() => setLibraryVisible(false)}
        onCreateCustom={() => { setLibraryVisible(false); setCreateWidgetVisible(true); }}
        advancedModeEnabled={advancedModeEnabled}
      />
      <CreateCustomWidgetModal visible={createWidgetVisible} onSave={handleCustomWidgetSaved} onClose={() => setCreateWidgetVisible(false)} />
      <WidgetDetailModal
        visible={detailVisible}
        slot={detailSlot}
        widgetData={widgetData}
        renderOptions={{
          dashboardMode,
          rollDeg: accel.rollDeg,
          pitchDeg: accel.pitchDeg,
          sensorStatus: accel.sensorStatus,
          advancedMode: advancedModeEnabled,
        }}
        onClose={() => { setDetailVisible(false); setDetailSlot(null); }}
        onRemove={handleDetailRemove}
      />
      <AuthModal visible={authVisible} onClose={() => setAuthVisible(false)} />
      <CollisionWarningModal
        visible={collisionModalVisible}
        collision={pendingCollision}
        targetWidgetName={pendingResizeWidgetName}
        targetNewSize={pendingResizeSize}
        onShrinkAndResize={handleShrinkAndResize}
        onCancel={handleCancelResize}
      />
      <LayoutPresetsModal
        visible={presetsModalVisible}
        gridLayout={gridLayout}
        lastUsedPresetId={lastUsedPresetId}
        currentSlots={slots}
        activeProfile={activeProfile}
        onSelectPreset={handleApplyPreset}
        onSelectCustomPreset={handleApplyCustomPreset}
        onClose={() => setPresetsModalVisible(false)}
      />

      <Toast />

      {/* ── Expedition Summary Sheet ──────────────────────────
           Shown when expedition.state transitions to 'complete'.
           Triggered by DashboardHeader "End Expedition" or auto
           geofence re-entry. Displays duration, distance, fuel/water
           deltas, peak remoteness. Dismiss returns to standby. ── */}
      <ExpeditionSummarySheet
        visible={showExpeditionSummary}
        record={completedExpeditionRecord}
        onDismiss={handleDismissExpeditionSummary}
      />

      {/* ── Widget Library Manager ──────────────────────────────
           Centralized widget management panel for both Highway
           and Expedition modes. Opened via "+" button in tab bar. ── */}
      <WidgetLibraryManager
        visible={libraryManagerVisible}
        onClose={() => setLibraryManagerVisible(false)}
        activeTab={activeTab}
        expeditionWidgets={expeditionAssignedWidgets}
        highwayWidgets={highwayAssignedWidgets}
        onWidgetAdded={handleLibraryManagerWidgetAdded}
        onLayoutReset={handleLibraryManagerLayoutReset}
        advancedModeEnabled={advancedModeEnabled}
      />

      {/* ── Dashboard Manager Overlay ──────────────────────────
           Full-screen overlay opened by long-pressing the dashboard
           widget area. Contains Expedition Control, Widget Management,
           and Dashboard Preferences. ── */}
      <DashboardManagerOverlay
        visible={dashboardManagerVisible}
        onClose={() => setDashboardManagerVisible(false)}
        onExpeditionStarted={() => { showToast('Expedition started'); }}
        onExpeditionEnded={handleExpeditionEnded}
        onOpenWidgetLibrary={() => setLibraryManagerVisible(true)}
        onRestoreDefaults={handleRestoreDefaults}
        onOpenPresets={() => setPresetsModalVisible(true)}
        activeTab={activeTab}
      />



    </View>
  );
}





// ── Exported with Error Boundary ────────────────────────
export default function DashboardScreen() {
  return (
    <TabErrorBoundary tabName="DASHBOARD">
      <DashboardScreenInner />
    </TabErrorBoundary>
  );
}

const styles = StyleSheet.create({

  container: { flex: 1, paddingBottom: 70, overflow: 'visible' },


  // ── Tab Bar ────────────────────────────────────────────
  // Structured as: [Tabs Section (flex)] | [Controls Section (auto)]
  // This prevents the AUTO toggle from overlapping tab labels.
  tabBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    height: 40,
    paddingHorizontal: 4,
  },

  // ── Tabs Section — holds EXPEDITION + HIGHWAY labels + underline ──
  tabsSection: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    position: 'relative',
  },

  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 8,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 3,
  },

  // ── Underline — positioned absolutely within tabsSection ──
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    width: '50%',
    height: 2,
  },

  // ── Controls Section — AUTO toggle + "+" button, right-aligned ──
  tabControlsSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 8,
    paddingRight: 4,
    height: '100%',
  },

  // ── Widget Library Manager "+" Button (inside controls section) ──
  libraryManagerBtn: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 32,
    height: 32,
  },


  // ── Customize Mode Bar (layout mode only) ──────────
  customizeBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
    alignItems: 'center',
  },

  // gridContainer: full-width, flex fill, no width constraints
  // that could cause child grids to left-lock
  gridContainer: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    paddingTop: 8,
  },
  gridContainerHighway: {
    paddingTop: 0,
    overflow: 'hidden',
  },
  gridContainerTactical: {
    paddingTop: 0,
    overflow: 'hidden',
  },


  // ── Widget Measure Wrapper ─────────────────────────
  // Wraps WidgetGrid to provide accurate height measurement
  // that excludes gridContainer padding and sibling elements
  // (layout hint, profile footer). This ensures fill-height
  // layouts (1x2, 1x1, 2x1) compute correct widget heights.
  widgetMeasureWrapper: {
    flex: 1,
    width: '100%',
    overflow: 'visible',
  },



  layoutHint: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginTop: 12, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  layoutHintText: { fontSize: 11, fontWeight: '600', flex: 1, lineHeight: 16 },
  profileFooter: { alignItems: 'center', marginTop: 16, paddingHorizontal: 16 },
  footerText: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },

  // ── Customize Mode Dim Overlay ─────────────────────
  customizeDimOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.15)',
    zIndex: -1,
  },

  // ── Advanced Mode toggle ───────────────────────────
  advToggle: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Advanced Mode panel ────────────────────────────
  advPanel: {
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  advPanelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  advPanelLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  advPanelHint: {
    fontSize: 9,
    marginTop: 4,
    lineHeight: 13,
  },
  advBadgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    flexWrap: 'wrap',
  },
  advBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(156,136,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(156,136,255,0.2)',
  },
  advBadgeText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#9C88FF',
    letterSpacing: 1,
  },

  collapseToggle: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  restoreToggle: {
    width: 28,
    height: 28,
    borderRadius: 7,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Presets Button ─────────────────────────────────
  presetsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 7,
    borderWidth: 1,
  },
  presetsBtnText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },


  // ── Auto-collapse settings ─────────────────────────
  collapseSettings: {
    marginHorizontal: 12,
    marginBottom: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  collapseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  collapseLabel: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
  },
  collapseHint: {
    fontSize: 9,
    marginTop: 4,
    lineHeight: 13,
  },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
  },
  expandBtnText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 1,
  },

  // ── Vehicle Movement Detected Banner ───────────────
  movementBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 12,
    marginBottom: 4,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(76,175,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.2)',
  },
  movementBannerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  movementBannerText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#4CAF50',
    letterSpacing: 1,
  },

  // ── Compact mode indicator ─────────────────────────
  compactIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginHorizontal: 12,
    marginBottom: 2,
    paddingVertical: 3,
    borderRadius: 4,
  },
  compactIndicatorText: {
    fontSize: 7,
    fontWeight: '800',
    letterSpacing: 1.5,
  },

  // ── Empty State ────────────────────────────────────
  emptyStateContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyStateCard: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 28,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    width: '100%',
    maxWidth: 320,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 2,
    marginTop: 4,
  },
  emptyStateSubtext: {
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    fontWeight: '500',
  },
  emptyStateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 6,
  },
  emptyStateBtnText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
  },


  // ── Phase 9: Gold Structural Separator ─────────────
  // Thin gold line between widget area and CommandDock space.
  // Creates a continuous gold structural thread:
  //   Attitude Monitor gold border → separator → CommandDock gold rail
  // Uses GOLD_RAIL.section opacity (35%) at 0.75px — lighter than
  // the major 1.5px rails on header/dock edges, establishing
  // the structural hierarchy: major > section > subsection.
  goldDockSeparator: {
    height: 0.75,
    backgroundColor: 'rgba(160,129,58,0.35)',
    marginHorizontal: 0,
  },
});





