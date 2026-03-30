/**
 * ViewerSettingsContext — Reactive context for dashboard viewer settings
 *
 * Provides viewer settings + computed style overrides to all widgets.
 * Listens for store changes and triggers re-renders immediately.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  ReactNode,
} from 'react';
import {
  viewerSettingsStore,
  computeViewerOverrides,
  type ViewerSettings,
  type ViewerStyleOverrides,
  type ViewerMode,
  type ViewerThemeMode,
  type ViewerGridDensity,
} from '../lib/viewerSettingsStore';

interface ViewerSettingsContextType {
  /** Current viewer settings */
  settings: ViewerSettings;
  /** Computed style overrides for widget rendering */
  overrides: ViewerStyleOverrides;
  /** Set viewer mode */
  setViewerMode: (mode: ViewerMode) => void;
  /** Set theme mode */
  setThemeMode: (mode: ViewerThemeMode) => void;
  /** Set grid density */
  setGridDensity: (density: ViewerGridDensity) => void;
  /** Reset to defaults */
  resetSettings: () => void;
  /** Revision counter — increments on every change for cache-busting */
  revision: number;
}

const defaultSettings = viewerSettingsStore.get();
const defaultOverrides = computeViewerOverrides(defaultSettings);

const ViewerSettingsContext = createContext<ViewerSettingsContextType>({
  settings: defaultSettings,
  overrides: defaultOverrides,
  setViewerMode: () => {},
  setThemeMode: () => {},
  setGridDensity: () => {},
  resetSettings: () => {},
  revision: 0,
});

export const useViewerSettings = () => useContext(ViewerSettingsContext);

export function ViewerSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ViewerSettings>(viewerSettingsStore.get);
  const [revision, setRevision] = useState(0);

  // Listen for external store changes (e.g., from other tabs)
  useEffect(() => {
    const unsub = viewerSettingsStore.onChange((newSettings) => {
      setSettings(newSettings);
      setRevision(r => r + 1);
    });
    return unsub;
  }, []);

  const setViewerMode = useCallback((mode: ViewerMode) => {
    const updated = viewerSettingsStore.setViewerMode(mode);
    setSettings(updated);
    setRevision(r => r + 1);
  }, []);

  const setThemeMode = useCallback((mode: ViewerThemeMode) => {
    const updated = viewerSettingsStore.setThemeMode(mode);
    setSettings(updated);
    setRevision(r => r + 1);
  }, []);

  const setGridDensity = useCallback((density: ViewerGridDensity) => {
    const updated = viewerSettingsStore.setGridDensity(density);
    setSettings(updated);
    setRevision(r => r + 1);
  }, []);

  const resetSettings = useCallback(() => {
    const updated = viewerSettingsStore.reset();
    setSettings(updated);
    setRevision(r => r + 1);
  }, []);

  const overrides = useMemo(() => computeViewerOverrides(settings), [settings]);

  const value = useMemo<ViewerSettingsContextType>(() => ({
    settings,
    overrides,
    setViewerMode,
    setThemeMode,
    setGridDensity,
    resetSettings,
    revision,
  }), [settings, overrides, setViewerMode, setThemeMode, setGridDensity, resetSettings, revision]);

  return (
    <ViewerSettingsContext.Provider value={value}>
      {children}
    </ViewerSettingsContext.Provider>
  );
}


