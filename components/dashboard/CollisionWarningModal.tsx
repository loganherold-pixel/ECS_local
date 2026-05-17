/**
 * CollisionWarningModal — Resize collision resolution UI
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';

import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL } from '../../lib/theme';
import {
  WIDGET_SIZE_CONFIG,
  type WidgetSize,
  type ResizeCollisionInfo,
} from '../../lib/dashboardStore';
import TacticalPopupShell from '../TacticalPopupShell';
import { ECSOverlayFooter } from '../ECSModalShell';

interface CollisionWarningModalProps {
  visible: boolean;
  collision: ResizeCollisionInfo | null;
  targetWidgetName: string;
  targetNewSize: WidgetSize;
  onShrinkAndResize: () => void;
  onCancel: () => void;
}

export default function CollisionWarningModal({
  visible,
  collision,
  targetWidgetName,
  targetNewSize,
  onShrinkAndResize,
  onCancel,
}: CollisionWarningModalProps) {
  if (!visible || !collision) return null;

  const newSizeLabel = WIDGET_SIZE_CONFIG[targetNewSize]?.label || targetNewSize;
  const hasConflicts = collision.conflictingSlots.length > 0;
  const conflictNames = collision.conflictingSlots.map((item) => item.widgetName);
  const isOnlyOutOfBounds = collision.outOfBounds && !hasConflicts;

  return (
    <TacticalPopupShell
      visible={visible}
      onClose={onCancel}
      title="Resize Collision"
      subtitle={
        isOnlyOutOfBounds
          ? 'Widget cannot fit at its current position.'
          : 'Resizing would overlap with another widget.'
      }
      eyebrow="DASHBOARD LAYOUT"
      icon="warning-outline"
      overlayClass="action"
      maxWidth={640}
      maxHeightFraction={0.56}
      minHeightFraction={0.34}
      footer={(
        <ECSOverlayFooter>
          {hasConflicts ? (
            <TouchableOpacity
              style={styles.shrinkBtn}
              onPress={onShrinkAndResize}
              activeOpacity={0.7}
            >
              <Ionicons name="contract-outline" size={16} color={TACTICAL.bg} />
              <Text style={styles.shrinkBtnText}>
                {collision.outOfBounds ? 'SHRINK & REFLOW LAYOUT' : `SHRINK ${conflictNames.length === 1 ? `"${conflictNames[0]}"` : `${conflictNames.length} WIDGETS`} & RESIZE`}
              </Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.cancelBtn}
            onPress={onCancel}
            activeOpacity={0.7}
          >
            <Text style={styles.cancelBtnText}>CANCEL RESIZE</Text>
          </TouchableOpacity>
        </ECSOverlayFooter>
      )}
    >
      <View style={styles.headerCard}>
        <View style={styles.detailRow}>
          <View style={styles.detailIcon}>
            <Ionicons name="resize-outline" size={14} color={TACTICAL.amber} />
          </View>
          <View style={styles.detailContent}>
            <Text style={styles.detailLabel}>RESIZING</Text>
            <Text style={styles.detailValue}>
              {targetWidgetName} <Text style={styles.detailMuted}>to</Text>{' '}
              <Text style={styles.sizeHighlight}>{newSizeLabel}</Text>
            </Text>
          </View>
        </View>

        {collision.outOfBounds ? (
          <View style={styles.detailRow}>
            <View style={[styles.detailIcon, styles.detailIconDanger]}>
              <Ionicons name="alert-circle-outline" size={14} color={TACTICAL.danger} />
            </View>
            <View style={styles.detailContent}>
              <Text style={styles.detailLabel}>OUT OF BOUNDS</Text>
              <Text style={styles.detailValue}>
                New size exceeds grid boundaries at the current slot.
              </Text>
            </View>
          </View>
        ) : null}
      </View>

      {hasConflicts ? (
        <View style={styles.conflictSection}>
          <View style={styles.conflictHeader}>
            <Ionicons name="git-merge-outline" size={12} color={TACTICAL.danger} />
            <Text style={styles.conflictHeaderText}>
              WOULD DISPLACE {collision.conflictingSlots.length === 1 ? '1 WIDGET' : `${collision.conflictingSlots.length} WIDGETS`}
            </Text>
          </View>
          {collision.conflictingSlots.map((conflict) => (
            <View key={conflict.slotIndex} style={styles.conflictItem}>
              <View style={styles.conflictDot} />
              <Text style={styles.conflictName}>{conflict.widgetName}</Text>
              <Ionicons name="arrow-forward-outline" size={10} color={TACTICAL.textMuted} />
              <Text style={styles.conflictResult}>shrink to 1×1</Text>
            </View>
          ))}
        </View>
      ) : null}

      {hasConflicts && collision.outOfBounds ? (
        <View style={styles.outOfBoundsNote}>
          <Ionicons name="information-circle-outline" size={14} color={TACTICAL.textMuted} />
          <Text style={styles.outOfBoundsNoteText}>
            The widget will be repositioned to fit the grid after shrinking conflicting widgets.
          </Text>
        </View>
      ) : null}
    </TacticalPopupShell>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    gap: 10,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(196,138,44,0.16)',
    backgroundColor: 'rgba(196,138,44,0.05)',
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  detailIcon: {
    width: 28,
    height: 28,
    borderRadius: 7,
    backgroundColor: TACTICAL.amber + '10',
    borderWidth: 1,
    borderColor: TACTICAL.amber + '20',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  detailIconDanger: {
    backgroundColor: TACTICAL.danger + '10',
    borderColor: TACTICAL.danger + '20',
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
    color: TACTICAL.textMuted,
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '600',
    color: TACTICAL.text,
    lineHeight: 17,
  },
  detailMuted: {
    color: TACTICAL.textMuted,
    fontWeight: '400',
  },
  sizeHighlight: {
    color: TACTICAL.amber,
    fontWeight: '800',
    letterSpacing: 1,
  },
  conflictSection: {
    backgroundColor: TACTICAL.danger + '08',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: TACTICAL.danger + '15',
    padding: 10,
    marginBottom: 12,
  },
  conflictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  conflictHeaderText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 2,
    color: TACTICAL.danger,
  },
  conflictItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 4,
  },
  conflictDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: TACTICAL.danger + '80',
  },
  conflictName: {
    fontSize: 11,
    fontWeight: '700',
    color: TACTICAL.text,
    flex: 1,
  },
  conflictResult: {
    fontSize: 10,
    fontWeight: '600',
    color: TACTICAL.textMuted,
    fontStyle: 'italic',
  },
  outOfBoundsNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
    padding: 10,
    marginBottom: 4,
  },
  outOfBoundsNoteText: {
    fontSize: 10,
    fontWeight: '500',
    color: TACTICAL.textMuted,
    flex: 1,
    lineHeight: 15,
  },
  shrinkBtn: {
    flex: 1,
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: TACTICAL.amber,
  },
  shrinkBtnText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: TACTICAL.bg,
    textAlign: 'center',
  },
  cancelBtn: {
    flex: 1,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  cancelBtnText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.6,
    color: TACTICAL.textMuted,
  },
});
