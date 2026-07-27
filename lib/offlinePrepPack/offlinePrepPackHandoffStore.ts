import { Platform } from 'react-native';

import type { OfflinePrepPackInput } from './offlinePrepPackTypes';
import { createPersistedKeyValueCache } from '../keyValuePersistence';
import {
  canonicalJourneyEntityId,
  mergeJourneyLinkage,
  readJourneyLinkageFromMetadata,
  type ECSJourneyLinkage,
} from '../lifecycle/routeTripExpeditionLifecycle';

const OFFLINE_PREP_PACK_HANDOFF_KEY = 'ecs_offline_prep_pack_handoff';
const OFFLINE_PREP_PACK_HANDOFF_VERSION = 2;
const offlinePrepHandoffPersistence = createPersistedKeyValueCache('ecs_offline_prep_pack_handoff');

export type OfflinePrepPackHandoff = {
  schemaVersion: number;
  handoffId: string;
  idempotencyKey: string;
  input: OfflinePrepPackInput;
  lifecycle: ECSJourneyLinkage;
  source: 'explore' | 'route_details' | 'trip_builder';
  createdAt: string;
};

let memoryHandoff: OfflinePrepPackHandoff | null = null;

function getStorage(): Storage | null {
  if (Platform.OS !== 'web') return null;
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

function routeId(input: OfflinePrepPackInput): string {
  return String(input.route.id ?? input.route.name ?? input.route.title ?? 'selected-route').trim() || 'selected-route';
}

function buildLifecycle(input: OfflinePrepPackInput, createdAt: string): ECSJourneyLinkage {
  const routeKey = routeId(input);
  const current = readJourneyLinkageFromMetadata(input.route.routeMetadata);
  const offlinePackageId = canonicalJourneyEntityId('offline_package', routeKey);
  const isTrailDownload = input.mode === 'trail_download';
  return mergeJourneyLinkage(input.tripPlan?.lifecycle ?? current, {
    phase: 'offline_ready',
    identity: {
      tripPlanId: isTrailDownload
        ? null
        : input.tripPlan?.id ?? current?.identity.tripPlanId ?? canonicalJourneyEntityId('trip_plan', routeKey),
      offlinePackageId,
    },
    activeVehicleId: input.vehicleProfile?.id ?? current?.activeVehicleId ?? null,
    campIds: (input.campsiteCandidates ?? []).map((camp) => camp.id),
    waypointIds: input.itinerary?.waypoints?.map((waypoint) => waypoint.id) ?? current?.waypointIds ?? [],
    bailoutIds: (input.exitPoints ?? []).map((point) => point.id),
    offlineReady: true,
    updatedAt: createdAt,
  });
}

function normalizeHandoff(value: unknown): OfflinePrepPackHandoff | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as Partial<OfflinePrepPackHandoff>;
  if (!parsed.input?.route) return null;
  const createdAt = typeof parsed.createdAt === 'string' ? parsed.createdAt : new Date(0).toISOString();
  const routeKey = routeId(parsed.input);
  const lifecycle = parsed.lifecycle ?? buildLifecycle(parsed.input, createdAt);
  return {
    schemaVersion: OFFLINE_PREP_PACK_HANDOFF_VERSION,
    handoffId: parsed.handoffId ?? `offline-prep-handoff:${canonicalJourneyEntityId('offline_package', routeKey)}`,
    idempotencyKey: parsed.idempotencyKey ?? `offline-prep:${routeKey}`,
    input: parsed.input,
    lifecycle,
    source: parsed.source ?? 'explore',
    createdAt,
  };
}

function readPersistedHandoff(): string | null {
  if (Platform.OS === 'web') return getStorage()?.getItem(OFFLINE_PREP_PACK_HANDOFF_KEY) ?? null;
  return offlinePrepHandoffPersistence.get(OFFLINE_PREP_PACK_HANDOFF_KEY);
}

const offlinePrepHandoffHydration = Platform.OS === 'web'
  ? Promise.resolve()
  : offlinePrepHandoffPersistence.waitForHydration().then(() => {
      const raw = readPersistedHandoff();
      if (!raw || memoryHandoff) return;
      try { memoryHandoff = normalizeHandoff(JSON.parse(raw)); } catch {}
    });

export function saveOfflinePrepPackHandoff(
  input: OfflinePrepPackInput,
  source: OfflinePrepPackHandoff['source'] = 'explore',
): OfflinePrepPackHandoff {
  const createdAt = new Date().toISOString();
  const lifecycle = buildLifecycle(input, createdAt);
  const routeKey = routeId(input);
  const handoff: OfflinePrepPackHandoff = {
    schemaVersion: OFFLINE_PREP_PACK_HANDOFF_VERSION,
    handoffId: `offline-prep-handoff:${lifecycle.identity.offlinePackageId}`,
    idempotencyKey: `offline-prep:${routeKey}`,
    input,
    lifecycle,
    source,
    createdAt,
  };
  memoryHandoff = handoff;
  try {
    const serialized = JSON.stringify(handoff);
    if (Platform.OS === 'web') getStorage()?.setItem(OFFLINE_PREP_PACK_HANDOFF_KEY, serialized);
    else {
      offlinePrepHandoffPersistence.set(OFFLINE_PREP_PACK_HANDOFF_KEY, serialized);
      void offlinePrepHandoffPersistence.flush();
    }
  } catch {
    // Memory handoff still supports the current native session.
  }
  return handoff;
}

export function loadOfflinePrepPackHandoff(): OfflinePrepPackHandoff | null {
  if (memoryHandoff) return memoryHandoff;
  try {
    const raw = readPersistedHandoff();
    if (!raw) return null;
    const parsed = normalizeHandoff(JSON.parse(raw));
    memoryHandoff = parsed;
    return parsed;
  } catch {
    return null;
  }
}

export function clearOfflinePrepPackHandoff(): void {
  memoryHandoff = null;
  try {
    if (Platform.OS === 'web') getStorage()?.removeItem(OFFLINE_PREP_PACK_HANDOFF_KEY);
    else {
      offlinePrepHandoffPersistence.delete(OFFLINE_PREP_PACK_HANDOFF_KEY);
      void offlinePrepHandoffPersistence.flush();
    }
  } catch {
    // No-op.
  }
}

export async function loadOfflinePrepPackHandoffAsync(): Promise<OfflinePrepPackHandoff | null> {
  await offlinePrepHandoffHydration;
  return loadOfflinePrepPackHandoff();
}

export function waitForOfflinePrepPackHandoffHydration(): Promise<void> {
  return offlinePrepHandoffHydration;
}
