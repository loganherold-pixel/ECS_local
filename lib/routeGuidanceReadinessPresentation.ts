import {
  getRouteConfidenceLabel,
  type RouteConfidenceResult,
} from './routeConfidencePresentation';
import type { OfflineReadinessResult } from './offlineReadinessPresentation';
import type { NavigateRouteConfidenceSummary } from './remote/routeConfidenceSummary';

export type RouteGuidanceReadinessTone = 'positive' | 'caution' | 'warning' | 'neutral' | 'info';

export interface RouteGuidanceVehicleFitInput {
  label?: string | null;
  level?: string | null;
  note?: string | null;
}

export interface RouteGuidanceCampIntelInput {
  evidenceSummary?: {
    sourceLabel?: string | null;
  } | null;
  sourceType?: string | null;
}

export interface RouteGuidanceReadinessDisplay {
  id: 'vehicle_fit' | 'route_confidence' | 'offline_readiness' | 'camp_intel';
  label: string;
  value: string;
  tone: RouteGuidanceReadinessTone;
}

export type RouteGuidanceReadinessRow = RouteGuidanceReadinessDisplay;

export interface RouteGuidanceRecommendedAction {
  id: 'prepare_offline' | 'review_route';
  label: 'Prepare Offline' | 'Review Route';
}

export interface RouteGuidanceRouteConfidenceExplanation {
  supportingSignals: string[];
  uncertainSignals: string[];
  customRouteWarning: string | null;
}

export interface RouteGuidanceReadinessViewModel {
  routeId: string | null;
  routeType: string | null;
  vehicleFitDisplay: RouteGuidanceReadinessDisplay;
  routeConfidenceDisplay: RouteGuidanceReadinessDisplay;
  offlineReadinessDisplay: RouteGuidanceReadinessDisplay;
  campIntelSummaryDisplay: RouteGuidanceReadinessDisplay | null;
  rows: RouteGuidanceReadinessRow[];
  primaryConcern: string | null;
  recommendedActions: RouteGuidanceRecommendedAction[];
  routeConfidenceExplanation: RouteGuidanceRouteConfidenceExplanation;
  routeConfidenceSummary: NavigateRouteConfidenceSummary | null;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\w\S*/g, (part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());
}

export function formatRouteGuidanceVehicleFit(vehicleFit?: RouteGuidanceVehicleFitInput | null): string {
  const explicit = vehicleFit?.label ?? vehicleFit?.level ?? null;
  if (!explicit) return 'Unknown';
  return titleCase(explicit).replace(/^Good Fit$/i, 'Good').replace(/^Strong Fit$/i, 'Good');
}

function vehicleFitTone(label: string): RouteGuidanceReadinessTone {
  const normalized = label.toLowerCase();
  if (normalized.includes('excellent') || normalized.includes('good') || normalized.includes('strong')) return 'positive';
  if (normalized.includes('adequate') || normalized.includes('limited')) return 'caution';
  if (normalized.includes('challenging') || normalized.includes('exceeds') || normalized.includes('poor')) return 'warning';
  return 'neutral';
}

function routeConfidenceTone(level: RouteConfidenceResult['level']): RouteGuidanceReadinessTone {
  if (level === 'high') return 'positive';
  if (level === 'medium') return 'caution';
  if (level === 'low') return 'warning';
  return 'neutral';
}

function routeConfidenceStatusTone(
  status: NavigateRouteConfidenceSummary['status'],
): RouteGuidanceReadinessTone {
  if (status === 'green') return 'positive';
  if (status === 'amber') return 'caution';
  return 'warning';
}

export function formatOfflineReadinessLabel(level: OfflineReadinessResult['level']): string {
  switch (level) {
    case 'ready':
      return 'Ready';
    case 'partial':
      return 'Partial';
    case 'not_ready':
      return 'Not Ready';
    default:
      return 'Unknown';
  }
}

function offlineReadinessTone(level: OfflineReadinessResult['level']): RouteGuidanceReadinessTone {
  if (level === 'ready') return 'positive';
  if (level === 'partial') return 'caution';
  if (level === 'not_ready') return 'warning';
  return 'neutral';
}

function normalizeCampSourceLabel(site: RouteGuidanceCampIntelInput): string {
  const explicit = site.evidenceSummary?.sourceLabel;
  if (explicit) return explicit;
  switch (site.sourceType) {
    case 'saved':
    case 'historical':
      return 'User-Supported';
    case 'verified':
      return 'Field-Confirmed';
    case 'route_candidate':
    case 'inferred':
    case 'fallback':
    default:
      return 'ECS-Inferred';
  }
}

export function summarizeRouteGuidanceCampIntel(
  sites: RouteGuidanceCampIntelInput[] | null | undefined,
): string | null {
  if (!sites || sites.length === 0) return null;
  const counts = new Map<string, number>();
  for (const site of sites) {
    const label = normalizeCampSourceLabel(site);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const priority = ['Field-Confirmed', 'User-Supported', 'ECS-Inferred', 'Disputed', 'Avoid / Restricted'];
  const parts = priority
    .filter((label) => (counts.get(label) ?? 0) > 0)
    .map((label) => `${counts.get(label)} ${label}`);

  return parts.length > 0 ? parts.join(' - ') : 'Limited';
}

function limitSignals(values: (string | null | undefined)[], max = 3): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
    if (output.length >= max) break;
  }
  return output;
}

function buildRecommendedActions(args: {
  routeConfidence: RouteConfidenceResult;
  offlineReadiness: OfflineReadinessResult;
  routeConfidenceSummary?: NavigateRouteConfidenceSummary | null;
}): RouteGuidanceRecommendedAction[] {
  const actions: RouteGuidanceRecommendedAction[] = [];
  if (
    args.offlineReadiness.recommendedAction === 'prepare_offline' ||
    args.offlineReadiness.level === 'partial' ||
    args.offlineReadiness.level === 'not_ready'
  ) {
    actions.push({ id: 'prepare_offline', label: 'Prepare Offline' });
  }

  if (args.routeConfidence.level === 'low' || args.routeConfidenceSummary?.status === 'red') {
    actions.push({ id: 'review_route', label: 'Review Route' });
  }

  return actions;
}

export function buildRouteGuidanceReadinessViewModel(args: {
  routeId?: string | null;
  routeType?: string | null;
  vehicleFit?: RouteGuidanceVehicleFitInput | null;
  routeConfidence: RouteConfidenceResult;
  offlineReadiness: OfflineReadinessResult;
  campIntelSites?: RouteGuidanceCampIntelInput[] | null;
  isCustomRoute?: boolean | null;
  routeConfidenceSummary?: NavigateRouteConfidenceSummary | null;
}): RouteGuidanceReadinessViewModel {
  const vehicleFit = formatRouteGuidanceVehicleFit(args.vehicleFit);
  const routeConfidence = getRouteConfidenceLabel(args.routeConfidence.level);
  const offlineReadiness = args.offlineReadiness.label ?? formatOfflineReadinessLabel(args.offlineReadiness.level);
  const campIntel = summarizeRouteGuidanceCampIntel(args.campIntelSites);

  const vehicleFitDisplay: RouteGuidanceReadinessDisplay = {
    id: 'vehicle_fit',
    label: 'Vehicle Fit',
    value: vehicleFit,
    tone: vehicleFitTone(vehicleFit),
  };
  const routeConfidenceDisplay: RouteGuidanceReadinessDisplay = {
    id: 'route_confidence',
    label: 'Route Confidence',
    value: args.routeConfidenceSummary
      ? `${args.routeConfidenceSummary.confidence}%`
      : routeConfidence,
    tone: args.routeConfidenceSummary
      ? routeConfidenceStatusTone(args.routeConfidenceSummary.status)
      : routeConfidenceTone(args.routeConfidence.level),
  };
  const offlineReadinessDisplay: RouteGuidanceReadinessDisplay = {
    id: 'offline_readiness',
    label: 'Offline Readiness',
    value: offlineReadiness,
    tone: offlineReadinessTone(args.offlineReadiness.level),
  };
  const campIntelSummaryDisplay: RouteGuidanceReadinessDisplay | null = campIntel
    ? { id: 'camp_intel', label: 'Camp Intel', value: campIntel, tone: 'info' }
    : null;
  const rows: RouteGuidanceReadinessRow[] = [
    vehicleFitDisplay,
    routeConfidenceDisplay,
    offlineReadinessDisplay,
    ...(campIntelSummaryDisplay ? [campIntelSummaryDisplay] : []),
  ];

  const customRouteWarning = args.isCustomRoute
    ? 'Custom route with limited ECS field support. ECS can guide the route geometry, but access, surface condition, and recent passability may be unknown.'
    : null;
  const primaryConcern =
    args.offlineReadiness.level === 'partial' || args.offlineReadiness.level === 'not_ready'
      ? args.offlineReadiness.reason
      : customRouteWarning
        ? 'Limited ECS field support'
        : args.routeConfidence.level === 'low'
          ? args.routeConfidence.concerns?.[0] ?? 'Route confidence needs review'
          : args.routeConfidenceSummary?.status === 'red'
            ? args.routeConfidenceSummary.headline
          : args.routeConfidence.concerns?.[0] ?? args.vehicleFit?.note ?? null;

  return {
    routeId: args.routeId ?? null,
    routeType: args.routeType ?? null,
    vehicleFitDisplay,
    routeConfidenceDisplay,
    offlineReadinessDisplay,
    campIntelSummaryDisplay,
    rows,
    primaryConcern,
    recommendedActions: buildRecommendedActions({
      routeConfidence: args.routeConfidence,
      offlineReadiness: args.offlineReadiness,
      routeConfidenceSummary: args.routeConfidenceSummary ?? null,
    }),
    routeConfidenceExplanation: {
      supportingSignals: limitSignals(args.routeConfidence.reasons, 3),
      uncertainSignals: limitSignals(args.routeConfidence.concerns ?? [], 3),
      customRouteWarning,
    },
    routeConfidenceSummary: args.routeConfidenceSummary ?? null,
  };
}
