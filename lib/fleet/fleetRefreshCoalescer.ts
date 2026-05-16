import type { VehicleChangeEvent } from '../vehicleStore';

export type FleetRefreshBatch = {
  highestRev: number;
  changedVehicleIds: string[];
  changedVehicleCount: number;
  eventTypes: VehicleChangeEvent['type'][];
};

export type FleetRefreshLogEvent =
  | 'fleet_refresh_scheduled'
  | 'fleet_refresh_coalesced'
  | 'fleet_refresh_executed';

export type FleetRefreshLogPayload = {
  highestRev: number;
  changedVehicleCount: number;
  reason?: VehicleChangeEvent['type'] | 'timer' | 'flush';
  delayMs?: number;
};

export type FleetRefreshCoalescerOptions = {
  delayMs?: number;
  getLastFetchedRevision: () => number;
  refresh: (batch: FleetRefreshBatch) => void;
  log?: (event: FleetRefreshLogEvent, payload: FleetRefreshLogPayload) => void;
};

const DEFAULT_FLEET_REFRESH_DEBOUNCE_MS = 200;

export function createFleetRefreshCoalescer(options: FleetRefreshCoalescerOptions) {
  const delayMs = options.delayMs ?? DEFAULT_FLEET_REFRESH_DEBOUNCE_MS;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let highestRev = 0;
  let lastExecutedRev = 0;
  const changedVehicleIds = new Set<string>();
  const eventTypes = new Set<VehicleChangeEvent['type']>();

  const clearTimer = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const hasPendingBatch = () => highestRev > 0;

  const resetPending = () => {
    highestRev = 0;
    changedVehicleIds.clear();
    eventTypes.clear();
  };

  const execute = (reason: FleetRefreshLogPayload['reason']) => {
    clearTimer();
    if (!hasPendingBatch()) return;
    const batch: FleetRefreshBatch = {
      highestRev,
      changedVehicleIds: Array.from(changedVehicleIds),
      changedVehicleCount: changedVehicleIds.size,
      eventTypes: Array.from(eventTypes),
    };
    lastExecutedRev = Math.max(lastExecutedRev, highestRev);
    resetPending();
    options.log?.('fleet_refresh_executed', {
      highestRev: batch.highestRev,
      changedVehicleCount: batch.changedVehicleCount,
      reason,
    });
    options.refresh(batch);
  };

  const schedule = (event: VehicleChangeEvent) => {
    const lastFetchedRevision = options.getLastFetchedRevision();
    if (event.revision <= lastFetchedRevision || event.revision <= lastExecutedRev) return;

    const wasPending = hasPendingBatch();
    highestRev = Math.max(highestRev, event.revision);
    if (event.vehicleId) changedVehicleIds.add(event.vehicleId);
    eventTypes.add(event.type);

    if (event.type === 'delete') {
      // Deletions should disappear from Fleet immediately so stale cards and modal targets
      // are not left interactive while the debounce window is open.
      execute(event.type);
      return;
    }

    if (wasPending) {
      options.log?.('fleet_refresh_coalesced', {
        highestRev,
        changedVehicleCount: changedVehicleIds.size,
        reason: event.type,
        delayMs,
      });
      return;
    }

    options.log?.('fleet_refresh_scheduled', {
      highestRev,
      changedVehicleCount: changedVehicleIds.size,
      reason: event.type,
      delayMs,
    });
    timer = setTimeout(() => execute('timer'), delayMs);
  };

  return {
    schedule,
    flush: () => execute('flush'),
    cancel: () => {
      clearTimer();
      resetPending();
    },
  };
}
