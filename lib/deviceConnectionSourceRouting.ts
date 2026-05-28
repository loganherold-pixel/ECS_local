export type DeviceConnectionSourceLike = {
  kind?: string | null;
  provider?: string | null;
  providerId?: string | null;
  source?: string | null;
  sources?: string[] | null;
  sourceIds?: Record<string, unknown> | null;
  sourceBadges?: string[] | null;
  connectionType?: string | null;
  requiresNativeBluetooth?: boolean | null;
  connectableViaCloud?: boolean | null;
};

export function normalizeDeviceConnectionType(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim().toLowerCase().replace(/\s+/g, '_');
  return normalized.length > 0 ? normalized : null;
}

export function isCloudConnectionType(value: string | null | undefined): boolean {
  return /^(api|cloud)$/.test(normalizeDeviceConnectionType(value) ?? '');
}

function hasLocalBluetoothSource(device: DeviceConnectionSourceLike): boolean {
  const connectionType = normalizeDeviceConnectionType(device.connectionType);
  if (connectionType === 'ble' || connectionType === 'classic_bluetooth' || connectionType === 'hybrid') {
    return true;
  }
  if ((device.sources ?? []).some((source) => source === 'ble' || source === 'classic_bluetooth')) {
    return true;
  }
  return (device.sourceBadges ?? []).some((badge) => /ble|classic/i.test(badge));
}

function hasCloudTelemetrySource(device: DeviceConnectionSourceLike): boolean {
  if (device.connectableViaCloud === true) return true;
  if (device.requiresNativeBluetooth === false && isCloudConnectionType(device.connectionType)) return true;
  if ((device.sources ?? []).some((source) => source === 'api' || source === 'cloud')) return true;
  if (device.source === 'api' || device.source === 'cloud') return true;
  if (device.sourceIds && typeof device.sourceIds.api === 'string') return true;
  return (device.sourceBadges ?? []).some((badge) => /api|cloud/i.test(badge));
}

export function isEcoFlowCloudDeviceConnection(device: DeviceConnectionSourceLike | null | undefined): boolean {
  if (!device) return false;
  const provider = String(device.providerId ?? device.provider ?? '').trim().toLowerCase();
  if (provider !== 'ecoflow') return false;
  if (hasCloudTelemetrySource(device)) return true;
  if (hasLocalBluetoothSource(device)) return false;
  return false;
}

export function shouldUseNativeBluetoothConnection(device: DeviceConnectionSourceLike | null | undefined): boolean {
  return !isEcoFlowCloudDeviceConnection(device);
}
