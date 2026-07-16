import fs from 'node:fs';
import path from 'node:path';

import { EVIDENCE_RESULT_CONTRACT } from './evidence-result.mjs';
import { PGTAP_WORKFLOW_EVIDENCE_CONTRACT } from './pgtap-workflow-evidence.mjs';
import {
  VERIFICATION_EVIDENCE_CLASSES,
  VERIFICATION_EXECUTION_ENVIRONMENTS,
} from './verification-coverage.mjs';
import {
  DEFAULT_VERIFICATION_TIMING_THRESHOLDS,
  normalizeVerificationTimingThresholds,
} from './verification-timing-baseline.mjs';

export const VERIFICATION_CLASSIFICATIONS = Object.freeze([
  'unit',
  'contract',
  'integration',
  'UI/component',
  'end-to-end',
  'migration',
  'offline',
  'multi-client',
  'provider shadow',
  'hardware/device',
  'security/RLS',
  'performance',
  'evidence-only',
]);

const CLASSIFICATIONS = new Set(VERIFICATION_CLASSIFICATIONS);
const CONFIDENCE_LEVELS = new Set(['behavioral', 'hybrid', 'source-contract', 'evidence']);
const EVIDENCE_CLASSES = new Set(VERIFICATION_EVIDENCE_CLASSES);
const EXECUTION_ENVIRONMENTS = new Set(VERIFICATION_EXECUTION_ENVIRONMENTS);
const EVIDENCE_QUALITIES = new Set(['authoritative', 'provisional']);
const COVERAGE_ENFORCEMENT = new Set(['report', 'strict']);
const EXCLUDED_PACKAGE_DIRECTORIES = new Set([
  '.git', '.next', '.expo', 'artifacts', 'coverage', 'dist', 'node_modules', 'tmp', 'web-build',
]);

function fail(message) {
  throw new Error(`Invalid ECS verification policy: ${message}`);
}

function asStringArray(value, field, { allowEmpty = true } = {}) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry.trim())) {
    fail(`${field} must be an array of non-empty strings.`);
  }
  if (!allowEmpty && value.length === 0) fail(`${field} must not be empty.`);
  return Array.from(new Set(value.map((entry) => entry.trim())));
}

function uniqueById(entries, field) {
  const seen = new Set();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string' || !entry.id.trim()) {
      fail(`${field} entries require a non-empty id.`);
    }
    if (seen.has(entry.id)) fail(`${field} contains duplicate id "${entry.id}".`);
    seen.add(entry.id);
  }
  return seen;
}

function normalizeRepositoryPath(value, field) {
  const normalized = String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/$/, '');
  if (!normalized || normalized === '.') return 'root';
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    fail(`${field} must be a repository-relative workspace path.`);
  }
  return normalized;
}

function workspaceFromPackagePath(packagePath) {
  const normalized = String(packagePath ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
  if (normalized === 'package.json') return 'root';
  if (!normalized.endsWith('/package.json')) fail(`packagePath "${normalized}" must identify a package.json file.`);
  return normalizeRepositoryPath(normalized.slice(0, -'/package.json'.length), 'packagePath');
}

export function scriptIdentity(workspace, script) {
  return `${normalizeRepositoryPath(workspace, 'workspace')}::${String(script).trim()}`;
}

export function verificationTimingIdentity(check) {
  if (check.scriptIdentity) return check.scriptIdentity;
  const workspace = normalizeRepositoryPath(check.workspace ?? 'root', 'workspace');
  return `${workspace}::${check.workflow ? 'workflow' : 'check'}:${check.id}`;
}

function packagePathForWorkspace(workspace) {
  return workspace === 'root' ? 'package.json' : `${workspace}/package.json`;
}

function discoverPackages(rootDir) {
  const result = [];
  const visit = (directory) => {
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()
        || (entry.isDirectory() && (entry.name.startsWith('.') || EXCLUDED_PACKAGE_DIRECTORIES.has(entry.name)))) continue;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name === 'package.json') {
        let manifest;
        try {
          manifest = JSON.parse(fs.readFileSync(target, 'utf8'));
        } catch (error) {
          fail(`cannot parse ${path.relative(rootDir, target).replaceAll('\\', '/')}: ${error instanceof Error ? error.message : String(error)}`);
        }
        const packagePath = path.relative(rootDir, target).replaceAll('\\', '/');
        const workspace = workspaceFromPackagePath(packagePath);
        result.push({
          workspace,
          packagePath,
          workingDirectory: workspace === 'root' ? '.' : workspace,
          packageName: typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : null,
          scripts: manifest.scripts && typeof manifest.scripts === 'object' ? manifest.scripts : {},
        });
      }
    }
  };
  visit(rootDir);
  return result.sort((left, right) => left.workspace.localeCompare(right.workspace));
}

export function validateVerificationPolicy(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('policy must be an object.');
  if (![1, 2].includes(input.schemaVersion)) fail('schemaVersion must be 1 or 2.');
  if (!Array.isArray(input.capabilities) || input.capabilities.length === 0) fail('capabilities must not be empty.');
  if (!Array.isArray(input.checks)) fail('checks must be an array.');
  if (!Array.isArray(input.lanes) || input.lanes.length === 0) fail('lanes must not be empty.');

  const capabilityIds = uniqueById(input.capabilities, 'capabilities');
  const laneIds = uniqueById(input.lanes, 'lanes');
  uniqueById(input.checks, 'checks');

  let timingPolicy;
  if (input.timingPolicy === undefined) {
    timingPolicy = {
      enabled: false,
      schemaVersion: 1,
      baselinePath: null,
      maxSamplesPerCheck: 20,
      defaultThresholds: DEFAULT_VERIFICATION_TIMING_THRESHOLDS,
      enforceLanes: [],
      requiredBaselineLanes: [],
      candidateLanes: [],
    };
  } else {
    const allowedTimingFields = new Set([
      'schemaVersion',
      'baselinePath',
      'maxSamplesPerCheck',
      'defaultThresholds',
      'enforceLanes',
      'requiredBaselineLanes',
      'candidateLanes',
    ]);
    if (!input.timingPolicy || typeof input.timingPolicy !== 'object' || Array.isArray(input.timingPolicy)) {
      fail('timingPolicy must be an object.');
    }
    const unexpected = Object.keys(input.timingPolicy).filter((field) => !allowedTimingFields.has(field));
    if (unexpected.length > 0) fail(`timingPolicy contains unsupported fields: ${unexpected.join(', ')}.`);
    if (input.timingPolicy.schemaVersion !== 1) fail('timingPolicy.schemaVersion must be 1.');
    const baselinePath = normalizeRepositoryPath(input.timingPolicy.baselinePath, 'timingPolicy.baselinePath');
    if (baselinePath === 'root' || !baselinePath.endsWith('.json')) {
      fail('timingPolicy.baselinePath must identify a repository-relative JSON file.');
    }
    const maxSamplesPerCheck = Number(input.timingPolicy.maxSamplesPerCheck);
    if (!Number.isInteger(maxSamplesPerCheck) || maxSamplesPerCheck < 1 || maxSamplesPerCheck > 100) {
      fail('timingPolicy.maxSamplesPerCheck must be an integer from 1 to 100.');
    }
    const defaultThresholds = normalizeVerificationTimingThresholds(input.timingPolicy.defaultThresholds ?? {});
    if (defaultThresholds.minimumSamples > maxSamplesPerCheck) {
      fail('timingPolicy minimumSamples cannot exceed maxSamplesPerCheck.');
    }
    const laneList = (field) => {
      const values = asStringArray(input.timingPolicy[field] ?? [], `timingPolicy.${field}`);
      for (const laneId of values) {
        if (!laneIds.has(laneId)) fail(`timingPolicy.${field} references unknown lane "${laneId}".`);
      }
      return values;
    };
    const enforceLanes = laneList('enforceLanes');
    const requiredBaselineLanes = laneList('requiredBaselineLanes');
    const candidateLanes = laneList('candidateLanes');
    for (const laneId of requiredBaselineLanes) {
      if (!enforceLanes.includes(laneId)) {
        fail(`timingPolicy required baseline lane "${laneId}" must also enforce timing.`);
      }
    }
    timingPolicy = {
      enabled: true,
      schemaVersion: 1,
      baselinePath,
      maxSamplesPerCheck,
      defaultThresholds,
      enforceLanes,
      requiredBaselineLanes,
      candidateLanes,
    };
  }

  const capabilities = input.capabilities.map((capability) => {
    const highValueScenarios = asStringArray(
      capability.highValueScenarios ?? [],
      `capability ${capability.id}.highValueScenarios`,
    );
    const rawRequirements = capability.scenarioRequirements
      ?? (input.schemaVersion === 1 ? highValueScenarios.map((id) => ({ id })) : null);
    if (!Array.isArray(rawRequirements)) {
      fail(`capability "${capability.id}" requires scenarioRequirements in schemaVersion 2.`);
    }
    uniqueById(rawRequirements, `capability ${capability.id}.scenarioRequirements`);
    const scenarioRequirements = rawRequirements.map((requirement) => {
      const requiredEvidenceClasses = asStringArray(
        requirement.requiredEvidenceClasses ?? (input.schemaVersion === 1 ? ['behavioral'] : []),
        `capability ${capability.id}.scenario ${requirement.id}.requiredEvidenceClasses`,
        { allowEmpty: false },
      );
      for (const evidenceClass of requiredEvidenceClasses) {
        if (!EVIDENCE_CLASSES.has(evidenceClass) || evidenceClass === 'unknown') {
          fail(`capability "${capability.id}" scenario "${requirement.id}" has invalid evidence class "${evidenceClass}".`);
        }
      }
      const enforcedLanes = asStringArray(
        requirement.enforcedLanes ?? [],
        `capability ${capability.id}.scenario ${requirement.id}.enforcedLanes`,
      );
      for (const laneId of enforcedLanes) {
        if (!laneIds.has(laneId)) {
          fail(`capability "${capability.id}" scenario "${requirement.id}" references unknown lane "${laneId}".`);
        }
      }
      return {
        id: requirement.id.trim(),
        requiredEvidenceClasses,
        checkIds: asStringArray(
          requirement.checkIds ?? [],
          `capability ${capability.id}.scenario ${requirement.id}.checkIds`,
          { allowEmpty: input.schemaVersion === 1 },
        ),
        enforcedLanes,
        deterministicCi: requirement.deterministicCi !== false,
        requiresLiveProvider: requirement.requiresLiveProvider === true,
        requiresRealDevice: requirement.requiresRealDevice === true,
        requiresMultiClient: requirement.requiresMultiClient === true,
        requiresManualField: requirement.requiresManualField === true,
      };
    });
    const requirementIds = new Set(scenarioRequirements.map((entry) => entry.id));
    const scenarioIds = new Set(highValueScenarios);
    const missingRequirements = highValueScenarios.filter((id) => !requirementIds.has(id));
    const extraRequirements = scenarioRequirements.filter((entry) => !scenarioIds.has(entry.id)).map((entry) => entry.id);
    if (missingRequirements.length > 0 || extraRequirements.length > 0) {
      fail(`capability "${capability.id}" scenarioRequirements must exactly match highValueScenarios.`);
    }
    return {
      id: capability.id.trim(),
      label: typeof capability.label === 'string' && capability.label.trim()
        ? capability.label.trim()
        : fail(`capability "${capability.id}" requires a label.`),
      pathPrefixes: asStringArray(capability.pathPrefixes ?? [], `capability ${capability.id}.pathPrefixes`),
      highValueScenarios,
      scenarioRequirements,
      evidenceBlockers: asStringArray(capability.evidenceBlockers ?? [], `capability ${capability.id}.evidenceBlockers`),
    };
  });

  const lanes = input.lanes.map((lane) => {
    const maxParallel = Number(lane.maxParallel);
    const timeoutMs = Number(lane.timeoutMs);
    if (!Number.isInteger(maxParallel) || maxParallel < 1 || maxParallel > 16) {
      fail(`lane "${lane.id}" maxParallel must be an integer from 1 to 16.`);
    }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 1_800_000) {
      fail(`lane "${lane.id}" timeoutMs must be between 100 and 1800000.`);
    }
    const budgetMs = lane.budgetMs === undefined ? timeoutMs * maxParallel : Number(lane.budgetMs);
    if (!Number.isFinite(budgetMs) || budgetMs < 100 || budgetMs > 7_200_000) {
      fail(`lane "${lane.id}" budgetMs must be between 100 and 7200000.`);
    }
    const coverageEnforcement = lane.coverageEnforcement ?? 'report';
    if (!COVERAGE_ENFORCEMENT.has(coverageEnforcement)) {
      fail(`lane "${lane.id}" coverageEnforcement must be report or strict.`);
    }
    return {
      id: lane.id.trim(),
      label: typeof lane.label === 'string' && lane.label.trim() ? lane.label.trim() : lane.id.trim(),
      maxParallel,
      timeoutMs,
      budgetMs,
      purpose: typeof lane.purpose === 'string' ? lane.purpose.trim() : '',
      coverageEnforcement,
    };
  });

  const checks = input.checks.map((check) => {
    const references = [check.script, check.command, check.workflow].filter(
      (entry) => typeof entry === 'string' && entry.trim(),
    );
    if (references.length !== 1) {
      fail(`check "${check.id}" requires exactly one of script, command, or workflow.`);
    }
    let capabilitiesForCheck = asStringArray(
      check.capabilities ?? [],
      `check ${check.id}.capabilities`,
      { allowEmpty: false },
    );
    const capabilityWildcard = capabilitiesForCheck.includes('*');
    if (capabilityWildcard) {
      if (capabilitiesForCheck.length !== 1) fail(`check "${check.id}" cannot combine "*" with capability ids.`);
      capabilitiesForCheck = Array.from(capabilityIds);
    }
    for (const capabilityId of capabilitiesForCheck) {
      if (!capabilityIds.has(capabilityId)) fail(`check "${check.id}" references unknown capability "${capabilityId}".`);
    }
    const classifications = asStringArray(
      check.classifications ?? [],
      `check ${check.id}.classifications`,
      { allowEmpty: false },
    );
    for (const classification of classifications) {
      if (!CLASSIFICATIONS.has(classification)) {
        fail(`check "${check.id}" has unsupported classification "${classification}".`);
      }
    }
    const checkLanes = asStringArray(check.lanes ?? [], `check ${check.id}.lanes`);
    for (const laneId of checkLanes) {
      if (!laneIds.has(laneId)) fail(`check "${check.id}" references unknown lane "${laneId}".`);
    }
    const confidence = check.confidence ?? 'behavioral';
    if (!CONFIDENCE_LEVELS.has(confidence)) fail(`check "${check.id}" has invalid confidence "${confidence}".`);
    const evidenceOnly = classifications.includes('evidence-only');
    const resultContract = typeof check.resultContract === 'string' ? check.resultContract.trim() : '';
    if (evidenceOnly && resultContract !== EVIDENCE_RESULT_CONTRACT) {
      fail(`check "${check.id}" resultContract must be "${EVIDENCE_RESULT_CONTRACT}" for evidence-only checks.`);
    }
    if (!evidenceOnly && resultContract) {
      fail(`check "${check.id}" must not declare an evidence resultContract without evidence-only classification.`);
    }
    if (check.productionEvidenceRequired === true && !evidenceOnly) {
      fail(`check "${check.id}" cannot require production evidence without evidence-only classification.`);
    }
    const evidenceClass = check.evidenceClass ?? 'unknown';
    if (!EVIDENCE_CLASSES.has(evidenceClass)) {
      fail(`check "${check.id}" has invalid evidenceClass "${evidenceClass}".`);
    }
    const evidenceQuality = check.evidenceQuality ?? 'provisional';
    if (!EVIDENCE_QUALITIES.has(evidenceQuality)) {
      fail(`check "${check.id}" has invalid evidenceQuality "${evidenceQuality}".`);
    }
    const executionEnvironment = check.executionEnvironment ?? 'unknown';
    if (!EXECUTION_ENVIRONMENTS.has(executionEnvironment)) {
      fail(`check "${check.id}" has invalid executionEnvironment "${executionEnvironment}".`);
    }
    if (evidenceClass === 'evidence_only' && !evidenceOnly) {
      fail(`check "${check.id}" evidenceClass evidence_only requires evidence-only classification.`);
    }
    let workflowEvidence;
    if (check.workflow) {
      if (!check.workflowEvidence || typeof check.workflowEvidence !== 'object'
        || Array.isArray(check.workflowEvidence)) {
        fail(`workflow check "${check.id}" requires workflowEvidence policy.`);
      }
      const workflowEvidenceFields = new Set([
        'resultContract',
        'schemaTestConfigVersion',
        'configPaths',
        'migrationDirectory',
        'requiredSuiteIds',
        'maxAgeMs',
      ]);
      const unexpectedWorkflowEvidenceFields = Object.keys(check.workflowEvidence)
        .filter((field) => !workflowEvidenceFields.has(field));
      if (unexpectedWorkflowEvidenceFields.length > 0) {
        fail(`workflow check "${check.id}" contains unsupported workflowEvidence fields.`);
      }
      if (check.workflowEvidence.resultContract !== PGTAP_WORKFLOW_EVIDENCE_CONTRACT) {
        fail(`workflow check "${check.id}" resultContract must be "${PGTAP_WORKFLOW_EVIDENCE_CONTRACT}".`);
      }
      const maxAgeMs = Number(check.workflowEvidence.maxAgeMs);
      if (!Number.isInteger(maxAgeMs) || maxAgeMs < 60_000 || maxAgeMs > 86_400_000) {
        fail(`workflow check "${check.id}" maxAgeMs must be between 60000 and 86400000.`);
      }
      const schemaTestConfigVersion = typeof check.workflowEvidence.schemaTestConfigVersion === 'string'
        ? check.workflowEvidence.schemaTestConfigVersion.trim()
        : '';
      if (!/^[a-z0-9][a-z0-9._-]{0,127}$/i.test(schemaTestConfigVersion)) {
        fail(`workflow check "${check.id}" schemaTestConfigVersion is invalid.`);
      }
      if (typeof check.workflowEvidence.migrationDirectory !== 'string'
        || !check.workflowEvidence.migrationDirectory.trim()) {
        fail(`workflow check "${check.id}" migrationDirectory is required.`);
      }
      workflowEvidence = {
        resultContract: PGTAP_WORKFLOW_EVIDENCE_CONTRACT,
        schemaTestConfigVersion,
        configPaths: asStringArray(
          check.workflowEvidence.configPaths ?? [],
          `check ${check.id}.workflowEvidence.configPaths`,
          { allowEmpty: false },
        ).map((value) => normalizeRepositoryPath(value, `check ${check.id}.workflowEvidence.configPaths`)),
        migrationDirectory: normalizeRepositoryPath(
          check.workflowEvidence.migrationDirectory,
          `check ${check.id}.workflowEvidence.migrationDirectory`,
        ),
        requiredSuiteIds: asStringArray(
          check.workflowEvidence.requiredSuiteIds ?? [],
          `check ${check.id}.workflowEvidence.requiredSuiteIds`,
          { allowEmpty: false },
        ).map((value) => normalizeRepositoryPath(value, `check ${check.id}.workflowEvidence.requiredSuiteIds`)),
        maxAgeMs,
      };
    } else if (check.workflowEvidence !== undefined) {
      fail(`check "${check.id}" cannot declare workflowEvidence without a workflow.`);
    }
    const explicitWorkspace = typeof check.workspace === 'string' && check.workspace.trim()
      ? normalizeRepositoryPath(check.workspace, `check ${check.id}.workspace`)
      : null;
    const legacyWorkspace = typeof check.packagePath === 'string' && check.packagePath.trim()
      ? workspaceFromPackagePath(check.packagePath)
      : null;
    if (explicitWorkspace && legacyWorkspace && explicitWorkspace !== legacyWorkspace) {
      fail(`check "${check.id}" workspace and packagePath identify different packages.`);
    }
    return {
      id: check.id.trim(),
      ...(check.script ? { script: check.script.trim() } : {}),
      ...(check.script ? {
        workspace: explicitWorkspace ?? legacyWorkspace,
        ...(legacyWorkspace ? { packagePath: packagePathForWorkspace(legacyWorkspace) } : {}),
      } : {}),
      ...(check.command ? { command: check.command.trim() } : {}),
      ...(check.workflow ? { workflow: check.workflow.trim().replaceAll('\\', '/') } : {}),
      capabilities: capabilitiesForCheck,
      capabilityWildcard,
      classifications,
      scenarios: asStringArray(check.scenarios ?? [], `check ${check.id}.scenarios`),
      qualifiedTestIdentities: asStringArray(
        check.qualifiedTestIdentities ?? [],
        `check ${check.id}.qualifiedTestIdentities`,
      ),
      lanes: checkLanes,
      confidence,
      evidenceClass,
      evidenceQuality,
      executionEnvironment,
      productionEvidenceRequired: check.productionEvidenceRequired === true,
      timingThresholds: normalizeVerificationTimingThresholds(
        check.timingThresholds ?? {},
        timingPolicy.defaultThresholds,
      ),
      ...(resultContract ? { resultContract } : {}),
      ...(workflowEvidence ? { workflowEvidence } : {}),
      notes: typeof check.notes === 'string' ? check.notes.trim() : '',
    };
  });

  const checkIds = new Set(checks.map((entry) => entry.id));
  for (const capability of capabilities) {
    for (const requirement of capability.scenarioRequirements) {
      for (const checkId of requirement.checkIds) {
        if (!checkIds.has(checkId)) {
          fail(`capability "${capability.id}" scenario "${requirement.id}" references unknown check "${checkId}".`);
        }
      }
    }
  }

  return {
    schemaVersion: input.schemaVersion,
    policyVersion: typeof input.policyVersion === 'string' && input.policyVersion.trim()
      ? input.policyVersion.trim()
      : 'unversioned',
    globalPathPrefixes: asStringArray(input.globalPathPrefixes ?? [], 'globalPathPrefixes'),
    timingPolicy,
    capabilities,
    checks,
    lanes,
  };
}

export function resolveVerificationPolicy(policy, options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const packages = discoverPackages(rootDir);
  const byWorkspace = new Map(packages.map((entry) => [entry.workspace, entry]));
  const checks = policy.checks.map((check) => {
    if (!check.script) {
      const workspace = check.workspace ?? 'root';
      const descriptor = byWorkspace.get(workspace) ?? null;
      const resolved = {
        ...check,
        workspace,
        packagePath: descriptor?.packagePath ?? null,
        packageName: descriptor?.packageName ?? null,
        workingDirectory: workspace === 'root' ? '.' : workspace,
      };
      return {
        ...resolved,
        timingIdentity: verificationTimingIdentity(resolved),
      };
    }
    let descriptor;
    if (check.workspace) {
      descriptor = byWorkspace.get(check.workspace);
      if (!descriptor) {
        fail(`check "${check.id}" references missing workspace "${check.workspace}".`);
      }
    } else {
      const matches = packages.filter((entry) => Object.hasOwn(entry.scripts, check.script));
      if (matches.length === 0) fail(`check "${check.id}" references missing package script "${check.script}".`);
      if (matches.length > 1) {
        const identities = matches.map((entry) => scriptIdentity(entry.workspace, check.script)).sort();
        fail(`check "${check.id}" has ambiguous unqualified script "${check.script}"; matches: ${identities.join(', ')}.`);
      }
      [descriptor] = matches;
    }
    if (!Object.hasOwn(descriptor.scripts, check.script)) {
      fail(`check "${check.id}" references missing package script "${scriptIdentity(descriptor.workspace, check.script)}".`);
    }
    const resolved = {
      ...check,
      workspace: descriptor.workspace,
      packagePath: descriptor.packagePath,
      packageName: descriptor.packageName,
      workingDirectory: descriptor.workingDirectory,
      scriptIdentity: scriptIdentity(descriptor.workspace, check.script),
    };
    return { ...resolved, timingIdentity: verificationTimingIdentity(resolved) };
  });
  return { ...policy, checks, resolvedRoot: rootDir };
}

export function loadVerificationPolicy(options = {}) {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  const policyPath = path.resolve(rootDir, options.policyPath ?? path.join('config', 'verification-policy.json'));
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to load ECS verification policy at ${policyPath}: ${message}`);
  }
  const policy = validateVerificationPolicy(parsed);
  return options.resolve === false ? policy : resolveVerificationPolicy(policy, { rootDir });
}
