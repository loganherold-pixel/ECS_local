import { createPersistedKeyValueCache } from './keyValuePersistence';

export type ExpeditionLaunchHandoffStatus = 'active' | 'resumed';

export interface ExpeditionLaunchHandoff {
  id: string;
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
}

type LaunchHandoffListener = (handoff: ExpeditionLaunchHandoff | null) => void;

const cache = createPersistedKeyValueCache('ecs_expedition_launch_handoff');
const KEY = 'active_launch_handoff';
const listeners = new Set<LaunchHandoffListener>();

function safeParseHandoff(raw: string | null): ExpeditionLaunchHandoff | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ExpeditionLaunchHandoff;
    if (!parsed?.id || !parsed.expeditionRecordId || !parsed.routeAssetId) return null;
    return parsed;
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

function createHandoffId(input: ExpeditionLaunchHandoffInput, timestamp: string): string {
  const routeKey = input.routeAssetId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 48) || 'route';
  return `launch:${input.expeditionRecordId}:${routeKey}:${Date.parse(timestamp) || Date.now()}`;
}

export const expeditionLaunchHandoffStore = {
  getActive(): ExpeditionLaunchHandoff | null {
    return safeParseHandoff(cache.get(KEY));
  },

  record(input: ExpeditionLaunchHandoffInput): ExpeditionLaunchHandoff {
    const previous = this.getActive();
    const now = new Date().toISOString();
    const handoff: ExpeditionLaunchHandoff = {
      id:
        previous?.expeditionRecordId === input.expeditionRecordId &&
        previous.routeAssetId === input.routeAssetId
          ? previous.id
          : createHandoffId(input, now),
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
