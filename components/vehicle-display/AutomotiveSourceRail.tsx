import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { ECSAutomotiveSafeValue } from '../../lib/automotive/automotiveSafeTypes';

interface Props {
  state: ECSAutomotiveSafeValue<unknown>;
}

function freshnessLabel(value: ECSAutomotiveSafeValue<unknown>['freshness']): string {
  if (value === 'unavailable') return 'UNAVAILABLE';
  return value.toUpperCase();
}

function freshnessColor(value: ECSAutomotiveSafeValue<unknown>['freshness']): string {
  if (value === 'live') return '#4CAF50';
  if (value === 'recent') return '#5AC8FA';
  if (value === 'stale') return '#D4A017';
  return '#EF5350';
}

function updateLabel(value: string | null): string {
  if (!value) return 'Update time unavailable';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Update time unavailable';
  return `Updated ${new Date(parsed).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}

export default function AutomotiveSourceRail({ state }: Props) {
  const accent = freshnessColor(state.freshness);
  return (
    <View style={styles.rail} accessibilityLabel={`${state.sourceLabel}, ${state.freshness}`}>
      <View style={[styles.dot, { backgroundColor: accent }]} />
      <Text style={[styles.freshness, { color: accent }]} numberOfLines={1}>
        {freshnessLabel(state.freshness)}
      </Text>
      <Text style={styles.source} numberOfLines={1}>
        {state.sourceLabel}
      </Text>
      <Text style={styles.detail} numberOfLines={1}>
        {state.confidence.toUpperCase()} CONFIDENCE  |  {updateLabel(state.lastUpdatedAt)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    minHeight: 34,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: '#0B0E12',
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  freshness: {
    fontSize: 10,
    fontWeight: '800',
  },
  source: {
    maxWidth: '35%',
    fontSize: 11,
    fontWeight: '700',
    color: '#C7D1DB',
  },
  detail: {
    flex: 1,
    textAlign: 'right',
    fontSize: 9,
    fontWeight: '600',
    color: '#727D89',
  },
});

