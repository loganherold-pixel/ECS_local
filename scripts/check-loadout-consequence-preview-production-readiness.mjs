import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'loadout-consequence-preview-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'loadout-consequence-preview-production-evidence.json');

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

export function buildLoadoutConsequencePreviewProductionReadinessResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const paths = {
    result: path.join(root, RESULT_RELATIVE_PATH),
    evidence: path.join(root, EVIDENCE_RELATIVE_PATH),
    service: path.join(root, 'lib', 'fleet', 'loadoutConsequencePreview.ts'),
    panel: path.join(root, 'components', 'fleet', 'LoadoutConsequencePreviewPanel.tsx'),
    fleetModal: path.join(root, 'components', 'fleet', 'FleetBuildLoadoutModal.tsx'),
    commandBrief: path.join(root, 'components', 'brief', 'CommandBriefScreen.tsx'),
    telemetry: path.join(root, 'lib', 'fleet', 'fleetTelemetryEvents.ts'),
    test: path.join(root, 'scripts', 'test-loadout-consequence-preview.js'),
    packageJson: path.join(root, 'package.json'),
  };

  const evidence = readJsonIfExists(paths.evidence);
  const service = readIfExists(paths.service);
  const panel = readIfExists(paths.panel);
  const fleetModal = readIfExists(paths.fleetModal);
  const commandBrief = readIfExists(paths.commandBrief);
  const telemetry = readIfExists(paths.telemetry);
  const test = readIfExists(paths.test);
  const packageJson = readIfExists(paths.packageJson);

  const checks = [
    check(
      'loadout_consequence_service_contract_present',
      'Loadout Consequence Preview service exposes deterministic before/after payload, GVWR, risk, suggestions, and source warnings.',
      service.includes('LoadoutConsequenceSystem') &&
        service.includes('buildLoadoutConsequencePreview') &&
        service.includes('SourceKind') &&
        service.includes('payloadRemainingBefore') &&
        service.includes('payloadRemainingAfter') &&
        service.includes('gvwrPercentBefore') &&
        service.includes('gvwrPercentAfter') &&
        service.includes('topHeavyRisk') &&
        service.includes('recoveryDifficultyImpact') &&
        service.includes('routeSuitabilityImpact') &&
        service.includes('sourceWarnings') &&
        service.includes('resolveEvidenceValue') &&
        service.includes('inferred-base-from-net-payload'),
      [relPath(root, paths.service)],
      ['Keep loadout consequence math deterministic and source-explicit.'],
    ),
    check(
      'loadout_consequence_ui_and_command_brief_mirror_present',
      'Fleet loadout editor renders the preview and Command Brief mirrors aggregate impact.',
      panel.includes('Loadout Consequence Preview') &&
        panel.includes('sourceWarnings') &&
        panel.includes('Remove or relocate') &&
        fleetModal.includes('LoadoutConsequencePreviewPanel') &&
        fleetModal.includes('publishLoadoutConsequencePreview') &&
        commandBrief.includes('LoadoutConsequenceCommandBriefPanel') &&
        commandBrief.includes('useLoadoutConsequencePreviewSnapshot'),
      [relPath(root, paths.panel), relPath(root, paths.fleetModal), relPath(root, paths.commandBrief)],
      ['Keep Fleet and Command Brief surfaces wired to the same deterministic preview result.'],
    ),
    check(
      'loadout_consequence_evidence_events_registered',
      'Evidence events are registered for generated previews, suggestions, source confirmation, warnings, and commit.',
      telemetry.includes('preview_generated') &&
        telemetry.includes('suggestion_viewed') &&
        telemetry.includes('suggestion_accepted') &&
        telemetry.includes('source_confirmed') &&
        telemetry.includes('warning_acknowledged') &&
        telemetry.includes('loadout_committed') &&
        panel.includes('suggestion_viewed') &&
        panel.includes('suggestion_accepted') &&
        fleetModal.includes('loadout_committed'),
      [relPath(root, paths.telemetry), relPath(root, paths.panel), relPath(root, paths.fleetModal)],
      ['Keep evidence events non-blocking and source-truth aligned.'],
    ),
    check(
      'loadout_consequence_test_script_registered',
      'Focused Loadout Consequence Preview test is registered in package scripts.',
      packageJson.includes('"test:loadout-consequence-preview"') &&
        packageJson.includes('scripts/test-loadout-consequence-preview.js') &&
        test.includes('Loadout consequence preview checks passed.'),
      [relPath(root, paths.packageJson), relPath(root, paths.test)],
      ['Keep the deterministic preview contract covered by a focused test script.'],
    ),
    check(
      'android_no_network_device_evidence',
      'Android device/emulator no-network evidence confirms the preview stays truthful using cached/local state.',
      evidenceTrue(evidence, 'androidNoNetworkDeviceEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Run Android device/emulator evidence with network disabled and capture preview screenshots/logs.'],
    ),
    check(
      'profile_variance_evidence',
      'Profile variance evidence covers different vehicle classes, tire/lift profiles, and route contexts.',
      evidenceTrue(evidence, 'profileVarianceEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Capture representative vehicle/profile/route matrix evidence.'],
    ),
    check(
      'multi_vehicle_evidence',
      'Multi-vehicle evidence confirms preview state follows the active vehicle and does not bleed across profiles.',
      evidenceTrue(evidence, 'multiVehicleEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Run multi-vehicle active selection evidence and verify Command Brief filtering.'],
    ),
    check(
      'scale_ticket_evidence',
      'Scale-ticket evidence confirms user-confirmed weight sources override OEM/default/estimated values.',
      evidenceTrue(evidence, 'scaleTicketEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Capture before/after source precedence evidence using scale-ticket or equivalent verified weights.'],
    ),
    check(
      'loaded_scale_delta_evidence',
      'Loaded-scale evidence compares preview deltas against a weighed loaded vehicle/loadout sample.',
      evidenceTrue(evidence, 'loadedScaleDeltaEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Compare preview payload/GVWR deltas against a measured loaded configuration.'],
    ),
    check(
      'offline_cache_evidence',
      'Offline/cache evidence confirms stale or missing source data remains visible and never upgrades confidence.',
      evidenceTrue(evidence, 'offlineCacheEvidencePassed'),
      [relPath(root, paths.evidence)],
      ['Capture stale/missing/offline cache scenarios with source warnings visible.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Loadout Consequence Preview.',
      accepted(evidence?.productionDecision),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, field-ops, and QA acceptance after evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  return {
    passed: failed.length === 0,
    status: failed.length === 0 ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'loadout_consequence_preview',
    checks,
    blockers: failed.map((item) => item.id),
    remediation: failed.flatMap((item) => item.remediation),
    evidenceContract: {
      path: EVIDENCE_RELATIVE_PATH,
      requiredFields: [
        'androidNoNetworkDeviceEvidencePassed',
        'profileVarianceEvidencePassed',
        'multiVehicleEvidencePassed',
        'scaleTicketEvidencePassed',
        'loadedScaleDeltaEvidencePassed',
        'offlineCacheEvidencePassed',
        'productionDecision',
      ],
    },
    notes: [
      'This gate separates current user-facing extension readiness from production readiness.',
      'The preview is deterministic and advisory; production remains blocked until Android, profile, multi-vehicle, scale-ticket, loaded-scale, and offline/cache evidence exists.',
      'Source warnings must remain visible for OEM, default, estimated, stale, missing, or inferred values.',
    ],
  };
}

export function writeLoadoutConsequencePreviewProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const resultPath = path.join(root, RESULT_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(resultPath), { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatLoadoutConsequencePreviewProductionReadinessResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `Loadout Consequence Preview production readiness: ${result.statusLabel}`,
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
  const result = buildLoadoutConsequencePreviewProductionReadinessResult();
  writeLoadoutConsequencePreviewProductionReadinessResult(result);
  if (jsonOnly) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else process.stdout.write(formatLoadoutConsequencePreviewProductionReadinessResult(result));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
