export type OfflineDrillCapabilityStatus =
  | 'available_offline'
  | 'partially_available'
  | 'cached_but_stale'
  | 'unavailable'
  | 'manual_fallback_required';

export type OfflineDrillCapabilityId =
  | 'offline_navigation'
  | 'offline_honesty'
  | 'command_brief'
  | 'navigate'
  | 'campops'
  | 'dispatch_offline_replay'
  | 'incident_recovery'
  | 'field_utilities';

export type OfflineDrillReadiness = 'current_user_facing_extension';

export interface OfflineDrillCapabilityProbe {
  requiredInputs?: string[];
  availableInputs?: string[];
  missingInputs?: string[];
  staleInputs?: string[];
  invalidInputs?: string[];
  lastCachedAt?: string | null;
  sourceOfTruth?: string | null;
  userMessage?: string | null;
  manualFallbackRequired?: boolean;
  manualFallbackAvailable?: boolean;
}

export interface OfflineDrillAndroidEvidence {
  noNetworkDeviceEvidence?: boolean;
  screenshotsCaptured?: boolean;
  logsCaptured?: boolean;
  cacheManifestCaptured?: boolean;
  noRemoteSyncConfirmed?: boolean;
  productionDecision?: 'accepted' | 'blocked' | 'pending' | string | null;
}

export interface OfflineFailureDrillInput {
  now?: string;
  featureFlags?: {
    offlineFailureDrill?: boolean;
  } | null;
  noNetworkModeVerified?: boolean | null;
  capabilities?: Partial<Record<OfflineDrillCapabilityId, OfflineDrillCapabilityProbe>> | null;
  androidEvidence?: OfflineDrillAndroidEvidence | null;
}

export interface OfflineDrillSystemProfileInput {
  system_id: string;
  name?: string | null;
  behavior?: string | null;
  has_cached_data?: boolean | null;
  last_updated?: string | null;
  staleness_label?: string | null;
  is_stale?: boolean | null;
  status_message?: string | null;
}

export interface OfflineDrillDispatchQueueProbe {
  size?: number | null;
  pendingCount?: number | null;
  failedCount?: number | null;
}

export interface OfflineFailureDrillSystemProfileInput {
  now?: string;
  connectivityState?: 'online' | 'limited' | 'offline' | 'reconnecting' | string | null;
  featureFlags?: OfflineFailureDrillInput['featureFlags'];
  profiles?: OfflineDrillSystemProfileInput[] | null;
  dispatchQueue?: OfflineDrillDispatchQueueProbe | null;
  credentialRestoreAvailable?: boolean | null;
  fieldProtocolsAvailable?: boolean | null;
  recoveryDocsAvailable?: boolean | null;
  androidEvidence?: OfflineDrillAndroidEvidence | null;
}

export interface OfflineDrillCapabilityResult {
  capabilityId: OfflineDrillCapabilityId;
  capabilityName: string;
  status: OfflineDrillCapabilityStatus;
  requiredInputs: string[];
  availableInputs: string[];
  missingInputs: string[];
  staleInputs: string[];
  lastCachedAt: string | null;
  sourceOfTruth: string;
  userMessage: string;
  recommendedDownloads: string[];
}

export interface OfflineDrillProductionReadiness {
  status: 'blocked_android_no_network_evidence_required' | 'evidence_ready_for_owner_review';
  blockers: string[];
  evidenceRequired: string[];
}

export interface OfflineFailureDrillResult {
  enabled: boolean;
  readiness: OfflineDrillReadiness;
  evaluatedAt: string;
  localOnly: boolean;
  capabilities: OfflineDrillCapabilityResult[];
  recommendedDownloads: string[];
  warnings: string[];
  productionReadiness: OfflineDrillProductionReadiness;
}

interface CapabilityDefinition {
  capabilityId: OfflineDrillCapabilityId;
  capabilityName: string;
  requiredInputs: string[];
  partialInputs: string[];
  sourceOfTruth: string;
}

export const OFFLINE_DRILL_CAPABILITY_ORDER: OfflineDrillCapabilityId[] = [
  'offline_navigation',
  'offline_honesty',
  'command_brief',
  'navigate',
  'campops',
  'dispatch_offline_replay',
  'incident_recovery',
  'field_utilities',
];

const CAPABILITY_DEFINITIONS: Record<OfflineDrillCapabilityId, CapabilityDefinition> = {
  offline_navigation: {
    capabilityId: 'offline_navigation',
    capabilityName: 'Offline Navigation',
    requiredInputs: ['route_geometry', 'route_cache'],
    partialInputs: ['route_tiles'],
    sourceOfTruth: 'offline_navigation_local_cache',
  },
  offline_honesty: {
    capabilityId: 'offline_honesty',
    capabilityName: 'Offline Honesty',
    requiredInputs: ['cache_manifest', 'source_timestamps'],
    partialInputs: [],
    sourceOfTruth: 'offline_honesty_manifest',
  },
  command_brief: {
    capabilityId: 'command_brief',
    capabilityName: 'Command Brief',
    requiredInputs: ['command_brief_snapshot', 'credential_restore_material'],
    partialInputs: ['weather_packet'],
    sourceOfTruth: 'command_brief_local_snapshot',
  },
  navigate: {
    capabilityId: 'navigate',
    capabilityName: 'Navigate',
    requiredInputs: ['saved_route', 'route_geometry', 'route_cache'],
    partialInputs: ['route_tiles'],
    sourceOfTruth: 'navigate_local_route_state',
  },
  campops: {
    capabilityId: 'campops',
    capabilityName: 'CampOps',
    requiredInputs: ['camp_packet', 'camp_cache'],
    partialInputs: ['weather_packet'],
    sourceOfTruth: 'campops_local_cache',
  },
  dispatch_offline_replay: {
    capabilityId: 'dispatch_offline_replay',
    capabilityName: 'Dispatch offline replay',
    requiredInputs: ['dispatch_queue_persistence', 'credential_restore_material'],
    partialInputs: ['fresh_dispatch_state'],
    sourceOfTruth: 'dispatch_local_queue',
  },
  incident_recovery: {
    capabilityId: 'incident_recovery',
    capabilityName: 'Incident & Recovery',
    requiredInputs: ['recovery_docs', 'incident_protocols', 'coordinate_tools'],
    partialInputs: ['weather_packet'],
    sourceOfTruth: 'incident_recovery_local_docs',
  },
  field_utilities: {
    capabilityId: 'field_utilities',
    capabilityName: 'Field Utilities',
    requiredInputs: ['field_protocols', 'recovery_docs'],
    partialInputs: ['weather_packet'],
    sourceOfTruth: 'field_utilities_local_docs',
  },
};

const DOWNLOAD_LABELS: Record<string, string> = {
  route_geometry: 'Download route geometry',
  route_tiles: 'Download route tiles',
  route_cache: 'Refresh route cache',
  saved_route: 'Save route for offline use',
  camp_packet: 'Download camp packet',
  camp_cache: 'Refresh camp cache',
  weather_packet: 'Refresh weather packet',
  field_protocols: 'Download field protocols',
  recovery_docs: 'Download recovery docs',
  dispatch_queue_persistence: 'Verify Dispatch queue persistence',
  credential_restore_material: 'Refresh credential restore material',
  command_brief_snapshot: 'Save Command Brief snapshot',
  incident_protocols: 'Download incident protocols',
  coordinate_tools: 'Download coordinate tools',
  cache_manifest: 'Refresh cache manifest',
  source_timestamps: 'Refresh source timestamps',
};

const ANDROID_EVIDENCE_REQUIREMENTS: Array<keyof OfflineDrillAndroidEvidence> = [
  'noNetworkDeviceEvidence',
  'screenshotsCaptured',
  'logsCaptured',
  'cacheManifestCaptured',
  'noRemoteSyncConfirmed',
];

function nowIso(input?: string): string {
  if (typeof input === 'string' && input.trim().length > 0) return input;
  return new Date().toISOString();
}

function dedupe(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const clean = typeof value === 'string' ? value.trim() : '';
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(clean);
  }
  return output;
}

function missingRequiredInputs(definition: CapabilityDefinition, probe: OfflineDrillCapabilityProbe): string[] {
  const available = new Set((probe.availableInputs ?? []).map((item) => item.trim()).filter(Boolean));
  const stale = new Set((probe.staleInputs ?? []).map((item) => item.trim()).filter(Boolean));
  const invalid = new Set((probe.invalidInputs ?? []).map((item) => item.trim()).filter(Boolean));
  const explicitMissing = probe.missingInputs ?? [];
  const inferredMissing = definition.requiredInputs.filter(
    (input) => !available.has(input) && !stale.has(input) && !invalid.has(input),
  );
  return dedupe([...explicitMissing, ...probe.invalidInputs ?? [], ...inferredMissing])
    .filter((input) => definition.requiredInputs.includes(input) || input === 'credential_restore_material');
}

function nonCriticalMissingInputs(definition: CapabilityDefinition, probe: OfflineDrillCapabilityProbe): string[] {
  const missing = new Set(probe.missingInputs ?? []);
  return definition.partialInputs.filter((input) => missing.has(input));
}

function recommendedDownloadsFor(inputs: string[], stale: boolean): string[] {
  return dedupe(inputs.map((input) => {
    const label = DOWNLOAD_LABELS[input] ?? `Prepare ${input.replace(/_/g, ' ')}`;
    if (!stale) return label;
    if (label.startsWith('Download ')) return label.replace('Download ', 'Refresh ');
    if (label.startsWith('Save ')) return label.replace('Save ', 'Refresh ');
    return label;
  }));
}

export function formatOfflineDrillStatus(status: OfflineDrillCapabilityStatus): string {
  switch (status) {
    case 'available_offline':
      return 'Available offline';
    case 'partially_available':
      return 'Partially available';
    case 'cached_but_stale':
      return 'Cached but stale';
    case 'unavailable':
      return 'Unavailable';
    case 'manual_fallback_required':
      return 'Manual fallback required';
  }
}

function classifyCapability(
  definition: CapabilityDefinition,
  probe: OfflineDrillCapabilityProbe,
): OfflineDrillCapabilityStatus {
  const missingRequired = missingRequiredInputs(definition, probe);
  if (missingRequired.length > 0) return 'unavailable';

  const hasManualFallback = probe.manualFallbackRequired === true;
  if (hasManualFallback) return 'manual_fallback_required';

  if ((probe.staleInputs ?? []).length > 0) return 'cached_but_stale';

  if (nonCriticalMissingInputs(definition, probe).length > 0) return 'partially_available';

  return 'available_offline';
}

function buildUserMessage(
  definition: CapabilityDefinition,
  result: Pick<OfflineDrillCapabilityResult, 'status' | 'missingInputs' | 'staleInputs' | 'availableInputs'>,
): string {
  if (definition.capabilityId === 'dispatch_offline_replay' && result.status === 'partially_available') {
    return 'Dispatch events can be queued locally; live roster updates and replay sync wait for network.';
  }

  if (result.status === 'available_offline') {
    return `${definition.capabilityName} can use verified local inputs while the network is unavailable.`;
  }

  if (result.status === 'partially_available') {
    return `${definition.capabilityName} has core local context, but ${result.missingInputs.join(', ')} should be prepared before departure.`;
  }

  if (result.status === 'cached_but_stale') {
    return `${definition.capabilityName} has cached data, but ${result.staleInputs.join(', ')} is stale or cannot be verified current.`;
  }

  if (result.status === 'manual_fallback_required') {
    return `${definition.capabilityName} has local documents or protocols; use manual fallback because automated app behavior is unsupported offline.`;
  }

  return `Missing required local inputs for ${definition.capabilityName}: ${result.missingInputs.join(', ')}.`;
}

function buildCapabilityResult(
  definition: CapabilityDefinition,
  probe: OfflineDrillCapabilityProbe | null | undefined,
): OfflineDrillCapabilityResult {
  const effectiveProbe = probe ?? {};
  const requiredInputs = effectiveProbe.requiredInputs ?? definition.requiredInputs;
  const missingRequired = missingRequiredInputs({ ...definition, requiredInputs }, effectiveProbe);
  const partialMissing = nonCriticalMissingInputs(definition, effectiveProbe);
  const staleInputs = dedupe(effectiveProbe.staleInputs ?? []);
  const missingInputs = dedupe([...missingRequired, ...partialMissing]);
  const status = classifyCapability({ ...definition, requiredInputs }, effectiveProbe);
  const staleRecommendations = recommendedDownloadsFor(staleInputs, true);
  const missingRecommendations = recommendedDownloadsFor(missingInputs, false);
  const availableInputs = dedupe(effectiveProbe.availableInputs ?? []);
  const baseResult = {
    capabilityId: definition.capabilityId,
    capabilityName: definition.capabilityName,
    status,
    requiredInputs,
    availableInputs,
    missingInputs,
    staleInputs,
    lastCachedAt: effectiveProbe.lastCachedAt ?? null,
    sourceOfTruth: effectiveProbe.sourceOfTruth ?? definition.sourceOfTruth,
    recommendedDownloads: dedupe([...missingRecommendations, ...staleRecommendations]),
  };

  return {
    ...baseResult,
    userMessage: effectiveProbe.userMessage ?? buildUserMessage(definition, baseResult),
  };
}

function buildProductionReadiness(
  input: OfflineFailureDrillInput,
): OfflineDrillProductionReadiness {
  const evidence = input.androidEvidence ?? {};
  const blockers: string[] = [];

  if (input.noNetworkModeVerified !== true) {
    blockers.push('runtime_no_network_confirmation_missing');
  }

  for (const key of ANDROID_EVIDENCE_REQUIREMENTS) {
    if (evidence[key] !== true) {
      blockers.push(
        key === 'noNetworkDeviceEvidence'
          ? 'android_no_network_device_evidence_missing'
          : `android_${String(key).replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`)}_missing`,
      );
    }
  }

  if (String(evidence.productionDecision ?? '').toLowerCase() !== 'accepted') {
    blockers.push('production_owner_decision_missing');
  }

  return {
    status: blockers.length > 0
      ? 'blocked_android_no_network_evidence_required'
      : 'evidence_ready_for_owner_review',
    blockers: dedupe(blockers),
    evidenceRequired: [
      'Android no-network screenshots of readiness results',
      'Android no-network test logs',
      'Cache manifest used for the run',
      'Confirmation that no remote provider update or live sync succeeded',
      'Production owner decision',
    ],
  };
}

export function buildOfflineFailureDrill(input: OfflineFailureDrillInput = {}): OfflineFailureDrillResult {
  const evaluatedAt = nowIso(input.now);
  const readiness: OfflineDrillReadiness = 'current_user_facing_extension';
  const enabled = input.featureFlags?.offlineFailureDrill !== false;
  const productionReadiness = buildProductionReadiness(input);

  if (!enabled) {
    return {
      enabled: false,
      readiness,
      evaluatedAt,
      localOnly: true,
      capabilities: [],
      recommendedDownloads: [],
      warnings: [],
      productionReadiness,
    };
  }

  const capabilities = OFFLINE_DRILL_CAPABILITY_ORDER.map((capabilityId) => buildCapabilityResult(
    CAPABILITY_DEFINITIONS[capabilityId],
    input.capabilities?.[capabilityId],
  ));
  const warnings = input.noNetworkModeVerified === true
    ? []
    : ['No-network mode was not verified inside the app/runtime.'];

  return {
    enabled: true,
    readiness,
    evaluatedAt,
    localOnly: true,
    capabilities,
    recommendedDownloads: dedupe(capabilities.flatMap((capability) => capability.recommendedDownloads)),
    warnings,
    productionReadiness,
  };
}

function findProfile(
  profiles: OfflineDrillSystemProfileInput[],
  ...ids: string[]
): OfflineDrillSystemProfileInput | null {
  return profiles.find((profile) => ids.includes(profile.system_id)) ?? null;
}

function profileCached(profile: OfflineDrillSystemProfileInput | null): boolean {
  return profile?.has_cached_data === true;
}

function profileStale(profile: OfflineDrillSystemProfileInput | null): boolean {
  return profile?.is_stale === true || String(profile?.staleness_label ?? '').toLowerCase().includes('stale');
}

function profileTimestamp(...profiles: Array<OfflineDrillSystemProfileInput | null>): string | null {
  return profiles.map((profile) => profile?.last_updated ?? null).find((value): value is string => Boolean(value)) ?? null;
}

function credentialInputs(available: boolean): Pick<OfflineDrillCapabilityProbe, 'availableInputs' | 'missingInputs'> {
  return available
    ? { availableInputs: ['credential_restore_material'], missingInputs: [] }
    : { availableInputs: [], missingInputs: ['credential_restore_material'] };
}

export function buildOfflineFailureDrillFromSystemProfiles(
  input: OfflineFailureDrillSystemProfileInput = {},
): OfflineFailureDrillResult {
  const profiles = input.profiles ?? [];
  const routeProfile = findProfile(profiles, 'route_navigation');
  const weatherProfile = findProfile(profiles, 'weather');
  const discoveryProfile = findProfile(profiles, 'discovery');
  const dispatchProfile = findProfile(profiles, 'dispatch');
  const credentialAvailable = input.credentialRestoreAvailable !== false;
  const fieldProtocolsAvailable = input.fieldProtocolsAvailable !== false;
  const recoveryDocsAvailable = input.recoveryDocsAvailable !== false;
  const routeAvailable = profileCached(routeProfile);
  const routeStale = profileStale(routeProfile);
  const weatherStale = profileStale(weatherProfile);
  const campAvailable = profileCached(discoveryProfile);
  const campStale = profileStale(discoveryProfile);
  const queueAvailable =
    typeof input.dispatchQueue?.size === 'number' ||
    typeof input.dispatchQueue?.pendingCount === 'number' ||
    profileCached(dispatchProfile);
  const credential = credentialInputs(credentialAvailable);

  return buildOfflineFailureDrill({
    now: input.now,
    featureFlags: input.featureFlags,
    noNetworkModeVerified: input.connectivityState === 'offline',
    androidEvidence: input.androidEvidence,
    capabilities: {
      offline_navigation: {
        availableInputs: routeAvailable ? ['route_geometry', 'route_cache', 'route_tiles'] : [],
        missingInputs: routeAvailable ? [] : ['route_geometry', 'route_cache', 'route_tiles'],
        staleInputs: routeStale ? ['route_cache'] : [],
        lastCachedAt: profileTimestamp(routeProfile),
        sourceOfTruth: 'offline_mode_route_navigation_profile',
      },
      offline_honesty: {
        availableInputs: routeAvailable ? ['cache_manifest', 'source_timestamps'] : ['cache_manifest'],
        missingInputs: routeAvailable ? [] : ['source_timestamps'],
        staleInputs: routeStale ? ['source_timestamps'] : [],
        lastCachedAt: profileTimestamp(routeProfile),
        sourceOfTruth: 'offline_mode_system_profiles',
      },
      command_brief: {
        availableInputs: dedupe([
          'command_brief_snapshot',
          ...credential.availableInputs ?? [],
          weatherProfile ? 'weather_packet' : null,
        ]),
        missingInputs: dedupe([
          ...credential.missingInputs ?? [],
          weatherProfile ? null : 'weather_packet',
        ]),
        staleInputs: weatherStale ? ['weather_packet'] : [],
        lastCachedAt: profileTimestamp(weatherProfile, routeProfile),
        sourceOfTruth: 'command_brief_local_snapshot',
      },
      navigate: {
        availableInputs: routeAvailable ? ['saved_route', 'route_geometry', 'route_cache', 'route_tiles'] : [],
        missingInputs: routeAvailable ? [] : ['saved_route', 'route_geometry', 'route_cache', 'route_tiles'],
        staleInputs: routeStale ? ['route_cache'] : [],
        lastCachedAt: profileTimestamp(routeProfile),
        sourceOfTruth: 'offline_mode_route_navigation_profile',
      },
      campops: {
        availableInputs: campAvailable ? ['camp_packet', 'camp_cache'] : [],
        missingInputs: campAvailable ? [] : ['camp_packet', 'camp_cache'],
        staleInputs: campStale ? ['camp_cache'] : [],
        lastCachedAt: profileTimestamp(discoveryProfile),
        sourceOfTruth: 'offline_mode_discovery_profile',
      },
      dispatch_offline_replay: {
        availableInputs: dedupe([
          queueAvailable ? 'dispatch_queue_persistence' : null,
          ...credential.availableInputs ?? [],
        ]),
        missingInputs: dedupe([
          queueAvailable ? 'fresh_dispatch_state' : 'dispatch_queue_persistence',
          ...credential.missingInputs ?? [],
        ]),
        lastCachedAt: profileTimestamp(dispatchProfile),
        sourceOfTruth: 'dispatch_local_queue',
      },
      incident_recovery: {
        availableInputs: dedupe([
          recoveryDocsAvailable ? 'recovery_docs' : null,
          fieldProtocolsAvailable ? 'incident_protocols' : null,
          'coordinate_tools',
        ]),
        missingInputs: dedupe([
          recoveryDocsAvailable ? null : 'recovery_docs',
          fieldProtocolsAvailable ? null : 'incident_protocols',
        ]),
        lastCachedAt: profileTimestamp(routeProfile),
        sourceOfTruth: 'incident_recovery_local_docs',
      },
      field_utilities: {
        availableInputs: dedupe([
          fieldProtocolsAvailable ? 'field_protocols' : null,
          recoveryDocsAvailable ? 'recovery_docs' : null,
        ]),
        missingInputs: dedupe([
          fieldProtocolsAvailable ? null : 'field_protocols',
          recoveryDocsAvailable ? null : 'recovery_docs',
        ]),
        manualFallbackRequired: true,
        lastCachedAt: profileTimestamp(routeProfile),
        sourceOfTruth: 'field_utilities_local_docs',
      },
    },
  });
}

export class OfflineDrillService {
  run(input: OfflineFailureDrillInput = {}): OfflineFailureDrillResult {
    return buildOfflineFailureDrill(input);
  }
}
