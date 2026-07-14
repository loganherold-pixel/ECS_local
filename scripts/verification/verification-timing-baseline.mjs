import fs from 'node:fs';
import path from 'node:path';

export const VERIFICATION_TIMING_BASELINE_CONTRACT = 'ecs-verification-timing-baseline-v1';
export const VERIFICATION_TIMING_BASELINE_SCHEMA_VERSION = 1;
export const VERIFICATION_TIMING_STATUSES = Object.freeze([
  'within_budget',
  'regressed',
  'improved',
  'provisional',
  'incomparable',
]);
export const DEFAULT_VERIFICATION_TIMING_THRESHOLDS = Object.freeze({
  minimumSamples: 3,
  minimumAbsoluteAllowanceMs: 1_000,
  relativeRegressionPct: 50,
  p95Multiplier: 1.25,
  improvementPct: 20,
});

const BASELINE_FIELDS = new Set([
  'schemaVersion',
  'resultContract',
  'baselineVersion',
  'source',
  'generatedAt',
  'parentBaselineVersion',
  'maxSamplesPerCheck',
  'entries',
]);
const ENTRY_FIELDS = new Set([
  'checkId',
  'timingIdentity',
  'workspace',
  'packageName',
  'script',
  'workingDirectory',
  'runtime',
  'sampleCount',
  'samplesMs',
  'medianMs',
  'p95Ms',
  'lastAcceptedDurationMs',
]);
const RUNTIME_FIELDS = new Set(['identity', 'provider', 'platform', 'arch', 'nodeMajor']);
const THRESHOLD_FIELDS = new Set(Object.keys(DEFAULT_VERIFICATION_TIMING_THRESHOLDS));
const BASELINE_SOURCES = new Set(['approved_repository', 'scheduled_candidate']);
const IDENTIFIER_PATTERN = /^[A-Za-z0-9@.][A-Za-z0-9@_.:/-]{0,254}$/;
const MAX_DURATION_MS = 86_400_000;

function fail(message) {
  throw new Error(`Invalid ECS verification timing baseline: ${message}`);
}

function isRecord(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function exactFields(value, allowed, field) {
  if (!isRecord(value)) fail(`${field} must be an object.`);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) fail(`${field} contains unsupported fields: ${unexpected.join(', ')}.`);
}

function identifier(value, field, { nullable = false } = {}) {
  if (nullable && value == null) return null;
  if (typeof value !== 'string' || !IDENTIFIER_PATTERN.test(value)) {
    fail(`${field} must be a safe stable identifier.`);
  }
  return value;
}

function isoTimestamp(value, field) {
  const parsed = Date.parse(value);
  if (typeof value !== 'string' || !Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(`${field} must be an ISO-8601 timestamp.`);
  }
  return value;
}

function finiteNumber(value, field, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    fail(`${field} must be between ${minimum} and ${maximum}.`);
  }
  return Number(value);
}

function finiteInteger(value, field, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail(`${field} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function percentile(sorted, ratio) {
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

export function summarizeVerificationTimingSamples(samples, maxSamplesPerCheck = 20) {
  if (!Array.isArray(samples) || samples.length === 0) fail('samplesMs must be a non-empty array.');
  const bounded = samples.map((sample, index) =>
    finiteInteger(sample, `samplesMs[${index}]`, 0, MAX_DURATION_MS)).slice(-maxSamplesPerCheck);
  const sorted = [...bounded].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
  return {
    samplesMs: bounded,
    sampleCount: bounded.length,
    medianMs: median,
    p95Ms: percentile(sorted, 0.95),
    lastAcceptedDurationMs: bounded.at(-1),
  };
}

function normalizeRuntime(value) {
  exactFields(value, RUNTIME_FIELDS, 'runtime');
  const nodeMajor = finiteInteger(value.nodeMajor, 'runtime.nodeMajor', 1, 999);
  const result = {
    identity: identifier(value.identity, 'runtime.identity'),
    provider: identifier(value.provider, 'runtime.provider'),
    platform: identifier(value.platform, 'runtime.platform'),
    arch: identifier(value.arch, 'runtime.arch'),
    nodeMajor,
  };
  const expectedIdentity = `${result.provider}:${result.platform}:${result.arch}:node${nodeMajor}`;
  if (result.identity !== expectedIdentity) fail('runtime.identity does not match its runtime fields.');
  return result;
}

export function createVerificationTimingRuntime(options = {}) {
  const environment = options.environment ?? process.env;
  const provider = environment.GITHUB_ACTIONS === 'true'
    ? 'github-actions'
    : environment.CI
      ? 'ci'
      : 'local';
  const platform = identifier(options.platform ?? process.platform, 'runtime.platform');
  const arch = identifier(options.arch ?? process.arch, 'runtime.arch');
  const nodeMatch = String(options.nodeVersion ?? process.version).match(/^v?(\d+)/);
  if (!nodeMatch) fail('runtime node version is invalid.');
  const nodeMajor = Number(nodeMatch[1]);
  return deepFreeze(normalizeRuntime({
    identity: `${provider}:${platform}:${arch}:node${nodeMajor}`,
    provider,
    platform,
    arch,
    nodeMajor,
  }));
}

export function normalizeVerificationTimingThresholds(input = {}, fallback = DEFAULT_VERIFICATION_TIMING_THRESHOLDS) {
  if (!isRecord(input)) fail('timing thresholds must be an object.');
  const unexpected = Object.keys(input).filter((key) => !THRESHOLD_FIELDS.has(key));
  if (unexpected.length > 0) fail(`timing thresholds contain unsupported fields: ${unexpected.join(', ')}.`);
  const merged = { ...fallback, ...input };
  return Object.freeze({
    minimumSamples: finiteInteger(merged.minimumSamples, 'minimumSamples', 1, 100),
    minimumAbsoluteAllowanceMs: finiteInteger(
      merged.minimumAbsoluteAllowanceMs,
      'minimumAbsoluteAllowanceMs',
      0,
      MAX_DURATION_MS,
    ),
    relativeRegressionPct: finiteNumber(merged.relativeRegressionPct, 'relativeRegressionPct', 0, 1_000),
    p95Multiplier: finiteNumber(merged.p95Multiplier, 'p95Multiplier', 1, 10),
    improvementPct: finiteNumber(merged.improvementPct, 'improvementPct', 0, 100),
  });
}

function normalizeEntry(entry, maxSamplesPerCheck, { verifyStatistics = false } = {}) {
  exactFields(entry, ENTRY_FIELDS, 'timing baseline entry');
  const summary = summarizeVerificationTimingSamples(entry.samplesMs, maxSamplesPerCheck);
  if (verifyStatistics) {
    for (const field of ['sampleCount', 'medianMs', 'p95Ms', 'lastAcceptedDurationMs']) {
      if (entry[field] !== summary[field]) fail(`timing baseline entry ${field} does not match samplesMs.`);
    }
    if (entry.samplesMs.length !== summary.samplesMs.length) fail('timing baseline entry exceeds its sample bound.');
  }
  return {
    checkId: identifier(entry.checkId, 'entry.checkId'),
    timingIdentity: identifier(entry.timingIdentity, 'entry.timingIdentity'),
    workspace: identifier(entry.workspace, 'entry.workspace'),
    packageName: identifier(entry.packageName, 'entry.packageName', { nullable: true }),
    script: identifier(entry.script, 'entry.script', { nullable: true }),
    workingDirectory: identifier(entry.workingDirectory, 'entry.workingDirectory'),
    runtime: normalizeRuntime(entry.runtime),
    ...summary,
  };
}

export function validateVerificationTimingBaseline(value) {
  exactFields(value, BASELINE_FIELDS, 'timing baseline');
  if (value.schemaVersion !== VERIFICATION_TIMING_BASELINE_SCHEMA_VERSION) fail('schemaVersion must be 1.');
  if (value.resultContract !== VERIFICATION_TIMING_BASELINE_CONTRACT) fail('resultContract is invalid.');
  const source = identifier(value.source, 'source');
  if (!BASELINE_SOURCES.has(source)) fail('source must be approved_repository or scheduled_candidate.');
  const maxSamplesPerCheck = finiteInteger(value.maxSamplesPerCheck, 'maxSamplesPerCheck', 1, 100);
  if (!Array.isArray(value.entries)) fail('entries must be an array.');
  const entries = value.entries.map((entry) => normalizeEntry(entry, maxSamplesPerCheck, { verifyStatistics: true }))
    .sort((left, right) => (
      left.timingIdentity.localeCompare(right.timingIdentity)
      || left.runtime.identity.localeCompare(right.runtime.identity)
    ));
  const identities = new Set();
  for (const entry of entries) {
    const key = `${entry.timingIdentity}\0${entry.runtime.identity}`;
    if (identities.has(key)) fail(`duplicate timing baseline entry for ${entry.timingIdentity}.`);
    identities.add(key);
  }
  const parentBaselineVersion = identifier(
    value.parentBaselineVersion,
    'parentBaselineVersion',
    { nullable: true },
  );
  if (source === 'approved_repository' && parentBaselineVersion !== null) {
    fail('approved repository baselines must not retain a candidate parent version.');
  }
  if (source === 'scheduled_candidate' && parentBaselineVersion === null) {
    fail('scheduled candidates require a parent baseline version.');
  }
  return deepFreeze({
    schemaVersion: VERIFICATION_TIMING_BASELINE_SCHEMA_VERSION,
    resultContract: VERIFICATION_TIMING_BASELINE_CONTRACT,
    baselineVersion: identifier(value.baselineVersion, 'baselineVersion'),
    source,
    generatedAt: isoTimestamp(value.generatedAt, 'generatedAt'),
    parentBaselineVersion,
    maxSamplesPerCheck,
    entries,
  });
}

export function buildVerificationTimingBaseline(input) {
  if (!isRecord(input) || !Array.isArray(input.entries)) fail('baseline input requires entries.');
  const maxSamplesPerCheck = finiteInteger(input.maxSamplesPerCheck ?? 20, 'maxSamplesPerCheck', 1, 100);
  const entries = input.entries.map((entry) => {
    const normalized = normalizeEntry({
      ...entry,
      sampleCount: entry.sampleCount ?? 0,
      medianMs: entry.medianMs ?? 0,
      p95Ms: entry.p95Ms ?? 0,
      lastAcceptedDurationMs: entry.lastAcceptedDurationMs ?? 0,
    }, maxSamplesPerCheck);
    return normalized;
  });
  return validateVerificationTimingBaseline({
    schemaVersion: VERIFICATION_TIMING_BASELINE_SCHEMA_VERSION,
    resultContract: VERIFICATION_TIMING_BASELINE_CONTRACT,
    baselineVersion: input.baselineVersion,
    source: input.source,
    generatedAt: input.generatedAt,
    parentBaselineVersion: input.parentBaselineVersion ?? null,
    maxSamplesPerCheck,
    entries,
  });
}

export function serializeVerificationTimingBaseline(value) {
  const validated = validateVerificationTimingBaseline(value);
  return `${JSON.stringify(validated, null, 2)}\n`;
}

export function resolveVerificationTimingBaseline(options = {}) {
  let raw;
  if (Object.hasOwn(options, 'suppliedBaseline')) {
    if (options.suppliedBaseline == null) {
      return { status: 'missing', safeCode: 'timing_baseline_missing', baseline: null };
    }
    raw = options.suppliedBaseline;
  } else {
    const baselinePath = path.resolve(options.rootDir ?? process.cwd(), options.baselinePath ?? '');
    if (!options.baselinePath || !fs.existsSync(baselinePath)) {
      return { status: 'missing', safeCode: 'timing_baseline_missing', baseline: null };
    }
    try {
      raw = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
    } catch {
      return { status: 'malformed', safeCode: 'timing_baseline_malformed', baseline: null };
    }
  }
  try {
    const baseline = validateVerificationTimingBaseline(raw);
    if (baseline.source !== 'approved_repository') {
      return { status: 'malformed', safeCode: 'timing_baseline_not_approved', baseline: null };
    }
    return { status: 'available', safeCode: 'timing_baseline_available', baseline };
  } catch {
    return { status: 'malformed', safeCode: 'timing_baseline_malformed', baseline: null };
  }
}

function resultMetadataMatches(entry, result) {
  return entry.checkId === result.checkId
    && entry.workspace === (result.workspace ?? 'root')
    && entry.packageName === (result.packageName ?? null)
    && entry.script === (result.packageScript ?? null)
    && entry.workingDirectory === (result.workingDirectory ?? '.');
}

function comparisonBase(result, runtime, baselineState) {
  return {
    checkId: result.checkId,
    timingIdentity: result.timingIdentity ?? null,
    status: 'incomparable',
    reason: 'timing_unavailable',
    measuredDurationMs: Number.isFinite(result.durationMs) ? result.durationMs : null,
    baselineMedianMs: null,
    baselineP95Ms: null,
    lastAcceptedDurationMs: null,
    allowanceMs: null,
    deltaMs: null,
    deltaPct: null,
    sampleCount: 0,
    baselineVersion: baselineState.baseline?.baselineVersion ?? null,
    baselineSource: baselineState.baseline?.source ?? null,
    runtimeIdentity: runtime.identity,
  };
}

function roundedCeiling(value) {
  return Math.ceil(Math.round(value * 1_000) / 1_000);
}

function compareOne(result, context) {
  const comparison = comparisonBase(result, context.runtime, context.baselineState);
  if (context.enforcement === 'off') return { ...comparison, reason: 'timing_disabled' };
  if (!result.timingIdentity) return { ...comparison, reason: 'timing_identity_missing' };
  if (!['passed'].includes(result.status) || !Number.isFinite(result.durationMs) || result.durationMs < 0) {
    return { ...comparison, reason: 'check_not_successful' };
  }
  if (context.baselineState.status === 'missing') {
    return { ...comparison, status: 'provisional', reason: 'baseline_missing' };
  }
  if (context.baselineState.status !== 'available') {
    return { ...comparison, reason: 'baseline_malformed' };
  }
  const identityEntries = context.baselineState.baseline.entries
    .filter((entry) => entry.timingIdentity === result.timingIdentity);
  if (identityEntries.length === 0) {
    return { ...comparison, status: 'provisional', reason: 'baseline_entry_missing' };
  }
  const metadataEntries = identityEntries.filter((entry) => resultMetadataMatches(entry, result));
  if (metadataEntries.length === 0) {
    return { ...comparison, status: 'provisional', reason: 'baseline_identity_mismatch' };
  }
  const entry = metadataEntries.find((candidate) => candidate.runtime.identity === context.runtime.identity);
  if (!entry) return { ...comparison, reason: 'runtime_incomparable' };
  const measuredDurationMs = Math.round(result.durationMs);
  const populated = {
    ...comparison,
    measuredDurationMs,
    baselineMedianMs: entry.medianMs,
    baselineP95Ms: entry.p95Ms,
    lastAcceptedDurationMs: entry.lastAcceptedDurationMs,
    sampleCount: entry.sampleCount,
  };
  const thresholds = normalizeVerificationTimingThresholds(result.timingThresholds ?? {}, context.defaultThresholds);
  if (entry.sampleCount < thresholds.minimumSamples) {
    return { ...populated, status: 'provisional', reason: 'baseline_samples_provisional' };
  }
  const allowanceMs = Math.max(
    entry.medianMs + thresholds.minimumAbsoluteAllowanceMs,
    roundedCeiling(entry.medianMs * (1 + thresholds.relativeRegressionPct / 100)),
    roundedCeiling(entry.p95Ms * thresholds.p95Multiplier),
  );
  const deltaMs = measuredDurationMs - entry.medianMs;
  const deltaPct = entry.medianMs === 0
    ? null
    : Math.round((deltaMs / entry.medianMs) * 1_000) / 10;
  if (measuredDurationMs > allowanceMs) {
    return { ...populated, status: 'regressed', reason: 'robust_allowance_exceeded', allowanceMs, deltaMs, deltaPct };
  }
  const improvementThreshold = entry.medianMs * (1 - thresholds.improvementPct / 100);
  if (measuredDurationMs < improvementThreshold) {
    return { ...populated, status: 'improved', reason: 'substantial_improvement', allowanceMs, deltaMs, deltaPct };
  }
  return { ...populated, status: 'within_budget', reason: 'within_robust_allowance', allowanceMs, deltaMs, deltaPct };
}

export function evaluateVerificationTimingResults(options = {}) {
  if (!Array.isArray(options.results)) fail('timing evaluation requires results.');
  const runtime = normalizeRuntime(options.runtime ?? createVerificationTimingRuntime());
  const defaultThresholds = normalizeVerificationTimingThresholds(options.defaultThresholds ?? {});
  const enforcement = ['off', 'report', 'enforce'].includes(options.enforcement)
    ? options.enforcement
    : fail('timing enforcement must be off, report, or enforce.');
  let baselineState = options.baselineState ?? { status: 'missing', safeCode: 'timing_baseline_missing', baseline: null };
  if (baselineState.status === 'available') {
    try {
      baselineState = { ...baselineState, baseline: validateVerificationTimingBaseline(baselineState.baseline) };
    } catch {
      baselineState = { status: 'malformed', safeCode: 'timing_baseline_malformed', baseline: null };
    }
  }
  const baselineRequired = options.baselineRequired === true;
  const infrastructurePassed = baselineState.status !== 'malformed'
    && (!baselineRequired || baselineState.status === 'available');
  const comparisons = options.results.map((result) => compareOne(result, {
    runtime,
    baselineState,
    defaultThresholds,
    enforcement,
  }));
  const regressedCheckIds = comparisons.filter((entry) => entry.status === 'regressed').map((entry) => entry.checkId).sort();
  const provisionalCheckIds = comparisons.filter((entry) => entry.status === 'provisional').map((entry) => entry.checkId).sort();
  const incomparableCheckIds = comparisons.filter((entry) => entry.status === 'incomparable').map((entry) => entry.checkId).sort();
  const timingChecksPassed = infrastructurePassed && regressedCheckIds.length === 0;
  const timingGatePassed = enforcement === 'enforce' ? timingChecksPassed : infrastructurePassed || !baselineRequired;
  return deepFreeze({
    enforcement,
    baselineStatus: baselineState.status,
    baselineSafeCode: baselineState.safeCode ?? null,
    baselineVersion: baselineState.baseline?.baselineVersion ?? null,
    baselineSource: baselineState.baseline?.source ?? null,
    runtime,
    infrastructurePassed,
    timingChecksPassed,
    timingGatePassed,
    regressedCheckIds,
    provisionalCheckIds,
    incomparableCheckIds,
    comparisons,
  });
}

function candidateVersion(parentVersion, generatedAt) {
  const stamp = generatedAt.toISOString().replace(/[-:.]/g, '');
  return `${parentVersion}.candidate.${stamp}`;
}

export function buildVerificationTimingBaselineCandidate(options = {}) {
  const approvedBaseline = validateVerificationTimingBaseline(options.approvedBaseline);
  if (approvedBaseline.source !== 'approved_repository') fail('candidate input must be an approved repository baseline.');
  const laneResult = options.laneResult;
  if (!isRecord(laneResult)
    || laneResult.status !== 'passed'
    || laneResult.codeChecksPassed !== true
    || laneResult.timingChecksPassed !== true) {
    fail('a candidate baseline requires a successful lane with no timing regressions.');
  }
  if (!Array.isArray(laneResult.results)) fail('successful lane results are required.');
  const runtime = normalizeRuntime(options.runtime ?? createVerificationTimingRuntime());
  const generatedAt = options.generatedAt instanceof Date ? options.generatedAt : new Date(options.generatedAt ?? Date.now());
  const maxSamplesPerCheck = approvedBaseline.maxSamplesPerCheck;
  const entries = approvedBaseline.entries.map((entry) => ({ ...entry, runtime: { ...entry.runtime }, samplesMs: [...entry.samplesMs] }));
  for (const result of laneResult.results) {
    if (result.status !== 'passed' || !result.timingIdentity
      || !Number.isFinite(result.durationMs) || result.durationMs < 0) continue;
    const metadata = {
      checkId: result.checkId,
      timingIdentity: result.timingIdentity,
      workspace: result.workspace ?? 'root',
      packageName: result.packageName ?? null,
      script: result.packageScript ?? null,
      workingDirectory: result.workingDirectory ?? '.',
      runtime,
    };
    const index = entries.findIndex((entry) => (
      entry.timingIdentity === metadata.timingIdentity && entry.runtime.identity === runtime.identity
    ));
    const previous = index >= 0 && resultMetadataMatches(entries[index], result) ? entries[index].samplesMs : [];
    const replacement = { ...metadata, samplesMs: [...previous, Math.round(result.durationMs)].slice(-maxSamplesPerCheck) };
    if (index >= 0) entries[index] = replacement;
    else entries.push(replacement);
  }
  return buildVerificationTimingBaseline({
    baselineVersion: candidateVersion(approvedBaseline.baselineVersion, generatedAt),
    source: 'scheduled_candidate',
    generatedAt: generatedAt.toISOString(),
    parentBaselineVersion: approvedBaseline.baselineVersion,
    maxSamplesPerCheck,
    entries,
  });
}

export function promoteVerificationTimingBaselineCandidate(candidate, options = {}) {
  const validated = validateVerificationTimingBaseline(candidate);
  if (validated.source !== 'scheduled_candidate') fail('only a scheduled timing candidate can be promoted.');
  if (typeof options.baselineVersion !== 'string' || !options.baselineVersion.trim()) {
    fail('promotion requires an explicit baselineVersion.');
  }
  if (options.baselineVersion === validated.baselineVersion
    || options.baselineVersion === validated.parentBaselineVersion) {
    fail('promotion requires a new reviewed baselineVersion.');
  }
  const generatedAt = options.generatedAt instanceof Date
    ? options.generatedAt
    : new Date(options.generatedAt ?? Date.now());
  return buildVerificationTimingBaseline({
    baselineVersion: options.baselineVersion,
    source: 'approved_repository',
    generatedAt: generatedAt.toISOString(),
    parentBaselineVersion: null,
    maxSamplesPerCheck: validated.maxSamplesPerCheck,
    entries: validated.entries,
  });
}
