import { DEFAULT_BLU_CAPABILITIES, type BluDeviceCapabilities, type BluTelemetry } from './BluTypes';
import {
  createNativeBleBluAdapter,
  type NativeBleAdapterState as RedarcAdapterState,
  type NativeBleConnectResult as RedarcConnectResult,
  type NativeBleDiscoveredDevice as RedarcDiscoveredDevice,
  type NativeBlePollResult as RedarcPollResult,
} from './createNativeBleBluAdapter';

const REDARC_CAPABILITIES: BluDeviceCapabilities = {
  ...DEFAULT_BLU_CAPABILITIES,
  hasBatteryPercent: true,
  hasInputWatts: true,
  hasOutputWatts: true,
  hasSolarInput: true,
  hasTemperature: true,
  hasRuntimeEstimate: true,
};

const REDARC_NAME_PATTERNS = [/redarc/i, /redvision/i, /manager\s*30/i, /tvms/i, /bcdc/i];

function inferRedarcModel(name: string): string | undefined {
  if (/manager\s*30/i.test(name)) return 'Manager30';
  if (/redvision/i.test(name)) return 'RedVision';
  if (/tvms/i.test(name)) return 'TVMS';
  if (/bcdc/i.test(name)) return 'BCDC';
  return name.trim() || undefined;
}

function decodeRedarcTelemetry(): Partial<BluTelemetry> {
  return {
    status_text: 'REDARC direct Bluetooth telemetry live. No API key required.',
  };
}

export type {
  RedarcAdapterState,
  RedarcConnectResult,
  RedarcDiscoveredDevice,
  RedarcPollResult,
};

export const redarcBluAdapter = createNativeBleBluAdapter({
  provider: 'redarc',
  displayName: 'REDARC',
  capabilities: REDARC_CAPABILITIES,
  isSupportedDevice: ({ name }) => {
    const deviceName = String(name ?? '').trim();
    return REDARC_NAME_PATTERNS.some((pattern) => pattern.test(deviceName));
  },
  getModelName: inferRedarcModel,
  decodeTelemetry: decodeRedarcTelemetry,
});

export default redarcBluAdapter;
