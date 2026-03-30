/**
 * ExpeditionTacticalView — Trailhead-Ready Tactical Command View
 *
 * "What you need standing at the trailhead" — vehicle status, readiness,
 * stability, and range confidence in one non-scrolling view.
 *
 * LIVE SENSOR INTEGRATION:
 *   - Real-time accelerometer: roll/pitch with rate-of-change, peak tracking
 *   - Live GPS: distance to next waypoint, ETA from speed, fix quality
 *   - Telemetry store: fuel remaining, range, consumption rate
 *   - Route store: active route waypoints for distance calculations
 *   - Bailout store: nearest exit point distance
 *
 * Layout:
 *   1. Trailhead Header Strip (compact, single line)
 *   2. Vehicle Preview Hero (2x size, centered)
 *   3. Optional Micro Health Row (battery, telemetry, GPS quality)
 *   4. 2x2 Tactical Widget Grid (fixed, centered, equal tiles)
 */
import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
  LayoutChangeEvent,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeIcon as Ionicons } from '../SafeIcon';
import { TACTICAL, TYPO } from '../../lib/theme';
import { GOLD_RAIL } from '../../lib/theme';

import { useApp } from '../../context/AppContext';
import { useTheme } from '../../context/ThemeContext';

import { vehicleStore } from '../../lib/vehicleStore';
import { routeStore, type ImportedRoute, type RouteWaypoint } from '../../lib/routeStore';
import { missionExpeditionStore } from '../../lib/missionStore';
import { telemetryConfigStore, computeTelemetryReadout } from '../../lib/telemetryStore';
import { bailoutStore, type BailoutPoint } from '../../lib/bailoutStore';
import { haversineDistanceMiles, type GPSPosition } from '../../lib/useGPSLocation';
import { useThrottledGPS } from '../../lib/useThrottledGPS';

import type { Vehicle, Trip, LoadItem, Waypoint } from '../../lib/types';

// ── Constants ──────────────────────────────────────────────
const SCREEN_W = Dimensions.get('window').width;
const BASE_UNIT = 8;
const OUTER_PAD = BASE_UNIT * 3; // 24px
const GRID_GAP = BASE_UNIT * 2;  // 16px
const TILE_PAD = BASE_UNIT * 2;  // 16px
const TILE_RADIUS = 12;
const MAX_GRID_W = 600;

// Vehicle image URL (same as attitude monitor)
const VEHICLE_IMAGE_URI = 'https://d64gsuwffb70l.cloudfront.net/696e98bf1e58953c5b50217c_1771817649733_7476f1fc.png';

// ── Types ──────────────────────────────────────────────────
interface ExpeditionTacticalViewProps {
  /** Full accelerometer output for real-time sensor data */
  accel: AccelerometerOutput;
  advancedModeEnabled?: boolean;
}

// ── Helper: Total weight from load items ───────────────────
function getTotalWeightLbs(items: LoadItem[]): number {
  return items
    .filter(i => !i.deleted_at)
    .reduce((sum, i) => sum + (i.weight_lbs || 0), 0);
}

// ── Helper: Haversine between two points (miles) ───────────
function haversineMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  return haversineDistanceMiles(lat1, lon1, lat2, lon2);
}

// ── Helper: Find nearest waypoint to GPS position ──────────
function findNearestWaypoint(
  gps: GPSPosition,
  waypoints: RouteWaypoint[]
): { index: number; distance: number; waypoint: RouteWaypoint } | null {
  if (waypoints.length === 0) return null;
  let minDist = Infinity;
  let minIdx = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const wp = waypoints[i];
    const d = haversineMiles(gps.latitude, gps.longitude, wp.lat, wp.lon);
    if (d < minDist) {
      minDist = d;
      minIdx = i;
    }
  }
  return { index: minIdx, distance: minDist, waypoint: waypoints[minIdx] };
}

// ── Helper: Distance from GPS to remaining waypoints ───────
function computeRemainingDistance(
  gps: GPSPosition,
  waypoints: RouteWaypoint[],
  nearestIdx: number
): number {
  if (waypoints.length === 0) return 0;
  // Distance from current position to nearest waypoint
  let total = haversineMiles(
    gps.latitude, gps.longitude,
    waypoints[nearestIdx].lat, waypoints[nearestIdx].lon
  );
  // Then sum remaining waypoint-to-waypoint distances
  for (let i = nearestIdx + 1; i < waypoints.length; i++) {
    const prev = waypoints[i - 1];
    const curr = waypoints[i];
    total += haversineMiles(prev.lat, prev.lon, curr.lat, curr.lon);
  }
  return total;
}

// ── Helper: Find nearest bailout to GPS position ───────────
function findNearestBailout(
  gps: GPSPosition,
  bailouts: BailoutPoint[]
): { point: BailoutPoint; distance: number } | null {
  if (bailouts.length === 0) return null;
  let minDist = Infinity;
  let nearest: BailoutPoint | null = null;
  for (const bp of bailouts) {
    const d = haversineMiles(gps.latitude, gps.longitude, bp.lat, bp.lng);
    if (d < minDist) {
      minDist = d;
      nearest = bp;
    }
  }
  return nearest ? { point: nearest, distance: minDist } : null;
}

// ══════════════════════════════════════════════════════════════
// TRAILHEAD HEADER STRIP
// ══════════════════════════════════════════════════════════════
function TrailheadHeader({
  trip,
  syncStatus,
  vehicle,
  gpsStatus,
  fixQuality,
}: {
  trip: Trip | null;
  syncStatus: string;
  vehicle: Vehicle | null;
  gpsStatus: string;
  fixQuality: string;
}) {
  const { palette } = useTheme();
  const expeditionName = trip?.name || 'No Active Expedition';
  const isOnline = syncStatus === 'synced';
  const gpsColor = gpsStatus === 'TRACKING'
    ? fixQuality === 'HIGH' ? '#4CAF50' : fixQuality === 'MEDIUM' ? '#FFB300' : '#EF5350'
    : gpsStatus === 'ACQUIRING' ? '#FFB300' : palette.textMuted;

  return (
    <View style={[styles.headerStrip, { borderBottomColor: GOLD_RAIL.section }]}>

      {/* Left: Expedition name */}
      <View style={styles.headerLeft}>
        <Ionicons name="flag-outline" size={11} color={palette.amber} />
        <Text style={[styles.headerName, { color: palette.text }]} numberOfLines={1}>
          {expeditionName}
        </Text>
      </View>

      {/* Center: Mode badge */}
      <View style={styles.headerCenter}>
        <View style={[styles.modeBadge, { backgroundColor: palette.amber + '12', borderColor: palette.amber + '30' }]}>
          <Text style={[styles.modeBadgeText, { color: palette.amber }]}>
            EXPEDITION {'\u2022'} TACTICAL
          </Text>
        </View>
      </View>

      {/* Right: Status icons */}
      <View style={styles.headerRight}>
        {/* GPS lock — color reflects actual fix quality */}
        <View style={[styles.statusIcon, { backgroundColor: gpsColor + '18' }]}>
          <Ionicons name="navigate" size={9} color={gpsColor} />
        </View>
        {/* Offline maps */}
        <View style={[styles.statusIcon, { backgroundColor: 'rgba(66,165,245,0.12)' }]}>
          <Ionicons name="map" size={9} color="#42A5F5" />
        </View>
        {/* Sync */}
        <View style={[styles.statusIcon, { backgroundColor: isOnline ? 'rgba(76,175,80,0.12)' : 'rgba(196,138,44,0.12)' }]}>
          <Ionicons name={isOnline ? 'cloud-done' : 'cloud-offline'} size={9} color={isOnline ? '#4CAF50' : palette.amber} />
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// VEHICLE HERO PREVIEW (2x size)
// ══════════════════════════════════════════════════════════════
function VehicleHero({
  vehicle,
  rollDeg,
  heroHeight,
}: {
  vehicle: Vehicle | null;
  rollDeg: number;
  heroHeight: number;
}) {
  const { palette } = useTheme();
  const silRotation = Math.max(-30, Math.min(30, rollDeg));

  // 2x of standard 72x80 = 144x160
  const imgW = 144;
  const imgH = 160;

  const vehicleName = vehicle?.name || 'Vehicle';
  const meta = vehicle
    ? [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ')
    : '';

  return (
    <View style={[styles.heroContainer, { height: heroHeight }]}>
      {/* Vehicle image at 2x */}
      <View style={[styles.vehiclePreview, { transform: [{ rotate: `${silRotation}deg` }] }]}>
        <Image
          source={{ uri: VEHICLE_IMAGE_URI }}
          style={{ width: imgW, height: imgH }}
          resizeMode="contain"
        />
      </View>

      {/* Ground line */}
      <View style={styles.groundLine} />

      {/* Vehicle name label */}
      <View style={styles.heroLabelRow}>
        {vehicle && (
          <>
            <Text style={[styles.heroVehicleName, { color: palette.text }]} numberOfLines={1}>
              {vehicleName}
            </Text>
            {meta ? (
              <Text style={[styles.heroVehicleMeta, { color: palette.textMuted }]} numberOfLines={1}>
                {meta}
              </Text>
            ) : null}
          </>
        )}
        {!vehicle && (
          <Text style={[styles.heroVehicleMeta, { color: palette.textMuted }]}>
            No vehicle configured
          </Text>
        )}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// MICRO HEALTH ROW (GPS quality + telemetry + sensor status)
// ══════════════════════════════════════════════════════════════
function MicroHealthRow({
  trip,
  gpsStatus,
  fixQuality,
  speedMph,
  sensorStatus,
  telemetryState,
}: {
  trip: Trip | null;
  gpsStatus: string;
  fixQuality: string;
  speedMph: number | null;
  sensorStatus: string;
  telemetryState: string | null;
}) {
  const { palette } = useTheme();
  const hasBattery = trip?.battery_usable_wh != null && trip.battery_usable_wh > 0;

  // Always show at least GPS + sensor status
  const gpsColor = gpsStatus === 'TRACKING'
    ? fixQuality === 'HIGH' ? '#4CAF50' : '#FFB300'
    : palette.textMuted;
  const sensorColor = sensorStatus === 'LIVE' || sensorStatus === 'CALIBRATED' ? '#4CAF50' : palette.textMuted;

  return (
    <View style={[styles.microRow, { borderColor: palette.border + '20' }]}>
      {/* GPS */}
      <View style={styles.microItem}>
        <Ionicons name="locate-outline" size={10} color={gpsColor} />
        <Text style={[styles.microValue, { color: gpsColor }]}>
          {gpsStatus === 'TRACKING' ? fixQuality : gpsStatus === 'ACQUIRING' ? 'ACQ' : 'OFF'}
        </Text>
        <Text style={[styles.microLabel, { color: palette.textMuted }]}>GPS</Text>
      </View>

      {/* Speed */}
      {speedMph != null && gpsStatus === 'TRACKING' && (
        <View style={styles.microItem}>
          <Ionicons name="speedometer-outline" size={10} color={palette.amber} />
          <Text style={[styles.microValue, { color: palette.amber }]}>{speedMph.toFixed(0)}</Text>
          <Text style={[styles.microLabel, { color: palette.textMuted }]}>MPH</Text>
        </View>
      )}

      {/* Sensor */}
      <View style={styles.microItem}>
        <Ionicons name="analytics-outline" size={10} color={sensorColor} />
        <Text style={[styles.microValue, { color: sensorColor }]}>
          {sensorStatus === 'CALIBRATED' ? 'CAL' : sensorStatus === 'LIVE' ? 'LIVE' : 'OFF'}
        </Text>
        <Text style={[styles.microLabel, { color: palette.textMuted }]}>IMU</Text>
      </View>

      {/* Battery */}
      {hasBattery && (
        <View style={styles.microItem}>
          <Ionicons name="battery-charging-outline" size={10} color="#4CAF50" />
          <Text style={[styles.microValue, { color: '#4CAF50' }]}>
            {Math.round((trip!.battery_usable_wh! / (trip!.battery_usable_wh! * 1.2)) * 100)}%
          </Text>
          <Text style={[styles.microLabel, { color: palette.textMuted }]}>BATT</Text>
        </View>
      )}

      {/* Solar */}
      {trip?.solar_watts != null && trip.solar_watts > 0 && (
        <View style={styles.microItem}>
          <Ionicons name="sunny-outline" size={10} color="#FFB300" />
          <Text style={[styles.microValue, { color: '#FFB300' }]}>{trip.solar_watts}W</Text>
          <Text style={[styles.microLabel, { color: palette.textMuted }]}>SOLAR</Text>
        </View>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// TACTICAL TILE — Attitude Monitor (Tile A)
// LIVE SENSOR: Real-time roll/pitch with rate-of-change + peaks
// ══════════════════════════════════════════════════════════════
function TileAttitudeMonitor({
  accel,
  advanced,
  tileW,
  tileH,
}: {
  accel: AccelerometerOutput;
  advanced?: boolean;
  tileW: number;
  tileH: number;
}) {
  const { palette } = useTheme();
  const { rollDeg, pitchDeg, rawRollDeg, rawPitchDeg, isActive, isCalibrated, sensorStatus } = accel;

  // ── Rate of change tracking ──────────────────────────
  const prevRef = useRef({ roll: 0, pitch: 0, time: Date.now() });
  const [rollRate, setRollRate] = useState(0); // deg/sec
  const [pitchRate, setPitchRate] = useState(0);

  // ── Peak tracking ────────────────────────────────────
  const [peakRoll, setPeakRoll] = useState(0);
  const [peakPitch, setPeakPitch] = useState(0);

  useEffect(() => {
    const now = Date.now();
    const dt = (now - prevRef.current.time) / 1000; // seconds
    if (dt > 0.01 && dt < 2) { // Ignore stale or too-fast updates
      const rRate = (rollDeg - prevRef.current.roll) / dt;
      const pRate = (pitchDeg - prevRef.current.pitch) / dt;
      // Low-pass filter the rate
      setRollRate(prev => prev * 0.7 + rRate * 0.3);
      setPitchRate(prev => prev * 0.7 + pRate * 0.3);
    }
    prevRef.current = { roll: rollDeg, pitch: pitchDeg, time: now };

    // Track peaks
    const absRoll = Math.abs(rollDeg);
    const absPitch = Math.abs(pitchDeg);
    if (absRoll > peakRoll) setPeakRoll(absRoll);
    if (absPitch > peakPitch) setPeakPitch(absPitch);
  }, [rollDeg, pitchDeg]);

  // ── Thresholds ───────────────────────────────────────
  const rollWarning = advanced ? 22 : 25;
  const rollDanger = advanced ? 32 : 35;
  const pitchWarning = advanced ? 18 : 20;
  const pitchDanger = advanced ? 28 : 30;

  const absRoll = Math.abs(rollDeg);
  const absPitch = Math.abs(pitchDeg);

  const rollColor =
    absRoll >= rollDanger ? TACTICAL.danger : absRoll >= rollWarning ? '#E67E22' : palette.amber;
  const pitchColor =
    absPitch >= pitchDanger ? TACTICAL.danger : absPitch >= pitchWarning ? '#E67E22' : palette.amber;

  const tilt = Math.sqrt(rollDeg * rollDeg + pitchDeg * pitchDeg);

  // Rate warning (rapid tilt change)
  const absRollRate = Math.abs(rollRate);
  const absPitchRate = Math.abs(pitchRate);
  const isRapidChange = absRollRate > 15 || absPitchRate > 15; // >15 deg/sec

  // Status
  let statusLabel = 'SAFE';
  let statusColor = '#4CAF50';
  if (absRoll >= rollDanger || absPitch >= pitchDanger) {
    statusLabel = 'CRITICAL';
    statusColor = TACTICAL.danger;
  } else if (absRoll >= rollWarning || absPitch >= pitchWarning) {
    statusLabel = 'CAUTION';
    statusColor = '#E67E22';
  } else if (isRapidChange) {
    statusLabel = 'DYNAMIC';
    statusColor = '#E67E22';
  }

  // Compact display if tile is small
  const isCompact = tileH < 110;

  return (
    <View style={[styles.tile, { width: tileW, height: tileH, borderColor: palette.border }]}>
      <View style={styles.tileHeader}>
        <Ionicons name="compass-outline" size={10} color={palette.amber} />
        <Text style={[styles.tileTitle, { color: palette.amber }]}>ATTITUDE</Text>
        {/* Live sensor dot — pulses when active */}
        <View style={[
          styles.sensorDot,
          {
            backgroundColor: isActive
              ? (isCalibrated ? '#42A5F5' : '#4CAF50')
              : palette.textMuted,
          },
        ]} />
        {isCalibrated && (
          <Text style={[styles.calBadge, { color: '#42A5F5' }]}>CAL</Text>
        )}
      </View>

      <View style={styles.tileBody}>
        {/* Roll / Pitch values — LIVE from accelerometer */}
        <View style={styles.attitudeMetrics}>
          <View style={styles.attMetric}>
            <Text style={[styles.attLabel, { color: palette.textMuted }]}>ROLL</Text>
            <Text style={[styles.attValue, { color: rollColor }]}>
              {rollDeg.toFixed(1)}{'\u00B0'}
            </Text>
            {/* Rate of change indicator */}
            {!isCompact && absRollRate > 2 && (
              <Text style={[styles.rateText, { color: isRapidChange ? '#E67E22' : palette.textMuted }]}>
                {rollRate > 0 ? '+' : ''}{rollRate.toFixed(0)}{'\u00B0'}/s
              </Text>
            )}
          </View>
          <View style={styles.attDivider} />
          <View style={styles.attMetric}>
            <Text style={[styles.attLabel, { color: palette.textMuted }]}>PITCH</Text>
            <Text style={[styles.attValue, { color: pitchColor }]}>
              {pitchDeg.toFixed(1)}{'\u00B0'}
            </Text>
            {!isCompact && absPitchRate > 2 && (
              <Text style={[styles.rateText, { color: isRapidChange ? '#E67E22' : palette.textMuted }]}>
                {pitchRate > 0 ? '+' : ''}{pitchRate.toFixed(0)}{'\u00B0'}/s
              </Text>
            )}
          </View>
        </View>

        {/* Tilt + peak */}
        <View style={styles.tiltRow}>
          <Text style={[styles.tiltValue, { color: palette.textMuted }]}>
            {tilt.toFixed(1)}{'\u00B0'} TILT
          </Text>
          {!isCompact && (peakRoll > 3 || peakPitch > 3) && (
            <Text style={[styles.peakText, { color: palette.textMuted + '80' }]}>
              PK {peakRoll.toFixed(0)}/{peakPitch.toFixed(0)}
            </Text>
          )}
        </View>

        {/* Status badge */}
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '15' }]}>
          <View style={[styles.statusDotSmall, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusBadgeText, { color: statusColor }]}>{statusLabel}</Text>
          {!isActive && (
            <Text style={[styles.offlineHint, { color: palette.textMuted }]}>SENSOR OFFLINE</Text>
          )}
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// TACTICAL TILE — Distance Remaining (Tile B)
// LIVE GPS: Real-time distance to waypoints from current position
// ══════════════════════════════════════════════════════════════
function TileDistanceRemaining({
  trip,
  tripWaypoints,
  gpsPosition,
  gpsStatus,
  activeRoute,
  nearestBailout,
  tileW,
  tileH,
}: {
  trip: Trip | null;
  tripWaypoints: Waypoint[];
  gpsPosition: GPSPosition | null;
  gpsStatus: string;
  activeRoute: ImportedRoute | null;
  nearestBailout: { point: BailoutPoint; distance: number } | null;
  tileW: number;
  tileH: number;
}) {
  const { palette } = useTheme();

  // ── Live GPS-based distance calculation ──────────────
  const liveCalc = useMemo(() => {
    if (!gpsPosition) return null;

    // Use route waypoints if available, otherwise trip waypoints
    const routeWps = activeRoute?.waypoints || [];
    const hasRouteWps = routeWps.length >= 2;

    if (hasRouteWps) {
      const nearest = findNearestWaypoint(gpsPosition, routeWps);
      if (!nearest) return null;

      const remaining = computeRemainingDistance(gpsPosition, routeWps, nearest.index);
      const totalRoute = activeRoute!.total_distance_miles;
      const traveled = Math.max(0, totalRoute - remaining);
      const pct = totalRoute > 0 ? Math.min(100, Math.round((traveled / totalRoute) * 100)) : 0;

      // ETA from speed
      let etaHours: number | null = null;
      if (gpsPosition.speedMph != null && gpsPosition.speedMph > 1 && remaining > 0) {
        etaHours = remaining / gpsPosition.speedMph;
      }

      // Next waypoint info
      const nextWpIdx = Math.min(nearest.index + 1, routeWps.length - 1);
      const nextWp = routeWps[nextWpIdx];
      const distToNext = haversineMiles(
        gpsPosition.latitude, gpsPosition.longitude,
        nextWp.lat, nextWp.lon
      );

      return {
        remaining: Math.round(remaining * 10) / 10,
        distToNext: Math.round(distToNext * 10) / 10,
        nextWpName: nextWp.name || `WP ${nextWpIdx + 1}`,
        pct,
        etaHours,
        totalRoute,
        waypointCount: routeWps.length,
        isLive: true,
      };
    }

    // Fallback: use trip waypoints (recorded GPS breadcrumbs)
    if (tripWaypoints.length >= 2) {
      const lastWp = tripWaypoints[tripWaypoints.length - 1];
      const distToLast = haversineMiles(
        gpsPosition.latitude, gpsPosition.longitude,
        lastWp.latitude, lastWp.longitude
      );
      return {
        remaining: null,
        distToNext: Math.round(distToLast * 10) / 10,
        nextWpName: 'Last Waypoint',
        pct: 0,
        etaHours: null,
        totalRoute: trip?.route_distance_miles || null,
        waypointCount: tripWaypoints.length,
        isLive: true,
      };
    }

    return null;
  }, [gpsPosition, activeRoute, tripWaypoints, trip]);

  // ── Fallback: static calculation ─────────────────────
  const staticCalc = useMemo(() => {
    if (liveCalc) return null;
    const planned = trip?.route_distance_miles;
    return {
      remaining: planned,
      pct: 0,
      waypointCount: tripWaypoints.length + (activeRoute?.waypoint_count || 0),
    };
  }, [liveCalc, trip, tripWaypoints, activeRoute]);

  const isCompact = tileH < 110;
  const isLive = liveCalc?.isLive || false;

  return (
    <View style={[styles.tile, { width: tileW, height: tileH, borderColor: palette.border }]}>
      <View style={styles.tileHeader}>
        <Ionicons name="navigate-outline" size={10} color={palette.amber} />
        <Text style={[styles.tileTitle, { color: palette.amber }]}>DISTANCE</Text>
        {isLive && (
          <View style={[styles.liveDot, { backgroundColor: '#4CAF50' }]} />
        )}
      </View>

      <View style={styles.tileBody}>
        {liveCalc ? (
          <>
            {/* Primary: distance remaining or to next waypoint */}
            {liveCalc.remaining != null ? (
              <>
                <Text style={[styles.primaryMetric, { color: palette.text }]}>
                  {liveCalc.remaining.toFixed(1)}
                </Text>
                <Text style={[styles.metricUnit, { color: palette.textMuted }]}>MI REMAINING</Text>
              </>
            ) : (
              <>
                <Text style={[styles.primaryMetric, { color: palette.text }]}>
                  {liveCalc.distToNext.toFixed(1)}
                </Text>
                <Text style={[styles.metricUnit, { color: palette.textMuted }]}>MI TO NEXT</Text>
              </>
            )}

            {/* Progress bar */}
            {liveCalc.pct > 0 && (
              <View style={styles.progressOuter}>
                <View
                  style={[
                    styles.progressInner,
                    {
                      width: `${liveCalc.pct}%`,
                      backgroundColor: liveCalc.pct >= 100 ? '#4CAF50' : palette.amber,
                    },
                  ]}
                />
              </View>
            )}

            {/* Next waypoint */}
            {!isCompact && (
              <View style={styles.secondaryRow}>
                <Text style={[styles.secondaryLabel, { color: palette.textMuted }]}>NEXT</Text>
                <Text style={[styles.secondaryValue, { color: palette.text }]} numberOfLines={1}>
                  {liveCalc.distToNext}mi {'\u2022'} {liveCalc.nextWpName}
                </Text>
              </View>
            )}

            {/* ETA from live speed */}
            {liveCalc.etaHours != null && (
              <View style={styles.secondaryRow}>
                <Text style={[styles.secondaryLabel, { color: palette.textMuted }]}>ETA</Text>
                <Text style={[styles.secondaryValue, { color: palette.text }]}>
                  {liveCalc.etaHours < 1
                    ? `${Math.round(liveCalc.etaHours * 60)}m`
                    : `${liveCalc.etaHours.toFixed(1)}h`}
                </Text>
              </View>
            )}

            {/* Bailout distance */}
            {!isCompact && nearestBailout && (
              <View style={styles.secondaryRow}>
                <Text style={[styles.secondaryLabel, { color: nearestBailout.distance > 10 ? TACTICAL.danger : palette.textMuted }]}>
                  EXIT
                </Text>
                <Text style={[styles.secondaryValue, { color: nearestBailout.distance > 10 ? TACTICAL.danger : palette.text }]}>
                  {nearestBailout.distance.toFixed(1)}mi
                </Text>
              </View>
            )}
          </>
        ) : staticCalc?.remaining != null ? (
          <>
            <Text style={[styles.primaryMetric, { color: palette.text }]}>
              {staticCalc.remaining.toFixed(0)}
            </Text>
            <Text style={[styles.metricUnit, { color: palette.textMuted }]}>MI PLANNED</Text>
            <View style={styles.secondaryRow}>
              <Text style={[styles.secondaryLabel, { color: palette.textMuted }]}>WAYPOINTS</Text>
              <Text style={[styles.secondaryValue, { color: palette.text }]}>
                {staticCalc.waypointCount}
              </Text>
            </View>
            {gpsStatus !== 'TRACKING' && (
              <Text style={[styles.notConfigured, { color: palette.textMuted, marginTop: 2 }]}>
                GPS {gpsStatus === 'ACQUIRING' ? 'acquiring...' : 'offline'}
              </Text>
            )}
          </>
        ) : (
          <>
            <Text style={[styles.notConfigured, { color: palette.textMuted }]}>No route loaded</Text>
            {gpsStatus !== 'TRACKING' && (
              <Text style={[styles.notConfigured, { color: palette.textMuted }]}>
                GPS {gpsStatus === 'ACQUIRING' ? 'acquiring...' : 'offline'}
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// TACTICAL TILE — Fuel + Range (Tile C)
// TELEMETRY: Live fuel data from telemetry store
// ══════════════════════════════════════════════════════════════
function TileFuelRange({
  trip,
  activeExpeditionId,
  distanceRemaining,
  tileW,
  tileH,
}: {
  trip: Trip | null;
  activeExpeditionId: string | null;
  distanceRemaining: number | null;
  tileW: number;
  tileH: number;
}) {
  const { palette } = useTheme();

  // ── Pull live telemetry if expedition is active ──────
  const telemetry = useMemo(() => {
    if (activeExpeditionId) {
      return computeTelemetryReadout(activeExpeditionId);
    }
    return null;
  }, [activeExpeditionId]);

  // ── Fuel data: prefer telemetry, fallback to trip ────
  const fuelPct = telemetry?.fuelPercent ?? (trip?.capac_fuel_gal ? 100 : null);
  const fuelRemainingGal = telemetry?.fuelRemainingGal ?? trip?.capac_fuel_gal ?? null;
  const mpg = telemetry?.fuelConfigured
    ? (telemetry.fuelRangeMi && fuelRemainingGal ? telemetry.fuelRangeMi / fuelRemainingGal : null)
    : trip?.capac_mpg ?? null;
  const rangeMiles = telemetry?.fuelRangeMi ?? (fuelRemainingGal && mpg ? fuelRemainingGal * mpg : null);
  const safeRangeMiles = telemetry?.fuelSafeRangeMi ?? (rangeMiles ? rangeMiles * 0.75 : null);

  // ── Fuel days calculation ────────────────────────────
  const milesPerDay = trip?.avg_miles_per_day;
  const dailyFuel = mpg && milesPerDay ? milesPerDay / mpg : null;
  const fuelDays = fuelRemainingGal && dailyFuel ? fuelRemainingGal / dailyFuel : null;

  // ── Low fuel warning ─────────────────────────────────
  const missionDays =
    trip?.start_date && trip?.end_date
      ? Math.ceil(
          (new Date(trip.end_date).getTime() - new Date(trip.start_date).getTime()) / 86400000
        )
      : null;
  const isLowByDays = fuelDays != null && missionDays != null && fuelDays < missionDays;
  const isLowByRange = rangeMiles != null && distanceRemaining != null && rangeMiles < distanceRemaining * 1.2;
  const isLow = isLowByDays || isLowByRange || (fuelPct != null && fuelPct < 20);

  const fuelColor = isLow
    ? TACTICAL.danger
    : fuelPct != null
      ? fuelPct >= 50 ? '#4CAF50' : fuelPct >= 25 ? '#E67E22' : TACTICAL.danger
      : '#4CAF50';

  const isCompact = tileH < 110;
  const hasTelemetry = telemetry?.fuelConfigured || false;

  return (
    <View style={[styles.tile, { width: tileW, height: tileH, borderColor: palette.border }]}>
      <View style={styles.tileHeader}>
        <Ionicons name="speedometer-outline" size={10} color={palette.amber} />
        <Text style={[styles.tileTitle, { color: palette.amber }]}>FUEL + RANGE</Text>
        {hasTelemetry && (
          <View style={[styles.liveDot, { backgroundColor: '#4CAF50' }]} />
        )}
      </View>

      <View style={styles.tileBody}>
        {rangeMiles != null ? (
          <>
            <Text style={[styles.primaryMetric, { color: fuelColor }]}>
              {rangeMiles.toFixed(0)}
            </Text>
            <Text style={[styles.metricUnit, { color: palette.textMuted }]}>MI RANGE</Text>
          </>
        ) : (
          <Text style={[styles.notConfigured, { color: palette.textMuted }]}>Not configured</Text>
        )}

        {/* Fuel gauge bar */}
        {fuelPct != null && (
          <View style={styles.progressOuter}>
            <View
              style={[
                styles.progressInner,
                { width: `${Math.min(100, fuelPct)}%`, backgroundColor: fuelColor },
              ]}
            />
          </View>
        )}

        {/* Fuel percentage */}
        {fuelPct != null && (
          <View style={styles.secondaryRow}>
            <Text style={[styles.secondaryLabel, { color: palette.textMuted }]}>FUEL</Text>
            <Text style={[styles.secondaryValue, { color: fuelColor }]}>
              {fuelPct}%{fuelRemainingGal ? ` (${fuelRemainingGal.toFixed(1)}gal)` : ''}
            </Text>
          </View>
        )}

        {/* Endurance */}
        {!isCompact && fuelDays != null && (
          <View style={styles.secondaryRow}>
            <Text style={[styles.secondaryLabel, { color: palette.textMuted }]}>ENDURANCE</Text>
            <Text style={[styles.secondaryValue, { color: palette.text }]}>
              {fuelDays.toFixed(1)}d
            </Text>
          </View>
        )}

        {/* Range vs distance remaining comparison */}
        {!isCompact && rangeMiles != null && distanceRemaining != null && distanceRemaining > 0 && (
          <View style={styles.secondaryRow}>
            <Text style={[styles.secondaryLabel, { color: palette.textMuted }]}>MARGIN</Text>
            <Text style={[styles.secondaryValue, {
              color: rangeMiles > distanceRemaining * 1.2 ? '#4CAF50' : TACTICAL.danger
            }]}>
              {rangeMiles > distanceRemaining
                ? `+${(rangeMiles - distanceRemaining).toFixed(0)}mi`
                : `-${(distanceRemaining - rangeMiles).toFixed(0)}mi`}
            </Text>
          </View>
        )}

        {/* Low fuel warning */}
        {isLow && (
          <View style={[styles.warningBadge, { backgroundColor: 'rgba(192,57,43,0.1)' }]}>
            <Ionicons name="alert-circle" size={9} color={TACTICAL.danger} />
            <Text style={[styles.warningText, { color: TACTICAL.danger }]}>
              {isLowByRange ? 'RANGE < ROUTE' : 'LOW FUEL'}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// TACTICAL TILE — Loadout Weight + Readiness (Tile D)
// ══════════════════════════════════════════════════════════════
function TileLoadoutReadiness({
  trip,
  loadItems,
  tileW,
  tileH,
}: {
  trip: Trip | null;
  loadItems: LoadItem[];
  tileW: number;
  tileH: number;
}) {
  const { palette } = useTheme();

  const items = loadItems.filter(i => !i.deleted_at);
  const totalWeight = getTotalWeightLbs(items);
  const mode = trip?.active_mode || 'Trip';
  const active = items.filter(i => i.mode === mode || i.mode === 'Both');
  const packed = active.filter(i => i.packed);
  const pct = active.length > 0 ? Math.round((packed.length / active.length) * 100) : 0;

  // Critical items (items with weight > 0 that aren't packed)
  const criticalMissing = active.filter(i => !i.packed && (i.weight_lbs || 0) > 5).length;

  const readyLabel = pct >= 100 ? 'READY' : pct >= 70 ? 'PARTIAL' : 'NOT READY';
  const readyColor = pct >= 100 ? '#4CAF50' : pct >= 70 ? palette.amber : TACTICAL.danger;

  const isCompact = tileH < 110;

  return (
    <View style={[styles.tile, { width: tileW, height: tileH, borderColor: palette.border }]}>
      <View style={styles.tileHeader}>
        <Ionicons name="cube-outline" size={10} color={palette.amber} />
        <Text style={[styles.tileTitle, { color: palette.amber }]}>LOADOUT</Text>
      </View>

      <View style={styles.tileBody}>
        {/* Primary: Total weight */}
        <Text style={[styles.primaryMetric, { color: palette.text }]}>
          {totalWeight > 0 ? totalWeight.toFixed(0) : '0'}
        </Text>
        <Text style={[styles.metricUnit, { color: palette.textMuted }]}>LBS TOTAL</Text>

        {/* Readiness bar */}
        <View style={styles.progressOuter}>
          <View
            style={[
              styles.progressInner,
              { width: `${pct}%`, backgroundColor: readyColor },
            ]}
          />
        </View>

        {/* Secondary */}
        <View style={styles.secondaryRow}>
          <Text style={[styles.secondaryLabel, { color: palette.textMuted }]}>PACKED</Text>
          <Text style={[styles.secondaryValue, { color: palette.text }]}>
            {packed.length}/{active.length}
          </Text>
        </View>

        {!isCompact && criticalMissing > 0 && (
          <View style={styles.secondaryRow}>
            <Text style={[styles.secondaryLabel, { color: TACTICAL.danger }]}>MISSING</Text>
            <Text style={[styles.secondaryValue, { color: TACTICAL.danger }]}>
              {criticalMissing}
            </Text>
          </View>
        )}

        {/* Ready badge */}
        <View style={[styles.statusBadge, { backgroundColor: readyColor + '15' }]}>
          <View style={[styles.statusDotSmall, { backgroundColor: readyColor }]} />
          <Text style={[styles.statusBadgeText, { color: readyColor }]}>{readyLabel}</Text>
        </View>
      </View>
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// MAIN EXPEDITION TACTICAL VIEW
// ══════════════════════════════════════════════════════════════
export default function ExpeditionTacticalView({
  accel,
  advancedModeEnabled,
}: ExpeditionTacticalViewProps) {
  const { activeTrip, loadItems, waypoints, syncStatus, user } = useApp();
  const { palette } = useTheme();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [containerH, setContainerH] = useState(0);
  // ── Throttled GPS tracking (Phase 3A: max 1 UI update/sec) ──
  // Raw GPS still available internally via gps.rawGPS for distance tracking
  const gps = useThrottledGPS({ enabled: true, highAccuracy: true });


  // ── Active route from route store ────────────────────
  const [activeRoute, setActiveRoute] = useState<ImportedRoute | null>(null);

  // ── Active mission expedition ────────────────────────
  const [activeExpeditionId, setActiveExpeditionId] = useState<string | null>(null);

  // ── Bailout points ───────────────────────────────────
  const [bailouts, setBailouts] = useState<BailoutPoint[]>([]);

  // Fetch configured vehicle, active route, expedition, bailouts
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          // Vehicle
          const result = await vehicleStore.getAll(user?.id || null);
          if (cancelled) return;
          const configured = result.vehicles.find((v: any) => v.wizard_config);
          setVehicle(configured || null);
        } catch {}

        // Active route
        try {
          const route = routeStore.getActive();
          if (!cancelled) setActiveRoute(route);
        } catch {}

        // Active expedition
        try {
          const expedition = missionExpeditionStore.getActive();
          if (!cancelled) setActiveExpeditionId(expedition?.id || null);
        } catch {}

        // Bailout points
        try {
          const bps = bailoutStore.getAll();
          if (!cancelled) setBailouts(bps);
        } catch {}
      })();
      return () => {
        cancelled = true;
      };
    }, [user?.id])
  );

  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > 0) setContainerH(h);
  }, []);

  // ── Nearest bailout from live GPS ────────────────────
  const nearestBailout = useMemo(() => {
    if (!gps.position || bailouts.length === 0) return null;
    return findNearestBailout(gps.position, bailouts);
  }, [gps.position, bailouts]);

  // ── Live distance remaining for fuel margin calc ─────
  const liveDistanceRemaining = useMemo(() => {
    if (!gps.position || !activeRoute || activeRoute.waypoints.length < 2) return null;
    const nearest = findNearestWaypoint(gps.position, activeRoute.waypoints);
    if (!nearest) return null;
    return computeRemainingDistance(gps.position, activeRoute.waypoints, nearest.index);
  }, [gps.position, activeRoute]);

  // ── Compute layout dimensions ────────────────────────
  const layout = useMemo(() => {
    if (containerH <= 0) {
      return { heroH: 180, tileW: 150, tileH: 100, gridW: 316, offsetX: 0 };
    }

    const headerH = 34;
    const microH = 28; // Always show micro row now (GPS + sensor status)

    // Available height for hero + grid
    const availH = containerH - headerH - microH;

    // Hero gets ~35% of available, grid gets ~65%
    const heroH = Math.max(120, Math.min(200, Math.floor(availH * 0.35)));
    const gridAreaH = availH - heroH;

    // Grid: 2 rows, 1 gap
    const tileH = Math.max(80, Math.floor((gridAreaH - GRID_GAP) / 2));

    // Grid width: max-width constrained, centered
    const maxAvailW = SCREEN_W - OUTER_PAD * 2;
    const gridW = Math.min(maxAvailW, MAX_GRID_W);
    const offsetX = maxAvailW > MAX_GRID_W ? (maxAvailW - MAX_GRID_W) / 2 : 0;

    // Tile width: 2 columns, 1 gap
    const tileW = Math.floor((gridW - GRID_GAP) / 2);

    return {
      heroH,
      tileW,
      tileH,
      gridW,
      offsetX,
    };
  }, [containerH]);

  return (
    <View style={[styles.root, { backgroundColor: palette.bg }]} onLayout={handleLayout}>
      {/* 1. Trailhead Header Strip */}
      <TrailheadHeader
        trip={activeTrip}
        syncStatus={syncStatus}
        vehicle={vehicle}
        gpsStatus={gps.gpsStatus}
        fixQuality={gps.fixQuality}
      />

      {containerH > 0 && (
        <>
          {/* 2. Vehicle Hero Preview (2x) */}
          <VehicleHero vehicle={vehicle} rollDeg={accel.rollDeg} heroHeight={layout.heroH} />

          {/* 3. Micro Health Row (always shown — GPS + sensor status) */}
          <MicroHealthRow
            trip={activeTrip}
            gpsStatus={gps.gpsStatus}
            fixQuality={gps.fixQuality}
            speedMph={gps.position?.speedMph ?? null}
            sensorStatus={accel.sensorStatus}
            telemetryState={activeExpeditionId ? 'active' : null}
          />

          {/* 4. 2x2 Tactical Widget Grid */}
          <View
            style={[
              styles.gridContainer,
              {
                paddingHorizontal: OUTER_PAD + layout.offsetX,
              },
            ]}
          >
            {/* Row 1 */}
            <View style={styles.gridRow}>
              <TileAttitudeMonitor
                accel={accel}
                advanced={advancedModeEnabled}
                tileW={layout.tileW}
                tileH={layout.tileH}
              />
              <View style={{ width: GRID_GAP }} />
              <TileDistanceRemaining
                trip={activeTrip}
                tripWaypoints={waypoints}
                gpsPosition={gps.position}
                gpsStatus={gps.gpsStatus}
                activeRoute={activeRoute}
                nearestBailout={nearestBailout}
                tileW={layout.tileW}
                tileH={layout.tileH}
              />
            </View>

            <View style={{ height: GRID_GAP }} />

            {/* Row 2 */}
            <View style={styles.gridRow}>
              <TileFuelRange
                trip={activeTrip}
                activeExpeditionId={activeExpeditionId}
                distanceRemaining={liveDistanceRemaining}
                tileW={layout.tileW}
                tileH={layout.tileH}
              />
              <View style={{ width: GRID_GAP }} />
              <TileLoadoutReadiness
                trip={activeTrip}
                loadItems={loadItems}
                tileW={layout.tileW}
                tileH={layout.tileH}
              />
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },

  // ── Trailhead Header ─────────────────────────────────────
  headerStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 34,
    paddingHorizontal: OUTER_PAD,
    borderBottomWidth: 1,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  headerName: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    flex: 1,
  },
  headerCenter: {
    paddingHorizontal: 8,
  },
  modeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  modeBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 2,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusIcon: {
    width: 20,
    height: 20,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Vehicle Hero ─────────────────────────────────────────
  heroContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  vehiclePreview: {
    alignItems: 'center',
  },
  groundLine: {
    width: '60%',
    maxWidth: 200,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 2,
  },
  heroLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  heroVehicleName: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  heroVehicleMeta: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  // ── Micro Health Row ─────────────────────────────────────
  microRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    height: 28,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    marginHorizontal: OUTER_PAD,
  },
  microItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  microValue: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Courier',
  },
  microLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },

  // ── Grid Container ───────────────────────────────────────
  gridContainer: {
    flex: 1,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },

  // ── Tile (shared) ────────────────────────────────────────
  tile: {
    borderRadius: TILE_RADIUS,
    backgroundColor: TACTICAL.panel,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: TILE_PAD,
    paddingTop: TILE_PAD - 4,
    paddingBottom: 4,
    borderBottomWidth: 0.75,
    borderBottomColor: GOLD_RAIL.internal,
  },

  tileTitle: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 2,
    flex: 1,
  },
  tileBody: {
    flex: 1,
    paddingHorizontal: TILE_PAD,
    paddingVertical: 6,
    justifyContent: 'center',
  },

  // ── Metric styles ────────────────────────────────────────
  primaryMetric: {
    fontSize: 22,
    fontWeight: '900',
    fontFamily: 'Courier',
    lineHeight: 26,
  },
  metricUnit: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  notConfigured: {
    fontSize: 9,
    fontWeight: '600',
    fontStyle: 'italic',
  },

  // ── Progress bar ─────────────────────────────────────────
  progressOuter: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 2,
    overflow: 'hidden',
    marginVertical: 4,
  },
  progressInner: {
    height: '100%',
    borderRadius: 2,
  },

  // ── Secondary rows ───────────────────────────────────────
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 1,
  },
  secondaryLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
  },
  secondaryValue: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Courier',
    flexShrink: 1,
  },

  // ── Status badge ─────────────────────────────────────────
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  statusDotSmall: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  statusBadgeText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // ── Warning badge ────────────────────────────────────────
  warningBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  warningText: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1,
  },

  // ── Attitude-specific ────────────────────────────────────
  sensorDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  calBadge: {
    fontSize: 6,
    fontWeight: '900',
    letterSpacing: 1,
    marginLeft: 2,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  attitudeMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
  attMetric: {
    flex: 1,
    alignItems: 'center',
  },
  attDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  attLabel: {
    fontSize: 7,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 1,
  },
  attValue: {
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Courier',
  },
  rateText: {
    fontSize: 7,
    fontWeight: '700',
    fontFamily: 'Courier',
    marginTop: 1,
  },
  tiltRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginVertical: 2,
  },
  tiltValue: {
    fontSize: 8,
    fontWeight: '700',
    fontFamily: 'Courier',
    textAlign: 'center',
    letterSpacing: 1,
  },
  peakText: {
    fontSize: 7,
    fontWeight: '600',
    fontFamily: 'Courier',
    letterSpacing: 0.5,
  },
  offlineHint: {
    fontSize: 6,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
});






