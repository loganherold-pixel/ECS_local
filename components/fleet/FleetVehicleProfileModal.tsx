import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSButton } from '../ECSButton';
import { ECSBadge } from '../ECSStatus';
import { ECSCard, ECSPanel } from '../ECSSurface';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { ECS_TEXT } from '../../lib/ecsTypographyTokens';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { ECS_STATUS } from '../../lib/ecsStatusTokens';
import type { Vehicle } from '../../lib/types';
import { vehicleStore } from '../../lib/vehicleStore';
import { FUEL_WEIGHT_PER_GAL, vehicleSpecStore, type FuelType } from '../../lib/vehicleSpecStore';
import { consumablesStore, WATER_DENSITY_LB_PER_GAL } from '../../lib/consumablesStore';
import { tiresLiftStore } from '../../lib/tiresLiftStore';
import {
  applyFleetProfilePrefillOption,
  calculateConfirmedPayloadRemaining,
  createEmptyFleetVehicleProfileDraft,
  parseFleetProfileNumber,
  resolveFleetVehicleProfilePrefillOptions,
  resolveFleetVehicleProfileSuggestion,
  validateFleetVehicleProfileDraft,
  type FleetVehicleProfileDraft,
} from '../../lib/fleet/fleetVehicleProfile';
import { emitFleetTelemetryEvent } from '../../lib/fleet/fleetTelemetryEvents';
import {
  FLEET_ADVANCED_FRONT_LEVEL_OPTIONS,
  FLEET_ADVANCED_SUSPENSION_HEIGHT_OPTIONS,
  FLEET_ADVANCED_TIRE_SIZE_OPTIONS,
  formatFleetAdvancedGallonsInput,
  normalizeFleetAdvancedSpecsDraftForSave,
  parseFleetAdvancedNonNegativeDecimal,
  validateFleetAdvancedSpecsDraft,
  type FleetAdvancedSpecsDraft,
} from '../../lib/fleet/fleetAdvancedSpecs';

type Props = {
  visible: boolean;
  vehicle: Vehicle | null;
  userId: string | null;
  onClose: () => void;
  onSaved?: () => void;
  showToast?: (message: string) => void;
};

type SaveVehicleProfileResult = {
  vehicle: Vehicle | null;
  created: boolean;
  errors: string[];
};

function formatLbs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value).toLocaleString()} lb`;
}

function formatSpecNumber(value: number | null | undefined, suffix: string, precision = 1): string {
  if (value == null || !Number.isFinite(value)) return '--';
  const rounded = Number.isInteger(value) ? String(value) : value.toFixed(precision);
  return `${rounded} ${suffix}`;
}

function resolveFuelType(vehicle: Vehicle | null): FuelType {
  if (!vehicle) return 'gas';
  const spec = vehicleSpecStore.get(vehicle.id);
  if (spec?.fuel_type === 'diesel' || spec?.fuel_type === 'gas') return spec.fuel_type;
  const vehicleFuelType = (vehicle as any).fuel_type;
  if (vehicleFuelType === 'diesel' || vehicleFuelType === 'gas') return vehicleFuelType;
  const engine = String(spec?.engine ?? (vehicle as any).wizard_config?.engine ?? '').toLowerCase();
  return engine.includes('diesel') || engine.includes('cummins') ? 'diesel' : 'gas';
}

function buildAdvancedSetupDraft(
  vehicle: Vehicle | null,
  fallbacks: { fuelTankCapacityGal?: number | null; waterCapacityGal?: number | null } = {},
): FleetAdvancedSpecsDraft {
  if (!vehicle) {
    const fallbackFuelGallons =
      typeof fallbacks.fuelTankCapacityGal === 'number' && Number.isFinite(fallbacks.fuelTankCapacityGal)
        ? Math.max(0, fallbacks.fuelTankCapacityGal)
        : 0;
    const fallbackWaterGallons =
      typeof fallbacks.waterCapacityGal === 'number' && Number.isFinite(fallbacks.waterCapacityGal)
        ? Math.max(0, fallbacks.waterCapacityGal)
        : 0;
    return {
      suspensionLiftInches: 0,
      isLeveled: false,
      frontLevelInches: null,
      tireSizeInches: null,
      waterGallons: formatFleetAdvancedGallonsInput(fallbackWaterGallons),
      fuelGallons: formatFleetAdvancedGallonsInput(fallbackFuelGallons),
    };
  }

  const tiresLift = tiresLiftStore.get(vehicle.id);
  const consumables = consumablesStore.get(vehicle.id);
  const spec = vehicleSpecStore.get(vehicle.id);
  const fuelTankCapacity = spec?.fuel_tank_capacity_gal ?? vehicle.fuel_tank_capacity_gal ?? fallbacks.fuelTankCapacityGal ?? 0;
  const currentFuelGallons =
    consumables.fuel_gal_current != null
      ? consumables.fuel_gal_current
      : fuelTankCapacity > 0
        ? fuelTankCapacity * ((consumables.fuel_percent_current ?? 100) / 100)
        : 0;
  const currentWaterGallons =
    consumables.water_gal_current ??
    vehicle.current_water_gal ??
    vehicle.water_capacity_gal ??
    fallbacks.waterCapacityGal ??
    0;

  return {
    suspensionLiftInches: Math.max(0, Math.min(10, Math.round(tiresLift?.suspensionLiftInches ?? vehicle.suspension_lift_inches ?? 0))),
    isLeveled: Boolean(tiresLift?.isLeveled ?? vehicle.is_leveled ?? false),
    frontLevelInches:
      tiresLift?.frontLevelInches ??
      (vehicle as any).front_level_inches ??
      null,
    tireSizeInches:
      tiresLift?.tireSizeInches && tiresLift.tireSizeInches > 0
        ? tiresLift.tireSizeInches
        : vehicle.tire_size_inches ?? null,
    waterGallons: formatFleetAdvancedGallonsInput(currentWaterGallons),
    fuelGallons: formatFleetAdvancedGallonsInput(currentFuelGallons),
  };
}

function buildDraft(vehicle: Vehicle | null): FleetVehicleProfileDraft {
  const draft = createEmptyFleetVehicleProfileDraft();
  if (!vehicle) return draft;
  const spec = vehicleSpecStore.get(vehicle.id) as any;
  const vehicleAny = vehicle as any;
  const wizard = vehicleAny.wizard_config && typeof vehicleAny.wizard_config === 'object'
    ? vehicleAny.wizard_config
    : {};
  return {
    ...draft,
    nickname: vehicle.name ?? '',
    year: vehicle.year ? String(vehicle.year) : '',
    make: vehicle.make ?? '',
    model: vehicle.model ?? '',
    trim: wizard.trim ?? spec?.trim ?? '',
    engine: wizard.engine ?? spec?.engine ?? '',
    drivetrain: wizard.drivetrain ?? spec?.drivetrain ?? '',
    cab: wizard.cab ?? spec?.cab ?? '',
    bed: wizard.bed ?? wizard.bed_length ?? spec?.bed_length ?? '',
    vehicleType: wizard.vehicle_type ?? vehicle.type ?? 'truck',
    baseNetWeight: spec?.base_weight_lb ? String(spec.base_weight_lb) : '',
    gvwr: spec?.gvwr_lb ? String(spec.gvwr_lb) : '',
    frontBaseWeight: spec?.front_base_weight_lb ? String(spec.front_base_weight_lb) : '',
    rearBaseWeight: spec?.rear_base_weight_lb ? String(spec.rear_base_weight_lb) : '',
    frontGawr: spec?.front_gawr_lb ? String(spec.front_gawr_lb) : '',
    rearGawr: spec?.rear_gawr_lb ? String(spec.rear_gawr_lb) : '',
  };
}

function ProfileField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  optional = false,
  required = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  optional?: boolean;
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <View style={styles.fieldLabelRow}>
        <Text style={styles.fieldLabel}>{label}{optional ? ' OPTIONAL' : ''}</Text>
        {required ? <Text style={styles.requiredMark}>*</Text> : null}
      </View>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TACTICAL.textMuted}
        keyboardType={keyboardType}
        style={styles.input}
      />
    </View>
  );
}

function OptionChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.optionChip, selected ? styles.optionChipSelected : null]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Text style={[styles.optionChipText, selected ? styles.optionChipTextSelected : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SetupSelector({
  label,
  helper,
  values,
  value,
  onSelect,
  formatValue,
  horizontal = false,
}: {
  label: string;
  helper?: string;
  values: readonly number[];
  value: number | null;
  onSelect: (value: number) => void;
  formatValue: (value: number) => string;
  horizontal?: boolean;
}) {
  const content = (
    <View style={horizontal ? styles.optionRow : styles.optionGrid}>
      {values.map((option) => (
        <OptionChip
          key={option}
          label={formatValue(option)}
          selected={value === option}
          onPress={() => onSelect(option)}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.selectorBlock}>
      <View style={styles.selectorHeader}>
        <Text style={styles.title}>{label}</Text>
        {helper ? <Text style={styles.copy}>{helper}</Text> : null}
      </View>
      {horizontal ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollOptions}>
          {content}
        </ScrollView>
      ) : content}
    </View>
  );
}

function FluidSetupField({
  label,
  value,
  onChangeText,
  pounds,
  rateLabel,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  pounds: number | null;
  rateLabel: string;
}) {
  return (
    <View style={styles.fluidField}>
      <ProfileField label={label} value={value} onChangeText={onChangeText} keyboardType="numeric" />
      <View style={styles.calculatedTile}>
        <Text style={styles.fieldLabel}>CALCULATED WEIGHT</Text>
        <Text style={styles.specValue}>{pounds == null ? '--' : formatLbs(pounds)}</Text>
        <Text style={styles.calculatedMeta}>{rateLabel}</Text>
      </View>
    </View>
  );
}

export default function FleetVehicleProfileModal({
  visible,
  vehicle,
  userId,
  onClose,
  onSaved,
  showToast,
}: Props) {
  const [draft, setDraft] = useState<FleetVehicleProfileDraft>(() => buildDraft(vehicle));
  const [advancedDraft, setAdvancedDraft] = useState<FleetAdvancedSpecsDraft | null>(null);
  const [advancedVisible, setAdvancedVisible] = useState(false);
  const [advancedErrors, setAdvancedErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const profileGateShake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setDraft(buildDraft(vehicle));
      setAdvancedDraft(null);
      setAdvancedVisible(false);
      setAdvancedErrors([]);
    } else {
      setAdvancedDraft(null);
      setAdvancedVisible(false);
      setAdvancedErrors([]);
    }
  }, [vehicle, visible]);

  const suggestion = useMemo(() => resolveFleetVehicleProfileSuggestion(draft), [draft]);
  const prefillOptions = useMemo(() => resolveFleetVehicleProfilePrefillOptions(draft), [draft]);
  const validationErrors = useMemo(() => validateFleetVehicleProfileDraft(draft), [draft]);
  const payloadRemaining = useMemo(() => calculateConfirmedPayloadRemaining(draft), [draft]);
  const suggestedFuelTankCapacityGal = suggestion.oemReference?.specs.fuel_tank_capacity_gal ?? null;
  const suggestedWaterCapacityGal = vehicle?.water_capacity_gal ?? null;
  const advancedSpecFallbacks = useMemo(
    () => ({
      fuelTankCapacityGal: suggestedFuelTankCapacityGal,
      waterCapacityGal: suggestedWaterCapacityGal,
    }),
    [suggestedFuelTankCapacityGal, suggestedWaterCapacityGal],
  );

  const updateDraft = useCallback((key: keyof FleetVehicleProfileDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const updateAdvancedSetupDraft = useCallback((patch: Partial<FleetAdvancedSpecsDraft>) => {
    setAdvancedErrors([]);
    setAdvancedDraft((current) => ({ ...(current ?? buildAdvancedSetupDraft(vehicle, advancedSpecFallbacks)), ...patch }));
  }, [advancedSpecFallbacks, vehicle]);

  const triggerProfileGateShake = useCallback(() => {
    profileGateShake.stopAnimation();
    profileGateShake.setValue(0);
    Animated.sequence([
      Animated.timing(profileGateShake, { toValue: 6, duration: 42, useNativeDriver: true }),
      Animated.timing(profileGateShake, { toValue: -6, duration: 42, useNativeDriver: true }),
      Animated.timing(profileGateShake, { toValue: 4, duration: 42, useNativeDriver: true }),
      Animated.timing(profileGateShake, { toValue: -4, duration: 42, useNativeDriver: true }),
      Animated.timing(profileGateShake, { toValue: 0, duration: 42, useNativeDriver: true }),
    ]).start();
  }, [profileGateShake]);

  const openAdvancedSpecs = useCallback(() => {
    if (validationErrors.length > 0) {
      triggerProfileGateShake();
      showToast?.(validationErrors[0]);
      return;
    }

    setAdvancedDraft(buildAdvancedSetupDraft(vehicle, advancedSpecFallbacks));
    setAdvancedErrors([]);
    setAdvancedVisible(true);
  }, [advancedSpecFallbacks, showToast, triggerProfileGateShake, validationErrors, vehicle]);

  const closeAdvancedWithoutSaving = useCallback(() => {
    setAdvancedDraft(null);
    setAdvancedErrors([]);
    setAdvancedVisible(false);
  }, []);

  const applySuggestedSpecs = useCallback(() => {
    setDraft((current) => ({
      ...current,
      baseNetWeight: suggestion.baseNetWeight ? String(Math.round(suggestion.baseNetWeight.lbs)) : current.baseNetWeight,
      gvwr: suggestion.gvwr ? String(Math.round(suggestion.gvwr.lbs)) : current.gvwr,
      vehicleType: suggestion.oemReference?.vehicleType ?? current.vehicleType,
    }));
  }, [suggestion.baseNetWeight, suggestion.gvwr, suggestion.oemReference]);

  const handlePrefillOption = useCallback((optionId: string) => {
    setDraft((current) => applyFleetProfilePrefillOption(current, optionId));
  }, []);

  const handleClose = useCallback(() => {
    setAdvancedVisible(false);
    onClose();
  }, [onClose]);

  const saveVehicleProfileDraft = useCallback(async (): Promise<SaveVehicleProfileResult> => {
    const errors = validateFleetVehicleProfileDraft(draft);
    if (errors.length > 0) {
      return { vehicle: null, created: false, errors };
    }

    const year = parseFleetProfileNumber(draft.year);
    const oemReference = suggestion.oemReference;
    const oemSpecs = oemReference?.specs ?? null;
    const resolvedVehicleType = oemReference?.vehicleType ?? draft.vehicleType ?? 'vehicle';
    const baseWeight = parseFleetProfileNumber(draft.baseNetWeight) ?? suggestion.baseNetWeight?.lbs ?? 0;
    const gvwr = parseFleetProfileNumber(draft.gvwr) ?? suggestion.gvwr?.lbs ?? 0;
    const fuelType: FuelType =
      draft.engine.toLowerCase().includes('cummins') || draft.engine.toLowerCase().includes('diesel')
        || oemSpecs?.fuel_type === 'diesel'
        ? 'diesel'
        : 'gas';
    const wizardConfig = {
      vehicle_type: resolvedVehicleType,
      trim: draft.trim.trim(),
      engine: draft.engine.trim(),
      drivetrain: draft.drivetrain.trim(),
      cab: draft.cab.trim(),
      bed: draft.bed.trim(),
      bed_length: draft.bed.trim(),
      weight_source: suggestion.baseNetWeight?.source ?? 'user_estimate',
      weight_confidence: suggestion.baseNetWeight?.confidence ?? 62,
      oem_reference_id: oemReference?.id ?? null,
      oem_reference_label: oemReference?.label ?? null,
      oem_reference_status: suggestion.oemMatchStatus,
      oem_reference_confidence: oemReference?.confidence ?? null,
    };
    const identity = {
      name: draft.nickname.trim(),
      make: draft.make.trim() || undefined,
      model: draft.model.trim() || undefined,
      year,
    };
    const created = !vehicle;
    const result = vehicle
      ? await vehicleStore.update(vehicle.id, {
          ...identity,
          type: resolvedVehicleType,
          wizard_config: wizardConfig,
        } as any, userId)
      : await vehicleStore.create(identity, userId);

    const savedVehicle = result.vehicle;
    if (!savedVehicle) {
      return {
        vehicle: null,
        created,
        errors: [created ? 'Unable to create vehicle profile.' : 'Unable to save vehicle profile.'],
      };
    }

    const savedExistingSpec = vehicleSpecStore.get(savedVehicle.id);
    const resolvedFuelTankCapacityGal =
      savedExistingSpec?.fuel_tank_capacity_gal && savedExistingSpec.fuel_tank_capacity_gal > 0
        ? savedExistingSpec.fuel_tank_capacity_gal
        : oemSpecs?.fuel_tank_capacity_gal ?? savedVehicle.fuel_tank_capacity_gal ?? null;
    const resolvedWaterCapacityGal = savedVehicle.water_capacity_gal ?? null;

    vehicleSpecStore.update(savedVehicle.id, {
      gvwr_lb: gvwr,
      base_weight_lb: baseWeight,
      fuel_tank_capacity_gal: resolvedFuelTankCapacityGal ?? 0,
      fuel_type: fuelType,
      front_base_weight_lb: parseFleetProfileNumber(draft.frontBaseWeight) ?? undefined,
      rear_base_weight_lb: parseFleetProfileNumber(draft.rearBaseWeight) ?? undefined,
      front_gawr_lb: parseFleetProfileNumber(draft.frontGawr) ?? undefined,
      rear_gawr_lb: parseFleetProfileNumber(draft.rearGawr) ?? undefined,
      payload_capacity_lb: oemSpecs?.payload_capacity_lb ?? (gvwr > 0 && baseWeight > 0 ? gvwr - baseWeight : null),
      ground_clearance_inches: oemSpecs?.ground_clearance_inches ?? vehicleSpecStore.get(savedVehicle.id)?.ground_clearance_inches,
      wheelbase_in: oemSpecs?.wheelbase_in ?? vehicleSpecStore.get(savedVehicle.id)?.wheelbase_in,
      overall_length_in: oemSpecs?.overall_length_in ?? vehicleSpecStore.get(savedVehicle.id)?.overall_length_in,
      overall_width_in: oemSpecs?.overall_width_in ?? vehicleSpecStore.get(savedVehicle.id)?.overall_width_in,
      overall_height_in: oemSpecs?.overall_height_in ?? vehicleSpecStore.get(savedVehicle.id)?.overall_height_in,
      track_width_front_in: oemSpecs?.track_width_front_in ?? vehicleSpecStore.get(savedVehicle.id)?.track_width_front_in,
      track_width_rear_in: oemSpecs?.track_width_rear_in ?? vehicleSpecStore.get(savedVehicle.id)?.track_width_rear_in,
      approach_angle_deg: oemSpecs?.approach_angle_deg ?? vehicleSpecStore.get(savedVehicle.id)?.approach_angle_deg,
      breakover_angle_deg: oemSpecs?.breakover_angle_deg ?? vehicleSpecStore.get(savedVehicle.id)?.breakover_angle_deg,
      departure_angle_deg: oemSpecs?.departure_angle_deg ?? vehicleSpecStore.get(savedVehicle.id)?.departure_angle_deg,
      turning_diameter_ft: oemSpecs?.turning_diameter_ft ?? vehicleSpecStore.get(savedVehicle.id)?.turning_diameter_ft,
      oem_reference_id: oemReference?.id ?? null,
      oem_reference_label: oemReference?.label ?? null,
      oem_reference_confidence: oemReference?.confidence ?? null,
      oem_reference_notes: oemReference?.notes ?? null,
      trim: draft.trim.trim(),
      engine: draft.engine.trim(),
      drivetrain: draft.drivetrain.trim(),
      cab: draft.cab.trim(),
      bed_length: draft.bed.trim(),
    } as any);

    const persisted = await vehicleStore.update(savedVehicle.id, {
      type: resolvedVehicleType,
      wizard_config: wizardConfig,
      base_weight_lb: baseWeight || null,
      gvwr_lb: gvwr || null,
      fuel_tank_capacity_gal: resolvedFuelTankCapacityGal,
      water_capacity_gal: resolvedWaterCapacityGal,
      fuel_type: fuelType,
      front_base_weight_lb: parseFleetProfileNumber(draft.frontBaseWeight),
      rear_base_weight_lb: parseFleetProfileNumber(draft.rearBaseWeight),
      front_gawr_lb: parseFleetProfileNumber(draft.frontGawr),
      rear_gawr_lb: parseFleetProfileNumber(draft.rearGawr),
      ground_clearance_inches: oemSpecs?.ground_clearance_inches ?? (savedVehicle as any).ground_clearance_inches ?? null,
      wheelbase_in: oemSpecs?.wheelbase_in ?? (savedVehicle as any).wheelbase_in ?? null,
      overall_length_in: oemSpecs?.overall_length_in ?? (savedVehicle as any).overall_length_in ?? null,
      overall_width_in: oemSpecs?.overall_width_in ?? (savedVehicle as any).overall_width_in ?? null,
      overall_height_in: oemSpecs?.overall_height_in ?? (savedVehicle as any).overall_height_in ?? null,
      track_width_front_in: oemSpecs?.track_width_front_in ?? (savedVehicle as any).track_width_front_in ?? null,
      track_width_rear_in: oemSpecs?.track_width_rear_in ?? (savedVehicle as any).track_width_rear_in ?? null,
      approach_angle_deg: oemSpecs?.approach_angle_deg ?? (savedVehicle as any).approach_angle_deg ?? null,
      breakover_angle_deg: oemSpecs?.breakover_angle_deg ?? (savedVehicle as any).breakover_angle_deg ?? null,
      departure_angle_deg: oemSpecs?.departure_angle_deg ?? (savedVehicle as any).departure_angle_deg ?? null,
      turning_diameter_ft: oemSpecs?.turning_diameter_ft ?? (savedVehicle as any).turning_diameter_ft ?? null,
    } as any, userId);

    if (created) {
      emitFleetTelemetryEvent('fleet_vehicle_added', { vehicleId: savedVehicle.id });
    }
    emitFleetTelemetryEvent('fleet_specs_confirmed', {
      vehicleId: savedVehicle.id,
      meta: {
        confidence: suggestion.baseNetWeight?.confidence ?? null,
        source: suggestion.baseNetWeight?.source ?? null,
      },
    });

    return {
      vehicle: persisted.vehicle ?? savedVehicle,
      created,
      errors: [],
    };
  }, [draft, suggestion.baseNetWeight, suggestion.gvwr, suggestion.oemMatchStatus, suggestion.oemReference, userId, vehicle]);

  const handleSave = useCallback(async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await saveVehicleProfileDraft();
      if (!result.vehicle) {
        const firstError = result.errors[0] ?? 'Unable to save vehicle profile';
        showToast?.(firstError);
        return;
      }
      showToast?.('Vehicle profile saved');
      onSaved?.();
      handleClose();
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [handleClose, onSaved, saveVehicleProfileDraft, showToast]);

  const commitAdvancedSpecs = useCallback(async () => {
    if (savingRef.current) return;
    const nextDraft = advancedDraft ?? buildAdvancedSetupDraft(vehicle);
    const errors = validateFleetAdvancedSpecsDraft(nextDraft);
    const normalized = normalizeFleetAdvancedSpecsDraftForSave(nextDraft);
    if (errors.length > 0) {
      setAdvancedErrors(errors);
      showToast?.(errors[0]);
      return;
    }
    if (!normalized) return;

    savingRef.current = true;
    setSaving(true);
    try {
      const profileResult = await saveVehicleProfileDraft();
      if (!profileResult.vehicle) {
        const profileErrors = profileResult.errors.length > 0
          ? profileResult.errors
          : ['Unable to save vehicle profile before advanced specs.'];
        setAdvancedErrors(profileErrors);
        showToast?.(profileErrors[0]);
        return;
      }

      const targetVehicle = profileResult.vehicle;
      const waterGallons = normalized.waterGallons;
      const fuelGallons = normalized.fuelGallons;
      const fuelType = resolveFuelType(targetVehicle);
      const frontLevelInches = normalized.frontLevelInches;
      tiresLiftStore.set(targetVehicle.id, {
        tireSizeInches: normalized.tireSizeInches,
        suspensionLiftInches: normalized.suspensionLiftInches,
        isLeveled: normalized.isLeveled,
        frontLevelInches,
        updatedAt: new Date().toISOString(),
      });
      consumablesStore.setWaterGal(targetVehicle.id, waterGallons, 'manual');
      consumablesStore.setFuelGal(targetVehicle.id, fuelGallons, 'manual');
      vehicleSpecStore.update(targetVehicle.id, {
        tire_size_inches: normalized.tireSizeInches,
        suspension_lift_inches: normalized.suspensionLiftInches,
        is_leveled: normalized.isLeveled,
        front_level_inches: frontLevelInches,
        fuel_type: fuelType,
      });
      const spec = vehicleSpecStore.get(targetVehicle.id);
      const fuelPercent =
        spec?.fuel_tank_capacity_gal && spec.fuel_tank_capacity_gal > 0
          ? Math.max(0, Math.min(100, (fuelGallons / spec.fuel_tank_capacity_gal) * 100))
          : targetVehicle.current_fuel_percent;
      await vehicleStore.update(targetVehicle.id, {
        tire_size_inches: normalized.tireSizeInches,
        suspension_lift_inches: normalized.suspensionLiftInches,
        is_leveled: normalized.isLeveled,
        front_level_inches: frontLevelInches,
        water_capacity_gal: waterGallons > 0 ? waterGallons : targetVehicle.water_capacity_gal ?? null,
        current_water_gal: waterGallons,
        current_fuel_percent: fuelPercent ?? null,
        fuel_type: fuelType,
      } as any, userId);
      setAdvancedDraft(null);
      setAdvancedErrors([]);
      setAdvancedVisible(false);
      showToast?.('Advanced specs saved');
      onSaved?.();
      if (profileResult.created) {
        handleClose();
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }, [advancedDraft, handleClose, onSaved, saveVehicleProfileDraft, showToast, userId, vehicle]);

  const activeAdvancedDraft = advancedDraft ?? buildAdvancedSetupDraft(vehicle, advancedSpecFallbacks);
  const advancedFuelType = resolveFuelType(vehicle);
  const advancedWaterGallons = parseFleetAdvancedNonNegativeDecimal(activeAdvancedDraft.waterGallons);
  const advancedFuelGallons = parseFleetAdvancedNonNegativeDecimal(activeAdvancedDraft.fuelGallons);
  const advancedWaterWeight =
    advancedWaterGallons == null ? null : advancedWaterGallons * WATER_DENSITY_LB_PER_GAL;
  const advancedFuelWeight =
    advancedFuelGallons == null ? null : advancedFuelGallons * FUEL_WEIGHT_PER_GAL[advancedFuelType];

  return (
    <>
      <ECSModalShell
        visible={visible}
        onClose={handleClose}
        title={vehicle ? 'Vehicle Profile' : 'Add Vehicle Profile'}
        subtitle="Tell ECS what you drive. ECS will suggest likely specs, then ask you to confirm."
        eyebrow="FLEET PROFILE"
        icon="car-outline"
        overlayClass="workflow"
        maxWidth={980}
        maxHeightFraction={1}
        minHeightFraction={1}
        scrollable
        dismissOnBackdrop={false}
        allowSwipeDismiss={false}
        footer={
          <ECSOverlayFooter>
            <ECSButton label="Cancel" variant="tertiary" size="medium" onPress={handleClose} grow />
            <ECSButton
              label={saving ? 'Saving...' : 'Confirm Specs'}
              icon="checkmark-circle-outline"
              variant="primary"
              size="medium"
              onPress={handleSave}
              disabled={saving || validationErrors.length > 0}
              grow
            />
          </ECSOverlayFooter>
        }
      >
        <Animated.View style={[styles.stack, { transform: [{ translateX: profileGateShake }] }]}>
          <ECSCard variant="primary" style={styles.guidedCard}>
            <View style={styles.guidedHeader}>
              <View style={styles.guidedIcon}>
                <Ionicons name="sparkles-outline" size={18} color={TACTICAL.amber} />
              </View>
              <View style={styles.guidedCopy}>
                <Text style={styles.title}>Start with what you know</Text>
                <Text style={styles.copy}>Choose year, make, model, trim, engine, or drivetrain. Once the year, make, and model are entered, ECS will pre-fill the likely weights for confirmation.</Text>
              </View>
            </View>
            {prefillOptions.length > 0 ? (
              <View style={styles.presetRow}>
                {prefillOptions.map((option) => (
                  <TouchableOpacity key={option.id} style={styles.presetChip} onPress={() => handlePrefillOption(option.id)}>
                    <Text style={styles.presetText}>{option.label}</Text>
                    <Text style={styles.presetDetail}>{option.detail}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </ECSCard>

          <ECSPanel variant="secondary" style={styles.fieldPanel}>
            <View style={styles.fieldGrid}>
              <ProfileField label="Nickname" value={draft.nickname} onChangeText={(value) => updateDraft('nickname', value)} placeholder="Trail Lead" required />
              <ProfileField label="Year" value={draft.year} onChangeText={(value) => updateDraft('year', value)} placeholder="2024" keyboardType="numeric" required />
              <ProfileField label="Make" value={draft.make} onChangeText={(value) => updateDraft('make', value)} placeholder="RAM" required />
              <ProfileField label="Model" value={draft.model} onChangeText={(value) => updateDraft('model', value)} placeholder="2500" required />
              <ProfileField label="Trim" value={draft.trim} onChangeText={(value) => updateDraft('trim', value)} placeholder="Laramie" optional />
              <ProfileField label="Engine" value={draft.engine} onChangeText={(value) => updateDraft('engine', value)} placeholder="Cummins" />
              <ProfileField label="Drivetrain" value={draft.drivetrain} onChangeText={(value) => updateDraft('drivetrain', value)} placeholder="4x4" />
              <ProfileField label="Cab" value={draft.cab} onChangeText={(value) => updateDraft('cab', value)} placeholder="Crew Cab" />
              <ProfileField label="Bed" value={draft.bed} onChangeText={(value) => updateDraft('bed', value)} placeholder="Short Bed" />
            </View>
          </ECSPanel>

          <ECSPanel variant="secondary" style={styles.confirmPanel}>
            <View style={styles.confirmHeader}>
              <View>
                <Text style={styles.title}>Confirm specs</Text>
                <Text style={styles.copy}>{suggestion.confidenceExplanation}</Text>
              </View>
              <ECSBadge label={`${suggestion.baseNetWeight?.confidence ?? 0}% CONF`} tone={suggestion.baseNetWeight ? 'ready' : 'warning'} compact />
            </View>
            <View style={styles.specGrid}>
              <View style={styles.specTile}>
                <Text style={styles.fieldLabel}>BASE NET / EMPTY</Text>
                <Text style={styles.specValue}>{formatLbs(parseFleetProfileNumber(draft.baseNetWeight) ?? suggestion.baseNetWeight?.lbs)}</Text>
              </View>
              <View style={styles.specTile}>
                <Text style={styles.fieldLabel}>GVWR</Text>
                <Text style={styles.specValue}>{formatLbs(parseFleetProfileNumber(draft.gvwr) ?? suggestion.gvwr?.lbs)}</Text>
              </View>
              <View style={styles.specTile}>
                <Text style={styles.fieldLabel}>PAYLOAD REMAINING</Text>
                <Text style={styles.specValue}>{formatLbs(payloadRemaining)}</Text>
              </View>
            </View>
            {suggestion.oemReference ? (
              <View style={styles.oemReferenceCard}>
                <View style={styles.oemReferenceHeader}>
                  <View style={styles.oemReferenceTitleBlock}>
                    <Text style={styles.fieldLabel}>OEM REFERENCE</Text>
                    <Text style={styles.oemReferenceTitle}>{suggestion.oemReference.label}</Text>
                  </View>
                  <ECSBadge label={`${suggestion.oemReference.confidence}% REF`} tone="ready" compact />
                </View>
                <Text style={styles.copy}>{suggestion.oemReference.notes}</Text>
                <View style={styles.oemSpecGrid}>
                  <View style={styles.oemSpecTile}>
                    <Text style={styles.fieldLabel}>FUEL</Text>
                    <Text style={styles.oemSpecValue}>
                      {formatSpecNumber(suggestion.oemReference.specs.fuel_tank_capacity_gal, 'gal')}
                    </Text>
                  </View>
                  <View style={styles.oemSpecTile}>
                    <Text style={styles.fieldLabel}>CLEARANCE</Text>
                    <Text style={styles.oemSpecValue}>
                      {formatSpecNumber(suggestion.oemReference.specs.ground_clearance_inches, 'in')}
                    </Text>
                  </View>
                  <View style={styles.oemSpecTile}>
                    <Text style={styles.fieldLabel}>WHEELBASE</Text>
                    <Text style={styles.oemSpecValue}>
                      {formatSpecNumber(suggestion.oemReference.specs.wheelbase_in, 'in')}
                    </Text>
                  </View>
                  <View style={styles.oemSpecTile}>
                    <Text style={styles.fieldLabel}>WIDTH</Text>
                    <Text style={styles.oemSpecValue}>
                      {formatSpecNumber(suggestion.oemReference.specs.overall_width_in, 'in')}
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.oemReferenceCard}>
                <Text style={styles.fieldLabel}>OEM REFERENCE</Text>
                <Text style={styles.copy}>{suggestion.oemMessage}</Text>
              </View>
            )}
            <View style={styles.confirmActions}>
              <ECSButton label="Use ECS Estimate" icon="flash-outline" variant="secondary" size="compact" onPress={applySuggestedSpecs} grow />
              <ECSButton label="Advanced Specs" icon="options-outline" variant="tertiary" size="compact" onPress={openAdvancedSpecs} grow />
            </View>
            {validationErrors.length > 0 ? (
              <View style={styles.errorBox}>
                {validationErrors.map((error) => (
                  <Text key={error} style={styles.errorText}>{error}</Text>
                ))}
              </View>
            ) : null}
          </ECSPanel>
        </Animated.View>
      </ECSModalShell>

      <ECSModalShell
        visible={advancedVisible}
        onClose={closeAdvancedWithoutSaving}
        title="Advanced Specs"
        subtitle="Configure suspension, tires, and carried fluids for readiness and payload math."
        eyebrow="FLEET SETUP"
        icon="options-outline"
        stackBehavior="allow-stack"
        overlayClass="editor"
        maxWidth={720}
        maxHeightFraction={1}
        minHeightFraction={1}
        showHandle={false}
        scrollable
        footer={
          <ECSOverlayFooter>
            <ECSButton
              label={saving ? 'Saving...' : 'Done'}
              icon="checkmark-outline"
              variant="primary"
              size="medium"
              onPress={commitAdvancedSpecs}
              disabled={saving}
              grow
            />
          </ECSOverlayFooter>
        }
      >
        <View style={styles.stack}>
          <ECSPanel variant="warning" style={styles.advancedNotice}>
            <Text style={styles.copy}>These values feed ECS readiness, clearance, payload, and consumable weight calculations. Use X to close without saving changes.</Text>
          </ECSPanel>
          <ECSPanel variant="secondary" style={styles.setupPanel}>
            <SetupSelector
              label="Suspension height"
              helper="Total suspension lift. Stock is 0 inches."
              values={FLEET_ADVANCED_SUSPENSION_HEIGHT_OPTIONS}
              value={activeAdvancedDraft.suspensionLiftInches}
              onSelect={(value) => updateAdvancedSetupDraft({ suspensionLiftInches: value })}
              formatValue={(value) => (value === 0 ? 'Stock / 0 in' : `${value} in`)}
            />
          </ECSPanel>
          <ECSPanel variant="secondary" style={styles.setupPanel}>
            <View style={styles.selectorHeader}>
              <Text style={styles.title}>Leveling kit</Text>
              <Text style={styles.copy}>Level is a front suspension adjustment separate from total lift height.</Text>
            </View>
            <View style={styles.optionRow}>
              <OptionChip
                label="Not leveled"
                selected={!activeAdvancedDraft.isLeveled}
                onPress={() => updateAdvancedSetupDraft({ isLeveled: false, frontLevelInches: null })}
              />
              <OptionChip
                label="Level"
                selected={activeAdvancedDraft.isLeveled}
                onPress={() => updateAdvancedSetupDraft({ isLeveled: true, frontLevelInches: activeAdvancedDraft.frontLevelInches ?? 2 })}
              />
            </View>
            {activeAdvancedDraft.isLeveled ? (
              <SetupSelector
                label="Front suspension level"
                helper="Select how much the front suspension is raised."
                values={FLEET_ADVANCED_FRONT_LEVEL_OPTIONS}
                value={activeAdvancedDraft.frontLevelInches}
                onSelect={(value) => updateAdvancedSetupDraft({ frontLevelInches: value })}
                formatValue={(value) => `${value} in front`}
              />
            ) : null}
          </ECSPanel>
          <ECSPanel variant="secondary" style={styles.setupPanel}>
            <SetupSelector
              label="Tire size"
              helper="Diameter in inches."
              values={FLEET_ADVANCED_TIRE_SIZE_OPTIONS}
              value={activeAdvancedDraft.tireSizeInches}
              onSelect={(value) => updateAdvancedSetupDraft({ tireSizeInches: value })}
              formatValue={(value) => `${value} in`}
              horizontal
            />
          </ECSPanel>
          <ECSPanel variant="secondary" style={styles.setupPanel}>
            <View style={styles.fluidGrid}>
              <FluidSetupField
                label="Water gallons"
                value={activeAdvancedDraft.waterGallons}
                onChangeText={(value) => updateAdvancedSetupDraft({ waterGallons: value })}
                pounds={advancedWaterWeight}
                rateLabel={`${WATER_DENSITY_LB_PER_GAL} lb/gal`}
              />
              <FluidSetupField
                label="Fuel gallons"
                value={activeAdvancedDraft.fuelGallons}
                onChangeText={(value) => updateAdvancedSetupDraft({ fuelGallons: value })}
                pounds={advancedFuelWeight}
                rateLabel={`${FUEL_WEIGHT_PER_GAL[advancedFuelType]} lb/gal ${advancedFuelType}`}
              />
            </View>
          </ECSPanel>
          {advancedErrors.length > 0 ? (
            <View style={styles.errorBox}>
              {advancedErrors.map((error) => (
                <Text key={error} style={styles.errorText}>{error}</Text>
              ))}
            </View>
          ) : null}
          {saving ? <ActivityIndicator color={TACTICAL.amber} /> : null}
        </View>
      </ECSModalShell>
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 12,
  },
  guidedCard: {
    gap: 12,
  },
  guidedHeader: {
    flexDirection: 'row',
    gap: 10,
  },
  guidedIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ECS_STATUS.tone.selected.background,
  },
  guidedCopy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...ECS_TEXT.cardTitle,
  },
  copy: {
    ...ECS_TEXT.body,
    color: TACTICAL.textMuted,
    lineHeight: 18,
    marginTop: 5,
  },
  presetRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  presetChip: {
    flexGrow: 1,
    flexBasis: 220,
    borderWidth: 1,
    borderColor: ECS_STATUS.tone.selected.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    gap: 3,
    backgroundColor: ECS_STATUS.tone.selected.background,
  },
  presetText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.amber,
  },
  presetDetail: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
  },
  fieldPanel: {
    gap: 10,
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  field: {
    flexGrow: 1,
    flexBasis: 180,
    minWidth: 0,
    gap: 5,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  fieldLabel: {
    ...ECS_TEXT.statLabel,
  },
  requiredMark: {
    ...ECS_TEXT.statLabel,
    color: TACTICAL.danger,
    fontSize: 11,
    lineHeight: 11,
  },
  input: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    borderRadius: 10,
    paddingHorizontal: 11,
    color: TACTICAL.text,
    backgroundColor: ECS_SURFACE.background.compact,
    fontSize: 13,
    fontWeight: '700',
  },
  confirmPanel: {
    gap: 12,
  },
  confirmHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  specGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  specTile: {
    flexGrow: 1,
    flexBasis: 150,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 12,
    padding: 10,
    backgroundColor: ECS_SURFACE.background.quiet,
  },
  specValue: {
    ...ECS_TEXT.statValue,
    marginTop: 4,
  },
  oemReferenceCard: {
    borderWidth: 1,
    borderColor: ECS_STATUS.tone.selected.border,
    borderRadius: 12,
    padding: 10,
    gap: 8,
    backgroundColor: ECS_STATUS.tone.selected.background,
  },
  oemReferenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  oemReferenceTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  oemReferenceTitle: {
    ...ECS_TEXT.cardTitle,
    color: TACTICAL.text,
    marginTop: 2,
  },
  oemSpecGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  oemSpecTile: {
    flexGrow: 1,
    flexBasis: 118,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 10,
    padding: 8,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  oemSpecValue: {
    ...ECS_TEXT.statValue,
    fontSize: 14,
    marginTop: 3,
  },
  confirmActions: {
    flexDirection: 'row',
    gap: 8,
  },
  errorBox: {
    gap: 5,
  },
  errorText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.danger,
  },
  advancedNotice: {
    gap: 4,
  },
  setupPanel: {
    gap: 12,
  },
  selectorBlock: {
    gap: 10,
  },
  selectorHeader: {
    gap: 2,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  optionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scrollOptions: {
    paddingRight: 4,
  },
  optionChip: {
    minHeight: 40,
    minWidth: 72,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ECS_SURFACE.background.compact,
  },
  optionChipSelected: {
    borderColor: ECS_STATUS.tone.selected.border,
    backgroundColor: ECS_STATUS.tone.selected.background,
  },
  optionChipText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.text,
  },
  optionChipTextSelected: {
    color: TACTICAL.amber,
  },
  fluidGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  fluidField: {
    flexGrow: 1,
    flexBasis: 240,
    minWidth: 0,
    gap: 8,
  },
  calculatedTile: {
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 10,
    padding: 10,
    backgroundColor: ECS_SURFACE.background.quiet,
  },
  calculatedMeta: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    marginTop: 2,
  },
});
