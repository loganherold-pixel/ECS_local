# CampOps Closed Field-Test Risk Acceptance

Date: 2026-05-01

Status: not accepted

Risk acceptance mode:
- restricted_closed_field_test_only

## Required Sign-Offs

- Product owner: L. Herold
- Product approval date: 2026-05-01
- Safety owner: L. Herold
- Safety approval date: 2026-05-01
- Privacy owner: L. Herold
- Privacy approval date: 2026-05-01
- Engineering owner: L. Herold
- Engineering approval date: 2026-05-01

## Approved Scope

- Approved tester cohort: L. Herold
- Maximum tester count: 20
- Approved build identifier: 842
- Approved app version/commit: v1.0.0
- Approved region labels: Pacific, Northwest, South, Mid-West, East
- Approved route labels: Navigated
- Approved scenario labels: Field
- Expiration date: N/A
- Incident contact: L. Herold
- Rollback owner: L. Herold
- Rollback command/path: N/A

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

- Status: not accepted
- Decision summary: Field Activation
- Remaining concerns: Expiration date and rollback command/path are not recorded with actionable values. Closed field testing remains blocked until those required scope fields are completed or all evidence gates pass.
