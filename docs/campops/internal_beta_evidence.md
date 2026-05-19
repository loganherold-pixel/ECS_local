# CampOps Internal Beta Evidence Report

Date: 2026-05-17

## Decision Summary

Closed-field-test readiness recommendation: **risk-accepted restricted closed field test**.

CampOps has enough implementation coverage, fixture coverage, Android visual QA evidence, privacy defaults, and controlled activation gates to proceed only inside the restricted closed-field scope recorded in `docs/campops/closed_field_test_risk_acceptance.md`.

This is not public release approval. Provider influence remains unapproved outside accepted shadow-only validation, AI assist remains disabled unless separately approved, telemetry remains disabled unless separately approved, and community publishing remains disabled.

## Beta Evidence Snapshot

| Evidence area | Current status |
| --- | --- |
| Beta dates | Internal beta preparation and controlled enablement artifacts are recorded. Restricted closed-field risk acceptance expires 2026-06-16. |
| Tester count | No completed real-world closed-field tester sessions recorded in this repo yet. |
| Device coverage | Android evidence captured on `SM-X230`, including tablet portrait, phone-size portrait, and phone landscape validation where applicable. |
| Region labels tested | `Region 001 - Northern Nevada controlled provider shadow cell`, fixture-backed/shadow-only unless future real provider evidence is accepted. |
| Provider mode used | Shadow validation only; provider output is not approved to influence recommendations. |
| Flags enabled | Fixture/test runs used explicit CampOps flags as needed. Closed-field activation must use the approved risk-accepted restricted scope, not broad raw rollout flags. |
| AI assist mode | Fixture/adversarial tests pass. Real-output review remains incomplete for enabling AI assist, so AI assist remains off. |
| Offline/cached scenarios tested | Fixture and contract tests cover offline/stale behavior. Navigate camp-layer smoke confirms zoom-gated/no-result behavior without broad-area pin loading. |
| Endpoint recommendation scenarios tested | Fixture tests cover endpoint recommendation generation and decision points. Real route field sessions remain follow-up. |
| Two-hour delay scenarios tested | Automated two-hour delay acceptance fixture passes. Real route/provider/mobile two-hour delay field evidence remains follow-up. |
| Privacy issues found | No P0 privacy leak found in current tests. Community publishing and telemetry remain disabled/gated. CampOps local debrief `localStorage` is treated as unencrypted. |
| Source confidence issues found | No fixture conflict failure found. Real provider confidence, unknown, stale, and conflict rates remain unproven. |
| Mobile UI issues found | Dev visual QA route, candidate-producing QA pins, Camp Intel popup actions, Save Camp, Navigate Here, Report Unusable, Dismiss, and phone-size popup action layout were captured. Real provider-backed Navigate candidate pins/actions remain follow-up. |
| Legacy coexistence issues found | No new blocker from fixture tests. Continue watching for contradictory copy/ranking during field review. |

## Flags And Modes

Internal beta and restricted closed-field activation must use the approved activation helpers and tester/cohort gates.

Allowed controlled internal beta surfaces:

- `campopsRecommendationsEnabled`
- `campOpsRecommendationSetEnabled`
- `campopsEndpointRecommendationEnabled`
- `campopsDecisionPointsEnabled`
- `campopsSourceTransparencyEnabled`
- `campopsProviderValidationShadowModeEnabled`

Must remain off:

- `campopsDebriefCommunityPublishingEnabled`
- `campopsTelemetryEnabled`
- `campopsTelemetrySinkApproved`

Must remain off unless explicitly approved for the exact test cell:

- `campopsProviderAdaptersEnabled`
- `campopsAiAssistEnabled`

## Scenario Coverage

| Scenario | Evidence | Status |
| --- | --- | --- |
| Feature flag off legacy behavior | Rollout/search integration tests | Pass |
| Feature flag on CampOps cards | UI contract tests, fixtures, Android dev visual QA | Pass with restricted QA-only evidence |
| Recommended/backup/emergency cards | UI contract tests and Android visual QA route | Pass with QA-only evidence |
| Offline cached data | Offline/stale source tests and fixture states | Pass in fixtures |
| Offline no cached data | Offline/stale source tests and fixture states | Pass in fixtures |
| Endpoint recommendation | Safe endpoint tests | Pass in fixtures |
| Decision point | Safe endpoint tests | Pass in fixtures |
| Two-hour delay | Acceptance fixture test | Pass in fixtures |
| Trailer convoy | Convoy/scoring/recommendation tests | Pass in fixtures |
| Low fuel/water | Resource debt/recommendation tests | Pass in fixtures |
| Stale/conflicting source transparency | Source conflict/offline tests | Pass in fixtures |
| AI explanation | AI assist/adversarial tests | Pass in fixtures; real model use remains gated/off |
| Debrief privacy | Debrief/privacy tests | Pass for guarded closed-field posture |
| Internal beta feedback privacy | Feedback tests | Pass |

## Issue Summary

| Severity | Count | Summary |
| --- | ---: | --- |
| P0 | 0 known open | No current test evidence of unsafe recommendation, privacy leak, telemetry leak, AI hard-gate override, or provider flag bypass. |
| P1 | 0 known open from fixtures | No fixture evidence of recommendation trust failure. Real provider and real model evidence remain incomplete. |
| P2 | 3 evidence gaps | Real provider-backed candidate validation, real tester sessions, and real route/provider/mobile two-hour delay evidence remain incomplete. |
| P3 | TBD | Copy/layout polish must continue during restricted sessions. |
| P4 | TBD | Enhancements deferred until after restricted evidence expands. |

Severity definitions live in `docs/campops/internal_beta_issue_rubric.md`.

## Unresolved Blockers And Restrictions

| Item | Severity | Current effect | Required follow-up |
| --- | --- | --- | --- |
| Real provider readiness not approved for target region/category influence | P1 risk / rollout blocker | Blocks provider influence and broad rollout. Allowed only as shadow-only under the restricted risk-accepted scope. | Run shadow validation with real provider outputs for the target region label; approve coverage/freshness/conflict/unknown thresholds. |
| Real provider-backed Navigate candidate pins/actions incomplete | P2 evidence gap / rollout blocker | Does not block the restricted QA-only evidence packet, but blocks broad provider-backed rollout. | Re-run Navigate with a real provider-backed candidate-producing route/viewport and capture pin, popup, Save Camp, Navigate Here, and Report Unusable evidence. |
| No completed real-world closed-field tester sessions | P2 evidence gap | Restricted test may begin only inside accepted scope; public release remains blocked. | Run controlled closed-field sessions and capture privacy-safe feedback using labels only. |
| Real field two-hour delay evidence absent | P1/P2 risk | Fixture test passes, but real route/provider/mobile behavior has not been exercised. | Run delayed-day scenario in controlled closed-field scope with labels only, no precise private coordinates in shared reports. |
| AI assist real-output acceptance incomplete | P1 risk if AI is enabled | AI assist must remain off. | Keep AI off or complete `ai_real_output_review.md` for the active model/config. |
| Broad privacy/storage owner review remains incomplete | P2/P1 risk depending data use | Guarded private/local closed-field posture is accepted; broad real trip/debrief rollout remains blocked. | Complete owner decisions for encryption-backed storage, durable provider/source caches, telemetry sinks, public-safe export workflows, retention, deletion, and access controls. |

## Privacy Review Notes

Current evidence supports guarded restricted closed-field execution:

- Debriefs default private.
- Internal beta feedback defaults private and redacts coordinate-like notes.
- Community publishing remains off.
- Telemetry remains off and sink approval is required.
- AI prompt construction tests exclude unnecessary private fields.
- CampOps local debrief `localStorage` must be treated as unencrypted.

Broad real trip/debrief data use remains blocked until retention, deletion, encryption, and owner decisions are accepted.

## Source Confidence Notes

Current provider readiness evidence is fixture-backed or shadow-only:

- Region 001 uses shadow mode unless future real upstream evidence is accepted.
- Provider output must not affect recommendations where provider influence is not approved.
- Coverage/freshness/confidence was high in fixtures only.
- Standalone access provider coverage remains combined/documented rather than independently approved.
- Real upstream source quality is unproven.

Provider influence must remain off until real target-region evidence is accepted.

## Mobile UI Notes

Current Android evidence:

- Dev-only CampOps visual QA route opened on device.
- QA-only non-live pins were visible and clearly labeled.
- Camp Intel popup actions were exercised: Save Camp, Navigate Here, Report Unusable, and Dismiss.
- Phone-size cramped-screen popup layout was validated.
- Navigate camp-layer smoke opened with Mapbox stable and zoom-gated/no-result behavior when no candidates were available.

Remaining Android follow-up:

- Exercise a real provider-backed candidate-producing route or viewport.
- Capture active route-line plus provider-candidate context.
- Validate provider-backed Camp Intel actions without fake live camp data.

## Closed Field-Test Readiness Recommendation

Recommendation: **risk-accepted restricted closed field test**.

CampOps may proceed only with:

- approved tester/cohort/build scope
- approved region/route/scenario labels
- provider validation shadow mode unless provider influence is separately approved
- source transparency visible
- telemetry off unless separately approved
- community publishing off
- AI assist off unless the active model/config has approved real-output review
- private/local guarded data posture only
- no precise private coordinates in shared evidence

## Required Next Evidence

1. Run real provider-backed Navigate candidate validation for the target region/category.
2. Capture provider-specific coverage, freshness, unknown, stale, and conflict rates from real upstream data.
3. Run at least one controlled closed-field tester session for delayed-day endpoint recommendation.
4. Capture privacy-safe feedback and classify issues using `internal_beta_issue_rubric.md`.
5. Update this report with tester count, provider evidence, route labels, issue summary, and revised recommendation.
6. Re-run `npm run gate:closed-field-test:json` before each closed-field promotion checkpoint.

Future evidence updates can use `docs/campops/closed_field_test_evidence_template.md`. Template placeholders must remain placeholders until real tester, device, provider, privacy, AI, rollback, and issue evidence is collected and reviewed.
