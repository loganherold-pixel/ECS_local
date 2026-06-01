import type { ECSOrchestratorCandidate } from './ai/orchestratorTypes';
import type { ECSOrchestratorTargetView } from './ai/orchestratorSelectors';
import type { ECSOperationalState } from './ai/degradedOperationsTypes';
import type { ECSExpeditionPhase } from './ai/expeditionPhaseTypes';
import type { ECSLiveStatusMap } from './status/liveStatusTypes';
import { formatTrustCompactLine } from './ai/trustContract';
import { selectLiveStatusForSource } from './status/liveStatusResolver';

type GuidanceTone = 'active' | 'ready' | 'warning' | 'info';
type IndicatorAction = 'route_overview' | 'weather' | 'gps' | 'offline_cache' | 'intel';

type NavigateGuidanceContext = {
  eyebrow?: string | null;
  title: string;
  detail?: string | null;
  tone?: GuidanceTone;
} | null;

type NavigateContextCard = {
  eyebrow?: string | null;
  title: string;
  subtitle?: string | null;
  statusText?: string | null;
  noteText?: string | null;
} | null;

type WeatherSeveritySummary = {
  level: 'advisory' | 'warning' | 'extreme';
  label: string;
  color: string;
  score: number;
} | null;

type NavigateCommandIndicator = {
  label: string;
  icon: string;
  action: IndicatorAction;
  tone: GuidanceTone;
};

export type NavigateCommandState = {
  primary: ECSOrchestratorCandidate | null;
  secondary: ECSOrchestratorCandidate[];
  headerGuidance: NavigateGuidanceContext;
  indicator: NavigateCommandIndicator | null;
  supportText: string | null;
  confidenceLabel: string | null;
};

type SelectNavigateCommandStateArgs = {
  navigateView: ECSOrchestratorTargetView;
  overlayMode: 'idle' | 'preview' | 'active' | 'arrived' | 'error';
  previewContext: NavigateContextCard;
  activeContext: NavigateContextCard;
  operationalLabel: string | null;
  operationalDetail: string | null;
  operationalState: ECSOperationalState | null | undefined;
  phase: ECSExpeditionPhase | null | undefined;
  liveStatus: ECSLiveStatusMap | null | undefined;
  weatherSeveritySummary: WeatherSeveritySummary;
  gpsHasFix: boolean;
  gpsPermissionDenied: boolean;
  liveServicesEnabled: boolean;
};

function cleanText(value: string | null | undefined): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function truncateLabel(value: string, max = 24): string {
  if (value.length <= max) return value.toUpperCase();
  return `${value.slice(0, max - 1).trimEnd()}…`.toUpperCase();
}

function candidateTone(candidate: ECSOrchestratorCandidate | null): GuidanceTone {
  const level = candidate?.priority?.level;
  if (level === 'critical' || level === 'warning' || level === 'caution') return 'warning';
  if (level === 'advisory') return 'active';
  return 'info';
}

function candidateEyebrow(args: {
  candidate: ECSOrchestratorCandidate | null;
  phase: ECSExpeditionPhase | null | undefined;
}): string {
  const priorityTitle = cleanText(args.candidate?.priority?.title);
  if (priorityTitle) return priorityTitle.toUpperCase();
  if (args.phase && args.phase !== 'unknown') {
    return args.phase.replace(/_/g, ' ').toUpperCase();
  }
  return 'ROUTE COMMAND';
}

function candidateIndicatorAction(candidate: ECSOrchestratorCandidate | null): IndicatorAction {
  switch (candidate?.source) {
    case 'weather':
      return 'weather';
    case 'safety':
      return 'gps';
    case 'offline_readiness':
      return 'offline_cache';
    case 'route_risk':
    case 'remoteness':
    case 'bailout':
    case 'resource_status':
    case 'telemetry':
      return 'intel';
    default:
      return 'route_overview';
  }
}

function candidateIndicatorIcon(candidate: ECSOrchestratorCandidate | null): string {
  switch (candidate?.source) {
    case 'weather':
      return 'warning-outline';
    case 'safety':
      return 'locate-outline';
    case 'offline_readiness':
      return 'cloud-download-outline';
    case 'bailout':
      return 'exit-outline';
    case 'remoteness':
      return 'compass-outline';
    case 'resource_status':
      return 'water-outline';
    case 'telemetry':
      return 'car-sport-outline';
    default:
      return 'alert-circle-outline';
  }
}

function shouldPromoteCandidate(
  candidate: ECSOrchestratorCandidate | null,
  overlayMode: SelectNavigateCommandStateArgs['overlayMode'],
): boolean {
  if (!candidate) return false;
  const rank = candidate.priority?.rank ?? 0;
  if (rank >= 4) return true;
  if (overlayMode !== 'active' && overlayMode !== 'arrived') return false;
  return (
    candidate.source === 'route_risk'
    || candidate.source === 'weather'
    || candidate.source === 'bailout'
    || candidate.source === 'offline_readiness'
  );
}

export function selectNavigateCommandState(
  args: SelectNavigateCommandStateArgs,
): NavigateCommandState {
  const {
    navigateView,
    overlayMode,
    previewContext,
    activeContext,
    operationalLabel,
    operationalDetail,
    operationalState,
    phase,
    liveStatus,
    weatherSeveritySummary,
    gpsHasFix,
    gpsPermissionDenied,
    liveServicesEnabled,
  } = args;

  const primary = navigateView.primary ?? null;
  const secondary = navigateView.secondary ?? [];
  const baseContext =
    overlayMode === 'active' || overlayMode === 'arrived'
      ? activeContext
      : overlayMode === 'preview'
        ? previewContext
        : null;
  const promoted = shouldPromoteCandidate(primary, overlayMode);
  const routeStatus = liveStatus?.route ?? null;
  const weatherStatus = liveStatus?.weather ?? null;
  const primaryStatus = selectLiveStatusForSource(liveStatus, primary?.source);
  const primaryTrust = primary?.trust ?? null;

  let headerGuidance: NavigateGuidanceContext = null;

  if (promoted && primary) {
    headerGuidance = {
      eyebrow: candidateEyebrow({ candidate: primary, phase }),
      title: cleanText(primary.title) || 'Route update',
      detail:
        cleanText(primaryTrust?.explanationSummary) ||
        cleanText(primary.explanation?.text) ||
        cleanText(primary.summary) ||
        cleanText(primaryStatus?.shortReason) ||
        cleanText(baseContext?.statusText) ||
        null,
      tone: candidateTone(primary),
    };
  } else if (baseContext) {
    headerGuidance = {
      eyebrow: cleanText(baseContext.eyebrow) || 'ROUTE READY',
      title: cleanText(baseContext.title),
      detail:
        cleanText(baseContext.statusText) ||
        cleanText(baseContext.noteText) ||
        cleanText(baseContext.subtitle) ||
        null,
      tone: overlayMode === 'active' ? 'active' : 'ready',
    };
  } else if (
    gpsHasFix &&
    !gpsPermissionDenied &&
    (operationalState === 'degraded' || operationalState === 'limited' || operationalState === 'offline_capable')
  ) {
    const cloudSpecificDetail =
      cleanText(routeStatus?.shortReason) ||
      cleanText(primaryStatus?.shortReason) ||
      cleanText(operationalDetail) ||
      (
        liveServicesEnabled
          ? 'Live GPS is available. Some cloud-backed route support is reduced.'
          : 'Live GPS is available. Route planning is using local support while cloud services recover.'
      );

    headerGuidance = {
      eyebrow:
        cleanText(operationalLabel) ||
        (liveServicesEnabled ? 'LIVE POSITION' : 'LOCAL SUPPORT'),
      title:
        operationalState === 'offline_capable'
          ? 'Route planning using local support'
          : 'Route planning ready',
      detail: cloudSpecificDetail,
      tone: operationalState === 'offline_capable' ? 'info' : 'ready',
    };
  } else if (
    operationalState === 'degraded' ||
    operationalState === 'limited' ||
    operationalState === 'offline_capable'
  ) {
    headerGuidance = {
      eyebrow: cleanText(operationalLabel) || 'LIMITED GUIDANCE',
      title:
        operationalState === 'offline_capable'
          ? 'Cached guidance available'
          : 'Limited live routing',
      detail:
        cleanText(routeStatus?.shortReason) ||
        cleanText(operationalDetail) ||
        null,
      tone: operationalState === 'offline_capable' ? 'info' : 'warning',
    };
  } else if (routeStatus && routeStatus.status === 'waiting') {
    headerGuidance = {
      eyebrow: routeStatus.label.toUpperCase(),
      title: 'Guidance waiting on GPS',
      detail: cleanText(routeStatus.shortReason) || null,
      tone: 'info',
    };
  }

  const indicator: NavigateCommandIndicator | null = promoted && primary
    ? {
        label: truncateLabel(cleanText(primary.priority?.title) || cleanText(primary.title) || 'Route command'),
        icon: candidateIndicatorIcon(primary),
        action: candidateIndicatorAction(primary),
        tone: candidateTone(primary),
      }
    : routeStatus?.status === 'waiting'
      ? {
          label: 'WAITING FOR GPS',
          icon: 'locate-outline',
          action: 'gps',
          tone: 'info' as const,
        }
      : routeStatus?.status === 'estimated'
        ? {
            label: 'ESTIMATED',
            icon: 'compass-outline',
            action: 'route_overview',
            tone: 'info' as const,
          }
      : routeStatus?.status === 'degraded'
          ? {
              label: 'LIMITED LIVE',
              icon: 'alert-circle-outline',
              action: 'gps',
              tone: 'warning' as const,
            }
      : operationalState === 'offline_capable' && (overlayMode === 'active' || overlayMode === 'preview')
        ? {
            label: 'CACHED ROUTE',
            icon: 'cloud-offline-outline',
          action: 'offline_cache',
          tone: 'info' as const,
        }
      : weatherSeveritySummary && (overlayMode === 'preview' || overlayMode === 'active')
        ? {
            label: truncateLabel(weatherSeveritySummary.label, 22),
            icon: 'warning-outline',
            action: 'weather',
            tone: 'warning' as const,
          }
        : !gpsHasFix && (overlayMode === 'active' || gpsPermissionDenied)
          ? {
              label: gpsPermissionDenied ? 'LOCATION REQUIRED' : 'GPS DEGRADED',
              icon: 'locate-outline',
              action: 'gps',
              tone: 'warning' as const,
            }
          : null;

  return {
    primary,
    secondary,
    headerGuidance,
    indicator,
    supportText:
      cleanText(primaryTrust?.explanationSummary) ||
      cleanText(primary?.explanation?.text) ||
      cleanText(primaryStatus?.shortReason) ||
      (weatherStatus?.status === 'degraded' ? cleanText(weatherStatus.shortReason) : null) ||
      (routeStatus?.status === 'offline_capable' ? cleanText(routeStatus.shortReason) : null) ||
      cleanText(operationalDetail) ||
      (!liveServicesEnabled && overlayMode === 'active'
        ? 'Cached route guidance remains usable while live services recover.'
        : null),
    confidenceLabel:
      formatTrustCompactLine(primaryTrust) ||
      cleanText(primary?.confidence?.label) ||
      (primaryStatus && primaryStatus.status !== 'live' ? primaryStatus.label : null),
  };
}
