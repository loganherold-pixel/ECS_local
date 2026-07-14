# ECS Device and Telemetry Lifecycle

## Canonical boundary

`lib/deviceTelemetryLifecycle.ts` is the shared contract between scanner records, stored profiles, BLE/cloud adapters, normalized telemetry, and presentation models.

Connection lifecycle states are:

`unknown -> discovered -> eligible -> connecting -> authenticating -> connected -> streaming`

Recoverable and terminal states are `degraded`, `reconnecting`, `disconnecting`, `disconnected`, `failed`, and `unsupported`. Callers must validate transitions with `canTransitionDeviceConnection` or `assertDeviceConnectionTransition`.

Telemetry source state is separate from connection state:

- `live`: decoded data from the active transport inside the live window while streaming.
- `recent`: decoded data inside the recent window, but not proven to be actively streaming.
- `stale`: decoded data outside the recent window but still usable with a stale label.
- `last-known`: retained data from an inactive or disconnected source.
- `no-data`: no decoded sample, invalid time, expired retention, or a transport mismatch.
- `unsupported`: the device or protocol is explicitly unsupported.

A connected link is never sufficient to claim live telemetry.

## Identity

`createCanonicalDeviceIdentity` produces a redacted canonical ID plus hashed transport aliases. Serial identity is exact, stored-profile identity is linked, model/name identity is heuristic, and transport-only identity is linked or temporary. Heuristic identity may group matching BLE and cloud records for presentation, but it must not authorize commands or merge safety-critical history without stronger identity evidence.

## Scanner ownership

`UnifiedScannerCoordinator` owns the top-level manual scan session:

- one active session
- foreground-only start
- bounded duration
- post-scan cooldown
- optional permission preflight
- cancellation signal
- background/unmount cleanup

Native BLE, OBD2, and cloud adapters retain transport-specific work. Their callbacks are accepted only while the coordinator session is current.

## Resource budgets

| Resource | Bound |
| --- | --- |
| Manual scan window | 10 seconds default, 30 seconds maximum |
| Manual scan cooldown | 5 seconds after completion |
| Telemetry UI publication | At most once per 750 ms per source |
| Vehicle snapshot persistence | At most once per 5 seconds while streaming |
| Vehicle last-seen persistence | At most once per 30 seconds |
| Power history | 600 samples per device |
| Active power histories | 8 devices |
| Reconnect attempts | 5 shared-policy attempts unless a stricter adapter policy applies |

Dashboard and Fleet power consumers subscribe only to `power_device` updates. Utility consumers subscribe only to `utility_sensor` updates. Vehicle consumers share one freshness clock and use the throttled telemetry-store subscription.

## Performance evidence

Before this change, both the last-known vehicle snapshot and registered-device `last_seen` record were persisted on every accepted vehicle telemetry sample. At a modeled 1 Hz stream over two minutes, that path scheduled 120 snapshot writes and 120 device-touch writes.

`npm run test:device-telemetry-resource-bounds` verifies the new deterministic upper bounds for the same input: 25 snapshot writes and 5 device-touch writes, including the initial write. It also verifies the 750 ms source publication interval, eight-device history cap, and 600-sample ring-buffer behavior.

These are scheduling and retention measurements from the deterministic harness. They are not claims about frame rate, memory usage, radio energy, or field battery life. Android Studio and Xcode energy, CPU, memory, and BLE profiling remain required.

## Persistence and restoration

Only safe normalized last-known vehicle telemetry and device metadata are persisted. Raw frames, credentials, provider tokens, and authorization payloads are excluded. Restored telemetry remains cached/last-known until fresh decoded data arrives. A newer live sample always wins over an older hydrated cache.

## Diagnostics and replay

Adapter errors use typed codes and redacted messages. Device identifiers in canonical diagnostics are fingerprints. Generic replay fixtures use `ecs.device_telemetry.replay` version 1, cap samples at 500, and must state that provider secrets, raw payloads, and precise location are absent.

The generic replay fixture validates lifecycle/source behavior only. Model-specific protocol validation remains in the existing EcoFlow replay fixtures and provider adapter tests.

## Production evidence still required

- Real Android and iOS permission, scan, background, reconnect, and disconnect evidence.
- VeePeak/V Peak OBD2 ELM handshake and decoded PID evidence with ignition-on and no-data cases.
- EcoFlow BLE evidence by model and firmware, including authentication/session behavior.
- EcoFlow Cloud account authorization, provider outage, stale response, and identity-matching evidence using redacted logs.
- BLUETTI, Anker SOLIX, Jackery, Goal Zero, Renogy, REDARC, Dakota Lithium, and Victron model-specific decode and reconnect evidence.
- Mopeka/utility-sensor calibration evidence before tank percentage is promoted to live.

No automated or replay test is a substitute for those field qualifications.
