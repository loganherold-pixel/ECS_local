# CampOps Internal Beta Evidence Report

Date: 2026-05-01

## Decision Summary

Closed-field-test readiness recommendation: **not ready**.

CampOps has enough implementation, fixture coverage, privacy defaults, and controlled activation gates to continue internal beta evaluation. It is not ready for closed field testing because provider readiness is not approved for a real target region, Android/device visual-state QA is incomplete, and real field evidence has not been captured.

Do not proceed to closed field test until the unresolved blockers in this report are resolved or formally risk-accepted by product, safety, privacy, and engineering.

## Beta Evidence Snapshot

| Evidence area | Current status |
| --- | --- |
| Beta dates | No completed internal beta run recorded yet. Internal beta preparation and controlled enablement artifacts are dated 2026-05-01. |
| Tester count | 0 completed tester sessions recorded in this repo. |
| Device coverage | Android hardware was detected, but CampOps visual-state execution was blocked by missing runtime fixture/dev route. No CampOps card screenshots were captured. |
| Region labels tested | `Region 001 - Northern Nevada controlled provider shadow cell`, fixture-backed only. |
| Provider mode used | Shadow validation only; provider output was not allowed to affect production recommendations. |
| Flags enabled | Fixture/test runs used explicit CampOps flags as needed. Defaults remain off. Internal beta activation is controlled by tester/cohort gate. |
| AI assist mode | Fixture/adversarial tests pass. Real-output review harness exists, but AI assist should remain off unless the active model/config has approved real-output behavior. |
| Offline/cached scenarios tested | Fixture and contract tests cover offline/stale behavior. No on-device offline visual-state evidence captured. |
| Endpoint recommendation scenarios tested | Fixture tests cover endpoint recommendation generation and decision points. No real route field session recorded. |
| Two-hour delay scenarios tested | Automated two-hour delay acceptance fixture passes. No real field/device session recorded. |
| Privacy issues found | No P0 privacy leak found in current tests. Community publishing and telemetry remain disabled/gated. Offline storage encryption/ownership remains a broader rollout concern. |
| Source confidence issues found | No fixture conflict failure found. Real provider confidence, unknown, stale, and conflict rates remain unproven. |
| Mobile UI issues found | No on-device CampOps UI issue found because visual-state execution was blocked. This remains an evidence gap. |
| Legacy coexistence issues found | No new blocker from fixture tests. Legacy coexistence remains a known P2/P1 risk until mobile review confirms no contradictory copy/ranking. |

## Flags And Modes

Internal beta must use `resolveCampOpsInternalBetaActivation()` and approved tester/cohort gates.

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
| Feature flag on CampOps cards | UI contract tests and fixtures | Partial; no device screenshot evidence |
| Recommended/backup/emergency cards | UI contract tests | Partial; no device screenshot evidence |
| Offline cached data | Offline/stale source tests and fixture states | Partial; no device visual evidence |
| Offline no cached data | Offline/stale source tests and fixture states | Partial; no device visual evidence |
| Endpoint recommendation | Safe endpoint tests | Pass in fixtures |
| Decision point | Safe endpoint tests | Pass in fixtures |
| Two-hour delay | Acceptance fixture test | Pass in fixtures |
| Trailer convoy | Convoy/scoring/recommendation tests | Pass in fixtures |
| Low fuel/water | Resource debt/recommendation tests | Pass in fixtures |
| Stale/conflicting source transparency | Source conflict/offline tests | Pass in fixtures |
| AI explanation | AI assist/adversarial tests | Pass in fixtures; real model use remains gated |
| Debrief privacy | Debrief/privacy tests | Pass |
| Internal beta feedback privacy | Feedback tests | Pass |

## Issue Summary

| Severity | Count | Summary |
| --- | ---: | --- |
| P0 | 0 known open | No current test evidence of unsafe recommendation, privacy leak, telemetry leak, AI hard-gate override, or provider flag bypass. |
| P1 | 0 known open from fixtures | No fixture evidence of recommendation trust failure. Real provider and real model evidence remains incomplete. |
| P2 | 3 evidence gaps | Mobile visual-state execution blocked; real provider confidence unknown; legacy coexistence not reviewed on-device. |
| P3 | TBD | Copy/layout polish must be collected during internal beta sessions. |
| P4 | TBD | Enhancements deferred until after internal beta evidence exists. |

Severity definitions live in `docs/campops/internal_beta_issue_rubric.md`.

## Unresolved Blockers

| Blocker | Severity | Why it blocks closed field test | Required follow-up |
| --- | --- | --- | --- |
| Real provider readiness not approved for target region | P1 risk / rollout blocker | Fixture-backed Region 001 shadow validation proves the harness, not real legal/access, closure, fire, weather, or service quality. | Run shadow validation with real provider outputs for the target region label; approve coverage/freshness/conflict/unknown thresholds. |
| Android/device CampOps visual-state QA incomplete | P2 evidence gap / rollout blocker | Hardware was available, but no runtime fixture route rendered CampOps cards on-device. Critical warning visibility is not proven. | Add dev-only fixture route or equivalent, run `mobile_qa.md` matrix, capture screenshots/evidence. |
| No completed internal beta tester sessions | P2 evidence gap | Tester count is zero, so user comprehension, source-warning clarity, and endpoint usefulness are not validated. | Run controlled internal tester sessions and capture feedback using `campOpsInternalBetaFeedback`. |
| Real field two-hour delay evidence absent | P1/P2 risk | Fixture test passes, but real route/provider/mobile behavior has not been exercised. | Run delayed-day scenario in controlled internal beta with labels only, no precise private coordinates in shared reports. |
| AI assist real-output acceptance is incomplete for tester enablement | P1 risk if AI is enabled | Fixture/parser guardrails pass, but broad AI assist must remain off without approved active model/config review. | Keep AI off or complete `ai_real_output_review.md` for the active model/config. |
| Privacy/storage owner review remains broader rollout concern | P2/P1 risk depending data use | Current defaults are conservative, but encryption/retention/deletion ownership must be accepted before broader real trip/debrief data use. | Complete owner decisions in `privacy_storage_review.md`; keep community publishing and telemetry off. |

## Privacy Review Notes

Current evidence supports controlled internal beta preparation:

- Debriefs default private.
- Internal beta feedback defaults private and redacts coordinate-like notes.
- Community publishing remains off.
- Telemetry remains off and sink approval is required.
- AI prompt construction tests exclude unnecessary private fields.

Closed field test should not use broad real trip/debrief data until retention, deletion, encryption, and owner decisions are accepted.

## Source Confidence Notes

Current provider readiness evidence is fixture-backed:

- Region 001 used shadow mode only.
- Provider output did not affect recommendations.
- Coverage/freshness/confidence was high in fixtures.
- Standalone access provider coverage remains missing.
- Real upstream source quality is unproven.

Provider influence must remain off until real target-region evidence is accepted.

## Mobile UI Notes

Current mobile evidence:

- Android target was detected.
- Expo Go was present.
- No ECS native package was detected.
- No dev route or Storybook-like entry point exists to render CampOps fixture states on-device.
- No screenshots were captured.

This blocks closed field-test readiness because stale/missing/source warnings and compact card behavior must be visible in field-mode UI.

## Closed Field-Test Readiness Recommendation

Recommendation: **not ready**.

Reasons:

- Provider readiness is not approved for the target region.
- Android/device QA is incomplete.
- No internal beta tester sessions are recorded.
- No real route/provider/mobile two-hour delay evidence is recorded.
- AI assist must remain off unless active real-output behavior is approved.

CampOps may continue controlled internal beta execution with:

- approved tester/cohort gates
- provider validation shadow mode only
- telemetry off
- community publishing off
- provider influence off unless explicitly approved
- AI assist off unless the active model/config has approved real-output review

## Required Next Evidence

1. Add a dev-only CampOps visual QA route or equivalent fixture entry point.
2. Re-run Android/device QA and attach screenshot references for core states.
3. Run real provider shadow validation for the target region label.
4. Run at least one internal beta tester session for delayed-day endpoint recommendation.
5. Capture internal beta feedback and classify issues using `internal_beta_issue_rubric.md`.
6. Update this report with tester count, device evidence, region/provider evidence, and P0/P1/P2 status before reconsidering closed field test.

Future evidence updates can use `docs/campops/closed_field_test_evidence_template.md`. Template placeholders must remain placeholders until real tester, device, provider, privacy, AI, rollback, and issue evidence is collected and reviewed.
