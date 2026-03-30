/**
 * ExpeditionStatePill — Global State Indicator
 *
 * Reduces user mental load by clearly indicating whether the app
 * is in Planning mode or Active Expedition mode.
 *
 * States:
 *   NONE / DRAFT / READY  → "Planning"
 *   IN_PROGRESS            → "In Progress"
 *
 * Style: minimal, no heavy banner, no extra containers.
 * Does not introduce scrolling or move major layout elements.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export type ExpeditionPhase = 'planning' | 'active';

interface ExpeditionStatePillProps {
  phase: ExpeditionPhase;
}

const PHASE_CONFIG: Record<ExpeditionPhase, { label: string; dotColor: string; textColor: string; borderColor: string; bgColor: string }> = {
  planning: {
    label: 'Planning',
    dotColor: '#5B8DEF',
    textColor: '#5B8DEF',
    borderColor: 'rgba(91, 141, 239, 0.2)',
    bgColor: 'rgba(91, 141, 239, 0.06)',
  },
  active: {
    label: 'In Progress',
    dotColor: '#4CAF50',
    textColor: '#4CAF50',
    borderColor: 'rgba(76, 175, 80, 0.25)',
    bgColor: 'rgba(76, 175, 80, 0.06)',
  },
};

export default function ExpeditionStatePill({ phase }: ExpeditionStatePillProps) {
  const config = PHASE_CONFIG[phase];

  return (
    <View style={[styles.pill, { borderColor: config.borderColor, backgroundColor: config.bgColor }]}>
      <View style={[styles.dot, { backgroundColor: config.dotColor }]} />
      <Text style={[styles.label, { color: config.textColor }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

});



