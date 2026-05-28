import { ecsProviderRegistry } from './EcsProviderRegistry';
import type { IEcsPowerProvider } from './IEcsPowerProvider';
import type { BluProviderId } from './BluTypes';
import { getBluestackParserDecision } from './bluestack';
import { vehicleTelemetryDeviceRegistry } from '../src/vehicle-telemetry/VehicleTelemetryDeviceRegistry';
import { vehicleTelemetryService } from '../src/vehicle-telemetry/VehicleTelemetryService';
import { obd2Adapter } from '../src/vehicle-telemetry/OBD2Adapter';

type PowerProviderModule = {
  [exportName: string]: unknown;
};

const POWER_PROVIDER_EXPORTS: {
  label: string;
  providerId: BluProviderId;
  exportName: string;
  loadModule: () => PowerProviderModule;
}[] = [
  {
    label: 'EcoFlowBluAdapter',
    providerId: 'ecoflow',
    exportName: 'ecoFlowBluAdapter',
    loadModule: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./EcoFlowBluAdapter') as PowerProviderModule;
    },
  },
  {
    label: 'BluettiPowerProvider',
    providerId: 'bluetti',
    exportName: 'bluettiPowerProvider',
    loadModule: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./livePowerBleProviders') as PowerProviderModule;
    },
  },
  {
    label: 'AnkerSolixPowerProvider',
    providerId: 'anker_solix',
    exportName: 'ankerSolixPowerProvider',
    loadModule: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./livePowerBleProviders') as PowerProviderModule;
    },
  },
  {
    label: 'JackeryPowerProvider',
    providerId: 'jackery',
    exportName: 'jackeryPowerProvider',
    loadModule: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./livePowerBleProviders') as PowerProviderModule;
    },
  },
  {
    label: 'GoalZeroPowerProvider',
    providerId: 'goal_zero',
    exportName: 'goalZeroPowerProvider',
    loadModule: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./livePowerBleProviders') as PowerProviderModule;
    },
  },
  {
    label: 'RenogyPowerProvider',
    providerId: 'renogy',
    exportName: 'renogyPowerProvider',
    loadModule: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./livePowerBleProviders') as PowerProviderModule;
    },
  },
  {
    label: 'RedarcPowerProvider',
    providerId: 'redarc',
    exportName: 'redarcPowerProvider',
    loadModule: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./livePowerBleProviders') as PowerProviderModule;
    },
  },
  {
    label: 'DakotaLithiumPowerProvider',
    providerId: 'dakota_lithium',
    exportName: 'dakotaLithiumPowerProvider',
    loadModule: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./livePowerBleProviders') as PowerProviderModule;
    },
  },
  {
    label: 'VictronPowerProvider',
    providerId: 'victron',
    exportName: 'victronPowerProvider',
    loadModule: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require('./livePowerBleProviders') as PowerProviderModule;
    },
  },
];

let restorePromise: Promise<void> | null = null;
let restoreCompleted = false;

function isPowerProviderCandidate(value: unknown): value is IEcsPowerProvider {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<IEcsPowerProvider>;
  return (
    typeof candidate.providerId === 'string' &&
    typeof candidate.displayName === 'string' &&
    typeof candidate.connect === 'function' &&
    typeof candidate.disconnect === 'function' &&
    typeof candidate.discoverDevices === 'function'
  );
}

function loadPowerProvider(
  label: string,
  exportName: string,
  loadModule: () => PowerProviderModule,
): IEcsPowerProvider | null {
  try {
    const loaded = loadModule();
    const provider = loaded?.[exportName];

    if (!isPowerProviderCandidate(provider)) {
      return null;
    }

    return provider;
  } catch (error) {
    console.warn(`[ecsLiveSystemBootstrap] Unable to load provider module ${label}:`, error);
    return null;
  }
}

function resolvePowerProviders(): IEcsPowerProvider[] {
  const resolved: IEcsPowerProvider[] = [];

  for (const entry of POWER_PROVIDER_EXPORTS) {
    const parserDecision = getBluestackParserDecision(entry.providerId);
    if (!parserDecision.canDecodeLiveTelemetry) {
      if (ecsProviderRegistry.isRegistered(entry.providerId)) {
        ecsProviderRegistry.unregisterProvider(entry.providerId);
      }
      continue;
    }

    const provider = loadPowerProvider(entry.label, entry.exportName, entry.loadModule);
    if (!provider) continue;
    resolved.push(provider);
  }

  return resolved;
}

export function ensureEcsPowerProvidersRegistered(): void {
  const providers = resolvePowerProviders();

  for (const provider of providers) {
    if (!ecsProviderRegistry.isRegistered(provider.providerId)) {
      ecsProviderRegistry.registerProvider(provider);
    }
  }
}

async function restorePowerSessions(): Promise<void> {
  ensureEcsPowerProvidersRegistered();

  const results = await ecsProviderRegistry.restoreAllSessions();
  const restoredAny = Array.from(results.values()).some(Boolean);

  if (restoredAny) {
    await ecsProviderRegistry.fetchAllTelemetry();
  }
}

async function restoreTelemetrySession(): Promise<void> {
  vehicleTelemetryDeviceRegistry.resetAllConnectionStates();
  const primaryDevice = vehicleTelemetryDeviceRegistry.restorePrimary();
  vehicleTelemetryService.setPrimaryDevice(primaryDevice);

  if (!obd2Adapter.isAutoReconnectEnabled()) {
    vehicleTelemetryService.signalReconnecting(false);
    return;
  }

  try {
    const restored = await obd2Adapter.attemptReconnect();
    if (!restored) {
      vehicleTelemetryService.signalReconnecting(false);
    }
  } catch (error) {
    console.warn('[ecsLiveSystemBootstrap] Telemetry restore failed:', error);
    vehicleTelemetryService.signalReconnecting(false);
  }
}

export async function restoreUnifiedDeviceSessions(): Promise<void> {
  ensureEcsPowerProvidersRegistered();

  if (restoreCompleted) return;
  if (!restorePromise) {
    restorePromise = (async () => {
      await Promise.allSettled([
        restorePowerSessions(),
        restoreTelemetrySession(),
      ]);
      restoreCompleted = true;
    })().finally(() => {
      restorePromise = null;
    });
  }

  await restorePromise;
}
