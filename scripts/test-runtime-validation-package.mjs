import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  buildDevicePlanReport,
  runDevicePlanCli,
} from './runtime-regression/generate-device-plan.mjs';
import {
  RUNTIME_VALIDATION_PACKAGE_CONTRACT,
  RUNTIME_VALIDATION_PROCEDURE_DEFINITIONS,
  buildRuntimeValidationPackage,
  formatRuntimeValidationPackageMarkdown,
  parseRuntimeValidationArgs,
  resolveRuntimeValidationOutputPath,
  runRuntimeValidationPackageCli,
} from './runtime-regression/runtime-validation-package.mjs';

const ROOT = path.resolve(process.cwd());
const REGISTRY_PATH = path.join(ROOT, 'config', 'release-evidence-registry.json');
const FIXED_NOW = new Date('2026-07-16T12:00:00.000Z');
const BUILD_SHA = 'a'.repeat(40);
const BINARY_DIGEST = 'b'.repeat(64);

function provenance(overrides = {}) {
  return {
    schemaVersion: 'ecs.verification-provenance-artifact.v2',
    artifactPolicy: {
      audience: 'release_candidate',
      policyVersion: 4,
      rawFieldDataAllowed: false,
      retentionDays: 14,
    },
    generatedAt: '2026-07-16T11:00:00.000Z',
    commandId: 'release-binary-build',
    workspaceId: 'root',
    artifact: {
      id: 'supplied-release-artifact',
      kind: 'release-binary',
      fileCount: 1,
      sizeBytes: 1024,
      sha256: BINARY_DIGEST,
    },
    ci: {
      provider: 'local',
      runId: null,
      runAttempt: null,
      sourceCommit: BUILD_SHA,
    },
    productionApproval: 'not_granted_by_artifact_creation',
    ...overrides,
  };
}

const registryBefore = fs.readFileSync(REGISTRY_PATH, 'utf8');
const registrySnapshot = JSON.parse(registryBefore);
assert.deepEqual(
  parseRuntimeValidationArgs([
    '.smoke/verification/release-provenance.json',
    'android',
    'android_15',
    'pixel_8_pro',
    'provider_staging',
    '.smoke/verification/bound.json',
    '.smoke/verification/bound.md',
  ]),
  {
    registryPath: 'config/release-evidence-registry.json',
    artifactProvenancePath: '.smoke/verification/release-provenance.json',
    platform: 'android',
    osVersion: 'android_15',
    deviceModel: 'pixel_8_pro',
    providerEnvironment: 'provider_staging',
    output: '.smoke/verification/bound.json',
    summaryOutput: '.smoke/verification/bound.md',
  },
);
const template = buildRuntimeValidationPackage({ rootDir: ROOT, now: FIXED_NOW });

assert.equal(template.resultContract, RUNTIME_VALIDATION_PACKAGE_CONTRACT);
assert.equal(template.status, 'required_before_execution');
assert.equal(template.executionClaim, 'plan_only_not_executed');
assert.equal(template.reviewDecision, 'pending');
assert.equal(template.productionApproval, 'not_granted_by_runtime_validation');
assert.equal(
  template.authoritativeReleaseEvidenceRegistry.submissionCount,
  registrySnapshot.submissions.length,
);
assert.equal(
  template.authoritativeReleaseEvidenceRegistry.productionApproval.status,
  registrySnapshot.productionApproval.status,
);
assert.equal(
  template.authoritativeReleaseEvidenceRegistry.productionApproval.decision,
  registrySnapshot.productionApproval.decision,
);
assert.equal(template.procedures.length, 7);

const expectedScenarios = new Map([
  ['ecs.runtime.validation.dashboard_weather', ['online_live_provider', 'provider_timestamp', 'location_permission', 'app_foreground_refresh', 'offline_last_good_cache']],
  ['ecs.runtime.validation.terrain_risk', ['imported_route_with_elevation', 'active_guidance', 'progress_movement', 'orientation_change', 'route_without_elevation']],
  ['ecs.runtime.validation.gps_route_alignment', ['on_route_simulation', 'off_route_deviation', 'switchback_parallel_segment', 'poor_gps_accuracy', 'offline_guidance']],
  ['ecs.runtime.validation.draw_route', ['draw_points', 'immediate_line', 'undo', 'preview', 'cancel', 'map_style_change']],
  ['ecs.runtime.validation.navigate_layers', ['enable_layers', 'zoom_eligibility', 'pan_and_supersede', 'online_load', 'no_result_area', 'provider_failure', 'offline_cache']],
  ['ecs.runtime.validation.dispatch', ['open_from_command_dock', 'confirm_current_implementation', 'create_update_local_command', 'offline_state', 'active_expedition_switch']],
  ['ecs.runtime.validation.explore', ['guidance_ready_route', 'filters_reset', 'geometry_detail', 'route_preview', 'navigate_handoff']],
]);

for (const procedure of template.procedures) {
  assert.equal(procedure.status, 'not_executed');
  assert.equal(procedure.executionClaim, 'plan_only_not_executed');
  assert.equal(procedure.acceptanceState, 'not_submitted');
  assert.equal(procedure.exactBuildSha, null);
  assert.equal(procedure.binaryArtifactDigest, null);
  assert.equal(procedure.platform, null);
  assert.equal(procedure.osVersion, null);
  assert.equal(procedure.device.model, null);
  assert.equal(procedure.device.hardwareIdentifierRecorded, false);
  assert.equal(procedure.providerEnvironment, null);
  assert.equal(procedure.actualResult.executionStatus, 'not_run');
  assert.equal(procedure.actualResult.observedResult, null);
  assert.equal(procedure.reviewer.name, null);
  assert.equal(procedure.reviewer.decision, 'pending');
  assert.equal(procedure.reviewer.reviewedAt, null);
  assert.equal(procedure.expirationRevalidationPolicy.expiresAt, null);
  assert.ok(procedure.expirationRevalidationPolicy.maxAgeDays > 0);
  assert.ok(procedure.sanitizedScreenshotRequirements.length > 0);
  assert.ok(procedure.sanitizedLogRequirements.length > 0);
  assert.ok(procedure.privacyRestrictions.length > 0);
  assert.deepEqual(
    procedure.scenarioSteps.map((entry) => entry.scenarioId),
    expectedScenarios.get(procedure.evidenceId),
  );
  for (const scenario of procedure.scenarioSteps) {
    assert.ok(scenario.steps.length > 0);
    assert.equal(scenario.actualResult.executionStatus, 'not_run');
    assert.equal(scenario.actualResult.observedResult, null);
  }
  for (const binding of procedure.releaseEvidenceBindings) {
    assert.equal(binding.canAutoResolveRequirement, false);
    assert.equal(binding.submissionCreated, false);
    assert.ok(binding.requiredScenario);
    assert.ok(binding.reviewerRole);
    assert.ok(binding.revalidationPolicy.maxAgeDays > 0);
  }
}

assert.equal(template.artifactBinding.exactBuildSha, null);
assert.equal(template.artifactBinding.binaryArtifactDigest, null);
assert.equal(template.artifactBinding.platform, null);
assert.equal(template.artifactBinding.osVersion, null);
assert.equal(template.artifactBinding.device.model, null);
assert.equal(template.artifactBinding.providerEnvironment, null);

const bound = buildRuntimeValidationPackage({
  rootDir: ROOT,
  now: FIXED_NOW,
  artifactProvenance: provenance(),
  captureContext: {
    platform: 'android',
    osVersion: 'android_15',
    deviceModel: 'pixel_8_pro',
    providerEnvironment: 'provider_staging',
  },
});
assert.equal(bound.status, 'collection_ready_not_executed');
assert.equal(bound.artifactBinding.exactBuildSha, BUILD_SHA);
assert.equal(bound.artifactBinding.binaryArtifactDigest, BINARY_DIGEST);
assert.equal(bound.artifactBinding.platform, 'android');
assert.equal(bound.artifactBinding.osVersion, 'android_15');
assert.equal(bound.artifactBinding.device.model, 'pixel_8_pro');
assert.equal(bound.artifactBinding.device.hardwareIdentifierRecorded, false);
assert.equal(bound.artifactBinding.providerEnvironment, 'provider_staging');
for (const procedure of bound.procedures) {
  assert.equal(procedure.exactBuildSha, BUILD_SHA);
  assert.equal(procedure.binaryArtifactDigest, BINARY_DIGEST);
  assert.equal(procedure.platform, 'android');
  assert.equal(procedure.osVersion, 'android_15');
  assert.equal(procedure.device.model, 'pixel_8_pro');
  assert.equal(procedure.device.hardwareIdentifierRecorded, false);
  assert.equal(procedure.providerEnvironment, 'provider_staging');
  assert.equal(procedure.actualResult.executionStatus, 'not_run');
  assert.equal(procedure.reviewer.decision, 'pending');
  assert.equal(procedure.acceptanceState, 'not_submitted');
}

assert.throws(
  () => buildRuntimeValidationPackage({
    rootDir: ROOT,
    artifactProvenance: provenance({ ci: { sourceCommit: 'short' } }),
    captureContext: {
      platform: 'android',
      osVersion: 'android_15',
      deviceModel: 'pixel_8_pro',
      providerEnvironment: 'provider_staging',
    },
  }),
  /40-character source commit/,
);
assert.throws(
  () => buildRuntimeValidationPackage({
    rootDir: ROOT,
    artifactProvenance: provenance({
      artifact: {
        id: 'supplied-release-artifact',
        kind: 'release-binary',
        fileCount: 1,
        sizeBytes: 1024,
        sha256: 'short',
      },
    }),
    captureContext: {
      platform: 'android',
      osVersion: 'android_15',
      deviceModel: 'pixel_8_pro',
      providerEnvironment: 'provider_staging',
    },
  }),
  /SHA-256 artifact digest/,
);
assert.throws(
  () => buildRuntimeValidationPackage({
    rootDir: ROOT,
    artifactProvenance: provenance({ rawProviderResponse: { authorization: 'prohibited' } }),
    captureContext: {
      platform: 'android',
      osVersion: 'android_15',
      deviceModel: 'pixel_8_pro',
      providerEnvironment: 'provider_staging',
    },
  }),
  /unsupported fields/,
);
assert.throws(
  () => buildRuntimeValidationPackage({
    rootDir: ROOT,
    captureContext: { platform: 'android' },
  }),
  /requires release-binary artifact provenance/,
);
assert.throws(
  () => buildRuntimeValidationPackage({
    rootDir: ROOT,
    artifactProvenance: provenance(),
    captureContext: {
      platform: 'web',
      osVersion: 'windows_11',
      deviceModel: 'desktop_browser',
      providerEnvironment: 'provider_staging',
    },
  }),
  /platform android or ios/,
);
assert.throws(
  () => buildRuntimeValidationPackage({
    rootDir: ROOT,
    artifactProvenance: provenance(),
    captureContext: {
      platform: 'android',
      osVersion: 'android_15',
      deviceModel: 'serial_123456',
      providerEnvironment: 'provider_staging',
    },
  }),
  /deviceModel/,
);
assert.throws(
  () => buildRuntimeValidationPackage({
    rootDir: ROOT,
    artifactProvenance: provenance(),
    captureContext: {
      platform: 'android',
      osVersion: 'android_15',
      deviceModel: 'pixel_8_pro',
      providerEnvironment: 'https://provider.example',
    },
  }),
  /providerEnvironment/,
);
assert.throws(
  () => buildRuntimeValidationPackage({
    rootDir: ROOT,
    artifactProvenance: provenance(),
    captureContext: {
      platform: 'android',
      osVersion: '35.123 -106.456',
      deviceModel: 'pixel_8_pro',
      providerEnvironment: 'provider_staging',
    },
  }),
  /osVersion/,
);
assert.throws(
  () => buildRuntimeValidationPackage({
    rootDir: ROOT,
    artifactProvenance: provenance(),
    captureContext: {
      platform: 'android',
      osVersion: 'android_15',
      deviceModel: '123e4567-e89b-12d3-a456-426614174000',
      providerEnvironment: 'provider_staging',
    },
  }),
  /deviceModel/,
);

const definitionsWithUnknownRegistryId = RUNTIME_VALIDATION_PROCEDURE_DEFINITIONS.map((definition, index) => (
  index === 0
    ? {
      ...definition,
      registryBindings: [
        ...definition.registryBindings.slice(0, -1),
        { evidenceId: 'unknown_evidence_requirement', relationship: 'conditional', condition: 'Test only.' },
      ],
    }
    : definition
));
assert.throws(
  () => buildRuntimeValidationPackage({
    rootDir: ROOT,
    procedureDefinitions: definitionsWithUnknownRegistryId,
  }),
  /Unknown release evidence requirement/,
);

const markdown = formatRuntimeValidationPackageMarkdown(template);
assert.match(markdown, /No scenario was executed/);
assert.match(markdown, /no evidence was submitted or accepted/i);
assert.match(markdown, /Exact build SHA: `UNBOUND - required before execution`/);
assert.match(markdown, /Actual result: ____________________/);
assert.match(markdown, /Privacy restrictions/);

assert.throws(
  () => runRuntimeValidationPackageCli({
    rootDir: ROOT,
    argv: [
      '--output',
      'config/release-evidence-registry.json',
      '--summary-output',
      '.smoke/verification/runtime-validation-protected-path-test.md',
    ],
    stdout: { write() {} },
  }),
  /must remain under \.smoke\/verification/,
);
assert.throws(
  () => runRuntimeValidationPackageCli({
    rootDir: ROOT,
    argv: [
      '--output',
      '.smoke/verification/runtime-validation-collision.json',
      '--summary-output',
      '.smoke/verification/runtime-validation-collision.json',
    ],
    stdout: { write() {} },
  }),
  /must use different paths/,
);
const provenanceCollisionPath = path.join(
  ROOT,
  '.smoke',
  'verification',
  `runtime-validation-provenance-collision-${process.pid}.json`,
);
fs.mkdirSync(path.dirname(provenanceCollisionPath), { recursive: true });
const provenanceCollisionContents = `${JSON.stringify(provenance(), null, 2)}\n`;
fs.writeFileSync(provenanceCollisionPath, provenanceCollisionContents, 'utf8');
try {
  assert.throws(
    () => runRuntimeValidationPackageCli({
      rootDir: ROOT,
      argv: [
        '--artifact-provenance',
        path.relative(ROOT, provenanceCollisionPath),
        '--platform',
        'android',
        '--os-version',
        'android_15',
        '--device-model',
        'pixel_8_pro',
        '--provider-environment',
        'provider_staging',
        '--output',
        path.relative(ROOT, provenanceCollisionPath),
        '--summary-output',
        '.smoke/verification/runtime-validation-provenance-collision.md',
      ],
      stdout: { write() {} },
    }),
    /must not overwrite artifact provenance input/,
  );
  assert.equal(fs.readFileSync(provenanceCollisionPath, 'utf8'), provenanceCollisionContents);
} finally {
  fs.rmSync(provenanceCollisionPath, { force: true });
}
const danglingSymlinkPath = path.join(
  ROOT,
  '.smoke',
  'verification',
  `runtime-validation-dangling-link-${process.pid}.json`,
);
fs.rmSync(danglingSymlinkPath, { force: true });
try {
  fs.symlinkSync(
    path.join(path.dirname(danglingSymlinkPath), `missing-target-${process.pid}.json`),
    danglingSymlinkPath,
    'file',
  );
  assert.throws(
    () => resolveRuntimeValidationOutputPath(
      ROOT,
      path.relative(ROOT, danglingSymlinkPath),
    ),
    /must not traverse symbolic links/,
  );
} catch (error) {
  if (!['EPERM', 'EACCES', 'ENOTSUP'].includes(error?.code)) throw error;
} finally {
  fs.rmSync(danglingSymlinkPath, { force: true });
}
assert.throws(
  () => runDevicePlanCli([
    '--output',
    'config/release-evidence-registry.json',
    '--summary-output',
    '.smoke/verification/runtime-device-plan-protected-path-test.md',
  ]),
  /must remain under \.smoke\/verification/,
);
assert.throws(
  () => runDevicePlanCli([
    '--output',
    '.smoke/verification/runtime-device-plan-collision.json',
    '--summary-output',
    '.smoke/verification/runtime-device-plan-collision.json',
  ]),
  /runtime_device_plan_output_collision/,
);
assert.throws(
  () => runRuntimeValidationPackageCli({
    rootDir: ROOT,
    argv: [
      '--output',
      '.smoke/verification/runtime-validation-protected-path-test.json',
      '--summary-output',
      'config/release-evidence-registry.json',
    ],
    stdout: { write() {} },
  }),
  /must remain under \.smoke\/verification/,
);

const devicePlan = buildDevicePlanReport({ rootDir: ROOT, now: FIXED_NOW });
assert.equal(devicePlan.status, 'device_evidence_required');
assert.equal(devicePlan.runtimeValidationPackage.procedures.length, 7);
assert.equal(devicePlan.runtimeValidationPackage.executionClaim, 'plan_only_not_executed');
assert.equal(devicePlan.runtimeValidationPackage.productionApproval, 'not_granted_by_runtime_validation');

assert.equal(fs.readFileSync(REGISTRY_PATH, 'utf8'), registryBefore, 'Package generation must not mutate the registry.');

console.log('Runtime validation package tests passed.');
