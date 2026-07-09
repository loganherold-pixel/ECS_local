import fs from 'node:fs';
import path from 'node:path';

export const NAVIGATE_PROVIDER_ANDROID_SCHEMA_VERSION = 'navigate-provider-android-sweep/v1';
export const DEFAULT_NAVIGATE_PROVIDER_ANDROID_MANIFEST = path.join(
  '.smoke',
  'navigate-provider-android-sweep',
  'manifest.json',
);

const ARTIFACT_GROUPS = {
  candidatePinsActions: 'candidatePinsActions',
  activeRouteLineContext: 'activeRouteLineContext',
  searchFreezeStandby: 'searchFreezeStandby',
  logs: 'logs',
};

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
const REQUIRED_CANDIDATE_ARTIFACT_ROLES = [
  'candidate_pin_visible',
  'navigate_here_action',
  'save_camp_action',
  'report_unusable_action',
  'dismiss_action',
];
const REQUIRED_ACTIVE_ROUTE_ARTIFACT_ROLES = ['active_route_line_with_provider_candidates'];
const REQUIRED_SEARCH_FREEZE_ARTIFACT_ROLES = ['search_freeze_standby_runtime'];
const REQUIRED_LOG_ARTIFACT_ROLES = ['logcat_slice'];
const RAW_PAYLOAD_KEY_PATTERN = /raw|payload|record_id|provider_record|secret|token|api[_-]?key|authorization/i;
const COORDINATE_KEY_PATTERN = /^(lat|lng|lon|latitude|longitude)$|coordinate/i;
const LOG_FATAL_PATTERN = /FATAL EXCEPTION|[EF]\s+AndroidRuntime|AndroidRuntime:\s*FATAL|ReactNativeJS.*(?:Unhandled|TypeError|ReferenceError)|RedBox|redbox/i;
const LOG_SECRET_OR_RAW_PATTERN = /Authorization\s*:|Bearer\s+[A-Za-z0-9._-]+|api[_-]?key\s*[:=]|secret\s*[:=]|(?:provider|service|access|refresh|auth)[_-]?token\s*[:=]|provider_record_id|rawProviderPayload|providerPayload\s*[:=]/i;
const SEARCH_FREEZE_PATTERN = /(?:destinationSearchMapFrozen|searchMapFrozen)\s*[:=]\s*true/i;
const SEARCH_STANDBY_PATTERN = /standbyMapActive\s*[:=]\s*true|liveWebViewWake\s*[:=]\s*false|liveWebViewWoken\s*[:=]\s*false/i;

function unique(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function portablePath(value) {
  return String(value ?? '').replace(/\\/g, '/');
}

function portableJoin(...parts) {
  return parts.filter(Boolean).join('/');
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
  return portablePath(
    relative && !relative.startsWith('..') && !path.isAbsolute(relative)
      ? relative
      : resolved,
  );
}

function resolveSummaryRelativePath(rootDir, summaryDir, value) {
  if (!value) return null;
  if (path.isAbsolute(value)) return toArtifactPath(rootDir, value);

  const rootRelative = resolvePath(rootDir, value);
  if (rootRelative && fs.existsSync(rootRelative)) return toArtifactPath(rootDir, value);

  const summaryRelative = summaryDir ? path.join(summaryDir, value) : rootRelative;
  return toArtifactPath(rootDir, summaryRelative);
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

function artifactPathFromValue(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return null;
  return value.path ?? value.artifactPath ?? value.filePath ?? value.uri ?? null;
}

function artifactRoleFromValue(value) {
  if (!value || typeof value !== 'object') return null;
  const role = value.role ?? value.artifactRole ?? value.kind ?? value.type;
  return typeof role === 'string' && role.trim() ? role.trim() : null;
}

function parseCliArtifactValue(value) {
  if (typeof value !== 'string') return { path: value, role: null };
  const match = value.match(/^([a-z][a-z0-9_]+):(.*)$/i);
  if (!match) return { path: value, role: null };
  const role = match[1];
  const artifactPath = match[2];
  const knownRoles = new Set([
    ...REQUIRED_CANDIDATE_ARTIFACT_ROLES,
    ...REQUIRED_ACTIVE_ROUTE_ARTIFACT_ROLES,
    ...REQUIRED_SEARCH_FREEZE_ARTIFACT_ROLES,
    ...REQUIRED_LOG_ARTIFACT_ROLES,
  ]);
  return knownRoles.has(role) && artifactPath ? { path: artifactPath, role } : { path: value, role: null };
}

function inferArtifactRole(groupKey, artifactPath, explicitRole = null) {
  if (explicitRole) return explicitRole;
  const normalized = portablePath(artifactPath).toLowerCase();

  if (groupKey === ARTIFACT_GROUPS.candidatePinsActions) {
    if (/navigate[-_ ]?here/.test(normalized)) return 'navigate_here_action';
    if (/save[-_ ]?camp/.test(normalized)) return 'save_camp_action';
    if (/report[-_ ]?unusable/.test(normalized)) return 'report_unusable_action';
    if (/dismiss/.test(normalized)) return 'dismiss_action';
    if (/popup[-_ ]?actions/.test(normalized)) return 'dismiss_action';
    if (/candidate.*(?:pin|visible|entry)|pins?/.test(normalized)) return 'candidate_pin_visible';
    return null;
  }

  if (groupKey === ARTIFACT_GROUPS.activeRouteLineContext) {
    if (/active[-_ ]?route|route[-_ ]?line|start[-_ ]?guidance|minimized[-_ ]?guidance|active[-_ ]?readiness/.test(normalized)) {
      return 'active_route_line_with_provider_candidates';
    }
    return null;
  }

  if (groupKey === ARTIFACT_GROUPS.searchFreezeStandby) {
    if (/search|freeze|standby|gfxinfo|perfetto|trace/.test(normalized)) return 'search_freeze_standby_runtime';
    return null;
  }

  if (groupKey === ARTIFACT_GROUPS.logs) {
    if (/logcat|log|errors?/.test(normalized)) return 'logcat_slice';
    return null;
  }

  return null;
}

function normalizeSummaryArtifactItems(rootDir, summaryDir, values, groupKey) {
  return asArray(values)
    .map((item) => {
      const rawPath = artifactPathFromValue(item);
      const artifactPath = resolveSummaryRelativePath(rootDir, summaryDir, rawPath);
      if (!artifactPath) return null;
      const role = inferArtifactRole(groupKey, artifactPath, artifactRoleFromValue(item));
      return {
        path: artifactPath,
        role,
        source: 'provider_summary',
        verified: item && typeof item === 'object' ? item.verified === true : false,
        summary: item && typeof item === 'object' && typeof item.summary === 'string' ? item.summary : null,
      };
    })
    .filter(Boolean);
}

function summaryArtifactGroups(summary, rootDir, artifactPath) {
  const summaryFilePath = resolvePath(rootDir, artifactPath);
  const summaryDir = summaryFilePath ? path.dirname(summaryFilePath) : rootDir;
  const source = summary?.androidArtifacts ?? summary?.artifacts?.android ?? summary?.artifacts ?? {};

  return {
    candidatePinsActions: normalizeSummaryArtifactItems(
      rootDir,
      summaryDir,
      source.candidatePinsActions ?? source.candidatePinActions ?? source.candidatePins ?? source.candidateActions,
      ARTIFACT_GROUPS.candidatePinsActions,
    ),
    activeRouteLineContext: normalizeSummaryArtifactItems(
      rootDir,
      summaryDir,
      source.activeRouteLineContext ?? source.activeRouteLine ?? source.routeLineContext,
      ARTIFACT_GROUPS.activeRouteLineContext,
    ),
    searchFreezeStandby: normalizeSummaryArtifactItems(
      rootDir,
      summaryDir,
      source.searchFreezeStandby ?? source.searchFreeze ?? source.standby,
      ARTIFACT_GROUPS.searchFreezeStandby,
    ),
    logs: normalizeSummaryArtifactItems(
      rootDir,
      summaryDir,
      source.logs ?? source.logcat ?? source.logcatArtifacts,
      ARTIFACT_GROUPS.logs,
    ),
  };
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
    summaryAndroidArtifacts: summaryArtifactGroups(summary, rootDir, artifactPath),
    summarySource: summary.source ?? 'unknown',
    sourceSummaryValidation: {
      parsed: true,
      blockers,
    },
  };
}

function buildArtifactEntries(rootDir, values, defaults, summaryEntries, groupKey) {
  const supplied = asArray(values)
    .map((item) => {
      const parsed = parseCliArtifactValue(item);
      const artifactPath = toArtifactPath(rootDir, parsed.path);
      if (!artifactPath) return null;
      return {
        path: artifactPath,
        role: inferArtifactRole(groupKey, artifactPath, parsed.role),
        source: 'cli',
        verified: false,
        summary: null,
      };
    })
    .filter(Boolean);

  const candidates = supplied.length > 0
    ? supplied
    : asArray(summaryEntries).length > 0
      ? summaryEntries
      : existingArtifacts(rootDir, defaults).map((artifactPath) => ({
        path: artifactPath,
        role: inferArtifactRole(groupKey, artifactPath),
        source: 'existing_reference',
        verified: false,
        summary: null,
      }));

  const seen = new Set();
  return candidates.filter((entry) => {
    const key = `${entry.path}|${entry.role ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function missingArtifactPaths(rootDir, artifactPaths, artifactExists = fs.existsSync) {
  return asArray(artifactPaths)
    .map((item) => toArtifactPath(rootDir, item))
    .filter((item) => !item || !artifactExists(resolvePath(rootDir, item)));
}

function missingArtifactEntryPaths(rootDir, entries, artifactExists = fs.existsSync) {
  return asArray(entries)
    .map((item) => item?.path)
    .filter((item) => !item || !artifactExists(resolvePath(rootDir, item)));
}

function acceptedArtifactEntries(entries) {
  return asArray(entries).filter((entry) => entry?.source !== 'existing_reference');
}

function artifactText(rootDir, artifactPath, artifactRead) {
  const resolved = resolvePath(rootDir, artifactPath);
  if (!resolved) return null;
  try {
    const value = artifactRead ? artifactRead(resolved) : fs.readFileSync(resolved, 'utf8');
    return typeof value === 'string' ? value : null;
  } catch {
    return null;
  }
}

function roleCoverage(entries, requiredRoles, rootDir, artifactExists) {
  const existingEntries = asArray(entries).filter((entry) => entry?.path && artifactExists(resolvePath(rootDir, entry.path)));
  const roles = unique(existingEntries.map((entry) => entry.role));
  return {
    roles,
    missingRoles: requiredRoles.filter((role) => !roles.includes(role)),
  };
}

function validateCandidatePinArtifacts(rootDir, entries, options = {}) {
  const artifactExists = options.artifactExists ?? fs.existsSync;
  const acceptedEntries = acceptedArtifactEntries(entries);
  const missingArtifacts = missingArtifactEntryPaths(rootDir, acceptedEntries, artifactExists);
  const { roles, missingRoles } = roleCoverage(acceptedEntries, REQUIRED_CANDIDATE_ARTIFACT_ROLES, rootDir, artifactExists);
  const blockers = [];

  if (entries.length === 0) blockers.push('candidate_pin_action_artifact_missing');
  if (entries.length > 0 && acceptedEntries.length === 0) blockers.push('candidate_pin_action_same_run_artifacts_missing');
  if (missingArtifacts.length > 0) blockers.push('candidate_pin_action_android_artifact_missing');
  if (acceptedEntries.length > 0 && missingRoles.length > 0) blockers.push('candidate_pin_action_artifact_roles_incomplete');

  return {
    status: blockers.length === 0 ? 'verified' : 'blocked',
    requiredRoles: REQUIRED_CANDIDATE_ARTIFACT_ROLES,
    coveredRoles: roles,
    missingRoles,
    missingArtifacts,
    blockers,
  };
}

function validateActiveRouteArtifacts(rootDir, entries, options = {}) {
  const artifactExists = options.artifactExists ?? fs.existsSync;
  const acceptedEntries = acceptedArtifactEntries(entries);
  const missingArtifacts = missingArtifactEntryPaths(rootDir, acceptedEntries, artifactExists);
  const { roles, missingRoles } = roleCoverage(acceptedEntries, REQUIRED_ACTIVE_ROUTE_ARTIFACT_ROLES, rootDir, artifactExists);
  const blockers = [];

  if (entries.length === 0) blockers.push('active_route_line_context_artifact_missing');
  if (entries.length > 0 && acceptedEntries.length === 0) blockers.push('active_route_line_same_run_artifact_missing');
  if (missingArtifacts.length > 0) blockers.push('active_route_line_android_artifact_missing');
  if (acceptedEntries.length > 0 && missingRoles.length > 0) blockers.push('active_route_line_context_artifact_unverified');

  return {
    status: blockers.length === 0 ? 'verified' : 'blocked',
    requiredRoles: REQUIRED_ACTIVE_ROUTE_ARTIFACT_ROLES,
    coveredRoles: roles,
    missingRoles,
    missingArtifacts,
    blockers,
  };
}

function searchArtifactVerified(rootDir, entry, artifactRead) {
  if (entry?.verified === true) return true;
  const summary = typeof entry?.summary === 'string' ? entry.summary : '';
  if (SEARCH_FREEZE_PATTERN.test(summary) && SEARCH_STANDBY_PATTERN.test(summary)) return true;
  const text = artifactText(rootDir, entry?.path, artifactRead);
  return SEARCH_FREEZE_PATTERN.test(text ?? '') && SEARCH_STANDBY_PATTERN.test(text ?? '');
}

function validateSearchFreezeArtifacts(rootDir, entries, options = {}) {
  const artifactExists = options.artifactExists ?? fs.existsSync;
  const artifactRead = options.artifactRead;
  const acceptedEntries = acceptedArtifactEntries(entries);
  const missingArtifacts = missingArtifactEntryPaths(rootDir, acceptedEntries, artifactExists);
  const { roles, missingRoles } = roleCoverage(acceptedEntries, REQUIRED_SEARCH_FREEZE_ARTIFACT_ROLES, rootDir, artifactExists);
  const existingEntries = acceptedEntries.filter((entry) => entry?.path && artifactExists(resolvePath(rootDir, entry.path)));
  const hasVerifiedRuntime = existingEntries.some((entry) => searchArtifactVerified(rootDir, entry, artifactRead));
  const blockers = [];

  if (entries.length === 0) blockers.push('search_freeze_standby_artifact_missing');
  if (entries.length > 0 && acceptedEntries.length === 0) blockers.push('search_freeze_standby_same_run_artifact_missing');
  if (missingArtifacts.length > 0) blockers.push('mobile_search_freeze_standby_runtime_artifact_missing');
  if (acceptedEntries.length > 0 && (missingRoles.length > 0 || !hasVerifiedRuntime)) {
    blockers.push('search_freeze_standby_artifact_unverified');
  }

  return {
    status: blockers.length === 0 ? 'verified' : 'blocked',
    requiredRoles: REQUIRED_SEARCH_FREEZE_ARTIFACT_ROLES,
    coveredRoles: roles,
    missingRoles,
    missingArtifacts,
    hasVerifiedRuntime,
    blockers,
  };
}

function validateLogArtifacts(rootDir, entries, options = {}) {
  const artifactExists = options.artifactExists ?? fs.existsSync;
  const artifactRead = options.artifactRead;
  const acceptedEntries = acceptedArtifactEntries(entries);
  const missingArtifacts = missingArtifactEntryPaths(rootDir, acceptedEntries, artifactExists);
  const { roles, missingRoles } = roleCoverage(acceptedEntries, REQUIRED_LOG_ARTIFACT_ROLES, rootDir, artifactExists);
  const existingEntries = acceptedEntries.filter((entry) => entry?.path && artifactExists(resolvePath(rootDir, entry.path)));
  const logTexts = existingEntries.map((entry) => artifactText(rootDir, entry.path, artifactRead) ?? '');
  const fatalOrRedboxDetected = logTexts.some((text) => LOG_FATAL_PATTERN.test(text));
  const secretOrRawDetected = logTexts.some((text) => LOG_SECRET_OR_RAW_PATTERN.test(text));
  const blockers = [];

  if (entries.length === 0) blockers.push('navigate_android_logcat_artifact_missing');
  if (entries.length > 0 && acceptedEntries.length === 0) blockers.push('navigate_android_logcat_same_run_artifact_missing');
  if (missingArtifacts.length > 0) blockers.push('navigate_android_log_artifact_missing');
  if (acceptedEntries.length > 0 && missingRoles.length > 0) blockers.push('navigate_android_logcat_artifact_unverified');
  if (fatalOrRedboxDetected) blockers.push('navigate_android_logcat_contains_fatal_or_redbox');
  if (secretOrRawDetected) blockers.push('navigate_android_logcat_contains_secret_or_raw_payload');

  return {
    status: blockers.length === 0 ? 'verified' : 'blocked',
    requiredRoles: REQUIRED_LOG_ARTIFACT_ROLES,
    coveredRoles: roles,
    missingRoles,
    missingArtifacts,
    fatalOrRedboxDetected,
    secretOrRawDetected,
    blockers,
  };
}

function buildAndroidArtifactValidation(rootDir, artifactEntries, options = {}) {
  return {
    candidatePinsActions: validateCandidatePinArtifacts(rootDir, artifactEntries.candidatePinsActions, options),
    activeRouteLineContext: validateActiveRouteArtifacts(rootDir, artifactEntries.activeRouteLineContext, options),
    searchFreezeStandby: validateSearchFreezeArtifacts(rootDir, artifactEntries.searchFreezeStandby, options),
    logs: validateLogArtifacts(rootDir, artifactEntries.logs, options),
  };
}

function serializableArtifactEntries(entries) {
  return asArray(entries).map((entry) => ({
    path: entry.path,
    role: entry.role,
    source: entry.source,
    verified: entry.verified === true,
    ...(entry.summary ? { summary: entry.summary } : {}),
  }));
}

function manifestArtifactEntries(rootDir, manifest, groupKey) {
  const preservedEntries = asArray(manifest?.androidArtifactEvidence?.[groupKey]);
  if (preservedEntries.length > 0) {
    return preservedEntries
      .map((entry) => {
        const artifactPath = toArtifactPath(rootDir, entry?.path);
        if (!artifactPath) return null;
        return {
          path: artifactPath,
          role: inferArtifactRole(groupKey, artifactPath, artifactRoleFromValue(entry)),
          source: entry?.source ?? 'manifest',
          verified: entry?.verified === true,
          summary: typeof entry?.summary === 'string' ? entry.summary : null,
        };
      })
      .filter(Boolean);
  }

  return asArray(manifest?.androidArtifacts?.[groupKey]).map((artifactPath) => ({
    path: toArtifactPath(rootDir, artifactPath),
    role: inferArtifactRole(groupKey, artifactPath),
    source: 'manifest',
    verified: false,
    summary: null,
  }));
}

function artifactValidationBlockers(validation) {
  return unique([
    ...asArray(validation?.candidatePinsActions?.blockers),
    ...asArray(validation?.activeRouteLineContext?.blockers),
    ...asArray(validation?.searchFreezeStandby?.blockers),
    ...asArray(validation?.logs?.blockers),
  ]);
}

function candidateActionsVerified(providerEvidence, candidateValidation) {
  return providerEvidence.status === 'captured_sanitized_provider_summary' &&
    REQUIRED_ACTIONS.every((action) => providerEvidence.actions[action] === true) &&
    candidateValidation.status === 'verified';
}

function blockerMessage(blocker, manifest) {
  const artifactValidation = manifest?.androidArtifactValidation ?? {};
  const providerBlockers = asArray(manifest?.providerBackedCandidateEvidence?.sourceSummaryValidation?.blockers);

  switch (blocker) {
    case 'provider_candidate_summary_missing':
      return 'Provider summary missing: pass --provider-summary=<sanitized-summary.json> from a real Android provider sweep.';
    case 'provider_candidate_summary_unreadable':
      return 'Provider summary unreadable: provide valid sanitized JSON with source real_provider_sanitized_summary.';
    case 'provider_candidate_summary_not_real_sanitized':
      return 'Provider summary is not marked as real sanitized provider evidence: set source to real_provider_sanitized_summary.';
    case 'provider_summary_contains_raw_payload_or_secret':
      return 'Provider summary contains raw payload, provider record, secret, token, or authorization-looking fields; redact and summarize first.';
    case 'provider_summary_contains_precise_coordinates':
      return 'Provider summary contains precise coordinate fields; use rounded/non-private summary evidence only.';
    case 'provider_summary_redaction_not_confirmed':
      return 'Provider summary redaction is not confirmed: set rawProviderPayloadsExcluded and secretsExcluded to true.';
    case 'provider_summary_coordinate_redaction_not_confirmed':
      return 'Provider summary coordinate redaction is not confirmed: set precisePrivateCoordinatesExcluded to true.';
    case 'provider_candidate_pin_counts_missing':
      return 'Provider-backed candidate counts are missing: summarize providerBacked and visiblePins counts from the real sweep.';
    case 'candidate_actions_incomplete':
      return 'Provider summary action coverage is incomplete: Navigate Here, Save Camp, Report Unusable, and Dismiss must all be verified.';
    case 'active_route_provider_candidate_context_missing':
      return 'Provider summary does not confirm active route-line visibility with provider candidates anchored to the route.';
    case 'android_sweep_source_not_real_provider_backed':
      return 'Evidence source is not real_provider_backed Android evidence: run with --real or --evidence-source=real_android_provider_sweep.';
    case 'provider_candidate_summary_not_accepted':
      return providerBlockers.length > 0
        ? 'Provider summary is present but still blocked by sanitized-summary validation.'
        : 'Provider summary was not accepted as sanitized provider-backed candidate evidence.';
    case 'candidate_pin_action_artifact_missing':
    case 'candidate_pin_action_android_artifact_missing':
      return 'Candidate pin/action Android artifacts missing: include candidate pin plus Navigate Here, Save Camp, Report Unusable, and Dismiss captures.';
    case 'candidate_pin_action_same_run_artifacts_missing':
      return 'Candidate pin/action artifacts are only old local references; attach same-run Android captures through the sanitized summary or CLI flags.';
    case 'candidate_pin_action_artifact_roles_incomplete': {
      const missingRoles = asArray(artifactValidation?.candidatePinsActions?.missingRoles);
      return `Candidate pin/action artifacts missing roles: ${missingRoles.join(', ') || 'unknown'}.`;
    }
    case 'active_route_line_context_artifact_missing':
    case 'active_route_line_android_artifact_missing':
      return 'Active route-line context artifact missing: capture the route line with provider candidates visible or an explicit blocked context.';
    case 'active_route_line_same_run_artifact_missing':
      return 'Active route-line artifacts are only old local references; attach same-run route-line context from the provider-backed Android sweep.';
    case 'active_route_line_context_artifact_unverified':
      return 'Active route-line context artifact is present but lacks the active_route_line_with_provider_candidates role.';
    case 'search_freeze_standby_artifact_missing':
    case 'mobile_search_freeze_standby_runtime_artifact_missing':
      return 'Search freeze/standby runtime artifact missing: include gfxinfo, Perfetto, or sanitized text evidence for the destination search standby path.';
    case 'search_freeze_standby_same_run_artifact_missing':
      return 'Search freeze/standby artifacts are only old local references; attach same-run runtime evidence from the provider-backed Android sweep.';
    case 'search_freeze_standby_artifact_unverified':
      return 'Search freeze/standby artifact is unverified: include destinationSearchMapFrozen=true plus standbyMapActive=true or liveWebViewWake=false.';
    case 'navigate_android_logcat_artifact_missing':
    case 'navigate_android_log_artifact_missing':
      return 'Logcat artifact missing: pass --log=<redacted-logcat.txt> or include a logcat_slice artifact in the sanitized provider summary.';
    case 'navigate_android_logcat_same_run_artifact_missing':
      return 'Logcat artifacts are only old local references; attach a same-run redacted logcat_slice from the provider-backed Android sweep.';
    case 'navigate_android_logcat_artifact_unverified':
      return 'Logcat artifact is present but lacks the logcat_slice role.';
    case 'navigate_android_logcat_contains_fatal_or_redbox':
      return 'Logcat artifact contains fatal/redbox markers; resolve or attach a clean redacted slice from the same sweep.';
    case 'navigate_android_logcat_contains_secret_or_raw_payload':
      return 'Logcat artifact contains secret/raw-provider markers; redact and rerun before using it as evidence.';
    case 'provider_backed_candidate_pins_not_verified':
      return 'Provider-backed candidate pins are not verified by both sanitized summary counts and Android candidate-pin artifacts.';
    case 'candidate_actions_not_verified':
      return 'Candidate actions are not verified by both sanitized summary action flags and Android action artifacts.';
    case 'active_route_line_context_not_verified':
      return 'Active route-line context is not verified by both sanitized summary context and Android route-line artifacts.';
    case 'search_freeze_standby_not_verified':
      return 'Search freeze/standby is not verified by runtime artifact evidence.';
    default:
      return blocker;
  }
}

function blockerMessages(blockers, manifest) {
  return unique(asArray(blockers).map((blocker) => blockerMessage(blocker, manifest)));
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

  blockers.push(...artifactValidationBlockers(manifest?.androidArtifactValidation));

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
  const summaryAndroidArtifacts = providerBackedCandidateEvidence.summaryAndroidArtifacts ?? {};
  const artifactEntries = {
    candidatePinsActions: buildArtifactEntries(
      rootDir,
      options.candidatePinScreenshots,
      DEFAULT_CANDIDATE_PIN_ARTIFACTS,
      summaryAndroidArtifacts.candidatePinsActions,
      ARTIFACT_GROUPS.candidatePinsActions,
    ),
    activeRouteLineContext: buildArtifactEntries(
      rootDir,
      options.activeRouteLineScreenshots,
      DEFAULT_ACTIVE_ROUTE_LINE_ARTIFACTS,
      summaryAndroidArtifacts.activeRouteLineContext,
      ARTIFACT_GROUPS.activeRouteLineContext,
    ),
    searchFreezeStandby: buildArtifactEntries(
      rootDir,
      options.searchFreezeArtifacts,
      [],
      summaryAndroidArtifacts.searchFreezeStandby,
      ARTIFACT_GROUPS.searchFreezeStandby,
    ),
    logs: buildArtifactEntries(
      rootDir,
      options.logs,
      DEFAULT_LOG_ARTIFACTS,
      summaryAndroidArtifacts.logs,
      ARTIFACT_GROUPS.logs,
    ),
  };
  const candidatePinsActions = artifactEntries.candidatePinsActions.map((entry) => entry.path);
  const activeRouteLineContext = artifactEntries.activeRouteLineContext.map((entry) => entry.path);
  const searchFreezeStandby = artifactEntries.searchFreezeStandby.map((entry) => entry.path);
  const logs = artifactEntries.logs.map((entry) => entry.path);
  const androidArtifactValidation = buildAndroidArtifactValidation(
    rootDir,
    artifactEntries,
    {
      artifactExists: options.artifactExists ?? fs.existsSync,
      artifactRead: options.artifactRead,
    },
  );
  const providerBlockers = providerBackedCandidateEvidence.sourceSummaryValidation.blockers;
  const actionsCaptured = candidateActionsVerified(providerBackedCandidateEvidence, androidArtifactValidation.candidatePinsActions);
  const runtimeAssertions = {
    providerBackedCandidatePinsVisible:
      providerBackedCandidateEvidence.status === 'captured_sanitized_provider_summary' &&
      providerBackedCandidateEvidence.candidateCounts.providerBacked > 0 &&
      providerBackedCandidateEvidence.candidateCounts.visiblePins > 0 &&
      androidArtifactValidation.candidatePinsActions.status === 'verified',
    candidateActionsCaptured: actionsCaptured,
    activeRouteLineContextCaptured:
      providerBackedCandidateEvidence.routeContext.activeRouteLineVisible === true &&
      providerBackedCandidateEvidence.routeContext.providerCandidatesAnchoredToRoute === true &&
      androidArtifactValidation.activeRouteLineContext.status === 'verified',
    searchFreezeStandbyCovered: androidArtifactValidation.searchFreezeStandby.status === 'verified',
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
    androidArtifactEvidence: {
      candidatePinsActions: serializableArtifactEntries(artifactEntries.candidatePinsActions),
      activeRouteLineContext: serializableArtifactEntries(artifactEntries.activeRouteLineContext),
      searchFreezeStandby: serializableArtifactEntries(artifactEntries.searchFreezeStandby),
      logs: serializableArtifactEntries(artifactEntries.logs),
    },
    androidArtifactValidation,
    runtimeAssertions,
    codeRegressionCoverage: {
      staticContractTest: portableJoin('scripts', 'test-navigate-mobile-emulation-regressions.js'),
      evidenceValidationTest: portableJoin('scripts', 'test-navigate-provider-android-evidence.mjs'),
      protectedFiles: [
        portableJoin('app', '(tabs)', 'navigate.tsx'),
        portableJoin('components', 'navigate', 'MapRenderer.tsx'),
        portableJoin('lib', 'useRoadNavigation.ts'),
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
  manifest.blockerMessages = blockerMessages(manifest.blockers, manifest);
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
  const artifactRead = options.artifactRead;
  const artifactEntries = {
    candidatePinsActions: manifestArtifactEntries(rootDir, manifest, ARTIFACT_GROUPS.candidatePinsActions),
    activeRouteLineContext: manifestArtifactEntries(rootDir, manifest, ARTIFACT_GROUPS.activeRouteLineContext),
    searchFreezeStandby: manifestArtifactEntries(rootDir, manifest, ARTIFACT_GROUPS.searchFreezeStandby),
    logs: manifestArtifactEntries(rootDir, manifest, ARTIFACT_GROUPS.logs),
  };
  const liveArtifactValidation = buildAndroidArtifactValidation(rootDir, artifactEntries, {
    artifactExists,
    artifactRead,
  });
  const manifestForValidation = {
    ...manifest,
    androidArtifactValidation: liveArtifactValidation,
    runtimeAssertions: {
      ...manifest?.runtimeAssertions,
      searchFreezeStandbyCovered: liveArtifactValidation.searchFreezeStandby.status === 'verified',
    },
  };
  const blockers = blockerList(manifestForValidation, { rootDir, artifactExists });
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
    blockerMessages: blockerMessages(blockers, manifestForValidation),
    missingArtifacts,
    notClaimed: asArray(manifest?.notClaimed),
    androidArtifactValidation: liveArtifactValidation,
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
