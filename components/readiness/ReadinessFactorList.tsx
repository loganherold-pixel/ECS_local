import React from 'react';
import { StyleProp, StyleSheet, TextStyle, View, ViewStyle } from 'react-native';

import { ECSText } from '../ECSText';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import type {
  ExpeditionReadinessFactor,
  ExpeditionReadinessFactorImpact,
} from '../../lib/readiness/expeditionReadinessTypes';
import { ECS } from '../../lib/theme';
import { readinessInnerSurfaceStyle } from './readinessUi';

export type ReadinessFactorListProps = {
  title?: string;
  factors: ExpeditionReadinessFactor[];
  emptyCopy?: string;
  style?: StyleProp<ViewStyle>;
};

function factorTone(impact: ExpeditionReadinessFactorImpact) {
  if (impact === 'positive') return 'ready';
  if (impact === 'warning' || impact === 'missing') return 'warning';
  if (impact === 'blocker') return 'unavailable';
  return 'info';
}

function factorIcon(impact: ExpeditionReadinessFactorImpact) {
  if (impact === 'positive') return 'checkmark-circle-outline' as const;
  if (impact === 'warning') return 'alert-circle-outline' as const;
  if (impact === 'blocker') return 'hand-left-outline' as const;
  if (impact === 'missing') return 'help-circle-outline' as const;
  return 'ellipse-outline' as const;
}

function sourceLabel(factor: ExpeditionReadinessFactor): string {
  if (factor.isDemo || factor.isMock || factor.isInferred) return 'ECS-inferred';
  return factor.source.replace(/_/g, ' ');
}

export function ReadinessFactorList({
  title,
  factors,
  emptyCopy = 'No factors recorded for this group.',
  style,
}: ReadinessFactorListProps) {
  return (
    <View style={[styles.root, style]}>
      {title ? (
        <ECSText variant="chip" style={styles.title} numberOfLines={1}>
          {title}
        </ECSText>
      ) : null}
      {factors.length === 0 ? (
        <View style={[styles.empty, readinessInnerSurfaceStyle]}>
          <ECSText variant="helper" style={styles.emptyText} numberOfLines={2}>
            {emptyCopy}
          </ECSText>
        </View>
      ) : (
        <View style={styles.stack}>
          {factors.map((factor) => (
            <View key={factor.id} style={[styles.factor, readinessInnerSurfaceStyle]}>
              <ECSIcon name={factorIcon(factor.impact)} tier="compact" tone={factorTone(factor.impact)} />
              <View style={styles.copy}>
                <View style={styles.factorHeader}>
                  <ECSText variant="body" style={styles.label} numberOfLines={1}>
                    {factor.label}
                  </ECSText>
                  <ECSBadge label={factor.confidence} tone={factor.confidence === 'high' ? 'ready' : factor.confidence === 'medium' ? 'warning' : 'unavailable'} compact />
                </View>
                <ECSText variant="helper" style={styles.detail} numberOfLines={4}>
                  {factor.detail}
                </ECSText>
                <ECSText variant="helper" style={styles.meta} numberOfLines={1}>
                  {sourceLabel(factor)}
                  {factor.isStale ? ' / stale' : ''}
                  {factor.updatedAt ? ` / ${factor.updatedAt}` : ''}
                </ECSText>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: 8,
  },
  title: {
    color: ECS.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    includeFontPadding: false,
  } as TextStyle,
  stack: {
    gap: 8,
  },
  empty: {
    padding: 10,
  },
  emptyText: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  factor: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    padding: 10,
  },
  copy: {
    flex: 1,
    gap: 5,
    minWidth: 0,
  },
  factorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    minWidth: 0,
  },
  label: {
    flex: 1,
    color: ECS.text,
    fontSize: 12,
    lineHeight: 16,
    includeFontPadding: false,
  } as TextStyle,
  detail: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  meta: {
    color: ECS.muted,
    fontSize: 10,
    lineHeight: 13,
    textTransform: 'uppercase',
    includeFontPadding: false,
  } as TextStyle,
});

export default ReadinessFactorList;
