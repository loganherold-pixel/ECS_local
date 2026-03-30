/**
 * ═══════════════════════════════════════════════════════════
 * ECS TRIP RECORDER — TYPE DEFINITIONS
 * ═══════════════════════════════════════════════════════════
 *
 * Type system for the Trip Logging and Expedition Recorder.
 *
 * Records:
 *   - GPS route trace (breadcrumb points)
 *   - Distance traveled, average speed, elevation
 *   - Resource snapshots (fuel, water, power)
 *   - Expedition events (start, camp, completion, alerts, notes)
 *   - Trip summary with statistics
 *
 * Designed for offline-first operation with local persistence.
 */

// ── Recording State ──────────────────────────────────────────

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped';

// ── Trip Event Types ─────────────────────────────────────────

export type TripEventType =
  | 'trip_started'
  | 'trip_paused'
  | 'trip_resumed'
  | 'trip_ended'
  | 'camp_stop'
  | 'route_waypoint'
  | 'route_completion'
  | 'telemetry_alert'
  | 'resource_snapshot'
  | 'user_note'
  | 'remote_zone_entered'
  | 'remote_zone_exited'
  | 'fuel_stop'
  | 'water_resupply'
  | 'checkpoint_reached'
  | 'elevation_milestone'
  | 'speed_milestone'
  | 'distance_milestone';

export interface TripEventMeta {
  /** Ionicons icon name */
  icon: string;
  /** Display label */
  label: string;
  /** Accent color */
  color: string;
}

export const TRIP_EVENT_META: Record<TripEventType, TripEventMeta> = {
  trip_started:         { icon: 'flag-outline',             label: 'TRIP STARTED',       color: '#66BB6A' },
  trip_paused:          { icon: 'pause-circle-outline',     label: 'PAUSED',             color: '#FFB74D' },
  trip_resumed:         { icon: 'play-circle-outline',      label: 'RESUMED',            color: '#66BB6A' },
  trip_ended:           { icon: 'checkmark-circle-outline', label: 'TRIP ENDED',         color: '#42A5F5' },
  camp_stop:            { icon: 'bonfire-outline',          label: 'CAMP STOP',          color: '#FFB74D' },
  route_waypoint:       { icon: 'location-outline',         label: 'WAYPOINT',           color: '#8B949E' },
  route_completion:     { icon: 'trophy-outline',           label: 'ROUTE COMPLETE',     color: '#D4A017' },
  telemetry_alert:      { icon: 'alert-circle-outline',     label: 'ALERT',              color: '#EF5350' },
  resource_snapshot:    { icon: 'cube-outline',             label: 'RESOURCE SNAPSHOT',  color: '#CE93D8' },
  user_note:            { icon: 'create-outline',           label: 'NOTE',               color: '#8B949E' },
  remote_zone_entered:  { icon: 'globe-outline',            label: 'REMOTE ZONE',        color: '#FF9800' },
  remote_zone_exited:   { icon: 'globe-outline',            label: 'LEFT REMOTE ZONE',   color: '#66BB6A' },
  fuel_stop:            { icon: 'flame-outline',            label: 'FUEL STOP',          color: '#FF9800' },
  water_resupply:       { icon: 'water-outline',            label: 'WATER RESUPPLY',     color: '#4FC3F7' },
  checkpoint_reached:   { icon: 'navigate-outline',         label: 'CHECKPOINT',         color: '#D4A017' },
  elevation_milestone:  { icon: 'trending-up-outline',      label: 'ELEVATION',          color: '#78909C' },
  speed_milestone:      { icon: 'speedometer-outline',      label: 'SPEED',              color: '#42A5F5' },
  distance_milestone:   { icon: 'map-outline',              label: 'DISTANCE',           color: '#66BB6A' },
};

// ── Trip Event ───────────────────────────────────────────────

export interface TripEvent {
  id: string;
  tripId: string;
  type: TripEventType;
  timestamp: string;
  /** GPS coordinates at event time */
  lat: number | null;
  lng: number | null;
  /** Altitude in feet at event time */
  altitudeFt: number | null;
  /** Distance from trip start in miles at event time */
  distanceAtEventMi: number;
  /** User-provided note or system-generated description */
  description: string;
  /** Additional metadata */
  meta: Record<string, any>;
}

// ── Resource Snapshot ────────────────────────────────────────

export interface ResourceSnapshot {
  timestamp: string;
  distanceMi: number;
  /** Fuel remaining in gallons (null if not configured) */
  fuelGal: number | null;
  /** Fuel percentage (0-100) */
  fuelPercent: number | null;
  /** Water remaining in liters */
  waterL: number | null;
  /** Water percentage (0-100) */
  waterPercent: number | null;
  /** Battery SOC percentage (0-100) */
  batteryPercent: number | null;
  /** Battery remaining Wh */
  batteryWh: number | null;
  /** Solar input watts */
  solarWatts: number | null;
  /** OBD coolant temp (°F) */
  coolantTempF: number | null;
  /** OBD engine RPM */
  engineRpm: number | null;
  /** OBD battery voltage */
  batteryVoltage: number | null;
}

// ── Route Point (simplified breadcrumb) ──────────────────────

export interface TripRoutePoint {
  lat: number;
  lng: number;
  timestamp: string;
  altitudeFt: number | null;
  speedMph: number | null;
  headingDeg: number | null;
  cumulativeDistanceMi: number;
}

// ── Trip Record (the complete recorded trip) ─────────────────

export interface TripRecord {
  id: string;
  /** Associated expedition ID (if any) */
  expeditionId: string | null;
  /** Associated expedition name */
  expeditionName: string | null;
  /** Vehicle ID used */
  vehicleId: string | null;
  /** Vehicle name */
  vehicleName: string | null;
  /** User-editable trip name */
  name: string;
  /** Recording state */
  state: RecordingState;
  /** Trip start time */
  startedAt: string;
  /** Trip end time */
  endedAt: string | null;
  /** When paused (null if not paused) */
  pausedAt: string | null;
  /** Total accumulated paused time in ms */
  totalPausedMs: number;
  /** Active duration in seconds (excluding paused time) */
  durationSec: number;
  /** Total distance traveled in miles */
  distanceMi: number;
  /** Average speed in mph */
  avgSpeedMph: number;
  /** Maximum speed in mph */
  maxSpeedMph: number;
  /** Maximum altitude in feet */
  maxAltitudeFt: number | null;
  /** Minimum altitude in feet */
  minAltitudeFt: number | null;
  /** Total elevation gain in feet */
  elevationGainFt: number;
  /** Total elevation loss in feet */
  elevationLossFt: number;
  /** Peak remoteness score during trip */
  peakRemoteness: number | null;
  /** Route trace points (downsampled for storage) */
  routePoints: TripRoutePoint[];
  /** Total route points recorded (before downsampling) */
  totalPointsRecorded: number;
  /** Timeline events */
  events: TripEvent[];
  /** Resource snapshots taken during trip */
  resourceSnapshots: ResourceSnapshot[];
  /** Starting resource levels */
  startResources: ResourceSnapshot | null;
  /** Ending resource levels */
  endResources: ResourceSnapshot | null;
  /** User notes added to this trip */
  notes: string;
  /** Storage size in bytes (approximate) */
  storageBytes: number;
  /** When this record was saved */
  savedAt: string;
  /** Whether this trip was synced to cloud */
  cloudSynced: boolean;
}

// ── Trip Summary (lightweight for list display) ──────────────

export interface TripSummary {
  id: string;
  expeditionId: string | null;
  expeditionName: string | null;
  vehicleName: string | null;
  name: string;
  startedAt: string;
  endedAt: string | null;
  durationSec: number;
  distanceMi: number;
  avgSpeedMph: number;
  maxSpeedMph: number;
  maxAltitudeFt: number | null;
  elevationGainFt: number;
  peakRemoteness: number | null;
  eventCount: number;
  routePointCount: number;
  storageBytes: number;
  savedAt: string;
  cloudSynced: boolean;
  notes: string;
}

// ── Active Recording State (for UI) ──────────────────────────

export interface ActiveRecordingState {
  /** Current recording state */
  state: RecordingState;
  /** Trip ID being recorded */
  tripId: string | null;
  /** Trip name */
  tripName: string | null;
  /** Elapsed active recording time in seconds */
  elapsedSec: number;
  /** Distance traveled so far in miles */
  distanceMi: number;
  /** Current speed in mph */
  currentSpeedMph: number | null;
  /** Average speed in mph */
  avgSpeedMph: number;
  /** Max speed in mph */
  maxSpeedMph: number;
  /** Current altitude in feet */
  currentAltitudeFt: number | null;
  /** Max altitude in feet */
  maxAltitudeFt: number | null;
  /** Elevation gain in feet */
  elevationGainFt: number;
  /** Number of events recorded */
  eventCount: number;
  /** Number of route points recorded */
  pointCount: number;
  /** Number of resource snapshots */
  snapshotCount: number;
  /** Last event description */
  lastEventDescription: string | null;
  /** Last event type */
  lastEventType: TripEventType | null;
  /** Whether recording is auto-linked to expedition */
  isExpeditionLinked: boolean;
}

// ── Trip Recorder Config ─────────────────────────────────────

export interface TripRecorderConfig {
  /** Auto-start recording when expedition begins */
  autoStartOnExpedition: boolean;
  /** Auto-stop recording when expedition ends */
  autoStopOnExpedition: boolean;
  /** Interval for resource snapshots in seconds */
  resourceSnapshotIntervalSec: number;
  /** Distance milestones to record (miles) */
  distanceMilestones: number[];
  /** Elevation milestones to record (feet) */
  elevationMilestones: number[];
  /** Maximum route points to store per trip */
  maxRoutePoints: number;
  /** Maximum trips to store locally */
  maxStoredTrips: number;
  /** GPS recording interval in seconds */
  gpsIntervalSec: number;
  /** Minimum distance between GPS points in meters */
  minDistanceM: number;
}

export const DEFAULT_RECORDER_CONFIG: TripRecorderConfig = {
  autoStartOnExpedition: true,
  autoStopOnExpedition: true,
  resourceSnapshotIntervalSec: 300, // every 5 minutes
  distanceMilestones: [10, 25, 50, 100, 200, 500],
  elevationMilestones: [5000, 8000, 10000, 12000, 14000],
  maxRoutePoints: 5000,
  maxStoredTrips: 50,
  gpsIntervalSec: 5,
  minDistanceM: 20,
};

