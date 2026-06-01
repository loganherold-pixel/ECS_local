import React from 'react';
import { Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { ECSText } from '../ECSText';
import { ECSIcon } from '../ECSStatus';
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessIssue,
} from '../../lib/readiness/expeditionReadinessTypes';
import { ECS } from '../../lib/theme';
import { issueTone } from './readinessUi';

export interface ReadinessConcernListProps {
  assessment: ExpeditionReadinessAssessment;
  limit?: number;
  showRecommendations?: boolean;
  onConcernPress?: (item: ConcernItem) => void;
  style?: StyleProp<ViewStyle>;
}

type ConcernItem = {
  id: string;
  label: string;
  detail: string;
  issue?: ExpeditionReadinessIssue;
  kind: 'blocker' | 'warning' | 'recommendation';
};

export function ReadinessConcernList({
  assessment,
  limit = 3,
  showRecommendations = true,
  onConcernPress,
  style,
}: ReadinessConcernListProps) {
  const items: ConcernItem[] = [
    ...assessment.blockers.map((issue) => ({
      id: issue.id,
      label: issue.label,
      detail: issue.detail,
      issue,
      kind: 'blocker' as const,
    })),
    ...assessment.warnings.map((issue) => ({
      id: issue.id,
      label: issue.label,
      detail: issue.detail,
      issue,
      kind: 'warning' as const,
    })),
    ...(showRecommendations
      ? assessment.recommendations.map((detail, index) => ({
          id: `recommendation-${index}`,
          label: 'Recommended review',
          detail,
          kind: 'recommendation' as const,
        }))
      : []),
  ].slice(0, Math.max(0, limit));

  if (items.length === 0) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.item}>
          <ECSIcon name="checkmark-circle-outline" tier="compact" tone="ready" />
          <ECSText variant="helper" style={styles.text} numberOfLines={2}>
            No blockers. Keep source freshness updated before departure.
          </ECSText>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {items.map((item) => {
        const content = (
          <>
          <ECSIcon
            name={item.kind === 'blocker' ? 'hand-left-outline' : item.kind === 'warning' ? 'alert-circle-outline' : 'list-outline'}
            tier="compact"
            tone={item.issue ? issueTone(item.issue) : 'info'}
          />
          <ECSText variant="helper" style={styles.text} numberOfLines={3}>
            <ECSText variant="helper" style={styles.label}>
              {item.label}: 
            </ECSText>
            {item.detail}
          </ECSText>
          </>
        );

        if (onConcernPress) {
          return (
            <Pressable
              key={item.id}
              onPress={() => onConcernPress(item)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              {content}
            </Pressable>
          );
        }

        return (
          <View key={item.id} style={styles.item}>
            {content}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 7,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    minWidth: 0,
  },
  pressed: {
    opacity: 0.78,
  },
  text: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  label: {
    color: ECS.text,
  } as TextStyle,
});

export default ReadinessConcernList;
