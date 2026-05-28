# BLU Power Vendor Verification

Scope: non-vehicle BLU power vendors currently recognized by ECS. VeePeak OBD2 remains the known-good local BLE reference, but it is a vehicle telemetry path rather than a power-vendor path.

## Vendor Matrix

| Vendor | Discovery | Connect | Live Stream | Cloud | Normalized | UI Wired | Multi-device | Status |
|---|---|---|---|---|---|---|---|---|
| Bluetti | yes | yes: native BLE live-ready path | yes when decoded hardware fields arrive | no | yes through shared native BLE power bridge | yes: visible as live-ready native BLE | limited: one active peripheral per provider adapter | native BLE live-ready |
| Goal Zero | yes | yes: native BLE live-ready path | yes when decoded hardware fields arrive | no | yes through shared native BLE power bridge | yes: visible as live-ready native BLE | limited: one active peripheral per provider adapter | native BLE live-ready |
| Anker / Anker SOLIX | yes | yes: native BLE live-ready path | yes when decoded hardware fields arrive | no | yes through shared native BLE power bridge | yes: visible as live-ready native BLE | limited: one active peripheral per provider adapter | native BLE live-ready |
| Jackery | yes | yes: native BLE live-ready path | yes when decoded hardware fields arrive | no | yes through shared native BLE power bridge | yes: visible as live-ready native BLE | limited: one active peripheral per provider adapter | native BLE live-ready |
| Renogy | yes | yes: native BLE live-ready path | yes when decoded hardware fields arrive | no | yes through shared native BLE power bridge | yes: visible as live-ready native BLE | limited: one active peripheral per provider adapter | native BLE live-ready |
| REDARC | yes | yes: native BLE live-ready path | yes when decoded hardware fields arrive | no | yes through shared native BLE power bridge | yes: visible as live-ready native BLE | limited: one active peripheral per provider adapter | native BLE live-ready |
| Dakota Lithium | yes | yes: native BLE live-ready path | yes when decoded hardware fields arrive | no | yes through shared native BLE power bridge | yes: visible as live-ready native BLE | limited: one active peripheral per provider adapter | native BLE live-ready |
| Victron Energy | yes | yes: native BLE live-ready path | yes when decoded hardware fields arrive | no | yes through shared native BLE power bridge | yes: visible as live-ready native BLE | limited: one active peripheral per provider adapter | native BLE live-ready |
| EcoFlow | yes | yes for authorized cloud; local BLE parser incomplete | yes through cloud when authorized and decoded; no local BLE stream yet | yes | yes | yes | partial: cloud polling sessions are per-device; primary summary remains guarded | cloud live / local BLE incomplete |
| Unknown power device | partial | no | no | no | no | yes: visible only when classified as power-like | no | profile-only |

## Current Release Gate

The release source of truth for power-vendor promotion is `lib/bluestack/bluestackTelemetryParserRegistry.ts`.

EcoFlow remains the cloud/API live path. BLUETTI, Goal Zero, Anker/SOLIX, Jackery, Renogy, REDARC, Dakota Lithium, and Victron now have `canDecodeLiveTelemetry: true` through the shared native BLE power bridge. Unknown power devices remain profile-only until a provider is identified.

Field acceptance for each native BLE provider should still capture:

- native build/device model captured,
- advertisement evidence captured without raw secrets,
- handshake captured,
- decoded telemetry fields verified,
- disconnect and stale behavior verified.

The live bridge still protects ECS from presenting simulated or parser-guessed values as live field telemetry: a connection is only promoted when decoded power fields arrive from hardware.

## Shared Telemetry Contract

Power telemetry now carries the same shared BLU envelope shape used by the VeePeak reference documentation:

- `lib/bluTelemetryEnvelope.ts` builds power envelopes through `buildPowerBluTelemetryEnvelope()` and `buildBluPowerTelemetryEnvelope()`.
- `lib/IEcsPowerProvider.ts` exposes optional `bluTelemetryEnvelope` on normalized power readings.
- `lib/BluTypes.ts` exposes optional `bluTelemetryEnvelope` on `BluTelemetry`.
- `lib/BluStateStore.ts` attaches a power envelope before storing BLU telemetry.
- `lib/createNativeBleBluAdapter.ts` emits a power envelope for decoded and telemetry-unsupported native BLE packets.
- `lib/powerBrandConnectionAdapters.ts` attaches a power envelope when a release-eligible provider emits normalized readings.

Envelope source and health rules:

- decoded BLE power telemetry: `source: 'local-ble'`, `health: 'live' | 'recent' | 'stale'`,
- provider cloud telemetry: `source: 'cloud-api'`,
- parser-pending or unsupported telemetry: `health: 'unavailable'`,
- dev simulation: `source: 'mock'`, `health: 'mock'`, never live.

## Mock And Legacy Adapter Status

Legacy adapter files for Bluetti, Goal Zero, Anker/SOLIX, Jackery, and Renogy still contain simulated device/telemetry paths for development. Release live connections use `lib/livePowerBleProviders.ts`, which wraps native BLE adapters and promotes only decoded hardware telemetry.

When dev mock telemetry is enabled, those adapters now mark telemetry as:

- `source: 'mock_dev'` at the BLU telemetry layer,
- `health: 'mock'` inside `bluTelemetryEnvelope`,
- `isLive: false`,
- `raw.simulated: true`,
- `raw.mock: true`.

If the mock flag is disabled, `BluStateStore` rejects the mock attempt and logs `[BT_LIVE] mock_disabled`.

## UI Consumption

The Dashboard and Power Center consume normalized telemetry through:

- `src/telemetry/ECSTelemetryStore.ts`,
- `src/telemetry/telemetryAdapters.ts`,
- `src/telemetry/useECSTelemetry.ts`,
- `components/dashboard/PowerSystemWidget.tsx`,
- `app/power/index.tsx`,
- `app/power/blu.tsx`,
- `lib/useUnifiedDeviceConnections.ts`.

Unsupported and parser-pending devices remain visible as nearby/attention devices rather than random failures. Mock, stale, unavailable, and live states remain distinct through source labels, `isLive`, `telemetryUnsupported`, and envelope health.

## Vendor Notes

Bluetti:
Discovery exists through name/service matching and the unified scanner. Release connection now uses the shared native BLE power bridge and promotes only decoded hardware telemetry.

Goal Zero:
Discovery exists through Goal Zero/Yeti name and service matching. Release connection now uses the shared native BLE power bridge and promotes only decoded hardware telemetry.

Anker / Anker SOLIX:
Discovery exists through Anker/SOLIX name and service matching. Release connection now uses the shared native BLE power bridge and promotes only decoded hardware telemetry.

Jackery:
Discovery exists through Jackery/Explorer matching. Release connection now uses the shared native BLE power bridge and promotes only decoded hardware telemetry.

Renogy:
Discovery exists through Renogy/solar-controller matching. Release connection now uses the shared native BLE power bridge and promotes only decoded hardware telemetry.

REDARC and Dakota Lithium:
Native BLE adapter wrappers are registered through the shared live bridge and can promote decoded hardware telemetry.

Victron:
Victron is recognized in provider metadata and scanner classification, and now has a native BLE live-ready provider bridge.

EcoFlow:
EcoFlow remains the release cloud/API power-vendor telemetry path. Local BLE attachment is visible but parser-pending for EcoFlow-specific Bluetooth telemetry.
