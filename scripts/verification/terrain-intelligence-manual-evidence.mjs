import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  sanitizeVerificationArtifactText,
} from './verification-artifact-policy.mjs';

export const TERRAIN_MANUAL_EVIDENCE_CONTRACT = 'ecs-terrain-intelligence-manual-evidence-v1';
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,127}$/;
const RECORD_STATUSES = new Set(['planned', 'collected', 'review_pending', 'failed', 'blocked']);
const RESULT_VALUES = new Set(['not_collected', 'passed', 'failed', 'blocked']);
const PLATFORMS = new Set(['web', 'android', 'ios', 'android_ios', 'all']);
const REQUIRED_RECORD_FIELDS = [
  'evidenceIds', 'commitSha', 'appArtifactDigest', 'appVersion', 'versionCode',
  'platform', 'os', 'deviceModel', 'routeFixtureId', 'scenarioId', 'expectedResult',
  'actualResult', 'sanitizedEvidenceReference', 'collector', 'reviewer', 'reviewerRole',
  'status', 'expirationDate', 'diagnostics',
];
const FORBIDDEN_CAPTURE_KEYS = /(coordinates?|geometry|routeTrace|tripTrace|latitude|longitude|exactLocation)/i;

function fail(message) {
  throw new Error(`Invalid Terrain Intelligence manual evidence: ${message}`);
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function safeIdentifier(value, field, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) fail(`${field} must be a safe identifier.`);
  return value;
}

function safeText(value, field) {
  if (typeof value !== 'string' || !value.trim()) fail(`${field} must be non-empty text.`);
  const sanitized = sanitizeVerificationArtifactText(value, 500).trim();
  if (!sanitized) fail(`${field} must remain non-empty after sanitization.`);
  return sanitized;
}

function timestamp(value, field, nullable = false) {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail(`${field} must be an ISO timestamp.`);
  return new Date(value).toISOString();
}

function stripRestrictedCaptureData(value) {
  if (Array.isArray(value)) return value.map(stripRestrictedCaptureData);
  if (!value || typeof value !== 'object') return value;
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_CAPTURE_KEYS.test(key)) continue;
    output[key] = stripRestrictedCaptureData(nested);
  }
  return output;
}

function stableSortValue(value) {
  if (Array.isArray(value)) return value.map(stableSortValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, stableSortValue(nested)]),
  );
}

function diagnostics(value, field) {
  if (!isRecord(value)) fail(`${field} must be an object.`);
  const allowed = new Set([
    'compactRenders', 'expandedHudRenders', 'profileCalculations', 'pathGenerations',
    'acceptedProgressUpdates', 'coalescedProgressUpdates', 'expansionLatencyMs',
    'scrubResponseMs', 'memoryBeforeMb', 'memoryAfterMb', 'memoryObservation',
    'batteryObservation', 'thermalObservation',
  ]);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail(`${field}.${key} is unsupported.`);
  const output = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry == null) output[key] = null;
    else if (typeof entry === 'number' && Number.isFinite(entry) && entry >= 0) output[key] = entry;
    else if (typeof entry === 'string' && entry.length <= 300) output[key] = entry;
    else fail(`${field}.${key} must be a bounded nonnegative number, text, or null.`);
  }
  return output;
}

export function validateTerrainManualEvidencePackage(value, options = {}) {
  if (!isRecord(value)) fail('package must be an object.');
  const allowedTop = new Set(['schemaVersion', 'resultContract', 'packageId', 'generatedAt', 'collectionState', 'records']);
  for (const key of Object.keys(value)) if (!allowedTop.has(key)) fail(`unsupported package field ${key}.`);
  if (value.schemaVersion !== 1) fail('schemaVersion must be 1.');
  if (value.resultContract !== TERRAIN_MANUAL_EVIDENCE_CONTRACT) fail(`resultContract must be ${TERRAIN_MANUAL_EVIDENCE_CONTRACT}.`);
  if (!Array.isArray(value.records) || value.records.length === 0) fail('records must be non-empty.');
  const expectedReviewerRoles = options.expectedReviewerRoles ?? {};
  const records = value.records.map((record, index) => {
    const field = `records[${index}]`;
    if (!isRecord(record)) fail(`${field} must be an object.`);
    const actualFields = Object.keys(record);
    for (const required of REQUIRED_RECORD_FIELDS) if (!actualFields.includes(required)) fail(`${field}.${required} is required.`);
    for (const key of actualFields) if (!REQUIRED_RECORD_FIELDS.includes(key)) fail(`${field}.${key} is unsupported.`);
    if (!Array.isArray(record.evidenceIds)) fail(`${field}.evidenceIds must be an array.`);
    const evidenceIds = record.evidenceIds.map((id, evidenceIndex) => safeIdentifier(id, `${field}.evidenceIds[${evidenceIndex}]`));
    const status = safeIdentifier(record.status, `${field}.status`);
    if (!RECORD_STATUSES.has(status)) fail(`${field}.status cannot grant acceptance.`);
    if (!RESULT_VALUES.has(record.actualResult)) fail(`${field}.actualResult is unsupported.`);
    if (!PLATFORMS.has(record.platform)) fail(`${field}.platform is unsupported.`);
    if (status === 'collected' && record.actualResult === 'not_collected') fail(`${field} collected state requires an actual result.`);
    if (status === 'planned' && record.actualResult !== 'not_collected') fail(`${field} planned state must remain not_collected.`);
    if (status === 'review_pending') {
      for (const evidenceId of evidenceIds) {
        const expectedRole = expectedReviewerRoles[evidenceId];
        if (expectedRole && record.reviewerRole !== expectedRole) fail(`${field}.reviewerRole does not match ${evidenceId}.`);
      }
    }
    if (record.commitSha != null && !SHA_PATTERN.test(record.commitSha)) fail(`${field}.commitSha must be an exact SHA.`);
    if (record.appArtifactDigest != null && !DIGEST_PATTERN.test(record.appArtifactDigest)) fail(`${field}.appArtifactDigest must be SHA-256.`);
    return {
      evidenceIds,
      commitSha: record.commitSha?.toLowerCase() ?? null,
      appArtifactDigest: record.appArtifactDigest?.toLowerCase() ?? null,
      appVersion: safeText(record.appVersion, `${field}.appVersion`),
      versionCode: safeText(String(record.versionCode), `${field}.versionCode`),
      platform: record.platform,
      os: safeText(record.os, `${field}.os`),
      deviceModel: safeIdentifier(record.deviceModel, `${field}.deviceModel`, true),
      routeFixtureId: safeIdentifier(record.routeFixtureId, `${field}.routeFixtureId`),
      scenarioId: safeIdentifier(record.scenarioId, `${field}.scenarioId`),
      expectedResult: safeText(record.expectedResult, `${field}.expectedResult`),
      actualResult: record.actualResult,
      sanitizedEvidenceReference: safeIdentifier(record.sanitizedEvidenceReference, `${field}.sanitizedEvidenceReference`, true),
      collector: safeIdentifier(record.collector, `${field}.collector`),
      reviewer: safeIdentifier(record.reviewer, `${field}.reviewer`),
      reviewerRole: safeIdentifier(record.reviewerRole, `${field}.reviewerRole`),
      status,
      expirationDate: timestamp(record.expirationDate, `${field}.expirationDate`, true),
      diagnostics: diagnostics(record.diagnostics, `${field}.diagnostics`),
    };
  });
  if (new Set(records.map((record) => record.scenarioId)).size !== records.length) fail('scenarioId values must be unique.');
  return {
    schemaVersion: 1,
    resultContract: TERRAIN_MANUAL_EVIDENCE_CONTRACT,
    packageId: safeIdentifier(value.packageId, 'packageId'),
    generatedAt: timestamp(value.generatedAt, 'generatedAt'),
    collectionState: safeIdentifier(value.collectionState, 'collectionState'),
    records,
  };
}

export function sanitizeTerrainManualEvidencePackage(value) {
  return stripRestrictedCaptureData(value);
}

export function serializeTerrainManualEvidencePackage(value) {
  const validated = validateTerrainManualEvidencePackage(value);
  const sanitized = sanitizeTerrainManualEvidencePackage(validated);
  return `${JSON.stringify(stableSortValue(sanitized), null, 2)}\n`;
}

function exactCommitSha(rootDir) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: rootDir, encoding: 'utf8' }).trim().toLowerCase();
}

export function buildPlannedTerrainChecklist({ scenarios, commitSha, appArtifactDigest = null, appVersion, versionCode, generatedAt }) {
  return validateTerrainManualEvidencePackage({
    schemaVersion: 1,
    resultContract: TERRAIN_MANUAL_EVIDENCE_CONTRACT,
    packageId: scenarios.packageId,
    generatedAt,
    collectionState: 'planned',
    records: scenarios.scenarios.map((scenario) => ({
      evidenceIds: scenario.evidenceIds,
      commitSha,
      appArtifactDigest,
      appVersion,
      versionCode: String(versionCode),
      platform: scenario.platform,
      os: 'not_collected',
      deviceModel: null,
      routeFixtureId: scenario.routeFixtureId,
      scenarioId: scenario.scenarioId,
      expectedResult: scenario.expectedResult,
      actualResult: 'not_collected',
      sanitizedEvidenceReference: null,
      collector: 'unassigned',
      reviewer: 'unassigned',
      reviewerRole: 'unassigned',
      status: 'planned',
      expirationDate: null,
      diagnostics: {},
    })),
  });
}

export function main(argv = process.argv.slice(2)) {
  const rootDir = process.cwd();
  const outputIndex = argv.indexOf('--output');
  const digestIndex = argv.indexOf('--artifact-digest');
  const outputPath = outputIndex >= 0 ? argv[outputIndex + 1] : null;
  const appArtifactDigest = digestIndex >= 0 ? argv[digestIndex + 1] : null;
  const scenarios = JSON.parse(fs.readFileSync(path.join(rootDir, 'config', 'terrain-intelligence-validation-scenarios.json'), 'utf8'));
  const appConfig = JSON.parse(fs.readFileSync(path.join(rootDir, 'app.json'), 'utf8')).expo;
  const checklist = buildPlannedTerrainChecklist({
    scenarios,
    commitSha: exactCommitSha(rootDir),
    appArtifactDigest,
    appVersion: appConfig.version,
    versionCode: appConfig.android?.versionCode ?? appConfig.ios?.buildNumber ?? 'unknown',
    generatedAt: new Date().toISOString(),
  });
  const serialized = serializeTerrainManualEvidencePackage(checklist);
  if (outputPath) {
    const resolved = path.resolve(rootDir, outputPath);
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    fs.writeFileSync(resolved, serialized, 'utf8');
  }
  process.stdout.write(serialized);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
