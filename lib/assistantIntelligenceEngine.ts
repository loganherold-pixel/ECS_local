/**
 * ECS Expedition Intelligence Engine
 * ═══════════════════════════════════════════════════════════════
 *
 * Core intelligence layer for the Expedition Intelligence system.
 * Monitors key ECS systems and generates short, high-value advisories
 * for the Dashboard Expedition Intelligence Bar.
 *
 * This engine acts as a calm expedition co-pilot, monitoring vehicle
 * data, route context, environment, and expedition resources. It
 * surfaces short, glanceable advisories that feel professional,
 * restrained, and helpful — never chatty or intrusive.
 *
 * Monitored Systems (9 reactive evaluators):
 *   1. Vehicle Attitude Monitor (tilt angles)
 *   2. Fuel Monitoring (level, range, route sufficiency)
 *   3. Water Monitoring (level, autonomy)
 *   4. Power Monitoring (battery, estimated hours)
 *   5. Remoteness Engine (remoteness index, services distance)
 *   6. Navigation System (route, waypoints, GPS, altitude)
 *   7. Weather Awareness (conditions, wind, temperature)
 *   8. Signal / Connectivity (cell, internet reachability)
 *   9. Expedition Status (progress, duration, state)
 *
 * Predictive Intelligence Layer:
 *   Analyzes upcoming route segments (5–20 miles / 10–30 minutes)
 *   to generate forward-looking advisories about terrain, resources,
 *   connectivity, weather, and timing.
 *
 * Message Categories:
 *   ALERT    — High priority, may require immediate attention
 *   ADVISORY — Helpful expedition insights or recommendations
 *   STANDBY  — Low-priority reassurance when no alerts exist
 *
 * Confidence Levels:
 *   HIGH     — Data is fresh and reliable
 *   MODERATE — Data may be slightly stale or inferred
 *   LOW      — Speculative or uncertain insight
 *
 * Personality: Calm, professional, tactical, minimal.
 *   Good: "Fuel reserves may be insufficient for remaining route."
 *   Bad:  "Looks like you might run out of gas!"
 *
 * Future-Ready Hooks:
 *   - Terrain risk forecasting
 *   - Seasonal trail conditions
 *   - Wildfire / closure alerts
 *   - Snowpack conditions
 *   - User driving style adaptation
 *   - Vehicle capability profiles
 *   - Crowd-sourced expedition reports
 */

import type { AdvisoryMessage, AdvisoryMode } from './advisoryStore';
import { buildEnvironmentSnapshot } from './environmentSnapshotService';
import {
  evaluatePredictive,
  buildRouteSegmentsAhead,
  estimateRemotenessTrend,
  detectCanyonTerrain,
  type PredictiveContext,
  type PredictiveMessage,
} from './predictiveIntelligenceEngine';

export type ConfidenceLevel = 'high' | 'moderate' | 'low';


// ── Intelligence Context ─────────────────────────────────────
// Comprehensive snapshot of all ECS system states.
// The dashboard feeds this to the engine on each evaluation cycle.

export interface IntelligenceContext {
  // ── Expedition State ──────────────────────────────────
  expeditionState: 'standby' | 'active' | 'paused' | 'complete';
  expeditionElapsedSec?: number;
  expeditionDistanceM?: number;

  // ── Vehicle Attitude ──────────────────────────────────
  /** Roll angle in degrees (absolute) */
  rollDeg?: number;
  /** Pitch angle in degrees (absolute) */
  pitchDeg?: number;
  /** Whether accelerometer is active */
  sensorActive?: boolean;

  // ── Resources ─────────────────────────────────────────
  /** Fuel level percentage (0–100) */
  fuelPercent?: number | null;
  /** Fuel range in miles */
  fuelRangeMi?: number | null;
  /** Whether fuel is configured */
  fuelConfigured?: boolean;
  /** Water level percentage (0–100) */
  waterPercent?: number | null;
  /** Water autonomy in days */
  waterAutonomyDays?: number | null;
  /** Whether water is configured */
  waterConfigured?: boolean;
  /** Power/battery percentage (0–100) */
  powerPercent?: number | null;
  /** Power estimated hours remaining */
  powerEstHours?: number | null;
  /** Whether power is configured */
  powerConfigured?: boolean;

  // ── Remoteness ────────────────────────────────────────
  /** Remoteness score (0–100) */
  remotenessScore?: number;
  /** Remoteness tier label */
  remotenessTier?: string;
  /** Connectivity state from remoteness engine */
  connectivityState?: 'online' | 'offline' | 'degraded' | 'unknown';

  // ── Navigation ────────────────────────────────────────
  /** Whether an active route is loaded */
  hasActiveRoute?: boolean;
  /** Route distance remaining in miles */
  routeDistanceRemainingMi?: number | null;
  /** Route total distance in miles */
  routeTotalDistanceMi?: number | null;
  /** Current speed in mph */
  speedMph?: number | null;
  /** Current altitude in feet */
  altitudeFt?: number | null;
  /** GPS fix quality */
  gpsFixQuality?: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
  /** GPS status */
  gpsStatus?: string;

  // ── Weather ───────────────────────────────────────────
  /** Current weather condition (clear, rain, snow, storm, etc.) */
  weatherCondition?: string | null;
  /** Wind speed in mph */
  windSpeedMph?: number | null;
  /** Temperature in Fahrenheit */
  temperatureF?: number | null;
  /** Whether weather data is fresh */
  weatherFresh?: boolean;

  // ── Connectivity ──────────────────────────────────────
  /** Is device online */
  isOnline?: boolean;
  /** Signal strength estimate (0–100) */
  signalStrength?: number | null;
  /** Network type */
  networkType?: 'wifi' | 'cellular' | 'ethernet' | 'none' | 'unknown';
  /** Internet reachable (verified via ping) */
  internetReachable?: boolean;
  /** Latency in ms */
  latencyMs?: number | null;

  // ── Time Context ──────────────────────────────────────
  /** Time of day */
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  /** Hours until sunset (approximate) */
  hoursUntilSunset?: number | null;

  // ── Vehicle Build (future-ready) ──────────────────────
  /** Vehicle type for capability assessment */
  vehicleType?: 'stock_suv' | 'built_4x4' | 'expedition_rig' | 'unknown';
}

// ── Intelligence Message (extends AdvisoryMessage) ───────────

export interface IntelligenceMessage {
  id: string;
  text: string;
  mode: AdvisoryMode;
  priority: number;
  icon?: string;
  displayDuration?: number;
  interruptible?: boolean;
  /** Confidence level for this insight */
  confidence: ConfidenceLevel;
  /** Source system that generated this message */
  source: IntelligenceSource;
  /** Timestamp of evaluation */
  evaluatedAt: number;
}

export type IntelligenceSource =
  | 'attitude'
  | 'fuel'
  | 'water'
  | 'power'
  | 'remoteness'
  | 'navigation'
  | 'weather'
  | 'connectivity'
  | 'expedition'
  | 'predictive'
  | 'standby';

// ── Evaluation Result ────────────────────────────────────────

export interface EvaluationResult {
  messages: IntelligenceMessage[];
  /** Number of systems evaluated */
  systemsEvaluated: number;
  /** Number of messages generated before filtering */
  rawMessageCount: number;
  /** Number of messages after filtering */
  filteredMessageCount: number;
  /** Timestamp of evaluation */
  evaluatedAt: number;
}

// ── Internal: Message History for Diversity ───────────────────

interface MessageHistory {
  id: string;
  shownAt: number;
  count: number;
}

// ══════════════════════════════════════════════════════════════
// INTELLIGENCE ENGINE
// ══════════════════════════════════════════════════════════════

const TAG = '[AI_INTEL]';

// Message history for diversity weighting
const _messageHistory: Map<string, MessageHistory> = new Map();
const HISTORY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SHOWS_PER_WINDOW = 2;

// Previous context for delta detection
let _prevContext: IntelligenceContext | null = null;

// Evaluation counter for rotation
let _evalCounter = 0;

// ── Confidence Helpers ───────────────────────────────────────

function confidenceForFreshness(isFresh: boolean): ConfidenceLevel {
  return isFresh ? 'high' : 'moderate';
}

function confidenceForSensor(isActive: boolean): ConfidenceLevel {
  return isActive ? 'high' : 'low';
}

// ── Message Factory ──────────────────────────────────────────

function makeMessage(
  id: string,
  text: string,
  mode: AdvisoryMode,
  priority: number,
  source: IntelligenceSource,
  confidence: ConfidenceLevel,
  opts?: { icon?: string; displayDuration?: number; interruptible?: boolean }
): IntelligenceMessage {
  return {
    id,
    text,
    mode,
    priority,
    source,
    confidence,
    icon: opts?.icon,
    displayDuration: opts?.displayDuration ?? (mode === 'alert' ? 6000 : mode === 'advisory' ? 5000 : 4000),
    interruptible: opts?.interruptible ?? (mode !== 'alert'),
    evaluatedAt: Date.now(),
  };
}

// ══════════════════════════════════════════════════════════════
// SYSTEM EVALUATORS
// ══════════════════════════════════════════════════════════════

// ── 1. Vehicle Attitude Monitor ──────────────────────────────

function evaluateAttitude(ctx: IntelligenceContext): IntelligenceMessage[] {
  const msgs: IntelligenceMessage[] = [];
  if (!ctx.sensorActive) return msgs;

  const roll = ctx.rollDeg ?? 0;
  const pitch = ctx.pitchDeg ?? 0;
  const maxAngle = Math.max(Math.abs(roll), Math.abs(pitch));
  const confidence = confidenceForSensor(ctx.sensorActive ?? false);

  // ALERT: Critical tilt (>30°)
  if (maxAngle > 30) {
    msgs.push(makeMessage(
      'attitude-critical',
      'Vehicle tilt exceeds safe threshold — assess stability',
      'alert', 1, 'attitude', confidence,
      { icon: 'alert-circle-outline', interruptible: false }
    ));
  }
  // ALERT: Approaching unsafe (>25°)
  else if (maxAngle > 25) {
    msgs.push(makeMessage(
      'attitude-unsafe',
      'Vehicle tilt approaching unsafe angle',
      'alert', 1, 'attitude', confidence,
      { icon: 'alert-circle-outline', interruptible: false }
    ));
  }
  // ADVISORY: Warning zone (>18°)
  else if (maxAngle > 18) {
    msgs.push(makeMessage(
      'attitude-warning',
      'Vehicle tilt increasing — monitor stability',
      'advisory', 3, 'attitude', confidence,
      { icon: 'analytics-outline' }
    ));
  }
  // ADVISORY: Moderate tilt (>12°)
  else if (maxAngle > 12) {
    msgs.push(makeMessage(
      'attitude-moderate',
      'Terrain slope detected — stability nominal',
      'advisory', 5, 'attitude', confidence,
      { icon: 'analytics-outline' }
    ));
  }

  // Side angle specific
  if (Math.abs(roll) > 20 && Math.abs(roll) > Math.abs(pitch)) {
    msgs.push(makeMessage(
      'attitude-side-angle',
      'Side angle approaching limit — reduce speed',
      'alert', 2, 'attitude', confidence,
      { icon: 'alert-circle-outline' }
    ));
  }

  return msgs;
}

// ── 2. Resource Monitoring ───────────────────────────────────

function evaluateFuel(ctx: IntelligenceContext): IntelligenceMessage[] {
  const msgs: IntelligenceMessage[] = [];
  if (!ctx.fuelConfigured) return msgs;

  const pct = ctx.fuelPercent;
  if (pct == null) return msgs;

  const range = ctx.fuelRangeMi;
  const routeRemaining = ctx.routeDistanceRemainingMi;

  // ALERT: Critically low (<10%)
  if (pct < 10) {
    msgs.push(makeMessage(
      'fuel-critical',
      'Fuel level critically low — plan immediate resupply',
      'alert', 1, 'fuel', 'high',
      { icon: 'speedometer-outline', interruptible: false }
    ));
  }
  // ALERT: Low fuel (<20%)
  else if (pct < 20) {
    msgs.push(makeMessage(
      'fuel-low',
      'Fuel reserves below safe operating level',
      'alert', 2, 'fuel', 'high',
      { icon: 'speedometer-outline' }
    ));
  }
  // ADVISORY: Getting low (<35%)
  else if (pct < 35) {
    msgs.push(makeMessage(
      'fuel-advisory',
      'Fuel reserves approaching limit — monitor consumption',
      'advisory', 3, 'fuel', 'high',
      { icon: 'speedometer-outline' }
    ));
  }

  // ALERT: Range insufficient for route
  if (range != null && routeRemaining != null && range < routeRemaining * 1.15) {
    msgs.push(makeMessage(
      'fuel-range-insufficient',
      'Fuel range may be insufficient for remaining route',
      'alert', 2, 'fuel', 'high',
      { icon: 'speedometer-outline' }
    ));
  }

  // ADVISORY: Fuel station availability limited in remote areas
  if (pct < 50 && ctx.remotenessScore != null && ctx.remotenessScore > 50) {
    msgs.push(makeMessage(
      'fuel-remote-advisory',
      'Fuel station availability limited in current area',
      'advisory', 4, 'fuel', 'moderate',
      { icon: 'speedometer-outline' }
    ));
  }

  return msgs;
}

function evaluateWater(ctx: IntelligenceContext): IntelligenceMessage[] {
  const msgs: IntelligenceMessage[] = [];
  if (!ctx.waterConfigured) return msgs;

  const pct = ctx.waterPercent;
  const autonomy = ctx.waterAutonomyDays;

  // ALERT: Critically low water
  if (pct != null && pct < 15) {
    msgs.push(makeMessage(
      'water-critical',
      'Water reserves critically low — resupply required',
      'alert', 1, 'water', 'high',
      { icon: 'water-outline', interruptible: false }
    ));
  }
  // ALERT: Low water
  else if (pct != null && pct < 25) {
    msgs.push(makeMessage(
      'water-low',
      'Water reserves below target level',
      'alert', 2, 'water', 'high',
      { icon: 'water-outline' }
    ));
  }
  // ADVISORY: Approaching limit
  else if (pct != null && pct < 40) {
    msgs.push(makeMessage(
      'water-advisory',
      'Water reserves approaching limit — plan resupply',
      'advisory', 3, 'water', 'high',
      { icon: 'water-outline' }
    ));
  }

  // ADVISORY: Autonomy running low
  if (autonomy != null && autonomy < 1) {
    msgs.push(makeMessage(
      'water-autonomy-critical',
      'Water autonomy below one day — immediate resupply needed',
      'alert', 1, 'water', 'high',
      { icon: 'water-outline', interruptible: false }
    ));
  } else if (autonomy != null && autonomy < 2) {
    msgs.push(makeMessage(
      'water-autonomy-low',
      `Water autonomy at ${autonomy.toFixed(1)} days — plan resupply`,
      'advisory', 3, 'water', 'high',
      { icon: 'water-outline' }
    ));
  }

  return msgs;
}

function evaluatePower(ctx: IntelligenceContext): IntelligenceMessage[] {
  const msgs: IntelligenceMessage[] = [];
  if (!ctx.powerConfigured) return msgs;

  const pct = ctx.powerPercent;
  const hours = ctx.powerEstHours;

  // ALERT: Critically low
  if (pct != null && pct < 10) {
    msgs.push(makeMessage(
      'power-critical',
      'Battery critically low — conserve power immediately',
      'alert', 1, 'power', 'high',
      { icon: 'battery-dead-outline', interruptible: false }
    ));
  }
  // ALERT: Low
  else if (pct != null && pct < 20) {
    msgs.push(makeMessage(
      'power-low',
      'Battery level low — reduce non-essential draw',
      'alert', 2, 'power', 'high',
      { icon: 'battery-half-outline' }
    ));
  }
  // ADVISORY: Getting low
  else if (pct != null && pct < 35) {
    msgs.push(makeMessage(
      'power-advisory',
      'Battery discharge rate elevated — monitor usage',
      'advisory', 3, 'power', 'high',
      { icon: 'battery-half-outline' }
    ));
  }

  // ADVISORY: Low estimated hours
  if (hours != null && hours < 4) {
    msgs.push(makeMessage(
      'power-hours-low',
      `Estimated ${hours.toFixed(1)} hours of power remaining`,
      'advisory', 3, 'power', 'high',
      { icon: 'battery-half-outline' }
    ));
  }

  return msgs;
}

// ── 3. Remoteness Engine ─────────────────────────────────────

function evaluateRemoteness(ctx: IntelligenceContext): IntelligenceMessage[] {
  const msgs: IntelligenceMessage[] = [];
  const score = ctx.remotenessScore;
  if (score == null) return msgs;

  // ADVISORY: Entering remote zone
  if (score > 70) {
    msgs.push(makeMessage(
      'remote-deep',
      'Deep remote zone — emergency services distance increasing',
      'advisory', 3, 'remoteness', 'high',
      { icon: 'compass-outline' }
    ));
  }
  // ADVISORY: Remote area
  else if (score > 50) {
    msgs.push(makeMessage(
      'remote-moderate',
      'Remote terrain ahead — limited infrastructure expected',
      'advisory', 4, 'remoteness', 'high',
      { icon: 'compass-outline' }
    ));
  }
  // ADVISORY: Entering backcountry
  else if (score > 30 && ctx.expeditionState === 'active') {
    msgs.push(makeMessage(
      'remote-backcountry',
      'Backcountry conditions — verify supplies and route',
      'advisory', 5, 'remoteness', 'high',
      { icon: 'trail-sign-outline' }
    ));
  }

  // ADVISORY: Remoteness increasing (delta detection)
  if (_prevContext?.remotenessScore != null && score > _prevContext.remotenessScore + 15) {
    msgs.push(makeMessage(
      'remote-increasing',
      'Remoteness level increasing — services becoming limited',
      'advisory', 4, 'remoteness', 'high',
      { icon: 'trending-up-outline' }
    ));
  }

  return msgs;
}

// ── 4. Navigation System ─────────────────────────────────────

function evaluateNavigation(ctx: IntelligenceContext): IntelligenceMessage[] {
  const msgs: IntelligenceMessage[] = [];

  // GPS status
  if (ctx.gpsFixQuality === 'NONE' || ctx.gpsStatus === 'OFFLINE') {
    msgs.push(makeMessage(
      'gps-lost',
      'GPS signal lost — navigation may be unreliable',
      'alert', 2, 'navigation', 'high',
      { icon: 'navigate-outline', interruptible: false }
    ));
  } else if (ctx.gpsFixQuality === 'LOW') {
    msgs.push(makeMessage(
      'gps-low',
      'GPS accuracy reduced — position may drift',
      'advisory', 4, 'navigation', 'moderate',
      { icon: 'navigate-outline' }
    ));
  }

  // Route progress
  if (ctx.hasActiveRoute && ctx.routeDistanceRemainingMi != null) {
    const remaining = ctx.routeDistanceRemainingMi;

    if (remaining < 5) {
      msgs.push(makeMessage(
        'route-near-end',
        `${Math.round(remaining)} miles remaining on current route`,
        'advisory', 4, 'navigation', 'high',
        { icon: 'flag-outline' }
      ));
    } else if (remaining < 15) {
      msgs.push(makeMessage(
        'route-approaching-end',
        `Route distance remaining: ${Math.round(remaining)} miles`,
        'advisory', 5, 'navigation', 'high',
        { icon: 'navigate-outline' }
      ));
    }
  }

  // Altitude advisory
  if (ctx.altitudeFt != null && ctx.altitudeFt > 8000) {
    msgs.push(makeMessage(
      'high-elevation',
      `Elevation ${Math.round(ctx.altitudeFt).toLocaleString()} ft — reduced engine performance possible`,
      'advisory', 4, 'navigation', 'high',
      { icon: 'trending-up-outline' }
    ));
  }
  if (ctx.altitudeFt != null && ctx.altitudeFt > 10000) {
    msgs.push(makeMessage(
      'very-high-elevation',
      `High elevation ${Math.round(ctx.altitudeFt).toLocaleString()} ft — monitor vehicle performance`,
      'advisory', 3, 'navigation', 'high',
      { icon: 'trending-up-outline' }
    ));
  }

  // Sunset proximity
  if (ctx.hoursUntilSunset != null && ctx.hoursUntilSunset < 1.5 && ctx.expeditionState === 'active') {
    msgs.push(makeMessage(
      'sunset-approaching',
      'Estimated arrival near sunset — plan accordingly',
      'advisory', 4, 'navigation', 'moderate',
      { icon: 'sunny-outline' }
    ));
  }

  return msgs;
}

// ── 5. Weather Awareness ─────────────────────────────────────

function evaluateWeather(ctx: IntelligenceContext): IntelligenceMessage[] {
  const msgs: IntelligenceMessage[] = [];
  const confidence = confidenceForFreshness(ctx.weatherFresh ?? false);

  // Severe weather
  if (ctx.weatherCondition === 'storm' || ctx.weatherCondition === 'severe' || ctx.weatherCondition === 'thunderstorm') {
    msgs.push(makeMessage(
      'weather-severe',
      'Severe weather risk nearby — exercise caution',
      'alert', 2, 'weather', confidence,
      { icon: 'thunderstorm-outline' }
    ));
  }

  // Snow or freezing conditions
  if (ctx.weatherCondition === 'snow' || ctx.weatherCondition === 'sleet' || ctx.weatherCondition === 'freezing') {
    msgs.push(makeMessage(
      'weather-snow',
      'Snow or freezing conditions possible along route',
      'advisory', 3, 'weather', confidence,
      { icon: 'snow-outline' }
    ));
  }

  // Rain
  if (ctx.weatherCondition === 'rain' || ctx.weatherCondition === 'drizzle') {
    msgs.push(makeMessage(
      'weather-rain',
      'Rain expected — trail conditions may be affected',
      'advisory', 4, 'weather', confidence,
      { icon: 'rainy-outline' }
    ));
  }

  // High winds
  if (ctx.windSpeedMph != null && ctx.windSpeedMph > 35) {
    msgs.push(makeMessage(
      'weather-high-wind',
      'High wind risk — reduce speed and secure cargo',
      'alert', 2, 'weather', confidence,
      { icon: 'flag-outline' }
    ));
  } else if (ctx.windSpeedMph != null && ctx.windSpeedMph > 20) {
    msgs.push(makeMessage(
      'weather-wind',
      'High winds expected along route',
      'advisory', 4, 'weather', confidence,
      { icon: 'flag-outline' }
    ));
  }

  // Temperature extremes
  if (ctx.temperatureF != null) {
    if (ctx.temperatureF > 105) {
      msgs.push(makeMessage(
        'weather-extreme-heat',
        'Extreme heat conditions — monitor engine temperature',
        'alert', 2, 'weather', confidence,
        { icon: 'thermometer-outline' }
      ));
    } else if (ctx.temperatureF > 95) {
      msgs.push(makeMessage(
        'weather-heat',
        'High temperature conditions — ensure adequate hydration',
        'advisory', 4, 'weather', confidence,
        { icon: 'thermometer-outline' }
      ));
    } else if (ctx.temperatureF < 20) {
      msgs.push(makeMessage(
        'weather-extreme-cold',
        'Extreme cold conditions — monitor battery and fluid levels',
        'alert', 3, 'weather', confidence,
        { icon: 'thermometer-outline' }
      ));
    } else if (ctx.temperatureF < 35) {
      msgs.push(makeMessage(
        'weather-cold',
        'Rapid temperature drop expected — prepare for cold conditions',
        'advisory', 4, 'weather', confidence,
        { icon: 'thermometer-outline' }
      ));
    }
  }

  // Evening temperature drop
  if (ctx.timeOfDay === 'evening' && ctx.temperatureF != null && ctx.temperatureF < 50) {
    msgs.push(makeMessage(
      'weather-evening-cold',
      'Temperature drop expected this evening',
      'advisory', 5, 'weather', confidence,
      { icon: 'moon-outline' }
    ));
  }

  return msgs;
}

// ── 6. Signal / Connectivity ─────────────────────────────────

function evaluateConnectivity(ctx: IntelligenceContext): IntelligenceMessage[] {
  const msgs: IntelligenceMessage[] = [];

  // Offline
  if (ctx.isOnline === false || ctx.connectivityState === 'offline') {
    msgs.push(makeMessage(
      'connectivity-offline',
      'Signal lost — offline mode active',
      'advisory', 3, 'connectivity', 'high',
      { icon: 'cloud-offline-outline' }
    ));
  }
  // Degraded
  else if (ctx.connectivityState === 'degraded') {
    msgs.push(makeMessage(
      'connectivity-degraded',
      'Connectivity degraded — data sync may be delayed',
      'advisory', 4, 'connectivity', 'high',
      { icon: 'cellular-outline' }
    ));
  }
  // Low signal
  else if (ctx.signalStrength != null && ctx.signalStrength < 20) {
    msgs.push(makeMessage(
      'connectivity-weak',
      'Low signal coverage expected ahead',
      'advisory', 4, 'connectivity', 'moderate',
      { icon: 'cellular-outline' }
    ));
  }

  // High latency
  if (ctx.latencyMs != null && ctx.latencyMs > 2000 && ctx.isOnline) {
    msgs.push(makeMessage(
      'connectivity-latency',
      'Network latency elevated — data updates may be slow',
      'advisory', 5, 'connectivity', 'moderate',
      { icon: 'cellular-outline' }
    ));
  }

  // Reconnected (delta detection)
  if (_prevContext?.isOnline === false && ctx.isOnline === true) {
    msgs.push(makeMessage(
      'connectivity-reconnected',
      'Reconnected to cellular network',
      'advisory', 5, 'connectivity', 'high',
      { icon: 'wifi-outline' }
    ));
  }

  // Cellular generation degradation
  if (ctx.networkType === 'cellular' && ctx.signalStrength != null && ctx.signalStrength < 40) {
    msgs.push(makeMessage(
      'connectivity-cell-weak',
      'Cellular signal weakening — coverage may be intermittent',
      'advisory', 4, 'connectivity', 'moderate',
      { icon: 'cellular-outline' }
    ));
  }

  return msgs;
}

// ── 7. Expedition Status ─────────────────────────────────────

function evaluateExpedition(ctx: IntelligenceContext): IntelligenceMessage[] {
  const msgs: IntelligenceMessage[] = [];

  // Expedition just started (delta detection)
  if (_prevContext?.expeditionState !== 'active' && ctx.expeditionState === 'active') {
    msgs.push(makeMessage(
      'expedition-started',
      'Expedition route loaded — tracking active',
      'advisory', 5, 'expedition', 'high',
      { icon: 'compass-outline' }
    ));
  }

  // Expedition paused
  if (ctx.expeditionState === 'paused') {
    msgs.push(makeMessage(
      'expedition-paused',
      'Expedition paused — resume when ready',
      'advisory', 5, 'expedition', 'high',
      { icon: 'pause-circle-outline' }
    ));
  }

  // Long expedition duration
  if (ctx.expeditionState === 'active' && ctx.expeditionElapsedSec != null) {
    const hours = ctx.expeditionElapsedSec / 3600;
    if (hours > 8) {
      msgs.push(makeMessage(
        'expedition-long-duration',
        'Extended expedition duration — consider rest stop',
        'advisory', 4, 'expedition', 'high',
        { icon: 'time-outline' }
      ));
    }
  }

  // Evening camp suggestion
  if (ctx.timeOfDay === 'evening' && ctx.expeditionState === 'active') {
    msgs.push(makeMessage(
      'expedition-evening-camp',
      'Evening approaching — consider identifying camp location',
      'advisory', 5, 'expedition', 'moderate',
      { icon: 'moon-outline' }
    ));
  }

  // Night driving
  if (ctx.timeOfDay === 'night' && ctx.expeditionState === 'active' && ctx.speedMph != null && ctx.speedMph > 5) {
    msgs.push(makeMessage(
      'expedition-night-driving',
      'Night conditions — reduced visibility on unpaved routes',
      'advisory', 4, 'expedition', 'moderate',
      { icon: 'moon-outline' }
    ));
  }

  return msgs;
}

// ── 8. Standby Messages ──────────────────────────────────────

function generateStandbyMessages(ctx: IntelligenceContext): IntelligenceMessage[] {
  // Rotate through standby messages to add variety
  const standbyPool: IntelligenceMessage[] = [
    makeMessage('standby-normal', 'All systems normal', 'standby', 6, 'standby', 'high',
      { icon: 'shield-checkmark-outline' }),
    makeMessage('standby-clear', 'No active advisories', 'standby', 6, 'standby', 'high',
      { icon: 'shield-checkmark-outline' }),
    makeMessage('standby-ready', 'Expedition profile stable', 'standby', 6, 'standby', 'high',
      { icon: 'shield-checkmark-outline' }),
    makeMessage('standby-monitoring', 'Navigation tracking active', 'standby', 6, 'standby', 'high',
      { icon: 'radio-outline' }),
    makeMessage('standby-telemetry', 'Telemetry connections healthy', 'standby', 6, 'standby', 'high',
      { icon: 'pulse-outline' }),
  ];

  // Add context-specific standby messages
  if (ctx.expeditionState === 'active') {
    standbyPool.push(
      makeMessage('standby-expedition', 'Expedition tracking active', 'standby', 6, 'standby', 'high',
        { icon: 'compass-outline' }),
    );
  }
  if (ctx.hasActiveRoute) {
    standbyPool.push(
      makeMessage('standby-route', 'Route guidance active', 'standby', 6, 'standby', 'high',
        { icon: 'navigate-outline' }),
    );
  }

  // Pick one based on rotation counter
  const idx = _evalCounter % standbyPool.length;
  return [standbyPool[idx]];
}

// ══════════════════════════════════════════════════════════════
// MESSAGE FILTERING
// ══════════════════════════════════════════════════════════════

/**
 * Filter messages based on:
 * - Diversity (don't repeat the same message too often)
 * - Confidence (low-confidence messages appear less frequently)
 * - Priority (keep highest priority when multiple compete)
 * - Overexposure (suppress frequently shown messages)
 */
function filterMessages(messages: IntelligenceMessage[]): IntelligenceMessage[] {
  const now = Date.now();

  // Clean up old history
  for (const [id, hist] of _messageHistory) {
    if (now - hist.shownAt > HISTORY_WINDOW_MS) {
      _messageHistory.delete(id);
    }
  }

  // Filter by overexposure
  let filtered = messages.filter(msg => {
    const hist = _messageHistory.get(msg.id);
    if (hist && hist.count >= MAX_SHOWS_PER_WINDOW) {
      return false; // Overexposed
    }
    return true;
  });

  // Low-confidence messages: only show every 3rd evaluation cycle
  filtered = filtered.filter(msg => {
    if (msg.confidence === 'low' && _evalCounter % 3 !== 0) {
      return false;
    }
    return true;
  });

  // Moderate-confidence messages: only show every 2nd evaluation cycle
  filtered = filtered.filter(msg => {
    if (msg.confidence === 'moderate' && msg.priority >= 5 && _evalCounter % 2 !== 0) {
      return false;
    }
    return true;
  });

  // Sort by priority (lower number = higher priority)
  filtered.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    // Break ties by confidence
    const confOrder: Record<ConfidenceLevel, number> = { high: 0, moderate: 1, low: 2 };
    return confOrder[a.confidence] - confOrder[b.confidence];
  });

  // Deduplicate: keep only the highest-priority message per source
  const seenSources = new Set<IntelligenceSource>();
  const deduped: IntelligenceMessage[] = [];
  for (const msg of filtered) {
    // Allow multiple messages from the same source only if they're alerts
    if (msg.mode === 'alert' || !seenSources.has(msg.source)) {
      deduped.push(msg);
      seenSources.add(msg.source);
    }
  }

  // Record shown messages in history
  for (const msg of deduped) {
    const existing = _messageHistory.get(msg.id);
    if (existing) {
      existing.count++;
      existing.shownAt = now;
    } else {
      _messageHistory.set(msg.id, { id: msg.id, shownAt: now, count: 1 });
    }
  }

  return deduped;
}
// ══════════════════════════════════════════════════════════════
// PREDICTIVE INTELLIGENCE BRIDGE
// ══════════════════════════════════════════════════════════════

/**
 * Convert PredictiveMessage[] to IntelligenceMessage[] for unified filtering.
 */
function convertPredictiveMessages(predMsgs: PredictiveMessage[]): IntelligenceMessage[] {
  return predMsgs.map(pm => ({
    id: pm.id,
    text: pm.text,
    mode: pm.mode,
    priority: pm.priority,
    icon: pm.icon,
    displayDuration: pm.displayDuration,
    interruptible: pm.interruptible ?? true,
    confidence: pm.confidence,
    source: 'predictive' as IntelligenceSource,
    evaluatedAt: Date.now(),
  }));
}

/**
 * Build a PredictiveContext from the IntelligenceContext.
 * Gathers route-ahead data for forward-looking analysis.
 */
function buildPredictiveContext(ctx: IntelligenceContext): PredictiveContext | null {
  // Only run predictive analysis when we have GPS + active route
  if (!ctx.hasActiveRoute) return null;

  const predCtx: PredictiveContext = {
    currentLat: null,
    currentLon: null,
    currentAltitudeFt: ctx.altitudeFt,
    currentSpeedMph: ctx.speedMph,
    routeDistanceRemainingMi: ctx.routeDistanceRemainingMi,
    fuelPercent: ctx.fuelPercent,
    fuelRangeMi: ctx.fuelRangeMi,
    waterPercent: ctx.waterPercent,
    waterAutonomyDays: ctx.waterAutonomyDays,
    powerPercent: ctx.powerPercent,
    currentRemotenessScore: ctx.remotenessScore,
    forecastWindMph: ctx.windSpeedMph,
    forecastTempF: ctx.temperatureF,
    forecastCondition: ctx.weatherCondition,
    hoursUntilSunset: ctx.hoursUntilSunset,
    timeOfDay: ctx.timeOfDay,
    vehicleType: ctx.vehicleType,
  };

  // Try to build route segments ahead from the active route
  try {
    const { routeStore } = require('./routeStore');
    const { gpsUIState } = require('./gpsUIState');

    const activeRoute = routeStore.getActive();
    const gps = gpsUIState.get();

    if (activeRoute?.segments && gps.hasFix && gps.position) {
      predCtx.currentLat = gps.position.latitude;
      predCtx.currentLon = gps.position.longitude;

      const segmentsAhead = buildRouteSegmentsAhead(
        activeRoute.segments,
        gps.position.latitude,
        gps.position.longitude,
        20 // 20 miles ahead
      );

      if (segmentsAhead.length > 0) {
        predCtx.routeSegmentsAhead = segmentsAhead;
        predCtx.remotenessTrend = estimateRemotenessTrend(
          segmentsAhead,
          ctx.remotenessScore ?? 0
        );
        predCtx.canyonTerrainAhead = detectCanyonTerrain(segmentsAhead);
      }
    }
  } catch {
    // Route/GPS data unavailable — predictive analysis will be limited
  }

  return predCtx;
}

// ══════════════════════════════════════════════════════════════
// PUBLIC API
// ══════════════════════════════════════════════════════════════

/**
 * Evaluate all ECS systems and generate advisory messages.
 * Includes both reactive (current state) and predictive (forward-looking) analysis.
 *
 * Called periodically by the dashboard (every 15s).
 * Returns an EvaluationResult with filtered, prioritized messages
 * ready to be fed to the advisory store.
 */
export function evaluateSystems(ctx: IntelligenceContext): EvaluationResult {
  _evalCounter++;
  const evaluatedAt = Date.now();

  // ── Gather messages from all reactive system evaluators ──
  const allMessages: IntelligenceMessage[] = [
    ...evaluateAttitude(ctx),
    ...evaluateFuel(ctx),
    ...evaluateWater(ctx),
    ...evaluatePower(ctx),
    ...evaluateRemoteness(ctx),
    ...evaluateNavigation(ctx),
    ...evaluateWeather(ctx),
    ...evaluateConnectivity(ctx),
    ...evaluateExpedition(ctx),
  ];

  // ── Predictive Intelligence Layer ──
  // Analyzes upcoming route segments (5–20 miles / 10–30 minutes ahead)
  // to generate forward-looking advisories. Only runs when an active
  // route is loaded and GPS has a fix.
  try {
    const predCtx = buildPredictiveContext(ctx);
    if (predCtx) {
      const predictiveMessages = evaluatePredictive(predCtx);
      const converted = convertPredictiveMessages(predictiveMessages);
      allMessages.push(...converted);
    }
  } catch {
    // Predictive engine failure — degrade gracefully, reactive messages still work
  }

  const rawMessageCount = allMessages.length;

  // ── Filter and prioritize (reactive + predictive merged) ──
  let filtered = filterMessages(allMessages);

  // ── If no actionable messages, add standby ──
  if (filtered.length === 0) {
    const standby = generateStandbyMessages(ctx);
    filtered = filterMessages(standby);
  }

  // ── Store previous context for delta detection ──
  _prevContext = { ...ctx };

  // 9 reactive + 1 predictive = 10 systems evaluated
  const systemsEvaluated = 10;

  return {
    messages: filtered,
    systemsEvaluated,
    rawMessageCount,
    filteredMessageCount: filtered.length,
    evaluatedAt,
  };
}


/**
 * Convert IntelligenceMessage to AdvisoryMessage format
 * for feeding into the advisory store.
 */
export function toAdvisoryMessages(
  intelligenceMessages: IntelligenceMessage[]
): Array<Omit<AdvisoryMessage, 'queuedAt'>> {
  return intelligenceMessages.map(msg => ({
    id: msg.id,
    text: msg.text,
    mode: msg.mode,
    priority: msg.priority,
    icon: msg.icon,
    displayDuration: msg.displayDuration,
    interruptible: msg.interruptible,
  }));
}

/**
 * Reset the intelligence engine state.
 * Called on unmount or when clearing the advisory system.
 */
export function resetIntelligence(): void {
  _prevContext = null;
  _evalCounter = 0;
  _messageHistory.clear();
}

/**
 * Get the current evaluation counter (for debugging/testing).
 */
export function getEvalCounter(): number {
  return _evalCounter;
}

/**
 * Determine the current time of day based on hour.
 */
export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

/**
 * Estimate hours until sunset from a coordinate-aware environment snapshot.
 * Longitude is required so ECS can resolve the coordinate timezone instead of
 * silently using the device timezone for another region.
 */
export function estimateHoursUntilSunset(
  latDeg?: number | null,
  lonDeg?: number | null,
  nowMs: number = Date.now(),
  deviceTimezoneId?: string | null,
): number | null {
  if (latDeg == null || lonDeg == null) return null;

  const snapshot = buildEnvironmentSnapshot({
    coordinate: {
      latitude: latDeg,
      longitude: lonDeg,
      source: 'gps',
      updatedAt: nowMs,
    },
    deviceTimezoneId,
    nowMs,
  });

  return snapshot.sunlight.remainingMinutes == null || snapshot.sunlight.nextEvent !== 'sunset'
    ? null
    : Math.round((snapshot.sunlight.remainingMinutes / 60) * 10) / 10;
}

