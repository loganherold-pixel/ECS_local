import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'loadout-consequence-preview-production-readiness-result.json');
const EVIDENCE_RELATIVE_PATH = path.join('.smoke', 'loadout-consequence-preview-production-evidence.json');

const REQUIRED_EVIDENCE_FIELDS = [
  'evidenceId',
  'evidenceSource',
  'generatedAt',
  'androidNoNetwork',
  'profileVariance',
  'multiVehicle',
  'scaleTicket',
  'loadedScaleDelta',
  'offlineCache',
  'largeLoadoutPerformance',
  'ownerAcceptance',
];

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

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function evidencePathExists(root, evidencePath) {
  if (!evidencePath || typeof evidencePath !== 'string') return false;
  const resolved = path.isAbsolute(evidencePath) ? evidencePath : path.join(root, evidencePath);
  return fs.existsSync(resolved);
}

function sectionPassed(section, root) {
  return isObject(section) && section.passed === true && evidencePathExists(root, section.evidencePath);
}

function addSectionBlocker(blockers, id, section, root) {
  if (!sectionPassed(section, root)) blockers.push(id);
}

export function validateLoadoutConsequencePreviewProductionEvidenceManifest(manifest, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const blockers = [];
  const warnings = [];

  if (!isObject(manifest)) {
    return {
      valid: false,
      structurallyValid: false,
      productionEligible: false,
      blockers: ['production_evidence_manifest_malformed'],
      warnings,
    };
  }

  for (const field of REQUIRED_EVIDENCE_FIELDS) {
    if (!(field in manifest)) blockers.push(`production_evidence_${field}_missing`);
  }

  const structurallyValid = blockers.length === 0;
  if (!structurallyValid) {
    return {
      valid: false,
      structurallyValid: false,
      productionEligible: false,
      blockers: ['production_evidence_manifest_malformed', ...blockers],
      warnings,
    };
  }

  if (manifest.evidenceSource !== 'real') blockers.push('production_evidence_source_not_real');
  if (typeof manifest.evidenceId !== 'string' || manifest.evidenceId.trim().length === 0) blockers.push('production_evidence_id_missing');
  if (Number.isNaN(Date.parse(manifest.generatedAt))) blockers.push('production_evidence_generated_at_invalid');

  addSectionBlocker(blockers, 'android_no_network_device_evidence', manifest.androidNoNetwork, root);
  if (manifest.androidNoNetwork?.ownerAccepted !== true) blockers.push('android_no_network_owner_acceptance_missing');
  if (!manifest.androidNoNetwork?.deviceOrEmulator) blockers.push('android_no_network_device_missing');

  addSectionBlocker(blockers, 'profile_variance_evidence', manifest.profileVariance, root);
  if ((manifest.profileVariance?.profilesTested ?? 0) < 3) blockers.push('profile_variance_matrix_too_small');

  addSectionBlocker(blockers, 'multi_vehicle_evidence', manifest.multiVehicle, root);
  if ((manifest.multiVehicle?.vehiclesTested ?? 0) < 2) blockers.push('multi_vehicle_matrix_too_small');

  addSectionBlocker(blockers, 'scale_ticket_evidence', manifest.scaleTicket, root);
  if (!Array.isArray(manifest.scaleTicket?.acceptedEvidenceIds) || manifest.scaleTicket.acceptedEvidenceIds.length === 0) {
    blockers.push('scale_ticket_accepted_evidence_missing');
  }

  addSectionBlocker(blockers, 'loaded_scale_delta_evidence', manifest.loadedScaleDelta, root);
  const observedDelta = Number(manifest.loadedScaleDelta?.observedDeltaPercent);
  const maxAcceptedDelta = Number(manifest.loadedScaleDelta?.maxAcceptedDeltaPercent ?? 5);
  if (!Number.isFinite(observedDelta)) blockers.push('loaded_scale_delta_observation_missing');
  if (!Number.isFinite(maxAcceptedDelta)) blockers.push('loaded_scale_delta_policy_missing');
  if (Number.isFinite(observedDelta) && Number.isFinite(maxAcceptedDelta) && observedDelta > maxAcceptedDelta) {
    blockers.push('loaded_scale_delta_exceeds_policy');
  }

  addSectionBlocker(blockers, 'offline_cache_evidence', manifest.offlineCache, root);

  addSectionBlocker(blockers, 'large_loadout_performance_evidence', manifest.largeLoadoutPerformance, root);
  if ((manifest.largeLoadoutPerformance?.itemCount ?? 0) < 200) blockers.push('large_loadout_performance_item_count_too_small');
  if ((manifest.largeLoadoutPerformance?.maxPreviewMs ?? Number.POSITIVE_INFINITY) > 1500) {
    blockers.push('large_loadout_performance_too_slow');
  }

  if (manifest.ownerAcceptance?.accepted !== true) blockers.push('production_owner_decision_accepted');
  if (!manifest.ownerAcceptance?.acceptedBy || Number.isNaN(Date.parse(manifest.ownerAcceptance?.acceptedAt))) {
    blockers.push('production_owner_acceptance_metadata_missing');
  }

  return {
    valid: blockers.length === 0,
    structurallyValid: true,
    productionEligible: blockers.length === 0,
    blockers: Array.from(new Set(blockers)),
    warnings,
  };
}

function manifestCheckPassed(manifestValidation, id) {
  return manifestValidation.productionEligible && !manifestValidation.blockers.includes(id);
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

  const manifestExists = fs.existsSync(paths.evidence);
  const evidenceManifest = readJsonIfExists(paths.evidence);
  const manifestValidation = manifestExists
    ? validateLoadoutConsequencePreviewProductionEvidenceManifest(evidenceManifest, { rootDir: root })
    : {
        valid: false,
        structurallyValid: false,
        productionEligible: false,
        blockers: ['production_evidence_manifest_missing'],
        warnings: [],
      };
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
      'Loadout Consequence Preview service exposes deterministic before/after payload, GVWR, trace, risk, suggestions, mirror validity, and source warnings.',
      service.includes('LoadoutConsequenceSystem') &&
        service.includes('buildLoadoutConsequencePreview') &&
        service.includes('calculationTrace') &&
        service.includes('riskTraces') &&
        service.includes('sourcePrecedenceApplied') &&
        service.includes('applyLoadoutSuggestionAction') &&
        service.includes('validateLoadoutScaleValidationEvidence') &&
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
      ['Keep loadout consequence math deterministic, source-explicit, and provenance-traceable.'],
    ),
    check(
      'loadout_consequence_ui_and_command_brief_mirror_present',
      'Fleet loadout editor renders the preview and Command Brief mirrors only valid aggregate impact.',
      panel.includes('Loadout Consequence Preview') &&
        panel.includes('sourceWarnings') &&
        panel.includes('Remove or relocate') &&
        !panel.includes('label="Accept"') &&
        fleetModal.includes('LoadoutConsequencePreviewPanel') &&
        fleetModal.includes('applyLoadoutSuggestionAction') &&
        fleetModal.includes('invalidateLoadoutConsequenceMirror') &&
        fleetModal.includes('publishLoadoutConsequencePreview') &&
        commandBrief.includes('LoadoutConsequenceCommandBriefPanel') &&
        commandBrief.includes('useLoadoutConsequencePreviewSnapshot') &&
        commandBrief.includes('summary.stale') &&
        commandBrief.includes('invalidationReason'),
      [relPath(root, paths.panel), relPath(root, paths.fleetModal), relPath(root, paths.commandBrief)],
      ['Keep Fleet and Command Brief surfaces wired to the same deterministic preview result and stale-mirror metadata.'],
    ),
    check(
      'loadout_consequence_evidence_events_registered',
      'Evidence events distinguish viewed, acknowledged, editor-opened, applied, failed, dismissed, source, warning, mirror, and commit behavior.',
      telemetry.includes('preview_generated') &&
        telemetry.includes('suggestion_viewed') &&
        telemetry.includes('suggestion_acknowledged') &&
        telemetry.includes('suggestion_editor_opened') &&
        telemetry.includes('suggestion_applied') &&
        telemetry.includes('suggestion_apply_failed') &&
        telemetry.includes('command_brief_mirror_updated') &&
        telemetry.includes('command_brief_mirror_invalidated') &&
        telemetry.includes('source_confirmed') &&
        telemetry.includes('warning_acknowledged') &&
        telemetry.includes('loadout_committed') &&
        panel.includes('suggestion_viewed') &&
        panel.includes('suggestion_acknowledged') &&
        fleetModal.includes('suggestion_applied') &&
        fleetModal.includes('suggestion_apply_failed') &&
        fleetModal.includes('command_brief_mirror_invalidated') &&
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
      manifestCheckPassed(manifestValidation, 'android_no_network_device_evidence'),
      [relPath(root, paths.evidence)],
      ['Run Android device/emulator evidence with network disabled and capture preview screenshots/logs.'],
    ),
    check(
      'profile_variance_evidence',
      'Profile variance evidence covers different vehicle classes, tire/lift profiles, and route contexts.',
      manifestCheckPassed(manifestValidation, 'profile_variance_evidence'),
      [relPath(root, paths.evidence)],
      ['Capture representative vehicle/profile/route matrix evidence.'],
    ),
    check(
      'multi_vehicle_evidence',
      'Multi-vehicle evidence confirms preview state follows the active vehicle and does not bleed across profiles.',
      manifestCheckPassed(manifestValidation, 'multi_vehicle_evidence'),
      [relPath(root, paths.evidence)],
      ['Run multi-vehicle active selection evidence and verify Command Brief filtering.'],
    ),
    check(
      'scale_ticket_evidence',
      'Scale-ticket evidence confirms user-confirmed weight sources override OEM/default/estimated values.',
      manifestCheckPassed(manifestValidation, 'scale_ticket_evidence'),
      [relPath(root, paths.evidence)],
      ['Capture before/after source precedence evidence using scale-ticket or equivalent verified weights.'],
    ),
    check(
      'loaded_scale_delta_evidence',
      'Loaded-scale evidence compares preview deltas against a weighed loaded vehicle/loadout sample.',
      manifestCheckPassed(manifestValidation, 'loaded_scale_delta_evidence'),
      [relPath(root, paths.evidence)],
      ['Compare preview payload/GVWR deltas against a measured loaded configuration.'],
    ),
    check(
      'offline_cache_evidence',
      'Offline/cache evidence confirms stale or missing source data remains visible and never upgrades confidence.',
      manifestCheckPassed(manifestValidation, 'offline_cache_evidence'),
      [relPath(root, paths.evidence)],
      ['Capture stale/missing/offline cache scenarios with source warnings visible.'],
    ),
    check(
      'large_loadout_performance_evidence',
      'Large-loadout performance evidence confirms preview generation stays responsive with representative item volume.',
      manifestCheckPassed(manifestValidation, 'large_loadout_performance_evidence'),
      [relPath(root, paths.evidence)],
      ['Capture representative large-loadout timing evidence and keep local preview responsive.'],
    ),
    check(
      'production_owner_decision_accepted',
      'Production owner decision is accepted for Loadout Consequence Preview.',
      manifestValidation.productionEligible && !manifestValidation.blockers.includes('production_owner_decision_accepted'),
      [relPath(root, paths.evidence)],
      ['Record product, engineering, field-ops, and QA acceptance after evidence is complete.'],
    ),
  ];

  const failed = checks.filter((item) => !item.passed);
  const blockers = Array.from(new Set([
    ...failed.map((item) => item.id),
    ...manifestValidation.blockers,
  ]));
  return {
    passed: failed.length === 0 && manifestValidation.productionEligible,
    status: failed.length === 0 && manifestValidation.productionEligible ? 'production_ready' : 'blocked',
    statusLabel: failed.length === 0 && manifestValidation.productionEligible ? 'Production ready' : 'Blocked for production',
    checkedAt: new Date().toISOString(),
    system: 'loadout_consequence_preview',
    checks,
    blockers,
    remediation: failed.flatMap((item) => item.remediation),
    evidenceContract: {
      path: EVIDENCE_RELATIVE_PATH,
      requiredFields: REQUIRED_EVIDENCE_FIELDS,
    },
    evidenceManifest: {
      present: manifestExists,
      valid: manifestValidation.valid,
      structurallyValid: manifestValidation.structurallyValid,
      productionEligible: manifestValidation.productionEligible,
      blockers: manifestValidation.blockers,
      warnings: manifestValidation.warnings,
    },
    notes: [
      'This gate separates current user-facing extension readiness from production readiness.',
      'The preview is deterministic and advisory; production remains blocked until Android, profile, multi-vehicle, scale-ticket, loaded-scale, offline/cache, large-loadout, and owner evidence exists.',
      'Source warnings must remain visible for OEM, default, estimated, stale, missing, cached, or inferred values.',
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
