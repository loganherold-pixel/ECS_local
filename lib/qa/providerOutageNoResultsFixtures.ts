import {
  buildTripItineraryFromSuggestedRoute,
} from '../tripBuilder/tripItineraryBuilderService';
import {
  getTripItinerarySummary,
  type TripItinerarySummaryPreTrailState,
} from '../tripBuilder/tripItinerarySummary';
import {
  evaluateRouteConfidence,
  type TripConfidenceSummaryViewModel,
} from '../routeConfidenceEngine';
import {
  normalizeCanonicalRouteGeometry,
  type CanonicalRouteGeometryResult,
} from '../routeGeometryLifecycle';
import {
  filterBailoutPlanCandidates,
  type BailoutCandidateQualityPoint,
} from '../tripBuilder/bailoutCandidateQuality';
import type {
  GeoPoint,
  SuggestedRoute,
  TripBuilderRouteInput,
  TripBuilderVehicleProfile,
  TripItinerary,
} from '../tripBuilder/tripBuilderTypes';
import type { PreTrailStopCandidateInput } from '../tripBuilder/preTrailResupplyResolver';

export const PROVIDER_OUTAGE_QA_SCENARIO_IDS = [
  'pretrail_provider_unavailable',
  'pretrail_provider_timeout',
  'pretrail_provider_error',
  'pretrail_no_results',
  'pretrail_not_requested',
  'pretrail_stale_cache',
  'bailout_no_results',
  'weather_provider_unavailable',
  'weather_stale_cache',
  'route_provider_unavailable',
  'route_geometry_malformed',
] as const;

export type ProviderOutageQaScenarioId = typeof PROVIDER_OUTAGE_QA_SCENARIO_IDS[number];

export type ProviderOutageQaRuntime = {
  dev?: boolean | null;
  nodeEnv?: string | null;
};

export type ProviderOutageQaProviderState =
  | 'provider_unavailable'
  | 'provider_timeout'
  | 'provider_error'
  | 'no_results'
  | 'not_requested'
  | 'stale_cache'
  | 'weather_unavailable'
  | 'weather_stale'
  | 'route_unavailable'
  | 'geometry_malformed';

export type ProviderOutageQaValidationState =
  | 'ok'
  | 'watch'
  | 'caution'
  | 'critical'
  | 'non_live';

export type ProviderOutageQaValidationRow = {
  label: string;
  value: string;
  state: ProviderOutageQaValidationState;
};

export type ProviderOutageQaProviderSummary = {
  surface: 'pre_trail_poi' | 'bailout' | 'weather' | 'route_mapbox';
  state: ProviderOutageQaProviderState;
  copy: string;
  providerCalled: false;
  productionLive: false;
};

export type ProviderOutageQaWeatherSummary = {
  status: 'unknown' | 'unavailable' | 'stale' | 'available';
  copy: string;
  sourceLabel: string;
};

export type ProviderOutageQaBailoutSummary = {
  usableCandidateCount: number;
  rejectedProviderCount: number;
  usedRouteFallback: boolean;
  copy: string;
};

export type ProviderOutageQaExpectedRouteOverlay =
  | 'route_line'
  | 'controlled_fallback'
  | 'trailhead_marker_only';

export type ProviderOutageQaFixture = {
  id: ProviderOutageQaScenarioId;
  title: string;
  description: string;
  disclosure: string;
  provider: ProviderOutageQaProviderSummary;
  route: SuggestedRoute;
  itinerary: TripItinerary;
  preTrailState: TripItinerarySummaryPreTrailState;
  tripBuilderCopy: string;
  routeConfidence: TripConfidenceSummaryViewModel;
  routeGeometry: CanonicalRouteGeometryResult;
  expectedRouteOverlay: ProviderOutageQaExpectedRouteOverlay;
  routeAuthorityCopy: string;
  weather: ProviderOutageQaWeatherSummary;
  bailout: ProviderOutageQaBailoutSummary;
  productIsolation: ProviderOutageQaValidationRow[];
  validationRows: ProviderOutageQaValidationRow[];
};

const DISCLOSURE =
  'NON-PRODUCTION QA FIXTURE. Local dev/test-only provider outage data; no live provider calls, saved itineraries, Active Trip, Offline Packet, Badge, Fleet, team, route catalog, telemetry, credentials, or configuration state is read or written.';

const NOW_ISO = '2026-06-09T18:30:00.000Z';
const STALE_ISO = '2026-06-08T18:30:00.000Z';
const ROUTE_START: GeoPoint = { latitude: 38.78421, longitude: -121.20971 };
const ROUTE_MID: GeoPoint = { latitude: 38.79102, longitude: -121.19742 };
const ROUTE_END: GeoPoint = { latitude: 38.79925, longitude: -121.18581 };
const USER_START: GeoPoint = { latitude: 38.761, longitude: -121.2351 };

const VALID_LINE_STRING = {
  type: 'LineString',
  coordinates: [
    [USER_START.longitude, USER_START.latitude],
    [ROUTE_START.longitude, ROUTE_START.latitude],
    [ROUTE_MID.longitude, ROUTE_MID.latitude],
    [ROUTE_END.longitude, ROUTE_END.latitude],
  ],
};

const MALFORMED_LINE_STRING = {
  type: 'LineString',
  coordinates: [[-121.2, 95.4], ['bad', 'coordinate']],
};

const VEHICLE: TripBuilderVehicleProfile = {
  id: 'provider-outage-qa-vehicle',
  label: 'QA Range Vehicle',
  vehicleType: 'overland_truck',
  rangeMiles: 240,
  rangeSource: 'manual',
  fuelTankCapacityGal: 30,
  avgMpg: 12,
  currentFuelGallons: 20,
  fuelLevelPct: 66,
  supportReadiness: {
    water: true,
    foodSupplies: true,
    repair: true,
    medical: true,
    recovery: true,
    source: 'qa_fixture',
  },
  confidence: 'medium',
  source: 'qa_fixture',
  updatedAt: NOW_ISO,
};

function runtimeDevFlag(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export function isProviderOutageQaHarnessEnabled(runtime: ProviderOutageQaRuntime = {}): boolean {
  const dev = runtime.dev ?? runtimeDevFlag();
  const nodeEnv =
    runtime.nodeEnv ??
    (typeof process !== 'undefined' && process?.env ? process.env.NODE_ENV : undefined);
  return dev === true || nodeEnv === 'test';
}

function row(
  label: string,
  value: string,
  state: ProviderOutageQaValidationState,
): ProviderOutageQaValidationRow {
  return { label, value, state };
}

function baseProductIsolationRows(): ProviderOutageQaValidationRow[] {
  return [
    row('Saved itineraries', 'Untouched', 'ok'),
    row('Active Trip', 'Untouched', 'ok'),
    row('Offline Packet', 'Untouched', 'ok'),
    row('Badge state', 'Untouched', 'ok'),
    row('Fleet', 'Untouched', 'ok'),
    row('Team state', 'Untouched', 'ok'),
    row('Telemetry', 'Untouched', 'ok'),
    row('Provider credentials', 'Not called', 'non_live'),
    row('Provider config', 'Untouched', 'ok'),
    row('Route catalog', 'Untouched', 'ok'),
  ];
}

function validationRowsFor(fixture: {
  provider: ProviderOutageQaProviderSummary;
  routeGeometry: CanonicalRouteGeometryResult;
  preTrailState: TripItinerarySummaryPreTrailState;
}): ProviderOutageQaValidationRow[] {
  return [
    row('Production access', 'Redirected', 'non_live'),
    row('Provider calls', 'Not called', 'non_live'),
    row('Product mutation', 'None', 'ok'),
    row('Pre-trail state', fixture.preTrailState, fixture.preTrailState === 'provider_unavailable' ? 'caution' : 'watch'),
    row('Provider state', fixture.provider.state.replace(/_/g, ' '), fixture.provider.state === 'not_requested' ? 'ok' : 'caution'),
    row('Geometry state', fixture.routeGeometry.status, fixture.routeGeometry.valid ? 'ok' : 'watch'),
  ];
}

function routeFor(id: ProviderOutageQaScenarioId): SuggestedRoute {
  const metadata: Record<string, unknown> = {
    qaFixture: true,
    nonProduction: true,
    routeTypeStatus: 'trail_route',
    routeAuthorityLabel: 'QA fixture route',
    routeAuthoritySource: 'Provider outage QA fixture',
    sourceLabel: 'Provider outage QA fixture',
    isTrailGeometry: true,
  };

  if (id === 'route_provider_unavailable') {
    metadata.routeTypeStatus = 'unknown';
    metadata.routeAuthorityLabel = 'Route provider unavailable';
    metadata.sourceLabel = 'Route geometry provider unavailable';
  }

  if (id === 'route_geometry_malformed') {
    metadata.routeTypeStatus = 'unknown';
    metadata.routeAuthorityLabel = 'Route geometry malformed';
    metadata.sourceLabel = 'Malformed route geometry fixture';
  }

  const geometry = id === 'route_geometry_malformed'
    ? MALFORMED_LINE_STRING
    : id === 'route_provider_unavailable'
      ? null
      : VALID_LINE_STRING;

  return {
    id: `provider-outage-qa-${id}`,
    name: titleFor(id),
    region: 'QA Fixture Range',
    distanceMiles: 9.8,
    estimatedDriveTimeHours: 1.4,
    estimatedDays: 1,
    terrainType: 'forest_road',
    difficultyRating: 'Moderate',
    remotenessScore: 62,
    permitRequired: null,
    startLat: ROUTE_START.latitude,
    startLng: ROUTE_START.longitude,
    coordinate: ROUTE_START,
    destinationCoordinate: ROUTE_END,
    endpointCoordinate: ROUTE_END,
    endCoordinate: ROUTE_END,
    routeGeometry: geometry,
    trailGeometry: geometry,
    routeGeometryStatus: geometry ? 'trail_available' : 'trail_missing',
    routeMetadata: metadata,
  };
}

function preTrailCandidates(id: ProviderOutageQaScenarioId): PreTrailStopCandidateInput | null {
  if (id !== 'pretrail_stale_cache') return [];
  return {
    fuel: [
      {
        id: 'qa-stale-fuel',
        name: 'Stale Cache Fuel Candidate',
        category: 'fuel',
        latitude: 38.781,
        longitude: -121.217,
        source: 'stale_cache_pretrail',
        provider: 'qa_fixture',
        confidence: 'low',
      },
    ],
    grocery: [
      {
        id: 'qa-stale-grocery',
        name: 'Stale Cache Grocery Candidate',
        category: 'grocery',
        latitude: 38.779,
        longitude: -121.214,
        source: 'stale_cache_pretrail',
        provider: 'qa_fixture',
        confidence: 'low',
      },
    ],
  };
}

function providerAvailableFor(id: ProviderOutageQaScenarioId): boolean | null {
  if (id === 'pretrail_stale_cache' || id === 'pretrail_no_results' || id === 'bailout_no_results') return true;
  if (id === 'pretrail_not_requested') return null;
  if (
    id === 'pretrail_provider_unavailable' ||
    id === 'pretrail_provider_timeout' ||
    id === 'pretrail_provider_error'
  ) {
    return false;
  }
  return true;
}

function preferencesFor(id: ProviderOutageQaScenarioId): Record<string, unknown> {
  if (id === 'pretrail_not_requested') {
    return {
      smartResupplyPreference: 'no',
      refuelEnabled: false,
      resupplyEnabled: false,
      bailoutPlanRequested: false,
    };
  }
  return {
    smartResupplyPreference: 'fuel_supplies',
    refuelEnabled: true,
    resupplyEnabled: true,
    bailoutPlanRequested: true,
  };
}

function buildItinerary(id: ProviderOutageQaScenarioId, route: SuggestedRoute): TripItinerary {
  return buildTripItineraryFromSuggestedRoute({
    suggestedRoute: route,
    userLocation: USER_START,
    userPreferences: preferencesFor(id),
    preTrailStopCandidates: preTrailCandidates(id),
    preTrailProviderAvailable: providerAvailableFor(id),
    vehicleProfile: VEHICLE,
    telemetry: {
      source: 'qa_fixture',
      freshness: id.includes('stale') ? 'stale' : 'unknown',
      estimatedRangeMiles: 220,
      updatedAt: id.includes('stale') ? STALE_ISO : NOW_ISO,
    },
    generatedAt: NOW_ISO,
  });
}

function providerFor(id: ProviderOutageQaScenarioId): ProviderOutageQaProviderSummary {
  switch (id) {
    case 'pretrail_provider_unavailable':
      return provider('pre_trail_poi', 'provider_unavailable', 'POI provider unavailable. Itinerary continues without fake refuel or resupply success.');
    case 'pretrail_provider_timeout':
      return provider('pre_trail_poi', 'provider_timeout', 'POI provider timeout. ECS treats this as unavailable until a fresh lookup succeeds.');
    case 'pretrail_provider_error':
      return provider('pre_trail_poi', 'provider_error', 'POI provider error. No successful provider result is fabricated.');
    case 'pretrail_no_results':
      return provider('pre_trail_poi', 'no_results', 'Provider returned no nearby candidates. This is distinct from provider unavailable.');
    case 'pretrail_not_requested':
      return provider('pre_trail_poi', 'not_requested', 'Smart refuel/resupply planning not requested.');
    case 'pretrail_stale_cache':
      return provider('pre_trail_poi', 'stale_cache', 'Stale cache candidates are labeled stale and should be confirmed before departure.');
    case 'bailout_no_results':
      return provider('bailout', 'no_results', 'Bailout provider returned no usable nearby candidates.');
    case 'weather_provider_unavailable':
      return provider('weather', 'weather_unavailable', 'Weather provider unavailable. Weather must not read as fair or safe.');
    case 'weather_stale_cache':
      return provider('weather', 'weather_stale', 'Weather cache is stale. Do not treat it as live or verified.');
    case 'route_provider_unavailable':
      return provider('route_mapbox', 'route_unavailable', 'Route geometry provider unavailable. Use controlled fallback copy.');
    case 'route_geometry_malformed':
      return provider('route_mapbox', 'geometry_malformed', 'Route geometry invalid or malformed. Do not render a fake route line.');
    default:
      return provider('pre_trail_poi', 'provider_unavailable', 'Provider unavailable.');
  }
}

function provider(
  surface: ProviderOutageQaProviderSummary['surface'],
  state: ProviderOutageQaProviderState,
  copy: string,
): ProviderOutageQaProviderSummary {
  return {
    surface,
    state,
    copy,
    providerCalled: false,
    productionLive: false,
  };
}

function weatherFor(id: ProviderOutageQaScenarioId): ProviderOutageQaWeatherSummary {
  if (id === 'weather_provider_unavailable') {
    return {
      status: 'unavailable',
      copy: 'Weather unavailable. Conditions are unknown and require operator review.',
      sourceLabel: 'Provider unavailable',
    };
  }
  if (id === 'weather_stale_cache' || id === 'pretrail_stale_cache') {
    return {
      status: 'stale',
      copy: 'Weather stale cache. Last known values are not live or verified.',
      sourceLabel: 'Stale cache',
    };
  }
  return {
    status: 'unknown',
    copy: 'Weather unknown. No favorable condition is assumed.',
    sourceLabel: 'Not requested for this fixture',
  };
}

function bailoutFor(id: ProviderOutageQaScenarioId): ProviderOutageQaBailoutSummary {
  const farCandidate: BailoutCandidateQualityPoint = {
    id: 'qa-far-away-bailout',
    title: 'Far Away Provider Candidate',
    coordinate: { latitude: 47.6062, longitude: -122.3321 },
    source: 'provider_fixture',
    distanceFromRouteStartMiles: 1800,
  };
  const routeFallback: BailoutCandidateQualityPoint = {
    id: 'qa-route-fallback-bailout',
    title: 'Route-derived fallback only',
    coordinate: ROUTE_MID,
    source: 'route_fallback_stale',
  };
  const useFallback = id === 'pretrail_stale_cache' || id === 'weather_stale_cache';
  const result = filterBailoutPlanCandidates({
    providerCandidates: id === 'bailout_no_results' ? [farCandidate] : [],
    routeFallbackCandidates: useFallback ? [routeFallback] : [],
    routeStart: ROUTE_START,
    routePoints: [ROUTE_START, ROUTE_MID, ROUTE_END],
    limit: 2,
  });

  if (result.candidates.length === 0) {
    return {
      usableCandidateCount: 0,
      rejectedProviderCount: result.rejectedProviderCount,
      usedRouteFallback: false,
      copy: result.rejectedProviderCount > 0
        ? 'No valid bailout candidates after far-away provider results were rejected.'
        : 'Bailout candidates unavailable or no results.',
    };
  }

  return {
    usableCandidateCount: result.candidates.length,
    rejectedProviderCount: result.rejectedProviderCount,
    usedRouteFallback: result.usedRouteFallback,
    copy: 'Route-derived fallback candidate is labeled stale and should be confirmed.',
  };
}

function routeGeometryFor(route: SuggestedRoute): CanonicalRouteGeometryResult {
  return normalizeCanonicalRouteGeometry(route);
}

function routeAuthorityCopyFor(id: ProviderOutageQaScenarioId, geometry: CanonicalRouteGeometryResult): string {
  if (id === 'route_provider_unavailable') {
    return 'Route geometry unavailable because the route provider is unavailable. ECS should show a controlled fallback.';
  }
  if (id === 'route_geometry_malformed') {
    return 'Route geometry invalid or malformed. ECS should not render a fake route line.';
  }
  if (!geometry.valid) return 'Route geometry unavailable. Authority remains unknown.';
  return 'QA route geometry is local fixture data and not production route authority.';
}

function expectedOverlayFor(
  id: ProviderOutageQaScenarioId,
  geometry: CanonicalRouteGeometryResult,
): ProviderOutageQaExpectedRouteOverlay {
  if (geometry.valid) return 'route_line';
  return 'controlled_fallback';
}

function confidenceFor(args: {
  id: ProviderOutageQaScenarioId;
  route: SuggestedRoute;
  itinerary: TripItinerary;
  weather: ProviderOutageQaWeatherSummary;
}): TripConfidenceSummaryViewModel {
  const route: TripBuilderRouteInput = args.id === 'route_provider_unavailable'
    ? {
        ...args.route,
        routeTypeStatus: 'unknown',
        routeAuthorityLabel: 'Route provider unavailable',
        routeGeometryStatus: 'trail_missing',
      }
    : args.id === 'route_geometry_malformed'
      ? {
          ...args.route,
          routeTypeStatus: 'unknown',
          routeAuthorityLabel: 'Route geometry malformed',
          routeGeometryStatus: 'trail_missing',
        }
      : {
          ...args.route,
          routeTypeStatus: 'trail_route',
          routeAuthorityLabel: 'QA fixture route',
          routeGeometryStatus: args.route.routeGeometryStatus ?? 'trail_available',
        };

  return evaluateRouteConfidence({
    selectedRoute: route,
    itinerary: args.itinerary,
    vehicleProfile: VEHICLE,
    environment: {
      weather: {
        status: args.weather.status,
        label: args.weather.copy,
      },
      daylight: {
        status: 'unknown',
        label: 'Daylight unknown',
      },
      remoteness: {
        status: 'unknown',
        label: 'Remoteness unknown',
      },
    },
    telemetry: {
      status: 'unavailable',
      label: 'Telemetry unavailable for this provider fixture',
    },
  });
}

function preTrailStateFrom(itinerary: TripItinerary): TripItinerarySummaryPreTrailState {
  const summary = getTripItinerarySummary(itinerary);
  return summary.metadata.preTrailPoiState;
}

function tripBuilderCopyFor(
  id: ProviderOutageQaScenarioId,
  itinerary: TripItinerary,
  providerSummary: ProviderOutageQaProviderSummary,
): string {
  if (id === 'pretrail_provider_timeout' || id === 'pretrail_provider_error') return providerSummary.copy;
  if (id === 'pretrail_stale_cache') return 'Stale cache pre-trail candidates selected; confirm before departure.';
  const summary = getTripItinerarySummary(itinerary);
  return summary.dataNotes.find((note) => /POI|candidate|requested/i.test(note)) ??
    summary.phases.find((phase) => phase.key === 'fuel_supplies')?.detail ??
    providerSummary.copy;
}

function titleFor(id: ProviderOutageQaScenarioId): string {
  switch (id) {
    case 'pretrail_provider_unavailable':
      return 'Pre-trail Provider Unavailable';
    case 'pretrail_provider_timeout':
      return 'Pre-trail Provider Timeout';
    case 'pretrail_provider_error':
      return 'Pre-trail Provider Error';
    case 'pretrail_no_results':
      return 'Pre-trail No Results';
    case 'pretrail_not_requested':
      return 'Pre-trail Not Requested';
    case 'pretrail_stale_cache':
      return 'Pre-trail Stale Cache';
    case 'bailout_no_results':
      return 'Bailout No Results';
    case 'weather_provider_unavailable':
      return 'Weather Provider Unavailable';
    case 'weather_stale_cache':
      return 'Weather Stale Cache';
    case 'route_provider_unavailable':
      return 'Route Provider Unavailable';
    case 'route_geometry_malformed':
      return 'Route Geometry Malformed';
    default:
      return 'Provider Outage Fixture';
  }
}

function descriptionFor(id: ProviderOutageQaScenarioId): string {
  switch (id) {
    case 'pretrail_provider_unavailable':
      return 'Requested refuel/resupply lookup finishes as unavailable without creating fake POIs.';
    case 'pretrail_provider_timeout':
      return 'Requested refuel/resupply lookup times out and falls back to unavailable semantics.';
    case 'pretrail_provider_error':
      return 'Requested refuel/resupply lookup errors and does not fabricate provider success.';
    case 'pretrail_no_results':
      return 'Requested POI lookup returns no candidates and stays distinct from provider failure.';
    case 'pretrail_not_requested':
      return 'Smart POI planning is skipped by preference and does not appear as provider failure.';
    case 'pretrail_stale_cache':
      return 'Cached POI/weather inputs are stale and visibly require confirmation.';
    case 'bailout_no_results':
      return 'Far-away provider bailout candidates are rejected, leaving no fake bailout plan.';
    case 'weather_provider_unavailable':
      return 'Weather outage stays unavailable and never reads as fair, safe, or favorable.';
    case 'weather_stale_cache':
      return 'Weather cache remains stale and does not present as live or verified.';
    case 'route_provider_unavailable':
      return 'Route geometry provider outage uses a controlled overlay fallback.';
    case 'route_geometry_malformed':
      return 'Malformed route geometry is rejected and never renders as a trusted route line.';
    default:
      return 'Provider outage fixture.';
  }
}

export function buildProviderOutageQaFixture(id: ProviderOutageQaScenarioId): ProviderOutageQaFixture {
  const route = routeFor(id);
  const itinerary = buildItinerary(id, route);
  const providerSummary = providerFor(id);
  const weather = weatherFor(id);
  const routeGeometry = routeGeometryFor(route);
  const preTrailState = preTrailStateFrom(itinerary);
  const routeConfidence = confidenceFor({ id, route, itinerary, weather });
  const bailout = bailoutFor(id);

  return {
    id,
    title: titleFor(id),
    description: descriptionFor(id),
    disclosure: DISCLOSURE,
    provider: providerSummary,
    route,
    itinerary,
    preTrailState,
    tripBuilderCopy: tripBuilderCopyFor(id, itinerary, providerSummary),
    routeConfidence,
    routeGeometry,
    expectedRouteOverlay: expectedOverlayFor(id, routeGeometry),
    routeAuthorityCopy: routeAuthorityCopyFor(id, routeGeometry),
    weather,
    bailout,
    productIsolation: baseProductIsolationRows(),
    validationRows: validationRowsFor({ provider: providerSummary, routeGeometry, preTrailState }),
  };
}

export function getProviderOutageQaFixture(
  id: ProviderOutageQaScenarioId,
  runtime: ProviderOutageQaRuntime = {},
): ProviderOutageQaFixture | null {
  if (!isProviderOutageQaHarnessEnabled(runtime)) return null;
  return PROVIDER_OUTAGE_QA_SCENARIO_IDS.includes(id) ? buildProviderOutageQaFixture(id) : null;
}

export function getProviderOutageQaFixtures(
  runtime: ProviderOutageQaRuntime = {},
): ProviderOutageQaFixture[] {
  if (!isProviderOutageQaHarnessEnabled(runtime)) return [];
  return PROVIDER_OUTAGE_QA_SCENARIO_IDS.map((id) => buildProviderOutageQaFixture(id));
}
