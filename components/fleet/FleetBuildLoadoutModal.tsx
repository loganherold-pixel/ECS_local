import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSButton } from '../ECSButton';
import { ECSBadge } from '../ECSStatus';
import { ECSCard, ECSPanel } from '../ECSSurface';
import { TACTICAL } from '../../lib/theme';
import { ECS_TEXT } from '../../lib/ecsTypographyTokens';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { ECS_STATUS } from '../../lib/ecsStatusTokens';
import type { Vehicle } from '../../lib/types';
import { vehicleStore } from '../../lib/vehicleStore';
import { vehicleSpecStore } from '../../lib/vehicleSpecStore';
import { consumablesStore } from '../../lib/consumablesStore';
import { tiresLiftStore } from '../../lib/tiresLiftStore';
import { adaptLegacyVehicleToFleetVehicle } from '../../lib/fleet/fleetPremiumDomain';
import {
  FLEET_ACCESSORY_CATALOG,
  FLEET_ACCESSORY_KNOWLEDGE_OPTIONS,
  buildFleetAccessoryInstall,
  buildFleetCompartmentLoadoutItem,
  calculateFleetBuildLoadoutSummary,
  groupFleetCompartmentsByZone,
  normalizeFleetBuildLoadoutState,
  readFleetBuildLoadoutState,
  removeFleetAccessoryInstall,
  removeFleetCompartmentLoadoutItem,
  upsertFleetAccessoryInstall,
  upsertFleetCompartmentLoadoutItem,
  validateFleetCompartmentLoadoutDraft,
  type FleetAccessoryCatalogItem,
  type FleetAccessoryKnowledgeMode,
  type FleetAccessoryPermanence,
  type FleetBuildCompartment,
  type FleetBuildAccessoryInstall,
  type FleetBuildLoadoutState,
  type FleetCompartmentLoadoutItem,
  type FleetLoadoutPermanence,
} from '../../lib/fleet/fleetBuildLoadout';
import { FLEET_LOAD_ZONES, toFleetLoadZone, type FleetLoadZone, type FleetWeightSource } from '../../lib/fleet/fleetPremiumDomain';
import { emitFleetTelemetryEvent } from '../../lib/fleet/fleetTelemetryEvents';

type Props = {
  visible: boolean;
  vehicle: Vehicle | null;
  userId: string | null;
  onClose: () => void;
  onSaved?: () => void;
  showToast?: (message: string) => void;
};

type AccessoryDraft = {
  accessoryId: FleetAccessoryCatalogItem['id'];
  knowledgeMode: FleetAccessoryKnowledgeMode;
  brandModel: string;
  installedWeightLb: string;
  mountZone: FleetLoadZone;
  permanence: FleetAccessoryPermanence;
};

type LoadoutDraft = {
  id?: string;
  name: string;
  category: string;
  typicalWeightLb: string;
  quantity: string;
  compartmentId: string;
  loadZone: FleetLoadZone;
  permanence: FleetLoadoutPermanence;
  source: FleetWeightSource;
  confidence: string;
};

const DEFAULT_LOADOUT_CATEGORY = 'gear';
const DEFAULT_LOADOUT_PERMANENCE: FleetLoadoutPermanence = 'trip';

function formatLbs(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value).toLocaleString()} lb`;
}

function parseWeight(value: string): number | null {
  const parsed = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function createDraft(catalog: FleetAccessoryCatalogItem, install?: FleetBuildAccessoryInstall | null): AccessoryDraft {
  return {
    accessoryId: catalog.id,
    knowledgeMode: install?.knowledgeMode ?? 'estimate',
    brandModel: install?.brandModel ?? '',
    installedWeightLb: String(Math.round(install?.installedWeightLb ?? catalog.defaultWeightLb)),
    mountZone: install?.mountZone ?? catalog.mountZone,
    permanence: install?.permanence ?? catalog.permanence,
  };
}

export default function FleetBuildLoadoutModal({
  visible,
  vehicle,
  userId,
  onClose,
  onSaved,
  showToast,
}: Props) {
  const [state, setState] = useState<FleetBuildLoadoutState>(() => normalizeFleetBuildLoadoutState(null));
  const [editingCatalog, setEditingCatalog] = useState<FleetAccessoryCatalogItem | null>(null);
  const [draft, setDraft] = useState<AccessoryDraft | null>(null);
  const [editingLoadoutItem, setEditingLoadoutItem] = useState<FleetCompartmentLoadoutItem | null>(null);
  const [loadoutDraft, setLoadoutDraft] = useState<LoadoutDraft | null>(null);

  useEffect(() => {
    if (visible && vehicle) {
      setState(readFleetBuildLoadoutState(vehicle as any));
      setEditingCatalog(null);
      setDraft(null);
      setEditingLoadoutItem(null);
      setLoadoutDraft(null);
    }
  }, [vehicle, visible]);

  const fleetVehicle = useMemo(() => {
    if (!vehicle) return null;
    return adaptLegacyVehicleToFleetVehicle({
      vehicle,
      specs: vehicleSpecStore.get(vehicle.id) as any,
      consumables: consumablesStore.get(vehicle.id),
      tiresLift: tiresLiftStore.get(vehicle.id),
    });
  }, [vehicle]);

  const summary = useMemo(() => {
    if (!fleetVehicle) return null;
    return calculateFleetBuildLoadoutSummary(fleetVehicle, state);
  }, [fleetVehicle, state]);
  const activeCompartments = useMemo(
    () => state.compartments.filter((item) => item.status !== 'removed'),
    [state.compartments],
  );
  const compartmentGroups = useMemo(() => groupFleetCompartmentsByZone(state.compartments), [state.compartments]);
  const selectedDraftCompartment = useMemo(
    () => loadoutDraft ? activeCompartments.find((item) => item.id === loadoutDraft.compartmentId) ?? null : null,
    [activeCompartments, loadoutDraft],
  );
  const isCustomLoadoutDraft = selectedDraftCompartment?.accessoryId === 'custom_accessory';

  const openEditor = useCallback((catalog: FleetAccessoryCatalogItem) => {
    const existing = state.accessories.find((item) => item.accessoryId === catalog.id);
    setEditingCatalog(catalog);
    setDraft(createDraft(catalog, existing));
  }, [state.accessories]);

  const toggleAccessory = useCallback((catalog: FleetAccessoryCatalogItem) => {
    if (!vehicle) return;
    const installId = `${vehicle.id}:${catalog.id}`;
    const existing = state.accessories.find((item) => item.id === installId || item.accessoryId === catalog.id);
    if (existing) {
      setState((current) => removeFleetAccessoryInstall(current, existing.id));
      return;
    }
    const install = buildFleetAccessoryInstall({
      accessoryId: catalog.id,
      vehicleId: vehicle.id,
      knowledgeMode: 'estimate',
      mountZone: catalog.mountZone,
      permanence: catalog.permanence,
    });
    setState((current) => upsertFleetAccessoryInstall(current, install));
    emitFleetTelemetryEvent('fleet_accessory_added', {
      vehicleId: vehicle.id,
      meta: { accessoryId: install.accessoryId, weightLb: install.installedWeightLb },
    });
  }, [state.accessories, vehicle]);

  const closeEditor = useCallback(() => {
    setEditingCatalog(null);
    setDraft(null);
  }, []);

  const openLoadoutEditor = useCallback((compartment: FleetBuildCompartment, item?: FleetCompartmentLoadoutItem | null) => {
    const isCustomCompartment = compartment.accessoryId === 'custom_accessory';
    setEditingLoadoutItem(item ?? null);
    setLoadoutDraft({
      id: item?.id,
      name: item?.name ?? '',
      category: item?.category ?? (isCustomCompartment ? 'custom' : DEFAULT_LOADOUT_CATEGORY),
      typicalWeightLb: item ? String(item.typicalWeightLb) : '',
      quantity: item ? String(item.quantity) : '1',
      compartmentId: item?.compartmentId ?? compartment.id,
      loadZone: item?.loadZone ?? compartment.loadZone,
      permanence: item?.permanence ?? (isCustomCompartment ? 'trip' : DEFAULT_LOADOUT_PERMANENCE),
      source: item?.source ?? 'user_estimate',
      confidence: item ? String(item.confidence) : '62',
    });
  }, []);

  const closeLoadoutEditor = useCallback(() => {
    setEditingLoadoutItem(null);
    setLoadoutDraft(null);
  }, []);

  const saveEditor = useCallback(() => {
    if (!vehicle || !editingCatalog || !draft) return;
    const install = buildFleetAccessoryInstall({
      accessoryId: draft.accessoryId,
      vehicleId: vehicle.id,
      knowledgeMode: draft.knowledgeMode,
      brandModel: draft.brandModel,
      manualWeightLb: parseWeight(draft.installedWeightLb),
      mountZone: toFleetLoadZone(draft.mountZone),
      permanence: draft.permanence,
    });
    setState((current) => upsertFleetAccessoryInstall(current, install));
    emitFleetTelemetryEvent('fleet_accessory_added', {
      vehicleId: vehicle.id,
      meta: { accessoryId: install.accessoryId, weightLb: install.installedWeightLb },
    });
    closeEditor();
  }, [closeEditor, draft, editingCatalog, vehicle]);

  const removeAccessory = useCallback(() => {
    if (!vehicle || !editingCatalog) return;
    setState((current) => removeFleetAccessoryInstall(current, `${vehicle.id}:${editingCatalog.id}`));
    closeEditor();
  }, [closeEditor, editingCatalog, vehicle]);

  const handleSave = useCallback(async () => {
    if (!vehicle) return;
    const currentWizard = ((vehicle as any).wizard_config && typeof (vehicle as any).wizard_config === 'object')
      ? (vehicle as any).wizard_config
      : {};
    await vehicleStore.update(vehicle.id, {
      wizard_config: {
        ...currentWizard,
        fleet_build_loadout: state,
      },
    } as any, userId);
    showToast?.('Build & Loadout saved');
    onSaved?.();
    onClose();
  }, [onClose, onSaved, showToast, state, userId, vehicle]);

  const saveLoadoutItem = useCallback(() => {
    if (!vehicle || !loadoutDraft) return;
    const validationErrors = validateFleetCompartmentLoadoutDraft({
      name: loadoutDraft.name,
      typicalWeightLb: loadoutDraft.typicalWeightLb,
      quantity: loadoutDraft.quantity,
      compartmentId: loadoutDraft.compartmentId,
      loadZone: loadoutDraft.loadZone,
      activeCompartments,
    });
    if (validationErrors.length > 0) {
      showToast?.(validationErrors[0]);
      return;
    }
    const compartment = activeCompartments.find((item) => item.id === loadoutDraft.compartmentId);
    if (!compartment) {
      showToast?.('Choose a compartment before saving this item');
      return;
    }
    const item = buildFleetCompartmentLoadoutItem({
      vehicleId: vehicle.id,
      name: loadoutDraft.name,
      category: loadoutDraft.category,
      typicalWeightLb: parseWeight(loadoutDraft.typicalWeightLb) ?? 0,
      quantity: parseWeight(loadoutDraft.quantity) ?? 1,
      compartment,
      loadZone: compartment.accessoryId === 'custom_accessory' ? toFleetLoadZone(loadoutDraft.loadZone, compartment.loadZone) : compartment.loadZone,
      permanence: loadoutDraft.permanence,
      source: loadoutDraft.source,
      confidence: parseWeight(loadoutDraft.confidence) ?? 62,
      presetId: 'custom',
    });
    setState((current) => upsertFleetCompartmentLoadoutItem(current, editingLoadoutItem ? { ...item, id: editingLoadoutItem.id } : item));
    emitFleetTelemetryEvent('fleet_loadout_item_added', {
      vehicleId: vehicle.id,
      meta: { itemName: item.name, weightLb: item.typicalWeightLb, compartmentId: item.compartmentId },
    });
    closeLoadoutEditor();
  }, [activeCompartments, closeLoadoutEditor, editingLoadoutItem, loadoutDraft, showToast, vehicle]);

  const deleteLoadoutItem = useCallback(() => {
    if (!editingLoadoutItem) return;
    setState((current) => removeFleetCompartmentLoadoutItem(current, editingLoadoutItem.id));
    closeLoadoutEditor();
  }, [closeLoadoutEditor, editingLoadoutItem]);

  if (!vehicle) return null;

  return (
    <>
      <ECSModalShell
        visible={visible}
        onClose={onClose}
        title="Build & Loadout"
        subtitle="Add installed accessories, let ECS estimate weight, and create compartments for load planning."
        eyebrow="FLEET ACCESSORY FRAMEWORK"
        icon="car-sport-outline"
        overlayClass="workflow"
        maxWidth={1040}
        minHeightFraction={0.88}
        scrollable
        dismissOnBackdrop={false}
        allowSwipeDismiss={false}
        footer={
          <ECSOverlayFooter>
            <ECSButton label="Cancel" variant="tertiary" size="medium" onPress={onClose} grow />
            <ECSButton label="Save Build" icon="checkmark-circle-outline" variant="primary" size="medium" onPress={handleSave} grow />
          </ECSOverlayFooter>
        }
      >
        <View style={styles.stack}>
          <ECSPanel variant="secondary" style={styles.summaryPanel}>
            <View style={styles.summaryTile}>
              <Text style={styles.metricLabel}>ACCESSORY WEIGHT</Text>
              <Text style={styles.metricValue}>{formatLbs(summary?.accessoryWeightLb)}</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.metricLabel}>PAYLOAD REMAINING</Text>
              <Text style={styles.metricValue}>{formatLbs(summary?.weightResult.payloadRemaining?.lbs)}</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.metricLabel}>LOADOUT ITEMS</Text>
              <Text style={styles.metricValue}>{formatLbs(summary?.loadoutWeightLb)}</Text>
            </View>
            <View style={styles.summaryTile}>
              <Text style={styles.metricLabel}>COMPARTMENTS</Text>
              <Text style={styles.metricValue}>{summary?.activeCompartmentCount ?? 0}</Text>
            </View>
          </ECSPanel>

          <View style={styles.tileGrid}>
            {FLEET_ACCESSORY_CATALOG.map((catalog) => {
              const install = state.accessories.find((item) => item.accessoryId === catalog.id);
              return (
                <TouchableOpacity
                  key={catalog.id}
                  activeOpacity={0.82}
                  onPress={() => toggleAccessory(catalog)}
                  onLongPress={() => openEditor(catalog)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: Boolean(install) }}
                  accessibilityLabel={`${install ? 'Remove' : 'Add'} ${catalog.label}`}
                  style={styles.tilePressable}
                >
                  <ECSCard variant={install ? 'secondary' : 'compact'} selected={Boolean(install)} style={styles.accessoryTile}>
                    <View style={styles.tileHeader}>
                      <ECSBadge label={install ? 'INSTALLED' : 'ADD'} tone={install ? 'ready' : 'info'} compact />
                    </View>
                    <Text style={styles.tileTitle} numberOfLines={2}>{catalog.label}</Text>
                    <Text style={styles.tileMeta} numberOfLines={2}>
                      {install
                        ? `ECS estimated this at ${Math.round(install.installedWeightLb)} lb`
                        : `Default ${Math.round(catalog.defaultWeightLb)} lb`}
                    </Text>
                    {install ? <Text style={styles.tileMeta} numberOfLines={1}>{`${install.confidence}% confidence`}</Text> : null}
                  </ECSCard>
                </TouchableOpacity>
              );
            })}
          </View>
          <ECSPanel variant="secondary" style={styles.loadoutPanel}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>Compartment Loadout</Text>
                <Text style={styles.tileMeta}>Assign normally carried gear to the compartment where it lives.</Text>
              </View>
            </View>
            <View style={styles.compartmentGroupStack}>
              {compartmentGroups.map((group) => (
                <ECSPanel key={group.id} variant="compact" style={styles.compartmentGroup}>
                  <Text style={styles.groupTitle}>{group.label}</Text>
                  {group.compartments.length === 0 ? (
                    <Text style={styles.tileMeta}>No compartments yet</Text>
                  ) : group.compartments.map((compartment) => {
                    const items = (state.loadoutItems ?? []).filter((item) => item.compartmentId === compartment.id);
                    const isCustomCompartment = compartment.accessoryId === 'custom_accessory';
                    return (
                      <View key={compartment.id} style={[styles.compartmentRow, isCustomCompartment && styles.customCompartmentRow]}>
                        <View style={styles.compartmentCopy}>
                          <View style={styles.compartmentTitleRow}>
                            <Text style={styles.compartmentName} numberOfLines={2}>{compartment.name}</Text>
                            {isCustomCompartment ? <ECSBadge label="CUSTOM" tone="info" compact /> : null}
                          </View>
                          {items.map((item) => (
                            <TouchableOpacity key={item.id} onPress={() => openLoadoutEditor(compartment, item)}>
                              <Text style={styles.itemText} numberOfLines={2}>{item.name} · {formatLbs(item.typicalWeightLb * item.quantity)}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={styles.compartmentAction}>
                          <ECSButton
                            label="Add Item"
                            icon="add-circle-outline"
                            variant={isCustomCompartment ? 'secondary' : 'tertiary'}
                            size="compact"
                            accessibilityLabel={`Add custom loadout item to ${compartment.name}`}
                            onPress={() => openLoadoutEditor(compartment)}
                          />
                        </View>
                      </View>
                    );
                  })}
                </ECSPanel>
              ))}
            </View>
          </ECSPanel>
        </View>
      </ECSModalShell>

      <ECSModalShell
        visible={Boolean(editingCatalog && draft)}
        onClose={closeEditor}
        title={editingCatalog?.label ?? 'Accessory'}
        subtitle="Do you know brand/model?"
        eyebrow="ACCESSORY EDIT"
        icon={(editingCatalog?.icon ?? 'cube-outline') as any}
        stackBehavior="allow-stack"
        overlayClass="editor"
        maxWidth={720}
        scrollable
        footer={
          <ECSOverlayFooter>
            {editingCatalog && state.accessories.some((item) => item.accessoryId === editingCatalog.id) ? (
              <ECSButton label="Remove" icon="trash-outline" variant="destructive" size="medium" onPress={removeAccessory} grow />
            ) : null}
            <ECSButton label="Save Accessory" icon="checkmark-outline" variant="primary" size="medium" onPress={saveEditor} grow />
          </ECSOverlayFooter>
        }
      >
        {draft && editingCatalog ? (
          <View style={styles.stack}>
            <View style={styles.optionGrid}>
              {FLEET_ACCESSORY_KNOWLEDGE_OPTIONS.map((option) => (
                <TouchableOpacity
                  key={option.id}
                  style={[styles.option, draft.knowledgeMode === option.id && styles.optionActive]}
                  onPress={() => setDraft((current) => current ? ({ ...current, knowledgeMode: option.id }) : current)}
                >
                  <Text style={[styles.optionText, draft.knowledgeMode === option.id && styles.optionTextActive]}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.fieldGrid}>
              <View style={styles.field}>
                <Text style={styles.metricLabel}>BRAND / MODEL</Text>
                <TextInput
                  value={draft.brandModel}
                  onChangeText={(value) => setDraft((current) => current ? ({ ...current, brandModel: value }) : current)}
                  placeholder="Optional"
                  placeholderTextColor={TACTICAL.textMuted}
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.metricLabel}>INSTALLED WEIGHT LB</Text>
                <TextInput
                  value={draft.installedWeightLb}
                  onChangeText={(value) => setDraft((current) => current ? ({ ...current, installedWeightLb: value }) : current)}
                  keyboardType="numeric"
                  placeholder={String(editingCatalog.defaultWeightLb)}
                  placeholderTextColor={TACTICAL.textMuted}
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.metricLabel}>MOUNT ZONE</Text>
                <TextInput
                  value={draft.mountZone}
                  onChangeText={(value) => setDraft((current) => current ? ({ ...current, mountZone: toFleetLoadZone(value) }) : current)}
                  placeholder={editingCatalog.mountZone}
                  placeholderTextColor={TACTICAL.textMuted}
                  style={styles.input}
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.metricLabel}>PERMANENCE</Text>
                <TextInput
                  value={draft.permanence}
                  onChangeText={(value) => setDraft((current) => current ? ({ ...current, permanence: value === 'temporary' || value === 'seasonal' ? value : 'permanent' }) : current)}
                  placeholder={editingCatalog.permanence}
                  placeholderTextColor={TACTICAL.textMuted}
                  style={styles.input}
                />
              </View>
            </View>
            <ECSPanel variant="warning" style={styles.estimatePanel}>
              <Text style={styles.estimateText}>
                ECS estimated this at {Math.round(parseWeight(draft.installedWeightLb) ?? editingCatalog.defaultWeightLb)} lb. Confidence improves when you add brand/model or a verified weight.
              </Text>
            </ECSPanel>
          </View>
        ) : null}
      </ECSModalShell>

      <ECSModalShell
        visible={Boolean(loadoutDraft)}
        onClose={closeLoadoutEditor}
        title={editingLoadoutItem ? 'Edit Loadout Item' : 'Add Loadout Item'}
        subtitle="What is normally carried, and where does it live?"
        eyebrow="COMPARTMENT LOADOUT"
        icon="briefcase-outline"
        stackBehavior="allow-stack"
        overlayClass="editor"
        maxWidth={720}
        scrollable
        footer={
          <ECSOverlayFooter>
            <ECSButton label="Cancel" variant="tertiary" size="medium" onPress={closeLoadoutEditor} grow />
            {editingLoadoutItem ? (
              <ECSButton label="Remove" icon="trash-outline" variant="destructive" size="medium" onPress={deleteLoadoutItem} grow />
            ) : null}
            <ECSButton label="Save Item" icon="checkmark-outline" variant="primary" size="medium" onPress={saveLoadoutItem} grow />
          </ECSOverlayFooter>
        }
      >
        {loadoutDraft ? (
          <View style={styles.stack}>
            <View style={styles.fieldGrid}>
              <View style={styles.field}>
                <Text style={styles.metricLabel}>ITEM NAME</Text>
                <TextInput value={loadoutDraft.name} onChangeText={(value) => setLoadoutDraft((current) => current ? ({ ...current, name: value }) : current)} placeholder="Tool bag" placeholderTextColor={TACTICAL.textMuted} style={styles.input} />
              </View>
              <View style={styles.field}>
                <Text style={styles.metricLabel}>ITEM WEIGHT LB</Text>
                <TextInput value={loadoutDraft.typicalWeightLb} onChangeText={(value) => setLoadoutDraft((current) => current ? ({ ...current, typicalWeightLb: value }) : current)} keyboardType="numeric" placeholder="25" placeholderTextColor={TACTICAL.textMuted} style={styles.input} />
              </View>
              <View style={styles.field}>
                <Text style={styles.metricLabel}>QUANTITY</Text>
                <TextInput value={loadoutDraft.quantity} onChangeText={(value) => setLoadoutDraft((current) => current ? ({ ...current, quantity: value }) : current)} keyboardType="numeric" placeholder="1" placeholderTextColor={TACTICAL.textMuted} style={styles.input} />
              </View>
              {!isCustomLoadoutDraft ? (
                <>
                  <View style={styles.field}>
                    <Text style={styles.metricLabel}>CATEGORY</Text>
                    <TextInput value={loadoutDraft.category} onChangeText={(value) => setLoadoutDraft((current) => current ? ({ ...current, category: value }) : current)} placeholder="tools" placeholderTextColor={TACTICAL.textMuted} style={styles.input} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.metricLabel}>PERMANENCE</Text>
                    <TextInput value={loadoutDraft.permanence} onChangeText={(value) => setLoadoutDraft((current) => current ? ({ ...current, permanence: value as FleetLoadoutPermanence }) : current)} placeholder="trip" placeholderTextColor={TACTICAL.textMuted} style={styles.input} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.metricLabel}>SOURCE</Text>
                    <TextInput value={loadoutDraft.source} onChangeText={(value) => setLoadoutDraft((current) => current ? ({ ...current, source: value as FleetWeightSource }) : current)} placeholder="user_estimate" placeholderTextColor={TACTICAL.textMuted} style={styles.input} />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.metricLabel}>CONFIDENCE</Text>
                    <TextInput value={loadoutDraft.confidence} onChangeText={(value) => setLoadoutDraft((current) => current ? ({ ...current, confidence: value }) : current)} keyboardType="numeric" placeholder="62" placeholderTextColor={TACTICAL.textMuted} style={styles.input} />
                  </View>
                </>
              ) : null}
            </View>
            <View style={styles.compartmentPicker}>
              <Text style={styles.metricLabel}>PLACEMENT / COMPARTMENT</Text>
              <View style={styles.compartmentPickerGrid}>
                {activeCompartments.length > 0 ? activeCompartments.map((compartment) => (
                  <TouchableOpacity
                    key={compartment.id}
                    style={[styles.compartmentPickerChip, loadoutDraft.compartmentId === compartment.id && styles.optionActive]}
                    onPress={() => setLoadoutDraft((current) => current ? ({
                      ...current,
                      compartmentId: compartment.id,
                      loadZone: compartment.loadZone,
                    }) : current)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: loadoutDraft.compartmentId === compartment.id }}
                    accessibilityLabel={`Place item in ${compartment.name}`}
                  >
                    <Text style={[styles.compartmentPickerText, loadoutDraft.compartmentId === compartment.id && styles.optionTextActive]}>{compartment.name}</Text>
                  </TouchableOpacity>
                )) : (
                  <Text style={styles.tileMeta}>Add an accessory with compartments before assigning loadout placement.</Text>
                )}
              </View>
            </View>
            {selectedDraftCompartment?.accessoryId === 'custom_accessory' ? (
              <View style={styles.compartmentPicker}>
                <Text style={styles.metricLabel}>VEHICLE LOCATION</Text>
                <View style={styles.compartmentPickerGrid}>
                  {FLEET_LOAD_ZONES.map((zone) => (
                    <TouchableOpacity
                      key={zone}
                      style={[styles.locationChip, loadoutDraft.loadZone === zone && styles.optionActive]}
                      onPress={() => setLoadoutDraft((current) => current ? ({ ...current, loadZone: zone }) : current)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: loadoutDraft.loadZone === zone }}
                      accessibilityLabel={`Place custom item in ${zone}`}
                    >
                      <Text style={[styles.compartmentPickerText, loadoutDraft.loadZone === zone && styles.optionTextActive]}>{zone}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : null}
          </View>
        ) : null}
      </ECSModalShell>
    </>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10,
  },
  summaryPanel: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryTile: {
    flexGrow: 1,
    flexBasis: 132,
    gap: 3,
  },
  metricLabel: {
    ...ECS_TEXT.statLabel,
  },
  metricValue: {
    ...ECS_TEXT.statValue,
  },
  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tilePressable: {
    flexGrow: 1,
    flexBasis: 182,
    minWidth: 0,
  },
  accessoryTile: {
    minHeight: 116,
    gap: 7,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  tileTitle: {
    ...ECS_TEXT.cardTitle,
    lineHeight: 18,
  },
  tileMeta: {
    ...ECS_TEXT.helper,
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
  optionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  option: {
    flexGrow: 1,
    flexBasis: 160,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    backgroundColor: ECS_SURFACE.background.quiet,
  },
  optionActive: {
    borderColor: ECS_STATUS.tone.selected.border,
    backgroundColor: ECS_STATUS.tone.selected.background,
  },
  optionText: {
    ...ECS_TEXT.button,
    color: TACTICAL.textMuted,
  },
  optionTextActive: {
    color: TACTICAL.amber,
  },
  loadoutPanel: {
    gap: 10,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    ...ECS_TEXT.cardTitle,
  },
  compartmentGroupStack: {
    gap: 7,
  },
  compartmentGroup: {
    gap: 7,
  },
  groupTitle: {
    ...ECS_TEXT.sectionTitle,
    color: TACTICAL.amber,
  },
  compartmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
    paddingTop: 7,
  },
  customCompartmentRow: {
    borderWidth: 1,
    borderTopWidth: 1,
    borderColor: ECS_STATUS.tone.selected.border,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingBottom: 8,
    backgroundColor: ECS_STATUS.tone.selected.background,
  },
  compartmentCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  compartmentTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  compartmentName: {
    ...ECS_TEXT.body,
    color: TACTICAL.text,
    fontWeight: '800',
    flexShrink: 1,
  },
  compartmentAction: {
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'flex-end',
    minWidth: 120,
  },
  itemText: {
    ...ECS_TEXT.helper,
    color: TACTICAL.amber,
    lineHeight: 16,
  },
  fieldGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  compartmentPicker: {
    gap: 8,
  },
  compartmentPickerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  compartmentPickerChip: {
    flexGrow: 1,
    flexBasis: 160,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: ECS_SURFACE.background.quiet,
  },
  locationChip: {
    flexGrow: 1,
    flexBasis: 92,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: ECS_SURFACE.background.quiet,
    alignItems: 'center',
  },
  compartmentPickerText: {
    ...ECS_TEXT.chip,
    color: TACTICAL.text,
  },
  field: {
    flexGrow: 1,
    flexBasis: 190,
    gap: 5,
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
  estimatePanel: {
    gap: 4,
  },
  estimateText: {
    ...ECS_TEXT.body,
    color: TACTICAL.text,
    lineHeight: 18,
  },
});
