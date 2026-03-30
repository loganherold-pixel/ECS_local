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
//   - Buttons: Select, Edit, Duplicate, Delete
//
// IMPORTANT: Vehicle creation and editing is handled EXCLUSIVELY
// by the Vehicle Configuration Wizard at /(tabs)/vehicle-config.
// This screen is the vehicle LIST only — no inline wizard.
//
// Expedition state integration:
//   - "Begin Expedition" button when standby + activeVehicleId
//   - Gold underline on header when expedition active
//   - Summary sheet on expedition complete
//
// Sync Status Integration:
//   - FleetSyncStatusIndicator in header shows synced/pending/conflict state
//   - Tapping opens FleetSyncModal with full SyncQueueManager
//   - Integrates LiveSyncBanner + ConflictResolutionModal
// ============================================================

import React, { useState, useCallback, useEffect, useMemo, useRef, Component, type ReactNode } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput,
  ActivityIndicator, Platform, Alert, ScrollView, Animated,
} from 'react-native';

import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import { useApp } from '../../context/AppContext';
import TopoBackground from '../../components/TopoBackground';
import { vehicleStore } from '../../lib/vehicleStore';

import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleSpecStore } from '../../lib/vehicleSpecStore';
import { consumablesStore } from '../../lib/consumablesStore';
import { getZoneSummaryPills } from '../../lib/vehicleSystemsIntegration';
import { computeFullBuildWeightBreakdown, type BuildWeightBreakdown } from '../../lib/weightEngine';
import type { AccessoryFramework } from '../../lib/accessoryFramework';
import type { ContainerZone } from '../../lib/accessoryFramework';
import { frameworkToSelections } from '../../lib/accessoryFramework';



import { getVehicleIcon } from '../../lib/vehicleIcons';
import type { Vehicle } from '../../lib/types';
import {
  getConfigSummary,
} from '../../components/vehicle-wizard/WizardData';
import { expeditionStateStore, type ExpeditionState, type ExpeditionRecord } from '../../lib/expeditionStateStore';
import { hapticMicro } from '../../lib/haptics';
// ExpeditionSummarySheet removed from fleet.tsx — dashboard.tsx is the single
// source of truth for the completion modal to prevent duplicate popups.
import SetupTakeover from '../../components/dashboard/SetupTakeover';
import FleetLoadoutModal from '../../components/fleet/FleetLoadoutModal';

import VehicleLoadoutSummary from '../../components/fleet/VehicleLoadoutSummary';
import FleetSyncStatusIndicator from '../../components/fleet/FleetSyncStatusIndicator';
import FleetSyncModal from '../../components/fleet/FleetSyncModal';
import TiresLiftModal from '../../components/fleet/TiresLiftModal';
import { tiresLiftStore } from '../../lib/tiresLiftStore';




const TAG = '[FLEET]';
const TOP_PAD = Platform.OS === 'web' ? 16 : 54;
// CommandDock height (68px) + safe breathing room
const DOCK_CLEARANCE = 76;


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
            <Text style={s.errorTitle}>FLEET ERROR</Text>
            <Text style={s.errorSub}>{this.state.error?.message || 'Unexpected error'}</Text>
            <TouchableOpacity style={s.retryBtn} onPress={() => this.setState({ hasError: false, error: null })}>
              <Text style={s.retryBtnText}>RETRY</Text>
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
  const { user, authLoading, isOnline, showToast } = useApp();

  // ── State ─────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(
    vehicleSetupStore.getActiveVehicleId()
  );

  // ── Setup Takeover State ──────────────────────────────
  // When no vehicles exist, show the System Configuration Required
  // intercept (SetupTakeover) instead of the empty "No Vehicles" card.
  const [showSetupTakeover, setShowSetupTakeover] = useState(false);

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

  // ── Tires / Lift Modal State ──────────────────────────
  // Allows configuring tire size and suspension lift per vehicle.
  const [tiresLiftModalVisible, setTiresLiftModalVisible] = useState(false);
  const [tiresLiftModalVehicle, setTiresLiftModalVehicle] = useState<Vehicle | null>(null);
  // Refresh key to trigger re-render of tires/lift summary chips after save.
  const [tiresLiftRefreshKey, setTiresLiftRefreshKey] = useState(0);

  // ── Vehicle Rename State ──────────────────────────────
  // Tracks which vehicle is being renamed and the draft name value.
  const [renamingVehicleId, setRenamingVehicleId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  // Expedition state
  const [expState, setExpState] = useState<ExpeditionState>(expeditionStateStore.getState());
  const [expRecord, setExpRecord] = useState<ExpeditionRecord | null>(expeditionStateStore.getCurrentExpedition());
  // summaryVisible removed — completion modal is now handled exclusively by dashboard.tsx
  const goldUnderlineAnim = useRef(new Animated.Value(expState === 'active' ? 1 : 0)).current;


  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ── Track last-fetched vehicleStore revision to avoid redundant fetches ──
  const lastFetchRevisionRef = useRef(0);

  // Subscribe to expedition state changes
  useEffect(() => {
    const unsub = expeditionStateStore.subscribe((state, record) => {
      if (!mountedRef.current) return;
      setExpState(state);
      setExpRecord(record);
      if (state === 'active') {
        Animated.timing(goldUnderlineAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
      } else {
        Animated.timing(goldUnderlineAnim, { toValue: 0, duration: 220, useNativeDriver: false }).start();
      }
      // Completion modal removed — handled exclusively by dashboard.tsx
    });
    return unsub;
  }, [goldUnderlineAnim]);



  // ── Fetch vehicles ────────────────────────────────────
  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await vehicleStore.getAll(user?.id || null);
      if (mountedRef.current) {
        setVehicles(result.vehicles);
        lastFetchRevisionRef.current = vehicleStore.getRevision();
        // Show SetupTakeover when no vehicles exist
        if (result.vehicles.length === 0) {
          setShowSetupTakeover(true);
        } else {
          setShowSetupTakeover(false);
        }
      }
    } catch (err: any) {
      console.error(TAG, 'fetch error:', err);
    }
    if (mountedRef.current) setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

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
  }, [fetchVehicles]));



  // ── Setup completion handler ──────────────────────────
  const handleSetupComplete = useCallback((vehicleId: string) => {
    setShowSetupTakeover(false);
    setActiveVehicleId(vehicleId);
    vehicleSetupStore.setActiveVehicleId(vehicleId);
    fetchVehicles();
    hapticMicro();
    showToast('Vehicle configured');
  }, [fetchVehicles, showToast]);


  // ── Dynamic header title ──────────────────────────────
  const headerTitle = useMemo(() => {
    if (vehicles.length === 0) return 'FLEET';
    if (vehicles.length === 1) return 'MY VEHICLE';
    return 'FLEET';
  }, [vehicles.length]);

  // ── Vehicle list actions ──────────────────────────────
  const handleSelectVehicle = useCallback((id: string) => {
    setActiveVehicleId(id);
    vehicleSetupStore.setActiveVehicleId(id);
    showToast('Vehicle selected');
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
      pathname: '/(tabs)/vehicle-config',
      params: { vehicleId: v.id, referrer: 'fleet' },
    } as any);
  }, [router]);

  // ── EDIT ACCESSORIES ──
  const handleEditAccessories = useCallback((v: Vehicle) => {
    hapticMicro();
    router.push({
      pathname: '/(tabs)/vehicle-config',
      params: { vehicleId: v.id, startAtStep: 'accessoryConfiguration', referrer: 'fleet' },
    } as any);
  }, [router]);


  // ── RENAME VEHICLE ────────────────────────────────────
  // Start inline rename: populate draft with current name.
  const handleStartRename = useCallback((v: Vehicle) => {
    hapticMicro();
    setRenamingVehicleId(v.id);
    setRenameDraft(v.name);
  }, []);

  // Save the renamed vehicle. Trims whitespace, validates non-empty,
  // persists via vehicleStore.update, and refreshes the list.
  const handleSaveRename = useCallback(async (vehicleId: string) => {
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      // Revert — don't save empty names
      setRenamingVehicleId(null);
      setRenameDraft('');
      return;
    }

    // Check if name actually changed
    const existing = vehicles.find(v => v.id === vehicleId);
    if (existing && existing.name === trimmed) {
      setRenamingVehicleId(null);
      setRenameDraft('');
      return;
    }

    try {
      await vehicleStore.update(vehicleId, { name: trimmed }, user?.id || null);
      // Optimistically update local state for instant feedback
      setVehicles(prev => prev.map(v =>
        v.id === vehicleId ? { ...v, name: trimmed } : v
      ));
      showToast(`Renamed to "${trimmed}"`);
      console.log(TAG, `Renamed vehicle ${vehicleId} → "${trimmed}"`);
    } catch (err: any) {
      console.error(TAG, 'Rename error:', err);
      showToast('Failed to rename vehicle');
    }

    setRenamingVehicleId(null);
    setRenameDraft('');
  }, [renameDraft, vehicles, user?.id, showToast]);

  // Cancel rename without saving
  const handleCancelRename = useCallback(() => {
    setRenamingVehicleId(null);
    setRenameDraft('');
  }, []);


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

      if (v.water_capacity_gal || v.fuel_tank_capacity_gal) {
        await vehicleStore.update(newId, {
          water_capacity_gal: v.water_capacity_gal,
          fuel_tank_capacity_gal: v.fuel_tank_capacity_gal,
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
      showToast(`"${v.name}" duplicated`);
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
          setActiveVehicleId(null);
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
          showToast(`Vehicle "${v.name}" deleted`);
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

    if (Platform.OS === 'web') {
      const confirmed = typeof window !== 'undefined'
        ? window.confirm(warningMessage)
        : true;
      if (confirmed) doDelete();
    } else {
      Alert.alert(
        'DELETE VEHICLE',
        warningMessage,
        [
          { text: 'CANCEL', style: 'cancel' },
          { text: 'DELETE', style: 'destructive', onPress: doDelete },
        ]
      );
    }
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




  // ── Begin Expedition handler ───────────────────────────
  const handleBeginExpedition = useCallback(() => {
    if (!activeVehicleId) return;
    const av = vehicles.find(v => v.id === activeVehicleId);
    if (!av) return;
    expeditionStateStore.beginExpedition({
      activeVehicleId,
      vehicleName: av.name || 'Vehicle',
      startFuelLevel: av.fuel_tank_capacity_gal ?? null,
      startWaterLevel: av.water_capacity_gal ?? null,
    });
    hapticMicro();
    showToast('Expedition started.');
  }, [activeVehicleId, vehicles, showToast]);

  // ── Auth loading ──────────────────────────────────────
  if (authLoading) {
    return (
      <TopoBackground>
        <View style={s.safeContainer}>
          <View style={s.center}>
            <ActivityIndicator size="large" color={TACTICAL.accent} />
            <Text style={s.loadingText}>INITIALIZING...</Text>
          </View>
        </View>
      </TopoBackground>
    );
  }

  // ── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <TopoBackground>
        <View style={s.safeContainer}>
          <View style={s.header}>
            <Text style={s.headerBrand}>ECS FLEET MANAGEMENT</Text>
            <Text style={s.headerTitle}>LOADING...</Text>
          </View>
          <View style={s.center}>
            <ActivityIndicator size="large" color={TACTICAL.accent} />
            <Text style={s.loadingText}>LOADING VEHICLES...</Text>
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
  if (vehicles.length === 0 && showSetupTakeover) {
    return (
      <TopoBackground>
        <View style={s.safeContainer}>
          <SetupTakeover onComplete={handleSetupComplete} onConfigureNow={handleAddVehicle} />
        </View>
      </TopoBackground>
    );
  }


  // ============================================================
  // VEHICLE LIST (only view — wizard is at vehicle-config tab)
  // ============================================================
  const activeVehicle = vehicles.find(v => v.id === activeVehicleId);


  return (
    <TopoBackground>
      <View style={s.safeContainer}>
        {/* Header */}
        <View style={s.listHeader}>
          <View>
            <Text style={s.headerBrand}>ECS FLEET MANAGEMENT</Text>
            <Text style={s.headerTitle}>{headerTitle}</Text>
          </View>
          <View style={s.headerRight}>
            {expState === 'active' && (
              <View style={s.expActiveBadge}>
                <View style={s.expActiveDot} />
                <Text style={s.expActiveText}>EXPEDITION ACTIVE</Text>
              </View>
            )}
            {/* Sync Status Indicator — replaces plain online/offline dot */}
            <FleetSyncStatusIndicator onPress={() => setSyncModalVisible(true)} />
          </View>
        </View>


        {/* Gold underline — 150ms fade-in when expedition active */}
        <Animated.View style={[s.goldUnderline, {
          opacity: goldUnderlineAnim,
          height: goldUnderlineAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 2] }),
        }]} />

        {/* Scrollable vehicle list — flex: 1 fills space between header and bottom actions */}
        <ScrollView
          style={s.scrollArea}
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Vehicle cards */}
          {vehicles.map((v) => {
            const isActive = v.id === activeVehicleId;
            const isRenaming = renamingVehicleId === v.id;
            const hasConfig = !!(v as any).wizard_config;
            const vIcon = getVehicleIcon(v);
            const spec = vehicleSpecStore.get(v.id);

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

            return (
              <View key={v.id} style={[s.vehicleCard, isActive && s.vehicleCardActive]}>
                <View style={s.vehicleCardTop}>
                  <View style={[s.vehicleIcon, isActive && { backgroundColor: 'rgba(196, 138, 44, 0.2)' }]}>
                    <Ionicons name={vIcon as any} size={20} color={isActive ? TACTICAL.amber : TACTICAL.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    {/* ── Editable Vehicle Name ── */}
                    {isRenaming ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <TextInput
                          style={{
                            flex: 1, fontSize: 14, fontWeight: '800', color: TACTICAL.text,
                            letterSpacing: 0.3, borderBottomWidth: 1.5,
                            borderBottomColor: TACTICAL.amber, paddingVertical: 2, paddingHorizontal: 0,
                          }}
                          value={renameDraft}
                          onChangeText={setRenameDraft}
                          onSubmitEditing={() => handleSaveRename(v.id)}
                          onBlur={() => handleSaveRename(v.id)}
                          autoFocus
                          selectTextOnFocus
                          returnKeyType="done"
                          maxLength={60}
                          placeholderTextColor={TACTICAL.textMuted + '50'}
                          placeholder="Vehicle name"
                        />
                        <TouchableOpacity onPress={() => handleSaveRename(v.id)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="checkmark-circle" size={18} color={TACTICAL.amber} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleCancelRename} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="close-circle" size={18} color={TACTICAL.textMuted} />
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
                        <Text style={s.vehicleName} numberOfLines={2}>{v.name}</Text>

                        <TouchableOpacity onPress={() => handleStartRename(v)} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Ionicons name="pencil-outline" size={13} color={TACTICAL.textMuted} />
                        </TouchableOpacity>
                      </View>
                    )}
                    <Text style={s.vehicleMeta}>
                      {[v.year, v.make, v.model].filter(Boolean).join(' ') || 'No details'}
                    </Text>
                  </View>
                  {isActive && (
                    <View style={s.activeBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={TACTICAL.amber} />
                      <Text style={s.activeBadgeText}>ACTIVE</Text>
                    </View>
                  )}
                </View>

                {/* Stats chips */}
                <View style={s.statsRow}>
                  {spec?.base_weight_lb ? (
                    <View style={s.statChip}>
                      <Ionicons name="scale-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={s.statChipText}>{spec.base_weight_lb.toLocaleString()} lbs</Text>
                    </View>
                  ) : null}
                  {v.water_capacity_gal ? (
                    <View style={s.statChip}>
                      <Ionicons name="water-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={s.statChipText}>{v.water_capacity_gal} gal</Text>
                    </View>
                  ) : null}
                  {(spec?.fuel_tank_capacity_gal || v.fuel_tank_capacity_gal) ? (
                    <View style={s.statChip}>
                      <Ionicons name="flame-outline" size={10} color={TACTICAL.textMuted} />
                      <Text style={s.statChipText}>{spec?.fuel_tank_capacity_gal || v.fuel_tank_capacity_gal} gal</Text>
                    </View>
                  ) : null}
                  {hasConfig && (
                    <View style={s.statChip}>
                      <Ionicons name="construct-outline" size={10} color="#66BB6A" />
                      <Text style={[s.statChipText, { color: '#66BB6A' }]}>CONFIGURED</Text>
                    </View>
                  )}
                </View>

                {/* Tires / Lift Summary — shows after tires/lift config is saved */}
                {(() => {
                  const tlSummary = tiresLiftStore.getSummary(v.id);
                  if (!tlSummary) return null;
                  return (
                    <View style={s.statsRow}>
                      {tlSummary.tires && (
                        <View style={s.tiresLiftChip}>
                          <Ionicons name="ellipse-outline" size={10} color="#81C784" />
                          <Text style={s.tiresLiftChipText}>{tlSummary.tires} Tires</Text>
                        </View>
                      )}
                      {tlSummary.suspension && (
                        <View style={s.tiresLiftChip}>
                          <Ionicons name="resize-outline" size={10} color="#81C784" />
                          <Text style={s.tiresLiftChipText}>{tlSummary.suspension}</Text>
                        </View>
                      )}
                    </View>
                  );
                })()}


                {/* Phase 4: Container Zone Summary Pills */}
                {hasZones && (
                  <View style={s.zonePillsRow}>
                    <Ionicons name="grid-outline" size={10} color={TACTICAL.amber} />
                    {zonePills.map((pill) => (
                      <View
                        key={pill.id}
                        style={[s.zonePill, { borderColor: pill.color + '55', backgroundColor: pill.color + '14' }]}
                      >
                        <Ionicons name={pill.icon as any} size={8} color={pill.color} />
                        <Text style={[s.zonePillText, { color: pill.color }]}>{pill.label}</Text>
                      </View>
                    ))}
                    {containerZones && containerZones.length > 6 && (
                      <View style={s.zonePillMore}>
                        <Text style={s.zonePillMoreText}>+{containerZones.length - 6}</Text>
                      </View>
                    )}
                  </View>
                )}


                {/* Linked Loadout Summary */}
                <VehicleLoadoutSummary
                  vehicleId={v.id}
                  userId={user?.id || null}
                  onOpenLoadout={() => handleOpenLoadoutModal(v)}
                  refreshKey={loadoutRefreshKey}
                />

                {/* SELECT button — full-width, only when not active */}
                {!isActive && (
                  <TouchableOpacity style={s.selectBtn} onPress={() => handleSelectVehicle(v.id)} activeOpacity={0.8}>
                    <Ionicons name="radio-button-off-outline" size={14} color="#0B0F12" />
                    <Text style={s.selectBtnText}>SELECT</Text>
                  </TouchableOpacity>
                )}

                {/* Action buttons — Row 1: Accessories / Loadout / Tires & Lift */}
                <View style={s.actionGrid}>
                  <TouchableOpacity style={s.gridBtnBlue} onPress={() => handleEditAccessories(v)} activeOpacity={0.8}>
                    <Ionicons name="layers-outline" size={12} color="#4FC3F7" />
                    <Text style={s.gridBtnBlueText}>ACCESSORIES</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.gridBtnAmber} onPress={() => handleOpenLoadoutModal(v)} activeOpacity={0.8}>
                    <Ionicons name="cube-outline" size={12} color={TACTICAL.amber} />
                    <Text style={s.gridBtnAmberText}>LOADOUT</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.gridBtnGreen} onPress={() => { hapticMicro(); setTiresLiftModalVehicle(v); setTiresLiftModalVisible(true); }} activeOpacity={0.8}>
                    <Ionicons name="speedometer-outline" size={12} color="#81C784" />
                    <Text style={s.gridBtnGreenText}>TIRES / LIFT</Text>
                  </TouchableOpacity>
                </View>

                {/* Action buttons — Row 2: Reconfigure / Copy / Delete */}
                <View style={s.actionGrid2}>
                  <TouchableOpacity style={s.gridBtnMuted} onPress={() => handleReconfigureVehicle(v)} activeOpacity={0.8}>
                    <Ionicons name="construct-outline" size={12} color={TACTICAL.textMuted} />
                    <Text style={s.gridBtnMutedText}>RECONFIGURE</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.gridBtnMuted} onPress={() => handleDuplicateVehicle(v)} activeOpacity={0.8}>
                    <Ionicons name="copy-outline" size={12} color={TACTICAL.textMuted} />
                    <Text style={s.gridBtnMutedText}>COPY</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.gridBtnDanger} onPress={() => handleDeleteVehicle(v)} activeOpacity={0.8}>
                    <Ionicons name="trash-outline" size={12} color={TACTICAL.danger} />
                    <Text style={s.gridBtnDangerText}>DELETE</Text>
                  </TouchableOpacity>
                </View>



              </View>
            );
          })}

          {/* Add Vehicle Button */}
          {vehicles.length > 0 && (
            <TouchableOpacity style={s.addBtnOutline} onPress={handleAddVehicle} activeOpacity={0.8}>
              <Ionicons name="add" size={18} color={TACTICAL.amber} />
              <Text style={s.addBtnOutlineText}>ADD VEHICLE</Text>
            </TouchableOpacity>
          )}


          {/* Bottom breathing room so last item isn't flush against bottom actions */}
          <View style={{ height: 12 }} />
        </ScrollView>

        {/* ── Fixed Bottom Actions — always visible above CommandDock ── */}
        <View style={s.bottomActions}>
          {/* Begin Expedition — only when standby + activeVehicleId */}
          {expState === 'standby' && activeVehicleId && (
            <TouchableOpacity style={s.beginExpBtn} onPress={handleBeginExpedition} activeOpacity={0.8}>
              <Ionicons name="flag-outline" size={16} color="#0B0F12" />
              <Text style={s.beginExpBtnText}>BEGIN EXPEDITION</Text>
            </TouchableOpacity>
          )}
        </View>


        {/* Footer info line */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            ECS FLEET  //  {vehicles.length} VEHICLE{vehicles.length !== 1 ? 'S' : ''}  //  {activeVehicle ? activeVehicle.name : 'NONE SELECTED'}
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

      {/* Tires / Lift Modal — tire size and suspension configuration per vehicle */}
      <TiresLiftModal
        visible={tiresLiftModalVisible}
        vehicle={tiresLiftModalVehicle}
        onClose={() => { setTiresLiftModalVisible(false); setTiresLiftModalVehicle(null); }}
        onSaved={() => setTiresLiftRefreshKey(prev => prev + 1)}
        showToast={showToast}
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
    // Push all content above the CommandDock (68px bar + 8px breathing room)
    paddingBottom: DOCK_CLEARANCE,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },

  // Header
  header: { paddingHorizontal: 16, paddingTop: TOP_PAD, paddingBottom: 12 },
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: TOP_PAD, paddingBottom: 12,
    borderBottomWidth: GOLD_RAIL.sectionWidth, borderBottomColor: GOLD_RAIL.section,
  },
  headerBrand: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 2 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 1.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  onlineDot: { width: 6, height: 6, borderRadius: 3 },
  onlineText: { fontSize: 9, fontWeight: '800', letterSpacing: 1 },

  // Loading
  loadingText: { fontSize: 12, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5 },

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
  scrollContent: {
    padding: 16,
    // flexGrow ensures content fills available space when few items
    flexGrow: 1,
  },

  // Vehicle Card
  vehicleCard: {
    backgroundColor: TACTICAL.panel, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)', padding: 14, marginBottom: 10,
  },
  vehicleCardActive: { borderColor: 'rgba(196, 138, 44, 0.4)', backgroundColor: 'rgba(196, 138, 44, 0.04)' },
  vehicleCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleIcon: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(62, 79, 60, 0.2)',
    alignItems: 'center', justifyContent: 'center',
  },
  vehicleName: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.3 },
  vehicleMeta: { fontSize: 11, color: TACTICAL.textMuted, marginTop: 2 },
  activeBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(196, 138, 44, 0.12)', borderRadius: 6,
  },
  activeBadgeText: { fontSize: 8, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1 },

  // Stats
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  statChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(62, 79, 60, 0.15)', borderRadius: 6,
  },
  statChipText: { fontSize: 9, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 0.5 },

  // Accessories summary
  accessorySummaryRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8,
    paddingHorizontal: 8, paddingVertical: 5,
    backgroundColor: 'rgba(62, 79, 60, 0.08)', borderRadius: 6,
  },
  accessorySummaryText: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 0.3, flex: 1 },

  // Vehicle actions — legacy (kept for reference, replaced by actionGrid)
  vehicleActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  vehicleActionsSecondary: { flexDirection: 'row', gap: 6, marginTop: 5 },

  // SELECT button — full-width amber, above the action grid
  selectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 8, backgroundColor: TACTICAL.amber,
    marginTop: 10,
  },
  selectBtnText: { fontSize: 10, fontWeight: '900', color: '#0B0F12', letterSpacing: 1 },

  // ── Action Grid — 2 rows × 3 columns ──────────────────
  // Row 1: Accessories (blue) / Loadout (amber) / Tires & Lift (green)
  actionGrid: {
    flexDirection: 'row', gap: 5, marginTop: 8,
  },
  // Row 2: Reconfigure / Copy / Delete
  actionGrid2: {
    flexDirection: 'row', gap: 5, marginTop: 5,
  },

  // ── Grid Button Base ──────────────────────────────────
  // Shared layout: flex: 1 ensures equal width, centered icon+label
  gridBtnBlue: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 9, borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(79, 195, 247, 0.5)',
    backgroundColor: 'rgba(79, 195, 247, 0.08)',
  },
  gridBtnBlueText: { fontSize: 8, fontWeight: '800', color: '#4FC3F7', letterSpacing: 0.5 },

  gridBtnAmber: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 9, borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.5)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  gridBtnAmberText: { fontSize: 8, fontWeight: '800', color: TACTICAL.amber, letterSpacing: 0.5 },

  gridBtnGreen: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 9, borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.5)',
    backgroundColor: 'rgba(102, 187, 106, 0.08)',
  },
  gridBtnGreenText: { fontSize: 8, fontWeight: '800', color: '#81C784', letterSpacing: 0.5 },

  gridBtnMuted: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 9, borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },
  gridBtnMutedText: { fontSize: 8, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.5 },

  gridBtnDanger: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingVertical: 9, borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.3)',
    backgroundColor: 'rgba(192, 57, 43, 0.06)',
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
  addBtnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, marginTop: 4, borderRadius: 10, borderWidth: 1.5,
    borderColor: TACTICAL.amber, borderStyle: 'dashed', backgroundColor: 'rgba(196, 138, 44, 0.04)',
  },
  addBtnOutlineText: { fontSize: 12, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.2 },

  // ── Fixed Bottom Actions — pinned above CommandDock ──
  bottomActions: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
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

  // Begin Expedition button
  beginExpBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, backgroundColor: TACTICAL.amber,
  },
  beginExpBtnText: { fontSize: 10, fontWeight: '900', color: '#0B0F12', letterSpacing: 1 },

  // Expedition Active badge
  expActiveBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(212,160,23,0.12)', borderRadius: 6, borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.25)', marginRight: 6,
  },
  expActiveDot: {
    width: 5, height: 5, borderRadius: 2.5, backgroundColor: TACTICAL.amber,
  },
  expActiveText: { fontSize: 7, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1 },

  // Gold underline (expedition active indicator)
  goldUnderline: {
    backgroundColor: TACTICAL.amber, width: '100%',
  },

  // Footer info line
  footer: {
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: GOLD_RAIL.subsectionWidth,
    borderTopColor: GOLD_RAIL.subsection,
    backgroundColor: 'rgba(11, 15, 18, 0.98)',
  },
  footerText: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 1.5, textAlign: 'center' },

  // Phase 4: Zone Summary Pills
  zonePillsRow: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4, marginTop: 8,
    paddingHorizontal: 4, paddingVertical: 4,
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

  // Tires / Lift action button (green-accented, distinct from accessories/loadout)
  tiresLiftBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.5)',
    backgroundColor: 'rgba(102, 187, 106, 0.08)',
  },
  tiresLiftBtnText: { fontSize: 9, fontWeight: '800', color: '#81C784', letterSpacing: 0.8 },
});





