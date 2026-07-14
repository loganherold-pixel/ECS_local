# ECS Performance Baseline

## Purpose

This foundation measures ECS before broad optimization. It does not claim frame-rate, memory, battery, or device-level improvements. Runtime capture is development-only, bounded in memory, quiet unless `ECS_DEBUG_PERFORMANCE` is explicitly enabled, and excludes sensitive IDs, coordinates, traces, credentials, and raw payloads.

The machine-readable budget registry is `lib/performance/performanceBudgets.ts`. The checked-in baseline is `config/performance-baseline.json`. Null baseline values mean no defensible release-device sample exists yet; they are not zero-duration results.

## Baseline State

| Workflow | Instrumented seam | Current evidence | Absolute budget use |
| --- | --- | --- | --- |
| Cold startup | Startup hydration through rendered shell | Instrumentation only | Provisional warning rail |
| Warm restoration | Restored startup route through rendered shell | Device capture required | Provisional warning rail |
| Auth/setup handoff | Auth restore through selected rendered entry | Device capture required | Provisional warning rail |
| Primary tab switch | CommandDock command through pathname commit | Device capture required | Provisional warning rail |
| Navigate map ready | MapRenderer mount through definitive map-ready event | Device capture required | Provisional warning rail |
| Map pan/zoom | User drag/zoom through viewport reply | Device capture required | Provisional warning rail |
| GPX import | Parse/persist through preview staging | Device capture required | Provisional warning rail |
| Guidance start | Start command through active overlay state | Device capture required | Provisional warning rail |
| Dashboard | Hydration through usable widget grid | Device capture required | Provisional warning rail |
| Explore | Existing first-visible/full-list diagnostics plus paging/scroll counters | Development diagnostics exist | Relative gate after captures |
| Dispatch | Local hydration plus realtime disabled/connected readiness | Two-client/device capture required | Provisional warning rail |
| Offline Prep | Route/package read and deterministic departure audit | Deterministic audit is CI-observable | Relative gate after captures |
| Active vehicle | Authoritative store write through synchronous listeners | Development diagnostics exist | Relative gate after captures |
| Weather | Deduplicated provider request lifecycle | Provider/device capture required | Provisional warning rail |
| Device reconnect | Saved reconnect attempt lifecycle | Simulation accounting only | Hardware timing required |

Existing synthetic Explore checks are retained, but they are not treated as field-device baselines. Existing app-size gates remain separate because package size is not runtime latency.

## Capture And CI

- `npm run test:performance-foundation` validates budgets, bounded spans, metadata redaction, request/subscription accounting, long synchronous task detection, report evaluation, and all representative call sites.
- `npm run report:performance-baseline` prints a machine-readable JSON coverage report without writing repository files.
- `npm run report:performance-baseline -- --input <capture.json> --output <report.json>` evaluates a development capture.
- Add `--fail-on-regression` only after a measured baseline with enough samples is approved. Relative gates require each workflow's configured minimum sample count.

Development support tooling can call `getECSPerformanceSnapshot()` and persist the returned JSON outside normal production flows. Production builds do not collect these spans or emit performance console output.

## Ranked Optimization Backlog

1. **Capture release-build startup and tab-switch traces on the oldest supported Android phone and iPhone.** Startup currently coordinates many hydration promises, and absolute values are unknown.
2. **Profile Navigate on real hardware with route, MVUM, camps, weather, convoy, and Dispatch overlays together.** MapRenderer and Navigate are the largest/highest-risk render paths; WebView frame and memory evidence is still absent.
3. **Use render profiling to isolate Dashboard GPS/telemetry propagation.** The screen has many cross-store subscriptions; the new render counters can identify correlation but not component commit cost.
4. **Measure Explore long-list commits and image decode during sustained scrolling.** Existing synthetic tests cover logic contracts, not dropped frames or native image pressure.
5. **Capture BLE/OBD reconnect traces for each supported adapter and EcoFlow family.** Simulated accounting cannot validate native scanning, handshake latency, retry cost, or battery use.
6. **Capture Dispatch with two authenticated clients under reconnect and event bursts.** Local/realtime readiness is instrumented, but convergence latency needs production-like Supabase evidence.
7. **Establish provider-separated weather latency baselines.** Network time, cache path, and UI propagation should be evaluated independently before changing refresh policy.
8. **Add release-build energy and background GPS tests.** Timer/subscription counts are useful precursors, but battery impact needs Android Studio Energy Profiler and Xcode Instruments.
9. **Track bundle contributors alongside runtime traces.** The app-size gate currently reports a warning-level footprint; size work should be tied to cold-start and install evidence.
10. **Promote approved device p95s into the checked-in baseline.** Use at least the configured sample count per workflow and record platform, build kind, device class, and date.

## Device Profiling Still Required

- Android: Perfetto/System Trace, Android Studio CPU/Memory/Energy profilers, release APK startup, WebView/map frame timing, background GPS, BLE scan/reconnect, and low-memory restoration.
- iOS: Instruments Time Profiler, Core Animation, Allocations, Energy Log, location backgrounding, BLE reconnect, and warm restoration.
- Multi-client/provider: Supabase realtime Dispatch, authenticated route restoration, Mapbox tile/geometry timing, weather providers, and offline-to-online replay.

## Before And After

No product optimization was performed in this task, so there is no honest before-and-after speed, frame-rate, memory, or battery claim. The change adds measurement coverage and corrects only instrumentation gaps. The first measured comparison should be recorded after approved Android and iOS baseline captures.
