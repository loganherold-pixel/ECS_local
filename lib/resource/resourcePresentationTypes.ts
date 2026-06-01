import type { ECSOrchestratorCandidate } from '../ai/orchestratorTypes';

export type ResourcePresentationTone =
  | 'good'
  | 'attention'
  | 'critical'
  | 'neutral'
  | 'live'
  | 'stale'
  | 'offline'
  | 'unavailable'
  | 'warning'
  | 'degraded'
  | 'misconfigured';

export type ResourceCompactPresentation = {
  summary: string;
  tone: ResourcePresentationTone;
  status: string;
  statusTone: ResourcePresentationTone;
};

export type ResourceFooterPresentation = {
  text: string;
  tone: ResourcePresentationTone;
} | null;

export type ResourceRationalePresentation = {
  text: string;
  tone: ResourcePresentationTone;
} | null;

export type ResourceStatusBadgePresentation = {
  label: string;
  tone: ResourcePresentationTone;
};

export type ResourceMetricPresentation = {
  label: string;
  value: string;
  tone: ResourcePresentationTone;
};

export type PowerWidgetPresentation = {
  compact: ResourceCompactPresentation;
  badge: ResourceStatusBadgePresentation;
  footer: ResourceFooterPresentation;
  rationale: ResourceRationalePresentation;
  microMetrics: ResourceMetricPresentation[];
  detail: {
    eyebrow: string;
    title: string;
    summary: string;
    sourceLine: string | null;
    rationaleLine: string | null;
    tone: ResourcePresentationTone;
  };
};

export type ResourceWidgetPresentation = {
  compact: ResourceCompactPresentation;
  badge: ResourceStatusBadgePresentation;
  footer: ResourceFooterPresentation;
  rationale: ResourceRationalePresentation;
  heroLabel: string;
  heroValue: string;
  heroTone: ResourcePresentationTone;
  heroSupport: string;
  resourceTiles: ResourceMetricPresentation[];
  microMetrics: ResourceMetricPresentation[];
  detail: {
    eyebrow: string;
    title: string;
    summary: string;
    sourceLine: string | null;
    rationaleLine: string | null;
    tone: ResourcePresentationTone;
  };
};

export type ResourceCandidateBundle = {
  routeViability: ECSOrchestratorCandidate | null;
  resource: ECSOrchestratorCandidate | null;
  telemetry: ECSOrchestratorCandidate | null;
  offlineReadiness: ECSOrchestratorCandidate | null;
};
