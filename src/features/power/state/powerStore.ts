import type { PowerTelemetry } from "../types/powerTypes";

type PowerStoreState = {
  readings: PowerTelemetry[];
  updatedAt: number | null;
};

type PowerStoreListener = (state: PowerStoreState) => void;

let state: PowerStoreState = {
  readings: [],
  updatedAt: null,
};

const listeners = new Set<PowerStoreListener>();

function emit(): void {
  for (const listener of listeners) listener(state);
}

export function getPowerStoreState(): PowerStoreState {
  return state;
}

export function setPowerStoreReadings(readings: PowerTelemetry[]): void {
  state = {
    readings: readings.slice(),
    updatedAt: Date.now(),
  };
  emit();
}

export function subscribePowerStore(listener: PowerStoreListener): () => void {
  listeners.add(listener);
  listener(state);
  return () => {
    listeners.delete(listener);
  };
}

export const powerStore = {
  getState: getPowerStoreState,
  setReadings: setPowerStoreReadings,
  subscribe: subscribePowerStore,
};

