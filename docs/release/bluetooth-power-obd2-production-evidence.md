# Bluetooth, Power, OBD2 Production Evidence

Status: blocked by real-hardware evidence

Production decision: pending

## System

Bluestack is the canonical ECS device connection surface for power devices, OBD2 telemetry, propane monitors, water/fluid monitors, and utility sensors. The scanner may recognize provider families before live telemetry is release-ready. Parser-pending providers must remain visible as recognized hardware without being treated as live telemetry.

## Current Passes

- Native BLE dependency, Expo config plugin, Android permissions, and iOS Bluetooth usage strings are configured.
- Device Connections uses the Bluestack scanner as the canonical user-facing scanner.
- EcoFlow cloud/API devices remain selectable when native Bluetooth is unavailable.
- EcoFlow cloud authorization failures are separated from Bluetooth scan failures.
- Generic Bluetooth noise is hidden from the production connectable list.
- OBD2 live status is gated by native transport, ELM327/OBD initialization, and PID telemetry.
- Provider readiness and parser-pending status are documented in `docs/bluestack-provider-readiness.md`.

## Remaining Production Tasks

| Task | Status | Evidence Needed |
| --- | --- | --- |
| Android native BLE discovery | Pending | Development/native Android build evidence showing permissions, scan start, native callbacks, visible Bluestack rows, and clean unsupported/runtime states. |
| Power station connect/stream/disconnect | Pending | Real hardware evidence for scan, connect, telemetry stream, disconnect, stale/cleared widget state, and reconnect behavior. |
| EcoFlow cloud/BLE separation | Pending | Real EcoFlow evidence showing cloud/API authorization success or unauthorized failure without mislabeling it as local Bluetooth state. |
| OBD2 no-data and live-data paths | Pending | Real ELM327-compatible adapter evidence for no-data, live PID data with vehicle running, disconnect, and telemetry clearing/aging. |
| Production owner decision | Pending | Product, privacy, field-ops, and engineering owner acceptance after evidence is complete. |

## Evidence Contract

The production gate expects this evidence file when QA is complete:

`.smoke/bluetooth-power-obd2-production-evidence.json`

Expected fields:

```json
{
  "androidNativeBleDiscoveryPassed": true,
  "powerStationConnectStreamDisconnectPassed": true,
  "ecoflowCloudBleSeparationRealDevicePassed": true,
  "obd2NoDataPassed": true,
  "obd2LiveDataPassed": true,
  "obd2DisconnectClearsTelemetryPassed": true,
  "productionDecision": "accepted",
  "buildAndDevice": {
    "appBuildType": "development/native",
    "appVersion": "field-test build identifier",
    "androidDeviceModel": "device model",
    "androidOsVersion": "Android version",
    "nativeBuild": true,
    "expoGoRuntime": false
  },
  "deviceMatrix": [
    "Android native development build",
    "EcoFlow cloud/API device",
    "BLE power station",
    "ELM327-compatible OBD2 adapter"
  ],
  "evidenceReferences": [
    ".smoke/bluetooth-deep/android-native-ble-scan.png",
    ".smoke/bluetooth-deep/power-connect-stream-disconnect.log",
    ".smoke/bluetooth-deep/ecoflow-cloud-ble-separation.png",
    ".smoke/bluetooth-deep/obd2-live-no-data-disconnect.log"
  ],
  "reviewerSignoff": {
    "product": "name/date",
    "engineering": "name/date",
    "privacy": "name/date",
    "fieldOps": "name/date",
    "acceptedAt": "ISO timestamp"
  },
  "notes": "Screenshots, diagnostics exports, and log references captured for review."
}
```

Do not set `productionDecision` to `accepted` until real-hardware evidence is reviewed and owner sign-off is complete. The gate also requires at least four non-placeholder device-matrix entries, four non-placeholder evidence references, non-placeholder notes, and product/engineering/privacy/field-ops signoff.

## Capture Checklist

- App build type and version.
- Device model and Android OS version.
- Bluetooth and location permission state.
- Native BLE scanner readiness state.
- Bluestack scan summary: detected, visible, hidden, cloud/API, parser-pending, and native-build-required counts.
- Diagnostics export from the Device Connections panel.
- Screenshots showing visible rows and action states.
- Logs showing no raw provider secrets, full tokens, or precise coordinates.
- Widget behavior after live telemetry starts, stops, fails, or ages stale.
