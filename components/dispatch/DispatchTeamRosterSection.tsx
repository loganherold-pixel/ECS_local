import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  resolveMemberDispatchReliability,
  type DispatchSyncSnapshot,
} from '../../lib/dispatchSyncAdapter';
import {
  getDispatchReliabilityLabel,
  getQueueStatusLabel,
  getTeamMemberStatusLabel,
  type DispatchAssignment,
  type DispatchPing,
  type DispatchQueueItem,
  type DispatchTeamMember,
  type DispatchTeamMemberStatus,
} from '../../lib/dispatchTypes';
import {
  countActivePingsByMember,
  createDispatchRecordMap,
  groupDispatchQueueByAssignee,
} from '../../lib/dispatchPerformanceAdapter';
import {
  DISPATCH_PERMISSION_DENIED_COPY,
  DISPATCH_CONTACT_RESTRICTED_COPY,
  type DispatchRosterPermissionSet,
} from '../../lib/dispatchPermissionAdapter';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface DispatchTeamRosterSectionProps {
  members: DispatchTeamMember[];
  queueItems: DispatchQueueItem[];
  pings: DispatchPing[];
  assignments: DispatchAssignment[];
  syncSnapshot: DispatchSyncSnapshot;
  loading?: boolean;
  permissions: DispatchRosterPermissionSet;
  onPingMember?: (member: DispatchTeamMember) => void;
}

interface MemberDispatchContext {
  assignment: DispatchAssignment | null;
  queueItem: DispatchQueueItem | null;
  activePingCount: number;
  suggestedAction: string;
}

export default function DispatchTeamRosterSection({
  members,
  queueItems,
  pings,
  assignments,
  syncSnapshot,
  loading = false,
  permissions,
  onPingMember,
}: DispatchTeamRosterSectionProps) {
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  useEffect(() => {
    if (members.length === 0) {
      setExpandedMemberId(null);
      return;
    }

    setExpandedMemberId((current) =>
      current && members.some((member) => member.id === current) ? current : null,
    );
  }, [members]);

  const memberContexts = useMemo(() => {
    const queueById = createDispatchRecordMap(queueItems);
    const queueByAssignee = groupDispatchQueueByAssignee(queueItems);
    const activePingCounts = countActivePingsByMember(pings);
    const activeAssignmentByMember = new Map<string, DispatchAssignment>();

    assignments.forEach((assignment) => {
      if (assignment.status === 'completed' || assignment.status === 'declined') return;
      if (!activeAssignmentByMember.has(assignment.assigneeMemberId)) {
        activeAssignmentByMember.set(assignment.assigneeMemberId, assignment);
      }
    });

    return members.reduce<Record<string, MemberDispatchContext>>((acc, member) => {
      const assignment = activeAssignmentByMember.get(member.id) ?? null;
      const queueItem = assignment
        ? queueById.get(assignment.queueItemId) ?? null
        : queueByAssignee.get(member.id)?.[0] ?? null;
      const activePingCount = activePingCounts.get(member.id) ?? 0;

      acc[member.id] = {
        assignment,
        queueItem,
        activePingCount,
        suggestedAction: getSuggestedNextAction(member, activePingCount, queueItem),
      };

      return acc;
    }, {});
  }, [assignments, members, pings, queueItems]);

  const handleToggleMember = useCallback((memberId: string) => {
    setExpandedMemberId((current) => current === memberId ? null : memberId);
  }, []);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="people-circle-outline" size={15} color={TACTICAL.amber} />
          <Text style={styles.sectionTitle}>Expedition Team</Text>
        </View>
        <Text style={styles.sectionEyebrow}>ROSTER + READINESS</Text>
      </View>

      {loading ? (
        <View style={styles.emptyCard}>
          <Ionicons name="sync-outline" size={18} color={TACTICAL.amber} />
          <Text style={styles.emptyTitle}>Loading expedition roster</Text>
          <Text style={styles.emptyDetail}>Dispatch is checking the active Expedition Channel team.</Text>
        </View>
      ) : members.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="person-add-outline" size={18} color={TACTICAL.amber} />
          <Text style={styles.emptyTitle}>No team members loaded</Text>
          <Text style={styles.emptyDetail}>Solo mode remains available. Team readiness appears once members join the channel.</Text>
        </View>
      ) : (
        <View style={styles.rosterList}>
          {members.map((member) => {
            const context = memberContexts[member.id];
            return (
              <DispatchTeamMemberCard
                key={member.id}
                member={member}
                context={context}
                expanded={expandedMemberId === member.id}
                syncSnapshot={syncSnapshot}
                permissions={permissions}
                onPingMember={onPingMember}
                onToggle={handleToggleMember}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const DispatchTeamMemberCard = React.memo(function DispatchTeamMemberCard({
  member,
  context,
  expanded,
  syncSnapshot,
  permissions,
  onPingMember,
  onToggle,
}: {
  member: DispatchTeamMember;
  context: MemberDispatchContext;
  expanded: boolean;
  syncSnapshot: DispatchSyncSnapshot;
  permissions: DispatchRosterPermissionSet;
  onPingMember?: (member: DispatchTeamMember) => void;
  onToggle: (memberId: string) => void;
}) {
  const status = getMemberStatusPresentation(member.status);
  const reliabilityState = resolveMemberDispatchReliability(member, syncSnapshot);
  const currentAssignment = context.queueItem?.title ?? 'No active assignment';
  const locationLabel = permissions.canViewMemberLocation
    ? member.currentContext?.title ?? 'No field context'
    : permissions.locationRestrictedReason;

  return (
    <TouchableOpacity
      style={[styles.memberCard, expanded ? styles.memberCardExpanded : null]}
      activeOpacity={0.82}
      onPress={() => onToggle(member.id)}
      accessibilityRole="button"
      accessibilityLabel={`${member.displayName} dispatch detail`}
    >
      <View style={[styles.memberStatusRail, { backgroundColor: status.tone }]} />
      <View style={styles.memberContent}>
        <View style={styles.memberTopRow}>
          <View style={styles.memberIdentity}>
            <Text style={styles.memberName}>{member.displayName}</Text>
            <View style={styles.inlineMetaRow}>
              <Text style={styles.memberRole}>{getRoleLabel(member.role)}</Text>
              <Text style={styles.metaDot}>-</Text>
              <Text style={[styles.memberStatus, { color: status.tone }]}>{status.label}</Text>
            </View>
          </View>
          <View style={styles.connectionBlock}>
            <Text style={[styles.connectionState, { color: status.tone }]}>{status.connection}</Text>
            <Text style={styles.lastUpdate}>{formatLastUpdate(member.lastSeenAt)}</Text>
          </View>
        </View>

        <View style={styles.assignmentBlock}>
          <Text style={styles.assignmentLabel}>CURRENT ASSIGNMENT</Text>
          <Text style={styles.assignmentTitle}>{currentAssignment}</Text>
          <Text style={styles.locationLabel} numberOfLines={1}>{locationLabel}</Text>
        </View>

        <View style={styles.quickActionRow}>
          <View style={[
            styles.deliveryPill,
            reliabilityState === 'offline_risk' ? styles.deliveryPillRisk : null,
          ]}>
            <Ionicons
              name={reliabilityState === 'offline_risk' ? 'warning-outline' : 'cloud-done-outline'}
              size={12}
              color={reliabilityState === 'offline_risk' ? TACTICAL.danger : TACTICAL.amber}
            />
            <Text style={[
              styles.deliveryPillText,
              reliabilityState === 'offline_risk' ? styles.deliveryPillTextRisk : null,
            ]}>
              {getDispatchReliabilityLabel(reliabilityState)}
            </Text>
          </View>
          <QuickActionButton
            label="Ping"
            icon="radio-outline"
            disabled={!permissions.canPingMembers}
            disabledReason={permissions.disabledReason}
            onPress={() => onPingMember?.(member)}
          />
          <QuickActionButton
            label="Call"
            icon="call-outline"
            disabled
            disabledReason={
              permissions.canViewMemberContact
                ? 'Call integration is not enabled.'
                : permissions.contactRestrictedReason
            }
          />
          <QuickActionButton
            label="Message"
            icon="chatbubble-outline"
            disabled
            disabledReason={
              permissions.canViewMemberContact
                ? 'Message integration is not enabled.'
                : permissions.contactRestrictedReason
            }
          />
          <QuickActionButton
            label="Assign"
            icon="clipboard-outline"
            disabled={!permissions.canAssignMembers}
            disabledReason={permissions.disabledReason}
          />
        </View>

        {expanded ? (
          <View style={styles.detailPanel}>
            <DetailRow label="Role" value={getRoleLabel(member.role)} />
            <DetailRow label="Status" value={getTeamMemberStatusLabel(member.status)} valueTone={status.tone} />
            <DetailRow label="Assignment" value={currentAssignment} />
            <DetailRow label="Location" value={locationLabel} />
            <DetailRow label="Last Seen" value={formatLastUpdate(member.lastSeenAt)} />
            <DetailRow label="Active Pings" value={String(context.activePingCount)} />
            <DetailRow label="Delivery Risk" value={getDispatchReliabilityLabel(reliabilityState)} />
            <DetailRow
              label="Linked Queue"
              value={context.queueItem ? `${context.queueItem.title} - ${getQueueStatusLabel(context.queueItem.status)}` : 'None'}
            />
            <View style={styles.nextActionCallout}>
              <Text style={styles.nextActionLabel}>SUGGESTED NEXT ACTION</Text>
              <Text style={styles.nextActionText}>{context.suggestedAction}</Text>
            </View>
            <Text style={styles.placeholderNote}>
              Call and message integrations are staged as safe placeholders until ECS comms wiring is enabled.
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const QuickActionButton = React.memo(function QuickActionButton({
  label,
  icon,
  disabled,
  disabledReason,
  onPress,
}: {
  label: string;
  icon: IconName;
  disabled?: boolean;
  disabledReason?: string;
  onPress?: () => void;
}) {
  return (
    <TouchableOpacity
      style={[styles.quickAction, disabled ? styles.quickActionDisabled : null]}
      activeOpacity={disabled ? 1 : 0.75}
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityHint={disabled ? disabledReason : undefined}
    >
      <Ionicons name={icon} size={13} color={disabled ? TACTICAL.textMuted : TACTICAL.amber} />
      <View style={styles.quickActionCopy}>
        <Text style={[styles.quickActionText, disabled ? styles.quickActionTextDisabled : null]}>
          {label}
        </Text>
        {disabled && disabledReason ? (
          <Text style={styles.quickActionReason} numberOfLines={1}>
            {disabledReason === DISPATCH_PERMISSION_DENIED_COPY ||
            disabledReason === DISPATCH_CONTACT_RESTRICTED_COPY
              ? 'No permission'
              : 'Unavailable'}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const DetailRow = React.memo(function DetailRow({
  label,
  value,
  valueTone,
}: {
  label: string;
  value: string;
  valueTone?: string;
}) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueTone ? { color: valueTone } : null]}>{value}</Text>
    </View>
  );
});

function getMemberStatusPresentation(status: DispatchTeamMemberStatus): {
  label: string;
  connection: string;
  tone: string;
} {
  switch (status) {
    case 'connected':
      return { label: 'Operational', connection: 'Live', tone: '#7F9D7A' };
    case 'offline':
      return { label: 'Stale', connection: 'Offline', tone: TACTICAL.textMuted };
    case 'on_route':
      return { label: 'Active', connection: 'Live', tone: '#7F9D7A' };
    case 'at_waypoint':
      return { label: 'Positioned', connection: 'Live', tone: TACTICAL.amber };
    case 'at_camp':
      return { label: 'Staged', connection: 'Live', tone: TACTICAL.amber };
    case 'needs_check_in':
      return { label: 'Attention', connection: 'Check-In', tone: '#D9903D' };
    case 'no_response':
      return { label: 'Warning', connection: 'No Response', tone: '#D9903D' };
    case 'unavailable':
      return { label: 'Muted', connection: 'Unavailable', tone: TACTICAL.textMuted };
    case 'emergency':
      return { label: 'Critical', connection: 'Emergency', tone: TACTICAL.danger };
    default:
      return { label: 'Unknown', connection: 'Unknown', tone: TACTICAL.textMuted };
  }
}

function getRoleLabel(role: DispatchTeamMember['role']): string {
  switch (role) {
    case 'owner':
      return 'Expedition Lead';
    case 'member':
      return 'Field Member';
    case 'viewer':
      return 'Observer';
    default:
      return 'Team Member';
  }
}

function getSuggestedNextAction(
  member: DispatchTeamMember,
  activePingCount: number,
  queueItem: DispatchQueueItem | null,
): string {
  if (member.status === 'emergency') {
    return 'Escalate immediately and assign nearest available support.';
  }
  if (member.status === 'offline' || member.status === 'no_response') {
    return 'Send a check-in ping and prepare relay support if no response returns.';
  }
  if (member.status === 'needs_check_in') {
    return 'Request a status check before assigning additional route work.';
  }
  if (queueItem?.status === 'blocked') {
    return 'Review the linked queue item and assign assist support.';
  }
  if (activePingCount > 0) {
    return 'Monitor active ping acknowledgement before changing assignment.';
  }
  return 'Member is available for dispatch coordination.';
}

function formatLastUpdate(iso: string): string {
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)} UTC`;
}

const styles = StyleSheet.create({
  section: {
    gap: 11,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
    letterSpacing: 0.8,
  },
  sectionEyebrow: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
    textAlign: 'right',
    flexShrink: 1,
  },
  emptyCard: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 12,
    backgroundColor: 'rgba(12,16,20,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  emptyDetail: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
    textAlign: 'center',
  },
  rosterList: {
    gap: 10,
  },
  memberCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,16,20,0.5)',
  },
  memberCardExpanded: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(12,16,20,0.66)',
  },
  memberStatusRail: {
    width: 4,
  },
  memberContent: {
    flex: 1,
    padding: 12,
    gap: 9,
  },
  memberTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  memberIdentity: {
    flex: 1,
    minWidth: 0,
  },
  memberName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  inlineMetaRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  memberRole: {
    fontSize: 10,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  metaDot: {
    fontSize: 10,
    color: TACTICAL.textMuted,
  },
  memberStatus: {
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  connectionBlock: {
    alignItems: 'flex-end',
    gap: 2,
  },
  connectionState: {
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  lastUpdate: {
    fontSize: 9,
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  assignmentBlock: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 8,
    gap: 3,
  },
  assignmentLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 1,
  },
  assignmentTitle: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
    color: TACTICAL.text,
  },
  locationLabel: {
    fontSize: 10,
    color: TACTICAL.amber,
  },
  quickActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  deliveryPill: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  deliveryPillRisk: {
    borderColor: 'rgba(192,57,43,0.42)',
    backgroundColor: 'rgba(192,57,43,0.08)',
  },
  deliveryPillText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    textTransform: 'uppercase',
  },
  deliveryPillTextRisk: {
    color: TACTICAL.danger,
  },
  quickAction: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(212,160,23,0.1)',
  },
  quickActionDisabled: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    opacity: 0.7,
  },
  quickActionText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.text,
    textTransform: 'uppercase',
  },
  quickActionCopy: {
    gap: 1,
  },
  quickActionReason: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  quickActionTextDisabled: {
    color: TACTICAL.textMuted,
  },
  detailPanel: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 9,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  detailValue: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.text,
    textAlign: 'right',
  },
  nextActionCallout: {
    marginTop: 2,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    borderRadius: 9,
    padding: 9,
    backgroundColor: 'rgba(212,160,23,0.055)',
    gap: 4,
  },
  nextActionLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 1,
  },
  nextActionText: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.text,
  },
  placeholderNote: {
    fontSize: 9,
    lineHeight: 13,
    color: TACTICAL.textMuted,
  },
});
