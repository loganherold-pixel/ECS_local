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

export const ECOFLOW_BLE_PROTOCOL_CHARACTERISTICS = {
  rfcomm: {
    notifyUuid: '00000003-0000-1000-8000-00805f9b34fb',
    writeUuid: '00000002-0000-1000-8000-00805f9b34fb',
  },
  nordicUart: {
    notifyUuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    writeUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  },
} as const;

export interface EcoFlowBleProtocolSupport {
  hasRfcommWrite: boolean;
  hasRfcommNotify: boolean;
  hasNordicUartWrite: boolean;
  hasNordicUartNotify: boolean;
  hasAnyProtocolPair: boolean;
  protocolStatus:
    | 'ecoflow_ble_protocol_pair_present_auth_not_implemented'
    | 'ecoflow_ble_protocol_pair_missing';
}

export interface EcoFlowBleReplayCharacteristicCapture {
  serviceUuid: string;
  characteristicUuid: string;
  valueBase64: string | null;
  valueLength: number;
  valueFingerprint: string | null;
}

export interface EcoFlowBleProtocolFrameCapture {
  direction: 'notify' | 'write';
  serviceUuid: string;
  characteristicUuid: string;
  valueBase64: string;
  valueLength: number;
  valueFingerprint: string | null;
  capturedAtOffsetMs: number;
}

export interface EcoFlowBleDecodedProtocolPacketCapture {
  direction: 'notify' | 'write';
  valid: boolean;
  src?: number;
  dst?: number;
  cmdSet?: number;
  cmdId?: number;
  version?: number;
  payloadLength?: number;
  payloadFirstByte?: number;
  payloadBase64?: string;
  payloadFingerprint?: string;
  packetBase64?: string;
  packetFingerprint?: string;
  decryptedPayloadBase64?: string;
  decryptedPayloadFingerprint?: string;
  decryptedPayloadLength?: number;
  parseError?: string;
  capturedAtOffsetMs: number;
}

export interface EcoFlowBleReplayCapture {
  schema: 'ecs.ecoflow_ble.replay_capture';
  schemaVersion: 1;
  capturedAt: string;
  providerId: 'ecoflow';
  captureMode: 'explicit_debug_opt_in';
  device: {
    idFingerprint: string | null;
    name: string | null;
    model: string | null;
    rssi: number | null;
    serviceUuids: string[];
    manufacturerDataPresent: boolean;
    manufacturerDataLength: number;
    manufacturerDataFingerprint: string | null;
  };
  services?: EcoFlowBleServiceProbe[];
  protocol?: EcoFlowBleProtocolSupport;
  characteristics: EcoFlowBleReplayCharacteristicCapture[];
  protocolFrames?: EcoFlowBleProtocolFrameCapture[];
  decodedProtocolPackets?: EcoFlowBleDecodedProtocolPacketCapture[];
  safety: {
    rawManufacturerDataIncluded: false;
    providerSecretsIncluded: false;
    preciseLocationIncluded: false;
    replayPayloadBase64Included: true;
    rawProtocolFramesIncluded?: boolean;
    decryptedProtocolPayloadsIncluded?: boolean;
  };
}

export interface EcoFlowBleReplayCaptureInput extends EcoFlowBleDiagnosticTarget {
  deviceId?: string | null;
  model?: string | null;
  rssi?: number | null;
  characteristicMap?: Map<string, {
    serviceUuid?: string | null;
    characteristicUuid?: string | null;
    valueBase64?: string | null;
  }> | Record<string, {
    serviceUuid?: string | null;
    characteristicUuid?: string | null;
    valueBase64?: string | null;
  }> | null;
  services?: EcoFlowBleServiceProbe[] | null;
  protocolFrames?: EcoFlowBleProtocolFrameCapture[] | null;
  decodedProtocolPackets?: EcoFlowBleDecodedProtocolPacketCapture[] | null;
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

function compactUuid(value: unknown): string {
  return normalizeUuid(value).replace(/-/g, '');
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

function valueLengthFromBase64(value: string | null | undefined): number {
  const normalized = normalizeText(value);
  if (!normalized) return 0;
  try {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(normalized, 'base64').length;
    }
    if (typeof atob === 'function') {
      return atob(normalized).length;
    }
  } catch {}
  return 0;
}

export function buildEcoFlowBleProtocolFrameCapture(input: {
  direction: 'notify' | 'write';
  serviceUuid?: string | null;
  characteristicUuid?: string | null;
  valueBase64?: string | null;
  capturedAtOffsetMs?: number | null;
}): EcoFlowBleProtocolFrameCapture | null {
  const serviceUuid = normalizeUuid(input.serviceUuid);
  const characteristicUuid = normalizeUuid(input.characteristicUuid);
  const valueBase64 = normalizeText(input.valueBase64);
  if (!serviceUuid || !characteristicUuid || !valueBase64) return null;
  return {
    direction: input.direction,
    serviceUuid,
    characteristicUuid,
    valueBase64,
    valueLength: valueLengthFromBase64(valueBase64),
    valueFingerprint: fingerprintText(valueBase64),
    capturedAtOffsetMs: Math.max(0, Math.round(Number(input.capturedAtOffsetMs) || 0)),
  };
}

export function buildEcoFlowBleDecodedProtocolPacketCapture(input: {
  direction: 'notify' | 'write';
  valid?: boolean | null;
  src?: number | null;
  dst?: number | null;
  cmdSet?: number | null;
  cmdId?: number | null;
  version?: number | null;
  payloadLength?: number | null;
  payloadFirstByte?: number | null;
  payloadBase64?: string | null;
  payloadFingerprint?: string | null;
  packetBase64?: string | null;
  packetFingerprint?: string | null;
  decryptedPayloadBase64?: string | null;
  decryptedPayloadFingerprint?: string | null;
  decryptedPayloadLength?: number | null;
  parseError?: string | null;
  capturedAtOffsetMs?: number | null;
}): EcoFlowBleDecodedProtocolPacketCapture | null {
  const payloadBase64 = normalizeText(input.payloadBase64);
  const packetBase64 = normalizeText(input.packetBase64);
  const decryptedPayloadBase64 = normalizeText(input.decryptedPayloadBase64);
  const parseError = normalizeText(input.parseError);
  if (!payloadBase64 && !packetBase64 && !decryptedPayloadBase64 && !parseError) return null;
  const packet: EcoFlowBleDecodedProtocolPacketCapture = {
    direction: input.direction,
    valid: input.valid === true,
    capturedAtOffsetMs: Math.max(0, Math.round(Number(input.capturedAtOffsetMs) || 0)),
  };
  for (const [key, value] of Object.entries({
    src: input.src,
    dst: input.dst,
    cmdSet: input.cmdSet,
    cmdId: input.cmdId,
    version: input.version,
    payloadLength: input.payloadLength,
    payloadFirstByte: input.payloadFirstByte,
    decryptedPayloadLength: input.decryptedPayloadLength,
  })) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      (packet as unknown as Record<string, unknown>)[key] = value;
    }
  }
  if (payloadBase64) {
    packet.payloadBase64 = payloadBase64;
    packet.payloadFingerprint = normalizeText(input.payloadFingerprint) || fingerprintText(payloadBase64);
  }
  if (packetBase64) {
    packet.packetBase64 = packetBase64;
    packet.packetFingerprint = normalizeText(input.packetFingerprint) || fingerprintText(packetBase64);
  }
  if (decryptedPayloadBase64) {
    packet.decryptedPayloadBase64 = decryptedPayloadBase64;
    packet.decryptedPayloadFingerprint =
      normalizeText(input.decryptedPayloadFingerprint) || fingerprintText(decryptedPayloadBase64);
  }
  if (parseError) packet.parseError = parseError.slice(0, 160);
  return packet;
}

function replayCharacteristicEntries(
  map: EcoFlowBleReplayCaptureInput['characteristicMap'],
): Array<{ serviceUuid?: string | null; characteristicUuid?: string | null; valueBase64?: string | null }> {
  if (!map) return [];
  if (map instanceof Map) return Array.from(map.values());
  if (typeof map === 'object') return Object.values(map);
  return [];
}

export function isEcoFlowBleReplayCaptureEnabled(): boolean {
  try {
    if ((globalThis as Record<string, unknown>).__ECS_ECOFLOW_BLE_CAPTURE_ENABLED === true) return true;
  } catch {}
  try {
    return (
      typeof process !== 'undefined' &&
      (
        process.env?.EXPO_PUBLIC_ECS_ECOFLOW_BLE_CAPTURE === '1' ||
        process.env?.ECS_ECOFLOW_BLE_CAPTURE === '1'
      )
    );
  } catch {
    return false;
  }
}

export function buildEcoFlowBleReplayCapture(input: EcoFlowBleReplayCaptureInput): EcoFlowBleReplayCapture {
  const manufacturer = summarizeManufacturerData(input.manufacturerData);
  const serviceSummary = input.services ? summarizeEcoFlowBleServices(input.services) : null;
  const characteristics = replayCharacteristicEntries(input.characteristicMap)
    .map((entry) => {
      const serviceUuid = normalizeUuid(entry.serviceUuid);
      const characteristicUuid = normalizeUuid(entry.characteristicUuid);
      const valueBase64 = typeof entry.valueBase64 === 'string' ? entry.valueBase64 : null;
      return {
        serviceUuid,
        characteristicUuid,
        valueBase64,
        valueLength: valueLengthFromBase64(valueBase64),
        valueFingerprint: valueBase64 ? fingerprintText(valueBase64) : null,
      };
    })
    .filter((entry) => entry.serviceUuid && entry.characteristicUuid)
    .slice(0, 120);

  return {
    schema: 'ecs.ecoflow_ble.replay_capture',
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    providerId: 'ecoflow',
    captureMode: 'explicit_debug_opt_in',
    device: {
      idFingerprint: input.deviceId ? fingerprintText(input.deviceId) : null,
      name: normalizeText(input.displayName ?? input.localName) || null,
      model: normalizeText(input.model ?? input.categoryHint) || null,
      rssi: typeof input.rssi === 'number' && Number.isFinite(input.rssi) ? input.rssi : null,
      serviceUuids: (input.serviceUuids ?? []).map(normalizeUuid).filter(Boolean).slice(0, 40),
      manufacturerDataPresent: Boolean(manufacturer.manufacturerDataPresent),
      manufacturerDataLength: Number(manufacturer.manufacturerDataLength) || 0,
      manufacturerDataFingerprint: typeof manufacturer.manufacturerDataFingerprint === 'string'
        ? manufacturer.manufacturerDataFingerprint
        : null,
    },
    services: serviceSummary?.services,
    protocol: serviceSummary ? detectEcoFlowBleProtocolSupport(serviceSummary.services) : undefined,
    characteristics,
    protocolFrames: (input.protocolFrames ?? []).slice(0, 40),
    decodedProtocolPackets: (input.decodedProtocolPackets ?? []).slice(0, 80),
    safety: {
      rawManufacturerDataIncluded: false,
      providerSecretsIncluded: false,
      preciseLocationIncluded: false,
      replayPayloadBase64Included: true,
      rawProtocolFramesIncluded: Boolean(input.protocolFrames?.length),
      decryptedProtocolPayloadsIncluded: Boolean(input.decodedProtocolPackets?.length),
    },
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

export function detectEcoFlowBleProtocolSupport(
  services: EcoFlowBleServiceProbe[] | null | undefined,
): EcoFlowBleProtocolSupport {
  const characteristicUuids = new Set<string>();
  for (const service of services ?? []) {
    for (const characteristic of service.characteristics ?? []) {
      const characteristicUuid = compactUuid(characteristic.characteristicUuid);
      if (characteristicUuid) characteristicUuids.add(characteristicUuid);
    }
  }

  const hasRfcommWrite = characteristicUuids.has(compactUuid(ECOFLOW_BLE_PROTOCOL_CHARACTERISTICS.rfcomm.writeUuid));
  const hasRfcommNotify = characteristicUuids.has(compactUuid(ECOFLOW_BLE_PROTOCOL_CHARACTERISTICS.rfcomm.notifyUuid));
  const hasNordicUartWrite = characteristicUuids.has(compactUuid(ECOFLOW_BLE_PROTOCOL_CHARACTERISTICS.nordicUart.writeUuid));
  const hasNordicUartNotify = characteristicUuids.has(compactUuid(ECOFLOW_BLE_PROTOCOL_CHARACTERISTICS.nordicUart.notifyUuid));
  const hasAnyProtocolPair =
    (hasRfcommWrite && hasRfcommNotify) ||
    (hasNordicUartWrite && hasNordicUartNotify);

  return {
    hasRfcommWrite,
    hasRfcommNotify,
    hasNordicUartWrite,
    hasNordicUartNotify,
    hasAnyProtocolPair,
    protocolStatus: hasAnyProtocolPair
      ? 'ecoflow_ble_protocol_pair_present_auth_not_implemented'
      : 'ecoflow_ble_protocol_pair_missing',
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
