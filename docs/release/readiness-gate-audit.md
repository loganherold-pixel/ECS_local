# ECS Release Readiness Gate Audit

Date: 2026-07-08

## Publish Status

ECS is ready for **restricted closed field testing only**.

This is not public release approval. The executable gates and QA checkoff record now agree that closed-field testing may proceed only under the current restricted readiness gates. The prior risk-acceptance packet expired on 2026-06-16 and is intentionally retired; it must not be used to waive evidence gates. Provider influence, AI assist, telemetry, community publishing, and broad privacy/storage rollout remain disabled or restricted unless separately approved.

## Gate Results

| Gate | Result | Notes |
| --- | --- | --- |
| `npm run test:release-readiness` | Passed | Release diagnostic wiring, checklist sections, risk summary, scenario matrix, selectors, and package script coverage are present. |
| `npm run gate:closed-field-test:json` | Passed with restrictions | Gate reports `ready_with_restrictions`. Provider influence remains not approved. AI assist, telemetry, and community publishing remain disabled unless separately approved. |
| `npm run gate:dispatch-convoy-production` | Blocked by approvals | Dispatch/Convoy code and Android evidence pass, but production remains blocked until position-sharing privacy/product approval and production owner decision are accepted. |
| `npm run gate:established-campgrounds-production` | Blocked by owner acceptance | Cached endpoint, attribution, freshness, zoom-gated mobile pin/detail/action wiring, runbook coverage, sanitized scheduler/provider-health/sync-run/canonical-row/availability-freshness handoff evidence, and Android visible pin/popup/action evidence for the camp-layer path are recorded. Production remains blocked until owner acceptance; the manifest does not claim live scheduler execution, raw provider payload review, secret values, fresh live availability, or provider-backed Android acceptance. |
| `npm run gate:bluetooth-power-obd2-production` | Blocked by real-hardware evidence | Native BLE configuration, unified scanner contract, OBD2 pipeline, and E2E plan checks pass, but production remains blocked until Android BLE, power station, EcoFlow BLE/cloud separation, OBD2 live/no-data/disconnect, and owner-decision evidence are recorded. |
| `npm run gate:offline-navigation-production` | Blocked by owner acceptance | Offline route/cache, downloaded sync reopen harness, departure audit, Android app-visible offline route start, and cached/labeled camp-layer evidence are recorded in `.smoke/offline-navigation-production-evidence.json`; production remains blocked until the production owner decision is accepted. The manifest explicitly does not treat fixture-only Offline Failure Drill output as production acceptance or claim live camp legality/access/availability offline. |
| `npm run gate:weather-production` | Blocked by provider/device evidence | Shared coordinate-first weather, freshness/stale labeling, request dedupe, Dispatch/ECS Brief dedupe, and diagnostics redaction checks pass, but production remains blocked until real provider source/freshness evidence, Android route-weather visual QA, alert-to-brief E2E evidence, offline/stale device QA, and owner-decision evidence are recorded. |
| `npm run gate:garmin-inreach-production` | Blocked by provider/device evidence | Default-off Garmin/inReach flags, token-gated IPC webhook, read-only MapShare KML ingestion, operator confirmation, SOS review-only behavior, and no-AI-auto-command checks pass, but production remains blocked until real MapShare feed/device, IPC webhook staging, operator-confirmed command, SOS review-only field evidence, and owner-decision evidence are recorded. |
| `npm run gate:auth-production` | Blocked by provider/device evidence | Bounded startup loading, single-flight login, redacted auth/audit logs, deterministic startup/offline route selection, and non-privileged subscription fallback checks pass, but production remains blocked until real auth provider signup/signin/signout, Android cold/warm/offline startup, password reset/activation, subscription entitlement provider, and owner-decision evidence are recorded. |
| `npm run gate:ecs-brief-production` | Blocked by producer/device evidence | Central dedupe/top-banner, source-labeled telemetry, remote/weather dedupe, Command Brief readiness grounding, and source-state activity wording checks pass, but production remains blocked until Android top intelligence banner, real live advisory producer dedupe, offline/stale/unavailable labeling, brief export/share redaction, and owner-decision evidence are recorded. |
| `npm run gate:incident-recovery-production` | Blocked by Android/field evidence | Incident workflow/timeline, unsafe-recovery guardrails, explicit review-only debrief handoff state, local-only report/debrief posture, GPS-tolerant Dispatch recovery CAD, and recovery compass live/cached/offline checks pass, but production remains blocked until Android Incident & Recovery workflow, real coordinate packet, Dispatch recovery CAD/emergency ping, offline/cached recovery compass, and owner-decision evidence are recorded. |
| `npm run gate:field-utilities-production` | Blocked by Android/degraded evidence | Field Utilities entrypoint/navigation, local protocol assets, compact emergency/recovery detail views, shared Weather Intel parity, canonical Device Connections routing, and conservative copy checks pass, but production remains blocked until Android Field Utilities visual QA, emergency/recovery protocol device flow, weather parity, offline/degraded Field Utilities, and owner-decision evidence are recorded. |
| `npm run gate:explore-trail-packs-production` | Blocked by moderation/privacy/owner evidence | Approved-only Trail Pack discovery, confidence blockers, moderation suppression, permission-certified pending submissions, guarded Navigate handoff, truthful Explore UI-state checks, the current Android Trail Pack category/count visual, and the existing Explore-to-Navigate plus Trip Builder handoff evidence pass. Production remains blocked until content review/moderation, privacy submission, and owner-decision evidence are recorded. |
| `npm run gate:fleet-production` | Passed with Android/profile and regression evidence | Fleet source confidence tiers, operating weight/payload math, no-photo UI contract, build/loadout zones, active vehicle propagation, source-labeled readiness checks, Android Fleet profile/setup captures, native build metadata, owner acceptance, and regression/preload-backed multi-vehicle, scale-ticket confidence, and offline migration evidence pass. The manifest explicitly notes that multi-vehicle/scale-ticket/migration evidence is not a fresh two-vehicle Android screenshot, real user scale ticket, or live account migration sweep. |
| `npm run gate:dashboard-production` | Passed with portrait-lock policy evidence | Dashboard widget registry, responsive grid, source-labeled widget states, command-center fallback, top-banner brief integration, and Convoy removal from Dashboard checks pass. `.smoke/dashboard-production-evidence.json` now records Android widget/source-state evidence, command-center selector evidence, production-owner acceptance, and the current Android portrait-lock policy instead of fabricating phone-landscape Dashboard evidence. |
| `npm run gate:campops-live-readiness:json` | Passed for internal beta; restricted closed-field posture | CampOps implementation and guardrails pass, with provider/source influence held to shadow-only where real provider evidence is not accepted. |
| `npm run gate:provider-readiness` | Shadow-only acceptable; not approved for influence | The command passes for the current no-influence restricted packet, but provider readiness remains blocked for production influence until real upstream target-region/category evidence is accepted. |
| `npm run gate:navigate-provider-android-evidence` | Blocked by real provider-backed Android evidence | The Navigate provider sweep harness and blocked manifest path exist at `.smoke/navigate-provider-android-sweep/manifest.json`, but the strict gate must fail until a real sanitized provider summary, Android candidate pin/action captures, active route-line context, search freeze/standby runtime evidence, and logcat slice are supplied. |
| `npm run gate:privacy-storage` | Approved for guarded closed-field only | Private/local guarded closed-field posture is approved. Broad real trip/debrief rollout remains blocked until encryption-backed storage, durable provider/source caches, telemetry sinks, community publishing, and public-safe export workflows receive separate approval. |
| `npm run gate:release-approval-overrides` | Passed | Forced AI assist, telemetry, and community publishing enablement fail closed unless exact approval evidence exists. This gate is included in `npm run gate:pre-closed-field-test`. |
| `npm run gate:closed-field-test-risk-acceptance` | Expired / retired | Historical risk acceptance expired on 2026-06-16. It preserves prior scope/signoff evidence, but no longer waives evidence gates or authorizes new restricted runs. |
| `npm run test:closed-field-gate` | Passed | Closed-field readiness gate behavior is covered by the contract script. |
| `npm run test:dispatch-convoy-production` | Passed | Dispatch/Convoy production regression verifies code/evidence checks pass while approval blockers remain active. |
| `npm run test:established-campgrounds-production` | Passed | Established campgrounds production regression verifies cached mobile endpoint, attribution, freshness, zoom-gated map pins/details, CampOps action wiring, and sanitized evidence-bundle path while owner acceptance remains active. |
| `npm run test:bluetooth-power-obd2-production` | Passed | Bluetooth/Power/OBD2 production regression verifies scanner/telemetry contracts pass while real-hardware evidence blockers remain active. |
| `npm run test:offline-navigation-production` | Passed | Offline Navigation production regression verifies route/cache/departure-audit/camp-layer checks plus the tracked evidence manifest pass while owner acceptance remains blocked. |
| `npm run test:weather-production` | Passed | Weather production regression verifies source-of-truth/freshness/dedupe/diagnostics checks pass while provider and Android evidence blockers remain active. |
| `npm run test:garmin-inreach-production` | Passed | Garmin/inReach production regression verifies default-off/secrets/webhook/MapShare/UI/intelligence checks pass while real device/provider evidence blockers remain active. |
| `npm run test:auth-production` | Passed | Auth/session production regression verifies bounded startup, login single-flight, redaction, route restore, and non-privileged subscription fallback checks pass while provider/device evidence blockers remain active. |
| `npm run test:ecs-brief-production` | Passed | ECS Brief production regression verifies dedupe/top-banner, telemetry truthfulness, remote/weather dedupe, Command Brief grounding, and source-state wording checks pass while producer/device evidence blockers remain active. |
| `npm run test:incident-recovery-production` | Passed | Incident & Recovery production regression verifies workflow/timeline, unsafe-recovery guardrails, review-only debrief publishing state, local-only report/debrief posture, recovery CAD, and compass source-state checks pass while Android/field evidence blockers remain active. |
| `npm run test:field-utilities-production` | Passed | Field Utilities production regression verifies entrypoint/navigation, local protocol assets, shared Weather Intel parity, canonical Device Connections routing, and conservative copy checks pass while Android/degraded evidence blockers remain active. |
| `npm run test:explore-trail-packs-production` | Passed | Explore Trail Packs production regression verifies approved-only discovery, confidence blockers, moderation suppression, permission-certified pending submissions, guarded Navigate handoff, truthful UI states, accepted visual/handoff evidence, and remaining moderation/privacy/owner blockers. |
| `npm run test:fleet-production` | Passed | Fleet production regression verifies source confidence tiers, payload math, no-photo UI contract, build/loadout zones, active vehicle propagation, readiness/source labeling, Android/profile evidence manifest completeness, and production-owner acceptance. |
| `npm run test:dashboard-production` | Passed | Dashboard production regression verifies widget registry/grid safeguards, source-state labels, command-center fallback and Convoy removal, top-banner brief integration, detail shell wiring, command-center evidence, portrait-lock rotation policy evidence, and production-owner acceptance. |
| `npm run test:navigate-provider-android-evidence` | Passed | Navigate provider Android evidence regression verifies the manifest only passes with sanitized real-provider summaries, Android candidate/action captures, active route-line context, search freeze/standby evidence, and no raw provider payloads, secrets, or precise coordinates. |
| `npm run test:navigate-mobile-emulation-regressions` | Passed | Navigate mobile emulation regression protects the current destination-search freeze/standby path, MapRenderer standby behavior, and active guidance overlay contracts while device performance evidence remains separately required. |
| `npm run test:pre-closed-field-gate` | Passed | Aggregate pre-closed-field gate coverage verifies `release-approval-overrides` runs in evidence and risk-acceptance modes and is not waived by risk acceptance. |
| `npm run test:release-approval-overrides` | Passed | Current repo blocks forced AI assist, telemetry, and community publishing enablement unless exact approval evidence exists. |
| `npx tsc --noEmit --pretty false` | Passed | Direct TypeScript check passed in the current readiness lane. |

## Remaining Blockers

- Public release is blocked.
- Code-level production readiness checks pass for the current swept lanes; the remaining blockers below are evidence, real-hardware/provider validation, privacy/product approval, or production-owner acceptance items.
- Dispatch/Convoy production approval is blocked until position-sharing privacy/product approval and owner production decision are accepted.
- Established campgrounds production rollout is now blocked by owner acceptance after sanitized scheduler, provider-health, sync-run, canonical-row, availability-freshness, and Android camp-layer pin/popup/action evidence paths were recorded. The evidence remains handoff-focused and does not claim live provider acceptance.
- Bluetooth/Power/OBD2 production rollout is blocked until real Android BLE, power station, EcoFlow BLE/cloud separation, OBD2 live/no-data/disconnect, and owner-decision evidence are recorded.
- Offline Navigation production rollout now has a tracked evidence handoff for Android app-visible offline route start, route-cache/downloaded-sync regression coverage, cached/labeled camp-layer states, and Departure Audit device captures. Production remains blocked until owner acceptance is recorded, and the evidence manifest keeps fixture-only no-network drill output plus live camp/legal/access limitations explicit.
- Weather and route hazard intelligence production rollout is blocked until real provider source/freshness evidence, Android route-weather visual QA, alert-to-brief/CAD E2E evidence, offline/stale weather device QA, and owner-decision evidence are recorded.
- Garmin/inReach satellite communications production rollout is blocked until real MapShare feed/device, IPC webhook staging, operator-confirmed command, SOS review-only field evidence, and owner-decision evidence are recorded.
- Auth/session/subscription production rollout is blocked until real auth provider signup/signin/signout, Android cold/warm/offline startup, password reset/activation, subscription entitlement provider, and owner-decision evidence are recorded.
- ECS Brief/advisory production rollout is blocked until Android top intelligence banner, real live advisory producer dedupe, offline/stale/unavailable labeling, brief export/share redaction, and owner-decision evidence are recorded.
- Incident & Recovery production rollout is blocked until Android workflow visual QA, real coordinate packet, Dispatch recovery CAD/emergency ping, offline/cached recovery compass, and owner-decision evidence are recorded. Debrief requests for community hazard reporting or route confidence adjustment are recorded as review-only and not published/applied automatically.
- Field Utilities production rollout is blocked until Android visual QA, emergency/recovery protocol device-flow evidence, weather parity evidence, offline/degraded Field Utilities evidence, and owner-decision evidence are recorded.
- Explore Trail Packs production rollout now has a narrow Android Trail Pack category/count visual and existing Explore-to-Navigate plus Trip Builder handoff evidence recorded in `.smoke/explore-trail-packs-production-evidence.json`. Production remains blocked until content review/moderation evidence, privacy submission evidence, and owner-decision evidence are recorded.
- Fleet production now has local Android Fleet profile/setup visual evidence, native build metadata, source/confidence/offline evidence, production-owner acceptance, and accepted regression/preload evidence recorded in `.smoke/fleet-production-evidence.json`. Product, engineering, QA, privacy, and support reviews remain pending for release governance, and the manifest keeps the non-device/non-real-scale-ticket caveats explicit.
- Dashboard production rollout now has local Android widget visual, live/stale/unavailable source-label, command-center selector, production-owner acceptance, and portrait-lock orientation-policy evidence recorded in `.smoke/dashboard-production-evidence.json`. Role-specific product, engineering, QA, design, privacy, and support reviews remain pending for release governance.
- Curated production evidence manifests for Dashboard, Explore Trail Packs, and Fleet are tracked under narrow `.gitignore` exceptions; raw `.smoke` screenshots, XML, logs, and generated readiness-result files remain ignored local evidence.
- Provider-backed Navigate candidate pins/actions, active route-line plus provider-candidate context, and mobile destination-search freeze/standby runtime evidence now have a repeatable harness and blocked manifest at `.smoke/navigate-provider-android-sweep/manifest.json`; broad rollout remains blocked until the strict gate passes with real sanitized provider-backed Android evidence.
- Provider influence is not approved beyond accepted shadow-only evidence scope.
- Broad privacy/storage rollout is not approved for real trip/debrief field data.
- AI assist, telemetry, and community publishing remain disabled unless separately approved.
- Production owner acceptance is still required for broad deployment.

## Warnings

- Treat CampOps local debrief `localStorage` persistence as unencrypted unless the runtime provides protection outside CampOps.
- Provider APIs, provider secrets, and service-role keys must remain server-side only.
- Source transparency must stay visible during any closed field-test provider review.
- Do not mark legal/access, closure, fire, weather, service, or availability data ready for regional rollout until real provider coverage is validated.

## Accepted Risks

Restricted closed field-test risk acceptance is expired and retired. The historical cohort, region/route labels, expiration, and rollback path remain recorded in `docs/campops/closed_field_test_risk_acceptance.md`.

That expired acceptance does not waive public release requirements, provider influence approval, telemetry/community publishing approval, broad privacy/storage approval, or any current evidence gate.

## Passed Evidence

- Release-readiness diagnostic wiring is present:
  - `masterReleaseChecklist`
  - `releaseRiskSummary`
  - `releasePolishAuditTypes`
  - `releaseReadinessChecks`
  - runtime smoke store/selectors/checks
- CampOps QA evidence includes dev visual QA pins, Camp Intel popup actions, Save Camp, Navigate Here, Report Unusable, Dismiss, Navigate camp-layer smoke, and phone-size evidence.
- Closed-field gate contract tests pass.
- TypeScript passes directly.

## Required Follow-Up

1. Re-run Android/device QA with `npm run evidence:navigate-provider-android -- --provider-summary=<sanitized-summary.json> ... --real`, then pass `npm run gate:navigate-provider-android-evidence` with real provider-backed candidate pins/actions, active route context, search freeze/standby runtime evidence, and redacted logs.
2. Run real provider shadow validation for the target region/category before provider influence.
3. Record provider-specific coverage, freshness, unknown, stale, and conflict rates from real data.
4. Complete broad privacy/storage owner approval before real trip/debrief field-data rollout.
5. Keep AI assist, telemetry, and community publishing disabled unless separate approvals are recorded.
6. Re-run `npm run gate:closed-field-test:json` before any closed-field promotion checkpoint.
