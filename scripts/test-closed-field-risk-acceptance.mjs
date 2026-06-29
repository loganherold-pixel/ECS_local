import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildClosedFieldTestRiskAcceptanceResult,
  runClosedFieldTestRiskAcceptanceCli,
} from './check-closed-field-test-risk-acceptance.mjs';

const fixedNow = new Date('2026-06-29T12:00:00.000Z');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'closed-field-risk-acceptance-'));
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeConfig(root) {
  writeFile(root, 'lib/campops/campOpsRecommendationConfig.ts', [
    'export const DEFAULT_CAMP_OPS_RECOMMENDATION_ROLLOUT_CONFIG = {',
    '  campopsProviderAdaptersEnabled: false,',
    '  campopsAiAssistEnabled: false,',
    '  campopsDebriefCommunityPublishingEnabled: false,',
    '  campopsTelemetryEnabled: false,',
    '};',
  ].join('\n'));
}

function riskAcceptanceDoc({ status = 'accepted', decisionStatus = status, expirationDate = '2026-07-16' } = {}) {
  return [
    '# CampOps Closed Field-Test Risk Acceptance',
    '',
    `Status: ${status}`,
    '',
    'Risk acceptance mode:',
    '- restricted_closed_field_test_only',
    '',
    '## Required Sign-Offs',
    '- Product owner: Product',
    '- Product approval date: 2026-06-02',
    '- Safety owner: Safety',
    '- Safety approval date: 2026-06-02',
    '- Privacy owner: Privacy',
    '- Privacy approval date: 2026-06-02',
    '- Engineering owner: Engineering',
    '- Engineering approval date: 2026-06-02',
    '',
    '## Approved Scope',
    '- Approved tester cohort: closed testers',
    '- Maximum tester count: 4',
    '- Approved build identifier: build-001',
    '- Approved app version/commit: commit-001',
    '- Approved region labels: Region 001',
    '- Approved route labels: Route Alpha',
    '- Approved scenario labels: two-hour delay',
    `- Expiration date: ${expirationDate}`,
    '- Incident contact: incident@example.test',
    '- Rollback owner: Engineering',
    '- Rollback command/path: rollbackCampOpsInternalBetaActivation',
    '',
    '## Risk-Accepted Incomplete Items',
    '- Android/device QA evidence incomplete: yes',
    '- Android QA required fields incomplete: yes',
    '- Required Android QA scenario results incomplete: yes',
    '- Required Android QA visual-state results incomplete: yes',
    '- Screenshot/evidence references missing: yes',
    '- Provider category/region approval missing: yes',
    '- Privacy/storage approval incomplete: yes',
    '- Private debrief data owner approval incomplete: yes',
    '',
    '## Non-Negotiable Restrictions',
    '- campopsAiAssistEnabled=false',
    '- campopsTelemetryEnabled=false',
    '- campopsDebriefCommunityPublishingEnabled=false',
    '- campopsProviderAdaptersEnabled=false unless exact category/region approval exists',
    '- campopsProviderValidationShadowModeEnabled may be true',
    '- Provider output must remain shadow-only or unknown for unapproved categories',
    '- Manual privacy-safe feedback is required after every session',
    '- No public/community publishing',
    '- No raw provider payloads in shared evidence',
    '- No raw AI prompts',
    '- No private coordinates in shared evidence',
    '- No private user IDs',
    '- No vehicle identifiers',
    '- No private debrief notes in shared evidence',
    '',
    '## Decision',
    `- Status: ${decisionStatus}`,
  ].join('\n');
}

function writeRiskAcceptance(root, options = {}) {
  writeConfig(root);
  writeFile(root, 'docs/campops/closed_field_test_risk_acceptance.md', riskAcceptanceDoc(options));
}

test('unexpired accepted risk acceptance remains active', () => {
  const root = makeTempRepo();
  writeRiskAcceptance(root, { expirationDate: '2026-07-16' });

  const result = buildClosedFieldTestRiskAcceptanceResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, true);
  assert.equal(result.status, 'accepted');
  assert.equal(result.expired, false);
  assert.deepEqual(result.blockers, []);
});

test('expired accepted risk acceptance is explicitly not active', () => {
  const root = makeTempRepo();
  writeRiskAcceptance(root, { expirationDate: '2026-06-16' });

  const result = buildClosedFieldTestRiskAcceptanceResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'expired');
  assert.equal(result.expired, true);
  assert.equal(result.expirationDate, '2026-06-16');
  assert.ok(result.blockers.includes('risk_acceptance_expired'));
});

test('expired risk acceptance CLI exits blocked and writes explicit artifact', () => {
  const root = makeTempRepo();
  writeRiskAcceptance(root, { status: 'expired', decisionStatus: 'expired', expirationDate: '2026-06-16' });
  let stdout = '';

  const exitCode = runClosedFieldTestRiskAcceptanceCli({
    rootDir: root,
    args: [],
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.match(stdout, /EXPIRED/);
  assert.match(stdout, /risk_acceptance_expired/);
  const result = JSON.parse(fs.readFileSync(path.join(root, '.smoke', 'closed-field-test-risk-acceptance-result.json'), 'utf8'));
  assert.equal(result.status, 'expired');
});
