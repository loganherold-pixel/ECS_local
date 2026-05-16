# CampOps Mobile QA Evidence

Date: 2026-05-01

## Environment

- Workspace: `C:\Users\logan\Desktop\ECS_local`
- Android target discovery command for future human QA: `adb devices -l`
- Device available in this task: not used
- Device serial: not recorded in shared evidence
- Device type: TODO, for example Android tablet, Android phone, or emulator
- Android version: TODO
- Device viewport: TODO
- Installed runtime/build: TODO

No Android hardware, emulator, simulator, Expo Go session, or native build was launched for this evidence update.

## QA Entry Point Status

CampOps mobile visual states are currently fixture-manifest backed:

- `fixtures/campops/mobileQaHarness.js`
- `fixtures/campops/mobileQaVisualStates.js`
- `docs/campops/mobile_visual_state_matrix.md`
- Dev-only runtime route: `/dev/campops-visual-qa`
- Route file: `app/dev/campops-visual-qa.tsx`
- Screen file: `components/campops/CampOpsVisualQaScreen.tsx`

The repo now provides a dev-only fixture route for CampOps visual QA. It is gated by `__DEV__` and redirects away outside development builds. It uses label-only fixture scenarios and does not require real users, real routes, live provider payloads, AI output, telemetry, or community publishing.

This route unblocks future Android/device evidence collection, but it does not itself complete Android/device QA. No screenshots were captured in this task because device QA was not run.

## CampOps Visual QA Route

Status: **incomplete until executed on Android hardware, emulator, or physical device**.

Route and screen:

- Route: `/dev/campops-visual-qa`
- Route file: `app/dev/campops-visual-qa.tsx`
- Screen: `CampOpsVisualQaScreen`
- Screen file: `components/campops/CampOpsVisualQaScreen.tsx`
- Production guard: route is enabled only when `__DEV__ === true`; production builds redirect to `/`.

How QA should access it:

1. Use a development build/session only.
2. Keep AI assist disabled.
3. Keep telemetry disabled.
4. Keep community publishing disabled.
5. Keep provider influence shadow-only or unknown unless a region/category has separate approval.
6. Navigate to `/dev/campops-visual-qa`.
7. Record only route labels, region labels, scenario labels, and screenshot artifact references.

Do not include precise private coordinates, private user IDs, vehicle identifiers, raw provider payloads, raw AI prompts, private debrief notes, or raw photo references in QA notes or screenshots.

## Android Device QA Execution Instructions

This is the manual run packet for the person executing Android/device QA. Do not mark the run complete until the evidence completion block below is filled with real device results and screenshot or artifact references.

Access path:

1. Use a development build/session only.
2. Start the app using the team's normal local Android development workflow. Do not use production builds for this route.
3. Navigate to `/dev/campops-visual-qa`.
4. Confirm the screen title is `CampOps Visual QA`.
5. Confirm the production guard remains in place: `app/dev/campops-visual-qa.tsx` redirects to `/` when `__DEV__ !== true`.

Record build/version/commit fields:

- Build identifier: record the local build label, APK/AAB label, or dev-session build label.
- App version/commit: record the app version and commit SHA used for the QA run.
- Execution date: record the local date of the Android/device QA run.

Record device fields:

- Tester name or initials: initials or internal tester label only.
- Device type: Android phone, Android tablet, emulator, or physical device class.
- Android version: major/minor version or version band.
- Device viewport/class: small, large, tablet, or landscape, if known.
- Do not record device serials, private user IDs, vehicle identifiers, or private account details in shared evidence.

Expected disabled/restricted states:

- AI assist disabled.
- Telemetry disabled.
- Community publishing disabled.
- Provider influence shadow-only or unknown unless approved separately by region/category.
- Fixture data uses labels only.
- No raw provider payloads, raw AI prompts, private debrief notes, precise private coordinates, vehicle IDs, or private user IDs appear on-screen or in evidence notes.

Screenshots/evidence references required:

- `route-header-guardrails`: route header plus AI/telemetry/community/provider/labels-only guardrail row.
- `recommended-endpoint`: recommended endpoint card.
- `backup-endpoint`: backup endpoint card.
- `emergency-fallback`: emergency fallback card.
- `two-hour-delay-downgrade`: delayed-day state with planned camp downgrade.
- `decision-point`: decision point visible when supported.
- `offline-cached`: offline cached/stale source state.
- `offline-no-cache`: offline no-cache/missing-source state.
- `stale-source`: stale closure/weather/fire/service state.
- `low-resource`: low fuel or low water state.
- `trailer-full-size`: trailer/full-size turnaround caution state.
- `private-debrief`: private debrief/no community publishing state.
- `cramped-screen`: small-screen or cramped layout state.

CampOps Navigate Mapbox flow evidence required:

| Flow | Expected check | Evidence reference | Result |
| --- | --- | --- | --- |
| Navigate Mapbox route rendering | Active/preview/imported/built route line renders normally before CampOps pins appear. | TODO | TODO / not run |
| CampOps camp pin rendering | Up to five CampOps pins render using the ECS camp pin style with tent icon and rank number. | TODO | TODO / not run |
| CampOps pin tap opens Camp Intel popup | Tapping a CampOps pin opens the centered Camp Intel popup above map tools. | TODO | TODO / not run |
| Camp Intel popup scroll | Popup content scrolls without clipped bottom actions. | TODO | TODO / not run |
| Camp Intel popup dismiss | Dismiss and close button fade out cleanly without flicker. | TODO | TODO / not run |
| Save Camp action | Save Camp gives visible non-blocking feedback and persists or reports failure. | TODO | TODO / not run |
| Navigate Here action | Navigate Here sends the selected camp coordinate into the navigation flow without blocking the map. | TODO | TODO / not run |
| Report Unusable action | Report Unusable records a local/reportable placeholder or safe feedback event without crashing. | TODO | TODO / not run |

Scenario-by-scenario checklist:

| Scenario | Expected check | Evidence reference | Result |
| --- | --- | --- | --- |
| On-time normal route | Recommendation available, source labels visible, AI disabled. | TODO | TODO / not run |
| Two-hour delay after sunset | Delayed-day endpoint recommendation visible, planned camp downgraded, decision point visible. | TODO | TODO / not run |
| Trailer/full-size access | Trailer or turnaround caution visible; unknown turnaround is not treated as good. | TODO | TODO / not run |
| Low fuel margin | Fuel/resource debt warning visible; service status remains unknown unless sourced. | TODO | TODO / not run |
| Low water margin | Water concern visible; refill availability is not promised. | TODO | TODO / not run |
| Offline cached source data | Cached/stale source warning visible in field mode. | TODO | TODO / not run |
| Offline no-cache/missing source | Unknown confidence and missing-source warnings visible. | TODO | TODO / not run |
| Stale closure/weather/fire/service | Stale/unknown source state visible without AI output. | TODO | TODO / not run |
| Legacy result differs | CampOps endpoint recommendation is distinct from legacy search results. | TODO | TODO / not run |
| Private debrief capture | Community publishing disabled and private feedback reminder visible. | TODO | TODO / not run |

Required manual feedback note after session:

- Record whether the recommendation cards were understandable.
- Record whether stale/missing/source confidence warnings were visible without expanding AI output.
- Record any cramped-screen, wrapping, clipping, overlap, or action-button issues.
- Record any privacy concern immediately, using labels only and no private data.
- Record whether the route can support closed field-test evidence collection, or why it cannot.

## Android Device QA Evidence Packet

Use this packet during the human/device QA run. Leave fields as `TODO`, `not run`, or `incomplete` until actual Android hardware, emulator, or physical-device evidence exists. This packet does not complete Android QA by itself.

| Field | Value |
| --- | --- |
| QA status | incomplete |
| tester | TODO |
| device type | TODO |
| Android version | TODO |
| build identifier | TODO |
| app version/commit | TODO |
| execution date | TODO |
| visual QA route/screen | `/dev/campops-visual-qa` / `CampOpsVisualQaScreen` |
| screenshot/evidence references | TODO artifact references only |
| scenario results | TODO |
| issues found | TODO |
| recommendation | blocked |

Required route posture:

- AI assist: disabled.
- Telemetry: disabled.
- Community publishing: disabled.
- Provider influence: shadow-only or unknown unless a region/category has separate approval.
- Fixture data: labels only.
- Production exposure: dev route must redirect away outside `__DEV__`.

Required screenshots/evidence references:

- `route-header-guardrails`: route header plus AI/telemetry/community/provider/labels-only guardrail row.
- `recommended-endpoint`: recommended endpoint card.
- `backup-endpoint`: backup endpoint card.
- `emergency-fallback`: emergency fallback card.
- `two-hour-delay-downgrade`: delayed-day state with planned camp downgrade.
- `decision-point`: decision point visible when supported.
- `offline-cached`: offline cached/stale source state.
- `offline-no-cache`: offline no-cache/missing-source state.
- `stale-source`: stale closure/weather/fire/service state.
- `low-resource`: low fuel or low water state.
- `trailer-full-size`: trailer/full-size turnaround caution state.
- `private-debrief`: private debrief/no community publishing state.
- `cramped-screen`: small-screen or cramped layout state.

Required scenario checklist:

| Scenario | Required visual check | Pass/fail | Evidence reference | Notes |
| --- | --- | --- | --- | --- |
| On-time normal route | Recommendation available, source labels visible, AI disabled. | TODO / not run | TODO | TODO |
| Two-hour delay with planned camp arriving after sunset | Delayed-day endpoint recommendation visible, planned camp downgraded, decision point visible. | TODO / not run | TODO | TODO |
| Trailer/full-size vehicle access or turnaround scenario | Trailer or turnaround caution visible; unknown turnaround is not treated as good. | TODO / not run | TODO | TODO |
| Low fuel margin or next-fuel uncertainty | Fuel/resource debt warning visible; service status remains unknown unless sourced. | TODO / not run | TODO | TODO |
| Low water margin or next-day water concern | Water concern visible; refill availability is not promised. | TODO / not run | TODO | TODO |
| Offline cached source data | Cached/stale source warning visible in field mode. | TODO / not run | TODO | TODO |
| Offline no-cache or missing-source state | Unknown confidence and missing-source warnings visible. | TODO / not run | TODO | TODO |
| Stale closure/weather/fire/service data | Stale/unknown source state visible without AI output. | TODO / not run | TODO | TODO |
| Legacy result list differs from CampOps endpoint recommendation | CampOps endpoint recommendation is distinct from legacy search results. | TODO / not run | TODO | TODO |
| Private debrief capture without community publishing | Community publishing disabled and private feedback reminder visible. | TODO / not run | TODO | TODO |

Required visual-state checklist:

| Visual state | Pass/fail | Evidence reference | Notes |
| --- | --- | --- | --- |
| CampOps recommendation available | TODO / not run | TODO | TODO |
| Endpoint recommendation available | TODO / not run | TODO | TODO |
| Delayed-day endpoint recommendation | TODO / not run | TODO | TODO |
| Decision points visible when supported | TODO / not run | TODO | TODO |
| Source transparency visible | TODO / not run | TODO | TODO |
| Provider shadow or unknown state | TODO / not run | TODO | TODO |
| Offline cached state | TODO / not run | TODO | TODO |
| Offline no-cache or missing-source state | TODO / not run | TODO | TODO |
| Stale source state | TODO / not run | TODO | TODO |
| AI assist disabled | TODO / not run | TODO | TODO |
| Telemetry disabled | TODO / not run | TODO | TODO |
| Community publishing disabled | TODO / not run | TODO | TODO |
| Manual feedback reminder visible or documented | TODO / not run | TODO | TODO |

## QA States

| State | Status | Notes |
| --- | --- | --- |
| Feature flag off | Prepared, not device-run | Covered by fixture/test contract; route includes disabled/guardrail copy. |
| Feature flag on | Prepared, not device-run | Dev route renders fixture card states without live providers. |
| Recommended endpoint | Prepared, not device-run | Dev route renders recommended endpoint labels. |
| Backup endpoint | Prepared, not device-run | Dev route renders backup endpoint labels. |
| Emergency fallback | Prepared, not device-run | Dev route renders emergency fallback labels. |
| Planned camp downgraded | Prepared, not device-run | Two-hour delay fixture card includes downgrade/after-sunset state. |
| Stale source warning | Prepared, not device-run | Dev route includes stale closure/weather/fire/service states. |
| Source conflict warning | Prepared, not device-run | Visual matrix fixture remains available for source conflict review. |
| Unknown legal confidence | Prepared, not device-run | Dev route includes unknown legal confidence state. |
| Unknown closure status | Prepared, not device-run | Dev route includes unknown closure status state. |
| Unknown fire status | Prepared, not device-run | Dev route includes fire restrictions unknown state. |
| Stale weather | Prepared, not device-run | Dev route includes stale weather state. |
| Low fuel | Prepared, not device-run | Dev route includes low fuel/resource debt state. |
| Low water | Prepared, not device-run | Dev route includes low water next-day concern state. |
| Trailer caution | Prepared, not device-run | Dev route includes trailer/full-size turnaround state. |
| Large group caution | Prepared, not device-run | Visual matrix fixture remains available; route uses label-only group/resource language. |
| Offline cached data | Prepared, not device-run | Dev route includes offline cached source state. |
| Offline no cached data | Prepared, not device-run | Dev route includes offline no-cache/missing-source state. |
| AI summary expanded/collapsed | Prepared, not device-run | AI remains disabled on dev route; AI fixture tests remain separate. |
| Why this recommendation expanded/collapsed | Prepared, not device-run | Dev route presents reasons/warnings/source state for visual inspection. |
| Long camp names | Prepared, not device-run | Visual matrix fixture remains available. |
| Long warning lists | Prepared, not device-run | Dev route and visual matrix include warning-heavy states. |
| Cramped/small screen | Prepared, not device-run | Route is ready for small-screen Android QA. |

## Changes Made

- Added explicit fixture states for `long_camp_names`, `long_warning_lists`, and `cramped_small_screen`.
- Updated the mobile QA harness test expectations for those states.
- Updated `docs/campops/mobile_qa.md` and `docs/campops/mobile_visual_state_matrix.md`.
- Added dev-only route `/dev/campops-visual-qa`.
- Added label-only CampOps visual QA screen at `components/campops/CampOpsVisualQaScreen.tsx`.

No telemetry, community publishing, or feature flag defaults were changed.
AI assist remains disabled on the dev route. Provider influence remains shadow/unknown.

## UI Issues Found

- No on-device CampOps card UI issues were found because device QA was not run in this task.
- The prior runtime entry-point blocker is reduced by the dev-only route, but Android/device QA evidence is still incomplete until the route is exercised on Android hardware/emulator/physical device and screenshots/results are captured.

## Follow-Up Actions

1. Re-run this matrix on the attached Android target or another local emulator using `/dev/campops-visual-qa`.
2. Capture screenshots for recommended, backup, emergency, stale source, conflict, offline, long text, and cramped-screen states.
3. Keep provider APIs, telemetry, and community publishing disabled during visual QA unless separately approved.

## Verification Commands

Verification result: passed.

```powershell
node scripts\test-campops-mobile-qa-harness.js
node scripts\test-campops-ui-cards.js
node scripts\test-campops-safe-endpoint.js
node scripts\test-campops-ai-assist.js
node scripts\test-campops-search-integration.js
node scripts\test-campops-debrief.js
node scripts\test-campops-provider-fixtures.js
node node_modules\typescript\bin\tsc --noEmit --pretty false
npm run lint
```

This document does not claim Android/device QA completion. The current task did not run Expo, Expo Go, emulator, simulator, or physical-device QA.
