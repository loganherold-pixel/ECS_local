import { Platform } from 'react-native';
import {
  ensureBlePermissions,
  formatBlePermissionDeniedMessage,
  type BlePermissionResult,
} from './BlePermissions';

export type BleScanReadinessCode =
  | 'ready'
  | 'platform_unsupported'
  | 'runtime_unsupported'
  | 'permission_denied'
  | 'manager_unavailable'
  | 'bluetooth_off'
  | 'adapter_unavailable'
  | 'adapter_unresolved';

export interface BleScanReadinessResult {
  ok: boolean;
  code: BleScanReadinessCode;
  message: string | null;
  permissions: BlePermissionResult;
  bluetoothState: string | null;
  initialBluetoothState: string | null;
  manager: any | null;
  runtime: {
    platform: typeof Platform.OS;
    isExpoGo: boolean;
  };
}

export type BleNativeBridgeStatus =
  | 'not_checked'
  | 'web_unsupported'
  | 'expo_go_unsupported'
  | 'available'
  | 'unavailable';

export type BlePermissionStatus = 'unknown' | 'granted' | 'denied';

export interface BleRuntimeDiagnostics {
  platform: typeof Platform.OS;
  isExpoGo: boolean;
  nativeBridgeStatus: BleNativeBridgeStatus;
  permissionStatus: BlePermissionStatus;
  missingPermissions: string[];
  bluetoothState: string | null;
  initialBluetoothState: string | null;
  readinessCode: BleScanReadinessCode;
  message: string | null;
}

interface EnsureBleScanReadinessOptions {
  createManager: () => any;
  adapterTimeoutMs?: number;
}

export function getExpoGoRuntimeState(): boolean {
  if (Platform.OS === 'web') return false;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const constantsModule = require('expo-constants');
    const Constants = constantsModule?.default ?? constantsModule;
    const executionEnvironment = String(Constants?.executionEnvironment ?? '').toLowerCase();
    const appOwnership = String(Constants?.appOwnership ?? '').toLowerCase();

    return executionEnvironment === 'storeclient' || appOwnership === 'expo';
  } catch {
    return false;
  }
}

export function isBleRuntimeUnsupported(): boolean {
  return Platform.OS === 'web' || getExpoGoRuntimeState();
}

export function getBleRuntimeUnsupportedMessage(): string {
  return 'Bluetooth scanning requires the ECS development build or installed app. Expo Go and web preview do not include the native Bluetooth scanner.';
}

export function isBleNativeModuleUnavailableError(error: unknown): boolean {
  const message = String((error as any)?.message ?? error ?? '').toLowerCase();
  return (
    message.includes('expo go') ||
    message.includes('native module') ||
    message.includes('not linked') ||
    message.includes('bleclientmanager') ||
    message.includes('createclient') ||
    message.includes('cannot read property') ||
    message.includes('cannot read properties')
  );
}

export function getBleRuntimeDiagnostics(
  result: BleScanReadinessResult,
): BleRuntimeDiagnostics {
  const nativeBridgeStatus: BleNativeBridgeStatus =
    result.code === 'platform_unsupported'
      ? 'web_unsupported'
      : result.code === 'runtime_unsupported' && result.runtime.isExpoGo
        ? 'expo_go_unsupported'
        : result.manager
          ? 'available'
          : result.code === 'runtime_unsupported' || result.code === 'manager_unavailable'
            ? 'unavailable'
            : 'not_checked';
  const permissionStatus: BlePermissionStatus = result.permissions.ok
    ? 'granted'
    : result.permissions.missing.length > 0
      ? 'denied'
      : 'unknown';

  return {
    platform: result.runtime.platform,
    isExpoGo: result.runtime.isExpoGo,
    nativeBridgeStatus,
    permissionStatus,
    missingPermissions: result.permissions.missing,
    bluetoothState: result.bluetoothState,
    initialBluetoothState: result.initialBluetoothState,
    readinessCode: result.code,
    message: result.message,
  };
}

function getAdapterUnavailableMessage(bluetoothState: string | null): string {
  switch (bluetoothState) {
    case 'PoweredOff':
      return 'Bluetooth is turned off. Turn it on, then scan again.';
    case 'Unauthorized':
      return 'Bluetooth permission is required to scan.';
    case 'Unsupported':
      return 'This device does not support Bluetooth scanning.';
    case 'Resetting':
      return 'Bluetooth is resetting. Wait a moment, then scan again.';
    default:
      return 'Bluetooth is not ready yet. Wait a moment, then scan again.';
  }
}

export async function waitForBlePoweredOn(
  manager: any,
  initialState: string | null,
  timeoutMs: number = 3500,
): Promise<string | null> {
  if (initialState === 'PoweredOn' || typeof manager?.onStateChange !== 'function') {
    return initialState;
  }

  if (
    initialState === 'PoweredOff' ||
    initialState === 'Unauthorized' ||
    initialState === 'Unsupported'
  ) {
    return initialState;
  }

  return await new Promise((resolve) => {
    let latestState = initialState;
    let subscription: { remove?: () => void } | null = null;
    let settled = false;

    const settle = (state: string | null): void => {
      if (settled) return;
      settled = true;
      if (subscription?.remove) {
        try { subscription.remove(); } catch {}
      }
      resolve(state);
    };

    const timer = setTimeout(() => settle(latestState), timeoutMs);

    try {
      subscription = manager.onStateChange((nextState: string) => {
        latestState = nextState;
        if (
          nextState === 'PoweredOn' ||
          nextState === 'PoweredOff' ||
          nextState === 'Unauthorized' ||
          nextState === 'Unsupported'
        ) {
          clearTimeout(timer);
          settle(nextState);
        }
      }, true);
    } catch {
      clearTimeout(timer);
      settle(initialState);
    }
  });
}

export async function ensureBleScanReadiness({
  createManager,
  adapterTimeoutMs,
}: EnsureBleScanReadinessOptions): Promise<BleScanReadinessResult> {
  const runtime = {
    platform: Platform.OS,
    isExpoGo: getExpoGoRuntimeState(),
  };

  if (Platform.OS === 'web') {
    const permissions = await ensureBlePermissions();
    return {
      ok: false,
      code: 'platform_unsupported',
      message: formatBlePermissionDeniedMessage(['platform']),
      permissions,
      bluetoothState: null,
      initialBluetoothState: null,
      manager: null,
      runtime,
    };
  }

  if (runtime.isExpoGo) {
    return {
      ok: false,
      code: 'runtime_unsupported',
      message: getBleRuntimeUnsupportedMessage(),
      permissions: { ok: false, missing: ['runtime.expo_go'] },
      bluetoothState: null,
      initialBluetoothState: null,
      manager: null,
      runtime,
    };
  }

  const permissions = await ensureBlePermissions();
  if (!permissions.ok) {
    return {
      ok: false,
      code: 'permission_denied',
      message: formatBlePermissionDeniedMessage(permissions.missing),
      permissions,
      bluetoothState: null,
      initialBluetoothState: null,
      manager: null,
      runtime,
    };
  }

  let manager: any | null = null;
  try {
    manager = createManager();
  } catch (err: any) {
    const message = String(err?.message ?? err ?? '');
    const runtimeUnsupported = isBleNativeModuleUnavailableError(err);
    return {
      ok: false,
      code: runtimeUnsupported ? 'runtime_unsupported' : 'manager_unavailable',
      message: runtimeUnsupported
        ? getBleRuntimeUnsupportedMessage()
        : message || 'Bluetooth scanner could not be initialized.',
      permissions,
      bluetoothState: null,
      initialBluetoothState: null,
      manager: null,
      runtime,
    };
  }

  const initialBluetoothState = typeof manager?.state === 'function'
    ? await manager.state().catch(() => null)
    : null;
  const bluetoothState = await waitForBlePoweredOn(manager, initialBluetoothState, adapterTimeoutMs);

  if (bluetoothState !== 'PoweredOn') {
    const code: BleScanReadinessCode = bluetoothState === 'PoweredOff'
      ? 'bluetooth_off'
      : bluetoothState === 'Unauthorized'
        ? 'permission_denied'
        : bluetoothState === null
          ? 'adapter_unresolved'
          : 'adapter_unavailable';

    return {
      ok: false,
      code,
      message: getAdapterUnavailableMessage(bluetoothState),
      permissions,
      bluetoothState,
      initialBluetoothState,
      manager,
      runtime,
    };
  }

  return {
    ok: true,
    code: 'ready',
    message: null,
    permissions,
    bluetoothState,
    initialBluetoothState,
    manager,
    runtime,
  };
}
