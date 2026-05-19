import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildClosedFieldTestReadinessResult,
  runClosedFieldTestReadinessCli,
} from './check-closed-field-test-readiness.mjs';

const fixedNow = new Date('2026-05-01T12:00:00.000Z');

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'campops-closed-field-gate-'));
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeCampOpsLiveReadinessFixtures(root) {
  writeFile(root, 'app/(tabs)/navigate.tsx', [
    'import { buildCampOpsCampScoutMapPins, isCampOpsMapPinPayload } from "../../lib/campops/campOpsMapPins";',
    'import CampScoutIntelCard from "../../components/navigate/CampScoutIntelCard";',
    'const sharedCampPinMapMarkers = buildCampOpsCampScoutMapPins(recommendationSet);',
    'function handleCampScoutTap(payload) { if (isCampOpsMapPinPayload(payload)) setSelectedCampOpsIntel(payload); }',
    '<MapRenderer campScoutMarkers={sharedCampPinMapMarkers} onCampScoutTap={handleCampScoutTap} />',
    '<CampScoutIntelCard visible={!!selectedCampOpsIntel} campOpsDetail={selectedCampOpsIntel} onDismiss={() => setSelectedCampOpsIntel(null)} />',
  ].join('\n'));
  writeFile(root, 'components/navigate/MapRenderer.tsx', [
    "const marker = { pinFamily: marker.pinFamily === 'campops' ? 'campops' : 'camp_scout' };",
    "root.className = 'camp-scout-marker camp-scout-grade-' + grade;",
    "tent.className = 'camp-scout-tent';",
    "rank.className = 'camp-scout-rank';",
  ].join('\n'));
  writeFile(root, 'components/navigate/CampScoutIntelCard.tsx', 'export default function CampScoutIntelCard({ onDismiss }){ return "Dismiss Camp Intel popup Needs verification Source confidence Legal/source confidence"; }\n');
  writeFile(root, 'lib/campops/campOpsCampIntelViewModel.ts', 'export const copy = "ECS-Inferred Camp Candidate Needs verification Access not fully verified Source confidence Legal/source confidence";\n');
  writeFile(root, 'lib/campops/campOpsMapPins.ts', [
    'export function isCampOpsMapPinPayload(payload) { return payload?.pinFamily === "campops"; }',
    'const CAMP_OPS_ROUTE_PIN_LIMIT = 5;',
    'export function buildCampOpsCampScoutMapPins(recommendationSet) {',
    'const seen = new Set<string>();',
    'const rankedCandidates = Array.isArray(recommendationSet.rankedCandidates) ? recommendationSet.rankedCandidates : [];',
    'const pins = [];',
    'for (const camp of rankedCandidates) { if (seen.has(camp.id)) continue; seen.add(camp.id); if (pins.length >= CAMP_OPS_ROUTE_PIN_LIMIT) break; }',
    'return pins;',
    '}',
  ].join('\n'));
  writeFile(root, 'lib/campops/campOpsRecommendationConfig.ts', [
    'export const DEFAULT_CAMP_OPS_RECOMMENDATION_CONFIG = {',
    'minimumOverallScore: 70, minimumTerrainScore: 70, minimumAccessScore: 70, minimumLegalSourceScore: 70, minimumCampSuitabilityScore: 70,',
    'routeCandidateLimit: 5, duplicateCandidateRadiusMiles: 0.12,',
    '};',
    'export const DEFAULT_CAMP_OPS_RECOMMENDATION_ROLLOUT_CONFIG = { campopsProviderAdaptersEnabled: false, campopsAiAssistEnabled: false, campopsDebriefCommunityPublishingEnabled: false, campopsTelemetryEnabled: false };',
  ].join('\n'));
  writeFile(root, 'lib/campops/campOpsRecommendations.ts', [
    'function sourceConfidenceScore(){} function routeDistanceMiles(){} function milesBetween(){}',
    'function thresholdRejectionReasons(){ return ["Demo data is not eligible for production CampOps route candidates."]; }',
    'function sortQualifiedRouteCandidates(){ sourceConfidenceScore(); routeDistanceMiles(); }',
    'function topDedupedRouteCandidates(eligible, config) { const kept = []; for (const item of eligible) { const duplicate = kept.some((existing) => milesBetween(existing, item) <= config.duplicateCandidateRadiusMiles); if (duplicate) continue; kept.push(item); if (kept.length >= config.routeCandidateLimit) break; } return kept; }',
  ].join('\n'));
  for (const testName of ['test-campops-map-pin-parity.js', 'test-campops-camp-intel-popup.js', 'test-campops-candidate-filtering.js', 'test-campops-lifecycle.js']) {
    writeFile(root, `scripts/${testName}`, 'console.log("fixture");\n');
  }
}

function writeEvidenceDocs(root, options = {}) {
  const approved = options.approved === true;
  writeFile(root, 'docs/campops/internal_beta_evidence.md', approved
    ? '# internal_beta_evidence.md\n\nClosed-field-test readiness recommendation: ready with restrictions.\n'
    : '# internal_beta_evidence.md\n\nClosed-field-test readiness recommendation: not ready.\n');
  writeFile(root, 'docs/campops/provider_readiness_region_001.md', approved
    ? [
        '# provider_readiness_region_001.md',
        'Provider readiness approval: approved.',
        'Overall readiness decision: approved.',
        '- Region label: region-001',
        '- Raw provider payloads excluded: yes',
        '- Precise private coordinates excluded: yes',
        '',
        '## Category Approval Matrix',
        '| Category | Approval status | Validation mode | Recommendation influence allowed | Approver | Approval date | Remaining issues |',
        '| --- | --- | --- | --- | --- | --- | --- |',
        '| legal/access | approved | approved | yes | Owner | 2026-05-01 | none |',
        '| closure/seasonal restriction | approved | approved | yes | Owner | 2026-05-01 | none |',
        '| fire restriction | approved | approved | yes | Owner | 2026-05-01 | none |',
        '| weather | approved | approved | yes | Owner | 2026-05-01 | none |',
        '| service/resupply | approved | approved | yes | Owner | 2026-05-01 | none |',
        '',
        '## Real Upstream Provider Evidence Ledger',
        '| Category | Provider/source | Real shadow status | Coverage rate | Freshness rate | Unknown rate | Stale rate | Conflict rate | Accepted for influence |',
        '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
        '| legal/access | accepted real provider set | real-shadow accepted | 92% | 91% | 3% | 1% | 0% | yes |',
        '| closure/seasonal restriction | accepted real provider set | real-shadow accepted | 92% | 91% | 3% | 1% | 0% | yes |',
        '| fire restriction | accepted real provider set | real-shadow accepted | 92% | 91% | 3% | 1% | 0% | yes |',
        '| weather | accepted real provider set | real-shadow accepted | 92% | 91% | 3% | 1% | 0% | yes |',
        '| service/resupply | accepted real provider set | real-shadow accepted | 92% | 91% | 3% | 1% | 0% | yes |',
      ].join('\n')
    : '# provider_readiness_region_001.md\n\n- Region label: region-001\n- Raw provider payloads excluded: yes\n- Precise private coordinates excluded: yes\n\nOverall readiness decision: not ready.\nValidation mode: shadow only.\n');
  writeFile(root, 'docs/campops/provider_readiness.md', 'source confidence distribution provider limitations provider influence region/category readiness Keep `campopsProviderAdaptersEnabled` off.\n');
  writeFile(root, 'docs/campops/mobile_qa_evidence.md', approved
    ? [
        '# mobile_qa_evidence.md',
        'Android/device QA execution status: complete.',
        'CampOps visual-state execution completed.',
        '## Environment',
        '## CampOps Visual QA Route',
        '## Android Device QA Evidence Packet',
        '| Field | Value |',
        '| --- | --- |',
        '| QA status | complete |',
        '| tester | QA |',
        '| device type | Android emulator |',
        '| Android version | 15 |',
        '| build identifier | build-001 |',
        '| app version/commit | commit-001 |',
        '| execution date | 2026-05-01 |',
        '| visual QA route/screen | /dev/campops-visual-qa |',
        '| screenshot/evidence references | artifact ref qa-001 |',
        '| scenario results | recorded |',
        '| issues found | no issues |',
        '| recommendation | blocked |',
        'Required screenshots/evidence references Navigate Mapbox route rendering CampOps camp pin rendering CampOps pin tap opens Camp Intel popup Camp Intel popup scroll Camp Intel popup dismiss Save Camp action Navigate Here action Report Unusable action',
        'Required scenario checklist',
        '| Scenario | Required visual check | Pass/fail | Evidence reference | Notes |',
        '| --- | --- | --- | --- | --- |',
        '| On-time normal route | visible | pass | artifact ref qa-001 | none |',
        '| Two-hour delay with planned camp arriving after sunset | visible | pass | artifact ref qa-001 | none |',
        '| Trailer/full-size vehicle access or turnaround scenario | visible | pass | artifact ref qa-001 | none |',
        '| Low fuel margin or next-fuel uncertainty | visible | pass | artifact ref qa-001 | none |',
        '| Low water margin or next-day water concern | visible | pass | artifact ref qa-001 | none |',
        '| Offline cached source data | visible | pass | artifact ref qa-001 | none |',
        '| Offline no-cache or missing-source state | visible | pass | artifact ref qa-001 | none |',
        '| Stale closure/weather/fire/service data | visible | pass | artifact ref qa-001 | none |',
        '| Legacy result list differs from CampOps endpoint recommendation | visible | pass | artifact ref qa-001 | none |',
        '| Private debrief capture without community publishing | visible | pass | artifact ref qa-001 | none |',
        'Required visual-state checklist',
        '| Visual state | Pass/fail | Evidence reference | Notes |',
        '| --- | --- | --- | --- |',
        '| CampOps recommendation available | pass | artifact ref qa-001 | none |',
        '| Endpoint recommendation available | pass | artifact ref qa-001 | none |',
        '| Delayed-day endpoint recommendation | pass | artifact ref qa-001 | none |',
        '| Decision points visible when supported | pass | artifact ref qa-001 | none |',
        '| Source transparency visible | pass | artifact ref qa-001 | none |',
        '| Provider shadow or unknown state | pass | artifact ref qa-001 | none |',
        '| Offline cached state | pass | artifact ref qa-001 | none |',
        '| Offline no-cache or missing-source state | pass | artifact ref qa-001 | none |',
        '| Stale source state | pass | artifact ref qa-001 | none |',
        '| AI assist disabled | pass | artifact ref qa-001 | none |',
        '| Telemetry disabled | pass | artifact ref qa-001 | none |',
        '| Community publishing disabled | pass | artifact ref qa-001 | none |',
        '| Manual feedback reminder visible or documented | pass | artifact ref qa-001 | none |',
      ].join('\n')
    : '# mobile_qa_evidence.md\n\n## Environment\n## CampOps Visual QA Route\n## Android Device QA Evidence Packet\nRequired screenshots/evidence references Navigate Mapbox route rendering CampOps camp pin rendering CampOps pin tap opens Camp Intel popup Camp Intel popup scroll Camp Intel popup dismiss Save Camp action Navigate Here action Report Unusable action\nNo screenshots were captured.\nPrepared, not device-run.\n');
  writeFile(root, 'docs/campops/privacy_storage_review.md', approved
    ? '# privacy_storage_review.md\n\nPrivacy/storage owner approval: approved.\nOwner approval status: approved.\nSaved camps storage is documented.\nReport unusable data handling is documented.\nCAMP_OPS_DEBRIEF_STORAGE_KEY deleteStoredCampOpsDebrief clearStoredCampOpsDebriefs\n\n## Closed Field-Test Privacy/Storage Approval Packet\n- Status: approved\n- Owner: Privacy\n- Approval date: 2026-05-01\n- Approved data categories: saved camp pins and private debriefs\n- Retention period: documented\n- Deletion path: deleteStoredCampOpsDebrief(recordId) and clearStoredCampOpsDebriefs()\n- Storage location: LocalCampOpsDebriefBackend\n- Encryption status: platform storage only\n- Access controls: internal tester only\n- Private debrief data posture: private only; no community/public use\n- Private debrief owner approval: approved\n- Telemetry posture: disabled\n- Telemetry sink: disabled\n- Community publishing: disabled\n- Raw provider payloads stored: no\n- Raw AI prompts stored: no\n- Private coordinates in shared evidence: no\n- Remaining issues: none\n'
    : '# privacy_storage_review.md\n\nSaved camps storage is documented.\nReport unusable data handling is documented.\nCAMP_OPS_DEBRIEF_STORAGE_KEY deleteStoredCampOpsDebrief clearStoredCampOpsDebriefs\n\n## Closed Field-Test Privacy/Storage Approval Packet\n- Status: incomplete\n- Owner:\n- Approval date:\n- Approved data categories: none approved yet\n- Retention period: documented\n- Deletion path: deleteStoredCampOpsDebrief(recordId) and clearStoredCampOpsDebriefs()\n- Storage location: LocalCampOpsDebriefBackend\n- Encryption status: platform storage only\n- Access controls: incomplete\n- Private debrief data posture: private only; no community/public use\n- Private debrief owner approval: incomplete\n- Telemetry posture: disabled\n- Telemetry sink: disabled\n- Community publishing: disabled\n- Raw provider payloads stored: no\n- Raw AI prompts stored: no\n- Private coordinates in shared evidence: no\n- Remaining issues: Approval remains incomplete.\n');
  writeFile(root, 'docs/campops/ai_real_output_review.md', approved
    ? '# ai_real_output_review.md\n\ncampopsAiAssistEnabled=false.\nAI real-output approval: approved.\nReal model executed in this report: yes.\n'
    : '# ai_real_output_review.md\n\ncampopsAiAssistEnabled remains opt-in and default-off.\nReal model executed in this report: no.\n');
}

function rolloutWithGate() {
  return [
    '# CampOps Rollout Matrix',
    '',
    'Closed field testing must pass `docs/campops/closed_field_test_readiness.md` before any closed field test.',
    '',
  ].join('\n');
}

function rolloutWithoutGate() {
  return '# CampOps Rollout Matrix\n\nClosed field testing is discussed here.\n';
}

function readinessDoc(status, options = {}) {
  const blockers = options.blockers ?? [];
  const followUp = options.followUp ?? [];
  const includeAllSections = options.includeAllSections ?? true;
  const sections = includeAllSections
    ? [
        '## Required Gates',
        '',
        '| Gate | Required criterion | Current status | Closed field-test effect |',
        '| --- | --- | --- | --- |',
        '| P0 issues | No unresolved P0 issues. | Pass | Continue. |',
        '| P1 recommendation-trust issues | No unresolved P1 recommendation-trust issues. | Pass | Continue. |',
        '| CampOps live readiness gates | Rendering, scoring, safety/copy, privacy/storage, provider/source, and Android/device QA gates pass or are risk-accepted. | Pass | Continue. |',
        '| Provider readiness | Provider readiness approved. | Pass | Continue. |',
        '| Android/device QA | Android/device QA completed. | Pass | Continue. |',
        '| Privacy/storage review | Privacy/storage review approved. | Pass | Continue. |',
        '| Community publishing | Community publishing off. | Pass | Continue. |',
        '| Telemetry | Telemetry off unless approved. | Pass | Continue. |',
        '| AI assist | AI assist approved or disabled. | Pass | Continue. |',
        '| Rollback path | Rollback path tested. | Pass | Continue. |',
        '| Field-test scenarios | Field-test scenarios defined. | Pass | Continue. |',
        '',
        '## Restricted Field-Test Posture',
        '',
        '- Approved testers only.',
        '',
        '## Provider Influence Limits',
        '',
        '- Provider influence limited to approved categories.',
        '',
        '## Required Scenario Set',
        '',
        '- Two-hour delay scenario.',
        '',
        '## What Blocks Closed Field Testing',
        '',
        blockers.length ? blockers.map((item) => `- ${item}`).join('\n') : 'None.',
        '',
        '## Current Required Follow-Up',
        '',
        followUp.length ? followUp.map((item, index) => `${index + 1}. ${item}`).join('\n') : 'None.',
      ]
    : [
        '## Required Gates',
        '',
        '| Gate | Required criterion | Current status | Closed field-test effect |',
        '| --- | --- | --- | --- |',
        '| Provider readiness | Provider readiness approved. | Pass | Continue. |',
      ];

  if (includeAllSections) {
    sections.splice(17, 0,
      '## Live Readiness Gates',
      '',
      '| Gate | Required criterion | Current status | Closed field-test effect |',
      '| --- | --- | --- | --- |',
      '| Rendering | Pins render on Navigate Mapbox without duplicates and popups open/dismiss. | Pass | Required. |',
      '| Scoring | Thresholds, top 5, nearby dedupe, and no production demo fallback. | Pass | Required. |',
      '| Safety/copy | Safe ECS-Inferred copy and unverified access/legal labels. | Pass | Required. |',
      '| Privacy/storage | Saved camps/report unusable handling documented and approved. | Pass | Required. |',
      '| Provider/source | Source confidence, limitations, and region/category readiness documented and approved. | Pass | Required. |',
      '| Android/device QA | Device flow evidence exists for map, pin, popup, save, navigate, and report. | Pass | Required. |',
      '',
    );
  }

  return [
    '# CampOps Closed Field-Test Readiness Gate',
    '',
    `Closed field-test status: **${status}**.`,
    '',
    ...sections,
    '',
  ].join('\n');
}

function riskAcceptanceDoc(status = 'not accepted') {
  const accepted = status === 'accepted';
  const value = (fieldValue) => (accepted ? fieldValue : '');
  return [
    '# CampOps Closed Field-Test Risk Acceptance',
    '',
    `Status: ${status}`,
    '',
    'Risk acceptance mode:',
    '- restricted_closed_field_test_only',
    '',
    'Required actual sign-offs:',
    `- Product owner: ${value('Product')}`,
    `- Product approval date: ${value('2026-05-01')}`,
    `- Safety owner: ${value('Safety')}`,
    `- Safety approval date: ${value('2026-05-01')}`,
    `- Privacy owner: ${value('Privacy')}`,
    `- Privacy approval date: ${value('2026-05-01')}`,
    `- Engineering owner: ${value('Engineering')}`,
    `- Engineering approval date: ${value('2026-05-01')}`,
    '',
    'Scope:',
    `- Approved tester cohort: ${value('internal closed field-test cohort')}`,
    `- Maximum tester count: ${value('4')}`,
    `- Approved build identifier: ${value('fieldtest-build-001')}`,
    `- Approved app version/commit: ${value('fixture-commit')}`,
    `- Approved region labels: ${value('Region 001')}`,
    `- Approved route labels: ${value('Route Alpha')}`,
    `- Approved scenario labels: ${value('two-hour delay')}`,
    `- Expiration date: ${value('2026-06-01')}`,
    `- Incident contact: ${value('incident@example.test')}`,
    `- Rollback owner: ${value('Engineering')}`,
    `- Rollback command/path: ${value('rollbackCampOpsInternalBetaActivation')}`,
    '',
    'Risk-accepted incomplete items:',
    '- Android/device QA evidence incomplete: yes',
    '- Android QA required fields incomplete: yes',
    '- Required Android QA scenario results incomplete: yes',
    '- Required Android QA visual-state results incomplete: yes',
    '- Screenshot/evidence references missing: yes',
    '- Provider category/region approval missing: yes',
    '- Privacy/storage approval incomplete: yes',
    '- Private debrief data owner approval incomplete: yes',
    '',
    'Non-negotiable restrictions:',
    '- campopsAiAssistEnabled=false',
    '- campopsTelemetryEnabled=false',
    '- campopsDebriefCommunityPublishingEnabled=false',
    '- campopsProviderAdaptersEnabled=false unless exact category/region approval exists',
    '- campopsProviderValidationShadowModeEnabled may be true',
    '- Provider output must remain shadow-only/unknown for unapproved categories',
    '- Manual privacy-safe feedback required after every session',
    '- No public/community publishing',
    '- No raw provider payloads in shared evidence',
    '- No raw AI prompts',
    '- No private coordinates in shared evidence',
    '- No private user IDs',
    '- No vehicle identifiers',
    '- No private debrief notes in shared evidence',
    '',
    'Decision:',
    `- Status: ${status}`,
    `- Decision summary: ${value('Accepted for restricted closed field-test only.')}`,
    `- Remaining concerns: ${value('Evidence gates remain incomplete.')}`,
    '',
  ].join('\n');
}

function writeFixtureRepo(root, { readiness, rollout = rolloutWithGate(), evidence = true, evidenceApproved = false } = {}) {
  if (readiness !== undefined) writeFile(root, 'docs/campops/closed_field_test_readiness.md', readiness);
  writeFile(root, 'docs/campops/rollout.md', rollout);
  if (evidence) writeEvidenceDocs(root, { approved: evidenceApproved });
  writeCampOpsLiveReadinessFixtures(root);
}

test('missing closed_field_test_readiness.md causes failure', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, { readiness: undefined });

  const result = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'unknown');
  assert.ok(result.missingFiles.some((file) => file.endsWith('closed_field_test_readiness.md')));
});

test('blocked readiness status fails', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    readiness: readinessDoc('blocked', {
      blockers: ['Provider readiness not approved.'],
      followUp: ['Run provider validation.'],
    }),
  });

  const result = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.status, 'blocked');
  assert.equal(result.passed, false);
  assert.deepEqual(result.missingSections, []);
});

test('blocked readiness produces blockers and follow-up items', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    readiness: readinessDoc('blocked', {
      blockers: ['Android/device QA evidence missing.', 'Manual feedback path not available.'],
      followUp: ['Add dev-only QA route.', 'Capture tester feedback.'],
    }),
  });

  const result = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });

  assert.deepEqual(result.blockers, [
    'closed_field_test_status_blocked',
    'android_device_qa_incomplete',
    'provider_readiness_not_approved',
    'privacy_storage_owner_approval_incomplete',
    'campops_live_readiness_not_closed_field_ready',
  ]);
  assert.equal(result.evidenceStatus.aiAssist, 'disabled');
  assert.ok(result.notes.some((note) => /AI real-output approval is incomplete/.test(note)));
  assert.deepEqual(result.followUp, ['Add dev-only QA route.', 'Capture tester feedback.']);
});

test('missing required sections are reported', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    readiness: readinessDoc('ready with restrictions', { includeAllSections: false }),
  });

  const result = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.ok(result.missingSections.includes('P0 issues'));
  assert.ok(result.missingSections.includes('Restricted field-test posture'));
  assert.ok(result.missingSections.includes('Required scenario set'));
});

test('rollout.md missing the gate requirement is reported', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    readiness: readinessDoc('ready with restrictions'),
    rollout: rolloutWithoutGate(),
  });

  const result = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.ok(result.missingSections.includes('rollout.md closed field-test gate requirement'));
});

test('--json emits parseable JSON only and writes result artifact', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    readiness: readinessDoc('blocked', {
      blockers: ['Any unresolved P0 issue.'],
      followUp: ['Resolve blocker.'],
    }),
  });

  let stdout = '';
  const exitCode = runClosedFieldTestReadinessCli({
    rootDir: root,
    args: ['--json'],
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
  });

  assert.equal(exitCode, 1);
  assert.doesNotMatch(stdout, /CampOps closed field-test readiness:/);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.status, 'blocked');
  assert.equal(parsed.passed, false);
  assert.ok(fs.existsSync(path.join(root, '.smoke', 'closed-field-test-readiness-result.json')));
});

test('ready-with-restrictions fixture passes only with all sections and approved evidence', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    readiness: readinessDoc('ready with restrictions'),
    evidenceApproved: true,
  });

  const passing = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });
  assert.equal(passing.status, 'ready_with_restrictions');
  assert.equal(passing.passed, true);

  writeFixtureRepo(root, {
    readiness: readinessDoc('ready with restrictions'),
    evidenceApproved: false,
  });
  const blockedByEvidence = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });
  assert.equal(blockedByEvidence.status, 'ready_with_restrictions');
  assert.equal(blockedByEvidence.passed, false);
  assert.ok(blockedByEvidence.blockers.includes('android_device_qa_incomplete'));
  assert.ok(blockedByEvidence.blockers.includes('provider_readiness_not_approved'));
});

test('closed-field privacy approval ignores broad-rollout caveats outside approval packet', () => {
  const root = makeTempRepo();
  writeCampOpsLiveReadinessFixtures(root);
  writeEvidenceDocs(root, { approved: true });
  writeFile(root, 'docs/campops/rollout.md', rolloutWithGate());
  writeFile(root, 'docs/campops/closed_field_test_readiness.md', readinessDoc('ready_with_restrictions'));
  writeFile(root, 'docs/campops/closed_field_test_risk_acceptance.md', riskAcceptanceDoc('accepted'));
  writeFile(root, 'docs/campops/privacy_storage_review.md', [
    '# privacy_storage_review.md',
    '',
    '## Closed Field-Test Privacy/Storage Approval Packet',
    '- Status: approved',
    '- Owner: Privacy',
    '- Approval date: 2026-05-01',
    '- Approved data categories: saved camp pins and private debriefs',
    '- Retention period: documented',
    '- Deletion path: deleteStoredCampOpsDebrief(recordId) and clearStoredCampOpsDebriefs()',
    '- Storage location: LocalCampOpsDebriefBackend',
    '- Encryption status: platform storage only',
    '- Access controls: internal tester only',
    '- Private debrief data posture: private only; no community/public use',
    '- Private debrief owner approval: approved',
    '- Telemetry posture: disabled',
    '- Telemetry sink: disabled',
    '- Community publishing: disabled',
    '- Raw provider payloads stored: no',
    '- Raw AI prompts stored: no',
    '- Private coordinates in shared evidence: no',
    '- Remaining issues: none for restricted closed-field testing',
    '',
    '## Remaining Risks',
    '',
    '- Retention, encryption, deletion, and access-control owners are still TBD for broad real trip/debrief field data.',
    '- Broad rollout approval remains incomplete.',
  ].join('\n'));

  const result = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.evidenceStatus.privacyStorageApproval, 'approved');
  assert.equal(result.passed, true);
});

test('risk-accepted readiness note only names unresolved evidence', () => {
  const root = makeTempRepo();
  writeCampOpsLiveReadinessFixtures(root);
  writeEvidenceDocs(root, { approved: true });
  writeFile(root, 'docs/campops/rollout.md', rolloutWithGate());
  writeFile(root, 'docs/campops/closed_field_test_readiness.md', readinessDoc('ready_with_restrictions'));
  writeFile(root, 'docs/campops/closed_field_test_risk_acceptance.md', riskAcceptanceDoc('accepted'));
  writeFile(root, 'docs/campops/provider_readiness_region_001.md', [
    '# provider_readiness_region_001.md',
    '- Region label: Region 001',
    '- Raw provider payloads excluded: yes',
    '- Precise private coordinates excluded: yes',
    '',
    'Overall readiness decision: not ready.',
    'Validation mode: shadow only.',
  ].join('\n'));

  const result = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });
  const riskNote = result.notes.find((note) => note.startsWith('Closed field testing is risk-accepted'));

  assert.match(riskNote, /provider readiness remains unapproved for influence/);
  assert.doesNotMatch(riskNote, /Android\/device QA remains incomplete/);
  assert.doesNotMatch(riskNote, /privacy\/storage approval remains incomplete/);
});

test('risk acceptance can pass blocked evidence only with explicit accepted sign-offs', () => {
  const root = makeTempRepo();
  writeFixtureRepo(root, {
    readiness: readinessDoc('blocked', {
      blockers: ['Android/device QA evidence missing.'],
      followUp: ['Complete evidence or risk acceptance.'],
    }),
    evidenceApproved: false,
  });
  writeFile(root, 'docs/campops/closed_field_test_risk_acceptance.md', riskAcceptanceDoc('accepted'));

  const accepted = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });
  assert.equal(accepted.status, 'blocked');
  assert.equal(accepted.effectiveStatus, 'risk_accepted_restricted_closed_field_test');
  assert.equal(accepted.passed, true);
  assert.equal(accepted.riskAcceptance.accepted, true);
  assert.deepEqual(accepted.blockers, []);

  writeFile(root, 'docs/campops/closed_field_test_risk_acceptance.md', riskAcceptanceDoc('not accepted'));
  const notAccepted = buildClosedFieldTestReadinessResult({ rootDir: root, now: fixedNow });
  assert.equal(notAccepted.passed, false);
  assert.equal(notAccepted.riskAcceptance.accepted, false);
  assert.ok(notAccepted.blockers.includes('closed_field_test_status_blocked'));
});
