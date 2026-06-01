# CampOps Closed Field-Test Blocker Burn-Down

Date: 2026-05-17

## Current Status

- Closed field testing: risk-accepted restricted test
- Effective gate status: `risk_accepted_restricted_closed_field_test`
- Public release: blocked

This document separates code-completable work from real provider, device, privacy, and product/safety work. It does not approve public release, provider influence, AI assist, telemetry, community publishing, or broad privacy/storage rollout.

## Remaining Release Restrictions

- Provider readiness is not approved for target region/category influence.
- Real provider-backed active route-line candidate validation remains incomplete.
- AI real-output approval is incomplete; AI assist must remain disabled unless approved.
- Telemetry sink/privacy approval is incomplete; telemetry must remain disabled unless approved.
- Community publishing approval is incomplete; community publishing must remain disabled.
- Broad real trip/debrief privacy/storage approval remains incomplete beyond the guarded closed-field posture.

## Code-Completable Work

These items are implementation or repository-scaffolding work. Completion still requires verification output, but these do not by themselves approve broad rollout.

| Item | Current evidence | Status |
| --- | --- | --- |
| Dev-only CampOps visual QA route | `app/dev/campops-visual-qa.tsx`, `components/campops/CampOpsVisualQaScreen.tsx`, `mobile_qa_evidence.md` route instructions | Implemented and exercised for the current QA packet |
| Android QA evidence gate | `scripts/check-android-qa-evidence.mjs`, `npm run gate:android-qa` | Implemented; current Android evidence passes for guarded restricted validation |
| Provider readiness gate | `scripts/check-provider-readiness.mjs`, `npm run gate:provider-readiness` | Implemented; passes as shadow-only acceptable when provider influence is not requested; remains not approved for influence |
| Privacy/storage approval gate | `scripts/check-privacy-storage-approval.mjs`, `npm run gate:privacy-storage` | Implemented; guarded private/local closed-field posture is approved |
| AI assist approval gate | `scripts/check-ai-assist-approval.mjs`, `npm run gate:ai-assist` | Implemented; passes only because AI assist is disabled |
| Aggregate pre-closed-field-test gate | `scripts/run-pre-closed-field-test-gates.mjs`, `npm run gate:pre-closed-field-test` | Implemented; evidence mode passes for the current restricted packet with provider-readiness recorded as `shadow_only_acceptable_not_approved_for_influence` |

## Human/Device/Approval Work

These items require real execution, validation, or approval. Do not mark them complete without evidence.

| Item | Required evidence | Status |
| --- | --- | --- |
| Run Android/device QA using dev-only visual QA route | Completed execution in `mobile_qa_evidence.md` with Android hardware, emulator, or physical-device evidence | Complete for guarded QA-only restricted validation |
| Record tester/device/build/date evidence | Tester label, device class, Android version band, app/build label, execution date, and screenshot/artifact references | Complete for current Android QA packet; field tester session count remains pending |
| Run real provider shadow validation for target region labels | Region-label readiness report using real-shadow validation, without raw provider payloads or precise private coordinates | Not complete for provider influence |
| Obtain privacy/storage owner approval | Owner, approval date, retention, deletion path, storage/encryption status, access controls, debrief posture | Approved for guarded private/local closed-field posture only |
| Keep AI disabled or complete exact model/config real-output review | `campopsAiAssistEnabled=false`, or approved real-output review for the exact active model/config | AI disabled; approval not complete |
| Define region/route/camp labels only | Approved test packet using labels only, no private coordinates or raw provider payloads | Accepted for restricted scope; expand only by approval |
| Re-run rollback tests for active closed field-test build | Rollback verification for the exact build/cohort/flag posture | Required before each promotion checkpoint |

## Required Commands Before Restricted Closed Field Test

```bash
npm run gate:campops-live-readiness:json
npm run gate:closed-field-test:json
```

The closed-field gate reads the evidence docs and should report `ready_with_restrictions` / `risk_accepted_restricted_closed_field_test` for the current restricted packet.

## Expected Current Result

- `gate:campops-live-readiness:json`: `internal_beta_ready`, with provider/source risk-accepted as shadow-only for restricted test
- `gate:closed-field-test:json`: `ready_with_restrictions` / `risk_accepted_restricted_closed_field_test`
- `gate:pre-closed-field-test`: pass in evidence mode; provider-readiness stage is `shadow_only_acceptable_not_approved_for_influence`
- `gate:provider-readiness`: shadow-only acceptable when provider influence is not requested; not approved for influence
- `gate:ai-assist`: pass only while AI assist remains disabled

Passing those gates does not approve AI assist, telemetry, community publishing, provider influence, or public release.

## Non-Negotiables

- Do not fabricate Android/device QA evidence.
- Do not fabricate provider readiness or approval.
- Do not enable provider influence for unapproved region/category combinations.
- Do not enable AI assist without exact model/config real-output approval.
- Do not enable telemetry without sink/privacy approval.
- Do not enable community publishing.
- Do not treat local debrief `localStorage` as encrypted.
- Do not include precise private coordinates, raw provider payloads, raw AI prompts, private user IDs, vehicle identifiers, or private debrief notes in shared evidence.
