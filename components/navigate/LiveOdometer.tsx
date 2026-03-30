// ============================================================
// ECS LIVE ODOMETER — GPS Distance Tracking Overlay
// ============================================================
// Floating overlay for the Navigate tab showing:
//   - Live odometer (total distance tracked)
//   - Trip distance since reset
//   - Current speed + heading
//   - Fuel range estimate from real driving data
//   - GPS tracking status indicator
//   - Pause/resume toggle
//   - Accuracy indicator
//   - Tappable for detail modal
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ScrollView,
  Animated,
  Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import {
  gpsDistanceTracker,
  type TrackerSnapshot,
  type TrackingStatus,
  type TrackingAccuracy,
} from '../../lib/gpsDistanceTracker';
import { hapticMicro, hapticCommand } from '../../lib/haptics';

interface Props {
  expeditionId: string | null;
  expeditionName: string | null;
  visible?: boolean;
  showToast?: (msg: string) => void;
}

// ── Status Colors ────────────────────────────────────────────

function getStatusColor(status: TrackingStatus): string {
  switch (status) {
    case 'tracking': return '#4CAF50';
    case 'paused': return '#C48A2C';
    case 'error': return '#E53935';
    default: return '#8A8A85';
  }
}

function getStatusLabel(status: TrackingStatus): string {
  switch (status) {
    case 'tracking': return 'TRACKING';
    case 'paused': return 'PAUSED';
    case 'error': return 'ERROR';
    default: return 'IDLE';
  }
}

function getAccuracyIcon(accuracy: number | null): { icon: string; color: string; label: string } {
  if (accuracy === null) return { icon: 'radio-outline', color: '#8A8A85', label: 'NO FIX' };
  if (accuracy <= 10) return { icon: 'radio-outline', color: '#4CAF50', label: 'HIGH' };
  if (accuracy <= 30) return { icon: 'radio-outline', color: '#C48A2C', label: 'MED' };
  return { icon: 'radio-outline', color: '#E53935', label: 'LOW' };
}

function getFuelColor(percent: number | null): string {
  if (percent === null) return '#8A8A85';
  if (percent > 35) return '#4CAF50';
  if (percent >= 15) return '#C48A2C';
  return '#E53935';
}

// ── Elapsed Timer ────────────────────────────────────────────

function formatElapsed(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function LiveOdometer({ expeditionId, expeditionName, visible = true, showToast }: Props) {
  const [snapshot, setSnapshot] = useState<TrackerSnapshot | null>(null);
  const [detailVisible, setDetailVisible] = useState(false);
  const [elapsedTick, setElapsedTick] = useState(0);
  const pulseAnim = useRef(new Animated.Value(0.6)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  // Subscribe to tracker updates
  useEffect(() => {
    const unsub = gpsDistanceTracker.subscribe((snap) => {
      setSnapshot(snap);
    });

    // Initial snapshot
    setSnapshot(gpsDistanceTracker.getSnapshot());

    return unsub;
  }, []);

  // Elapsed time ticker
  useEffect(() => {
    if (snapshot?.config.status === 'tracking') {
      const timer = setInterval(() => setElapsedTick(t => t + 1), 1000);
      return () => clearInterval(timer);
    }
  }, [snapshot?.config.status]);

  // Pulse animation for tracking status
  useEffect(() => {
    if (snapshot?.config.status === 'tracking') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 0.6, duration: 800, useNativeDriver: true }),
        ]),
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [snapshot?.config.status, pulseAnim]);

  // Fade in
  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, fadeAnim]);

  // ── Handlers ───────────────────────────────────────────────

  const handleToggleTracking = useCallback(async () => {
    hapticCommand();
    const status = gpsDistanceTracker.getStatus();

    if (status === 'idle') {
      if (!expeditionId) {
        showToast?.('NO ACTIVE EXPEDITION — LAUNCH ONE FIRST');
        return;
      }
      const ok = await gpsDistanceTracker.startTracking(expeditionId);
      if (ok) showToast?.('GPS TRACKING STARTED');
      else showToast?.('GPS TRACKING FAILED — CHECK PERMISSIONS');
    } else if (status === 'tracking') {
      gpsDistanceTracker.pauseTracking();
      showToast?.('GPS TRACKING PAUSED');
    } else if (status === 'paused') {
      const ok = await gpsDistanceTracker.resumeTracking();
      if (ok) showToast?.('GPS TRACKING RESUMED');
      else showToast?.('RESUME FAILED');
    } else if (status === 'error') {
      if (!expeditionId) return;
      const ok = await gpsDistanceTracker.startTracking(expeditionId);
      if (ok) showToast?.('GPS TRACKING RESTARTED');
    }
  }, [expeditionId, showToast]);

  const handleStopTracking = useCallback(() => {
    hapticCommand();
    gpsDistanceTracker.stopTracking();
    showToast?.('GPS TRACKING STOPPED');
  }, [showToast]);

  const handleResetTrip = useCallback(() => {
    hapticMicro();
    gpsDistanceTracker.resetTrip();
    showToast?.('TRIP ODOMETER RESET');
  }, [showToast]);

  const handleSetAccuracy = useCallback((acc: TrackingAccuracy) => {
    hapticMicro();
    gpsDistanceTracker.setAccuracy(acc);
    showToast?.(`ACCURACY: ${acc.toUpperCase()}`);
  }, [showToast]);

  const handleToggleBackground = useCallback(async () => {
    hapticMicro();
    if (!snapshot) return;
    await gpsDistanceTracker.setBackgroundEnabled(!snapshot.config.backgroundEnabled);
    showToast?.(snapshot.config.backgroundEnabled ? 'BACKGROUND TRACKING OFF' : 'BACKGROUND TRACKING ON');
  }, [snapshot, showToast]);

  if (!visible) return null;

  const status = snapshot?.config.status || 'idle';
  const odo = snapshot?.odometer;
  const isActive = status === 'tracking' || status === 'paused';
  const statusColor = getStatusColor(status);
  const accuracyInfo = getAccuracyIcon(odo?.currentAccuracyM ?? null);
  const fuelColor = getFuelColor(snapshot?.fuelPercent ?? null);

  // ── Compact Overlay (when idle or no expedition) ───────────

  if (!isActive && !expeditionId) {
    return null; // Don't show if no expedition
  }

  return (
    <>
      {/* ═══════════ COMPACT ODOMETER BAR ═══════════ */}
      <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
        <TouchableOpacity
          style={[styles.odometerBar, isActive && styles.odometerBarActive]}
          onPress={() => { hapticMicro(); setDetailVisible(true); }}
          activeOpacity={0.85}
        >
          {/* Status indicator */}
          <Animated.View style={[
            styles.statusDot,
            { backgroundColor: statusColor, opacity: status === 'tracking' ? pulseAnim : 1 },
          ]} />

          {/* Odometer reading */}
          <View style={styles.odometerReadout}>
            <Text style={styles.odometerValue}>
              {odo ? gpsDistanceTracker.formatDistance(odo.totalDistanceMi) : '0.00 mi'}
            </Text>
            <Text style={styles.odometerLabel}>ODO</Text>
          </View>

          <View style={styles.divider} />

          {/* Speed */}
          <View style={styles.speedReadout}>
            <Text style={styles.speedValue}>
              {odo && isActive ? Math.round(odo.currentSpeedMph) : '--'}
            </Text>
            <Text style={styles.speedUnit}>MPH</Text>
          </View>

          <View style={styles.divider} />

          {/* Fuel range */}
          <View style={styles.fuelReadout}>
            <Text style={[styles.fuelValue, { color: fuelColor }]}>
              {snapshot?.fuelRangeMi !== null && snapshot?.fuelRangeMi !== undefined
                ? `${snapshot.fuelRangeMi}`
                : '--'}
            </Text>
            <Text style={styles.fuelUnit}>RNG MI</Text>
          </View>

          <View style={styles.divider} />

          {/* Toggle button */}
          <TouchableOpacity
            style={[styles.toggleBtn, { borderColor: statusColor + '60' }]}
            onPress={handleToggleTracking}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Ionicons
              name={status === 'tracking' ? 'pause' : status === 'paused' ? 'play' : 'navigate-outline'}
              size={12}
              color={statusColor}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Animated.View>

      {/* ═══════════ DETAIL MODAL ═══════════ */}
      <Modal visible={detailVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <TouchableOpacity style={styles.modalBackdrop} onPress={() => setDetailVisible(false)} activeOpacity={1} />
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />

            {/* Header */}
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={[styles.modalStatusDot, { backgroundColor: statusColor }]} />
                <Text style={styles.modalTitle}>GPS DISTANCE TRACKER</Text>
                <View style={[styles.statusBadge, { borderColor: statusColor + '40' }]}>
                  <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                    {getStatusLabel(status)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setDetailVisible(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
              {/* Expedition context */}
              {expeditionName && (
                <View style={styles.expContext}>
                  <View style={styles.expDot} />
                  <Text style={styles.expName} numberOfLines={1}>{expeditionName}</Text>
                </View>
              )}

              {/* ── Primary Odometer ──────────────────────── */}
              <View style={styles.primaryOdo}>
                <Text style={styles.primaryOdoLabel}>TOTAL DISTANCE</Text>
                <Text style={styles.primaryOdoValue}>
                  {odo ? odo.totalDistanceMi.toFixed(2) : '0.00'}
                </Text>
                <Text style={styles.primaryOdoUnit}>MILES</Text>
              </View>

              {/* ── Trip Odometer ─────────────────────────── */}
              <View style={styles.tripRow}>
                <View style={styles.tripOdo}>
                  <Text style={styles.tripLabel}>TRIP</Text>
                  <Text style={styles.tripValue}>
                    {odo ? odo.tripDistanceMi.toFixed(2) : '0.00'} mi
                  </Text>
                </View>
                <TouchableOpacity style={styles.tripResetBtn} onPress={handleResetTrip} activeOpacity={0.7}>
                  <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
                  <Text style={styles.tripResetText}>RESET</Text>
                </TouchableOpacity>
              </View>

              {/* ── Stats Grid ────────────────────────────── */}
              <View style={styles.statsGrid}>
                <StatCard
                  label="SPEED"
                  value={odo && isActive ? `${Math.round(odo.currentSpeedMph)}` : '--'}
                  unit="MPH"
                  color={TACTICAL.text}
                />
                <StatCard
                  label="AVG SPEED"
                  value={odo ? `${odo.avgSpeedMph.toFixed(1)}` : '--'}
                  unit="MPH"
                  color={TACTICAL.amber}
                />
                <StatCard
                  label="MAX SPEED"
                  value={odo ? `${odo.maxSpeedMph.toFixed(1)}` : '--'}
                  unit="MPH"
                  color="#E53935"
                />
                <StatCard
                  label="ELAPSED"
                  value={odo ? formatElapsed(odo.elapsedTrackingSec) : '0:00'}
                  unit=""
                  color={TACTICAL.text}
                />
                <StatCard
                  label="HEADING"
                  value={odo?.currentHeadingDeg !== null && odo?.currentHeadingDeg !== undefined ? `${odo.currentHeadingDeg}` : '--'}
                  unit="DEG"
                  color={TACTICAL.text}
                />
                <StatCard
                  label="ALTITUDE"
                  value={odo?.currentAltitudeFt !== null && odo?.currentAltitudeFt !== undefined ? `${odo.currentAltitudeFt.toLocaleString()}` : '--'}
                  unit="FT"
                  color={TACTICAL.text}
                />
              </View>

              {/* ── Fuel Range Section ────────────────────── */}
              <View style={styles.sectionHeader}>
                <Ionicons name="speedometer-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.sectionTitle}>FUEL RANGE ESTIMATOR</Text>
              </View>

              <View style={styles.fuelCard}>
                <View style={styles.fuelRow}>
                  <View style={styles.fuelStat}>
                    <Text style={styles.fuelStatLabel}>RANGE</Text>
                    <Text style={[styles.fuelStatValue, { color: fuelColor }]}>
                      {snapshot?.fuelRangeMi !== null && snapshot?.fuelRangeMi !== undefined
                        ? `${snapshot.fuelRangeMi} mi`
                        : '--'}
                    </Text>
                  </View>
                  <View style={styles.fuelStat}>
                    <Text style={styles.fuelStatLabel}>FUEL</Text>
                    <Text style={[styles.fuelStatValue, { color: fuelColor }]}>
                      {snapshot?.fuelRemainingGal !== null && snapshot?.fuelRemainingGal !== undefined
                        ? `${snapshot.fuelRemainingGal.toFixed(1)} gal`
                        : '--'}
                    </Text>
                  </View>
                  <View style={styles.fuelStat}>
                    <Text style={styles.fuelStatLabel}>FUEL %</Text>
                    <Text style={[styles.fuelStatValue, { color: fuelColor }]}>
                      {snapshot?.fuelPercent !== null && snapshot?.fuelPercent !== undefined
                        ? `${snapshot.fuelPercent}%`
                        : '--'}
                    </Text>
                  </View>
                </View>

                {/* MPG comparison */}
                <View style={styles.mpgRow}>
                  <View style={styles.mpgItem}>
                    <Text style={styles.mpgLabel}>RATED MPG</Text>
                    <Text style={styles.mpgValue}>
                      {snapshot?.ratedMpg !== null && snapshot?.ratedMpg !== undefined
                        ? `${snapshot.ratedMpg}`
                        : '--'}
                    </Text>
                  </View>
                  <Ionicons name="arrow-forward" size={12} color={TACTICAL.textMuted} />
                  <View style={styles.mpgItem}>
                    <Text style={styles.mpgLabel}>ACTUAL MPG</Text>
                    <Text style={[styles.mpgValue, {
                      color: snapshot?.actualMpg && snapshot?.ratedMpg
                        ? snapshot.actualMpg >= snapshot.ratedMpg ? '#4CAF50' : '#E53935'
                        : TACTICAL.text,
                    }]}>
                      {snapshot?.actualMpg !== null && snapshot?.actualMpg !== undefined
                        ? `${snapshot.actualMpg}`
                        : '--'}
                    </Text>
                  </View>
                  {snapshot?.actualMpg && snapshot?.ratedMpg ? (
                    <View style={[styles.mpgDelta, {
                      backgroundColor: snapshot.actualMpg >= snapshot.ratedMpg
                        ? 'rgba(76,175,80,0.12)' : 'rgba(229,57,53,0.12)',
                      borderColor: snapshot.actualMpg >= snapshot.ratedMpg
                        ? 'rgba(76,175,80,0.3)' : 'rgba(229,57,53,0.3)',
                    }]}>
                      <Text style={[styles.mpgDeltaText, {
                        color: snapshot.actualMpg >= snapshot.ratedMpg ? '#4CAF50' : '#E53935',
                      }]}>
                        {snapshot.actualMpg >= snapshot.ratedMpg ? '+' : ''}
                        {((snapshot.actualMpg - snapshot.ratedMpg) / snapshot.ratedMpg * 100).toFixed(0)}%
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>

              {/* ── GPS Quality ────────────────────────────── */}
              <View style={styles.sectionHeader}>
                <Ionicons name="radio-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.sectionTitle}>GPS QUALITY</Text>
              </View>

              <View style={styles.gpsCard}>
                <View style={styles.gpsRow}>
                  <View style={styles.gpsStat}>
                    <Text style={styles.gpsLabel}>ACCURACY</Text>
                    <View style={styles.gpsValueRow}>
                      <View style={[styles.gpsQualityDot, { backgroundColor: accuracyInfo.color }]} />
                      <Text style={[styles.gpsValue, { color: accuracyInfo.color }]}>
                        {odo?.currentAccuracyM !== null && odo?.currentAccuracyM !== undefined
                          ? `${odo.currentAccuracyM}m`
                          : '--'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.gpsStat}>
                    <Text style={styles.gpsLabel}>SAMPLES</Text>
                    <Text style={styles.gpsValue}>{odo?.sampleCount || 0}</Text>
                  </View>
                  <View style={styles.gpsStat}>
                    <Text style={styles.gpsLabel}>MODE</Text>
                    <Text style={styles.gpsValue}>{snapshot?.config.accuracy.toUpperCase() || 'BAL'}</Text>
                  </View>
                </View>
              </View>

              {/* ── Tracking Settings ─────────────────────── */}
              <View style={styles.sectionHeader}>
                <Ionicons name="settings-outline" size={14} color={TACTICAL.amber} />
                <Text style={styles.sectionTitle}>TRACKING SETTINGS</Text>
              </View>

              {/* Accuracy selector */}
              <View style={styles.settingsRow}>
                <Text style={styles.settingsLabel}>ACCURACY</Text>
                <View style={styles.accuracyPills}>
                  {(['high', 'balanced', 'low'] as TrackingAccuracy[]).map(acc => (
                    <TouchableOpacity
                      key={acc}
                      style={[
                        styles.accuracyPill,
                        snapshot?.config.accuracy === acc && styles.accuracyPillActive,
                      ]}
                      onPress={() => handleSetAccuracy(acc)}
                      activeOpacity={0.7}
                    >
                      <Text style={[
                        styles.accuracyPillText,
                        snapshot?.config.accuracy === acc && styles.accuracyPillTextActive,
                      ]}>
                        {acc.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Background toggle */}
              <TouchableOpacity style={styles.settingsRow} onPress={handleToggleBackground} activeOpacity={0.7}>
                <Text style={styles.settingsLabel}>BACKGROUND TRACKING</Text>
                <View style={[
                  styles.toggleSwitch,
                  snapshot?.config.backgroundEnabled && styles.toggleSwitchActive,
                ]}>
                  <View style={[
                    styles.toggleKnob,
                    snapshot?.config.backgroundEnabled && styles.toggleKnobActive,
                  ]} />
                </View>
              </TouchableOpacity>

              <Text style={styles.settingsHint}>
                Background tracking uses battery-efficient settings. High accuracy recommended for off-road navigation.
              </Text>

              {/* ── Action Buttons ─────────────────────────── */}
              <View style={styles.actionRow}>
                {status === 'idle' ? (
                  <TouchableOpacity
                    style={[styles.actionBtn, styles.actionBtnPrimary]}
                    onPress={handleToggleTracking}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="navigate-outline" size={16} color="#0B0F12" />
                    <Text style={styles.actionBtnPrimaryText}>START TRACKING</Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <TouchableOpacity
                      style={[styles.actionBtn, status === 'tracking' ? styles.actionBtnWarn : styles.actionBtnPrimary]}
                      onPress={handleToggleTracking}
                      activeOpacity={0.8}
                    >
                      <Ionicons
                        name={status === 'tracking' ? 'pause' : 'play'}
                        size={16}
                        color={status === 'tracking' ? TACTICAL.amber : '#0B0F12'}
                      />
                      <Text style={status === 'tracking' ? styles.actionBtnWarnText : styles.actionBtnPrimaryText}>
                        {status === 'tracking' ? 'PAUSE' : 'RESUME'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionBtn, styles.actionBtnDanger]}
                      onPress={handleStopTracking}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="stop" size={16} color="#E53935" />
                      <Text style={styles.actionBtnDangerText}>STOP</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

// ── Stat Card Sub-Component ──────────────────────────────────

function StatCard({ label, value, unit, color }: {
  label: string; value: string; unit: string; color: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      {unit ? <Text style={styles.statUnit}>{unit}</Text> : null}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 54,
    left: 10,
    right: 10,
    zIndex: 28,
  },

  // ── Compact Odometer Bar ───────────────────────────────────
  odometerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(11,15,18,0.92)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(62,79,60,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 8,
  },
  odometerBarActive: {
    borderColor: 'rgba(76,175,80,0.35)',
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  odometerReadout: {
    alignItems: 'center',
    minWidth: 60,
  },
  odometerValue: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  odometerLabel: {
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 3,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },

  divider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(62,79,60,0.3)',
  },

  speedReadout: {
    alignItems: 'center',
    minWidth: 36,
  },
  speedValue: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  speedUnit: {
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },

  fuelReadout: {
    alignItems: 'center',
    minWidth: 44,
    flex: 1,
  },
  fuelValue: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  fuelUnit: {
    fontSize: 6,
    fontWeight: '700',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },

  toggleBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(62,79,60,0.1)',
  },

  // ── Detail Modal ───────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalSheet: {
    backgroundColor: TACTICAL.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    borderTopWidth: 2,
    borderColor: 'rgba(76,175,80,0.3)',
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(138,138,133,0.3)',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  modalStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  modalTitle: {
    ...TYPO.T3,
    color: TACTICAL.amber,
    fontSize: 12,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
  },

  expContext: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: 'rgba(102,187,106,0.06)',
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  expDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#66BB6A',
  },
  expName: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 2,
    color: '#66BB6A',
    textTransform: 'uppercase',
  },

  // ── Primary Odometer ───────────────────────────────────────
  primaryOdo: {
    alignItems: 'center',
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  primaryOdoLabel: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 5,
    color: TACTICAL.textMuted,
    marginBottom: 4,
  },
  primaryOdoValue: {
    fontFamily: 'Courier',
    fontSize: 42,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 2,
  },
  primaryOdoUnit: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 5,
    color: TACTICAL.amber,
    marginTop: 2,
  },

  // ── Trip Odometer ──────────────────────────────────────────
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  tripOdo: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  tripLabel: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 4,
    color: TACTICAL.textMuted,
  },
  tripValue: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: '700',
    color: TACTICAL.amber,
  },
  tripResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  tripResetText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 3,
    color: TACTICAL.amber,
  },

  // ── Stats Grid ─────────────────────────────────────────────
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 8,
  },
  statCard: {
    width: '30%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.06)',
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 3,
    color: TACTICAL.textMuted,
    marginBottom: 3,
  },
  statValue: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  statUnit: {
    fontSize: 7,
    fontWeight: '600',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
    marginTop: 1,
  },

  // ── Section Headers ────────────────────────────────────────
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 4,
    color: TACTICAL.amber,
  },

  // ── Fuel Card ──────────────────────────────────────────────
  fuelCard: {
    marginHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.06)',
    padding: 12,
    gap: 10,
  },
  fuelRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  fuelStat: {
    alignItems: 'center',
    gap: 3,
  },
  fuelStatLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 3,
    color: TACTICAL.textMuted,
  },
  fuelStatValue: {
    fontFamily: 'Courier',
    fontSize: 14,
    fontWeight: '700',
  },

  mpgRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
  },
  mpgItem: {
    alignItems: 'center',
    gap: 2,
  },
  mpgLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  mpgValue: {
    fontFamily: 'Courier',
    fontSize: 16,
    fontWeight: '700',
    color: TACTICAL.text,
  },
  mpgDelta: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
    borderWidth: 1,
  },
  mpgDeltaText: {
    fontFamily: 'Courier',
    fontSize: 11,
    fontWeight: '700',
  },

  // ── GPS Card ───────────────────────────────────────────────
  gpsCard: {
    marginHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(62,79,60,0.06)',
    padding: 12,
  },
  gpsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  gpsStat: {
    alignItems: 'center',
    gap: 4,
  },
  gpsLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 3,
    color: TACTICAL.textMuted,
  },
  gpsValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gpsQualityDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gpsValue: {
    fontFamily: 'Courier',
    fontSize: 13,
    fontWeight: '700',
    color: TACTICAL.text,
  },

  // ── Settings ───────────────────────────────────────────────
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: TACTICAL.border,
  },
  settingsLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 3,
    color: TACTICAL.text,
  },
  accuracyPills: {
    flexDirection: 'row',
    gap: 6,
  },
  accuracyPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  accuracyPillActive: {
    borderColor: TACTICAL.amber + '60',
    backgroundColor: 'rgba(196,138,44,0.12)',
  },
  accuracyPillText: {
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
  },
  accuracyPillTextActive: {
    color: TACTICAL.amber,
  },

  toggleSwitch: {
    width: 40,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(62,79,60,0.2)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  toggleSwitchActive: {
    backgroundColor: 'rgba(76,175,80,0.2)',
    borderColor: 'rgba(76,175,80,0.4)',
  },
  toggleKnob: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: TACTICAL.textMuted,
  },
  toggleKnobActive: {
    backgroundColor: '#4CAF50',
    alignSelf: 'flex-end',
  },

  settingsHint: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 4,
    lineHeight: 15,
  },

  // ── Action Buttons ─────────────────────────────────────────
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
  },
  actionBtnPrimary: {
    backgroundColor: TACTICAL.amber,
  },
  actionBtnPrimaryText: {
    ...TYPO.U1,
    color: '#0B0F12',
    letterSpacing: 3,
  },
  actionBtnWarn: {
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },
  actionBtnWarnText: {
    ...TYPO.U1,
    color: TACTICAL.amber,
    letterSpacing: 3,
  },
  actionBtnDanger: {
    borderWidth: 1,
    borderColor: 'rgba(229,57,53,0.3)',
    backgroundColor: 'rgba(229,57,53,0.06)',
  },
  actionBtnDangerText: {
    ...TYPO.U1,
    color: '#E53935',
    letterSpacing: 3,
  },
});



