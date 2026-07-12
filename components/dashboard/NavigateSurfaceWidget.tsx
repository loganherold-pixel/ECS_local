import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  navigateRouteSessionStore,
  type NavigateRouteSessionSnapshot,
} from '../../lib/navigateRouteSessionStore';
import { resolveActiveGuidanceDisplayLocation } from '../../lib/activeGuidanceProgressPath';
import type { WidgetData, WidgetRenderOptions } from './WidgetRenderers';

type Props = {
  data: WidgetData;
  options?: WidgetRenderOptions;
};

type NavigationCommandVariant = 'widget' | 'detail' | 'command';
type NavigationTone = 'active' | 'preview' | 'warning' | 'standby';
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

function getGuidanceModeLabel(snapshot: NavigateRouteSessionSnapshot): string {
  if (snapshot.lifecycle === 'active') return 'ACTIVE GUIDANCE';
  if (snapshot.lifecycle === 'preview') return 'ROUTE STAGED';
  if (snapshot.lifecycle === 'arrived') return 'ARRIVED';
  return 'STANDBY';
}

function getTone(snapshot: NavigateRouteSessionSnapshot): NavigationTone {
  if (snapshot.isRerouting || snapshot.routeStatusKind === 'rerouting') return 'warning';
  if (snapshot.isOffRoute || snapshot.routeStatusKind === 'off_route') return 'warning';
  if (snapshot.lifecycle === 'active' || snapshot.lifecycle === 'arrived') return 'active';
  if (snapshot.lifecycle === 'preview') return 'preview';
  return 'standby';
}

function getToneColor(tone: NavigationTone): string {
  switch (tone) {
    case 'active':
      return '#66BB6A';
    case 'preview':
      return TACTICAL.amber;
    case 'warning':
      return '#FFCF74';
    default:
      return TACTICAL.textMuted;
  }
}

function isGenericGuidanceInstruction(instruction: string): boolean {
  const normalized = instruction.trim().toLowerCase();
  return (
    normalized === 'continue' ||
    normalized === 'continue on route' ||
    normalized === 'continue on highlighted route'
  );
}

function getManeuverIcon(instruction: string): IconName {
  const normalized = instruction.toLowerCase();
  if (normalized.includes('left')) return 'return-up-back-outline';
  if (normalized.includes('right')) return 'return-up-forward-outline';
  if (normalized.includes('u-turn') || normalized.includes('uturn')) return 'refresh-outline';
  if (normalized.includes('arrive') || normalized.includes('destination')) return 'flag-outline';
  if (normalized.includes('rerout')) return 'sync-outline';
  if (normalized.includes('off route')) return 'warning-outline';
  return 'navigate-outline';
}

function buildNextTurn(snapshot: NavigateRouteSessionSnapshot): {
  instruction: string;
  distanceLabel: string | null;
  statusLabel: string;
  icon: IconName;
} | null {
  if (snapshot.lifecycle !== 'active') return null;

  if (snapshot.isRerouting || snapshot.routeStatusKind === 'rerouting') {
    return {
      instruction: 'Rerouting...',
      distanceLabel: null,
      statusLabel: 'UPDATING',
      icon: 'sync-outline',
    };
  }

  if (snapshot.isOffRoute || snapshot.routeStatusKind === 'off_route') {
    return {
      instruction: 'Off route',
      distanceLabel: formatTurnDistance(snapshot.offRouteDistanceM),
      statusLabel: 'REJOIN',
      icon: 'warning-outline',
    };
  }

  const instruction = typeof snapshot.instruction === 'string' ? snapshot.instruction.trim() : '';
  if (!instruction) return null;
  if (snapshot.nextInstructionDistanceM == null && isGenericGuidanceInstruction(instruction)) return null;

  return {
    instruction,
    distanceLabel: formatTurnDistance(snapshot.nextInstructionDistanceM),
    statusLabel: 'NEXT',
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
    : 'Navigation context is standing by.';
  const distance = formatRemainingDistance(snapshot.remainingDistanceM);
  const duration = formatRemainingDuration(snapshot.remainingDurationS);
  const eta = formatEta(snapshot.etaIso);

  return {
    modeLabel: getGuidanceModeLabel(snapshot),
    routeLine,
    instruction,
    metrics: [
      distance ? { label: 'DIST', value: distance } : null,
      duration ? { label: 'ETA', value: duration } : null,
      eta ? { label: 'ARR', value: eta } : null,
    ].filter((value): value is { label: string; value: string } => !!value),
  };
}

export function useNavigateSurfaceState(options?: WidgetRenderOptions, enabled = true) {
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
    if (!enabled) return undefined;

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
  const displayGpsLocation = displayGpsPoint
    ? { latitude: displayGpsPoint.lat, longitude: displayGpsPoint.lng }
    : gpsLocation;

  return {
    routeSession,
    gpsLocation,
    displayGpsLocation,
    showUserLocation: !!displayGpsLocation,
    shouldFollowUser: false,
    cameraMode: undefined,
    activeGuidanceCameraCommand: null,
    motionPriority: 'warm' as const,
    routePoints,
    progressPoints,
    hasAnyRoute,
    hasActiveGuidance,
  };
}

function MetricTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metricTile}>
      <Text style={styles.metricLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function NavigationCommandStatusCard({
  state,
  variant,
  selected = true,
}: {
  state: ReturnType<typeof useNavigateSurfaceState>;
  variant: NavigationCommandVariant;
  selected?: boolean;
}) {
  const guidance = buildGuidanceLines(state.routeSession);
  const nextTurn = buildNextTurn(state.routeSession);
  const tone = getTone(state.routeSession);
  const toneColor = getToneColor(tone);
  const compact = variant === 'widget';
  const progressRatio = state.routePoints.length > 1
    ? Math.min(1, Math.max(0, state.progressPoints.length / state.routePoints.length))
    : state.hasActiveGuidance
      ? 0.08
      : 0;
  const gpsLabel = state.showUserLocation ? 'GPS FIX' : 'GPS WAIT';
  const sourceLabel = state.routeSession.source === 'road'
    ? 'ROAD'
    : state.routeSession.source === 'trail'
      ? 'TRAIL'
      : state.routeSession.source === 'run'
        ? 'RUN'
        : 'LOCAL';

  if (!selected) {
    return (
      <View style={[styles.statusCard, styles.statusCardStandby]}>
        <Text style={styles.eyebrow}>NAVIGATION COMMAND</Text>
        <Text style={styles.title}>Module paused</Text>
        <Text style={styles.body}>Live route state is retained while this dashboard module is inactive.</Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.statusCard,
        compact ? styles.statusCardCompact : null,
        variant === 'command' ? styles.statusCardCommand : null,
      ]}
      testID="dashboard-navigation-command-status-card"
    >
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>NAVIGATION COMMAND</Text>
          <Text style={styles.title} numberOfLines={1}>{guidance.modeLabel}</Text>
        </View>
        <View style={[styles.statusPill, { borderColor: `${toneColor}66`, backgroundColor: `${toneColor}18` }]}>
          <Text style={[styles.statusPillText, { color: toneColor }]} numberOfLines={1}>
            {tone === 'warning' ? 'WATCH' : guidance.modeLabel}
          </Text>
        </View>
      </View>

      {nextTurn ? (
        <View style={styles.nextTurnRow}>
          <View style={[styles.nextTurnIcon, { borderColor: `${toneColor}66` }]}>
            <Ionicons name={nextTurn.icon} size={compact ? 13 : 15} color={toneColor} />
          </View>
          <View style={styles.nextTurnCopy}>
            <Text style={styles.nextTurnInstruction} numberOfLines={compact ? 1 : 2}>
              {nextTurn.instruction}
            </Text>
            <Text style={styles.nextTurnMeta} numberOfLines={1}>
              {[nextTurn.statusLabel, nextTurn.distanceLabel].filter(Boolean).join(' | ')}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.instructionBlock}>
          <Text style={styles.instructionText} numberOfLines={compact ? 2 : 3}>
            {guidance.instruction}
          </Text>
          <Text style={styles.routeLine} numberOfLines={1}>{guidance.routeLine}</Text>
        </View>
      )}

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${Math.round(progressRatio * 100)}%`, backgroundColor: toneColor }]} />
      </View>

      <View style={styles.metricGrid}>
        {guidance.metrics.length > 0 ? (
          guidance.metrics.map((metric) => (
            <MetricTile key={metric.label} label={metric.label} value={metric.value} />
          ))
        ) : (
          <MetricTile label="ROUTE" value={state.hasAnyRoute ? sourceLabel : 'NONE'} />
        )}
        <MetricTile label="GPS" value={gpsLabel} />
        <MetricTile label="SRC" value={sourceLabel} />
      </View>

      {!compact ? (
        <View style={styles.detailFacts}>
          <Text style={styles.factText} numberOfLines={1}>
            {state.routePoints.length > 1
              ? `${state.routePoints.length} route points | ${state.progressPoints.length} progress points`
              : 'Route geometry unavailable'}
          </Text>
          <Text style={styles.factText} numberOfLines={1}>
            {state.displayGpsLocation
              ? `${state.displayGpsLocation.latitude.toFixed(5)}, ${state.displayGpsLocation.longitude.toFixed(5)}`
              : 'Current GPS coordinate unavailable'}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

export default function NavigateSurfaceWidget({ data: _data, options }: Props) {
  const state = useNavigateSurfaceState(options);

  return (
    <View style={styles.surface}>
      <NavigationCommandStatusCard state={state} variant="widget" />
    </View>
  );
}

export function NavigateSurfaceDetailView({ data: _data, options }: Props) {
  const state = useNavigateSurfaceState(options);

  return (
    <View style={styles.detailContainer}>
      <NavigationCommandStatusCard state={state} variant="detail" />
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
  const state = useNavigateSurfaceState(options, selected);

  return (
    <View style={styles.commandContainer}>
      <NavigationCommandStatusCard state={state} variant="command" selected={selected} />
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
  detailContainer: {
    flex: 1,
    minHeight: 0,
    width: '100%',
  },
  commandContainer: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    backgroundColor: 'transparent',
  },
  statusCard: {
    flex: 1,
    minHeight: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.22)',
    backgroundColor: 'rgba(8,12,15,0.92)',
    padding: 12,
    gap: 10,
    overflow: 'hidden',
  },
  statusCardCompact: {
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 9,
  },
  statusCardCommand: {
    borderRadius: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    padding: 10,
  },
  statusCardStandby: {
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerCopy: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: '900',
    marginTop: 3,
  },
  body: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: 6,
  },
  statusPill: {
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 4,
    maxWidth: 116,
  },
  statusPillText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  nextTurnRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minHeight: 42,
  },
  nextTurnIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  nextTurnCopy: {
    flex: 1,
    minWidth: 0,
  },
  nextTurnInstruction: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: '900',
  },
  nextTurnMeta: {
    color: 'rgba(236,212,150,0.88)',
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
    marginTop: 3,
  },
  instructionBlock: {
    gap: 3,
  },
  instructionText: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
  },
  routeLine: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 12,
    fontWeight: '800',
  },
  progressTrack: {
    height: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    minWidth: 4,
    borderRadius: 999,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metricTile: {
    flexGrow: 1,
    flexBasis: 66,
    minHeight: 34,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingHorizontal: 7,
    paddingVertical: 5,
    justifyContent: 'center',
  },
  metricLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.7,
  },
  metricValue: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
    marginTop: 2,
  },
  detailFacts: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: 8,
    gap: 4,
  },
  factText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
});
