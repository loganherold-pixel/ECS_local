import React, { useState, useEffect, useCallback, useRef } from 'react';

import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeIcon as Ionicons } from '../SafeIcon';

import { TACTICAL } from '../../lib/theme';
import { supabase } from '../../lib/supabase';

// ── Types ───────────────────────────────────────────────────
interface ReadinessData {
  total_items: number;
  packed_items: number;
  readiness_percent: number;
  total_critical: number;
  packed_critical: number;
  critical_ready_percent: number | null;
}

interface LoadoutOption {
  id: string;
  name: string;
  mode: string;
  item_count: number;
}

interface Props {
  expeditionId: string;
  userId: string;
  loadoutId: string | null;
  onLoadoutChanged?: () => void;
}

// ── Helpers ─────────────────────────────────────────────────
function computeReadiness(items: { is_packed: boolean; is_critical: boolean }[]): ReadinessData {
  const total_items = items.length;
  const packed_items = items.filter(i => i.is_packed).length;
  const readiness_percent = total_items > 0 ? Math.round((packed_items / total_items) * 100) : 0;
  const total_critical = items.filter(i => i.is_critical).length;
  const packed_critical = items.filter(i => i.is_critical && i.is_packed).length;
  const critical_ready_percent =
    total_critical > 0 ? Math.round((packed_critical / total_critical) * 100) : null;

  return {
    total_items,
    packed_items,
    readiness_percent,
    total_critical,
    packed_critical,
    critical_ready_percent,
  };
}

function getReadinessColor(pct: number): string {
  if (pct >= 100) return '#4CAF50';
  if (pct >= 70) return TACTICAL.amber;
  if (pct >= 40) return '#FF9800';
  return TACTICAL.danger;
}

// ── Component ───────────────────────────────────────────────
export default function LoadoutReadinessCard({
  expeditionId,
  userId,
  loadoutId,
  onLoadoutChanged,
}: Props) {
  const router = useRouter();

  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [loadoutName, setLoadoutName] = useState<string | null>(null);
  const [loadingReadiness, setLoadingReadiness] = useState(false);

  // Assign loadout state
  const [showPicker, setShowPicker] = useState(false);
  const [loadouts, setLoadouts] = useState<LoadoutOption[]>([]);
  const [loadingLoadouts, setLoadingLoadouts] = useState(false);
  const [assigning, setAssigning] = useState(false);

  // Mounted ref to prevent setState after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // ── Fetch readiness data ──────────────────────────────────
  const fetchReadiness = useCallback(async () => {
    if (!loadoutId) return;
    setLoadingReadiness(true);
    try {
      // Fetch loadout name
      const { data: lo } = await supabase
        .from('loadouts')
        .select('name')
        .eq('id', loadoutId)
        .single();
      if (!mountedRef.current) return;
      if (lo) setLoadoutName(lo.name);

      // Fetch items for readiness computation
      const { data: items, error } = await supabase
        .from('loadout_items')
        .select('is_packed, is_critical')
        .eq('loadout_id', loadoutId);

      if (!mountedRef.current) return;
      if (!error && items) {
        setReadiness(computeReadiness(items));
      }
    } catch (ex: any) {
      console.warn('[LoadoutReadinessCard] fetchReadiness exception:', ex?.message || ex);
    }
    if (mountedRef.current) setLoadingReadiness(false);
  }, [loadoutId]);


  useEffect(() => {
    if (loadoutId) {
      fetchReadiness();
    } else {
      setReadiness(null);
      setLoadoutName(null);
    }
  }, [loadoutId, fetchReadiness]);

  // ── Fetch user's loadouts for picker ──────────────────────
  const fetchLoadouts = useCallback(async () => {
    setLoadingLoadouts(true);
    try {
      const { data, error } = await supabase
        .from('loadouts')
        .select('id, name, mode, item_count')
        .eq('owner_user_id', userId)
        .order('mode', { ascending: false }) // trip first
        .order('name');
      if (!mountedRef.current) return;
      if (error) {
        console.warn('[LoadoutReadinessCard] fetchLoadouts error:', error.message);
      } else if (data) {
        setLoadouts(data);
      }
    } catch (ex: any) {
      console.warn('[LoadoutReadinessCard] fetchLoadouts exception:', ex?.message || ex);
    }
    if (mountedRef.current) setLoadingLoadouts(false);
  }, [userId]);

  // ── Assign loadout to expedition ──────────────────────────
  const handleAssign = async (selectedId: string) => {
    setAssigning(true);
    try {
      const { error } = await supabase
        .from('expeditions')
        .update({ loadout_id: selectedId })
        .eq('id', expeditionId);

      if (!mountedRef.current) return;
      if (error) {
        console.warn('[LoadoutReadinessCard] handleAssign error:', error.message);
      } else {
        setShowPicker(false);
        onLoadoutChanged?.();
      }
    } catch (ex: any) {
      console.warn('[LoadoutReadinessCard] handleAssign exception:', ex?.message || ex);
    }
    if (mountedRef.current) setAssigning(false);
  };


  // ── Open picker ───────────────────────────────────────────
  const handleOpenPicker = () => {
    setShowPicker(true);
    fetchLoadouts();
  };

  // ── Navigate to Fleet tab to configure loadout ─────────────
  const handleOpenLoadout = () => {
    // Loadout 2.0 is exclusively in the vehicle wizard on the Fleet tab.
    router.push('/(tabs)/fleet' as any);
  };



  // ── Warning states ────────────────────────────────────────
  const isWarning =
    readiness !== null &&
    (readiness.readiness_percent < 60 ||
      (readiness.critical_ready_percent !== null && readiness.critical_ready_percent < 80));

  const warningBorderColor = isWarning ? TACTICAL.danger : TACTICAL.accent;

  // ═══════════════════════════════════════════════════════════
  // RENDER: No loadout linked
  // ═══════════════════════════════════════════════════════════
  if (!loadoutId) {
    return (
      <View style={styles.card}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons name="cube-outline" size={16} color={TACTICAL.amber} />
            <Text style={styles.cardTitle}>LOADOUT STATUS</Text>
          </View>
        </View>

        {/* Empty state */}
        <View style={styles.emptyBody}>
          <Ionicons name="cube-outline" size={28} color={TACTICAL.textMuted} />
          <Text style={styles.emptyText}>No loadout linked</Text>
        </View>

        {/* Assign button or picker */}
        {!showPicker ? (
          <TouchableOpacity style={styles.assignBtn} onPress={handleOpenPicker}>
            <Ionicons name="link-outline" size={16} color={TACTICAL.text} />
            <Text style={styles.assignBtnText}>LINK LOADOUT</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.pickerContainer}>
            {loadingLoadouts ? (
              <View style={styles.pickerLoading}>
                <ActivityIndicator size="small" color={TACTICAL.accent} />
                <Text style={styles.pickerLoadingText}>LOADING LOADOUTS...</Text>
              </View>
            ) : loadouts.length === 0 ? (
              <View style={styles.pickerEmpty}>
                <Text style={styles.pickerEmptyText}>No loadouts found. Create one first.</Text>
                <TouchableOpacity
                  style={styles.pickerCancelBtn}
                  onPress={() => setShowPicker(false)}
                >
                  <Text style={styles.pickerCancelText}>CLOSE</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <Text style={styles.pickerLabel}>SELECT ECS LOADOUT</Text>
                <ScrollView
                  style={styles.pickerScroll}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {loadouts.map(lo => {
                    const isTrip = lo.mode === 'trip';
                    return (
                      <TouchableOpacity
                        key={lo.id}
                        style={styles.pickerOption}
                        onPress={() => handleAssign(lo.id)}
                        disabled={assigning}
                      >
                        <View style={styles.pickerOptionLeft}>
                          <Text style={styles.pickerOptionName} numberOfLines={1}>
                            {lo.name}
                          </Text>
                          <View style={styles.pickerOptionMeta}>
                            <View
                              style={[
                                styles.pickerModeBadge,
                                isTrip && styles.pickerModeBadgeTrip,
                              ]}
                            >
                              <Text
                                style={[
                                  styles.pickerModeText,
                                  isTrip && styles.pickerModeTextTrip,
                                ]}
                              >
                                {(lo.mode || 'trip').toUpperCase()}
                              </Text>
                            </View>
                            <Text style={styles.pickerItemCount}>
                              {lo.item_count} item{lo.item_count !== 1 ? 's' : ''}
                            </Text>
                            {isTrip && (
                              <View style={styles.recommendedBadge}>
                                <Text style={styles.recommendedText}>RECOMMENDED</Text>
                              </View>
                            )}
                          </View>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={TACTICAL.textMuted} />
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity
                  style={styles.pickerCancelBtn}
                  onPress={() => setShowPicker(false)}
                >
                  <Text style={styles.pickerCancelText}>CANCEL</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    );
  }

  // ═══════════════════════════════════════════════════════════
  // RENDER: Loadout assigned — Readiness metrics
  // ═══════════════════════════════════════════════════════════
  if (loadingReadiness || !readiness) {
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <Ionicons name="cube-outline" size={16} color={TACTICAL.amber} />
            <Text style={styles.cardTitle}>LOADOUT STATUS</Text>
          </View>
        </View>
        <View style={styles.loadingBody}>
          <ActivityIndicator size="small" color={TACTICAL.accent} />
        </View>
      </View>
    );
  }

  const readinessColor = getReadinessColor(readiness.readiness_percent);
  const criticalColor =
    readiness.critical_ready_percent !== null
      ? getReadinessColor(readiness.critical_ready_percent)
      : TACTICAL.textMuted;

  return (
    <View style={[styles.card, { borderTopColor: warningBorderColor }]}>
      {/* Header */}
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons
            name={isWarning ? 'warning-outline' : 'cube-outline'}
            size={16}
            color={isWarning ? TACTICAL.danger : TACTICAL.amber}
          />
          <Text style={styles.cardTitle}>LOADOUT STATUS</Text>
        </View>
        {loadoutName && (
          <Text style={styles.loadoutNameLabel} numberOfLines={1}>
            {loadoutName}
          </Text>
        )}
      </View>

      {/* Warning banner */}
      {isWarning && (
        <View style={styles.warningBanner}>
          <Ionicons name="alert-circle" size={14} color={TACTICAL.danger} />
          <Text style={styles.warningText}>
            {readiness.readiness_percent < 60
              ? 'READINESS BELOW TARGET'
              : 'CRITICAL ITEMS INCOMPLETE'}
          </Text>
        </View>
      )}

      {/* Metrics row */}
      <View style={styles.metricsRow}>
        {/* Readiness */}
        <View style={styles.metricBlock}>
          <Text style={styles.metricLabel}>READINESS</Text>
          <View style={styles.metricValueRow}>
            <Text style={[styles.metricValueLarge, { color: readinessColor }]}>
              {readiness.readiness_percent}%
            </Text>
            <Text style={styles.metricFraction}>
              ({readiness.packed_items}/{readiness.total_items})
            </Text>
          </View>
          {/* Progress bar */}
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                {
                  width: `${Math.min(100, readiness.readiness_percent)}%`,
                  backgroundColor: readinessColor,
                },
              ]}
            />
          </View>
        </View>

        {/* Critical readiness (only if critical items exist) */}
        {readiness.total_critical > 0 && readiness.critical_ready_percent !== null && (
          <View style={[styles.metricBlock, styles.metricBlockCritical]}>
            <Text style={[styles.metricLabel, { color: TACTICAL.danger }]}>CRITICAL READY</Text>
            <View style={styles.metricValueRow}>
              <Text style={[styles.metricValueLarge, { color: criticalColor }]}>
                {readiness.critical_ready_percent}%
              </Text>
              <Text style={styles.metricFraction}>
                ({readiness.packed_critical}/{readiness.total_critical})
              </Text>
            </View>
            {/* Progress bar */}
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.min(100, readiness.critical_ready_percent)}%`,
                    backgroundColor: criticalColor,
                  },
                ]}
              />
            </View>
          </View>
        )}
      </View>

      {/* Action button */}
      <TouchableOpacity style={styles.openBtn} onPress={handleOpenLoadout}>
        <Ionicons name="open-outline" size={15} color={TACTICAL.text} />
        <Text style={styles.openBtnText}>OPEN IN FLEET</Text>
      </TouchableOpacity>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  card: {
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(62, 79, 60, 0.35)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(196,138,44,0.18)',
    marginBottom: 14,
    overflow: 'hidden',
  },

  // ── Header ────────────────────────────────────────────────
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 8,
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  loadoutNameLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    maxWidth: 160,
    letterSpacing: 0.3,
  },

  // ── Warning ───────────────────────────────────────────────
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(192, 57, 43, 0.1)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(192, 57, 43, 0.25)',
  },
  warningText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.danger,
    letterSpacing: 1.2,
  },

  // ── Metrics ───────────────────────────────────────────────
  metricsRow: {
    paddingHorizontal: 14,
    gap: 10,
    paddingBottom: 10,
  },
  metricBlock: {
    gap: 4,
  },
  metricBlockCritical: {
    marginTop: 2,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(62, 79, 60, 0.2)',
  },
  metricLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
  },
  metricValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  metricValueLarge: {
    fontSize: 24,
    fontWeight: '900',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    lineHeight: 28,
  },
  metricFraction: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  progressTrack: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 2,
    overflow: 'hidden',
    marginTop: 2,
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },

  // ── Action button ─────────────────────────────────────────
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 14,
    paddingVertical: 10,
    backgroundColor: TACTICAL.accent,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.borderFocus,
  },
  openBtnText: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },

  // ── Empty state (no loadout) ──────────────────────────────
  emptyBody: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '600',
    color: TACTICAL.textMuted,
  },

  // ── Assign button ─────────────────────────────────────────
  assignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: 14,
    marginBottom: 14,
    paddingVertical: 11,
    backgroundColor: TACTICAL.accent,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.borderFocus,
  },
  assignBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 1.5,
  },

  // ── Picker ────────────────────────────────────────────────
  pickerContainer: {
    marginHorizontal: 14,
    marginBottom: 14,
  },
  pickerLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1.5,
    marginBottom: 8,
  },
  pickerScroll: {
    maxHeight: 200,
  },
  pickerOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 11,
    backgroundColor: TACTICAL.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginBottom: 6,
  },
  pickerOptionLeft: {
    flex: 1,
    marginRight: 8,
  },
  pickerOptionName: {
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    marginBottom: 4,
  },
  pickerOptionMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  pickerModeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(138,138,133,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(138,138,133,0.2)',
  },
  pickerModeBadgeTrip: {
    backgroundColor: 'rgba(196,138,44,0.1)',
    borderColor: 'rgba(196,138,44,0.3)',
  },
  pickerModeText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  pickerModeTextTrip: {
    color: TACTICAL.amber,
  },
  pickerItemCount: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  recommendedBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(76,175,80,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.25)',
  },
  recommendedText: {
    fontSize: 7,
    fontWeight: '900',
    color: '#4CAF50',
    letterSpacing: 1,
  },
  pickerCancelBtn: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  pickerCancelText: {
    fontSize: 12,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  pickerLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  pickerLoadingText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  pickerEmpty: {
    alignItems: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  pickerEmptyText: {
    fontSize: 12,
    color: TACTICAL.textMuted,
  },

  // ── Loading body ──────────────────────────────────────────
  loadingBody: {
    alignItems: 'center',
    paddingVertical: 20,
  },
});



