import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type TextStyle,
} from 'react-native';

import { ECSButton } from '../ECSButton';
import { ECSSegmentedControl } from '../ECSChip';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import { ECSPanel, ECSSectionHeader } from '../ECSSurface';
import { ECSText } from '../ECSText';
import { SourceTruthInspectorTrigger } from '../source-truth';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { ECS, TACTICAL } from '../../lib/theme';
import { evaluateSourceTruthRef } from '../../lib/sourceTruth';
import {
  buildOperationalDeltaResult,
  type OperationalDelta,
  type OperationalDeltaBaselineKind,
  type OperationalDeltaResult,
  type OperationalDeltaSeverity,
  type OperationalSnapshot,
} from '../../lib/readiness/operationalDeltaBrief';
import {
  operationalDeltaBriefStore,
  operationalDeltaContextKey,
} from '../../lib/readiness/operationalDeltaStore';

export type OperationalDeltaBriefCardProps = {
  currentSnapshot: OperationalSnapshot;
  legacyDepartureBaseline?: OperationalSnapshot | null;
  onFeedback?: (message: string) => void;
};

const BASELINE_LABELS: Record<OperationalDeltaBaselineKind, string> = {
  departure: 'Departure',
  last_stop: 'Last Stop',
  last_acknowledgment: 'Last Ack',
};

function severityTone(severity: OperationalDeltaSeverity): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (severity === 'critical') return 'unavailable';
  if (severity === 'caution' || severity === 'watch') return 'warning';
  if (severity === 'info') return 'info';
  return 'category';
}

function resultTone(result: OperationalDeltaResult): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (result.highestSeverity === 'critical') return 'unavailable';
  if (result.highestSeverity === 'caution' || result.highestSeverity === 'watch') return 'warning';
  if (result.status !== 'ready') return 'category';
  return result.deltas.length > 0 ? 'info' : 'ready';
}

function resultBadgeLabel(result: OperationalDeltaResult): string {
  if (result.status === 'no_baseline') return 'Baseline needed';
  if (result.status !== 'ready') return 'Comparison unavailable';
  if (result.deltas.length === 0) return 'No material change';
  return `${result.deltas.length} change${result.deltas.length === 1 ? '' : 's'}`;
}

function deltaCategoryLabel(delta: OperationalDelta): string {
  return delta.category.replace(/_/g, ' ');
}

function formatBaselineTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Time unknown';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function DeltaCompactRow({ delta }: { delta: OperationalDelta }) {
  return (
    <View style={styles.compactDeltaRow} testID={`operational-delta-compact-${delta.fingerprint}`}>
      <ECSIcon
        name={delta.severity === 'critical' ? 'alert-circle-outline' : 'swap-vertical-outline'}
        tier="compact"
        tone={severityTone(delta.severity)}
      />
      <View style={styles.compactDeltaCopy}>
        <ECSText variant="body" style={styles.deltaTitle} numberOfLines={1}>
          {delta.title}
        </ECSText>
        <ECSText variant="helper" style={styles.deltaSummary} numberOfLines={2}>
          {delta.summary}
        </ECSText>
      </View>
      <ECSBadge label={delta.severity} tone={severityTone(delta.severity)} compact />
    </View>
  );
}

function DeltaDetailRow({
  delta,
  onDismiss,
}: {
  delta: OperationalDelta;
  onDismiss: (delta: OperationalDelta) => void;
}) {
  const current = delta.evidence.current;
  const previous = delta.evidence.previous;
  const sourceEvaluation = evaluateSourceTruthRef(delta.sourceTruth, {
    policyKey: delta.freshnessPolicyKey,
    now: current.capturedAt,
  });

  return (
    <View style={styles.detailDeltaRow} testID={`operational-delta-detail-${delta.fingerprint}`}>
      <View style={styles.detailDeltaHeader}>
        <View style={styles.detailDeltaTitleBlock}>
          <ECSText variant="body" style={styles.deltaTitle} numberOfLines={2}>
            {delta.title}
          </ECSText>
          <View style={styles.badgeRow}>
            <ECSBadge label={delta.severity} tone={severityTone(delta.severity)} compact />
            <ECSBadge label={deltaCategoryLabel(delta)} tone="category" compact />
          </View>
        </View>
        <SourceTruthInspectorTrigger
          source={delta.sourceTruth}
          policyKey={delta.freshnessPolicyKey}
          dependencies={delta.dependencies.length > 0 ? delta.dependencies : [delta.summary]}
          label={`${sourceEvaluation.ref.origin} / ${sourceEvaluation.freshness}`}
          compact
          testID={`operational-delta-source-${delta.fingerprint}`}
        />
      </View>

      <ECSText variant="body" style={styles.detailSummary}>
        {delta.summary}
      </ECSText>

      <View style={styles.evidenceRow}>
        <View style={styles.evidenceColumn}>
          <ECSText variant="statLabel" style={styles.evidenceLabel}>BASELINE</ECSText>
          <ECSText variant="helper" style={styles.evidenceValue} numberOfLines={2}>
            {previous.displayValue}
          </ECSText>
          <ECSText variant="chip" style={styles.evidenceSource} numberOfLines={1}>
            {previous.origin} / {previous.freshness}
          </ECSText>
        </View>
        <ECSIcon name="arrow-forward-outline" tier="compact" tone="info" />
        <View style={styles.evidenceColumn}>
          <ECSText variant="statLabel" style={styles.evidenceLabel}>CURRENT</ECSText>
          <ECSText variant="helper" style={styles.evidenceValue} numberOfLines={2}>
            {current.displayValue}
          </ECSText>
          <ECSText variant="chip" style={styles.evidenceSource} numberOfLines={1}>
            {current.origin} / {current.freshness}
          </ECSText>
        </View>
      </View>

      {delta.recommendedAction ? (
        <View style={styles.actionCopyRow}>
          <ECSIcon name="navigate-circle-outline" tier="compact" tone="warning" />
          <ECSText variant="helper" style={styles.actionCopy}>
            {delta.recommendedAction}
          </ECSText>
        </View>
      ) : null}

      <View style={styles.dismissRow}>
        <ECSButton
          label="Dismiss"
          icon="close-outline"
          variant="tertiary"
          size="compact"
          onPress={() => onDismiss(delta)}
          accessibilityLabel={`Dismiss ${delta.title} change`}
        />
      </View>
    </View>
  );
}

export function OperationalDeltaBriefCard({
  currentSnapshot,
  legacyDepartureBaseline,
  onFeedback,
}: OperationalDeltaBriefCardProps) {
  const [detailVisible, setDetailVisible] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<string | null>(null);
  const storeState = useSyncExternalStore(
    operationalDeltaBriefStore.subscribe,
    operationalDeltaBriefStore.getSnapshot,
    operationalDeltaBriefStore.getSnapshot,
  );
  const contextKey = operationalDeltaContextKey(currentSnapshot);
  const context = storeState.contexts[contextKey] ?? null;
  const selectedBaseline = context?.selectedBaseline ?? 'departure';
  const baseline = context?.baselines[selectedBaseline] ?? null;
  const suppressedFingerprints = useMemo(
    () => context
      ? Array.from(new Set([
          ...Object.keys(context.dismissedFingerprints),
          ...Object.keys(context.acknowledgedFingerprints),
        ])).sort()
      : [],
    [context],
  );
  const result = useMemo(
    () => buildOperationalDeltaResult({
      baseline,
      current: currentSnapshot,
      baselineKind: selectedBaseline,
      suppressedFingerprints,
    }),
    [baseline, currentSnapshot, selectedBaseline, suppressedFingerprints],
  );
  const availableBaselines = useMemo(
    () => (['departure', 'last_stop', 'last_acknowledgment'] as OperationalDeltaBaselineKind[])
      .filter((kind) => Boolean(context?.baselines[kind])),
    [context?.baselines],
  );

  const feedback = useCallback((message: string) => {
    setLocalFeedback(message);
    onFeedback?.(message);
  }, [onFeedback]);

  useEffect(() => {
    void operationalDeltaBriefStore.hydrate();
  }, []);

  useEffect(() => {
    if (
      !storeState.hydrated ||
      !legacyDepartureBaseline ||
      context?.baselines.departure ||
      operationalDeltaContextKey(legacyDepartureBaseline) !== contextKey
    ) return;
    void operationalDeltaBriefStore.captureBaseline('departure', legacyDepartureBaseline, {
      overwrite: false,
      select: true,
    });
  }, [context?.baselines.departure, contextKey, legacyDepartureBaseline, storeState.hydrated]);

  const handleBaselineChange = useCallback((kind: string) => {
    void operationalDeltaBriefStore.selectBaseline(
      currentSnapshot,
      kind as OperationalDeltaBaselineKind,
    );
  }, [currentSnapshot]);

  const handleMarkStop = useCallback(async () => {
    const captured = await operationalDeltaBriefStore.markLastStop({
      ...currentSnapshot,
      label: 'Last stop',
    });
    feedback(captured ? 'Last stop baseline saved locally.' : 'Last stop baseline could not be saved.');
  }, [currentSnapshot, feedback]);

  const handleAcknowledge = useCallback(async () => {
    const captured = await operationalDeltaBriefStore.acknowledge(result, {
      ...currentSnapshot,
      label: 'Last acknowledgment',
    });
    feedback(captured
      ? 'Operational changes acknowledged. Current state is now the last acknowledgment baseline.'
      : 'Acknowledgment could not be saved.');
  }, [currentSnapshot, feedback, result]);

  const handleDismiss = useCallback(async (delta: OperationalDelta) => {
    const dismissed = await operationalDeltaBriefStore.dismissDelta(currentSnapshot, delta.fingerprint);
    feedback(dismissed ? `${delta.title} dismissed for this exact state.` : 'Change could not be dismissed.');
  }, [currentSnapshot, feedback]);

  const topDeltas = result.deltas.slice(0, 3);

  return (
    <>
      <Pressable
        onPress={() => setDetailVisible(true)}
        accessibilityRole="button"
        accessibilityLabel={`What changed. ${result.summary}`}
        accessibilityHint="Opens all operational changes and source details."
        testID="operational-delta-brief-card"
        style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleBlock}>
            <ECSText variant="cardTitle" style={styles.cardTitle}>WHAT CHANGED</ECSText>
            <ECSText variant="helper" style={styles.cardSubtitle} numberOfLines={2}>
              Since {BASELINE_LABELS[selectedBaseline].toLowerCase()}
              {baseline ? ` / ${formatBaselineTime(baseline.capturedAt)}` : ''}
            </ECSText>
          </View>
          <ECSBadge label={resultBadgeLabel(result)} tone={resultTone(result)} compact />
        </View>

        {topDeltas.length > 0 ? (
          <View style={styles.compactDeltaList}>
            {topDeltas.map((delta) => <DeltaCompactRow key={delta.id} delta={delta} />)}
          </View>
        ) : (
          <ECSText variant="helper" style={styles.emptyCopy} numberOfLines={3}>
            {result.summary}
          </ECSText>
        )}

        <View style={styles.cardFooter}>
          <ECSText variant="chip" style={styles.cardFooterCopy} numberOfLines={1}>
            DETERMINISTIC OPERATIONAL COMPARISON
          </ECSText>
          <ECSIcon name="chevron-forward-outline" tier="compact" tone="info" />
        </View>
      </Pressable>

      <ECSModalShell
        visible={detailVisible}
        onClose={() => setDetailVisible(false)}
        title="What Changed"
        subtitle={result.summary}
        eyebrow="ECS OPERATIONAL DELTA"
        icon="git-compare-outline"
        overlayClass="editor"
        stackBehavior="allow-stack"
        maxWidth={760}
        maxHeightFraction={0.9}
        minHeightFraction={0.62}
        scrollable
        dismissOnBackdrop
        allowSwipeDismiss
        showHandle
        contentContainerStyle={styles.modalContent}
        footer={(
          <ECSOverlayFooter>
            <ECSButton
              label="Close"
              icon="close-outline"
              variant="tertiary"
              size="medium"
              onPress={() => setDetailVisible(false)}
              grow
            />
            <ECSButton
              label="Acknowledge"
              icon="checkmark-circle-outline"
              variant="primary"
              size="medium"
              onPress={() => void handleAcknowledge()}
              disabled={result.status === 'invalid_current'}
              grow
            />
          </ECSOverlayFooter>
        )}
      >
        <View style={styles.modalRoot} testID="operational-delta-detail-sheet">
          <ECSPanel variant="secondary" style={styles.baselinePanel}>
            <ECSSectionHeader
              title="Comparison Baseline"
              icon="time-outline"
              subtitle={baseline
                ? `${BASELINE_LABELS[selectedBaseline]} / ${formatBaselineTime(baseline.capturedAt)}`
                : 'No saved baseline for this route or expedition'}
              badge={<ECSBadge label={resultBadgeLabel(result)} tone={resultTone(result)} compact />}
            />
            {availableBaselines.length > 1 ? (
              <ECSSegmentedControl
                options={availableBaselines.map((kind) => ({
                  key: kind,
                  label: BASELINE_LABELS[kind],
                }))}
                value={selectedBaseline}
                onChange={handleBaselineChange}
              />
            ) : availableBaselines.length === 1 ? (
              <ECSBadge label={BASELINE_LABELS[availableBaselines[0]]} tone="selected" compact />
            ) : null}
            <View style={styles.baselineActions}>
              <ECSButton
                label="Mark Last Stop"
                icon="flag-outline"
                variant="secondary"
                size="compact"
                onPress={() => void handleMarkStop()}
              />
            </View>
            {localFeedback ? (
              <ECSText variant="helper" style={styles.feedbackCopy}>
                {localFeedback}
              </ECSText>
            ) : null}
          </ECSPanel>

          <ECSPanel
            variant={result.highestSeverity === 'critical' ? 'warning' : 'quiet'}
            style={styles.changesPanel}
          >
            <ECSSectionHeader
              title="Material Changes"
              icon="swap-vertical-outline"
              subtitle={`${result.deltas.length} visible / ${result.suppressedCount} acknowledged or dismissed`}
            />
            {result.deltas.length > 0 ? (
              <View style={styles.detailDeltaList}>
                {result.deltas.map((delta) => (
                  <DeltaDetailRow key={delta.id} delta={delta} onDismiss={handleDismiss} />
                ))}
              </View>
            ) : (
              <View style={styles.detailEmpty}>
                <ECSIcon
                  name={result.status === 'ready' ? 'checkmark-circle-outline' : 'help-circle-outline'}
                  tier="action"
                  tone={result.status === 'ready' ? 'ready' : 'info'}
                />
                <ECSText variant="body" style={styles.detailEmptyCopy}>
                  {result.summary}
                </ECSText>
              </View>
            )}
          </ECSPanel>
        </View>
      </ECSModalShell>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    gap: ECS_SURFACE.gap.stack,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  pressed: {
    opacity: 0.82,
  },
  cardHeader: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ECS_SURFACE.gap.row,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  cardTitle: {
    color: ECS.text,
  } as TextStyle,
  cardSubtitle: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  compactDeltaList: {
    gap: ECS_SURFACE.gap.group,
  },
  compactDeltaRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.group,
    paddingTop: ECS_SURFACE.gap.group,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ECS.strokeMuted,
  },
  compactDeltaCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  deltaTitle: {
    color: ECS.text,
    lineHeight: 17,
  } as TextStyle,
  deltaSummary: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  emptyCopy: {
    color: ECS.muted,
    lineHeight: 17,
  } as TextStyle,
  cardFooter: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: ECS_SURFACE.gap.group,
  },
  cardFooterCopy: {
    flex: 1,
    color: TACTICAL.textMuted,
  } as TextStyle,
  modalContent: {
    paddingBottom: 18,
  },
  modalRoot: {
    gap: ECS_SURFACE.gap.section,
  },
  baselinePanel: {
    gap: ECS_SURFACE.gap.group,
  },
  baselineActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ECS_SURFACE.gap.group,
  },
  feedbackCopy: {
    color: ECS.muted,
    lineHeight: 15,
  } as TextStyle,
  changesPanel: {
    gap: ECS_SURFACE.gap.group,
  },
  detailDeltaList: {
    gap: ECS_SURFACE.gap.stack,
  },
  detailDeltaRow: {
    gap: ECS_SURFACE.gap.group,
    paddingTop: ECS_SURFACE.gap.stack,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ECS.strokeMuted,
  },
  detailDeltaHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ECS_SURFACE.gap.row,
  },
  detailDeltaTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: ECS_SURFACE.gap.group,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ECS_SURFACE.gap.group,
  },
  detailSummary: {
    color: ECS.text,
    lineHeight: 18,
  } as TextStyle,
  evidenceRow: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.group,
  },
  evidenceColumn: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  evidenceLabel: {
    color: TACTICAL.textMuted,
  } as TextStyle,
  evidenceValue: {
    color: ECS.text,
    lineHeight: 15,
  } as TextStyle,
  evidenceSource: {
    color: ECS.muted,
    textTransform: 'uppercase',
  } as TextStyle,
  actionCopyRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS_SURFACE.gap.group,
  },
  actionCopy: {
    flex: 1,
    color: ECS.text,
    lineHeight: 16,
  } as TextStyle,
  dismissRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  detailEmpty: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.group,
  },
  detailEmptyCopy: {
    flex: 1,
    color: ECS.muted,
    lineHeight: 18,
  } as TextStyle,
});

export default OperationalDeltaBriefCard;
