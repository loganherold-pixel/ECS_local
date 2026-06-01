import type { ConnectivityStatus } from './connectivity';
import type { SyncStatus } from './types';

export type ConnectivitySyncReason =
  | 'no_team'
  | 'forced_offline'
  | 'network_offline'
  | 'sync_service_unavailable'
  | 'online_ready';

export type CanonicalConnectivityState = {
  networkOnline: boolean;
  userForcedOfflineMode: boolean;
  effectiveOfflineMode: boolean;
  syncAvailable: boolean;
  reason: Exclude<ConnectivitySyncReason, 'no_team'>;
};

export type ConnectivityStateInput = {
  isOnline?: boolean | null;
  networkOnline?: boolean | null;
  offlineMode?: boolean | null;
  userForcedOfflineMode?: boolean | null;
  syncStatus?: SyncStatus | string | null;
  syncServiceAvailable?: boolean | null;
  connectivityStatus?: ConnectivityStatus | string | null;
  connectivity?: {
    status?: ConnectivityStatus | string | null;
    isOnline?: boolean | null;
    isInternetReachable?: boolean | null;
  } | null;
};

export function resolveCanonicalConnectivityState(
  input: ConnectivityStateInput,
): CanonicalConnectivityState {
  const status = input.connectivityStatus ?? input.connectivity?.status ?? null;
  const networkOnline =
    input.networkOnline ??
    input.isOnline ??
    input.connectivity?.isOnline ??
    (status ? status === 'online' : false);
  const userForcedOfflineMode = !!(input.userForcedOfflineMode ?? input.offlineMode);
  const networkOffline = !networkOnline || status === 'offline';
  const syncServiceUnavailable =
    input.syncServiceAvailable === false ||
    input.syncStatus === 'error';
  const effectiveOfflineMode = userForcedOfflineMode || networkOffline;
  const syncAvailable = !effectiveOfflineMode && !syncServiceUnavailable;
  const reason: CanonicalConnectivityState['reason'] = userForcedOfflineMode
    ? 'forced_offline'
    : networkOffline
      ? 'network_offline'
      : syncServiceUnavailable
        ? 'sync_service_unavailable'
        : 'online_ready';

  return {
    networkOnline: !!networkOnline,
    userForcedOfflineMode,
    effectiveOfflineMode,
    syncAvailable,
    reason,
  };
}
