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
import type { ExpeditionReadinessAssessment } from '../../lib/readiness/expeditionReadinessTypes';
import {
  useCurrentExpeditionReadiness,
  selectTopReadinessConcerns,
} from '../../lib/readiness/expeditionReadinessSelectors';
import { ECS } from '../../lib/theme';
import { readinessInnerSurfaceStyle } from './readinessUi';
import { ReadinessDecisionBadge } from './ReadinessDecisionBadge';
import { ReadinessScoreRing } from './ReadinessScoreRing';
import { ReadinessFreshnessLine } from './ReadinessFreshnessLine';
import { ReadinessDetailSheet } from './ReadinessDetailSheet';

export interface ReadinessMiniCardProps {
  assessment?: ExpeditionReadinessAssessment | null;
  cta?: React.ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ReadinessMiniCard({
  assessment: assessmentProp,
  cta,
  onPress,
  style,
}: ReadinessMiniCardProps) {
  const liveAssessment = useCurrentExpeditionReadiness();
  const assessment = assessmentProp ?? liveAssessment;
  const [detailVisible, setDetailVisible] = useState(false);

  if (!assessment) {
    return (
      <View style={[styles.card, readinessInnerSurfaceStyle, style]}>
        <ECSText variant="cardTitle" style={styles.title} numberOfLines={1}>
          Expedition Readiness
        </ECSText>
        <ECSText variant="helper" style={styles.concern} numberOfLines={3}>
          Limited confidence until readiness inputs are available.
        </ECSText>
        {cta ? <View>{cta}</View> : <ECSText variant="chip" style={styles.ctaText}>Open Brief</ECSText>}
      </View>
    );
  }

  const concern = selectTopReadinessConcerns(assessment, 1)[0];
  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }
    setDetailVisible(true);
  };

  return (
    <>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.card,
          readinessInnerSurfaceStyle,
          pressed && styles.pressed,
          style,
        ]}
      >
        <View style={styles.top}>
          <ReadinessScoreRing
            score={assessment.overallScore}
            status={assessment.status}
            size={68}
            strokeWidth={6}
            compact
            onPress={() => setDetailVisible(true)}
          />
          <View style={styles.topText}>
            <ECSText variant="cardTitle" style={styles.title} numberOfLines={1}>
              Readiness
            </ECSText>
            <ReadinessDecisionBadge status={assessment.status} compact />
          </View>
        </View>
        <ECSText variant="helper" style={styles.concern} numberOfLines={3}>
          {concern?.summary ?? assessment.explanation}
        </ECSText>
        <ReadinessFreshnessLine assessment={assessment} maxItems={1} />
        {cta ? <View>{cta}</View> : <ECSText variant="chip" style={styles.ctaText}>Open Brief</ECSText>}
      </Pressable>
      <ReadinessDetailSheet
        visible={detailVisible}
        assessment={assessment}
        onClose={() => setDetailVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 12,
    gap: 9,
    overflow: 'hidden',
    minHeight: 156,
  },
  pressed: {
    opacity: 0.86,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  topText: {
    flex: 1,
    gap: 7,
    minWidth: 0,
  },
  title: {
    color: ECS.text,
    includeFontPadding: false,
  } as TextStyle,
  concern: {
    color: ECS.muted,
    lineHeight: 16,
  } as TextStyle,
  ctaText: {
    color: ECS.accent,
    textTransform: 'uppercase',
  } as TextStyle,
});

export default ReadinessMiniCard;
