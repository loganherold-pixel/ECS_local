# Bluestack Provider Readiness

Bluestack is the ECS scanner and connection command layer for power, OBD2, propane, water, and utility telemetry devices. This document is the field-test truth table for what ECS may present as live today versus what it may recognize but must not claim as live telemetry yet.

## Release Rules

- The mobile app must not contain provider API secrets.
- EcoFlow cloud telemetry is server mediated through Supabase Edge Functions. DELTA/RIVER power stations, Glacier/refrigerators, WAVE/portable AC units, and alternator chargers use the same authorized cloud path when EcoFlow grants access for that serial.
- EcoFlow support-confirmed public API authorization blocks are explicit: DELTA 3 1500, DELTA Mini, and Alternator Charger can return API code 1006. ECS should keep those devices visible as public API authorization pending or unsupported by the current EcoFlow developer app, with non-secret server-side diagnostics, and must not mark them live until decoded telemetry arrives.
- EcoFlow local BLE now uses the native power-adapter path with `ecoflow_native_ble_v1`. ECS only promotes it as live when decoded numeric power fields arrive from readable BLE characteristics.
- Native BLE discovery requires an installed development/native/EAS build. Expo Go cannot run the native scanner.
- A device can be recognized by Bluestack without being connectable for live telemetry.
- Native BLE power rows can be live-ready connection candidates, but ECS should not claim live telemetry until decoded data is flowing.
- OBD2 live status requires native transport, initialization, and PID data.
- Propane and water monitors may be linked as utility sensors before live parser support is complete.
- Parser promotion is controlled by `lib/bluestack/bluestackTelemetryParserRegistry.ts`; older vendor driver files must not be treated as release-ready until this registry is updated with field evidence.
- Parser-pending rows should be visible as recognized hardware, but they must stay non-live until a parser emits decoded telemetry.

## Provider Matrix

| Provider or class | Current ECS status | Connection path | User action | Secrets |
| --- | --- | --- | --- | --- |
| EcoFlow | Hybrid: cloud/API remains release path when authorized; native BLE can attempt local decoding | Cloud/API through Supabase or native BLE power adapter | Cloud-capable records prefer cloud; pure BLE records can connect natively and are promoted only after decoded hardware telemetry | `ECOFLOW_ACCESS_KEY`, `ECOFLOW_SECRET_KEY` in server/Edge Function environment only |
| Generic OBD2 | Release-ready when native Bluetooth and OBD handshake succeed | Native Bluetooth | Can attempt connection | None |
| BLUETTI | Live-ready native BLE candidate | Native BLE | Can attempt connection; promoted only after decoded hardware telemetry | None currently |
| Anker SOLIX | Live-ready native BLE candidate | Native BLE | Can attempt connection; promoted only after decoded hardware telemetry | None currently |
| Jackery | Live-ready native BLE candidate | Native BLE | Can attempt connection; promoted only after decoded hardware telemetry | None currently |
| Goal Zero | Live-ready native BLE candidate | Native BLE | Can attempt connection; promoted only after decoded hardware telemetry | None currently |
| Renogy | Live-ready native BLE candidate | Native BLE | Can attempt connection; promoted only after decoded hardware telemetry | None currently |
| REDARC | Live-ready native BLE candidate | Native BLE | Can attempt connection; promoted only after decoded hardware telemetry | None currently |
| Dakota Lithium | Live-ready native BLE candidate | Native BLE | Can attempt connection; promoted only after decoded hardware telemetry | None currently |
| Victron Energy | Live-ready native BLE candidate | Native BLE | Can attempt connection; promoted only after decoded hardware telemetry | None currently |
| Propane monitors | Live-ready utility sensor | Native BLE | Can link profile; live level is promoted only after ECS decodes a tank percentage | None currently |
| Water/fluid monitors | Live-ready utility sensor | Native BLE | Can link profile; live level is promoted only after ECS decodes a tank percentage | None currently |
| Other recognized devices | Profile only | Profile | Not connectable as live telemetry | None currently |

## Field-Test Acceptance Checklist

For each live-ready native BLE power provider, capture:

- Native build type, platform, and app version.
- Device model, firmware when available, and provider app status.
- BLE advertisement evidence without logging precise personal data or secrets.
- Connection handshake behavior.
- Decoded telemetry fields and units.
- Disconnect, reconnect, stale telemetry, and unsupported-runtime behavior.
- Dashboard widget behavior after telemetry starts and stops.

## Current Implementation Files

- `lib/bluestack/bluestackProviderReadiness.ts`
- `lib/bluestack/bluestackTelemetryParserRegistry.ts`
- `lib/bluestack/bluestackConnectionPolicy.ts`
- `lib/bluestack/bluestackScannerAdapter.ts`
- `lib/useUnifiedDeviceConnections.ts`
- `app/power/blu.tsx`
- `src/telemetry/utilitySensorTelemetrySelectors.ts`
