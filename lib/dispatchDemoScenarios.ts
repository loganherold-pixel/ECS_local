import {
  MOCK_DISPATCH_ASSIGNMENTS,
  MOCK_DISPATCH_CONTEXTS,
  MOCK_DISPATCH_PINGS,
  MOCK_DISPATCH_QUEUE_ITEMS,
  MOCK_DISPATCH_TEAM_MEMBERS,
  MOCK_DISPATCH_TIMELINE_EVENTS,
} from './dispatchMockData';
import type {
  DispatchAssignment,
  DispatchLinkedContext,
  DispatchPing,
  DispatchQueueItem,
  DispatchTeamMember,
  DispatchTimelineEvent,
} from './dispatchTypes';

/**
 * Demo-only Dispatch scenarios for product, QA, and development.
 *
 * These records are deterministic, local-only seed data. They must not trigger
 * live notifications, external messaging, emergency services, or backend writes.
 */

export type DispatchDemoScenarioId =
  | 'solo_expedition'
  | 'team_all_online'
  | 'team_one_offline'
  | 'pending_check_in'
  | 'hazard_broadcast'
  | 'assist_request'
  | 'emergency_ping'
  | 'resource_check'
  | 'route_check'
  | 'queued_offline_ping'
  | 'failed_delivery'
  | 'recovered_after_reconnect'
  | 'escalated_queue_item'
  | 'resolved_queue_item'
  | 'permission_restricted_member';

export interface DispatchDemoScenario {
  id: DispatchDemoScenarioId;
  title: string;
  description: string;
  demoOnly: true;
  notificationSafe: true;
  externalCommunication: false;
  contexts: DispatchLinkedContext[];
  teamMembers: DispatchTeamMember[];
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  assignments: DispatchAssignment[];
  timelineEvents: DispatchTimelineEvent[];
}

const DEMO_NOW = '2026-04-24T19:15:00Z';
const DEMO_EXPEDITION_CONTEXT: DispatchLinkedContext = {
  ...MOCK_DISPATCH_CONTEXTS.expedition,
  id: 'demo-expedition-ruby-ridge',
  title: 'Demo Ruby Ridge Field Loop',
  subtitle: 'Demo-only Expedition Channel',
  metadata: {
    demoOnly: true,
    externalCommunication: false,
  },
};

const BASE_CONTEXTS = Object.values(MOCK_DISPATCH_CONTEXTS).map((context) =>
  context.id === MOCK_DISPATCH_CONTEXTS.expedition.id ? DEMO_EXPEDITION_CONTEXT : context,
);

function replaceExpeditionContext(member: DispatchTeamMember): DispatchTeamMember {
  return member.currentContext?.type === 'expedition'
    ? { ...member, currentContext: DEMO_EXPEDITION_CONTEXT }
    : { ...member };
}

function createBaseTeam(): DispatchTeamMember[] {
  return MOCK_DISPATCH_TEAM_MEMBERS.map(replaceExpeditionContext);
}

function createAllOnlineTeam(): DispatchTeamMember[] {
  return createBaseTeam().map((member, index) => ({
    ...member,
    status: index === 0 ? 'connected' : index === 1 ? 'on_route' : index === 2 ? 'at_waypoint' : 'connected',
    syncState: index === 0 ? 'delivered' : 'seen',
    lastSeenAt: ['2026-04-24T19:12:00Z', '2026-04-24T19:11:00Z', '2026-04-24T19:10:00Z', '2026-04-24T19:09:00Z', '2026-04-24T19:08:00Z'][index],
    notes: `${member.callSign} active in demo Expedition Channel.`,
  }));
}

function createSoloTeam(): DispatchTeamMember[] {
  return [
    {
      ...MOCK_DISPATCH_TEAM_MEMBERS[0],
      id: 'demo-solo-operator',
      displayName: 'Solo Demo Operator',
      callSign: 'Command',
      role: 'owner',
      status: 'connected',
      lastSeenAt: '2026-04-24T19:12:00Z',
      currentContext: DEMO_EXPEDITION_CONTEXT,
      syncState: 'delivered',
      notes: 'Demo solo expedition operator. No live team members are present.',
    },
  ];
}

function createPermissionRestrictedTeam(): DispatchTeamMember[] {
  return createBaseTeam().map((member) =>
    member.id === 'member-owen'
      ? {
          ...member,
          role: 'viewer',
          status: 'unavailable',
          syncState: 'queued',
          coordinates: undefined,
          notes: 'Demo restricted member. Location and contact details should remain permission-gated.',
        }
      : member,
  );
}

function clonePing(ping: DispatchPing, patch: Partial<DispatchPing>): DispatchPing {
  return { ...ping, ...patch };
}

function cloneQueueItem(item: DispatchQueueItem, patch: Partial<DispatchQueueItem>): DispatchQueueItem {
  return { ...item, ...patch };
}

function cloneTimelineEvent(
  event: DispatchTimelineEvent,
  patch: Partial<DispatchTimelineEvent>,
): DispatchTimelineEvent {
  return { ...event, ...patch };
}

function scenario(
  id: DispatchDemoScenarioId,
  title: string,
  description: string,
  data: {
    teamMembers?: DispatchTeamMember[];
    pings?: DispatchPing[];
    queueItems?: DispatchQueueItem[];
    assignments?: DispatchAssignment[];
    timelineEvents?: DispatchTimelineEvent[];
  },
): DispatchDemoScenario {
  return {
    id,
    title,
    description,
    demoOnly: true,
    notificationSafe: true,
    externalCommunication: false,
    contexts: BASE_CONTEXTS,
    teamMembers: data.teamMembers ?? createBaseTeam(),
    pings: data.pings ?? MOCK_DISPATCH_PINGS,
    queueItems: data.queueItems ?? MOCK_DISPATCH_QUEUE_ITEMS,
    assignments: data.assignments ?? MOCK_DISPATCH_ASSIGNMENTS,
    timelineEvents: data.timelineEvents ?? MOCK_DISPATCH_TIMELINE_EVENTS,
  };
}

const pendingCheckInPing = clonePing(MOCK_DISPATCH_PINGS[0], {
  id: 'demo-ping-pending-check-in',
  type: 'check_in',
  priority: 'high',
  status: 'sent',
  message: 'Confirm your current status before the next route segment.',
  createdAt: '2026-04-24T19:00:00Z',
  targetMemberIds: ['member-nia', 'member-owen'],
  requiresAcknowledgment: true,
  checkInType: 'manual',
  responseDueAt: '2026-04-24T19:20:00Z',
  acknowledgedByMemberIds: ['member-nia'],
  escalationState: 'follow_up',
});

const queuedOfflinePing = clonePing(MOCK_DISPATCH_PINGS[0], {
  id: 'demo-ping-queued-offline',
  idempotencyKey: 'demo:ping:queued-offline',
  type: 'general',
  priority: 'normal',
  status: 'queued',
  message: 'Offline demo ping queued for delivery.',
  createdAt: '2026-04-24T19:02:00Z',
  targetMemberIds: ['member-owen'],
  escalationState: 'monitor',
  reliabilityState: 'queued',
});

const failedDeliveryPing = clonePing(queuedOfflinePing, {
  id: 'demo-ping-failed-delivery',
  idempotencyKey: 'demo:ping:failed-delivery',
  status: 'failed',
  message: 'Failed delivery demo ping. Retry should not duplicate this record.',
  reliabilityState: 'failed',
});

const recoveredPing = clonePing(queuedOfflinePing, {
  id: 'demo-ping-recovered',
  idempotencyKey: 'demo:ping:recovered',
  status: 'recovered',
  message: 'Recovered after reconnect demo ping.',
  updatedAt: DEMO_NOW,
  reliabilityState: 'recovered',
});

const emergencyPing = clonePing(MOCK_DISPATCH_PINGS[4], {
  id: 'demo-ping-emergency',
  type: 'emergency',
  priority: 'critical',
  status: 'sent',
  message: 'Demo emergency ping. ECS team coordination only. Acknowledge now.',
  createdAt: '2026-04-24T19:04:00Z',
  targetMemberIds: ['member-logan', 'member-mara', 'member-ellis', 'member-nia'],
  escalationState: 'emergency_unresolved',
  requiresAcknowledgment: true,
  responseDueAt: '2026-04-24T19:09:00Z',
});

const resolvedQueueItem = cloneQueueItem(MOCK_DISPATCH_QUEUE_ITEMS[1], {
  id: 'demo-queue-resolved-check-in',
  title: 'Resolved rally check-in',
  status: 'resolved',
  priority: 'normal',
  updatedAt: '2026-04-24T19:07:00Z',
  escalationState: 'resolved',
  deliveryState: 'acknowledged',
});

const escalatedQueueItem = cloneQueueItem(MOCK_DISPATCH_QUEUE_ITEMS[4], {
  id: 'demo-queue-escalated-tail-assist',
  title: 'Escalated tail assist demo',
  status: 'escalated',
  priority: 'critical',
  updatedAt: '2026-04-24T19:08:00Z',
  escalationState: 'broadcast_to_team',
  deliveryState: 'escalated',
});

export const DISPATCH_DEMO_SCENARIOS: Record<DispatchDemoScenarioId, DispatchDemoScenario> = {
  solo_expedition: scenario(
    'solo_expedition',
    'Solo expedition',
    'One local operator, no live team roster, and a minimal local Dispatch surface.',
    {
      teamMembers: createSoloTeam(),
      pings: [],
      queueItems: [],
      assignments: [],
      timelineEvents: [
        {
          id: 'demo-timeline-solo-ready',
          type: 'status',
          title: 'Solo Dispatch ready',
          detail: 'Demo solo expedition initialized with local-only coordination.',
          occurredAt: '2026-04-24T19:00:00Z',
          priority: 'normal',
          memberIds: ['demo-solo-operator'],
          actor: 'Dispatch',
          target: 'Command',
          linkedContext: DEMO_EXPEDITION_CONTEXT,
          deliveryState: 'delivered',
          escalationState: 'none',
        },
      ],
    },
  ),
  team_all_online: scenario(
    'team_all_online',
    'Team expedition: all online',
    'Five demo members are active and recently seen with no offline risk.',
    {
      teamMembers: createAllOnlineTeam(),
      pings: MOCK_DISPATCH_PINGS.map((ping) => ({ ...ping, status: 'delivered', reliabilityState: 'live' })),
      queueItems: MOCK_DISPATCH_QUEUE_ITEMS.map((item) => ({ ...item, deliveryState: 'delivered', reliabilityState: 'live' })),
    },
  ),
  team_one_offline: scenario(
    'team_one_offline',
    'Team expedition: one offline member',
    'Tail is offline while the rest of the team remains reachable.',
    {},
  ),
  pending_check_in: scenario(
    'pending_check_in',
    'Pending check-in',
    'Manual check-in request awaiting one member response.',
    {
      pings: [pendingCheckInPing],
      queueItems: [
        cloneQueueItem(MOCK_DISPATCH_QUEUE_ITEMS[1], {
          id: 'demo-queue-pending-check-in',
          title: 'Pending team check-in',
          status: 'pending_response',
          sourcePingId: pendingCheckInPing.id,
          deliveryState: 'sent',
          escalationState: 'follow_up',
        }),
      ],
      timelineEvents: [
        cloneTimelineEvent(MOCK_DISPATCH_TIMELINE_EVENTS[2], {
          id: 'demo-timeline-pending-check-in',
          title: 'Check-in requested',
          detail: 'Demo check-in sent to Quartermaster and Tail.',
          pingId: pendingCheckInPing.id,
          deliveryState: 'sent',
          escalationState: 'follow_up',
        }),
      ],
    },
  ),
  hazard_broadcast: scenario(
    'hazard_broadcast',
    'Hazard broadcast',
    'Critical hazard broadcast tied to a map pin and active queue item.',
    {
      pings: [MOCK_DISPATCH_PINGS[1]],
      queueItems: [MOCK_DISPATCH_QUEUE_ITEMS[0]],
      assignments: [MOCK_DISPATCH_ASSIGNMENTS[0]],
      timelineEvents: [MOCK_DISPATCH_TIMELINE_EVENTS[1]],
    },
  ),
  assist_request: scenario(
    'assist_request',
    'Assist request',
    'Support request for a tail vehicle comms gap. ECS team coordination only.',
    {
      pings: [MOCK_DISPATCH_PINGS[4]],
      queueItems: [MOCK_DISPATCH_QUEUE_ITEMS[4]],
      timelineEvents: [MOCK_DISPATCH_TIMELINE_EVENTS[5]],
    },
  ),
  emergency_ping: scenario(
    'emergency_ping',
    'Emergency ping',
    'Critical demo emergency ping. ECS team coordination only; no external services are contacted.',
    {
      pings: [emergencyPing],
      queueItems: [
        cloneQueueItem(MOCK_DISPATCH_QUEUE_ITEMS[4], {
          id: 'demo-queue-emergency-ping',
          title: 'Emergency ping acknowledgment',
          status: 'escalated',
          sourcePingId: emergencyPing.id,
          deliveryState: 'escalated',
          escalationState: 'emergency_unresolved',
        }),
      ],
      timelineEvents: [
        cloneTimelineEvent(MOCK_DISPATCH_TIMELINE_EVENTS[5], {
          id: 'demo-timeline-emergency-ping',
          title: 'Emergency ping sent',
          detail: 'Demo emergency ping sent for ECS team coordination only.',
          pingId: emergencyPing.id,
          priority: 'critical',
          deliveryState: 'sent',
          escalationState: 'emergency_unresolved',
        }),
      ],
    },
  ),
  resource_check: scenario(
    'resource_check',
    'Resource check',
    'Fuel, water, and power status request before camp push.',
    {
      pings: [MOCK_DISPATCH_PINGS[2]],
      queueItems: [MOCK_DISPATCH_QUEUE_ITEMS[2], MOCK_DISPATCH_QUEUE_ITEMS[5]],
      assignments: [MOCK_DISPATCH_ASSIGNMENTS[1], MOCK_DISPATCH_ASSIGNMENTS[2]],
      timelineEvents: [MOCK_DISPATCH_TIMELINE_EVENTS[3], MOCK_DISPATCH_TIMELINE_EVENTS[6]],
    },
  ),
  route_check: scenario(
    'route_check',
    'Route check',
    'Route scout flow for the North Spur Connector.',
    {
      pings: [MOCK_DISPATCH_PINGS[3]],
      queueItems: [MOCK_DISPATCH_QUEUE_ITEMS[3]],
      assignments: [MOCK_DISPATCH_ASSIGNMENTS[0]],
      timelineEvents: [MOCK_DISPATCH_TIMELINE_EVENTS[0]],
    },
  ),
  queued_offline_ping: scenario(
    'queued_offline_ping',
    'Queued offline ping',
    'A local ping is queued for delivery while connectivity is unavailable.',
    {
      pings: [queuedOfflinePing],
      queueItems: [
        cloneQueueItem(MOCK_DISPATCH_QUEUE_ITEMS[1], {
          id: 'demo-queue-queued-offline',
          title: 'Queued offline ping',
          status: 'pending_response',
          sourcePingId: queuedOfflinePing.id,
          deliveryState: 'queued',
          reliabilityState: 'queued',
        }),
      ],
      timelineEvents: [
        cloneTimelineEvent(MOCK_DISPATCH_TIMELINE_EVENTS[7], {
          id: 'demo-timeline-queued-offline',
          title: 'Demo ping queued',
          pingId: queuedOfflinePing.id,
          deliveryState: 'queued',
          escalationState: 'monitor',
        }),
      ],
    },
  ),
  failed_delivery: scenario(
    'failed_delivery',
    'Failed delivery',
    'A failed ping and queue update for retry/recovery validation.',
    {
      pings: [failedDeliveryPing],
      queueItems: [
        cloneQueueItem(MOCK_DISPATCH_QUEUE_ITEMS[1], {
          id: 'demo-queue-failed-delivery',
          title: 'Failed delivery retry target',
          sourcePingId: failedDeliveryPing.id,
          deliveryState: 'failed',
          reliabilityState: 'failed',
        }),
      ],
      timelineEvents: [
        cloneTimelineEvent(MOCK_DISPATCH_TIMELINE_EVENTS[7], {
          id: 'demo-timeline-failed-delivery',
          title: 'Delivery failed',
          detail: 'Demo delivery failed. Retry should reuse the same idempotency key.',
          pingId: failedDeliveryPing.id,
          deliveryState: 'failed',
        }),
      ],
    },
  ),
  recovered_after_reconnect: scenario(
    'recovered_after_reconnect',
    'Recovered after reconnect',
    'A previously queued ping recovered after sync returned.',
    {
      pings: [recoveredPing],
      queueItems: [
        cloneQueueItem(MOCK_DISPATCH_QUEUE_ITEMS[1], {
          id: 'demo-queue-recovered',
          title: 'Recovered delivery',
          sourcePingId: recoveredPing.id,
          deliveryState: 'recovered',
          reliabilityState: 'recovered',
        }),
      ],
      timelineEvents: [
        cloneTimelineEvent(MOCK_DISPATCH_TIMELINE_EVENTS[7], {
          id: 'demo-timeline-recovered',
          title: 'Recovered after reconnect',
          detail: 'Demo queued Dispatch update recovered after reconnect.',
          pingId: recoveredPing.id,
          deliveryState: 'recovered',
        }),
      ],
    },
  ),
  escalated_queue_item: scenario(
    'escalated_queue_item',
    'Escalated queue item',
    'A critical queue item escalated to team broadcast.',
    {
      queueItems: [escalatedQueueItem],
      timelineEvents: [
        cloneTimelineEvent(MOCK_DISPATCH_TIMELINE_EVENTS[1], {
          id: 'demo-timeline-escalated-queue',
          title: 'Queue item escalated',
          queueItemId: escalatedQueueItem.id,
          escalationState: 'broadcast_to_team',
          deliveryState: 'escalated',
        }),
      ],
    },
  ),
  resolved_queue_item: scenario(
    'resolved_queue_item',
    'Resolved queue item',
    'A completed queue item retained in history instead of being deleted.',
    {
      queueItems: [resolvedQueueItem],
      timelineEvents: [
        cloneTimelineEvent(MOCK_DISPATCH_TIMELINE_EVENTS[2], {
          id: 'demo-timeline-resolved-queue',
          type: 'queue_resolved',
          title: 'Queue item resolved',
          detail: 'Demo rally check-in resolved and retained for review.',
          queueItemId: resolvedQueueItem.id,
          deliveryState: 'acknowledged',
          escalationState: 'resolved',
        }),
      ],
    },
  ),
  permission_restricted_member: scenario(
    'permission_restricted_member',
    'Permission-restricted member',
    'Viewer/restricted member state for privacy and permission QA.',
    {
      teamMembers: createPermissionRestrictedTeam(),
      pings: [],
      queueItems: [],
      assignments: [],
      timelineEvents: [
        {
          id: 'demo-timeline-permission-restricted',
          type: 'log',
          title: 'Restricted member demo',
          detail: 'Location and contact details for Tail should remain restricted unless permission allows them.',
          occurredAt: '2026-04-24T19:10:00Z',
          priority: 'normal',
          memberIds: ['member-owen'],
          actor: 'Dispatch',
          target: 'Tail',
          linkedContext: DEMO_EXPEDITION_CONTEXT,
          deliveryState: 'delivered',
          escalationState: 'none',
        },
      ],
    },
  ),
};

export const DISPATCH_DEMO_SCENARIO_IDS: DispatchDemoScenarioId[] = [
  'solo_expedition',
  'team_all_online',
  'team_one_offline',
  'pending_check_in',
  'hazard_broadcast',
  'assist_request',
  'emergency_ping',
  'resource_check',
  'route_check',
  'queued_offline_ping',
  'failed_delivery',
  'recovered_after_reconnect',
  'escalated_queue_item',
  'resolved_queue_item',
  'permission_restricted_member',
];

export function getDispatchDemoScenario(id: DispatchDemoScenarioId): DispatchDemoScenario {
  return DISPATCH_DEMO_SCENARIOS[id];
}

export function listDispatchDemoScenarios(): DispatchDemoScenario[] {
  return DISPATCH_DEMO_SCENARIO_IDS.map((id) => DISPATCH_DEMO_SCENARIOS[id]);
}
