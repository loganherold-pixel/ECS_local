import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ECSCard } from '../ECSSurface';
import { ECSBadge } from '../ECSStatus';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { getDispatchContextTypeLabel } from '../../lib/dispatchContextAdapter';
import type { DispatchNavigateContextTarget } from '../../lib/dispatchNavigateContextHandoff';
import { formatSourceTruthAge } from '../../lib/sourceTruthPresentation';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';

export default function DispatchContextHandoffCard({
  target,
  onClose,
  onReturnToDispatch,
}: {
  target: DispatchNavigateContextTarget;
  onClose: () => void;
  onReturnToDispatch: () => void;
}) {
  const sourceLabel = target.sourceTruth.authority ?? target.sourceTruth.provider ?? 'Source unknown';
  const observedLabel = formatTimestamp(target.sourceTruth.observedAt);
  const ageLabel = formatSourceTruthAge(target.ageMs);
  const tone: React.ComponentProps<typeof ECSBadge>['tone'] = target.availability === 'unavailable'
    ? 'unavailable'
    : target.stale || target.availability === 'degraded'
      ? 'warning'
      : 'ready';

  return (
    <ECSCard
      variant={target.stale || target.availability !== 'usable' ? 'warning' : 'primary'}
      style={styles.card}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Dispatch context: ${target.title}`}
        testID="navigate-dispatch-context-handoff-card"
      >
        <View style={styles.header}>
          <View style={styles.titleWrap}>
            <Text style={styles.eyebrow}>DISPATCH CONTEXT</Text>
            <Text style={styles.title} numberOfLines={2}>{target.title}</Text>
          </View>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onClose}
            activeOpacity={0.78}
            accessibilityRole="button"
            accessibilityLabel="Close Dispatch context"
            testID="navigate-dispatch-context-close"
          >
            <Ionicons name="close" size={16} color={TACTICAL.textMuted} />
          </TouchableOpacity>
        </View>

        {target.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={3}>{target.subtitle}</Text>
        ) : null}

        <View style={styles.badges}>
          <ECSBadge
            label={getDispatchContextTypeLabel(target.contextType)}
            tone="info"
            compact
          />
          <ECSBadge label={target.freshness.toUpperCase()} tone={tone} compact />
          <ECSBadge label={target.sourceTruth.origin.toUpperCase()} tone="category" compact />
          <ECSBadge label={target.availability.toUpperCase()} tone={tone} compact />
        </View>

        <View style={styles.facts}>
          <Text style={styles.fact} numberOfLines={2}>Source: {sourceLabel}</Text>
          <Text style={styles.fact} numberOfLines={2}>
            Observed: {observedLabel ?? 'Unknown'} | Age: {ageLabel}
          </Text>
          <Text style={styles.fact} numberOfLines={2}>
            Confidence: {target.confidence.toUpperCase()} | Coverage: {target.coverage.toUpperCase()}
          </Text>
        </View>

        <Text
          style={target.stale || target.availability !== 'usable' ? styles.warning : styles.message}
          numberOfLines={3}
        >
          {target.message}
        </Text>

        {target.warningCodes.length > 0 ? (
          <Text style={styles.warningCodes} numberOfLines={2}>
            {target.warningCodes.slice(0, 3).map(formatWarningCode).join(' | ')}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.returnButton}
            onPress={onReturnToDispatch}
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Return to Dispatch"
            testID="navigate-return-to-dispatch"
          >
            <Ionicons name="arrow-back" size={15} color={TACTICAL.amber} />
            <Text style={styles.returnText}>RETURN TO DISPATCH</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ECSCard>
  );
}

function formatTimestamp(value: string | null | undefined): string | null {
  const parsed = Date.parse(String(value ?? ''));
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toLocaleString();
}

function formatWarningCode(value: string): string {
  return value.replace(/[_-]+/g, ' ').trim().toUpperCase();
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 360,
    borderColor: GOLD_RAIL.internal,
    gap: 0,
  },
  header: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  eyebrow: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 0,
  },
  title: {
    color: TACTICAL.text,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    letterSpacing: 0,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: 4,
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  badges: {
    marginTop: 9,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  facts: {
    marginTop: 9,
    gap: 3,
  },
  fact: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  message: {
    marginTop: 8,
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
  },
  warning: {
    marginTop: 8,
    color: TACTICAL.amber,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '900',
  },
  warningCodes: {
    marginTop: 5,
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '800',
  },
  actions: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    flexDirection: 'row',
  },
  returnButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: TACTICAL.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: TACTICAL.panel,
  },
  returnText: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0,
  },
});
