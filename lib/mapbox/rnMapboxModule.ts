import { NativeModules } from 'react-native';

export type RnMapboxModule = any;

export function isRnMapboxNativeModuleAvailable(): boolean {
  const modules = NativeModules as Record<string, unknown> | undefined;
  return Boolean(
    modules &&
      (
        modules.RNMBXModule ||
        modules.RNMBXMapViewModule ||
        modules.RNMBXCameraModule ||
        modules.RNMBXOfflineModule
      ),
  );
}

export function loadRnMapboxModule(): RnMapboxModule | null {
  if (!isRnMapboxNativeModuleAvailable()) {
    return null;
  }

  try {
    const module = require('@rnmapbox/maps');
    return module?.default ?? module;
  } catch {
    return null;
  }
}
