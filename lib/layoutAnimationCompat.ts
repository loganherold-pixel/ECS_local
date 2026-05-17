import { Platform, UIManager } from 'react-native';

function isNewArchitectureEnabled(): boolean {
  return (globalThis as any)?.nativeFabricUIManager != null;
}

export function enableLegacyAndroidLayoutAnimation(): void {
  if (Platform.OS !== 'android') return;
  if (isNewArchitectureEnabled()) return;
  UIManager.setLayoutAnimationEnabledExperimental?.(true);
}
