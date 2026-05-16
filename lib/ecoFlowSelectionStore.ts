import { Platform } from 'react-native';
import { powerDeviceStore } from '../src/power/devices/PowerDeviceStore';

const DEVICE_KEY = 'ecs_ecoflow_selected_device';
const DEVICE_NAME_KEY = 'ecs_ecoflow_selected_device_name';
const memoryStore: Record<string, string> = {};

function storageGet(key: string): string | null {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return memoryStore[key] ?? null;
}

function storageSet(key: string, value: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Fall through to in-memory mirror.
    }
  }
  memoryStore[key] = value;
}

function storageRemove(key: string): void {
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.removeItem(key);
    } catch {
      // Fall through to in-memory mirror.
    }
  }
  delete memoryStore[key];
}

export function getSelectedEcoFlowDevice(): string | null {
  return storageGet(DEVICE_KEY) || null;
}

export function getSelectedEcoFlowDeviceName(): string | null {
  return storageGet(DEVICE_NAME_KEY) || null;
}

export function setSelectedEcoFlowDevice(
  deviceId: string | null,
  deviceName: string | null = null,
): void {
  if (deviceId) {
    storageSet(DEVICE_KEY, deviceId);
    if (deviceName) {
      storageSet(DEVICE_NAME_KEY, deviceName);
    }
    void powerDeviceStore.setSelected('EcoFlow', [deviceId]).catch(() => {});
    return;
  }

  storageRemove(DEVICE_KEY);
  storageRemove(DEVICE_NAME_KEY);
  void powerDeviceStore.clearSelected('EcoFlow').catch(() => {});
}
