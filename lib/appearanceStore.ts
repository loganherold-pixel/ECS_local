/**
 * Appearance Store — Persistence + Auto-Driving Logic
 *
 * Manages:
 * - appearanceMode: 'auto' | 'dark' | 'light' | 'driving'
 * - autoDrivingEnabled: boolean
 * - Speed-based driving mode auto-activation with hysteresis
 * - AsyncStorage persistence (falls back to localStorage on web)
 *
 * Auto-Driving Rules:
 * - Activate when GPS speed >= 8 mph sustained for 10 seconds
 * - Deactivate when speed < 3 mph sustained for 3 minutes
 * - No rapid toggling (hysteresis + time thresholds)
 */
import { Platform } from 'react-native';
import { createPersistedKeyValueCache } from './keyValuePersistence';

export type AppearanceMode = 'dynamic' | 'dark' | 'light' | 'driving';
export type EffectiveTheme = 'dark' | 'light' | 'driving';
export const VISIBILITY_THEME_CYCLE: readonly AppearanceMode[] = ['dark', 'light', 'dynamic'];
export const DEFAULT_THEME_CYCLE: readonly AppearanceMode[] = ['dark', 'light', 'driving', 'dynamic'];

const STORAGE_KEY_MODE = 'ecs_appearance_mode';
const STORAGE_KEY_AUTO_DRIVING = 'ecs_auto_driving_enabled';
const appearancePersistence = createPersistedKeyValueCache('ecs_appearance_preferences');

// ── Auto-driving thresholds ─────────────────────────────────
const DRIVING_ACTIVATE_SPEED_MPH = 8;
const DRIVING_ACTIVATE_DURATION_MS = 10_000;  // 10 seconds sustained
const DRIVING_DEACTIVATE_SPEED_MPH = 3;
const DRIVING_DEACTIVATE_DURATION_MS = 180_000; // 3 minutes sustained
const COOLDOWN_MS = 15_000; // 15s cooldown after manual override

// ── Persistence helpers ─────────────────────────────────────
function getStored(key: string): string | null {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        return localStorage.getItem(key);
      }
    } catch {}
    return null;
  }
  return appearancePersistence.get(key);
}

function setStored(key: string, value: string): void {
  if (Platform.OS === 'web') {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(key, value);
      }
    } catch {}
    return;
  }
  appearancePersistence.set(key, value);
}

type AppearanceListener = (mode: AppearanceMode, autoDriving: boolean) => void;

class AppearanceStore {
  private _mode: AppearanceMode = 'dark';
  private _autoDrivingEnabled: boolean = false;
  private _listeners: Set<AppearanceListener> = new Set();

  // Auto-driving state
  private _speedAboveThresholdSince: number | null = null;
  private _speedBelowThresholdSince: number | null = null;
  private _autoDrivingActive: boolean = false;
  private _lastManualOverrideAt: number = 0;
  private _hydrated = Platform.OS === 'web';

  constructor() {
    this._load();
    if (Platform.OS !== 'web') {
      void this._hydrateNative();
    }
  }

  private _load(): void {
    const storedMode = getStored(STORAGE_KEY_MODE);
    const normalizedMode = this.normalizeMode(storedMode);
    if (normalizedMode) {
      this._mode = normalizedMode;
    }
    const storedAutoDriving = getStored(STORAGE_KEY_AUTO_DRIVING);
    this._autoDrivingEnabled = storedAutoDriving === 'true';
  }

  private async _hydrateNative(): Promise<void> {
    await appearancePersistence.waitForHydration();

    const storedMode = appearancePersistence.get(STORAGE_KEY_MODE);
    const storedAutoDriving = appearancePersistence.get(STORAGE_KEY_AUTO_DRIVING);
    let changed = false;

    const normalizedMode = this.normalizeMode(storedMode);
    if (normalizedMode && normalizedMode !== this._mode) {
      this._mode = normalizedMode;
      changed = true;
    }

    const nextAutoDriving = storedAutoDriving === 'true';
    if (storedAutoDriving != null && nextAutoDriving !== this._autoDrivingEnabled) {
      this._autoDrivingEnabled = nextAutoDriving;
      if (!nextAutoDriving) {
        this._autoDrivingActive = false;
      }
      changed = true;
    }

    this._hydrated = true;
    if (changed) {
      this._notify();
    }
  }

  // ── Getters ─────────────────────────────────────────────
  get mode(): AppearanceMode { return this._mode; }
  get autoDrivingEnabled(): boolean { return this._autoDrivingEnabled; }
  get isAutoDrivingActive(): boolean { return this._autoDrivingActive; }
  get isHydrated(): boolean { return this._hydrated; }

  private normalizeMode(mode: string | null | undefined): AppearanceMode | null {
    switch (mode) {
      case 'auto':
      case 'dynamic':
        return 'dynamic';
      case 'dark':
      case 'light':
      case 'driving':
        return mode;
      default:
        return null;
    }
  }

  // ── Setters ─────────────────────────────────────────────
  setMode(mode: AppearanceMode): void {
    this._mode = mode;
    setStored(STORAGE_KEY_MODE, mode);
    // If user manually selects a mode, mark as manual override
    this._lastManualOverrideAt = Date.now();
    // If user manually selects non-driving, deactivate auto-driving
    if (mode !== 'driving' && mode !== 'dynamic') {
      this._autoDrivingActive = false;
    }
    this._notify();
  }

  setAutoDrivingEnabled(enabled: boolean): void {
    this._autoDrivingEnabled = enabled;
    setStored(STORAGE_KEY_AUTO_DRIVING, String(enabled));
    if (!enabled) {
      this._autoDrivingActive = false;
      this._speedAboveThresholdSince = null;
      this._speedBelowThresholdSince = null;
    }
    this._notify();
  }

  /**
   * Resolve the effective theme based on current settings + device color scheme.
   * @param deviceColorScheme - 'dark' | 'light' from useColorScheme()
   */
  resolveEffectiveTheme(deviceColorScheme: 'dark' | 'light' | null | undefined): EffectiveTheme {
    // Driving mode explicit selection always wins
    if (this._mode === 'driving') return 'driving';

    // Auto-driving override (when auto-driving is active)
    if (this._autoDrivingActive && this._autoDrivingEnabled) return 'driving';

    // Explicit dark/light
    if (this._mode === 'dark') return 'dark';
    if (this._mode === 'light') return 'light';

    // Auto mode: follow device color scheme
    if (this._mode === 'dynamic') {
      return deviceColorScheme === 'light' ? 'light' : 'dark';
    }

    return 'dark';
  }

  /**
   * Feed GPS speed data for auto-driving detection.
   * Call this periodically with the current speed.
   * Returns 'activated' | 'deactivated' | null
   */
  feedSpeed(speedMph: number): 'activated' | 'deactivated' | null {
    if (!this._autoDrivingEnabled) return null;

    // Don't auto-switch during cooldown after manual override
    if (Date.now() - this._lastManualOverrideAt < COOLDOWN_MS) return null;

    const now = Date.now();

    if (!this._autoDrivingActive) {
      // ── Check for activation ────────────────────────────
      if (speedMph >= DRIVING_ACTIVATE_SPEED_MPH) {
        if (!this._speedAboveThresholdSince) {
          this._speedAboveThresholdSince = now;
        } else if (now - this._speedAboveThresholdSince >= DRIVING_ACTIVATE_DURATION_MS) {
          // Sustained speed above threshold — activate
          this._autoDrivingActive = true;
          this._speedAboveThresholdSince = null;
          this._speedBelowThresholdSince = null;
          this._notify();
          return 'activated';
        }
      } else {
        // Speed dropped below threshold — reset activation timer
        this._speedAboveThresholdSince = null;
      }
    } else {
      // ── Check for deactivation ──────────────────────────
      if (speedMph < DRIVING_DEACTIVATE_SPEED_MPH) {
        if (!this._speedBelowThresholdSince) {
          this._speedBelowThresholdSince = now;
        } else if (now - this._speedBelowThresholdSince >= DRIVING_DEACTIVATE_DURATION_MS) {
          // Sustained low speed — deactivate
          this._autoDrivingActive = false;
          this._speedBelowThresholdSince = null;
          this._speedAboveThresholdSince = null;
          this._notify();
          return 'deactivated';
        }
      } else {
        // Speed picked back up — reset deactivation timer
        this._speedBelowThresholdSince = null;
      }
    }

    return null;
  }

  /**
   * Manually dismiss auto-driving (e.g., user taps "Undo" on toast)
   */
  dismissAutoDriving(): void {
    this._autoDrivingActive = false;
    this._lastManualOverrideAt = Date.now();
    this._notify();
  }

  // ── Cycle mode (for quick toggle) ───────────────────────
  cycleMode(order: readonly AppearanceMode[] = DEFAULT_THEME_CYCLE): AppearanceMode {
    const normalizedOrder = order.length > 0 ? [...order] : [...DEFAULT_THEME_CYCLE];
    const idx = normalizedOrder.indexOf(this._mode);
    const next = normalizedOrder[(idx + 1) % normalizedOrder.length] ?? normalizedOrder[0] ?? 'dark';
    this.setMode(next);
    return next;
  }

  // ── Listeners ───────────────────────────────────────────
  onChange(listener: AppearanceListener): () => void {
    this._listeners.add(listener);
    return () => { this._listeners.delete(listener); };
  }

  private _notify(): void {
    this._listeners.forEach(fn => {
      try { fn(this._mode, this._autoDrivingEnabled); } catch {}
    });
  }

  waitForHydration(): Promise<void> {
    return appearancePersistence.waitForHydration().then(() => {
      this._hydrated = true;
    });
  }
}

export const appearanceStore = new AppearanceStore();

