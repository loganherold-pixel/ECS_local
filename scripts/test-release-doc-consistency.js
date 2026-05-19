const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(process.cwd(), relPath), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const checkoffs = read('docs/release/qa-system-checkoffs.md');
const audit = read('docs/release/readiness-gate-audit.md');
const ciGuard = read('docs/release/closed_field_test_ci_guard.md');
const smokeMatrix = read('docs/release/final-full-app-smoke-test-matrix.md');
const internalBetaEvidence = read('docs/campops/internal_beta_evidence.md');
const liveReadinessGates = read('docs/campops/live_readiness_gates.md');
const blockerBurndown = read('docs/campops/closed_field_test_blocker_burndown.md');
const rollout = read('docs/campops/rollout.md');
const productAcceptance = read('docs/campops/product_acceptance_review.md');
const preBetaReadiness = read('docs/campops/pre_beta_readiness.md');
const packageJson = read('package.json');

[
  'ready_with_restrictions',
  'restricted closed field testing only',
  'Provider readiness | Not approved for influence',
  'Privacy/storage approval | Approved for guarded closed-field only',
  'Closed field-test risk acceptance | Accepted for restricted test',
].forEach((expected) => {
  assert(
    checkoffs.includes(expected),
    `qa-system-checkoffs.md should preserve the current restricted release posture: ${expected}`,
  );
});

[
  'restricted closed field testing only',
  'This is not public release approval',
  'ready_with_restrictions',
  'risk_accepted_restricted_closed_field_test',
  'gate:dispatch-convoy-production',
  'Blocked by approvals',
  'gate:established-campgrounds-production',
  'Blocked by deployment/device evidence',
  'gate:bluetooth-power-obd2-production',
  'Blocked by real-hardware evidence',
  'gate:offline-navigation-production',
  'Blocked by Android no-network evidence',
  'gate:weather-production',
  'Blocked by provider/device evidence',
  'gate:garmin-inreach-production',
  'Blocked by provider/device evidence',
  'gate:auth-production',
  'Blocked by provider/device evidence',
  'gate:ecs-brief-production',
  'Blocked by producer/device evidence',
  'gate:incident-recovery-production',
  'Blocked by Android/field evidence',
  'gate:field-utilities-production',
  'Blocked by Android/degraded evidence',
  'gate:explore-trail-packs-production',
  'Blocked by Android/content evidence',
  'gate:fleet-production',
  'Blocked by Android/profile evidence',
  'gate:dashboard-production',
  'Blocked by Android/widget evidence',
  'test:dispatch-convoy-production',
  'test:established-campgrounds-production',
  'test:bluetooth-power-obd2-production',
  'test:offline-navigation-production',
  'test:weather-production',
  'test:garmin-inreach-production',
  'test:auth-production',
  'test:ecs-brief-production',
  'test:incident-recovery-production',
  'test:field-utilities-production',
  'test:explore-trail-packs-production',
  'test:fleet-production',
  'test:dashboard-production',
  'position-sharing privacy/product approval',
  'provider-health',
  'Android visible pin/popup/action evidence',
  'Android BLE, power station, EcoFlow BLE/cloud separation, OBD2 live/no-data/disconnect',
  'Android no-network offline route',
  'real provider source/freshness evidence',
  'real MapShare feed/device',
  'operator-confirmed command',
  'real auth provider signup/signin/signout',
  'Android cold/warm/offline startup',
  'Android top intelligence banner',
  'real live advisory producer dedupe',
  'Android Incident & Recovery workflow',
  'real coordinate packet',
  'Android Field Utilities',
  'offline/degraded Field Utilities',
  'Android Explore Trail Packs',
  'content review/moderation',
  'Android Fleet profile',
  'scale-ticket/profile evidence',
  'Android Dashboard widget',
  'live/stale/unavailable widget source-label evidence',
  'Shadow-only acceptable; not approved for influence',
  'Provider influence remains not approved',
  'test:release-approval-overrides',
  'test:pre-closed-field-gate',
  'is not waived by risk acceptance',
  'blocks forced AI assist, telemetry, and community publishing enablement',
  'Approved for guarded closed-field only',
  'Accepted for restricted test',
].forEach((expected) => {
  assert(
    audit.includes(expected),
    `readiness-gate-audit.md should align with current restricted posture: ${expected}`,
  );
});

assert(
  packageJson.includes('"gate:garmin-inreach-production"') &&
    packageJson.includes('"test:garmin-inreach-production"'),
  'package.json should expose Garmin/inReach production gate and regression scripts.',
);

assert(
  packageJson.includes('"gate:auth-production"') &&
    packageJson.includes('"test:auth-production"'),
  'package.json should expose Auth/session production gate and regression scripts.',
);

assert(
  packageJson.includes('"gate:ecs-brief-production"') &&
    packageJson.includes('"test:ecs-brief-production"'),
  'package.json should expose ECS Brief production gate and regression scripts.',
);

assert(
  packageJson.includes('"gate:incident-recovery-production"') &&
    packageJson.includes('"test:incident-recovery-production"'),
  'package.json should expose Incident & Recovery production gate and regression scripts.',
);

assert(
  packageJson.includes('"gate:field-utilities-production"') &&
    packageJson.includes('"test:field-utilities-production"'),
  'package.json should expose Field Utilities production gate and regression scripts.',
);

assert(
  packageJson.includes('"gate:explore-trail-packs-production"') &&
    packageJson.includes('"test:explore-trail-packs-production"'),
  'package.json should expose Explore Trail Packs production gate and regression scripts.',
);

[
  'not ready for closed field testing',
  'Risk acceptance is not accepted',
  'No release-blocking risk is currently accepted',
  'privacy/storage owner approval remains incomplete for closed field-test data posture',
].forEach((stale) => {
  assert(
    !audit.toLowerCase().includes(stale.toLowerCase()),
    `readiness-gate-audit.md should not retain stale blocked-posture wording: ${stale}`,
  );
});

[
  'risk-accepted restricted closed field test',
  'This is not public release approval',
  'Provider influence must remain off until real target-region evidence is accepted',
  'CampOps local debrief `localStorage` must be treated as unencrypted',
  'Dev-only CampOps visual QA route opened on device',
  'Run real provider-backed Navigate candidate validation',
].forEach((expected) => {
  assert(
    internalBetaEvidence.includes(expected),
    `internal_beta_evidence.md should reflect the current restricted evidence posture: ${expected}`,
  );
});

[
  'Closed-field-test readiness recommendation: **not ready**',
  'Android/device visual-state QA is incomplete',
  'No screenshots were captured',
  'Do not proceed to closed field test until',
].forEach((stale) => {
  assert(
    !internalBetaEvidence.toLowerCase().includes(stale.toLowerCase()),
    `internal_beta_evidence.md should not retain stale blocked-evidence wording: ${stale}`,
  );
});

[
  'Internal beta ready; restricted closed field test risk-accepted',
  'internal_beta_ready',
  'Android/device QA and guarded privacy/storage posture are complete for restricted validation',
  'Provider/source readiness is not approved for real recommendation influence',
  'Broad real trip/debrief rollout remains blocked',
].forEach((expected) => {
  assert(
    liveReadinessGates.includes(expected),
    `live_readiness_gates.md should align with current CampOps live-readiness posture: ${expected}`,
  );
});

[
  'closed field test blocked pending risk acceptance',
  'Android/device QA evidence is incomplete',
  'owner approval remains incomplete for saved camp and report/debrief data posture',
  'Closed field testing must not proceed until',
].forEach((stale) => {
  assert(
    !liveReadinessGates.toLowerCase().includes(stale.toLowerCase()),
    `live_readiness_gates.md should not retain stale pre-acceptance wording: ${stale}`,
  );
});

[
  'Closed field testing: risk-accepted restricted test',
  'risk_accepted_restricted_closed_field_test',
  'Provider readiness is not approved for target region/category influence',
  'passes as shadow-only acceptable when provider influence is not requested',
  'shadow_only_acceptable_not_approved_for_influence',
  'Complete for guarded QA-only restricted validation',
  'gate:pre-closed-field-test`: pass in evidence mode',
  'Passing those gates does not approve AI assist, telemetry, community publishing, provider influence, or public release',
].forEach((expected) => {
  assert(
    blockerBurndown.includes(expected),
    `closed_field_test_blocker_burndown.md should align with current restricted burn-down posture: ${expected}`,
  );
});

[
  'Closed field testing: blocked',
  'Android/device QA evidence incomplete',
  'Privacy/storage owner approval incomplete',
  'closed field testing remains blocked',
  'currently fails until evidence is complete',
].forEach((stale) => {
  assert(
    !blockerBurndown.toLowerCase().includes(stale.toLowerCase()),
    `closed_field_test_blocker_burndown.md should not retain stale blocked burn-down wording: ${stale}`,
  );
});

[
  'Restricted closed field test',
  'ready_with_restrictions',
  'risk_accepted_restricted_closed_field_test',
  'provider influence remains unapproved',
  'npm run gate:closed-field-test:json',
].forEach((expected) => {
  assert(
    rollout.includes(expected),
    `rollout.md should describe the current restricted closed-field path: ${expected}`,
  );
});

[
  'The command is expected to fail while',
  'while the current readiness status is intentionally blocked',
  'does not complete Android/device QA',
  'privacy/storage approval, or debrief owner approval complete',
].forEach((stale) => {
  assert(
    !rollout.toLowerCase().includes(stale.toLowerCase()),
    `rollout.md should not retain stale pre-acceptance rollout wording: ${stale}`,
  );
});

[
  'risk-accepted for the approved cohort/scope only',
  'Android/device QA and guarded privacy/storage pass for this packet',
  'provider influence remains shadow-only/unapproved',
  'real provider-backed route-line candidate validation remains unresolved',
].forEach((expected) => {
  assert(
    productAcceptance.includes(expected),
    `product_acceptance_review.md should describe the current restricted product posture: ${expected}`,
  );
});

[
  'Closed field test | `blocked`',
  'Internal beta evidence recommends not ready',
  'Android emulator/physical-device QA has not been completed',
  'Do not mark mobile QA complete without emulator or physical-device evidence.',
].forEach((stale) => {
  assert(
    !productAcceptance.toLowerCase().includes(stale.toLowerCase()),
    `product_acceptance_review.md should not retain stale blocked acceptance wording: ${stale}`,
  );
});

[
  'Historical Status',
  'current release packet is tracked',
  'risk-accepted for a restricted closed field test only',
  'At the time of this 2026-05-01 report',
].forEach((expected) => {
  assert(
    preBetaReadiness.includes(expected),
    `pre_beta_readiness.md should be labeled as historical: ${expected}`,
  );
});

assert(
  audit.includes('Public release is blocked'),
  'readiness-gate-audit.md should still make broad release blocking explicit.',
);

[
  'ready_with_restrictions',
  'risk_accepted_restricted_closed_field_test',
  'restricted closed-field approval only',
  'Latest local audit: 2026-05-17',
  'provider influence remains not approved',
  'provider-readiness stage recorded as `shadow_only_acceptable_not_approved_for_influence`',
  'that status is not provider influence approval',
  'release approval override guard',
  'forced AI assist, telemetry, or community publishing enablement must fail closed',
  'npm run gate:closed-field-test:json',
  'npm run gate:pre-closed-field-test',
].forEach((expected) => {
  assert(
    ciGuard.includes(expected),
    `closed_field_test_ci_guard.md should align with current restricted gate output: ${expected}`,
  );
});

[
  'expected to fail while',
  'closed field testing is blocked',
  'no longer records the status as blocked',
  'Risk acceptance is present but not accepted',
  'intentionally blocked',
].forEach((stale) => {
  assert(
    !ciGuard.toLowerCase().includes(stale.toLowerCase()),
    `closed_field_test_ci_guard.md should not retain stale blocked-gate wording: ${stale}`,
  );
});

[
  'risk-accepted for restricted closed field testing only',
  'ready_with_restrictions',
  'risk_accepted_restricted_closed_field_test',
  'Provider readiness: not approved for real target-region/category influence',
  'Passing this smoke matrix does not waive public release',
].forEach((expected) => {
  assert(
    smokeMatrix.includes(expected),
    `final-full-app-smoke-test-matrix.md should align with current restricted gate output: ${expected}`,
  );
});

[
  'Current release readiness remains **blocked for closed field testing**',
  'closed field testing remains blocked by Android/device QA',
  'unaccepted risk acceptance',
  'Risk acceptance present but not accepted',
].forEach((stale) => {
  assert(
    !smokeMatrix.toLowerCase().includes(stale.toLowerCase()),
    `final-full-app-smoke-test-matrix.md should not retain stale blocked release wording: ${stale}`,
  );
});

assert(
  packageJson.includes('"test:release-doc-consistency"'),
  'package.json should expose the release doc consistency regression script.',
);

assert(
  packageJson.includes('"test:release-approval-overrides"'),
  'package.json should expose the release approval override regression script.',
);

assert(
  packageJson.includes('"test:pre-closed-field-gate"'),
  'package.json should expose the aggregate pre-closed-field regression script.',
);

assert(
  packageJson.includes('"test:dispatch-convoy-production"'),
  'package.json should expose the Dispatch/Convoy production regression script.',
);

assert(
  packageJson.includes('"test:established-campgrounds-production"'),
  'package.json should expose the established campgrounds production regression script.',
);

assert(
  packageJson.includes('"gate:established-campgrounds-production"'),
  'package.json should expose the established campgrounds production gate script.',
);

assert(
  packageJson.includes('"test:bluetooth-power-obd2-production"'),
  'package.json should expose the Bluetooth/Power/OBD2 production regression script.',
);

assert(
  packageJson.includes('"gate:bluetooth-power-obd2-production"'),
  'package.json should expose the Bluetooth/Power/OBD2 production gate script.',
);

assert(
  packageJson.includes('"test:offline-navigation-production"'),
  'package.json should expose the Offline Navigation production regression script.',
);

assert(
  packageJson.includes('"gate:offline-navigation-production"'),
  'package.json should expose the Offline Navigation production gate script.',
);

assert(
  packageJson.includes('"test:weather-production"'),
  'package.json should expose the Weather production regression script.',
);

assert(
  packageJson.includes('"gate:weather-production"'),
  'package.json should expose the Weather production gate script.',
);

assert(
  packageJson.includes('"gate:release-approval-overrides"'),
  'package.json should expose the release approval override gate script.',
);

assert(
  packageJson.includes('"test:fleet-production"'),
  'package.json should expose the Fleet production regression script.',
);

assert(
  packageJson.includes('"gate:fleet-production"'),
  'package.json should expose the Fleet production gate script.',
);

assert(
  packageJson.includes('"test:dashboard-production"'),
  'package.json should expose the Dashboard production regression script.',
);

assert(
  packageJson.includes('"gate:dashboard-production"'),
  'package.json should expose the Dashboard production gate script.',
);

console.log('release doc consistency checks passed');
