import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  AppState,
  Platform,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
  type AppStateStatus,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';

import { ECSText } from '../ECSText';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import ECSOperationalAnnouncer from '../ECSOperationalAnnouncer';
import {
  DepartureAuditChecklist,
  ReadinessCategoryRow,
  ReadinessConcernList,
  ReadinessDecisionBadge,
  ReadinessFreshnessLine,
  ReadinessScoreRing,
  ReadinessAlertToast,
  TripIntentSelector,
  ReadinessEducationCard,
} from '../readiness';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import {
  EXPEDITION_READINESS_CATEGORY_IDS,
  type ExpeditionReadinessAssessment,
  type ExpeditionReadinessCategory,
  type ExpeditionReadinessCategoryId,
  type ExpeditionDepartureAuditItem,
  type ExpeditionReadinessInput,
  type ExpeditionTripIntent,
} from '../../lib/readiness/expeditionReadinessTypes';
import {
  buildOperationalSnapshotFromDepartureAudit,
  buildOperationalSnapshotFromReadiness,
  scoreExpeditionWeakPoints,
  expeditionReadinessStore,
  buildReadinessVehicleInputFromFleetState,
  isDepartureDeltaBriefFeatureEnabled,
  type ExpeditionReadinessSnapshot,
  type ExpeditionReadinessCampCandidateInput,
  type ExpeditionReadinessVehicleInput,
  type WeakPointAssessment,
  type WeakPointCandidate,
  type WeakPointSourceFact,
  type WeakPointSourceSystem,
  useCanStartExpedition,
  useCurrentExpeditionReadiness,
  useExpeditionReadinessState,
  useReadinessDecision,
} from '../../lib/readiness';
import { buildReadinessExplanationPayload } from '../../lib/ai/readinessExplanationGuardrails';
import {
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
import {
  campDecisionClockUnavailableDecision,
  isCampDecisionClockFeatureEnabled,
  type CampDecisionClockDecision,
} from '../../lib/campops/campDecisionClock';
import { navigateRouteSessionStore } from '../../lib/navigateRouteSessionStore';
import {
  getActiveVehicleState,
  subscribeActiveVehicleState,
} from '../../lib/fleet/activeVehicleState';
import {
  getLoadoutConsequencePreviewSnapshot,
  subscribeLoadoutConsequencePreview,
  type CommandBriefLoadoutConsequenceSummary,
} from '../../lib/fleet/loadoutConsequencePreview';
import { useApp } from '../../context/AppContext';
import { stageNavigationFlow } from '../../lib/ecsNavigationFlow';
import { useConvoyCommandData } from '../dashboard/commandCenter';
import { OperationalDeltaBriefCard } from './OperationalDeltaBriefCard';
import MissionCommandProposalAction from '../mission-command/MissionCommandProposalAction';
import { createDashboardMissionCommandProposal } from '../../lib/dispatchMissionCommandSourceAdapters';
import type { MissionCommandProposalBuildResult } from '../../lib/dispatchMissionCommandProposal';
import { buildReadinessAssessmentSourceTruthBinding } from '../../lib/sourceTruthAdapters';
import {
  isDispatchFeatureEnabled,
  resolveDispatchRolloutConfig,
} from '../../lib/dispatchRolloutConfig';

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

const SECTION_DEFINITION: {
  id: string;
  title: string;
  categoryIds: ExpeditionReadinessCategoryId[];
  emptyCopy: string;
}[] = [
  {
    id: 'route',
    title: 'Route Intelligence',
    categoryIds: ['route_risk'],
    emptyCopy: 'Route intelligence is unavailable until a route preview or active route is selected.',
  },
  {
    id: 'vehicle',
    title: 'Vehicle Fit',
    categoryIds: ['vehicle_fit'],
    emptyCopy: 'Vehicle fit is limited until an active vehicle profile is selected.',
  },
  {
    id: 'camp',
    title: 'CampOps / Camp Legality Confidence',
    categoryIds: ['camp_legality_confidence'],
    emptyCopy: 'Camp Legality Confidence is limited until CampOps candidates or access-confidence inputs are available.',
  },
  {
    id: 'weather',
    title: 'Weather + Daylight Window',
    categoryIds: ['weather_window', 'daylight_margin'],
    emptyCopy: 'Weather and daylight confidence are limited until forecast and arrival-window inputs are available.',
  },
  {
    id: 'offline',
    title: 'Offline Preparedness',
    categoryIds: ['offline_preparedness'],
    emptyCopy: 'Offline preparedness is limited until route package and cache state can be checked.',
  },
  {
    id: 'fuel-power-range',
    title: 'Fuel / Power / Range',
    categoryIds: ['fuel_range_margin', 'power_runtime'],
    emptyCopy: 'Fuel, power, and range margins are limited until vehicle and power inputs are available.',
  },
  {
    id: 'recovery',
    title: 'Recovery + Bailout Plan',
    categoryIds: ['recovery_bailout_access'],
    emptyCopy: 'Recovery and bailout confidence are limited until exits, recovery access, and gear inputs are available.',
  },
  {
    id: 'communications',
    title: 'Communications / Signal Confidence',
    categoryIds: ['communications_signal_confidence'],
    emptyCopy: 'Communications confidence is limited until signal, satellite, or check-in plan inputs are available.',
  },
];

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

function useLoadoutConsequencePreviewSnapshot() {
  return useSyncExternalStore(
    subscribeLoadoutConsequencePreview,
    getLoadoutConsequencePreviewSnapshot,
    getLoadoutConsequencePreviewSnapshot,
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

function getCategoryMap(assessment: ExpeditionReadinessAssessment | null) {
  const map = new Map<ExpeditionReadinessCategoryId, ExpeditionReadinessCategory>();
  assessment?.categories.forEach((category) => {
    map.set(category.id, category);
  });
  return map;
}

function getBriefModeLabel(hasRoute: boolean, lifecycle: string) {
  if (!hasRoute) return 'No active expedition brief';
  if (lifecycle === 'active' || lifecycle === 'arrived') return 'Active Expedition Brief';
  return 'Planning Brief';
}

function getDecisionCopy(
  assessment: ExpeditionReadinessAssessment | null,
  canStartReason: string,
  groundedSummary?: string | null,
) {
  if (!assessment) {
    return 'Hold: readiness has not been assessed yet. Select a route and active vehicle to generate deterministic trip readiness.';
  }
  if (groundedSummary) {
    return groundedSummary;
  }
  if (assessment.status === 'ready') {
    return 'Go: ECS deterministic checks show no blockers. Keep source freshness current before departure.';
  }
  if (assessment.status === 'caution') {
    return `Caution: ${canStartReason}`;
  }
  return `Hold: ${assessment.blockers[0]?.detail ?? assessment.explanation}`;
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
        Generate a Command Brief from Explore, Navigate, or CampOps. Readiness stays limited until route, vehicle, offline package, Camp Legality Confidence, weather, recovery, and communications inputs are available.
      </ECSText>
      <ReadinessEducationCard surface="commandBriefEmpty" compact style={commandBriefFleetSurfaceStyle} />
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

function CollapsibleBriefSection({
  title,
  badge,
  children,
  defaultExpanded = false,
}: {
  title: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View style={[styles.section, commandBriefFleetSurfaceStyle, !expanded && styles.collapsedSection]}>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        style={({ pressed }) => [styles.collapsibleHeader, pressed && styles.pressed]}
      >
        <ECSText variant="cardTitle" style={styles.sectionTitle} numberOfLines={2}>
          {title}
        </ECSText>
        <View style={styles.collapsibleHeaderMeta}>
          {expanded ? badge : null}
          <ECSIcon
            name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
            tier="compact"
            tone="info"
          />
        </View>
      </Pressable>
      {expanded ? children : null}
    </View>
  );
}

function CommandBriefSection({
  title,
  categories,
  emptyCopy,
}: {
  title: string;
  categories: ExpeditionReadinessCategory[];
  emptyCopy: string;
}) {
  const hasMissingInputs = categories.some((category) => category.missingInputs.length > 0);
  return (
    <CollapsibleBriefSection
      title={title}
      badge={hasMissingInputs ? <ECSBadge label="Limited confidence" tone="warning" compact /> : undefined}
    >
      {categories.length > 0 ? (
        <View style={styles.sectionRows}>
          {categories.map((category) => (
            <ReadinessCategoryRow key={category.id} category={category} initiallyExpanded={category.status === 'hold'} />
          ))}
        </View>
      ) : (
        <ECSText variant="helper" style={styles.sectionEmpty} numberOfLines={3}>
          {emptyCopy}
        </ECSText>
      )}
    </CollapsibleBriefSection>
  );
}

function DepartureAuditSection({
  items,
  onActionPress,
}: {
  items: ExpeditionDepartureAuditItem[];
  onActionPress: (item: ExpeditionDepartureAuditItem) => void;
}) {
  const incomplete = items.filter((item) => item.status !== 'complete').length;
  return (
    <View style={[styles.section, commandBriefFleetSurfaceStyle]}>
      <View style={styles.sectionHeader}>
        <ECSText variant="cardTitle" style={styles.sectionTitle} numberOfLines={2}>
          Departure Audit
        </ECSText>
        <ECSBadge
          label={incomplete === 0 ? 'Complete' : `${incomplete} to review`}
          tone={incomplete === 0 ? 'ready' : 'warning'}
          compact
        />
      </View>
      <ECSText variant="helper" style={styles.sectionEmpty} numberOfLines={2}>
        Offline-first checklist for the route package, vehicle, power, communications, and recovery plan before service drops.
      </ECSText>
      <DepartureAuditChecklist items={items} onActionPress={onActionPress} rowStyle={commandBriefFleetSurfaceStyle} />
    </View>
  );
}

function formatCampScore(candidate: ExpeditionReadinessCampCandidateInput): string {
  const score = candidate.overallCampScore ?? candidate.suitabilityScore;
  return typeof score === 'number' && Number.isFinite(score) ? `${Math.round(score)}/100` : 'Limited';
}

function formatCampConfidence(confidence: ExpeditionReadinessCampCandidateInput['legalAccessConfidence']): string {
  if (confidence === 'high') return 'High';
  if (confidence === 'medium') return 'Medium';
  if (confidence === 'low') return 'Low';
  return 'Limited';
}

function campCandidateMissingInputs(candidate: ExpeditionReadinessCampCandidateInput): string[] {
  return [
    !candidate.officialConfirmation ? 'official confirmation' : null,
    candidate.legalAccessConfidence === 'unknown' || !candidate.legalAccessConfidence ? 'Legal Access Confidence' : null,
    !candidate.vehicleAccessConfidence || candidate.vehicleAccessConfidence === 'unknown' ? 'Vehicle Access Confidence' : null,
    candidate.terrainSuitabilityScore == null ? 'Terrain Suitability' : null,
    !candidate.weatherExposureSummary ? 'weather exposure' : null,
    candidate.bailoutProximityMiles == null ? 'bailout proximity' : null,
  ].filter((item): item is string => Boolean(item));
}

function CampOpsBriefSection({
  candidates,
  category,
}: {
  candidates: ExpeditionReadinessCampCandidateInput[];
  category?: ExpeditionReadinessCategory;
}) {
  return (
    <CollapsibleBriefSection
      title="CampOps / Camp Legality Confidence"
      badge={(
        <ECSBadge
          label={category?.confidence === 'high' ? 'Confidence visible' : 'Limited confidence'}
          tone={category?.confidence === 'high' ? 'ready' : 'warning'}
          compact
        />
      )}
    >
      {category ? (
        <View style={styles.sectionRows}>
          <ReadinessCategoryRow category={category} initiallyExpanded={category.status === 'hold'} />
        </View>
      ) : null}
      {candidates.length > 0 ? (
        <View style={styles.campCandidateList}>
          {candidates.slice(0, 3).map((candidate, index) => {
            const missing = campCandidateMissingInputs(candidate);
            return (
              <View key={candidate.candidateId ?? candidate.id ?? index} style={styles.campCandidateRow}>
                <View style={styles.campCandidateTopRow}>
                  <View style={styles.campCandidateLabel}>
                    <ECSText variant="chip" style={styles.campCandidateLabelText}>
                      {candidate.label ?? String.fromCharCode(65 + index)}
                    </ECSText>
                  </View>
                  <View style={styles.campCandidateText}>
                    <ECSText variant="body" style={styles.campCandidateTitle} numberOfLines={1}>
                      {candidate.name ?? `Camp candidate ${index + 1}`}
                    </ECSText>
                    <ECSText variant="helper" style={styles.campCandidateMeta} numberOfLines={2}>
                      Camp Suitability {formatCampScore(candidate)} / Legal Access Confidence {formatCampConfidence(candidate.legalAccessConfidence)}
                    </ECSText>
                  </View>
                  {candidate.isECSInferred || candidate.isInferred ? (
                    <ECSBadge label="ECS-inferred" tone="info" compact />
                  ) : null}
                </View>
                <ECSText variant="helper" style={styles.campCandidateReason} numberOfLines={3}>
                  {candidate.whyECSPickedThis ?? 'CampOps ranked this candidate from available route, access, terrain, and source-confidence signals.'}
                </ECSText>
                <View style={styles.campMetricGrid}>
                  <ECSText variant="helper" style={styles.campMetricText} numberOfLines={1}>
                    Vehicle access: {formatCampConfidence(candidate.vehicleAccessConfidence)}
                  </ECSText>
                  <ECSText variant="helper" style={styles.campMetricText} numberOfLines={1}>
                    Terrain: {candidate.terrainSuitabilityScore == null ? 'Limited' : `${Math.round(candidate.terrainSuitabilityScore)}/100`}
                  </ECSText>
                  <ECSText variant="helper" style={styles.campMetricText} numberOfLines={1}>
                    Remoteness: {candidate.remotenessScore == null ? 'Limited' : `${Math.round(candidate.remotenessScore)}/100`}
                  </ECSText>
                  <ECSText variant="helper" style={styles.campMetricText} numberOfLines={1}>
                    Route distance: {candidate.routeDistance == null ? 'Limited' : `${candidate.routeDistance.toFixed(candidate.routeDistance < 10 ? 1 : 0)} mi`}
                  </ECSText>
                </View>
                <ECSText variant="helper" style={styles.campCandidateCaution} numberOfLines={2}>
                  {(candidate.cautionNotes?.[0] ?? (missing.length > 0 ? `Missing: ${missing.slice(0, 3).join(', ')}` : 'Review posted rules and current conditions before committing.'))}
                </ECSText>
              </View>
            );
          })}
        </View>
      ) : (
        <ECSText variant="helper" style={styles.sectionEmpty} numberOfLines={4}>
          No CampOps candidates are attached to readiness yet. Legal confidence limited; check official agency rules before treating any dispersed area as usable overnight.
        </ECSText>
      )}
    </CollapsibleBriefSection>
  );
}

function formatCampDecisionClockTime(value: string | undefined): string {
  if (!value) return 'Unavailable';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Unavailable';
  return new Date(parsed).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function campDecisionClockTone(
  decision: CampDecisionClockDecision,
): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (decision.state === 'continue') return 'ready';
  if (decision.state === 'divert_now') return 'warning';
  if (decision.state === 'emergency_only') return 'unavailable';
  return 'info';
}

function campDecisionClockDeadlineMs(value: string | undefined): number | null {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : null;
}

function nextCampDecisionClockDeadlineMs(
  decision: CampDecisionClockDecision | null,
  nowMs: number = Date.now(),
): number | null {
  const deadlines = [
    campDecisionClockDeadlineMs(decision?.continueUntil),
    campDecisionClockDeadlineMs(decision?.emergencyViableUntil),
  ].filter((value): value is number => value != null && value > nowMs);
  if (deadlines.length === 0) return null;
  return Math.min(...deadlines);
}

function useCampDecisionClockRuntimeNow(decision: CampDecisionClockDecision | null): number {
  const [nowMs, setNowMs] = useState(() => Date.now());
  const refreshNow = useCallback(() => setNowMs(Date.now()), []);

  useFocusEffect(
    useCallback(() => {
      refreshNow();
      return undefined;
    }, [refreshNow]),
  );

  useEffect(() => {
    const nextDeadlineMs = nextCampDecisionClockDeadlineMs(decision, nowMs);
    const refreshDelayMs = nextDeadlineMs == null
      ? 60_000
      : Math.min(Math.max(nextDeadlineMs - nowMs + 100, 250), 60_000);
    const timeout = setTimeout(refreshNow, refreshDelayMs);
    return () => clearTimeout(timeout);
  }, [decision, nowMs, refreshNow]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') refreshNow();
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [refreshNow]);

  return nowMs;
}

function CampDecisionClockBriefModule({
  decision,
}: {
  decision: CampDecisionClockDecision | null;
}) {
  const nowMs = useCampDecisionClockRuntimeNow(decision);
  const effectiveDecision = decision ?? campDecisionClockUnavailableDecision(
    'No Safe End Point result is attached to Command Brief. Continue window unavailable until CampOps provides backup endpoint timing.',
  );
  const continueCutoffMs = Date.parse(effectiveDecision.continueUntil ?? '');
  const emergencyViableUntilMs = Date.parse(effectiveDecision.emergencyViableUntil ?? '');
  const emergencyViabilityExpired =
    Number.isFinite(emergencyViableUntilMs) &&
    nowMs >= emergencyViableUntilMs;
  const runtimeUnavailable = Boolean(effectiveDecision.emergencyViableUntil) && emergencyViabilityExpired;
  const continueCutoffPassed =
    effectiveDecision.state === 'continue' &&
    Number.isFinite(continueCutoffMs) &&
    nowMs >= continueCutoffMs;
  const shouldDivertNow = !runtimeUnavailable && (effectiveDecision.state === 'divert_now' || continueCutoffPassed);
  const firstLine = runtimeUnavailable
    ? 'Camp decision clock unavailable.'
    : shouldDivertNow
    ? 'Divert to backup endpoint now.'
    : effectiveDecision.state === 'continue'
    ? `Continue to planned camp until: ${formatCampDecisionClockTime(effectiveDecision.continueUntil)}`
    : effectiveDecision.state === 'emergency_only'
        ? 'Emergency endpoint only. Continue window unavailable.'
        : 'Camp decision clock unavailable.';
  const backupLine = runtimeUnavailable
    ? 'Backup endpoint: unavailable'
    : effectiveDecision.state === 'continue' && !continueCutoffPassed
    ? 'After that, divert to backup endpoint'
    : effectiveDecision.backupEndpointId
      ? `Backup endpoint: ${effectiveDecision.backupEndpointId}`
      : 'Backup endpoint: unavailable';
  const emergencyLine = effectiveDecision.emergencyViableUntil && !emergencyViabilityExpired
    ? `Emergency endpoint remains viable until: ${formatCampDecisionClockTime(effectiveDecision.emergencyViableUntil)}`
    : effectiveDecision.emergencyViableUntil
      ? 'Emergency endpoint viability expired.'
      : 'Emergency endpoint: unavailable';

  return (
    <View style={styles.campDecisionClockCard}>
      <View style={styles.sectionHeader}>
        <ECSText variant="cardTitle" style={styles.sectionTitle}>
          Camp Decision Clock
        </ECSText>
        <ECSBadge label="Feature flagged" tone={campDecisionClockTone(effectiveDecision)} compact />
      </View>
      <View style={styles.campDecisionClockLines}>
        <ECSText variant="body" style={styles.campDecisionClockLine} numberOfLines={2}>
          {firstLine}
        </ECSText>
        <ECSText variant="helper" style={styles.campDecisionClockLine} numberOfLines={2}>
          {backupLine}
        </ECSText>
        <ECSText variant="helper" style={styles.campDecisionClockLine} numberOfLines={2}>
          {emergencyLine}
        </ECSText>
        <ECSText variant="helper" style={styles.campDecisionClockRisk} numberOfLines={3}>
          Main risk: {effectiveDecision.mainRisk}
        </ECSText>
      </View>
      {effectiveDecision.warnings.length > 0 ? (
        <View style={styles.campDecisionClockWarnings}>
          {effectiveDecision.warnings.slice(0, 3).map((warning, index) => (
            <View key={`camp-decision-clock-warning-${index}`} style={styles.campDecisionClockWarningRow}>
              <ECSIcon name="alert-circle-outline" tier="compact" tone="warning" />
              <ECSText variant="helper" style={styles.campDecisionClockWarningText} numberOfLines={3}>
                {warning}
              </ECSText>
            </View>
          ))}
        </View>
      ) : null}
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

function formatLoadoutConsequenceLbs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value).toLocaleString()} lb`;
}

function formatLoadoutConsequencePct(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value * 10) / 10}%`;
}

function loadoutConsequenceTone(status: CommandBriefLoadoutConsequenceSummary['status']): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (status === 'critical') return 'unavailable';
  if (status === 'caution' || status === 'watch') return 'warning';
  if (status === 'clear') return 'ready';
  return 'info';
}

function LoadoutConsequenceCommandBriefPanel({
  summary,
}: {
  summary: CommandBriefLoadoutConsequenceSummary;
}) {
  const sourceLabel = summary.source === 'committed_loadout'
    ? 'committed Fleet loadout'
    : summary.source === 'saved_loadout'
      ? 'saved Fleet loadout'
      : 'Fleet staged loadout preview';
  const mirrorStatus = summary.stale
    ? `Stale mirror: ${summary.invalidationReason ?? 'expired'}`
    : `Source: ${sourceLabel}`;
  return (
    <View style={styles.loadoutConsequencePanel}>
      <View style={styles.loadoutConsequenceHeader}>
        <View style={styles.loadoutConsequenceTitleBlock}>
          <ECSText variant="chip" style={styles.loadoutConsequenceTitle} numberOfLines={1}>
            Loadout Consequence Preview
          </ECSText>
          <ECSText variant="helper" style={styles.loadoutConsequenceSubtitle} numberOfLines={2}>
            Current user-facing extension / {mirrorStatus}.
          </ECSText>
        </View>
        <ECSBadge label={summary.status.toUpperCase()} tone={loadoutConsequenceTone(summary.status)} compact />
      </View>
      <View style={styles.loadoutConsequenceMetricRow}>
        <View style={styles.loadoutConsequenceMetric}>
          <ECSText variant="chip" style={styles.loadoutConsequenceMetricLabel} numberOfLines={1}>
            Payload after
          </ECSText>
          <ECSText variant="helper" style={styles.loadoutConsequenceMetricValue} numberOfLines={1}>
            {formatLoadoutConsequenceLbs(summary.payloadRemainingAfter)}
          </ECSText>
        </View>
        <View style={styles.loadoutConsequenceMetric}>
          <ECSText variant="chip" style={styles.loadoutConsequenceMetricLabel} numberOfLines={1}>
            GVWR use
          </ECSText>
          <ECSText variant="helper" style={styles.loadoutConsequenceMetricValue} numberOfLines={1}>
            {formatLoadoutConsequencePct(summary.gvwrPercentAfter)}
          </ECSText>
        </View>
        <View style={styles.loadoutConsequenceMetric}>
          <ECSText variant="chip" style={styles.loadoutConsequenceMetricLabel} numberOfLines={1}>
            Route fit
          </ECSText>
          <ECSText variant="helper" style={styles.loadoutConsequenceMetricValue} numberOfLines={1}>
            {summary.routeSuitability}
          </ECSText>
        </View>
      </View>
      <ECSText variant="helper" style={styles.loadoutConsequenceRisk} numberOfLines={2}>
        {summary.mainRisk}
      </ECSText>
      <ECSText variant="helper" style={styles.loadoutConsequenceFooter} numberOfLines={1}>
        {summary.suggestionCount} suggestions / {summary.warningCount} source warnings / last updated {new Date(summary.generatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </ECSText>
    </View>
  );
}

function VehicleFitBriefSection({
  vehicle,
  category,
  loadoutConsequenceSummary,
}: {
  vehicle: ExpeditionReadinessVehicleInput | null;
  category?: ExpeditionReadinessCategory;
  loadoutConsequenceSummary?: CommandBriefLoadoutConsequenceSummary | null;
}) {
  const strengths = vehicle?.keyStrengths ?? [];
  const concerns = vehicle?.keyConcerns ?? [];
  const missingSpecs = vehicle?.missingSpecs ?? [];
  const recommendations = vehicle?.recommendations ?? [];
  return (
    <CollapsibleBriefSection
      title="Vehicle Fit"
      badge={(
        <ECSBadge
          label={vehicle ? (category?.status === 'ready' ? 'Fit visible' : 'Review fit') : 'Limited confidence'}
          tone={vehicle && category?.status === 'ready' ? 'ready' : 'warning'}
          compact
        />
      )}
    >
      <View style={styles.vehicleHeroRow}>
        <ECSIcon name="car-sport-outline" tier="action" tone={vehicle ? 'warning' : 'info'} />
        <View style={styles.vehicleHeroCopy}>
          <ECSText variant="body" style={styles.vehicleName} numberOfLines={1}>
            {vehicle?.label ?? 'No active Fleet vehicle'}
          </ECSText>
          <ECSText variant="helper" style={styles.vehicleMeta} numberOfLines={2}>
            {vehicle
              ? [vehicle.classificationLabel, vehicle.drivetrain, vehicle.tireSizeInches ? `${vehicle.tireSizeInches} in tires` : null]
                  .filter(Boolean)
                  .join(' / ') || 'Vehicle specs are partially available.'
              : 'Select vehicle for personalized readiness.'}
          </ECSText>
        </View>
      </View>
      {category ? (
        <View style={styles.sectionRows}>
          <ReadinessCategoryRow category={category} initiallyExpanded={category.status === 'hold'} />
        </View>
      ) : null}
      {loadoutConsequenceSummary ? (
        <LoadoutConsequenceCommandBriefPanel summary={loadoutConsequenceSummary} />
      ) : null}
      <View style={styles.vehicleBriefGrid}>
        <VehicleBriefList title="Key strengths" items={strengths} emptyCopy={vehicle ? 'No material strengths confirmed yet.' : 'Select a vehicle to populate strengths.'} />
        <VehicleBriefList title="Key concerns" items={concerns} emptyCopy={vehicle ? 'No major concerns from available Fleet inputs.' : 'Vehicle-specific concerns unavailable.'} />
        <VehicleBriefList title="Missing specs" items={missingSpecs} emptyCopy="Core Fleet specs are present." />
        <VehicleBriefList title="Recommendations" items={recommendations} emptyCopy="No vehicle-specific recommendations." />
      </View>
    </CollapsibleBriefSection>
  );
}

function VehicleBriefList({
  title,
  items,
  emptyCopy,
}: {
  title: string;
  items: string[];
  emptyCopy: string;
}) {
  const visibleItems = items.length > 0 ? items.slice(0, 3) : [emptyCopy];
  return (
    <View style={styles.vehicleBriefList}>
      <ECSText variant="chip" style={styles.vehicleBriefListTitle} numberOfLines={1}>
        {title}
      </ECSText>
      {visibleItems.map((item, index) => (
        <ECSText
          key={`${title}-${index}`}
          variant="helper"
          style={[styles.vehicleBriefListItem, items.length === 0 && styles.vehicleBriefListEmpty]}
          numberOfLines={2}
        >
          {item}
        </ECSText>
      ))}
    </View>
  );
}

function RecoveryBriefSection({
  assessment,
  category,
  onOpenDispatch,
  buildMissionCommandProposal,
}: {
  assessment: ExpeditionReadinessAssessment | null;
  category?: ExpeditionReadinessCategory;
  onOpenDispatch: () => void;
  buildMissionCommandProposal?: () => MissionCommandProposalBuildResult;
}) {
  const recovery = assessment?.recoveryBrief;
  const coordinateText = recovery?.currentCoordinates
    ? `${recovery.currentCoordinates.latitude.toFixed(5)}, ${recovery.currentCoordinates.longitude.toFixed(5)}`
    : 'Current coordinates unavailable';

  return (
    <CollapsibleBriefSection
      title="Recovery + Bailout Plan"
      badge={(
        <ECSBadge
          label={category?.status === 'ready' ? 'Plan visible' : 'Limited confidence'}
          tone={category?.status === 'ready' ? 'ready' : 'warning'}
          compact
        />
      )}
    >
      {category ? (
        <View style={styles.sectionRows}>
          <ReadinessCategoryRow category={category} initiallyExpanded={category.status === 'hold'} />
        </View>
      ) : null}
      <View style={styles.recoveryGrid}>
        <RecoveryBriefMetric label="Nearest bailout" value={recovery?.nearestBailoutSummary ?? 'Nearest bailout is not confirmed.'} />
        <RecoveryBriefMetric label="Recovery difficulty" value={recovery?.recoveryDifficulty ?? 'unknown'} />
        <RecoveryBriefMetric label="Comms / signal" value={recovery?.communicationsSummary ?? 'Communications confidence is limited.'} />
        <RecoveryBriefMetric label="Coordinate packet" value={recovery?.emergencyCoordinatePacketSummary ?? 'Emergency coordinate packet is unavailable.'} />
        <RecoveryBriefMetric label="Current coordinates" value={coordinateText} mono={Boolean(recovery?.currentCoordinates)} />
        <RecoveryBriefMetric label="Official contact" value={recovery?.officialContactSummary ?? 'Official contact point is not confirmed. ECS does not invent official contacts.'} />
      </View>
      {recovery?.isECSInferred ? (
        <View style={styles.recoveryInferredNotice}>
          <ECSIcon name="information-circle-outline" tier="compact" tone="info" />
          <ECSText variant="helper" style={styles.recoveryInferredText} numberOfLines={2}>
            ECS-inferred recovery context. Verify bailout and official contact details before relying on them.
          </ECSText>
        </View>
      ) : null}
      <View style={styles.recoveryPrepList}>
        <ECSText variant="chip" style={styles.vehicleBriefListTitle} numberOfLines={1}>
          Recommended recovery prep
        </ECSText>
        {(recovery?.recommendedPrep?.length ? recovery.recommendedPrep : ['Review bailout options, communications, and recovery gear before departure.']).slice(0, 4).map((item, index) => (
          <ECSText key={`recovery-prep-${index}`} variant="helper" style={styles.vehicleBriefListItem} numberOfLines={2}>
            {item}
          </ECSText>
        ))}
      </View>
      {buildMissionCommandProposal ? (
        <MissionCommandProposalAction
          label="Coordinate Recovery"
          accessibilityLabel="Coordinate this recovery readiness context in Mission Command"
          buildProposal={buildMissionCommandProposal}
          grow
        />
      ) : (
        <CommandBriefActionButton label="Open Dispatch" icon="radio-outline" onPress={onOpenDispatch} />
      )}
    </CollapsibleBriefSection>
  );
}

function RecoveryBriefMetric({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={styles.recoveryMetric}>
      <ECSText variant="chip" style={styles.recoveryMetricLabel} numberOfLines={1}>
        {label}
      </ECSText>
      <ECSText variant="helper" style={[styles.recoveryMetricValue, mono && styles.recoveryMetricMono]} numberOfLines={3}>
        {value}
      </ECSText>
    </View>
  );
}

function FuelPowerRangeBriefSection({
  assessment,
  fuelCategory,
  powerCategory,
}: {
  assessment: ExpeditionReadinessAssessment | null;
  fuelCategory?: ExpeditionReadinessCategory;
  powerCategory?: ExpeditionReadinessCategory;
}) {
  const power = assessment?.powerBrief;
  return (
    <CollapsibleBriefSection
      title="Fuel / Power / Range"
      badge={(
        <ECSBadge
          label={power?.statusLabel ?? 'Unknown'}
          tone={power?.status === 'ready' ? 'ready' : power?.status === 'caution' ? 'warning' : 'info'}
          compact
        />
      )}
    >
      {fuelCategory || powerCategory ? (
        <View style={styles.sectionRows}>
          {fuelCategory ? <ReadinessCategoryRow category={fuelCategory} initiallyExpanded={fuelCategory.status === 'hold'} /> : null}
          {powerCategory ? <ReadinessCategoryRow category={powerCategory} initiallyExpanded={powerCategory.status === 'hold'} /> : null}
        </View>
      ) : null}
      <View style={styles.powerBriefGrid}>
        <RecoveryBriefMetric label="Power status" value={power?.sourceSummary ?? 'No power system connected.'} />
        <RecoveryBriefMetric label="Battery" value={power?.stateOfChargeSummary ?? 'State of charge unavailable.'} />
        <RecoveryBriefMetric label="Runtime" value={power?.runtimeSummary ?? 'Runtime unknown.'} />
        <RecoveryBriefMetric label="Power flow" value={power?.flowSummary ?? 'Power flow unavailable.'} />
        <RecoveryBriefMetric label="Solar" value={power?.solarSummary ?? 'Solar input unavailable.'} />
        <RecoveryBriefMetric label="Freshness" value={power?.freshnessSummary ?? 'Power data freshness: unknown.'} />
        <RecoveryBriefMetric label="Recommendation" value={power?.recommendation ?? 'Connect or update power only if powered loads matter.'} />
      </View>
      {!power?.connectedSourceAvailable && !power?.powerRelevantForTrip ? (
        <View style={styles.recoveryInferredNotice}>
          <ECSIcon name="battery-half-outline" tier="compact" tone="info" />
          <ECSText variant="helper" style={styles.recoveryInferredText} numberOfLines={2}>
            Not connected. ECS is not treating connected power hardware as required for this trip context.
          </ECSText>
        </View>
      ) : null}
    </CollapsibleBriefSection>
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
  const canStart = useCanStartExpedition();
  const routeSession = useRouteSessionSnapshot();
  const convoyCommandData = useConvoyCommandData();
  const activeVehicleReadiness = useActiveVehicleReadinessInput();
  const loadoutConsequencePreviewSnapshot = useLoadoutConsequencePreviewSnapshot();
  const loadoutConsequenceSummary = useMemo(() => {
    const summary = loadoutConsequencePreviewSnapshot.summary;
    if (!summary) return null;
    if (summary.stale) return null;
    if (activeVehicleReadiness?.vehicleId && summary.vehicleId !== activeVehicleReadiness.vehicleId) return null;
    return summary;
  }, [activeVehicleReadiness?.vehicleId, loadoutConsequencePreviewSnapshot.summary]);
  const [briefExportAction, setBriefExportAction] = useState<CommandBriefExportAction | null>(null);
  const [briefExportMessage, setBriefExportMessage] = useState<string | null>(null);
  const [evidenceExportAction, setEvidenceExportAction] = useState<OfflineFailureDrillEvidenceExportAction | null>(null);
  const missionCommandEnabled = useMemo(
    () => isDispatchFeatureEnabled(resolveDispatchRolloutConfig(), 'missionCommand'),
    [],
  );

  useEffect(() => {
    void navigateRouteSessionStore.hydrateFromPersistence().then(() => {
      expeditionReadinessStore.recomputeReadiness({ immediate: true, reason: 'command_brief_mount' });
    });
  }, []);

  const categoryMap = useMemo(() => getCategoryMap(assessment), [assessment]);
  const readinessExplanation = useMemo(
    () => assessment ? buildReadinessExplanationPayload(assessment) : null,
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
  const handleAuditAction = useCallback(
    (item: ExpeditionDepartureAuditItem) => {
      if (item.disabledActionReason) {
        setBriefExportMessage(item.disabledActionReason);
        showToast(item.disabledActionReason);
        return;
      }
      if (item.itemId === 'offline-map-package') {
        void stageNavigationFlow({
          source: 'dashboard',
          target: 'navigate',
          intent: 'prepare_offline_route_package',
          label: 'Prepare active route offline package',
          message: 'ECS is opening the active route offline package.',
          context: {
            sourceSurface: 'command_brief_departure_audit',
            actionItemId: item.itemId,
          },
        }).finally(() => {
          pushRoute('/navigate');
        });
        return;
      }
      if (item.actionTarget === '/safety?focus=emergency-comms&returnTo=command-brief') {
        pushRoute('/safety?focus=emergency-comms&returnTo=command-brief');
        return;
      }
      if (item.actionTarget) pushRoute(item.actionTarget);
    },
    [pushRoute, showToast],
  );
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
  const campCandidates = useMemo(
    () => (readinessState.inputPatch.campCandidates ?? []).slice(0, 5),
    [readinessState.inputPatch.campCandidates],
  );
  const campDecisionClock = readinessState.inputPatch.campDecisionClock ?? null;
  const buildRecoveryMissionCommandProposal = useCallback((): MissionCommandProposalBuildResult => {
    if (!assessment) {
      return {
        ok: false,
        safeCode: 'mission_command_proposal_readiness_missing',
        reason: 'Readiness must be assessed before coordinating recovery context.',
      };
    }
    const sourceTruth = buildReadinessAssessmentSourceTruthBinding(assessment).ref;
    return createDashboardMissionCommandProposal({
      sourceEntityId: `${readinessState.activeTripId ?? readinessState.activeRouteId ?? 'readiness'}:${assessment.updatedAt}`,
      expeditionId: readinessState.activeTripId,
      sourceSurface: 'ecs_brief',
      situation: assessment.status === 'hold' ? 'offline_readiness_blocker' : 'validated_advisory',
      title: 'Coordinate recovery readiness',
      summary: assessment.explanation,
      sourceTruth: [sourceTruth],
      action: 'create_command',
      command: {
        type: 'recovery',
        priority: assessment.status === 'hold' ? 'high' : 'normal',
        title: 'Review recovery readiness',
        instructions: assessment.recoveryBrief.recommendedPrep[0] ?? assessment.explanation,
      },
      facts: [
        { key: 'readiness_status', label: 'Readiness status', value: assessment.status },
        { key: 'readiness_confidence', label: 'Readiness confidence', value: assessment.confidence },
      ],
      operatorRequested: true,
      offline: offlineExpeditionModeEngine.isOffline(),
      returnRoute: '/dashboard',
    });
  }, [assessment, readinessState.activeRouteId, readinessState.activeTripId]);
  const buildReadinessMissionCommandProposal = useCallback((): MissionCommandProposalBuildResult => {
    if (!assessment) {
      return {
        ok: false,
        safeCode: 'mission_command_proposal_readiness_missing',
        reason: 'Readiness must be assessed before coordinating an ECS Brief situation.',
      };
    }
    const issue = assessment.blockers[0] ?? assessment.warnings[0] ?? null;
    const categoryId = issue?.categoryId ?? null;
    const situation = categoryId === 'vehicle_fit'
      ? 'vehicle_warning'
      : categoryId === 'weather_window'
        ? 'weather_warning'
        : categoryId === 'offline_preparedness'
          ? 'offline_readiness_blocker'
          : categoryId === 'camp_legality_confidence' || categoryId === 'daylight_margin'
            ? 'camp_deadline'
            : categoryId === 'fuel_range_margin' || categoryId === 'power_runtime'
              ? 'resource_warning'
              : 'validated_advisory';
    const commandType = situation === 'weather_warning'
      ? 'hazard'
      : situation === 'vehicle_warning' || situation === 'resource_warning'
        ? 'resource'
        : categoryId === 'route_risk' || situation === 'camp_deadline'
          ? 'route'
          : 'general';
    const sourceTruth = buildReadinessAssessmentSourceTruthBinding(assessment).ref;
    const issueSummary = issue?.detail ?? assessment.explanation;
    return createDashboardMissionCommandProposal({
      sourceEntityId: issue?.id ?? `${readinessState.activeTripId ?? readinessState.activeRouteId ?? 'readiness'}:${assessment.updatedAt}`,
      expeditionId: readinessState.activeTripId,
      sourceSurface: 'ecs_brief',
      situation,
      title: issue ? `Coordinate ${issue.label}` : 'Open Mission Command',
      summary: issueSummary,
      sourceTruth: [sourceTruth],
      action: issue ? 'create_command' : 'open_mission_command',
      command: issue ? {
        type: commandType,
        priority: issue.severity === 'blocker' ? 'high' : 'normal',
        title: issue.label,
        instructions: issue.detail,
      } : null,
      facts: [
        { key: 'readiness_status', label: 'Readiness status', value: assessment.status },
        { key: 'readiness_confidence', label: 'Readiness confidence', value: assessment.confidence },
        ...(categoryId ? [{ key: 'category', label: 'Readiness category', value: categoryId }] : []),
      ],
      operatorRequested: true,
      offline: offlineExpeditionModeEngine.isOffline(),
      returnRoute: '/dashboard',
    });
  }, [assessment, readinessState.activeRouteId, readinessState.activeTripId]);
  const campDecisionClockEnabled = isCampDecisionClockFeatureEnabled({
    campDecisionClock: readinessState.inputPatch.campDecisionClockFeatureEnabled ?? null,
  });
  const departureDeltaBriefEnabled = isDepartureDeltaBriefFeatureEnabled({
    departureDeltaBrief: readinessState.inputPatch.departureDeltaBriefFeatureEnabled ?? null,
  });
  const operationalDeltaResolvedInput = expeditionReadinessStore.getResolvedInput();
  const operationalDeltaSnapshot = buildOperationalSnapshotFromReadiness({
    assessment,
    input: {
      ...operationalDeltaResolvedInput,
      readinessMode: readinessState.readinessMode,
    },
    routeSession,
    activeVehicle: activeVehicleReadiness,
    convoy: convoyCommandData,
    expeditionId: readinessState.activeTripId,
    routeId: readinessState.activeRouteId ?? routeSession.routeId,
    capturedAt: assessment?.updatedAt ?? readinessState.lastAssessmentAt ?? routeSession.updatedAt,
    label: 'Current operational state',
  });
  const legacyOperationalDepartureBaseline = useMemo(
    () => buildOperationalSnapshotFromDepartureAudit(
      readinessState.inputPatch.previousDepartureAudit ?? null,
    ),
    [readinessState.inputPatch.previousDepartureAudit],
  );
  const missingCategories = assessment
    ? EXPEDITION_READINESS_CATEGORY_IDS.filter((id) => !categoryMap.has(id))
    : EXPEDITION_READINESS_CATEGORY_IDS;
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

        {assessment?.status === 'hold' ? (
          <View style={[styles.holdBlockers, commandBriefFleetSurfaceStyle]}>
            <View style={styles.sectionHeader}>
              <ECSText variant="cardTitle" style={styles.sectionTitle}>
                Hold Blockers
              </ECSText>
              <ECSBadge label={`${assessment.blockers.length || 1} blocker${assessment.blockers.length === 1 ? '' : 's'}`} tone="unavailable" compact />
            </View>
            <ReadinessConcernList assessment={assessment} limit={Math.max(3, assessment.blockers.length)} showRecommendations={false} />
          </View>
        ) : null}

        <View style={styles.sectionStack}>
          {/* Camp Decision Clock disabled: runtime feature flag keeps continue/divert guidance out of the user-facing section stack. */}
          {campDecisionClockEnabled ? <CampDecisionClockBriefModule decision={campDecisionClock} /> : null}
          {departureDeltaBriefEnabled ? (
            <OperationalDeltaBriefCard
              currentSnapshot={operationalDeltaSnapshot}
              legacyDepartureBaseline={legacyOperationalDepartureBaseline}
              onFeedback={showToast}
            />
          ) : null}
          {hasRoute ? <WeakPointAnalyzerPanel assessment={weakPointAssessment} /> : null}

          <View style={[styles.decisionCard, commandBriefFleetSurfaceStyle]}>
            <View style={styles.decisionHeader}>
              <View style={styles.decisionCopyBlock}>
                <ECSText variant="cardTitle" style={styles.sectionTitle}>
                  Go / Caution / Hold Decision
                </ECSText>
                <ECSText variant="body" style={styles.decisionCopy} numberOfLines={4}>
                  {getDecisionCopy(assessment, canStart.reason, readinessExplanation?.groundedSummary)}
                </ECSText>
                <ECSText variant="helper" style={styles.confidenceCopy} numberOfLines={3}>
                  Confidence: {assessment?.confidence ?? 'low'}. {readinessExplanation?.limitedConfidence ? 'ECS Intelligence is using limited-confidence guardrails. ' : ''}{getBriefFreshnessCopy(assessment)}
                </ECSText>
              </View>
              <ReadinessScoreRing
                score={assessment?.overallScore ?? 0}
                status={assessment?.status ?? 'hold'}
                size={92}
                compact
              />
            </View>
            {assessment ? <ReadinessFreshnessLine assessment={assessment} /> : null}
            {missionCommandEnabled && assessment ? (
              <MissionCommandProposalAction
                label={assessment.blockers.length > 0 || assessment.warnings.length > 0
                  ? 'Coordinate In Dispatch'
                  : 'Open Mission Command'}
                accessibilityLabel="Coordinate this ECS Brief readiness decision in Mission Command"
                buildProposal={buildReadinessMissionCommandProposal}
                grow
              />
            ) : null}
          </View>

          {assessment?.departureAudit?.length ? (
            <DepartureAuditSection
              items={assessment.departureAudit}
              onActionPress={handleAuditAction}
            />
          ) : null}

          {assessment?.preferenceEffects.length ? (
            <View style={[styles.preferenceCard, commandBriefFleetSurfaceStyle]}>
              <View style={styles.sectionHeader}>
                <ECSText variant="cardTitle" style={styles.sectionTitle}>
                  Preference Influence
                </ECSText>
                <ECSBadge label={assessment.readinessPreferences.readinessSensitivity === 'standard' ? 'Standard' : 'Conservative'} tone="info" compact />
              </View>
              {assessment.preferenceEffects.slice(0, 3).map((effect) => (
                <View key={effect.id} style={styles.preferenceEffectRow}>
                  <ECSIcon
                    name={effect.severity === 'blocker' ? 'hand-left-outline' : effect.severity === 'warning' ? 'alert-circle-outline' : 'options-outline'}
                    tier="compact"
                    tone={effect.severity === 'blocker' ? 'unavailable' : effect.severity === 'warning' ? 'warning' : 'info'}
                  />
                  <View style={styles.preferenceEffectCopy}>
                    <ECSText variant="body" style={styles.preferenceEffectTitle} numberOfLines={1}>
                      {effect.label}
                    </ECSText>
                    <ECSText variant="helper" style={styles.preferenceEffectSummary} numberOfLines={2}>
                      {effect.summary}
                    </ECSText>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {SECTION_DEFINITION.map((section) => (
            section.id === 'vehicle' ? (
              <VehicleFitBriefSection
                key={section.id}
                vehicle={activeVehicleReadiness}
                category={categoryMap.get('vehicle_fit')}
                loadoutConsequenceSummary={loadoutConsequenceSummary}
              />
            ) : section.id === 'camp' ? (
              <CampOpsBriefSection
                key={section.id}
                candidates={campCandidates}
                category={categoryMap.get('camp_legality_confidence')}
              />
            ) : section.id === 'recovery' ? (
              <RecoveryBriefSection
                key={section.id}
                assessment={assessment}
                category={categoryMap.get('recovery_bailout_access')}
                onOpenDispatch={() => pushRoute('/alert')}
                buildMissionCommandProposal={missionCommandEnabled ? buildRecoveryMissionCommandProposal : undefined}
              />
            ) : section.id === 'fuel-power-range' ? (
              <FuelPowerRangeBriefSection
                key={section.id}
                assessment={assessment}
                fuelCategory={categoryMap.get('fuel_range_margin')}
                powerCategory={categoryMap.get('power_runtime')}
              />
            ) : (
              <CommandBriefSection
                key={section.id}
                title={section.title}
                categories={section.categoryIds
                  .map((id) => categoryMap.get(id))
                  .filter((category): category is ExpeditionReadinessCategory => Boolean(category))}
                emptyCopy={section.emptyCopy}
              />
            )
          ))}

          {missingCategories.length > 0 ? (
            <View style={[styles.dataNotice, commandBriefFleetSurfaceStyle]}>
              <ECSIcon name="alert-circle-outline" tier="compact" tone="warning" />
              <ECSText variant="helper" style={styles.dataNoticeText} numberOfLines={3}>
                ECS Intelligence expected all readiness categories. Missing category outputs: {missingCategories.join(', ')}.
              </ECSText>
            </View>
          ) : null}

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
