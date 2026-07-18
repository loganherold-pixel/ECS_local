# ECS repaired-defect runtime validation package

Last reviewed: 2026-07-16

This package is the repeatable manual collection plan for the repaired Dashboard Weather, Terrain Risk, GPS guidance alignment, Draw Route, MVUM and Route Geometry, Dispatch, and Explore behaviors.

It extends the existing runtime-regression device-plan lane. It is not device evidence, a release-evidence submission, reviewer acceptance, or production approval.

## Safety and acceptance boundary

Every generated package has these non-acceptance fields:

- `executionClaim: plan_only_not_executed`
- `reviewDecision: pending`
- `productionApproval: not_granted_by_runtime_validation`
- procedure `status: not_executed`
- procedure `acceptanceState: not_submitted`
- procedure and scenario `actualResult.executionStatus: not_run`
- registry mapping `canAutoResolveRequirement: false`
- registry mapping `submissionCreated: false`

Generation reads and validates `config/release-evidence-registry.json`. It does not write that registry, append a submission, change a requirement status, accept evidence, or change production approval.

The authoritative registry remains responsible for later collection, reviewer acceptance, expiry, build/provider matching, and production-owner approval. A procedure can reference several requirements with different scopes; one capture must not be represented as satisfying a broader requirement unless every required environment, provider/device, scenario, platform, binding, and reviewer condition was actually met.

## Commands

Generate an unbound procedure template:

```powershell
npm run generate:runtime-validation-package
```

Default outputs:

- `.smoke/verification/runtime-validation-package.json`
- `.smoke/verification/runtime-validation-package.md`

All JSON and Markdown outputs are restricted to `.smoke/verification`. The CLI rejects attempts to target the release registry, source files, documentation, or any other repository path.

An unbound package deliberately contains null build, binary, platform, OS, device, and provider fields and has status `required_before_execution`. Do not use it to collect evidence.

Before a runtime session, record provenance for the exact release binary. The artifact must correspond to the exact source commit used for the binary; do not bind a dirty working tree or a different build to the current HEAD.

```powershell
$env:GITHUB_SHA = (git rev-parse HEAD).Trim()
npm run verify:artifact -- --artifact artifacts/release/app-release.apk --command-id release-binary-build --artifact-id supplied-release-artifact --artifact-kind release-binary --expected-type file --workspace-id root --artifact-audience release_candidate --output .smoke/verification/android-release-provenance.json
```

Then generate one bound package for that binary and platform:

```powershell
node scripts/runtime-regression/runtime-validation-package.mjs --artifact-provenance .smoke/verification/android-release-provenance.json --platform android --os-version android_15 --device-model pixel_8_pro --provider-environment provider_staging --output .smoke/verification/runtime-validation-android.json --summary-output .smoke/verification/runtime-validation-android.md
```

The CLI also accepts those seven values positionally in the displayed order for Windows npm versions that consume unknown named options before forwarding them.

Use safe descriptive OS and model values only. Never use a serial, IMEI, UUID, advertising identifier, push token, hostname, URL, secret, or provider credential. Generate a separate package for each Android or iOS artifact. Android and iOS builds must not share a digest unless they are genuinely the same artifact bytes and provenance, which is not expected for native binaries. Web-only checks may supplement provider or routed-surface review, but they do not replace this native package.

The bound package is still `collection_ready_not_executed`; generation never changes an actual result.

Run the focused package contract test:

```powershell
npm run test:runtime-validation-package
```

Run the existing device-plan and evidence-registry checks:

```powershell
npm run test:runtime-regression:device-plan
npm run test:runtime-regression-lane-system
npm run test:release-evidence-registry
npm run test:verification-artifact-sanitizer
npm run report:release-evidence
```

## Procedure contract

Every procedure includes:

| Field | Meaning |
| --- | --- |
| `evidenceId` | Stable runtime-validation procedure identity, distinct from authoritative registry IDs |
| `exactBuildSha` | Exact 40-character commit read from release-binary provenance; null in an unbound template |
| `binaryArtifactDigest` | SHA-256 digest read from the release-binary provenance artifact; null in an unbound template |
| `platform` | Android or iOS for the exact native binary |
| `osVersion` | Safe descriptive OS/version value, not a device identifier |
| `device.model` | Safe model name; `hardwareIdentifierRecorded` is always false |
| `providerEnvironment` | Safe symbolic environment such as `provider_staging`, never a URL or credential |
| `scenarioSteps` | Ordered actions and per-step expected results for every requested scenario |
| `expectedResult` | Overall deterministic or presentation expectation |
| `actualResult` | Unset collection fields with `executionStatus: not_run` |
| `sanitizedScreenshotRequirements` | Required visual states and redaction constraints |
| `sanitizedLogRequirements` | Allowlisted diagnostic facts and prohibited raw content |
| `privacyRestrictions` | Restricted-storage, redaction, metadata-stripping, and secret-handling rules |
| `reviewer` | Required registry-derived roles; reviewer name and timestamp remain unset; decision remains pending |
| `expirationRevalidationPolicy` | Registry-derived maximum age and build/provider/migration revalidation triggers |
| `releaseEvidenceBindings` | Read-only references to current authoritative requirements with exact coverage limitations |

The generator fails closed when:

- artifact provenance is missing from a partially bound package;
- provenance is not `ecs.verification-provenance-artifact.v2` for a `release_candidate` `supplied-release-artifact` of kind `release-binary`;
- the exact source commit or SHA-256 digest is absent;
- platform, OS version, device model, or provider environment is absent;
- a hardware identifier, URL, path, or secret marker appears in context fields;
- a procedure references a registry requirement that no longer exists;
- the package does not contain exactly the seven primary repaired-defect procedures.

## Procedure inventory

| Procedure | Required scenarios |
| --- | --- |
| Dashboard live weather | online live provider; provider timestamp; permission grant/deny/recovery; foreground refresh; offline last-good cache |
| Terrain Risk | imported route with elevation; active guidance; progress movement; orientation change; route without elevation |
| GPS route alignment | on-route simulation; off-route deviation; switchback or parallel segment; poor accuracy; offline guidance |
| Draw Route | draw points; immediate pre-preview line; undo/redo; preview; cancel; map-style change |
| MVUM and Route Geometry | mutually exclusive selection with independent lifecycle/cancellation; zoom eligibility; rapid pan/supersession; online load; valid empty; provider failure/retry; offline cache hit/miss |
| Dispatch | CommandDock route; canonical implementation identity; local command mutation/dedupe; offline state and conditional replay; active-expedition switch |
| Explore | qualified guidance-ready route and exclusions; filter reset/migration; detail geometry promotion; route preview; Navigate handoff gate |

The JSON and generated Markdown contain the detailed actions, terminal expectations, sanitized evidence requirements, actual-result blanks, reviewer fields, and expiry fields.

## Authoritative registry integration

Mappings are intentionally conservative:

| Procedure | Registry references | Boundary |
| --- | --- | --- |
| Dashboard weather | conditional `provider_weather`, conditional `provider_fallback`, conditional `mobile_permissions`, conditional `mobile_background_restoration`, `field_build_provenance` | Forecast validation does not by itself prove the registry's alert path, all-provider-set fallback, the complete native-permission set, or full route restoration. |
| Terrain Risk | conditional `field_active_guidance`, `field_build_provenance` | No dedicated terrain-profile registry requirement exists. The broader guidance scenario still needs completion and cancellation evidence. |
| GPS alignment | conditional `field_active_guidance`, conditional `mobile_offline_navigation`, conditional `field_no_network`, `field_build_provenance` | The complete offline-navigation scenario, both native platforms, and the privacy review for trip traces remain separate. |
| Draw Route | conditional `provider_mapbox`, conditional `mobile_map_responsiveness`, `field_build_provenance` | No dedicated draft-lifecycle registry requirement exists. |
| MVUM and Route Geometry | conditional `provider_route_catalog`, `provider_mapbox`, `provider_fallback`, `mobile_map_responsiveness`; `field_build_provenance` | Catalog search/pagination, Mapbox geocoding/directions, and reviewed performance thresholds remain broader than the overlay capture. |
| Dispatch | conditional `dispatch_outbox_replay`, `field_build_provenance` | Local single-client mutation does not prove multi-client ordering, acknowledgments, or replay. Replay mapping applies only with isolated identities, reconnect, migration binding, and Supabase staging. |
| Explore | conditional `provider_route_catalog`, `provider_mapbox`; related-only `provider_legal_access`; `field_build_provenance` | Geometry is not legal-access evidence. Restricted geometry and safety exclusions remain enforced. |

Reviewer roles and revalidation policies are copied from the live validated registry each time the package is generated. This prevents the checklist from silently drifting from current release requirements.

## Evidence collection and privacy

Raw device screenshots, screen recordings, GPS traces, route geometry, logcat, native logs, provider request or response bodies, Supabase payloads, and account/expedition content are not approved verification uploads. Keep them in privacy-approved restricted storage.

Before review:

1. Crop or redact coordinates, bounds, route/trip names, expedition text, member/account/vehicle identifiers, map labels that reveal a private location, and device identifiers.
2. Strip screenshot and video metadata/EXIF.
3. Run the ECS diagnostic sanitizer on logs and manually inspect the output for secrets, auth/session material, signed URLs, exact locations, raw payloads, and private paths.
4. Build a restricted evidence packet outside the repository.
5. Record only the packet SHA-256 digest, a safe symbolic external reference, the exact binary bindings, a safe actual-result summary, and the required reviewer decision in the later registry workflow.

Uploaded verification metadata retains no raw field data. Current artifact retention is 14 days for release-candidate metadata and 3 days for restricted-field-test metadata. Registry revalidation is separate: mapped device and field evidence is generally per build with a 30-day maximum; provider evidence revalidates on provider change with a 30-day maximum; migration-bound Dispatch evidence revalidates on migration change with a 30-day maximum.

No procedure-generated expiry window begins until evidence has actually been collected and dated.
