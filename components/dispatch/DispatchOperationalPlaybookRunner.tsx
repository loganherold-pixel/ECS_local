import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge } from '../ECSStatus';
import { ECSPanel, ECSSection, ECSSectionHeader } from '../ECSSurface';
import { ECSHelperText, ECSStatLabel, ECSStatValue, ECSText } from '../ECSText';
import {
  ECSFreshnessBadge,
  ECSSourceBadge,
} from '../source-truth/SourceTruthIndicators';
import { SourceTruthInspectorTrigger } from '../source-truth/SourceTruthInspector';
import {
  buildOperationalPlaybookRunnerModel,
  type OperationalPlaybookRunnerActionModel,
  type OperationalPlaybookRunnerIntent,
} from '../../lib/dispatchOperationalPlaybookPresentation';
import type {
  OperationalPlaybookDefinition,
  OperationalPlaybookInstance,
  OperationalPlaybookReadiness,
} from '../../lib/dispatchOperationalPlaybookTypes';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { ECS, TACTICAL } from '../../lib/theme';

export interface DispatchOperationalPlaybookRunnerProps {
  enabled: boolean;
  visible: boolean;
  definition: OperationalPlaybookDefinition;
  instance: OperationalPlaybookInstance;
  readiness: OperationalPlaybookReadiness;
  now?: string | number | Date;
  scenarioContent?: React.ReactNode;
  onClose: () => void;
  onIntent: (intent: OperationalPlaybookRunnerIntent) => void;
}

// This presentation boundary owns no state and emits user intents only. The
// deterministic playbook domain remains the sole authority for mutations.
export function DispatchOperationalPlaybookRunner({
  enabled,
  visible,
  definition,
  instance,
  readiness,
  now,
  scenarioContent,
  onClose,
  onIntent,
}: DispatchOperationalPlaybookRunnerProps) {
  const model = useMemo(() => buildOperationalPlaybookRunnerModel({
    definition,
    instance,
    readiness,
    now,
  }), [definition, instance, now, readiness]);

  const requestAction = useCallback((action: OperationalPlaybookRunnerActionModel) => {
    if (!action.disabled) onIntent(action.intent);
  }, [onIntent]);

  if (!enabled) return null;

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title={model.title}
      subtitle={`${model.stateLabel} / ${model.progressLabel}`}
      eyebrow="MISSION COMMAND / OPERATIONAL PLAYBOOK"
      icon="git-branch-outline"
      overlayClass="workflow"
      stackBehavior="allow-stack"
      maxWidth={920}
      maxHeightFraction={0.94}
      minHeightFraction={0.82}
      scrollable
      dismissOnBackdrop={false}
      allowSwipeDismiss={false}
      contentContainerStyle={styles.content}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Close"
            icon="close-outline"
            variant="tertiary"
            size="medium"
            grow
            onPress={onClose}
          />
          {model.primaryAction ? (
            <ECSButton
              label={model.primaryAction.label}
              icon={model.primaryAction.icon}
              variant="primary"
              size="medium"
              grow
              disabled={model.primaryAction.disabled}
              accessibilityHint={model.primaryAction.disabledReason}
              onPress={() => requestAction(model.primaryAction!)}
            />
          ) : null}
        </ECSOverlayFooter>
      )}
    >
      <View
        style={styles.root}
        accessibilityViewIsModal
      >
        <ECSPanel variant={model.stateTone === 'unavailable' ? 'warning' : 'secondary'}>
          <View
            style={styles.summaryHeader}
            accessible
            accessibilityRole="summary"
            accessibilityLabel={model.accessibilitySummary}
          >
            <View style={styles.summaryCopy}>
              <ECSText variant="cardTitle">Current Situation</ECSText>
              <ECSText variant="body" style={styles.bodyCopy}>{model.currentSituation}</ECSText>
            </View>
            <ECSBadge label={model.stateLabel} tone={model.stateTone} compact />
          </View>
          <View
            style={styles.progressTrack}
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel="Operational Playbook progress"
            accessibilityValue={{ min: 0, max: 100, now: model.progressPercent, text: model.progressLabel }}
          >
            <View style={[styles.progressFill, { width: `${model.progressPercent}%` }]} />
          </View>
          <ECSHelperText>{model.progressLabel}</ECSHelperText>
        </ECSPanel>

        {scenarioContent}

        {model.blockedReason ? (
          <ECSPanel variant="warning" style={styles.sectionPanel}>
            <ECSSectionHeader title="Blocked" icon="warning-outline" />
            <ECSText variant="body" style={styles.bodyCopy}>{model.blockedReason}</ECSText>
          </ECSPanel>
        ) : null}

        <ECSSection style={styles.sectionPanel}>
          <ECSSectionHeader
            title="Current Step"
            subtitle={model.currentStep
              ? `Step ${model.currentStep.position} of ${model.currentStep.total}`
              : 'No active step'}
            icon="navigate-circle-outline"
          />
          <ECSPanel variant="primary">
            {model.currentStep ? (
              <>
                <View style={styles.rowBetween}>
                  <ECSText variant="cardTitle" style={styles.flexText}>{model.currentStep.title}</ECSText>
                  <ECSBadge
                    label={model.currentStep.type.replace(/_/g, ' ')}
                    tone="category"
                    compact
                  />
                </View>
                <ECSText variant="body" style={styles.bodyCopy}>{model.currentStep.instructions}</ECSText>
                {model.currentStep.skippable ? (
                  <ECSHelperText>Skipping requires an explicit recorded reason.</ECSHelperText>
                ) : null}
              </>
            ) : (
              <ECSText variant="body" style={styles.bodyCopy}>
                No executable step is available. Review completion or blocking details.
              </ECSText>
            )}
          </ECSPanel>
        </ECSSection>

        <ECSSection style={styles.sectionPanel}>
          <ECSSectionHeader title="Required Data" icon="list-outline" />
          <ECSPanel variant="secondary">
            {model.requiredData.length > 0 ? model.requiredData.map((item, index) => (
              <View
                key={item.key}
                style={[styles.dataRow, index < model.requiredData.length - 1 ? styles.divider : null]}
                accessible
                accessibilityLabel={`${item.label}. ${item.required ? 'Required' : 'Optional'}. ${item.stateLabel}. ${item.description}`}
              >
                <View style={styles.dataCopy}>
                  <View style={styles.inlineTitle}>
                    <ECSStatLabel>{item.label}</ECSStatLabel>
                    <ECSHelperText>{item.required ? 'Required' : 'Optional'}</ECSHelperText>
                  </View>
                  <ECSHelperText>{item.description}</ECSHelperText>
                  {item.sourceTruth.length > 0 ? (
                    <View style={styles.badgeRow}>
                      <ECSSourceBadge sources={item.sourceTruth} policyKey={item.sourceTruth[0]?.policyKey} now={now} />
                      <ECSFreshnessBadge sources={item.sourceTruth} policyKey={item.sourceTruth[0]?.policyKey} now={now} />
                    </View>
                  ) : null}
                </View>
                <ECSBadge label={item.stateLabel} tone={item.tone} compact />
              </View>
            )) : (
              <ECSText variant="body" style={styles.bodyCopy}>This framework definition declares no data inputs.</ECSText>
            )}
          </ECSPanel>
        </ECSSection>

        <ECSSection style={styles.sectionPanel}>
          <ECSSectionHeader title="Recommended Action" icon="compass-outline" />
          <ECSPanel variant="secondary">
            <ECSText variant="body" style={styles.bodyCopy}>{model.recommendedAction}</ECSText>
            {model.secondaryActions.length > 0 ? (
              <View style={styles.actionRow}>
                {model.secondaryActions.map((action) => (
                  <ECSButton
                    key={action.intent.kind}
                    label={action.label}
                    icon={action.icon}
                    variant={action.intent.kind === 'cancel' ? 'destructive' : 'secondary'}
                    size="compact"
                    onPress={() => requestAction(action)}
                  />
                ))}
              </View>
            ) : null}
          </ECSPanel>
        </ECSSection>

        {model.commandProposals.length > 0 ? (
          <ECSSection style={styles.sectionPanel}>
            <ECSSectionHeader title="Command Proposals" icon="document-text-outline" />
            <ECSPanel variant="warning">
              {model.commandProposals.map((proposal, index) => (
                <View
                  key={proposal.id}
                  style={[styles.proposalRow, index < model.commandProposals.length - 1 ? styles.divider : null]}
                >
                  <View style={styles.dataCopy}>
                    <ECSStatValue>{proposal.title}</ECSStatValue>
                    <ECSHelperText>{proposal.typeLabel}</ECSHelperText>
                  </View>
                  <ECSBadge label={proposal.statusLabel} tone={proposal.tone} compact />
                </View>
              ))}
              <ECSText variant="helper" style={styles.safetyCopy}>
                A confirmed proposal is still not a sent command. Command creation and transmission require separate explicit action.
              </ECSText>
            </ECSPanel>
          </ECSSection>
        ) : null}

        <ECSSection style={styles.sectionPanel}>
          <ECSSectionHeader title="Source Truth" icon="shield-checkmark-outline" />
          <ECSPanel variant="secondary">
            {model.sourceTruth.length > 0 ? (
              <View style={styles.sourceRow}>
                <ECSSourceBadge sources={model.sourceTruth} policyKey={model.sourceTruth[0]?.policyKey} now={now} />
                <ECSFreshnessBadge sources={model.sourceTruth} policyKey={model.sourceTruth[0]?.policyKey} now={now} />
                <SourceTruthInspectorTrigger
                  sources={model.sourceTruth}
                  policyKey={model.sourceTruth[0]?.policyKey}
                  now={now}
                  dependencies={['Operational Playbook input snapshot', 'Recorded decisions and command proposals']}
                  label="Source details"
                  testID="dispatch-operational-playbook-source-details"
                />
              </View>
            ) : (
              <ECSText variant="body" style={styles.bodyCopy}>
                Source information is unavailable. This playbook is not treated as verified.
              </ECSText>
            )}
          </ECSPanel>
        </ECSSection>

        <ECSSection style={styles.sectionPanel}>
          <ECSSectionHeader title="Timeline" subtitle={`${model.timeline.length} retained events shown`} icon="time-outline" />
          <ECSPanel variant="quiet">
            {model.timeline.length > 0 ? model.timeline.map((event, index) => (
              <View key={event.id} style={[styles.timelineRow, index < model.timeline.length - 1 ? styles.divider : null]}>
                <View style={styles.timelineCopy}>
                  <ECSText variant="body" style={styles.bodyCopy}>{event.summary}</ECSText>
                  <ECSHelperText>{formatTimestamp(event.occurredAt)}</ECSHelperText>
                </View>
                <ECSBadge label={event.stateLabel} tone="info" compact />
              </View>
            )) : (
              <ECSText variant="body" style={styles.bodyCopy}>No playbook events have been recorded.</ECSText>
            )}
          </ECSPanel>
        </ECSSection>

        <ECSPanel variant="warning" style={styles.safetyPanel}>
          <ECSText variant="body" style={styles.safetyCopy}>{model.safetyCopy}</ECSText>
        </ECSPanel>
      </View>
    </ECSModalShell>
  );
}

function formatTimestamp(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Time unavailable';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: ECS_SURFACE.gap.section,
  },
  root: {
    gap: ECS_SURFACE.gap.section,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ECS_SURFACE.gap.row,
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
    gap: ECS_SURFACE.gap.group,
  },
  bodyCopy: {
    color: TACTICAL.text,
    lineHeight: 19,
  },
  progressTrack: {
    height: 7,
    overflow: 'hidden',
    borderRadius: 4,
    backgroundColor: ECS_SURFACE.background.quiet,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ECS_SURFACE.border.quiet,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: TACTICAL.amber,
  },
  sectionPanel: {
    marginBottom: 0,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ECS_SURFACE.gap.row,
  },
  flexText: {
    flex: 1,
    minWidth: 0,
  },
  dataRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: ECS_SURFACE.gap.row,
    paddingVertical: ECS_SURFACE.gap.group,
  },
  dataCopy: {
    flex: 1,
    minWidth: 0,
    gap: 5,
  },
  inlineTitle: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: ECS_SURFACE.gap.group,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ECS_SURFACE.gap.group,
  },
  divider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  actionRow: {
    marginTop: ECS_SURFACE.gap.group,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ECS_SURFACE.gap.group,
  },
  proposalRow: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.row,
    paddingVertical: ECS_SURFACE.gap.group,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.group,
  },
  timelineRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.row,
    paddingVertical: ECS_SURFACE.gap.group,
  },
  timelineCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  safetyPanel: {
    borderColor: ECS.warning,
  },
  safetyCopy: {
    color: TACTICAL.textMuted,
    lineHeight: 18,
  },
});
