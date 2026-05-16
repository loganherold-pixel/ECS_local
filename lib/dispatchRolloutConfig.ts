export type DispatchRolloutFeature =
  | 'dispatchTabVisibility'
  | 'liveTeamRoster'
  | 'teamPing'
  | 'dispatchQueue'
  | 'assistRequest'
  | 'emergencyPing'
  | 'realtimeSync'
  | 'offlineReplay'
  | 'notifications'
  | 'developerDiagnostics'
  | 'smartSuggestions'
  | 'automatedCheckIns'
  | 'escalationAutomation'
  | 'mapContextIntegration'
  | 'expeditionLogIntegration'
  | 'teamPositionSharing'
  | 'agencyDataIngestion'
  | 'externalDispatchIntegration'
  | 'publicHazardPublishing'
  | 'automatedSosTransmission'
  | 'liveRadioNetworkIntegrations'
  | 'demoData';

export type DispatchRolloutConfig = Record<DispatchRolloutFeature, boolean>;

export const DEFAULT_DISPATCH_ROLLOUT_CONFIG: DispatchRolloutConfig = {
  dispatchTabVisibility: true,
  liveTeamRoster: true,
  teamPing: true,
  dispatchQueue: true,
  assistRequest: true,
  emergencyPing: true,
  realtimeSync: true,
  offlineReplay: true,
  notifications: false,
  developerDiagnostics: true,
  smartSuggestions: true,
  automatedCheckIns: true,
  escalationAutomation: false,
  mapContextIntegration: true,
  expeditionLogIntegration: false,
  teamPositionSharing: false,
  agencyDataIngestion: false,
  externalDispatchIntegration: false,
  publicHazardPublishing: false,
  automatedSosTransmission: false,
  liveRadioNetworkIntegrations: false,
  demoData: false,
};

const DISPATCH_ROLLOUT_DISABLED_COPY: Record<DispatchRolloutFeature, string> = {
  dispatchTabVisibility: 'Dispatch is paused for this rollout.',
  liveTeamRoster: 'Live roster loading is paused. Dispatch is using local expedition data.',
  teamPing: 'Team Ping is paused for this rollout.',
  dispatchQueue: 'Dispatch Queue is paused for this rollout.',
  assistRequest: 'Assist Request is paused for this rollout. ECS team coordination only.',
  emergencyPing: 'Emergency Ping is paused for this rollout. Not an emergency services contact.',
  realtimeSync: 'Realtime Dispatch sync is paused for this rollout.',
  offlineReplay: 'Offline Dispatch replay is paused for this rollout.',
  notifications: 'Dispatch notifications are disabled until notification policy is verified.',
  developerDiagnostics: 'Dispatch developer diagnostics are disabled for this rollout.',
  smartSuggestions: 'Smart Dispatch suggestions are paused for this rollout.',
  automatedCheckIns: 'Automated check-ins are paused for this rollout.',
  escalationAutomation: 'Automated escalation is paused for this rollout.',
  mapContextIntegration: 'Map context integration is paused for this rollout.',
  expeditionLogIntegration: 'Expedition log integration is paused for this rollout.',
  teamPositionSharing: 'Team position sharing is disabled for internal beta until privacy and device QA gates pass.',
  agencyDataIngestion: 'Agency data ingestion is disabled for internal beta. No live agency feed is connected.',
  externalDispatchIntegration: 'External Dispatch integration is disabled. Reports stay local/internal unless explicitly enabled.',
  publicHazardPublishing: 'Public/community hazard publishing is disabled. User reports are not published externally.',
  automatedSosTransmission: 'Automated SOS or emergency transmission is disabled. ECS does not contact emergency services.',
  liveRadioNetworkIntegrations: 'Live radio/network integrations are disabled for internal beta.',
  demoData: 'Demo Dispatch data is disabled outside explicit development/test mode.',
};

export function resolveDispatchRolloutConfig(
  overrides: Partial<DispatchRolloutConfig> = {},
): DispatchRolloutConfig {
  return {
    ...DEFAULT_DISPATCH_ROLLOUT_CONFIG,
    ...overrides,
  };
}

export function isDispatchFeatureEnabled(
  config: DispatchRolloutConfig,
  feature: DispatchRolloutFeature,
): boolean {
  return config[feature] === true;
}

export function getDispatchRolloutDisabledCopy(feature: DispatchRolloutFeature): string {
  return DISPATCH_ROLLOUT_DISABLED_COPY[feature];
}
