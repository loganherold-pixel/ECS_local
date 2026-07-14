import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const PGTAP_WORKFLOW_EVIDENCE_CONTRACT = 'ecs-pgtap-workflow-evidence-v1';

export const PGTAP_WORKFLOW_SAFE_CODES = Object.freeze({
  PASSED: 'pgtap_rls_passed',
  TEST_FAILED: 'pgtap_rls_test_failed',
  REQUIRED_SUITE_MISSING: 'pgtap_required_suite_missing',
  JOB_FAILED: 'pgtap_job_failed',
  JOB_SKIPPED: 'pgtap_job_skipped',
  JOB_CANCELLED: 'pgtap_job_cancelled',
  RESULT_MISSING: 'pgtap_result_missing',
  RESULT_MALFORMED: 'pgtap_result_malformed',
  RESULT_SCHEMA_INVALID: 'pgtap_result_schema_invalid',
  BINDING_MISMATCH: 'pgtap_binding_mismatch',
});

const SAFE_SUMMARIES = Object.freeze({
  [PGTAP_WORKFLOW_SAFE_CODES.PASSED]: 'Required pgTAP/RLS suites passed.',
  [PGTAP_WORKFLOW_SAFE_CODES.TEST_FAILED]: 'One or more required pgTAP/RLS suites failed.',
  [PGTAP_WORKFLOW_SAFE_CODES.REQUIRED_SUITE_MISSING]: 'A required pgTAP/RLS suite did not produce an execution result.',
  [PGTAP_WORKFLOW_SAFE_CODES.JOB_FAILED]: 'The required pgTAP/RLS workflow job failed.',
  [PGTAP_WORKFLOW_SAFE_CODES.JOB_SKIPPED]: 'The required pgTAP/RLS workflow job was skipped.',
  [PGTAP_WORKFLOW_SAFE_CODES.JOB_CANCELLED]: 'The required pgTAP/RLS workflow job was cancelled.',
  [PGTAP_WORKFLOW_SAFE_CODES.RESULT_MISSING]: 'The required pgTAP/RLS workflow result is missing.',
  [PGTAP_WORKFLOW_SAFE_CODES.RESULT_MALFORMED]: 'The required pgTAP/RLS workflow result is malformed.',
  [PGTAP_WORKFLOW_SAFE_CODES.RESULT_SCHEMA_INVALID]: 'The required pgTAP/RLS workflow result failed schema validation.',
  [PGTAP_WORKFLOW_SAFE_CODES.BINDING_MISMATCH]: 'The pgTAP/RLS workflow result does not match the release candidate binding.',
});

const SAFE_CODE_SET = new Set(Object.values(PGTAP_WORKFLOW_SAFE_CODES));
const STATUS_SET = new Set(['passed', 'failed']);
const TEST_RESULT_SET = new Set(['passed', 'failed', 'not_executed']);
const SHA_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9._:/-]{0,255}$/i;
const RESULT_FIELDS = new Set([
  'schemaVersion',
  'resultContract',
  'checkId',
  'workflow',
  'status',
  'safeCode',
  'blockerIds',
  'summary',
  'commitSha',
  'binding',
  'testResult',
  'executedSuiteIds',
  'durationMs',
  'executedAt',
  'artifactDigest',
  'evidenceDigest',
  'diagnostics',
]);
const BINDING_FIELDS = new Set([
  'migrationDigest',
  'migrationFileCount',
  'schemaTestConfigDigest',
  'schemaTestConfigVersion',
  'requiredSuiteCount',
]);
const DIAGNOSTIC_FIELDS = new Set([
  'suiteCount',
  'assertionCount',
  'exitCode',
  'failureStage',
  'mismatchFields',
]);
const BINDING_COMPARISON_FIELDS = [
  'migrationDigest',
  'migrationFileCount',
  'schemaTestConfigDigest',
  'schemaTestConfigVersion',
  'requiredSuiteCount',
];

export class PgtapWorkflowEvidenceError extends Error {
  constructor(message, safeCode = PGTAP_WORKFLOW_SAFE_CODES.RESULT_SCHEMA_INVALID) {
    super(message);
    this.name = 'PgtapWorkflowEvidenceError';
    this.safeCode = safeCode;
  }
}

function fail(message, safeCode) {
  throw new PgtapWorkflowEvidenceError(message, safeCode);
}

function normalizeRepositoryPath(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be a non-empty repository path.`);
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized || normalized === '.' || path.isAbsolute(normalized) || path.win32.isAbsolute(normalized)
    || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')
    || /[\u0000-\u001f\u007f]/.test(normalized)) {
    fail(`${field} must be a safe repository-relative path.`);
  }
  return normalized;
}

function filesRecursively(rootDir, relativeDirectory) {
  const directory = path.resolve(rootDir, relativeDirectory);
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) {
    fail('The configured Supabase migration directory is unavailable.');
  }
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isSymbolicLink()) fail('Supabase verification binding paths must not contain symbolic links.');
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name.endsWith('.sql')) files.push(target);
    }
  };
  visit(directory);
  return files.sort((left, right) => left.localeCompare(right));
}

function ensureFile(rootDir, relativePath, field) {
  const normalized = normalizeRepositoryPath(relativePath, field);
  const absolutePath = path.resolve(rootDir, ...normalized.split('/'));
  const relative = path.relative(rootDir, absolutePath);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    fail(`${field} must remain inside the repository root.`);
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    fail(`${field} references a missing file.`);
  }
  return { normalized, absolutePath };
}

function digestFiles(rootDir, files, namespace, virtualEntries = []) {
  const digest = crypto.createHash('sha256');
  digest.update(`${namespace}\0`);
  for (const [name, value] of virtualEntries) {
    digest.update(`virtual:${name}\0${value}\0`);
  }
  for (const filePath of files) {
    const relativePath = path.relative(rootDir, filePath).replaceAll('\\', '/');
    digest.update(relativePath);
    digest.update('\0');
    digest.update(fs.readFileSync(filePath));
    digest.update('\0');
  }
  return digest.digest('hex');
}

function sortedUniquePaths(values, field, options = {}) {
  if (!Array.isArray(values) || (!options.allowEmpty && values.length === 0)) {
    fail(`${field} must ${options.allowEmpty ? 'be an array' : 'contain at least one path'}.`);
  }
  const normalized = values.map((value, index) => normalizeRepositoryPath(value, `${field}[${index}]`));
  if (new Set(normalized).size !== normalized.length) fail(`${field} must not contain duplicate paths.`);
  return normalized.sort();
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function evidenceDigest(value) {
  const withoutDigest = { ...value };
  delete withoutDigest.evidenceDigest;
  return crypto.createHash('sha256').update(JSON.stringify(stableValue(withoutDigest))).digest('hex');
}

function validateExactFields(value, allowed, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${field} must be an object.`);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) fail(`${field} contains non-allowlisted fields.`);
}

function nonnegativeInteger(value, field, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isInteger(value) || value < 0 || value > maximum) fail(`${field} must be a bounded nonnegative integer.`);
  return value;
}

function validateBinding(binding) {
  validateExactFields(binding, BINDING_FIELDS, 'binding');
  if (!DIGEST_PATTERN.test(binding.migrationDigest ?? '')) fail('binding.migrationDigest must be a SHA-256 digest.');
  if (!DIGEST_PATTERN.test(binding.schemaTestConfigDigest ?? '')) {
    fail('binding.schemaTestConfigDigest must be a SHA-256 digest.');
  }
  if (typeof binding.schemaTestConfigVersion !== 'string'
    || !IDENTIFIER_PATTERN.test(binding.schemaTestConfigVersion)) {
    fail('binding.schemaTestConfigVersion is invalid.');
  }
  nonnegativeInteger(binding.migrationFileCount, 'binding.migrationFileCount', 100_000);
  nonnegativeInteger(binding.requiredSuiteCount, 'binding.requiredSuiteCount', 10_000);
  return binding;
}

function validateDiagnostics(diagnostics) {
  validateExactFields(diagnostics, DIAGNOSTIC_FIELDS, 'diagnostics');
  for (const field of ['suiteCount', 'assertionCount']) {
    if (diagnostics[field] !== null && diagnostics[field] !== undefined) {
      nonnegativeInteger(diagnostics[field], `diagnostics.${field}`, 10_000_000);
    }
  }
  if (diagnostics.exitCode !== null && diagnostics.exitCode !== undefined
    && (!Number.isInteger(diagnostics.exitCode) || diagnostics.exitCode < 0 || diagnostics.exitCode > 255)) {
    fail('diagnostics.exitCode is invalid.');
  }
  if (diagnostics.failureStage !== null && diagnostics.failureStage !== undefined
    && (typeof diagnostics.failureStage !== 'string' || !IDENTIFIER_PATTERN.test(diagnostics.failureStage))) {
    fail('diagnostics.failureStage is invalid.');
  }
  if (diagnostics.mismatchFields !== null && diagnostics.mismatchFields !== undefined) {
    if (!Array.isArray(diagnostics.mismatchFields)
      || diagnostics.mismatchFields.some((field) => !BINDING_COMPARISON_FIELDS.includes(field) && field !== 'commitSha')) {
      fail('diagnostics.mismatchFields is invalid.');
    }
  }
  return diagnostics;
}

export function computeSupabaseVerificationBinding(options) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const migrationDirectory = normalizeRepositoryPath(options.migrationDirectory, 'migrationDirectory');
  const configPaths = sortedUniquePaths(options.configPaths, 'configPaths');
  const requiredSuiteIds = sortedUniquePaths(options.requiredSuiteIds, 'requiredSuiteIds');
  const schemaTestConfigVersion = String(options.schemaTestConfigVersion ?? '').trim();
  if (!IDENTIFIER_PATTERN.test(schemaTestConfigVersion)) fail('schemaTestConfigVersion is invalid.');

  const migrationFiles = filesRecursively(rootDir, migrationDirectory);
  if (migrationFiles.length === 0) fail('The Supabase migration set must not be empty.');
  const configAndSuiteFiles = [...configPaths, ...requiredSuiteIds]
    .map((relativePath, index) => ensureFile(rootDir, relativePath, `bindingFile[${index}]`).absolutePath)
    .sort((left, right) => left.localeCompare(right));

  return Object.freeze({
    migrationDigest: digestFiles(rootDir, migrationFiles, 'ecs-supabase-migrations-v1'),
    migrationFileCount: migrationFiles.length,
    schemaTestConfigDigest: digestFiles(
      rootDir,
      configAndSuiteFiles,
      'ecs-supabase-schema-test-config-v1',
      [['schemaTestConfigVersion', schemaTestConfigVersion]],
    ),
    schemaTestConfigVersion,
    requiredSuiteCount: requiredSuiteIds.length,
  });
}

export function createPgtapWorkflowEvidence(input) {
  const safeCode = input.safeCode;
  if (!SAFE_CODE_SET.has(safeCode)) fail('safeCode is not approved.');
  const executedSuiteIds = Array.isArray(input.executedSuiteIds)
    ? Array.from(new Set(input.executedSuiteIds.map((value, index) =>
      normalizeRepositoryPath(value, `executedSuiteIds[${index}]`)))).sort()
    : [];
  const diagnostics = {
    suiteCount: input.diagnostics?.suiteCount ?? executedSuiteIds.length,
    assertionCount: input.diagnostics?.assertionCount ?? null,
    exitCode: input.diagnostics?.exitCode ?? null,
    failureStage: input.diagnostics?.failureStage ?? null,
    mismatchFields: input.diagnostics?.mismatchFields ?? null,
  };
  const result = {
    schemaVersion: 1,
    resultContract: PGTAP_WORKFLOW_EVIDENCE_CONTRACT,
    checkId: input.checkId,
    workflow: input.workflow,
    status: input.status,
    safeCode,
    blockerIds: [],
    summary: SAFE_SUMMARIES[safeCode],
    commitSha: String(input.commitSha ?? '').toLowerCase(),
    binding: input.binding,
    testResult: input.testResult,
    executedSuiteIds,
    durationMs: input.durationMs,
    executedAt: input.executedAt,
    artifactDigest: input.artifactDigest ?? null,
    diagnostics,
  };
  result.evidenceDigest = evidenceDigest(result);
  return result;
}

export function validatePgtapWorkflowEvidence(value, options = {}) {
  validateExactFields(value, RESULT_FIELDS, 'pgTAP workflow evidence');
  if (value.schemaVersion !== 1) fail('pgTAP workflow evidence requires schemaVersion 1.');
  if (value.resultContract !== PGTAP_WORKFLOW_EVIDENCE_CONTRACT) fail('pgTAP workflow evidence contract is invalid.');
  if (typeof value.checkId !== 'string' || !IDENTIFIER_PATTERN.test(value.checkId)) fail('checkId is invalid.');
  if (typeof value.workflow !== 'string' || !value.workflow.startsWith('.github/workflows/')) fail('workflow is invalid.');
  if (!STATUS_SET.has(value.status)) fail('status must be passed or failed.');
  if (!SAFE_CODE_SET.has(value.safeCode)) fail('safeCode is not approved.');
  if (!Array.isArray(value.blockerIds) || value.blockerIds.length !== 0) fail('pgTAP workflow evidence cannot report external blockers.');
  if (value.summary !== SAFE_SUMMARIES[value.safeCode]) fail('summary must match the approved safe code copy.');
  if (!SHA_PATTERN.test(value.commitSha ?? '')) fail('commitSha must be an exact Git commit SHA.');
  validateBinding(value.binding);
  if (!TEST_RESULT_SET.has(value.testResult)) fail('testResult is invalid.');
  const executedSuiteIds = sortedUniquePaths(value.executedSuiteIds, 'executedSuiteIds', { allowEmpty: true });
  nonnegativeInteger(value.durationMs, 'durationMs', 86_400_000);
  const executedAtMs = Date.parse(value.executedAt);
  if (!Number.isFinite(executedAtMs) || new Date(executedAtMs).toISOString() !== value.executedAt) {
    fail('executedAt must be an ISO-8601 timestamp.');
  }
  if (value.artifactDigest !== null && !DIGEST_PATTERN.test(value.artifactDigest ?? '')) {
    fail('artifactDigest must be null or a SHA-256 digest.');
  }
  if (!DIGEST_PATTERN.test(value.evidenceDigest ?? '') || evidenceDigest(value) !== value.evidenceDigest) {
    fail('evidenceDigest does not match the evidence envelope.');
  }
  validateDiagnostics(value.diagnostics);

  if (value.status === 'passed') {
    if (value.safeCode !== PGTAP_WORKFLOW_SAFE_CODES.PASSED || value.testResult !== 'passed' || !value.artifactDigest) {
      fail('Passed pgTAP evidence has inconsistent status fields.');
    }
  } else if (value.safeCode === PGTAP_WORKFLOW_SAFE_CODES.PASSED || value.testResult === 'passed') {
    fail('Failed pgTAP evidence cannot claim a passed test result.');
  }

  if (options.expectedCheckId && value.checkId !== options.expectedCheckId) fail('checkId does not match the registered check.');
  if (options.expectedWorkflow && value.workflow !== options.expectedWorkflow) fail('workflow does not match the registered check.');
  if (options.expectedCommitSha && value.commitSha !== String(options.expectedCommitSha).toLowerCase()) {
    fail('commitSha does not match the release candidate.', PGTAP_WORKFLOW_SAFE_CODES.BINDING_MISMATCH);
  }
  if (options.expectedBinding) {
    const mismatches = BINDING_COMPARISON_FIELDS.filter((field) =>
      value.binding[field] !== options.expectedBinding[field]);
    if (mismatches.length > 0) {
      fail('Supabase migration or schema/test configuration binding does not match.', PGTAP_WORKFLOW_SAFE_CODES.BINDING_MISMATCH);
    }
  }
  if (options.requiredSuiteIds) {
    const required = sortedUniquePaths(options.requiredSuiteIds, 'requiredSuiteIds');
    const missing = required.filter((suiteId) => !executedSuiteIds.includes(suiteId));
    const unexpected = executedSuiteIds.filter((suiteId) => !required.includes(suiteId));
    const requiresCompleteSuiteSet = value.status === 'passed';
    if (requiresCompleteSuiteSet && (missing.length > 0 || unexpected.length > 0)) {
      fail('Required pgTAP suite execution is incomplete.', PGTAP_WORKFLOW_SAFE_CODES.REQUIRED_SUITE_MISSING);
    }
  }
  if (options.now && Number.isFinite(options.maxAgeMs)) {
    const nowMs = options.now instanceof Date ? options.now.getTime() : Date.parse(options.now);
    if (!Number.isFinite(nowMs) || executedAtMs > nowMs + 300_000 || nowMs - executedAtMs > options.maxAgeMs) {
      fail('pgTAP workflow evidence timestamp is outside the allowed release window.', PGTAP_WORKFLOW_SAFE_CODES.BINDING_MISMATCH);
    }
  }
  return value;
}

function syntheticFailure(input, safeCode, diagnostics = {}) {
  return createPgtapWorkflowEvidence({
    checkId: input.check.id,
    workflow: input.check.workflow,
    status: 'failed',
    safeCode,
    commitSha: input.expectedCommitSha,
    binding: input.binding,
    testResult: 'not_executed',
    executedSuiteIds: [],
    durationMs: 0,
    executedAt: input.now.toISOString(),
    artifactDigest: null,
    diagnostics: {
      suiteCount: 0,
      assertionCount: null,
      exitCode: null,
      failureStage: diagnostics.failureStage ?? safeCode,
      mismatchFields: diagnostics.mismatchFields ?? null,
    },
  });
}

function validationOptions(input, binding) {
  return {
    expectedCheckId: input.check.id,
    expectedWorkflow: input.check.workflow,
    expectedCommitSha: input.expectedCommitSha,
    expectedBinding: binding,
    requiredSuiteIds: input.check.workflowEvidence.requiredSuiteIds,
    now: input.now,
    maxAgeMs: input.check.workflowEvidence.maxAgeMs,
  };
}

export function materializePgtapWorkflowResult(options) {
  const now = options.now instanceof Date ? options.now : new Date();
  const check = options.check;
  if (!check?.workflowEvidence) fail('The registered pgTAP check is missing workflowEvidence policy.');
  const binding = computeSupabaseVerificationBinding({
    rootDir: options.rootDir,
    ...check.workflowEvidence,
  });
  const input = {
    check,
    binding,
    expectedCommitSha: String(options.expectedCommitSha ?? '').toLowerCase(),
    now,
  };
  const dependencyStatus = String(options.dependencyStatus ?? '').toLowerCase();
  if (dependencyStatus === 'skipped') return syntheticFailure(input, PGTAP_WORKFLOW_SAFE_CODES.JOB_SKIPPED);
  if (dependencyStatus === 'cancelled') return syntheticFailure(input, PGTAP_WORKFLOW_SAFE_CODES.JOB_CANCELLED);

  const rawResult = typeof options.rawResult === 'string' ? options.rawResult.trim() : '';
  if (dependencyStatus === 'failure' && !rawResult) {
    return syntheticFailure(input, PGTAP_WORKFLOW_SAFE_CODES.JOB_FAILED);
  }
  if (dependencyStatus !== 'success' && dependencyStatus !== 'failure') {
    return syntheticFailure(input, PGTAP_WORKFLOW_SAFE_CODES.RESULT_MISSING);
  }
  if (!rawResult) return syntheticFailure(input, PGTAP_WORKFLOW_SAFE_CODES.RESULT_MISSING);

  let parsed;
  try {
    parsed = JSON.parse(rawResult);
  } catch {
    return syntheticFailure(input, PGTAP_WORKFLOW_SAFE_CODES.RESULT_MALFORMED);
  }
  try {
    const validated = validatePgtapWorkflowEvidence(parsed, validationOptions(input, binding));
    if (dependencyStatus === 'failure' && validated.status !== 'failed') {
      return syntheticFailure(input, PGTAP_WORKFLOW_SAFE_CODES.JOB_FAILED);
    }
    return validated;
  } catch (error) {
    const safeCode = error instanceof PgtapWorkflowEvidenceError
      ? error.safeCode
      : PGTAP_WORKFLOW_SAFE_CODES.RESULT_SCHEMA_INVALID;
    const mismatchFields = safeCode === PGTAP_WORKFLOW_SAFE_CODES.BINDING_MISMATCH
      ? ['commitSha', ...BINDING_COMPARISON_FIELDS]
      : null;
    return syntheticFailure(input, safeCode, { mismatchFields });
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseExecutedPgtapSuites(output, requiredSuiteIds) {
  const normalizedOutput = String(output ?? '').replaceAll('\\', '/');
  return sortedUniquePaths(requiredSuiteIds, 'requiredSuiteIds').filter((suiteId) => {
    const testRelative = suiteId.replace(/^supabase\/tests\//, '');
    const pattern = new RegExp(`${escapeRegExp(testRelative)}\\s+\\.*\\s+(?:ok|not ok)\\b`, 'i');
    return pattern.test(normalizedOutput);
  });
}
