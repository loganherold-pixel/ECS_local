# EcoFlow BLU Troubleshooting

This note captures the current ECS EcoFlow architecture after the BLU driver-health pass. It is intentionally separate from the VeePeak OBD2 reference path, which remains the known-good local BLE telemetry pipeline.

## Current Architecture

EcoFlow support is hybrid at the scanner level, but live telemetry is cloud-first today.

| Path | Current status | Live telemetry source |
| --- | --- | --- |
| EcoFlow Cloud/API | Implemented through `lib/ecoflowCloudConnection.ts`, `src/power/cloud/providers/EcoFlowCloudProvider.ts`, and `supabase/functions/ecoflow/index.ts` | EcoFlow quota/status data fetched server-side through Supabase |
| EcoFlow local BLE | Device discovery and native transport attachment are present through the unified scanner and `lib/genericBluetoothAccessoryManager.ts` | Not live yet; no validated EcoFlow BLE handshake/notification/parser is registered |
| Hybrid cloud + BLE | Discovery records can preserve nearby BLE evidence while routing telemetry to cloud when a cloud source exists | Cloud telemetry only until local BLE decoding is validated |
| Mock/stub data | Not used for live EcoFlow telemetry | Mock data must remain dev-only and visibly non-live |

EcoFlow credentials stay server-side in the Supabase Edge Function. Mobile code must not contain EcoFlow access keys, secret keys, tokens, or authorization headers.

## Why Glacier Connects But Times Out

Glacier can advertise over BLE and ECS can attach to the native BLE transport. The timeout occurs after transport attachment because ECS does not yet have a validated EcoFlow local BLE protocol for Glacier:

- no confirmed Glacier service/characteristic map is promoted to release behavior,
- no validated EcoFlow write/auth handshake is sent,
- no notification subscription is started for decoded Glacier telemetry,
- `src/power/drivers/vendors/EcoFlowDriver.ts` remains parser-pending,
- the generic accessory manager can discover services but does not decode EcoFlow model telemetry.

The local BLE path now records this as:

```ts
{
  phase: 'timeout',
  timeoutKind: 'firstTelemetryTimeout',
  source: 'local-ble',
  diagnosticReason: {
    phase: 'timeout',
    reason: 'EcoFlow Bluetooth is attached, but ECS does not yet have a validated local telemetry parser for this model. Use the EcoFlow Cloud/API path for live telemetry while local decoding is pending.',
    canRetry: false,
    requiresCloudAuth: true,
    requiresNativeBle: false
  }
}
```

This is not a silent connection timeout and it is not a VeePeak/OBD2 regression. It means native BLE transport succeeded, then first live EcoFlow telemetry failed because the local parser/handshake is not implemented.

## Why One EcoFlow Device May Work While Another Does Not

EcoFlow devices do not currently share one proven ECS local BLE telemetry protocol. ECS release telemetry is cloud/API-first, and the cloud catalog can return inconsistent product metadata across model families:

- Glacier may arrive as `GLACIER`, `refrigerator`, or a user-renamed fridge.
- DELTA/RIVER devices may arrive as `Power Station`, `Portable Power Station`, `DELTA 2`, `RIVER 2 Pro`, a numeric/opaque product type, or an empty product type with model/name metadata.
- The `quota/all` telemetry response may be an object for one model family and an array of quota key/value entries for another.

ECS now normalizes EcoFlow product types through one shared classifier before deciding whether a cloud/API telemetry attempt is allowed. That classifier maps Glacier/fridge names to `refrigerator`, DELTA/RIVER/power-station names to `power_station`, WAVE-style names to `portable_ac`, and alternator/DC charger names to `charger`. Unknown product types remain visible but are not promoted as local BLE live telemetry unless the cloud path produces decoded numeric data.

The cloud quota decoder also accepts array-style key/value payloads, so a DELTA/RIVER response shaped differently from Glacier can still decode SOC, watts, voltage, solar input, and temperature when those fields are present.

## Connection Phases

EcoFlow diagnostics are stored per stable device id in `lib/ecoflowConnectionDiagnostics.ts`.

Supported phases:

- `discovered`
- `connecting`
- `connected`
- `handshaking`
- `awaitingTelemetry`
- `streaming`
- `cloudPolling`
- `timeout`
- `failed`
- `disconnected`

Timeout kinds:

- `scanTimeout`
- `connectTimeout`
- `handshakeTimeout`
- `firstTelemetryTimeout`
- `streamStaleTimeout`
- `cloudPollTimeout`

Fallback source values:

- `local-ble`
- `ecoflow-cloud`
- `hybrid`
- `unavailable`

## Cloud/API Failure Modes

EcoFlow cloud discovery and polling can fail independently of local BLE.

| Failure | Likely cause | State/log signal |
| --- | --- | --- |
| Cloud discovery unauthorized | EcoFlow developer app lacks account/device access, wrong account, wrong region, or denied serial | `requiresCloudAuth: true`, `source: 'ecoflow-cloud'`, cloud auth diagnostics |
| Cloud device list works but quota fails | Device serial not authorized for quota/status API or stale permissions | `cloudPollTimeout` or `failed` with provider status/error |
| Cloud poll returns empty payload | Quota payload has no decoded numeric fields for the model | `firstTelemetryTimeout` or `cloudPollTimeout`; no fake telemetry is ingested |
| Cloud polling stalls later | API/network/provider status problem | `cloudPollTimeout`; session can retry unless auth is blocked |

## Per-Device Telemetry State

Cloud polling sessions are keyed by device id in `lib/ecoflowCloudConnection.ts`. Starting a session for one EcoFlow device no longer stops every other EcoFlow polling session. Disconnecting one cloud device stops that device's session without collapsing the remaining selections.

Canonical telemetry still flows through:

1. `connectEcoFlowCloudDevice()` or `startEcoFlowCloudTelemetryPolling()`
2. `ingestEcoFlowCloudTelemetryResult()` in `lib/useUnifiedDeviceConnections.ts`
3. `powerTelemetryManager.ingestTelemetry()`
4. `bluStateStore.ingestEcoFlowData()`
5. Dashboard/Power Center consumers

Telemetry is not marked live unless decoded numeric EcoFlow values exist.

## Local BLE Current Status

Local BLE EcoFlow rows are useful for proving nearby device presence and transport attachment, but they are not release live telemetry. On successful local attachment, ECS registers the device as connected and telemetry-unsupported, then records `firstTelemetryTimeout` with `LOCAL_BLE_PARSER_UNAVAILABLE`.

The next real local-BLE implementation must add, with field evidence:

- model-specific service UUIDs,
- writable control/auth characteristic,
- notification characteristic,
- handshake command encoding,
- telemetry packet decoder,
- keepalive and disconnect cleanup,
- tests proving no mock data is promoted as live.

## Regression Guard

VeePeak OBD2 remains the reference live local BLE path. EcoFlow changes must not modify OBD2 scan, ELM327 initialization, PID polling, store ingestion, or dashboard vehicle telemetry rendering.
