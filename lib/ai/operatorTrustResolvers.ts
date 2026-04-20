import type { ECSOrchestratorCandidate } from './orchestratorTypes';
import type { ECSPriorityLevel, ECSPriorityResult } from './priorityTypes';
import type { ECSExplanationResult } from './recommendationExplanationTypes';
import type { ECSOperatorTrustDescriptor, ECSOperatorTrustMode } from './operatorTrustTypes';

export const ECS_OPERATOR_TRUST_DESCRIPTORS: ECSOperatorTrustDescriptor[] = [
  {
    mode: 'conservative_guidance',
    label: 'Conservative Guidance',
    shortDescription: 'Show more proactive expedition advisories.',
    detail: 'Promotes earlier caution for planning, route margin, and readiness notes without weakening hard safety rules.',
  },
  {
    mode: 'balanced_command',
    label: 'Balanced Command',
    shortDescription: 'Default ECS recommendation balance.',
    detail: 'Keeps recommendation surfacing disciplined and context-aware across Dashboard, Explore, Brief, and route command surfaces.',
  },
  {
    mode: 'minimal_advisory',
    label: 'Minimal Advisory',
    shortDescription: 'Keep low-priority recommendations quieter.',
    detail: 'Suppresses low-value advisory chatter more aggressively while still preserving real warning and critical issues.',
  },
];

export function describeOperatorTrustMode(
  mode: ECSOperatorTrustMode,
): ECSOperatorTrustDescriptor {
  return ECS_OPERATOR_TRUST_DESCRIPTORS.find((entry) => entry.mode === mode)
    ?? ECS_OPERATOR_TRUST_DESCRIPTORS[1];
}

function confidencePenalty(
  candidate: ECSOrchestratorCandidate,
): number {
  switch (candidate.confidence?.level) {
    case 'high':
      return 4;
    case 'moderate':
      return 0;
    case 'limited':
      return -8;
    case 'low':
      return -16;
    case 'unknown':
    default:
      return -12;
  }
}

function advisoryLevel(
  priority: ECSPriorityResult | null | undefined,
): ECSPriorityLevel {
  return priority?.level ?? 'informational';
}

function isSafetyProtected(
  candidate: ECSOrchestratorCandidate,
): boolean {
  const level = advisoryLevel(candidate.priority);
  return level === 'warning'
    || level === 'critical'
    || candidate.priority?.requiresAlertSurface === true
    || candidate.source === 'safety';
}

function sourceWeight(
  candidate: ECSOrchestratorCandidate,
): number {
  switch (candidate.source) {
    case 'route_risk':
    case 'route_viability':
    case 'weather':
    case 'bailout':
      return 12;
    case 'offline_readiness':
    case 'resource_status':
      return 10;
    case 'vehicle_assessment':
      return 9;
    case 'explore':
      return 14;
    case 'brief':
      return 7;
    case 'remoteness':
      return 6;
    default:
      return 0;
  }
}

export function trustModeCandidateScoreAdjustment(
  candidate: ECSOrchestratorCandidate,
  mode: ECSOperatorTrustMode,
): number {
  if (mode === 'balanced_command') {
    return 0;
  }

  if (isSafetyProtected(candidate)) {
    return 0;
  }

  const baseWeight = sourceWeight(candidate);
  const confidenceDelta = confidencePenalty(candidate);
  const level = advisoryLevel(candidate.priority);

  if (mode === 'conservative_guidance') {
    if (level === 'informational') {
      return Math.round(baseWeight * 0.85) + confidenceDelta;
    }
    if (level === 'advisory') {
      return baseWeight + confidenceDelta;
    }
    if (level === 'caution') {
      return Math.round(baseWeight * 0.45) + Math.max(confidenceDelta, -4);
    }
    return 0;
  }

  if (level === 'informational') {
    return -(baseWeight + 18) + Math.min(confidenceDelta, 0);
  }
  if (level === 'advisory') {
    return -(baseWeight + 12) + Math.min(confidenceDelta, 0);
  }
  if (level === 'caution') {
    return -Math.round(baseWeight * 0.55) + Math.min(confidenceDelta, 0);
  }
  return 0;
}

export function trustModeSecondaryLimit(
  mode: ECSOperatorTrustMode,
): number {
  switch (mode) {
    case 'conservative_guidance':
      return 4;
    case 'minimal_advisory':
      return 2;
    case 'balanced_command':
    default:
      return 3;
  }
}

export function trustModeSupportsSecondary(
  candidate: ECSOrchestratorCandidate,
  mode: ECSOperatorTrustMode,
  index: number,
): boolean {
  if (isSafetyProtected(candidate)) {
    return true;
  }

  const rank = candidate.priority?.rank ?? 1;

  if (mode === 'minimal_advisory') {
    if (rank >= 4) return true;
    if (candidate.confidence?.level === 'high' && index === 0) return true;
    return rank >= 3 && index === 0;
  }

  if (mode === 'conservative_guidance') {
    return rank >= 2 || index < 3;
  }

  return rank >= 3 || index < 2;
}

export function trustModeSuppressesPassiveCandidate(
  candidate: ECSOrchestratorCandidate,
  mode: ECSOperatorTrustMode,
): boolean {
  if (isSafetyProtected(candidate)) {
    return false;
  }

  const rank = candidate.priority?.rank ?? 1;

  if (mode === 'minimal_advisory') {
    return rank <= 2 || candidate.confidence?.level === 'low' || candidate.confidence?.level === 'unknown';
  }

  return false;
}

export function trustModePresentationExplanation(
  explanation: ECSExplanationResult | null | undefined,
  mode: ECSOperatorTrustMode,
): ECSExplanationResult | null | undefined {
  if (!explanation) return explanation;

  if (mode === 'minimal_advisory' && explanation.shortText) {
    return {
      ...explanation,
      text: explanation.shortText,
    };
  }

  return explanation;
}

export function trustModeBriefLimits(
  mode: ECSOperatorTrustMode,
): { recommendations: number; advisories: number } {
  switch (mode) {
    case 'conservative_guidance':
      return { recommendations: 6, advisories: 7 };
    case 'minimal_advisory':
      return { recommendations: 3, advisories: 4 };
    case 'balanced_command':
    default:
      return { recommendations: 5, advisories: 6 };
  }
}

export function trustModeBriefNote(
  mode: ECSOperatorTrustMode,
  note: string | null | undefined,
): string | null {
  if (!note) return null;
  if (mode !== 'minimal_advisory') return note;
  return note.length > 88 ? `${note.slice(0, 85).trimEnd()}...` : note;
}

export function trustModeExploreScoreAdjustment(args: {
  mode: ECSOperatorTrustMode;
  confidenceLevel: string | null | undefined;
  section: 'hidden_gem' | 'popular_trail';
}): number {
  const sectionWeight = args.section === 'hidden_gem' ? 1.15 : 1;

  switch (args.mode) {
    case 'conservative_guidance':
      switch (args.confidenceLevel) {
        case 'high':
          return Math.round(10 * sectionWeight);
        case 'moderate':
          return Math.round(6 * sectionWeight);
        case 'limited':
          return -2;
        default:
          return -8;
      }
    case 'minimal_advisory':
      switch (args.confidenceLevel) {
        case 'high':
          return -2;
        case 'moderate':
          return -8;
        case 'limited':
          return -16;
        default:
          return -24;
      }
    case 'balanced_command':
    default:
      return 0;
  }
}

export function trustModeExploreVisibility(
  visibility: 'surface' | 'softened' | 'suppressed',
  args: {
    mode: ECSOperatorTrustMode;
    confidenceLevel: string | null | undefined;
  },
): 'surface' | 'softened' | 'suppressed' {
  if (visibility === 'suppressed') {
    return visibility;
  }

  if (args.mode === 'minimal_advisory') {
    if (args.confidenceLevel === 'limited') {
      return 'suppressed';
    }
    if (args.confidenceLevel === 'moderate' && visibility === 'surface') {
      return 'softened';
    }
  }

  if (args.mode === 'conservative_guidance') {
    if (args.confidenceLevel === 'moderate' && visibility === 'softened') {
      return 'surface';
    }
  }

  return visibility;
}
