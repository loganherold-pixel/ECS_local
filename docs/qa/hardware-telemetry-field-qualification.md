# Hardware Telemetry Field Qualification

Status: stabilization / QA lane only.

Raw evidence location: `.qa/hardware-telemetry-field-qualification/`

Do not store raw QA evidence in git. Keep screenshots, UI dumps, logcat captures, BLE dumps, account/device identifiers, route/location details, and provider payloads in ignored local folders. Commit only concise summaries that redact sensitive values.

## 2026-06-10 Android Field QA Run

Device: Samsung SM-X230, Android 16, serial R5GL13VYSRY.

Local raw evidence: `.qa/hardware-telemetry-field-qualification/`

Summary:

- Native launch passed. The app focused `com.expeditioncommand.planningofflinesync/.MainActivity`, keyguard was not active, and no redbox or app fatal logcat pattern was observed.
- Dev/test fixture `planning-offline-sync:///dev/hardware-telemetry-qa` rendered and stayed labeled non-production. It did not call providers or mutate saved trips, Active Trip, Offline Packet, Badge, Convoy, Fleet, or telemetry state.
- Bluestack scanner opened on Android native and completed a scan without crashing. It reported zero available devices and zero live devices.
- VeePeak/OBD2 was not field-verified in this run. The scanner showed the runtime limitation copy for Classic Bluetooth OBD2 discovery; no VeePeak BLE or decoded OBD2 PID data was captured.
- EcoFlow Glacier BLE was not field-verified in this run. No EcoFlow BLE device was discovered or connected, and no decoded EcoFlow telemetry was captured.
- EcoFlow Cloud/API was not exercised with credentials or a device quota in this run. No cloud telemetry was captured, and no secrets were exposed in the captured UI summary.
- Mopeka/Bluestack utility sensors were present only as linked scanner rows: `Mopeka Water Tank` and `Mopeka Propane Tank`. The scanner showed two parser-pending/native-build utility sensor paths and zero live devices; no trusted tank percentage reading was captured.
- Dashboard rendered with `OBD2 OFFLINE` and `POWER MONITOR` visible, and did not crash when no live hardware feed was available.
- Active Trip and Offline Packet live hardware telemetry was not exercised because no verified live hardware provider was connected. Existing automated checks confirm unavailable telemetry remains non-blocking.
- Badge isolation passed by automated guard tests; no hardware connection or scanner viewing created badge unlock evidence.

Provider readiness classification from this run:

| Provider path | Field result | Classification | Notes |
| --- | --- | --- | --- |
| VeePeak / OBD2 | No compatible live adapter discovered; no decoded PID samples. | Not ready for verified-live promotion | Android scanner remained stable and did not fake live OBD2 data. |
| EcoFlow Glacier BLE | No EcoFlow BLE device discovered or connected. | Unavailable in this field run | Timeout/unavailable semantics are covered by tests and fixture only. |
| EcoFlow Cloud/API | Not exercised with credentials/device quota. | Not field-qualified | Must be tested with safe credentials and redacted logs before promotion. |
| Mopeka / Bluestack utility sensor | Linked water/propane rows visible; parser pending/native build count 2, live count 0. | Partial / parser-pending | Do not promote to live tank percentage without decoded percent plus tank profile/calibration. |
| Dashboard / power widget | Rendered no-live-data state without crash. | Stable fallback | `OBD2 OFFLINE` was visible; no live power value was fabricated. |
| Manual/persisted fallback | Fixture-only verified. | Manual/stale-only | Useful fallback, not hardware-live evidence. |
| Mock/demo telemetry | Fixture/test-only. | Mock/demo only | Not used for production live status or badges. |

Commands run:

- `npm run test:hardware-telemetry-field-qualification` - passed
- `npm run test:bluetooth-power-obd2-production` - passed
- `npm run test:unified-telemetry-pipeline` - passed
- `npm run test:vehicle-telemetry-live` - passed
- `npm run test:power-provider-boundary` - passed
- `npm run test:badge-expedition-identity-mvp` - passed
- `npm run test:active-trip-mode-foundation` - passed
- `npm run test:offline-incident-packet-foundation` - passed
- `npm run lint` - passed
- `npm run smoke -- --json` - passed
- `git diff --check` - passed with the existing package.json LF-to-CRLF warning

## Contract

ECS hardware telemetry uses these qualification states:

- `live`
- `stale`
- `manual`
- `unknown`
- `unavailable`
- `unsupported`
- `mock`
- `demo`
- `error`

Truth rules:

- Connection presence is not live telemetry. A connected adapter, paired device, discovered BLE peripheral, or selected cloud device is only a connection signal.
- Live requires decoded values from a trusted hardware/provider source with a fresh timestamp.
- Stale data may be shown with timestamp context, but must not be labeled live, healthy, verified, or safe.
- Manual values are useful fallback input, but must stay manual.
- Unknown, unavailable, unsupported, and error states must never read as safe or verified.
- Mock/demo telemetry is ignored for production confidence, production live status, badge unlocks, and field qualification.
- Cloud/API failures must not clear separate BLE/local telemetry unless the same source is explicitly unavailable.
- Tank sensors need a percent reading or a documented tank profile/calibration before ECS can call level data live.
- In short: connection presence is not live telemetry.

Canonical contract: `src/telemetry/hardwareTelemetryQualification.ts`

Dev/test fixture route: `planning-offline-sync:///dev/hardware-telemetry-qa`

The fixture route is guarded by `__DEV__` or `NODE_ENV === 'test'`. Production builds redirect away from it.

## Inventory

| Provider path | Current classification | Source of truth | Promotion blocker |
| --- | --- | --- | --- |
| VeePeak OBD2 | Hardware QA required | `src/vehicle-telemetry/VehicleTelemetryStore.ts`, `src/vehicle-telemetry/OBD2PIDPoller.ts`, `src/telemetry/telemetryAdapters.ts` | Needs Android live PID evidence, no-data evidence, and disconnect clearing evidence. |
| EcoFlow BLE | Partial / gated | BLU power adapters into `src/telemetry/ECSTelemetryStore.ts` | Needs model-specific BLE connect/stream/timeout evidence. |
| EcoFlow Cloud/API | Unavailable / gated | EcoFlow adapter and provider boundary layer | Needs auth, timeout, stale, no-device, and successful telemetry qualification without exposing secrets. |
| Mopeka / Bluestack utility sensor | Parser pending or manual | `src/telemetry/telemetryAdapters.ts`, utility sensor selectors | Needs tank profile/calibration evidence before distance can become live percent. |
| Generic/manual power fallback | Manual only | Power truth normalization and manual power fallbacks | No hardware promotion; keep manual labels. |
| Mock/demo connectors | Dev/test only | Mock/demo guard tests and dev fixtures | Never production evidence. |

## Provider Field Checklists

### VeePeak OBD2

- Device and OS tested.
- Adapter name variants observed, such as VeePeak, V Peak, OBD Check, VP11.
- Service UUIDs and transport path captured.
- Scan, connect, ELM327 init, and PID polling evidence captured.
- At least one decoded PID sample captured, such as RPM, speed, coolant, voltage, fuel, or engine load.
- Connected-without-decoded-PID state confirmed as unsupported/unavailable, not live.
- Disconnect clears live state and leaves stale/last-known copy if data remains visible.
- No redbox or fatal logcat pattern during connect, no-data, live-data, and disconnect flows.

### EcoFlow BLE

- Device model and firmware recorded.
- Android scan, connect, subscribe/read, decoded packet, timeout, and disconnect evidence captured.
- SOC, input/output watts, runtime, voltage/current, or temperature captured only when decoded by the app.
- Timeout/unavailable state finalizes and does not leave loading stuck.
- BLE unavailable does not fabricate cloud data.
- Cloud auth/API errors do not erase separate BLE telemetry.
- Stale BLE data shows timestamp/freshness context.

### EcoFlow Cloud/API

- Provider credentials are not logged, screenshot, or committed.
- Account/device selection is scoped and does not expose secrets in mobile code.
- Auth unavailable, timeout, no device, and provider error cases show error/unavailable copy.
- Successful telemetry, if available, includes provider source, timestamp, device identity, and freshness.
- Stale cloud telemetry does not display as live.
- Provider outage does not overwrite independent BLE/local readings.

### Mopeka / Bluestack utility sensor

- Sensor model, advertised payload, profile id, parser status, and signal strength captured.
- Tank profile, tank geometry, orientation, install height, and calibration method recorded before percent is trusted.
- Distance-only readings stay unknown/unsupported and do not publish live tank level.
- Manual tank value stays manual.
- Decoded percent, battery, temperature, and read quality are captured if available.
- Stale sensor data shows timestamp/freshness context.

### Generic/manual fallback

- Manual values are labeled manual.
- Cached values are timestamped and not live.
- Missing values remain unknown/unavailable.
- Manual/cached values do not unlock hardware confidence or badges.

## Dashboard / Power Audit

- Dashboard Power System Widget consumes normalized ECS power telemetry through `useECSPowerTelemetryReadings`.
- Simulation/mock power is blocked outside allowed dev/test runtime.
- Stale/unavailable power data maps to communication-loss or unavailable copy, not healthy/live copy.
- Known power device metadata can persist, but metadata is not live telemetry evidence.

## Active Trip / Offline Packet Audit

- Active Trip currently renders stored route confidence, vehicle, and snapshot fields. This lane does not add live hardware telemetry to Active Trip.
- Offline Incident Packet renders stored local-only packet data. It should remain local-only/stale/unknown unless future work explicitly maps qualified telemetry into the packet.
- Route Confidence already treats telemetry unavailable as visible context and does not allow stale/mock telemetry to improve confidence.

## Dev/Test Harness

Use the dev route to visually verify:

- OBD2 live decoded PID
- OBD2 connected with no decoded PID
- OBD2 stale last-known
- EcoFlow BLE timeout
- EcoFlow Cloud/API unavailable
- Mopeka missing tank profile
- Manual power fallback
- Mock power ignored
- Demo utility sensor ignored
- Unknown power state

The harness does not call providers, create membership, publish location, unlock badges, write saved trips, alter Fleet, alter Convoy, alter telemetry devices, or persist field evidence.

## Manual Android QA Checklist

1. Store raw evidence under `.qa/hardware-telemetry-field-qualification/`.
2. Launch Android native app.
3. Open `planning-offline-sync:///dev/hardware-telemetry-qa` in dev/test.
4. Verify the fixture is labeled dev/test/non-production.
5. Verify each scenario displays its expected state and no production-live claim.
6. Verify mock/demo states are not shown as live/verified/healthy.
7. Verify manual values stay manual.
8. Verify unsupported connection-only paths do not show live.
9. Verify no product state changes after fixture viewing.
10. Run the command suite recorded in the branch summary.

## Remaining Promotion Blockers

- Real Android BLE evidence is still required for OBD2/VeePeak, EcoFlow BLE, and Mopeka/Bluestack devices.
- EcoFlow Cloud/API is not production-qualified until credential, timeout, stale, and successful telemetry paths are captured without exposing secrets.
- Mopeka tanks cannot be promoted from distance/parser-pending to live percent without tank profile/calibration evidence.
- This lane does not certify hardware reliability. It only makes ECS labeling and field qualification criteria explicit.
