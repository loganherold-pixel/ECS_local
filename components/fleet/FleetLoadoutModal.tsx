/**
 * FleetLoadoutModal — Full-screen modal for editing a vehicle's loadout
 * from the Fleet tab.
 *
 * Opened when the user taps "LOADOUT" on a vehicle card in Fleet.
 * Pre-populates container zones from the vehicle's existing accessory framework.
 * Uses LoadoutWizardStep in 'fleet-edit' mode with CLOSE | SAVE footer.
 *
 * If the vehicle has no accessory framework / container zones, shows
 * an appropriate empty state with guidance.
 *
 * FIX (Part 2): When the modal opens, it now re-fetches the vehicle from
 * vehicleStore.getById() to ensure it has the latest containerZones and
 * accessoryFramework data. This prevents the stale-state bug where the
 * vehicle prop from Fleet's state hasn't been refreshed yet after wizard
 * completion.
 */
import React, { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import ECSModalShell from '../ECSModalShell';
import { TACTICAL } from '../../lib/theme';
import { hapticMicro } from '../../lib/haptics';
import type { Vehicle } from '../../lib/types';
import type { AccessoryFramework, ContainerZone } from '../../lib/accessoryFramework';
import { generateContainerZonesFromAccessories, generateContainerZonesFromSelections } from '../../lib/accessoryFramework';
import type { AccessorySelections } from '../vehicle-wizard/AccessoryConfigStep';
import LoadoutWizardStep from '../vehicle-wizard/LoadoutWizardStep';
import { vehicleStore } from '../../lib/vehicleStore';


// ── ECS Gold Constants ──────────────────────────────────────
const TAG = '[FleetLoadoutModal]';

// ── Props ───────────────────────────────────────────────────
interface Props {
  /** Whether the modal is visible */
  visible: boolean;
  /** The vehicle to edit loadout for */
  vehicle: Vehicle | null;
  /** User ID for data persistence */
  userId: string | null;
  /** Called when modal should close */
  onClose: () => void;
  /** Called after successful save */
  onSaved?: () => void;
  /** Show toast message */
  showToast?: (msg: string) => void;
}

/**
 * Extract container zones from a vehicle object using the three-tier fallback.
 * Extracted as a pure function so it can be called with either the prop vehicle
 * or the freshly-fetched vehicle from vehicleStore.
 */
function extractContainerZones(vehicle: Vehicle | null): ContainerZone[] {
  if (!vehicle) return [];

  const vAny = vehicle as any;

  // Tier 1: Use persisted containerZones directly
  if (vAny.containerZones && Array.isArray(vAny.containerZones) && vAny.containerZones.length > 0) {
    console.log(TAG, 'Using persisted containerZones:', vAny.containerZones.length);
    return vAny.containerZones;
  }

  // Tier 2: Regenerate from accessoryFramework
  if (vAny.accessoryFramework) {
    try {
      const zones = generateContainerZonesFromAccessories(vAny.accessoryFramework as AccessoryFramework);
      if (zones.length > 0) {
        console.log(TAG, 'Regenerated zones from accessoryFramework:', zones.length);
        return zones;
      }
    } catch (e) {
      console.warn(TAG, 'Failed to generate zones from framework:', e);
    }
  }

  // Tier 3: Parse _accessories from wizard_config and rebuild
  const wizConfig = vAny.wizard_config;
  if (wizConfig && typeof wizConfig === 'object' && wizConfig._accessories) {
    try {
      const parsed: AccessorySelections = JSON.parse(wizConfig._accessories);
      const zones = generateContainerZonesFromSelections(parsed);
      if (zones.length > 0) {
        console.log(TAG, 'Rebuilt zones from wizard_config._accessories:', zones.length);
        return zones;
      }
    } catch (e) {
      console.warn(TAG, 'Failed to parse _accessories from wizard_config:', e);
    }
  }

  console.warn(TAG, 'No container zone data found on vehicle:', vehicle.id);
  return [];
}

export default function FleetLoadoutModal({
  visible,
  vehicle,
  userId,
  onClose,
  onSaved,
  showToast,
}: Props) {
  const [saving, setSaving] = useState(false);

  // ── Fresh vehicle state ───────────────────────────────────
  // When the modal opens, we re-fetch the vehicle from vehicleStore
  // to ensure we have the latest containerZones/accessoryFramework.
  // This prevents the stale-state bug where the vehicle prop from
  // Fleet's state hasn't been refreshed yet after wizard completion.
  const [freshVehicle, setFreshVehicle] = useState<Vehicle | null>(null);
  const prevVisibleRef = useRef(false);

  useEffect(() => {
    // Detect modal opening (visible transitions from false → true)
    if (visible && !prevVisibleRef.current && vehicle?.id) {
      console.log(TAG, `Modal opening for vehicle ${vehicle.id}, fetching fresh data`);
      // Re-fetch from vehicleStore (reads directly from localStorage)
      const fresh = vehicleStore.getById(vehicle.id);
      if (fresh) {
        console.log(TAG, `Fresh vehicle fetched, containerZones:`, (fresh as any).containerZones?.length ?? 0);
        setFreshVehicle(fresh);
      } else {
        // Fallback to prop if not found in store (shouldn't happen)
        console.warn(TAG, `Vehicle ${vehicle.id} not found in vehicleStore, using prop`);
        setFreshVehicle(vehicle);
      }
    }

    // When modal closes, clear fresh vehicle state
    if (!visible && prevVisibleRef.current) {
      setFreshVehicle(null);
    }

    prevVisibleRef.current = visible;
  }, [visible, vehicle]);

  // ── Resolved vehicle: prefer fresh from store, fallback to prop ──
  const resolvedVehicle = freshVehicle || vehicle;

  // ── Extract container zones from resolved vehicle ──────────
  const containerZones = useMemo<ContainerZone[]>(() => {
    return extractContainerZones(resolvedVehicle);
  }, [resolvedVehicle]);

  // ── Handle Save ───────────────────────────────────────────
  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      // Items are already persisted by LoadoutWizardStep's item handlers.
      // The save action here is a confirmation + close.
      await new Promise(resolve => setTimeout(resolve, 300)); // Brief UX delay
      showToast?.('Loadout saved');
      onSaved?.();
      onClose();
    } catch (e) {
      console.error(TAG, 'Save error:', e);
      showToast?.('Failed to save loadout');
    } finally {
      setSaving(false);
    }
  }, [onClose, onSaved, showToast]);

  // ── Handle Close ──────────────────────────────────────────
  const handleClose = useCallback(() => {
    hapticMicro();
    onClose();
  }, [onClose]);

  if (!resolvedVehicle) return null;

  return (
    <ECSModalShell
      visible={visible}
      onClose={handleClose}
      title="Configure Loadout"
      subtitle="Review storage zones, update carried gear, and save this rig back to Fleet."
      icon="cube-outline"
      eyebrow="FLEET LOADOUT"
      overlayClass="workflow"
      maxWidth={980}
      maxHeightFraction={0.95}
      minHeightFraction={0.9}
      scrollable={false}
      dismissOnBackdrop={false}
      allowSwipeDismiss={false}
      headerRight={
        <View style={styles.vehicleBadge}>
          <Ionicons name="car-outline" size={10} color={TACTICAL.amber} />
          <Text style={styles.vehicleBadgeText} numberOfLines={1}>
            {resolvedVehicle.name}
          </Text>
        </View>
      }
      bodyStyle={styles.modalContainer}
      contentContainerStyle={styles.modalBody}
    >
      <LoadoutWizardStep
        mode="fleet-edit"
        prebuiltContainerZones={containerZones}
        vehicleId={resolvedVehicle.id}
        userId={userId}
        onSave={handleSave}
        onClose={handleClose}
        saving={saving}
        vehicleName={resolvedVehicle.name}
        showToast={showToast}
      />
    </ECSModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#0B0F12',
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
    padding: 0,
  },
  vehicleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    maxWidth: 120,
  },
  vehicleBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 0.5,
  },
});



