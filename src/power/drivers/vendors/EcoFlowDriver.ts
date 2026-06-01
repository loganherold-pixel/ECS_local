import type { BluTelemetry } from "../../../../lib/BluTypes";
import type { IPowerDriver } from "../IPowerDriver";
import type {
  PowerCapabilities,
  PowerTelemetry,
} from "../../types/PowerTelemetry";

type CharacteristicLike = {
  serviceUuid?: string | null;
  characteristicUuid?: string | null;
  valueBase64?: string | null;
};

type DecodedProtocolPacketLike = {
  valid?: boolean | null;
  src?: number | null;
  cmdSet?: number | null;
  cmdId?: number | null;
  version?: number | null;
  payloadBase64?: string | null;
  packetBase64?: string | null;
};

export interface EcoFlowBleDecodeContext {
  device?: {
    id?: string | null;
    name?: string | null;
    model?: string | null;
    manufacturerData?: string | null;
    serviceUUIDs?: string[] | null;
  } | null;
  characteristicMap?: Map<string, CharacteristicLike> | Record<string, CharacteristicLike> | null;
  decodedProtocolPackets?: DecodedProtocolPacketLike[] | null;
  previousTelemetry?: BluTelemetry | null;
  rssi?: number | null;
}

const ECOFLOW_CAPABILITIES: PowerCapabilities = {
  hasSOC: true,
  hasWattsIn: true,
  hasWattsOut: true,
  hasSolar: true,
  hasRuntimeEstimate: true,
  controllable: false,
};

const ECOFLOW_DEVICE_PATTERNS = [
  /ecoflow/i,
  /\bef[-_\s]?\d/i,
  /\bef[-_][a-z0-9]{4,}\b/i,
  /\bdelta\b/i,
  /\briver\b/i,
  /\bglacier\b/i,
  /\bwave\b/i,
  /\btrail\b/i,
  /\brapid\b/i,
];

const FIELD_ALIASES: Record<string, keyof BluTelemetry> = {
  soc: "battery_percent",
  battery: "battery_percent",
  batterypercent: "battery_percent",
  batterypercentage: "battery_percent",
  battery_percent: "battery_percent",
  stateofcharge: "battery_percent",
  battpct: "battery_percent",
  input: "input_watts",
  inputwatts: "input_watts",
  input_watts: "input_watts",
  inputpower: "input_watts",
  wattsin: "input_watts",
  output: "output_watts",
  outputwatts: "output_watts",
  output_watts: "output_watts",
  outputpower: "output_watts",
  wattsout: "output_watts",
  solar: "solar_input_watts",
  solarwatts: "solar_input_watts",
  solar_input_watts: "solar_input_watts",
  solarinputwatts: "solar_input_watts",
  pvwatts: "solar_input_watts",
  acinputwatts: "ac_input_watts",
  ac_input_watts: "ac_input_watts",
  acoutputwatts: "ac_output_watts",
  ac_output_watts: "ac_output_watts",
  dcoutputwatts: "dc_output_watts",
  dc_output_watts: "dc_output_watts",
  temperature: "temperature_celsius",
  temp: "temperature_celsius",
  tempc: "temperature_celsius",
  temperaturecelsius: "temperature_celsius",
  temperature_celsius: "temperature_celsius",
  voltage: "battery_volts",
  volts: "battery_volts",
  batteryvolts: "battery_volts",
  battery_volts: "battery_volts",
  current: "battery_amps",
  amps: "battery_amps",
  batteryamps: "battery_amps",
  battery_amps: "battery_amps",
  runtime: "estimated_runtime_minutes",
  runtimeminutes: "estimated_runtime_minutes",
  estimatedruntimeminutes: "estimated_runtime_minutes",
  estimated_runtime_minutes: "estimated_runtime_minutes",
  capacity: "capacity_wh",
  capacitywh: "capacity_wh",
  capacity_wh: "capacity_wh",
  cycles: "charge_cycles",
  chargecycles: "charge_cycles",
  charge_cycles: "charge_cycles",
  health: "health_percent",
  healthpercent: "health_percent",
  health_percent: "health_percent",
};

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
}

function finiteNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const numeric = Number(value.replace(/[^\d.+-]/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function clampMetric(field: keyof BluTelemetry, value: number): number | null {
  if (field === "battery_percent" || field === "health_percent") {
    return value >= 0 && value <= 100 ? value : null;
  }
  if (
    field === "input_watts" ||
    field === "output_watts" ||
    field === "solar_input_watts" ||
    field === "ac_input_watts" ||
    field === "ac_output_watts" ||
    field === "dc_output_watts" ||
    field === "estimated_runtime_minutes" ||
    field === "capacity_wh" ||
    field === "charge_cycles"
  ) {
    return value >= 0 ? value : null;
  }
  if (field === "temperature_celsius") {
    return value >= -50 && value <= 125 ? value : null;
  }
  if (field === "battery_volts") {
    return value > 0 && value <= 300 ? value : null;
  }
  if (field === "battery_amps") {
    return Math.abs(value) <= 500 ? value : null;
  }
  return value;
}

function setMetric(
  output: Partial<BluTelemetry>,
  decodedKeys: Set<string>,
  field: keyof BluTelemetry,
  value: unknown,
): void {
  const numeric = finiteNumber(value);
  if (numeric == null) return;
  const clamped = clampMetric(field, numeric);
  if (clamped == null) return;
  (output as Record<string, unknown>)[field] = clamped;
  decodedKeys.add(String(field));
}

function assignMetric(
  output: Partial<BluTelemetry>,
  decodedKeys: Set<string>,
  rawKey: string,
  value: unknown,
): void {
  const field = FIELD_ALIASES[normalizeToken(rawKey)];
  if (!field) return;
  const numeric = finiteNumber(value);
  if (numeric == null) return;
  const clamped = clampMetric(field, numeric);
  if (clamped == null) return;
  (output as Record<string, unknown>)[field] = clamped;
  decodedKeys.add(String(field));
}

function walkRecord(
  value: unknown,
  output: Partial<BluTelemetry>,
  decodedKeys: Set<string>,
  path: string[] = [],
): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    assignMetric(output, decodedKeys, key, nested);
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      walkRecord(nested, output, decodedKeys, [...path, key]);
    }
  }
}

function decodeBase64(value: string | null | undefined): Uint8Array | null {
  if (!value) return null;
  try {
    const bufferCtor = (globalThis as { Buffer?: { from(input: string, encoding: string): Uint8Array } }).Buffer;
    if (bufferCtor) {
      return Uint8Array.from(bufferCtor.from(value, "base64"));
    }
    if (typeof atob === "function") {
      const binary = atob(value);
      return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
    }
  } catch {}
  return null;
}

function decodeUtf8(value: string | null | undefined): string | null {
  const bytes = decodeBase64(value);
  if (!bytes || bytes.length === 0) return null;
  try {
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder("utf-8").decode(bytes).replace(/\0/g, "").trim() || null;
    }
  } catch {}
  try {
    return String.fromCharCode(...bytes).replace(/\0/g, "").trim() || null;
  } catch {
    return null;
  }
}

function characteristicEntries(
  map: EcoFlowBleDecodeContext["characteristicMap"],
): CharacteristicLike[] {
  if (!map) return [];
  if (map instanceof Map) return Array.from(map.values());
  if (typeof map === "object") return Object.values(map);
  return [];
}

function decodedProtocolPacketPayload(packet: DecodedProtocolPacketLike): Uint8Array | null {
  const payload = decodeBase64(packet.payloadBase64);
  if (!payload || payload.length === 0) return null;
  const packetBytes = decodeBase64(packet.packetBase64);
  const seq0 = packetBytes && packetBytes.length > 6 ? packetBytes[6] : 0;
  if (!seq0) return payload;
  return Uint8Array.from(payload, (byte) => byte ^ seq0);
}

function readUInt16LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null;
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readInt32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  const value =
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >> 0;
  return value;
}

function readUInt32LE(bytes: Uint8Array, offset: number): number | null {
  const signed = readInt32LE(bytes, offset);
  return signed == null ? null : signed >>> 0;
}

function readFloat32LE(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  try {
    return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, true);
  } catch {
    return null;
  }
}

function decodeEcoFlowDelta2PdHeartbeat(
  payload: Uint8Array,
  telemetry: Partial<BluTelemetry>,
  decodedKeys: Set<string>,
): boolean {
  if (payload.length < 23) return false;
  const soc = payload[14];
  const wattsOut = readUInt16LE(payload, 15);
  const wattsIn = readUInt16LE(payload, 17);
  const remainTime = readInt32LE(payload, 19);

  const before = decodedKeys.size;
  setMetric(telemetry, decodedKeys, "battery_percent", soc);
  if (wattsOut != null) setMetric(telemetry, decodedKeys, "output_watts", wattsOut);
  if (wattsIn != null) setMetric(telemetry, decodedKeys, "input_watts", wattsIn);
  if (remainTime != null && remainTime >= 0) {
    setMetric(telemetry, decodedKeys, "estimated_runtime_minutes", remainTime);
  }
  return decodedKeys.size > before;
}

function decodeEcoFlowDelta2EmsHeartbeat(
  payload: Uint8Array,
  telemetry: Partial<BluTelemetry>,
  decodedKeys: Set<string>,
): boolean {
  if (payload.length < 30) return false;
  const lcdSoc = payload[14];
  const chargeRemain = readUInt32LE(payload, 17);
  const dischargeRemain = readUInt32LE(payload, 21);
  const floatSoc = readFloat32LE(payload, 26);

  const before = decodedKeys.size;
  if (floatSoc != null && floatSoc >= 0 && floatSoc <= 100) {
    setMetric(telemetry, decodedKeys, "battery_percent", Math.round(floatSoc * 100) / 100);
  } else {
    setMetric(telemetry, decodedKeys, "battery_percent", lcdSoc);
  }
  if (dischargeRemain != null && dischargeRemain > 0 && dischargeRemain < 100000) {
    setMetric(telemetry, decodedKeys, "estimated_runtime_minutes", dischargeRemain);
  } else if (chargeRemain != null && chargeRemain > 0 && chargeRemain < 100000) {
    setMetric(telemetry, decodedKeys, "estimated_runtime_minutes", chargeRemain);
  }
  return decodedKeys.size > before;
}

function decodeEcoFlowDelta2MpptHeartbeat(
  payload: Uint8Array,
  telemetry: Partial<BluTelemetry>,
  decodedKeys: Set<string>,
): boolean {
  if (payload.length < 18) return false;
  const inputWatts = readUInt16LE(payload, 16);
  const before = decodedKeys.size;
  if (inputWatts != null) {
    setMetric(telemetry, decodedKeys, "solar_input_watts", inputWatts);
  }
  return decodedKeys.size > before;
}

function decodeEcoFlowDelta2InvHeartbeat(
  payload: Uint8Array,
  telemetry: Partial<BluTelemetry>,
  decodedKeys: Set<string>,
): boolean {
  if (payload.length < 13) return false;
  const inputWatts = readUInt16LE(payload, 9);
  const outputWatts = readUInt16LE(payload, 11);
  const before = decodedKeys.size;
  if (inputWatts != null) {
    setMetric(telemetry, decodedKeys, "ac_input_watts", inputWatts);
    setMetric(telemetry, decodedKeys, "input_watts", inputWatts);
  }
  if (outputWatts != null) {
    setMetric(telemetry, decodedKeys, "ac_output_watts", outputWatts);
    setMetric(telemetry, decodedKeys, "output_watts", outputWatts);
  }
  return decodedKeys.size > before;
}

function decodeProtocolPackets(
  packets: DecodedProtocolPacketLike[] | null | undefined,
  telemetry: Partial<BluTelemetry>,
  decodedKeys: Set<string>,
): string[] {
  const decodedPacketKeys: string[] = [];
  for (const packet of packets ?? []) {
    if (packet.valid !== true) continue;
    const src = packet.src;
    const cmdSet = packet.cmdSet;
    const cmdId = packet.cmdId;
    const payload = decodedProtocolPacketPayload(packet);
    if (!payload) continue;

    let decoded = false;
    if (cmdSet === 0x20 && cmdId === 0x02 && src === 0x02) {
      decoded = decodeEcoFlowDelta2PdHeartbeat(payload, telemetry, decodedKeys);
    } else if (cmdSet === 0x20 && cmdId === 0x02 && src === 0x03) {
      decoded = decodeEcoFlowDelta2EmsHeartbeat(payload, telemetry, decodedKeys);
    } else if (cmdSet === 0x20 && cmdId === 0x02 && src === 0x05) {
      decoded = decodeEcoFlowDelta2MpptHeartbeat(payload, telemetry, decodedKeys);
    } else if (cmdId === 0x02 && src === 0x04) {
      decoded = decodeEcoFlowDelta2InvHeartbeat(payload, telemetry, decodedKeys);
    }
    if (decoded) decodedPacketKeys.push(`${src}:${cmdSet}:${cmdId}`);
  }
  return Array.from(new Set(decodedPacketKeys));
}

function parseTextPayload(
  text: string,
  output: Partial<BluTelemetry>,
  decodedKeys: Set<string>,
): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        parsed.forEach((entry) => walkRecord(entry, output, decodedKeys));
      } else {
        walkRecord(parsed, output, decodedKeys);
      }
      return decodedKeys.size > 0;
    } catch {
      return false;
    }
  }

  const before = decodedKeys.size;
  for (const match of trimmed.matchAll(/([a-zA-Z][a-zA-Z0-9_\-\s]{1,32})\s*[:=]\s*(-?\d+(?:\.\d+)?)/g)) {
    assignMetric(output, decodedKeys, match[1], match[2]);
  }
  return decodedKeys.size > before;
}

function decodedBluetoothFields(telemetry: Partial<BluTelemetry>): string[] {
  return [
    "battery_percent",
    "input_watts",
    "output_watts",
    "solar_input_watts",
    "ac_input_watts",
    "ac_output_watts",
    "dc_output_watts",
    "temperature_celsius",
    "battery_volts",
    "battery_amps",
    "estimated_runtime_minutes",
    "capacity_wh",
    "charge_cycles",
    "health_percent",
  ].filter((key) => typeof (telemetry as Record<string, unknown>)[key] === "number");
}

function normalizePowerTelemetry(telemetry: Partial<BluTelemetry>, raw: unknown): Partial<PowerTelemetry> {
  const hasDecodedFields = decodedBluetoothFields(telemetry).length > 0;
  if (!hasDecodedFields) return {};
  const now = Date.now();
  return {
    timestamp: now,
    source: "ble",
    isLive: true,
    device: {
      id: String((raw as Record<string, unknown>)?.deviceId ?? (raw as Record<string, unknown>)?.device_id ?? "ecoflow-ble"),
      vendor: "ecoflow",
      model: String((raw as Record<string, unknown>)?.model ?? (raw as Record<string, unknown>)?.deviceName ?? "EcoFlow"),
    },
    battery: {
      socPct: telemetry.battery_percent,
      volts: telemetry.battery_volts,
      amps: telemetry.battery_amps,
      wattsIn: telemetry.input_watts,
      wattsOut: telemetry.output_watts,
      tempC: telemetry.temperature_celsius,
      cycles: telemetry.charge_cycles,
      healthPct: telemetry.health_percent,
      estRuntimeMin: telemetry.estimated_runtime_minutes,
    },
    solar: {
      watts: telemetry.solar_input_watts,
    },
    flags: {
      charging: (telemetry.input_watts ?? telemetry.solar_input_watts ?? 0) > 0,
      inverterOn: (telemetry.output_watts ?? telemetry.ac_output_watts ?? 0) > 0,
    },
    capabilities: ECOFLOW_CAPABILITIES,
    quality: {
      rssi: telemetry.signal_strength,
      lastPacketAt: now,
      connection: "connected",
    },
  };
}

export function isEcoFlowBleDevice(deviceInfo: unknown): boolean {
  if (!deviceInfo || typeof deviceInfo !== "object") return false;
  const record = deviceInfo as Record<string, unknown>;
  const serviceText = Array.isArray(record.serviceUUIDs)
    ? record.serviceUUIDs.join(" ")
    : Array.isArray(record.advertisedServiceUuids)
      ? record.advertisedServiceUuids.join(" ")
      : "";
  const text = [
    record.providerId,
    record.name,
    record.localName,
    record.model,
    record.displayName,
    record.manufacturerData,
    serviceText,
  ].filter(Boolean).join(" ");
  return ECOFLOW_DEVICE_PATTERNS.some((pattern) => pattern.test(text));
}

export function getEcoFlowBleModelName(deviceName: string): string {
  const cleaned = deviceName.trim();
  if (!cleaned) return "EcoFlow Device";
  if (/delta/i.test(cleaned)) return cleaned.replace(/\s+/g, " ");
  if (/river/i.test(cleaned)) return cleaned.replace(/\s+/g, " ");
  if (/glacier/i.test(cleaned)) return cleaned.replace(/\s+/g, " ");
  if (/wave/i.test(cleaned)) return cleaned.replace(/\s+/g, " ");
  return cleaned;
}

export function parseEcoFlowBleTelemetry(raw: unknown): Partial<BluTelemetry> {
  const telemetry: Partial<BluTelemetry> = {};
  const decodedKeys = new Set<string>();

  if (raw && typeof raw === "object") {
    walkRecord(raw, telemetry, decodedKeys);
  } else if (typeof raw === "string") {
    parseTextPayload(raw, telemetry, decodedKeys);
  }

  const fields = decodedBluetoothFields(telemetry);
  if (fields.length === 0) return {};
  return {
    ...telemetry,
    status_text: "EcoFlow BLE telemetry decoded.",
    raw: {
      parserId: "ecoflow_native_ble_v1",
      decodedKeys: fields,
      parseMode: typeof raw === "string" ? "text" : "structured",
    },
  };
}

export function decodeEcoFlowBleTelemetry(ctx: EcoFlowBleDecodeContext): Partial<BluTelemetry> {
  const telemetry: Partial<BluTelemetry> = {};
  const decodedKeys = new Set<string>();
  const textCharacteristics: string[] = [];

  for (const characteristic of characteristicEntries(ctx.characteristicMap)) {
    const text = decodeUtf8(characteristic.valueBase64);
    if (!text) continue;
    if (parseTextPayload(text, telemetry, decodedKeys)) {
      textCharacteristics.push(`${characteristic.serviceUuid ?? "unknown"}:${characteristic.characteristicUuid ?? "unknown"}`);
    }
  }

  if (ctx.rssi != null) {
    telemetry.signal_strength = ctx.rssi;
  }

  const decodedProtocolPacketKeys = decodeProtocolPackets(
    ctx.decodedProtocolPackets,
    telemetry,
    decodedKeys,
  );

  const fields = decodedBluetoothFields(telemetry);
  if (fields.length === 0) {
    return {
      raw: {
        parserId: "ecoflow_native_ble_v1",
        readableCharacteristics: characteristicEntries(ctx.characteristicMap).length,
        decodedProtocolPacketCount: ctx.decodedProtocolPackets?.length ?? 0,
        decodedKeys: [],
        parserStatus: "no_ecoflow_fields_in_readable_characteristics",
        rssi: ctx.rssi ?? null,
      },
    };
  }

  return {
    ...telemetry,
    status_text: "EcoFlow BLE telemetry decoded.",
    raw: {
      parserId: "ecoflow_native_ble_v1",
      readableCharacteristics: characteristicEntries(ctx.characteristicMap).length,
      decodedProtocolPacketCount: ctx.decodedProtocolPackets?.length ?? 0,
      decodedKeys: fields,
      textCharacteristics,
      decodedProtocolPackets: decodedProtocolPacketKeys,
      parserStatus: decodedProtocolPacketKeys.length > 0
        ? "decoded_protocol_packets_delta2_delta3_v1"
        : "decoded_readable_characteristics",
      rssi: ctx.rssi ?? null,
      deviceName: ctx.device?.name ?? null,
    },
  };
}

export class EcoFlowDriver implements IPowerDriver {
  readonly id = "ecoflow.ble.v1";
  readonly vendor = "ecoflow";

  supports(deviceInfo: unknown): boolean {
    return isEcoFlowBleDevice(deviceInfo);
  }

  parse(raw: unknown): Partial<PowerTelemetry> {
    return normalizePowerTelemetry(parseEcoFlowBleTelemetry(raw), raw);
  }

  getCapabilities(): PowerCapabilities {
    return { ...ECOFLOW_CAPABILITIES };
  }
}
