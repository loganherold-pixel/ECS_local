/**
 * Fleet Sync Modal
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import SyncQueueManager from '../sync/SyncQueueManager';
import TacticalPopupShell from '../TacticalPopupShell';
import { ECSOverlayFooter } from '../ECSModalShell';
import { ECSButton } from '../ECSButton';

interface Props {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  eyebrow?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
}

export default function FleetSyncModal({
  visible,
  onClose,
  title = 'Sync Management',
  subtitle = 'Queue health, conflicts, incoming remote changes, and live sync state.',
  eyebrow = 'ECS FLEET',
  icon = 'sync-outline',
}: Props) {
  if (!visible) return null;

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      eyebrow={eyebrow}
      icon={icon}
      overlayClass="workflow"
      maxWidth={960}
      maxHeightFraction={0.86}
      minHeightFraction={0.7}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Done"
            icon="checkmark-circle-outline"
            variant="primary"
            size="medium"
            onPress={onClose}
            style={styles.doneBtn}
            grow
          />
        </ECSOverlayFooter>
      )}
    >
      <SyncQueueManager />
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  doneBtn: {
    minHeight: 44,
  },
});
