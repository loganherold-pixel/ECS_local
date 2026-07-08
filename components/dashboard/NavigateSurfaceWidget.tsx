import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import MapRenderer from '../navigate/MapRenderer';
import type { CameraCommand, CameraMode } from '../navigate/MapRenderer';
import { TACTICAL } from '../../lib/theme';
import { getMapboxToken, getMapboxTokenSync, type MapStyleKey } from '../../lib/mapConfig';
import { createPersistedKeyValueCache } from '../../lib/keyValuePersistence';
import {
  navigateRouteSessionStore,
  type NavigateRouteSessionSnapshot,
} from '../../lib/navigateRouteSessionStore';
import {
  resolveDashboardNavigationChaseCamera,
  resolveStableDashboardGpsCameraSnapshot,
  type DashboardGpsCameraSnapshot,
  type DashboardNavigationPoint,
} from '../../lib/dashboardNavigationChaseCamera';
import { resolveActiveGuidanceDisplayLocation } from '../../lib/activeGuidanceProgressPath';
import { resolveMapSurfaceMotionState, type MapMotionPriority } from '../../lib/mapSurfaceCoordinator';
import type { WidgetData, WidgetRenderOptions } from './WidgetRenderers';

type Props = {
  data: WidgetData;
  options?: WidgetRenderOptions;
};

const ACTIVE_ROUTE_WIDGET_ZOOM = 16.4;
const COMMAND_3D_FOLLOW_ZOOM = 16.7;
const COMMAND_3D_FREE_DRIVE_ZOOM = 16.2;
const COMMAND_3D_FOLLOW_PITCH = 70;
const COMMAND_3D_ACTIVE_FOLLOW_OFFSET: [number, number] = [0, 72];
const COMMAND_3D_FREE_DRIVE_OFFSET: [number, number] = [0, 56];
const COMMAND_3D_MAP_VIEW_STORAGE_KEY = 'ecs_dashboard_command_3d_map_view';

type RouteRenderMode = 'idle' | 'preview' | 'active' | 'completed' | 'selected';
type NextTurnStripTone = 'active' | 'warning';
type IconName = React.ComponentProps<typeof Ionicons>['name'];
type Command3DMapViewKey = 'tactical' | 'day' | 'satellite';

const COMMAND_3D_MAP_VIEWS: {
  key: Command3DMapViewKey;
  label: string;
  accessibilityLabel: string;
  mapStyle: MapStyleKey;
  icon: IconName;
}[] = [
  {
    key: 'tactical',
    label: 'TAC',
    accessibilityLabel: 'Tactical dark 3D follow map',
    mapStyle: 'tactical',
    icon: 'moon-outline',
  },
  {
    key: 'day',
    label: 'DAY',
    accessibilityLabel: 'Daytime 3D follow map',
    mapStyle: 'ecs',
    icon: 'sunny-outline',
  },
  {
    key: 'satellite',
    label: 'SAT',
    accessibilityLabel: 'Satellite 3D follow map',
    mapStyle: 'satellite',
    icon: 'earth-outline',
  },
];
const DEFAULT_COMMAND_3D_MAP_VIEW: Command3DMapViewKey = 'satellite';
const command3DMapViewPreference = createPersistedKeyValueCache('ecs_dashboard_map_preferences');

function isCommand3DMapViewKey(value: string | null | undefined): value is Command3DMapViewKey {
  return value === 'tactical' || value === 'day' || value === 'satellite';
}

function readPersistedCommand3DMapView(): Command3DMapViewKey {
  const stored = command3DMapViewPreference.get(COMMAND_3D_MAP_VIEW_STORAGE_KEY);
  return isCommand3DMapViewKey(stored) ? stored : DEFAULT_COMMAND_3D_MAP_VIEW;
}

function formatRemainingDistance(meters: number | null): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  const miles = meters / 1609.344;
  if (miles >= 10) return `${Math.round(miles)} mi`;
  if (miles >= 1) return `${miles.toFixed(1)} mi`;
  return `${Math.max(0.1, miles).toFixed(1)} mi`;
}

function formatTurnDistance(meters: number | null | undefined): string | null {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1609.344) {
    const feet = Math.max(0, meters * 3.28084);
    const increment = feet < 500 ? 25 : 100;
    return `${Math.max(increment, Math.round(feet / increment) * increment)} ft`;
  }
  const miles = meters / 1609.344;
  return miles >= 10 ? `${Math.round(miles)} mi` : `${miles.toFixed(1)} mi`;
}

function formatRemainingDuration(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds)) return null;
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatEta(etaIso: string | null): string | null {
  if (!etaIso) return null;
  const parsed = new Date(etaIso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function normalizeBearingDeg(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const wrapped = value % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

function quantizeCoordinate(value: number): number {
  return Number(value.toFixed(5));
}

function quantizeGpsCameraPoint(gpsLocation: DashboardNavigationPoint | null): DashboardNavigationPoint | null {
  if (!gpsLocation) return null;
  return {
    latitude: quantizeCoordinate(gpsLocation.latitude),
    longitude: quantizeCoordinate(gpsLocation.longitude),
  };
}

function areDashboardGpsCameraSnapshotsEqual(
  left: DashboardGpsCameraSnapshot,
  right: DashboardGpsCameraSnapshot,
): boolean {
  return (
    left.location?.latitude === right.location?.latitude &&
    left.location?.longitude === right.location?.longitude &&
    left.bearingDeg === right.bearingDeg
  );
}

function useStableDashboardGpsCameraLocation(
  location: DashboardNavigationPoint | null,
  options?: { speedMph?: number | null; accuracyM?: number | null },
): DashboardNavigationPoint | null {
  const [snapshot, setSnapshot] = useState<DashboardGpsCameraSnapshot>(() =>
    resolveStableDashboardGpsCameraSnapshot({
      nextLocation: location,
      nextBearingDeg: null,
      speedMph: options?.speedMph ?? null,
      accuracyM: options?.accuracyM ?? null,
    }),
  );
  const latitude = location?.latitude ?? null;
  const longitude = location?.longitude ?? null;
  const speedMph = options?.speedMph ?? null;
  const accuracyM = options?.accuracyM ?? null;

  useEffect(() => {
    setSnapshot((previous) => {
      const next = resolveStableDashboardGpsCameraSnapshot({
        previous,
        nextLocation: location,
        nextBearingDeg: previous.bearingDeg,
        speedMph,
        accuracyM,
      });
      return areDashboardGpsCameraSnapshotsEqual(previous, next) ? previous : next;
    });
  }, [accuracyM, latitude, longitude, location, speedMph]);

  return snapshot.location;
}

function useStableDashboardGpsCameraSnapshot(input: {
  location: DashboardNavigationPoint | null;
  bearingDeg?: number | null;
  speedMph?: number | null;
  accuracyM?: number | null;
}): DashboardGpsCameraSnapshot {
  const [snapshot, setSnapshot] = useState<DashboardGpsCameraSnapshot>(() =>
    resolveStableDashboardGpsCameraSnapshot({
      nextLocation: input.location,
      nextBearingDeg: input.bearingDeg ?? null,
      speedMph: input.speedMph ?? null,
      accuracyM: input.accuracyM ?? null,
    }),
  );
  const latitude = input.location?.latitude ?? null;
  const longitude = input.location?.longitude ?? null;
  const bearingDeg = input.bearingDeg ?? null;
  const speedMph = input.speedMph ?? null;
  const accuracyM = input.accuracyM ?? null;

  useEffect(() => {
    setSnapshot((previous) => {
      const next = resolveStableDashboardGpsCameraSnapshot({
        previous,
        nextLocation: input.location,
        nextBearingDeg: bearingDeg,
        speedMph,
        accuracyM,
      });
      return areDashboardGpsCameraSnapshotsEqual(previous, next) ? previous : next;
    });
  }, [accuracyM, bearingDeg, input.location, latitude, longitude, speedMph]);

  return snapshot;
}

function getGuidanceModeLabel(snapshot: NavigateRouteSessionSnapshot): string {
  if (snapshot.lifecycle === 'inactive') return 'NO ACTIVE GUIDANCE';
  if (snapshot.lifecycle === 'preview') return 'ROUTE STAGED';
  if (snapshot.lifecycle === 'arrived') return 'ARRIVED';
  if (snapshot.source === 'trail') return 'TRAIL GUIDANCE';
  if (snapshot.source === 'hybrid') return 'ROUTE + TRAIL GUIDANCE';
  if (snapshot.source === 'road') return 'ROUTE GUIDANCE';
  if (snapshot.source === 'run') return 'RUN GUIDANCE';
  return 'NAVIGATION GUIDANCE';
}

function getManeuverIcon(instruction: string | null): IconName {
  const lower = instruction?.toLowerCase() ?? '';
  if (lower.includes('u-turn') || lower.includes('uturn')) return 'return-up-back-outline';
  if (lower.includes('left')) return 'arrow-back-outline';
  if (lower.includes('right')) return 'arrow-forward-outline';
  if (lower.includes('merge')) return 'git-merge-outline';
  if (lower.includes('roundabout')) return 'sync-outline';
  if (lower.includes('arrive') || lower.includes('destination')) return 'flag-outline';
  return 'navigate-outline';
}

function isGenericGuidanceInstruction(instruction: string): boolean {
  const normalized = instruction.trim().toLowerCase();
  return (
    normalized === 'continue on active route' ||
    normalized === 'stay on highlighted route' ||
    normalized === 'navigation started. proceed to the highlighted route.' ||
    normalized === 'open navigate to start guidance'
  );
}

function buildNextTurnStrip(snapshot: NavigateRouteSessionSnapshot): {
  instruction: string;
  distanceLabel: string | null;
  statusLabel: string | null;
  tone: NextTurnStripTone;
  icon: IconName;
} | null {
  if (snapshot.lifecycle !== 'active') return null;

  if (snapshot.isRerouting || snapshot.routeStatusKind === 'rerouting') {
    return {
      instruction: 'Rerouting...',
      distanceLabel: null,
      statusLabel: 'UPDATING',
      tone: 'warning',
      icon: 'sync-outline',
    };
  }

  if (snapshot.isOffRoute || snapshot.routeStatusKind === 'off_route') {
    return {
      instruction: 'Off route',
      distanceLabel: formatTurnDistance(snapshot.offRouteDistanceM),
      statusLabel: 'REJOIN',
      tone: 'warning',
      icon: 'warning-outline',
    };
  }

  const instruction = typeof snapshot.instruction === 'string' ? snapshot.instruction.trim() : '';
  if (!instruction) return null;
  if (snapshot.nextInstructionDistanceM == null && isGenericGuidanceInstruction(instruction)) {
    return null;
  }

  return {
    instruction,
    distanceLabel: formatTurnDistance(snapshot.nextInstructionDistanceM),
    statusLabel: 'NEXT',
    tone: 'active',
    icon: getManeuverIcon(instruction),
  };
}

function buildGuidanceLines(snapshot: NavigateRouteSessionSnapshot) {
  const hasAnyRoute = snapshot.lifecycle !== 'inactive';
  const instruction =
    snapshot.instruction ??
    snapshot.statusLabel ??
    (hasAnyRoute ? 'Continue on highlighted route' : 'No active route');
  const routeLine = hasAnyRoute
    ? snapshot.routeTitle ?? 'Active route'
    : 'Start navigation in Navigate to mirror live guidance here.';
  const distance = formatRemainingDistance(snapshot.remainingDistanceM);
  const duration = formatRemainingDuration(snapshot.remainingDurationS);
  const eta = formatEta(snapshot.etaIso);

  return {
    modeLabel: getGuidanceModeLabel(snapshot),
    routeLine,
    instruction,
    metrics: [
      distance ? `DIST ${distance}` : null,
      duration ? `ETA ${duration}` : null,
      eta ? `ARR ${eta}` : null,
    ].filter((value): value is string => !!value),
  };
}

function NextTurnStrip({ snapshot }: { snapshot: NavigateRouteSessionSnapshot }) {
  const strip = buildNextTurnStrip(snapshot);
  if (!strip) return null;

  return (
    <View
      style={[
        styles.nextTurnStrip,
        strip.tone === 'warning' ? styles.nextTurnStripWarning : null,
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.nextTurnIconWrap,
          strip.tone === 'warning' ? styles.nextTurnIconWrapWarning : null,
        ]}
      >
        <Ionicons
          name={strip.icon}
          size={15}
          color={strip.tone === 'warning' ? '#FFCF74' : TACTICAL.amber}
        />
      </View>
      <View style={styles.nextTurnCopy}>
        <Text style={styles.nextTurnInstruction} numberOfLines={1}>
          {strip.instruction}
        </Text>
        {strip.statusLabel || strip.distanceLabel ? (
          <Text style={styles.nextTurnMeta} numberOfLines={1}>
            {[strip.statusLabel, strip.distanceLabel].filter(Boolean).join('  |  ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function CompassRoseButton({
  headingDeg,
  onPress,
}: {
  headingDeg: number | null;
  onPress?: () => void;
}) {
  const bearing = normalizeBearingDeg(headingDeg) ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Reset map to current location"
      accessibilityHint="Recenters the 3D follow map on your current navigation position"
      onPress={onPress}
      style={({ pressed }) => [
        styles.compassButton,
        pressed ? styles.compassButtonPressed : null,
      ]}
    >
      <View style={styles.compassDial}>
        <Text style={styles.compassNorthLabel} numberOfLines={1}>N</Text>
        <View
          style={[
            styles.compassNeedle,
            { transform: [{ rotate: `${bearing}deg` }] },
          ]}
        >
          <Ionicons name="navigate" size={16} color={TACTICAL.amber} />
        </View>
      </View>
    </Pressable>
  );
}

function CommandMapViewSelector({
  activeView,
  menuOpen,
  onToggle,
  onSelect,
}: {
  activeView: typeof COMMAND_3D_MAP_VIEWS[number];
  menuOpen: boolean;
  onToggle: () => void;
  onSelect: (key: Command3DMapViewKey) => void;
}) {
  return (
    <View style={styles.commandMapViewControl}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open 3D follow map view menu"
        accessibilityHint="Switches between tactical, daytime, and satellite map views"
        onPress={onToggle}
        style={({ pressed }) => [
          styles.commandMapViewButton,
          menuOpen ? styles.commandMapViewButtonActive : null,
          pressed ? styles.commandMapViewButtonPressed : null,
        ]}
      >
        <Ionicons name={activeView.icon} size={15} color={TACTICAL.amber} />
        <Text style={styles.commandMapViewButtonText} numberOfLines={1}>
          {activeView.label}
        </Text>
        <Ionicons name={menuOpen ? 'chevron-up' : 'chevron-down'} size={12} color="rgba(236,212,150,0.86)" />
      </Pressable>

      {menuOpen ? (
        <View style={styles.commandMapViewMenu}>
          {COMMAND_3D_MAP_VIEWS.map((view) => {
            const selected = view.key === activeView.key;
            return (
              <Pressable
                key={view.key}
                accessibilityRole="button"
                accessibilityLabel={view.accessibilityLabel}
                accessibilityState={{ selected }}
                onPress={() => onSelect(view.key)}
                style={({ pressed }) => [
                  styles.commandMapViewOption,
                  selected ? styles.commandMapViewOptionSelected : null,
                  pressed ? styles.commandMapViewOptionPressed : null,
                ]}
              >
                <Ionicons
                  name={view.icon}
                  size={14}
                  color={selected ? TACTICAL.amber : 'rgba(230,237,243,0.78)'}
                />
                <Text
                  style={[
                    styles.commandMapViewOptionText,
                    selected ? styles.commandMapViewOptionTextSelected : null,
                  ]}
                  numberOfLines={1}
                >
                  {view.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

export function useNavigateSurfaceState(options?: WidgetRenderOptions, enabled = true) {
  const [mapToken, setMapToken] = useState(() => (enabled ? getMapboxTokenSync() : null));
  const [routeSession, setRouteSession] = useState<NavigateRouteSessionSnapshot>(() =>
    navigateRouteSessionStore.getSnapshot(),
  );

  const gpsLocation = useMemo(() => {
    if (options?.gpsHasFix && options.gpsLatitude != null && options.gpsLongitude != null) {
      return {
        latitude: options.gpsLatitude,
        longitude: options.gpsLongitude,
      };
    }

    return routeSession.currentLocation;
  }, [
    options?.gpsHasFix,
    options?.gpsLatitude,
    options?.gpsLongitude,
    routeSession.currentLocation,
  ]);

  useEffect(() => {
    let active = true;

    if (!enabled) {
      return () => {
        active = false;
      };
    }

    if (mapToken) {
      return () => {
        active = false;
      };
    }

    void getMapboxToken()
      .then((token) => {
        if (active && token) {
          setMapToken(token);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [enabled, mapToken]);

  useEffect(() => {
    if (!enabled) return;

    let mounted = true;
    const unsubscribe = navigateRouteSessionStore.subscribe(setRouteSession);
    void navigateRouteSessionStore.hydrateFromPersistence().then((snapshot) => {
      if (mounted) setRouteSession(snapshot);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [enabled]);

  const hasActiveGuidance = routeSession.lifecycle === 'active' || routeSession.lifecycle === 'arrived';
  const hasAnyRoute = routeSession.lifecycle !== 'inactive';
  const routePoints = routeSession.routePoints;
  const progressPoints = routeSession.progressPoints;
  const displayGpsPoint = useMemo(
    () =>
      resolveActiveGuidanceDisplayLocation({
        active: hasActiveGuidance,
        routePoints,
        currentLocation: gpsLocation,
      }),
    [gpsLocation, hasActiveGuidance, routePoints],
  );
  const displayGpsLocation = useMemo(
    () =>
      displayGpsPoint
        ? { latitude: displayGpsPoint.lat, longitude: displayGpsPoint.lng }
        : gpsLocation,
    [displayGpsPoint, gpsLocation],
  );
  const stableDisplayGpsLocation = useStableDashboardGpsCameraLocation(displayGpsLocation, {
    speedMph: options?.gpsSpeedMph ?? null,
    accuracyM: options?.gpsAccuracyM ?? null,
  });
  const showUserLocation = !!stableDisplayGpsLocation;
  const motionState = resolveMapSurfaceMotionState({
    surface: 'dashboard',
    isFocused: enabled,
    selected: enabled,
    hasActiveGuidance,
  });
  const shouldFollowUser = motionState.allowCameraFollow && !!stableDisplayGpsLocation && (hasActiveGuidance || !hasAnyRoute);
  const cameraMode: CameraMode | undefined = shouldFollowUser
    ? 'follow_user'
    : routePoints.length > 1
      ? 'route_overview'
      : undefined;
  const activeGuidanceCameraCommand = useMemo<CameraCommand | null>(() => {
    if (!hasActiveGuidance || !stableDisplayGpsLocation) return null;
    return {
      mode: 'follow_user',
      center: stableDisplayGpsLocation,
      zoom: ACTIVE_ROUTE_WIDGET_ZOOM,
      durationMs: 350,
      animate: true,
      reason: 'dashboard_active_guidance_quarter_mile',
    };
  }, [hasActiveGuidance, stableDisplayGpsLocation]);

  return {
    mapToken,
    routeSession,
    gpsLocation,
    displayGpsLocation: stableDisplayGpsLocation,
    showUserLocation,
    shouldFollowUser,
    cameraMode,
    activeGuidanceCameraCommand,
    motionPriority: motionState.motionPriority,
    routePoints,
    progressPoints,
    hasAnyRoute,
    hasActiveGuidance,
  };
}

export default function NavigateSurfaceWidget({ data: _data, options }: Props) {
  const {
    mapToken,
    routeSession,
    displayGpsLocation,
    showUserLocation,
    shouldFollowUser,
    cameraMode,
    activeGuidanceCameraCommand,
    motionPriority,
    routePoints,
    progressPoints,
  } = useNavigateSurfaceState(options);
  const miniMapMotionPriority: MapMotionPriority = motionPriority === 'hot' ? 'warm' : motionPriority;

  return (
    <View style={styles.surface}>
      <NavigateMiniMap
        mapToken={mapToken}
        routePoints={routePoints}
        progressPoints={progressPoints}
        showUserLocation={showUserLocation}
        shouldFollowUser={shouldFollowUser}
        gpsLocation={displayGpsLocation}
        headingDeg={routeSession.headingDeg}
        cameraMode={cameraMode}
        cameraCommand={activeGuidanceCameraCommand}
        motionPriority={miniMapMotionPriority}
        routeSession={routeSession}
        routeRenderMode={routeSession.lifecycle === 'active' ? 'active' : routeSession.lifecycle === 'preview' ? 'preview' : 'idle'}
        surfaceMode="compact"
        frameStyle={styles.widgetMapFrame}
        mapStyle={styles.mapRenderer}
      />
    </View>
  );
}

export function NavigateSurfaceDetailView({ data: _data, options }: Props) {
  const {
    mapToken,
    routeSession,
    displayGpsLocation,
    showUserLocation,
    shouldFollowUser,
    cameraMode,
    activeGuidanceCameraCommand,
    motionPriority,
    routePoints,
    progressPoints,
  } = useNavigateSurfaceState(options);

  return (
    <View style={styles.detailContainer}>
      <NavigateMiniMap
        mapToken={mapToken}
        routePoints={routePoints}
        progressPoints={progressPoints}
        showUserLocation={showUserLocation}
        shouldFollowUser={shouldFollowUser}
        gpsLocation={displayGpsLocation}
        headingDeg={routeSession.headingDeg}
        cameraMode={cameraMode}
        cameraCommand={activeGuidanceCameraCommand}
        motionPriority={motionPriority}
        routeSession={routeSession}
        routeRenderMode={routeSession.lifecycle === 'active' ? 'active' : routeSession.lifecycle === 'preview' ? 'preview' : 'idle'}
        frameStyle={styles.detailMapFrame}
      />
    </View>
  );
}

export function Mini3DFollowMap({
  options,
  selected = true,
}: {
  options?: WidgetRenderOptions;
  selected?: boolean;
}) {
  const {
    mapToken,
    routeSession,
    displayGpsLocation,
    showUserLocation,
    routePoints,
    progressPoints,
    hasActiveGuidance,
  } = useNavigateSurfaceState(options, selected);
  const lastBearingRef = useRef<number | null>(normalizeBearingDeg(routeSession.headingDeg));
  const [recenterRequestId, setRecenterRequestId] = useState(0);
  const [followLocked, setFollowLocked] = useState(true);
  const [mapViewKey, setMapViewKey] = useState<Command3DMapViewKey>(() => readPersistedCommand3DMapView());
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const liveGpsBearing = normalizeBearingDeg(options?.gpsHeadingDeg);
  const routeSessionBearing = normalizeBearingDeg(routeSession.headingDeg);
  const activeMapView = useMemo(
    () =>
      COMMAND_3D_MAP_VIEWS.find((view) => view.key === mapViewKey) ??
      COMMAND_3D_MAP_VIEWS.find((view) => view.key === DEFAULT_COMMAND_3D_MAP_VIEW) ??
      COMMAND_3D_MAP_VIEWS[0],
    [mapViewKey],
  );
  const chaseCamera = useMemo(() => resolveDashboardNavigationChaseCamera({
    currentLocation: displayGpsLocation,
    routePoints,
    gpsHeadingDeg: liveGpsBearing,
    routeSessionHeadingDeg: routeSessionBearing,
    fallbackBearingDeg: lastBearingRef.current,
    hasActiveGuidance,
    speedMph: options?.gpsSpeedMph ?? null,
  }), [
    displayGpsLocation,
    hasActiveGuidance,
    liveGpsBearing,
    options?.gpsSpeedMph,
    routePoints,
    routeSessionBearing,
  ]);
  const smoothedGpsCamera = useStableDashboardGpsCameraSnapshot({
    location: displayGpsLocation,
    bearingDeg: chaseCamera.bearingDeg,
    speedMph: options?.gpsSpeedMph ?? null,
    accuracyM: options?.gpsAccuracyM ?? null,
  });

  useEffect(() => {
    if (smoothedGpsCamera.bearingDeg != null) {
      lastBearingRef.current = smoothedGpsCamera.bearingDeg;
    }
  }, [smoothedGpsCamera.bearingDeg]);

  useEffect(() => {
    let mounted = true;
    void command3DMapViewPreference.waitForHydration().then(() => {
      if (!mounted) return;
      const stored = readPersistedCommand3DMapView();
      setMapViewKey((current) => (current === stored ? current : stored));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const gpsCameraLatitude = smoothedGpsCamera.location?.latitude ?? null;
  const gpsCameraLongitude = smoothedGpsCamera.location?.longitude ?? null;
  const cameraCenter = useMemo<DashboardNavigationPoint | null>(() => {
    if (gpsCameraLatitude == null || gpsCameraLongitude == null) return null;
    return quantizeGpsCameraPoint({
      latitude: gpsCameraLatitude,
      longitude: gpsCameraLongitude,
    });
  }, [gpsCameraLatitude, gpsCameraLongitude]);

  const cameraBearing = smoothedGpsCamera.bearingDeg ?? lastBearingRef.current ?? 0;
  const cameraCommand = useMemo<CameraCommand | null>(() => {
    if (!selected || !cameraCenter || !followLocked) return null;
    return {
      mode: 'follow_user',
      center: cameraCenter,
      zoom: hasActiveGuidance ? COMMAND_3D_FOLLOW_ZOOM : COMMAND_3D_FREE_DRIVE_ZOOM,
      pitch: COMMAND_3D_FOLLOW_PITCH,
      bearing: cameraBearing,
      offset: hasActiveGuidance ? COMMAND_3D_ACTIVE_FOLLOW_OFFSET : COMMAND_3D_FREE_DRIVE_OFFSET,
      durationMs: 650,
      animate: true,
      reason: hasActiveGuidance
        ? `dashboard_command_3d_active_guidance:${chaseCamera.bearingSource}:${recenterRequestId}`
        : `dashboard_command_3d_free_drive:${chaseCamera.bearingSource}:${recenterRequestId}`,
    };
  }, [cameraBearing, cameraCenter, chaseCamera.bearingSource, followLocked, hasActiveGuidance, recenterRequestId, selected]);
  const handleRecenter = useCallback(() => {
    setFollowLocked(true);
    setViewMenuOpen(false);
    setRecenterRequestId((value) => value + 1);
  }, []);
  const handleUserDrag = useCallback(() => {
    setFollowLocked(false);
    setViewMenuOpen(false);
  }, []);
  const handleToggleViewMenu = useCallback(() => {
    setViewMenuOpen((open) => !open);
  }, []);
  const handleSelectMapView = useCallback((key: Command3DMapViewKey) => {
    setMapViewKey(key);
    command3DMapViewPreference.set(COMMAND_3D_MAP_VIEW_STORAGE_KEY, key);
    setViewMenuOpen(false);
  }, []);

  if (!selected) {
    return (
      <View style={styles.commandMapStandby}>
        <Text style={styles.commandMapStandbyTitle}>Navigation map paused</Text>
        <Text style={styles.commandMapStandbyText}>
          Select this center module to resume the compact navigation surface.
        </Text>
      </View>
    );
  }

  const routeRenderMode: RouteRenderMode =
    routeSession.lifecycle === 'active'
      ? 'active'
      : routeSession.lifecycle === 'preview'
        ? 'preview'
        : routeSession.lifecycle === 'arrived'
          ? 'completed'
          : 'idle';
  const cameraMode: CameraMode | undefined = cameraCenter && followLocked
    ? 'follow_user'
    : routePoints.length > 1
      ? 'route_overview'
      : undefined;

  return (
    <View style={styles.commandMapSurface}>
      <NavigateMiniMap
        mapToken={mapToken}
        routePoints={routePoints}
        progressPoints={progressPoints}
        showUserLocation={showUserLocation}
        shouldFollowUser={followLocked && !!cameraCenter}
        gpsLocation={displayGpsLocation}
        headingDeg={cameraBearing}
        cameraMode={cameraMode}
        cameraCommand={cameraCommand}
        cameraCommandTrigger={recenterRequestId}
        motionPriority={resolveMapSurfaceMotionState({
          surface: 'dashboard',
          isFocused: selected,
          selected,
          hasActiveGuidance,
        }).motionPriority}
        routeSession={routeSession}
        routeRenderMode={routeRenderMode}
        mapStyleKey={activeMapView.mapStyle}
        guidanceVariant="command3d"
        onRecenter={handleRecenter}
        onUserDrag={handleUserDrag}
        frameStyle={styles.commandMapFrame}
        mapStyle={styles.commandMapRenderer}
        surfaceMode="compact"
      />
      <CommandMapViewSelector
        activeView={activeMapView}
        menuOpen={viewMenuOpen}
        onToggle={handleToggleViewMenu}
        onSelect={handleSelectMapView}
      />
      {!displayGpsLocation ? (
        <View style={styles.commandGpsNotice} pointerEvents="none">
          <Text style={styles.commandGpsNoticeText}>GPS POSITION UNAVAILABLE</Text>
        </View>
      ) : null}
    </View>
  );
}

function NavigateMiniMap({
  mapToken,
  routePoints,
  progressPoints,
  showUserLocation,
  shouldFollowUser,
  gpsLocation,
  headingDeg,
  cameraMode,
  cameraCommand,
  cameraCommandTrigger,
  motionPriority = 'warm',
  routeSession,
  routeRenderMode = 'idle',
  mapStyleKey = 'ecs',
  guidanceVariant = 'standard',
  surfaceMode = 'full',
  onRecenter,
  onUserDrag,
  frameStyle,
  mapStyle,
}: {
  mapToken: string | null;
  routePoints: { lat: number; lng: number }[];
  progressPoints: { lat: number; lng: number }[];
  showUserLocation: boolean;
  shouldFollowUser: boolean;
  gpsLocation: { latitude: number; longitude: number } | null;
  headingDeg: number | null;
  cameraMode?: CameraMode;
  cameraCommand?: CameraCommand | null;
  cameraCommandTrigger?: number;
  motionPriority?: MapMotionPriority;
  routeSession: NavigateRouteSessionSnapshot;
  routeRenderMode?: RouteRenderMode;
  mapStyleKey?: MapStyleKey;
  guidanceVariant?: 'standard' | 'command3d';
  surfaceMode?: 'full' | 'compact';
  onRecenter?: () => void;
  onUserDrag?: () => void;
  frameStyle?: any;
  mapStyle?: any;
}) {
  const guidance = buildGuidanceLines(routeSession);
  const resolvedMapStyle = useMemo(() => [styles.mapRenderer, mapStyle], [mapStyle]);

  return (
    <View style={[styles.mapFrame, frameStyle]}>
      <MapRenderer
        points={routePoints}
        progressPoints={progressPoints}
        mapStyle={mapStyleKey}
        mapboxToken={mapToken || ''}
        showUserLocation={showUserLocation}
        followUser={shouldFollowUser && !cameraCommand}
        userLocation={gpsLocation}
        vehicleHeading={headingDeg}
        motionPriority={motionPriority}
        interactive={guidanceVariant === 'command3d'}
        isLoading={!mapToken}
        hasToken={!!mapToken}
        cameraMode={cameraMode}
        cameraCommand={cameraCommand ?? null}
        cameraCommandTrigger={cameraCommandTrigger}
        onUserDrag={onUserDrag}
        routeRenderMode={routeRenderMode}
        routeColor="#C48A2C"
        progressColor="#F7D67A"
        surfaceMode={surfaceMode}
        standbyWakeDisabled={guidanceVariant !== 'command3d'}
        style={resolvedMapStyle}
      />

      {!mapToken ? (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="small" color={TACTICAL.amber} />
        </View>
      ) : null}
      {guidanceVariant === 'command3d' ? (
        <>
          <NextTurnStrip snapshot={routeSession} />
          <CompassRoseButton headingDeg={headingDeg} onPress={onRecenter} />
        </>
      ) : (
        <View style={styles.guidanceContainer} pointerEvents="none">
          <View style={styles.guidanceHeaderRow}>
            <Text style={styles.guidanceModeLabel} numberOfLines={1}>
              {guidance.modeLabel}
            </Text>
            {guidance.metrics.length > 0 ? (
              <Text style={styles.guidanceMetrics} numberOfLines={1}>
                {guidance.metrics.join('   ')}
              </Text>
            ) : null}
          </View>
          <Text style={styles.guidanceInstruction} numberOfLines={2}>
            {guidance.instruction}
          </Text>
          <Text style={styles.guidanceRouteLine} numberOfLines={1}>
            {guidance.routeLine}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    flex: 1,
    width: '100%',
    height: '100%',
    minHeight: 0,
    overflow: 'hidden',
  },
  mapFrame: {
    flex: 1,
    width: '100%',
    alignSelf: 'stretch',
    minHeight: 0,
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'transparent',
  },
  widgetMapFrame: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignSelf: 'stretch',
    minHeight: 0,
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',
    backgroundColor: 'transparent',
  },
  mapRenderer: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    minHeight: 0,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(6,8,10,0.2)',
  },
  guidanceContainer: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(247,214,122,0.28)',
    backgroundColor: 'rgba(4,6,8,0.82)',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  guidanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  guidanceModeLabel: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1.1,
    flexShrink: 1,
  },
  guidanceMetrics: {
    color: 'rgba(236,212,150,0.86)',
    fontSize: 7.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    flexShrink: 0,
  },
  guidanceInstruction: {
    color: TACTICAL.text,
    fontSize: 11.5,
    fontWeight: '900',
    lineHeight: 14,
    marginTop: 3,
  },
  guidanceRouteLine: {
    color: TACTICAL.textMuted,
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginTop: 2,
  },
  detailContainer: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  detailMapFrame: {
    flex: 1,
    minHeight: 220,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.18)',
    backgroundColor: 'transparent',
  },
  commandMapSurface: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  commandMapFrame: {
    flex: 1,
    width: '100%',
    height: '100%',
    alignSelf: 'stretch',
    minHeight: 0,
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
  },
  commandMapRenderer: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
    minHeight: 0,
  },
  nextTurnStrip: {
    left: 10,
    right: 92,
    top: 10,
    position: 'absolute',
    minHeight: 44,
    zIndex: 3,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(247,214,122,0.4)',
    backgroundColor: 'rgba(2,4,6,0.94)',
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  nextTurnStripWarning: {
    borderColor: 'rgba(255,186,94,0.5)',
    backgroundColor: 'rgba(13,7,3,0.95)',
  },
  nextTurnIconWrap: {
    width: 25,
    height: 25,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(247,214,122,0.38)',
    backgroundColor: 'rgba(247,214,122,0.08)',
  },
  nextTurnIconWrapWarning: {
    borderColor: 'rgba(255,207,116,0.54)',
    backgroundColor: 'rgba(255,167,75,0.1)',
  },
  nextTurnCopy: {
    flex: 1,
    minWidth: 0,
  },
  nextTurnInstruction: {
    color: TACTICAL.text,
    fontSize: 10.8,
    fontWeight: '900',
    lineHeight: 13,
  },
  nextTurnMeta: {
    color: 'rgba(236,212,150,0.88)',
    fontSize: 7.5,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 2,
  },
  compassButton: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(247,214,122,0.38)',
    backgroundColor: 'rgba(2,4,6,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassButtonPressed: {
    borderColor: 'rgba(247,214,122,0.68)',
    backgroundColor: 'rgba(30,22,8,0.96)',
  },
  compassDial: {
    width: 30,
    height: 30,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(236,212,150,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  compassNorthLabel: {
    position: 'absolute',
    top: 1,
    color: 'rgba(236,212,150,0.92)',
    fontSize: 7,
    lineHeight: 8,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  compassNeedle: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  commandMapViewControl: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 4,
    alignItems: 'flex-end',
  },
  commandMapViewButton: {
    minWidth: 78,
    height: 32,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(247,214,122,0.34)',
    backgroundColor: 'rgba(2,4,6,0.9)',
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  commandMapViewButtonActive: {
    borderColor: 'rgba(247,214,122,0.58)',
    backgroundColor: 'rgba(20,15,7,0.94)',
  },
  commandMapViewButtonPressed: {
    borderColor: 'rgba(247,214,122,0.72)',
    backgroundColor: 'rgba(31,22,8,0.96)',
  },
  commandMapViewButtonText: {
    color: 'rgba(236,212,150,0.94)',
    fontSize: 8,
    lineHeight: 10,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  commandMapViewMenu: {
    marginTop: 5,
    minWidth: 92,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(247,214,122,0.26)',
    backgroundColor: 'rgba(2,4,6,0.94)',
    padding: 4,
    gap: 3,
  },
  commandMapViewOption: {
    minHeight: 30,
    borderRadius: 7,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  commandMapViewOptionSelected: {
    backgroundColor: 'rgba(247,214,122,0.12)',
  },
  commandMapViewOptionPressed: {
    backgroundColor: 'rgba(247,214,122,0.18)',
  },
  commandMapViewOptionText: {
    color: 'rgba(230,237,243,0.78)',
    fontSize: 8.5,
    lineHeight: 11,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  commandMapViewOptionTextSelected: {
    color: TACTICAL.amber,
  },
  commandGpsNotice: {
    position: 'absolute',
    bottom: 10,
    alignSelf: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(247,214,122,0.24)',
    backgroundColor: 'rgba(5,7,9,0.72)',
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  commandGpsNoticeText: {
    color: 'rgba(236,212,150,0.88)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.9,
  },
  commandMapStandby: {
    flex: 1,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    backgroundColor: 'rgba(3,5,7,0.9)',
  },
  commandMapStandbyTitle: {
    color: TACTICAL.amber,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  commandMapStandbyText: {
    marginTop: 6,
    color: TACTICAL.textMuted,
    fontSize: 10,
    fontWeight: '700',
    lineHeight: 14,
    textAlign: 'center',
  },
});
