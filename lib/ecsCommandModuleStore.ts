import { createPersistedKeyValueCache } from './keyValuePersistence';

export type ECSCommandModuleId =
  | 'attitude'
  | 'follow3d'
  | 'terrainRisk'
  | 'routeCommand'
  | 'powerCommand'
  | 'environmentalCommand';

export type ECSCommandModuleDefinition = {
  id: ECSCommandModuleId;
  label: string;
  title: string;
  subtitle: string;
  icon: string;
  statusLabel: string;
  description: string;
};

type ECSCommandModuleListener = (moduleId: ECSCommandModuleId) => void;

const STORAGE_KEY_SELECTED_MODULE = 'ecs_command_center_module';
const STORAGE_KEY_DEFAULT_FOLLOW3D_MIGRATED = 'ecs_command_center_default_follow3d_migrated';
const commandModuleCache = createPersistedKeyValueCache('ecs_command_preferences');
const DEFAULT_ECS_COMMAND_MODULE: ECSCommandModuleId = 'follow3d';

export const ECS_COMMAND_MODULE_ORDER: ECSCommandModuleId[] = [
  'follow3d',
  'attitude',
];

export const ECS_COMMAND_MODULE_REGISTRY: Partial<Record<ECSCommandModuleId, ECSCommandModuleDefinition>> = {
  attitude: {
    id: 'attitude',
    label: 'Attitude Command',
    title: 'ATTITUDE COMMAND',
    subtitle: 'Fleet Vehicle Profile',
    icon: 'speedometer-outline',
    statusLabel: 'ATT',
    description: 'Deterministic pitch and roll command surface from visible device attitude telemetry.',
  },
  follow3d: {
    id: 'follow3d',
    label: 'Navigation Command',
    title: 'NAVIGATION COMMAND',
    subtitle: '',
    icon: 'map-outline',
    statusLabel: 'NAV',
    description: 'Centralized navigation command status inside the fixed command shell.',
  },
};

export function normalizeECSCommandModuleId(value: unknown): ECSCommandModuleId | null {
  if (value === 'convoyCommand' || value === 'convoy-command') return null;
  if (value === 'expeditionReadinessCommand' || value === 'expedition-readiness-command') return null;
  if (typeof value !== 'string') return null;
  return ECS_COMMAND_MODULE_ORDER.includes(value as ECSCommandModuleId)
    ? (value as ECSCommandModuleId)
    : null;
}

export function isECSCommandModuleId(value: unknown): value is ECSCommandModuleId {
  return normalizeECSCommandModuleId(value) != null;
}

function resolveStoredCommandModule(stored: string | null): ECSCommandModuleId {
  const normalized = normalizeECSCommandModuleId(stored);
  const migratedToFollow3d = commandModuleCache.get(STORAGE_KEY_DEFAULT_FOLLOW3D_MIGRATED) === 'true';

  if (normalized === 'attitude' && !migratedToFollow3d) {
    commandModuleCache.set(STORAGE_KEY_DEFAULT_FOLLOW3D_MIGRATED, 'true');
    commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, DEFAULT_ECS_COMMAND_MODULE);
    return DEFAULT_ECS_COMMAND_MODULE;
  }

  if (!migratedToFollow3d) {
    commandModuleCache.set(STORAGE_KEY_DEFAULT_FOLLOW3D_MIGRATED, 'true');
  }

  return normalized ?? DEFAULT_ECS_COMMAND_MODULE;
}

class ECSCommandModuleStore {
  private _selectedModule: ECSCommandModuleId = DEFAULT_ECS_COMMAND_MODULE;
  private _hydrated = false;
  private _listeners = new Set<ECSCommandModuleListener>();

  constructor() {
    this._load();
    void this._hydrate();
  }

  private _load(): void {
    const stored = commandModuleCache.get(STORAGE_KEY_SELECTED_MODULE);
    if (!commandModuleCache.isHydrated() && stored == null) {
      this._selectedModule = DEFAULT_ECS_COMMAND_MODULE;
      return;
    }

    const resolved = resolveStoredCommandModule(stored);
    this._selectedModule = resolved;

    if (stored !== resolved) {
      commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, resolved);
    }
  }

  private async _hydrate(): Promise<void> {
    await commandModuleCache.waitForHydration();
    const stored = commandModuleCache.get(STORAGE_KEY_SELECTED_MODULE);
    const hydratedModule = resolveStoredCommandModule(stored);
    const changed = hydratedModule !== this._selectedModule;

    if (stored !== hydratedModule) {
      commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, hydratedModule);
    }

    this._selectedModule = hydratedModule;
    this._hydrated = true;

    if (changed) {
      this._notify();
    }
  }

  private _notify(): void {
    for (const listener of this._listeners) {
      listener(this._selectedModule);
    }
  }

  get selectedModule(): ECSCommandModuleId {
    return this._selectedModule;
  }

  get isHydrated(): boolean {
    return this._hydrated;
  }

  setSelectedModule(moduleId: ECSCommandModuleId): void {
    const normalized = normalizeECSCommandModuleId(moduleId) ?? DEFAULT_ECS_COMMAND_MODULE;
    if (normalized === this._selectedModule) return;

    this._selectedModule = normalized;
    commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, normalized);
    this._notify();
  }

  subscribe(listener: ECSCommandModuleListener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  async waitForHydration(): Promise<void> {
    await commandModuleCache.waitForHydration();
    if (!this._hydrated) {
      const stored = commandModuleCache.get(STORAGE_KEY_SELECTED_MODULE);
      const hydratedModule = resolveStoredCommandModule(stored);
      this._selectedModule = hydratedModule;
      if (stored !== hydratedModule) {
        commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, hydratedModule);
      }
      this._hydrated = true;
    }
  }
}

export const ecsCommandModuleStore = new ECSCommandModuleStore();
