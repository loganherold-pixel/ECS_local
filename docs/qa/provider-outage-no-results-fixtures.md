# Provider Outage And No-Results Fixture QA

Branch: `codex/provider-outage-no-results-fixtures`

Fixture route: `planning-offline-sync:///dev/provider-outage-qa`

This fixture is dev/test only. It uses deterministic local inputs and does not call live POI, weather, route, or map providers. It must not mutate saved itineraries, Active Trip, Offline Packet, Badge, Convoy, Fleet, telemetry, provider credentials, provider config, or the route catalog.

## Provider Seams Audited

- Pre-trail POI resolver: `provider_unavailable`, timeout/error represented through unavailable semantics, `no_results`, `not_requested`, stale/cache candidate labeling.
- Trip Builder itinerary summary: visible copy for not requested, provider unavailable, pending/updating, no results, and stale/cache fixture copy.
- Bailout filtering: far-away provider candidates are rejected; no-results does not create a fake bailout; stale route fallback remains labeled.
- Weather confidence input: unavailable and stale cache remain distinct and never read as fair/safe/live.
- Route/Mapbox geometry: unavailable and malformed geometry use controlled fallback states without fabricated route lines.
- Route Confidence Engine: provider unavailable, no results, stale weather, unavailable weather, missing/malformed geometry, and telemetry-unavailable semantics remain visible.

## Fixture Scenarios

- Pre-trail provider unavailable
- Pre-trail provider timeout
- Pre-trail provider error
- Pre-trail no results
- Pre-trail not requested
- Pre-trail stale cache
- Bailout no results
- Weather provider unavailable
- Weather stale cache
- Route provider unavailable
- Route geometry malformed

## Android Native QA Result - 2026-06-10

Device: Samsung SM-X230, Android 16, serial `R5GL13VYSRY`

Local raw evidence folder: `.qa/provider-outage-no-results-native/` (ignored)

Result: Passed native fixture sweep after restarting Metro with `node scripts/start-expo-safe.mjs --dev-client --clear` and waiting for the Android bundle to finish. The first deep-link attempt before the bundle was ready produced a non-fatal ReactHost soft exception (`onNewIntent while context is not ready`); rerunning the fixture route after the JS context was ready succeeded.

Scenario notes:

- Native launch: app launched and bottom tabs routed to Fleet, Navigate, Dashboard, Explore, and Dispatch without redbox or fatal logcat patterns.
- Fixture access: `planning-offline-sync:///dev/provider-outage-qa` opened the dev/test-only fixture and displayed non-production/provider-not-called/product-untouched copy.
- Pre-trail provider unavailable: Trip Builder displayed provider unavailable, Trip Confidence showed `POI provider unavailable`, and no fake POI success appeared.
- Pre-trail no results: copy displayed no nearby candidates, stayed distinct from provider unavailable, and Trip Confidence showed `POI candidate list empty`.
- Pre-trail not requested: copy displayed not requested and did not present as provider failure.
- Provider timeout/error: timeout and error copy rendered, no crash occurred, and both degraded through provider-unavailable confidence semantics without fake success.
- Bailout no results: no fake bailout appeared; far-away provider candidates were rejected and copy stayed honest.
- Weather unavailable/stale: unavailable and stale copy rendered without fair/safe claims; confidence stayed conservative.
- Route provider unavailable/malformed geometry: controlled fallback copy rendered and no trusted/fake route line was implied.
- Product state isolation: fixture displayed isolation rows, no provider calls were made, no fatal logs appeared, and post-sweep Fleet/Dashboard still rendered the existing active vehicle and normal dashboard state.

## Manual Android QA Checklist

1. Unlock the Android device and keep it awake.
2. Start Metro with the repo's normal dev-client path and set `adb reverse tcp:8081 tcp:8081` if needed.
3. Launch ECS and confirm no redbox or fatal logcat patterns.
4. Open `planning-offline-sync:///dev/provider-outage-qa`.
5. Confirm the screen says dev/test/non-production and provider calls are not made.
6. For each scenario, confirm Provider copy, Trip Builder copy, Route/Mapbox copy, Weather copy, Bailout copy, and Confidence reasons are honest.
7. Confirm unavailable, timeout, and error do not show fake POI success.
8. Confirm no-results stays distinct from unavailable.
9. Confirm not-requested does not show provider failure.
10. Confirm stale/cache copy is visible and does not read live or verified.
11. Confirm weather unavailable does not display fair or safe.
12. Confirm route unavailable/malformed geometry does not render a fake trusted route line.
13. Confirm no mutation of saved itineraries, Active Trip, Offline Packet, Badge, Convoy, Fleet, telemetry, credentials, config, or route catalog.

## Known Limitations

- The fixture does not call real providers and cannot validate live outage response timing.
- Timeout and error are represented as deterministic fixture states that degrade into existing provider-unavailable Trip Builder semantics.
- It does not add new provider APIs or route data sources.
- Native Mapbox visual overlay evidence should still be captured separately under ignored `.qa/` or `qa-evidence/` folders.
