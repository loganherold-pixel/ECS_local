import React, { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
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
  INCIDENT_ROOM_TIMELINE_LIMIT,
  type IncidentRoomCommandPresentation,
  type IncidentRoomPresentation,
  type IncidentRoomTimelinePresentation,
} from '../../lib/dispatchIncidentRoom';
import { windowMissionCommandTimeline } from '../../lib/dispatchMissionCommandPresentation';
import type { IncidentStatus } from '../../lib/types/incidentRecovery';
import { ECS, TACTICAL } from '../../lib/theme';
import { ECS_SURFACE } from '../../lib/ecsSurfaceTokens';
import { recordECSPerformanceRender } from '../../lib/performance/ecsPerformanceDiagnostics';

export interface DispatchIncidentRoomProps {
  visible: boolean;
  model: IncidentRoomPresentation | null;
  onClose: () => void;
  onCreateCommand?: () => void;
  onOpenCommand?: (commandId: string) => void;
  onOpenContext?: () => void;
  onAssignLead?: () => void;
  onTransitionStatus?: (status: IncidentStatus) => void;
  onOpenResolveDebrief?: () => void;
  testID?: string;
}

const COMMAND_RENDER_LIMIT = 24;
const PEOPLE_RENDER_LIMIT = 24;
const INCIDENT_TIMELINE_PAGE_SIZE = 20;

export default function DispatchIncidentRoom({
  visible,
  model,
  onClose,
  onCreateCommand,
  onOpenCommand,
  onOpenContext,
  onAssignLead,
  onTransitionStatus,
  onOpenResolveDebrief,
  testID = 'dispatch-incident-room',
}: DispatchIncidentRoomProps) {
  recordECSPerformanceRender('dispatch_ready', 'mission_incident_room');
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [timelineVisibleCount, setTimelineVisibleCount] = useState(INCIDENT_TIMELINE_PAGE_SIZE);
  const timelineWindow = useMemo(() => windowMissionCommandTimeline(
    model?.timeline ?? [],
    timelineVisibleCount,
    INCIDENT_ROOM_TIMELINE_LIMIT,
  ), [model?.timeline, timelineVisibleCount]);
  useEffect(() => {
    setTimelineVisibleCount(INCIDENT_TIMELINE_PAGE_SIZE);
  }, [model?.incidentId]);
  const footer = useMemo(() => (
    <ECSOverlayFooter>
      <ECSButton
        label="Close"
        icon="close-outline"
        variant="tertiary"
        size="medium"
        grow
        onPress={onClose}
      />
      {model?.permissions.canCreateCommand && onCreateCommand ? (
        <ECSButton
          label="New Incident Command"
          icon="add-outline"
          variant="secondary"
          size="medium"
          grow
          onPress={onCreateCommand}
          accessibilityHint="Opens the existing Mission Command composer with this incident linked."
        />
      ) : null}
      {model?.permissions.canLead && (model.resolutionAvailable || model.debriefAvailable) && onOpenResolveDebrief ? (
        <ECSButton
          label={model.debriefAvailable ? 'Open Debrief' : 'Resolve / Debrief'}
          icon="checkmark-done-outline"
          variant="primary"
          size="medium"
          grow
          onPress={onOpenResolveDebrief}
        />
      ) : null}
    </ECSOverlayFooter>
  ), [model, onClose, onCreateCommand, onOpenResolveDebrief]);

  return (
    <ECSModalShell
      visible={visible}
      onClose={onClose}
      title={model?.title ?? 'Incident Room'}
      subtitle="Serious-event coordination inside Mission Command"
      eyebrow="MISSION COMMAND / INCIDENT ROOM"
      icon="warning-outline"
      overlayClass="workflow"
      stackBehavior="allow-stack"
      maxWidth={1040}
      maxHeightFraction={0.94}
      minHeightFraction={0.82}
      scrollable
      dismissOnBackdrop
      allowSwipeDismiss
      showHandle
      footer={footer}
      contentContainerStyle={styles.modalContent}
    >
      {!model ? (
        <View style={styles.emptyState} accessibilityRole="alert">
          <Ionicons name="alert-circle-outline" size={24} color={TACTICAL.amber} />
          <Text style={styles.emptyTitle}>Incident unavailable</Text>
          <Text style={styles.emptyDetail}>
            The canonical Incident & Recovery record could not be loaded. No replacement incident was created.
          </Text>
        </View>
      ) : (
        <View testID={testID} style={[styles.root, landscape ? styles.rootLandscape : null]}>
          {!model.permissions.canView ? (
            <View style={styles.restrictedState} accessibilityRole="alert">
              <Ionicons name="lock-closed-outline" size={18} color={TACTICAL.danger} />
              <View style={styles.flexCopy}>
                <Text style={styles.restrictedTitle}>Incident Room restricted</Text>
                <Text style={styles.restrictedDetail}>
                  {model.permissions.deniedReason ?? 'Current Dispatch permissions do not allow this incident workspace.'}
                </Text>
              </View>
            </View>
          ) : (
            <>
              <IncidentSummary model={model} onAssignLead={onAssignLead} />

              <View style={styles.decisionPanel} accessibilityRole="summary">
                <View style={styles.sectionHeadingRow}>
                  <Ionicons name="compass-outline" size={15} color={TACTICAL.amber} />
                  <Text style={styles.decisionEyebrow}>NEXT DECISION</Text>
                </View>
                <Text style={styles.decisionText}>{model.nextDecision}</Text>
                {model.nextDeadline ? (
                  <Text style={styles.decisionMeta}>
                    {formatClockStatus(model.nextDeadline.status)} / {formatTimestamp(model.nextDeadline.dueAt)}
                  </Text>
                ) : (
                  <Text style={styles.decisionMeta}>No active Mission Clock deadline</Text>
                )}
              </View>

              <View style={[styles.twoColumn, landscape ? styles.twoColumnLandscape : null]}>
                <IncidentSection title="People" icon="people-outline" grow>
                  {model.people.length === 0 ? (
                    <EmptySectionText text="Involved people have not been identified." />
                  ) : model.people.slice(0, PEOPLE_RENDER_LIMIT).map((person) => (
                    <View key={person.id} style={styles.personRow}>
                      <View style={styles.personIcon}>
                        <Ionicons name="person-outline" size={14} color={TACTICAL.amber} />
                      </View>
                      <View style={styles.flexCopy}>
                        <Text style={styles.rowTitle}>{person.label}</Text>
                        <Text style={styles.rowMeta}>{person.roleLabel}</Text>
                      </View>
                      <View style={styles.rightMeta}>
                        <ECSBadge
                          label={person.locationLabel}
                          tone={person.locationState === 'live'
                            ? 'live'
                            : person.locationState === 'restricted'
                              ? 'warning'
                              : 'warning'}
                          compact
                        />
                        {person.observedAt ? (
                          <Text style={styles.timestamp}>{formatTimestamp(person.observedAt)}</Text>
                        ) : null}
                      </View>
                    </View>
                  ))}
                </IncidentSection>

                <IncidentSection title="Vehicles And Resources" icon="car-sport-outline" grow>
                  {model.vehicles.length === 0 ? (
                    <EmptySectionText text="Involved vehicle context is unknown." />
                  ) : model.vehicles.map((vehicle) => (
                    <CompactRow
                      key={vehicle.id}
                      title={vehicle.label}
                      detail={vehicle.sourceLabel}
                      icon="car-outline"
                    />
                  ))}
                  <View style={styles.resourceGrid}>
                    {model.resources.map((resource) => (
                      <View key={resource.id} style={styles.resourceCell}>
                        <Text style={styles.resourceLabel}>{resource.label}</Text>
                        <Text style={[
                          styles.resourceValue,
                          resource.state === 'watch' ? styles.watchText : null,
                        ]} numberOfLines={2}>
                          {resource.value}
                        </Text>
                      </View>
                    ))}
                  </View>
                </IncidentSection>
              </View>

              <IncidentSection title="Commands" icon="clipboard-outline">
                <View style={styles.sectionCommandRow}>
                  <Text style={styles.sectionCount}>{model.commands.length} LINKED</Text>
                  {model.permissions.canCreateCommand && onCreateCommand ? (
                    <ECSButton
                      label="New Command"
                      icon="add-outline"
                      variant="secondary"
                      size="compact"
                      onPress={onCreateCommand}
                    />
                  ) : null}
                </View>
                {model.commands.length === 0 ? (
                  <EmptySectionText text="No Mission Commands are linked to this incident." />
                ) : model.commands.slice(0, COMMAND_RENDER_LIMIT).map((command) => (
                  <IncidentCommandRow
                    key={command.id}
                    command={command}
                    onOpen={onOpenCommand ? () => onOpenCommand(command.id) : undefined}
                  />
                ))}
                {model.commands.length > COMMAND_RENDER_LIMIT ? (
                  <Text style={styles.boundNotice}>
                    Showing the newest {COMMAND_RENDER_LIMIT} linked commands. Older commands remain on the Command Board.
                  </Text>
                ) : null}
              </IncidentSection>

              <View style={[styles.twoColumn, landscape ? styles.twoColumnLandscape : null]}>
                <IncidentSection title="Playbook Progress" icon="list-outline" grow>
                  {model.playbooks.length === 0 ? (
                    <EmptySectionText text="No Operational Playbook is linked to this incident." />
                  ) : model.playbooks.map((playbook) => (
                    <CompactRow
                      key={playbook.id}
                      title={playbook.title}
                      detail={`${playbook.stateLabel} / ${playbook.progressLabel}`}
                      icon="list-circle-outline"
                    />
                  ))}
                </IncidentSection>

                <IncidentSection title="Mission Clock" icon="time-outline" grow>
                  {model.deadlines.length === 0 ? (
                    <EmptySectionText text="No active incident command deadlines." />
                  ) : model.deadlines.map((deadline) => (
                    <CompactRow
                      key={deadline.id}
                      title={deadline.title}
                      detail={`${formatClockStatus(deadline.status)} / ${formatTimestamp(deadline.dueAt)}`}
                      icon={deadline.status === 'overdue' ? 'alert-circle-outline' : 'time-outline'}
                      warning={deadline.status === 'overdue' || deadline.status === 'due'}
                    />
                  ))}
                </IncidentSection>
              </View>

              <IncidentSection title="Map And Linked Context" icon="map-outline">
                <View style={styles.contextRow}>
                  <View style={styles.contextIcon}>
                    <Ionicons
                      name={model.location.state === 'restricted' ? 'lock-closed-outline' : 'location-outline'}
                      size={18}
                      color={model.location.state === 'restricted' ? TACTICAL.danger : TACTICAL.amber}
                    />
                  </View>
                  <View style={styles.flexCopy}>
                    <Text style={styles.rowTitle}>{model.location.label}</Text>
                    <Text style={styles.rowMeta}>
                      {model.location.observedAt
                        ? `Observed ${formatTimestamp(model.location.observedAt)}`
                        : 'Observation time unavailable'}
                      {model.location.accuracyMeters != null
                        ? ` / accuracy ${Math.round(model.location.accuracyMeters)} m`
                        : ''}
                    </Text>
                  </View>
                  {model.location.state !== 'restricted' && model.location.state !== 'unavailable' && onOpenContext ? (
                    <ECSButton
                      label="Open in Navigate"
                      icon="navigate-outline"
                      variant="secondary"
                      size="compact"
                      onPress={onOpenContext}
                    />
                  ) : null}
                </View>
                <View style={styles.sourceRow}>
                  <ECSSourceBadge
                    sources={model.sourceTruth}
                    policyKey="condition_closure_advisory"
                  />
                  <ECSFreshnessBadge
                    sources={model.sourceTruth}
                    policyKey="condition_closure_advisory"
                  />
                  <SourceTruthInspectorTrigger
                    sources={model.sourceTruth}
                    policyKey="condition_closure_advisory"
                    dependencies={[
                      'Canonical Incident & Recovery record',
                      'Mission Command linkage',
                      'Current Dispatch permissions',
                    ]}
                    label="Source details"
                    testID="dispatch-incident-room-source-details"
                  />
                </View>
              </IncidentSection>

              <View style={[styles.twoColumn, landscape ? styles.twoColumnLandscape : null]}>
                <IncidentSection title="Communications" icon="radio-outline" grow>
                  {model.communications.length === 0 ? (
                    <EmptySectionText text="No communication attempts are recorded." />
                  ) : model.communications.map((event) => (
                    <TimelineRow key={event.id} event={event} compact />
                  ))}
                  <Text style={styles.safetyCopy}>
                    Incident Room coordinates the ECS team only. It does not contact emergency services or transmit externally.
                  </Text>
                </IncidentSection>

                <IncidentSection title="Lifecycle Actions" icon="git-branch-outline" grow>
                  <Text style={styles.sectionDetail}>
                    Status changes require an explicit leadership action and are recorded by the canonical incident workflow.
                  </Text>
                  <View style={styles.actionWrap}>
                    {model.permissions.canLead && onTransitionStatus
                      ? model.allowedStatusTransitions
                        .filter((status) => status !== 'resolved' && status !== 'closed')
                        .map((status) => (
                          <ECSButton
                            key={status}
                            label={statusActionLabel(status)}
                            icon={status === 'cancelled' ? 'close-circle-outline' : 'arrow-forward-circle-outline'}
                            variant={status === 'cancelled' ? 'destructive' : 'secondary'}
                            size="compact"
                            onPress={() => onTransitionStatus(status)}
                          />
                        ))
                      : null}
                    {model.permissions.canLead && model.closeAvailable && onTransitionStatus ? (
                      <ECSButton
                        label="Close Incident"
                        icon="archive-outline"
                        variant="secondary"
                        size="compact"
                        onPress={() => onTransitionStatus('closed')}
                      />
                    ) : null}
                    {model.permissions.canLead && (model.resolutionAvailable || model.debriefAvailable) && onOpenResolveDebrief ? (
                      <ECSButton
                        label={model.debriefAvailable ? 'Open Debrief' : 'Resolve / Debrief'}
                        icon="checkmark-done-outline"
                        variant="primary"
                        size="compact"
                        onPress={onOpenResolveDebrief}
                      />
                    ) : null}
                  </View>
                  {!model.permissions.canLead ? (
                    <Text style={styles.permissionCopy}>
                      Leadership actions are restricted. Viewing the room does not mutate incident state.
                    </Text>
                  ) : null}
                  <Text style={styles.permissionCopy}>
                    Reopening is unavailable because the canonical Incident & Recovery lifecycle does not support it.
                  </Text>
                </IncidentSection>
              </View>

              <IncidentSection title="Event Timeline" icon="time-outline">
                {model.timeline.length === 0 ? (
                  <EmptySectionText text="No incident events are recorded." />
                ) : timelineWindow.items.map((event) => (
                  <TimelineRow key={event.id} event={event} />
                ))}
                {timelineWindow.hasMore ? (
                  <ECSButton
                    label={`Show More Events (${model.timeline.length - timelineVisibleCount})`}
                    icon="chevron-down-outline"
                    variant="tertiary"
                    size="compact"
                    onPress={() => setTimelineVisibleCount((current) => (
                      Math.min(model.timeline.length, current + INCIDENT_TIMELINE_PAGE_SIZE)
                    ))}
                    accessibilityHint="Adds the next bounded page of incident timeline events."
                  />
                ) : null}
                {model.timelineTruncated ? (
                  <Text style={styles.boundNotice}>
                    Showing the newest bounded event window. Full historical logs remain in their owning systems.
                  </Text>
                ) : null}
              </IncidentSection>
            </>
          )}
        </View>
      )}
    </ECSModalShell>
  );
}

function IncidentSummary({
  model,
  onAssignLead,
}: {
  model: IncidentRoomPresentation;
  onAssignLead?: () => void;
}) {
  return (
    <View
      style={styles.summary}
      accessibilityRole="summary"
      accessibilityLabel={[
        `Incident ${model.title}`,
        `${model.severityLabel} severity`,
        `${model.statusLabel} status`,
        `Command lead ${model.commandLeadLabel}`,
        model.connectivityLabel,
      ].join('. ')}
    >
      <View style={styles.summaryTop}>
        <View style={styles.flexCopy}>
          <Text style={styles.summaryEyebrow}>INCIDENT {model.incidentId.slice(0, 12).toUpperCase()}</Text>
          <Text style={styles.summaryTitle}>{model.title}</Text>
          <Text style={styles.summaryText}>{model.summary}</Text>
        </View>
        <View style={styles.summaryBadges}>
          <ECSBadge label={`${model.severityLabel} severity`} tone={severityTone(model.severityLabel)} compact />
          <ECSBadge label={model.phaseLabel} tone={phaseTone(model.phase)} compact />
          <ECSBadge
            label={model.connectivityLabel}
            tone={model.connectivityLabel.startsWith('Offline') ? 'warning' : 'live'}
            compact
          />
        </View>
      </View>
      <View style={styles.summaryFacts}>
        <View style={styles.summaryFact}>
          <Text style={styles.summaryFactLabel}>STATUS</Text>
          <Text style={styles.summaryFactValue}>{model.statusLabel}</Text>
        </View>
        <View style={styles.summaryFact}>
          <Text style={styles.summaryFactLabel}>COMMAND LEAD</Text>
          <Text style={styles.summaryFactValue}>{model.commandLeadLabel}</Text>
        </View>
        <View style={styles.summaryFact}>
          <Text style={styles.summaryFactLabel}>LAST UPDATE</Text>
          <Text style={styles.summaryFactValue}>{formatTimestamp(model.updatedAt)}</Text>
        </View>
        {model.permissions.canLead && !model.commandLeadMemberId && onAssignLead ? (
          <ECSButton
            label="Take Lead"
            icon="shield-outline"
            variant="secondary"
            size="compact"
            onPress={onAssignLead}
          />
        ) : null}
      </View>
    </View>
  );
}

function IncidentSection({
  title,
  icon,
  grow = false,
  children,
}: {
  title: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  grow?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, grow ? styles.sectionGrow : null]}>
      <View style={styles.sectionHeadingRow}>
        <Ionicons name={icon} size={14} color={TACTICAL.amber} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function IncidentCommandRow({
  command,
  onOpen,
}: {
  command: IncidentRoomCommandPresentation;
  onOpen?: () => void;
}) {
  const content = (
    <>
      <View style={styles.commandTop}>
        <View style={styles.commandBadges}>
          <ECSBadge label={`${command.priorityLabel} priority`} tone={severityTone(command.priorityLabel)} compact />
          <ECSBadge label={command.typeLabel} tone="category" compact />
          <ECSBadge label={command.operationalLabel} tone="info" compact />
        </View>
        {onOpen ? <Ionicons name="chevron-forward" size={15} color={TACTICAL.textMuted} /> : null}
      </View>
      <Text style={styles.rowTitle}>{command.title}</Text>
      <Text style={styles.rowMeta}>
        {command.acknowledgmentLabel} / {command.deliveryLabel}
        {command.deadlineAt ? ` / due ${formatTimestamp(command.deadlineAt)}` : ''}
      </Text>
    </>
  );
  if (!onOpen) return <View style={styles.commandRow}>{content}</View>;
  return (
    <TouchableOpacity
      style={styles.commandRow}
      accessibilityRole="button"
      accessibilityLabel={`${command.title}. ${command.priorityLabel} priority. ${command.acknowledgmentLabel}.`}
      accessibilityHint="Returns to the Command Board and opens this command."
      activeOpacity={0.78}
      onPress={onOpen}
    >
      {content}
    </TouchableOpacity>
  );
}

function TimelineRow({
  event,
  compact = false,
}: {
  event: IncidentRoomTimelinePresentation;
  compact?: boolean;
}) {
  return (
    <View style={[styles.timelineRow, compact ? styles.timelineRowCompact : null]}>
      <View style={[styles.timelineMarker, event.kind === 'command' ? styles.timelineMarkerCommand : null]} />
      <View style={styles.flexCopy}>
        <Text style={styles.rowTitle}>{event.title}</Text>
        <Text style={styles.rowMeta}>{event.summary}</Text>
        <Text style={styles.timestamp}>{event.actorLabel} / {formatTimestamp(event.occurredAt)}</Text>
      </View>
    </View>
  );
}

function CompactRow({
  title,
  detail,
  icon,
  warning = false,
}: {
  title: string;
  detail: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  warning?: boolean;
}) {
  return (
    <View style={styles.compactRow}>
      <Ionicons name={icon} size={14} color={warning ? TACTICAL.danger : TACTICAL.amber} />
      <View style={styles.flexCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={[styles.rowMeta, warning ? styles.watchText : null]}>{detail}</Text>
      </View>
    </View>
  );
}

function EmptySectionText({ text }: { text: string }) {
  return <Text style={styles.emptySectionText}>{text}</Text>;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return 'Unknown time';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Invalid time';
  return new Date(parsed).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatClockStatus(value: string): string {
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function statusActionLabel(status: IncidentStatus): string {
  switch (status) {
    case 'stabilizing': return 'Begin Stabilizing';
    case 'awaiting_assistance': return 'Await Assistance';
    case 'self_recovery_in_progress': return 'Self-Recovery In Progress';
    case 'evacuating': return 'Mark Evacuating';
    case 'cancelled': return 'Cancel Incident';
    default: return `Set ${formatClockStatus(status)}`;
  }
}

function severityTone(label: string): React.ComponentProps<typeof ECSBadge>['tone'] {
  const value = label.toLowerCase();
  if (value.includes('critical') || value.includes('urgent')) return 'warning';
  if (value.includes('high')) return 'warning';
  return 'info';
}

function phaseTone(phase: IncidentRoomPresentation['phase']): React.ComponentProps<typeof ECSBadge>['tone'] {
  if (phase === 'resolved' || phase === 'closed') return 'ready';
  if (phase === 'recovering' || phase === 'stabilizing') return 'warning';
  return 'category';
}

const styles = StyleSheet.create({
  modalContent: {
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  root: {
    gap: 10,
  },
  rootLandscape: {
    paddingHorizontal: 2,
  },
  flexCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  emptyState: {
    minHeight: 260,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  emptyTitle: {
    color: TACTICAL.text,
    fontSize: 15,
    fontWeight: '900',
  },
  emptyDetail: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
    textAlign: 'center',
    maxWidth: 520,
  },
  summary: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.strong,
    backgroundColor: ECS_SURFACE.background.primary,
    padding: 12,
    gap: 10,
  },
  summaryTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  summaryEyebrow: {
    color: TACTICAL.amber,
    fontSize: 8,
    fontWeight: '900',
  },
  summaryTitle: {
    color: TACTICAL.text,
    fontSize: 17,
    fontWeight: '900',
  },
  summaryText: {
    color: TACTICAL.textMuted,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '700',
  },
  summaryBadges: {
    maxWidth: 280,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 6,
  },
  summaryFacts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  summaryFact: {
    minWidth: 128,
    flexGrow: 1,
    borderLeftWidth: 2,
    borderLeftColor: ECS_SURFACE.border.strong,
    paddingLeft: 8,
    gap: 2,
  },
  summaryFactLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
  },
  summaryFactValue: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  restrictedState: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(192,57,43,0.38)',
    backgroundColor: 'rgba(192,57,43,0.10)',
    padding: 12,
    flexDirection: 'row',
    gap: 10,
  },
  restrictedTitle: {
    color: TACTICAL.danger,
    fontSize: 11,
    fontWeight: '900',
  },
  restrictedDetail: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
  },
  decisionPanel: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(212,160,23,0.38)',
    backgroundColor: 'rgba(212,160,23,0.08)',
    padding: 12,
    gap: 6,
  },
  decisionEyebrow: {
    color: TACTICAL.amber,
    fontSize: 9,
    fontWeight: '900',
  },
  decisionText: {
    color: TACTICAL.text,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '900',
  },
  decisionMeta: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    fontWeight: '700',
  },
  twoColumn: {
    gap: 10,
  },
  twoColumnLandscape: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  section: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    backgroundColor: ECS_SURFACE.background.secondary,
    padding: 11,
    gap: 8,
  },
  sectionGrow: {
    flex: 1,
    minWidth: 0,
  },
  sectionHeadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    color: TACTICAL.amber,
    fontSize: 10,
    fontWeight: '900',
  },
  sectionDetail: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  sectionCommandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionCount: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '900',
  },
  personRow: {
    minHeight: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ECS_SURFACE.border.default,
    paddingTop: 7,
  },
  personIcon: {
    width: 28,
    height: 28,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  rightMeta: {
    maxWidth: '46%',
    alignItems: 'flex-end',
    gap: 3,
  },
  rowTitle: {
    color: TACTICAL.text,
    fontSize: 10,
    fontWeight: '900',
  },
  rowMeta: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  timestamp: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    fontWeight: '700',
  },
  resourceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  resourceCell: {
    minWidth: 105,
    flexGrow: 1,
    flexBasis: '30%',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    backgroundColor: ECS_SURFACE.background.compact,
    padding: 7,
    gap: 2,
  },
  resourceLabel: {
    color: TACTICAL.textMuted,
    fontSize: 7,
    fontWeight: '900',
  },
  resourceValue: {
    color: TACTICAL.text,
    fontSize: 9,
    fontWeight: '900',
  },
  watchText: {
    color: TACTICAL.danger,
  },
  commandRow: {
    minHeight: 58,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: ECS_SURFACE.border.default,
    backgroundColor: ECS_SURFACE.background.compact,
    padding: 9,
    gap: 5,
  },
  commandTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  commandBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  compactRow: {
    minHeight: 38,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ECS_SURFACE.border.default,
    paddingTop: 7,
  },
  contextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  contextIcon: {
    width: 34,
    height: 34,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  sourceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  actionWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  permissionCopy: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '700',
  },
  safetyCopy: {
    color: TACTICAL.textMuted,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: '800',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ECS_SURFACE.border.default,
    paddingTop: 7,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ECS_SURFACE.border.default,
    paddingTop: 8,
  },
  timelineRowCompact: {
    paddingTop: 6,
  },
  timelineMarker: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginTop: 4,
    backgroundColor: TACTICAL.amber,
  },
  timelineMarkerCommand: {
    backgroundColor: ECS.info,
  },
  emptySectionText: {
    color: TACTICAL.textMuted,
    fontSize: 10,
    lineHeight: 14,
    fontWeight: '700',
    paddingVertical: 5,
  },
  boundNotice: {
    color: TACTICAL.textMuted,
    fontSize: 8,
    lineHeight: 12,
    fontWeight: '700',
    fontStyle: 'italic',
  },
});
