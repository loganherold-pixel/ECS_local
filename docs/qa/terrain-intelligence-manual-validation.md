# Terrain Intelligence Manual Validation and Evidence Package

Status: collection plan only. Evidence is not accepted, production approval is not granted, and this document contains no device results.

## Purpose and authority

Use this procedure for Quick Terrain and Terrain Intelligence Command against one exact release artifact. The authoritative acceptance source remains `config/release-evidence-registry.json`. This package produces sanitized collection metadata that a declared reviewer may later inspect; collection never changes registry acceptance.

Before collection, record the exact 40-character commit SHA, SHA-256 app artifact digest, app version and versionCode/build number. Generate build provenance with `scripts/verification/record-artifact-provenance.mjs`. If any binding is missing or differs from the installed artifact, stop and leave the affected evidence unresolved.

Generate a planned checklist:

```powershell
node scripts/verification/terrain-intelligence-manual-evidence.mjs --output .smoke/verification/terrain-intelligence-manual-checklist.json
```

Once the release artifact digest is known:

```powershell
node scripts/verification/terrain-intelligence-manual-evidence.mjs --artifact-digest <sha256> --output .smoke/verification/terrain-intelligence-manual-checklist.json
```

The generated checklist is deliberately `planned`. A collector may record `collected`, `failed`, or `blocked`; only a separate reviewer workflow may create an accepted registry submission.

## Route fixtures

Create privacy-safe fixtures matching the IDs in `config/terrain-intelligence-validation-scenarios.json`: meaningful measured elevation, flat measured elevation, partial elevation, no elevation, deterministic risk sections, and offline cached route. Keep exact coordinates and complete route traces outside uploaded artifacts. Evidence should name only the fixture ID and safe aggregate facts such as point count bands or distance bands.

Confirm fixture provenance before testing:

1. Elevation values came from the imported file or canonical cached package.
2. Missing elevation samples are intentionally absent; they are not replaced with zero.
3. Deterministic risk fixtures contain explicit mileage boundaries, severity, confidence, and reason codes.
4. No risk section was produced from elevation alone.
5. Cached fixtures carry a source timestamp and can be tested with providers unavailable.

## Browser interaction procedure

Use a supported desktop browser at phone portrait, phone landscape, and tablet-like responsive widths. Open Dashboard with development diagnostics enabled.

1. Expand Quick Terrain and collapse it repeatedly. Confirm graph, selected range, Auto Follow, surrounding Dashboard state, and compact placement survive.
2. Scrub with a pointer at the beginning, peaks/valleys, risk boundaries, events, and route end. Compare the crosshair’s sample index, distance, elevation, grade, risk, and source with the sanitized fixture expectations.
3. Select NEXT 1 MI, NEXT 5 MI, and FULL ROUTE. Confirm the visible-range label and axes update while profile calculations remain stable unless the profile fingerprint changes.
4. Disable and re-enable Auto Follow. Confirm progress focus resumes without changing route data.
5. Open source inspection from header, lower metrics, selection detail, and recommendation. Verify source, freshness, confidence, and unavailable states.
6. Select a point or risk segment, choose Show on Map, then return to Dashboard. Verify active guidance identity is unchanged, no duplicate pin appears, and selection state is preserved.
7. Enable system/ECS reduced motion. Confirm reveal, pulse, progress, crosshair, range, and expansion changes become static or immediate.
8. Background the browser tab, wait through at least one progress interval, then return. Confirm unnecessary animation was suspended and stale data did not pulse as live.

Browser checks are development validation and do not satisfy physical-device evidence IDs.

## Android procedure

Use the exact release artifact on a supported physical phone; add a tablet only when available. Record Android version, device model, app version/versionCode, artifact digest, collector, and UTC timestamps.

Run portrait, landscape, dynamic text, and optional tablet layouts. For each route fixture:

1. Validate Quick Terrain’s no-route, loading, ready, partial, stale/cached, unavailable, and error presentations.
2. Validate expanded profile axes, completed/remaining distinction, progress start/middle/end, risk sections, event markers, source inspector, ranges, Auto Follow, and collapse/restore.
3. While stationary, scrub and select risk/event details. While moving under the approved closed-field procedure, confirm precision controls are restricted by the canonical motion state and only the next material event is emphasized.
4. Import GPX elevation, then test flat, partial, and absent elevation. Confirm absent elevation never renders a measured-looking silhouette.
5. During active guidance, test accepted progress, off-route state, Show on Map, and return. Capture the guidance identity before and after; it must not change.
6. Replace the active vehicle/loadout. Vehicle fit and confidence must update while profile/path generation counters remain unchanged.
7. Test offline cache hit and miss. A hit remains labeled cached/stale as appropriate; a miss is unavailable. Neither may display a live pulse.
8. Background and foreground the app. Confirm route, progress, selection, Auto Follow, source state, and motion policy restore deterministically.
9. Expand/collapse at least 20 times. Record memory before, peak observation if available, memory after settling, listener warnings, and diagnostic counters.
10. Run sustained representative battery and thermal sessions under the established mobile QA duration. Record start/end battery, charging state, screen state, operational phases, ambient limitations, Android thermal status when available, and observed throttling. Do not infer causality or improvement.

## iOS procedure

Use the equivalent exact release build on a supported physical iPhone; add iPad only where supported. Record iOS version, model, build number, artifact digest, collector, and UTC timestamps.

Repeat the Android truth, fixture, guidance, offline, lifecycle, performance, battery, and thermal matrix while also checking:

1. Safe-area behavior around header, collapse/source actions, graph, recommendation, and home indicator.
2. Gesture arbitration with system back/navigation gestures and ScrollView containment.
3. Dynamic Type at supported accessibility sizes and landscape rotation.
4. Location/motion permission grant, denial, revocation, and recovery. Denial must not create predictive side slope or a false moving state.
5. iOS background suspension and foreground restoration within platform limits. Record the actual suspension duration rather than assuming timers ran.
6. iOS thermal state and battery observations through approved Instruments/device diagnostics when available. Keep raw traces in controlled storage.

## Truthfulness checks

Every platform must explicitly verify:

- No graph appears without measured elevation.
- Partial elevation is labeled partial and missing samples are not fabricated.
- Predictive side slope remains unknown without a verified terrain-model source.
- Live roll, if displayed, is labeled live attitude and never substituted for predictive side slope.
- Risk colors align only with deterministic segment mileage, severity, and reason codes.
- Progress follows canonical route progress; GPS jitter rejected by the visual coalescer does not move the cursor.
- Stale, cached, partial, unavailable, and error states cannot pulse as live.
- Show on Map preserves route and active-guidance identity, does not duplicate pins, and does not mutate guidance.
- Returning to Dashboard preserves compact/expanded state, range, Auto Follow, and selection where the route is unchanged.

## Performance capture

Reset development counters immediately before each bounded scenario. Capture before/after snapshots, never continuous raw GPS or route logs:

- `compactWidgetRenders`
- `expandedHudRenders`
- `profileComputations`
- `pathGenerations`
- `progressUpdates`
- `coalescedProgressUpdates`
- `lastExpansionLatencyMs`
- `lastScrubResponseMs`

Also record memory before and after the 20-cycle expand/collapse procedure. A progress-only update should not increment profile/path generation. Vehicle replacement may change fit but not profile/path generation. Record observations without frame-rate claims unless captured by an approved device profiler.

## Evidence mapping

| Validation scope | Existing evidence ID |
| --- | --- |
| Android layout, accessibility, fixtures, interaction | `mobile_android_golden_journey` |
| iOS layout, accessibility, fixtures, gestures | `mobile_ios_golden_journey` |
| Background/foreground state restoration | `mobile_background_restoration` |
| Sustained battery observations | `mobile_battery` |
| Sustained thermal observations | `mobile_thermal` |
| Graph-to-map responsiveness, repeated expansion, scrub response | `mobile_map_responsiveness` |
| Moving restrictions, off-route, guidance preservation, field truthfulness | `field_active_guidance` |
| Exact SHA and app artifact digest binding | `field_build_provenance` |
| Separate QA-owner decision | `owner_release_qa` |
| Separate safety-owner decision | `owner_release_safety` |
| Separate field-operations decision | `owner_release_field_ops` |

Multiple checklist scenarios may be bundled into one sanitized evidence artifact for an existing evidence ID. Do not create a new registry ID merely to store scenario granularity.

## Sanitization and review

Raw screenshots, profiler traces, memory captures, logs, and route fixtures stay local or in approved restricted storage. The uploaded/committed record may contain only safe fixture IDs, aggregate counters, bounded observations, artifact digest/reference, and review metadata. Run the repository artifact sanitizer before export. Exact coordinates, route geometry, trip traces, user identifiers, private paths, and tokens are prohibited.

Each record must carry commit SHA, app digest, version/versionCode, platform, OS, model where required, fixture/scenario IDs, expected and actual result, safe reference, collector, reviewer, status, and expiration date. Missing fields, wrong build, malformed digest, unassigned required reviewer, or missing device model remain unresolved.

The reviewer must match the role declared by the authoritative evidence requirement. A collector cannot self-promote a record to accepted. Owner decisions remain separate from device and field collection. Production approval remains a separate registry decision.
