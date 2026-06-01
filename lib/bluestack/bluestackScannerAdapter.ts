import {
  classifyBluestackDevice,
  isBluestackReleaseVisibleCategory,
} from './bluestackClassifier';
import { getBluestackProviderReadiness } from './bluestackProviderReadiness';
import type { BluestackDeviceCategory, BluestackDeviceIdentity } from './bluestackTypes';

export interface BluestackScannerDeviceInput {
  id?: string | null;
  rawId?: string | null;
  kind?: string | null;
  name?: string | null;
  provider?: string | null;
  providerId?: string | null;
  category?: string | null;
  deviceCategory?: string | null;
  subtype?: string | null;
  section?: string | null;
  isDiscoverable?: boolean | null;
  isConnected?: boolean | null;
  isLive?: boolean | null;
  isSelected?: boolean | null;
  isRemembered?: boolean | null;
  isSupported?: boolean | null;
  sourceBadges?: string[] | null;
  connectionType?: string | null;
  connectableViaCloud?: boolean | null;
  requiresNativeBluetooth?: boolean | null;
}

export interface BluestackScannerSummary {
  availableCount: number;
  connectedCount: number;
  liveCount: number;
  selectedCount: number;
  powerCount: number;
  obd2Count: number;
  propaneCount: number;
  waterCount: number;
  utilityCount: number;
  liveReadyCount: number;
  cloudApiCount: number;
  parserPendingCount: number;
  fieldVerificationCount: number;
  profileOnlyCount: number;
  nativeBuildRequiredCount: number;
  hiddenOrUnsupportedCount: number;
}

export function getBluestackIdentityForDevice(
  device: BluestackScannerDeviceInput,
): BluestackDeviceIdentity {
  return classifyBluestackDevice({
    providerId: device.providerId,
    providerLabel: device.provider,
    categoryLabel: device.category,
    deviceCategory: device.deviceCategory,
    name: device.name,
    model: device.subtype,
    kind: device.kind,
    isSupported: device.isSupported,
  });
}

export function hasBluestackNativeAdvertisement(device: BluestackScannerDeviceInput): boolean {
  return Boolean(
    device.sourceBadges?.some((badge) => /ble|classic/i.test(badge)) ||
      /^(ble|classic_bluetooth|hybrid)$/.test(String(device.connectionType ?? '').toLowerCase()),
  );
}

export function hasBluestackCloudSource(device: BluestackScannerDeviceInput): boolean {
  return Boolean(
    device.connectableViaCloud === true ||
      device.requiresNativeBluetooth === false ||
      device.sourceBadges?.some((badge) => /api|cloud/i.test(badge)) ||
      /^(api|cloud|provider_cloud)$/.test(String(device.connectionType ?? '').toLowerCase()),
  );
}

export function isBluestackReleaseDeviceModel(
  device: BluestackScannerDeviceInput,
  options: { requireDiscoverable?: boolean } = {},
): boolean {
  const identity = getBluestackIdentityForDevice(device);
  if (!identity.isReleaseVisible) return false;
  if (!isBluestackReleaseVisibleCategory(identity.category)) return false;
  if (options.requireDiscoverable && !device.isDiscoverable) return false;

  return (
    hasBluestackNativeAdvertisement(device) ||
    hasBluestackCloudSource(device) ||
    device.isConnected === true ||
    device.isLive === true ||
    device.isRemembered === true
  );
}

export function getBluestackVisibleDeviceListLabel(devices: BluestackScannerDeviceInput[]): string {
  const hasCloudApiDevice = devices.some(hasBluestackCloudSource);

  return hasCloudApiDevice
    ? 'Available cloud/API power devices plus nearby Bluetooth power, OBD2, propane, and water monitor advertisements. Select supported devices to connect them into ECS telemetry.'
    : 'Real nearby power, OBD2, propane, and water monitor advertisements only. TVs, headsets, and unrelated Bluetooth devices stay out of this action list.';
}

export function createBluestackScannerSummary(
  devices: BluestackScannerDeviceInput[],
): BluestackScannerSummary {
  const summary: BluestackScannerSummary = {
    availableCount: 0,
    connectedCount: 0,
    liveCount: 0,
    selectedCount: 0,
    powerCount: 0,
    obd2Count: 0,
    propaneCount: 0,
    waterCount: 0,
    utilityCount: 0,
    liveReadyCount: 0,
    cloudApiCount: 0,
    parserPendingCount: 0,
    fieldVerificationCount: 0,
    profileOnlyCount: 0,
    nativeBuildRequiredCount: 0,
    hiddenOrUnsupportedCount: 0,
  };

  for (const device of devices) {
    const identity = getBluestackIdentityForDevice(device);
    if (isBluestackReleaseDeviceModel(device)) {
      summary.availableCount += device.section === 'nearby' || device.isDiscoverable ? 1 : 0;
      incrementCategorySummary(summary, identity.category);
      incrementReadinessSummary(summary, identity);
    } else {
      summary.hiddenOrUnsupportedCount += 1;
    }

    if (device.isConnected) summary.connectedCount += 1;
    if (device.isLive) summary.liveCount += 1;
    if (device.isSelected) summary.selectedCount += 1;
  }

  return summary;
}

function incrementReadinessSummary(
  summary: BluestackScannerSummary,
  identity: BluestackDeviceIdentity,
): void {
  const readiness = getBluestackProviderReadiness(identity.provider);
  switch (readiness.stage) {
    case 'live_ready':
      summary.liveReadyCount += 1;
      break;
    case 'cloud_credentials_required':
      summary.cloudApiCount += 1;
      break;
    case 'native_parser_pending':
      summary.parserPendingCount += 1;
      break;
    case 'field_verification_required':
      summary.fieldVerificationCount += 1;
      break;
    case 'profile_only':
      summary.profileOnlyCount += 1;
      break;
  }

  if (readiness.requiresNativeBuild) {
    summary.nativeBuildRequiredCount += 1;
  }
}

function incrementCategorySummary(
  summary: BluestackScannerSummary,
  category: BluestackDeviceCategory,
): void {
  switch (category) {
    case 'power_device':
      summary.powerCount += 1;
      return;
    case 'obd2':
      summary.obd2Count += 1;
      return;
    case 'propane_monitor':
      summary.propaneCount += 1;
      return;
    case 'water_tank_monitor':
      summary.waterCount += 1;
      return;
    case 'utility_sensor':
      summary.utilityCount += 1;
      return;
    default:
      return;
  }
}
