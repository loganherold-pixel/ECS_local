import React from 'react';
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { ECSText } from '../ECSText';
import { ECSBadge } from '../ECSStatus';
import type { ExpeditionReadinessCategory } from '../../lib/readiness/expeditionReadinessTypes';
import { ECS } from '../../lib/theme';
import {
  readinessDivider,
  readinessInnerSurfaceStyle,
  readinessStatusLabel,
  readinessStatusTone,
  readinessToneColor,
} from './readinessUi';
import { ReadinessFactorList } from './ReadinessFactorList';

export type ReadinessCategoryDetailProps = {
  category: ExpeditionReadinessCategory;
  expanded?: boolean;
  style?: StyleProp<ViewStyle>;
};

function formatFreshness(category: ExpeditionReadinessCategory): string {
  const updated = category.lastUpdatedAt ? `Updated ${category.lastUpdatedAt}` : 'Freshness unknown';
  if (category.missingInputs.length > 0) {
    return `${updated}. Confidence limited by missing inputs.`;
  }
  if (category.factors.some((factor) => factor.isStale)) {
    return `${updated}. One or more factors are stale.`;
  }
  return updated;
}

export function ReadinessCategoryDetail({
  category,
  expanded = true,
  style,
}: ReadinessCategoryDetailProps) {
  const helped = category.factors.filter((factor) => factor.impact === 'positive');
  const hurt = category.factors.filter((factor) => (
    factor.impact === 'warning'
    || factor.impact === 'blocker'
    || factor.impact === 'missing'
  ));
  const neutral = category.factors.filter((factor) => factor.impact === 'neutral');

  return (
    <View style={[styles.root, readinessInnerSurfaceStyle, style]}>
      <View style={styles.header}>
        <View style={styles.titleBlock}>
          <ECSText variant="cardTitle" style={styles.title} numberOfLines={1}>
            {category.label}
          </ECSText>
          <ECSText variant="helper" style={styles.summary} numberOfLines={expanded ? 4 : 2}>
            {category.summary}
          </ECSText>
        </View>
        <View style={styles.scoreBlock}>
          <ECSText variant="statValue" style={[styles.score, { color: readinessToneColor(category.status) }]} numberOfLines={1}>
            {Math.round(category.score)}
          </ECSText>
          <ECSBadge label={readinessStatusLabel(category.status)} tone={readinessStatusTone(category.status)} compact />
        </View>
      </View>

      <View style={styles.metaRow}>
        <ECSBadge label={`Confidence ${category.confidence}`} tone={category.confidence === 'high' ? 'ready' : category.confidence === 'medium' ? 'warning' : 'unavailable'} compact />
        {category.missingInputs.length > 0 ? (
          <ECSBadge label="confidence limited" tone="warning" compact />
        ) : null}
      </View>

      {category.missingInputs.length > 0 ? (
        <View style={styles.missingPanel}>
          <ECSText variant="chip" style={styles.panelTitle} numberOfLines={1}>
            Missing Data
          </ECSText>
          <ECSText variant="helper" style={styles.missingText} numberOfLines={4}>
            {category.missingInputs.join(', ')}
          </ECSText>
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.factorStack}>
          <ReadinessFactorList
            title="Helped Score"
            factors={helped}
            emptyCopy="No positive factors were recorded for this category."
          />
          <ReadinessFactorList
            title="Hurt Score"
            factors={hurt}
            emptyCopy="No warning, blocker, or missing-data factors were recorded."
          />
          {neutral.length > 0 ? (
            <ReadinessFactorList
              title="Context"
              factors={neutral}
            />
          ) : null}
        </View>
      ) : null}

      <View style={styles.freshness}>
        <ECSText variant="helper" style={styles.freshnessText} numberOfLines={2}>
          {formatFreshness(category)}
        </ECSText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    padding: 12,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  titleBlock: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  title: {
    color: ECS.text,
    includeFontPadding: false,
  } as TextStyle,
  summary: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  scoreBlock: {
    alignItems: 'flex-end',
    gap: 6,
    flexShrink: 0,
  },
  score: {
    fontSize: 24,
    lineHeight: 28,
    includeFontPadding: false,
  } as TextStyle,
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  missingPanel: {
    borderTopWidth: 1,
    borderTopColor: readinessDivider,
    paddingTop: 10,
    gap: 5,
  },
  panelTitle: {
    color: ECS.warning,
    textTransform: 'uppercase',
  } as TextStyle,
  missingText: {
    color: ECS.warning,
    lineHeight: 15,
  } as TextStyle,
  factorStack: {
    gap: 12,
  },
  freshness: {
    borderTopWidth: 1,
    borderTopColor: readinessDivider,
    paddingTop: 9,
  },
  freshnessText: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
});

export default ReadinessCategoryDetail;
