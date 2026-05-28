export interface BluestackAdvertisementEvidenceInput {
  id?: string | null;
  name?: string | null;
  serviceUUIDs?: string[] | null;
  serviceUuids?: string[] | null;
  advertisedServiceUuids?: string[] | null;
  manufacturerData?: string | null;
  rssi?: number | null;
}

export interface BluestackAdvertisementEvidence {
  serviceUuidCount: number;
  serviceUuids: string[];
  manufacturerDataPresent: boolean;
  manufacturerDataLength: number;
  manufacturerDataFingerprint: string | null;
  rssi: number | null;
}

function normalizeUuid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

function fingerprintText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export function getBluestackAdvertisementEvidence(
  input: BluestackAdvertisementEvidenceInput,
): BluestackAdvertisementEvidence {
  const serviceUuids = Array.from(new Set([
    ...(input.serviceUUIDs ?? []),
    ...(input.serviceUuids ?? []),
    ...(input.advertisedServiceUuids ?? []),
  ]
    .map(normalizeUuid)
    .filter((uuid): uuid is string => uuid != null)));
  const manufacturerData =
    typeof input.manufacturerData === 'string' && input.manufacturerData.length > 0
      ? input.manufacturerData
      : null;

  return {
    serviceUuidCount: serviceUuids.length,
    serviceUuids,
    manufacturerDataPresent: manufacturerData != null,
    manufacturerDataLength: manufacturerData?.length ?? 0,
    manufacturerDataFingerprint: manufacturerData ? fingerprintText(manufacturerData) : null,
    rssi: typeof input.rssi === 'number' && Number.isFinite(input.rssi) ? input.rssi : null,
  };
}
