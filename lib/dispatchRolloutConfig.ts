import {
  createRuntimeFeatureVisibilityContext,
  resolveECSFeatureVisibility,
  type ECSFeatureVisibilityContext,
} from './features/featureVisibilityRegistry';

export type DispatchRolloutFeature =
  | 'dispatchTabVisibility'
  | 'liveTeamRoster'
  | 'teamPing'
  | 'dispatchQueue'
  | 'assistRequest'
  | 'emergencyPing'
  | 'realtimeSync'
  | 'offlineReplay'
  | 'missionCommand'
  | 'canonicalBackendPersistence'
  | 'notifications'
  | 'developerDiagnostics'
  | 'smartSuggestions'
  | 'automatedCheckIns'
  | 'escalationAutomation'
  | 'mapContextIntegration'
  | 'expeditionLogIntegration'
  | 'teamPositionSharing'
  | 'convoyRegroupPlanner'
  | 'agencyDataIngestion'
  | 'externalDispatchIntegration'
  | 'publicHazardPublishing'
  | 'automatedSosTransmission'
  | 'liveRadioNetworkIntegrations'
  | 'demoData';

export type DispatchRolloutConfig = Record<DispatchRolloutFeature, boolean>;

export type DispatchCanonicalBackendMode = 'disabled' | 'shadow' | 'dual_read';

export const DEFAULT_DISPATCH_ROLLOUT_CONFIG: DispatchRolloutConfig = {
  dispatchTabVisibility: true,
  liveTeamRoster: true,
  teamPing: true,
  dispatchQueue: true,
  assistRequest: true,
  emergencyPing: true,
  realtimeSync: true,
  offlineReplay: true,
  missionCommand: false,
  canonicalBackendPersistence: false,
  notifications: false,
  developerDiagnostics: true,
  smartSuggestions: true,
  automatedCheckIns: true,
  escalationAutomation: false,
  mapContextIntegration: true,
  expeditionLogIntegration: false,
  teamPositionSharing: false,
  convoyRegroupPlanner: false,
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
  missionCommand: 'Mission Command is unavailable outside the approved internal rollout.',
  canonicalBackendPersistence: 'Canonical Dispatch persistence is disabled. ECS remains local-first.',
  notifications: 'Dispatch notifications are disabled until notification policy is verified.',
  developerDiagnostics: 'Dispatch developer diagnostics are disabled for this rollout.',
  smartSuggestions: 'Smart Dispatch suggestions are paused for this rollout.',
  automatedCheckIns: 'Automated check-ins are paused for this rollout.',
  escalationAutomation: 'Automated escalation is paused for this rollout.',
  mapContextIntegration: 'Map context integration is paused for this rollout.',
  expeditionLogIntegration: 'Expedition log integration is paused for this rollout.',
  teamPositionSharing: 'Team position sharing is disabled for internal beta until privacy and device QA gates pass.',
  convoyRegroupPlanner: 'Convoy Regroup Planner is disabled until position-sharing privacy and multi-device QA gates pass.',
  agencyDataIngestion: 'Agency data ingestion is disabled for internal beta. No live agency feed is connected.',
  externalDispatchIntegration: 'External Dispatch integration is disabled. Reports stay local/internal unless explicitly enabled.',
  publicHazardPublishing: 'Public/community hazard publishing is disabled. User reports are not published externally.',
  automatedSosTransmission: 'Automated SOS or emergency transmission is disabled. ECS does not contact emergency services.',
  liveRadioNetworkIntegrations: 'Live radio/network integrations are disabled for internal beta.',
  demoData: 'Demo Dispatch data is disabled outside explicit development/test mode.',
};

export function resolveDispatchRolloutConfig(
  overrides: Partial<DispatchRolloutConfig> = {},
  visibilityContext: ECSFeatureVisibilityContext = createRuntimeFeatureVisibilityContext(),
): DispatchRolloutConfig {
  const merged = {
    ...DEFAULT_DISPATCH_ROLLOUT_CONFIG,
    ...overrides,
  };
  const dispatchVisible = resolveECSFeatureVisibility('dispatch_tab', visibilityContext).visible;
  const positionSharingVisible = resolveECSFeatureVisibility(
    'dispatch_team_position_sharing',
    visibilityContext,
  ).visible;
  const canonicalBackendVisible = resolveECSFeatureVisibility(
    'dispatch_canonical_backend',
    visibilityContext,
  ).visible;
  const missionCommandVisible = resolveECSFeatureVisibility(
    'dispatch_mission_command',
    visibilityContext,
  ).visible;
  const externalIntegrationsVisible = resolveECSFeatureVisibility(
    'dispatch_external_integrations',
    visibilityContext,
  ).visible;
  const developerDiagnosticsVisible = resolveECSFeatureVisibility(
    'developer_diagnostics',
    visibilityContext,
  ).visible;
  return {
    ...merged,
    dispatchTabVisibility: merged.dispatchTabVisibility && dispatchVisible,
    missionCommand:
      (Object.prototype.hasOwnProperty.call(overrides, 'missionCommand')
        ? merged.missionCommand
        : missionCommandVisible) && missionCommandVisible,
    canonicalBackendPersistence:
      (Object.prototype.hasOwnProperty.call(overrides, 'canonicalBackendPersistence')
        ? merged.canonicalBackendPersistence
        : canonicalBackendVisible) && canonicalBackendVisible,
    teamPositionSharing: merged.teamPositionSharing && positionSharingVisible,
    convoyRegroupPlanner: merged.convoyRegroupPlanner && positionSharingVisible,
    escalationAutomation: merged.escalationAutomation && externalIntegrationsVisible,
    agencyDataIngestion: merged.agencyDataIngestion && externalIntegrationsVisible,
    externalDispatchIntegration: merged.externalDispatchIntegration && externalIntegrationsVisible,
    publicHazardPublishing: merged.publicHazardPublishing && externalIntegrationsVisible,
    automatedSosTransmission: merged.automatedSosTransmission && externalIntegrationsVisible,
    liveRadioNetworkIntegrations: merged.liveRadioNetworkIntegrations && externalIntegrationsVisible,
    developerDiagnostics: merged.developerDiagnostics && developerDiagnosticsVisible,
    demoData: merged.demoData && developerDiagnosticsVisible,
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

export function resolveDispatchCanonicalBackendMode(
  config: DispatchRolloutConfig = resolveDispatchRolloutConfig(),
  requestedMode: unknown = process.env.EXPO_PUBLIC_ECS_DISPATCH_CANONICAL_BACKEND_MODE,
): DispatchCanonicalBackendMode {
  if (!config.canonicalBackendPersistence) return 'disabled';
  return requestedMode === 'shadow' || requestedMode === 'dual_read'
    ? requestedMode
    : 'disabled';
}
