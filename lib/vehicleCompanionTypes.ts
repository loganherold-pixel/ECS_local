/**
 * VehicleCompanionTypes — Type Definitions for the Companion Connection Layer
 *
 * Defines the data structures for synchronizing state between:
 *   - Mobile ECS application
 *   - Android Auto vehicle interface
 *   - Apple CarPlay vehicle interface
 *
 * The companion layer ensures all three interfaces share:
 *   - Vehicle display mode
 *   - Expedition status
 *   - Breadcrumb trail
 *   - Route navigation
 *   - Waypoints and markers
 *   - Vehicle location
 *
 * Architecture:
 *   - vehicleSessionState is the single source of truth
 *   - Both bridges (Android Auto + CarPlay) read from and write to it
 *   - The mobile ECS app also reads from and writes to it
 *   - Changes propagate automatically via subscription
 *
 * Does NOT modify the mobile ECS dashboard.
 */

import type { VehicleDisplayMode, ModeOverrideSetting } from './vehicleDisplayTypes';

// ── Companion Connection Status ─────────────────────────────

/**
 * Which vehicle display platform is connected.
 */
export type CompanionPlatform = 'android_auto' | 'carplay' | 'none';

/**
 * Connection state for a vehicle display companion.
 */
export interface CompanionConnectionState {
  /** Which platform is connected */
  platform: CompanionPlatform;
  /** Whether any companion is currently connected */
  isConnected: boolean;
  /** When the companion last connected */
  connectedAt: string | null;
  /** When the companion last disconnected */
  disconnectedAt: string | null;
  /** Number of reconnections during this session */
  reconnectCount: number;
  /** Whether the companion was recently disconnected (within reconnect grace period) */
  isInReconnectGrace: boolean;
  /** Last data push timestamp (ms) */
  lastDataPushAt: number;
  /** Last action received timestamp (ms) */
  lastActionReceivedAt: number;
}

// ── Vehicle Session State ───────────────────────────────────

/**
 * The shared vehicle session state.
 * This is the central synchronized state object that both the mobile app
 * and vehicle display interfaces read from and write to.
 */
export interface VehicleSessionState {
  /** Current vehicle display mode */
  activeVehicleDisplayMode: VehicleDisplayMode;
  /** Current mode override setting */
  modeOverride: ModeOverrideSetting;

  /** Whether an expedition is currently active */
  activeExpedition: boolean;
  /** Active expedition ID (null if no expedition) */
  activeExpeditionId: string | null;
  /** Active expedition name (null if no expedition) */
  activeExpeditionName: string | null;

  /** Whether an active route exists */
  activeRoute: boolean;
  /** Active route ID (null if no route) */
  activeRouteId: string | null;
  /** Active route name (null if no route) */
  activeRouteName: string | null;

  /** Active breadcrumb trail state */
  activeBreadcrumbTrail: BreadcrumbTrailSync;

  /** Current vehicle location */
  currentVehicleLocation: VehicleLocationSync;

  /** Active waypoints and markers */
  activeWaypoints: WaypointSync[];

  /** Connectivity status */
  connectivityStatus: 'online' | 'limited' | 'offline' | 'unknown';

  /** GPS status */
  gpsStatus: 'strong' | 'moderate' | 'weak' | 'none';

  /** Weather data status */
  weatherStatus: 'available' | 'stale' | 'unavailable';

  /** Companion connection state */
  companionConnection: CompanionConnectionState;

  /** Session start time */
  sessionStartedAt: string;

  /** Last state update timestamp */
  lastUpdatedAt: string;

  /** Monotonic version counter for change detection */
  version: number;
}

// ── Breadcrumb Trail Sync ───────────────────────────────────

/**
 * Synchronized breadcrumb trail state.
 * Both mobile and vehicle interfaces render the same trail.
 */
export interface BreadcrumbTrailSync {
  /** Whether breadcrumb recording is active */
  isRecording: boolean;
  /** Total number of breadcrumb points */
  pointCount: number;
  /** Total trail distance in miles */
  totalTrailDistanceMi: number;
  /** Straight-line distance from current position to start (miles) */
  distanceFromStartMi: number;
  /** Total elevation gain along the trail (feet) */
  elevationGainFt: number;
  /** Total elevation loss along the trail (feet) */
  elevationLossFt: number;
  /** Bearing from current position to start point (degrees) */
  bearingToStartDeg: number | null;
  /** Whether return-to-start is available */
  canReturnToStart: boolean;
  /** Whether return-to-start is currently active */
  isReturningToStart: boolean;
  /** Whether breadcrumb was paused due to GPS loss */
  isPausedByGps: boolean;
  /** When recording started */
  recordingStartedAt: string | null;
}

// ── Vehicle Location Sync ───────────────────────────────────

/**
 * Synchronized vehicle location.
 */
export interface VehicleLocationSync {
  /** Latitude in decimal degrees */
  latitude: number | null;
  /** Longitude in decimal degrees */
  longitude: number | null;
  /** Heading in degrees (0-360) */
  headingDeg: number | null;
  /** Speed in mph */
  speedMph: number | null;
  /** Altitude in meters */
  altitudeM: number | null;
  /** GPS accuracy in meters */
  accuracyM: number | null;
  /** When this location was recorded */
  timestamp: string | null;
  /** Whether this is a live GPS fix or a retained last-known position */
  isLive: boolean;
}

// ── Waypoint Sync ───────────────────────────────────────────

/**
 * Synchronized waypoint/marker data.
 * When a waypoint is added from either mobile or vehicle display,
 * it appears on both interfaces.
 */
export interface WaypointSync {
  /** Unique waypoint ID */
  id: string;
  /** Waypoint type */
  type: 'waypoint' | 'incident' | 'note' | 'hazard' | 'fuel' | 'camp';
  /** Display title */
  title: string;
  /** Optional notes */
  notes: string;
  /** Latitude */
  lat: number;
  /** Longitude */
  lng: number;
  /** When this waypoint was created */
  createdAt: string;
  /** Which interface created this waypoint */
  source: 'mobile' | 'android_auto' | 'carplay';
  /** Associated expedition ID (null if unattached) */
  expeditionId: string | null;
}

// ── Sync Events ─────────────────────────────────────────────

/**
 * Events that can trigger state synchronization.
 */
export type CompanionSyncEvent =
  | 'mode_changed'
  | 'expedition_started'
  | 'expedition_ended'
  | 'route_activated'
  | 'route_deactivated'
  | 'waypoint_added'
  | 'waypoint_removed'
  | 'breadcrumb_started'
  | 'breadcrumb_stopped'
  | 'breadcrumb_paused'
  | 'breadcrumb_resumed'
  | 'location_updated'
  | 'companion_connected'
  | 'companion_disconnected'
  | 'companion_reconnected'
  | 'connectivity_changed'
  | 'gps_status_changed'
  | 'weather_status_changed'
  | 'return_to_start_activated'
  | 'return_to_start_cancelled'
  | 'action_dispatched';

/**
 * A sync event with metadata.
 */
export interface CompanionSyncEventRecord {
  /** Event type */
  event: CompanionSyncEvent;
  /** When this event occurred */
  timestamp: string;
  /** Source of the event */
  source: 'mobile' | 'android_auto' | 'carplay' | 'system';
  /** Optional payload */
  payload?: Record<string, unknown>;
}

// ── Companion Manager Configuration ─────────────────────────

/**
 * Configuration for the VehicleCompanionManager.
 */
export interface CompanionManagerConfig {
  /** How often to sync state to companions (ms) */
  syncIntervalMs: number;
  /** How often to poll for companion actions (ms) */
  actionPollIntervalMs: number;
  /** Grace period after disconnect before clearing state (ms) */
  reconnectGracePeriodMs: number;
  /** Maximum sync event history to retain */
  maxEventHistory: number;
  /** Whether to auto-start breadcrumb on expedition start */
  autoStartBreadcrumb: boolean;
  /** Whether to auto-restore state on reconnect */
  autoRestoreOnReconnect: boolean;
}

/**
 * Default companion manager configuration.
 */
export const DEFAULT_COMPANION_CONFIG: CompanionManagerConfig = {
  syncIntervalMs: 2_000,
  actionPollIntervalMs: 1_000,
  reconnectGracePeriodMs: 60_000,  // 1 minute grace for reconnection
  maxEventHistory: 200,
  autoStartBreadcrumb: true,
  autoRestoreOnReconnect: true,
};

// ── Reconnect Restore Payload ───────────────────────────────

/**
 * State snapshot used to restore a companion after reconnection.
 * Contains everything needed to bring the vehicle display back to
 * its pre-disconnect state.
 */
export interface CompanionRestorePayload {
  /** Vehicle display mode to restore */
  mode: VehicleDisplayMode;
  /** Mode override setting */
  modeOverride: ModeOverrideSetting;
  /** Whether an expedition is active */
  hasExpedition: boolean;
  /** Expedition ID if active */
  expeditionId: string | null;
  /** Whether a route is active */
  hasRoute: boolean;
  /** Route ID if active */
  routeId: string | null;
  /** Breadcrumb state */
  breadcrumb: {
    isRecording: boolean;
    pointCount: number;
    canReturnToStart: boolean;
    distanceFromStartMi: number;
  };
  /** Last known vehicle location */
  location: VehicleLocationSync;
  /** Active waypoint count */
  waypointCount: number;
  /** Timestamp of this snapshot */
  snapshotAt: string;
}

