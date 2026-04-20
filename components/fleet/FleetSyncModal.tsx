/**
 * Fleet Sync Modal
 */
import React from 'react';
import { StyleSheet, Text, TouchableOpacity } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import SyncQueueManager from '../sync/SyncQueueManager';
import TacticalPopupShell from '../TacticalPopupShell';
import { ECSOverlayFooter } from '../ECSModalShell';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export default function FleetSyncModal({ visible, onClose }: Props) {
  if (!visible) return null;

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title="Sync Management"
      subtitle="Queue health, conflicts, incoming remote changes, and live sync state."
      eyebrow="ECS FLEET"
      icon="sync-outline"
      overlayClass="workflow"
      maxWidth={960}
      maxHeightFraction={0.86}
      minHeightFraction={0.7}
      footer={(
        <ECSOverlayFooter>
          <TouchableOpacity
            style={styles.doneBtn}
            onPress={onClose}
            activeOpacity={0.8}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color="#0B0F12" />
            <Text style={styles.doneBtnText}>DONE</Text>
          </TouchableOpacity>
        </ECSOverlayFooter>
      )}
    >
      <SyncQueueManager />
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  doneBtn: {
    flex: 1,
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  doneBtnText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0B0F12',
    letterSpacing: 1.5,
  },
});
