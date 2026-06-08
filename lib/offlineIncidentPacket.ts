import type {
  ActiveTripModeSnapshot,
  ActiveTripModeStatus,
  ActiveTripOperationalSummary,
  ActiveTripRouteSummary,
  ActiveTripVehicleSummary,
} from './activeTripMode';
import type { GeoPoint } from './tripBuilder/tripBuilderTypes';

declare const require: (id: string) => {
  createPersistedKeyValueCache: (fileKey: string) => OfflineIncidentPacketStorage;
};

export const OFFLINE_INCIDENT_PACKET_STORAGE_FILE = 'ecs_offline_incident_packet';
export const OFFLINE_INCIDENT_PACKET_STORAGE_KEY = 'offline_incident_packet_snapshot';
export const OFFLINE_INCIDENT_PACKET_VERSION = 1;

export type OfflineIncidentPacketSharingState = 'disabled';

export type OfflineIncidentPacketStorage = {
  get: (key: string) => string | null;
  set: (key: string, value: string) => void;
  delete: (key: string) => void;
  clear?: () => void;
  flush: () => Promise<void>;
  waitForHydration: () => Promise<void>;
  isHydrated: () => boolean;
};

export type OfflineIncidentPacketRouteSummary = Pick<
  ActiveTripRouteSummary,
  | 'id'
  | 'name'
  | 'authorityStatus'
  | 'authorityLabel'
  | 'geometryStatus'
  | 'geometrySource'
  | 'geometryValid'
  | 'trailheadCoordinate'
  | 'distanceMiles'
> & {
  routeTypeStatus: ActiveTripRouteSummary['authorityStatus'];
};

export type OfflineIncidentPacketLocationSummary = {
  status: ActiveTripModeSnapshot['lastLocation']['status'];
  coordinate: GeoPoint | null;
  label: string;
  updatedAt: string | null;
};

export type OfflineIncidentPacketConfidenceSummary = {
  category: ActiveTripModeSnapshot['routeConfidence']['category'];
  label: string;
  score: number | null;
  recommendedAction: ActiveTripModeSnapshot['recommendedAction'];
  knownLimitations: string[];
};

export type OfflineIncidentPacketFreshnessSummary = {
  state: ActiveTripModeSnapshot['freshness']['state'];
  label: string;
  sourceSnapshotCapturedAt: string;
  sourceSnapshotUpdatedAt: string;
  staleAt: string | null;
};

export type OfflineIncidentPacket = {
  version: typeof OFFLINE_INCIDENT_PACKET_VERSION;
  packetId: string;
  activeTripId: string;
  sourceItineraryId: string | null;
  sourceRouteId: string | null;
  status: ActiveTripModeStatus;
  route: OfflineIncidentPacketRouteSummary;
  vehicle: ActiveTripVehicleSummary;
  confidence: OfflineIncidentPacketConfidenceSummary;
  keyWarnings: string[];
  logistics: {
    refuel: ActiveTripOperationalSummary;
    resupply: ActiveTripOperationalSummary;
    camp: ActiveTripOperationalSummary;
    bailout: ActiveTripOperationalSummary;
  };
  lastKnownLocation: OfflineIncidentPacketLocationSummary;
  startedAt: string;
  packetCreatedAt: string;
  packetUpdatedAt: string;
  dataFreshness: OfflineIncidentPacketFreshnessSummary;
  localOnly: true;
  externalSharing: OfflineIncidentPacketSharingState;
  safetyCopy: string;
};

export type OfflineIncidentPacketStore = {
  createOrUpdateFromActiveTrip: (snapshot: ActiveTripModeSnapshot, now?: string) => OfflineIncidentPacket;
  save: (packet: OfflineIncidentPacket) => OfflineIncidentPacket;
  get: () => OfflineIncidentPacket | null;
  getRecovered: (now?: string) => OfflineIncidentPacket | null;
  clear: () => void;
  flush: () => Promise<void>;
  waitForHydration: () => Promise<void>;
  isHydrated: () => boolean;
};

type CreateOfflineIncidentPacketStoreArgs = {
  storage: OfflineIncidentPacketStorage;
};

function nowIso(): string {
  return new Date().toISOString();
}

function clonePacket(packet: OfflineIncidentPacket): OfflineIncidentPacket {
  return JSON.parse(JSON.stringify(packet)) as OfflineIncidentPacket;
}

function safeIdPart(value: unknown, fallback: string): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim() || fallback;
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || fallback;
}

function packetIdFor(snapshot: ActiveTripModeSnapshot): string {
  return `offline-incident-packet-${safeIdPart(snapshot.activeTripId, 'active-trip')}`;
}

function uniqueWarnings(snapshot: ActiveTripModeSnapshot): string[] {
  return Array.from(new Set([
    ...snapshot.warnings,
    ...snapshot.routeConfidence.keyWarnings,
  ].filter(Boolean)));
}

export function buildOfflineIncidentPacketFromActiveTrip(
  snapshot: ActiveTripModeSnapshot,
  now: string = nowIso(),
  previousPacket?: OfflineIncidentPacket | null,
): OfflineIncidentPacket {
  return {
    version: OFFLINE_INCIDENT_PACKET_VERSION,
    packetId: previousPacket?.packetId ?? packetIdFor(snapshot),
    activeTripId: snapshot.activeTripId,
    sourceItineraryId: snapshot.sourceItineraryId,
    sourceRouteId: snapshot.sourceRouteId,
    status: snapshot.status,
    route: {
      id: snapshot.route.id,
      name: snapshot.route.name,
      authorityStatus: snapshot.route.authorityStatus,
      authorityLabel: snapshot.route.authorityLabel,
      routeTypeStatus: snapshot.route.authorityStatus,
      geometryStatus: snapshot.route.geometryStatus,
      geometrySource: snapshot.route.geometrySource,
      geometryValid: snapshot.route.geometryValid,
      trailheadCoordinate: snapshot.route.trailheadCoordinate,
      distanceMiles: snapshot.route.distanceMiles,
    },
    vehicle: snapshot.vehicle,
    confidence: {
      category: snapshot.routeConfidence.category,
      label: snapshot.routeConfidence.label,
      score: snapshot.routeConfidence.score ?? null,
      recommendedAction: snapshot.recommendedAction,
      knownLimitations: snapshot.knownLimitations,
    },
    keyWarnings: uniqueWarnings(snapshot),
    logistics: {
      refuel: snapshot.logistics.refuel,
      resupply: snapshot.logistics.resupply,
      camp: snapshot.logistics.camp,
      bailout: snapshot.logistics.bailout,
    },
    lastKnownLocation: {
      status: snapshot.lastLocation.status,
      coordinate: snapshot.lastLocation.coordinate,
      label: snapshot.lastLocation.label,
      updatedAt: snapshot.lastLocation.updatedAt,
    },
    startedAt: snapshot.startedAt,
    packetCreatedAt: previousPacket?.packetCreatedAt ?? now,
    packetUpdatedAt: now,
    dataFreshness: {
      state: snapshot.freshness.state,
      label: snapshot.freshness.label,
      sourceSnapshotCapturedAt: snapshot.freshness.capturedAt,
      sourceSnapshotUpdatedAt: snapshot.freshness.updatedAt,
      staleAt: snapshot.freshness.staleAt,
    },
    localOnly: true,
    externalSharing: 'disabled',
    safetyCopy: 'LOCAL-ONLY. This packet is stored on this device for offline review and is not sent by ECS.',
  };
}

function parsePacket(raw: string | null): OfflineIncidentPacket | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as OfflineIncidentPacket;
    if (!parsed || parsed.version !== OFFLINE_INCIDENT_PACKET_VERSION || !parsed.packetId) return null;
    if (parsed.localOnly !== true || parsed.externalSharing !== 'disabled') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function markOfflineIncidentPacketRecovered(
  packet: OfflineIncidentPacket,
  now: string = nowIso(),
): OfflineIncidentPacket {
  if (packet.status !== 'active') return clonePacket(packet);

  const recovered = clonePacket(packet);
  recovered.packetUpdatedAt = now;
  recovered.dataFreshness = {
    ...recovered.dataFreshness,
    state: recovered.dataFreshness.state === 'fresh' ? 'stale' : recovered.dataFreshness.state,
    label: 'Recovered from local incident packet; live location, weather, and telemetry are unavailable until refreshed.',
    staleAt: recovered.dataFreshness.staleAt ?? now,
  };
  recovered.lastKnownLocation = {
    ...recovered.lastKnownLocation,
    status: recovered.lastKnownLocation.status === 'available' ? 'stale' : recovered.lastKnownLocation.status,
    label: recovered.lastKnownLocation.coordinate
      ? 'Last known location is stale after restart'
      : 'Last location unavailable after restart',
  };
  recovered.keyWarnings = Array.from(new Set([
    ...recovered.keyWarnings,
    'Recovered from local incident packet; live location, weather, and telemetry are unavailable until refreshed.',
  ]));
  return recovered;
}

export function createOfflineIncidentPacketStore({
  storage,
}: CreateOfflineIncidentPacketStoreArgs): OfflineIncidentPacketStore {
  return {
    createOrUpdateFromActiveTrip(snapshot, now = nowIso()) {
      const existing = parsePacket(storage.get(OFFLINE_INCIDENT_PACKET_STORAGE_KEY));
      const packet = buildOfflineIncidentPacketFromActiveTrip(snapshot, now, existing);
      storage.set(OFFLINE_INCIDENT_PACKET_STORAGE_KEY, JSON.stringify(packet));
      return clonePacket(packet);
    },

    save(packet) {
      storage.set(OFFLINE_INCIDENT_PACKET_STORAGE_KEY, JSON.stringify(packet));
      return clonePacket(packet);
    },

    get() {
      return parsePacket(storage.get(OFFLINE_INCIDENT_PACKET_STORAGE_KEY));
    },

    getRecovered(now = nowIso()) {
      const packet = parsePacket(storage.get(OFFLINE_INCIDENT_PACKET_STORAGE_KEY));
      if (!packet) return null;
      const recovered = markOfflineIncidentPacketRecovered(packet, now);
      storage.set(OFFLINE_INCIDENT_PACKET_STORAGE_KEY, JSON.stringify(recovered));
      return clonePacket(recovered);
    },

    clear() {
      storage.delete(OFFLINE_INCIDENT_PACKET_STORAGE_KEY);
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

let defaultStore: OfflineIncidentPacketStore | null = null;

function getDefaultStore(): OfflineIncidentPacketStore {
  if (!defaultStore) {
    const { createPersistedKeyValueCache } = require('./keyValuePersistence');
    defaultStore = createOfflineIncidentPacketStore({
      storage: createPersistedKeyValueCache(OFFLINE_INCIDENT_PACKET_STORAGE_FILE),
    });
  }
  return defaultStore;
}

export const offlineIncidentPacketStore: OfflineIncidentPacketStore = {
  createOrUpdateFromActiveTrip(snapshot, now) {
    return getDefaultStore().createOrUpdateFromActiveTrip(snapshot, now);
  },
  save(packet) {
    return getDefaultStore().save(packet);
  },
  get() {
    return getDefaultStore().get();
  },
  getRecovered(now) {
    return getDefaultStore().getRecovered(now);
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
