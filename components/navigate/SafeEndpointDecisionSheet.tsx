import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

import { ECSButton } from '../ECSButton';
import { ECSSegmentedControl } from '../ECSChip';
import { ECSNumberInput, ECSToggleRow } from '../ECSForm';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import { ECSListRow, ECSPanel, ECSSectionHeader } from '../ECSSurface';
import { ECSHelperText, ECSStatLabel, ECSStatValue, ECSText } from '../ECSText';
import { SourceTruthInspectorTrigger } from '../source-truth';
import {
  buildCampOpsSafeEndpointDecisionViewModel,
  type CampOpsSafeEndpointDecisionContextInput,
  type CampOpsSafeEndpointOptionViewModel,
} from '../../lib/campops/campOpsSafeEndpointDecisionMode';
import type { CampOpsSafeEndPointDelayPreset } from '../../lib/campops/campOpsSafeEndpoint';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { ECS, TACTICAL } from '../../lib/theme';
import MissionCommandProposalAction from '../mission-command/MissionCommandProposalAction';
import { createCampOpsMissionCommandProposal } from '../../lib/dispatchMissionCommandSourceAdapters';

type DelayControlKey = CampOpsSafeEndPointDelayPreset | 'custom';

export type SafeEndpointDecisionSheetProps = {
  visible: boolean;
  decisionContext: CampOpsSafeEndpointDecisionContextInput;
  onClose: () => void;
  onReturnToActivePlan: () => void;
  onPreviewEndpoint: (endpoint: CampOpsSafeEndpointOptionViewModel) => void | Promise<void>;
  onStageEndpoint: (endpoint: CampOpsSafeEndpointOptionViewModel) => void | Promise<void>;
};

const DELAY_OPTIONS = [
  { key: 'no_delay', label: '0' },
  { key: 'delay_30m', label: '30m' },
  { key: 'delay_1h', label: '1h' },
  { key: 'delay_2h', label: '2h' },
  { key: 'custom', label: 'Custom' },
];

function endpointAccessibilityLabel(endpoint: CampOpsSafeEndpointOptionViewModel, selected: boolean): string {
  return `${endpoint.roleLabel}, ${endpoint.name}, ETA ${endpoint.etaText}, ${endpoint.daylightMarginText}, ${endpoint.confidenceLabel} confidence${selected ? ', selected' : ''}`;
}

function endpointSelectionKey(endpoint: CampOpsSafeEndpointOptionViewModel): string {
  return `${endpoint.role}:${endpoint.candidate.id}`;
}

function EmptyDecisionState({ summary, nextAction }: { summary: string; nextAction: string }) {
  return (
    <ECSPanel variant="warning" style={styles.sectionPanel}>
      <ECSSectionHeader title="Decision Unavailable" icon="warning-outline" />
      <ECSText variant="body" style={styles.summaryText}>{summary}</ECSText>
      <View style={styles.actionLine}>
        <ECSIcon name="arrow-forward-outline" tier="compact" tone="warning" />
        <ECSHelperText style={styles.actionText}>{nextAction}</ECSHelperText>
      </View>
    </ECSPanel>
  );
}

export default function SafeEndpointDecisionSheet({
  visible,
  decisionContext,
  onClose,
  onReturnToActivePlan,
  onPreviewEndpoint,
  onStageEndpoint,
}: SafeEndpointDecisionSheetProps) {
  const [delayKey, setDelayKey] = useState<DelayControlKey>('delay_2h');
  const [customDelayText, setCustomDelayText] = useState('90');
  const [beforeSunset, setBeforeSunset] = useState(true);
  const [evaluatedAt, setEvaluatedAt] = useState(() => new Date().toISOString());
  const [selectedEndpointKey, setSelectedEndpointKey] = useState<string | null>(null);

  useEffect(() => {
    if (visible) setEvaluatedAt(new Date().toISOString());
  }, [visible]);

  const customDelay = Number(customDelayText);
  const customDelayValid = Number.isFinite(customDelay) && customDelay >= 0 && customDelay <= 720;
  const model = useMemo(
    () => {
      const delayScenario = delayKey === 'custom'
        ? { kind: 'custom' as const, minutes: customDelayValid ? Math.round(customDelay) : 0, label: 'Custom delay' }
        : delayKey;
      return buildCampOpsSafeEndpointDecisionViewModel({
        ...decisionContext,
        delayScenario,
        beforeSunset,
        nowIso: evaluatedAt,
      });
    },
    [beforeSunset, customDelay, customDelayValid, decisionContext, delayKey, evaluatedAt],
  );
  const recommendedEndpointKey = model.recommendedEndpoint ? endpointSelectionKey(model.recommendedEndpoint) : null;
  const backupEndpointKey = model.backupEndpoint ? endpointSelectionKey(model.backupEndpoint) : null;
  const emergencyEndpointKey = model.emergencyEndpoint ? endpointSelectionKey(model.emergencyEndpoint) : null;

  useEffect(() => {
    const selectionStillExists = model.endpoints.some((endpoint) => endpointSelectionKey(endpoint) === selectedEndpointKey);
    if (!selectionStillExists) {
      setSelectedEndpointKey(
        recommendedEndpointKey ?? backupEndpointKey ?? emergencyEndpointKey,
      );
    }
  }, [
    backupEndpointKey,
    emergencyEndpointKey,
    model.endpoints,
    recommendedEndpointKey,
    selectedEndpointKey,
  ]);

  const selectedEndpoint = model.endpoints.find((endpoint) => endpointSelectionKey(endpoint) === selectedEndpointKey) ?? null;
  const plannedStatusLabel = model.plannedCampStatus === 'viable'
    ? 'REMAINS VIABLE'
    : model.plannedCampStatus === 'rejected'
      ? 'REJECTED'
      : 'DOWNGRADED';
  const plannedStatusTone = model.plannedCampStatus === 'viable' ? 'ready' : model.plannedCampStatus === 'rejected' ? 'unavailable' : 'warning';

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      onBack={onClose}
      title="End Day Safely"
      subtitle="Where can we safely end the day if delayed?"
      eyebrow="CAMPOPS DECISION MODE"
      icon="shield-checkmark-outline"
      overlayClass="editor"
      stackBehavior="allow-stack"
      maxWidth={760}
      maxHeightFraction={0.92}
      minHeightFraction={0.72}
      scrollable
      dismissOnBackdrop
      allowSwipeDismiss
      showHandle
      contentContainerStyle={styles.content}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Return To Plan"
            icon="return-up-back-outline"
            variant="tertiary"
            size="medium"
            onPress={onReturnToActivePlan}
            accessibilityLabel="Close Safe Endpoint Decision Mode and return to the active plan"
            grow
          />
          <ECSButton
            label="Stage Route"
            icon="navigate-outline"
            variant="primary"
            size="medium"
            onPress={() => {
              if (selectedEndpoint) void onStageEndpoint(selectedEndpoint);
            }}
            disabled={!selectedEndpoint || !model.canStageRoute || !customDelayValid}
            accessibilityLabel={selectedEndpoint ? `Stage a route preview to ${selectedEndpoint.name}` : 'Stage endpoint route unavailable'}
            grow
          />
        </ECSOverlayFooter>
      )}
    >
      <View style={styles.root} accessibilityViewIsModal testID="safe-endpoint-decision-sheet">
        <ECSPanel variant="quiet" style={styles.sectionPanel}>
          <ECSSectionHeader
            title="Delay Scenario"
            subtitle="CampOps recomputes deterministic gates and roles"
            icon="time-outline"
            badge={<ECSBadge label={model.delayLabel.toUpperCase()} tone="category" compact />}
          />
          <ECSSegmentedControl
            options={DELAY_OPTIONS}
            value={delayKey}
            onChange={(key) => setDelayKey(key as DelayControlKey)}
            style={styles.delayControl}
          />
          {delayKey === 'custom' ? (
            <ECSNumberInput
              label="Custom Delay"
              helper="0 to 720 minutes"
              error={customDelayValid ? null : 'Enter a delay from 0 to 720 minutes.'}
              value={customDelayText}
              onChangeText={setCustomDelayText}
              variant="compact"
              trailing={<ECSStatLabel>MIN</ECSStatLabel>}
            />
          ) : null}
          <ECSToggleRow
            label="Arrive Before Sunset"
            helper="Uses calculated or provider-backed daylight only when available."
            value={beforeSunset}
            onValueChange={setBeforeSunset}
            style={styles.sunsetToggle}
          />
        </ECSPanel>

        <ECSPanel
          variant={model.status === 'recommended' ? 'secondary' : model.status === 'loading' ? 'quiet' : 'warning'}
          style={styles.sectionPanel}
        >
          <View style={styles.statusHeader}>
            <View style={styles.statusCopy}>
              <ECSStatLabel>{model.routeLabel}</ECSStatLabel>
              <ECSStatValue style={styles.statusTitle}>{model.statusLabel}</ECSStatValue>
            </View>
            <View style={styles.badgeWrap}>
              <ECSBadge label={model.confidenceLabel.toUpperCase()} tone={model.confidenceLabel === 'High' ? 'ready' : 'warning'} compact />
              <ECSBadge label={beforeSunset ? 'BEFORE SUNSET' : 'ARRIVAL WINDOW'} tone="category" compact />
            </View>
          </View>
          <ECSText variant="body" style={styles.summaryText}>{model.summary}</ECSText>
          <View style={styles.actionLine}>
            <ECSIcon name="arrow-forward-outline" tier="compact" tone={model.statusTone} />
            <ECSHelperText style={styles.actionText}>{model.nextAction}</ECSHelperText>
          </View>
        </ECSPanel>

        {model.endpoints.length > 0 ? (
          <View style={styles.endpointSection}>
            <ECSSectionHeader
              title="Endpoint Roles"
              subtitle="Roles come directly from the CampOps engine"
              icon="trail-sign-outline"
            />
            <View style={styles.endpointList}>
              {model.endpoints.map((endpoint) => {
                const selectionKey = endpointSelectionKey(endpoint);
                const selected = selectionKey === selectedEndpointKey;
                return (
                  <TouchableOpacity
                    key={selectionKey}
                    style={[styles.endpointCard, selected && styles.endpointCardSelected]}
                    onPress={() => setSelectedEndpointKey(selectionKey)}
                    activeOpacity={0.84}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={endpointAccessibilityLabel(endpoint, selected)}
                  >
                    <View style={styles.endpointHeader}>
                      <View style={styles.endpointTitleCopy}>
                        <ECSStatLabel>{endpoint.roleLabel}</ECSStatLabel>
                        <ECSStatValue style={styles.endpointName} numberOfLines={2}>{endpoint.name}</ECSStatValue>
                      </View>
                      <ECSBadge label={endpoint.statusLabel} tone={endpoint.tone} compact />
                    </View>
                    <View style={styles.endpointMetrics}>
                      <View style={styles.endpointMetric}>
                        <ECSStatLabel>ETA</ECSStatLabel>
                        <ECSHelperText>{endpoint.etaText}</ECSHelperText>
                      </View>
                      <View style={styles.endpointMetric}>
                        <ECSStatLabel>DAYLIGHT</ECSStatLabel>
                        <ECSHelperText>{endpoint.daylightMarginText}</ECSHelperText>
                      </View>
                      <View style={styles.endpointMetric}>
                        <ECSStatLabel>DATA</ECSStatLabel>
                        <ECSHelperText>{endpoint.confidenceLabel}</ECSHelperText>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ) : (
          <EmptyDecisionState summary={model.summary} nextAction={model.nextAction} />
        )}

        {model.plannedCampStatus !== 'not_linked' ? (
          <ECSPanel variant={model.plannedCampStatus === 'viable' ? 'quiet' : 'warning'} style={styles.sectionPanel}>
            <ECSSectionHeader
              title="Planned Endpoint"
              icon="flag-outline"
              badge={<ECSBadge label={plannedStatusLabel} tone={plannedStatusTone} compact />}
            />
            <ECSText variant="body" style={styles.summaryText}>
              {model.plannedCampStatus === 'viable'
                ? 'The linked planned endpoint remains the recommended CampOps role for this delay scenario.'
                : model.plannedCampDowngradeReason ?? 'The linked planned endpoint no longer holds the recommended role.'}
            </ECSText>
            {model.plannedCampGateResults.map((gate) => (
              <View key={gate} style={styles.warningLine}>
                <ECSIcon name="close-circle-outline" tier="compact" tone="unavailable" />
                <ECSHelperText style={styles.warningText}>{gate}</ECSHelperText>
              </View>
            ))}
          </ECSPanel>
        ) : null}

        {selectedEndpoint ? (
          <ECSPanel variant="secondary" style={styles.sectionPanel}>
            <ECSSectionHeader
              title={selectedEndpoint.roleLabel}
              subtitle="Hard gates, margins, and source truth"
              icon="analytics-outline"
              action={(
                <SourceTruthInspectorTrigger
                  source={selectedEndpoint.sourceTruth}
                  policyKey={selectedEndpoint.sourceTruthPolicyKey}
                  dependencies={selectedEndpoint.sourceDependencies}
                  label="SOURCE DETAILS"
                  compact
                  testID="safe-endpoint-source-truth-trigger"
                />
              )}
            />
            <View style={styles.riskList}>
              {selectedEndpoint.risks.map((risk, index) => (
                <ECSListRow
                  key={risk.id}
                  label={risk.label}
                  noDivider={index === selectedEndpoint.risks.length - 1 && selectedEndpoint.hardGateResults.length === 0}
                >
                  <View style={styles.rowValue}>
                    <ECSStatValue>{risk.value}</ECSStatValue>
                    {risk.detail ? <ECSHelperText style={styles.rowDetail}>{risk.detail}</ECSHelperText> : null}
                  </View>
                </ECSListRow>
              ))}
            </View>
            <View style={styles.gateBlock}>
              <ECSStatLabel>KEY HARD-GATE RESULT</ECSStatLabel>
              {selectedEndpoint.hardGateResults.map((gate) => (
                <View key={gate} style={styles.gateLine}>
                  <ECSIcon name="shield-outline" tier="compact" tone="info" />
                  <ECSHelperText style={styles.gateText}>{gate}</ECSHelperText>
                </View>
              ))}
            </View>
            <ECSButton
              label="Preview On Map"
              icon="map-outline"
              variant="secondary"
              size="compact"
              onPress={() => void onPreviewEndpoint(selectedEndpoint)}
              accessibilityLabel={`Preview ${selectedEndpoint.name} on the map without changing the active plan`}
              style={styles.mapPreviewButton}
            />
            <MissionCommandProposalAction
              label="Coordinate Camp Decision"
              accessibilityLabel={`Coordinate the CampOps decision for ${selectedEndpoint.name} in Mission Command`}
              buildProposal={() => createCampOpsMissionCommandProposal({
                sourceEntityId: selectedEndpoint.candidate.id,
                expeditionId: decisionContext.tripId,
                decision: model.plannedCampStatus === 'downgraded' || model.plannedCampStatus === 'rejected'
                  ? 'camp_diversion_deadline'
                  : selectedEndpoint.role === 'backup'
                    ? 'backup_endpoint_review'
                    : 'camp_decision',
                authority: 'campops',
                title: `Coordinate ${selectedEndpoint.roleLabel.toLowerCase()}`,
                summary: model.summary,
                sourceTruth: [selectedEndpoint.sourceTruth],
                linkedContext: {
                  id: selectedEndpoint.candidate.id,
                  type: 'camp',
                  title: selectedEndpoint.name,
                  subtitle: `${selectedEndpoint.roleLabel} / ${selectedEndpoint.statusLabel}`,
                  coordinates: selectedEndpoint.candidate.location,
                  sourceTruth: selectedEndpoint.sourceTruth,
                  sourceTruthPolicyKey: selectedEndpoint.sourceTruthPolicyKey,
                  observedAt: selectedEndpoint.sourceTruth.observedAt ?? undefined,
                  stale: selectedEndpoint.sourceTruth.warningCodes?.some((code) => code.includes('stale')) ?? false,
                  metadata: {
                    campOpsRole: selectedEndpoint.role,
                    routeId: decisionContext.routeId ?? null,
                  },
                },
                action: 'create_command',
                command: {
                  type: 'route',
                  priority: model.plannedCampStatus === 'rejected' ? 'high' : 'normal',
                  title: `Review camp endpoint: ${selectedEndpoint.name}`,
                  instructions: model.nextAction,
                },
                facts: [
                  { key: 'endpoint_role', label: 'Endpoint role', value: selectedEndpoint.roleLabel },
                  { key: 'decision_deadline', label: 'Decision deadline', value: model.decisionPoint.deadlineText },
                  { key: 'campops_status', label: 'CampOps status', value: model.statusLabel },
                ],
                operatorRequested: true,
                offline: decisionContext.connectivityStatus === 'offline',
                returnRoute: '/navigate',
              })}
              grow
            />
          </ECSPanel>
        ) : null}

        <ECSPanel variant={model.decisionPoint.available ? 'secondary' : 'quiet'} style={styles.sectionPanel}>
          <ECSSectionHeader
            title="Continue Or Divert"
            subtitle={model.decisionPoint.available ? model.decisionPoint.title : 'Route detail is insufficient'}
            icon="git-branch-outline"
            badge={<ECSBadge label={model.decisionPoint.deadlineText.toUpperCase()} tone={model.decisionPoint.available ? 'warning' : 'info'} compact />}
          />
          <ECSText variant="body" style={styles.summaryText}>{model.decisionPoint.reason}</ECSText>
          {model.decisionPoint.available ? (
            <View style={styles.decisionRows}>
              <ECSListRow label="Continue" value={model.decisionPoint.continueLabel ?? 'Unknown'} />
              <ECSListRow label="Divert" value={model.decisionPoint.divertLabel ?? 'Unknown'} />
              <ECSListRow label="Latest Turnoff" value={model.decisionPoint.latestTurnoffText ?? 'Unknown'} />
              <ECSListRow label="Continue Risk" value={model.decisionPoint.continueRisk ?? 'Unknown'} noDivider />
            </View>
          ) : null}
        </ECSPanel>

        <ECSPanel variant="quiet" style={styles.sectionPanel}>
          <ECSSectionHeader
            title="Inputs Used"
            subtitle="Origin and freshness remain separate"
            icon="layers-outline"
          />
          <View style={styles.truthList}>
            {model.inputTruth.map((truth, index) => (
              <ECSListRow key={truth.id} label={truth.label} noDivider={index === model.inputTruth.length - 1}>
                <View style={styles.truthValue}>
                  <ECSBadge label={truth.stateLabel} tone={truth.tone} compact />
                  <ECSHelperText style={styles.truthDetail}>{truth.detail}</ECSHelperText>
                </View>
              </ECSListRow>
            ))}
          </View>
        </ECSPanel>

        {model.keyRisks.length > 0 || model.warnings.length > 0 ? (
          <ECSPanel variant="warning" style={styles.sectionPanel}>
            <ECSSectionHeader title="What To Watch" icon="warning-outline" />
            {Array.from(new Set([...model.keyRisks, ...model.warnings])).slice(0, 6).map((warning) => (
              <View key={warning} style={styles.warningLine}>
                <ECSIcon name="alert-circle-outline" tier="compact" tone="warning" />
                <ECSHelperText style={styles.warningText}>{warning}</ECSHelperText>
              </View>
            ))}
          </ECSPanel>
        ) : null}

        <ECSHelperText style={styles.deterministicNote}>
          CampOps owns endpoint roles, hard gates, scores, confidence, and decision points. This view does not use AI to select or override an endpoint.
        </ECSHelperText>
      </View>
    </ECSModalShell>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: ECS.spacing.sm,
  },
  root: {
    gap: ECS.spacing.md,
  },
  sectionPanel: {
    gap: ECS.spacing.sm,
  },
  delayControl: {
    width: '100%',
  },
  sunsetToggle: {
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
    paddingTop: ECS.spacing.sm,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ECS.spacing.sm,
  },
  statusCopy: {
    flex: 1,
    minWidth: 0,
    gap: ECS.spacing.xs,
  },
  statusTitle: {
    color: TACTICAL.text,
  },
  badgeWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: ECS.spacing.xs,
    maxWidth: '52%',
  },
  summaryText: {
    color: TACTICAL.text,
    lineHeight: 18,
  },
  actionLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS.spacing.sm,
  },
  actionText: {
    flex: 1,
    color: TACTICAL.textMuted,
    lineHeight: 16,
  },
  endpointSection: {
    gap: ECS.spacing.sm,
  },
  endpointList: {
    gap: ECS.spacing.sm,
  },
  endpointCard: {
    minHeight: 76,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    backgroundColor: ECS_SURFACE.background.secondary,
    borderRadius: ECS_SURFACE.radius.secondary,
    padding: ECS_SURFACE.padding.secondary,
    gap: ECS.spacing.sm,
  },
  endpointCardSelected: {
    borderColor: ECS_SURFACE.border.selected,
    backgroundColor: ECS_SURFACE.background.selected,
  },
  endpointHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ECS.spacing.sm,
  },
  endpointTitleCopy: {
    flex: 1,
    minWidth: 0,
    gap: ECS.spacing.xs,
  },
  endpointName: {
    color: TACTICAL.text,
    lineHeight: 18,
  },
  endpointMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ECS.spacing.sm,
  },
  endpointMetric: {
    minWidth: 88,
    flex: 1,
    gap: ECS.spacing.xs,
  },
  riskList: {
    gap: 0,
  },
  rowDetail: {
    color: TACTICAL.textMuted,
    lineHeight: 15,
    textAlign: 'right',
  },
  rowValue: {
    alignItems: 'flex-end',
    gap: ECS.spacing.xs,
    maxWidth: '68%',
  },
  gateBlock: {
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
    paddingTop: ECS.spacing.sm,
    gap: ECS.spacing.xs,
  },
  gateLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS.spacing.sm,
  },
  gateText: {
    flex: 1,
    lineHeight: 15,
  },
  mapPreviewButton: {
    alignSelf: 'stretch',
  },
  decisionRows: {
    gap: 0,
  },
  truthList: {
    gap: 0,
  },
  truthValue: {
    alignItems: 'flex-end',
    gap: ECS.spacing.xs,
    maxWidth: '66%',
  },
  truthDetail: {
    textAlign: 'right',
    color: TACTICAL.textMuted,
    lineHeight: 15,
  },
  warningLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS.spacing.sm,
  },
  warningText: {
    flex: 1,
    lineHeight: 15,
  },
  deterministicNote: {
    color: TACTICAL.textMuted,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: ECS.spacing.sm,
  },
});
