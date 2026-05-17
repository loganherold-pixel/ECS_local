# Dashboard/System First-Pass Bugfix Release Notes

Date: 2026-04-27

## Summary

This pass stabilizes Dashboard/system live data behavior, fixes top-banner copy/layout issues, makes Bluetooth/device connection status more truthful and diagnosable, normalizes weather data across Dashboard and Field Utilities, aligns Field Utilities protocol surfaces, wires Route Progress to active guidance, hardens elevation/terrain live labeling, and improves Power Systems live/stale/refresh behavior.

## Changed Areas

- Maximum update depth: stabilized `useOperationalWeather` shared-state updates with semantic signatures, scalar target dependencies, and guarded state writes so identical weather results do not repeatedly re-enter vehicle display rebuilds.
- Top banners: fixed Expedition Command subtitle rendering for `Explore with confidence`; Fleet visible banner now reads `Fleet Center` while the tab label remains Fleet.
- Bluetooth/device connections: added native BLE diagnostics, raw callback counts, clearer scan messaging, no-mock-device guarantees, and cloud/API availability when native BLE is unsupported.
- Weather: shared normalization now maps gust, high/low, sunup/sundown, and forecast aliases; Dashboard weather detail and Field Utilities use the same normalized model and show available forecast days up to 16.
- Field Utilities: Recognize, Stabilize, and Evacuate If protocol sections now share the same ECS tactical protocol surface.
- Route Progress: widget now mirrors active road/trail guidance sessions, falls back to imported route progress, hides missing next-turn rows, and uses `routeStore.subscribe()` instead of polling imported route state.
- Elevation/Terrain: live status requires fresh GPS altitude; stale, route-profile, and unavailable states are explicit.
- Power Systems: added normalized telemetry summary, stale-aware input/output flow animation with reduced-motion support, semantic input/output tones, and a guarded manual Refresh control in detail view.

## Key Files

- `lib/useOperationalWeather.ts`
- `lib/ecsWeather.ts`
- `lib/weatherStore.ts`
- `lib/weatherSurfaceSelectors.ts`
- `components/dashboard/WidgetRenderers.tsx`
- `components/dashboard/DashboardHeader.tsx`
- `components/TabHeaderTitleImage.tsx`
- `app/(tabs)/fleet.tsx`
- `app/power/blu.tsx`
- `components/QuickActionsSheet.tsx`
- `components/weather/WeatherIntelPanel.tsx`
- `components/dashboard/PowerSystemWidget.tsx`
- `components/dashboard/PowerSystemDetail.tsx`
- `components/dashboard/TerrainRiskWidget.tsx`
- `lib/dashboardElevationTerrain.ts`
- `lib/routeStore.ts`
- `lib/useRoadNavigation.ts`
- `lib/useTrailNavigation.ts`
- `lib/useUnifiedDeviceConnections.ts`
- `src/vehicle-telemetry/OBD2Adapter.ts`
- `src/power/ble/BleScanReadiness.ts`

## Tests Run

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

## Manual QA Checklist

- App loads without maximum update depth exceeded.
- Dashboard loads without React render loop.
- Switching between Dashboard, Fleet, Navigate, and other tabs does not trigger the error.
- Opening/closing widgets does not trigger the error.
- Opening/closing Bluetooth Device Connections does not trigger the error.
- Expedition Command title displays correctly.
- Subtitle says `Explore with confidence`.
- Subtitle is centered on one line.
- Subtitle is not cut off on phone.
- Subtitle is not cut off on tablet.
- Fleet tab banner title says `Fleet Center`.
- Fleet nav/tab label remains Fleet if applicable.
- No duplicate top/bottom ECS banners.
- Bluetooth button opens Device Connections.
- Native Bluetooth capability status is accurate.
- Scan/refresh action works where supported.
- No mock devices appear.
- Cloud/API devices remain available.
- OBD2 native Bluetooth message is accurate.
- iPad/tablet behavior is documented and handled correctly.
- No repeated scan loop or console spam.
- Live Weather detail shows gust data when available.
- Forecast temperatures display.
- Today high/low display.
- Sunup/sundown display in Field Utilities.
- Forecast list displays available days up to 16.
- Missing weather data shows clear unavailable state.
- Weather data is consistent between Dashboard widget detail and Field Utilities quick action.
- Recognize background matches Evacuate If.
- Stabilize background matches Evacuate If.
- Protocol text remains readable.
- Popup uses ECS global/tactical container rules.
- Route Progress widget shows active route when navigation is active.
- Distance remaining displays.
- Time remaining displays.
- ETA displays.
- Next turn displays if available.
- Widget returns to inactive state when route stops.
- No image is required.
- Elevation/Terrain widget only says Live when live/current data is valid.
- Cached/stale/unavailable states are clear.
- Current elevation remains accurate when valid.
- Power Systems widget shows live power data when available.
- Input/output charging graphic has subtle animation.
- Animation respects reduced-motion.
- Clicking Power Systems opens detail view.
- Refresh button works.
- Stale power data is identified.
- No fetch/subscription loop.

## Remaining Known Issues

- Native Bluetooth visibility still requires real-device QA in a native build, especially iPad/tablet scanning, permissions, and adapter state. Expo Go/web should truthfully report native BLE unsupported.
- Weather forecast length depends on provider response. The UI displays available forecast days up to 16 and does not synthesize missing days.
- Terrain Risk still uses a default/simulated terrain profile; it no longer presents that as live sensor data, but deeper live terrain integration is a later pass.
- Some providers may not support a manual power refresh beyond their existing provider refresh path; the UI calls the shared provider refresh and reports the result.
- `components/emergency/EmergencyProtocolModal.tsx` still has a standalone protocol surface mismatch similar to the Field Utilities issue and should be aligned in a later cleanup if that modal remains active.
- The legacy `RouteProgress` helper in `components/dashboard/WidgetRenderers.tsx` appears superseded but remains until call sites can be confirmed and removed safely.

## Suggested Next Pass Items

- Run native iPad/phone Bluetooth scan QA with the new diagnostics panel and capture raw callback/permission/readiness output.
- Remove the legacy Route Progress helper after confirming no active route-progress call sites depend on it.
- Align the standalone Emergency Protocol modal section backgrounds with the Field Utilities shared protocol surface.
- Extend Terrain Risk beyond default/simulated profile inputs using live GPS/route/attitude data where available.
- Add visual/screenshot QA for Dashboard banner, widget detail, and Field Utilities layouts on phone and tablet.
