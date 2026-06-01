import type {
  ECSOrchestratorCandidate,
  ECSOrchestratorOutput,
  ECSOrchestratorTargetRole,
  ECSOrchestratorUITarget,
} from './orchestratorTypes';

export type ECSOrchestratorTargetView = {
  primary: ECSOrchestratorCandidate | null;
  secondary: ECSOrchestratorCandidate[];
  passive: ECSOrchestratorCandidate[];
  suppressed: ECSOrchestratorCandidate[];
};

function candidateTargets(
  candidate: ECSOrchestratorCandidate,
): ECSOrchestratorUITarget[] {
  return Array.isArray(candidate.uiTargets) && candidate.uiTargets.length > 0
    ? candidate.uiTargets
    : ['dashboard', 'brief'];
}

function supportsTarget(
  candidate: ECSOrchestratorCandidate,
  target: ECSOrchestratorUITarget,
): boolean {
  return candidateTargets(candidate).includes(target);
}

function roleForTarget(
  candidate: ECSOrchestratorCandidate,
  target: ECSOrchestratorUITarget,
): ECSOrchestratorTargetRole {
  return candidate.targetRoles?.[target]
    ?? (supportsTarget(candidate, target) ? 'support' : 'suppressed');
}

function roleRank(
  role: ECSOrchestratorTargetRole,
): number {
  switch (role) {
    case 'lead':
      return 0;
    case 'support':
      return 1;
    default:
      return 2;
  }
}

function applyTargetPresentation(
  candidate: ECSOrchestratorCandidate,
  target: ECSOrchestratorUITarget,
): ECSOrchestratorCandidate {
  const presentation = candidate.targetPresentation?.[target];

  if (!presentation) {
    return candidate;
  }

  return {
    ...candidate,
    title: presentation.title ?? candidate.title,
    summary: presentation.summary ?? candidate.summary,
    explanation:
      presentation.explanation === undefined
        ? candidate.explanation
        : presentation.explanation,
  };
}

export function selectOrchestratorTargetView(
  output: ECSOrchestratorOutput | null | undefined,
  target: ECSOrchestratorUITarget,
): ECSOrchestratorTargetView {
  if (!output) {
    return {
      primary: null,
      secondary: [],
      passive: [],
      suppressed: [],
    };
  }

  const activeCandidates = [
    output.primary ?? null,
    ...output.secondary,
    ...output.passive,
  ].filter((candidate): candidate is ECSOrchestratorCandidate => !!candidate);

  const filtered = activeCandidates
    .map((candidate, index) => ({
      candidate: applyTargetPresentation(candidate, target),
      index,
      role: roleForTarget(candidate, target),
    }))
    .filter((entry) => entry.role !== 'suppressed')
    .sort((left, right) => {
      const roleDelta = roleRank(left.role) - roleRank(right.role);
      if (roleDelta !== 0) {
        return roleDelta;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.candidate);

  const suppressed = [
    ...activeCandidates.filter((candidate) => candidate.targetRoles?.[target] === 'suppressed'),
    ...output.suppressed,
  ]
    .filter((candidate, index, candidates) => candidates.findIndex((item) => item.id === candidate.id) === index)
    .filter((candidate) => {
      return candidate.targetRoles?.[target] === 'suppressed' || supportsTarget(candidate, target);
    })
    .map((candidate) => applyTargetPresentation(candidate, target));

  return {
    primary: filtered[0] ?? null,
    secondary: filtered.slice(1, 4),
    passive: filtered.slice(4),
    suppressed,
  };
}

export function selectPrimaryCandidateForTarget(
  output: ECSOrchestratorOutput | null | undefined,
  target: ECSOrchestratorUITarget,
): ECSOrchestratorCandidate | null {
  return selectOrchestratorTargetView(output, target).primary;
}

export function selectSecondaryCandidatesForTarget(
  output: ECSOrchestratorOutput | null | undefined,
  target: ECSOrchestratorUITarget,
  limit = 3,
): ECSOrchestratorCandidate[] {
  return selectOrchestratorTargetView(output, target).secondary.slice(0, limit);
}
