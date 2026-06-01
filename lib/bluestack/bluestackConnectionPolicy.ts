import {
  getBluestackIdentityForDevice,
  hasBluestackCloudSource,
  hasBluestackNativeAdvertisement,
  type BluestackScannerDeviceInput,
} from './bluestackScannerAdapter';
import { getBluestackProviderReadiness } from './bluestackProviderReadiness';
import { identifyBluestackUtilitySensorProfile } from './bluestackUtilitySensorProfiles';

export type BluestackConnectionLane =
  | 'live_telemetry'
  | 'cloud_authorized'
  | 'cloud_authorization_needed'
  | 'native_ble_required'
  | 'sensor_linked'
  | 'linked_no_parser'
  | 'pending_protocol'
  | 'unsupported';

export interface BluestackConnectionPolicy {
  lane: BluestackConnectionLane;
  primaryActionLabel: string;
  statusLabel: string;
  statusDetail: string;
  telemetryTruthLabel: string;
  canAttemptConnection: boolean;
}

function hasAuthError(device: BluestackScannerDeviceInput): boolean {
  const error = String((device as { lastError?: string | null }).lastError ?? '').toLowerCase();
  return /unauthori[sz]ed|not authorized|forbidden|approval|credential|account/.test(error);
}

export function getBluestackConnectionPolicy(
  device: BluestackScannerDeviceInput,
): BluestackConnectionPolicy {
  const identity = getBluestackIdentityForDevice(device);
  const readiness = getBluestackProviderReadiness(identity.provider);
  const hasCloud = hasBluestackCloudSource(device);
  const hasNative = hasBluestackNativeAdvertisement(device);
  const supportLevel = String((device as { supportLevel?: string | null }).supportLevel ?? '');
  const telemetryUnsupported = (device as { telemetryUnsupported?: boolean | null }).telemetryUnsupported === true;
  const isLive = device.isLive === true;
  const isConnected = device.isConnected === true;
  const isSupported = (device as { isSupported?: boolean | null }).isSupported !== false;

  if (identity.isReleaseVisible && isSupported && supportLevel === 'ui_only') {
    return {
      lane: 'pending_protocol',
      primaryActionLabel: 'Profile',
      statusLabel: readiness.statusLabel,
      statusDetail: readiness.statusDetail,
      telemetryTruthLabel: readiness.telemetryTruthLabel,
      canAttemptConnection: readiness.canAttemptConnection && (hasNative || hasCloud || isConnected),
    };
  }

  if (!identity.isReleaseVisible || !isSupported) {
    return {
      lane: 'unsupported',
      primaryActionLabel: 'Unavailable',
      statusLabel: readiness.statusLabel === 'Profile only' ? 'Unsupported' : readiness.statusLabel,
      statusDetail: readiness.statusDetail,
      telemetryTruthLabel: readiness.telemetryTruthLabel,
      canAttemptConnection: false,
    };
  }

  if (isLive) {
    return {
      lane: 'live_telemetry',
      primaryActionLabel: 'Disconnect',
      statusLabel: 'Live telemetry',
      statusDetail: 'Decoded telemetry is actively flowing into ECS widgets and readiness systems.',
      telemetryTruthLabel: 'Live telemetry',
      canAttemptConnection: true,
    };
  }

  if (hasCloud) {
    if (hasAuthError(device)) {
      return {
        lane: 'cloud_authorization_needed',
        primaryActionLabel: 'Authorize',
        statusLabel: 'Cloud authorization needed',
        statusDetail: 'This device is visible through a provider cloud/API path, but ECS is not authorized to read telemetry for it yet.',
        telemetryTruthLabel: 'Cloud auth required',
        canAttemptConnection: true,
      };
    }

    return {
      lane: 'cloud_authorized',
      primaryActionLabel: isConnected ? 'Disconnect' : 'Connect',
      statusLabel: isConnected ? 'Cloud linked' : 'Cloud/API available',
      statusDetail: isConnected
        ? 'The provider cloud/API session is active. ECS will show live readings once the provider returns decoded telemetry.'
        : 'This device can connect through its provider cloud/API path without native Bluetooth in this runtime.',
      telemetryTruthLabel: isConnected ? 'Cloud linked' : 'Provider cloud',
      canAttemptConnection: true,
    };
  }

  if (identity.category === 'propane_monitor' || identity.category === 'water_tank_monitor') {
    const profile = identifyBluestackUtilitySensorProfile({
      providerId: device.providerId,
      providerLabel: device.provider,
      categoryLabel: device.category,
      deviceCategory: device.deviceCategory,
      name: device.name,
      model: device.subtype,
      kind: device.kind,
    });
    return {
      lane: isConnected ? 'sensor_linked' : 'native_ble_required',
      primaryActionLabel: isConnected ? 'Disconnect' : 'Link',
      statusLabel: isConnected
        ? 'Sensor linked, awaiting level'
        : profile?.status === 'identified_live_ready'
          ? 'Live sensor ready'
          : 'BLE sensor ready',
      statusDetail: isConnected
        ? profile?.detail ?? 'The sensor is linked through Bluestack. ECS will promote live tank readings after a decoded percentage is received.'
        : profile?.detail ?? 'Bluestack can link this field utility sensor over native BLE and promote decoded fluid-level readings.',
      telemetryTruthLabel: isConnected ? 'Linked, awaiting level' : 'Native BLE telemetry',
      canAttemptConnection: hasNative || isConnected,
    };
  }

  if (isConnected && telemetryUnsupported) {
    return {
      lane: 'linked_no_parser',
      primaryActionLabel: 'Disconnect',
      statusLabel: 'Connected, data pending',
      statusDetail: 'The transport connected, but ECS has not decoded usable telemetry from this device model yet.',
      telemetryTruthLabel: 'Parser pending',
      canAttemptConnection: true,
    };
  }

  if (supportLevel === 'partial' || supportLevel === 'implemented_unverified') {
    const canAttempt = readiness.canAttemptConnection && (hasNative || hasCloud || isConnected);
    return {
      lane: 'pending_protocol',
      primaryActionLabel: isConnected ? 'Disconnect' : canAttempt ? 'Connect' : 'Profile',
      statusLabel: readiness.stage === 'profile_only' ? 'Telemetry validation pending' : readiness.statusLabel,
      statusDetail: readiness.stage === 'profile_only'
        ? 'ECS has a provider path for this device family, but field verification is still required before it is treated as live telemetry.'
        : readiness.statusDetail,
      telemetryTruthLabel: readiness.stage === 'profile_only' ? 'Validation pending' : readiness.telemetryTruthLabel,
      canAttemptConnection: canAttempt,
    };
  }

  return {
    lane: 'native_ble_required',
    primaryActionLabel: isConnected ? 'Disconnect' : 'Connect',
    statusLabel: isConnected ? 'Bluetooth linked' : 'Native BLE required',
    statusDetail: isConnected
      ? 'The Bluetooth session is linked. ECS will promote it to live when decoded telemetry arrives.'
      : 'This device requires an installed native build with Bluetooth permissions before ECS can connect.',
    telemetryTruthLabel: isConnected ? 'Linked' : 'Native BLE required',
    canAttemptConnection: hasNative || isConnected,
  };
}
