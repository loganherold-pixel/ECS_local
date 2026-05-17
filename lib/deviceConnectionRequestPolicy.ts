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
