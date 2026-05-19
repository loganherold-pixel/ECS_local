import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCampOpsLiveReadinessResult,
  runCampOpsLiveReadinessCli,
} from './check-campops-live-readiness.mjs';

const fixedNow = new Date('2026-05-04T12:00:00.000Z');

const providerCategories = [
  'legal/access',
  'closure/seasonal restriction',
  'fire restriction',
  'weather',
  'service/resupply',
];

const androidScenarios = [
  'On-time normal route',
  'Two-hour delay with planned camp arriving after sunset',
  'Trailer/full-size vehicle access or turnaround scenario',
  'Low fuel margin or next-fuel uncertainty',
  'Low water margin or next-day water concern',
  'Offline cached source data',
  'Offline no-cache or missing-source state',
  'Stale closure/weather/fire/service data',
  'Legacy result list differs from CampOps endpoint recommendation',
  'Private debrief capture without community publishing',
];

const androidVisualStates = [
  'CampOps recommendation available',
  'Endpoint recommendation available',
  'Delayed-day endpoint recommendation',
  'Decision points visible when supported',
  'Source transparency visible',
  'Provider shadow or unknown state',
  'Offline cached state',
  'Offline no-cache or missing-source state',
  'Stale source state',
  'AI assist disabled',
  'Telemetry disabled',
  'Community publishing disabled',
  'Manual feedback reminder visible or documented',
];

function makeTempRepo() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'campops-live-readiness-'));
}

function writeFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeSourceFixtures(root) {
  writeFile(root, 'app/(tabs)/navigate.tsx', [
    'import { buildCampOpsCampScoutMapPins, isCampOpsMapPinPayload } from "../../lib/campops/campOpsMapPins";',
    'import CampScoutIntelCard from "../../components/navigate/CampScoutIntelCard";',
    'const sharedCampPinMapMarkers = buildCampOpsCampScoutMapPins(recommendationSet);',
    'function handleCampScoutTap(payload) { if (isCampOpsMapPinPayload(payload)) setSelectedCampOpsIntel(payload); }',
    '<MapRenderer campScoutMarkers={sharedCampPinMapMarkers} onCampScoutTap={handleCampScoutTap} />',
    '<CampScoutIntelCard visible campOpsDetail={selectedCampOpsIntel} onDismiss={() => setSelectedCampOpsIntel(null)} />',
  ].join('\n'));

  writeFile(root, 'components/navigate/MapRenderer.tsx', [
    "const marker = { pinFamily: marker.pinFamily === 'campops' ? 'campops' : 'camp_scout' };",
    "root.className = 'camp-scout-marker camp-scout-grade-' + grade;",
    "tent.className = 'camp-scout-tent';",
    "rank.className = 'camp-scout-rank';",
  ].join('\n'));

  writeFile(root, 'lib/campops/campOpsMapPins.ts', [
    'export function isCampOpsMapPinPayload(payload) { return payload?.pinFamily === "campops"; }',
    'const CAMP_OPS_ROUTE_PIN_LIMIT = 5;',
    'export function buildCampOpsCampScoutMapPins(recommendationSet) {',
    '  const seen = new Set<string>();',
    '  const rankedCandidates = Array.isArray(recommendationSet.rankedCandidates) ? recommendationSet.rankedCandidates : [];',
    '  const pins = [];',
    '  for (const camp of rankedCandidates) {',
    '    if (seen.has(camp.id)) continue;',
    '    seen.add(camp.id);',
    '    pins.push({ id: `campops-candidate-${camp.id}`, rankLabel: String(pins.length + 1) });',
    '    if (pins.length >= CAMP_OPS_ROUTE_PIN_LIMIT) break;',
    '  }',
    '  return pins;',
    '}',
  ].join('\n'));

  writeFile(root, 'lib/campops/campOpsRecommendationConfig.ts', [
    'export const DEFAULT_CAMP_OPS_RECOMMENDATION_CONFIG = {',
    '  minimumOverallScore: 70,',
    '  minimumTerrainScore: 70,',
    '  minimumAccessScore: 70,',
    '  minimumLegalSourceScore: 70,',
    '  minimumCampSuitabilityScore: 70,',
    '  routeCandidateLimit: 5,',
    '  duplicateCandidateRadiusMiles: 0.12,',
    '};',
    'export const DEFAULT_CAMP_OPS_RECOMMENDATION_ROLLOUT_CONFIG = {',
    '  campopsProviderAdaptersEnabled: false,',
    '  campopsAiAssistEnabled: false,',
    '  campopsDebriefCommunityPublishingEnabled: false,',
    '  campopsTelemetryEnabled: false,',
    '};',
  ].join('\n'));

  writeFile(root, 'lib/campops/campOpsRecommendations.ts', [
    'function sourceConfidenceScore(bundle) { return 1; }',
    'function routeDistanceMiles(bundle) { return 1; }',
    'function milesBetween(a, b) { return 0; }',
    'function thresholdRejectionReasons(bundle) { return ["Demo data is not eligible for production CampOps route candidates."]; }',
    'function sortQualifiedRouteCandidates() { sourceConfidenceScore(); routeDistanceMiles(); }',
    'function topDedupedRouteCandidates(eligible, config) {',
    '  const kept = [];',
    '  for (const item of eligible) {',
    '    const duplicate = kept.some((existing) => milesBetween(existing, item) <= config.duplicateCandidateRadiusMiles);',
    '    if (duplicate) continue;',
    '    kept.push(item);',
    '    if (kept.length >= config.routeCandidateLimit) break;',
    '  }',
    '  return kept;',
    '}',
  ].join('\n'));

  writeFile(root, 'components/navigate/CampScoutIntelCard.tsx', [
    'export default function CampScoutIntelCard({ onDismiss }) {',
    '  return "Dismiss Camp Intel popup Needs verification Source confidence Legal/source confidence";',
    '}',
  ].join('\n'));

  writeFile(root, 'lib/campops/campOpsCampIntelViewModel.ts', [
    'export const statusLabel = "ECS-Inferred Camp Candidate";',
    'export const copy = "Needs verification Access not fully verified Source confidence Legal/source confidence";',
  ].join('\n'));

  for (const testName of [
    'test-campops-map-pin-parity.js',
    'test-campops-camp-intel-popup.js',
    'test-campops-candidate-filtering.js',
    'test-campops-lifecycle.js',
  ]) {
    writeFile(root, `scripts/${testName}`, 'console.log("fixture");\n');
  }
}

function writeProviderDocs(root, approved) {
  writeFile(root, 'docs/campops/provider_readiness.md', [
    '# CampOps Provider Readiness Reports',
    'Provider limitations and provider influence are documented.',
    'Each report includes source confidence distribution and region/category readiness.',
    'Keep `campopsProviderAdaptersEnabled` off unless approved.',
  ].join('\n'));
  const rows = providerCategories.map((category) => (
    `| ${category} | ${approved ? 'approved' : 'not approved'} | ${approved ? 'approved' : 'real-shadow'} | ${approved ? 'yes' : 'no'} | Owner | 2026-05-04 | none |`
  ));
  const realEvidenceRows = providerCategories.map((category) => (
    approved
      ? `| ${category} | accepted real provider set | real-shadow accepted | 92% | 91% | 3% | 1% | 0% | yes |`
      : `| ${category} | TBD real provider set | not run | n/a | n/a | n/a | n/a | n/a | no |`
  ));
  writeFile(root, 'docs/campops/provider_readiness_region_001.md', [
    '# Provider Readiness Region 001',
    '- Region label: region-001',
    '- Raw provider payloads excluded: yes',
    '- Precise private coordinates excluded: yes',
    '',
    '## Category Approval Matrix',
    '| Category | Approval status | Validation mode | Recommendation influence allowed | Approver | Approval date | Remaining issues |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## Real Upstream Provider Evidence Ledger',
    '',
    '| Category | Provider/source | Real shadow status | Coverage rate | Freshness rate | Unknown rate | Stale rate | Conflict rate | Accepted for influence |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |',
    ...realEvidenceRows,
  ].join('\n'));
}

function writePrivacyDoc(root, approved) {
  writeFile(root, 'docs/campops/privacy_storage_review.md', [
    '# CampOps Privacy, Storage, and Retention Review',
    'CAMP_OPS_DEBRIEF_STORAGE_KEY deleteStoredCampOpsDebrief clearStoredCampOpsDebriefs',
    'Saved camps storage is handled by the existing pin store for explicit user saves.',
    'Report unusable data handling is local/session-scoped unless a reviewed reporting sink is added.',
    '',
    '## Closed Field-Test Privacy/Storage Approval Packet',
    `- Status: ${approved ? 'approved' : 'incomplete'}`,
    `- Owner: ${approved ? 'Privacy' : ''}`,
    `- Approval date: ${approved ? '2026-05-04' : ''}`,
    '- Approved data categories: saved camp pins and local private debriefs',
    '- Retention period: documented retention period',
    '- Deletion path: deleteStoredCampOpsDebrief(recordId) and clearStoredCampOpsDebriefs()',
    '- Storage location: LocalCampOpsDebriefBackend and explicit saved camp pin store',
    '- Encryption status: platform storage only; no CampOps encryption layer',
    '- Access controls: internal tester only',
    '- Private debrief data posture: private only; no community/public use',
    `- Private debrief owner approval: ${approved ? 'approved' : 'incomplete'}`,
    '- Telemetry posture: disabled',
    '- Telemetry sink: not approved',
    '- Community publishing: disabled',
    '- Raw provider payloads stored: no',
    '- Raw AI prompts stored: no',
    '- Private coordinates in shared evidence: no',
    `- Remaining issues: ${approved ? 'none' : 'Approval remains incomplete.'}`,
  ].join('\n'));
}

function writeAndroidQaDoc(root, complete) {
  const pass = complete ? 'pass' : 'TODO / not run';
  const evidence = complete ? 'artifact ref qa-001' : 'TODO';
  writeFile(root, 'docs/campops/mobile_qa_evidence.md', [
    '# CampOps Mobile QA Evidence',
    '',
    '## Environment',
    '',
    '## CampOps Visual QA Route',
    '',
    '## Android Device QA Evidence Packet',
    '| Field | Value |',
    '| --- | --- |',
    `| QA status | ${complete ? 'complete' : 'incomplete'} |`,
    '| tester | QA |',
    '| device type | Android emulator |',
    '| Android version | 15 |',
    '| build identifier | build-001 |',
    '| app version/commit | commit-001 |',
    '| execution date | 2026-05-04 |',
    '| visual QA route/screen | /dev/campops-visual-qa |',
    `| screenshot/evidence references | ${evidence} |`,
    '| scenario results | recorded |',
    '| issues found | no issues |',
    '| recommendation | blocked |',
    '',
    'Required screenshots/evidence references',
    'Navigate Mapbox route rendering',
    'CampOps camp pin rendering',
    'CampOps pin tap opens Camp Intel popup',
    'Camp Intel popup scroll',
    'Camp Intel popup dismiss',
    'Save Camp action',
    'Navigate Here action',
    'Report Unusable action',
    '',
    'Required scenario checklist:',
    '| Scenario | Required visual check | Pass/fail | Evidence reference | Notes |',
    '| --- | --- | --- | --- | --- |',
    ...androidScenarios.map((scenario) => `| ${scenario} | visible | ${pass} | ${evidence} | none |`),
    '',
    'Required visual-state checklist:',
    '| Visual state | Pass/fail | Evidence reference | Notes |',
    '| --- | --- | --- | --- |',
    ...androidVisualStates.map((state) => `| ${state} | ${pass} | ${evidence} | none |`),
  ].join('\n'));
}

function writeRiskAcceptance(root, accepted) {
  writeFile(root, 'docs/campops/closed_field_test_risk_acceptance.md', [
    '# CampOps Closed Field-Test Risk Acceptance',
    '',
    `Status: ${accepted ? 'accepted' : 'not accepted'}`,
    '',
    'Risk acceptance mode:',
    '- restricted_closed_field_test_only',
    '',
    'Required actual sign-offs:',
    `- Product owner: ${accepted ? 'Product' : ''}`,
    `- Product approval date: ${accepted ? '2026-05-04' : ''}`,
    `- Safety owner: ${accepted ? 'Safety' : ''}`,
    `- Safety approval date: ${accepted ? '2026-05-04' : ''}`,
    `- Privacy owner: ${accepted ? 'Privacy' : ''}`,
    `- Privacy approval date: ${accepted ? '2026-05-04' : ''}`,
    `- Engineering owner: ${accepted ? 'Engineering' : ''}`,
    `- Engineering approval date: ${accepted ? '2026-05-04' : ''}`,
    '',
    'Scope:',
    `- Approved tester cohort: ${accepted ? 'closed testers' : ''}`,
    `- Maximum tester count: ${accepted ? '4' : ''}`,
    `- Approved build identifier: ${accepted ? 'build-001' : ''}`,
    `- Approved app version/commit: ${accepted ? 'commit-001' : ''}`,
    `- Approved region labels: ${accepted ? 'region-001' : ''}`,
    `- Approved route labels: ${accepted ? 'route-alpha' : ''}`,
    `- Approved scenario labels: ${accepted ? 'campops-route-pins' : ''}`,
    `- Expiration date: ${accepted ? '2026-06-01' : ''}`,
    `- Incident contact: ${accepted ? 'incident@example.test' : ''}`,
    `- Rollback owner: ${accepted ? 'Engineering' : ''}`,
    `- Rollback command/path: ${accepted ? 'rollbackCampOpsInternalBetaActivation' : ''}`,
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
    `- Status: ${accepted ? 'accepted' : 'not accepted'}`,
  ].join('\n'));
}

function writeFixture(root, options = {}) {
  writeSourceFixtures(root);
  writeProviderDocs(root, options.providerApproved === true);
  writePrivacyDoc(root, options.privacyApproved === true);
  writeAndroidQaDoc(root, options.androidComplete === true);
  writeRiskAcceptance(root, options.riskAccepted === true);
}

test('missing implementation and evidence blocks live readiness', () => {
  const root = makeTempRepo();
  const result = buildCampOpsLiveReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.equal(result.status, 'blocked_pending_risk_acceptance');
  assert.ok(result.blockers.includes('campops_rendering_gate_failed'));
  assert.ok(result.blockers.includes('campops_scoring_gate_failed'));
});

test('implementation gates can be internal beta ready while closed field evidence remains blocked', () => {
  const root = makeTempRepo();
  writeFixture(root, {
    providerApproved: false,
    privacyApproved: false,
    androidComplete: false,
  });

  const result = buildCampOpsLiveReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, false);
  assert.equal(result.internalBetaReady, true);
  assert.equal(result.closedFieldTestReady, false);
  assert.equal(result.status, 'internal_beta_ready');
  assert.ok(result.blockers.includes('campops_privacy_storage_gate_failed'));
  assert.ok(result.blockers.includes('campops_provider_source_gate_failed'));
  assert.ok(result.blockers.includes('campops_android_device_qa_gate_failed'));
});

test('all live readiness gates passing marks closed field test ready', () => {
  const root = makeTempRepo();
  writeFixture(root, {
    providerApproved: true,
    privacyApproved: true,
    androidComplete: true,
  });

  const result = buildCampOpsLiveReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, true);
  assert.equal(result.status, 'closed_field_test_ready');
  assert.equal(result.closedFieldTestReady, true);
  assert.deepEqual(result.blockers, []);
});

test('accepted risk acceptance waives missing closed-field evidence without marking evidence complete', () => {
  const root = makeTempRepo();
  writeFixture(root, {
    providerApproved: false,
    privacyApproved: false,
    androidComplete: false,
    riskAccepted: true,
  });

  const result = buildCampOpsLiveReadinessResult({ rootDir: root, now: fixedNow });

  assert.equal(result.passed, true);
  assert.equal(result.internalBetaReady, true);
  assert.equal(result.closedFieldTestReady, false);
  assert.equal(result.riskAccepted, true);
  assert.deepEqual(result.blockers, []);
  assert.ok(result.riskAcceptedBlockers.includes('campops_android_device_qa_gate_failed'));
  assert.equal(result.evidence.androidQa.passed, false);
});

test('risk acceptance note only names evidence gates that remain unresolved', () => {
  const root = makeTempRepo();
  writeFixture(root, {
    providerApproved: false,
    privacyApproved: true,
    androidComplete: true,
    riskAccepted: true,
  });

  const result = buildCampOpsLiveReadinessResult({ rootDir: root, now: fixedNow });
  const riskNote = result.notes.find((note) => note.startsWith('Risk acceptance permits only a restricted closed field test'));

  assert.match(riskNote, /provider\/source approval/);
  assert.doesNotMatch(riskNote, /Android\/device QA/);
  assert.doesNotMatch(riskNote, /privacy\/storage approval/);
});

test('--json emits parseable JSON and writes the live readiness artifact', () => {
  const root = makeTempRepo();
  writeFixture(root, {
    providerApproved: false,
    privacyApproved: false,
    androidComplete: false,
  });

  let stdout = '';
  const exitCode = runCampOpsLiveReadinessCli({
    rootDir: root,
    args: ['--json'],
    stdout: {
      write(chunk) {
        stdout += chunk;
      },
    },
  });

  assert.equal(exitCode, 1);
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.internalBetaReady, true);
  assert.ok(fs.existsSync(path.join(root, '.smoke', 'campops-live-readiness-result.json')));
});
