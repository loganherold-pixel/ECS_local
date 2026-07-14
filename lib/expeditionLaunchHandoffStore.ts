import { createPersistedKeyValueCache } from './keyValuePersistence';
import {
  buildCompletionKey,
  canonicalJourneyEntityId,
  mergeJourneyLinkage,
  normalizeJourneyLinkage,
  type ECSJourneyLinkage,
} from './lifecycle/routeTripExpeditionLifecycle';

const EXPEDITION_LAUNCH_HANDOFF_VERSION = 2;

export type ExpeditionLaunchHandoffStatus = 'active' | 'resumed';

export interface ExpeditionLaunchHandoff {
  schemaVersion: number;
  id: string;
  idempotencyKey: string;
  status: ExpeditionLaunchHandoffStatus;
  expeditionRecordId: string;
  packetId: string;
  packetTitle: string;
  routeAssetId: string;
  routeTitle: string;
  routeId: string | null;
  runId: string | null;
  vehicleId: string;
  vehicleName: string;
  lifecycle: ECSJourneyLinkage;
  launchedAt: string;
  updatedAt: string;
}

export interface ExpeditionLaunchHandoffInput {
  status: ExpeditionLaunchHandoffStatus;
  expeditionRecordId: string;
  packetId: string;
  packetTitle: string;
  routeAssetId: string;
  routeTitle: string;
  routeId?: string | null;
  runId?: string | null;
  vehicleId: string;
  vehicleName: string;
  lifecycle?: ECSJourneyLinkage | null;
}

type LaunchHandoffListener = (handoff: ExpeditionLaunchHandoff | null) => void;

const cache = createPersistedKeyValueCache('ecs_expedition_launch_handoff');
const KEY = 'active_launch_handoff';
const listeners = new Set<LaunchHandoffListener>();

function safeParseHandoff(raw: string | null): ExpeditionLaunchHandoff | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ExpeditionLaunchHandoff>;
    if (!parsed?.id || !parsed.expeditionRecordId || !parsed.routeAssetId) return null;
    const updatedAt = parsed.updatedAt ?? parsed.launchedAt ?? new Date(0).toISOString();
    const identity = {
      routeAssetId: canonicalJourneyEntityId('route_asset', parsed.routeAssetId),
      expeditionId: canonicalJourneyEntityId('expedition', parsed.expeditionRecordId),
      navigationSessionId: parsed.routeId
        ? canonicalJourneyEntityId('navigation_session', parsed.routeId)
        : null,
      recordedRunId: parsed.runId
        ? canonicalJourneyEntityId('recorded_run', parsed.runId)
        : null,
    };
    const lifecycle = mergeJourneyLinkage(normalizeJourneyLinkage(parsed.lifecycle), {
      phase: 'active',
      identity: {
        ...identity,
        completedOutcomeId: buildCompletionKey(identity),
      },
      activeVehicleId: parsed.vehicleId,
      updatedAt,
    });
    return {
      schemaVersion: EXPEDITION_LAUNCH_HANDOFF_VERSION,
      id: parsed.id,
      idempotencyKey: parsed.idempotencyKey ?? `launch:${parsed.expeditionRecordId}:${parsed.routeAssetId}`,
      status: parsed.status ?? 'active',
      expeditionRecordId: parsed.expeditionRecordId,
      packetId: parsed.packetId ?? `preflight:${parsed.routeAssetId}`,
      packetTitle: parsed.packetTitle ?? parsed.routeTitle ?? 'Expedition preflight',
      routeAssetId: parsed.routeAssetId,
      routeTitle: parsed.routeTitle ?? 'Planned route',
      routeId: parsed.routeId ?? null,
      runId: parsed.runId ?? null,
      vehicleId: parsed.vehicleId ?? 'unknown-vehicle',
      vehicleName: parsed.vehicleName ?? 'Vehicle unavailable',
      lifecycle,
      launchedAt: parsed.launchedAt ?? updatedAt,
      updatedAt,
    };
  } catch {
    return null;
  }
}

function notify(next: ExpeditionLaunchHandoff | null) {
  listeners.forEach((listener) => {
    try {
      listener(next);
    } catch {}
  });
}

function createHandoffId(input: ExpeditionLaunchHandoffInput): string {
  const routeKey = input.routeAssetId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'route';
  return `launch:${input.expeditionRecordId}:${routeKey}`;
}

export const expeditionLaunchHandoffStore = {
  getActive(): ExpeditionLaunchHandoff | null {
    return safeParseHandoff(cache.get(KEY));
  },

  record(input: ExpeditionLaunchHandoffInput): ExpeditionLaunchHandoff {
    const previous = this.getActive();
    const now = new Date().toISOString();
    const identity = {
      routeAssetId: canonicalJourneyEntityId('route_asset', input.routeAssetId),
      expeditionId: canonicalJourneyEntityId('expedition', input.expeditionRecordId),
      navigationSessionId: input.routeId
        ? canonicalJourneyEntityId('navigation_session', input.routeId)
        : null,
      recordedRunId: input.runId
        ? canonicalJourneyEntityId('recorded_run', input.runId)
        : null,
    };
    const lifecycle = mergeJourneyLinkage(input.lifecycle ?? previous?.lifecycle, {
      phase: 'active',
      identity: {
        ...identity,
        completedOutcomeId: buildCompletionKey(identity),
      },
      activeVehicleId: input.vehicleId,
      updatedAt: now,
    });
    const handoff: ExpeditionLaunchHandoff = {
      schemaVersion: EXPEDITION_LAUNCH_HANDOFF_VERSION,
      id:
        previous?.expeditionRecordId === input.expeditionRecordId &&
        previous.routeAssetId === input.routeAssetId
          ? previous.id
          : createHandoffId(input),
      idempotencyKey: `launch:${input.expeditionRecordId}:${input.routeAssetId}`,
      status: input.status,
      expeditionRecordId: input.expeditionRecordId,
      packetId: input.packetId,
      packetTitle: input.packetTitle,
      routeAssetId: input.routeAssetId,
      routeTitle: input.routeTitle,
      routeId: input.routeId ?? null,
      runId: input.runId ?? null,
      vehicleId: input.vehicleId,
      vehicleName: input.vehicleName,
      lifecycle,
      launchedAt: previous?.expeditionRecordId === input.expeditionRecordId ? previous.launchedAt : now,
      updatedAt: now,
    };

    cache.set(KEY, JSON.stringify(handoff));
    notify(handoff);
    return handoff;
  },

  clear(): void {
    cache.delete(KEY);
    notify(null);
  },

  subscribe(listener: LaunchHandoffListener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

export async function loadExpeditionLaunchHandoffAsync(): Promise<ExpeditionLaunchHandoff | null> {
  await cache.waitForHydration();
  return expeditionLaunchHandoffStore.getActive();
}
