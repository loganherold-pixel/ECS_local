# ECS Verification Matrix

Date: 2026-07-13

## Authority

`config/verification-policy.json` is the machine-readable capability, scenario, check, lane, and external-evidence policy. `scripts/verification/verification-inventory.mjs` inventories package scripts and workflows and emits **planned/declaration coverage**. Its conservative source inspection is a warning signal, not proof that a scenario executed.

Generate the current report without modifying tracked files:

```bash
node scripts/verification/verification-inventory.mjs --strict --artifact-audience pull_request --output .smoke/verification/inventory.json
```

The current inventory contains 718 package scripts across three manifests, including 597 test commands and 59 gates, plus 19 workflows and 60 readiness/evidence documents. One unrelated utility command points to a missing file; no verification command or policy reference is unresolved.

## Planned And Executed Coverage

- `declared`: an explicit package-qualified check is registered for the scenario.
- `scheduled`: that check was selected into a concrete lane plan.
- `executed`: a schema-valid result for that selected check exists.
- `passed`: the executed result passed.
- `behavioral_verified`, `contract_verified`, or `evidence_verified`: every required evidence class passed through authoritative registrations.
- `provisional`, `unsupported`, or `mismatch`: authority is absent, coverage is unsupported, or registration/execution disagrees.

Static inventory output starts at `declared` and reports zero executed or verified scenarios. PR, nightly, and release lane artifacts contain the executed matrix derived from their actual results. A wildcard can select checks but cannot satisfy a scenario; each scenario names one or more explicit qualified checks.

## Capability Coverage

| Capability | Behavioral anchors | High-value scenarios | External evidence that code cannot supply |
| --- | --- | --- | --- |
| Fleet | `fleet-runtime`, `fleet-active-vehicle`, `fleet-migration` | Active-vehicle switch, migration, stale data, repeated actions | Android multi-vehicle profile, verified weight source, owner acceptance |
| Navigate | `navigate-operations`, `route-lifecycle`, `guidance-replacement` | Offline active route, stale responses, repeated actions | Android guidance, provider-backed overlays, offline device run |
| Dashboard | `dashboard-runtime`, `fleet-active-vehicle`, `source-truth` | Stale data, vehicle propagation, rapid updates | Android widget source states, owner acceptance |
| Explore | `explore-discovery`, `explore-filter-persistence`, `explore-ai-lifecycle` | Provider disagreement, dedupe, AI unavailable | Catalog coverage, moderation approval, Android handoff |
| Dispatch | `dispatch-runtime`; `supabase-pgtap-rls` for multi-client ordering | Out-of-order events, late acknowledgment, permission denial | Live two-client realtime, location privacy approval, owner acceptance |
| Expedition | `expedition-lifecycle`, `route-lifecycle` | Restart during transition, migration, duplicate completion | Android completion/recovery, archive migration, owner acceptance |
| CampOps | `campops-normalization`, `campops-performance` | Provider conflict, stale evidence, permission denial | Provider shadow region, legal/access review, community privacy approval |
| Devices/telemetry | `device-lifecycle` | Permission denial, stale/no-data, reconnect races | Real BLE/OBD2 hardware and Android background reconnect |
| Weather/fire | `weather-broker`, `weather-request-dedupe` | Provider conflict, last-good stale data, offline route use | Real provider freshness, Android offline weather, advisory fan-out |
| Offline/recovery | `offline-manifest`, `offline-failure-drill` | Corrupt cache, interrupted preparation, offline active route | Android no-network drill, storage pressure, privacy approval |
| Automotive | `automotive-driver-safe` | Stale GPS/telemetry, unavailable surface, offline route | Real head unit, native plugins, driver-safety review |
| AI | `ai-truthfulness`, `explore-ai-lifecycle` | Provider unavailable, stale context, conflicting sources | Privacy approval, provider evaluation, owner acceptance |
| Supabase/RLS | `dispatch-backend-contract`, `supabase-pgtap-rls` | Permission denial, ordering, migration | Deployed migration, isolated identities, rollback rehearsal |
| Auth/subscription | `auth-routing`, `subscription-contract` | Offline startup, repeated login, permission denial | Real auth and entitlement providers, password recovery |

The pgTAP/RLS workflow executes against local Supabase. The `test:supabase-db-workflow` command only checks workflow wiring and remains labeled `source-contract`.

## Check Classes

The policy uses the approved test classes: unit, contract, integration, UI/component, end-to-end, migration, offline, multi-client, provider shadow, hardware/device, security/RLS, performance, and evidence-only. Scenario authority separately uses `behavioral`, `source_contract`, `workflow_contract`, `schema_or_static`, `evidence_only`, `provider_shadow`, `hardware_or_device`, and `manual_field` evidence classes.

The inventory separately reports execution evidence:

- `runtime_behavior`: loads runtime code and executes assertions.
- `hybrid`: executes runtime behavior and also inspects source contracts.
- `source_contract`: checks source strings or structure without executing the behavior.
- `evidence_only`: validates an evidence manifest or approval posture.
- `tool_execution`: compiler, lint, build, or another tool command.
- `unknown`: no defensible behavior signal was detected.

These are conservative static classifications. Unknown checks default to provisional and cannot satisfy curated scenarios. Source-contract, workflow-contract, and evidence-document checks cannot satisfy behavioral product coverage. Mock-only, provider-shadow, and device simulations do not become live provider, production provider, real device, multi-client, or field evidence.

## False Confidence

The current scanner identifies 226 source-contract-only commands and 396 hybrid commands. It also reports 108 possible uncontrolled-network signals for review, plus simulated hardware, happy-path-only fixtures, duplicate command targets, tests without detected assertions, trivial assertion signals, evidence gates without runtime behavior, and unmeasured durations. These signals can reduce confidence or trigger strict registration mismatches, but they do not claim to prove arbitrary test quality.

The former `test:release-readiness` source-string sweep has been retired from authoritative CI. It remains available as `test:release-readiness-source-contract`. The authoritative command now executes registry, scenario, lane, pgTAP-linkage, and approval-separation behavior.

JSON and human variants of the same gate are reported as duplicate command targets. They may remain as operator conveniences, but they do not count as independent coverage.

## Next Calibration

1. Calibrate the 226 source-only classifications and promote checks only after they execute behavior.
2. Add component/E2E coverage for Navigate, Dashboard, Explore, and Dispatch interactions.
3. Add live realtime two-client Dispatch ordering evidence; local pgTAP covers deterministic multi-identity database behavior only.
4. Expand migration fixtures with corrupt and partially written persisted records.
5. Attach real provider, Android/iOS, automotive, BLE, OBD2, privacy, and owner evidence without changing code-check status.
