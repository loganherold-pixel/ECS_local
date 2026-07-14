import { isSupabaseConfigured, supabase } from '../supabase';
import {
  classifyConvoyBackendReadinessIssue,
  convoyBackendErrorText,
  formatConvoyBackendUserMessage,
  getConvoyBackendReadinessGuidance,
} from './convoyBackendReadiness';
import { classifyConvoyLocationStaleness, type ConvoyLocationStaleness } from './convoyTrackingThresholds';
export {
  CONVOY_LOCATION_FRESH_UNDER_MS,
  CONVOY_LOCATION_MAX_FUTURE_SKEW_MS,
  CONVOY_LOCATION_WATCH_AFTER_MS,
  CONVOY_LOCATION_STALE_AFTER_MS,
  classifyConvoyLocationStaleness,
  type ConvoyLocationStaleness,
} from './convoyTrackingThresholds';

export type ConvoyRealtimeConnectionStatus =
  | 'idle'
  | 'loading'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'disconnected'
  | 'error';

export type ConvoyRole = 'lead' | 'sweep' | 'member' | 'support';
export type ConvoyMovementStatus =
  | 'moving'
  | 'stopped'
  | 'delayed'
  | 'offline'
  | 'needs_assistance'
  | 'unknown';
export interface ConvoyMemberRow {
  id: string;
  convoy_id: string;
  user_id?: string;
  vehicle_id?: string | null;
  callsign: string;
  display_name?: string | null;
  expedition_badge_title?: string | null;
  role: ConvoyRole;
  revoked_at?: string | null;
}

export interface ConvoyMemberLocationRow {
  id?: string;
  convoy_id: string;
  member_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  heading_degrees?: number | null;
  speed_mps?: number | null;
  battery_percent?: number | null;
  movement_status?: ConvoyMovementStatus | null;
  captured_at: string;
  updated_at?: string | null;
}

export interface ConvoyMapVehicle {
  memberId: string;
  participantId?: string | null;
  callsign: string;
  displayName?: string | null;
  expeditionBadgeTitle?: string | null;
  role: ConvoyRole;
  participantRole?: string | null;
  participantSource?: 'live' | 'cached' | 'mock' | 'demo' | 'unknown' | null;
  participantActive?: boolean | null;
  participantFixtureOnly?: boolean | null;
  vehicleSummary?: string | null;
  latitude: number;
  longitude: number;
  accuracyMeters: number | null;
  headingDegrees: number | null;
  speedMps: number | null;
  movementStatus: ConvoyMovementStatus;
  capturedAt: string;
  updatedAt: string | null;
  isStale: boolean;
  staleness: ConvoyLocationStaleness;
  staleReason: string | null;
}

export interface ConvoyLocationSnapshot {
  members: ConvoyMapVehicle[];
  activeCount: number;
  staleCount: number;
  assistanceCount: number;
  lead: ConvoyMapVehicle | null;
  sweep: ConvoyMapVehicle | null;
  lastUpdated: string | null;
}

export type ConvoyLocationChange =
  | { type: 'upsert'; row: ConvoyMemberLocationRow }
  | { type: 'delete'; memberId: string };

export interface ConvoyRealtimeSubscription {
  unsubscribe: () => void;
}

export interface ConvoyRealtimeServiceBackend {
  isAvailable(): boolean;
  fetchMembers(convoyId: string): Promise<{ data: ConvoyMemberRow[]; error: string | null }>;
  fetchLocations(convoyId: string): Promise<{ data: ConvoyMemberLocationRow[]; error: string | null }>;
  subscribeToLocationChanges(
    convoyId: string,
    handlers: {
      onChange: (change: ConvoyLocationChange) => void;
      onStatusChange: (status: ConvoyRealtimeConnectionStatus, error?: string | null) => void;
    },
  ): ConvoyRealtimeSubscription;
}

export type ConvoyRealtimeResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: 'backend_unavailable' | 'validation_error' | 'backend_error'; error: string };

const CONVOY_MEMBER_SELECT_BASE = 'id, convoy_id, user_id, vehicle_id, callsign, role, revoked_at';

function toError(
  code: 'backend_unavailable' | 'validation_error' | 'backend_error',
  error: string,
): ConvoyRealtimeResult<never> {
  return { ok: false, code, error };
}

function convoyRealtimeBackendError(error: unknown): string | null {
  const message = typeof error === 'string' ? error : convoyBackendErrorText(error);
  if (!message) return null;
  const readinessMessage = formatConvoyBackendUserMessage(message);
  if (readinessMessage) return readinessMessage;
  return message;
}

function isOptionalConvoyMemberIdentityColumnError(error: unknown): boolean {
  const text = convoyBackendErrorText(error).toLowerCase();
  return (
    text.includes('column') &&
    text.includes('does not exist') &&
    (text.includes('expedition_badge_title') || text.includes('display_name'))
  );
}

function withConvoyMemberIdentityFallback(member: ConvoyMemberRow): ConvoyMemberRow {
  return {
    display_name: null,
    expedition_badge_title: null,
    ...member,
  };
}

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

function validCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function normalizeConvoyLocationSnapshot(
  members: ConvoyMemberRow[],
  locations: ConvoyMemberLocationRow[],
  nowMs = Date.now(),
): ConvoyLocationSnapshot {
  const activeMembers = members.filter((member) => !member.revoked_at);
  const memberById = new Map(activeMembers.map((member) => [member.id, member]));
  const latestLocationByMember = new Map<string, ConvoyMemberLocationRow>();

  for (const row of locations) {
    if (!row?.member_id || !memberById.has(row.member_id)) continue;
    if (!validCoordinate(row.latitude) || !validCoordinate(row.longitude)) continue;
    const existing = latestLocationByMember.get(row.member_id);
    const existingTime = Date.parse(existing?.captured_at ?? existing?.updated_at ?? '');
    const nextTime = Date.parse(row.captured_at ?? row.updated_at ?? '');
    if (!existing || nextTime >= existingTime) {
      latestLocationByMember.set(row.member_id, row);
    }
  }

  const mapVehicles: ConvoyMapVehicle[] = [];
  for (const [memberId, location] of latestLocationByMember) {
    const member = memberById.get(memberId);
    if (!member) continue;
    const stale = classifyConvoyLocationStaleness(location.captured_at ?? location.updated_at, nowMs);
    mapVehicles.push({
      memberId,
      callsign: member.callsign,
      displayName: member.display_name ?? member.callsign,
      expeditionBadgeTitle: member.expedition_badge_title ?? null,
      role: member.role,
      latitude: location.latitude,
      longitude: location.longitude,
      accuracyMeters: typeof location.accuracy_meters === 'number' ? location.accuracy_meters : null,
      headingDegrees: typeof location.heading_degrees === 'number' ? location.heading_degrees : null,
      speedMps: typeof location.speed_mps === 'number' ? location.speed_mps : null,
      movementStatus: location.movement_status ?? 'unknown',
      capturedAt: location.captured_at,
      updatedAt: location.updated_at ?? null,
      isStale: stale.isStale,
      staleness: stale.staleness,
      staleReason: stale.staleReason,
    });
  }

  mapVehicles.sort((a, b) => {
    const roleOrder = roleSortOrder(a.role) - roleSortOrder(b.role);
    if (roleOrder !== 0) return roleOrder;
    return a.callsign.localeCompare(b.callsign);
  });

  const lastUpdated = mapVehicles.reduce<string | null>((latest, member) => {
    const candidate = member.updatedAt ?? member.capturedAt;
    if (!latest) return candidate;
    return Date.parse(candidate) > Date.parse(latest) ? candidate : latest;
  }, null);

  return {
    members: mapVehicles,
    activeCount: mapVehicles.filter((member) => !member.isStale && member.movementStatus !== 'offline').length,
    staleCount: mapVehicles.filter((member) => member.isStale).length,
    assistanceCount: mapVehicles.filter((member) => member.movementStatus === 'needs_assistance').length,
    lead: mapVehicles.find((member) => member.role === 'lead') ?? null,
    sweep: mapVehicles.find((member) => member.role === 'sweep') ?? null,
    lastUpdated,
  };
}

function roleSortOrder(role: ConvoyRole): number {
  switch (role) {
    case 'lead':
      return 0;
    case 'sweep':
      return 1;
    case 'support':
      return 2;
    default:
      return 3;
  }
}

export class ConvoyRealtimeService {
  constructor(private readonly backend: ConvoyRealtimeServiceBackend = createSupabaseConvoyRealtimeBackend()) {}

  async fetchInitialConvoyLocations(convoyId: string): Promise<ConvoyRealtimeResult<{
    members: ConvoyMemberRow[];
    locations: ConvoyMemberLocationRow[];
    snapshot: ConvoyLocationSnapshot;
  }>> {
    const normalizedConvoyId = normalizeId(convoyId);
    if (!normalizedConvoyId) return toError('validation_error', 'convoyId is required.');
    if (!this.backend.isAvailable()) {
      return toError('backend_unavailable', getConvoyBackendReadinessGuidance('supabase_unconfigured').userMessage);
    }

    const [members, locations] = await Promise.all([
      this.backend.fetchMembers(normalizedConvoyId),
      this.backend.fetchLocations(normalizedConvoyId),
    ]);

    if (members.error) return toError('backend_error', members.error);
    if (locations.error) return toError('backend_error', locations.error);

    return {
      ok: true,
      data: {
        members: members.data,
        locations: locations.data,
        snapshot: normalizeConvoyLocationSnapshot(members.data, locations.data),
      },
    };
  }

  subscribeToConvoyLocations(
    convoyId: string,
    handlers: {
      onChange: (change: ConvoyLocationChange) => void;
      onStatusChange?: (status: ConvoyRealtimeConnectionStatus, error?: string | null) => void;
    },
  ): ConvoyRealtimeSubscription {
    const normalizedConvoyId = normalizeId(convoyId);
    if (!normalizedConvoyId || !this.backend.isAvailable()) {
      handlers.onStatusChange?.('disconnected');
      return { unsubscribe() {} };
    }

    return this.backend.subscribeToLocationChanges(normalizedConvoyId, {
      onChange: handlers.onChange,
      onStatusChange: handlers.onStatusChange ?? (() => {}),
    });
  }
}

export function createSupabaseConvoyRealtimeBackend(client: any = supabase): ConvoyRealtimeServiceBackend {
  async function fetchMembersWithoutIdentityColumns(convoyId: string) {
    const { data, error } = await client
      .from('convoy_members')
      .select(CONVOY_MEMBER_SELECT_BASE)
      .eq('convoy_id', convoyId)
      .is('revoked_at', null);

    return {
      data: ((data ?? []) as ConvoyMemberRow[]).map(withConvoyMemberIdentityFallback),
      error: convoyRealtimeBackendError(error),
    };
  }

  return {
    isAvailable() {
      return isSupabaseConfigured;
    },

    async fetchMembers(convoyId) {
      const { data, error } = await client
        .from('convoy_members')
        .select('id, convoy_id, user_id, vehicle_id, callsign, display_name, expedition_badge_title, role, revoked_at')
        .eq('convoy_id', convoyId)
        .is('revoked_at', null);

      if (isOptionalConvoyMemberIdentityColumnError(error)) {
        return fetchMembersWithoutIdentityColumns(convoyId);
      }

      return { data: (data ?? []) as ConvoyMemberRow[], error: convoyRealtimeBackendError(error) };
    },

    async fetchLocations(convoyId) {
      const { data, error } = await client
        .from('convoy_member_locations')
        .select(
          'id, convoy_id, member_id, latitude, longitude, accuracy_meters, heading_degrees, speed_mps, battery_percent, movement_status, captured_at, updated_at',
        )
        .eq('convoy_id', convoyId);

      return { data: (data ?? []) as ConvoyMemberLocationRow[], error: convoyRealtimeBackendError(error) };
    },

    subscribeToLocationChanges(convoyId, handlers) {
      const channel = client.channel(`ecs-convoy-locations:${convoyId}`);
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'convoy_member_locations',
          filter: `convoy_id=eq.${convoyId}`,
        },
        (payload: any) => {
          const eventType = String(payload?.eventType ?? '').toUpperCase();
          if (eventType === 'DELETE') {
            const memberId = normalizeId(payload?.old?.member_id);
            if (memberId) handlers.onChange({ type: 'delete', memberId });
            return;
          }

          const row = payload?.new as ConvoyMemberLocationRow | undefined;
          if (row?.member_id) {
            handlers.onChange({ type: 'upsert', row });
          }
        },
      );

      channel.subscribe((status: string, error?: unknown) => {
        const readinessIssue = classifyConvoyBackendReadinessIssue(error);
        const degradedMessage = readinessIssue === 'realtime_unavailable'
          ? getConvoyBackendReadinessGuidance('realtime_unavailable').userMessage
          : getConvoyBackendReadinessGuidance('realtime_degraded').userMessage;
        switch (status) {
          case 'SUBSCRIBED':
            handlers.onStatusChange('connected');
            return;
          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
            handlers.onStatusChange('degraded', degradedMessage);
            return;
          case 'CLOSED':
            handlers.onStatusChange('disconnected');
            return;
          default:
            handlers.onStatusChange('connecting');
        }
      });
      handlers.onStatusChange('connecting');

      return {
        unsubscribe() {
          try {
            void client.removeChannel(channel);
          } catch {}
          handlers.onStatusChange('disconnected');
        },
      };
    },
  };
}

export const convoyRealtimeService = new ConvoyRealtimeService();
