import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { getActiveVehicleContext } from '../activeVehicleContext';
import type { CampsiteCandidateResult } from '../campsiteCandidateEngine';
import { computeHiddenGemScore } from '../discoveryIntelligenceEngine';
import type { ExpeditionForecast } from '../expeditionForecastEngine';
import { createMigratingNonSecureStorage } from '../nonSecureStorage';
import type { RemotenessIndexOutput } from '../remotenessTypes';
import type { RouteIntelligence } from '../routeAnalysisEngine';
import type { TerrainIntelligence } from '../terrainAnalysisEngine';
import { buildCampIntelEngine } from './campIntelEngine';
import { compareCampIntelSites } from './campIntelCompare';
import { buildCampDecisionState } from './campDecisionEngine';
import {
  buildCampIntelStructuredSummary,
  downgradeCampIntelSiteForOffline,
  mapRankedCandidateToSite,
  toCampIntelMarkerPayload,
} from './campIntelSelectors';
import type {
  CampIntelCachedRouteResult,
  CampIntelComparisonResult,
  CampIntelEngineResult,
  CampIntelFeedbackCode,
  CampIntelMarkerPayload,
  CampIntelMissionMode,
  CampIntelPreferenceState,
  CampIntelResourceContext,
  CampIntelRouteWeatherSnapshot,
  CampIntelSite,
  CampIntelStructuredSummary,
  CampIntelSupportSignals,
  CampIntelVehicleContext,
} from './campIntelTypes';
import type { CampDecisionState } from './campDecisionTypes';

const CAMP_INTEL_STORAGE_KEY = 'ecs_camp_intel_preferences_v2';
const CAMP_INTEL_CACHE_STORAGE_KEY = 'ecs_camp_intel_cached_routes_v2';
const campIntelStorage = createMigratingNonSecureStorage('ecs_camp_intel_preferences', {
  logTag: 'CampIntelPreferences',
});

const DEFAULT_PREFERENCES: CampIntelPreferenceState = {
  savedCampIds: [],
  usedCampIds: [],
  rejectedCampIds: [],
  feedbackByCampId: {},
};

const DEFAULT_CACHE_STATE: { byRouteKey: Record<string, CampIntelCachedRouteResult> } = {
  byRouteKey: {},
};

type UseCampIntelOptions = {
  candidates: CampsiteCandidateResult | null;
  routeIntelligence: RouteIntelligence | null;
  terrainIntelligence: TerrainIntelligence | null;
  expeditionForecast: ExpeditionForecast | null;
  remotenessIndex: RemotenessIndexOutput | null;
  routeWeather: CampIntelRouteWeatherSnapshot | null;
  missionMode?: CampIntelMissionMode | null;
  isOnline?: boolean | null;
  resourceContextOverrides?: Partial<CampIntelResourceContext> | null;
  supportSignals?: CampIntelSupportSignals | null;
};

type UseCampIntelResult = {
  hydrated: boolean;
  engineResult: CampIntelEngineResult;
  summary: CampIntelStructuredSummary;
  decision: CampDecisionState;
  allSites: CampIntelSite[];
  visibleSites: CampIntelSite[];
  savedSites: CampIntelSite[];
  getSiteById: (siteId: string | null | undefined) => CampIntelSite | null;
  getNearbySites: (siteId: string, limit?: number) => CampIntelSite[];
  compareSites: (siteIds: string[]) => CampIntelComparisonResult | null;
  compareSiteWithNearby: (siteId: string, limit?: number) => CampIntelComparisonResult | null;
  toggleSavedCamp: (siteId: string) => boolean;
  markCampUsed: (siteId: string) => boolean;
  reportCampUnusable: (siteId: string) => void;
  recordCampFeedback: (siteId: string, feedback: CampIntelFeedbackCode) => boolean;
  getCampFeedback: (siteId: string | null | undefined) => CampIntelFeedbackCode[];
};

type ApproximateVehicleProfile = {
  widthInches: number;
  wheelbaseInches: number;
  clearanceInches: number;
};

function coordinateDistanceScore(a: CampIntelSite, b: CampIntelSite): number {
  return Math.abs(a.coordinate.latitude - b.coordinate.latitude) + Math.abs(a.coordinate.longitude - b.coordinate.longitude);
}

function sitePriority(site: CampIntelSite): number {
  if (site.isSaved) return 6;
  if (site.category === 'saved') return 5;
  if (site.category === 'previously_used') return 4;
  if (site.classification === 'suggested') return 3;
  if (site.classification === 'backup') return 2;
  if (site.classification === 'emergency') return 1;
  return 0;
}

function isMeaningfullyDistinctSite(candidate: CampIntelSite, existing: CampIntelSite): boolean {
  const sameRoute =
    (candidate.sourceRouteId ?? 'none') === (existing.sourceRouteId ?? 'none');
  const closeCluster = coordinateDistanceScore(candidate, existing) < 0.0022;
  const detourGap = Math.abs((candidate.detourDistanceMiles ?? 0) - (existing.detourDistanceMiles ?? 0));
  const tacticalGap =
    Math.abs(candidate.arrivalRiskScore - existing.arrivalRiskScore) >= 14 ||
    Math.abs(candidate.overnightSuitabilityScore - existing.overnightSuitabilityScore) >= 14 ||
    Math.abs(candidate.departureRiskScore - existing.departureRiskScore) >= 14 ||
    Math.abs(candidate.confidenceScore - existing.confidenceScore) >= 12;
  const categoryGap = candidate.classification !== existing.classification;

  if (!sameRoute) return true;
  if (!closeCluster) return true;
  if (detourGap >= 0.45) return true;
  if (tacticalGap) return true;
  if (categoryGap && Math.abs(candidate.overallScore - existing.overallScore) >= 12) return true;
  return false;
}

function dedupeVisibleSites(sites: CampIntelSite[]): CampIntelSite[] {
  const ranked = [...sites].sort((a, b) => {
    const priorityDelta = sitePriority(b) - sitePriority(a);
    if (priorityDelta !== 0) return priorityDelta;
    return (
      b.confidenceScore - a.confidenceScore ||
      b.overallScore - a.overallScore ||
      (a.detourDistanceMiles ?? 999) - (b.detourDistanceMiles ?? 999)
    );
  });

  const curated: CampIntelSite[] = [];
  for (const site of ranked) {
    const overlaps = curated.some((existing) => !isMeaningfullyDistinctSite(site, existing));
    if (overlaps) continue;
    curated.push(site);
  }

  return curated.sort((a, b) => b.overallScore - a.overallScore || b.confidenceScore - a.confidenceScore);
}

function summarizeCachedSites(sites: CampIntelSite[]): string {
  return sites
    .map((site) =>
      [
        site.id,
        site.classification,
        site.confidence,
        site.confidenceScore,
        site.overallScore,
        site.isSaved ? 'saved' : 'unsaved',
        site.wasUsedBefore ? 'used' : 'new',
      ].join(':'),
    )
    .join('|');
}

function summarizeCachedSummary(summary: CampIntelStructuredSummary): string {
  return JSON.stringify({
    available: summary.available,
    viableCount: summary.viableCount,
    suggestedCount: summary.suggestedCount,
    backupCount: summary.backupCount,
    emergencyCount: summary.emergencyCount,
    headline: summary.headline,
    summaryLine: summary.summaryLine,
    routeGuidance: summary.routeGuidance,
    trustNotes: summary.trustNotes,
    bestCandidate: summary.bestCandidate?.id ?? null,
    bestShelteredCandidate: summary.bestShelteredCandidate?.id ?? null,
    stopBeforeDark: summary.stopBeforeDark,
    lowConfidenceBeyondTop: summary.lowConfidenceBeyondTop,
    offlineAssessment: summary.offlineAssessment?.notes ?? null,
  });
}

const APPROXIMATE_VEHICLE_PROFILES: Record<string, ApproximateVehicleProfile> = {
  truck: { widthInches: 80, wheelbaseInches: 145, clearanceInches: 10.5 },
  suv_van: { widthInches: 78, wheelbaseInches: 121, clearanceInches: 9.6 },
  jeep: { widthInches: 74, wheelbaseInches: 118, clearanceInches: 10.8 },
  car_crossover: { widthInches: 73, wheelbaseInches: 111, clearanceInches: 8.7 },
};

function deriveVehicleContext(activeVehicleContext: ReturnType<typeof getActiveVehicleContext>): CampIntelVehicleContext {
  const vehicle = activeVehicleContext.vehicle;
  const tiresLift = activeVehicleContext.tiresLift;
  const vehicleType = vehicle?.type ?? '';
  const approx =
    APPROXIMATE_VEHICLE_PROFILES[vehicleType] ??
    (vehicleType.toLowerCase().includes('van')
      ? APPROXIMATE_VEHICLE_PROFILES.suv_van
      : APPROXIMATE_VEHICLE_PROFILES.truck);

  const hasVehicleContext = activeVehicleContext.hasVehicleContext;
  const allNames = [
    ...(activeVehicleContext.loadoutItems?.map((item) => item.name) ?? []),
    ...(activeVehicleContext.accessorySummary?.map((item) => item.label) ?? []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return {
    vehicleId: activeVehicleContext.activeVehicleId,
    label: vehicle?.name ?? null,
    source: hasVehicleContext ? 'profile' : 'unavailable',
    widthInches: approx.widthInches,
    wheelbaseInches: approx.wheelbaseInches,
    clearanceInches:
      approx.clearanceInches +
      (tiresLift?.suspensionLiftInches ?? 0) +
      Math.max(0, ((tiresLift?.tireSizeInches ?? 29) - 29) / 2),
    tireSizeInches: tiresLift?.tireSizeInches ?? null,
    suspensionLiftInches: tiresLift?.suspensionLiftInches ?? null,
    trailerAttached: /\btrailer\b|\bhitch\b/.test(allNames),
    rooftopTent: /\brtt\b|rooftop tent|roof tent/.test(allNames),
    loadoutWeightLbs: activeVehicleContext.loadoutTotalWeightLbs || null,
    peopleCount:
      typeof activeVehicleContext.wizardConfig?.peopleCount === 'number'
        ? activeVehicleContext.wizardConfig.peopleCount
        : null,
  };
}

function deriveResourceContext(
  activeVehicleContext: ReturnType<typeof getActiveVehicleContext>,
  overrides?: Partial<CampIntelResourceContext> | null,
): CampIntelResourceContext {
  const vehicle = activeVehicleContext.vehicle;
  const consumables = activeVehicleContext.consumables;
  const fuelPercent =
    consumables?.fuel_percent_current ??
    vehicle?.current_fuel_percent ??
    null;
  const fuelCapacity =
    activeVehicleContext.spec?.fuel_tank_capacity_gal ??
    activeVehicleContext.resourceProfile.fuelTankCapacityGal ??
    vehicle?.fuel_tank_capacity_gal ??
    null;
  const avgMpg = vehicle?.avg_mpg ?? null;
  const fuelRangeMiles =
    fuelPercent != null && fuelCapacity != null && avgMpg != null
      ? Math.round((fuelPercent / 100) * fuelCapacity * avgMpg)
      : null;
  const waterCapacity = activeVehicleContext.resourceProfile.waterCapacityGal;
  const waterPercent =
    consumables?.water_gal_current != null && waterCapacity != null && waterCapacity > 0
      ? Math.round((consumables.water_gal_current / waterCapacity) * 100)
      : vehicle?.current_water_gal != null &&
          vehicle?.water_capacity_gal != null &&
          vehicle.water_capacity_gal > 0
        ? Math.round((vehicle.current_water_gal / vehicle.water_capacity_gal) * 100)
        : null;
  const powerPercent = overrides?.powerPercent ?? null;

  const effectiveFuelPercent = overrides?.fuelPercent ?? fuelPercent;
  const effectiveFuelRangeMiles = overrides?.fuelRangeMiles ?? fuelRangeMiles;
  const effectiveWaterPercent = overrides?.waterPercent ?? waterPercent;

  const stressContributors = [
    effectiveFuelPercent != null ? Math.max(0, 1 - effectiveFuelPercent / 100) : 0.35,
    effectiveWaterPercent != null ? Math.max(0, 1 - effectiveWaterPercent / 100) : 0.3,
    powerPercent != null ? Math.max(0, 1 - powerPercent / 100) : 0.2,
    effectiveFuelRangeMiles != null
      ? effectiveFuelRangeMiles <= 60
        ? 0.85
        : effectiveFuelRangeMiles <= 120
          ? 0.45
          : 0.15
      : 0.25,
  ];

  return {
    fuelPercent: effectiveFuelPercent,
    fuelRangeMiles: effectiveFuelRangeMiles,
    waterPercent: effectiveWaterPercent,
    powerPercent,
    resourceStress: Number(
      (stressContributors.reduce((sum, value) => sum + value, 0) / stressContributors.length).toFixed(2),
    ),
  };
}

function deriveSupportSignals(args: {
  candidates: CampsiteCandidateResult | null;
  routeIntelligence: RouteIntelligence | null;
  remotenessIndex: RemotenessIndexOutput | null;
  supportSignals?: CampIntelSupportSignals | null;
}): CampIntelSupportSignals | null {
  const { candidates, routeIntelligence, remotenessIndex, supportSignals } = args;
  if (supportSignals?.hiddenGems) return supportSignals;

  if (!candidates && !routeIntelligence) {
    return supportSignals ?? { hiddenGems: null };
  }

  const scenicHighlights = Array.from(
    new Set(
      (candidates?.candidates ?? [])
        .flatMap((candidate) => candidate.candidateReason)
        .filter((reason) => /view|scenic|ridge|sunrise|forest|alpine|overlook|remote/i.test(reason)),
    ),
  ).slice(0, 4);

  const syntheticOpportunity = {
    id: routeIntelligence?.id ?? candidates?.id ?? 'camp-intel-support',
    name: routeIntelligence?.routeName ?? candidates?.routeName ?? 'Active Route',
    region: 'Active Route',
    regionGroup: 'great-basin',
    distanceMiles: routeIntelligence?.totalDistanceMiles ?? candidates?.totalDistanceMiles ?? 60,
    terrainType: routeIntelligence?.overallDifficulty ?? 'moderate',
    remotenessScore: Math.max(1, Math.min(10, Math.round((remotenessIndex?.score ?? 45) / 10))),
    estimatedFuelRequired: Math.max(4, Math.round((routeIntelligence?.totalDistanceMiles ?? 60) / 12)),
    suggestedCamps: candidates?.candidates?.length ?? 0,
    description: 'Derived support signal for active route camp desirability.',
    highlights: scenicHighlights,
    elevationGainFt: routeIntelligence?.totalElevationGainFeet ?? 0,
    estimatedDays: Math.max(1, Math.round((routeIntelligence?.estimatedDriveTimeHours ?? 6) / 7)),
    bestSeason: 'Current',
    permitRequired: false,
    imageTag: 'camp-intel-derived',
    startLat: routeIntelligence?.bounds?.minLat ?? candidates?.candidates?.[0]?.coordinates?.[0] ?? 0,
    startLng: routeIntelligence?.bounds?.minLon ?? candidates?.candidates?.[0]?.coordinates?.[1] ?? 0,
    popularityScore: 40,
  };
  const gemScore = computeHiddenGemScore(syntheticOpportunity as any);

  return {
    hiddenGems: {
      scenicSupportScore: Number((gemScore.factors.scenicValue / 100).toFixed(2)),
      nearbyGemCount:
        gemScore.isGem
          ? Math.max(1, Math.min(3, scenicHighlights.length || 1))
          : scenicHighlights.length > 0
            ? 1
            : 0,
      detourSupportMiles: null,
      source: scenicHighlights.length > 0 || gemScore.isGem ? 'derived' : 'none',
      label:
        gemScore.isGem
          ? 'Hidden Gems scenic support nearby'
          : scenicHighlights[0]
            ? `Scenic support: ${scenicHighlights[0]}`
            : null,
    },
  };
}

function buildRouteKey(args: {
  candidates: CampsiteCandidateResult | null;
  routeIntelligence: RouteIntelligence | null;
  missionMode?: CampIntelMissionMode | null;
}): string | null {
  const routeId = args.routeIntelligence?.id ?? args.candidates?.routeIntelligenceId ?? null;
  if (!routeId) return null;
  return `${routeId}:${args.missionMode ?? 'auto'}`;
}

function loadPreferences(): CampIntelPreferenceState {
  try {
    const raw = campIntelStorage.getItem(CAMP_INTEL_STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw);
    return {
      savedCampIds: Array.isArray(parsed?.savedCampIds)
        ? parsed.savedCampIds.filter((value: unknown) => typeof value === 'string')
        : [],
      usedCampIds: Array.isArray(parsed?.usedCampIds)
        ? parsed.usedCampIds.filter((value: unknown) => typeof value === 'string')
        : [],
      rejectedCampIds: Array.isArray(parsed?.rejectedCampIds)
        ? parsed.rejectedCampIds.filter((value: unknown) => typeof value === 'string')
        : [],
      feedbackByCampId:
        parsed?.feedbackByCampId && typeof parsed.feedbackByCampId === 'object'
          ? Object.fromEntries(
              Object.entries(parsed.feedbackByCampId).map(([key, value]) => [
                key,
                Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [],
              ]),
            )
          : {},
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

function loadCacheState(): { byRouteKey: Record<string, CampIntelCachedRouteResult> } {
  try {
    const raw = campIntelStorage.getItem(CAMP_INTEL_CACHE_STORAGE_KEY);
    if (!raw) return DEFAULT_CACHE_STATE;
    const parsed = JSON.parse(raw);
    return {
      byRouteKey:
        parsed?.byRouteKey && typeof parsed.byRouteKey === 'object'
          ? parsed.byRouteKey
          : {},
    };
  } catch {
    return DEFAULT_CACHE_STATE;
  }
}

function persistPreferences(next: CampIntelPreferenceState): void {
  try {
    campIntelStorage.setItem(CAMP_INTEL_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

function persistCacheState(next: { byRouteKey: Record<string, CampIntelCachedRouteResult> }): void {
  try {
    campIntelStorage.setItem(CAMP_INTEL_CACHE_STORAGE_KEY, JSON.stringify(next));
  } catch {}
}

function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

function upsertId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids : [...ids, id];
}

function syncSiteWithPreferences(site: CampIntelSite, preferences: CampIntelPreferenceState): CampIntelSite {
  return {
    ...site,
    isSaved: preferences.savedCampIds.includes(site.id),
    wasUsedBefore: preferences.usedCampIds.includes(site.id),
    feedback: preferences.feedbackByCampId[site.id] ?? [],
  };
}

export function useCampIntel({
  candidates,
  routeIntelligence,
  terrainIntelligence,
  expeditionForecast,
  remotenessIndex,
  routeWeather,
  missionMode,
  isOnline,
  resourceContextOverrides,
  supportSignals,
}: UseCampIntelOptions): UseCampIntelResult {
  const [hydrated, setHydrated] = useState(false);
  const [preferences, setPreferences] = useState<CampIntelPreferenceState>(DEFAULT_PREFERENCES);
  const [cacheState, setCacheState] = useState(DEFAULT_CACHE_STATE);

  useEffect(() => {
    setPreferences(loadPreferences());
    setCacheState(loadCacheState());
    setHydrated(true);
  }, []);

  const activeVehicleContext = getActiveVehicleContext();
  const loadoutNames = activeVehicleContext.loadoutItems?.map((item) => item.name).join('|') ?? '';
  const accessoryLabels = activeVehicleContext.accessorySummary?.map((item) => item.label).join('|') ?? '';
  const vehicleContextSignature = [
    activeVehicleContext.activeVehicleId ?? 'none',
    activeVehicleContext.vehicle?.name ?? 'none',
    activeVehicleContext.vehicle?.type ?? 'none',
    activeVehicleContext.tiresLift?.tireSizeInches ?? 'na',
    activeVehicleContext.tiresLift?.suspensionLiftInches ?? 'na',
    activeVehicleContext.loadoutTotalWeightLbs ?? 'na',
    activeVehicleContext.wizardConfig?.peopleCount ?? 'na',
    loadoutNames,
    accessoryLabels,
  ].join(':');
  const resourceContextSignature = [
    activeVehicleContext.consumables?.fuel_percent_current ?? activeVehicleContext.vehicle?.current_fuel_percent ?? 'na',
    activeVehicleContext.vehicle?.avg_mpg ?? 'na',
    activeVehicleContext.spec?.fuel_tank_capacity_gal ?? activeVehicleContext.resourceProfile.fuelTankCapacityGal ?? 'na',
    activeVehicleContext.consumables?.water_gal_current ?? activeVehicleContext.vehicle?.current_water_gal ?? 'na',
    activeVehicleContext.resourceProfile.waterCapacityGal ?? activeVehicleContext.vehicle?.water_capacity_gal ?? 'na',
    resourceContextOverrides?.fuelPercent ?? 'na',
    resourceContextOverrides?.fuelRangeMiles ?? 'na',
    resourceContextOverrides?.waterPercent ?? 'na',
    resourceContextOverrides?.powerPercent ?? 'na',
  ].join(':');
  const vehicleContextRef = useRef<{ signature: string; value: CampIntelVehicleContext } | null>(null);
  const resourceContextRef = useRef<{ signature: string; value: CampIntelResourceContext } | null>(null);

  if (!vehicleContextRef.current || vehicleContextRef.current.signature !== vehicleContextSignature) {
    vehicleContextRef.current = {
      signature: vehicleContextSignature,
      value: deriveVehicleContext(activeVehicleContext),
    };
  }
  if (!resourceContextRef.current || resourceContextRef.current.signature !== resourceContextSignature) {
    resourceContextRef.current = {
      signature: resourceContextSignature,
      value: deriveResourceContext(activeVehicleContext, resourceContextOverrides),
    };
  }

  const vehicleContext = vehicleContextRef.current.value;
  const resourceContext = resourceContextRef.current.value;
  const derivedSupportSignals = useMemo(
    () =>
      deriveSupportSignals({
        candidates,
        routeIntelligence,
        remotenessIndex,
        supportSignals,
      }),
    [candidates, routeIntelligence, remotenessIndex, supportSignals],
  );
  const routeKey = useMemo(
    () => buildRouteKey({ candidates, routeIntelligence, missionMode }),
    [candidates, routeIntelligence, missionMode],
  );

  const engineResult = useMemo(
    () =>
      buildCampIntelEngine(candidates, {
        routeIntelligence,
        terrainIntelligence,
        expeditionForecast,
        remotenessIndex,
        routeWeather,
        missionMode,
        online: isOnline ?? (routeWeather?.source !== 'fallback' && routeWeather?.source != null),
        vehicleContext,
        resourceContext,
        supportSignals: derivedSupportSignals,
      }),
    [
      candidates,
      routeIntelligence,
      terrainIntelligence,
      expeditionForecast,
      remotenessIndex,
      routeWeather,
      missionMode,
      isOnline,
      vehicleContext,
      resourceContext,
      derivedSupportSignals,
    ],
  );

  const liveSites = useMemo(
    () =>
      engineResult.rankedCandidates.map((ranked) =>
        mapRankedCandidateToSite({
          ranked,
          preferences,
          routeWeather,
          expeditionForecast,
        }),
      ),
    [engineResult, preferences, routeWeather, expeditionForecast],
  );

  const liveSummary = useMemo(
    () =>
      buildCampIntelStructuredSummary({
        engineResult,
        sites: liveSites.filter((site) => site.classification !== 'rejected_low_confidence'),
        routeWeather,
      }),
    [engineResult, liveSites, routeWeather],
  );

  useEffect(() => {
    if (!hydrated || !routeKey || liveSites.length === 0) return;

    const nextCache: CampIntelCachedRouteResult = {
      routeKey,
      routeId: routeIntelligence?.id ?? candidates?.routeIntelligenceId ?? null,
      routeName: routeIntelligence?.routeName ?? candidates?.routeName ?? null,
      generatedAt: engineResult.generatedAt,
      missionMode: engineResult.missionMode,
      sites: liveSites,
      summary: liveSummary,
    };

    setCacheState((current) => {
      const existing = current.byRouteKey[routeKey];
      if (
        existing &&
        existing.routeId === nextCache.routeId &&
        existing.routeName === nextCache.routeName &&
        existing.missionMode === nextCache.missionMode &&
        summarizeCachedSites(existing.sites) === summarizeCachedSites(nextCache.sites) &&
        summarizeCachedSummary(existing.summary) === summarizeCachedSummary(nextCache.summary)
      ) {
        return current;
      }
      const next = {
        byRouteKey: {
          ...current.byRouteKey,
          [routeKey]: nextCache,
        },
      };
      persistCacheState(next);
      return next;
    });
  }, [
    hydrated,
    routeKey,
    liveSites,
    liveSummary,
    routeIntelligence?.id,
    candidates?.routeIntelligenceId,
    routeIntelligence?.routeName,
    candidates?.routeName,
    engineResult.generatedAt,
    engineResult.missionMode,
  ]);

  const cachedRoute = useMemo(
    () => (routeKey ? cacheState.byRouteKey[routeKey] ?? null : null),
    [cacheState.byRouteKey, routeKey],
  );

  const usingCachedSites =
    liveSites.length === 0 &&
    !!cachedRoute &&
    (isOnline === false || !candidates || candidates.candidates.length === 0);

  const allSites = useMemo(
    () =>
      usingCachedSites && cachedRoute
        ? cachedRoute.sites.map((site) =>
            syncSiteWithPreferences(downgradeCampIntelSiteForOffline(site), preferences),
          )
        : liveSites,
    [usingCachedSites, cachedRoute, preferences, liveSites],
  );

  const visibleSites = useMemo(
    () =>
      dedupeVisibleSites(
        allSites.filter(
          (site) =>
            !preferences.rejectedCampIds.includes(site.id) &&
            site.classification !== 'rejected_low_confidence',
        ),
      ),
    [allSites, preferences.rejectedCampIds],
  );

  const savedSites = useMemo(() => allSites.filter((site) => site.isSaved), [allSites]);

  const summary = useMemo<CampIntelStructuredSummary>(() => {
    if (usingCachedSites && cachedRoute) {
      const rebuilt = buildCampIntelStructuredSummary({
        engineResult: {
          ...engineResult,
          missionMode: cachedRoute.missionMode,
          generatedAt: cachedRoute.generatedAt,
        },
        sites: visibleSites,
        routeWeather,
        cached: true,
      });

      return {
        ...rebuilt,
        generatedAt: cachedRoute.generatedAt,
        missionMode: cachedRoute.missionMode,
        trustNotes: Array.from(new Set([...cachedRoute.summary.trustNotes, ...rebuilt.trustNotes])).slice(0, 4),
        bestCandidate: rebuilt.bestCandidate ?? cachedRoute.summary.bestCandidate,
        bestShelteredCandidate: rebuilt.bestShelteredCandidate ?? cachedRoute.summary.bestShelteredCandidate,
      };
    }

    return buildCampIntelStructuredSummary({
      engineResult,
      sites: visibleSites,
      routeWeather,
      cached: false,
    });
  }, [usingCachedSites, cachedRoute, routeWeather, engineResult, visibleSites]);

  const getSiteById = useCallback(
    (siteId: string | null | undefined): CampIntelSite | null =>
      siteId ? allSites.find((site) => site.id === siteId) ?? null : null,
    [allSites],
  );

  const getNearbySites = useCallback(
    (siteId: string, limit = 3): CampIntelSite[] => {
      const anchor = getSiteById(siteId);
      if (!anchor) return [];
      return visibleSites
        .filter((site) => site.id !== siteId)
        .map((site) => ({
          site,
          distance:
            Math.abs((site.detourDistanceMiles ?? 0) - (anchor.detourDistanceMiles ?? 0)) +
            Math.abs(site.overallScore - anchor.overallScore) / 100,
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit)
        .map((entry) => entry.site);
    },
    [getSiteById, visibleSites],
  );

  const compareSites = useCallback(
    (siteIds: string[]) => {
      const sites = siteIds
        .map((siteId) => getSiteById(siteId))
        .filter((site): site is CampIntelSite => Boolean(site));
      return compareCampIntelSites(sites);
    },
    [getSiteById],
  );

  const compareSiteWithNearby = useCallback(
    (siteId: string, limit = 3) => {
      const anchor = getSiteById(siteId);
      if (!anchor) return null;
      const nearby = getNearbySites(siteId, Math.max(1, limit - 1));
      return compareCampIntelSites([anchor, ...nearby]);
    },
    [getNearbySites, getSiteById],
  );

  const decision = useMemo(
    () =>
      buildCampDecisionState({
        engineResult,
        visibleSites,
        summary,
      }),
    [engineResult, summary, visibleSites],
  );

  const updatePreferences = useCallback(
    (updater: (current: CampIntelPreferenceState) => CampIntelPreferenceState) => {
      setPreferences((current) => {
        const next = updater(current);
        persistPreferences(next);
        return next;
      });
    },
    [],
  );

  const toggleSavedCamp = useCallback(
    (siteId: string) => {
      let saved = false;
      updatePreferences((current) => {
        const nextSavedCampIds = toggleId(current.savedCampIds, siteId);
        saved = nextSavedCampIds.includes(siteId);
        return { ...current, savedCampIds: nextSavedCampIds };
      });
      return saved;
    },
    [updatePreferences],
  );

  const recordCampFeedback = useCallback(
    (siteId: string, feedback: CampIntelFeedbackCode) => {
      let recorded = false;
      updatePreferences((current) => {
        const nextFeedback = upsertId(current.feedbackByCampId[siteId] ?? [], feedback);
        recorded = nextFeedback.includes(feedback);
        return {
          ...current,
          feedbackByCampId: {
            ...current.feedbackByCampId,
            [siteId]: nextFeedback,
          },
        };
      });
      return recorded;
    },
    [updatePreferences],
  );

  const markCampUsedBase = useCallback(
    (siteId: string) => {
      let used = false;
      updatePreferences((current) => {
        const nextUsedCampIds = upsertId(current.usedCampIds, siteId);
        used = nextUsedCampIds.includes(siteId);
        return { ...current, usedCampIds: nextUsedCampIds };
      });
      return used;
    },
    [updatePreferences],
  );

  const markCampUsed = useCallback(
    (siteId: string) => {
      const used = markCampUsedBase(siteId);
      if (used) {
        recordCampFeedback(siteId, 'usable');
      }
      return used;
    },
    [markCampUsedBase, recordCampFeedback],
  );

  const reportCampUnusable = useCallback(
    (siteId: string) => {
      updatePreferences((current) => ({
        ...current,
        rejectedCampIds: upsertId(current.rejectedCampIds, siteId),
        savedCampIds: current.savedCampIds.filter((value) => value !== siteId),
        feedbackByCampId: {
          ...current.feedbackByCampId,
          [siteId]: upsertId(current.feedbackByCampId[siteId] ?? [], 'blocked'),
        },
      }));
    },
    [updatePreferences],
  );

  const getCampFeedback = useCallback(
    (siteId: string | null | undefined) => (siteId ? preferences.feedbackByCampId[siteId] ?? [] : []),
    [preferences.feedbackByCampId],
  );

  return {
    hydrated,
    engineResult,
    summary,
    decision,
    allSites,
    visibleSites,
    savedSites,
    getSiteById,
    getNearbySites,
    compareSites,
    compareSiteWithNearby,
    toggleSavedCamp,
    markCampUsed,
    reportCampUnusable,
    recordCampFeedback,
    getCampFeedback,
  };
}

export type { CampIntelRouteWeatherSnapshot, CampIntelMarkerPayload } from './campIntelTypes';
export { toCampIntelMarkerPayload };
