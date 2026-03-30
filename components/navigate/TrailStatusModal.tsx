import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import { trailStore, type TrailRecordingStatus, type TrailStats } from '../../lib/trailStore';
import { trailHistoryStore, type TrailHistorySummary } from '../../lib/trailHistoryStore';
import { hapticMicro, hapticCommand } from '../../lib/haptics';

interface Props {
  visible: boolean;
  onClose: () => void;
  status: TrailRecordingStatus;
  stats: TrailStats;
  activeExpeditionId: string | null;
  activeExpeditionName: string | null;
  onStatusChange: () => void;
  onExport: () => void;
  onReplay: () => void;
  onReplayFromHistory: (trailId: string) => void;
  onExportFromHistory: (trailId: string, format: 'gpx' | 'json') => void;
  showToast: (msg: string) => void;
}

export default function TrailStatusModal({
  visible,
  onClose,
  status,
  stats,
  activeExpeditionId,
  activeExpeditionName,
  onStatusChange,
  onExport,
  onReplay,
  onReplayFromHistory,
  onExportFromHistory,
  showToast,
}: Props) {

  if (!visible) return null;

  const [confirmStop, setConfirmStop] = useState(false);
  const [historyTrails, setHistoryTrails] = useState<TrailHistorySummary[]>([]);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const isIdle = status === 'idle' || status === 'stopped';
  const isRecording = status === 'recording';
  const isPaused = status === 'paused';
  const hasSession = !isIdle;

  React.useEffect(() => {
    if (visible && !historyLoaded) {
      try {
        setHistoryTrails(trailHistoryStore.getAll());
      } catch {}
      setHistoryLoaded(true);
    }
    if (!visible) setHistoryLoaded(false);
  }, [visible, historyLoaded]);

  const handleStart = useCallback(() => {
    hapticCommand();
    trailStore.start(activeExpeditionId);
    onStatusChange();
    showToast('TRAIL RECORDING STARTED');
  }, [activeExpeditionId]);

  const handlePause = useCallback(() => {
    hapticMicro();
    trailStore.pause();
    onStatusChange();
    showToast('TRAIL RECORDING PAUSED');
  }, []);

  const handleResume = useCallback(() => {
    hapticCommand();
    trailStore.resume();
    onStatusChange();
    showToast('TRAIL RECORDING RESUMED');
  }, []);

  const handleStop = useCallback(() => {
    hapticCommand();
    trailStore.stop(activeExpeditionName || null);
    setConfirmStop(false);
    onStatusChange();
    showToast('TRAIL SAVED');
  }, []);

  const statusColor =
    isRecording ? '#EF5350' :
    isPaused ? TACTICAL.amber :
    TACTICAL.textMuted;

  const statusLabel =
    isRecording ? 'RECORDING' :
    isPaused ? 'PAUSED' :
    status === 'stopped' ? 'SAVED' :
    'IDLE';

  return (
    <View style={styles.sheet}>
      
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Ionicons name="trail-sign-outline" size={16} color={TACTICAL.amber} />
          <Text style={styles.headerTitle}>TRAIL</Text>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {statusLabel}
          </Text>
        </View>

        <TouchableOpacity onPress={onClose}>
          <Ionicons name="close" size={20} color={TACTICAL.textMuted} />
        </TouchableOpacity>
      </View>

      {/* BODY */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        
        {hasSession && (
          <Text style={styles.statText}>
            {stats.distance_miles.toFixed(2)} MI • {stats.point_count} PTS
          </Text>
        )}

        <View style={styles.controls}>
          {isIdle && (
            <TouchableOpacity style={styles.primaryBtn} onPress={handleStart}>
              <Text style={styles.primaryText}>START</Text>
            </TouchableOpacity>
          )}

          {isRecording && (
            <>
              <TouchableOpacity style={styles.secondaryBtn} onPress={handlePause}>
                <Text style={styles.secondaryText}>PAUSE</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.dangerBtn} onPress={() => setConfirmStop(true)}>
                <Text style={styles.dangerText}>STOP</Text>
              </TouchableOpacity>
            </>
          )}

          {isPaused && (
            <>
              <TouchableOpacity style={styles.primaryBtn} onPress={handleResume}>
                <Text style={styles.primaryText}>RESUME</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.dangerBtn} onPress={() => setConfirmStop(true)}>
                <Text style={styles.dangerText}>STOP</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* HISTORY */}
        {historyTrails.length > 0 && (
          <View style={{ marginTop: 16 }}>
            {historyTrails.slice(0, 10).map(trail => (
              <TouchableOpacity
                key={trail.id}
                style={styles.historyCard}
                onPress={() => {
                  onReplayFromHistory(trail.id);
                  onClose();
                }}
              >
                <Text style={styles.historyText}>
                  {trail.name || 'Trail'} • {trail.distance_miles.toFixed(1)} MI
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

      </ScrollView>

      {/* CONFIRM STOP */}
      {confirmStop && (
        <View style={styles.confirmOverlay}>
          <TouchableOpacity style={styles.confirmBtn} onPress={handleStop}>
            <Text style={{ color: '#fff' }}>CONFIRM STOP</Text>
          </TouchableOpacity>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: TACTICAL.panel,
    borderRadius: 16,
    overflow: 'hidden',
  },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 14,
    borderBottomWidth: 1,
    borderColor: TACTICAL.border,
  },

  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  headerTitle: {
    color: TACTICAL.amber,
    fontWeight: '800',
  },

  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  statusText: {
    fontSize: 10,
    marginLeft: 6,
  },

  statText: {
    color: TACTICAL.text,
    marginBottom: 12,
  },

  controls: {
    flexDirection: 'row',
    gap: 8,
  },

  primaryBtn: {
    flex: 1,
    backgroundColor: TACTICAL.amber,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  primaryText: {
    color: '#000',
    fontWeight: '800',
  },

  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: TACTICAL.amber,
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  secondaryText: {
    color: TACTICAL.amber,
    fontWeight: '700',
  },

  dangerBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#EF5350',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  dangerText: {
    color: '#EF5350',
    fontWeight: '700',
  },

  historyCard: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    marginBottom: 8,
  },

  historyText: {
    color: TACTICAL.text,
  },

  confirmOverlay: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },

  confirmBtn: {
    backgroundColor: '#EF5350',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
});