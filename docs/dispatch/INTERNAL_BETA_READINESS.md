# Dispatch Internal Beta Readiness

Status: evaluated by `npm run gate:dispatch-internal-beta`.

This readiness gate is Dispatch-specific. It is intended to answer whether the Dispatch tab is safe to enable for controlled ECS internal beta users. It does not approve Dispatch for public release or closed-field-test release.

## What The Gate Checks

| Gate | Required evidence |
| --- | --- |
| Route/screen | Primary Dispatch tab route exists, imports `DispatchCadCommandCenter`, is registered as Dispatch, and is protected by the tab error boundary. |
| Module imports | Dispatch source files have no missing relative module imports. |
| Feature flags | Sensitive or incomplete systems default off: team position sharing, agency ingestion, external dispatch integration, public hazard publishing, automated SOS, live radio/network integrations, and demo data. |
| Recovery action | The primary action is Recovery, opens the local Recovery CAD panel, includes required categories, and creates a local CAD event. |
| CAD event contract | Recovery CAD events normalize with id, createdAt, category, severity, note, location status, source, status, and minimal profile/vehicle references. |
| Mock/live ambiguity | Mock data is blocked outside explicit dev/test mode, and user copy says local reports do not contact emergency services or publish externally. |
| Profile setup | Dispatch profile setup gate exists for callsign/name and vehicle identity when required. |
| Location failure | GPS permission or capture failure still allows a local report marked Location unavailable. |
| Modal style | Dispatch modals use `ECSModalShell` or an approved ECS local equivalent. |
| Static checks | `npx tsc --noEmit --pretty false` passes and `npm run lint` passes when available. |

## Readiness Boundary

Internal beta ready means the Dispatch tab can be exercised by controlled internal testers with sensitive systems default-off and local/internal behavior clearly labeled.

Closed-field-test ready remains false until separate Android/device QA evidence, privacy/storage approval, provider/source validation, and explicit product/safety/privacy/engineering risk acceptance are complete.

Public release ready remains false while external Dispatch, team sharing, public hazard publishing, automated SOS, agency ingestion, and live radio/network integrations are incomplete or disabled.

## Run

```sh
npm run gate:dispatch-internal-beta
```

For machine-readable output:

```sh
npm run gate:dispatch-internal-beta:json
```

The script writes `.smoke/dispatch-internal-beta-readiness-result.json` with pass/fail status, active blockers, and exact remediation items.
