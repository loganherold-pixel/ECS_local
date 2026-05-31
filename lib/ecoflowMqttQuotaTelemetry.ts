import type { PowerTelemetry } from '../src/power/types/PowerTelemetry';
import { normalizePowerTelemetryTruth } from '../src/power/types/PowerTelemetry';

export interface EcoFlowMqttQuotaFrameInput {
  topic?: string | null;
  payload: unknown;
  deviceId?: string | null;
  deviceName?: string | null;
  model?: string | null;
  receivedAt?: number;
}

export interface EcoFlowMqttQuotaTelemetryResult {
  deviceId: string | null;
  telemetry: Partial<PowerTelemetry> | null;
  params: Record<string, unknown>;
  typeCode: string | null;
  hasPowerValues: boolean;
}

function readFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function readString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parsePayload(payload: unknown): Record<string, unknown> | null {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    return payload as Record<string, unknown>;
  }
  if (typeof payload === 'string' && payload.trim()) {
    try {
      const parsed = JSON.parse(payload);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : null;
    } catch {
      return null;
    }
  }
  return null;
}

function inferDeviceIdFromTopic(topic: string | null | undefined): string | null {
  const text = readString(topic);
  if (!text) return null;
  const match = text.match(/^\/open\/[^/]+\/([^/]+)\/(?:quota|status|set_reply|get_reply)$/);
  return match?.[1] ?? null;
}

function readParam(params: Record<string, unknown>, aliases: string[]): number | null {
  for (const alias of aliases) {
    const value = readFiniteNumber(params[alias]);
    if (value != null) return value;
  }
  return null;
}

function sumParams(params: Record<string, unknown>, aliases: string[]): number | null {
  let total = 0;
  let found = false;
  for (const alias of aliases) {
    const value = readFiniteNumber(params[alias]);
    if (value == null) continue;
    total += Math.max(0, value);
    found = true;
  }
  return found ? total : null;
}

function normalizeVolts(value: number | null): number | undefined {
  if (value == null) return undefined;
  if (value > 1000) return Math.round((value / 1000) * 1000) / 1000;
  return value;
}

function normalizeTemperatureC(value: number | null): number | undefined {
  if (value == null) return undefined;
  return value > 200 ? Math.round((value / 10) * 10) / 10 : value;
}

function normalizeRuntimeMinutes(value: number | null): number | undefined {
  if (value == null) return undefined;
  const abs = Math.abs(value);
  if (abs === 0 || abs >= 5999) return undefined;
  return Math.round(abs);
}

function hasNumericValue(...values: Array<number | undefined>): boolean {
  return values.some((value) => typeof value === 'number' && Number.isFinite(value));
}

export function normalizeEcoFlowMqttQuotaTelemetry(
  input: EcoFlowMqttQuotaFrameInput,
): EcoFlowMqttQuotaTelemetryResult {
  const parsed = parsePayload(input.payload);
  const params = parsed?.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params)
    ? parsed.params as Record<string, unknown>
    : {};
  const receivedAt = input.receivedAt ?? Date.now();
  const deviceId = readString(input.deviceId) ?? inferDeviceIdFromTopic(input.topic);
  const typeCode = readString(parsed?.typeCode);

  const socPct = readParam(params, [
    'bmsMaster.soc',
    'soc',
    'batPct',
    'lcdSoc',
    'f32LcdSoc',
  ]);
  const wattsIn = readParam(params, [
    'bmsMaster.inputWatts',
    'bmsMaster.inWatts',
    'mppt.carInputWatts',
    'mppt.chgWatts',
    'inWatts',
    'pd.wattsInSum',
    'wattsInSum',
  ]);
  const wattsOut = readParam(params, [
    'bmsMaster.outputWatts',
    'bmsMaster.outWatts',
    'outWatts',
    'pd.wattsOutSum',
    'wattsOutSum',
    'pd.motorWat',
    'motorWat',
  ]);
  const solarWattsRaw = readParam(params, [
    'mppt.inWatts',
    'mppt.inputWatts',
    'mppt.inputPower',
    'mppt.watts',
    'mppt.pvPower',
    'mppt.solarWatts',
    'mppt.solarPower',
    'mpptPv.pvPower',
    'mpptPv.inputWatts',
    'mpptWatts',
    'pv.power',
    'pv.watts',
    'pv.inputWatts',
    'pd.pvPower',
    'pd.pvInPower',
    'pd.pvTotalPower',
    'pd.pvWatts',
    'pd.pvInputWatts',
    'pd.solarWatts',
    'pd.solarInputWatts',
    'pd.solarInputPower',
    'battery.solarWatts',
    'battery.solarInputWatts',
    'solar.watts',
    'solar.inputWatts',
    'solar.inputPower',
    'pvPower',
    'pvInPower',
    'pvTotalPower',
    'pvWatts',
    'solarWatts',
    'solarInputWatts',
    'solarInputPower',
    'solar_input_watts',
    'solar_power',
  ]);
  const solarWatts = solarWattsRaw ?? sumParams(params, [
    'pd.pv1InputWatts',
    'pv1InputWatts',
    'pd.pv2InputWatts',
    'pv2InputWatts',
    'pd.pv1Power',
    'pv1Power',
    'pd.pv2Power',
    'pv2Power',
    'pd.pvHInputWatts',
    'pvHInputWatts',
    'pd.pvLInputWatts',
    'pvLInputWatts',
    'pd.powGetPvH',
    'powGetPvH',
    'pd.powGetPvL',
    'powGetPvL',
  ]);
  const volts = normalizeVolts(readParam(params, [
    'bmsMaster.vol',
    'vol',
    'chgVol',
    'motorVol',
  ]));
  const tempC = normalizeTemperatureC(readParam(params, [
    'bmsMaster.temp',
    'tmp',
    'temp',
    'maxCellTmp',
    'minCellTmp',
  ]));
  const estRuntimeMin = normalizeRuntimeMinutes(readParam(params, [
    'pd.remainTime',
    'remainTime',
    'dsgRemain',
    'batTime',
  ]));

  const hasPowerValues = hasNumericValue(
    socPct ?? undefined,
    wattsIn ?? undefined,
    wattsOut ?? undefined,
    solarWatts ?? undefined,
    volts,
    tempC,
    estRuntimeMin,
  );

  if (!deviceId || !hasPowerValues) {
    return {
      deviceId,
      telemetry: null,
      params,
      typeCode,
      hasPowerValues,
    };
  }

  const telemetry: Partial<PowerTelemetry> = {
    timestamp: receivedAt,
    source: 'cloud',
    sourceLabel: 'EcoFlow MQTT',
    isLive: true,
    device: {
      id: deviceId,
      vendor: 'EcoFlow',
      model: input.model ?? input.deviceName ?? typeCode ?? 'EcoFlow Device',
      serial: deviceId,
    },
    battery: {
      socPct: socPct ?? undefined,
      volts,
      wattsIn: wattsIn ?? undefined,
      wattsOut: wattsOut ?? undefined,
      tempC,
      estRuntimeMin,
    },
    solar: {
      watts: solarWatts ?? undefined,
    },
    flags: {
      charging:
        wattsIn != null || solarWatts != null || wattsOut != null
          ? (wattsIn ?? 0) + (solarWatts ?? 0) > (wattsOut ?? 0)
          : undefined,
      lowBattery: socPct != null ? socPct < 15 : undefined,
      stale: false,
    },
    capabilities: {
      hasSOC: socPct != null,
      hasWattsIn: wattsIn != null,
      hasWattsOut: wattsOut != null,
      hasSolar: solarWatts != null,
      hasRuntimeEstimate: estRuntimeMin != null,
      controllable: false,
    },
    quality: {
      connection: 'connected',
      lastPacketAt: receivedAt,
    },
  };

  telemetry.truth = normalizePowerTelemetryTruth(telemetry, receivedAt);

  return {
    deviceId,
    telemetry,
    params,
    typeCode,
    hasPowerValues,
  };
}
