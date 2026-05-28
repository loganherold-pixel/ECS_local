import {
  recordBluetoothDiagnosticEvent,
  type BluetoothDiagnosticSource,
} from './bluetoothDiagnostics';

export interface EcoFlowBleDiagnosticTarget {
  providerId?: string | null;
  providerLabel?: string | null;
  displayName?: string | null;
  localName?: string | null;
  categoryHint?: string | null;
  manufacturerData?: string | null;
  serviceUuids?: string[] | null;
}

export interface EcoFlowBleCharacteristicProbe {
  serviceUuid: string;
  characteristicUuid: string;
  isReadable: boolean | null;
  isWritableWithResponse: boolean | null;
  isWritableWithoutResponse: boolean | null;
  isNotifiable: boolean | null;
  isIndicatable: boolean | null;
}

export interface EcoFlowBleServiceProbe {
  uuid: string;
  characteristicCount: number;
  characteristics: EcoFlowBleCharacteristicProbe[];
}

export interface EcoFlowBleProbeEventInput extends EcoFlowBleDiagnosticTarget {
  deviceId: string;
  phase:
    | 'connect_requested'
    | 'native_transport_connected'
    | 'service_discovery_started'
    | 'service_discovery_completed'
    | 'service_discovery_failed'
    | 'local_parser_blocked'
    | 'connect_failed'
    | 'disconnect_requested'
    | 'disconnect_completed';
  source?: BluetoothDiagnosticSource;
  startedAt?: number | null;
  elapsedMs?: number | null;
  serviceCount?: number | null;
  characteristicCount?: number | null;
  notificationCandidateCount?: number | null;
  services?: EcoFlowBleServiceProbe[] | null;
  reason?: string | null;
  error?: string | null;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeUuid(value: unknown): string {
  return normalizeText(value).toLowerCase();
}

function fingerprintText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function boolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function summarizeManufacturerData(value: string | null | undefined): Record<string, unknown> {
  const manufacturerData = normalizeText(value);
  return {
    manufacturerDataPresent: manufacturerData.length > 0,
    manufacturerDataLength: manufacturerData.length,
    manufacturerDataFingerprint: manufacturerData ? fingerprintText(manufacturerData) : null,
  };
}

export function isEcoFlowBleDiagnosticTarget(target: EcoFlowBleDiagnosticTarget): boolean {
  const provider = normalizeText(target.providerId).toLowerCase();
  if (provider === 'ecoflow') return true;
  const searchable = [
    target.providerLabel,
    target.displayName,
    target.localName,
    target.categoryHint,
    target.manufacturerData,
    ...(target.serviceUuids ?? []),
  ].map(normalizeText).join(' ').toLowerCase();
  return /\becoflow\b|\bdelta\b|\briver\b|\bglacier\b|\bwave\s*\d*\b/.test(searchable);
}

export function buildEcoFlowBleCharacteristicProbe(
  serviceUuid: unknown,
  characteristic: Record<string, unknown> | null | undefined,
): EcoFlowBleCharacteristicProbe {
  return {
    serviceUuid: normalizeUuid(serviceUuid),
    characteristicUuid: normalizeUuid(characteristic?.uuid),
    isReadable: boolOrNull(characteristic?.isReadable),
    isWritableWithResponse: boolOrNull(characteristic?.isWritableWithResponse),
    isWritableWithoutResponse: boolOrNull(characteristic?.isWritableWithoutResponse),
    isNotifiable: boolOrNull(characteristic?.isNotifiable),
    isIndicatable: boolOrNull(characteristic?.isIndicatable),
  };
}

export function summarizeEcoFlowBleServices(services: EcoFlowBleServiceProbe[]): {
  serviceCount: number;
  characteristicCount: number;
  notificationCandidateCount: number;
  services: EcoFlowBleServiceProbe[];
} {
  const normalized = services.map((service) => ({
    uuid: normalizeUuid(service.uuid),
    characteristicCount: service.characteristicCount,
    characteristics: service.characteristics
      .map((characteristic) => ({
        ...characteristic,
        serviceUuid: normalizeUuid(characteristic.serviceUuid),
        characteristicUuid: normalizeUuid(characteristic.characteristicUuid),
      }))
      .filter((characteristic) => characteristic.characteristicUuid.length > 0),
  }));
  return {
    serviceCount: normalized.length,
    characteristicCount: normalized.reduce((total, service) => total + service.characteristicCount, 0),
    notificationCandidateCount: normalized.reduce(
      (total, service) =>
        total + service.characteristics.filter((entry) => entry.isNotifiable || entry.isIndicatable).length,
      0,
    ),
    services: normalized.slice(0, 12).map((service) => ({
      ...service,
      characteristics: service.characteristics.slice(0, 40),
    })),
  };
}

export function recordEcoFlowBleProbeEvent(input: EcoFlowBleProbeEventInput): void {
  if (!isEcoFlowBleDiagnosticTarget(input)) return;
  const serviceSummary = input.services ? summarizeEcoFlowBleServices(input.services) : null;
  recordBluetoothDiagnosticEvent({
    type: 'ecoflow_ble_probe',
    source: input.source ?? (input.phase === 'local_parser_blocked' ? 'provider_handshake' : 'native_ble'),
    deviceId: input.deviceId,
    deviceName: normalizeText(input.displayName ?? input.localName) || null,
    providerId: 'ecoflow',
    message: `EcoFlow BLE probe: ${input.phase}`,
    error: input.error ?? null,
    details: {
      phase: input.phase,
      startedAt: input.startedAt ?? null,
      elapsedMs: input.elapsedMs ?? null,
      providerLabel: normalizeText(input.providerLabel) || null,
      localName: normalizeText(input.localName) || null,
      categoryHint: normalizeText(input.categoryHint) || null,
      advertisedServiceUuids: (input.serviceUuids ?? []).map(normalizeUuid).filter(Boolean).slice(0, 30),
      ...summarizeManufacturerData(input.manufacturerData),
      serviceCount: input.serviceCount ?? serviceSummary?.serviceCount ?? null,
      characteristicCount: input.characteristicCount ?? serviceSummary?.characteristicCount ?? null,
      notificationCandidateCount:
        input.notificationCandidateCount ?? serviceSummary?.notificationCandidateCount ?? null,
      services: serviceSummary?.services ?? null,
      reason: input.reason ?? null,
      rawPayloadLogged: false,
    },
  });
}
