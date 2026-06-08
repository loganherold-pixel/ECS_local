import type {
  GeoPoint,
  ItineraryDataSource,
  ItineraryPhase,
  ItineraryPreTrailStopSearchSummary,
  ItineraryRoute,
  ItineraryStop,
  ItineraryWaypoint,
  RouteGeometryStatus,
  TripBuilderRouteInput,
  TripBuilderVehicleProfile,
  TripItinerary,
} from './tripBuilderTypes';
import {
  getTripConfidenceSummary,
  type TripConfidenceEnvironmentInput,
  type TripConfidenceInput,
  type TripConfidenceSummaryViewModel,
  type TripConfidenceTelemetryInput,
} from './tripConfidenceSummary';

export const TRIP_CONFIDENCE_QA_FIXTURE_SCENARIO_IDS = [
  'missing_active_vehicle',
  'incomplete_vehicle_range',
  'demo_route_geometry',
  'preview_route_geometry',
  'trailhead_only_missing_geometry',
  'provider_unavailable',
  'unknown_environment',
  'stale_telemetry_ignored',
  'mock_telemetry_ignored',
] as const;

export type TripConfidenceQaFixtureId = typeof TRIP_CONFIDENCE_QA_FIXTURE_SCENARIO_IDS[number];

export type TripConfidenceQaRuntime = {
  dev?: boolean | null;
  nodeEnv?: string | null;
};

export type TripConfidenceQaValidationRow = {
  label: string;
  value: string;
  state: 'ok' | 'watch' | 'caution' | 'critical' | 'unknown' | 'non_live';
};

export type TripConfidenceQaFixture = {
  id: TripConfidenceQaFixtureId;
  title: string;
  description: string;
  disclosure: string;
  input: TripConfidenceInput;
  summary: TripConfidenceSummaryViewModel;
  validationRows: TripConfidenceQaValidationRow[];
};

type QaItineraryOptions = Partial<TripItinerary> & {
  fuelStops?: ItineraryStop[];
  groceryStops?: ItineraryStop[];
  waterStops?: ItineraryStop[];
  generalSupplyStops?: ItineraryStop[];
};

const QA_TIMESTAMP = '2026-06-08T12:00:00.000Z';
const POINT_A: GeoPoint = { latitude: 38.42, longitude: -110.62 };
const POINT_B: GeoPoint = { latitude: 38.49, longitude: -110.55 };
const POINT_C: GeoPoint = { latitude: 38.55, longitude: -110.48 };

const DISCLOSURE =
  'NON-LIVE QA FIXTURE. Uses deterministic in-memory inputs only; it does not read or write user trip, Fleet, provider, environment, or telemetry state.';

function runtimeDevFlag(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

export function isTripConfidenceQaHarnessEnabled(runtime: TripConfidenceQaRuntime = {}): boolean {
  const dev = runtime.dev ?? runtimeDevFlag();
  const nodeEnv =
    runtime.nodeEnv ??
    (typeof process !== 'undefined' && process?.env ? process.env.NODE_ENV : undefined);
  return dev === true || nodeEnv === 'test';
}

function source(label: string, state: ItineraryDataSource['state'] = 'mock'): ItineraryDataSource {
  return {
    id: `trip_confidence_qa_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`,
    label,
    state,
    provider: 'trip_confidence_qa_fixture',
    capturedAt: QA_TIMESTAMP,
    updatedAt: QA_TIMESTAMP,
    confidence: 'low',
    notes: ['Dev/test-only Trip Confidence QA fixture.'],
  };
}

function phaseForWaypoint(type: ItineraryWaypoint['type']): ItineraryPhase {
  if (type === 'trailhead_start') return 'trailhead';
  if (type === 'fuel' || type === 'grocery' || type === 'water' || type === 'supply') {
    return 'pre_trail_resupply';
  }
  if (type === 'trail_end' || type === 'exit') return 'trail_exit';
  return 'trail_navigation';
}

function waypoint(
  id: string,
  type: ItineraryWaypoint['type'],
  coordinate: GeoPoint | null = POINT_A,
): ItineraryWaypoint {
  return {
    id,
    type,
    phase: phaseForWaypoint(type),
    title: id.replace(/[-_]+/g, ' '),
    coordinate,
    source: source('Trip Confidence QA waypoint'),
    confidence: 'medium',
    confidenceScore: 0.55,
    metadata: { qaFixture: true },
  };
}

function routeSegment(
  id: string,
  phase: ItineraryPhase,
  geometry: GeoPoint[] | null = [POINT_A, POINT_B, POINT_C],
): ItineraryRoute {
  return {
    id,
    phase,
    title: id.replace(/[-_]+/g, ' '),
    geometry,
    segments: [],
    source: source('Trip Confidence QA geometry'),
    confidence: geometry && geometry.length >= 2 ? 'medium' : 'unknown',
    distanceMiles: geometry && geometry.length >= 2 ? 34 : null,
    metadata: { qaFixture: true },
  };
}

function stop(
  id: string,
  type: 'fuel' | 'grocery' | 'water' | 'supply',
  coordinate: GeoPoint = POINT_B,
  metadata: Record<string, unknown> = {},
): ItineraryStop {
  return {
    ...waypoint(id, type, coordinate),
    sequence: 1,
    plannedDay: 1,
    required: type === 'fuel' || type === 'grocery',
    stopRole: 'pre_trail_resupply',
    metadata: { qaFixture: true, ...metadata },
  };
}

function statusRow(
  bucket: ItineraryPreTrailStopSearchSummary['bucket'],
  status: ItineraryPreTrailStopSearchSummary['status'],
  stopCount: number,
  warnings: string[] = [],
): ItineraryPreTrailStopSearchSummary {
  return {
    bucket,
    status,
    anchorCoordinate: POINT_A,
    stopCount,
    provider: 'qa_fixture',
    searchedAt: QA_TIMESTAMP,
    searchRadiusMiles: 15,
    warnings,
    dataUsed: [source('Trip Confidence QA pre-trail status')],
    metadata: { qaFixture: true },
  };
}

function baseItinerary(options: QaItineraryOptions = {}): TripItinerary {
  const {
    fuelStops,
    groceryStops,
    waterStops,
    generalSupplyStops,
    ...overrides
  } = options;
  const fuel = fuelStops ?? [stop('qa-refuel-near-trailhead', 'fuel', POINT_B)];
  const grocery = groceryStops ?? [
    stop('qa-resupply-near-refuel', 'grocery', POINT_B, { resupplyAnchorStopId: fuel[0]?.id ?? null }),
  ];
  const water = waterStops ?? [];
  const generalSupply = generalSupplyStops ?? [];
  const routeGeometryStatus: RouteGeometryStatus = overrides.routeGeometryStatus ?? 'trail_available';
  const trailheadStart = Object.prototype.hasOwnProperty.call(overrides, 'trailheadStart')
    ? overrides.trailheadStart
    : waypoint('qa-trailhead', 'trailhead_start', POINT_A);
  const trailRoute = Object.prototype.hasOwnProperty.call(overrides, 'trailRoute')
    ? overrides.trailRoute
    : routeSegment('qa-trail-route', 'trail_navigation');
  const trailEnd = Object.prototype.hasOwnProperty.call(overrides, 'trailEnd')
    ? overrides.trailEnd
    : waypoint('qa-trail-end', 'trail_end', POINT_C);

  return {
    id: 'trip-confidence-qa-itinerary',
    sourceRouteId: 'trip-confidence-qa-route',
    routeId: 'trip-confidence-qa-route',
    suggestedRouteId: 'trip-confidence-qa-route',
    title: 'Trip Confidence QA Itinerary',
    status: 'draft',
    createdAt: QA_TIMESTAMP,
    updatedAt: QA_TIMESTAMP,
    userStart: POINT_A,
    approachRoute: routeSegment('qa-approach-route', 'approach'),
    preTrailStops: {
      fuel,
      grocery,
      water,
      generalSupply,
    },
    preTrailStopStatus: overrides.preTrailStopStatus ?? [
      statusRow('fuel', fuel.length ? 'selected' : 'no_results', fuel.length),
      statusRow('grocery', grocery.length ? 'selected' : 'no_results', grocery.length),
      statusRow('water', water.length ? 'selected' : 'not_requested', water.length),
      statusRow('generalSupply', generalSupply.length ? 'selected' : 'not_requested', generalSupply.length),
    ],
    fuelRangeConfidence: overrides.fuelRangeConfidence ?? {
      estimatedTotalDistance: 54,
      estimatedTrailDistance: 34,
      knownFuelRange: 260,
      estimatedFuelRemaining: 206,
      fuelStatus: 'sufficient',
      confidenceScore: 0.72,
      warnings: [],
      rangeMarginMiles: 152,
      preTrailFuelStopCount: fuel.length,
      dataUsed: [source('Trip Confidence QA fuel range')],
      metadata: { qaFixture: true },
    },
    trailheadStart,
    trailRoute,
    routeGeometryStatus,
    trailEnd,
    exitRoute: overrides.exitRoute ?? null,
    exitEnd: null,
    trailWaypoints: overrides.trailWaypoints ?? [
      waypoint('qa-camp-candidate', 'camp_potential', POINT_B),
      waypoint('qa-bailout-exit', 'bailout', POINT_C),
    ],
    phases: ['approach', 'pre_trail_resupply', 'trailhead', 'trail_navigation', 'trail_exit'],
    phaseSummaries: [],
    stops: [],
    waypoints: [],
    segments: [],
    confidence: {
      overall: 'medium',
      routeGeometry: trailRoute ? 'medium' : 'unknown',
      routeGeometryStatus,
      trailhead: trailheadStart ? 'medium' : 'unknown',
      resupply: fuel.length || grocery.length ? 'medium' : 'unknown',
      trailWaypoints: 'medium',
      exitRoute: 'unknown',
      dataFreshness: 'low',
      reasons: ['Trip Confidence QA fixture input.'],
      missingData: [],
      dataUsed: [source('Trip Confidence QA confidence')],
    },
    dataUsed: [source('Trip Confidence QA itinerary')],
    warnings: [],
    metadata: {
      qaFixture: true,
      nonLive: true,
      ...(overrides.metadata ?? {}),
    },
    ...overrides,
  };
}

const COMPLETE_VEHICLE: TripBuilderVehicleProfile = {
  id: 'trip-confidence-qa-rig',
  label: 'QA Rig',
  vehicleType: 'truck',
  rangeMiles: 260,
  rangeSource: 'manual',
  fuelTankCapacityGal: 31,
  avgMpg: 13,
  supportReadiness: {
    water: true,
    foodSupplies: true,
    repair: true,
    medical: true,
    recovery: true,
    source: 'qa fixture',
    labels: ['water', 'food', 'repair', 'medical', 'recovery'],
  },
  confidence: 'medium',
  source: 'qa_fixture',
  updatedAt: QA_TIMESTAMP,
};

const INCOMPLETE_VEHICLE: TripBuilderVehicleProfile = {
  id: 'trip-confidence-qa-incomplete-rig',
  label: 'QA Rig Missing Range',
  source: 'qa_fixture',
  confidence: 'unknown',
  updatedAt: QA_TIMESTAMP,
};

const AVAILABLE_ENVIRONMENT: TripConfidenceEnvironmentInput = {
  weather: { status: 'available', source: 'qa_fixture', label: 'QA available weather' },
  daylight: { status: 'available', label: 'QA daylight available' },
  remoteness: { status: 'available', label: 'QA remoteness available' },
};

const UNKNOWN_ENVIRONMENT: TripConfidenceEnvironmentInput = {
  weather: { status: 'unknown', source: 'qa_fixture', label: 'Weather unavailable' },
  daylight: { status: 'unknown', label: 'Daylight unknown' },
  remoteness: { status: 'unknown', label: 'Remoteness unknown' },
  elevation: { status: 'unknown', label: 'Elevation unknown' },
};

const TELEMETRY_UNAVAILABLE: TripConfidenceTelemetryInput = {
  status: 'unavailable',
  source: 'qa_fixture',
  label: 'Telemetry unavailable',
};

function routeInput(
  id: string,
  name: string,
  routeTypeStatus: string,
  authorityLabel: string,
  geometrySource: string,
): TripBuilderRouteInput {
  return {
    id,
    name,
    distanceMiles: 54,
    startLat: POINT_A.latitude,
    startLng: POINT_A.longitude,
    routeGeometryStatus: 'trail_available',
    routeMetadata: {
      routeTypeStatus,
      routeAuthorityLabel: authorityLabel,
      geometrySource,
      qaFixture: true,
      nonLive: true,
    },
  };
}

function baseInput(): TripConfidenceInput {
  return {
    itinerary: baseItinerary(),
    selectedRoute: routeInput(
      'trip-confidence-qa-route',
      'QA Verified Geometry Route',
      'live_verified_geometry',
      'ECS Validated',
      'trip_confidence_qa_validated_fixture',
    ),
    vehicleProfile: COMPLETE_VEHICLE,
    environment: AVAILABLE_ENVIRONMENT,
    telemetry: TELEMETRY_UNAVAILABLE,
  };
}

function providerUnavailableItinerary(): TripItinerary {
  return baseItinerary({
    fuelStops: [],
    groceryStops: [],
    waterStops: [],
    generalSupplyStops: [],
    preTrailStopStatus: [
      statusRow('fuel', 'provider_unavailable', 0, ['Pre-trail POI provider unavailable.']),
      statusRow('grocery', 'provider_unavailable', 0, ['Pre-trail POI provider unavailable.']),
      statusRow('water', 'not_requested', 0),
      statusRow('generalSupply', 'not_requested', 0),
    ],
  });
}

function scenarioInput(id: TripConfidenceQaFixtureId): TripConfidenceInput {
  switch (id) {
    case 'missing_active_vehicle':
      return {
        ...baseInput(),
        selectedRoute: routeInput(
          'trip-confidence-qa-missing-vehicle-route',
          'QA Missing Vehicle Route',
          'live_verified_geometry',
          'ECS Validated',
          'trip_confidence_qa_validated_fixture',
        ),
        vehicleProfile: null,
      };
    case 'incomplete_vehicle_range':
      return {
        ...baseInput(),
        itinerary: baseItinerary({
          fuelRangeConfidence: {
            estimatedTotalDistance: 104,
            estimatedTrailDistance: 52,
            knownFuelRange: null,
            estimatedFuelRemaining: null,
            fuelStatus: 'unknown',
            confidenceScore: 0.18,
            warnings: ['Vehicle range unknown.'],
            preTrailFuelStopCount: 1,
            dataUsed: [source('Trip Confidence QA unknown fuel range')],
            metadata: { qaFixture: true },
          },
        }),
        selectedRoute: routeInput(
          'trip-confidence-qa-incomplete-range-route',
          'QA Incomplete Vehicle Range',
          'imported_geometry',
          'Imported Geometry',
          'trip_confidence_qa_imported_fixture',
        ),
        vehicleProfile: INCOMPLETE_VEHICLE,
      };
    case 'demo_route_geometry':
      return {
        ...baseInput(),
        itinerary: baseItinerary({
          metadata: {
            routeTypeStatus: 'demo_fixture',
            routeAuthorityLabel: 'Demo Fixture',
            geometrySource: 'ecs_demo_full_route_fixture',
          },
        }),
        selectedRoute: routeInput(
          'trip-confidence-qa-demo-route',
          'QA Demo Route Geometry',
          'demo_fixture',
          'Demo Fixture',
          'ecs_demo_full_route_fixture',
        ),
      };
    case 'preview_route_geometry':
      return {
        ...baseInput(),
        itinerary: baseItinerary({
          metadata: {
            routeTypeStatus: 'preview_geometry',
            routeAuthorityLabel: 'Preview Geometry',
            geometrySource: 'trip_confidence_qa_preview_geometry',
          },
        }),
        selectedRoute: routeInput(
          'trip-confidence-qa-preview-route',
          'QA Preview Route Geometry',
          'preview_geometry',
          'Preview Geometry',
          'trip_confidence_qa_preview_geometry',
        ),
      };
    case 'trailhead_only_missing_geometry':
      return {
        ...baseInput(),
        itinerary: baseItinerary({
          routeGeometryStatus: 'trail_missing',
          trailRoute: null,
          trailWaypoints: [],
          trailEnd: null,
          metadata: {
            routeTypeStatus: 'trailhead_guidance',
            routeAuthorityLabel: 'Trailhead Guidance',
            geometrySource: 'trailhead_coordinate_only',
          },
        }),
        selectedRoute: {
          ...routeInput(
            'trip-confidence-qa-trailhead-only',
            'QA Trailhead Only',
            'trailhead_guidance',
            'Trailhead Guidance',
            'trailhead_coordinate_only',
          ),
          routeGeometryStatus: 'trail_missing',
        },
      };
    case 'provider_unavailable':
      return {
        ...baseInput(),
        itinerary: providerUnavailableItinerary(),
        selectedRoute: routeInput(
          'trip-confidence-qa-provider-unavailable',
          'QA Provider Unavailable',
          'imported_geometry',
          'Imported Geometry',
          'trip_confidence_qa_imported_fixture',
        ),
      };
    case 'unknown_environment':
      return {
        ...baseInput(),
        selectedRoute: routeInput(
          'trip-confidence-qa-unknown-environment',
          'QA Unknown Environment',
          'imported_geometry',
          'Imported Geometry',
          'trip_confidence_qa_imported_fixture',
        ),
        environment: UNKNOWN_ENVIRONMENT,
      };
    case 'stale_telemetry_ignored':
      return {
        ...baseInput(),
        selectedRoute: routeInput(
          'trip-confidence-qa-stale-telemetry',
          'QA Stale Telemetry',
          'imported_geometry',
          'Imported Geometry',
          'trip_confidence_qa_imported_fixture',
        ),
        telemetry: {
          status: 'stale',
          source: 'qa_fixture',
          updatedAt: '2026-06-08T10:00:00.000Z',
          label: 'Stale telemetry ignored',
        },
      };
    case 'mock_telemetry_ignored':
      return {
        ...baseInput(),
        selectedRoute: routeInput(
          'trip-confidence-qa-mock-telemetry',
          'QA Mock Telemetry',
          'imported_geometry',
          'Imported Geometry',
          'trip_confidence_qa_imported_fixture',
        ),
        telemetry: {
          status: 'mock',
          source: 'qa_fixture',
          updatedAt: QA_TIMESTAMP,
          label: 'Mock telemetry ignored',
        },
      };
    default:
      return baseInput();
  }
}

function titleFor(id: TripConfidenceQaFixtureId): string {
  switch (id) {
    case 'missing_active_vehicle':
      return 'Missing active vehicle';
    case 'incomplete_vehicle_range':
      return 'Incomplete vehicle/range';
    case 'demo_route_geometry':
      return 'Demo route geometry';
    case 'preview_route_geometry':
      return 'Preview route geometry';
    case 'trailhead_only_missing_geometry':
      return 'Trailhead-only missing trail geometry';
    case 'provider_unavailable':
      return 'Provider unavailable';
    case 'unknown_environment':
      return 'Unknown weather/daylight/remoteness';
    case 'stale_telemetry_ignored':
      return 'Stale telemetry ignored';
    case 'mock_telemetry_ignored':
      return 'Mock telemetry ignored';
    default:
      return 'Trip Confidence QA fixture';
  }
}

function descriptionFor(id: TripConfidenceQaFixtureId): string {
  switch (id) {
    case 'missing_active_vehicle':
      return 'Confirms no active vehicle can cap the summary at Low without changing persisted Fleet state.';
    case 'incomplete_vehicle_range':
      return 'Confirms incomplete vehicle metadata and unknown range stay visible.';
    case 'demo_route_geometry':
      return 'Confirms demo fixture geometry is never labeled verified.';
    case 'preview_route_geometry':
      return 'Confirms preview geometry remains preview-only.';
    case 'trailhead_only_missing_geometry':
      return 'Confirms trailhead guidance without trail geometry produces Insufficient Data.';
    case 'provider_unavailable':
      return 'Confirms provider unavailable is visible while the itinerary still renders.';
    case 'unknown_environment':
      return 'Confirms unknown weather, daylight, and remoteness do not read as fair or safe.';
    case 'stale_telemetry_ignored':
      return 'Confirms stale telemetry is disclosed and ignored for positive confidence.';
    case 'mock_telemetry_ignored':
      return 'Confirms mock telemetry is disclosed and ignored for positive confidence.';
    default:
      return 'Trip Confidence QA fixture.';
  }
}

function rowState(value: string): TripConfidenceQaValidationRow['state'] {
  const normalized = value.toLowerCase();
  if (normalized.includes('insufficient') || normalized.includes('missing')) return 'critical';
  if (normalized.includes('unavailable') || normalized.includes('preview') || normalized.includes('demo')) {
    return 'caution';
  }
  if (normalized.includes('unknown') || normalized.includes('stale') || normalized.includes('mock')) return 'watch';
  return 'ok';
}

function validationRows(
  input: TripConfidenceInput,
  summary: TripConfidenceSummaryViewModel,
): TripConfidenceQaValidationRow[] {
  const vehicleValue = input.vehicleProfile
    ? `${input.vehicleProfile.label ?? input.vehicleProfile.id ?? 'Vehicle'} / ${input.vehicleProfile.vehicleType ?? 'type unknown'} / range ${input.vehicleProfile.rangeMiles ?? input.vehicleProfile.fuelTankCapacityGal ?? 'unknown'}`
    : 'Missing active vehicle';
  const weather = input.environment?.weather?.status ?? 'unknown';
  const daylight = input.environment?.daylight?.status ?? 'unknown';
  const remoteness = input.environment?.remoteness?.status ?? 'unknown';
  const telemetry = input.telemetry?.status ?? 'unavailable';
  const rows: TripConfidenceQaValidationRow[] = [
    { label: 'Category', value: summary.label, state: rowState(summary.label) },
    { label: 'Recommended action', value: summary.recommendedAction.label, state: rowState(summary.recommendedAction.label) },
    {
      label: 'Route authority',
      value: `${summary.route.authorityLabel} / ${summary.route.status}`,
      state: rowState(`${summary.route.authorityLabel} ${summary.route.status}`),
    },
    {
      label: 'Geometry',
      value: `${summary.route.geometryStatus} / ${summary.route.geometrySource ?? 'source unknown'}`,
      state: rowState(`${summary.route.geometryStatus} ${summary.route.geometrySource ?? ''}`),
    },
    { label: 'Vehicle', value: vehicleValue, state: rowState(vehicleValue) },
    {
      label: 'Environment',
      value: `weather ${weather} / daylight ${daylight} / remoteness ${remoteness}`,
      state: rowState(`${weather} ${daylight} ${remoteness}`),
    },
    {
      label: 'Telemetry',
      value: String(telemetry),
      state: rowState(String(telemetry)),
    },
    {
      label: 'Provider',
      value: summary.metadata.providerUnavailable ? 'Provider unavailable' : 'No provider fixture warning',
      state: summary.metadata.providerUnavailable ? 'caution' : 'non_live',
    },
  ];

  return rows;
}

function buildFixture(id: TripConfidenceQaFixtureId): TripConfidenceQaFixture {
  const input = scenarioInput(id);
  const summary = getTripConfidenceSummary(input);
  return {
    id,
    title: titleFor(id),
    description: descriptionFor(id),
    disclosure: DISCLOSURE,
    input,
    summary,
    validationRows: validationRows(input, summary),
  };
}

export function getTripConfidenceQaFixture(
  id: TripConfidenceQaFixtureId,
  runtime: TripConfidenceQaRuntime = {},
): TripConfidenceQaFixture | null {
  if (!isTripConfidenceQaHarnessEnabled(runtime)) return null;
  return TRIP_CONFIDENCE_QA_FIXTURE_SCENARIO_IDS.includes(id) ? buildFixture(id) : null;
}

export function getTripConfidenceQaFixtures(
  runtime: TripConfidenceQaRuntime = {},
): TripConfidenceQaFixture[] {
  if (!isTripConfidenceQaHarnessEnabled(runtime)) return [];
  return TRIP_CONFIDENCE_QA_FIXTURE_SCENARIO_IDS.map((id) => buildFixture(id));
}
