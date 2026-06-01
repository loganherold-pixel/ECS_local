import type { ExpeditionOpportunity } from '../discoverEngine';

export type ExploreRefinementFilter = 'remoteness' | 'dayTrip' | 'weekendTrip' | 'expedition';

export const EXPLORE_REFINEMENT_OPTIONS: { key: ExploreRefinementFilter; label: string }[] = [
  { key: 'remoteness', label: 'Remoteness' },
  { key: 'dayTrip', label: 'Day Trip' },
  { key: 'weekendTrip', label: 'Weekend Trip' },
  { key: 'expedition', label: 'Expedition' },
];

type RefinableTrail = Partial<ExpeditionOpportunity> & object;

function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function getTrailDurationDays(trail: RefinableTrail): number | null {
  const fields = trail as Partial<ExpeditionOpportunity> & Record<string, unknown>;
  const directDays =
    finiteNumber(fields.estimatedDays) ??
    finiteNumber(fields.durationDays) ??
    finiteNumber(fields.routeDurationDays);
  if (directDays != null) return directDays;

  const durationHours =
    finiteNumber(fields.estimatedTravelHours) ??
    finiteNumber(fields.estimatedDurationHours) ??
    finiteNumber(fields.routeDurationHours);
  if (durationHours != null) {
    return Math.max(0.1, durationHours / 24);
  }

  return null;
}

function getTrailDurationHint(trail: RefinableTrail): ExploreRefinementFilter | null {
  const fields = trail as Partial<ExpeditionOpportunity> & Record<string, unknown>;
  const searchable = [
    fields.tripMode,
    fields.routeLabel,
    fields.category,
    fields.discoveryCategory,
    fields.name,
    fields.description,
    ...(Array.isArray(fields.highlights) ? fields.highlights : []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (/\b(day trip|day-trip|short route|local route|same day|single day)\b/.test(searchable)) {
    return 'dayTrip';
  }
  if (/\b(weekend|overnight|two day|2 day|1-2 day|1 to 2 day)\b/.test(searchable)) {
    return 'weekendTrip';
  }
  if (/\b(expedition|multi-day|multi day|backcountry travel|extended travel)\b/.test(searchable)) {
    return 'expedition';
  }

  return null;
}

function normalizedRemoteScore(value: unknown): number | null {
  const score = finiteNumber(value);
  if (score == null) return null;
  if (score <= 1) return score * 10;
  if (score <= 10) return score;
  return score / 10;
}

export function getExploreRemotenessSortScore(trail: RefinableTrail): number {
  const fields = trail as Partial<ExpeditionOpportunity> & Record<string, unknown>;
  const remoteness = normalizedRemoteScore(fields.remotenessScore);
  if (remoteness != null) return remoteness;

  const solitude = normalizedRemoteScore(fields.solitudeScore);
  if (solitude != null) return solitude;

  const popularity = finiteNumber(fields.popularityScore ?? fields.popularity);
  if (popularity != null) {
    const normalizedPopularity = popularity <= 1 ? popularity * 100 : popularity;
    return Math.max(0, Math.min(10, (100 - normalizedPopularity) / 10));
  }

  if (fields.hiddenGem === true) return 7;

  const label = String(fields.routeLabel ?? '').toLowerCase();
  if (label.includes('remote')) return 8;
  if (label.includes('hidden gem')) return 7;
  return 0;
}

export function isRemoteTrail(trail: RefinableTrail): boolean {
  const fields = trail as Partial<ExpeditionOpportunity> & Record<string, unknown>;
  const remoteness = normalizedRemoteScore(fields.remotenessScore);
  if (remoteness != null) return remoteness >= 7;

  const solitude = normalizedRemoteScore(fields.solitudeScore);
  if (solitude != null) return solitude >= 7;

  const popularity = finiteNumber(fields.popularityScore ?? fields.popularity);
  if (popularity != null) {
    const normalizedPopularity = popularity <= 1 ? popularity * 100 : popularity;
    return normalizedPopularity <= 30;
  }

  if (fields.hiddenGem === true) return true;

  const label = String(fields.routeLabel ?? '').toLowerCase();
  return label.includes('remote') || label.includes('hidden gem');
}

export function trailMatchesExploreRefinement(
  trail: RefinableTrail,
  refinement: ExploreRefinementFilter | null,
): boolean {
  if (!refinement) return true;

  if (refinement === 'remoteness') {
    return isRemoteTrail(trail);
  }

  const days = getTrailDurationDays(trail);
  if (days == null) {
    return getTrailDurationHint(trail) === refinement;
  }

  switch (refinement) {
    case 'dayTrip':
      return days <= 1;
    case 'weekendTrip':
      return days > 1 && days <= 2;
    case 'expedition':
      return days >= 3;
    default:
      return true;
  }
}

export function applyExploreRefinementFilter<T extends RefinableTrail>(
  trails: T[],
  refinement: ExploreRefinementFilter | null,
): T[] {
  if (!refinement) return trails;
  if (refinement === 'remoteness') {
    return trails
      .slice()
      .sort((left, right) => {
        const scoreDiff = getExploreRemotenessSortScore(right) - getExploreRemotenessSortScore(left);
        if (scoreDiff !== 0) return scoreDiff;
        const leftName = String((left as Record<string, unknown>).name ?? '');
        const rightName = String((right as Record<string, unknown>).name ?? '');
        return leftName.localeCompare(rightName);
      });
  }
  const matched = trails.filter((trail) => trailMatchesExploreRefinement(trail, refinement));
  if (matched.length > 0) return matched;

  // Keep Explore from presenting a false empty state when imported or generated routes
  // are missing duration metadata. The active chip still communicates the requested
  // refinement, but unknown-duration records remain visible instead of blanking the panel.
  return trails.filter((trail) => getTrailDurationDays(trail) == null);
}

export function getExploreRefinementCounts<T extends RefinableTrail>(
  trails: T[],
): Record<ExploreRefinementFilter, number> {
  return EXPLORE_REFINEMENT_OPTIONS.reduce(
    (counts, option) => {
      counts[option.key] = applyExploreRefinementFilter(trails, option.key).length;
      return counts;
    },
    {
      remoteness: 0,
      dayTrip: 0,
      weekendTrip: 0,
      expedition: 0,
    } as Record<ExploreRefinementFilter, number>,
  );
}
