export type OfflineDrillProbeSourceType =
  | 'local_route_geometry'
  | 'tile_cache'
  | 'route_cache'
  | 'camp_cache'
  | 'weather_cache'
  | 'local_protocol_doc'
  | 'recovery_doc'
  | 'dispatch_queue'
  | 'credential_restore'
  | 'offline_profile'
  | 'cache_manifest'
  | 'runtime_network_state'
  | 'unknown';

export type OfflineDrillProbeResult =
  | 'valid'
  | 'present'
  | 'missing'
  | 'corrupt'
  | 'stale'
  | 'expired'
  | 'unavailable';

export type OfflineDrillProbeFreshness = 'current' | 'stale' | 'expired' | 'unavailable';

export interface OfflineDrillProbeEvidence {
  probeId: string;
  capabilityId: string;
  inputId: string;
  sourceType: OfflineDrillProbeSourceType;
  localOnly: true;
  checkedAt: string;
  lastCachedAt?: string;
  freshness: OfflineDrillProbeFreshness;
  result: OfflineDrillProbeResult;
  notes: string[];
}

export type OfflineFailureDrillCacheFixtureProfile =
  | 'available'
  | 'partial'
  | 'stale'
  | 'unavailable'
  | 'manual_fallback';

export type OfflineFailureDrillEvidenceSource = 'real' | 'fixture' | 'synthetic';

export interface OfflineFailureDrillCacheFixtureInput {
  inputId: string;
  sourceType: OfflineDrillProbeSourceType;
  path?: string;
  present: boolean;
  corrupt?: boolean;
  lastCachedAt?: string;
  freshness: OfflineDrillProbeFreshness;
  notes: string[];
}

export interface OfflineFailureDrillCacheFixtureManifest {
  fixtureId: string;
  profile: OfflineFailureDrillCacheFixtureProfile;
  generatedAt: string;
  routeId?: string;
  expeditionId?: string;
  inputs: OfflineFailureDrillCacheFixtureInput[];
}

export interface OfflineFailureDrillRuntimeNetworkEvidence {
  checkedAt: string;
  appObservedOffline: boolean;
  runtimeNetworkProbe: 'offline' | 'online' | 'unavailable' | 'unknown';
  providerReachability: 'unreachable' | 'reachable' | 'not_checked_due_to_offline' | 'unknown';
  notes: string[];
}

export interface OfflineFailureDrillAndroidEvidenceManifest {
  evidenceId: string;
  evidenceKind: 'android_no_network_device' | 'android_no_network_emulator';
  evidenceSource?: OfflineFailureDrillEvidenceSource;
  generatedAt: string;
  app: {
    appBuildId?: string;
    appVersion?: string;
    gitSha?: string;
    bundleId?: string;
  };
  platform: {
    os: 'android';
    deviceName?: string;
    emulatorName?: string;
    osVersion?: string;
    apiLevel?: string | number;
  };
  networkState: {
    appObservedOffline: boolean;
    systemNetworkDisabled: boolean;
    checkedAt: string;
    runtimeNetworkProbe: 'offline' | 'online' | 'unavailable' | 'unknown';
    notes: string[];
  };
  cacheFixtureProfile: OfflineFailureDrillCacheFixtureProfile;
  cacheManifestPath: string;
  drillResultPath: string;
  offlineAssertionsPath: string;
  readinessMetadataPath: string;
  captureBundlePath?: string;
  screenshotPaths: string[];
  logPaths: string[];
  remoteAttemptSummary: {
    providerUpdateAttempted: boolean;
    providerUpdateSucceeded: boolean;
    liveSyncAttempted: boolean;
    liveSyncSucceeded: boolean;
    dispatchReplayAttempted?: boolean;
    dispatchReplaySucceeded?: boolean;
    dispatchReplayLocalOnly?: boolean;
    weatherRefreshAttempted?: boolean;
    weatherRefreshSucceeded?: boolean;
    teamSyncAttempted?: boolean;
    teamSyncSucceeded?: boolean;
  };
  resultSummary: {
    capabilityCount: number;
    statuses: Record<string, number>;
    productionReadiness: 'blocked' | 'evidence_ready' | 'accepted';
  };
  ownerAcceptance: {
    accepted: boolean;
    acceptedBy?: string;
    acceptedAt?: string;
    notes: string[];
  };
  artifacts: {
    directory: string;
    manifestPath: string;
  };
  validationNotes: string[];
}

export interface OfflineFailureDrillEvidenceValidationOptions {
  rootDir?: string;
  artifactExists?: (artifactPath: string) => boolean;
}

export interface OfflineFailureDrillEvidenceValidationResult {
  structurallyValid: boolean;
  productionEligible: boolean;
  evidenceId: string | null;
  evidenceKind: string | null;
  evidenceSource: OfflineFailureDrillEvidenceSource | 'unknown';
  ownerAccepted: boolean;
  failedRules: string[];
  missingArtifacts: string[];
  blockers: string[];
  validationNotes: string[];
}

export interface OfflineFailureDrillCacheFixtureValidationResult {
  valid: boolean;
  errors: string[];
}

const VALID_FIXTURE_PROFILES: OfflineFailureDrillCacheFixtureProfile[] = [
  'available',
  'partial',
  'stale',
  'unavailable',
  'manual_fallback',
];

const VALID_SOURCE_TYPES: OfflineDrillProbeSourceType[] = [
  'local_route_geometry',
  'tile_cache',
  'route_cache',
  'camp_cache',
  'weather_cache',
  'local_protocol_doc',
  'recovery_doc',
  'dispatch_queue',
  'credential_restore',
  'offline_profile',
  'cache_manifest',
  'runtime_network_state',
  'unknown',
];

const VALID_FRESHNESS: OfflineDrillProbeFreshness[] = ['current', 'stale', 'expired', 'unavailable'];

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function booleanValue(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function defaultArtifactExists(artifactPath: string): boolean {
  return false;
}

function isAbsolutePath(filePath: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(filePath) || filePath.startsWith('/') || filePath.startsWith('\\\\');
}

function resolveArtifactPath(filePath: unknown, rootDir?: string): string | null {
  if (!nonEmptyString(filePath)) return null;
  if (isAbsolutePath(filePath)) return filePath;
  if (!rootDir) return filePath;
  return `${rootDir.replace(/[\\/]$/, '')}/${filePath}`;
}

function pushMissingArtifact(
  missingArtifacts: string[],
  failedRules: string[],
  field: string,
  filePath: unknown,
  options: OfflineFailureDrillEvidenceValidationOptions,
) {
  const resolved = resolveArtifactPath(filePath, options.rootDir);
  if (!resolved) {
    failedRules.push(`${field}.path_required`);
    return;
  }
  const exists = options.artifactExists ?? defaultArtifactExists;
  if (!exists(resolved)) {
    missingArtifacts.push(resolved);
    failedRules.push(`${field}.artifact_missing`);
  }
}

function validateBooleanTrue(value: unknown, failedRules: string[], rule: string) {
  if (value !== true) failedRules.push(rule);
}

function validateBooleanFalse(value: unknown, failedRules: string[], rule: string) {
  if (value !== false) failedRules.push(rule);
}

export function validateOfflineFailureDrillAndroidEvidenceManifest(
  manifest: unknown,
  options: OfflineFailureDrillEvidenceValidationOptions = {},
): OfflineFailureDrillEvidenceValidationResult {
  const failedRules: string[] = [];
  const missingArtifacts: string[] = [];
  const blockers: string[] = [];

  if (!isRecord(manifest)) {
    return {
      structurallyValid: false,
      productionEligible: false,
      evidenceId: null,
      evidenceKind: null,
      evidenceSource: 'unknown',
      ownerAccepted: false,
      failedRules: ['manifest_malformed'],
      missingArtifacts: [],
      blockers: ['android_evidence_manifest_malformed'],
      validationNotes: ['Manifest must be a JSON object.'],
    };
  }

  const evidenceSource = (manifest.evidenceSource ?? 'real') as OfflineFailureDrillEvidenceSource;
  const ownerAcceptance = isRecord(manifest.ownerAcceptance) ? manifest.ownerAcceptance : {};
  const ownerAccepted = ownerAcceptance.accepted === true;

  if (!nonEmptyString(manifest.evidenceId)) failedRules.push('evidenceId_required');
  if (!['android_no_network_device', 'android_no_network_emulator'].includes(String(manifest.evidenceKind))) {
    failedRules.push('evidenceKind_android_no_network_required');
  }
  if (!nonEmptyString(manifest.generatedAt)) failedRules.push('generatedAt_required');
  if (!['real', 'fixture', 'synthetic'].includes(String(evidenceSource))) {
    failedRules.push('evidenceSource_invalid');
  }

  const platform = isRecord(manifest.platform) ? manifest.platform : {};
  if (platform.os !== 'android') failedRules.push('platform.os_android_required');

  const networkState = isRecord(manifest.networkState) ? manifest.networkState : {};
  validateBooleanTrue(networkState.appObservedOffline, failedRules, 'networkState.appObservedOffline_true_required');
  validateBooleanTrue(networkState.systemNetworkDisabled, failedRules, 'networkState.systemNetworkDisabled_true_required');
  if (!nonEmptyString(networkState.checkedAt)) failedRules.push('networkState.checkedAt_required');
  if (networkState.runtimeNetworkProbe !== 'offline') {
    failedRules.push('networkState.runtimeNetworkProbe_offline_required');
  }
  if (!Array.isArray(networkState.notes)) failedRules.push('networkState.notes_array_required');

  if (!VALID_FIXTURE_PROFILES.includes(manifest.cacheFixtureProfile as OfflineFailureDrillCacheFixtureProfile)) {
    failedRules.push('cacheFixtureProfile_valid_required');
  }

  pushMissingArtifact(missingArtifacts, failedRules, 'cacheManifestPath', manifest.cacheManifestPath, options);
  pushMissingArtifact(missingArtifacts, failedRules, 'drillResultPath', manifest.drillResultPath, options);
  pushMissingArtifact(missingArtifacts, failedRules, 'offlineAssertionsPath', manifest.offlineAssertionsPath, options);
  pushMissingArtifact(missingArtifacts, failedRules, 'readinessMetadataPath', manifest.readinessMetadataPath, options);
  if (nonEmptyString(manifest.captureBundlePath)) {
    pushMissingArtifact(missingArtifacts, failedRules, 'captureBundlePath', manifest.captureBundlePath, options);
  }

  if (!Array.isArray(manifest.screenshotPaths) || manifest.screenshotPaths.length < 1) {
    failedRules.push('screenshotPaths.at_least_one_required');
  } else {
    manifest.screenshotPaths.forEach((filePath: unknown, index: number) => {
      pushMissingArtifact(missingArtifacts, failedRules, `screenshotPaths.${index}`, filePath, options);
    });
  }

  if (!Array.isArray(manifest.logPaths) || manifest.logPaths.length < 1) {
    failedRules.push('logPaths.at_least_one_required');
  } else {
    manifest.logPaths.forEach((filePath: unknown, index: number) => {
      pushMissingArtifact(missingArtifacts, failedRules, `logPaths.${index}`, filePath, options);
    });
  }

  const remote = isRecord(manifest.remoteAttemptSummary) ? manifest.remoteAttemptSummary : {};
  validateBooleanFalse(remote.providerUpdateSucceeded, failedRules, 'remoteAttemptSummary.providerUpdateSucceeded_must_be_false');
  validateBooleanFalse(remote.liveSyncSucceeded, failedRules, 'remoteAttemptSummary.liveSyncSucceeded_must_be_false');
  if (remote.weatherRefreshAttempted === true && remote.weatherRefreshSucceeded !== false) {
    failedRules.push('remoteAttemptSummary.weatherRefreshSucceeded_must_be_false_when_attempted');
  }
  if (remote.teamSyncAttempted === true && remote.teamSyncSucceeded !== false) {
    failedRules.push('remoteAttemptSummary.teamSyncSucceeded_must_be_false_when_attempted');
  }
  if (remote.dispatchReplaySucceeded === true && remote.dispatchReplayLocalOnly !== true) {
    failedRules.push('remoteAttemptSummary.dispatchReplaySucceeded_remote_sync_forbidden');
  }

  const resultSummary = isRecord(manifest.resultSummary) ? manifest.resultSummary : {};
  if (typeof resultSummary.capabilityCount !== 'number' || resultSummary.capabilityCount <= 0) {
    failedRules.push('resultSummary.capabilityCount_gt_zero_required');
  }
  if (!isRecord(resultSummary.statuses)) failedRules.push('resultSummary.statuses_required');
  if (!['blocked', 'evidence_ready', 'accepted'].includes(String(resultSummary.productionReadiness))) {
    failedRules.push('resultSummary.productionReadiness_valid_required');
  }

  if (!isRecord(manifest.artifacts)) {
    failedRules.push('artifacts_required');
  } else {
    if (!nonEmptyString(manifest.artifacts.directory)) failedRules.push('artifacts.directory_required');
    if (!nonEmptyString(manifest.artifacts.manifestPath)) failedRules.push('artifacts.manifestPath_required');
  }
  if (!Array.isArray(manifest.validationNotes)) failedRules.push('validationNotes_array_required');
  if (!booleanValue(ownerAcceptance.accepted)) failedRules.push('ownerAcceptance.accepted_boolean_required');
  if (!Array.isArray(ownerAcceptance.notes)) failedRules.push('ownerAcceptance.notes_array_required');

  if (evidenceSource !== 'real') blockers.push('android_evidence_source_not_real');
  if (!ownerAccepted) blockers.push('owner_acceptance_missing');

  const structurallyValid = failedRules.length === 0;
  const productionEligible = structurallyValid && ownerAccepted && evidenceSource === 'real';

  return {
    structurallyValid,
    productionEligible,
    evidenceId: nonEmptyString(manifest.evidenceId) ? manifest.evidenceId : null,
    evidenceKind: nonEmptyString(manifest.evidenceKind) ? manifest.evidenceKind : null,
    evidenceSource: ['real', 'fixture', 'synthetic'].includes(String(evidenceSource)) ? evidenceSource : 'unknown',
    ownerAccepted,
    failedRules,
    missingArtifacts,
    blockers: [...blockers, ...(!structurallyValid ? ['android_evidence_manifest_invalid'] : [])],
    validationNotes: Array.isArray(manifest.validationNotes)
      ? manifest.validationNotes.map((note: unknown) => String(note))
      : [],
  };
}

export function validateOfflineFailureDrillCacheFixtureManifest(
  fixture: unknown,
): OfflineFailureDrillCacheFixtureValidationResult {
  const errors: string[] = [];
  if (!isRecord(fixture)) {
    return { valid: false, errors: ['fixture_malformed'] };
  }
  if (!nonEmptyString(fixture.fixtureId)) errors.push('fixtureId_required');
  if (!VALID_FIXTURE_PROFILES.includes(fixture.profile as OfflineFailureDrillCacheFixtureProfile)) {
    errors.push('profile_valid_required');
  }
  if (!nonEmptyString(fixture.generatedAt)) errors.push('generatedAt_required');
  if (!Array.isArray(fixture.inputs) || fixture.inputs.length === 0) {
    errors.push('inputs_required');
  } else {
    fixture.inputs.forEach((input: unknown, index: number) => {
      if (!isRecord(input)) {
        errors.push(`inputs.${index}.object_required`);
        return;
      }
      if (!nonEmptyString(input.inputId)) errors.push(`inputs.${index}.inputId_required`);
      if (!VALID_SOURCE_TYPES.includes(input.sourceType as OfflineDrillProbeSourceType)) {
        errors.push(`inputs.${index}.sourceType_valid_required`);
      }
      if (typeof input.present !== 'boolean') errors.push(`inputs.${index}.present_boolean_required`);
      if (!VALID_FRESHNESS.includes(input.freshness as OfflineDrillProbeFreshness)) {
        errors.push(`inputs.${index}.freshness_valid_required`);
      }
      if (!Array.isArray(input.notes)) errors.push(`inputs.${index}.notes_array_required`);
    });
  }
  return { valid: errors.length === 0, errors };
}

export function buildOfflineFailureDrillRuntimeNetworkEvidence(input: {
  checkedAt?: string;
  connectivityState?: string | null;
  providerReachability?: OfflineFailureDrillRuntimeNetworkEvidence['providerReachability'];
  notes?: string[];
} = {}): OfflineFailureDrillRuntimeNetworkEvidence {
  const checkedAt = input.checkedAt ?? new Date().toISOString();
  const state = String(input.connectivityState ?? '').trim().toLowerCase();
  if (state === 'offline') {
    return {
      checkedAt,
      appObservedOffline: true,
      runtimeNetworkProbe: 'offline',
      providerReachability: input.providerReachability ?? 'not_checked_due_to_offline',
      notes: input.notes ?? ['Runtime connectivity state reported offline.'],
    };
  }
  if (state === 'online') {
    return {
      checkedAt,
      appObservedOffline: false,
      runtimeNetworkProbe: 'online',
      providerReachability: input.providerReachability ?? 'reachable',
      notes: input.notes ?? ['Runtime connectivity state reported online.'],
    };
  }
  return {
    checkedAt,
    appObservedOffline: false,
    runtimeNetworkProbe: state ? 'unknown' : 'unavailable',
    providerReachability: input.providerReachability ?? 'unknown',
    notes: input.notes ?? ['Runtime connectivity state unavailable for no-network assertion.'],
  };
}
