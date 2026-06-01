import { Platform } from 'react-native';
import {
  bluetoothAccessoryRegistry,
  type BluetoothAccessoryOwner,
} from './bluetoothAccessoryRegistry';
import { ecsLog } from './ecsLogger';

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
    ecsLog.debug('TELEMETRY', '[BT_CONNECT] start', {
      deviceId: options.deviceId,
      displayName: options.displayName,
      providerId: options.providerId,
      owner: options.owner,
    });

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
      await bluetoothAccessoryRegistry.upsert({
        ...options,
        connectionState: 'error',
        lastError: error,
      });
      return { success: false, error, signalStrength: null };
    }

    try {
      const manager = getBleManager();
      manager.stopDeviceScan?.();
      const device = await manager.connectToDevice(options.deviceId, {
        requestMTU: 256,
        timeout: 15_000,
      });
      await device.discoverAllServicesAndCharacteristics();
      ecsLog.debug('TELEMETRY', '[BT_LIVE] device_connected', {
        deviceId: options.deviceId,
        providerId: options.providerId,
        displayName: options.displayName,
      });
      await this.logDiscoveredServices(device, options.deviceId, options.providerId);
      this.connections.set(options.deviceId, device);
      this.attachDisconnectMonitor(options, device);

      const signalStrength = await this.readRssi(device, options.signalStrength);
      await bluetoothAccessoryRegistry.upsert({
        ...options,
        connectionState: 'connected',
        signalStrength,
        lastError: null,
      });
      ecsLog.debug('TELEMETRY', '[BT_CONNECT] success', {
        deviceId: options.deviceId,
        providerId: options.providerId,
        signalStrength,
      });
      return { success: true, error: null, signalStrength };
    } catch (error) {
      const message = getErrorMessage(error);
      ecsLog.warn('TELEMETRY', '[BT_CONNECT] failure', {
        deviceId: options.deviceId,
        providerId: options.providerId,
        reason: message,
      });
      await bluetoothAccessoryRegistry.upsert({
        ...options,
        connectionState: 'error',
        lastError: message,
      });
      return { success: false, error: message, signalStrength: options.signalStrength };
    }
  }

  async disconnect(deviceId: string): Promise<void> {
    const existing = bluetoothAccessoryRegistry.getByDeviceId(deviceId);

    if (existing) {
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
        await bluetoothAccessoryRegistry.upsert({
          ...existing,
          connectionState: 'error',
          lastError: getErrorMessage(error),
        });
      }
      throw error;
    }

    this.connections.delete(deviceId);

    if (existing) {
      await bluetoothAccessoryRegistry.upsert({
        ...existing,
        connectionState: 'disconnected',
        lastError: null,
      });
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
          await bluetoothAccessoryRegistry.upsert({
            ...options,
            connectionState: 'disconnected',
            lastError: null,
          });
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
  ): Promise<void> {
    try {
      const services = await device.services();
      const serviceSummaries = [];
      for (const service of services ?? []) {
        let characteristicCount = 0;
        try {
          const characteristics = await device.characteristicsForService(service.uuid);
          characteristicCount = Array.isArray(characteristics) ? characteristics.length : 0;
        } catch {
          characteristicCount = 0;
        }
        serviceSummaries.push({
          uuid: String(service?.uuid ?? ''),
          characteristicCount,
        });
      }
      ecsLog.debug('TELEMETRY', '[BT_LIVE] services_discovered', {
        deviceId,
        providerId,
        count: serviceSummaries.length,
        services: serviceSummaries,
      });
    } catch (error) {
      ecsLog.warn('TELEMETRY', '[BT_LIVE] services_discovered', {
        deviceId,
        providerId,
        error: getErrorMessage(error),
      });
    }
  }
}

export const genericBluetoothAccessoryManager = new GenericBluetoothAccessoryManager();
