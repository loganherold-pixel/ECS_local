/**
 * LoadoutWizardStep — Step 4 (Final) of the Vehicle Configuration Wizard
 *
 * LOADOUT CONFIGURATION (Accessory-Driven)
 *   Displays container zones generated from Step 3 (Accessory Framework).
 *   Users can tap containers to add cargo items.
 *   Each container from the Accessory Framework dictates where items go.
 *
 * MODES:
 *   'wizard'     — Used during initial vehicle setup.
 *                  Footer: BACK | SKIP | DEPLOY VEHICLE
 *   'fleet-edit' — Used from Fleet tab for post-setup loadout editing.
 *                  Footer: CLOSE | SAVE
 *
 * If skipped during wizard, user can return via Fleet vehicle edit.
 *
 * FIX (Part 2): 
 *   - initLoadout now uses loadoutStore.getByVehicleId() instead of getAll()
 *     to ensure the correct vehicle's loadout is loaded.
 *   - initLoadout re-runs when vehicleId changes (not just on mount).
 *   - When an existing loadout is found but not linked to the current vehicle,
 *     it's updated to link to the vehicle.
 *   - containerZones are re-derived when prebuiltContainerZones change.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { hapticMicro, hapticCommand } from '../../lib/haptics';

import type { AccessorySelections } from './AccessoryConfigStep';
import {
  buildAccessoryFramework,
  generateContainerZonesFromAccessories,
  type ContainerZone,
} from '../../lib/accessoryFramework';
import ContainerGrid from '../loadout2/ContainerGrid';
import ContainerDetailSheet from '../loadout2/ContainerDetailSheet';
import type { AddItemPayload } from '../loadout2/AddItemModal';
import { loadoutStore, loadoutItemStore, type LocalLoadout } from '../../lib/loadoutStore';
import type { LoadoutItem } from '../../lib/types';
import {
  getTotalLoadoutWeight,
} from '../../lib/loadout2Types';

// ── ECS Gold Constants ──────────────────────────────────────
const ECS_GOLD = '#C48A2C';
const TAG = '[LoadoutWizardStep]';

function logLoadoutWizardDev(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

// ── Props ───────────────────────────────────────────────────
interface Props {
  /** Operating mode: 'wizard' for initial setup, 'fleet-edit' for post-setup editing */
  mode?: 'wizard' | 'fleet-edit';
  /** Current accessory selections from Step 3 (wizard mode only) */
  accessorySelections?: AccessorySelections;
  /** Pre-built container zones (fleet-edit mode — bypasses accessorySelections) */
  prebuiltContainerZones?: ContainerZone[];
  /** Vehicle ID for loadout persistence */
  vehicleId: string | null;
  /** User ID for data persistence */
  userId: string | null;
  /** Navigate back to Step 4 (Container Framework) — wizard mode */
  onBack?: () => void;

  /** Skip loadout → deploy vehicle — wizard mode */
  onSkipLoadout?: () => void;
  /** Finalize vehicle setup (with loadout) — wizard mode */
  onCompleteBuild?: () => void;

  /** Save loadout changes — fleet-edit mode */
  onSave?: () => void;
  /** Close loadout editor without saving — fleet-edit mode */
  onClose?: () => void;
  /** Whether the save is in progress */
  saving: boolean;
  /** Vehicle name for display */
  vehicleName?: string | null;
  /** Show toast message */
  showToast?: (msg: string) => void;
}

// ═══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════
export default function LoadoutWizardStep({
  mode = 'wizard',
  accessorySelections,
  prebuiltContainerZones,
  vehicleId,
  userId,
  onBack,
  onSkipLoadout,
  onCompleteBuild,
  onSave,
  onClose,
  saving,
  vehicleName,
  showToast,
}: Props) {
  const isFleetEdit = mode === 'fleet-edit';
  const router = useRouter();
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ── Container zones ───────────────────────────────────────
  // In fleet-edit mode, use prebuiltContainerZones directly.
  // In wizard mode, build from accessorySelections.
  const containerZones = useMemo(() => {
    if (isFleetEdit && prebuiltContainerZones) {
      return prebuiltContainerZones;
    }
    if (accessorySelections) {
      const framework = buildAccessoryFramework(accessorySelections);
      return generateContainerZonesFromAccessories(framework);
    }
    return [];
  }, [isFleetEdit, prebuiltContainerZones, accessorySelections]);

  // ── Loadout state ─────────────────────────────────────────
  const [activeLoadout, setActiveLoadout] = useState<LocalLoadout | null>(null);
  const [loadoutItems, setLoadoutItems] = useState<LoadoutItem[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Container Detail Sheet state ──────────────────────────
  const [detailSheetVisible, setDetailSheetVisible] = useState(false);
  const [selectedContainer, setSelectedContainer] = useState<ContainerZone | null>(null);

  // ── Computed stats ────────────────────────────────────────
  const stats = useMemo(() => {
    const total = loadoutItems.length;
    const totalWeight = getTotalLoadoutWeight(loadoutItems, containerZones);
    return { total, totalWeight };
  }, [containerZones, loadoutItems]);

  // ── Initialize loadout ────────────────────────────────────
  // FIX: Uses getByVehicleId instead of getAll to find the correct loadout.
  // Re-runs when vehicleId changes (not just on mount).
  const initLoadout = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    try {
      let active: LocalLoadout | null = null;

      if (vehicleId) {
        // FIX: Query loadouts linked to THIS specific vehicle
        const { loadouts: vehicleLoadouts } = await loadoutStore.getByVehicleId(vehicleId, userId);
        if (vehicleLoadouts.length > 0) {
          active = vehicleLoadouts[0];
          logLoadoutWizardDev(TAG, `Found existing loadout for vehicle ${vehicleId}: ${active.id}`);
        }
      }

      // Fallback: check all loadouts if none linked to this vehicle
      if (!active) {
        const { loadouts: allLoadouts } = await loadoutStore.getAll(userId);
        // Look for a loadout that might be linked to this vehicle but wasn't found
        // (e.g., vehicle_id mismatch or null vehicle_id)
        if (vehicleId && allLoadouts.length > 0) {
          // Check if any loadout has a matching vehicle_id
          const matched = allLoadouts.find(l => l.vehicle_id === vehicleId);
          if (matched) {
            active = matched;
            logLoadoutWizardDev(TAG, `Found loadout via getAll fallback: ${active.id}`);
          }
        }
      }

      // If still no loadout, create a new one linked to this vehicle
      if (!active) {
        const idNum = Math.floor(10000 + Math.random() * 90000);
        const { loadout } = await loadoutStore.create({
          name: `Build ${idNum}`,
          mode: 'trip',
          operating_profile: null,
          people_count: 1,
          trip_length_days: 3,
          loadout_view_mode: 'advanced',
          vehicle_id: vehicleId,
        }, userId);
        active = loadout;
        logLoadoutWizardDev(TAG, `Created new loadout for vehicle ${vehicleId}: ${active.id}`);
      }

      // FIX: Ensure the loadout is linked to the current vehicle
      // (handles case where loadout exists but vehicle_id is null or wrong)
      if (active && vehicleId && active.vehicle_id !== vehicleId) {
        logLoadoutWizardDev(TAG, `Linking loadout ${active.id} to vehicle ${vehicleId} (was: ${active.vehicle_id})`);
        const updated = await loadoutStore.update(active.id, { vehicle_id: vehicleId } as any, userId);
        if (updated) {
          active = updated;
        }
      }

      if (mountedRef.current) {
        setActiveLoadout(active);

        if (active) {
          const items = await loadoutItemStore.getByLoadoutId(active.id, userId);
          if (mountedRef.current) {
            setLoadoutItems(items as LoadoutItem[]);
          }
        }
      }
    } catch (e) {
      console.error(TAG, 'Init error:', e);
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, [userId, vehicleId]);

  // FIX: Re-initialize when vehicleId changes (not just on mount)
  useEffect(() => {
    initLoadout();
  }, [initLoadout]);


  // ── Refresh items (returns fresh items for reconciliation) ──
  const refreshItems = useCallback(async (): Promise<LoadoutItem[]> => {
    if (!activeLoadout) return [];
    try {
      const items = await loadoutItemStore.getByLoadoutId(activeLoadout.id, userId);
      if (mountedRef.current) {
        setLoadoutItems(items as LoadoutItem[]);
      }
      return items as LoadoutItem[];
    } catch {
      return [];
    }
  }, [activeLoadout, userId]);

  // ── Reconcile loadout record weight/count after item mutations ──
  // Immediately persists total_weight_lbs and item_count to the loadout
  // record so VehicleLoadoutSummary on the Fleet tab always shows
  // accurate values without requiring a manual SAVE or DEPLOY action.
  const reconcileLoadoutRecord = useCallback(async (freshItems: LoadoutItem[]) => {
    if (!activeLoadout) return;
    const newWeight = getTotalLoadoutWeight(freshItems, containerZones);
    const newCount = freshItems.length;

    // Skip update if values haven't changed
    if (
      activeLoadout.total_weight_lbs === newWeight &&
      activeLoadout.item_count === newCount
    ) {
      return;
    }

    try {
      const updated = await loadoutStore.update(
        activeLoadout.id,
        {
          total_weight_lbs: newWeight,
          item_count: newCount,
        },
        userId,
      );
      if (mountedRef.current && updated) {
        setActiveLoadout(updated);
      }
    } catch (e) {
      console.warn(TAG, 'Failed to reconcile loadout stats:', e);
    }
  }, [activeLoadout, containerZones, userId]);

  // ── Container press → open detail sheet ───────────────────
  const handleContainerPress = useCallback((containerKey: string) => {
    if (!activeLoadout) return;
    const zone = containerZones.find(z => z.id === containerKey);
    if (zone) {
      setSelectedContainer(zone);
      setDetailSheetVisible(true);
    }
  }, [activeLoadout, containerZones]);

  // ── Container Detail: Add Item ────────────────────────────
  const handleDetailAddItem = useCallback(async (payload: AddItemPayload) => {
    if (!activeLoadout) return;
    try {
      await loadoutItemStore.create({
        loadout_id: activeLoadout.id,
        name: payload.name,
        category: payload.category,
        quantity: payload.quantity,
        weight_lbs: payload.weight_lbs,
        weight_source: payload.weight_source,
        is_critical: payload.is_critical,
        notes: payload.notes,
        storage_location: payload.storage_location,
        sort_order: loadoutItems.length,
      }, userId);
      const freshItems = await refreshItems();
      await reconcileLoadoutRecord(freshItems);
      showToast?.('ITEM ADDED');
    } catch (e) {
      console.error(TAG, 'Add item error:', e);
      showToast?.('FAILED TO ADD ITEM');
    }
  }, [activeLoadout, userId, loadoutItems.length, refreshItems, reconcileLoadoutRecord, showToast]);

  // ── Container Detail: Update Item ─────────────────────────
  const handleDetailUpdateItem = useCallback(async (itemId: string, updates: Partial<LoadoutItem>) => {
    try {
      await loadoutItemStore.update(itemId, updates, userId);
      const freshItems = await refreshItems();
      await reconcileLoadoutRecord(freshItems);
    } catch (e) {
      console.error(TAG, 'Update item error:', e);
    }
  }, [userId, refreshItems, reconcileLoadoutRecord]);

  // ── Container Detail: Delete Item ─────────────────────────
  const handleDetailDeleteItem = useCallback(async (itemId: string) => {
    try {
      await loadoutItemStore.delete(itemId, userId);
      const freshItems = await refreshItems();
      await reconcileLoadoutRecord(freshItems);
      showToast?.('ITEM REMOVED');
    } catch (e) {
      console.error(TAG, 'Delete item error:', e);
    }
  }, [userId, refreshItems, reconcileLoadoutRecord, showToast]);


  // ── Handle Deploy Vehicle (wizard mode) ────────────────────
  // Persist final loadout stats (total_weight_lbs, item_count) to the
  // loadout record, fire haptic confirmation, then hand off to parent.
  const handleComplete = useCallback(async () => {
    // Tier 2 haptic — satisfying "deploy" confirmation pulse
    await hapticCommand();

    // Persist accurate weight & item count to the loadout record
    if (activeLoadout) {
      try {
        await loadoutStore.update(
          activeLoadout.id,
          {
            total_weight_lbs: stats.totalWeight,
            item_count: stats.total,
            vehicle_id: vehicleId,
          },
          userId,
        );
      } catch (e) {
        console.warn(TAG, 'Failed to persist loadout stats on vehicle deploy:', e);
        // Non-blocking — still allow vehicle deploy to proceed
      }
    }

    onCompleteBuild?.();
  }, [onCompleteBuild, activeLoadout, stats, vehicleId, userId]);


  // ── Navigate to Weight Dashboard ──────────────────────────
  const handleOpenWeightDashboard = useCallback(() => {
    hapticMicro();
    const params: Record<string, string> = {};
    if (activeLoadout?.id) params.loadoutId = activeLoadout.id;
    if (vehicleId) params.vehicleId = vehicleId;
    router.push({ pathname: '/weight-dashboard', params });
  }, [activeLoadout, vehicleId, router]);




  // ── Handle Skip Loadout (wizard mode) ─────────────────────
  const handleSkip = useCallback(() => {
    hapticMicro();
    onSkipLoadout?.();
  }, [onSkipLoadout]);

  // ── Handle Save (fleet-edit mode) ─────────────────────────
  const handleSave = useCallback(() => {
    hapticCommand();
    onSave?.();
  }, [onSave]);

  // ── Handle Close (fleet-edit mode) ────────────────────────
  const handleClose = useCallback(() => {
    hapticMicro();
    onClose?.();
  }, [onClose]);

  // ── Hint text based on mode ───────────────────────────────
  const hintText = isFleetEdit
    ? 'Tap any container to add or manage items. Press SAVE when done.'
    : 'Tap any container to add items. You can skip this and add items later from Fleet.';

  // ── Info box text based on mode ───────────────────────────
  const infoText = isFleetEdit
    ? `${stats.total} item${stats.total !== 1 ? 's' : ''} configured (${stats.totalWeight.toFixed(1)} lbs total). Save to persist changes.`
    : `${stats.total} item${stats.total !== 1 ? 's' : ''} added (${stats.totalWeight.toFixed(1)} lbs). Tap Deploy Vehicle when this rig is ready.`;


  return (
    <View style={styles.container}>
      {/* ── Sub-Header ──────────────────────────────────────── */}
      <View style={styles.subHeader}>
        <View style={styles.subHeaderLeft}>
          <View style={styles.subHeaderIconWrap}>
            <Ionicons name="cube-outline" size={12} color={ECS_GOLD} />
          </View>
          <View>
            <Text style={styles.subHeaderTitle}>
              {isFleetEdit ? 'Loadout Framework' : 'Loadout Framework'}
            </Text>
            <Text style={styles.subHeaderSubtitle}>
              {containerZones.length > 0
                ? 'Finish the loadout, then deploy this vehicle when ready'
                : 'No containers — configure container framework first'}
            </Text>
          </View>
        </View>
        {stats.total > 0 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{stats.total}</Text>
          </View>
        )}
      </View>

      {/* ── Stats Strip (Tappable → Weight Dashboard) ────────── */}
      {stats.total > 0 && (
        <TouchableOpacity
          style={styles.statsStrip}
          onPress={handleOpenWeightDashboard}
          activeOpacity={0.7}
        >
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{containerZones.length}</Text>
            <Text style={styles.statLabel}>ZONES</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statValue}>{stats.total}</Text>
            <Text style={styles.statLabel}>ITEMS</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statValue, { color: TACTICAL.amber }]}>
              {stats.totalWeight >= 100 ? Math.round(stats.totalWeight) : stats.totalWeight.toFixed(1)}
            </Text>
            <Text style={styles.statLabel}>LBS</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: 'rgba(196, 138, 44, 0.08)', borderColor: 'rgba(196, 138, 44, 0.25)' }]}>
            <Ionicons name="analytics-outline" size={14} color={TACTICAL.amber} />
            <Text style={[styles.statLabel, { color: TACTICAL.amber }]}>WEIGHT</Text>
          </View>
        </TouchableOpacity>
      )}


      {/* ── Content ─────────────────────────────────────────── */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={TACTICAL.accent} />
          <Text style={styles.loadingText}>INITIALIZING LOADOUT...</Text>
        </View>
      ) : containerZones.length === 0 ? (
        /* ── Empty State: No containers ─────────────────────── */
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cube-outline" size={40} color={TACTICAL.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>NO CONTAINERS</Text>
          <Text style={styles.emptySubtext}>
            {isFleetEdit
              ? 'This vehicle has no accessory containers configured. Edit the vehicle to add accessories first.'
              : 'Go back to Step 3 and configure at least one container zone for your loadout.'}

          </Text>
          {!isFleetEdit && (
            <TouchableOpacity
              style={styles.emptyBackBtn}
              onPress={onBack}
              activeOpacity={0.7}
            >
              <Ionicons name="chevron-back" size={14} color={TACTICAL.amber} />
              <Text style={styles.emptyBackText}>BACK TO CONTAINERS</Text>

            </TouchableOpacity>
          )}
          {isFleetEdit && (
            <TouchableOpacity
              style={styles.emptyBackBtn}
              onPress={handleClose}
              activeOpacity={0.7}
            >
              <Ionicons name="close-outline" size={14} color={TACTICAL.amber} />
              <Text style={styles.emptyBackText}>CLOSE</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        /* ── Container Grid ─────────────────────────────────── */
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.contentArea}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.summaryStack}>
            <View style={styles.hintRow}>
              <Ionicons name="information-circle-outline" size={12} color={TACTICAL.textMuted} />
              <Text style={styles.hintText}>{hintText}</Text>
            </View>

            {stats.total > 0 && (
              <View style={styles.infoBox}>
                <Ionicons name="checkmark-circle-outline" size={16} color="#66BB6A" />
                <Text style={styles.infoText}>{infoText}</Text>
              </View>
            )}
          </View>

          <ContainerGrid
            containerZones={containerZones}
            items={loadoutItems}
            onContainerPress={handleContainerPress}
            columns={3}
          />
        </ScrollView>
      )}

      {/* ── Footer ──────────────────────────────────────────── */}
      {isFleetEdit ? (
        /* ── Fleet-Edit Footer: CLOSE | SAVE ────────────────── */
        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.footerCloseBtn}
            onPress={handleClose}
            activeOpacity={0.7}
          >
            <Ionicons name="close-outline" size={16} color={TACTICAL.textMuted} />
            <Text style={styles.footerCloseText}>CLOSE</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.footerSaveBtn,
              saving && styles.footerSaveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#0B0F12" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={16} color="#0B0F12" />
                <Text style={styles.footerSaveText}>SAVE</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        /* ── Wizard Footer: BACK | SKIP | DEPLOY VEHICLE ─────── */
        <View style={styles.footer}>
          {/* Back Button */}
          <TouchableOpacity
            style={styles.footerBackBtn}
            onPress={onBack}
            activeOpacity={0.7}
          >
            <Ionicons name="chevron-back" size={16} color={TACTICAL.textMuted} />
            <Text style={styles.footerBackText}>BACK</Text>
          </TouchableOpacity>

          {/* Skip Button */}
          <TouchableOpacity
            style={styles.footerSkipBtn}
            onPress={handleSkip}
            activeOpacity={0.7}
          >
            <Text style={styles.footerSkipText}>SKIP</Text>
          </TouchableOpacity>

          {/* Deploy Vehicle Button */}
          <TouchableOpacity
            style={[
              styles.footerCompleteBtn,
              saving && styles.footerCompleteBtnDisabled,
            ]}
            onPress={handleComplete}
            disabled={saving}
            activeOpacity={0.7}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#0B0F12" />
            ) : (
              <>
                <Ionicons name="car-sport-outline" size={16} color="#0B0F12" />
                <Text style={styles.footerCompleteText}>Deploy Vehicle</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}


      {/* ── Container Detail Sheet ────────────────────────────── */}
      {activeLoadout && (
        <ContainerDetailSheet
          visible={detailSheetVisible}
          onClose={() => { setDetailSheetVisible(false); setSelectedContainer(null); }}
          container={selectedContainer}
          allItems={loadoutItems}
          onAddItem={handleDetailAddItem}
          onUpdateItem={handleDetailUpdateItem}
          onDeleteItem={handleDetailDeleteItem}
        />
      )}
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },

  // ── Sub-Header ────────────────────────────────────────────
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.2)',
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  subHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  subHeaderIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  subHeaderSubtitle: {
    fontSize: 10,
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
    marginTop: 1,
  },
  countBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(102, 187, 106, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#66BB6A',
  },

  // ── Stats Strip ───────────────────────────────────────────
  statsStrip: {
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(62, 79, 60, 0.12)',
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TACTICAL.panel,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.2)',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  statValue: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  statLabel: {
    fontSize: 6,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    marginTop: 1,
  },

  // ── Loading ───────────────────────────────────────────────
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },

  // ── Scroll ────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  contentArea: {
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 14,
    gap: 10,
  },
  summaryStack: {
    gap: 8,
  },

  // ── Hint ──────────────────────────────────────────────────
  hintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  hintText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#8A8A85',
    letterSpacing: 0.5,
    fontStyle: 'italic',
    flex: 1,
  },

  // ── Empty State ───────────────────────────────────────────
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
    paddingHorizontal: 24,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(62, 79, 60, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  emptySubtext: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    textAlign: 'center',
    lineHeight: 16,
  },
  emptyBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.4)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
    marginTop: 8,
  },
  emptyBackText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // ── Info Box ──────────────────────────────────────────────
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 12,
    backgroundColor: 'rgba(102, 187, 106, 0.06)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(102, 187, 106, 0.2)',
  },
  infoText: {
    fontSize: 11,
    color: TACTICAL.textMuted,
    lineHeight: 16,
    flex: 1,
  },

  // ── Footer (shared) ───────────────────────────────────────
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: 'rgba(196, 138, 44, 0.15)',
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  // ── Wizard Footer Buttons ─────────────────────────────────
  footerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
  },
  footerBackText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  footerSkipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.3)',
    backgroundColor: 'rgba(62, 79, 60, 0.08)',
  },
  footerSkipText: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  footerCompleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ECS_GOLD,
  },
  footerCompleteBtnDisabled: {
    opacity: 0.5,
  },
  footerCompleteText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },

  // ── Fleet-Edit Footer Buttons ─────────────────────────────
  footerCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.4)',
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
  },
  footerCloseText: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  footerSaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: ECS_GOLD,
  },
  footerSaveBtnDisabled: {
    opacity: 0.5,
  },
  footerSaveText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },
});



