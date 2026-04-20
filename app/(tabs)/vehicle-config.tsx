/**
 * Vehicle Configuration Wizard — 2-Step Flow
 *
 * Step 1: Vehicle Specification
 *   - Select vehicle preset (or enter manually)
 *   - Set GVWR, base weight, fuel type, fuel tank capacity
 *
 * Step 2: Accessory Framework
 *   - Define the vehicle's accessory/storage systems
 *   - Drives automatic container generation later
 *
 * After Step 2 → Finalize and return to Fleet/Dashboard.
 *
 * OFFLINE-FIRST: Works without authentication. Vehicles are stored locally
 * and synced to cloud when user signs in.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  Animated,
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import { useApp } from '../../context/AppContext';
import { vehicleStore } from '../../lib/vehicleStore';
import { getVehicleIcon } from '../../lib/vehicleIcons';
import type { Vehicle } from '../../lib/types';
import { getHardwareAdditionsWeight } from '../../lib/weightEngine';
import { vehicleSpecStore } from '../../lib/vehicleSpecStore';

import VehicleSpecsSection from '../../components/vehicle-config/VehicleSpecsSection';
import BlueprintCacheIndicator from '../../components/vehicle-config/BlueprintCacheIndicator';

import { setBuilderState, setCachedVehicleZones } from '../../lib/expeditionCache';
import { useWizardState } from '../../context/WizardStateContext';
import { wizardDraftStore } from '../../lib/wizardDraftStore';
import AccessoryConfigStep, {
  getDefaultAccessorySelections,
  type AccessorySelections,
} from '../../components/vehicle-wizard/AccessoryConfigStep';
import {
  buildAccessoryFramework,
  generateContainerZonesFromAccessories,
  frameworkToSelections,
} from '../../lib/accessoryFramework';
import type { AccessoryFramework } from '../../lib/accessoryFramework';

import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { getShellBottomClearance, getShellHeaderTopPadding } from '../../lib/shellLayout';
import { ECS_READINESS_COPY, ECS_STATE_COPY } from '../../lib/ecsStateCopy';
import {
  generateContainerAllocations,
  allocationsToZonePayload,
  getTotalSlots,
  type ContainerAllocation,
} from '../../lib/accessoryContainerMapping';
import { EASING, MOTION } from '../../lib/motion';


// ── View modes: list → vehicleSpec → accessories ────────
type ViewMode = 'list' | 'vehicleSpec' | 'accessories';

const REFERRER_ROUTES: Record<string, string> = {
  fleet: '/(tabs)/fleet',
  expeditions: '/(tabs)/expeditions',
  loadmap: '/(tabs)/loadmap',
  dashboard: '/(tabs)/dashboard',
};

export default function VehicleConfigScreen() {
  const router = useRouter();
  const { user, showToast, isOnline } = useApp();
  const { setConfigurationDeployed } = useWizardState();
  const insets = useSafeAreaInsets();
  const headerTopPadding = useMemo(() => getShellHeaderTopPadding(insets.top), [insets.top]);
  const dockClearance = useMemo(() => getShellBottomClearance(insets.bottom, 8), [insets.bottom]);

  // ── Deep-link params ──────────────────────────────────
  const searchParams = useLocalSearchParams<{ startAtStep?: string; vehicleId?: string; referrer?: string }>();
  const deepLinkConsumedRef = useRef(false);

  // ── Edit Mode Tracking ────────────────────────────────
  const isEditModeRef = useRef(false);
  const referrerRouteRef = useRef<string | null>(null);

  // ── Vehicle list state ────────────────────────────────
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'cloud' | 'local' | 'merged'>('local');

  // ── View mode ─────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // ── Wizard state (selections preserved for zone generation) ──
  const [selections, setSelections] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // ── Accessory Configuration State ─────────────────────
  const [accessorySelections, setAccessorySelections] = useState<AccessorySelections>(
    getDefaultAccessorySelections()
  );
  const [accessoriesConfirmed, setAccessoriesConfirmed] = useState(false);

  // ── Draft Persistence State ────────────────────────────
  const [draftSavedVisible, setDraftSavedVisible] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<ReturnType<typeof wizardDraftStore.load>>(null);
  const draftSavedAnim = useRef(new Animated.Value(0)).current;

  // ── Animation ─────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const transitionCycleRef = useRef(0);
  const animateTransition = useCallback((callback: () => void) => {
    const transitionCycle = ++transitionCycleRef.current;
    fadeAnim.stopAnimation();
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: MOTION.screenFadeOut,
      easing: EASING.accelerate,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished || transitionCycle !== transitionCycleRef.current) return;
      callback();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: MOTION.screenFadeIn,
        easing: EASING.decelerate,
        useNativeDriver: true,
      }).start();
    });
  }, [fadeAnim]);
  const startWizardRef = useRef<(vehicleId: string) => void>(() => {});

  // ── 2-Step Progress Computation ───────────────────────
  const wizardPhaseInfo = useMemo(() => {
    if (viewMode === 'accessories') {
      return { phaseNumber: 2, totalPhases: 2, progressPercent: 100 };
    }
    if (viewMode === 'vehicleSpec') {
      return { phaseNumber: 1, totalPhases: 2, progressPercent: 50 };
    }
    return { phaseNumber: 1, totalPhases: 2, progressPercent: 0 };
  }, [viewMode]);

  // ── Derived: selected vehicle object ──────────────────
  const selectedVehicle = vehicles.find(v => v.id === selectedVehicleId);

  // ── Fetch vehicles ────────────────────────────────────
  const fetchVehicles = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const result = await vehicleStore.getAll(user?.id || null);
      setVehicles(result.vehicles);
      setDataSource(result.source);
    } catch (err: any) {
      console.error('[VehicleConfig] fetch error:', err);
      setFetchError(err?.message || 'Failed to load vehicles');
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  // ── Deep-link: Auto-start wizard at specific step ──────
  useEffect(() => {
    if (deepLinkConsumedRef.current) return;
    if (loading) return;
    if (vehicles.length === 0) return;

    const { startAtStep, vehicleId: paramVehicleId, referrer } = searchParams;
    if (!startAtStep && !paramVehicleId) return;

    deepLinkConsumedRef.current = true;

    const targetVehicleId = paramVehicleId || vehicles[0]?.id;
    if (!targetVehicleId) return;

    const vehicle = vehicles.find(v => v.id === targetVehicleId);
    if (!vehicle) {
      console.warn('[VehicleConfig] Deep-link vehicle not found:', targetVehicleId);
      return;
    }

    // Set edit mode tracking — for both accessory deep-link AND full reconfigure from Fleet
    if (startAtStep || referrer) {
      isEditModeRef.current = true;
      referrerRouteRef.current = (referrer && REFERRER_ROUTES[referrer]) || '/(tabs)/fleet';
    }

    // Suppress the resume draft prompt when deep-linking
    setShowResumePrompt(false);
    setPendingDraft(null);

    // Start the wizard for the target vehicle
    startWizardRef.current(targetVehicleId);

    // If startAtStep is accessoryConfiguration, jump directly to Step 2
    if (startAtStep === 'accessoryConfiguration') {
      setTimeout(() => {
        setViewMode('accessories');
      }, 50);
    }
  }, [loading, searchParams, vehicles]);


  // ── Draft Saved Flash Animation ────────────────────────
  const flashDraftSaved = useCallback(() => {
    setDraftSavedVisible(true);
    draftSavedAnim.setValue(0);
    Animated.sequence([
      Animated.timing(draftSavedAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(1200),
      Animated.timing(draftSavedAnim, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]).start(() => setDraftSavedVisible(false));
  }, [draftSavedAnim]);

  // ── Check for saved draft on mount ─────────────────────
  useEffect(() => {
    const draft = wizardDraftStore.load();
    if (draft && draft.vehicleId && Object.keys(draft.selections).length > 0) {
      setPendingDraft(draft);
      setShowResumePrompt(true);
    }
  }, []);

  // ── Resume draft handler ───────────────────────────────
  const handleResumeDraft = useCallback(() => {
    if (!pendingDraft) return;
    setSelectedVehicleId(pendingDraft.vehicleId);
    setSelections(pendingDraft.selections);
    setShowResumePrompt(false);
    setPendingDraft(null);
    animateTransition(() => setViewMode('vehicleSpec'));
  }, [animateTransition, pendingDraft]);

  const handleStartFresh = useCallback(() => {
    wizardDraftStore.clear();
    setShowResumePrompt(false);
    setPendingDraft(null);
  }, []);

  // ── Start Wizard for a vehicle ─────────────────────────
  // Pre-populates accessory selections from the vehicle's persisted
  // accessoryFramework (via frameworkToSelections) as the primary source.
  // Falls back to wizard_config._accessories (legacy JSON) if no framework.
  const startWizard = useCallback((vehicleId: string) => {
    setSelectedVehicleId(vehicleId);

    const vehicle = vehicles.find(v => v.id === vehicleId);
    if (vehicle) {
      // Restore wizard_config selections (vehicle_type, etc.)
      const wc = (vehicle as any).wizard_config;
      if (wc && typeof wc === 'object') {
        const restored: Record<string, string> = {};
        for (const [key, val] of Object.entries(wc)) {
          if (!key.startsWith('_') && typeof val === 'string') {
            restored[key] = val;
          }
        }
        setSelections(restored);
      } else {
        setSelections({});
      }

      // ── Restore accessory selections ──────────────────────
      // Priority 1: Use persisted accessoryFramework (the canonical source of truth)
      //             and convert it back to AccessorySelections via frameworkToSelections()
      // Priority 2: Fall back to wizard_config._accessories (legacy JSON blob)
      // Priority 3: Default empty selections
      const persistedFramework: AccessoryFramework | null = (vehicle as any).accessoryFramework || null;

      if (persistedFramework) {
        // Primary path: restore from the persisted accessoryFramework
        const restoredSelections = frameworkToSelections(persistedFramework);
        setAccessorySelections(restoredSelections);
        setAccessoriesConfirmed(true);
        console.log('[VehicleConfig] Restored accessory selections from persisted accessoryFramework');
      } else if (wc?._accessories) {
        // Legacy fallback: restore from wizard_config._accessories JSON
        try {
          const parsed = JSON.parse(wc._accessories);
          setAccessorySelections(parsed);
          setAccessoriesConfirmed(true);
          console.log('[VehicleConfig] Restored accessory selections from wizard_config._accessories (legacy)');
        } catch {
          setAccessorySelections(getDefaultAccessorySelections());
          setAccessoriesConfirmed(false);
        }
      } else {
        // No prior accessory data — start fresh
        setAccessorySelections(getDefaultAccessorySelections());
        setAccessoriesConfirmed(false);
      }
    } else {
      setSelections({});
      setAccessorySelections(getDefaultAccessorySelections());
      setAccessoriesConfirmed(false);
    }

    animateTransition(() => setViewMode('vehicleSpec'));
  }, [animateTransition, vehicles]);
  startWizardRef.current = startWizard;


  // ── Add New Vehicle ────────────────────────────────────
  // Routes to the full setup wizard (/setup?mode=fleet-add) so every new vehicle
  // starts from the Vehicle Selection step with preset/make/model selection,
  // identical to the first vehicle experience. This prevents new vehicles from
  // skipping the identity step and landing directly on Vehicle Spec.
  const handleAddNewVehicle = useCallback(async () => {
    hapticMicro();
    router.push({ pathname: '/setup', params: { mode: 'fleet-add' } } as any);
  }, [router]);


  // ── Save & Exit handler ────────────────────────────────
  const handleSaveAndExit = useCallback(() => {
    if (selectedVehicleId) {
      wizardDraftStore.saveNow({
        vehicleId: selectedVehicleId,
        vehicleName: selectedVehicle?.name || null,
        stepIndex: viewMode === 'accessories' ? 1 : 0,
        selections,
        savedAt: new Date().toISOString(),
      });
      showToast('Configuration draft saved');
    }
    animateTransition(() => {
      setViewMode('list');
      setSelections({});
    });
  }, [animateTransition, selectedVehicleId, selectedVehicle?.name, selections, showToast, viewMode]);

  // ── Animation helper ──────────────────────────────────
  // ── Step 1 → Step 2 ───────────────────────────────────
  const goToAccessories = useCallback(() => {
    animateTransition(() => setViewMode('accessories'));
  }, [animateTransition]);

  // ── Helper: Navigate back to referrer (edit mode exit) ──
  const exitToReferrer = () => {
    const route = referrerRouteRef.current || '/(tabs)/fleet';
    isEditModeRef.current = false;
    referrerRouteRef.current = null;
    setViewMode('list');
    setSelections({});
    setAccessorySelections(getDefaultAccessorySelections());
    setAccessoriesConfirmed(false);
    router.push(route as any);
  };

  // ── Back navigation ───────────────────────────────────
  const goBack = () => {
    if (viewMode === 'accessories') {
      if (isEditModeRef.current) {
        exitToReferrer();
      } else {
        animateTransition(() => setViewMode('vehicleSpec'));
      }
    } else if (viewMode === 'vehicleSpec') {
      if (isEditModeRef.current) {
        exitToReferrer();
      } else {
        animateTransition(() => {
          setViewMode('list');
          setSelections({});
          setAccessorySelections(getDefaultAccessorySelections());
          setAccessoriesConfirmed(false);
        });
      }
    }
  };

  // ── Finalize Configuration (called from AccessoryConfigStep) ──
  const handleFinalize = async () => {
    if (!selectedVehicleId) return;

    setAccessoriesConfirmed(true);
    setSaving(true);

    try {
      const accessoryFramework = buildAccessoryFramework(accessorySelections);
      const containerZones = generateContainerZonesFromAccessories(accessoryFramework);

      // Generate container allocations from accessory selections
      const containerAllocations = generateContainerAllocations(accessorySelections, []);
      const zonesPayload = allocationsToZonePayload(containerAllocations);

      const result = await vehicleStore.finalizeConfig(
        selectedVehicleId,
        zonesPayload,
        {
          ...selections,
          _accessories: JSON.stringify(accessorySelections),
        },
        user?.id || null,
        {
          accessoryFramework,
          containerZones,
        }
      );

      if (!result.success) {
        Alert.alert('Error', result.error || 'Failed to save vehicle configuration.');
        setSaving(false);
        return;
      }

      const totalSlotsSaved = getTotalSlots(containerAllocations);
      showToast(`Vehicle configured · ${totalSlotsSaved} slots across ${containerAllocations.length} containers`);

      setConfigurationDeployed(true);
      vehicleSetupStore.setActiveVehicleId(selectedVehicleId);
      vehicleSetupStore.markOnboardingComplete();

      try {
        setBuilderState({
          vehicleSelected: true,
          vehicleId: selectedVehicleId,
          vehicleName: selectedVehicle?.name || null,
          frameworkConfigured: true,
          frameworkType: selections.vehicle_type || null,
          zonesConfigured: containerAllocations.length > 0,
          zoneCount: containerAllocations.length,
        });
        const cachedZones = containerAllocations.map((a) => ({
          id: a.containerId, name: a.name, zone_type: a.zoneType,
          slot_count: a.slotCount, color: a.color || null,
          icon: a.icon || null, sort_order: a.sortOrder,
        }));
        setCachedVehicleZones(selectedVehicleId, cachedZones);
      } catch (e) {
        console.warn('[VehicleConfig] Failed to update builder state:', e);
      }

      try {
        const hwAdditions = getHardwareAdditionsWeight(selections);
        vehicleSpecStore.update(selectedVehicleId, { hardware_additions_lb: hwAdditions });
      } catch (e) {
        console.warn('[VehicleConfig] Failed to cache hardware additions weight:', e);
      }

      wizardDraftStore.clear();

      const finalRoute = isEditModeRef.current
        ? (referrerRouteRef.current || '/(tabs)/dashboard')
        : '/(tabs)/dashboard';
      isEditModeRef.current = false;
      referrerRouteRef.current = null;
      setViewMode('list');
      setSelections({});
      setAccessorySelections(getDefaultAccessorySelections());
      setAccessoriesConfirmed(false);
      router.push(finalRoute as any);

    } catch (err: any) {
      Alert.alert('Error', err?.message || 'Failed to save configuration');
    }
    setSaving(false);
  };

  // ============================================================
  // RENDER: VEHICLE LIST VIEW
  // ============================================================
  const renderVehicleList = () => (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {!user && (
        <View style={styles.offlineBanner}>
          <View style={styles.offlineBannerRow}>
            <Ionicons name="shield-checkmark-outline" size={16} color={TACTICAL.amber} />
            <Text style={styles.offlineBannerTitle}>{ECS_READINESS_COPY.fleet.localModeTitle}</Text>
          </View>
          <Text style={styles.offlineBannerText}>{ECS_READINESS_COPY.fleet.localModeMessage}</Text>
        </View>
      )}
      {user && dataSource === 'local' && (
        <View style={styles.offlineBanner}>
          <View style={styles.offlineBannerRow}>
            <Ionicons name="cloud-offline-outline" size={14} color={TACTICAL.amber} />
            <Text style={styles.offlineBannerTitle}>{ECS_READINESS_COPY.fleet.cachedVehiclesTitle}</Text>
          </View>
          <Text style={styles.offlineBannerText}>{ECS_READINESS_COPY.fleet.cachedVehiclesMessage}</Text>
        </View>
      )}
      <View style={styles.sectionHeader}>
        <Ionicons name="car-sport-outline" size={16} color={TACTICAL.amber} />
        <Text style={styles.sectionTitle}>YOUR VEHICLES</Text>
      </View>
      {fetchError && (
        <View style={styles.errorCard}>
          <Ionicons name="warning-outline" size={20} color={TACTICAL.danger} />
          <Text style={styles.errorText}>{fetchError}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={fetchVehicles} activeOpacity={0.8}>
            <Text style={styles.retryBtnText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      )}
      {vehicles.length === 0 && !fetchError ? (
        <View style={styles.emptyCard}>
          <View style={styles.emptyIconWrap}><Ionicons name="car-outline" size={36} color={TACTICAL.textMuted} /></View>
          <Text style={styles.emptyText}>{ECS_STATE_COPY.recovery.vehicleLibraryEmpty.title}</Text>
          <Text style={styles.emptySubtext}>{ECS_STATE_COPY.recovery.vehicleLibraryEmpty.message}</Text>
          <TouchableOpacity style={styles.addBtnPrimary} onPress={handleAddNewVehicle} activeOpacity={0.8}>
            <Ionicons name="add-circle-outline" size={18} color="#0B0F12" />
            <Text style={styles.addBtnPrimaryText}>{ECS_STATE_COPY.recovery.vehicleLibraryEmpty.ctaLabel.toUpperCase()}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          {vehicles.map((v) => {
            const hasConfig = !!(v as any).wizard_config;
            const isLocal = v.owner_user_id === 'local';
            const vIcon = getVehicleIcon(v);
            return (
              <View key={v.id} style={styles.vehicleCard}>
                <View style={styles.vehicleCardTop}>
                  <View style={styles.vehicleIcon}><Ionicons name={vIcon as any} size={20} color={TACTICAL.amber} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vehicleName}>{v.name}</Text>
                    <Text style={styles.vehicleMeta}>{[v.year, v.make, v.model].filter(Boolean).join(' ') || 'No details'}</Text>
                  </View>
                  <View style={styles.badgeRow}>
                    {isLocal && (<View style={styles.localBadge}><Ionicons name="phone-portrait-outline" size={10} color={TACTICAL.amber} /><Text style={styles.localBadgeText}>LOCAL</Text></View>)}
                    {hasConfig && (<View style={styles.configuredBadge}><Ionicons name="checkmark-circle" size={12} color="#66BB6A" /><Text style={styles.configuredText}>CONFIGURED</Text></View>)}
                  </View>
                </View>
                <View style={styles.vehicleActions}>
                  <TouchableOpacity style={styles.configureBtn} onPress={() => startWizard(v.id)} activeOpacity={0.8}>
                    <Ionicons name="construct-outline" size={14} color="#0B0F12" />
                    <Text style={styles.configureBtnText}>{hasConfig ? 'RECONFIGURE' : 'CONFIGURE'}</Text>
                  </TouchableOpacity>
                </View>
                {hasConfig && (
                  <View style={{ marginTop: 8 }}>
                    <TouchableOpacity style={styles.loadMapBtn} onPress={() => router.push({ pathname: '/(tabs)/loadmap', params: { vehicleId: v.id } })} activeOpacity={0.8}>
                      <Ionicons name="map-outline" size={14} color={TACTICAL.amber} />
                      <Text style={styles.loadMapBtnText}>LOAD MAP</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })}
          <TouchableOpacity style={styles.addBtnOutline} onPress={handleAddNewVehicle} activeOpacity={0.8}>
            <View style={styles.addBtnIconWrap}><Ionicons name="add" size={18} color={TACTICAL.amber} /></View>
            <Text style={styles.addBtnOutlineText}>ADD VEHICLE</Text>
          </TouchableOpacity>
        </>
      )}

      <BlueprintCacheIndicator />
      <View style={{ height: 120 }} />
    </ScrollView>
  );

  // ============================================================
  // RENDER: VEHICLE SPECIFICATION (Step 1/2)
  // ============================================================
  const renderVehicleSpec = () => (
    <View style={styles.specContainer}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.specScrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Step header */}
        <View style={styles.specStepHeader}>
          <View style={styles.specStepBadge}>
            <Text style={styles.specStepBadgeText}>STEP 1/2</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.specStepTitle}>VEHICLE SPECIFICATION</Text>
            <Text style={styles.specStepSubtitle}>
              Set GVWR, base weight, and fuel profile for your vehicle.
            </Text>
          </View>
        </View>

        {/* Vehicle name card */}
        {selectedVehicle && (
          <View style={styles.vehicleNameCard}>
            <Ionicons name={getVehicleIcon(selectedVehicle) as any} size={16} color={TACTICAL.amber} />
            <Text style={styles.vehicleNameCardText}>{selectedVehicle.name}</Text>
          </View>
        )}

        {/* VehicleSpecsSection — full spec editor */}
        <VehicleSpecsSection
          vehicleId={selectedVehicleId || ''}
          vehicleType={selections.vehicle_type || ''}
          vehicleMake={selectedVehicle?.make}
          vehicleModel={selectedVehicle?.model}
          selections={selections}
        />

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Footer: BACK + NEXT */}
      <View style={styles.specFooter}>
        <TouchableOpacity
          style={styles.specFooterBackBtn}
          onPress={goBack}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={18} color={TACTICAL.textMuted} />
          <Text style={styles.specFooterBackText}>BACK</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.specFooterNextBtn}
          onPress={goToAccessories}
          activeOpacity={0.8}
        >
          <Text style={styles.specFooterNextText}>NEXT</Text>
          <Ionicons name="chevron-forward" size={18} color="#0B0F12" />
        </TouchableOpacity>
      </View>
    </View>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================

  const REFERRER_LABELS: Record<string, string> = {
    '/(tabs)/fleet': 'FLEET',
    '/(tabs)/expeditions': 'EXPEDITIONS',
    '/(tabs)/loadmap': 'LOAD MAP',
    '/(tabs)/dashboard': 'DASHBOARD',
  };

  const getBackLabel = () => {
    if (viewMode === 'list') return 'BACK';
    if (isEditModeRef.current && (viewMode === 'accessories' || viewMode === 'vehicleSpec')) {
      const route = referrerRouteRef.current || '/(tabs)/fleet';
      return REFERRER_LABELS[route] || 'BACK';
    }
    return 'BACK';
  };

  const getHeaderTitle = () => {
    if (viewMode === 'list') return 'VEHICLE CONFIGURE';
    if (viewMode === 'vehicleSpec') return 'STEP 1 — VEHICLE SPEC';
    if (viewMode === 'accessories') {
      return isEditModeRef.current ? 'EDIT ACCESSORIES' : 'STEP 2 — ACCESSORIES';
    }
    return 'CONFIGURE';
  };

  return (
    <View style={[styles.container, { paddingBottom: dockClearance }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerTopPadding }]}>
        <TouchableOpacity onPress={() => { if (viewMode === 'list') { router.back(); } else { goBack(); } }} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={22} color={TACTICAL.amber} />
          <Text style={styles.backText}>{getBackLabel()}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{getHeaderTitle()}</Text>
        {(viewMode === 'vehicleSpec' || viewMode === 'accessories') && draftSavedVisible ? (
          <Animated.View style={[styles.draftSavedWrap, { opacity: draftSavedAnim }]}>
            <Ionicons name="cloud-done-outline" size={10} color="#66BB6A" />
            <Text style={styles.draftSavedText}>DRAFT SAVED</Text>
          </Animated.View>
        ) : (
          <View style={{ width: 60 }} />
        )}
      </View>

      {/* ── 2-Step Progress Bar ─────────────────────────────── */}
      {(viewMode === 'vehicleSpec' || viewMode === 'accessories') && (
        <View style={styles.progressContainer}>
          <View style={styles.phaseDotsRow}>
            {[1, 2].map((phase) => (
              <View key={phase} style={styles.phaseDotGroup}>
                <View style={[
                  styles.phaseDot,
                  phase < wizardPhaseInfo.phaseNumber && styles.phaseDotComplete,
                  phase === wizardPhaseInfo.phaseNumber && styles.phaseDotActive,
                ]}>
                  {phase < wizardPhaseInfo.phaseNumber ? (
                    <Ionicons name="checkmark" size={8} color="#0B0F12" />
                  ) : (
                    <Text style={[
                      styles.phaseDotText,
                      phase === wizardPhaseInfo.phaseNumber && styles.phaseDotTextActive,
                    ]}>{phase}</Text>
                  )}
                </View>
                {phase < 2 && (
                  <View style={[
                    styles.phaseConnector,
                    phase < wizardPhaseInfo.phaseNumber && styles.phaseConnectorComplete,
                  ]} />
                )}
              </View>
            ))}
          </View>
          <Text style={styles.progressText}>
            {`STEP ${wizardPhaseInfo.phaseNumber}/2`}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={TACTICAL.accent} />
          <Text style={styles.loadingText}>LOADING VEHICLES...</Text>
        </View>
      ) : (
        <Animated.View style={[styles.contentArea, { opacity: fadeAnim }]}>
          {viewMode === 'list' && renderVehicleList()}

          {viewMode === 'vehicleSpec' && renderVehicleSpec()}

          {viewMode === 'accessories' && (
            <AccessoryConfigStep
              accessories={accessorySelections}
              onAccessoriesChange={setAccessorySelections}
              onBack={goBack}
              onNext={handleFinalize}
              isLastStep={true}
            />
          )}
        </Animated.View>
      )}

      {/* ── Resume Configuration Prompt Modal ────────────── */}
      <Modal
        visible={showResumePrompt}
        animationType="fade"
        transparent
        onRequestClose={handleStartFresh}
      >
        <View style={styles.resumeOverlay}>
          <View style={styles.resumeContainer}>
            <View style={styles.resumeIconWrap}>
              <Ionicons name="document-text-outline" size={28} color={TACTICAL.amber} />
            </View>
            <Text style={styles.resumeTitle}>Resume Configuration?</Text>
            <Text style={styles.resumeDesc}>
              {pendingDraft?.vehicleName
                ? `You have an unsaved draft for "${pendingDraft.vehicleName}". Would you like to pick up where you left off?`
                : 'You have an unsaved configuration draft. Would you like to resume?'}
            </Text>
            {pendingDraft?.savedAt && (
              <View style={styles.resumeMetaRow}>
                <Ionicons name="time-outline" size={12} color={TACTICAL.textMuted} />
                <Text style={styles.resumeMetaText}>
                  Saved {new Date(pendingDraft.savedAt).toLocaleDateString()} at{' '}
                  {new Date(pendingDraft.savedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
            <View style={styles.resumeBtnRow}>
              <TouchableOpacity style={styles.resumeBtnSecondary} onPress={handleStartFresh} activeOpacity={0.8}>
                <Ionicons name="refresh-outline" size={14} color={TACTICAL.textMuted} />
                <Text style={styles.resumeBtnSecondaryText}>START FRESH</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.resumeBtnPrimary} onPress={handleResumeDraft} activeOpacity={0.8}>
                <Ionicons name="play-outline" size={14} color="#0B0F12" />
                <Text style={styles.resumeBtnPrimaryText}>RESUME</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TACTICAL.bg,
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.3)',
  },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backText: { fontSize: 13, fontWeight: '700', color: TACTICAL.amber, letterSpacing: 1 },
  headerTitle: { fontSize: 13, fontWeight: '900', color: TACTICAL.text, letterSpacing: 1.5 },

  // Progress
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
    minWidth: 50,
    textAlign: 'right',
  },

  // Content
  contentArea: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 12, fontWeight: '700', color: TACTICAL.textMuted, letterSpacing: 1.5 },
  scroll: { flex: 1 },
  scrollContent: { padding: 16 },

  // Offline banner
  offlineBanner: {
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    borderRadius: 10,
    padding: 12,
    marginBottom: 14,
  },
  offlineBannerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  offlineBannerTitle: { fontSize: 10, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5 },
  offlineBannerText: { fontSize: 11, color: TACTICAL.textMuted, lineHeight: 16, paddingLeft: 24 },

  // Section
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, marginTop: 4 },
  sectionTitle: { fontSize: 11, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.5, flex: 1 },

  // Error
  errorCard: {
    alignItems: 'center', padding: 20, backgroundColor: 'rgba(192, 57, 43, 0.08)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(192, 57, 43, 0.3)', gap: 8, marginBottom: 12,
  },
  errorText: { fontSize: 11, color: TACTICAL.danger, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 20, paddingVertical: 10, backgroundColor: 'rgba(62, 79, 60, 0.3)',
    borderRadius: 8, borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.5)', marginTop: 4,
  },
  retryBtnText: { fontSize: 11, fontWeight: '800', color: TACTICAL.text, letterSpacing: 1 },

  // Empty
  emptyCard: {
    alignItems: 'center', padding: 32, backgroundColor: TACTICAL.panel, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.3)', gap: 10,
  },
  emptyIconWrap: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(62, 79, 60, 0.2)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  emptyText: { fontSize: 13, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },
  emptySubtext: { fontSize: 11, color: TACTICAL.textMuted, textAlign: 'center', lineHeight: 16 },

  // Vehicle Card
  vehicleCard: {
    backgroundColor: TACTICAL.panel, borderRadius: 12, borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)', padding: 14, marginBottom: 10,
  },
  vehicleCardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  vehicleIcon: {
    width: 42, height: 42, borderRadius: 12, backgroundColor: 'rgba(196, 138, 44, 0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  vehicleName: { fontSize: 14, fontWeight: '800', color: TACTICAL.text, letterSpacing: 0.3 },
  vehicleMeta: { fontSize: 11, color: TACTICAL.textMuted, marginTop: 2 },
  badgeRow: { flexDirection: 'column', alignItems: 'flex-end', gap: 4 },
  localBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: 'rgba(196, 138, 44, 0.12)', borderRadius: 4,
  },
  localBadgeText: { fontSize: 7, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 0.8 },
  configuredBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3,
    backgroundColor: 'rgba(76, 175, 80, 0.12)', borderRadius: 6,
  },
  configuredText: { fontSize: 8, fontWeight: '900', color: '#66BB6A', letterSpacing: 1 },
  vehicleActions: { flexDirection: 'row', marginTop: 12, gap: 8 },
  configureBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, backgroundColor: TACTICAL.amber, borderRadius: 8,
  },
  configureBtnText: { fontSize: 11, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },

  // Add Vehicle Buttons
  addBtnPrimary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 24, backgroundColor: TACTICAL.amber, borderRadius: 10, marginTop: 4,
  },
  addBtnPrimaryText: { fontSize: 12, fontWeight: '900', color: '#0B0F12', letterSpacing: 1.2 },
  addBtnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
    paddingVertical: 14, marginTop: 4, borderRadius: 10, borderWidth: 1.5,
    borderColor: TACTICAL.amber, borderStyle: 'dashed', backgroundColor: 'rgba(196, 138, 44, 0.04)',
  },
  addBtnIconWrap: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(196, 138, 44, 0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  addBtnOutlineText: { fontSize: 12, fontWeight: '900', color: TACTICAL.amber, letterSpacing: 1.2 },

  // Load Map Button
  loadMapBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 11, borderRadius: 8, borderWidth: 1.5,
    borderColor: 'rgba(196, 138, 44, 0.5)', backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  loadMapBtnText: { fontSize: 11, fontWeight: '900', color: '#C48A2C', letterSpacing: 1.2 },

  // ── 2-Phase Progress Dot Styles ────────────────────────
  phaseDotsRow: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  phaseDotGroup: { flexDirection: 'row', alignItems: 'center' },
  phaseDot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(62, 79, 60, 0.3)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(62, 79, 60, 0.5)',
  },
  phaseDotActive: { backgroundColor: TACTICAL.amber, borderColor: TACTICAL.amber },
  phaseDotComplete: { backgroundColor: '#66BB6A', borderColor: '#66BB6A' },
  phaseDotText: { fontSize: 9, fontWeight: '900', color: TACTICAL.textMuted },
  phaseDotTextActive: { color: '#0B0F12' },
  phaseConnector: {
    width: 20, height: 2,
    backgroundColor: 'rgba(62, 79, 60, 0.3)',
  },
  phaseConnectorComplete: { backgroundColor: '#66BB6A' },

  // ── Draft Saved Indicator ──────────────────────────────
  draftSavedWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 8, paddingVertical: 4,
    backgroundColor: 'rgba(102, 187, 106, 0.1)', borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(102, 187, 106, 0.25)',
    minWidth: 60, justifyContent: 'center',
  },
  draftSavedText: { fontSize: 7, fontWeight: '900', color: '#66BB6A', letterSpacing: 1 },

  // ── Vehicle Spec Step (Step 1/2) ───────────────────────
  specContainer: {
    flex: 1,
  },
  specScrollContent: {
    padding: 16,
  },
  specStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
  },
  specStepBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
  },
  specStepBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  specStepTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.2,
  },
  specStepSubtitle: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginTop: 2,
  },
  vehicleNameCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    marginBottom: 16,
  },
  vehicleNameCardText: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.amber,
    letterSpacing: 0.3,
  },
  specFooter: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 10,
    borderTopWidth: 1.5,
    borderTopColor: 'rgba(196, 138, 44, 0.35)',
    backgroundColor: 'rgba(11, 15, 18, 0.98)',
  },
  specFooterBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 16,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },
  specFooterBackText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  specFooterNextBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 40,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
    shadowColor: TACTICAL.amber,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  specFooterNextText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.2,
  },

  // ── Resume Prompt Modal ────────────────────────────────
  resumeOverlay: {
    flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  resumeContainer: {
    backgroundColor: '#1A1F16', borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)', padding: 24, width: '100%',
    maxWidth: 360, alignItems: 'center', gap: 12,
  },
  resumeIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  resumeTitle: { fontSize: 16, fontWeight: '900', color: TACTICAL.text, letterSpacing: 1, textAlign: 'center' },
  resumeDesc: { fontSize: 12, color: TACTICAL.textMuted, lineHeight: 18, textAlign: 'center', paddingHorizontal: 8 },
  resumeMetaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 4,
    backgroundColor: 'rgba(62, 79, 60, 0.15)', borderRadius: 6, alignSelf: 'stretch',
  },
  resumeMetaText: { fontSize: 10, fontWeight: '600', color: TACTICAL.textMuted, letterSpacing: 0.3 },
  resumeBtnRow: { flexDirection: 'row', gap: 10, marginTop: 8, alignSelf: 'stretch' },
  resumeBtnSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: 10, borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)', backgroundColor: 'rgba(62, 79, 60, 0.1)',
  },
  resumeBtnSecondaryText: { fontSize: 10, fontWeight: '800', color: TACTICAL.textMuted, letterSpacing: 1 },
  resumeBtnPrimary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingVertical: 13, borderRadius: 10, backgroundColor: TACTICAL.amber,
  },
  resumeBtnPrimaryText: { fontSize: 11, fontWeight: '900', color: '#0B0F12', letterSpacing: 1 },
});




