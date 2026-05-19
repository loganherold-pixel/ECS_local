import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildProviderReadinessResult, runProviderReadinessCli } from './check-provider-readiness.mjs';

const fixedNow = new Date('2026-05-17T12:00:00.000Z');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'provider-readiness-gate-'));
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeProviderPolicy(root, { documented = true } = {}) {
  writeFile(root, 'docs/campops/provider_readiness.md', documented
    ? [
        '# CampOps Provider Readiness Reports',
        '',
        '## Access Category Policy',
        '',
        'CampOps currently treats `legal/access` as one combined provider category unless a region explicitly configures a standalone `access` source provider.',
        'A combined category can represent legal status and public-access fields, but it must not be reported as independent access readiness.',
        'Do not approve access influence separately from legal/access.',
      ].join('\n')
    : '# CampOps Provider Readiness Reports\n\nProvider limitations are documented.\n');
}

function realEvidenceRows({ approved = false } = {}) {
  const categories = [
    'legal/access',
    'closure/seasonal restriction',
    'fire restriction',
    'weather',
    'service/resupply',
  ];
  return categories.map((category) => (
    approved
      ? `| ${category} | accepted real provider set | real-shadow accepted | 92% | 91% | 3% | 1% | 0% | yes |`
      : `| ${category} | TBD real provider set | not run | n/a | n/a | n/a | n/a | n/a | no |`
  ));
}

function writeRegionReport(root, { approved = false, includeStandaloneAccess = false, includeRealEvidence = approved } = {}) {
  const categories = [
    'legal/access',
    'closure/seasonal restriction',
    'fire restriction',
    'weather',
    'service/resupply',
  ];
  const rows = categories.map((category) => (
    `| ${category} | ${approved ? 'approved' : 'not_approved'} | ${approved ? 'approved' : 'fixture-backed'} | 2026-05-17 | ${approved ? 'fresh' : 'fixture only'} | ${approved ? 'real evidence accepted' : 'fixture shape only'} | 0 | 0 | Unknown remains visible. | ${approved ? 'yes' : 'no'} | ${approved ? 'Owner' : 'not approved'} | ${approved ? '2026-05-17' : 'not approved'} | ${approved ? 'none' : 'real upstream evidence required'} |`
  ));
  if (includeStandaloneAccess) {
    rows.splice(1, 0, '| standalone access | shadow_validated | real-shadow | 2026-05-17 | real shadow | standalone access provider configured for observation only | 0 | 0 | Unknown remains visible. | no | not approved | not approved | approval required |');
  }

  writeFile(root, 'docs/campops/provider_readiness_region_001.md', [
    '# CampOps Provider Readiness - Region 001',
    '',
    '- Region label: Region 001',
    '- Raw provider payloads excluded from shared evidence: yes',
    '- Precise private coordinates excluded: yes',
    '',
    '## Category Matrix',
    '',
    '| Category | Status | Validation mode | Evidence date | Freshness window | Coverage summary | Conflict rate | Stale/unknown rate | Unknown handling behavior | Provider influence allowed | Approver | Approval date | Remaining issues |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Real Upstream Provider Evidence Ledger',
    '',
    '| Category | Provider/source | Real shadow status | Coverage rate | Freshness rate | Unknown rate | Stale rate | Conflict rate | Accepted for influence |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...(includeRealEvidence ? realEvidenceRows({ approved }) : []),
  ].join('\n'));
}

test('provider readiness allows shadow-only posture when legal/access policy is documented', () => {
  const root = makeTempRepo();
  writeProviderPolicy(root);
  writeRegionReport(root);

  const result = buildProviderReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.equal(result.shadowOnlyAllowed, true);
  assert.equal(result.shadowOnlyPassed, true);
  assert.equal(result.accessCategoryPolicy.policySatisfied, true);
  assert.equal(result.accessCategoryPolicy.standaloneAccessConfigured, false);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.categoryStatus['legal/access'].recommendationInfluenceAllowed, false);
});

test('provider readiness CLI exits successfully for shadow-only posture without approving influence', () => {
  const root = makeTempRepo();
  writeProviderPolicy(root);
  writeRegionReport(root);
  let output = '';

  const exitCode = runProviderReadinessCli({
    rootDir: root,
    args: [],
    stdout: { write: (chunk) => { output += chunk; } },
  });

  assert.equal(exitCode, 0);
  assert.match(output, /SHADOW-ONLY ACCEPTABLE; NOT APPROVED FOR INFLUENCE/);
  const result = JSON.parse(fs.readFileSync(path.join(root, '.smoke', 'provider-readiness-result.json'), 'utf8'));
  assert.equal(result.passed, false);
  assert.equal(result.shadowOnlyPassed, true);
  assert.equal(result.status, 'not_approved_for_influence');
  assert.deepEqual(result.notApprovedCategories.sort(), [
    'closure/seasonal restriction',
    'fire restriction',
    'legal/access',
    'service/resupply',
    'weather',
  ].sort());
});

test('provider readiness blocks reports that omit combined legal/access policy', () => {
  const root = makeTempRepo();
  writeProviderPolicy(root, { documented: false });
  writeRegionReport(root);

  const result = buildProviderReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.accessCategoryPolicy.policySatisfied, false);
  assert.ok(result.blockers.includes('access_category_policy_not_documented'));
  assert.equal(result.shadowOnlyAllowed, false);
});

test('provider readiness blocks influence requests for unapproved categories', () => {
  const root = makeTempRepo();
  writeProviderPolicy(root);
  writeRegionReport(root);

  const result = buildProviderReadinessResult({
    rootDir: root,
    now: fixedNow,
    args: ['--region', 'Region 001', '--influence-requested'],
  });

  assert.equal(result.passed, false);
  assert.equal(result.influenceRequested, true);
  assert.ok(result.blockers.includes('provider_categories_not_approved'));
  assert.ok(result.blockers.includes('provider_influence_requested_for_unapproved_category'));
  assert.deepEqual(result.influenceViolations.sort(), [
    'closure/seasonal restriction',
    'fire restriction',
    'legal/access',
    'service/resupply',
    'weather',
  ].sort());
});

test('provider readiness accepts approved categories without raw payload or coordinate leakage', () => {
  const root = makeTempRepo();
  writeProviderPolicy(root);
  writeRegionReport(root, { approved: true });

  const result = buildProviderReadinessResult({
    rootDir: root,
    now: fixedNow,
    args: ['--region', 'Region 001', '--influence-requested'],
  });

  assert.equal(result.passed, true);
  assert.equal(result.status, 'approved_for_influence');
  assert.equal(result.rawPayloadViolations.length, 0);
  assert.equal(result.preciseCoordinateViolations.length, 0);
  assert.equal(result.privacyViolations.length, 0);
  assert.equal(result.notApprovedCategories.length, 0);
});

test('provider readiness rejects approved rows without real upstream evidence ledger', () => {
  const root = makeTempRepo();
  writeProviderPolicy(root);
  writeRegionReport(root, { approved: true, includeRealEvidence: false });

  const result = buildProviderReadinessResult({
    rootDir: root,
    now: fixedNow,
    args: ['--region', 'Region 001', '--influence-requested'],
  });

  assert.equal(result.passed, false);
  assert.ok(result.blockers.includes('real_upstream_provider_evidence_incomplete'));
  assert.ok(result.notApprovedCategories.includes('legal/access'));
  assert.ok(result.approvalRowsMissingRealEvidence.includes('legal/access'));
});
