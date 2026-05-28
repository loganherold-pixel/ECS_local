# BLU Stack Baseline Audit

Date: 2026-05-23

Scope: current ECS Bluestack/BLU pipeline from scan through candidate classification, connection, handshake, live telemetry, normalized stores, dashboard consumers, disconnect, retry, saved-device behavior, EcoFlow cloud fallback, and Expo/native runtime fallback.

This audit is documentation-only. No runtime behavior was changed. The VeePeak OBD2 path is the known-good reference path and must not be regressed.

## Executive Summary

ECS currently has two related but separate live-data lanes:

1. Vehicle telemetry lane: VeePeak/ELM327-compatible OBD2 adapters are scanned through the native BLE scanner, classified as OBD2, connected by `src/vehicle-telemetry/OBD2Adapter.ts`, initialized as an ELM327 transport, polled by `src/vehicle-telemetry/OBD2PIDPoller.ts`, normalized by `src/vehicle-telemetry/VehicleTelemetryService.ts` and `src/vehicle-telemetry/VehicleTelemetryStore.ts`, then rendered by vehicle/dashboard consumers.
2. Power telemetry lane: power vendors are discovered by the unified Bluestack scanner, but release live telemetry is gated by parser readiness. EcoFlow is the release cloud/API path through Supabase Edge Function `supabase/functions/ecoflow/index.ts`; EcoFlow local BLE attachment exists but local telemetry parsing is explicitly not promoted. Bluetti, Goal Zero, and Anker/SOLIX are recognized as native BLE candidates, but their live telemetry parsers are blocked by the Bluestack parser registry pending field evidence.

The main user-facing scanner is `app/power/blu.tsx` backed by `lib/useUnifiedDeviceConnections.ts`. It merges native BLE/OBD scan callbacks, EcoFlow cloud discovery, saved/registered devices, and generic accessory links into one Bluestack device model.

## BLU Architecture Map

```text
User opens Bluestack scanner
  app/power/blu.tsx
    -> lib/useUnifiedDeviceConnections.ts
      -> native BLE/OBD scan: src/vehicle-telemetry/useOBD2Scanner.ts
        -> src/vehicle-telemetry/OBD2Adapter.ts
          -> src/power/ble/BleScanReadiness.ts
          -> src/power/ble/BlePermissions.ts
          -> react-native-ble-plx BleManager.startDeviceScan()
      -> EcoFlow cloud scan: lib/ecoflowUnifiedScannerDiscovery.ts
        -> src/power/cloud/providers/EcoFlowCloudProvider.ts
          -> supabase.functions.invoke("ecoflow")
            -> supabase/functions/ecoflow/index.ts
      -> classic Bluetooth source: lib/unifiedDeviceDiscoveryAggregator.ts
        -> unsupported source result
      -> device routing/classification
        -> lib/bluetoothBrandRegistry.ts
        -> lib/bluetoothDevicePresentation.ts
        -> lib/bluetoothDeviceRouting.ts
        -> lib/bluestack/*
        -> lib/scannerDeviceListState.ts
      -> connect request
        -> telemetry/OBD2: OBD2Adapter.connectToDevice()
        -> EcoFlow cloud: lib/ecoflowCloudConnection.ts
        -> EcoFlow local BLE: lib/genericBluetoothAccessoryManager.ts, parser unavailable
        -> other power vendors: lib/powerBrandConnectionAdapters.ts, parser-gated
        -> utility/generic accessories: lib/genericBluetoothAccessoryManager.ts
      -> telemetry stores
        -> OBD2: VehicleTelemetryService -> VehicleTelemetryStore -> ECSTelemetryStore
        -> power: PowerTelemetryManager/BluStateStore/BluPowerAuthority -> ECSTelemetryStore
      -> UI consumers
        -> components/dashboard/VehicleTelemetryWidget.tsx
        -> components/dashboard/PowerSystemWidget.tsx
        -> components/dashboard/PowerSystemDetail.tsx
        -> app/(tabs)/dashboard.tsx
        -> app/(tabs)/navigate.tsx
        -> app/power/index.tsx
```

## Known-Good Reference: VeePeak OBD2

VeePeak is verified to appear in BLU discovery, connect successfully, provide live OBD2 vehicle telemetry, and stream data into ECS. The working flow is:

1. `app/power/blu.tsx` calls `connections.rescan()` from `useUnifiedDeviceConnections`.
2. `useUnifiedDeviceConnections.rescan()` starts native scanning by calling `startScan(UNIFIED_BLUETOOTH_SCAN_DURATION_MS)` from `useOBD2Scanner`.
3. `useOBD2Scanner` proxies the singleton `obd2Adapter`.
4. `OBD2Adapter.startScan()` gates runtime and permissions through `ensureBleScanReadiness()` and uses `BleManager.startDeviceScan()`.
5. `OBD2Adapter` classifies VeePeak by OBD name patterns and BLE UART/service evidence. Current VeePeak-friendly patterns include `vee peak`, `veepeak`, `v peak`, `v-link`, `obd check`, `vp11`, `obd`, `elm327`, and related OBD adapter names.
6. `lib/bluetoothBrandRegistry.ts` also has a `veepeak_obd2` entry, and `lib/bluetoothDeviceRouting.ts` maps that result to owner `telemetry`, provider `obd2`, route `telemetry/live`.
7. `useUnifiedDeviceConnections.connectDevice()` routes OBD2 devices to `connectToDevice(device.rawId, device.name)` and retries transient errors up to 3 attempts.
8. `OBD2Adapter.connectToDevice()` stops scanning, connects with `requestMTU: 512` and `timeout: 15000`, discovers services/characteristics, registers the device with `vehicleTelemetryService.registerDevice("obd2", ...)`, sets it as primary, and calls `startPidTelemetry()`.
9. `OBD2Adapter.ensureElmTransport()` finds writable/readable ELM327 BLE UART characteristics, subscribes via `monitorCharacteristicForService()`, and sends ELM commands through the selected characteristic.
10. `OBD2PIDPoller.start()` sends ELM init commands, reads `ATRV`, discovers supported Mode 01 PIDs, requires at least one live response path, then polls at the adapter-provided interval.
11. `OBD2PIDPoller` emits normalized telemetry with source `bluetooth_obd_live`.
12. `VehicleTelemetryService` emits normalized telemetry events; `VehicleTelemetryStore` ingests them, persists last known telemetry, updates the primary registry, and pushes normalized OBD2 events into `ECSTelemetryStore`.
13. `components/dashboard/VehicleTelemetryWidget.tsx`, `app/vehicle-telemetry-settings.tsx`, `components/navigate/TelemetryHUD.tsx`, `components/mission/VehicleTelemetry.tsx`, and dashboard renderers consume the normalized store/hook outputs.

Do not change or replace this path while fixing power-device/EcoFlow issues.

## Discovery Responsibilities

| Responsibility | Primary files/functions | Notes |
| --- | --- | --- |
| Scanner screen | `app/power/blu.tsx` | User-facing Bluestack scanner; renders `connections.devices` and calls `rescan`, `connectDevice`, `disconnectDevice`, `connectSelected`. |
| Unified orchestration | `lib/useUnifiedDeviceConnections.ts` | Owns source summaries, scan state, merged device models, connect/disconnect routing, saved power auto-reconnect, and diagnostic events. |
| Native BLE readiness | `src/power/ble/BleScanReadiness.ts` | Blocks web and Expo Go, waits for powered-on BLE state, returns runtime diagnostics. |
| BLE permissions | `src/power/ble/BlePermissions.ts` | Android 12+ requests `BLUETOOTH_SCAN`, `BLUETOOTH_CONNECT`, and `ACCESS_FINE_LOCATION`; older Android requests location; iOS returns ready for system prompt behavior. |
| Native BLE scan callbacks | `src/vehicle-telemetry/OBD2Adapter.ts` | Uses `react-native-ble-plx`; also exposes raw and accepted scan diagnostics to the unified scanner. |
| OBD scanner hook | `src/vehicle-telemetry/useOBD2Scanner.ts` | React wrapper around the OBD2 adapter. |
| Legacy OBD compatibility hook | `lib/useUnifiedOBD2Scanner.ts` | Adapts unified scanner devices back into OBD scanner shape for existing OBD UI consumers. |
| Brand classification | `lib/bluetoothBrandRegistry.ts`, `lib/bluetoothDevicePresentation.ts` | Matches OBD, EcoFlow, Bluetti, Anker, Goal Zero, utility sensors, etc. by name, service UUIDs, and manufacturer hints. |
| Route classification | `lib/bluetoothDeviceRouting.ts` | Maps matched devices to owner domains: `power`, `telemetry`, `sensor`, or `generic`. |
| Scanner list filtering | `lib/scannerDeviceListState.ts` | Stable keys, dedupe, min RSSI, stale pruning, dismiss cooldown, and brand allowlist; includes VeePeak/OBD names in the allowlist. |
| Cross-source merge | `lib/unifiedDeviceDiscoveryAggregator.ts` | Normalizes API/BLE/classic/cached discoveries and merges source IDs; classic Bluetooth currently returns `unsupported`. |
| EcoFlow cloud discovery | `lib/ecoflowUnifiedScannerDiscovery.ts` | Lists EcoFlow devices from cloud, normalizes Glacier and other EcoFlow products into scanner models. |
| EcoFlow edge function | `supabase/functions/ecoflow/index.ts` | Server-only EcoFlow API signing and device/telemetry requests. |

## Connection Responsibilities

| Device class | Connection files/functions | Current behavior |
| --- | --- | --- |
| VeePeak/OBD2 | `useUnifiedDeviceConnections.connectDevice()`, `OBD2Adapter.connectToDevice()` | Native BLE connect, service/characteristic discovery, ELM327 handshake, PID poller start, then telemetry is live. |
| EcoFlow cloud/API | `activateEcoFlowCloudDevice()`, `connectEcoFlowCloudDevice()`, `startEcoFlowCloudTelemetryPolling()` | Skips native BLE, persists selected EcoFlow device, registers BLU device as EcoFlow cloud-owned, polls cloud every 5s by default. |
| EcoFlow local BLE | `genericBluetoothAccessoryManager.connect()` from `useUnifiedDeviceConnections` | Can attach locally, but the code records provider parser unavailable and tells the user to use cloud/API for live telemetry while local decoding is pending. |
| Bluetti, Goal Zero, Anker/SOLIX | `getPowerBrandConnectionAdapterForDevice()`, `RegisteredProviderPowerAdapter.connect()` | Discovery can classify these brands, but live connection is blocked because parser decision has `canDecodeLiveTelemetry: false`. If forced, adapters return `PARSER_PENDING`. |
| Utility sensors | `genericBluetoothAccessoryManager` and `lib/bluestack/*` utility profile logic | Live-ready profile path; ECS links native BLE sensors and promotes only decoded tank-level percentages. |
| Generic accessories | `genericBluetoothAccessoryManager` | Managed as generic Bluetooth sessions, not live telemetry providers. |

## Telemetry Streaming And Normalization

### OBD2/VeePeak

| Step | Files/functions | Store/event output |
| --- | --- | --- |
| ELM transport | `OBD2Adapter.ensureElmTransport()`, `sendElmCommand()` | Writes commands, buffers responses until the `>` prompt, times out pending commands after 5s. |
| PID polling | `OBD2PIDPoller.start()`, `pollCycle()` | Polls RPM, speed, coolant, engine load, fuel level, intake temp, runtime, throttle, fuel rate, MAF, plus `ATRV` battery voltage. |
| Normalization | `VehicleTelemetryService.normalizeTelemetry()` | Normalized `NormalizedVehicleTelemetry` with provider `obd2`. |
| Store update | `VehicleTelemetryStore.ingest()` | Source is inferred as `bluetooth_obd_live`; snapshot source type becomes `obd_live`; pushes `vehicleTelemetryToEcsTelemetryEvents()` to `ECSTelemetryStore`. |
| UI hook | `src/vehicle-telemetry/useVehicleTelemetry.ts` | Exposes snapshot, summary, freshness, connection state, raw telemetry, and `disconnectProvider()`. |

### Power

| Step | Files/functions | Store/event output |
| --- | --- | --- |
| EcoFlow cloud poll | `EcoFlowCloudProvider.pollOnce()`, `ecoflowCloudConnection.normalizeEcoFlowCloudTelemetry()` | Canonical `PowerTelemetry` with source `cloud`, source label `EcoFlow Cloud`, and live only when decoded numeric fields exist. |
| Canonical manager | `src/power/telemetry/PowerTelemetryManager.ts` | Deep-merges power telemetry, normalizes truth, ingests `canonicalPowerTelemetryToEcsTelemetryEvents()` into `ECSTelemetryStore`. |
| Legacy BLU store | `lib/BluStateStore.ts` | Keeps BLU summary and per-provider telemetry, guarded against unsupported/mock paths. |
| Authority facade | `lib/BluPowerAuthority.ts` | Used by dashboard/header/AI contexts for power authority snapshots. |
| Provider registry | `lib/EcsProviderRegistry.ts` | Registers only parser-approved providers, normalizes source labels, blocks mock/dev telemetry unless explicitly enabled. |
| Widget selector | `components/dashboard/PowerSystemWidget.tsx` | Reads normalized power-device readings from `useECSPowerTelemetryReadings()`. |

## Store Keys And Persistence

| Area | Keys/files | Purpose |
| --- | --- | --- |
| OBD2 last device | `ecs_obd2_last_device_id`, `ecs_obd2_last_device_name`, `ecs_obd2_auto_reconnect` in `OBD2Adapter.ts` | Remember last OBD2 adapter and whether OBD auto-reconnect is enabled. |
| Vehicle telemetry registry | `ecs_vt_devices`, `ecs_vt_primary_device`, `ecs_vt_last_telemetry`, `ecs_vt_session` in `VehicleTelemetryTypes.ts` | Registered telemetry devices, primary device, and last known telemetry. |
| BLU device registry | `ecs.blu.devices.v1` in `BluDeviceRegistry.ts` | Registered BLU power devices and primary power device selection. |
| BLU session | `ecs.blu.session.v1` in `BluSessionStore.ts` | Last provider/session/polling state and primary device id. |
| EcoFlow selected device | `ecs_ecoflow_selected_device`, `ecs_ecoflow_selected_device_name` in `ecoFlowSelectionStore.ts` | Legacy/current EcoFlow primary selection. |
| Cloud power selected devices | `ecs.power.selectedDevices.v1` in `PowerDeviceStore.ts` | Multi-device cloud power selections by provider. |
| Normalized telemetry | `ECSTelemetryStore` in-memory metrics | Live/stale/unavailable normalized power, utility sensor, and OBD metrics. |

## UI Consumers

| Surface | Files | Data source |
| --- | --- | --- |
| Bluestack scanner | `app/power/blu.tsx` | `useUnifiedDeviceConnections()` and normalized `scannerSnapshot`. |
| OBD settings | `app/vehicle-telemetry-settings.tsx` | `useVehicleTelemetry()`, `vehicleTelemetryDeviceRegistry`; scanner actions route through Bluestack. |
| OBD setup | `app/obd-setup.tsx` | Points users to the production scanner. |
| Vehicle widget | `components/dashboard/VehicleTelemetryWidget.tsx` | `useVehicleTelemetry()` and `useUnifiedOBD2Scanner()`. |
| Dashboard renderers | `components/dashboard/WidgetRenderers.tsx` | `VehicleTelemetryCompact`, `VehicleTelemetryDetailView`, `PowerSystemCompact`, `PowerSystemCard`, `PowerSystemDetailView`. |
| Power widget | `components/dashboard/PowerSystemWidget.tsx` | `useECSPowerTelemetryReadings()` via `useUnifiedPowerDevices()`. |
| Power detail | `components/dashboard/PowerSystemDetail.tsx` | `useUnifiedPowerDevices()` and `usePowerTelemetryControls()`. |
| Power Center | `app/power/index.tsx` | `usePowerTelemetry()` plus EcoFlow catalog/telemetry helpers. |
| Vehicle twin | `app/vehicle-twin.tsx`, `components/vehicle-twin/EcoFlowPickerModal.tsx` | Legacy EcoFlow live selection via `useEcoFlowLive()`. |
| Dashboard tab | `app/(tabs)/dashboard.tsx` | `bluPowerAuthority` and `useVehicleTelemetry()` are consumed for dashboard state. |
| Navigate tab | `app/(tabs)/navigate.tsx`, `components/navigate/TelemetryHUD.tsx` | BLU power authority and vehicle telemetry HUD data. |
| Mission components | `components/mission/VehicleTelemetry.tsx` | Vehicle telemetry presentation. |

## Timeout, Retry, And Reconnect Behavior

| Area | Current behavior |
| --- | --- |
| Unified manual scan | `UNIFIED_BLUETOOTH_SCAN_DURATION_MS = 60000`; scan request debounce is 1500ms. |
| Native BLE readiness | `waitForBlePoweredOn()` defaults to 3500ms unless overridden. |
| OBD2 scan | Adapter scan stops on explicit stop or timeout; raw/accepted scan diagnostics are recorded. |
| OBD2 connect | `connectToDevice()` uses BLE timeout 15000ms and MTU 512. Unified connect retries transient OBD errors up to 3 times with 450ms to 2500ms capped exponential delay. |
| OBD2 command response | `sendElmCommand()` times out an ELM command after 5000ms waiting for a prompt/response. |
| OBD2 reconnect | `MAX_RECONNECT_ATTEMPTS = 8`; reconnect connect timeout is 10000ms; backoff is created with 1000ms initial and 30000ms max. |
| OBD2 telemetry heartbeat | `VehicleTelemetryService` treats telemetry silence over 30000ms as stale enough to start reconnect scheduling. |
| Vehicle telemetry store freshness | Fresh is under 30000ms; grace is up to 90000ms; stale after that. |
| EcoFlow cloud live refresh | `ECOFLOW_CLOUD_LIVE_POLL_INTERVAL_MS = 5000`; caller minimum interval is 3000ms; polling is singleton per active cloud session. |
| Generic/native BLU adapter | `createNativeBleBluAdapter()` scans 9000ms, connects with BLE timeout 15000ms/MTU 256, polls every 15000ms, background poll every 60000ms, reconnects up to 3 attempts with 10000ms delay. |
| Saved power auto-reconnect | `useUnifiedDeviceConnections` reconnects remembered power devices that are discoverable, not user-disconnected, and past a 60000ms cooldown. |
| Non-EcoFlow power brand connect | Unified connect retries transient failures up to 3 attempts. Parser-pending failures are not transient successes and should remain blocked. |

## Disconnect Cleanup

| Device class | Cleanup path |
| --- | --- |
| OBD2 | `useVehicleTelemetry.disconnectProvider()` calls `vehicleTelemetryService.stop()`, `obd2Adapter.disconnect()`, removes inactive devices, and clears store if no devices remain. `OBD2Adapter.disconnect()` stops PID telemetry/health checks, removes BLE monitor, cancels pending command, disables auto reconnect, and clears live telemetry. |
| EcoFlow cloud | `useUnifiedDeviceConnections.disconnectDevice()` removes the device from `PowerDeviceStore`; if no EcoFlow selections remain it stops cloud telemetry polling, disconnects provider, clears selected EcoFlow device, updates BLU registry, and clears power telemetry. |
| EcoFlow cloud with remaining selected devices | Promotes another selected EcoFlow device, restarts cloud telemetry polling for it, and clears only the disconnected device from canonical telemetry. |
| EcoFlow local BLE | Disconnects the generic Bluetooth accessory link. |
| Other power vendors | Uses the selected `PowerBrandConnectionAdapter.disconnect()`, then updates `BluDeviceRegistry`, managed power setup state, and `PowerTelemetryManager.clearDisconnectedDevice()`. |
| Generic/sensor accessories | `genericBluetoothAccessoryManager.disconnect()` and scanner UI state cleanup. |

## EcoFlow Flow And Failure Points

### Current EcoFlow Flow

1. `useUnifiedDeviceConnections.rescan()` runs `discoverEcoFlowDevicesForUnifiedScanner()` in parallel with native BLE.
2. `EcoFlowCloudProvider.listDevices()` invokes the Supabase `ecoflow` function with `{ action: "devices" }`.
3. `supabase/functions/ecoflow/index.ts` reads `ECOFLOW_ACCESS_KEY` and `ECOFLOW_SECRET_KEY` server-side, signs EcoFlow API calls, and requests `/iot-open/sign/device/list`.
4. `ecoflowUnifiedScannerDiscovery.normalizeEcoFlowScannerDevice()` normalizes cloud devices. Glacier is detected from model/name/product type or `BX` id patterns and is treated as API-backed refrigerator/cloud telemetry candidate.
5. Connecting an EcoFlow cloud row calls `activateEcoFlowCloudDevice()`, persists selection, registers a BLU EcoFlow device, then calls `connectEcoFlowCloudDevice()`.
6. `connectEcoFlowCloudDevice()` calls `provider.connect(deviceId, "CLOUD")`, then `provider.pollOnce()`.
7. Telemetry polling invokes the Supabase `ecoflow` function with `{ action: "telemetry", deviceId }`, which calls `/iot-open/sign/device/quota/all`.
8. `EcoFlowCloudProvider.mapEdgeTelemetry()` and `normalizeEcoFlowCloudTelemetry()` decode values into canonical `PowerTelemetry`.
9. If decoded numeric fields exist, telemetry becomes live and flows into `PowerTelemetryManager`, `BluStateStore.ingestEcoFlowData()`, and dashboard power widgets.

### Failure Points Observed In Code

| Failure point | Likely symptom | Files |
| --- | --- | --- |
| Missing Supabase Edge Function env vars | EcoFlow cloud discovery/poll fails with missing credentials | `supabase/functions/ecoflow/index.ts` |
| EcoFlow account/device unauthorized | Device list or quota request fails; scanner classifies as `cloud_auth`; BLE discovery continues | `ecoflowUnifiedScannerDiscovery.ts`, `EcoFlowCloudProvider.ts`, `ecoflowUnauthorizedDevice.ts` |
| Device catalog returns unsupported/unknown product type | Device may be listed but not telemetry-capable unless unknown cloud telemetry check succeeds | `ecoflowBluTelemetryEligibility.ts`, `EcoFlowCloudProvider.ts` |
| Cloud connect succeeds but `pollOnce()` has no decoded fields | UI can show cloud/API linked or available, but not live telemetry | `ecoflowCloudConnection.ts` |
| Glacier quota payload uses fields not currently mapped | Glacier can connect/cloud-link but show no live data or timeout-like retry state | `EcoFlowCloudProvider.mapEdgeTelemetry()`, `normalizeEcoFlowCloudTelemetry()` |
| EcoFlow local BLE attach succeeds | Local BLE is attached but provider parser is explicitly unavailable; live telemetry should not appear | `useUnifiedDeviceConnections.ts` |
| Cloud polling hard errors | Poll loop reports available/retry for non-auth errors; auth errors stop the session | `startEcoFlowCloudTelemetryPolling()` |

EcoFlow Glacier specifically is discoverable and can connect, but timeouts/no live data are most likely in the cloud telemetry quota/decode segment, not in the scanner list itself. The local BLE path is not a release live parser path today.

## Vendor Implementation Status

| Vendor/device class | Classification status | Connect status | Live telemetry status | Category |
| --- | --- | --- | --- | --- |
| VeePeak / V Peak BLE OBD2 | Recognized by OBD name patterns, OBD service UUIDs, and Bluestack brand registry | Verified native BLE connect | Verified live OBD2 PID stream into ECS | complete |
| Generic ELM327-compatible BLE OBD2 | Recognized by OBD/ELM/service evidence and fallback candidates | Supported if native BLE and ELM transport work | Live only after ELM init and PID data | complete for supported BLE ELM327 devices |
| Classic Bluetooth/SPP OBD2 | Source explicitly unsupported in current runtime | Not discoverable by current scanner | No telemetry | disconnected from UI / unsupported source |
| EcoFlow cloud/API | Cloud catalog discovery implemented, server-side credentials required | Cloud connect implemented | Live only when authorized quota payload decodes numeric fields | cloud-only / partially wired |
| EcoFlow local BLE | Brand discovery and generic link path implemented | Can attach as generic Bluetooth accessory | Local BLE parser unavailable by design | local BLE incomplete |
| EcoFlow Glacier | Cloud discovery normalized as refrigerator/API candidate | Cloud connect path implemented | Live depends on quota authorization and mapped refrigerator fields; timeout/no-data likely here | cloud-only / partially wired |
| Bluetti | Brand/name/service discovery exists; provider metadata says implemented | Parser registry blocks live connection; adapter returns parser pending when forced | Not promoted to widgets | local BLE incomplete |
| Goal Zero | Brand/name/service discovery exists | Parser registry blocks live connection; adapter returns parser pending when forced | Not promoted to widgets | local BLE incomplete |
| Anker/SOLIX | Brand/name/service discovery exists | Parser registry blocks live connection; adapter returns parser pending when forced | Not promoted to widgets | local BLE incomplete |
| Jackery/Renogy/Redarc/Dakota/Victron | Recognized or planned to varying levels | Parser/field verification pending | Not promoted to live widgets | local BLE incomplete / profile-only |
| Propane/water monitors | Utility profiles recognized | Linkable as utility sensors with decoded tank percentage promotion | Awaiting decoded level until payload is read | live-ready bridge |

## Risks And Likely Root Causes

- VeePeak regression risk: touching `OBD2Adapter`, `OBD2PIDPoller`, `useOBD2Scanner`, `useUnifiedDeviceConnections` telemetry routing, or `VehicleTelemetryStore` can break the known-good path. Keep OBD2 changes isolated and test the live-pipeline scripts plus real device.
- EcoFlow timeout risk: the scanner and cloud connect can succeed while telemetry remains inactive because quota/all returns unauthorized, offline, unexpected model fields, or fields not decoded into `PowerTelemetry`.
- EcoFlow local BLE confusion: EcoFlow BLE advertisements may appear connectable, but local BLE telemetry is intentionally not validated. The UI correctly tells users to use cloud/API for live telemetry while local parser work is pending.
- Parser-pending vendor risk: legacy adapter files contain simulation/dev fallback code, but the release gate is `lib/bluestack/bluestackTelemetryParserRegistry.ts`. Do not bypass that gate for Bluetti, Goal Zero, Anker, or other vendors without field evidence.
- Expo Go/web risk: native BLE is expected to be unavailable in Expo Go and web preview. This is not a scanner bug if it fails cleanly and keeps cloud/API rows available.
- Store truth risk: stale/cached/manual/mock paths must remain explicit. `ECSTelemetryStore`, `VehicleTelemetryStore`, `bluetoothLiveTelemetry.ts`, and `PowerTelemetryManager` are the truth gates.
- Secret risk: provider secrets belong only in Supabase Edge Function environment variables. Current EcoFlow client path invokes ECS-owned endpoints and does not require mobile secrets.

## Files In The End-To-End Pipeline

### Scanner and Runtime

- `app/power/blu.tsx`
- `lib/useUnifiedDeviceConnections.ts`
- `lib/unifiedScanner.ts`
- `lib/unifiedScannerContract.ts`
- `lib/unifiedDeviceDiscoveryAggregator.ts`
- `lib/scannerDeviceListState.ts`
- `lib/bluetoothBrandRegistry.ts`
- `lib/bluetoothDevicePresentation.ts`
- `lib/bluetoothDeviceRouting.ts`
- `lib/bluetoothDiagnostics.ts`
- `src/power/ble/BlePermissions.ts`
- `src/power/ble/BleScanReadiness.ts`
- `app.json`
- `android/app/src/main/AndroidManifest.xml`

### OBD2 Vehicle Telemetry

- `src/vehicle-telemetry/OBD2Adapter.ts`
- `src/vehicle-telemetry/OBD2PIDPoller.ts`
- `src/vehicle-telemetry/useOBD2Scanner.ts`
- `lib/useUnifiedOBD2Scanner.ts`
- `src/vehicle-telemetry/VehicleTelemetryService.ts`
- `src/vehicle-telemetry/VehicleTelemetryStore.ts`
- `src/vehicle-telemetry/VehicleTelemetryDeviceRegistry.ts`
- `src/vehicle-telemetry/VehicleTelemetryTypes.ts`
- `src/vehicle-telemetry/useVehicleTelemetry.ts`
- `src/telemetry/telemetryAdapters.ts`
- `src/telemetry/ECSTelemetryStore.ts`

### Power And BLU Providers

- `lib/BluTypes.ts`
- `lib/BluDeviceRegistry.ts`
- `lib/BluSessionStore.ts`
- `lib/BluStateStore.ts`
- `lib/BluPowerAuthority.ts`
- `lib/BluProviderRegistry.ts`
- `lib/createNativeBleBluAdapter.ts`
- `lib/powerBrandConnectionAdapters.ts`
- `lib/EcsProviderRegistry.ts`
- `lib/IEcsPowerProvider.ts`
- `lib/ecsLiveSystemBootstrap.ts`
- `lib/bluestack/bluestackTelemetryParserRegistry.ts`
- `lib/bluestack/bluestackProviderReadiness.ts`
- `lib/bluestack/bluestackConnectionPolicy.ts`
- `src/power/telemetry/PowerTelemetryManager.ts`
- `src/power/types/PowerTelemetry.ts`
- `src/power/devices/PowerDeviceStore.ts`
- `src/power/hooks/usePowerTelemetry.ts`
- `src/features/power/services/powerTelemetryService.ts`
- `src/features/power/services/powerTruthService.ts`
- `src/features/power/components/PowerDeviceScanner.tsx`
- `src/features/power/components/PowerMonitorWidget.tsx`
- `src/features/power/components/PowerDetailModal.tsx`

### Vendor-Specific Files

- `lib/EcoFlowBluAdapter.ts`
- `lib/ecoflowUnifiedScannerDiscovery.ts`
- `lib/ecoflowCloudConnection.ts`
- `lib/ecoflowBluTelemetryEligibility.ts`
- `lib/ecoflowUnauthorizedDevice.ts`
- `lib/ecoFlowSelectionStore.ts`
- `src/power/cloud/providers/EcoFlowCloudProvider.ts`
- `supabase/functions/ecoflow/index.ts`
- `lib/BluettiBluAdapter.ts`
- `lib/BluettiConstants.ts`
- `lib/AnkerSolixBluAdapter.ts`
- `lib/AnkerSolixConstants.ts`
- `lib/GoalZeroBluAdapter.ts`
- `lib/GoalZeroConstants.ts`
- `lib/JackeryBluAdapter.ts`
- `lib/RenogyBluAdapter.ts`
- `lib/RedarcBluAdapter.ts`
- `lib/DakotaLithiumBluAdapter.ts`
- `src/power/drivers/DriverRegistry.ts`
- `src/power/drivers/vendors/*`

### UI Consumers

- `components/dashboard/VehicleTelemetryWidget.tsx`
- `components/dashboard/PowerSystemWidget.tsx`
- `components/dashboard/PowerSystemDetail.tsx`
- `components/dashboard/WidgetRenderers.tsx`
- `components/dashboard/DashboardHeader.tsx`
- `app/(tabs)/dashboard.tsx`
- `app/(tabs)/navigate.tsx`
- `components/navigate/TelemetryHUD.tsx`
- `components/mission/VehicleTelemetry.tsx`
- `app/vehicle-telemetry-settings.tsx`
- `app/obd-setup.tsx`
- `app/power/index.tsx`
- `app/vehicle-twin.tsx`
- `components/vehicle-twin/EcoFlowPickerModal.tsx`

## Regression Checklist For This Baseline

Automated checks can validate contracts and static wiring:

- `npm run test:vehicle-telemetry-live`
- `npm run test:obd2-live-pipeline`
- `npm run test:unified-telemetry-pipeline`
- `npm run test:unified-scanner-production-contract`
- `npm run test:unified-scanner-disconnect`
- `npm run test:ecoflow-cloud-connection`
- `npm run test:ecoflow-cloud-ble-separation`
- `npm run test:ecoflow-unified-scanner`
- `npm run test:ecoflow-blu-telemetry-eligibility`
- `npm run test:power-brand-adapters`
- `npm run test:power-provider-phases`
- `npm run test:power-live-readiness`
- `npm run test:dashboard-power-systems`
- `npm run gate:bluetooth-power-obd2-production`
- `npx tsc --noEmit --pretty false`

Real-device checks still require a native/development build and hardware:

- VeePeak still scans.
- VeePeak still connects.
- VeePeak still streams live OBD2 PID data.
- Dashboard renders without crash while OBD2 is live.
- Disconnect stops PID polling and live widget state ages/clears.
- EcoFlow Glacier cloud connect/poll failure is captured without logging secrets.
- No provider secrets or full sensitive payloads appear in logs.
