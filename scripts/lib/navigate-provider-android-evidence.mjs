import fs from 'node:fs';
import path from 'node:path';

export const NAVIGATE_PROVIDER_ANDROID_SCHEMA_VERSION = 'navigate-provider-android-sweep/v1';
export const DEFAULT_NAVIGATE_PROVIDER_ANDROID_MANIFEST = path.join(
  '.smoke',
  'navigate-provider-android-sweep',
  'manifest.json',
);

const DEFAULT_CANDIDATE_PIN_ARTIFACTS = [
  path.join('.smoke', 'campops-android-qa', 'candidate-viewport-entry.png'),
  path.join('.smoke', 'campops-android-qa', 'candidate-viewport-navigate-here-action.png'),
  path.join('.smoke', 'campops-android-qa', 'candidate-viewport-save-camp-action.png'),
  path.join('.smoke', 'campops-android-qa', 'candidate-viewport-report-unusable-action.png'),
  path.join('.smoke', 'campops-android-qa', 'phone-candidate-viewport-popup-actions.png'),
];

const DEFAULT_ACTIVE_ROUTE_LINE_ARTIFACTS = [
  path.join('.smoke', 'navigate-deep', '04-start-guidance.png'),
  path.join('.smoke', 'navigate-deep', '08-minimized-guidance.png'),
  path.join('.smoke', 'navigate-deep', '09-active-readiness-reopen.png'),
];

const DEFAULT_LOG_ARTIFACTS = [
  path.join('.smoke', 'campops-android-qa', 'candidate-viewport-actions-logcat.txt'),
  path.join('.smoke', 'navigate-deep', 'final-navigate-log-errors.txt'),
];

const REQUIRED_ACTIONS = ['navigateHere', 'saveCamp', 'reportUnusable', 'dismiss'];
const RAW_PAYLOAD_KEY_PATTERN = /raw|payload|record_id|provider_record|secret|token|api[_-]?key|authorization/i;
const COORDINATE_KEY_PATTERN = /^(lat|lng|lon|latitude|longitude)$|coordinate/i;

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function resolvePath(rootDir, value) {
  if (!value) return null;
  return path.isAbsolute(value) ? value : path.join(rootDir, value);
}

function toArtifactPath(rootDir, value) {
  if (!value) return null;
  const resolved = resolvePath(rootDir, value);
  const relative = path.relative(rootDir, resolved);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative)
    ? relative
    : resolved;
}

function existingArtifacts(rootDir, candidates) {
  return candidates
    .map((item) => toArtifactPath(rootDir, item))
    .filter((item) => item && fs.existsSync(resolvePath(rootDir, item)));
}

function readJsonIfPresent(rootDir, filePath) {
  const resolved = resolvePath(rootDir, filePath);
  if (!resolved || !fs.existsSync(resolved)) return { exists: false, value: null, error: null };
  try {
    return { exists: true, value: JSON.parse(fs.readFileSync(resolved, 'utf8')), error: null };
  } catch (error) {
    return {
      exists: true,
      value: null,
      error: typeof error?.message === 'string' ? error.message : 'Unable to parse JSON.',
    };
  }
}

function numberValue(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function booleanValue(value) {
  return value === true;
}

function walkObject(value, visitor, pathParts = []) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => walkObject(item, visitor, [...pathParts, String(index)]));
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    visitor(key, child, pathParts);
    walkObject(child, visitor, [...pathParts, key]);
  }
}

function detectUnsafeProviderSummary(summary) {
  const violations = {
    rawPayloadOrSecret: false,
    preciseCoordinates: false,
  };

  walkObject(summary, (key, value, pathParts) => {
    const parentKey = pathParts[pathParts.length - 1];
    if (parentKey === 'redaction' && /Excluded$/.test(key) && value === true) return;
    if (RAW_PAYLOAD_KEY_PATTERN.test(key)) violations.rawPayloadOrSecret = true;
    if (COORDINATE_KEY_PATTERN.test(key)) violations.preciseCoordinates = true;
    if (typeof value === 'string' && /api[_-]?key|secret|token|bearer\s+/i.test(value)) {
      violations.rawPayloadOrSecret = true;
    }
  });

  return violations;
}

function sanitizeProviderSources(summary) {
  return asArray(summary?.providerSources)
    .map((source) => ({
      providerId: String(source?.providerId ?? source?.id ?? 'unknown').trim() || 'unknown',
      providerLabel: String(source?.providerLabel ?? source?.label ?? source?.providerId ?? 'Unknown provider').trim(),
      candidateCount: numberValue(source?.candidateCount),
      freshnessState: String(source?.freshnessState ?? source?.freshness ?? 'unknown').trim() || 'unknown',
      latestCheckedAt: typeof source?.latestCheckedAt === 'string' ? source.latestCheckedAt : null,
    }))
    .slice(0, 20);
}

function buildProviderCandidateEvidence(rootDir, providerSummaryPath) {
  const artifactPath = toArtifactPath(rootDir, providerSummaryPath);
  const parsed = readJsonIfPresent(rootDir, artifactPath);
  if (!artifactPath || !parsed.exists) {
    return {
      status: 'blocked_missing_real_provider_summary',
      artifactPath: artifactPath ?? null,
      providerSources: [],
      candidateCounts: { providerBacked: 0, visiblePins: 0, actionVerified: 0 },
      routeContext: {
        activeRouteLineVisible: false,
        providerCandidatesAnchoredToRoute: false,
        routeLineSource: 'missing',
      },
      actions: Object.fromEntries(REQUIRED_ACTIONS.map((action) => [action, false])),
      redaction: {
        rawProviderPayloadsExcluded: false,
        precisePrivateCoordinatesExcluded: false,
        secretsExcluded: false,
      },
      summarySource: 'missing',
      sourceSummaryValidation: {
        parsed: false,
        blockers: ['provider_candidate_summary_missing'],
      },
    };
  }

  if (parsed.error || !parsed.value || typeof parsed.value !== 'object') {
    return {
      status: 'blocked_unreadable_provider_summary',
      artifactPath,
      providerSources: [],
      candidateCounts: { providerBacked: 0, visiblePins: 0, actionVerified: 0 },
      routeContext: {
        activeRouteLineVisible: false,
        providerCandidatesAnchoredToRoute: false,
        routeLineSource: 'unreadable',
      },
      actions: Object.fromEntries(REQUIRED_ACTIONS.map((action) => [action, false])),
      redaction: {
        rawProviderPayloadsExcluded: false,
        precisePrivateCoordinatesExcluded: false,
        secretsExcluded: false,
      },
      summarySource: 'unreadable',
      sourceSummaryValidation: {
        parsed: false,
        blockers: ['provider_candidate_summary_unreadable'],
      },
    };
  }

  const summary = parsed.value;
  const unsafe = detectUnsafeProviderSummary(summary);
  const redaction = {
    rawProviderPayloadsExcluded: summary?.redaction?.rawProviderPayloadsExcluded === true,
    precisePrivateCoordinatesExcluded: summary?.redaction?.precisePrivateCoordinatesExcluded === true,
    secretsExcluded: summary?.redaction?.secretsExcluded === true,
  };
  const candidateCounts = {
    providerBacked: numberValue(summary?.candidateCounts?.providerBacked),
    visiblePins: numberValue(summary?.candidateCounts?.visiblePins),
    actionVerified: numberValue(summary?.candidateCounts?.actionVerified),
  };
  const actions = Object.fromEntries(
    REQUIRED_ACTIONS.map((action) => [action, booleanValue(summary?.actions?.[action])]),
  );
  const routeContext = {
    activeRouteLineVisible: booleanValue(summary?.routeContext?.activeRouteLineVisible),
    providerCandidatesAnchoredToRoute: booleanValue(summary?.routeContext?.providerCandidatesAnchoredToRoute),
    routeLineSource: String(summary?.routeContext?.routeLineSource ?? 'unknown').trim() || 'unknown',
  };

  const blockers = [];
  if (summary.source !== 'real_provider_sanitized_summary') blockers.push('provider_candidate_summary_not_real_sanitized');
  if (unsafe.rawPayloadOrSecret) blockers.push('provider_summary_contains_raw_payload_or_secret');
  if (unsafe.preciseCoordinates) blockers.push('provider_summary_contains_precise_coordinates');
  if (!redaction.rawProviderPayloadsExcluded || !redaction.secretsExcluded) {
    blockers.push('provider_summary_redaction_not_confirmed');
  }
  if (!redaction.precisePrivateCoordinatesExcluded) blockers.push('provider_summary_coordinate_redaction_not_confirmed');
  if (candidateCounts.providerBacked <= 0 || candidateCounts.visiblePins <= 0) {
    blockers.push('provider_candidate_pin_counts_missing');
  }
  if (candidateCounts.actionVerified < REQUIRED_ACTIONS.length - 1 || REQUIRED_ACTIONS.some((action) => !actions[action])) {
    blockers.push('candidate_actions_incomplete');
  }
  if (!routeContext.activeRouteLineVisible || !routeContext.providerCandidatesAnchoredToRoute) {
    blockers.push('active_route_provider_candidate_context_missing');
  }

  return {
    status: blockers.length === 0
      ? 'captured_sanitized_provider_summary'
      : 'blocked_provider_summary_incomplete',
    artifactPath,
    providerRunId: typeof summary.providerRunId === 'string' ? summary.providerRunId : null,
    capturedAt: typeof summary.capturedAt === 'string' ? summary.capturedAt : null,
    providerSources: sanitizeProviderSources(summary),
    candidateCounts,
    routeContext,
    actions,
    redaction,
    summarySource: summary.source ?? 'unknown',
    sourceSummaryValidation: {
      parsed: true,
      blockers,
    },
  };
}

function buildArtifactGroup(rootDir, values, defaults) {
  const supplied = asArray(values).map((item) => toArtifactPath(rootDir, item)).filter(Boolean);
  return supplied.length > 0 ? unique(supplied) : existingArtifacts(rootDir, defaults);
}

function missingArtifactPaths(rootDir, artifactPaths, artifactExists = fs.existsSync) {
  return asArray(artifactPaths)
    .map((item) => toArtifactPath(rootDir, item))
    .filter((item) => !item || !artifactExists(resolvePath(rootDir, item)));
}

function blockerList(manifest, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const artifactExists = options.artifactExists ?? fs.existsSync;
  const blockers = [];
  const providerBlockers = asArray(manifest?.providerBackedCandidateEvidence?.sourceSummaryValidation?.blockers);
  blockers.push(...providerBlockers);

  if (manifest?.evidenceSource !== 'real_android_provider_sweep') {
    blockers.push('android_sweep_source_not_real_provider_backed');
  }

  const providerEvidence = manifest?.providerBackedCandidateEvidence ?? {};
  if (providerEvidence.status !== 'captured_sanitized_provider_summary') {
    if (!providerBlockers.includes('provider_candidate_summary_missing')) {
      blockers.push('provider_candidate_summary_not_accepted');
    }
  }

  const candidateMissing = missingArtifactPaths(rootDir, manifest?.androidArtifacts?.candidatePinsActions, artifactExists);
  const routeMissing = missingArtifactPaths(rootDir, manifest?.androidArtifacts?.activeRouteLineContext, artifactExists);
  const searchMissing = missingArtifactPaths(rootDir, manifest?.androidArtifacts?.searchFreezeStandby, artifactExists);
  const logMissing = missingArtifactPaths(rootDir, manifest?.androidArtifacts?.logs, artifactExists);

  if (asArray(manifest?.androidArtifacts?.candidatePinsActions).length === 0 || candidateMissing.length > 0) {
    blockers.push('candidate_pin_action_android_artifact_missing');
  }
  if (asArray(manifest?.androidArtifacts?.activeRouteLineContext).length === 0 || routeMissing.length > 0) {
    blockers.push('active_route_line_android_artifact_missing');
  }
  if (asArray(manifest?.androidArtifacts?.searchFreezeStandby).length === 0 || searchMissing.length > 0) {
    blockers.push('mobile_search_freeze_standby_runtime_artifact_missing');
  }
  if (asArray(manifest?.androidArtifacts?.logs).length === 0 || logMissing.length > 0) {
    blockers.push('navigate_android_log_artifact_missing');
  }

  if (manifest?.runtimeAssertions?.providerBackedCandidatePinsVisible !== true) {
    blockers.push('provider_backed_candidate_pins_not_verified');
  }
  if (manifest?.runtimeAssertions?.candidateActionsCaptured !== true) {
    blockers.push('candidate_actions_not_verified');
  }
  if (manifest?.runtimeAssertions?.activeRouteLineContextCaptured !== true) {
    blockers.push('active_route_line_context_not_verified');
  }
  if (manifest?.runtimeAssertions?.searchFreezeStandbyCovered !== true) {
    blockers.push('search_freeze_standby_not_verified');
  }

  return unique(blockers);
}

export function buildNavigateProviderAndroidEvidenceManifest(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const evidenceSource = options.evidenceSource ?? (options.providerSummaryPath ? 'real_android_provider_sweep' : 'existing_android_partial');
  const manifestPath = toArtifactPath(rootDir, options.manifestPath ?? DEFAULT_NAVIGATE_PROVIDER_ANDROID_MANIFEST);
  const providerBackedCandidateEvidence = buildProviderCandidateEvidence(rootDir, options.providerSummaryPath);
  const candidatePinsActions = buildArtifactGroup(
    rootDir,
    options.candidatePinScreenshots,
    DEFAULT_CANDIDATE_PIN_ARTIFACTS,
  );
  const activeRouteLineContext = buildArtifactGroup(
    rootDir,
    options.activeRouteLineScreenshots,
    DEFAULT_ACTIVE_ROUTE_LINE_ARTIFACTS,
  );
  const searchFreezeStandby = buildArtifactGroup(rootDir, options.searchFreezeArtifacts, []);
  const logs = buildArtifactGroup(rootDir, options.logs, DEFAULT_LOG_ARTIFACTS);
  const providerBlockers = providerBackedCandidateEvidence.sourceSummaryValidation.blockers;
  const actionsCaptured =
    providerBackedCandidateEvidence.status === 'captured_sanitized_provider_summary' &&
    REQUIRED_ACTIONS.every((action) => providerBackedCandidateEvidence.actions[action] === true) &&
    candidatePinsActions.length > 0;
  const runtimeAssertions = {
    providerBackedCandidatePinsVisible:
      providerBackedCandidateEvidence.status === 'captured_sanitized_provider_summary' &&
      providerBackedCandidateEvidence.candidateCounts.providerBacked > 0 &&
      providerBackedCandidateEvidence.candidateCounts.visiblePins > 0 &&
      candidatePinsActions.length > 0,
    candidateActionsCaptured: actionsCaptured,
    activeRouteLineContextCaptured:
      providerBackedCandidateEvidence.routeContext.activeRouteLineVisible === true &&
      providerBackedCandidateEvidence.routeContext.providerCandidatesAnchoredToRoute === true &&
      activeRouteLineContext.length > 0,
    searchFreezeStandbyCovered: searchFreezeStandby.length > 0,
  };

  const manifest = {
    schemaVersion: NAVIGATE_PROVIDER_ANDROID_SCHEMA_VERSION,
    generatedAt,
    evidenceId: options.evidenceId ?? `navigate-provider-android-sweep-${generatedAt.replace(/[^0-9]/g, '').slice(0, 14)}`,
    evidenceSource,
    status: 'draft',
    productionAccepted: false,
    manifestPath,
    existingAndroidEvidenceMode:
      evidenceSource === 'real_android_provider_sweep' && providerBlockers.length === 0
        ? 'real_provider_backed_android_sweep'
        : 'partial_local_android_reference',
    providerBackedCandidateEvidence,
    androidArtifacts: {
      candidatePinsActions,
      activeRouteLineContext,
      searchFreezeStandby,
      logs,
    },
    runtimeAssertions,
    codeRegressionCoverage: {
      staticContractTest: path.join('scripts', 'test-navigate-mobile-emulation-regressions.js'),
      evidenceValidationTest: path.join('scripts', 'test-navigate-provider-android-evidence.mjs'),
      protectedFiles: [
        path.join('app', '(tabs)', 'navigate.tsx'),
        path.join('components', 'navigate', 'MapRenderer.tsx'),
        path.join('lib', 'useRoadNavigation.ts'),
      ],
      protectedBehaviors: [
        'provider-backed candidate pins and actions must be backed by a sanitized real-provider summary',
        'active route-line context must be captured with provider candidates visible or explicitly blocked',
        'mobile destination search freeze/standby must have runtime artifact evidence plus static regression coverage',
      ],
    },
    blockers: [],
    notClaimed: [
      'production acceptance',
      'owner acceptance',
      'provider influence approval',
      'raw provider payload review',
      'precise private coordinate capture',
      'fresh live availability or legal/access authority beyond summarized provider evidence',
      'provider-backed Android acceptance',
    ],
    notes: [
      'This manifest is a handoff artifact for Android QA. It does not approve provider influence or production rollout.',
      'Existing Navigate/CampOps Android smoke artifacts may be referenced as partial local evidence, but they do not satisfy provider-backed validation without a real sanitized provider summary.',
    ],
  };

  manifest.blockers = blockerList(manifest, {
    rootDir,
    artifactExists: options.artifactExists ?? fs.existsSync,
  });
  manifest.status = manifest.blockers.length === 0
    ? 'ready_for_handoff_review'
    : providerBlockers.includes('provider_candidate_summary_missing')
      ? 'blocked_missing_provider_evidence'
      : 'blocked_incomplete_android_evidence';

  return manifest;
}

export function validateNavigateProviderAndroidEvidenceManifest(manifest, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const artifactExists = options.artifactExists ?? fs.existsSync;
  const blockers = blockerList(manifest, { rootDir, artifactExists });
  const missingArtifacts = unique([
    ...missingArtifactPaths(rootDir, manifest?.androidArtifacts?.candidatePinsActions, artifactExists),
    ...missingArtifactPaths(rootDir, manifest?.androidArtifacts?.activeRouteLineContext, artifactExists),
    ...missingArtifactPaths(rootDir, manifest?.androidArtifacts?.searchFreezeStandby, artifactExists),
    ...missingArtifactPaths(rootDir, manifest?.androidArtifacts?.logs, artifactExists),
  ]);
  const structurallyValid =
    manifest?.schemaVersion === NAVIGATE_PROVIDER_ANDROID_SCHEMA_VERSION &&
    blockers.length === 0 &&
    missingArtifacts.length === 0;

  return {
    structurallyValid,
    repeatableSweepReady: structurallyValid && manifest?.status === 'ready_for_handoff_review',
    productionAccepted: false,
    status: manifest?.status ?? 'missing',
    blockers,
    missingArtifacts,
    notClaimed: asArray(manifest?.notClaimed),
    checkedAt: new Date().toISOString(),
  };
}

export function writeNavigateProviderAndroidEvidenceManifest(manifest, options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const manifestPath = resolvePath(rootDir, manifest.manifestPath ?? DEFAULT_NAVIGATE_PROVIDER_ANDROID_MANIFEST);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}
