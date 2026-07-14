const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const YAML = require('yaml');

const root = path.join(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

async function main() {
  const { loadVerificationPolicy } = await import(pathToFileURL(
    path.join(root, 'scripts', 'verification', 'verification-policy.mjs'),
  ).href);
  const { buildLanePlan } = await import(pathToFileURL(
    path.join(root, 'scripts', 'verification', 'run-verification-lane.mjs'),
  ).href);
  const { findDirectWorkflowInputInterpolations } = await import(pathToFileURL(
    path.join(root, 'scripts', 'verification', 'workflow-input-safety.mjs'),
  ).href);

  assert(packageJson.scripts['test:release-smoke-ci-workflow']);
  assert(packageJson.scripts['verify:pr']);
  assert(packageJson.scripts['verify:affected']);
  assert(packageJson.scripts['verify:nightly']);
  assert(packageJson.scripts['verify:provider']);
  assert(packageJson.scripts['verify:release']);
  assert(packageJson.scripts['verify:hardware']);

  const workflowPaths = [
    '.github/workflows/release-smoke-readiness.yml',
    '.github/workflows/verification-scheduled.yml',
    '.github/workflows/verification-release-candidate.yml',
    '.github/workflows/supabase-db-tests.yml',
  ];
  const workflows = Object.fromEntries(workflowPaths.map((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    assert(fs.existsSync(absolutePath), `${relativePath} should exist.`);
    return [relativePath, fs.readFileSync(absolutePath, 'utf8')];
  }));

  const prWorkflow = workflows[workflowPaths[0]];
  [
    'name: ECS Pull Request Verification',
    'pull_request:',
    'push:',
    'contents: read',
    'cancel-in-progress: true',
    'verification-inventory.mjs --strict',
    '--lane pr-fast',
    '--lane affected-domain',
    '--summary-output',
    '--timings-output',
    'actions/upload-artifact@v4',
  ].forEach((required) => assert(prWorkflow.includes(required), `PR workflow should include ${required}.`));
  assert(!prWorkflow.includes('--allow-blocked-external'), 'PR checks must not waive external blockers.');
  assert(prWorkflow.includes('--artifact-audience pull_request'));
  assert(prWorkflow.includes('--timing-baseline config/verification-timing-baseline.json'));
  assert(!prWorkflow.includes('--timing-candidate-output'), 'Pull-request jobs must never update timing history.');
  assert(prWorkflow.includes('retention-days: 5'));

  const scheduledWorkflow = workflows[workflowPaths[1]];
  assert(scheduledWorkflow.includes('--lane full-nightly'));
  assert(scheduledWorkflow.includes('--lane provider-scheduled'));
  assert(scheduledWorkflow.includes('--allow-blocked-external'));
  assert(scheduledWorkflow.includes('--artifact-audience scheduled_ci'));
  assert(scheduledWorkflow.includes('--timing-baseline config/verification-timing-baseline.json'));
  assert(scheduledWorkflow.includes('--timing-candidate-output .smoke/verification/timing-baseline-candidate.json'));
  assert(scheduledWorkflow.includes('.smoke/verification/timing-baseline-candidate.json'));
  assert(scheduledWorkflow.includes('--summary-output .smoke/verification/provider-scheduled.md'));
  assert(scheduledWorkflow.includes('record-artifact-provenance.mjs'));
  assert(scheduledWorkflow.includes('--command-id expo-web-export'));
  assert(scheduledWorkflow.includes('retention-days: 7'));

  const releaseWorkflow = workflows[workflowPaths[2]];
  const releaseCommand = releaseWorkflow.match(/run: .*--lane release-candidate[^\n]*/)?.[0] ?? '';
  assert(releaseCommand, 'Release workflow should execute the release-candidate lane.');
  assert(!releaseCommand.includes('--allow-blocked-external'), 'Release promotion must fail on external blockers.');
  assert(releaseCommand.includes('--summary-output .smoke/verification/release-candidate.md'));
  assert(releaseCommand.includes('--timing-baseline config/verification-timing-baseline.json'));
  assert(releaseWorkflow.includes('--lane manual-hardware'));
  assert(releaseWorkflow.includes('--artifact-audience restricted_field_test'));
  assert(releaseWorkflow.includes('--allow-blocked-external'));
  assert(releaseWorkflow.includes('manual-hardware-artifact-provenance.json'));
  assert(releaseWorkflow.includes('uses: ./.github/workflows/supabase-db-tests.yml'));
  assert(releaseWorkflow.includes('needs: pgtap-rls'));
  assert(releaseWorkflow.includes("if: always() && inputs.lane == 'release-candidate'"));
  assert(releaseWorkflow.includes('needs.pgtap-rls.outputs.coverage-result'));
  assert(releaseWorkflow.includes('ECS_PGTAP_JOB_RESULT: ${{ needs.pgtap-rls.result }}'));
  assert(releaseWorkflow.includes('materialize-pgtap-workflow-result.mjs'));
  assert(releaseCommand.includes('--workflow-coverage-result .smoke/verification/pgtap-coverage-result.json'));
  assert(releaseWorkflow.includes('.smoke/verification/release-evidence-report.json'));
  assert(releaseWorkflow.includes('ECS_RELEASE_ARTIFACT_PROVENANCE=.smoke/verification/supplied-artifact-provenance.json'));
  assert(releaseWorkflow.includes('ECS_RELEASE_PROVIDER_ENVIRONMENT: ${{ vars.ECS_RELEASE_PROVIDER_ENVIRONMENT }}'));
  assert(
    releaseWorkflow.indexOf('Record supplied artifact provenance')
      < releaseWorkflow.indexOf('Run release candidate lane'),
    'Release artifact provenance must be available before the evidence registry gate runs.',
  );
  assert(!releaseWorkflow.includes('--artifact "${{ inputs.artifact_path }}"'));
  assert(releaseWorkflow.includes('ARTIFACT_PATH: ${{ inputs.artifact_path }}'));
  assert(releaseWorkflow.includes('--expected-type file'));
  assert(releaseWorkflow.includes('--command-id manual-hardware-evidence'));
  assert(releaseWorkflow.includes('retention-days: 14'));
  assert(releaseWorkflow.includes('retention-days: 3'));

  const supabaseWorkflow = workflows['.github/workflows/supabase-db-tests.yml'];
  assert(supabaseWorkflow.includes('workflow_call:'), 'The pgTAP workflow must be reusable by release promotion.');
  assert(supabaseWorkflow.includes('coverage-result:'), 'The pgTAP workflow must emit a typed execution result.');
  assert(supabaseWorkflow.includes('run-pgtap-rls-workflow.mjs'));
  assert(supabaseWorkflow.includes('continue-on-error: true'));
  assert(supabaseWorkflow.includes("steps.database-tests.outcome != 'success'"));
  assert(supabaseWorkflow.includes('pgtap-workflow-evidence.json'));
  assert(!supabaseWorkflow.includes('echo \'result={'), 'pgTAP evidence must come from executed test results.');

  const policy = loadVerificationPolicy({ rootDir: root });
  const prPlan = buildLanePlan({ policy, laneId: 'pr-fast' });
  assert.ok(prPlan.checks.every((check) => !check.classifications.includes('evidence-only')));
  assert.ok(prPlan.checks.every((check) => !check.productionEvidenceRequired));
  const requiredPlanIdentities = [
    'root::test:release-readiness',
    'root::test:release-smoke-ci-workflow',
    'root::test:verification-coverage-model',
    'root::test:verification-timing-baseline',
    'root::test:verification-pgtap-release-evidence',
    'root::test:verification-workflow-input-safety',
    'root::test:verification-process-runner',
    'root::test:generated-artifact-hygiene',
    'apps/web::build',
    'apps/web::typecheck',
    'apps/web::test:run',
  ];
  for (const identity of requiredPlanIdentities) {
    assert.ok(prPlan.checks.some((check) => check.scriptIdentity === identity), `PR plan must include ${identity}.`);
  }
  const nightlyPlan = buildLanePlan({ policy, laneId: 'full-nightly' });
  for (const identity of requiredPlanIdentities) {
    assert.ok(nightlyPlan.checks.some((check) => check.scriptIdentity === identity), `Nightly plan must include ${identity}.`);
  }
  const releasePlan = buildLanePlan({ policy, laneId: 'release-candidate' });
  assert.ok(releasePlan.checks.some((check) => check.productionEvidenceRequired));
  assert.ok(releasePlan.checks.some((check) => check.id === 'verification-pgtap-release-evidence'));
  assert.ok(releasePlan.checks.some((check) => check.id === 'verification-workflow-input-safety'));
  assert.ok(releasePlan.checks.some((check) => check.id === 'verification-timing-baseline'));
  assert.ok(releasePlan.checks.some((check) => check.id === 'verification-process-runner'));
  assert.ok(releasePlan.checks.some((check) => check.id === 'generated-artifact-hygiene'));
  assert.ok(releasePlan.checks.some((check) => check.id === 'release-evidence-registry'));
  for (const legacyEvidenceCheck of [
    'provider-readiness-evidence',
    'device-release-evidence',
    'automotive-release-evidence',
    'android-evidence',
    'privacy-storage-evidence',
    'closed-field-evidence',
  ]) {
    assert.ok(
      !releasePlan.checks.some((check) => check.id === legacyEvidenceCheck),
      `${legacyEvidenceCheck} must remain a collection diagnostic rather than a release authority.`,
    );
  }
  assert.ok(policy.timingPolicy.enforceLanes.includes('pr-fast'));
  assert.ok(policy.timingPolicy.enforceLanes.includes('release-candidate'));
  assert.deepStrictEqual(policy.timingPolicy.candidateLanes, ['full-nightly']);
  assert.strictEqual(releasePlan.lane.coverageEnforcement, 'strict');

  const combined = Object.values(workflows).join('\n');
  for (const [workflowPath, source] of Object.entries(workflows)) {
    const document = YAML.parse(source);
    for (const job of Object.values(document.jobs ?? {})) {
      for (const step of job.steps ?? []) {
        if (typeof step.uses !== 'string' || !step.uses.startsWith('actions/upload-artifact@')) continue;
        const paths = String(step.with?.path ?? '').split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
        assert.ok(paths.length > 0, `${workflowPath} upload steps must enumerate paths.`);
        assert.ok(
          paths.every((value) => !['.smoke/verification', '.smoke/verification/', '.smoke/verification/**'].includes(value)),
          `${workflowPath} must enumerate safe files rather than upload the whole verification directory.`,
        );
      }
    }
  }
  assert(!combined.includes('--command "'), 'Provenance commands must use stable command IDs, not raw command strings.');
  assert(combined.includes('include-hidden-files: true'), 'Explicit hidden artifact files must be intentionally enabled.');
  assert(!combined.includes('SUPABASE_SERVICE_ROLE_KEY'));
  assert(!combined.includes('ECS_SERVICE_ROLE_KEY'));
  assert(!combined.includes('MAPBOX_ACCESS_TOKEN'));

  const directInputInterpolations = fs.readdirSync(path.join(root, '.github', 'workflows'))
    .filter((name) => /\.ya?ml$/i.test(name))
    .flatMap((name) => findDirectWorkflowInputInterpolations(
      fs.readFileSync(path.join(root, '.github', 'workflows', name), 'utf8'),
      { file: `.github/workflows/${name}` },
    ));
  assert.deepStrictEqual(
    directInputInterpolations,
    [],
    'workflow_dispatch inputs must never be interpolated directly into run blocks.',
  );

  console.log('ECS verification CI workflow checks passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
