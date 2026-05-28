import type { SupabaseClient } from '@supabase/supabase-js';
import { createPersistedKeyValueCache } from '../keyValuePersistence';
import { isSupabaseConfigured, supabase } from '../supabase';

const CONVOY_MEMBER_LOCATIONS_TABLE = 'convoy_member_locations';
const STATE_CACHE_KEY = 'state';
const DEFAULT_PUBLISH_INTERVAL_MS = 15_000;
const MIN_PUBLISH_INTERVAL_MS = 5_000;
const MOVING_SPEED_THRESHOLD_MPS = 0.5;

export type ConvoyLocationSharingStatus =
  | 'disabled'
  | 'starting'
  | 'enabled'
  | 'permission_denied'
  | 'error';

export type ConvoyMovementStatus =
  | 'moving'
  | 'stopped'
  | 'delayed'
  | 'offline'
  | 'needs_assistance'
  | 'unknown';

export type ConvoyLocationPublisherErrorCode =
  | 'auth_required'
  | 'backend_unavailable'
  | 'permission_denied'
  | 'validation_error'
  | 'sharing_not_allowed'
  | 'tracking_disabled'
  | 'publish_throttled'
  | 'backend_error';

export type ConvoyLocationPublisherResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ConvoyLocationPublisherErrorCode; error: string };

export interface ConvoyLocationSharingState {
  status: ConvoyLocationSharingStatus;
  enabled: boolean;
  convoyId: string | null;
  memberId: string | null;
  permissionDenied: boolean;
  lastSuccessfulPublishTime: string | null;
  lastError: string | null;
  lastStopReason: string | null;
  publishIntervalMs: number;
  foregroundTracking: boolean;
  backgroundTrackingAvailable: boolean;
  movementStatusOverride: Extract<ConvoyMovementStatus, 'needs_assistance'> | null;
}

export interface StartConvoyLocationSharingInput {
  convoyId: string;
  memberId: string;
  publishIntervalMs?: number;
  movementStatusOverride?: Extract<ConvoyMovementStatus, 'needs_assistance'> | null;
}

export interface ConvoyLocationCoordinates {
  latitude: number;
  longitude: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
}

export interface ConvoyLocationFix {
  coords: ConvoyLocationCoordinates;
  timestamp?: number;
}

export interface ConvoyLocationPublishRow {
  convoy_id: string;
  member_id: string;
  latitude: number;
  longitude: number;
  accuracy_meters?: number | null;
  heading_degrees?: number | null;
  speed_mps?: number | null;
  movement_status: ConvoyMovementStatus;
  captured_at: string;
  battery_percent?: number | null;
}

interface LocationSubscription {
  remove: () => void;
}

export interface ConvoyLocationPublisherBackend {
  isAvailable(): boolean;
  getCurrentUser(): Promise<{ id: string } | null>;
  requestForegroundPermission(): Promise<'granted' | 'denied' | 'undetermined'>;
  watchPosition(
    options: { accuracy: unknown; distanceInterval: number; timeInterval: number; mayShowUserSettingsDialog: boolean },
    callback: (location: ConvoyLocationFix) => void,
  ): Promise<LocationSubscription>;
  getHighAccuracySetting(): unknown;
  validateSharingAllowed(
    convoyId: string,
    memberId: string,
    userId: string,
  ): Promise<ConvoyLocationPublisherResult<{ allowed: true }> | { ok: false; code: ConvoyLocationPublisherErrorCode; error: string }>;
  publishLocation(row: ConvoyLocationPublishRow): Promise<ConvoyLocationPublisherResult<{ id?: string; updated_at?: string }>>;
}

const stateCache = createPersistedKeyValueCache('ecs_convoy_location_sharing_state');

const initialState: ConvoyLocationSharingState = {
  status: 'disabled',
  enabled: false,
  convoyId: null,
  memberId: null,
  permissionDenied: false,
  lastSuccessfulPublishTime: null,
  lastError: null,
  lastStopReason: null,
  publishIntervalMs: DEFAULT_PUBLISH_INTERVAL_MS,
  foregroundTracking: false,
  backgroundTrackingAvailable: false,
  movementStatusOverride: null,
};

function toError(
  code: ConvoyLocationPublisherErrorCode,
  error: string,
): ConvoyLocationPublisherResult<never> {
  return { ok: false, code, error };
}

function convoyLocationBackendError(error: unknown, fallback: string): ConvoyLocationPublisherResult<never> {
  const message = (error as { message?: string } | null)?.message ?? fallback;
  if (
    /schema cache|relation .* does not exist|Could not find the table/i.test(message) &&
    /\bconvoys\b|\bconvoy_members\b|\bconvoy_member_locations\b/i.test(message)
  ) {
    return toError(
      'backend_unavailable',
      'Convoy location tracking is not deployed on the connected Supabase backend yet. Apply migration 022_convoy_team_tracking.sql, deploy convoy-membership, then refresh the Supabase schema cache.',
    );
  }
  return toError('backend_error', message || fallback);
}

function normalizeId(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizePublishInterval(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_PUBLISH_INTERVAL_MS;
  return Math.max(MIN_PUBLISH_INTERVAL_MS, Math.round(value as number));
}

function validCoordinate(value: number): boolean {
  return Number.isFinite(value);
}

function inferMovementStatus(
  speedMps: number | null | undefined,
  override: Extract<ConvoyMovementStatus, 'needs_assistance'> | null,
): ConvoyMovementStatus {
  if (override === 'needs_assistance') return 'needs_assistance';
  return typeof speedMps === 'number' && speedMps > MOVING_SPEED_THRESHOLD_MPS ? 'moving' : 'stopped';
}

function serializeState(state: ConvoyLocationSharingState): string {
  return JSON.stringify(state);
}

function parseState(raw: string | null): ConvoyLocationSharingState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ConvoyLocationSharingState>;
    return { ...initialState, ...parsed };
  } catch {
    return null;
  }
}

export class ConvoyLocationPublisher {
  private state: ConvoyLocationSharingState = { ...initialState };
  private subscription: LocationSubscription | null = null;
  private lastPublishAttemptMs = 0;

  constructor(private readonly backend: ConvoyLocationPublisherBackend) {}

  async startConvoyLocationSharing(
    input: StartConvoyLocationSharingInput,
  ): Promise<ConvoyLocationPublisherResult<ConvoyLocationSharingState>> {
    const convoyId = normalizeId(input.convoyId);
    const memberId = normalizeId(input.memberId);
    const publishIntervalMs = normalizePublishInterval(input.publishIntervalMs);

    if (!convoyId || !memberId) {
      await this.setState({
        ...this.state,
        status: 'error',
        enabled: false,
        lastError: 'Active convoy and member identifiers are required.',
      });
      return toError('validation_error', 'Active convoy and member identifiers are required.');
    }

    if (!this.backend.isAvailable()) {
      await this.setState({
        ...this.state,
        status: 'error',
        enabled: false,
        convoyId,
        memberId,
        lastError: 'Convoy location backend is not configured.',
      });
      return toError('backend_unavailable', 'Convoy location backend is not configured.');
    }

    let user: { id: string } | null = null;
    try {
      user = await this.backend.getCurrentUser();
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'Unable to verify the current user before enabling convoy location sharing.';
      await this.setState({
        ...this.state,
        status: 'error',
        enabled: false,
        convoyId,
        memberId,
        lastError: message,
      });
      return toError('backend_error', message);
    }

    if (!user?.id) {
      await this.setState({
        ...this.state,
        status: 'error',
        enabled: false,
        convoyId,
        memberId,
        lastError: 'Sign in before enabling convoy location sharing.',
      });
      return toError('auth_required', 'Sign in before enabling convoy location sharing.');
    }

    await this.stopConvoyLocationSharing();
    await this.setState({
      ...initialState,
      status: 'starting',
      enabled: false,
      convoyId,
      memberId,
      publishIntervalMs,
      movementStatusOverride: input.movementStatusOverride ?? null,
      lastStopReason: null,
    });

    let permission: 'granted' | 'denied' | 'undetermined' = 'undetermined';
    try {
      permission = await this.backend.requestForegroundPermission();
    } catch (error) {
      const message = error instanceof Error && error.message.trim()
        ? error.message
        : 'Location permission request failed.';
      await this.setState({
        ...this.state,
        status: 'error',
        enabled: false,
        permissionDenied: false,
        lastError: message,
      });
      return toError('backend_error', message);
    }

    if (permission !== 'granted') {
      await this.setState({
        ...this.state,
        status: 'permission_denied',
        enabled: false,
        permissionDenied: true,
        lastError: 'Location permission denied.',
      });
      return toError('permission_denied', 'Location permission denied.');
    }

    try {
      this.subscription = await this.backend.watchPosition(
        {
          accuracy: this.backend.getHighAccuracySetting(),
          distanceInterval: 10,
          timeInterval: Math.min(publishIntervalMs, 5_000),
          mayShowUserSettingsDialog: true,
        },
        (location) => {
          void this.handleLocation(location);
        },
      );

      await this.setState({
        ...this.state,
        status: 'enabled',
        enabled: true,
        permissionDenied: false,
        foregroundTracking: true,
        lastError: null,
        lastStopReason: null,
      });

      return { ok: true, data: this.state };
    } catch (error) {
      await this.stopConvoyLocationSharing();
      const message = error instanceof Error ? error.message : 'Unable to start convoy location sharing.';
      await this.setState({
        ...this.state,
        status: 'error',
        enabled: false,
        lastError: message,
      });
      return toError('backend_error', message);
    }
  }

  async stopConvoyLocationSharing(reason?: string): Promise<ConvoyLocationPublisherResult<ConvoyLocationSharingState>> {
    if (this.subscription) {
      try {
        this.subscription.remove();
      } catch {}
      this.subscription = null;
    }

    await this.setState({
      ...this.state,
      status: 'disabled',
      enabled: false,
      foregroundTracking: false,
      movementStatusOverride: null,
      lastStopReason: reason ?? this.state.lastStopReason,
      lastError: reason ?? this.state.lastError,
    });

    return { ok: true, data: this.state };
  }

  async getConvoyLocationSharingState(): Promise<ConvoyLocationSharingState> {
    await stateCache.waitForHydration();
    const cached = parseState(stateCache.get(STATE_CACHE_KEY));
    if (!cached) return { ...this.state };

    if (cached.enabled && !this.subscription) {
      return {
        ...cached,
        status: 'disabled',
        enabled: false,
        foregroundTracking: false,
        lastError: cached.lastError ?? 'Location sharing is not active in this app session.',
      };
    }

    this.state = { ...cached };
    return { ...this.state };
  }

  async setMovementStatusOverride(
    override: Extract<ConvoyMovementStatus, 'needs_assistance'> | null,
  ): Promise<ConvoyLocationSharingState> {
    await this.setState({ ...this.state, movementStatusOverride: override });
    return { ...this.state };
  }

  async publishCurrentLocationForTest(
    location: ConvoyLocationFix,
  ): Promise<ConvoyLocationPublisherResult<{ id?: string; updated_at?: string }>> {
    return this.handleLocation(location, true);
  }

  private async handleLocation(
    location: ConvoyLocationFix,
    force = false,
  ): Promise<ConvoyLocationPublisherResult<{ id?: string; updated_at?: string }>> {
    const state = this.state;
    if (!state.enabled && !force) {
      return toError('tracking_disabled', 'Convoy location sharing is disabled.');
    }
    if (!state.convoyId || !state.memberId) {
      return toError('validation_error', 'Active convoy and member identifiers are required.');
    }
    if (!this.backend.isAvailable()) {
      return toError('backend_unavailable', 'Convoy location backend is not configured.');
    }

    const now = Date.now();
    if (!force && now - this.lastPublishAttemptMs < state.publishIntervalMs) {
      return toError('publish_throttled', 'Convoy location publish was throttled.');
    }

    const user = await this.backend.getCurrentUser();
    if (!user?.id) {
      await this.stopConvoyLocationSharing('Auth session ended. Live sharing stopped.');
      return toError('auth_required', 'Sign in before sharing convoy location.');
    }

    const eligibility = await this.backend.validateSharingAllowed(state.convoyId, state.memberId, user.id);
    if (!eligibility.ok) {
      await this.stopConvoyLocationSharing(eligibility.error);
      return toError(
        eligibility.code === 'backend_unavailable' || eligibility.code === 'backend_error'
          ? eligibility.code
          : 'sharing_not_allowed',
        eligibility.error,
      );
    }

    const { latitude, longitude, accuracy, heading, speed } = location.coords;
    if (!validCoordinate(latitude) || !validCoordinate(longitude)) {
      await this.setState({ ...this.state, lastError: 'Location fix did not include valid coordinates.' });
      return toError('validation_error', 'Location fix did not include valid coordinates.');
    }

    this.lastPublishAttemptMs = now;
    const capturedAt = new Date(location.timestamp ?? now).toISOString();
    const row: ConvoyLocationPublishRow = {
      convoy_id: state.convoyId,
      member_id: state.memberId,
      latitude,
      longitude,
      accuracy_meters: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
      heading_degrees: typeof heading === 'number' && heading >= 0 ? heading : null,
      speed_mps: typeof speed === 'number' && speed >= 0 ? speed : null,
      movement_status: inferMovementStatus(speed, state.movementStatusOverride),
      captured_at: capturedAt,
    };

    const result = await this.backend.publishLocation(row);
    if (!result.ok) {
      await this.setState({ ...this.state, lastError: result.error });
      return result;
    }

    await this.setState({
      ...this.state,
      lastSuccessfulPublishTime: new Date(now).toISOString(),
      lastError: null,
    });
    return result;
  }

  private async setState(next: ConvoyLocationSharingState): Promise<void> {
    this.state = { ...next };
    await stateCache.waitForHydration();
    stateCache.set(STATE_CACHE_KEY, serializeState(this.state));
    await stateCache.flush();
  }
}

function createSupabaseConvoyLocationPublisherBackend(
  client: SupabaseClient = supabase,
): ConvoyLocationPublisherBackend {
  return {
    isAvailable() {
      return isSupabaseConfigured;
    },

    async getCurrentUser() {
      const { data, error } = await client.auth.getSession();
      if (error || !data.session?.user?.id) return null;
      return { id: data.session.user.id };
    },

    async requestForegroundPermission() {
      const Location = await import('expo-location');
      const { status } = await Location.requestForegroundPermissionsAsync();
      return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
    },

    async watchPosition(options, callback) {
      const Location = await import('expo-location');
      return Location.watchPositionAsync(options as any, callback as any);
    },

    getHighAccuracySetting() {
      return undefined;
    },

    async validateSharingAllowed(convoyId, memberId, userId) {
      const { data: member, error: memberError } = await client
        .from('convoy_members')
        .select('id, user_id, revoked_at, convoy_id')
        .eq('id', memberId)
        .eq('convoy_id', convoyId)
        .eq('user_id', userId)
        .maybeSingle();

      if (memberError) return convoyLocationBackendError(memberError, 'Unable to validate convoy membership.');
      if (!member) return toError('sharing_not_allowed', 'Active convoy membership was not found. Live sharing stopped.');
      if (member.revoked_at) return toError('sharing_not_allowed', 'Convoy membership was revoked. Live sharing stopped.');

      const { data: convoy, error: convoyError } = await client
        .from('convoys')
        .select('id, status')
        .eq('id', convoyId)
        .maybeSingle();

      if (convoyError) return convoyLocationBackendError(convoyError, 'Unable to validate convoy status.');
      if (!convoy) return toError('sharing_not_allowed', 'Convoy is no longer available. Live sharing stopped.');
      if (convoy.status === 'completed' || convoy.status === 'cancelled') {
        return toError('sharing_not_allowed', 'Convoy has ended. Live sharing stopped.');
      }

      return { ok: true, data: { allowed: true } };
    },

    async publishLocation(row) {
      const { data, error } = await client
        .from(CONVOY_MEMBER_LOCATIONS_TABLE)
        .upsert(row, { onConflict: 'member_id' })
        .select('id, updated_at')
        .single();

      if (error) return convoyLocationBackendError(error, 'Unable to publish convoy location.');
      return { ok: true, data: data ?? {} };
    },
  };
}

export const convoyLocationPublisher = new ConvoyLocationPublisher(createSupabaseConvoyLocationPublisherBackend());

export function startConvoyLocationSharing(input: StartConvoyLocationSharingInput) {
  return convoyLocationPublisher.startConvoyLocationSharing(input);
}

export function stopConvoyLocationSharing(reason?: string) {
  return convoyLocationPublisher.stopConvoyLocationSharing(reason);
}

export function getConvoyLocationSharingState() {
  return convoyLocationPublisher.getConvoyLocationSharingState();
}
