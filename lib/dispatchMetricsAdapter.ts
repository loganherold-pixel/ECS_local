import type {
  DispatchPing,
  DispatchQueueItem,
  DispatchTeamMember,
  DispatchTimelineEvent,
} from './dispatchTypes';
import { filterAvailableTeamMembers } from './dispatchTypes';
import { shouldSuggestEscalation } from './dispatchEscalationAdapter';

export interface DispatchMetrics {
  activeQueueItems: number;
  awaitingResponses: number;
  escalations: number;
  offlineStaleMembers: number;
  availableMembers: number;
  averageAcknowledgmentMinutes: number | null;
  unresolvedAssistRequests: number;
  failedQueuedDeliveries: number;
  queuedDeliveries: number;
  failedDeliveries: number;
  retryingDeliveries: number;
  resourceCheckRequests: number;
  routeCheckRequests: number;
  resolvedQueueItems: number;
  criticalOpenItems: number;
  teamReadiness: number;
  dispatchLoad: number;
  communicationHealth: number;
  offlineRisk: number;
  escalationPressure: number;
}

export interface DispatchReadinessSummary {
  teamReadinessLabel: string;
  dispatchLoadLabel: string;
  communicationHealthLabel: string;
  offlineRiskLabel: string;
  escalationPressureLabel: string;
}

const AWAITING_PING_STATUSES = new Set<DispatchPing['status']>([
  'sent',
  'delivered',
  'seen',
  'no_response',
  'escalated',
]);

const AWAITING_QUEUE_STATUSES = new Set<DispatchQueueItem['status']>([
  'pending_response',
  'blocked',
  'escalated',
]);

export function calculateDispatchMetrics(input: {
  pings: DispatchPing[];
  queueItems: DispatchQueueItem[];
  teamMembers: DispatchTeamMember[];
  timelineEvents?: DispatchTimelineEvent[];
}): DispatchMetrics {
  const activeQueue = input.queueItems.filter((item) => !isClosedQueueItem(item));
  const availableMembers = filterAvailableTeamMembers(input.teamMembers);
  const awaitingResponses =
    input.pings.filter((ping) => AWAITING_PING_STATUSES.has(ping.status)).length +
    input.queueItems.filter((item) => AWAITING_QUEUE_STATUSES.has(item.status)).length;
  const escalations = input.queueItems.filter((item) => {
    const ping = item.sourcePingId ? input.pings.find((candidate) => candidate.id === item.sourcePingId) : undefined;
    return isVisibleEscalation(item) || shouldSuggestEscalation({ queueItem: item, ping }).shouldSuggest;
  }).length;
  const offlineStaleMembers = input.teamMembers.filter((member) =>
    member.status === 'offline' ||
    member.status === 'no_response' ||
    member.status === 'needs_check_in',
  ).length;
  const queuedDeliveries =
    input.pings.filter((ping) => ping.status === 'queued' || ping.status === 'no_response').length +
    input.queueItems.filter((item) => item.deliveryState === 'queued' || item.deliveryState === 'no_response').length;
  const failedDeliveries =
    input.pings.filter((ping) => ping.status === 'failed' || ping.reliabilityState === 'failed').length +
    input.queueItems.filter((item) => item.deliveryState === 'failed' || item.reliabilityState === 'failed').length +
    (input.timelineEvents ?? []).filter((event) => event.deliveryState === 'failed').length;
  const retryingDeliveries =
    input.pings.filter((ping) => ping.status === 'retrying' || ping.reliabilityState === 'retrying').length +
    input.queueItems.filter((item) => item.deliveryState === 'retrying' || item.reliabilityState === 'retrying').length +
    (input.timelineEvents ?? []).filter((event) => event.deliveryState === 'retrying').length;
  const unresolvedAssistRequests = activeQueue.filter((item) => item.tags?.includes('assist')).length;
  const resourceCheckRequests = input.queueItems.filter((item) =>
    item.tags?.includes('resource') ||
    item.tags?.includes('power') ||
    item.linkedContext.type === 'resource' ||
    item.linkedContext.type === 'power',
  ).length;
  const routeCheckRequests = input.queueItems.filter((item) =>
    item.tags?.includes('route') ||
    item.linkedContext.type === 'route_segment' ||
    item.linkedContext.type === 'waypoint',
  ).length;
  const resolvedQueueItems = input.queueItems.filter((item) => item.status === 'resolved').length;
  const criticalOpenItems = activeQueue.filter((item) => item.priority === 'critical').length;
  const averageAcknowledgmentMinutes = calculateAverageAcknowledgmentMinutes(input.pings);

  const base = {
    activeQueueItems: activeQueue.length,
    awaitingResponses,
    escalations,
    offlineStaleMembers,
    availableMembers: availableMembers.length,
    averageAcknowledgmentMinutes,
    unresolvedAssistRequests,
    failedQueuedDeliveries: queuedDeliveries + failedDeliveries + retryingDeliveries,
    queuedDeliveries,
    failedDeliveries,
    retryingDeliveries,
    resourceCheckRequests,
    routeCheckRequests,
    resolvedQueueItems,
    criticalOpenItems,
  };

  return {
    ...base,
    teamReadiness: calculateTeamReadiness({
      availableMembers: base.availableMembers,
      totalMembers: input.teamMembers.length,
      offlineStaleMembers,
    }),
    dispatchLoad: calculateDispatchLoad(base.activeQueueItems, base.criticalOpenItems),
    communicationHealth: calculateCommunicationHealth({
      awaitingResponses,
      failedQueuedDeliveries: base.failedQueuedDeliveries,
      averageAcknowledgmentMinutes,
    }),
    offlineRisk: calculateOfflineRisk({
      offlineStaleMembers,
      totalMembers: input.teamMembers.length,
      failedQueuedDeliveries: base.failedQueuedDeliveries,
    }),
    escalationPressure: calculateEscalationPressure({
      escalations,
      criticalOpenItems,
      activeQueueItems: base.activeQueueItems,
    }),
  };
}

export function calculateTeamReadiness(input: {
  availableMembers: number;
  totalMembers: number;
  offlineStaleMembers: number;
}): number {
  if (input.totalMembers === 0) return 0;
  const availability = input.availableMembers / input.totalMembers;
  const stalePenalty = input.offlineStaleMembers / input.totalMembers;
  return clampScore(Math.round((availability - stalePenalty * 0.35) * 100));
}

export function calculateCommunicationHealth(input: {
  awaitingResponses: number;
  failedQueuedDeliveries: number;
  averageAcknowledgmentMinutes: number | null;
}): number {
  const ackPenalty = input.averageAcknowledgmentMinutes == null
    ? 0
    : Math.min(25, input.averageAcknowledgmentMinutes * 1.5);
  return clampScore(100 - input.awaitingResponses * 8 - input.failedQueuedDeliveries * 12 - ackPenalty);
}

export function calculateOfflineRisk(input: {
  offlineStaleMembers: number;
  totalMembers: number;
  failedQueuedDeliveries: number;
}): number {
  if (input.totalMembers === 0) return 0;
  const memberRisk = (input.offlineStaleMembers / input.totalMembers) * 70;
  return clampScore(Math.round(memberRisk + input.failedQueuedDeliveries * 8));
}

export function calculateEscalationPressure(input: {
  escalations: number;
  criticalOpenItems: number;
  activeQueueItems: number;
}): number {
  if (input.activeQueueItems === 0) return 0;
  return clampScore(Math.round((input.escalations * 18 + input.criticalOpenItems * 22) / Math.max(1, input.activeQueueItems) * 2));
}

export function calculateDispatchLoad(activeQueueItems: number, criticalOpenItems: number): number {
  return clampScore(activeQueueItems * 10 + criticalOpenItems * 14);
}

export function getDispatchReadinessSummary(metrics: DispatchMetrics): DispatchReadinessSummary {
  return {
    teamReadinessLabel: labelScore(metrics.teamReadiness, 'Ready', 'Watch', 'Thin'),
    dispatchLoadLabel: labelPressure(metrics.dispatchLoad, 'Light', 'Moderate', 'Heavy'),
    communicationHealthLabel: labelScore(metrics.communicationHealth, 'Healthy', 'Delayed', 'Poor'),
    offlineRiskLabel: labelPressure(metrics.offlineRisk, 'Low', 'Guarded', 'High'),
    escalationPressureLabel: labelPressure(metrics.escalationPressure, 'Low', 'Active', 'High'),
  };
}

function calculateAverageAcknowledgmentMinutes(pings: DispatchPing[]): number | null {
  const durations = pings.flatMap((ping) => {
    if (!ping.checkInResponses?.length) return [];
    const createdAt = Date.parse(ping.createdAt);
    if (!Number.isFinite(createdAt)) return [];
    return ping.checkInResponses
      .map((response) => Date.parse(response.respondedAt) - createdAt)
      .filter((duration) => Number.isFinite(duration) && duration >= 0)
      .map((duration) => duration / 60_000);
  });

  if (durations.length === 0) return null;
  const average = durations.reduce((sum, value) => sum + value, 0) / durations.length;
  return Math.round(average * 10) / 10;
}

function isClosedQueueItem(item: DispatchQueueItem): boolean {
  return item.status === 'resolved' || item.status === 'cancelled';
}

function isVisibleEscalation(item: DispatchQueueItem): boolean {
  return item.escalationState !== 'none' && item.escalationState !== 'monitor' && item.escalationState !== 'recovered' && item.escalationState !== 'resolved';
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function labelScore(value: number, high: string, mid: string, low: string): string {
  if (value >= 75) return high;
  if (value >= 45) return mid;
  return low;
}

function labelPressure(value: number, low: string, mid: string, high: string): string {
  if (value >= 70) return high;
  if (value >= 35) return mid;
  return low;
}
