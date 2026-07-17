export const ECS_FEATURE_IDS = [
  'fleet_tab',
  'navigate_tab',
  'dashboard_tab',
  'explore_tab',
  'dispatch_tab',
  'explore_trip_builder',
  'explore_offline_prep',
  'convoy_command',
  'dispatch_mission_command',
  'dispatch_incident_room',
  'dispatch_canonical_backend',
  'dispatch_mission_command_backend',
  'dispatch_team_position_sharing',
  'dispatch_smart_rally',
  'dispatch_external_integrations',
  'established_campgrounds',
  'dispersed_camping',
  'weather_route_intelligence',
  'bluetooth_obd_connections',
  'automotive_vehicle_display',
  'android_auto_bridge',
  'carplay_bridge',
  'ai_assist',
  'campops_telemetry',
  'community_publishing',
  'campops_manual_area_review',
  'developer_diagnostics',
  'developer_qa_surfaces',
  'convoy_rive_qa',
] as const;

export type ECSFeatureId = (typeof ECS_FEATURE_IDS)[number];

export type ECSFeatureMaturity =
  | 'development'
  | 'internal'
  | 'restricted_field_test'
  | 'beta'
  | 'production';

export type ECSFeatureOwnerDomain =
  | 'fleet'
  | 'navigate'
  | 'dashboard'
  | 'explore'
  | 'dispatch'
  | 'campops'
  | 'weather'
  | 'devices'
  | 'platform';

export type ECSDeploymentEnvironment = 'development' | 'test' | 'internal' | 'production';
export type ECSFeatureAccountRequirement = 'none' | 'authenticated' | 'full_access' | 'admin';
export type ECSFeatureOfflineSupport = 'full' | 'degraded' | 'none';
export type ECSFeatureAvailability = 'available' | 'degraded' | 'unavailable';
export type ECSCapabilityState = 'available' | 'unavailable' | 'unknown';

export type ECSFeatureDecisionReason =
  | 'enabled'
  | 'rollout_disabled'
  | 'configuration_missing'
  | 'configuration_malformed'
  | 'environment_blocked'
  | 'debug_build_only'
  | 'authentication_required'
  | 'subscription_required'
  | 'admin_required'
  | 'backend_unavailable'
  | 'provider_unavailable'
  | 'hardware_unavailable'
  | 'permission_required'
  | 'privacy_approval_required'
  | 'production_evidence_required'
  | 'feature_dependency_unavailable'
  | 'offline_unavailable'
  | 'kill_switch';

export type ECSFeatureDependency = {
  id: string;
  mode: 'block' | 'degrade';
};

export type ECSFeatureRoutePolicy = {
  paths: readonly string[];
  unavailableBehavior: 'block' | 'degraded_read_only';
  safeReturnRoute: string;
};

export type ECSFeatureDefinition = {
  id: ECSFeatureId;
  ownerDomain: ECSFeatureOwnerDomain;
  userFacingLabel: string;
  maturity: ECSFeatureMaturity;
  defaultEnabled: boolean;
  environment: {
    allowed: readonly ECSDeploymentEnvironment[];
    enableFlag?: string;
    enableFlagRequired?: boolean;
    developmentDefaultEnabled?: boolean;
    debugOnly?: boolean;
  };
  accountRequirement: ECSFeatureAccountRequirement;
  backendDependencies: readonly ECSFeatureDependency[];
  providerDependencies: readonly ECSFeatureDependency[];
  nativeDependencies: readonly ECSFeatureDependency[];
  permissionDependencies: readonly ECSFeatureDependency[];
  featureDependencies: readonly ECSFeatureId[];
  privacyApproval?: {
    key: string;
    requiredToEnable: boolean;
  };
  productionEvidence: {
    requirements: readonly string[];
    requiredToEnable: boolean;
  };
  offlineSupport: ECSFeatureOfflineSupport;
  degradedBehavior: {
    allowed: boolean;
    copy: string;
  };
  killSwitch: string;
  unavailableCopy: string;
  relatedReadinessGate: string | null;
  routePolicy?: ECSFeatureRoutePolicy;
};

export type ECSFeatureVisibilityContext = {
  environment: ECSDeploymentEnvironment | null;
  env: Record<string, string | undefined> | null;
  online: boolean;
  authenticated: boolean;
  hasFullAccess: boolean;
  isAdmin: boolean;
  backends: Record<string, ECSCapabilityState | undefined>;
  providers: Record<string, ECSCapabilityState | undefined>;
  hardware: Record<string, ECSCapabilityState | undefined>;
  permissions: Record<string, ECSCapabilityState | undefined>;
  privacyApprovals: ReadonlySet<string>;
  productionEvidence: ReadonlySet<string>;
};

export type ECSFeatureVisibilityDecision = {
  featureId: ECSFeatureId;
  availability: ECSFeatureAvailability;
  enabled: boolean;
  visible: boolean;
  reason: ECSFeatureDecisionReason;
  explanation: string;
  unavailableCopy: string;
  maturity: ECSFeatureMaturity;
  productionApproved: boolean;
  productionBlockers: string[];
  forcedEnable: boolean;
};

export type ECSFeatureRouteAccess = {
  matched: boolean;
  featureId: ECSFeatureId | null;
  allowed: boolean;
  readOnly: boolean;
  safeReturnRoute: string | null;
  decision: ECSFeatureVisibilityDecision | null;
};

const ALL_ENVIRONMENTS: readonly ECSDeploymentEnvironment[] = [
  'development',
  'test',
  'internal',
  'production',
];

const DEVELOPMENT_ENVIRONMENTS: readonly ECSDeploymentEnvironment[] = ['development', 'test'];

const NO_DEGRADED_BEHAVIOR = {
  allowed: false,
  copy: 'This feature is unavailable in the current ECS capability state.',
} as const;

const LOCAL_DEGRADED_BEHAVIOR = {
  allowed: true,
  copy: 'Live services are unavailable. ECS is using supported local or cached behavior.',
} as const;

export const ECS_FEATURE_REGISTRY: readonly ECSFeatureDefinition[] = [
  primaryTabFeature('fleet_tab', 'fleet', 'Fleet', 'production', '/fleet', 'gate:fleet-production'),
  primaryTabFeature('navigate_tab', 'navigate', 'Navigate', 'beta', '/navigate', 'gate:offline-navigation-production'),
  primaryTabFeature('dashboard_tab', 'dashboard', 'Dashboard', 'production', '/dashboard', 'gate:dashboard-production'),
  primaryTabFeature('explore_tab', 'explore', 'Explore', 'beta', '/discover', 'gate:explore-trail-packs-production'),
  primaryTabFeature('dispatch_tab', 'dispatch', 'Dispatch', 'beta', '/alert', 'gate:dispatch-convoy-production'),
  {
    id: 'explore_trip_builder',
    ownerDomain: 'explore',
    userFacingLabel: 'Trip Builder',
    maturity: 'beta',
    defaultEnabled: true,
    environment: {
      allowed: ALL_ENVIRONMENTS,
      enableFlag: 'EXPO_PUBLIC_ECS_EXPLORE_TRIP_BUILDER',
    },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: ['explore_tab'],
    productionEvidence: {
      requirements: ['explore_trip_builder_owner_acceptance'],
      requiredToEnable: false,
    },
    offlineSupport: 'full',
    degradedBehavior: LOCAL_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_EXPLORE_TRIP_BUILDER',
    unavailableCopy: 'Trip Builder is unavailable for this rollout.',
    relatedReadinessGate: 'gate:explore-trail-packs-production',
    routePolicy: {
      paths: ['/explore-trip-builder'],
      unavailableBehavior: 'block',
      safeReturnRoute: '/discover',
    },
  },
  {
    id: 'explore_offline_prep',
    ownerDomain: 'explore',
    userFacingLabel: 'Offline Prep Pack',
    maturity: 'beta',
    defaultEnabled: true,
    environment: {
      allowed: ALL_ENVIRONMENTS,
      enableFlag: 'EXPO_PUBLIC_ECS_EXPLORE_OFFLINE_PREP_PACK',
    },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: ['explore_tab'],
    productionEvidence: {
      requirements: ['offline_navigation_owner_acceptance'],
      requiredToEnable: false,
    },
    offlineSupport: 'full',
    degradedBehavior: LOCAL_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_EXPLORE_OFFLINE_PREP',
    unavailableCopy: 'Offline Prep Pack is unavailable for this rollout.',
    relatedReadinessGate: 'gate:offline-navigation-production',
    routePolicy: {
      paths: ['/explore-offline-prep-pack'],
      unavailableBehavior: 'block',
      safeReturnRoute: '/discover',
    },
  },
  {
    id: 'convoy_command',
    ownerDomain: 'dispatch',
    userFacingLabel: 'Convoy Command',
    maturity: 'restricted_field_test',
    defaultEnabled: true,
    environment: { allowed: ALL_ENVIRONMENTS },
    accountRequirement: 'authenticated',
    backendDependencies: [{ id: 'supabase', mode: 'degrade' }],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: ['dispatch_tab'],
    productionEvidence: {
      requirements: ['dispatch_convoy_production_owner_acceptance'],
      requiredToEnable: false,
    },
    offlineSupport: 'degraded',
    degradedBehavior: {
      allowed: true,
      copy: 'Convoy Command is in explicit local/solo mode while realtime services are unavailable.',
    },
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_CONVOY_COMMAND',
    unavailableCopy: 'Convoy Command is unavailable for this rollout.',
    relatedReadinessGate: 'gate:dispatch-convoy-production',
    routePolicy: {
      paths: ['/convoy-command'],
      unavailableBehavior: 'block',
      safeReturnRoute: '/alert',
    },
  },
  {
    id: 'dispatch_mission_command',
    ownerDomain: 'dispatch',
    userFacingLabel: 'Mission Command',
    maturity: 'internal',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_MISSION_COMMAND',
      developmentDefaultEnabled: true,
    },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: ['dispatch_tab'],
    productionEvidence: {
      requirements: ['dispatch_mission_command_owner_acceptance'],
      requiredToEnable: false,
    },
    offlineSupport: 'full',
    degradedBehavior: LOCAL_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND',
    unavailableCopy: 'Mission Command is unavailable outside the approved internal rollout.',
    relatedReadinessGate: null,
  },
  {
    id: 'dispatch_incident_room',
    ownerDomain: 'dispatch',
    userFacingLabel: 'Incident Room',
    maturity: 'internal',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_INCIDENT_ROOM',
    },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: ['dispatch_mission_command'],
    productionEvidence: {
      requirements: ['field_incident_recovery', 'dispatch_mission_command_owner_acceptance'],
      requiredToEnable: false,
    },
    offlineSupport: 'full',
    degradedBehavior: LOCAL_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_INCIDENT_ROOM',
    unavailableCopy: 'Incident Room is unavailable outside the approved Mission Command rollout.',
    relatedReadinessGate: 'gate:incident-recovery-production',
  },
  {
    id: 'dispatch_canonical_backend',
    ownerDomain: 'dispatch',
    userFacingLabel: 'Canonical Dispatch Persistence',
    maturity: 'restricted_field_test',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_DISPATCH_CANONICAL_BACKEND',
    },
    accountRequirement: 'authenticated',
    backendDependencies: [{ id: 'supabase', mode: 'block' }],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: ['convoy_command'],
    privacyApproval: {
      key: 'dispatch_canonical_backend_privacy',
      requiredToEnable: true,
    },
    productionEvidence: {
      requirements: [
        'dispatch_canonical_rls_evidence',
        'dispatch_canonical_multiclient_evidence',
        'dispatch_canonical_device_evidence',
        'dispatch_canonical_owner_acceptance',
      ],
      requiredToEnable: true,
    },
    offlineSupport: 'full',
    degradedBehavior: {
      allowed: true,
      copy: 'Canonical Dispatch sync is unavailable. ECS remains in explicit local-first mode.',
    },
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_DISPATCH_CANONICAL_BACKEND',
    unavailableCopy: 'Canonical Dispatch sync requires an approved internal rollout, scoped convoy membership, and backend readiness.',
    relatedReadinessGate: 'gate:dispatch-convoy-production',
  },
  {
    id: 'dispatch_mission_command_backend',
    ownerDomain: 'dispatch',
    userFacingLabel: 'Mission Command Canonical Persistence',
    maturity: 'restricted_field_test',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_MISSION_COMMAND_BACKEND',
    },
    accountRequirement: 'authenticated',
    backendDependencies: [{ id: 'supabase', mode: 'block' }],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: ['dispatch_mission_command', 'dispatch_canonical_backend'],
    privacyApproval: {
      key: 'dispatch_canonical_backend_privacy',
      requiredToEnable: true,
    },
    productionEvidence: {
      requirements: [
        'dispatch_canonical_rls_evidence',
        'dispatch_canonical_multiclient_evidence',
        'dispatch_canonical_device_evidence',
        'dispatch_canonical_owner_acceptance',
      ],
      requiredToEnable: true,
    },
    offlineSupport: 'full',
    degradedBehavior: LOCAL_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND_BACKEND',
    unavailableCopy: 'Mission Command backend shadowing requires approved privacy, RLS, and two-client evidence.',
    relatedReadinessGate: 'gate:dispatch-convoy-production',
  },
  {
    id: 'dispatch_team_position_sharing',
    ownerDomain: 'dispatch',
    userFacingLabel: 'Team Position Sharing',
    maturity: 'restricted_field_test',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_TEAM_POSITION_SHARING',
    },
    accountRequirement: 'authenticated',
    backendDependencies: [{ id: 'supabase', mode: 'block' }],
    providerDependencies: [],
    nativeDependencies: [{ id: 'gps', mode: 'block' }],
    permissionDependencies: [{ id: 'location', mode: 'block' }],
    featureDependencies: ['convoy_command'],
    privacyApproval: {
      key: 'dispatch_position_sharing_privacy',
      requiredToEnable: true,
    },
    productionEvidence: {
      requirements: ['dispatch_multiclient_device_evidence', 'dispatch_position_sharing_owner_acceptance'],
      requiredToEnable: true,
    },
    offlineSupport: 'none',
    degradedBehavior: NO_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_TEAM_POSITION_SHARING',
    unavailableCopy: 'Team position sharing requires an approved field-test rollout, location permission, and realtime service.',
    relatedReadinessGate: 'gate:dispatch-convoy-production',
  },
  {
    id: 'dispatch_smart_rally',
    ownerDomain: 'dispatch',
    userFacingLabel: 'Smart Rally',
    maturity: 'restricted_field_test',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_SMART_RALLY',
    },
    accountRequirement: 'authenticated',
    backendDependencies: [{ id: 'supabase', mode: 'block' }],
    providerDependencies: [],
    nativeDependencies: [{ id: 'gps', mode: 'block' }],
    permissionDependencies: [{ id: 'location', mode: 'block' }],
    featureDependencies: ['dispatch_mission_command'],
    privacyApproval: {
      key: 'dispatch_position_sharing_privacy',
      requiredToEnable: true,
    },
    productionEvidence: {
      requirements: [
        'dispatch_multiclient_device_evidence',
        'dispatch_position_sharing_owner_acceptance',
      ],
      requiredToEnable: true,
    },
    offlineSupport: 'degraded',
    degradedBehavior: {
      allowed: true,
      copy: 'Smart Rally can inspect local route and candidate context offline, but it will not propose from unavailable or stale member positions.',
    },
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_SMART_RALLY',
    unavailableCopy: 'Smart Rally requires the approved Mission Command, position-sharing privacy, and two-client field-test rollout.',
    relatedReadinessGate: 'gate:dispatch-convoy-production',
  },
  sensitiveInternalFeature({
    id: 'dispatch_external_integrations',
    ownerDomain: 'dispatch',
    label: 'External Dispatch Integrations',
    flag: 'EXPO_PUBLIC_ECS_DISPATCH_EXTERNAL_INTEGRATIONS',
    privacyKey: 'dispatch_external_integration_privacy_approval',
    evidence: ['dispatch_external_integration_field_evidence', 'dispatch_external_integration_owner_acceptance'],
    gate: 'gate:dispatch-convoy-production',
  }),
  {
    id: 'established_campgrounds',
    ownerDomain: 'campops',
    userFacingLabel: 'Established Campgrounds',
    maturity: 'beta',
    defaultEnabled: false,
    environment: {
      allowed: ALL_ENVIRONMENTS,
      enableFlag: 'EXPO_PUBLIC_ECS_ESTABLISHED_CAMPSITES_LAYER',
      developmentDefaultEnabled: true,
    },
    accountRequirement: 'none',
    backendDependencies: [{ id: 'supabase', mode: 'degrade' }],
    providerDependencies: [{ id: 'established_campgrounds', mode: 'degrade' }],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: ['navigate_tab'],
    productionEvidence: {
      requirements: ['established_campgrounds_owner_acceptance'],
      requiredToEnable: false,
    },
    offlineSupport: 'degraded',
    degradedBehavior: {
      allowed: true,
      copy: 'Live campground lookup is unavailable. ECS may show a labeled offline cache.',
    },
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_ESTABLISHED_CAMPGROUNDS',
    unavailableCopy: 'Established campground data is unavailable for this rollout.',
    relatedReadinessGate: 'gate:established-campgrounds-production',
  },
  {
    id: 'dispersed_camping',
    ownerDomain: 'campops',
    userFacingLabel: 'Dispersed Camping',
    maturity: 'restricted_field_test',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_DISPERSED_CAMPING_LAYER',
      developmentDefaultEnabled: true,
    },
    accountRequirement: 'none',
    backendDependencies: [{ id: 'supabase', mode: 'degrade' }],
    providerDependencies: [{ id: 'dispersed_camping', mode: 'degrade' }],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: ['navigate_tab'],
    productionEvidence: {
      requirements: ['dispersed_camping_provider_evidence', 'dispersed_camping_owner_acceptance'],
      requiredToEnable: false,
    },
    offlineSupport: 'degraded',
    degradedBehavior: LOCAL_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_DISPERSED_CAMPING',
    unavailableCopy: 'Dispersed camping reference data is unavailable for this rollout.',
    relatedReadinessGate: 'gate:campops-live-readiness',
  },
  {
    id: 'weather_route_intelligence',
    ownerDomain: 'weather',
    userFacingLabel: 'Weather And Route Hazard Intelligence',
    maturity: 'beta',
    defaultEnabled: true,
    environment: { allowed: ALL_ENVIRONMENTS },
    accountRequirement: 'none',
    backendDependencies: [{ id: 'supabase', mode: 'degrade' }],
    providerDependencies: [{ id: 'weather', mode: 'degrade' }],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: [],
    productionEvidence: {
      requirements: ['weather_provider_evidence', 'weather_android_evidence', 'weather_owner_acceptance'],
      requiredToEnable: false,
    },
    offlineSupport: 'degraded',
    degradedBehavior: {
      allowed: true,
      copy: 'Live weather is unavailable. ECS may show explicitly cached or unavailable weather state.',
    },
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_WEATHER_INTELLIGENCE',
    unavailableCopy: 'Weather intelligence is unavailable for this rollout.',
    relatedReadinessGate: 'gate:weather-production',
  },
  {
    id: 'bluetooth_obd_connections',
    ownerDomain: 'devices',
    userFacingLabel: 'Bluetooth, Power, And OBD2 Connections',
    maturity: 'restricted_field_test',
    defaultEnabled: true,
    environment: { allowed: ALL_ENVIRONMENTS },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [{ id: 'bluetooth', mode: 'degrade' }],
    permissionDependencies: [{ id: 'bluetooth', mode: 'degrade' }],
    featureDependencies: [],
    productionEvidence: {
      requirements: ['bluetooth_power_obd_hardware_evidence', 'bluetooth_power_obd_owner_acceptance'],
      requiredToEnable: false,
    },
    offlineSupport: 'full',
    degradedBehavior: {
      allowed: true,
      copy: 'Native Bluetooth is unavailable. Manual device and vehicle state remain available.',
    },
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_BLUETOOTH_OBD',
    unavailableCopy: 'Device Connections is unavailable for this rollout.',
    relatedReadinessGate: 'gate:bluetooth-power-obd2-production',
    routePolicy: {
      paths: ['/power/blu', '/obd-setup', '/vehicle-telemetry-settings'],
      unavailableBehavior: 'degraded_read_only',
      safeReturnRoute: '/fleet',
    },
  },
  {
    id: 'automotive_vehicle_display',
    ownerDomain: 'platform',
    userFacingLabel: 'Reduced Vehicle Display',
    maturity: 'restricted_field_test',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_AUTOMOTIVE_VEHICLE_DISPLAY',
      enableFlagRequired: true,
    },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [{ id: 'automotive_surface', mode: 'block' }],
    permissionDependencies: [],
    featureDependencies: ['fleet_tab'],
    productionEvidence: {
      requirements: [
        'automotive_reduced_ui_evidence',
        'automotive_driver_distraction_review',
        'automotive_owner_acceptance',
      ],
      requiredToEnable: true,
    },
    offlineSupport: 'full',
    degradedBehavior: NO_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_AUTOMOTIVE_VEHICLE_DISPLAY',
    unavailableCopy: 'Vehicle Display requires an approved internal rollout, a supported native automotive surface, and device evidence.',
    relatedReadinessGate: 'gate:automotive-production',
    routePolicy: {
      paths: ['/vehicle-display'],
      unavailableBehavior: 'block',
      safeReturnRoute: '/fleet',
    },
  },
  {
    id: 'android_auto_bridge',
    ownerDomain: 'platform',
    userFacingLabel: 'Android Auto Bridge',
    maturity: 'restricted_field_test',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_ANDROID_AUTO_BRIDGE',
      enableFlagRequired: true,
    },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [{ id: 'android_auto', mode: 'block' }],
    permissionDependencies: [],
    featureDependencies: ['automotive_vehicle_display'],
    productionEvidence: {
      requirements: [
        'android_auto_head_unit_evidence',
        'automotive_driver_distraction_review',
        'automotive_owner_acceptance',
      ],
      requiredToEnable: true,
    },
    offlineSupport: 'full',
    degradedBehavior: NO_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_ANDROID_AUTO_BRIDGE',
    unavailableCopy: 'Android Auto remains off until native plugin and real head-unit evidence are approved.',
    relatedReadinessGate: 'gate:automotive-production',
  },
  {
    id: 'carplay_bridge',
    ownerDomain: 'platform',
    userFacingLabel: 'CarPlay Bridge',
    maturity: 'restricted_field_test',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_CARPLAY_BRIDGE',
      enableFlagRequired: true,
    },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [{ id: 'carplay', mode: 'block' }],
    permissionDependencies: [],
    featureDependencies: ['automotive_vehicle_display'],
    productionEvidence: {
      requirements: [
        'carplay_head_unit_evidence',
        'automotive_driver_distraction_review',
        'automotive_owner_acceptance',
      ],
      requiredToEnable: true,
    },
    offlineSupport: 'full',
    degradedBehavior: NO_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_CARPLAY_BRIDGE',
    unavailableCopy: 'CarPlay remains off until native plugin and real head-unit evidence are approved.',
    relatedReadinessGate: 'gate:automotive-production',
  },
  sensitiveInternalFeature({
    id: 'ai_assist',
    ownerDomain: 'platform',
    label: 'AI Assist',
    flag: 'EXPO_PUBLIC_ECS_AI_ASSIST',
    privacyKey: 'ai_assist_model_output_approval',
    evidence: ['ai_assist_real_model_execution_evidence'],
    gate: 'gate:ai-assist',
  }),
  sensitiveInternalFeature({
    id: 'campops_telemetry',
    ownerDomain: 'campops',
    label: 'CampOps Publishing Telemetry',
    flag: 'EXPO_PUBLIC_ECS_CAMPOPS_TELEMETRY',
    privacyKey: 'campops_telemetry_sink_privacy_approval',
    evidence: ['campops_telemetry_sink_evidence'],
    gate: 'gate:campops-publishing-telemetry',
  }),
  sensitiveInternalFeature({
    id: 'community_publishing',
    ownerDomain: 'campops',
    label: 'Community Publishing',
    flag: 'EXPO_PUBLIC_ECS_COMMUNITY_PUBLISHING',
    privacyKey: 'community_publishing_privacy_moderation_approval',
    evidence: ['community_publishing_moderation_evidence'],
    gate: 'gate:campops-publishing-telemetry',
  }),
  {
    id: 'campops_manual_area_review',
    ownerDomain: 'campops',
    userFacingLabel: 'CampOps Manual Area Review',
    maturity: 'internal',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: 'EXPO_PUBLIC_ECS_CAMPOPS_MANUAL_AREA_REVIEW',
    },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: [],
    productionEvidence: {
      requirements: ['campops_manual_area_review_owner_acceptance'],
      requiredToEnable: false,
    },
    offlineSupport: 'full',
    degradedBehavior: LOCAL_DEGRADED_BEHAVIOR,
    killSwitch: 'EXPO_PUBLIC_ECS_KILL_CAMPOPS_MANUAL_AREA_REVIEW',
    unavailableCopy: 'Manual area review is unavailable outside the internal CampOps rollout.',
    relatedReadinessGate: 'gate:campops-live-readiness',
  },
  debugFeature('developer_diagnostics', 'Developer Diagnostics', []),
  debugFeature('developer_qa_surfaces', 'Development QA Surfaces', [
    '/dev/attitude-command-widget-preview',
    '/dev/attitude-vehicle-stage-preview',
    '/dev/campops-visual-qa',
    '/dev/convoy-identity-qa',
    '/dev/convoy-participant-qa',
    '/dev/hardware-telemetry-qa',
    '/dev/provider-outage-qa',
    '/dev/route-overlay-qa',
    '/dev/trip-confidence-qa',
  ]),
  debugFeature('convoy_rive_qa', 'Convoy Rive QA', [] , 'EXPO_PUBLIC_ECS_CONVOY_RIVE_QA'),
];

const FEATURE_BY_ID = new Map<ECSFeatureId, ECSFeatureDefinition>(
  ECS_FEATURE_REGISTRY.map((feature) => [feature.id, feature]),
);

export function getECSFeatureDefinition(id: ECSFeatureId): ECSFeatureDefinition | null {
  return FEATURE_BY_ID.get(id) ?? null;
}

export function validateECSFeatureRegistry(
  registry: readonly ECSFeatureDefinition[] = ECS_FEATURE_REGISTRY,
): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const routePaths = new Set<string>();
  for (const feature of registry) {
    if (!feature.id || !ECS_FEATURE_IDS.includes(feature.id)) errors.push(`invalid_feature_id:${feature.id || 'missing'}`);
    if (ids.has(feature.id)) errors.push(`duplicate_feature_id:${feature.id}`);
    ids.add(feature.id);
    if (!feature.ownerDomain) errors.push(`missing_owner_domain:${feature.id}`);
    if (!feature.userFacingLabel.trim()) errors.push(`missing_label:${feature.id}`);
    if (!feature.killSwitch.trim()) errors.push(`missing_kill_switch:${feature.id}`);
    if (!feature.unavailableCopy.trim()) errors.push(`missing_unavailable_copy:${feature.id}`);
    if (feature.environment.allowed.length === 0) errors.push(`missing_environment_condition:${feature.id}`);
    if (feature.offlineSupport === 'degraded' && !feature.degradedBehavior.allowed) {
      errors.push(`missing_degraded_behavior:${feature.id}`);
    }
    for (const dependency of feature.featureDependencies) {
      if (!ECS_FEATURE_IDS.includes(dependency)) errors.push(`unknown_feature_dependency:${feature.id}:${dependency}`);
      if (dependency === feature.id) errors.push(`self_feature_dependency:${feature.id}`);
    }
    for (const path of feature.routePolicy?.paths ?? []) {
      const normalized = normalizeFeatureRoutePath(path);
      if (routePaths.has(normalized)) errors.push(`duplicate_feature_route:${normalized}`);
      routePaths.add(normalized);
    }
  }
  return unique(errors);
}

export function createRuntimeFeatureVisibilityContext(
  overrides: Partial<ECSFeatureVisibilityContext> = {},
): ECSFeatureVisibilityContext {
  const env = overrides.env ?? getRuntimeEnvironmentVariables();
  return {
    environment: overrides.environment ?? detectECSDeploymentEnvironment(env),
    env,
    online: overrides.online ?? true,
    authenticated: overrides.authenticated ?? false,
    hasFullAccess: overrides.hasFullAccess ?? false,
    isAdmin: overrides.isAdmin ?? false,
    backends: overrides.backends ?? {},
    providers: overrides.providers ?? {},
    hardware: overrides.hardware ?? {},
    permissions: overrides.permissions ?? {},
    privacyApprovals: overrides.privacyApprovals ?? new Set<string>(),
    productionEvidence: overrides.productionEvidence ?? new Set<string>(),
  };
}

export function resolveECSFeatureVisibility(
  id: ECSFeatureId,
  context: ECSFeatureVisibilityContext,
): ECSFeatureVisibilityDecision {
  return resolveFeatureVisibilityInternal(id, context, new Set<ECSFeatureId>());
}

export function resolveECSFeatureRouteAccess(
  path: string | null | undefined,
  context: ECSFeatureVisibilityContext,
  featureRequirement?: ECSFeatureId | null,
): ECSFeatureRouteAccess {
  const normalized = normalizeFeatureRoutePath(path);
  const feature = featureRequirement
    ? getECSFeatureDefinition(featureRequirement)
    : ECS_FEATURE_REGISTRY.find((candidate) => (
        candidate.routePolicy?.paths.some((route) => routeMatches(normalized, route))
      )) ?? null;
  if (!feature?.routePolicy) {
    return {
      matched: false,
      featureId: null,
      allowed: true,
      readOnly: false,
      safeReturnRoute: null,
      decision: null,
    };
  }
  const decision = resolveECSFeatureVisibility(feature.id, context);
  const readOnly = decision.availability === 'degraded' &&
    feature.routePolicy.unavailableBehavior === 'degraded_read_only';
  return {
    matched: true,
    featureId: feature.id,
    allowed: decision.availability !== 'unavailable' || readOnly,
    readOnly,
    safeReturnRoute: feature.routePolicy.safeReturnRoute,
    decision,
  };
}

export function buildECSCapabilityMatrix(context: ECSFeatureVisibilityContext) {
  return ECS_FEATURE_REGISTRY.map((feature) => {
    const decision = resolveECSFeatureVisibility(feature.id, context);
    return {
      featureId: feature.id,
      ownerDomain: feature.ownerDomain,
      label: feature.userFacingLabel,
      maturity: feature.maturity,
      defaultEnabled: feature.defaultEnabled,
      availability: decision.availability,
      visible: decision.visible,
      reason: decision.reason,
      explanation: decision.explanation,
      productionApproved: decision.productionApproved,
      productionBlockers: decision.productionBlockers,
      offlineSupport: feature.offlineSupport,
      degradedBehavior: feature.degradedBehavior,
      accountRequirement: feature.accountRequirement,
      backendDependencies: feature.backendDependencies,
      providerDependencies: feature.providerDependencies,
      nativeDependencies: feature.nativeDependencies,
      permissionDependencies: feature.permissionDependencies,
      privacyApprovalRequired: Boolean(feature.privacyApproval),
      productionEvidenceRequirements: feature.productionEvidence.requirements,
      killSwitch: feature.killSwitch,
      enableFlag: feature.environment.enableFlag ?? null,
      unavailableCopy: feature.unavailableCopy,
      relatedReadinessGate: feature.relatedReadinessGate,
      routes: feature.routePolicy?.paths ?? [],
    };
  });
}

export function buildECSProductionVisibilityReport(input: {
  context: ECSFeatureVisibilityContext;
  generatedAt?: string;
}) {
  const validationErrors = validateECSFeatureRegistry();
  const features = buildECSCapabilityMatrix(input.context);
  return {
    schemaVersion: 'ecs.production-visibility.v1',
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    environment: input.context.environment ?? 'unknown',
    registryValid: validationErrors.length === 0,
    validationErrors,
    summary: {
      total: features.length,
      available: features.filter((feature) => feature.availability === 'available').length,
      degraded: features.filter((feature) => feature.availability === 'degraded').length,
      unavailable: features.filter((feature) => feature.availability === 'unavailable').length,
      productionApproved: features.filter((feature) => feature.productionApproved).length,
      productionBlocked: features.filter((feature) => !feature.productionApproved).length,
    },
    features,
  };
}

export function isECSDevelopmentDiagnosticEnabled(
  flagName: string,
  globalOverride = false,
  context: ECSFeatureVisibilityContext = createRuntimeFeatureVisibilityContext(),
): boolean {
  if (!resolveECSFeatureVisibility('developer_diagnostics', context).visible) return false;
  if (globalOverride) return true;
  return parseBooleanFlag(context.env?.[flagName]) === true;
}

function resolveFeatureVisibilityInternal(
  id: ECSFeatureId,
  context: ECSFeatureVisibilityContext,
  resolving: Set<ECSFeatureId>,
): ECSFeatureVisibilityDecision {
  const feature = getECSFeatureDefinition(id);
  if (!feature) return unavailableDecision(id, null, 'configuration_missing', 'Feature configuration is missing.');
  if (!context || !context.environment || !context.env) {
    return unavailableDecision(id, feature, 'configuration_missing', 'Runtime feature configuration is unavailable.');
  }
  if (validateECSFeatureRegistry().length > 0) {
    return unavailableDecision(id, feature, 'configuration_malformed', 'Feature registry validation failed.');
  }

  const killSwitch = parseBooleanFlag(context.env[feature.killSwitch]);
  if (killSwitch === 'malformed') {
    return unavailableDecision(id, feature, 'configuration_malformed', 'The feature kill-switch configuration is malformed.');
  }
  if (killSwitch === true) {
    return unavailableDecision(id, feature, 'kill_switch', `${feature.userFacingLabel} is disabled by its kill switch.`);
  }

  if (feature.environment.debugOnly && context.environment === 'production') {
    return unavailableDecision(id, feature, 'debug_build_only', 'Development controls are inaccessible in production builds.');
  }
  if (!feature.environment.allowed.includes(context.environment)) {
    return unavailableDecision(id, feature, 'environment_blocked', `${feature.userFacingLabel} is unavailable in this build environment.`);
  }

  const enableValue = feature.environment.enableFlag
    ? parseBooleanFlag(context.env[feature.environment.enableFlag])
    : null;
  if (enableValue === 'malformed') {
    return unavailableDecision(id, feature, 'configuration_malformed', 'The feature rollout configuration is malformed.');
  }
  if (feature.environment.enableFlagRequired && enableValue == null) {
    return unavailableDecision(id, feature, 'configuration_missing', 'Required rollout configuration is missing.');
  }
  const defaultEnabled = feature.environment.developmentDefaultEnabled &&
    (context.environment === 'development' || context.environment === 'test')
      ? true
      : feature.defaultEnabled;
  const enabled = typeof enableValue === 'boolean' ? enableValue : defaultEnabled;
  const forcedEnable = enableValue === true && feature.defaultEnabled === false;
  if (!enabled) {
    return unavailableDecision(id, feature, 'rollout_disabled', feature.unavailableCopy, forcedEnable);
  }

  const accountBlock = resolveAccountBlock(feature, context);
  if (accountBlock) return unavailableDecision(id, feature, accountBlock.reason, accountBlock.explanation, forcedEnable);

  if (resolving.has(id)) {
    return unavailableDecision(id, feature, 'configuration_malformed', 'A circular feature dependency was detected.', forcedEnable);
  }
  const dependencyStack = new Set(resolving);
  dependencyStack.add(id);
  for (const dependencyId of feature.featureDependencies) {
    const dependency = resolveFeatureVisibilityInternal(dependencyId, context, dependencyStack);
    if (dependency.availability === 'unavailable') {
      return unavailableDecision(
        id,
        feature,
        'feature_dependency_unavailable',
        `${feature.userFacingLabel} depends on ${getECSFeatureDefinition(dependencyId)?.userFacingLabel ?? dependencyId}.`,
        forcedEnable,
      );
    }
  }

  if (!context.online && feature.offlineSupport === 'none') {
    return unavailableDecision(id, feature, 'offline_unavailable', `${feature.userFacingLabel} requires a network connection.`, forcedEnable);
  }

  const capabilityDecision = resolveCapabilities(feature, context, forcedEnable);
  if (capabilityDecision) return capabilityDecision;

  if (feature.privacyApproval?.requiredToEnable && !context.privacyApprovals.has(feature.privacyApproval.key)) {
    return unavailableDecision(
      id,
      feature,
      'privacy_approval_required',
      `${feature.userFacingLabel} requires privacy approval before enablement.`,
      forcedEnable,
    );
  }
  const missingEnableEvidence = feature.productionEvidence.requiredToEnable
    ? feature.productionEvidence.requirements.filter((requirement) => !context.productionEvidence.has(requirement))
    : [];
  if (missingEnableEvidence.length > 0) {
    return unavailableDecision(
      id,
      feature,
      'production_evidence_required',
      `${feature.userFacingLabel} requires approved production evidence before enablement.`,
      forcedEnable,
    );
  }

  const productionBlockers = productionBlockersFor(feature, context);
  const shouldDegradeOffline = !context.online && feature.offlineSupport === 'degraded';
  return {
    featureId: id,
    availability: shouldDegradeOffline ? 'degraded' : 'available',
    enabled: true,
    visible: true,
    reason: 'enabled',
    explanation: shouldDegradeOffline ? feature.degradedBehavior.copy : `${feature.userFacingLabel} is enabled for this rollout.`,
    unavailableCopy: feature.unavailableCopy,
    maturity: feature.maturity,
    productionApproved: feature.maturity === 'production' && productionBlockers.length === 0,
    productionBlockers,
    forcedEnable,
  };
}

function resolveCapabilities(
  feature: ECSFeatureDefinition,
  context: ECSFeatureVisibilityContext,
  forcedEnable: boolean,
): ECSFeatureVisibilityDecision | null {
  const groups: Array<{
    dependencies: readonly ECSFeatureDependency[];
    states: Record<string, ECSCapabilityState | undefined>;
    reason: ECSFeatureDecisionReason;
    noun: string;
  }> = [
    { dependencies: feature.backendDependencies, states: context.backends, reason: 'backend_unavailable', noun: 'backend' },
    { dependencies: feature.providerDependencies, states: context.providers, reason: 'provider_unavailable', noun: 'provider' },
    { dependencies: feature.nativeDependencies, states: context.hardware, reason: 'hardware_unavailable', noun: 'hardware' },
    { dependencies: feature.permissionDependencies, states: context.permissions, reason: 'permission_required', noun: 'permission' },
  ];
  for (const group of groups) {
    for (const dependency of group.dependencies) {
      if (group.states[dependency.id] === 'available') continue;
      if (dependency.mode === 'degrade' && feature.degradedBehavior.allowed) {
        return degradedDecision(feature, group.reason, `${feature.degradedBehavior.copy} Missing ${group.noun}: ${dependency.id}.`, forcedEnable, context);
      }
      return unavailableDecision(
        feature.id,
        feature,
        group.reason,
        `${feature.userFacingLabel} requires ${group.noun} capability: ${dependency.id}.`,
        forcedEnable,
      );
    }
  }
  return null;
}

function resolveAccountBlock(
  feature: ECSFeatureDefinition,
  context: ECSFeatureVisibilityContext,
): { reason: ECSFeatureDecisionReason; explanation: string } | null {
  if (feature.accountRequirement === 'none') return null;
  if (!context.authenticated) {
    return { reason: 'authentication_required', explanation: `${feature.userFacingLabel} requires a signed-in ECS account.` };
  }
  if (feature.accountRequirement === 'full_access' && !context.hasFullAccess) {
    return { reason: 'subscription_required', explanation: `${feature.userFacingLabel} requires active ECS access.` };
  }
  if (feature.accountRequirement === 'admin' && !context.isAdmin) {
    return { reason: 'admin_required', explanation: `${feature.userFacingLabel} requires an ECS administrator account.` };
  }
  return null;
}

function productionBlockersFor(
  feature: ECSFeatureDefinition,
  context: ECSFeatureVisibilityContext,
): string[] {
  const blockers = feature.productionEvidence.requirements
    .filter((requirement) => !context.productionEvidence.has(requirement))
    .map((requirement) => `missing_evidence:${requirement}`);
  if (feature.privacyApproval && !context.privacyApprovals.has(feature.privacyApproval.key)) {
    blockers.push(`missing_privacy_approval:${feature.privacyApproval.key}`);
  }
  if (feature.maturity !== 'production') blockers.push(`maturity:${feature.maturity}`);
  return unique(blockers);
}

function unavailableDecision(
  id: ECSFeatureId,
  feature: ECSFeatureDefinition | null,
  reason: ECSFeatureDecisionReason,
  explanation: string,
  forcedEnable = false,
): ECSFeatureVisibilityDecision {
  const maturity = feature?.maturity ?? 'development';
  return {
    featureId: id,
    availability: 'unavailable',
    enabled: false,
    visible: false,
    reason,
    explanation,
    unavailableCopy: feature?.unavailableCopy ?? 'This ECS feature is unavailable.',
    maturity,
    productionApproved: false,
    productionBlockers: feature ? [`availability:${reason}`, ...productionBlockersFor(feature, emptyApprovalContext())] : ['configuration_missing'],
    forcedEnable,
  };
}

function degradedDecision(
  feature: ECSFeatureDefinition,
  reason: ECSFeatureDecisionReason,
  explanation: string,
  forcedEnable: boolean,
  context: ECSFeatureVisibilityContext,
): ECSFeatureVisibilityDecision {
  return {
    featureId: feature.id,
    availability: 'degraded',
    enabled: true,
    visible: true,
    reason,
    explanation,
    unavailableCopy: feature.unavailableCopy,
    maturity: feature.maturity,
    productionApproved: false,
    productionBlockers: productionBlockersFor(feature, context),
    forcedEnable,
  };
}

function emptyApprovalContext(): ECSFeatureVisibilityContext {
  return {
    environment: 'production',
    env: {},
    online: true,
    authenticated: false,
    hasFullAccess: false,
    isAdmin: false,
    backends: {},
    providers: {},
    hardware: {},
    permissions: {},
    privacyApprovals: new Set<string>(),
    productionEvidence: new Set<string>(),
  };
}

function primaryTabFeature(
  id: Extract<ECSFeatureId, 'fleet_tab' | 'navigate_tab' | 'dashboard_tab' | 'explore_tab' | 'dispatch_tab'>,
  ownerDomain: Extract<ECSFeatureOwnerDomain, 'fleet' | 'navigate' | 'dashboard' | 'explore' | 'dispatch'>,
  label: string,
  maturity: ECSFeatureMaturity,
  route: string,
  gate: string,
): ECSFeatureDefinition {
  const evidence = maturity === 'production' ? [`${ownerDomain}_production_gate`] : [`${ownerDomain}_production_owner_acceptance`];
  return {
    id,
    ownerDomain,
    userFacingLabel: label,
    maturity,
    defaultEnabled: true,
    environment: { allowed: ALL_ENVIRONMENTS },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: [],
    productionEvidence: { requirements: evidence, requiredToEnable: false },
    offlineSupport: 'full',
    degradedBehavior: LOCAL_DEGRADED_BEHAVIOR,
    killSwitch: `EXPO_PUBLIC_ECS_KILL_${ownerDomain.toUpperCase()}_TAB`,
    unavailableCopy: `${label} is unavailable for this rollout.`,
    relatedReadinessGate: gate,
    routePolicy: {
      paths: [route],
      unavailableBehavior: 'block',
      safeReturnRoute: route === '/dashboard' ? '/fleet' : '/dashboard',
    },
  };
}

function sensitiveInternalFeature(input: {
  id: Extract<ECSFeatureId, 'ai_assist' | 'campops_telemetry' | 'community_publishing' | 'dispatch_external_integrations'>;
  ownerDomain: ECSFeatureOwnerDomain;
  label: string;
  flag: string;
  privacyKey: string;
  evidence: string[];
  gate: string;
}): ECSFeatureDefinition {
  return {
    id: input.id,
    ownerDomain: input.ownerDomain,
    userFacingLabel: input.label,
    maturity: 'internal',
    defaultEnabled: false,
    environment: {
      allowed: ['development', 'test', 'internal'],
      enableFlag: input.flag,
    },
    accountRequirement: 'admin',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: [],
    privacyApproval: { key: input.privacyKey, requiredToEnable: true },
    productionEvidence: { requirements: input.evidence, requiredToEnable: true },
    offlineSupport: 'none',
    degradedBehavior: NO_DEGRADED_BEHAVIOR,
    killSwitch: `EXPO_PUBLIC_ECS_KILL_${input.id.toUpperCase()}`,
    unavailableCopy: `${input.label} is disabled until its approval gate passes.`,
    relatedReadinessGate: input.gate,
  };
}

function debugFeature(
  id: Extract<ECSFeatureId, 'developer_diagnostics' | 'developer_qa_surfaces' | 'convoy_rive_qa'>,
  label: string,
  paths: string[],
  flag?: string,
): ECSFeatureDefinition {
  return {
    id,
    ownerDomain: 'platform',
    userFacingLabel: label,
    maturity: 'development',
    defaultEnabled: flag ? false : true,
    environment: {
      allowed: DEVELOPMENT_ENVIRONMENTS,
      enableFlag: flag,
      debugOnly: true,
    },
    accountRequirement: 'none',
    backendDependencies: [],
    providerDependencies: [],
    nativeDependencies: [],
    permissionDependencies: [],
    featureDependencies: [],
    productionEvidence: { requirements: [], requiredToEnable: false },
    offlineSupport: 'full',
    degradedBehavior: LOCAL_DEGRADED_BEHAVIOR,
    killSwitch: `EXPO_PUBLIC_ECS_KILL_${id.toUpperCase()}`,
    unavailableCopy: `${label} is available only in development builds.`,
    relatedReadinessGate: null,
    routePolicy: paths.length > 0
      ? {
          paths,
          unavailableBehavior: 'block',
          safeReturnRoute: '/dashboard',
        }
      : undefined,
  };
}

function detectECSDeploymentEnvironment(
  env: Record<string, string | undefined> | null,
): ECSDeploymentEnvironment | null {
  const declared = String(env?.EXPO_PUBLIC_APP_ENV ?? env?.ECS_APP_ENV ?? '').trim().toLowerCase();
  if (declared === 'development' || declared === 'dev') return 'development';
  if (declared === 'test') return 'test';
  if (declared === 'internal' || declared === 'fieldtest' || declared === 'field_test') return 'internal';
  if (declared === 'production' || declared === 'prod') return 'production';
  if (typeof __DEV__ !== 'undefined') return __DEV__ ? 'development' : 'production';
  if (String(env?.npm_lifecycle_event ?? '').startsWith('test:')) return 'test';
  const nodeEnv = String(env?.NODE_ENV ?? '').trim().toLowerCase();
  if (nodeEnv === 'test') return 'test';
  if (nodeEnv === 'development') return 'development';
  if (nodeEnv === 'production') return 'production';
  return null;
}

function getRuntimeEnvironmentVariables(): Record<string, string | undefined> {
  try {
    const runtimeEnv = (globalThis as {
      process?: { env?: Record<string, string | undefined> };
    }).process?.env ?? {};
    return {
      ...runtimeEnv,
      // Expo substitutes EXPO_PUBLIC values only when referenced statically.
      // Keep those references inside this single authoritative environment reader.
      EXPO_PUBLIC_APP_ENV: process.env.EXPO_PUBLIC_APP_ENV,
      EXPO_PUBLIC_ECS_MISSION_COMMAND: process.env.EXPO_PUBLIC_ECS_MISSION_COMMAND,
      EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND: process.env.EXPO_PUBLIC_ECS_KILL_MISSION_COMMAND,
      EXPO_PUBLIC_ECS_KILL_DISPATCH_TAB: process.env.EXPO_PUBLIC_ECS_KILL_DISPATCH_TAB,
    };
  } catch {
    return {};
  }
}

function parseBooleanFlag(value: string | undefined): boolean | 'malformed' | null {
  if (value == null || value.trim() === '') return null;
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return 'malformed';
}

function normalizeFeatureRoutePath(path: string | null | undefined): string {
  const clean = String(path ?? '').split(/[?#]/, 1)[0].replace(/\/\([^/]+\)/g, '');
  if (!clean || clean === '/') return clean || '/';
  return clean.replace(/\/+$/, '') || '/';
}

function routeMatches(path: string, route: string): boolean {
  const normalizedRoute = normalizeFeatureRoutePath(route);
  return path === normalizedRoute || path.startsWith(`${normalizedRoute}/`);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
