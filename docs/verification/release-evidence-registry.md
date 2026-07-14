# ECS Release Evidence Registry

Date: 2026-07-13

## Authority

`config/release-evidence-registry.json` is the authoritative declaration and acceptance registry for external ECS release evidence. It supersedes static readiness prose as the machine-readable source for hardware, provider, privacy, field, multi-client, deployed-RLS, and owner-approval blockers.

Legacy readiness documents, test plans, `.smoke` files, screenshots, and capability `evidenceBlockers` remain orientation only. They are never imported or accepted automatically. The checked-in registry begins with 67 requirements, no submissions, and production approval pending.

## Contract

The registry uses `ecs-release-evidence-registry-v1`. Every requirement declares:

- Stable evidence ID, capability, feature, evidence class, scenario, environment, platform, and device/provider.
- Required build SHA, release artifact digest, migration digest, provider environment, and device-model bindings.
- Initial status, revalidation mode and maximum age, owner role, reviewer role, and bounded safe notes.

Evidence submissions are separate records. A submission includes collection and expiration timestamps, a privacy-safe artifact digest/reference, reviewer role, explicit decision, and only allowlisted metadata. Raw logs, coordinates, traces, provider payloads, contacts, credentials, command lines, and authentication data are prohibited.

The six lifecycle statuses are `missing`, `planned`, `collected`, `accepted`, `rejected`, and `expired`. Only `accepted` evidence with an accepted reviewer decision and every required binding matched resolves its own requirement. A rejected, expired, wrong-build, wrong-migration, wrong-provider, malformed, or static-declaration artifact remains unresolved.

Privacy and owner evidence classes are not interchangeable with technical tests. Production approval is a separate registry decision and is never inferred from complete technical evidence.

## Reporting

Generate a privacy-safe local report without treating unresolved external evidence as a command failure:

```bash
npm run report:release-evidence
```

Run the release gate directly:

```bash
npm run gate:release-evidence-registry
```

The report is written to `.smoke/verification/release-evidence-report.json` with schema `ecs.verification-release-evidence-artifact.v1`. It lists exact missing, planned, collected, expired, wrong-build, accepted, rejected, owner-pending, and unresolved IDs. Release-candidate verification runs the gate through `ecs-evidence-v1`; unresolved requirements produce `blocked_external`, while malformed registry data or internal errors produce `failed`.

For release-candidate runs, an optional supplied binary is fingerprinted before the lane. Its privacy-safe provenance must use `ecs.verification-provenance-artifact.v2` and match the current commit before the registry may use its artifact digest. Provider-bound evidence is compared with the allowlisted `ECS_RELEASE_PROVIDER_ENVIRONMENT` repository variable. Missing target bindings remain unresolved; stale or malformed provenance fails internally.

The release artifact is safe metadata, not field evidence. Original field captures must remain in an approved restricted system. Only a reviewed digest and safe reference may enter the registry.

## Current Requirement Groups

| Group | Count | Required action |
| --- | ---: | --- |
| Mobile/device | 9 | Physical Android/iOS device and performance collection |
| Automotive | 5 | Real head unit/native plugin validation and safety review |
| Bluetooth/telemetry | 9 | Real EcoFlow, Mopeka, VPeak, BLE, reconnect, and sustained-stream validation |
| Garmin | 5 | Real device/provider pairing, transfer, permission, disconnect, and offline validation |
| Providers | 10 | Approved provider-environment shadow/live evidence |
| Dispatch | 6 | Two isolated clients, restricted-location review, and deployed RLS evidence |
| Supabase/RLS | 4 | Deployed migration, two-identity RLS, rollback, and policy inspection evidence |
| Privacy | 6 | Explicit privacy-board review |
| Field | 7 | Closed-field release-build journeys and build provenance |
| Owner approval | 6 | Explicit product, engineering, QA, privacy, safety, and field-operations decisions |

## Evidence Update Procedure

1. Collect evidence against a named release build and approved environment without committing raw field data.
2. Produce an approved privacy-safe artifact and SHA-256 digest outside the repository.
3. Have the declared reviewer evaluate the evidence.
4. Add one schema-valid submission for its exact evidence ID with the explicit decision and required bindings.
5. Run `npm run test:release-evidence-registry` and `npm run report:release-evidence`.
6. Review the diff and exact resolved/unresolved change. Do not accept a submission merely to clear a release gate.

Revalidation is required when the declared maximum age expires or the relevant build, migration set, provider environment, device model, or release changes.
