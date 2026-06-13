export type ECSIntegrationFeatureId =
  | 'camp_decision_clock'
  | 'departure_delta_brief'
  | 'route_confidence_timeline'
  | 'weak_point_analyzer'
  | 'convoy_staleness_ladder'
  | 'recovery_packet_builder'
  | 'expedition_replay_debrief'
  | 'offline_failure_drill'
  | 'loadout_consequence_preview';

export type ECSIntegrationSurface =
  | 'command_brief'
  | 'navigate'
  | 'fleet'
  | 'convoy_command'
  | 'offline_dashboard'
  | 'incident_recovery'
  | 'debrief'
  | 'export_packet';

export type ECSIntegrationFailureMode =
  | 'hidden'
  | 'unavailable'
  | 'source_limited'
  | 'partial'
  | 'manual_fallback'
  | 'blocked';

export type ECSIntegrationFlagConvention =
  | 'runtime_flag_fail_closed'
  | 'current_user_facing_extension_explicit_false_disables'
  | 'current_user_facing_extension_no_runtime_flag_helper'
  | 'current_user_facing_internal_beta_no_runtime_flag_helper';

export type ECSIntegrationMatrixEntry = {
  featureId: ECSIntegrationFeatureId;
  ownerSystem: string;
  sourceOfTruthSystems: string[];
  consumedInputs: string[];
  emittedOutputs: string[];
  surfaces: ECSIntegrationSurface[];
  commandBriefRelationship?: 'persistent_module' | 'compact_panel' | 'mirror_only' | 'source_input' | 'none';
  featureFlag?: string;
  featureFlagConvention: ECSIntegrationFlagConvention;
  readinessLabel: string;
  productionGate?: string;
  failureMode: ECSIntegrationFailureMode;
  requiredEvidence: string[];
  mustNotDo: string[];
};

export const ECS_INTEGRATION_FEATURE_IDS: ECSIntegrationFeatureId[] = [
  'camp_decision_clock',
  'departure_delta_brief',
  'route_confidence_timeline',
  'weak_point_analyzer',
  'convoy_staleness_ladder',
  'recovery_packet_builder',
  'expedition_replay_debrief',
  'offline_failure_drill',
  'loadout_consequence_preview',
];

export const ECS_INTEGRATION_MATRIX: ECSIntegrationMatrixEntry[] = [
  {
    featureId: 'camp_decision_clock',
    ownerSystem: 'CampOps',
    sourceOfTruthSystems: ['Find Safe End Point', 'CampOps', 'Route progress', 'Weather Intelligence', 'Logistics margins'],
    consumedInputs: [
      'route progress',
      'ETA',
      'delay scenario',
      'daylight window',
      'planned camp candidate',
      'backup safe endpoint',
      'emergency safe endpoint',
      'fuel/water/power margins',
      'route difficulty',
      'weather risk',
      'legal/access confidence',
      'data freshness',
    ],
    emittedOutputs: [
      'continueUntil',
      'backupEndpointId',
      'emergencyViableUntil',
      'mainRisk',
      'state',
      'warnings',
      'decisionTrace',
    ],
    surfaces: ['command_brief', 'navigate'],
    commandBriefRelationship: 'persistent_module',
    featureFlag: 'campDecisionClock',
    featureFlagConvention: 'runtime_flag_fail_closed',
    readinessLabel: 'feature_flagged',
    failureMode: 'unavailable',
    requiredEvidence: ['fresh safe endpoint viability', 'legal/access confidence provenance', 'source timestamps'],
    mustNotDo: [
      'Must not show a confident continueUntil without viable backup endpoint data.',
      'Must not present camp legality as certain unless legal/access confidence is validated.',
      'Must not let unvalidated provider data improve endpoint viability or confidence.',
    ],
  },
  {
    featureId: 'departure_delta_brief',
    ownerSystem: 'ECS Readiness',
    sourceOfTruthSystems: ['Deterministic readiness engine', 'Previous departure audit snapshot'],
    consumedInputs: [
      'previous departure audit',
      'current readiness posture',
      'current blockers',
      'vehicle/loadout values',
      'route state',
      'weather freshness',
      'offline package',
      'camp confidence',
      'dispatch roster',
      'resource margins',
    ],
    emittedOutputs: [
      'newBlockers',
      'resolvedBlockers',
      'staleInputs',
      'changedVehicleLoadoutValues',
      'offlinePackageRegressions',
      'campConfidenceChanges',
      'updatedPosture',
    ],
    surfaces: ['command_brief'],
    commandBriefRelationship: 'compact_panel',
    featureFlag: 'departureDeltaBrief',
    featureFlagConvention: 'runtime_flag_fail_closed',
    readinessLabel: 'feature_flagged',
    failureMode: 'unavailable',
    requiredEvidence: ['timestamped previous audit', 'comparable current readiness result', 'domain identity match'],
    mustNotDo: [
      'Must not claim changed or resolved items without comparable previous/current timestamps.',
      'Must not let AI alter deterministic blocker or posture ownership.',
      'Must not compare camp confidence across different endpoint identities or scales.',
    ],
  },
  {
    featureId: 'route_confidence_timeline',
    ownerSystem: 'Route Context Engine',
    sourceOfTruthSystems: ['Route Context Engine', 'Route geometry', 'source-truth overlays'],
    consumedInputs: [
      'route ID',
      'route geometry version',
      'measured route spans',
      'legal/access overlays',
      'closure/current-condition overlays',
      'offline coverage overlays',
      'terrain/weather overlays',
      'bailout density overlays',
      'camp deadline overlays',
      'recovery exposure overlays',
    ],
    emittedOutputs: ['timeline items', 'warnings', 'diagnostics', 'source freshness', 'completeness'],
    surfaces: ['navigate'],
    commandBriefRelationship: 'none',
    featureFlag: 'routeConfidenceTimeline',
    featureFlagConvention: 'runtime_flag_fail_closed',
    readinessLabel: 'feature_flagged',
    failureMode: 'source_limited',
    requiredEvidence: ['route geometry match', 'source attribution', 'freshness metadata'],
    mustNotDo: [
      'Must not rerank or block routes in V1.',
      'Must not render unknown or low confidence as confirmed danger.',
      'Must not accept overlays from a different route or geometry version.',
    ],
  },
  {
    featureId: 'weak_point_analyzer',
    ownerSystem: 'ECS Readiness',
    sourceOfTruthSystems: ['Immutable ExpeditionReadinessSnapshot', 'deterministic weak-point scorer'],
    consumedInputs: [
      'route confidence',
      'logistics margins',
      'fleet/loadout payload state',
      'weather freshness',
      'offline readiness',
      'camp endpoint confidence',
      'recovery/bailout access',
      'daylight',
      'convoy state',
      'source facts',
    ],
    emittedOutputs: [
      'rankedWeakPoints',
      'mostFragileAssumption',
      'mostSevereConsequence',
      'easiestFixBeforeDeparture',
      'monitorDuringTravel',
      'missingData',
      'scoreVersion',
    ],
    surfaces: ['command_brief'],
    commandBriefRelationship: 'source_input',
    featureFlag: 'expeditionWeakPointAnalyzer',
    featureFlagConvention: 'runtime_flag_fail_closed',
    readinessLabel: 'Internal beta / restricted field-test',
    failureMode: 'source_limited',
    requiredEvidence: ['immutable readiness snapshot', 'source fact IDs', 'score policy version'],
    mustNotDo: [
      'Must not let AI reorder ranked weak points.',
      'Must not invent facts, categories, hazards, or recommendations.',
      'Must not create a new go/no-go readiness label.',
    ],
  },
  {
    featureId: 'convoy_staleness_ladder',
    ownerSystem: 'Convoy Command',
    sourceOfTruthSystems: ['Expedition/Dispatch staleness policy', 'accepted check-in source', 'permission model'],
    consumedInputs: [
      'roster',
      'last accepted check-ins',
      'explicit shared coordinates',
      'assist/recovery events',
      'offline replay state',
      'channel state',
      'permissions',
      'expedition staleness policy',
    ],
    emittedOutputs: ['ladder rows', 'status groups', 'policy evidence', 'source notes', 'privacy notes', 'warnings'],
    surfaces: ['convoy_command', 'incident_recovery'],
    commandBriefRelationship: 'none',
    featureFlag: 'convoyStalenessLadder',
    featureFlagConvention: 'current_user_facing_internal_beta_no_runtime_flag_helper',
    readinessLabel: 'Current user-facing/internal beta extension',
    failureMode: 'unavailable',
    requiredEvidence: ['valid expedition staleness policy', 'permissions', 'accepted check-in timestamps'],
    mustNotDo: [
      'Must not infer distress from silence.',
      'Must not expose timestamps or coordinates without permission.',
      'Must not refresh another user status from pending offline replay before source acceptance.',
    ],
  },
  {
    featureId: 'recovery_packet_builder',
    ownerSystem: 'Incident & Recovery',
    sourceOfTruthSystems: ['Incident & Recovery', 'user-confirmed coordinates', 'Fleet', 'Navigate', 'Offline Honesty'],
    consumedInputs: [
      'manual incident type',
      'confirmed location',
      'active route',
      'vehicle profile',
      'recovery gear',
      'team roster',
      'comms status',
      'offline availability',
      'weather freshness',
      'nearby bailout candidates',
      'review-only Garmin/inReach signals',
    ],
    emittedOutputs: ['packet draft', 'sections', 'freshness labels', 'share actions', 'gated export'],
    surfaces: ['incident_recovery', 'export_packet'],
    commandBriefRelationship: 'none',
    featureFlag: 'recoveryPacketBuilder',
    featureFlagConvention: 'runtime_flag_fail_closed',
    readinessLabel: 'Current user-facing/internal beta',
    failureMode: 'blocked',
    requiredEvidence: ['manual incident type', 'user-confirmed coordinates', 'visible freshness labels'],
    mustNotDo: [
      'Must not enable copy, download, or share before coordinates are user-confirmed.',
      'Must not imply SOS, emergency service contact, or automated dispatch.',
      'Must not hide unavailable sourced fields silently.',
    ],
  },
  {
    featureId: 'expedition_replay_debrief',
    ownerSystem: 'Debrief',
    sourceOfTruthSystems: ['DebriefRecord read model', 'trip timeline', 'known-at-time evidence'],
    consumedInputs: [
      'trip timeline',
      'route progress',
      'CAD/check-ins',
      'incidents',
      'offline periods',
      'weather',
      'camp decisions',
      'readiness changes',
      'fleet/loadout state',
    ],
    emittedOutputs: ['DebriefRecord', 'chapters', 'events', 'map overlays', 'recommendations', 'prep task payloads'],
    surfaces: ['debrief'],
    commandBriefRelationship: 'none',
    featureFlag: 'expeditionReplayDebrief',
    featureFlagConvention: 'runtime_flag_fail_closed',
    readinessLabel: 'Internal beta',
    failureMode: 'source_limited',
    requiredEvidence: ['known-at-time timestamps', 'source/time/confidence chips', 'route geometry match'],
    mustNotDo: [
      'Must not replace known-at-time values with later current values.',
      'Must not render stale/offline periods as confident route knowledge.',
      'Must not expose restricted evidence without viewer permission.',
    ],
  },
  {
    featureId: 'offline_failure_drill',
    ownerSystem: 'Offline Honesty',
    sourceOfTruthSystems: ['local cache probes', 'offline runtime network evidence', 'Android evidence manifest'],
    consumedInputs: [
      'saved route',
      'tile cache',
      'route cache',
      'camp cache',
      'weather cache',
      'protocols',
      'recovery docs',
      'Dispatch queue',
      'credential restore material',
    ],
    emittedOutputs: ['capability results', 'local-only evidence', 'recommended downloads', 'production readiness blockers'],
    surfaces: ['offline_dashboard', 'command_brief'],
    commandBriefRelationship: 'source_input',
    featureFlag: 'offlineFailureDrill',
    featureFlagConvention: 'current_user_facing_extension_explicit_false_disables',
    readinessLabel: 'current_user_facing_extension',
    productionGate: 'gate:offline-failure-drill-production:json',
    failureMode: 'manual_fallback',
    requiredEvidence: ['Android no-network screenshots', 'Android no-network logs', 'cache manifest', 'owner production decision'],
    mustNotDo: [
      'Must not claim live weather, routing, team sync, provider updates, or fresh Dispatch state offline.',
      'Must not upgrade status based on unreachable network data.',
      'Must not mark production ready without Android no-network evidence.',
    ],
  },
  {
    featureId: 'loadout_consequence_preview',
    ownerSystem: 'Fleet',
    sourceOfTruthSystems: ['Fleet weight engine', 'active vehicle/loadout', 'Command Brief mirror snapshot'],
    consumedInputs: [
      'active vehicle',
      'vehicle weight evidence',
      'current accessories',
      'current loadout items',
      'proposed loadout items',
      'route context',
      'trailer state',
      'tire/lift state',
    ],
    emittedOutputs: [
      'loadout consequence preview',
      'calculation trace',
      'risk traces',
      'safe suggestions',
      'Command Brief mirror summary',
      'mirror invalidation reason',
    ],
    surfaces: ['fleet', 'command_brief'],
    commandBriefRelationship: 'mirror_only',
    featureFlag: 'loadoutConsequencePreview',
    featureFlagConvention: 'current_user_facing_extension_no_runtime_flag_helper',
    readinessLabel: 'current_user_facing_extension',
    productionGate: 'gate:loadout-consequence-preview-production:json',
    failureMode: 'partial',
    requiredEvidence: [
      'Android no-network device evidence',
      'profile variance evidence',
      'multi-vehicle evidence',
      'scale ticket evidence',
      'offline/cache evidence',
      'large loadout performance evidence',
      'production owner decision',
    ],
    mustNotDo: [
      'Must not create go/no-go readiness labels.',
      'Must not let stale proposed preview mirror persist after cancel, commit, or context switch.',
      'Must not mutate loadout from review-only suggestions.',
    ],
  },
];

export function getEcsIntegrationMatrixEntry(featureId: ECSIntegrationFeatureId): ECSIntegrationMatrixEntry {
  const entry = ECS_INTEGRATION_MATRIX.find((item) => item.featureId === featureId);
  if (!entry) {
    throw new Error(`Unknown ECS integration feature: ${featureId}`);
  }
  return entry;
}
