// ============================================================
// FLEET TAB — Vehicle List + Fleet Management
// ============================================================
// Vehicle management layer — stable, infrastructure-focused.
//
// Behavior:
//   vehicles.count == 0  → Readiness Command + Vehicle Command Center + empty card area
//   vehicles.count == 1  → One current-format vehicle card
//   vehicles.count >= 2  → One swipeable current-format vehicle card
//
// Vehicle cards:
//   - Vehicle name
//   - ECS score/readiness
//   - Weight/build/loadout summaries
//   - Buttons: Vehicle Profile, Build & Loadout, Weight Summary, Delete Vehicle
//
// IMPORTANT: Vehicle creation and editing stays in the current Vehicle
// Command Center modal flows. The retired stepped vehicle framework
// routes should not be used by Fleet.
//
// Sync Status Integration:
//   - The shared top-banner online pill opens Sync Management
//   - Fleet relies on the global shell entry point instead of a duplicate tab-local control
//   - Integrates LiveSyncBanner + ConflictResolutionModal
// ============================================================

import React, { useState, useCallback, useEffect, useMemo, useRef, Component, type ReactNode } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  FlatList,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { FleetIcon } from '../../components/DockIcons';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import TopoBackground from '../../components/TopoBackground';
import Header from '../../components/Header';
import { ECSInlineHelper, ECSStateMessage } from '../../components/ECSStateMessage';
import { ECSButton } from '../../components/ECSButton';
import ECSActionRow from '../../components/ECSActionRow';
import ECSModalShell, { ECSOverlayFooter } from '../../components/ECSModalShell';
import { ECSCard, ECSCardFooter, ECSPanel } from '../../components/ECSSurface';
import { ECSBadge } from '../../components/ECSStatus';
import { ECSLoadingCard, ECSTransientNotice } from '../../components/ECSLoading';
import { vehicleStore } from '../../lib/vehicleStore';

import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleSpecStore } from '../../lib/vehicleSpecStore';
import { consumablesStore } from '../../lib/consumablesStore';
import { getZoneSummaryPills } from '../../lib/vehicleSystemsIntegration';
import {
  normalizeAccessoryFramework,
  resolveVehicleAccessoryFramework,
  resolveVehicleContainerZones,
  type AccessoryFramework,
  type ContainerZone,
} from '../../lib/accessoryFramework';
import {
  isLoadoutReadyForBuild,
  loadoutItemStore,
  loadoutStore,
  type LocalLoadout,
} from '../../lib/loadoutStore';
import { loadoutSyncQueue, type LoadoutSyncStatus } from '../../lib/loadoutSyncQueue';
import { getTotalLoadoutWeight } from '../../lib/loadout2Types';
import useECSAIHook from '../../lib/ai/useECSAI';
import { selectFleetCommandState, type FleetCommandState, type FleetCommandBadgeTone } from '../../lib/fleet/fleetCommandSelectors';
import { createFleetRefreshCoalescer } from '../../lib/fleet/fleetRefreshCoalescer';
import {
  type FleetVehicle,
  type FleetLoadoutItem,
  type FleetScoringResult,
  type FleetWeightResult,
} from '../../lib/fleet/fleetPremiumDomain';
import type { FleetBuildLoadoutState } from '../../lib/fleet/fleetBuildLoadout';
import {
  fleetRiskTone,
  type FleetWeightSummary,
} from '../../lib/fleet/fleetWeightSummary';
import {
  generatePremiumFleetFabricPayload,
  type FleetFabricServicePayload,
} from '../../lib/fleet/fleetFabricService';
import {
  selectFleetVehicleStateFromRecord,
} from '../../lib/fleet/fleetVehicleStateSelectors';
import { emitFleetTelemetryEvent } from '../../lib/fleet/fleetTelemetryEvents';
import {
  getFleetPremiumRolloutDisabledCopy,
  resolveFleetPremiumReleaseConfig,
} from '../../lib/fleet/fleetPremiumReleaseConfig';
import {
  FLEET_CHECKLIST_CATEGORIES,
  addChecklistItemToLoadoutState,
  buildFleetChecklistRecommendations,
  createChecklistLinkedLoadoutItem,
  readFleetChecklistState,
  updateFleetChecklistItemStatus,
  type FleetChecklistItemStatus,
  type FleetChecklistRecommendation,
  type FleetChecklistState,
} from '../../lib/fleet/fleetChecklist';


import { getVehicleIcon } from '../../lib/vehicleIcons';
import type { Vehicle } from '../../lib/types';
import { getVehicleResourceProfile } from '../../lib/vehicleResourceProfile';
import {
  getConfigSummary,
} from '../../components/vehicle-wizard/WizardData';
import { hapticMicro } from '../../lib/haptics';
// Legacy expedition completion popup is intentionally not mounted from Fleet.
import FleetLoadoutModal from '../../components/fleet/FleetLoadoutModal';
import FleetVehicleProfileModal from '../../components/fleet/FleetVehicleProfileModal';
import FleetBuildLoadoutModal from '../../components/fleet/FleetBuildLoadoutModal';
import WeightDashboardPanel from '../../components/weight-dashboard/WeightDashboardPanel';
import { tiresLiftStore } from '../../lib/tiresLiftStore';
import { getShellBottomClearance } from '../../lib/shellLayout';
import { showEcsConfirmDialog } from '../../lib/ecsConfirmDialog';
import { consumeNavigationFlow, stageNavigationFlow } from '../../lib/ecsNavigationFlow';
import { ECS_STATE_COPY, ECS_TOAST_COPY } from '../../lib/ecsStateCopy';
import { ECS_TEXT, ECS_TEXT_SPACING } from '../../lib/ecsTypographyTokens';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { ECS_STATUS } from '../../lib/ecsStatusTokens';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';




const TAG = '[FLEET]';

function logFleetDev(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

type LoadoutSummarySyncStatus = 'SYNCED' | 'PENDING' | 'SYNCING' | 'FAILED' | 'NOT STAGED';

type LoadoutSummaryState = {
  itemCount: number;
  totalWeight: number;
  syncStatus: LoadoutSummarySyncStatus;
};

type FleetDetailPanelKey =
  | 'profile'
  | 'build_loadout'
  | 'weight_summary'
  | 'readiness_score'
  | 'forgot';

type FleetVehicleCardModel = {
  vehicle: Vehicle;
  fleetVehicle: FleetVehicle;
  descriptor: string;
  iconName: string;
  typeLabel: string;
  useCaseChips: string[];
  accessorySummary: ReturnType<typeof buildVehicleAccessorySummary>;
  buildLoadoutState: FleetBuildLoadoutState;
  buildCompartmentCount: number;
  checklistState: FleetChecklistState;
  checklistRecommendations: FleetChecklistRecommendation[];
  fleetLoadoutItems: FleetLoadoutItem[];
  weightResult: FleetWeightResult;
  scoringResult: FleetScoringResult;
  weightSummary: FleetWeightSummary;
  fabricPayload: FleetFabricServicePayload;
  verificationStatus: 'Verified' | 'Needs verification' | 'Estimated';
  needsVerification: boolean;
  activeLoadout: LocalLoadout | null;
};

type FleetVehicleSelectionState = {
  hasVehicles: boolean;
  activeVehicleId: string | null;
  activeVehicle: Vehicle | null;
  visibleVehicleId: string | null;
  visibleVehicle: Vehicle | null;
  visibleVehicleIndex: number;
};

function resolveFleetVehicleSelection(
  vehicles: Vehicle[],
  persistedActiveVehicleId: string | null,
  visibleVehicleId: string | null,
): FleetVehicleSelectionState {
  if (vehicles.length === 0) {
    return {
      hasVehicles: false,
      activeVehicleId: null,
      activeVehicle: null,
      visibleVehicleId: null,
      visibleVehicle: null,
      visibleVehicleIndex: 0,
    };
  }

  const activeVehicle =
    persistedActiveVehicleId
      ? vehicles.find((vehicle) => vehicle.id === persistedActiveVehicleId) ?? null
      : null;
  const validActiveVehicleId = activeVehicle?.id ?? null;
  const visibleVehicle =
    (visibleVehicleId ? vehicles.find((vehicle) => vehicle.id === visibleVehicleId) : null) ??
    activeVehicle ??
    vehicles[0] ??
    null;
  const visibleVehicleIndex = visibleVehicle
    ? Math.max(0, vehicles.findIndex((vehicle) => vehicle.id === visibleVehicle.id))
    : 0;

  return {
    hasVehicles: true,
    activeVehicleId: validActiveVehicleId,
    activeVehicle,
    visibleVehicleId: visibleVehicle?.id ?? null,
    visibleVehicle,
    visibleVehicleIndex: visibleVehicleIndex >= 0 ? visibleVehicleIndex : 0,
  };
}

function formatPowerStorage(valueWh: number | null): string | null {
  if (valueWh == null || valueWh <= 0) return null;
  if (valueWh >= 1000) return `${(valueWh / 1000).toFixed(1)} kWh`;
  return `${Math.round(valueWh)} Wh`;
}

function formatFleetMetric(
  value: number | null | undefined,
  unit: string,
  decimals = 0,
): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '--';
  if (decimals > 0) return `${value.toFixed(decimals)} ${unit}`;
  return `${Math.round(value)} ${unit}`;
}

function formatLoadoutWeight(weightLbs: number): string {
  if (!Number.isFinite(weightLbs) || weightLbs <= 0) return '0 lb';
  if (weightLbs >= 100) return `${Math.round(weightLbs)} lb`;
  return `${weightLbs.toFixed(1)} lb`;
}

function formatFleetWeightValue(weightLbs: number | null | undefined): string {
  if (weightLbs == null || !Number.isFinite(weightLbs)) return '--';
  const rounded = Math.round(weightLbs);
  return `${rounded.toLocaleString()} lb`;
}

function formatFleetScore(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value)}`;
}

function formatFleetPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value)}%`;
}

function resolveLoadoutSyncLabel(
  loadout: LocalLoadout | null,
  queueStatus: LoadoutSyncStatus,
): LoadoutSummarySyncStatus {
  if (!loadout) return 'NOT STAGED';
  if (queueStatus === 'retrying') return 'SYNCING';
  if (queueStatus === 'pending') return 'PENDING';
  if (queueStatus === 'failed') return 'FAILED';
  return loadout.sync_status === 'synced' ? 'SYNCED' : 'PENDING';
}

function resolveFleetChecklistSeason(now: Date = new Date()): string | null {
  const month = now.getMonth();
  return month === 11 || month <= 1 ? 'winter' : null;
}

function fleetBadgeTone(tone: FleetCommandBadgeTone): 'ready' | 'warning' | 'info' {
  switch (tone) {
    case 'primary':
      return 'ready';
    case 'warning':
      return 'warning';
    case 'muted':
    default:
      return 'info';
  }
}

function fleetCommandAccent(state: FleetCommandState): string {
  switch (state.readiness) {
    case 'vehicle_ready':
      return ECS_STATUS.tone.ready.text;
    case 'ready_for_staging':
      return TACTICAL.amber;
    case 'ready_with_limitations':
    case 'partially_configured':
      return ECS_STATUS.tone.warning.text;
    default:
      return TACTICAL.textMuted;
  }
}

function getResolvedContainerZones(vehicleAny: any): ContainerZone[] {
  return resolveVehicleContainerZones(vehicleAny);
}

function buildVehicleAccessorySummary(
  vehicleAny: any,
  {
    maxPills,
    maxAccessorySummaryItems,
  }: {
    maxPills: number;
    maxAccessorySummaryItems: number;
  },
) {
  const framework: AccessoryFramework | null = resolveVehicleAccessoryFramework(vehicleAny);
  const containerZones = getResolvedContainerZones(vehicleAny);
  const zonePills = getZoneSummaryPills(framework, containerZones, maxPills);
  const hasZoneSummary = zonePills.length > 0;
  const wizardConfig =
    vehicleAny?.wizard_config && typeof vehicleAny.wizard_config === 'object'
      ? vehicleAny.wizard_config
      : {};

  let accessorySummary: string[] = [];
  if (!hasZoneSummary) {
    try {
      accessorySummary = getConfigSummary(wizardConfig)
        .filter(c => c.value !== 'Not Selected' && c.label !== 'VEHICLE TYPE')
        .map(c => c.value)
        .slice(0, maxAccessorySummaryItems);
    } catch {
      accessorySummary = [];
    }
  }

  return {
    containerZones,
    zonePills,
    hasZoneSummary,
    extraZoneCount: Math.max(containerZones.length - maxPills, 0),
    accessorySummary,
    wizardConfig,
  };
}

function buildFleetVehicleCardModel(vehicle: Vehicle): FleetVehicleCardModel {
  const spec = vehicleSpecStore.get(vehicle.id) as any;
  const vehicleAny = vehicle as any;
  const accessorySummary = buildVehicleAccessorySummary(vehicleAny, {
    maxPills: 6,
    maxAccessorySummaryItems: 3,
  });
  const canonicalState = selectFleetVehicleStateFromRecord({
    vehicle,
    consumables: consumablesStore.get(vehicle.id),
    tiresLift: tiresLiftStore.get(vehicle.id),
    frameworkContainerZones: accessorySummary.containerZones,
  });
  const {
    activeLoadout,
    buildLoadoutState,
    fleetVehicle,
    loadoutItems: allFleetLoadoutItems,
    accessories: accessoryInstalls,
    scoringResult,
    useCaseChips,
    weightSummary,
  } = canonicalState;
  const weightResult = canonicalState.operatingWeight.weightResult;
  const checklistState = readFleetChecklistState(vehicleAny);
  const checklistRecommendations = buildFleetChecklistRecommendations({
    vehicle: fleetVehicle,
    useCases: useCaseChips,
    season: resolveFleetChecklistSeason(),
    accessoryLabels: [
      ...accessorySummary.containerZones.map((zone) => zone.label),
      ...accessoryInstalls.map((install) => install.name),
    ],
    loadoutItems: allFleetLoadoutItems,
    state: checklistState,
  });
  const fabricPayload = generatePremiumFleetFabricPayload({
    vehicle: fleetVehicle,
    accessories: accessoryInstalls,
    compartments: buildLoadoutState.compartments.filter((item) => item.status !== 'removed'),
    loadoutItems: allFleetLoadoutItems,
    activeLoadout: {
      id: activeLoadout?.id ?? null,
      name: activeLoadout?.name ?? null,
      presetId: buildLoadoutState.activePreset ?? null,
    },
    checklistState,
    checklistRecommendations,
    weightResult,
    scoringResult,
    tacticalUiState: { routeTarget: 'fleet' },
  });
  const descriptor =
    [vehicle.year, vehicle.make, vehicle.model, spec?.trim]
      .filter(Boolean)
      .join(' ') ||
    (typeof accessorySummary.wizardConfig.vehicle_type === 'string'
      ? accessorySummary.wizardConfig.vehicle_type.replace(/_/g, ' ').toUpperCase()
      : 'Vehicle profile');
  const needsVerification =
    weightResult.baseNetWeight.source !== 'scale_ticket' ||
    !weightResult.gvwr ||
    weightResult.gvwr.source === 'ecs_default' ||
    weightResult.confidence < 88;

  return {
    vehicle,
    fleetVehicle,
    descriptor,
    iconName: getVehicleIcon(vehicle),
    typeLabel: vehicle.type || 'Vehicle',
    useCaseChips,
    accessorySummary,
    buildLoadoutState,
    buildCompartmentCount: buildLoadoutState.compartments.filter((item) => item.status === 'active').length,
    checklistState,
    checklistRecommendations,
    fleetLoadoutItems: allFleetLoadoutItems,
    weightResult,
    scoringResult,
    weightSummary,
    fabricPayload,
    verificationStatus:
      weightResult.baseNetWeight.source === 'scale_ticket'
        ? 'Verified'
        : needsVerification
          ? 'Needs verification'
          : 'Estimated',
    needsVerification,
    activeLoadout,
  };
}

function FleetCommandSurface({ state }: { state: FleetCommandState }) {
  const accent = fleetCommandAccent(state);

  return (
    <View style={s.commandWrap}>
      <ECSPanel
        variant="secondary"
        style={[
          s.commandPanel,
          {
            borderColor: `${accent}2E`,
            backgroundColor: `${accent}12`,
          },
        ]}
      >
        <View style={s.commandTopRow}>
          <View style={s.commandTitleWrap}>
            <Text style={s.commandEyebrow}>READINESS COMMAND</Text>
            <Text style={s.commandTitle}>{state.title}</Text>
          </View>
          <ECSBadge
            label={state.readiness.replace(/_/g, ' ').toUpperCase()}
            tone={fleetBadgeTone(
              state.readiness === 'vehicle_ready' || state.readiness === 'ready_for_staging'
                ? 'primary'
                : state.readiness === 'ready_with_limitations' || state.readiness === 'partially_configured'
                  ? 'warning'
                  : 'muted',
            )}
            compact
          />
        </View>

        <Text style={s.commandSummary}>{state.summary}</Text>
        {state.detail ? (
          <Text style={s.commandDetail}>{state.detail}</Text>
        ) : null}
      </ECSPanel>
    </View>
  );
}

function FleetMetricTile({
  label,
  value,
  helper,
  showHelper = true,
}: {
  label: string;
  value: string;
  helper?: string | null;
  showHelper?: boolean;
}) {
  return (
    <ECSPanel variant="compact" style={s.premiumMetricTile}>
      <View
        style={s.metricTileContent}
        accessible
        accessibilityLabel={`${label}: ${value}${helper ? `. ${helper}` : ''}`}
      >
        <Text style={s.summaryMetricLabel} numberOfLines={2}>{label}</Text>
        <Text style={s.summaryMetricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{value}</Text>
        {helper && showHelper ? <Text style={s.metricHelper} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82}>{helper}</Text> : null}
      </View>
    </ECSPanel>
  );
}

function FleetVehicleCardIcon({ active }: { active: boolean }) {
  return <FleetIcon size={22} color={active ? TACTICAL.amber : TACTICAL.textMuted} />;
}

function FleetOverviewHeader({
  metrics,
  onAddVehicle,
}: {
  metrics: {
    vehicleCount: number;
    averageConfidence: number | null;
    totalOperatingWeight: number;
    needingVerification: number;
  };
  onAddVehicle: () => void;
}) {
  return (
    <ECSCard variant="primary" style={s.overviewCard}>
      <View style={s.overviewHeaderRow}>
        <View style={s.overviewTitleWrap}>
          <Text style={s.overviewEyebrow}>VEHICLE COMMAND CENTER</Text>
          <Text style={s.overviewTitle} accessibilityRole="header">Fleet</Text>
          <Text style={s.overviewSubtitle}>
            Tell ECS what you drive, how it's built, and what it carries. We'll handle the scoring details.
          </Text>
        </View>
        <ECSButton
          label="Add Vehicle"
          icon="add-circle-outline"
          variant="primary"
          size="medium"
          onPress={onAddVehicle}
          style={s.overviewAddButton}
        />
      </View>
      <View style={s.overviewMetricGrid}>
        <FleetMetricTile
          label="Active Vehicles"
          value={`${metrics.vehicleCount}`}
          helper={metrics.vehicleCount === 1 ? 'vehicle staged' : 'vehicles staged'}
        />
        <FleetMetricTile
          label="Avg Confidence"
          value={formatFleetPercent(metrics.averageConfidence)}
          helper="ECS scoring trust"
        />
        <FleetMetricTile
          label="Operating Weight"
          value={metrics.vehicleCount > 0 ? formatFleetWeightValue(metrics.totalOperatingWeight) : '--'}
          helper="fleet total"
        />
        <FleetMetricTile
          label="Verify"
          value={`${metrics.needingVerification}`}
          helper="needs source check"
        />
      </View>
    </ECSCard>
  );
}

function FleetDetailPanel({
  model,
  panel,
  onProfile,
  onLoadout,
  onChecklistSave,
}: {
  model: FleetVehicleCardModel;
  panel: FleetDetailPanelKey;
  onProfile: () => void;
  onLoadout: () => void;
  onChecklistSave: (
    vehicle: Vehicle,
    checklistState: FleetChecklistState,
    buildLoadoutState?: FleetBuildLoadoutState,
  ) => Promise<void> | void;
}) {
  const { vehicle, weightResult, scoringResult, weightSummary } = model;
  const [showAdvancedMath, setShowAdvancedMath] = useState(false);
  const [pendingChecklistItem, setPendingChecklistItem] = useState<FleetChecklistRecommendation | null>(null);
  const activeChecklistCompartments = model.buildLoadoutState.compartments.filter((item) => item.status === 'active');
  const [selectedChecklistCompartmentId, setSelectedChecklistCompartmentId] = useState<string | null>(
    activeChecklistCompartments[0]?.id ?? null,
  );
  const [addChecklistWeight, setAddChecklistWeight] = useState(true);
  const saveChecklistStatus = useCallback((
    recommendation: FleetChecklistRecommendation,
    status: FleetChecklistItemStatus,
  ) => {
    if (status === 'have_it') {
      setPendingChecklistItem(recommendation);
      setSelectedChecklistCompartmentId(activeChecklistCompartments[0]?.id ?? null);
      setAddChecklistWeight(Boolean(activeChecklistCompartments[0]));
      return;
    }
    const nextState = updateFleetChecklistItemStatus(model.checklistState, recommendation.id, status);
    void onChecklistSave(vehicle, nextState);
  }, [activeChecklistCompartments, model.checklistState, onChecklistSave, vehicle]);

  const confirmChecklistHaveIt = useCallback(() => {
    if (!pendingChecklistItem) return;
    const selectedCompartment = activeChecklistCompartments.find((item) => item.id === selectedChecklistCompartmentId);
    let nextBuildState = model.buildLoadoutState;
    let linkedLoadoutItemId: string | null = null;
    if (addChecklistWeight && selectedCompartment) {
      const linkedLoadoutItem = createChecklistLinkedLoadoutItem({
        vehicleId: vehicle.id,
        recommendation: pendingChecklistItem,
        compartment: selectedCompartment,
      });
      linkedLoadoutItemId = linkedLoadoutItem.id;
      nextBuildState = addChecklistItemToLoadoutState(model.buildLoadoutState, linkedLoadoutItem);
    }
    const nextChecklistState = updateFleetChecklistItemStatus(model.checklistState, pendingChecklistItem.id, 'have_it', {
      storageCompartmentId: selectedCompartment?.id ?? null,
      linkedLoadoutItemId,
    });
    setPendingChecklistItem(null);
    void onChecklistSave(vehicle, nextChecklistState, nextBuildState);
  }, [
    activeChecklistCompartments,
    addChecklistWeight,
    model.buildLoadoutState,
    model.checklistState,
    onChecklistSave,
    pendingChecklistItem,
    selectedChecklistCompartmentId,
    vehicle,
  ]);
  if (panel === 'profile') {
    return (
      <ECSPanel variant="secondary" style={s.detailPanel}>
        <Text style={s.detailPanelTitle} accessibilityRole="header">Vehicle Profile</Text>
        <View style={s.detailGrid}>
          <FleetMetricTile label="Identity" value={model.descriptor} helper={model.typeLabel} />
          <FleetMetricTile label="Base Weight" value={formatFleetWeightValue(weightResult.baseNetWeight.lbs)} helper={weightResult.baseNetWeight.sourceLabel ?? weightResult.baseNetWeight.source} />
          <FleetMetricTile label="GVWR" value={formatFleetWeightValue(weightResult.gvwr?.lbs)} helper={weightResult.gvwr?.sourceLabel ?? weightResult.gvwr?.source ?? 'not set'} />
        </View>
        <Text style={s.detailCopy}>Advanced specs stay collapsed in the guided vehicle profile flow.</Text>
        <ECSButton label="Open Vehicle Profile" icon="create-outline" variant="secondary" size="compact" onPress={onProfile} />
      </ECSPanel>
    );
  }

  if (panel === 'build_loadout') {
    return (
      <ECSPanel variant="secondary" style={s.detailPanel}>
        <Text style={s.detailPanelTitle} accessibilityRole="header">Build & Loadout</Text>
        <View style={s.detailGrid}>
          <FleetMetricTile label="Accessories" value={formatFleetWeightValue(weightResult.installedAccessoryWeight.lbs)} helper={`${model.buildCompartmentCount || model.accessorySummary.containerZones.length} compartments`} />
          <FleetMetricTile label="Loadout" value={formatFleetWeightValue(weightResult.activeLoadoutWeight.lbs)} helper={`${model.fleetLoadoutItems.length} items`} />
          <FleetMetricTile label="Active Loadout" value={model.activeLoadout?.name ?? 'Not staged'} helper="guided setup" />
        </View>
        <ECSButton label="Edit Build & Loadout" icon="cube-outline" variant="secondary" size="compact" onPress={onLoadout} />
      </ECSPanel>
    );
  }

  if (panel === 'weight_summary') {
    return (
      <ECSPanel variant="secondary" style={s.detailPanel}>
        <Text style={s.detailPanelTitle} accessibilityRole="header">Weight Summary</Text>
        <Text style={s.detailCopy}>
          GVWR is the max loaded rating. ECS estimates operating weight as base net weight plus installed accessories plus current loadout.
        </Text>
        <View style={s.detailGrid}>
          <FleetMetricTile label="Base Net/Empty" value={formatFleetWeightValue(weightSummary.baseNetWeightLb)} helper={weightResult.baseNetWeight.sourceLabel ?? weightResult.baseNetWeight.source} />
          <FleetMetricTile label="Accessories" value={formatFleetWeightValue(weightSummary.permanentAccessoryWeightLb)} helper="permanent installed weight" />
          <FleetMetricTile label="Loadout" value={formatFleetWeightValue(weightSummary.currentLoadoutWeightLb)} helper={`${model.fleetLoadoutItems.length} active items`} />
          <FleetMetricTile label="Operating" value={formatFleetWeightValue(weightSummary.operatingWeightLb)} helper="base + build + load" />
          <FleetMetricTile label="GVWR" value={formatFleetWeightValue(weightSummary.gvwrLb)} helper="max loaded rating" />
          <FleetMetricTile label="Payload Left" value={formatFleetWeightValue(weightSummary.payloadRemainingLb)} helper="GVWR minus operating" />
          <FleetMetricTile label="GVWR Use" value={formatFleetPercent(weightSummary.gvwrUsagePct)} helper="operating / GVWR" />
          <FleetMetricTile label="Front Axle Est." value={formatFleetWeightValue(weightSummary.estimatedFrontAxleWeightLb)} helper={model.fleetVehicle.buildProfile.frontBaseWeight ? 'base + front zones' : 'estimated split'} />
          <FleetMetricTile label="Rear Axle Est." value={formatFleetWeightValue(weightSummary.estimatedRearAxleWeightLb)} helper={model.fleetVehicle.buildProfile.rearBaseWeight ? 'base + rear zones' : 'estimated split'} />
          <FleetMetricTile label="High-Mounted" value={formatFleetWeightValue(weightSummary.highMountedAddedWeightLb)} helper="roof + bed high" />
          <FleetMetricTile label="Confidence" value={formatFleetPercent(weightSummary.confidenceScore)} helper={model.verificationStatus} />
        </View>
        <View style={s.riskFlagStack}>
          {weightSummary.riskFlags.length > 0 ? weightSummary.riskFlags.map((flag) => (
            <View key={flag.id} style={s.riskFlagRow}>
              <ECSBadge label={flag.label} tone={fleetRiskTone(flag.level)} compact />
              <Text style={s.riskFlagText}>{flag.detail}</Text>
            </View>
          )) : (
            <ECSBadge label="No weight risk flags" tone="ready" compact />
          )}
        </View>
        <ECSInlineHelper
          variant={weightSummary.confidenceScore < 88 ? 'partial_data' : 'standard'}
          icon="scale-outline"
          text="Scale ticket or axle weights improve ECS confidence and make front/rear estimates more precise."
        />
        <ECSButton
          label={showAdvancedMath ? 'Hide Math Detail' : 'Show Math Detail'}
          icon="calculator-outline"
          variant="tertiary"
          size="compact"
          onPress={() => setShowAdvancedMath((value) => !value)}
        />
        {showAdvancedMath ? (
          <View style={s.mathDetailStack}>
            <Text style={s.detailCopy}>Operating weight = base net/empty + permanent accessory weight + current loadout.</Text>
            <Text style={s.detailCopy}>Payload remaining = GVWR - operating weight.</Text>
            <Text style={s.detailCopy}>High-mounted added weight = roof + bed-high zones. Rear bias watches rear-low, bed, hitch, and trailer zones.</Text>
            {weightResult.warnings.map((warning) => (
              <ECSInlineHelper key={warning} variant="warning" icon="warning-outline" text={warning} />
            ))}
          </View>
        ) : null}
      </ECSPanel>
    );
  }

  if (panel === 'forgot') {
    const groupedRecommendations = FLEET_CHECKLIST_CATEGORIES.map((category) => ({
      ...category,
      items: model.checklistRecommendations.filter((item) => item.category === category.id),
    })).filter((category) => category.items.length > 0);
    return (
      <>
        <ECSPanel variant="secondary" style={s.detailPanel}>
          <View style={s.checklistHeaderRow}>
            <View style={s.checklistTitleWrap}>
              <Text style={s.detailPanelTitle} accessibilityRole="header">What Did I Forget?</Text>
              <Text style={s.detailCopy}>
                Optional readiness audit. Need it goes to prep, Have it can link to loadout only when you choose.
              </Text>
            </View>
            <ECSBadge label="Optional" tone="info" compact />
          </View>
          {groupedRecommendations.length > 0 ? groupedRecommendations.map((category) => (
            <View key={category.id} style={s.checklistCategory}>
              <Text style={s.checklistCategoryTitle}>{category.label}</Text>
              {category.items.map((item) => (
                <ECSPanel key={item.id} variant="quiet" style={s.checklistItemPanel}>
                  <View style={s.checklistItemHeader}>
                    <View style={s.checklistItemCopy}>
                      <Text style={s.checklistItemTitle}>{item.label}</Text>
                      <Text style={s.checklistItemReason}>{item.reason}</Text>
                    </View>
                    <ECSBadge label={item.status === 'recommended' ? 'Recommended' : item.status.replace(/_/g, ' ')} tone={item.status === 'need_it' ? 'warning' : item.status === 'have_it' ? 'ready' : 'info'} compact />
                  </View>
                  <View style={s.checklistActionRow}>
                    <ECSButton label="Have it" icon="checkmark-circle-outline" variant="secondary" size="compact" onPress={() => saveChecklistStatus(item, 'have_it')} grow />
                    <ECSButton label="Need it" icon="add-circle-outline" variant="secondary" size="compact" onPress={() => saveChecklistStatus(item, 'need_it')} grow />
                    <ECSButton label="Not needed" icon="remove-circle-outline" variant="tertiary" size="compact" onPress={() => saveChecklistStatus(item, 'not_needed')} grow />
                    <ECSButton label="Not sure" icon="help-circle-outline" variant="tertiary" size="compact" onPress={() => saveChecklistStatus(item, 'not_sure')} grow />
                  </View>
                </ECSPanel>
              ))}
            </View>
          )) : (
            <ECSInlineHelper
              variant="standard"
              icon="checkmark-circle-outline"
              text="No optional checklist reminders are active for this vehicle profile."
            />
          )}
          {model.checklistState.prepList.length > 0 ? (
            <View style={s.prepListPanel}>
              <Text style={s.checklistCategoryTitle}>Prep list</Text>
              {model.checklistState.prepList.map((itemId) => {
                const item = model.checklistRecommendations.find((candidate) => candidate.id === itemId);
                return (
                  <View key={itemId} style={s.reminderRow}>
                    <Ionicons name="clipboard-outline" size={13} color={TACTICAL.amber} />
                    <Text style={s.reminderText}>{item?.label ?? itemId}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </ECSPanel>

        <ECSModalShell
          visible={Boolean(pendingChecklistItem)}
          onClose={() => setPendingChecklistItem(null)}
          title="Have It"
          subtitle="Optionally link this reminder to a compartment and loadout weight."
          eyebrow="WHAT DID I FORGET"
          icon="checkmark-circle-outline"
          overlayClass="editor"
          maxWidth={680}
          scrollable
          footer={(
            <ECSOverlayFooter>
              <ECSButton label="Cancel" variant="tertiary" size="compact" onPress={() => setPendingChecklistItem(null)} />
              <ECSButton label="Save" icon="checkmark-circle-outline" variant="primary" size="compact" onPress={confirmChecklistHaveIt} />
            </ECSOverlayFooter>
          )}
        >
          {pendingChecklistItem ? (
            <View style={s.checklistModalStack}>
              <ECSInlineHelper
                variant="partial_data"
                icon="cube-outline"
                text={`${pendingChecklistItem.label} is estimated at ${Math.round(pendingChecklistItem.estimatedWeightLb)} lb. Add it to loadout only if it is normally carried.`}
              />
              <TouchableOpacity
                style={[s.checklistToggle, addChecklistWeight && s.checklistToggleActive]}
                onPress={() => setAddChecklistWeight((value) => !value)}
                accessibilityRole="button"
                accessibilityState={{ selected: addChecklistWeight }}
                accessibilityLabel="Add estimated weight to Build and Loadout"
              >
                <Ionicons name={addChecklistWeight ? 'checkbox-outline' : 'square-outline'} size={16} color={TACTICAL.amber} />
                <Text style={s.checklistToggleText}>Add estimated weight to Build & Loadout</Text>
              </TouchableOpacity>
              {activeChecklistCompartments.length > 0 ? (
                <View style={s.checklistCompartmentGrid}>
                  {activeChecklistCompartments.map((compartment) => (
                    <TouchableOpacity
                      key={compartment.id}
                      style={[s.checklistCompartmentChip, selectedChecklistCompartmentId === compartment.id && s.checklistCompartmentChipActive]}
                      onPress={() => setSelectedChecklistCompartmentId(compartment.id)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedChecklistCompartmentId === compartment.id }}
                      accessibilityLabel={`Store in ${compartment.name}, ${compartment.loadZone}`}
                    >
                      <Text style={s.checklistCompartmentText}>{compartment.name}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <ECSInlineHelper
                  variant="partial_data"
                  icon="information-circle-outline"
                  text="Add a compartment in Build & Loadout before linking checklist weight to storage."
                />
              )}
            </View>
          ) : null}
        </ECSModalShell>
      </>
    );
  }

  return (
    <ECSPanel variant="secondary" style={s.detailPanel}>
      <Text style={s.detailPanelTitle} accessibilityRole="header">Readiness/ECS Score</Text>
      <View style={s.detailGrid}>
        <FleetMetricTile label="Readiness" value={formatFleetScore(scoringResult.readinessScore)} helper={scoringResult.riskLevel} />
        <FleetMetricTile label="Payload" value={formatFleetScore(scoringResult.payloadScore)} helper="weight margin" />
        <FleetMetricTile label="Confidence" value={formatFleetPercent(scoringResult.confidenceScore)} helper={model.verificationStatus} />
        <FleetMetricTile label="Risk Flags" value={String(weightSummary.riskFlags.length)} helper="payload / axle / top-heavy" />
      </View>
      <View style={s.riskFlagStack}>
        {weightSummary.riskFlags.length > 0 ? weightSummary.riskFlags.map((flag) => (
          <ECSInlineHelper
            key={flag.id}
            variant={flag.level === 'critical' || flag.level === 'caution' ? 'warning' : 'partial_data'}
            icon={flag.level === 'critical' || flag.level === 'caution' ? 'warning-outline' : 'information-circle-outline'}
            text={`${flag.label}: ${flag.detail}`}
          />
        )) : (
          <ECSInlineHelper variant="standard" icon="checkmark-circle-outline" text="No active ECS weight risk flags." />
        )}
      </View>
    </ECSPanel>
  );
}

function FleetPremiumVehicleCard({
  model,
  isActive,
  openPanel,
  onProfile,
  onLoadout,
  onWeightSummary,
  onDelete,
  onChecklistSave,
  onMarkReady,
}: {
  model: FleetVehicleCardModel;
  isActive: boolean;
  openPanel: FleetDetailPanelKey | null;
  onProfile: () => void;
  onLoadout: () => void;
  onWeightSummary: () => void;
  onDelete: () => void;
  onChecklistSave: (
    vehicle: Vehicle,
    checklistState: FleetChecklistState,
    buildLoadoutState?: FleetBuildLoadoutState,
  ) => Promise<void> | void;
  onMarkReady: () => void;
}) {
  const { vehicle, weightResult, scoringResult } = model;
  return (
    <ECSCard variant="primary" selected={isActive} style={s.premiumVehicleCard}>
      <View style={s.premiumCardHeader}>
        <View
          style={s.vehicleIdentity}
          accessible
          accessibilityLabel={`${vehicle.name}. ${model.descriptor}.`}
        >
          <View style={s.vehicleIcon}>
            <FleetVehicleCardIcon active={isActive} />
          </View>
          <View style={s.vehicleIdentityText}>
            <View style={s.vehicleTitleRow}>
              <Text
                style={s.vehicleName}
                numberOfLines={2}
                adjustsFontSizeToFit
                minimumFontScale={0.82}
                accessibilityRole="header"
              >
                {vehicle.name}
              </Text>
              <ECSBadge label={model.typeLabel.toUpperCase()} tone="category" compact />
            </View>
            <Text style={s.vehicleMeta} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.84}>{model.descriptor}</Text>
            {model.useCaseChips.length > 0 ? (
              <View style={s.vehicleTagRow}>
                {model.useCaseChips.map((chip) => (
                  <ECSBadge key={chip} label={chip.toUpperCase()} tone="info" compact />
                ))}
              </View>
            ) : null}
          </View>
        </View>
        {isActive ? (
          <ECSButton label="Active" icon="checkmark-circle" variant="active" size="compact" disabled />
        ) : (
          <ECSButton
            label="Make Active"
            icon="radio-button-on-outline"
            variant="secondary"
            size="compact"
            onPress={onMarkReady}
            numberOfLines={2}
            style={s.cardStatusButton}
          />
        )}
      </View>

      <View style={s.premiumMetricGrid}>
        <FleetMetricTile label="Operating" value={formatFleetWeightValue(weightResult.operatingWeight.lbs)} helper="base + build + load" showHelper={false} />
        <FleetMetricTile label="Payload Left" value={formatFleetWeightValue(weightResult.payloadRemaining?.lbs)} helper="GVWR margin" showHelper={false} />
        <FleetMetricTile label="Readiness" value={formatFleetScore(scoringResult.readinessScore)} helper={scoringResult.riskLevel} showHelper={false} />
        <FleetMetricTile label="Confidence" value={formatFleetPercent(weightResult.confidence)} helper={weightResult.baseNetWeight.source} showHelper={false} />
      </View>

      <ECSPanel variant="quiet" style={s.readinessStrip}>
        <View style={s.readinessStripCopy}>
          <Text style={s.readinessStripTitle}>Readiness/ECS Score</Text>
          <Text style={s.readinessStripText} numberOfLines={2}>
            {scoringResult.blockingIssues[0] ?? scoringResult.recommendations[0] ?? 'Vehicle data is ready for ECS scoring.'}
          </Text>
        </View>
        <ECSBadge label={`${formatFleetScore(scoringResult.overallScore)} ECS`} tone={scoringResult.riskLevel === 'critical' ? 'warning' : 'ready'} compact />
      </ECSPanel>

      <ECSCardFooter style={s.actionSection}>
        <ECSActionRow compact style={s.vehicleCardActionRow}>
          <ECSButton label="Vehicle Profile" icon="person-outline" variant="secondary" size="compact" onPress={onProfile} numberOfLines={2} grow />
          <ECSButton label="Build & Loadout" icon="cube-outline" variant="secondary" size="compact" onPress={onLoadout} numberOfLines={2} grow />
        </ECSActionRow>
        <ECSActionRow compact style={[s.actionRow, s.vehicleCardActionRow]}>
          <ECSButton label="Weight Summary" icon="speedometer-outline" variant="secondary" size="compact" onPress={onWeightSummary} numberOfLines={2} grow />
          <ECSButton label="Delete Vehicle" icon="trash-outline" variant="destructive" size="compact" onPress={onDelete} numberOfLines={2} grow />
        </ECSActionRow>
      </ECSCardFooter>

      {openPanel ? (
        <FleetDetailPanel
          model={model}
          panel={openPanel}
          onProfile={onProfile}
          onLoadout={onLoadout}
          onChecklistSave={onChecklistSave}
        />
      ) : null}
    </ECSCard>
  );
}

function LoadoutSummaryMetrics({
  vehicle,
  userId,
  refreshKey = 0,
  metricStyle,
  labelStyle,
  valueStyle,
}: {
  vehicle: Vehicle | null;
  userId: string | null;
  refreshKey?: number;
  metricStyle?: any;
  labelStyle?: any;
  valueStyle?: any;
}) {
  const mountedRef = useRef(true);
  const [summary, setSummary] = useState<LoadoutSummaryState>({
    itemCount: 0,
    totalWeight: 0,
    syncStatus: 'NOT STAGED',
  });
  const [trackedLoadoutId, setTrackedLoadoutId] = useState<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const containerZones = useMemo(
    () => (vehicle ? resolveVehicleContainerZones(vehicle as any) : []),
    [vehicle],
  );

  const refreshSummary = useCallback(async () => {
    if (!vehicle?.id) {
      if (mountedRef.current) {
        setSummary({ itemCount: 0, totalWeight: 0, syncStatus: 'NOT STAGED' });
        setTrackedLoadoutId(null);
      }
      return;
    }

    try {
      const { loadouts } = await loadoutStore.getByVehicleId(vehicle.id, userId);
      const loadout = loadouts.length > 0 ? loadouts[0] : null;

      if (!loadout) {
        if (mountedRef.current) {
          setSummary({ itemCount: 0, totalWeight: 0, syncStatus: 'NOT STAGED' });
          setTrackedLoadoutId(null);
        }
        return;
      }

      const items = await loadoutItemStore.getByLoadoutId(loadout.id, userId);
      const itemCount = Math.max(loadout.item_count ?? 0, loadout._item_count ?? 0, items.length);
      const totalWeight = getTotalLoadoutWeight(items, containerZones);
      const queueStatus = loadoutSyncQueue.getStatus(loadout.id);

      if (mountedRef.current) {
        setTrackedLoadoutId(loadout.id);
        setSummary({
          itemCount,
          totalWeight,
          syncStatus: resolveLoadoutSyncLabel(loadout, queueStatus),
        });
      }
    } catch {
      if (mountedRef.current) {
        setSummary({ itemCount: 0, totalWeight: 0, syncStatus: 'NOT STAGED' });
        setTrackedLoadoutId(null);
      }
    }
  }, [containerZones, userId, vehicle]);

  useEffect(() => {
    void refreshSummary();
  }, [refreshKey, refreshSummary]);

  useEffect(() => {
    return loadoutSyncQueue.onChange(() => {
      if (!trackedLoadoutId || !mountedRef.current) return;
      void refreshSummary();
    });
  }, [refreshSummary, trackedLoadoutId]);

  return (
    <>
      <View style={metricStyle}>
        <Text style={labelStyle}>Loadout Items</Text>
        <Text style={valueStyle} numberOfLines={1}>{summary.itemCount}</Text>
      </View>
      <View style={metricStyle}>
        <Text style={labelStyle}>Loadout Wt</Text>
        <Text style={valueStyle} numberOfLines={1}>{formatLoadoutWeight(summary.totalWeight)}</Text>
      </View>
      <View style={metricStyle}>
        <Text style={labelStyle}>Loadout Sync</Text>
        <Text style={valueStyle} numberOfLines={1}>{summary.syncStatus}</Text>
      </View>
    </>
  );
}


// ============================================================
// ERROR BOUNDARY
// ============================================================
interface EBProps { children: ReactNode }
interface EBState { hasError: boolean; error: Error | null }

class FleetErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: any) { console.error(TAG, 'Error:', error, info?.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <TopoBackground>
          <View style={s.center}>
            <Ionicons name="alert-circle-outline" size={48} color={TACTICAL.danger} />
            <Text style={s.errorTitle}>{ECS_STATE_COPY.recovery.fleetLoadFailure.title}</Text>
            <Text style={s.errorSub}>{ECS_STATE_COPY.recovery.fleetLoadFailure.message}</Text>
            <Text style={s.errorSub}>{ECS_STATE_COPY.recovery.fleetLoadFailure.helper}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => this.setState({ hasError: false, error: null })}>
              <Text style={s.retryBtnText}>{ECS_STATE_COPY.recovery.fleetLoadFailure.ctaLabel.toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </TopoBackground>
      );
    }
    return this.props.children;
  }
}

// ============================================================
// MAIN SCREEN
// ============================================================
function FleetScreenInner() {
  const router = useRouter();
  const { user, authLoading, showToast, activeTrip, userSettings, isOnline } = useApp();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const dockClearance = useMemo(() => getShellBottomClearance(insets.bottom, 8), [insets.bottom]);
  const fleetPremiumRollout = useMemo(() => resolveFleetPremiumReleaseConfig(), []);

  // ── State ─────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(
    vehicleSetupStore.getActiveVehicleId()
  );

  // ── Current Fleet setup state ─────────────────────────
  // When no vehicles exist, keep the Vehicle Command Center visible and open
  // the current Add Vehicle Profile modal from every Fleet Add Vehicle action.

  // ── Fleet Loadout Modal State ─────────────────────────
  // Allows editing a vehicle's loadout from the Fleet tab (post-setup).
  const [loadoutModalVisible, setLoadoutModalVisible] = useState(false);
  const [loadoutModalVehicle, setLoadoutModalVehicle] = useState<Vehicle | null>(null);
  const [buildLoadoutModalVisible, setBuildLoadoutModalVisible] = useState(false);
  const [buildLoadoutModalVehicle, setBuildLoadoutModalVehicle] = useState<Vehicle | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [profileModalVehicle, setProfileModalVehicle] = useState<Vehicle | null>(null);
  const [weightSummaryModalVisible, setWeightSummaryModalVisible] = useState(false);
  const [weightSummaryModalVehicle, setWeightSummaryModalVehicle] = useState<Vehicle | null>(null);

  // ── Loadout Summary Refresh Key ───────────────────────
  // Incremented after loadout modal save to refresh Setup Summary loadout metrics.
  const [loadoutRefreshKey, setLoadoutRefreshKey] = useState(0);

  // ── Fleet Sync Modal State ────────────────────────────
  // Controls visibility of the full sync queue management modal.
  const [supportDataRevision, setSupportDataRevision] = useState(0);
  const [visibleFleetVehicleId, setVisibleFleetVehicleId] = useState<string | null>(null);
  const [carouselWidth, setCarouselWidth] = useState(0);

  const mountedRef = useRef(true);
  const firstRunVccSetupOpenedRef = useRef(false);
  const vehicleCarouselRef = useRef<FlatList<any> | null>(null);
  const visibleFleetVehicleIdRef = useRef<string | null>(visibleFleetVehicleId);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);
  useEffect(() => {
    visibleFleetVehicleIdRef.current = visibleFleetVehicleId;
  }, [visibleFleetVehicleId]);

  // ── Track last-fetched vehicleStore revision to avoid redundant fetches ──
  const lastFetchRevisionRef = useRef(0);
  const lastFocusRefreshRevisionRef = useRef<number | null>(null);
  const fetchInFlightRef = useRef<Promise<void> | null>(null);



  // ── Fetch vehicles ────────────────────────────────────
  const fetchVehicles = useCallback((): Promise<void> => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const task = (async () => {
      setLoading(true);
      try {
        await Promise.all([
          vehicleStore.waitForHydration(),
          vehicleSetupStore.waitForHydration(),
          vehicleSpecStore.waitForHydration(),
          tiresLiftStore.waitForHydration(),
          consumablesStore.waitForHydration(),
        ]);
        const result = await vehicleStore.getAll(user?.id || null);
        if (mountedRef.current) {
          const storedActiveVehicleId = vehicleSetupStore.getActiveVehicleId();
          const reconciledSelection = resolveFleetVehicleSelection(
            result.vehicles,
            storedActiveVehicleId,
            visibleFleetVehicleIdRef.current,
          );

          if (storedActiveVehicleId && !reconciledSelection.activeVehicleId) {
            if (result.vehicles.length === 1) {
              vehicleSetupStore.setActiveVehicleId(result.vehicles[0].id);
            } else {
              vehicleSetupStore.clearActiveVehicleId();
            }
          } else if (!storedActiveVehicleId && result.vehicles.length === 1) {
            vehicleSetupStore.setActiveVehicleId(result.vehicles[0].id);
          }

          setVehicles(result.vehicles);
          setActiveVehicleId(
            reconciledSelection.activeVehicleId ??
              (result.vehicles.length === 1 ? result.vehicles[0].id : null),
          );
          setVisibleFleetVehicleId(reconciledSelection.visibleVehicleId);
          lastFetchRevisionRef.current = vehicleStore.getRevision();
        }
      } catch (err: any) {
        lastFocusRefreshRevisionRef.current = null;
        console.error(TAG, 'fetch error:', err);
      } finally {
        if (mountedRef.current) setLoading(false);
        fetchInFlightRef.current = null;
      }
    })();

    fetchInFlightRef.current = task;
    return task;
  }, [user?.id]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  useEffect(() => {
    const unsub = vehicleSetupStore.subscribe(() => {
      if (!mountedRef.current) return;
      setActiveVehicleId(vehicleSetupStore.getActiveVehicleId());
    });
    return unsub;
  }, []);

  useEffect(() => {
    const bumpSupportRevision = () => {
      if (!mountedRef.current) return;
      setSupportDataRevision((prev) => prev + 1);
    };

    void Promise.all([
      vehicleSpecStore.waitForHydration(),
      tiresLiftStore.waitForHydration(),
      consumablesStore.waitForHydration(),
    ]).then(() => {
      bumpSupportRevision();
    });

    const unsubSpec = vehicleSpecStore.subscribe(() => {
      bumpSupportRevision();
    });
    const unsubTires = tiresLiftStore.subscribe(() => {
      bumpSupportRevision();
    });
    const unsubConsumables = consumablesStore.subscribe(() => {
      bumpSupportRevision();
    });

    return () => {
      unsubSpec();
      unsubTires();
      unsubConsumables();
    };
  }, []);

  // ── Subscribe to vehicleStore changes ─────────────────
  useEffect(() => {
    const refreshCoalescer = createFleetRefreshCoalescer({
      getLastFetchedRevision: () => lastFetchRevisionRef.current,
      refresh: () => {
        if (!mountedRef.current) return;
        fetchVehicles();
        setLoadoutRefreshKey(prev => prev + 1);
      },
      log: (eventName, payload) => {
        logFleetDev(TAG, eventName, payload);
      },
    });
    const unsub = vehicleStore.subscribe((event) => {
      if (!mountedRef.current) return;
      if (event.revision <= lastFetchRevisionRef.current) return;
      refreshCoalescer.schedule(event);
    });
    return () => {
      refreshCoalescer.cancel();
      unsub();
    };
  }, [fetchVehicles]);

  // Re-fetch on focus
  useFocusEffect(useCallback(() => {
    const currentRev = vehicleStore.getRevision();
    if (currentRev > lastFetchRevisionRef.current) {
      if (lastFocusRefreshRevisionRef.current === currentRev) return;
      lastFocusRefreshRevisionRef.current = currentRev;
      logFleetDev(TAG, `Focus refresh: rev ${lastFetchRevisionRef.current} → ${currentRev}`);
      fetchVehicles();
      setLoadoutRefreshKey(prev => prev + 1);
    }
  }, [fetchVehicles]));



  // ── Vehicle list actions ──────────────────────────────
  // ── ADD VEHICLE → Current Vehicle Command Center profile flow ──
  const closeFleetDetailFlows = useCallback(() => {
    setLoadoutModalVisible(false);
    setLoadoutModalVehicle(null);
    setBuildLoadoutModalVisible(false);
    setBuildLoadoutModalVehicle(null);
    setProfileModalVisible(false);
    setProfileModalVehicle(null);
    setWeightSummaryModalVisible(false);
    setWeightSummaryModalVehicle(null);
  }, []);

  const handleAddVehicle = useCallback(() => {
    hapticMicro();
    closeFleetDetailFlows();
    setProfileModalVehicle(null);
    setProfileModalVisible(true);
  }, [closeFleetDetailFlows]);

  const handleOpenVehicleProfile = useCallback((v: Vehicle) => {
    if (!vehicles.some((vehicle) => vehicle.id === v.id)) {
      showToast('Vehicle no longer exists');
      closeFleetDetailFlows();
      return;
    }
    hapticMicro();
    closeFleetDetailFlows();
    setVisibleFleetVehicleId(v.id);
    setProfileModalVehicle(v);
    setProfileModalVisible(true);
  }, [closeFleetDetailFlows, showToast, vehicles]);

  const handleCloseVehicleProfile = useCallback(() => {
    setProfileModalVisible(false);
    setProfileModalVehicle(null);
  }, []);

  const handleVehicleProfileSaved = useCallback(() => {
    fetchVehicles();
    setSupportDataRevision(prev => prev + 1);
  }, [fetchVehicles]);


  // ── Legacy Reconfigure guard ──
  // Hidden legacy panels may still call this handler. Keep it routed into the
  // current Vehicle Profile flow so stale UI state cannot reopen the retired
  // stepped vehicle framework.
  const handleReconfigureVehicle = useCallback((v: Vehicle) => {
    handleOpenVehicleProfile(v);
  }, [handleOpenVehicleProfile]);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    void (async () => {
      const flow = await consumeNavigationFlow('fleet');
      if (!flow || cancelled) return;

      if (flow.intent === 'fleet_add_vehicle') {
        handleAddVehicle();
        return;
      }

      if (flow.intent === 'fleet_edit_vehicle') {
        const vehicleId =
          flow.context && typeof flow.context.vehicleId === 'string'
            ? flow.context.vehicleId
            : null;
        const targetVehicle =
          (vehicleId ? vehicleStore.getById(vehicleId) : null) ??
          (vehicleId ? vehicles.find((candidate) => candidate.id === vehicleId) : null);
        if (targetVehicle) {
          handleOpenVehicleProfile(targetVehicle);
        } else {
          handleAddVehicle();
        }
        return;
      }

      if (flow.intent === 'quick_action' && flow.message) {
        showToast(flow.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handleAddVehicle, handleOpenVehicleProfile, showToast, vehicles]));

  // ── Duplicate Vehicle ──────────────────────────────────
  const handleDuplicateVehicle = useCallback(async (v: Vehicle) => {
    try {
      const result = await vehicleStore.create({
        name: `${v.name} (Copy)`,
        make: v.make || undefined,
        model: v.model || undefined,
        year: v.year || null,
      }, user?.id || null);

      if (!result.vehicle) {
        showToast(result.error || 'Failed to duplicate vehicle');
        return;
      }

      const newId = result.vehicle.id;
      const sourceSpec = vehicleSpecStore.get(v.id);
      const sourceConsumables = consumablesStore.get(v.id);
      const sourceTiresLift = tiresLiftStore.get(v.id);
      const sourceResources = getVehicleResourceProfile(v as any, {
        spec: sourceSpec,
        consumables: sourceConsumables,
        tiresLift: sourceTiresLift,
      });

      if (
        sourceResources.waterCapacityGal != null ||
        sourceResources.batteryUsableWh != null ||
        v.fuel_tank_capacity_gal != null ||
        sourceResources.tireSizeInches != null ||
        sourceResources.suspensionLiftInches > 0 ||
        sourceResources.isLeveled
      ) {
        await vehicleStore.update(newId, {
          water_capacity_gal: sourceResources.waterCapacityGal,
          fuel_tank_capacity_gal: v.fuel_tank_capacity_gal,
          battery_usable_wh: sourceResources.batteryUsableWh,
          tire_size_inches: sourceResources.tireSizeInches,
          suspension_lift_inches: sourceResources.suspensionLiftInches,
          is_leveled: sourceResources.isLeveled,
          front_level_inches: sourceResources.frontLevelInches,
          current_water_gal: sourceResources.currentWaterGallons,
          current_fuel_percent: sourceResources.currentFuelPercent,
          fuel_type: sourceResources.fuelType,
        }, user?.id || null);
      }

      if (sourceSpec) {
        vehicleSpecStore.set(newId, {
          gvwr_lb: sourceSpec.gvwr_lb,
          base_weight_lb: sourceSpec.base_weight_lb,
          fuel_tank_capacity_gal: sourceSpec.fuel_tank_capacity_gal,
          fuel_type: sourceSpec.fuel_type,
          hardware_additions_lb: sourceSpec.hardware_additions_lb,
          tire_size_inches: sourceSpec.tire_size_inches,
          suspension_lift_inches: sourceSpec.suspension_lift_inches,
          is_leveled: sourceSpec.is_leveled,
          front_level_inches: sourceSpec.front_level_inches,
        });
      }

      consumablesStore.set(newId, {
        fuel_percent_current: sourceConsumables.fuel_percent_current,
        fuel_gal_current: sourceConsumables.fuel_gal_current,
        fuel_gal_updated_at: sourceConsumables.fuel_gal_updated_at,
        fuel_source: sourceConsumables.fuel_source,
        water_gal_current: sourceConsumables.water_gal_current,
        water_updated_at: sourceConsumables.water_updated_at,
        water_source: sourceConsumables.water_source,
      });

      const wc = (v as any).wizard_config;
      if (wc) {
        const wcCopy = JSON.parse(JSON.stringify(wc));
        const zonesCopy = (v as any).zones
          ? JSON.parse(JSON.stringify((v as any).zones))
          : [];
        await vehicleStore.finalizeConfig(newId, zonesCopy, wcCopy, user?.id || null);
      }

      if (sourceTiresLift) {
        tiresLiftStore.set(newId, { ...sourceTiresLift });
        logFleetDev(TAG, `Copied tires/lift config from ${v.id} → ${newId}`);
      }

      await fetchVehicles();
      showToast(ECS_TOAST_COPY.vehicleCopied);
      logFleetDev(TAG, `Duplicated vehicle ${v.id} → ${newId}`);
    } catch (err: any) {
      console.error(TAG, 'Duplicate error:', err);
      showToast('Failed to duplicate vehicle');
    }
  }, [user?.id, fetchVehicles, showToast]);

  // ── Delete Vehicle ────────────────────────────────────
  const handleDeleteVehicle = useCallback((v: Vehicle) => {
    if (!vehicles.some((vehicle) => vehicle.id === v.id)) {
      showToast('Vehicle no longer exists');
      void fetchVehicles();
      return;
    }

    const isActiveVehicle = activeVehicleId === v.id;

    const doDelete = async () => {
      try {
        const deletedIndex = vehicles.findIndex((vehicle) => vehicle.id === v.id);
        const remainingVehicles = vehicles.filter((vehicle) => vehicle.id !== v.id);
        const nextVisibleIndex = Math.max(0, Math.min(deletedIndex, remainingVehicles.length - 1));
        const nextVisibleVehicle = remainingVehicles[nextVisibleIndex] ?? null;

        setVisibleFleetVehicleId(nextVisibleVehicle?.id ?? null);
        setVehicles(remainingVehicles);

        if (remainingVehicles.length === 0) {
          setActiveVehicleId(null);
          vehicleSetupStore.clearActiveVehicleId();
          setLoadoutModalVisible(false);
          setLoadoutModalVehicle(null);
          setBuildLoadoutModalVisible(false);
          setBuildLoadoutModalVehicle(null);
          setWeightSummaryModalVisible(false);
          setWeightSummaryModalVehicle(null);
          setProfileModalVehicle((currentVehicle) => (
            currentVehicle?.id === v.id ? null : currentVehicle
          ));
        } else if (isActiveVehicle && nextVisibleVehicle) {
          setActiveVehicleId(nextVisibleVehicle.id);
          vehicleSetupStore.setActiveVehicleId(nextVisibleVehicle.id);
        }

        try {
          consumablesStore.remove(v.id);
          logFleetDev(TAG, `Removed consumables for vehicle ${v.id}`);
        } catch (e) {
          console.warn(TAG, 'Failed to remove consumables:', e);
        }

        const result = await vehicleStore.delete(v.id, user?.id || null);
        if (result.success) {
          showToast(ECS_TOAST_COPY.vehicleDeleted);
          logFleetDev(TAG, `Deleted vehicle ${v.id} (from: ${result.deletedFrom})`);
        } else {
          console.error(TAG, 'Delete failed:', result.error);
          showToast(result.error || 'Failed to delete vehicle');
          await fetchVehicles();
        }
      } catch (err: any) {
        console.error(TAG, 'Delete error:', err);
        showToast('Failed to delete vehicle');
        await fetchVehicles();
      }
    };

    showEcsConfirmDialog({
      title: 'Delete Vehicle',
      message: 'Are you sure you want to delete this vehicle?',
      confirmLabel: 'Yes/Delete',
      cancelLabel: 'Cancel',
      destructive: true,
      onConfirm: doDelete,
    });
  }, [user?.id, activeVehicleId, fetchVehicles, showToast, vehicles]);


  // ── CONFIGURE LOADOUT → Open Fleet Loadout Modal ────────
  const handleOpenLoadoutModal = useCallback((v: Vehicle) => {
    if (!vehicles.some((vehicle) => vehicle.id === v.id)) {
      showToast('Vehicle no longer exists');
      closeFleetDetailFlows();
      return;
    }
    hapticMicro();
    closeFleetDetailFlows();
    setVisibleFleetVehicleId(v.id);
    setLoadoutModalVehicle(v);
    setLoadoutModalVisible(true);
  }, [closeFleetDetailFlows, showToast, vehicles]);

  const handleOpenBuildLoadoutModal = useCallback((v: Vehicle) => {
    if (!vehicles.some((vehicle) => vehicle.id === v.id)) {
      showToast('Vehicle no longer exists');
      closeFleetDetailFlows();
      return;
    }
    hapticMicro();
    closeFleetDetailFlows();
    setVisibleFleetVehicleId(v.id);
    setBuildLoadoutModalVehicle(v);
    setBuildLoadoutModalVisible(true);
  }, [closeFleetDetailFlows, showToast, vehicles]);

  const handleOpenWeightSummaryModal = useCallback((v: Vehicle) => {
    if (!vehicles.some((vehicle) => vehicle.id === v.id)) {
      showToast('Vehicle no longer exists');
      closeFleetDetailFlows();
      return;
    }
    hapticMicro();
    closeFleetDetailFlows();
    setVisibleFleetVehicleId(v.id);
    setWeightSummaryModalVehicle(v);
    setWeightSummaryModalVisible(true);
  }, [closeFleetDetailFlows, showToast, vehicles]);

  const handleCloseBuildLoadoutModal = useCallback(() => {
    setBuildLoadoutModalVisible(false);
    setBuildLoadoutModalVehicle(null);
  }, []);

  const handleCloseWeightSummaryModal = useCallback(() => {
    setWeightSummaryModalVisible(false);
    setWeightSummaryModalVehicle(null);
  }, []);

  const handleCloseLoadoutModal = useCallback(() => {
    setLoadoutModalVisible(false);
    setLoadoutModalVehicle(null);
    setLoadoutRefreshKey(prev => prev + 1);
  }, []);


  const handleLoadoutSaved = useCallback(() => {
    fetchVehicles();
    setLoadoutRefreshKey(prev => prev + 1);
  }, [fetchVehicles]);

  const handleBuildLoadoutSaved = useCallback(() => {
    fetchVehicles();
    setSupportDataRevision(prev => prev + 1);
  }, [fetchVehicles]);

  const handleChecklistSave = useCallback(async (
    vehicle: Vehicle,
    checklistState: FleetChecklistState,
    buildLoadoutState?: FleetBuildLoadoutState,
  ) => {
    const currentWizard = ((vehicle as any).wizard_config && typeof (vehicle as any).wizard_config === 'object')
      ? (vehicle as any).wizard_config
      : {};
    await vehicleStore.update(vehicle.id, {
      wizard_config: {
        ...currentWizard,
        fleet_checklist: checklistState,
        ...(buildLoadoutState ? { fleet_build_loadout: buildLoadoutState } : {}),
      },
    } as any, user?.id || null);
    if (Object.values(checklistState.itemStates).some((item) => item.status === 'have_it')) {
      emitFleetTelemetryEvent('fleet_checklist_completed', {
        vehicleId: vehicle.id,
        meta: {
          completedCount: Object.values(checklistState.itemStates).filter((item) => item.status === 'have_it').length,
          prepCount: checklistState.prepList.length,
        },
      });
    }
    showToast('Fleet checklist updated');
    fetchVehicles();
    setSupportDataRevision(prev => prev + 1);
  }, [fetchVehicles, showToast, user?.id]);

  const handleMarkVehicleReady = useCallback((vehicleId: string) => {
    const targetVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);
    if (!targetVehicle) return;
    const isMultiVehicleFleet = vehicles.length > 1;

    vehicleSetupStore.setActiveVehicleId(vehicleId);
    void stageNavigationFlow({
      source: 'fleet',
      target: isMultiVehicleFleet ? 'fleet' : 'dashboard',
      intent: 'vehicle_ready_confirmed',
      label: isMultiVehicleFleet ? 'Deploy Vehicle' : 'Vehicle Ready',
      message: isMultiVehicleFleet
        ? 'Fleet will keep this rig active for the current command posture.'
        : 'Dashboard will reflect the active rig on the next return.',
      context: { vehicleId },
    });
    hapticMicro();
    showToast(ECS_TOAST_COPY.vehicleReady);
    if (!isMultiVehicleFleet) {
      router.replace('/dashboard');
    }
  }, [router, showToast, vehicles]);

  const fleetVehicleSelection = useMemo(
    () => resolveFleetVehicleSelection(vehicles, activeVehicleId, visibleFleetVehicleId),
    [activeVehicleId, vehicles, visibleFleetVehicleId],
  );
  const activeVehicle = fleetVehicleSelection.activeVehicle;
  const visibleFleetVehicle = fleetVehicleSelection.visibleVehicle;
  const selectedPreviewVehicle = visibleFleetVehicle;
  const visibleFleetVehicleIndex = fleetVehicleSelection.visibleVehicleIndex;
  const fleetFrameStyle = useMemo(
    () => ({
      alignSelf: 'center' as const,
      width: '100%' as const,
      maxWidth: adaptive.contentMaxWidth,
      paddingHorizontal: adaptive.horizontalPadding,
    }),
    [adaptive.contentMaxWidth, adaptive.horizontalPadding],
  );
  const showFleetPreviewPane = false;
  const listSummaryMetricStyle = showFleetPreviewPane ? s.summaryMetricWide : null;
  const previewSummaryMetricStyle = showFleetPreviewPane ? s.summaryMetricPreviewWide : null;
  const previewVehicleData = useMemo(() => {
    const hydrationTick = supportDataRevision;
    void hydrationTick;
    if (!selectedPreviewVehicle) return null;
    const spec = vehicleSpecStore.get(selectedPreviewVehicle.id);
    const tlProfile = tiresLiftStore.get(selectedPreviewVehicle.id);
    const consumables = consumablesStore.get(selectedPreviewVehicle.id);
    const resourceProfile = getVehicleResourceProfile(selectedPreviewVehicle as any, { spec, consumables, tiresLift: tlProfile });
    const powerSummary = formatPowerStorage(resourceProfile.batteryUsableWh);
    const vehicleAny = selectedPreviewVehicle as any;
    const accessoryData = buildVehicleAccessorySummary(vehicleAny, {
      maxPills: 8,
      maxAccessorySummaryItems: 4,
    });
    const wc = accessoryData.wizardConfig;
    const descriptor = [selectedPreviewVehicle.year, selectedPreviewVehicle.make, selectedPreviewVehicle.model]
      .filter(Boolean)
      .join(' ')
      || (typeof wc.vehicle_type === 'string'
        ? wc.vehicle_type.replace(/_/g, ' ').toUpperCase()
        : 'Vehicle profile');

    return {
      descriptor,
      zonePills: accessoryData.zonePills,
      accessorySummary: accessoryData.accessorySummary,
      summaryMetrics: [
        { label: 'Fuel', value: formatFleetMetric(spec?.fuel_tank_capacity_gal || selectedPreviewVehicle.fuel_tank_capacity_gal, 'gal') },
        { label: 'Water', value: formatFleetMetric(resourceProfile.waterCapacityGal, 'gal') },
        { label: 'Power', value: powerSummary || '--' },
        { label: 'Lift / Level', value: formatFleetMetric(resourceProfile.suspensionLiftInches, 'in') },
        { label: 'Tires', value: formatFleetMetric(resourceProfile.tireSizeInches, 'in') },
      ],
    };
  }, [selectedPreviewVehicle, supportDataRevision]);
  const selectedVehicleBaseline = useMemo(() => {
    if (!selectedPreviewVehicle) {
      return {
        hasSelectedVehicle: false,
        hasVehicleProfile: false,
        hasConfiguredIdentity: false,
        hasFuelCapacity: false,
        hasWaterCapacity: false,
        hasPowerStorage: false,
        hasTireSize: false,
        hasLiftProfile: false,
        hasAccessoriesConfigured: false,
        hasLoadout: false,
        hasLiveTelemetry: false,
      };
    }

    const selectedAny = selectedPreviewVehicle as any;
    const accessoryData = buildVehicleAccessorySummary(selectedAny, {
      maxPills: 6,
      maxAccessorySummaryItems: 4,
    });
    const wizardConfig = accessoryData.wizardConfig ?? null;
    const spec = vehicleSpecStore.get(selectedPreviewVehicle.id);
    const tiresLift = tiresLiftStore.get(selectedPreviewVehicle.id);
    const consumables = consumablesStore.get(selectedPreviewVehicle.id);
    const resourceProfile = getVehicleResourceProfile(selectedPreviewVehicle as any, { spec, consumables, tiresLift });
    const accessoryCount = accessoryData.containerZones.length;
    const loadoutReady = isLoadoutReadyForBuild(selectedPreviewVehicle.id, null);
    const activeTripAny = activeTrip as any;
    const selectedVehicleIsActive = !activeVehicleId || activeVehicleId === selectedPreviewVehicle.id;
    const hasLiveTelemetry = Boolean(
      selectedVehicleIsActive &&
      activeTripAny &&
      (
        activeTripAny.fuelPercent != null ||
        activeTripAny.batteryPercent != null ||
        activeTripAny.gpsStatus === 'live' ||
        activeTripAny.gpsHasFix === true
      ),
    );

    return {
      hasSelectedVehicle: true,
      hasVehicleProfile:
        Boolean(wizardConfig) ||
        [selectedPreviewVehicle.make, selectedPreviewVehicle.model, selectedPreviewVehicle.year]
          .filter(Boolean)
          .length >= 2,
      hasConfiguredIdentity:
        [selectedPreviewVehicle.make, selectedPreviewVehicle.model, selectedPreviewVehicle.year]
          .filter(Boolean)
          .length >= 2 ||
        typeof wizardConfig?.vehicle_type === 'string',
      hasFuelCapacity: Number(spec?.fuel_tank_capacity_gal ?? selectedPreviewVehicle.fuel_tank_capacity_gal ?? 0) > 0,
      hasWaterCapacity: resourceProfile.waterCapacityGal != null && resourceProfile.waterCapacityGal >= 0,
      hasPowerStorage: resourceProfile.batteryUsableWh != null && resourceProfile.batteryUsableWh >= 0,
      hasTireSize: Number(resourceProfile.tireSizeInches ?? 0) > 0,
      hasLiftProfile: resourceProfile.suspensionLiftInches != null || resourceProfile.isLeveled,
      hasAccessoriesConfigured: accessoryCount > 0,
      hasLoadout: loadoutReady,
      hasLiveTelemetry,
    };
  }, [selectedPreviewVehicle, activeTrip, activeVehicleId]);

  const fleetAIResources = useMemo(() => {
    if (!selectedPreviewVehicle) return null;
    const spec = vehicleSpecStore.get(selectedPreviewVehicle.id);
    const tiresLift = tiresLiftStore.get(selectedPreviewVehicle.id);
    const consumables = consumablesStore.get(selectedPreviewVehicle.id);
    const resourceProfile = getVehicleResourceProfile(selectedPreviewVehicle as any, { spec, consumables, tiresLift });
    return {
      fuelTankCapacityGal: resourceProfile.fuelTankCapacityGal,
      fuelPercent: resourceProfile.currentFuelPercent,
      fuelGallons: resourceProfile.currentFuelGallons,
      fuelWeightLb: resourceProfile.currentFuelWeightLb,
      waterCapacityGal: resourceProfile.waterCapacityGal,
      waterGallons: resourceProfile.currentWaterGallons,
      waterWeightLb: resourceProfile.currentWaterWeightLb,
      batteryCapacityWh: resourceProfile.batteryUsableWh,
      tireSizeInches: resourceProfile.tireSizeInches,
      suspensionLiftInches: resourceProfile.suspensionLiftInches,
      isLeveled: resourceProfile.isLeveled,
      frontLevelInches: resourceProfile.frontLevelInches,
      loadoutItemCount: selectedVehicleBaseline.hasLoadout ? 1 : 0,
      accessoryInstalledCount: selectedVehicleBaseline.hasAccessoriesConfigured ? 1 : 0,
      connectivityLevel: isOnline ? 'live' : 'offline',
    };
  }, [selectedPreviewVehicle, selectedVehicleBaseline.hasAccessoriesConfigured, selectedVehicleBaseline.hasLoadout, isOnline]);

  const fleetAITelemetry = useMemo(() => {
    const activeTripAny = activeTrip as any;
    return {
      fuelPercent: activeTripAny?.fuelPercent ?? null,
      batteryPercent: activeTripAny?.batteryPercent ?? null,
      gpsStatus: activeTripAny?.gpsStatus ?? null,
      gpsHasFix: activeTripAny?.gpsHasFix ?? null,
    };
  }, [activeTrip]);

  const selectedFleetFabricPayload = useMemo(() => {
    void supportDataRevision;
    void loadoutRefreshKey;
    return selectedPreviewVehicle ? buildFleetVehicleCardModel(selectedPreviewVehicle).fabricPayload : null;
  }, [loadoutRefreshKey, selectedPreviewVehicle, supportDataRevision]);

  const { aiState, fleetView } = useECSAIHook({
    activeRun: activeTrip,
    vehicleConfig: selectedFleetFabricPayload
      ? { ...(selectedPreviewVehicle as any), fleetFabric: selectedFleetFabricPayload }
      : selectedPreviewVehicle,
    telemetry: fleetAITelemetry,
    resources: fleetAIResources,
    userPreferences: userSettings,
    enabled: vehicles.length > 0,
    options: {
      enableWhenIdle: true,
      emitBriefWhenNoSignals: true,
    },
  });
  const fleetHeaderCommandContext = useMemo(
    () => ({
      expeditionPhase: aiState?.expeditionPhase ?? null,
      operationalState: aiState?.operationalState ?? null,
      liveStatus: aiState?.liveStatus ?? null,
    }),
    [aiState?.expeditionPhase, aiState?.liveStatus, aiState?.operationalState],
  );

  const fleetCommandState = useMemo(() => (
    selectFleetCommandState({
      fleetView,
      expeditionPhase: aiState?.expeditionPhase,
      expeditionPhaseLabel: aiState?.expeditionPhaseLabel,
      operationalState: aiState?.operationalState,
      operationalSummary: aiState?.operationalSummary,
      liveStatus: aiState?.liveStatus ?? null,
      isOnline,
      vehicleCount: vehicles.length,
      hasActiveVehicle: Boolean(activeVehicle),
      hasSelectedVehicle: selectedVehicleBaseline.hasSelectedVehicle,
      hasVehicleProfile: selectedVehicleBaseline.hasVehicleProfile,
      hasConfiguredIdentity: selectedVehicleBaseline.hasConfiguredIdentity,
      hasFuelCapacity: selectedVehicleBaseline.hasFuelCapacity,
      hasWaterCapacity: selectedVehicleBaseline.hasWaterCapacity,
      hasPowerStorage: selectedVehicleBaseline.hasPowerStorage,
      hasTireSize: selectedVehicleBaseline.hasTireSize,
      hasLiftProfile: selectedVehicleBaseline.hasLiftProfile,
      hasAccessoriesConfigured: selectedVehicleBaseline.hasAccessoriesConfigured,
      hasLoadout: selectedVehicleBaseline.hasLoadout,
      hasLiveTelemetry: selectedVehicleBaseline.hasLiveTelemetry,
    })
  ), [
    activeVehicle,
    aiState?.expeditionPhase,
    aiState?.expeditionPhaseLabel,
    aiState?.liveStatus,
    aiState?.operationalState,
    aiState?.operationalSummary,
    fleetView,
    isOnline,
    selectedVehicleBaseline,
    vehicles.length,
  ]);

  const fleetCardModels = useMemo(() => {
    void supportDataRevision;
    void loadoutRefreshKey;
    return vehicles.map(buildFleetVehicleCardModel);
  }, [loadoutRefreshKey, supportDataRevision, vehicles]);

  const fleetOverviewMetrics = useMemo(() => {
    const vehicleCount = fleetCardModels.length;
    const averageConfidence = vehicleCount > 0
      ? Math.round(
          fleetCardModels.reduce((sum, model) => sum + model.weightResult.confidence, 0) / vehicleCount,
        )
      : null;
    const totalOperatingWeight = fleetCardModels.reduce(
      (sum, model) => sum + model.weightResult.operatingWeight.lbs,
      0,
    );
    const needingVerification = fleetCardModels.filter((model) => model.needsVerification).length;
    return {
      vehicleCount,
      averageConfidence,
      totalOperatingWeight,
      needingVerification,
    };
  }, [fleetCardModels]);

  useEffect(() => {
    if (loading || authLoading) return;
    if (activeVehicleId && !activeVehicle) {
      logFleetDev(TAG, 'Clearing stale active vehicle context after fleet load', {
        activeVehicleId,
        vehicleCount: vehicles.length,
      });
      vehicleSetupStore.clearActiveVehicleId();
    }
  }, [activeVehicle, activeVehicleId, authLoading, loading, vehicles.length]);

  useEffect(() => {
    if (loading || authLoading || vehicles.length > 0) return;

    setVisibleFleetVehicleId((currentId) => (currentId == null ? currentId : null));

    if (activeVehicleId) {
      vehicleSetupStore.clearActiveVehicleId();
    }

    if (loadoutModalVisible || loadoutModalVehicle) {
      setLoadoutModalVisible(false);
      setLoadoutModalVehicle(null);
    }

    if (buildLoadoutModalVisible || buildLoadoutModalVehicle) {
      setBuildLoadoutModalVisible(false);
      setBuildLoadoutModalVehicle(null);
    }

    if (weightSummaryModalVisible || weightSummaryModalVehicle) {
      setWeightSummaryModalVisible(false);
      setWeightSummaryModalVehicle(null);
    }

    if (profileModalVehicle) {
      setProfileModalVisible(false);
      setProfileModalVehicle(null);
    }
  }, [
    activeVehicleId,
    authLoading,
    buildLoadoutModalVehicle,
    buildLoadoutModalVisible,
    loading,
    loadoutModalVehicle,
    loadoutModalVisible,
    profileModalVehicle,
    vehicles.length,
    weightSummaryModalVehicle,
    weightSummaryModalVisible,
  ]);

  useEffect(() => {
    if (loading || authLoading || vehicles.length > 0 || profileModalVisible) return;
    if (firstRunVccSetupOpenedRef.current) return;

    firstRunVccSetupOpenedRef.current = true;
    closeFleetDetailFlows();
    setProfileModalVehicle(null);
    setProfileModalVisible(true);
  }, [
    authLoading,
    closeFleetDetailFlows,
    loading,
    profileModalVisible,
    vehicles.length,
  ]);

  useEffect(() => {
    if (vehicles.length === 0) {
      setVisibleFleetVehicleId(null);
      return;
    }

    setVisibleFleetVehicleId((currentId) => {
      if (currentId && vehicles.some((vehicle) => vehicle.id === currentId)) {
        return currentId;
      }
      return activeVehicleId && vehicles.some((vehicle) => vehicle.id === activeVehicleId)
        ? activeVehicleId
        : vehicles[0].id;
    });
  }, [activeVehicleId, vehicles]);

  useEffect(() => {
    if (loading) return;
    const vehicleExists = (vehicle: Vehicle | null) =>
      !vehicle || vehicles.some((candidate) => candidate.id === vehicle.id);

    if (
      !vehicleExists(loadoutModalVehicle) ||
      !vehicleExists(buildLoadoutModalVehicle) ||
      !vehicleExists(profileModalVehicle) ||
      !vehicleExists(weightSummaryModalVehicle)
    ) {
      console.warn(TAG, 'Recovering Fleet detail flow after missing vehicle reference');
      closeFleetDetailFlows();
      setVisibleFleetVehicleId((currentId) => {
        if (currentId && vehicles.some((vehicle) => vehicle.id === currentId)) {
          return currentId;
        }
        return vehicles[0]?.id ?? null;
      });
    }
  }, [
    buildLoadoutModalVehicle,
    closeFleetDetailFlows,
    loadoutModalVehicle,
    loading,
    profileModalVehicle,
    vehicles,
    weightSummaryModalVehicle,
  ]);

  const handleVehicleCarouselMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const pageWidth = event.nativeEvent.layoutMeasurement.width || carouselWidth;
      if (pageWidth <= 0) return;
      const nextIndex = Math.round(event.nativeEvent.contentOffset.x / pageWidth);
      const nextVehicle = vehicles[Math.max(0, Math.min(nextIndex, vehicles.length - 1))];
      if (nextVehicle) {
        setVisibleFleetVehicleId(nextVehicle.id);
      }
    },
    [carouselWidth, vehicles],
  );

  useEffect(() => {
    if (carouselWidth <= 0 || vehicles.length <= 1) return;
    vehicleCarouselRef.current?.scrollToIndex({
      index: visibleFleetVehicleIndex,
      animated: false,
    });
  }, [carouselWidth, vehicles.length, visibleFleetVehicleIndex]);

  const renderVehicleCard = useCallback(({ item: v }: { item: Vehicle }) => {
    const isActive = v.id === activeVehicleId;
    const isVisible = v.id === selectedPreviewVehicle?.id;
    const spec = vehicleSpecStore.get(v.id);
    const tlProfile = tiresLiftStore.get(v.id);
    const consumables = consumablesStore.get(v.id);
    const resourceProfile = getVehicleResourceProfile(v as any, { spec, consumables, tiresLift: tlProfile });
    const powerSummary = formatPowerStorage(resourceProfile.batteryUsableWh);

    const vAny = v as any;
    const accessoryData = buildVehicleAccessorySummary(vAny, {
      maxPills: 6,
      maxAccessorySummaryItems: 3,
    });
    const wc = accessoryData.wizardConfig;

    const vehicleDescriptor = [v.year, v.make, v.model].filter(Boolean).join(' ')
      || (typeof wc.vehicle_type === 'string'
        ? wc.vehicle_type.replace(/_/g, ' ').toUpperCase()
        : 'Vehicle profile');

    const summaryMetrics = [
      { label: 'Fuel', value: formatFleetMetric(spec?.fuel_tank_capacity_gal || v.fuel_tank_capacity_gal, 'gal') },
      { label: 'Water', value: formatFleetMetric(resourceProfile.waterCapacityGal, 'gal') },
      { label: 'Power', value: powerSummary || '--' },
      { label: 'Lift / Level', value: formatFleetMetric(resourceProfile.suspensionLiftInches, 'in') },
      { label: 'Tires', value: formatFleetMetric(resourceProfile.tireSizeInches, 'in') },
    ];

    return (
      <View style={[s.carouselPage, { width: Math.max(carouselWidth, 1) }]}>
        <ECSCard variant="primary" selected={isVisible} style={s.vehicleCard}>
          <View style={s.vehicleCardTop}>
            <View style={s.vehicleIdentity}>
              <View style={[s.vehicleIcon, isActive && s.vehicleIconActive]}>
                <FleetVehicleCardIcon active={isActive} />
              </View>
              <View style={s.vehicleIdentityText}>
                <Text style={s.vehicleName} numberOfLines={2}>{v.name}</Text>
                <Text style={s.vehicleMeta} numberOfLines={1}>{vehicleDescriptor}</Text>
              </View>
            </View>
            {isActive ? (
              <ECSButton
                label="Active"
                icon="checkmark-circle"
                variant="active"
                size="medium"
                disabled
                style={s.activeVehicleButton}
              />
            ) : (
              <ECSButton
                label={vehicles.length > 1 ? 'Deploy Vehicle' : 'Vehicle Ready'}
                icon="checkmark-circle-outline"
                variant="primary"
                size="medium"
                onPress={() => handleMarkVehicleReady(v.id)}
                style={s.activeVehicleButton}
              />
            )}
          </View>

          <ECSPanel variant="secondary" style={s.summaryPanel}>
            <Text style={s.summaryLabel}>SETUP SUMMARY</Text>
            <View style={s.summaryGrid}>
              {summaryMetrics.map((metric) => (
                <View key={metric.label} style={[s.summaryMetric, listSummaryMetricStyle]}>
                  <Text style={s.summaryMetricLabel}>{metric.label}</Text>
                  <Text style={s.summaryMetricValue} numberOfLines={1}>{metric.value}</Text>
                </View>
              ))}
              <LoadoutSummaryMetrics
                vehicle={v}
                userId={user?.id || null}
                refreshKey={loadoutRefreshKey}
                metricStyle={[s.summaryMetric, listSummaryMetricStyle]}
                labelStyle={s.summaryMetricLabel}
                valueStyle={s.summaryMetricValue}
              />
            </View>
          </ECSPanel>

          <View style={[s.supportPanel, s.hiddenPanel]}>
            <Text style={s.supportPanelLabel}>ACCESSORY SYSTEMS</Text>
            {accessoryData.hasZoneSummary ? (
              <View style={s.zonePillsRow}>
                <Ionicons name="grid-outline" size={10} color={TACTICAL.amber} />
                {accessoryData.zonePills.map((pill) => (
                  <ECSBadge
                    key={pill.id}
                    label={pill.label}
                    icon={pill.icon as any}
                    tone="category"
                    compact
                    colorOverride={pill.color}
                    style={s.zoneBadge}
                  />
                ))}
                {accessoryData.extraZoneCount > 0 && (
                  <View style={s.zonePillMore}>
                    <Text style={s.zonePillMoreText}>+{accessoryData.extraZoneCount}</Text>
                  </View>
                )}
              </View>
            ) : accessoryData.accessorySummary.length > 0 ? (
              <View style={s.accessorySummaryRow}>
                <Ionicons name="layers-outline" size={10} color={TACTICAL.textMuted} />
                <Text style={s.accessorySummaryText}>
                  {accessoryData.accessorySummary.join(' Â· ')}
                </Text>
              </View>
            ) : (
              <View style={s.accessorySummaryRow}>
                <Ionicons name="layers-outline" size={10} color={TACTICAL.textMuted} />
                <Text style={s.accessorySummaryText}>No accessories configured yet</Text>
              </View>
            )}
          </View>

          <ECSCardFooter style={s.actionSection}>
            <ECSActionRow compact>
              <ECSButton
                label="Edit Setup"
                icon="construct-outline"
                variant="secondary"
                size="medium"
                onPress={() => handleReconfigureVehicle(v)}
                grow
              />
              <ECSButton
                label="Loadout"
                icon="cube-outline"
                variant="secondary"
                size="medium"
                onPress={() => handleOpenLoadoutModal(v)}
                grow
              />
            </ECSActionRow>

            <ECSActionRow compact style={s.actionRow}>
              <ECSButton
                label="Copy"
                icon="copy-outline"
                variant="tertiary"
                size="medium"
                onPress={() => handleDuplicateVehicle(v)}
                grow
              />
              <ECSButton
                label="Delete"
                icon="trash-outline"
                variant="destructive"
                size="medium"
                onPress={() => handleDeleteVehicle(v)}
                grow
              />
            </ECSActionRow>
          </ECSCardFooter>
        </ECSCard>
      </View>
    );
  }, [
    activeVehicleId,
    carouselWidth,
    handleDeleteVehicle,
    handleDuplicateVehicle,
    handleMarkVehicleReady,
    handleOpenLoadoutModal,
    handleReconfigureVehicle,
    listSummaryMetricStyle,
    loadoutRefreshKey,
    selectedPreviewVehicle?.id,
    user?.id,
    vehicles.length,
  ]);

  // ── Auth loading ──────────────────────────────────────
  if (authLoading) {
    return (
      <TopoBackground>
        <View style={[s.safeContainer, { paddingBottom: dockClearance }]}>
          <Header title="Fleet Center" commandContext={fleetHeaderCommandContext} />
          <View style={s.loadingShell}>
            <ECSTransientNotice
              kind="loading"
              label="Loading Fleet Data..."
              message="Preparing vehicle context, sync state, and active-rig readiness."
            />
            <ECSLoadingCard title="Fleet" message="Hydrating vehicle profiles and saved setup." />
            <ECSLoadingCard title="Active Rig" message="Restoring your current vehicle selection." />
          </View>
        </View>
      </TopoBackground>
    );
  }

  // ── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <TopoBackground>
        <View style={[s.safeContainer, { paddingBottom: dockClearance }]}>
          <Header title="Fleet Center" commandContext={fleetHeaderCommandContext} />
          <View style={s.loadingShell}>
            <ECSTransientNotice
              kind="syncing"
              label="Loading Vehicle Data..."
              message="Building Fleet summaries and restoring the active rig."
            />
            <ECSLoadingCard title="Vehicle Profile" message="Loading saved capacities, loadout, and mounted systems." />
            <ECSLoadingCard title="Fleet Readiness" message="Preparing scoring, confidence, and active-rig actions." />
          </View>
        </View>
      </TopoBackground>
    );
  }

  if (!fleetPremiumRollout.premiumFleetEnabled) {
    return (
      <TopoBackground>
        <View style={[s.safeContainer, { paddingBottom: dockClearance }]}>
          <Header title="Fleet Center" commandContext={fleetHeaderCommandContext} />
          <View style={[s.emptyStateShell, fleetFrameStyle]}>
            <ECSStateMessage
              title="Fleet rollout paused"
              message={getFleetPremiumRolloutDisabledCopy('premiumFleetEnabled')}
              helper="Your saved vehicle data is untouched. ECS will re-enable Fleet when this rollout resumes."
              icon="pause-circle-outline"
            />
          </View>
        </View>
      </TopoBackground>
    );
  }

  // ============================================================
  // NO VEHICLES → Keep the current Fleet structure visible:
  // Readiness Command, Vehicle Command Center, and the current empty card area.
  // ============================================================
  return (
    <TopoBackground>
      <View style={[s.safeContainer, { paddingBottom: dockClearance }]}>
        <Header title="Fleet Center" commandContext={fleetHeaderCommandContext} />

        <View style={[s.fleetMainBody, fleetFrameStyle]}>
          <FleetCommandSurface state={fleetCommandState} />
          <FleetOverviewHeader
            metrics={fleetOverviewMetrics}
            onAddVehicle={handleAddVehicle}
          />
          {fleetCardModels.length === 0 ? (
            <View style={s.emptyStateShell}>
              <ECSStateMessage
                title={ECS_STATE_COPY.fleet.noVehiclesConfigured.title}
                message={ECS_STATE_COPY.fleet.noVehiclesConfigured.message}
                helper={ECS_STATE_COPY.fleet.noVehiclesConfigured.helper}
                icon="car-outline"
              />
            </View>
          ) : (
            <View
              style={s.fleetCardViewport}
              onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
            >
              {fleetCardModels.length > 1 ? (
                <Text style={s.swipeHint}>Swipe for other fleet vehicles</Text>
              ) : null}
              <FlatList
                ref={vehicleCarouselRef}
                data={fleetCardModels}
                keyExtractor={(model) => model.vehicle.id}
                renderItem={({ item: model }) => (
                  <View style={[s.carouselPage, { width: Math.max(carouselWidth, 1) }]}>
                    <FleetPremiumVehicleCard
                      model={model}
                      isActive={model.vehicle.id === activeVehicleId}
                      openPanel={null}
                      onProfile={() => handleOpenVehicleProfile(model.vehicle)}
                      onLoadout={() => handleOpenBuildLoadoutModal(model.vehicle)}
                      onWeightSummary={() => handleOpenWeightSummaryModal(model.vehicle)}
                      onDelete={() => handleDeleteVehicle(model.vehicle)}
                      onChecklistSave={handleChecklistSave}
                      onMarkReady={() => handleMarkVehicleReady(model.vehicle.id)}
                    />
                  </View>
                )}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                onMomentumScrollEnd={handleVehicleCarouselMomentumEnd}
                extraData={`${activeVehicleId}:${loadoutRefreshKey}:${supportDataRevision}:${carouselWidth}`}
                style={s.vehicleCarousel}
                contentContainerStyle={s.vehicleCarouselContent}
                getItemLayout={(_, index) => ({
                  length: Math.max(carouselWidth, 1),
                  offset: Math.max(carouselWidth, 1) * index,
                  index,
                })}
              />
              {fleetCardModels.length > 1 ? (
                <View style={s.carouselDots} pointerEvents="none">
                  {fleetCardModels.map((model, index) => (
                    <View
                      key={`fleet-dot-${model.vehicle.id}`}
                      style={[
                        s.carouselDot,
                        index === visibleFleetVehicleIndex && s.carouselDotActive,
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          )}
        </View>

        {/* Scrollable vehicle list — flex: 1 fills space between header and bottom actions */}
        <View style={[fleetFrameStyle, s.hiddenPanel]}>
          <FleetCommandSurface state={fleetCommandState} />
        </View>
        <View
          style={[
            s.hiddenPanel,
            s.contentRow,
            showFleetPreviewPane && s.contentRowExpanded,
            showFleetPreviewPane && { gap: adaptive.panelGap + 2 },
            fleetFrameStyle,
          ]}
        >
        <View
          style={s.carouselShell}
          onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}
        >
          {vehicles.length === 0 ? (
            <View style={s.emptyStateShell}>
              <ECSStateMessage
                title={ECS_STATE_COPY.fleet.noVehiclesConfigured.title}
                message={ECS_STATE_COPY.fleet.noVehiclesConfigured.message}
                helper={ECS_STATE_COPY.fleet.noVehiclesConfigured.helper}
                icon="car-outline"
              />
            </View>
          ) : (
            <>
              {vehicles.length > 1 ? (
                <Text style={s.swipeHint}>Swipe for other fleet vehicles</Text>
              ) : null}
              <FlatList
                ref={vehicleCarouselRef}
                data={vehicles}
                keyExtractor={(vehicle) => vehicle.id}
                renderItem={renderVehicleCard}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                bounces={false}
                onMomentumScrollEnd={handleVehicleCarouselMomentumEnd}
                initialScrollIndex={vehicles.length > 1 ? visibleFleetVehicleIndex : 0}
                extraData={`${activeVehicleId}:${loadoutRefreshKey}:${supportDataRevision}:${carouselWidth}`}
                style={s.vehicleCarousel}
                contentContainerStyle={s.vehicleCarouselContent}
                getItemLayout={(_, index) => ({
                  length: Math.max(carouselWidth, 1),
                  offset: Math.max(carouselWidth, 1) * index,
                  index,
                })}
              />
              {vehicles.length > 1 ? (
                <View style={s.carouselDots} pointerEvents="none">
                  {vehicles.map((vehicle, index) => (
                    <View
                      key={`fleet-dot-${vehicle.id}`}
                      style={[
                        s.carouselDot,
                        index === visibleFleetVehicleIndex && s.carouselDotActive,
                      ]}
                    />
                  ))}
                </View>
              ) : null}
            </>
          )}
        </View>
        {false ? (
        <ScrollView
          style={[s.scrollArea, showFleetPreviewPane && s.scrollAreaExpanded]}
          contentContainerStyle={[
            s.scrollContent,
            showFleetPreviewPane && s.scrollContentExpanded,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {vehicles.length === 0 ? (
            <View style={s.emptyStateShell}>
              <ECSStateMessage
                title={ECS_STATE_COPY.fleet.noVehiclesConfigured.title}
                message={ECS_STATE_COPY.fleet.noVehiclesConfigured.message}
                helper={ECS_STATE_COPY.fleet.noVehiclesConfigured.helper}
                icon="car-outline"
              />
            </View>
          ) : (
            <>
              {vehicles.map((v) => {
            const isActive = v.id === activeVehicleId;
            const spec = vehicleSpecStore.get(v.id);
            const tlProfile = tiresLiftStore.get(v.id);
            const consumables = consumablesStore.get(v.id);
            const resourceProfile = getVehicleResourceProfile(v as any, { spec, consumables, tiresLift: tlProfile });
            const powerSummary = formatPowerStorage(resourceProfile.batteryUsableWh);

            const vAny = v as any;
            const accessoryData = buildVehicleAccessorySummary(vAny, {
              maxPills: 6,
              maxAccessorySummaryItems: 3,
            });
            const wc = accessoryData.wizardConfig;

            const vehicleDescriptor = [v.year, v.make, v.model].filter(Boolean).join(' ')
              || (typeof wc.vehicle_type === 'string'
                ? wc.vehicle_type.replace(/_/g, ' ').toUpperCase()
                : 'Vehicle profile');

            const summaryMetrics = [
              { label: 'Fuel', value: formatFleetMetric(spec?.fuel_tank_capacity_gal || v.fuel_tank_capacity_gal, 'gal') },
              { label: 'Water', value: formatFleetMetric(resourceProfile.waterCapacityGal, 'gal') },
              { label: 'Power', value: powerSummary || '--' },
              { label: 'Lift / Level', value: formatFleetMetric(resourceProfile.suspensionLiftInches, 'in') },
              { label: 'Tires', value: formatFleetMetric(resourceProfile.tireSizeInches, 'in') },
            ];

            return (
              <ECSCard key={v.id} variant="primary" selected={isActive} style={s.vehicleCard}>
                <View style={s.vehicleCardTop}>
                  <View style={s.vehicleIdentity}>
                    <View style={[s.vehicleIcon, isActive && s.vehicleIconActive]}>
                      <FleetVehicleCardIcon active={isActive} />
                    </View>
                    <View style={s.vehicleIdentityText}>
                      <Text style={s.vehicleName} numberOfLines={2}>{v.name}</Text>
                      <Text style={s.vehicleMeta} numberOfLines={1}>{vehicleDescriptor}</Text>
                    </View>
                  </View>
                  {isActive ? (
                    <ECSButton
                      label="Active"
                      icon="checkmark-circle"
                      variant="active"
                      size="medium"
                      disabled
                      style={s.activeVehicleButton}
                    />
                  ) : (
                    <ECSButton
                      label={vehicles.length > 1 ? 'Deploy Vehicle' : 'Vehicle Ready'}
                      icon="checkmark-circle-outline"
                      variant="primary"
                      size="medium"
                      onPress={() => handleMarkVehicleReady(v.id)}
                      style={s.activeVehicleButton}
                    />
                  )}
                </View>

                <ECSPanel variant="secondary" style={s.summaryPanel}>
                  <Text style={s.summaryLabel}>SETUP SUMMARY</Text>
                  <View style={s.summaryGrid}>
                    {summaryMetrics.map((metric) => (
                      <View key={metric.label} style={[s.summaryMetric, listSummaryMetricStyle]}>
                        <Text style={s.summaryMetricLabel}>{metric.label}</Text>
                        <Text style={s.summaryMetricValue} numberOfLines={1}>{metric.value}</Text>
                      </View>
                    ))}
                    <LoadoutSummaryMetrics
                      vehicle={v}
                      userId={user?.id || null}
                      refreshKey={loadoutRefreshKey}
                      metricStyle={[s.summaryMetric, listSummaryMetricStyle]}
                      labelStyle={s.summaryMetricLabel}
                      valueStyle={s.summaryMetricValue}
                    />
                  </View>
                </ECSPanel>

                <View style={[s.supportPanel, s.hiddenPanel]}>
                  <Text style={s.supportPanelLabel}>ACCESSORY SYSTEMS</Text>
                  {accessoryData.hasZoneSummary ? (
                    <View style={s.zonePillsRow}>
                      <Ionicons name="grid-outline" size={10} color={TACTICAL.amber} />
                      {accessoryData.zonePills.map((pill) => (
                        <ECSBadge
                          key={pill.id}
                          label={pill.label}
                          icon={pill.icon as any}
                          tone="category"
                          compact
                          colorOverride={pill.color}
                          style={s.zoneBadge}
                        />
                      ))}
                      {accessoryData.extraZoneCount > 0 && (
                        <View style={s.zonePillMore}>
                          <Text style={s.zonePillMoreText}>+{accessoryData.extraZoneCount}</Text>
                        </View>
                      )}
                    </View>
                  ) : accessoryData.accessorySummary.length > 0 ? (
                    <View style={s.accessorySummaryRow}>
                      <Ionicons name="layers-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={s.accessorySummaryText}>
                        {accessoryData.accessorySummary.join(' · ')}
                      </Text>
                    </View>
                  ) : (
                    <View style={s.accessorySummaryRow}>
                      <Ionicons name="layers-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={s.accessorySummaryText}>No accessories configured yet</Text>
                    </View>
                  )}
                </View>

                {/* Action buttons */}
                <ECSCardFooter style={s.actionSection}>
                  <ECSActionRow compact>
                    <ECSButton
                      label="Edit Setup"
                      icon="construct-outline"
                      variant="secondary"
                      size="medium"
                      onPress={() => handleReconfigureVehicle(v)}
                      grow
                    />
                    <ECSButton
                      label="Loadout"
                      icon="cube-outline"
                      variant="secondary"
                      size="medium"
                      onPress={() => handleOpenLoadoutModal(v)}
                      grow
                    />
                  </ECSActionRow>

                  <ECSActionRow compact style={s.actionRow}>
                    <ECSButton
                      label="Copy"
                      icon="copy-outline"
                      variant="tertiary"
                      size="medium"
                      onPress={() => handleDuplicateVehicle(v)}
                      grow
                    />
                    <ECSButton
                      label="Delete"
                      icon="trash-outline"
                      variant="destructive"
                      size="medium"
                      onPress={() => handleDeleteVehicle(v)}
                      grow
                    />
                  </ECSActionRow>
                </ECSCardFooter>
              </ECSCard>
            );
          })}
            </>
          )}

          {/* Bottom breathing room so last item isn't flush against bottom actions */}
          <View style={{ height: 8 }} />
        </ScrollView>
        ) : null}
        {showFleetPreviewPane && selectedPreviewVehicle && previewVehicleData ? (
          <View
            style={[
              s.previewRail,
              {
                minWidth: adaptive.fleet.previewMinWidth,
                maxWidth: adaptive.fleet.previewMaxWidth,
              },
            ]}
          >
            <ECSPanel variant="secondary" style={s.previewPanel}>
              <View style={s.previewHeader}>
                <View style={s.previewTitleWrap}>
                  <Text style={s.previewTitle}>{selectedPreviewVehicle.name}</Text>
                  <Text style={s.previewSubtitle}>{previewVehicleData.descriptor}</Text>
                </View>
                <ECSBadge
                  label={selectedPreviewVehicle.id === activeVehicleId ? 'ACTIVE' : 'STANDBY'}
                  icon={selectedPreviewVehicle.id === activeVehicleId ? 'checkmark-circle-outline' : 'radio-button-off-outline'}
                  tone={selectedPreviewVehicle.id === activeVehicleId ? 'ready' : 'warning'}
                  compact
                />
              </View>

              <View style={s.summaryGrid}>
                {previewVehicleData.summaryMetrics.map((metric) => (
                  <View key={`preview-${metric.label}`} style={[s.summaryMetric, previewSummaryMetricStyle]}>
                    <Text style={s.summaryMetricLabel}>{metric.label}</Text>
                    <Text style={s.summaryMetricValue} numberOfLines={1}>{metric.value}</Text>
                  </View>
                ))}
                <LoadoutSummaryMetrics
                  vehicle={selectedPreviewVehicle}
                  userId={user?.id || null}
                  refreshKey={loadoutRefreshKey}
                  metricStyle={[s.summaryMetric, previewSummaryMetricStyle]}
                  labelStyle={s.summaryMetricLabel}
                  valueStyle={s.summaryMetricValue}
                />
              </View>

              <View style={[s.supportPanel, s.hiddenPanel]}>
                <Text style={s.supportPanelLabel}>ACCESSORY SYSTEMS</Text>
                {previewVehicleData.zonePills.length > 0 ? (
                  <View style={s.zonePillsRow}>
                    {previewVehicleData.zonePills.map((pill) => (
                      <ECSBadge
                        key={`preview-zone-${pill.id}`}
                        label={pill.label}
                        icon={pill.icon as any}
                        tone="category"
                        compact
                        colorOverride={pill.color}
                        style={s.zoneBadge}
                      />
                    ))}
                  </View>
                ) : (
                  <View style={s.accessorySummaryRow}>
                    <Ionicons name="layers-outline" size={10} color={TACTICAL.textMuted} />
                    <Text style={s.accessorySummaryText}>
                      {previewVehicleData.accessorySummary.length > 0
                        ? previewVehicleData.accessorySummary.join(' · ')
                        : 'No accessory systems configured yet'}
                    </Text>
                  </View>
                )}
              </View>

              <ECSActionRow compact style={s.previewActionRow}>
                {selectedPreviewVehicle.id !== activeVehicleId ? (
                  <ECSButton
                    label={vehicles.length > 1 ? 'Deploy Vehicle' : 'Vehicle Ready'}
                    icon="checkmark-circle-outline"
                    variant="primary"
                    size="medium"
                    onPress={() => handleMarkVehicleReady(selectedPreviewVehicle.id)}
                    grow
                  />
                ) : null}
                <ECSButton
                  label="Edit Setup"
                  icon="construct-outline"
                  variant="secondary"
                  size="medium"
                  onPress={() => handleReconfigureVehicle(selectedPreviewVehicle)}
                  grow
                />
              </ECSActionRow>
            </ECSPanel>
          </View>
        ) : null}
        </View>

        {/* ── Fixed Bottom Actions — visible only once vehicles exist ── */}
        {vehicles.length > 0 && (
          <></>
        )}

        {/* Footer info line */}
        <View style={[s.footer, fleetFrameStyle]}>
          <Text style={s.footerText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}>
            {vehicles.length === 0
              ? 'ECS FLEET | NO VEHICLES STAGED'
              : `ECS FLEET | ${vehicles.length} VEHICLE${vehicles.length !== 1 ? 'S' : ''} | ${activeVehicle ? activeVehicle.name : 'NONE SELECTED'}`}
          </Text>
        </View>
      </View>

      {/* Fleet Loadout Modal — full-screen loadout editor for post-setup editing */}
      <FleetLoadoutModal
        visible={loadoutModalVisible}
        vehicle={loadoutModalVehicle}
        userId={user?.id || null}
        onClose={handleCloseLoadoutModal}
        onSaved={handleLoadoutSaved}
        showToast={showToast}
      />

      <FleetVehicleProfileModal
        visible={profileModalVisible}
        vehicle={profileModalVehicle}
        userId={user?.id || null}
        onClose={handleCloseVehicleProfile}
        onSaved={handleVehicleProfileSaved}
        showToast={showToast}
      />

      <FleetBuildLoadoutModal
        visible={buildLoadoutModalVisible}
        vehicle={buildLoadoutModalVehicle}
        userId={user?.id || null}
        onClose={handleCloseBuildLoadoutModal}
        onSaved={handleBuildLoadoutSaved}
        showToast={showToast}
      />

      <ECSModalShell
        visible={weightSummaryModalVisible}
        onClose={handleCloseWeightSummaryModal}
        title="Weight Summary"
        subtitle={weightSummaryModalVehicle?.name ?? 'Vehicle payload and balance'}
        eyebrow="FLEET"
        icon="scale-outline"
        overlayClass="info"
        maxWidth={Math.max(980, adaptive.contentMaxWidth ?? 980)}
        maxHeightFraction={0.94}
        minHeightFraction={0.88}
        topClearanceOverride={Math.max(insets.top + 8, 8)}
        bottomClearanceOverride={dockClearance}
        showHandle={false}
        scrollable={false}
        bodyStyle={s.weightSummaryModalBody}
        contentContainerStyle={s.weightSummaryModalContent}
      >
        <WeightDashboardPanel
          vehicleId={weightSummaryModalVehicle?.id ?? null}
          compact={false}
        />
      </ECSModalShell>

      {/* Expedition Summary Sheet removed — handled exclusively by dashboard.tsx */}

      {/* Fleet Sync Modal — full sync queue management accessible from header indicator */}
    </TopoBackground>
  );
}



// ============================================================
// EXPORTED SCREEN
// ============================================================

// EXPORTED SCREEN
// ============================================================
export default function FleetScreen() {
  return (
    <FleetErrorBoundary>
      <FleetScreenInner />
    </FleetErrorBoundary>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  safeContainer: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  commandWrap: {
    paddingTop: 12,
    paddingBottom: 6,
  },
  commandPanel: {
    gap: 10,
  },
  commandTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  commandTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  commandEyebrow: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.amber,
    marginBottom: 6,
  },
  commandTitle: {
    ...ECS_TEXT.cardTitle,
  },
  commandSummary: {
    ...ECS_TEXT.body,
    color: TACTICAL.text,
    lineHeight: 18,
  },
  commandDetail: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 17,
    marginTop: -2,
  },
  commandBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  commandSecondaryRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  commandSecondaryPill: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    backgroundColor: ECS_SURFACE.background.quiet,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  commandSecondaryText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.textMuted,
  },
  hiddenPanel: {
    display: 'none',
  },
  premiumScrollArea: {
    flex: 1,
  },
  premiumScrollContent: {
    paddingTop: 12,
    paddingBottom: 18,
    gap: 12,
  },
  fleetMainBody: {
    flex: 1,
    minHeight: 0,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 10,
  },
  fleetCardViewport: {
    flex: 1,
    minHeight: 0,
  },
  weightSummaryModalBody: {
    flex: 1,
    minHeight: 0,
    padding: 0,
  },
  weightSummaryModalContent: {
    flex: 1,
    minHeight: 0,
    padding: 0,
  },
  overviewCard: {
    gap: 12,
  },
  overviewHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 12,
  },
  overviewTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  overviewEyebrow: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.amber,
    marginBottom: 6,
  },
  overviewTitle: {
    ...ECS_TEXT.screenTitle,
  },
  overviewSubtitle: {
    ...ECS_TEXT.body,
    color: TACTICAL.text,
    lineHeight: 18,
    marginTop: 6,
  },
  overviewAddButton: {
    minWidth: 132,
    alignSelf: 'flex-start',
  },
  overviewMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  premiumMetricTile: {
    flexGrow: 1,
    flexBasis: 132,
    minWidth: 0,
    gap: 2,
  },
  metricTileContent: {
    minWidth: 0,
    gap: 2,
  },
  metricHelper: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
  premiumVehicleStack: {
    gap: 12,
  },
  premiumVehicleCard: {
    gap: 12,
  },
  premiumCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  vehicleTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    minWidth: 0,
  },
  cardStatusButton: {
    minWidth: 104,
    flexShrink: 0,
  },
  premiumMetricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  readinessStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  readinessStripCopy: {
    flex: 1,
    minWidth: 0,
  },
  readinessStripTitle: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.amber,
    marginBottom: 4,
  },
  readinessStripText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
  detailPanel: {
    marginTop: 2,
    gap: 10,
  },
  detailPanelTitle: {
    ...ECS_TEXT.cardTitle,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailCopy: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
  detailWarningList: {
    gap: 6,
  },
  detailWarningText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.danger,
    lineHeight: 16,
  },
  riskFlagStack: {
    gap: 8,
  },
  riskFlagRow: {
    gap: 5,
  },
  riskFlagText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
  mathDetailStack: {
    gap: 7,
  },
  checklistHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  checklistTitleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  checklistCategory: {
    gap: 8,
  },
  checklistCategoryTitle: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.amber,
  },
  checklistItemPanel: {
    gap: 9,
  },
  checklistItemHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  checklistItemCopy: {
    flex: 1,
    minWidth: 0,
  },
  checklistItemTitle: {
    ...ECS_TEXT.cardTitle,
  },
  checklistItemReason: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 16,
    marginTop: 3,
  },
  checklistActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  prepListPanel: {
    gap: 7,
  },
  checklistModalStack: {
    gap: 12,
  },
  checklistToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  checklistToggleActive: {
    borderColor: ECS_STATUS.tone.selected.border,
    backgroundColor: ECS_STATUS.tone.selected.background,
  },
  checklistToggleText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.text,
    flex: 1,
  },
  checklistCompartmentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  checklistCompartmentChip: {
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minWidth: 132,
  },
  checklistCompartmentChipActive: {
    borderColor: ECS_STATUS.tone.selected.border,
    backgroundColor: ECS_STATUS.tone.selected.background,
  },
  checklistCompartmentText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.text,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reminderText: {
    ...ECS_TEXT.helper,
    flex: 1,
    color: TACTICAL.text,
    lineHeight: 16,
  },

  // Loading
  loadingText: { fontSize: 12, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  loadingShell: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 18,
  },

  // Error
  errorTitle: { fontSize: 16, fontWeight: '900', color: TACTICAL.danger, letterSpacing: 1.5, textAlign: 'center' },
  errorSub: { fontSize: 12, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 18 },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: TACTICAL.accent,
    paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, marginTop: 8,
  },
  retryBtnText: { fontSize: 12, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },

  // Empty state fallback; the primary zero-vehicle state is the current Fleet
  // Vehicle Command Center plus this empty card area.
  emptyCard: {
    alignItems: 'center', padding: 32, backgroundColor: TACTICAL.panel, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.3)', gap: 10,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(62, 79, 60, 0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyTitle: { fontSize: 13, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },
  emptyDesc: { fontSize: 11, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 16 },
  addBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 24, backgroundColor: TACTICAL.amber, borderRadius: 10, marginTop: 4,
  },
  addBtnPrimaryText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },

  // Scroll area — fills space between header and bottom actions
  scrollArea: {
    flex: 1,
  },
  scrollAreaExpanded: {
    flex: 1.12,
    minWidth: 0,
  },
  scrollContent: {
    paddingVertical: 16,
    // flexGrow ensures content fills available space when few items
    flexGrow: 1,
  },
  scrollContentExpanded: {
    paddingRight: 12,
  },
  contentRow: {
    flex: 1,
    width: '100%',
    minHeight: 0,
  },
  contentRowExpanded: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 16,
  },
  carouselShell: {
    flex: 1,
    minHeight: 0,
    paddingVertical: 10,
  },
  vehicleCarousel: {
    flex: 1,
    minHeight: 0,
  },
  vehicleCarouselContent: {
    alignItems: 'stretch',
  },
  carouselPage: {
    flex: 1,
    paddingHorizontal: 0,
    justifyContent: 'flex-start',
  },
  swipeHint: {
    ...ECS_TEXT.helper,
    color: 'rgba(183, 191, 199, 0.72)',
    textAlign: 'center',
    marginBottom: 8,
  },
  carouselDots: {
    minHeight: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 6,
    marginBottom: 8,
  },
  carouselDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(183, 191, 199, 0.28)',
  },
  carouselDotActive: {
    width: 18,
    backgroundColor: TACTICAL.amber,
  },
  previewRail: {
    flex: 0.88,
    minWidth: 340,
    maxWidth: 460,
    paddingVertical: 16,
  },
  previewPanel: {
    flex: 1,
    gap: 12,
  },
  previewHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  previewTitleWrap: {
    flex: 1,
    minWidth: 0,
  },
  previewEyebrow: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.amber,
    marginBottom: 6,
  },
  previewTitle: {
    ...ECS_TEXT.cardTitle,
  },
  previewSubtitle: {
    ...ECS_TEXT.cardSubtitle,
    marginTop: 4,
  },
  previewActionRow: {
    marginTop: 'auto',
    paddingTop: 10,
  },
  vehicleResultsMeta: {
    marginBottom: 12,
  },
  emptyStateShell: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 12,
  },
  emptyStateCard: {
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 28,
    backgroundColor: 'rgba(17, 22, 26, 0.94)',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.18)',
  },
  emptyStateIconWrap: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.22)',
  },
  emptyStateTitle: {
    ...ECS_TEXT.dialogTitle,
    textAlign: 'center',
  },
  emptyStateCopy: {
    ...ECS_TEXT.dialogBody,
    lineHeight: 18,
    textAlign: 'center',
    maxWidth: 320,
    marginTop: ECS_TEXT_SPACING.emptyTitleToBody - 2,
  },
  emptyStateHelper: {
    ...ECS_TEXT.helper,
    color: 'rgba(183, 191, 199, 0.76)',
    textAlign: 'center',
    marginTop: -2,
  },
  emptyStateCta: {
    minWidth: 196,
    height: 48,
    marginTop: 2,
    borderRadius: 14,
    backgroundColor: TACTICAL.amber,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  emptyStateCtaText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.1,
  },

  // Vehicle Card
  vehicleCard: {
    marginBottom: 10,
  },
  vehicleCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  vehicleIdentity: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  vehicleIdentityText: { flex: 1, minWidth: 0 },
  vehicleIcon: {
    width: 48, height: 48, borderRadius: 15, backgroundColor: ECS_SURFACE.background.compact,
    borderWidth: 1, borderColor: ECS_SURFACE.border.quiet,
    alignItems: 'center', justifyContent: 'center',
  },
  vehicleIconActive: {
    backgroundColor: ECS_STATUS.tone.selected.background,
    borderColor: ECS_STATUS.tone.selected.border,
  },
  vehicleName: { ...ECS_TEXT.cardTitle, lineHeight: 20 },
  vehicleMeta: { ...ECS_TEXT.cardSubtitle, marginTop: ECS_TEXT_SPACING.titleToSubtitle - 1, lineHeight: 15 },
  vehicleTagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  readyBadge: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderColor: 'rgba(196, 138, 44, 0.24)',
  },
  readyBadgeText: { fontSize: 8, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 0.9 },
  pendingBadge: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
    borderColor: 'rgba(62, 79, 60, 0.24)',
  },
  pendingBadgeText: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.9 },
  activeVehicleButton: {
    minWidth: 136,
  },
  cardSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.18)',
  },
  cardSectionLabel: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.textMuted,
    marginBottom: 8,
  },
  summaryPanel: {
    marginTop: 12,
  },
  summaryLabel: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.textMuted,
    marginBottom: 10,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
  },
  summaryMetric: {
    width: '33.33%',
    minWidth: 86,
    paddingRight: 8,
  },
  summaryMetricWide: {
    width: '20%',
    minWidth: 96,
  },
  summaryMetricPreviewWide: {
    width: '50%',
    minWidth: 112,
  },
  summaryMetricLabel: {
    ...ECS_TEXT.statLabel,
    marginBottom: 3,
  },
  summaryMetricValue: {
    ...ECS_TEXT.statValue,
  },
  supportPanel: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.18)',
  },
  supportPanelLabel: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.textMuted,
    marginBottom: 8,
  },
  supportChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  supportChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: 'rgba(102, 187, 106, 0.12)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(102, 187, 106, 0.22)',
  },
  supportChipText: { fontSize: 9, fontWeight: '700', color: '#81C784', letterSpacing: 0.3 },
  actionSection: {
    marginTop: 10,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  vehicleCardActionRow: {
    minHeight: 42,
  },

  // Stats
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(62, 79, 60, 0.12)', borderRadius: 7, borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.18)',
  },
  statChipText: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.3 },
  statusChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(196, 138, 44, 0.1)', borderRadius: 7, borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.22)',
  },
  statusChipText: { fontSize: 9, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 0.5 },

  // Accessories summary
  accessorySummaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: 'rgba(62, 79, 60, 0.08)', borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.16)',
  },
  accessorySummaryText: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 0.2, flex: 1, lineHeight: 13 },

  // Vehicle actions — legacy (kept for reference, replaced by actionGrid)
  vehicleActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  vehicleActionsSecondary: { flexDirection: 'row', gap: 6, marginTop: 5 },

  // ── Action Grid — 2 rows × 3 columns ──────────────────
  // Row 1: Reconfigure (blue) / Loadout (amber) / Make Active (green)
  actionGrid: {
    flexDirection: 'row', gap: 5, marginTop: 8,
  },
  // Row 2: Copy / Delete
  actionGrid2: {
    flexDirection: 'row', gap: 5, marginTop: 5,
  },

  // ── Grid Button Base ──────────────────────────────────
  // Shared layout: flex: 1 ensures equal width, centered icon+label
  gridBtnBlue: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderRadius: 9, borderWidth: 1,
    borderColor: 'rgba(79, 195, 247, 0.24)',
    backgroundColor: 'rgba(79, 195, 247, 0.05)',
  },
  gridBtnBlueText: { fontSize: 8, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.5 },

  gridBtnAmber: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderRadius: 9, borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.28)',
    backgroundColor: 'rgba(196, 138, 44, 0.06)',
  },
  gridBtnAmberText: { fontSize: 8, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.5 },

  gridBtnGreen: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderRadius: 9, borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.24)',
    backgroundColor: 'rgba(102, 187, 106, 0.05)',
  },
  gridBtnGreenText: { fontSize: 8, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.5 },
  gridBtnGreenActive: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderRadius: 9, borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.35)',
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
  },
  gridBtnGreenActiveText: { fontSize: 8, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 0.5 },

  gridBtnMuted: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderRadius: 9, borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },
  gridBtnMutedText: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.5 },

  gridBtnDanger: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 10, borderRadius: 9, borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.24)',
    backgroundColor: 'rgba(192, 57, 43, 0.04)',
  },
  gridBtnDangerText: { fontSize: 8, fontWeight: '800', color: TACTICAL.danger, letterSpacing: 0.5 },

  // Legacy action button styles (kept for compatibility)
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.4)', backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },
  actionBtnText: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  actionBtnDanger: {
    paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(192, 57, 43, 0.3)', backgroundColor: 'rgba(192, 57, 43, 0.06)',
  },

  // Legacy edit accessories / loadout button styles (replaced by grid buttons)
  editAccessoriesBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(79, 195, 247, 0.5)',
    backgroundColor: 'rgba(79, 195, 247, 0.08)',
  },
  editAccessoriesBtnText: { fontSize: 9, fontWeight: '800', color: '#4FC3F7', letterSpacing: 0.8 },
  loadoutActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(196, 138, 44, 0.5)', backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  loadoutActionBtnText: { fontSize: 9, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 0.8 },


  // Add button
  addVehicleButton: {
    marginTop: 4,
  },

  // ── Fixed Bottom Actions — pinned above CommandDock ──
  bottomActions: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: GOLD_RAIL.sectionWidth,
    borderTopColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(11, 15, 18, 0.98)',
  },
  bottomBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.5)', backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  bottomBtnText: { fontSize: 10, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1 },
  bottomReadyButton: {
    width: '100%',
  },
  bottomHelperRow: {
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  bottomHelperText: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  bottomSubhelperText: {
    ...ECS_TEXT.helper,
    color: 'rgba(183, 191, 199, 0.72)',
    textAlign: 'center',
    marginTop: 4,
  },

  // Footer info line
  footer: {
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(11, 15, 18, 0.98)',
  },
  footerText: { ...ECS_TEXT.sectionTitle, color: TACTICAL.textMuted, textAlign: 'center' },

  // Phase 4: Zone Summary Pills
  zonePillsRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4,
    paddingHorizontal: 4, paddingVertical: 2,
  },
  zoneBadge: {
    maxWidth: '100%',
  },
  zonePill: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 5, borderWidth: 1,
  },
  zonePillText: {
    fontSize: 7, fontWeight: '800', letterSpacing: 0.5,
  },
  zonePillMore: {
    paddingHorizontal: 6, paddingVertical: 3,
    borderRadius: 5, backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1, borderColor: 'rgba(196, 138, 44, 0.3)',
  },
  zonePillMoreText: {
    fontSize: 7, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 0.5,
  },

  // Tires / Lift summary chip (green-tinted, distinct from other stat chips)
  tiresLiftChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(102, 187, 106, 0.12)', borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(102, 187, 106, 0.25)',
  },
  tiresLiftChipText: { fontSize: 9, fontWeight: '700', color: '#81C784', letterSpacing: 0.3 },

});





