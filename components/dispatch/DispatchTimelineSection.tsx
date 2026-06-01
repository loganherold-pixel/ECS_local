import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  getDispatchContextTypeLabel,
} from '../../lib/dispatchContextAdapter';
import {
  getDeliveryStateLabel,
  getPriorityWeight,
  type DispatchPriority,
  type DispatchTimelineEvent,
  type DispatchTimelineEventType,
} from '../../lib/dispatchTypes';
import { getRecentDispatchTimelineEvents } from '../../lib/dispatchPerformanceAdapter';
import type { DispatchTimelinePermissionSet } from '../../lib/dispatchPermissionAdapter';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

interface DispatchTimelineSectionProps {
  events: DispatchTimelineEvent[];
  permissions: DispatchTimelinePermissionSet;
  onRetryEvent?: (event: DispatchTimelineEvent) => void;
}

export default function DispatchTimelineSection({ events, permissions, onRetryEvent }: DispatchTimelineSectionProps) {
  const visibleEvents = useMemo(
    () => getRecentDispatchTimelineEvents(events, 8),
    [events],
  );

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="time-outline" size={15} color={TACTICAL.amber} />
          <Text style={styles.sectionTitle}>Dispatch Timeline</Text>
        </View>
        <Text style={styles.sectionEyebrow}>{events.length} EVENTS</Text>
      </View>

      {!permissions.canViewAuditHistory ? (
        <View style={styles.emptyCard}>
          <Ionicons name="lock-closed-outline" size={18} color={TACTICAL.amber} />
          <Text style={styles.emptyTitle}>Dispatch audit restricted</Text>
          <Text style={styles.emptyDetail}>{permissions.disabledReason}</Text>
        </View>
      ) : visibleEvents.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="git-commit-outline" size={18} color={TACTICAL.amber} />
          <Text style={styles.emptyTitle}>No dispatch timeline events</Text>
          <Text style={styles.emptyDetail}>Pings, queue changes, and escalations will appear here.</Text>
        </View>
      ) : (
        <View style={styles.timelineStack}>
          {visibleEvents.map((event, index) => (
            <TimelineCard
              key={event.id}
              event={event}
              isLast={index === visibleEvents.length - 1}
              onRetryEvent={onRetryEvent}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const TimelineCard = React.memo(function TimelineCard({
  event,
  isLast,
  onRetryEvent,
}: {
  event: DispatchTimelineEvent;
  isLast: boolean;
  onRetryEvent?: (event: DispatchTimelineEvent) => void;
}) {
  const meta = getTimelinePresentation(event.type, event.priority);

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View style={[styles.timelineDot, { backgroundColor: meta.color }]} />
        {!isLast ? <View style={styles.timelineLine} /> : null}
      </View>
      <View style={styles.timelineCard}>
        <View style={styles.timelineHeaderRow}>
          <View style={styles.timelineTitleBlock}>
            <View style={styles.timelineTypeRow}>
              <Ionicons name={meta.icon} size={12} color={meta.color} />
              <Text style={[styles.timelineType, { color: meta.color }]}>{meta.label}</Text>
            </View>
            <Text style={styles.timelineTitle}>{event.title}</Text>
          </View>
          <View style={styles.timestampPill}>
            <Text style={styles.timestampText}>{formatTimestampLabel(event.occurredAt)}</Text>
          </View>
        </View>

        <Text style={styles.timelineDetail} numberOfLines={2}>{event.detail}</Text>

        <View style={styles.factRow}>
          <TimelineFact label="Actor" value={event.actor ?? 'Dispatch'} />
          <TimelineFact label="Target" value={event.target ?? formatMemberTarget(event.memberIds)} />
          <TimelineFact label="Priority" value={`${event.priority.toUpperCase()} ${getPriorityWeight(event.priority)}`} />
          {event.deliveryState ? (
            <TimelineFact label="Delivery" value={getDeliveryStateLabel(event.deliveryState)} />
          ) : null}
        </View>

        {event.linkedContext ? (
          <View style={styles.contextRow}>
            <Ionicons name="map-outline" size={11} color={TACTICAL.amber} />
            <Text style={styles.contextText}>
              {getDispatchContextTypeLabel(event.linkedContext.type)} / {event.linkedContext.title}
            </Text>
          </View>
        ) : null}

        {event.conflictState && event.conflictState !== 'none' ? (
          <View style={styles.conflictRow}>
            <Ionicons name="sync-outline" size={11} color={TACTICAL.amber} />
            <Text style={styles.conflictText}>
              {event.conflictReason ?? 'Dispatch item updated during sync.'}
            </Text>
          </View>
        ) : null}

        {event.deliveryState === 'failed' && onRetryEvent ? (
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => onRetryEvent(event)}
            activeOpacity={0.76}
          >
            <Ionicons name="refresh-outline" size={12} color={TACTICAL.amber} />
            <Text style={styles.retryText}>Retry Timeline Delivery</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
});

const TimelineFact = React.memo(function TimelineFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factPill}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
    </View>
  );
});

function getTimelinePresentation(
  type: DispatchTimelineEventType,
  priority: DispatchPriority,
): { label: string; icon: IconName; color: string } {
  if (priority === 'critical') {
    return { label: getTimelineTypeLabel(type), icon: getTimelineIcon(type), color: TACTICAL.danger };
  }

  return {
    label: getTimelineTypeLabel(type),
    icon: getTimelineIcon(type),
    color: priority === 'high' ? '#D9903D' : TACTICAL.amber,
  };
}

function getTimelineTypeLabel(type: DispatchTimelineEventType): string {
  switch (type) {
    case 'ping_created':
    case 'ping':
      return 'PING CREATED';
    case 'ping_acknowledged':
      return 'PING ACK';
    case 'ping_declined':
      return 'PING DECLINED';
    case 'assignment_created':
    case 'assignment':
      return 'ASSIGNMENT';
    case 'assignment_accepted':
      return 'ACCEPTED';
    case 'queue_escalated':
    case 'queue':
      return 'QUEUE UPDATE';
    case 'queue_resolved':
      return 'RESOLVED';
    case 'member_stale':
    case 'status':
      return 'MEMBER STATUS';
    case 'resource_check_requested':
      return 'RESOURCE CHECK';
    case 'hazard_broadcast_sent':
      return 'HAZARD';
    case 'assist_request_created':
      return 'ASSIST';
    case 'sync':
    case 'sync_conflict':
      return 'SYNC';
    default:
      return 'LOG';
  }
}

function getTimelineIcon(type: DispatchTimelineEventType): IconName {
  switch (type) {
    case 'ping':
    case 'ping_created':
    case 'ping_acknowledged':
    case 'ping_declined':
      return 'radio-outline';
    case 'assignment':
    case 'assignment_created':
    case 'assignment_accepted':
      return 'clipboard-outline';
    case 'queue':
    case 'queue_escalated':
    case 'queue_resolved':
      return 'git-branch-outline';
    case 'member_stale':
    case 'status':
      return 'person-circle-outline';
    case 'resource_check_requested':
      return 'cube-outline';
    case 'hazard_broadcast_sent':
      return 'warning-outline';
    case 'assist_request_created':
      return 'medkit-outline';
    case 'sync':
    case 'sync_conflict':
      return 'sync-outline';
    default:
      return 'document-text-outline';
  }
}

function formatTimestampLabel(iso: string): string {
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}Z`;
}

function formatMemberTarget(memberIds: string[]): string {
  if (memberIds.length === 0) return 'Team';
  if (memberIds.length === 1) return '1 member';
  return `${memberIds.length} members`;
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
    minHeight: 112,
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
  timelineStack: {
    gap: 0,
  },
  timelineRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  timelineRail: {
    width: 18,
    alignItems: 'center',
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 14,
  },
  timelineLine: {
    flex: 1,
    width: 1,
    backgroundColor: GOLD_RAIL.internal,
    marginTop: 4,
  },
  timelineCard: {
    flex: 1,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 12,
    padding: 12,
    gap: 8,
    backgroundColor: 'rgba(12,16,20,0.5)',
  },
  timelineHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 10,
  },
  timelineTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  timelineTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  timelineType: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 1,
  },
  timelineTitle: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  timestampPill: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  timestampText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    fontFamily: 'Courier',
  },
  timelineDetail: {
    fontSize: 11,
    lineHeight: 16,
    color: TACTICAL.textMuted,
  },
  factRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  factPill: {
    flexGrow: 1,
    flexBasis: '30%',
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  factLabel: {
    fontSize: 7,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  factValue: {
    marginTop: 2,
    fontSize: 10,
    color: TACTICAL.text,
  },
  contextRow: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contextText: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.amber,
    fontWeight: '800',
  },
  conflictRow: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  conflictText: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.text,
    fontWeight: '800',
  },
  retryButton: {
    minHeight: 40,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  retryText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
});
