import type { ECSBriefSeverity } from './ai/ecsBriefTypes';
import { recordBriefCadEntry } from './briefCadLogStore';
import {
  guardRouteIntelligenceCopy,
  type RouteIntelligenceIssue,
  type RouteIntelligenceSummary,
} from './ecs5RouteIntelligence';

export const ROUTE_BRIEF_SUPPRESSION_MS = 15 * 60 * 1000;

export type RouteBriefAdvisory = {
  kind: string;
  severity: ECSBriefSeverity;
  title: string;
  message: string;
  recommendedAction: string;
  routeId: string;
  sourceLine: string;
  confidence: number;
};

export type RouteBriefPublishResult = {
  emitted: boolean;
  reason: 'emitted' | 'no_actionable_route_issue' | 'duplicate_suppressed' | 'severity_escalation' | 'meaningful_change';
  advisory?: RouteBriefAdvisory;
};

type RecentRouteBriefAdvisory = {
  at: number;
  severity: ECSBriefSeverity;
  messageFingerprint: string;
};

const recentRouteBriefAdvisories = new Map<string, RecentRouteBriefAdvisory>();

const SEVERITY_RANK: Record<ECSBriefSeverity, number> = {
  info: 1,
  watch: 2,
  warning: 3,
  critical: 4,
};

function issueSeverity(issue: RouteIntelligenceIssue): ECSBriefSeverity {
  switch (issue.severity) {
    case 'blocker':
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'info':
    default:
      return 'info';
  }
}

function issuePriority(issue: RouteIntelligenceIssue): number {
  switch (issue.severity) {
    case 'blocker':
      return 1;
    case 'critical':
      return 2;
    case 'warning':
      return 3;
    case 'info':
    default:
      return 4;
  }
}

function severityToMode(severity: ECSBriefSeverity): 'alert' | 'advisory' {
  return severity === 'critical' || severity === 'warning' ? 'alert' : 'advisory';
}

function severityToPriority(severity: ECSBriefSeverity): number {
  switch (severity) {
    case 'critical':
      return 1;
    case 'warning':
      return 2;
    case 'watch':
      return 3;
    case 'info':
    default:
      return 4;
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function routeScopeKey(advisory: RouteBriefAdvisory): string {
  return [
    advisory.routeId,
    advisory.kind,
  ].map((part) => normalizeText(part)).join('|');
}

function messageFingerprint(advisory: RouteBriefAdvisory): string {
  return [
    advisory.title,
    advisory.message,
    advisory.recommendedAction,
    advisory.sourceLine,
  ].map(normalizeText).join('|');
}

function pruneExpired(now: number): void {
  for (const [key, event] of recentRouteBriefAdvisories) {
    if (now - event.at > ROUTE_BRIEF_SUPPRESSION_MS) {
      recentRouteBriefAdvisories.delete(key);
    }
  }
}

function formatRecommendation(value: RouteIntelligenceIssue['recommendedAction']): string {
  switch (value) {
    case 'do_not_travel':
      return 'Hold route until current official status is verified.';
    case 'reroute':
      return 'Use a lower-risk route or reassess after conditions update.';
    case 'delay':
      return 'Delay launch or reassess timing against current conditions.';
    case 'verify':
      return 'Verify access and conditions with current source data.';
    case 'use_bailout':
      return 'Review the selected bailout before committing.';
    case 'manual_review_required':
      return 'Manual review required before operational reliance.';
    case 'proceed_with_caution':
      return 'Proceed only with field verification and alternate options.';
    case 'proceed':
    case 'unknown':
    default:
      return 'Monitor route sources and ECS confidence before launch.';
  }
}

function sourceLine(summary: RouteIntelligenceSummary): string {
  const confidence = summary.sourceConfidenceSummary;
  const freshness = summary.offlineReadiness.isStale
    ? 'stale'
    : summary.providerHealthSummary.staleProviders.length > 0
      ? 'partially stale'
      : 'current where available';
  return `Source confidence: ${confidence.label} (${Math.round(confidence.score)}). Freshness: ${freshness}.`;
}

function selectPrimaryRouteIssue(summary: RouteIntelligenceSummary): RouteIntelligenceIssue | null {
  const issues = [
    ...summary.blockingIssues,
    ...summary.warnings,
    ...summary.unknowns,
  ];
  return issues.sort((left, right) => issuePriority(left) - issuePriority(right))[0] ?? null;
}

export function buildRouteBriefAdvisory(summary: RouteIntelligenceSummary): RouteBriefAdvisory | null {
  const issue = selectPrimaryRouteIssue(summary);
  if (!issue) return null;

  const severity = issueSeverity(issue);
  const message = guardRouteIntelligenceCopy(issue.message);
  return {
    kind: issue.id,
    severity,
    title: guardRouteIntelligenceCopy(issue.title).toUpperCase(),
    message: `ROUTE ADVISORY: ${message}`,
    recommendedAction: guardRouteIntelligenceCopy(formatRecommendation(issue.recommendedAction)),
    routeId: summary.routeId,
    sourceLine: sourceLine(summary),
    confidence: Math.max(0, Math.min(1, summary.sourceConfidenceSummary.score / 100)),
  };
}

export function publishRouteBriefAdvisory(
  summary: RouteIntelligenceSummary,
  options?: { now?: number },
): RouteBriefPublishResult {
  const now = options?.now ?? Date.now();
  const advisory = buildRouteBriefAdvisory(summary);
  if (!advisory) return { emitted: false, reason: 'no_actionable_route_issue' };

  pruneExpired(now);
  const key = routeScopeKey(advisory);
  const prior = recentRouteBriefAdvisories.get(key);
  const fingerprint = messageFingerprint(advisory);
  if (prior && now - prior.at <= ROUTE_BRIEF_SUPPRESSION_MS) {
    if (SEVERITY_RANK[advisory.severity] > SEVERITY_RANK[prior.severity]) {
      recordBriefCadEntryForRoute(advisory, now);
      recentRouteBriefAdvisories.set(key, { at: now, severity: advisory.severity, messageFingerprint: fingerprint });
      return { emitted: true, reason: 'severity_escalation', advisory };
    }
    if (prior.messageFingerprint === fingerprint) {
      return { emitted: false, reason: 'duplicate_suppressed', advisory };
    }
    recordBriefCadEntryForRoute(advisory, now);
    recentRouteBriefAdvisories.set(key, { at: now, severity: advisory.severity, messageFingerprint: fingerprint });
    return { emitted: true, reason: 'meaningful_change', advisory };
  }

  recordBriefCadEntryForRoute(advisory, now);
  recentRouteBriefAdvisories.set(key, { at: now, severity: advisory.severity, messageFingerprint: fingerprint });
  return { emitted: true, reason: 'emitted', advisory };
}

function recordBriefCadEntryForRoute(advisory: RouteBriefAdvisory, now: number): void {
  recordBriefCadEntry({
    id: [
      'route-intelligence',
      advisory.routeId,
      advisory.kind,
      Math.floor(now / ROUTE_BRIEF_SUPPRESSION_MS),
    ].join(':'),
    text: `${advisory.message} ${advisory.sourceLine}`,
    mode: severityToMode(advisory.severity),
    priority: severityToPriority(advisory.severity),
    queuedAt: now,
    title: advisory.title,
    recommendedAction: advisory.recommendedAction,
    source: 'ecs-route-intelligence',
    severity: advisory.severity,
    eventType: `route_${advisory.kind}`,
    routeId: advisory.routeId,
    confidence: advisory.confidence,
  });
}

export function resetRouteBriefPublisherForTests(): void {
  recentRouteBriefAdvisories.clear();
}
