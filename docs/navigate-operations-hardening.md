# Navigate Operations Hardening

## Scope

This change strengthens the existing Navigate and MapRenderer stack. It does not replace the map renderer, alter the primary Navigate layout, or add a production dependency or rollout flag.

## Route Operation Contract

Navigate adapts its existing route lifecycle into these canonical operation phases:

`idle -> importing -> previewing -> editing -> staged -> active -> paused -> completed`

Any phase may enter `failed` only through an explicit failure transition. Cancel and reset transitions return to `idle`. Repeated import, preview, edit, stage, start, pause, resume, complete, fail, cancel, and reset events are idempotent where they represent the current phase. Invalid transitions preserve the current state and revision.

The existing route, run, navigation handoff, and guidance stores remain authoritative for persisted domain data. The operation state is an adapter and does not create a parallel persisted route record.

## Map Layer Ownership

`NavigateMapLayerCoordinator` owns request scheduling for Navigate viewport layers:

- MVUM geometry
- ECS route geometry
- dispersed camping eligibility
- established campgrounds

It also records the current source state and render priority for local weather, hazard, convoy, and Dispatch ping overlays. The coordinator provides:

- one active request per layer
- viewport fingerprint deduplication
- cancellation when the viewport or layer changes
- stale response rejection
- loading, error, degraded, and source state
- a 24-entry total in-memory cache bound
- an 8-entry per-layer in-memory cache bound

Camp layer persistent caches remain the offline fallback. Cached or stale data is labeled as such; it is not promoted to live data. Supabase function calls cannot cancel transport after invocation, so the coordinator aborts ownership and prevents late results from mutating the current viewport.

## Import Limits

Route imports use the existing GPX/KML and GeoJSON parsers through one adapter.

- Maximum input size: 12 MB
- Maximum source geometry: 200,000 points
- Maximum persisted navigation geometry: 25,000 sampled points
- Maximum preview geometry: 1,000 sampled points
- Sequential invalid or duplicate coordinates are rejected or removed
- GeoJSON waypoints are preserved
- Missing and partial elevation remain explicitly labeled
- Import cancellation is checked before and after parsing
- Run-store geometry fingerprints remain the durable duplicate guard

Sampling always preserves both route endpoints. Preview sampling is separate from persisted geometry, avoiding the former 1,000-point permanent truncation.

## Builder And Guidance

Route builder history supports bounded undo and redo. New edits clear redo history. Reset, cancel, and unmount abort outstanding final-snap verification. A late snap response cannot update a cleared draft.

Staging a built route while guidance is active uses the existing active-guidance replacement confirmation. The confirmed handoff is stamped and processed by the normal handoff orchestrator, so current guidance is not silently cleared or replaced.

App foreground restoration rehydrates persisted road guidance and the Navigate route session through a single in-flight foreground task. Offline guidance continues to use persisted route geometry.

## Performance Evidence

Deterministic pre-change static baseline:

| Measure | Before | After |
| --- | ---: | ---: |
| Viewport coordinator instances in Navigate | 3 plus custom MVUM counter | 1 |
| MVUM request-counter references | 9 | 0 |
| In-memory viewport cache bound | Unbounded | 24 total / 8 per layer |
| Route builder redo | No | Yes |
| Route import size/point budget | No | Yes |
| Navigate MapRenderer readiness timing | Inactive because Navigate uses compact mode | Active through explicit `performanceSurface` |

`npm run test:navigate-operations-runtime` emits JSON to stdout with lifecycle, request, cache, import, builder, camera, and static integration results. Existing development-only performance spans remain responsible for map-ready and viewport timings. Production console logging was not added.

No frame-rate or memory improvement is claimed by this change. Real Android and iOS profiling is still required for:

- map pan and zoom frame pacing with common overlays
- WebView GPU and memory behavior on supported low-end devices
- large GPX/KML parse time and peak memory
- app background and foreground behavior under OS memory pressure
- GPS, weather, convoy realtime, and BLE concurrency

## Rollout And Rollback

No new rollout flag is introduced. Existing Navigate, route geometry, MVUM, camp layer, convoy, Dispatch, weather, and live-service feature decisions remain unchanged.

Rollback is code-only: restore the prior screen-specific schedulers and MapRenderer timing condition. No persisted schema or data migration is introduced.
