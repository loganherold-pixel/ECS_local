# Offline Failure Drill Android Evidence

This document explains how to collect production-unblock evidence for the Offline Failure Drill.

Do not fake Android evidence. Unit tests do not satisfy the Android no-network evidence requirement; fixture manifests and local cache profiles do not satisfy it either.

## Purpose

The evidence run proves that the Offline Failure Drill classifies capabilities truthfully while an Android device or emulator has no network. Production remains blocked until the evidence manifest validates real Android artifacts, runtime no-network assertion, no remote update or sync success, and owner acceptance.

## Fixture Profiles

Cache fixture profiles live in `fixtures/offline-failure-drill/`:

- `available`
- `partial`
- `stale`
- `unavailable`
- `manual_fallback`

These profiles seed deterministic local cache states only. They are not real Android evidence.

## Required Artifacts

Each accepted run must provide:

- Android device or emulator identifier and app build metadata
- cache manifest used for the run
- drill result JSON exported from the app/test harness
- screenshots of the Offline Failure Drill results
- logs from the no-network run
- runtime assertion that the app observed offline mode
- confirmation that provider updates, weather refresh, team sync, and live sync did not succeed
- owner acceptance with reviewer, timestamp, and notes

Raw screenshots and logs should stay in ignored `.smoke/`, `.qa/`, `qa-evidence/`, or controlled external storage unless specifically sanitized for review.

## Harness

Use the runner to create and validate the manifest shape:

```powershell
node scripts/run-offline-failure-drill-android-evidence.mjs --profile=available --out=.smoke/offline-failure-drill-android-evidence
```

That default run is expected to remain blocked because it does not include real screenshots, logs, drill result JSON, runtime offline confirmation, or owner acceptance.

For a real evidence run, operators must disable Android/emulator networking using the repo's current Android QA convention, open the Offline Failure Drill, confirm the app/runtime reports offline, capture screenshots and logs, export the drill result, and then run the harness with explicit artifact paths:

```powershell
node scripts/run-offline-failure-drill-android-evidence.mjs `
  --real `
  --profile=available `
  --app-observed-offline `
  --system-network-disabled `
  --runtime-network-probe=offline `
  --provider-update-attempted `
  --live-sync-attempted `
  --weather-refresh-attempted `
  --team-sync-attempted `
  --dispatch-replay-attempted `
  --dispatch-replay-local-only `
  --capability-count=8 `
  --cache-manifest=.smoke/offline-failure-drill-android-evidence/cache-manifest.json `
  --drill-result=.smoke/offline-failure-drill-android-evidence/drill-result.json `
  --screenshot=.smoke/offline-failure-drill-android-evidence/offline-drill.png `
  --log=.smoke/offline-failure-drill-android-evidence/offline-drill.log `
  --owner-accepted `
  --accepted-by="Owner Name"
```

Do not pass success flags such as `--provider-update-succeeded`, `--live-sync-succeeded`, `--weather-refresh-succeeded`, or `--team-sync-succeeded` during a no-network production evidence run. Those make the manifest fail validation.

## Production Gate

Validate the current manifest with:

```powershell
npm run gate:offline-failure-drill-production:json
```

To validate a non-default manifest:

```powershell
node scripts/check-offline-failure-drill-production-readiness.mjs --json --evidence-manifest=.smoke/offline-failure-drill-android-evidence/manifest.json
```

The gate remains blocked when the manifest is missing, malformed, fixture-only, synthetic, missing artifacts, observed online, shows a remote update or sync succeeded, or lacks owner acceptance.

## Owner Acceptance

Owner acceptance must be recorded only after the real Android no-network artifacts have been reviewed. Acceptance should include the accepting owner, timestamp, scope, and any caveats. Fixture-shaped evidence must not be accepted for production.
