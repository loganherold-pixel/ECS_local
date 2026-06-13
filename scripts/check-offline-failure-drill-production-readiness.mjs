import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'offline-failure-drill-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'offline-failure-drill-android-evidence-manifest.json');
const requireForTs = createRequire(import.meta.url);

function relPath(root, filePath) {
  return path.relative(root, filePath).replace(/\\/g, '/');
}

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(readIfExists(filePath));
  } catch {
    return null;
  }
}

function loadTsModule(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filePath,
  }).outputText;
  const module = { exports: {} };
  const localRequire = (request) => {
    if (request.startsWith('.')) {
      const resolved = path.join(path.dirname(filePath), request.endsWith('.ts') ? request : `${request}.ts`);
      return loadTsModule(resolved);
    }
    return requireForTs(request);
  };
  const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  fn(module.exports, localRequire, module, filePath, path.dirname(filePath));
  return module.exports;
}

function manifestPathFromOptions(root, options = {}) {
  const argPath = options.evidenceManifestPath;
  const envPath = process.env.OFFLINE_FAILURE_DRILL_ANDROID_EVIDENCE_MANIFEST;
  const rawPath = argPath || envPath || path.join(root, EVIDENCE_RELATIVE_PATH);
  if (!rawPath) return null;
  return path.isAbsolute(rawPath) ? rawPath : path.join(root, rawPath);
}

function check(id, label, passed, evidence = [], remediation = []) {
  return {
    id,
    label,
    passed: Boolean(passed),
    evidence,
    remediation,
  };
}

export function buildOfflineFailureDrillProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: manifestPathFromOptions(root, options),
    evidenceModule: path.join(root, 'lib', 'offlineFailureDrillEvidence.ts'),
    service: path.join(root, 'lib', 'offlineFailureDrillService.ts'),
    panel: path.join(root, 'components', 'offline', 'OfflineFailureDrillPanel.tsx'),
    test: path.join(root, 'scripts', 'test-offline-failure-drill.js'),
    evidenceTest: path.join(root, 'scripts', 'test-offline-failure-drill-evidence.js'),
    packageJson: path.join(root, 'package.json'),
  };

  const service = readIfExists(paths.service);
  const panel = readIfExists(paths.panel);
  const test = readIfExists(paths.test);
  const evidenceTest = readIfExists(paths.evidenceTest);
  const packageJson = readIfExists(paths.packageJson);
  const {
    validateOfflineFailureDrillAndroidEvidenceManifest,
  } = loadTsModule(paths.evidenceModule);

  let evidence = null;
  let validation = {
    structurallyValid: false,
    productionEligible: false,
    evidenceId: null,
    evidenceKind: null,
    evidenceSource: 'unknown',
    ownerAccepted: false,
    failedRules: ['manifest_path_missing'],
    missingArtifacts: [],
    blockers: ['android_evidence_manifest_missing'],
    validationNotes: ['No Android no-network evidence manifest path was provided or found.'],
  };

  if (paths.evidence && fs.existsSync(paths.evidence)) {
    try {
      evidence = JSON.parse(fs.readFileSync(paths.evidence, 'utf8'));
      validation = validateOfflineFailureDrillAndroidEvidenceManifest(evidence, {
        rootDir: root,
        artifactExists: fs.existsSync,
      });
    } catch {
      validation = {
        ...validation,
        failedRules: ['manifest_json_malformed'],
        blockers: ['android_evidence_manifest_malformed'],
        validationNotes: ['Evidence manifest JSON could not be parsed.'],
      };
    }
  } else if (paths.evidence && options.evidenceManifestPath) {
    validation = {
      ...validation,
      failedRules: ['manifest_file_missing'],
      missingArtifacts: [paths.evidence],
      blockers: ['android_evidence_manifest_missing'],
      validationNotes: ['The requested Android evidence manifest file does not exist.'],
    };
  }

  const checks = [
    check(
      'offline_drill_service_contract_present',
      'Offline Drill service exposes local-only capability classifications and production evidence blockers.',
      service.includes('OfflineDrillService') &&
        service.includes('buildOfflineFailureDrill') &&
        service.includes('available_offline') &&
        service.includes('partially_available') &&
        service.includes('cached_but_stale') &&
        service.includes('manual_fallback_required') &&
        service.includes('blocked_android_no_network_evidence_required') &&
        service.includes('localOnly: true') &&
        service.includes('probeEvidence') &&
        service.includes('runtimeNetworkEvidence'),
      [relPath(root, paths.service)],
      ['Keep the drill deterministic and local-only.'],
    ),
    check(
      'offline_drill_user_facing_panel_present',
      'Offline Failure Drill panel renders status labels, stale timestamps, recommended downloads, and Android evidence blocker copy.',
      panel.includes('Offline Failure Drill') &&
        panel.includes('current user-facing ECS extension') &&
        panel.includes('Available offline') &&
        panel.includes('Partially available') &&
        panel.includes('Cached but stale') &&
        panel.includes('Manual fallback required') &&
        panel.includes('recommendedDownloads') &&
        panel.includes('lastCachedAt') &&
        panel.includes('probeEvidence') &&
        panel.includes('No-network evidence required before production'),
      [relPath(root, paths.panel)],
      ['Keep the user-facing drill visible and explicit about Android evidence blockers.'],
    ),
    check(
      'offline_drill_test_script_registered',
      'Offline Failure Drill unit/contract and evidence tests are registered in package scripts.',
      packageJson.includes('"test:offline-failure-drill"') &&
        packageJson.includes('"test:offline-failure-drill-evidence"') &&
        packageJson.includes('scripts/test-offline-failure-drill.js') &&
        packageJson.includes('scripts/test-offline-failure-drill-evidence.js') &&
        test.includes('Offline Failure Drill checks passed.') &&
        evidenceTest.includes('offline failure drill evidence checks passed'),
      [relPath(root, paths.packageJson), relPath(root, paths.test), relPath(root, paths.evidenceTest)],
      ['Keep the focused drill test available to CI and local release sweeps.'],
    ),
    check(
      'offline_drill_local_only_safety_copy_present',
      'Drill copy avoids live routing, live weather, live availability, provider update, team sync, and fresh Dispatch overclaims.',
      service.includes('available from local cache') &&
        service.includes('Pending Dispatch replay') &&
        service.includes('Not confirmed by source of truth') &&
        panel.includes('Available from local cache') &&
        !/live weather|live route updates|live provider availability|team sync active|Dispatch synced|fresh remote data|provider update succeeded|offline routing guaranteed/i.test(panel),
      [relPath(root, paths.service), relPath(root, paths.panel)],
      ['Keep no-network copy conservative and cache-bound.'],
    ),
    check(
      'android_evidence_manifest_valid',
      'Android no-network Offline Failure Drill evidence manifest is structurally valid and real-source labeled.',
      validation.structurallyValid === true && validation.evidenceSource === 'real',
      [paths.evidence ? relPath(root, paths.evidence) : EVIDENCE_RELATIVE_PATH],
      ['Run the drill on Android with network disabled and record a real evidence manifest.'],
    ),
    check(
      'android_evidence_artifacts_complete',
      'Android drill screenshots, logs, and cache manifest are captured.',
      validation.structurallyValid === true && validation.missingArtifacts.length === 0,
      [paths.evidence ? relPath(root, paths.evidence) : EVIDENCE_RELATIVE_PATH],
      ['Capture screenshots of results, test logs, and the exact cache manifest used for the run.'],
    ),
    check(
      'android_no_remote_update_or_live_sync_confirmed',
      'Android evidence confirms no remote provider update or live sync succeeded while network was disabled.',
      validation.structurallyValid === true &&
        !validation.failedRules.some((rule) => rule.startsWith('remoteAttemptSummary.')),
      [paths.evidence ? relPath(root, paths.evidence) : EVIDENCE_RELATIVE_PATH],
      ['Record provider/sync logs proving unreachable network data did not upgrade classifications.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Offline Failure Drill.',
      validation.ownerAccepted === true,
      [paths.evidence ? relPath(root, paths.evidence) : EVIDENCE_RELATIVE_PATH],
      ['Record product, engineering, field-ops, and QA acceptance after Android no-network evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  const validationBlockers = Array.from(new Set([
    ...validation.blockers,
    ...validation.failedRules,
  ]));
  const status = validation.productionEligible && failed.length === 0
    ? (evidence?.resultSummary?.productionReadiness === 'accepted' ? 'accepted' : 'evidence_ready')
    : 'blocked';
  return {
    passed: status !== 'blocked',
    status,
    statusLabel: status === 'accepted'
      ? 'Accepted for production'
      : status === 'evidence_ready'
        ? 'Evidence ready for owner review'
        : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'offline_failure_drill',
    evidenceManifestPath: paths.evidence && fs.existsSync(paths.evidence) ? paths.evidence : null,
    evidenceId: validation.evidenceId,
    missingArtifacts: validation.missingArtifacts,
    failedValidationRules: validation.failedRules,
    ownerAcceptance: {
      accepted: validation.ownerAccepted,
      acceptedBy: evidence?.ownerAcceptance?.acceptedBy ?? null,
      acceptedAt: evidence?.ownerAcceptance?.acceptedAt ?? null,
    },
    validation,
    checks,
    blockers: Array.from(new Set([...failed.map((item) => item.id), ...validationBlockers])),
    remediation: Array.from(new Set(failed.flatMap((item) => item.remediation))),
    notes: [
      'This gate separates Offline Failure Drill code readiness from real Android no-network evidence.',
      'The drill must use local cache/protocol/credential probes only while network is disabled.',
      'Production remains blocked until Android evidence proves unreachable network data never upgrades a capability status.',
    ],
  };
}

export function writeOfflineFailureDrillProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatOfflineFailureDrillProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Offline Failure Drill production readiness: ${result.statusLabel}`,
    `Result file: ${relPath(root, path.join(root, RESULT_RELATIVE_PATH))}`,
    `Evidence manifest: ${result.evidenceManifestPath ? relPath(root, result.evidenceManifestPath) : 'missing'}`,
    `Checked at: ${result.checkedAt}`,
    `Production ready: ${result.passed ? 'yes' : 'no'}`,
    '',
    'Checks:',
  ];
  for (const item of result.checks) lines.push(`- ${item.label}: ${item.passed ? 'pass' : 'blocked'}`);
  if (result.blockers.length > 0) {
    lines.push('', 'Active blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.failedValidationRules.length > 0) {
    lines.push('', 'Failed manifest validation rules:');
    for (const rule of result.failedValidationRules) lines.push(`- ${rule}`);
  }
  if (result.missingArtifacts.length > 0) {
    lines.push('', 'Missing evidence artifacts:');
    for (const artifact of result.missingArtifacts) lines.push(`- ${artifact}`);
  }
  if (result.remediation.length > 0) {
    lines.push('', 'Next actions:');
    for (const item of Array.from(new Set(result.remediation))) lines.push(`- ${item}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

async function main() {
  const jsonOnly = process.argv.includes('--json');
  const manifestArg = process.argv.find((arg) => arg.startsWith('--evidence-manifest='));
  const result = buildOfflineFailureDrillProductionReadinessResult({
    evidenceManifestPath: manifestArg ? manifestArg.slice('--evidence-manifest='.length) : undefined,
  });
  writeOfflineFailureDrillProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatOfflineFailureDrillProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
