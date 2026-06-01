# ECS Global Overlay And Duplicate UI Polish Audit

Date: 2026-05-02

Scope: Fleet, Navigate, Dashboard, Explore, Dispatch, and shared shell overlays.

## Summary

Low-risk cleanup applied:

- `components/Toast.tsx`: transient toast notifications now render with `pointerEvents="none"`, so they cannot intercept taps meant for active navigation guidance, map tools, modals, or tab controls.
- `app/_layout.tsx`: removed the root-shell startup video usage during post-auth redirect holding and replaced it with the existing lightweight ECS auth/background status surface. The startup video remains limited to the entry route.

Items intentionally not removed in this pass:

- Global shell, Fleet, Navigate, Dashboard, Explore, Dispatch, offline cache, telemetry, weather, ECS Brief, Mapbox, release readiness, runtime smoke, and checklist pipeline surfaces were retained.
- Medium-risk duplicate status and modal-surface candidates are documented below for a visual/product review pass.

## Global Shell

### Retain

- `app/_layout.tsx` owns the shared top banner, shared shell body, `OfflineSyncStatusChip`, and `CommandDock`.
- `components/CommandDock.tsx` remains the permanent bottom ECS taskbar. It is absolute and high-priority, but spans the shell width and is not a temporary floating popup.
- `components/navigate/OfflineSyncStatusChip.tsx` is intentionally global and appears above the dock with shell clearance. It should remain because offline map sync is cross-tab operational state.

### Needs Review

- `components/ECSModalShell.tsx` reserves bottom shell clearance for sheet presets, but dialog-style overlays use a smaller generic clearance. Review before changing because it affects Fleet, Explore, Dashboard, and Dispatch modal behavior globally.
- Direct `Modal` users, such as `components/dispatch/DispatchQueueModal.tsx`, bypass `ECSModalShell` and can fill to the screen edge. This should migrate to `ECSModalShell` after visual QA.
- `components/Toast.tsx` still defaults to a very high z-index when a screen does not override it. It no longer blocks touches after this audit, but future work should add a named overlay-priority API so active guidance can remain visually dominant everywhere.
- The post-auth redirect holding screen now uses a small ECS status surface instead of a full-screen video overlay, keeping the global shell free of obstructive loading media.

## Navigate

### Retain

- Active route guidance remains the highest-priority Navigate surface. `RoadNavigationOverlay` active guidance uses a higher local z-index than guidance-attached toasts, and Navigate positions those toasts below active guidance.
- Day/TAC/SAT/3D map style controls are wired through the Tools panel in `app/(tabs)/navigate.tsx`; no second visible Day/TAC/SAT control was found in the active render path.
- `MAP_POPUP_TOP` and `MAP_POPUP_BOTTOM` keep Navigate map popups inside the map/body region instead of crossing the shell bars.

### Low Risk Cleanup Applied

- Shared toasts are non-interactive, preventing temporary notifications from capturing touches over guidance, compass, tools, or route controls.

### Needs Review

- `app/(tabs)/navigate.tsx` still contains legacy map style styles (`legacyMapStyleContainer`, `legacyMapStyleButton`, related text styles) with no active render reference. They are safe style cleanup candidates after a quick snapshot comparison.
- Navigate contains older direct modal/sheet styles near export and snapshot flows. They should be converted to shared modal shell surfaces in a focused pass, not during this audit.

## Dashboard

### Retain

- Dashboard uses a centralized lane priority model for ECS Brief, route context, page support, GPS/offline state, and command banners. The `suppressedSources` logic is intentional and reduces duplicate top-lane status.
- The customize dim overlay uses `pointerEvents="none"`, so it does not block widget interactions outside explicit customize controls.
- Dashboard `Toast` now inherits the shared non-interactive toast behavior.

### Needs Review

- Offline state can appear in multiple places when the app is offline: global top/banner state, `OfflineStateBanner`, and Dashboard lane copy. This is useful in some degraded states, but should be visually checked so it does not read as three independent warnings.
- ECS Brief meta row plus top lane command copy can look dense when both include current ECS status. Keep both for now because ECS Brief is a tab context, but consider compressing the meta row when the top lane already states the same mode.

## Fleet

### Retain

- Fleet explicitly relies on the shared top-banner online/sync entry point rather than adding a duplicate tab-local online pill.
- Fleet modal flows use `ECSModalShell` or `TacticalPopupShell` for vehicle profile, loadout, sync, tires/lift, and build/loadout flows.
- Repeated confidence/readiness text in Fleet is mostly data-specific: vehicle weight confidence, readiness score, verification state, and loadout sync are distinct operational concepts.

### Needs Review

- Fleet cards can show readiness in several neighboring forms: active/standby badge, readiness score, verification badge, ECS score strip, and action buttons. This is not a duplicate online indicator, but it is a visual-density candidate.
- `FleetSyncStatusIndicator` exists as a compact header component. Confirm it is only exposed through the intended shared/global entry point and not duplicated in the Fleet body.

## Explore

### Retain

- Explore/Discover modals use `TacticalPopupShell`, which routes through the shared modal shell and is aligned with ECS popup styling.
- Route preview, remote zone detail, and expedition analysis surfaces keep route confidence/remoteness data inside their cards rather than creating global overlays.

### Needs Review

- Some internal component/file names still use `AI` (`AIRouteCard`, `AIRoutePreviewModal`, `AIGeneratedRoute`). Visible copy appears mostly ECS-oriented, but any user-facing "AI" labels should be reviewed and renamed to ECS terminology where possible.
- Explore route cards include thumbnail imagery and dense confidence metadata; keep for now, but visual QA should confirm cards still feel tactical rather than marketing-heavy.

## Dispatch

### Retain

- Dispatch queue, roster, timeline, advisory, and composer surfaces are active operational features and should not be removed.
- `DispatchTeamPingComposer` already uses `ECSModalShell`.

### Needs Review

- `components/dispatch/DispatchQueueModal.tsx` uses raw `Modal` plus its own overlay/content styles. It does not yet match the shared popup shell and may cross into global bars depending on viewport and safe area.
- Dispatch Queue Modal shows queue counts, pending/sending/failed chips, and offline state in close proximity. This is operationally meaningful, but the offline chip may duplicate global offline shell state.

## Recommended Follow-Up Order

1. Convert `DispatchQueueModal` to `ECSModalShell` and verify it stays between the global top banner and bottom ECS taskbar.
2. Add a shared overlay priority map for toast, guidance, global chips, modal scrims, and command dock.
3. Remove unused Navigate legacy map-style styles after a visual snapshot check.
4. Review Dashboard offline/banner/meta copy for duplicate status language in offline and active-route scenarios.
5. Rename visible Explore "AI" copy to ECS terminology while leaving internal namespaces for a separate code cleanup.

## Manual Visual Checklist

- Active Navigate guidance remains above temporary notifications.
- Navigate Tools has a single map style control set.
- Temporary notices do not block taps.
- Popups stay inside the central body region.
- Dispatch queue modal does not cover shell bars after its follow-up migration.
- Dashboard ECS Brief, offline banner, and top lane do not repeat the same status more than needed.
