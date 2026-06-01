import type { ECSAIContext } from '../aiContextBuilder';
import type { ECSExpeditionPhase } from './expeditionPhaseTypes';
import type {
  ECSOrchestratorCandidate,
  ECSOrchestratorTargetPresentation,
  ECSOrchestratorTargetRole,
  ECSOrchestratorUITarget,
  ECSRootConditionIdentity,
} from './orchestratorTypes';
import { resolveRootConditionIdentity } from './rootConditionIdentity';

type RankedOrchestratorCandidate = ECSOrchestratorCandidate & { _score: number };

type CandidateDeduplicationArgs = {
  ranked: RankedOrchestratorCandidate[];
  richContext: ECSAIContext | null;
  previousOutput?: {
    primary?: ECSOrchestratorCandidate | null;
    secondary?: ECSOrchestratorCandidate[];
    passive?: ECSOrchestratorCandidate[];
  } | null;
};

type CandidateDeduplicationResult = {
  kept: RankedOrchestratorCandidate[];
  suppressed: RankedOrchestratorCandidate[];
};

function candidateTargets(
  candidate: ECSOrchestratorCandidate,
): ECSOrchestratorUITarget[] {
  return Array.isArray(candidate.uiTargets) && candidate.uiTargets.length > 0
    ? candidate.uiTargets
    : ['dashboard', 'brief'];
}

function cleanText(value: string | null | undefined): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampText(value: string | null | undefined, max = 96): string | null {
  const text = cleanText(value);
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function clampPresentationText(value: string | null | undefined, max = 96): string | null {
  const text = cleanText(value);
  if (!text) return null;
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 3)).trimEnd()}...`;
}

function explanationForText(
  value: string | null | undefined,
): ECSOrchestratorTargetPresentation['explanation'] {
  const text = clampPresentationText(value, 124);
  if (!text) return undefined;
  return { text, shortText: clampPresentationText(text, 84) ?? text };
}

function priorityRank(candidate: ECSOrchestratorCandidate): number {
  return candidate.priority?.rank ?? 1;
}

function isPlanningPhase(phase: ECSExpeditionPhase | null | undefined): boolean {
  return phase === 'vehicle_setup' || phase === 'staging';
}

function isFieldPhase(phase: ECSExpeditionPhase | null | undefined): boolean {
  return phase === 'transit'
    || phase === 'trail_entry'
    || phase === 'active_expedition'
    || phase === 'recovery_exit';
}

function buildPreviousRootStateMap(
  previousOutput: CandidateDeduplicationArgs['previousOutput'],
): Map<string, ECSOrchestratorCandidate> {
  const map = new Map<string, ECSOrchestratorCandidate>();
  if (!previousOutput) return map;

  const previousCandidates = [
    previousOutput.primary ?? null,
    ...(previousOutput.secondary ?? []),
    ...(previousOutput.passive ?? []),
  ].filter((candidate): candidate is ECSOrchestratorCandidate => !!candidate);

  previousCandidates.forEach((candidate) => {
    const root = resolveRootConditionIdentity(candidate);
    if (!map.has(root.key)) {
      map.set(root.key, candidate);
    }
  });

  return map;
}

function isSamePresentationState(
  current: ECSOrchestratorCandidate,
  previous: ECSOrchestratorCandidate | null | undefined,
): boolean {
  if (!previous) return false;

  return (
    current.source === previous.source
    && current.groupKey === previous.groupKey
    && current.phase === previous.phase
    && current.priority?.level === previous.priority?.level
    && current.confidence?.level === previous.confidence?.level
    && cleanText(current.title) === cleanText(previous.title)
    && cleanText(current.summary) === cleanText(previous.summary)
  );
}

function shouldSuppressBeforeGrouping(
  candidate: ECSOrchestratorCandidate,
  richContext: ECSAIContext | null,
): boolean {
  const routeActive = !!richContext?.meta.hasActiveRoute || !!richContext?.meta.hasActiveRun;
  const confidenceLevel = String(candidate.confidence?.level ?? '').toLowerCase();
  const rank = priorityRank(candidate);

  if (routeActive && candidate.source === 'explore') {
    return true;
  }

  if (
    rank <= 2
    && (confidenceLevel === 'low' || confidenceLevel === 'unknown')
    && (candidate.source === 'explore' || candidate.source === 'brief' || candidate.source === 'sync')
  ) {
    return true;
  }

  return false;
}

function selectLeadTarget(
  candidate: ECSOrchestratorCandidate,
  root: ECSRootConditionIdentity,
  richContext: ECSAIContext | null,
): ECSOrchestratorUITarget | null {
  const supportedTargets = candidateTargets(candidate);
  const phase = candidate.phase ?? richContext?.phase?.current.phase ?? null;
  const routeActive = !!richContext?.meta.hasActiveRoute || !!richContext?.meta.hasActiveRun;
  const planningPhase = isPlanningPhase(phase);
  const fieldPhase = isFieldPhase(phase);

  const preferences: ECSOrchestratorUITarget[] = [];

  switch (root.family) {
    case 'weather_route_exposure':
    case 'route_risk_elevation':
    case 'gps_guidance_degradation':
    case 'bailout_relevance':
    case 'resource_margin_decline':
      if (routeActive || fieldPhase) {
        preferences.push('navigate', 'alert', 'dashboard', 'brief');
      } else if (planningPhase) {
        preferences.push('dashboard', 'brief', 'navigate', 'alert');
      } else {
        preferences.push('dashboard', 'navigate', 'brief', 'alert');
      }
      break;
    case 'telemetry_disconnect':
      preferences.push(
        planningPhase ? 'fleet' : 'dashboard',
        'dashboard',
        'fleet',
        'brief',
        'navigate',
        'alert',
      );
      break;
    case 'offline_capable_operation':
    case 'degraded_operations':
      preferences.push(
        routeActive ? 'dashboard' : 'brief',
        'dashboard',
        'brief',
        'fleet',
        'navigate',
        'alert',
      );
      break;
    case 'route_fit_limitation':
    case 'vehicle_readiness_gap':
      preferences.push('fleet', 'dashboard', 'brief', 'explore', 'alert');
      break;
    case 'mission_planning_readiness':
      preferences.push('fleet', 'dashboard', 'brief', 'explore');
      break;
    case 'planning_recommendation':
      preferences.push('explore', 'dashboard', 'brief');
      break;
    case 'stale_weather_support':
      preferences.push(planningPhase ? 'brief' : 'dashboard', 'dashboard', 'brief', 'navigate');
      break;
    case 'operational_alert':
      preferences.push('alert', 'dashboard', 'navigate', 'brief');
      break;
    default:
      preferences.push('dashboard', 'brief', 'navigate', 'alert', 'fleet', 'explore');
      break;
  }

  return preferences.find((target) => supportedTargets.includes(target)) ?? supportedTargets[0] ?? null;
}

function buildSupportTargets(
  candidate: ECSOrchestratorCandidate,
  root: ECSRootConditionIdentity,
  leadTarget: ECSOrchestratorUITarget | null,
  richContext: ECSAIContext | null,
  fatigued: boolean,
): ECSOrchestratorUITarget[] {
  const supportedTargets = candidateTargets(candidate).filter((target) => target !== leadTarget);
  const phase = candidate.phase ?? richContext?.phase?.current.phase ?? null;
  const routeActive = !!richContext?.meta.hasActiveRoute || !!richContext?.meta.hasActiveRun;
  const fieldPhase = isFieldPhase(phase);
  const rank = priorityRank(candidate);
  const severe = rank >= 4 || candidate.priority?.requiresAlertSurface === true;

  const supports: ECSOrchestratorUITarget[] = [];

  switch (root.family) {
    case 'weather_route_exposure':
    case 'route_risk_elevation':
    case 'gps_guidance_degradation':
    case 'bailout_relevance':
    case 'resource_margin_decline':
      if (supportedTargets.includes('alert') && severe && leadTarget !== 'alert') {
        supports.push('alert');
      }
      if (supportedTargets.includes('dashboard') && leadTarget !== 'dashboard') {
        supports.push('dashboard');
      }
      if (supportedTargets.includes('brief') && !fatigued && leadTarget !== 'brief') {
        supports.push('brief');
      }
      break;
    case 'telemetry_disconnect':
      if (supportedTargets.includes('dashboard') && leadTarget !== 'dashboard') {
        supports.push('dashboard');
      }
      if (supportedTargets.includes('fleet') && leadTarget !== 'fleet') {
        supports.push('fleet');
      }
      if (supportedTargets.includes('brief') && !fatigued) {
        supports.push('brief');
      }
      if (supportedTargets.includes('alert') && severe) {
        supports.push('alert');
      }
      if (supportedTargets.includes('navigate') && severe && routeActive) {
        supports.push('navigate');
      }
      break;
    case 'offline_capable_operation':
    case 'degraded_operations':
      if (supportedTargets.includes('dashboard') && leadTarget !== 'dashboard') {
        supports.push('dashboard');
      }
      if (supportedTargets.includes('brief') && !fatigued && leadTarget !== 'brief') {
        supports.push('brief');
      }
      if (supportedTargets.includes('navigate') && severe && (routeActive || fieldPhase)) {
        supports.push('navigate');
      }
      if (supportedTargets.includes('alert') && rank >= 4) {
        supports.push('alert');
      }
      break;
    case 'route_fit_limitation':
    case 'vehicle_readiness_gap':
      if (supportedTargets.includes('dashboard') && leadTarget !== 'dashboard') {
        supports.push('dashboard');
      }
      if (supportedTargets.includes('brief') && !fatigued && leadTarget !== 'brief') {
        supports.push('brief');
      }
      if (supportedTargets.includes('explore') && leadTarget !== 'explore' && isPlanningPhase(phase)) {
        supports.push('explore');
      }
      if (supportedTargets.includes('alert') && rank >= 4) {
        supports.push('alert');
      }
      break;
    case 'mission_planning_readiness':
      if (supportedTargets.includes('dashboard') && leadTarget !== 'dashboard') {
        supports.push('dashboard');
      }
      if (supportedTargets.includes('brief') && leadTarget !== 'brief' && !fatigued) {
        supports.push('brief');
      }
      if (supportedTargets.includes('explore') && leadTarget !== 'explore' && isPlanningPhase(phase) && !fatigued) {
        supports.push('explore');
      }
      break;
    case 'planning_recommendation':
      if (!routeActive && phase !== 'recovery_exit') {
        if (supportedTargets.includes('dashboard') && leadTarget !== 'dashboard' && !fatigued) {
          supports.push('dashboard');
        }
        if (supportedTargets.includes('brief') && leadTarget !== 'brief' && !fatigued) {
          supports.push('brief');
        }
      }
      break;
    case 'stale_weather_support':
      if (supportedTargets.includes('dashboard') && leadTarget !== 'dashboard') {
        supports.push('dashboard');
      }
      if (supportedTargets.includes('brief') && !fatigued && leadTarget !== 'brief') {
        supports.push('brief');
      }
      break;
    case 'operational_alert':
      if (supportedTargets.includes('dashboard') && leadTarget !== 'dashboard') {
        supports.push('dashboard');
      }
      if (supportedTargets.includes('navigate') && leadTarget !== 'navigate' && routeActive) {
        supports.push('navigate');
      }
      if (supportedTargets.includes('brief') && !fatigued) {
        supports.push('brief');
      }
      break;
    default:
      if (supportedTargets.includes('dashboard') && leadTarget !== 'dashboard') {
        supports.push('dashboard');
      }
      if (supportedTargets.includes('brief') && !fatigued && leadTarget !== 'brief') {
        supports.push('brief');
      }
      break;
  }

  return supports.filter((target, index) => supports.indexOf(target) === index);
}

function buildTargetPresentation(
  candidate: ECSOrchestratorCandidate,
  root: ECSRootConditionIdentity,
  leadTarget: ECSOrchestratorUITarget | null,
  supportTargets: ECSOrchestratorUITarget[],
): Partial<Record<ECSOrchestratorUITarget, ECSOrchestratorTargetPresentation>> {
  const presentation: Partial<Record<ECSOrchestratorUITarget, ECSOrchestratorTargetPresentation>> = {};
  const supportedTargets = leadTarget ? [leadTarget, ...supportTargets] : supportTargets;
  const baseSummary = cleanText(candidate.summary) || cleanText(candidate.explanation?.shortText);
  const baseExplanation = cleanText(candidate.explanation?.text) || baseSummary;
  const alertExplanation =
    cleanText(candidate.priority?.shortReason)
    || cleanText(candidate.explanation?.shortText)
    || baseSummary;
  const dashboardSupport =
    cleanText(candidate.explanation?.shortText)
    || clampPresentationText(candidate.summary, 88)
    || candidate.summary;
  const briefSupport =
    cleanText(candidate.explanation?.shortText)
    || clampPresentationText(candidate.summary, 76)
    || candidate.summary;

  supportedTargets.forEach((target) => {
    if (target === leadTarget) {
      if (target === 'alert') {
        presentation[target] = {
          summary: clampPresentationText(baseSummary, 110) ?? candidate.summary,
          explanation: explanationForText(alertExplanation),
        };
        return;
      }

      if (target === 'brief') {
        presentation[target] = {
          summary: clampPresentationText(briefSupport, 82) ?? candidate.summary,
          explanation: explanationForText(baseExplanation),
        };
        return;
      }

      presentation[target] = {
        summary: clampPresentationText(baseSummary, target === 'navigate' ? 100 : 92) ?? candidate.summary,
        explanation: explanationForText(baseExplanation),
      };
      return;
    }

    if (target === 'dashboard') {
      presentation[target] = {
        summary: clampPresentationText(dashboardSupport, 86) ?? candidate.summary,
        explanation: explanationForText(dashboardSupport),
      };
      return;
    }

    if (target === 'brief') {
      presentation[target] = {
        title:
          root.family === 'planning_recommendation' || root.family === 'mission_planning_readiness'
            ? candidate.title
            : undefined,
        summary: clampPresentationText(briefSupport, 78) ?? candidate.summary,
        explanation: explanationForText(briefSupport),
      };
      return;
    }

    if (target === 'alert') {
      presentation[target] = {
        summary: clampPresentationText(alertExplanation, 100) ?? candidate.summary,
        explanation: explanationForText(alertExplanation),
      };
      return;
    }

    presentation[target] = {
      summary: clampPresentationText(baseSummary, 92) ?? candidate.summary,
      explanation: explanationForText(candidate.explanation?.shortText ?? baseSummary),
    };
  });

  return presentation;
}

function decorateLeadCandidate(args: {
  candidate: RankedOrchestratorCandidate;
  rootCondition: ECSRootConditionIdentity;
  richContext: ECSAIContext | null;
  previousRootCandidate: ECSOrchestratorCandidate | null | undefined;
}): RankedOrchestratorCandidate {
  const { candidate, rootCondition, richContext, previousRootCandidate } = args;
  const fatigued =
    priorityRank(candidate) <= 3
    && isSamePresentationState(candidate, previousRootCandidate);
  const leadTarget = selectLeadTarget(candidate, rootCondition, richContext);
  const supportTargets = buildSupportTargets(candidate, rootCondition, leadTarget, richContext, fatigued);
  const targetRoles: Partial<Record<ECSOrchestratorUITarget, ECSOrchestratorTargetRole>> = {};

  candidateTargets(candidate).forEach((target) => {
    targetRoles[target] = 'suppressed';
  });

  if (leadTarget) {
    targetRoles[leadTarget] = 'lead';
  }

  supportTargets.forEach((target) => {
    if (target !== leadTarget) {
      targetRoles[target] = 'support';
    }
  });

  const targetPresentation = buildTargetPresentation(
    candidate,
    rootCondition,
    leadTarget,
    supportTargets,
  );

  return {
    ...candidate,
    groupKey: rootCondition.key,
    rootCondition,
    targetRoles,
    targetPresentation,
  };
}

function decorateSuppressedCandidate(
  candidate: RankedOrchestratorCandidate,
  rootCondition: ECSRootConditionIdentity,
): RankedOrchestratorCandidate {
  return {
    ...candidate,
    groupKey: rootCondition.key,
    rootCondition,
  };
}

export function applyCandidateDeduplication(
  args: CandidateDeduplicationArgs,
): CandidateDeduplicationResult {
  const { ranked, richContext, previousOutput } = args;
  const grouped = new Map<string, RankedOrchestratorCandidate[]>();
  const previousRootMap = buildPreviousRootStateMap(previousOutput);
  const suppressed: RankedOrchestratorCandidate[] = [];

  ranked.forEach((candidate) => {
    if (shouldSuppressBeforeGrouping(candidate, richContext)) {
      const rootCondition = resolveRootConditionIdentity(candidate);
      suppressed.push(decorateSuppressedCandidate(candidate, rootCondition));
      return;
    }

    const rootCondition = resolveRootConditionIdentity(candidate);
    const candidateWithRoot = {
      ...candidate,
      rootCondition,
      groupKey: rootCondition.key,
    };
    const group = grouped.get(rootCondition.key) ?? [];
    group.push(candidateWithRoot);
    grouped.set(rootCondition.key, group);
  });

  const kept: RankedOrchestratorCandidate[] = [];

  grouped.forEach((group, key) => {
    const ordered = [...group].sort((left, right) => {
      if (right._score !== left._score) {
        return right._score - left._score;
      }
      return right.timestamp - left.timestamp;
    });

    const lead = decorateLeadCandidate({
      candidate: ordered[0]!,
      rootCondition: ordered[0]!.rootCondition!,
      richContext,
      previousRootCandidate: previousRootMap.get(key),
    });

    kept.push(lead);

    ordered.slice(1).forEach((candidate) => {
      suppressed.push(decorateSuppressedCandidate(candidate, candidate.rootCondition!));
    });
  });

  const hasHighPriorityIssue = kept.some((candidate) => priorityRank(candidate) >= 4);
  if (hasHighPriorityIssue) {
    const nextKept: RankedOrchestratorCandidate[] = [];
    kept.forEach((candidate) => {
      if (
        (candidate.source === 'sync' || candidate.source === 'brief')
        && priorityRank(candidate) <= 2
      ) {
        suppressed.push(
          decorateSuppressedCandidate(
            candidate,
            candidate.rootCondition ?? resolveRootConditionIdentity(candidate),
          ),
        );
        return;
      }
      nextKept.push(candidate);
    });
    kept.splice(0, kept.length, ...nextKept);
  }

  kept.sort((left, right) => {
    if (right._score !== left._score) {
      return right._score - left._score;
    }
    return right.timestamp - left.timestamp;
  });

  suppressed.sort((left, right) => {
    if (right._score !== left._score) {
      return right._score - left._score;
    }
    return right.timestamp - left.timestamp;
  });

  return { kept, suppressed };
}
