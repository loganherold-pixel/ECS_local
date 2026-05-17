import React, { useState } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';

import { ECSText } from '../ECSText';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import type { ExpeditionReadinessCategory } from '../../lib/readiness/expeditionReadinessTypes';
import {
  readinessDivider,
  readinessStatusLabel,
  readinessStatusTone,
  readinessToneColor,
} from './readinessUi';
import { ECS } from '../../lib/theme';

export interface ReadinessCategoryRowProps {
  category: ExpeditionReadinessCategory;
  expandable?: boolean;
  initiallyExpanded?: boolean;
  onPress?: (category: ExpeditionReadinessCategory) => void;
  style?: StyleProp<ViewStyle>;
}

export function ReadinessCategoryRow({
  category,
  expandable = true,
  initiallyExpanded = false,
  onPress,
  style,
}: ReadinessCategoryRowProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const canExpand = expandable && (category.factors.length > 0 || category.missingInputs.length > 0);
  const hasMissing = category.missingInputs.length > 0;

  const handlePress = () => {
    if (onPress) {
      onPress(category);
      return;
    }
    if (canExpand) setExpanded((value) => !value);
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!onPress && !canExpand}
      accessibilityRole={onPress || canExpand ? 'button' : undefined}
      accessibilityLabel={`${category.label}, ${readinessStatusLabel(category.status)}, score ${category.score}`}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.pressed,
        style,
      ]}
    >
      <View style={styles.mainLine}>
        <View style={styles.labelCluster}>
          <ECSText variant="body" style={styles.label} numberOfLines={1}>
            {category.label}
          </ECSText>
          {hasMissing ? (
            <ECSBadge label="Limited confidence" tone="warning" compact />
          ) : null}
        </View>
        <View style={styles.scoreCluster}>
          <ECSText
            variant="chip"
            style={[styles.scoreText, { color: readinessToneColor(category.status) }]}
            numberOfLines={1}
          >
            {category.score}
          </ECSText>
          <ECSBadge
            label={readinessStatusLabel(category.status)}
            tone={readinessStatusTone(category.status)}
            compact
          />
          {canExpand ? (
            <ECSIcon
              name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'}
              tier="compact"
              tone="info"
            />
          ) : null}
        </View>
      </View>
      <ECSText variant="helper" style={styles.summary} numberOfLines={expanded ? 4 : 2}>
        {category.summary}
      </ECSText>
      {expanded ? (
        <View style={styles.detail}>
          {category.missingInputs.length > 0 ? (
            <ECSText variant="helper" style={styles.missing} numberOfLines={3}>
              Missing: {category.missingInputs.join(', ')}
            </ECSText>
          ) : null}
          {category.factors.slice(0, 3).map((factor) => (
            <View key={factor.id} style={styles.factorRow}>
              <ECSIcon name="ellipse" tier="status" tone={factor.impact === 'blocker' ? 'unavailable' : factor.impact === 'warning' ? 'warning' : 'ready'} />
              <ECSText variant="helper" style={styles.factorText} numberOfLines={2}>
                {factor.label}: {factor.detail}
              </ECSText>
            </View>
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: readinessDivider,
    gap: 5,
  },
  pressed: {
    opacity: 0.78,
  },
  mainLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    minWidth: 0,
  },
  labelCluster: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  label: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 17,
    includeFontPadding: false,
  } as TextStyle,
  scoreCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  scoreText: {
    minWidth: 24,
    textAlign: 'right',
    fontSize: 10,
    includeFontPadding: false,
  } as TextStyle,
  summary: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  detail: {
    gap: 5,
    paddingTop: 3,
  },
  missing: {
    color: ECS.warning,
  } as TextStyle,
  factorRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    minWidth: 0,
  },
  factorText: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
});

export default ReadinessCategoryRow;

