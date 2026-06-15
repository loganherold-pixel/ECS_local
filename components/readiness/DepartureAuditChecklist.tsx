import React from 'react';
import { Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { ECSText } from '../ECSText';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import { ECS, GOLD_RAIL } from '../../lib/theme';
import type {
  ExpeditionDepartureAuditItem,
  ExpeditionDepartureAuditItemStatus,
} from '../../lib/readiness/expeditionReadinessTypes';

const COMPLETE_GREEN = '#2FD36B';

type DepartureAuditChecklistProps = {
  items: ExpeditionDepartureAuditItem[];
  limit?: number;
  onActionPress?: (item: ExpeditionDepartureAuditItem) => void;
  rowStyle?: StyleProp<ViewStyle>;
};

function statusLabel(status: ExpeditionDepartureAuditItemStatus): string {
  if (status === 'complete') return 'Complete';
  if (status === 'caution') return 'Caution';
  if (status === 'missing') return 'Missing';
  return 'Unavailable';
}

function statusTone(status: ExpeditionDepartureAuditItemStatus): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (status === 'complete') return 'ready';
  if (status === 'missing') return 'unavailable';
  if (status === 'unavailable') return 'info';
  return 'warning';
}

function statusIcon(status: ExpeditionDepartureAuditItemStatus): React.ComponentProps<typeof ECSIcon>['name'] {
  if (status === 'complete') return 'checkmark-circle-outline';
  if (status === 'missing') return 'alert-circle-outline';
  if (status === 'unavailable') return 'remove-circle-outline';
  return 'warning-outline';
}

export function DepartureAuditChecklist({
  items,
  limit,
  onActionPress,
  rowStyle,
}: DepartureAuditChecklistProps) {
  const visibleItems = typeof limit === 'number' ? items.slice(0, Math.max(0, limit)) : items;
  return (
    <View style={styles.list}>
      {visibleItems.map((item) => {
        const hasAction = Boolean(item.actionLabel && onActionPress && (item.actionTarget || item.disabledActionReason));
        const actionUnavailable = Boolean(item.disabledActionReason);
        const isComplete = item.status === 'complete';
        return (
          <View key={item.itemId} style={[styles.row, rowStyle]}>
            <ECSIcon
              name={statusIcon(item.status)}
              tier="compact"
              tone={statusTone(item.status)}
              color={isComplete ? COMPLETE_GREEN : undefined}
            />
            <View style={styles.copyBlock}>
              <View style={styles.titleRow}>
                <ECSText variant="body" style={styles.label} numberOfLines={2}>
                  {item.label}
                </ECSText>
                <ECSBadge
                  label={statusLabel(item.status)}
                  tone={statusTone(item.status)}
                  colorOverride={isComplete ? COMPLETE_GREEN : undefined}
                  compact
                  style={isComplete ? styles.statusBadgeComplete : null}
                  textStyle={isComplete ? styles.statusBadgeCompleteText : null}
                />
              </View>
              <ECSText variant="helper" style={styles.summary} numberOfLines={2}>
                {item.summary}
              </ECSText>
            </View>
            {hasAction ? (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: actionUnavailable }}
                accessibilityHint={item.disabledActionReason ?? undefined}
                onPress={() => onActionPress?.(item)}
                style={({ pressed }) => [
                  styles.action,
                  actionUnavailable && styles.actionDisabled,
                  pressed && styles.pressed,
                ]}
              >
                <ECSText
                  variant="chip"
                  style={[styles.actionText, actionUnavailable && styles.actionTextDisabled]}
                  numberOfLines={2}
                >
                  {item.actionLabel}
                </ECSText>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 8,
  },
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgElev,
  },
  copyBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
    flexWrap: 'wrap',
  },
  label: {
    flex: 1,
    minWidth: 120,
    color: ECS.text,
    fontSize: 13,
    lineHeight: 17,
    includeFontPadding: false,
  } as TextStyle,
  summary: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  statusBadgeComplete: {
    backgroundColor: 'rgba(47,211,107,0.18)',
    borderColor: 'rgba(47,211,107,0.44)',
  },
  statusBadgeCompleteText: {
    color: COMPLETE_GREEN,
  } as TextStyle,
  action: {
    width: 112,
    minHeight: 28,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: GOLD_RAIL.section,
    backgroundColor: ECS.accentSoft,
  },
  actionText: {
    color: ECS.accent,
    includeFontPadding: false,
    textAlign: 'center',
    lineHeight: 13,
  } as TextStyle,
  actionDisabled: {
    borderColor: ECS.strokeSoft,
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  actionTextDisabled: {
    color: ECS.muted,
  } as TextStyle,
  pressed: {
    opacity: 0.78,
  },
});
