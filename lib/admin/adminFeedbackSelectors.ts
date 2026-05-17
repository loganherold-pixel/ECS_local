import type {
  EcsFieldFeedbackEvent,
  EcsIssueAdminSummary,
  EcsIssueGroupSummary,
} from './fieldFeedbackTypes';
import {
  computeGroupConfidence,
  computeOfflineCorrelation,
  computeTrendDirection,
  maxSeverity,
  strongestIssueClass,
} from './issueSeverityResolver';

function uniqueStrings(values: (string | null | undefined)[]): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === 'string' && value.trim().length > 0))];
}

function compareSeverity(left: EcsIssueGroupSummary, right: EcsIssueGroupSummary): number {
  const order = { critical: 4, high: 3, medium: 2, low: 1 };
  if (order[right.severity] !== order[left.severity]) {
    return order[right.severity] - order[left.severity];
  }
  if (right.confidenceScore !== left.confidenceScore) {
    return right.confidenceScore - left.confidenceScore;
  }
  if (right.eventCount !== left.eventCount) {
    return right.eventCount - left.eventCount;
  }
  return Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
}

function compareFreshness(left: EcsIssueGroupSummary, right: EcsIssueGroupSummary): number {
  return Date.parse(right.lastSeen) - Date.parse(left.lastSeen);
}

function topContextTags(events: EcsFieldFeedbackEvent[]): Record<string, string | null> {
  const pickMostCommon = (values: (string | null | undefined)[]): string | null => {
    const counts = new Map<string, number>();
    values.forEach((value) => {
      if (!value) return;
      counts.set(value, (counts.get(value) ?? 0) + 1);
    });

    let top: string | null = null;
    let topCount = 0;
    counts.forEach((count, value) => {
      if (count > topCount) {
        top = value;
        topCount = count;
      }
    });
    return top;
  };

  return {
    activeTab: pickMostCommon(events.map((event) => event.runtimeContext.activeTab)),
    routeState: pickMostCommon(events.map((event) => event.runtimeContext.routeState)),
    gpsState: pickMostCommon(events.map((event) => event.runtimeContext.gpsState)),
    connectivityState: pickMostCommon(events.map((event) => event.runtimeContext.connectivityState)),
    expeditionPhase: pickMostCommon(events.map((event) => event.runtimeContext.expeditionPhase)),
    degradedState: pickMostCommon(events.map((event) => event.runtimeContext.degradedState)),
    providerFamily: pickMostCommon(events.map((event) => event.providerFamily)),
  };
}

function groupTitle(events: EcsFieldFeedbackEvent[]): string {
  const explicitFieldReport = events.find((event) => event.eventType === 'field_report' && event.issueTitle);
  if (explicitFieldReport) return explicitFieldReport.issueTitle;

  const mostRecent = [...events].sort((left, right) => Date.parse(right.occurredAt) - Date.parse(left.occurredAt))[0];
  return mostRecent?.issueTitle ?? 'Grouped ECS field issue';
}

export function summarizeGroupedEvents(
  groupedEvents: Map<string, EcsFieldFeedbackEvent[]>,
  latestVersion: string | null,
): EcsIssueGroupSummary[] {
  const groups: EcsIssueGroupSummary[] = [];

  groupedEvents.forEach((events, signature) => {
    const ordered = [...events].sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
    const first = ordered[0];
    const last = ordered[ordered.length - 1];
    if (!first || !last) return;

    const confidence = computeGroupConfidence(events);
    const offlineCorrelation = computeOfflineCorrelation(events);
    const uniqueUsers = new Set(events.map((event) => event.hashedUserId).filter(Boolean));
    const uniqueSessions = new Set(events.map((event) => event.hashedSessionId).filter(Boolean));
    const appVersionsAffected = uniqueStrings(events.map((event) => event.runtimeContext.appVersion));
    const buildVersionsAffected = uniqueStrings(events.map((event) => event.runtimeContext.buildVersion));
    const providerFamilies = uniqueStrings(events.map((event) => event.providerFamily));
    const affectedSurfaces = uniqueStrings(events.flatMap((event) => event.affectedSurfaces));
    const trendDirection = computeTrendDirection(events);

    groups.push({
      signature,
      title: groupTitle(events),
      issueType: last.eventType,
      severity: maxSeverity(events),
      ecsArea: first.ecsArea,
      issueFamily: first.issueFamily,
      issueClass: strongestIssueClass(events),
      confidenceLabel: confidence.label,
      confidenceScore: Number(confidence.score.toFixed(2)),
      appVersionsAffected,
      buildVersionsAffected,
      usersImpactedCount: uniqueUsers.size,
      sessionsImpactedCount: uniqueSessions.size,
      eventCount: events.length,
      recurrenceCount: events.length,
      firstSeen: first.occurredAt,
      lastSeen: last.occurredAt,
      trendDirection,
      releaseRegression: Boolean(latestVersion && appVersionsAffected.includes(latestVersion) && (trendDirection === 'up' || trendDirection === 'new')),
      topContextTags: topContextTags(events),
      affectedSurfaces,
      providerFamilies,
      degradedOrOfflineRate: Number(offlineCorrelation.rate.toFixed(2)),
      offlineCorrelation: offlineCorrelation.label,
    });
  });

  return groups.sort(compareSeverity);
}

export function buildAdminFeedbackSummary(
  events: EcsFieldFeedbackEvent[],
  latestVersion: string | null,
): EcsIssueAdminSummary {
  const groupedEvents = new Map<string, EcsFieldFeedbackEvent[]>();

  events.forEach((event) => {
    const key = event.groupingSignature || event.rootConditionKey || event.normalizedSignature;
    const group = groupedEvents.get(key) ?? [];
    group.push(event);
    groupedEvents.set(key, group);
  });

  const groups = summarizeGroupedEvents(groupedEvents, latestVersion);
  const frequentIssues = [...groups].sort((left, right) => right.eventCount - left.eventCount || compareSeverity(left, right)).slice(0, 8);
  const newSinceLatestRelease = groups.filter((group) => group.trendDirection === 'new' || group.releaseRegression).sort(compareFreshness).slice(0, 8);
  const regressions = groups.filter((group) => group.releaseRegression).sort(compareSeverity).slice(0, 8);
  const trendingUp = groups.filter((group) => group.trendDirection === 'up' || group.trendDirection === 'new').sort(compareSeverity).slice(0, 8);
  const trendingDown = groups.filter((group) => group.trendDirection === 'down').sort(compareFreshness).slice(0, 8);
  const resolvedOrQuieted = groups.filter((group) => group.trendDirection === 'quieted').sort(compareFreshness).slice(0, 8);
  const severeActive = groups.filter((group) => group.severity === 'critical' || group.severity === 'high').sort(compareSeverity).slice(0, 8);

  return {
    latestVersion,
    groups,
    frequentIssues,
    newSinceLatestRelease,
    regressions,
    trendingUp,
    trendingDown,
    resolvedOrQuieted,
    severeActive,
  };
}
