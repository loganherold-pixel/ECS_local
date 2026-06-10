# Android Mapbox Route Overlay QA

Branch: `codex/android-mapbox-route-overlay-qa-hardening`

## Fixture Route

Open the dev/test-only route:

```text
planning-offline-sync:///dev/route-overlay-qa
```

The route is guarded by `__DEV__` or `NODE_ENV === 'test'`. Production runtime redirects to `/`.

## Fixture Coverage

| Fixture | Expected overlay behavior | Authority copy |
| --- | --- | --- |
| Valid LineString route | Route line renders | Trail route geometry |
| Malformed geometry | Controlled fallback, no crash | Geometry malformed |
| Missing geometry | Controlled fallback, no crash | Geometry unavailable |
| Trailhead-only | Trailhead marker only | Trailhead guidance |
| Approach-only | Approach route line only | Approach-only guidance |
| Demo route geometry | Route line renders as demo fixture | Demo fixture |
| Preview geometry | Route line renders as preview | Preview geometry |
| Imported route geometry | Route line renders as imported | Imported route geometry |
| Source-backed trail geometry | Route line renders as source-backed only because metadata supports it | Source-backed geometry |

All fixtures are local deterministic QA records. They do not mutate route catalogs, saved itineraries, Active Trip, Offline Incident Packet, Badge, Convoy, Fleet, telemetry, or provider state.

## Manual Android QA Checklist

1. Install or launch the Android dev build with a valid public Mapbox token already configured.
2. Open `planning-offline-sync:///dev/route-overlay-qa`.
3. Confirm the header says `DEV ONLY - ROUTE OVERLAY QA` and `NON-PRODUCTION QA FIXTURE`.
4. Select each geometry class.
5. For valid, demo, preview, imported, and source-backed fixtures, confirm the map renders and a route line appears.
6. For approach-only, confirm a route line appears but the copy says approach-only and does not claim trail terrain or full trail geometry.
7. For trailhead-only, confirm no full route line is claimed and the trailhead-only copy is visible.
8. For malformed and missing geometry, confirm controlled fallback/unavailable copy is visible and the app does not crash.
9. Confirm demo is not verified, preview is not verified, imported is not source-backed, and source-backed only appears on the fixture with supporting metadata.
10. Confirm no saved route, itinerary, Active Trip, Offline Packet, Badge, Convoy, Fleet, or telemetry state changes.
11. Capture raw screenshots/logcat/UI dumps locally under ignored `.qa/` or `qa-evidence/`.
12. Commit only a concise markdown summary after checking evidence for route, location, account, device, token, and convoy data.

## Known Limitations

- This is a QA harness, not production route discovery.
- The source-backed fixture is explicitly dev/test-only and does not prove provider-backed route authority.
- Native evidence was captured on Samsung SM-X230 hardware on 2026-06-09 using the dev/test-only fixture route.
- The fixture uses the existing configured Mapbox token only; it does not call a provider or token edge function.

## Native QA Attempt - 2026-06-09

Device detected: Samsung SM-X230, Android 16, serial `R5GL13VYSRY`.

Result: automated guard tests passed, but the visual native route overlay sweep was blocked because the tablet remained at the Android PIN/keyguard screen. ADB could focus `com.expeditioncommand.planningofflinesync/.MainActivity`, but UI dumps continued to report `mDreamingLockscreen=true` and `NotificationShade`, so ECS tabs and the route overlay fixture could not be honestly verified from native screenshots.

Local raw evidence folder: `.qa/android-mapbox-route-overlay-native/`

Passing checks from this attempt:

- `npm run test:android-mapbox-route-overlay-qa`
- `npm run test:canonical-route-geometry-normalizer`
- `npm run test:map-route-rendering-overlays`
- `npm run test:explore-route-type-enforcement`
- `npm run test:route-confidence-engine`
- `npm run test:trip-confidence-summary`
- `npm run test:active-trip-mode-foundation`
- `npm run lint`
- `npm run smoke -- --json`
- `git diff --check`

## Native QA Rerun - 2026-06-09

Device: Samsung SM-X230, Android 16, serial `R5GL13VYSRY`.

Keyguard status: unlocked and awake. ADB screenshot captured the launcher before app launch, and window state reported `mDreamingLockscreen=false`.

Local raw evidence folder: `.qa/android-mapbox-route-overlay-native-rerun/`

Result: pass. The fixture opened at `planning-offline-sync:///dev/route-overlay-qa`, displayed dev/test and non-production copy, and did not show redbox or fatal logcat patterns. Bottom tabs routed correctly before opening the fixture.

Scenario results:

- Valid geometry: native Mapbox rendered, route line rendered, authority copy remained `Trail route geometry`.
- Malformed geometry: no crash, no stale route line, controlled fallback copy displayed `Geometry malformed`.
- Missing geometry: no crash, no fake route line, controlled fallback copy displayed `Geometry unavailable`.
- Trailhead-only: trailhead marker displayed, no full trail route implied, copy said trailhead guidance only.
- Approach-only: approach route line rendered, copy said approach-only and trail terrain/full trail geometry are not verified.
- Demo route: route line rendered as a demo fixture, not verified/source-backed.
- Preview geometry: route line rendered as preview geometry, not verified.
- Imported route: route line rendered as imported route geometry requiring operator verification.
- Source-backed trail geometry: source-backed copy appeared only on the explicit source-backed QA sample.

Product-state isolation remained visible after the sweep: providers not called, saved routes untouched, Active Trip untouched, Offline Packet untouched, Badge / Convoy untouched.

Passing checks from this rerun:

- `npm run test:android-mapbox-route-overlay-qa`
- `npm run test:canonical-route-geometry-normalizer`
- `npm run test:map-route-rendering-overlays`
- `npm run test:explore-route-type-enforcement`
- `npm run test:route-confidence-engine`
- `npm run test:trip-confidence-summary`
- `npm run test:active-trip-mode-foundation`
- `npm run lint`
- `npm run smoke -- --json`
- `git diff --check`
