import { supabase } from './supabase';

export interface EcoFlowBleAuthPayloadRequest {
  deviceIdHint?: string | null;
  deviceNameHint?: string | null;
  modelHint?: string | null;
}

export interface EcoFlowBleAuthPayloadResult {
  authPayloadBase64: string;
  authPayloadFingerprint: string | null;
  deviceSerialFingerprint: string | null;
  deviceSerialSuffix: string | null;
  accountFingerprint: string | null;
}

function readString(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
}

export async function requestEcoFlowBleAuthPayload(
  request: EcoFlowBleAuthPayloadRequest,
): Promise<EcoFlowBleAuthPayloadResult> {
  const { data, error } = await supabase.functions.invoke('ecoflow', {
    body: {
      action: 'bleAuthPayload',
      deviceIdHint: request.deviceIdHint ?? null,
      deviceNameHint: request.deviceNameHint ?? null,
      modelHint: request.modelHint ?? null,
    },
  });

  if (error) {
    throw new Error(error.message ?? 'EcoFlow BLE auth payload request failed.');
  }
  if (!data?.ok) {
    throw new Error(
      String(
        data?.message ??
          data?.error?.message ??
          data?.code ??
          'EcoFlow BLE auth payload is unavailable.',
      ),
    );
  }

  const bleAuth =
    data.bleAuth && typeof data.bleAuth === 'object'
      ? (data.bleAuth as Record<string, unknown>)
      : null;
  const authPayloadBase64 = readString(bleAuth?.authPayloadBase64);
  if (!authPayloadBase64) {
    throw new Error('EcoFlow BLE auth payload response did not include a payload.');
  }

  return {
    authPayloadBase64,
    authPayloadFingerprint: readString(bleAuth?.authPayloadFingerprint),
    deviceSerialFingerprint: readString(bleAuth?.deviceSerialFingerprint),
    deviceSerialSuffix: readString(bleAuth?.deviceSerialSuffix),
    accountFingerprint: readString(bleAuth?.accountFingerprint),
  };
}
