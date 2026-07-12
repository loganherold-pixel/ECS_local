import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import { StyleSheet, View } from 'react-native';

import { ECSButton } from '../ECSButton';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import { ECSPanel, ECSSectionHeader } from '../ECSSurface';
import { ECSText } from '../ECSText';
import { SourceTruthInspectorTrigger } from '../source-truth';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { TACTICAL } from '../../lib/theme';
import type { ExpeditionTripRecord } from '../../lib/expedition/expeditionTripRecordTypes';
import {
  isTripLearningEffective,
  isTripLearningLocalFeatureEnabled,
  type TripLearningFeatureFlags,
} from '../../lib/tripLearning/tripLearningConfig';
import { processCompletedExpeditionTripForLearning } from '../../lib/tripLearning/tripLearningAdapters';
import {
  selectTripLearningSummary,
  tripLearningStore,
} from '../../lib/tripLearning/tripLearningStore';
import type {
  CalibrationProposal,
  PostTripInspectionPrompt,
} from '../../lib/tripLearning/tripLearningTypes';

export type TripLearningSummaryCardProps = {
  trip: ExpeditionTripRecord;
  featureFlags?: TripLearningFeatureFlags | null;
};

function metricLabel(proposal: CalibrationProposal): string {
  if (proposal.metric === 'drive_time') return 'Drive-time calibration';
  if (proposal.metric === 'fuel_consumption') return 'Fuel-use calibration';
  if (proposal.metric === 'power_runtime') return 'Power-runtime calibration';
  return 'Camp-arrival calibration';
}

function adjustmentLabel(proposal: CalibrationProposal): string {
  if (proposal.adjustmentKind === 'camp_arrival_offset_minutes') {
    const sign = proposal.proposedValue >= 0 ? '+' : '';
    return `${sign}${proposal.proposedValue.toFixed(0)} min`;
  }
  const percent = (proposal.proposedValue - 1) * 100;
  return `${percent >= 0 ? '+' : ''}${percent.toFixed(0)}%`;
}

function varianceLabel(proposal: CalibrationProposal): string {
  if (proposal.metric === 'camp_arrival') return `${proposal.standardDeviation.toFixed(1)} min spread`;
  return `${(proposal.standardDeviation * 100).toFixed(1)}% spread`;
}

function datePeriod(proposal: CalibrationProposal): string {
  const start = new Date(proposal.dataPeriodStart);
  const end = new Date(proposal.dataPeriodEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Period unknown';
  return `${start.toLocaleDateString()} - ${end.toLocaleDateString()}`;
}

function proposalTone(proposal: CalibrationProposal): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (!proposal.canApply || proposal.confidence === 'low') return 'warning';
  if (proposal.status === 'applied') return 'active';
  return 'info';
}

function InspectionRow({ prompt }: { prompt: PostTripInspectionPrompt }) {
  const evidence = prompt.evidence[0];
  return (
    <View style={styles.inspectionRow} testID={`trip-learning-inspection-${prompt.id}`}>
      <ECSIcon name="checkmark-done-outline" tier="compact" tone="warning" />
      <View style={styles.inspectionCopy}>
        <ECSText variant="body" style={styles.rowTitle}>{prompt.title}</ECSText>
        <ECSText variant="helper" style={styles.rowDetail}>{prompt.instruction}</ECSText>
        <ECSText variant="chip" style={styles.evidenceLabel} numberOfLines={2}>
          Evidence: {evidence?.label ?? 'Unknown'}
        </ECSText>
      </View>
      <SourceTruthInspectorTrigger
        source={prompt.sourceTruth}
        policyKey={evidence?.freshnessPolicyKey ?? 'default'}
        dependencies={[prompt.rationale, evidence?.label ?? 'Evidence unavailable']}
        label={`${prompt.sourceTruth.origin} / ${prompt.confidence}`}
        compact
        testID={`trip-learning-inspection-source-${prompt.id}`}
      />
    </View>
  );
}

export function TripLearningSummaryCard({
  trip,
  featureFlags,
}: TripLearningSummaryCardProps) {
  const state = useSyncExternalStore(
    tripLearningStore.subscribe,
    tripLearningStore.getSnapshot,
    tripLearningStore.getSnapshot,
  );
  const [reviewProposalId, setReviewProposalId] = useState<string | null>(null);
  const [busyProposalId, setBusyProposalId] = useState<string | null>(null);
  const rolloutEnabled = isTripLearningLocalFeatureEnabled(featureFlags);
  const enabled = isTripLearningEffective(state.preferences, featureFlags);
  const summary = useMemo(
    () => selectTripLearningSummary(state, trip.id, trip.id),
    [state, trip.id],
  );

  useEffect(() => {
    void tripLearningStore.hydrate();
  }, []);

  useEffect(() => {
    if (!enabled || trip.status !== 'completed') return;
    void processCompletedExpeditionTripForLearning(trip, featureFlags);
  }, [enabled, featureFlags, trip]);

  const visiblePrompts = summary.inspectionPrompts.filter((prompt) => prompt.status === 'open').slice(0, 3);
  const visibleProposals = summary.proposals.filter((proposal) => proposal.status !== 'dismissed');
  const proposal = visibleProposals[0] ?? null;
  const reviewed = proposal && reviewProposalId === proposal.id;

  const runProposalAction = useCallback(async (
    proposalId: string,
    action: 'apply' | 'dismiss' | 'revert',
  ) => {
    setBusyProposalId(proposalId);
    try {
      if (action === 'apply') await tripLearningStore.applyProposal(proposalId, true);
      if (action === 'dismiss') await tripLearningStore.dismissProposal(proposalId);
      if (action === 'revert') await tripLearningStore.revertProposal(proposalId);
    } finally {
      setBusyProposalId(null);
    }
  }, []);

  if (!rolloutEnabled || !enabled) return null;

  return (
    <ECSPanel variant="secondary" style={styles.panel}>
      <ECSSectionHeader
        title="POST-TRIP LEARNING"
        subtitle="Qualified local outcomes and source-backed inspections"
        icon="analytics-outline"
        badge={<ECSBadge label="Local only" tone="category" compact />}
      />

      <View style={styles.statusRow}>
        <ECSBadge label={`${summary.sampleCount} qualified sample${summary.sampleCount === 1 ? '' : 's'}`} tone={summary.sampleCount > 0 ? 'info' : 'category'} compact />
        <ECSBadge label={`${visiblePrompts.length} inspection prompt${visiblePrompts.length === 1 ? '' : 's'}`} tone={visiblePrompts.length > 0 ? 'warning' : 'category'} compact />
        <ECSBadge label="Cloud sync off" tone="category" compact />
      </View>

      {proposal ? (
        <View style={styles.proposalSection} testID={`trip-learning-proposal-${proposal.id}`}>
          <View style={styles.proposalHeader}>
            <View style={styles.proposalCopy}>
              <ECSText variant="body" style={styles.rowTitle}>{metricLabel(proposal)}</ECSText>
              <ECSText variant="helper" style={styles.rowDetail}>
                {adjustmentLabel(proposal)} from {proposal.sampleCount} samples / {proposal.confidence} confidence
              </ECSText>
            </View>
            <ECSBadge label={proposal.status} tone={proposalTone(proposal)} compact />
          </View>
          <View style={styles.actionRow}>
            <ECSButton
              label={reviewed ? 'Hide review' : 'Review proposal'}
              icon={reviewed ? 'chevron-up-outline' : 'document-text-outline'}
              size="compact"
              variant="secondary"
              onPress={() => setReviewProposalId(reviewed ? null : proposal.id)}
            />
            {proposal.status === 'applied' ? (
              <ECSButton
                label="Revert"
                icon="arrow-undo-outline"
                size="compact"
                variant="tertiary"
                loading={busyProposalId === proposal.id}
                onPress={() => void runProposalAction(proposal.id, 'revert')}
              />
            ) : null}
          </View>
          {reviewed ? (
            <View style={styles.reviewDetail}>
              <View style={styles.metricRow}>
                <ECSText variant="helper" style={styles.metricText}>{varianceLabel(proposal)}</ECSText>
                <ECSText variant="helper" style={styles.metricText}>{datePeriod(proposal)}</ECSText>
                <SourceTruthInspectorTrigger
                  source={proposal.sourceTruth}
                  policyKey="vehicle_profile"
                  dependencies={[
                    `${proposal.sampleCount} qualified samples`,
                    varianceLabel(proposal),
                    ...proposal.warnings,
                  ]}
                  label={`${proposal.sourceTruth.origin} / ${proposal.confidence}`}
                  compact
                  testID={`trip-learning-proposal-source-${proposal.id}`}
                />
              </View>
              {proposal.warnings.length > 0 ? (
                <ECSText variant="helper" style={styles.warningText}>
                  {proposal.warnings.join(' / ').replace(/_/g, ' ')}. {proposal.canApply
                    ? 'Source limits remain visible; applying still creates only a reversible local overlay.'
                    : 'Review only; no vehicle or route value has changed.'}
                </ECSText>
              ) : (
                <ECSText variant="helper" style={styles.reviewCopy}>
                  Applying creates a reversible local calibration overlay. It does not edit the vehicle profile or route forecast directly.
                </ECSText>
              )}
              {proposal.status !== 'applied' ? (
                <View style={styles.actionRow}>
                  <ECSButton
                    label="Apply"
                    icon="checkmark-outline"
                    size="compact"
                    variant="primary"
                    disabled={!proposal.canApply}
                    loading={busyProposalId === proposal.id}
                    onPress={() => void runProposalAction(proposal.id, 'apply')}
                  />
                  <ECSButton
                    label="Dismiss"
                    icon="close-outline"
                    size="compact"
                    variant="tertiary"
                    disabled={busyProposalId === proposal.id}
                    onPress={() => void runProposalAction(proposal.id, 'dismiss')}
                  />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}

      {visiblePrompts.length > 0 ? (
        <View style={styles.inspectionList}>
          {visiblePrompts.map((prompt) => <InspectionRow key={prompt.id} prompt={prompt} />)}
        </View>
      ) : null}

      {!proposal && visiblePrompts.length === 0 ? (
        <View style={styles.emptyRow}>
          <ECSIcon name="help-circle-outline" tier="compact" tone="info" />
          <ECSText variant="helper" style={styles.emptyText}>
            No qualified forecast comparison or strong inspection evidence is available for this trip.
          </ECSText>
        </View>
      ) : null}
    </ECSPanel>
  );
}

const styles = StyleSheet.create({
  panel: {
    gap: 10,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  proposalSection: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
  },
  proposalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  proposalCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  rowTitle: {
    color: TACTICAL.text,
    fontWeight: '800',
  },
  rowDetail: {
    color: TACTICAL.textMuted,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  reviewDetail: {
    gap: 8,
    padding: 8,
    borderRadius: ECS_SURFACE.radius.compact,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    backgroundColor: ECS_SURFACE.background.quiet,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 7,
  },
  metricText: {
    color: TACTICAL.textMuted,
  },
  reviewCopy: {
    color: TACTICAL.textMuted,
  },
  warningText: {
    color: TACTICAL.warning,
  },
  inspectionList: {
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
  },
  inspectionRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  inspectionCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  evidenceLabel: {
    color: TACTICAL.textMuted,
  },
  emptyRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
  },
  emptyText: {
    flex: 1,
    color: TACTICAL.textMuted,
  },
});

export default TripLearningSummaryCard;
