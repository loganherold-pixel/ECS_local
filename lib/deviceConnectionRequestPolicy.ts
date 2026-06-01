import {
  isEcoFlowCloudDeviceConnection,
  type DeviceConnectionSourceLike,
} from './deviceConnectionSourceRouting';

export type DeviceConnectionRequestSource =
  | 'programmatic'
  | 'user_device_action'
  | 'user_selected_batch'
  | 'user_retry'
  | 'saved_auto_reconnect';

export type DeviceConnectionRoute = 'cloud' | 'ble' | 'obd2';

export type DeviceConnectionRouteLike = DeviceConnectionSourceLike & {
  kind?: string | null;
};

export type SavedAutoReconnectDecisionReason =
  | 'allowed'
  | 'app_not_active'
  | 'busy'
  | 'scanning'
  | 'not_power'
  | 'not_remembered'
  | 'not_discoverable'
  | 'already_connected'
  | 'already_connecting'
  | 'not_connectable'
  | 'manual_disconnect'
  | 'cloud_auth_blocked'
  | 'cooldown';

export type SavedAutoReconnectDecision = {
  allowed: boolean;
  reason: SavedAutoReconnectDecisionReason;
};

export type SavedAutoReconnectDeviceLike = {
  kind?: string | null;
  isRemembered?: boolean | null;
  isDiscoverable?: boolean | null;
  isConnected?: boolean | null;
  isConnecting?: boolean | null;
  actionKind?: string | null;
};

export type SavedAutoReconnectDecisionInput = {
  device: SavedAutoReconnectDeviceLike;
  appState?: string | null;
  isBusy: boolean;
  isScanning: boolean;
  hasManualDisconnectRequest: boolean;
  isCloudAuthBlocked: boolean;
  previousAttemptAt: number;
  now: number;
  cooldownMs: number;
};

export function isUserInitiatedConnectionSource(source: DeviceConnectionRequestSource): boolean {
  return source === 'user_device_action' || source === 'user_selected_batch' || source === 'user_retry';
}

export function shouldSkipAutoConnection(source: DeviceConnectionRequestSource): boolean {
  return !isUserInitiatedConnectionSource(source) && source !== 'saved_auto_reconnect';
}

export function getDeviceConnectionRouteLabel(device: DeviceConnectionRouteLike): DeviceConnectionRoute {
  if (isEcoFlowCloudDeviceConnection(device)) return 'cloud';
  if (device.kind === 'telemetry') return 'obd2';
  return 'ble';
}

export function getSavedAutoReconnectDecision({
  device,
  appState,
  isBusy,
  isScanning,
  hasManualDisconnectRequest,
  isCloudAuthBlocked,
  previousAttemptAt,
  now,
  cooldownMs,
}: SavedAutoReconnectDecisionInput): SavedAutoReconnectDecision {
  if (appState !== 'active') return { allowed: false, reason: 'app_not_active' };
  if (isBusy) return { allowed: false, reason: 'busy' };
  if (isScanning) return { allowed: false, reason: 'scanning' };
  if (device.kind !== 'power') return { allowed: false, reason: 'not_power' };
  if (!device.isRemembered) return { allowed: false, reason: 'not_remembered' };
  if (!device.isDiscoverable) return { allowed: false, reason: 'not_discoverable' };
  if (device.isConnected) return { allowed: false, reason: 'already_connected' };
  if (device.isConnecting) return { allowed: false, reason: 'already_connecting' };
  if (device.actionKind !== 'connect' && device.actionKind !== 'retry') {
    return { allowed: false, reason: 'not_connectable' };
  }
  if (hasManualDisconnectRequest) return { allowed: false, reason: 'manual_disconnect' };
  if (isCloudAuthBlocked) return { allowed: false, reason: 'cloud_auth_blocked' };
  if (now - previousAttemptAt < cooldownMs) return { allowed: false, reason: 'cooldown' };
  return { allowed: true, reason: 'allowed' };
}
