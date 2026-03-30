/**
 * ECS First-Time Setup — Guided System Initialization (Phase 8)
 *
 * A refined 4-step setup flow:
 *   1. Vehicle Selection — Choose preset or enter GVWR + Base Weight
 *   2. Resource Profile — Fuel, water, power capacities (confirm or skip)
 *   3. Accessory Framework — Define vehicle container system
 *   4. Loadout Configuration — Container-based loadout (optional)
 *
 * MODES:
 *   - Default (no params): First-time setup. Redirects to dashboard if already complete.
 *   - mode=fleet-add: Adding a new vehicle from Fleet tab. Skips the "already complete"
 *     redirect, starts with a fresh blank vehicle, and navigates to Fleet on completion.
 *     This ensures every new vehicle (Vehicle 2, 3, 4+) goes through the full wizard
 *     with make/model/preset selection — identical to the first vehicle experience.
 *
 * Post-conditions:
 *   - vehicleSpecStore has GVWR + base weight
 *   - vehicleStore has a vehicle record
 *   - Resource profile persisted (fuel, water, power)
 *   - accessoryFramework + containerZones persisted
 *   - Container allocations auto-generated from accessory selections
 *   - Vehicle returns to Dashboard (default) or Fleet (fleet-add) loadout-ready
 *   - setupStore marked complete
 *   - Dashboard shows welcome banner on first load
 *
 * Resume: If setup is interrupted, resumes at the last completed step.
 *         In fleet-add mode, resume is disabled — always starts fresh.
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
  KeyboardAvoidingView,
  Platform,
  Animated,
  TextInput,
} from 'react-native';
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

import TopoBackground from '../components/TopoBackground';

import AccessoryConfigStep, {
  getDefaultAccessorySelections,
  type AccessorySelections,
} from '../components/vehicle-wizard/AccessoryConfigStep';

import LoadoutWizardStep from '../components/vehicle-wizard/LoadoutWizardStep';

import {
  buildAccessoryFramework,
  generateContainerZonesFromAccessories,
} from '../lib/accessoryFramework';

import {
  generateContainerAllocations,
  allocationsToZonePayload,
  getTotalSlots,
} from '../lib/accessoryContainerMapping';

import { hapticMicro } from '../lib/haptics';

// ── Step definitions (4-step flow) ──────────────────────
const STEPS: SetupStep[] = SETUP_STEPS;

// ── Preset category labels ──────────────────────────────
const PRESET_CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'truck', label: 'Truck', icon: 'car-outline' },
  { key: 'suv_van', label: 'SUV / Van', icon: 'bus-outline' },
  { key: 'jeep', label: 'Jeep', icon: 'navigate-outline' },
  { key: 'car_crossover', label: 'Crossover', icon: 'speedometer-outline' },
];

export default function SetupScreen() {
  const router = useRouter();
  const { palette } = useTheme();
  const { user, showToast } = useApp();

  // ── Mode Detection ────────────────────────────────────
  // mode=fleet-add: Adding a new vehicle from Fleet tab.
  // Forces fresh state, skips "already complete" redirect,
  // and navigates to Fleet on completion instead of Dashboard.
  const searchParams = useLocalSearchParams<{ mode?: string }>();
  const isFleetAddMode = searchParams.mode === 'fleet-add';
  const modeConsumedRef = useRef(false);

  // ── Resume: check for last completed step ─────────────
  // In fleet-add mode, always start from step 0 (fresh vehicle).
  // In default mode, resume from last saved step.
  const resumeStep = isFleetAddMode ? null : setupStore.getCurrentStep();
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

  // ── Resource Profile State ────────────────────────────
  const [fuelCapacity, setFuelCapacity] = useState('');
  const [waterCapacity, setWaterCapacity] = useState('');
  const [powerStorage, setPowerStorage] = useState('');

  // ── Accessory Configuration State ─────────────────────
  const [accessorySelections, setAccessorySelections] = useState<AccessorySelections>(
    getDefaultAccessorySelections()
  );

  // ── Vehicle ID (created or existing) ──────────────────
  // In fleet-add mode, always start with null (fresh vehicle).
  const [vehicleId, setVehicleId] = useState<string | null>(
    isFleetAddMode ? null : setupStore.getSetupVehicleId()
  );

  // ── Loadout saving state ──────────────────────────────
  const [loadoutSaving, setLoadoutSaving] = useState(false);

  // ── Validation ────────────────────────────────────────
  const [gvwrError, setGvwrError] = useState('');
  const [baseWeightError, setBaseWeightError] = useState('');

  const gvwrNum = parseFloat(gvwr) || 0;
  const baseWeightNum = parseFloat(baseWeight) || 0;
  const isVehicleSpecValid = gvwrNum > 0 && baseWeightNum > 0 && baseWeightNum < gvwrNum;

  // ── Available presets for selected category ───────────
  const availablePresets = useMemo(() => {
    if (!selectedPresetCategory) return [];
    return VEHICLE_SPEC_PRESETS[selectedPresetCategory] || [];
  }, [selectedPresetCategory]);

  // ── Check for existing setup on mount ─────────────────
  // In fleet-add mode, skip this redirect — we're intentionally
  // re-entering setup to create a new vehicle.
  useEffect(() => {
    if (isFleetAddMode) {
      // Fleet-add mode: ensure fresh state for new vehicle
      if (!modeConsumedRef.current) {
        modeConsumedRef.current = true;
        console.log('[Setup] Fleet-add mode: starting fresh vehicle wizard');
      }
      return;
    }
    if (setupStore.isComplete()) {
      router.replace('/(tabs)/dashboard');
    }
  }, [isFleetAddMode]);


  // ── Restore saved resource profile on mount ───────────
  // In fleet-add mode, skip restoring previous resource profile
  // to ensure a completely fresh vehicle configuration.
  useEffect(() => {
    if (isFleetAddMode) return; // Fresh vehicle — don't restore old data
    const saved = setupStore.getResourceProfile();
    if (saved) {
      if (saved.fuel_capacity_gal > 0) setFuelCapacity(String(saved.fuel_capacity_gal));
      if (saved.water_capacity_gal > 0) setWaterCapacity(String(saved.water_capacity_gal));
      if (saved.power_storage_wh > 0) setPowerStorage(String(saved.power_storage_wh));
    }
  }, [isFleetAddMode]);


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

  // ── Step 1: Vehicle Selection → Continue to Resource Profile ──
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

    setupStore.setSetupVehicleId(vId);
    setupStore.setCurrentStep('resource-profile');
    vehicleSetupStore.setActiveVehicleId(vId);

    // Advance to Step 2: Resource Profile
    animateToStep('resource-profile');
  }, [validateVehicleSpec, vehicleId, selectedPreset, user, gvwrNum, baseWeightNum, fuelCapacity, fuelType, animateToStep, showToast]);

  // ── Step 2: Resource Profile → Continue to Accessories ──
  const handleResourceProfileContinue = useCallback(async () => {
    const vId = vehicleId || setupStore.getSetupVehicleId();
    if (!vId) return;

    const fuelCapGal = parseFloat(fuelCapacity) || 0;
    const waterCapGal = parseFloat(waterCapacity) || 0;
    const powerWh = parseFloat(powerStorage) || 0;

    // Save resource profile
    setupStore.setResourceProfile({
      fuel_capacity_gal: fuelCapGal,
      water_capacity_gal: waterCapGal,
      power_storage_wh: powerWh,
    });

    // Update vehicle spec with fuel capacity
    vehicleSpecStore.update(vId, {
      fuel_tank_capacity_gal: fuelCapGal,
    });

    // Persist water capacity + fuel capacity on vehicle record
    const updateData: Record<string, any> = {};
    if (fuelCapGal > 0) updateData.fuel_tank_capacity_gal = fuelCapGal;
    if (waterCapGal > 0) updateData.water_capacity_gal = waterCapGal;

    if (Object.keys(updateData).length > 0) {
      vehicleStore.update(vId, updateData, user?.id || null)
        .catch((e: any) => console.warn('[Setup] Failed to persist resource profile:', e));
    }

    setupStore.clearResourceProfileSkipped();
    setupStore.setCurrentStep('accessories');

    // Advance to Step 3: Accessories
    animateToStep('accessories');
  }, [vehicleId, fuelCapacity, waterCapacity, powerStorage, user, animateToStep]);

  // ── Step 2: Skip Resource Profile (use defaults) ──────
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

  // ── Step 4: Deploy Expedition (complete setup) ────────
  // In fleet-add mode, navigate to Fleet tab so the user sees
  // their newly created vehicle in the fleet list.
  // In default mode, navigate to Dashboard as before.
  const handleDeployExpedition = useCallback(() => {
    const vId = vehicleId || setupStore.getSetupVehicleId();
    setupStore.markComplete(vId || undefined);
    vehicleSetupStore.markOnboardingComplete();

    if (vId) {
      // Auto-select the newly created vehicle
      vehicleSetupStore.setActiveVehicleId(vId);
    }

    if (isFleetAddMode) {
      hapticMicro();
      showToast('Vehicle added to fleet');
      router.replace('/(tabs)/fleet');
    } else {
      showToast('Vehicle configuration complete. ECS ready.');
      router.replace('/(tabs)/dashboard');
    }
  }, [vehicleId, router, showToast, isFleetAddMode]);

  // ── Step 4: Skip Loadout → Deploy ─────────────────────
  const handleSkipLoadout = useCallback(() => {
    handleDeployExpedition();
  }, [handleDeployExpedition]);


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
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: palette.textMuted }]}>{label}</Text>
      <View style={[
        styles.fieldInputRow,
        { borderBottomColor: error ? palette.danger : palette.border },
      ]}>
        <TextInput
          style={[styles.fieldInput, { color: palette.text }]}
          value={value}
          onChangeText={(v) => {
            const cleaned = v.replace(/[^0-9.]/g, '');
            onChange(cleaned);
          }}
          placeholder={placeholder}
          placeholderTextColor={palette.textMuted + '50'}
          keyboardType="numeric"
          returnKeyType="done"
        />
        <Text style={[styles.fieldUnit, { color: palette.textMuted }]}>{unit}</Text>
      </View>
      {error ? (
        <Text style={[styles.fieldError, { color: palette.danger }]}>{error}</Text>
      ) : hint ? (
        <Text style={[styles.fieldHint, { color: palette.textMuted + '80' }]}>{hint}</Text>
      ) : null}
    </View>
  );

  // ── Progress indicator (4 dots) ───────────────────────
  const renderProgress = () => (
    <View style={styles.progressRow}>
      {STEPS.map((s, i) => {
        const isComplete = i < stepIndex;
        const isActive = i === stepIndex;
        return (
          <React.Fragment key={s}>
            {i > 0 && (
              <View style={[
                styles.progressLine,
                { backgroundColor: isComplete ? palette.amber + '60' : palette.textMuted + '20' },
              ]} />
            )}
            {isComplete ? (
              <View style={[styles.progressDotDone, { backgroundColor: palette.amber }]}>
                <Ionicons name="checkmark" size={7} color={TACTICAL.bg} />
              </View>
            ) : (
              <View
                style={[
                  styles.progressDot,
                  {
                    backgroundColor: isActive ? palette.amber : palette.textMuted + '30',
                  },
                  isActive && styles.progressDotActive,
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );

  // ── Step Labels ───────────────────────────────────────
  const STEP_LABELS: Record<SetupStep, string> = {
    'vehicle-selection': 'Vehicle',
    'resource-profile': 'Resources',
    'accessories': 'Accessories',
    'loadout': 'Loadout',
  };

  const renderStepLabels = () => (
    <View style={styles.stepLabelsRow}>
      {STEPS.map((s, i) => (
        <Text
          key={s}
          style={[
            styles.stepLabelText,
            { color: i <= stepIndex ? palette.amber : palette.textMuted + '50' },
          ]}
        >
          {STEP_LABELS[s]}
        </Text>
      ))}
    </View>
  );


  // ══════════════════════════════════════════════════════
  // STEP 1: Vehicle Selection
  // ══════════════════════════════════════════════════════
  const renderVehicleSelection = () => (
    <View style={styles.stepContent}>
      <Text style={[styles.stepTitleSmall, { color: palette.text }]}>Vehicle Selection</Text>
      <Text style={[styles.stepHint, { color: palette.textMuted }]}>
        Select a vehicle preset or enter specifications manually.
      </Text>

      {/* Preset Selector */}
      <View style={styles.presetSection}>
        <Text style={[styles.presetLabel, { color: palette.textMuted }]}>VEHICLE PRESET</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetCatRow}>
          {PRESET_CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat.key}
              style={[
                styles.presetCatBtn,
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
        </ScrollView>

        {/* Preset list */}
        {selectedPresetCategory && availablePresets.length > 0 && (
          <ScrollView
            style={styles.presetList}
            nestedScrollEnabled
            showsVerticalScrollIndicator={false}
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
        )}
      </View>

      {/* Manual fields */}
      <View style={[styles.dividerLine, { backgroundColor: GOLD_RAIL.subsection }]} />

      {renderNumberInput(
        'GVWR (Gross Vehicle Weight Rating)',
        gvwr,
        (v) => { setGvwr(v); setGvwrError(''); },
        '7000',
        'lbs',
        gvwrError,
        'Maximum safe vehicle weight.',
      )}

      {renderNumberInput(
        'Base / Curb Weight',
        baseWeight,
        (v) => { setBaseWeight(v); setBaseWeightError(''); },
        '5200',
        'lbs',
        baseWeightError,
        'Vehicle weight without gear.',
      )}

      {/* Fuel type selector */}
      <View style={styles.fieldWrap}>
        <Text style={[styles.fieldLabel, { color: palette.textMuted }]}>Fuel Type</Text>
        <View style={styles.fuelTypeRow}>
          {(['gas', 'diesel'] as FuelType[]).map((ft) => (
            <TouchableOpacity
              key={ft}
              style={[
                styles.fuelTypeBtn,
                {
                  backgroundColor: fuelType === ft ? palette.amber + '15' : 'transparent',
                  borderColor: fuelType === ft ? palette.amber + '40' : palette.border,
                },
              ]}
              onPress={() => setFuelType(ft)}
              activeOpacity={0.7}
            >
              <Text style={[
                styles.fuelTypeText,
                { color: fuelType === ft ? palette.amber : palette.textMuted },
              ]}>
                {ft === 'gas' ? 'Gasoline' : 'Diesel'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Payload margin preview */}
      {isVehicleSpecValid && (
        <View style={[styles.previewCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          <View style={styles.previewRow}>
            <Text style={[styles.previewLabel, { color: palette.textMuted }]}>PAYLOAD CAPACITY</Text>
            <Text style={[styles.previewValue, { color: palette.amber }]}>
              {(gvwrNum - baseWeightNum).toLocaleString()} lbs
            </Text>
          </View>
        </View>
      )}

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
        <Text style={[styles.primaryBtnText, { color: TACTICAL.bg }]}>Continue</Text>
      </TouchableOpacity>
    </View>
  );


  // ══════════════════════════════════════════════════════
  // STEP 2: Resource Profile
  // ══════════════════════════════════════════════════════
  const renderResourceProfile = () => (
    <View style={styles.stepContent}>
      {/* Back button */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => animateToStep('vehicle-selection')}
        activeOpacity={0.6}
      >
        <Ionicons name="chevron-back" size={16} color={palette.textMuted} />
        <Text style={[styles.backBtnText, { color: palette.textMuted }]}>Back</Text>
      </TouchableOpacity>

      <Text style={[styles.stepTitleSmall, { color: palette.text }]}>Resource Profile</Text>
      <Text style={[styles.stepHint, { color: palette.textMuted }]}>
        Configure expedition resource capacities. These enable fuel range planning, water tracking, and power management.
      </Text>

      {renderNumberInput(
        'Fuel Tank Capacity',
        fuelCapacity,
        setFuelCapacity,
        '21.1',
        'gal',
        undefined,
        'Enables fuel range planning and consumption tracking.',
      )}

      {renderNumberInput(
        'Water Capacity',
        waterCapacity,
        setWaterCapacity,
        '7.0',
        'gal',
        undefined,
        'Total onboard water storage. Enables water resupply planning.',
      )}

      {renderNumberInput(
        'Power Storage',
        powerStorage,
        setPowerStorage,
        '2016',
        'Wh',
        undefined,
        'Battery bank capacity. Enables power consumption forecasting.',
      )}

      {/* Resource summary preview */}
      {(parseFloat(fuelCapacity) > 0 || parseFloat(waterCapacity) > 0 || parseFloat(powerStorage) > 0) && (
        <View style={[styles.previewCard, { backgroundColor: palette.panel, borderColor: palette.border }]}>
          {parseFloat(fuelCapacity) > 0 && (
            <View style={styles.previewRow}>
              <Text style={[styles.previewLabel, { color: palette.textMuted }]}>FUEL</Text>
              <Text style={[styles.previewValue, { color: palette.amber }]}>
                {parseFloat(fuelCapacity).toFixed(1)} gal
              </Text>
            </View>
          )}
          {parseFloat(waterCapacity) > 0 && (
            <View style={[styles.previewRow, { marginTop: 4 }]}>
              <Text style={[styles.previewLabel, { color: palette.textMuted }]}>WATER</Text>
              <Text style={[styles.previewValue, { color: '#5B8DEF' }]}>
                {parseFloat(waterCapacity).toFixed(1)} gal
              </Text>
            </View>
          )}
          {parseFloat(powerStorage) > 0 && (
            <View style={[styles.previewRow, { marginTop: 4 }]}>
              <Text style={[styles.previewLabel, { color: palette.textMuted }]}>POWER</Text>
              <Text style={[styles.previewValue, { color: '#66BB6A' }]}>
                {parseFloat(powerStorage)} Wh
              </Text>
            </View>
          )}
        </View>
      )}

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: palette.amber }]}
        onPress={handleResourceProfileContinue}
        activeOpacity={0.7}
      >
        <Text style={[styles.primaryBtnText, { color: TACTICAL.bg }]}>Continue</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.skipBtn}
        onPress={handleSkipResourceProfile}
        activeOpacity={0.6}
      >
        <Text style={[styles.skipBtnText, { color: palette.textMuted }]}>
          Use defaults — configure later
        </Text>
      </TouchableOpacity>
    </View>
  );


  // ══════════════════════════════════════════════════════
  // STEP 3: Accessories Configuration
  // ══════════════════════════════════════════════════════
  const renderAccessories = () => (
    <View style={styles.accessoriesContainer}>
      {/* Header with back + step indicator + skip */}
      <View style={[styles.accessoriesHeader, { borderBottomColor: palette.border }]}>
        <TouchableOpacity
          style={styles.accessoriesBackBtn}
          onPress={() => animateToStep('resource-profile')}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={16} color={palette.textMuted} />
          <Text style={[styles.accessoriesBackText, { color: palette.textMuted }]}>Back</Text>
        </TouchableOpacity>

        {/* Step indicator — 4 dots */}
        <View style={styles.accessoriesStepRow}>
          {STEPS.map((s, i) => {
            const isComplete = i < stepIndex;
            const isActive = i === stepIndex;
            return (
              <React.Fragment key={s}>
                {i > 0 && (
                  <View style={[
                    styles.accessoriesStepLine,
                    { backgroundColor: isComplete || isActive ? palette.amber + '40' : palette.textMuted + '20' },
                  ]} />
                )}
                {isComplete ? (
                  <View style={[styles.accessoriesStepDotDone, { backgroundColor: palette.amber }]}>
                    <Ionicons name="checkmark" size={7} color={TACTICAL.bg} />
                  </View>
                ) : (
                  <View style={[
                    styles.accessoriesStepDot,
                    { backgroundColor: isActive ? palette.amber : palette.textMuted + '30' },
                  ]} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        {/* Skip */}
        <TouchableOpacity
          style={styles.accessoriesSkipBtn}
          onPress={handleSkipAccessories}
          activeOpacity={0.6}
        >
          <Text style={[styles.accessoriesSkipText, { color: palette.textMuted }]}>Skip</Text>
        </TouchableOpacity>
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
    <View style={styles.loadoutContainer}>
      {/* Header with back + step indicator */}
      <View style={[styles.accessoriesHeader, { borderBottomColor: palette.border }]}>
        <TouchableOpacity
          style={styles.accessoriesBackBtn}
          onPress={() => animateToStep('accessories')}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={16} color={palette.textMuted} />
          <Text style={[styles.accessoriesBackText, { color: palette.textMuted }]}>Back</Text>
        </TouchableOpacity>

        {/* Step indicator — 4 dots */}
        <View style={styles.accessoriesStepRow}>
          {STEPS.map((s, i) => {
            const isComplete = i < stepIndex;
            const isActive = i === stepIndex;
            return (
              <React.Fragment key={s}>
                {i > 0 && (
                  <View style={[
                    styles.accessoriesStepLine,
                    { backgroundColor: isComplete || isActive ? palette.amber + '40' : palette.textMuted + '20' },
                  ]} />
                )}
                {isComplete ? (
                  <View style={[styles.accessoriesStepDotDone, { backgroundColor: palette.amber }]}>
                    <Ionicons name="checkmark" size={7} color={TACTICAL.bg} />
                  </View>
                ) : (
                  <View style={[
                    styles.accessoriesStepDot,
                    { backgroundColor: isActive ? palette.amber : palette.textMuted + '30' },
                  ]} />
                )}
              </React.Fragment>
            );
          })}
        </View>

        <View style={{ width: 48 }} />
      </View>

      <LoadoutWizardStep
        mode="wizard"
        accessorySelections={accessorySelections}
        vehicleId={vehicleId || setupStore.getSetupVehicleId()}
        userId={user?.id || null}
        onBack={() => animateToStep('accessories')}
        onSkipLoadout={handleSkipLoadout}
        onCompleteBuild={handleDeployExpedition}
        saving={loadoutSaving}
        vehicleName={selectedPreset?.label || 'My Vehicle'}
        showToast={showToast}
      />
    </View>
  );


  // ══════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════

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

  // Panel-based steps: vehicle-selection and resource-profile
  return (
    <TopoBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderProgress()}
          {renderStepLabels()}

          <Animated.View
            style={[
              styles.panel,
              {
                backgroundColor: palette.panel,
                borderColor: palette.border,
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {step === 'vehicle-selection' && renderVehicleSelection()}
            {step === 'resource-profile' && renderResourceProfile()}
          </Animated.View>

          {/* Step indicator */}
          <Text style={[styles.stepIndicator, { color: palette.textMuted + '40' }]}>
            {stepIndex + 1} of {STEPS.length}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </TopoBackground>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
    width: '100%',
    maxWidth: 480,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  stepLabelText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
    paddingHorizontal: 18,
    paddingVertical: 16,
    alignItems: 'center',
  },

  // ── Back button ───────────────────────────────────────
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    marginBottom: 6,
    paddingVertical: 2,
  },
  backBtnText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },

  // ── Titles ────────────────────────────────────────────
  stepTitleSmall: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 22,
    alignSelf: 'flex-start',
  },
  stepHint: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.2,
    lineHeight: 15,
    marginTop: 4,
    marginBottom: 10,
    alignSelf: 'flex-start',
  },

  // ── Primary button ────────────────────────────────────
  primaryBtn: {
    width: '100%',
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.4,
  },

  // ── Skip button ───────────────────────────────────────
  skipBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginTop: 4,
  },
  skipBtnText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Preset section ────────────────────────────────────
  presetSection: {
    width: '100%',
    marginBottom: 8,
  },
  presetLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 5,
    textTransform: 'uppercase',
  },
  presetCatRow: {
    flexGrow: 0,
    marginBottom: 5,
  },
  presetCatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
  },
  presetCatText: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  presetList: {
    maxHeight: 110,
    borderRadius: 8,
  },
  presetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 3,
  },
  presetItemName: {
    fontSize: 12,
    fontWeight: '600',
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
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginBottom: 4,
  },
  fieldInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1.5,
    paddingBottom: 2,
  },
  fieldInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    paddingVertical: 3,
  },
  fieldUnit: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginLeft: 8,
  },
  fieldError: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 3,
    letterSpacing: 0.3,
  },
  fieldHint: {
    fontSize: 9,
    fontWeight: '500',
    marginTop: 3,
    lineHeight: 12,
  },

  // ── Fuel type selector ────────────────────────────────
  fuelTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  fuelTypeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  fuelTypeText: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
  },

  // ── Preview card ──────────────────────────────────────
  previewCard: {
    width: '100%',
    borderRadius: 8,
    borderWidth: 1,
    padding: 8,
    marginTop: 2,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  previewLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  previewValue: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },

  // ── Step indicator ────────────────────────────────────
  stepIndicator: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
    marginTop: 10,
  },

  // ── Accessories full-screen container ─────────────────
  accessoriesContainer: {
    flex: 1,
    paddingTop: Platform.OS === 'web' ? 8 : 44,
    paddingBottom: 76,
  },

  accessoriesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 6,
    borderBottomWidth: 1,
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
    paddingTop: Platform.OS === 'web' ? 8 : 44,
    paddingBottom: 76,
  },
});




