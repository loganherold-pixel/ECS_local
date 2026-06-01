import { createPersistedKeyValueCache } from '../keyValuePersistence';
import type { ECSOperatorTrustMode } from './operatorTrustTypes';

const STORAGE_KEY_MODE = 'ecs_operator_trust_mode';
const trustModeCache = createPersistedKeyValueCache('ecs_command_preferences');

type TrustModeListener = (mode: ECSOperatorTrustMode) => void;

function isTrustMode(value: string | null | undefined): value is ECSOperatorTrustMode {
  return value === 'conservative_guidance'
    || value === 'balanced_command'
    || value === 'minimal_advisory';
}

class OperatorTrustModeStore {
  private _mode: ECSOperatorTrustMode = 'balanced_command';
  private _hydrated = false;
  private _listeners: Set<TrustModeListener> = new Set();

  constructor() {
    this._load();
    void this._hydrate();
  }

  private _load(): void {
    const stored = trustModeCache.get(STORAGE_KEY_MODE);
    if (isTrustMode(stored)) {
      this._mode = stored;
    }
  }

  private async _hydrate(): Promise<void> {
    await trustModeCache.waitForHydration();
    const stored = trustModeCache.get(STORAGE_KEY_MODE);
    const changed = isTrustMode(stored) && stored !== this._mode;

    if (changed) {
      this._mode = stored;
    }

    this._hydrated = true;

    if (changed) {
      this._notify();
    }
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener(this._mode);
    }
  }

  get mode(): ECSOperatorTrustMode {
    return this._mode;
  }

  get isHydrated(): boolean {
    return this._hydrated;
  }

  setMode(mode: ECSOperatorTrustMode): void {
    if (mode === this._mode) {
      return;
    }
    this._mode = mode;
    trustModeCache.set(STORAGE_KEY_MODE, mode);
    this._notify();
  }

  subscribe(listener: TrustModeListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  async waitForHydration(): Promise<void> {
    await trustModeCache.waitForHydration();
    if (!this._hydrated) {
      const stored = trustModeCache.get(STORAGE_KEY_MODE);
      if (isTrustMode(stored)) {
        this._mode = stored;
      }
      this._hydrated = true;
    }
  }
}

export const operatorTrustModeStore = new OperatorTrustModeStore();
