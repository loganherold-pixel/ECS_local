# CampOps Closed Field-Test Readiness Gate

Date: 2026-05-17

Latest gate audit: 2026-05-17. `npm run gate:campops-live-readiness` reports **Closed field test ready**. `npm run gate:closed-field-test` reports **risk-accepted restricted field test**. Risk acceptance is accepted for the approved cohort/scope, so guarded closed-field testing may proceed under the restrictions in this document.

## Current Decision

Readiness category: **Closed field test ready with restrictions**.

Closed field-test status: **ready with restrictions**.

CampOps may move to guarded real-world closed field testing only for the approved cohort, route/region labels, and feature posture recorded in `docs/campops/closed_field_test_risk_acceptance.md`. This does not approve public release, global provider influence, telemetry, AI assist, or community publishing.

## Post Internal-Beta Flag Evaluation

Evaluation date: 2026-05-04.

Feature flag:

- Client/internal build flag: `EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA=true`.
- Local Node harness alias: `ENABLE_CAMPOPS_INTERNAL_BETA=true`.
- Default production/public posture: unset or `false`.

Flag-off behavior:

- CampOps route pins remain inactive.
- Navigate route/search-area scans do not request CampOps recommendation payloads.
- Camp Intel cannot open from CampOps pins.
- Production demo/mock fallback camps remain blocked.

Flag-on internal beta behavior:

- Deterministic CampOps recommendation-set surfaces may run for controlled internal testers.
- Navigate can render up to five qualifying CampOps pins through the shared ECS camp pin style.
- Camp Intel can open for visible CampOps pins and uses confidence-based, ECS-Inferred language.
- Weak candidates remain suppressed by conservative thresholds.

Still disabled unless separately approved:

- `campopsProviderAdaptersEnabled`
- `campopsAiAssistEnabled`
- `campopsTelemetryEnabled`
- `campopsDebriefCommunityPublishingEnabled`
- production demo/mock camps

Completed implementation and smoke evidence:

| Check | Latest result | Notes |
| --- | --- | --- |
| Focused CampOps scripts | Pass | 36 focused CampOps scripts passed after fixture/test assertion updates. |
| CampOps beta-gate/Navigate checks | Pass | 10 selected scripts passed, including rollout flags, map pin parity, lifecycle, Camp Intel popup, filtering, search integration, Navigate route confidence, tools search route flow, and campsite map tools. |
| TypeScript | Pass | `npx tsc --noEmit --pretty false`. |
| Lint | Pass | `npm run lint`. |
| App smoke | Pass with sandbox skips | `npm run smoke` passed inspect-project; child process stages were skipped by sandbox `spawn EPERM`. Direct TypeScript/lint/build checks passed separately. |
| Web export/build | Pass | `npm run build` exported `dist`; Expo logged sandbox `sharp --version` EPERM during shutdown after export. |
| Full `npm test` | Not available | `package.json` has no generic `test` script; focused custom harnesses are used instead. |
| Broad custom regression sweep | Incomplete | A larger scripted sweep was intentionally interrupted before completion. Completed checks showed no CampOps-caused regression. |
| CampOps live-readiness gate | Expected block | `npm run gate:campops-live-readiness` reports internal beta ready but closed field test blocked. |

App-wide release gate status:

- TypeScript, lint, smoke inspect, and web export are documented above.
- No unresolved CampOps-caused app-wide regression is known from completed checks.
- The full custom regression sweep is not complete evidence because it was interrupted.

Recommended next action: keep CampOps enabled only behind `EXPO_PUBLIC_ENABLE_CAMPOPS_INTERNAL_BETA=true` or the approved closed-field build controls. Proceed only with the restricted field-test cohort and keep AI assist, telemetry, and community publishing disabled unless separately approved.

Use `docs/campops/closed_field_test_blocker_burndown.md` to separate code-completable gate scaffolding from human/device/provider/privacy approval work. That burn-down checklist does not change the blocked status.

Risk acceptance, if used, must be recorded in `docs/campops/closed_field_test_risk_acceptance.md`. Risk acceptance does not convert missing Android/device evidence, provider readiness, privacy/storage approval, or debrief owner approval into completed evidence. It only creates a restricted closed field-test posture when product, safety, privacy, and engineering owners explicitly accept the remaining risk with real owners, dates, scope, expiration, incident contact, and rollback path.

Primary evidence posture:

- `internal_beta_evidence.md` is older internal-beta evidence and should be refreshed after the restricted field-test run.
- `provider_readiness_region_001.md` is fixture-backed and not approved for provider influence; it records that real upstream Region 001 evidence is still required.
- `mobile_qa_evidence.md` records pass-with-issues Android evidence for guarded closed-field validation, including visible QA-only pins, Camp Intel popup actions, and cramped-screen phone validation. Real provider-backed route-line candidate validation remains a rollout follow-up.
- `privacy_storage_review.md` approves guarded closed-field private/local data posture; telemetry and community publishing remain disabled.
- `ai_real_output_review.md` did not run a real model; AI assist must remain disabled unless a configured model/config review is approved.
- `live_readiness_gates.md` records the live implementation gates and keeps closed field testing blocked until Android/device QA, provider/source, and privacy/storage gates pass or are explicitly risk-accepted.

## Required Gates

| Gate | Required criterion | Current status | Closed field-test effect |
| --- | --- | --- | --- |
| P0 issues | No unresolved P0 unsafe or privacy-critical issues from `internal_beta_issue_rubric.md`. | No known open P0 from fixtures. | Pass for current evidence, continue monitoring. |
| P1 recommendation-trust issues | No unresolved P1 recommendation-trust issues, including legal/access overclaiming, stale data shown as current, AI hard-gate override, or legacy contradiction. | No known fixture P1, but real provider/model/mobile evidence is incomplete. | Partial; cannot pass until real evidence exists. |
| CampOps live readiness gates | Rendering, scoring, safety/copy, privacy/storage, provider/source, and Android/device QA gates pass or are explicitly risk-accepted. | Implementation gates pass for internal beta; Android/device QA and privacy/storage are complete for guarded restricted validation; provider influence remains unapproved. | Blocks provider-influenced field use unless provider readiness is approved; restricted closed-field testing may proceed only inside accepted scope. |
| Provider readiness | Provider readiness approved for the target region label and category. | Not approved. Region 001 report is fixture-backed and shadow-only. | Blocks closed field test provider influence. |
| Android/device QA | CampOps card and endpoint visual states completed on Android/emulator or physical device, with evidence. | Complete for guarded restricted validation using dev-only QA route, QA-only candidate viewport, popup/action checks, and cramped-screen phone viewport. | Pass with issues; real provider-backed route-line candidate validation remains a rollout follow-up. |
| Privacy/storage review | Retention, deletion, encryption status, owner decisions, and acceptable data-use posture approved for closed field testers. | Guarded closed-field private/local posture is approved; broad real trip/debrief data owners remain TBD. Local debrief `localStorage` is unencrypted by CampOps. | Blocks broad real-data collection; closed field test remains restricted to controlled tester data. |
| Community publishing | Community debrief publishing remains disabled. | Off and blocked by policy. | Pass; must remain off. |
| Telemetry | Telemetry remains off unless sink, retention, access, and privacy validation are approved. | Off by default; sink not approved. | Pass only if kept off. |
| AI assist | AI assist is either disabled or approved for the exact model/config after real-output review. | Real model not run; AI must remain off. | Pass only with AI disabled. |
| Rollback path | Rollback tested for beta surfaces and provider/AI/telemetry/community gates. | Rollout tests and rollback helper exist. | Pass for internal beta; re-test with any closed field-test build. |
| Field-test scenarios | Approved route/camp scenarios are defined by region label, not precise private coordinates. | Field-test plan defines suggested labels, but no approved target test cell is recorded. | Partial; must define target region/route labels before test. |

## Live Readiness Gates

`npm run gate:campops-live-readiness` is the CampOps-specific live readiness gate. It must pass before CampOps is described as closed-field-test ready, unless every missing gate is explicitly risk-accepted in `closed_field_test_risk_acceptance.md`.

| Gate | Required criterion | Current status | Closed field-test effect |
| --- | --- | --- | --- |
| Rendering | Pins render on Navigate Mapbox, do not duplicate, use ECS camp pin style, and open/dismiss Camp Intel popups. | Wired through shared Camp Scout map markers and popup path; Android QA evidence captured for QA-only candidate pins and actions. | Pass for guarded restricted validation; real provider-backed route-line candidate validation remains a rollout follow-up. |
| Scoring | Below-threshold candidates are suppressed, route candidates are limited to top 5, nearby candidates are deduped, and production demo fallback camps are blocked. | Conservative thresholds and regression tests exist. | Pass for implementation. |
| Safety/copy | No overconfident legal/safety claims; `ECS-Inferred` copy and unverified access/legal labels are used. | Safe confidence/verification copy is present. | Pass for implementation; keep scanning copy changes. |
| Privacy/storage | Saved camp storage and report-unusable data handling are documented, coordinates are not logged unnecessarily, and sensitive persistence has owner approval. | Documented; owner approval remains incomplete. | Blocks closed field test unless risk-accepted. |
| Provider/source | Source confidence is represented, provider limitations are documented, and region/category readiness is explicit and approved. | Documented; provider influence not approved for target region/category. | Blocks provider influence and closed field test unless risk-accepted as shadow-only. |
| Android/device QA | Device evidence exists for map rendering, pin tap, popup scroll/dismiss, save, navigate, and report flows. | QA packet exists and device execution/evidence is complete for guarded restricted validation with QA-only non-live candidates. | Pass with issues; does not approve provider-backed regional rollout. |

## Restricted Field-Test Posture

If and only if the required gates pass, closed field testing must use this restricted posture:

- Approved testers only.
- Approved region labels and route labels only.
- Approved camp/route scenarios only; do not add ad hoc public/tester routes without review.
- `campopsRecommendationsEnabled=true` only for the approved cohort/build.
- `campopsEndpointRecommendationEnabled=true` only for delayed-day test scenarios.
- `campopsDecisionPointsEnabled=true` only when route/progress data supports review.
- `campopsSourceTransparencyEnabled=true` for every closed field test.
- `campopsProviderValidationShadowModeEnabled=true` for provider diagnostics.
- `campopsProviderAdaptersEnabled=true` only for provider categories explicitly approved for the target region.
- `campopsAiAssistEnabled=false` unless the active model/config has approved real-output review.
- `campopsDebriefCommunityPublishingEnabled=false`.
- `campopsTelemetryEnabled=false` unless a sink is explicitly approved.
- Manual privacy-safe feedback is required after every test session.

If the required gates do not pass, closed field testing remains blocked unless `docs/campops/closed_field_test_risk_acceptance.md` is explicitly accepted. A risk-accepted restricted test must preserve this same posture and must not treat incomplete evidence as approved.

## Provider Influence Limits

Provider influence must be limited by category and region:

| Category | Requirement before influence | Current status |
| --- | --- | --- |
| Legal/access | Real target-region provider validation with accepted coverage, freshness, conflict, stale, and unknown rates. | Not approved. |
| Closure/seasonal restriction | Real target-region provider validation with accepted freshness and restriction-window behavior. | Not approved. |
| Fire restriction | Real target-region provider validation with accepted restriction and red-flag data behavior. | Not approved. |
| Weather | Real target-region provider validation with freshness appropriate for field decisions. | Not approved. |
| Service/resupply | Real target-region provider validation with accepted coverage and open/unknown status behavior. | Not approved. |

Categories that are not approved must remain shadow-only or unknown in recommendations.

Risk acceptance does not approve provider influence. Provider output must remain disabled, shadow-only, or unknown for every unapproved category and region.

Run `npm run gate:provider-readiness` before requesting provider influence for closed field-test review. The gate must pass for the exact target region label and provider categories before `campopsProviderAdaptersEnabled` can affect recommendations.

Run `npm run gate:privacy-storage` before closed field-test data posture review. The gate must pass before broader real trip/debrief field data is used by closed field testers.

Run `npm run gate:ai-assist` before enabling CampOps AI assist for closed field-test review. The gate may pass while AI assist is disabled, but `campopsAiAssistEnabled` must remain false until exact active model/config real-output approval is recorded.

## Required Scenario Set

Before the first closed field-test session, define a test packet with region and route labels only:

- On-time normal route.
- Two-hour delay with planned camp arriving after sunset.
- Trailer or full-size vehicle access/turnaround scenario.
- Low fuel margin or next-fuel uncertainty.
- Low water margin or next-day water concern.
- Offline cached source data.
- Offline no-cache or missing-source state.
- Stale closure, weather, fire, or service data.
- Legacy result list differs from CampOps endpoint recommendation.
- Private debrief capture without community publishing.

Do not include precise private coordinates, private user ids, vehicle identifiers, raw AI prompts, private debrief notes, or raw provider payloads in shared test packets.

## What Blocks Closed Field Testing

Closed field testing is blocked by any of the following:

- Any unresolved P0 issue.
- Any unresolved P1 recommendation-trust issue.
- CampOps live readiness gate blocked or not explicitly risk-accepted.
- Provider readiness not approved for the target region/category when provider influence is requested.
- Android/device QA evidence missing for core recommendation states.
- Privacy/storage owner review not approved for the test data posture.
- Community publishing enabled.
- Telemetry enabled without sink approval.
- AI assist enabled without approved real-output behavior for the active model/config.
- Broad real trip/debrief data collection before retention, encryption, deletion, and access-control owners are assigned.
- Community-safe debrief output becoming public without `approved_anonymized` moderation state.
- Durable provider/source caches being added without documented storage location, clear/delete hooks, and encryption status.
- Rollback path not verified for the active build.
- Route/camp scenarios not defined by region label.
- Manual feedback path not available to testers.

Closed field testing can proceed with any of these blockers only when `docs/campops/closed_field_test_risk_acceptance.md` is explicitly accepted by product, safety, privacy, and engineering for a restricted closed field-test scope. AI, telemetry, and community publishing remain disabled unless separately approved, and provider influence remains disabled/shadow-only for unapproved categories.

## Current Required Follow-Up

1. Execute the restricted closed-field run only inside the approved cohort, route labels, region labels, and expiration window.
2. Re-run `npm run gate:campops-live-readiness` after any CampOps route/pin/popup/scoring changes.
3. Complete real provider-backed active route-line candidate validation before provider-influenced regional rollout.
4. Run real provider shadow validation for Region 001 and any additional target region label before requesting provider influence.
5. Keep AI assist disabled, or run and approve real-output review for the exact model/config before enabling it.
6. Keep telemetry and community publishing disabled unless sink/privacy/community export approvals are separately recorded.
7. Treat local debrief persistence as unencrypted and keep private debrief notes out of shared evidence, AI prompts, telemetry, and public/community exports.
8. Define each field-test scenario packet using labels only; never include precise private coordinates, raw provider payloads, raw AI prompts, private user IDs, vehicle identifiers, or private debrief notes in shared evidence.
9. Re-run rollout/rollback tests for the closed field-test build.
10. Update `internal_beta_evidence.md` after the restricted run with tester count, device coverage, provider readiness, issue summary, and revised recommendation.

## Evidence Update Template

Use `docs/campops/closed_field_test_evidence_template.md` for future closed field-test evidence updates. Leave fields as `TODO`, `not run`, `not approved`, or `blocked` until actual evidence exists. The template does not make CampOps ready for closed field testing.

## Readiness Outcome

Current outcome: **risk-accepted restricted closed field test**.

CampOps may proceed only as a **risk-accepted restricted closed field test** inside the approved cohort/scope, with community publishing off, telemetry off unless approved, AI disabled unless approved, and provider influence disabled or shadow-only for unapproved categories and regions.

This path preserves the evidence truth: provider readiness remains unapproved for influence, broad real trip/debrief rollout is not approved, AI/telemetry/community publishing remain disabled, and real provider-backed route-line validation is still required before broader regional rollout.
