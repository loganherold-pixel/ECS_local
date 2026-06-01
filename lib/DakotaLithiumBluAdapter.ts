import { DEFAULT_BLU_CAPABILITIES, type BluDeviceCapabilities, type BluTelemetry } from './BluTypes';
import {
  createNativeBleBluAdapter,
  type NativeBleAdapterState as DakotaLithiumAdapterState,
  type NativeBleConnectResult as DakotaLithiumConnectResult,
  type NativeBleDiscoveredDevice as DakotaLithiumDiscoveredDevice,
  type NativeBlePollResult as DakotaLithiumPollResult,
} from './createNativeBleBluAdapter';

const DAKOTA_LITHIUM_CAPABILITIES: BluDeviceCapabilities = {
  ...DEFAULT_BLU_CAPABILITIES,
  hasBatteryPercent: true,
  hasInputWatts: true,
  hasOutputWatts: true,
  hasTemperature: true,
  hasRuntimeEstimate: true,
};

const DAKOTA_NAME_PATTERNS = [/dakota/i, /\bdl\+?/i, /lifepo4/i];

function inferDakotaModel(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  if (/135/i.test(trimmed)) return 'DL+ 135Ah';
  if (/200/i.test(trimmed)) return 'DL+ 200Ah';
  if (/54/i.test(trimmed)) return 'DL+ 54Ah';
  return trimmed;
}

function decodeDakotaTelemetry(): Partial<BluTelemetry> {
  return {
    status_text: 'Dakota Lithium direct Bluetooth telemetry live where supported. No API key required.',
  };
}

export type {
  DakotaLithiumAdapterState,
  DakotaLithiumConnectResult,
  DakotaLithiumDiscoveredDevice,
  DakotaLithiumPollResult,
};

export const dakotaLithiumBluAdapter = createNativeBleBluAdapter({
  provider: 'dakota_lithium',
  displayName: 'Dakota Lithium',
  capabilities: DAKOTA_LITHIUM_CAPABILITIES,
  isSupportedDevice: ({ name }) => {
    const deviceName = String(name ?? '').trim();
    return DAKOTA_NAME_PATTERNS.some((pattern) => pattern.test(deviceName));
  },
  getModelName: inferDakotaModel,
  decodeTelemetry: decodeDakotaTelemetry,
});

export default dakotaLithiumBluAdapter;
