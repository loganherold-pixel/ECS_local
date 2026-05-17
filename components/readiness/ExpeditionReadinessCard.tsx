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
import type {
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCategory,
  ExpeditionReadinessCategoryId,
} from '../../lib/readiness/expeditionReadinessTypes';
import {
  selectTopReadinessConcerns,
  useCurrentExpeditionReadiness,
} from '../../lib/readiness/expeditionReadinessSelectors';
import { ECS } from '../../lib/theme';
import { readinessSurfaceStyle } from './readinessUi';
import { ReadinessScoreRing } from './ReadinessScoreRing';
import { ReadinessDecisionBadge } from './ReadinessDecisionBadge';
import { ReadinessConcernList } from './ReadinessConcernList';
import { ReadinessCategoryRow } from './ReadinessCategoryRow';
import { ReadinessFreshnessLine } from './ReadinessFreshnessLine';
import { getTripIntentLabel } from '../../lib/readiness/expeditionReadinessCalibration';
import { ReadinessDetailSheet } from './ReadinessDetailSheet';

export interface ExpeditionReadinessCardProps {
  assessment?: ExpeditionReadinessAssessment | null;
  title?: string;
  categoryLimit?: number;
  concernLimit?: number;
  cta?: React.ReactNode;
  onPress?: () => void;
  onCategoryPress?: React.ComponentProps<typeof ReadinessCategoryRow>['onPress'];
  enableDetailSheet?: boolean;
  interactive?: boolean;
  style?: StyleProp<ViewStyle>;
  compactCategories?: boolean;
}

export function ExpeditionReadinessCard({
  assessment: assessmentProp,
  title = 'Expedition Readiness',
  categoryLimit = 10,
  concernLimit = 3,
  cta,
  onPress,
  onCategoryPress,
  enableDetailSheet = true,
  interactive = true,
  style,
  compactCategories = false,
}: ExpeditionReadinessCardProps) {
  const liveAssessment = useCurrentExpeditionReadiness();
  const assessment = assessmentProp ?? liveAssessment;
  const [detailVisible, setDetailVisible] = useState(false);
  const [detailCategoryId, setDetailCategoryId] = useState<ExpeditionReadinessCategoryId | null>(null);

  if (!assessment) {
    return (
      <View style={[styles.card, readinessSurfaceStyle, style]}>
        <ECSText variant="cardTitle" style={styles.title}>
          {title}
        </ECSText>
        <ECSText variant="helper" style={styles.empty} numberOfLines={3}>
          Readiness has not been assessed yet. ECS Intelligence will show limited confidence until route, vehicle, offline, camp, weather, and recovery inputs are available.
        </ECSText>
        {cta ? <View style={styles.cta}>{cta}</View> : null}
      </View>
    );
  }

  const categories = selectTopReadinessConcerns(assessment, categoryLimit);
  const canOpenDetail = interactive && enableDetailSheet && !onPress;
  const hasCardInteraction = interactive && (Boolean(onPress) || canOpenDetail);
  const openDetail = (category?: ExpeditionReadinessCategory | null) => {
    if (!interactive) {
      return;
    }
    if (!canOpenDetail) {
      onPress?.();
      return;
    }
    setDetailCategoryId(category?.id ?? null);
    setDetailVisible(true);
  };
  const handleCategoryPress = (category: ExpeditionReadinessCategory) => {
    if (onCategoryPress) {
      onCategoryPress(category);
      return;
    }
    openDetail(category);
  };

  return (
    <>
      <Pressable
        disabled={!hasCardInteraction}
        onPress={() => openDetail(null)}
        accessibilityRole={hasCardInteraction ? 'button' : undefined}
        style={({ pressed }) => [
          styles.card,
          readinessSurfaceStyle,
          hasCardInteraction && pressed && styles.pressed,
          style,
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <ECSText variant="cardTitle" style={styles.title} numberOfLines={1}>
              {title}
            </ECSText>
            <ReadinessDecisionBadge status={assessment.status} score={assessment.overallScore} compact />
          </View>
          <ReadinessScoreRing
            score={assessment.overallScore}
            status={assessment.status}
            size={86}
            compact
            onPress={canOpenDetail ? () => openDetail(null) : undefined}
          />
        </View>
        <ECSText variant="body" style={styles.explanation} numberOfLines={3}>
          {assessment.explanation}
        </ECSText>
        <ECSText variant="helper" style={styles.intentLine} numberOfLines={1}>
          Intent: {getTripIntentLabel(assessment.tripIntent)}
          {assessment.tripIntentSource === 'ecs_inferred' ? ' / ECS-inferred' : assessment.tripIntentSource === 'selected' ? ' / selected' : ' / unknown'}
        </ECSText>
        <ReadinessConcernList
          assessment={assessment}
          limit={concernLimit}
          style={styles.concerns}
          onConcernPress={canOpenDetail ? () => openDetail(null) : undefined}
        />
        <View style={styles.categories}>
          {categories.map((category) => (
            <ReadinessCategoryRow
              key={category.id}
              category={category}
              expandable={interactive && !compactCategories && !canOpenDetail}
              onPress={interactive ? handleCategoryPress : undefined}
            />
          ))}
        </View>
        <ReadinessFreshnessLine assessment={assessment} style={styles.freshness} />
        {cta ? <View style={styles.cta}>{cta}</View> : null}
      </Pressable>
      <ReadinessDetailSheet
        visible={detailVisible}
        assessment={assessment}
        initialCategoryId={detailCategoryId}
        onClose={() => setDetailVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    padding: 14,
    gap: 12,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.86,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minWidth: 0,
  },
  titleBlock: {
    flex: 1,
    gap: 8,
    minWidth: 0,
  },
  title: {
    color: ECS.text,
    includeFontPadding: false,
  } as TextStyle,
  empty: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  explanation: {
    color: ECS.text,
    fontSize: 13,
    lineHeight: 18,
    includeFontPadding: false,
  } as TextStyle,
  intentLine: {
    color: ECS.muted,
    fontSize: 11,
    lineHeight: 14,
    includeFontPadding: false,
  } as TextStyle,
  concerns: {
    paddingTop: 2,
  },
  categories: {
    gap: 0,
  },
  freshness: {
    paddingTop: 2,
  },
  cta: {
    paddingTop: 2,
  },
});

export default ExpeditionReadinessCard;
