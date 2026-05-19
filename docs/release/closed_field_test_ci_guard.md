# Closed Field-Test Readiness Guard

This repository does not currently define a `.github/workflows` CI pattern. Until a release-only or manually triggered CI workflow exists, closed field-test readiness visibility is provided by the local release guard scripts documented here.

This guard is intentionally separate from normal internal beta development. In the current release packet, it is expected to report `ready_with_restrictions` / `risk_accepted_restricted_closed_field_test` and must be treated as restricted closed-field approval only.

## Release Guard Commands

Run these commands before any closed field-test build review:

```bash
npm run smoke
npm run gate:closed-field-test:json
```

Or run the aggregate guard:

```bash
npm run gate:pre-closed-field-test
```

`npm run smoke` is a headless app inspection check. It must not start Expo, launch Expo Go, use a simulator/emulator/device, or require network.

`npm run gate:closed-field-test:json` is the static readiness gate. It reads `docs/campops/closed_field_test_readiness.md`, writes `.smoke/closed-field-test-readiness-result.json`, and reports whether the current packet is blocked, ready, or ready only with restrictions.

`npm run gate:pre-closed-field-test` is the aggregate evidence-mode guard. For the current restricted packet it may pass with the provider-readiness stage recorded as `shadow_only_acceptable_not_approved_for_influence`; that status is not provider influence approval. The aggregate also runs the release approval override guard so forced AI assist, telemetry, or community publishing enablement must fail closed unless the matching approval evidence exists.

## What This Guard Does Not Approve

Passing `npm run smoke` does not approve closed field testing. It only confirms the app can be inspected headlessly.

Passing the static readiness gate with `ready_with_restrictions` still does not replace:

- Android/device QA evidence.
- Provider readiness approval for a target region/category.
- AI assist real-output review for the exact model/config.
- Telemetry sink and privacy approval.
- Community publishing privacy/moderation approval.

## Current Expected Result

Current expected result: `ready_with_restrictions` / `risk_accepted_restricted_closed_field_test`.

The static gate may pass only for the approved restricted cohort, region labels, route labels, scenario labels, expiration window, and feature posture recorded in `docs/campops/closed_field_test_risk_acceptance.md`.

The aggregate guard may pass only while the restricted evidence posture remains intact. Provider influence is still expected to be `shadow_only_acceptable_not_approved_for_influence`, AI assist remains disabled unless separately approved, telemetry remains disabled unless separately approved, and community publishing remains disabled.

Any result other than `ready_with_restrictions` or `risk_accepted_restricted_closed_field_test` should block closed-field promotion until reviewed.

Latest local audit: 2026-05-17. Risk acceptance is accepted for restricted testing only. Android/device QA is complete for the current QA packet, provider influence remains not approved, guarded privacy/storage is approved for closed-field only, AI assist remains disabled unless separately approved, telemetry remains disabled unless separately approved, and community publishing remains disabled.

## Future CI Pattern

If CI is added later, use a manually triggered, release-only, or informational workflow for this guard. Do not attach it to every normal commit; the result reflects release evidence posture, not ordinary development readiness.

A future workflow should run:

```bash
npm run smoke
npm run gate:closed-field-test:json
```

The workflow should clearly state:

- It is not Android/device QA.
- It does not approve provider influence.
- It does not approve AI assist.
- It does not approve telemetry.
- It does not approve community publishing.
