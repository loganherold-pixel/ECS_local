import type { OBD2DiscoveredDevice } from '../src/vehicle-telemetry/OBD2Adapter';
import {
  matchBluetoothBrands,
  type BluetoothBrandConnectionType,
  type BluetoothBrandDeviceCategory,
} from './bluetoothBrandRegistry';

export type BluetoothProviderBadge =
  | 'OBD'
  | 'EcoFlow'
  | 'Bluetti'
  | 'Anker SOLIX'
  | 'Jackery'
  | 'Goal Zero'
  | 'Renogy'
  | 'Redarc'
  | 'Dakota Lithium'
  | 'Victron Energy'
  | 'Propane'
  | 'Water'
  | 'Sensor';

export type BluetoothSignalBucket = 'strong' | 'good' | 'fair' | 'weak' | 'unknown';

export type BluetoothSignalPresentation = {
  bars: number;
  bucket: BluetoothSignalBucket;
  label: string;
  rssiText: string | null;
};

export type BluetoothDevicePresentation = {
  displayName: string;
  secondaryLabel: string;
  providerBadge: BluetoothProviderBadge | null;
  brandLabel: string | null;
  matchedBrandLabels: string[];
  needsUserConfirmation: boolean;
  connectionType: BluetoothBrandConnectionType | null;
  deviceCategory: BluetoothBrandDeviceCategory;
  categoryHint: string;
  signal: BluetoothSignalPresentation;
};

export type BluetoothDeviceClassificationInput = Pick<
  OBD2DiscoveredDevice,
  'id' | 'isLikelyOBD' | 'name' | 'rssi'
> & Partial<Pick<OBD2DiscoveredDevice, 'serviceUUIDs' | 'manufacturerData'>>;

export function formatBluetoothDisplayName(device: Pick<OBD2DiscoveredDevice, 'name' | 'id'>): string {
  const trimmed = typeof device.name === 'string' ? device.name.trim() : '';
  if (trimmed.length > 0) {
    return trimmed;
  }

  const suffix = device.id.trim().replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase();
  return suffix ? `Unknown device ${suffix}` : 'Unknown device';
}

export function shortenBluetoothIdentifier(deviceId: string): string {
  const compactId = deviceId.trim();
  if (compactId.length <= 16) return compactId;
  return `${compactId.slice(0, 6)}...${compactId.slice(-6)}`;
}

export function getBluetoothSignalPresentation(rssi?: number | null): BluetoothSignalPresentation {
  if (typeof rssi !== 'number' || !Number.isFinite(rssi)) {
    return {
      bars: 0,
      bucket: 'unknown',
      label: 'Signal unknown',
      rssiText: null,
    };
  }

  if (rssi >= -58) {
    return { bars: 4, bucket: 'strong', label: 'Strong signal', rssiText: `${rssi} dBm` };
  }
  if (rssi >= -70) {
    return { bars: 3, bucket: 'good', label: 'Good signal', rssiText: `${rssi} dBm` };
  }
  if (rssi >= -82) {
    return { bars: 2, bucket: 'fair', label: 'Fair signal', rssiText: `${rssi} dBm` };
  }

  return { bars: 1, bucket: 'weak', label: 'Weak signal', rssiText: `${rssi} dBm` };
}

export function classifyBluetoothDevice(device: BluetoothDeviceClassificationInput): BluetoothDevicePresentation {
  const displayName = formatBluetoothDisplayName(device);
  const brandMatch = matchBluetoothBrands(device);
  const providerMatch = brandMatch.primaryMatch?.brand ?? null;

  return {
    displayName,
    secondaryLabel: shortenBluetoothIdentifier(device.id),
    providerBadge: providerMatch?.providerBadge ?? null,
    brandLabel: providerMatch?.displayName ?? null,
    matchedBrandLabels: brandMatch.matches.map((match) => match.brand.displayName),
    needsUserConfirmation: brandMatch.needsUserConfirmation,
    connectionType: providerMatch?.connectionType ?? null,
    deviceCategory: providerMatch?.deviceCategory ?? 'unknown',
    categoryHint: brandMatch.needsUserConfirmation
      ? `Needs brand confirmation: ${brandMatch.matches.map((match) => match.brand.displayName).join(', ')}`
      : providerMatch?.categoryHint ?? 'General Bluetooth device',
    signal: getBluetoothSignalPresentation(device.rssi),
  };
}
