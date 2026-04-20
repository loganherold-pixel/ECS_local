/**
 * ECS AI Advisory Store
 * ─────────────────────────────────────────────────────────────
 * Tactical message engine for the Dashboard AI Advisory Bar.
 *
 * Three message modes:
 *   ALERT    — Safety-critical, expedition-critical warnings
 *   ADVISORY — Resource/vehicle status, route insights, recommendations
 *   STANDBY  — Neutral reassurance, no active advisories
 *
 * Timing rules:
 *   • Minimum 10s between new messages
 *   • Each message visible ~4–6s
 *   • Fade-in 300ms, fade-out 300ms
 *   • No rapid cycling or ticker behavior
 *
 * Priority order:
 *   1. Safety-critical warnings
 *   2. Expedition-critical advisories
 *   3. Resource / vehicle status alerts
 *   4. Route / remoteness / environmental insights
 *   5. Useful recommendations
 *   6. Neutral reassurance / standby
 *
 * Deduplication:
 *   • Suppresses repeated identical messages
 *   • Same message ID cannot appear within 60s
 *   • Overexposure penalty for frequently shown messages
 */

// ── Types ────────────────────────────────────────────────────

export type AdvisoryMode = 'alert' | 'advisory' | 'standby';

export interface AdvisoryMessage {
  /** Unique message identifier for deduplication */
  id: string;
  /** Display text — short, 1–2 lines max */
  text: string;
  /** Message mode determines visual treatment */
  mode: AdvisoryMode;
  /** Priority: 1 (highest) to 6 (lowest) */
  priority: number;
  /** Optional icon name (Ionicons) */
  icon?: string;
  /** Timestamp when message was queued */
  queuedAt: number;
  /** How long to display (ms). Default: 5000 */
  displayDuration?: number;
  /** Whether this message can be overridden by urgent messages */
  interruptible?: boolean;
}

export interface AdvisoryState {
  /** Currently displayed message (null = empty bar) */
  current: AdvisoryMessage | null;
  /** Whether the bar is in the visible (faded-in) state */
  isVisible: boolean;
  /** Whether the advisory bar feature is enabled */
  enabled: boolean;
  /** Simplified mode: fewer passive messages */
  simplifiedMode: boolean;
}

type Listener = (state: AdvisoryState) => void;

// ── Constants ────────────────────────────────────────────────

const MIN_INTERVAL_MS = 8_500;        // 8.5s minimum between messages
const DEFAULT_DISPLAY_MS = 6_500;     // 6.5s default display duration
const DEDUP_WINDOW_MS = 60_000;       // 60s dedup window for same message
const MAX_QUEUE_SIZE = 12;            // Max pending messages
const OVEREXPOSURE_LIMIT = 3;         // Max times a message can show per 5min
const OVEREXPOSURE_WINDOW_MS = 300_000; // 5 minute overexposure window

function normalizeAdvisoryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function advisoryFingerprint(message: Pick<AdvisoryMessage, 'mode' | 'text'>): string {
  return `${message.mode}:${normalizeAdvisoryText(message.text)}`;
}

function isEscalation(
  next: Pick<AdvisoryMessage, 'priority' | 'mode'>,
  previous: Pick<AdvisoryMessage, 'priority' | 'mode'> | null | undefined,
): boolean {
  if (!previous) return false;
  if (next.mode === 'alert' && previous.mode !== 'alert') return true;
  return next.priority < previous.priority;
}

// ── Advisory Store Singleton ─────────────────────────────────

class AdvisoryStore {
  private state: AdvisoryState = {
    current: null,
    isVisible: false,
    enabled: true,
    simplifiedMode: false,
  };

  private listeners: Set<Listener> = new Set();
  private queue: AdvisoryMessage[] = [];
  private lastShownAt = 0;
  private lastShownId: string | null = null;
  private displayTimer: ReturnType<typeof setTimeout> | null = null;
  private nextTimer: ReturnType<typeof setTimeout> | null = null;

  /** Track recent message IDs for deduplication */
  private recentMessages: Map<string, number> = new Map();

  /** Track semantic message fingerprints for cooldown and escalation */
  private recentFingerprints: Map<string, { shownAt: number; priority: number; mode: AdvisoryMode }> = new Map();

  /** Track message show counts for overexposure penalty */
  private showCounts: Map<string, { count: number; firstShown: number }> = new Map();

  // ── Public API ───────────────────────────────────────────

  getState(): AdvisoryState {
    return { ...this.state };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Enable or disable the advisory bar */
  setEnabled(enabled: boolean): void {
    this.state.enabled = enabled;
    if (!enabled) {
      this.clearCurrent();
      this.queue = [];
    }
    this.notify();
  }

  /** Toggle simplified mode (fewer passive messages) */
  setSimplifiedMode(simplified: boolean): void {
    this.state.simplifiedMode = simplified;
    this.notify();
  }

  /**
   * Push a new advisory message into the system.
   * The engine decides when and whether to display it.
   */
  push(message: Omit<AdvisoryMessage, 'queuedAt'>): void {
    if (!this.state.enabled) return;

    // In simplified mode, suppress low-priority messages (5+)
    if (this.state.simplifiedMode && message.priority >= 5) return;

    const fullMessage: AdvisoryMessage = {
      ...message,
      queuedAt: Date.now(),
      displayDuration: message.displayDuration ?? DEFAULT_DISPLAY_MS,
      interruptible: message.interruptible ?? true,
    };
    const fingerprint = advisoryFingerprint(fullMessage);
    const currentFingerprint = this.state.current ? advisoryFingerprint(this.state.current) : null;
    const recentFingerprint = this.recentFingerprints.get(fingerprint);
    const queuedIndex = this.queue.findIndex((entry) => advisoryFingerprint(entry) === fingerprint);

    // ── Deduplication check ──
    const lastSeen = this.recentMessages.get(message.id);
    const fingerprintShownRecently =
      recentFingerprint && Date.now() - recentFingerprint.shownAt < DEDUP_WINDOW_MS;
    const escalatedFingerprint = isEscalation(fullMessage, recentFingerprint ?? null);
    if (lastSeen && Date.now() - lastSeen < DEDUP_WINDOW_MS && !escalatedFingerprint) {
      return; // Suppress duplicate
    }
    if (fingerprintShownRecently && !escalatedFingerprint) {
      return; // Suppress semantic duplicate
    }

    if (currentFingerprint === fingerprint) {
      if (
        isEscalation(fullMessage, this.state.current) &&
        ((this.state.current?.interruptible ?? false) || fullMessage.mode === 'alert')
      ) {
        this.clearTimers();
        this.showMessage(fullMessage);
      }
      return;
    }

    if (queuedIndex >= 0) {
      const queuedMessage = this.queue[queuedIndex];
      if (isEscalation(fullMessage, queuedMessage)) {
        this.queue.splice(queuedIndex, 1, fullMessage);
      }
      return;
    }

    // ── Overexposure check ──
    const exposure = this.showCounts.get(fingerprint);
    if (exposure) {
      if (Date.now() - exposure.firstShown < OVEREXPOSURE_WINDOW_MS &&
          exposure.count >= OVEREXPOSURE_LIMIT) {
        return; // Overexposed — suppress
      }
    }

    // ── Urgent interrupt: Alert mode can override current Advisory/Standby ──
    if (message.mode === 'alert' && message.priority <= 2) {
      const current = this.state.current;
      if (current && current.interruptible && current.mode !== 'alert') {
        // Interrupt current message with urgent alert
        this.clearTimers();
        this.showMessage(fullMessage);
        return;
      }
    }

    // ── Add to priority queue ──
    this.queue.push(fullMessage);

    // Sort by priority (lower number = higher priority), then by queuedAt
    this.queue.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.queuedAt - b.queuedAt;
    });

    // Trim queue
    if (this.queue.length > MAX_QUEUE_SIZE) {
      this.queue = this.queue.slice(0, MAX_QUEUE_SIZE);
    }

    // If nothing is currently showing and enough time has passed, show next
    if (!this.state.current && !this.nextTimer) {
      this.scheduleNext();
    }
  }

  /**
   * Push a batch of contextual messages based on current system state.
   * Called periodically by the dashboard to feed the advisory engine.
   */
  pushContextBatch(messages: Array<Omit<AdvisoryMessage, 'queuedAt'>>): void {
    for (const msg of messages) {
      this.push(msg);
    }
  }

  /** Force clear the current message and queue */
  clear(): void {
    this.clearTimers();
    this.queue = [];
    this.recentMessages.clear();
    this.recentFingerprints.clear();
    this.showCounts.clear();
    this.clearCurrent();
  }

  /** Destroy the store (cleanup timers) */
  destroy(): void {
    this.clearTimers();
    this.listeners.clear();
    this.queue = [];
    this.recentMessages.clear();
    this.recentFingerprints.clear();
    this.showCounts.clear();
  }

  // ── Internal Engine ──────────────────────────────────────

  private scheduleNext(): void {
    const now = Date.now();
    const elapsed = now - this.lastShownAt;
    const delay = Math.max(0, MIN_INTERVAL_MS - elapsed);

    this.nextTimer = setTimeout(() => {
      this.nextTimer = null;
      this.processQueue();
    }, delay);
  }

  private processQueue(): void {
    if (!this.state.enabled) return;

    // Clean up stale dedup entries
    const now = Date.now();
    for (const [id, time] of this.recentMessages) {
      if (now - time > DEDUP_WINDOW_MS) {
        this.recentMessages.delete(id);
      }
    }
    for (const [fingerprint, data] of this.recentFingerprints) {
      if (now - data.shownAt > DEDUP_WINDOW_MS) {
        this.recentFingerprints.delete(fingerprint);
      }
    }

    // Clean up stale overexposure entries
    for (const [id, data] of this.showCounts) {
      if (now - data.firstShown > OVEREXPOSURE_WINDOW_MS) {
        this.showCounts.delete(id);
      }
    }

    // Find next eligible message
    const eligible = this.queue.shift();
    if (eligible) {
      this.showMessage(eligible);
    }
    // If queue is empty, do nothing — bar stays empty (standby)
  }

  private showMessage(message: AdvisoryMessage): void {
    const now = Date.now();
    const fingerprint = advisoryFingerprint(message);

    // Record in dedup map
    this.recentMessages.set(message.id, now);
    this.recentFingerprints.set(fingerprint, {
      shownAt: now,
      priority: message.priority,
      mode: message.mode,
    });

    // Record in overexposure map
    const existing = this.showCounts.get(fingerprint);
    if (existing) {
      existing.count++;
    } else {
      this.showCounts.set(fingerprint, { count: 1, firstShown: now });
    }

    // Update state
    this.state.current = message;
    this.state.isVisible = true;
    this.lastShownAt = now;
    this.lastShownId = message.id;
    this.notify();

    // Schedule fade-out after display duration
    const displayMs = message.displayDuration ?? DEFAULT_DISPLAY_MS;
    this.displayTimer = setTimeout(() => {
      this.displayTimer = null;
      this.fadeOut();
    }, displayMs);
  }

  private fadeOut(): void {
    this.state.isVisible = false;
    this.notify();

    // After fade-out animation completes (~350ms), clear message and check queue
    setTimeout(() => {
      this.state.current = null;
      this.notify();

      // Schedule next message if queue has items
      if (this.queue.length > 0) {
        this.scheduleNext();
      }
    }, 350);
  }

  private clearCurrent(): void {
    this.state.current = null;
    this.state.isVisible = false;
    this.notify();
  }

  private clearTimers(): void {
    if (this.displayTimer) {
      clearTimeout(this.displayTimer);
      this.displayTimer = null;
    }
    if (this.nextTimer) {
      clearTimeout(this.nextTimer);
      this.nextTimer = null;
    }
  }

  private notify(): void {
    const snapshot = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (e) {
        console.warn('[AdvisoryStore] Listener error:', e);
      }
    }
  }
}

// ── Singleton Export ──────────────────────────────────────────

export const advisoryStore = new AdvisoryStore();


// ── Message Factory Helpers ──────────────────────────────────
// Convenience functions for creating well-typed advisory messages.

export function createAlertMessage(
  id: string,
  text: string,
  opts?: { icon?: string; priority?: number; displayDuration?: number }
): Omit<AdvisoryMessage, 'queuedAt'> {
  return {
    id,
    text,
    mode: 'alert',
    priority: opts?.priority ?? 1,
    icon: opts?.icon ?? 'warning-outline',
    displayDuration: opts?.displayDuration ?? 6000,
    interruptible: false,
  };
}

export function createAdvisoryMessage(
  id: string,
  text: string,
  opts?: { icon?: string; priority?: number; displayDuration?: number }
): Omit<AdvisoryMessage, 'queuedAt'> {
  return {
    id,
    text,
    mode: 'advisory',
    priority: opts?.priority ?? 3,
    icon: opts?.icon ?? 'information-circle-outline',
    displayDuration: opts?.displayDuration ?? 5000,
    interruptible: true,
  };
}

export function createStandbyMessage(
  id: string,
  text: string,
  opts?: { icon?: string; displayDuration?: number }
): Omit<AdvisoryMessage, 'queuedAt'> {
  return {
    id,
    text,
    mode: 'standby',
    priority: 6,
    icon: opts?.icon ?? 'shield-checkmark-outline',
    displayDuration: opts?.displayDuration ?? 4000,
    interruptible: true,
  };
}



// ── Enhanced Advisory Context ────────────────────────────────
// Comprehensive system state snapshot for the Intelligence Engine.
// The dashboard feeds this on a periodic interval.

export interface AdvisoryContext {
  /** Current expedition state */
  expeditionState?: 'standby' | 'active' | 'paused' | 'complete';
  /** Expedition elapsed time in seconds */
  expeditionElapsedSec?: number;
  /** Expedition distance in meters */
  expeditionDistanceM?: number;

  // ── Vehicle Attitude ──────────────────────────────────
  /** Roll angle in degrees (absolute) */
  rollDeg?: number;
  /** Pitch angle in degrees (absolute) */
  pitchDeg?: number;
  /** Whether accelerometer sensor is active */
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
  /** Current weather condition */
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

/**
 * Generate contextual advisory messages based on current system state.
 *
 * This function delegates to the AI Assistant Intelligence Engine
 * which monitors all ECS subsystems and generates prioritized,
 * confidence-weighted advisory messages.
 *
 * Returns an array of candidate messages — the store handles
 * priority, timing, and deduplication.
 */
export function generateContextualMessages(
  ctx: AdvisoryContext
): Array<Omit<AdvisoryMessage, 'queuedAt'>> {
  // Delegate to the Intelligence Engine
  try {
    const engine = require('./assistantIntelligenceEngine');

    // Map AdvisoryContext → IntelligenceContext (same shape)
    const intelCtx = {
      expeditionState: ctx.expeditionState ?? 'standby',
      expeditionElapsedSec: ctx.expeditionElapsedSec,
      expeditionDistanceM: ctx.expeditionDistanceM,
      rollDeg: ctx.rollDeg,
      pitchDeg: ctx.pitchDeg,
      sensorActive: ctx.sensorActive,
      fuelPercent: ctx.fuelPercent,
      fuelRangeMi: ctx.fuelRangeMi,
      fuelConfigured: ctx.fuelConfigured,
      waterPercent: ctx.waterPercent,
      waterAutonomyDays: ctx.waterAutonomyDays,
      waterConfigured: ctx.waterConfigured,
      powerPercent: ctx.powerPercent,
      powerEstHours: ctx.powerEstHours,
      powerConfigured: ctx.powerConfigured,
      remotenessScore: ctx.remotenessScore,
      remotenessTier: ctx.remotenessTier,
      connectivityState: ctx.connectivityState,
      hasActiveRoute: ctx.hasActiveRoute,
      routeDistanceRemainingMi: ctx.routeDistanceRemainingMi,
      routeTotalDistanceMi: ctx.routeTotalDistanceMi,
      speedMph: ctx.speedMph,
      altitudeFt: ctx.altitudeFt,
      gpsFixQuality: ctx.gpsFixQuality,
      gpsStatus: ctx.gpsStatus,
      weatherCondition: ctx.weatherCondition,
      windSpeedMph: ctx.windSpeedMph,
      temperatureF: ctx.temperatureF,
      weatherFresh: ctx.weatherFresh,
      isOnline: ctx.isOnline,
      signalStrength: ctx.signalStrength,
      networkType: ctx.networkType,
      internetReachable: ctx.internetReachable,
      latencyMs: ctx.latencyMs,
      timeOfDay: ctx.timeOfDay,
      hoursUntilSunset: ctx.hoursUntilSunset,
      vehicleType: ctx.vehicleType,
    };

    const result = engine.evaluateSystems(intelCtx);
    return engine.toAdvisoryMessages(result.messages);
  } catch (e) {
    // Fallback: basic message generation if intelligence engine fails
    console.warn('[AdvisoryStore] Intelligence engine error, using fallback:', e);
    return _fallbackContextualMessages(ctx);
  }
}



/**
 * Fallback message generator — used if the Intelligence Engine
 * fails to load or throws an error. Provides basic advisories
 * using the same logic as the original implementation.
 */
function _fallbackContextualMessages(
  ctx: AdvisoryContext
): Array<Omit<AdvisoryMessage, 'queuedAt'>> {
  const messages: Array<Omit<AdvisoryMessage, 'queuedAt'>> = [];

  // ── ALERT: Safety-critical ──────────────────────────────
  const tiltAngle = ctx.rollDeg != null && ctx.pitchDeg != null
    ? Math.max(Math.abs(ctx.rollDeg), Math.abs(ctx.pitchDeg))
    : undefined;

  if (tiltAngle !== undefined && tiltAngle > 25) {
    messages.push(createAlertMessage(
      'tilt-critical',
      'Vehicle tilt angle exceeds safe threshold',
      { icon: 'alert-circle-outline', priority: 1 }
    ));
  }

  if (ctx.fuelPercent != null && ctx.fuelPercent < 15) {
    messages.push(createAlertMessage(
      'fuel-critical',
      'Fuel level critically low — plan resupply',
      { icon: 'speedometer-outline', priority: 1 }
    ));
  }

  // ── ALERT: Expedition-critical ──────────────────────────
  if (ctx.waterPercent != null && ctx.waterPercent < 20) {
    messages.push(createAlertMessage(
      'water-low',
      'Water reserves below target level',
      { icon: 'water-outline', priority: 2 }
    ));
  }

  if (ctx.fuelPercent != null && ctx.fuelPercent < 30 && ctx.fuelPercent >= 15) {
    messages.push(createAlertMessage(
      'fuel-low',
      'Fuel range may be tight for current route',
      { icon: 'speedometer-outline', priority: 2 }
    ));
  }

  // ── ADVISORY: Resource / vehicle status ─────────────────
  if (tiltAngle !== undefined && tiltAngle > 12 && tiltAngle <= 25) {
    messages.push(createAdvisoryMessage(
      'tilt-advisory',
      'Vehicle tilt increasing — monitor stability',
      { icon: 'analytics-outline', priority: 3 }
    ));
  }

  if (ctx.signalStrength != null && ctx.signalStrength < 20) {
    messages.push(createAdvisoryMessage(
      'signal-weak',
      'Low signal coverage expected ahead',
      { icon: 'cellular-outline', priority: 3 }
    ));
  }

  if (ctx.isOnline === false) {
    messages.push(createAdvisoryMessage(
      'offline-mode',
      'Operating in offline mode — data sync paused',
      { icon: 'cloud-offline-outline', priority: 3 }
    ));
  }

  // ── ADVISORY: Route / remoteness / environmental ────────
  if (ctx.remotenessScore != null && ctx.remotenessScore > 70) {
    messages.push(createAdvisoryMessage(
      'remote-segment',
      'Entering high-remoteness zone — limited services',
      { icon: 'compass-outline', priority: 4 }
    ));
  }

  if (ctx.routeDistanceRemainingMi != null && ctx.routeDistanceRemainingMi < 15) {
    messages.push(createAdvisoryMessage(
      'route-near-end',
      `${Math.round(ctx.routeDistanceRemainingMi)} miles remaining on current route`,
      { icon: 'navigate-outline', priority: 4 }
    ));
  }

  if (ctx.weatherCondition === 'storm' || ctx.weatherCondition === 'severe') {
    messages.push(createAdvisoryMessage(
      'weather-shift',
      'Weather shift possible — check forecast',
      { icon: 'thunderstorm-outline', priority: 4 }
    ));
  }

  if (ctx.altitudeFt != null && ctx.altitudeFt > 8000) {
    messages.push(createAdvisoryMessage(
      'high-elevation',
      `Elevation ${ctx.altitudeFt.toLocaleString()} ft — reduced engine performance possible`,
      { icon: 'trending-up-outline', priority: 4 }
    ));
  }

  // ── ADVISORY: Recommendations ───────────────────────────
  if (ctx.timeOfDay === 'evening' && ctx.expeditionState === 'active') {
    messages.push(createAdvisoryMessage(
      'evening-camp',
      'Evening approaching — consider identifying camp location',
      { icon: 'moon-outline', priority: 5 }
    ));
  }

  if (ctx.expeditionState === 'active' && ctx.remotenessScore != null &&
      ctx.remotenessScore > 50 && ctx.remotenessScore <= 70) {
    messages.push(createAdvisoryMessage(
      'remote-moderate',
      'Remote segment begins ahead — verify supplies',
      { icon: 'trail-sign-outline', priority: 5 }
    ));
  }

  // ── STANDBY: Neutral reassurance ────────────────────────
  if (messages.length === 0) {
    const standbyOptions = [
      createStandbyMessage('standby-normal', 'All systems normal'),
      createStandbyMessage('standby-clear', 'No active advisories'),
      createStandbyMessage('standby-ready', 'Systems operational — ready for expedition'),
      createStandbyMessage('standby-monitoring', 'Monitoring route conditions'),
    ];
    const pick = standbyOptions[Math.floor(Math.random() * standbyOptions.length)];
    messages.push(pick);
  }

  return messages;
}


