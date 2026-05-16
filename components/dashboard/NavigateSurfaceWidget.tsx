import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import MapRenderer from '../navigate/MapRenderer';
import type { CameraCommand, CameraMode } from '../navigate/MapRenderer';
import { TACTICAL } from '../../lib/theme';
import { getMapboxToken, getMapboxTokenSync, type MapStyleKey } from '../../lib/mapConfig';
import {
  navigateRouteSessionStore,
  type NavigateRouteSessionSnapshot,
} from '../../lib/navigateRouteSessionStore';
import type { WidgetData, WidgetRenderOptions } from './WidgetRenderers';

type Props = {
  data: WidgetData;
  options?: WidgetRenderOptions;
};

const ACTIVE_ROUTE_WIDGET_ZOOM = 16.4;
const COMMAND_3D_FOLLOW_ZOOM = 16.7;
const COMMAND_3D_FREE_DRIVE_ZOOM = 16.2;
const COMMAND_3D_FOLLOW_PITCH = 70;
const COMMAND_3D_FOLLOW_OFFSET: [number, number] = [0, 72];

type RouteRenderMode = 'idle' | 'preview' | 'active' | 'completed' | 'selected';
type NextTurnStripTone = 'active' | 'warning';
type IconName = React.ComponentProps<typeof Ionicons>['name'];

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
  const showUserLocation = !!gpsLocation;
  const shouldFollowUser = !!gpsLocation && (hasActiveGuidance || !hasAnyRoute);
  const cameraMode: CameraMode | undefined = shouldFollowUser
    ? 'follow_user'
    : routePoints.length > 1
      ? 'route_overview'
      : undefined;
  const activeGuidanceCameraCommand = useMemo<CameraCommand | null>(() => {
    if (!hasActiveGuidance || !gpsLocation) return null;
    return {
      mode: 'follow_user',
      center: gpsLocation,
      zoom: ACTIVE_ROUTE_WIDGET_ZOOM,
      durationMs: 350,
      animate: true,
      reason: 'dashboard_active_guidance_quarter_mile',
    };
  }, [gpsLocation, hasActiveGuidance]);

  return {
    mapToken,
    routeSession,
    gpsLocation,
    showUserLocation,
    shouldFollowUser,
    cameraMode,
    activeGuidanceCameraCommand,
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
    gpsLocation,
    showUserLocation,
    shouldFollowUser,
    cameraMode,
    activeGuidanceCameraCommand,
    routePoints,
    progressPoints,
  } = useNavigateSurfaceState(options);

  return (
    <View style={styles.surface}>
      <NavigateMiniMap
        mapToken={mapToken}
        routePoints={routePoints}
        progressPoints={progressPoints}
        showUserLocation={showUserLocation}
        shouldFollowUser={shouldFollowUser}
        gpsLocation={gpsLocation}
        headingDeg={routeSession.headingDeg}
        cameraMode={cameraMode}
        cameraCommand={activeGuidanceCameraCommand}
        routeSession={routeSession}
        routeRenderMode={routeSession.lifecycle === 'active' ? 'active' : routeSession.lifecycle === 'preview' ? 'preview' : 'idle'}
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
    gpsLocation,
    showUserLocation,
    shouldFollowUser,
    cameraMode,
    activeGuidanceCameraCommand,
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
        gpsLocation={gpsLocation}
        headingDeg={routeSession.headingDeg}
        cameraMode={cameraMode}
        cameraCommand={activeGuidanceCameraCommand}
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
    gpsLocation,
    showUserLocation,
    routePoints,
    progressPoints,
    hasActiveGuidance,
  } = useNavigateSurfaceState(options, selected);
  const lastBearingRef = useRef<number | null>(normalizeBearingDeg(routeSession.headingDeg));
  const [recenterRequestId, setRecenterRequestId] = useState(0);
  const liveBearing = normalizeBearingDeg(routeSession.headingDeg);

  useEffect(() => {
    if (liveBearing != null) {
      lastBearingRef.current = liveBearing;
    }
  }, [liveBearing]);

  const cameraCenter = useMemo(() => {
    if (!gpsLocation) return null;
    return {
      latitude: quantizeCoordinate(gpsLocation.latitude),
      longitude: quantizeCoordinate(gpsLocation.longitude),
    };
  }, [gpsLocation]);

  const cameraBearing = liveBearing ?? lastBearingRef.current ?? 0;
  const cameraCommand = useMemo<CameraCommand | null>(() => {
    if (!selected || !cameraCenter) return null;
    return {
      mode: 'follow_user',
      center: cameraCenter,
      zoom: hasActiveGuidance ? COMMAND_3D_FOLLOW_ZOOM : COMMAND_3D_FREE_DRIVE_ZOOM,
      pitch: COMMAND_3D_FOLLOW_PITCH,
      bearing: cameraBearing,
      offset: COMMAND_3D_FOLLOW_OFFSET,
      durationMs: 650,
      animate: true,
      reason: hasActiveGuidance
        ? `dashboard_command_3d_active_guidance:${recenterRequestId}`
        : `dashboard_command_3d_free_drive:${recenterRequestId}`,
    };
  }, [cameraBearing, cameraCenter, hasActiveGuidance, recenterRequestId, selected]);
  const handleRecenter = useCallback(() => {
    setRecenterRequestId((value) => value + 1);
  }, []);

  if (!selected) {
    return (
      <View style={styles.commandMapStandby}>
        <Text style={styles.commandMapStandbyTitle}>3D Follow Map paused</Text>
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
  const cameraMode: CameraMode | undefined = cameraCenter
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
        shouldFollowUser={!!cameraCenter}
        gpsLocation={gpsLocation}
        headingDeg={cameraBearing}
        cameraMode={cameraMode}
        cameraCommand={cameraCommand}
        cameraCommandTrigger={recenterRequestId}
        routeSession={routeSession}
        routeRenderMode={routeRenderMode}
        mapStyleKey="3d"
        guidanceVariant="command3d"
        onRecenter={handleRecenter}
        frameStyle={styles.commandMapFrame}
        mapStyle={styles.commandMapRenderer}
      />
      {!gpsLocation ? (
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
  routeSession,
  routeRenderMode = 'idle',
  mapStyleKey = 'ecs',
  guidanceVariant = 'standard',
  onRecenter,
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
  routeSession: NavigateRouteSessionSnapshot;
  routeRenderMode?: RouteRenderMode;
  mapStyleKey?: MapStyleKey;
  guidanceVariant?: 'standard' | 'command3d';
  onRecenter?: () => void;
  frameStyle?: any;
  mapStyle?: any;
}) {
  const guidance = buildGuidanceLines(routeSession);

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
        interactive={guidanceVariant === 'command3d'}
        isLoading={!mapToken}
        hasToken={!!mapToken}
        cameraMode={cameraMode}
        cameraCommand={cameraCommand ?? null}
        cameraCommandTrigger={cameraCommandTrigger}
        routeRenderMode={routeRenderMode}
        routeColor="#C48A2C"
        progressColor="#F7D67A"
        style={[styles.mapRenderer, mapStyle]}
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
    backgroundColor: 'rgba(2,4,6,0.92)',
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
    right: 58,
    bottom: 10,
    position: 'absolute',
    minHeight: 44,
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
