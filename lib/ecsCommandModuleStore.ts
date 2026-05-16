import { createPersistedKeyValueCache } from './keyValuePersistence';

export type ECSCommandModuleId =
  | 'attitude'
  | 'follow3d'
  | 'recoveryHazardCompass'
  | 'trailDecisionCommand'
  | 'campScoutCommand'
  | 'expeditionReadinessCommand'
  | 'convoyCommand'
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
const commandModuleCache = createPersistedKeyValueCache('ecs_command_preferences');
const DEFAULT_ECS_COMMAND_MODULE: ECSCommandModuleId = 'attitude';

export const ECS_COMMAND_MODULE_ORDER: ECSCommandModuleId[] = [
  'attitude',
  'follow3d',
  'recoveryHazardCompass',
  'trailDecisionCommand',
  'campScoutCommand',
  'expeditionReadinessCommand',
  'convoyCommand',
];

export const ECS_COMMAND_MODULE_REGISTRY: Record<ECSCommandModuleId, ECSCommandModuleDefinition> = {
  attitude: {
    id: 'attitude',
    label: 'Attitude Command',
    title: 'ATTITUDE COMMAND',
    subtitle: 'Fleet Vehicle Profile',
    icon: 'speedometer-outline',
    statusLabel: 'ATTITUDE',
    description: 'Current Fleet vehicle side and rear profile view with attitude instrumentation.',
  },
  follow3d: {
    id: 'follow3d',
    label: 'Navigation Command',
    title: 'NAVIGATION COMMAND',
    subtitle: '3D Follow Map',
    icon: 'map-outline',
    statusLabel: 'NAV',
    description: 'Centralized 3D follow map inside the fixed Attitude Command shell.',
  },
  recoveryHazardCompass: {
    id: 'recoveryHazardCompass',
    label: 'Recovery / Hazard Compass',
    title: 'RECOVERY / HAZARD COMPASS',
    subtitle: 'Recovery Vector Standby',
    icon: 'compass-outline',
    statusLabel: 'RECOVERY',
    description: 'Shared command-center slot for recovery bearing, hazard direction, and response guidance.',
  },
  trailDecisionCommand: {
    id: 'trailDecisionCommand',
    label: 'Trail Decision Command',
    title: 'TRAIL DECISION COMMAND',
    subtitle: 'Go / No-Go Terrain Assessment',
    icon: 'analytics-outline',
    statusLabel: 'TRAIL',
    description: 'Deterministic go/no-go trail decision surface for route, terrain, daylight, vehicle, and recovery margin.',
  },
  campScoutCommand: {
    id: 'campScoutCommand',
    label: 'Camp Scout Command',
    title: 'CAMP SCOUT COMMAND',
    subtitle: 'Campsite Viability Intelligence',
    icon: 'bonfire-outline',
    statusLabel: 'CAMP',
    description: 'Campsite viability command surface for saved, established, and staged camp candidates.',
  },
  expeditionReadinessCommand: {
    id: 'expeditionReadinessCommand',
    label: 'Expedition Readiness Command',
    title: 'EXPEDITION READINESS COMMAND',
    subtitle: 'Continuation Readiness Assessment',
    icon: 'shield-checkmark-outline',
    statusLabel: 'READY',
    description: 'Command-level synthesis of vehicle, route, power, weather, daylight, recovery, communications, and incident readiness.',
  },
  convoyCommand: {
    id: 'convoyCommand',
    label: 'Convoy Command',
    title: 'CONVOY COMMAND',
    subtitle: 'Group Expedition Coordination',
    icon: 'people-outline',
    statusLabel: 'CONVOY',
    description: 'Manual convoy plan and shared check-in coordination without fake live tracking.',
  },
  routeCommand: {
    id: 'routeCommand',
    label: 'Route Command',
    title: 'ROUTE COMMAND',
    subtitle: 'Guidance and Progress',
    icon: 'navigate-outline',
    statusLabel: 'ROUTE',
    description: 'Active guidance summary using the existing route progress contract.',
  },
  powerCommand: {
    id: 'powerCommand',
    label: 'Power Command',
    title: 'POWER COMMAND',
    subtitle: 'Energy Flow Overview',
    icon: 'battery-charging-outline',
    statusLabel: 'POWER',
    description: 'BLU and power telemetry summary from the existing power pipeline.',
  },
  environmentalCommand: {
    id: 'environmentalCommand',
    label: 'Environmental Command',
    title: 'ENVIRONMENTAL COMMAND',
    subtitle: 'Weather and Daylight',
    icon: 'partly-sunny-outline',
    statusLabel: 'ENV',
    description: 'Sunlight and weather context from the current environment and weather sources.',
  },
};

export function isECSCommandModuleId(value: unknown): value is ECSCommandModuleId {
  return typeof value === 'string' && ECS_COMMAND_MODULE_ORDER.includes(value as ECSCommandModuleId);
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
    if (isECSCommandModuleId(stored)) {
      this._selectedModule = stored;
    } else if (stored != null) {
      commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, DEFAULT_ECS_COMMAND_MODULE);
    }
  }

  private async _hydrate(): Promise<void> {
    await commandModuleCache.waitForHydration();
    const stored = commandModuleCache.get(STORAGE_KEY_SELECTED_MODULE);
    const hydratedModule = isECSCommandModuleId(stored) ? stored : DEFAULT_ECS_COMMAND_MODULE;
    const changed = hydratedModule !== this._selectedModule;

    if (!isECSCommandModuleId(stored) && stored != null) {
      commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, DEFAULT_ECS_COMMAND_MODULE);
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
    if (moduleId === this._selectedModule) return;

    this._selectedModule = moduleId;
    commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, moduleId);
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
      if (isECSCommandModuleId(stored)) {
        this._selectedModule = stored;
      } else if (stored != null) {
        this._selectedModule = DEFAULT_ECS_COMMAND_MODULE;
        commandModuleCache.set(STORAGE_KEY_SELECTED_MODULE, DEFAULT_ECS_COMMAND_MODULE);
      }
      this._hydrated = true;
    }
  }
}

export const ecsCommandModuleStore = new ECSCommandModuleStore();
