import { ecsBus } from '../ecsBus';
import { ecsSyncCoordinator } from '../ecsSyncCoordinator';
import { getDispatchPersistenceProjectionDiagnostics } from '../dispatchPersistenceEventProjection';
import { getActiveVehicleSubscriptionDiagnostics } from '../fleet/activeVehicleState';
import { getExpeditionStateSubscriptionDiagnostics } from '../expeditionStateStore';
import { navigateRouteSessionStore } from '../navigateRouteSessionStore';
import { getPersistedKeyValueDiagnostics } from '../keyValuePersistence';
import { getECSPerformanceSnapshot } from '../performance/ecsPerformanceDiagnostics';
import { realtimeSync } from '../realtimeSync';
import { syncActionQueue } from '../syncActionQueue';
import { getSharedOperationalWeatherDiagnostics } from '../useOperationalWeather';
import { ecsStoreHydrationCoordinator } from './storeHydrationCoordinator';
import { ecsStateTransactionCoordinator } from './stateTransactionCoordinator';

export const ECS_STATE_MANAGEMENT_DIAGNOSTICS_VERSION = 1 as const;

export function getECSStateManagementDiagnostics() {
  const busMetrics = ecsBus.getMetrics();
  const syncState = ecsSyncCoordinator.getState();
  const realtimeStats = realtimeSync.stats;
  const queueDiagnostics = syncActionQueue.getActorIsolationDiagnostics();
  const performance = getECSPerformanceSnapshot();

  return {
    schemaVersion: ECS_STATE_MANAGEMENT_DIAGNOSTICS_VERSION,
    generatedAt: new Date().toISOString(),
    hydration: ecsStoreHydrationCoordinator.getDiagnostics(),
    transactions: ecsStateTransactionCoordinator.getDiagnostics(),
    subscriptions: {
      performanceTracked: performance.activeSubscriptionCount,
      eventBus: busMetrics.subscription_count,
      eventBusDuplicatesObserved: busMetrics.duplicate_subscription_count,
      syncCoordinator: syncState.subscription_count,
      activeVehicle: getActiveVehicleSubscriptionDiagnostics(),
      activeExpedition: getExpeditionStateSubscriptionDiagnostics(),
      dispatchPersistenceProjection: getDispatchPersistenceProjectionDiagnostics(),
      navigateRouteSession: navigateRouteSessionStore.getDiagnostics(),
      operationalWeather: getSharedOperationalWeatherDiagnostics(),
      realtimeChangeListeners: realtimeStats.changeListenerCount,
      realtimeStatusListeners: realtimeStats.statusListenerCount,
    },
    persistence: getPersistedKeyValueDiagnostics(),
    queues: {
      syncOutbox: queueDiagnostics,
      outstandingAsyncJobs: performance.outstandingAsyncJobs,
    },
  };
}
