import type { ECSAIState } from '../ai/aiOrchestrator';
import type { ECSOrchestratorCandidate } from '../ai/orchestratorTypes';
import type { ECSAutomotiveEligibilityReason } from './automotiveSurfaceTypes';

function priorityRank(candidate: ECSOrchestratorCandidate): number {
  return candidate.priority?.rank ?? 1;
}

function confidencePenalty(candidate: ECSOrchestratorCandidate): number {
  switch (String(candidate.confidence?.level ?? '').toLowerCase()) {
    case 'high':
      return 0;
    case 'moderate':
      return -4;
    case 'limited':
      return -10;
    case 'low':
      return -18;
    case 'unknown':
      return -24;
    default:
      return -8;
  }
}

export function scoreAutomotiveCandidate(args: {
  candidate: ECSOrchestratorCandidate;
  aiState: ECSAIState | null;
  eligibilityReason: ECSAutomotiveEligibilityReason;
}): number {
  const { candidate, aiState, eligibilityReason } = args;
  const phase = aiState?.expeditionPhase ?? aiState?.richContext?.phase?.current.phase ?? null;
  const routeActive = !!aiState?.richContext?.meta.hasActiveRoute || !!aiState?.richContext?.meta.hasActiveRun;
  const family = candidate.rootCondition?.family ?? null;

  let score = priorityRank(candidate) * 18;

  switch (candidate.source) {
    case 'route_risk':
    case 'safety':
      score += 62;
      break;
    case 'route_viability':
      score += 56;
      break;
    case 'bailout':
      score += 52;
      break;
    case 'weather':
      score += 48;
      break;
    case 'offline_readiness':
      score += 40;
      break;
    case 'resource_status':
      score += 34;
      break;
    case 'remoteness':
      score += 24;
      break;
    case 'telemetry':
      score += 18;
      break;
    case 'vehicle_assessment':
      score += 12;
      break;
    default:
      score += 8;
      break;
  }

  switch (eligibilityReason) {
    case 'degraded_guidance':
      score += 28;
      break;
    case 'route_critical':
      score += 24;
      break;
    case 'exit_relevant':
      score += 18;
      break;
    case 'resource_relevant':
      score += 10;
      break;
    case 'support_only':
      score -= 10;
      break;
    default:
      break;
  }

  if (candidate.targetRoles?.navigate === 'lead') score += 24;
  if (candidate.targetRoles?.alert === 'lead') score += 18;
  if (candidate.targetRoles?.dashboard === 'lead') score += 8;

  if (family === 'gps_guidance_degradation') score += 20;
  if (family === 'weather_route_exposure') score += 14;
  if (family === 'offline_capable_operation' && routeActive) score += 10;
  if (family === 'resource_margin_decline' && phase === 'recovery_exit') score += 14;
  if (family === 'bailout_relevance' && (phase === 'active_expedition' || phase === 'recovery_exit')) score += 12;

  if (!routeActive) {
    score -= 18;
  }

  switch (phase) {
    case 'transit':
      if (eligibilityReason === 'route_critical' || eligibilityReason === 'degraded_guidance') score += 10;
      break;
    case 'trail_entry':
      if (eligibilityReason === 'route_critical' || eligibilityReason === 'exit_relevant') score += 16;
      break;
    case 'active_expedition':
      if (eligibilityReason === 'route_critical' || eligibilityReason === 'exit_relevant') score += 18;
      break;
    case 'camp_stationary':
      if (candidate.source === 'resource_status' || candidate.source === 'weather') score -= 6;
      if (candidate.source === 'bailout') score -= 10;
      break;
    case 'recovery_exit':
      if (candidate.source === 'bailout' || candidate.source === 'route_viability' || candidate.source === 'resource_status') score += 16;
      break;
    default:
      break;
  }

  score += confidencePenalty(candidate);

  return score;
}
