# EcoFlow BLU Troubleshooting

This note captures the current ECS EcoFlow architecture after the BLU driver-health pass. It is intentionally separate from the VeePeak OBD2 reference path, which remains the known-good local BLE telemetry pipeline.

## Current Architecture

EcoFlow support is hybrid at the scanner level. Cloud/API remains the most complete release path for authorized accounts, and pure local BLE now routes through the native power-adapter path with a conservative `ecoflow_native_ble_v1` decoder.

| Path | Current status | Live telemetry source |
| --- | --- | --- |
| EcoFlow Cloud/API | Implemented through `lib/ecoflowCloudConnection.ts`, `src/power/cloud/providers/EcoFlowCloudProvider.ts`, and `supabase/functions/ecoflow/index.ts` | EcoFlow quota/status data fetched server-side through Supabase |
| EcoFlow local BLE | Device discovery, native connection, readable characteristic polling, and conservative text/structured payload decoding are present through `lib/livePowerBleProviders.ts` and `src/power/drivers/vendors/EcoFlowDriver.ts` | Live only when decoded SOC/watts/voltage/current/runtime/temperature fields are received |
| Hybrid cloud + BLE | Discovery records can preserve nearby BLE evidence while routing telemetry to cloud when a cloud source exists | Cloud-capable records prefer cloud; pure BLE can attempt native decoding |
| Mock/stub data | Not used for live EcoFlow telemetry | Mock data must remain dev-only and visibly non-live |

EcoFlow credentials stay server-side in the Supabase Edge Function. Mobile code must not contain EcoFlow access keys, secret keys, tokens, or authorization headers.

## Why A Local EcoFlow Connect May Still Show No Live Data

Glacier can advertise over BLE and ECS can attach to the native BLE transport. A local BLE session can still fail telemetry setup when the device does not expose readable decoded fields ECS can parse:

- no confirmed Glacier service/characteristic map is promoted to release behavior,
- no validated EcoFlow write/auth handshake is sent,
- no notification subscription is started for encrypted/proprietary telemetry,
- readable characteristics do not contain text/JSON/key-value EcoFlow metrics,
- the parser refuses to fabricate SOC, watts, voltage, current, runtime, or temperature from unknown binary payloads.

The local BLE path now routes through the native power adapter. If no decoded fields arrive, the shared BLE telemetry lifecycle reports telemetry setup failure rather than marking the device live:

```ts
{
  provider: 'ecoflow',
  source: 'ble_live',
  isLive: false,
  telemetryUnsupported: true,
  telemetryUnsupportedReason: 'Connected over Bluetooth; telemetry is not decoded for this model yet.',
  raw: {
    parserId: 'ecoflow_native_ble_v1',
    parserStatus: 'no_ecoflow_fields_in_readable_characteristics'
  }
}
```

This is not a silent connection timeout and it is not a VeePeak/OBD2 regression. It means native BLE transport succeeded, then ECS refused to promote the session because no trusted EcoFlow telemetry fields were decoded.

## Why One EcoFlow Device May Work While Another Does Not

EcoFlow devices may not share one readable local BLE telemetry shape. ECS can decode structured/text fields when they are exposed locally, and the cloud catalog can return inconsistent product metadata across model families:

- Glacier may arrive as `GLACIER`, `refrigerator`, or a user-renamed fridge.
- DELTA/RIVER devices may arrive as `Power Station`, `Portable Power Station`, `DELTA 2`, `RIVER 2 Pro`, a numeric/opaque product type, or an empty product type with model/name metadata.
- The `quota/all` telemetry response may be an object for one model family and an array of quota key/value entries for another.

ECS now normalizes EcoFlow product types through one shared classifier before deciding whether a cloud/API telemetry attempt is allowed. That classifier maps Glacier/fridge names to `refrigerator`, DELTA/RIVER/power-station names to `power_station`, WAVE-style names to `portable_ac`, and alternator/DC charger names to `charger`. Unknown product types remain visible but are not promoted as live telemetry unless the cloud path or local BLE parser produces decoded numeric data.

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

Local BLE EcoFlow rows now use the same native power provider path as other BLU power brands. The parser can promote readable structured/text telemetry into live BLU fields, including SOC, input/output watts, solar watts, runtime, temperature, voltage, current, capacity, cycles, and health. It deliberately does not infer values from unknown binary packets.

## Fast Replay Workflow

Use this loop to troubleshoot parser mapping without repeated native rebuilds:

1. Install one native/dev build that already includes `react-native-ble-plx`.
2. Start Metro with the normal dev-client workflow.
3. Enable explicit capture for a field session with `EXPO_PUBLIC_ECS_ECOFLOW_BLE_CAPTURE=1` before launching Metro, or set `globalThis.__ECS_ECOFLOW_BLE_CAPTURE_ENABLED = true` in a debug console.
4. Connect the EcoFlow BLE row. The app prints a line prefixed with `[ECOFLOW_BLE_REPLAY_CAPTURE]`.
5. Copy only the JSON after that prefix into `.smoke/ecoflow-ble-captures/<model>-<date>.json`.
6. Replay locally:

```bash
npm run replay:ecoflow-ble-capture -- .smoke/ecoflow-ble-captures
```

The replay capture intentionally omits raw manufacturer data, provider secrets, precise location, and raw device ids. It does include characteristic `valueBase64` payloads because those are the bytes the local parser needs. Keep those captures in `.smoke/` unless a sanitized fixture is intentionally promoted into `fixtures/ecoflow-ble/`.

The next field pass should add, with evidence:

- model-specific service UUIDs,
- writable control/auth characteristic,
- notification characteristic,
- handshake command encoding,
- binary telemetry packet decoder when a model requires encrypted/proprietary frames,
- keepalive and disconnect cleanup,
- tests proving no mock data is promoted as live.

## Regression Guard

VeePeak OBD2 remains the reference live local BLE path. EcoFlow changes must not modify OBD2 scan, ELM327 initialization, PID polling, store ingestion, or dashboard vehicle telemetry rendering.
