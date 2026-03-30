// ============================================================
// EXPEDITION CONTROL PANEL — Global Expedition State UI
// ============================================================
// Sits at the top of the Dashboard, below the header.
// Shows state-specific content for STANDBY / ACTIVE / COMPLETE.
//
// STANDBY:  Readiness message + vehicle status + "Begin Expedition"
// ACTIVE:   Live elapsed timer + distance + "End Expedition"
// COMPLETE: Summary stats + "Return to Standby"
//
// Matches ECS theme: #111418 bg, gold accent, structural borders.
// ============================================================

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated, Alert, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, GOLD_RAIL, ECS } from '../../lib/theme';
import {
  expeditionStateStore,
  formatDuration,
  formatDistance,
  type ExpeditionState,
  type ExpeditionRecord,
  type TimelineEvent,
} from '../../lib/expeditionStateStore';
import { vehicleSetupStore } from '../../lib/vehicleSetupStore';
import { vehicleStore } from '../../lib/vehicleStore';
import { useApp } from '../../context/AppContext';

// ── ECS Control Panel Colors ─────────────────────────────────
const CP = {
  bg: '#111418',
  bgActive: '#0F1318',
  border: '#1E232B',
  gold: '#D4A017',
  goldSoft: 'rgba(212,160,23,0.12)',
  goldBorder: 'rgba(212,160,23,0.30)',
  greenPulse: '#4CAF50',
  greenSoft: 'rgba(76,175,80,0.08)',
  greenBorder: 'rgba(76,175,80,0.25)',
  completeBg: 'rgba(212,160,23,0.04)',
  completeBorder: 'rgba(212,160,23,0.20)',
  textPrimary: '#E6EDF3',
  textMuted: '#8B949E',
  textDim: '#5A6370',
  dangerBg: 'rgba(192,57,43,0.08)',
  dangerBorder: 'rgba(192,57,43,0.30)',
  danger: '#C0392B',
};

interface Props {
  onExpeditionStarted?: () => void;
  onExpeditionEnded?: () => void;
}

export default function ExpeditionControlPanel({ onExpeditionStarted, onExpeditionEnded }: Props) {
  const { user, showToast } = useApp();

  // ── Expedition State ──────────────────────────────────────
  const [expState, setExpState] = useState<ExpeditionState>(expeditionStateStore.getState());
  const [expRecord, setExpRecord] = useState<ExpeditionRecord | null>(expeditionStateStore.getCurrentExpedition());
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);

  // ── Vehicle Info ──────────────────────────────────────────
  const [vehicleId, setVehicleId] = useState<string | null>(vehicleSetupStore.getActiveVehicleId());
  const [vehicleName, setVehicleName] = useState<string>('');
  const [vehicleReady, setVehicleReady] = useState(false);

  // ── Animations ────────────────────────────────────────────
  const pulseAnim = useRef(new Animated.Value(0.4)).current;
  const expandAnim = useRef(new Animated.Value(1)).current;
  const panelFadeAnim = useRef(new Animated.Value(1)).current;

  // ── Subscribe to expedition state ─────────────────────────
  useEffect(() => {
    const unsubState = expeditionStateStore.subscribe((state, record) => {
      setExpState(state);
      setExpRecord(record);
    });

    const unsubTimeline = expeditionStateStore.subscribeTimeline((event) => {
      setTimelineEvents(prev => [event, ...prev].slice(0, 10));
    });

    const unsubVehicle = vehicleSetupStore.subscribe(() => {
      setVehicleId(vehicleSetupStore.getActiveVehicleId());
    });

    // Load initial timeline
    const record = expeditionStateStore.getCurrentExpedition();
    if (record) {
      setTimelineEvents(expeditionStateStore.getTimeline(record.id).slice(0, 10));
    }

    return () => {
      unsubState();
      unsubTimeline();
      unsubVehicle();
    };
  }, []);

  // ── Resolve vehicle name ──────────────────────────────────
  useEffect(() => {
    if (!vehicleId) {
      setVehicleName('');
      setVehicleReady(false);
      return;
    }
    let cancelled = false;
    vehicleStore.getAll(user?.id || null).then(({ vehicles }) => {
      if (cancelled) return;
      const match = vehicles.find(v => v.id === vehicleId);
      if (match) {
        setVehicleName(match.name || 'Vehicle');
        setVehicleReady(true);
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [vehicleId, user?.id]);

  // ── Elapsed time ticker (active state only) ───────────────
  useEffect(() => {
    if (expState !== 'active') {
      setElapsedSeconds(0);
      return;
    }
    const tick = () => setElapsedSeconds(expeditionStateStore.getElapsedSeconds());
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expState]);

  // ── Pulse animation for active state ──────────────────────
  useEffect(() => {
    if (expState === 'active') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.4, duration: 1200, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(0.4);
    }
  }, [expState, pulseAnim]);

  // ── Begin Expedition Handler ──────────────────────────────
  const handleBeginExpedition = useCallback(() => {
    if (!vehicleId || !vehicleName) {
      showToast('Select a vehicle first');
      return;
    }

    Alert.alert(
      'Begin Expedition',
      `Start expedition with ${vehicleName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Begin',
          onPress: () => {
            expeditionStateStore.beginExpedition({
              activeVehicleId: vehicleId,
              vehicleName,
              userId: user?.id,
            });
            showToast('Expedition started');
            onExpeditionStarted?.();
          },
        },
      ]
    );
  }, [vehicleId, vehicleName, user?.id, showToast, onExpeditionStarted]);

  // ── End Expedition Handler ────────────────────────────────
  const handleEndExpedition = useCallback(() => {
    Alert.alert(
      'End Expedition',
      'Are you sure you want to end the current expedition?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Expedition',
          style: 'destructive',
          onPress: () => {
            expeditionStateStore.endExpedition({ userId: user?.id });
            showToast('Expedition ended');
            onExpeditionEnded?.();
          },
        },
      ]
    );
  }, [user?.id, showToast, onExpeditionEnded]);

  // ── Dismiss / Return to Standby ───────────────────────────
  const handleReturnToStandby = useCallback(() => {
    expeditionStateStore.dismissExpedition();
    showToast('Returned to standby');
  }, [showToast]);

  // ── Format elapsed time as HH:MM:SS ──────────────────────
  const elapsedFormatted = useMemo(() => {
    const h = Math.floor(elapsedSeconds / 3600);
    const m = Math.floor((elapsedSeconds % 3600) / 60);
    const s = elapsedSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }, [elapsedSeconds]);

  // ── State Badge ───────────────────────────────────────────
  const stateBadge = useMemo(() => {
    switch (expState) {
      case 'active':
        return { label: 'ACTIVE', color: CP.greenPulse, bg: CP.greenSoft, border: CP.greenBorder };
      case 'complete':
        return { label: 'COMPLETE', color: CP.gold, bg: CP.completeBg, border: CP.completeBorder };
      default:
        return { label: 'STANDBY', color: CP.textMuted, bg: 'rgba(139,148,158,0.06)', border: 'rgba(139,148,158,0.15)' };
    }
  }, [expState]);

  // ── Render ────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Panel Header */}
      <View style={styles.panelHeader}>
        <View style={styles.headerLeft}>
          <Ionicons name="shield-checkmark-outline" size={14} color={CP.gold} />
          <Text style={styles.headerTitle}>ECS EXPEDITION CONTROL</Text>
        </View>
        <View style={[styles.stateBadge, { backgroundColor: stateBadge.bg, borderColor: stateBadge.border }]}>
          {expState === 'active' && (
            <Animated.View style={[styles.pulseDot, { backgroundColor: stateBadge.color, opacity: pulseAnim }]} />
          )}
          {expState !== 'active' && (
            <View style={[styles.staticDot, { backgroundColor: stateBadge.color }]} />
          )}
          <Text style={[styles.stateBadgeText, { color: stateBadge.color }]}>{stateBadge.label}</Text>
        </View>
      </View>

      <View style={styles.goldDivider} />

      {/* ── STANDBY STATE ──────────────────────────────────── */}
      {expState === 'standby' && (
        <View style={styles.stateContent}>
          <View style={styles.standbyRow}>
            <View style={styles.standbyInfo}>
              <View style={styles.standbyIconRow}>
                <View style={styles.standbyIconWrap}>
                  <Ionicons name="car-outline" size={16} color={vehicleReady ? CP.gold : CP.textDim} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.standbyLabel}>
                    {vehicleReady ? 'VEHICLE READY' : 'NO VEHICLE SELECTED'}
                  </Text>
                  <Text style={styles.standbyVehicle} numberOfLines={1}>
                    {vehicleName || 'Select a vehicle to begin'}
                  </Text>
                </View>
              </View>

              {/* Readiness indicators */}
              <View style={styles.readinessRow}>
                <View style={styles.readinessChip}>
                  <View style={[styles.readinessDot, { backgroundColor: vehicleReady ? CP.gold : CP.textDim }]} />
                  <Text style={[styles.readinessText, { color: vehicleReady ? CP.textPrimary : CP.textDim }]}>
                    Loadout
                  </Text>
                </View>
                <View style={styles.readinessChip}>
                  <View style={[styles.readinessDot, { backgroundColor: CP.textDim }]} />
                  <Text style={[styles.readinessText, { color: CP.textDim }]}>Navigation</Text>
                </View>
                <View style={styles.readinessChip}>
                  <View style={[styles.readinessDot, { backgroundColor: CP.textDim }]} />
                  <Text style={[styles.readinessText, { color: CP.textDim }]}>Telemetry</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Begin Expedition Button */}
          <TouchableOpacity
            style={[
              styles.actionBtn,
              styles.beginBtn,
              !vehicleReady && styles.actionBtnDisabled,
            ]}
            onPress={handleBeginExpedition}
            activeOpacity={0.8}
            disabled={!vehicleReady}
          >
            <Ionicons name="play-outline" size={14} color={vehicleReady ? '#0B0E12' : CP.textDim} />
            <Text style={[styles.actionBtnText, styles.beginBtnText, !vehicleReady && styles.actionBtnTextDisabled]}>
              BEGIN EXPEDITION
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── ACTIVE STATE ───────────────────────────────────── */}
      {expState === 'active' && expRecord && (
        <View style={styles.stateContent}>
          {/* Vehicle + Timer Row */}
          <View style={styles.activeHeader}>
            <View style={styles.activeVehicleRow}>
              <View style={[styles.activeDotLive, { backgroundColor: CP.greenPulse }]} />
              <Text style={styles.activeVehicleName} numberOfLines={1}>
                {expRecord.vehicleName}
              </Text>
            </View>
            <Text style={styles.activeTimerLabel}>ELAPSED</Text>
          </View>

          {/* Timer Display */}
          <View style={styles.timerRow}>
            <Text style={styles.timerText}>{elapsedFormatted}</Text>
          </View>

          {/* Active Stats */}
          <View style={styles.activeStatsRow}>
            <View style={styles.activeStat}>
              <Ionicons name="navigate-outline" size={12} color={CP.textMuted} />
              <Text style={styles.activeStatValue}>
                {expRecord.distance ? formatDistance(expRecord.distance) : '0m'}
              </Text>
              <Text style={styles.activeStatLabel}>DISTANCE</Text>
            </View>
            <View style={styles.activeStatDivider} />
            <View style={styles.activeStat}>
              <Ionicons name="compass-outline" size={12} color={CP.textMuted} />
              <Text style={styles.activeStatValue}>
                {expRecord.peakRemoteness != null ? `${expRecord.peakRemoteness.toFixed(0)}` : '--'}
              </Text>
              <Text style={styles.activeStatLabel}>REMOTENESS</Text>
            </View>
            <View style={styles.activeStatDivider} />
            <View style={styles.activeStat}>
              <Ionicons name="pulse-outline" size={12} color={CP.textMuted} />
              <Text style={styles.activeStatValue}>
                {timelineEvents.length}
              </Text>
              <Text style={styles.activeStatLabel}>EVENTS</Text>
            </View>
          </View>

          {/* End Expedition Button */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.endBtn]}
            onPress={handleEndExpedition}
            activeOpacity={0.8}
          >
            <Ionicons name="flag-outline" size={14} color={CP.danger} />
            <Text style={[styles.actionBtnText, styles.endBtnText]}>END EXPEDITION</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── COMPLETE STATE ─────────────────────────────────── */}
      {expState === 'complete' && expRecord && (
        <View style={styles.stateContent}>
          <View style={styles.completeHeader}>
            <View style={styles.completeIconWrap}>
              <Ionicons name="flag-outline" size={18} color={CP.gold} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.completeTitle}>EXPEDITION COMPLETE</Text>
              <Text style={styles.completeVehicle} numberOfLines={1}>{expRecord.vehicleName}</Text>
            </View>
          </View>

          {/* Summary Stats */}
          <View style={styles.completeStatsGrid}>
            <CompleteStat
              icon="time-outline"
              label="DURATION"
              value={expRecord.duration ? formatDuration(expRecord.duration) : '--'}
            />
            <CompleteStat
              icon="navigate-outline"
              label="DISTANCE"
              value={expRecord.distance ? formatDistance(expRecord.distance) : '--'}
            />
            <CompleteStat
              icon="flame-outline"
              label="FUEL USED"
              value={expRecord.fuelDelta != null ? `${expRecord.fuelDelta.toFixed(1)} gal` : '--'}
            />
            <CompleteStat
              icon="water-outline"
              label="WATER USED"
              value={expRecord.waterDelta != null ? `${expRecord.waterDelta.toFixed(1)} gal` : '--'}
            />
          </View>

          {/* Return to Standby Button */}
          <TouchableOpacity
            style={[styles.actionBtn, styles.standbyBtn]}
            onPress={handleReturnToStandby}
            activeOpacity={0.8}
          >
            <Ionicons name="refresh-outline" size={14} color={CP.gold} />
            <Text style={[styles.actionBtnText, styles.standbyBtnText]}>RETURN TO STANDBY</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom structural gold rail */}
      <View style={styles.bottomRail} />
    </View>
  );
}

// ── Complete Stat Sub-Component ──────────────────────────────
function CompleteStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.completeStat}>
      <Ionicons name={icon as any} size={12} color={CP.textMuted} />
      <Text style={styles.completeStatValue}>{value}</Text>
      <Text style={styles.completeStatLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    backgroundColor: CP.bg,
    borderBottomWidth: 0,
    overflow: 'hidden',
  },

  // ── Panel Header ──────────────────────────────────────
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 3,
    color: CP.gold,
  },

  // ── State Badge ───────────────────────────────────────
  stateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  staticDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  stateBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
  },

  // ── Gold Divider ──────────────────────────────────────
  goldDivider: {
    height: GOLD_RAIL.subsectionWidth,
    backgroundColor: GOLD_RAIL.subsection,
    marginHorizontal: 16,
  },

  // ── State Content ─────────────────────────────────────
  stateContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 12,
  },

  // ── STANDBY ───────────────────────────────────────────
  standbyRow: {
    marginBottom: 10,
  },
  standbyInfo: {
    gap: 8,
  },
  standbyIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  standbyIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(212,160,23,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  standbyLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    color: CP.textMuted,
  },
  standbyVehicle: {
    fontSize: 13,
    fontWeight: '700',
    color: CP.textPrimary,
    letterSpacing: 0.5,
    marginTop: 1,
  },
  readinessRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 2,
    paddingLeft: 42,
  },
  readinessChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  readinessDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  readinessText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ── ACTIVE ────────────────────────────────────────────
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  activeVehicleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  activeDotLive: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  activeVehicleName: {
    fontSize: 13,
    fontWeight: '700',
    color: CP.textPrimary,
    letterSpacing: 0.5,
    flex: 1,
  },
  activeTimerLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 2,
    color: CP.textMuted,
  },

  // ── Timer ─────────────────────────────────────────────
  timerRow: {
    alignItems: 'flex-end',
    marginBottom: 10,
  },
  timerText: {
    fontSize: 28,
    fontWeight: '200',
    letterSpacing: 4,
    color: CP.greenPulse,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  // ── Active Stats ──────────────────────────────────────
  activeStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(76,175,80,0.03)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(76,175,80,0.10)',
    paddingVertical: 8,
  },
  activeStat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  activeStatValue: {
    fontSize: 13,
    fontWeight: '700',
    color: CP.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  activeStatLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: CP.textDim,
  },
  activeStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(76,175,80,0.12)',
  },

  // ── COMPLETE ──────────────────────────────────────────
  completeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  completeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeTitle: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 2,
    color: CP.gold,
  },
  completeVehicle: {
    fontSize: 13,
    fontWeight: '700',
    color: CP.textPrimary,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  completeStatsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  completeStat: {
    width: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: 'rgba(212,160,23,0.03)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.08)',
  },
  completeStatValue: {
    fontSize: 12,
    fontWeight: '700',
    color: CP.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    flex: 1,
  },
  completeStatLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
    color: CP.textDim,
  },

  // ── Action Buttons ────────────────────────────────────
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 8,
    borderWidth: 1.5,
  },
  actionBtnDisabled: {
    opacity: 0.4,
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 3,
  },
  actionBtnTextDisabled: {
    color: CP.textDim,
  },

  // Begin button — gold filled
  beginBtn: {
    backgroundColor: CP.gold,
    borderColor: CP.gold,
  },
  beginBtnText: {
    color: '#0B0E12',
  },

  // End button — danger outline
  endBtn: {
    backgroundColor: CP.dangerBg,
    borderColor: CP.dangerBorder,
  },
  endBtnText: {
    color: CP.danger,
  },

  // Standby button — gold outline
  standbyBtn: {
    backgroundColor: CP.goldSoft,
    borderColor: CP.goldBorder,
  },
  standbyBtnText: {
    color: CP.gold,
  },

  // ── Bottom Rail ───────────────────────────────────────
  bottomRail: {
    height: 1,
    backgroundColor: GOLD_RAIL.section,
  },
});





