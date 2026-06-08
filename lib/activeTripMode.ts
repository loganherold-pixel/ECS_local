import {
  evaluateRouteConfidence,
  type RouteConfidenceEngineResult,
  type TripConfidenceInput,
} from './routeConfidenceEngine';
import type {
  GeoPoint,
  ItineraryPreTrailStopBucket,
  ItineraryPreTrailStopBucketStatus,
  TripBuilderRouteInput,
  TripBuilderVehicleProfile,
  TripItinerary,
  TripPlan,
} from './tripBuilder/tripBuilderTypes';

declare const require: (id: string) => {
  createPersistedKeyValueCache: (fileKey: string) => ActiveTripModeStorage;
};

export const ACTIVE_TRIP_MODE_STORAGE_FILE = 'ecs_active_trip_mode';
export const ACTIVE_TRIP_MODE_STORAGE_KEY = 'active_trip_mode_snapshot';
export const ACTIVE_TRIP_MODE_VERSION = 1;

export type ActiveTripModeStatus = 'active' | 'stopped' | 'completed';
export type ActiveTripFreshnessState = 'fresh' | 'stale' | 'unknown';
export type ActiveTripLocationStatus = 'unknown' | 'available' | 'stale';
export type ActiveTripOperationalStatus =
  | 'available'
  | 'selected'
  | 'ranked'
  | 'not_requested'
  | 'provider_unavailable'
  | 'provider_pending'
  | 'no_results'
  | 'missing_anchor'
  | 'missing'
  | 'unknown';

export type ActiveTripModeStorage = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
  clear?: () => void;
  flush: () => Promise<void>;
  waitForHydration: () => Promise<void>;
  isHydrated: () => boolean;
};

export type ActiveTripVehicleSummary = {
  id: string | null;
  label: string;
  vehicleType: string | null;
  rangeMiles: number | null;
  rangeSource: string | null;
  confidence: string | number | null;
  source: string | null;
  updatedAt: string | null;
};

export type ActiveTripRouteSummary = {
  id: string | null;
  name: string | null;
  authorityStatus: RouteConfidenceEngineResult['route']['status'];
  authorityLabel: string;
  geometryStatus: RouteConfidenceEngineResult['route']['geometryStatus'];
  geometrySource: string | null;
  geometryValid: boolean;
  trailheadCoordinate: GeoPoint | null;
  distanceMiles: number | null;
};

export type ActiveTripOperationalSummary = {
  status: ActiveTripOperationalStatus;
  label: string;
  source: string;
  updatedAt: string | null;
  warnings: string[];
};

export type ActiveTripModeSnapshot = {
  version: typeof ACTIVE_TRIP_MODE_VERSION;
  activeTripId: string;
  status: ActiveTripModeStatus;
  sourceItineraryId: string | null;
  sourceRouteId: string | null;
  route: ActiveTripRouteSummary;
  vehicle: ActiveTripVehicleSummary;
  routeConfidence: RouteConfidenceEngineResult;
  logistics: {
    refuel: ActiveTripOperationalSummary;
    resupply: ActiveTripOperationalSummary;
    camp: ActiveTripOperationalSummary;
    bailout: ActiveTripOperationalSummary;
  };
  lastLocation: {
    status: ActiveTripLocationStatus;
    coordinate: GeoPoint | null;
    label: string;
    updatedAt: string | null;
  };
  freshness: {
    state: ActiveTripFreshnessState;
    label: string;
    capturedAt: string;
    updatedAt: string;
    staleAt: string | null;
  };
  startedAt: string;
  updatedAt: string;
  warnings: string[];
  recommendedAction: RouteConfidenceEngineResult['recommendedAction'];
  knownLimitations: string[];
};

export type BuildActiveTripModeSnapshotArgs = TripConfidenceInput & {
  itinerary: TripItinerary;
  selectedRoute: TripBuilderRouteInput | null;
  vehicleProfile?: TripBuilderVehicleProfile | null;
  plan?: TripPlan | null;
  routeConfidence?: RouteConfidenceEngineResult | null;
  lastKnownLocation?: GeoPoint | null;
  now?: string;
};

export type ActiveTripModeStore = {
  activate: (args: BuildActiveTripModeSnapshotArgs) => ActiveTripModeSnapshot;
  save: (snapshot: ActiveTripModeSnapshot) => ActiveTripModeSnapshot;
  get: () => ActiveTripModeSnapshot | null;
  getRecovered: (now?: string) => ActiveTripModeSnapshot | null;
  stop: (now?: string, status?: Extract<ActiveTripModeStatus, 'stopped' | 'completed'>) => ActiveTripModeSnapshot;
  clear: () => void;
  flush: () => Promise<void>;
  waitForHydration: () => Promise<void>;
  isHydrated: () => boolean;
};

type CreateActiveTripModeStoreArgs = {
  storage: ActiveTripModeStorage;
};

const RESUPPLY_BUCKETS: ItineraryPreTrailStopBucket[] = ['grocery', 'water', 'generalSupply'];

function nowIso(): string {
  return new Date().toISOString();
}

function cleanText(value: unknown): string | null {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || null;
}

function finiteNumber(value: unknown): number | null {
  const numberValue = typeof value === 'string' ? Number(value) : value;
  return typeof numberValue === 'number' && Number.isFinite(numberValue) ? numberValue : null;
}

function safeIdPart(value: unknown, fallback: string): string {
  const text = cleanText(value) ?? fallback;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function cloneSnapshot(snapshot: ActiveTripModeSnapshot): ActiveTripModeSnapshot {
  return JSON.parse(JSON.stringify(snapshot)) as ActiveTripModeSnapshot;
}

function statusLabel(status: ActiveTripOperationalStatus): string {
  switch (status) {
    case 'selected':
      return 'Selected';
    case 'ranked':
      return 'Candidate ranked';
    case 'available':
      return 'Available';
    case 'not_requested':
      return 'Not requested';
    case 'provider_unavailable':
      return 'Provider unavailable';
    case 'provider_pending':
      return 'Provider pending';
    case 'no_results':
      return 'No results';
    case 'missing_anchor':
      return 'Missing anchor';
    case 'missing':
      return 'Missing';
    case 'unknown':
    default:
      return 'Unknown';
  }
}

function strongestPreTrailStatus(
  itinerary: TripItinerary,
  buckets: ItineraryPreTrailStopBucket[],
): {
  status: ActiveTripOperationalStatus;
  updatedAt: string | null;
  warnings: string[];
} {
  const summaries = (itinerary.preTrailStopStatus ?? []).filter((summary) => buckets.includes(summary.bucket));
  const stops = buckets.reduce((count, bucket) => count + (itinerary.preTrailStops?.[bucket]?.length ?? 0), 0);
  const warnings = summaries.flatMap((summary) => summary.warnings ?? []);
  const updatedAt = summaries.find((summary) => cleanText(summary.searchedAt))?.searchedAt ?? null;

  if (stops > 0) return { status: 'selected', updatedAt, warnings };
  if (summaries.length === 0) return { status: 'unknown', updatedAt: null, warnings };

  const statuses = summaries.map((summary) => summary.status);
  const allNotRequested = statuses.every((status) => status === 'not_requested');
  if (allNotRequested) return { status: 'not_requested', updatedAt, warnings };

  const priority: ItineraryPreTrailStopBucketStatus[] = [
    'provider_unavailable',
    'provider_pending',
    'missing_anchor',
    'no_results',
    'ranked',
    'selected',
    'not_requested',
  ];
  const match = priority.find((status) => statuses.includes(status));
  return {
    status: (match ?? 'unknown') as ActiveTripOperationalStatus,
    updatedAt,
    warnings,
  };
}

function operationalSummary(
  status: ActiveTripOperationalStatus,
  source: string,
  updatedAt: string | null = null,
  warnings: string[] = [],
): ActiveTripOperationalSummary {
  return {
    status,
    label: statusLabel(status),
    source,
    updatedAt,
    warnings: warnings.filter(Boolean),
  };
}

function preTrailSummary(
  itinerary: TripItinerary,
  buckets: ItineraryPreTrailStopBucket[],
  source: string,
): ActiveTripOperationalSummary {
  const result = strongestPreTrailStatus(itinerary, buckets);
  return operationalSummary(result.status, source, result.updatedAt, result.warnings);
}

function campSummary(plan: TripPlan | null | undefined, itinerary: TripItinerary): ActiveTripOperationalSummary {
  if (plan?.primaryCampCandidate) return operationalSummary('available', 'trip_plan');
  const hasCampWaypoint = (itinerary.trailWaypoints ?? []).some((waypoint) => waypoint.type === 'camp_potential');
  return operationalSummary(hasCampWaypoint ? 'available' : 'unknown', hasCampWaypoint ? 'itinerary_waypoint' : 'not_enough_data');
}

function bailoutSummary(plan: TripPlan | null | undefined, itinerary: TripItinerary): ActiveTripOperationalSummary {
  if (plan?.primaryExitPoint) return operationalSummary('available', 'trip_plan');
  const hasBailoutWaypoint = (itinerary.trailWaypoints ?? []).some((waypoint) => waypoint.type === 'bailout');
  return operationalSummary(hasBailoutWaypoint ? 'available' : 'unknown', hasBailoutWaypoint ? 'itinerary_waypoint' : 'not_enough_data');
}

function vehicleSummary(vehicleProfile: TripBuilderVehicleProfile | null | undefined): ActiveTripVehicleSummary {
  return {
    id: cleanText(vehicleProfile?.id),
    label: cleanText(vehicleProfile?.label ?? vehicleProfile?.id) ?? 'Vehicle unknown',
    vehicleType: cleanText(vehicleProfile?.vehicleType),
    rangeMiles: finiteNumber(vehicleProfile?.rangeMiles),
    rangeSource: cleanText(vehicleProfile?.rangeSource),
    confidence: vehicleProfile?.confidence ?? null,
    source: cleanText(vehicleProfile?.source),
    updatedAt: cleanText(vehicleProfile?.updatedAt),
  };
}

function activeTripIdFor(routeConfidence: RouteConfidenceEngineResult, itinerary: TripItinerary): string {
  return `active-trip-${safeIdPart(itinerary.id ?? routeConfidence.route.routeId ?? routeConfidence.route.routeName, 'trip')}`;
}

function buildWarnings(routeConfidence: RouteConfidenceEngineResult): string[] {
  return Array.from(new Set([
    ...routeConfidence.keyWarnings,
    ...routeConfidence.reasons
      .filter((reason) => reason.tone === 'critical' || reason.tone === 'caution')
      .map((reason) => reason.label),
  ].filter(Boolean)));
}

export function markActiveTripModeSnapshotRecovered(
  snapshot: ActiveTripModeSnapshot,
  now: string = nowIso(),
): ActiveTripModeSnapshot {
  if (snapshot.status !== 'active') return cloneSnapshot(snapshot);

  const recovered = cloneSnapshot(snapshot);
  recovered.updatedAt = now;
  recovered.lastLocation = {
    status: 'unknown',
    coordinate: null,
    label: 'Last location unavailable after restart',
    updatedAt: null,
  };
  recovered.freshness = {
    ...recovered.freshness,
    state: 'stale',
    label: 'Recovered from local snapshot; live context unavailable until refreshed.',
    updatedAt: now,
    staleAt: now,
  };
  recovered.routeConfidence = {
    ...recovered.routeConfidence,
    dataConfidence: {
      state: recovered.routeConfidence.dataConfidence.state === 'demo'
        ? 'demo'
        : recovered.routeConfidence.dataConfidence.state === 'mock'
          ? 'mock'
          : 'stale',
      knownLimitations: Array.from(new Set([
        ...recovered.routeConfidence.dataConfidence.knownLimitations,
        'Recovered from local snapshot; live location, weather, and telemetry are unavailable until refreshed.',
      ])),
    },
    knownLimitations: Array.from(new Set([
      ...recovered.routeConfidence.knownLimitations,
      'Recovered from local snapshot; live location, weather, and telemetry are unavailable until refreshed.',
    ])),
  };
  recovered.knownLimitations = Array.from(new Set([
    ...recovered.knownLimitations,
    'Recovered from local snapshot; live location, weather, and telemetry are unavailable until refreshed.',
  ]));
  recovered.warnings = Array.from(new Set([
    ...recovered.warnings,
    'Recovered from local snapshot; live location, weather, and telemetry are unavailable until refreshed.',
  ]));
  return recovered;
}

export function buildActiveTripModeSnapshot(args: BuildActiveTripModeSnapshotArgs): ActiveTripModeSnapshot {
  const capturedAt = args.now ?? nowIso();
  const routeConfidence = args.routeConfidence ?? evaluateRouteConfidence({
    itinerary: args.itinerary,
    selectedRoute: args.selectedRoute,
    vehicleProfile: args.vehicleProfile ?? null,
    plan: args.plan ?? null,
    environment: args.environment ?? {
      weather: { status: 'unknown', label: 'Weather unavailable for Active Trip snapshot' },
      daylight: { status: 'unknown', label: 'Daylight unavailable for Active Trip snapshot' },
      remoteness: { status: 'unknown', label: 'Remoteness unavailable for Active Trip snapshot' },
    },
    telemetry: args.telemetry ?? { status: 'unavailable', label: 'Telemetry unavailable for Active Trip snapshot' },
  });

  return {
    version: ACTIVE_TRIP_MODE_VERSION,
    activeTripId: activeTripIdFor(routeConfidence, args.itinerary),
    status: 'active',
    sourceItineraryId: cleanText(args.itinerary.id),
    sourceRouteId: cleanText(routeConfidence.route.routeId ?? args.itinerary.routeId ?? args.itinerary.sourceRouteId),
    route: {
      id: cleanText(routeConfidence.route.routeId ?? args.itinerary.routeId ?? args.itinerary.sourceRouteId),
      name: cleanText(routeConfidence.route.routeName ?? args.selectedRoute?.name ?? args.selectedRoute?.title ?? args.itinerary.title),
      authorityStatus: routeConfidence.route.status,
      authorityLabel: routeConfidence.route.authorityLabel,
      geometryStatus: routeConfidence.route.geometryStatus,
      geometrySource: routeConfidence.route.geometrySource,
      geometryValid: routeConfidence.route.geometryValid,
      trailheadCoordinate: routeConfidence.route.trailheadCoordinate,
      distanceMiles: routeConfidence.route.distanceMiles,
    },
    vehicle: vehicleSummary(args.vehicleProfile),
    routeConfidence,
    logistics: {
      refuel: preTrailSummary(args.itinerary, ['fuel'], 'pre_trail_resupply_resolver'),
      resupply: preTrailSummary(args.itinerary, RESUPPLY_BUCKETS, 'pre_trail_resupply_resolver'),
      camp: campSummary(args.plan, args.itinerary),
      bailout: bailoutSummary(args.plan, args.itinerary),
    },
    lastLocation: {
      status: args.lastKnownLocation ? 'available' : 'unknown',
      coordinate: args.lastKnownLocation ?? null,
      label: args.lastKnownLocation ? 'Last known location captured at activation' : 'Last location unknown',
      updatedAt: args.lastKnownLocation ? capturedAt : null,
    },
    freshness: {
      state: 'fresh',
      label: 'Active Trip snapshot captured from current Trip Builder context.',
      capturedAt,
      updatedAt: capturedAt,
      staleAt: null,
    },
    startedAt: capturedAt,
    updatedAt: capturedAt,
    warnings: buildWarnings(routeConfidence),
    recommendedAction: routeConfidence.recommendedAction,
    knownLimitations: routeConfidence.knownLimitations,
  };
}

function parseSnapshot(raw: string | null): ActiveTripModeSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveTripModeSnapshot;
    if (!parsed || parsed.version !== ACTIVE_TRIP_MODE_VERSION || !parsed.activeTripId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createActiveTripModeStore({ storage }: CreateActiveTripModeStoreArgs): ActiveTripModeStore {
  return {
    activate(args) {
      const snapshot = buildActiveTripModeSnapshot(args);
      storage.set(ACTIVE_TRIP_MODE_STORAGE_KEY, JSON.stringify(snapshot));
      return cloneSnapshot(snapshot);
    },

    save(snapshot) {
      storage.set(ACTIVE_TRIP_MODE_STORAGE_KEY, JSON.stringify(snapshot));
      return cloneSnapshot(snapshot);
    },

    get() {
      return parseSnapshot(storage.get(ACTIVE_TRIP_MODE_STORAGE_KEY));
    },

    getRecovered(now = nowIso()) {
      const snapshot = parseSnapshot(storage.get(ACTIVE_TRIP_MODE_STORAGE_KEY));
      return snapshot ? markActiveTripModeSnapshotRecovered(snapshot, now) : null;
    },

    stop(now = nowIso(), status: Extract<ActiveTripModeStatus, 'stopped' | 'completed'> = 'stopped') {
      const current = parseSnapshot(storage.get(ACTIVE_TRIP_MODE_STORAGE_KEY));
      const stopped: ActiveTripModeSnapshot = current
        ? {
          ...cloneSnapshot(current),
          status,
          updatedAt: now,
          freshness: {
            ...current.freshness,
            updatedAt: now,
          },
        }
        : {
          version: ACTIVE_TRIP_MODE_VERSION,
          activeTripId: `active-trip-cleared-${safeIdPart(now, 'now')}`,
          status,
          sourceItineraryId: null,
          sourceRouteId: null,
          route: {
            id: null,
            name: null,
            authorityStatus: 'unknown',
            authorityLabel: 'Unknown Route Authority',
            geometryStatus: 'unknown',
            geometrySource: null,
            geometryValid: false,
            trailheadCoordinate: null,
            distanceMiles: null,
          },
          vehicle: vehicleSummary(null),
          routeConfidence: evaluateRouteConfidence({
            itinerary: null,
            selectedRoute: null,
            vehicleProfile: null,
            environment: {
              weather: { status: 'unknown' },
              daylight: { status: 'unknown' },
              remoteness: { status: 'unknown' },
            },
            telemetry: { status: 'unavailable' },
          }),
          logistics: {
            refuel: operationalSummary('unknown', 'not_enough_data'),
            resupply: operationalSummary('unknown', 'not_enough_data'),
            camp: operationalSummary('unknown', 'not_enough_data'),
            bailout: operationalSummary('unknown', 'not_enough_data'),
          },
          lastLocation: {
            status: 'unknown',
            coordinate: null,
            label: 'Last location unknown',
            updatedAt: null,
          },
          freshness: {
            state: 'unknown',
            label: 'No active trip snapshot was stored.',
            capturedAt: now,
            updatedAt: now,
            staleAt: null,
          },
          startedAt: now,
          updatedAt: now,
          warnings: [],
          recommendedAction: { id: 'proceed_with_caution', label: 'Proceed with caution' },
          knownLimitations: ['No active trip snapshot was stored.'],
      };
      storage.delete(ACTIVE_TRIP_MODE_STORAGE_KEY);
      return cloneSnapshot(stopped);
    },

    clear() {
      storage.delete(ACTIVE_TRIP_MODE_STORAGE_KEY);
    },

    flush() {
      return storage.flush();
    },

    waitForHydration() {
      return storage.waitForHydration();
    },

    isHydrated() {
      return storage.isHydrated();
    },
  };
}

let defaultStore: ActiveTripModeStore | null = null;

function getDefaultStore(): ActiveTripModeStore {
  if (!defaultStore) {
    const { createPersistedKeyValueCache } = require('./keyValuePersistence');
    defaultStore = createActiveTripModeStore({
      storage: createPersistedKeyValueCache(ACTIVE_TRIP_MODE_STORAGE_FILE),
    });
  }
  return defaultStore;
}

export const activeTripModeStore: ActiveTripModeStore = {
  activate(args) {
    return getDefaultStore().activate(args);
  },
  save(snapshot) {
    return getDefaultStore().save(snapshot);
  },
  get() {
    return getDefaultStore().get();
  },
  getRecovered(now) {
    return getDefaultStore().getRecovered(now);
  },
  stop(now, status) {
    return getDefaultStore().stop(now, status);
  },
  clear() {
    return getDefaultStore().clear();
  },
  flush() {
    return getDefaultStore().flush();
  },
  waitForHydration() {
    return getDefaultStore().waitForHydration();
  },
  isHydrated() {
    return getDefaultStore().isHydrated();
  },
};
