# ECS Performance And Render Stability Audit

Date: 2026-05-03

## Summary

No obvious React render loop or runaway interval was found in the audited release surfaces. The main low-risk patch from this pass bounds Dispatch CAD feed state growth so long-running sessions do not keep accumulating events indefinitely.

## Patched

| Area | Risk | Change |
| --- | --- | --- |
| Dispatch CAD feed | Unbounded in-memory event growth during long sessions with backend polling, realtime upserts, and manual events. | Added `DISPATCH_EVENT_STORE_LIMIT = 300` and bounded store writes after validation, dedupe, and priority/date sorting. |

## Findings By Surface

### MapRenderer

- WebView remounts are guarded by an instance key, failsafe timer cleanup, and `WEBVIEW_AUTO_RECOVERY_LIMIT = 1`.
- Static map HTML is memoized and dynamic updates are injected into the existing WebView.
- Remaining watch item: live GPS/user-location updates can still contribute to the full map payload hash in some no-route cases. This is not patched here because centering/follow behavior needs device QA before narrowing the static payload.

### Navigate

- Connectivity refresh interval is cleaned up.
- Trail update and replay timers are ref-backed and cleaned up in their owning effects.
- Active guidance auto-minimize uses a timeout ref and is bounded by active-guidance state.
- Weather alert refresh is deduped through the operational weather hook and notification keys.

### Dashboard Widgets

- Widget data consistency and binding validation hooks use fixed intervals with cleanup; neither hook appears wired into active dashboard render paths in this audit.
- Dashboard store subscriptions return unsubscribe handlers in active effects.
- Remaining watch item: dashboard has many independent store subscriptions; a later architecture pass could consolidate snapshots, but that would be broader than this release audit.

### ECS Brief

- `briefCadLogStore` is already bounded by `BRIEF_CAD_LOG_LIMIT = 100`.
- Guidance dedupe keeps a 15-minute suppression window and prunes history to `AI_GUIDANCE_HISTORY_LIMIT = 160`.

### Weather Pipeline

- Operational weather consumers use shared consumer cleanup and request dedupe.
- Route corridor/weather alert timers are interval-based with cleanup.
- Provider retry timers are bounded retry sleeps rather than persistent runaway loops.

### Connectivity And Offline Cache

- Connectivity, connectivity intel, sync coordinator, and offline engines use singleton timers. These should remain release-retained because they support offline honesty and restore behavior.
- Needs-review watch item: several singleton engines can run outside visible tabs. That is intentional for ECS readiness/offline behavior, but production profiling should confirm battery impact on a physical Android build.

### Explore Filtering

- Filtering is mostly render-driven but scoped to capped result sets and existing memoized/refined inputs.
- No false-empty or pagination loop was found in this pass.

### Dispatch CAD Feed

- Backend polling is 30 seconds and cleans up on dependency changes.
- Realtime session closes before replacement and on cleanup.
- Store-level feed growth is now capped at 300 sorted/deduped events.

## Remaining Performance Risks

- Physical-device profiling is still needed for Map WebView startup, Android Auto/CarPlay bridge timers, BLE telemetry polling, and GPS route recording.
- Generated native Android build work was interrupted before this audit; do not treat this performance pass as a native release performance profile.
- Some release diagnostics/logging hooks remain intentionally available for QA/admin surfaces and should stay gated from standard user flows.

## Manual QA Checklist

- Navigate map does not remount while GPS moves.
- Active guidance remains responsive during weather alert updates.
- Dashboard widget interactions remain responsive with all standard widgets enabled.
- Dispatch CAD feed remains responsive after repeated backend/realtime/manual event inserts.
- ECS Brief does not repeat identical advisories within the suppression window.
