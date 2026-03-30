// ============================================================
// EXPEDITION TAB — Vehicle List Hub
// ============================================================
// Vehicle list and expedition launch hub.
//
// IMPORTANT: Vehicle creation and editing is handled EXCLUSIVELY
// by the Fleet tab Vehicle Configuration Wizard at /(tabs)/vehicle-config.
// This screen shows the vehicle list only — no inline wizard.
//
// VehicleList:
//   - Vehicle cards with stats chips
//   - Select / Edit / Duplicate / Delete
//   - Bottom: Configure Loadout (→ Fleet tab), Deploy Expedition
// ============================================================


import React, { useState, useCallback, useEffect, useMemo, useRef, Component, type ReactNode } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
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
import { getVehicleIcon } from '../../lib/vehicleIcons';

import type { Vehicle } from '../../lib/types';
import { missionExpeditionStore } from '../../lib/missionStore';
import type { MissionExpedition } from '../../lib/missionTypes';
import MissionMode from '../../components/mission/MissionMode';
import { hapticMicro } from '../../lib/haptics';

const TAG = '[EXPEDITIONS]';
const TOP_PAD = Platform.OS === 'web' ? 16 : 54;

// ============================================================
// ERROR BOUNDARY
// ============================================================
interface EBProps { children: ReactNode }
interface EBState { hasError: boolean; error: Error | null }

class SetupErrorBoundary extends Component<EBProps, EBState> {
  state: EBState = { hasError: false, error: null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: any) { console.error(TAG, 'Error:', error, info?.componentStack); }
  render() {
    if (this.state.hasError) {
      return (
        <TopoBackground>
          <View style={s.center}>
            <Ionicons name="alert-circle-outline" size={48} color={TACTICAL.danger} />
            <Text style={s.errorTitle}>EXPEDITION ERROR</Text>
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
function SetupScreenInner() {
  const router = useRouter();
  const { user, authLoading, isOnline, showToast } = useApp();

  // ── State ─────────────────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVehicleId, setActiveVehicleId] = useState<string | null>(
    vehicleSetupStore.getActiveVehicleId()
  );

  // Mission mode
  const [activeMission, setActiveMission] = useState<MissionExpedition | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  // ── Fetch vehicles ────────────────────────────────────
  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await vehicleStore.getAll(user?.id || null);
      if (mountedRef.current) setVehicles(result.vehicles);
    } catch (err: any) {
      console.error(TAG, 'fetch error:', err);
    }
    if (mountedRef.current) setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchVehicles(); }, [fetchVehicles]);

  // ── Mission mode check ────────────────────────────────
  useFocusEffect(useCallback(() => {
    const active = missionExpeditionStore.getActive();
    if (mountedRef.current) setActiveMission(active);
  }, []));

  // Re-fetch on focus
  useFocusEffect(useCallback(() => {
    fetchVehicles();
  }, [fetchVehicles]));

  // ── Vehicle list actions ──────────────────────────────
  const handleSelectVehicle = useCallback((id: string) => {
    setActiveVehicleId(id);
    vehicleSetupStore.setActiveVehicleId(id);
    showToast('Vehicle selected');
  }, [showToast]);

  // ── ADD VEHICLE → Navigate to Fleet Wizard (Create mode) ──
  const handleAddVehicle = useCallback(() => {
    hapticMicro();
    router.push('/(tabs)/vehicle-config' as any);
  }, [router]);

  // ── EDIT VEHICLE → Navigate to Fleet Wizard (Edit mode → Step 3 Accessories) ──
  const handleEditVehicle = useCallback((v: Vehicle) => {
    hapticMicro();
    router.push({
      pathname: '/(tabs)/vehicle-config',
      params: { vehicleId: v.id, startAtStep: 'accessoryConfiguration', referrer: 'expeditions' },
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
        const zonesCopy = (v as any).zones ? JSON.parse(JSON.stringify((v as any).zones)) : [];
        await vehicleStore.finalizeConfig(newId, zonesCopy, wcCopy, user?.id || null);
      }

      await fetchVehicles();
      showToast(`"${v.name}" duplicated`);
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
        try { consumablesStore.remove(v.id); } catch {}

        const result = await vehicleStore.delete(v.id, user?.id || null);
        if (result.success) {
          showToast(`Vehicle "${v.name}" deleted`);
        } else {
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


  const handleConfigureLoadout = useCallback(() => {
    if (!activeVehicleId) {
      Alert.alert('SELECT A VEHICLE', 'Please select a vehicle first before configuring a loadout.');
      return;
    }
    // Navigate to Fleet tab where the user can use the LOADOUT button on their vehicle card
    router.push('/(tabs)/fleet' as any);
  }, [activeVehicleId, router]);


  const handleDeployExpedition = useCallback(() => {
    if (!activeVehicleId) {
      Alert.alert('SELECT A VEHICLE', 'Please select a vehicle first before deploying an expedition.');
      return;
    }
    router.push('/expedition-wizard' as any);
  }, [activeVehicleId, router]);

  const handleMissionEnded = useCallback(() => { setActiveMission(null); }, []);

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

  // ── Mission mode ──────────────────────────────────────
  if (activeMission) {
    return (
      <MissionMode
        expedition={activeMission}
        isOnline={isOnline}
        onMissionEnded={handleMissionEnded}
        showToast={showToast}
      />
    );
  }

  // ── Loading ───────────────────────────────────────────
  if (loading) {
    return (
      <TopoBackground>
        <View style={s.safeContainer}>
          <View style={s.header}>
            <Text style={s.headerBrand}>EXPEDITION COMMAND SYSTEM</Text>
            <Text style={s.headerTitle}>VEHICLES</Text>
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
  // VEHICLE LIST MODE (only view — wizard is at vehicle-config)
  // ============================================================
  const activeVehicle = vehicles.find(v => v.id === activeVehicleId);

  return (
    <TopoBackground>
      <View style={s.safeContainer}>
        {/* Header */}
        <View style={s.listHeader}>
          <View>
            <Text style={s.headerBrand}>EXPEDITION COMMAND SYSTEM</Text>
            <Text style={s.headerTitle}>VEHICLES</Text>
          </View>
          <View style={s.headerRight}>
            <View style={[s.onlineDot, { backgroundColor: isOnline ? '#4CAF50' : '#E53935' }]} />
            <Text style={[s.onlineText, { color: isOnline ? '#4CAF50' : '#E53935' }]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
          {/* No vehicles — prompt to go to Fleet wizard */}
          {vehicles.length === 0 && (
            <View style={s.emptyCard}>
              <View style={s.emptyIconWrap}>
                <Ionicons name="car-outline" size={36} color={TACTICAL.textMuted} />
              </View>
              <Text style={s.emptyTitle}>NO VEHICLES</Text>
              <Text style={s.emptyDesc}>
                No vehicle configured — go to Fleet to create one.
              </Text>
              <TouchableOpacity style={s.addBtnPrimary} onPress={handleAddVehicle} activeOpacity={0.8}>
                <Ionicons name="add-circle-outline" size={18} color="#0B0F12" />
                <Text style={s.addBtnPrimaryText}>ADD VEHICLE</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Vehicle cards */}
          {vehicles.map((v) => {
            const isActive = v.id === activeVehicleId;
            const hasConfig = !!(v as any).wizard_config;
            const vIcon = getVehicleIcon(v);
            const spec = vehicleSpecStore.get(v.id);

            return (
              <View key={v.id} style={[s.vehicleCard, isActive && s.vehicleCardActive]}>
                <View style={s.vehicleCardTop}>
                  <View style={[s.vehicleIcon, isActive && { backgroundColor: 'rgba(196, 138, 44, 0.2)' }]}>
                    <Ionicons name={vIcon as any} size={20} color={isActive ? TACTICAL.amber : TACTICAL.textMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.vehicleName}>{v.name}</Text>
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

                {/* Action buttons */}
                <View style={s.vehicleActions}>
                  {!isActive && (
                    <TouchableOpacity style={s.selectBtn} onPress={() => handleSelectVehicle(v.id)} activeOpacity={0.8}>
                      <Ionicons name="radio-button-off-outline" size={14} color={TACTICAL.amber} />
                      <Text style={s.selectBtnText}>SELECT</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleEditVehicle(v)} activeOpacity={0.8}>
                    <Ionicons name="create-outline" size={14} color={TACTICAL.textMuted} />
                    <Text style={s.actionBtnText}>EDIT</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtn} onPress={() => handleDuplicateVehicle(v)} activeOpacity={0.8}>
                    <Ionicons name="copy-outline" size={14} color={TACTICAL.textMuted} />
                    <Text style={s.actionBtnText}>COPY</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.actionBtnDanger} onPress={() => handleDeleteVehicle(v)} activeOpacity={0.8}>
                    <Ionicons name="trash-outline" size={14} color={TACTICAL.danger} />
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

          <View style={{ height: 140 }} />
        </ScrollView>

        {/* Bottom Actions */}
        <View style={s.bottomActions}>
          <TouchableOpacity style={s.bottomBtn} onPress={handleConfigureLoadout} activeOpacity={0.8}>
            <Ionicons name="cube-outline" size={16} color={TACTICAL.amber} />
            <Text style={s.bottomBtnText}>CONFIGURE LOADOUT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.bottomBtnPrimary} onPress={handleDeployExpedition} activeOpacity={0.8}>
            <Ionicons name="compass-outline" size={16} color="#0B0F12" />
            <Text style={s.bottomBtnPrimaryText}>DEPLOY EXPEDITION</Text>
          </TouchableOpacity>
        </View>


        {/* Footer */}
        <View style={s.footer}>
          <Text style={s.footerText}>
            ECS SETUP  //  {vehicles.length} VEHICLE{vehicles.length !== 1 ? 'S' : ''}  //  {activeVehicle ? activeVehicle.name : 'NONE SELECTED'}
          </Text>
        </View>
      </View>
    </TopoBackground>
  );
}

// ============================================================
// EXPORTED SCREEN
// ============================================================
export default function ExpeditionsScreen() {
  return (
    <SetupErrorBoundary>
      <SetupScreenInner />
    </SetupErrorBoundary>
  );
}

// ============================================================
// STYLES
// ============================================================
const s = StyleSheet.create({
  safeContainer: { flex: 1, backgroundColor: 'transparent' },
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

  // Empty state
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

  // Vehicle actions
  vehicleActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
  selectBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 10, borderRadius: 8, backgroundColor: TACTICAL.amber,
  },
  selectBtnText: { fontSize: 10, fontWeight: '900', color: '#0B0F12', letterSpacing: 1 },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.4)', backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },
  actionBtnText: { fontSize: 9, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 0.8 },
  actionBtnDanger: {
    paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(192, 57, 43, 0.3)', backgroundColor: 'rgba(192, 57, 43, 0.06)',
  },

  // Add button
  addBtnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, marginTop: 4, borderRadius: 10, borderWidth: 1.5,
    borderColor: TACTICAL.amber, borderStyle: 'dashed', backgroundColor: 'rgba(196, 138, 44, 0.04)',
  },
  addBtnOutlineText: { fontSize: 12, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.2 },

  // Bottom actions
  bottomActions: {
    flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingVertical: 10,
    borderTopWidth: GOLD_RAIL.sectionWidth, borderTopColor: GOLD_RAIL.section,
  },
  bottomBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.5)', backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  bottomBtnText: { fontSize: 10, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1 },
  bottomBtnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, borderRadius: 10, backgroundColor: TACTICAL.amber,
  },
  bottomBtnPrimaryText: { fontSize: 10, fontWeight: '900', color: '#0B0F12', letterSpacing: 1 },

  // Footer
  footer: {
    alignItems: 'center', paddingVertical: 10,
    paddingBottom: Platform.OS === 'web' ? 10 : 20,
    borderTopWidth: GOLD_RAIL.subsectionWidth, borderTopColor: GOLD_RAIL.subsection,
  },
  footerText: { fontSize: 9, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 1.5, textAlign: 'center' },
});




