# ECS Release Logging Hygiene Audit

Date: 2026-05-03

## Summary

This pass audited direct `console.log`, `console.warn`, and `console.error` usage across the active Expo app, dashboard widgets, dispatch, weather, fleet, vehicle telemetry, campsites, and support stores.

Low-risk production noise was gated behind `__DEV__`. Release-relevant warnings and errors were preserved, especially auth/session restore, offline honesty, weather fallback, navigation/import failures, map/WebView failures, sync conflicts, release readiness, runtime smoke, and telemetry failure paths.

## Remove Now

No files were removed in this pass. Logging-only cleanup avoided deleting behavior or diagnostics.

Low-risk traces now gated behind dev-only logging:

- `app/login.tsx`: auth CTA/render/validation route-decision breadcrumbs.
- `app/auth-info.tsx`: legal/support route open/close breadcrumbs.
- `app/expedition-command.tsx`: completion flow success breadcrumbs.
- `app/(tabs)/route.tsx`: document-picker success and file URI/length traces.
- `app/(tabs)/navigate.tsx`: campsite render counts and Navigate import success/picker/cancel traces.
- `app/(tabs)/dashboard.tsx`: remoteness navigation start/success moved to `ecsLog.debug`.
- `app/(tabs)/fleet.tsx`: store refresh, focus refresh, copy/delete success breadcrumbs.
- `components/dashboard/SetupTakeover.tsx`: setup auto-dismiss and accessory success traces.
- `components/dashboard/VehicleTelemetryWidget.tsx`: render signature trace.
- `components/dashboard/EcsDiagnosticsPanel.tsx`: diagnostics panel-open trace.
- `components/dispatch/DispatchCadCommandCenter.tsx`: render/team-sync/drilldown traces.
- `components/dispatch/DispatchCommandCenter.tsx`: realtime paused trace.
- `components/expedition/ExpeditionBuilder.tsx`: builder routing/autocomplete success traces.
- `components/login/VideoBackground.tsx`: fallback video debug traces.
- `components/vehicle-wizard/LoadoutWizardStep.tsx`: loadout init/link success traces.
- `components/weather/WeatherIntelPanel.tsx`: weather fetch/cache/autofetch success traces.
- `lib/campsites/campsiteLocatorService.ts`: campsite locator summary trace.
- `lib/vehicleCompanionManager.ts`: companion action, restore, start/stop, reconnect, and quick-command breadcrumbs.
- `lib/vehicleStore.ts`: local/cloud vehicle success breadcrumbs and change events.
- `lib/vehicleSessionState.ts`: companion/session mode, expedition, route, waypoint, reconnect, and reset success breadcrumbs.
- `lib/viewerSettingsStore.ts`: QA widget/layout setting traces.
- `lib/widgetRegistry.ts`: registry audit success trace.
- `src/power/cloud/providers/EcoFlowCloudProvider.ts`: cloud connection, catalog, eligibility, pending-approval, authorization, fallback, and telemetry mapping diagnostics.
- `src/vehicle-telemetry/VehicleTelemetryAdapterBridge.ts`: adapter binding/connection debug traces and listener attach/failure warnings.
- `src/vehicle-telemetry/useVehicleTelemetry.ts`: provider disconnect success trace.
- `src/vehicle-telemetry/VehicleTelemetryDeviceRegistry.ts`: registry lifecycle success traces.

## Gate Behind Dev Flag

Patched in this pass:

- Success-path `console.log` calls listed above.
- Existing dev-only logs left as-is where they already had `__DEV__` checks.
- Weather panel debug logs now route through the existing dev-only `logWeatherPanelRetention` helper.
- `lib/vehicleCompanionManager.ts`: success breadcrumbs now use `ecsLog.dev('SYSTEM', ...)` behind `ECS_DEBUG_VEHICLE_COMPANION`; warning paths now route through `ecsLog.warn`.
- `lib/vehicleStore.ts`: vehicle CRUD/cache success breadcrumbs now use `ecsLog.dev('CONFIG', ...)` behind `ECS_DEBUG_VEHICLE_STORE`; warning and error paths now route through `ecsLog.warn/error`.
- `lib/vehicleSessionState.ts`: success lifecycle breadcrumbs now use `ecsLog.dev('SYSTEM', ...)` behind `ECS_DEBUG_VEHICLE_SESSION`.
- `src/power/cloud/providers/EcoFlowCloudProvider.ts`: routine diagnostics now use `ecsLog.dev('POWER', ...)` behind `ECS_DEBUG_ECOFLOW_CLOUD`; unauthorized cloud telemetry warnings remain production-visible through `ecsLog.warn`.
- `src/vehicle-telemetry/VehicleTelemetryAdapterBridge.ts`: `debug` option output now routes through `ecsLog.debug('TELEMETRY', ...)`; bridge listener warnings route through `ecsLog.warn`.

Remaining candidates for a follow-up dev-gating pass:

None in this release logging audit section.

## Keep For Release

These log classes should remain visible in production unless ECS gets a structured diagnostic event sink:

- Auth/session failures and user-visible sign-in errors.
- Offline/cache/weather fallback failures and stale data warnings.
- Navigation file import failures, route parse failures, and map/WebView crashes.
- Dispatch recovery backend/load failures, unauthorized context warnings, and rejected recovery events.
- Sync conflicts, failed queue replay, and merge failures.
- Runtime smoke, release readiness, startup, and readiness checklist output.
- Telemetry, power, and GPS degradation warnings.
- Widget registry warnings for duplicate IDs or render-ready inconsistencies.

## Convert To Structured ECS Diagnostic Event

Recommended follow-up:

- Replace high-value `console.warn/error` paths with `ecsLog.warn/error` so diagnostics are buffered and category-filterable.
- Add categories or subcategories for `AUTH`, `SYNC`, `DISPATCH`, and `ROUTE_IMPORT` if the existing `ecsLog` categories are too coarse.
- Continue moving high-value warning/error paths into structured ECS diagnostics as each subsystem is reviewed.
- Keep user-facing toasts and state messages unchanged; structured diagnostics should supplement, not replace, the UI.

## Risk Notes

- Low risk: dev-gating success breadcrumbs and picker/cache/render traces. No state or UI behavior changes.
- Medium risk: broadly changing stores and integrations that support offline cache, companion, power, and telemetry workflows. These were reported but not rewritten.
- High risk: silencing errors from auth, weather fallback, map rendering, navigation import, release readiness, runtime smoke, or sync conflict paths. These were intentionally preserved.

## Acceptance Check

- Production `console.log` spam is reduced on active auth, route import, Fleet, Dispatch, weather, setup, campsite, and telemetry widget paths.
- Critical warnings/errors still surface.
- Runtime smoke and readiness logs are preserved.
- No user-facing behavior was intentionally changed.
