import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  type AppStateStatus,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { appearanceStore } from '../../lib/appearanceStore';
import type { ActiveRouteProgressSnapshot } from '../../lib/activeRouteProgress';
import { ECS_MOTION, ecsAnimationSettings, useReducedMotion } from '../../lib/ecsAnimations';
import {
  buildTerrainCommandVisibleProfileFromPoints,
  projectTerrainInspectionCoordinate,
  resolveTerrainCommandInteractionPolicy,
  selectTerrainCommandRiskSegment,
  type TerrainCommandRange,
} from '../../lib/terrainIntelligenceCommandModel';
import type { TerrainIntelligenceSnapshot } from '../../lib/terrainIntelligencePresentation';
import {
  consumeTerrainProfileReveal,
  consumeTerrainRiskPulse,
  incrementTerrainMotionDiagnostic,
  recordTerrainExpansionLatency,
  resolveTerrainVisualProgressUpdate,
  shouldAnimateTerrainRiskPulse,
  type TerrainVisualProgressState,
} from '../../lib/terrainIntelligenceMotion';
import type { TerrainProfilePoint } from '../../lib/terrainRiskCommandProfile';
import {
  buildTerrainRiskReferenceEvents,
  type TerrainRiskReferenceEvent,
} from '../../lib/terrainRiskReferenceEvents';
import { ECS, TACTICAL } from '../../lib/theme';
import { SourceTruthInspectorTrigger } from '../source-truth';
import { SafeIcon as Ionicons } from '../SafeIcon';
import TerrainRiskSideProfile from './TerrainRiskSideProfile';

export type TerrainInspectionTarget = {
  routeId: string;
  routeGeometryFingerprint: string | null;
  distanceMiles: number;
  segmentId: string | null;
  coordinate: { lat: number; lng: number } | null;
};

type Props = {
  snapshot: TerrainIntelligenceSnapshot;
  routeProgress: ActiveRouteProgressSnapshot | null;
  onClose?: () => void;
  onShowOnMap?: (target: TerrainInspectionTarget) => void;
};

const RANGE_OPTIONS: { id: TerrainCommandRange; label: string }[] = [
  { id: 'next_1_mi', label: 'NEXT 1 MI' },
  { id: 'next_5_mi', label: 'NEXT 5 MI' },
  { id: 'full_route', label: 'FULL ROUTE' },
];

function fieldValue(value: unknown, unit: string | null): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return `${Math.round(value).toLocaleString()}${unit ? ` ${unit}` : ''}`;
  }
  if (typeof value === 'string' && value.trim()) return value;
  return 'UNKNOWN';
}

function sourceSummary(snapshot: TerrainIntelligenceSnapshot): string {
  return [
    snapshot.source.origin,
    snapshot.source.freshness,
    `${snapshot.source.confidence} confidence`,
  ].join(' • ').toUpperCase();
}

export default function TerrainIntelligenceCommand({
  snapshot,
  routeProgress,
  onClose,
  onShowOnMap,
}: Props) {
  incrementTerrainMotionDiagnostic('expandedHudRenders');
  const mountedAtRef = useRef(typeof performance !== 'undefined' ? performance.now() : Date.now());
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const [, setAppearanceRevision] = useState(0);
  const [, setAnimationRevision] = useState(0);
  const [appState, setAppState] = useState<AppStateStatus>(AppState.currentState);
  const isDashboardFocused = useIsFocused();
  const systemReducedMotion = useReducedMotion();
  const isDriving = appearanceStore.resolveEffectiveTheme(null) === 'driving';
  const policy = resolveTerrainCommandInteractionPolicy(isDriving);
  const motionAllowed = !systemReducedMotion &&
    ecsAnimationSettings.enabled &&
    !policy.reducedMotion &&
    isDashboardFocused &&
    appState === 'active';
  const initialMotionAllowedRef = useRef(motionAllowed);
  const latestProgressRef = useRef(snapshot.currentProgressDistanceMiles);
  latestProgressRef.current = snapshot.currentProgressDistanceMiles;
  const [range, setRange] = useState<TerrainCommandRange>('next_5_mi');
  const [autoFollow, setAutoFollow] = useState(true);
  const [selectedPoint, setSelectedPoint] = useState<TerrainProfilePoint | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<TerrainRiskReferenceEvent | null>(null);
  const [recommendationOpen, setRecommendationOpen] = useState(false);
  const progressStateRef = useRef<TerrainVisualProgressState>({
    acceptedDistanceMiles: snapshot.currentProgressDistanceMiles,
    acceptedAtMs: null,
  });
  const [visualProgressDistanceMiles, setVisualProgressDistanceMiles] = useState(
    snapshot.currentProgressDistanceMiles,
  );
  const profileKey = `${snapshot.routeGeometryFingerprint ?? snapshot.routeId ?? 'none'}:${range}`;
  const revealKey = useMemo(
    () => motionAllowed && snapshot.expandedProfile.length >= 2 && consumeTerrainProfileReveal(profileKey)
      ? profileKey
      : null,
    [motionAllowed, profileKey, snapshot.expandedProfile.length],
  );
  const visible = useMemo(
    () => buildTerrainCommandVisibleProfileFromPoints(
      snapshot.expandedProfile,
      range,
      visualProgressDistanceMiles,
    ),
    [
      range,
      snapshot.expandedProfile,
      visualProgressDistanceMiles,
    ],
  );
  const selectedRouteDistance = selectedPoint
    ? selectedPoint.distanceMiles + visible.startDistanceMiles
    : selectedEvent?.distanceMiles ?? snapshot.currentProgressDistanceMiles;
  const selectedSegment = useMemo(
    () => selectTerrainCommandRiskSegment(snapshot.riskSegments, selectedRouteDistance ?? null),
    [selectedRouteDistance, snapshot.riskSegments],
  );
  const localSelectedRange = selectedSegment ? {
    startDistanceMiles: Math.max(0, selectedSegment.startDistanceMiles - visible.startDistanceMiles),
    endDistanceMiles: Math.max(0, selectedSegment.endDistanceMiles - visible.startDistanceMiles),
  } : null;
  const referenceEvents = useMemo(
    () => buildTerrainRiskReferenceEvents({
      profile: visible.profile,
      totalDistanceMiles: visible.spanMiles,
      completedDistanceMiles: Math.max(
        0,
        (snapshot.currentProgressDistanceMiles ?? 0) - visible.startDistanceMiles,
      ),
      includePassed: true,
    }),
    [snapshot.currentProgressDistanceMiles, visible],
  );
  const displayedEvents = policy.emphasizeOnlyNextEvent ? referenceEvents.slice(0, 1) : referenceEvents;
  const riskCandidateKey = snapshot.nextTerrainEvent
    ? `${profileKey}:${snapshot.nextTerrainEvent.id}:${snapshot.nextTerrainEvent.riskLevel}`
    : null;
  const riskPulseKey = useMemo(() => {
    const eligible = shouldAnimateTerrainRiskPulse({
      profileKey,
      riskKey: riskCandidateKey,
      freshness: snapshot.source.freshness,
      state: snapshot.state,
      alreadyAnimatedKey: null,
      motionAllowed,
    });
    return eligible && riskCandidateKey && consumeTerrainRiskPulse(riskCandidateKey)
      ? riskCandidateKey
      : null;
  }, [
    motionAllowed,
    profileKey,
    riskCandidateKey,
    snapshot.source.freshness,
    snapshot.state,
  ]);
  const expansionOpacity = useSharedValue(motionAllowed ? 0 : 1);
  const recommendationOpacity = useSharedValue(1);
  const recommendationMaterialKey = [
    snapshot.posture,
    snapshot.recommendation.status,
    ...snapshot.recommendation.reasonCodes,
  ].join(':');
  const recommendationStyle = useAnimatedStyle(() => ({ opacity: recommendationOpacity.value }));
  const expansionStyle = useAnimatedStyle(() => ({
    opacity: expansionOpacity.value,
    transform: [{ scale: 0.99 + expansionOpacity.value * 0.01 }],
  }));
  const canShowOnMap = Boolean(
    onShowOnMap &&
    snapshot.routeId &&
    selectedRouteDistance != null &&
    routeProgress?.routePoints?.length &&
    (snapshot.state === 'ready' || snapshot.state === 'partial' || snapshot.state === 'stale'),
  );

  useEffect(
    () => appearanceStore.onChange(() => setAppearanceRevision((revision) => revision + 1)),
    [],
  );
  useEffect(
    () => ecsAnimationSettings.onChange(() => setAnimationRevision((revision) => revision + 1)),
    [],
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', setAppState);
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    incrementTerrainMotionDiagnostic('expansions');
    const committedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordTerrainExpansionLatency(committedAt - mountedAtRef.current);
    expansionOpacity.value = initialMotionAllowedRef.current
      ? withTiming(1, {
          duration: ECS_MOTION.dashboardFadeIn,
          easing: Easing.out(Easing.cubic),
        })
      : 1;
    return () => {
      incrementTerrainMotionDiagnostic('collapses');
    };
  }, [expansionOpacity]);
  useEffect(() => {
    const now = Date.now();
    const force = progressStateRef.current.acceptedDistanceMiles == null ||
      snapshot.currentProgressDistanceMiles == null;
    const decision = resolveTerrainVisualProgressUpdate(
      progressStateRef.current,
      snapshot.currentProgressDistanceMiles,
      now,
      force,
    );
    if (!decision.accepted) {
      incrementTerrainMotionDiagnostic('coalescedProgressUpdates');
      return;
    }
    progressStateRef.current = decision;
    incrementTerrainMotionDiagnostic('progressUpdates');
    setVisualProgressDistanceMiles(decision.acceptedDistanceMiles);
  }, [snapshot.currentProgressDistanceMiles]);
  useEffect(() => {
    recommendationOpacity.value = motionAllowed
      ? withTiming(0.72, { duration: 90 }, () => {
          recommendationOpacity.value = withTiming(1, { duration: 180 });
        })
      : 1;
  }, [motionAllowed, recommendationMaterialKey, recommendationOpacity]);

  useEffect(() => {
    setSelectedPoint(null);
    setSelectedEvent(null);
    setAutoFollow(true);
    progressStateRef.current = {
      acceptedDistanceMiles: latestProgressRef.current,
      acceptedAtMs: Date.now(),
    };
    setVisualProgressDistanceMiles(latestProgressRef.current);
  }, [snapshot.routeGeometryFingerprint, snapshot.routeId]);

  useEffect(() => {
    if (policy.autoFollowForced) setAutoFollow(true);
  }, [policy.autoFollowForced]);

  const handleProbeChange = useCallback((point: TerrainProfilePoint | null) => {
    if (!policy.scrubbingEnabled) return;
    setSelectedPoint(point);
    setSelectedEvent(null);
    setAutoFollow(false);
  }, [policy.scrubbingEnabled]);

  const handleEventPress = useCallback((event: TerrainRiskReferenceEvent) => {
    if (!policy.scrubbingEnabled) return;
    setSelectedEvent({
      ...event,
      distanceMiles: event.distanceMiles + visible.startDistanceMiles,
    });
    setSelectedPoint(null);
    setAutoFollow(false);
  }, [policy.scrubbingEnabled, visible.startDistanceMiles]);

  const handleShowOnMap = useCallback(() => {
    if (!canShowOnMap || !onShowOnMap || !snapshot.routeId || selectedRouteDistance == null) return;
    const coordinate = projectTerrainInspectionCoordinate(
      routeProgress?.routePoints ?? [],
      selectedRouteDistance,
    );
    onShowOnMap({
      routeId: snapshot.routeId,
      routeGeometryFingerprint: snapshot.routeGeometryFingerprint,
      distanceMiles: selectedRouteDistance,
      segmentId: selectedSegment?.id ?? null,
      coordinate,
    });
  }, [
    canShowOnMap,
    onShowOnMap,
    routeProgress?.routePoints,
    selectedRouteDistance,
    selectedSegment?.id,
    snapshot.routeGeometryFingerprint,
    snapshot.routeId,
  ]);
  const handleClose = useCallback(() => {
    if (!onClose) return;
    if (!motionAllowed) {
      onClose();
      return;
    }
    expansionOpacity.value = withTiming(
      0,
      {
        duration: ECS_MOTION.dashboardFadeOut,
        easing: Easing.in(Easing.quad),
      },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [expansionOpacity, motionAllowed, onClose]);

  const stateMessage = snapshot.state === 'idle'
    ? 'No active route'
    : snapshot.state === 'loading'
      ? 'Terrain analysis loading'
      : snapshot.state === 'error'
        ? 'Terrain analysis error'
        : snapshot.expandedProfile.length < 2
          ? 'Route elevation unavailable'
          : null;

  return (
    <Animated.View style={[styles.animatedRoot, expansionStyle]}>
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.root, isLandscape && styles.rootLandscape]}
      testID="terrain-intelligence-command"
    >
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>TERRAIN INTELLIGENCE COMMAND</Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {snapshot.routeName ?? stateMessage ?? 'Route analysis unavailable'}
          </Text>
          <Text style={styles.sourceLine} numberOfLines={1}>{sourceSummary(snapshot)}</Text>
        </View>
        <View style={styles.headerActions}>
          <SourceTruthInspectorTrigger
            sources={snapshot.sourceTruth}
            dependencies={['Terrain posture', 'Elevation profile', 'Grade ahead', 'Route risk segments']}
            label="SOURCE"
            testID="terrain-command-source-inspector"
          />
          {onClose ? (
            <TouchableOpacity
              onPress={handleClose}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel="Collapse Terrain Intelligence Command"
              testID="terrain-command-collapse"
            >
              <Ionicons name="contract-outline" size={18} color={TACTICAL.amber} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <View style={styles.primaryMetrics}>
        <Metric label="CURRENT ELEVATION" value={fieldValue(snapshot.currentElevation.value, 'ft')} />
        <Metric label="GRADE AHEAD" value={fieldValue(snapshot.gradeAhead.value, '%')} />
        <Metric
          label="PREDICTIVE SIDE SLOPE"
          value={snapshot.predictiveSideSlope.supported
            ? fieldValue(snapshot.predictiveSideSlope.value, snapshot.predictiveSideSlope.unit)
            : 'UNKNOWN'}
        />
      </View>

      <View style={styles.rangeRow}>
        <Text style={styles.rangeLabel}>VISIBLE {visible.label}</Text>
        <View style={styles.rangeButtons}>
          {RANGE_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option.id}
              disabled={!policy.rangeControlsEnabled}
              onPress={() => setRange(option.id)}
              style={[
                styles.rangeButton,
                range === option.id && styles.rangeButtonActive,
                !policy.rangeControlsEnabled && styles.controlDisabled,
              ]}
              accessibilityState={{ selected: range === option.id, disabled: !policy.rangeControlsEnabled }}
              testID={`terrain-command-range-${option.id}`}
            >
              <Text style={styles.rangeButtonText}>{option.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={[styles.graphPanel, isLandscape && styles.graphPanelLandscape]}>
        {stateMessage ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>{stateMessage.toUpperCase()}</Text>
            <Text style={styles.emptyDetail}>
              {snapshot.missingDataReasons[0]?.replace(/_/g, ' ') ?? 'No supported elevation profile is available.'}
            </Text>
          </View>
        ) : (
          <TerrainRiskSideProfile
            profile={visible.profile}
            totalDistanceMiles={Math.max(visible.spanMiles, 0.1)}
            unit="mi"
            completedDistanceMiles={Math.max(
              0,
              (visualProgressDistanceMiles ?? 0) - visible.startDistanceMiles,
            )}
            transparentBackground
            interactive={policy.scrubbingEnabled}
            probeDistanceMiles={selectedPoint?.distanceMiles ?? null}
            onProbePointChange={handleProbeChange}
            selectedDistanceRange={localSelectedRange}
            referenceEvents={displayedEvents}
            selectedReferenceEvent={selectedEvent}
            onReferencePointPress={handleEventPress}
            animationEnabled={motionAllowed}
            profileAnimationKey={revealKey}
            riskPulseKey={riskPulseKey}
          />
        )}
      </View>

      <View style={styles.controlRow}>
        <TouchableOpacity
          onPress={() => !policy.autoFollowForced && setAutoFollow((current) => !current)}
          style={[styles.followButton, autoFollow && styles.followButtonActive]}
          accessibilityState={{ checked: autoFollow, disabled: policy.autoFollowForced }}
          testID="terrain-command-auto-follow"
        >
          <Ionicons name="locate-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.followText}>AUTO FOLLOW {autoFollow ? 'ON' : 'OFF'}</Text>
        </TouchableOpacity>
        <Text style={styles.driverState}>
          {isDriving ? 'DRIVER-SAFE • SCRUB LOCKED' : 'STATIONARY INSPECTION'}
        </Text>
        <TouchableOpacity
          onPress={handleShowOnMap}
          disabled={!canShowOnMap}
          style={styles.mapButton}
          testID="terrain-command-show-on-map"
        >
          <Text style={styles.mapButtonText}>SHOW ON MAP</Text>
          <Ionicons name="map-outline" size={14} color={TACTICAL.amber} />
        </TouchableOpacity>
      </View>

      {selectedPoint || selectedEvent || selectedSegment ? (
        <View style={styles.inspection}>
          <Text style={styles.inspectionTitle}>SELECTED ROUTE INSPECTION</Text>
          <Text style={styles.inspectionValue}>
            {selectedRouteDistance?.toFixed(2)} MI • {fieldValue(selectedPoint?.elevationFeet ?? null, 'ft')} •{' '}
            {fieldValue(selectedPoint?.gradePercent ?? selectedSegment?.gradePercent ?? null, '%')} •{' '}
            {(selectedPoint?.riskLevel ?? selectedSegment?.riskLevel ?? selectedEvent?.riskLevel ?? 'unknown').toUpperCase()}
          </Text>
          <Text style={styles.inspectionSource}>
            {selectedSegment?.reasonCodes.length
              ? selectedSegment.reasonCodes.join(' • ').replace(/_/g, ' ').toUpperCase()
              : selectedEvent?.title ?? snapshot.source.label}
          </Text>
        </View>
      ) : null}

      <View style={styles.lowerMetrics}>
        <FieldCard label="SURFACE TYPE" field={snapshot.surfaceInformation} />
        <FieldCard label="ROUGHNESS INDEX" field={snapshot.roughness} />
        <FieldCard label="WATER CROSSING" field={snapshot.waterCrossingRisk} />
        <FieldCard label="CLEARANCE" field={snapshot.clearanceConcern} />
        <View style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>VEHICLE FIT CONFIDENCE</Text>
          <Text style={styles.fieldValue}>{snapshot.vehicleFit.confidence.toUpperCase()}</Text>
          <Text style={styles.fieldMeta} numberOfLines={2}>{snapshot.vehicleFit.sourceLabel}</Text>
        </View>
      </View>

      <Animated.View style={recommendationStyle}>
      <TouchableOpacity
        onPress={() => setRecommendationOpen((current) => !current)}
        style={styles.recommendation}
        testID="terrain-command-recommendation"
      >
        <View style={styles.recommendationPosture}>
          <Text style={styles.recommendationLabel}>TERRAIN POSTURE</Text>
          <Text style={styles.recommendationValue}>{snapshot.posture.toUpperCase()}</Text>
        </View>
        <View style={styles.recommendationCopy}>
          <Text style={styles.recommendationText} numberOfLines={recommendationOpen ? 4 : 2}>
            {snapshot.recommendation.text}
          </Text>
          <Text style={styles.recommendationMeta} numberOfLines={2}>
            {snapshot.nextTerrainEvent
              ? `${snapshot.nextTerrainEvent.label} • ${snapshot.nextTerrainEvent.distanceMiles.toFixed(1)} MI`
              : 'NO MATERIAL EVENT'}{' '}
            • {sourceSummary(snapshot)}
          </Text>
        </View>
        <Ionicons name={recommendationOpen ? 'chevron-up' : 'chevron-down'} size={16} color={TACTICAL.amber} />
      </TouchableOpacity>
      </Animated.View>
    </ScrollView>
    </Animated.View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function FieldCard({
  label,
  field,
}: {
  label: string;
  field: {
    value: unknown;
    unit: string | null;
    origin: string;
    confidence: string;
    supported: boolean;
    missingReason: string | null;
  };
}) {
  return (
    <View style={styles.fieldCard}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{fieldValue(field.value, field.unit)}</Text>
      <Text style={styles.fieldMeta} numberOfLines={2}>
        {field.supported
          ? `${field.origin} • ${field.confidence}`
          : field.missingReason?.replace(/_/g, ' ') ?? 'Unavailable'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  animatedRoot: { flex: 1 },
  root: { gap: 10, paddingBottom: 12 },
  rootLandscape: { gap: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: TACTICAL.amber, fontSize: 13, fontWeight: '900', letterSpacing: 1.5 },
  subtitle: { color: TACTICAL.text, fontSize: 12, fontWeight: '800', marginTop: 2 },
  sourceLine: { color: TACTICAL.textMuted, fontSize: 8, letterSpacing: 0.7, marginTop: 3 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 6 },
  primaryMetrics: { flexDirection: 'row', gap: 8 },
  metric: { flex: 1, minWidth: 0, borderWidth: 1, borderColor: TACTICAL.border, backgroundColor: TACTICAL.panel, padding: 8, borderRadius: 6 },
  metricLabel: { color: TACTICAL.textMuted, fontSize: 7, fontWeight: '800', letterSpacing: 0.6 },
  metricValue: { color: TACTICAL.text, fontSize: 15, fontWeight: '900', marginTop: 3 },
  rangeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  rangeLabel: { color: TACTICAL.textMuted, fontSize: 8, fontWeight: '800' },
  rangeButtons: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' },
  rangeButton: { borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 4, paddingHorizontal: 7, paddingVertical: 5 },
  rangeButtonActive: { borderColor: TACTICAL.amber, backgroundColor: TACTICAL.amber + '18' },
  rangeButtonText: { color: TACTICAL.text, fontSize: 7, fontWeight: '900' },
  controlDisabled: { opacity: 0.42 },
  graphPanel: { minHeight: 260, borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 8, overflow: 'hidden', backgroundColor: 'rgba(3,6,8,0.72)' },
  graphPanelLandscape: { minHeight: 210 },
  emptyState: { flex: 1, minHeight: 210, alignItems: 'center', justifyContent: 'center', padding: 20 },
  emptyTitle: { color: TACTICAL.text, fontSize: 13, fontWeight: '900', letterSpacing: 1 },
  emptyDetail: { color: TACTICAL.textMuted, fontSize: 10, marginTop: 6, textAlign: 'center' },
  controlRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  followButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 5, padding: 7 },
  followButtonActive: { borderColor: TACTICAL.amber },
  followText: { color: TACTICAL.text, fontSize: 8, fontWeight: '900' },
  driverState: { flex: 1, color: TACTICAL.textMuted, fontSize: 8, fontWeight: '800' },
  mapButton: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: TACTICAL.amber, borderRadius: 5, padding: 7 },
  mapButtonText: { color: TACTICAL.amber, fontSize: 8, fontWeight: '900' },
  inspection: { borderLeftWidth: 3, borderLeftColor: TACTICAL.amber, paddingHorizontal: 9, paddingVertical: 6, backgroundColor: TACTICAL.panel },
  inspectionTitle: { color: TACTICAL.textMuted, fontSize: 7, fontWeight: '800', letterSpacing: 0.7 },
  inspectionValue: { color: TACTICAL.text, fontSize: 10, fontWeight: '900', marginTop: 2 },
  inspectionSource: { color: TACTICAL.amber, fontSize: 8, marginTop: 2 },
  lowerMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  fieldCard: { flexGrow: 1, flexBasis: 135, minWidth: 120, borderWidth: 1, borderColor: TACTICAL.border, borderRadius: 6, backgroundColor: TACTICAL.panel, padding: 8 },
  fieldLabel: { color: TACTICAL.textMuted, fontSize: 7, fontWeight: '800' },
  fieldValue: { color: TACTICAL.text, fontSize: 11, fontWeight: '900', marginTop: 3 },
  fieldMeta: { color: TACTICAL.textMuted, fontSize: 7, marginTop: 3 },
  recommendation: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: TACTICAL.amber + '66', borderRadius: 7, backgroundColor: TACTICAL.amber + '10', padding: 10 },
  recommendationPosture: { minWidth: 90 },
  recommendationLabel: { color: TACTICAL.textMuted, fontSize: 7, fontWeight: '800' },
  recommendationValue: { color: ECS.warning, fontSize: 13, fontWeight: '900', marginTop: 2 },
  recommendationCopy: { flex: 1, minWidth: 0 },
  recommendationText: { color: TACTICAL.text, fontSize: 10, fontWeight: '700' },
  recommendationMeta: { color: TACTICAL.textMuted, fontSize: 7, marginTop: 3 },
});
