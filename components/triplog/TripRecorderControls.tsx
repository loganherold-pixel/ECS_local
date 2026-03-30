/**
 * TripRecorderControls — Recording control bar with live status
 *
 * Shows:
 *   - Recording state indicator (recording/paused/idle)
 *   - Start/Pause/Resume/Stop buttons
 *   - Live stats: elapsed time, distance, speed
 *   - Quick actions: add note, log camp, log fuel
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, TextInput, Modal, Platform,
} from 'react-native';
import { SafeIcon as Ionicons } from '../../components/SafeIcon';
import { TACTICAL } from '../../lib/theme';
import { tripRecorderEngine, formatDuration, formatDistance } from '../../lib/tripRecorderEngine';
import type { ActiveRecordingState } from '../../lib/tripRecorderTypes';

interface Props {
  compact?: boolean;
}

export default function TripRecorderControls({ compact = false }: Props) {
  const [state, setState] = useState<ActiveRecordingState>(tripRecorderEngine.getActiveState());
  const [noteVisible, setNoteVisible] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [quickActionsVisible, setQuickActionsVisible] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsub = tripRecorderEngine.subscribe(() => {
      setState(tripRecorderEngine.getActiveState());
    });

    // Tick every second for elapsed time
    tickRef.current = setInterval(() => {
      if (tripRecorderEngine.isRecording() || tripRecorderEngine.isPaused()) {
        setState(tripRecorderEngine.getActiveState());
      }
    }, 1000);

    return () => {
      unsub();
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, []);

  const handleStart = useCallback(() => {
    tripRecorderEngine.startRecording();
  }, []);

  const handlePause = useCallback(() => {
    tripRecorderEngine.pauseRecording();
  }, []);

  const handleResume = useCallback(() => {
    tripRecorderEngine.resumeRecording();
  }, []);

  const handleStop = useCallback(() => {
    tripRecorderEngine.stopRecording();
  }, []);

  const handleAddNote = useCallback(() => {
    if (noteText.trim()) {
      tripRecorderEngine.addNote(noteText.trim());
      setNoteText('');
      setNoteVisible(false);
    }
  }, [noteText]);

  const handleLogCamp = useCallback(() => {
    tripRecorderEngine.logCampStop();
    setQuickActionsVisible(false);
  }, []);

  const handleLogFuel = useCallback(() => {
    tripRecorderEngine.logFuelStop();
    setQuickActionsVisible(false);
  }, []);

  const handleLogWater = useCallback(() => {
    tripRecorderEngine.logWaterResupply();
    setQuickActionsVisible(false);
  }, []);

  const handleLogCheckpoint = useCallback(() => {
    tripRecorderEngine.logCheckpoint();
    setQuickActionsVisible(false);
  }, []);

  const isActive = state.state === 'recording' || state.state === 'paused';
  const isRecording = state.state === 'recording';
  const isPaused = state.state === 'paused';

  // ── Compact mode: just a status indicator ──────────────────
  if (compact && !isActive) return null;

  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <View style={[styles.recordDot, isRecording && styles.recordDotActive, isPaused && styles.recordDotPaused]} />
        <Text style={styles.compactText}>
          {isRecording ? 'REC' : 'PAUSED'} {formatDuration(state.elapsedSec)} — {formatDistance(state.distanceMi)}
        </Text>
        <Text style={styles.compactEvents}>{state.eventCount} events</Text>
      </View>
    );
  }

  // ── Full controls ──────────────────────────────────────────
  return (
    <View style={styles.container}>
      {/* Status Bar */}
      <View style={styles.statusBar}>
        <View style={styles.statusLeft}>
          <View style={[
            styles.recordIndicator,
            isRecording && styles.recordIndicatorActive,
            isPaused && styles.recordIndicatorPaused,
          ]}>
            <View style={[
              styles.recordDotLarge,
              isRecording && styles.recordDotLargeActive,
              isPaused && styles.recordDotLargePaused,
            ]} />
            <Text style={[
              styles.recordLabel,
              isRecording && styles.recordLabelActive,
              isPaused && styles.recordLabelPaused,
            ]}>
              {isRecording ? 'RECORDING' : isPaused ? 'PAUSED' : 'IDLE'}
            </Text>
          </View>
          {isActive && (
            <Text style={styles.tripName} numberOfLines={1}>
              {state.tripName || 'Trip'}
            </Text>
          )}
        </View>
        {state.isExpeditionLinked && (
          <View style={styles.linkedBadge}>
            <Ionicons name="link-outline" size={10} color={TACTICAL.amber} />
            <Text style={styles.linkedText}>EXPEDITION</Text>
          </View>
        )}
      </View>

      {/* Live Stats (when recording) */}
      {isActive && (
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatDuration(state.elapsedSec)}</Text>
            <Text style={styles.statLabel}>ELAPSED</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{formatDistance(state.distanceMi)}</Text>
            <Text style={styles.statLabel}>DISTANCE</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {state.currentSpeedMph != null ? `${Math.round(state.currentSpeedMph)}` : '--'}
            </Text>
            <Text style={styles.statLabel}>MPH</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{state.eventCount}</Text>
            <Text style={styles.statLabel}>EVENTS</Text>
          </View>
        </View>
      )}

      {/* Control Buttons */}
      <View style={styles.controlRow}>
        {!isActive ? (
          <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.7}>
            <Ionicons name="radio-button-on-outline" size={16} color="#0B0F12" />
            <Text style={styles.startBtnText}>START RECORDING</Text>
          </TouchableOpacity>
        ) : (
          <>
            {isRecording ? (
              <TouchableOpacity style={styles.pauseBtn} onPress={handlePause} activeOpacity={0.7}>
                <Ionicons name="pause-outline" size={16} color={TACTICAL.text} />
                <Text style={styles.controlBtnText}>PAUSE</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.resumeBtn} onPress={handleResume} activeOpacity={0.7}>
                <Ionicons name="play-outline" size={16} color="#0B0F12" />
                <Text style={styles.resumeBtnText}>RESUME</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity style={styles.stopBtn} onPress={handleStop} activeOpacity={0.7}>
              <Ionicons name="stop-outline" size={16} color="#EF5350" />
              <Text style={styles.stopBtnText}>STOP</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.noteBtn} onPress={() => setNoteVisible(true)} activeOpacity={0.7}>
              <Ionicons name="create-outline" size={16} color={TACTICAL.text} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.noteBtn} onPress={() => setQuickActionsVisible(true)} activeOpacity={0.7}>
              <Ionicons name="add-circle-outline" size={16} color={TACTICAL.amber} />
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Add Note Modal */}
      <Modal visible={noteVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>ADD NOTE</Text>
              <TouchableOpacity onPress={() => setNoteVisible(false)}>
                <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={styles.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Enter a note for this location..."
              placeholderTextColor={TACTICAL.textMuted}
              multiline
              autoFocus
            />
            <TouchableOpacity
              style={[styles.noteSaveBtn, !noteText.trim() && { opacity: 0.5 }]}
              onPress={handleAddNote}
              disabled={!noteText.trim()}
              activeOpacity={0.7}
            >
              <Ionicons name="save-outline" size={14} color="#0B0F12" />
              <Text style={styles.noteSaveBtnText}>SAVE NOTE</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Quick Actions Modal */}
      <Modal visible={quickActionsVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setQuickActionsVisible(false)}
        >
          <View style={styles.quickActionsContent}>
            <Text style={styles.quickActionsTitle}>LOG EVENT</Text>
            {[
              { label: 'Camp Stop', icon: 'bonfire-outline', color: '#FFB74D', action: handleLogCamp },
              { label: 'Fuel Stop', icon: 'flame-outline', color: '#FF9800', action: handleLogFuel },
              { label: 'Water Resupply', icon: 'water-outline', color: '#4FC3F7', action: handleLogWater },
              { label: 'Checkpoint', icon: 'navigate-outline', color: '#D4A017', action: handleLogCheckpoint },
              { label: 'Custom Note', icon: 'create-outline', color: '#8B949E', action: () => { setQuickActionsVisible(false); setNoteVisible(true); } },
            ].map(item => (
              <TouchableOpacity
                key={item.label}
                style={styles.quickActionBtn}
                onPress={item.action}
                activeOpacity={0.7}
              >
                <View style={[styles.quickActionIcon, { borderColor: `${item.color}40` }]}>
                  <Ionicons name={item.icon as any} size={18} color={item.color} />
                </View>
                <Text style={styles.quickActionLabel}>{item.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 16,
    marginVertical: 8,
  },

  // Compact
  compactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  compactText: {
    fontSize: 10,
    fontWeight: '700',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  compactEvents: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    marginLeft: 'auto',
  },

  // Status Bar
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statusLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  recordIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  recordIndicatorActive: {
    borderColor: 'rgba(239,83,80,0.4)',
    backgroundColor: 'rgba(239,83,80,0.08)',
  },
  recordIndicatorPaused: {
    borderColor: 'rgba(255,183,77,0.4)',
    backgroundColor: 'rgba(255,183,77,0.08)',
  },
  recordDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: TACTICAL.textMuted,
  },
  recordDotActive: {
    backgroundColor: '#EF5350',
  },
  recordDotPaused: {
    backgroundColor: '#FFB74D',
  },
  recordDotLarge: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: TACTICAL.textMuted,
  },
  recordDotLargeActive: {
    backgroundColor: '#EF5350',
  },
  recordDotLargePaused: {
    backgroundColor: '#FFB74D',
  },
  recordLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
  },
  recordLabelActive: {
    color: '#EF5350',
  },
  recordLabelPaused: {
    color: '#FFB74D',
  },
  tripName: {
    fontSize: 12,
    fontWeight: '700',
    color: TACTICAL.text,
    flex: 1,
  },
  linkedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(212,160,23,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.2)',
  },
  linkedText: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },

  // Stats Row
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    marginBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(30,35,43,0.5)',
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
    color: TACTICAL.text,
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  statLabel: {
    fontSize: 7,
    fontWeight: '700',
    color: TACTICAL.textMuted,
    letterSpacing: 1.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(30,35,43,0.5)',
  },

  // Control Buttons
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  startBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  startBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },
  pauseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  resumeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  resumeBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },
  controlBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: TACTICAL.text,
    letterSpacing: 1,
  },
  stopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(239,83,80,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,83,80,0.3)',
  },
  stopBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#EF5350',
    letterSpacing: 1,
  },
  noteBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
  },
  noteInput: {
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 10,
    padding: 12,
    color: TACTICAL.text,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  noteSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  noteSaveBtnText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },

  // Quick Actions
  quickActionsContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: TACTICAL.border,
  },
  quickActionsTitle: {
    fontSize: 11,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 2,
    marginBottom: 12,
    textAlign: 'center',
  },
  quickActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderWidth: 1,
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: TACTICAL.text,
  },
});



