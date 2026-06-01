import type { ECSDiscoverySourceSummary } from './unifiedScanner';

export const NATIVE_BLUETOOTH_RUNTIME_MESSAGE =
  'Native Bluetooth scanning is unavailable in this runtime.';

export const NATIVE_BLUETOOTH_RUNTIME_DETAIL =
  'Run ECS in a development/native build with the BLE bridge to scan nearby devices. Expo Go and web preview cannot run native BLE/OBD scanning. Cloud/API devices remain available.';

export function isNativeBluetoothRuntimeUnsupported(error: string | null | undefined): boolean {
  if (!error) return false;
  return /expo go|development build|installed app|native bluetooth scanner|runtime_unsupported|runtime\.expo_go/i.test(error);
}

export function getSourceStatusLabel(source: ECSDiscoverySourceSummary): string {
  if (source.key === 'ecoflow_api' && source.status === 'success') {
    return source.deviceCount > 0
      ? `${source.deviceCount} cloud device${source.deviceCount === 1 ? '' : 's'} found`
      : 'No cloud devices found';
  }
  if (source.key === 'ble' && source.status === 'unsupported') {
    return 'Native Bluetooth unavailable';
  }
  if (source.key === 'obd2' && source.status === 'unsupported') {
    return 'OBD2 unavailable';
  }
  if (source.status === 'failed') {
    if (/api/i.test(source.label)) return 'API discovery failed';
    if (/ble/i.test(source.label)) return 'BLE discovery failed';
    return 'Discovery failed';
  }
  if (source.status === 'unsupported') {
    if (/classic/i.test(source.label)) return 'Classic Bluetooth unsupported';
    return 'Unsupported';
  }
  if (source.status === 'disabled') return 'Disabled';
  if (source.status === 'scanning') return 'Scanning';
  if (source.status === 'pending') return 'Pending';
  return source.deviceCount > 0
    ? `${source.deviceCount} device${source.deviceCount === 1 ? '' : 's'} found`
    : 'No devices found yet';
}

export function getSourceStatusDetail(source: ECSDiscoverySourceSummary): string {
  if (source.key === 'ble' && source.status === 'unsupported') {
    return `${NATIVE_BLUETOOTH_RUNTIME_MESSAGE} ${NATIVE_BLUETOOTH_RUNTIME_DETAIL}`;
  }
  if (source.key === 'obd2' && source.status === 'unsupported') {
    return 'Classic Bluetooth/SPP OBD2 adapters are not discoverable in this runtime. BLE OBD2 adapters can appear when the native BLE bridge is available. Cloud/API devices remain available.';
  }
  if (source.key === 'ecoflow_api' && source.status === 'success' && source.deviceCount > 0) {
    return `EcoFlow API returned ${source.deviceCount} cloud device${source.deviceCount === 1 ? '' : 's'}.`;
  }
  return source.detail ?? getSourceStatusLabel(source);
}
