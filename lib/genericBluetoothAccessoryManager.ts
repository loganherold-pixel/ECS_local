import { Platform } from 'react-native';
import {
  bluetoothAccessoryRegistry,
  type BluetoothAccessoryRecord,
  type BluetoothAccessoryOwner,
} from './bluetoothAccessoryRegistry';
import { ecsLog } from './ecsLogger';
import { ecsTelemetryStore } from '../src/telemetry/ECSTelemetryStore';
import { bluetoothAccessoryToEcsTelemetryEvents } from '../src/telemetry/telemetryAdapters';
import {
  buildEcoFlowBleCharacteristicProbe,
  isEcoFlowBleDiagnosticTarget,
  recordEcoFlowBleProbeEvent,
  type EcoFlowBleServiceProbe,
} from './ecoflowBleDiagnosticCapture';
import {
  decodeUtilitySensorLiveTelemetry,
  type UtilitySensorCharacteristicSnapshot,
} from './utilitySensorBleTelemetry';

type BleManagerDevice = any;
type BleManagerSubscription = { remove?: () => void } | null;

interface ConnectGenericAccessoryOptions {
  deviceId: string;
  displayName: string;
  providerLabel: string;
  providerId: string;
  categoryHint: string;
  owner: BluetoothAccessoryOwner;
  supportLabel: string;
  supportNote: string | null;
  signalStrength: number | null;
  serviceUuids?: string[];
  manufacturerData?: string | null;
  localName?: string | null;
  levelPercent?: unknown;
}

interface ConnectGenericAccessoryResult {
  success: boolean;
  error: string | null;
  signalStrength: number | null;
}

let bleManagerInstance: any | null = null;

function getBleManager(): any {
  if (bleManagerInstance) return bleManagerInstance;
  if (Platform.OS === 'web') {
    throw new Error('Bluetooth is unavailable on web.');
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager } = require('react-native-ble-plx');
    bleManagerInstance = new BleManager();
    return bleManagerInstance;
  } catch (error) {
    throw new Error(`Failed to initialise Bluetooth manager: ${error}`);
  }
}

function getErrorMessage(error: unknown): string {
  const message =
    typeof error === 'object' && error != null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  if (/cancelled|canceled/i.test(message)) return 'Connection canceled.';
  if (/timeout|timed out/i.test(message)) return 'Connection timed out.';
  if (/permission|denied/i.test(message)) return 'Bluetooth permissions are required.';
  if (/powered off|bluetooth disabled|unavailable/i.test(message)) return 'Bluetooth is unavailable right now.';
  return message.trim() || 'Unable to connect this Bluetooth accessory.';
}

class GenericBluetoothAccessoryManager {
  private connections = new Map<string, BleManagerDevice>();
  private disconnectSubscriptions = new Map<string, BleManagerSubscription>();

  async connect(
    options: ConnectGenericAccessoryOptions,
  ): Promise<ConnectGenericAccessoryResult> {
    const connectStartedAt = Date.now();
    const captureEcoFlowBle = isEcoFlowBleDiagnosticTarget(options);
    ecsLog.debug('TELEMETRY', '[BT_CONNECT] start', {
      deviceId: options.deviceId,
      displayName: options.displayName,
      providerId: options.providerId,
      owner: options.owner,
    });
    if (captureEcoFlowBle) {
      recordEcoFlowBleProbeEvent({
        ...options,
        phase: 'connect_requested',
        startedAt: connectStartedAt,
      });
    }

    await bluetoothAccessoryRegistry.upsert({
      ...options,
      connectionState: 'connecting',
      lastError: null,
    });

    if (Platform.OS === 'web') {
      const error = 'Bluetooth is unavailable on web.';
      ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
        deviceId: options.deviceId,
        providerId: options.providerId,
        reason: error,
      });
      const failedRecord = await bluetoothAccessoryRegistry.upsert({
        ...options,
        connectionState: 'error',
        lastError: error,
      });
      this.publishAccessoryTelemetryState(failedRecord);
      return { success: false, error, signalStrength: null };
    }

    try {
      const manager = getBleManager();
      manager.stopDeviceScan?.();
      const device = await manager.connectToDevice(options.deviceId, {
        requestMTU: 256,
        timeout: 15_000,
      });
      if (captureEcoFlowBle) {
        recordEcoFlowBleProbeEvent({
          ...options,
          phase: 'native_transport_connected',
          startedAt: connectStartedAt,
          elapsedMs: Date.now() - connectStartedAt,
        });
        recordEcoFlowBleProbeEvent({
          ...options,
          phase: 'service_discovery_started',
          startedAt: connectStartedAt,
          elapsedMs: Date.now() - connectStartedAt,
        });
      }
      await device.discoverAllServicesAndCharacteristics();
      ecsLog.debug('TELEMETRY', '[BT_LIVE] device_connected', {
        deviceId: options.deviceId,
        providerId: options.providerId,
        displayName: options.displayName,
      });
      const serviceDiscovery = await this.logDiscoveredServices(device, options.deviceId, options.providerId);
      const discoveredServiceUuids = serviceDiscovery.serviceUuids;
      if (captureEcoFlowBle) {
        recordEcoFlowBleProbeEvent({
          ...options,
          phase: 'service_discovery_completed',
          startedAt: connectStartedAt,
          elapsedMs: Date.now() - connectStartedAt,
          services: serviceDiscovery.serviceProbes,
        });
      }
      const characteristicSnapshots = options.owner === 'sensor'
        ? await this.readReadableCharacteristicSnapshots(device, options.deviceId, options.providerId)
        : [];
      this.connections.set(options.deviceId, device);
      this.attachDisconnectMonitor(options, device);

      const signalStrength = await this.readRssi(device, options.signalStrength);
      const serviceUuids = Array.from(new Set([
        ...(options.serviceUuids ?? []),
        ...discoveredServiceUuids,
      ].map((uuid) => String(uuid ?? '').trim().toLowerCase()).filter(Boolean)));
      const utilitySensorTelemetry = options.owner === 'sensor'
        ? decodeUtilitySensorLiveTelemetry({
            providerId: options.providerId,
            providerLabel: options.providerLabel,
            categoryHint: options.categoryHint,
            displayName: options.displayName,
            serviceUuids,
            manufacturerData: options.manufacturerData ?? null,
            localName: options.localName ?? options.displayName,
            signalStrength,
            levelPercent: options.levelPercent,
            characteristics: characteristicSnapshots,
          })
        : null;
      const connectedRecord = await bluetoothAccessoryRegistry.upsert({
        ...options,
        connectionState: 'connected',
        signalStrength,
        serviceUuids,
        utilitySensorTelemetry,
        lastError: null,
      });
      this.publishAccessoryTelemetryState(connectedRecord);
      ecsLog.debug('TELEMETRY', '[BT_CONNECT] success', {
        deviceId: options.deviceId,
        providerId: options.providerId,
        signalStrength,
      });
      return { success: true, error: null, signalStrength };
    } catch (error) {
      const message = getErrorMessage(error);
      if (captureEcoFlowBle) {
        recordEcoFlowBleProbeEvent({
          ...options,
          phase: /service|characteristic/i.test(message) ? 'service_discovery_failed' : 'connect_failed',
          startedAt: connectStartedAt,
          elapsedMs: Date.now() - connectStartedAt,
          error: message,
        });
      }
      ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
        deviceId: options.deviceId,
        providerId: options.providerId,
        reason: message,
      });
      const failedRecord = await bluetoothAccessoryRegistry.upsert({
        ...options,
        connectionState: 'error',
        lastError: message,
      });
      this.publishAccessoryTelemetryState(failedRecord);
      return { success: false, error: message, signalStrength: options.signalStrength };
    }
  }

  async disconnect(deviceId: string): Promise<void> {
    const existing = bluetoothAccessoryRegistry.getByDeviceId(deviceId);

    if (existing) {
      recordEcoFlowBleProbeEvent({
        ...existing,
        phase: 'disconnect_requested',
      });
      await bluetoothAccessoryRegistry.upsert({
        ...existing,
        connectionState: 'disconnecting',
        lastError: null,
      });
    }

    try {
      this.disconnectSubscriptions.get(deviceId)?.remove?.();
    } catch {}
    this.disconnectSubscriptions.delete(deviceId);

    const connection = this.connections.get(deviceId);
    try {
      const manager = getBleManager();
      const isConnected = await manager.isDeviceConnected?.(deviceId).catch(() => !!connection);
      if (connection || isConnected) {
        await manager.cancelDeviceConnection(deviceId);
      }

      const stillConnected = await manager.isDeviceConnected?.(deviceId).catch(() => false);
      if (stillConnected) {
        throw new Error('Bluetooth device remained connected after disconnect request.');
      }
    } catch (error) {
      if (existing) {
        const failedRecord = await bluetoothAccessoryRegistry.upsert({
          ...existing,
          connectionState: 'error',
          lastError: getErrorMessage(error),
        });
        this.publishAccessoryTelemetryState(failedRecord);
      }
      throw error;
    }

    this.connections.delete(deviceId);

    if (existing) {
      const disconnectedRecord = await bluetoothAccessoryRegistry.upsert({
        ...existing,
        connectionState: 'disconnected',
        lastError: null,
      });
      recordEcoFlowBleProbeEvent({
        ...existing,
        phase: 'disconnect_completed',
      });
      this.publishAccessoryTelemetryState(disconnectedRecord);
    }
  }

  private publishAccessoryTelemetryState(record: BluetoothAccessoryRecord): void {
    const events = bluetoothAccessoryToEcsTelemetryEvents(record);
    if (events.length > 0) {
      ecsTelemetryStore.ingestEvents(events);
      return;
    }

    if (record.owner === 'sensor') {
      ecsTelemetryStore.markDeviceUnavailable(record.deviceId, 'utility_sensor', 'Utility sensor disconnected.');
    }
  }

  private attachDisconnectMonitor(
    options: ConnectGenericAccessoryOptions,
    device: BleManagerDevice,
  ): void {
    try {
      const manager = getBleManager();
      this.disconnectSubscriptions.get(options.deviceId)?.remove?.();
      this.disconnectSubscriptions.set(
        options.deviceId,
        manager.onDeviceDisconnected(options.deviceId, async () => {
          this.disconnectSubscriptions.get(options.deviceId)?.remove?.();
          this.disconnectSubscriptions.delete(options.deviceId);
          this.connections.delete(options.deviceId);
          const disconnectedRecord = await bluetoothAccessoryRegistry.upsert({
            ...options,
            connectionState: 'disconnected',
            lastError: null,
          });
          this.publishAccessoryTelemetryState(disconnectedRecord);
        }),
      );
    } catch {
      // Best effort only.
    }
  }

  private async readRssi(
    device: BleManagerDevice,
    fallback: number | null,
  ): Promise<number | null> {
    try {
      const refreshed = await device.readRSSI();
      return typeof refreshed?.rssi === 'number' ? refreshed.rssi : fallback;
    } catch {
      return fallback;
    }
  }

  private async logDiscoveredServices(
    device: BleManagerDevice,
    deviceId: string,
    providerId: string,
  ): Promise<{ serviceUuids: string[]; serviceProbes: EcoFlowBleServiceProbe[] }> {
    try {
      const services = await device.services();
      const serviceSummaries = [];
      const serviceUuids: string[] = [];
      const serviceProbes: EcoFlowBleServiceProbe[] = [];
      for (const service of services ?? []) {
        const serviceUuid = String(service?.uuid ?? '').trim().toLowerCase();
        if (serviceUuid) serviceUuids.push(serviceUuid);
        let characteristicCount = 0;
        let characteristics: any[] = [];
        try {
          characteristics = await device.characteristicsForService(service.uuid);
          characteristicCount = Array.isArray(characteristics) ? characteristics.length : 0;
        } catch {
          characteristicCount = 0;
        }
        serviceSummaries.push({
          uuid: String(service?.uuid ?? ''),
          characteristicCount,
        });
        if (serviceUuid) {
          serviceProbes.push({
            uuid: serviceUuid,
            characteristicCount,
            characteristics: (characteristics ?? [])
              .map((characteristic) => buildEcoFlowBleCharacteristicProbe(serviceUuid, characteristic))
              .filter((characteristic) => characteristic.characteristicUuid.length > 0),
          });
        }
      }
      ecsLog.debug('TELEMETRY', '[BT_LIVE] services_discovered', {
        deviceId,
        providerId,
        count: serviceSummaries.length,
        services: serviceSummaries,
      });
      return { serviceUuids, serviceProbes };
    } catch (error) {
      ecsLog.warn('TELEMETRY', '[BT_LIVE] services_discovered', {
        deviceId,
        providerId,
        error: getErrorMessage(error),
      });
      return { serviceUuids: [], serviceProbes: [] };
    }
  }

  private async readReadableCharacteristicSnapshots(
    device: BleManagerDevice,
    deviceId: string,
    providerId: string,
  ): Promise<UtilitySensorCharacteristicSnapshot[]> {
    const snapshots: UtilitySensorCharacteristicSnapshot[] = [];
    try {
      const services = await device.services();
      for (const service of services ?? []) {
        const serviceUuid = String(service?.uuid ?? '').trim().toLowerCase();
        if (!serviceUuid) continue;
        let characteristics: any[] = [];
        try {
          characteristics = await device.characteristicsForService(service.uuid);
        } catch {
          characteristics = [];
        }
        for (const characteristic of characteristics ?? []) {
          if (characteristic?.isReadable === false) continue;
          const characteristicUuid = String(characteristic?.uuid ?? '').trim().toLowerCase();
          if (!characteristicUuid) continue;
          try {
            const value = typeof characteristic.read === 'function'
              ? await characteristic.read()
              : await device.readCharacteristicForService(service.uuid, characteristic.uuid);
            snapshots.push({
              serviceUuid,
              characteristicUuid,
              valueBase64: typeof value?.value === 'string' ? value.value : null,
            });
          } catch {}
        }
      }
      ecsLog.debug('TELEMETRY', '[BT_LIVE] characteristics_sampled', {
        deviceId,
        providerId,
        readableCount: snapshots.length,
      });
    } catch (error) {
      ecsLog.warn('TELEMETRY', '[BT_LIVE] characteristics_sampled', {
        deviceId,
        providerId,
        error: getErrorMessage(error),
      });
    }
    return snapshots;
  }
}

export const genericBluetoothAccessoryManager = new GenericBluetoothAccessoryManager();
