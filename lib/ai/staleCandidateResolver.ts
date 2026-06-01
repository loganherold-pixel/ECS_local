import type { ECSOrchestratorCandidate, ECSOrchestratorOutput } from './orchestratorTypes';

type HardenCommandStateCandidatesArgs = {
  ordered: ECSOrchestratorCandidate[];
  suppressed: ECSOrchestratorCandidate[];
  activePhase?: ECSOrchestratorOutput['activePhase'];
  previousOutput?: ECSOrchestratorOutput | null;
};

type HardenCommandStateCandidatesResult = {
  active: ECSOrchestratorCandidate[];
  suppressed: ECSOrchestratorCandidate[];
  staleSignals: string[];
};

const PLANNING_ROOTS = new Set([
  'mission_planning_readiness',
  'planning_recommendation',
  'vehicle_readiness_gap',
  'route_fit_limitation',
]);

function cleanText(value: string | null | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

function priorityRank(candidate: ECSOrchestratorCandidate): number {
  return candidate.priority?.rank ?? 1;
}

function isPlanningPhase(phase: ECSOrchestratorOutput['activePhase']): boolean {
  return phase === 'vehicle_setup' || phase === 'staging' || phase === 'camp_stationary';
}

export function hardenCommandStateCandidates(
  args: HardenCommandStateCandidatesArgs,
): HardenCommandStateCandidatesResult {
  const staleSignals: string[] = [];
  const nextSuppressed = [...args.suppressed];
  const previousPhase = args.previousOutput?.activePhase ?? null;
  const phaseChanged = !!args.activePhase && !!previousPhase && previousPhase !== args.activePhase;
  const seenSummarySignatures = new Set<string>();

  const active = args.ordered.filter((candidate) => {
    const rootFamily = candidate.rootCondition?.family ?? null;
    const summarySignature = cleanText(candidate.summary || candidate.explanation?.shortText);
    const summaryKey = summarySignature ? `${rootFamily ?? candidate.source}::${summarySignature}` : null;

    if (
      phaseChanged
      && args.activePhase
      && candidate.phase
      && candidate.phase !== args.activePhase
      && priorityRank(candidate) <= 3
    ) {
      staleSignals.push(
        `${candidate.title} was suppressed because its phase (${candidate.phase}) no longer matches ${args.activePhase}.`,
      );
      nextSuppressed.push(candidate);
      return false;
    }

    if (
      phaseChanged
      && args.activePhase
      && !isPlanningPhase(args.activePhase)
      && rootFamily
      && PLANNING_ROOTS.has(rootFamily)
      && priorityRank(candidate) <= 3
    ) {
      staleSignals.push(
        `${candidate.title} was suppressed after the phase moved from ${previousPhase} to ${args.activePhase}.`,
      );
      nextSuppressed.push(candidate);
      return false;
    }

    if (
      summaryKey
      && seenSummarySignatures.has(summaryKey)
      && priorityRank(candidate) <= 2
      && (candidate.source === 'brief' || candidate.source === 'sync' || candidate.source === 'explore')
    ) {
      staleSignals.push(
        `${candidate.title} was suppressed because its summary duplicated a calmer higher-priority command state.`,
      );
      nextSuppressed.push(candidate);
      return false;
    }

    if (summaryKey) {
      seenSummarySignatures.add(summaryKey);
    }
    return true;
  });

  return {
    active,
    suppressed: nextSuppressed,
    staleSignals,
  };
}
