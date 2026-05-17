/**
 * SetupTakeover — Dashboard Intercept for First-Time Setup
 *
 * Full-screen takeover (NOT a modal) that intercepts the dashboard
 * when vehicleSpec is missing or has invalid gvwr_lb / base_weight_lb.
 *
 * AUTO-DISMISS: On mount, checks vehicleStore.getAll() for any existing
 * Fleet vehicles with valid configuration (accessoryFramework, containerZones,
 * or valid vehicleSpec). If found, auto-dismisses by calling onComplete()
 * with the first configured vehicle's ID.
 *
 * FLOW (2-step):
 *   Step 0: "System Configuration Required" → "Configure Now"
 *   Step 1: Vehicle Specs (GVWR + Base Weight required, preset optional)
 *   Step 2: Accessory Framework → "Finish" or "Skip for now"
 *
 * On completion:
 *   - Persists setup values + accessory framework
 *   - Auto-generates container allocations from accessory selections
 *   - Vehicle returns to Dashboard loadout-ready
 *   - Calls onComplete() immediately (no confirmation screen)
 *   - Parent triggers haptic + toast
 *
 * Aesthetic: Industrial matte, purposeful, production-ready.
 */
import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
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
import { SafeIcon as Ionicons } from '../../components/SafeIcon';

import { TACTICAL, GOLD_RAIL } from '../../lib/theme';
import { MOTION, EASING } from '../../lib/motion';
import { useStableAnimatedValue } from '../../lib/ecsAnimations';

import { useTheme } from '../../context/ThemeContext';
import { useApp } from '../../context/AppContext';
import {
  vehicleSpecStore,
  VEHICLE_SPEC_PRESETS,
  getVehiclePresetId,
  resolveVehicleSpecPreset,
  type VehicleSpec,
  type VehicleSpecPreset,
  type FuelType,
} from '../../lib/vehicleSpecStore';
import { vehicleStore } from '../../lib/vehicleStore';
import { setupStore } from '../../lib/setupStore';
import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import AccessoryConfigStep, {
  getDefaultAccessorySelections,
  normalizeAccessorySelections,
  type AccessorySelections,
} from '../vehicle-wizard/AccessoryConfigStep';
import {
  buildAccessoryFramework,
  generateContainerZonesFromAccessories,
  normalizeAccessoryFramework,
  sanitizeContainerZones,
} from '../../lib/accessoryFramework';
import {
  generateContainerAllocations,
  allocationsToZonePayload,
  getTotalSlots,
} from '../../lib/accessoryContainerMapping';

function logSetupTakeoverDev(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

// ── Step definitions (2-step + intercept) ───────────────
type TakeoverStep = 'intercept' | 'vehicle-spec' | 'accessories';

// ── Preset category labels ──────────────────────────────
const PRESET_CATEGORIES: { key: string; label: string; icon: string }[] = [
  { key: 'truck', label: 'Truck', icon: 'car-outline' },
  { key: 'suv_van', label: 'SUV / Van', icon: 'bus-outline' },
  { key: 'jeep', label: 'Jeep', icon: 'navigate-outline' },
  { key: 'car_crossover', label: 'Crossover', icon: 'speedometer-outline' },
];

interface SetupTakeoverProps {
  /** Called when setup is complete — parent should dismiss takeover */
  onComplete: (vehicleId: string) => void;
  /**
   * Optional override for the "Configure Now" button action.
   * When provided, pressing "Configure Now" calls this instead of
   * entering the inline wizard. Used by Fleet tab to route to the
   * full 4-step /setup?mode=fleet-add wizard so that the first
   * vehicle experience is identical to adding subsequent vehicles.
   */
  onConfigureNow?: () => void;
}

export default function SetupTakeover({ onComplete, onConfigureNow }: SetupTakeoverProps) {

  const { palette } = useTheme();
  const { user } = useApp();

  // ── Step State ────────────────────────────────────────
  const [step, setStep] = useState<TakeoverStep>('intercept');

  // ── Auto-Dismiss: Check Fleet for Existing Configured Vehicles ──
  const autoDismissedRef = useRef(false);

  useEffect(() => {
    if (autoDismissedRef.current) return;
    let cancelled = false;

    const checkFleetVehicles = async () => {
      try {
        const { vehicles } = await vehicleStore.getAll(user?.id || null);
        if (cancelled || !vehicles || vehicles.length === 0) return;

        for (const v of vehicles) {
          const vAny = v as any;

          // Check accessoryFramework (has at least one enabled entry)
          const normalizedFramework = normalizeAccessoryFramework(vAny.accessoryFramework);
          if (normalizedFramework) {
            const hasEnabled = Object.values(normalizedFramework).some(
              (entry: any) => entry && entry.enabled
            );
            if (hasEnabled) {
              autoDismissedRef.current = true;
              logSetupTakeoverDev('[SetupTakeover] Auto-dismiss: vehicle', v.id, 'has accessoryFramework');
              setupStore.markComplete(v.id);
              vehicleSetupStore.setActiveVehicleId(v.id);
              if (!cancelled) onComplete(v.id);
              return;
            }
          }

          // Check containerZones (non-empty array)
          if (sanitizeContainerZones(vAny.containerZones).length > 0) {
            autoDismissedRef.current = true;
            logSetupTakeoverDev('[SetupTakeover] Auto-dismiss: vehicle', v.id, 'has containerZones');
            setupStore.markComplete(v.id);
            vehicleSetupStore.setActiveVehicleId(v.id);
            if (!cancelled) onComplete(v.id);
            return;
          }

          // Check vehicleSpec for this vehicle (valid GVWR + base weight)
          const spec = vehicleSpecStore.get(v.id);
          if (spec && spec.gvwr_lb > 0 && spec.base_weight_lb > 0) {
            autoDismissedRef.current = true;
            logSetupTakeoverDev('[SetupTakeover] Auto-dismiss: vehicle', v.id, 'has valid vehicleSpec');
            setupStore.markComplete(v.id);
            vehicleSetupStore.setActiveVehicleId(v.id);
            if (!cancelled) onComplete(v.id);
            return;
          }

          // Check wizard_config (legacy setup indicator)
          if (vAny.wizard_config && typeof vAny.wizard_config === 'object') {
            autoDismissedRef.current = true;
            logSetupTakeoverDev('[SetupTakeover] Auto-dismiss: vehicle', v.id, 'has wizard_config');
            setupStore.markComplete(v.id);
            vehicleSetupStore.setActiveVehicleId(v.id);
            if (!cancelled) onComplete(v.id);
            return;
          }
        }
      } catch (e) {
        console.warn('[SetupTakeover] Fleet vehicle check failed:', e);
      }
    };

    checkFleetVehicles();
    return () => { cancelled = true; };
  }, [user?.id, onComplete]);


  // ── Animation ─────────────────────────────────────────
  const fadeAnim = useStableAnimatedValue(1);
  const slideAnim = useStableAnimatedValue(0);

  // ── Vehicle Spec State ────────────────────────────────
  const [gvwr, setGvwr] = useState('');
  const [baseWeight, setBaseWeight] = useState('');
  const [fuelType, setFuelType] = useState<FuelType>('gas');
  const [selectedPresetCategory, setSelectedPresetCategory] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<VehicleSpecPreset | null>(null);

  // ── Fuel capacity (inline in vehicle spec — no separate resources step) ──
  const [fuelCapacity, setFuelCapacity] = useState('');

  // ── Accessory Configuration State ─────────────────────
  const [accessorySelections, setAccessorySelections] = useState<AccessorySelections>(
    getDefaultAccessorySelections()
  );

  // ── Vehicle ID (created or existing) ──────────────────
  const [vehicleId, setVehicleId] = useState<string | null>(null);

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

  const applyResolvedPreset = useCallback((preset: VehicleSpecPreset, nextFuelType?: FuelType | null) => {
    const resolvedSpec = resolveVehicleSpecPreset(preset, nextFuelType);
    setGvwr(String(resolvedSpec.gvwr_lb));
    setBaseWeight(String(resolvedSpec.base_weight_lb));
    setFuelCapacity(String(resolvedSpec.fuel_tank_capacity_gal));
    setFuelType(resolvedSpec.fuel_type);
    setGvwrError('');
    setBaseWeightError('');
  }, []);

  const handleFuelTypeChange = useCallback((nextFuelType: FuelType) => {
    setFuelType(nextFuelType);
    if (!selectedPreset) return;

    const resolvedSpec = resolveVehicleSpecPreset(selectedPreset, nextFuelType);
    setGvwr(String(resolvedSpec.gvwr_lb));
    setBaseWeight(String(resolvedSpec.base_weight_lb));
    setFuelCapacity(String(resolvedSpec.fuel_tank_capacity_gal));
    setGvwrError('');
    setBaseWeightError('');
  }, [selectedPreset]);

  // ── Step transition animation ─────────────────────────
  const animateToStep = useCallback((newStep: TakeoverStep) => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: MOTION.stateTransition,
        easing: EASING.standard,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: -10,
        duration: MOTION.stateTransition,
        easing: EASING.standard,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setStep(newStep);
      slideAnim.setValue(10);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: MOTION.stateTransition + 60,
          easing: EASING.standard,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: MOTION.stateTransition + 60,
          easing: EASING.standard,
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  // ── Apply preset ──────────────────────────────────────
  const handleApplyPreset = useCallback((preset: VehicleSpecPreset) => {
    setSelectedPreset(preset);
    applyResolvedPreset(preset);
  }, [applyResolvedPreset]);

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

  // ── Handle vehicle spec continue → advance to accessories ──
  const handleVehicleSpecContinue = useCallback(async () => {
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
        return;
      }
    }

    // Save vehicle spec
    const fuelCapGal = parseFloat(fuelCapacity) || 0;
    vehicleSpecStore.set(vId, {
      gvwr_lb: gvwrNum,
      base_weight_lb: baseWeightNum,
      fuel_tank_capacity_gal: fuelCapGal,
      fuel_type: fuelType,
    });

    // Persist fuel capacity on vehicle record
    if (fuelCapGal > 0) {
      vehicleStore.update(
        vId,
        { fuel_tank_capacity_gal: fuelCapGal },
        user?.id || null,
      ).catch((e: any) => console.warn('[SetupTakeover] Failed to persist fuel capacity:', e));
    }

    setupStore.setSetupVehicleId(vId);

    // Advance to Step 2: Accessory Framework
    animateToStep('accessories');
  }, [validateVehicleSpec, vehicleId, selectedPreset, user, gvwrNum, baseWeightNum, fuelCapacity, fuelType, animateToStep]);


  // ── Handle accessories finish → auto-generate containers → complete ──
  const handleAccessoriesFinish = useCallback(async () => {
    const vId = vehicleId || setupStore.getSetupVehicleId();
    if (!vId) return;

    try {
      // Build the structured accessory framework from UI selections
      const normalizedSelections = normalizeAccessorySelections(accessorySelections);
      const framework = buildAccessoryFramework(normalizedSelections);
      const containerZones = sanitizeContainerZones(generateContainerZonesFromAccessories(framework));

      // Auto-generate container allocations from accessory selections
      // This makes the vehicle loadout-ready without a separate container step
      const containerAllocations = generateContainerAllocations(normalizedSelections, []);
      const zonesPayload = sanitizeContainerZones(allocationsToZonePayload(containerAllocations));
      const totalSlots = getTotalSlots(containerAllocations);

      logSetupTakeoverDev('[SetupTakeover] Accessories configured:', containerZones.length, 'zones,', totalSlots, 'slots');

      // Persist accessory framework + auto-generated containers
      vehicleStore.finalizeConfig(
        vId,
        zonesPayload,
        { _accessories: JSON.stringify(normalizedSelections) },
        user?.id || null,
        { accessoryFramework: framework, containerZones },
      ).catch((e: any) => console.warn('[SetupTakeover] Failed to save accessories:', e));
    } catch (e) {
      console.warn('[SetupTakeover] Error building accessory framework:', e);
    }

    // Mark complete and notify parent
    setupStore.markComplete(vId);
    onComplete(vId);
  }, [vehicleId, accessorySelections, user, onComplete]);

  // ── Handle skip accessories (complete without accessories) ──
  const handleSkipAccessories = useCallback(() => {
    const vId = vehicleId || setupStore.getSetupVehicleId();
    if (!vId) return;

    // Mark complete and notify parent (no accessories saved)
    setupStore.markComplete(vId);
    onComplete(vId);
  }, [vehicleId, onComplete]);

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

  // ── Step: Intercept ───────────────────────────────────
  const renderIntercept = () => (
    <View style={styles.interceptContent}>
      <View style={[styles.iconCircle, { backgroundColor: palette.amber + '10', borderColor: palette.amber + '20' }]}>
        <Ionicons name="construct-outline" size={28} color={palette.amber} />
      </View>

      <Text style={[styles.interceptTitle, { color: palette.text }]}>
        System Configuration Required
      </Text>
      <Text style={[styles.interceptSubtitle, { color: palette.textMuted }]}>
        ECS needs basic vehicle specs before activation.
      </Text>

      <View style={[styles.amberRule, { backgroundColor: palette.amber + '40' }]} />

      <TouchableOpacity
        style={[styles.primaryBtn, { backgroundColor: palette.amber }]}
        onPress={onConfigureNow || (() => animateToStep('vehicle-spec'))}

        activeOpacity={0.7}
      >
        <Ionicons name="settings-outline" size={16} color={TACTICAL.bg} style={{ marginRight: 8 }} />
        <Text style={[styles.primaryBtnText, { color: TACTICAL.bg }]}>Configure Now</Text>
      </TouchableOpacity>
    </View>
  );

  // ── Step: Vehicle Specification ────────────────────────
  const renderVehicleSpec = () => (
    <View style={styles.stepContent}>
      {/* Back to intercept */}
      <TouchableOpacity
        style={styles.backBtn}
        onPress={() => animateToStep('intercept')}
        activeOpacity={0.6}
      >
        <Ionicons name="chevron-back" size={16} color={palette.textMuted} />
        <Text style={[styles.backBtnText, { color: palette.textMuted }]}>Back</Text>
      </TouchableOpacity>

      {/* Step indicator — 2 dots, step 1 active */}
      <View style={styles.stepIndicatorRow}>
        <View style={[styles.stepDot, { backgroundColor: palette.amber }]} />
        <View style={[styles.stepLine, { backgroundColor: palette.border }]} />
        <View style={[styles.stepDot, { backgroundColor: palette.textMuted + '30' }]} />
      </View>

      <Text style={[styles.stepTitle, { color: palette.text }]}>Vehicle Specification</Text>
      <Text style={[styles.stepHint, { color: palette.textMuted }]}>
        Required for weight systems and payload margin computation.
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
            {availablePresets.map((preset) => (
              <TouchableOpacity
                key={getVehiclePresetId(preset)}
                style={[
                  styles.presetItem,
                  {
                    backgroundColor: selectedPreset && getVehiclePresetId(selectedPreset) === getVehiclePresetId(preset)
                      ? palette.amber + '10'
                      : 'transparent',
                    borderColor: selectedPreset && getVehiclePresetId(selectedPreset) === getVehiclePresetId(preset)
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

      {/* Divider */}
      <View style={[styles.dividerLine, { backgroundColor: GOLD_RAIL.subsection }]} />

      {/* Manual fields */}
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
              onPress={() => handleFuelTypeChange(ft)}
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

      {/* Fuel tank capacity (inline — no separate resources step) */}
      {renderNumberInput(
        'Fuel Tank Capacity',
        fuelCapacity,
        setFuelCapacity,
        '21.1',
        'gal',
        undefined,
        'Optional. Enables fuel range planning.',
      )}

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
        onPress={handleVehicleSpecContinue}
        disabled={!isVehicleSpecValid}
        activeOpacity={0.7}
      >
        <Text style={[styles.primaryBtnText, { color: TACTICAL.bg }]}>Continue</Text>
      </TouchableOpacity>
    </View>
  );


  // ── Step: Accessory Configuration ─────────────────────
  const renderAccessories = () => (
    <View style={styles.accessoriesContainer}>
      {/* Back button + step indicator above the AccessoryConfigStep */}
      <View style={[styles.accessoriesHeader, { borderBottomColor: palette.border }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => animateToStep('vehicle-spec')}
          activeOpacity={0.6}
        >
          <Ionicons name="chevron-back" size={16} color={palette.textMuted} />
          <Text style={[styles.backBtnText, { color: palette.textMuted }]}>Back</Text>
        </TouchableOpacity>

        {/* Step indicator — 2 dots, step 2 active */}
        <View style={styles.stepIndicatorRow}>
          <View style={[styles.stepDotDone, { backgroundColor: palette.amber }]}>
            <Ionicons name="checkmark" size={8} color={TACTICAL.bg} />
          </View>
          <View style={[styles.stepLine, { backgroundColor: palette.amber + '40' }]} />
          <View style={[styles.stepDot, { backgroundColor: palette.amber }]} />
        </View>

        {/* Skip accessories link */}
        <TouchableOpacity
          style={styles.skipBtn}
          onPress={handleSkipAccessories}
          activeOpacity={0.6}
        >
          <Text style={[styles.skipBtnText, { color: palette.textMuted }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      {/* AccessoryConfigStep — fills remaining space */}
      <AccessoryConfigStep
        accessories={accessorySelections}
        onAccessoriesChange={setAccessorySelections}
        onBack={() => animateToStep('vehicle-spec')}
        onNext={handleAccessoriesFinish}
        isLastStep={true}
      />
    </View>
  );

  // ── Render current step ───────────────────────────────
  const renderStep = () => {
    switch (step) {
      case 'intercept': return renderIntercept();
      case 'vehicle-spec': return renderVehicleSpec();
      case 'accessories': return null; // Rendered separately (full-screen)
    }
  };

  // ── Accessories step uses a full-screen layout ────────
  if (step === 'accessories') {
    return (
      <View style={[styles.container, { backgroundColor: palette.bg }]}>
        {renderAccessories()}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: palette.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
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
            {renderStep()}
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  flex: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },

  // ── Panel ─────────────────────────────────────────────
  panel: {
    width: '100%',
    maxWidth: 480,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },

  // ── Intercept screen ──────────────────────────────────
  interceptContent: {
    paddingHorizontal: 24,
    paddingVertical: 32,
    alignItems: 'center',
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  interceptTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
    textAlign: 'center',
    lineHeight: 24,
  },
  interceptSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.2,
    textAlign: 'center',
    lineHeight: 17,
    marginTop: 8,
  },
  amberRule: {
    width: 48,
    height: 1.5,
    borderRadius: 1,
    marginTop: 16,
    marginBottom: 20,
  },

  // ── Step content ──────────────────────────────────────
  stepContent: {
    paddingHorizontal: 18,
    paddingVertical: 16,
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

  // ── Step indicator ────────────────────────────────────
  stepIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: 10,
    gap: 0,
  },
  stepDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  stepDotDone: {
    width: 10,
    height: 10,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLine: {
    width: 24,
    height: 1.5,
  },

  // ── Titles ────────────────────────────────────────────
  stepTitle: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
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
    flexDirection: 'row',
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  btnDisabled: {
    opacity: 0.35,
  },

  // ── Skip button ───────────────────────────────────────
  skipBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  skipBtnText: {
    fontSize: 12,
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
});






