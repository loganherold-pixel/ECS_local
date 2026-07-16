import crypto from 'node:crypto';

import diagnosticRedactionCore from '../../lib/observability/ecsDiagnosticRedactionCore.js';
import { PGTAP_WORKFLOW_EVIDENCE_CONTRACT } from './pgtap-workflow-evidence.mjs';

const {
  createECSDiagnosticToken,
  sanitizeECSDiagnosticText,
  sanitizeECSDiagnosticValue,
} = diagnosticRedactionCore;

export const VERIFICATION_ARTIFACT_SCHEMAS = Object.freeze({
  LANE: 'ecs.verification-lane-artifact.v5',
  INVENTORY: 'ecs.verification-inventory-artifact.v3',
  PROVENANCE: 'ecs.verification-provenance-artifact.v2',
  TIMINGS: 'ecs.verification-timings-artifact.v3',
  RELEASE_EVIDENCE: 'ecs.verification-release-evidence-artifact.v1',
});
const LEGACY_TIMINGS_ARTIFACT_SCHEMA = 'ecs.verification-timings-artifact.v2';
const PROCESS_FAILURE_CLASSES = new Set([
  'application_build_failure',
  'verification_wrapper_failure',
  'environment_process_spawn_restriction',
  'timeout',
  'permission_failure',
]);

export const VERIFICATION_ARTIFACT_AUDIENCES = Object.freeze({
  PULL_REQUEST: 'pull_request',
  SCHEDULED_CI: 'scheduled_ci',
  RESTRICTED_FIELD_TEST: 'restricted_field_test',
  RELEASE_CANDIDATE: 'release_candidate',
});

export const VERIFICATION_ARTIFACT_POLICY_VERSION = 4;

const ARTIFACT_POLICIES = Object.freeze({
  [VERIFICATION_ARTIFACT_AUDIENCES.PULL_REQUEST]: Object.freeze({
    retentionDays: 5,
    rawFieldDataAllowed: false,
    artifactKinds: Object.freeze(['inventory', 'lane', 'release_evidence', 'summary', 'timings']),
  }),
  [VERIFICATION_ARTIFACT_AUDIENCES.SCHEDULED_CI]: Object.freeze({
    retentionDays: 7,
    rawFieldDataAllowed: false,
    artifactKinds: Object.freeze(['lane', 'release_evidence', 'summary', 'timings', 'provenance']),
  }),
  [VERIFICATION_ARTIFACT_AUDIENCES.RESTRICTED_FIELD_TEST]: Object.freeze({
    retentionDays: 3,
    rawFieldDataAllowed: false,
    artifactKinds: Object.freeze(['lane', 'release_evidence', 'summary', 'timings', 'provenance_digest_only']),
  }),
  [VERIFICATION_ARTIFACT_AUDIENCES.RELEASE_CANDIDATE]: Object.freeze({
    retentionDays: 14,
    rawFieldDataAllowed: false,
    artifactKinds: Object.freeze(['lane', 'release_evidence', 'summary', 'timings', 'provenance']),
  }),
});

const CHECK_FIELDS = new Set([
  'checkId',
  'status',
  'safeCode',
  'failureCode',
  'failureClass',
  'durationMs',
  'workspaceId',
  'packageId',
  'scriptIdentity',
  'workingDirectoryId',
  'attemptCount',
  'summary',
  'blockerIds',
  'commitSha',
  'evidenceDigest',
  'exitCode',
  'signal',
  'resultContract',
  'evidenceClass',
  'evidenceQuality',
  'executionEnvironment',
  'timing',
]);

const INVENTORY_SUMMARY_FIELDS = [
  'packageCount',
  'packageScriptCount',
  'testCount',
  'gateCount',
  'workflowCount',
  'evidenceDocumentCount',
  'runtimeBehaviorCount',
  'hybridCount',
  'sourceContractCount',
  'evidenceOnlyCount',
  'unmeasuredDurationCount',
  'uncontrolledNetworkCount',
  'unresolvedCommandCount',
  'unresolvedVerificationCommandCount',
  'policyReferenceErrorCount',
  'declaredScenarioCount',
  'executedScenarioCount',
  'passedScenarioCount',
  'verifiedScenarioCount',
  'provisionalScenarioCount',
  'unsupportedScenarioCount',
  'mismatchScenarioCount',
  'coverageStrictFailureCount',
  'sourceInspectionWarningCount',
  'policyConfidenceMismatchCount',
];

const STATUS_VALUES = new Set(['passed', 'blocked_external', 'failed']);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9*@][A-Za-z0-9*@_.:/-]{0,159}$/;
const SHA_PATTERN = /^[a-f0-9]{7,64}$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const validatedArtifacts = new WeakSet();

function fail(message) {
  throw new Error(`Invalid ECS verification artifact: ${message}`);
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function requiredIdentifier(value, field) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    fail(`${field} must be a safe identifier.`);
  }
  return value;
}

function optionalIdentifier(value, field) {
  if (value == null) return null;
  return requiredIdentifier(value, field);
}

function normalizedIdentifier(value, fallback = 'unknown') {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim()
    .replace(/[^A-Za-z0-9*@_.:/-]+/g, '_')
    .replace(/^[_./:-]+|[_./:-]+$/g, '')
    .slice(0, 160);
  return normalized && IDENTIFIER_PATTERN.test(normalized) ? normalized : fallback;
}

function finiteNonnegative(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    fail(`${field} must be a finite nonnegative number.`);
  }
  return value;
}

function optionalFinite(value, field, { nonnegative = false } = {}) {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || (nonnegative && value < 0)) {
    fail(`${field} must be null or a finite${nonnegative ? ' nonnegative' : ''} number.`);
  }
  return value;
}

function finiteInteger(value, field, fallback = null) {
  if (value == null && fallback !== null) return fallback;
  if (!Number.isInteger(value) || value < 0) fail(`${field} must be a nonnegative integer.`);
  return value;
}

function safeTimestamp(value, field) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(`${field} must be an ISO timestamp.`);
  return new Date(value).toISOString();
}

function safeSummary(value, maxLength = 500) {
  if (typeof value !== 'string' || !value.trim()) fail('summary must be a non-empty string.');
  return sanitizeECSDiagnosticText(value, maxLength);
}

function safeIdentifierArray(value, field) {
  if (!Array.isArray(value)) fail(`${field} must be an array.`);
  const result = value.map((entry, index) => requiredIdentifier(entry, `${field}[${index}]`));
  if (new Set(result).size !== result.length) fail(`${field} must not contain duplicates.`);
  return [...result].sort();
}

function policyEnvelope(audience, artifactKind) {
  const policy = getVerificationArtifactPolicy(audience);
  if (!policy.artifactKinds.includes(artifactKind)) {
    fail(`artifact kind "${artifactKind}" is not approved for audience "${audience}".`);
  }
  return {
    policyVersion: VERIFICATION_ARTIFACT_POLICY_VERSION,
    audience,
    retentionDays: policy.retentionDays,
    rawFieldDataAllowed: false,
  };
}

function workspaceFromPackageKey(packageScriptKey) {
  const packagePath = typeof packageScriptKey === 'string' ? packageScriptKey.split('::')[0] : 'package.json';
  if (packagePath === 'package.json' || packagePath === 'root') return 'root';
  const normalized = packagePath.replaceAll('\\', '/').replace(/\/package\.json$/i, '');
  return normalizedIdentifier(normalized, createECSDiagnosticToken('workspace', packagePath) ?? 'workspace_unknown');
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map(stableSortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value).sort().reduce((result, key) => {
    const entry = value[key];
    if (entry !== undefined) result[key] = stableSortValue(entry);
    return result;
  }, {});
}

function markValidatedArtifact(value) {
  const seen = new WeakSet();
  const freeze = (entry) => {
    if (!entry || typeof entry !== 'object' || seen.has(entry)) return entry;
    seen.add(entry);
    for (const child of Object.values(entry)) freeze(child);
    return Object.freeze(entry);
  };
  freeze(value);
  validatedArtifacts.add(value);
  return value;
}

export function getVerificationArtifactPolicy(audience) {
  const policy = ARTIFACT_POLICIES[audience];
  if (!policy) fail(`unsupported artifact audience "${String(audience)}".`);
  return policy;
}

export function sanitizeVerificationArtifactValue(value) {
  return sanitizeECSDiagnosticValue(value, {
    maxDepth: 8,
    maxArrayLength: 32,
    maxObjectKeys: 40,
    maxStringLength: 500,
  });
}

export function sanitizeVerificationArtifactText(value, maxLength = 500) {
  return sanitizeECSDiagnosticText(value, maxLength);
}

export function serializeVerificationArtifact(value) {
  const safeValue = value && typeof value === 'object' && validatedArtifacts.has(value)
    ? value
    : sanitizeVerificationArtifactValue(value);
  return `${JSON.stringify(stableSortValue(safeValue), null, 2)}\n`;
}

function safeTimingComparison(value) {
  if (value == null) return null;
  if (!isRecord(value)) fail('timing comparison must be an object.');
  const allowed = new Set([
    'checkId', 'timingIdentity', 'status', 'reason', 'measuredDurationMs', 'baselineMedianMs',
    'baselineP95Ms', 'lastAcceptedDurationMs', 'allowanceMs', 'deltaMs', 'deltaPct',
    'sampleCount', 'baselineVersion', 'baselineSource', 'runtimeIdentity',
  ]);
  const unexpected = Object.keys(value).filter((field) => !allowed.has(field));
  if (unexpected.length > 0) fail(`timing comparison contains unsupported fields: ${unexpected.join(', ')}.`);
  const statuses = new Set(['within_budget', 'regressed', 'improved', 'provisional', 'incomparable']);
  if (!statuses.has(value.status)) fail('timing comparison status is invalid.');
  return {
    identity: optionalIdentifier(value.timingIdentity, 'timing.identity'),
    status: value.status,
    reason: requiredIdentifier(value.reason, 'timing.reason'),
    measuredDurationMs: optionalFinite(value.measuredDurationMs, 'timing.measuredDurationMs', { nonnegative: true }),
    baselineMedianMs: optionalFinite(value.baselineMedianMs, 'timing.baselineMedianMs', { nonnegative: true }),
    baselineP95Ms: optionalFinite(value.baselineP95Ms, 'timing.baselineP95Ms', { nonnegative: true }),
    lastAcceptedDurationMs: optionalFinite(
      value.lastAcceptedDurationMs,
      'timing.lastAcceptedDurationMs',
      { nonnegative: true },
    ),
    allowanceMs: optionalFinite(value.allowanceMs, 'timing.allowanceMs', { nonnegative: true }),
    deltaMs: optionalFinite(value.deltaMs, 'timing.deltaMs'),
    deltaPct: optionalFinite(value.deltaPct, 'timing.deltaPct'),
    sampleCount: finiteInteger(value.sampleCount, 'timing.sampleCount', 0),
    baselineVersion: optionalIdentifier(value.baselineVersion, 'timing.baselineVersion'),
    baselineSource: optionalIdentifier(value.baselineSource, 'timing.baselineSource'),
    runtimeIdentity: requiredIdentifier(value.runtimeIdentity, 'timing.runtimeIdentity'),
  };
}

export function buildVerificationCheckDiagnostic(input) {
  if (!isRecord(input)) fail('check diagnostic must be an object.');
  for (const key of Object.keys(input)) {
    if (!CHECK_FIELDS.has(key)) fail(`check diagnostic contains unsupported field "${key}" outside the allowlist.`);
  }
  const checkId = requiredIdentifier(input.checkId, 'checkId');
  if (!STATUS_VALUES.has(input.status)) fail('status must be passed, blocked_external, or failed.');
  const blockerIds = safeIdentifierArray(input.blockerIds ?? [], 'blockerIds');
  if (input.status === 'blocked_external' && blockerIds.length === 0) {
    fail('blocked_external diagnostics require blocker IDs.');
  }
  if (input.status !== 'blocked_external' && blockerIds.length > 0) {
    fail('only blocked_external diagnostics may retain blocker IDs.');
  }
  if (input.commitSha != null && (typeof input.commitSha !== 'string' || !SHA_PATTERN.test(input.commitSha))) {
    fail('commitSha must be a hexadecimal Git identifier.');
  }
  if (input.evidenceDigest != null
    && (typeof input.evidenceDigest !== 'string' || !DIGEST_PATTERN.test(input.evidenceDigest))) {
    fail('evidenceDigest must be a SHA-256 digest.');
  }
  if (input.exitCode != null && !Number.isInteger(input.exitCode)) fail('exitCode must be an integer or null.');
  if (input.failureClass != null && !PROCESS_FAILURE_CLASSES.has(input.failureClass)) {
    fail('failureClass must use an approved verification process classification.');
  }

  return {
    checkId,
    status: input.status,
    safeCode: optionalIdentifier(input.safeCode, 'safeCode'),
    failureCode: optionalIdentifier(input.failureCode, 'failureCode'),
    failureClass: optionalIdentifier(input.failureClass, 'failureClass'),
    durationMs: finiteNonnegative(input.durationMs, 'durationMs'),
    workspaceId: requiredIdentifier(input.workspaceId, 'workspaceId'),
    packageId: requiredIdentifier(input.packageId, 'packageId'),
    scriptIdentity: optionalIdentifier(input.scriptIdentity, 'scriptIdentity'),
    workingDirectoryId: requiredIdentifier(input.workingDirectoryId ?? input.workspaceId, 'workingDirectoryId'),
    attemptCount: finiteInteger(input.attemptCount, 'attemptCount', 1),
    summary: safeSummary(input.summary),
    blockerIds,
    commitSha: input.commitSha?.toLowerCase() ?? null,
    evidenceDigest: input.evidenceDigest?.toLowerCase() ?? null,
    exitCode: input.exitCode ?? null,
    signal: optionalIdentifier(input.signal, 'signal'),
    resultContract: optionalIdentifier(input.resultContract, 'resultContract'),
    evidenceClass: optionalIdentifier(input.evidenceClass, 'evidenceClass'),
    evidenceQuality: optionalIdentifier(input.evidenceQuality, 'evidenceQuality'),
    executionEnvironment: optionalIdentifier(input.executionEnvironment, 'executionEnvironment'),
    timing: safeTimingComparison(input.timing),
  };
}

function safeCoverageFailure(value) {
  if (!isRecord(value)) fail('coverage failure must be an object.');
  return {
    code: requiredIdentifier(value.code, 'coverageFailure.code'),
    capabilityId: optionalIdentifier(value.capabilityId, 'coverageFailure.capabilityId'),
    scenarioId: optionalIdentifier(value.scenarioId, 'coverageFailure.scenarioId'),
    checkId: optionalIdentifier(value.checkId, 'coverageFailure.checkId'),
    reason: requiredIdentifier(value.reason, 'coverageFailure.reason'),
    phase: requiredIdentifier(value.phase, 'coverageFailure.phase'),
  };
}

function safeCoverageMatrix(matrix) {
  if (!isRecord(matrix) || !Array.isArray(matrix.capabilities)) fail('coverage matrix must contain capabilities.');
  const capabilities = matrix.capabilities.map((capability) => ({
    capabilityId: requiredIdentifier(capability.capabilityId, 'coverage.capabilityId'),
    label: safeSummary(capability.label, 120),
    phase: requiredIdentifier(capability.phase, 'coverage.phase'),
    scenarioCount: finiteInteger(capability.scenarioCount, 'coverage.scenarioCount'),
    satisfiedScenarioCount: finiteInteger(capability.satisfiedScenarioCount, 'coverage.satisfiedScenarioCount'),
    coverageSatisfied: capability.coverageSatisfied === true,
    confidenceLevel: requiredIdentifier(capability.confidenceLevel, 'coverage.confidenceLevel'),
    remainingEvidence: safeIdentifierArray(capability.remainingEvidence ?? [], 'coverage.remainingEvidence'),
    possibleExternalBlockerIds: safeIdentifierArray(
      capability.possibleExternalBlockerIds ?? [],
      'coverage.possibleExternalBlockerIds',
    ),
    productionApproval: normalizedIdentifier(capability.productionApproval, 'not_granted_by_coverage_matrix'),
    scenarios: (capability.scenarios ?? []).map((scenario) => ({
      scenarioId: requiredIdentifier(scenario.scenarioId, 'coverage.scenarioId'),
      requiredEvidenceClasses: safeIdentifierArray(
        scenario.requiredEvidenceClasses ?? [],
        'coverage.requiredEvidenceClasses',
      ),
      declaredChecks: (scenario.declaredChecks ?? []).map((check) => ({
        checkId: requiredIdentifier(check.checkId, 'coverage.declaredCheck.checkId'),
        qualifiedIdentity: normalizedIdentifier(check.qualifiedIdentity, check.checkId),
        evidenceClass: requiredIdentifier(check.evidenceClass, 'coverage.declaredCheck.evidenceClass'),
        evidenceQuality: requiredIdentifier(check.evidenceQuality, 'coverage.declaredCheck.evidenceQuality'),
        executionEnvironment: requiredIdentifier(
          check.executionEnvironment,
          'coverage.declaredCheck.executionEnvironment',
        ),
      })),
      selectedCheckIds: safeIdentifierArray(scenario.selectedChecks ?? [], 'coverage.selectedChecks'),
      executedCheckIds: safeIdentifierArray(scenario.executedChecks ?? [], 'coverage.executedChecks'),
      passingCheckIds: safeIdentifierArray(scenario.passingChecks ?? [], 'coverage.passingChecks'),
      verifiedEvidenceClasses: safeIdentifierArray(
        scenario.verifiedEvidenceClasses ?? [],
        'coverage.verifiedEvidenceClasses',
      ),
      states: safeIdentifierArray(scenario.coverageStates ?? [], 'coverage.states'),
      state: requiredIdentifier(scenario.state, 'coverage.state'),
      coverageSatisfied: scenario.coverageSatisfied === true,
      confidenceLevel: requiredIdentifier(scenario.confidenceLevel, 'coverage.confidenceLevel'),
      remainingEvidence: safeIdentifierArray(scenario.remainingEvidence ?? [], 'coverage.remainingEvidence'),
      warnings: safeIdentifierArray(scenario.warnings ?? [], 'coverage.warnings'),
      reason: safeSummary(scenario.reason, 500),
      enforced: scenario.enforced === true,
    })),
  }));
  const summary = isRecord(matrix.summary) ? matrix.summary : {};
  return {
    schemaVersion: finiteInteger(matrix.schemaVersion, 'coverage.schemaVersion'),
    phase: requiredIdentifier(matrix.phase, 'coverage.phase'),
    laneId: optionalIdentifier(matrix.laneId, 'coverage.laneId'),
    summary: {
      capabilityCount: finiteInteger(summary.capabilityCount, 'coverage.summary.capabilityCount'),
      scenarioCount: finiteInteger(summary.scenarioCount, 'coverage.summary.scenarioCount'),
      satisfiedScenarioCount: finiteInteger(
        summary.satisfiedScenarioCount,
        'coverage.summary.satisfiedScenarioCount',
      ),
      strictFailureCount: finiteInteger(summary.strictFailureCount, 'coverage.summary.strictFailureCount'),
      provisionalScenarioCount: finiteInteger(
        summary.provisionalScenarioCount,
        'coverage.summary.provisionalScenarioCount',
      ),
      mismatchScenarioCount: finiteInteger(
        summary.mismatchScenarioCount,
        'coverage.summary.mismatchScenarioCount',
      ),
    },
    productionApproval: normalizedIdentifier(matrix.productionApproval, 'not_granted_by_coverage_matrix'),
    capabilities,
  };
}

function safeWorkflowEvidence(value) {
  if (!isRecord(value) || value.resultContract !== PGTAP_WORKFLOW_EVIDENCE_CONTRACT) {
    fail('workflow evidence must use the registered pgTAP evidence contract.');
  }
  if (!isRecord(value.binding)) fail('workflow evidence binding is required.');
  for (const [field, digest] of [
    ['migrationDigest', value.binding.migrationDigest],
    ['schemaTestConfigDigest', value.binding.schemaTestConfigDigest],
    ['artifactDigest', value.artifactDigest],
    ['evidenceDigest', value.evidenceDigest],
  ]) {
    if (digest != null && (typeof digest !== 'string' || !DIGEST_PATTERN.test(digest))) {
      fail(`workflow evidence ${field} must be a SHA-256 digest.`);
    }
  }
  if (typeof value.commitSha !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value.commitSha)) {
    fail('workflow evidence commitSha must be an exact Git commit SHA.');
  }
  return {
    checkId: requiredIdentifier(value.checkId, 'workflowEvidence.checkId'),
    resultContract: requiredIdentifier(value.resultContract, 'workflowEvidence.resultContract'),
    workflowId: normalizedIdentifier(value.workflow, 'registered_workflow'),
    status: STATUS_VALUES.has(value.status) ? value.status : fail('workflow evidence status is invalid.'),
    safeCode: requiredIdentifier(value.safeCode, 'workflowEvidence.safeCode'),
    testResult: requiredIdentifier(value.testResult, 'workflowEvidence.testResult'),
    commitSha: value.commitSha.toLowerCase(),
    migrationDigest: value.binding.migrationDigest.toLowerCase(),
    migrationFileCount: finiteInteger(value.binding.migrationFileCount, 'workflowEvidence.migrationFileCount'),
    schemaTestConfigDigest: value.binding.schemaTestConfigDigest.toLowerCase(),
    schemaTestConfigVersion: requiredIdentifier(
      value.binding.schemaTestConfigVersion,
      'workflowEvidence.schemaTestConfigVersion',
    ),
    requiredSuiteCount: finiteInteger(value.binding.requiredSuiteCount, 'workflowEvidence.requiredSuiteCount'),
    executedSuiteIds: safeIdentifierArray(value.executedSuiteIds ?? [], 'workflowEvidence.executedSuiteIds'),
    executedAt: safeTimestamp(value.executedAt, 'workflowEvidence.executedAt'),
    durationMs: finiteNonnegative(value.durationMs, 'workflowEvidence.durationMs'),
    artifactDigest: value.artifactDigest?.toLowerCase() ?? null,
    evidenceDigest: value.evidenceDigest.toLowerCase(),
  };
}

export function buildVerificationLaneArtifact(result, options = {}) {
  if (!isRecord(result) || !Array.isArray(result.results)) fail('lane result must contain a results array.');
  const audience = options.audience ?? VERIFICATION_ARTIFACT_AUDIENCES.PULL_REQUEST;
  const checks = result.results.map((check) => buildVerificationCheckDiagnostic({
    checkId: check.checkId,
    status: check.status,
    safeCode: check.safeCode ?? null,
    failureCode: check.failureCode ?? null,
    failureClass: check.failureClass ?? null,
    durationMs: Number.isFinite(check.durationMs) ? check.durationMs : 0,
    workspaceId: normalizedIdentifier(check.workspace, workspaceFromPackageKey(check.scriptIdentity)),
    packageId: normalizedIdentifier(check.packageName ?? check.packageScript ?? check.checkId, check.checkId),
    scriptIdentity: check.scriptIdentity ?? null,
    workingDirectoryId: normalizedIdentifier(check.workspace, 'root'),
    attemptCount: 1,
    summary: typeof check.summary === 'string' && check.summary.trim() ? check.summary : `${check.checkId} ${check.status}.`,
    blockerIds: check.evidenceBlockers ?? [],
    commitSha: check.evidenceResult?.commitSha ?? null,
    evidenceDigest: check.evidenceResult?.evidenceDigest ?? null,
    exitCode: check.exitCode ?? null,
    signal: check.signal ?? null,
    resultContract: check.resultContract ?? null,
    evidenceClass: check.evidenceClass ?? null,
    evidenceQuality: check.evidenceQuality ?? null,
    executionEnvironment: check.executionEnvironment ?? null,
    timing: check.timing ?? null,
  }));
  const provenance = isRecord(result.provenance) ? result.provenance : {};
  const ci = isRecord(provenance.ci) ? provenance.ci : {};
  const commitSha = typeof provenance.commit === 'string' && SHA_PATTERN.test(provenance.commit)
    ? provenance.commit.toLowerCase()
    : null;
  const packageLockDigest = typeof provenance.packageLockSha256 === 'string'
    && DIGEST_PATTERN.test(provenance.packageLockSha256)
    ? provenance.packageLockSha256.toLowerCase()
    : null;

  const coverage = safeCoverageMatrix(result.coverageMatrix);
  const coverageFailures = (result.coverageStrictFailures ?? []).map(safeCoverageFailure);
  const workflowEvidence = result.results
    .map((check) => check.evidenceResult)
    .filter((evidence) => evidence?.resultContract === PGTAP_WORKFLOW_EVIDENCE_CONTRACT)
    .map(safeWorkflowEvidence);
  return markValidatedArtifact({
    schemaVersion: VERIFICATION_ARTIFACT_SCHEMAS.LANE,
    artifactPolicy: policyEnvelope(audience, 'lane'),
    generatedAt: safeTimestamp(result.generatedAt, 'generatedAt'),
    policyVersion: normalizedIdentifier(result.policyVersion, 'unknown_policy'),
    lane: {
      id: requiredIdentifier(result.laneId, 'laneId'),
      status: STATUS_VALUES.has(result.status) ? result.status : fail('lane status is invalid.'),
      codeChecksPassed: result.codeChecksPassed === true,
      coverageChecksPassed: result.coverageChecksPassed === true,
      coverageEnforcement: requiredIdentifier(result.coverageEnforcement, 'coverageEnforcement'),
      productionApproval: normalizedIdentifier(result.productionApproval, 'not_granted_by_code_checks'),
      productionApprovalStatus: normalizedIdentifier(result.productionApprovalStatus, 'pending'),
      durationMs: finiteNonnegative(result.durationMs, 'durationMs'),
      budgetMs: finiteNonnegative(result.laneBudgetMs, 'laneBudgetMs'),
      budgetStatus: requiredIdentifier(result.budgetStatus, 'budgetStatus'),
      timingChecksPassed: result.timingChecksPassed !== false,
      timingGatePassed: result.timingGatePassed !== false,
      timingEnforcement: normalizedIdentifier(result.timingEnforcement, 'off'),
      timingBaselineStatus: normalizedIdentifier(result.timingBaselineStatus, 'disabled'),
      timingBaselineVersion: optionalIdentifier(result.timingBaselineVersion, 'timingBaselineVersion'),
      timingBaselineSource: optionalIdentifier(result.timingBaselineSource, 'timingBaselineSource'),
      timingRegressedCheckCount: finiteInteger(result.timingRegressedCheckIds?.length ?? 0, 'timingRegressedCheckCount'),
      timingProvisionalCheckCount: finiteInteger(
        result.timingProvisionalCheckIds?.length ?? 0,
        'timingProvisionalCheckCount',
      ),
      timingIncomparableCheckCount: finiteInteger(
        result.timingIncomparableCheckIds?.length ?? 0,
        'timingIncomparableCheckCount',
      ),
      maxParallel: finiteInteger(result.maxParallel, 'maxParallel'),
      selectionReason: normalizedIdentifier(result.selectionReason, 'unknown'),
      blockerIds: safeIdentifierArray(result.externalEvidenceBlockers ?? [], 'externalEvidenceBlockers'),
      checkCount: checks.length,
      coverageFailureCount: coverageFailures.length,
    },
    provenance: {
      commitSha,
      dirty: typeof provenance.dirty === 'boolean' ? provenance.dirty : null,
      packageLockDigest,
      ci: {
        provider: normalizedIdentifier(ci.provider, 'local'),
        runId: ci.runId == null ? null : normalizedIdentifier(String(ci.runId), 'unavailable'),
        runAttempt: ci.runAttempt == null ? null : normalizedIdentifier(String(ci.runAttempt), 'unavailable'),
      },
    },
    coverage,
    coverageFailures,
    workflowEvidence,
    checks,
  });
}

function safeDuration(value) {
  if (!isRecord(value)) return { state: 'unmeasured', sampleCount: 0, medianMs: null, p95Ms: null };
  return {
    state: normalizedIdentifier(value.state, 'unmeasured'),
    sampleCount: Number.isInteger(value.sampleCount) && value.sampleCount >= 0 ? value.sampleCount : 0,
    medianMs: typeof value.medianMs === 'number' && Number.isFinite(value.medianMs) ? value.medianMs : null,
    p95Ms: typeof value.p95Ms === 'number' && Number.isFinite(value.p95Ms) ? value.p95Ms : null,
  };
}

export function buildVerificationInventoryArtifact(inventory, options = {}) {
  if (!isRecord(inventory) || !Array.isArray(inventory.scripts)) fail('inventory must contain a scripts array.');
  const audience = options.audience ?? VERIFICATION_ARTIFACT_AUDIENCES.PULL_REQUEST;
  const summary = {};
  for (const key of INVENTORY_SUMMARY_FIELDS) {
    const value = inventory.summary?.[key];
    summary[key] = Number.isFinite(value) && value >= 0 ? value : 0;
  }
  const coverage = safeCoverageMatrix(inventory.coverageMatrix);
  const scripts = inventory.scripts.map((entry) => {
    const legacyPackageKey = `${entry.packagePath ?? 'package.json'}::${entry.name ?? 'unknown'}`;
    const workspaceId = normalizedIdentifier(
      entry.workspace,
      workspaceFromPackageKey(entry.scriptIdentity ?? legacyPackageKey),
    );
    const qualifiedScriptIdentity = entry.scriptIdentity ?? `${workspaceId}::${entry.name ?? 'unknown'}`;
    return {
      workspaceId,
      packageId: normalizedIdentifier(
        entry.packageName ?? entry.name,
        createECSDiagnosticToken('package', entry.key) ?? 'package_unknown',
      ),
      scriptIdentity: requiredIdentifier(qualifiedScriptIdentity, 'scriptIdentity'),
      workingDirectoryId: workspaceId,
      checkId: entry.policyCheckId == null ? null : normalizedIdentifier(entry.policyCheckId),
      kind: normalizedIdentifier(entry.kind, 'unknown'),
      executionModel: normalizedIdentifier(entry.executionModel, 'unknown'),
      targetType: normalizedIdentifier(entry.target?.type, 'unknown'),
      targetExists: entry.target?.exists === true,
      capabilityIds: (entry.capabilities ?? []).map((value) => normalizedIdentifier(value)).sort(),
      classifications: (entry.classifications ?? []).map((value) => normalizedIdentifier(value)).sort(),
      qualifiedTestIdentities: (entry.qualifiedTestIdentities ?? [])
        .map((value) => normalizedIdentifier(value))
        .sort(),
      duration: safeDuration(entry.duration),
      confidence: entry.policyConfidence == null ? null : normalizedIdentifier(entry.policyConfidence),
      evidenceClass: normalizedIdentifier(entry.evidenceClass, 'unknown'),
      evidenceQuality: normalizedIdentifier(entry.evidenceQuality, 'provisional'),
      executionEnvironment: normalizedIdentifier(entry.executionEnvironment, 'unknown'),
      assertionCount: Number.isInteger(entry.assertionCount) && entry.assertionCount >= 0 ? entry.assertionCount : 0,
      targetRuntimeObserved: entry.importsRuntimeCode === true,
      mockOrFixtureObserved: entry.usesFixturesOrMocks === true,
      observedNetworkMode: normalizedIdentifier(entry.networkDependency, 'unknown'),
      resultContract: entry.resultContract == null ? null : normalizedIdentifier(entry.resultContract),
      productionApproval: normalizedIdentifier(entry.productionApproval, 'not_granted_by_code_checks'),
      riskCodes: (entry.falseConfidenceRisks ?? []).map((value) => normalizedIdentifier(value)).sort(),
    };
  });

  return markValidatedArtifact({
    schemaVersion: VERIFICATION_ARTIFACT_SCHEMAS.INVENTORY,
    artifactPolicy: policyEnvelope(audience, 'inventory'),
    generatedAt: safeTimestamp(inventory.generatedAt, 'generatedAt'),
    policyVersion: normalizedIdentifier(inventory.policyVersion, 'unknown_policy'),
    productionApproval: normalizedIdentifier(inventory.productionApproval, 'not_granted_by_inventory'),
    summary,
    coverage,
    scripts,
  });
}

export function buildVerificationProvenanceArtifact(input) {
  if (!isRecord(input)) fail('provenance input must be an object.');
  const audience = input.audience ?? VERIFICATION_ARTIFACT_AUDIENCES.RELEASE_CANDIDATE;
  const digest = requiredIdentifier(input.artifactDigest, 'artifactDigest');
  if (!DIGEST_PATTERN.test(digest)) fail('artifactDigest must be a SHA-256 digest.');
  return markValidatedArtifact({
    schemaVersion: VERIFICATION_ARTIFACT_SCHEMAS.PROVENANCE,
    artifactPolicy: policyEnvelope(
      audience,
      audience === VERIFICATION_ARTIFACT_AUDIENCES.RESTRICTED_FIELD_TEST
        ? 'provenance_digest_only'
        : 'provenance',
    ),
    generatedAt: safeTimestamp(input.generatedAt, 'generatedAt'),
    commandId: requiredIdentifier(input.commandId, 'commandId'),
    workspaceId: requiredIdentifier(input.workspaceId, 'workspaceId'),
    artifact: {
      id: requiredIdentifier(input.artifactId, 'artifactId'),
      kind: requiredIdentifier(input.artifactKind, 'artifactKind'),
      fileCount: finiteInteger(input.fileCount, 'fileCount'),
      sizeBytes: finiteInteger(input.sizeBytes, 'sizeBytes'),
      sha256: digest.toLowerCase(),
    },
    ci: {
      provider: normalizedIdentifier(input.ci?.provider, 'local'),
      runId: input.ci?.runId == null ? null : normalizedIdentifier(String(input.ci.runId), 'unavailable'),
      runAttempt: input.ci?.runAttempt == null ? null : normalizedIdentifier(String(input.ci.runAttempt), 'unavailable'),
      sourceCommit: typeof input.ci?.sourceCommit === 'string' && SHA_PATTERN.test(input.ci.sourceCommit)
        ? input.ci.sourceCommit.toLowerCase()
        : null,
    },
    productionApproval: 'not_granted_by_artifact_creation',
  });
}

function safeReleaseEvidenceNotes(value, field) {
  if (!isRecord(value) || typeof value.summary !== 'string' || !value.summary.trim()) {
    fail(`${field} must contain a safe summary.`);
  }
  if (value.limitations != null && (typeof value.limitations !== 'string' || !value.limitations.trim())) {
    fail(`${field}.limitations must be a non-empty string when present.`);
  }
  return {
    summary: safeSummary(value.summary, 300),
    limitations: value.limitations == null
      ? null
      : sanitizeVerificationArtifactText(value.limitations, 300),
    ticketId: optionalIdentifier(value.ticketId, `${field}.ticketId`),
  };
}

function safeReleaseEvidenceRequirement(value, index) {
  if (!isRecord(value)) fail(`release evidence requirement ${index} must be an object.`);
  const statuses = new Set(['missing', 'planned', 'collected', 'accepted', 'rejected', 'expired']);
  if (!statuses.has(value.status)) fail(`release evidence requirement ${index} status is invalid.`);
  return {
    evidenceId: requiredIdentifier(value.evidenceId, `requirements[${index}].evidenceId`),
    capability: requiredIdentifier(value.capability, `requirements[${index}].capability`),
    feature: requiredIdentifier(value.feature, `requirements[${index}].feature`),
    evidenceClass: requiredIdentifier(value.evidenceClass, `requirements[${index}].evidenceClass`),
    status: value.status,
    resolved: value.resolved === true,
    reasonCode: requiredIdentifier(value.reasonCode, `requirements[${index}].reasonCode`),
    requiredScenario: requiredIdentifier(
      value.requiredScenario,
      `requirements[${index}].requiredScenario`,
    ),
    targetPlatform: safeIdentifierArray(
      value.targetPlatform ?? [],
      `requirements[${index}].targetPlatform`,
    ),
    ownerRole: requiredIdentifier(value.ownerRole, `requirements[${index}].ownerRole`),
    reviewerRole: requiredIdentifier(value.reviewerRole, `requirements[${index}].reviewerRole`),
    collectionDate: value.collectionDate == null
      ? null
      : safeTimestamp(value.collectionDate, `requirements[${index}].collectionDate`),
    expiresAt: value.expiresAt == null
      ? null
      : safeTimestamp(value.expiresAt, `requirements[${index}].expiresAt`),
    artifactDigest: value.artifactDigest == null
      ? null
      : (DIGEST_PATTERN.test(value.artifactDigest)
        ? value.artifactDigest.toLowerCase()
        : fail(`requirements[${index}].artifactDigest must be a SHA-256 digest.`)),
    artifactReference: optionalIdentifier(
      value.artifactReference,
      `requirements[${index}].artifactReference`,
    ),
    observedBuildSha: value.observedBuildSha == null
      ? null
      : (SHA_PATTERN.test(value.observedBuildSha)
        ? value.observedBuildSha.toLowerCase()
        : fail(`requirements[${index}].observedBuildSha must be a Git SHA.`)),
    notes: safeReleaseEvidenceNotes(value.notes, `requirements[${index}].notes`),
  };
}

export function buildVerificationReleaseEvidenceArtifact(report, options = {}) {
  if (!isRecord(report) || report.resultContract !== 'ecs-release-evidence-report-v1') {
    fail('release evidence report must use the registered report contract.');
  }
  if (!Array.isArray(report.requirements)) fail('release evidence report requires requirement rows.');
  const audience = options.audience ?? VERIFICATION_ARTIFACT_AUDIENCES.RELEASE_CANDIDATE;
  const statuses = new Set(['passed', 'blocked_external']);
  if (!statuses.has(report.status)) fail('release evidence report status is invalid.');
  const target = isRecord(report.target) ? report.target : {};
  const approval = isRecord(report.productionApproval) ? report.productionApproval : {};
  const summary = isRecord(report.summary) ? report.summary : {};

  const safeDigest = (value, field) => {
    if (value == null) return null;
    if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) fail(`${field} must be a SHA-256 digest.`);
    return value.toLowerCase();
  };
  const safeSha = (value, field) => {
    if (value == null) return null;
    if (typeof value !== 'string' || !SHA_PATTERN.test(value)) fail(`${field} must be a Git SHA.`);
    return value.toLowerCase();
  };

  return markValidatedArtifact({
    schemaVersion: VERIFICATION_ARTIFACT_SCHEMAS.RELEASE_EVIDENCE,
    artifactPolicy: policyEnvelope(audience, 'release_evidence'),
    generatedAt: safeTimestamp(report.generatedAt, 'generatedAt'),
    resultContract: requiredIdentifier(report.resultContract, 'resultContract'),
    registryVersion: requiredIdentifier(report.registryVersion, 'registryVersion'),
    status: report.status,
    safeCode: requiredIdentifier(report.safeCode, 'safeCode'),
    target: {
      buildSha: safeSha(target.buildSha, 'target.buildSha'),
      buildArtifactDigest: safeDigest(target.buildArtifactDigest, 'target.buildArtifactDigest'),
      migrationDigest: safeDigest(target.migrationDigest, 'target.migrationDigest'),
      providerEnvironment: optionalIdentifier(target.providerEnvironment, 'target.providerEnvironment'),
    },
    productionApproval: {
      status: requiredIdentifier(approval.status, 'productionApproval.status'),
      decision: requiredIdentifier(approval.decision, 'productionApproval.decision'),
      ownerRole: requiredIdentifier(approval.ownerRole, 'productionApproval.ownerRole'),
      reviewerRole: requiredIdentifier(approval.reviewerRole, 'productionApproval.reviewerRole'),
      reviewedAt: approval.reviewedAt == null
        ? null
        : safeTimestamp(approval.reviewedAt, 'productionApproval.reviewedAt'),
      artifactDigest: safeDigest(approval.artifactDigest, 'productionApproval.artifactDigest'),
      artifactReference: optionalIdentifier(
        approval.artifactReference,
        'productionApproval.artifactReference',
      ),
      notes: safeReleaseEvidenceNotes(approval.notes, 'productionApproval.notes'),
    },
    summary: {
      requirementCount: finiteInteger(summary.requirementCount, 'summary.requirementCount'),
      acceptedCount: finiteInteger(summary.acceptedCount, 'summary.acceptedCount'),
      unresolvedCount: finiteInteger(summary.unresolvedCount, 'summary.unresolvedCount'),
      missingCount: finiteInteger(summary.missingCount, 'summary.missingCount'),
      expiredCount: finiteInteger(summary.expiredCount, 'summary.expiredCount'),
      rejectedCount: finiteInteger(summary.rejectedCount, 'summary.rejectedCount'),
      wrongBuildCount: finiteInteger(summary.wrongBuildCount, 'summary.wrongBuildCount'),
      ownerApprovalPendingCount: finiteInteger(
        summary.ownerApprovalPendingCount,
        'summary.ownerApprovalPendingCount',
      ),
    },
    unresolvedEvidenceIds: safeIdentifierArray(
      report.unresolvedEvidenceIds ?? [],
      'unresolvedEvidenceIds',
    ),
    missingEvidenceIds: safeIdentifierArray(report.missingEvidenceIds ?? [], 'missingEvidenceIds'),
    plannedEvidenceIds: safeIdentifierArray(report.plannedEvidenceIds ?? [], 'plannedEvidenceIds'),
    collectedEvidenceIds: safeIdentifierArray(report.collectedEvidenceIds ?? [], 'collectedEvidenceIds'),
    expiredEvidenceIds: safeIdentifierArray(report.expiredEvidenceIds ?? [], 'expiredEvidenceIds'),
    wrongBuildEvidenceIds: safeIdentifierArray(
      report.wrongBuildEvidenceIds ?? [],
      'wrongBuildEvidenceIds',
    ),
    acceptedEvidenceIds: safeIdentifierArray(report.acceptedEvidenceIds ?? [], 'acceptedEvidenceIds'),
    rejectedEvidenceIds: safeIdentifierArray(report.rejectedEvidenceIds ?? [], 'rejectedEvidenceIds'),
    ownerApprovalsPendingIds: safeIdentifierArray(
      report.ownerApprovalsPendingIds ?? [],
      'ownerApprovalsPendingIds',
    ),
    requirements: report.requirements.map(safeReleaseEvidenceRequirement),
  });
}

function normalizeTimingSample(entry) {
  if (!isRecord(entry)) fail('timing sample must be an object.');
  if (!Array.isArray(entry.durationsMs)) fail('timing durations must be an array.');
  const workspaceId = requiredIdentifier(entry.workspaceId, 'workspaceId');
  const packageId = requiredIdentifier(entry.packageId, 'packageId');
  return {
    checkId: requiredIdentifier(entry.checkId, 'checkId'),
    workspaceId,
    packageId,
    scriptIdentity: optionalIdentifier(entry.scriptIdentity, 'scriptIdentity'),
    timingIdentity: requiredIdentifier(
      entry.timingIdentity ?? entry.scriptIdentity ?? `${workspaceId}::${packageId}`,
      'timingIdentity',
    ),
    workingDirectoryId: requiredIdentifier(entry.workingDirectoryId ?? workspaceId, 'workingDirectoryId'),
    durationsMs: entry.durationsMs.map((duration, index) =>
      finiteNonnegative(duration, `durationsMs[${index}]`)).slice(-20),
  };
}

function timingSamplesFromArtifact(current) {
  if ([VERIFICATION_ARTIFACT_SCHEMAS.TIMINGS, LEGACY_TIMINGS_ARTIFACT_SCHEMA].includes(current?.schemaVersion)
    && Array.isArray(current.samples)) {
    return current.samples.map(normalizeTimingSample);
  }
  if (!isRecord(current?.samples)) return [];
  return Object.entries(current.samples).flatMap(([packageScriptKey, durations]) => {
    if (!Array.isArray(durations)) return [];
    const packageId = normalizedIdentifier(packageScriptKey.split('::').at(-1), 'unknown_check');
    const workspaceId = workspaceFromPackageKey(packageScriptKey);
    return [normalizeTimingSample({
      checkId: packageId,
      workspaceId,
      packageId,
      scriptIdentity: packageScriptKey.includes('/package.json::') || packageScriptKey.startsWith('package.json::')
        ? `${workspaceId}::${packageId}`
        : packageScriptKey,
      timingIdentity: packageScriptKey.includes('/package.json::') || packageScriptKey.startsWith('package.json::')
        ? `${workspaceId}::${packageId}`
        : packageScriptKey,
      workingDirectoryId: workspaceId,
      durationsMs: durations.filter((duration) => Number.isFinite(duration) && duration >= 0),
    })];
  });
}

export function buildVerificationTimingsArtifact(laneResult, current = {}, options = {}) {
  if (!isRecord(laneResult) || !Array.isArray(laneResult.results)) {
    fail('lane timing input must contain a results array.');
  }
  const byTimingIdentity = new Map(timingSamplesFromArtifact(current).map((entry) => [entry.timingIdentity, entry]));
  for (const result of laneResult.results) {
    if (!['passed', 'blocked_external'].includes(result.status) || !Number.isFinite(result.durationMs)) continue;
    const packageId = normalizedIdentifier(result.packageScript ?? result.checkId, result.checkId);
    if (!result.timingIdentity) continue;
    const workspaceId = normalizedIdentifier(result.workspace, workspaceFromPackageKey(result.timingIdentity));
    const previous = byTimingIdentity.get(result.timingIdentity);
    byTimingIdentity.set(result.timingIdentity, normalizeTimingSample({
      checkId: result.checkId,
      workspaceId,
      packageId,
      scriptIdentity: result.scriptIdentity ?? null,
      timingIdentity: result.timingIdentity,
      workingDirectoryId: workspaceId,
      durationsMs: [...(previous?.durationsMs ?? []), result.durationMs],
    }));
  }
  return markValidatedArtifact({
    schemaVersion: VERIFICATION_ARTIFACT_SCHEMAS.TIMINGS,
    artifactPolicy: policyEnvelope(
      options.audience ?? VERIFICATION_ARTIFACT_AUDIENCES.SCHEDULED_CI,
      'timings',
    ),
    generatedAt: safeTimestamp(laneResult.generatedAt, 'generatedAt'),
    samples: [...byTimingIdentity.values()].sort((left, right) => left.timingIdentity.localeCompare(right.timingIdentity)),
  });
}

export function commandIdentityFromLegacyText(value) {
  if (typeof value !== 'string' || !value.trim()) return 'unspecified-command';
  const known = new Map([
    ['npm run build', 'expo-web-export'],
    ['release-candidate lane', 'release-candidate-lane'],
    ['manual release artifact', 'manual-release-artifact'],
    ['manual hardware evidence', 'manual-hardware-evidence'],
  ]);
  const normalized = value.trim();
  if (known.has(normalized)) return known.get(normalized);
  return `command-${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12)}`;
}

export function artifactIdentityFromPath(value) {
  const normalized = typeof value === 'string' ? value.replaceAll('\\', '/').trim() : '';
  if (!normalized) return 'unspecified-artifact';
  return `artifact-${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 12)}`;
}
