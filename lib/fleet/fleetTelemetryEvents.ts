export type FleetTelemetryEventName =
  | 'fleet_vehicle_added'
  | 'fleet_specs_confirmed'
  | 'fleet_accessory_added'
  | 'fleet_loadout_item_added'
  | 'fleet_weight_verified'
  | 'fleet_checklist_completed'
  | 'preview_generated'
  | 'suggestion_viewed'
  | 'suggestion_accepted'
  | 'suggestion_acknowledged'
  | 'suggestion_editor_opened'
  | 'suggestion_applied'
  | 'suggestion_dismissed'
  | 'suggestion_apply_failed'
  | 'source_confirmed'
  | 'warning_acknowledged'
  | 'command_brief_mirror_updated'
  | 'command_brief_mirror_invalidated'
  | 'loadout_committed';

export type FleetTelemetryEvent = {
  name: FleetTelemetryEventName;
  vehicleId?: string | null;
  timestamp: string;
  meta?: Record<string, unknown>;
};

type FleetTelemetryListener = (event: FleetTelemetryEvent) => void;

const listeners = new Set<FleetTelemetryListener>();
const recentEvents: FleetTelemetryEvent[] = [];

export function emitFleetTelemetryEvent(
  name: FleetTelemetryEventName,
  input: {
    vehicleId?: string | null;
    timestamp?: string;
    meta?: Record<string, unknown>;
  } = {},
): FleetTelemetryEvent {
  const event: FleetTelemetryEvent = {
    name,
    vehicleId: input.vehicleId ?? null,
    timestamp: input.timestamp ?? new Date().toISOString(),
    meta: input.meta ?? {},
  };
  recentEvents.unshift(event);
  if (recentEvents.length > 50) recentEvents.length = 50;
  for (const listener of Array.from(listeners)) {
    try {
      listener(event);
    } catch {
      // Telemetry hooks are optional and must not affect Fleet writes.
    }
  }
  return event;
}

export function subscribeFleetTelemetry(listener: FleetTelemetryListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRecentFleetTelemetryEvents(): FleetTelemetryEvent[] {
  return recentEvents.map((event) => ({ ...event, meta: { ...(event.meta ?? {}) } }));
}
