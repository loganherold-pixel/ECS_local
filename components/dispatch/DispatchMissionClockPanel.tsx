import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ECSButton } from '../ECSButton';
import ECSModalShell, { ECSOverlayFooter } from '../ECSModalShell';
import { ECSBadge } from '../ECSStatus';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  ECSFreshnessBadge,
  ECSSourceBadge,
} from '../source-truth/SourceTruthIndicators';
import { SourceTruthInspectorTrigger } from '../source-truth/SourceTruthInspector';
import {
  formatMissionClockCountdown,
  formatMissionClockSource,
  formatMissionClockStatus,
  type MissionClockDeadline,
  type MissionClockDeadlineStatus,
  type MissionClockSnapshot,
} from '../../lib/dispatchMissionClock';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { TACTICAL } from '../../lib/theme';

const COMPACT_DEADLINE_LIMIT = 6;

export function MissionClockHeaderMetric({
  snapshot,
}: {
  snapshot: MissionClockSnapshot;
}) {
  const next = snapshot.next;
  const clock = formatMissionClockCountdown(next);
  const hasAttention = next?.status === 'overdue' || next?.status === 'due';
  return (
    <View
      style={[styles.summaryMetric, styles.clockMetric]}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={next
        ? `Next Mission Clock deadline. ${formatMissionClockStatus(next.status)}. ${clock}. ${next.title}.`
        : 'Mission Clock. No active deadlines.'}
    >
      <Text style={styles.summaryMetricLabel}>Mission Clock</Text>
      <Text
        style={[styles.clockValue, hasAttention ? styles.clockValueAttention : null]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {clock}
      </Text>
      {next ? <Text style={styles.clockCommand} numberOfLines={1}>{next.title}</Text> : null}
    </View>
  );
}

export function DispatchMissionClockPanel({
  snapshot,
  onOpenCommand,
  testID = 'dispatch-mission-clock',
}: {
  snapshot: MissionClockSnapshot;
  onOpenCommand?: (commandId: string) => void;
  testID?: string;
}) {
  const [selectedDeadlineId, setSelectedDeadlineId] = useState<string | null>(null);
  const visibleDeadlines = useMemo(
    () => snapshot.active.slice(0, COMPACT_DEADLINE_LIMIT),
    [snapshot.active],
  );
  const selectedDeadline = snapshot.deadlines.find((deadline) => deadline.id === selectedDeadlineId) ?? null;

  useEffect(() => {
    if (selectedDeadlineId && !selectedDeadline) setSelectedDeadlineId(null);
  }, [selectedDeadline, selectedDeadlineId]);

  return (
    <>
      <View
        style={styles.panel}
        testID={testID}
        accessibilityRole="summary"
        accessibilityLabel={missionClockSummaryLabel(snapshot)}
      >
        <View style={styles.panelHeader}>
          <View style={styles.panelHeading}>
            <Ionicons name="time-outline" size={15} color={TACTICAL.amber} />
            <View style={styles.panelHeadingCopy}>
              <Text style={styles.panelTitle}>MISSION CLOCK</Text>
              <Text style={styles.panelSubtitle}>Operational deadlines from absolute timestamps</Text>
            </View>
          </View>
          <View style={styles.panelBadges}>
            {snapshot.overdue.length > 0 ? (
              <ECSBadge label={`${snapshot.overdue.length} overdue`} tone="unavailable" compact />
            ) : null}
            {snapshot.dueSoon.length > 0 ? (
              <ECSBadge label={`${snapshot.dueSoon.length} due soon`} tone="warning" compact />
            ) : null}
          </View>
        </View>

        {visibleDeadlines.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No active deadlines</Text>
            <Text style={styles.emptyDetail}>
              {snapshot.unavailable.length > 0
                ? `${snapshot.unavailable.length} deadline source ${snapshot.unavailable.length === 1 ? 'is' : 'are'} unavailable and not treated as clear.`
                : 'Mission Clock will remain offline-ready and recalculate when an absolute deadline is added.'}
            </Text>
          </View>
        ) : (
          <View style={styles.deadlineList}>
            {visibleDeadlines.map((deadline) => (
              <MissionClockDeadlineRow
                key={deadline.id}
                deadline={deadline}
                onPress={() => setSelectedDeadlineId(deadline.id)}
              />
            ))}
            {snapshot.active.length > visibleDeadlines.length ? (
              <Text style={styles.moreLabel}>
                {snapshot.active.length - visibleDeadlines.length} additional deadlines remain in chronological order.
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <MissionClockDetailSheet
        deadline={selectedDeadline}
        nowMs={snapshot.nowMs}
        onClose={() => setSelectedDeadlineId(null)}
        onOpenCommand={onOpenCommand}
      />
    </>
  );
}

function MissionClockDeadlineRow({
  deadline,
  onPress,
}: {
  deadline: MissionClockDeadline;
  onPress: () => void;
}) {
  const statusLabel = formatMissionClockStatus(deadline.status);
  return (
    <TouchableOpacity
      style={[
        styles.deadlineRow,
        deadline.status === 'overdue' || deadline.status === 'due'
          ? styles.deadlineRowAttention
          : null,
      ]}
      activeOpacity={0.78}
      accessibilityRole="button"
      accessibilityLabel={`${statusLabel}. ${deadline.title}. ${formatMissionClockCountdown(deadline)}. ${deadline.reason}`}
      accessibilityHint="Opens Mission Clock deadline details."
      onPress={onPress}
    >
      <View style={styles.deadlineTimeBlock}>
        <Text style={[styles.deadlineClock, deadline.status === 'overdue' ? styles.deadlineClockDanger : null]}>
          {formatMissionClockCountdown(deadline)}
        </Text>
        <Text style={styles.deadlineAbsolute}>{formatTimestamp(deadline.dueAt)}</Text>
      </View>
      <View style={styles.deadlineCopy}>
        <Text style={styles.deadlineTitle} numberOfLines={1}>{deadline.title}</Text>
        <Text style={styles.deadlineReason} numberOfLines={2}>{deadline.reason}</Text>
        <Text style={styles.deadlineSource} numberOfLines={1}>{formatMissionClockSource(deadline.source)}</Text>
      </View>
      <ECSBadge label={statusLabel} tone={statusTone(deadline.status)} compact />
      <Ionicons name="chevron-forward-outline" size={14} color={TACTICAL.textMuted} />
    </TouchableOpacity>
  );
}

function MissionClockDetailSheet({
  deadline,
  nowMs,
  onClose,
  onOpenCommand,
}: {
  deadline: MissionClockDeadline | null;
  nowMs: number;
  onClose: () => void;
  onOpenCommand?: (commandId: string) => void;
}) {
  if (!deadline) return null;
  const canOpenCommand = Boolean(deadline.linkedCommandId && onOpenCommand);
  const policyKey = deadline.sourceTruth[0]?.policyKey;
  const openCommand = () => {
    if (!deadline.linkedCommandId || !onOpenCommand) return;
    onClose();
    onOpenCommand(deadline.linkedCommandId);
  };

  return (
    <ECSModalShell
      visible
      onClose={onClose}
      title={deadline.title}
      subtitle={`${formatMissionClockSource(deadline.source)} / ${formatMissionClockStatus(deadline.status)}`}
      eyebrow="MISSION CLOCK DETAIL"
      icon="time-outline"
      overlayClass="info"
      stackBehavior="allow-stack"
      maxWidth={760}
      maxHeightFraction={0.82}
      scrollable
      dismissOnBackdrop
      allowSwipeDismiss
      contentContainerStyle={styles.detailContent}
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
          {canOpenCommand ? (
            <ECSButton
              label="Open Command"
              icon="open-outline"
              variant="primary"
              size="medium"
              grow
              onPress={openCommand}
            />
          ) : null}
        </ECSOverlayFooter>
      )}
    >
      <View style={styles.detailRoot} accessibilityViewIsModal>
        <View style={styles.detailBadges}>
          <ECSBadge
            label={formatMissionClockStatus(deadline.status)}
            tone={statusTone(deadline.status)}
            compact
          />
          <ECSBadge label={`${formatPriority(deadline.priority)} priority`} tone={priorityTone(deadline.priority)} compact />
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>Deadline</Text>
          <DetailRow label="Due" value={formatTimestamp(deadline.dueAt)} />
          <DetailRow label="Clock" value={formatMissionClockCountdown(deadline)} />
          <DetailRow label="Source" value={formatMissionClockSource(deadline.source)} />
          <Text style={styles.detailReason}>{deadline.reason}</Text>
        </View>

        {deadline.linkedContext ? (
          <View style={styles.detailSection}>
            <Text style={styles.detailSectionTitle}>Linked Context</Text>
            <DetailRow label="Type" value={deadline.linkedContext.type.replace(/_/g, ' ')} />
            <DetailRow
              label="Context"
              value={deadline.linkedContext.restricted ? 'Restricted context' : deadline.linkedContext.label}
            />
          </View>
        ) : null}

        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>Source Truth</Text>
          {deadline.sourceTruth.length > 0 ? (
            <View style={styles.sourceRow}>
              <ECSSourceBadge sources={deadline.sourceTruth} policyKey={policyKey} now={nowMs} />
              <ECSFreshnessBadge sources={deadline.sourceTruth} policyKey={policyKey} now={nowMs} />
              <SourceTruthInspectorTrigger
                sources={deadline.sourceTruth}
                policyKey={policyKey}
                now={nowMs}
                dependencies={['Mission Clock deadline', 'Linked Mission Command state']}
                label="Source details"
                testID="dispatch-mission-clock-source-details"
              />
            </View>
          ) : (
            <Text style={styles.unavailableCopy}>Source information is unavailable. This deadline is not treated as verified.</Text>
          )}
        </View>

        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>Next Action</Text>
          <Text style={styles.detailReason}>
            {deadline.suggestedAction?.label ?? 'Open the linked operational context and decide the next explicit action.'}
          </Text>
          <Text style={styles.safetyCopy}>
            Mission Clock provides time context only. It does not send commands, escalate incidents, reroute, or contact anyone.
          </Text>
        </View>
      </View>
    </ECSModalShell>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailRowLabel}>{label}</Text>
      <Text style={styles.detailRowValue}>{value}</Text>
    </View>
  );
}

function missionClockSummaryLabel(snapshot: MissionClockSnapshot): string {
  const parts = [
    'Mission Clock',
    `${snapshot.active.length} active deadlines`,
    `${snapshot.overdue.length} overdue`,
    `${snapshot.dueSoon.length} due soon`,
  ];
  if (snapshot.next) parts.push(`Next: ${snapshot.next.title}, ${formatMissionClockCountdown(snapshot.next)}`);
  return parts.join('. ');
}

function statusTone(status: MissionClockDeadlineStatus): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (status === 'overdue' || status === 'cancelled' || status === 'unavailable') return 'unavailable';
  if (status === 'due' || status === 'due_soon') return 'warning';
  if (status === 'completed') return 'ready';
  return 'info';
}

function priorityTone(priority: MissionClockDeadline['priority']): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (priority === 'critical') return 'unavailable';
  if (priority === 'high') return 'warning';
  if (priority === 'low') return 'category';
  return 'info';
}

function formatPriority(priority: MissionClockDeadline['priority']): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Unavailable';
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return 'Unavailable';
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  summaryMetric: {
    minHeight: 48,
    flexGrow: 1,
    flexBasis: 78,
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 6,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  clockMetric: {
    flexBasis: 132,
  },
  summaryMetricLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  clockValue: {
    marginTop: 2,
    color: TACTICAL.amber,
    fontSize: 13,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  clockValueAttention: {
    color: TACTICAL.danger,
  },
  clockCommand: {
    marginTop: 1,
    color: TACTICAL.textMuted,
    fontSize: 8,
  },
  panel: {
    gap: 7,
    padding: 9,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.quiet,
  },
  panelHeader: {
    minHeight: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  panelHeading: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  panelHeadingCopy: {
    flex: 1,
    minWidth: 0,
  },
  panelTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  panelSubtitle: {
    marginTop: 1,
    color: TACTICAL.textMuted,
    fontSize: 8,
  },
  panelBadges: {
    maxWidth: '48%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 4,
  },
  deadlineList: {
    gap: 5,
  },
  deadlineRow: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 6,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  deadlineRowAttention: {
    borderLeftWidth: 3,
    borderLeftColor: TACTICAL.danger,
  },
  deadlineTimeBlock: {
    width: 90,
    minWidth: 76,
  },
  deadlineClock: {
    color: TACTICAL.amber,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  deadlineClockDanger: {
    color: TACTICAL.danger,
  },
  deadlineAbsolute: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 7,
    lineHeight: 10,
  },
  deadlineCopy: {
    flex: 1,
    minWidth: 0,
  },
  deadlineTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 13,
    fontWeight: '900',
  },
  deadlineReason: {
    marginTop: 1,
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 11,
  },
  deadlineSource: {
    marginTop: 2,
    color: TACTICAL.amber,
    fontSize: 7,
    fontWeight: '800',
  },
  moreLabel: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    textAlign: 'right',
  },
  emptyState: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: ECS_SURFACE.border.quiet,
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  emptyDetail: {
    marginTop: 2,
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 12,
  },
  detailContent: {
    paddingBottom: 12,
  },
  detailRoot: {
    gap: 10,
  },
  detailBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  detailSection: {
    gap: 7,
    padding: 10,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.quiet,
    borderRadius: 8,
    backgroundColor: ECS_SURFACE.background.compact,
  },
  detailSectionTitle: {
    color: TACTICAL.text,
    fontSize: 11,
    fontWeight: '900',
  },
  detailRow: {
    minHeight: 25,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailRowLabel: {
    flexBasis: '34%',
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '800',
  },
  detailRowValue: {
    flex: 1,
    color: TACTICAL.text,
    fontSize: 10,
    lineHeight: 14,
    textAlign: 'right',
  },
  detailReason: {
    color: TACTICAL.text,
    fontSize: 11,
    lineHeight: 16,
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  unavailableCopy: {
    color: TACTICAL.danger,
    fontSize: 10,
    lineHeight: 14,
  },
  safetyCopy: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontStyle: 'italic',
  },
});
