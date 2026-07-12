import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type {
  ConvoyRegroupCandidatePosture,
  ConvoyRegroupPlannerResult,
} from '../../lib/convoy/convoyRegroupPlanner';
import { evaluateSourceTruthRef } from '../../lib/sourceTruth';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { ECS, TACTICAL } from '../../lib/theme';
import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge, ECSIcon } from '../ECSStatus';
import { ECSPanel, ECSSectionHeader } from '../ECSSurface';
import { ECSText } from '../ECSText';
import { SourceTruthInspectorTrigger } from '../source-truth';

export interface ConvoyRegroupPlannerSheetProps {
  visible: boolean;
  result: ConvoyRegroupPlannerResult;
  canPreviewMap: boolean;
  canCreateRallyPing: boolean;
  previewUnavailableReason?: string | null;
  rallyUnavailableReason?: string | null;
  onClose: () => void;
  onPreviewMap: () => void;
  onCreateRallyPing: () => void;
}

function formatDistance(meters: number | null): string {
  if (meters == null || !Number.isFinite(meters)) return 'Unknown';
  const miles = meters / 1609.344;
  return miles < 0.1 ? `${Math.round(meters)} m` : `${miles.toFixed(1)} mi`;
}

function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return 'Unknown';
  const minutes = Math.max(0, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours} hr ${remainder} min` : `${hours} hr`;
}

function formatAge(ageMs: number | null | undefined): string {
  if (ageMs == null || !Number.isFinite(ageMs)) return 'age unknown';
  if (ageMs < 60_000) return 'under 1 min old';
  return `${Math.max(1, Math.round(ageMs / 60_000))} min old`;
}

function exclusionReasonLabel(reason: ConvoyRegroupPlannerResult['excludedMembers'][number]['reason']): string {
  switch (reason) {
    case 'not_current':
    case 'invalid_timestamp':
    case 'future_timestamp':
      return 'STALE / TIME';
    case 'accuracy_missing':
    case 'inaccurate':
      return 'ACCURACY';
    case 'restricted':
      return 'RESTRICTED';
    case 'non_live_origin':
      return 'NOT LIVE';
    default:
      return 'UNAVAILABLE';
  }
}

function formatEtaWindow(result: ConvoyRegroupPlannerResult): string {
  const eta = result.proposal?.candidate.etaWindow;
  if (!eta) return 'Unknown';
  const earliest = Math.max(0, Math.round(eta.earliestSeconds / 60));
  const latest = Math.max(earliest, Math.round(eta.latestSeconds / 60));
  return earliest === latest ? `${earliest} min` : `${earliest}-${latest} min`;
}

function postureTone(
  posture: ConvoyRegroupPlannerResult['posture'],
): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (posture === 'cohesive') return 'ready';
  if (posture === 'watch' || posture === 'dispersed') return 'warning';
  return 'unavailable';
}

function candidateTone(
  posture: ConvoyRegroupCandidatePosture,
): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (posture === 'verified') return 'ready';
  if (posture === 'conditional') return 'warning';
  if (posture === 'unsuitable') return 'unavailable';
  return 'info';
}

function candidatePostureLabel(posture: ConvoyRegroupCandidatePosture): string {
  if (posture === 'verified') return 'VERIFIED CONTEXT';
  if (posture === 'conditional') return 'VERIFY FIRST';
  if (posture === 'unsuitable') return 'NOT PROPOSED';
  return 'UNKNOWN';
}

function statusTitle(result: ConvoyRegroupPlannerResult): string {
  if (result.status === 'proposal') return 'Proposal Ready';
  if (result.status === 'not_needed') return 'Regroup Not Indicated';
  if (result.status === 'restricted') return 'Location Restricted';
  if (result.status === 'disabled') return 'Planner Disabled';
  return 'Proposal Unavailable';
}

function sourceTriggerLabel(result: ConvoyRegroupPlannerResult): string {
  const evaluation = evaluateSourceTruthRef(result.sourceTruth, {
    policyKey: 'convoy_member_location',
    now: result.generatedAt,
  });
  return `${evaluation.ref.origin.toUpperCase()} / ${evaluation.freshness.toUpperCase()}`;
}

function CandidateRow({
  evaluation,
}: {
  evaluation: ConvoyRegroupPlannerResult['candidateEvaluations'][number];
}) {
  return (
    <View style={styles.candidateRow}>
      <View style={styles.rowCopy}>
        <ECSText variant="cardSubtitle" numberOfLines={1}>{evaluation.candidate.title}</ECSText>
        <ECSText variant="helper" numberOfLines={2}>
          {evaluation.reasons[0] ?? 'No additional candidate detail is available.'}
        </ECSText>
      </View>
      <ECSBadge label={candidatePostureLabel(evaluation.posture)} tone={candidateTone(evaluation.posture)} compact />
    </View>
  );
}

export default function ConvoyRegroupPlannerSheet({
  visible,
  result,
  canPreviewMap,
  canCreateRallyPing,
  previewUnavailableReason,
  rallyUnavailableReason,
  onClose,
  onPreviewMap,
  onCreateRallyPing,
}: ConvoyRegroupPlannerSheetProps) {
  const proposal = result.proposal;
  const candidate = proposal?.candidate.candidate ?? null;
  const sourceDependencies = useMemo(() => [
    'Convoy spread posture, excluded-position counts, candidate ranking, ETA range, and proposal confidence.',
    'A Rally ping is created only after the operator opens and submits the existing composer.',
  ], []);

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title="Convoy Regroup"
      subtitle="Deterministic proposal for operator review"
      eyebrow="ECS TEAM COORDINATION"
      icon="people-outline"
      overlayClass="editor"
      stackBehavior="allow-stack"
      maxWidth={720}
      maxHeightFraction={0.9}
      minHeightFraction={0.58}
      scrollable
      dismissOnBackdrop
      allowSwipeDismiss
      showHandle
      contentContainerStyle={styles.content}
      footer={(
        <ECSOverlayFooter>
          <ECSButton
            label="Preview Map"
            icon="map-outline"
            variant="secondary"
            size="medium"
            onPress={onPreviewMap}
            disabled={!proposal || !canPreviewMap}
            grow
          />
          <ECSButton
            label="Create Rally Ping"
            icon="radio-outline"
            variant="primary"
            size="medium"
            onPress={onCreateRallyPing}
            disabled={!proposal || !canCreateRallyPing}
            grow
          />
        </ECSOverlayFooter>
      )}
    >
      <View testID="convoy-regroup-planner-sheet" style={styles.root}>
        <ECSPanel variant={result.status === 'proposal' ? 'warning' : 'secondary'} style={styles.summaryPanel}>
          <View style={styles.summaryHeader}>
            <View style={styles.summaryTitleGroup}>
              <ECSIcon
                name={result.status === 'proposal' ? 'git-merge-outline' : 'information-circle-outline'}
                tier="action"
                tone={result.status === 'proposal' ? 'warning' : 'info'}
              />
              <View style={styles.rowCopy}>
                <ECSText variant="cardTitle">{statusTitle(result)}</ECSText>
                <ECSText variant="helper">{result.message}</ECSText>
              </View>
            </View>
            <ECSBadge label={result.posture.toUpperCase()} tone={postureTone(result.posture)} compact />
          </View>

          <View style={styles.metricGrid}>
            <Metric label="Route Spread" value={formatDistance(result.spreadMeters)} />
            <Metric label="Time Spread" value={formatDuration(result.spreadSeconds)} />
            <Metric label="Off Route" value={`${result.offRouteCount}`} caution={result.offRouteCount > 0} />
            <Metric label="Excluded" value={`${result.excludedSummary.total}`} caution={result.excludedSummary.total > 0} />
          </View>
        </ECSPanel>

        {proposal && candidate ? (
          <ECSPanel variant="secondary" style={styles.panel}>
            <ECSSectionHeader
              title="Proposed Regroup Point"
              subtitle="Known ECS context only; no stop or roadside coordinate was invented"
              icon="flag-outline"
              badge={(
                <ECSBadge
                  label={candidatePostureLabel(proposal.candidate.posture)}
                  tone={candidateTone(proposal.candidate.posture)}
                  compact
                />
              )}
            />
            <ECSText variant="cardTitle" numberOfLines={2}>{candidate.title}</ECSText>
            <View style={styles.metricGrid}>
              <Metric label="ETA Range" value={formatEtaWindow(result)} />
              <Metric label="Confidence" value={proposal.confidence.toUpperCase()} caution={proposal.confidence === 'low'} />
              <Metric label="Candidate" value={candidate.type.replace(/_/g, ' ').toUpperCase()} />
              <Metric label="Source" value={candidate.sourceTruth.origin.toUpperCase()} />
            </View>
            {proposal.rationale.map((reason) => (
              <View key={reason} style={styles.reasonRow}>
                <ECSIcon name="chevron-forward-outline" tier="compact" tone="info" />
                <ECSText variant="body" style={styles.reasonCopy}>{reason}</ECSText>
              </View>
            ))}
            <SourceTruthInspectorTrigger
              source={candidate.sourceTruth}
              policyKey={candidate.sourceTruthPolicyKey ?? 'manual_user_state'}
              dependencies={sourceDependencies}
              label={`${candidate.sourceTruth.origin.toUpperCase()} SOURCE`}
              testID="convoy-regroup-candidate-source-trigger"
            />
          </ECSPanel>
        ) : null}

        <ECSPanel variant="quiet" style={styles.panel}>
          <ECSSectionHeader
            title="Position Inputs"
            subtitle="Only fresh, accurate, permission-visible live positions are projected"
            icon="locate-outline"
          />
          {result.includedMembers.length > 0 ? result.includedMembers.map((member) => (
            <View key={member.memberId} style={styles.memberRow}>
              <View style={styles.rowCopy}>
                <ECSText variant="cardSubtitle" numberOfLines={1}>{member.label}</ECSText>
                <ECSText variant="helper">
                  {formatAge(member.ageMs)} / +/- {Math.round(member.accuracyMeters)} m accuracy
                </ECSText>
              </View>
              <ECSBadge label={member.offRoute ? 'OFF ROUTE' : member.role.toUpperCase()} tone={member.offRoute ? 'warning' : 'live'} compact />
            </View>
          )) : (
            <ECSText variant="helper">No eligible member positions are available for projection.</ECSText>
          )}
          {result.excludedMembers.filter((member) => Boolean(member.label)).map((member, index) => (
            <View key={member.memberId ?? `excluded-${member.reason}-${index}`} style={styles.memberRow}>
              <View style={styles.rowCopy}>
                <ECSText variant="cardSubtitle" numberOfLines={1}>{member.label}</ECSText>
                <ECSText variant="helper">
                  {formatAge(member.ageMs)} / {member.accuracyMeters == null
                    ? 'accuracy unknown'
                    : `+/- ${Math.round(member.accuracyMeters)} m accuracy`}
                </ECSText>
              </View>
              <ECSBadge label={exclusionReasonLabel(member.reason)} tone="warning" compact />
            </View>
          ))}
          {result.excludedSummary.total > 0 ? (
            <View style={styles.exclusionSummary}>
              <ECSText variant="helper">
                Excluded: {result.excludedSummary.staleOrAging} stale/aging, {result.excludedSummary.inaccurateOrUnknown} inaccurate/unknown accuracy, {result.excludedSummary.restricted} restricted, {result.excludedSummary.unavailable} unavailable.
              </ECSText>
            </View>
          ) : null}
        </ECSPanel>

        {result.candidateEvaluations.length > 0 ? (
          <ECSPanel variant="quiet" style={styles.panel}>
            <ECSSectionHeader
              title="Candidate Review"
              subtitle={`${result.candidateEvaluations.length} normalized candidate${result.candidateEvaluations.length === 1 ? '' : 's'} evaluated`}
              icon="list-outline"
            />
            {result.candidateEvaluations.slice(0, 5).map((evaluation) => (
              <CandidateRow key={evaluation.candidate.id} evaluation={evaluation} />
            ))}
          </ECSPanel>
        ) : null}

        <ECSPanel variant="quiet" style={styles.panel}>
          <ECSSectionHeader title="Source State" icon="shield-checkmark-outline" />
          <View style={styles.sourceRow}>
            <SourceTruthInspectorTrigger
              source={result.sourceTruth}
              policyKey="convoy_member_location"
              dependencies={sourceDependencies}
              label={sourceTriggerLabel(result)}
              testID="convoy-regroup-result-source-trigger"
            />
            <ECSBadge label={`${result.confidence.toUpperCase()} CONFIDENCE`} tone={result.confidence === 'high' ? 'ready' : result.confidence === 'medium' ? 'info' : 'warning'} compact />
          </View>
          {result.warnings.length > 0 ? (
            <ECSText variant="helper" numberOfLines={4}>
              {result.warnings.slice(0, 4).map((warning) => warning.replace(/_/g, ' ')).join(' / ')}
            </ECSText>
          ) : null}
        </ECSPanel>

        <ECSPanel variant="warning" style={styles.panel}>
          <ECSText variant="body">
            Preview only. ECS will not message the convoy, replace guidance, reroute a member, escalate an incident, or claim this point is safe or legal. The operator must verify current conditions and explicitly submit any Rally ping.
          </ECSText>
          {!canPreviewMap && previewUnavailableReason ? (
            <ECSText variant="helper" style={styles.disabledCopy}>{previewUnavailableReason}</ECSText>
          ) : null}
          {!canCreateRallyPing && rallyUnavailableReason ? (
            <ECSText variant="helper" style={styles.disabledCopy}>{rallyUnavailableReason}</ECSText>
          ) : null}
        </ECSPanel>
      </View>
    </ECSModalShell>
  );
}

function Metric({
  label,
  value,
  caution = false,
}: {
  label: string;
  value: string;
  caution?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <ECSText variant="statLabel">{label}</ECSText>
      <ECSText variant="statValue" style={caution ? styles.cautionValue : null} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.72}>
        {value}
      </ECSText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: ECS_SURFACE.padding.secondary,
  },
  root: {
    gap: ECS_SURFACE.gap.stack,
  },
  panel: {
    gap: ECS_SURFACE.gap.stack,
  },
  summaryPanel: {
    gap: ECS_SURFACE.gap.stack,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: ECS_SURFACE.gap.row,
  },
  summaryTitleGroup: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS_SURFACE.gap.row,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: ECS_SURFACE.gap.row,
  },
  metric: {
    minWidth: 112,
    flex: 1,
    gap: 3,
  },
  cautionValue: {
    color: TACTICAL.amber,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: ECS_SURFACE.gap.row,
  },
  reasonCopy: {
    flex: 1,
  },
  memberRow: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.row,
    paddingVertical: 5,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  candidateRow: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.row,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ECS_SURFACE.border.quiet,
  },
  exclusionSummary: {
    paddingTop: 4,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: ECS_SURFACE.gap.row,
  },
  disabledCopy: {
    color: ECS.muted,
  },
});
