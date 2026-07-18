import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { useRouter } from 'expo-router';

import { ECSText } from '../ECSText';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import ECSOperationalAnnouncer from '../ECSOperationalAnnouncer';
import {
  ReadinessDecisionBadge,
  ReadinessAlertToast,
  TripIntentSelector,
} from '../readiness';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import {
  type ExpeditionReadinessAssessment,
  type ExpeditionReadinessCategory,
  type ExpeditionReadinessCategoryId,
  type ExpeditionReadinessInput,
  type ExpeditionTripIntent,
} from '../../lib/readiness/expeditionReadinessTypes';
import {
  scoreExpeditionWeakPoints,
  expeditionReadinessStore,
  buildReadinessVehicleInputFromFleetState,
  type ExpeditionReadinessSnapshot,
  type ExpeditionReadinessVehicleInput,
  type WeakPointAssessment,
  type WeakPointCandidate,
  type WeakPointSourceFact,
  type WeakPointSourceSystem,
  useCurrentExpeditionReadiness,
  useExpeditionReadinessState,
  useReadinessDecision,
} from '../../lib/readiness';
import {
  buildCommandBriefPresentation,
  exportCommandBriefPacket,
  type CommandBriefExportAction,
  type ECSCommandBriefPacketSource,
} from '../../lib/brief';
import { dispatchQueue } from '../../lib/dispatchQueueStore';
import { offlineExpeditionModeEngine } from '../../lib/offlineExpeditionModeEngine';
import { buildOfflineFailureDrillFromSystemProfiles } from '../../lib/offlineFailureDrillService';
import { buildOfflineFailureDrillEvidenceCaptureBundle } from '../../lib/offlineFailureDrillEvidenceCapture';
import {
  exportOfflineFailureDrillEvidenceCaptureBundle,
  type OfflineFailureDrillEvidenceExportAction,
} from '../../lib/offlineFailureDrillEvidenceExport';
import { navigateRouteSessionStore } from '../../lib/navigateRouteSessionStore';
import {
  getActiveVehicleState,
  subscribeActiveVehicleState,
} from '../../lib/fleet/activeVehicleState';
import { useApp } from '../../context/AppContext';
import { useConvoyCommandData } from '../dashboard/commandCenter';

type CommandBriefScreenProps = {
  embedded?: boolean;
  style?: StyleProp<ViewStyle>;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

type BriefAction = {
  id: string;
  label: string;
  detail: string;
  icon: React.ComponentProps<typeof ECSIcon>['name'];
  disabled?: boolean;
  disabledLabel?: string;
  onPress?: () => void;
};

function formatBriefMilesFromMeters(value: number | null | undefined, suffix = '') {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  const miles = value / 1609.344;
  return `${miles.toFixed(miles >= 10 ? 0 : 1)} mi${suffix}`;
}

function formatBriefDuration(seconds: number | null | undefined) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds < 0) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min remaining`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours} hr ${rem} min remaining` : `${hours} hr remaining`;
}

function routeSessionPointToBriefCoordinate(
  point: { lat: number; lng: number } | null | undefined,
  label: string,
  source = 'active_guidance',
) {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  return {
    label,
    latitude: point.lat,
    longitude: point.lng,
    source,
  };
}

const commandBriefFleetSurfaceStyle: ViewStyle = {
  backgroundColor: ECS_SURFACE.background.selected,
  borderColor: ECS_SURFACE.border.selected,
  borderWidth: 1,
  borderRadius: 8,
};

function useRouteSessionSnapshot() {
  return useSyncExternalStore(
    navigateRouteSessionStore.subscribe,
    navigateRouteSessionStore.getSnapshot,
    navigateRouteSessionStore.getSnapshot,
  );
}

let cachedVehicleReadinessSignature: string | null = null;
let cachedVehicleReadinessInput: ExpeditionReadinessVehicleInput | null = null;

function getCachedActiveVehicleReadinessInput(): ExpeditionReadinessVehicleInput | null {
  const vehicleState = getActiveVehicleState();
  if (!vehicleState.identity.hasVehicle) {
    cachedVehicleReadinessSignature = vehicleState.signature;
    cachedVehicleReadinessInput = null;
    return cachedVehicleReadinessInput;
  }
  if (cachedVehicleReadinessSignature === vehicleState.signature) {
    return cachedVehicleReadinessInput;
  }
  cachedVehicleReadinessSignature = vehicleState.signature;
  cachedVehicleReadinessInput = buildReadinessVehicleInputFromFleetState(vehicleState);
  return cachedVehicleReadinessInput;
}

function useActiveVehicleReadinessInput() {
  return useSyncExternalStore(
    subscribeActiveVehicleState,
    getCachedActiveVehicleReadinessInput,
    getCachedActiveVehicleReadinessInput,
  );
}

function getBriefModeLabel(hasRoute: boolean, lifecycle: string) {
  if (!hasRoute) return 'No active expedition brief';
  if (lifecycle === 'active' || lifecycle === 'arrived') return 'Active Expedition Brief';
  return 'Planning Brief';
}

function getBriefFreshnessCopy(assessment: ExpeditionReadinessAssessment | null) {
  if (!assessment) return 'Readiness sources have not been evaluated yet.';
  const records = Object.values(assessment.sourceFreshness);
  const missing = records.filter((record) => record.isMissing).length;
  const stale = records.filter((record) => record.isStale).length;
  const inferred = records.filter((record) => record.isInferred).length;
  if (missing === 0 && stale === 0 && inferred === 0) {
    return 'Source freshness is current for available readiness inputs.';
  }
  const parts = [
    missing > 0 ? `${missing} missing` : null,
    stale > 0 ? `${stale} stale` : null,
    inferred > 0 ? `${inferred} ECS-inferred` : null,
  ].filter(Boolean);
  return `Limited confidence: ${parts.join(', ')} readiness inputs.`;
}

function CommandBriefEmptyState({ onNavigate, onExplore }: { onNavigate: () => void; onExplore: () => void }) {
  return (
    <View style={[styles.emptyState, commandBriefFleetSurfaceStyle]}>
      <View style={styles.emptyIconFrame}>
        <ECSIcon name="document-text-outline" tier="navigation" tone="warning" />
      </View>
      <ECSText variant="sectionTitle" style={styles.emptyTitle}>
        No active expedition brief.
      </ECSText>
      <ECSText variant="body" style={styles.emptyCopy}>
        Select or build a route in Explore or Navigate to connect this brief to a trip. Missing operational data remains visible in the decision and Departure Audit.
      </ECSText>
      <View style={styles.emptyCtas}>
        <CommandBriefActionButton label="Open Navigate" icon="navigate-outline" onPress={onNavigate} />
        <CommandBriefActionButton label="Open Explore" icon="map-outline" onPress={onExplore} />
      </View>
    </View>
  );
}

function CommandBriefActionButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof ECSIcon>['name'];
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.ctaButton, pressed && styles.pressed]}
    >
      <ECSIcon name={icon} tier="compact" tone="warning" />
      <ECSText variant="chip" style={styles.ctaButtonText} numberOfLines={1}>
        {label}
      </ECSText>
    </Pressable>
  );
}

function DepartureAuditNarrative({
  paragraphs,
  sourceState,
}: {
  paragraphs: [string] | [string, string];
  sourceState: 'current' | 'limited' | 'unavailable';
}) {
  const sourceLabel = sourceState === 'current'
    ? 'Current sources'
    : sourceState === 'limited'
      ? 'Limited sources'
      : 'Assessment unavailable';
  return (
    <View style={[styles.departureAuditCard, commandBriefFleetSurfaceStyle]}>
      <View style={styles.sectionHeader}>
        <ECSText variant="cardTitle" style={styles.sectionTitle}>
          Departure Audit
        </ECSText>
        <ECSBadge
          label={sourceLabel}
          tone={sourceState === 'current' ? 'ready' : 'warning'}
          compact
        />
      </View>
      <View style={styles.departureAuditNarrative}>
        {paragraphs.map((paragraph, index) => (
          <ECSText
            key={`departure-audit-paragraph-${index}`}
            variant="body"
            style={styles.departureAuditParagraph}
          >
            {paragraph}
          </ECSText>
        ))}
      </View>
      <ECSText variant="helper" style={styles.departureAuditSourceLabel}>
        ECS Intelligence / deterministic readiness explanation
      </ECSText>
    </View>
  );
}

function weakPointFact(
  id: string,
  label: string,
  value: string | number | boolean | null | undefined,
  updatedAt?: string | null,
  sourceSystem: WeakPointSourceSystem = 'command_brief_adapter',
  fieldPath?: string,
): WeakPointSourceFact {
  return {
    id,
    factId: id,
    sourceSystem,
    fieldPath: fieldPath ?? `commandBrief.${id}`,
    label,
    value: value ?? null,
    updatedAt: updatedAt ?? null,
    observedAt: updatedAt ?? undefined,
    generatedAt: updatedAt ?? undefined,
    freshness: updatedAt ? 'fresh' : 'unavailable',
    confidence: 'inferred',
    sourceName: 'Command Brief readiness adapter',
    schemaVersion: 'weak-point-source-fact-v1',
  };
}

function categoryById(
  assessment: ExpeditionReadinessAssessment | null,
  id: ExpeditionReadinessCategoryId,
): ExpeditionReadinessCategory | null {
  return assessment?.categories.find((category) => category.id === id) ?? null;
}

function buildExpeditionReadinessSnapshotForWeakPoints({
  assessment,
  input,
  activeVehicle,
  routeSession,
  activeTripId,
  activeRouteId,
}: {
  assessment: ExpeditionReadinessAssessment | null;
  input: ExpeditionReadinessInput;
  activeVehicle: ExpeditionReadinessVehicleInput | null;
  routeSession: ReturnType<typeof useRouteSessionSnapshot>;
  activeTripId?: string | null;
  activeRouteId?: string | null;
}): ExpeditionReadinessSnapshot {
  const capturedAt = assessment?.updatedAt ?? input.capturedAt ?? routeSession.updatedAt ?? new Date().toISOString();
  const routeCategory = categoryById(assessment, 'route_risk');
  const campCategory = categoryById(assessment, 'camp_legality_confidence');
  const weatherCategory = categoryById(assessment, 'weather_window');
  const daylightCategory = categoryById(assessment, 'daylight_margin');
  const offlineCategory = categoryById(assessment, 'offline_preparedness');
  const fuelCategory = categoryById(assessment, 'fuel_range_margin');
  const powerCategory = categoryById(assessment, 'power_runtime');
  const recoveryCategory = categoryById(assessment, 'recovery_bailout_access');
  const vehicleCategory = categoryById(assessment, 'vehicle_fit');
  const convoyCategory = categoryById(assessment, 'communications_signal_confidence');
  const campCandidate = input.campCandidates?.[0] ?? null;
  const routeId = activeRouteId ?? routeSession.routeId ?? input.route?.routeId ?? 'none';
  const tripId = activeTripId ?? 'trip';
  const sourceFacts = [
    weakPointFact('route-confidence', 'Route confidence', input.route?.routeConfidence ?? routeCategory?.confidence ?? null, input.route?.updatedAt ?? routeCategory?.lastUpdatedAt ?? capturedAt, 'route_confidence', 'commandBrief.routeConfidence'),
    weakPointFact('fuel-margin', 'Fuel margin', input.fuel?.reserveMiles ?? input.fuel?.rangeRemainingMiles ?? input.fuel?.fuelPercent ?? null, input.fuel?.updatedAt ?? fuelCategory?.lastUpdatedAt ?? null, 'logistics', 'commandBrief.fuelMargin'),
    weakPointFact('water-margin', 'Water margin', activeVehicle?.waterCapacityGal ?? null, activeVehicle?.updatedAt ?? null, 'logistics', 'commandBrief.waterMargin'),
    weakPointFact('power-margin', 'Power margin', input.power?.runtimeHoursRemaining ?? input.power?.batteryPercent ?? null, input.power?.updatedAt ?? powerCategory?.lastUpdatedAt ?? null, 'logistics', 'commandBrief.powerMargin'),
    weakPointFact('payload-margin', 'Payload/GVWR', activeVehicle?.gvwrUsagePct ?? activeVehicle?.payloadRemainingLbs ?? null, activeVehicle?.updatedAt ?? vehicleCategory?.lastUpdatedAt ?? null, 'fleet', 'commandBrief.payloadGvwr'),
    weakPointFact('camp-access', 'Camp endpoint confidence', campCandidate?.legalAccessConfidence ?? campCategory?.confidence ?? null, campCandidate?.updatedAt ?? campCategory?.lastUpdatedAt ?? null, 'campops', 'commandBrief.campEndpointConfidence'),
    weakPointFact('offline-package', 'Offline readiness', input.offline?.packageStatus ?? offlineCategory?.status ?? null, input.offline?.updatedAt ?? offlineCategory?.lastUpdatedAt ?? null, 'offline_honesty', 'commandBrief.offlineReadiness'),
    weakPointFact('weather', 'Weather freshness', input.weather?.riskLevel ?? weatherCategory?.status ?? null, input.weather?.updatedAt ?? weatherCategory?.lastUpdatedAt ?? null, 'weather', 'commandBrief.weatherFreshness'),
    weakPointFact('daylight', 'Daylight margin', input.daylight?.minutesRemainingAtArrival ?? daylightCategory?.status ?? null, input.daylight?.updatedAt ?? daylightCategory?.lastUpdatedAt ?? null, 'daylight', 'commandBrief.daylight'),
    weakPointFact('recovery', 'Recovery/bailout access', input.recovery?.routeBailoutOptionCount ?? input.recovery?.nearestExitMiles ?? recoveryCategory?.status ?? null, input.recovery?.updatedAt ?? recoveryCategory?.lastUpdatedAt ?? null, 'recovery_bailout', 'commandBrief.recoveryBailoutAccess'),
    weakPointFact('convoy', 'Convoy state', convoyCategory?.status ?? null, convoyCategory?.lastUpdatedAt ?? capturedAt, 'convoy', 'commandBrief.convoyState'),
  ];

  return {
    snapshotId: `command-brief:${tripId}:${routeId}:${capturedAt}`,
    capturedAt,
    routeConfidence: input.route || routeCategory
      ? {
          confidence: input.route?.routeConfidence ?? routeCategory?.confidence ?? 'unknown',
          conditionState: input.route?.closureKnown ? 'known_risky' : routeCategory?.status === 'hold' ? 'unknown' : 'normal',
          knownClosure: input.route?.closureKnown ?? false,
          passabilityConfidence: input.route?.passabilityConfidence ?? routeCategory?.confidence ?? 'unknown',
          sourceFactIds: ['route-confidence'],
          updatedAt: input.route?.updatedAt ?? routeCategory?.lastUpdatedAt ?? capturedAt,
        }
      : null,
    fuelMargin: input.fuel
      ? {
          reserveMiles: input.fuel.reserveMiles ?? null,
          rangeRemainingMiles: input.fuel.rangeRemainingMiles ?? null,
          routeDistanceRemainingMiles: input.fuel.routeDistanceRemainingMiles ?? (routeSession.remainingDistanceM != null ? routeSession.remainingDistanceM / 1609.344 : null),
          fuelPercent: input.fuel.fuelPercent ?? null,
          sourceFactIds: ['fuel-margin'],
          updatedAt: input.fuel.updatedAt ?? fuelCategory?.lastUpdatedAt ?? capturedAt,
        }
      : null,
    waterMargin: activeVehicle?.waterCapacityGal != null
      ? {
          gallonsRemaining: activeVehicle.waterCapacityGal,
          requiredGallons: null,
          sourceFactIds: ['water-margin'],
          updatedAt: activeVehicle.updatedAt ?? capturedAt,
        }
      : null,
    powerMargin: input.power
      ? {
          runtimeHoursRemaining: input.power.runtimeHoursRemaining ?? null,
          requiredRuntimeHours: input.power.requiredRuntimeHours ?? null,
          batteryPercent: input.power.batteryPercent ?? null,
          dataFreshness: input.power.isStale ? 'stale' : input.power.updatedAt ? 'fresh' : 'unknown',
          sourceFactIds: ['power-margin'],
          updatedAt: input.power.updatedAt ?? powerCategory?.lastUpdatedAt ?? capturedAt,
        }
      : null,
    payloadGvwr: activeVehicle
      ? {
          gvwrUsagePct: activeVehicle.gvwrUsagePct ?? null,
          payloadRemainingLbs: activeVehicle.payloadRemainingLbs ?? null,
          confidence: activeVehicle.vehicleFitConfidence ?? vehicleCategory?.confidence ?? 'unknown',
          sourceFactIds: ['payload-margin'],
          updatedAt: activeVehicle.updatedAt ?? vehicleCategory?.lastUpdatedAt ?? capturedAt,
        }
      : null,
    campEndpointConfidence: campCandidate || campCategory
      ? {
          endpointId: campCandidate?.candidateId ?? campCandidate?.id ?? null,
          legalAccessConfidence: campCandidate?.legalAccessConfidence ?? campCategory?.confidence ?? 'unknown',
          accessConfidence: campCandidate?.vehicleAccessConfidence ?? campCandidate?.sourceConfidence ?? campCategory?.confidence ?? 'unknown',
          etaCreatesLateArrivalRisk: input.campDecisionClock?.mainRisk.toLowerCase().includes('late arrival')
            || input.daylight?.arrivalAfterDark === true
            || (typeof input.daylight?.minutesRemainingAtArrival === 'number' && input.daylight.minutesRemainingAtArrival < 30),
          sourceFactIds: ['camp-access'],
          updatedAt: campCandidate?.updatedAt ?? campCategory?.lastUpdatedAt ?? capturedAt,
        }
      : null,
    offlineReadiness: input.offline || offlineCategory
      ? {
          packageStatus: input.offline?.packageStatus ?? (offlineCategory?.status === 'ready' ? 'ready' : offlineCategory?.status === 'hold' ? 'missing' : 'partial'),
          routeMatched: input.offline?.routeDownloaded === true && input.offline?.mapTilesCachedForRoute === true,
          coverage: input.offline?.packageStatus === 'ready' ? 'complete' : input.offline?.packageStatus === 'missing' ? 'missing' : 'partial',
          freshness: input.offline?.isStale || input.offline?.currentRoutePackageFresh === false ? 'stale' : input.offline?.updatedAt ? 'fresh' : 'unknown',
          sourceFactIds: ['offline-package'],
          updatedAt: input.offline?.updatedAt ?? offlineCategory?.lastUpdatedAt ?? capturedAt,
        }
      : null,
    weatherFreshness: input.weather || weatherCategory
      ? {
          riskLevel: input.weather?.riskLevel ?? (weatherCategory?.status === 'hold' ? 'high' : weatherCategory?.status === 'caution' ? 'moderate' : 'low'),
          freshness: input.weather?.isStale ? 'stale' : input.weather?.updatedAt ? 'fresh' : weatherCategory ? 'unknown' : 'missing',
          severeAlertActive: input.weather?.severeAlertActive ?? false,
          sourceFactIds: ['weather'],
          updatedAt: input.weather?.updatedAt ?? weatherCategory?.lastUpdatedAt ?? capturedAt,
        }
      : null,
    daylight: input.daylight || daylightCategory
      ? {
          minutesRemainingAtArrival: input.daylight?.minutesRemainingAtArrival ?? null,
          arrivalAfterDark: input.daylight?.arrivalAfterDark ?? daylightCategory?.status === 'hold',
          sourceFactIds: ['daylight'],
          updatedAt: input.daylight?.updatedAt ?? daylightCategory?.lastUpdatedAt ?? capturedAt,
        }
      : null,
    recoveryBailoutAccess: input.recovery || recoveryCategory
      ? {
          bailoutRoutesAvailable: input.recovery?.bailoutRoutesAvailable ?? (recoveryCategory ? recoveryCategory.status !== 'hold' : null),
          routeBailoutOptionCount: input.recovery?.routeBailoutOptionCount ?? null,
          nearestExitMiles: input.recovery?.nearestExitMiles ?? null,
          recoveryAccessConfidence: input.recovery?.recoveryAccessConfidence ?? recoveryCategory?.confidence ?? 'unknown',
          sourceFactIds: ['recovery'],
          updatedAt: input.recovery?.updatedAt ?? recoveryCategory?.lastUpdatedAt ?? capturedAt,
        }
      : null,
    convoyState: convoyCategory
      ? {
          rosterReady: null,
          communicationsReady: convoyCategory.status !== 'hold',
          membersAccountedFor: null,
          sourceFactIds: ['convoy'],
          updatedAt: convoyCategory.lastUpdatedAt ?? capturedAt,
        }
      : null,
    sourceFacts,
  };
}

function WeakPointAnalyzerPanel({ assessment }: { assessment: WeakPointAssessment }) {
  const primary = assessment.mostFragileAssumption;
  const ranked = assessment.rankedWeakPoints.slice(0, 3);
  const maturityLabel = assessment.maturityLabel || 'Internal beta / restricted field-test';
  const completeDomains = assessment.snapshotCoverage.domains.filter((domain) => domain.status === 'complete').length;
  const coverageTotal = assessment.snapshotCoverage.domains.length;
  const completenessLabel = assessment.assessmentCompleteness.replace(/_/g, ' ');
  return (
    <View style={styles.weakPointAnalyzerCard}>
      <View style={styles.sectionHeader}>
        <View style={styles.weakPointAnalyzerTitleBlock}>
          <ECSText variant="cardTitle" style={styles.sectionTitle}>
            Weak Point Analyzer
          </ECSText>
          <ECSText variant="helper" style={styles.weakPointAnalyzerSubtitle} numberOfLines={2}>
            What breaks first?
          </ECSText>
        </View>
        <ECSBadge label={maturityLabel} tone="warning" compact />
      </View>
      <View style={styles.weakPointAnalyzerRows}>
        <WeakPointAnalyzerRow
          label="Primary weak point:"
          value={primary ? `${primary.label} (${primary.riskScore.toFixed(2)}/5)` : 'Unavailable from current snapshot.'}
        />
        <WeakPointAnalyzerRow
          label="Most severe consequence:"
          value={assessment.mostSevereConsequence?.consequenceStatement ?? 'No severe consequence ranked from current snapshot.'}
        />
        <WeakPointAnalyzerRow
          label="Easiest fix before departure:"
          value={assessment.easiestFixBeforeDeparture?.easiestPreDepartureFix ?? 'Add missing snapshot data before relying on ranking.'}
        />
        <WeakPointAnalyzerRow
          label="Monitor during travel:"
          value={assessment.monitorDuringTravel?.travelMonitorSignal ?? 'Monitor manually until ECS has snapshot data.'}
        />
        <WeakPointAnalyzerRow
          label="Assessment completeness:"
          value={`${completenessLabel}; ${completeDomains}/${coverageTotal} domains complete.`}
        />
        <WeakPointAnalyzerRow
          label="Provenance / trace:"
          value="Deterministic ECS ranking. Advisory only."
        />
      </View>
      <View style={styles.weakPointAnalyzerRankList}>
        {ranked.map((point) => (
          <View key={point.category} style={styles.weakPointAnalyzerRankItem}>
            <ECSText variant="chip" style={styles.weakPointAnalyzerRankLabel} numberOfLines={1}>
              {point.rank}. {point.label}
            </ECSText>
            <ECSText variant="helper" style={styles.weakPointAnalyzerRankScore} numberOfLines={1}>
              L{point.scoreComponents.likelihood} C{point.scoreComponents.consequence} U{point.scoreComponents.uncertainty} D{point.scoreComponents.dataGap}
            </ECSText>
          </View>
        ))}
      </View>
      {assessment.missingData.length ? (
        <ECSText variant="helper" style={styles.weakPointAnalyzerMissing} numberOfLines={3}>
          Missing data: {assessment.missingData.slice(0, 4).join(', ')}
        </ECSText>
      ) : null}
    </View>
  );
}

function WeakPointAnalyzerRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.weakPointAnalyzerRow}>
      <ECSText variant="chip" style={styles.weakPointAnalyzerLabel} numberOfLines={1}>
        {label}
      </ECSText>
      <ECSText variant="helper" style={styles.weakPointAnalyzerValue} numberOfLines={3}>
        {value}
      </ECSText>
    </View>
  );
}

function CommandBriefActionRow({ action }: { action: BriefAction }) {
  return (
    <Pressable
      disabled={action.disabled}
      onPress={action.onPress}
      accessibilityRole={action.disabled ? undefined : 'button'}
      accessibilityState={{ disabled: Boolean(action.disabled) }}
      style={({ pressed }) => [
        styles.actionRow,
        action.disabled && styles.actionRowDisabled,
        pressed && !action.disabled && styles.pressed,
      ]}
    >
      <ECSIcon name={action.icon} tier="action" tone={action.disabled ? 'info' : 'warning'} />
      <View style={styles.actionTextBlock}>
        <View style={styles.actionTitleRow}>
          <ECSText variant="body" style={styles.actionTitle} numberOfLines={1}>
            {action.label}
          </ECSText>
          {action.disabled && action.disabledLabel ? (
            <ECSBadge label={action.disabledLabel} tone="info" compact />
          ) : null}
        </View>
        <ECSText variant="helper" style={styles.actionDetail} numberOfLines={2}>
          {action.detail}
        </ECSText>
      </View>
      {!action.disabled ? <ECSIcon name="chevron-forward-outline" tier="compact" tone="info" /> : null}
    </Pressable>
  );
}

export default function CommandBriefScreen({
  embedded = false,
  style,
  contentContainerStyle,
}: CommandBriefScreenProps) {
  const router = useRouter();
  const { showToast } = useApp();
  const assessment = useCurrentExpeditionReadiness();
  const readinessState = useExpeditionReadinessState();
  const decision = useReadinessDecision();
  const routeSession = useRouteSessionSnapshot();
  const convoyCommandData = useConvoyCommandData();
  const activeVehicleReadiness = useActiveVehicleReadinessInput();
  const [briefExportAction, setBriefExportAction] = useState<CommandBriefExportAction | null>(null);
  const [briefExportMessage, setBriefExportMessage] = useState<string | null>(null);
  const [evidenceExportAction, setEvidenceExportAction] = useState<OfflineFailureDrillEvidenceExportAction | null>(null);

  useEffect(() => {
    void navigateRouteSessionStore.hydrateFromPersistence().then(() => {
      expeditionReadinessStore.recomputeReadiness({ immediate: true, reason: 'command_brief_mount' });
    });
  }, []);

  const presentation = useMemo(
    () => buildCommandBriefPresentation(assessment),
    [assessment],
  );
  const hasRoute = Boolean(
    readinessState.activeRouteId
    || routeSession.lifecycle !== 'inactive'
    || (assessment && !assessment.sourceFreshness.route.isMissing),
  );
  const modeLabel = getBriefModeLabel(
    hasRoute,
    readinessState.readinessMode === 'active' ? 'active' : routeSession.lifecycle,
  );
  const pushRoute = useCallback((route: string) => router.push(route as any), [router]);
  const handleTripIntentChange = useCallback((intent: ExpeditionTripIntent) => {
    expeditionReadinessStore.setTripIntent(intent);
  }, []);
  const weakPointSnapshot = useMemo(
    () => buildExpeditionReadinessSnapshotForWeakPoints({
      assessment,
      input: readinessState.inputPatch,
      activeVehicle: activeVehicleReadiness,
      routeSession,
      activeTripId: readinessState.activeTripId,
      activeRouteId: readinessState.activeRouteId,
    }),
    [
      activeVehicleReadiness,
      assessment,
      readinessState.activeRouteId,
      readinessState.activeTripId,
      readinessState.inputPatch,
      routeSession,
    ],
  );
  const weakPointAssessment = useMemo(
    () => scoreExpeditionWeakPoints(weakPointSnapshot),
    [weakPointSnapshot],
  );
  const briefExportContext = useMemo(() => {
    const hasActiveGuidance = routeSession.lifecycle === 'active' || routeSession.lifecycle === 'arrived';
    const hasPlannedRoute = routeSession.lifecycle === 'preview' || Boolean(readinessState.activeTripId);
    const hasConvoyContext = convoyCommandData.dataState !== 'setupNeeded' && convoyCommandData.convoySize > 1;
    const packetSource: ECSCommandBriefPacketSource = hasActiveGuidance
      ? 'active_guidance'
      : hasPlannedRoute
        ? 'planned_trip'
        : hasConvoyContext
          ? 'convoy'
          : 'manual';
    const firstRoutePoint = routeSession.routePoints[0] ?? null;
    const lastRoutePoint = routeSession.routePoints.length > 1
      ? routeSession.routePoints[routeSession.routePoints.length - 1]
      : null;
    const geometryStatus = routeSession.routePoints.length > 1
      ? 'full_geometry'
      : routeSession.routePoints.length === 1
        ? 'trailhead_only'
        : 'missing_geometry';
    const currentLocation = routeSession.currentLocation ?? routeSession.gpsSample ?? null;
    const routeSummary = [
      routeSession.routeSubtitle,
      routeSession.statusLabel,
      typeof routeSession.remainingDistanceM === 'number'
        ? `${(routeSession.remainingDistanceM / 1609.344).toFixed(1)} mi remaining`
        : null,
      typeof routeSession.progressPercent === 'number'
        ? `${Math.round(routeSession.progressPercent)}% progress`
        : null,
      routeSession.etaIso ? `ETA ${routeSession.etaIso}` : null,
    ].filter(Boolean).join(' / ');
    return {
      assessment,
      routeName: routeSession.routeTitle,
      routeSummary,
      packetSource,
      activeVehicle: activeVehicleReadiness,
      activeRouteId: readinessState.activeRouteId ?? routeSession.routeId,
      activeTripId: readinessState.activeTripId,
      routeGeometryStatus: geometryStatus,
      guidanceReady: routeSession.routePoints.length > 1 && routeSession.lifecycle !== 'inactive',
      startPoint: routeSessionPointToBriefCoordinate(firstRoutePoint, 'Route start / trailhead', packetSource),
      destinationPoint: routeSessionPointToBriefCoordinate(lastRoutePoint, 'Route endpoint', packetSource),
      currentGps: currentLocation
        ? {
          label: 'Last known GPS at packet generation',
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          accuracyMeters: currentLocation.accuracyM ?? null,
          source: 'active_guidance_location',
        }
        : null,
      currentProgressPercent: routeSession.progressPercent,
      remainingDistance: formatBriefMilesFromMeters(routeSession.remainingDistanceM, ' remaining'),
      remainingDuration: formatBriefDuration(routeSession.remainingDurationS),
      etaIso: routeSession.etaIso,
      routeDataRefreshedAt: routeSession.updatedAt,
      routePolylineSnapshot: routeSession.routePoints.length > 1
        ? `${routeSession.routePoints.length} route points (${firstRoutePoint?.lat.toFixed(5)}, ${firstRoutePoint?.lng.toFixed(5)} -> ${lastRoutePoint?.lat.toFixed(5)}, ${lastRoutePoint?.lng.toFixed(5)})`
        : null,
      totalPlannedDistance: routeSession.routeSubtitle && /\bmi\b/i.test(routeSession.routeSubtitle) && !/remaining/i.test(routeSession.routeSubtitle)
        ? routeSession.routeSubtitle
        : null,
      vehicleTelemetryRefreshedAt: activeVehicleReadiness?.updatedAt ?? null,
      convoyName: hasConvoyContext ? convoyCommandData.convoyName : null,
      convoyMemberCount: hasConvoyContext ? convoyCommandData.convoySize : null,
      plannedRegroupPoints: convoyCommandData.rallyPoint ? [convoyCommandData.rallyPoint] : [],
      checkInSchedule: hasConvoyContext
        ? convoyCommandData.regroupDistance
          ? `Regroup spacing: ${convoyCommandData.regroupDistance}`
          : convoyCommandData.channelLabel
        : null,
      checkInStatus: hasConvoyContext
        ? `${convoyCommandData.sourceLabel}: ${convoyCommandData.recommendationLabel}. ${convoyCommandData.recommendationReason}`
        : null,
      checkInExpectations: hasConvoyContext
        ? convoyCommandData.recommendationReason
        : null,
      weakPointAssessment,
    };
  }, [
    activeVehicleReadiness,
    assessment,
    convoyCommandData.channelLabel,
    convoyCommandData.convoyName,
    convoyCommandData.convoySize,
    convoyCommandData.dataState,
    convoyCommandData.rallyPoint,
    convoyCommandData.recommendationLabel,
    convoyCommandData.recommendationReason,
    convoyCommandData.regroupDistance,
    convoyCommandData.sourceLabel,
    readinessState.activeRouteId,
    readinessState.activeTripId,
    routeSession.currentLocation,
    routeSession.etaIso,
    routeSession.gpsSample,
    routeSession.lifecycle,
    routeSession.progressPercent,
    routeSession.remainingDurationS,
    routeSession.remainingDistanceM,
    routeSession.routeId,
    routeSession.routePoints,
    routeSession.routeSubtitle,
    routeSession.routeTitle,
    routeSession.statusLabel,
    routeSession.updatedAt,
    weakPointAssessment,
  ]);
  const handleBriefExport = useCallback(async (action: CommandBriefExportAction) => {
    if (briefExportAction) return;
    setBriefExportAction(action);
    setBriefExportMessage(null);
    try {
      const result = await exportCommandBriefPacket(briefExportContext, action);
      const message = result.ok
        ? result.message
        : `${result.message}${result.unavailableReason ? ` ${result.unavailableReason}` : ''}`;
      setBriefExportMessage(message);
      showToast(message);
    } catch (error) {
      const reason = error instanceof Error ? ` ${error.message}` : '';
      const message = `Command Brief packet export failed.${reason}`;
      setBriefExportMessage(message);
      showToast(message);
    } finally {
      setBriefExportAction(null);
    }
  }, [briefExportAction, briefExportContext, showToast]);
  const handleEvidenceCaptureExport = useCallback(async (action: OfflineFailureDrillEvidenceExportAction) => {
    if (evidenceExportAction) return;
    if (!assessment) {
      showToast('Readiness assessment is unavailable for evidence capture.');
      return;
    }
    setEvidenceExportAction(action);
    setBriefExportMessage(null);
    try {
      const platformOs = Platform.OS === 'android'
        ? 'android'
        : Platform.OS === 'ios'
          ? 'ios'
          : Platform.OS === 'web'
            ? 'web'
            : 'unknown';
      const profiles = offlineExpeditionModeEngine.getSystemProfiles();
      const connectivityState = offlineExpeditionModeEngine.getConnectivityState();
      const drillResult = buildOfflineFailureDrillFromSystemProfiles({
        now: assessment.updatedAt,
        connectivityState,
        profiles,
        dispatchQueue: {
          size: dispatchQueue.size,
          pendingCount: dispatchQueue.pendingCount,
          failedCount: dispatchQueue.failedCount,
        },
      });
      const bundle = buildOfflineFailureDrillEvidenceCaptureBundle({
        capturedAt: assessment.updatedAt,
        source: 'app_runtime_export',
        drillResult,
        readinessAssessment: assessment,
        platform: { os: platformOs },
        validationNotes: [
          'Exported from Command Brief with the current Departure Audit readiness metadata.',
        ],
      });
      const result = await exportOfflineFailureDrillEvidenceCaptureBundle(bundle, action);
      const message = result.ok
        ? result.message
        : `${result.message}${result.unavailableReason ? ` ${result.unavailableReason}` : ''}`;
      setBriefExportMessage(message);
      showToast(message);
    } catch (error) {
      const reason = error instanceof Error ? ` ${error.message}` : '';
      const message = `Offline evidence capture export failed.${reason}`;
      setBriefExportMessage(message);
      showToast(message);
    } finally {
      setEvidenceExportAction(null);
    }
  }, [assessment, evidenceExportAction, showToast]);
  const exportActions = useMemo<BriefAction[]>(() => ([
    {
      id: 'copy-command-brief',
      label: 'Copy packet',
      detail: 'Copy a grounded markdown Command Brief packet for notes, messages, or trip planning.',
      icon: 'copy-outline',
      disabled: briefExportAction !== null,
      disabledLabel: briefExportAction === 'copy' ? 'Copying' : briefExportAction ? 'Busy' : undefined,
      onPress: () => void handleBriefExport('copy'),
    },
    {
      id: 'share-command-brief',
      label: 'Share packet',
      detail: 'Open the device share sheet with the current PDF Command Brief packet.',
      icon: 'share-social-outline',
      disabled: briefExportAction !== null,
      disabledLabel: briefExportAction === 'share' ? 'Sharing' : briefExportAction ? 'Busy' : undefined,
      onPress: () => void handleBriefExport('share'),
    },
    {
      id: 'save-command-brief',
      label: 'Save locally',
      detail: 'Save a PDF Command Brief packet to local ECS documents when file storage is available.',
      icon: 'save-outline',
      disabled: briefExportAction !== null,
      disabledLabel: briefExportAction === 'save' ? 'Saving' : briefExportAction ? 'Busy' : undefined,
      onPress: () => void handleBriefExport('save'),
    },
    {
      id: 'share-offline-drill-evidence-capture',
      label: 'Share evidence JSON',
      detail: 'Export the current Offline Failure Drill and Departure Audit capture bundle.',
      icon: 'download-outline',
      disabled: briefExportAction !== null || evidenceExportAction !== null || !assessment,
      disabledLabel: evidenceExportAction === 'share' ? 'Sharing' : briefExportAction || evidenceExportAction ? 'Busy' : undefined,
      onPress: () => void handleEvidenceCaptureExport('share'),
    },
  ]), [assessment, briefExportAction, evidenceExportAction, handleBriefExport, handleEvidenceCaptureExport]);
  const staleSourceCount = assessment
    ? Object.values(assessment.sourceFreshness).filter((record) => record.isStale).length
    : 0;
  const sourceFreshnessAnnouncement = staleSourceCount > 0
    ? {
        id: `command-brief-stale:${staleSourceCount}`,
        kind: 'stale_data' as const,
        subject: 'Command Brief readiness',
        detail: getBriefFreshnessCopy(assessment),
      }
    : null;
  const exportErrorAnnouncement = briefExportMessage && /failed|unavailable/i.test(briefExportMessage)
    ? {
        id: `command-brief-export:${briefExportMessage}`,
        kind: 'error' as const,
        subject: 'Command Brief export',
        detail: briefExportMessage,
      }
    : null;

  return (
    <View style={[styles.root, embedded && styles.embeddedRoot, style]}>
      <ECSOperationalAnnouncer event={sourceFreshnessAnnouncement} announceInitial />
      <ECSOperationalAnnouncer event={exportErrorAnnouncement} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, embedded && styles.embeddedContent, contentContainerStyle]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <ECSText variant="statLabel" style={styles.eyebrow}>
            ECS Expedition Readiness
          </ECSText>
          <View style={styles.titleRow}>
            <View style={styles.titleBlock}>
              <ECSText variant="sectionTitle" style={styles.title} numberOfLines={1}>
                Command Brief
              </ECSText>
              <ECSText variant="helper" style={styles.modeLabel} numberOfLines={2}>
                {modeLabel}
                {routeSession.routeTitle ? ` / ${routeSession.routeTitle}` : ''}
              </ECSText>
            </View>
            {decision ? <ReadinessDecisionBadge status={decision.status} score={decision.score} /> : null}
          </View>
        </View>

        <TripIntentSelector
          value={assessment?.tripIntent ?? readinessState.tripIntent}
          source={assessment?.tripIntentSource ?? readinessState.tripIntentSource}
          onChange={handleTripIntentChange}
          compact
          fitAllIntents
          style={commandBriefFleetSurfaceStyle}
          intentChipStyle={commandBriefFleetSurfaceStyle}
        />

        {!hasRoute ? (
          <CommandBriefEmptyState
            onNavigate={() => pushRoute('/navigate')}
            onExplore={() => pushRoute('/discover')}
          />
        ) : null}

        <View style={styles.sectionStack}>
          {hasRoute ? <WeakPointAnalyzerPanel assessment={weakPointAssessment} /> : null}

          <View style={[styles.decisionCard, commandBriefFleetSurfaceStyle]}>
            <View style={styles.sectionHeader}>
              <ECSText variant="cardTitle" style={styles.sectionTitle}>
                Go / Caution / Hold Decision
              </ECSText>
              <ECSBadge
                label={presentation.decision.label}
                tone={presentation.decision.status === 'ready' ? 'ready' : presentation.decision.status === 'caution' ? 'warning' : 'unavailable'}
                compact
              />
            </View>
            <ECSText variant="body" style={styles.decisionCopy}>
              {presentation.decision.meaning}
            </ECSText>
          </View>

          <DepartureAuditNarrative
            paragraphs={presentation.departureAudit.paragraphs}
            sourceState={presentation.departureAudit.sourceState}
          />


          <View style={[styles.exportCard, commandBriefFleetSurfaceStyle]}>
            <View style={styles.sectionHeader}>
              <ECSText variant="cardTitle" style={styles.sectionTitle}>
                Share Packet
              </ECSText>
              <ECSBadge label="PDF" tone="info" compact />
            </View>
            <ECSText variant="helper" style={styles.exportCopy} numberOfLines={3}>
              Generate a PDF Command Brief packet from the current readiness assessment. Copy uses a markdown summary; unavailable sections are marked limited confidence.
            </ECSText>
            <View style={styles.actionList}>
              {exportActions.map((action) => (
                <CommandBriefActionRow key={action.id} action={action} />
              ))}
            </View>
            {briefExportMessage ? (
              <ECSText variant="helper" style={styles.exportStatus} numberOfLines={2}>
                {briefExportMessage}
              </ECSText>
            ) : null}
          </View>
        </View>
      </ScrollView>
      {!embedded ? (
        <ReadinessAlertToast
          onOpenCommandBrief={() => undefined}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    backgroundColor: ECS.bgPrimary,
  },
  embeddedRoot: {
    backgroundColor: 'transparent',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    padding: 14,
    paddingBottom: 24,
    gap: 12,
  },
  embeddedContent: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 18,
  },
  header: {
    gap: 8,
    paddingHorizontal: 2,
  },
  eyebrow: {
    color: ECS.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  } as TextStyle,
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    color: ECS.text,
    fontSize: 24,
    lineHeight: 29,
    includeFontPadding: false,
  } as TextStyle,
  modeLabel: {
    color: ECS.muted,
    marginTop: 3,
    lineHeight: 16,
  } as TextStyle,
  emptyState: {
    alignItems: 'flex-start',
    gap: 12,
    padding: 16,
  },
  emptyIconFrame: {
    width: 42,
    height: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ECS.accentSoft,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
  },
  emptyTitle: {
    color: ECS.text,
    fontSize: 18,
    lineHeight: 23,
    includeFontPadding: false,
  } as TextStyle,
  emptyCopy: {
    color: ECS.muted,
    lineHeight: 18,
  } as TextStyle,
  emptyCtas: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  ctaButton: {
    minHeight: 38,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  ctaButtonText: {
    color: ECS.text,
  } as TextStyle,
  pressed: {
    opacity: 0.78,
  },
  sectionStack: {
    gap: 12,
  },
  holdBlockers: {
    padding: 14,
    gap: 10,
  },
  decisionCard: {
    padding: 14,
    gap: 12,
  },
  departureAuditCard: {
    padding: 14,
    gap: 12,
  },
  departureAuditNarrative: {
    gap: 10,
  },
  departureAuditParagraph: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 19,
  } as TextStyle,
  departureAuditSourceLabel: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  campDecisionClockCard: {
    padding: 14,
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  campDecisionClockLines: {
    gap: 7,
  },
  campDecisionClockLine: {
    color: ECS.text,
    lineHeight: 17,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  } as TextStyle,
  campDecisionClockRisk: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  campDecisionClockWarnings: {
    gap: 6,
  },
  campDecisionClockWarningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
  },
  campDecisionClockWarningText: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  weakPointAnalyzerCard: {
    padding: 14,
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  weakPointAnalyzerTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  weakPointAnalyzerSubtitle: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  weakPointAnalyzerRows: {
    gap: 8,
  },
  weakPointAnalyzerRow: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  weakPointAnalyzerLabel: {
    color: ECS.text,
    lineHeight: 15,
  } as TextStyle,
  weakPointAnalyzerValue: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  weakPointAnalyzerRankList: {
    gap: 7,
  },
  weakPointAnalyzerRankItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  weakPointAnalyzerRankLabel: {
    flex: 1,
    minWidth: 0,
    color: ECS.text,
  } as TextStyle,
  weakPointAnalyzerRankScore: {
    color: ECS.muted,
    flexShrink: 0,
  } as TextStyle,
  weakPointAnalyzerMissing: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  preferenceCard: {
    padding: 12,
    gap: 9,
  },
  preferenceEffectRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  preferenceEffectCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  preferenceEffectTitle: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 17,
  } as TextStyle,
  preferenceEffectSummary: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  decisionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  decisionCopyBlock: {
    flex: 1,
    minWidth: 0,
    gap: 7,
  },
  decisionCopy: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 18,
  } as TextStyle,
  confidenceCopy: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  section: {
    padding: 14,
    gap: 8,
  },
  collapsedSection: {
    gap: 0,
  },
  collapsibleHeader: {
    minHeight: 34,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0,
  },
  collapsibleHeaderMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0,
  },
  sectionTitle: {
    flex: 1,
    color: ECS.text,
    includeFontPadding: false,
  } as TextStyle,
  sectionRows: {
    gap: 0,
  },
  sectionEmpty: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  campCandidateList: {
    gap: 8,
  },
  campCandidateRow: {
    gap: 7,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  campCandidateTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    minWidth: 0,
  },
  campCandidateLabel: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.accentSoft,
  },
  campCandidateLabelText: {
    color: ECS.accent,
    includeFontPadding: false,
  } as TextStyle,
  campCandidateText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  campCandidateTitle: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 17,
    includeFontPadding: false,
  } as TextStyle,
  campCandidateMeta: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  campCandidateReason: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  campMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  campMetricText: {
    color: ECS.muted,
    lineHeight: 15,
    minWidth: 132,
  } as TextStyle,
  campCandidateCaution: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  vehicleHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  vehicleHeroCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  vehicleName: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 17,
    includeFontPadding: false,
  } as TextStyle,
  vehicleMeta: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  vehicleBriefGrid: {
    gap: 8,
  },
  vehicleBriefList: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  vehicleBriefListTitle: {
    color: ECS.accent,
    includeFontPadding: false,
  } as TextStyle,
  vehicleBriefListItem: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  vehicleBriefListEmpty: {
    opacity: 0.78,
  },
  loadoutConsequencePanel: {
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  loadoutConsequenceHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  loadoutConsequenceTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  loadoutConsequenceTitle: {
    color: ECS.accent,
    includeFontPadding: false,
  } as TextStyle,
  loadoutConsequenceSubtitle: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  loadoutConsequenceMetricRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  loadoutConsequenceMetric: {
    flexGrow: 1,
    flexBasis: 120,
    gap: 2,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  loadoutConsequenceMetricLabel: {
    color: ECS.accent,
    includeFontPadding: false,
  } as TextStyle,
  loadoutConsequenceMetricValue: {
    color: ECS.text,
    lineHeight: 15,
    fontWeight: '800',
  } as TextStyle,
  loadoutConsequenceRisk: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  loadoutConsequenceFooter: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  recoveryGrid: {
    gap: 8,
  },
  recoveryMetric: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  recoveryMetricLabel: {
    color: ECS.accent,
    includeFontPadding: false,
  } as TextStyle,
  recoveryMetricValue: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  recoveryMetricMono: {
    color: ECS.text,
    fontWeight: '900',
  } as TextStyle,
  recoveryInferredNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  recoveryInferredText: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  recoveryPrepList: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  powerBriefGrid: {
    gap: 8,
  },
  dataNotice: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  dataNoticeText: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  exportCard: {
    padding: 14,
    gap: 10,
  },
  exportCopy: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  exportStatus: {
    color: ECS.accent,
    lineHeight: 15,
  } as TextStyle,
  actionList: {
    gap: 8,
  },
  actionRow: {
    minHeight: 58,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  actionRowDisabled: {
    opacity: 0.62,
  },
  actionTextBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  actionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  actionTitle: {
    flex: 1,
    color: ECS.text,
    fontSize: 13,
    lineHeight: 17,
    includeFontPadding: false,
  } as TextStyle,
  actionDetail: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
});
