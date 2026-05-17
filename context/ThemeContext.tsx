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
  goldMuted: 'rgba(176, 122, 28, 0.12)',
  goldBorder: 'rgba(176, 122, 28, 0.25)',
  border: '#D0CEC8',
  borderLight: '#E0DDD8',
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
  goldMuted: 'rgba(224, 160, 48, 0.15)',
  goldBorder: 'rgba(224, 160, 48, 0.35)',
  border: '#4A5A48',
  borderLight: '#5A6A58',
};

export type ColorsType = typeof COLORS | typeof COLORS_LIGHT | typeof COLORS_DRIVING;

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
  appearanceMode: 'dark',
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
  const fallbackDynamicTheme = deviceColorScheme === 'light' ? 'light' : 'dark';

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
  const [dynamicTheme, setDynamicTheme] = useState<'dark' | 'light'>(fallbackDynamicTheme);

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
    setDynamicTheme((current) => (current === fallbackDynamicTheme ? current : fallbackDynamicTheme));
  }, [fallbackDynamicTheme]);

  useEffect(() => {
    if (appearanceMode !== 'dynamic' || (autoDrivingActive && autoDrivingEnabled)) {
      return;
    }

    let active = true;
    let subscription: { remove: () => void } | null = null;
    let smoothedLux = 0;
    let initialized = false;
    let resolvedTheme: 'dark' | 'light' = fallbackDynamicTheme;

    const applyResolvedTheme = (nextTheme: 'dark' | 'light') => {
      if (!active || nextTheme === resolvedTheme) return;
      resolvedTheme = nextTheme;
      setDynamicTheme((current) => (current === nextTheme ? current : nextTheme));
    };

    const applyIlluminance = (illuminance: number) => {
      const safeLux = Number.isFinite(illuminance) ? Math.max(0, illuminance) : 0;
      smoothedLux = initialized ? smoothedLux * 0.75 + safeLux * 0.25 : safeLux;
      initialized = true;

      if (smoothedLux >= 6000) {
        applyResolvedTheme('light');
        return;
      }

      if (smoothedLux <= 1500) {
        applyResolvedTheme('dark');
      }
    };

    void (async () => {
      if (Platform.OS !== 'android') {
        applyResolvedTheme(fallbackDynamicTheme);
        return;
      }

      try {
        const available = await LightSensor.isAvailableAsync();
        if (!active || !available) {
          applyResolvedTheme(fallbackDynamicTheme);
          return;
        }

        LightSensor.setUpdateInterval(2000);
        subscription = LightSensor.addListener(({ illuminance }: LightSensorMeasurement) => {
          applyIlluminance(illuminance);
        });
      } catch {
        applyResolvedTheme(fallbackDynamicTheme);
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
    fallbackDynamicTheme,
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
      return dynamicTheme;
    }
    return appearanceStore.resolveEffectiveTheme(deviceColorScheme);
  }, [appearanceMode, autoDrivingActive, autoDrivingEnabled, deviceColorScheme, dynamicTheme]);

  // ── Select palette + colors ─────────────────────────────
  const palette = useMemo<TacticalPalette>(() => {
    switch (effectiveTheme) {
      case 'light':
        return TACTICAL_LIGHT;
      case 'driving':
        return TACTICAL_DRIVING;
      case 'dark':
      default:
        return TACTICAL;
    }
  }, [effectiveTheme]);

  const colors = useMemo<ColorsType>(() => {
    switch (effectiveTheme) {
      case 'light':
        return COLORS_LIGHT;
      case 'driving':
        return COLORS_DRIVING;
      case 'dark':
      default:
        return COLORS;
    }
  }, [effectiveTheme]);

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


