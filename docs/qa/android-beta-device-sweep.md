# Android Beta Device Sweep

Date: 2026-06-12

Branch: `codex/android-beta-device-sweep`

Raw evidence folder: `.qa/android-beta-device-sweep/`

Raw screenshots, UI XML, and logcat snippets remain local and ignored. This file is the concise tracked summary.

## Devices

| Device | Serial | Android | Build |
| --- | --- | --- | --- |
| Samsung SM-X230 | `R5GL13VYSRY` | 16 | `com.expeditioncommand.planningofflinesync`, versionCode 4, debuggable |
| Samsung SM-S948U | `R3GL302P1YE` | 16 | `com.expeditioncommand.planningofflinesync`, versionCode 4, debuggable |

Both devices were unlocked, awake, connected over ADB, and using the same debug/dev-client package. Metro reverse was configured for both devices. Both passed `/dev/convoy-identity-qa` with distinct authenticated QA identities, backend `ppullxxprgyeoakzqnxi`, clean convoy baseline, setup complete, configured vehicle present, and live sharing inactive.

## Native Results

| Area | Result | Evidence notes |
| --- | --- | --- |
| Native launch and shell | Pass | Both devices launched without redbox or fatal logcat patterns in captured logs. |
| Bottom tabs | Pass | SM-X230 validated by dock taps. SM-S948U validated by canonical deep links for Fleet, Navigate, Dashboard, Explore, and Dispatch after coordinate taps stayed on the diagnostic screen. |
| Fleet | Pass | SM-X230 showed active vehicle profile, payload/readiness/confidence copy, and no crash. Device diagnostics confirmed active vehicle on both devices. |
| Navigate / Mapbox | Pass | Navigate opened without crash. Native route overlay fixture opened on SM-X230 and listed valid, malformed, missing, trailhead-only, approach-only, demo, preview, imported, and source-backed geometry classes as non-production QA data. |
| Explore / Trip Builder | Pass with setup limitation | Explore opened on device. The live route list showed no guidance-ready routes in the current live-location radius, so itinerary activation was not repeated in this sweep. Trip Confidence and related edge cases were covered through the dev-only fixture and automated tests. |
| Trip Confidence | Pass | `/dev/trip-confidence-qa` rendered non-live deterministic summaries, missing vehicle cap copy, provider state rows, and product-state isolation copy. |
| Active Trip / Resume | Pass for empty state | `/active-trip` showed honest "No Active Trip" copy. Resume/packet persisted-trip flows were not re-created in this sweep to avoid unnecessary product state mutation; regression tests passed. |
| Offline Incident Packet | Pass for empty state | `/offline-incident-packet` showed honest "No Offline Incident Packet" and local-only packet guidance. Packet persistence flows remain covered by prior native QA and regression tests. |
| Terrain Risk | Pass | Dashboard showed route-terrain standby when no route guidance was active. Route overlay fixture preserved approach-only/trailhead-only route authority. Terrain Risk regression tests passed. |
| Camp Viability | Pass by regression | No new camp state was created during the sweep. Camp Viability tests passed and prior native QA remains the device evidence for active trip integration. |
| Badge / Expedition Identity | Pass | Expedition Hub rendered badge achievements, earned count, and read-only Unlocked Badges profile surface with current title and latest badge. No Fleet/trip/packet state was intentionally mutated. |
| Dispatch / Convoy copy | Pass | SM-S948U created a temporary one-device convoy through the normal UI, showed active convoy in Dispatch while tracking disabled, did not show stale ended/stopped lifecycle copy while active, showed scoped live location sharing copy only after Share, and returned to clean diagnostic baseline after End Convoy. |
| Convoy participant fixture | Pass | `/dev/convoy-participant-qa` rendered dev-only local participants, status labels, role variants, read-only badge title fixture, and no membership/location/badge mutation copy. |
| Provider outage/no-results | Pass | `/dev/provider-outage-qa` rendered dev-only provider unavailable, timeout, error, no-results, not-requested, stale-cache, bailout, weather, and route fallback fixtures with providers not called and product state untouched. |
| Hardware telemetry fallback | Pass with field caveat | Dashboard showed OBD2 offline / vehicle disconnected and power monitor fallback without crash. No live OBD2, EcoFlow, or Mopeka hardware session was run in this sweep; hardware trust remains gated by field qualification. |
| Product state safety | Pass | Device B post-cleanup diagnostic showed no active convoy, no participant id, live sharing inactive, clean baseline, setup ready. No raw evidence was added to git. |

## Navigate Provider Android Sweep

Added 2026-07-08 on `codex/post-closed-beta-feature-cycle`.

Purpose: close the remaining Navigate validation gap with a repeatable Android evidence path for provider-backed candidate pins/actions, active route-line context, and the current destination-search freeze/standby behavior.

Tracked manifest path: `.smoke/navigate-provider-android-sweep/manifest.json`

Raw screenshots, XML, logs, gfxinfo, Perfetto traces, and sanitized provider summary inputs remain local unless intentionally summarized into the manifest. Do not commit raw provider payloads, provider secrets, precise private coordinates, raw UI XML containing private trip data, or unsanitized logcat.

Required setup:

- Seed the emulator/device location near the route/provider cell: `npm run qa:android:seed-location -- --lat=<rounded latitude> --lng=<rounded longitude>`.
- Confirm the app is signed into the QA account and the Navigate tab is visible.
- Capture a sanitized provider summary JSON from ECS-owned provider-backed records only. It must use `source: "real_provider_sanitized_summary"`, summarized provider/source counts, freshness states, candidate/action counts, active route-line context booleans, and redaction confirmations. It must not include raw provider payloads, provider record ids, secrets, or precise coordinates.

Required Android captures:

- Provider-backed candidate pins visible on Navigate with active route context.
- Candidate actions exercised: Navigate Here, Save Camp, Report Unusable, and Dismiss.
- Active route-line context visible while provider candidates remain anchored to the route or explicitly blocked.
- Destination search focus/open/typing standby capture that shows the map freeze/standby path did not wake unnecessary live map work. Attach gfxinfo or Perfetto when available.
- Logcat slice for the same run with fatal/redbox/provider-secret patterns absent.

Command sequence:

- `npm run test:navigate-provider-android-evidence`
- `npm run test:navigate-mobile-emulation-regressions`
- `npm run evidence:navigate-provider-android -- --provider-summary=<sanitized-summary.json> --candidate-pin-screenshot=<pins.png> --candidate-pin-screenshot=<actions.png> --active-route-line-screenshot=<route-line.png> --search-freeze-artifact=<gfxinfo-or-perfetto.txt> --log=<logcat.txt> --real`
- `npm run gate:navigate-provider-android-evidence`

Truth rules:

- Running `npm run evidence:navigate-provider-android` without a real sanitized provider summary writes a blocked manifest from the existing `.smoke/navigate-deep` and `.smoke/campops-android-qa` references. That is useful handoff context, not provider-backed acceptance.
- The strict gate must fail until real provider-backed candidate evidence, Android action captures, active route-line context, search freeze/standby runtime evidence, and logs are all present.
- The manifest never claims production acceptance, provider influence approval, owner acceptance, live legal/access authority, fresh availability, raw provider payload review, or precise private coordinate capture.

## Commands

All requested commands passed:

- `npm run lint`
- `npm run smoke -- --json`
- `npm run test:android-mapbox-route-overlay-qa`
- `npm run test:provider-outage-no-results-fixtures`
- `npm run test:route-confidence-engine`
- `npm run test:trip-confidence-summary`
- `npm run test:active-trip-mode-foundation`
- `npm run test:offline-incident-packet-foundation`
- `npm run test:active-trip-resume-discoverability`
- `npm run test:terrain-risk-v1`
- `npm run test:camp-viability-score-v1`
- `npm run test:badge-expedition-identity-mvp`
- `npm run test:convoy-live-multidevice-privacy-gate`
- `npm run test:convoy-command`
- `npm run test:convoy-privacy-safety`
- `npm run test:convoy-badge-title-display`
- `npm run test:hardware-telemetry-field-qualification`
- `npm run test:fleet-production`
- `npm run test:weather-production`
- `git diff --check`

Smoke passed. Its nested lint stage was skipped by the smoke runner due local child-process `spawn EINVAL`, but standalone `npm run lint` passed immediately before the smoke run.

## Blockers

No native closed-beta blockers were found in this sweep.

Remaining caveats:

- Active Trip creation/resume, Offline Packet persistence, Terrain Risk, and Camp Viability were not re-created from a live Trip Builder route in this sweep because the current Explore live-radius state had no guidance-ready route available. Prior native QA and current regression tests remain the evidence for those flows.
- Hardware telemetry was validated as safe fallback only. Live hardware trust for VeePeak/OBD2, EcoFlow, and Mopeka still depends on field qualification results.

## Recommendation

Android beta packaging is ready to proceed with caveats. The product spine, dev-only fixture guardrails, Dispatch/Convoy copy, badge identity surface, and regression suite are stable on the two Android 16 devices tested. Keep hardware telemetry trust gated and include the remaining caveats in beta release notes.
