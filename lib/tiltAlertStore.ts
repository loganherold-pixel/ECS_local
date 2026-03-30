/**
 * Tilt Alert Store
 *
 * Manages configurable tilt alert thresholds, alert history log,
 * audio/visual alert preferences, and sound selection for the
 * Attitude Monitor widget.
 *
 * Persistence: localStorage (web) with graceful fallback.
 */
import {
  type AlertSoundId,
  DEFAULT_WARNING_SOUND,
  DEFAULT_CRITICAL_SOUND,
} from './alertSounds';

// Re-export AlertSoundId for convenience
export type { AlertSoundId };

// ── Types ──────────────────────────────────────────────────────
export interface TiltThresholds {
  rollWarningDeg: number;
  rollCriticalDeg: number;
  pitchWarningDeg: number;
  pitchCriticalDeg: number;
}

export interface TiltAlertPreferences {
  useCustomThresholds: boolean;
  audioAlertsEnabled: boolean;
  flashAlertsEnabled: boolean;
  thresholds: TiltThresholds;
  warningSoundId: AlertSoundId;
  criticalSoundId: AlertSoundId;
}

export type AlertSeverity = 'WARNING' | 'CRITICAL';
export type AlertAxis = 'ROLL' | 'PITCH';

export interface TiltAlertEvent {
  id: string;
  timestamp: number;          // epoch ms
  severity: AlertSeverity;
  axis: AlertAxis;
  angleDeg: number;
  thresholdDeg: number;
  latitude?: number | null;
  longitude?: number | null;
  scenarioName?: string;      // if triggered during demo mode
}

// ── Defaults ───────────────────────────────────────────────────
export const DEFAULT_THRESHOLDS: TiltThresholds = {
  rollWarningDeg: 20,
  rollCriticalDeg: 30,
  pitchWarningDeg: 25,
  pitchCriticalDeg: 35,
};

export const DEFAULT_PREFERENCES: TiltAlertPreferences = {
  useCustomThresholds: false,
  audioAlertsEnabled: false,
  flashAlertsEnabled: true,
  thresholds: { ...DEFAULT_THRESHOLDS },
  warningSoundId: DEFAULT_WARNING_SOUND,
  criticalSoundId: DEFAULT_CRITICAL_SOUND,
};


// ── Persistence Keys ───────────────────────────────────────────
const PREFS_KEY = 'ecs_tilt_alert_prefs';
const HISTORY_KEY = 'ecs_tilt_alert_history';
const MAX_HISTORY = 100;

// ── Storage helpers ────────────────────────────────────────────
function readJSON<T>(key: string, fallback: T): T {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    }
  } catch {}
  return fallback;
}

function writeJSON<T>(key: string, value: T): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {}
}

// ── Preferences ────────────────────────────────────────────────
export function loadPreferences(): TiltAlertPreferences {
  const stored = readJSON<Partial<TiltAlertPreferences>>(PREFS_KEY, {});
  return {
    useCustomThresholds: stored.useCustomThresholds ?? DEFAULT_PREFERENCES.useCustomThresholds,
    audioAlertsEnabled: stored.audioAlertsEnabled ?? DEFAULT_PREFERENCES.audioAlertsEnabled,
    flashAlertsEnabled: stored.flashAlertsEnabled ?? DEFAULT_PREFERENCES.flashAlertsEnabled,
    thresholds: {
      rollWarningDeg: stored.thresholds?.rollWarningDeg ?? DEFAULT_THRESHOLDS.rollWarningDeg,
      rollCriticalDeg: stored.thresholds?.rollCriticalDeg ?? DEFAULT_THRESHOLDS.rollCriticalDeg,
      pitchWarningDeg: stored.thresholds?.pitchWarningDeg ?? DEFAULT_THRESHOLDS.pitchWarningDeg,
      pitchCriticalDeg: stored.thresholds?.pitchCriticalDeg ?? DEFAULT_THRESHOLDS.pitchCriticalDeg,
    },
    warningSoundId: (stored.warningSoundId as AlertSoundId) ?? DEFAULT_PREFERENCES.warningSoundId,
    criticalSoundId: (stored.criticalSoundId as AlertSoundId) ?? DEFAULT_PREFERENCES.criticalSoundId,
  };
}


export function savePreferences(prefs: TiltAlertPreferences): void {
  writeJSON(PREFS_KEY, prefs);
}

// ── Alert History ──────────────────────────────────────────────
export function loadAlertHistory(): TiltAlertEvent[] {
  return readJSON<TiltAlertEvent[]>(HISTORY_KEY, []);
}

export function saveAlertHistory(history: TiltAlertEvent[]): void {
  // Keep only the most recent MAX_HISTORY entries
  const trimmed = history.slice(-MAX_HISTORY);
  writeJSON(HISTORY_KEY, trimmed);
}

export function appendAlertEvent(event: TiltAlertEvent): TiltAlertEvent[] {
  const history = loadAlertHistory();
  history.push(event);
  const trimmed = history.slice(-MAX_HISTORY);
  saveAlertHistory(trimmed);
  return trimmed;
}

export function clearAlertHistory(): TiltAlertEvent[] {
  saveAlertHistory([]);
  return [];
}

// ── Alert ID generator ─────────────────────────────────────────
let _idCounter = 0;
export function generateAlertId(): string {
  _idCounter++;
  return `tilt-${Date.now()}-${_idCounter}`;
}

// ── Threshold evaluation ───────────────────────────────────────
export interface ThresholdCheckResult {
  rollSeverity: AlertSeverity | null;
  pitchSeverity: AlertSeverity | null;
  anyAlert: boolean;
  anyCritical: boolean;
}

export function checkThresholds(
  rollDeg: number,
  pitchDeg: number,
  thresholds: TiltThresholds,
): ThresholdCheckResult {
  const absRoll = Math.abs(rollDeg);
  const absPitch = Math.abs(pitchDeg);

  let rollSeverity: AlertSeverity | null = null;
  if (absRoll >= thresholds.rollCriticalDeg) rollSeverity = 'CRITICAL';
  else if (absRoll >= thresholds.rollWarningDeg) rollSeverity = 'WARNING';

  let pitchSeverity: AlertSeverity | null = null;
  if (absPitch >= thresholds.pitchCriticalDeg) pitchSeverity = 'CRITICAL';
  else if (absPitch >= thresholds.pitchWarningDeg) pitchSeverity = 'WARNING';

  const anyAlert = rollSeverity !== null || pitchSeverity !== null;
  const anyCritical = rollSeverity === 'CRITICAL' || pitchSeverity === 'CRITICAL';

  return { rollSeverity, pitchSeverity, anyAlert, anyCritical };
}

// ── Format helpers ─────────────────────────────────────────────
export function formatAlertTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => n.toString().padStart(2, '0');
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const mins = pad(d.getMinutes());
  const secs = pad(d.getSeconds());
  return `${month}/${day} ${hours}:${mins}:${secs}`;
}

export function formatCoordinate(lat?: number | null, lng?: number | null): string {
  if (lat == null || lng == null) return 'No GPS';
  const latDir = lat >= 0 ? 'N' : 'S';
  const lngDir = lng >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(5)}°${latDir} ${Math.abs(lng).toFixed(5)}°${lngDir}`;
}

