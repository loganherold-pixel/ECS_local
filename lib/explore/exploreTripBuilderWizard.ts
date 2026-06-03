import type { ExpeditionOpportunity } from '../discoverEngine';
import type { ImportedRoute } from '../routeStore';
import type { ECSRun } from '../runStore';
import {
  buildExploreNavigationPayload,
  getNavigationHandoffActiveGuidanceUnavailableReason,
  type NavigationHandoffPayload,
} from '../navigationHandoffStore';
import {
  getExploreTrailThumbnail,
  type ExploreTrailThumbnailAssignment,
} from '../exploreTrailThumbnails';

export type ExploreWizardRouteSourceKind =
  | 'trail_pack'
  | 'hidden_gem'
  | 'ecs_idea'
  | 'saved_built'
  | 'imported_stitched';

export type ExploreWizardStep =
  | 'select_route'
  | 'preview_route'
  | 'resupply'
  | 'camp_bailout'
  | 'itinerary'
  | 'offline_prep'
  | 'complete';

export type ExploreWizardResupplyPreference = 'fuel_only' | 'fuel_supplies' | 'none';

export type ExploreWizardRouteCandidate = {
  id: string;
  sourceKind: ExploreWizardRouteSourceKind;
  title: string;
  subtitle: string | null;
  route: ExpeditionOpportunity;
  navigationPayload: NavigationHandoffPayload;
  thumbnail: ExploreTrailThumbnailAssignment | null;
  confidence: {
    score: number | null;
    label: string;
    reasons: string[];
  };
  warnings: string[];
  dataUsed: Array<Record<string, unknown>>;
  guidanceReady: boolean;
  unavailableReason: string | null;
  savedAssetKey?: string | null;
};

export type ExploreWizardHiddenRoute = {
  id: string;
  sourceKind: ExploreWizardRouteSourceKind;
  title: string;
  reason: string;
};

export type ExploreWizardCandidateSet = {
  candidates: ExploreWizardRouteCandidate[];
  hiddenRoutes: ExploreWizardHiddenRoute[];
  hiddenTotal: number;
  hiddenBySource: Record<ExploreWizardRouteSourceKind, number>;
  hiddenReasons: ExploreWizardHiddenRoute[];
};

export type ExploreWizardOrigin =
  | {
      status: 'gps';
      label: string;
      coordinate: { latitude: number; longitude: number };
      sourceState: 'live';
    }
  | {
      status: 'manual';
      label: string;
      coordinate: { latitude: number; longitude: number };
      sourceState: 'manual';
    }
  | {
      status: 'route_only';
      label: string;
      coordinate: null;
      sourceState: 'manual';
    }
  | {
      status: 'missing';
      label: string;
      coordinate: null;
      sourceState: 'missing';
    };

export type ExploreWizardDraft = {
  id: string;
  step: ExploreWizardStep;
  selectedRouteId: string;
  selectedCandidateId: string;
  routeLocked: boolean;
  route: ExploreWizardRouteCandidate;
  origin: ExploreWizardOrigin;
  resupply: {
    preference: ExploreWizardResupplyPreference;
    anchor: 'trailhead';
    selectedFuelId: string | null;
    selectedSupplyId: string | null;
    skipped: boolean;
  };
  campBailout: {
    camp: {
      enabled: boolean;
      skipped: boolean;
      message: string;
    };
    bailout: {
      enabled: boolean;
      skipped: boolean;
      message: string;
    };
  };
  itinerary: {
    phaseOrder: string[];
    acceptedSuggestionIds: string[];
    dismissedSuggestionIds: string[];
  };
  offlinePrep: {
    status: 'not_started' | 'ready' | 'unavailable';
    manifestId: string | null;
  };
  updatedAt: string;
};

export type NormalizeExploreWizardCandidatesInput = {
  trailPacks?: ExpeditionOpportunity[];
  hiddenGemRoutes?: ExpeditionOpportunity[];
  ecsRouteIdeas?: ExpeditionOpportunity[];
  favoriteRoutes?: ExpeditionOpportunity[];
  savedRouteAssets?: ExpeditionOpportunity[];
};

export type CreateExploreWizardDraftOptions = {
  gps?: { latitude: number; longitude: number; label?: string | null } | null;
  manualOrigin?: { latitude: number; longitude: number; label?: string | null } | null;
  routeOnlyPlanning?: boolean;
  resupplyPreference?: ExploreWizardResupplyPreference;
};

const SOURCE_ORDER: Array<{
  key: keyof NormalizeExploreWizardCandidatesInput;
  sourceKind: ExploreWizardRouteSourceKind;
}> = [
  { key: 'trailPacks', sourceKind: 'trail_pack' },
  { key: 'hiddenGemRoutes', sourceKind: 'hidden_gem' },
  { key: 'ecsRouteIdeas', sourceKind: 'ecs_idea' },
  { key: 'favoriteRoutes', sourceKind: 'saved_built' },
  { key: 'savedRouteAssets', sourceKind: 'imported_stitched' },
];

function metadataRecord(route: ExpeditionOpportunity): Record<string, unknown> {
  const metadata = route.routeMetadata;
  return metadata && typeof metadata === 'object' ? metadata : {};
}

function metadataArray(metadata: Record<string, unknown>, key: string): unknown[] {
  const value = metadata[key];
  return Array.isArray(value) ? value : [];
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function readNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function buildConfidence(route: ExpeditionOpportunity): ExploreWizardRouteCandidate['confidence'] {
  const metadata = metadataRecord(route);
  const score = readNumber(
    metadata.confidenceScore,
    metadata.confidence,
    route.matchScore,
    route.rigCompatibility,
  );
  const normalizedScore = score == null ? null : Math.max(0, Math.min(100, Math.round(score)));
  const reasons = [
    ...normalizeStringArray(metadata.confidenceReasons),
    ...normalizeStringArray(metadata.reasons),
    ...normalizeStringArray(route.highlights),
  ].slice(0, 5);
  const label =
    normalizedScore == null
      ? 'Confidence unavailable'
      : normalizedScore >= 80
        ? 'High confidence'
        : normalizedScore >= 55
          ? 'Medium confidence'
          : 'Low confidence';

  return { score: normalizedScore, label, reasons };
}

function buildWarnings(route: ExpeditionOpportunity): string[] {
  const metadata = metadataRecord(route);
  const catalogVerification = metadata.catalogVerification as
    | { warnings?: unknown; blockers?: unknown }
    | null
    | undefined;
  const warnings = [
    ...normalizeStringArray(metadata.warnings),
    ...normalizeStringArray(catalogVerification?.warnings),
    ...normalizeStringArray(catalogVerification?.blockers),
  ];
  const cautionNotes = typeof metadata.cautionNotes === 'string' ? metadata.cautionNotes.trim() : '';
  if (cautionNotes.length > 0) warnings.push(cautionNotes);
  return Array.from(new Set(warnings)).slice(0, 6);
}

function buildDataUsed(route: ExpeditionOpportunity): Array<Record<string, unknown>> {
  const metadata = metadataRecord(route);
  const catalogVerification = metadata.catalogVerification as
    | { dataUsed?: unknown }
    | null
    | undefined;
  return [
    ...metadataArray(metadata, 'dataUsed'),
    ...metadataArray(catalogVerification ?? {}, 'dataUsed'),
  ].filter((entry): entry is Record<string, unknown> => {
    return !!entry && typeof entry === 'object' && !Array.isArray(entry);
  });
}

function buildCandidate(
  route: ExpeditionOpportunity,
  sourceKind: ExploreWizardRouteSourceKind,
): ExploreWizardRouteCandidate | ExploreWizardHiddenRoute {
  const navigationPayload =
    ((route as unknown as { navigationPayload?: NavigationHandoffPayload | null }).navigationPayload) ??
    buildExploreNavigationPayload(route);
  const unavailableReason = getNavigationHandoffActiveGuidanceUnavailableReason(navigationPayload);
  const title = navigationPayload.title || route.name || 'Explore route';
  const id = String(route.id || navigationPayload.id || `${sourceKind}:${title}`).trim();
  if (unavailableReason) {
    return {
      id,
      sourceKind,
      title,
      reason: unavailableReason,
    };
  }

  return {
    id,
    sourceKind,
    title,
    subtitle: navigationPayload.subtitle,
    route,
    navigationPayload,
    thumbnail: getExploreTrailThumbnail(route),
    confidence: buildConfidence(route),
    warnings: buildWarnings(route),
    dataUsed: buildDataUsed(route),
    guidanceReady: true,
    unavailableReason: null,
    savedAssetKey: id,
  };
}

function emptyHiddenCounts(): Record<ExploreWizardRouteSourceKind, number> {
  return {
    trail_pack: 0,
    hidden_gem: 0,
    ecs_idea: 0,
    saved_built: 0,
    imported_stitched: 0,
  };
}

export function normalizeExploreWizardRouteCandidates(
  input: NormalizeExploreWizardCandidatesInput,
): ExploreWizardCandidateSet {
  const candidates: ExploreWizardRouteCandidate[] = [];
  const hiddenRoutes: ExploreWizardHiddenRoute[] = [];
  const hiddenBySource = emptyHiddenCounts();
  const seenCandidateKeys = new Set<string>();

  for (const source of SOURCE_ORDER) {
    const routes = input[source.key] ?? [];
    for (const route of routes) {
      const built = buildCandidate(route, source.sourceKind);
      if ('reason' in built) {
        hiddenRoutes.push(built);
        hiddenBySource[source.sourceKind] += 1;
        continue;
      }

      const dedupeKey = String(
        built.route.routeMetadata?.identityKey ??
          built.route.id ??
          built.navigationPayload.id ??
          built.title,
      ).toLowerCase();
      if (seenCandidateKeys.has(dedupeKey)) continue;
      seenCandidateKeys.add(dedupeKey);
      candidates.push(built);
    }
  }

  return {
    candidates,
    hiddenRoutes,
    hiddenTotal: hiddenRoutes.length,
    hiddenBySource,
    hiddenReasons: hiddenRoutes,
  };
}

function routeIsRemoteOrTechnical(route: ExpeditionOpportunity): boolean {
  const metadata = metadataRecord(route);
  const terrainDifficulty = readNumber(
    route.terrainDifficulty,
    metadata.terrainDifficulty,
  );
  const difficulty = String(route.difficultyRating ?? metadata.difficultyRating ?? '').toLowerCase();
  const terrainType = String(route.terrainType ?? '').toLowerCase();
  return (
    Number(route.remotenessScore ?? 0) >= 7 ||
    (terrainDifficulty != null && terrainDifficulty >= 6) ||
    /technical|hard|extreme|remote|shelf|rock|wash/.test(`${difficulty} ${terrainType}`)
  );
}

function routeNeedsCamp(route: ExpeditionOpportunity): boolean {
  const metadata = metadataRecord(route);
  const days = readNumber(route.estimatedDays, metadata.estimatedDays) ?? 1;
  const suggestedCamps = readNumber(route.suggestedCamps, metadata.suggestedCamps) ?? 0;
  const campingPotential = readNumber(
    route.campingPotentialScore,
    metadata.campingPotentialScore,
    metadata.campabilityScore,
  ) ?? 0;
  return days > 1 || suggestedCamps > 0 || campingPotential >= 55;
}

function resolveOrigin(options: CreateExploreWizardDraftOptions): ExploreWizardOrigin {
  if (options.manualOrigin) {
    return {
      status: 'manual',
      label: options.manualOrigin.label?.trim() || 'Manual origin',
      coordinate: {
        latitude: options.manualOrigin.latitude,
        longitude: options.manualOrigin.longitude,
      },
      sourceState: 'manual',
    };
  }

  if (options.gps) {
    return {
      status: 'gps',
      label: options.gps.label?.trim() || 'Current GPS location',
      coordinate: {
        latitude: options.gps.latitude,
        longitude: options.gps.longitude,
      },
      sourceState: 'live',
    };
  }

  if (options.routeOnlyPlanning) {
    return {
      status: 'route_only',
      label: 'Route-only planning; approach route is not computed.',
      coordinate: null,
      sourceState: 'manual',
    };
  }

  return {
    status: 'missing',
    label: 'Current location unavailable; choose manual origin or route-only planning.',
    coordinate: null,
    sourceState: 'missing',
  };
}

export function createExploreWizardDraft(
  candidate: ExploreWizardRouteCandidate,
  options: CreateExploreWizardDraftOptions = {},
): ExploreWizardDraft {
  const remoteOrTechnical = routeIsRemoteOrTechnical(candidate.route);
  const campNeeded = routeNeedsCamp(candidate.route);
  const updatedAt = new Date().toISOString();

  return {
    id: `explore-wizard:${candidate.id}:${updatedAt}`,
    step: 'select_route',
    selectedRouteId: String(candidate.route.id),
    selectedCandidateId: candidate.id,
    routeLocked: true,
    route: candidate,
    origin: resolveOrigin(options),
    resupply: {
      preference: options.resupplyPreference ?? 'fuel_supplies',
      anchor: 'trailhead',
      selectedFuelId: null,
      selectedSupplyId: null,
      skipped: options.resupplyPreference === 'none',
    },
    campBailout: {
      camp: {
        enabled: campNeeded,
        skipped: false,
        message: campNeeded
          ? 'ECS can suggest camp scouting targets from route context and CampOps outputs. Verify legal/access status before relying on any camp.'
          : 'Camp planning is optional for this route and remains skippable.',
      },
      bailout: {
        enabled: remoteOrTechnical,
        skipped: false,
        message: remoteOrTechnical
          ? 'Remote or technical route traits detected. ECS will suggest visible bailout review points when source geometry supports them.'
          : 'Bailout planning is optional for this lower-remoteness route and remains skippable.',
      },
    },
    itinerary: {
      phaseOrder: [
        'origin',
        'pre_trail_resupply',
        'trailhead',
        'primary_route',
        'camp_bailout',
        'trail_end',
      ],
      acceptedSuggestionIds: [],
      dismissedSuggestionIds: [],
    },
    offlinePrep: {
      status: 'not_started',
      manifestId: null,
    },
    updatedAt,
  };
}

export function getExploreWizardSourceLabel(sourceKind: ExploreWizardRouteSourceKind): string {
  switch (sourceKind) {
    case 'trail_pack':
      return 'Trail Packs';
    case 'hidden_gem':
      return 'Hidden Gems';
    case 'ecs_idea':
      return 'ECS Ideas';
    case 'saved_built':
      return 'Saved/Built';
    case 'imported_stitched':
      return 'Imported/Stitched';
    default:
      return 'Explore';
  }
}

function finiteCoordinate(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < -90 ||
    latitude > 90 ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }
  return { lat: latitude, lng: longitude };
}

function importedRouteCoordinates(route: ImportedRoute): [number, number][] {
  return route.segments.flatMap((segment) =>
    segment.points
      .map((point) => finiteCoordinate(point.lat, point.lon))
      .filter((point): point is { lat: number; lng: number } => !!point)
      .map((point) => [point.lng, point.lat] as [number, number]),
  );
}

function runCoordinates(run: ECSRun): [number, number][] {
  return run.points
    .map((point) => finiteCoordinate(point.lat, point.lng))
    .filter((point): point is { lat: number; lng: number } => !!point)
    .map((point) => [point.lng, point.lat] as [number, number]);
}

function routeAssetSubtitle(route: ImportedRoute): string {
  const source =
    route.source_app === 'ecs_explore_save'
      ? 'Explore saved route'
      : route.source_format === 'custom'
        ? 'Saved built route'
        : `${route.source_format.toUpperCase()} route asset`;
  const distance = Number.isFinite(route.total_distance_miles)
    ? `${Math.max(0, Math.round(route.total_distance_miles))} mi`
    : 'distance unknown';
  return `${source} | ${distance}`;
}

export function importedRouteToExploreWizardRoute(route: ImportedRoute): ExpeditionOpportunity | null {
  const coordinates = importedRouteCoordinates(route);
  if (coordinates.length < 2) return null;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const distance = Number.isFinite(route.total_distance_miles) ? route.total_distance_miles : 0;
  const sourceType =
    route.source_app === 'ecs_explore_save'
      ? 'saved_built'
      : route.source_format === 'custom'
        ? 'saved_built'
        : 'imported_stitched';

  return ({
    id: `route:${route.id}`,
    name: route.name || 'Saved Route Asset',
    region: routeAssetSubtitle(route),
    regionGroup: 'great-basin',
    distanceMiles: distance,
    terrainType: 'saved route',
    remotenessScore: 5,
    estimatedFuelRequired: 0,
    suggestedCamps: 0,
    description: route.description ?? 'Saved route asset available for TripBuilder planning.',
    highlights: ['Saved locally', 'Guidance-ready geometry available'],
    elevationGainFt: route.elevation_gain_ft ?? 0,
    estimatedDays: distance >= 80 ? 2 : 1,
    bestSeason: 'Verify current conditions',
    permitRequired: false,
    imageTag: 'generic-overland-landscape',
    startLat: first[1],
    startLng: first[0],
    coordinate: { lat: first[1], lng: first[0] },
    destinationCoordinate: { lat: last[1], lng: last[0] },
    routeGeometry: {
      type: 'LineString',
      coordinates,
    },
    routeMetadata: {
      identityKey: `local-route:${route.id}`,
      source: sourceType,
      routeAssetId: route.id,
      linkedRunId: route.linked_run_id ?? null,
      sourceApp: route.source_app ?? null,
      sourceFormat: route.source_format,
      externalSourceId: route.external_source_id ?? null,
      externalSourceType: route.external_source_type ?? null,
      dataUsed: [
        {
          label: 'Local route asset',
          source: route.source_app ?? route.source_format,
          state: 'cached',
          updatedAt: route.updated_at,
        },
      ],
      confidenceReasons: [
        'Local route asset includes continuous geometry for active guidance.',
        'Offline and legal/access status remain user-verified unless source data says otherwise.',
      ],
      warnings: ['Verify current closures, land-use rules, and route conditions before departure.'],
    },
  } as unknown) as ExpeditionOpportunity;
}

export function runToExploreWizardRoute(run: ECSRun): ExpeditionOpportunity | null {
  const coordinates = runCoordinates(run);
  if (coordinates.length < 2) return null;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  const isStitched = String(run.source ?? '').toLowerCase() === 'stitch';
  const distance = Number.isFinite(run.stats.distance_miles) ? run.stats.distance_miles : 0;

  return ({
    id: `run:${run.id}`,
    name: run.title || (isStitched ? 'Stitched Expedition Route' : 'Saved Run Route'),
    region: isStitched ? 'Stitched route asset' : 'Saved run asset',
    regionGroup: 'great-basin',
    distanceMiles: distance,
    terrainType: isStitched ? 'stitched route' : 'saved run',
    remotenessScore: 5,
    estimatedFuelRequired: 0,
    suggestedCamps: 0,
    description: isStitched
      ? 'Stitched route asset available for TripBuilder planning.'
      : 'Saved run geometry available for TripBuilder planning.',
    highlights: [isStitched ? 'Stitched route' : 'Saved run', 'Guidance-ready geometry available'],
    elevationGainFt: Number.isFinite(run.stats.elevation_gain_ft) ? run.stats.elevation_gain_ft : 0,
    estimatedDays: distance >= 80 ? 2 : 1,
    bestSeason: 'Verify current conditions',
    permitRequired: false,
    imageTag: 'generic-overland-landscape',
    startLat: first[1],
    startLng: first[0],
    coordinate: { lat: first[1], lng: first[0] },
    destinationCoordinate: { lat: last[1], lng: last[0] },
    routeGeometry: {
      type: 'LineString',
      coordinates,
    },
    routeMetadata: {
      identityKey: `local-run:${run.id}`,
      source: 'imported_stitched',
      runAssetId: run.id,
      sourceApp: 'ecs_saved_run',
      sourceFormat: run.source,
      dataUsed: [
        {
          label: isStitched ? 'Stitched route run' : 'Saved run geometry',
          source: run.source,
          state: 'cached',
          updatedAt: run.updated_at,
        },
      ],
      confidenceReasons: [
        'Local run asset includes continuous geometry for active guidance.',
        'Offline and legal/access status remain user-verified unless source data says otherwise.',
      ],
      warnings: ['Verify current closures, land-use rules, and route conditions before departure.'],
    },
  } as unknown) as ExpeditionOpportunity;
}
