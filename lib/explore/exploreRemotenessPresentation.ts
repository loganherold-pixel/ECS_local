import type { ExpeditionOpportunity } from '../discoverEngine';
import type { RouteConfidenceResult } from '../routeConfidencePresentation';
import type { ECSConfidenceResult } from '../ai/confidenceTypes';
import type { AIRouteConfidence } from '../aiRouteTypes';
import { deriveExploreLiveConfidence } from './exploreLiveConfidence';

type ExploreRemotenessRoute = Partial<ExpeditionOpportunity> & {
  recommendationConfidence?: ECSConfidenceResult;
  aiConfidence?: AIRouteConfidence;
  confidence?: AIRouteConfidence | string | number;
};

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeRemotenessScore(value: unknown): number {
  const score = finiteNumber(value);
  if (score == null) return 0;
  if (score >= 0 && score < 1) return score * 100;
  if (score <= 10) return score * 10;
  return Math.max(0, Math.min(100, score));
}

export function getExploreRemotenessRating(route: ExploreRemotenessRoute): 'A' | 'B' | 'C' | 'D' {
  const score = normalizeRemotenessScore(route.remotenessScore);
  if (score >= 76) return 'A';
  if (score >= 51) return 'B';
  if (score >= 26) return 'C';
  return 'D';
}

export function getExploreRouteConfidencePercent(
  route: ExploreRemotenessRoute,
  routeConfidence?: RouteConfidenceResult | null,
): number {
  const liveConfidence = deriveExploreLiveConfidence(route);
  if (liveConfidence.score != null) return liveConfidence.score;

  switch (routeConfidence?.level) {
    case 'high':
      return 86;
    case 'medium':
      return 72;
    case 'low':
      return 56;
    default:
      return 44;
  }
}
