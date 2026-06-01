import type { ECSAIState } from '../ai/aiOrchestrator';
import type { ECSOrchestratorCandidate } from '../ai/orchestratorTypes';
import { filterAutomotiveEligibleCandidates } from './automotiveEligibilityFilters';
import { scoreAutomotiveCandidate } from './automotivePriorityResolver';
import {
  createDefaultAutomotiveSurfaceState,
  type ECSAutomotiveCommandItem,
  type ECSAutomotiveCommandRole,
  type ECSAutomotiveSurfaceState,
  type ECSAutomotiveTone,
} from './automotiveSurfaceTypes';

type AutomotiveNavigationSnapshot = {
  routeName?: string | null;
  nextManeuver?: string | null;
  distanceRemainingMiles?: number | null;
  etaLabel?: string | null;
  progressPct?: number | null;
  statusLabel?: string | null;
};

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function clampText(value: string | null | undefined, max: number): string {
  const text = cleanText(value);
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function roleForCandidate(candidate: ECSOrchestratorCandidate): ECSAutomotiveCommandRole {
  const family = candidate.rootCondition?.family ?? null;
  if (family === 'gps_guidance_degradation' || candidate.source === 'safety' || candidate.source === 'offline_readiness') {
    return 'guidance_status';
  }
  if (family === 'bailout_relevance' || candidate.source === 'bailout' || candidate.source === 'route_viability') {
    return 'exit_relevance';
  }
  if (family === 'resource_margin_decline' || candidate.source === 'resource_status') {
    return 'resource_margin';
  }
  if (family === 'route_fit_limitation' || candidate.source === 'vehicle_assessment' || candidate.source === 'attitude') {
    return 'vehicle_warning';
  }
  if (family === 'offline_capable_operation') {
    return 'status';
  }
  return 'route_warning';
}

function toneForCandidate(candidate: ECSOrchestratorCandidate): ECSAutomotiveTone {
  switch (candidate.priority?.level) {
    case 'critical':
      return 'critical';
    case 'warning':
      return 'warning';
    case 'caution':
      return 'watch';
    default:
      return 'calm';
  }
}

function buildCommandItem(
  candidate: ECSOrchestratorCandidate,
  reason: ReturnType<typeof filterAutomotiveEligibleCandidates>[number]['reason'],
): ECSAutomotiveCommandItem {
  const summary =
    clampText(
      candidate.explanation?.shortText
      ?? candidate.priority?.shortReason
      ?? candidate.summary,
      58,
    ) || clampText(candidate.title, 58);

  return {
    id: candidate.id,
    title: clampText(candidate.title, 42) || 'Route status',
    summary,
    role: roleForCandidate(candidate),
    tone: toneForCandidate(candidate),
    source: candidate.source,
    rootFamily: candidate.rootCondition?.family ?? null,
    confidence: candidate.confidence ?? null,
    priority: candidate.priority ?? null,
    eligibilityReason: reason,
  };
}

function compactStatusLabel(aiState: ECSAIState | null): string {
  const liveStatus = aiState?.liveStatus ?? null;
  if (liveStatus?.route?.status === 'offline_capable') return 'OFFLINE CAPABLE';
  if (liveStatus?.route?.status === 'degraded') return 'GUIDANCE LIMITED';
  if (liveStatus?.telemetry?.status === 'waiting') return 'SYNCING';
  if (liveStatus?.overall?.status === 'degraded') return 'DEGRADED';
  if (liveStatus?.overall?.status === 'unavailable') return 'OFFLINE';
  return 'ONLINE';
}

export function selectAutomotiveCommandSurface(args: {
  aiState: ECSAIState | null;
  navigation?: AutomotiveNavigationSnapshot | null;
}): ECSAutomotiveSurfaceState {
  const { aiState, navigation } = args;
  const base = createDefaultAutomotiveSurfaceState();
  const output = aiState?.orchestrator ?? null;
  const routeActive = !!aiState?.richContext?.meta.hasActiveRoute || !!aiState?.richContext?.meta.hasActiveRun;
  const liveStatus = aiState?.liveStatus ?? null;
  const gpsReduced =
    liveStatus?.route?.status === 'degraded'
    || liveStatus?.route?.shortReason?.toLowerCase().includes('gps')
    || liveStatus?.overall?.shortReason?.toLowerCase().includes('gps');
  const offlineCapable =
    liveStatus?.route?.status === 'offline_capable'
    || liveStatus?.overall?.status === 'offline_capable';

  const guidance = {
    routeActive,
    routeName: navigation?.routeName ?? aiState?.richContext?.summary.routeName ?? null,
    nextManeuver: navigation?.nextManeuver ?? null,
    remainingDistanceLabel:
      navigation?.distanceRemainingMiles != null
        ? `${Math.round(navigation.distanceRemainingMiles)} mi`
        : null,
    etaLabel: navigation?.etaLabel ?? null,
    progressLabel:
      navigation?.progressPct != null
        ? `${Math.round(navigation.progressPct)}%`
        : null,
    statusLine:
      navigation?.statusLabel
      ?? (routeActive ? 'Guidance active' : 'No active route'),
    offlineCapable,
    gpsReduced: Boolean(gpsReduced),
  };

  if (!output) {
    return {
      ...base,
      generatedAt: new Date().toISOString(),
      activePhase: aiState?.expeditionPhase ?? null,
      platformStatusLabel: compactStatusLabel(aiState),
      guidance,
    };
  }

  const activeCandidates = [
    output.primary ?? null,
    ...output.secondary,
    ...output.passive,
  ].filter((candidate): candidate is ECSOrchestratorCandidate => !!candidate);

  const scored = filterAutomotiveEligibleCandidates(activeCandidates, aiState)
    .map(({ candidate, reason }) => ({
      candidate,
      reason,
      score: scoreAutomotiveCandidate({
        candidate,
        aiState,
        eligibilityReason: reason,
      }),
    }))
    .sort((left, right) => right.score - left.score);

  const primary = scored[0] && scored[0].score >= 56
    ? buildCommandItem(scored[0].candidate, scored[0].reason)
    : null;
  const secondary = scored
    .slice(primary ? 1 : 0)
    .filter((entry) => {
      if (primary && entry.candidate.rootCondition?.key === scored[0]?.candidate.rootCondition?.key) {
        return false;
      }
      return entry.score >= 42;
    })
    .slice(0, 2)
    .map((entry) => buildCommandItem(entry.candidate, entry.reason));

  return {
    generatedAt: new Date().toISOString(),
    activePhase: output.activePhase ?? aiState?.expeditionPhase ?? null,
    platformStatusLabel: compactStatusLabel(aiState),
    routeFirst: true,
    primaryCommand: primary,
    secondaryCommands: secondary,
    guidance,
    suppressedCandidateIds: output.suppressed.map((candidate) => candidate.id),
  };
}
