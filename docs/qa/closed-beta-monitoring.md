# Closed Beta Monitoring

This document defines the privacy-safe issue reporting workflow for the ECS closed beta. Raw screenshots, UI dumps, logcat captures, invite codes, precise coordinates, account ids, tokens, provider payloads, and hardware serials stay in ignored local evidence folders only, such as `.qa/` or `qa-evidence/`.

## Tester Issue Report Template

Use this template for closed beta issue reports:

- Build: app name, package id, versionName, versionCode, build profile, channel, and build fingerprint from More > Settings.
- Device: model, Android version, and whether it was a phone or tablet.
- Feature area: Fleet, Navigate, Dashboard, Explore, Trip Builder, Active Trip, Offline Packet, Terrain Risk, Camp Viability, Badge Identity, Dispatch, Convoy, Weather, or Hardware Telemetry.
- Time: local date/time and timezone.
- What happened: short description of the visible problem.
- Expected behavior: what the tester expected ECS to do.
- State labels: use ECS labels such as live, stale, unavailable, unknown, manual, demo, mock, not requested, no results, or provider unavailable.
- Repro steps: concise steps, using route names or region labels when safe.
- Evidence folder: local ignored folder path if screenshots/logs were captured.

## Do Not Share

Do not share any of the following in a tracked doc, issue summary, chat, or support report:

- access tokens, refresh tokens, Supabase JWTs, service-role keys, API keys, provider credentials, or Mapbox tokens.
- raw auth JSON, full user ids, full session ids, passwords, or magic-link payloads.
- precise coordinates, location histories, raw convoy location rows, or raw invite codes.
- raw BLE payloads, hardware serial numbers, device ids, provider payloads, or sensitive telemetry frames.
- local incident packet contents beyond a safe summary label.

## Safe Diagnostics Model

The closed beta diagnostics report keeps:

- app name, package id, versionName, versionCode, runtimeVersion, build profile, channel, and environment.
- backend/project label when safe, plus Supabase configured yes/no and Mapbox configured yes/no.
- device platform, Android version, and model.
- feature area and non-sensitive issue summary.
- state labels for Active Trip, Offline Packet, Convoy, telemetry, weather, route/provider, and support status.
- recent non-sensitive warning/error summaries after redaction.

The diagnostics report redacts or omits tokens, secrets, raw auth state, precise coordinates, raw convoy location history, raw BLE/provider payloads, hardware serials, and local incident details.

## Build And Version Display

Testers can find visible build provenance in More > Settings > Build Fingerprint. Capture:

- package id: `com.expeditioncommand.planningofflinesync`
- versionName
- versionCode
- commit short SHA
- build profile
- channel
- dirty flag
- build time

For fieldtest APKs, EAS auto-increments the native build number. Check the remote uploaded version before creating a new build.

## Field Issue Reporting

More > Settings > Report Field Issue sends a short structured report into the ECS issue-intelligence pipeline. It is intended for labels and short descriptions, not raw logs. The report should use visible ECS state labels and avoid raw identity, location, invite, provider, and telemetry data.

## Screenshot Guidance

Screenshots are allowed for local QA evidence, but keep raw files ignored under `.qa/` or `qa-evidence/`. Before sharing any screenshot outside the local evidence folder, crop or redact:

- email addresses, user ids, invite codes, or QR codes.
- precise map position, coordinate text, or location histories.
- provider credentials, hardware identifiers, or raw diagnostic payloads.

## Convoy/location Issues

Report Convoy/location issues with:

- active convoy status label only.
- participant role/status labels such as Leader, Member, Live, Stale, Disconnected, Unknown, or Demo.
- whether tracking was enabled, disabled, denied, revoked, or stopped.
- whether the other participant appeared before or after join.

Do not include raw invite codes, raw user ids, precise coordinates, location rows, or raw realtime payloads.

## Hardware telemetry issues

Report hardware telemetry issues with:

- provider family: OBD2/VeePeak, EcoFlow BLE, EcoFlow Cloud/API, Mopeka, BLU power, or manual power.
- ECS state label: live, stale, manual, unknown, unavailable, unsupported, mock, demo, or error.
- connection phase: scanning, connecting, reading, disconnected, timeout, unavailable, or unsupported.
- metric names received, not raw payloads.

Do not include hardware serials, raw BLE frames, provider credentials, full cloud responses, or raw telemetry dumps.

## Route/provider issues

Report route/provider issues with:

- route name or broad region label when safe.
- route authority label: trailhead-only, approach-only, demo, preview, imported, source-backed, verified, unknown, invalid, or missing.
- provider status: unavailable, timeout, error, no results, not requested, stale, or live.
- whether a route line, fallback, marker, or warning appeared.

Do not include raw provider credentials, precise private coordinates, raw route imports from private trips, or fabricated source authority.

## Known Caveats

- Hardware telemetry remains truth-boundary cleared only, not fully field-qualified for all live providers.
- Convoy stale-threshold transition is covered by automated guards; the full native wait was not repeated during the last closed-beta pass.
- Dispatch can briefly show stale lifecycle copy while the active Convoy card is visible.
- The top Dispatch team card can show `NO ACTIVE TEAM` while the Convoy panel correctly shows an active convoy roster.
- Standalone lint passes; the smoke harness embedded lint substage can locally skip with the known spawn EINVAL condition.
- Broader Android device coverage is still needed.
