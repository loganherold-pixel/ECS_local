import React, { useSyncExternalStore } from 'react';
import { Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { ECSText } from '../ECSText';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import { ECS, GOLD_RAIL, TACTICAL } from '../../lib/theme';
import {
  EXPEDITION_READINESS_EDUCATION_COPY,
  expeditionReadinessEducationStore,
  type ExpeditionReadinessEducationSurface,
} from '../../lib/readiness';
import { readinessInnerSurfaceStyle } from './readinessUi';

export type ReadinessEducationCardProps = {
  surface: ExpeditionReadinessEducationSurface;
  compact?: boolean;
  showStatusLegend?: boolean;
  style?: StyleProp<ViewStyle>;
  onDismiss?: () => void;
};

export function ReadinessEducationCard({
  surface,
  compact = false,
  showStatusLegend = true,
  style,
  onDismiss,
}: ReadinessEducationCardProps) {
  const educationState = useSyncExternalStore(
    expeditionReadinessEducationStore.subscribe,
    expeditionReadinessEducationStore.getSnapshot,
    expeditionReadinessEducationStore.getSnapshot,
  );

  if (educationState.dismissed[surface]) return null;

  const handleDismiss = () => {
    expeditionReadinessEducationStore.dismiss(surface);
    onDismiss?.();
  };

  return (
    <View style={[styles.card, readinessInnerSurfaceStyle, compact && styles.cardCompact, style]}>
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <ECSIcon name="compass-outline" tier="compact" tone="warning" />
          <ECSText variant="cardTitle" style={styles.title} numberOfLines={compact ? 1 : 2}>
            {EXPEDITION_READINESS_EDUCATION_COPY.title}
          </ECSText>
        </View>
        <Pressable
          onPress={handleDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss Expedition Readiness education"
          hitSlop={8}
          style={({ pressed }) => [styles.dismissButton, pressed && styles.pressed]}
        >
          <ECSText variant="chip" style={styles.dismissText} numberOfLines={1}>
            Got it
          </ECSText>
        </Pressable>
      </View>

      <ECSText variant="helper" style={styles.body} numberOfLines={compact ? 3 : 5}>
        {EXPEDITION_READINESS_EDUCATION_COPY.body}
      </ECSText>

      {showStatusLegend ? (
        <View style={styles.statusGrid}>
          {EXPEDITION_READINESS_EDUCATION_COPY.statuses.map((status) => (
            <View key={status.label} style={styles.statusItem}>
              <ECSBadge
                label={status.label}
                tone={status.label === 'Ready' ? 'ready' : status.label === 'Caution' ? 'warning' : 'unavailable'}
                compact
              />
              <ECSText variant="helper" style={styles.statusText} numberOfLines={2}>
                {status.summary}
              </ECSText>
            </View>
          ))}
        </View>
      ) : null}

      {!compact ? (
        <ECSText variant="helper" style={styles.limitedCopy} numberOfLines={3}>
          {EXPEDITION_READINESS_EDUCATION_COPY.limitedConfidence}
        </ECSText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 9,
    padding: 11,
    borderColor: GOLD_RAIL.internal,
  },
  cardCompact: {
    gap: 7,
    paddingHorizontal: 9,
    paddingVertical: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0,
  },
  titleRow: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: ECS.text,
    includeFontPadding: false,
  } as TextStyle,
  dismissButton: {
    flexShrink: 0,
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    backgroundColor: ECS.bgPanel,
  },
  dismissText: {
    color: TACTICAL.amber,
    textTransform: 'uppercase',
  } as TextStyle,
  pressed: {
    opacity: 0.78,
  },
  body: {
    color: TACTICAL.textMuted,
    lineHeight: 15,
  } as TextStyle,
  statusGrid: {
    gap: 7,
  },
  statusItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  statusText: {
    flex: 1,
    minWidth: 0,
    color: TACTICAL.textMuted,
    lineHeight: 14,
  } as TextStyle,
  limitedCopy: {
    color: TACTICAL.textMuted,
    lineHeight: 15,
  } as TextStyle,
});

export default ReadinessEducationCard;

