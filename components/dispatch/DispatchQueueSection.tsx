import React, { useCallback, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import {
  getDispatchContextActions,
  getDispatchContextTypeLabel,
  type DispatchContextAction,
} from '../../lib/dispatchContextAdapter';
import {
  resolveQueueDispatchReliability,
  type DispatchSyncSnapshot,
} from '../../lib/dispatchSyncAdapter';
import {
  getEscalationRecommendation,
  isTerminalEscalationState,
  shouldSuggestEscalation,
} from '../../lib/dispatchEscalationAdapter';
import {
  getSuggestedDispatchAction,
} from '../../lib/dispatchSuggestionAdapter';
import {
  getDispatchReliabilityLabel,
  getDeliveryStateLabel,
  getPingStatusLabel,
  getPriorityWeight,
  getQueueStatusLabel,
  type DispatchLinkedContext,
  type DispatchPing,
  type DispatchPriority,
  type DispatchQueueItem,
  type DispatchQueueItemStatus,
  type DispatchTeamMember,
} from '../../lib/dispatchTypes';
import { createDispatchRecordMap } from '../../lib/dispatchPerformanceAdapter';
import type { DispatchQueuePermissionSet } from '../../lib/dispatchPermissionAdapter';
import { GOLD_RAIL, TACTICAL } from '../../lib/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];
type QueueFilter = 'all' | 'awaiting' | 'assigned' | 'escalated' | 'resolved';

interface DispatchQueueSectionProps {
  items: DispatchQueueItem[];
  pings: DispatchPing[];
  members: DispatchTeamMember[];
  syncSnapshot: DispatchSyncSnapshot;
  permissions: DispatchQueuePermissionSet;
  onPingItem: (item: DispatchQueueItem) => void;
  onContextPing: (context: DispatchLinkedContext, action?: DispatchContextAction) => void;
  onAssignItem: (item: DispatchQueueItem) => void;
  onMarkInProgress: (item: DispatchQueueItem) => void;
  onMarkResolved: (item: DispatchQueueItem) => void;
  onEscalateItem: (item: DispatchQueueItem) => void;
  onRetryDelivery: (item: DispatchQueueItem) => void;
  onCancelDelivery: (item: DispatchQueueItem) => void;
  smartSuggestionsEnabled?: boolean;
}

const FILTERS: { id: QueueFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'awaiting', label: 'Awaiting' },
  { id: 'assigned', label: 'Assigned' },
  { id: 'escalated', label: 'Escalated' },
  { id: 'resolved', label: 'Resolved' },
];

export default function DispatchQueueSection({
  items,
  pings,
  members,
  syncSnapshot,
  permissions,
  onPingItem,
  onContextPing,
  onAssignItem,
  onMarkInProgress,
  onMarkResolved,
  onEscalateItem,
  onRetryDelivery,
  onCancelDelivery,
  smartSuggestionsEnabled = true,
}: DispatchQueueSectionProps) {
  const [activeFilter, setActiveFilter] = useState<QueueFilter>('all');
  const [contextNotice, setContextNotice] = useState<string | null>(null);
  const pingById = useMemo(() => createDispatchRecordMap(pings), [pings]);
  const memberById = useMemo(() => createDispatchRecordMap(members), [members]);

  const visibleItems = useMemo(() => {
    return sortOperationalQueue(items).filter((item) => matchesFilter(item, activeFilter));
  }, [activeFilter, items]);

  const handleViewContext = useCallback((queueItem: DispatchQueueItem) => {
    setContextNotice(`Context placeholder: ${queueItem.linkedContext.title}`);
  }, []);

  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionTitleRow}>
          <Ionicons name="git-branch-outline" size={15} color={TACTICAL.amber} />
          <Text style={styles.sectionTitle}>Dispatch Queue</Text>
        </View>
        <Text style={styles.sectionEyebrow}>LIVE OPERATIONS</Text>
      </View>

      <View style={styles.filterRow}>
        {FILTERS.map((filter) => (
          <TouchableOpacity
            key={filter.id}
            style={[styles.filterPill, activeFilter === filter.id ? styles.filterPillActive : null]}
            onPress={() => setActiveFilter(filter.id)}
            activeOpacity={0.76}
          >
            <Text style={[styles.filterText, activeFilter === filter.id ? styles.filterTextActive : null]}>
              {filter.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {contextNotice ? (
        <View style={styles.contextNotice}>
          <Ionicons name="map-outline" size={13} color={TACTICAL.amber} />
          <Text style={styles.contextNoticeText}>{contextNotice}</Text>
        </View>
      ) : null}

      {visibleItems.length === 0 ? (
        <View style={styles.emptyCard}>
          <Ionicons name="checkmark-done-outline" size={18} color={TACTICAL.amber} />
          <Text style={styles.emptyTitle}>{getQueueEmptyTitle(activeFilter)}</Text>
          <Text style={styles.emptyDetail}>{getQueueEmptyDetail(activeFilter)}</Text>
        </View>
      ) : (
        <View style={styles.cardStack}>
          {visibleItems.map((item) => {
            const ping = item.sourcePingId
              ? pingById.get(item.sourcePingId)
              : undefined;
            return (
              <DispatchQueueCard
                key={item.id}
                item={item}
                ping={ping}
                pings={pings}
                assignedLabel={getAssignedLabel(item, memberById)}
                syncSnapshot={syncSnapshot}
                members={members}
                permissions={permissions}
                smartSuggestionsEnabled={smartSuggestionsEnabled}
                onPingItem={onPingItem}
                onContextPing={onContextPing}
                onAssignItem={onAssignItem}
                onMarkInProgress={onMarkInProgress}
                onMarkResolved={onMarkResolved}
                onEscalateItem={onEscalateItem}
                onRetryDelivery={onRetryDelivery}
                onCancelDelivery={onCancelDelivery}
                onViewContext={handleViewContext}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}

const DispatchQueueCard = React.memo(function DispatchQueueCard({
  item,
  ping,
  pings,
  assignedLabel,
  syncSnapshot,
  members,
  permissions,
  smartSuggestionsEnabled,
  onPingItem,
  onContextPing,
  onAssignItem,
  onMarkInProgress,
  onMarkResolved,
  onEscalateItem,
  onRetryDelivery,
  onCancelDelivery,
  onViewContext,
}: {
  item: DispatchQueueItem;
  ping?: DispatchPing;
  pings: DispatchPing[];
  assignedLabel: string;
  syncSnapshot: DispatchSyncSnapshot;
  members: DispatchTeamMember[];
  permissions: DispatchQueuePermissionSet;
  smartSuggestionsEnabled: boolean;
  onPingItem: (item: DispatchQueueItem) => void;
  onContextPing: (context: DispatchLinkedContext, action?: DispatchContextAction) => void;
  onAssignItem: (item: DispatchQueueItem) => void;
  onMarkInProgress: (item: DispatchQueueItem) => void;
  onMarkResolved: (item: DispatchQueueItem) => void;
  onEscalateItem: (item: DispatchQueueItem) => void;
  onRetryDelivery: (item: DispatchQueueItem) => void;
  onCancelDelivery: (item: DispatchQueueItem) => void;
  onViewContext: (item: DispatchQueueItem) => void;
}) {
  const priorityTone = getPriorityTone(item.priority);
  const recommendation = getEscalationRecommendation({
    priority: item.priority,
    status: item.status,
    escalationState: item.escalationState,
  });
  const escalationDecision = shouldSuggestEscalation({ queueItem: item, ping });
  const smartSuggestions = useMemo(
    () =>
      smartSuggestionsEnabled
        ? getSuggestedDispatchAction({
          queueItem: item,
          members,
          pings,
          canViewLocation: permissions.canViewContext,
        }).slice(0, 4)
        : [],
    [item, members, permissions.canViewContext, pings, smartSuggestionsEnabled],
  );
  const ackProgress = ping
    ? `${ping.acknowledgedByMemberIds?.length ?? 0}/${ping.targetMemberIds.length} ack`
    : 'No ack tracker';
  const reliabilityState = resolveQueueDispatchReliability(item, ping, syncSnapshot, members);

  return (
    <View style={[
      styles.queueCard,
      item.priority === 'critical' ? styles.queueCardCritical : null,
      reliabilityState === 'queued' || reliabilityState === 'retrying' ? styles.queueCardQueued : null,
      reliabilityState === 'offline_risk' || reliabilityState === 'failed' ? styles.queueCardRisk : null,
      item.conflictState === 'needs_review' ? styles.queueCardReview : null,
    ]}>
      <View style={[styles.priorityRail, { backgroundColor: priorityTone }]} />
      <View style={styles.queueBody}>
        <View style={styles.queueHeaderRow}>
          <View style={styles.queueTitleBlock}>
            <Text style={styles.queueTitle}>{item.title}</Text>
            <Text style={styles.queueContext}>
              {getDispatchContextTypeLabel(item.linkedContext.type)} / {item.linkedContext.title}
            </Text>
          </View>
          <PriorityBadge priority={item.priority} />
        </View>

        <Text style={styles.queueDetail}>{item.detail}</Text>

        <View style={styles.detailGrid}>
          <QueueFact label="Assigned" value={assignedLabel} />
          <QueueFact label="Created" value={formatTimeLabel(item.createdAt)} />
          <QueueFact label="Updated" value={formatTimeLabel(item.updatedAt)} />
          <QueueFact label="Ack" value={ackProgress} />
        </View>

        <View style={styles.badgeRow}>
          <StatusBadge label={getQueueStatusLabel(item.status)} />
          <StatusBadge
            label={getDispatchReliabilityLabel(reliabilityState)}
            muted={reliabilityState !== 'offline_risk' && reliabilityState !== 'failed'}
            danger={reliabilityState === 'failed' || reliabilityState === 'offline_risk'}
          />
          <StatusBadge label={getDeliveryStateLabel(item.deliveryState)} muted />
          {ping ? <StatusBadge label={getPingStatusLabel(ping.status)} muted /> : null}
          {item.escalationState !== 'none' ? (
            <StatusBadge
              label={item.escalationState.toUpperCase()}
              danger={isActiveEscalation(item)}
            />
          ) : null}
          {escalationDecision.shouldSuggest && !isActiveEscalation(item) ? (
            <StatusBadge label="Escalation Suggested" danger />
          ) : null}
          {item.conflictState && item.conflictState !== 'none' ? (
            <StatusBadge
              label={item.conflictState === 'needs_review' ? 'Needs Review' : 'Updated During Sync'}
              danger={item.conflictState === 'needs_review'}
            />
          ) : null}
        </View>

        <View style={styles.recommendationCard}>
          <Ionicons name="navigate-circle-outline" size={13} color={TACTICAL.amber} />
          <Text style={styles.recommendation}>
            {item.conflictReason ?? (escalationDecision.shouldSuggest ? escalationDecision.reason : recommendation)}
          </Text>
        </View>

        {smartSuggestions.length > 0 ? (
          <View style={styles.suggestionCard}>
            <View style={styles.suggestionHeader}>
              <Ionicons name="sparkles-outline" size={13} color={TACTICAL.amber} />
              <Text style={styles.suggestionTitle}>Smart Suggestions</Text>
            </View>
            {smartSuggestions.map((suggestion) => (
              <View key={`${suggestion.type}-${suggestion.memberId ?? suggestion.label}`} style={styles.suggestionRow}>
                <Text style={styles.suggestionLabel}>{suggestion.label}</Text>
                <Text style={styles.suggestionReason}>{suggestion.reason}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <ContextActionStrip
          context={item.linkedContext}
          onContextPing={onContextPing}
          onPlaceholder={(action) => onViewContext({
            ...item,
            linkedContext: {
              ...item.linkedContext,
              title: `${item.linkedContext.title} / ${action.label}`,
            },
          })}
        />

        <View style={styles.actionGrid}>
          <QueueAction
            label="Ping"
            icon="radio-outline"
            disabled={!permissions.canPing}
            disabledReason={permissions.disabledReason}
            onPress={() => onPingItem(item)}
          />
          <QueueAction
            label="Assign"
            icon="person-add-outline"
            disabled={!permissions.canAssign}
            disabledReason={permissions.disabledReason}
            onPress={() => onAssignItem(item)}
          />
          <QueueAction
            label="In Progress"
            icon="play-outline"
            disabled={!permissions.canAssign || item.status === 'in_progress' || item.status === 'resolved'}
            disabledReason={!permissions.canAssign ? permissions.disabledReason : undefined}
            onPress={() => onMarkInProgress(item)}
          />
          <QueueAction
            label="Resolved"
            icon="checkmark-done-outline"
            disabled={!permissions.canResolve || item.status === 'resolved'}
            disabledReason={!permissions.canResolve ? permissions.disabledReason : undefined}
            onPress={() => onMarkResolved(item)}
          />
          <QueueAction
            label="Escalate"
            icon="warning-outline"
            danger
            disabled={!permissions.canEscalate || isTerminalEscalationState(item.escalationState) || item.status === 'resolved'}
            disabledReason={!permissions.canEscalate ? permissions.disabledReason : undefined}
            onPress={() => onEscalateItem(item)}
          />
          <QueueAction
            label="Context"
            icon="map-outline"
            disabled={!permissions.canViewContext}
            disabledReason={permissions.disabledReason}
            onPress={() => onViewContext(item)}
          />
          {reliabilityState === 'failed' ? (
            <QueueAction
              label="Retry"
              icon="refresh-outline"
              disabled={!permissions.canCancel}
              disabledReason={permissions.disabledReason}
              onPress={() => onRetryDelivery(item)}
            />
          ) : null}
          {reliabilityState === 'queued' || reliabilityState === 'retrying' ? (
            <QueueAction
              label="Cancel"
              icon="close-circle-outline"
              disabled={!permissions.canCancel || item.status === 'cancelled'}
              disabledReason={!permissions.canCancel ? permissions.disabledReason : 'Already cancelled'}
              onPress={() => onCancelDelivery(item)}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
});

const QueueFact = React.memo(function QueueFact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.queueFact}>
      <Text style={styles.queueFactLabel}>{label}</Text>
      <Text style={styles.queueFactValue} numberOfLines={1}>{value}</Text>
    </View>
  );
});

const ContextActionStrip = React.memo(function ContextActionStrip({
  context,
  onContextPing,
  onPlaceholder,
}: {
  context: DispatchLinkedContext;
  onContextPing: (context: DispatchLinkedContext, action?: DispatchContextAction) => void;
  onPlaceholder: (action: DispatchContextAction) => void;
}) {
  const actions = getDispatchContextActions(context).slice(0, 4);

  return (
    <View style={styles.contextActionStrip}>
      <View style={styles.contextPreviewRow}>
        <Ionicons name={getContextIcon(context.type)} size={12} color={TACTICAL.amber} />
        <Text style={styles.contextPreviewText}>
          {getDispatchContextTypeLabel(context.type)} / {context.title}
        </Text>
      </View>
      <View style={styles.contextActionRow}>
        {actions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={styles.contextActionPill}
            onPress={() => {
              if (action.pingType) {
                onContextPing(context, action);
              } else {
                onPlaceholder(action);
              }
            }}
            activeOpacity={0.76}
          >
            <Text style={styles.contextActionText}>{action.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

const QueueAction = React.memo(function QueueAction({
  label,
  icon,
  danger,
  disabled,
  disabledReason,
  onPress,
}: {
  label: string;
  icon: IconName;
  danger?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  onPress: () => void;
}) {
  const tone = danger ? TACTICAL.danger : TACTICAL.amber;

  return (
    <TouchableOpacity
      style={[styles.queueAction, disabled ? styles.queueActionDisabled : null]}
      onPress={onPress}
      activeOpacity={disabled ? 1 : 0.76}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityHint={disabled ? disabledReason : undefined}
    >
      <Ionicons name={icon} size={12} color={disabled ? TACTICAL.textMuted : tone} />
      <View style={styles.queueActionCopy}>
        <Text style={[styles.queueActionText, disabled ? styles.queueActionTextDisabled : null]}>
          {label}
        </Text>
        {disabled && disabledReason ? (
          <Text style={styles.queueActionReason} numberOfLines={1}>No permission</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  );
});

const PriorityBadge = React.memo(function PriorityBadge({ priority }: { priority: DispatchPriority }) {
  const tone = getPriorityTone(priority);

  return (
    <View style={[styles.priorityBadge, { borderColor: `${tone}66`, backgroundColor: `${tone}12` }]}>
      <Text style={[styles.priorityText, { color: tone }]}>
        {priority.toUpperCase()} {getPriorityWeight(priority)}
      </Text>
    </View>
  );
});

const StatusBadge = React.memo(function StatusBadge({
  label,
  muted,
  danger,
}: {
  label: string;
  muted?: boolean;
  danger?: boolean;
}) {
  const tone = danger ? TACTICAL.danger : muted ? TACTICAL.textMuted : TACTICAL.amber;

  return (
    <View style={[styles.statusBadge, { borderColor: `${tone}44` }]}>
      <Text style={[styles.statusText, { color: tone }]}>{label}</Text>
    </View>
  );
});

function sortOperationalQueue(items: DispatchQueueItem[]): DispatchQueueItem[] {
  return [...items].sort((a, b) => {
    const aResolved = isResolved(a);
    const bResolved = isResolved(b);
    if (aResolved !== bResolved) return aResolved ? 1 : -1;

    const comparisons = [
      Number(b.priority === 'critical') - Number(a.priority === 'critical'),
      Number(isActiveEscalation(b)) - Number(isActiveEscalation(a)),
      Number(isPendingResponse(b)) - Number(isPendingResponse(a)),
      Number(b.priority === 'high') - Number(a.priority === 'high'),
    ];

    const decisive = comparisons.find((value) => value !== 0);
    if (decisive) return decisive;

    return Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt);
  });
}

function matchesFilter(item: DispatchQueueItem, filter: QueueFilter): boolean {
  switch (filter) {
    case 'awaiting':
      return isPendingResponse(item);
    case 'assigned':
      return item.status === 'assigned' || item.status === 'in_progress';
    case 'escalated':
      return isActiveEscalation(item) || item.status === 'escalated';
    case 'resolved':
      return isResolved(item);
    default:
      return true;
  }
}

function getQueueEmptyTitle(filter: QueueFilter): string {
  switch (filter) {
    case 'awaiting':
      return 'No pending responses';
    case 'assigned':
      return 'No assigned queue items';
    case 'escalated':
      return 'No active escalations';
    case 'resolved':
      return 'No resolved queue items';
    default:
      return 'No active queue items';
  }
}

function getQueueEmptyDetail(filter: QueueFilter): string {
  if (filter === 'all') {
    return 'New pings, assist requests, route checks, and resource tasks will appear here.';
  }

  return 'Resolved items stay available under the Resolved filter.';
}

function isActiveEscalation(item: DispatchQueueItem): boolean {
  return (
    item.escalationState === 'follow_up' ||
    item.escalationState === 'escalate_to_lead' ||
    item.escalationState === 'broadcast_to_team' ||
    item.escalationState === 'escalated' ||
    item.escalationState === 'emergency_unresolved'
  );
}

function isPendingResponse(item: DispatchQueueItem): boolean {
  return (
    item.status === 'pending_response' ||
    item.status === 'blocked' ||
    item.status === 'needs_review' ||
    item.deliveryState === 'no_response' ||
    item.deliveryState === 'sent' ||
    item.deliveryState === 'queued'
  );
}

function isResolved(item: DispatchQueueItem): boolean {
  return item.status === 'resolved' || item.status === 'cancelled';
}

function getAssignedLabel(item: DispatchQueueItem, memberById: Map<string, DispatchTeamMember>): string {
  if (item.assignedMemberIds.length === 0) return 'Unassigned';
  if (item.assignedMemberIds.length > 2) return `${item.assignedMemberIds.length} targets`;

  return item.assignedMemberIds
    .map((memberId) => memberById.get(memberId)?.callSign ?? 'Team')
    .join(', ');
}

function getPriorityTone(priority: DispatchPriority): string {
  switch (priority) {
    case 'critical':
      return TACTICAL.danger;
    case 'high':
      return '#D9903D';
    case 'normal':
      return TACTICAL.amber;
    case 'low':
      return TACTICAL.textMuted;
    default:
      return TACTICAL.amber;
  }
}

function formatTimeLabel(iso: string): string {
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}Z`;
}

function getContextIcon(type: DispatchLinkedContext['type']): IconName {
  switch (type) {
    case 'pin':
      return 'location-outline';
    case 'waypoint':
      return 'flag-outline';
    case 'route_segment':
      return 'git-branch-outline';
    case 'resource':
      return 'cube-outline';
    case 'vehicle':
      return 'car-outline';
    case 'power':
      return 'battery-charging-outline';
    case 'manual':
      return 'create-outline';
    default:
      return 'compass-outline';
  }
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
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  filterPill: {
    minHeight: 36,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  filterPillActive: {
    borderColor: GOLD_RAIL.section,
    backgroundColor: 'rgba(212,160,23,0.14)',
  },
  filterText: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterTextActive: {
    color: TACTICAL.amber,
  },
  contextNotice: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  contextNoticeText: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.text,
  },
  emptyCard: {
    minHeight: 116,
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
  cardStack: {
    gap: 10,
  },
  queueCard: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'rgba(12,16,20,0.5)',
  },
  queueCardCritical: {
    borderColor: 'rgba(192,57,43,0.44)',
    backgroundColor: 'rgba(192,57,43,0.075)',
  },
  queueCardQueued: {
    borderColor: 'rgba(212,160,23,0.34)',
    backgroundColor: 'rgba(212,160,23,0.07)',
  },
  queueCardRisk: {
    borderColor: 'rgba(192,57,43,0.34)',
    backgroundColor: 'rgba(192,57,43,0.07)',
  },
  queueCardReview: {
    borderColor: 'rgba(217,144,61,0.5)',
    backgroundColor: 'rgba(217,144,61,0.08)',
  },
  priorityRail: {
    width: 4,
  },
  queueBody: {
    flex: 1,
    padding: 12,
    gap: 9,
  },
  queueHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  queueTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  queueTitle: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  queueContext: {
    marginTop: 2,
    fontSize: 10,
    color: TACTICAL.amber,
    fontWeight: '700',
  },
  queueDetail: {
    fontSize: 11,
    lineHeight: 17,
    color: TACTICAL.textMuted,
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  queueFact: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 120,
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    borderRadius: 7,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  queueFactLabel: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  queueFactValue: {
    marginTop: 2,
    fontSize: 10,
    color: TACTICAL.text,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  priorityBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  priorityText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.025)',
  },
  statusText: {
    fontSize: 8,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  recommendation: {
    flex: 1,
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.text,
  },
  recommendationCard: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    backgroundColor: 'rgba(212,160,23,0.045)',
  },
  suggestionCard: {
    borderWidth: 1,
    borderColor: GOLD_RAIL.internal,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 8,
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.018)',
  },
  suggestionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  suggestionTitle: {
    fontSize: 9,
    fontWeight: '900',
    color: TACTICAL.amber,
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  suggestionRow: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 7,
    gap: 2,
  },
  suggestionLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: TACTICAL.text,
  },
  suggestionReason: {
    fontSize: 10,
    lineHeight: 14,
    color: TACTICAL.textMuted,
  },
  contextActionStrip: {
    borderTopWidth: 1,
    borderTopColor: GOLD_RAIL.internal,
    paddingTop: 8,
    gap: 7,
  },
  contextPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  contextPreviewText: {
    flex: 1,
    fontSize: 10,
    color: TACTICAL.textMuted,
    fontWeight: '800',
  },
  contextActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  contextActionPill: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: GOLD_RAIL.subsection,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(212,160,23,0.08)',
  },
  contextActionText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.text,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  queueAction: {
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
  queueActionDisabled: {
    backgroundColor: 'rgba(255,255,255,0.025)',
    opacity: 0.62,
  },
  queueActionText: {
    fontSize: 8,
    fontWeight: '900',
    color: TACTICAL.text,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  queueActionCopy: {
    gap: 1,
  },
  queueActionReason: {
    fontSize: 7,
    fontWeight: '800',
    color: TACTICAL.textMuted,
    textTransform: 'uppercase',
  },
  queueActionTextDisabled: {
    color: TACTICAL.textMuted,
  },
});
