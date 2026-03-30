import { Trip, RiskScore, RiskResult, TripKPIs, LoadItem, Waypoint, RouteStats } from './types';


export function calculateKPIs(trip: Trip): TripKPIs {
  let missionDuration: number | null = null;
  if (trip.start_date && trip.end_date) {
    const start = new Date(trip.start_date);
    const end = new Date(trip.end_date);
    missionDuration = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  }

  let dailyFuelUse: number | null = null;
  if (trip.avg_miles_per_day && trip.capac_mpg && trip.capac_mpg > 0) {
    dailyFuelUse = trip.avg_miles_per_day / trip.capac_mpg;
  }

  let fuelDays: number | null = null;
  if (trip.capac_fuel_gal && dailyFuelUse && dailyFuelUse > 0) {
    fuelDays = trip.capac_fuel_gal / dailyFuelUse;
  }

  let waterDays: number | null = null;
  if (trip.capac_water_gal && trip.team_size && trip.water_use_per_person_day && trip.water_use_per_person_day > 0) {
    const dailyWater = trip.team_size * trip.water_use_per_person_day;
    if (dailyWater > 0) {
      waterDays = trip.capac_water_gal / dailyWater;
    }
  }

  let solarDailyReturn: number | null = null;
  if (trip.solar_watts && trip.sun_hours_per_day) {
    solarDailyReturn = trip.solar_watts * trip.sun_hours_per_day * (trip.solar_efficiency || 0.75);
  }

  let powerSustainable = false;
  let powerDays: number | null = null;
  // Assume daily consumption = battery_usable_wh (one full cycle per day)
  if (trip.battery_usable_wh && solarDailyReturn !== null) {
    if (solarDailyReturn >= trip.battery_usable_wh) {
      powerSustainable = true;
    } else {
      const deficit = trip.battery_usable_wh - solarDailyReturn;
      if (deficit > 0) {
        powerDays = trip.battery_usable_wh / deficit;
      }
    }
  }

  return { missionDuration, dailyFuelUse, fuelDays, waterDays, solarDailyReturn, powerSustainable, powerDays };
}

export function calculateRisk(rs: RiskScore): RiskResult {
  const weights = [0.25, 0.20, 0.20, 0.15, 0.20];
  const scores = [
    rs.terrain_complexity,
    rs.weather_exposure,
    rs.remoteness,
    rs.recovery_availability,
    rs.comms_coverage,
  ];
  const score = scores.reduce((sum, s, i) => sum + s * weights[i], 0);
  let level: RiskResult['level'] = 'Low';
  if (score >= 4.0) level = 'High';
  else if (score >= 3.0) level = 'Elevated';
  else if (score >= 2.0) level = 'Moderate';
  return { score, level };
}

export function getRiskColor(level: string): string {
  switch (level) {
    case 'Low': return '#34C759';
    case 'Moderate': return '#FFD700';
    case 'Elevated': return '#FF9500';
    case 'High': return '#FF3B30';
    default: return '#999';
  }
}

export function getActiveItems(items: LoadItem[], activeMode: string): LoadItem[] {
  return items.filter(i => i.mode === activeMode || i.mode === 'Both');
}

export function getPackingStats(items: LoadItem[], activeMode: string) {
  const active = getActiveItems(items, activeMode);
  const totalActive = active.length;
  const packedActive = active.filter(i => i.packed).length;
  const pct = totalActive > 0 ? Math.round((packedActive / totalActive) * 100) : 0;
  return { totalActive, packedActive, pct };
}

export function getRoofStats(items: LoadItem[], settings?: { roof_load_threshold_lbs: number; roof_share_warn: number; roof_share_alert: number }) {
  const roofItems = items.filter(i => i.zone === 'Roof' && i.weight_lbs);
  const roofLoad = roofItems.reduce((s, i) => s + (i.weight_lbs || 0) * i.qty, 0);
  const allWeighted = items.filter(i => i.weight_lbs);
  const totalLoad = allWeighted.reduce((s, i) => s + (i.weight_lbs || 0) * i.qty, 0);
  const roofShare = totalLoad > 0 ? roofLoad / totalLoad : 0;

  const threshold = settings?.roof_load_threshold_lbs || 250;
  const warnShare = settings?.roof_share_warn || 0.12;
  const alertShare = settings?.roof_share_alert || 0.18;

  let advisory: 'OK' | 'Moderate' | 'High' = 'OK';
  if (roofLoad > threshold || roofShare > alertShare) advisory = 'High';
  else if (roofShare > warnShare) advisory = 'Moderate';

  return { roofLoad, totalLoad, roofShare, advisory };
}



// ========== GPS / ROUTE CALCULATIONS ==========

/** Haversine distance between two GPS coordinates in miles */
export function haversineDistanceMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

/** Calculate distance between consecutive waypoints */
export function calculateSegmentDistance(wp1: Waypoint, wp2: Waypoint): number {
  return haversineDistanceMiles(wp1.latitude, wp1.longitude, wp2.latitude, wp2.longitude);
}

/** Calculate total route distance from an ordered array of waypoints */
export function calculateTotalDistance(waypoints: Waypoint[]): number {
  if (waypoints.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < waypoints.length; i++) {
    total += calculateSegmentDistance(waypoints[i - 1], waypoints[i]);
  }
  return total;
}

/** Full route statistics from waypoints + trip planned distance */
export function calculateRouteStats(waypoints: Waypoint[], plannedMiles: number | null): RouteStats {
  const totalDistanceMiles = calculateTotalDistance(waypoints);
  const waypointCount = waypoints.length;

  // Unique sessions
  const sessions = new Set<string>();
  waypoints.forEach(w => { if (w.session_id) sessions.add(w.session_id); });
  const sessionCount = sessions.size;

  // Completion percentage
  const completionPct = plannedMiles && plannedMiles > 0
    ? Math.min(Math.round((totalDistanceMiles / plannedMiles) * 100), 999)
    : null;

  // Average speed (from waypoints that have speed data, convert m/s to mph)
  const withSpeed = waypoints.filter(w => w.speed != null && w.speed >= 0);
  const avgSpeedMph = withSpeed.length > 0
    ? withSpeed.reduce((sum, w) => sum + (w.speed || 0) * 2.237, 0) / withSpeed.length
    : null;

  // Max altitude (meters to feet)
  const withAlt = waypoints.filter(w => w.altitude != null);
  const maxAltitudeFt = withAlt.length > 0
    ? Math.max(...withAlt.map(w => (w.altitude || 0) * 3.281))
    : null;

  // Elapsed time
  let elapsedTimeHrs: number | null = null;
  if (waypoints.length >= 2) {
    const first = new Date(waypoints[0].recorded_at).getTime();
    const last = new Date(waypoints[waypoints.length - 1].recorded_at).getTime();
    elapsedTimeHrs = (last - first) / (1000 * 60 * 60);
  }

  return {
    totalDistanceMiles,
    plannedDistanceMiles: plannedMiles,
    completionPct,
    waypointCount,
    avgSpeedMph,
    maxAltitudeFt,
    elapsedTimeHrs,
    sessionCount,
  };
}

/** Format coordinates for display */
export function formatCoord(val: number, isLat: boolean): string {
  const dir = isLat ? (val >= 0 ? 'N' : 'S') : (val >= 0 ? 'E' : 'W');
  return `${Math.abs(val).toFixed(6)}${dir}`;
}

/** Format elapsed time */
export function formatDuration(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m`;
  const h = Math.floor(hours);
  const m = Math.round((hours - h) * 60);
  return `${h}h ${m}m`;
}

