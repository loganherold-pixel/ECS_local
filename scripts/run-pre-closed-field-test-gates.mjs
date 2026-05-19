import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { buildSmokeResult, writeSmokeResult } from './smoke-app.mjs';
import { buildAndroidQaEvidenceResult, writeAndroidQaEvidenceResult } from './check-android-qa-evidence.mjs';
import { buildProviderReadinessResult, writeProviderReadinessResult } from './check-provider-readiness.mjs';
import { buildPrivacyStorageApprovalResult, writePrivacyStorageApprovalResult } from './check-privacy-storage-approval.mjs';
import { buildAiAssistApprovalResult, writeAiAssistApprovalResult } from './check-ai-assist-approval.mjs';
import {
  buildCampOpsPublishingTelemetryApprovalResult,
  writeCampOpsPublishingTelemetryApprovalResult,
} from './check-campops-publishing-telemetry-approval.mjs';
import { buildNoRuntimeMockImportResult, writeNoRuntimeMockImportResult } from './check-no-runtime-mock-imports.mjs';
import { buildCampOpsLiveReadinessResult, writeCampOpsLiveReadinessResult } from './check-campops-live-readiness.mjs';
import { buildClosedFieldTestReadinessResult, writeClosedFieldTestReadinessResult } from './check-closed-field-test-readiness.mjs';
import {
  buildReleaseApprovalOverrideGuardResult,
  writeReleaseApprovalOverrideGuardResult,
} from './check-release-approval-overrides.mjs';
import {
  buildClosedFieldTestRiskAcceptanceResult,
  writeClosedFieldTestRiskAcceptanceResult,
} from './check-closed-field-test-risk-acceptance.mjs';

const RESULT_RELATIVE_PATH = path.join('.smoke', 'pre-closed-field-test-gates-result.json');

function pathsFor(root) {
  return {
    smokeDir: path.join(root, '.smoke'),
    resultPath: path.join(root, RESULT_RELATIVE_PATH),
  };
}

async function runStage(name, command, runner) {
  const started = Date.now();
  try {
    const result = await runner();
    return {
      name,
      command,
      status: result.passed ? 'passed' : 'failed',
      durationMs: Date.now() - started,
      exitCode: result.passed ? 0 : 1,
      summary: result.passed ? `${name} passed.` : `${name} blocked or failed.`,
      blockers: result.blockers ?? [],
      resultStatus: result.status ?? (result.passed ? 'passed' : 'failed'),
      riskAcceptance: result.riskAcceptance ?? null,
    };
  } catch (error) {
    return {
      name,
      command,
      status: 'failed',
      durationMs: Date.now() - started,
      exitCode: 1,
      summary: error instanceof Error ? error.message : String(error),
      blockers: ['gate_execution_error'],
      resultStatus: 'error',
    };
  }
}

export async function buildPreClosedFieldTestGateResult(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const now = options.now instanceof Date ? options.now : new Date();
  const riskAcceptanceMode = options.riskAcceptanceMode === true;
  const stages = [];

  stages.push(await runStage('smoke', 'npm run smoke', async () => {
    const result = await buildSmokeResult();
    writeSmokeResult(result);
    return result;
  }));
  if (!riskAcceptanceMode) {
    stages.push(await runStage('android-qa', 'npm run gate:android-qa', () => {
      const result = buildAndroidQaEvidenceResult({ rootDir: root });
      writeAndroidQaEvidenceResult(result, { rootDir: root });
      return result;
    }));
    stages.push(await runStage('provider-readiness', 'npm run gate:provider-readiness', () => {
      const result = buildProviderReadinessResult({ rootDir: root });
      writeProviderReadinessResult(result, { rootDir: root });
      if (result.shadowOnlyAllowed && !result.influenceRequested) {
        return {
          ...result,
          passed: true,
          status: 'shadow_only_acceptable_not_approved_for_influence',
          providerInfluenceApproved: false,
          blockers: [],
          shadowOnlyPassed: true,
        };
      }
      return result;
    }));
    stages.push(await runStage('privacy-storage', 'npm run gate:privacy-storage', () => {
      const result = buildPrivacyStorageApprovalResult({ rootDir: root });
      writePrivacyStorageApprovalResult(result, { rootDir: root });
      return result;
    }));
  }
  stages.push(await runStage('ai-assist', 'npm run gate:ai-assist', () => {
    const result = buildAiAssistApprovalResult({ rootDir: root });
    writeAiAssistApprovalResult(result, { rootDir: root });
    return result;
  }));
  stages.push(await runStage('campops-publishing-telemetry', 'npm run gate:campops-publishing-telemetry', () => {
    const result = buildCampOpsPublishingTelemetryApprovalResult({ rootDir: root });
    writeCampOpsPublishingTelemetryApprovalResult(result, { rootDir: root });
    return result;
  }));
  stages.push(await runStage('release-approval-overrides', 'npm run gate:release-approval-overrides', () => {
    const result = buildReleaseApprovalOverrideGuardResult({ rootDir: root });
    writeReleaseApprovalOverrideGuardResult(result, { rootDir: root });
    return result;
  }));
  stages.push(await runStage('no-runtime-mocks', 'npm run gate:no-runtime-mocks', () => {
    const result = buildNoRuntimeMockImportResult({ rootDir: root });
    writeNoRuntimeMockImportResult(result, { rootDir: root });
    return result;
  }));
  if (riskAcceptanceMode) {
    stages.push(await runStage('risk-acceptance', 'npm run gate:closed-field-test-risk-acceptance', () => {
      const result = buildClosedFieldTestRiskAcceptanceResult({ rootDir: root });
      writeClosedFieldTestRiskAcceptanceResult(result, { rootDir: root });
      return result;
    }));
  }
  stages.push(await runStage('campops-live-readiness', 'npm run gate:campops-live-readiness', () => {
    const result = buildCampOpsLiveReadinessResult({ rootDir: root });
    writeCampOpsLiveReadinessResult(result, { rootDir: root });
    return result;
  }));
  stages.push(await runStage('closed-field-test', 'npm run gate:closed-field-test', () => {
    const result = buildClosedFieldTestReadinessResult({ rootDir: root });
    writeClosedFieldTestReadinessResult(result, { rootDir: root });
    return result;
  }));

  const closedFieldStage = stages.find((stage) => stage.name === 'closed-field-test');
  const riskStage = stages.find((stage) => stage.name === 'risk-acceptance');
  const riskAccepted = closedFieldStage?.riskAcceptance?.accepted === true && riskStage?.status === 'passed';
  const riskAcceptedStages = new Set(riskAccepted ? ['android-qa', 'provider-readiness', 'privacy-storage'] : []);
  const failedStages = stages
    .filter((stage) => stage.status !== 'passed' && !riskAcceptedStages.has(stage.name))
    .map((stage) => stage.name);
  const blockers = Array.from(new Set(stages.flatMap((stage) => stage.blockers ?? [])));
  const activeBlockers = riskAccepted
    ? blockers.filter((blocker) => ![
      'android_device_qa_incomplete',
      'android_qa_required_fields_incomplete',
      'android_qa_required_scenarios_incomplete',
      'android_qa_required_visual_state_results_incomplete',
      'android_qa_screenshot_or_evidence_references_missing',
      'provider_categories_not_approved',
      'provider_readiness_not_approved',
      'privacy_storage_owner_approval_incomplete',
      'approval_owner_missing',
      'approval_date_missing',
      'private_debrief_data_owner_approval_incomplete',
      'closed_field_test_status_blocked',
      'campops_live_readiness_not_closed_field_ready',
      'campops_privacy_storage_gate_failed',
      'campops_provider_source_gate_failed',
      'campops_android_device_qa_gate_failed',
    ].includes(blocker))
    : blockers;
  return {
    passed: failedStages.length === 0 && activeBlockers.length === 0,
    status: failedStages.length === 0 && activeBlockers.length === 0
      ? (riskAccepted ? 'risk_accepted_restricted_closed_field_test' : 'ready_with_restrictions')
      : 'blocked',
    checkedAt: now.toISOString(),
    mode: riskAcceptanceMode ? 'risk_acceptance' : 'evidence',
    stages,
    failedStages,
    blockers: activeBlockers,
    riskAccepted,
    riskAcceptedStages: Array.from(riskAcceptedStages),
    waivedEvidenceGates: riskAcceptanceMode
      ? ['android-qa', 'provider-readiness', 'privacy-storage'].map((name) => ({
        name,
        status: riskAccepted ? 'waived_by_explicit_risk_acceptance' : 'not_waived_risk_acceptance_incomplete',
      }))
      : [],
    riskAcceptedIncompleteEvidenceBlockers: riskAccepted ? blockers.filter((blocker) => !activeBlockers.includes(blocker)) : [],
    notes: [
      'This aggregate is a release-only visibility gate and does not block normal internal beta development.',
      'The aggregate intentionally runs every blocker gate even when earlier gates fail.',
      'Passing smoke does not mean closed field testing is ready.',
      'Android/device QA, provider readiness, privacy/storage approval, AI approval, telemetry approval, and community publishing posture remain separate gates.',
      'Risk acceptance, when fully signed, permits only a restricted closed field test and does not mark incomplete evidence as approved.',
    ],
  };
}

export function writePreClosedFieldTestGateResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const { smokeDir, resultPath } = pathsFor(root);
  fs.mkdirSync(smokeDir, { recursive: true });
  fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  return resultPath;
}

export function formatPreClosedFieldTestGateResult(result, options = {}) {
  const root = options.rootDir ?? process.cwd();
  const lines = [
    `CampOps pre-closed-field-test gate: ${result.passed ? 'PASS' : 'BLOCKED'}`,
    `Mode: ${result.mode}`,
    `Result file: ${path.relative(root, pathsFor(root).resultPath)}`,
    `Checked at: ${result.checkedAt}`,
    '',
    'Gate stages:',
  ];
  for (const stage of result.stages) {
    lines.push(`- ${stage.name}: ${stage.status} (${stage.resultStatus}; ${stage.durationMs}ms)`);
  }
  if (result.failedStages.length > 0) {
    lines.push('', 'Remaining blocked gates:');
    for (const stage of result.failedStages) lines.push(`- ${stage}`);
  }
  if (result.blockers.length > 0) {
    lines.push('', 'Normalized blockers:');
    for (const blocker of result.blockers) lines.push(`- ${blocker}`);
  }
  if (result.riskAccepted) {
    lines.push('', 'Risk-accepted incomplete evidence gates:');
    for (const stage of result.riskAcceptedStages) lines.push(`- ${stage}`);
    if (result.riskAcceptedIncompleteEvidenceBlockers.length > 0) {
      lines.push('', 'Risk-accepted incomplete evidence blockers:');
      for (const blocker of result.riskAcceptedIncompleteEvidenceBlockers) lines.push(`- ${blocker}`);
    }
  }
  if (result.waivedEvidenceGates?.length > 0) {
    lines.push('', 'Evidence gates in risk-acceptance mode:');
    for (const gate of result.waivedEvidenceGates) lines.push(`- ${gate.name}: ${gate.status}`);
  }
  lines.push('', 'Notes:');
  for (const note of result.notes) lines.push(`- ${note}`);
  return `${lines.join('\n')}\n`;
}

export async function runPreClosedFieldTestGateCli(options = {}) {
  const root = options.rootDir ?? process.cwd();
  const args = options.args ?? process.argv.slice(2);
  const stdout = options.stdout ?? process.stdout;
  const jsonOnly = args.includes('--json');
  const riskAcceptanceMode = args.includes('--risk-accepted');
  const result = await buildPreClosedFieldTestGateResult({ rootDir: root, riskAcceptanceMode });
  writePreClosedFieldTestGateResult(result, { rootDir: root });
  if (jsonOnly) stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else stdout.write(formatPreClosedFieldTestGateResult(result, { rootDir: root }));
  return result.passed ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runPreClosedFieldTestGateCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
