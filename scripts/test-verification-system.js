const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');

async function load(relativePath) {
  return import(pathToFileURL(path.join(root, relativePath)).href);
}

function write(rootDir, relativePath, content) {
  const target = path.join(rootDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, 'utf8');
}

async function main() {
  const policyModule = await load('scripts/verification/verification-policy.mjs');
  const evidenceModule = await load('scripts/verification/evidence-result.mjs');
  const inventoryModule = await load('scripts/verification/verification-inventory.mjs');
  const runnerModule = await load('scripts/verification/run-verification-lane.mjs');
  const provenanceCliModule = await load('scripts/verification/record-artifact-provenance.mjs');

  assert.deepStrictEqual(
    provenanceCliModule.parseArtifactProvenanceArgs(['--artifact', 'dist', '--command', 'npm run build', '--output', 'result.json']),
    {
      artifactPath: 'dist',
      commandId: null,
      legacyCommand: 'npm run build',
      artifactId: null,
      artifactKind: null,
      expectedType: 'any',
      workspaceId: 'root',
      audience: null,
      output: 'result.json',
    },
  );
  assert.deepStrictEqual(
    provenanceCliModule.parseArtifactProvenanceArgs(['dist', 'expo-web-export', 'result.json']),
    {
      artifactPath: 'dist',
      commandId: 'expo-web-export',
      legacyCommand: null,
      artifactId: null,
      artifactKind: null,
      expectedType: 'any',
      workspaceId: 'root',
      audience: null,
      output: 'result.json',
    },
    'The package-script wrapper must tolerate npm forwarding only option values on Windows.',
  );

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ecs-verification-'));
  try {
    write(tempRoot, 'package.json', JSON.stringify({
      scripts: {
        'test:runtime': 'node scripts/test-runtime.js',
        'test:source-contract': 'node scripts/test-source-contract.js',
        'test:network': 'node scripts/test-network.js',
        'gate:device-release': 'node scripts/check-device-release.mjs --json',
        lint: 'eslint .',
      },
    }, null, 2));
    write(tempRoot, 'apps/web/package.json', JSON.stringify({
      scripts: {
        'test:run': 'vitest run',
        'test:runtime': 'vitest run',
      },
    }, null, 2));
    write(tempRoot, 'lib/fleetMath.ts', 'export const add = (a, b) => a + b;\n');
    write(tempRoot, 'scripts/test-runtime.js', [
      "const assert = require('assert');",
      "const runtime = require('../lib/fleetMath.ts');",
      'assert.strictEqual(runtime.add(1, 2), 3);',
    ].join('\n'));
    write(tempRoot, 'scripts/test-source-contract.js', [
      "const fs = require('fs');",
      "const source = fs.readFileSync('lib/fleetMath.ts', 'utf8');",
      "if (!source.includes('add')) throw new Error('missing');",
      "if (!source.includes('export')) throw new Error('missing');",
      "if (!source.includes('const')) throw new Error('missing');",
    ].join('\n'));
    write(tempRoot, 'scripts/test-network.js', "fetch('https://provider.example.test/data');\n");
    write(tempRoot, 'scripts/check-device-release.mjs', "console.log(JSON.stringify({ passed: true }));\n");
    write(tempRoot, '.github/workflows/checks.yml', [
      'jobs:',
      '  checks:',
      '    steps:',
      '      - run: npm run test:runtime',
    ].join('\n'));

    const fixturePolicy = policyModule.resolveVerificationPolicy(policyModule.validateVerificationPolicy({
      schemaVersion: 2,
      capabilities: [
        {
          id: 'fleet',
          label: 'Fleet',
          pathPrefixes: ['lib/fleet'],
          highValueScenarios: ['active_vehicle_switch'],
          scenarioRequirements: [{
            id: 'active_vehicle_switch',
            requiredEvidenceClasses: ['behavioral'],
            checkIds: ['runtime'],
            enforcedLanes: ['pr-fast'],
            deterministicCi: true,
          }],
          evidenceBlockers: [],
        },
        {
          id: 'devices-telemetry',
          label: 'Devices and telemetry',
          pathPrefixes: ['lib/device'],
          highValueScenarios: ['permission_denial'],
          scenarioRequirements: [{
            id: 'permission_denial',
            requiredEvidenceClasses: ['evidence_only'],
            checkIds: ['device-release'],
            enforcedLanes: ['manual-hardware'],
            deterministicCi: false,
          }],
          evidenceBlockers: ['real_hardware'],
        },
      ],
      checks: [
        {
          id: 'runtime',
          workspace: 'root',
          script: 'test:runtime',
          capabilities: ['fleet'],
          classifications: ['unit'],
          scenarios: ['active_vehicle_switch'],
          lanes: ['pr-fast', 'affected-domain'],
          confidence: 'behavioral',
          evidenceClass: 'behavioral',
          evidenceQuality: 'authoritative',
          executionEnvironment: 'deterministic_ci',
        },
        {
          id: 'device-release',
          workspace: 'root',
          script: 'gate:device-release',
          capabilities: ['devices-telemetry'],
          classifications: ['hardware/device', 'evidence-only'],
          scenarios: ['permission_denial'],
          lanes: ['manual-hardware'],
          confidence: 'evidence',
          productionEvidenceRequired: true,
          resultContract: evidenceModule.EVIDENCE_RESULT_CONTRACT,
          evidenceClass: 'evidence_only',
          evidenceQuality: 'authoritative',
          executionEnvironment: 'static',
        },
      ],
      lanes: [
        { id: 'pr-fast', maxParallel: 2, timeoutMs: 1000, coverageEnforcement: 'strict' },
        { id: 'affected-domain', maxParallel: 2, timeoutMs: 1000 },
        { id: 'manual-hardware', maxParallel: 1, timeoutMs: 1000 },
      ],
    }), { rootDir: tempRoot });

    const inventory = inventoryModule.buildVerificationInventory({
      rootDir: tempRoot,
      policy: fixturePolicy,
      now: new Date('2026-07-13T12:00:00.000Z'),
      durationSamples: { 'root::test:runtime': [12, 8, 10] },
    });
    assert.strictEqual(inventory.summary.packageScriptCount, 7, 'Every package script should be inventoried.');
    assert.strictEqual(inventory.summary.unresolvedCommandCount, 0, 'Known commands should be represented even without a direct script file.');
    assert.strictEqual(inventory.generatedAt, '2026-07-13T12:00:00.000Z');

    const byName = new Map(inventory.scripts
      .filter((entry) => entry.workspace === 'root')
      .map((entry) => [entry.name, entry]));
    assert.strictEqual(byName.get('test:runtime').executionModel, 'runtime_behavior');
    assert.strictEqual(byName.get('test:source-contract').executionModel, 'source_contract');
    assert.ok(byName.get('test:source-contract').falseConfidenceRisks.includes('source_string_only'));
    assert.strictEqual(byName.get('test:network').networkDependency, 'real_or_uncontrolled');
    assert.strictEqual(byName.get('test:runtime').duration.medianMs, 10);
    assert.strictEqual(byName.get('test:source-contract').duration.state, 'unmeasured');
    assert.deepStrictEqual(byName.get('test:runtime').ciWorkflows, ['.github/workflows/checks.yml']);
    assert.strictEqual(byName.get('gate:device-release').productionApproval, 'external_evidence_required');
    const rootRuntime = inventory.scripts.find((entry) => entry.key === 'root::test:runtime');
    const nestedRuntime = inventory.scripts.find((entry) => entry.key === 'apps/web::test:runtime');
    assert.strictEqual(rootRuntime.policyCheckId, 'runtime');
    assert.strictEqual(
      nestedRuntime.policyCheckId,
      null,
      'A nested package script must not inherit a root policy check just because its name matches.',
    );

    const fleetMatrix = inventory.capabilityMatrix.find((entry) => entry.capabilityId === 'fleet');
    assert.strictEqual(inventory.coveragePhase, 'planned');
    assert.ok(fleetMatrix.behavioralCandidateCount >= 1);
    assert.strictEqual(fleetMatrix.scenarios[0].state, 'declared');
    assert.strictEqual(fleetMatrix.scenarios[0].coverageSatisfied, false);
    assert.deepStrictEqual(fleetMatrix.scenarios[0].executedChecks, []);

    const affected = runnerModule.buildLanePlan({
      policy: fixturePolicy,
      laneId: 'affected-domain',
      changedFiles: ['lib/fleetMath.ts'],
    });
    assert.deepStrictEqual(affected.capabilities, ['fleet']);
    assert.deepStrictEqual(affected.checks.map((entry) => entry.id), ['runtime']);

    const unknown = runnerModule.buildLanePlan({
      policy: fixturePolicy,
      laneId: 'affected-domain',
      changedFiles: ['unknown/new-system.ts'],
    });
    assert.deepStrictEqual(
      unknown.capabilities,
      ['devices-telemetry', 'fleet'],
      'Unknown paths must fail wide rather than hiding affected checks.',
    );

    const seenEnvironments = [];
    const result = await runnerModule.runVerificationLane({
      rootDir: tempRoot,
      policy: fixturePolicy,
      laneId: 'pr-fast',
      now: new Date('2026-07-13T12:00:00.000Z'),
      executor: async (check, context) => {
        seenEnvironments.push(context.env);
        return { status: 'passed', exitCode: 0, durationMs: 7, summary: `${check.id} passed` };
      },
      provenance: {
        commit: 'abc123',
        branch: 'test',
        dirty: false,
        environment: { SAFE: 'visible', API_KEY: 'must-not-leak' },
      },
    });
    assert.strictEqual(result.status, 'passed');
    assert.strictEqual(result.codeChecksPassed, true);
    assert.strictEqual(result.productionApproval, 'not_granted_by_code_checks');
    assert.strictEqual(result.productionApprovalStatus, 'pending');
    assert.strictEqual(result.coverageChecksPassed, true);
    assert.strictEqual(
      result.coverageMatrix.capabilities.find((entry) => entry.capabilityId === 'fleet').scenarios[0].state,
      'behavioral_verified',
    );
    const executedInventory = inventoryModule.buildVerificationInventory({
      rootDir: tempRoot,
      policy: fixturePolicy,
      now: new Date('2026-07-13T12:00:00.000Z'),
      laneResult: result,
    });
    assert.strictEqual(executedInventory.coveragePhase, 'executed');
    assert.strictEqual(executedInventory.summary.executedScenarioCount, 1);
    assert.strictEqual(executedInventory.summary.verifiedScenarioCount, 1);
    assert.strictEqual(result.results[0].durationMs, 7);
    assert.strictEqual(seenEnvironments[0].TZ, 'UTC');
    assert.strictEqual(seenEnvironments[0].ECS_TEST_NETWORK, 'disabled');
    assert.strictEqual(
      seenEnvironments[0].npm_lifecycle_event,
      'test:runtime',
      'Direct execution must preserve each package script\'s test/build environment identity.',
    );
    assert.ok(!JSON.stringify(result).includes('must-not-leak'));

    const manualPassed = await runnerModule.runVerificationLane({
      rootDir: tempRoot,
      policy: fixturePolicy,
      laneId: 'manual-hardware',
      now: new Date('2026-07-13T12:00:00.000Z'),
      executor: async (check, context) => {
        const evidence = evidenceModule.createEvidenceCheckResult({
          checkId: check.id,
          status: 'passed',
          safeCode: evidenceModule.EVIDENCE_SAFE_CODES.VERIFIED,
          blockerIds: [],
          summary: 'Device evidence is complete.',
        });
        fs.writeFileSync(context.evidenceResultFile, `${JSON.stringify(evidence)}\n`, 'utf8');
        return { status: 'passed', exitCode: 0, durationMs: 4, summary: '', stdout: '', stderr: '' };
      },
    });
    assert.strictEqual(manualPassed.status, 'passed');
    assert.strictEqual(manualPassed.codeChecksPassed, true);
    assert.deepStrictEqual(manualPassed.externalEvidenceBlockers, []);

    const manual = await runnerModule.runVerificationLane({
      rootDir: tempRoot,
      policy: fixturePolicy,
      laneId: 'manual-hardware',
      now: new Date('2026-07-13T12:00:00.000Z'),
      executor: async (check, context) => {
        const evidence = evidenceModule.createEvidenceCheckResult({
          checkId: check.id,
          status: 'blocked_external',
          safeCode: evidenceModule.EVIDENCE_SAFE_CODES.EXTERNAL_REQUIRED,
          blockerIds: ['real_hardware_missing'],
          summary: 'Real hardware evidence is missing.',
        });
        fs.writeFileSync(context.evidenceResultFile, `${JSON.stringify(evidence)}\n`, 'utf8');
        return {
          status: 'failed',
          exitCode: evidenceModule.VERIFICATION_EXIT_CODES.BLOCKED_EXTERNAL,
          durationMs: 4,
          summary: '',
          stdout: '',
          stderr: '',
        };
      },
    });
    assert.strictEqual(manual.status, 'blocked_external');
    assert.strictEqual(manual.codeChecksPassed, true);
    assert.deepStrictEqual(manual.externalEvidenceBlockers, ['real_hardware_missing']);
    assert.strictEqual(manual.results[0].status, 'blocked_external');

    const shadowOnlyEvidence = await runnerModule.runVerificationLane({
      rootDir: tempRoot,
      policy: fixturePolicy,
      laneId: 'manual-hardware',
      now: new Date('2026-07-13T12:00:00.000Z'),
      executor: async (check, context) => {
        const evidence = evidenceModule.createEvidenceCheckResult({
          checkId: check.id,
          status: 'blocked_external',
          safeCode: evidenceModule.EVIDENCE_SAFE_CODES.EXTERNAL_REQUIRED,
          blockerIds: ['provider_not_approved'],
          summary: 'Provider evidence is not approved.',
        });
        fs.writeFileSync(context.evidenceResultFile, `${JSON.stringify(evidence)}\n`, 'utf8');
        return {
          status: 'failed',
          exitCode: evidenceModule.VERIFICATION_EXIT_CODES.BLOCKED_EXTERNAL,
          durationMs: 4,
          summary: '',
          stdout: '',
          stderr: '',
        };
      },
    });
    assert.strictEqual(shadowOnlyEvidence.status, 'blocked_external');
    assert.deepStrictEqual(shadowOnlyEvidence.externalEvidenceBlockers, ['provider_not_approved']);

    const crashedEvidenceGate = await runnerModule.runVerificationLane({
      rootDir: tempRoot,
      policy: fixturePolicy,
      laneId: 'manual-hardware',
      now: new Date('2026-07-13T12:00:00.000Z'),
      executor: async () => ({
        status: 'failed',
        exitCode: 1,
        durationMs: 4,
        summary: 'Parser crashed while reading a document containing the words evidence missing.',
      }),
    });
    assert.strictEqual(crashedEvidenceGate.status, 'failed');
    assert.strictEqual(crashedEvidenceGate.codeChecksPassed, false);
    assert.deepStrictEqual(crashedEvidenceGate.externalEvidenceBlockers, []);
    assert.strictEqual(crashedEvidenceGate.results[0].status, 'failed');

    const redacted = await runnerModule.runVerificationLane({
      rootDir: tempRoot,
      policy: fixturePolicy,
      laneId: 'pr-fast',
      now: new Date('2026-07-13T12:00:00.000Z'),
      executor: async () => ({
        status: 'passed',
        exitCode: 0,
        durationMs: 4,
        summary: 'token=top-secret https://example.test?q=1&api_key=url-secret latitude=39.7392 longitude=-104.9903 rawProviderPayload={"member":"private"} eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature',
      }),
    });
    const redactedText = JSON.stringify(redacted);
    for (const secret of ['top-secret', 'url-secret', '39.7392', '-104.9903', 'private', 'eyJhbGciOiJIUzI1NiJ9']) {
      assert.ok(!redactedText.includes(secret), `Verification output must redact ${secret}.`);
    }

    write(tempRoot, 'artifacts/app.apk', 'deterministic-build-bytes');
    const artifact = runnerModule.buildArtifactProvenance({
      rootDir: tempRoot,
      artifactPath: 'artifacts/app.apk',
      commandId: 'android-eas-apk-build',
      artifactId: 'android-release-apk',
      now: new Date('2026-07-13T12:00:00.000Z'),
      environment: { GITHUB_RUN_ID: '42', API_KEY: 'must-not-leak' },
    });
    assert.strictEqual(artifact.schemaVersion, 'ecs.verification-provenance-artifact.v2');
    assert.strictEqual(artifact.commandId, 'android-eas-apk-build');
    assert.strictEqual(artifact.artifact.id, 'android-release-apk');
    assert.strictEqual('relativePath' in artifact.artifact, false);
    assert.strictEqual('command' in artifact, false);
    assert.match(artifact.artifact.sha256, /^[a-f0-9]{64}$/);
    assert.strictEqual(artifact.productionApproval, 'not_granted_by_artifact_creation');
    assert.strictEqual(artifact.ci.runId, '42');
    assert.ok(!JSON.stringify(artifact).includes('must-not-leak'));
    assert.ok(!JSON.stringify(artifact).includes('artifact-secret'));

  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  console.log('ECS verification system checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
