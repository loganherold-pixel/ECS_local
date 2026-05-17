import { connectivity } from '../connectivity';
import { ECS_READINESS_COPY } from '../ecsStateCopy';
import type { ECSLiveStatusMap } from '../status/liveStatusTypes';
import { resolveConfiguredVehiclePresence } from '../vehiclePresence';
import type {
  ECSProfileCommandStatus,
  ECSTopBannerPresentation,
  ECSTopBannerResolverInput,
  ECSTopBannerTone,
} from './topBannerTypes';

function sanitizeShellDetail(detail: string | null | undefined): string | null {
  if (!detail) return null;
  if (detail.toLowerCase().includes('recommendation quality is softened')) {
    return null;
  }
  return detail;
}

type ConnectivityResolution = Omit<ECSTopBannerPresentation, 'postureLabel' | 'postureDetail'>;

function buildConnectivityPresentation(args: {
  statusLabel: string;
  statusDetail: string;
  tone: ECSTopBannerTone;
  processingActive: boolean;
  processingLabel: string | null;
  source: string;
  priority: number;
  reason: string;
  suppressedSources?: string[];
  diagnostics: ECSTopBannerPresentation['diagnostics'];
}): ConnectivityResolution {
  return {
    statusLabel: args.statusLabel,
    statusDetail: args.statusDetail,
    tone: args.tone,
    processingActive: args.processingActive,
    processingLabel: args.processingLabel,
    source: args.source,
    priority: args.priority,
    reason: args.reason,
    suppressedSources: args.suppressedSources ?? [],
    diagnostics: args.diagnostics,
  };
}

function hasUsableStatus(status: string | null | undefined): boolean {
  return status === 'live' || status === 'estimated' || status === 'degraded' || status === 'offline_capable';
}

function pickSpecificReducedSupport(
  liveStatus: ECSLiveStatusMap | null | undefined,
  options?: {
    includeRoute?: boolean;
  },
) {
  const statuses = liveStatus ?? null;
  if (!statuses) return null;
  const includeRoute = options?.includeRoute ?? true;

  const candidates: Array<{
    key: string;
    status: string | null | undefined;
    detail: string | null | undefined;
    onlineDetail: string;
    degradedDetail: string;
  }> = [
    {
      key: 'route',
      status: statuses.route?.status,
      detail: sanitizeShellDetail(statuses.route?.shortReason),
      onlineDetail: 'Live route guidance is available.',
      degradedDetail: 'Route guidance remains available, but live support is reduced.',
    },
    {
      key: 'recommendations',
      status: statuses.recommendations?.status,
      detail: sanitizeShellDetail(statuses.recommendations?.shortReason),
      onlineDetail: 'Route planning remains live, but cloud-backed recommendations are reduced.',
      degradedDetail: 'Cloud-backed recommendations are reduced.',
    },
    {
      key: 'weather',
      status: statuses.weather?.status,
      detail: sanitizeShellDetail(statuses.weather?.shortReason),
      onlineDetail: 'Navigation remains live, but weather enrichment is reduced.',
      degradedDetail: 'Weather enrichment is reduced.',
    },
    {
      key: 'telemetry',
      status: statuses.telemetry?.status,
      detail: sanitizeShellDetail(statuses.telemetry?.shortReason),
      onlineDetail: 'Vehicle guidance remains live, but telemetry is using saved baseline context.',
      degradedDetail: 'Telemetry is using saved baseline context.',
    },
    {
      key: 'readiness',
      status: statuses.readiness?.status,
      detail: sanitizeShellDetail(statuses.readiness?.shortReason),
      onlineDetail: 'Vehicle setup is present, but readiness detail is still incomplete.',
      degradedDetail: 'Vehicle readiness detail is still incomplete.',
    },
  ];

  const scopedCandidates = includeRoute
    ? candidates
    : candidates.filter((candidate) => candidate.key !== 'route');

  for (const candidate of scopedCandidates) {
    if (candidate.status === 'degraded') {
      return {
        source: candidate.key,
        detail: candidate.detail ?? candidate.degradedDetail,
        status: candidate.status,
      };
    }
  }

  for (const candidate of scopedCandidates) {
    if (candidate.status === 'waiting') {
      return {
        source: candidate.key,
        detail: candidate.detail ?? `Waiting for ${candidate.key} support to strengthen.`,
        status: candidate.status,
      };
    }
  }

  for (const candidate of scopedCandidates) {
    if (candidate.status === 'unavailable') {
      return {
        source: candidate.key,
        detail: candidate.detail ?? candidate.onlineDetail,
        status: candidate.status,
      };
    }
  }

  return null;
}

function resolvePostureLabel(input: ECSTopBannerResolverInput): {
  postureLabel: string;
  postureDetail: string;
} {
  void input;

  return {
    postureLabel: 'Expedition Command System',
    postureDetail: '',
  };
}

function resolveConnectivityPresentation(
  input: ECSTopBannerResolverInput,
): ConnectivityResolution {
  const liveStatus = input.commandContext?.liveStatus ?? null;
  const overallStatus = liveStatus?.overall ?? null;
  const routeStatus = liveStatus?.route ?? null;
  const remotenessStatus = liveStatus?.remoteness ?? null;
  const weatherStatus = liveStatus?.weather ?? null;
  const recommendationStatus = liveStatus?.recommendations ?? null;
  const connectivityLevel = connectivity.getLevel();
  const operationalState = input.commandContext?.operationalState ?? null;
  const gpsLive = routeStatus?.status === 'live' || remotenessStatus?.status === 'live';
  const routeUsable = hasUsableStatus(routeStatus?.status ?? null);
  const hasConfiguredVehicle = resolveConfiguredVehiclePresence().hasConfiguredVehicle;
  const cloudEnhancementAvailable =
    weatherStatus?.status === 'live' ||
    weatherStatus?.status === 'estimated' ||
    recommendationStatus?.status === 'live' ||
    recommendationStatus?.status === 'estimated';
  const diagnostics: ECSTopBannerPresentation['diagnostics'] = {
    gpsLive,
    routeUsable,
    routeStatus: routeStatus?.status ?? null,
    hasConfiguredVehicle,
    offlineMode: input.offlineMode,
    cloudEnhancementAvailable,
  };

  const processingActive =
    input.syncStatus === 'syncing' || input.connectivityStatus === 'reconnecting';

  const offlineCapable =
    input.offlineMode ||
    overallStatus?.status === 'offline_capable' ||
    routeStatus?.status === 'offline_capable' ||
    recommendationStatus?.status === 'offline_capable' ||
    (!input.isOnline && input.hasActiveExpeditionContext);

  const degraded =
    operationalState === 'degraded' ||
    operationalState === 'limited' ||
    overallStatus?.status === 'degraded' ||
    recommendationStatus?.status === 'degraded' ||
    (input.isOnline && connectivityLevel === 'limited') ||
    input.syncStatus === 'error';

  if (input.syncStatus === 'syncing') {
    return buildConnectivityPresentation({
      statusLabel: ECS_READINESS_COPY.shell.syncing.statusLabel,
      statusDetail: ECS_READINESS_COPY.shell.syncing.statusDetail,
      tone: 'syncing',
      processingActive: true,
      processingLabel: 'Syncing context',
      source: 'processing_sync',
      priority: 100,
      reason: 'Background sync is actively updating shared ECS context.',
      diagnostics,
    });
  }

  if (input.connectivityStatus === 'reconnecting') {
    return buildConnectivityPresentation({
      statusLabel: ECS_READINESS_COPY.shell.reconnecting.statusLabel,
      statusDetail: ECS_READINESS_COPY.shell.reconnecting.statusDetail,
      tone: degraded ? 'degraded' : 'syncing',
      processingActive: true,
      processingLabel: 'Restoring signal',
      source: 'processing_reconnect',
      priority: 95,
      reason: 'Connectivity is still settling, so shell copy stays transient until the final state is known.',
      diagnostics,
    });
  }

  if (!input.isOnline && offlineCapable) {
    const preferredDetail = sanitizeShellDetail(routeStatus?.shortReason) ?? sanitizeShellDetail(recommendationStatus?.shortReason);
    return buildConnectivityPresentation({
      statusLabel: ECS_READINESS_COPY.shell.offlineSupport.statusLabel,
      statusDetail:
        preferredDetail ??
        ECS_READINESS_COPY.shell.offlineSupport.statusDetail,
      tone: 'offline_capable',
      processingActive,
      processingLabel: null,
      source: 'offline_support',
      priority: 90,
      reason: 'Core ECS support remains usable from saved route and local context while offline.',
      suppressedSources: ['overall', 'recommendations'],
      diagnostics,
    });
  }

  if (!input.isOnline) {
    return buildConnectivityPresentation({
      statusLabel: ECS_READINESS_COPY.shell.offline.statusLabel,
      statusDetail:
        input.offlineMode && !input.userPresent
          ? 'Working locally with saved data until you reconnect.'
          : ECS_READINESS_COPY.shell.offline.statusDetail,
      tone: 'offline',
      processingActive,
      processingLabel: null,
      source: 'offline',
      priority: 85,
      reason: 'No online connectivity and no usable offline-capable live support remained for the current surface.',
      diagnostics,
    });
  }

  if (input.hasActiveExpeditionContext && routeStatus) {
    if (routeStatus.status === 'live') {
      const reducedSupport = pickSpecificReducedSupport(liveStatus);
      return buildConnectivityPresentation({
        statusLabel: ECS_READINESS_COPY.shell.online.statusLabel,
        statusDetail:
          reducedSupport?.source && reducedSupport.source !== 'route'
            ? `Active guidance is live. ${reducedSupport.detail}`
            : sanitizeShellDetail(routeStatus.shortReason) ??
              'Active guidance is using current route and positioning data.',
        tone: 'online',
        processingActive,
        processingLabel: null,
        source: 'route_live',
        priority: 80,
        reason: 'Active guidance outranks broad degraded copy when route and positioning are live.',
        suppressedSources: reducedSupport ? ['overall', reducedSupport.source] : ['overall'],
        diagnostics,
      });
    }

    if (routeStatus.status === 'offline_capable') {
      return buildConnectivityPresentation({
        statusLabel: ECS_READINESS_COPY.shell.offlineSupport.statusLabel,
        statusDetail:
          sanitizeShellDetail(routeStatus.shortReason) ??
          'Active guidance remains available from cached map and route data.',
        tone: 'offline_capable',
        processingActive,
        processingLabel: null,
        source: 'route_offline_capable',
        priority: 78,
        reason: 'Active guidance is still usable from cached route support.',
        suppressedSources: ['overall'],
        diagnostics,
      });
    }

    if (routeStatus.status === 'degraded' || routeStatus.status === 'estimated') {
      const reducedSupport = pickSpecificReducedSupport(liveStatus, {
        includeRoute: false,
      });
      if (gpsLive) {
        return buildConnectivityPresentation({
          statusLabel: ECS_READINESS_COPY.shell.online.statusLabel,
          statusDetail:
            reducedSupport?.source
              ? `Active guidance is live. ${reducedSupport.detail}`
              : sanitizeShellDetail(routeStatus.shortReason) ??
                'Active guidance is live. Some cloud-backed route support is reduced.',
          tone: 'online',
          processingActive,
          processingLabel: null,
          source: 'route_live_reduced',
          priority: 79,
          reason: 'Active guidance remains authoritative when GPS is live, even if cloud-backed route support is reduced.',
          suppressedSources: reducedSupport ? ['overall', reducedSupport.source] : ['overall', 'recommendations'],
          diagnostics,
        });
      }

      return buildConnectivityPresentation({
        statusLabel: ECS_READINESS_COPY.shell.limited.statusLabel,
        statusDetail:
          sanitizeShellDetail(routeStatus.shortReason) ??
          'Route guidance remains available, but live support is reduced.',
        tone: 'degraded',
        processingActive,
        processingLabel: null,
        source: routeStatus.status === 'degraded' ? 'route_degraded' : 'route_estimated',
        priority: 76,
        reason: 'Route guidance is still present, but reduced route support should be described specifically.',
        suppressedSources: ['overall', 'recommendations'],
        diagnostics,
      });
    }

    if (routeStatus.status === 'waiting') {
      return buildConnectivityPresentation({
        statusLabel: ECS_READINESS_COPY.shell.syncing.statusLabel,
        statusDetail:
          sanitizeShellDetail(routeStatus.shortReason) ??
          'Awaiting GPS signal before promoting live route guidance.',
        tone: 'syncing',
        processingActive: true,
        processingLabel: 'Waiting for GPS',
        source: 'route_waiting',
        priority: 74,
        reason: 'The current route is staged, but live guidance still needs a fresh position fix.',
        suppressedSources: ['overall'],
        diagnostics,
      });
    }
  }

  const reducedSupport = pickSpecificReducedSupport(liveStatus, {
    includeRoute: input.hasActiveExpeditionContext,
  });
  if (gpsLive && reducedSupport && reducedSupport.source !== 'route') {
    return buildConnectivityPresentation({
      statusLabel: ECS_READINESS_COPY.shell.online.statusLabel,
      statusDetail: `Live positioning is available. ${reducedSupport.detail}`,
      tone: 'online',
      processingActive,
      processingLabel: null,
      source: `gps_live_${reducedSupport.source}`,
      priority: 70,
      reason: 'Live GPS should stay authoritative while only secondary cloud or telemetry services are reduced.',
      suppressedSources: ['overall', reducedSupport.source],
      diagnostics,
    });
  }

  if (gpsLive && !input.hasActiveExpeditionContext) {
    return buildConnectivityPresentation({
      statusLabel: ECS_READINESS_COPY.shell.online.statusLabel,
      statusDetail: hasConfiguredVehicle
        ? 'Live positioning and the active rig profile are ready. Start navigation to add route-aware guidance.'
        : 'Live positioning is available. Start navigation to add route-aware guidance.',
      tone: 'online',
      processingActive,
      processingLabel: null,
      source: 'gps_live_idle',
      priority: 68,
      reason: 'Idle live GPS should outrank broad degraded copy when no route is currently staged.',
      suppressedSources: ['overall', 'route'],
      diagnostics,
    });
  }

  if (degraded) {
    const preferredDetail =
      sanitizeShellDetail(recommendationStatus?.shortReason) ??
      sanitizeShellDetail(overallStatus?.shortReason);
    return buildConnectivityPresentation({
      statusLabel: ECS_READINESS_COPY.shell.limited.statusLabel,
      statusDetail:
        preferredDetail ??
        (input.syncStatus === 'error'
          ? 'Sync needs attention, but saved context is still available.'
          : ECS_READINESS_COPY.shell.limited.statusDetail),
      tone: 'degraded',
      processingActive,
      processingLabel: null,
      source: 'degraded',
      priority: 60,
      reason: 'No higher-priority live route or GPS state was active, so degraded copy remains the truthful summary.',
      diagnostics,
    });
  }

  return buildConnectivityPresentation({
    statusLabel: ECS_READINESS_COPY.shell.online.statusLabel,
    statusDetail:
      overallStatus?.shortReason ??
      recommendationStatus?.shortReason ??
      ECS_READINESS_COPY.shell.online.statusDetail,
    tone: 'online',
    processingActive,
    processingLabel: null,
    source: 'online',
    priority: 50,
    reason: 'No blocking or degraded condition outranked the healthy online state.',
    diagnostics,
  });
}

export function resolveTopBannerPresentation(
  input: ECSTopBannerResolverInput,
): ECSTopBannerPresentation {
  return {
    ...resolvePostureLabel(input),
    ...resolveConnectivityPresentation(input),
  };
}

export function resolveProfileCommandStatus(
  input: ECSTopBannerResolverInput,
): ECSProfileCommandStatus {
  const presentation = resolveTopBannerPresentation(input);

  return {
    statusLabel: presentation.statusLabel,
    statusDetail: presentation.statusDetail,
    tone: presentation.tone,
    processingActive: presentation.processingActive,
    processingLabel: presentation.processingLabel,
  };
}

export function getTopBannerToneColor(
  tone: ECSTopBannerTone,
  colors: {
    active: string;
    online: string;
    muted: string;
    degraded: string;
  },
): string {
  switch (tone) {
    case 'online':
      return colors.online;
    case 'syncing':
    case 'offline_capable':
      return colors.active;
    case 'degraded':
      return colors.degraded;
    case 'offline':
    case 'neutral':
    default:
      return colors.muted;
  }
}
