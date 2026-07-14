import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import diagnosticRedactionCore from '../../lib/observability/ecsDiagnosticRedactionCore.js';

const { sanitizeECSDiagnosticText } = diagnosticRedactionCore;

export const EVIDENCE_RESULT_CONTRACT = 'ecs-evidence-v1';

export const VERIFICATION_OUTCOMES = Object.freeze({
  PASSED: 'passed',
  BLOCKED_EXTERNAL: 'blocked_external',
  FAILED: 'failed',
});

export const VERIFICATION_EXIT_CODES = Object.freeze({
  PASSED: 0,
  FAILED: 1,
  BLOCKED_EXTERNAL: 20,
});

export const EVIDENCE_SAFE_CODES = Object.freeze({
  VERIFIED: 'evidence_verified',
  EXTERNAL_REQUIRED: 'external_evidence_required',
  CHECK_FAILED: 'evidence_check_failed',
});

const SAFE_CODE_OUTCOMES = new Map([
  [EVIDENCE_SAFE_CODES.VERIFIED, VERIFICATION_OUTCOMES.PASSED],
  [EVIDENCE_SAFE_CODES.EXTERNAL_REQUIRED, VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL],
  [EVIDENCE_SAFE_CODES.CHECK_FAILED, VERIFICATION_OUTCOMES.FAILED],
]);

const RESULT_FIELDS = new Set([
  'schemaVersion',
  'checkId',
  'status',
  'safeCode',
  'blockerIds',
  'summary',
  'commitSha',
  'evidenceDigest',
  'diagnostics',
]);

const DIAGNOSTIC_FIELD_TYPES = Object.freeze({
  artifactId: 'identifier',
  domainStatus: 'identifier',
  workspaceId: 'identifier',
  packageId: 'identifier',
  guardPassed: 'boolean',
  shadowOnlyAllowed: 'boolean',
  attemptCount: 'count',
  durationMs: 'number',
  resultCount: 'count',
  passedCount: 'count',
  failedCount: 'count',
});

const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,127}$/i;
const SHA_PATTERN = /^[a-f0-9]{7,64}$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;

export class EvidenceResultValidationError extends Error {
  constructor(message) {
    super(`Invalid ECS evidence result: ${message}`);
    this.name = 'EvidenceResultValidationError';
  }
}

function fail(message) {
  throw new EvidenceResultValidationError(message);
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function validateIdentifier(value, field) {
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    fail(`${field} must be a safe non-empty identifier.`);
  }
  return value;
}

function validateDiagnostics(value) {
  if (!isRecord(value)) fail('diagnostics must be an object when provided.');
  const normalized = {};
  for (const key of Object.keys(value).sort()) {
    const entry = value[key];
    const type = DIAGNOSTIC_FIELD_TYPES[key];
    if (!type) fail(`diagnostics contains unsupported field "${key}".`);
    if (type === 'identifier') normalized[key] = validateIdentifier(entry, `diagnostics.${key}`);
    else if (type === 'boolean' && typeof entry === 'boolean') normalized[key] = entry;
    else if (type === 'number' && typeof entry === 'number' && Number.isFinite(entry) && entry >= 0) {
      normalized[key] = entry;
    } else if (type === 'count' && Number.isInteger(entry) && entry >= 0) normalized[key] = entry;
    else fail(`diagnostics.${key} does not match its allowlisted type.`);
  }
  return normalized;
}

function validateSummary(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) {
    fail('summary must be a non-empty string of at most 500 characters.');
  }
  const sanitized = sanitizeECSDiagnosticText(value, 500).replace(/\s+/g, ' ').trim();
  if (!sanitized) fail('summary must remain non-empty after sanitization.');
  return sanitized;
}

export function validateEvidenceCheckResult(input, options = {}) {
  if (!isRecord(input)) fail('result must be an object.');
  for (const key of Object.keys(input)) {
    if (!RESULT_FIELDS.has(key)) fail(`result contains unsupported field "${key}".`);
  }
  if (input.schemaVersion !== 1) fail('schemaVersion must be 1.');

  const checkId = validateIdentifier(input.checkId, 'checkId');
  if (options.expectedCheckId && checkId !== options.expectedCheckId) {
    fail(`checkId "${checkId}" does not match expected check "${options.expectedCheckId}".`);
  }

  if (!Object.values(VERIFICATION_OUTCOMES).includes(input.status)) {
    fail('status must be passed, blocked_external, or failed.');
  }
  const safeCode = validateIdentifier(input.safeCode, 'safeCode');
  const approvedOutcome = SAFE_CODE_OUTCOMES.get(safeCode);
  if (!approvedOutcome) fail(`safeCode "${safeCode}" is not approved.`);
  if (approvedOutcome !== input.status) {
    fail(`safeCode "${safeCode}" is not approved for status "${input.status}".`);
  }

  if (!Array.isArray(input.blockerIds)) fail('blockerIds must be an array.');
  const blockerIds = input.blockerIds.map((entry, index) => validateIdentifier(entry, `blockerIds[${index}]`));
  if (new Set(blockerIds).size !== blockerIds.length) fail('blockerIds must not contain duplicates.');
  if (input.status === VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL && blockerIds.length === 0) {
    fail('blocked_external requires at least one blocker ID.');
  }
  if (input.status !== VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL && blockerIds.length > 0) {
    fail('only blocked_external may contain blocker IDs.');
  }

  const summary = validateSummary(input.summary);
  if (input.commitSha !== undefined && (typeof input.commitSha !== 'string' || !SHA_PATTERN.test(input.commitSha))) {
    fail('commitSha must be a 7-64 character hexadecimal commit identifier.');
  }
  if (input.evidenceDigest !== undefined
    && (typeof input.evidenceDigest !== 'string' || !DIGEST_PATTERN.test(input.evidenceDigest))) {
    fail('evidenceDigest must be a SHA-256 hexadecimal digest.');
  }

  return {
    schemaVersion: 1,
    checkId,
    status: input.status,
    safeCode,
    blockerIds: [...blockerIds].sort(),
    summary,
    ...(input.commitSha ? { commitSha: input.commitSha.toLowerCase() } : {}),
    ...(input.evidenceDigest ? { evidenceDigest: input.evidenceDigest.toLowerCase() } : {}),
    ...(input.diagnostics !== undefined ? { diagnostics: validateDiagnostics(input.diagnostics) } : {}),
  };
}

export function createEvidenceCheckResult(input) {
  return validateEvidenceCheckResult({
    schemaVersion: 1,
    ...input,
  });
}

export function classifyEvidenceCheckOutcome(input) {
  if (typeof input?.passed !== 'boolean') fail('producer passed state must be boolean.');
  if (!Array.isArray(input.blockerIds)) fail('producer blockerIds must be an array.');
  if (!Array.isArray(input.externalBlockerIds)) fail('producer externalBlockerIds must be an array.');

  const blockerIds = input.blockerIds.map((entry, index) =>
    validateIdentifier(entry, `producer blockerIds[${index}]`));
  if (new Set(blockerIds).size !== blockerIds.length) fail('producer blockerIds must not contain duplicates.');
  const externalBlockerIds = new Set(input.externalBlockerIds.map((entry, index) =>
    validateIdentifier(entry, `producer externalBlockerIds[${index}]`)));

  if (input.passed && blockerIds.length === 0) {
    return {
      status: VERIFICATION_OUTCOMES.PASSED,
      safeCode: EVIDENCE_SAFE_CODES.VERIFIED,
      blockerIds: [],
      internalFailureIds: [],
    };
  }

  const internalFailureIds = blockerIds.filter((blockerId) => !externalBlockerIds.has(blockerId));
  if (input.passed || blockerIds.length === 0 || internalFailureIds.length > 0) {
    return {
      status: VERIFICATION_OUTCOMES.FAILED,
      safeCode: EVIDENCE_SAFE_CODES.CHECK_FAILED,
      blockerIds: [],
      internalFailureIds: internalFailureIds.length > 0
        ? internalFailureIds
        : ['evidence_producer_outcome_inconsistent'],
    };
  }

  return {
    status: VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL,
    safeCode: EVIDENCE_SAFE_CODES.EXTERNAL_REQUIRED,
    blockerIds: [...blockerIds].sort(),
    internalFailureIds: [],
  };
}

function stableSerialize(value) {
  if (value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') fail('evidence digest input must be JSON-serializable.');
  return serialized;
}

export function digestEvidence(value) {
  return crypto.createHash('sha256').update(stableSerialize(value)).digest('hex');
}

export function exitCodeForEvidenceResult(result) {
  const normalized = validateEvidenceCheckResult(result);
  if (normalized.status === VERIFICATION_OUTCOMES.PASSED) return VERIFICATION_EXIT_CODES.PASSED;
  if (normalized.status === VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL) {
    return VERIFICATION_EXIT_CODES.BLOCKED_EXTERNAL;
  }
  return VERIFICATION_EXIT_CODES.FAILED;
}

/**
 * Writes the lane-only result envelope when the runner provides an isolated result path.
 * Direct gate invocations retain their existing human/JSON output and legacy exit behavior.
 */
export function writeEvidenceCheckResultForLane(input, options = {}) {
  const environment = options.environment ?? process.env;
  const resultFile = options.resultFile ?? environment.ECS_VERIFICATION_RESULT_FILE;
  if (!resultFile) return null;

  const expectedCheckId = environment.ECS_VERIFICATION_CHECK_ID;
  if (!expectedCheckId || expectedCheckId !== input.checkId) {
    fail('runner check identity is missing or does not match the evidence producer.');
  }

  const commitSha = typeof environment.GITHUB_SHA === 'string' && SHA_PATTERN.test(environment.GITHUB_SHA)
    ? environment.GITHUB_SHA
    : undefined;
  const result = createEvidenceCheckResult({
    checkId: input.checkId,
    status: input.status,
    safeCode: input.safeCode,
    blockerIds: input.blockerIds,
    summary: input.summary,
    ...(commitSha ? { commitSha } : {}),
    ...(input.evidence !== undefined ? { evidenceDigest: digestEvidence(input.evidence) } : {}),
    ...(input.diagnostics !== undefined ? { diagnostics: input.diagnostics } : {}),
  });

  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  fs.writeFileSync(resultFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return exitCodeForEvidenceResult(result);
}
