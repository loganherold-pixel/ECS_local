# Garmin MapShare/KML Read-Only Integration

This implementation prepares ECS for Garmin MapShare KML feeds without requiring a Garmin device, Garmin Professional account, Portal Connect, IPC access, or live Garmin credentials. It is fixture-first, read-only, and disabled by default.

## Systems Found

| ECS area | Existing extension point used |
| --- | --- |
| Config / feature flags | `lib/garmin/garminInreachConfig.ts` already isolates Garmin flags and modes. MapShare remains behind `GARMIN_INREACH_ENABLED=true` and `GARMIN_INREACH_MODE=mapshare`. |
| KML utilities | `lib/kmlParser.ts` exists for general KML imports. The MapShare adapter now keeps a Garmin-local parser because MapShare needs point-only tolerance, timestamp warnings, dedupe hashes, and stale-feed status. |
| Expedition timeline | `lib/expeditionEventStore.ts` provides `CreateEventInput`. MapShare locations are shaped as expedition checkpoint/comms events without mutating expedition state directly. |
| Dispatch / event model | `lib/garmin/garminInreachEventNormalizer.ts` already defines Garmin domain events. MapShare events can be adapted into Garmin-local domain events with source `garmin_mapshare_kml`. |
| UI visibility | `components/garmin/GarminInreachVisibilityPanel.tsx` and `lib/garmin/garminInreachVisibilityModel.ts` already expose Garmin read-only status. MapShare adds feed, poll, stale, and demo labels while keeping command controls hidden. |
| Debrief | `lib/garmin/garminInreachDebriefIntelligence.ts` already builds Garmin sections. It now accepts MapShare-sourced track/message events and can flag demo/synthetic data. |
| Tests / fixtures | Script-based tests in `scripts/test-garmin-inreach-*.js` and fixture folders under `fixtures/` are the current pattern. MapShare fixtures live in `fixtures/garmin-mapshare-kml/`. |

## What Was Added

- Typed MapShare config defaults:
  - `GARMIN_INREACH_ENABLED=false`
  - `GARMIN_INREACH_MODE=off`
  - `GARMIN_INREACH_KML_FEEDS`
  - `GARMIN_INREACH_MAPSHARE_POLL_INTERVAL_SECONDS=300`
  - `GARMIN_INREACH_MAPSHARE_STALE_AFTER_MINUTES=30`
  - `GARMIN_INREACH_DEMO_KML_ENABLED=false`
  - `GARMIN_INREACH_LOG_PII=false`
- Backward-compatible parsing for older millisecond env keys.
- Garmin-local KML placemark parser that handles namespaces, timestamps, descriptions, altitude, invalid coordinates, unsupported placemarks, empty feeds, and malformed XML.
- Deterministic `sourceHash` generation from feed id, timestamp, coordinate, altitude, label, and message.
- In-memory poll dedupe so repeated KML polling does not create duplicate ECS events.
- Poll result status and health fields:
  - `lastFetchedAt`
  - `lastSuccessfulFetchAt`
  - `lastSourceEventAt`
  - `lastError` via `warning`
  - `failureCount`
  - `etag`
  - `lastModified`
  - stale warnings
- Demo/synthetic MapShare source gated by `GARMIN_INREACH_DEMO_KML_ENABLED=true`.
- Read-only UI model fields for feed name, poll age, command-hidden status, stale state, and demo/synthetic labeling.
- Debrief support for MapShare track replay, parsed message timeline, stale/data-quality notes, and source mode `mapshare`.
- Fixture-backed tests for parser, poller, dedupe, stale warnings, UI read-only behavior, and debrief inclusion.

## Fixture Coverage

Fixtures live in `fixtures/garmin-mapshare-kml/`:

- `single-point.kml`
- `multi-point.kml`
- `timestamp.kml`
- `missing-timestamp.kml`
- `description-message.kml`
- `altitude.kml`
- `namespaces.kml`
- `invalid.kml`
- `empty.kml`

KML coordinate order is longitude, latitude, altitude. ECS normalized events store latitude, longitude, altitude.

## Runtime Behavior

- Disabled Garmin config runs no MapShare polling.
- `off`, `ipc_readonly`, and `ipc_command` modes do not run the MapShare poller.
- `mapshare` mode enables read-only KML ingestion for configured feed URLs.
- Demo KML is never mixed in unless `GARMIN_INREACH_DEMO_KML_ENABLED=true`.
- The adapter rejects non-http(s) URLs and Garmin Explore login/scrape targets.
- One failed feed does not crash ECS or block other feeds.
- Stale feed warning text:
  - `Garmin MapShare feed has not produced a recent location update.`
- No incidents are opened automatically.
- No commands, messages, locate requests, tracking changes, SOS confirm/cancel, or chargeable Garmin operations are implemented.

## TODO For Real Garmin Feed Deployment

- Add an admin/settings surface for entering feed metadata beyond URL-only env config.
- Decide whether MapShare feed health should persist in Supabase or remain local/runtime-only.
- Wire normalized MapShare events into the production event bus/timeline store once persistence policy is confirmed.
- Add operator-visible map layer placement if the active expedition map has a Garmin source layer contract.
- Confirm Garmin MapShare KML feed authentication patterns with product/legal before supporting private feed URLs.
- Add platform-specific scheduling if ECS needs background polling outside active app sessions.
- Keep IPC Outbound, IPC Inbound, commands, and SOS workflows as separate future work behind explicit confirmation and separate tests.
