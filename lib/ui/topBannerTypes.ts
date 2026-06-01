import type { ECSOperationalState } from '../ai/degradedOperationsTypes';
import type { ECSExpeditionPhase } from '../ai/expeditionPhaseTypes';
import type { ExpeditionState } from '../expeditionStateStore';
import type { ECSLiveStatusMap } from '../status/liveStatusTypes';
import type { SyncStatus } from '../types';
import type { ConnectivityStatus } from '../connectivity';

export type ECSTopBannerTone =
  | 'online'
  | 'syncing'
  | 'offline_capable'
  | 'degraded'
  | 'offline'
  | 'neutral';

export type ECSTopBannerCommandContext = {
  expeditionPhase?: ECSExpeditionPhase | null;
  operationalState?: ECSOperationalState | null;
  liveStatus?: ECSLiveStatusMap | null;
};

export type ECSTopBannerResolverInput = {
  syncStatus: SyncStatus;
  connectivityStatus: ConnectivityStatus;
  isOnline: boolean;
  offlineMode: boolean;
  userPresent: boolean;
  expeditionState: ExpeditionState;
  hasActiveExpeditionContext: boolean;
  commandContext?: ECSTopBannerCommandContext | null;
};

export type ECSTopBannerPresentation = {
  postureLabel: string;
  postureDetail: string;
  statusLabel: string;
  statusDetail: string;
  tone: ECSTopBannerTone;
  processingActive: boolean;
  processingLabel: string | null;
  source: string;
  priority: number;
  reason: string;
  suppressedSources: string[];
  diagnostics: {
    gpsLive: boolean;
    routeUsable: boolean;
    routeStatus: ECSLiveStatusMap['route']['status'] | null;
    hasConfiguredVehicle: boolean;
    offlineMode: boolean;
    cloudEnhancementAvailable: boolean;
  };
};

export type ECSProfileCommandStatus = {
  statusLabel: string;
  statusDetail: string;
  tone: ECSTopBannerTone;
  processingActive: boolean;
  processingLabel: string | null;
};
