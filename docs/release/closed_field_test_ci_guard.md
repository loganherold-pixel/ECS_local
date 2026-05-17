# Closed Field-Test Readiness Guard

This repository does not currently define a `.github/workflows` CI pattern. Until a release-only or manually triggered CI workflow exists, closed field-test readiness visibility is provided by the local release guard scripts documented here.

This guard is intentionally separate from normal internal beta development. It is expected to fail while `docs/campops/closed_field_test_readiness.md` says closed field testing is blocked.

## Release Guard Commands

Run these commands before any closed field-test build review:

```bash
npm run smoke
npm run gate:closed-field-test
```

Or run the aggregate guard:

```bash
npm run gate:pre-closed-field-test
```

`npm run smoke` is a headless app inspection check. It must not start Expo, launch Expo Go, use a simulator/emulator/device, or require network.

`npm run gate:closed-field-test` is the static readiness gate. It reads `docs/campops/closed_field_test_readiness.md`, writes `.smoke/closed-field-test-readiness-result.json`, and fails when closed field testing is blocked.

## What This Guard Does Not Approve

Passing `npm run smoke` does not approve closed field testing. It only confirms the app can be inspected headlessly.

Passing the static readiness gate, if it happens in the future, still does not replace:

- Android/device QA evidence.
- Provider readiness approval for a target region/category.
- AI assist real-output review for the exact model/config.
- Telemetry sink and privacy approval.
- Community publishing privacy/moderation approval.

## Current Expected Result

Current expected result: blocked.

The aggregate guard is expected to fail until closed field-test readiness evidence is complete and `docs/campops/closed_field_test_readiness.md` no longer records the status as blocked.

This failure blocks closed field-test promotion only. It does not block normal internal beta development, fixture work, or documentation updates.

Latest local audit: 2026-05-03. Evidence mode and risk-acceptance mode both remain blocked. Risk acceptance is present but not accepted, so Android/device QA, provider readiness, and privacy/storage evidence are not waived.

## Future CI Pattern

If CI is added later, use a manually triggered, release-only, or informational workflow for this guard. Do not attach it to every normal commit while closed field testing is intentionally blocked.

A future workflow should run:

```bash
npm run smoke
npm run gate:closed-field-test
```

The workflow should clearly state:

- It is not Android/device QA.
- It does not approve provider influence.
- It does not approve AI assist.
- It does not approve telemetry.
- It does not approve community publishing.
