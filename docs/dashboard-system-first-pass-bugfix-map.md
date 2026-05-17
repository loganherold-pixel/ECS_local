# Dashboard/System First-Pass Bugfix Map

Date: 2026-04-27

Scope: living map for the first Dashboard/system bug pass. Updated with implemented runtime fixes as each bug target lands.

## Current Relevant Files

- `app/(tabs)/dashboard.tsx` - Dashboard screen, header mount, widget data assembly, weather hook usage, route/weather/telemetry context assembly.
- `components/dashboard/DashboardHeader.tsx` - Expedition Command top banner, shell controls, diagnostics, BLU status pill, route-selected state.
- `components/Header.tsx` - Shared tab header used by Fleet and other tabs.
- `components/TabHeaderTitleImage.tsx` - Shared centered top-banner title/subtitle renderer.
- `app/(tabs)/fleet.tsx` - Fleet screen visible banner now passes `Header title="Fleet Center"` in render states.
- `components/dashboard/WidgetRenderers.tsx` - Route Progress, highway weather/elevation widgets, weather detail rendering, widget dispatch.
- `components/dashboard/WidgetGrid.tsx` and `components/dashboard/WidgetDetailModal.tsx` - Dashboard widget shell/detail host.
- `components/dashboard/PowerSystemWidget.tsx` - ECS power widget, BLU authority subscriptions, flow graphic.
- `components/dashboard/PowerSystemDetail.tsx` - ECS power detail view.
- `components/dashboard/TerrainRiskWidget.tsx` - Terrain risk card/detail using default/simulated inputs.
- `components/QuickActionsSheet.tsx` - Field Utilities panel, emergency protocol quick-action detail, Device Connections embedded panel.
- `components/emergency/EmergencyProtocolModal.tsx` - Standalone emergency protocol modal.
- `components/vehicle-telemetry/OBD2ScannerModal.tsx` - OBD scanner modal path.
- `app/power/blu.tsx` - Device Connections screen and scan visibility/debug summary.
- `lib/useUnifiedDeviceConnections.ts` - Unified scanner, source summaries, native BLE/OBD2/API/mock source states.
- `src/vehicle-telemetry/OBD2Adapter.ts` - OBD2 native BLE scan/readiness/callback handling.
- `src/power/ble/BlePermissions.ts` and `src/power/ble/BleScanReadiness.ts` - shared native BLE permission/readiness gate.
- `lib/createNativeBleBluAdapter.ts`, `lib/genericBluetoothAccessoryManager.ts`, `src/power/connectors/BleConnector.ts` - native BLE power/accessory paths.
- `lib/unifiedDeviceDiscoveryAggregator.ts` - source merge and mock/classic discovery behavior.
- `lib/deviceConnectionScanMessaging.ts` - native Bluetooth unsupported messaging.
- `lib/useOperationalWeather.ts` - operational weather hook and shared weather consumer.
- `lib/ecsWeather.ts`, `lib/weatherStore.ts`, `lib/weatherTypes.ts`, `lib/weatherSurfaceSelectors.ts` - weather normalization/cache/surface adapters.
- `components/intel/EnvironmentalIntel.tsx` - Intel weather surface consumer.
- `lib/routeStore.ts`, `lib/vehicleDisplayStore.ts`, `lib/roadNavigationStore.ts`, `lib/trailNavigationStore.ts`, `lib/useRoadNavigation.ts`, `lib/useTrailNavigation.ts` - active/imported route and guidance state sources.
- `lib/elevationComplexity.ts`, `lib/remotenessStore.ts`, `lib/terrainRiskPredictionEngine.ts`, `lib/terrainProfile.ts` - elevation/terrain analysis sources.
- `lib/BluPowerAuthority.ts`, `lib/BluDeviceRegistry.ts`, `lib/BluStateStore.ts`, `lib/useEcsProviders.ts`, `lib/powerIntelligence.ts`, `lib/powerReadiness.ts` - power systems live data and provider registry.

## Current Bugs Found

### 1. Maximum Update Depth Exceeded

Root cause confirmed and fixed: `lib/useOperationalWeather.ts` shared weather updates could synchronously re-enter `vehicleDisplayStore._rebuildState()`.

- `vehicleDisplayStore._rebuildState()` calls `_syncSharedOperationalWeatherConsumer(gps)`.
- `_syncSharedOperationalWeatherConsumer` calls `setSharedOperationalWeatherConsumer('vehicle_display', ...)`.
- `setSharedOperationalWeatherConsumer` immediately hydrated/shared cached weather and called `setSharedWeatherState(...)`.
- `setSharedWeatherState` always notified shared weather listeners, even when weather result/target/loading state was unchanged.
- `vehicleDisplayStore.start()` registers a shared weather listener that calls `_applySharedWeatherState()` and `_rebuildState('async')`.
- Result: identical shared weather writes could notify the vehicle display listener, which rebuilt state, which re-registered the same shared weather consumer, which notified again.

Additional stabilizers were applied in the same hook:

- `useOperationalWeather` no longer derives `target` from unstable `gps`/`routeCoordinate` object identities; it depends on scalar GPS/route fields.
- The hook's fetch callback no longer depends on `result`.
- Cached/live result writes now pass through `setResultIfChanged`, which compares semantic weather result signatures before calling React `setResult`.
- `useFocusEffect` reads the latest result from a ref instead of depending on `result`.

Proposed fix direction:

Implemented in this pass:

- Added stable weather result, target, shared state, and shared consumer signatures.
- Shared weather state now skips notifications when the signature is unchanged.
- Re-registering the same shared weather consumer now skips immediate resync when the current shared result is still fresh enough.
- Local hook result state now updates only when the weather result signature changes.
- Added `scripts/test-operational-weather-loop-guard.js` and `npm run test:operational-weather-loop-guard`.

Why the new pattern is stable:

- The vehicle display listener can still rebuild state when weather actually changes, but identical weather data no longer produces another shared weather notification.
- The hook can still refresh stale/live weather, but a cached result with the same source/timestamp/current/daily signature does not recreate React state and retrigger weather effects.
- Scalar target dependencies allow new inline GPS objects from Dashboard/widgets without changing the memoized target unless the actual GPS/route values changed.

Other inspected effects did not look as likely:

- `DashboardHeader` store subscriptions are mostly one-way and some setters use equality guards.
- Dashboard route context refresh has a boolean equality guard.
- Route Progress imported-route fallback now uses `routeStore.subscribe()` plus equality helpers for route/navigation data.

### 2. Expedition Command Top Banner

Files: `components/dashboard/DashboardHeader.tsx`, `components/TabHeaderTitleImage.tsx`.

- Dashboard now passes subtitle `Explore with confidence`.
- `TabHeaderTitleImage` previously rendered subtitle with `fontSize: 8`, `lineHeight: 8`, `marginTop: -2`, italic tracking, and `ellipsizeMode="clip"`.
- Dashboard passes `minimumFontScale={1}` for Expedition Command, which disables title scaling and uses clipping behavior.
- The title/subtitle stack can be width-constrained by left/right shell controls. On phone/tablet this is likely why the subtitle is clipped to `Explore with`.

Implemented fix:

- Keep the shared `TopBannerBackground`/`TabHeaderTitleImage` path, not a Dashboard-only banner.
- Subtitle uses the measured center-slot width, `adjustsFontSizeToFit`, `minimumFontScale={0.72}`, and `ellipsizeMode="tail"` instead of clip.
- Subtitle line height is increased and negative top margin removed to avoid vertical clipping.
- Subtitle uses existing tactical amber styling with opacity instead of the old raw subtitle color.
- Added `scripts/test-top-banner-title-layout.js` and `npm run test:top-banner-title-layout`.

### 3. Fleet Top Banner Naming

Files: `app/(tabs)/fleet.tsx`, `components/Header.tsx`, `components/TabHeaderTitleImage.tsx`.

- Fleet tab label should remain `Fleet`.
- The visible centered banner title now receives `Header title="Fleet Center"` in Fleet render states.
- `app/(tabs)/_layout.tsx` still keeps the tab route label as `title: 'Fleet'`.

### 4. Bluetooth / Device Connections

Files: `app/power/blu.tsx`, `components/QuickActionsSheet.tsx`, `lib/useUnifiedDeviceConnections.ts`, `src/vehicle-telemetry/OBD2Adapter.ts`, `src/power/ble/BleScanReadiness.ts`, `src/power/ble/BlePermissions.ts`, `lib/unifiedDeviceDiscoveryAggregator.ts`.

Observed implementation:

- Device Connections uses `useUnifiedDeviceConnections`.
- Native BLE scan starts through `useOBD2Scanner().startScan(...)`, which reaches `OBD2Adapter.startScan`.
- OBD2 scan requests native BLE readiness through `ensureBleScanReadiness`.
- Source summary already records raw, normalized, visible, filtered, failed, unsupported, and disabled counts.
- `app/power/blu.tsx` exposes a dev-only scan visibility debug panel.
- Classic Bluetooth is explicitly unsupported in `unifiedDeviceDiscoveryAggregator`.
- Mock discovery is disabled unless `isDevMockTelemetryAllowed()` explicitly permits it, and even then returns no fixture devices. This satisfies "no mock devices" for the bug pass.
- Cloud/API discovery remains independent through EcoFlow API discovery.

Current gaps/risk:

- The UI now truthfully reports "native Bluetooth unsupported" when the runtime is Expo Go/web or the native BLE module is missing. That is not masked.
- For iPad "no raw devices seen", the dev debug panel now exposes platform, native bridge status, permission status, missing permissions, Bluetooth adapter state, readiness code, raw callback count, and last scan error.
- `createNativeBleBluAdapter` still has provider-specific power paths. The unified OBD2/native BLE scan path now counts raw callbacks separately from accepted/routed rows so "no raw devices" is not confused with "raw devices were filtered/routed elsewhere."
- OBD2 still scans with no service filter and allow duplicates. If raw callbacks remain zero after readiness passes, the likely issue is platform permission/native runtime/Bluetooth state/OS privacy rather than ECS filtering.

Implemented fix:

- Do not add mock devices.
- Kept cloud/API devices available even when BLE is unsupported.
- Added `BleRuntimeDiagnostics` in `src/power/ble/BleScanReadiness.ts` and `OBD2ScanDiagnostics` in `src/vehicle-telemetry/OBD2Adapter.ts`.
- `OBD2Adapter` now counts raw BLE callbacks and unique raw device IDs before classification/routing, including a separate count for unidentified raw callbacks.
- `useOBD2Scanner` exposes scan diagnostics, and `useUnifiedDeviceConnections` includes them in `lastScanSummary`.
- `app/power/blu.tsx` shows a dev-only `Native BLE Diagnostics` panel with platform, native bridge, permissions, Bluetooth state, readiness, raw callbacks, and last error.
- `deviceConnectionScanMessaging` now distinguishes native BLE runtime support from Classic Bluetooth/SPP OBD2 limitations. BLE OBD2 adapters can still appear when the native BLE bridge is available.
- Removed Device Connections console spam in touched paths and routed scan lifecycle diagnostics through `ecsLog`.
- Tightened native BLE module unavailable detection so a generic `null` error is not automatically classified as runtime unsupported.
- Verified `app.json` already includes the `react-native-ble-plx` plugin, iOS Bluetooth usage copy, and Android Bluetooth/location scan permissions. Manual iPad verification still requires a native/dev build, not Expo Go/web preview.

### 5. Weather Widget / Detail Gaps

Files: `lib/useOperationalWeather.ts`, `lib/ecsWeather.ts`, `lib/weatherStore.ts`, `lib/weatherSurfaceSelectors.ts`, `components/dashboard/WidgetRenderers.tsx`, `components/weather/WeatherIntelPanel.tsx`, `components/weather/ForecastTimeline.tsx`, `components/weather/CurrentConditionsCard.tsx`, `components/intel/EnvironmentalIntel.tsx`.

Observed implementation:

- ECS weather types already include current `windGust`, `sunrise`, `sunset`, `highTemperature`, and `lowTemperature`.
- Forecast formatting already supports `temp_min`, `temp_max`, `wind_max`, and `wind_gust_max`.
- Dashboard weather detail displays gusts if `snapshot.current.windGust` exists.
- Before this pass, forecast detail in `WidgetRenderers` only showed the first 3 raw daily rows and could miss temperatures when the provider used alias fields.
- Before this pass, unified weather surface in `weatherSurfaceSelectors` truncated forecast to 5 days.

Root cause:

- Weather provider shapes were not fully normalized across surfaces. The adapter handled canonical fields such as `temp_min`, `temp_max`, `wind_gust`, `sunrise`, and `sunset`, but common aliases such as `high`, `low`, `tempHigh`, `tempLow`, `windGust`, `gust`, `sunup`, `sundown`, `forecastDays`, and `dailyForecast` were not consistently mapped.
- Dashboard detail used raw `snapshot.daily` rows instead of the canonical `snapshot.normalized.forecast`, so condition text could render while forecast high/low temperatures were unavailable.
- Field Utilities weather uses `WeatherIntelPanel`; injected/canonical weather did not hydrate a normalized forecast back into the `ForecastTimeline` model when raw rows were absent or sparse.

Implemented fix:

- `lib/weatherStore.ts` now accepts `forecastDays`/`dailyForecast` sources and maps aliases for forecast high/low, gust, precip chance, sunrise/sunset, and current high/low/sunup/sundown into the shared `WaypointWeather` shape.
- `lib/ecsWeather.ts` now maps those same aliases into `ECSWeatherSnapshot.normalized.current`, `snapshot.current`, and `snapshot.normalized.forecast`.
- `components/dashboard/WidgetRenderers.tsx` now prefers `snapshot.normalized.forecast`, displays current gusts, today high/low, sunup/sundown, and renders up to 16 available forecast rows without adding blank rows.
- `components/QuickActionsSheet.tsx` now wires the Field Utilities Intel action through `useOperationalWeather` and passes the shared `weatherSnapshot`/`refresh` into `WeatherIntelPanel` instead of letting the quick action run a separate weather parsing/fetch path.
- `components/weather/WeatherIntelPanel.tsx` hydrates injected/canonical weather into the `CurrentConditionsCard` and `ForecastTimeline` models from the normalized current/forecast data when raw rows are missing or sparse.
- `lib/weatherSurfaceSelectors.ts` now allows up to 16 real forecast rows and falls back to the first forecast day for solar times when current sunrise/sunset are absent.

Missing data behavior:

- When a provider does not supply a value, the existing weather components continue to render `Unavailable`, `Not provided`, `--`, or the existing empty state instead of blank rows.
- The 16-day list is bounded by available provider/cache rows only; no synthetic forecast days are created.

### 6. Field Utilities Protocol Backgrounds

Files: `components/QuickActionsSheet.tsx`, `components/emergency/EmergencyProtocolModal.tsx`.

- Quick Action protocol detail uses `ProtocolStepSection`.
- Before this pass, `Recognize` and `Stabilize` used `styles.protocolStepSection` (`ECS.bgElev`) while `Evacuate If` added `styles.protocolDangerSection` with a tinted warning/danger background.
- The standalone emergency modal mirrors this mismatch: `styles.section` vs `styles.evacuateSection`.

Implemented fix:

- `components/QuickActionsSheet.tsx` now applies the former Evacuate If surface treatment directly through the shared `protocolStepSection` style.
- The Evacuate-only `protocolDangerSection` class and prop path were removed from the Field Utilities quick-action protocol detail.
- Recognize, Stabilize, and Evacuate If now share the same protocol pop-up background/border treatment while preserving their existing title/dot colors and text hierarchy.
- Added regression coverage in `scripts/test-field-utilities-regression.js`.

Follow-up:

- `components/emergency/EmergencyProtocolModal.tsx` still has a similar standalone protocol modal surface mismatch. It is outside the Dashboard long-press Field Utilities quick-action view fixed here, but should be aligned in a later cleanup if that modal remains active.

### 7. Route Progress Widget

Files: `components/dashboard/WidgetRenderers.tsx`, `lib/routeStore.ts`, `lib/vehicleDisplayStore.ts`, `lib/roadNavigationStore.ts`, `lib/trailNavigationStore.ts`, `lib/useRoadNavigation.ts`, `lib/useTrailNavigation.ts`.

Observed implementation:

- `ProgressWidget` is used for both `route-progress` and `progress`.
- Before the live-state hardening pass, it polled `routeStore.getActive()` every 2 seconds and subscribed to `vehicleDisplayStore`.
- Before this pass, it instantiated `useRoadNavigation` and `useTrailNavigation` inside the widget, then built road/trail/imported summaries.
- A legacy `RouteProgress` helper still exists in the same file and appears superseded by `ProgressWidget`.

Root cause:

- The widget creates its own navigation hook instances instead of reading the same active guidance state owned by Navigate/shared session stores. That can diverge from the route the user is actively navigating.
- Detail view paths may still rely more heavily on imported `routeStore` context than active road/trail guidance session state.

Implemented fix:

- `lib/useRoadNavigation.ts` now publishes the active road guidance session through `getActiveRoadNavigationSession` and `subscribeActiveRoadNavigationSession`.
- `lib/useTrailNavigation.ts` now publishes the active trail guidance session through `getActiveTrailNavigationSession` and `subscribeActiveTrailNavigationSession`.
- `components/dashboard/WidgetRenderers.tsx` no longer creates its own road/trail guidance hook instances or fetches a Mapbox token just to mirror progress.
- Route Progress now subscribes to the active road/trail session published by Navigate, normalizes `routeId`, active/completed state, remaining distance, remaining time, ETA, next instruction, progress percent, and last update, then falls back to imported-route progress only when no active guidance session is available.
- `lib/routeStore.ts` now exposes an event-driven `subscribe` listener contract and only notifies after persisted route data changes, allowing the imported-route fallback to update without a polling interval.
- `ProgressWidget` now subscribes to `routeStore` for imported active-route changes instead of calling `setInterval(syncRoute, 2000)`, preserving cleanup through the returned unsubscribe function.
- The widget hides the next-instruction row when no turn/prompt text is available.
- Added `scripts/test-dashboard-route-progress-active-navigation.js` and `npm run test:dashboard-route-progress`.
- Added `scripts/test-dashboard-widget-live-state-refresh-consistency.js` and `npm run test:dashboard-live-state-refresh` to cover weather, route progress, elevation/terrain, and power live/stale/refresh contracts together.

Follow-up:

- The legacy `RouteProgress` helper remains in `WidgetRenderers.tsx` and appears unused. It should be removed in a cleanup pass once route-progress call sites are confirmed.

### 8. Elevation and Terrain Widget Verification

Files: `components/dashboard/TerrainRiskWidget.tsx`, `components/dashboard/WidgetRenderers.tsx`, `lib/elevationComplexity.ts`, `lib/remotenessStore.ts`, `lib/routeStore.ts`.

Observed implementation:

- `TerrainRiskWidget` recomputes every 15 seconds using `DEFAULT_TERRAIN_PROFILE`, zero roll/pitch, and `hasSensorData: false`. A comment identifies this as simulated.
- `HwyElevationProfileWidget` in `WidgetRenderers` can use GPS altitude and active route elevation stats, but its live/stale labels need verification. It can label terrain as live even when only fallback/default context exists.
- Existing elevation analysis exists in `elevationComplexity`, and `remotenessStore` has an elevation result path.

Implemented fix:

- Added `lib/dashboardElevationTerrain.ts` as a pure resolver for Dashboard elevation/terrain source truth.
- `HwyElevationProfileWidget` now labels state as `LIVE ELEVATION`, `STALE ELEVATION`, `ROUTE PROFILE`, or `ELEVATION PENDING`.
- `LIVE ELEVATION` requires a current GPS fix, finite GPS altitude, and a GPS timestamp fresher than 60 seconds.
- Stale GPS altitude is displayed as last-known/stale instead of live.
- Active route elevation/distance context is displayed as a route profile, not live telemetry, unless fresh GPS elevation is also present.
- Dashboard now passes GPS timestamp and GPS accuracy through `WidgetGrid`/`WidgetRenderOptions` into widget and detail renderers.
- The elevation detail view now shows source, updated age, accuracy, current elevation, route distance/gain/grade, and hazard count.
- `TerrainRiskWidget` still uses `DEFAULT_TERRAIN_PROFILE`, but identical simulated recomputes are guarded to avoid repeated state writes. Its compact/detail copy now identifies the source as a default profile rather than live sensor data.

Manual QA notes:

- With fresh GPS altitude, the Highway elevation card should show `LIVE ELEVATION`, current elevation, update age, and accuracy.
- With stale GPS altitude, it should show `STALE ELEVATION` and last-known update age.
- With an active route but no fresh GPS altitude, it should show `ROUTE PROFILE` and route distance/gain/grade, not live.
- With no altitude and no route, it should show `ELEVATION PENDING` / unavailable context.
- Terrain Risk should not appear to be live sensor data while it is still using the default terrain profile.

### 9. Power Systems Widget

Files: `components/dashboard/PowerSystemWidget.tsx`, `components/dashboard/PowerSystemDetail.tsx`, `lib/BluPowerAuthority.ts`, `lib/BluDeviceRegistry.ts`, `lib/BluStateStore.ts`, `lib/useEcsProviders.ts`, `lib/powerIntelligence.ts`.

Observed implementation:

- The widget subscribes to `bluPowerAuthority` and reads registry/telemetry snapshots.
- Power data comes from the BLU live path: `BluPowerAuthority` snapshot subscription plus `BluDeviceRegistry` and `BluStateStore` telemetry. Provider/cloud refresh is exposed by `useEcsProviders().refreshAll()`.
- There is no fake live value path in the widget/detail pass. If telemetry is absent, stale, last-known, disconnected, or only a configured Fleet profile, the UI must say so.

Implemented fix:

- Added `PowerTelemetrySummary` / `normalizePowerTelemetrySummary` in `components/dashboard/PowerSystemWidget.tsx` so card and detail surfaces share normalized input watts, output watts, solar watts, battery percent, source label, last updated, live/stale state, and primary device.
- `PowerFlowGraphic` now uses existing widget semantic tones for charge-in and draw-out, animates a subtle native-driver flow pulse only when non-stale input/output watts are active, and respects `useReducedMotion()`.
- Output/discharge is now warning/draw toned instead of critical by default; critical remains reserved for actual warnings/low reserve.
- `PowerSystemDetailView` now includes a Refresh control inside the existing dashboard detail modal surface. It calls `useEcsProviders().refreshAll()`, guards repeat taps, and shows loading/success/error state.
- Detail summary now shows source and live/stale/unavailable status so stalled data does not look live.

## Existing Components / Tokens / Shell Containers To Reuse

- Top app chrome: `TopBannerBackground`, `DashboardHeader`, shared `Header`, `TabHeaderTitleImage`, `getShellHeaderAnchorTop`, `getShellHeaderTopPadding`, shell chrome theme resolvers.
- Widget surfaces: `WidgetCardShell`, `WidgetCompactRow`, `WidgetDetailLeadCard`, `WidgetDetailStateCard`, `WidgetDetailSectionTitle`, `WidgetMetaLine`, `WidgetMicroStrip`, `WidgetPrimaryValue`, `WidgetSecondaryRow`.
- Modals/sheets/popups: existing dashboard detail modal, `TacticalPopupShell`, `QuickActionsSheet` panel structure.
- Theme/tokens: `TACTICAL`, `ECS` constants already used in QuickActionsSheet, `resolveTopBannerPresentation`, `getTopBannerToneColor`, `resolveShellChromeTheme`.
- Icons: `SafeIcon`/Ionicons only where a clear existing icon exists.

Do not add Dashboard-only palettes, duplicate top/bottom banners, or one-off hidden containers.

## Existing Data Sources / Adapters

### Weather

- Hook/service: `useOperationalWeather`.
- Cache/fetch: `weatherStore`.
- Normalization: `ecsWeather`, `weatherTypes`.
- Surface selector: `weatherSurfaceSelectors`.
- Shared state consumer: `getSharedOperationalWeatherState`, `setSharedOperationalWeatherConsumer`, `subscribeSharedOperationalWeather`, used by `vehicleDisplayStore`.

### Navigation / Active Route

- Imported/staged route: `routeStore`.
- Vehicle display navigation snapshot: `vehicleDisplayStore.getNavigationData()`.
- Road guidance: `useRoadNavigation`, `loadRoadNavigationSession`, `roadNavigationStore`.
- Trail guidance: `useTrailNavigation`, `loadTrailNavigationSession`, `trailNavigationStore`.
- Dashboard route weather: `useRouteCorridorWeather`.

### Elevation / Terrain

- Route elevation stats in imported route objects.
- GPS altitude passed through Dashboard widget options.
- `elevationComplexity` for route elevation analysis.
- `remotenessStore.getElevationResult()` for remoteness/elevation-derived context.
- `terrainRiskPredictionEngine` and `DEFAULT_TERRAIN_PROFILE`.

### Power Systems

- `bluPowerAuthority` snapshot/subscription.
- `bluDeviceRegistry` device registry.
- `bluStateStore` telemetry freshness/snapshot.
- `useEcsProviders`, provider adapters, cloud/API providers.
- `powerIntelligence` and `powerReadiness`.

### Bluetooth / Native Device Connections

- Unified UI/service: `useUnifiedDeviceConnections`.
- OBD2 BLE: `useOBD2Scanner`, `OBD2Adapter`.
- Shared BLE readiness: `BleScanReadiness`, `BlePermissions`.
- Power BLE: `createNativeBleBluAdapter`, `BleConnector`, `genericBluetoothAccessoryManager`.
- Discovery merge/source summaries: `unifiedDeviceDiscoveryAggregator`.
- Scan messaging: `deviceConnectionScanMessaging`.

## Proposed File Changes

- `lib/useOperationalWeather.ts` - stabilize target dependencies, guard cached result updates, avoid `result`-driven fetch callback loops, add regression-friendly signatures.
- `app/(tabs)/dashboard.tsx` - memoize weather GPS options and pass a canonical weather snapshot to widgets.
- `components/dashboard/WidgetRenderers.tsx` - prevent widget-local weather fetch loops, route progress shared active guidance selector, weather forecast display cleanup, elevation live/stale labeling.
- `lib/routeStore.ts` - event-driven active route subscription for Dashboard Route Progress imported-route fallback; no route polling interval.
- `components/dashboard/DashboardHeader.tsx` and `components/TabHeaderTitleImage.tsx` - fix Expedition Command subtitle fit/copy without duplicating shell chrome.
- `app/(tabs)/fleet.tsx` - visible banner title `Fleet Center`; keep route/tab label `Fleet`.
- `lib/useUnifiedDeviceConnections.ts`, `app/power/blu.tsx`, `src/vehicle-telemetry/OBD2Adapter.ts`, `src/power/ble/BleScanReadiness.ts` - improve truthful native BLE debug visibility without mock devices.
- `components/QuickActionsSheet.tsx` and `components/emergency/EmergencyProtocolModal.tsx` - protocol background consistency.
- `components/dashboard/PowerSystemWidget.tsx` and `components/dashboard/PowerSystemDetail.tsx` - semantic flow colors, reduced-motion animation, manual refresh.
- `lib/weatherStore.ts`, `lib/ecsWeather.ts`, `lib/weatherSurfaceSelectors.ts`, `components/dashboard/WidgetRenderers.tsx`, `components/weather/WeatherIntelPanel.tsx` - preserve/display gust, daily high/low, sunup/sundown, and real forecast range from the shared normalized weather model.
- Tests/scripts listed below.

## Test Strategy

Automated commands supported by the project:

- `npm run lint`
- `npm run build`
- `npm run test:dashboard-widgets`
- `npm run test:dashboard-power-systems`
- `npm run test:dashboard-route-progress`
- `npm run test:dashboard-live-state-refresh`
- `npm run test:weather-request-dedupe`
- `npm run test:weather-cache-hydration`
- `npm run test:weather-normalization`
- `npm run test:weather-freshness`
- `npm run test:weather-last-good-state`
- `npm run test:field-utilities-regression`
- `npm run test:field-utilities-weather-parity`
- `npm run test:bluetooth-live`
- `npm run test:bluetooth-scanner`
- `npm run test:bluetooth-classification`
- `npm run test:unified-device-discovery`
- `npm run test:scanner-device-state`
- `npm run test:device-connection-routing`
- `npm run test:device-connection-request-policy`
- `npm run test:device-connection-scan-messaging`
- `npm run test:device-connection-diagnostics`
- `npm run test:vehicle-telemetry-live`
- `npm run test:power-brand-adapters`
- `npm run test:ecoflow-unified-scanner`
- `npm run test:ecoflow-cloud-connection`
- `npm run test:remoteness-live-destinations`
- `npm run test:field-utilities-regression`

Targeted tests to add/update:

- Weather hook does not refetch or update state repeatedly when GPS scalar values are unchanged.
- Weather hook does not loop on stale cached result.
- Dashboard weather snapshot is reused by widgets.
- Weather adapter maps `windGust`/`gust`, `high`/`low`, `tempHigh`/`tempLow`, `sunup`/`sundown`, `forecastDays`, and `dailyForecast` aliases into the normalized model.
- Dashboard weather detail consumes normalized forecast rows and does not truncate real provider data below 16 days.
- Field Utilities `WeatherIntelPanel` hydrates normalized weather into current conditions and forecast timeline rows.
- Field Utilities protocol detail uses one shared protocol section surface for Recognize, Stabilize, and Evacuate If.
- Banner subtitle fits `Explore with confidence` on phone/tablet widths.
- Fleet screen visible header title is `Fleet Center`, while tab label remains `Fleet`.
- Route Progress reads active road/trail guidance state and imported route fallback correctly.
- Route Progress imported-route fallback updates from `routeStore.subscribe()` and does not poll on an interval.
- Terrain/elevation live label only appears when live/current data exists.
- Power flow animation respects reduced motion and remains tied to live telemetry.
- Device Connections debug summary exposes readiness/raw/filtered/native bridge counts without enabling mocks.

Manual QA checklist for the next implementation pass:

- Reproduce the maximum update depth scenario before and after the weather-hook fix.
- Phone and tablet: Expedition Command subtitle shows exactly `Explore with confidence` on one centered line.
- Fleet tab still says Fleet; centered banner says `Fleet Center`.
- Device Connections on native iPad build: run scan and capture platform, readiness, permissions, adapter state, raw seen, visible, filtered, and callback errors.
- Device Connections on Expo Go/web preview: confirm native BLE reports unsupported while EcoFlow/cloud/API devices remain available.
- Scan Again/Scan for Device Connections should not restart while a scan is already in flight and should not trigger maximum update depth errors.
- Confirm no mock Bluetooth devices appear.
- Weather detail shows gusts, daily high/low, sunup/sundown, and real forecast temps when provider data includes them.
- Field Utilities Intel weather shows the same high/low, sunup/sundown, gust, and available forecast rows as the Dashboard weather detail.
- Field Utilities Recognize/Stabilize/Evacuate If backgrounds are visually consistent.
- Route Progress matches active Navigate guidance.
- Terrain/elevation widget shows live, cached, fallback, or unavailable truthfully.
- Power widget animates subtly when input/output flows exist; no animation with reduced motion.
- Power detail Refresh manually reloads real provider/telemetry data.

## Risky Areas / Unknowns

- The exact maximum-depth stack trace was not available during this inspection. The weather hook is the highest-confidence source, but a stack trace should be captured before implementation if possible.
- Native Bluetooth behavior depends on build type. Expo Go/web or missing native BLE module will truthfully report unsupported; nearby devices can only be verified in a native development/production build with permissions and plist/native configuration present.
- Weather forecast length depends on the provider response. Do not display 16 days unless the live/cache source really has 16 daily entries.
- Route Progress now uses a small shared active-session publisher. The remaining risk is that non-Navigate consumers that never mount the road/trail hooks can only show imported-route or vehicle-display fallback context.
- Terrain risk currently uses default/simulated inputs; making it truly live may require route/attitude/GPS integration beyond a visual label fix.
- Power refresh depends on existing provider capabilities. If a provider lacks manual refresh, the UI should say so rather than fake a refresh.

## Final QA / Regression Pass

Date: 2026-04-27

Status: automated Dashboard/system regression pass completed. No pass-caused failures remained open after the final run.

Commands run:

- `npm run test:dashboard-widgets`
- `npm run test:dashboard-live-state-refresh`
- `npm run test:dashboard-route-progress`
- `npm run test:dashboard-elevation-terrain`
- `npm run test:dashboard-power-systems`
- `npm run test:top-banner-title-layout`
- `npm run test:field-utilities-regression`
- `npm run test:field-utilities-weather-parity`
- `npm run test:operational-weather-loop-guard`
- `npm run test:weather-normalization`
- `npm run test:weather-request-dedupe`
- `npm run test:weather-cache-hydration`
- `npm run test:weather-freshness`
- `npm run test:weather-last-good-state`
- `npm run test:bluetooth-live`
- `npm run test:bluetooth-scanner`
- `npm run test:bluetooth-classification`
- `npm run test:unified-device-discovery`
- `npm run test:scanner-device-state`
- `npm run test:device-connection-routing`
- `npm run test:device-connection-request-policy`
- `npm run test:device-connection-scan-messaging`
- `npm run test:device-connection-diagnostics`
- `npm run test:vehicle-telemetry-live`
- `npm run test:power-brand-adapters`
- `npm run test:ecoflow-unified-scanner`
- `npm run test:ecoflow-cloud-connection`
- `npm run test:remoteness-live-destinations`
- `npm run test:subscription-hardening`
- `npm run test:command-state-hardening`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

Notes:

- `npm run build` completed successfully and exported `dist`; Expo then printed `Something prevented Expo from exiting, forcefully exiting now.` while still returning exit code 0.
- `npm run test:ecoflow-unified-scanner` intentionally printed ECS telemetry for invalid/edge-error fixture cases and still passed.
- No formatter script is currently defined in `package.json`, so no separate formatting command was available.

Field Utilities Intel weather parity verification:

- `components/QuickActionsSheet.tsx` uses `useOperationalWeather` with a memoized GPS target and `enabled: visible && activeView === 'intel'`, so the long-press Intel quick action subscribes only while the Intel panel is visible.
- Field Utilities passes the resulting `fieldUtilitiesWeather.snapshot` into `WeatherIntelPanel` with `autoFetch={false}` and `onRefreshWeather={fieldUtilitiesWeather.refresh}`. This keeps the quick action on the shared normalized weather path and prevents `WeatherIntelPanel` from running a second independent fetch loop.
- `components/weather/WeatherIntelPanel.tsx` hydrates `weatherSnapshot.normalized.current` and `weatherSnapshot.normalized.forecast` into the existing current/forecast card shape, including wind gust, today high/low, sunrise/sunset, and available forecast rows capped at 16 days.
- `CurrentConditionsCard` renders the hydrated gust, high/low, sunrise, and sunset fields; `ForecastTimeline` renders available forecast rows without blank 16-day placeholders.
- Protocol background consistency remains intact through the shared `protocolStepSection` surface used by Recognize, Stabilize, and Evacuate If.

Manual QA checklist to execute on device/simulator:

- Maximum update depth: app loads without maximum update depth exceeded.
- Maximum update depth: Dashboard loads without React render loop.
- Maximum update depth: switching between Dashboard, Fleet, Navigate, and other tabs does not trigger the error.
- Maximum update depth: opening/closing widgets does not trigger the error.
- Maximum update depth: opening/closing Bluetooth Device Connections does not trigger the error.
- Top banners: Expedition Command title displays correctly.
- Top banners: subtitle says `Explore with confidence`.
- Top banners: subtitle is centered on one line.
- Top banners: subtitle is not cut off on phone.
- Top banners: subtitle is not cut off on tablet.
- Top banners: Fleet tab banner title says `Fleet Center`.
- Top banners: Fleet nav/tab label remains Fleet if applicable.
- Top banners: no duplicate top/bottom ECS banners.
- Bluetooth/device connections: Bluetooth button opens Device Connections.
- Bluetooth/device connections: native Bluetooth capability status is accurate.
- Bluetooth/device connections: scan/refresh action works where supported.
- Bluetooth/device connections: no mock devices appear.
- Bluetooth/device connections: Cloud/API devices remain available.
- Bluetooth/device connections: OBD2 native Bluetooth message is accurate.
- Bluetooth/device connections: iPad/tablet behavior is documented and handled correctly.
- Bluetooth/device connections: no repeated scan loop or console spam.
- Weather: Live Weather detail shows gust data when available.
- Weather: forecast temperatures display.
- Weather: today high/low display.
- Weather: sunup/sundown display in Field Utilities.
- Weather: forecast list displays available days up to 16.
- Weather: missing weather data shows clear unavailable state.
- Weather: weather data is consistent between Dashboard widget detail and Field Utilities quick action.
- Field Utilities: Recognize background matches Evacuate If.
- Field Utilities: Stabilize background matches Evacuate If.
- Field Utilities: protocol text remains readable.
- Field Utilities: popup uses ECS global/tactical container rules.
- Route Progress: widget shows active route when navigation is active.
- Route Progress: distance remaining displays.
- Route Progress: time remaining displays.
- Route Progress: ETA displays.
- Route Progress: next turn displays if available.
- Route Progress: widget returns to inactive state when route stops.
- Route Progress: no image is required.
- Elevation/Terrain: widget only says Live when live/current data is valid.
- Elevation/Terrain: cached/stale/unavailable states are clear.
- Elevation/Terrain: current elevation remains accurate when valid.
- Power Systems: widget shows live power data when available.
- Power Systems: input/output charging graphic has subtle animation.
- Power Systems: animation respects reduced-motion.
- Power Systems: clicking widget opens detail view.
- Power Systems: Refresh button works.
- Power Systems: stale power data is identified.
- Power Systems: no fetch/subscription loop.

Release notes:

- See `docs/dashboard-system-first-pass-bugfix-release-notes.md`.
