import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  EVIDENCE_SAFE_CODES,
  VERIFICATION_OUTCOMES,
  writeEvidenceCheckResultForLane,
} from './evidence-result.mjs';
import { computeSupabaseVerificationBinding } from './pgtap-workflow-evidence.mjs';
import {
  evaluateReleaseEvidenceRegistry,
  validateReleaseEvidenceRegistry,
} from './release-evidence-registry.mjs';
import {
  buildVerificationReleaseEvidenceArtifact,
  serializeVerificationArtifact,
} from './verification-artifact-policy.mjs';
import { loadVerificationPolicy } from './verification-policy.mjs';

const CHECK_ID = 'release-evidence-registry';
const DEFAULT_REGISTRY_PATH = 'config/release-evidence-registry.json';
const DEFAULT_OUTPUT_PATH = '.smoke/verification/release-evidence-report.json';
const DIGEST_PATTERN = /^[a-f0-9]{64}$/i;
const SHA_PATTERN = /^[a-f0-9]{40}$/i;
const IDENTIFIER_PATTERN = /^[a-z0-9][a-z0-9_.:-]{0,127}$/;

function safeRepositoryPath(rootDir, value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 240 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${field} must be a bounded repository-relative path.`);
  }
  const normalized = value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (path.isAbsolute(normalized) || path.win32.isAbsolute(normalized)
    || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${field} must remain inside the repository.`);
  }
  const absolute = path.resolve(rootDir, ...normalized.split('/'));
  const relative = path.relative(rootDir, absolute);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${field} must remain inside the repository.`);
  }
  return { normalized, absolute };
}

function parseArgs(args) {
  const result = {
    audience: 'release_candidate',
    outputPath: DEFAULT_OUTPUT_PATH,
    registryPath: DEFAULT_REGISTRY_PATH,
    reportOnly: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--report-only') result.reportOnly = true;
    else if (arg === '--output') result.outputPath = args[++index];
    else if (arg === '--registry') result.registryPath = args[++index];
    else if (arg === '--audience') result.audience = args[++index];
    else throw new Error(`Unsupported release evidence report argument: ${String(arg)}`);
  }
  return result;
}

function exactCommitSha(rootDir, environment) {
  for (const candidate of [environment.ECS_RELEASE_BUILD_SHA, environment.GITHUB_SHA]) {
    if (typeof candidate === 'string' && SHA_PATTERN.test(candidate)) return candidate.toLowerCase();
  }
  const dotGit = path.join(rootDir, '.git');
  let gitDirectory = dotGit;
  if (fs.statSync(dotGit).isFile()) {
    const pointer = fs.readFileSync(dotGit, 'utf8').trim();
    if (!pointer.startsWith('gitdir: ')) throw new Error('The Git directory pointer is malformed.');
    gitDirectory = path.resolve(rootDir, pointer.slice('gitdir: '.length));
  }
  const head = fs.readFileSync(path.join(gitDirectory, 'HEAD'), 'utf8').trim();
  let value = head;
  if (head.startsWith('ref: ')) {
    const reference = head.slice('ref: '.length);
    const looseReference = path.join(gitDirectory, ...reference.split('/'));
    if (fs.existsSync(looseReference)) value = fs.readFileSync(looseReference, 'utf8').trim();
    else {
      const packedRefs = fs.readFileSync(path.join(gitDirectory, 'packed-refs'), 'utf8').split(/\r?\n/);
      const row = packedRefs.find((entry) => entry.endsWith(` ${reference}`));
      value = row?.split(' ')[0] ?? '';
    }
  }
  if (!SHA_PATTERN.test(value)) throw new Error('The current release build SHA is unavailable.');
  return value.toLowerCase();
}

function optionalDigest(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) throw new Error(`${field} must be a SHA-256 digest.`);
  return value.toLowerCase();
}

function optionalIdentifier(value, field) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) throw new Error(`${field} is invalid.`);
  return value;
}

function releaseArtifactDigest(rootDir, environment, buildSha) {
  const directDigest = optionalDigest(
    environment.ECS_RELEASE_ARTIFACT_SHA256,
    'ECS_RELEASE_ARTIFACT_SHA256',
  );
  if (directDigest) return directDigest;
  if (!environment.ECS_RELEASE_ARTIFACT_PROVENANCE) return null;

  const provenancePath = safeRepositoryPath(
    rootDir,
    environment.ECS_RELEASE_ARTIFACT_PROVENANCE,
    'ECS_RELEASE_ARTIFACT_PROVENANCE',
  );
  if (!fs.existsSync(provenancePath.absolute) || !fs.statSync(provenancePath.absolute).isFile()) {
    throw new Error('The configured release artifact provenance file is unavailable.');
  }
  const provenance = JSON.parse(fs.readFileSync(provenancePath.absolute, 'utf8'));
  if (provenance?.schemaVersion !== 'ecs.verification-provenance-artifact.v2'
    || provenance?.artifactPolicy?.audience !== 'release_candidate'
    || provenance?.artifactPolicy?.rawFieldDataAllowed !== false
    || provenance?.artifact?.id !== 'supplied-release-artifact'
    || provenance?.artifact?.kind !== 'release-binary') {
    throw new Error('The release artifact provenance contract or identity is invalid.');
  }
  if (provenance?.ci?.sourceCommit !== buildSha) {
    throw new Error('The release artifact provenance belongs to a different commit.');
  }
  return optionalDigest(provenance.artifact.sha256, 'release artifact provenance digest');
}

function migrationDigest(rootDir) {
  const policy = loadVerificationPolicy({ rootDir, resolve: false });
  const check = policy.checks.find((entry) => entry.id === 'supabase-pgtap-rls');
  if (!check?.workflowEvidence) throw new Error('The canonical pgTAP migration binding policy is unavailable.');
  return computeSupabaseVerificationBinding({
    rootDir,
    ...check.workflowEvidence,
  }).migrationDigest;
}

export function buildReleaseEvidenceReport(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const environment = options.environment ?? process.env;
  const parsed = options.parsedArgs ?? parseArgs(options.args ?? []);
  const registryPath = safeRepositoryPath(rootDir, parsed.registryPath, 'registry path');
  const outputPath = safeRepositoryPath(rootDir, parsed.outputPath, 'output path');
  const registry = validateReleaseEvidenceRegistry(JSON.parse(fs.readFileSync(registryPath.absolute, 'utf8')));
  const buildSha = exactCommitSha(rootDir, environment);
  const target = {
    buildSha,
    buildArtifactDigest: releaseArtifactDigest(rootDir, environment, buildSha),
    migrationDigest: migrationDigest(rootDir),
    providerEnvironment: optionalIdentifier(
      environment.ECS_RELEASE_PROVIDER_ENVIRONMENT,
      'ECS_RELEASE_PROVIDER_ENVIRONMENT',
    ),
  };
  const report = evaluateReleaseEvidenceRegistry({
    registry,
    target,
    now: options.now ?? new Date(),
  });
  const artifact = buildVerificationReleaseEvidenceArtifact(report, { audience: parsed.audience });
  fs.mkdirSync(path.dirname(outputPath.absolute), { recursive: true });
  fs.writeFileSync(outputPath.absolute, serializeVerificationArtifact(artifact), 'utf8');
  return { artifact, outputPath: outputPath.normalized, parsed, report };
}

export function runReleaseEvidenceReportCli(options = {}) {
  const stdout = options.stdout ?? process.stdout;
  try {
    const result = buildReleaseEvidenceReport(options);
    stdout.write([
      `ECS release evidence: ${result.report.status}`,
      `Registry: ${result.report.registryVersion}`,
      `Requirements: ${result.report.summary.requirementCount}`,
      `Accepted: ${result.report.summary.acceptedCount}`,
      `Unresolved: ${result.report.summary.unresolvedCount}`,
      `Production approval: ${result.report.productionApproval.status}/${result.report.productionApproval.decision}`,
      `Artifact: ${result.outputPath}`,
      result.report.unresolvedEvidenceIds.length > 0
        ? `Unresolved IDs: ${result.report.unresolvedEvidenceIds.join(', ')}`
        : 'Unresolved IDs: none',
      '',
    ].join('\n'));

    const laneExitCode = writeEvidenceCheckResultForLane({
      checkId: CHECK_ID,
      status: result.report.status === 'passed'
        ? VERIFICATION_OUTCOMES.PASSED
        : VERIFICATION_OUTCOMES.BLOCKED_EXTERNAL,
      safeCode: result.report.status === 'passed'
        ? EVIDENCE_SAFE_CODES.VERIFIED
        : EVIDENCE_SAFE_CODES.EXTERNAL_REQUIRED,
      blockerIds: result.report.unresolvedEvidenceIds,
      summary: result.report.status === 'passed'
        ? 'Every registered release evidence requirement has matching accepted evidence.'
        : 'Registered external evidence remains unresolved for this release binding.',
      evidence: result.artifact,
      diagnostics: {
        artifactId: 'release-evidence-report',
        domainStatus: result.report.status,
        resultCount: result.report.summary.requirementCount,
        passedCount: result.report.summary.acceptedCount,
        failedCount: result.report.summary.unresolvedCount,
      },
    }, { environment: options.environment ?? process.env });
    if (laneExitCode !== null) return laneExitCode;
    if (result.parsed.reportOnly) return 0;
    return result.report.status === 'passed' ? 0 : 20;
  } catch (error) {
    stdout.write('ECS release evidence verification failed internally.\n');
    if (options.onError) options.onError(error);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = runReleaseEvidenceReportCli({ args: process.argv.slice(2) });
}
