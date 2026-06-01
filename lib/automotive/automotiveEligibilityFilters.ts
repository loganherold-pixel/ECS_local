import type { ECSAIState } from '../ai/aiOrchestrator';
import type { ECSOrchestratorCandidate } from '../ai/orchestratorTypes';
import type { ECSAutomotiveEligibilityReason } from './automotiveSurfaceTypes';

function priorityRank(candidate: ECSOrchestratorCandidate): number {
  return candidate.priority?.rank ?? 1;
}

export function filterAutomotiveEligibleCandidates(
  candidates: ECSOrchestratorCandidate[],
  aiState: ECSAIState | null,
): {
  candidate: ECSOrchestratorCandidate;
  reason: ECSAutomotiveEligibilityReason;
}[] {
  const routeActive = !!aiState?.richContext?.meta.hasActiveRoute || !!aiState?.richContext?.meta.hasActiveRun;
  const phase = aiState?.expeditionPhase ?? aiState?.richContext?.phase?.current.phase ?? null;
  const eligible: {
    candidate: ECSOrchestratorCandidate;
    reason: ECSAutomotiveEligibilityReason;
  }[] = [];

  candidates.forEach((candidate) => {
    const family = candidate.rootCondition?.family ?? null;
    const rank = priorityRank(candidate);
    const confidenceLevel = String(candidate.confidence?.level ?? '').toLowerCase();

    if (candidate.source === 'brief' || candidate.source === 'explore' || candidate.source === 'sync') {
      return;
    }

    if (candidate.source === 'mission_scenario') {
      if (phase === 'camp_stationary' && rank >= 3) {
        eligible.push({ candidate, reason: 'support_only' });
      }
      return;
    }

    if (!routeActive && candidate.source === 'remoteness' && rank <= 2) {
      return;
    }

    if (
      (candidate.source === 'telemetry' || candidate.source === 'vehicle_assessment')
      && rank < 4
    ) {
      return;
    }

    if (confidenceLevel === 'low' || confidenceLevel === 'unknown') {
      if (candidate.source === 'resource_status' || candidate.source === 'offline_readiness') {
        if (rank >= 4) {
          eligible.push({ candidate, reason: 'resource_relevant' });
        }
        return;
      }
      if (candidate.source === 'weather' || candidate.source === 'remoteness') {
        if (rank >= 4) {
          eligible.push({ candidate, reason: 'route_critical' });
        }
        return;
      }
    }

    if (family === 'gps_guidance_degradation' || candidate.source === 'safety') {
      eligible.push({ candidate, reason: 'degraded_guidance' });
      return;
    }

    if (
      family === 'weather_route_exposure'
      || family === 'route_risk_elevation'
      || candidate.source === 'route_risk'
      || candidate.source === 'weather'
    ) {
      eligible.push({ candidate, reason: 'route_critical' });
      return;
    }

    if (
      family === 'bailout_relevance'
      || candidate.source === 'bailout'
      || (candidate.source === 'route_viability' && rank >= 3)
    ) {
      eligible.push({ candidate, reason: 'exit_relevant' });
      return;
    }

    if (
      family === 'resource_margin_decline'
      || candidate.source === 'resource_status'
      || candidate.source === 'offline_readiness'
    ) {
      if (rank >= 3 || phase === 'recovery_exit') {
        eligible.push({ candidate, reason: 'resource_relevant' });
      }
      return;
    }

    if (
      family === 'route_fit_limitation'
      || candidate.source === 'vehicle_assessment'
    ) {
      if (routeActive && rank >= 4) {
        eligible.push({ candidate, reason: 'route_critical' });
      }
      return;
    }

    if (candidate.source === 'remoteness' && rank >= 3) {
      eligible.push({ candidate, reason: 'support_only' });
    }
  });

  return eligible;
}
