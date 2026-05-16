import React from 'react';
import { Pressable, StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { ECSText } from '../ECSText';
import { ECS_STATUS } from '../../lib/ecsStatusTokens';
import { ECS } from '../../lib/theme';
import type { ExpeditionReadinessStatus } from '../../lib/readiness/expeditionReadinessTypes';
import {
  readinessStatusLabel,
  readinessStatusTone,
} from './readinessUi';

export interface ReadinessScoreRingProps {
  score: number;
  status: ExpeditionReadinessStatus;
  size?: number;
  strokeWidth?: number;
  compact?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ReadinessScoreRing({
  score,
  status,
  size = 92,
  strokeWidth = 7,
  compact = false,
  onPress,
  style,
}: ReadinessScoreRingProps) {
  const boundedScore = Math.max(0, Math.min(100, Math.round(score)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (boundedScore / 100) * circumference;
  const tone = ECS_STATUS.tone[readinessStatusTone(status)];
  const center = size / 2;

  const ringContent = (
    <>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={ECS_STATUS.tone.info.border}
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={tone.text}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      <View style={[styles.center, { width: size, height: size }]}>
        <ECSText
          variant="statValue"
          style={[styles.score, compact && styles.scoreCompact, { color: tone.text }] as TextStyle[]}
          numberOfLines={1}
        >
          {boundedScore}
        </ECSText>
        <ECSText
          variant="chip"
          style={[styles.status, { color: ECS.muted }] as TextStyle[]}
          numberOfLines={1}
        >
          {readinessStatusLabel(status)}
        </ECSText>
      </View>
    </>
  );

  const containerStyle = [
    styles.container,
    compact && styles.compactContainer,
    { width: size, minHeight: size },
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={containerStyle}
        accessibilityRole="button"
        accessibilityLabel={`Expedition readiness ${readinessStatusLabel(status)}, score ${boundedScore} out of 100`}
      >
        {ringContent}
      </Pressable>
    );
  }

  return (
    <View
      style={containerStyle}
      accessibilityRole="summary"
      accessibilityLabel={`Expedition readiness ${readinessStatusLabel(status)}, score ${boundedScore} out of 100`}
    >
      {ringContent}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  compactContainer: {
    alignSelf: 'flex-start',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  score: {
    fontSize: 26,
    lineHeight: 30,
    includeFontPadding: false,
  } as TextStyle,
  scoreCompact: {
    fontSize: 20,
    lineHeight: 24,
  } as TextStyle,
  status: {
    fontSize: 8,
    lineHeight: 11,
    includeFontPadding: false,
    textTransform: 'uppercase',
  } as TextStyle,
});

export default ReadinessScoreRing;
