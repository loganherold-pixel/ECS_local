/**
 * ThemeContext — Single source of truth for ECS appearance
 *
 * Provides:
 * - effectiveTheme: 'dark' | 'light' | 'driving'
 * - palette: the active TACTICAL palette object
 * - colors: the active COLORS object (derived)
 * - isDriving: boolean shorthand
 * - isLight: boolean shorthand
 * - appearanceMode / setAppearanceMode
 * - autoDrivingEnabled / setAutoDrivingEnabled
 * - cycleMode: quick toggle
 * - feedSpeed: for auto-driving detection
 * - drivingOverrides: extra style adjustments for driving mode
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';
import { Platform, useColorScheme } from 'react-native';
import { LightSensor, type LightSensorMeasurement } from 'expo-sensors';

import {
  TACTICAL,
  TACTICAL_LIGHT,
  TACTICAL_DRIVING,
  COLORS,
} from '../lib/theme';

import {
  appearanceStore,
  type AppearanceMode,
  type EffectiveTheme,
} from '../lib/appearanceStore';

// ── Palette type ────────────────────────────────────────────
export type TacticalPalette =
  | typeof TACTICAL
  | typeof TACTICAL_LIGHT
  | typeof TACTICAL_DRIVING;

// ── COLORS variants for light and driving ───────────────────
const COLORS_LIGHT = {
  ...COLORS,
  bg: '#F2F0EB',
  bgCard: '#FFFFFF',
  bgCardHover: '#F0EDE8',
  bgElevated: '#FFFFFF',
  bgInput: '#F8F7F4',
  bgModal: 'rgba(0,0,0,0.5)',
  textPrimary: '#1A1A18',
  textSecondary: '#5A5A55',
  textMuted: '#8A8A85',
  textGold: '#B07A1C',
  gold: '#B07A1C',
  goldStrong: '#B07A1C',
  goldMedium: 'rgba(176, 122, 28, 0.52)',
  goldSoft: 'rgba(176, 122, 28, 0.22)',
  goldWash: 'rgba(176, 122, 28, 0.10)',
  goldPassive: 'rgba(107,107,102,0.20)',
  goldMuted: 'rgba(176, 122, 28, 0.12)',
  goldBorder: 'rgba(176, 122, 28, 0.25)',
  bgPanelInactive: 'rgba(248,247,244,0.74)',
  critical: '#C0392B',
  status: {
    success: '#3E6B3E',
    warning: '#B86712',
    critical: '#C0392B',
    danger: '#C0392B',
    info: '#2478A8',
  },
  border: '#D0CEC8',
  borderLight: '#E0DDD8',
  borderMuted: 'rgba(107,107,102,0.20)',
};

const COLORS_DRIVING = {
  ...COLORS,
  bg: '#1E2328',
  bgCard: '#262C32',
  bgCardHover: '#2E3438',
  bgElevated: '#303840',
  bgInput: '#2A3038',
  bgModal: 'rgba(0,0,0,0.9)',
  textPrimary: '#F5F5F0',
  textSecondary: '#B0B0AA',
  textMuted: '#808078',
  textGold: '#E0A030',
  gold: '#E0A030',
  goldStrong: '#E0A030',
  goldMedium: 'rgba(224, 160, 48, 0.58)',
  goldSoft: 'rgba(224, 160, 48, 0.26)',
  goldWash: 'rgba(224, 160, 48, 0.12)',
  goldPassive: 'rgba(160,160,154,0.28)',
  goldMuted: 'rgba(224, 160, 48, 0.15)',
  goldBorder: 'rgba(224, 160, 48, 0.35)',
  bgPanelInactive: '#242A30',
  critical: '#E04030',
  status: {
    success: '#50A050',
    warning: '#FFB020',
    critical: '#E04030',
    danger: '#E04030',
    info: '#6FCFFF',
  },
  border: '#4A5A48',
  borderLight: '#5A6A58',
  borderMuted: 'rgba(160,160,154,0.28)',
};

export type ColorsType = typeof COLORS | typeof COLORS_LIGHT | typeof COLORS_DRIVING;

const DYNAMIC_DEFAULT_EXPOSURE = 0;
const DYNAMIC_LUX_DARK = 1500;
const DYNAMIC_LUX_FULL_DAYLIGHT = 9000;
const DYNAMIC_LIGHT_THEME_THRESHOLD = 0.55;
const DYNAMIC_SENSOR_INTERVAL_MS = 2000;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function smoothstep(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

function resolveDaylightExposureFromLux(lux: number): number {
  if (!Number.isFinite(lux) || lux <= DYNAMIC_LUX_DARK) return 0;
  if (lux >= DYNAMIC_LUX_FULL_DAYLIGHT) return 1;
  return smoothstep((lux - DYNAMIC_LUX_DARK) / (DYNAMIC_LUX_FULL_DAYLIGHT - DYNAMIC_LUX_DARK));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = hex.trim();
  const match = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (!match) return null;
  const raw = match[1];
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
}

function toHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, '0');
}

function blendColor(from: string, to: string, exposure: number): string {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  if (!start || !end) return exposure >= 0.5 ? to : from;

  const t = clamp01(exposure);
  return `#${toHex(start.r + (end.r - start.r) * t)}${toHex(start.g + (end.g - start.g) * t)}${toHex(start.b + (end.b - start.b) * t)}`;
}

function blendPalette(exposure: number): TacticalPalette {
  const t = clamp01(exposure);
  return {
    ...TACTICAL,
    bg: blendColor(TACTICAL.bg, TACTICAL_LIGHT.bg, t),
    panel: blendColor(TACTICAL.panel, TACTICAL_LIGHT.panel, t),
    panelInactive: t >= 0.5 ? TACTICAL_LIGHT.panelInactive : TACTICAL.panelInactive,
    accent: blendColor(TACTICAL.accent, TACTICAL_LIGHT.accent, t),
    accentDark: blendColor(TACTICAL.accentDark, TACTICAL_LIGHT.accentDark, t),
    amber: blendColor(TACTICAL.amber, TACTICAL_LIGHT.amber, t),
    amberDark: blendColor(TACTICAL.amberDark, TACTICAL_LIGHT.amberDark, t),
    goldStrong: blendColor(TACTICAL.goldStrong, TACTICAL_LIGHT.goldStrong, t),
    goldMedium: t >= 0.5 ? TACTICAL_LIGHT.goldMedium : TACTICAL.goldMedium,
    goldSoft: t >= 0.5 ? TACTICAL_LIGHT.goldSoft : TACTICAL.goldSoft,
    goldWash: t >= 0.5 ? TACTICAL_LIGHT.goldWash : TACTICAL.goldWash,
    goldPassive: t >= 0.5 ? TACTICAL_LIGHT.goldPassive : TACTICAL.goldPassive,
    text: blendColor(TACTICAL.text, TACTICAL_LIGHT.text, t),
    textMuted: blendColor(TACTICAL.textMuted, TACTICAL_LIGHT.textMuted, t),
    critical: blendColor(TACTICAL.critical, TACTICAL_LIGHT.critical, t),
    danger: blendColor(TACTICAL.danger, TACTICAL_LIGHT.danger, t),
    warning: blendColor(TACTICAL.warning, TACTICAL_LIGHT.warning, t),
    success: blendColor(TACTICAL.success, TACTICAL_LIGHT.success, t),
    successText: blendColor(TACTICAL.successText, TACTICAL_LIGHT.successText, t),
    info: blendColor(TACTICAL.info, TACTICAL_LIGHT.info, t),
    border: blendColor(TACTICAL.border, TACTICAL_LIGHT.border, t),
    borderMuted: t >= 0.5 ? TACTICAL_LIGHT.borderMuted : TACTICAL.borderMuted,
    borderFocus: blendColor(TACTICAL.borderFocus, TACTICAL_LIGHT.borderFocus, t),
    borderError: blendColor(TACTICAL.borderError, TACTICAL_LIGHT.borderError, t),
    inputBg: t >= 0.5 ? TACTICAL_LIGHT.inputBg : TACTICAL.inputBg,
  };
}

function blendColors(exposure: number): ColorsType {
  const t = clamp01(exposure);
  return {
    ...COLORS,
    bg: blendColor(COLORS.bg, COLORS_LIGHT.bg, t),
    bgCard: blendColor(COLORS.bgCard, COLORS_LIGHT.bgCard, t),
    bgCardHover: blendColor(COLORS.bgCardHover, COLORS_LIGHT.bgCardHover, t),
    bgElevated: blendColor(COLORS.bgElevated, COLORS_LIGHT.bgElevated, t),
    bgInput: blendColor(COLORS.bgInput, COLORS_LIGHT.bgInput, t),
    bgModal: t >= 0.5 ? COLORS_LIGHT.bgModal : COLORS.bgModal,
    textPrimary: blendColor(COLORS.textPrimary, COLORS_LIGHT.textPrimary, t),
    textSecondary: blendColor(COLORS.textSecondary, COLORS_LIGHT.textSecondary, t),
    textMuted: blendColor(COLORS.textMuted, COLORS_LIGHT.textMuted, t),
    textGold: blendColor(COLORS.textGold, COLORS_LIGHT.textGold, t),
    gold: blendColor(COLORS.gold, COLORS_LIGHT.gold, t),
    goldStrong: blendColor(COLORS.goldStrong, COLORS_LIGHT.goldStrong, t),
    goldMedium: t >= 0.5 ? COLORS_LIGHT.goldMedium : COLORS.goldMedium,
    goldSoft: t >= 0.5 ? COLORS_LIGHT.goldSoft : COLORS.goldSoft,
    goldWash: t >= 0.5 ? COLORS_LIGHT.goldWash : COLORS.goldWash,
    goldPassive: t >= 0.5 ? COLORS_LIGHT.goldPassive : COLORS.goldPassive,
    goldMuted: t >= 0.5 ? COLORS_LIGHT.goldMuted : COLORS.goldMuted,
    goldBorder: t >= 0.5 ? COLORS_LIGHT.goldBorder : COLORS.goldBorder,
    bgPanelInactive: t >= 0.5 ? COLORS_LIGHT.bgPanelInactive : COLORS.bgPanelInactive,
    critical: blendColor(COLORS.critical, COLORS_LIGHT.critical, t),
    status: t >= 0.5 ? COLORS_LIGHT.status : COLORS.status,
    border: blendColor(COLORS.border, COLORS_LIGHT.border, t),
    borderLight: blendColor(COLORS.borderLight, COLORS_LIGHT.borderLight, t),
    borderMuted: t >= 0.5 ? COLORS_LIGHT.borderMuted : COLORS.borderMuted,
  };
}

// ── Driving mode overrides (extra style adjustments) ────────
export interface DrivingOverrides {
  /** Extra border width for cards/panels */
  borderBoost: number;
  /** Font weight boost for labels */
  fontWeightBoost: boolean;
  /** Font size boost (add to base) */
  fontSizeBoost: number;
  /** Disable non-essential animations */
  disableAnimations: boolean;
  /** Use solid backgrounds (no rgba transparency) */
  solidSurfaces: boolean;
}

const DRIVING_OVERRIDES: DrivingOverrides = {
  borderBoost: 0.5,
  fontWeightBoost: true,
  fontSizeBoost: 1,
  disableAnimations: true,
  solidSurfaces: true,
};

const DEFAULT_OVERRIDES: DrivingOverrides = {
  borderBoost: 0,
  fontWeightBoost: false,
  fontSizeBoost: 0,
  disableAnimations: false,
  solidSurfaces: false,
};

// ── Context type ────────────────────────────────────────────
interface ThemeContextType {
  effectiveTheme: EffectiveTheme;
  palette: TacticalPalette;
  colors: ColorsType;
  themeReady: boolean;
  isDriving: boolean;
  isLight: boolean;
  isDark: boolean;
  appearanceMode: AppearanceMode;
  autoDrivingEnabled: boolean;
  isAutoDrivingActive: boolean;
  drivingOverrides: DrivingOverrides;
  setAppearanceMode: (mode: AppearanceMode) => void;
  setAutoDrivingEnabled: (enabled: boolean) => void;
  cycleMode: (order?: readonly AppearanceMode[]) => AppearanceMode;
  feedSpeed: (speedMph: number) => 'activated' | 'deactivated' | null;
  dismissAutoDriving: () => void;
}

const ThemeContext = createContext<ThemeContextType>({
  effectiveTheme: 'dark',
  palette: TACTICAL,
  colors: COLORS,
  themeReady: appearanceStore.isHydrated,
  isDriving: false,
  isLight: false,
  isDark: true,
  appearanceMode: 'dynamic',
  autoDrivingEnabled: false,
  isAutoDrivingActive: false,
  drivingOverrides: DEFAULT_OVERRIDES,
  setAppearanceMode: () => {},
  setAutoDrivingEnabled: () => {},
  cycleMode: () => 'dark',
  feedSpeed: () => null,
  dismissAutoDriving: () => {},
});

export const useTheme = (): ThemeContextType => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const deviceColorScheme = useColorScheme();

  const [appearanceMode, setAppearanceModeState] = useState<AppearanceMode>(
    appearanceStore.mode
  );
  const [autoDrivingEnabled, setAutoDrivingEnabledState] = useState<boolean>(
    appearanceStore.autoDrivingEnabled
  );
  const [themeReady, setThemeReady] = useState<boolean>(appearanceStore.isHydrated);
  const [autoDrivingActive, setAutoDrivingActive] = useState<boolean>(
    appearanceStore.isAutoDrivingActive
  );
  const [dynamicDaylightExposure, setDynamicDaylightExposure] = useState(DYNAMIC_DEFAULT_EXPOSURE);

  // Listen for store changes (from speed detection)
  useEffect(() => {
    const unsub = appearanceStore.onChange((mode, autoDriving) => {
      setAppearanceModeState(mode);
      setAutoDrivingEnabledState(autoDriving);
      setAutoDrivingActive(appearanceStore.isAutoDrivingActive);
    });

    return unsub;
  }, []);

  useEffect(() => {
    let mounted = true;

    appearanceStore.waitForHydration().then(() => {
      if (!mounted) return;
      setAppearanceModeState(appearanceStore.mode);
      setAutoDrivingEnabledState(appearanceStore.autoDrivingEnabled);
      setAutoDrivingActive(appearanceStore.isAutoDrivingActive);
      setThemeReady(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  const setAppearanceMode = useCallback((mode: AppearanceMode) => {
    appearanceStore.setMode(mode);
    setAppearanceModeState(mode);
    setAutoDrivingActive(appearanceStore.isAutoDrivingActive);
  }, []);

  const setAutoDrivingEnabled = useCallback((enabled: boolean) => {
    appearanceStore.setAutoDrivingEnabled(enabled);
    setAutoDrivingEnabledState(enabled);
    setAutoDrivingActive(appearanceStore.isAutoDrivingActive);
  }, []);

  const cycleMode = useCallback((order?: readonly AppearanceMode[]): AppearanceMode => {
    const next = appearanceStore.cycleMode(order);
    setAppearanceModeState(next);
    setAutoDrivingActive(appearanceStore.isAutoDrivingActive);
    return next;
  }, []);

  useEffect(() => {
    if (appearanceMode !== 'dynamic' || (autoDrivingActive && autoDrivingEnabled)) {
      setDynamicDaylightExposure(DYNAMIC_DEFAULT_EXPOSURE);
      return;
    }

    let active = true;
    let subscription: { remove: () => void } | null = null;
    let smoothedLux = 0;
    let initialized = false;

    const applyIlluminance = (illuminance: number) => {
      const safeLux = Number.isFinite(illuminance) ? Math.max(0, illuminance) : 0;
      smoothedLux = initialized ? smoothedLux * 0.75 + safeLux * 0.25 : safeLux;
      initialized = true;
      const nextExposure = resolveDaylightExposureFromLux(smoothedLux);
      if (!active) return;
      setDynamicDaylightExposure((current) =>
        Math.abs(current - nextExposure) < 0.03 ? current : nextExposure,
      );
    };

    setDynamicDaylightExposure(DYNAMIC_DEFAULT_EXPOSURE);

    void (async () => {
      if (Platform.OS === 'web') {
        setDynamicDaylightExposure(DYNAMIC_DEFAULT_EXPOSURE);
        return;
      }

      try {
        const available = await LightSensor.isAvailableAsync();
        if (!active || !available) {
          setDynamicDaylightExposure(DYNAMIC_DEFAULT_EXPOSURE);
          return;
        }

        LightSensor.setUpdateInterval(DYNAMIC_SENSOR_INTERVAL_MS);
        subscription = LightSensor.addListener(({ illuminance }: LightSensorMeasurement) => {
          applyIlluminance(illuminance);
        });
      } catch {
        setDynamicDaylightExposure(DYNAMIC_DEFAULT_EXPOSURE);
      }
    })();

    return () => {
      active = false;
      subscription?.remove();
    };
  }, [
    appearanceMode,
    autoDrivingActive,
    autoDrivingEnabled,
  ]);

  const feedSpeed = useCallback((speedMph: number) => {
    const result = appearanceStore.feedSpeed(speedMph);

    if (result) {
      setAutoDrivingActive(appearanceStore.isAutoDrivingActive);
    }

    return result;
  }, []);

  const dismissAutoDriving = useCallback(() => {
    appearanceStore.dismissAutoDriving();
    setAutoDrivingActive(false);
  }, []);

  // ── Resolve effective theme ─────────────────────────────
  const effectiveTheme = useMemo<EffectiveTheme>(() => {
    if (appearanceMode === 'dynamic' && !(autoDrivingActive && autoDrivingEnabled)) {
      return dynamicDaylightExposure >= DYNAMIC_LIGHT_THEME_THRESHOLD ? 'light' : 'dark';
    }
    return appearanceStore.resolveEffectiveTheme(deviceColorScheme);
  }, [
    appearanceMode,
    autoDrivingActive,
    autoDrivingEnabled,
    deviceColorScheme,
    dynamicDaylightExposure,
  ]);

  // ── Select palette + colors ─────────────────────────────
  const palette = useMemo<TacticalPalette>(() => {
    if (appearanceMode === 'dynamic' && !(autoDrivingActive && autoDrivingEnabled)) {
      return blendPalette(dynamicDaylightExposure);
    }

    switch (effectiveTheme) {
      case 'light':
        return TACTICAL_LIGHT;
      case 'driving':
        return TACTICAL_DRIVING;
      case 'dark':
      default:
        return TACTICAL;
    }
  }, [appearanceMode, autoDrivingActive, autoDrivingEnabled, dynamicDaylightExposure, effectiveTheme]);

  const colors = useMemo<ColorsType>(() => {
    if (appearanceMode === 'dynamic' && !(autoDrivingActive && autoDrivingEnabled)) {
      return blendColors(dynamicDaylightExposure);
    }

    switch (effectiveTheme) {
      case 'light':
        return COLORS_LIGHT;
      case 'driving':
        return COLORS_DRIVING;
      case 'dark':
      default:
        return COLORS;
    }
  }, [appearanceMode, autoDrivingActive, autoDrivingEnabled, dynamicDaylightExposure, effectiveTheme]);

  const drivingOverrides = useMemo<DrivingOverrides>(() => {
    return effectiveTheme === 'driving'
      ? DRIVING_OVERRIDES
      : DEFAULT_OVERRIDES;
  }, [effectiveTheme]);

  const value = useMemo<ThemeContextType>(
    () => ({
      effectiveTheme,
      palette,
      colors,
      themeReady,
      isDriving: effectiveTheme === 'driving',
      isLight: effectiveTheme === 'light',
      isDark: effectiveTheme === 'dark',
      appearanceMode,
      autoDrivingEnabled,
      isAutoDrivingActive: autoDrivingActive,
      drivingOverrides,
      setAppearanceMode,
      setAutoDrivingEnabled,
      cycleMode,
      feedSpeed,
      dismissAutoDriving,
    }),
    [
      effectiveTheme,
      palette,
      colors,
      themeReady,
      appearanceMode,
      autoDrivingEnabled,
      autoDrivingActive,
      drivingOverrides,
      setAppearanceMode,
      setAutoDrivingEnabled,
      cycleMode,
      feedSpeed,
      dismissAutoDriving,
    ]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export default ThemeProvider;


