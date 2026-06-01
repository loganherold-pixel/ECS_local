import type {
  CampIntelComparisonEntry,
  CampIntelComparisonHighlight,
  CampIntelComparisonResult,
  CampIntelSite,
} from './campIntelTypes';

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function toEntry(site: CampIntelSite): CampIntelComparisonEntry {
  return {
    siteId: site.id,
    label: site.label,
    quickVerdict: site.quickVerdict,
    categoryLabel: site.categoryLabel,
    arrivalRiskScore: site.compareMetrics.arrivalRiskScore,
    overnightSuitabilityScore: site.compareMetrics.overnightSuitabilityScore,
    departureRiskScore: site.compareMetrics.departureRiskScore,
    overallScore: site.overallScore,
    confidenceScore: site.compareMetrics.confidenceScore,
    vehicleFitScore: site.compareMetrics.vehicleFitScore,
    windExposureScore: site.compareMetrics.windExposureScore,
    routeDetourMiles: site.compareMetrics.routeDetourMiles,
    bailoutDistanceMiles: site.compareMetrics.bailoutDistanceMiles,
    fuelDistanceMiles: site.compareMetrics.fuelDistanceMiles,
    privacyScore: site.compareMetrics.privacyScore,
    shelterScore: site.compareMetrics.shelterScore,
    complianceCertaintyScore: site.compareMetrics.complianceCertaintyScore,
  };
}

function lowest(sites: CampIntelSite[], selector: (site: CampIntelSite) => number | null | undefined): CampIntelSite | null {
  const candidates = sites
    .map((site) => ({ site, value: selector(site) }))
    .filter((entry): entry is { site: CampIntelSite; value: number } => typeof entry.value === 'number' && Number.isFinite(entry.value));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.value - b.value || b.site.confidenceScore - a.site.confidenceScore);
  return candidates[0]?.site ?? null;
}

function highest(sites: CampIntelSite[], selector: (site: CampIntelSite) => number | null | undefined): CampIntelSite | null {
  const candidates = sites
    .map((site) => ({ site, value: selector(site) }))
    .filter((entry): entry is { site: CampIntelSite; value: number } => typeof entry.value === 'number' && Number.isFinite(entry.value));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.value - a.value || b.site.confidenceScore - a.site.confidenceScore);
  return candidates[0]?.site ?? null;
}

function buildHighlight(id: string, site: CampIntelSite | null, label: string, summary: string): CampIntelComparisonHighlight | null {
  if (!site) return null;
  return {
    id,
    siteId: site.id,
    label,
    summary,
  };
}

export function compareCampIntelSites(sites: CampIntelSite[]): CampIntelComparisonResult | null {
  const uniqueSites = Array.from(new Map(sites.map((site) => [site.id, site])).values()).slice(0, 3);
  if (uniqueSites.length < 2) return null;

  const bestTonight = highest(uniqueSites, (site) => site.overnightSuitabilityScore * 0.58 + (100 - site.arrivalRiskScore) * 0.24 + site.confidenceScore * 0.18);
  const easiestArrival = lowest(uniqueSites, (site) => site.arrivalRiskScore);
  const easiestDeparture = lowest(uniqueSites, (site) => site.departureRiskScore);
  const mostSheltered = highest(uniqueSites, (site) => site.compareMetrics.shelterScore - site.compareMetrics.windExposureScore * 0.45);
  const bestVehicleFit = highest(uniqueSites, (site) => site.compareMetrics.vehicleFitScore);
  const lowestConfidence = lowest(uniqueSites, (site) => site.compareMetrics.confidenceScore);
  const bestBackup = uniqueSites
    .filter((site) => site.id !== bestTonight?.id)
    .sort((a, b) =>
      b.overallScore - a.overallScore ||
      b.confidenceScore - a.confidenceScore,
    )[0] ?? null;

  const comparisonSummary = uniq([
    bestTonight ? `${bestTonight.label} is the strongest choice for tonight.` : '',
    easiestArrival && bestTonight && easiestArrival.id !== bestTonight.id
      ? `${easiestArrival.label} is easier to access before dark.`
      : '',
    mostSheltered && bestTonight && mostSheltered.id !== bestTonight.id
      ? `${mostSheltered.label} is more sheltered, but not the top overall recommendation.`
      : '',
    easiestDeparture && bestTonight && easiestDeparture.id !== bestTonight.id
      ? `${easiestDeparture.label} offers the easiest morning departure.`
      : '',
    lowestConfidence
      ? `${lowestConfidence.label} carries the lowest confidence in this set.`
      : '',
  ]).slice(0, 5);

  const compareHighlights = [
    buildHighlight('best-tonight', bestTonight, 'Best for tonight', `${bestTonight?.label} balances arrival, overnight stability, and confidence best.`),
    buildHighlight('easiest-arrival', easiestArrival, 'Easiest arrival', `${easiestArrival?.label} is the simplest approach in this comparison set.`),
    buildHighlight('easiest-departure', easiestDeparture, 'Easiest departure', `${easiestDeparture?.label} has the cleanest morning exit profile.`),
    buildHighlight('most-sheltered', mostSheltered, 'Most sheltered', `${mostSheltered?.label} looks best protected from wind and exposure.`),
    buildHighlight('best-vehicle-fit', bestVehicleFit, 'Best for this vehicle', `${bestVehicleFit?.label} matches the current vehicle setup best.`),
    buildHighlight('best-backup', bestBackup, 'Best backup choice', `${bestBackup?.label} is the strongest fallback if the top site does not work.`),
    buildHighlight('lowest-confidence', lowestConfidence, 'Lowest confidence option', `${lowestConfidence?.label} remains the least certain recommendation in this group.`),
  ].filter((highlight): highlight is CampIntelComparisonHighlight => Boolean(highlight));

  return {
    comparisonSummary,
    compareHighlights,
    entries: uniqueSites.map(toEntry),
  };
}
