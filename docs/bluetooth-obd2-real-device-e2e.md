# Bluetooth, Power Device, EcoFlow, and OBD2 Real-Device E2E Plan

This plan validates the production unified scanner and telemetry pipeline with real hardware. It is not a mock/demo plan. Expo Go is expected to fail native BLE access cleanly.

## Scope

- Power-device discovery uses the unified scanner only.
- Bluestack provider readiness is governed by `docs/bluestack-provider-readiness.md`.
- The Device Connections UI shows one actionable list: **Found nearby power and OBD2 devices**.
- Saved, known, failed, and cloud-only records do not appear as connectable nearby devices.
- EcoFlow cloud authorization is separate from local BLE discovery/connection.
- OBD2 connected means native transport plus OBD initialization/handshake succeeded.
- Propane and water monitors can be linked as utility sensor profiles, but live level telemetry requires a verified parser.
- Streaming means live telemetry reaches the ECS telemetry/widget store.
- Disconnect stops provider streams, BLE monitors/subscriptions, polling loops, and clears or ages live widget telemetry.

## Required Hardware

- Android phone with ECS installed as a development build or native build.
- Optional iPhone development build for iOS permission/runtime parity.
- One BLE-capable supported or likely-supported power station.
- EcoFlow power station for cloud/BLE separation testing.
- BLE ELM327-compatible OBD2 adapter supported by ECS.
- Optional propane and water/fluid BLE monitors for utility profile linking.
- Vehicle with OBD2 port.
- Access to device settings for Bluetooth and permissions.

## Preflight

1. Confirm the app is not running in Expo Go for native BLE success scenarios.
2. Confirm build includes `react-native-ble-plx` native module.
3. Confirm Android permissions are declared and requestable:
   - `BLUETOOTH_SCAN`
   - `BLUETOOTH_CONNECT`
   - `ACCESS_FINE_LOCATION` when required by scanner/device discovery.
4. Confirm iOS Bluetooth usage description exists for iOS builds.
5. Start with Bluetooth on and app permissions reset if testing permission prompts.
6. Open Power > Device Connections and expand dev diagnostics when needed.

## Current Automation Evidence

Last focused static/contract pass: 2026-05-17 local.

Preflight evidence:

- `react-native-ble-plx` is present in `package.json`.
- Android declares `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, and `ACCESS_FINE_LOCATION` in `app.json` and the generated Android manifest.
- iOS Bluetooth usage strings are present in `app.json`.
- Device Connections copy now targets one actionable list: **Found nearby power and OBD2 devices**.

Automated contract status:

| Check | Status | Notes |
| --- | --- | --- |
| Unified scanner production contract | Pass | Production scanner uses the unified list, blocks mock production rows, and keeps saved/known/failed containers out of the connectable nearby UI. |
| Bluetooth scanner unsupported/runtime behavior | Pass | Unsupported runtime is classified without fake rows. |
| Bluetooth live truthfulness | Pass | Live/connected states remain truth-gated. |
| Scanner device state | Pass | Real advertisements dedupe and unsupported/noisy rows are filtered. |
| Unified scanner disconnect | Pass | Disconnect routes through provider/native cleanup and marks live telemetry unavailable. |
| Device connection diagnostics | Pass | Diagnostics expose scanner state, permission/native support, Bluetooth power, nearby count, connection, and latest errors. |
| EcoFlow cloud/BLE separation | Pass | Cloud auth failure is separated from nearby BLE discovery. |
| Power provider phases | Pass | Connected/streaming phases are separated from discovery and handshake. |
| OBD2 live pipeline | Pass | OBD2 connection is gated by native transport plus initialization/PID data. |
| Unified telemetry pipeline | Pass | Power and OBD2 telemetry flow through normalized ECS telemetry events and disconnect aging. |

Real-hardware evidence status:

| Area | Status | Required follow-up |
| --- | --- | --- |
| Android native BLE discovery | Not run in this pass | Run scenarios 2-5 on a development/native build with real nearby hardware. |
| Power station connect/stream/disconnect | Not run in this pass | Run scenarios 6, 8, and 9 with a supported or likely-supported BLE power station. |
| EcoFlow cloud unauthorized plus BLE nearby | Not run in this pass | Run scenario 7 with an advertising EcoFlow unit and unauthorized/unavailable cloud access. |
| OBD2 no-data and live-data paths | Not run in this pass | Run scenarios 10-12 with a BLE ELM327 adapter and a vehicle. |
| iOS Bluetooth permission/runtime parity | Not run in this pass | Optional iOS development build check remains open. |

Do not mark the real-device plan complete until the real-hardware rows above have dated device/build evidence, screenshots or diagnostics copy, and pass/fail notes.

## Scenario 1: Unsupported Native BLE Environment

1. Run ECS in Expo Go or web preview.
2. Open Power > Device Connections.
3. Press scan.
4. Expected:
   - Scanner state reports unsupported runtime.
   - No mock devices appear.
   - Main UI does not show saved/known/failed containers.
   - Diagnostics classify the failure as `unsupported_runtime`.

## Scenario 2: Development Build / Native Build

1. Install ECS as a development build/native build.
2. Open Power > Device Connections.
3. Press scan with Bluetooth on.
4. Expected:
   - Permission request/result is visible in diagnostics.
   - Scanner state progresses through readiness/scanning.
   - Nearby list only shows devices discovered from real advertisements.

## Scenario 3: Bluetooth Off

1. Turn Bluetooth off at the OS level.
2. Open Power > Device Connections.
3. Press scan.
4. Expected:
   - UI shows Bluetooth off/unavailable state.
   - Diagnostics classify source as native BLE or Bluetooth power state, not cloud auth.
   - No mock or saved devices appear.

## Scenario 4: Permissions Denied

1. Deny Bluetooth/location permissions when prompted.
2. Press scan.
3. Expected:
   - UI shows permission needed.
   - Diagnostics source is `permission`.
   - Scanner does not silently fail or populate fake rows.

## Scenario 5: Scan Nearby Power Station

1. Power on a BLE-capable power station and place it near the phone.
2. Press scan.
3. Expected:
   - Device appears under **Found nearby power and OBD2 devices** only if currently advertising.
   - Brand/provider appears only when advertisement evidence supports it.
   - RSSI/last-seen update as advertisements arrive.
   - Repeated advertisements dedupe into one row.

## Scenario 6: Connect Power Station

1. Select the scanned power station.
2. Press connect.
3. Expected:
   - State progresses through connecting/provider handshake.
   - Connected is shown only after native connection and provider discovery/handshake succeed.
   - Streaming is shown only after telemetry subscription/polling produces live data.
   - ECS widgets update from normalized telemetry store events.

## Scenario 7: EcoFlow Cloud Unauthorized, BLE Nearby

1. Use an EcoFlow device that advertises over BLE.
2. Configure cloud credentials/account so cloud access is unauthorized or unavailable.
3. Press scan.
4. Expected:
   - EcoFlow BLE advertisement still appears if nearby.
   - Cloud auth failure is classified as `ecoflow_cloud_auth` or `cloud_access`.
   - Cloud failure does not create a failed Bluetooth row.
   - BLE connection can proceed independently when local provider support is available.
   - No fake EcoFlow telemetry appears if neither BLE telemetry nor authorized cloud telemetry is available.

## Scenario 8: Disconnect Power Station

1. Connect or stream from a supported power station.
2. Press Disconnect.
3. Expected:
   - Button enters disconnecting state and awaits canonical disconnect.
   - Provider telemetry loop stops.
   - BLE monitors/listeners/subscriptions are removed.
   - Native disconnect/cancel is called.
   - UI transitions to disconnected/nearby if the device is still advertising, not connected.
   - Widgets stop receiving live values and age/clear according to telemetry-store policy.

## Scenario 9: Reconnect After Disconnect

1. After Scenario 8, keep the device powered and nearby.
2. Press scan if needed.
3. Connect again.
4. Expected:
   - Reconnect works without app restart.
   - No stale connected state is rehydrated.
   - Telemetry resumes only after provider setup succeeds again.

## Scenario 10: OBD2 Adapter Connected With Vehicle Off / No Data

1. Plug BLE OBD2 adapter into vehicle with ignition/engine off.
2. Scan/connect from the OBD2/vehicle telemetry path.
3. Expected:
   - Native connection may succeed, but ECS does not show fully connected/streaming unless OBD handshake/PID polling succeeds.
   - Diagnostics distinguish native BLE connection from OBD2 PID/no-data failure.
   - UI explains likely ignition/vehicle-off or no PID responses.
   - Widgets do not show fake live values.

## Scenario 11: OBD2 Adapter With Vehicle Running / Live Data

1. Start vehicle or turn ignition to the mode required for PID responses.
2. Connect the BLE OBD2 adapter.
3. Expected:
   - Native connection succeeds.
   - ELM327/OBD initialization succeeds.
   - PID polling receives RPM, speed, coolant temperature, voltage, throttle, or load where supported.
   - Parsed values normalize into ECS telemetry events with timestamps and source device id.
   - Dashboard/vehicle widgets update from the ECS telemetry store.

## Scenario 12: OBD2 Disconnect Clears Widget Telemetry

1. With OBD2 live values visible, press Disconnect.
2. Expected:
   - PID poller stops.
   - Pending commands/transactions are canceled.
   - BLE monitor subscription is removed.
   - Native disconnect/cancel is called.
   - ECS telemetry store marks values unavailable/stale according to policy.
   - Widgets no longer present old values as current live data.

## Diagnostics To Capture

- Scanner state.
- Native environment support.
- Permission state and missing permissions.
- Bluetooth powered state.
- Active scan count.
- Nearby device count.
- Active connection.
- Telemetry subscription count.
- Latest errors by source.
- Latest telemetry timestamp by device.

Use the dev-gated diagnostics panel copy action where available. On native builds without clipboard support, capture screenshots and Metro/device logs.

## Automated Regression Commands

Run these before and after real-device testing:

```powershell
npm run test:unified-scanner-production-contract
npm run test:bluetooth-scanner
npm run test:bluetooth-live
npm run test:scanner-device-state
npm run test:unified-scanner-disconnect
npm run test:device-connection-diagnostics
npm run test:ecoflow-cloud-ble-separation
npm run test:power-provider-phases
npm run test:obd2-live-pipeline
npm run test:unified-telemetry-pipeline
npx tsc --noEmit
npm run lint
npm run build
```

## Pass / Fail Rules

Fail the build if any of these occur:

- Mock devices appear in production.
- Saved/known/failed containers appear in the power scanner UI.
- Expo Go or web preview pretends real BLE is available.
- EcoFlow cloud unauthorized blocks a real nearby BLE row.
- Connected is shown before native connection plus provider/OBD handshake.
- Streaming is shown before live telemetry arrives.
- Disconnect only toggles UI state and leaves native/provider telemetry active.
- Widgets read mock/provider internals instead of normalized ECS telemetry.
