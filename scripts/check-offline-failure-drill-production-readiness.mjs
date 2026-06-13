import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'offline-failure-drill-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'offline-failure-drill-android-evidence.json');

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

function check(id, label, passed, evidence = [], remediation = []) {
  return {
    id,
    label,
    passed: Boolean(passed),
    evidence,
    remediation,
  };
}

function evidenceTrue(evidence, key) {
  return evidence?.[key] === true;
}

function accepted(value) {
  return String(value ?? '').trim().toLowerCase() === 'accepted';
}

export function buildOfflineFailureDrillProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    service: path.join(root, 'lib', 'offlineFailureDrillService.ts'),
    panel: path.join(root, 'components', 'offline', 'OfflineFailureDrillPanel.tsx'),
    test: path.join(root, 'scripts', 'test-offline-failure-drill.js'),
    packageJson: path.join(root, 'package.json'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const service = readIfExists(paths.service);
  const panel = readIfExists(paths.panel);
  const test = readIfExists(paths.test);
  const packageJson = readIfExists(paths.packageJson);

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
        service.includes('localOnly: true'),
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
        panel.includes('Production remains blocked until Android no-network device evidence is captured.'),
      [relPath(root, paths.panel)],
      ['Keep the user-facing drill visible and explicit about Android evidence blockers.'],
    ),
    check(
      'offline_drill_test_script_registered',
      'Offline Failure Drill unit/contract test is registered in package scripts.',
      packageJson.includes('"test:offline-failure-drill"') &&
        packageJson.includes('scripts/test-offline-failure-drill.js') &&
        test.includes('Offline Failure Drill checks passed.'),
      [relPath(root, paths.packageJson), relPath(root, paths.test)],
      ['Keep the focused drill test available to CI and local release sweeps.'],
    ),
    check(
      'offline_drill_local_only_safety_copy_present',
      'Drill copy avoids live routing, live weather, live availability, provider update, team sync, and fresh Dispatch overclaims.',
      service.includes('network is unavailable') &&
        service.includes('queued locally') &&
        service.includes('replay sync wait for network') &&
        panel.includes('Live routing, live weather, live availability, team sync, provider updates, and fresh Dispatch state are not promised'),
      [relPath(root, paths.service), relPath(root, paths.panel)],
      ['Keep no-network copy conservative and cache-bound.'],
    ),
    check(
      'android_no_network_drill_evidence_present',
      'Android no-network Offline Failure Drill evidence is recorded from device/emulator runtime.',
      evidenceTrue(evidence, 'androidNoNetworkDrillPassed'),
      [relPath(root, paths.evidence)],
      ['Run the drill on Android with network disabled and assert no-network mode inside the app/runtime.'],
    ),
    check(
      'android_drill_artifacts_complete',
      'Android drill screenshots, logs, and cache manifest are captured.',
      evidenceTrue(evidence, 'screenshotsCaptured') &&
        evidenceTrue(evidence, 'logsCaptured') &&
        evidenceTrue(evidence, 'cacheManifestCaptured'),
      [relPath(root, paths.evidence)],
      ['Capture screenshots of results, test logs, and the exact cache manifest used for the run.'],
    ),
    check(
      'android_no_remote_update_or_live_sync_confirmed',
      'Android evidence confirms no remote provider update or live sync succeeded while network was disabled.',
      evidenceTrue(evidence, 'noRemoteProviderUpdateOrLiveSyncSucceeded'),
      [relPath(root, paths.evidence)],
      ['Record provider/sync logs proving unreachable network data did not upgrade classifications.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Offline Failure Drill.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, field-ops, and QA acceptance after Android no-network evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'offline_failure_drill',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
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
  const result = buildOfflineFailureDrillProductionReadinessResult();
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
