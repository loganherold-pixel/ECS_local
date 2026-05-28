import type { BluProviderId, BluConnectionState, BluTelemetry } from './BluTypes';
import { DEFAULT_BLU_CAPABILITIES } from './BluTypes';
import { ecsProviderRegistry } from './EcsProviderRegistry';
import { ensureEcsPowerProvidersRegistered } from './ecsLiveSystemBootstrap';
import type { EcsConnectResult, EcsNormalizedReading } from './IEcsPowerProvider';
import { getProviderMeta } from './BluProviderRegistry';
import { getBluetoothTelemetrySourceLabel } from './bluetoothLiveTelemetry';
import { recordBluetoothDiagnosticEvent } from './bluetoothDiagnostics';
import { getBluestackParserDecision } from './bluestack';
import {
  buildPowerBluTelemetryEnvelope,
  withBluPowerTelemetryEnvelope,
} from './bluTelemetryEnvelope';
import {
  bluLog,
  bluLogThrottled,
  buildBluConnectionAttemptLogDetails,
  buildBluTelemetryLogDetails,
  buildBluTimeoutLogDetails,
  getBluVendorPrefix,
} from './bluDiagnosticsLog';

export type PowerBrandAdapterCapability =
  | 'connectable'
  | 'telemetry_active'
  | 'capability_error'
  | 'connection_support_pending'
  | 'api_required'
  | 'unsupported';

export type PowerBrandConnectionPhase =
  | 'discovered'
  | 'connecting_native_transport'
  | 'discovering_services'
  | 'provider_handshake'
  | 'telemetry_setup'
  | 'streaming'
  | 'error'
  | 'disconnected';

export interface PowerBrandAdapterDevice {
  providerId: string;
  rawId: string;
  name: string;
  model?: string | null;
  connectionType?: string | null;
  signalStrength?: number | null;
}

export interface PowerBrandAdvertisement {
  id?: string | null;
  providerId?: string | null;
  name?: string | null;
  localName?: string | null;
  serviceUuids?: string[] | null;
  advertisedServiceUuids?: string[] | null;
  manufacturerData?: unknown;
}

export interface PowerBrandProviderConnection {
  providerId: BluProviderId;
  deviceId: string;
  displayName?: string | null;
  transport: 'ble' | 'cloud' | 'hybrid' | 'unknown';
  phase: PowerBrandConnectionPhase;
}

export interface PowerBrandAdapterStatus {
  providerId: BluProviderId;
  state: BluConnectionState | 'discovered';
  capability: PowerBrandAdapterCapability;
  phase: PowerBrandConnectionPhase;
  label: string;
  detail: string;
}

export interface PowerBrandProviderCapabilities {
  supportsLiveTelemetry: boolean;
  supportsControl: boolean;
  supportsBle: boolean;
  supportsCloud: boolean;
  supportsBatteryPercent: boolean;
  supportsInputWatts: boolean;
  supportsOutputWatts: boolean;
  supportsRuntimeEstimate: boolean;
}

export interface PowerBrandConnectResult {
  success: boolean;
  deviceCount: number;
  devices: EcsConnectResult['devices'];
  status: PowerBrandAdapterStatus;
  error?: string;
  errorCode?: string;
}

export type PowerTelemetryUnsubscribe = () => void;

export interface PowerBrandConnectionAdapter {
  readonly providerId: BluProviderId;
  readonly displayName: string;
  readonly capability: PowerBrandAdapterCapability;
  canClassifyAdvertisement(advertisement: PowerBrandAdvertisement): boolean;
  canHandle(device: PowerBrandAdapterDevice): boolean;
  connect(device: PowerBrandAdapterDevice): Promise<PowerBrandConnectResult>;
  discoverCapabilities(connection: PowerBrandProviderConnection): Promise<PowerBrandProviderCapabilities>;
  startTelemetry(
    connection: PowerBrandProviderConnection,
    callback: (telemetry: EcsNormalizedReading) => void,
  ): Promise<PowerTelemetryUnsubscribe>;
  stopTelemetry(connection?: PowerBrandProviderConnection): Promise<void>;
  disconnect(device?: PowerBrandAdapterDevice): Promise<void>;
  readStatus(device?: PowerBrandAdapterDevice): PowerBrandAdapterStatus;
  getCapabilities(): PowerBrandProviderCapabilities;
  subscribeTelemetry?(
    device: PowerBrandAdapterDevice,
    callback: (telemetry: EcsNormalizedReading) => void,
  ): PowerTelemetryUnsubscribe;
  normalizeTelemetry(raw: unknown, device?: PowerBrandAdapterDevice): EcsNormalizedReading | null;
}

const SCANNER_POWER_PROVIDER_IDS: BluProviderId[] = [
  'bluetti',
  'anker_solix',
  'jackery',
  'goal_zero',
  'renogy',
  'redarc',
  'dakota_lithium',
  'victron',
];

const PROVIDER_PENDING_COPY: Partial<Record<BluProviderId, string>> = {
  redarc: 'REDARC devices are discoverable. ECS will connect when a compatible Bluetooth telemetry profile is available for this model.',
  dakota_lithium: 'Dakota Lithium devices are discoverable. ECS will connect where the battery exposes readable Bluetooth telemetry.',
};

function isBluProviderId(value: string): value is BluProviderId {
  return [
    'ecoflow',
    'anker_solix',
    'jackery',
    'bluetti',
    'goal_zero',
    'renogy',
    'redarc',
    'dakota_lithium',
    'victron',
  ].includes(value);
}

function getProviderDisplayName(providerId: BluProviderId): string {
  return getProviderMeta(providerId)?.displayName ?? providerId;
}

function makeStatus(
  providerId: BluProviderId,
  state: PowerBrandAdapterStatus['state'],
  capability: PowerBrandAdapterCapability,
  detail?: string,
  phase: PowerBrandConnectionPhase = state === 'connected' ? 'streaming' : state === 'error' ? 'error' : 'discovered',
): PowerBrandAdapterStatus {
  const displayName = getProviderDisplayName(providerId);
  const label =
    capability === 'telemetry_active'
      ? 'Telemetry Active'
      : capability === 'connectable'
        ? 'Connectable'
        : capability === 'capability_error'
          ? 'Capability Error'
            : capability === 'api_required'
              ? 'API Required'
            : capability === 'connection_support_pending'
              ? 'Parser Pending'
              : 'Unsupported';

  return {
    providerId,
    state,
    capability,
    phase,
    label,
    detail: detail ?? `${displayName} connection support is ${label.toLowerCase()}.`,
  };
}

function getAdapterCapabilityForProvider(providerId: BluProviderId): PowerBrandAdapterCapability {
  const parserDecision = getBluestackParserDecision(providerId);
  if (parserDecision.action === 'use_ecoflow_cloud') return 'api_required';
  if (parserDecision.canDecodeLiveTelemetry) return 'connectable';
  return parserDecision.status === 'profile_only' ? 'unsupported' : 'connection_support_pending';
}

function getParserPendingStatus(providerId: BluProviderId, state: PowerBrandAdapterStatus['state'] = 'discovered'): PowerBrandAdapterStatus {
  const parserDecision = getBluestackParserDecision(providerId);
  return makeStatus(
    providerId,
    state,
    getAdapterCapabilityForProvider(providerId),
    PROVIDER_PENDING_COPY[providerId] ?? parserDecision.reason,
    state === 'error' ? 'error' : 'discovered',
  );
}

function normalizeNumber(value: unknown): number | null {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeChargingState(raw: Record<string, unknown>): EcsNormalizedReading['chargingState'] {
  const explicit = String(raw.chargingState ?? raw.charging_state ?? raw.stateOfCharge ?? raw.status ?? '').toLowerCase();
  if (/discharg/.test(explicit)) return 'discharging';
  if (/charg/.test(explicit)) return 'charging';
  if (/full/.test(explicit)) return 'full';
  if (/float/.test(explicit)) return 'float';

  const inputWatts = normalizeNumber(raw.inputWatts ?? raw.input_watts ?? raw.inputPower);
  const outputWatts = normalizeNumber(raw.outputWatts ?? raw.output_watts ?? raw.outputPower);
  if ((inputWatts ?? 0) > 0) return 'charging';
  if ((outputWatts ?? 0) > 0) return 'discharging';
  return 'unknown';
}

function normalizeRawPowerTelemetry(
  providerId: BluProviderId,
  displayName: string,
  raw: unknown,
  device?: PowerBrandAdapterDevice,
): EcsNormalizedReading | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const deviceId = String(record.deviceId ?? record.device_id ?? device?.rawId ?? '');
  if (!deviceId) return null;
  const now = Date.now();
  const batteryPercent = normalizeNumber(record.batteryPercent ?? record.battery_percent ?? record.soc ?? record.stateOfCharge);
  const inputWatts = normalizeNumber(record.inputWatts ?? record.input_watts ?? record.inputPower ?? record.wattsIn);
  const outputWatts = normalizeNumber(record.outputWatts ?? record.output_watts ?? record.outputPower ?? record.wattsOut);
  const temperatureCelsius = normalizeNumber(record.temperatureCelsius ?? record.temperature_celsius ?? record.temperature);
  const batteryVolts = normalizeNumber(record.batteryVolts ?? record.battery_volts ?? record.voltage);
  const batteryAmps = normalizeNumber(record.batteryAmps ?? record.battery_amps ?? record.current);
  const solarInputWatts = normalizeNumber(record.solarInputWatts ?? record.solar_input_watts ?? record.solarWatts);
  const acOutputWatts = normalizeNumber(record.acOutputWatts ?? record.ac_output_watts);
  const dcOutputWatts = normalizeNumber(record.dcOutputWatts ?? record.dc_output_watts);
  const hasAnyTelemetry =
    batteryPercent != null ||
    inputWatts != null ||
    outputWatts != null ||
    temperatureCelsius != null ||
    batteryVolts != null ||
    batteryAmps != null ||
    solarInputWatts != null ||
    acOutputWatts != null ||
    dcOutputWatts != null;

  const reading: EcsNormalizedReading = {
    provider: providerId,
    providerDisplayName: displayName,
    providerAccentColor: getProviderMeta(providerId)?.accentColor ?? '#64748B',
    providerIcon: getProviderMeta(providerId)?.icon ?? 'battery-charging',
    deviceId,
    deviceName: String(record.deviceName ?? record.device_name ?? device?.name ?? displayName),
    model: String(record.model ?? device?.model ?? displayName),
    batteryPercent,
    inputWatts,
    outputWatts,
    estimatedRuntimeMinutes: normalizeNumber(record.estimatedRuntimeMinutes ?? record.estimated_runtime_minutes),
    chargingState: normalizeChargingState(record),
    outputState: outputWatts != null && outputWatts > 0 ? 'all_on' : 'unknown',
    connectionState: hasAnyTelemetry ? 'connected' : 'unsupported',
    warningState: 'normal',
    isDisconnected: false,
    temperatureCelsius,
    solarInputWatts,
    acOutputWatts,
    dcOutputWatts,
    batteryVolts,
    batteryAmps,
    chargeCycles: normalizeNumber(record.chargeCycles ?? record.charge_cycles),
    healthPercent: normalizeNumber(record.healthPercent ?? record.health_percent),
    capacityWh: normalizeNumber(record.capacityWh ?? record.capacity_wh),
    lastUpdated: normalizeNumber(record.lastUpdated ?? record.updatedAt ?? record.timestamp) ?? now,
    isStale: false,
    isPrimary: false,
    telemetrySource: hasAnyTelemetry ? 'ble_live' : 'unavailable',
    telemetrySourceLabel: getBluetoothTelemetrySourceLabel(hasAnyTelemetry ? 'ble_live' : 'unavailable'),
    isLive: hasAnyTelemetry,
    updatedAt: normalizeNumber(record.updatedAt ?? record.timestamp) ?? now,
    telemetryUnsupported: !hasAnyTelemetry,
    telemetryUnsupportedReason: hasAnyTelemetry
      ? undefined
      : 'Connected, but ECS has not decoded telemetry for this model yet.',
  };
  return {
    ...reading,
    bluTelemetryEnvelope: buildPowerBluTelemetryEnvelope(reading),
  };
}

class RegisteredProviderPowerAdapter implements PowerBrandConnectionAdapter {
  readonly providerId: BluProviderId;
  readonly displayName: string;
  readonly capability: PowerBrandAdapterCapability;

  constructor(providerId: BluProviderId) {
    this.providerId = providerId;
    this.displayName = getProviderDisplayName(providerId);
    this.capability = getAdapterCapabilityForProvider(providerId);
  }

  canClassifyAdvertisement(advertisement: PowerBrandAdvertisement): boolean {
    if (advertisement.providerId === this.providerId) return true;
    const combinedName = `${advertisement.localName ?? ''} ${advertisement.name ?? ''}`.toLowerCase();
    const providerToken = this.providerId.replace(/_/g, ' ');
    return combinedName.includes(providerToken) || combinedName.includes(this.displayName.toLowerCase());
  }

  canHandle(device: PowerBrandAdapterDevice): boolean {
    return device.providerId === this.providerId;
  }

  async connect(device: PowerBrandAdapterDevice): Promise<PowerBrandConnectResult> {
    const parserDecision = getBluestackParserDecision(this.providerId);
    bluLog('[BLU_CONNECT]', 'power_brand_adapter_connect_start', buildBluConnectionAttemptLogDetails({
      deviceId: device.rawId,
      vendor: this.providerId,
      deviceType: device.model ?? 'power_device',
      connectionMode: device.connectionType ?? 'ble',
      startedAt: Date.now(),
      timeoutMs: null,
      attempt: 1,
      driverMode: parserDecision.canDecodeLiveTelemetry ? 'real_ble_or_provider' : 'local_ble_incomplete',
      parserId: parserDecision.parserId,
      parserStatus: parserDecision.status,
    }));
    bluLog(getBluVendorPrefix(this.providerId), 'adapter_connect_start', {
      deviceId: device.rawId,
      vendor: this.providerId,
      connectionMode: device.connectionType ?? 'ble',
      driverMode: parserDecision.canDecodeLiveTelemetry ? 'real_ble_or_provider' : 'local_ble_incomplete',
    });
    if (!parserDecision.canDecodeLiveTelemetry) {
      const status = getParserPendingStatus(this.providerId);
      bluLog('[BLU_VENDOR]', 'parser_pending_connection_blocked', {
        deviceId: device.rawId,
        vendor: this.providerId,
        deviceType: device.model ?? 'power_device',
        connectionMode: device.connectionType ?? 'ble',
        phase: 'parser_readiness',
        driverMode: parserDecision.action === 'profile_only' ? 'profile_only' : 'local_ble_incomplete',
        parserId: parserDecision.parserId,
        parserAction: parserDecision.action,
        parserStatus: parserDecision.status,
        message: parserDecision.reason,
      });
      bluLog(getBluVendorPrefix(this.providerId), 'parser_pending_connection_blocked', {
        deviceId: device.rawId,
        vendor: this.providerId,
        driverMode: parserDecision.action === 'profile_only' ? 'profile_only' : 'local_ble_incomplete',
        parserStatus: parserDecision.status,
      });
      recordBluetoothDiagnosticEvent({
        type: 'provider_handshake_failure',
        source: 'provider_handshake',
        deviceId: device.rawId,
        deviceName: device.name,
        providerId: this.providerId,
        message: `${this.displayName} live parser is not release-ready.`,
        error: parserDecision.reason,
        details: {
          parserId: parserDecision.parserId,
          parserAction: parserDecision.action,
          parserStatus: parserDecision.status,
        },
      });
      return {
        success: false,
        deviceCount: 0,
        devices: [],
        status,
        error: status.detail,
        errorCode: 'PARSER_PENDING',
      };
    }

    ensureEcsPowerProvidersRegistered();
    const provider = ecsProviderRegistry.getProvider(this.providerId);
    if (!provider) {
      bluLog('[BLU_VENDOR]', 'provider_runtime_unavailable', {
        deviceId: device.rawId,
        vendor: this.providerId,
        deviceType: device.model ?? 'power_device',
        connectionMode: device.connectionType ?? 'ble',
        phase: 'provider_lookup',
        driverMode: 'disconnected_from_runtime',
      });
      const status = makeStatus(
        this.providerId,
        'discovered',
        'connection_support_pending',
        PROVIDER_PENDING_COPY[this.providerId] ?? `${this.displayName} was discovered, but the power adapter is not registered in this runtime.`,
      );
      return {
        success: false,
        deviceCount: 0,
        devices: [],
        status,
        error: status.detail,
        errorCode: 'PROVIDER_UNAVAILABLE',
      };
    }

    const connection: PowerBrandProviderConnection = {
      providerId: this.providerId,
      deviceId: device.rawId,
      displayName: device.name,
      transport: provider.transportType === 'ble' ? 'ble' : provider.transportType === 'hybrid' ? 'hybrid' : 'unknown',
      phase: 'connecting_native_transport',
    };
    recordBluetoothDiagnosticEvent({
      type: 'connect_start',
      source: 'native_ble',
      deviceId: device.rawId,
      deviceName: device.name,
      providerId: this.providerId,
      message: `${this.displayName} provider connection started.`,
      details: { phase: connection.phase, transport: connection.transport },
    });

    const result = await provider.connect(device.rawId);
    if (!result.success) {
      bluLog(getBluVendorPrefix(this.providerId), 'provider_connect_failed', {
        deviceId: device.rawId,
        vendor: this.providerId,
        deviceType: device.model ?? 'power_device',
        connectionMode: connection.transport,
        phase: connection.phase,
        errorCode: result.errorCode ?? null,
        message: result.error ?? 'Unable to connect this power device.',
      });
      if (/timeout|timed out|unavailable|failed/i.test(String(result.error ?? ''))) {
        bluLog('[BLU_TIMEOUT]', 'power_provider_connect_failed', buildBluTimeoutLogDetails({
          deviceId: device.rawId,
          vendor: this.providerId,
          phase: connection.phase,
          timeoutMs: null,
          lastSuccessfulPhase: 'connect_requested',
          lastPacketAt: null,
          errorCode: result.errorCode ?? null,
          message: result.error ?? 'Unable to connect this power device.',
        }));
      }
      recordBluetoothDiagnosticEvent({
        type: 'connect_failure',
        source: 'provider_handshake',
        deviceId: device.rawId,
        deviceName: device.name,
        providerId: this.providerId,
        message: `${this.displayName} provider connection failed.`,
        error: result.error ?? 'Unable to connect this power device.',
        details: { errorCode: result.errorCode ?? null },
      });
      return {
        success: false,
        deviceCount: result.deviceCount,
        devices: result.devices,
        status: makeStatus(
          this.providerId,
          'error',
          'capability_error',
          result.error ?? 'Unable to connect this power device.',
          'error',
        ),
        error: result.error,
        errorCode: result.errorCode,
      };
    }

    connection.phase = 'discovering_services';
    await this.discoverCapabilities(connection);
    recordBluetoothDiagnosticEvent({
      type: 'service_discovery_success',
      source: 'provider_handshake',
      deviceId: device.rawId,
      deviceName: device.name,
      providerId: this.providerId,
      message: `${this.displayName} capability discovery completed.`,
      details: { phase: connection.phase },
    });
    connection.phase = 'provider_handshake';
    bluLog('[BLU_HANDSHAKE]', 'power_provider_handshake_succeeded', {
      deviceId: device.rawId,
      vendor: this.providerId,
      phase: connection.phase,
      connectionMode: connection.transport,
      driverMode: 'provider_adapter',
    });
    recordBluetoothDiagnosticEvent({
      type: 'provider_handshake_success',
      source: 'provider_handshake',
      deviceId: device.rawId,
      deviceName: device.name,
      providerId: this.providerId,
      message: `${this.displayName} provider handshake completed.`,
      details: { phase: connection.phase },
    });
    connection.phase = 'telemetry_setup';
    if (!provider.isPolling()) {
      provider.startPolling(15_000);
    }
    const readings = await ecsProviderRegistry.fetchAllTelemetry().catch(() => []);
    const hasLiveTelemetry = readings.some((reading) => (
      reading.provider === this.providerId &&
      reading.isLive === true &&
      reading.telemetryUnsupported !== true
    ));

    if (!hasLiveTelemetry) {
      provider.stopPolling();
      await provider.disconnect().catch(() => undefined);
      const detail = `${this.displayName} connected at the provider layer, but ECS did not receive decoded live telemetry for this model. The device stays nearby, not connected.`;
      bluLog('[BLU_TIMEOUT]', 'power_provider_no_live_telemetry', buildBluTimeoutLogDetails({
        deviceId: device.rawId,
        vendor: this.providerId,
        phase: 'telemetry_setup',
        timeoutMs: 15_000,
        lastSuccessfulPhase: 'provider_handshake',
        lastPacketAt: null,
        errorCode: 'TELEMETRY_UNAVAILABLE',
        message: detail,
      }));
      recordBluetoothDiagnosticEvent({
        type: 'provider_handshake_failure',
        source: 'provider_handshake',
        deviceId: device.rawId,
        deviceName: device.name,
        providerId: this.providerId,
        message: `${this.displayName} telemetry setup failed.`,
        error: detail,
        details: { phase: connection.phase, errorCode: 'TELEMETRY_UNAVAILABLE' },
      });
      return {
        success: false,
        deviceCount: result.deviceCount,
        devices: result.devices,
        status: makeStatus(this.providerId, 'error', 'capability_error', detail, 'error'),
        error: detail,
        errorCode: 'TELEMETRY_UNAVAILABLE',
      };
    }

    connection.phase = 'streaming';
    bluLog('[BLU_STREAM]', 'power_provider_streaming', {
      deviceId: device.rawId,
      vendor: this.providerId,
      phase: connection.phase,
      connectionMode: connection.transport,
      streamMode: provider.transportType === 'cloud' ? 'cloud_poll' : 'provider_poll',
    });
    recordBluetoothDiagnosticEvent({
      type: 'telemetry_first_packet',
      source: 'widget_telemetry',
      deviceId: device.rawId,
      deviceName: device.name,
      providerId: this.providerId,
      message: `${this.displayName} emitted decoded live telemetry.`,
      details: { phase: connection.phase },
    });

    return {
      success: true,
      deviceCount: result.deviceCount,
      devices: result.devices,
      status: makeStatus(
        this.providerId,
        'connected',
        'telemetry_active',
        `${this.displayName} is connected and decoded telemetry is streaming.`,
        'streaming',
      ),
    };
  }

  async discoverCapabilities(_connection: PowerBrandProviderConnection): Promise<PowerBrandProviderCapabilities> {
    return this.getCapabilities();
  }

  async startTelemetry(
    _connection: PowerBrandProviderConnection,
    callback: (telemetry: EcsNormalizedReading) => void,
  ): Promise<PowerTelemetryUnsubscribe> {
    const parserDecision = getBluestackParserDecision(this.providerId);
    if (!parserDecision.canDecodeLiveTelemetry) {
      bluLog(getBluVendorPrefix(this.providerId), 'telemetry_subscription_blocked_parser_pending', {
        deviceId: _connection.deviceId,
        vendor: this.providerId,
        phase: 'telemetry_subscription',
        driverMode: parserDecision.action === 'profile_only' ? 'profile_only' : 'local_ble_incomplete',
        parserStatus: parserDecision.status,
        message: parserDecision.reason,
      });
      throw new Error(parserDecision.reason);
    }

    ensureEcsPowerProvidersRegistered();
    const provider = ecsProviderRegistry.getProvider(this.providerId);
    if (!provider) {
      throw new Error(`${this.displayName} provider is unavailable.`);
    }

    const unsubscribe = provider.onTelemetry(callback);
    bluLog('[BLU_STREAM]', 'power_telemetry_subscription_start', {
      deviceId: _connection.deviceId,
      vendor: this.providerId,
      phase: _connection.phase,
      connectionMode: _connection.transport,
      streamMode: provider.transportType === 'cloud' ? 'cloud_poll' : 'provider_poll',
    });
    recordBluetoothDiagnosticEvent({
      type: 'telemetry_subscription_start',
      source: 'widget_telemetry',
      deviceId: _connection.deviceId,
      deviceName: _connection.displayName ?? undefined,
      providerId: this.providerId,
      message: `${this.displayName} telemetry subscription started.`,
      details: { phase: _connection.phase },
    });
    if (!provider.isPolling()) {
      provider.startPolling(15_000);
    }

    const readings = await ecsProviderRegistry.fetchAllTelemetry().catch(() => []);
    const liveReadings = readings.filter((reading) => (
      reading.provider === this.providerId &&
      reading.isLive === true &&
      reading.telemetryUnsupported !== true
    ));
    for (const reading of liveReadings) {
      bluLogThrottled('[BLU_TELEMETRY]', `power-reading:${this.providerId}:${reading.deviceId}`, 'power_provider_live_reading', buildBluTelemetryLogDetails({
        deviceId: reading.deviceId,
        vendor: this.providerId,
        telemetry: reading,
        streamMode: provider.transportType === 'cloud' ? 'cloud_poll' : 'provider_poll',
        lastPacketAt: reading.lastUpdated ?? reading.updatedAt ?? Date.now(),
      }), 10_000);
      callback(reading);
    }

    if (liveReadings.length === 0) {
      unsubscribe();
      provider.stopPolling();
      bluLog('[BLU_TIMEOUT]', 'power_telemetry_subscription_no_live_readings', buildBluTimeoutLogDetails({
        deviceId: _connection.deviceId,
        vendor: this.providerId,
        phase: 'telemetry_subscription',
        timeoutMs: 15_000,
        lastSuccessfulPhase: 'provider_handshake',
        lastPacketAt: null,
        errorCode: 'TELEMETRY_UNAVAILABLE',
        message: `${this.displayName} telemetry subscription did not produce live decoded readings.`,
      }));
      recordBluetoothDiagnosticEvent({
        type: 'provider_handshake_failure',
        source: 'provider_handshake',
        deviceId: _connection.deviceId,
        deviceName: _connection.displayName ?? undefined,
        providerId: this.providerId,
        message: `${this.displayName} telemetry subscription failed.`,
        error: `${this.displayName} telemetry subscription did not produce live decoded readings.`,
      });
      throw new Error(`${this.displayName} telemetry subscription did not produce live decoded readings.`);
    }

    return () => {
      unsubscribe();
      provider.stopPolling();
      bluLog('[BLU_DISCONNECT]', 'power_telemetry_subscription_stop', {
        deviceId: _connection.deviceId,
        vendor: this.providerId,
        phase: 'telemetry_subscription',
        streamMode: provider.transportType === 'cloud' ? 'cloud_poll' : 'provider_poll',
      });
      recordBluetoothDiagnosticEvent({
        type: 'telemetry_subscription_stop',
        source: 'widget_telemetry',
        deviceId: _connection.deviceId,
        deviceName: _connection.displayName ?? undefined,
        providerId: this.providerId,
        message: `${this.displayName} telemetry subscription stopped.`,
      });
    };
  }

  async stopTelemetry(): Promise<void> {
    ensureEcsPowerProvidersRegistered();
    const provider = ecsProviderRegistry.getProvider(this.providerId);
    provider?.stopPolling();
  }

  async disconnect(): Promise<void> {
    ensureEcsPowerProvidersRegistered();
    const provider = ecsProviderRegistry.getProvider(this.providerId);
    await this.stopTelemetry();
    await provider?.disconnect();
  }

  readStatus(_device?: PowerBrandAdapterDevice): PowerBrandAdapterStatus {
    ensureEcsPowerProvidersRegistered();
    const provider = ecsProviderRegistry.getProvider(this.providerId);
    if (!provider) {
      return getParserPendingStatus(this.providerId);
    }
    const parserDecision = getBluestackParserDecision(this.providerId);
    if (!parserDecision.canDecodeLiveTelemetry) {
      return getParserPendingStatus(this.providerId);
    }
    const state = provider.reportConnectionState();
    const hasTelemetry = ecsProviderRegistry
      .getAllLatestReadings()
      .some((reading) => reading.provider === this.providerId && reading.isLive === true && !reading.telemetryUnsupported);
    return makeStatus(
      this.providerId,
      hasTelemetry ? 'connected' : state === 'connected' ? 'error' : state,
      hasTelemetry ? 'telemetry_active' : state === 'connected' ? 'capability_error' : 'connection_support_pending',
      hasTelemetry
        ? `${this.displayName} decoded telemetry is active.`
        : state === 'connected'
          ? `${this.displayName} provider connection exists, but ECS is not receiving decoded live telemetry.`
          : `${this.displayName} provider support is pending live telemetry validation.`,
      hasTelemetry ? 'streaming' : state === 'connected' ? 'error' : 'discovered',
    );
  }

  getCapabilities(): PowerBrandProviderCapabilities {
    const parserDecision = getBluestackParserDecision(this.providerId);
    return {
      supportsLiveTelemetry: parserDecision.canDecodeLiveTelemetry,
      supportsControl: false,
      supportsBle: parserDecision.action !== 'profile_only',
      supportsCloud: false,
      supportsBatteryPercent: parserDecision.canDecodeLiveTelemetry,
      supportsInputWatts: parserDecision.canDecodeLiveTelemetry,
      supportsOutputWatts: parserDecision.canDecodeLiveTelemetry,
      supportsRuntimeEstimate: false,
    };
  }

  subscribeTelemetry(
    _device: PowerBrandAdapterDevice,
    callback: (telemetry: EcsNormalizedReading) => void,
  ): PowerTelemetryUnsubscribe {
    ensureEcsPowerProvidersRegistered();
    const provider = ecsProviderRegistry.getProvider(this.providerId);
    return provider?.onTelemetry(callback) ?? (() => {});
  }

  normalizeTelemetry(raw: unknown, device?: PowerBrandAdapterDevice): EcsNormalizedReading | null {
    const parserDecision = getBluestackParserDecision(this.providerId);
    if (!parserDecision.canDecodeLiveTelemetry) return null;
    return normalizeRawPowerTelemetry(this.providerId, this.displayName, raw, device);
  }
}

class ApiRequiredPowerAdapter implements PowerBrandConnectionAdapter {
  readonly providerId: BluProviderId = 'ecoflow';
  readonly displayName = 'EcoFlow';
  readonly capability: PowerBrandAdapterCapability = 'api_required';

  canClassifyAdvertisement(advertisement: PowerBrandAdvertisement): boolean {
    if (advertisement.providerId === 'ecoflow') return true;
    const combinedName = `${advertisement.localName ?? ''} ${advertisement.name ?? ''}`.toLowerCase();
    return (
      combinedName.includes('ecoflow') ||
      combinedName.includes('delta') ||
      combinedName.includes('river') ||
      combinedName.includes('glacier') ||
      combinedName.includes('refrigerator') ||
      combinedName.includes('fridge')
    );
  }

  canHandle(device: PowerBrandAdapterDevice): boolean {
    return device.providerId === 'ecoflow';
  }

  async connect(device: PowerBrandAdapterDevice): Promise<PowerBrandConnectResult> {
    bluLog('[BLU_ECOFLOW]', 'api_required_adapter_blocked_local_ble', {
      deviceId: device.rawId,
      vendor: 'ecoflow',
      deviceType: device.model ?? 'power_device',
      connectionMode: device.connectionType ?? 'ble',
      phase: 'local_ble_parser',
      driverMode: 'cloud_only',
      message: 'EcoFlow local Bluetooth requires a validated provider telemetry handshake. Cloud authorization is not Bluetooth proof.',
    });
    return {
      success: false,
      deviceCount: 0,
      devices: [],
      status: this.readStatus(device),
      error: 'EcoFlow local Bluetooth requires a validated provider telemetry handshake. Cloud authorization is not Bluetooth proof.',
      errorCode: 'API_REQUIRED',
    };
  }

  async discoverCapabilities(_connection: PowerBrandProviderConnection): Promise<PowerBrandProviderCapabilities> {
    return this.getCapabilities();
  }

  async startTelemetry(): Promise<PowerTelemetryUnsubscribe> {
    throw new Error('EcoFlow local Bluetooth telemetry is not available through this cloud-only adapter.');
  }

  async stopTelemetry(): Promise<void> {
    ensureEcsPowerProvidersRegistered();
    const provider = ecsProviderRegistry.getProvider('ecoflow');
    provider?.stopPolling();
  }

  async disconnect(): Promise<void> {
    ensureEcsPowerProvidersRegistered();
    const provider = ecsProviderRegistry.getProvider('ecoflow');
    await this.stopTelemetry();
    await provider?.disconnect();
  }

  readStatus(_device?: PowerBrandAdapterDevice): PowerBrandAdapterStatus {
    return makeStatus(
      'ecoflow',
      'discovered',
      'api_required',
      'EcoFlow Cloud can provide metadata/control when authorized. It is cloud-only here and does not prove local Bluetooth connectivity.',
      'discovered',
    );
  }

  getCapabilities(): PowerBrandProviderCapabilities {
    return {
      supportsLiveTelemetry: false,
      supportsControl: false,
      supportsBle: false,
      supportsCloud: true,
      supportsBatteryPercent: false,
      supportsInputWatts: false,
      supportsOutputWatts: false,
      supportsRuntimeEstimate: false,
    };
  }

  normalizeTelemetry(raw: unknown, device?: PowerBrandAdapterDevice): EcsNormalizedReading | null {
    const record = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const source = String(record.source ?? record.telemetrySource ?? record.telemetry_source ?? '').toLowerCase();
    if (source !== 'cloud' && source !== 'api' && source !== 'ecoflow_cloud') return null;
    return normalizeRawPowerTelemetry('ecoflow', this.displayName, raw, device);
  }
}

const REGISTERED_POWER_ADAPTERS: PowerBrandConnectionAdapter[] = [
  ...SCANNER_POWER_PROVIDER_IDS.map((providerId) => new RegisteredProviderPowerAdapter(providerId)),
  new ApiRequiredPowerAdapter(),
];

export function getPowerBrandConnectionAdapters(): readonly PowerBrandConnectionAdapter[] {
  return REGISTERED_POWER_ADAPTERS;
}

export function getPowerBrandConnectionAdapterForDevice(
  device: PowerBrandAdapterDevice,
): PowerBrandConnectionAdapter | null {
  if (!isBluProviderId(device.providerId)) return null;
  return REGISTERED_POWER_ADAPTERS.find((adapter) => adapter.canHandle(device)) ?? null;
}

export function getPowerBrandConnectionStatus(
  device: PowerBrandAdapterDevice,
): PowerBrandAdapterStatus {
  const adapter = getPowerBrandConnectionAdapterForDevice(device);
  if (adapter) return adapter.readStatus(device);
  return {
    providerId: 'victron',
    state: 'discovered',
    capability: 'unsupported',
    phase: 'discovered',
    label: 'Unsupported',
    detail: 'ECS can display this device, but no power adapter is available for its provider yet.',
  };
}

export function normalizePowerTelemetryForScanner(
  providerId: BluProviderId,
  raw: unknown,
  device?: PowerBrandAdapterDevice,
): EcsNormalizedReading | null {
  const parserDecision = getBluestackParserDecision(providerId);
  if (!parserDecision.canDecodeLiveTelemetry && parserDecision.action !== 'use_ecoflow_cloud') return null;
  const adapter = REGISTERED_POWER_ADAPTERS.find((entry) => entry.providerId === providerId);
  return adapter?.normalizeTelemetry(raw, device) ?? null;
}

export function makePendingPowerTelemetry(
  providerId: BluProviderId,
  device: PowerBrandAdapterDevice,
): BluTelemetry {
  const now = Date.now();
  const parserDecision = getBluestackParserDecision(providerId);
  return withBluPowerTelemetryEnvelope({
    timestamp: now,
    provider: providerId,
    device_id: device.rawId,
    source: 'unavailable',
    updatedAt: now,
    telemetrySourceLabel: getBluetoothTelemetrySourceLabel('unavailable'),
    isLive: false,
    telemetryUnsupported: true,
    telemetryUnsupportedReason: parserDecision.reason,
    status_text: 'Discovered. Connection support pending.',
    raw: {
      providerId,
      deviceName: device.name,
      model: device.model ?? null,
      signalStrength: device.signalStrength ?? null,
      parserId: parserDecision.parserId,
      parserAction: parserDecision.action,
      parserStatus: parserDecision.status,
    },
  });
}

export function getPendingPowerCapabilities() {
  return { ...DEFAULT_BLU_CAPABILITIES };
}
