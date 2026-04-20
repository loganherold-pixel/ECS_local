/**
 * ECS First-Time Setup — Guided System Initialization (Phase 8)
 *
 * A refined 4-step setup flow:
 *   1. Vehicle Selection — Choose preset or enter GVWR + Base Weight
 *   2. Resources & Mechanical Profile — Fuel, water, power, lift, tire size
 *   3. Accessories — Define vehicle container system
 *   4. Loadout — Container-based loadout (optional)
 *
 * MODES:
 *   - Default (no params): First-time setup. Redirects to dashboard if already complete.
 *   - mode=fleet-add: Adding a new vehicle from Fleet tab. Skips the "already complete"
 *     redirect, starts with a fresh blank vehicle, and navigates to Fleet on completion.
 *     This ensures every new vehicle (Vehicle 2, 3, 4+) goes through the full wizard
 *     with make/model/preset selection — identical to the first vehicle experience.
 *   - mode=fleet-edit: Reconfiguring an existing vehicle from Fleet. Preloads the current
 *     rig into the same 4-step wizard and returns to Fleet after saving.
 *   - mode=guest-entry: Free/offline entry from the login screen. Starts a fresh setup
 *     flow without inheriting stale authenticated setup progress.
 *
 * Post-conditions:
 *   - vehicleSpecStore has GVWR + base weight
 *   - vehicleStore has a vehicle record
 *   - Resources & mechanical profile persisted (fuel, water, power, lift, tires)
 *   - accessoryFramework + containerZones persisted
 *   - Container allocations auto-generated from accessory selections
 *   - Vehicle returns to Fleet when the flow is fleet-managed
 *   - First-run setup exits into the normal ECS shell once the rig is ready
 *   - setupStore marked complete
 *   - Dashboard shows welcome banner on first load
 *
 * Resume: If setup is interrupted, resumes at the last completed step.
 *         In fleet-add and guest-entry modes, resume is disabled — always starts fresh.
 *
 * Aesthetic: Industrial matte, purposeful, production-ready.
 */
import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Animated,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeIcon as Ionicons } from '../components/SafeIcon';

import { TACTICAL, GOLD_RAIL } from '../lib/theme';
import { MOTION, EASING } from '../lib/motion';

import { useTheme } from '../context/ThemeContext';
import { useApp } from '../context/AppContext';

import { vehicleSpecStore, VEHICLE_SPEC_PRESETS, type VehicleSpec, type VehicleSpecPreset, type FuelType } from '../lib/vehicleSpecStore';
import { vehicleStore } from '../lib/vehicleStore';

import { setupStore, SETUP_STEPS, type SetupStep } from '../lib/setupStore';
import { vehicleSetupStore } from '../lib/vehicleSetupStore';
import { resolveConfiguredVehiclePresence } from '../lib/vehiclePresence';
import { buildVehicleResourceMirror, getVehicleResourceProfile } from '../lib/vehicleResourceProfile';
import { tiresLiftStore } from '../lib/tiresLiftStore';

import TopoBackground from '../components/TopoBackground';
import {
  ECSFormSection,
  ECSFormSummary,
  ECSSegmentedField,
  ECSUnitInput,
} from '../components/ECSForm';

import AccessoryConfigStep, {
  getDefaultAccessorySelections,
  type AccessorySelections,
} from '../components/vehicle-wizard/AccessoryConfigStep';

import LoadoutWizardStep from '../components/vehicle-wizard/LoadoutWizardStep';

import {
  buildAccessoryFramework,
  generateContainerZonesFromAccessories,
  frameworkToSelections,
} from '../lib/accessoryFramework';

import {
  generateContainerAllocations,
  allocationsToZonePayload,
  getTotalSlots,
} from '../lib/accessoryContainerMapping';

import { hapticMicro } from '../lib/haptics';
import { getShellBottomClearance, getShellHeaderTopPadding } from '../lib/shellLayout';
import { ECS_TEXT, ECS_TEXT_SPACING } from '../lib/ecsTypographyTokens';
import { useAdaptiveLayout } from '../lib/useAdaptiveLayout';

// ── Step definitions (4-step flow) ──────────────────────
const STEPS: SetupStep[] = SETUP_STEPS;

// ── Preset category labels ──────────────────────────────
const PRESET_CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'truck', label: 'Truck', icon: 'car-outline' },
  { key: 'suv', label: 'SUV', icon: 'bus-outline' },
  { key: 'van', label: 'Van', icon: 'trail-sign-outline' },
  { key: 'jeep', label: 'Jeep', icon: 'navigate-outline' },
  { key: 'car_crossover', label: 'Crossover', icon: 'speedometer-outline' },
];

type SuspensionMode = 'stock' | 'level' | 'lift';

function isVanPreset(preset: VehicleSpecPreset): boolean {
  const model = (preset.model || '').toLowerCase();
  return model.includes('sprinter') || model.includes('transit') || model.includes('promaster');
}

function getPresetsForCategory(categoryKey: string): VehicleSpecPreset[] {
  if (categoryKey === 'suv') {
    return (VEHICLE_SPEC_PRESETS.suv_van || []).filter((preset) => !isVanPreset(preset));
  }
  if (categoryKey === 'van') {
    return (VEHICLE_SPEC_PRESETS.suv_van || []).filter(isVanPreset);
  }
  return VEHICLE_SPEC_PRESETS[categoryKey] || [];
}

function formatSetupNumber(value: number | null | undefined): string {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? String(value)
    : '';
}

function normalizeSetupMetric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function getVehicleMechanicalProfile(
  vehicleId: string | null,
  vehicle: any,
): {
  tireSizeInches: number | null;
  suspensionLiftInches: number | null;
  isLeveled: boolean;
  suspensionMode: SuspensionMode;
} {
  const storedProfile = vehicleId ? tiresLiftStore.get(vehicleId) : null;
  const mirroredProfile = vehicle?.wizard_config?._mechanical_profile;
  const suspensionMode: SuspensionMode =
    mirroredProfile?.suspension_mode === 'level' || storedProfile?.isLeveled
      ? 'level'
      : mirroredProfile?.suspension_mode === 'lift'
        || (storedProfile?.suspensionLiftInches ?? 0) > 0
        ? 'lift'
        : 'stock';

  return {
    tireSizeInches: normalizeSetupMetric(
      storedProfile?.tireSizeInches ?? mirroredProfile?.tire_size_inches ?? null,
    ),
    suspensionLiftInches: normalizeSetupMetric(
      storedProfile?.suspensionLiftInches ?? mirroredProfile?.suspension_lift_inches ?? null,
    ),
    isLeveled: storedProfile?.isLeveled ?? false,
    suspensionMode,
  };
}

function buildVehicleMechanicalMirror(
  existingWizardConfig: Record<string, any> | null | undefined,
  profile: {
    tireSizeInches?: number | null;
    suspensionLiftInches?: number | null;
    isLeveled?: boolean;
    suspensionMode?: SuspensionMode;
  },
): Record<string, any> {
  const existing = existingWizardConfig && typeof existingWizardConfig === 'object'
    ? existingWizardConfig
    : {};
  const existingMechanical = existing._mechanical_profile && typeof existing._mechanical_profile === 'object'
    ? existing._mechanical_profile
    : {};

  return {
    ...existing,
    _mechanical_profile: {
      ...existingMechanical,
      tire_size_inches: normalizeSetupMetric(profile.tireSizeInches ?? null),
      suspension_lift_inches: normalizeSetupMetric(profile.suspensionLiftInches ?? null),
      suspension_mode: profile.suspensionMode ?? 'stock',
      is_leveled: profile.isLeveled ?? false,
    },
  };
}

export default function SetupScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { user, showToast } = useApp();
  const insets = useSafeAreaInsets();
  const adaptive = useAdaptiveLayout();
  const headerTopPadding = useMemo(() => getShellHeaderTopPadding(insets.top), [insets.top]);
  const dockClearance = useMemo(() => getShellBottomClearance(insets.bottom, 8), [insets.bottom]);
  const fixedStepMaxWidth = adaptive.setup.fixedStepMaxWidth;
  const fixedStepHorizontalPadding = adaptive.setup.fixedStepHorizontalPadding;

  // ── Mode Detection ────────────────────────────────────
  // mode=fleet-add: Adding a new vehicle from Fleet tab.
  // Forces fresh state, skips "already complete" redirect,
  // and navigates to Fleet on completion instead of Dashboard.
  const searchParams = useLocalSearchParams<{
    mode?: string | string[];
    vehicleId?: string | string[];
  }>();
  const routeModeParam = Array.isArray(searchParams.mode) ? searchParams.mode[0] : searchParams.mode;
  const routeVehicleIdParam = Array.isArray(searchParams.vehicleId)
    ? searchParams.vehicleId[0]
    : searchParams.vehicleId;
  const isFleetAddMode = routeModeParam === 'fleet-add';
  const isFleetEditMode = routeModeParam === 'fleet-edit';
  const isGuestEntryMode = routeModeParam === 'guest-entry';
  const isFleetManagedMode = isFleetAddMode || isFleetEditMode;
  const isFreshSetupMode = isFleetAddMode || isGuestEntryMode;
  const editVehicleIdParam =
    typeof routeVehicleIdParam === 'string' && routeVehicleIdParam.length > 0
      ? routeVehicleIdParam
      : null;
  const modeConsumedRef = useRef(false);
  const entryVehicleCountRef = useRef(vehicleStore.getLocalSnapshot().length);
  const entryActiveVehicleIdRef = useRef(vehicleSetupStore.getActiveVehicleId());

  // ── Resume: check for last completed step ─────────────
  // In fleet-managed modes, always start from step 0 so add/edit flows
  // feel intentional and not like a resumed onboarding interruption.
  // In default mode, resume from last saved step.
  const resumeStep = isFleetManagedMode || isGuestEntryMode ? null : setupStore.getCurrentStep();
  const initialStepIndex = resumeStep ? SETUP_STEPS.indexOf(resumeStep) : 0;

  // ── Step State ────────────────────────────────────────
  const [step, setStep] = useState<SetupStep>(STEPS[Math.max(0, initialStepIndex)]);
  const stepIndex = STEPS.indexOf(step);

  // ── Animation ─────────────────────────────────────────
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  // ── Vehicle Spec State ────────────────────────────────
  const [gvwr, setGvwr] = useState('');
  const [baseWeight, setBaseWeight] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>('gas');
  const [selectedPresetCategory, setSelectedPresetCategory] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<VehicleSpecPreset | null>(null);

  // ── Resources & Mechanical Profile State ─────────────
  const [fuelCapacity, setFuelCapacity] = useState('');
  const [waterCapacity, setWaterCapacity] = useState('');
  const [powerStorage, setPowerStorage] = useState('');
  const [suspensionMode, setSuspensionMode] = useState<SuspensionMode>('stock');
  const [vehicleLift, setVehicleLift] = useState('');
  const [tireSize, setTireSize] = useState('');

  // ── Accessory Configuration State ─────────────────────
  const [accessorySelections, setAccessorySelections] = useState<AccessorySelections>(
    getDefaultAccessorySelections()
  );

  // ── Vehicle ID (created or existing) ──────────────────
  // In fresh setup modes, always start with null so guest/free entry and fleet-add
  // both begin from a clean vehicle selection state.
  const [vehicleId, setVehicleId] = useState<string | null>(
    isFreshSetupMode ? null : (editVehicleIdParam || setupStore.getSetupVehicleId())
  );

  // ── Loadout saving state ──────────────────────────────
  const [loadoutSaving, setLoadoutSaving] = useState(false);
  const [restoreHydrated, setRestoreHydrated] = useState(false);

  // ── Validation ────────────────────────────────────────
  const [gvwrError, setGvwrError] = useState('');
  const [baseWeightError, setBaseWeightError] = useState('');
  const [primaryBodyHeight, setPrimaryBodyHeight] = useState(0);
  const [vehicleContentHeight, setVehicleContentHeight] = useState(0);
  const [resourceContentHeight, setResourceContentHeight] = useState(0);

  const gvwrNum = parseFloat(gvwr) || 0;
  const baseWeightNum = parseFloat(baseWeight) || 0;
  const isVehicleSpecValid = gvwrNum > 0 && baseWeightNum > 0 && baseWeightNum < gvwrNum;

  // ── Available presets for selected category ───────────
  const availablePresets = useMemo(() => {
    if (!selectedPresetCategory) return [];
    return getPresetsForCategory(selectedPresetCategory);
  }, [selectedPresetCategory]);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([
      setupStore.waitForHydration(),
      vehicleSetupStore.waitForHydration(),
      vehicleStore.waitForHydration(),
      vehicleSpecStore.waitForHydration(),
      tiresLiftStore.waitForHydration(),
    ]).then(() => {
      if (cancelled) return;
      entryVehicleCountRef.current = vehicleStore.getLocalSnapshot().length;
      entryActiveVehicleIdRef.current = vehicleSetupStore.getActiveVehicleId();
      setRestoreHydrated(true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // ── Check for existing setup on mount ─────────────────
  // In fleet-managed modes, skip this redirect — we're intentionally
  // re-entering setup to create a new vehicle.
  useEffect(() => {
    if (!restoreHydrated) return;
    if (isFleetManagedMode) {
      // Fleet-managed modes: ensure explicit add/edit entry
      if (!modeConsumedRef.current) {
        modeConsumedRef.current = true;
        console.log(
          `[Setup] ${isFleetEditMode ? 'Fleet-edit' : 'Fleet-add'} mode: entering managed vehicle wizard`,
        );
      }
      return;
    }
    if (isGuestEntryMode) {
      if (!modeConsumedRef.current) {
        modeConsumedRef.current = true;
        console.log('[Setup] Guest-entry mode: entering fresh free setup wizard');
      }
      return;
    }
    if (setupStore.isComplete() && resolveConfiguredVehiclePresence().hasConfiguredVehicle) {
      router.replace('/(tabs)/dashboard');
    }
  }, [isFleetEditMode, isFleetManagedMode, isGuestEntryMode, restoreHydrated, router]);


  // ── Restore saved resources/mechanical profile on mount ──
  // In fresh setup modes, skip restoring previous profile
  // to ensure a completely fresh vehicle configuration.
  useEffect(() => {
    if (!restoreHydrated) return;
    if (isFreshSetupMode) return; // Fresh vehicle — don't restore old data

    const persistedVehicleId = editVehicleIdParam || setupStore.getSetupVehicleId();
    const persistedVehicle = persistedVehicleId ? vehicleStore.getById(persistedVehicleId) : null;
    const persistedResources = getVehicleResourceProfile(persistedVehicle as any);
    const persistedMechanical = getVehicleMechanicalProfile(persistedVehicleId, persistedVehicle);

    if (persistedVehicle) {
      setFuelCapacity(formatSetupNumber(persistedVehicle.fuel_tank_capacity_gal));
      setWaterCapacity(formatSetupNumber(persistedResources.waterCapacityGal));
      setPowerStorage(formatSetupNumber(persistedResources.batteryUsableWh));
      setSuspensionMode(persistedMechanical.suspensionMode);
      setVehicleLift(formatSetupNumber(persistedMechanical.suspensionLiftInches));
      setTireSize(formatSetupNumber(persistedMechanical.tireSizeInches));
      return;
    }

    const saved = setupStore.getResourceProfile();
    if (saved) {
      setFuelCapacity(formatSetupNumber(saved.fuel_capacity_gal));
      setWaterCapacity(formatSetupNumber(saved.water_capacity_gal));
      setPowerStorage(formatSetupNumber(saved.power_storage_wh));
      setSuspensionMode(
        saved.suspension_mode
          ?? (saved.suspension_is_leveled ? 'level' : (saved.suspension_lift_inches ?? 0) > 0 ? 'lift' : 'stock'),
      );
      setVehicleLift(formatSetupNumber(saved.suspension_lift_inches));
      setTireSize(formatSetupNumber(saved.tire_size_inches));
    }
  }, [editVehicleIdParam, isFreshSetupMode, restoreHydrated]);

  useEffect(() => {
    if (!restoreHydrated) return;
    if (isFreshSetupMode) return;

    const persistedVehicleId = editVehicleIdParam || setupStore.getSetupVehicleId();
    const persistedVehicle = persistedVehicleId ? vehicleStore.getById(persistedVehicleId) : null;
    if (persistedVehicleId && !persistedVehicle && !isFleetEditMode) {
      console.log('[Setup] Clearing stale setup vehicle reference', {
        persistedVehicleId,
        mode: routeModeParam ?? 'default',
      });
      setupStore.reset();
      vehicleSetupStore.clearActiveVehicleId();
      setVehicleId(null);
      setSelectedPresetCategory(null);
      setSelectedPreset(null);
      setAccessorySelections(getDefaultAccessorySelections());
      setGvwr('');
      setBaseWeight('');
      setFuelCapacity('');
      setWaterCapacity('');
      setPowerStorage('');
      setVehicleLift('');
      setTireSize('');
      setStep('vehicle-selection');
      void Promise.all([
        setupStore.flush(),
        vehicleSetupStore.flush(),
      ]);
      return;
    }
    if (!persistedVehicleId || !persistedVehicle) return;

    setVehicleId(persistedVehicleId);

    const persistedSpec = vehicleSpecStore.get(persistedVehicleId);
    if (persistedSpec) {
      setGvwr(formatSetupNumber(persistedSpec.gvwr_lb));
      setBaseWeight(formatSetupNumber(persistedSpec.base_weight_lb));
      setFuelType(persistedSpec.fuel_type ?? 'gas');
    }

    const matchedPresetEntry = PRESET_CATEGORIES
      .flatMap(({ key }) =>
        getPresetsForCategory(key).map((preset) => ({ category: key, preset })),
      )
      .find(({ preset }) => {
        if (persistedVehicle.make && persistedVehicle.model) {
          return preset.make === persistedVehicle.make && preset.model === persistedVehicle.model;
        }
        return (
          !!persistedSpec &&
          preset.gvwr_lb === persistedSpec.gvwr_lb &&
          preset.base_weight_lb === persistedSpec.base_weight_lb &&
          preset.fuel_type === persistedSpec.fuel_type
        );
      });

    setSelectedPresetCategory(matchedPresetEntry?.category ?? null);
    setSelectedPreset(matchedPresetEntry?.preset ?? null);

    const persistedFramework = (persistedVehicle as any).accessoryFramework || null;
    const persistedWizardConfig = (persistedVehicle as any).wizard_config;

    if (persistedFramework) {
      setAccessorySelections(frameworkToSelections(persistedFramework));
      return;
    }

    if (persistedWizardConfig?._accessories) {
      try {
        setAccessorySelections(JSON.parse(persistedWizardConfig._accessories));
        return;
      } catch {}
    }

    setAccessorySelections(getDefaultAccessorySelections());
  }, [editVehicleIdParam, isFleetEditMode, isFreshSetupMode, restoreHydrated, routeModeParam]);

  useEffect(() => {
    if (!restoreHydrated || isFleetManagedMode || isGuestEntryMode) return;

    const hydratedStep = setupStore.getCurrentStep();
    if (hydratedStep && STEPS.includes(hydratedStep)) {
      setStep(hydratedStep);
    }

    const hydratedVehicleId = editVehicleIdParam || setupStore.getSetupVehicleId();
    if (hydratedVehicleId && vehicleStore.getById(hydratedVehicleId)) {
      setVehicleId(hydratedVehicleId);
    }
  }, [editVehicleIdParam, isFleetManagedMode, isGuestEntryMode, restoreHydrated]);


  // ── Step transition animation ─────────────────────────
  const animateToStep = useCallback((newStep: SetupStep) => {
    const direction = STEPS.indexOf(newStep) > STEPS.indexOf(step) ? 1 : -1;

    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: MOTION.stateTransition,
        easing: EASING.standard,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: direction * -12,
        duration: MOTION.stateTransition,
        easing: EASING.standard,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStep(newStep);
      slideAnim.setValue(direction * 12);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: MOTION.stateTransition + 40,
          easing: EASING.standard,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: MOTION.stateTransition + 40,
          easing: EASING.standard,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [step, fadeAnim, slideAnim]);

  // ── Apply preset ──────────────────────────────────────
  const handleApplyPreset = useCallback((preset: VehicleSpecPreset) => {
    setSelectedPreset(preset);
    setGvwr(String(preset.gvwr_lb));
    setBaseWeight(String(preset.base_weight_lb));
    setFuelType(preset.fuel_type);
    setFuelCapacity(String(preset.fuel_tank_capacity_gal));
    setGvwrError('');
    setBaseWeightError('');
  }, []);

  // ── Validate vehicle spec ─────────────────────────────
  const validateVehicleSpec = useCallback((): boolean => {
    let valid = true;
    setGvwrError('');
    setBaseWeightError('');

    if (!gvwrNum || gvwrNum <= 0) {
      setGvwrError('GVWR is required');
      valid = false;
    }
    if (!baseWeightNum || baseWeightNum <= 0) {
      setBaseWeightError('Base weight is required');
      valid = false;
    }
    if (baseWeightNum >= gvwrNum && gvwrNum > 0 && baseWeightNum > 0) {
      setBaseWeightError('Must be less than GVWR');
      valid = false;
    }

    return valid;
  }, [gvwrNum, baseWeightNum]);

  // ── Step 1: Vehicle Selection → Continue to Resources & Mechanical Profile ──
  const handleVehicleSelectionContinue = useCallback(async () => {
    if (!validateVehicleSpec()) return;

    // Create vehicle if none exists
    let vId = vehicleId;
    if (!vId) {
      const vehicleName = selectedPreset?.label || 'My Vehicle';
      const result = await vehicleStore.create(
        {
          name: vehicleName,
          make: selectedPreset?.make || undefined,
          model: selectedPreset?.model || undefined,
        },
        user?.id || null,
      );
      if (result.vehicle) {
        vId = result.vehicle.id;
        setVehicleId(vId);
      } else {
        showToast('Failed to create vehicle');
        return;
      }
    }

    // Save vehicle spec (GVWR + base weight + fuel type)
    const fuelCapGal = parseFloat(fuelCapacity) || 0;
    vehicleSpecStore.set(vId, {
      gvwr_lb: gvwrNum,
      base_weight_lb: baseWeightNum,
      fuel_tank_capacity_gal: fuelCapGal,
      fuel_type: fuelType,
    });
    await vehicleSpecStore.flush();

    setupStore.setSetupVehicleId(vId);
    setupStore.setCurrentStep('resource-profile');

    // Advance to Step 2: Resources & Mechanical Profile
    animateToStep('resource-profile');
  }, [validateVehicleSpec, vehicleId, selectedPreset, user, gvwrNum, baseWeightNum, fuelCapacity, fuelType, animateToStep, showToast]);

  // ── Step 2: Resources & Mechanical Profile → Continue to Accessories ──
  const handleResourceProfileContinue = useCallback(async () => {
    const vId = vehicleId || setupStore.getSetupVehicleId();
    if (!vId) return;

    const fuelCapGal = parseFloat(fuelCapacity) || 0;
    const waterCapGal = parseFloat(waterCapacity) || 0;
    const powerWh = parseFloat(powerStorage) || 0;
    const liftInches = suspensionMode === 'stock' ? 0 : (parseFloat(vehicleLift) || 0);
    const tireSizeInches = parseFloat(tireSize) || 0;
    const isLeveled = suspensionMode === 'level';

    // Save resources & mechanical profile for resume support
    setupStore.setResourceProfile({
      fuel_capacity_gal: fuelCapGal,
      water_capacity_gal: waterCapGal,
      power_storage_wh: powerWh,
      suspension_mode: suspensionMode,
      suspension_is_leveled: isLeveled,
      suspension_lift_inches: liftInches,
      tire_size_inches: tireSizeInches,
    });

    // Update vehicle spec with fuel capacity
    vehicleSpecStore.update(vId, {
      fuel_tank_capacity_gal: fuelCapGal,
    });

    // Persist the canonical resource profile directly on the vehicle record
    // and mirror water/power plus lift/tires into wizard_config so later steps can't drop them.
    const existingVehicle = vehicleStore.getById(vId) as any;
    const resourceMirroredWizardConfig = buildVehicleResourceMirror(existingVehicle?.wizard_config, {
      waterCapacityGal: waterCapGal,
      batteryUsableWh: powerWh,
    });
    const mirroredWizardConfig = buildVehicleMechanicalMirror(resourceMirroredWizardConfig, {
      tireSizeInches,
      suspensionLiftInches: liftInches,
      isLeveled,
      suspensionMode,
    });

    try {
      await vehicleStore.update(vId, {
        fuel_tank_capacity_gal: fuelCapGal > 0 ? fuelCapGal : null,
        water_capacity_gal: waterCapGal > 0 ? waterCapGal : null,
        battery_usable_wh: powerWh > 0 ? powerWh : null,
        wizard_config: mirroredWizardConfig,
      }, user?.id || null);

      tiresLiftStore.update(vId, {
        tireSizeInches,
        suspensionLiftInches: liftInches,
        isLeveled,
      });

      await Promise.all([
        vehicleStore.flush(),
        setupStore.flush(),
        vehicleSpecStore.flush(),
        tiresLiftStore.flush(),
      ]);
    } catch (e: any) {
      console.warn('[Setup] Failed to persist resources/mechanical profile:', e);
    }

    setupStore.clearResourceProfileSkipped();
    setupStore.setCurrentStep('accessories');

    // Advance to Step 3: Accessories
    animateToStep('accessories');
  }, [vehicleId, fuelCapacity, waterCapacity, powerStorage, suspensionMode, vehicleLift, tireSize, user, animateToStep]);

  // ── Step 2: Skip Resources & Mechanical Profile (use defaults) ──
  const handleSkipResourceProfile = useCallback(() => {
    setupStore.markResourceProfileSkipped();
    setupStore.setCurrentStep('accessories');
    animateToStep('accessories');
  }, [animateToStep]);

  // ── Step 3: Accessories Finish → Continue to Loadout ──
  const handleAccessoriesFinish = useCallback(async () => {
    const vId = vehicleId || setupStore.getSetupVehicleId();
    if (!vId) return;

    try {
      const framework = buildAccessoryFramework(accessorySelections);
      const containerZones = generateContainerZonesFromAccessories(framework);
      const containerAllocations = generateContainerAllocations(accessorySelections, []);
      const zonesPayload = allocationsToZonePayload(containerAllocations);
      const totalSlots = getTotalSlots(containerAllocations);

      console.log('[Setup] Accessories configured:', containerZones.length, 'zones,', totalSlots, 'slots');

      // Persist accessory framework + auto-generated containers
      await vehicleStore.finalizeConfig(
        vId,
        zonesPayload,
        { _accessories: JSON.stringify(accessorySelections) },
        user?.id || null,
        { accessoryFramework: framework, containerZones },
      );
    } catch (e) {
      console.warn('[Setup] Error building accessory framework:', e);
    }

    setupStore.setCurrentStep('loadout');
    animateToStep('loadout');
  }, [vehicleId, accessorySelections, user, animateToStep]);

  // ── Step 3: Skip Accessories → Continue to Loadout ────
  const handleSkipAccessories = useCallback(() => {
    setupStore.setCurrentStep('loadout');
    animateToStep('loadout');
  }, [animateToStep]);

  const wizardVehicleName = useMemo(() => {
    if (selectedPreset?.label) return selectedPreset.label;
    const existingVehicleId = vehicleId || setupStore.getSetupVehicleId();
    const existingVehicle = existingVehicleId ? vehicleStore.getById(existingVehicleId) : null;
    return existingVehicle?.name || 'My Vehicle';
  }, [selectedPreset?.label, vehicleId]);

  // ── Step 4: Deploy Vehicle (complete setup) ───────────
  // Fleet-managed flows return to Fleet. First-run and guest setup exit into
  // the normal ECS shell so the command dock and post-auth surfaces appear immediately.
  const handleDeployVehicle = useCallback(async () => {
    const vId = vehicleId || setupStore.getSetupVehicleId();
    setupStore.markComplete(vId || undefined);
    vehicleSetupStore.markOnboardingComplete();

    const currentActiveVehicleId = vehicleSetupStore.getActiveVehicleId() || entryActiveVehicleIdRef.current;
    const shouldAutoActivate =
      !!vId &&
      (
        !currentActiveVehicleId ||
        !isFleetManagedMode ||
        isFleetAddMode ||
        currentActiveVehicleId === vId
      );

    console.log('[Setup] Completing vehicle deployment', {
      vehicleId: vId,
      isFleetAddMode,
      isFleetEditMode,
      entryVehicleCount: entryVehicleCountRef.current,
      currentActiveVehicleId,
      shouldAutoActivate,
    });

    if (vId && shouldAutoActivate) {
      vehicleSetupStore.setActiveVehicleId(vId);
    }

    await Promise.all([
      setupStore.flush(),
      vehicleSetupStore.flush(),
      vehicleStore.flush(),
      vehicleSpecStore.flush(),
      tiresLiftStore.flush(),
    ]);

    const shouldReturnToFleet = isFleetManagedMode;

    if (shouldReturnToFleet) {
      hapticMicro();
      showToast('Vehicle Ready');
      router.replace('/(tabs)/fleet');
    } else {
      showToast('Vehicle Ready');
      router.replace('/(tabs)/dashboard');
    }
  }, [vehicleId, router, showToast, isFleetAddMode, isFleetEditMode, isFleetManagedMode]);

  // ── Step 4: Skip Loadout → Deploy Vehicle ─────────────
  const handleSkipLoadout = useCallback(() => {
    void handleDeployVehicle();
  }, [handleDeployVehicle]);


  // ── Number input helper ───────────────────────────────
  const renderNumberInput = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    unit: string,
    error?: string,
    hint?: string,
  ) => (
    <ECSUnitInput
      label={label}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      unit={unit}
      error={error}
      helper={hint}
      variant="compact"
    />
  );

  // ── Progress indicator (4 dots) ───────────────────────
  const renderStepTracker = () => (
    <View style={styles.stepTracker}>
      {STEPS.map((currentStep, index) => {
        const isComplete = index < stepIndex;
        const isActive = index === stepIndex;
        return (
          <View key={currentStep} style={styles.stepTrackerColumn}>
            <View
              style={[
                styles.stepTrackerDot,
                {
                  backgroundColor: isComplete || isActive ? palette.amber : palette.textMuted + '30',
                  borderColor: isComplete || isActive ? palette.amber : palette.textMuted + '24',
                },
              ]}
            >
              {isComplete ? <Ionicons name="checkmark" size={8} color={TACTICAL.bg} /> : null}
            </View>
            <Text
              style={[
                styles.stepTrackerLabel,
                { color: isComplete || isActive ? palette.amber : palette.textMuted + '68' },
              ]}
            >
              {STEP_LABELS[currentStep]}
            </Text>
          </View>
        );
      })}
    </View>
  );

  // ── Step Labels ───────────────────────────────────────
  const STEP_LABELS: Record<SetupStep, string> = {
    'vehicle-selection': 'Vehicle',
    'resource-profile': 'Resources & Mechanical',
    'accessories': 'Accessories',
    'loadout': 'Loadout',
  };

  const renderStepHero = (eyebrow: string, title: string, hint: string) => (
    <View style={[styles.stepHero, { backgroundColor: palette.panel, borderColor: palette.border }]}>
      <Text style={[styles.stepEyebrow, { color: palette.amber }]}>{eyebrow}</Text>
      <Text style={[styles.stepTitleSmall, { color: palette.text }]}>{title}</Text>
      <Text style={[styles.stepHint, { color: palette.textMuted }]}>{hint}</Text>
    </View>
  );

  const primaryContentHeight = step === 'vehicle-selection' ? vehicleContentHeight : resourceContentHeight;
  const presetListMaxHeight = primaryBodyHeight > 0
    ? Math.min(220, Math.max(132, Math.round(primaryBodyHeight * 0.34)))
    : 196;
  const vehicleScrollEnabled =
    primaryBodyHeight > 0 && primaryContentHeight > primaryBodyHeight + 18;
  const resourceScrollEnabled =
    primaryBodyHeight > 0 && primaryContentHeight > primaryBodyHeight + 18;
  const primaryScrollEnabled = step === 'vehicle-selection'
    ? vehicleScrollEnabled
    : resourceScrollEnabled;
  const handleVehicleContentLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    const nextHeight = nativeEvent.layout.height;
    setVehicleContentHeight((current) => (Math.abs(current - nextHeight) < 1 ? current : nextHeight));
  }, []);
  const handleResourceContentLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    const nextHeight = nativeEvent.layout.height;
    setResourceContentHeight((current) => (Math.abs(current - nextHeight) < 1 ? current : nextHeight));
  }, []);
  const handlePrimaryBodyLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    const nextHeight = nativeEvent.layout.height;
    setPrimaryBodyHeight((current) => (Math.abs(current - nextHeight) < 1 ? current : nextHeight));
  }, []);


  // ══════════════════════════════════════════════════════
  // STEP 1: Vehicle Selection
  // ══════════════════════════════════════════════════════
  const renderVehicleSelection = () => (
    <View
      style={styles.stepContent}
      onLayout={handleVehicleContentLayout}
    >
      <View style={styles.stepBodyGroup}>
      {renderStepHero(
        'Step 1 · Vehicle',
        'Vehicle Framework',
        'Choose a preset or enter the core vehicle specification manually.',
      )}

      {/* Preset Selector */}
      <ECSFormSection
        title="Vehicle Identity"
        helper="Choose a preset or enter the core vehicle spec manually."
        style={styles.presetSection}
      >
        <Text style={[styles.presetLabel, { color: palette.textMuted }]}>Vehicle Preset</Text>
        <View style={styles.presetCatGrid}>
          {PRESET_CATEGORIES.map((cat, index) => (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.presetCatBtn,
                index === PRESET_CATEGORIES.length - 1 && PRESET_CATEGORIES.length % 2 === 1 && styles.presetCatBtnFull,
                {
                  backgroundColor: selectedPresetCategory === cat.key
                    ? palette.amber + '15'
                    : 'transparent',
                  borderColor: selectedPresetCategory === cat.key
                    ? palette.amber + '40'
                    : palette.border,
                },
              ]}
              onPress={() => {
                setSelectedPresetCategory(
                  selectedPresetCategory === cat.key ? null : cat.key
                );
                setSelectedPreset(null);
              }}
              activeOpacity={0.7}
            >
              <Ionicons
                name={cat.icon as any}
                size={12}
                color={selectedPresetCategory === cat.key ? palette.amber : palette.textMuted}
              />
              <Text style={[
                styles.presetCatText,
                {
                  color: selectedPresetCategory === cat.key ? palette.amber : palette.textMuted,
                },
              ]}>
                {cat.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Preset list */}
        {selectedPresetCategory && availablePresets.length > 0 && (
          <View
            style={[
              styles.presetListWrap,
              {
                maxHeight: presetListMaxHeight,
                borderColor: palette.border + '40',
                backgroundColor: palette.panel + '80',
              },
            ]}
          >
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator={availablePresets.length > 4}
              alwaysBounceVertical={false}
              contentContainerStyle={styles.presetList}
            >
              {availablePresets.map((preset, i) => (
                <TouchableOpacity
                  key={`${preset.label}-${i}`}
                  style={[
                    styles.presetItem,
                    {
                      backgroundColor: selectedPreset?.label === preset.label
                        ? palette.amber + '10'
                        : 'transparent',
                      borderColor: selectedPreset?.label === preset.label
                        ? palette.amber + '30'
                        : palette.border + '40',
                    },
                  ]}
                  onPress={() => handleApplyPreset(preset)}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.presetItemName, { color: palette.text }]} numberOfLines={1}>
                    {preset.label}
                  </Text>
                  <Text style={[styles.presetItemSpec, { color: palette.textMuted }]}>
                    {preset.gvwr_lb.toLocaleString()} GVWR
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </ECSFormSection>

      {/* Manual fields */}
      <View style={[styles.dividerLine, { backgroundColor: GOLD_RAIL.subsection }]} />

      {renderNumberInput(
        'GVWR (Gross Vehicle Weight Rating)',
        gvwr,
        (v) => { setGvwr(v); setGvwrError(''); },
        '7000',
        'lbs',
        gvwrError,
        undefined,
      )}

      {renderNumberInput(
        'Base / Curb Weight',
        baseWeight,
        (v) => { setBaseWeight(v); setBaseWeightError(''); },
        '5200',
        'lbs',
        baseWeightError,
        undefined,
      )}

      {/* Fuel type selector */}
      <ECSSegmentedField
        label="Fuel Type"
        helper="Configured vehicle fuel."
        value={fuelType}
        onChange={setFuelType}
        options={[
          { label: 'Gasoline', value: 'gas' },
          { label: 'Diesel', value: 'diesel' },
        ]}
      />

      {/* Payload margin preview */}
      {isVehicleSpecValid && (
        <ECSFormSummary
          title="Vehicle Summary"
          rows={[
            {
              label: 'Payload Capacity',
              value: `${(gvwrNum - baseWeightNum).toLocaleString()} lbs`,
              accent: palette.amber,
            },
          ]}
          style={[styles.previewCard, { backgroundColor: palette.panel, borderColor: palette.border }]}
        />
      )}

      </View>

      <View style={styles.stepActionGroup}>
        <TouchableOpacity
          style={[
            styles.primaryBtn,
            { backgroundColor: palette.amber },
            !isVehicleSpecValid && styles.btnDisabled,
          ]}
          onPress={handleVehicleSelectionContinue}
          disabled={!isVehicleSpecValid}
          activeOpacity={0.7}
        >
          <Text style={[styles.primaryBtnText, { color: TACTICAL.bg }]}>Continue to Resources & Mechanical</Text>
        </TouchableOpacity>
      </View>
    </View>
  );


  // ══════════════════════════════════════════════════════
  // STEP 2: Resources & Mechanical Profile
  // ══════════════════════════════════════════════════════
  const renderResourceProfile = () => (
    <View
      style={[styles.stepContent, styles.resourceStepContent]}
      onLayout={handleResourceContentLayout}
    >
      <View style={styles.stepBodyGroup}>
        {/* Back button */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => animateToStep('vehicle-selection')}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={16} color={palette.textMuted} />
          <Text style={[styles.backBtnText, { color: palette.textMuted }]}>Back</Text>
        </TouchableOpacity>

      {renderStepHero(
        'Step 2 · Profile',
        'Resources & Mechanical Framework',
        'Set baseline capacities and the current suspension profile ECS should use for this rig.',
      )}

      <ECSFormSection
        title="Resources"
        helper="Configured onboard capacities."
        compact
      >
        {renderNumberInput(
          'Fuel Tank Capacity',
          fuelCapacity,
          setFuelCapacity,
          '21.1',
          'gal',
          undefined,
          undefined,
        )}

        {renderNumberInput(
          'Water Capacity',
          waterCapacity,
          setWaterCapacity,
          '7.0',
          'gal',
          undefined,
          undefined,
        )}

        {renderNumberInput(
          'Power Storage',
          powerStorage,
          setPowerStorage,
          '2016',
          'Wh',
          undefined,
          undefined,
        )}
      </ECSFormSection>

      <ECSFormSection
        title="Mechanical Profile"
        helper="Current ride-height and tire baseline."
        compact
      >
        <ECSSegmentedField
          label="Suspension Modification"
          helper="Current suspension state."
          value={suspensionMode}
          onChange={(next) => {
            setSuspensionMode(next);
            if (next === 'stock') {
              setVehicleLift('');
            }
          }}
          options={[
            { label: 'Stock', value: 'stock' },
            { label: 'Level', value: 'level' },
            { label: 'Lift', value: 'lift' },
          ]}
          compact
        />

        {suspensionMode !== 'stock' ? renderNumberInput(
          suspensionMode === 'level' ? 'Level Height' : 'Lift Height',
          vehicleLift,
          setVehicleLift,
          suspensionMode === 'level' ? '1' : '2',
          'in',
          undefined,
          undefined,
        ) : null}

        {renderNumberInput(
          'Tire Size',
          tireSize,
          setTireSize,
          '33',
          'in',
          undefined,
          undefined,
        )}
      </ECSFormSection>

      {/* Profile summary preview */}
      {(parseFloat(fuelCapacity) > 0
        || parseFloat(waterCapacity) > 0
        || parseFloat(powerStorage) > 0
        || suspensionMode !== 'stock'
        || parseFloat(tireSize) > 0) && (
        <ECSFormSummary
          title="Profile Summary"
          rows={[
            parseFloat(fuelCapacity) > 0
              ? { label: 'Fuel', value: `${parseFloat(fuelCapacity).toFixed(1)} gal`, accent: palette.amber }
              : null,
            parseFloat(waterCapacity) > 0
              ? { label: 'Water', value: `${parseFloat(waterCapacity).toFixed(1)} gal`, accent: '#5B8DEF' }
              : null,
            parseFloat(powerStorage) > 0
              ? { label: 'Power', value: `${parseFloat(powerStorage)} Wh`, accent: '#66BB6A' }
              : null,
            suspensionMode !== 'stock'
              ? {
                label: suspensionMode === 'level' ? 'Level' : 'Lift',
                value: parseFloat(vehicleLift) > 0 ? `${parseFloat(vehicleLift)} in` : 'Configured',
                accent: '#81C784',
              }
              : null,
            parseFloat(tireSize) > 0
              ? { label: 'Tires', value: `${parseFloat(tireSize)} in`, accent: '#C7B299' }
              : null,
          ].filter(Boolean) as { label: string; value: string; accent?: string }[]}
          style={[styles.previewCard, { backgroundColor: palette.panel, borderColor: palette.border }]}
        />
      )}

      </View>

      <View style={[styles.stepActionGroup, styles.stepActionGroupTight]}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: palette.amber }]}
          onPress={handleResourceProfileContinue}
          activeOpacity={0.7}
        >
          <Text style={[styles.primaryBtnText, { color: TACTICAL.bg }]}>Continue to Accessories</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkipResourceProfile}
          activeOpacity={0.6}
        >
          <Text style={[styles.skipBtnText, { color: palette.textMuted }]}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );


  // ══════════════════════════════════════════════════════
  // STEP 3: Accessories Configuration
  // ══════════════════════════════════════════════════════
  const renderAccessories = () => (
    <View style={[styles.accessoriesContainer, { paddingTop: headerTopPadding, paddingBottom: dockClearance }]}>
      <View style={[styles.accessoriesHeader, { borderBottomColor: palette.border }]}>
        <View style={styles.accessoriesNavRow}>
          <TouchableOpacity
            style={styles.accessoriesBackBtn}
            onPress={() => animateToStep('resource-profile')}
            activeOpacity={0.6}
          >
            <Ionicons name="chevron-back" size={16} color={palette.textMuted} />
            <Text style={[styles.accessoriesBackText, { color: palette.textMuted }]}>Back</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.accessoriesSkipBtn}
            onPress={handleSkipAccessories}
            activeOpacity={0.6}
          >
            <Text style={[styles.accessoriesSkipText, { color: palette.textMuted }]}>Skip</Text>
          </TouchableOpacity>
        </View>
        {renderStepTracker()}
      </View>

      <AccessoryConfigStep
        accessories={accessorySelections}
        onAccessoriesChange={setAccessorySelections}
        onBack={() => animateToStep('resource-profile')}
        onNext={handleAccessoriesFinish}
        isLastStep={false}
      />
    </View>
  );


  // ══════════════════════════════════════════════════════
  // STEP 4: Loadout Configuration
  // ══════════════════════════════════════════════════════
  const renderLoadout = () => (
    <View style={[styles.loadoutContainer, { paddingTop: headerTopPadding, paddingBottom: dockClearance }]}>
      <View style={[styles.accessoriesHeader, { borderBottomColor: palette.border }]}>
        <View style={styles.accessoriesNavRow}>
          <TouchableOpacity
            style={styles.accessoriesBackBtn}
            onPress={() => animateToStep('accessories')}
            activeOpacity={0.6}
          >
            <Ionicons name="chevron-back" size={16} color={palette.textMuted} />
            <Text style={[styles.accessoriesBackText, { color: palette.textMuted }]}>Back</Text>
          </TouchableOpacity>

          <View style={styles.accessoriesHeaderSpacer} />
        </View>
        {renderStepTracker()}
      </View>

      <LoadoutWizardStep
        mode="wizard"
        accessorySelections={accessorySelections}
        vehicleId={vehicleId || setupStore.getSetupVehicleId()}
        userId={user?.id || null}
        onBack={() => animateToStep('accessories')}
        onSkipLoadout={handleSkipLoadout}
        onCompleteBuild={handleDeployVehicle}
        saving={loadoutSaving}
        vehicleName={wizardVehicleName}
        showToast={showToast}
      />
    </View>
  );


  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════

  if (!restoreHydrated) {
    return (
      <TopoBackground>
        <View style={[styles.restoreLoadingShell, { paddingTop: headerTopPadding, paddingBottom: dockClearance }]}>
          <ActivityIndicator size="large" color={TACTICAL.amber} />
          <Text style={styles.restoreLoadingTitle}>RESTORING SETUP</Text>
          <Text style={styles.restoreLoadingCopy}>
            Rehydrating your vehicle profile, saved resource settings, and active rig context.
          </Text>
        </View>
      </TopoBackground>
    );
  }

  // Full-screen steps: accessories and loadout
  if (step === 'accessories') {
    return (
      <TopoBackground>
        {renderAccessories()}
      </TopoBackground>
    );
  }

  if (step === 'loadout') {
    return (
      <TopoBackground>
        {renderLoadout()}
      </TopoBackground>
    );
  }

  // Full-height primary setup steps: vehicle-selection and resource-profile
  return (
    <TopoBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[
          styles.primaryStepShell,
          {
            paddingTop: headerTopPadding,
            paddingBottom: dockClearance,
            paddingHorizontal: fixedStepHorizontalPadding,
          },
        ]}
      >
        <View style={[styles.primaryStepHeader, { maxWidth: fixedStepMaxWidth }]}>
          {renderStepTracker()}
        </View>
        <Animated.View
          style={[
            styles.primaryStepBody,
            { maxWidth: fixedStepMaxWidth },
            {
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
          onLayout={handlePrimaryBodyLayout}
        >
          <ScrollView
            style={styles.primaryStepScroll}
            contentContainerStyle={[
              styles.primaryStepScrollContent,
              !primaryScrollEnabled && step === 'vehicle-selection' && styles.primaryStepScrollContentFixed,
              !primaryScrollEnabled && step === 'resource-profile' && styles.primaryStepScrollContentResourceFixed,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            scrollEnabled={primaryScrollEnabled}
            bounces={primaryScrollEnabled}
            alwaysBounceVertical={false}
          >
            {step === 'vehicle-selection' && renderVehicleSelection()}
            {step === 'resource-profile' && renderResourceProfile()}
          </ScrollView>
        </Animated.View>
        <View style={[styles.primaryStepFooter, { maxWidth: fixedStepMaxWidth }]}>
          <Animated.View
            style={[
              styles.primaryStepFooterInner,
              {
                borderColor: palette.border,
              },
            ]}
          >
            <Text style={[styles.stepIndicator, { color: palette.textMuted + '40' }]}>
              {stepIndex + 1} of {STEPS.length}
            </Text>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  restoreLoadingShell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 12,
  },
  restoreLoadingTitle: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.amber,
    textAlign: 'center',
  },
  restoreLoadingCopy: {
    ...ECS_TEXT.dialogBody,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    maxWidth: 320,
  },
  primaryStepShell: {
    flex: 1,
  },
  primaryStepHeader: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingBottom: 10,
  },
  primaryStepBody: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    backgroundColor: 'transparent',
    overflow: 'visible',
  },
  primaryStepScroll: {
    flex: 1,
  },
  primaryStepScrollContent: {
    flexGrow: 1,
    paddingBottom: 10,
  },
  primaryStepScrollContentFixed: {
    justifyContent: 'space-between',
  },
  primaryStepScrollContentResourceFixed: {
    justifyContent: 'flex-start',
    paddingTop: 6,
  },
  primaryStepFooter: {
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    paddingTop: 6,
  },
  primaryStepFooterInner: {
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 1,
    paddingTop: 8,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  // ── Progress dots (4 dots with lines) ─────────────────
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    marginBottom: 4,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressDotActive: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  progressDotDone: {
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLine: {
    width: 20,
    height: 1.5,
  },

  // ── Step labels ───────────────────────────────────────
  stepLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  stepLabelText: {
    flex: 1,
    ...ECS_TEXT.chip,
    fontSize: 7,
    textAlign: 'center',
    lineHeight: 10,
    paddingHorizontal: 4,
  },
  stepTracker: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    width: '100%',
    gap: 6,
    paddingHorizontal: 2,
  },
  stepTrackerColumn: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  stepTrackerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTrackerLabel: {
    ...ECS_TEXT.helper,
    textAlign: 'center',
    lineHeight: 13,
    minHeight: 28,
    paddingHorizontal: 2,
  },

  // ── Panel ─────────────────────────────────────────────
  panel: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // ── Step content ──────────────────────────────────────
  stepContent: {
    width: '100%',
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    alignItems: 'stretch',
  },
  resourceStepContent: {
    paddingTop: 14,
    paddingBottom: 18,
  },
  stepBodyGroup: {
    flexGrow: 1,
    gap: 8,
  },
  stepActionGroup: {
    marginTop: 'auto',
    paddingTop: 12,
  },
  stepActionGroupTight: {
    gap: 10,
  },
  stepHero: {
    width: '100%',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  stepEyebrow: {
    ...ECS_TEXT.helper,
    letterSpacing: 1.2,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },

  // ── Back button ───────────────────────────────────────
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    marginBottom: 6,
    paddingVertical: 4,
    paddingRight: 6,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // ── Titles ────────────────────────────────────────────
  stepTitleSmall: {
    ...ECS_TEXT.cardTitle,
    color: TACTICAL.text,
    textAlign: 'left',
    lineHeight: 20,
    alignSelf: 'flex-start',
  },
  stepHint: {
    ...ECS_TEXT.helper,
    lineHeight: 16,
    marginTop: ECS_TEXT_SPACING.titleToSubtitle,
    alignSelf: 'flex-start',
  },

  // ── Primary button ────────────────────────────────────
  primaryBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  btnDisabled: {
    opacity: 0.4,
  },

  // ── Skip button ───────────────────────────────────────
  skipBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 0,
  },
  skipBtnText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.4,
  },

  // ── Preset section ────────────────────────────────────
  presetSection: {
    width: '100%',
    marginBottom: 8,
  },
  presetLabel: {
    ...ECS_TEXT.sectionTitle,
    marginBottom: 8,
  },
  presetCatGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  presetCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48%',
    gap: 5,
    minHeight: 42,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  presetCatBtnFull: {
    width: '100%',
  },
  presetCatText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  presetList: {
    padding: 2,
  },
  presetListWrap: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: 'hidden',
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  presetItemName: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  presetItemSpec: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
  },

  // ── Divider line ──────────────────────────────────────
  dividerLine: {
    width: '100%',
    height: 0.75,
    marginVertical: 8,
  },

  // ── Field inputs ──────────────────────────────────────
  fieldWrap: {
    width: '100%',
    marginBottom: 14,
  },
  fieldLabel: {
    ...ECS_TEXT.cardSubtitle,
    color: TACTICAL.text,
    marginBottom: 6,
  },
  fieldInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    paddingBottom: 4,
  },
  fieldInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 5,
  },
  fieldUnit: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginLeft: 10,
  },
  fieldError: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
    letterSpacing: 0.3,
  },
  fieldHint: {
    ...ECS_TEXT.helper,
    marginTop: 5,
  },

  // ── Fuel type selector ────────────────────────────────
  fuelTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fuelTypeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  fuelTypeText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  // ── Preview card ──────────────────────────────────────
  previewCard: {
    width: '100%',
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
    marginTop: 4,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewLabel: {
    ...ECS_TEXT.statLabel,
  },
  previewValue: {
    ...ECS_TEXT.statValue,
    fontSize: 16,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  // ── Step indicator ────────────────────────────────────
  stepIndicator: {
    ...ECS_TEXT.helper,
    marginTop: 10,
  },

  // ── Accessories full-screen container ─────────────────
  accessoriesContainer: {
    flex: 1,
  },

  accessoriesHeader: {
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  accessoriesNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accessoriesBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingVertical: 2,
  },
  accessoriesBackText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  accessoriesHeaderSpacer: {
    minWidth: 48,
  },
  accessoriesStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  accessoriesStepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  accessoriesStepDotDone: {
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accessoriesStepLine: {
    width: 14,
    height: 1.5,
  },
  accessoriesSkipBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  accessoriesSkipText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Loadout full-screen container ─────────────────────
  loadoutContainer: {
    flex: 1,
  },
});




