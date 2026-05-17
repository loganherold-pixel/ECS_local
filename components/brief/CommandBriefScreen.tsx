import React, { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
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
import {
  ExpeditionReadinessCard,
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
import { readinessInnerSurfaceStyle, readinessSurfaceStyle } from '../readiness/readinessUi';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import {
  EXPEDITION_READINESS_CATEGORY_IDS,
  type ExpeditionReadinessAssessment,
  type ExpeditionReadinessCategory,
  type ExpeditionReadinessCategoryId,
  type ExpeditionDepartureAuditItem,
  type ExpeditionTripIntent,
} from '../../lib/readiness/expeditionReadinessTypes';
import {
  expeditionReadinessStore,
  buildReadinessVehicleInputFromFleetState,
  type ExpeditionReadinessCampCandidateInput,
  type ExpeditionReadinessVehicleInput,
  useCanStartExpedition,
  useCurrentExpeditionReadiness,
  useExpeditionReadinessState,
  useReadinessBriefPayload,
  useReadinessConcerns,
  useReadinessDecision,
} from '../../lib/readiness';
import { buildReadinessExplanationPayload } from '../../lib/ai/readinessExplanationGuardrails';
import {
  exportCommandBriefPacket,
  type CommandBriefExportAction,
} from '../../lib/brief';
import { navigateRouteSessionStore } from '../../lib/navigateRouteSessionStore';
import {
  getActiveVehicleState,
  subscribeActiveVehicleState,
} from '../../lib/fleet/activeVehicleState';
import { useApp } from '../../context/AppContext';

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

function getCategoryMap(assessment: ExpeditionReadinessAssessment | null) {
  const map = new Map<ExpeditionReadinessCategoryId, ExpeditionReadinessCategory>();
  assessment?.categories.forEach((category) => {
    map.set(category.id, category);
  });
  return map;
}

function categoryNeedsReview(category: ExpeditionReadinessCategory | undefined): boolean {
  if (!category) return true;
  return category.status !== 'ready' || category.missingInputs.length > 0;
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

function buildBriefActions(
  assessment: ExpeditionReadinessAssessment | null,
  categories: Map<ExpeditionReadinessCategoryId, ExpeditionReadinessCategory>,
  pushRoute: (route: string) => void,
): BriefAction[] {
  const actions: BriefAction[] = [];
  const add = (action: BriefAction) => {
    if (!actions.some((item) => item.id === action.id)) actions.push(action);
  };

  if (!assessment || categoryNeedsReview(categories.get('route_risk'))) {
    add({
      id: 'open-navigate',
      label: 'Open Navigate',
      detail: 'Stage or review the active route before generating a full Command Brief.',
      icon: 'navigate-outline',
      onPress: () => pushRoute('/navigate'),
    });
    add({
      id: 'open-explore',
      label: 'Open Explore',
      detail: 'Find a route candidate and generate a planning brief.',
      icon: 'map-outline',
      onPress: () => pushRoute('/discover'),
    });
  }

  if (categoryNeedsReview(categories.get('vehicle_fit'))) {
    add({
      id: 'select-vehicle',
      label: 'Select active vehicle',
      detail: 'Vehicle fit and payload confidence improve when an active vehicle profile is available.',
      icon: 'car-sport-outline',
      onPress: () => pushRoute('/fleet'),
    });
  }

  if (categoryNeedsReview(categories.get('offline_preparedness'))) {
    add({
      id: 'download-offline',
      label: 'Download offline route package',
      detail: 'Offline package state is part of readiness and should be reviewed before departure.',
      icon: 'download-outline',
      onPress: () => pushRoute('/navigate-offline'),
    });
  }

  if (categoryNeedsReview(categories.get('camp_legality_confidence'))) {
    add({
      id: 'open-campops',
      label: 'Review campsite access confidence',
      detail: 'Review CampOps candidates, dispersed filters, and campsite access confidence from the route map.',
      icon: 'trail-sign-outline',
      onPress: () => pushRoute('/navigate'),
    });
  }

  if (categoryNeedsReview(categories.get('weather_window'))) {
    add({
      id: 'refresh-weather',
      label: 'Refresh weather',
      detail: 'Weather confidence should be current before relying on a planning or active expedition brief.',
      icon: 'cloudy-night-outline',
      disabled: true,
      disabledLabel: 'Coming soon',
    });
  }

  if (categoryNeedsReview(categories.get('fuel_range_margin'))) {
    add({
      id: 'fuel-range',
      label: 'Add fuel range estimate',
      detail: 'Range margin improves when fuel level and route distance are available.',
      icon: 'speedometer-outline',
      onPress: () => pushRoute('/fleet'),
    });
  }

  if (categoryNeedsReview(categories.get('power_runtime'))) {
    add({
      id: 'power-runtime',
      label: 'Review power runtime',
      detail: 'Power margin remains limited until battery state or manual runtime estimates are available.',
      icon: 'battery-charging-outline',
      onPress: () => pushRoute('/power'),
    });
  }

  if (categoryNeedsReview(categories.get('recovery_bailout_access'))) {
    add({
      id: 'bailouts',
      label: 'Review bailout options',
      detail: 'Bailout and recovery access should be visible before committing to the route.',
      icon: 'git-branch-outline',
      onPress: () => pushRoute('/navigate-bailouts'),
    });
  }

  if (categoryNeedsReview(categories.get('communications_signal_confidence'))) {
    add({
      id: 'comms-plan',
      label: 'Confirm communications plan',
      detail: 'Signal confidence is limited without cellular, satellite, or team check-in inputs.',
      icon: 'radio-outline',
      disabled: true,
      disabledLabel: 'Coming soon',
    });
  }

  if (actions.length === 0) {
    add({
      id: 'continue-navigate',
      label: 'Open Navigate',
      detail: 'Continue route review with readiness visible from the command layer.',
      icon: 'navigate-outline',
      onPress: () => pushRoute('/navigate'),
    });
  }

  return actions.slice(0, 7);
}

function CommandBriefEmptyState({ onNavigate, onExplore }: { onNavigate: () => void; onExplore: () => void }) {
  return (
    <View style={[styles.emptyState, readinessSurfaceStyle]}>
      <View style={styles.emptyIconFrame}>
        <ECSIcon name="document-text-outline" tier="navigation" tone="warning" />
      </View>
      <ECSText variant="sectionTitle" style={styles.emptyTitle}>
        No active expedition brief.
      </ECSText>
      <ECSText variant="body" style={styles.emptyCopy}>
        Generate a Command Brief from Explore, Navigate, or CampOps. Readiness stays limited until route, vehicle, offline package, Camp Legality Confidence, weather, recovery, and communications inputs are available.
      </ECSText>
      <ReadinessEducationCard surface="commandBriefEmpty" compact />
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

function CommandBriefSection({
  title,
  categories,
  emptyCopy,
}: {
  title: string;
  categories: ExpeditionReadinessCategory[];
  emptyCopy: string;
}) {
  return (
    <View style={[styles.section, readinessSurfaceStyle]}>
      <View style={styles.sectionHeader}>
        <ECSText variant="cardTitle" style={styles.sectionTitle} numberOfLines={2}>
          {title}
        </ECSText>
        {categories.some((category) => category.missingInputs.length > 0) ? (
          <ECSBadge label="Limited confidence" tone="warning" compact />
        ) : null}
      </View>
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
    </View>
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
    <View style={[styles.section, readinessSurfaceStyle]}>
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
      <DepartureAuditChecklist items={items} onActionPress={onActionPress} />
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
    <View style={[styles.section, readinessSurfaceStyle]}>
      <View style={styles.sectionHeader}>
        <ECSText variant="cardTitle" style={styles.sectionTitle} numberOfLines={2}>
          CampOps / Camp Legality Confidence
        </ECSText>
        <ECSBadge
          label={category?.confidence === 'high' ? 'Confidence visible' : 'Limited confidence'}
          tone={category?.confidence === 'high' ? 'ready' : 'warning'}
          compact
        />
      </View>
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
    </View>
  );
}

function VehicleFitBriefSection({
  vehicle,
  category,
}: {
  vehicle: ExpeditionReadinessVehicleInput | null;
  category?: ExpeditionReadinessCategory;
}) {
  const strengths = vehicle?.keyStrengths ?? [];
  const concerns = vehicle?.keyConcerns ?? [];
  const missingSpecs = vehicle?.missingSpecs ?? [];
  const recommendations = vehicle?.recommendations ?? [];
  return (
    <View style={[styles.section, readinessSurfaceStyle]}>
      <View style={styles.sectionHeader}>
        <ECSText variant="cardTitle" style={styles.sectionTitle} numberOfLines={2}>
          Vehicle Fit
        </ECSText>
        <ECSBadge
          label={vehicle ? (category?.status === 'ready' ? 'Fit visible' : 'Review fit') : 'Limited confidence'}
          tone={vehicle && category?.status === 'ready' ? 'ready' : 'warning'}
          compact
        />
      </View>
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
      <View style={styles.vehicleBriefGrid}>
        <VehicleBriefList title="Key strengths" items={strengths} emptyCopy={vehicle ? 'No material strengths confirmed yet.' : 'Select a vehicle to populate strengths.'} />
        <VehicleBriefList title="Key concerns" items={concerns} emptyCopy={vehicle ? 'No major concerns from available Fleet inputs.' : 'Vehicle-specific concerns unavailable.'} />
        <VehicleBriefList title="Missing specs" items={missingSpecs} emptyCopy="Core Fleet specs are present." />
        <VehicleBriefList title="Recommendations" items={recommendations} emptyCopy="No vehicle-specific recommendations." />
      </View>
    </View>
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
}: {
  assessment: ExpeditionReadinessAssessment | null;
  category?: ExpeditionReadinessCategory;
  onOpenDispatch: () => void;
}) {
  const recovery = assessment?.recoveryBrief;
  const coordinateText = recovery?.currentCoordinates
    ? `${recovery.currentCoordinates.latitude.toFixed(5)}, ${recovery.currentCoordinates.longitude.toFixed(5)}`
    : 'Current coordinates unavailable';

  return (
    <View style={[styles.section, readinessSurfaceStyle]}>
      <View style={styles.sectionHeader}>
        <ECSText variant="cardTitle" style={styles.sectionTitle} numberOfLines={2}>
          Recovery + Bailout Plan
        </ECSText>
        <ECSBadge
          label={category?.status === 'ready' ? 'Plan visible' : 'Limited confidence'}
          tone={category?.status === 'ready' ? 'ready' : 'warning'}
          compact
        />
      </View>
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
      <CommandBriefActionButton label="Open Dispatch" icon="radio-outline" onPress={onOpenDispatch} />
    </View>
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
    <View style={[styles.section, readinessSurfaceStyle]}>
      <View style={styles.sectionHeader}>
        <ECSText variant="cardTitle" style={styles.sectionTitle} numberOfLines={2}>
          Fuel / Power / Range
        </ECSText>
        <ECSBadge
          label={power?.statusLabel ?? 'Unknown'}
          tone={power?.status === 'ready' ? 'ready' : power?.status === 'caution' ? 'warning' : 'info'}
          compact
        />
      </View>
      {fuelCategory || powerCategory ? (
        <View style={styles.sectionRows}>
          {fuelCategory ? <ReadinessCategoryRow category={fuelCategory} initiallyExpanded={fuelCategory.status === 'hold'} /> : null}
          {powerCategory ? <ReadinessCategoryRow category={powerCategory} initiallyExpanded={powerCategory.status === 'hold'} /> : null}
        </View>
      ) : null}
      <View style={styles.powerBriefGrid}>
        <RecoveryBriefMetric label="Power status" value={power?.sourceSummary ?? 'No power system connected.'} />
        <RecoveryBriefMetric label="Runtime" value={power?.runtimeSummary ?? 'Runtime unknown.'} />
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
  const briefPayload = useReadinessBriefPayload(5);
  const decision = useReadinessDecision();
  const canStart = useCanStartExpedition();
  const concerns = useReadinessConcerns(4);
  const routeSession = useRouteSessionSnapshot();
  const activeVehicleReadiness = useActiveVehicleReadinessInput();
  const [briefExportAction, setBriefExportAction] = useState<CommandBriefExportAction | null>(null);
  const [briefExportMessage, setBriefExportMessage] = useState<string | null>(null);

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
      if (item.actionTarget) pushRoute(item.actionTarget);
    },
    [pushRoute],
  );
  const briefExportContext = useMemo(() => {
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
      activeVehicle: activeVehicleReadiness,
      activeRouteId: readinessState.activeRouteId ?? routeSession.routeId,
      activeTripId: readinessState.activeTripId,
    };
  }, [
    activeVehicleReadiness,
    assessment,
    readinessState.activeRouteId,
    readinessState.activeTripId,
    routeSession.etaIso,
    routeSession.progressPercent,
    routeSession.remainingDistanceM,
    routeSession.routeId,
    routeSession.routeSubtitle,
    routeSession.routeTitle,
    routeSession.statusLabel,
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
      detail: 'Open the device share sheet with the current Command Brief packet.',
      icon: 'share-social-outline',
      disabled: briefExportAction !== null,
      disabledLabel: briefExportAction === 'share' ? 'Sharing' : briefExportAction ? 'Busy' : undefined,
      onPress: () => void handleBriefExport('share'),
    },
    {
      id: 'save-command-brief',
      label: 'Save locally',
      detail: 'Save a markdown packet to local ECS documents when file storage is available.',
      icon: 'save-outline',
      disabled: briefExportAction !== null,
      disabledLabel: briefExportAction === 'save' ? 'Saving' : briefExportAction ? 'Busy' : undefined,
      onPress: () => void handleBriefExport('save'),
    },
  ]), [briefExportAction, handleBriefExport]);
  const actions = useMemo(
    () => buildBriefActions(assessment, categoryMap, pushRoute),
    [assessment, categoryMap, pushRoute],
  );
  const campCandidates = useMemo(
    () => (readinessState.inputPatch.campCandidates ?? []).slice(0, 5),
    [readinessState.inputPatch.campCandidates],
  );
  const missingCategories = assessment
    ? EXPEDITION_READINESS_CATEGORY_IDS.filter((id) => !categoryMap.has(id))
    : EXPEDITION_READINESS_CATEGORY_IDS;

  return (
    <View style={[styles.root, embedded && styles.embeddedRoot, style]}>
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
        />

        {!hasRoute ? (
          <CommandBriefEmptyState
            onNavigate={() => pushRoute('/navigate')}
            onExplore={() => pushRoute('/discover')}
          />
        ) : null}

        {assessment?.status === 'hold' ? (
          <View style={[styles.holdBlockers, readinessSurfaceStyle]}>
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
          <ExpeditionReadinessCard
            assessment={assessment}
            title="Expedition Readiness Summary"
            categoryLimit={3}
            concernLimit={3}
            compactCategories
          />

          {assessment?.departureAudit?.length ? (
            <DepartureAuditSection
              items={assessment.departureAudit}
              onActionPress={handleAuditAction}
            />
          ) : null}

          {assessment?.preferenceEffects.length ? (
            <View style={[styles.preferenceCard, readinessInnerSurfaceStyle]}>
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

          <View style={[styles.decisionCard, readinessSurfaceStyle]}>
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
          </View>

          {SECTION_DEFINITION.map((section) => (
            section.id === 'vehicle' ? (
              <VehicleFitBriefSection
                key={section.id}
                vehicle={activeVehicleReadiness}
                category={categoryMap.get('vehicle_fit')}
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
            <View style={[styles.dataNotice, readinessInnerSurfaceStyle]}>
              <ECSIcon name="alert-circle-outline" tier="compact" tone="warning" />
              <ECSText variant="helper" style={styles.dataNoticeText} numberOfLines={3}>
                ECS Intelligence expected all readiness categories. Missing category outputs: {missingCategories.join(', ')}.
              </ECSText>
            </View>
          ) : null}

          <View style={[styles.exportCard, readinessSurfaceStyle]}>
            <View style={styles.sectionHeader}>
              <ECSText variant="cardTitle" style={styles.sectionTitle}>
                Share Packet
              </ECSText>
              <ECSBadge label="Markdown" tone="info" compact />
            </View>
            <ECSText variant="helper" style={styles.exportCopy} numberOfLines={3}>
              Generate a confidence-based Command Brief packet from the current readiness assessment. Unavailable sections are marked limited confidence.
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

          <View style={[styles.actionsCard, readinessSurfaceStyle]}>
            <View style={styles.sectionHeader}>
              <ECSText variant="cardTitle" style={styles.sectionTitle}>
                Recommended Actions
              </ECSText>
              {briefPayload?.isUsingDemoData ? <ECSBadge label="Demo data" tone="warning" compact /> : null}
            </View>
            {assessment?.recommendations.length ? (
              <View style={styles.recommendationStrip}>
                <ECSIcon name="list-outline" tier="compact" tone="warning" />
                <ECSText variant="helper" style={styles.recommendationCopy} numberOfLines={3}>
                  {assessment.recommendations[0]}
                </ECSText>
              </View>
            ) : null}
            <View style={styles.actionList}>
              {actions.map((action) => (
                <CommandBriefActionRow key={action.id} action={action} />
              ))}
            </View>
          </View>

          {concerns.length > 0 ? (
            <View style={[styles.concernSummary, readinessInnerSurfaceStyle]}>
              <ECSText variant="cardTitle" style={styles.sectionTitle}>
                Watch Items
              </ECSText>
              {concerns.map((category) => (
                <ReadinessCategoryRow key={category.id} category={category} expandable={false} />
              ))}
            </View>
          ) : null}
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
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.bgElev,
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
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
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
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
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
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgPanel,
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
  recoveryGrid: {
    gap: 8,
  },
  recoveryMetric: {
    gap: 4,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
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
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
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
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgPanel,
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
  actionsCard: {
    padding: 14,
    gap: 10,
  },
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
  recommendationStrip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingBottom: 2,
  },
  recommendationCopy: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 16,
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
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
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
  concernSummary: {
    padding: 14,
    gap: 4,
  },
});
