import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  VERIFICATION_ARTIFACT_AUDIENCES,
  buildVerificationInventoryArtifact,
  sanitizeVerificationArtifactText,
  serializeVerificationArtifact,
} from './verification-artifact-policy.mjs';
import {
  buildVerificationCoverageMatrix,
  collectCoverageStrictFailures,
} from './verification-coverage.mjs';
import { loadVerificationPolicy, resolveVerificationPolicy, scriptIdentity } from './verification-policy.mjs';

const EXCLUDED_DIRECTORIES = new Set([
  '.agents', '.cleanup-quarantine', '.cleanup-safety', '.codex', '.codex-runtime', '.git',
  '.expo', '.expo-runtime', '.next', '.smoke', '.worktrees', 'artifacts', 'coverage', 'dist',
  'node_modules', 'tmp', 'web-build',
]);
const PACKAGE_SCRIPT_PREFIXES = ['test:', 'gate:', 'evidence:', 'audit:', 'report:', 'drill:', 'check:'];
const DOMAIN_PATTERNS = Object.freeze({
  fleet: /fleet|vehicle|gvwr|loadout|payload|weight/i,
  navigate: /navigate|navigation|guidance|route|gpx|geojson|mapbox|map-layer|bailout/i,
  dashboard: /dashboard|widget|ecs-brief|command-brief/i,
  explore: /explore|discover|trail-pack|trip-builder|favorite/i,
  dispatch: /dispatch|convoy|realtime|acknowledg|assist-request/i,
  expedition: /expedition|debrief|archive|badge|personal-record/i,
  campops: /campops|campground|campsite|camp-/i,
  'devices-telemetry': /device|telemetry|bluetooth|\bblu\b|\bble\b|obd|ecoflow|power-station/i,
  'weather-fire': /weather|forecast|airnow|fire|firms|hazard/i,
  'offline-recovery': /offline|recovery|outbox|sync-action|incident/i,
  automotive: /automotive|carplay|android-auto|vehicle-display|head-unit/i,
  ai: /(^|:)ai|ai-|intelligence|truthfulness|orchestrator/i,
  'supabase-rls': /supabase|\brls\b|migration|postgres|realtime/i,
  'auth-subscription': /auth|login|account|subscription|entitlement/i,
});

function normalizePath(value) {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function excludedDirectoryName(name) {
  return EXCLUDED_DIRECTORIES.has(name)
    || /^(?:\.android|\.codex-|\.expo-|\.gradle|\.npm-cache|\.tmp)/.test(name);
}

function walkFiles(rootDir, predicate) {
  const results = [];
  const visit = (directory) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (excludedDirectoryName(entry.name) || entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && predicate(absolute)) results.push(absolute);
    }
  };
  visit(rootDir);
  return results;
}

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return '';
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function directNodeTarget(command) {
  const match = command.match(/(?:^|&&\s*|;\s*)node\s+(?:--[^\s]+\s+)*(?:\.\/)?([^\s"']+\.(?:js|mjs|cjs|ts))(?:\s|$)/i);
  return match?.[1] ? normalizePath(match[1]) : null;
}

function percentile(sorted, ratio) {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function durationSummary(samples) {
  const clean = Array.isArray(samples)
    ? samples.filter((value) => Number.isFinite(value) && value >= 0).map(Number).sort((a, b) => a - b)
    : [];
  if (!clean.length) return { state: 'unmeasured', sampleCount: 0, medianMs: null, p95Ms: null };
  const middle = Math.floor(clean.length / 2);
  const median = clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
  return {
    state: 'measured',
    sampleCount: clean.length,
    medianMs: Math.round(median),
    p95Ms: Math.round(percentile(clean, 0.95)),
  };
}

function evidenceSignals(source, name, policyCheck) {
  const readsFiles = /\b(?:readFileSync|readFile)\s*\(/.test(source);
  const sourceStringAssertions = (source.match(/\.(?:includes|match|indexOf)\s*\(/g) ?? []).length;
  const assertionCount = (source.match(/\bassert(?:\.|\s*\()|throw\s+new\s+Error|expect\s*\(/g) ?? []).length;
  const testDeclarationCount = (source.match(/\b(?:it|test)\s*\(/g) ?? []).length;
  const hasAssertions = assertionCount > 0;
  const directRuntimeImport = /(?:require\s*\(|from\s+)[^\n]{0,180}['"][^'"]*(?:\.{1,2}\/)+(?:app|components|context|lib|packages|src|scripts\/check-|check-)/.test(source);
  const runtimeLoader = /\b(?:loadTsModule|loadTypeScriptModule|transpileModule|require\.extensions\[['"]\.ts['"]\])/.test(source)
    && /(?:path\.join\([^\n]{0,160}['"](?:app|components|context|lib|packages|src)['"]|['"](?:app|components|context|lib|packages|src)\/)/.test(source);
  const importsRuntime = directRuntimeImport || runtimeLoader;
  const usesFixturesOrMocks = /\b(?:fixture|mock|stub|fake|synthetic|simulated)\b/i.test(source);
  const exercisesFailurePath = /\b(?:offline|stale|expired|denied|reject|failure|failed|timeout|unavailable|corrupt|conflict|invalid|duplicate|retry)\b/i.test(source);
  const networkSignal = /\bfetch\s*\(|https?:\/\/|createClient\s*\(|\.from\s*\(['"]|WebSocket|EventSource/.test(source);
  const networkMockSignal = /mock.*fetch|fetch.*mock|nock\s*\(|\bmsw\b/i.test(source);
  const hardwareSignal = /\b(?:bluetooth|ble|obd2?|carplay|android auto|head unit|native module|hardware)\b/i.test(`${name}\n${source}`);
  const evidenceOnly = policyCheck?.classifications.includes('evidence-only') || name.startsWith('evidence:');

  let executionModel = 'unknown';
  if (evidenceOnly) executionModel = 'evidence_only';
  else if (importsRuntime && readsFiles) executionModel = 'hybrid';
  else if (importsRuntime || (hasAssertions && !readsFiles)) executionModel = 'runtime_behavior';
  else if (readsFiles && sourceStringAssertions > 0) executionModel = 'source_contract';
  else if (!source) executionModel = 'tool_execution';

  return {
    readsFiles,
    sourceStringAssertions,
    assertionCount,
    testDeclarationCount,
    hasAssertions,
    importsRuntime,
    usesFixturesOrMocks,
    exercisesFailurePath,
    networkDependency: !networkSignal ? 'none' : networkMockSignal ? 'mocked' : 'real_or_uncontrolled',
    hardwareDependency: hardwareSignal ? (usesFixturesOrMocks ? 'simulated_or_fixture' : 'declared_or_real') : 'none',
    executionModel,
  };
}

function inferredClassifications(name, signals) {
  const result = new Set();
  if (name.startsWith('gate:') || name.startsWith('evidence:')) result.add('evidence-only');
  if (/migration|schema/.test(name)) result.add('migration');
  if (/offline|recovery|outbox/.test(name)) result.add('offline');
  if (/multi.?client|realtime|ordering/.test(name)) result.add('multi-client');
  if (/provider|shadow|adapter/.test(name)) result.add('provider shadow');
  if (/hardware|device|bluetooth|obd|automotive|android|ios/.test(name)) result.add('hardware/device');
  if (/rls|security|auth|privacy/.test(name)) result.add('security/RLS');
  if (/performance|duration|latency|render-count|request-count/.test(name)) result.add('performance');
  if (/ui|component|layout|render|modal|sheet|card/.test(name)) result.add('UI/component');
  if (/e2e|end-to-end|golden-journey/.test(name)) result.add('end-to-end');
  if (signals.executionModel === 'source_contract') result.add('contract');
  if (signals.executionModel === 'runtime_behavior') result.add('unit');
  if (signals.executionModel === 'hybrid') result.add('integration');
  if (result.size === 0) result.add('contract');
  return Array.from(result);
}

function inferredCapabilities(name, command, policy) {
  const haystack = `${name} ${command}`;
  const matches = policy.capabilities
    .filter((capability) => DOMAIN_PATTERNS[capability.id]?.test(haystack))
    .map((capability) => capability.id);
  return matches.length ? matches : [];
}

function falseConfidenceRisks(entry, duplicateCount) {
  const risks = [];
  if (entry.executionModel === 'source_contract') risks.push('source_string_only');
  if (entry.executionModel === 'unknown') risks.push('no_behavior_evidence_detected');
  if (entry.usesFixturesOrMocks && !entry.exercisesFailurePath) risks.push('happy_path_fixture_only');
  if (entry.networkDependency === 'real_or_uncontrolled' && entry.kind === 'test') risks.push('uncontrolled_network_in_test');
  if (entry.hardwareDependency === 'simulated_or_fixture') risks.push('simulated_hardware_only');
  if (entry.testDeclarationCount > 0 && entry.assertionCount === 0) risks.push('test_without_detected_assertion');
  if (entry.assertionCount === 1 && !entry.importsRuntimeCode && !entry.readsImplementationSource) {
    risks.push('trivial_assertion_signal');
  }
  if (entry.kind === 'gate' && !['runtime_behavior', 'hybrid'].includes(entry.executionModel)) {
    risks.push('gate_without_runtime_behavior');
  }
  if (duplicateCount > 1) risks.push('duplicate_command_target');
  if (entry.duration.state === 'unmeasured' && entry.kind === 'test') risks.push('duration_unmeasured');
  if (entry.policyConfidence === 'behavioral' && !['runtime_behavior', 'hybrid'].includes(entry.executionModel)) {
    risks.push('declared_behavior_not_statically_confirmed');
  }
  return risks;
}

function kindForName(name) {
  if (name === 'test' || name.startsWith('test:')) return 'test';
  if (name.startsWith('gate:') || name.startsWith('check:')) return 'gate';
  if (name.startsWith('evidence:')) return 'evidence';
  if (name.startsWith('audit:') || name.startsWith('report:')) return 'report';
  return 'tool';
}

function collectPackageScripts(rootDir) {
  const packageFiles = walkFiles(rootDir, (filePath) => path.basename(filePath) === 'package.json');
  const scripts = packageFiles.flatMap((packagePath) => {
    let manifest;
    try {
      manifest = readJson(packagePath);
    } catch {
      return [];
    }
    const packageRelativePath = normalizePath(path.relative(rootDir, packagePath));
    const workspace = packageRelativePath === 'package.json'
      ? 'root'
      : packageRelativePath.slice(0, -'/package.json'.length);
    const workingDirectory = workspace === 'root' ? '.' : workspace;
    return Object.entries(manifest.scripts ?? {}).map(([name, command]) => ({
      key: scriptIdentity(workspace, name),
      scriptIdentity: scriptIdentity(workspace, name),
      workspace,
      workingDirectory,
      packageName: typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : null,
      packagePath: packageRelativePath,
      name,
      command: String(command),
    }));
  }).sort((left, right) => left.key.localeCompare(right.key));
  return {
    packagePaths: packageFiles.map((packagePath) => normalizePath(path.relative(rootDir, packagePath))).sort(),
    scripts,
  };
}

function collectWorkflowSources(rootDir) {
  const workflowRoot = path.join(rootDir, '.github', 'workflows');
  if (!fs.existsSync(workflowRoot)) return [];
  return walkFiles(workflowRoot, (filePath) => /\.ya?ml$/i.test(filePath)).map((filePath) => ({
    path: normalizePath(path.relative(rootDir, filePath)),
    source: readText(filePath),
  }));
}

function collectEvidenceSources(rootDir) {
  const docsRoot = path.join(rootDir, 'docs');
  if (!fs.existsSync(docsRoot)) return [];
  return walkFiles(docsRoot, (filePath) => (
    /\.md$/i.test(filePath)
    && /evidence|readiness|release|validation|verification|production|gate|test/i.test(
      normalizePath(path.relative(docsRoot, filePath)),
    )
  )).map((filePath) => ({
    path: normalizePath(path.relative(rootDir, filePath)),
    source: readText(filePath),
  }));
}

function decorateCapabilityMatrix(policy, scripts, coverageMatrix) {
  return coverageMatrix.capabilities.map((coverage) => {
    const capability = policy.capabilities.find((entry) => entry.id === coverage.capabilityId);
    const capabilityScripts = scripts.filter((entry) => entry.capabilities.includes(capability.id));
    const curatedChecks = policy.checks.filter((check) => check.capabilities.includes(capability.id));
    return {
      ...coverage,
      packageScriptCount: capabilityScripts.length,
      behavioralCandidateCount: capabilityScripts.filter((entry) => ['runtime_behavior', 'hybrid'].includes(entry.executionModel)).length
        + curatedChecks.filter((check) => check.workflow && check.evidenceClass === 'behavioral').length,
      sourceContractCount: capabilityScripts.filter((entry) => entry.executionModel === 'source_contract').length,
      evidenceOnlyCount: capabilityScripts.filter((entry) => entry.executionModel === 'evidence_only').length,
      readinessGateCount: capabilityScripts.filter((entry) => entry.kind === 'gate').length,
      registeredCheckIds: curatedChecks.map((check) => check.id).sort(),
    };
  });
}

export function buildVerificationInventory(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const suppliedPolicy = options.policy ?? loadVerificationPolicy({ rootDir });
  const policy = suppliedPolicy.resolvedRoot === rootDir
    ? suppliedPolicy
    : resolveVerificationPolicy(suppliedPolicy, { rootDir });
  const now = options.now instanceof Date ? options.now : new Date();
  const durationSamples = options.durationSamples ?? {};
  const workflows = collectWorkflowSources(rootDir);
  const evidenceDocs = collectEvidenceSources(rootDir);
  const packageInventory = collectPackageScripts(rootDir);
  const packageScripts = packageInventory.scripts;
  const policyByScript = new Map(policy.checks
    .filter((check) => check.script)
    .map((check) => [check.scriptIdentity, check]));
  const commandCounts = new Map();
  for (const entry of packageScripts) {
    const normalized = entry.command.replace(/\s+/g, ' ').trim();
    commandCounts.set(normalized, (commandCounts.get(normalized) ?? 0) + 1);
  }

  const scripts = packageScripts.map((packageScript) => {
    const target = directNodeTarget(packageScript.command);
    const targetPath = target ? path.resolve(rootDir, packageScript.workingDirectory, target) : null;
    const targetExists = targetPath ? fs.existsSync(targetPath) : true;
    const source = targetPath && targetExists ? readText(targetPath) : '';
    const policyCheck = policyByScript.get(packageScript.key);
    const signals = evidenceSignals(source, packageScript.name, policyCheck);
    const duration = durationSummary(durationSamples[packageScript.key]);
    const normalizedCommand = packageScript.command.replace(/\s+/g, ' ').trim();
    const capabilities = policyCheck?.capabilities ?? inferredCapabilities(packageScript.name, packageScript.command, policy);
    const classifications = policyCheck?.classifications ?? inferredClassifications(packageScript.name, signals);
    const entry = {
      ...packageScript,
      kind: kindForName(packageScript.name),
      target: target ? { type: 'file', path: target, exists: targetExists } : { type: 'command', path: null, exists: true },
      executionModel: signals.executionModel,
      importsRuntimeCode: signals.importsRuntime,
      executesAssertions: signals.hasAssertions,
      readsImplementationSource: signals.readsFiles,
      sourceStringAssertionCount: signals.sourceStringAssertions,
      assertionCount: signals.assertionCount,
      testDeclarationCount: signals.testDeclarationCount,
      usesFixturesOrMocks: signals.usesFixturesOrMocks,
      exercisesFailurePath: signals.exercisesFailurePath,
      networkDependency: signals.networkDependency,
      hardwareDependency: signals.hardwareDependency,
      providerDependency: /provider|weather|mapbox|supabase|airnow|firms|openweather|nps|ridb/i.test(`${packageScript.name} ${source}`)
        ? 'declared_or_simulated'
        : 'none',
      capabilities,
      classifications,
      duration,
      ciWorkflows: workflows
        .filter((workflow) => workflow.source.includes(`npm run ${packageScript.name}`))
        .map((workflow) => workflow.path)
        .sort(),
      evidenceDocuments: evidenceDocs
        .filter((document) => document.source.includes(`npm run ${packageScript.name}`))
        .map((document) => document.path)
        .sort(),
      policyCheckId: policyCheck?.id ?? null,
      policyConfidence: policyCheck?.confidence ?? null,
      evidenceClass: policyCheck?.evidenceClass ?? 'unknown',
      evidenceQuality: policyCheck?.evidenceQuality ?? 'provisional',
      executionEnvironment: policyCheck?.executionEnvironment ?? 'unknown',
      capabilityWildcard: policyCheck?.capabilityWildcard === true,
      resultContract: policyCheck?.resultContract ?? null,
      productionApproval: policyCheck?.productionEvidenceRequired
        ? 'external_evidence_required'
        : 'not_granted_by_code_checks',
    };
    entry.falseConfidenceRisks = falseConfidenceRisks(entry, commandCounts.get(normalizedCommand) ?? 1);
    return entry;
  });

  const scriptKeys = new Set(packageScripts.map((entry) => entry.key));
  const workflowPaths = new Set(workflows.map((entry) => entry.path));
  const policyReferenceErrors = policy.checks.flatMap((check) => {
    if (check.script && !scriptKeys.has(check.scriptIdentity)) {
      return [`check ${check.id} references missing package script ${check.scriptIdentity}`];
    }
    if (check.workflow && !workflowPaths.has(check.workflow)) return [`check ${check.id} references missing workflow ${check.workflow}`];
    return [];
  });
  const unresolvedCommandCount = scripts.filter((entry) => entry.target.type === 'file' && !entry.target.exists).length;
  const unresolvedVerificationCommandCount = scripts.filter((entry) =>
    entry.target.type === 'file'
    && !entry.target.exists
    && PACKAGE_SCRIPT_PREFIXES.some((prefix) => entry.name.startsWith(prefix))).length;

  const laneResult = options.laneResult ?? null;
  const coveragePhase = laneResult ? 'executed' : 'planned';
  const selectedCheckIds = laneResult
    ? laneResult.selectedCheckIds ?? laneResult.results?.map((entry) => entry.checkId) ?? []
    : [];
  const coverageMatrix = buildVerificationCoverageMatrix({
    policy,
    scripts,
    laneId: laneResult?.laneId ?? options.laneId ?? null,
    selectedCheckIds,
    results: laneResult?.results ?? [],
    phase: coveragePhase,
  });
  const coverageStrictFailures = collectCoverageStrictFailures(coverageMatrix, {
    requireExecution: coveragePhase === 'executed',
  });
  const capabilityMatrix = decorateCapabilityMatrix(policy, scripts, coverageMatrix);
  const policyConfidenceMismatches = coverageStrictFailures
    .filter((entry) => entry.phase === 'registration')
    .map((entry) => ({
      checkId: entry.checkId,
      capabilityId: entry.capabilityId,
      scenarioId: entry.scenarioId,
      code: entry.code,
      reason: entry.reason,
    }));
  const result = {
    schemaVersion: 2,
    policyVersion: policy.policyVersion,
    generatedAt: now.toISOString(),
    productionApproval: 'not_granted_by_inventory',
    summary: {
      packageCount: packageInventory.packagePaths.length,
      packageScriptCount: scripts.length,
      testCount: scripts.filter((entry) => entry.kind === 'test').length,
      gateCount: scripts.filter((entry) => entry.kind === 'gate').length,
      workflowCount: workflows.length,
      evidenceDocumentCount: evidenceDocs.length,
      runtimeBehaviorCount: scripts.filter((entry) => entry.executionModel === 'runtime_behavior').length,
      hybridCount: scripts.filter((entry) => entry.executionModel === 'hybrid').length,
      sourceContractCount: scripts.filter((entry) => entry.executionModel === 'source_contract').length,
      evidenceOnlyCount: scripts.filter((entry) => entry.executionModel === 'evidence_only').length,
      unmeasuredDurationCount: scripts.filter((entry) => entry.duration.state === 'unmeasured').length,
      uncontrolledNetworkCount: scripts.filter((entry) => entry.networkDependency === 'real_or_uncontrolled').length,
      unresolvedCommandCount,
      unresolvedVerificationCommandCount,
      policyReferenceErrorCount: policyReferenceErrors.length,
      declaredScenarioCount: coverageMatrix.summary.scenarioCount,
      executedScenarioCount: capabilityMatrix.reduce((sum, entry) =>
        sum + entry.scenarios.filter((scenario) => scenario.executedChecks.length > 0).length, 0),
      passedScenarioCount: capabilityMatrix.reduce((sum, entry) =>
        sum + entry.scenarios.filter((scenario) => scenario.passingChecks.length > 0).length, 0),
      verifiedScenarioCount: coverageMatrix.summary.satisfiedScenarioCount,
      provisionalScenarioCount: coverageMatrix.summary.provisionalScenarioCount,
      unsupportedScenarioCount: capabilityMatrix.reduce((sum, entry) =>
        sum + entry.scenarios.filter((scenario) => scenario.state === 'unsupported').length, 0),
      mismatchScenarioCount: coverageMatrix.summary.mismatchScenarioCount,
      coverageStrictFailureCount: coverageStrictFailures.length,
      sourceInspectionWarningCount: capabilityMatrix.reduce((sum, entry) =>
        sum + entry.scenarios.reduce((scenarioSum, scenario) => scenarioSum + scenario.warnings.length, 0), 0),
      policyConfidenceMismatchCount: policyConfidenceMismatches.length,
    },
    coveragePhase,
    coverageMatrix,
    coverageStrictFailures,
    capabilityMatrix,
    policyConfidenceMismatches,
    policyReferenceErrors,
    packages: packageInventory.packagePaths,
    workflows: workflows.map((workflow) => ({ path: workflow.path })),
    scripts,
  };
  return result;
}

function parseArgs(argv) {
  const args = {
    output: null,
    timings: null,
    laneResult: null,
    strict: false,
    artifactAudience: VERIFICATION_ARTIFACT_AUDIENCES.PULL_REQUEST,
  };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--output') args.output = argv[++index] ?? null;
    else if (argv[index] === '--timings') args.timings = argv[++index] ?? null;
    else if (argv[index] === '--lane-result') args.laneResult = argv[++index] ?? null;
    else if (argv[index] === '--artifact-audience') args.artifactAudience = argv[++index] ?? null;
    else if (argv[index] === '--strict') args.strict = true;
  }
  return args;
}

function laneResultFromFile(rootDir, relativePath) {
  if (!relativePath) return null;
  const parsed = readJson(path.resolve(rootDir, relativePath));
  if (parsed?.lane && Array.isArray(parsed.checks)) {
    return {
      laneId: parsed.lane.id,
      selectedCheckIds: parsed.checks.map((entry) => entry.checkId),
      results: parsed.checks.map((entry) => ({
        checkId: entry.checkId,
        status: entry.status,
        durationMs: entry.durationMs,
      })),
    };
  }
  if (typeof parsed?.laneId === 'string' && Array.isArray(parsed.results)) return parsed;
  throw new Error('Lane result must be a verification lane artifact or internal lane result.');
}

function samplesFromTimingFile(rootDir, relativePath) {
  if (!relativePath) return {};
  const parsed = readJson(path.resolve(rootDir, relativePath));
  if (Array.isArray(parsed.samples)) {
    return Object.fromEntries(parsed.samples.map((sample) => {
      return [sample.scriptIdentity ?? sample.timingIdentity ?? `${sample.workspaceId}::${sample.packageId}`, sample.durationsMs ?? []];
    }));
  }
  if (parsed.samples && typeof parsed.samples === 'object') return parsed.samples;
  const samples = {};
  for (const result of parsed.results ?? []) {
    if (!result.scriptIdentity || !Number.isFinite(result.durationMs)) continue;
    samples[result.scriptIdentity] = [...(samples[result.scriptIdentity] ?? []), result.durationMs];
  }
  return samples;
}

export function collectVerificationInventoryStrictFailures(inventory) {
  const failures = [...(inventory.coverageStrictFailures ?? [])];
  if ((inventory.summary?.unresolvedVerificationCommandCount ?? 0) > 0) {
    failures.push({ code: 'unresolved_verification_command', reason: 'verification_command_unresolved' });
  }
  for (const reason of inventory.policyReferenceErrors ?? []) {
    failures.push({ code: 'policy_reference_error', reason });
  }
  return failures;
}

export function runVerificationInventoryCli(argv = process.argv.slice(2)) {
  const rootDir = process.cwd();
  const args = parseArgs(argv);
  const inventory = buildVerificationInventory({
    rootDir,
    durationSamples: samplesFromTimingFile(rootDir, args.timings),
    laneResult: laneResultFromFile(rootDir, args.laneResult),
  });
  const artifact = buildVerificationInventoryArtifact(inventory, { audience: args.artifactAudience });
  const output = serializeVerificationArtifact(artifact);
  if (args.output) {
    const outputPath = path.resolve(rootDir, args.output);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, output, 'utf8');
  }
  process.stdout.write(output);
  if (args.strict && collectVerificationInventoryStrictFailures(inventory).length > 0) {
    process.exitCode = 1;
  }
  return inventory;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    runVerificationInventoryCli();
  } catch (error) {
    process.stderr.write(`${sanitizeVerificationArtifactText(error instanceof Error ? error.message : String(error))}\n`);
    process.exitCode = 1;
  }
}
