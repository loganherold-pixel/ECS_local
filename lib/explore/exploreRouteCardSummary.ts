import type { ExploreWizardRouteCandidate } from './exploreTripBuilderWizard';

export type ExploreRouteCardSummary = {
  status: string;
  currentCondition: string;
  why: string;
  whatToWatch: string;
  recommendedAction: string;
  toImproveStatus: string;
};

function metadataRecord(candidate: ExploreWizardRouteCandidate): Record<string, unknown> {
  const metadata = candidate.route.routeMetadata;
  return metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata : {};
}

function toCleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean.length > 0 ? clean : null;
}

function normalizeText(value: string): string {
  const lower = value.trim();
  return lower.length > 0 ? lower.charAt(0).toUpperCase() + lower.slice(1) : lower;
}

function arrayFromValues(...values: unknown[]): string[] {
  const output: string[] = [];
  values.forEach((value) => {
    if (Array.isArray(value)) {
      value.forEach((entry) => {
        const clean = toCleanText(entry);
        if (clean) output.push(clean);
      });
      return;
    }
    const clean = toCleanText(value);
    if (clean) output.push(clean);
  });
  return output;
}

function conciseLine(values: string[], fallback: string, max = 2): string {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = value.trim().replace(/\s+/g, ' ');
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    output.push(output.length === 0 ? normalizeText(clean) : clean);
    if (output.length >= max) break;
  }
  return output.length > 0 ? output.join('; ') : fallback;
}

export function buildExploreRouteCardSummary(
  candidate: ExploreWizardRouteCandidate,
): ExploreRouteCardSummary {
  const metadata = metadataRecord(candidate);
  const confidenceReasons = candidate.confidence.reasons;
  const warnings = candidate.warnings;
  const currentConditions = arrayFromValues(
    metadata.currentConditions,
    metadata.currentCondition,
    metadata.conditions,
    metadata.conditionSummary,
  );
  const recommendedActions = arrayFromValues(
    metadata.recommendedActions,
    metadata.recommendedAction,
    metadata.action,
  );
  const improvementActions = arrayFromValues(
    metadata.improvementActions,
    metadata.toImproveStatus,
    metadata.improveStatus,
    metadata.statusImprovement,
  );

  return {
    status: candidate.guidanceReady ? 'Guidance ready' : 'Review required',
    currentCondition: conciseLine(
      currentConditions,
      candidate.navigationPayload.hasOwnProperty('trailGeometry')
        ? 'Route geometry ready for preview and Start'
        : 'Route condition needs review',
    ),
    why: conciseLine(
      [...confidenceReasons, ...arrayFromValues(candidate.route.highlights)],
      'Active route geometry is available',
    ),
    whatToWatch: conciseLine(
      [...warnings, ...arrayFromValues(metadata.whatToWatch, metadata.watchItems)],
      'Verify current closures, weather, and access before departure',
    ),
    recommendedAction: conciseLine(
      recommendedActions,
      'Preview the route, then start guidance when staged',
    ),
    toImproveStatus: conciseLine(
      improvementActions,
      candidate.confidence.score == null
        ? 'Add verified source confidence or current field notes'
        : 'Cache route and verify field conditions before departure',
    ),
  };
}
