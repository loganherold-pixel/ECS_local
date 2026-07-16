# ECS behavioral runtime regression lanes

The runtime regression lane is a deterministic behavioral check, not a production, device, provider, GPS, Mapbox, or field approval. It complements the existing ECS verification policy and preserves external evidence gaps explicitly.

## Lanes

| Lane | Runner | Scope | Default artifacts |
| --- | --- | --- | --- |
| `test:runtime-regression:fast` | `scripts/runtime-regression/run-runtime-regression-lane.mjs --lane fast` | Direct domain and presentation behavior for Dashboard Weather, Terrain Risk, Draw Route, guidance projection, MVUM, and ECS Route Geometry | `.smoke/verification/runtime-regression-fast.json` and `.md` |
| `test:runtime-regression:integration` | `scripts/runtime-regression/run-runtime-regression-lane.mjs --lane integration` | Mounted-route/store/provider integration for Dispatch, Explore, and primary surface controls | `.smoke/verification/runtime-regression-integration.json` and `.md` |
| `test:runtime-regression:device-plan` | `scripts/runtime-regression/generate-device-plan.mjs` | Manual evidence plan for behavior that cannot be proven by deterministic Node execution, including the registry-cross-validated repaired-defect procedure package | `.smoke/verification/runtime-regression-device-plan.json` and `.md` |

All child processes run with `CI=1`, `TZ=UTC`, `ECS_TEST_NETWORK=disabled`, a stable test seed, and a fixed `ECS_TEST_NOW`. The normal CI path enforces a hard child-process timeout. Managed environments that prohibit nested process creation use an isolated worker fallback that is forcibly terminated at the same deadline, including for a synchronous hang. A missing runner, malformed result, nonzero child exit, or timeout becomes a terminal failed scenario with a safe code; it cannot disappear behind an indefinite lane process.

## Machine-readable result contract

Every scenario record contains:

| Field | Contract |
| --- | --- |
| `scenario` | Stable symbolic scenario ID |
| `status` | `passed`, `failed`, `timed_out`, `skipped`, `blocked_external`, or `device_evidence_required` |
| `durationMs` | Nonnegative bounded integer |
| `sourceFixtureProvider` | Symbolic fixture/provider ID; no coordinates, query data, credentials, or raw payload |
| `failureSafeCode` | `null` only for pass; otherwise a registered bounded lowercase safe code |
| `deviceEvidenceStillRequired` | Explicit symbolic evidence IDs, including real-device/provider gaps after a deterministic pass |
| `qualifiedTestIdentity` | Unique qualified behavioral test identity |

Scenario, fixture/provider, device-evidence, and qualified-test identifiers are checked against the lane's explicit registry. Adding a new scenario requires registering its symbolic IDs; arbitrary coordinate, hostname, credential, geohash, UUID, or opaque token shapes fail closed instead of reaching an artifact.

The aggregate report also records child-run status and duration. It deliberately sets `productionApproval` to `not_granted_by_runtime_regression`.

## Verification policy wiring

The repository registers these package scripts:

```json
{
  "test:runtime-regression:fast": "node ./scripts/runtime-regression/run-runtime-regression-lane.mjs --lane fast",
  "test:runtime-regression:integration": "node ./scripts/runtime-regression/run-runtime-regression-lane.mjs --lane integration",
  "test:runtime-regression:device-plan": "node ./scripts/runtime-regression/generate-device-plan.mjs",
  "test:runtime-regression-lane-system": "node ./scripts/test-runtime-regression-lane-system.mjs"
}
```

The verification policy registers `runtime-regression-fast` in `pr-fast`, `full-nightly`, and `release-candidate`. It registers `runtime-regression-integration` in `affected-domain`, `full-nightly`, and `release-candidate`. The lane-system self-test is also registered in `pr-fast`, `full-nightly`, and `release-candidate` so empty-suite, unsafe-output, and terminal-timeout behavior cannot drift outside CI. The plan generator is intentionally not registered as passing hardware evidence: it creates a checklist and explicitly reports `device_evidence_required`.

No separate workflow command is required. The existing pull-request workflow invokes `pr-fast` and `affected-domain`, while the scheduled workflow invokes `full-nightly`; policy-based registration keeps execution and timing inside the existing ECS verification owner. Those workflows retain the lane-specific JSON and Markdown files alongside their normal verification artifacts.

Scenario declarations must stay conservative. The aggregate runner should not be registered as proof of an unrelated high-value policy scenario merely because it exercises the same surface.

## Qualified behavioral test inventory

The following identities are emitted in the machine-readable reports and recorded on their policy checks in the verification inventory. They identify the executed behavior, not just a source file or metadata declaration.

| Lane | Scenario | Qualified test identity |
| --- | --- | --- |
| fast | `dashboard_weather` | `ecs.runtime.fast.dashboard_weather.live_and_cached` |
| fast | `terrain_risk` | `ecs.runtime.fast.terrain_risk.profile_and_missing_elevation` |
| fast | `draw_route` | `ecs.runtime.fast.draw_route.pre_preview_draft_lifecycle` |
| fast | `guidance_snapping` | `ecs.runtime.fast.guidance_snapping.canonical_projection` |
| fast | `mvum_and_route_geometry` | `ecs.runtime.fast.navigate_layers.independent_terminals_and_stale_viewport` |
| integration | `dispatch_canonical_route_store_update` | `runtime.integration.dispatch.canonical-route-store-update` |
| integration | `explore_guidance_readiness_promotion` | `runtime.integration.explore.guidance-readiness-promotion` |
| integration | `explore_provider_failure_truth` | `runtime.integration.explore.provider-failure-truth` |
| integration | `interaction_primary_fleet` | `runtime.integration.controls.fleet-primary-navigation` |
| integration | `interaction_primary_navigate` | `runtime.integration.controls.navigate-primary-navigation` |
| integration | `interaction_primary_dashboard` | `runtime.integration.controls.dashboard-primary-navigation` |
| integration | `interaction_primary_explore` | `runtime.integration.controls.explore-primary-navigation` |
| integration | `interaction_primary_dispatch` | `runtime.integration.controls.dispatch-primary-navigation` |
| lane system | `runtime_result_contract_fail_closed` / `runtime_child_timeout_enforced` | `runtime-regression.lane-system.fail-closed-contract-and-worker-timeout` |

The fast lane uses fixed weather, route, elevation, GPS, and viewport fixtures with controlled clocks and no network. The integration lane uses isolated Dispatch persistence, deterministic route-catalog/provider fixtures, mounted CommandDock controls, and reset module/store state.

The eight `runtime-regression.device-plan.*` identities are planning records, not passing behavioral tests. Their terminal state remains `device_evidence_required` until separately captured evidence is reviewed.

The first seven device-plan scenarios also project the detailed package documented in `docs/verification/runtime-validation-package.md`. `npm run generate:runtime-validation-package` can emit an unbound template or a release-binary-bound collection package. Both remain `plan_only_not_executed`; neither creates a release-evidence submission or approval. A bound package requires the repository's `ecs.verification-provenance-artifact.v2` release-binary provenance plus platform, OS version, safe device model, and symbolic provider environment.

## Device evidence boundary

The plan generator covers real weather/location, native terrain graph rendering, Mapbox draft restoration, physical GPS snapping and off-route behavior, provider-backed MVUM/route geometry, native Dispatch bundle resolution, approved Explore catalog readiness, and a native primary-control sweep. The plan never marks those checks passed and instructs evidence collectors not to record private coordinates, credentials, raw provider payloads, or private expedition content.
