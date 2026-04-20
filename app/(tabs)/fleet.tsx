// ============================================================
// FLEET TAB — Vehicle List + Fleet Management
// ============================================================
// Vehicle management layer — stable, infrastructure-focused.
//
// Behavior:
//   vehicles.count == 0  → System Configuration Required (SetupTakeover)
//   vehicles.count == 1  → Header: "My Vehicle"
//   vehicles.count >= 2  → Header: "Fleet"
//
// Vehicle cards:
//   - Vehicle name
//   - Stat chips (fuel, water capacity)
//   - Accessories summary
//   - Buttons: Make Active/Active, Reconfigure, Loadout, Copy, Delete
//
// IMPORTANT: Vehicle creation and editing is handled EXCLUSIVELY
// by the Vehicle Configuration Wizard at /(tabs)/vehicle-config.
// This screen is the vehicle LIST only — no inline wizard.
//
// Sync Status Integration:
//   - FleetSyncStatusIndicator in header shows synced/pending/conflict state
//   - Tapping opens FleetSyncModal with full SyncQueueManager
//   - Integrates LiveSyncBanner + ConflictResolutionModal
// ============================================================

import React, { useState, useCallback, useEffect, useMemo, useRef, Component, type ReactNode } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import TopoBackground from '../../components/TopoBackground';
import { ECSInlineHelper, ECSStateMessage } from '../../components/ECSStateMessage';
import { ECSButton } from '../../components/ECSButton';
import ECSActionRow from '../../components/ECSActionRow';
import { ECSCard, ECSCardFooter, ECSPanel } from '../../components/ECSSurface';
import { ECSBadge } from '../../components/ECSStatus';
import { ECSResultsMetaRow } from '../../components/ECSResults';
import { ECSLoadingCard, ECSTransientNotice } from '../../components/ECSLoading';
import { vehicleStore } from '../../lib/vehicleStore';

import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleSpecStore } from '../../lib/vehicleSpecStore';
import { consumablesStore } from '../../lib/consumablesStore';
import { getZoneSummaryPills } from '../../lib/vehicleSystemsIntegration';
import { computeFullBuildWeightBreakdown, type BuildWeightBreakdown } from '../../lib/weightEngine';
import { frameworkToSelections, type AccessoryFramework, type ContainerZone } from '../../lib/accessoryFramework';
import { isLoadoutReadyForBuild } from '../../lib/loadoutStore';
import useECSAIHook from '../../lib/ai/useECSAI';
import { selectFleetCommandState, type FleetCommandState, type FleetCommandBadgeTone } from '../../lib/fleet/fleetCommandSelectors';



import { getVehicleIcon } from '../../lib/vehicleIcons';
import type { Vehicle } from '../../lib/types';
import { getVehicleResourceProfile } from '../../lib/vehicleResourceProfile';
import {
  getConfigSummary,
} from '../../components/vehicle-wizard/WizardData';
import { hapticMicro } from '../../lib/haptics';
// ExpeditionSummarySheet removed from fleet.tsx — dashboard.tsx is the single
// source of truth for the completion modal to prevent duplicate popups.
import FleetLoadoutModal from '../../components/fleet/FleetLoadoutModal';

import VehicleLoadoutSummary from '../../components/fleet/VehicleLoadoutSummary';
import FleetSyncStatusIndicator from '../../components/fleet/FleetSyncStatusIndicator';
import FleetSyncModal from '../../components/fleet/FleetSyncModal';
import { tiresLiftStore } from '../../lib/tiresLiftStore';
import { getShellBottomClearance, getShellHeaderTopPadding } from '../../lib/shellLayout';
import { showEcsConfirmDialog } from '../../lib/ecsConfirmDialog';
import { consumeNavigationFlow, stageNavigationFlow } from '../../lib/ecsNavigationFlow';
import { ECS_CONFIRM_COPY, ECS_STATE_COPY, ECS_TOAST_COPY } from '../../lib/ecsStateCopy';
import { ECS_TEXT, ECS_TEXT_SPACING } from '../../lib/ecsTypographyTokens';
import { useAdaptiveLayout } from '../../lib/useAdaptiveLayout';




const TAG = '[FLEET]';

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
      return '#4CAF50';
    case 'ready_for_staging':
      return TACTICAL.amber;
    case 'ready_with_limitations':
    case 'partially_configured':
      return '#FFB300';
    default:
      return TACTICAL.textMuted;
  }
}

function FleetCommandSurface({ state }: { state: FleetCommandState }) {
  const accent = fleetCommandAccent(state);
  const secondaryLabels = [
    ...state.missingCritical.map((item) => `Missing ${item}`),
    ...state.secondary.map((candidate) => candidate.title),
    ...state.limitations,
  ].filter(Boolean).slice(0, 3);

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

        <View style={s.commandBadgeRow}>
          {state.badges.map((badge) => (
            <ECSBadge
              key={badge.id}
              label={badge.label}
              tone={fleetBadgeTone(badge.tone)}
              compact
            />
          ))}
          {state.phaseLabel ? (
            <ECSBadge label={state.phaseLabel.toUpperCase()} tone="info" compact />
          ) : null}
        </View>

        {secondaryLabels.length > 0 ? (
          <View style={s.commandSecondaryRow}>
            {secondaryLabels.map((label) => (
              <View key={label} style={s.commandSecondaryPill}>
                <Text style={s.commandSecondaryText} numberOfLines={1}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </ECSPanel>
    </View>
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
  const headerTopPadding = useMemo(() => getShellHeaderTopPadding(insets.top), [insets.top]);
  const dockClearance = useMemo(() => getShellBottomClearance(insets.bottom, 8), [insets.bottom]);

  // ── State ─────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(
    vehicleSetupStore.getActiveVehicleId()
  );

  // ── Setup Takeover State ──────────────────────────────
  // When no vehicles exist, show the System Configuration Required
  // intercept (SetupTakeover) instead of the empty "No Vehicles" card.

  // ── Fleet Loadout Modal State ─────────────────────────
  // Allows editing a vehicle's loadout from the Fleet tab (post-setup).
  const [loadoutModalVisible, setLoadoutModalVisible] = useState(false);
  const [loadoutModalVehicle, setLoadoutModalVehicle] = useState<Vehicle | null>(null);

  // ── Loadout Summary Refresh Key ───────────────────────
  // Incremented after loadout modal save to trigger VehicleLoadoutSummary re-fetch.
  const [loadoutRefreshKey, setLoadoutRefreshKey] = useState(0);

  // ── Fleet Sync Modal State ────────────────────────────
  // Controls visibility of the full sync queue management modal.
  const [syncModalVisible, setSyncModalVisible] = useState(false);
  const [supportDataRevision, setSupportDataRevision] = useState(0);

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ── Track last-fetched vehicleStore revision to avoid redundant fetches ──
  const lastFetchRevisionRef = useRef(0);



  // ── Fetch vehicles ────────────────────────────────────
  const fetchVehicles = useCallback(async () => {
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
        setVehicles(result.vehicles);
        setActiveVehicleId(vehicleSetupStore.getActiveVehicleId());
        lastFetchRevisionRef.current = vehicleStore.getRevision();
      }
    } catch (err: any) {
      console.error(TAG, 'fetch error:', err);
    }
    if (mountedRef.current) setLoading(false);
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
    const unsub = vehicleStore.subscribe((event) => {
      if (!mountedRef.current) return;
      if (event.revision <= lastFetchRevisionRef.current) return;
      console.log(TAG, `vehicleStore change detected: ${event.type} (rev ${event.revision}), re-fetching`);
      fetchVehicles();
      setLoadoutRefreshKey(prev => prev + 1);
    });
    return unsub;
  }, [fetchVehicles]);

  // Re-fetch on focus
  useFocusEffect(useCallback(() => {
    const currentRev = vehicleStore.getRevision();
    if (currentRev > lastFetchRevisionRef.current) {
      console.log(TAG, `Focus refresh: rev ${lastFetchRevisionRef.current} → ${currentRev}`);
      fetchVehicles();
      setLoadoutRefreshKey(prev => prev + 1);
    } else {
      fetchVehicles();
    }
    void (async () => {
      const flow = await consumeNavigationFlow('fleet');
      if (!flow) return;
      if (flow.intent === 'quick_action' && flow.message) {
        showToast(flow.message);
      }
    })();
  }, [fetchVehicles, showToast]));



  // ── Setup completion handler ──────────────────────────
  // ── Dynamic header title ──────────────────────────────
  const headerTitle = useMemo(() => {
    if (vehicles.length === 0) return 'FLEET';
    if (vehicles.length === 1) return 'MY VEHICLE';
    return 'FLEET';
  }, [vehicles.length]);

  // ── Vehicle list actions ──────────────────────────────
  const handleSelectVehicle = useCallback((id: string) => {
    hapticMicro();
    vehicleSetupStore.setActiveVehicleId(id);
    void stageNavigationFlow({
      source: 'fleet',
      target: 'dashboard',
      intent: 'vehicle_context_updated',
      label: 'Active Rig Updated',
      message: 'Dashboard will use the selected vehicle context on the next return.',
      context: { vehicleId: id },
    });
    showToast(ECS_TOAST_COPY.vehicleSetActive);
  }, [showToast]);

  // ── ADD VEHICLE → Navigate to full Setup Wizard (fleet-add mode) ──
  const handleAddVehicle = useCallback(() => {
    hapticMicro();
    router.push({ pathname: '/setup', params: { mode: 'fleet-add' } } as any);
  }, [router]);


  // ── RECONFIGURE VEHICLE ──
  const handleReconfigureVehicle = useCallback((v: Vehicle) => {
    hapticMicro();
    router.push({
      pathname: '/setup',
      params: { mode: 'fleet-edit', vehicleId: v.id },
    } as any);
  }, [router]);
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
      const sourceResources = getVehicleResourceProfile(v as any);

      if (
        sourceResources.waterCapacityGal != null ||
        sourceResources.batteryUsableWh != null ||
        v.fuel_tank_capacity_gal != null
      ) {
        await vehicleStore.update(newId, {
          water_capacity_gal: sourceResources.waterCapacityGal,
          fuel_tank_capacity_gal: v.fuel_tank_capacity_gal,
          battery_usable_wh: sourceResources.batteryUsableWh,
        }, user?.id || null);
      }

      const sourceSpec = vehicleSpecStore.get(v.id);
      if (sourceSpec) {
        vehicleSpecStore.set(newId, {
          gvwr_lb: sourceSpec.gvwr_lb,
          base_weight_lb: sourceSpec.base_weight_lb,
          fuel_tank_capacity_gal: sourceSpec.fuel_tank_capacity_gal,
          fuel_type: sourceSpec.fuel_type,
          hardware_additions_lb: sourceSpec.hardware_additions_lb,
        });
      }

      const sourceConsumables = consumablesStore.get(v.id);
      consumablesStore.set(newId, {
        fuel_percent_current: sourceConsumables.fuel_percent_current,
        water_gal_current: sourceConsumables.water_gal_current,
      });

      const wc = (v as any).wizard_config;
      if (wc) {
        const wcCopy = JSON.parse(JSON.stringify(wc));
        const zonesCopy = (v as any).zones
          ? JSON.parse(JSON.stringify((v as any).zones))
          : [];
        await vehicleStore.finalizeConfig(newId, zonesCopy, wcCopy, user?.id || null);
      }

      const sourceTiresLift = tiresLiftStore.get(v.id);
      if (sourceTiresLift) {
        tiresLiftStore.set(newId, { ...sourceTiresLift });
        console.log(TAG, `Copied tires/lift config from ${v.id} → ${newId}`);
      }

      await fetchVehicles();
      showToast(ECS_TOAST_COPY.vehicleCopied);
      console.log(TAG, `Duplicated vehicle ${v.id} → ${newId}`);
    } catch (err: any) {
      console.error(TAG, 'Duplicate error:', err);
      showToast('Failed to duplicate vehicle');
    }
  }, [user?.id, fetchVehicles, showToast]);

  // ── Delete Vehicle ────────────────────────────────────
  const handleDeleteVehicle = useCallback((v: Vehicle) => {
    const isActiveVehicle = activeVehicleId === v.id;
    const warningLines = [
      `Are you sure you want to delete "${v.name}"?`,
      '',
      'All associated data will be removed:',
      '  \u2022  Vehicle specs and weight data',
      '  \u2022  Accessories and zone configuration',
      '  \u2022  Consumables state (fuel/water levels)',
      '  \u2022  Cached zones and pending configs',
    ];
    if (isActiveVehicle) {
      warningLines.push('');
      warningLines.push('This is your active vehicle. It will be deselected.');
    }
    warningLines.push('');
    warningLines.push('This cannot be undone.');

    const warningMessage = warningLines.join('\n');

    const doDelete = async () => {
      try {
        setVehicles(prev => prev.filter(veh => veh.id !== v.id));

        if (isActiveVehicle) {
          vehicleSetupStore.clearActiveVehicleId();
        }

        try {
          consumablesStore.remove(v.id);
          console.log(TAG, `Removed consumables for vehicle ${v.id}`);
        } catch (e) {
          console.warn(TAG, 'Failed to remove consumables:', e);
        }

        const result = await vehicleStore.delete(v.id, user?.id || null);
        if (result.success) {
          showToast(ECS_TOAST_COPY.vehicleDeleted);
          console.log(TAG, `Deleted vehicle ${v.id} (from: ${result.deletedFrom})`);
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

    const dialogCopy = ECS_CONFIRM_COPY.deleteVehicle(v.name, isActiveVehicle);
    showEcsConfirmDialog({
      title: dialogCopy.title,
      message: warningMessage,
      confirmLabel: dialogCopy.confirmLabel,
      cancelLabel: dialogCopy.cancelLabel,
      destructive: true,
      onConfirm: doDelete,
    });
  }, [user?.id, activeVehicleId, fetchVehicles, showToast]);


  // ── CONFIGURE LOADOUT → Open Fleet Loadout Modal ────────
  const handleOpenLoadoutModal = useCallback((v: Vehicle) => {
    hapticMicro();
    setLoadoutModalVehicle(v);
    setLoadoutModalVisible(true);
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

  const handleConfirmVehicleReady = useCallback(() => {
    if (vehicles.length === 1 && !activeVehicleId) {
      const onlyVehicle = vehicles[0];
      if (!onlyVehicle) return;
      vehicleSetupStore.setActiveVehicleId(onlyVehicle.id);
      void stageNavigationFlow({
        source: 'fleet',
        target: 'dashboard',
        intent: 'vehicle_ready_confirmed',
        label: 'Vehicle Ready',
        message: 'Dashboard will reflect the active rig on the next return.',
        context: { vehicleId: onlyVehicle.id },
      });
      hapticMicro();
      showToast(ECS_TOAST_COPY.vehicleSetActive);
      return;
    }

    if (!activeVehicleId) {
      showToast(ECS_STATE_COPY.fleet.selectActiveHelper);
      return;
    }

    const activeVehicle = vehicles.find(v => v.id === activeVehicleId);
    void stageNavigationFlow({
      source: 'fleet',
      target: 'dashboard',
      intent: 'vehicle_ready_confirmed',
      label: 'Vehicle Ready',
      message: 'Dashboard will reflect the active rig on the next return.',
      context: { vehicleId: activeVehicle?.id ?? activeVehicleId },
    });
    hapticMicro();
    showToast(ECS_TOAST_COPY.vehicleReady);
  }, [vehicles, activeVehicleId, showToast]);

  const activeVehicle = useMemo(
    () => vehicles.find(v => v.id === activeVehicleId) || null,
    [vehicles, activeVehicleId],
  );
  const selectedPreviewVehicle = useMemo(
    () => activeVehicle ?? vehicles[0] ?? null,
    [activeVehicle, vehicles],
  );
  const fleetFrameStyle = useMemo(
    () => ({
      alignSelf: 'center' as const,
      width: '100%' as const,
      maxWidth: adaptive.contentMaxWidth,
      paddingHorizontal: adaptive.horizontalPadding,
    }),
    [adaptive.contentMaxWidth, adaptive.horizontalPadding],
  );
  const showFleetPreviewPane = adaptive.fleet.multiPane && vehicles.length > 0;
  const listSummaryMetricStyle = showFleetPreviewPane ? s.summaryMetricWide : null;
  const previewSummaryMetricStyle = showFleetPreviewPane ? s.summaryMetricPreviewWide : null;
  const previewVehicleData = useMemo(() => {
    const hydrationTick = supportDataRevision;
    void hydrationTick;
    if (!selectedPreviewVehicle) return null;
    const spec = vehicleSpecStore.get(selectedPreviewVehicle.id);
    const resourceProfile = getVehicleResourceProfile(selectedPreviewVehicle as any);
    const powerSummary = formatPowerStorage(resourceProfile.batteryUsableWh);
    const tlProfile = tiresLiftStore.get(selectedPreviewVehicle.id);
    const tlSummary = tiresLiftStore.getSummary(selectedPreviewVehicle.id);
    const vehicleAny = selectedPreviewVehicle as any;
    const framework: AccessoryFramework | null = vehicleAny.accessoryFramework || null;
    const containerZones: ContainerZone[] | null = vehicleAny.containerZones || null;
    const zonePills = getZoneSummaryPills(framework, containerZones, 8);
    const wc = vehicleAny.wizard_config || {};
    const accessorySummary = zonePills.length > 0
      ? []
      : (() => {
          try {
            return getConfigSummary(wc)
              .filter(c => c.value !== 'Not Selected' && c.label !== 'VEHICLE TYPE')
              .map(c => c.value)
              .slice(0, 4);
          } catch {
            return [];
          }
        })();
    const descriptor = [selectedPreviewVehicle.year, selectedPreviewVehicle.make, selectedPreviewVehicle.model]
      .filter(Boolean)
      .join(' ')
      || (typeof wc.vehicle_type === 'string'
        ? wc.vehicle_type.replace(/_/g, ' ').toUpperCase()
        : 'Vehicle profile');

    return {
      descriptor,
      tlSummary,
      zonePills,
      accessorySummary,
      summaryMetrics: [
        { label: 'Fuel', value: formatFleetMetric(spec?.fuel_tank_capacity_gal || selectedPreviewVehicle.fuel_tank_capacity_gal, 'gal') },
        { label: 'Water', value: formatFleetMetric(resourceProfile.waterCapacityGal, 'gal') },
        { label: 'Power', value: powerSummary || '--' },
        { label: 'Lift', value: formatFleetMetric(tlProfile?.suspensionLiftInches, 'in') },
        { label: 'Tires', value: formatFleetMetric(tlProfile?.tireSizeInches, 'in') },
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
    const wizardConfig = selectedAny.wizard_config ?? null;
    const spec = vehicleSpecStore.get(selectedPreviewVehicle.id);
    const resourceProfile = getVehicleResourceProfile(selectedPreviewVehicle as any);
    const tiresLift = tiresLiftStore.get(selectedPreviewVehicle.id);
    const framework: AccessoryFramework | null = selectedAny.accessoryFramework || null;
    const containerZones: ContainerZone[] | null = selectedAny.containerZones || null;
    const zonePills = getZoneSummaryPills(framework, containerZones, 6);
    const accessoryCount = zonePills.length;
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
      hasTireSize: Number(tiresLift?.tireSizeInches ?? 0) > 0,
      hasLiftProfile: tiresLift?.suspensionLiftInches != null,
      hasAccessoriesConfigured: accessoryCount > 0,
      hasLoadout: loadoutReady,
      hasLiveTelemetry,
    };
  }, [selectedPreviewVehicle, activeTrip, activeVehicleId]);

  const fleetAIResources = useMemo(() => {
    if (!selectedPreviewVehicle) return null;
    const resourceProfile = getVehicleResourceProfile(selectedPreviewVehicle as any);
    const tiresLift = tiresLiftStore.get(selectedPreviewVehicle.id);
    return {
      fuelTankCapacityGal: resourceProfile.fuelTankCapacityGal,
      waterCapacityGal: resourceProfile.waterCapacityGal,
      batteryCapacityWh: resourceProfile.batteryUsableWh,
      tireSizeInches: tiresLift?.tireSizeInches ?? null,
      suspensionLiftInches: tiresLift?.suspensionLiftInches ?? null,
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

  const { aiState, fleetView } = useECSAIHook({
    activeRun: activeTrip,
    vehicleConfig: selectedPreviewVehicle,
    telemetry: fleetAITelemetry,
    resources: fleetAIResources,
    userPreferences: userSettings,
    enabled: vehicles.length > 0,
    options: {
      enableWhenIdle: true,
      emitBriefWhenNoSignals: true,
    },
  });

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

  useEffect(() => {
    if (loading || authLoading) return;
    if (activeVehicleId && !activeVehicle) {
      console.log(TAG, 'Clearing stale active vehicle context after fleet load', {
        activeVehicleId,
        vehicleCount: vehicles.length,
      });
      vehicleSetupStore.clearActiveVehicleId();
    }
  }, [activeVehicle, activeVehicleId, authLoading, loading, vehicles.length]);

  // ── Auth loading ──────────────────────────────────────
  if (authLoading) {
    return (
      <TopoBackground>
        <View style={[s.safeContainer, { paddingBottom: dockClearance }]}>
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
          <View style={[s.header, { paddingTop: headerTopPadding }]}>
            <Text style={s.headerBrand}>ECS FLEET MANAGEMENT</Text>
            <Text style={s.headerTitle}>FLEET</Text>
          </View>
          <View style={s.loadingShell}>
            <ECSTransientNotice
              kind="syncing"
              label="Loading Vehicle Data..."
              message="Building Fleet summaries and restoring the active rig."
            />
            <ECSLoadingCard title="Vehicle Profile" message="Loading saved capacities, loadout, and mounted systems." />
            <ECSLoadingCard title="Vehicle Profile" message="Preparing readiness and active-state actions." />
          </View>
        </View>
      </TopoBackground>
    );
  }

  // ============================================================
  // NO VEHICLES → Show SetupTakeover with onConfigureNow override
  // so "Configure Now" routes to the full 4-step /setup wizard,
  // identical to the "+ Add Vehicle" button experience.
  // ============================================================
  return (
    <TopoBackground>
      <View style={[s.safeContainer, { paddingBottom: dockClearance }]}>
        {/* Header */}
        <View style={[s.listHeader, fleetFrameStyle, { paddingTop: headerTopPadding }]}>
          <View>
            <Text style={s.headerBrand}>ECS FLEET MANAGEMENT</Text>
            <Text style={s.headerTitle}>{headerTitle}</Text>
          </View>
          <View style={s.headerRight}>
            {/* Sync Status Indicator — replaces plain online/offline dot */}
            <FleetSyncStatusIndicator onPress={() => setSyncModalVisible(true)} />
          </View>
        </View>

        {/* Scrollable vehicle list — flex: 1 fills space between header and bottom actions */}
        <View style={fleetFrameStyle}>
          <FleetCommandSurface state={fleetCommandState} />
        </View>
        <View
          style={[
            s.contentRow,
            showFleetPreviewPane && s.contentRowExpanded,
            showFleetPreviewPane && { gap: adaptive.panelGap + 2 },
            fleetFrameStyle,
          ]}
        >
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
                actionLabel={ECS_STATE_COPY.fleet.noVehiclesConfigured.ctaLabel}
                onAction={handleAddVehicle}
                iconAsset={require('../../assets/ecs/nav/fleet-badge.png')}
              />
            </View>
          ) : (
            <>
              <ECSResultsMetaRow
                chips={[
                  { label: `${vehicles.length} ${vehicles.length === 1 ? 'Rig' : 'Rigs'}`, selected: true },
                  { label: activeVehicle ? `Active ${activeVehicle.name}` : 'No Active Rig' },
                  { label: fleetCommandState.title },
                  { label: fleetCommandState.confidence.label },
                ]}
                style={s.vehicleResultsMeta}
              />

              {vehicles.map((v) => {
            const isActive = v.id === activeVehicleId;
            const hasConfig = !!(v as any).wizard_config;
            const vIcon = getVehicleIcon(v);
            const spec = vehicleSpecStore.get(v.id);
            const resourceProfile = getVehicleResourceProfile(v as any);
            const powerSummary = formatPowerStorage(resourceProfile.batteryUsableWh);
            const tlProfile = tiresLiftStore.get(v.id);
            const tlSummary = tiresLiftStore.getSummary(v.id);

            // Phase 4: Zone summary pills from accessory framework
            const vAny = v as any;
            const framework: AccessoryFramework | null = vAny.accessoryFramework || null;
            const containerZones: ContainerZone[] | null = vAny.containerZones || null;
            const zonePills = getZoneSummaryPills(framework, containerZones, 6);
            const hasZones = zonePills.length > 0;

            // Legacy accessories summary (fallback when no framework)
            const wc = vAny.wizard_config || {};
            let accessorySummary: string[] = [];
            if (!hasZones) {
              try {
                const cfgSummary = getConfigSummary(wc);
                accessorySummary = cfgSummary
                  .filter(c => c.value !== 'Not Selected' && c.label !== 'VEHICLE TYPE')
                  .map(c => c.value)
                  .slice(0, 3);
              } catch {}
            }

            const vehicleDescriptor = [v.year, v.make, v.model].filter(Boolean).join(' ')
              || (typeof wc.vehicle_type === 'string'
                ? wc.vehicle_type.replace(/_/g, ' ').toUpperCase()
                : 'Vehicle profile');

            const summaryMetrics = [
              { label: 'Fuel', value: formatFleetMetric(spec?.fuel_tank_capacity_gal || v.fuel_tank_capacity_gal, 'gal') },
              { label: 'Water', value: formatFleetMetric(resourceProfile.waterCapacityGal, 'gal') },
              { label: 'Power', value: powerSummary || '--' },
              { label: 'Lift', value: formatFleetMetric(tlProfile?.suspensionLiftInches, 'in') },
              { label: 'Tires', value: formatFleetMetric(tlProfile?.tireSizeInches, 'in') },
            ];

            return (
              <ECSCard key={v.id} variant="primary" selected={isActive} style={s.vehicleCard}>
                <View style={s.vehicleCardTop}>
                  <View style={s.vehicleIdentity}>
                    <View style={[s.vehicleIcon, isActive && { backgroundColor: 'rgba(196, 138, 44, 0.2)' }]}>
                      <Ionicons name={vIcon as any} size={22} color={isActive ? TACTICAL.amber : TACTICAL.textMuted} />
                    </View>
                    <View style={s.vehicleIdentityText}>
                      <Text style={s.vehicleName} numberOfLines={2}>{v.name}</Text>
                      <Text style={s.vehicleMeta} numberOfLines={1}>{vehicleDescriptor}</Text>
                      <View style={s.vehicleTagRow}>
                        <ECSBadge
                          label={hasConfig ? 'Configured' : 'Setup Incomplete'}
                          icon={hasConfig ? 'shield-checkmark-outline' : 'construct-outline'}
                          tone={hasConfig ? 'ready' : 'warning'}
                          compact
                        />
                      </View>
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
                      label="Make Active"
                      icon="radio-button-off-outline"
                      variant="primary"
                      size="medium"
                      onPress={() => handleSelectVehicle(v.id)}
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
                  </View>
                </ECSPanel>

                {tlSummary && (
                  <View style={s.supportPanel}>
                    <Text style={s.supportPanelLabel}>MECHANICAL PROFILE</Text>
                    <View style={s.supportChipRow}>
                      {tlSummary.tires && (
                        <ECSBadge
                          label={`${tlSummary.tires} Tires`}
                          icon="ellipse-outline"
                          tone="category"
                          compact
                          colorOverride="#81C784"
                        />
                      )}
                      {tlSummary.suspension && (
                        <ECSBadge
                          label={tlSummary.suspension}
                          icon="resize-outline"
                          tone="category"
                          compact
                          colorOverride="#81C784"
                        />
                      )}
                    </View>
                  </View>
                )}

                <View style={s.supportPanel}>
                  <Text style={s.supportPanelLabel}>ACCESSORY SYSTEMS</Text>
                  {hasZones ? (
                    <View style={s.zonePillsRow}>
                      <Ionicons name="grid-outline" size={10} color={TACTICAL.amber} />
                      {zonePills.map((pill) => (
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
                      {containerZones && containerZones.length > 6 && (
                        <View style={s.zonePillMore}>
                          <Text style={s.zonePillMoreText}>+{containerZones.length - 6}</Text>
                        </View>
                      )}
                    </View>
                  ) : accessorySummary.length > 0 ? (
                    <View style={s.accessorySummaryRow}>
                      <Ionicons name="layers-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={s.accessorySummaryText}>
                        {accessorySummary.join(' · ')}
                      </Text>
                    </View>
                  ) : (
                    <View style={s.accessorySummaryRow}>
                      <Ionicons name="layers-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={s.accessorySummaryText}>No accessories configured yet</Text>
                    </View>
                  )}
                </View>

                <View style={s.supportPanel}>
                  <Text style={s.supportPanelLabel}>LOADOUT</Text>
                  <VehicleLoadoutSummary
                    vehicleId={v.id}
                    userId={user?.id || null}
                    onOpenLoadout={() => handleOpenLoadoutModal(v)}
                    refreshKey={loadoutRefreshKey}
                  />
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

          {/* Add Vehicle Button */}
          {vehicles.length > 0 && (
            <ECSButton
              label="Add Vehicle"
              icon="add"
              variant="secondary"
              size="large"
              onPress={handleAddVehicle}
              style={s.addVehicleButton}
            />
          )}


          {/* Bottom breathing room so last item isn't flush against bottom actions */}
          <View style={{ height: 8 }} />
        </ScrollView>
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
                  <Text style={s.previewEyebrow}>ACTIVE RIG SUMMARY</Text>
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
              </View>

              {previewVehicleData.tlSummary ? (
                <View style={s.supportPanel}>
                  <Text style={s.supportPanelLabel}>MECHANICAL PROFILE</Text>
                  <View style={s.supportChipRow}>
                    {previewVehicleData.tlSummary.tires ? (
                      <ECSBadge label={`${previewVehicleData.tlSummary.tires} Tires`} icon="ellipse-outline" tone="category" compact colorOverride="#81C784" />
                    ) : null}
                    {previewVehicleData.tlSummary.suspension ? (
                      <ECSBadge label={previewVehicleData.tlSummary.suspension} icon="resize-outline" tone="category" compact colorOverride="#81C784" />
                    ) : null}
                  </View>
                </View>
              ) : null}

              <View style={s.supportPanel}>
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

              <View style={s.supportPanel}>
                <Text style={s.supportPanelLabel}>LOADOUT</Text>
                <VehicleLoadoutSummary
                  vehicleId={selectedPreviewVehicle.id}
                  userId={user?.id || null}
                  onOpenLoadout={() => handleOpenLoadoutModal(selectedPreviewVehicle)}
                  refreshKey={loadoutRefreshKey}
                />
              </View>

              <ECSActionRow compact style={s.previewActionRow}>
                {selectedPreviewVehicle.id !== activeVehicleId ? (
                  <ECSButton
                    label="Make Active"
                    icon="radio-button-off-outline"
                    variant="primary"
                    size="medium"
                    onPress={() => handleSelectVehicle(selectedPreviewVehicle.id)}
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
          <View style={[s.bottomActions, fleetFrameStyle]}>
            <View style={s.bottomHelperRow}>
              <ECSInlineHelper
                text={fleetCommandState.helperText}
                variant={fleetCommandState.canConfirmVehicleReady ? 'partial_data' : 'selection_required'}
              />
              {!!fleetCommandState.subhelperText && (
                <Text style={s.bottomSubhelperText}>{fleetCommandState.subhelperText}</Text>
              )}
            </View>
            <ECSButton
              label="Vehicle Ready"
              icon="checkmark-circle-outline"
              variant="primary"
              size="large"
              onPress={handleConfirmVehicleReady}
              disabled={!fleetCommandState.canConfirmVehicleReady}
              style={s.bottomReadyButton}
            />
          </View>
        )}

        {/* Footer info line */}
        <View style={[s.footer, fleetFrameStyle]}>
          <Text style={s.footerText}>
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

      {/* Expedition Summary Sheet removed — handled exclusively by dashboard.tsx */}

      {/* Fleet Sync Modal — full sync queue management accessible from header indicator */}
      <FleetSyncModal
        visible={syncModalVisible}
        onClose={() => setSyncModalVisible(false)}
      />
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

  // Header
  header: { paddingHorizontal: 16, paddingBottom: 12 },
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 12,
    borderBottomWidth: GOLD_RAIL.sectionWidth, borderBottomColor: GOLD_RAIL.section,
  },
  headerBrand: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 2 },
  headerTitle: { ...ECS_TEXT.screenTitle },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 6, height: 6, borderRadius: 3 },
  onlineText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },
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
    color: 'rgba(183, 191, 199, 0.84)',
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
    borderColor: 'rgba(196, 138, 44, 0.18)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: '100%',
  },
  commandSecondaryText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.textSecondary,
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

  // Empty state (kept for fallback, but primary empty state is SetupTakeover)
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
    marginBottom: 12,
  },
  vehicleCardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  vehicleIdentity: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  vehicleIdentityText: { flex: 1, minWidth: 0 },
  vehicleIcon: {
    width: 48, height: 48, borderRadius: 15, backgroundColor: 'rgba(62, 79, 60, 0.16)',
    borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.26)',
    alignItems: 'center', justifyContent: 'center',
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
    minWidth: 122,
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
    marginTop: 14,
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
    marginTop: 12,
    paddingTop: 12,
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
    marginTop: 12,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
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





