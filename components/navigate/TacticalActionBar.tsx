/**
 * TacticalActionBar — Compact Icon + Micro-Label Control Strip
 *
 * Actions: IMPORT | PIN | OFFLINE | INTEL | TRAIL
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO, GOLD_RAIL } from '../../lib/theme';
import type { TrailRecordingStatus } from '../../lib/trailStore';

interface Props {
  onImport: () => void;
  onDropPin: () => void;
  onOffline: () => void;
  onIntel: () => void;
  onTrail: () => void;
  trailStatus: TrailRecordingStatus;
  pinActive?: boolean;
}

const TRAIL_STATUS_LABELS: Record<TrailRecordingStatus, string> = {
  idle: 'IDLE',
  recording: 'REC',
  paused: 'PAUSED',
  stopped: 'SAVED',
};

const TRAIL_STATUS_COLORS: Record<TrailRecordingStatus, string> = {
  idle: TACTICAL.textMuted,
  recording: '#EF5350',
  paused: TACTICAL.amber,
  stopped: '#66BB6A',
};

const ACTION_HEIGHT = 58;
const ACTION_WIDTH = 64;
const ICON_BOX_HEIGHT = 22;
const LABEL_HEIGHT = 14;
const ICON_SIZE = 18;

type ActionPillProps = {
  icon: string;
  label: string;
  onPress: () => void;
  active?: boolean;
};

function ActionPill({ icon, label, onPress, active = false }: ActionPillProps) {
  return (
    <TouchableOpacity
      style={[styles.pill, active && styles.pillActive]}
      onPress={onPress}
      activeOpacity={0.7}
      hitSlop={{ top: 4, bottom: 4, left: 2, right: 2 }}
    >
      <View style={styles.iconWrap}>
        <Ionicons
          name={icon as any}
          size={ICON_SIZE}
          color={active ? '#0B0F12' : TACTICAL.amber}
        />
      </View>
      <Text style={[styles.microLabel, active && styles.microLabelActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

type TrailPillProps = {
  status: TrailRecordingStatus;
  onPress: () => void;
};

function TrailPill({ status, onPress }: TrailPillProps) {
  const trailLabel = TRAIL_STATUS_LABELS[status] || 'IDLE';
  const trailColor = TRAIL_STATUS_COLORS[status] || TACTICAL.textMuted;
  const isRecording = status === 'recording';

  return (
    <TouchableOpacity
      style={[styles.pill, styles.trailPill, isRecording && styles.trailPillRecording]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.trailIconRow}>
        {isRecording ? <View style={styles.recordDot} /> : <View style={styles.recordDotSpacer} />}
        <Ionicons
          name="trail-sign-outline"
          size={ICON_SIZE}
          color={isRecording ? '#EF5350' : TACTICAL.amber}
        />
      </View>

      <View style={styles.trailLabelRow}>
        <Text style={styles.microLabel}>TRAIL</Text>
        <View style={styles.trailDivider} />
        <Text style={[styles.trailState, { color: trailColor }]}>
          {trailLabel}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function TacticalActionBar({
  onImport,
  onDropPin,
  onOffline,
  onIntel,
  onTrail,
  trailStatus,
  pinActive = false,
}: Props) {
  return (
    <View style={styles.container}>
      <ActionPill
        icon="cloud-upload-outline"
        label="IMPORT"
        onPress={onImport}
      />

      <ActionPill
        icon="pin-outline"
        label="PIN"
        onPress={onDropPin}
        active={pinActive}
      />

      <ActionPill
        icon="cloud-offline-outline"
        label="OFFLINE"
        onPress={onOffline}
      />

      <ActionPill
        icon="layers-outline"
        label="INTEL"
        onPress={onIntel}
      />

      <TrailPill
        status={trailStatus}
        onPress={onTrail}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: TACTICAL.bg,
    borderBottomWidth: GOLD_RAIL.sectionWidth,
    borderBottomColor: GOLD_RAIL.section,
    gap: 6,
  },

  pill: {
    width: ACTION_WIDTH,
    height: ACTION_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.2)',
    backgroundColor: 'rgba(18,24,29,0.9)',
    gap: 4,
  },

  pillActive: {
    borderColor: TACTICAL.amber,
    backgroundColor: TACTICAL.amber,
    shadowColor: TACTICAL.amber,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },

  iconWrap: {
    height: ICON_BOX_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },

  microLabel: {
    minHeight: LABEL_HEIGHT,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
    textAlign: 'center',
  },

  microLabelActive: {
    color: '#0B0F12',
  },

  trailPill: {
    width: ACTION_WIDTH,
    height: ACTION_HEIGHT,
  },

  trailPillRecording: {
    borderColor: 'rgba(239,83,80,0.4)',
    backgroundColor: 'rgba(239,83,80,0.06)',
  },

  trailIconRow: {
    height: ICON_BOX_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },

  recordDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#EF5350',
  },

  recordDotSpacer: {
    width: 6,
    height: 6,
    opacity: 0,
  },

  trailLabelRow: {
    height: LABEL_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },

  trailDivider: {
    width: 1,
    height: 6,
    backgroundColor: 'rgba(138,138,133,0.3)',
  },

  trailState: {
    fontSize: 6,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});