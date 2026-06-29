# CampOps Closed Field-Test Risk Acceptance

Date: 2026-06-29

Status: expired

This risk acceptance expired on 2026-06-16 and is intentionally retired as of 2026-06-29. It is preserved as historical sign-off evidence for the prior restricted APK field-test scope only. It must not be used to waive evidence gates, approve new tester sessions, approve provider influence, or authorize any run outside the expired scope. Any future risk-accepted closed-field run requires renewed product, safety, privacy, and engineering sign-off with a new expiration date.

Risk acceptance mode:
- restricted_closed_field_test_only

## Required Sign-Offs

- Product owner: L. Herold
- Product approval date: 2026-05-17
- Safety owner: L. Herold
- Safety approval date: 2026-05-17
- Privacy owner: L. Herold
- Privacy approval date: 2026-05-17
- Engineering owner: L. Herold
- Engineering approval date: 2026-05-17

## Approved Scope

- Approved tester cohort: L. Herold
- Maximum tester count: 20
- Approved build identifier: 842
- Approved app version/commit: v1.0.0
- Approved region labels: Pacific, Northwest, South, Mid-West, East
- Approved route labels: Navigated
- Approved scenario labels: Field
- Expiration date: 2026-06-16
- Incident contact: L. Herold
- Rollback owner: L. Herold
- Rollback command/path: disable `ENABLE_CAMPOPS_INTERNAL_BETA` and `ECS_CAMPOPS_INTERNAL_BETA`, keep all `DEFAULT_CAMP_OPS_RECOMMENDATION_ROLLOUT_CONFIG` flags false, and verify rollback with `npm run gate:pre-closed-field-test`

## APK Field-Test Readiness Sign-Off

- APK field-test readiness status: expired
- APK field-test approval date: 2026-06-02
- APK field-test approver: L. Herold
- APK field-test decision: historical sign-off only; the approval expired on 2026-06-16 and is not active for new sessions.
- Provider/source posture: provider output remains shadow-only or unknown unless exact category/region provider influence approval is separately recorded.
- Non-release posture: this does not approve public release, broad rollout, global provider influence, AI assist, telemetry, or community publishing.

## Risk-Accepted Incomplete Items

These items were not approved or complete. They were explicitly risk-accepted only for the historical scope before the 2026-06-16 expiration.

- Android/device QA evidence incomplete: yes
- Android QA required fields incomplete: yes
- Required Android QA scenario results incomplete: yes
- Required Android QA visual-state results incomplete: yes
- Screenshot/evidence references missing: yes
- Provider category/region approval missing: yes
- Privacy/storage approval incomplete: yes
- Private debrief data owner approval incomplete: yes

## Non-Negotiable Restrictions

- campopsAiAssistEnabled=false
- campopsTelemetryEnabled=false unless sink/privacy approval is separately recorded
- campopsDebriefCommunityPublishingEnabled=false
- campopsProviderAdaptersEnabled=false unless exact category/region approval exists
- campopsProviderValidationShadowModeEnabled may be true
- Provider output must remain shadow-only or unknown for unapproved categories
- Manual privacy-safe feedback is required after every session
- No public/community publishing
- No raw provider payloads in shared evidence
- No raw AI prompts
- No private coordinates in shared evidence
- No private user IDs
- No vehicle identifiers
- No private debrief notes in shared evidence

Provider category/region approval remains incomplete for recommendation influence. This incomplete item is accepted only for restricted APK field testing while provider output remains shadow-only or unknown for unapproved categories.

## Decision

- Status: expired
- Decision summary: Historical guarded closed field-test activation is retired. The expired acceptance no longer accepts incomplete evidence or approval risks for any new run; it does not approve public release, global provider influence, telemetry, AI assist, community publishing, or evidence-gate waivers.
- Remaining concerns: CampOps can proceed only when standard restricted readiness gates pass without relying on this expired acceptance, or when a new risk-acceptance packet is signed with a current expiration. Broader provider coverage, telemetry sinks, community publishing, and public-safe exports remain follow-up work before broad release.
