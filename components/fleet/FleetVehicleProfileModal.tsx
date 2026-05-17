import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  FLEET_PROFILE_PRESETS,
  applyFleetProfilePreset,
  calculateConfirmedPayloadRemaining,
  createEmptyFleetVehicleProfileDraft,
  parseFleetProfileNumber,
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

function resolveFuelType(vehicle: Vehicle | null): FuelType {
  if (!vehicle) return 'gas';
  const spec = vehicleSpecStore.get(vehicle.id);
  if (spec?.fuel_type === 'diesel' || spec?.fuel_type === 'gas') return spec.fuel_type;
  const vehicleFuelType = (vehicle as any).fuel_type;
  if (vehicleFuelType === 'diesel' || vehicleFuelType === 'gas') return vehicleFuelType;
  const engine = String(spec?.engine ?? (vehicle as any).wizard_config?.engine ?? '').toLowerCase();
  return engine.includes('diesel') || engine.includes('cummins') ? 'diesel' : 'gas';
}

function buildAdvancedSetupDraft(vehicle: Vehicle | null): FleetAdvancedSpecsDraft {
  if (!vehicle) {
    return {
      suspensionLiftInches: 0,
      isLeveled: false,
      frontLevelInches: null,
      tireSizeInches: null,
      waterGallons: '0',
      fuelGallons: '0',
    };
  }

  const tiresLift = tiresLiftStore.get(vehicle.id);
  const consumables = consumablesStore.get(vehicle.id);
  const spec = vehicleSpecStore.get(vehicle.id);
  const fuelTankCapacity = spec?.fuel_tank_capacity_gal ?? vehicle.fuel_tank_capacity_gal ?? 0;
  const currentFuelGallons =
    consumables.fuel_gal_current != null
      ? consumables.fuel_gal_current
      : fuelTankCapacity > 0
        ? fuelTankCapacity * ((consumables.fuel_percent_current ?? 100) / 100)
        : 0;

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
    waterGallons: formatFleetAdvancedGallonsInput(consumables.water_gal_current ?? vehicle.current_water_gal ?? 0),
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
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric';
  optional?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}{optional ? ' OPTIONAL' : ''}</Text>
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
  const validationErrors = useMemo(() => validateFleetVehicleProfileDraft(draft), [draft]);
  const payloadRemaining = useMemo(() => calculateConfirmedPayloadRemaining(draft), [draft]);

  const updateDraft = useCallback((key: keyof FleetVehicleProfileDraft, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const updateAdvancedSetupDraft = useCallback((patch: Partial<FleetAdvancedSpecsDraft>) => {
    setAdvancedErrors([]);
    setAdvancedDraft((current) => ({ ...(current ?? buildAdvancedSetupDraft(vehicle)), ...patch }));
  }, [vehicle]);

  const openAdvancedSpecs = useCallback(() => {
    setAdvancedDraft(buildAdvancedSetupDraft(vehicle));
    setAdvancedErrors([]);
    setAdvancedVisible(true);
  }, [vehicle]);

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
    }));
  }, [suggestion.baseNetWeight, suggestion.gvwr]);

  const handlePreset = useCallback((presetId: string) => {
    setDraft((current) => applyFleetProfilePreset(current, presetId));
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
    const baseWeight = parseFleetProfileNumber(draft.baseNetWeight) ?? 0;
    const gvwr = parseFleetProfileNumber(draft.gvwr) ?? 0;
    const fuelType: FuelType =
      draft.engine.toLowerCase().includes('cummins') || draft.engine.toLowerCase().includes('diesel')
        ? 'diesel'
        : 'gas';
    const wizardConfig = {
      vehicle_type: draft.vehicleType || 'truck',
      trim: draft.trim.trim(),
      engine: draft.engine.trim(),
      drivetrain: draft.drivetrain.trim(),
      cab: draft.cab.trim(),
      bed: draft.bed.trim(),
      bed_length: draft.bed.trim(),
      weight_source: suggestion.baseNetWeight?.source ?? 'user_estimate',
      weight_confidence: suggestion.baseNetWeight?.confidence ?? 62,
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
          type: draft.vehicleType || 'truck',
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

    vehicleSpecStore.update(savedVehicle.id, {
      gvwr_lb: gvwr,
      base_weight_lb: baseWeight,
      fuel_tank_capacity_gal: vehicleSpecStore.get(savedVehicle.id)?.fuel_tank_capacity_gal ?? 0,
      fuel_type: fuelType,
      front_base_weight_lb: parseFleetProfileNumber(draft.frontBaseWeight) ?? undefined,
      rear_base_weight_lb: parseFleetProfileNumber(draft.rearBaseWeight) ?? undefined,
      front_gawr_lb: parseFleetProfileNumber(draft.frontGawr) ?? undefined,
      rear_gawr_lb: parseFleetProfileNumber(draft.rearGawr) ?? undefined,
      trim: draft.trim.trim(),
      engine: draft.engine.trim(),
      drivetrain: draft.drivetrain.trim(),
      cab: draft.cab.trim(),
      bed_length: draft.bed.trim(),
    } as any);

    const persisted = await vehicleStore.update(savedVehicle.id, {
      type: draft.vehicleType || 'truck',
      wizard_config: wizardConfig,
      base_weight_lb: baseWeight || null,
      gvwr_lb: gvwr || null,
      fuel_type: fuelType,
      front_base_weight_lb: parseFleetProfileNumber(draft.frontBaseWeight),
      rear_base_weight_lb: parseFleetProfileNumber(draft.rearBaseWeight),
      front_gawr_lb: parseFleetProfileNumber(draft.frontGawr),
      rear_gawr_lb: parseFleetProfileNumber(draft.rearGawr),
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
  }, [draft, suggestion.baseNetWeight, userId, vehicle]);

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

  const activeAdvancedDraft = advancedDraft ?? buildAdvancedSetupDraft(vehicle);
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
        minHeightFraction={0.86}
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
        <View style={styles.stack}>
          <ECSCard variant="primary" style={styles.guidedCard}>
            <View style={styles.guidedHeader}>
              <View style={styles.guidedIcon}>
                <Ionicons name="sparkles-outline" size={18} color={TACTICAL.amber} />
              </View>
              <View style={styles.guidedCopy}>
                <Text style={styles.title}>Start with what you know</Text>
                <Text style={styles.copy}>Choose a preset or enter year, make, model, trim, engine, and drivetrain. ECS will prefill likely weights for confirmation.</Text>
              </View>
            </View>
            <View style={styles.presetRow}>
              {FLEET_PROFILE_PRESETS.map((preset) => (
                <TouchableOpacity key={preset.id} style={styles.presetChip} onPress={() => handlePreset(preset.id)}>
                  <Text style={styles.presetText}>{preset.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ECSCard>

          <ECSPanel variant="secondary" style={styles.fieldPanel}>
            <View style={styles.fieldGrid}>
              <ProfileField label="Nickname" value={draft.nickname} onChangeText={(value) => updateDraft('nickname', value)} placeholder="Trail Lead" />
              <ProfileField label="Year" value={draft.year} onChangeText={(value) => updateDraft('year', value)} placeholder="2024" keyboardType="numeric" />
              <ProfileField label="Make" value={draft.make} onChangeText={(value) => updateDraft('make', value)} placeholder="RAM" />
              <ProfileField label="Model" value={draft.model} onChangeText={(value) => updateDraft('model', value)} placeholder="2500" />
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
        </View>
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
    borderWidth: 1,
    borderColor: ECS_STATUS.tone.selected.border,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: ECS_STATUS.tone.selected.background,
  },
  presetText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.amber,
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
  fieldLabel: {
    ...ECS_TEXT.statLabel,
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
