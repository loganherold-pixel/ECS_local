# CampOps Closed Field-Test Blocker Burn-Down

Date: 2026-05-01

## Current Status

- Closed field testing: blocked

This document separates work that can be completed in code from work that requires real Android/device evidence, provider validation, privacy/storage approval, or product/safety review. It does not mark closed field testing ready.

## Remaining Blockers

- Android/device QA evidence incomplete.
- Provider readiness not approved for target region/category influence.
- Privacy/storage owner approval incomplete.
- AI real-output approval incomplete; AI assist must remain disabled unless approved.

## Code-Completable Work

These items are implementation or repository-scaffolding work. Completion still requires verification output, but these do not by themselves make closed field testing ready.

| Item | Current evidence | Status |
| --- | --- | --- |
| Dev-only CampOps visual QA route | `app/dev/campops-visual-qa.tsx`, `components/campops/CampOpsVisualQaScreen.tsx`, `mobile_qa_evidence.md` route instructions | Implemented; device execution still required |
| Android QA evidence gate | `scripts/check-android-qa-evidence.mjs`, `npm run gate:android-qa` | Implemented; currently fails until evidence is complete |
| Provider readiness gate | `scripts/check-provider-readiness.mjs`, `npm run gate:provider-readiness` | Implemented; currently fails until target region/category approval exists |
| Privacy/storage approval gate | `scripts/check-privacy-storage-approval.mjs`, `npm run gate:privacy-storage` | Implemented; currently fails until owner approval is recorded |
| AI assist approval gate | `scripts/check-ai-assist-approval.mjs`, `npm run gate:ai-assist` | Implemented; currently passes only because AI assist is disabled |
| Aggregate pre-closed-field-test gate | `scripts/run-pre-closed-field-test-gates.mjs`, `npm run gate:pre-closed-field-test` | Implemented; currently fails while blockers remain |

## Human/Device/Approval Work

These items require real execution, validation, or approval. Do not mark them complete without evidence.

| Item | Required evidence | Status |
| --- | --- | --- |
| Run Android/device QA using dev-only visual QA route | Completed execution in `mobile_qa_evidence.md` with Android hardware, emulator, or physical-device evidence | Not complete |
| Record tester/device/build/date evidence | Tester label, device class, Android version band, app/build label, execution date, and screenshot/artifact references | Not complete |
| Run real provider shadow validation for target region labels | Region-label readiness report using real-shadow validation, without raw provider payloads or precise private coordinates | Not complete |
| Obtain privacy/storage owner approval | Owner, approval date, retention, deletion path, storage/encryption status, access controls, debrief posture | Not complete |
| Keep AI disabled or complete exact model/config real-output review | `campopsAiAssistEnabled=false`, or approved real-output review for the exact active model/config | AI disabled; approval not complete |
| Define region/route/camp labels only | Approved test packet using labels only, no private coordinates or raw provider payloads | Not complete |
| Re-run rollback tests for active closed field-test build | Rollback verification for the exact build/cohort/flag posture | Not complete |

## Required Command Before Closed Field Test

```bash
npm run gate:pre-closed-field-test
```

The aggregate gate runs the headless smoke test plus Android QA evidence, provider readiness, privacy/storage approval, AI assist approval, and closed field-test readiness gates.

## Expected Current Result

- fail
- closed field testing remains blocked

Current expected blocked gates:

- `gate:android-qa`
- `gate:provider-readiness`
- `gate:privacy-storage`
- `gate:closed-field-test`

`gate:ai-assist` may pass only while AI assist remains disabled. Passing that gate does not approve AI assist for testers.

## Non-Negotiables

- Do not fabricate Android/device QA evidence.
- Do not fabricate provider readiness or approval.
- Do not fabricate privacy/storage owner approval.
- Do not enable AI assist without exact model/config real-output approval.
- Do not enable telemetry without sink/privacy approval.
- Do not enable community publishing.
- Do not enable provider influence for unapproved region/category combinations.
