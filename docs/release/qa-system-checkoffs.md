# ECS QA System Check-Offs

Date: 2026-05-18

## Current Release Posture

ECS is ready for restricted closed field testing only.

The current automated gates show that core release diagnostics pass, CampOps core implementation is internal-beta ready, and the closed-field gate is `ready_with_restrictions`. Android/device QA evidence has a guarded pass-with-issues record. Provider influence, AI assist, telemetry, community publishing, and broad privacy/storage rollout remain restricted unless separately approved.

## Production Readiness Lane 1: Dispatch/Convoy Command

Status: implementation and Android evidence checks pass; production blocked by owner/privacy approvals.

Remaining tasks:

- Keep position sharing, public publishing, agency ingestion, SOS transmission, live radio/network integrations, and demo data disabled until explicitly approved.
- Record product, safety, privacy, and engineering production acceptance.

Evidence/gate:

- `npm run gate:dispatch-internal-beta` passes.
- `npm run gate:dispatch-convoy-production` is expected to remain blocked until position-sharing privacy/product approval and owner production acceptance are recorded.
- Production readiness doc: `docs/release/dispatch-convoy-production-readiness.md`.

## Automated Check-Offs

| Area | Check | Status | Evidence |
| --- | --- | --- | --- |
| Type safety | `npx tsc --noEmit --pretty false` | Passed | Direct TypeScript check completed. |
| Release diagnostics | `npm run test:release-readiness` | Passed | Release diagnostic wiring, scenario matrix, risk summary, and checklist sections are present. |
| Dispatch/Convoy internal beta | `npm run gate:dispatch-internal-beta` | Passed | Route, import, feature flag, emergency ping, mock/live, profile setup, location failure, modal, TypeScript, and lint gates pass. |
| Dispatch/Convoy production | `npm run gate:dispatch-convoy-production` | Blocked for production approvals | Implementation checks pass. Android visual matrix is captured after responsive fixes. GPS-allowed and GPS-denied ping evidence were captured. Event detail, Navigate Assist handoff, readiness prompt, and Navigate recovery route card evidence were captured. Position-sharing approval and owner production decision remain incomplete. |
| Top/bottom shell layout | `npm run test:top-banner-title-layout` | Passed | Test now verifies the current Slot shell plus CommandDock-owned tab labels. |
| CampOps live readiness | `npm run gate:campops-live-readiness:json` | Passed for internal beta; restricted closed-field posture | Rendering, scoring, safety/copy, privacy/storage implementation, and Android/device QA gates pass. Provider/source influence remains risk-accepted as shadow-only, not approved for real influence. |
| Closed field test gate | `npm run gate:closed-field-test:json` | Passed with restrictions | Gate reports `ready_with_restrictions` / `risk_accepted_restricted_closed_field_test`. Provider readiness is not approved for influence; AI assist remains disabled; telemetry and community publishing remain disabled. |
| Android dev-route smoke | adb device run on `SM-X230` | Pass with issues | `/dev/campops-visual-qa` opened through deep link on device. Visual states, candidate-producing QA pins, Camp Intel actions, and local QA-only action feedback were captured under `.smoke/campops-android-qa/`. |
| Navigate CampOps layer smoke | adb device run on `SM-X230` | Pass with follow-up | Navigate opened with Mapbox surface, current-location marker, top banner, bottom dock, and Camp Layers controls. Established Campgrounds and Dispersed Camping Eligibility toggled on, and the no-result/zoom-gated states behaved without broad-area pin loading. Provider-backed pin/popup actions remain future regional validation. |
| Phone-size CampOps smoke | adb display override on `SM-X230` at 720x1280 | Pass with issues | Dev visual QA route, candidate-producing QA viewport, visible QA-only pins, popup actions, and Navigate Camp Layers panel rendered in a cramped phone-size viewport. Layer toggles showed zoom-gate copy instead of broad-area pin loading. |

## Fixed In This QA Pass

- Hardened Incident & Recovery debrief handoff state so community hazard report requests and route confidence adjustment requests are explicitly review-only, never auto-published or automatically applied to live route confidence.
- Re-ran production-readiness regressions for Field Utilities, Explore Trail Packs, Weather, Dashboard, Fleet, Offline Navigation, Established Campgrounds, Bluetooth/Power/OBD2, Dispatch/Convoy, Auth, and Incident & Recovery. The sampled implementation checks pass; remaining blockers are evidence, provider/hardware validation, approval, or owner-decision items.
- Updated the top-banner layout regression check to match the current shell architecture, where `app/(tabs)/_layout.tsx` renders `<Slot />` and `CommandDock` owns visible tab labels.
- Removed overconfident CampOps copy that called an inferred candidate a "confirmed legal campsite"; it now says "confirmed allowed overnight stop" and keeps verification language.
- Captured partial Android hardware evidence for the dev-only CampOps visual QA route on a Samsung `SM-X230` tablet without recording the device serial in shared docs.
- Captured Navigate Mapbox camp-layer evidence on the same Android device: map render, layer panel, enabled campground/dispersed toggles, no-result state, and stable map after closing the panel.
- Captured phone-size Android evidence at 720x1280: CampOps visual QA guardrails remain readable, Navigate opens, and Camp Layers controls fit without top banner or bottom dock obstruction.
- Fixed the pre-setup route guard so the dev-only CampOps visual QA route can open through deep link in development builds.
- Captured candidate-producing CampOps Android evidence: QA-only non-live pins, Camp Intel popup actions, Save Camp, Navigate Here, Report Unusable, Dismiss, local QA-only feedback, and phone-size popup action layout.
- Hardened the provider-readiness gate so Region 001 can remain shadow-only only when the combined `legal/access` policy is documented, and provider influence requests are blocked for unapproved categories.
- Fixed an Android login background `expo-video` lifecycle warning by using the existing tactical fallback image on Android instead of mounting the native video surface during auth transitions.
- Completed the closed-field risk-acceptance draft scope values for expiration and rollback path, while leaving the acceptance status blocked until explicit acceptance exists.
- Fixed the pre-setup route guard so safety-critical Dispatch and Safety surfaces are reachable while vehicle recovery setup is required.
- Captured Android Dispatch/Convoy panel evidence on device through `planning-offline-sync:///alert` across tablet portrait, phone portrait, phone landscape, and tablet landscape.
- Fixed Dispatch Convoy phone portrait overlay collisions by adding cramped-width typography and label handling.
- Fixed Dispatch Convoy landscape cutoff by enabling a short-screen Dispatch scroll path and removing the old panel max-height clamp so the Rive panel can use the full allowable width without distortion.
- Fixed the Recovery Assist event-detail modal body collapse by giving the modal a minimum height fraction.
- Captured Emergency Coordinate Ping GPS-allowed evidence on device: `PING GPS` created a local `Recovery Assist` row with coordinate and accuracy.
- Captured Emergency Coordinate Ping GPS-denied evidence: Android permission prompt appeared, denial returned to Dispatch, and no fake coordinate event was created.
- Fixed Navigate Assist so the Dispatch event-detail action stages the recovery handoff and transitions to Navigate after the modal closes on Android.
- Captured Emergency Coordinate Ping event-detail and Navigate Assist evidence: the recovery event opens with the real coordinate, the action shows Navigate readiness, and continuing lands on a Navigate recovery guidance card.

## Remaining Release Blockers

| Blocker | Current State | Next Check-Off |
| --- | --- | --- |
| Android/device QA evidence | Pass with issues | Dev visual QA route, candidate-producing QA pins, Camp Intel popup actions, Save Camp, Navigate Here, Report Unusable, Dismiss, Navigate camp-layer smoke, and phone-size evidence are captured. Real provider-backed Navigate candidate pins/actions and active route-line plus provider-candidate context remain follow-up before broad rollout. |
| Provider readiness | Not approved for influence | Run real provider shadow validation for the target region/category, then record category approver/date only when accepted. |
| Privacy/storage approval | Approved for guarded closed-field only | `docs/campops/privacy_storage_review.md` approves private/local guarded closed-field data posture. Broad real trip/debrief rollout remains restricted until encryption-backed storage, durable provider/source caches, telemetry sinks, community publishing, and public-safe export workflows receive separate approval. Treat local debrief `localStorage` as unencrypted; keep telemetry/community publishing disabled unless separately approved. |
| Closed field-test risk acceptance | Accepted for restricted test | Scope has expiration, rollback path, restricted cohort/labels, and explicit risk-accepted items. This is not public release approval. |
| Production-lane evidence | Blocked by lane-specific evidence | Dispatch/Convoy, Established Campgrounds, Bluetooth/Power/OBD2, Offline Navigation, Weather, Garmin/inReach, Auth, ECS Brief, Incident & Recovery, Field Utilities, Explore Trail Packs, Fleet, and Dashboard have passing code-level production checks but remain blocked until their Android, provider, real-hardware, privacy/product, and owner-acceptance evidence is recorded. |

## Next Recommended QA Batch

1. Run focused static gates: auth startup, no global overlay, dashboard widgets, Navigate readiness, Fleet full flow, Dispatch live, offline readiness, and ECS Brief dedupe.
2. Run Android device smoke for startup, login/session restore, Dashboard, Fleet, Navigate, Explore, Dispatch, map render, and CampOps popup interactions.
3. Update the Android QA evidence doc with pass/fail rows and screenshot/log references.
4. Re-run `npm run gate:closed-field-test:json`.

## CampOps Privacy/Storage Remaining Risks

- CampOps does not encrypt `localStorage` debrief persistence. Treat local debrief storage as unencrypted unless the runtime provides protection outside CampOps.
- No dedicated durable CampOps source cache exists. Future real provider caches need explicit clear/delete hooks and storage-location documentation before rollout.
- If another app layer persists recommendation sets, endpoint outputs, or AI summaries, that layer must apply the same redaction, retention, deletion, and encryption-status documentation rules.
- Community debrief publishing remains intentionally narrow and disabled by default. Broad community pipelines require separate privacy, product, and moderation review.
- Community-safe debrief output is blocked unless the moderation state is `approved_anonymized`; draft, pending-review, rejected, and removed records are not public-visible.
- Retention, encryption, deletion, and access-control owners remain TBD for broad real trip/debrief field data. Internal beta should use controlled tester data and keep community publishing and telemetry disabled unless separately approved.
