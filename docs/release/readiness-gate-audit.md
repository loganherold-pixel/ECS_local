# ECS Release Readiness Gate Audit

Date: 2026-05-03

## Publish Status

ECS is **not ready for closed field testing** in the current build.

The executable gates, readiness docs, and risk-acceptance posture agree: closed field testing remains blocked until required evidence gates pass or a restricted risk acceptance is explicitly accepted by product, safety, privacy, and engineering.

## Gate Results

| Gate | Result | Notes |
| --- | --- | --- |
| `npm run test:release-readiness` | Passed | Release diagnostic wiring, checklist sections, risk summary, scenario matrix, selectors, and package script coverage are present. |
| `npm run smoke` | Passed with sandbox-skipped child stages | Project inspection passed. Expo config, child-process typecheck, child-process lint, and export were skipped by local `spawn EPERM`; direct `tsc` and lint were run separately. |
| `npm run gate:closed-field-test` | Blocked | Android/device QA, provider readiness, and privacy/storage approval remain blockers. |
| `npm run gate:closed-field-test-risk-acceptance` | Not accepted | Status and decision are not accepted; expiration date and rollback command/path are not actionable. |
| `npm run gate:pre-closed-field-test` | Blocked | Evidence-mode aggregate failed Android QA, provider readiness, privacy/storage, and closed-field-test stages. |
| `npm run gate:pre-closed-field-test:risk-accepted` | Blocked | Risk acceptance is not accepted, so evidence gates are not waived. |
| `npm run test:closed-field-gate` | Passed | Closed-field readiness gate behavior is covered by the contract script. |
| `npx tsc --noEmit --pretty false` | Passed | Direct TypeScript check passed. |
| `npm run lint` | Passed | Expo lint completed successfully. |

## Blockers

- Closed field-test status is explicitly blocked in `docs/campops/closed_field_test_readiness.md`.
- Android/device QA evidence is incomplete.
- Provider readiness is not approved for real target-region/category influence.
- Privacy/storage owner approval remains incomplete for closed field-test data posture.
- Risk acceptance is present but not accepted, and it does not override incomplete evidence gates.

## Warnings

- `npm run smoke` currently reports a pass while child-process stages are skipped by the local sandbox. Treat direct `npx tsc --noEmit --pretty false` and `npm run lint` as the authoritative local type/lint checks for this audit.
- AI assist passes only in the restricted posture where AI assist remains disabled.
- Provider influence, telemetry, and community publishing must remain disabled unless separately approved.

## Accepted Risks

No release-blocking risk is currently accepted for closed field testing.

`docs/campops/closed_field_test_risk_acceptance.md` records draft sign-off fields, but the document status and decision status are `not accepted`, and required scope fields are incomplete. It must not be treated as permission to proceed.

## Passed Gates

- Release-readiness diagnostic wiring is present:
  - `masterReleaseChecklist`
  - `releaseRiskSummary`
  - `releasePolishAuditTypes`
  - `releaseReadinessChecks`
  - runtime smoke store/selectors/checks
- Runtime smoke checks still run and write `.smoke/smoke-result.json`.
- Closed-field gate contract tests pass.
- TypeScript and lint pass directly.

## Required Follow-Up

1. Complete Android/device QA evidence for core CampOps recommendation states.
2. Approve provider readiness for the exact target region/category before provider influence.
3. Complete privacy/storage owner approval for the closed field-test data posture.
4. Keep AI assist disabled unless exact model/config real-output review is approved.
5. Define approved region, route, and scenario labels without private coordinates.
6. Record actionable expiration and rollback path if risk acceptance is used.
7. Re-run the aggregate pre-closed-field-test gate before any closed field-test promotion.
