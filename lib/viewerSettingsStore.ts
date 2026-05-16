/**
 * Viewer Settings Store — Dashboard Widget Viewer Configuration
 *
 * Single source of truth for viewer settings that affect how dashboard
 * widgets render. Persisted to localStorage for instant recall.
 *
 * Settings:
 * - viewerMode: 'standard' | 'adaptive'
 *     Standard: default rendering
 *     Adaptive: scaled typography, increased spacing, high-visibility layout
 *
 * - themeMode: 'day' | 'night'
 *     Day: bright backgrounds, high contrast, increased brightness
 *     Night: standard dark theme (default)
 *
 * - gridDensity: 'comfortable' | 'compact'
 *     Comfortable: default spacing
 *     Compact: tighter spacing for more data density
 */

const STORAGE_KEY = 'ecs_viewer_settings';

export type ViewerMode = 'standard' | 'adaptive';
export type ViewerThemeMode = 'day' | 'night';
export type ViewerGridDensity = 'comfortable' | 'compact';

export interface ViewerSettings {
  viewerMode: ViewerMode;
  themeMode: ViewerThemeMode;
  gridDensity: ViewerGridDensity;
  /** Timestamp of last change for cache-busting */
  lastChanged: number;
}

const DEFAULT_SETTINGS: ViewerSettings = {
  viewerMode: 'standard',
  themeMode: 'night',
  gridDensity: 'comfortable',
  lastChanged: 0,
};

/** Read settings from localStorage */
function readSettings(): ViewerSettings {
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            viewerMode: parsed.viewerMode || 'standard',
            themeMode: parsed.themeMode || 'night',
            gridDensity: parsed.gridDensity || 'comfortable',
            lastChanged: parsed.lastChanged || 0,
          };
        }
      }
    }
  } catch (e) {
    console.warn('[ViewerSettings] Failed to read:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

/** Write settings to localStorage */
function writeSettings(settings: ViewerSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    }
  } catch (e) {
    console.warn('[ViewerSettings] Failed to write:', e);
  }
}

// ── Change listeners ──────────────────────────────────────
type Listener = (settings: ViewerSettings) => void;
const listeners: Set<Listener> = new Set();

function notifyListeners(settings: ViewerSettings) {
  listeners.forEach(fn => {
    try { fn(settings); } catch {}
  });
}

// ── Public API ────────────────────────────────────────────
export const viewerSettingsStore = {
  /** Get current viewer settings */
  get(): ViewerSettings {
    return readSettings();
  },

  /** Update one or more viewer settings */
  update(partial: Partial<Omit<ViewerSettings, 'lastChanged'>>): ViewerSettings {
    const current = readSettings();
    const updated: ViewerSettings = {
      ...current,
      ...partial,
      lastChanged: Date.now(),
    };
    writeSettings(updated);
    notifyListeners(updated);
    return updated;
  },

  /** Set viewer mode */
  setViewerMode(mode: ViewerMode): ViewerSettings {
    return this.update({ viewerMode: mode });
  },

  /** Set theme mode */
  setThemeMode(mode: ViewerThemeMode): ViewerSettings {
    return this.update({ themeMode: mode });
  },

  /** Set grid density */
  setGridDensity(density: ViewerGridDensity): ViewerSettings {
    return this.update({ gridDensity: density });
  },

  /** Reset to defaults */
  reset(): ViewerSettings {
    const defaults = { ...DEFAULT_SETTINGS, lastChanged: Date.now() };
    writeSettings(defaults);
    notifyListeners(defaults);
    return defaults;
  },

  /** Subscribe to changes. Returns unsubscribe function. */

  onChange(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },

  /** Check if settings are non-default */
  isNonDefault(): boolean {
    const s = readSettings();
    return s.viewerMode !== 'standard' || s.themeMode !== 'night' || s.gridDensity !== 'comfortable';
  },
};

// ── QA Logging ────────────────────────────────────────────
const QA_PREFIX = '[ECS:ViewerSettings]';

function logViewerSettingsDev(...args: unknown[]) {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.log(...args);
  }
}

export function logViewerSettingsChange(action: string, detail?: Record<string, any>) {
  const ts = new Date().toISOString();
  const settings = readSettings();
  logViewerSettingsDev(
    `${QA_PREFIX} ${ts} | ${action}`,
    detail ? { ...detail, currentSettings: settings } : { currentSettings: settings }
  );
}

export function logWidgetEvent(action: string, detail?: Record<string, any>) {
  const ts = new Date().toISOString();
  logViewerSettingsDev(`[ECS:Widget] ${ts} | ${action}`, detail || '');
}

export function logLayoutEvent(action: string, detail?: Record<string, any>) {
  const ts = new Date().toISOString();
  logViewerSettingsDev(`[ECS:Layout] ${ts} | ${action}`, detail || '');
}


// ── Viewer Style Overrides ────────────────────────────────
// These are computed style adjustments based on viewer settings.
// Widgets read these to adjust their rendering.

export interface ViewerStyleOverrides {
  /** Font size multiplier (1.0 = normal, 1.15 = adaptive) */
  fontScale: number;
  /** Extra padding added to widget content */
  paddingBoost: number;
  /** Whether to use high-contrast text */
  highContrast: boolean;
  /** Background brightness adjustment ('day' mode) */
  brightenBg: boolean;
  /** Text color override for day mode (null = use default) */
  textColorOverride: string | null;
  /** Muted text color override for day mode */
  mutedColorOverride: string | null;
  /** Panel background override for day mode */
  panelBgOverride: string | null;
  /** Widget border color override for day mode */
  borderColorOverride: string | null;
  /** Metric value font weight boost */
  fontWeightBoost: boolean;
  /** Compact density mode */
  compactDensity: boolean;
  /** Amber/accent color override for day mode */
  amberOverride: string | null;
}

const STANDARD_NIGHT: ViewerStyleOverrides = {
  fontScale: 1.0,
  paddingBoost: 0,
  highContrast: false,
  brightenBg: false,
  textColorOverride: null,
  mutedColorOverride: null,
  panelBgOverride: null,
  borderColorOverride: null,
  fontWeightBoost: false,
  compactDensity: false,
  amberOverride: null,
};

const ADAPTIVE_NIGHT: ViewerStyleOverrides = {
  fontScale: 1.15,
  paddingBoost: 4,
  highContrast: true,
  brightenBg: false,
  textColorOverride: '#F5F5F0',
  mutedColorOverride: '#A0A098',
  panelBgOverride: null,
  borderColorOverride: null,
  fontWeightBoost: true,
  compactDensity: false,
  amberOverride: null,
};

const STANDARD_DAY: ViewerStyleOverrides = {
  fontScale: 1.0,
  paddingBoost: 0,
  highContrast: true,
  brightenBg: true,
  textColorOverride: '#1A1A18',
  mutedColorOverride: '#5A5A55',
  panelBgOverride: '#F0EDE8',
  borderColorOverride: '#C8C5BE',
  fontWeightBoost: false,
  compactDensity: false,
  amberOverride: '#9A6B10',
};

const ADAPTIVE_DAY: ViewerStyleOverrides = {
  fontScale: 1.15,
  paddingBoost: 4,
  highContrast: true,
  brightenBg: true,
  textColorOverride: '#111110',
  mutedColorOverride: '#4A4A45',
  panelBgOverride: '#F5F2ED',
  borderColorOverride: '#B8B5AE',
  fontWeightBoost: true,
  compactDensity: false,
  amberOverride: '#7A5510',
};

/** Compute style overrides from current viewer settings */
export function computeViewerOverrides(settings: ViewerSettings): ViewerStyleOverrides {
  const { viewerMode, themeMode, gridDensity } = settings;

  let base: ViewerStyleOverrides;

  if (viewerMode === 'adaptive' && themeMode === 'day') {
    base = { ...ADAPTIVE_DAY };
  } else if (viewerMode === 'adaptive' && themeMode === 'night') {
    base = { ...ADAPTIVE_NIGHT };
  } else if (viewerMode === 'standard' && themeMode === 'day') {
    base = { ...STANDARD_DAY };
  } else {
    base = { ...STANDARD_NIGHT };
  }

  if (gridDensity === 'compact') {
    base.compactDensity = true;
    base.paddingBoost = Math.max(0, base.paddingBoost - 2);
  }

  return base;
}

