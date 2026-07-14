/**
 * useGeofenceMonitor — Automatic Expedition Activation via Geofence
 *
 * Monitors GPS position relative to a home/start geofence radius.
 * When the user exits the geofence, automatically begins an expedition.
 * When the user re-enters, automatically ends the expedition.
 *
 * ──────────────────────────────────────────────────────────────
 * FIXED ECS RADIUS:
 *   The geofence radius is read from expeditionStateStore.getGeofenceRadius()
 *   on every GPS check (~2s interval). ECS pins this behavior to the
 *   command default of 200m so route/expedition transitions stay consistent.
 *
 * Activation Flow:
 *   1. expedition.state === 'standby' + activeVehicleId exists
 *   2. GPS fix acquired → record as home position
 *   3. User moves > 200m from home → auto-start expedition
 *   4. expeditionStateStore.beginExpedition() called
 *   5. Gold header underline fades in (150ms, handled by DashboardHeader)
 *   6. Light haptic (Tier 1 — micro confirmation)
 *   7. Toast: "Expedition started." (2 seconds)
 *
 * Closure Flow:
 *   1. expedition.state === 'active'
 *   2. User moves back within 200m of home → auto-end expedition
 *   3. expeditionStateStore.endExpedition() called
 *   4. Gold header underline fades out (220ms, handled by DashboardHeader)
 *   5. Light haptic
 *   6. Toast: "Expedition ended."
 *   7. Completion data retained for the Expedition Summary flow
 *
 * Hysteresis:
 *   - Exit requires 3 consecutive readings outside geofence
 *   - Re-entry requires 3 consecutive readings inside geofence
 *   - Prevents GPS jitter from triggering false transitions
 *
 * GPS Accuracy Guard:
 *   - Ignores readings with accuracy > 100m
 *   - Prevents inaccurate fixes from triggering transitions
 * ──────────────────────────────────────────────────────────────
 */
import { useEffect, useRef, useCallback } from 'react';
import { haversineDistanceMiles } from './useGPSLocation';
import { useThrottledGPS } from './useThrottledGPS';
import {
  expeditionStateStore,
  type ExpeditionState,
} from './expeditionStateStore';
import { vehicleSetupStore } from './vehicleSetupStore';
import { consumablesStore } from './consumablesStore';
import { hapticMicro } from './haptics';
import { incrementECSPerformanceCounter } from './performance/ecsPerformanceDiagnostics';

// ── Constants ──────────────────────────────────────────────
const MILES_PER_METER = 0.000621371;

/** Number of consecutive readings required to confirm a transition */
const HYSTERESIS_COUNT = 3;

/** Maximum GPS accuracy (meters) to consider a reading valid */
const MAX_ACCURACY_M = 100;

/** Minimum interval between geofence checks (ms) to avoid rapid-fire */
const CHECK_INTERVAL_MS = 2000;

// ── Types ──────────────────────────────────────────────────
export interface GeofenceMonitorState {
  /** Whether the monitor is actively tracking */
  isMonitoring: boolean;
  /** Whether a home position has been established */
  hasHomePosition: boolean;
  /** Current distance from home in meters (null if no fix) */
  distanceFromHomeM: number | null;
  /** Whether currently outside the geofence */
  isOutsideGeofence: boolean;
  /** GPS status from the underlying hook */
  gpsStatus: string;
  /** Current ECS geofence radius in meters */
  geofenceRadiusM: number;
}

export interface GeofenceMonitorCallbacks {
  /** Called when expedition auto-starts (geofence exit) */
  onExpeditionStarted?: () => void;
  /** Called when expedition auto-ends (geofence re-entry) */
  onExpeditionEnded?: () => void;
}

interface UseGeofenceMonitorOptions {
  /** Whether monitoring is enabled */
  enabled: boolean;
  /** Vehicle name for the expedition record */
  vehicleName?: string;
  /** Callbacks for geofence transitions */
  callbacks?: GeofenceMonitorCallbacks;
}

// ── Hook ───────────────────────────────────────────────────
export function useGeofenceMonitor(
  options: UseGeofenceMonitorOptions
): GeofenceMonitorState {
  const { enabled, vehicleName, callbacks } = options;

  // ── GPS tracking (only when enabled) ─────────────────────
  // Use the shared GPS pipeline so Dashboard geofence monitoring does not
  // create a second native watch beside the dashboard/map GPS subscriber.
  const gps = useThrottledGPS({ enabled });

  // ── Refs for state tracking (avoid re-render loops) ──────
  const homePositionRef = useRef<{ lat: number; lng: number } | null>(null);
  const outsideCountRef = useRef(0);
  const insideCountRef = useRef(0);
  const lastCheckTimeRef = useRef(0);
  const hasTriggeredStartRef = useRef(false);
  const hasTriggeredEndRef = useRef(false);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // ── Reset state when monitoring is disabled ──────────────
  useEffect(() => {
    if (!enabled) {
      homePositionRef.current = null;
      outsideCountRef.current = 0;
      insideCountRef.current = 0;
      lastCheckTimeRef.current = 0;
      hasTriggeredStartRef.current = false;
      hasTriggeredEndRef.current = false;
    }
  }, [enabled]);

  // ── Sync with expedition state store on mount ────────────
  // If expedition is already active, mark as triggered so we
  // don't re-trigger on mount. Also restore home position.
  useEffect(() => {
    if (!enabled) return;

    const currentState = expeditionStateStore.getState();
    if (currentState === 'active') {
      hasTriggeredStartRef.current = true;
      hasTriggeredEndRef.current = false;

      // Restore home position from the active expedition record
      const record = expeditionStateStore.getCurrentExpedition();
      if (record?.homeLatitude != null && record?.homeLongitude != null) {
        homePositionRef.current = {
          lat: record.homeLatitude,
          lng: record.homeLongitude,
        };
      }

      // Also check the store's geofence
      const storedHome = expeditionStateStore.getHomeGeofence();
      if (storedHome && !homePositionRef.current) {
        homePositionRef.current = storedHome;
      }
    } else {
      hasTriggeredStartRef.current = false;
      hasTriggeredEndRef.current = false;
      homePositionRef.current = null;
    }
  }, [enabled]);

  // ── Main geofence check on each GPS update ───────────────
  useEffect(() => {
    if (!enabled || !gps.position) return;

    const now = Date.now();

    // Throttle checks
    if (now - lastCheckTimeRef.current < CHECK_INTERVAL_MS) return;
    lastCheckTimeRef.current = now;

    const { latitude, longitude, accuracyM } = gps.position;

    // Skip inaccurate readings
    if (accuracyM != null && accuracyM > MAX_ACCURACY_M) return;

    // ── Read fixed ECS geofence radius from store ───────────
    const geofenceRadiusM = expeditionStateStore.getGeofenceRadius();

    const expeditionState = expeditionStateStore.getState();
    const activeVehicleId = vehicleSetupStore.getActiveVehicleId();

    // ── STANDBY: Establish home position & detect exit ──────
    if (expeditionState === 'standby' && activeVehicleId) {
      // Record home position on first valid fix
      if (!homePositionRef.current) {
        homePositionRef.current = { lat: latitude, lng: longitude };
        expeditionStateStore.setHomeGeofence(latitude, longitude);
        outsideCountRef.current = 0;
        insideCountRef.current = 0;
        hasTriggeredStartRef.current = false;
        return;
      }

      // Calculate distance from home
      const distanceMiles = haversineDistanceMiles(
        homePositionRef.current.lat,
        homePositionRef.current.lng,
        latitude,
        longitude
      );
      const distanceM = distanceMiles / MILES_PER_METER;
      const isOutside = distanceM > geofenceRadiusM;

      if (isOutside) {
        outsideCountRef.current++;
        insideCountRef.current = 0;

        // Hysteresis: require consecutive readings
        if (
          outsideCountRef.current >= HYSTERESIS_COUNT &&
          !hasTriggeredStartRef.current
        ) {
          hasTriggeredStartRef.current = true;
          hasTriggeredEndRef.current = false;

          // Get consumables for the expedition record
          const consumables = consumablesStore.get(activeVehicleId);

          const previousRecord = expeditionStateStore.getCurrentExpedition();
          const { proposal } = expeditionStateStore.proposeGeofenceTransition({
            direction: 'start',
            vehicleId: activeVehicleId,
            reason: 'Three consecutive accurate GPS fixes confirmed departure from the home geofence.',
          });
          const startedRecord = proposal.status === 'pending'
            ? expeditionStateStore.beginExpedition({
                idempotencyKey: proposal.idempotencyKey,
                activeVehicleId,
                vehicleName: vehicleName || 'Vehicle',
                startFuelLevel: consumables.fuel_percent_current,
                startWaterLevel: consumables.water_gal_current,
                latitude: homePositionRef.current.lat,
                longitude: homePositionRef.current.lng,
                transitionCause: 'geofence',
              })
            : previousRecord;

          const didStart =
            previousRecord?.state !== 'active' &&
            previousRecord?.state !== 'paused' &&
            startedRecord?.state === 'active' &&
            startedRecord.id !== previousRecord?.id;
          if (didStart) {
            expeditionStateStore.resolveGeofenceTransitionProposal(proposal.id, 'accepted');
            incrementECSPerformanceCounter('dashboard_stable_grid', 'geofence_start_transition');
            hapticMicro();
            callbacksRef.current?.onExpeditionStarted?.();
          } else {
            if (proposal.status === 'pending') {
              expeditionStateStore.resolveGeofenceTransitionProposal(proposal.id, 'rejected');
            }
            incrementECSPerformanceCounter('dashboard_stable_grid', 'geofence_duplicate_transition_suppressed');
          }
        }
      } else {
        insideCountRef.current++;
        outsideCountRef.current = 0;
      }
    }

    // ── ACTIVE: Detect geofence re-entry ────────────────────
    if (expeditionState === 'active' && homePositionRef.current) {
      const distanceMiles = haversineDistanceMiles(
        homePositionRef.current.lat,
        homePositionRef.current.lng,
        latitude,
        longitude
      );
      const distanceM = distanceMiles / MILES_PER_METER;
      const isInside = distanceM <= geofenceRadiusM;

      if (isInside) {
        insideCountRef.current++;
        outsideCountRef.current = 0;

        // Hysteresis: require consecutive readings
        if (
          insideCountRef.current >= HYSTERESIS_COUNT &&
          !hasTriggeredEndRef.current
        ) {
          hasTriggeredEndRef.current = true;
          hasTriggeredStartRef.current = false;

          // Get current consumables for end-of-expedition snapshot
          const activeVehicleId = vehicleSetupStore.getActiveVehicleId();
          const consumables = activeVehicleId
            ? consumablesStore.get(activeVehicleId)
            : null;

          const previousRecord = expeditionStateStore.getCurrentExpedition();
          const proposalVehicleId = activeVehicleId ?? previousRecord?.activeVehicleId ?? 'unknown-vehicle';
          const { proposal } = expeditionStateStore.proposeGeofenceTransition({
            direction: 'end',
            vehicleId: proposalVehicleId,
            expeditionId: previousRecord?.id ?? null,
            reason: 'Three consecutive accurate GPS fixes confirmed return to the home geofence.',
          });
          const completedRecord = proposal.status === 'pending'
            ? expeditionStateStore.endExpedition({
                endFuelLevel: consumables?.fuel_percent_current ?? null,
                endWaterLevel: consumables?.water_gal_current ?? null,
                transitionCause: 'geofence',
                idempotencyKey: proposal.idempotencyKey,
              })
            : previousRecord;

          const didEnd =
            Boolean(previousRecord) &&
            (previousRecord?.state === 'active' || previousRecord?.state === 'paused') &&
            completedRecord?.id === previousRecord?.id &&
            completedRecord?.state === 'complete';
          if (didEnd) {
            expeditionStateStore.resolveGeofenceTransitionProposal(proposal.id, 'accepted');
            incrementECSPerformanceCounter('dashboard_stable_grid', 'geofence_end_transition');
            hapticMicro();
            callbacksRef.current?.onExpeditionEnded?.();
          } else {
            if (proposal.status === 'pending') {
              expeditionStateStore.resolveGeofenceTransitionProposal(proposal.id, 'rejected');
            }
            incrementECSPerformanceCounter('dashboard_stable_grid', 'geofence_duplicate_transition_suppressed');
          }

          // Reset home position for next expedition cycle
          // (will be re-established on next standby + GPS fix)
          homePositionRef.current = null;
          outsideCountRef.current = 0;
          insideCountRef.current = 0;
        }
      } else {
        outsideCountRef.current++;
        insideCountRef.current = 0;
      }
    }
  }, [enabled, gps.position, vehicleName]);

  // ── Read current radius for return value ─────────────────
  const currentRadiusM = expeditionStateStore.getGeofenceRadius();

  // ── Compute current distance for UI ──────────────────────
  let distanceFromHomeM: number | null = null;
  if (gps.position && homePositionRef.current) {
    const dMiles = haversineDistanceMiles(
      homePositionRef.current.lat,
      homePositionRef.current.lng,
      gps.position.latitude,
      gps.position.longitude
    );
    distanceFromHomeM = dMiles / MILES_PER_METER;
  }

  return {
    isMonitoring: enabled && gps.isWatching,
    hasHomePosition: homePositionRef.current != null,
    distanceFromHomeM,
    isOutsideGeofence: distanceFromHomeM != null
      ? distanceFromHomeM > currentRadiusM
      : false,
    gpsStatus: gps.gpsStatus,
    geofenceRadiusM: currentRadiusM,
  };
}

