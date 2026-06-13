import {
  buildOfflineFailureDrillRuntimeNetworkEvidence,
  type OfflineDrillProbeEvidence,
  type OfflineDrillProbeFreshness,
  type OfflineDrillProbeResult,
  type OfflineDrillProbeSourceType,
  type OfflineFailureDrillAndroidEvidenceManifest,
  type OfflineFailureDrillCacheFixtureInput,
  type OfflineFailureDrillCacheFixtureManifest,
  type OfflineFailureDrillRuntimeNetworkEvidence,
} from './offlineFailureDrillEvidence';

export type {
  OfflineDrillProbeEvidence,
  OfflineDrillProbeFreshness,
  OfflineDrillProbeResult,
  OfflineDrillProbeSourceType,
  OfflineFailureDrillAndroidEvidenceManifest,
  OfflineFailureDrillCacheFixtureManifest,
  OfflineFailureDrillRuntimeNetworkEvidence,
} from './offlineFailureDrillEvidence';

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
  corruptInputs?: string[];
  probeEvidence?: OfflineDrillProbeEvidence[];
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
  runtimeNetworkEvidence?: OfflineFailureDrillRuntimeNetworkEvidence | null;
  capabilities?: Partial<Record<OfflineDrillCapabilityId, OfflineDrillCapabilityProbe>> | null;
  androidEvidence?: OfflineDrillAndroidEvidence | null;
  androidEvidenceManifest?: OfflineFailureDrillAndroidEvidenceManifest | null;
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
  androidEvidenceManifest?: OfflineFailureDrillAndroidEvidenceManifest | null;
}

export type OfflineDrillDownloadPriority = 'required' | 'recommended' | 'optional';

export type OfflineDrillDownloadActionType =
  | 'download_route_geometry'
  | 'download_route_tiles'
  | 'refresh_weather_packet'
  | 'download_camp_packet'
  | 'save_field_protocols'
  | 'save_recovery_docs'
  | 'verify_dispatch_queue'
  | 'prepare_credential_restore'
  | 'save_command_brief_snapshot'
  | 'refresh_cache_manifest';

export interface OfflineDrillRecommendedDownload {
  downloadId: string;
  label: string;
  reason: string;
  capabilityIds: OfflineDrillCapabilityId[];
  inputIds: string[];
  priority: OfflineDrillDownloadPriority;
  actionType: OfflineDrillDownloadActionType;
  canStartNow: boolean;
  unavailableReason?: string;
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
  probeEvidence: OfflineDrillProbeEvidence[];
  recommendedDownloads: OfflineDrillRecommendedDownload[];
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
  runtimeNetworkEvidence: OfflineFailureDrillRuntimeNetworkEvidence;
  capabilities: OfflineDrillCapabilityResult[];
  recommendedDownloads: OfflineDrillRecommendedDownload[];
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

const PROBE_SOURCE_TYPES: Record<string, OfflineDrillProbeSourceType> = {
  route_geometry: 'local_route_geometry',
  route_tiles: 'tile_cache',
  route_cache: 'route_cache',
  saved_route: 'route_cache',
  camp_packet: 'camp_cache',
  camp_cache: 'camp_cache',
  weather_packet: 'weather_cache',
  field_protocols: 'local_protocol_doc',
  recovery_docs: 'recovery_doc',
  dispatch_queue_persistence: 'dispatch_queue',
  fresh_dispatch_state: 'dispatch_queue',
  credential_restore_material: 'credential_restore',
  command_brief_snapshot: 'offline_profile',
  incident_protocols: 'local_protocol_doc',
  coordinate_tools: 'local_protocol_doc',
  cache_manifest: 'cache_manifest',
  source_timestamps: 'cache_manifest',
};

const DOWNLOAD_DEFINITIONS: Partial<Record<string, {
  label: string;
  actionType: OfflineDrillDownloadActionType;
  priority: OfflineDrillDownloadPriority;
}>> = {
  route_geometry: {
    label: 'Download route geometry',
    actionType: 'download_route_geometry',
    priority: 'required',
  },
  route_cache: {
    label: 'Refresh route cache',
    actionType: 'download_route_geometry',
    priority: 'required',
  },
  saved_route: {
    label: 'Save route for offline use',
    actionType: 'download_route_geometry',
    priority: 'required',
  },
  route_tiles: {
    label: 'Download route tiles',
    actionType: 'download_route_tiles',
    priority: 'recommended',
  },
  camp_packet: {
    label: 'Download camp packet',
    actionType: 'download_camp_packet',
    priority: 'required',
  },
  camp_cache: {
    label: 'Download camp packet',
    actionType: 'download_camp_packet',
    priority: 'required',
  },
  weather_packet: {
    label: 'Refresh weather packet',
    actionType: 'refresh_weather_packet',
    priority: 'recommended',
  },
  field_protocols: {
    label: 'Download field protocols',
    actionType: 'save_field_protocols',
    priority: 'required',
  },
  incident_protocols: {
    label: 'Download incident protocols',
    actionType: 'save_field_protocols',
    priority: 'required',
  },
  coordinate_tools: {
    label: 'Download coordinate tools',
    actionType: 'save_field_protocols',
    priority: 'required',
  },
  recovery_docs: {
    label: 'Download recovery docs',
    actionType: 'save_recovery_docs',
    priority: 'required',
  },
  dispatch_queue_persistence: {
    label: 'Verify Dispatch queue persistence',
    actionType: 'verify_dispatch_queue',
    priority: 'required',
  },
  fresh_dispatch_state: {
    label: 'Verify Dispatch queue persistence',
    actionType: 'verify_dispatch_queue',
    priority: 'optional',
  },
  credential_restore_material: {
    label: 'Refresh credential restore material',
    actionType: 'prepare_credential_restore',
    priority: 'required',
  },
  command_brief_snapshot: {
    label: 'Save Command Brief snapshot',
    actionType: 'save_command_brief_snapshot',
    priority: 'required',
  },
  cache_manifest: {
    label: 'Refresh cache manifest',
    actionType: 'refresh_cache_manifest',
    priority: 'required',
  },
  source_timestamps: {
    label: 'Refresh source timestamps',
    actionType: 'refresh_cache_manifest',
    priority: 'required',
  },
};

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

function redactSecretText(value: string): string {
  return value
    .replace(/((?:token|secret|password|restore[_ -]?code|api[_ -]?key|credential)[^:=]*[:=]\s*)[^\s,;]+/gi, '$1[redacted]')
    .replace(/\b(?:super-secret-token|restore-code-123)\b/gi, '[redacted]');
}

function sanitizeNotes(notes: unknown): string[] {
  if (!Array.isArray(notes)) return [];
  return notes.map((note) => redactSecretText(String(note)));
}

function sourceTypeForInput(inputId: string): OfflineDrillProbeSourceType {
  return PROBE_SOURCE_TYPES[inputId] ?? 'unknown';
}

function normalizeProbeEvidence(
  evidence: OfflineDrillProbeEvidence,
  definition: CapabilityDefinition,
  checkedAt: string,
): OfflineDrillProbeEvidence {
  return {
    probeId: evidence.probeId || `${definition.capabilityId}_${evidence.inputId}_probe`,
    capabilityId: definition.capabilityId,
    inputId: evidence.inputId,
    sourceType: evidence.sourceType ?? sourceTypeForInput(evidence.inputId),
    localOnly: true,
    checkedAt: evidence.checkedAt || checkedAt,
    lastCachedAt: evidence.lastCachedAt,
    freshness: evidence.freshness ?? 'unavailable',
    result: evidence.result ?? 'unavailable',
    notes: sanitizeNotes(evidence.notes),
  };
}

function synthesizeProbeEvidence(
  definition: CapabilityDefinition,
  inputId: string,
  probe: OfflineDrillCapabilityProbe,
  checkedAt: string,
): OfflineDrillProbeEvidence {
  const available = new Set(probe.availableInputs ?? []);
  const missing = new Set(probe.missingInputs ?? []);
  const stale = new Set(probe.staleInputs ?? []);
  const invalid = new Set([...(probe.invalidInputs ?? []), ...(probe.corruptInputs ?? [])]);
  let freshness: OfflineDrillProbeFreshness = 'unavailable';
  let result: OfflineDrillProbeResult = 'missing';
  if (invalid.has(inputId)) {
    result = 'corrupt';
    freshness = 'unavailable';
  } else if (stale.has(inputId)) {
    result = 'stale';
    freshness = 'stale';
  } else if (available.has(inputId)) {
    result = 'valid';
    freshness = 'current';
  } else if (missing.has(inputId)) {
    result = 'missing';
    freshness = 'unavailable';
  }

  return {
    probeId: `${definition.capabilityId}_${inputId}_probe`,
    capabilityId: definition.capabilityId,
    inputId,
    sourceType: sourceTypeForInput(inputId),
    localOnly: true,
    checkedAt,
    lastCachedAt: probe.lastCachedAt ?? undefined,
    freshness,
    result,
    notes: [`Local-only probe for ${inputId}: ${result}.`],
  };
}

function buildProbeEvidence(
  definition: CapabilityDefinition,
  probe: OfflineDrillCapabilityProbe,
  checkedAt: string,
): OfflineDrillProbeEvidence[] {
  const explicit = (probe.probeEvidence ?? []).map((item) => normalizeProbeEvidence(item, definition, checkedAt));
  const explicitKeys = new Set(explicit.map((item) => item.inputId));
  const inputIds = dedupe([
    ...definition.requiredInputs,
    ...definition.partialInputs,
    ...(probe.requiredInputs ?? []),
    ...(probe.availableInputs ?? []),
    ...(probe.missingInputs ?? []),
    ...(probe.staleInputs ?? []),
    ...(probe.invalidInputs ?? []),
    ...(probe.corruptInputs ?? []),
  ]);
  const synthesized = inputIds
    .filter((inputId) => !explicitKeys.has(inputId))
    .map((inputId) => synthesizeProbeEvidence(definition, inputId, probe, checkedAt));
  return [...explicit, ...synthesized];
}

function evidenceInputs(
  probeEvidence: OfflineDrillProbeEvidence[],
  predicate: (probe: OfflineDrillProbeEvidence) => boolean,
): string[] {
  return dedupe(probeEvidence.filter(predicate).map((probe) => probe.inputId));
}

function mergeRecommendedDownloads(downloads: OfflineDrillRecommendedDownload[]): OfflineDrillRecommendedDownload[] {
  const byActionAndLabel = new Map<string, OfflineDrillRecommendedDownload>();
  for (const download of downloads) {
    const key = `${download.actionType}:${download.label}`;
    const existing = byActionAndLabel.get(key);
    if (!existing) {
      byActionAndLabel.set(key, {
        ...download,
        capabilityIds: dedupe(download.capabilityIds) as OfflineDrillCapabilityId[],
        inputIds: dedupe(download.inputIds),
      });
      continue;
    }
    existing.capabilityIds = dedupe([
      ...existing.capabilityIds,
      ...download.capabilityIds,
    ]) as OfflineDrillCapabilityId[];
    existing.inputIds = dedupe([...existing.inputIds, ...download.inputIds]);
    if (download.priority === 'required') existing.priority = 'required';
  }
  return Array.from(byActionAndLabel.values());
}

function missingRequiredInputs(definition: CapabilityDefinition, probe: OfflineDrillCapabilityProbe): string[] {
  const available = new Set((probe.availableInputs ?? []).map((item) => item.trim()).filter(Boolean));
  const stale = new Set((probe.staleInputs ?? []).map((item) => item.trim()).filter(Boolean));
  const invalid = new Set([...(probe.invalidInputs ?? []), ...(probe.corruptInputs ?? [])].map((item) => item.trim()).filter(Boolean));
  const explicitMissing = probe.missingInputs ?? [];
  const inferredMissing = definition.requiredInputs.filter(
    (input) => !available.has(input) && !stale.has(input) && !invalid.has(input),
  );
  return dedupe([...explicitMissing, ...(probe.invalidInputs ?? []), ...(probe.corruptInputs ?? []), ...inferredMissing])
    .filter((input) => definition.requiredInputs.includes(input) || input === 'credential_restore_material');
}

function nonCriticalMissingInputs(definition: CapabilityDefinition, probe: OfflineDrillCapabilityProbe): string[] {
  const missing = new Set(probe.missingInputs ?? []);
  return definition.partialInputs.filter((input) => missing.has(input));
}

function recommendedDownloadsFor(
  definition: CapabilityDefinition,
  inputs: string[],
  stale: boolean,
): OfflineDrillRecommendedDownload[] {
  const downloads: OfflineDrillRecommendedDownload[] = [];
  for (const inputId of dedupe(inputs)) {
    const definitionForInput = DOWNLOAD_DEFINITIONS[inputId];
    if (!definitionForInput) continue;
    let label = definitionForInput.label;
    if (stale && label.startsWith('Download ') && definitionForInput.actionType !== 'download_camp_packet') {
      label = label.replace('Download ', 'Refresh ');
    }
    if (stale && label.startsWith('Save ')) label = label.replace('Save ', 'Refresh ');
    downloads.push({
      downloadId: `${definition.capabilityId}_${definitionForInput.actionType}_${inputId}`,
      label,
      reason: stale
        ? `${inputId.replace(/_/g, ' ')} is stale or expired in the local cache.`
        : `${inputId.replace(/_/g, ' ')} is missing, corrupt, unavailable, or not locally verified.`,
      capabilityIds: [definition.capabilityId],
      inputIds: [inputId],
      priority: stale && definitionForInput.priority === 'required' ? 'recommended' : definitionForInput.priority,
      actionType: definitionForInput.actionType,
      canStartNow: true,
    });
  }
  return mergeRecommendedDownloads(downloads);
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
    return 'Pending Dispatch replay is queued locally; local queue only. Not confirmed by source of truth until network acceptance.';
  }

  if (result.status === 'available_offline') {
    return `${definition.capabilityName} is available from local cache with verified local inputs.`;
  }

  if (result.status === 'partially_available') {
    return `${definition.capabilityName} has core local context, but ${result.missingInputs.join(', ')} should be prepared before departure.`;
  }

  if (result.status === 'cached_but_stale') {
    return `${definition.capabilityName} has cached data, but ${result.staleInputs.join(', ')} is stale or cannot be verified current.`;
  }

  if (result.status === 'manual_fallback_required') {
    return `${definition.capabilityName} has local documents or protocols; manual fallback required because automated app behavior is unsupported offline.`;
  }

  return `Missing required local inputs for ${definition.capabilityName}: ${result.missingInputs.join(', ')}.`;
}

function buildCapabilityResult(
  definition: CapabilityDefinition,
  probe: OfflineDrillCapabilityProbe | null | undefined,
  checkedAt: string,
): OfflineDrillCapabilityResult {
  const effectiveProbe = probe ?? {};
  const initialProbeEvidence = buildProbeEvidence(definition, effectiveProbe, checkedAt);
  const evidenceMissingInputs = evidenceInputs(initialProbeEvidence, (item) =>
    ['missing', 'corrupt', 'unavailable'].includes(item.result));
  const evidenceStaleInputs = evidenceInputs(initialProbeEvidence, (item) =>
    ['stale', 'expired'].includes(item.result) || ['stale', 'expired'].includes(item.freshness));
  const evidenceInvalidInputs = evidenceInputs(initialProbeEvidence, (item) =>
    ['corrupt', 'unavailable'].includes(item.result));
  const enrichedProbe: OfflineDrillCapabilityProbe = {
    ...effectiveProbe,
    missingInputs: dedupe([...(effectiveProbe.missingInputs ?? []), ...evidenceMissingInputs]),
    staleInputs: dedupe([...(effectiveProbe.staleInputs ?? []), ...evidenceStaleInputs]),
    invalidInputs: dedupe([...(effectiveProbe.invalidInputs ?? []), ...evidenceInvalidInputs]),
  };
  const probeEvidence = buildProbeEvidence(definition, enrichedProbe, checkedAt);
  const requiredInputs = effectiveProbe.requiredInputs ?? definition.requiredInputs;
  const missingRequired = missingRequiredInputs({ ...definition, requiredInputs }, enrichedProbe);
  const partialMissing = nonCriticalMissingInputs(definition, enrichedProbe);
  const staleInputs = dedupe(enrichedProbe.staleInputs ?? []);
  const missingInputs = dedupe([...missingRequired, ...partialMissing]);
  const status = classifyCapability({ ...definition, requiredInputs }, enrichedProbe);
  const staleRecommendations = recommendedDownloadsFor(definition, staleInputs, true);
  const missingRecommendations = recommendedDownloadsFor(definition, missingInputs, false);
  const availableInputs = dedupe(enrichedProbe.availableInputs ?? []);
  const baseResult = {
    capabilityId: definition.capabilityId,
    capabilityName: definition.capabilityName,
    status,
    requiredInputs,
    availableInputs,
    missingInputs,
    staleInputs,
    lastCachedAt: enrichedProbe.lastCachedAt ?? null,
    sourceOfTruth: enrichedProbe.sourceOfTruth ?? definition.sourceOfTruth,
    probeEvidence,
    recommendedDownloads: mergeRecommendedDownloads([...missingRecommendations, ...staleRecommendations]),
  };

  return {
    ...baseResult,
    userMessage: enrichedProbe.userMessage ?? buildUserMessage(definition, baseResult),
  };
}

function buildProductionReadiness(
  input: OfflineFailureDrillInput,
  runtimeNetworkEvidence: OfflineFailureDrillRuntimeNetworkEvidence,
): OfflineDrillProductionReadiness {
  const blockers: string[] = [];

  if (
    runtimeNetworkEvidence.appObservedOffline !== true ||
    runtimeNetworkEvidence.runtimeNetworkProbe !== 'offline'
  ) {
    blockers.push('runtime_no_network_confirmation_missing');
  }

  if (!input.androidEvidenceManifest) blockers.push('android_evidence_manifest_missing');

  if (!input.androidEvidenceManifest) {
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
      'Validated Android evidence manifest',
      'Production owner decision',
    ],
  };
}

export function buildOfflineFailureDrill(input: OfflineFailureDrillInput = {}): OfflineFailureDrillResult {
  const evaluatedAt = nowIso(input.now);
  const readiness: OfflineDrillReadiness = 'current_user_facing_extension';
  const enabled = input.featureFlags?.offlineFailureDrill !== false;
  const runtimeNetworkEvidence = input.runtimeNetworkEvidence ?? buildOfflineFailureDrillRuntimeNetworkEvidence({
    checkedAt: evaluatedAt,
    connectivityState: input.noNetworkModeVerified === true ? 'offline' : null,
  });
  const productionReadiness = buildProductionReadiness(input, runtimeNetworkEvidence);

  if (!enabled) {
    return {
      enabled: false,
      readiness,
      evaluatedAt,
      localOnly: true,
      runtimeNetworkEvidence,
      capabilities: [],
      recommendedDownloads: [],
      warnings: [],
      productionReadiness,
    };
  }

  const capabilities = OFFLINE_DRILL_CAPABILITY_ORDER.map((capabilityId) => buildCapabilityResult(
    CAPABILITY_DEFINITIONS[capabilityId],
    input.capabilities?.[capabilityId],
    evaluatedAt,
  ));
  const warnings = runtimeNetworkEvidence.runtimeNetworkProbe === 'offline' && runtimeNetworkEvidence.appObservedOffline === true
    ? []
    : ['No-network mode was not verified inside the app/runtime.'];

  return {
    enabled: true,
    readiness,
    evaluatedAt,
    localOnly: true,
    runtimeNetworkEvidence,
    capabilities,
    recommendedDownloads: mergeRecommendedDownloads(capabilities.flatMap((capability) => capability.recommendedDownloads)),
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
    androidEvidenceManifest: input.androidEvidenceManifest,
    runtimeNetworkEvidence: buildOfflineFailureDrillRuntimeNetworkEvidence({
      checkedAt: nowIso(input.now),
      connectivityState: input.connectivityState,
    }),
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

function fixtureInputResult(input: OfflineFailureDrillCacheFixtureInput): OfflineDrillProbeResult {
  if (input.corrupt === true) return 'corrupt';
  if (input.present !== true) return 'missing';
  if (input.freshness === 'expired') return 'expired';
  if (input.freshness === 'stale') return 'stale';
  if (input.freshness === 'unavailable') return 'unavailable';
  return 'valid';
}

function fixtureCapabilityProbe(
  definition: CapabilityDefinition,
  fixture: OfflineFailureDrillCacheFixtureManifest,
  checkedAt: string,
): OfflineDrillCapabilityProbe {
  const byInputId = new Map(fixture.inputs.map((input) => [input.inputId, input]));
  const inputIds = dedupe([...definition.requiredInputs, ...definition.partialInputs]);
  const availableInputs: string[] = [];
  const missingInputs: string[] = [];
  const staleInputs: string[] = [];
  const invalidInputs: string[] = [];
  const probeEvidence: OfflineDrillProbeEvidence[] = [];

  for (const inputId of inputIds) {
    const fixtureInput = byInputId.get(inputId) ?? {
      inputId,
      sourceType: sourceTypeForInput(inputId),
      present: false,
      freshness: 'unavailable' as OfflineDrillProbeFreshness,
      notes: ['Fixture omitted this local input.'],
    };
    const result = fixtureInputResult(fixtureInput);
    if (result === 'valid' || result === 'present') availableInputs.push(inputId);
    if (result === 'stale' || result === 'expired') staleInputs.push(inputId);
    if (result === 'missing' || result === 'unavailable') missingInputs.push(inputId);
    if (result === 'corrupt') invalidInputs.push(inputId);
    probeEvidence.push({
      probeId: `${fixture.fixtureId}_${definition.capabilityId}_${inputId}`,
      capabilityId: definition.capabilityId,
      inputId,
      sourceType: fixtureInput.sourceType,
      localOnly: true,
      checkedAt,
      lastCachedAt: fixtureInput.lastCachedAt,
      freshness: fixtureInput.freshness,
      result,
      notes: sanitizeNotes(fixtureInput.notes),
    });
  }

  const lastCachedAt = fixture.inputs
    .map((input) => input.lastCachedAt)
    .find((value): value is string => typeof value === 'string' && value.length > 0) ?? null;

  return {
    availableInputs,
    missingInputs,
    staleInputs,
    invalidInputs,
    probeEvidence,
    lastCachedAt,
    sourceOfTruth: `offline_failure_drill_cache_fixture:${fixture.profile}`,
    manualFallbackRequired: fixture.profile === 'manual_fallback' && definition.capabilityId === 'field_utilities',
  };
}

export function buildOfflineFailureDrillFromCacheFixture(
  fixture: OfflineFailureDrillCacheFixtureManifest,
  options: {
    now?: string;
    noNetworkModeVerified?: boolean;
    androidEvidenceManifest?: OfflineFailureDrillAndroidEvidenceManifest | null;
  } = {},
): OfflineFailureDrillResult {
  const checkedAt = nowIso(options.now);
  const capabilities = Object.fromEntries(OFFLINE_DRILL_CAPABILITY_ORDER.map((capabilityId) => [
    capabilityId,
    fixtureCapabilityProbe(CAPABILITY_DEFINITIONS[capabilityId], fixture, checkedAt),
  ])) as Partial<Record<OfflineDrillCapabilityId, OfflineDrillCapabilityProbe>>;

  return buildOfflineFailureDrill({
    now: checkedAt,
    featureFlags: { offlineFailureDrill: true },
    noNetworkModeVerified: options.noNetworkModeVerified === true,
    runtimeNetworkEvidence: buildOfflineFailureDrillRuntimeNetworkEvidence({
      checkedAt,
      connectivityState: options.noNetworkModeVerified === true ? 'offline' : null,
    }),
    androidEvidenceManifest: options.androidEvidenceManifest ?? null,
    capabilities,
  });
}

export class OfflineDrillService {
  run(input: OfflineFailureDrillInput = {}): OfflineFailureDrillResult {
    return buildOfflineFailureDrill(input);
  }
}
