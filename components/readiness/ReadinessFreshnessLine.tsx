import React from 'react';
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { ECSText } from '../ECSText';
import { ECSIcon } from '../ECSStatus';
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessFreshnessRecord,
} from '../../lib/readiness/expeditionReadinessTypes';
import { ECS } from '../../lib/theme';

export interface ReadinessFreshnessLineProps {
  assessment: ExpeditionReadinessAssessment;
  maxItems?: number;
  style?: StyleProp<ViewStyle>;
}

function freshnessLabel(record: ExpeditionReadinessFreshnessRecord): string | null {
  if (record.isMissing) return `${record.label} missing`;
  if (record.isStale) return `${record.label} stale`;
  if (record.isDemo) return `${record.label} demo`;
  if (record.isMock) return `${record.label} mock`;
  if (record.isInferred) return `${record.label} ECS-inferred`;
  if (record.source === 'manual') return `${record.label} manual`;
  return null;
}

export function ReadinessFreshnessLine({
  assessment,
  maxItems = 3,
  style,
}: ReadinessFreshnessLineProps) {
  const limited = Object.values(assessment.sourceFreshness)
    .map(freshnessLabel)
    .filter((value): value is string => Boolean(value))
    .slice(0, maxItems);

  const text = limited.length > 0
    ? `Limited confidence: ${limited.join(' • ')}`
    : `Sources current as of ${new Date(assessment.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

  return (
    <View style={[styles.line, style]}>
      <ECSIcon
        name={limited.length > 0 ? 'alert-circle-outline' : 'radio-outline'}
        tier="compact"
        tone={limited.length > 0 ? 'warning' : 'info'}
      />
      <ECSText variant="helper" style={styles.text} numberOfLines={2}>
        {text}
      </ECSText>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    minWidth: 0,
  },
  text: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
});

export default ReadinessFreshnessLine;

