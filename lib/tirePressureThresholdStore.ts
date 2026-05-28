import { Platform } from 'react-native';

export type TirePressurePosition = 'frontLeft' | 'frontRight' | 'rearLeft' | 'rearRight';

export type TirePressureThresholds = Record<TirePressurePosition, number>;

export const TIRE_PRESSURE_POSITIONS: TirePressurePosition[] = [
  'frontLeft',
  'frontRight',
  'rearLeft',
  'rearRight',
];

export const DEFAULT_TIRE_PRESSURE_THRESHOLDS: TirePressureThresholds = {
  frontLeft: 35,
  frontRight: 35,
  rearLeft: 35,
  rearRight: 35,
};

const STORAGE_KEY = 'ecs_tire_pressure_thresholds_v1';
const memoryStore: Record<string, string> = {};

function getStorageValue(key: string): string | null {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return memoryStore[key] ?? null;
  } catch {
    return memoryStore[key] ?? null;
  }
}

function setStorageValue(key: string, value: string): void {
  try {
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
    memoryStore[key] = value;
  } catch {
    memoryStore[key] = value;
  }
}

function normalizeThreshold(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(150, Math.round(numeric)));
}

export function normalizeTirePressureThresholds(value: unknown): TirePressureThresholds {
  const record = value && typeof value === 'object' ? value as Partial<TirePressureThresholds> : {};
  return {
    frontLeft: normalizeThreshold(record.frontLeft, DEFAULT_TIRE_PRESSURE_THRESHOLDS.frontLeft),
    frontRight: normalizeThreshold(record.frontRight, DEFAULT_TIRE_PRESSURE_THRESHOLDS.frontRight),
    rearLeft: normalizeThreshold(record.rearLeft, DEFAULT_TIRE_PRESSURE_THRESHOLDS.rearLeft),
    rearRight: normalizeThreshold(record.rearRight, DEFAULT_TIRE_PRESSURE_THRESHOLDS.rearRight),
  };
}

export function loadTirePressureThresholds(): TirePressureThresholds {
  const raw = getStorageValue(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_TIRE_PRESSURE_THRESHOLDS };
  try {
    return normalizeTirePressureThresholds(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_TIRE_PRESSURE_THRESHOLDS };
  }
}

export function saveTirePressureThresholds(thresholds: TirePressureThresholds): TirePressureThresholds {
  const normalized = normalizeTirePressureThresholds(thresholds);
  setStorageValue(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

export function saveTirePressureThreshold(
  position: TirePressurePosition,
  thresholdPsi: number,
): TirePressureThresholds {
  return saveTirePressureThresholds({
    ...loadTirePressureThresholds(),
    [position]: thresholdPsi,
  });
}
