# ECS Release Readiness Gate Audit

Date: 2026-05-18

## Publish Status

ECS is ready for **restricted closed field testing only**.

This is not public release approval. The executable gates, QA checkoff record, and risk-acceptance posture now agree that closed-field testing may proceed only inside the approved restricted scope. Provider influence, AI assist, telemetry, community publishing, and broad privacy/storage rollout remain disabled or restricted unless separately approved.

## Gate Results

| Gate | Result | Notes |
| --- | --- | --- |
| `npm run test:release-readiness` | Passed | Release diagnostic wiring, checklist sections, risk summary, scenario matrix, selectors, and package script coverage are present. |
| `npm run gate:closed-field-test:json` | Passed with restrictions | Gate reports `ready_with_restrictions` / `risk_accepted_restricted_closed_field_test`. Provider influence remains not approved. AI assist, telemetry, and community publishing remain disabled unless separately approved. |
| `npm run gate:dispatch-convoy-production` | Blocked by approvals | Dispatch/Convoy code and Android evidence pass, but production remains blocked until position-sharing privacy/product approval and production owner decision are accepted. |
| `npm run gate:established-campgrounds-production` | Blocked by deployment/device evidence | Cached endpoint, attribution, freshness, zoom-gated mobile pin/detail/action wiring, and runbook checks pass, but production remains blocked until scheduler, provider-health, sync-run, canonical-row, availability freshness, Android visible pin/popup/action evidence, and owner-decision evidence are recorded. |
| `npm run gate:bluetooth-power-obd2-production` | Blocked by real-hardware evidence | Native BLE configuration, unified scanner contract, OBD2 pipeline, and E2E plan checks pass, but production remains blocked until Android BLE, power station, EcoFlow BLE/cloud separation, OBD2 live/no-data/disconnect, and owner-decision evidence are recorded. |
| `npm run gate:offline-navigation-production` | Blocked by Android no-network evidence | Offline route/cache, downloaded sync, departure audit, and cached/labeled camp-layer checks pass, but production remains blocked until Android no-network offline route, map tile/route cache, camp pins availability or unavailable labeling, departure audit device evidence, and owner-decision evidence are recorded. |
| `npm run gate:weather-production` | Blocked by provider/device evidence | Shared coordinate-first weather, freshness/stale labeling, request dedupe, Dispatch/ECS Brief dedupe, and diagnostics redaction checks pass, but production remains blocked until real provider source/freshness evidence, Android route-weather visual QA, alert-to-brief E2E evidence, offline/stale device QA, and owner-decision evidence are recorded. |
| `npm run gate:garmin-inreach-production` | Blocked by provider/device evidence | Default-off Garmin/inReach flags, token-gated IPC webhook, read-only MapShare KML ingestion, operator confirmation, SOS review-only behavior, and no-AI-auto-command checks pass, but production remains blocked until real MapShare feed/device, IPC webhook staging, operator-confirmed command, SOS review-only field evidence, and owner-decision evidence are recorded. |
| `npm run gate:auth-production` | Blocked by provider/device evidence | Bounded startup loading, single-flight login, redacted auth/audit logs, deterministic startup/offline route selection, and non-privileged subscription fallback checks pass, but production remains blocked until real auth provider signup/signin/signout, Android cold/warm/offline startup, password reset/activation, subscription entitlement provider, and owner-decision evidence are recorded. |
| `npm run gate:ecs-brief-production` | Blocked by producer/device evidence | Central dedupe/top-banner, source-labeled telemetry, remote/weather dedupe, Command Brief readiness grounding, and source-state activity wording checks pass, but production remains blocked until Android top intelligence banner, real live advisory producer dedupe, offline/stale/unavailable labeling, brief export/share redaction, and owner-decision evidence are recorded. |
| `npm run gate:incident-recovery-production` | Blocked by Android/field evidence | Incident workflow/timeline, unsafe-recovery guardrails, explicit review-only debrief handoff state, local-only report/debrief posture, GPS-tolerant Dispatch recovery CAD, and recovery compass live/cached/offline checks pass, but production remains blocked until Android Incident & Recovery workflow, real coordinate packet, Dispatch recovery CAD/emergency ping, offline/cached recovery compass, and owner-decision evidence are recorded. |
| `npm run gate:field-utilities-production` | Blocked by Android/degraded evidence | Field Utilities entrypoint/navigation, local protocol assets, compact emergency/recovery detail views, shared Weather Intel parity, canonical Device Connections routing, and conservative copy checks pass, but production remains blocked until Android Field Utilities visual QA, emergency/recovery protocol device flow, weather parity, offline/degraded Field Utilities, and owner-decision evidence are recorded. |
| `npm run gate:explore-trail-packs-production` | Blocked by Android/content evidence | Approved-only Trail Pack discovery, confidence blockers, moderation suppression, permission-certified pending submissions, guarded Navigate handoff, and truthful Explore UI-state checks pass, but production remains blocked until Android Explore Trail Packs visual QA, content review/moderation, Explore-to-Navigate handoff, privacy submission, and owner-decision evidence are recorded. |
| `npm run gate:fleet-production` | Blocked by Android/profile evidence | Fleet source confidence tiers, operating weight/payload math, no-photo UI contract, build/loadout zones, active vehicle propagation, and source-labeled readiness checks pass, but production remains blocked until Android Fleet profile/setup visual QA, multi-vehicle active selection, scale-ticket/profile evidence, offline persistence/migration, and owner-decision evidence are recorded. |
| `npm run gate:dashboard-production` | Blocked by Android/widget evidence | Dashboard widget registry, responsive grid, source-labeled widget states, command-center fallback, top-banner brief integration, and Convoy removal from Dashboard checks pass, but production remains blocked until Android Dashboard widget visual QA, command-center switching, live/stale/unavailable source labels, phone/landscape rotation, and owner-decision evidence are recorded. |
| `npm run gate:campops-live-readiness:json` | Passed for internal beta; restricted closed-field posture | CampOps implementation and guardrails pass, with provider/source influence held to shadow-only where real provider evidence is not accepted. |
| `npm run gate:provider-readiness` | Shadow-only acceptable; not approved for influence | The command passes for the current no-influence restricted packet, but provider readiness remains blocked for production influence until real upstream target-region/category evidence is accepted. |
| `npm run gate:privacy-storage` | Approved for guarded closed-field only | Private/local guarded closed-field posture is approved. Broad real trip/debrief rollout remains blocked until encryption-backed storage, durable provider/source caches, telemetry sinks, community publishing, and public-safe export workflows receive separate approval. |
| `npm run gate:release-approval-overrides` | Passed | Forced AI assist, telemetry, and community publishing enablement fail closed unless exact approval evidence exists. This gate is included in `npm run gate:pre-closed-field-test`. |
| `npm run gate:closed-field-test-risk-acceptance` | Accepted for restricted test | Risk acceptance covers the restricted cohort/scope only, with explicit expiration and rollback path. |
| `npm run test:closed-field-gate` | Passed | Closed-field readiness gate behavior is covered by the contract script. |
| `npm run test:dispatch-convoy-production` | Passed | Dispatch/Convoy production regression verifies code/evidence checks pass while approval blockers remain active. |
| `npm run test:established-campgrounds-production` | Passed | Established campgrounds production regression verifies cached mobile endpoint, attribution, freshness, zoom-gated map pins/details, and CampOps action wiring pass while deployment/device evidence blockers remain active. |
| `npm run test:bluetooth-power-obd2-production` | Passed | Bluetooth/Power/OBD2 production regression verifies scanner/telemetry contracts pass while real-hardware evidence blockers remain active. |
| `npm run test:offline-navigation-production` | Passed | Offline Navigation production regression verifies route/cache/departure-audit/camp-layer checks pass while Android no-network evidence blockers remain active. |
| `npm run test:weather-production` | Passed | Weather production regression verifies source-of-truth/freshness/dedupe/diagnostics checks pass while provider and Android evidence blockers remain active. |
| `npm run test:garmin-inreach-production` | Passed | Garmin/inReach production regression verifies default-off/secrets/webhook/MapShare/UI/intelligence checks pass while real device/provider evidence blockers remain active. |
| `npm run test:auth-production` | Passed | Auth/session production regression verifies bounded startup, login single-flight, redaction, route restore, and non-privileged subscription fallback checks pass while provider/device evidence blockers remain active. |
| `npm run test:ecs-brief-production` | Passed | ECS Brief production regression verifies dedupe/top-banner, telemetry truthfulness, remote/weather dedupe, Command Brief grounding, and source-state wording checks pass while producer/device evidence blockers remain active. |
| `npm run test:incident-recovery-production` | Passed | Incident & Recovery production regression verifies workflow/timeline, unsafe-recovery guardrails, review-only debrief publishing state, local-only report/debrief posture, recovery CAD, and compass source-state checks pass while Android/field evidence blockers remain active. |
| `npm run test:field-utilities-production` | Passed | Field Utilities production regression verifies entrypoint/navigation, local protocol assets, shared Weather Intel parity, canonical Device Connections routing, and conservative copy checks pass while Android/degraded evidence blockers remain active. |
| `npm run test:explore-trail-packs-production` | Passed | Explore Trail Packs production regression verifies approved-only discovery, confidence blockers, moderation suppression, permission-certified pending submissions, guarded Navigate handoff, and truthful UI states while Android/content/privacy evidence blockers remain active. |
| `npm run test:fleet-production` | Passed | Fleet production regression verifies source confidence tiers, payload math, no-photo UI contract, build/loadout zones, active vehicle propagation, and readiness/source labeling while Android/profile evidence blockers remain active. |
| `npm run test:dashboard-production` | Passed | Dashboard production regression verifies widget registry/grid safeguards, source-state labels, command-center fallback and Convoy removal, top-banner brief integration, and detail shell wiring while Android/widget evidence blockers remain active. |
| `npm run test:pre-closed-field-gate` | Passed | Aggregate pre-closed-field gate coverage verifies `release-approval-overrides` runs in evidence and risk-acceptance modes and is not waived by risk acceptance. |
| `npm run test:release-approval-overrides` | Passed | Current repo blocks forced AI assist, telemetry, and community publishing enablement unless exact approval evidence exists. |
| `npx tsc --noEmit --pretty false` | Passed | Direct TypeScript check passed in the current readiness lane. |

## Remaining Blockers

- Public release is blocked.
- Code-level production readiness checks pass for the current swept lanes; the remaining blockers below are evidence, real-hardware/provider validation, privacy/product approval, or production-owner acceptance items.
- Dispatch/Convoy production approval is blocked until position-sharing privacy/product approval and owner production decision are accepted.
- Established campgrounds production rollout is blocked until deployment scheduler, provider health, sync-run, canonical-row, availability freshness, Android visible pin/popup/action evidence, and owner-decision evidence are recorded.
- Bluetooth/Power/OBD2 production rollout is blocked until real Android BLE, power station, EcoFlow BLE/cloud separation, OBD2 live/no-data/disconnect, and owner-decision evidence are recorded.
- Offline Navigation production rollout is blocked until Android no-network route execution, offline map tile/route cache, camp pins availability or unavailable labeling, departure audit device evidence, and owner-decision evidence are recorded.
- Weather and route hazard intelligence production rollout is blocked until real provider source/freshness evidence, Android route-weather visual QA, alert-to-brief/CAD E2E evidence, offline/stale weather device QA, and owner-decision evidence are recorded.
- Garmin/inReach satellite communications production rollout is blocked until real MapShare feed/device, IPC webhook staging, operator-confirmed command, SOS review-only field evidence, and owner-decision evidence are recorded.
- Auth/session/subscription production rollout is blocked until real auth provider signup/signin/signout, Android cold/warm/offline startup, password reset/activation, subscription entitlement provider, and owner-decision evidence are recorded.
- ECS Brief/advisory production rollout is blocked until Android top intelligence banner, real live advisory producer dedupe, offline/stale/unavailable labeling, brief export/share redaction, and owner-decision evidence are recorded.
- Incident & Recovery production rollout is blocked until Android workflow visual QA, real coordinate packet, Dispatch recovery CAD/emergency ping, offline/cached recovery compass, and owner-decision evidence are recorded. Debrief requests for community hazard reporting or route confidence adjustment are recorded as review-only and not published/applied automatically.
- Field Utilities production rollout is blocked until Android visual QA, emergency/recovery protocol device-flow evidence, weather parity evidence, offline/degraded Field Utilities evidence, and owner-decision evidence are recorded.
- Explore Trail Packs production rollout is blocked until Android visual QA, content review/moderation evidence, Explore-to-Navigate handoff evidence, privacy submission evidence, and owner-decision evidence are recorded.
- Fleet production rollout is blocked until Android Fleet profile/setup visual QA, multi-vehicle active selection, scale-ticket/profile evidence, offline persistence/migration evidence, and owner-decision evidence are recorded.
- Dashboard production rollout is blocked until Android Dashboard widget visual QA, command-center switching evidence, live/stale/unavailable widget source-label evidence, phone/landscape rotation evidence, and owner-decision evidence are recorded.
- Provider-backed Navigate candidate pins/actions and active route-line plus provider-candidate context still need real provider-backed validation before broad rollout.
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

Restricted closed field-test risk is accepted for the approved cohort, region/route labels, expiration, and rollback path recorded in `docs/campops/closed_field_test_risk_acceptance.md`.

That acceptance does not waive public release requirements, provider influence approval, telemetry/community publishing approval, or broad privacy/storage approval.

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

1. Re-run Android/device QA with real provider-backed Navigate candidate pins/actions and active route context.
2. Run real provider shadow validation for the target region/category before provider influence.
3. Record provider-specific coverage, freshness, unknown, stale, and conflict rates from real data.
4. Complete broad privacy/storage owner approval before real trip/debrief field-data rollout.
5. Keep AI assist, telemetry, and community publishing disabled unless separate approvals are recorded.
6. Re-run `npm run gate:closed-field-test:json` before any closed-field promotion checkpoint.
