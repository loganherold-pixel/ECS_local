/**
 * VehicleLoadoutSummary — Inline loadout summary card for Fleet vehicle cards.
 *
 * Queries loadoutStore.getByVehicleId() and displays:
 *   - Loadout name
 *   - Item count
 *   - Total weight (lbs)
 *   - Cloud sync status indicator for weight/count reconciliation
 *   - "View Loadout" button that opens the FleetLoadoutModal
 *
 * If no loadout is linked to the vehicle, shows a subtle "No loadout" hint
 * with an "Add Loadout" button.
 *
 * Fetches data on mount and when `refreshKey` changes (e.g. after modal save).
 *
 * FIX (Part 2): Subscribes to vehicleStore change events so that when the
 * wizard finalizes a vehicle config, the loadout summary immediately re-fetches
 * instead of showing stale "No loadout linked" state.
 *
 * FIX (Cloud Sync): Subscribes to loadoutSyncQueue to display a real-time
 * sync status indicator. Shows whether the loadout's weight/count values
 * have been synced to cloud, are pending retry, or have failed.
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { loadoutStore, type LocalLoadout } from '../../lib/loadoutStore';
import { vehicleStore } from '../../lib/vehicleStore';
import {
  loadoutSyncQueue,
  type LoadoutSyncStatus,
} from '../../lib/loadoutSyncQueue';

// ── ECS Gold ────────────────────────────────────────────────
const ECS_GOLD = '#D4A017';
const TAG = '[VehicleLoadoutSummary]';

// ── Sync Status Config ──────────────────────────────────────
const SYNC_STATUS_CONFIG: Record<LoadoutSyncStatus, {
  icon: string;
  color: string;
  label: string;
  bgColor: string;
}> = {
  synced: {
    icon: 'cloud-done-outline',
    color: '#66BB6A',
    label: 'SYNCED',
    bgColor: 'rgba(102, 187, 106, 0.08)',
  },
  pending: {
    icon: 'cloud-upload-outline',
    color: '#FFA726',
    label: 'PENDING',
    bgColor: 'rgba(255, 167, 38, 0.08)',
  },
  retrying: {
    icon: 'sync-outline',
    color: '#42A5F5',
    label: 'SYNCING',
    bgColor: 'rgba(66, 165, 245, 0.08)',
  },
  failed: {
    icon: 'cloud-offline-outline',
    color: '#EF5350',
    label: 'FAILED',
    bgColor: 'rgba(239, 83, 80, 0.08)',
  },
};

// ── Props ───────────────────────────────────────────────────
interface Props {
  /** Vehicle ID to query loadouts for */
  vehicleId: string;
  /** User ID for data persistence */
  userId: string | null;
  /** Called when user taps "View Loadout" or "Add Loadout" */
  onOpenLoadout: () => void;
  /** Incremented externally to trigger a data refresh (e.g. after modal save) */
  refreshKey?: number;
}

export default function VehicleLoadoutSummary({
  vehicleId,
  userId,
  onOpenLoadout,
  refreshKey = 0,
}: Props) {
  const [loadout, setLoadout] = useState<LocalLoadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<LoadoutSyncStatus>('synced');
  const mountedRef = useRef(true);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  // ── Pulse animation for pending/retrying states ───────────
  useEffect(() => {
    if (cloudSyncStatus === 'pending' || cloudSyncStatus === 'retrying') {
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.4,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      );
      animation.start();
      return () => animation.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [cloudSyncStatus, pulseAnim]);

  const fetchLoadout = useCallback(async () => {
    setLoading(true);
    try {
      const { loadouts } = await loadoutStore.getByVehicleId(vehicleId, userId);
      if (mountedRef.current) {
        const found = loadouts.length > 0 ? loadouts[0] : null;
        setLoadout(found);

        // Check loadoutSyncQueue for this loadout's cloud sync status
        if (found) {
          const queueStatus = loadoutSyncQueue.getStatus(found.id);
          setCloudSyncStatus(queueStatus);
        }
      }
    } catch (e) {
      console.warn(TAG, 'Fetch error:', e);
      if (mountedRef.current) setLoadout(null);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [vehicleId, userId]);

  // Fetch on mount, when vehicleId changes, or when refreshKey changes
  useEffect(() => {
    fetchLoadout();
  }, [fetchLoadout, refreshKey]);

  // FIX: Subscribe to vehicleStore changes so that when the wizard
  // finalizes config (which may create/link a loadout), this component
  // re-fetches immediately instead of showing stale state.
  useEffect(() => {
    const unsub = vehicleStore.subscribe((event) => {
      if (!mountedRef.current) return;
      // Re-fetch when this specific vehicle is updated/finalized,
      // or on any finalize event (in case the vehicle ID matches)
      if (
        event.vehicleId === vehicleId ||
        event.type === 'finalize' ||
        event.type === 'sync'
      ) {
        console.log(TAG, `vehicleStore change (${event.type}) for ${event.vehicleId}, re-fetching loadout for ${vehicleId}`);
        fetchLoadout();
      }
    });
    return unsub;
  }, [vehicleId, fetchLoadout]);

  // ── Subscribe to loadoutSyncQueue for real-time sync status ──
  // When the queue processes entries (success or failure), this
  // listener updates the sync indicator immediately.
  useEffect(() => {
    const unsub = loadoutSyncQueue.onChange((statuses) => {
      if (!mountedRef.current || !loadout) return;

      const status = statuses.get(loadout.id);
      // If the loadout is not in the queue, it's synced (or was never queued)
      const newStatus: LoadoutSyncStatus = status || 'synced';

      setCloudSyncStatus(prev => {
        if (prev !== newStatus) {
          console.log(TAG, `Sync status for loadout ${loadout.id}: ${prev} → ${newStatus}`);

          // If we just transitioned to 'synced' from a non-synced state,
          // re-fetch the loadout to ensure we have the latest data
          if (newStatus === 'synced' && prev !== 'synced') {
            fetchLoadout();
          }
        }
        return newStatus;
      });
    });
    return unsub;
  }, [loadout?.id, fetchLoadout]);

  // ── Handle retry tap on failed sync indicator ─────────────
  const handleRetrySync = useCallback(() => {
    if (loadout && cloudSyncStatus === 'failed') {
      loadoutSyncQueue.retryFailed();
    }
  }, [loadout, cloudSyncStatus]);

  // ── Loading state ─────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={TACTICAL.textMuted} />
          <Text style={styles.loadingText}>Loading loadout...</Text>
        </View>
      </View>
    );
  }

  // ── No loadout linked ─────────────────────────────────────
  if (!loadout) {
    return (
      <View style={styles.container}>
        <View style={styles.emptyRow}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="cube-outline" size={12} color={TACTICAL.textMuted} />
          </View>
          <Text style={styles.emptyText}>No loadout linked</Text>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={onOpenLoadout}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle-outline" size={12} color={ECS_GOLD} />
            <Text style={styles.addBtnText}>ADD LOADOUT</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Loadout summary ───────────────────────────────────────
  const itemCount = loadout.item_count ?? loadout._item_count ?? 0;
  const totalWeight = loadout.total_weight_lbs;
  const weightDisplay = totalWeight != null
    ? (totalWeight >= 100 ? Math.round(totalWeight).toLocaleString() : totalWeight.toFixed(1))
    : '--';

  // Determine which sync status to show:
  // Priority: loadoutSyncQueue status > loadout.sync_status
  // The queue status is more granular for reconciliation updates.
  const effectiveSyncStatus: LoadoutSyncStatus =
    cloudSyncStatus !== 'synced'
      ? cloudSyncStatus
      : (loadout.sync_status === 'synced' ? 'synced' : 'pending');

  const syncConfig = SYNC_STATUS_CONFIG[effectiveSyncStatus];
  const showSyncIndicator = true; // Always show — provides confidence the data is in sync

  return (
    <View style={styles.container}>
      {/* Summary Row — no VIEW LOADOUT button; standalone LOADOUT action covers it */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryIconWrap}>
          <Ionicons name="cube" size={12} color={ECS_GOLD} />
        </View>
        <View style={styles.summaryInfo}>
          <Text style={styles.summaryName} numberOfLines={1}>
            {loadout.name}
          </Text>
          <View style={styles.summaryChips}>
            <View style={styles.chip}>
              <Ionicons name="layers-outline" size={8} color={TACTICAL.textMuted} />
              <Text style={styles.chipText}>
                {itemCount} item{itemCount !== 1 ? 's' : ''}
              </Text>
            </View>
            <View style={styles.chip}>
              <Ionicons name="scale-outline" size={8} color={TACTICAL.textMuted} />
              <Text style={styles.chipText}>{weightDisplay} lbs</Text>
            </View>
            {showSyncIndicator && (
              <TouchableOpacity
                style={[
                  styles.chip,
                  { backgroundColor: syncConfig.bgColor },
                  effectiveSyncStatus === 'failed' && styles.failedChipBorder,
                ]}
                onPress={effectiveSyncStatus === 'failed' ? handleRetrySync : undefined}
                activeOpacity={effectiveSyncStatus === 'failed' ? 0.7 : 1}
                disabled={effectiveSyncStatus !== 'failed'}
              >
                {(effectiveSyncStatus === 'pending' || effectiveSyncStatus === 'retrying') ? (
                  <Animated.View style={{ opacity: pulseAnim }}>
                    <Ionicons name={syncConfig.icon} size={8} color={syncConfig.color} />
                  </Animated.View>
                ) : (
                  <Ionicons name={syncConfig.icon} size={8} color={syncConfig.color} />
                )}
                <Text style={[styles.chipText, { color: syncConfig.color }]}>
                  {syncConfig.label}
                </Text>
                {effectiveSyncStatus === 'failed' && (
                  <Ionicons name="refresh-outline" size={7} color={syncConfig.color} />
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>
    </View>
  );
}


// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.18)',
    backgroundColor: 'rgba(196, 138, 44, 0.04)',
    overflow: 'hidden',
  },

  // ── Loading ───────────────────────────────────────────────
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
  },

  // ── Empty State ───────────────────────────────────────────
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  emptyIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    flex: 1,
    fontSize: 9,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    letterSpacing: 0.5,
    fontStyle: 'italic',
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.35)',
    backgroundColor: 'rgba(196, 138, 44, 0.08)',
  },
  addBtnText: {
    fontSize: 8,
    fontWeight: '900',
    color: ECS_GOLD,
    letterSpacing: 1,
  },

  // ── Summary ───────────────────────────────────────────────
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  summaryIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: 'rgba(196, 138, 44, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryInfo: {
    flex: 1,
    gap: 3,
  },
  summaryName: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 0.3,
  },
  summaryChips: {
    flexDirection: 'row',
    gap: 5,
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(62, 79, 60, 0.12)',
  },
  chipText: {
    fontSize: 8,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 0.3,
  },
  failedChipBorder: {
    borderWidth: 1,
    borderColor: 'rgba(239, 83, 80, 0.3)',
  },
  viewBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(196, 138, 44, 0.4)',
    backgroundColor: 'rgba(196, 138, 44, 0.1)',
  },
  viewBtnText: {
    fontSize: 8,
    fontWeight: '900',
    color: ECS_GOLD,
    letterSpacing: 0.8,
  },
});



