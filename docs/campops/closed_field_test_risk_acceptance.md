# CampOps Closed Field-Test Risk Acceptance

Date: 2026-05-01

Status: accepted

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

## Risk-Accepted Incomplete Items

These items are not approved or complete. They are explicitly risk-accepted only if the required sign-offs above are completed.

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

## Decision

- Status: accepted
- Decision summary: Guarded closed field-test activation accepted with restrictions. This accepts the listed incomplete evidence and approval risks for the approved tester cohort only; it does not approve public release, global provider influence, telemetry, AI assist, or community publishing.
- Remaining concerns: CampOps remains restricted to the approved closed-field scope. Android pin/popup/action QA, cramped-screen QA, broader provider coverage, telemetry sinks, community publishing, and public-safe exports remain follow-up work before broad release.
