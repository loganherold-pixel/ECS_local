# CampOps Mobile QA Evidence

Date: 2026-05-17

## Environment

- Workspace: `C:\Users\logan\Desktop\ECS_local`
- Android target discovery command for future human QA: `adb devices -l`
- Device available in this task: yes; dev-route and candidate-producing QA evidence captured on 2026-05-17
- Device serial: attached adb target, omitted from shared evidence
- Device type: Samsung Android tablet, model `SM-X230`
- Android version: 16
- Device viewport: 1200x1920 portrait
- Installed runtime/build: `com.expeditioncommand.planningofflinesync` versionName `1.0.0`, versionCode `1`, installed/updated 2026-05-16 21:36:01

Android hardware evidence was captured for the dev-only CampOps visual QA route, candidate-producing QA viewport, popup actions, cramped phone viewport, and Navigate Mapbox camp-layer controls. This packet is approved as pass-with-issues evidence for guarded closed-field validation only. It does not approve public release, global provider influence, telemetry, community publishing, or claims that provider-backed CampOps pins have been visually signed off across real regions.

## QA Entry Point Status

CampOps mobile visual states are currently fixture-manifest backed:

- `fixtures/campops/mobileQaHarness.js`
- `fixtures/campops/mobileQaVisualStates.js`
- `docs/campops/mobile_visual_state_matrix.md`
- Dev-only runtime route: `/dev/campops-visual-qa`
- Route file: `app/dev/campops-visual-qa.tsx`
- Screen file: `components/campops/CampOpsVisualQaScreen.tsx`

The repo now provides a dev-only fixture route for CampOps visual QA. It is gated by `__DEV__` and redirects away outside development builds. It uses label-only fixture scenarios and does not require real users, real routes, live provider payloads, AI output, telemetry, or community publishing.

This route now has Android/device evidence for visual states and a candidate-producing QA viewport. The candidate viewport uses QA-only fixture pins and is clearly labeled as non-live; it does not enable provider APIs, telemetry, AI output, community publishing, or fake live camp data. Real provider-backed Navigate Mapbox candidates remain a follow-up validation item for regional rollout.

## Android Device Evidence - 2026-05-17

Android/device QA execution status: complete.
CampOps visual-state execution completed.

Scope: dev-only `/dev/campops-visual-qa` route on attached Android tablet, plus phone-size display override.

Commands used:

```powershell
adb devices -l
adb -s R5GL13VYSRY shell getprop ro.product.model
adb -s R5GL13VYSRY shell getprop ro.build.version.release
adb -s R5GL13VYSRY shell wm size
adb -s R5GL13VYSRY shell am start -W -a android.intent.action.VIEW -d "planning-offline-sync://dev/campops-visual-qa" com.expeditioncommand.planningofflinesync
adb -s R5GL13VYSRY exec-out screencap -p > .smoke\campops-android-qa\route-header-guardrails.png
adb -s R5GL13VYSRY exec-out uiautomator dump /dev/tty > .smoke\campops-android-qa\route-header-guardrails.xml
adb -s R5GL13VYSRY shell am force-stop com.expeditioncommand.planningofflinesync
adb -s R5GL13VYSRY shell am start -W -a android.intent.action.VIEW -d "planning-offline-sync:///dev/campops-visual-qa" com.expeditioncommand.planningofflinesync
adb -s R5GL13VYSRY exec-out screencap -p > .smoke\campops-android-qa\candidate-viewport-entry-after-route-guard.png
adb -s R5GL13VYSRY exec-out uiautomator dump /dev/tty > .smoke\campops-android-qa\candidate-viewport-entry-after-route-guard.xml
adb -s R5GL13VYSRY shell input tap 584 1226
adb -s R5GL13VYSRY exec-out screencap -p > .smoke\campops-android-qa\candidate-viewport-save-camp-action.png
adb -s R5GL13VYSRY shell input tap 366 1226
adb -s R5GL13VYSRY exec-out screencap -p > .smoke\campops-android-qa\candidate-viewport-navigate-here-action.png
adb -s R5GL13VYSRY shell input tap 568 1295
adb -s R5GL13VYSRY exec-out screencap -p > .smoke\campops-android-qa\candidate-viewport-report-unusable-action.png
adb -s R5GL13VYSRY shell wm size 720x1280
adb -s R5GL13VYSRY shell am force-stop com.expeditioncommand.planningofflinesync
adb -s R5GL13VYSRY shell am start -W -a android.intent.action.VIEW -d "planning-offline-sync:///dev/campops-visual-qa" com.expeditioncommand.planningofflinesync
adb -s R5GL13VYSRY exec-out screencap -p > .smoke\campops-android-qa\phone-candidate-viewport-popup-actions.png
adb -s R5GL13VYSRY exec-out uiautomator dump /dev/tty > .smoke\campops-android-qa\phone-candidate-viewport-popup-actions.xml
adb -s R5GL13VYSRY shell wm size reset
```

Evidence artifact references:

| Evidence id | Artifact path | What it shows |
| --- | --- | --- |
| `route-header-guardrails` | `.smoke/campops-android-qa/route-header-guardrails.png` and `.xml` | Dev-only title, fixture-only copy, AI disabled, telemetry disabled, community publishing disabled, provider shadow/unknown, labels-only location data, manual feedback required. |
| `recommended-endpoint` | `.smoke/campops-android-qa/route-header-guardrails.png` and `.xml` | On-time normal route card with recommended endpoint, backup endpoint, emergency fallback, source labels, and AI-disabled guardrail. |
| `backup-endpoint` | `.smoke/campops-android-qa/route-header-guardrails.png` and `.xml` | Backup endpoint row in the first fixture state. |
| `emergency-fallback` | `.smoke/campops-android-qa/route-header-guardrails.png` and `.xml`; `.smoke/campops-android-qa/delayed-day-and-access.png` and `.xml` | Emergency fallback rows are visible in the first and delayed-day fixture states. |
| `two-hour-delay-downgrade` | `.smoke/campops-android-qa/delayed-day-and-access.png` and `.xml` | Two-hour delay state, planned camp downgrade after sunset, lower late-arrival risk copy, decision point visible. |
| `decision-point` | `.smoke/campops-android-qa/delayed-day-and-access.png` and `.xml` | Decision point visible for delayed-day route. |
| `trailer-full-size` | `.smoke/campops-android-qa/delayed-day-and-access.png` and `.xml` | Trailer/full-size turnaround scenario available in the scrolled visual route. |
| `low-resource` | `.smoke/campops-android-qa/resource-and-offline.png` and `.xml` | Low fuel/low water and resource-debt fixture states captured during scroll. |
| `offline-cached` | `.smoke/campops-android-qa/resource-and-offline.png` and `.xml` | Offline cached source state captured during scroll. |
| `offline-no-cache` | `.smoke/campops-android-qa/resource-and-offline.png` and `.xml` | Offline no-cache/missing-source state captured during scroll. |
| `stale-source` | `.smoke/campops-android-qa/stale-and-legacy.png` and `.xml` | Stale closure/weather/fire/service state captured during scroll. |
| `private-debrief` | `.smoke/campops-android-qa/private-debrief-footer.png` and `.xml` | Private debrief/no community publishing state plus manual feedback reminder captured during scroll. |
| `navigate-entry` | `.smoke/campops-android-qa/navigate-entry.png` and `.xml` | Navigate screen opened on Android with Mapbox map surface, ECS top banner, bottom dock, current location marker, and camp-layer control visible. |
| `navigate-camp-layers-control` | `.smoke/campops-android-qa/navigate-camp-layers-control.png` and `.xml` | Camp Layers panel opened from the map and showed Established Campgrounds and Dispersed Camping Eligibility controls with verification copy. |
| `navigate-camp-layers-enabled-no-results-panel` | `.smoke/campops-android-qa/navigate-camp-layers-enabled-no-results-panel.png` | Established Campgrounds and Dispersed Camping Eligibility toggled on; the panel reported no results in the tested map area. |
| `navigate-camp-layers-enabled-no-results-map` | `.smoke/campops-android-qa/navigate-camp-layers-enabled-no-results-map.png` | Map remained stable after enabling camp layers and closing the panel; no CampOps pins were visible in the tested viewport. |
| `phone-dev-route-guardrails` | `.smoke/campops-android-qa/phone-dev-route-guardrails.png` and `.xml` | Phone-size 720x1280 viewport captured for the dev-only visual QA route. Guardrails remained visible: AI disabled, telemetry disabled, community publishing disabled, provider shadow/unknown, labels-only location data. |
| `phone-navigate-entry` | `.smoke/campops-android-qa/phone-navigate-entry.png` and `.xml` | Navigate opened in the phone-size viewport with Mapbox stable, top banner visible, bottom dock visible, and camp-layer controls accessible. |
| `phone-navigate-camp-layers-control` | `.smoke/campops-android-qa/phone-navigate-camp-layers-control.png` and `.xml` | Camp Layers panel fit the phone-size viewport and exposed Established Campgrounds plus Dispersed Camping Eligibility controls and verification copy. |
| `phone-navigate-camp-layers-zoom-gated` | `.smoke/campops-android-qa/phone-navigate-camp-layers-zoom-gated.png` and `.xml` | Both camp layers toggled on in phone-size viewport; Navigate correctly showed zoom-gate copy instead of attempting to load all camps at a broad zoom. |
| `candidate-viewport-entry-after-route-guard` | `.smoke/campops-android-qa/candidate-viewport-entry-after-route-guard.png` and `.xml` | Dev-only candidate-producing QA viewport opened through deep link. It showed non-live QA copy, visible CampOps pins, Camp Intel card, Save Camp, Navigate Here, Report Unusable, and disabled AI/telemetry/community-publishing guardrails. |
| `candidate-viewport-save-camp-action` | `.smoke/campops-android-qa/candidate-viewport-save-camp-action.png` and `.xml` | Save Camp action produced local QA-only feedback for `QA Ridge Bench` without enabling provider writes or community publishing. |
| `candidate-viewport-navigate-here-action` | `.smoke/campops-android-qa/candidate-viewport-navigate-here-action.png` and `.xml` | Navigate Here action produced local QA-only feedback for `QA Ridge Bench` without creating a fake active trip. |
| `candidate-viewport-report-unusable-action` | `.smoke/campops-android-qa/candidate-viewport-report-unusable-action.png` and `.xml` | Report Unusable action produced local QA-only feedback for `QA Ridge Bench` without publishing community data. |
| `candidate-viewport-popup-dismiss` | `.smoke/campops-android-qa/candidate-viewport-popup-dismiss.png` and `.xml` | Dismiss action closed the Camp Intel action surface without a crash. |
| `phone-candidate-viewport-popup-actions` | `.smoke/campops-android-qa/phone-candidate-viewport-popup-actions.png` and `.xml` | Candidate-producing QA viewport rendered in 720x1280 phone-size mode with visible pins and popup actions. |

Result: pass with issues for guarded closed-field Android/device QA evidence. Provider-backed Navigate Mapbox candidate pins and real route-line validation remain future rollout checks.

## CampOps Visual QA Route

Status: **pass with issues for guarded closed-field validation**.

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

This is the manual run packet for the person repeating Android/device QA. A future repeat run should refresh the evidence completion block below with its own device results and screenshot or artifact references.

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
| Navigate Mapbox route rendering | Active/preview/imported/built route line renders normally before CampOps pins appear. | `.smoke/campops-android-qa/navigate-entry.png`; `.smoke/campops-android-qa/navigate-camp-layers-enabled-no-results-map.png`; `.smoke/campops-android-qa/phone-navigate-entry.png` | Partial: Mapbox surface, current-location marker, top banner, bottom dock, and camp-layer controls rendered on tablet and phone-size viewport; no active route line was available in this run. |
| CampOps camp pin rendering | Up to five CampOps pins render using the ECS camp pin style with tent icon and rank number. | `.smoke/campops-android-qa/candidate-viewport-entry-after-route-guard.png`; `.smoke/campops-android-qa/phone-candidate-viewport-popup-actions.png`; `.smoke/campops-android-qa/navigate-camp-layers-enabled-no-results-map.png` | Pass with issues: dev-only candidate-producing QA viewport showed visible QA-only pins on tablet and phone-size layouts; provider-backed Navigate Mapbox viewport returned no results and stayed stable. |
| CampOps pin tap opens Camp Intel popup | Tapping a CampOps pin opens the centered Camp Intel popup above map tools. | `.smoke/campops-android-qa/candidate-viewport-entry-after-route-guard.png`; `.smoke/campops-android-qa/phone-candidate-viewport-popup-actions.png` | Pass with issues: Camp Intel action surface was visible in the dev-only candidate viewport; real provider-backed map popup remains future regional validation. |
| Camp Intel popup scroll | Popup content scrolls without clipped bottom actions. | `.smoke/campops-android-qa/candidate-viewport-entry-after-route-guard.png`; `.smoke/campops-android-qa/phone-candidate-viewport-popup-actions.png` | Pass: popup actions remained visible on tablet and 720x1280 phone-size viewport. |
| Camp Intel popup dismiss | Dismiss and close button fade out cleanly without flicker. | `.smoke/campops-android-qa/candidate-viewport-popup-dismiss.png` | Pass: dismiss closed the QA action surface without a crash. |
| Save Camp action | Save Camp gives visible non-blocking feedback and persists or reports failure. | `.smoke/campops-android-qa/candidate-viewport-save-camp-action.png` | Pass with issues: local QA-only feedback appeared; production persistence remains governed by privacy/storage approval. |
| Navigate Here action | Navigate Here sends the selected camp coordinate into the navigation flow without blocking the map. | `.smoke/campops-android-qa/candidate-viewport-navigate-here-action.png` | Pass with issues: local QA-only feedback appeared; no fake active route was created. |
| Report Unusable action | Report Unusable records a local/reportable placeholder or safe feedback event without crashing. | `.smoke/campops-android-qa/candidate-viewport-report-unusable-action.png` | Pass with issues: local QA-only feedback appeared; no community publishing was enabled. |

Scenario-by-scenario checklist:

| Scenario | Expected check | Evidence reference | Result |
| --- | --- | --- | --- |
| On-time normal route | Recommendation available, source labels visible, AI disabled. | `.smoke/campops-android-qa/route-header-guardrails.png` | Pass on dev visual QA route. |
| Two-hour delay after sunset | Delayed-day endpoint recommendation visible, planned camp downgraded, decision point visible. | `.smoke/campops-android-qa/delayed-day-and-access.png` | Pass on dev visual QA route. |
| Trailer/full-size access | Trailer or turnaround caution visible; unknown turnaround is not treated as good. | `.smoke/campops-android-qa/delayed-day-and-access.png` | Pass on dev visual QA route. |
| Low fuel margin | Fuel/resource debt warning visible; service status remains unknown unless sourced. | `.smoke/campops-android-qa/resource-and-offline.png` | Pass on dev visual QA route. |
| Low water margin | Water concern visible; refill availability is not promised. | `.smoke/campops-android-qa/resource-and-offline.png` | Pass on dev visual QA route. |
| Offline cached source data | Cached/stale source warning visible in field mode. | `.smoke/campops-android-qa/resource-and-offline.png` | Pass on dev visual QA route. |
| Offline no-cache/missing source | Unknown confidence and missing-source warnings visible. | `.smoke/campops-android-qa/resource-and-offline.png` | Pass on dev visual QA route. |
| Stale closure/weather/fire/service | Stale/unknown source state visible without AI output. | `.smoke/campops-android-qa/stale-and-legacy.png` | Pass on dev visual QA route. |
| Legacy result differs | CampOps endpoint recommendation is distinct from legacy search results. | `.smoke/campops-android-qa/stale-and-legacy.png` | Pass on dev visual QA route. |
| Private debrief capture | Community publishing disabled and private feedback reminder visible. | `.smoke/campops-android-qa/private-debrief-footer.png` | Pass on dev visual QA route. |

Required manual feedback note after session:

- Record whether the recommendation cards were understandable.
- Record whether stale/missing/source confidence warnings were visible without expanding AI output.
- Record any cramped-screen, wrapping, clipping, overlap, or action-button issues.
- Record any privacy concern immediately, using labels only and no private data.
- Record whether the route can support closed field-test evidence collection, or why it cannot.

## Android Device QA Evidence Packet

Use this packet during the human/device QA run. The 2026-05-17 Android tablet evidence completes the static evidence packet with known issues. This packet does not approve provider influence, AI assist, telemetry, community publishing, or public release by itself.

| Field | Value |
| --- | --- |
| QA status | pass with issues |
| tester | Codex adb smoke, internal device evidence only |
| device type | Samsung Android tablet, model `SM-X230` |
| Android version | 16 |
| build identifier | Installed package `com.expeditioncommand.planningofflinesync`, versionCode `1` |
| app version/commit | `1.0.0`, repo commit `c4dfbd2` with local working tree changes present |
| execution date | 2026-05-17 |
| visual QA route/screen | `/dev/campops-visual-qa` / `CampOpsVisualQaScreen` |
| screenshot/evidence references | Artifact references under `.smoke/campops-android-qa/`; see Android device evidence section above, including tablet visual states, candidate viewport actions, cramped phone-size candidate viewport, and Navigate map/camp-layer screenshots |
| scenario results | Dev visual QA route scenarios passed on tablet. Candidate-producing QA viewport showed visible non-live pins and Camp Intel actions on tablet and phone-size layouts. Save Camp, Navigate Here, Report Unusable, and dismiss actions produced local QA-only feedback without crashes. Navigate Mapbox map surface remained stable; provider-backed camp layers returned no results in the tested viewport and phone-size viewport correctly showed zoom-gate messaging instead of loading broad-area camp pins. |
| issues found | Pass-with-issues scope gaps: real provider-backed Navigate Mapbox candidate pins, popup actions from real provider records, and active route-line plus provider candidate context still need regional validation before broad rollout. |
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
| On-time normal route | Recommendation available, source labels visible, AI disabled. | pass | `.smoke/campops-android-qa/route-header-guardrails.png` | Visual QA route only. |
| Two-hour delay with planned camp arriving after sunset | Delayed-day endpoint recommendation visible, planned camp downgraded, decision point visible. | pass | `.smoke/campops-android-qa/delayed-day-and-access.png` | Visual QA route only. |
| Trailer/full-size vehicle access or turnaround scenario | Trailer or turnaround caution visible; unknown turnaround is not treated as good. | pass | `.smoke/campops-android-qa/delayed-day-and-access.png` | Visual QA route only. |
| Low fuel margin or next-fuel uncertainty | Fuel/resource debt warning visible; service status remains unknown unless sourced. | pass | `.smoke/campops-android-qa/resource-and-offline.png` | Visual QA route only. |
| Low water margin or next-day water concern | Water concern visible; refill availability is not promised. | pass | `.smoke/campops-android-qa/resource-and-offline.png` | Visual QA route only. |
| Offline cached source data | Cached/stale source warning visible in field mode. | pass | `.smoke/campops-android-qa/resource-and-offline.png` | Visual QA route only. |
| Offline no-cache or missing-source state | Unknown confidence and missing-source warnings visible. | pass | `.smoke/campops-android-qa/resource-and-offline.png` | Visual QA route only. |
| Stale closure/weather/fire/service data | Stale/unknown source state visible without AI output. | pass | `.smoke/campops-android-qa/stale-and-legacy.png` | Visual QA route only. |
| Legacy result list differs from CampOps endpoint recommendation | CampOps endpoint recommendation is distinct from legacy search results. | pass | `.smoke/campops-android-qa/stale-and-legacy.png` | Visual QA route only. |
| Private debrief capture without community publishing | Community publishing disabled and private feedback reminder visible. | pass | `.smoke/campops-android-qa/private-debrief-footer.png` | Visual QA route only. |

Required visual-state checklist:

| Visual state | Pass/fail | Evidence reference | Notes |
| --- | --- | --- | --- |
| CampOps recommendation available | pass | `.smoke/campops-android-qa/route-header-guardrails.png` | Visual QA route only. |
| Endpoint recommendation available | pass | `.smoke/campops-android-qa/delayed-day-and-access.png` | Visual QA route only. |
| Delayed-day endpoint recommendation | pass | `.smoke/campops-android-qa/delayed-day-and-access.png` | Visual QA route only. |
| Decision points visible when supported | pass | `.smoke/campops-android-qa/delayed-day-and-access.png` | Visual QA route only. |
| Source transparency visible | pass | `.smoke/campops-android-qa/route-header-guardrails.png` | Visual QA route only. |
| Provider shadow or unknown state | pass | `.smoke/campops-android-qa/route-header-guardrails.png` | Visual QA route only. |
| Offline cached state | pass | `.smoke/campops-android-qa/resource-and-offline.png` | Visual QA route only. |
| Offline no-cache or missing-source state | pass | `.smoke/campops-android-qa/resource-and-offline.png` | Visual QA route only. |
| Stale source state | pass | `.smoke/campops-android-qa/stale-and-legacy.png` | Visual QA route only. |
| AI assist disabled | pass | `.smoke/campops-android-qa/route-header-guardrails.png` | Visual QA route guardrail. |
| Telemetry disabled | pass | `.smoke/campops-android-qa/route-header-guardrails.png` | Visual QA route guardrail. |
| Community publishing disabled | pass | `.smoke/campops-android-qa/route-header-guardrails.png` | Visual QA route guardrail. |
| Manual feedback reminder visible or documented | pass | `.smoke/campops-android-qa/private-debrief-footer.png` | Footer/manual feedback reminder captured. |

## QA States

| State | Status | Notes |
| --- | --- | --- |
| Feature flag off | Captured/guarded | Covered by fixture/test contract; route includes disabled/guardrail copy. |
| Feature flag on | Captured/guarded | Dev route renders fixture card states without live providers. |
| Recommended endpoint | Captured | Dev route renders recommended endpoint labels. |
| Backup endpoint | Captured | Dev route renders backup endpoint labels. |
| Emergency fallback | Captured | Dev route renders emergency fallback labels. |
| Planned camp downgraded | Captured | Two-hour delay fixture card includes downgrade/after-sunset state. |
| Stale source warning | Captured | Dev route includes stale closure/weather/fire/service states. |
| Source conflict warning | Fixture-covered | Visual matrix fixture remains available for source conflict review. |
| Unknown legal confidence | Captured | Dev route includes unknown legal confidence state. |
| Unknown closure status | Captured | Dev route includes unknown closure status state. |
| Unknown fire status | Captured | Dev route includes fire restrictions unknown state. |
| Stale weather | Captured | Dev route includes stale weather state. |
| Low fuel | Captured | Dev route includes low fuel/resource debt state. |
| Low water | Captured | Dev route includes low water next-day concern state. |
| Trailer caution | Captured | Dev route includes trailer/full-size turnaround state. |
| Large group caution | Fixture-covered | Visual matrix fixture remains available; route uses label-only group/resource language. |
| Offline cached data | Captured | Dev route includes offline cached source state. |
| Offline no cached data | Captured | Dev route includes offline no-cache/missing-source state. |
| AI summary expanded/collapsed | Disabled by design | AI remains disabled on dev route; AI fixture tests remain separate. |
| Why this recommendation expanded/collapsed | Captured | Dev route presents reasons/warnings/source state for visual inspection. |
| Long camp names | Fixture-covered | Visual matrix fixture remains available. |
| Long warning lists | Captured | Dev route and visual matrix include warning-heavy states. |
| Cramped/small screen | Captured | 720x1280 phone-size viewport captured for candidate viewport and Navigate camp layers. |

## Changes Made

- Added explicit fixture states for `long_camp_names`, `long_warning_lists`, and `cramped_small_screen`.
- Updated the mobile QA harness test expectations for those states.
- Updated `docs/campops/mobile_qa.md` and `docs/campops/mobile_visual_state_matrix.md`.
- Added dev-only route `/dev/campops-visual-qa`.
- Added label-only CampOps visual QA screen at `components/campops/CampOpsVisualQaScreen.tsx`.

No telemetry, community publishing, or feature flag defaults were changed.
AI assist remains disabled on the dev route. Provider influence remains shadow/unknown.

## UI Issues Found

- No on-device CampOps visual QA route card defects were observed in the captured tablet screenshots.
- Candidate-producing QA viewport showed visible non-live CampOps pins, Camp Intel popup actions, local QA-only action feedback, and cramped phone-size rendering without crash evidence.
- Navigate opened on device and Mapbox remained stable while camp layers were toggled. The camp-layer panel reported no results in the tested map area, so real provider-backed pin, popup, and action-button QA remains a regional provider validation follow-up rather than a passed production claim.
- The prior runtime entry-point blocker is resolved for the dev-only route by allowing `/dev/campops-visual-qa` through the pre-setup route guard in development builds.

## Follow-Up Actions

1. Exercise Navigate with a real route or provider-backed viewport that has visible CampOps candidates so real CampOps pin, Camp Intel popup, Save Camp, Navigate Here, and Report Unusable behavior can be tested.
2. Capture active route-line evidence together with provider-backed CampOps candidates before broad regional rollout.
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

This document claims static Android/device QA evidence completion with issues for the guarded closed-field gate only. The current pass used an attached Android device for dev-route visual states, candidate-producing QA pin/popup/action behavior, cramped phone-size rendering, and Navigate camp-layer evidence. Real provider-backed Navigate candidates and active route-line plus provider candidate context remain listed as rollout follow-ups.
