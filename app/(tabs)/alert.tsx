/**
 * Alert Tab — Unified Safety + Intel Command Center
 *
 * ══════════════════════════════════════════════════════════════
 * Merges the Safety and Intel tabs into a single unified
 * operational information center with a clean segment control.
 *
 * Structure:
 *   • Compact segment control at top (Safety | Intel)
 *   • Default view: Safety
 *   • Each subview renders its full existing content
 *   • ECS visual language maintained throughout
 *
 * Navigation slot freed for Discover tab.
 * ══════════════════════════════════════════════════════════════
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import TabErrorBoundary from '../../components/TabErrorBoundary';
import TopoBackground from '../../components/TopoBackground';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import { getShellHeaderTopPadding } from '../../lib/shellLayout';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';
import { useApp } from '../../context/AppContext';
import { useIsFocused } from '@react-navigation/native';
import { getActiveVehicleContext } from '../../lib/activeVehicleContext';
import { bluPowerAuthority } from '../../lib/BluPowerAuthority';
import { remotenessStore } from '../../lib/remotenessStore';
import { routeAnalysisEngine } from '../../lib/routeAnalysisEngine';
import { useThrottledGPS } from '../../lib/useThrottledGPS';
import { useOperationalWeather } from '../../lib/useOperationalWeather';
import useECSAIHook from '../../lib/ai/useECSAI';
import { selectAlertCommandState, type AlertCommandGroup } from '../../lib/alert/alertCommandSelectors';
import type { ECSPriorityLevel } from '../../lib/ai/priorityTypes';
import { ECS_READINESS_COPY } from '../../lib/ecsStateCopy';
import { EASING, MOTION } from '../../lib/motion';

// ── Import inner screen components ───────────────────────────
import { SafetyScreenInner } from './safety';
import { IntelScreenInner } from './intel';

type AlertSubView = 'safety' | 'intel';

// ── Segment Control Component ────────────────────────────────
function SegmentControl({
  activeView,
  onSwitch,
}: {
  activeView: AlertSubView;
  onSwitch: (view: AlertSubView) => void;
}) {
  const slideAnim = useRef(new Animated.Value(activeView === 'safety' ? 0 : 1)).current;

  useEffect(() => {
    slideAnim.stopAnimation();
    Animated.timing(slideAnim, {
      toValue: activeView === 'safety' ? 0 : 1,
      duration: MOTION.screenTransition,
      easing: EASING.standard,
      useNativeDriver: false,
    }).start();
  }, [activeView, slideAnim]);

  const indicatorLeft = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '50%'],
  });

  return (
    <View style={segStyles.container}>
      {/* Sliding indicator */}
      <Animated.View
        style={[
          segStyles.indicator,
          { left: indicatorLeft },
        ]}
      />

      {/* Safety button */}
      <TouchableOpacity
        style={segStyles.button}
        onPress={() => onSwitch('safety')}
        activeOpacity={0.7}
      >
        <Ionicons
          name="shield-checkmark-outline"
          size={13}
          color={activeView === 'safety' ? TACTICAL.amber : TACTICAL.textMuted}
        />
        <Text
          style={[
            segStyles.label,
            activeView === 'safety' && segStyles.labelActive,
          ]}
        >
          SAFETY
        </Text>
      </TouchableOpacity>

      {/* Intel button */}
      <TouchableOpacity
        style={segStyles.button}
        onPress={() => onSwitch('intel')}
        activeOpacity={0.7}
      >
        <Ionicons
          name="radio-outline"
          size={13}
          color={activeView === 'intel' ? TACTICAL.amber : TACTICAL.textMuted}
        />
        <Text
          style={[
            segStyles.label,
            activeView === 'intel' && segStyles.labelActive,
          ]}
        >
          INTEL
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const segStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 2,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.15)',
    overflow: 'hidden',
    position: 'relative',
    height: 38,
  },
  indicator: {
    position: 'absolute',
    top: 2,
    bottom: 2,
    width: '50%',
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.30)',
  },
  button: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    zIndex: 1,
  },
  label: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  labelActive: {
    color: TACTICAL.amber,
  },
});

// ── Alert Tab Inner ──────────────────────────────────────────
function toFiniteNumber(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function priorityToneColor(level: ECSPriorityLevel): string {
  switch (level) {
    case 'critical':
      return '#D96C50';
    case 'warning':
      return '#FFB300';
    case 'caution':
      return '#F3D28A';
    case 'advisory':
      return '#6FA8DC';
    default:
      return TACTICAL.textMuted;
  }
}

function priorityLabel(level: ECSPriorityLevel): string {
  switch (level) {
    case 'critical':
      return 'CRITICAL';
    case 'warning':
      return 'WARNING';
    case 'caution':
      return 'CAUTION';
    case 'advisory':
      return 'ADVISORY';
    default:
      return 'INFORMATIONAL';
  }
}

function AlertCommandSurface({
  lead,
  secondary,
  phaseLabel,
  operationalLabel,
}: {
  lead: AlertCommandGroup | null;
  secondary: AlertCommandGroup[];
  phaseLabel: string | null;
  operationalLabel: string | null;
}) {
  if (!lead && secondary.length === 0 && !operationalLabel) {
    return null;
  }

  const leadLevel = lead?.level ?? 'informational';
  const toneColor = priorityToneColor(leadLevel);

  return (
    <View style={styles.commandWrap}>
      <View
        style={[
          styles.commandCard,
          {
            borderColor: `${toneColor}45`,
            backgroundColor: `${toneColor}10`,
          },
        ]}
      >
        <View style={styles.commandHeaderRow}>
          <View
            style={[
              styles.commandSeverityBadge,
              {
                borderColor: `${toneColor}55`,
                backgroundColor: `${toneColor}16`,
              },
            ]}
          >
            <Text style={[styles.commandSeverityText, { color: toneColor }]}>
              {priorityLabel(leadLevel)}
            </Text>
          </View>
          <View style={styles.commandMetaRow}>
            {phaseLabel ? (
              <View style={styles.commandMetaBadge}>
                <Text style={styles.commandMetaText}>{phaseLabel}</Text>
              </View>
            ) : null}
            {operationalLabel ? (
              <View style={styles.commandMetaBadge}>
                <Text style={styles.commandMetaText}>{operationalLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <Text style={styles.commandTitle}>
          {lead?.title ?? 'Field safety surface calm'}
        </Text>
        <Text style={styles.commandSummary}>
          {lead?.summary ?? 'Safety protocols, comms, and offline tools remain ready.'}
        </Text>

        {lead?.confidenceLabel ? (
          <Text style={styles.commandConfidence}>{lead.confidenceLabel}</Text>
        ) : null}

        {secondary.length > 0 ? (
          <View style={styles.commandSecondaryRow}>
            {secondary.slice(0, 3).map((item) => (
              <View key={item.id} style={styles.commandSecondaryPill}>
                <Text style={styles.commandSecondaryText} numberOfLines={1}>
                  {item.title}
                  {item.count > 1 ? ` +${item.count - 1}` : ''}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AlertScreenInner() {
  const [activeView, setActiveView] = useState<AlertSubView>('safety');
  const { activeTrip, riskScore, waypoints, userSettings, isOnline } = useApp();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const headerTopPadding = getShellHeaderTopPadding(insets.top);
  const showDualPane = adaptive.alert.dualPane;
  const contentFrameStyle = {
    width: '100%' as const,
    alignSelf: 'center' as const,
    maxWidth: adaptive.contentMaxWidth,
    paddingHorizontal: adaptive.horizontalPadding,
  };

  const activeVehicleContext = getActiveVehicleContext();
  const gps = useThrottledGPS({
    enabled: isFocused,
    highAccuracy: true,
  });
  const alertWeather = useOperationalWeather({
    enabled: true,
    gps: {
      lat: gps.position?.latitude ?? null,
      lng: gps.position?.longitude ?? null,
      hasFix: gps.hasFix,
    },
  });
  const [powerState, setPowerState] = useState(() => bluPowerAuthority.getSnapshot());
  const [liveRemoteness, setLiveRemoteness] = useState(() => remotenessStore.get());
  const [liveRouteIntelligence, setLiveRouteIntelligence] = useState(() => routeAnalysisEngine.getCurrent());

  useEffect(() => {
    setPowerState(bluPowerAuthority.getSnapshot());
    const unsubscribe = bluPowerAuthority.subscribe((snapshot) => {
      setPowerState(snapshot);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const sync = () => setLiveRemoteness(remotenessStore.get());
    sync();
    const unsubscribe = remotenessStore.subscribe(sync);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const sync = () => setLiveRouteIntelligence(routeAnalysisEngine.getCurrent());
    sync();
    const unsubscribe = routeAnalysisEngine.subscribe(sync);
    return unsubscribe;
  }, []);

  const aiTelemetry = useMemo(() => ({
    ...(activeTrip as any ?? {}),
    fuelPercent:
      toFiniteNumber((activeTrip as any)?.fuelPercent) ??
      toFiniteNumber(activeVehicleContext.consumables?.fuel_percent_current),
    batteryPercent: toFiniteNumber(powerState.batteryPercent),
    payloadMargin:
      toFiniteNumber((activeTrip as any)?.payloadMargin) ??
      toFiniteNumber((activeVehicleContext.vehicle as any)?.payload_margin_lb),
    healthScore: toFiniteNumber((activeTrip as any)?.healthScore),
    checkEngine: Boolean((activeTrip as any)?.checkEngine),
    gpsStatus: gps.gpsStatus,
    gpsFixQuality: gps.fixQuality,
    gpsHasFix: gps.hasFix,
    gpsPermissionDenied: gps.permissionDenied,
    latitude: gps.position?.latitude ?? null,
    longitude: gps.position?.longitude ?? null,
    speedMph: gps.position?.speedMph ?? null,
    altitudeFt: gps.position?.altitudeFt ?? null,
  }), [
    activeTrip,
    activeVehicleContext.consumables?.fuel_percent_current,
    activeVehicleContext.vehicle,
    gps.fixQuality,
    gps.gpsStatus,
    gps.hasFix,
    gps.permissionDenied,
    gps.position?.altitudeFt,
    gps.position?.latitude,
    gps.position?.longitude,
    gps.position?.speedMph,
    powerState.batteryPercent,
  ]);

  const aiResources = useMemo(() => {
    const waterCapacity = toFiniteNumber(activeVehicleContext.resourceProfile.waterCapacityGal);
    const currentWater = toFiniteNumber(activeVehicleContext.consumables?.water_gal_current);
    const waterPercent =
      waterCapacity && waterCapacity > 0 && currentWater != null
        ? Math.max(0, Math.min(100, Math.round((currentWater / waterCapacity) * 100)))
        : null;

    return {
      ...(activeVehicleContext.vehicle as any ?? {}),
      fuelPercent: toFiniteNumber(activeVehicleContext.consumables?.fuel_percent_current),
      waterPercent,
      fuelTankCapacityGal: activeVehicleContext.resourceProfile.fuelTankCapacityGal,
      waterCapacityGal: activeVehicleContext.resourceProfile.waterCapacityGal,
      batteryCapacityWh: activeVehicleContext.resourceProfile.batteryUsableWh,
      tireSizeInches: activeVehicleContext.tiresLift?.tireSizeInches ?? null,
      suspensionLiftInches: activeVehicleContext.tiresLift?.suspensionLiftInches ?? null,
      accessoryInstalledCount: activeVehicleContext.accessoryInstalledCount,
      loadoutItemCount: activeVehicleContext.loadoutItemCount,
      loadoutWeightLbs: activeVehicleContext.loadoutTotalWeightLbs,
      powerPercent: toFiniteNumber(powerState.batteryPercent),
      powerFreshness: powerState.freshness,
      powerProviderLabel: powerState.providerLabel,
      powerDeviceLabel: powerState.deviceLabel,
      powerRuntimeMinutes: powerState.estimatedRuntimeMinutes,
      powerOutputWatts: powerState.outputWatts,
      powerInputWatts: powerState.inputWatts,
      powerSolarWatts: powerState.solarInputWatts,
      fuelRangeMiles: toFiniteNumber((activeTrip as any)?.fuelRangeMiles),
      connectivityLevel: !isOnline ? 'offline' : gps.hasFix ? 'live' : 'limited',
    };
  }, [
    activeTrip,
    activeVehicleContext.accessoryInstalledCount,
    activeVehicleContext.consumables?.fuel_percent_current,
    activeVehicleContext.consumables?.water_gal_current,
    activeVehicleContext.loadoutItemCount,
    activeVehicleContext.loadoutTotalWeightLbs,
    activeVehicleContext.resourceProfile.batteryUsableWh,
    activeVehicleContext.resourceProfile.fuelTankCapacityGal,
    activeVehicleContext.resourceProfile.waterCapacityGal,
    activeVehicleContext.tiresLift?.suspensionLiftInches,
    activeVehicleContext.tiresLift?.tireSizeInches,
    activeVehicleContext.vehicle,
    gps.hasFix,
    isOnline,
    powerState.batteryPercent,
    powerState.deviceLabel,
    powerState.estimatedRuntimeMinutes,
    powerState.freshness,
    powerState.inputWatts,
    powerState.outputWatts,
    powerState.providerLabel,
    powerState.solarInputWatts,
  ]);

  const routeIntelligence = useMemo(() => ({
    ...(liveRouteIntelligence as any ?? {}),
    riskScore:
      toFiniteNumber((liveRouteIntelligence as any)?.riskScore) ??
      toFiniteNumber(riskScore),
    waypoints,
    distanceRemainingMiles:
      toFiniteNumber((liveRouteIntelligence as any)?.distanceRemainingMiles) ??
      toFiniteNumber((activeTrip as any)?.distanceRemainingMiles) ??
      toFiniteNumber((activeTrip as any)?.stats?.distanceRemainingMiles),
    etaMinutes:
      toFiniteNumber((liveRouteIntelligence as any)?.etaMinutes) ??
      toFiniteNumber((activeTrip as any)?.etaMinutes),
    offRouteMiles: toFiniteNumber((liveRouteIntelligence as any)?.offRouteMiles),
    bailoutOptions:
      toFiniteNumber((liveRouteIntelligence as any)?.bailoutOptions) ??
      (Array.isArray(waypoints) ? waypoints.length : null),
    hazardAhead:
      typeof (liveRouteIntelligence as any)?.hazardAhead === 'boolean'
        ? Boolean((liveRouteIntelligence as any)?.hazardAhead)
        : typeof riskScore === 'number'
          ? riskScore >= 70
          : false,
    nextHazardDistanceMiles:
      toFiniteNumber((liveRouteIntelligence as any)?.nextHazardDistanceMiles),
  }), [activeTrip, liveRouteIntelligence, riskScore, waypoints]);

  const aiWeatherCorridor = useMemo(() => {
    const snapshot = alertWeather.snapshot;
    const alertCount = snapshot.alerts.length;
    const severeAlert = snapshot.alerts.find(
      (alert) => alert.severity === 'extreme' || alert.severity === 'warning',
    );
    const weatherSeverity =
      severeAlert?.severity === 'extreme' ? 3 :
      severeAlert?.severity === 'warning' ? 2 :
      alertCount > 0 ? 1 :
      snapshot.current.windSpeed != null && snapshot.current.windSpeed >= 40 ? 2 :
      snapshot.current.windSpeed != null && snapshot.current.windSpeed >= 25 ? 1 :
      snapshot.current.precipChance != null && snapshot.current.precipChance >= 75 ? 1 :
      0;

    const visibilityMiles = snapshot.current.visibility != null
      ? Number((snapshot.current.visibility / 1609.34).toFixed(1))
      : null;

    return {
      weatherSeverity,
      windMph: snapshot.current.windSpeed,
      visibilityMiles,
      precipitationIntensity: snapshot.current.precipChance,
      temperatureF: snapshot.current.temp,
      alertsCount: alertCount,
      source: isOnline ? 'live' : 'cache',
      staleness: isOnline ? 'fresh' : 'aging',
    };
  }, [alertWeather.snapshot, isOnline]);

  const aiRemoteness = useMemo(() => ({
    remotenessScore: toFiniteNumber((liveRemoteness as any)?.score),
    tier: (liveRemoteness as any)?.tier ?? (liveRemoteness as any)?.level ?? null,
    reason: (liveRemoteness as any)?.reason ?? null,
    connectivityState: (liveRemoteness as any)?.signals?.connectivityState ?? null,
    cacheReady: (liveRemoteness as any)?.signals?.cacheReady ?? false,
  }), [liveRemoteness]);

  const { aiState, alertView } = useECSAIHook({
    activeRun: activeTrip,
    vehicleConfig: activeVehicleContext.vehicle,
    telemetry: aiTelemetry,
    weatherCorridor: aiWeatherCorridor,
    routeIntelligence,
    remoteness: aiRemoteness,
    resources: aiResources,
    userPreferences: userSettings,
    powerAuthority: powerState,
    enabled: true,
    options: {
      enableWhenIdle: true,
      emitBriefWhenNoSignals: true,
    },
  });

  const alertCommandState = useMemo(() => (
    selectAlertCommandState({
      alertView,
      operationalState: aiState?.operationalState,
      operationalSummary: aiState?.operationalSummary,
      expeditionPhase: aiState?.expeditionPhase,
      expeditionPhaseLabel: aiState?.expeditionPhaseLabel,
      liveStatus: aiState?.liveStatus ?? null,
      isOnline,
      hasActiveExpedition: Boolean(activeTrip),
    })
  ), [
    activeTrip,
    aiState?.expeditionPhase,
    aiState?.expeditionPhaseLabel,
    aiState?.liveStatus,
    aiState?.operationalState,
    aiState?.operationalSummary,
    alertView,
    isOnline,
  ]);

  // Fade animation for smooth content transitions
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const transitionCycleRef = useRef(0);

  const handleSwitch = useCallback((view: AlertSubView) => {
    if (view === activeView) return;
    const transitionCycle = ++transitionCycleRef.current;
    fadeAnim.stopAnimation();

    // Fade out → switch → fade in
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: MOTION.screenFadeOut,
      easing: EASING.accelerate,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || transitionCycle !== transitionCycleRef.current) return;
      setActiveView(view);
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: MOTION.screenFadeIn,
        easing: EASING.decelerate,
        useNativeDriver: true,
      }).start();
    });
  }, [activeView, fadeAnim]);

  const fieldStatusTone = useMemo(() => {
    if (!isOnline) {
      return {
        label: ECS_READINESS_COPY.labels.offlineSupport,
        dot: TACTICAL.amber,
        color: TACTICAL.amber,
        background: 'rgba(196, 138, 44, 0.08)',
        border: 'rgba(196, 138, 44, 0.25)',
      };
    }
    if (alertWeather.snapshot.status.loading) {
      return {
        label: ECS_READINESS_COPY.labels.syncing,
        dot: '#6FA8DC',
        color: '#6FA8DC',
        background: 'rgba(111, 168, 220, 0.10)',
        border: 'rgba(111, 168, 220, 0.25)',
      };
    }
    if (!gps.hasFix) {
      return {
        label: ECS_READINESS_COPY.labels.limitedLive,
        dot: '#F3D28A',
        color: '#F3D28A',
        background: 'rgba(243, 210, 138, 0.10)',
        border: 'rgba(243, 210, 138, 0.24)',
      };
    }
    return {
      label: ECS_READINESS_COPY.labels.online,
      dot: '#4CAF50',
      color: '#4CAF50',
      background: 'rgba(76, 175, 80, 0.08)',
      border: 'rgba(76, 175, 80, 0.25)',
    };
  }, [alertWeather.snapshot.status.loading, gps.hasFix, isOnline]);

  return (
    <View style={styles.root}>
      <TopoBackground>
        <View style={styles.container}>
          {/* ══════════════════════════════════════════════════
              UNIFIED HEADER
              ══════════════════════════════════════════════════ */}
          <View style={[styles.header, contentFrameStyle, { paddingTop: headerTopPadding }]}>
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <Ionicons name="shield-checkmark" size={15} color={TACTICAL.amber} />
              </View>
              <View>
                <Text style={styles.headerMode}>OPERATIONAL CENTER</Text>
                <Text style={styles.headerTitle}>DISPATCH</Text>
              </View>
            </View>
            <View style={styles.headerRight}>
              <View
                style={[
                  styles.offlineBadge,
                  {
                    backgroundColor: fieldStatusTone.background,
                    borderColor: fieldStatusTone.border,
                  },
                ]}
              >
                <View style={[styles.offlineDot, { backgroundColor: fieldStatusTone.dot }]} />
                <Text style={[styles.offlineText, { color: fieldStatusTone.color }]}>
                  {fieldStatusTone.label}
                </Text>
              </View>
            </View>
          </View>
          <View style={contentFrameStyle}>
            <AlertCommandSurface
              lead={alertCommandState.lead}
              secondary={alertCommandState.secondary}
              phaseLabel={alertCommandState.phaseLabel}
              operationalLabel={alertCommandState.operationalLabel}
            />
          </View>

          {/* ══════════════════════════════════════════════════
              SEGMENT CONTROL — Safety | Intel
              ══════════════════════════════════════════════════ */}
          {!showDualPane ? <SegmentControl activeView={activeView} onSwitch={handleSwitch} /> : null}

          {/* ══════════════════════════════════════════════════
              CONTENT AREA — Renders active subview
              ══════════════════════════════════════════════════ */}
          {showDualPane ? (
            <View style={[styles.dualPaneFrame, contentFrameStyle]}>
              <View style={styles.dualPaneColumn}>
                <View style={styles.dualPaneHeader}>
                  <Ionicons name="shield-checkmark-outline" size={14} color={TACTICAL.danger} />
                  <Text style={[styles.dualPaneTitle, { color: TACTICAL.danger }]}>SAFETY</Text>
                </View>
                <View style={styles.dualPaneBody}>
                  <SafetyContent />
                </View>
              </View>
              <View style={styles.dualPaneColumn}>
                <View style={styles.dualPaneHeader}>
                  <Ionicons name="radio-outline" size={14} color={TACTICAL.amber} />
                  <Text style={[styles.dualPaneTitle, { color: TACTICAL.amber }]}>INTEL</Text>
                </View>
                <View style={styles.dualPaneBody}>
                  <IntelContent />
                </View>
              </View>
            </View>
          ) : (
            <Animated.View style={[styles.contentArea, { opacity: fadeAnim }]}>
              {activeView === 'safety' && <SafetyContent />}
              {activeView === 'intel' && <IntelContent />}
            </Animated.View>
          )}
        </View>
      </TopoBackground>
    </View>
  );
}

// ── Safety Content (embedded, no duplicate header/background) ─
function SafetyContent() {
  return (
    <View style={styles.subviewContainer}>
      <SafetyScreenInner embedded />
    </View>
  );
}

// ── Intel Content (embedded, no duplicate header/background) ──
function IntelContent() {
  return (
    <View style={styles.subviewContainer}>
      <IntelScreenInner embedded />
    </View>
  );
}


// ── Default Export ────────────────────────────────────────────
export default function AlertScreen() {
  return (
    <TabErrorBoundary tabName="DISPATCH">
      <AlertScreenInner />
    </TabErrorBoundary>
  );
}

// ── Styles ───────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ECS.bgPrimary,
  },
  container: {
    flex: 1,
  },

  // ── Header ────────────────────────────────────────────────
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    borderBottomColor: GOLD_RAIL.section,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(212,160,23,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerMode: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  offlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: 'rgba(76, 175, 80, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(76, 175, 80, 0.25)',
  },
  offlineDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#4CAF50',
  },
  offlineText: {
    fontSize: 7,
    fontWeight: '800',
    color: '#4CAF50',
    letterSpacing: 1,
  },
  commandWrap: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  commandCard: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  commandHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  commandSeverityBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  commandSeverityText: {
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.3,
  },
  commandMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
    flexShrink: 1,
  },
  commandMetaBadge: {
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.16)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  commandMetaText: {
    fontSize: 9,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
  },
  commandTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '800',
    color: TACTICAL.textPrimary,
    letterSpacing: 0.3,
  },
  commandSummary: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 18,
    color: TACTICAL.textSecondary,
  },
  commandConfidence: {
    marginTop: 8,
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.textMuted,
  },
  commandSecondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 10,
  },
  commandSecondaryPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.14)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  commandSecondaryText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textSecondary,
    letterSpacing: 0.4,
  },

  // ── Content Area ──────────────────────────────────────────
  contentArea: {
    flex: 1,
  },
  dualPaneFrame: {
    flex: 1,
    flexDirection: 'row',
    gap: 16,
    paddingBottom: 10,
  },
  dualPaneColumn: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.14)',
    borderRadius: 16,
    backgroundColor: 'rgba(8,12,15,0.42)',
    overflow: 'hidden',
  },
  dualPaneHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: GOLD_RAIL.subsectionWidth,
    borderBottomColor: 'rgba(212,160,23,0.12)',
  },
  dualPaneTitle: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
  },
  dualPaneBody: {
    flex: 1,
    minHeight: 0,
  },
  subviewContainer: {
    flex: 1,
  },
});




