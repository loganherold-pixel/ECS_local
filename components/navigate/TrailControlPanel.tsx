/**
 * TrailControlPanel — Compact Trail Recording Controls (Phase 2.8.1)
 *
 * Compact, non-intrusive control panel for trail recording.
 * Shows recording status, live stats, and control buttons.
 * ECS design system with dark glass styling.
 *
 * Does NOT block bottom menu.
 */
import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import ECSConfirmDialog from '../ECSConfirmDialog';

import { TACTICAL, TYPO, DENSITY } from '../../lib/theme';
import { trailStore, type TrailRecordingStatus, type TrailStats } from '../../lib/trailStore';
import { hapticMicro, hapticCommand } from '../../lib/haptics';

interface Props {
  status: TrailRecordingStatus;
  stats: TrailStats;
  activeExpeditionId: string | null;
  activeExpeditionName: string | null;
  onStatusChange: () => void;
  onExport: () => void;
  onReplay?: () => void;
  showToast: (msg: string) => void;
}


export default function TrailControlPanel({
  status, stats, activeExpeditionId, activeExpeditionName,
  onStatusChange, onExport, onReplay, showToast,
}: Props) {

  const [expanded, setExpanded] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  const isIdle = status === 'idle' || status === 'stopped';
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const hasSession = !isIdle;

  const handleStart = useCallback(() => {
    hapticCommand();
    trailStore.start(activeExpeditionId);
    onStatusChange();
    showToast('TRAIL RECORDING STARTED');
  }, [activeExpeditionId, onStatusChange, showToast]);

  const handlePause = useCallback(() => {
    hapticMicro();
    trailStore.pause();
    onStatusChange();
    showToast('TRAIL RECORDING PAUSED');
  }, [onStatusChange, showToast]);

  const handleResume = useCallback(() => {
    hapticCommand();
    trailStore.resume();
    onStatusChange();
    showToast('TRAIL RECORDING RESUMED');
  }, [onStatusChange, showToast]);

  const handleStop = useCallback(() => {
    hapticCommand();
    trailStore.stop(activeExpeditionName || null);
    setConfirmStop(false);
    onStatusChange();
    showToast('TRAIL SAVED');
  }, [activeExpeditionName, onStatusChange, showToast]);


  const handleClear = useCallback(() => {
    trailStore.clear();
    onStatusChange();
  }, [onStatusChange]);

  const toggleExpanded = useCallback(() => {
    hapticMicro();
    setExpanded(prev => !prev);
  }, []);

  // ── Status indicator ──────────────────────────────────────
  const statusColor = isRecording ? '#EF5350' : isPaused ? TACTICAL.amber : TACTICAL.textMuted;
  const statusLabel = isRecording ? 'RECORDING' : isPaused ? 'PAUSED' : 'IDLE';

  return (
    <View style={styles.container}>
      {/* ── Header row (always visible) ──────────────────── */}
      <TouchableOpacity
        style={styles.headerRow}
        onPress={toggleExpanded}
        activeOpacity={0.8}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]}>
            {isRecording && <View style={styles.recordingPulse} />}
          </View>
          <Ionicons name="trail-sign-outline" size={14} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>TRAIL</Text>
          <View style={[styles.statusBadge, { borderColor: statusColor + '60' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {hasSession && (
            <Text style={styles.headerStat}>
              {stats.distance_miles.toFixed(1)} MI
            </Text>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={TACTICAL.textMuted}
          />
        </View>
      </TouchableOpacity>

      {/* ── Expanded content ─────────────────────────────── */}
      {expanded && (
        <View style={styles.expandedContent}>
          {/* Stats row */}
          {hasSession && (
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.distance_miles.toFixed(2)}</Text>
                <Text style={styles.statLabel}>MI</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.elapsed_formatted}</Text>
                <Text style={styles.statLabel}>TIME</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.avg_speed_mph.toFixed(1)}</Text>
                <Text style={styles.statLabel}>AVG MPH</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{stats.point_count}</Text>
                <Text style={styles.statLabel}>PTS</Text>
              </View>
            </View>
          )}

          {/* Segment info */}
          {hasSession && stats.segment_count > 1 && (
            <View style={styles.segmentInfo}>
              <Ionicons name="git-branch-outline" size={11} color={TACTICAL.textMuted} />
              <Text style={styles.segmentText}>{stats.segment_count} SEGMENTS</Text>
            </View>
          )}

          {/* Expedition binding */}
          {activeExpeditionName && hasSession && (
            <View style={styles.expBinding}>
              <View style={styles.expDot} />
              <Text style={styles.expText} numberOfLines={1}>
                BOUND TO: {activeExpeditionName}
              </Text>
            </View>
          )}

          {/* Control buttons */}
          <View style={styles.controlRow}>
            {isIdle && (
              <TouchableOpacity
                style={styles.startBtn}
                onPress={handleStart}
                activeOpacity={0.8}
              >
                <Ionicons name="radio-button-on-outline" size={14} color="#0B0F12" />
                <Text style={styles.startBtnText}>START RECORDING</Text>
              </TouchableOpacity>
            )}

            {isRecording && (
              <>
                <TouchableOpacity
                  style={styles.pauseBtn}
                  onPress={handlePause}
                  activeOpacity={0.8}
                >
                  <Ionicons name="pause" size={14} color={TACTICAL.amber} />
                  <Text style={styles.pauseBtnText}>PAUSE</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.stopBtn}
                  onPress={() => setConfirmStop(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="stop" size={14} color="#EF5350" />
                  <Text style={styles.stopBtnText}>STOP</Text>
                </TouchableOpacity>
              </>
            )}

            {isPaused && (
              <>
                <TouchableOpacity
                  style={styles.resumeBtn}
                  onPress={handleResume}
                  activeOpacity={0.8}
                >
                  <Ionicons name="play" size={14} color="#0B0F12" />
                  <Text style={styles.resumeBtnText}>RESUME</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.stopBtn}
                  onPress={() => setConfirmStop(true)}
                  activeOpacity={0.8}
                >
                  <Ionicons name="stop" size={14} color="#EF5350" />
                  <Text style={styles.stopBtnText}>STOP & SAVE</Text>
                </TouchableOpacity>
              </>
            )}

            {/* Export button (when has data) */}
            {hasSession && stats.point_count > 0 && (
              <TouchableOpacity
                style={styles.exportBtn}
                onPress={onExport}
                activeOpacity={0.8}
              >
                <Ionicons name="share-outline" size={13} color={TACTICAL.amber} />
              </TouchableOpacity>
            )}
          </View>

          {/* Replay button (when trail has data and not actively recording) */}
          {stats.point_count >= 2 && !isRecording && onReplay && (
            <TouchableOpacity
              style={styles.replayBtn}
              onPress={() => { hapticCommand(); onReplay(); }}
              activeOpacity={0.8}
            >
              <Ionicons name="play-circle-outline" size={14} color="#4A90D9" />
              <Text style={styles.replayBtnText}>REPLAY TRAIL</Text>
            </TouchableOpacity>
          )}

          {/* Stopped state — clear option */}
          {status === 'stopped' && (
            <TouchableOpacity
              style={styles.clearBtn}
              onPress={handleClear}
              activeOpacity={0.8}
            >
              <Ionicons name="trash-outline" size={11} color={TACTICAL.textMuted} />
              <Text style={styles.clearBtnText}>CLEAR SESSION</Text>
            </TouchableOpacity>
          )}


          {/* Free drive note */}
          {!activeExpeditionId && isIdle && (
            <View style={styles.freeNote}>
              <Ionicons name="information-circle-outline" size={11} color={TACTICAL.textMuted} />
              <Text style={styles.freeNoteText}>
                No active expedition. Trail will be saved as free drive.
              </Text>
            </View>
          )}
        </View>
      )}

      <ECSConfirmDialog
        visible={confirmStop}
        title="End Recording?"
        message={`Trail will be saved with ${stats.point_count} points (${stats.distance_miles.toFixed(2)} mi).`}
        icon="stop-circle-outline"
        cancelLabel="Cancel"
        confirmLabel="Stop & Save"
        destructive
        onCancel={() => setConfirmStop(false)}
        onConfirm={handleStop}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: DENSITY.screenPad,
    marginBottom: DENSITY.cardGap,
    backgroundColor: TACTICAL.panel,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    overflow: 'hidden',
  },

  // ── Header ──────────────────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    ...TYPO.T4,
    color: TACTICAL.amber,
    fontSize: 10,
    letterSpacing: 4,
  },
  headerStat: {
    fontFamily: 'Courier',
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },

  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    position: 'relative',
  },
  recordingPulse: {
    position: 'absolute',
    top: -3,
    left: -3,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1.5,
    borderColor: 'rgba(239,83,80,0.4)',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  statusText: {
    ...TYPO.U2,
    fontSize: 7,
    letterSpacing: 3,
  },

  // ── Expanded ────────────────────────────────────────────
  expandedContent: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: TACTICAL.border,
    paddingTop: 12,
    gap: 10,
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: 'Courier',
    fontSize: 14,
    fontWeight: '700',
    color: TACTICAL.text,
    letterSpacing: 0.5,
  },
  statLabel: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: TACTICAL.border,
  },

  segmentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  segmentText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 3,
  },

  expBinding: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  expDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#66BB6A',
  },
  expText: {
    ...TYPO.U2,
    fontSize: 7,
    color: '#66BB6A',
    letterSpacing: 2,
    maxWidth: 200,
  },

  // ── Controls ────────────────────────────────────────────
  controlRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },

  startBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: TACTICAL.amber,
    paddingVertical: 10,
    borderRadius: 8,
  },
  startBtnText: {
    ...TYPO.U1,
    color: '#0B0F12',
    fontSize: 11,
    letterSpacing: 3,
  },

  pauseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: TACTICAL.amber + '60',
    backgroundColor: 'rgba(196,138,44,0.1)',
  },
  pauseBtnText: {
    ...TYPO.U2,
    color: TACTICAL.amber,
    fontSize: 9,
    letterSpacing: 3,
  },

  resumeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#66BB6A',
    paddingVertical: 10,
    borderRadius: 8,
  },
  resumeBtnText: {
    ...TYPO.U1,
    color: '#0B0F12',
    fontSize: 11,
    letterSpacing: 3,
  },

  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.4)',
    backgroundColor: 'rgba(239,83,80,0.08)',
  },
  stopBtnText: {
    ...TYPO.U2,
    color: '#EF5350',
    fontSize: 8,
    letterSpacing: 2,
  },

  exportBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.amber + '40',
    backgroundColor: 'rgba(196,138,44,0.08)',
  },

  replayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: 'rgba(74,144,217,0.4)',
    backgroundColor: 'rgba(74,144,217,0.08)',
  },
  replayBtnText: {
    ...TYPO.U2,
    color: '#4A90D9',
    fontSize: 9,
    letterSpacing: 3,
  },


  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
  },
  clearBtnText: {
    ...TYPO.U2,
    fontSize: 7,
    color: TACTICAL.textMuted,
    letterSpacing: 2,
  },

  freeNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  freeNoteText: {
    ...TYPO.B2,
    fontSize: 10,
    color: TACTICAL.textMuted,
    flex: 1,
  },
});



