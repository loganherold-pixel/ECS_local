import type {
  OfflineDrillCapabilityStatus,
  OfflineFailureDrillResult,
} from './offlineFailureDrillService';
import type {
  OfflineFailureDrillAndroidEvidenceManifest,
  OfflineFailureDrillCacheFixtureProfile,
  OfflineFailureDrillEvidenceSource,
  OfflineFailureDrillRuntimeNetworkEvidence,
} from './offlineFailureDrillEvidence';
import type {
  ExpeditionDepartureAuditItem,
  ExpeditionReadinessAssessment,
  ExpeditionReadinessCategory,
  ExpeditionReadinessConfidence,
  ExpeditionReadinessDataIntegrity,
  ExpeditionReadinessFreshnessRecord,
  ExpeditionReadinessIssue,
  ExpeditionReadinessProfile,
  ExpeditionReadinessStatus,
  ExpeditionTripIntent,
  ExpeditionTripIntentSource,
} from './readiness/expeditionReadinessTypes';

export type OfflineFailureDrillEvidenceCaptureSource =
  | 'app_runtime_export'
  | 'fixture_harness';

export type OfflineFailureDrillEvidenceCaptureVersion = 1;

export interface OfflineFailureDrillEvidenceCaptureApp {
  appBuildId?: string | null;
  appVersion?: string | null;
  gitSha?: string | null;
  bundleId?: string | null;
}

export interface OfflineFailureDrillEvidenceCapturePlatform {
  os: 'android' | 'ios' | 'web' | 'unknown';
  deviceName?: string | null;
  emulatorName?: string | null;
  osVersion?: string | null;
  apiLevel?: string | number | null;
}

export interface OfflineFailureDrillResultSummary {
  capabilityCount: number;
  statuses: Record<OfflineDrillCapabilityStatus, number>;
  productionReadiness: 'blocked' | 'evidence_ready' | 'accepted';
}

export interface OfflineFailureDrillOfflineAssertions extends OfflineFailureDrillRuntimeNetworkEvidence {
  systemNetworkDisabled: boolean | null;
  source: OfflineFailureDrillEvidenceCaptureSource;
}

export interface OfflineFailureDrillReadinessFreshnessMetadata {
  state: ExpeditionReadinessFreshnessRecord['state'];
  source: ExpeditionReadinessFreshnessRecord['source'];
  updatedAt: string | null;
  label: string;
  isStale: boolean;
  isMissing: boolean;
  isMock: boolean;
  isDemo: boolean;
  isInferred: boolean;
  detail?: string | null;
}

export interface OfflineFailureDrillReadinessCategoryMetadata {
  id: ExpeditionReadinessCategory['id'];
  label: string;
  score: number;
  status: ExpeditionReadinessStatus;
  confidence: ExpeditionReadinessConfidence;
  summary: string;
  missingInputs: string[];
  lastUpdatedAt: string;
}

export interface OfflineFailureDrillReadinessIssueMetadata {
  id: string;
  categoryId: ExpeditionReadinessIssue['categoryId'];
  label: string;
  detail: string;
  severity: ExpeditionReadinessIssue['severity'];
}

export interface OfflineFailureDrillReadinessMetadata {
  captured: boolean;
  tripIntent: ExpeditionTripIntent | null;
  tripIntentSource: ExpeditionTripIntentSource | 'unknown';
  readinessProfile: ExpeditionReadinessProfile | null;
  status: ExpeditionReadinessStatus | 'unavailable';
  confidence: ExpeditionReadinessConfidence | 'unknown';
  overallScore: number | null;
  updatedAt: string | null;
  sourceFreshness: Partial<Record<keyof ExpeditionReadinessAssessment['sourceFreshness'], OfflineFailureDrillReadinessFreshnessMetadata>>;
  categories: OfflineFailureDrillReadinessCategoryMetadata[];
  blockers: OfflineFailureDrillReadinessIssueMetadata[];
  warnings: OfflineFailureDrillReadinessIssueMetadata[];
  recommendations: string[];
  departureAudit: ExpeditionDepartureAuditItem[];
  dataIntegrity: ExpeditionReadinessDataIntegrity | null;
  notes: string[];
}

export interface OfflineFailureDrillEvidenceCaptureBundle {
  captureVersion: OfflineFailureDrillEvidenceCaptureVersion;
  captureId: string;
  capturedAt: string;
  source: OfflineFailureDrillEvidenceCaptureSource;
  evidenceSource: OfflineFailureDrillEvidenceSource;
  cacheFixtureProfile: OfflineFailureDrillCacheFixtureProfile;
  app: OfflineFailureDrillEvidenceCaptureApp;
  platform: OfflineFailureDrillEvidenceCapturePlatform;
  offlineAssertions: OfflineFailureDrillOfflineAssertions;
  resultSummary: OfflineFailureDrillResultSummary;
  drillResult: OfflineFailureDrillResult;
  readinessMetadata: OfflineFailureDrillReadinessMetadata;
  productionReadiness: OfflineFailureDrillResult['productionReadiness'];
  validationNotes: string[];
}

export interface OfflineFailureDrillEvidenceCaptureInput {
  captureId?: string;
  capturedAt?: string;
  source?: OfflineFailureDrillEvidenceCaptureSource;
  evidenceSource?: OfflineFailureDrillEvidenceSource;
  cacheFixtureProfile?: OfflineFailureDrillCacheFixtureProfile | null;
  systemNetworkDisabled?: boolean | null;
  drillResult: OfflineFailureDrillResult;
  readinessAssessment?: ExpeditionReadinessAssessment | null;
  app?: OfflineFailureDrillEvidenceCaptureApp | null;
  platform?: Partial<OfflineFailureDrillEvidenceCapturePlatform> | null;
  validationNotes?: string[] | null;
}

export interface OfflineFailureDrillCaptureArtifactPayload {
  fileName: string;
  filePath: string;
  body: string;
}

export interface OfflineFailureDrillCaptureArtifactPayloads {
  captureBundle: OfflineFailureDrillCaptureArtifactPayload;
  drillResult: OfflineFailureDrillCaptureArtifactPayload;
  offlineAssertions: OfflineFailureDrillCaptureArtifactPayload;
  readinessMetadata: OfflineFailureDrillCaptureArtifactPayload;
}

export interface OfflineFailureDrillCaptureArtifactOptions {
  artifactDir: string;
  captureBundleFileName?: string;
  drillResultFileName?: string;
  offlineAssertionsFileName?: string;
  readinessMetadataFileName?: string;
}

export interface OfflineFailureDrillManifestFromCaptureOptions extends OfflineFailureDrillCaptureArtifactOptions {
  manifestPath: string;
  evidenceId?: string;
  evidenceKind?: OfflineFailureDrillAndroidEvidenceManifest['evidenceKind'];
  evidenceSource?: OfflineFailureDrillEvidenceSource;
  cacheManifestPath: string;
  captureBundlePath?: string;
  drillResultPath?: string;
  offlineAssertionsPath?: string;
  readinessMetadataPath?: string;
  screenshotPaths?: string[];
  logPaths?: string[];
  systemNetworkDisabled?: boolean | null;
  remoteAttemptSummary?: Partial<OfflineFailureDrillAndroidEvidenceManifest['remoteAttemptSummary']>;
  ownerAcceptance?: OfflineFailureDrillAndroidEvidenceManifest['ownerAcceptance'];
  app?: Partial<OfflineFailureDrillAndroidEvidenceManifest['app']>;
  platform?: Partial<OfflineFailureDrillAndroidEvidenceManifest['platform']>;
}

const EMPTY_STATUS_COUNTS: Record<OfflineDrillCapabilityStatus, number> = {
  available_offline: 0,
  partially_available: 0,
  cached_but_stale: 0,
  unavailable: 0,
  manual_fallback_required: 0,
};

function nowIso(): string {
  return new Date().toISOString();
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function sanitizeNotes(notes: unknown): string[] {
  if (!Array.isArray(notes)) return [];
  return notes
    .map((note) => cleanString(note))
    .filter((note): note is string => Boolean(note));
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function joinArtifactPath(directory: string, fileName: string): string {
  const separator = directory.includes('\\') && !directory.includes('/') ? '\\' : '/';
  return `${directory.replace(/[\\/]$/, '')}${separator}${fileName}`;
}

function readinessFreshnessMetadata(
  record: ExpeditionReadinessFreshnessRecord,
): OfflineFailureDrillReadinessFreshnessMetadata {
  return {
    state: record.state,
    source: record.source,
    updatedAt: record.updatedAt,
    label: record.label,
    isStale: record.isStale,
    isMissing: record.isMissing,
    isMock: record.isMock,
    isDemo: record.isDemo,
    isInferred: record.isInferred,
    detail: record.detail ?? null,
  };
}

function readinessCategoryMetadata(
  category: ExpeditionReadinessCategory,
): OfflineFailureDrillReadinessCategoryMetadata {
  return {
    id: category.id,
    label: category.label,
    score: category.score,
    status: category.status,
    confidence: category.confidence,
    summary: category.summary,
    missingInputs: [...category.missingInputs],
    lastUpdatedAt: category.lastUpdatedAt,
  };
}

function readinessIssueMetadata(
  issue: ExpeditionReadinessIssue,
): OfflineFailureDrillReadinessIssueMetadata {
  return {
    id: issue.id,
    categoryId: issue.categoryId,
    label: issue.label,
    detail: issue.detail,
    severity: issue.severity,
  };
}

function buildReadinessMetadata(
  assessment: ExpeditionReadinessAssessment | null | undefined,
): OfflineFailureDrillReadinessMetadata {
  if (!assessment) {
    return {
      captured: false,
      tripIntent: null,
      tripIntentSource: 'unknown',
      readinessProfile: null,
      status: 'unavailable',
      confidence: 'unknown',
      overallScore: null,
      updatedAt: null,
      sourceFreshness: {},
      categories: [],
      blockers: [],
      warnings: [],
      recommendations: [],
      departureAudit: [],
      dataIntegrity: null,
      notes: ['Expedition readiness assessment was not supplied with this capture bundle.'],
    };
  }

  const sourceFreshness = Object.fromEntries(
    Object.entries(assessment.sourceFreshness).map(([key, record]) => [
      key,
      readinessFreshnessMetadata(record),
    ]),
  ) as OfflineFailureDrillReadinessMetadata['sourceFreshness'];

  return {
    captured: true,
    tripIntent: assessment.tripIntent,
    tripIntentSource: assessment.tripIntentSource,
    readinessProfile: assessment.readinessProfile,
    status: assessment.status,
    confidence: assessment.confidence,
    overallScore: assessment.overallScore,
    updatedAt: assessment.updatedAt,
    sourceFreshness,
    categories: assessment.categories.map(readinessCategoryMetadata),
    blockers: assessment.blockers.map(readinessIssueMetadata),
    warnings: assessment.warnings.map(readinessIssueMetadata),
    recommendations: [...assessment.recommendations],
    departureAudit: assessment.departureAudit.map((item) => ({ ...item })),
    dataIntegrity: { ...assessment.dataIntegrity },
    notes: ['Captured from the deterministic Expedition Readiness assessment already shown in the app.'],
  };
}

function inferCacheFixtureProfile(result: OfflineFailureDrillResult): OfflineFailureDrillCacheFixtureProfile {
  const statuses = result.capabilities.map((capability) => capability.status);
  if (statuses.some((status) => status === 'manual_fallback_required')) return 'manual_fallback';
  if (statuses.some((status) => status === 'unavailable')) return 'unavailable';
  if (statuses.some((status) => status === 'cached_but_stale')) return 'stale';
  if (statuses.some((status) => status === 'partially_available')) return 'partial';
  return 'available';
}

function productionReadinessFromResult(result: OfflineFailureDrillResult): OfflineFailureDrillResultSummary['productionReadiness'] {
  return result.productionReadiness.status === 'evidence_ready_for_owner_review'
    ? 'evidence_ready'
    : 'blocked';
}

export function summarizeOfflineFailureDrillResultForEvidence(
  result: OfflineFailureDrillResult,
): OfflineFailureDrillResultSummary {
  const statuses = { ...EMPTY_STATUS_COUNTS };
  for (const capability of result.capabilities) {
    statuses[capability.status] = (statuses[capability.status] ?? 0) + 1;
  }
  return {
    capabilityCount: result.capabilities.length,
    statuses,
    productionReadiness: productionReadinessFromResult(result),
  };
}

export function buildOfflineFailureDrillEvidenceCaptureBundle(
  input: OfflineFailureDrillEvidenceCaptureInput,
): OfflineFailureDrillEvidenceCaptureBundle {
  const capturedAt = input.capturedAt ?? input.drillResult.evaluatedAt ?? nowIso();
  const source = input.source ?? 'app_runtime_export';
  const runtime = input.drillResult.runtimeNetworkEvidence;
  return {
    captureVersion: 1,
    captureId: input.captureId ?? `offline-failure-drill-capture-${capturedAt.replace(/[^0-9A-Za-z]/g, '-')}`,
    capturedAt,
    source,
    evidenceSource: input.evidenceSource ?? (source === 'fixture_harness' ? 'fixture' : 'real'),
    cacheFixtureProfile: input.cacheFixtureProfile ?? inferCacheFixtureProfile(input.drillResult),
    app: {
      appBuildId: input.app?.appBuildId ?? null,
      appVersion: input.app?.appVersion ?? null,
      gitSha: input.app?.gitSha ?? null,
      bundleId: input.app?.bundleId ?? null,
    },
    platform: {
      os: input.platform?.os ?? 'unknown',
      deviceName: input.platform?.deviceName ?? null,
      emulatorName: input.platform?.emulatorName ?? null,
      osVersion: input.platform?.osVersion ?? null,
      apiLevel: input.platform?.apiLevel ?? null,
    },
    offlineAssertions: {
      checkedAt: runtime.checkedAt,
      appObservedOffline: runtime.appObservedOffline,
      runtimeNetworkProbe: runtime.runtimeNetworkProbe,
      providerReachability: runtime.providerReachability,
      systemNetworkDisabled: input.systemNetworkDisabled ?? null,
      source,
      notes: [
        ...sanitizeNotes(runtime.notes),
        input.systemNetworkDisabled === true
          ? 'System network disabled confirmation was supplied by the operator or harness.'
          : 'System network disabled confirmation is not app-observable and must be supplied by Android QA evidence.',
      ],
    },
    resultSummary: summarizeOfflineFailureDrillResultForEvidence(input.drillResult),
    drillResult: input.drillResult,
    readinessMetadata: buildReadinessMetadata(input.readinessAssessment),
    productionReadiness: {
      status: input.drillResult.productionReadiness.status,
      blockers: [...input.drillResult.productionReadiness.blockers],
      evidenceRequired: [...input.drillResult.productionReadiness.evidenceRequired],
    },
    validationNotes: [
      'Capture bundle records app-observable evidence only; screenshots, logs, system network state, and owner acceptance remain external evidence.',
      ...sanitizeNotes(input.validationNotes),
    ],
  };
}

export function buildOfflineFailureDrillCaptureArtifactPayloads(
  bundle: OfflineFailureDrillEvidenceCaptureBundle,
  options: OfflineFailureDrillCaptureArtifactOptions,
): OfflineFailureDrillCaptureArtifactPayloads {
  const captureBundleFileName = options.captureBundleFileName ?? 'capture-bundle.json';
  const drillResultFileName = options.drillResultFileName ?? 'drill-result.json';
  const offlineAssertionsFileName = options.offlineAssertionsFileName ?? 'offline-assertions.json';
  const readinessMetadataFileName = options.readinessMetadataFileName ?? 'readiness-metadata.json';
  return {
    captureBundle: {
      fileName: captureBundleFileName,
      filePath: joinArtifactPath(options.artifactDir, captureBundleFileName),
      body: stableJson(bundle),
    },
    drillResult: {
      fileName: drillResultFileName,
      filePath: joinArtifactPath(options.artifactDir, drillResultFileName),
      body: stableJson(bundle.drillResult),
    },
    offlineAssertions: {
      fileName: offlineAssertionsFileName,
      filePath: joinArtifactPath(options.artifactDir, offlineAssertionsFileName),
      body: stableJson(bundle.offlineAssertions),
    },
    readinessMetadata: {
      fileName: readinessMetadataFileName,
      filePath: joinArtifactPath(options.artifactDir, readinessMetadataFileName),
      body: stableJson(bundle.readinessMetadata),
    },
  };
}

export function buildOfflineFailureDrillAndroidManifestFromCapture(
  bundle: OfflineFailureDrillEvidenceCaptureBundle,
  options: OfflineFailureDrillManifestFromCaptureOptions,
): OfflineFailureDrillAndroidEvidenceManifest {
  const payloads = buildOfflineFailureDrillCaptureArtifactPayloads(bundle, options);
  const ownerAcceptance = options.ownerAcceptance ?? {
    accepted: false,
    notes: ['Owner acceptance missing; production must remain blocked.'],
  };
  const systemNetworkDisabled = options.systemNetworkDisabled ?? bundle.offlineAssertions.systemNetworkDisabled ?? false;
  const resultSummary = {
    ...bundle.resultSummary,
    productionReadiness: ownerAcceptance.accepted ? 'accepted' as const : bundle.resultSummary.productionReadiness,
  };

  return {
    evidenceId: options.evidenceId ?? bundle.captureId,
    evidenceKind: options.evidenceKind ?? 'android_no_network_emulator',
    evidenceSource: options.evidenceSource ?? bundle.evidenceSource,
    generatedAt: bundle.capturedAt,
    app: {
      appBuildId: options.app?.appBuildId ?? bundle.app.appBuildId ?? undefined,
      appVersion: options.app?.appVersion ?? bundle.app.appVersion ?? undefined,
      gitSha: options.app?.gitSha ?? bundle.app.gitSha ?? undefined,
      bundleId: options.app?.bundleId ?? bundle.app.bundleId ?? undefined,
    },
    platform: {
      os: 'android',
      deviceName: options.platform?.deviceName ?? bundle.platform.deviceName ?? undefined,
      emulatorName: options.platform?.emulatorName ?? bundle.platform.emulatorName ?? undefined,
      osVersion: options.platform?.osVersion ?? bundle.platform.osVersion ?? undefined,
      apiLevel: options.platform?.apiLevel ?? bundle.platform.apiLevel ?? undefined,
    },
    networkState: {
      appObservedOffline: bundle.offlineAssertions.appObservedOffline,
      systemNetworkDisabled: systemNetworkDisabled === true,
      checkedAt: bundle.offlineAssertions.checkedAt,
      runtimeNetworkProbe: bundle.offlineAssertions.runtimeNetworkProbe,
      notes: [
        ...bundle.offlineAssertions.notes,
        systemNetworkDisabled === true
          ? 'System network disabled flag supplied to manifest helper.'
          : 'System network disabled evidence is missing from manifest helper input.',
      ],
    },
    runtimeNoNetworkAssertions: {
      checkedAt: bundle.offlineAssertions.checkedAt,
      appObservedOffline: bundle.offlineAssertions.appObservedOffline,
      runtimeNetworkProbe: bundle.offlineAssertions.runtimeNetworkProbe,
      providerReachability: bundle.offlineAssertions.providerReachability,
      systemNetworkDisabled: systemNetworkDisabled === true,
      assertionSource: bundle.offlineAssertions.source,
      offlineAssertionsPath: options.offlineAssertionsPath ?? payloads.offlineAssertions.filePath,
      captureBundlePath: options.captureBundlePath ?? payloads.captureBundle.filePath,
      notes: [
        ...bundle.offlineAssertions.notes,
        'Runtime no-network assertion is copied from the app-side Offline Failure Drill capture bundle.',
      ],
    },
    cacheFixtureProfile: bundle.cacheFixtureProfile,
    cacheManifestPath: options.cacheManifestPath,
    drillResultPath: options.drillResultPath ?? payloads.drillResult.filePath,
    offlineAssertionsPath: options.offlineAssertionsPath ?? payloads.offlineAssertions.filePath,
    readinessMetadataPath: options.readinessMetadataPath ?? payloads.readinessMetadata.filePath,
    captureBundlePath: options.captureBundlePath ?? payloads.captureBundle.filePath,
    screenshotPaths: options.screenshotPaths ?? [],
    logPaths: options.logPaths ?? [],
    remoteAttemptSummary: {
      providerUpdateAttempted: false,
      providerUpdateSucceeded: false,
      liveSyncAttempted: false,
      liveSyncSucceeded: false,
      dispatchReplayAttempted: false,
      dispatchReplaySucceeded: false,
      dispatchReplayLocalOnly: false,
      weatherRefreshAttempted: false,
      weatherRefreshSucceeded: false,
      teamSyncAttempted: false,
      teamSyncSucceeded: false,
      ...options.remoteAttemptSummary,
    },
    resultSummary,
    ownerAcceptance,
    artifacts: {
      directory: options.artifactDir,
      manifestPath: options.manifestPath,
    },
    validationNotes: [
      'Generated from an Offline Failure Drill app-side capture bundle.',
      'Do not treat this manifest as production evidence until required Android screenshots, logs, system network evidence, and owner acceptance are present.',
      ...bundle.validationNotes,
    ],
  };
}
