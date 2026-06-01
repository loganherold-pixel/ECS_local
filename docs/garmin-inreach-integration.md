# Garmin/inReach Workflow Integration

## Existing ECS Surfaces Found

- Dispatch/CAD event types and live feed: `lib/dispatchTypes.ts`, `lib/dispatchLiveEvents.ts`, `lib/dispatchEventStore.ts`.
- Incident and recovery workflow: `lib/incidentRecoveryWorkflowStore.ts`, `lib/incidentRecoveryContextAdapter.ts`, `lib/incidentCommunicationPacket.ts`.
- Device registry patterns: `lib/BluDeviceRegistry.ts`, `lib/BluProviderRegistry.ts`, `lib/EcsProviderRegistry.ts`.
- Event and audit helpers: `lib/dispatchIntegrity.ts`, `lib/dispatchAuditAdapter.ts`, `lib/ecsBus.ts`.
- Route, GPX, and AI layers: `lib/gpxParser.ts`, `lib/gpxExport.ts`, `lib/routeAnalysisEngine.ts`, `lib/ai/*`.

## Additive Integration Shape

Garmin/inReach code is isolated under `lib/garmin`. It does not add Garmin-specific fields to core Dispatch or Expedition models.

- Inbound inReach location updates normalize to existing Dispatch `team_ping` / CAD `check_in`.
- Inbound inReach messages normalize to existing Dispatch `team_ping` / CAD `ping`.
- Inbound SOS signals normalize to existing Dispatch `assistance` / CAD `assist` with `critical` priority and human review required.
- Device identifiers are masked for UI and stored as stable hashes in generated metadata.
- Outbound command drafts always require explicit operator confirmation before queueing.
- SOS confirm/cancel automation is blocked. SOS codes are incident signals only.

## Rollout Flags

Defaults are disabled in `lib/garmin/garminInreachConfig.ts`.

- `garminInreachEnabled`
- `garminInreachInboundEventsEnabled`
- `garminInreachOutboundCommandsEnabled`
- `garminInreachSosSignalsEnabled`

Secrets should be supplied through the existing ECS environment/config mechanism using the configured env key names. No production key is hardcoded.

## Future Wiring TODOs

- Register a Garmin provider through the existing device/integration registry once product credentials and API transport are available.
- Publish normalized live events into `dispatchEventStore` from an authenticated webhook or polling adapter.
- Link critical SOS CAD events to Incident & Recovery screens using the existing incident context adapter.
- Add operator confirmation UI before sending any chargeable Garmin command.
