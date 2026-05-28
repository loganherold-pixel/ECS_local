# BLU Live Device Test Plan

This is the repeatable ECS BLU validation plan for live Bluetooth, cloud fallback, telemetry stores, and Power Center/Dashboard presentation. It does not require physical hardware for automated checks, but the manual checklist is the release gate for real device behavior.

VeePeak OBD2 is the known-good live reference path. Do not regress VeePeak discovery, connection, ELM327 initialization, PID polling, telemetry freshness, disconnect, or reconnect while fixing power-device paths.

## Automated Harness

The repo currently does not define `npm run typecheck` or a top-level `npm test` script. Use these actual ECS equivalents:

```powershell
npx tsc --noEmit --pretty false
npm run lint
npm run test:blu-live-device-test-plan
npm run test:obd2-live-pipeline
npm run test:vehicle-telemetry-live
npm run test:unified-telemetry-pipeline
npm run test:ecoflow-cloud-connection
npm run test:ecoflow-edge-function-cloud-api
npm run test:ecoflow-unified-scanner
npm run test:ecoflow-driver-diagnostics
npm run test:ecoflow-blu-telemetry-eligibility
npm run test:blu-power-vendor-verification
npm run test:power-brand-adapters
npm run test:blu-multi-device-manager
npm run test:blu-stream-lifecycle
npm run test:blu-disconnect-cleanup-reconnect
npm run test:blu-performance-battery-safe-scanning
npm run test:blu-power-center-status-ui
npm run test:blu-state-store-telemetry-guard
npm run test:unified-scanner-disconnect
npm run test:telemetry-discovery-stability
```

Expected result: no TypeScript errors, no lint errors, and all focused BLU tests pass. Existing unrelated lint warnings should be recorded in the run notes.

## Debug Capture

Use a native/dev build for BLE testing. Expo Go fallback should remain truthful but is not a valid native BLE proof.

Enable BLU diagnostics in development only. Logs must not include tokens, API keys, credentials, emails, or authorization headers.

Expected prefixes:

- `[BLU_SCAN]`
- `[BLU_CLASSIFY]`
- `[BLU_CONNECT]`
- `[BLU_HANDSHAKE]`
- `[BLU_STREAM]`
- `[BLU_TELEMETRY]`
- `[BLU_TIMEOUT]`
- `[BLU_RECONNECT]`
- `[BLU_DISCONNECT]`
- `[BLU_ECOFLOW]`
- `[BLU_BLUETTI]`
- `[BLU_ANKER]`
- `[BLU_GOALZERO]`
- `[BLU_OBD2]`

Record the device name, vendor, raw device id suffix only when sharing externally, app build, phone OS, runtime, and whether the device was connected locally, by cloud, or by hybrid fallback.

## VeePeak OBD2 Checklist

VeePeak is the reference live telemetry path.

| Phase | Expected Result |
|---|---|
| Discovered | VeePeak appears in BLU scan results during the 10 second scan window. |
| Classified | Device is classified as `obd2` or `obd2_adapter` with high confidence. |
| Connected | Connect action enters connecting, then connected without blocking power devices. |
| ELM initialized | `[BLU_HANDSHAKE]` shows ELM327 transport selected and initialized. |
| Live telemetry streaming | `[BLU_TELEMETRY]` shows OBD2 telemetry keys such as voltage, RPM, speed, or supported PIDs. |
| Store/UI | Dashboard and vehicle/power BLU UI show OBD2 as live only when fresh packets arrive. |
| Stale detection | Stop vehicle data or unplug adapter; stream becomes stale/failed after the configured freshness window. |
| Disconnect | Disconnect selected VeePeak; PID polling stops, subscriptions clear, and telemetry no longer updates. |
| Reconnect | Retry/connect VeePeak; ELM initializes again and live telemetry resumes without duplicate streams. |

Pass criteria: VeePeak scan, connect, live stream, disconnect, and reconnect all work with no duplicate telemetry logs after repeated cycles.

## EcoFlow Glacier Checklist

| Phase | Expected Result |
|---|---|
| Discovered | Glacier appears from local BLE, EcoFlow cloud, or both. |
| Classified | Device is classified as EcoFlow Glacier/refrigerator, not generic unknown if product data exists. |
| Connected | Local BLE connect reaches connected or a specific failure state. |
| Handshake phase | State/logs show `handshaking` if a BLE/cloud handshake is attempted. |
| First telemetry phase | State/logs show `awaitingTelemetry` or `awaitingFirstPacket` before first decoded packet. |
| Timeout phase | If still failing, timeout identifies scan, connect, handshake, first telemetry, stream stale, or cloud poll phase. |
| Cloud fallback | If cloud supported and authorized, cloud polling state is separate from BLE state. |
| Disconnect | Disconnect Glacier only; VeePeak or other devices remain connected. |
| Reconnect | Retry Glacier; previous manual disconnect guard clears and retry affects only Glacier. |

Pass criteria: Glacier must not silently time out. If it does not stream, ECS reports the exact failed phase and does not label it Live.

## EcoFlow Power Station Checklist

| Phase | Expected Result |
|---|---|
| Discovered or not discovered | Record whether the device appears in local BLE scan. |
| Cloud listed or not listed | Record whether EcoFlow cloud lists the device. Missing cloud credentials must show auth required. |
| Local BLE supported or unsupported | If local BLE is unsupported, UI says unsupported/parser pending instead of random failure. |
| Telemetry available or unavailable | Cloud/local telemetry must normalize into the BLU telemetry contract when available. |
| Unauthorized handling | Unauthorized or wrong account/region errors show auth required or device unauthorized. |
| Stale handling | Offline or old cloud data appears stale/cloud stale, not live. |
| Disconnect/reconnect | Cloud polling stops on disconnect and restarts only on explicit retry/connect. |

Pass criteria: EcoFlow cloud and BLE failures are specific, readable, and do not affect VeePeak.

## Bluetti Checklist

| Phase | Expected Result |
|---|---|
| Discovery | Nearby Bluetti devices appear if supported by scanner/provider. |
| Connection | Connect either starts real BLE/cloud path or reports unsupported/parser pending. |
| Stream or mock-only state | Real telemetry uses live/recent/stale; mock-only must show `mock` and source `mock`. |
| UI display | Power Center shows vendor, type, connection source, status pill, last telemetry, and available fields. |

Pass criteria: Bluetti status is one of complete, partially wired, mock-only, cloud-only, local BLE incomplete, or disconnected from UI.

## Goal Zero Checklist

| Phase | Expected Result |
|---|---|
| Discovery | Nearby Goal Zero/Yeti devices appear if supported by scanner/provider. |
| Connection | Connect attempts do not collide with OBD2 or EcoFlow state. |
| Stream or mock-only state | Real telemetry is labeled live only when fresh; mock-only is explicit. |
| UI display | Power Center does not confuse stale, mock, unavailable, and live. |

Pass criteria: Goal Zero has a clear status and no fake live telemetry.

## Anker / Anker Solix Checklist

| Phase | Expected Result |
|---|---|
| Discovery | Nearby Anker/Solix devices appear if supported by scanner/provider. |
| Connection | Connect starts the registered adapter or reports parser pending/unsupported. |
| Stream or mock-only state | Real telemetry, stale telemetry, mock data, and unavailable data are distinct. |
| UI display | Power Center shows honest source and status. |

Pass criteria: Anker/Solix has a clear status and no fake live telemetry.

## Multi-Device Checklist

| Scenario | Expected Result |
|---|---|
| VeePeak + EcoFlow | Connecting or disconnecting EcoFlow does not stop VeePeak telemetry. |
| VeePeak + power station | Power-device polling/streaming does not overwrite OBD2 telemetry. |
| Multiple power devices | Per-device telemetry remains keyed by stable device id. |
| Disconnect one device | Only the selected device transitions to disconnecting/disconnected. |
| Reconnect one device | Retry clears only that device's manual disconnect guard. |
| App background/foreground | Streams pause/recover according to platform limits without duplicate intervals. |

Pass criteria: state is per device, stale status is per device, and no duplicate scan, stream, cloud poll, or reconnect loops appear after repeated cycles.

## Run Notes Template

Use this template for each hardware run:

```text
Date:
Tester:
App build:
Phone / OS:
Runtime: native dev build / production build / Expo Go fallback
Device under test:
Device firmware:
Cloud account/region status:
Scenario:
Observed scan/classification:
Observed connect/handshake:
Observed telemetry keys:
Observed UI status:
Observed disconnect/reconnect:
Log prefixes captured:
Pass/fail:
Follow-up issue:
```

## Release Gate

Do not mark a BLU change ready if:

- VeePeak no longer scans, connects, initializes ELM327, or streams live OBD2 telemetry.
- A device is labeled Live without fresh telemetry.
- EcoFlow failures collapse to a generic timeout.
- A manual disconnect immediately reconnects the same device.
- Disconnecting one device clears or stales unrelated device telemetry.
- Logs expose secrets or spam unthrottled packets.
- TypeScript fails.
